import XCTest
import WizardChatCore
@testable import WizardChat

/// The one network class, against the web app's `integrationFetch.test.ts` (as on Android)
final class IntegrationNetworkTests: XCTestCase {
    typealias Net = IntegrationNetwork

    override func tearDown() {
        Net.setPassiveBlocked(false)
        super.tearDown()
    }

    private enum Answer {
        case response(status: Int, headers: [String: String], body: Data)
        case fails(Error)
    }

    /// A transport that answers from a script and remembers what it was asked; the last answer repeats
    private final class Scripted: @unchecked Sendable {
        private let lock = NSLock()
        private let answers: [Answer]
        private var seen: [Net.WireRequest] = []

        init(_ answers: Answer...) { self.answers = answers }

        var calls: [Net.WireRequest] {
            lock.lock(); defer { lock.unlock() }
            return seen
        }

        var network: Net {
            Net(transport: { [self] request in
                let next: Answer = {
                    lock.lock(); defer { lock.unlock() }
                    seen.append(request)
                    return answers[min(seen.count - 1, answers.count - 1)]
                }()
                switch next {
                case .fails(let error): throw error
                case .response(let status, let headers, let body):
                    let stream = AsyncThrowingStream<Data, Error> { continuation in
                        if !body.isEmpty { continuation.yield(body) }
                        continuation.finish()
                    }
                    return Net.WireResponse(status: status, headers: headers, body: stream)
                }
            })
        }
    }

    private func answer(_ status: Int = 200, type: String? = "application/json", body: Data = Data(), _ headers: [String: String] = [:]) -> Answer {
        var all = headers
        if let type { all["content-type"] = type }
        return .response(status: status, headers: all, body: body)
    }

    private func json(_ body: String, type: String? = "application/json", _ headers: [String: String] = [:]) -> Answer {
        answer(200, type: type, body: Data(body.utf8), headers)
    }

    private func redirect(_ location: String?, status: Int = 302) -> Answer {
        answer(status, type: nil, body: Data(), location.map { ["location": $0] } ?? [:])
    }

    private func req(_ url: String = "https://api.example.com/v1/things", allow: [String] = ["api.example.com"],
                     expect: Net.Expect = .json, maxBytes: Int = Net.maxResponseBytes, post: Bool = false,
                     jsonBody: String? = nil, ifNoneMatch: String? = nil, passive: Bool = false, timeout: TimeInterval = 10) -> Net.Request {
        Net.Request(url: url, allow: allow, expect: expect, maxBytes: maxBytes, timeout: timeout, post: post,
                    jsonBody: jsonBody, ifNoneMatch: ifNoneMatch, passive: passive)
    }

    private func failure(_ outcome: Net.Outcome, file: StaticString = #filePath, line: UInt = #line) -> Net.Failure {
        guard case .failure(let failure) = outcome else {
            XCTFail("expected a failure", file: file, line: line)
            return Net.Failure(error: "")
        }
        return failure
    }

    private func success(_ outcome: Net.Outcome, file: StaticString = #filePath, line: UInt = #line) -> Net.Success? {
        guard case .success(let success) = outcome else {
            XCTFail("expected a success", file: file, line: line)
            return nil
        }
        return success
    }

    private func isOk(_ check: Net.URLCheck) -> Bool {
        if case .ok = check { return true }
        return false
    }

    func testOnlyHttpsOnAnAllowedHostAndTheDefaultPortIsRequested() {
        let allow = ["api.example.com"]
        XCTAssertTrue(isOk(Net.checkRequestURL("https://api.example.com/x", allow: allow)))
        XCTAssertTrue(isOk(Net.checkRequestURL("https://API.Example.com/x", allow: allow)))
        let bad = [
            "http://api.example.com/x", "ftp://api.example.com/x", "javascript:alert(1)", "data:application/json,{}",
            "blob:https://api.example.com/1", "wss://api.example.com/x", "//api.example.com/x", "api.example.com/x",
            "https://user@api.example.com/x", "https://user:pw@api.example.com/x", "https://api.example.com:8443/x",
            "https://api.example.com:444/x", "https://other.example.com/x", "https://api.example.com.evil.test/x",
            "https://evil.test/https://api.example.com/x", "https://api.example.com./x", "https://127.0.0.1/x",
            "https://[::1]/x", "https://localhost/x", "https://2130706433/x",
        ]
        XCTAssertEqual(bad.filter { isOk(Net.checkRequestURL($0, allow: allow)) }, [])
        XCTAssertFalse(isOk(Net.checkRequestURL("https://api.example.com/x", allow: [])))
        XCTAssertFalse(isOk(Net.checkRequestURL(String(repeating: "x", count: 3000), allow: allow)))
    }

