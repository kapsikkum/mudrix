package org.wizardchat.android.matrix

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonElement

/** Reads the cosmetic packs a room, a subscription or the account's own uploads hold, and keeps them for a while */
object CosmeticPackStore {
    private const val TTL_MS = 5 * 60_000L

    private class Entry(val at: Long, val packs: List<CosmeticPacks.Pack>)

    private val roomPacks = HashMap<String, Entry>()
    private val introByUrl = HashMap<String, String>()
    private var introAt = 0L

    /** Drops what has been read, after a pack was subscribed to or edited */
    fun forget() {
        roomPacks.clear()
        introByUrl.clear()
        introAt = 0L
    }

    /** The cosmetic packs in one room or space (its own, not the spaces' it belongs to) */
    suspend fun roomPacks(session: MatrixSession, roomId: String): List<CosmeticPacks.Pack> {
        roomPacks[roomId]?.takeIf { System.currentTimeMillis() - it.at < TTL_MS }?.let { return it.packs }
        val client = session.client ?: return emptyList()
        val events = runCatching { client.stateEventsOfTypes(roomId, CosmeticPacks.ROOM_PACK_TYPES) }.getOrDefault(emptyList())
        val packs = CosmeticPacks.parsePacks(roomId, CosmeticPacks.groupByStateKey(events))
        roomPacks[roomId] = Entry(System.currentTimeMillis(), packs)
        return packs
    }

    /** The account's own pack of uploaded decorations, effects and so on */
    suspend fun personal(session: MatrixSession): CosmeticPacks.Pack? {
        val content = session.accountDataJSON(CosmeticPacks.USER_PACK) ?: return null
        return CosmeticPacks.parsePack(null, "personal", listOf(content))
    }

    /** The subscription list, both event types read as one */
    suspend fun subscriptions(session: MatrixSession): Map<String, Map<String, JsonElement>> =
        CosmeticPacks.mergeSubscriptions(CosmeticPacks.SUBSCRIPTION_TYPES.map { session.accountDataJSON(it) })

    /** The packs this account is subscribed to, in subscription order */
    suspend fun subscribed(session: MatrixSession): List<CosmeticPacks.Pack> {
        val rooms = subscriptions(session)
        return coroutineScope {
            rooms.entries.map { (roomId, keys) ->
                async { roomPacks(session, roomId).filter { pack -> keys.containsKey(pack.stateKey) } }
            }.awaitAll().flatten()
        }
    }

    /** Every cosmetic pack in a joined room or space, for the picker */
    suspend fun discoverable(session: MatrixSession): List<CosmeticPacks.Pack> {
        val roomList = session.roomList ?: return emptyList()
        val ids = (roomList.joinedRooms.map { it.id } + roomList.spaces.map { it.id }).distinct()
        return coroutineScope { ids.map { id -> async { roomPacks(session, id) } }.awaitAll().flatten() }
            .sortedBy { it.displayName.lowercase() }
    }

    /** Writes both subscription events, so clients that only know one of them see the same list */
    suspend fun saveSubscriptions(session: MatrixSession, rooms: Map<String, Map<String, JsonElement>>) {
        val content = CosmeticPacks.subscriptionsJson(rooms)
        for (type in CosmeticPacks.SUBSCRIPTION_TYPES) session.setAccountDataJSON(type, content)
    }

    /** The one-shot image a pack effect opens with, looked up among the packs this account can see */
    suspend fun effectIntro(session: MatrixSession, mxc: String): String? {
        rebuildIntroIndex(session)
        return introByUrl[mxc]
    }

    private suspend fun rebuildIntroIndex(session: MatrixSession) {
        if (System.currentTimeMillis() - introAt < TTL_MS) return
        val packs = listOfNotNull(personal(session)) + subscribed(session)
        introByUrl.clear()
        for (pack in packs) for (item in pack.items) item.intro?.let { introByUrl.putIfAbsent(item.url, it) }
        introAt = System.currentTimeMillis()
    }
}
