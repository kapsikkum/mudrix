import Foundation

/// One piece of a built-in profile frame, with the picture and the size the web draws it at
struct BuiltinFrameArt: Decodable, Equatable {
    let pos: String
    let layer: String
    let image: String
    let width: Double
    let height: Double
}

/// A built-in nameplate's picture and the palette its strip is tinted with
struct BuiltinNameplateArt: Equatable {
    let image: String
    let palette: String?
}

/// The built-in decorations, nameplates and frames generated from the web app's art by `npm run assets`
enum BuiltinCosmetics {
    /// The generated list the resource bundle carries
    private struct Catalog: Decodable {
        /// One shipped avatar decoration
        struct Decoration: Decodable {
            let id: String
            let image: String
        }

        /// One shipped nameplate and its palette
        struct Nameplate: Decodable {
            let id: String
            let name: String?
            let palette: String?
            let image: String
        }

        /// One shipped profile frame
        struct Frame: Decodable {
            let id: String
            let name: String?
            let pieces: [BuiltinFrameArt]
        }

        let decorations: [Decoration]
        let nameplates: [Nameplate]
        let frames: [Frame]
    }

    private static let catalog: Catalog? = {
        guard let url = Bundle.main.url(forResource: "cosmetics", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }()

    /// The picture of a built-in avatar decoration
    static func decoration(_ id: String) -> String? {
        catalog?.decorations.first { $0.id == id }?.image
    }

    /// The picture and palette of a built-in nameplate
    static func nameplate(_ id: String) -> BuiltinNameplateArt? {
        guard let plate = catalog?.nameplates.first(where: { $0.id == id }) else { return nil }
        return BuiltinNameplateArt(image: plate.image, palette: plate.palette)
    }

    /// The pieces of a built-in profile frame
    static func frame(_ id: String) -> [BuiltinFrameArt] {
        catalog?.frames.first { $0.id == id }?.pieces ?? []
    }
}
