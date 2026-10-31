import Capacitor

@objc(CindermicAudioPlugin)
public class CindermicAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CindermicAudioPlugin"
    public let jsName = "Cindermic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "command", returnType: CAPPluginReturnPromise)
    ]
    private let mic = MicController()

    public override func load() {
        mic.onState = { [weak self] state in self?.notifyListeners("state", data: state) }
        mic.onNeedsPairing = { [weak self] in self?.notifyListeners("pairingRequired", data: [:]) }
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
