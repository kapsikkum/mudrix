import Foundation

/// Where the background upload of a composer attachment is
enum UploadStatus: Equatable {
    case uploading
    case done
    case failed
}

/// One attachment's background upload: what it is doing and how far it got
struct UploadState: Equatable {
    var status: UploadStatus
    var progress: Double
}

/// Tracks the background uploads of a composer's attachments so a send can reuse them, like the web's
/// `attachmentUploads.ts` and Android's `matrix/ComposerUploads.kt`. Nothing here talks to the network,
/// so it runs in unit tests.
final class ComposerUploads {
    /// What sending does with one attachment: reuse what is uploaded, wait for it, or upload it now
    enum SendPlan: Equatable {
        case reuse
        case wait
        case upload
    }

    private var states: [UUID: UploadState] = [:]
    private var tokens: [UUID: Int] = [:]
    private var lastToken = 0

    /// Starts the upload of `id` and returns its token, which keeps an older attempt's result out
    @discardableResult
    func start(_ id: UUID) -> Int {
        lastToken += 1
        tokens[id] = lastToken
        states[id] = UploadState(status: .uploading, progress: 0)
        return lastToken
    }

    /// Starts a failed upload again; nil when it never failed or is still running
    func retry(_ id: UUID) -> Int? {
        guard states[id]?.status == .failed else { return nil }
        return start(id)
    }

    /// Records how far an upload got; a late call from an older attempt is ignored
    func progress(_ id: UUID, token: Int, fraction: Double) {
        guard tokens[id] == token else { return }
        states[id] = UploadState(status: .uploading, progress: min(max(fraction, 0), 1))
    }

    /// Marks the upload finished, with its file ready to send
    func finish(_ id: UUID, token: Int) {
        guard tokens[id] == token else { return }
        states[id] = UploadState(status: .done, progress: 1)
    }

    /// Marks the upload failed, to be tried again when it is sent or by hand
    func fail(_ id: UUID, token: Int) {
        guard tokens[id] == token else { return }
        states[id] = UploadState(status: .failed, progress: 0)
    }

    /// Forgets the upload (removed, sent, or the room left): a result arriving later is ignored
    func forget(_ id: UUID) {
        states.removeValue(forKey: id)
        lastToken += 1
        tokens[id] = lastToken
    }

    /// The upload's state, or nil when it has none
    func state(_ id: UUID) -> UploadState? {
        states[id]
    }

    /// Whether `token` is the attempt this attachment is still waiting for
    func isCurrent(_ id: UUID, token: Int) -> Bool {
        tokens[id] == token
    }

    /// What sending does with the attachment
    func plan(_ id: UUID) -> SendPlan {
        switch states[id]?.status {
        case .done: return .reuse
        case .uploading: return .wait
        case .failed, nil: return .upload
        }
    }

    /// Every tracked upload, for drawing the tray
    func snapshot() -> [UUID: UploadState] {
        states
    }

    // MARK: Rules

    /// Whether an attachment's bytes are final when it is added, so it can upload before it is sent
    /// (the web's `useComposer` rule)
    static func canPreupload(size: Int64, maxUploadBytes: Int64, hasVideoTarget: Bool,
                             imageWillProcess: Bool) -> Bool {
        size <= maxUploadBytes && !hasVideoTarget && !imageWillProcess
    }

    /// Whether the photo settings would rewrite these bytes (only JPEG and PNG are ever cleaned or
    /// scaled, like the web's `willProcessImage`)
    static func imageWillProcess(mimetype: String?, options: ImagePrep.Options?) -> Bool {
        guard let options, mimetype == "image/jpeg" || mimetype == "image/png" else { return false }
        return options.stripMetadata || options.maxSide != nil
    }
}
