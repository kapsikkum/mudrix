import SwiftUI
import WizardChatCore

struct AccountDataExplorer: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var types: [String] = []
    @State private var loaded = false
    @State private var adding = false

    var body: some View {
        List {
            Section {
                if loaded && types.isEmpty {
                    Text(String(localized: "settings.developer.accountDataEmpty")).foregroundStyle(theme.textMuted)
                }
                ForEach(types, id: \.self) { type in
                    NavigationLink {
                        AccountDataEditor(type: type) { await load() }
                    } label: {
                        Text(type).font(.system(size: WZ.FontSize.sm, design: .monospaced))
                    }
                }
            } header: {
                if loaded { Text(L10n.format("settings.developer.accountDataCount", types.count)) }
            }
            .listRowBackground(theme.groupedRow)
        }
        .scrollContentBackground(.hidden)
        .background(theme.groupedBackground.ignoresSafeArea())
        .navigationTitle(String(localized: "settings.developer.accountData"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(String(localized: "settings.developer.accountDataAdd")) { adding = true }
            }
        }
        .navigationDestination(isPresented: $adding) {
            AccountDataEditor(type: nil) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        types = ((try? await session.client?.accountDataTypes()) ?? []).sorted()
        loaded = true
    }
}

private struct AccountDataEditor: View {
    let type: String?
    let onSaved: () async -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var newType = ""
    @State private var text = ""
    @State private var status: (String, Bool)?
    @State private var saving = false

    var body: some View {
        ThemedForm {
            if type == nil {
                Section(String(localized: "settings.developer.accountDataType")) {
                    TextField("m.example", text: $newType)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(size: WZ.FontSize.sm, design: .monospaced))
                }
            }
            Section(String(localized: "settings.developer.accountDataContent")) {
                TextEditor(text: $text)
                    .font(.system(size: WZ.FontSize.sm, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .frame(minHeight: WZ.Size.panel)
            }
            if let status {
                StatusText(text: status.0, isError: status.1)
            }
        }
        .navigationTitle(type ?? String(localized: "settings.developer.accountDataNew"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(String(localized: "common.save")) { Task { await save() } }
                    .fontWeight(.semibold)
                    .disabled(saving || (type == nil && newType.trimmingCharacters(in: .whitespaces).isEmpty))
            }
        }
        .task {
            guard let type, let value = try? await session.client?.accountData(eventType: type) else {
                if text.isEmpty { text = "{\n}" }
                return
            }
            text = Self.pretty(value)
        }
    }

    private func save() async {
        let eventType = type ?? newType.trimmingCharacters(in: .whitespaces)
        guard let data = text.data(using: .utf8),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data), case .object = value else {
            status = (String(localized: "settings.developer.accountDataNotObject"), true)
            return
        }
        saving = true
        defer { saving = false }
        do {
            try await session.client?.setAccountData(eventType: eventType, content: value)
            status = (String(localized: "settings.developer.accountDataSaved"), false)
            await onSaved()
            if type == nil { dismiss() }
        } catch {
            status = (L10n.format("settings.developer.accountDataSaveFailed", error.localizedDescription), true)
        }
    }

    private static func pretty(_ value: JSONValue) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(value) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}
