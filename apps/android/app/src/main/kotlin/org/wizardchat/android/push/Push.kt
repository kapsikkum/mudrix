package org.wizardchat.android.push

import android.content.Context
import android.util.Log
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.BuildConfig
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.SessionClients
import org.wizardchat.android.matrix.SessionStore
import org.wizardchat.android.matrix.StoredSession
import org.wizardchat.core.PusherConfig
import org.wizardchat.core.SyncState

object Push {
    /** The Matrix push gateway's notify URL (PUSH_GATEWAY_URL at build time, or the push mode's own); empty registers no pusher */
    private val GATEWAY get() = PushProvider.gateway
    private const val FETCH_TIMEOUT_MS = 15_000L
    private const val REGISTER_TIMEOUT_MS = 30_000L
    private const val TAG = "Push"

    private val mutex = Mutex()
    private val registered
        get() = WizardApplication.instance.getSharedPreferences("push", Context.MODE_PRIVATE)

    /** Points every signed-in account's pusher at this device's current token */
    suspend fun register(token: String? = null) {
        if (GATEWAY.isBlank()) return
        val pushkey = token ?: PushProvider.token() ?: return
        mutex.withLock {
            coroutineScope {
                SessionStore.all().forEach { stored ->
                    launch {
                        val userId = stored.session.userId
                        val done = withTimeoutOrNull(REGISTER_TIMEOUT_MS) { register(stored, pushkey) }
                        if (done == null) Log.w(TAG, "registering the pusher for $userId timed out")
                    }
                }
            }
        }
    }

    private suspend fun register(stored: StoredSession, pushkey: String) {
        val userId = stored.session.userId
        val current = "$pushkey|$GATEWAY"
        val previous = registered.getString(userId, null)
        if (previous == current) return
        try {
            val client = SessionClients.restore(stored)
            client.setPusher(
                PusherConfig(
                    appId = BuildConfig.APPLICATION_ID,
                    pushkey = pushkey,
                    gatewayUrl = GATEWAY,
                    appName = "Mudrix",
                    deviceName = MatrixSession.DEVICE_NAME,
                    lang = Locale.getDefault().toLanguageTag(),
                ),
            )
            registered.edit().putString(userId, current).apply()
            val oldKey = previous?.substringBefore('|')
            if (oldKey != null && oldKey != pushkey) {
                runCatching { client.removePusher(BuildConfig.APPLICATION_ID, oldKey) }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w(TAG, "couldn't register the pusher for $userId", error)
        }
    }

    /**
     * What a push gateway forwards: `{"notification": {"event_id", "room_id", "counts": {"unread"}, ...}}`. Gives the
     * same keys an FCM data message has (`room_id`, `event_id`, `unread`), or null when the bytes are not a notification.
     */
    fun parsePayload(content: ByteArray): Map<String, String>? {
        val notification = runCatching {
            (Json.parseToJsonElement(content.decodeToString()) as? JsonObject)?.get("notification") as? JsonObject
        }.getOrNull() ?: return null
        fun text(key: String) = (notification[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
        return buildMap {
            text("room_id")?.let { put("room_id", it) }
            text("event_id")?.let { put("event_id", it) }
            ((notification["counts"] as? JsonObject)?.get("unread") as? JsonPrimitive)?.content?.let { put("unread", it) }
        }.takeIf { it.isNotEmpty() }
    }

    fun forget(userId: String) {
        registered.edit().remove(userId).apply()
    }

    suspend fun handle(data: Map<String, String>) {
        val userId = data["user_id"] ?: SessionStore.active()?.session?.userId ?: return
        val stored = SessionStore.all().firstOrNull { it.session.userId == userId } ?: return
        val roomId = data["room_id"]
        val eventId = data["event_id"]
        if (roomId == null || eventId == null) {
            if (data["unread"] == "0") MessageNotifier.shared.removeDelivered(userId)
            return
        }
        val session = WizardApplication.instance.session
        if (session.userId == userId && session.syncState == SyncState.running) return
        try {
            val client = SessionClients.restore(stored)
            val notification = withTimeout(FETCH_TIMEOUT_MS) { client.pushedNotification(roomId, eventId) }
            if (notification != null) MessageNotifier.shared.show(notification, client)
        } catch (_: Exception) {
            MessageNotifier.shared.showPlaceholder(userId, roomId, eventId)
        }
    }
}
