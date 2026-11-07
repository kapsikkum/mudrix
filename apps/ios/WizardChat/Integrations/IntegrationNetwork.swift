import Foundation
import WizardChatCore

/// The only place integrations and link details reach a third-party host (PORT.md section 9, "Outbound network policy").
/// Nothing else under `Integrations` opens a connection, so every rule about outbound requests lives here, the same rules
/// as the web app's `util/integrationFetch.ts` and Android's `IntegrationNetwork`:
///
/// - https only, no credentials in the URL, default port only, never an IP address or a local-looking name (and, as the
///   device can see where a name leads, never a name that resolves to a loopback, private or link-local address);
/// - only hosts in the allow-list the caller passes: what the user approved for that integration, or the one host of the
///   repository address they typed;
/// - no cookies, no referrer, no cache, no credentials (an ephemeral session with nothing stored), and the only headers set
///   are Accept, a JSON Content-Type on a POST and, for a conditional GET, a well-formed If-None-Match;
/// - redirects are never followed by the connection (the task delegate answers every redirect with "do not follow"): each
///   hop is then checked against the same allow-list here, at most three, GET only (a redirect of a POST is refused);
/// - a size cap counted while the body streams, and a timeout for the whole request;
/// - the answer must be what the caller expects: JSON (parsed here), or for the two files a repository needs, the signed
///   repo.json (GitHub serves it as `text/plain`) and its detached signature. Nothing else is accepted, so nothing from an
///   answer is ever markup;
/// - a request nobody asked for (a link card looking something up while a message is on screen) is refused while the
///   blocker is set, which the app uses for streamer mode.
///
/// `fetch` never throws. Headers the system adds itself (User-Agent, Accept-Encoding) are not under its control; icons are
/// never fetched. DNS is checked just before connecting; a name that changes its answer in between is not caught.
final class IntegrationNetwork: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    /// No answer may be bigger than this, whatever the caller asks for
    static let maxResponseBytes = 1024 * 1024
    static let defaultTimeout: TimeInterval = 10
    static let maxTimeout: TimeInterval = 30
    static let maxRedirects = 3
    private static let maxURLLength = 2000
    private static let maxRequestBodyBytes = 64 * 1024
    static let errTooLarge = "file is too large"

    /// What the answer has to be
    enum Expect {
        /// `application/json` or a `+json` type, parsed into `json`
        case json
        /// A repo.json: JSON, but `text/plain` is accepted too
        case jsonFile
        /// A short `text/plain` file, the detached signature of a repo.json, returned in `text`
        case signature

        var accept: String {
            switch self {
            case .json: return "application/json"
            case .jsonFile: return "application/json, text/plain;q=0.9"
            case .signature: return "text/plain"
            }
        }
    }

    enum Reason { case blocked, forbidden, redirect, tooLarge, timeout, type, invalid, network }

    struct Request {
        var url: String
        /// Exact lowercase hostnames this request (and every redirect it follows) may reach
        var allow: [String]
        var expect: Expect
        var maxBytes = IntegrationNetwork.maxResponseBytes
        var timeout = IntegrationNetwork.defaultTimeout
        /// A POST (the one thing a user confirmed). Never redirected.
        var post = false
        /// With `post`: this JSON text as the body
        var jsonBody: String?
        /// A conditional GET: sent as If-None-Match, only if well formed
        var ifNoneMatch: String?
        /// Not started by a user action: refused while the blocker is on
        var passive = false
    }

    struct Success {
        /// The URL that finally answered (after any checked redirect)
        var url: String
        var bytes: Data
        var contentType: String
        /// For `json` and `jsonFile`
        var json: JSONValue?
        /// For `signature`
        var text: String?
        /// Only set for a well-formed entity tag
        var etag: String?
    }

    struct Failure {
        var error: String
        /// Set when the host answered with an HTTP error (or 304 for a conditional GET)
        var status: Int?
        /// Set when no answer arrived at all
        var network = false
        /// Why the app itself refused or gave up, as opposed to the host's answer
        var reason: Reason?
    }

    enum Outcome {
        case success(Success)
        case failure(Failure)
    }

    // MARK: The wire: one request, redirects not followed

    struct WireRequest {
        var method: String
        var url: String
        var headers: [String: String]
        var body: Data?
        var timeout: TimeInterval
    }

    struct WireResponse {
        var status: Int
        /// Header names in lower case
        var headers: [String: String]
        var body: AsyncThrowingStream<Data, Error>?

        init(status: Int, headers: [String: String], body: AsyncThrowingStream<Data, Error>?) {
            self.status = status
            self.headers = Dictionary(headers.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { _, last in last })
            self.body = body
        }
    }

    /// Sends one request. Only the system connection and the tests' fakes implement it.
    typealias Transport = @Sendable (WireRequest) async throws -> WireResponse

    static let shared = IntegrationNetwork()

    private let transport: Transport?

    /// `transport` is only for tests; the app uses `shared`
    init(transport: Transport? = nil) {
        self.transport = transport
        super.init()
    }

    // MARK: The system connection

    /// Every redirect is answered with "do not follow": the task then ends with the 3xx response and `run` decides
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    private func systemSend(_ request: WireRequest) async throws -> WireResponse {
        guard let url = URL(string: request.url), let host = url.host else { throw URLError(.badURL) }
        // Where a name leads is known here, unlike in a browser: a name that points inside the network is refused
        let local = await Task.detached { Self.resolvesToLocalAddress(host) }.value
        if local { throw URLError(.cannotConnectToHost) }

        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.urlCredentialStorage = nil
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.timeoutIntervalForRequest = request.timeout
        config.timeoutIntervalForResource = request.timeout
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config)

        var urlRequest = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: request.timeout)
        urlRequest.httpMethod = request.method
        urlRequest.httpShouldHandleCookies = false
        for (name, value) in request.headers { urlRequest.setValue(value, forHTTPHeaderField: name) }
        urlRequest.httpBody = request.body

        let result: (URLSession.AsyncBytes, URLResponse)
        do {
            result = try await session.bytes(for: urlRequest, delegate: self)
        } catch {
            session.invalidateAndCancel()
            throw error
        }
        let bytes = result.0
        let response = result.1
        guard let http = response as? HTTPURLResponse else {
            session.invalidateAndCancel()
            throw URLError(.badServerResponse)
        }
        var headers: [String: String] = [:]
        for (name, value) in http.allHeaderFields {
            if let name = name as? String, let value = value as? String { headers[name] = value }
        }
        let stream = AsyncThrowingStream<Data, Error> { continuation in
            let task = Task {
                do {
                    var chunk = Data()
                    for try await byte in bytes {
                        chunk.append(byte)
                        if chunk.count >= 8192 {
                            continuation.yield(chunk)
                            chunk = Data()
                        }
                    }
                    if !chunk.isEmpty { continuation.yield(chunk) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
                session.finishTasksAndInvalidate()
            }
            continuation.onTermination = { _ in
                task.cancel()
                session.invalidateAndCancel()
            }
        }
        return WireResponse(status: http.statusCode, headers: headers, body: stream)
    }

    /// Whether a name resolves to a loopback, private, link-local, multicast or unspecified address (or does not resolve)
    static func resolvesToLocalAddress(_ host: String) -> Bool {
        var hints = addrinfo()
        hints.ai_family = AF_UNSPEC
        hints.ai_socktype = SOCK_STREAM
        var found: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, nil, &hints, &found) == 0, let first = found else { return true }
        defer { freeaddrinfo(first) }
        var cursor: UnsafeMutablePointer<addrinfo>? = first
        while let info = cursor {
            if let address = info.pointee.ai_addr {
                if info.pointee.ai_family == AF_INET {
                    let raw = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
                    if isLocalIPv4(withUnsafeBytes(of: raw) { Array($0) }) { return true }
                } else if info.pointee.ai_family == AF_INET6 {
                    let raw = address.withMemoryRebound(to: sockaddr_in6.self, capacity: 1) { $0.pointee.sin6_addr }
                    if isLocalIPv6(withUnsafeBytes(of: raw) { Array($0) }) { return true }
                }
            }
            cursor = info.pointee.ai_next
        }
        return false
    }

    /// `bytes` is the four octets in order
    static func isLocalIPv4(_ bytes: [UInt8]) -> Bool {
        guard bytes.count == 4 else { return true }
        let a = Int(bytes[0]), b = Int(bytes[1])
        return a == 0 || a == 10 || a == 127 || (a == 100 && (64...127).contains(b)) || (a == 169 && b == 254)
            || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168) || a >= 224
    }

    /// `bytes` is the sixteen octets in order
    static func isLocalIPv6(_ bytes: [UInt8]) -> Bool {
        guard bytes.count == 16 else { return true }
        if bytes.allSatisfy({ $0 == 0 }) { return true }
        if bytes[0..<15].allSatisfy({ $0 == 0 }) && bytes[15] == 1 { return true }
        if bytes[0] == 0xFE && (bytes[1] & 0xC0) == 0x80 { return true }
        if (bytes[0] & 0xFE) == 0xFC { return true }
        if bytes[0] == 0xFF { return true }
        // ::ffff:a.b.c.d is that IPv4 address
        if bytes[0..<10].allSatisfy({ $0 == 0 }) && bytes[10] == 0xFF && bytes[11] == 0xFF {
            return isLocalIPv4(Array(bytes[12..<16]))
        }
        return false
    }

    // MARK: The rules

    private static let blockerLock = NSLock()
    private static var passiveIsBlocked = false

    /// While true, requests marked `passive` are refused (streamer mode)
    static func setPassiveBlocked(_ blocked: Bool) {
        blockerLock.lock()
        passiveIsBlocked = blocked
        blockerLock.unlock()
    }

    static var passiveBlocked: Bool {
        blockerLock.lock()
        defer { blockerLock.unlock() }
        return passiveIsBlocked
    }

    /// A strong or weak entity tag as RFC 9110 allows it, kept short; nil for anything else
    static func validEtag(_ value: String?) -> String? {
        guard var rest = value.map({ Substring($0) }) else { return nil }
        if rest.hasPrefix("W/") { rest = rest.dropFirst(2) }
        guard rest.count >= 2, rest.hasPrefix("\""), rest.hasSuffix("\"") else { return nil }
        let inner = rest.dropFirst().dropLast()
        guard inner.unicodeScalars.count <= 190 else { return nil }
        let ok = inner.unicodeScalars.allSatisfy { $0.value == 0x21 || (0x23...0x7E).contains($0.value) }
        return ok ? value : nil
    }

    private static let localSuffixes = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet"]

    /// True for hosts that are never contacted: IP literals, single-label and local-looking names
    static func isForbiddenHost(_ host: String) -> Bool {
        if host.isEmpty || host.hasPrefix("[") || host.contains(":") { return true }
        if host.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == ".") }) { return true }
        if !host.contains(".") || host.hasSuffix(".") { return true }
        return localSuffixes.contains { host.hasSuffix($0) }
    }

    enum URLCheck {
        case ok(url: URL, host: String)
        case refused(String)
    }

    /// Whether this address may be requested for an allow-list. Pure.
    static func checkRequestURL(_ raw: String, allow: [String]) -> URLCheck {
        if raw.count > maxURLLength { return .refused("invalid address") }
        guard let parts = URLComponents(string: raw) else { return .refused("invalid address") }
        guard parts.scheme?.lowercased() == "https" else { return .refused("only https addresses are allowed") }
        if parts.user != nil || parts.password != nil { return .refused("addresses with credentials are not allowed") }
        // The default port only: an approved host on another port is a different service
        if parts.port != nil { return .refused("addresses with a port are not allowed") }
        guard let host = parts.host?.lowercased(), !host.isEmpty else { return .refused("invalid address") }
        if isForbiddenHost(host) { return .refused("\(host) is not allowed") }
        if !allow.contains(host) { return .refused("\(host) is not allowed here") }
        // Rebuilt from the raw parts, so nothing is decoded or re-encoded; the fragment is dropped
        var text = "https://" + host + parts.percentEncodedPath
        if let query = parts.percentEncodedQuery { text += "?" + query }
        guard let url = URL(string: text) else { return .refused("invalid address") }
        return .ok(url: url, host: host)
    }

    /// Resolves a `Location` against the address that answered
    static func resolveRedirect(_ location: String, from base: URL) -> String? {
        URL(string: location, relativeTo: base)?.absoluteURL.absoluteString
    }

    static func contentTypeAllowed(_ expect: Expect, _ type: String) -> Bool {
        let isJson = type == "application/json" || isPlusJson(type)
        switch expect {
        case .json: return isJson
        case .jsonFile: return isJson || type == "text/plain"
        case .signature: return type == "text/plain"
        }
    }

    private static func isPlusJson(_ type: String) -> Bool {
        guard type.hasPrefix("application/"), type.hasSuffix("+json") else { return false }
        let middle = type.dropFirst("application/".count).dropLast("+json".count)
        guard !middle.isEmpty else { return false }
        return middle.unicodeScalars.allSatisfy { ("a"..."z").contains(Character($0)) || ("0"..."9").contains(Character($0)) || $0 == "." || $0 == "+" || $0 == "-" }
    }

    /// The answer as JSON: strict, so a bare word, a trailing comma or a comment is not one
    static func parseJSON(_ text: String) -> JSONValue? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    private static func failure(_ error: String, _ reason: Reason) -> Outcome {
        .failure(Failure(error: error, reason: reason))
    }

    private struct TooLarge: Error {}

    /// Reads the body, giving up as soon as it passes the cap or the time is up
    private static func readCapped(_ body: AsyncThrowingStream<Data, Error>?, max: Int, deadline: Date) async throws -> Data {
        guard let body else { return Data() }
        var out = Data()
        for try await chunk in body {
            if Date() > deadline { throw URLError(.timedOut) }
            if out.count + chunk.count > max { throw TooLarge() }
            out.append(chunk)
        }
        return out
    }

    /// Makes one request under every rule above. Never throws.
    func fetch(_ request: Request) async -> Outcome {
        await run(request)
    }

    private func send(_ request: WireRequest) async throws -> WireResponse {
        if let transport { return try await transport(request) }
        return try await systemSend(request)
    }

    private func run(_ request: Request) async -> Outcome {
        let timeout = min(max(request.timeout, 0.001), Self.maxTimeout)
        let maxBytes = min(max(request.maxBytes, 1), Self.maxResponseBytes)
        let hasBody = request.jsonBody != nil
        let post = request.post || hasBody
        let allow = request.allow.map { $0.lowercased() }
        var current: (url: URL, host: String)
        switch Self.checkRequestURL(request.url, allow: allow) {
        case .ok(let url, let host): current = (url, host)
        case .refused(let error): return Self.failure(error, .forbidden)
        }
        if request.passive && Self.passiveBlocked { return Self.failure("not asking while streamer mode is on", .blocked) }
        let bodyBytes = request.jsonBody.map { Data($0.utf8) }
        if let bodyBytes, bodyBytes.count > Self.maxRequestBodyBytes { return Self.failure("the request is too large", .invalid) }

        var headers: [String: String] = ["Accept": request.expect.accept]
        if hasBody { headers["Content-Type"] = "application/json" }
        if !post, let tag = Self.validEtag(request.ifNoneMatch) { headers["If-None-Match"] = tag }

        let deadline = Date().addingTimeInterval(timeout)
        var hop = 0
        while true {
            let host = current.host
            let response: WireResponse
            do {
                response = try await send(WireRequest(method: post ? "POST" : "GET", url: current.url.absoluteString,
                                                      headers: headers, body: bodyBytes, timeout: timeout))
            } catch let error as URLError where error.code == .timedOut {
                return Self.failure("timed out", .timeout)
            } catch {
                return .failure(Failure(error: "could not \(post ? "reach" : "load") \(host)", network: true, reason: .network))
            }

            if (300...399).contains(response.status) && response.status != 304 {
                response.body?.cancelIfPossible()
                if post { return Self.failure("\(host) answered with a redirect, which is not followed", .redirect) }
                guard let location = response.headers["location"] else {
                    return Self.failure("\(host) answered with a redirect, which is not followed", .redirect)
                }
                if hop >= Self.maxRedirects { return Self.failure("too many redirects", .redirect) }
                guard let next = Self.resolveRedirect(location, from: current.url) else { return Self.failure("invalid redirect", .redirect) }
                switch Self.checkRequestURL(next, allow: allow) {
                case .ok(let url, let nextHost):
                    current = (url, nextHost)
                    hop += 1
                    continue
                case .refused(let error):
                    return Self.failure("redirect refused: \(error)", .redirect)
                }
            }
            if !(200...299).contains(response.status) {
                return .failure(Failure(error: "\(host) answered \(response.status)", status: response.status))
            }
            if let declared = response.headers["content-length"].flatMap({ Int64($0) }), declared > Int64(maxBytes) {
                return .failure(Failure(error: Self.errTooLarge, reason: .tooLarge))
            }
            let contentType = (response.headers["content-type"] ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)
                .first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
            if !Self.contentTypeAllowed(request.expect, contentType) {
                return Self.failure("\(host) did not answer with the expected kind of file", .type)
            }
            let bytes: Data
            do {
                bytes = try await Self.readCapped(response.body, max: maxBytes, deadline: deadline)
            } catch is TooLarge {
                return .failure(Failure(error: Self.errTooLarge, reason: .tooLarge))
            } catch let error as URLError where error.code == .timedOut {
                return Self.failure("timed out", .timeout)
            } catch {
                return .failure(Failure(error: "could not load \(host)", network: true, reason: .network))
            }
            let etag = Self.validEtag(response.headers["etag"])
            guard var text = String(data: bytes, encoding: .utf8) else { return Self.failure("\(host) sent text that is not UTF-8", .invalid) }
            // Like a browser's decoder, a byte order mark is not part of the text
            if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
            if request.expect == .signature {
                return .success(Success(url: current.url.absoluteString, bytes: bytes, contentType: contentType, text: text, etag: etag))
            }
            guard let json = Self.parseJSON(text) else { return Self.failure("\(host) sent an answer that is not JSON", .invalid) }
            return .success(Success(url: current.url.absoluteString, bytes: bytes, contentType: contentType, json: json, etag: etag))
        }
    }
}

private extension AsyncThrowingStream where Element == Data, Failure == Error {
    /// A body nobody will read: a task is waiting on it, so a cancelled iteration ends it
    func cancelIfPossible() {
        let stream = self
        Task { for try await _ in stream { break } }
    }
}
