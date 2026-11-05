import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import WizardChatCore

enum QrLogin {
    static func image(base64: String) -> UIImage? {
        guard let data = Data(base64Encoded: base64) else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = data
        filter.correctionLevel = "L"
        guard let code = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let image = CIContext().createCGImage(code, from: code.extent) else { return nil }
        return UIImage(cgImage: image)
    }

    static func bytes(of descriptor: CIQRCodeDescriptor) -> Data? {
        var reader = BitReader(data: descriptor.errorCorrectedPayload)
        guard reader.read(4) == 0b0100 else { return nil }
        let count = reader.read(descriptor.symbolVersion < 10 ? 8 : 16)
        var bytes = Data(capacity: count)
        for _ in 0..<count {
            guard reader.remaining >= 8 else { return nil }
            bytes.append(UInt8(reader.read(8)))
        }
        return bytes
    }

    static func failureMessage(_ error: Error) -> String {
        let message = ((error as? WizardError)?.message ?? error.localizedDescription).lowercased()
        let key: String.LocalizationValue
        if message.range(of: #"check.?code"#, options: .regularExpression) != nil {
            key = "qrLogin.codeMismatch"
        } else if message.range(of: "cancel|declin|denied", options: .regularExpression) != nil {
            key = "qrLogin.failCancelled"
        } else if message.range(of: "expire|timeout|timed out", options: .regularExpression) != nil {
            key = "qrLogin.failExpired"
        } else if message.range(of: "insecure|secure channel", options: .regularExpression) != nil {
            key = "qrLogin.failInsecure"
        } else if message.range(of: "unsupported|not supported|rendezvous|oauth|404", options: .regularExpression) != nil {
            key = "qrLogin.failUnsupported"
        } else if message.contains("already") {
            key = "qrLogin.failAlreadySignedIn"
        } else {
            key = "qrLogin.failGeneric"
        }
        return String(localized: key)
    }

    private struct BitReader {
        let data: Data
        var position = 0
        var remaining: Int { data.count * 8 - position }

        mutating func read(_ bits: Int) -> Int {
            var value = 0
            for _ in 0..<bits where remaining > 0 {
                let byte = data[data.startIndex + position / 8]
                value = value << 1 | Int(byte >> (7 - UInt8(position % 8)) & 1)
                position += 1
            }
            return value
        }
    }
}