    func testLocalAndPrivateLookingHostsAreNeverAllowedEvenWhenListed() {
        for host in ["localhost", "nas.local", "router.lan", "intranet", "10.0.0.1", "192.168.1.1", "169.254.1.1",
                     "[::1]", "1.2.3.4", "a.b.internal", ""] {
            XCTAssertTrue(Net.isForbiddenHost(host), host)
        }
        XCTAssertFalse(Net.isForbiddenHost("api.example.com"))
        XCTAssertFalse(isOk(Net.checkRequestURL("https://10.0.0.1/x", allow: ["10.0.0.1"])))
        XCTAssertFalse(isOk(Net.checkRequestURL("https://nas.local/x", allow: ["nas.local"])))
    }

    func testResolvedAddressesInsideTheNetworkAreLocal() {
        XCTAssertTrue(Net.isLocalIPv4([127, 0, 0, 1]))
        XCTAssertTrue(Net.isLocalIPv4([10, 1, 2, 3]))
        XCTAssertTrue(Net.isLocalIPv4([172, 16, 0, 1]))
        XCTAssertTrue(Net.isLocalIPv4([100, 64, 0, 1]))
        XCTAssertFalse(Net.isLocalIPv4([172, 32, 0, 1]))
        XCTAssertFalse(Net.isLocalIPv4([93, 184, 216, 34]))
        XCTAssertTrue(Net.isLocalIPv6([UInt8](repeating: 0, count: 15) + [1]))
        XCTAssertTrue(Net.isLocalIPv6([0xFE, 0x80] + [UInt8](repeating: 0, count: 14)))
        XCTAssertTrue(Net.isLocalIPv6([0xFD] + [UInt8](repeating: 1, count: 15)))
        XCTAssertTrue(Net.isLocalIPv6([UInt8](repeating: 0, count: 10) + [0xFF, 0xFF, 10, 0, 0, 1]))
        XCTAssertFalse(Net.isLocalIPv6([0x26, 0x06, 0x47, 0x00] + [UInt8](repeating: 0, count: 11) + [0x11]))
    }

    func testARefusedAddressNeverReachesTheNetwork() async {
        let s = Scripted(json("{}"))
        let a = failure(await s.network.fetch(req("http://api.example.com/x")))
        let b = failure(await s.network.fetch(req("https://evil.example.net/x")))
        XCTAssertEqual(a.reason, .forbidden)
        XCTAssertEqual(b.reason, .forbidden)
        XCTAssertEqual(s.calls.count, 0)
    }

