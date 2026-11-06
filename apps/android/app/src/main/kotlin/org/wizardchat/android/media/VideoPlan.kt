package org.wizardchat.android.media

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Planning for sending big videos, a line-by-line port of the web's `util/videoPlan.ts` (same
 * thresholds, tiers and arithmetic; `VideoPlanTest` compares it with values computed by that file).
 * Nothing here touches Android, so it runs in unit tests.
 *
 * A video is either sent untouched or re-encoded to H.264 + AAC in an MP4 with the moov atom first;
 * [VideoPlan.planCompression] decides how far it is shrunk.
 */

/** What one attachment is sent as: untouched, shrunk to fit the size the settings aim for, or a fixed resolution */
sealed interface VideoQuality {
    data object Original : VideoQuality
    data object Smart : VideoQuality
    data class Fixed(val height: Int) : VideoQuality
}

/** What the encoder is asked for: a size to fit under, or a resolution to scale down to */
sealed interface CompressTarget {
    data class Smart(val maxBytes: Long) : CompressTarget
    data class Fixed(val height: Int) : CompressTarget
}

/** What is known about a source video before it is encoded; [width] and [height] are as displayed */
data class VideoMeta(
    val durationSec: Double,
    val width: Int,
    val height: Int,
    /** Bits per second of the whole file, sound included */
    val bitrate: Double,
)

data class CompressPlan(
    /** Short side the video is scaled down to (never above its own) */
    val height: Int,
    /** Bits per second for the picture */
    val videoBitrate: Long,
    val estimatedBytes: Double,
)

object VideoPlan {
    private class Tier(val height: Int, val min: Double, val cap: Double)

    /** Resolution steps a smart plan picks from: each needs at least `min` bit/s to look decent, and gains nothing past `cap` */
    private val TIERS = listOf(
        Tier(1080, 3_500_000.0, 6_000_000.0),
        Tier(720, 1_800_000.0, 3_000_000.0),
        Tier(480, 800_000.0, 1_500_000.0),
        Tier(360, 400_000.0, 800_000.0),
    )

    /** What a fixed resolution is encoded at */
    val FIXED_BITRATE = mapOf(1080 to 5_000_000L, 720 to 2_800_000L, 480 to 1_400_000L)
    const val AUDIO_BITRATE = 128_000L

    /** Lowest picture bitrate a smart plan will go to for a clip too long to fit otherwise */
    private const val MIN_VIDEO_BITRATE = 150_000.0

    /** Share of the size budget left for the picture and sound; the rest absorbs container overhead and rate overshoot */
    private const val BUDGET_SHARE = 0.9
    const val MAX_FRAME_RATE = 30

    /** The result is only worth sending if it is at least this much smaller than the original */
    const val MIN_SAVING = 0.15

    /** JavaScript's `Math.round`: halves go up */
    private fun jsRound(value: Double): Long = floor(value + 0.5).toLong()

    /**
     * How to re-encode a video for a target, or null when it should go as it is (it already fits, or
     * is already smaller than the target would make it).
     */
    fun planCompression(meta: VideoMeta, target: CompressTarget): CompressPlan? {
        val durationSec = meta.durationSec
        if (!(durationSec > 0) || meta.width <= 0 || meta.height <= 0) return null
        val shortSide = min(meta.width, meta.height)
        val sourceVideoBitrate = max(0.0, meta.bitrate - AUDIO_BITRATE)
        fun estimate(videoBitrate: Double) = durationSec * (videoBitrate + AUDIO_BITRATE) / 8

        if (target is CompressTarget.Fixed) {
            val videoBitrate = (FIXED_BITRATE[target.height] ?: return null).toDouble()
            val fitsAlready = shortSide <= target.height &&
                (sourceVideoBitrate == 0.0 || sourceVideoBitrate <= videoBitrate * 1.25)
            if (fitsAlready) return null
            val bitrate = jsRound(if (sourceVideoBitrate > 0) min(videoBitrate, sourceVideoBitrate) else videoBitrate)
            return CompressPlan(min(target.height, shortSide), bitrate, estimate(bitrate.toDouble()))
        }

        val maxBytes = (target as CompressTarget.Smart).maxBytes.toDouble()
        if (meta.bitrate * durationSec / 8 <= maxBytes) return null
        val available = maxBytes * 8 * BUDGET_SHARE / durationSec - AUDIO_BITRATE
        val smallest = TIERS.last()
        val tier = TIERS.firstOrNull { it.height <= shortSide && available >= it.min }
            ?: if (available >= smallest.min) null else smallest
        // Fewer pixels than even the smallest step has: keep them all and spend what is available on them
        val stepHeight = tier?.height ?: shortSide
        val cap = tier?.cap ?: smallest.cap
        var videoBitrate = max(MIN_VIDEO_BITRATE, min(available, cap))
        if (sourceVideoBitrate > 0) videoBitrate = min(videoBitrate, sourceVideoBitrate)
        val rounded = jsRound(videoBitrate)
        return CompressPlan(min(stepHeight, shortSide), rounded, estimate(rounded.toDouble()))
    }

