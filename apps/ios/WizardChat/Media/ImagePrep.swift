import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Removes the metadata from a JPEG or PNG and/or scales it down before it is sent, like the web's
/// `util/imageSanitize.ts` and Android's `ImagePrep.kt`. The metadata is cut out of the bytes
/// (`ImageStrip`) when that leaves the picture exactly as it was; otherwise (a JPEG that relies on its
/// EXIF orientation, or one that is scaled) the picture is drawn again with ImageIO, upright and
/// without any metadata. Other formats (GIF, WebP, ...) are never touched. iPhone photos are often
/// HEIC, which carries the same details, so with these options on a HEIC photo is sent as a JPEG.
enum ImagePrep {
    /// `stripMetadata` removes location, camera and other embedded details; `maxSide` is the longest side
    /// a bigger photo is scaled to (nil keeps the size)
    struct Options: Equatable {
        var stripMetadata: Bool
        var maxSide: Int?
    }

    enum Format {
        case jpeg
        case png
    }

    struct Prepared {
        var data: Data
        /// "jpg" when a HEIC photo was turned into a JPEG; nil keeps the file's own name
        var fileExtension: String?
    }

    struct PrepareError: Error {}

    private static let jpegQuality = 0.86

    /// A scaled-down copy is only worth sending if it saves at least this much
    private static let minSaving = 0.05

    private static let heifBrands: Set<String> = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"]

    /// The format of `bytes` when it is one this cuts and draws
    static func formatOf(_ bytes: [UInt8]) -> Format? {
        if bytes.count > 3 && bytes[0] == 0xff && bytes[1] == 0xd8 { return .jpeg }
        if bytes.count > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47 { return .png }
        return nil
    }

    private static func isHeif(_ bytes: [UInt8]) -> Bool {
        guard bytes.count > 12, ImageStrip.ascii(bytes, 4, 4) == "ftyp" else { return false }
        return heifBrands.contains(ImageStrip.ascii(bytes, 8, 4))
    }

    /// The bytes to send for `data`: the same bytes when nothing has to change. Throws when the
    /// metadata has to go and that cannot be done, so the photo is never sent with its details.
    static func prepare(_ data: Data, _ options: Options) throws -> Prepared {
        let unchanged = Prepared(data: data, fileExtension: nil)
        guard options.stripMetadata || options.maxSide != nil else { return unchanged }
        let bytes = [UInt8](data)
        guard let format = formatOf(bytes) else { return try prepareHeif(data, bytes, options) }
        let jpeg = format == .jpeg

        // Drawing an animated PNG again would keep only its first frame, so it is only ever cut, never redrawn
        let animated = !jpeg && ImageStrip.isAnimatedPng(bytes)
        if animated && !options.stripMetadata { return unchanged }
        let limit = options.maxSide ?? 0
        let scaleDown = !animated && options.maxSide != nil && longestSide(data) > limit
        let type: UTType = jpeg ? .jpeg : .png

        var drawn: Data?
        if scaleDown {
            do {
                drawn = try redraw(data, as: type, maxSide: options.maxSide)
            } catch {
                // A failed resize sends the original; a failed strip must not
                if options.stripMetadata { throw error }
            }
        } else if options.stripMetadata {
            var cut: Data?
            if jpeg {
                if let stripped = ImageStrip.stripJpeg(bytes) {
                    // Without its EXIF orientation a rotated photo would show sideways, so it is drawn upright
                    if stripped.orientation == 1 { cut = Data(stripped.data) }
                }
            } else if let stripped = ImageStrip.stripPng(bytes) {
                cut = Data(stripped)
            }
            if animated && cut == nil { throw PrepareError() }
            if let cut {
                drawn = cut
            } else {
                drawn = try redraw(data, as: type, maxSide: nil)
            }
        }
        guard let result = drawn else { return unchanged }
        // A scaled copy that isn't clearly smaller isn't worth it, unless the metadata had to go anyway
        if !options.stripMetadata && Double(result.count) > Double(data.count) * (1 - minSaving) { return unchanged }
        return Prepared(data: result, fileExtension: nil)
    }

    private static func prepareHeif(_ data: Data, _ bytes: [UInt8], _ options: Options) throws -> Prepared {
        let unchanged = Prepared(data: data, fileExtension: nil)
        guard isHeif(bytes) else { return unchanged }
        let limit = options.maxSide ?? 0
        let scaleDown = options.maxSide != nil && longestSide(data) > limit
        guard options.stripMetadata || scaleDown else { return unchanged }
        do {
            let drawn = try redraw(data, as: .jpeg, maxSide: options.maxSide)
            return Prepared(data: drawn, fileExtension: "jpg")
        } catch {
            if options.stripMetadata { throw error }
            return unchanged
        }
    }

    private static func pixelSize(_ data: Data) -> (width: Int, height: Int)? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? Int,
              let height = props[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0 else { return nil }
        return (width, height)
    }

    private static func longestSide(_ data: Data) -> Int {
        guard let size = pixelSize(data) else { return 0 }
        return max(size.width, size.height)
    }

    /// Draws the picture again, upright and at most `maxSide` on its long side; nothing else survives
    private static func redraw(_ data: Data, as type: UTType, maxSide: Int?) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let size = pixelSize(data) else { throw PrepareError() }
        let longest = max(size.width, size.height)
        let target = min(longest, maxSide ?? longest)
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: target,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else {
            throw PrepareError()
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output as CFMutableData, type.identifier as CFString, 1, nil) else {
            throw PrepareError()
        }
        let quality: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: jpegQuality]
        CGImageDestinationAddImage(destination, image, quality as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw PrepareError() }
        return output as Data
    }
}
