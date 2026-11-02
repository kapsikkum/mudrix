package org.wizardchat.android.ui.composer

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import java.io.File
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.tokens.WZ

/** Records a voice message (AAC in MP4) with a live loudness waveform */
class VoiceRecorder(private val context: Context, private val scope: CoroutineScope) {
    enum class State { idle, requesting, recording, paused, denied, failed }

    data class Recording(val file: File, val duration: Double, val waveform: List<Float>)

    var state by mutableStateOf(State.idle)
    var elapsed by mutableStateOf(0.0)
        private set
    var samples by mutableStateOf(listOf<Float>())
        private set

    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var ticker: Job? = null
    private var recordedMs = 0L
    private var resumedAt = 0L

    /** Starts recording; the caller has already been granted RECORD_AUDIO */
    fun start() {
        val file = File(context.cacheDir, "voice-${UUID.randomUUID()}.m4a")
        try {
            @Suppress("DEPRECATION")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioSamplingRate(48_000)
            recorder.setAudioChannels(1)
            recorder.setAudioEncodingBitRate(96_000)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            this.recorder = recorder
            this.file = file
            samples = emptyList()
            elapsed = 0.0
            recordedMs = 0
            resumedAt = System.currentTimeMillis()
            state = State.recording
            ticker = scope.launch {
                while (isActive) {
                    delay(100)
                    tick()
                }
            }
        } catch (e: Exception) {
            file.delete()
            reset()
            state = State.failed
        }
    }

    fun togglePause() {
        val recorder = recorder ?: return
        runCatching {
            if (state == State.recording) {
                recorder.pause()
                recordedMs += System.currentTimeMillis() - resumedAt
                state = State.paused
            } else {
                recorder.resume()
                resumedAt = System.currentTimeMillis()
                state = State.recording
            }
        }
    }

    fun finish(): Recording? {
        val recorder = recorder ?: return null
        val file = file ?: return null
        val duration = currentMs() / 1000.0
        val stopped = runCatching { recorder.stop() }.isSuccess
        reset()
        if (!stopped) {
            file.delete()
            return null
        }
        return Recording(file, duration, resample(samples, 100))
    }

    fun cancel() {
        runCatching { recorder?.stop() }
        file?.delete()
        reset()
    }

    private fun reset() {
        ticker?.cancel()
        ticker = null
        recorder?.release()
        recorder = null
        state = State.idle
    }

    private fun currentMs(): Long =
        recordedMs + if (state == State.recording) System.currentTimeMillis() - resumedAt else 0

    private fun tick() {
        val recorder = recorder ?: return
        if (state != State.recording) return
        // The square root is the curve iOS gets from 10^(dB/40), so waveforms look the same in both apps
        val amplitude = runCatching { recorder.maxAmplitude }.getOrDefault(0) / 32767f
        samples = samples + max(0.05f, min(1f, sqrt(amplitude)))
        elapsed = currentMs() / 1000.0
    }

    companion object {
        /** The loudest sample per bucket */
        fun resample(samples: List<Float>, count: Int): List<Float> {
            if (samples.isEmpty()) return List(count) { 0.1f }
            return (0 until count).map { index ->
                val start = index * samples.size / count
                val end = max(start + 1, (index + 1) * samples.size / count)
                min(1f, samples.subList(start, min(end, samples.size)).maxOrNull() ?: 0f)
            }
        }
    }
}

/** Loudness bars, all played: the recording so far */
@Composable
internal fun RecordingWaveform(samples: List<Float>, modifier: Modifier = Modifier) {
    val color = theme.accent
    Canvas(modifier) {
        val bar = WZ.Space.space1.toPx()
        val count = max((size.width / (bar * 2)).toInt(), 1)
        val bars = VoiceRecorder.resample(samples, count)
        bars.forEachIndexed { index, value ->
            val height = max(3f, value * size.height)
            drawRoundRect(
                color,
                topLeft = Offset(index * bar * 2, (size.height - height) / 2),
                size = Size(bar, height),
                cornerRadius = CornerRadius(bar / 2),
            )
        }
    }
}
