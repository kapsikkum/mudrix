import Foundation

public final class Runtime: @unchecked Sendable {
    public static let shared = Runtime()

    private let lock = NSLock()
    private var listeners: [UInt64: (String) -> Void] = [:]
    private var nextListener: UInt64 = 1
    private lazy var core = Core(sink: Sink(runtime: self))

    /// An async method; callbacks passed to it only live as long as the call
    public func call<R: Decodable>(_ method: String, this: Remote?, _ args: [Arg]) async throws -> R {
        defer { listenerIds(args).forEach(forget) }
        let reply = try await send(method, this: this, args)
        return try decode(R.self, json: reply.json, blobs: reply.blobs)
    }

    public func watch<S: Subscription>(_ method: String, this: Remote, _ args: [Arg]) -> S {
        let id = listenerIds(args).first ?? 0
        Task {
            do {
                _ = try await send(method, this: this, args)
            } catch {
                self.forget(id)
                print("[wizardchat-core] \(method) failed: \(error)")
            }
        }
        return S(listener: id)
    }

    private func send(_ method: String, this: Remote?, _ args: [Arg]) async throws -> Reply {
        let (json, blobs) = try encode(args)
        do {
            return try await core.call(method: method, this: this?.handle, args: json, blobs: blobs)
        } catch CoreError.Call(let json) {
            throw WizardError(json: json)
        }
    }

    private func listenerIds(_ args: [Arg]) -> [UInt64] {
        args.compactMap { arg in
            if case .listener(let id) = arg { return id }
            return nil
        }
    }

    func release(_ handle: UInt64) {
        core.release(handle: handle)
    }

    func cancel(_ listener: UInt64) {
        forget(listener)
        core.cancel(listener: listener)
    }

    func register<T: Decodable>(_ type: T.Type, _ handler: @escaping @Sendable (T) -> Void) -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        let id = nextListener
        nextListener += 1
        listeners[id] = { [weak self] json in
            guard let self else { return }
            do {
                handler(try self.decode(T.self, json: json, blobs: []))
            } catch {
                print("[wizardchat-core] listener \(id) got \(T.self) it can't read: \(error)")
            }
        }
        return id
    }

    private func forget(_ id: UInt64) {
        lock.lock()
        listeners[id] = nil
        lock.unlock()
    }

    fileprivate func deliver(_ listener: UInt64, _ json: String) {
        lock.lock()
        let handler = listeners[listener]
        lock.unlock()
        guard let handler else { return }
        DispatchQueue.main.async { handler(json) }
    }

    private func encode(_ args: [Arg]) throws -> (String, [Data]) {
        let blobs = BlobCollector()
        let encoder = JSONEncoder()
        encoder.dataEncodingStrategy = .custom { data, encoder in
            var container = encoder.container(keyedBy: AnyKey.self)
            try container.encode(blobs.add(data), forKey: AnyKey("$bytes"))
        }
        let json = try encoder.encode(ArgList(args: args, blobs: blobs))
        return (String(decoding: json, as: UTF8.self), blobs.items)
    }

    func decode<T: Decodable>(_ type: T.Type, json: String, blobs: [Data]) throws -> T {
        let decoder = JSONDecoder()
        decoder.dataDecodingStrategy = .custom { decoder in
            let container = try decoder.container(keyedBy: AnyKey.self)
            let index = try container.decode(Int.self, forKey: AnyKey("$bytes"))
            guard blobs.indices.contains(index) else {
                throw DecodingError.dataCorruptedError(forKey: AnyKey("$bytes"), in: container, debugDescription: "no blob \(index)")
            }
            return blobs[index]
        }
        return try decoder.decode(T.self, from: Data(json.utf8))
    }
}

private final class Sink: EventSink, @unchecked Sendable {
    weak var runtime: Runtime?
    init(runtime: Runtime) { self.runtime = runtime }

    func event(listener: UInt64, json: String) {
        runtime?.deliver(listener, json)
    }
}

private final class BlobCollector: @unchecked Sendable {
    private(set) var items: [Data] = []
    func add(_ data: Data) -> Int {
        items.append(data)
        return items.count - 1
    }
}

private struct ArgList: Encodable {
    let args: [Arg]
    let blobs: BlobCollector

