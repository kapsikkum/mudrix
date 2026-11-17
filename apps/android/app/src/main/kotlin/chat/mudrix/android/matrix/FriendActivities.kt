package chat.mudrix.android.matrix

/** A DM partner the home friends feed may list */
data class FriendCandidate(val userId: String, val roomId: String, val name: String, val avatarUrl: String?)

/** A friend with something they are playing or listening to right now */
data class FriendActivity(
    val userId: String,
    val roomId: String,
    val name: String,
    val avatarUrl: String?,
    val activities: List<ProfileActivity>,
)

/**
 * The Home screen's "Friends activity" panel: the people we have a direct chat with who are playing a game or
 * listening to something right now (the `activity` profile field), the web's `useFriendActivities.ts`. Games are not
 * detected on Android, so in practice this lists what people share from their other devices.
 */
object FriendActivities {
    /** People checked for something to show, like the web */
    const val MAX_FRIENDS = 20

    /** Rows the panel shows */
    const val SHOWN = 5

    /** Direct chats in list order, one row per person, at most [MAX_FRIENDS] of them */
    fun candidates(directRooms: List<FriendCandidate>): List<FriendCandidate> {
        val seen = mutableSetOf<String>()
        return directRooms.filter { it.userId.isNotEmpty() && seen.add(it.userId) }.take(MAX_FRIENDS)
    }

    /** The candidates with at least one activity that has not run out yet, in candidate order */
    fun feed(
        candidates: List<FriendCandidate>,
        activities: Map<String, List<ProfileActivity>>,
        now: Long = System.currentTimeMillis(),
    ): List<FriendActivity> = candidates.mapNotNull { candidate ->
        val live = ProfileFields.live(activities[candidate.userId].orEmpty(), now)
        if (live.isEmpty()) {
            null
        } else {
            FriendActivity(candidate.userId, candidate.roomId, candidate.name, candidate.avatarUrl, live)
        }
    }
}
