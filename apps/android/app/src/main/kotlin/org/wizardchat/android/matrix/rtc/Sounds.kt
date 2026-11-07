package org.wizardchat.android.matrix.rtc

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.SoundKind
import org.wizardchat.android.matrix.SoundPacks

/** The sounds the user chose in Settings > Voice & Audio: a pack, an override per sound and a volume */
object Sounds {
    private val prefs get() = WizardApplication.instance.prefs

    private class Choice(val resource: String, val volume: Float)

    /** The resource and volume a sound would play with now, or null when it is off */
    private fun choice(kind: SoundKind): Choice? {
        val prefs = prefs
        if (kind.gated && !prefs.notificationSounds) return null
        val pack = SoundPacks.resolve(kind, prefs.notificationSoundPack, prefs.effectiveSoundOverrides()) ?: return null
        val resource = SoundPacks.resource(pack, kind) ?: return null
        return Choice(resource, SoundPacks.volume(kind, prefs.notificationSoundVolume))
    }

    /** Plays a call or voice sound once, as the settings say */
    fun play(kind: SoundKind) {
        val choice = choice(kind) ?: return
        CallSounds.play(choice.resource, choice.volume)
    }

    /** Loops the ring or ringback until the returned loop is stopped; null when it is off */
    fun loop(kind: SoundKind): CallSounds.Loop? {
        val choice = choice(kind) ?: return null
        return CallSounds.loop(choice.resource, choice.volume, ringtone = kind == SoundKind.Ring)
    }

    /**
     * The sound of an incoming message (a mention, direct message or invite is `priority`). While the
     * app is the screen being looked at it stays quiet unless the setting says otherwise.
     */
    fun playMessage(priority: Boolean) {
        if (!prefs.notificationSoundsWhenFocused && appInForeground()) return
        play(if (priority) SoundKind.Mention else SoundKind.Message)
    }

    /** Any sound of any pack once, for the picker; one pass of a ring */
    fun preview(kind: SoundKind, pack: String) {
        val resource = SoundPacks.resource(pack, kind) ?: return
        CallSounds.play(resource, SoundPacks.volume(kind, prefs.notificationSoundVolume))
    }

    private fun appInForeground() =
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
}
