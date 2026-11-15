import SwiftUI
import WebKit
import MudrixCore

struct RoomWidgetsView: View {
    let roomId: String
    let client: MudrixClient
    let canManage: Bool

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @State private var widgets: [MudrixCore.Widget] = []
    @State private var loaded = false
    @State private var adding = false
    @State private var removing: MudrixCore.Widget?
    @State private var viewing: WidgetPage?
    @State private var error: String?

    var body: some View {
        ThemedList {
            Section {
                if loaded && widgets.isEmpty {
                    Text(String(localized: "room.settings.widgets.noWidgets")).foregroundStyle(theme.textMuted)
                }
                ForEach(widgets, id: \.id) { widget in
                    Button { Task { await open(widget) } } label: {
                        HStack(spacing: WZ.Space.space5) {
                            Image("ph-puzzle-piece-regular")
                                .font(.system(size: WZ.SizeIcon.md))
                                .foregroundStyle(theme.textMuted)
                            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                Text(widget.name?.isEmpty == false ? widget.name! : String(localized: "room.settings.widgets.untitled"))
                                    .foregroundStyle(theme.textPrimary)
                                Text(URL(string: widget.url)?.host() ?? widget.url)
                                    .font(.wizard(WZ.FontSize.sm))
                                    .foregroundStyle(theme.textMuted)
                                    .lineLimit(1)
                                if let creator = widget.creator {
                                    Text(L10n.format("room.settings.widgets.addedBy", creator))
                                        .font(.wizard(WZ.FontSize.xs))
                                        .foregroundStyle(theme.textMuted)
                                        .lineLimit(1)
                                }
                            }
                            Spacer(minLength: WZ.Space.space0)
                            Image("ph-arrow-square-out-regular")
                                .font(.system(size: WZ.SizeIcon.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if canManage {
                            Button(role: .destructive) { removing = widget } label: {
                                Label(String(localized: "room.settings.widgets.removeWidget"), image: "ph-trash-regular")
                            }
                        }
                    }
                }
            } footer: {
                Text(String(localized: "room.settings.widgets.privacy")).foregroundStyle(theme.textMuted)
            }
            if canManage {
                Section {
                    Button { adding = true } label: {
                        Label(String(localized: "room.settings.widgets.addWidgetBtn"), image: "ph-plus-regular")
                    }
                }
            }
            if let error {
                StatusText(text: error).listRowBackground(Color.clear)
            }
        }
        .navigationTitle(String(localized: "room.settings.widgets.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .fullScreenCover(item: $viewing) { page in
            WidgetViewerSheet(page: page)
        }
        .sheet(isPresented: $adding) {
            AddWidgetSheet { name, url in
                try await client.setWidget(roomId: roomId, id: nil, name: name, url: url)
                await load()
            }
        }
        .confirmationDialog(L10n.format("room.settings.widgets.removeWidgetConfirm", removing?.name ?? String(localized: "room.settings.widgets.untitled")),
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible) {
            Button(String(localized: "room.settings.widgets.removeWidget"), role: .destructive) {
                guard let widget = removing else { return }
                Task {
                    do {
                        try await client.removeWidget(roomId: roomId, id: widget.id)
                        await load()
                    } catch {
                        self.error = L10n.format("room.settings.widgets.widgetRemoveFailed", error.localizedDescription)
                    }
                }
            }
        }
    }

    private func load() async {
        widgets = (try? await client.widgets(roomId: roomId)) ?? []
        loaded = true
    }

    private func open(_ widget: MudrixCore.Widget) async {
        let language = Locale.current.language.languageCode?.identifier ?? "en"
        let theme = colorScheme == .dark ? "dark" : "light"
        guard let string = try? await client.widgetUrl(roomId: roomId, widget: widget, theme: theme, language: language),
              let url = URL(string: string) else { return }
        // In the app, read only (no widget API); a page the sandbox refuses opens in the browser instead
        if WidgetSandbox.allows(url) {
            viewing = WidgetPage(title: widget.name?.isEmpty == false ? widget.name! : String(localized: "room.settings.widgets.untitled"), url: url)
        } else {
            openURL(url)
        }
    }
}

/// A widget page to look at
struct WidgetPage: Identifiable {
    let id = UUID()
    let title: String
    let url: URL
}

/// What a widget page may do in the app. It is shown read only: the page runs in a web view with no bridge to the
/// app, so it cannot read or send room events, and with its own throwaway storage.
enum WidgetSandbox {
    /// Only https pages with a host and no user name or password in the address
    static func allows(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host(), !host.isEmpty else { return false }
        return url.user() == nil && url.password() == nil
    }

    /// The host shown as "Code from ..."
    static func host(of url: URL) -> String { url.host() ?? url.absoluteString }
}

/// A widget in a sandboxed web view with the "Runs code" label the integrations show, and a way out to the browser
struct WidgetViewerSheet: View {
    let page: WidgetPage

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var failed = false

    var body: some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space0) {
                HStack(spacing: WZ.Space.space3) {
                    Image("ph-puzzle-piece-regular").font(.system(size: WZ.SizeIcon.sm))
                    Text(String(localized: "integrations.widget.badge")).font(.wizard(WZ.FontSize.sm, .semibold))
                    Text(L10n.format("integrations.widget.codeFrom", WidgetSandbox.host(of: page.url)))
                        .font(.wizard(WZ.FontSize.sm))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(theme.warningColor)
                .padding(WZ.Space.space4)
                .frame(maxWidth: .infinity)
                .background(theme.bgTertiary)
                .accessibilityElement(children: .combine)
                if failed {
                    Text(String(localized: "integrations.widget.failed"))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textMuted)
                        .padding(WZ.Space.space8)
                        .frame(maxHeight: .infinity)
                } else {
                    SandboxedWebView(url: page.url) { failed = true }
                        .accessibilityLabel(L10n.format("integrations.widget.frameTitle", page.title, WidgetSandbox.host(of: page.url)))
                }
            }
            .navigationTitle(page.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { openURL(page.url) } label: {
                        Image("ph-arrow-square-out-regular").minTouchTarget()
                    }
                    .accessibilityLabel(String(localized: "room.settings.widgets.title"))
                }
            }
            .tint(theme.control)
        }
    }
}

