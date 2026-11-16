package chat.mudrix.android.matrix.rtc

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import chat.mudrix.android.MudrixApplication
import chat.mudrix.android.matrix.SoundKind
import chat.mudrix.android.matrix.SoundPacks

/** The sounds the user chose in Settings > Voice & Audio: a pack, an override per sound and a volume */
object Sounds {
    private val prefs get() = MudrixApplication.instance.prefs

    private class Choice(val resource: String, val volume: Float)

    /** The Settings > Voice & Video switch a sound belongs to */
    private fun toggle(kind: SoundKind): String? = when (kind) {
        SoundKind.Mute, SoundKind.Unmute -> "mute"
        SoundKind.Deafen, SoundKind.Undeafen -> "deafen"
        SoundKind.CameraOn, SoundKind.CameraOff -> "camera"
        SoundKind.ScreenshareStart, SoundKind.ScreenshareStop -> "screenshare"
        SoundKind.Join -> "join"
        SoundKind.Leave -> "leave"
        SoundKind.Ring -> "ringtone"
        SoundKind.Ringback -> "ringback"
        SoundKind.CallEnd -> "callEnded"
        SoundKind.RaiseHand -> "raiseHand"
        SoundKind.Reaction -> "reaction"
        SoundKind.WatchTogetherStart -> "watchTogether"
        SoundKind.Message, SoundKind.Mention, SoundKind.Moved -> null
    }

    /** The resource and volume a sound would play with now, or null when it is off */
    private fun choice(kind: SoundKind): Choice? {
        val prefs = prefs
        if (kind.gated && !prefs.notificationSounds) return null
        // The per-sound switches in Settings > Voice & Video
        if (toggle(kind)?.let { !CallSounds.isOn(it) } == true) return null
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
