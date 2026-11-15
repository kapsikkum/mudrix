import Foundation
import MudrixCore

/// An image uploaded for a pack, and what its entry needs to know about it
struct UploadedPackImage: Equatable {
    let url: String
    let mimetype: String
    let size: Int
    let width: Int?
    let height: Int?

    /// The image's entry in the pack event
    func entry(shortcode: String) -> [String: Any] {
        var info: [String: Any] = ["mimetype": mimetype, "size": size]
        if let width, let height {
            info["w"] = width
            info["h"] = height
        }
        return ["url": url, "body": shortcode, "info": info]
    }
}

/// What earlier attempts of one batch already uploaded, so a retry or resume sends only what is missing; the
/// `done` map of the web's `uploadFilesPooled`
actor PackUploadLedger {
    private var done: [String: UploadedPackImage] = [:]

    func get(_ key: String) -> UploadedPackImage? { done[key] }

    func set(_ key: String, _ image: UploadedPackImage) { done[key] = image }

    func clear() { done = [:] }

    var count: Int { done.count }
}

/// Bounded-concurrency uploads with retry and resume: the web's `packUpload.ts`
enum PackUpload {
    struct Outcome {
        /// In the order of the input; nil where the upload failed or was cancelled
        var uploaded: [UploadedPackImage?]
        /// A failure message per input index
        var errors: [Int: String]
        var cancelled: Bool

        var failedCount: Int { errors.count }
    }

    /// A shortcode from a file name: letters, digits, `-` and `_` only
    static func shortcode(fromFile fileName: String, fallback: String = "image") -> String {
        var name = fileName
        if let dot = name.lastIndex(of: "."), dot != name.startIndex { name = String(name[..<dot]) }
        let mapped = String(name.lowercased().map { char -> Character in
            (char.isASCII && (char.isLetter || char.isNumber)) || char == "-" || char == "_" ? char : "_"
        })
        var collapsed = ""
        for char in mapped where !(char == "_" && collapsed.last == "_") { collapsed.append(char) }
        let trimmed = collapsed.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return trimmed.isEmpty ? fallback : trimmed
    }

    /// `base`, or `base_2`, `base_3`... when it is taken
    static func uniqueShortcode(_ base: String, taken: Set<String>) -> String {
        if !taken.contains(base) { return base }
        var number = 2
        while taken.contains("\(base)_\(number)") { number += 1 }
        return "\(base)_\(number)"
    }

    static func isRateLimited(_ error: Error) -> Bool {
        if let wizard = error as? WizardError { return wizard.errcode == "M_LIMIT_EXCEEDED" }
        return false
    }

    /// How long to wait before try `attempt` (from 0) after a rate limit: doubling from a second, within 0.25...30 s
    static func retryDelayMs(attempt: Int) -> Int {
        min(max(1000 * (1 << min(attempt, 10)), 250), 30_000)
    }

    /// Retries on a rate limit (`M_LIMIT_EXCEEDED`) up to `attempts` tries; any other error, or a cancel, ends it
    static func withRateLimitRetry<T>(attempts: Int = 4,
                                      sleep: @escaping (Int) async throws -> Void = { try await Task.sleep(for: .milliseconds($0)) },
                                      _ work: () async throws -> T) async throws -> T {
        var attempt = 0
        while true {
            do {
                return try await work()
            } catch {
                guard isRateLimited(error), attempt < attempts - 1, !Task.isCancelled else { throw error }
                try await sleep(retryDelayMs(attempt: attempt))
                attempt += 1
            }
        }
    }

    /// Uploads `keys.count` files, at most `concurrency` at once. A key the ledger already holds is not uploaded
    /// again, which is what makes retry and resume cheap; every success is put in the ledger. Cancelling the
    /// task stops starting new uploads.
    static func run(keys: [String], ledger: PackUploadLedger, concurrency: Int = 4,
                    upload: @escaping @Sendable (Int) async throws -> UploadedPackImage,
                    onProgress: @escaping @Sendable (_ completed: Int, _ total: Int, _ failed: Int) -> Void) async -> Outcome {
        var uploaded = [UploadedPackImage?](repeating: nil, count: keys.count)
        var errors: [Int: String] = [:]
        var completed = 0
        var pending: [Int] = []
        for (index, key) in keys.enumerated() {
            if let hit = await ledger.get(key) {
                uploaded[index] = hit
                completed += 1
            } else {
                pending.append(index)
            }
        }
        onProgress(completed, keys.count, 0)
        await withTaskGroup(of: (Int, UploadedPackImage?, String?).self) { group in
            var cursor = 0
            while cursor < min(max(concurrency, 1), pending.count) {
                let index = pending[cursor]
                cursor += 1
                group.addTask { await attempt(index, upload) }
            }
            for await (index, image, message) in group {
                if let image {
                    uploaded[index] = image
                    await ledger.set(keys[index], image)
                } else if let message {
                    errors[index] = message
                }
                completed += 1
                onProgress(completed, keys.count, errors.count)
                if cursor < pending.count && !Task.isCancelled {
                    let next = pending[cursor]
                    cursor += 1
                    group.addTask { await attempt(next, upload) }
                }
            }
        }
        // A file that never started because of a cancel has neither an image nor an error
        return Outcome(uploaded: uploaded, errors: errors, cancelled: Task.isCancelled)
    }

    private static func attempt(_ index: Int, _ upload: @Sendable (Int) async throws -> UploadedPackImage) async
        -> (Int, UploadedPackImage?, String?) {
        if Task.isCancelled { return (index, nil, nil) }
        do {
            return (index, try await upload(index), nil)
        } catch is CancellationError {
            return (index, nil, nil)
        } catch {
            return (index, nil, Task.isCancelled ? nil : error.localizedDescription)
        }
    }
}
