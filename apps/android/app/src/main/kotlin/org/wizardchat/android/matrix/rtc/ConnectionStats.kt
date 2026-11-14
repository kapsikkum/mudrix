package org.wizardchat.android.matrix.rtc

/**
 * The numbers a call's connection info shows, summarised from LiveKit's WebRTC stats the way the web popover reads
 * them: the selected candidate pair for ping and transport, loss from the reports, and byte counters for bitrates.
 */
object ConnectionStats {
    /** One report's entries: each entry's members, with its `type` among them, taken at `at` (ms) */
    data class Sample(
        val at: Long,
        val server: String? = null,
        val publisher: List<Map<String, Any?>> = emptyList(),
        val subscriber: List<Map<String, Any?>> = emptyList(),
    )

    data class Stream(val codec: String? = null, val bitrate: Double? = null, val resolution: String? = null, val fps: Double? = null)

    data class Summary(
        val server: String? = null,
        /** Round trip to the server, ms */
        val ping: Int? = null,
        /** `udp`, `tcp` or `relay (turn)` */
        val transport: String? = null,
        val outboundLoss: Double? = null,
        val inboundLoss: Double? = null,
        /** Inbound audio jitter, ms */
        val jitter: Int? = null,
        val sendAudio: Stream = Stream(),
        val sendVideo: Stream = Stream(),
        /** kbit/s */
        val receiveBitrate: Double? = null,
    )

    private fun num(value: Any?): Double? =
        (value as? Number)?.toDouble()?.takeIf { it.isFinite() }

    private fun typeOf(entry: Map<String, Any?>): String? = entry["type"] as? String

    private fun selectedPair(entries: List<Map<String, Any?>>): Map<String, Any?>? {
        val transport = entries.firstOrNull { typeOf(it) == "transport" && it["selectedCandidatePairId"] != null }
        if (transport != null) {
            val id = transport["selectedCandidatePairId"]
            return entries.firstOrNull { it["id"] == id }
        }
        return entries.firstOrNull { typeOf(it) == "candidate-pair" && it["nominated"] == true && it["state"] == "succeeded" }
    }

    private fun codecName(entries: List<Map<String, Any?>>, codecId: Any?): String? {
        val codec = entries.firstOrNull { it["id"] == codecId } ?: return null
        val mime = codec["mimeType"] as? String ?: return null
        return mime.substringAfter('/', mime)
    }

    /** Sum of `field` over the entries matching [pick], keyed so a previous sample can be diffed */
    private fun sumBytes(
        entries: List<Map<String, Any?>>,
        pick: (Map<String, Any?>) -> Boolean,
        field: String,
    ): Map<String, Double> {
        val totals = HashMap<String, Double>()
        entries.filter(pick).forEach { totals[it["id"] as? String ?: ""] = num(it[field]) ?: 0.0 }
        return totals
    }

    /** kbit/s between two byte counters; streams that only appear in one sample are skipped */
    private fun rate(now: Map<String, Double>, before: Map<String, Double>?, seconds: Double): Double? {
        if (before == null || seconds <= 0) return null
        var bytes = 0.0
        now.forEach { (key, value) ->
            val previous = before[key]
            if (previous != null && value >= previous) bytes += value - previous
        }
        return bytes * 8 / 1000 / seconds
    }

    private fun outbound(sample: Sample, previous: Sample?, kind: String): Stream {
        val pick = { entry: Map<String, Any?> -> typeOf(entry) == "outbound-rtp" && entry["kind"] == kind }
        val seconds = previous?.let { (sample.at - it.at) / 1000.0 } ?: 0.0
        val bitrate = rate(
            sumBytes(sample.publisher, pick, "bytesSent"),
            previous?.let { sumBytes(it.publisher, pick, "bytesSent") },
            seconds,
        )
        var codec: String? = null
        var best: Map<String, Any?>? = null
        sample.publisher.filter(pick).forEach { entry ->
            if (codec == null) codec = codecName(sample.publisher, entry["codecId"])
            if ((num(entry["frameWidth"]) ?: 0.0) > (num(best?.get("frameWidth")) ?: -1.0)) best = entry
        }
        val width = num(best?.get("frameWidth"))
        val height = num(best?.get("frameHeight"))
        return Stream(
            codec = codec,
            bitrate = bitrate,
            resolution = if (width != null && height != null) "${width.toInt()}×${height.toInt()}" else null,
            fps = num(best?.get("framesPerSecond")),
        )
    }

    fun summarise(sample: Sample, previous: Sample?): Summary {
        // Ping comes from the publishing pair, which carries our media, or the subscriber's otherwise
        var ping: Int? = null
        var transport: String? = null
        for (entries in listOf(sample.publisher, sample.subscriber)) {
            val pair = selectedPair(entries) ?: continue
            val rtt = num(pair["currentRoundTripTime"]) ?: continue
            ping = Math.round(rtt * 1000).toInt()
            val local = entries.firstOrNull { it["id"] == pair["localCandidateId"] }
            val relay = local?.get("candidateType") == "relay"
            val protocol = local?.get("protocol") as? String
            transport = if (relay) "relay (${protocol ?: "turn"})" else protocol
            break
        }

        // Outbound loss as the server reports it back
        val fractions = sample.publisher
            .filter { typeOf(it) == "remote-inbound-rtp" }
            .mapNotNull { num(it["fractionLost"]) }
        val outboundLoss = fractions.maxOrNull()?.let { it * 100 }

        val inbound = sample.subscriber.filter { typeOf(it) == "inbound-rtp" }
        val received = inbound.sumOf { num(it["packetsReceived"]) ?: 0.0 }
        val lost = inbound.sumOf { (num(it["packetsLost"]) ?: 0.0).coerceAtLeast(0.0) }
        val inboundLoss = if (received + lost > 0) lost / (received + lost) * 100 else null
        val jitters = inbound
            .filter { it["kind"] == "audio" }
            .mapNotNull { num(it["jitter"]) }
        val jitter = if (jitters.isEmpty()) null else Math.round(jitters.average() * 1000).toInt()

        val seconds = previous?.let { (sample.at - it.at) / 1000.0 } ?: 0.0
        val pick = { entry: Map<String, Any?> -> typeOf(entry) == "inbound-rtp" }
        val receiveRate = rate(
            sumBytes(sample.subscriber, pick, "bytesReceived"),
            previous?.let { sumBytes(it.subscriber, pick, "bytesReceived") },
            seconds,
        )

        return Summary(
            server = sample.server,
            ping = ping,
            transport = transport,
            outboundLoss = outboundLoss,
            inboundLoss = inboundLoss,
            jitter = jitter,
            sendAudio = outbound(sample, previous, "audio"),
            sendVideo = outbound(sample, previous, "video"),
            receiveBitrate = receiveRate,
        )
    }
}
