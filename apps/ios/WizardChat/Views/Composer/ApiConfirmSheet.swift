import SwiftUI

/// An API action waiting for the person's confirmation: nothing is sent before they press Send
struct PendingApiRequest: Identifiable {
    let id = UUID()
    let integrationId: String
    let integrationName: String
    let action: ApiAction
    let permissions: IntegrationPerms
    let context: IntegrationApi.Context
}

/// Shows exactly what an API action will send (host, request line, body) and asks first. Cancel comes first, there is no
/// "don't ask again", and a link in the answer goes into the draft, never straight into a sent message.
struct ApiConfirmSheet: View {
    let request: PendingApiRequest
    /// Called with a link from the answer to put into the message box
    let onLink: (String) -> Void
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var sending = false

    private var preview: IntegrationApi.Preview {
        IntegrationApi.preview(request.permissions, request.action, request.context)
    }

    /// The hosts this request may reach right now: only while the integration is enabled and its api grant is on
    private var allow: [String] {
        guard let installed = store.installed.first(where: { $0.id == request.integrationId }) else { return [] }
        return IntegrationMatching.allowedHosts(installed, store.grants, .api)
    }

    var body: some View {
        NavigationStack {
            Form {
                switch preview {
                case .error(let message):
                    Text(message).foregroundStyle(theme.danger)
                case .ok(_, let host, let path, let body):
                    Section {
                        Text(L10n.format("integrations.api.intro", request.integrationName, request.action.label))
                            .font(.wizard(WZ.FontSize.md))
                    }
                    Section(String(localized: "integrations.api.host")) {
                        Text(host).font(.wizard(WZ.FontSize.md, .semibold))
                    }
                    Section(String(localized: "integrations.api.path")) {
                        Text("POST \(path)").font(.system(size: WZ.FontSize.sm, design: .monospaced))
                    }
                    Section(String(localized: "integrations.api.body")) {
                        if let body {
                            Text(body).font(.system(size: WZ.FontSize.sm, design: .monospaced)).textSelection(.enabled)
                        } else {
                            Text(String(localized: "integrations.api.noBody")).foregroundStyle(theme.textMuted)
                        }
                    } footer: {
                        Text(L10n.format("integrations.api.onlyThis", host))
                    }
                }
            }
            .navigationTitle(titleText)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "integrations.api.send")) { Task { await send() } }
                        .fontWeight(.semibold)
                        .disabled(sending || !isSendable)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var isSendable: Bool {
        if case .ok = preview { return true }
        return false
    }

    private var titleText: String {
        if case .ok(_, let host, _, _) = preview { return L10n.format("integrations.api.title", host) }
        return String(localized: "integrations.api.send")
    }

    private func send() async {
        guard case .ok(_, let host, _, _) = preview else { return }
        let hosts = allow
        guard !hosts.isEmpty else {
            CopyToast.shared.show(String(localized: "integrations.api.unavailable"))
            dismiss()
            return
        }
        sending = true
        let result = await IntegrationApi.call(request.permissions, request.action, request.context, allow: hosts)
        sending = false
        switch result {
        case .ok(let link):
            if let link {
                onLink(link)
                CopyToast.shared.show(L10n.format("integrations.api.sentLink", host))
            } else {
                CopyToast.shared.show(L10n.format("integrations.api.sent", host))
            }
            dismiss()
        case .error(let message):
            CopyToast.shared.show(L10n.format("integrations.api.failed", message))
        }
    }
}
