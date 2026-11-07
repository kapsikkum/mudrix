package org.wizardchat.android.matrix.rtc

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.MediaPlayer
import org.wizardchat.android.WizardApplication

/** Short call sounds from `res/raw` (join, leave, ringing) */
object CallSounds {
    private const val VOLUME = 0.5f
    private val playing = mutableListOf<MediaPlayer>()

    /** Plays `name` (`call-join`) once */
    fun play(name: String, volume: Float = VOLUME) {
        val player = makePlayer(name, ringtone = false, volume) ?: return
        playing.add(player)
        player.setOnCompletionListener {
            playing.remove(it)
            it.release()
        }
        player.start()
    }

    /** Plays `name` over and over until the returned loop is stopped */
    fun loop(name: String, volume: Float = VOLUME, ringtone: Boolean = name == "ringtone"): Loop? {
        val player = makePlayer(name, ringtone, volume) ?: return null
        player.isLooping = true
        player.start()
        return Loop(player)
    }

    @SuppressLint("DiscouragedApi")
    private fun makePlayer(name: String, ringtone: Boolean, volume: Float): MediaPlayer? {
        val context = WizardApplication.instance
        val id = context.resources.getIdentifier(name, "raw", context.packageName)
        if (id == 0) return null
        val attributes = AudioAttributes.Builder()
            .setUsage(if (ringtone) AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        return runCatching {
            val descriptor = context.resources.openRawResourceFd(id)
            MediaPlayer().apply {
                setAudioAttributes(attributes)
                setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                descriptor.close()
                setVolume(volume, volume)
                prepare()
            }
        }.getOrNull()
    }

    class Loop(private val player: MediaPlayer) {
        fun stop() {
            runCatching { player.stop() }
            player.release()
        }
    }
}
