package org.wizardchat.android.matrix

import kotlinx.coroutines.CompletableDeferred
import org.wizardchat.core.Member
import org.wizardchat.core.WizardClient

/** Display names and avatars of room members and other users, loaded once per room/user */
object MemberDirectory {
    data class Profile(val name: String?, val avatarUrl: String?)

    private val rooms = HashMap<String, CompletableDeferred<Map<String, Member>>>()
    private val users = HashMap<String, CompletableDeferred<Profile>>()

    /** Call from the main thread */
    suspend fun profile(userId: String, roomId: String?, client: WizardClient): Profile {
        if (roomId != null) {
            val members = rooms[roomId]?.await() ?: run {
                val deferred = CompletableDeferred<Map<String, Member>>()
                rooms[roomId] = deferred
                val list = runCatching { client.members(roomId) }.getOrNull() ?: emptyList()
                val map = list.reversed().associateBy { it.userId }
                deferred.complete(map)
                map
            }
            members[userId]?.let { return Profile(it.displayName, it.avatarUrl) }
        }
        users[userId]?.let { return it.await() }
        val deferred = CompletableDeferred<Profile>()
        users[userId] = deferred
        val profile = runCatching { client.userProfile(userId) }.getOrNull()
        return Profile(profile?.displayName, profile?.avatarUrl).also { deferred.complete(it) }
    }

    fun forget(roomId: String) {
        rooms.remove(roomId)
    }

    fun reset() {
        rooms.clear()
        users.clear()
    }
}

suspend fun MatrixSession.memberProfile(userId: String, roomId: String?): MemberDirectory.Profile {
    val client = client ?: return MemberDirectory.Profile(null, null)
    return MemberDirectory.profile(userId, roomId, client)
}
