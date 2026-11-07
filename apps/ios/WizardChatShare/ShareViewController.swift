import SwiftUI
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private var files: [URL] = []
    private var sharedText: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = ShareInbox.theme.colorScheme == .dark ? .dark : .light
        let model = ShareModel()
        let host = UIHostingController(rootView: ShareView(model: model, send: { [weak self] room, message in
            self?.send(to: room, message: message)
        }, cancel: { [weak self] in
            self?.extensionContext?.cancelRequest(withError: CocoaError(.userCancelled))
        }))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        Task { await loadAttachments(into: model) }
    }

    private func loadAttachments(into model: ShareModel) async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
               let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                sharedText.append(url.absoluteString)
            } else if let type = [UTType.image, .movie, .data].first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }),
                      type != .data || !provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                      let file = await copy(provider, type: type) {
                files.append(file)
                if type == .image, let image = UIImage(contentsOfFile: file.path) { model.previews.append(image) }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                      let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                sharedText.append(text)
            }
        }
        model.fileCount = files.count
        model.message = sharedText.joined(separator: "\n")
        model.loading = false
    }

    private func copy(_ provider: NSItemProvider, type: UTType) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                guard let url else { continuation.resume(returning: nil); return }
                // The file is only valid inside this callback, so copy it out.
                let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                try? FileManager.default.copyItem(at: url, to: copy)
                continuation.resume(returning: copy)
            }
        }
    }

    private func send(to room: ShareInbox.RoomEntry, message: String) {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try ShareInbox.enqueue(roomId: room.id, text: text.isEmpty ? nil : text, files: files)
        } catch {
            extensionContext?.cancelRequest(withError: error)
            return
        }
        if let url = URL(string: "wizardchat://share?room=\(room.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
            openApp(url)
        }
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// Extensions can't open URLs directly; the app object up the responder chain can.
    private func openApp(_ url: URL) {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = current.next
        }
    }
}

@MainActor
final class ShareModel: ObservableObject {
    @Published var rooms = ShareInbox.loadRooms()
    @Published var previews: [UIImage] = []
    @Published var fileCount = 0
    @Published var message = ""
    @Published var loading = true
}

private struct ShareView: View {
    @ObservedObject var model: ShareModel
    private let colors = ShareInbox.theme.colors
    let send: (ShareInbox.RoomEntry, String) -> Void
    let cancel: () -> Void
    @State private var search = ""
    @State private var selected: ShareInbox.RoomEntry?

    private var rooms: [ShareInbox.RoomEntry] {
        search.isEmpty ? model.rooms : model.rooms.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if !model.previews.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: WZ.Space.space4) {
                                ForEach(model.previews.indices, id: \.self) { index in
                                    Image(uiImage: model.previews[index])
                                        .resizable().scaledToFill()
                                        .frame(width: WZ.SizeAvatar.xl, height: WZ.SizeAvatar.xl)
                                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg))
                                }
                            }
                        }
                    } else if model.fileCount > 0 {
                        Label(L10n.format("share.fileCount", model.fileCount), image: "ph-file-regular")
                    }
                    TextField(String(localized: "share.messagePlaceholder"), text: $model.message, axis: .vertical)
                        .lineLimit(1...5)
                }
                .listRowBackground(colors.bgRaised)
                Section(String(localized: "share.sendTo")) {
                    if model.rooms.isEmpty {
                        Text(String(localized: "share.noRoomsHint"))
                            .foregroundStyle(.secondary)
                    }
                    ForEach(rooms) { room in
                        Button { selected = room } label: {
                            HStack {
                                Image(room.isDirect ? "ph-user-regular" : "ph-hash-straight-regular")
                                    .foregroundStyle(.secondary)
                                    .frame(width: WZ.Space.space8)
                                Text(room.name).foregroundStyle(colors.textPrimary)
                                Spacer()
                                if selected == room { Image("ph-check-bold").foregroundStyle(.tint) }
                            }
                        }
                    }
                }
                .listRowBackground(colors.bgRaised)
            }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: String(localized: "share.searchRooms"))
            .navigationTitle(String(localized: "app.name"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel"), action: cancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.send")) { if let selected { send(selected, model.message) } }
                        .disabled(selected == nil || model.loading
                                  || (model.fileCount == 0 && model.message.trimmingCharacters(in: .whitespaces).isEmpty))
                }
            }
            .scrollContentBackground(.hidden)
            .background(colors.bgApp.ignoresSafeArea())
            .listRowBackground(colors.bgRaised)
            .tint(colors.accentDefault)
        }
        .preferredColorScheme(ShareInbox.theme.colorScheme)
    }
}
