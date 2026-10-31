import AVFoundation

final class AudioCapture {
    var onSamples: ((Data, Float) -> Void)?
    private let queue = DispatchQueue(label: "local.cindermic.capture", qos: .userInitiated)
    private var engine: AVAudioEngine?
    private var generation: UInt64 = 0
    private(set) var running = false

    func start(completion: @escaping (Error?) -> Void) {
        if running { completion(nil); return }
        generation &+= 1
        let current = generation
        queue.async { [weak self] in
            guard let self else { return }
            var failure: Error?
            do { try self.startEngine(generation: current) } catch {
                self.stopEngine()
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                failure = error
            }
            DispatchQueue.main.async {
                guard self.generation == current else { return }
                self.running = failure == nil
                completion(failure)
            }
        }
    }

    private func startEngine(generation: UInt64) throws {
        stopEngine()
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord || session.mode != .measurement {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker])
        }
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0,
            let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48_000, channels: 1, interleaved: false),
            let converter = AVAudioConverter(from: inputFormat, to: target) else {
            throw NSError(domain: "Cindermic", code: 1, userInfo: [NSLocalizedDescriptionKey: "No usable microphone input is available."])
        }
        var pending: [Float] = []
        pending.reserveCapacity(2048)
        let deliverySlots = DispatchSemaphore(value: 3)
        input.installTap(onBus: 0, bufferSize: 960, format: inputFormat) { [weak self] buffer, _ in
            let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 48_000 / inputFormat.sampleRate)) + 64
            guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            var supplied = false
            var error: NSError?
            let result = converter.convert(to: output, error: &error) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, result != .error, let channel = output.floatChannelData?[0] else { return }
            pending.append(contentsOf: UnsafeBufferPointer(start: channel, count: Int(output.frameLength)))
            while pending.count >= 960 {
                var pcm = Data(count: 1920)
                var energy: Float = 0
                pcm.withUnsafeMutableBytes { raw in
                    let samples = raw.bindMemory(to: Int16.self)
                    for i in 0..<960 {
                        let value = pending[i].isFinite ? max(-1, min(1, pending[i])) : 0
                        energy += value * value
                        samples[i] = Int16(value * 32767).littleEndian
                    }
                }
                pending.removeFirst(960)
                guard deliverySlots.wait(timeout: .now()) == .success else { continue }
                let level = sqrt(energy / 960)
                let packet = pcm
                DispatchQueue.main.async {
                    defer { deliverySlots.signal() }
                    guard let self, self.generation == generation else { return }
                    self.onSamples?(packet, level)
                }
            }
        }
        self.engine = engine
        engine.prepare()
        try engine.start()
    }

    private func stopEngine() {
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        engine = nil
    }

    func stop() {
        generation &+= 1
        running = false
        queue.async { [weak self] in self?.stopEngine() }
    }

    func deactivate() {
        generation &+= 1
        running = false
        queue.async { [weak self] in
            self?.stopEngine()
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
