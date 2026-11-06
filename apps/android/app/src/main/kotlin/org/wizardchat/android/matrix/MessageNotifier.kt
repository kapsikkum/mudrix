package org.wizardchat.android.matrix

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.MainActivity
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcons
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.core.Notification
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.Subscription

/**
 * Shows a notification for new messages while the app runs (there's no push server). Tapping one
 * opens its room through `roomToOpen`; it can be answered or marked as read from the notification.
 */
class MessageNotifier {
    /** The room on screen, which doesn't notify; set by the room screen */
    var activeRoomId: String? = null
    var roomToOpen by mutableStateOf<String?>(null)
    /** A message to scroll to once its room is open (room ID, event ID) */
    var eventToFocus by mutableStateOf<Pair<String, String>?>(null)
    var accountToOpen by mutableStateOf<String?>(null)

    private var prefs: AppPreferences? = null
    private var roomList: RoomListModel? = null
    private var subscription: Subscription? = null
    private var badge = 0
    private val scope = MainScope()
    private val context: Context get() = WizardApplication.instance
    private val manager get() = NotificationManagerCompat.from(context)

    fun start(roomList: RoomListModel, prefs: AppPreferences) {
        this.roomList = roomList
        this.prefs = prefs
        createChannels()
        subscription?.cancel()
        subscription = roomList.client.watchNotifications { notify(it) }
        if (prefs.notificationBanners || prefs.notificationSounds) requestPermission()
    }

    fun stop() {
        badge = 0
        subscription?.cancel()
        subscription = null
        roomList = null
    }

    /** Launchers show the notifications as the badge, so there is no count to set; at 0 everything is read */
    fun updateBadge(count: Int) {
        badge = count
        if (count == 0) roomList?.client?.userId?.let(::removeDelivered)
    }

    fun removeDelivered(userId: String) {
        val system = context.getSystemService(NotificationManager::class.java) ?: return
        system.activeNotifications.filter { it.tag?.startsWith("$userId|") == true }.forEach { manager.cancel(it.tag, it.id) }
    }

