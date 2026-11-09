package org.wizardchat.android.matrix

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.wizardchat.core.SessionEvent
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

object SessionClients {
    private class Entry(val client: WizardClient, val subscription: Subscription)

    private val clients = ConcurrentHashMap<String, Entry>()
    private val locks = ConcurrentHashMap<String, Mutex>()

    private fun lock(userId: String) = locks.getOrPut(userId) { Mutex() }

    suspend fun restore(stored: StoredSession): WizardClient = lock(stored.session.userId).withLock {
        clients[stored.session.userId]?.let { return it.client }
        val client = WizardClient.restore(stored.session, stored.store)
        track(stored.session.userId, client)
        client
    }

    suspend fun add(client: WizardClient) {
        val userId = client.userId ?: return
        lock(userId).withLock {
            clients.remove(userId)?.subscription?.cancel()
            track(userId, client)
        }
    }

    suspend fun remove(userId: String) = lock(userId).withLock {
        clients.remove(userId)?.subscription?.cancel()
    }

    private fun track(userId: String, client: WizardClient) {
        val subscription = client.watchSession { event ->
            if (event is SessionEvent.Refreshed) {
                SessionStore.all().firstOrNull { it.session.userId == userId }
                    ?.let { SessionStore.save(it.copy(session = event.session)) }
            }
        }
        clients[userId] = Entry(client, subscription)
    }
}
