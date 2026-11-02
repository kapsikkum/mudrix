package org.wizardchat.android.ui.home

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.tokens.WZ

/** Joins a room or space by ID, alias or matrix.to link */
internal suspend fun MatrixSession.joinTarget(idOrAliasOrLink: String, via: List<String> = emptyList()): String {
    var target = idOrAliasOrLink.trim()
    target.indexOf("matrix.to/#/").takeIf { it >= 0 }?.let { target = target.substring(it + "matrix.to/#/".length) }
    val servers = via.toMutableList()
    val query = target.indexOf('?')
    if (query >= 0) {
        target.substring(query + 1).split('&').forEach { param ->
            val (name, value) = param.split('=', limit = 2).let { it[0] to it.getOrNull(1) }
            if (name == "via" && value != null) servers += Uri.decode(value)
        }
        target = target.substring(0, query)
    }
    target = Uri.decode(target)
    return requireClient.join(target, servers)
}
