import SwiftUI
import UniformTypeIdentifiers
import WizardChatCore

/// Export and import of the room keys as a passphrase-protected file (the format Element uses too)
struct RoomKeysSection: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var exporting = false
    @State private var importing = false
    @State private var pickingFile = false
    @State private var importFile: URL?
    @State private var passphrase = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var status: (text: String, isError: Bool)?
    @State private var exported: URL?

    var body: some View {
        SettingsSection(title: "settings.roomKeys.title", note: "settings.roomKeys.description") {
            Button(String(localized: "settings.roomKeys.exportBtn")) {
                passphrase = ""
                confirm = ""
                status = nil
                exporting = true
            }
            .disabled(busy)
            Button(String(localized: "settings.roomKeys.importBtn")) {
                status = nil
                pickingFile = true
            }
            .disabled(busy)
        }
        if let status { StatusText(text: status.text) }
        EmptyView()
            .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.data, .plainText]) { result in
                guard case .success(let url) = result else { return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let copy = FileManager.default.temporaryDirectory.appendingPathComponent("room-keys-import.txt")
                try? FileManager.default.removeItem(at: copy)
                do {
                    try FileManager.default.copyItem(at: url, to: copy)
                    importFile = copy
                    passphrase = ""
                    importing = true
                } catch {
                    status = (L10n.format("settings.roomKeys.importFailed", error.localizedDescription), true)
                }
            }
            .alert(String(localized: "settings.roomKeys.exportTitle"), isPresented: $exporting) {
                SecureField(String(localized: "settings.roomKeys.passphrase"), text: $passphrase)
                SecureField(String(localized: "settings.roomKeys.confirmPassphrase"), text: $confirm)
                Button(String(localized: "settings.roomKeys.exportBtn")) { Task { await export() } }
                Button(String(localized: "common.cancel"), role: .cancel) {}
            } message: {
                if let problem = RoomKeyFiles.exportProblem(passphrase: passphrase, confirm: confirm), !confirm.isEmpty {
                    Text(L10n.format(problem))
                }
            }
            .alert(String(localized: "settings.roomKeys.importTitle"), isPresented: $importing) {
                SecureField(String(localized: "settings.roomKeys.passphrase"), text: $passphrase)
                Button(String(localized: "settings.roomKeys.importBtn")) { Task { await runImport() } }
                Button(String(localized: "common.cancel"), role: .cancel) {
                    if let importFile { try? FileManager.default.removeItem(at: importFile) }
                }
            }
            .sheet(item: Binding(get: { exported.map { IdentifiedString(id: $0.path) } }, set: { if $0 == nil { cleanExport() } })) { item in
                ShareLink(item: URL(fileURLWithPath: item.id)) {
                    Label(String(localized: "settings.roomKeys.exportBtn"), systemImage: "square.and.arrow.up")
                }
                .padding(WZ.Space.space7)
                .presentationDetents([.height(160)])
            }
    }

    private func export() async {
        if let problem = RoomKeyFiles.exportProblem(passphrase: passphrase, confirm: confirm) {
            status = (L10n.format(problem), true)
            return
        }
        guard let client = session.client else { return }
        busy = true
        defer { busy = false }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("mudrix-room-keys.txt")
        try? FileManager.default.removeItem(at: file)
        do {
            try await client.exportRoomKeys(path: file.path, passphrase: passphrase)
            status = (L10n.format("settings.roomKeys.exportSuccess"), false)
            exported = file
        } catch {
            status = (L10n.format("settings.roomKeys.exportFailed", error.localizedDescription), true)
        }
        passphrase = ""
        confirm = ""
    }

    private func cleanExport() {
        if let exported { try? FileManager.default.removeItem(at: exported) }
        exported = nil
    }

    private func runImport() async {
        guard let client = session.client, let file = importFile else { return }
        busy = true
        defer {
            busy = false
            try? FileManager.default.removeItem(at: file)
            importFile = nil
            passphrase = ""
        }
        do {
            let result = try await client.importRoomKeys(path: file.path, passphrase: passphrase)
            status = (L10n.format("settings.roomKeys.importSuccess", result.imported), false)
        } catch {
            let known = RoomKeyFiles.importErrorKey(error.localizedDescription).map { L10n.format($0) }
            status = (L10n.format("settings.roomKeys.importFailed", known ?? error.localizedDescription), true)
        }
    }
}
