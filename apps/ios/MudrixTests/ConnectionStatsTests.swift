import XCTest
import MudrixCore
@testable import Mudrix

/// Mirrors Android's `matrix/rtc/ConnectionStatsTest` and the web popover's numbers
final class ConnectionStatsTests: XCTestCase {
    private func entry(_ type: String, _ id: String, _ members: [String: Any] = [:]) -> [String: Any] {
        var entry = members
        entry["type"] = type
        entry["id"] = id
        return entry
    }

    private var pair: [String: Any] {
        entry("candidate-pair", "pair", [
            "nominated": true,
            "state": "succeeded",
            "currentRoundTripTime": 0.042,
            "localCandidateId": "local",
        ])
    }

    private var local: [String: Any] {
        entry("local-candidate", "local", ["candidateType": "host", "protocol": "udp"])
    }

    private var codec: [String: Any] { entry("codec", "codec", ["mimeType": "audio/opus"]) }

    private var audio: [String: Any] {
        entry("outbound-rtp", "audio", ["kind": "audio", "bytesSent": 1_000.0, "codecId": "codec"])
    }

    private var serverLoss: [String: Any] { entry("remote-inbound-rtp", "loss", ["fractionLost": 0.05]) }

    private var inbound: [String: Any] {
        entry("inbound-rtp", "in", [
            "kind": "audio",
            "packetsReceived": 900.0,
            "packetsLost": 100.0,
            "jitter": 0.012,
            "bytesReceived": 2_000.0,
        ])
    }

    func testPingTransportLossJitterAndCodecComeFromTheReports() {
        let summary = ConnectionStats.summarise(
            ConnectionStats.Sample(at: 10_000, server: "sfu.example.org",
                                   publisher: [pair, local, codec, audio, serverLoss], subscriber: [inbound]),
            previous: nil)
        XCTAssertEqual(summary.server, "sfu.example.org")
        XCTAssertEqual(summary.ping, 42)
        XCTAssertEqual(summary.transport, "udp")
        XCTAssertEqual(summary.outboundLoss ?? -1, 5.0, accuracy: 0.001)
        XCTAssertEqual(summary.inboundLoss ?? -1, 10.0, accuracy: 0.001)
        XCTAssertEqual(summary.jitter, 12)
        XCTAssertEqual(summary.sendAudio.codec, "opus")
    }

    func testBitratesAreTheDifferenceInBytesBetweenTwoSamples() {
        let first = ConnectionStats.Sample(at: 10_000, publisher: [audio], subscriber: [inbound])
        var secondAudio = audio
        secondAudio["bytesSent"] = 26_000.0
        var secondInbound = inbound
        secondInbound["bytesReceived"] = 14_500.0
        let second = ConnectionStats.Sample(at: 11_000, publisher: [secondAudio], subscriber: [secondInbound])

        let summary = ConnectionStats.summarise(second, previous: first)
        XCTAssertEqual(summary.sendAudio.bitrate ?? -1, 200.0, accuracy: 0.001)
        XCTAssertEqual(summary.receiveBitrate ?? -1, 100.0, accuracy: 0.001)
    }

    func testARelayedPairSaysSoAndAnEmptyReportSaysNothing() {
        var relayedLocal = local
        relayedLocal["candidateType"] = "relay"
        let relayed = ConnectionStats.summarise(
            ConnectionStats.Sample(at: 1, publisher: [pair, relayedLocal, audio]), previous: nil)
        XCTAssertEqual(relayed.transport, "relay (udp)")

        let empty = ConnectionStats.summarise(ConnectionStats.Sample(at: 2), previous: nil)
        XCTAssertNil(empty.ping)
        XCTAssertNil(empty.outboundLoss)
        XCTAssertNil(empty.inboundLoss)
        XCTAssertNil(empty.receiveBitrate)
    }

    func testATransportPointsAtTheSelectedPair() {
        let transport = entry("transport", "transport", ["selectedCandidatePairId": "pair"])
        let summary = ConnectionStats.summarise(
            ConnectionStats.Sample(at: 1, publisher: [transport, pair, local]), previous: nil)
        XCTAssertEqual(summary.ping, 42)
    }
}
