import AVFoundation

/// Native capture owns the microphone; the web view only draws the interface.
final class AudioCapture {
    var onSamples: ((Data, Float) -> Void)?
    private var engine: AVAudioEngine?
    private var pending: [Float] = []
    private var converter: AVAudioConverter?
    private var sampleQueue = DispatchQueue(label: "com.cindermic.audio.capture", qos: .userInitiated)
    var running: Bool { engine?.isRunning == true }

    func start() throws {
        if running { return }
        stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker])
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0,
            let target = AVAudioFormat(
                commonFormat: .pcmFormatFloat32, sampleRate: 48_000, channels: 1, interleaved: false
            ),
            let converter = AVAudioConverter(from: inputFormat, to: target)
        else {
            throw NSError(
                domain: "Cindermic", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No usable microphone input is available."])
        }
        self.converter = converter
        pending = []
        input.installTap(onBus: 0, bufferSize: 960, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            let capacity =
                AVAudioFrameCount(
                    ceil(Double(buffer.frameLength) * 48_000 / inputFormat.sampleRate)) + 64
            guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else {
                return
            }
            var supplied = false
            var error: NSError?
            let result = converter.convert(to: output, error: &error) { _, status in
                if supplied {
                    status.pointee = .noDataNow
                    return nil
                }
                supplied = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, result != .error, let channel = output.floatChannelData?[0] else {
                return
            }
            self.pending.append(
                contentsOf: UnsafeBufferPointer(start: channel, count: Int(output.frameLength)))
            while self.pending.count >= 960 {
                let chunk = self.pending.prefix(960)
                var pcm = Data(capacity: 1920)
                var energy: Float = 0
                for value in chunk {
                    energy += value * value
                    var sample = Int16(max(-32768, min(32767, Int(value * 32767)))).littleEndian
                    withUnsafeBytes(of: &sample) { pcm.append(contentsOf: $0) }
                }
                self.pending.removeFirst(960)
                let level = sqrt(energy / 960)
                sampleQueue.async { [weak self] in self?.onSamples?(pcm, level) }
            }
        }
        self.engine = engine
        engine.prepare()
        do { try engine.start() } catch {
            stop()
            throw error
        }
    }

    func stop() {
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        engine = nil
        converter = nil
        // The old render callback owns its pending samples until engine.stop returns.
        pending = []
    }

    func deactivate() {
        stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
