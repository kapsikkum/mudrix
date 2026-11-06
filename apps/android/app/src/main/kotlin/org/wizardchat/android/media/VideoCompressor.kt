package org.wizardchat.android.media

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Composition
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import java.io.File
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/**
 * Re-encodes a video to H.264 before it is sent: the short side is scaled down to what
 * [VideoPlan.planCompression] asks for, the picture gets that plan's bitrate, at most 30 frames per
 * second and a keyframe every 2 seconds. Sound that is already AAC is copied, anything else is
 * encoded as AAC. The result is an MP4 with the moov atom first ([Mp4FastStart]).
 *
 * The work is media3's [Transformer] (MediaCodec decoders and encoders, an OpenGL scaler between
 * them and a MediaMuxer). Writing that scaler by hand is where device differences hurt most, so the
 * app's own part is the plan, the encoder settings and the fast start rewrite.
 */
object VideoCompressor {
    /** Whether this device has an H.264 encoder that takes a surface, which the re-encode needs */
    val isSupported: Boolean by lazy {
        runCatching {
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, 1280, 720).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, VideoPlan.FIXED_BITRATE.getValue(720).toInt())
                setInteger(MediaFormat.KEY_FRAME_RATE, VideoPlan.MAX_FRAME_RATE)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            }
            MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format) != null
        }.getOrDefault(false)
    }

    private const val KEYFRAME_INTERVAL_SECONDS = 2f
    private const val PROGRESS_POLL_MS = 250L

    /** Frames per second of the first video track, or null when the file does not say */
    private fun frameRate(context: Context, uri: Uri): Float? {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(context, uri, null)
            (0 until extractor.trackCount)
                .map { extractor.getTrackFormat(it) }
                .firstOrNull { it.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true }
                ?.takeIf { it.containsKey(MediaFormat.KEY_FRAME_RATE) }
                ?.let { format ->
                    runCatching { format.getInteger(MediaFormat.KEY_FRAME_RATE).toFloat() }
                        .recoverCatching { format.getFloat(MediaFormat.KEY_FRAME_RATE) }
                        .getOrNull()
                }
        } catch (_: Exception) {
            null
        } finally {
            extractor.release()
        }
    }

    /**
     * Re-encodes [input] for [target]. Returns the new file, or null when the video should go as it
     * is: it already fits, or the result would not be at least [VideoPlan.MIN_SAVING] smaller.
     * Cancelling the calling coroutine stops the encoder and removes its output. Throws when the
     * device cannot do it; the caller then sends the original.
     *
     * [onProgress] gets 0..1, a few times a second, on the main thread.
     */
    suspend fun compress(
        context: Context,
        input: File,
        meta: VideoMeta,
        target: CompressTarget,
        outputName: String,
        onProgress: (Float) -> Unit,
    ): File? {
        val plan = VideoPlan.planCompression(meta, target) ?: return null
        val outputDir = File(context.cacheDir, UUID.randomUUID().toString()).apply { mkdirs() }
        val output = File(outputDir, outputName)
        var keep = false
        try {
            val (width, height) = VideoPlan.scaledSize(meta.width, meta.height, plan.height)
            val rate = frameRate(context, Uri.fromFile(input))
            withContext(Dispatchers.Main.immediate) {
                transform(context, input, output, width, height, plan.videoBitrate, rate, onProgress)
            }
            currentCoroutineContext().ensureActive()
            Mp4FastStart.apply(output)
            val ok = output.length() > 0 && output.length() <= input.length() * (1 - VideoPlan.MIN_SAVING)
            keep = ok
            return if (ok) output else null
        } finally {
            if (!keep) outputDir.deleteRecursively()
        }
    }

    private suspend fun transform(
        context: Context,
        input: File,
        output: File,
        width: Int,
        height: Int,
        bitrate: Long,
        sourceFrameRate: Float?,
        onProgress: (Float) -> Unit,
    ) {
        val encoders = DefaultEncoderFactory.Builder(context)
            .setRequestedVideoEncoderSettings(
                VideoEncoderSettings.Builder()
                    .setBitrate(bitrate.toInt())
                    .setiFrameIntervalSeconds(KEYFRAME_INTERVAL_SECONDS)
                    .build(),
            )
            // H.264 or nothing: a fallback to another codec would not play everywhere
            .setEnableFallback(false)
            .build()
        val effects = mutableListOf<Effect>()
        if (sourceFrameRate == null || sourceFrameRate > VideoPlan.MAX_FRAME_RATE + 0.5f) {
            effects += FrameDropEffect.createDefaultFrameDropEffect(VideoPlan.MAX_FRAME_RATE.toFloat())
        }
        effects += Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT)
        val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input)))
            .setEffects(Effects(emptyList<AudioProcessor>(), effects))
            .build()

        val main = Handler(Looper.getMainLooper())
        coroutineScope {
            var transformer: Transformer? = null
            // Progress is read from the thread the transformer was made on, which is this one
            val holder = ProgressHolder()
            val poll = launch {
                while (isActive) {
                    val running = transformer
                    if (running != null && running.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) onProgress(holder.progress / 100f)
                    delay(PROGRESS_POLL_MS)
                }
            }
            try {
                suspendCancellableCoroutine { continuation ->
                    val built = Transformer.Builder(context)
                        .setVideoMimeType(MimeTypes.VIDEO_H264)
                        .setAudioMimeType(MimeTypes.AUDIO_AAC)
                        .setEncoderFactory(encoders)
                        .addListener(object : Transformer.Listener {
                            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                                if (continuation.isActive) continuation.resume(Unit)
                            }

                            override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                                if (continuation.isActive) continuation.resumeWithException(exportException)
                            }
                        })
                        .build()
                    transformer = built
                    continuation.invokeOnCancellation { main.post { built.cancel() } }
                    built.start(item, output.absolutePath)
                }
            } finally {
                poll.cancel()
            }
        }
        onProgress(1f)
    }
}
