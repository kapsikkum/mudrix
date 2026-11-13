package org.wizardchat.android.matrix.rtc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConnectionStatsTest {
    private fun entry(type: String, id: String, vararg members: Pair<String, Any?>): Map<String, Any?> =
        mapOf("type" to type, "id" to id) + members.toMap()

    private val pair = entry(
        "candidate-pair", "pair",
        "nominated" to true,
        "state" to "succeeded",
        "currentRoundTripTime" to 0.042,
        "localCandidateId" to "local",
    )
    private val local = entry("local-candidate", "local", "candidateType" to "host", "protocol" to "udp")
    private val codec = entry("codec", "codec", "mimeType" to "audio/opus")
    private val audio = entry("outbound-rtp", "audio", "kind" to "audio", "bytesSent" to 1_000.0, "codecId" to "codec")
    private val serverLoss = entry("remote-inbound-rtp", "loss", "fractionLost" to 0.05)
    private val inbound = entry(
        "inbound-rtp", "in",
        "kind" to "audio",
        "packetsReceived" to 900.0,
        "packetsLost" to 100.0,
        "jitter" to 0.012,
        "bytesReceived" to 2_000.0,
    )

    @Test
    fun `ping, transport, loss, jitter and codec come from the reports`() {
        val summary = ConnectionStats.summarise(
            ConnectionStats.Sample(10_000, "sfu.example.org", listOf(pair, local, codec, audio, serverLoss), listOf(inbound)),
            null,
        )
        assertEquals("sfu.example.org", summary.server)
        assertEquals(42, summary.ping)
        assertEquals("udp", summary.transport)
        assertEquals(5.0, summary.outboundLoss!!, 0.001)
        assertEquals(10.0, summary.inboundLoss!!, 0.001)
        assertEquals(12, summary.jitter)
        assertEquals("opus", summary.sendAudio.codec)
    }

    @Test
    fun `bitrates are the difference in bytes between two samples`() {
        val first = ConnectionStats.Sample(10_000, publisher = listOf(audio), subscriber = listOf(inbound))
        val second = ConnectionStats.Sample(
            11_000,
            publisher = listOf(audio + ("bytesSent" to 26_000.0)),
            subscriber = listOf(inbound + ("bytesReceived" to 14_500.0)),
        )
        val summary = ConnectionStats.summarise(second, first)
        assertEquals(200.0, summary.sendAudio.bitrate!!, 0.001)
        assertEquals(100.0, summary.receiveBitrate!!, 0.001)
    }

    @Test
    fun `a relayed pair says so and an empty report says nothing`() {
        val relayed = ConnectionStats.summarise(
            ConnectionStats.Sample(
                1,
                publisher = listOf(pair, local + ("candidateType" to "relay"), audio),
            ),
            null,
        )
        assertEquals("relay (udp)", relayed.transport)
        val empty = ConnectionStats.summarise(ConnectionStats.Sample(2), null)
        assertNull(empty.ping)
        assertNull(empty.outboundLoss)
        assertNull(empty.inboundLoss)
        assertNull(empty.receiveBitrate)
    }
}
