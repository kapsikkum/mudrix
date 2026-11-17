import Foundation
import MudrixCore

/// The gallery tag Mudrix puts on each image of a multi-image send so other clients show them as one
/// set: the web's `features/timeline/message/gallery.ts` and Android's `matrix/GalleryTags.kt`.
enum GalleryTags {
    static let key = Namespace.mudrixKey("gallery")
    private static let maxIdLength = 64

    /// Shared by every image sent together
    struct Tag: Equatable {
        let id: String
        let index: Int
        let count: Int
    }

    /// A still picture (GIFs included) can be in a gallery; SVG and anything else cannot
    static func isGalleryImage(_ mimetype: String?) -> Bool {
        guard let mimetype else { return false }
        return mimetype.hasPrefix("image/") && mimetype != "image/svg+xml"
    }

    /// One tag per file, in order: the images of a send with two or more of them, nil for the rest
    static func plan(mimeTypes: [String?], id: String) -> [Tag?] {
        let images = mimeTypes.filter { isGalleryImage($0) }.count
        guard images >= 2, !id.isEmpty, id.count <= maxIdLength else {
            return Array(repeating: nil, count: mimeTypes.count)
        }
        var index = 0
        return mimeTypes.map { type -> Tag? in
            guard isGalleryImage(type) else { return nil }
            let tag = Tag(id: id, index: index, count: images)
            index += 1
            return tag
        }
    }

    /// The content key a tag is sent under, merged into the message
    static func content(_ tag: Tag) -> JSONValue {
        .object([
            key: .object([
                "id": .string(tag.id),
                "index": .number(Double(tag.index)),
                "count": .number(Double(tag.count)),
            ]),
        ])
    }
}
