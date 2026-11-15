import Foundation
import LiveKit

/// The numbers a call's connection info shows, summarised from LiveKit's WebRTC stats the way the web popover reads
/// them: the selected candidate pair for ping and transport, loss from the reports, and byte counters for bitrates.
enum ConnectionStats {
    /// One stats report's entries: each entry's members, with its `type` among them, taken at `at` (ms)
    struct Sample {
        let at: Int64
        let server: String?
        let publisher: [[String: Any]]
        let subscriber: [[String: Any]]

        init(at: Int64, server: String? = nil, publisher: [[String: Any]] = [], subscriber: [[String: Any]] = []) {
            self.at = at
            self.server = server
            self.publisher = publisher
            self.subscriber = subscriber
        }
    }

    struct Stream: Equatable {
        var codec: String?
        var bitrate: Double?
        var resolution: String?
        var fps: Double?

        init(codec: String? = nil, bitrate: Double? = nil, resolution: String? = nil, fps: Double? = nil) {
            self.codec = codec
            self.bitrate = bitrate
            self.resolution = resolution
            self.fps = fps
        }
    }

    struct Summary {
        var server: String?
        /// Round trip to the server, ms
        var ping: Int?
        /// `udp`, `tcp` or `relay (turn)`
        var transport: String?
        var outboundLoss: Double?
        var inboundLoss: Double?
        /// Inbound audio jitter, ms
        var jitter: Int?
        var sendAudio = Stream()
        var sendVideo = Stream()
        /// kbit/s
        var receiveBitrate: Double?
    }

    private static func num(_ value: Any?) -> Double? {
        guard let number = (value as? NSNumber)?.doubleValue, number.isFinite else { return nil }
        return number
    }

    private static func entryType(_ entry: [String: Any]) -> String? { entry["type"] as? String }

    private static func selectedPair(_ entries: [[String: Any]]) -> [String: Any]? {
        if let transport = entries.first(where: { entryType($0) == "transport" && $0["selectedCandidatePairId"] != nil }),
           let id = transport["selectedCandidatePairId"] as? String {
            return entries.first { $0["id"] as? String == id }
        }
        return entries.first {
            entryType($0) == "candidate-pair" && ($0["nominated"] as? Bool) == true
                && ($0["state"] as? String) == "succeeded"
        }
    }

    private static func codecName(_ entries: [[String: Any]], codecId: Any?) -> String? {
        guard let codecId = codecId as? String,
              let codec = entries.first(where: { $0["id"] as? String == codecId }),
              let mime = codec["mimeType"] as? String else { return nil }
        return mime.split(separator: "/", maxSplits: 1).last.map(String.init) ?? mime
    }

    /// Sum of `field` over the entries matching `pick`, keyed so a previous sample can be diffed
    private static func sumBytes(_ entries: [[String: Any]], pick: ([String: Any]) -> Bool,
                                 field: String) -> [String: Double] {
        var totals: [String: Double] = [:]
        for entry in entries where pick(entry) {
            totals[(entry["id"] as? String) ?? ""] = num(entry[field]) ?? 0
        }
        return totals
    }

    /// kbit/s between two byte counters; streams that only appear in one sample are skipped
    private static func rate(_ now: [String: Double], _ before: [String: Double]?, seconds: Double) -> Double? {
        guard let before, seconds > 0 else { return nil }
        var bytes = 0.0
        for (key, value) in now {
            if let previous = before[key], value >= previous { bytes += value - previous }
        }
        return bytes * 8 / 1000 / seconds
    }

    private static func outbound(_ sample: Sample, _ previous: Sample?, kind: String) -> Stream {
        let pick: ([String: Any]) -> Bool = { entryType($0) == "outbound-rtp" && ($0["kind"] as? String) == kind }
        let seconds = previous.map { Double(sample.at - $0.at) / 1000 } ?? 0
        let bitrate = rate(
            sumBytes(sample.publisher, pick: pick, field: "bytesSent"),
            previous.map { sumBytes($0.publisher, pick: pick, field: "bytesSent") },
            seconds: seconds)
        var codec: String?
        var best: [String: Any]?
        for entry in sample.publisher where pick(entry) {
            if codec == nil { codec = codecName(sample.publisher, codecId: entry["codecId"]) }
            if (num(entry["frameWidth"]) ?? 0) > (num(best?["frameWidth"]) ?? -1) { best = entry }
        }
        let width = num(best?["frameWidth"])
        let height = num(best?["frameHeight"])
        var resolution: String?
        if let width, let height { resolution = "\(Int(width))×\(Int(height))" }
        return Stream(codec: codec,
                      bitrate: bitrate,
                      resolution: resolution,
                      fps: num(best?["framesPerSecond"]))
    }

