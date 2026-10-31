import AVFoundation
import UIKit
import VisionKit
import Vision

final class PairingScanner: NSObject, DataScannerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private var scanner: DataScannerViewController?
    private var navigation: UINavigationController?
    private var completion: ((Result<String?, Error>) -> Void)?

    func present(from presenter: UIViewController, completion: @escaping (Result<String?, Error>) -> Void) {
        guard self.completion == nil else { return }
        self.completion = completion
        AVCaptureDevice.requestAccess(for: .video) { [weak self, weak presenter] allowed in
            DispatchQueue.main.async {
                guard let self else { return }
                guard allowed else { self.finish(.failure(self.error("Camera permission denied. Allow Camera in Settings."))); return }
                guard let presenter, DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
                    self.finish(.failure(self.error("QR scanner unavailable. Paste the desktop pairing link instead.")))
                    return
                }
                let scanner = DataScannerViewController(
                    recognizedDataTypes: [.barcode(symbologies: [.qr])],
                    qualityLevel: .balanced, recognizesMultipleItems: false,
                    isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true,
                    isGuidanceEnabled: true, isHighlightingEnabled: true)
                scanner.delegate = self
                scanner.title = NSLocalizedString("scanner.title", tableName: "InfoPlist", comment: "")
                scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .cancel, target: self, action: #selector(self.cancel))
                let navigation = UINavigationController(rootViewController: scanner)
                navigation.modalPresentationStyle = .fullScreen
                navigation.presentationController?.delegate = self
                self.scanner = scanner
                self.navigation = navigation
                presenter.present(navigation, animated: true) {
                    do { try scanner.startScanning() } catch { self.finish(.failure(error)) }
                }
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case .barcode(let barcode) = item, let link = barcode.payloadStringValue {
                do {
                    _ = try Pairing(link: link)
                    finish(.success(link))
                } catch { finish(.failure(error)) }
                return
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        finish(.failure(error))
    }

    @objc private func cancel() { finish(.success(nil)) }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(.success(nil)) }

    private func finish(_ result: Result<String?, Error>) {
        guard let completion else { return }
        self.completion = nil
        scanner?.stopScanning()
        scanner?.delegate = nil
        scanner = nil
        let navigation = navigation
        self.navigation = nil
        if let navigation, navigation.presentingViewController != nil {
            navigation.dismiss(animated: true) { completion(result) }
        } else { completion(result) }
    }

    private func error(_ message: String) -> NSError {
        NSError(domain: "Cindermic.Scanner", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