/// A web view with its own throwaway storage, no script bridge, no pop-ups, no camera or microphone, and
/// navigation kept to https
private struct SandboxedWebView: UIViewRepresentable {
    let url: URL
    let onFailure: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFailure: onFailure) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = false
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let onFailure: () -> Void

        init(onFailure: @escaping () -> Void) { self.onFailure = onFailure }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let target = navigationAction.request.url else { return decisionHandler(.cancel) }
            decisionHandler(target.absoluteString == "about:blank" || WidgetSandbox.allows(target) ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { report(error) }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        /// A navigation the sandbox itself cancelled is not a failure of the page
        private func report(_ error: Error) {
            let nsError = error as NSError
            if nsError.code == NSURLErrorCancelled || (nsError.domain == "WebKitErrorDomain" && nsError.code == 102) { return }
            onFailure()
        }

        /// No pop-up windows
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(.deny)
        }
    }
}
private struct AddWidgetSheet: View {
    let onAdd: (String, String) async throws -> Void
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var url = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    TextField(String(localized: "common.name"), text: $name)
                    TextField(String(localized: "room.settings.widgets.url"), text: $url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text(String(localized: "room.settings.widgets.urlHint")).foregroundStyle(theme.textMuted)
                }
                if let error {
                    StatusText(text: error).listRowBackground(Color.clear)
                }
            }
            .navigationTitle(String(localized: "room.settings.widgets.addWidgetBtn"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) {
                        saving = true
                        Task {
                            defer { saving = false }
                            do {
                                try await onAdd(name, url)
                                dismiss()
                            } catch {
                                self.error = L10n.format("room.settings.widgets.widgetSaveFailed", error.localizedDescription)
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(saving || url.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .tint(theme.control)
        }
        .presentationDetents([.medium])
    }
}

struct RoomBridge: Identifiable {
    struct Part {
        let id: String
        let name: String?
        let avatarUrl: String?
        let externalUrl: URL?
        var label: String { name ?? id }
    }

    let id: String
    let bot: String
    let creator: String?
    let protocolPart: Part
    let network: Part?
    let channel: Part

    static func load(client: MudrixClient, roomId: String) async -> [RoomBridge] {
        var byKey: [String: RoomBridge] = [:]
        var order: [String] = []
        for type in ["m.bridge", "uk.half-shot.bridge"] {
            for pair in (try? await client.stateEventsOfType(roomId: roomId, eventType: type)) ?? [] {
                guard pair.count == 2, case .string(let key) = pair[0], byKey[key] == nil,
                      let bridge = parse(key: key, content: pair[1]) else { continue }
                byKey[key] = bridge
                order.append(key)
            }
        }
        return order.compactMap { byKey[$0] }
    }

    private static func parse(key: String, content: JSONValue) -> RoomBridge? {
        guard case .object(let fields) = content, case .string(let bot)? = fields["bridgebot"], !bot.isEmpty,
              let protocolPart = part(fields["protocol"]), let channel = part(fields["channel"]) else { return nil }
        var creator: String?
        if case .string(let value)? = fields["creator"] { creator = value }
        return RoomBridge(id: key, bot: bot, creator: creator, protocolPart: protocolPart,
                          network: part(fields["network"]), channel: channel)
    }

    private static func part(_ value: JSONValue?) -> Part? {
        guard case .object(let fields)? = value else { return nil }
        let id: String
        switch fields["id"] {
        case .string(let text)? where !text.isEmpty: id = text
        case .number(let number)?: id = String(Int(number))
        default: return nil
        }
        func text(_ key: String) -> String? {
            if case .string(let value)? = fields[key], !value.isEmpty { return value }
            return nil
        }
        let avatar = text("avatar_url").flatMap { $0.hasPrefix("mxc://") ? $0 : nil }
        let external = text("external_url").flatMap { $0.hasPrefix("http") ? URL(string: $0) : nil }
        return Part(id: id, name: text("displayname"), avatarUrl: avatar, externalUrl: external)
    }
}

struct RoomBridgesView: View {
    let roomId: String
    let bridges: [RoomBridge]
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL
    @State private var profileUserId: String?

    var body: some View {
        ThemedList {
            ForEach(bridges) { bridge in
                Section {
                    HStack(spacing: WZ.Space.space5) {
                        AvatarView(name: bridge.protocolPart.label, url: bridge.protocolPart.avatarUrl, size: WZ.SizeAvatar.md)
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(bridge.protocolPart.label).font(.wizard(WZ.FontSize.md, .semibold))
                            if let network = bridge.network {
                                Text(network.label).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                            }
                            if let url = bridge.channel.externalUrl {
                                Button(bridge.channel.label) { openURL(url) }
                                    .font(.wizard(WZ.FontSize.sm))
                                    .buttonStyle(.plain)
                                    .foregroundStyle(theme.control)
                            } else {
                                Text(bridge.channel.label).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                            }
                        }
                    }
                    Button { profileUserId = bridge.bot } label: {
                        LabeledContent(String(localized: "room.settings.bridges.bot"), value: bridge.bot)
                    }
                    if let creator = bridge.creator {
                        Button { profileUserId = creator } label: {
                            LabeledContent(String(localized: "room.settings.bridges.createdBy"), value: creator)
                        }
                    }
                }
            }
        }
        .foregroundStyle(theme.textPrimary)
        .navigationTitle(String(localized: "room.settings.bridges.title"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: Binding(get: { profileUserId.map(IdentifiedString.init) }, set: { profileUserId = $0?.id })) { item in
            UserProfileSheet(userId: item.id, roomId: roomId)
        }
    }
}