    /** Even sizes, as H.264 wants; the short side becomes [shortSideTarget] and the shape stays */
    fun scaledSize(width: Int, height: Int, shortSideTarget: Int): Pair<Int, Int> {
        val shortSide = min(width, height)
        if (shortSide <= shortSideTarget) return even(width.toDouble()) to even(height.toDouble())
        val scale = shortSideTarget.toDouble() / shortSide
        return even(width * scale) to even(height * scale)
    }

    private fun even(n: Double): Int = max(2L, jsRound(n / 2) * 2).toInt()

    /** Rough size the video will have after being encoded for [target]; the original size when it is sent as it is */
    fun estimateCompressedSize(meta: VideoMeta, target: CompressTarget, originalSize: Long): Long {
        val plan = planCompression(meta, target) ?: return originalSize
        return min(plan.estimatedBytes, originalSize.toDouble()).toLong()
    }

    // ---- Settings -> what one video is sent as ------------------------------------------------

    enum class Mode { original, smart, fixed }

    class UploadPrefs(
        val mode: Mode,
        val height: Int,
        /** Largest size a smart upload aims for, before the server's limit is applied */
        val targetBytes: Long,
        /** Videos smaller than this are never re-encoded */
        val minBytes: Long,
    )

    /** Share of the server's limit a smart upload aims for, so a little overshoot still goes through */
    private const val SERVER_LIMIT_SHARE = 0.95

    /** The size a smart upload aims for: what the settings ask, but never beyond what the server takes */
    fun smartMaxBytes(prefs: UploadPrefs, maxUploadBytes: Long): Long =
        floor(min(prefs.targetBytes.toDouble(), maxUploadBytes * SERVER_LIMIT_SHARE)).toLong()

    /**
     * What a video is sent as when the user hasn't picked for it: untouched, unless the settings ask for
     * big videos to be shrunk or the server wouldn't take it otherwise.
     */
    fun defaultQuality(prefs: UploadPrefs, size: Long, maxUploadBytes: Long, canCompress: Boolean): VideoQuality {
        if (!canCompress) return VideoQuality.Original
        val shrunk = if (prefs.mode == Mode.fixed) VideoQuality.Fixed(prefs.height) else VideoQuality.Smart
        if (size > maxUploadBytes) return shrunk
        if (prefs.mode == Mode.original || size < prefs.minBytes) return VideoQuality.Original
        return shrunk
    }

    fun qualityTarget(quality: VideoQuality, prefs: UploadPrefs, maxUploadBytes: Long): CompressTarget? = when (quality) {
        VideoQuality.Original -> null
        VideoQuality.Smart -> CompressTarget.Smart(smartMaxBytes(prefs, maxUploadBytes))
        is VideoQuality.Fixed -> CompressTarget.Fixed(quality.height)
    }

    private val OFFERED_HEIGHTS = listOf(720, 480)

    /** An option is only offered if it comes out at most this share of the original (the encoder wants 15% saved) */
    private const val MIN_SAVING_RATIO = 0.85

    /** [size] is the expected size when sent this way; null while the video's own details aren't known yet */
    data class Choice(val quality: VideoQuality, val size: Long?)

    /**
     * What one video can be sent as, each with its expected size. Original is always first. Sizes the
     * video already fits in, or resolutions at or above its own, are left out as they'd change nothing.
     */
    fun choices(meta: VideoMeta?, fileSize: Long, prefs: UploadPrefs, maxUploadBytes: Long): List<Choice> {
        val choices = mutableListOf(Choice(VideoQuality.Original, fileSize))
        val heights = OFFERED_HEIGHTS.toMutableSet()
        if (prefs.mode == Mode.fixed) heights.add(prefs.height)
        val qualities = listOf<VideoQuality>(VideoQuality.Smart) + heights.sortedDescending().map { VideoQuality.Fixed(it) }
        for (quality in qualities) {
            val target = qualityTarget(quality, prefs, maxUploadBytes) ?: continue
            if (meta == null) {
                choices.add(Choice(quality, null))
                continue
            }
            val plan = planCompression(meta, target)
            // The encoder keeps the original when it wouldn't be clearly smaller, so don't offer what saves nothing
            if (plan != null && plan.estimatedBytes <= fileSize * MIN_SAVING_RATIO) {
                choices.add(Choice(quality, plan.estimatedBytes.toLong()))
            }
        }
        return choices
    }
}
