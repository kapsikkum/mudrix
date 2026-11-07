import Foundation

/// Lossless metadata stripping for JPEG and PNG, on raw bytes, the same rules as the web's
/// `util/imageStrip.ts` and Android's `ImageStrip.kt`. A JPEG loses its Exif, XMP, IPTC and comment
/// segments (APPn except ICC profile and Adobe, COM) up to the start of scan; a PNG loses eXIf,
/// tEXt, zTXt, iTXt and tIME chunks. The EXIF orientation is reported so the caller can redraw a
/// rotated photo upright instead.
enum ImageStrip {
    struct Jpeg {
        let data: [UInt8]
        let orientation: Int
    }

    private static let pngSignature: [UInt8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

    /// PNG chunks that carry text, EXIF or timestamps rather than picture data
    private static let pngMetadataChunks: Set<String> = ["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]

    /// The bytes from `start` as text, one character per byte (ISO 8859-1)
    static func ascii(_ bytes: [UInt8], _ start: Int, _ length: Int) -> String {
        let end = min(bytes.count, start + length)
        if start >= end { return "" }
        var text = ""
        for index in start..<end {
            text.unicodeScalars.append(Unicode.Scalar(bytes[index]))
        }
        return text
    }

    private static func u8(_ bytes: [UInt8], _ at: Int) -> Int {
        at >= 0 && at < bytes.count ? Int(bytes[at]) : 0
    }

    private static func u16(_ bytes: [UInt8], _ at: Int, little: Bool) -> Int {
        if little { return u8(bytes, at) | (u8(bytes, at + 1) << 8) }
        return (u8(bytes, at) << 8) | u8(bytes, at + 1)
    }

    private static func u32(_ bytes: [UInt8], _ at: Int, little: Bool) -> Int {
        let high = u16(bytes, little ? at + 2 : at, little: little)
        let low = u16(bytes, little ? at : at + 2, little: little)
        return (high << 16) | low
    }

    private static func isPng(_ bytes: [UInt8]) -> Bool {
        guard bytes.count >= 20 else { return false }
        for index in 0..<pngSignature.count where bytes[index] != pngSignature[index] {
            return false
        }
        return true
    }

    /// The EXIF orientation (1-8) from the data of an APP1 "Exif" segment, or 1 when there is none
    private static func readOrientation(_ segment: [UInt8]) -> Int {
        // "Exif\0\0" then a TIFF header
        let tiff = 6
        if segment.count < tiff + 8 { return 1 }
        let little = ascii(segment, tiff, 2) == "II"
        let ifd = tiff + u32(segment, tiff + 4, little: little)
        if ifd + 2 > segment.count { return 1 }
        let count = u16(segment, ifd, little: little)
        for index in 0..<count {
            let entry = ifd + 2 + index * 12
            if entry + 12 > segment.count { break }
            if u16(segment, entry, little: little) == 0x0112 { return u16(segment, entry + 8, little: little) }
        }
        return 1
    }

    /// Cuts the Exif, XMP, IPTC and comment segments out of a JPEG without touching the picture. Colour
    /// profiles and the markers a decoder needs stay. Nil if the file isn't a JPEG this can read.
    static func stripJpeg(_ bytes: [UInt8]) -> Jpeg? {
        if bytes.count < 4 || u8(bytes, 0) != 0xff || u8(bytes, 1) != 0xd8 { return nil }
        var out: [UInt8] = []
        out.reserveCapacity(bytes.count)
        out.append(contentsOf: bytes[0..<2])
        var orientation = 1
        var pos = 2
        while pos + 4 <= bytes.count {
            if u8(bytes, pos) != 0xff { return nil }
            let marker = u8(bytes, pos + 1)
            if marker == 0xff {
                pos += 1
                continue
            }
            if marker == 0xda {
                // Start of scan: the rest is picture data
                out.append(contentsOf: bytes[pos..<bytes.count])
                return Jpeg(data: out, orientation: orientation)
            }
            if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd8) {
                out.append(contentsOf: bytes[pos..<(pos + 2)])
                pos += 2
                continue
            }
            let end = pos + 2 + ((u8(bytes, pos + 2) << 8) | u8(bytes, pos + 3))
            if end > bytes.count { return nil }
            let body: [UInt8] = end > pos + 4 ? Array(bytes[(pos + 4)..<end]) : []
            var keep = true
            if marker == 0xe1 && ascii(body, 0, 6) == "Exif\u{0}\u{0}" {
                orientation = readOrientation(body)
                keep = false
            } else if marker == 0xe2 {
                keep = ascii(body, 0, 12) == "ICC_PROFILE\u{0}"
            } else if marker == 0xee {
                keep = ascii(body, 0, 5) == "Adobe"
            } else if marker == 0xfe || (marker >= 0xe1 && marker <= 0xef) {
                keep = false
            }
            if keep { out.append(contentsOf: bytes[pos..<end]) }
            pos = end
        }
        return nil
    }

    /// Whether a PNG is animated (APNG): it has an animation control chunk before its picture data
    static func isAnimatedPng(_ bytes: [UInt8]) -> Bool {
        if !isPng(bytes) { return false }
        var pos = 8
        while pos + 12 <= bytes.count {
            let type = ascii(bytes, pos + 4, 4)
            if type == "acTL" { return true }
            if type == "IDAT" || type == "IEND" { return false }
            pos += 12 + u32(bytes, pos, little: false)
        }
        return false
    }

    /// Cuts the text, EXIF and timestamp chunks out of a PNG. Nil if it isn't a PNG this can read
    static func stripPng(_ bytes: [UInt8]) -> [UInt8]? {
        if !isPng(bytes) { return nil }
        var out: [UInt8] = []
        out.reserveCapacity(bytes.count)
        out.append(contentsOf: bytes[0..<8])
        var pos = 8
        while pos + 12 <= bytes.count {
            let end = pos + 12 + u32(bytes, pos, little: false)
            if end > bytes.count { return nil }
            let type = ascii(bytes, pos + 4, 4)
            if !pngMetadataChunks.contains(type) { out.append(contentsOf: bytes[pos..<end]) }
            pos = end
            if type == "IEND" { return out }
        }
        return nil
    }
}
