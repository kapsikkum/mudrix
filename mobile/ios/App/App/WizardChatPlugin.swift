import AuthenticationServices
import Capacitor
import UIKit

// Called from wizardchat-web's src/util/nativeApp.ts via Capacitor.nativePromise('WizardChat', …)
@objc(WizardChatPlugin)
public class WizardChatPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WizardChatPlugin"
    public let jsName = "WizardChat"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
    ]

    // Must match NATIVE_APP_SCHEME in src/util/nativeApp.ts
    private static let appScheme = "org.wizardchat.mobile"
    private var authSession: ASWebAuthenticationSession?

    // The redirect is handed on like any other app link (handled in src/util/nativeApp.ts)
    @objc func openUrl(_ call: CAPPluginCall) {
        guard let string = call.getString("url"), let url = URL(string: string) else {
            call.reject("url is required")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: Self.appScheme) { [weak self] callbackURL, _ in
                self?.authSession = nil
                if let callbackURL {
                    _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: callbackURL)
                }
                self?.bridge?.webView?.evaluateJavaScript("document.dispatchEvent(new Event('visibilitychange'))")
            }
            session.presentationContextProvider = self
            self.authSession = session
            if session.start() {
                call.resolve()
            } else {
                self.authSession = nil
                call.reject("Could not open the login page")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    @objc func saveFile(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), let data = Data(base64Encoded: base64) else {
            call.reject("data is required")
            return
        }
        let filename = (call.getString("filename") ?? "download").replacingOccurrences(of: "/", with: "_")
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            call.reject("Saving failed", nil, error)
            return
        }
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("No view to present from")
                return
            }
            let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = viewController.view
                popover.sourceRect = CGRect(x: viewController.view.bounds.midX, y: viewController.view.bounds.maxY, width: 0, height: 0)
            }
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                try? FileManager.default.removeItem(at: fileURL)
                if completed {
                    call.resolve()
                } else {
                    call.reject("Cancelled")
                }
            }
            viewController.present(sheet, animated: true)
        }
    }
}

class WizardChatViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WizardChatPlugin())
    }
}
