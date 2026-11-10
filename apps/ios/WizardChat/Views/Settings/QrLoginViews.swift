import AVFoundation
import SwiftUI
import WizardChatCore

enum QrMode { case scan, show }

struct QrSignInSheet: View {
    let server: String
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var mode: QrMode?

    var body: some View {
        NavigationStack {
            Group {
                if let mode {
                    QrAttemptView(mode: mode, showSteps: ["auth.qr.signInStep1", "auth.qr.signInStep2", "auth.qr.signInStep3"],
                                  doneText: nil,
                                  switchMode: { self.mode = mode == .scan ? .show : .scan }, onClose: { dismiss() }) { scanned, control, listener in
                        try await session.loginWithQr(server: server, scanned: scanned, control: control, listener: listener)
                    }
                    .id(mode)
                } else {
                    intro
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(theme.bgSecondary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled()
    }

    private var intro: some View {
        VStack(spacing: WZ.Space.space6) {
            ScrollView {
                VStack(spacing: WZ.Space.space6) {
                    QrHeader(icon: "ph-devices-regular", title: "auth.qr.scanIntroTitle", note: "auth.qr.scanIntroNote")
                    VStack(alignment: .leading, spacing: WZ.Space.space5) {
                        ForEach(Array(introSteps.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .firstTextBaseline, spacing: WZ.Space.space4) {
                                Text(verbatim: "\(index + 1)")
                                    .font(.wizard(WZ.FontSize.sm, .semibold))
                                    .foregroundStyle(theme.textMuted)
                                    .frame(width: WZ.SizeControl.sm, height: WZ.SizeControl.sm)
                                    .background(theme.fill, in: Circle())
                                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + WZ.Space.space2 }
                                Text(String(localized: step))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(WZ.Space.space6)
                    .background(theme.bgPrimary, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                }
                .padding(.top, WZ.Space.space6)
            }
            .scrollBounceBehavior(.basedOnSize)
            Button(String(localized: "auth.qr.readyToScan")) { mode = .scan }
                .buttonStyle(PrimaryButtonStyle())
        }
        .font(.wizard(WZ.FontSize.md))
        .foregroundStyle(theme.textPrimary)
        .padding(WZ.Space.space7)
    }

    private var introSteps: [String.LocalizationValue] {
        ["auth.qr.scanStep1", "auth.qr.scanStep2", "auth.qr.scanStep3", "auth.qr.scanStep4"]
    }
}

struct LinkDeviceSheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @State private var mode = QrMode.scan

    var body: some View {
        NavigationStack {
            QrAttemptView(mode: mode, showSteps: ["auth.qr.linkStep1", "auth.qr.linkStep2", "auth.qr.linkStep3"],
                          doneText: String(localized: "auth.qr.linkDone"),
                          switchMode: { mode = mode == .scan ? .show : .scan }, onClose: { dismiss() }) { scanned, control, listener in
                try await session.linkDevice(scanned: scanned, control: control, listener: listener)
            }
            .id(mode)
            .navigationTitle(String(localized: "auth.qr.linkTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled()
    }
}

private struct QrAttemptView: View {
    let mode: QrMode
    let showSteps: [String.LocalizationValue]
    let doneText: String?
    let switchMode: () -> Void
    let onClose: () -> Void
    let work: (Data?, QrLoginControl, @escaping @Sendable (QrLoginStatus) -> Void) async throws -> Void
    @Environment(\.theme) private var theme
    @StateObject private var flow = QrFlow()
    @State private var scanned = false

    var body: some View {
        Group {
            if mode == .scan && !scanned {
                scanner
            } else {
                QrFlowView(flow: flow, qrSteps: showSteps, doneText: doneText, onClose: onClose)
                    .safeAreaInset(edge: .bottom) {
                        if case .showQr = flow.step { switchButton.padding(WZ.Space.space7) }
                    }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.bgSecondary)
        .task {
            if mode == .show { await start(nil) }
        }
        .onDisappear { flow.cancel() }
    }

    private var scanner: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space7) {
                QrHeader(icon: "ph-camera-regular", title: "auth.qr.scanTitle")
                QrScannerView { bytes in
                    scanned = true
                    Task { await start(bytes) }
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                .overlay(ScanFrame().stroke(.white, style: StrokeStyle(lineWidth: WZ.Space.space2, lineCap: .round))
                    .padding(WZ.Space.space7))
                switchButton
            }
            .padding(WZ.Space.space7)
        }
        .scrollBounceBehavior(.basedOnSize)
        .font(.wizard(WZ.FontSize.md))
        .foregroundStyle(theme.textPrimary)
    }

    private var switchButton: some View {
        Button(String(localized: mode == .scan ? "auth.qr.showQrInstead" : "auth.qr.scanQrInstead"), action: switchMode)
            .buttonStyle(SecondaryButtonStyle())
    }

    private func start(_ scanned: Data?) async {
        await flow.run { control, listener in try await work(scanned, control, listener) }
    }
}

private struct QrHeader: View {
    let icon: String
    let title: String.LocalizationValue
    var note: String.LocalizationValue?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: WZ.Space.space4) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.xl))
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.SizeAvatar.lg, height: WZ.SizeAvatar.lg)
                .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            Text(String(localized: title))
                .font(.wizard(WZ.FontSize.xl, .bold))
                .multilineTextAlignment(.center)
            if let note {
                Text(String(localized: note))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

private struct ScanFrame: Shape {
    func path(in rect: CGRect) -> Path {
        let arm = min(rect.width, rect.height) * 0.18
        var path = Path()
        for (corner, dx, dy) in [(CGPoint(x: rect.minX, y: rect.minY), 1.0, 1.0), (CGPoint(x: rect.maxX, y: rect.minY), -1.0, 1.0),
                                 (CGPoint(x: rect.minX, y: rect.maxY), 1.0, -1.0), (CGPoint(x: rect.maxX, y: rect.maxY), -1.0, -1.0)] {
            path.move(to: CGPoint(x: corner.x, y: corner.y + dy * arm))
            path.addLine(to: corner)
            path.addLine(to: CGPoint(x: corner.x + dx * arm, y: corner.y))
        }
        return path
    }
}

@MainActor
final class QrFlow: ObservableObject {
    enum Step {
        case starting, finishing, done
        case showQr(UIImage)
        case enterCode
        case showCode(check: String?, approval: String?)
        case approve(URL)
        case failed(String)
    }

    @Published var step = Step.starting
    @Published var code = ""
    @Published var codeError = false
    private var checkCode: String?
    private var control: QrLoginControl?
    private var cancelled = false

    func run(_ work: (QrLoginControl, @escaping @Sendable (QrLoginStatus) -> Void) async throws -> Void) async {
        do {
            let control = try await QrLoginControl.create()
            self.control = control
            let (statuses, continuation) = AsyncStream<QrLoginStatus>.makeStream()
            let updates = Task { [weak self] in
                for await status in statuses { self?.update(status) }
            }
            defer { updates.cancel() }
            try await work(control) { status in continuation.yield(status) }
            continuation.finish()
            await updates.value
            if !cancelled { step = .done }
        } catch where !cancelled {
            step = .failed(QrLogin.failureMessage(error))
        } catch {}
    }

    private func update(_ status: QrLoginStatus) {
        switch status {
        case .starting: step = .starting
        case .showQr(let qr):
            if let image = QrLogin.image(base64: qr.data) { step = .showQr(image) }
        case .enterCheckCode: step = .enterCode
        case .showCheckCode(let check):
            checkCode = String(format: "%02d", check.code)
            step = .showCode(check: checkCode, approval: nil)
        case .waitingForApproval(let waiting):
            step = .showCode(check: checkCode, approval: waiting.user_code.flatMap { $0.isEmpty ? nil : $0 })
        case .approveInBrowser(let approval):
            if let url = URL(string: approval.url) { step = .approve(url) }
            Task {
                do { try await control?.confirm() } catch {
                    step = .failed(QrLogin.failureMessage(error))
                }
            }
        case .syncingSecrets: step = .finishing
        case .done: step = .done
        }
    }

    func sendCode() {
        let trimmed = code.trimmingCharacters(in: .whitespaces)
        guard trimmed.count == 2, let number = Int(trimmed) else {
            codeError = true
            return
        }
        step = .finishing
        Task {
            do { try await control?.sendCheckCode(code: number) } catch {
                step = .failed(QrLogin.failureMessage(error))
            }
        }
    }

    func cancel() {
        cancelled = true
        Task { [control] in try? await control?.cancel() }
    }
}

private struct QrFlowView: View {
    @ObservedObject var flow: QrFlow
    let qrSteps: [String.LocalizationValue]
    let doneText: String?
    let onClose: () -> Void
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space6) {
                switch flow.step {
                case .starting, .finishing:
                    ProgressView().tint(theme.accent)
                case .showQr(let image):
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: WZ.Size.sidebar)
                        .padding(WZ.Space.space4)
                        .background(.white, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        .accessibilityLabel(String(localized: "auth.qr.qrLabel"))
                    VStack(alignment: .leading, spacing: WZ.Space.space3) {
                        ForEach(Array(qrSteps.enumerated()), id: \.offset) { index, step in
                            Text(verbatim: "\(index + 1). \(String(localized: step))")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                case .enterCode:
                    Text(String(localized: "auth.qr.enterCode")).multilineTextAlignment(.center)
                    TextField("", text: $flow.code)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(.wizard(WZ.FontSize.xxl, .bold))
                        .frame(maxWidth: WZ.SizeAvatar.xl * 2)
                        .wizardField()
                        .onChange(of: flow.code) { _, value in
                            flow.code = String(value.filter(\.isNumber).prefix(2))
                            flow.codeError = false
                        }
                    if flow.codeError { StatusText(text: String(localized: "auth.qr.codeMismatch")) }
                    HStack(spacing: WZ.Space.space4) {
                        Button(String(localized: "common.decline")) { flow.cancel(); onClose() }
                            .buttonStyle(SecondaryButtonStyle())
                        Button(String(localized: "common.continue")) { flow.sendCode() }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(flow.code.count != 2)
                    }
                case .showCode(let check, let approval):
                    if let check {
                        Text(String(localized: "auth.qr.showCode")).multilineTextAlignment(.center)
                        Text(check).font(.wizard(WZ.FontSize.display, .bold)).foregroundStyle(theme.accent)
                    }
                    if let approval {
                        Text(String(localized: "auth.qr.showApprovalCode")).multilineTextAlignment(.center)
                        Text(approval)
                            .font(.wizard(WZ.FontSize.display, .bold))
                            .monospaced()
                            .foregroundStyle(theme.accent)
                            .textSelection(.enabled)
                    }
                    Text(String(localized: "auth.qr.waitingForApproval")).multilineTextAlignment(.center)
                    ProgressView().tint(theme.accent)
                case .approve(let url):
                    Text(String(localized: "auth.qr.approveInBrowser")).multilineTextAlignment(.center)
                    ProgressView().tint(theme.accent)
                    Button(String(localized: "auth.qr.openApproval")) { openURL(url) }
                        .buttonStyle(SecondaryButtonStyle())
                        .onAppear { openURL(url) }
                case .done:
                    if let doneText {
                        Image("ph-check-circle-fill").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.success)
                        Text(doneText).multilineTextAlignment(.center)
                        Button(String(localized: "common.close"), action: onClose).buttonStyle(PrimaryButtonStyle())
                    } else {
                        ProgressView().tint(theme.accent)
                    }
                case .failed(let message):
                    Image("ph-x-circle-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.error)
                    Text(message).multilineTextAlignment(.center)
                    Button(String(localized: "common.close"), action: onClose).buttonStyle(SecondaryButtonStyle())
                }
            }
            .font(.wizard(WZ.FontSize.md))
            .foregroundStyle(theme.textPrimary)
            .padding(WZ.Space.space7)
            .frame(maxWidth: .infinity)
        }
        .background(theme.bgSecondary)
    }
}

struct QrScannerView: UIViewControllerRepresentable {
    let onScan: (Data) -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onScan = onScan
        return controller
    }

    func updateUIViewController(_ controller: ScannerController, context: Context) {}

    final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var onScan: ((Data) -> Void)?
        private let capture = AVCaptureSession()
        private var preview: AVCaptureVideoPreviewLayer?
        private var scanned = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { granted ? self.startCamera() : self.showDenied() }
            }
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            preview?.frame = view.bounds
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            let capture = capture
            DispatchQueue.global(qos: .userInitiated).async { capture.stopRunning() }
        }

        private func startCamera() {
            guard let camera = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: camera), capture.canAddInput(input) else { return }
            capture.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard capture.canAddOutput(output) else { return }
            capture.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let preview = AVCaptureVideoPreviewLayer(session: capture)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.bounds
            view.layer.addSublayer(preview)
            self.preview = preview
            let capture = capture
            DispatchQueue.global(qos: .userInitiated).async { capture.startRunning() }
        }

        private func showDenied() {
            let label = UILabel()
            label.text = String(localized: "auth.qr.cameraDenied")
            label.textColor = .white
            label.numberOfLines = 0
            label.textAlignment = .center
            label.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
                label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: WZ.Space.space6),
                label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -WZ.Space.space6),
            ])
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                            from connection: AVCaptureConnection) {
            guard !scanned,
                  let code = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
                  let descriptor = code.descriptor as? CIQRCodeDescriptor,
                  let bytes = QrLogin.bytes(of: descriptor) else { return }
            scanned = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onScan?(bytes)
        }
    }
}
