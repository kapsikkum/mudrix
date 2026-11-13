package org.wizardchat.android.matrix

/** One slot of the Modern space rail: the Home slot when [space] is null, otherwise a top-level space. */
data class RailSlot(val space: RailSpace?, val unread: Boolean, val mentions: Int)

/** What the rail needs of a top-level space. */
data class RailSpace(val id: String, val name: String, val avatarUrl: String?)

/** What the rail counts for one joined room: the top-level spaces it is in and whether it notifies. */
data class RailRoom(val spaceIds: Set<String>, val unread: Boolean, val mentions: Int)

/** Rail order, unread and mention aggregation, badge text and the fallback when a remembered space is gone. */
object SpaceRail {
    /** Home first (every room in no space), then the spaces in the order the classic list uses. */
    fun slots(spaces: List<RailSpace>, rooms: List<RailRoom>): List<RailSlot> {
        val home = rooms.filter { it.spaceIds.isEmpty() }
        return buildList {
            add(RailSlot(null, home.any(::isUnread), home.sumOf { it.mentions }))
            for (space in spaces) {
                val inSpace = rooms.filter { space.id in it.spaceIds }
                add(RailSlot(space, inSpace.any(::isUnread), inSpace.sumOf { it.mentions }))
            }
        }
    }

    /** The mention badge's text, or null when there is nothing to show; counts stop at 99+ */
    fun badge(mentions: Int): String? = when {
        mentions <= 0 -> null
        mentions > 99 -> "99+"
        else -> "$mentions"
    }

    /** The remembered space when it still exists, otherwise null for Home */
    fun selected(saved: String?, spaces: List<RailSpace>): RailSpace? = spaces.firstOrNull { it.id == saved }

    /** A space's rooms are unread when any of them notifies or mentions */
    fun isUnread(room: RailRoom): Boolean = room.unread || room.mentions > 0
}
