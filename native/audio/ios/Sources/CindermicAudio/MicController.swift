import AVFoundation
import CryptoKit
import UIKit

final class MicController: NSObject, URLSessionWebSocketDelegate {
    var onState: (([String: Any]) -> Void)?
    var onNeedsPairing: (() -> Void)?
    private var pairing = PairingStore.load()
    private let capture = AudioCapture()
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var retryTimer: Timer?
    private var heartbeat: Timer?
    private var handshakeTimer: Timer?
    private var captureTimer: Timer?
    private var captureStarting = false
    private var wanted = false
    private let connectionTimeout: TimeInterval
    private var authenticated = false
    private var interrupted = false
    private var pendingMute: Bool?
    private var retry = 0
    private var inflight = 0
    private var sequence: UInt32 = 0
    private var connectionGeneration: UInt64 = 0
    private var lastMeter = Date.distantPast
    private var lastPong = Date()
    private var errorText = ""
    private var status = "offline"
    private var muted = UserDefaults.standard.bool(forKey: "muted")

    override convenience init() { self.init(connectionTimeout: 10) }
    init(connectionTimeout: TimeInterval) {
        self.connectionTimeout = max(1, connectionTimeout)
        super.init()
        UIDevice.current.isBatteryMonitoringEnabled = true
        capture.onSamples = { [weak self] data, level in self?.samples(data, level: level) }
        NotificationCenter.default.addObserver(
            self, selector: #selector(interruption), name: AVAudioSession.interruptionNotification,
            object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(routeChanged), name: AVAudioSession.routeChangeNotification,
            object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(mediaReset),
            name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification,
            object: nil)
    }
    func snapshot(level: Float = 0) -> [String: Any] {
        var state: [String: Any] = [
            "status": status, "muted": muted, "retry": retry, "level": level,
            "name": pairing.map { "Desktop · \($0.host)" } ?? "Your desktop", "error": errorText,
        ]
        if UIDevice.current.batteryLevel >= 0 { state["battery"] = UIDevice.current.batteryLevel }
        return state
    }
    func emit(level: Float = 0) {
        onState?(snapshot(level: level))
    }
    func handle(_ command: [String: Any]) {
        switch command["type"] as? String {
        case "state": emit()
        case "connect": connect()
        case "disconnect": disconnect()
        case "mute": setMuted(command["muted"] as? Bool ?? true, notify: true)
        case "pair":
            do {
                let value = try Pairing(link: command["link"] as? String ?? "")
                disconnect()
                try PairingStore.save(value)
                pairing = value
                errorText = ""
                emit()
                connect()
            } catch {
                errorText = error.localizedDescription
                emit()
            }
        default: break
        }
    }
    private func connect() {
        guard !wanted else { return }
        guard pairing != nil else {
            onNeedsPairing?()
            return
        }
        errorText = ""
        wanted = true
        status = "connecting"
        emit()
        connectionGeneration &+= 1
        let generation = connectionGeneration
        AVAudioApplication.requestRecordPermission { [weak self] allowed in
            DispatchQueue.main.async {
                guard let self, self.wanted, self.connectionGeneration == generation else { return }
                guard allowed else {
                    self.wanted = false
                    self.status = "failed"
                    self.errorText = "Allow microphone access in Settings → Cindermic."
                    self.emit()
                    return
                }
                self.wanted = true
                self.retry = 0
                self.interrupted = false
                self.captureStarting = true
                self.armCaptureTimeout(generation: generation)
                self.capture.start { [weak self] error in
                    guard let self, self.wanted, self.connectionGeneration == generation else { return }
                    self.captureStarting = false
                    self.captureTimer?.invalidate()
                    if let error {
                        self.errorText = error.localizedDescription
                        self.wanted = false
                        self.status = "failed"
                        self.emit()
                        return
                    }
                    self.openSocket()
                }
            }
        }
    }
    private func openSocket() {
        guard wanted, let url = pairing?.socketURL else { return }
        retryTimer?.invalidate()
        retryTimer = nil
        closeSocket()
        status = retry == 0 ? "connecting" : "reconnecting"
        emit()
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = connectionTimeout
        config.timeoutIntervalForResource = 0
        config.urlCache = nil
        let session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        self.session = session
        let task = session.webSocketTask(with: url)
        task.maximumMessageSize = 16384
        socket = task
        lastPong = Date()
        task.resume()
        receive(task)
        handshakeTimer = Timer.scheduledTimer(withTimeInterval: connectionTimeout, repeats: false) {
            [weak self, weak task] _ in
            guard let task else { return }
            self?.failed(
                task, message: "Connection timed out. Check Wi-Fi and the desktop firewall.")
        }
    }
    private func closeSocket() {
        authenticated = false
        inflight = 0
        heartbeat?.invalidate()
        heartbeat = nil
        handshakeTimer?.invalidate()
        handshakeTimer = nil
        let old = socket
        socket = nil
        old?.cancel(with: .goingAway, reason: nil)
        session?.invalidateAndCancel()
        session = nil
    }
    func disconnect() {
        connectionGeneration &+= 1
        wanted = false
        retryTimer?.invalidate()
        retryTimer = nil
        if authenticated { send(["type": "disconnect"]) }
        closeSocket()
        captureStarting = false
        captureTimer?.invalidate()
        captureTimer = nil
        capture.deactivate()
        interrupted = false
        status = "offline"
        errorText = ""
        emit()
    }
    private func failed(_ task: URLSessionWebSocketTask, message: String) {
        guard socket === task, wanted else { return }
        closeSocket()
        retry += 1
        status = "reconnecting"
        errorText = message
        emit()
        let delay = min(15.0, pow(2, Double(min(retry - 1, 4))) * Double.random(in: 0.85...1.15))
        retryTimer?.invalidate()
        retryTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) {
            [weak self] _ in
            self?.openSocket()
        }
    }
    private func send(_ object: [String: Any]) {
        guard let socket, let data = try? JSONSerialization.data(withJSONObject: object),
            let string = String(data: data, encoding: .utf8)
        else { return }
        socket.send(.string(string)) { [weak self, weak socket] error in
            if let error, let socket {
                DispatchQueue.main.async {
                    self?.failed(socket, message: error.localizedDescription)
                }
            }
        }
    }
    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self, weak task] result in
            DispatchQueue.main.async {
                guard let self, let task, self.socket === task else { return }
                switch result {
                case .failure(let error):
                    if [4001, 4002, 4003].contains(task.closeCode.rawValue) {
                        self.disconnect()
                        self.status = "failed"
                        self.errorText =
                            "Pairing was rejected or replaced. Scan the desktop QR to pair again."
                        self.emit()
                    } else {
                        self.failed(task, message: error.localizedDescription)
                    }
                case .success(let message):
                    if case .string(let text) = message, let data = text.data(using: .utf8),
                        let object = (try? JSONSerialization.jsonObject(with: data))
                            as? [String: Any]
                    {
                        self.message(object)
                    }
                    if self.socket === task { self.receive(task) }
                }
            }
        }
    }
    private func message(_ object: [String: Any]) {
        switch object["type"] as? String {
        case "welcome":
            handshakeTimer?.invalidate()
            handshakeTimer = nil
            authenticated = true
            retry = 0
            errorText = ""
            let desired = pendingMute ?? ((object["muted"] as? Bool ?? false) || muted)
            pendingMute = nil
            setMuted(desired, notify: true)
            status = interrupted ? "interrupted" : "connected"
            emit()
            sendStatus()
            heartbeat?.invalidate()
            lastPong = Date()
            heartbeat = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
                self?.ping()
            }
        case "mute": setMuted(object["muted"] as? Bool ?? true, notify: false)
        case "disconnect": disconnect()
        default: break
        }
    }
    private func setMuted(_ value: Bool, notify: Bool) {
        muted = value
        UserDefaults.standard.set(value, forKey: "muted")
        if notify {
            if authenticated {
                send(["type": "mute", "muted": value])
            } else {
                pendingMute = value
            }
        }
        emit()
    }
    private func ping() {
        guard wanted, let socket else { return }
        if Date().timeIntervalSince(lastPong) > 10 {
            failed(socket, message: "Desktop stopped responding. Retrying…")
            return
        }
        socket.sendPing { [weak self, weak socket] error in
            DispatchQueue.main.async {
                guard let self, let socket, self.socket === socket else { return }
                if let error {
                    self.failed(socket, message: error.localizedDescription)
                } else {
                    self.lastPong = Date()
                }
            }
        }
        sendStatus()
    }
    private func sendStatus() {
        guard authenticated else { return }
        var object: [String: Any] = [
            "type": "status", "status": interrupted ? "interrupted" : "connected",
        ]
        if UIDevice.current.batteryLevel >= 0 { object["battery"] = UIDevice.current.batteryLevel }
        send(object)
    }
    private func samples(_ pcm: Data, level: Float) {
        guard wanted, !interrupted else { return }
        if Date().timeIntervalSince(lastMeter) > 0.10 {
            lastMeter = Date()
            emit(level: muted ? 0 : level)
        }
        guard authenticated, let socket, inflight < 3 else { return }
        var packet = Data([0x43, 0x4e, 0x44, 0x31])
        var seq = sequence.littleEndian
        sequence &+= 1
        var rate = UInt32(48000).littleEndian
        withUnsafeBytes(of: &seq) { packet.append(contentsOf: $0) }
        withUnsafeBytes(of: &rate) { packet.append(contentsOf: $0) }
        packet.append(muted ? Data(repeating: 0, count: pcm.count) : pcm)
        inflight += 1
        socket.send(.data(packet)) { [weak self, weak socket] error in
            DispatchQueue.main.async {
                guard let self, let socket, self.socket === socket else { return }
                self.inflight = max(0, self.inflight - 1)
                if let error { self.failed(socket, message: error.localizedDescription) }
            }
        }
    }
    @objc private func interruption(_ note: Notification) {
        guard wanted, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw)
        else { return }
        if type == .began {
            interrupted = true
            captureStarting = false
            captureTimer?.invalidate()
            capture.stop()
            status = authenticated ? "interrupted" : status
            emit()
            sendStatus()
        } else {
            let rawOptions = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            if AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume) {
                recoverCapture()
            } else {
                errorText =
                    "Microphone interrupted. Reopen Cindermic to resume when the microphone is free."
                emit()
            }
        }
    }
    private func armCaptureTimeout(generation: UInt64) {
        captureTimer?.invalidate()
        captureTimer = Timer.scheduledTimer(withTimeInterval: connectionTimeout, repeats: false) { [weak self] _ in
            guard let self, self.wanted, self.captureStarting, self.connectionGeneration == generation else { return }
            self.disconnect()
            self.status = "failed"
            self.errorText = "Microphone startup timed out. Try connecting again."
            self.emit()
        }
    }
    private func recoverCapture() {
        guard wanted, !captureStarting else { return }
        captureStarting = true
        let generation = connectionGeneration
        armCaptureTimeout(generation: generation)
        capture.start { [weak self] error in
            guard let self, self.wanted, self.connectionGeneration == generation else { return }
            self.captureStarting = false
            self.captureTimer?.invalidate()
            self.interrupted = error != nil
            self.errorText = error.map { "Waiting for microphone: \($0.localizedDescription)" } ?? ""
            if self.authenticated { self.status = self.interrupted ? "interrupted" : "connected" }
            self.emit()
            self.sendStatus()
            if error == nil && self.socket == nil { self.openSocket() }
        }
    }
    @objc private func routeChanged() {
        if wanted && !captureStarting {
            capture.stop()
            recoverCapture()
        }
    }
    @objc private func mediaReset() {
        if wanted && !captureStarting {
            capture.stop()
            recoverCapture()
        }
    }
    @objc private func foreground() {
        emit()
        if wanted {
            if !captureStarting && (interrupted || !capture.running) { recoverCapture() }
            if socket == nil && capture.running && !captureStarting { openSocket() }
        }
    }
    func urlSession(
        _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        guard socket === webSocketTask, let pairing else { return }
        send(["type": "hello", "token": pairing.token, "name": UIDevice.current.name])
    }
    func urlSession(
        _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?
    ) {
        guard socket === webSocketTask else { return }
        if [4001, 4002, 4003].contains(closeCode.rawValue) {
            disconnect()
            status = "failed"
            errorText =
                closeCode.rawValue == 4001
                ? "Pairing was rejected. Scan a fresh desktop QR code."
                : "Another session replaced this connection."
            emit()
        } else {
            failed(webSocketTask, message: "Connection lost. Retrying…")
        }
    }
    func urlSession(
        _ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard self.session === session else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        guard
            challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
            let trust = challenge.protectionSpace.serverTrust,
            let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
            let leaf = chain.first,
            let pairing
        else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        let digest = SHA256.hash(data: SecCertificateCopyData(leaf) as Data).map {
            String(format: "%02x", $0)
        }.joined()
        // The QR code explicitly pins this self-signed local server certificate.
        guard digest == pairing.fingerprint, challenge.protectionSpace.host == pairing.host else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}
