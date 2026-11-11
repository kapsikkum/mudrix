package org.wizardchat.android.matrix

/** A room's or space's addresses (`#name:server`): which are shown, and the lists to send after each change */
object RoomAddresses {
    private val valid = Regex("^#[A-Za-z0-9.\\-_/=]+:[A-Za-z0-9.\\-_]+$")

    fun isValid(alias: String) = valid.matches(alias.trim())

    /** The addresses that are not the main one: published alternatives and the ones in the server's directory */
    fun others(canonical: String?, alt: List<String>, local: List<String>): List<String> =
        (alt + local).distinct().filter { it != canonical }

    /** Alternative addresses after adding `alias` (unchanged when it is already the main or an alternative one) */
    fun altAfterAdd(canonical: String?, alt: List<String>, alias: String): List<String> =
        if (alias == canonical || alias in alt) alt else alt + alias

    /** Main and alternative addresses after removing `alias` */
    fun afterRemove(canonical: String?, alt: List<String>, alias: String): Pair<String?, List<String>> =
        (if (canonical == alias) null else canonical) to alt.filter { it != alias }

    /** Main and alternative addresses after making `alias` the main one: the old main one stays as an alternative */
    fun afterSetMain(canonical: String?, alt: List<String>, alias: String): Pair<String, List<String>> =
        alias to ((listOfNotNull(canonical).filter { it != alias }) + alt.filter { it != alias }).distinct()
}

/** Who may join a room, as the room settings offer it */
enum class RoomAccess(val rule: String) {
    Invite("invite"),
    SpaceMembers("restricted"),
    Knock("knock"),
    Public("public"),
    ;

    companion object {
        /** The option for a join rule; `knock_restricted` counts as knocking, anything unknown as invite only */
        fun of(rule: String): RoomAccess = when (rule) {
            "public" -> Public
            "restricted" -> SpaceMembers
            "knock", "knock_restricted" -> Knock
            else -> Invite
        }
    }
}
