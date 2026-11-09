package org.wizardchat.android.ui.room

import android.net.Uri
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.home.Navigator
import org.wizardchat.android.ui.home.joinTarget
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.SpaceSummary

object RoomLinks {
    private const val PREFIX = "https://matrix.to/#/"

    fun target(url: String): String? {
        if (!url.startsWith(PREFIX)) return null
        val path = url.removePrefix(PREFIX).substringBefore('?')
        val parts = path.split('/').map { Uri.decode(it) }
        val id = parts.firstOrNull() ?: return null
        if (!(id.startsWith('#') || id.startsWith('!')) || !id.contains(':')) return null
        if (parts.size > 1 && parts[1].isNotEmpty()) return null
        return id
    }

    fun knownName(url: String, roomList: RoomListModel?): String? {
        val target = target(url) ?: return null
        roomList?.joinedRooms?.firstOrNull { it.id == target || it.canonicalAlias == target }?.let { return it.name }
        return roomList?.allSpaces?.firstOrNull { it.id == target }?.name
    }

    fun link(room: RoomSummary): String {
        room.canonicalAlias?.let { return PREFIX + it }
        return PREFIX + room.id + via(room.id)
    }

    fun link(space: SpaceSummary): String = PREFIX + space.id + via(space.id)

    private fun via(id: String): String = id.substringAfter(':', "").takeIf { it.isNotEmpty() }?.let { "?via=$it" } ?: ""

    suspend fun open(url: String, session: MatrixSession, roomList: RoomListModel?, navigator: Navigator) {
        val target = target(url) ?: return
        val known = roomList?.joinedRooms?.firstOrNull { it.id == target || it.canonicalAlias == target }
        val roomId = known?.id
            ?: roomList?.allSpaces?.firstOrNull { it.id == target }?.id
            ?: runCatching { session.joinTarget(url) }.getOrElse { error ->
                CopyToast.show(L10n.format("common.joinFailed", error.message ?: error.toString()))
                return
            }
        val isSpace = roomList?.allSpaces?.any { it.id == roomId } == true || roomList?.room(roomId)?.isSpace == true
        if (isSpace) navigator.openSpace(roomId) else navigator.openRoom(roomId)
    }
}
