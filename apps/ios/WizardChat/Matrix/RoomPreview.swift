import Foundation
import WizardChatCore

/// The localized words a room list preview is built from
struct RoomPreviewLabels {
    let you: String
    let photo: String
    let video: String
    let audio: String
    let file: String
    let sticker: String
    let poll: String
    let call: String
    let newMessage: String
}

/// The one-line latest-message preview under a room list name
enum RoomPreview {
    /// The preview for `lastMessage` in a direct or group room, or `nil` when there is nothing to show
    static func line(_ lastMessage: LastMessage?, isDirect: Bool,
                     labels: RoomPreviewLabels) -> String? {
        guard let lastMessage else { return nil }
        let text: String
        switch lastMessage.kind {
        case .text:
            let body = lastMessage.body.trimmingCharacters(in: .whitespacesAndNewlines)
            text = body.isEmpty ? labels.newMessage : body
        case .image: text = labels.photo
        case .video: text = labels.video
        case .audio: text = labels.audio
        case .file: text = labels.file
        case .sticker: text = labels.sticker
        case .poll: text = labels.poll
        case .call: text = labels.call
        case .other: text = labels.newMessage
        }
        let sender: String?
        if lastMessage.isOwn {
            sender = labels.you
        } else if isDirect {
            sender = nil
        } else {
            let name = lastMessage.senderName?.trimmingCharacters(in: .whitespacesAndNewlines)
            sender = name?.isEmpty == false ? name : nil
        }
        guard let sender else { return text }
        return "\(sender): \(text)"
    }
}
