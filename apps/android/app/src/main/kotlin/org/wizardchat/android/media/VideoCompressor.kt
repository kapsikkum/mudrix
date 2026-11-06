package org.wizardchat.android.media

import android.media.MediaCodecList
import android.media.MediaFormat

/** Re-encodes videos before they are sent (see [VideoPlan] for how far) */
object VideoCompressor {
    /** Whether this device has an H.264 encoder that takes a surface, which the re-encode needs */
    val isSupported: Boolean by lazy {
        runCatching {
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, 1280, 720).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, android.media.MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, VideoPlan.FIXED_BITRATE.getValue(720).toInt())
                setInteger(MediaFormat.KEY_FRAME_RATE, VideoPlan.MAX_FRAME_RATE)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            }
            MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format) != null
        }.getOrDefault(false)
    }
}