    static func summarise(_ sample: Sample, previous: Sample?) -> Summary {
        var summary = Summary()
        summary.server = sample.server

        // Ping comes from the publishing pair, which carries our media, or the subscriber's otherwise
        for entries in [sample.publisher, sample.subscriber] {
            guard let pair = selectedPair(entries), let rtt = num(pair["currentRoundTripTime"]) else { continue }
            summary.ping = Int((rtt * 1000).rounded())
            let local = entries.first { $0["id"] as? String == pair["localCandidateId"] as? String }
            let relay = (local?["candidateType"] as? String) == "relay"
            let proto = local?["protocol"] as? String
            summary.transport = relay ? "relay (\(proto ?? "turn"))" : proto
            break
        }

        // Outbound loss as the server reports it back
        let fractions = sample.publisher
            .filter { entryType($0) == "remote-inbound-rtp" }
            .compactMap { num($0["fractionLost"]) }
        summary.outboundLoss = fractions.max().map { $0 * 100 }

        let inbound = sample.subscriber.filter { entryType($0) == "inbound-rtp" }
        let received = inbound.reduce(0.0) { $0 + (num($1["packetsReceived"]) ?? 0) }
        let lost = inbound.reduce(0.0) { $0 + max(num($1["packetsLost"]) ?? 0, 0) }
        summary.inboundLoss = received + lost > 0 ? lost / (received + lost) * 100 : nil
        let jitters = inbound
            .filter { ($0["kind"] as? String) == "audio" }
            .compactMap { num($0["jitter"]) }
        summary.jitter = jitters.isEmpty ? nil : Int(((jitters.reduce(0, +) / Double(jitters.count)) * 1000).rounded())

        let seconds = previous.map { Double(sample.at - $0.at) / 1000 } ?? 0
        let pick: ([String: Any]) -> Bool = { entryType($0) == "inbound-rtp" }
        summary.receiveBitrate = rate(
            sumBytes(sample.subscriber, pick: pick, field: "bytesReceived"),
            previous.map { sumBytes($0.subscriber, pick: pick, field: "bytesReceived") },
            seconds: seconds)

        summary.sendAudio = outbound(sample, previous, kind: "audio")
        summary.sendVideo = outbound(sample, previous, kind: "video")
        return summary
    }
}

// MARK: - LiveKit reports

extension ConnectionStats {
    /// One WebRTC stats report flattened into the entries `summarise` reads, in the same shape the web and the
    /// Android app get from LiveKit's raw report.
    static func report(from statistics: TrackStatistics) -> [[String: Any]] {
        var entries: [[String: Any]] = []

        if let transport = statistics.transportStats {
            var entry: [String: Any] = ["type": "transport", "id": transport.id]
            if let pair = transport.selectedCandidatePairId { entry["selectedCandidatePairId"] = pair }
            entries.append(entry)
        }
        for pair in statistics.iceCandidatePair {
            var entry: [String: Any] = ["type": "candidate-pair", "id": pair.id]
            if let state = pair.state { entry["state"] = state.rawValue }
            if let nominated = pair.nominated { entry["nominated"] = nominated }
            if let rtt = pair.currentRoundTripTime { entry["currentRoundTripTime"] = rtt }
            if let local = pair.localCandidateId { entry["localCandidateId"] = local }
            entries.append(entry)
        }
        if let candidate = statistics.localIceCandidate {
            var entry: [String: Any] = ["type": "local-candidate", "id": candidate.id]
            if let type = candidate.candidateType { entry["candidateType"] = type.rawValue }
            if let proto = candidate.`protocol` { entry["protocol"] = proto }
            entries.append(entry)
        }
        for codec in statistics.codec {
            var entry: [String: Any] = ["type": "codec", "id": codec.id]
            if let mime = codec.mimeType { entry["mimeType"] = mime }
            entries.append(entry)
        }
        for stream in statistics.outboundRtpStream {
            var entry: [String: Any] = ["type": "outbound-rtp", "id": stream.id]
            if let kind = stream.kind { entry["kind"] = kind }
            if let bytes = stream.bytesSent { entry["bytesSent"] = Double(bytes) }
            if let codecId = stream.codecId { entry["codecId"] = codecId }
            if let width = stream.frameWidth { entry["frameWidth"] = Double(width) }
            if let height = stream.frameHeight { entry["frameHeight"] = Double(height) }
            if let fps = stream.framesPerSecond { entry["framesPerSecond"] = fps }
            entries.append(entry)
        }
        for stream in statistics.remoteInboundRtpStream {
            var entry: [String: Any] = ["type": "remote-inbound-rtp", "id": stream.id]
            if let fraction = stream.fractionLost { entry["fractionLost"] = fraction }
            entries.append(entry)
        }
        for stream in statistics.inboundRtpStream {
            var entry: [String: Any] = ["type": "inbound-rtp", "id": stream.id]
            if let kind = stream.kind { entry["kind"] = kind }
            if let packets = stream.packetsReceived { entry["packetsReceived"] = Double(packets) }
            if let lost = stream.packetsLost { entry["packetsLost"] = Double(lost) }
            if let jitter = stream.jitter { entry["jitter"] = jitter }
            if let bytes = stream.bytesReceived { entry["bytesReceived"] = Double(bytes) }
            entries.append(entry)
        }
        return entries
    }
}
