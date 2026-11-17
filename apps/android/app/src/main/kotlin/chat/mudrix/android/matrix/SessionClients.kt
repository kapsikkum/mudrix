package chat.mudrix.android.matrix

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import chat.mudrix.core.SessionEvent
import chat.mudrix.core.Subscription
import chat.mudrix.core.MudrixClient

object SessionClients {
    private class Entry(val client: MudrixClient, val subscription: Subscription)

    private val clients = ConcurrentHashMap<String, Entry>()
    private val locks = ConcurrentHashMap<String, Mutex>()

    private fun lock(userId: String) = locks.getOrPut(userId) { Mutex() }

    suspend fun restore(stored: StoredSession): MudrixClient = lock(stored.session.userId).withLock {
        clients[stored.session.userId]?.let { return it.client }
        val client = MudrixClient.restore(stored.session, stored.store)
        track(stored.session.userId, client)
        client
    }

    suspend fun add(client: MudrixClient) {
        val userId = client.userId ?: return
        lock(userId).withLock {
            clients.remove(userId)?.subscription?.cancel()
            track(userId, client)
        }
    }

    suspend fun remove(userId: String) = lock(userId).withLock {
        clients.remove(userId)?.subscription?.cancel()
    }

    private fun track(userId: String, client: MudrixClient) {
        val subscription = client.watchSession { event ->
            if (event is SessionEvent.Refreshed) {
                SessionStore.all().firstOrNull { it.session.userId == userId }
                    ?.let { SessionStore.save(it.copy(session = event.session)) }
            }
        }
        clients[userId] = Entry(client, subscription)
    }
}
