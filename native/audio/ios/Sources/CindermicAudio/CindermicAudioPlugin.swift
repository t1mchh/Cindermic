import Capacitor

@objc(CindermicAudioPlugin)
public class CindermicAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CindermicAudioPlugin"
    public let jsName = "Cindermic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "command", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanPairing", returnType: CAPPluginReturnPromise)
    ]
    private let mic = MicController()
    private var scanner: PairingScanner?

    public override func load() {
        mic.onState = { [weak self] state in self?.notifyListeners("state", data: state) }
        mic.onNeedsPairing = { [weak self] in self?.notifyListeners("pairingRequired", data: [:]) }
    }

    @objc func scanPairing(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else { call.reject("QR scanner unavailable."); return }
            guard self.scanner == nil else { call.reject("QR scanner already open."); return }
            let scanner = PairingScanner()
            self.scanner = scanner
            scanner.present(from: presenter) { [weak self] result in
                self?.scanner = nil
                switch result {
                case .success(let link):
                    call.resolve(link.map { ["link": $0] } ?? ["cancelled": true])
                case .failure(let error): call.reject(error.localizedDescription)
                }
            }
        }
    }

    @objc func command(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Audio controller is unavailable.")
                return
            }
            guard let type = call.getString("type") else {
                call.reject("A command type is required.")
                return
            }
            var command: [String: Any] = ["type": type]
            if let muted = call.getBool("muted") { command["muted"] = muted }
            if let link = call.getString("link") { command["link"] = link }
            self.mic.handle(command)
            call.resolve(self.mic.snapshot())
        }
    }
}
