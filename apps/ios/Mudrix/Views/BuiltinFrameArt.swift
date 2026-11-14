import SwiftUI

/// The generated art of a built-in frame for one layer, placed like the web's frame pieces
struct BuiltinFrameArtLayer: View {
    let pieces: [BuiltinFrameArt]
    let size: CGFloat

    var body: some View {
        ZStack {
            ForEach(Array(pieces.enumerated()), id: \.offset) { _, piece in
                Image(piece.image)
                    .resizable()
                    .frame(width: size, height: height(piece))
                    .offset(y: offset(piece))
            }
        }
        .frame(width: size, height: size)
        .allowsHitTesting(false)
    }

    private func height(_ piece: BuiltinFrameArt) -> CGFloat {
        guard piece.pos != "center", piece.width > 0 else { return size }
        return max(1, size * CGFloat(piece.height / piece.width))
    }

    private func offset(_ piece: BuiltinFrameArt) -> CGFloat {
        let pieceHeight = height(piece)
        switch piece.pos {
        case "top": return -size / 2 - size * 0.2 + pieceHeight / 2
        case "bottom": return size / 2 + size * 0.12 - pieceHeight / 2
        default: return 0
        }
    }
}