    private fun notify(notification: Notification) {
        val prefs = prefs ?: return
        if (!(prefs.notificationBanners || prefs.notificationSounds) || notification.roomId == activeRoomId) return
        if (!canPost()) return
        val sender = notification.senderName ?: notification.sender
        val title = notification.roomName ?: sender
        var body = if (notification.isDirect || notification.roomName == null) notification.body else "$sender: ${notification.body}"
        if (body.isEmpty()) body = L10n.format("notifications.newMessage")
        // Streamer mode: the notification says who, not what
        if (prefs.streamerModeActive(CallManager.shared.screenSharing)) body = L10n.format("settings.privacy.streamer.notificationBody")
        val sound = prefs.notificationSounds && notification.sound
        val userId = roomList?.client?.userId ?: return
        val tag = "$userId|${notification.roomId}"
        val id = notification.eventId.hashCode()

        val replyInput = RemoteInput.Builder(KEY_REPLY).setLabel(L10n.format("composer.typeMessage")).build()
        val reply = NotificationCompat.Action.Builder(
            PhIcons.id("arrow-bend-up-left"),
            L10n.format("timeline.reply"),
            actionIntent(ACTION_REPLY, notification.roomId, userId, tag, id, mutable = true),
        ).addRemoteInput(replyInput).setAllowGeneratedReplies(false).build()
        val markRead = NotificationCompat.Action.Builder(
            PhIcons.id("envelope-open"),
            L10n.format("common.markRead"),
            actionIntent(ACTION_MARK_READ, notification.roomId, userId, tag, id, mutable = false),
        ).build()

        val builder = NotificationCompat.Builder(context, if (sound) CHANNEL_MESSAGES else CHANNEL_SILENT)
            .setSmallIcon(smallIcon())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(if (notification.highlight) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setSilent(!sound)
            .setAutoCancel(true)
            .setNumber(badge)
            .setContentIntent(openIntent(notification.roomId, userId))
            .addAction(reply)
            .addAction(markRead)
        try {
            manager.notify(tag, id, builder.build())
        } catch (_: SecurityException) {
        }
    }

    private fun canPost(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Asks once for the notification permission (Android 13+) */
    private fun requestPermission() {
        if (canPost()) return
        val defaults = context.getSharedPreferences("notifier", Context.MODE_PRIVATE)
        if (defaults.getBoolean("askedPermission", false)) return
        if (!ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) return
        defaults.edit().putBoolean("askedPermission", true).apply()
        context.startActivity(
            Intent(context, NotifierActivity::class.java)
                .putExtra(EXTRA_PERMISSION, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    private fun createChannels() {
        val system = context.getSystemService(NotificationManager::class.java) ?: return
        system.createNotificationChannel(
            NotificationChannel(CHANNEL_MESSAGES, L10n.format("settings.notifications.messagesLabel"), NotificationManager.IMPORTANCE_HIGH),
        )
        system.createNotificationChannel(
            NotificationChannel(CHANNEL_SILENT, L10n.format("settings.notifications.level.on"), NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(null, null)
                enableVibration(false)
            },
        )
    }

    private fun smallIcon(): Int =
        PhIcons.id("chat-circle", PhWeight.fill).takeIf { it != 0 } ?: context.applicationInfo.icon

    private fun openIntent(roomId: String, userId: String): PendingIntent =
        PendingIntent.getActivity(
            context,
            "$userId|$roomId".hashCode(),
            Intent(context, NotifierActivity::class.java).putExtra(EXTRA_ROOM, roomId).putExtra(EXTRA_USER, userId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun actionIntent(action: String, roomId: String, userId: String, tag: String, id: Int, mutable: Boolean): PendingIntent {
        val intent = Intent(context, NotificationActionReceiver::class.java)
            .setAction(action)
            .putExtra(EXTRA_ROOM, roomId)
            .putExtra(EXTRA_USER, userId)
            .putExtra(EXTRA_TAG, tag)
            .putExtra(EXTRA_ID, id)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE)
        return PendingIntent.getBroadcast(context, id * 31 + action.hashCode(), intent, flags)
    }

    internal fun handleAction(intent: Intent, done: () -> Unit) {
        val roomId = intent.getStringExtra(EXTRA_ROOM) ?: return done()
        val userId = intent.getStringExtra(EXTRA_USER)
        val tag = intent.getStringExtra(EXTRA_TAG) ?: roomId
        val id = intent.getIntExtra(EXTRA_ID, 0)
        scope.launch {
            try {
                if (userId != null) openAccount(userId)
                when (intent.action) {
                    ACTION_REPLY -> {
                        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()?.trim()
                        if (!text.isNullOrEmpty()) reply(text, roomId)
                    }
                    ACTION_MARK_READ -> room(roomId)?.let { currentRoomList()?.setRead(it, read = true) }
                }
            } finally {
                manager.cancel(tag, id)
                done()
            }
        }
    }

    private suspend fun openAccount(userId: String) {
        val session = WizardApplication.instance.session
        if (session.state == MatrixSession.State.Restoring) runCatching { session.restore() }
        if (session.userId != userId) session.switchAccount(userId)
    }

    private fun currentRoomList() = roomList ?: WizardApplication.instance.session.roomList

    /** Waits for the room list, which may still be loading when the app was started for this */
    private suspend fun room(roomId: String): RoomSummary? {
        if (roomList == null) runCatching { WizardApplication.instance.session.restore() }
        repeat(40) {
            currentRoomList()?.room(roomId)?.let { return it }
            delay(250)
        }
        return null
    }

    private suspend fun reply(text: String, roomId: String) {
        if (room(roomId) == null) return
        val client = currentRoomList()?.client ?: return
        val timeline = runCatching { client.timeline(roomId) }.getOrNull() ?: return
        runCatching { timeline.sendText(text) }
        runCatching { timeline.markAsRead() }
        // Give the send queue a moment before the process may be stopped again
        delay(2000)
    }

    companion object {
        val shared = MessageNotifier()

        private const val CHANNEL_MESSAGES = "messages"
        private const val CHANNEL_SILENT = "messages_silent"
        private const val KEY_REPLY = "reply"
        private const val ACTION_REPLY = "org.wizardchat.android.REPLY"
        private const val ACTION_MARK_READ = "org.wizardchat.android.MARK_READ"
        internal const val EXTRA_ROOM = "roomId"
        internal const val EXTRA_ID = "notificationId"
        internal const val EXTRA_USER = "userId"
        internal const val EXTRA_TAG = "tag"
        internal const val EXTRA_PERMISSION = "requestPermission"
    }
}

/** Handles the reply and mark-as-read buttons of message notifications */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        MessageNotifier.shared.handleAction(intent) { pending.finish() }
    }
}

/**
 * Invisible: opens a tapped notification's room in the app, or asks for the notification
 * permission, then closes.
 */
class NotifierActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent.getBooleanExtra(MessageNotifier.EXTRA_PERMISSION, false)) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            } else {
                finish()
            }
            return
        }
        val notifier = MessageNotifier.shared
        intent.getStringExtra(MessageNotifier.EXTRA_USER)?.let { userId ->
            if (userId != WizardApplication.instance.session.userId) notifier.accountToOpen = userId
        }
        intent.getStringExtra(MessageNotifier.EXTRA_ROOM)?.let { notifier.roomToOpen = it }
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        finish()
    }
}
