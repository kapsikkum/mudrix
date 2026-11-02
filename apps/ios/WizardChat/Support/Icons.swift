import SwiftUI

enum PhosphorWeight: String {
    case thin, light, regular, bold, fill, duotone
}

extension Image {
    static func ph(_ name: String, _ weight: PhosphorWeight = .regular) -> Image {
        Image("ph-\(name)-\(weight.rawValue)")
    }
}

struct Icon: View {
    let name: String
    var weight: PhosphorWeight = .regular
    var size: CGFloat = WZ.SizeIcon.md

    init(_ name: String, _ weight: PhosphorWeight = .regular, size: CGFloat = WZ.SizeIcon.md) {
        self.name = name
        self.weight = weight
        self.size = size
    }

    var body: some View {
        Image.ph(name, weight)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}
