package org.wizardchat.android.matrix

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.wizardchat.android.WizardApplication

/** Only here so Android lists Mudrix under "Notification access", which is what lets an app read the media sessions */
class MediaListenerService : NotificationListenerService()

/**
 * Shares the song playing on the phone as the profile's "listening to" activity, when the person switched it on
 * and gave Notification access. Games are not detected on Android.
 */
object ListeningSharing {
    private val context: Context get() = WizardApplication.instance
    private val component get() = ComponentName(context, MediaListenerService::class.java)
    private var scope: CoroutineScope? = null
    private var manager: MediaSessionManager? = null
    private var listener: MediaSessionManager.OnActiveSessionsChangedListener? = null
    private var controllers = listOf<MediaController>()
    private val callback = object : MediaController.Callback() {
        override fun onPlaybackStateChanged(state: PlaybackState?) = changed()
        override fun onMetadataChanged(metadata: MediaMetadata?) = changed()
    }
    private var publishJob: Job? = null
    private var published: ProfileActivity? = null
    private var publishedAt = 0L
    private var session: MatrixSession? = null

    fun hasAccess(context: Context): Boolean = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    /** Starts watching (again) for this session; does nothing without Notification access */
    @Synchronized
    fun start(session: MatrixSession) {
        if (!hasAccess(context)) {
            stop()
            return
        }
        if (this.session === session && scope != null) return
        stop()
        this.session = session
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main).also { this.scope = it }
        val sessions = context.getSystemService(MediaSessionManager::class.java) ?: return
        manager = sessions
        val next = MediaSessionManager.OnActiveSessionsChangedListener { attach(it.orEmpty()) }
        listener = next
        runCatching {
            sessions.addOnActiveSessionsChangedListener(next, component)
            attach(sessions.getActiveSessions(component))
        }
        scope.launch {
            while (isActive) {
                delay(ListeningActivity.RENEW_MS)
                changed()
            }
        }
    }

    /** Stops watching and takes the song off the profile */
    @Synchronized
    fun stop() {
        val sessions = manager
        listener?.let { l -> runCatching { sessions?.removeOnActiveSessionsChangedListener(l) } }
        controllers.forEach { runCatching { it.unregisterCallback(callback) } }
        controllers = emptyList()
        listener = null
        manager = null
        publishJob?.cancel()
        scope?.cancel()
        scope = null
        val wasShowing = published != null
        published = null
        val ended = session
        session = null
        if (wasShowing && ended != null) {
            CoroutineScope(SupervisorJob() + Dispatchers.Main).launch { runCatching { write(ended, null) } }
        }
    }

    private fun attach(next: List<MediaController>) {
        controllers.forEach { runCatching { it.unregisterCallback(callback) } }
        controllers = next.filter { it.packageName != context.packageName }
        controllers.forEach { it.registerCallback(callback) }
        changed()
    }

    private fun current(now: Long): ProfileActivity? {
        val playing = controllers.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: return null
        val metadata = playing.metadata ?: return null
        val title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE)
        val artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
        return ListeningActivity.track(title, artist, now, now)
    }

    /** Waits a moment (tracks change in bursts), then writes the profile if the song changed or is due for a renewal */
    private fun changed() {
        val scope = scope ?: return
        publishJob?.cancel()
        publishJob = scope.launch {
            delay(SETTLE_MS)
            val session = session ?: return@launch
            val now = System.currentTimeMillis()
            val track = current(now)
            val renewal = now - publishedAt >= ListeningActivity.RENEW_MS
            if (ListeningActivity.same(track, published) && (track == null || !renewal)) return@launch
            runCatching { write(session, track) }.onSuccess {
                published = track
                publishedAt = now
            }
        }
    }

    private suspend fun write(session: MatrixSession, track: ProfileActivity?) {
        val client = session.client ?: return
        val me = session.userId ?: return
        val existing = ProfileFields.parse(runCatching { client.profileFields(me) }.getOrNull()).activities
        val merged = ListeningActivity.merge(existing, track, System.currentTimeMillis())
        session.writeProfileField(ProfileFields.ACTIVITY_KEYS, ListeningActivity.value(merged))
    }

    private const val SETTLE_MS = 2_000L
}
