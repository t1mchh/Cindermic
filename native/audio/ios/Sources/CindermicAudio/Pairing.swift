import Foundation
import Security

struct Pairing: Codable {
    let host: String
    let port: Int
    let token: String
    let fingerprint: String

    init(link: String) throws {
        guard let url = URLComponents(string: link), url.scheme == "cindermic", url.host == "pair"
        else {
            throw PairingError.invalid
        }
        let items = Dictionary(
            (url.queryItems ?? []).map { ($0.name, $0.value ?? "") },
            uniquingKeysWith: { _, last in last })
        guard let host = items["host"], !host.isEmpty, !host.contains("/"), !host.contains("@"),
            let port = Int(items["port"] ?? ""), (1...65535).contains(port),
            let token = items["token"],
            token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
            let fingerprint = items["fingerprint"],
            fingerprint.range(of: "^[a-fA-F0-9]{64}$", options: .regularExpression) != nil
        else {
            throw PairingError.invalid
        }
        self.host = host
        self.port = port
        self.token = token
        self.fingerprint = fingerprint.lowercased()
    }
    var socketURL: URL? {
        var parts = URLComponents()
        parts.scheme = "wss"
        parts.host = host
        parts.port = port
        parts.path = "/"
        return parts.url
    }
    enum PairingError: LocalizedError {
        case invalid
        var errorDescription: String? {
            "That pairing link is invalid. Copy or scan a fresh link from the desktop app."
        }
    }
}

enum PairingStore {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "local.cindermic.pairing",
        kSecAttrAccount as String: "desktop",
    ]
    static func save(_ pairing: Pairing) throws {
        let data = try JSONEncoder().encode(pairing)
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(insert as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(
                domain: NSOSStatusErrorDomain, code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Could not save pairing in Keychain."])
        }
    }
    static func load() -> Pairing? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
            let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(Pairing.self, from: data)
    }
}