    func testTheRequestCarriesNoCookiesReferrerOrExtraHeaders() async {
        let s = Scripted(json(#"{"a":1}"#))
        let outcome = await s.network.fetch(req())
        XCTAssertNotNil(success(outcome))
        XCTAssertEqual(s.calls[0].method, "GET")
        XCTAssertNil(s.calls[0].body)
        XCTAssertEqual(Array(s.calls[0].headers.keys), ["Accept"])
    }

    func testAConfirmedPostSendsExactlyItsJsonBodyAndNothingElse() async {
        let s = Scripted(json(#"{"url":"https://x.example.com/"}"#))
        let sent = await s.network.fetch(req(post: true, jsonBody: #"{"room":"!r:hs"}"#))
        XCTAssertNotNil(success(sent))
        XCTAssertEqual(s.calls[0].method, "POST")
        XCTAssertEqual(s.calls[0].body.map { String(decoding: $0, as: UTF8.self) }, #"{"room":"!r:hs"}"#)
        XCTAssertEqual(Set(s.calls[0].headers.keys), ["Accept", "Content-Type"])
        let bare = Scripted(json("{}"))
        _ = await bare.network.fetch(req(post: true))
        XCTAssertEqual(bare.calls[0].method, "POST")
        XCTAssertNil(bare.calls[0].body)
        XCTAssertEqual(Array(bare.calls[0].headers.keys), ["Accept"])
        let big = Scripted(json("{}"))
        _ = failure(await big.network.fetch(req(post: true, jsonBody: String(repeating: "x", count: 70_000))))
        XCTAssertEqual(big.calls.count, 0)
    }

    func testOnlyAWellFormedEntityTagIsSentAndOnlyOnAGet() async {
        XCTAssertEqual(Net.validEtag("\"abc\""), "\"abc\"")
        XCTAssertEqual(Net.validEtag("W/\"abc\""), "W/\"abc\"")
        XCTAssertNil(Net.validEtag("abc"))
        XCTAssertNil(Net.validEtag("\"a\r\nX: y\""))
        let get = Scripted(json("{}"))
        _ = await get.network.fetch(req(ifNoneMatch: "\"v1\""))
        XCTAssertEqual(get.calls[0].headers["If-None-Match"], "\"v1\"")
        let bad = Scripted(json("{}"))
        _ = await bad.network.fetch(req(ifNoneMatch: "v1\r\nX: y"))
        XCTAssertNil(bad.calls[0].headers["If-None-Match"])
        let post = Scripted(json("{}"))
        _ = await post.network.fetch(req(post: true, ifNoneMatch: "\"v1\""))
        XCTAssertNil(post.calls[0].headers["If-None-Match"])
    }

    func testARedirectInsideTheAllowListIsFollowedOneOutsideItIsRefused() async {
        let ok = Scripted(redirect("/v2/things"), json(#"{"moved":true}"#))
        let followed = success(await ok.network.fetch(req()))
        XCTAssertEqual(ok.calls[1].url, "https://api.example.com/v2/things")
        XCTAssertEqual(followed?.url, "https://api.example.com/v2/things")

        let two = Scripted(redirect("https://cdn.example.com/x"), json(#"{"cdn":true}"#))
        let crossed = await two.network.fetch(req(allow: ["api.example.com", "cdn.example.com"]))
        XCTAssertNotNil(success(crossed))

        let away = Scripted(redirect("https://evil.example.net/steal"), json("{}"))
        let refused = await away.network.fetch(req())
        XCTAssertEqual(failure(refused).reason, .redirect)
        XCTAssertEqual(away.calls.count, 1)
    }

    func testARedirectToHttpAnotherPortCredentialsOrAnAddressIsRefused() async {
        for target in ["http://api.example.com/x", "https://api.example.com:8443/x", "https://user:pw@api.example.com/x",
                       "https://127.0.0.1/x", "javascript:alert(1)"] {
            let s = Scripted(redirect(target), json("{}"))
            let outcome = await s.network.fetch(req())
            XCTAssertEqual(failure(outcome).reason, .redirect, target)
            XCTAssertEqual(s.calls.count, 1, target)
        }
    }

    func testAMissingLocationAPostRedirectAndARedirectLoopAreRefused() async {
        let none = Scripted(redirect(nil))
        let noneOutcome = await none.network.fetch(req())
        XCTAssertEqual(failure(noneOutcome).reason, .redirect)
        let post = Scripted(redirect("/elsewhere", status: 307), json("{}"))
        let postOutcome = await post.network.fetch(req(post: true, jsonBody: "{}"))
        XCTAssertEqual(failure(postOutcome).reason, .redirect)
        XCTAssertEqual(post.calls.count, 1)
        let loop = Scripted(redirect("/again"))
        let loopOutcome = await loop.network.fetch(req())
        XCTAssertEqual(failure(loopOutcome).reason, .redirect)
        XCTAssertEqual(loop.calls.count, Net.maxRedirects + 1)
    }

    func testAnAnswerOverTheCapIsRefusedByItsDeclaredLengthAndWhileStreaming() async {
        let declared = Scripted(json(#"{"a":"x"}"#, ["content-length": "5000"]))
        let declaredOutcome = await declared.network.fetch(req(maxBytes: 100))
        XCTAssertEqual(failure(declaredOutcome).reason, .tooLarge)
        let streamed = Scripted(json("{\"pad\":\"" + String(repeating: "x", count: 2000) + "\"}"))
        let streamedOutcome = await streamed.network.fetch(req(maxBytes: 100))
        XCTAssertEqual(failure(streamedOutcome).reason, .tooLarge)
        let small = await Scripted(json(#"{"a":1}"#)).network.fetch(req(maxBytes: 100))
        XCTAssertNotNil(success(small))
    }

    func testNothingAbove1MBIsAcceptedWhateverTheCallerAsksFor() async {
        let body = "{\"pad\":\"" + String(repeating: "x", count: Net.maxResponseBytes + 10) + "\"}"
        let outcome = await Scripted(json(body)).network.fetch(req(maxBytes: Net.maxResponseBytes * 10))
        XCTAssertEqual(failure(outcome).reason, .tooLarge)
    }

    func testTheAnswerMustBeJsonUnlessARepositoryFileOrASignatureWasAskedFor() async {
        let ok = success(await Scripted(json(#"{"a":1}"#)).network.fetch(req()))
        XCTAssertEqual(ok?.json, .object(["a": .number(1)]))
        let vendor = await Scripted(json(#"{"a":1}"#, type: "application/vnd.api+json; charset=utf-8")).network.fetch(req())
        XCTAssertNotNil(success(vendor))
        for type in ["text/html", "text/plain", "application/javascript", "image/png", nil] as [String?] {
            let outcome = await Scripted(json(#"{"a":1}"#, type: type)).network.fetch(req())
            XCTAssertEqual(failure(outcome).reason, .type, type ?? "(none)")
        }
        let file = success(await Scripted(json(#"{"a":1}"#, type: "text/plain; charset=utf-8")).network.fetch(req(expect: .jsonFile)))
        XCTAssertEqual(file?.json, .object(["a": .number(1)]))
        let htmlFile = await Scripted(json(#"{"a":1}"#, type: "text/html")).network.fetch(req(expect: .jsonFile))
        XCTAssertEqual(failure(htmlFile).reason, .type)
        let sig = success(await Scripted(json("c2ln", type: "text/plain")).network.fetch(req(expect: .signature)))
        XCTAssertEqual(sig?.text, "c2ln")
        let jsonSig = await Scripted(json(#"{"a":1}"#)).network.fetch(req(expect: .signature))
        XCTAssertEqual(failure(jsonSig).reason, .type)
    }

    func testAJsonAnswerThatDoesNotParseOrIsNotUtf8IsRefused() async {
        let cut = await Scripted(json("{\"a\":")).network.fetch(req())
        XCTAssertEqual(failure(cut).reason, .invalid)
        let script = await Scripted(json("<script>alert(1)</script>")).network.fetch(req())
        XCTAssertEqual(failure(script).reason, .invalid)
        let word = await Scripted(json("nope")).network.fetch(req())
        XCTAssertEqual(failure(word).reason, .invalid)
        let latin1 = answer(200, type: "application/json", body: Data([0x7b, 0x22, 0xe9, 0x22, 0x3a, 0x31, 0x7d]))
        let latin1Outcome = await Scripted(latin1).network.fetch(req())
        XCTAssertEqual(failure(latin1Outcome).reason, .invalid)
    }

    func testAnHttpErrorReportsItsStatusAndA304IsPassedOn() async {
        let missing = failure(await Scripted(answer(404, type: "text/plain", body: Data("nope".utf8))).network.fetch(req()))
        XCTAssertEqual(missing.status, 404)
        XCTAssertTrue(missing.error.contains("api.example.com answered 404"))
        let notModified = failure(await Scripted(answer(304, type: nil)).network.fetch(req(ifNoneMatch: "\"v1\"")))
        XCTAssertEqual(notModified.status, 304)
    }

    func testARequestThatNeverAnswersTimesOutANetworkErrorSaysSo() async {
        let slow = failure(await Scripted(.fails(URLError(.timedOut))).network.fetch(req(timeout: 0.02)))
        XCTAssertEqual(slow.reason, .timeout)
        let down = failure(await Scripted(.fails(URLError(.notConnectedToInternet))).network.fetch(req()))
        XCTAssertTrue(down.network)
        XCTAssertEqual(down.reason, .network)
    }

    func testRequestsNobodyAskedForAreRefusedWhileTheBlockerIsOnAskedOnesAreNot() async {
        let s = Scripted(json(#"{"a":1}"#))
        Net.setPassiveBlocked(true)
        let blocked = await s.network.fetch(req(passive: true))
        XCTAssertEqual(failure(blocked).reason, .blocked)
        XCTAssertEqual(s.calls.count, 0)
        let asked = await s.network.fetch(req())
        XCTAssertNotNil(success(asked))
        Net.setPassiveBlocked(false)
        let unblocked = await s.network.fetch(req(passive: true))
        XCTAssertNotNil(success(unblocked))
    }
}
