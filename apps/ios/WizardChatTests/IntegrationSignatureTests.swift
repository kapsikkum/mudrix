import CryptoKit
import XCTest
@testable import WizardChat

/// `signature.ts` fixtures, with the RFC 8032 section 7.1 vectors as the known-good signatures
final class IntegrationSignatureTests: XCTestCase {
    typealias Sig = IntegrationSignature

    private func hex(_ text: String) -> Data {
        var out = Data()
        var index = text.startIndex
        while index < text.endIndex {
            let end = text.index(index, offsetBy: 2)
            out.append(UInt8(text[index..<end], radix: 16) ?? 0)
            index = end
        }
        return out
    }

    // RFC 8032 TEST 2: message 0x72
    private var key: String { hex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c").base64EncodedString() }
    private var message: Data { hex("72") }
    private var signature: Data {
        hex("92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00")
    }

    private func flip(_ data: Data, at index: Int) -> Data {
        var copy = data
        copy[index] ^= 1
        return copy
    }

    func testAGoodSignatureVerifiesAndWhitespaceAroundItIsIgnored() {
        XCTAssertTrue(Sig.verify(message, signature: signature.base64EncodedString(), key: key).isOK)
        XCTAssertTrue(Sig.verify(message, signature: "\n \(signature.base64EncodedString())  \n", key: key).isOK)
    }

    func testAnythingElseIsRefused() {
        let sig = signature.base64EncodedString()
        XCTAssertFalse(Sig.verify(flip(message, at: 0), signature: sig, key: key).isOK)
        XCTAssertFalse(Sig.verify(message, signature: flip(signature, at: 10).base64EncodedString(), key: key).isOK)
        let other = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a").base64EncodedString()
        XCTAssertFalse(Sig.verify(message, signature: sig, key: other).isOK)
        XCTAssertFalse(Sig.verify(message, signature: signature.prefix(63).base64EncodedString(), key: key).isOK)
        XCTAssertFalse(Sig.verify(message, signature: "!!not base64!!", key: key).isOK)
        XCTAssertFalse(Sig.verify(message, signature: "", key: key).isOK)
        XCTAssertFalse(Sig.verify(message, signature: sig, key: Data(count: 31).base64EncodedString()).isOK)
        XCTAssertFalse(Sig.verify(message, signature: sig, key: Data(count: 33).base64EncodedString()).isOK)
        XCTAssertFalse(Sig.verify(message, signature: sig, key: "garbage").isOK)
    }

    func testASignatureMadeHereVerifies() throws {
        let pair = Curve25519.Signing.PrivateKey()
        let body = Data(#"{"schema":1,"name":"Sample"}"#.utf8)
        let sig = try pair.signature(for: body)
        let keyText = pair.publicKey.rawRepresentation.base64EncodedString()
        XCTAssertTrue(Sig.verify(body, signature: sig.base64EncodedString(), key: keyText).isOK)
        XCTAssertFalse(Sig.verify(flip(body, at: 3), signature: sig.base64EncodedString(), key: keyText).isOK)
    }

    func testFingerprintAndKeys() {
        let official = Sig.officialKeys[0]
        XCTAssertEqual(Sig.fingerprint(official), "080e ffe6 20f6 a24d fdaf de75 dd9b 8e71")
        XCTAssertEqual(Sig.fingerprint("AAAA"), "")
        XCTAssertNil(Sig.base64ToBytes("AAA"))
        XCTAssertNil(Sig.base64ToBytes("AA=A"))
        XCTAssertEqual(Sig.base64ToBytes("AAAA")?.count, 3)
        XCTAssertTrue(Sig.isValidKey(official))
        XCTAssertTrue(Sig.isOfficialKey(official))
        XCTAssertFalse(Sig.isOfficialKey("BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM="))
    }

    func testSerialsAndKeyChanges() {
        let k1 = "AcV0kn9xQsh7H9G76k7cDoJWRAeAjhhqUTnc2hHw85A="
        let k2 = "BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM="
        XCTAssertTrue(Sig.checkUpdate(previous: (k1, 1), next: (k1, 2)).isOK)
        XCTAssertTrue(Sig.checkUpdate(previous: (k1, 2), next: (k1, 2)).isOK)
        XCTAssertFalse(Sig.checkUpdate(previous: (k1, 3), next: (k1, 2)).isOK)
        XCTAssertEqual(Sig.checkUpdate(previous: (k1, 1), next: (k2, 9)), .failed(Sig.keyChangedError, keyChanged: true))
        XCTAssertTrue(Sig.checkSerial(previous: nil, next: 1).isOK)
        XCTAssertFalse(Sig.checkSerial(previous: 5, next: 4).isOK)
    }
}