    func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        for arg in args {
            switch arg {
            case .value(let value): try container.encode(AnyEncodable(value))
            case .bytes(let data):
                try container.encode(["$bytes": blobs.add(data)])
            case .listener(let id): try container.encode(id)
            }
        }
    }
}

private struct AnyEncodable: Encodable {
    let value: any Encodable
    init(_ value: any Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}

public enum Arg {
    case value(any Encodable)
    case bytes(Data)
    case listener(UInt64)

    public static func listener<T: Decodable>(_ type: T.Type, _ handler: @escaping @Sendable (T) -> Void) -> Arg {
        .listener(Runtime.shared.register(type, handler))
    }
}

open class Remote: Codable, Hashable, @unchecked Sendable {
    open class var className: String { "Remote" }

    public let handle: UInt64
    public private(set) var props: [String: JSONValue]
    private var session: Subscription?

    public required init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: AnyKey.self)
        handle = try container.decode(UInt64.self, forKey: AnyKey("$handle"))
        props = try container.decodeIfPresent([String: JSONValue].self, forKey: AnyKey("props")) ?? [:]
        if Self.className == "WizardClient" {
            session = Runtime.shared.watch("WizardClient.watchSession", this: self, [
                .listener(JSONValue.self) { [weak self] event in
                    if event["type"] == .string("refreshed"), let session = event["session"] {
                        self?.props["session"] = session
                    }
                },
            ]) as Subscription
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: AnyKey.self)
        try container.encode(handle, forKey: AnyKey("$handle"))
    }

    deinit {
        session?.cancel()
        Runtime.shared.release(handle)
    }

    public func call<R: Decodable>(_ method: String, _ args: [Arg]) async throws -> R {
        try await Runtime.shared.call(method, this: self, args)
    }

    public func watch<S: Subscription>(_ method: String, _ args: [Arg]) -> S {
        Runtime.shared.watch(method, this: self, args)
    }

    public func prop<T: Decodable>(_ name: String) -> T {
        let value = props[name] ?? .null
        do {
            let json = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
            return try Runtime.shared.decode(T.self, json: json, blobs: [])
        } catch {
            fatalError("\(Self.className).\(name) isn't a \(T.self): \(error)")
        }
    }

    public static func == (lhs: Remote, rhs: Remote) -> Bool { lhs.handle == rhs.handle }
    public func hash(into hasher: inout Hasher) { hasher.combine(handle) }
}

open class Subscription: Decodable, @unchecked Sendable {
    public let listener: UInt64
    private var cancelled = false

    public required init(listener: UInt64) {
        self.listener = listener
    }

    public required init(from decoder: Decoder) throws {
        listener = 0
    }

    public func cancel() {
        guard !cancelled, listener != 0 else { return }
        cancelled = true
        Runtime.shared.cancel(listener)
    }
}

public final class RoomListSubscription: Subscription, @unchecked Sendable {
    public func setFilter(_ filter: RoomFilter) {
        let listener = listener
        Task {
            do {
                _ = try await Runtime.shared.call("RoomListSubscription.setFilter", this: nil, [.value(listener), .value(filter)]) as Empty
            } catch {
                print("[wizardchat-core] setFilter failed: \(error)")
            }
        }
    }
}

public struct WizardError: Error, LocalizedError, Decodable, Sendable {
    public let code: String
    public let message: String
    public let errcode: String?

    public init(code: String, message: String, errcode: String? = nil) {
        self.code = code
        self.message = message
        self.errcode = errcode
    }

    init(json: String) {
        let body = try? JSONDecoder().decode(WizardError.self, from: Data(json.utf8))
        code = body?.code ?? "sdk"
        message = body?.message ?? json
        errcode = body?.errcode
    }

    public var errorDescription: String? { message }
}

public struct AnyKey: CodingKey {
    public let stringValue: String
    public init(_ string: String) { stringValue = string }
    public init?(stringValue: String) { self.stringValue = stringValue }
    public var intValue: Int? { nil }
    public init?(intValue: Int) { nil }
}

public struct Empty: Codable, Hashable, Sendable {
    public init() {}
    public init(from decoder: Decoder) throws {}
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encodeNil()
    }
}

public enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let object) = self { return object[key] }
        return nil
    }

    public var string: String? {
        if case .string(let value) = self { return value }
        return nil
    }
}
