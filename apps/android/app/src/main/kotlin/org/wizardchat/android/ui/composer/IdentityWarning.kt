package org.wizardchat.android.ui.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

@Composable
fun IdentityWarning(roomId: String, client: WizardClient, encrypted: Boolean) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val violations = remember(roomId) { mutableStateMapOf<String, Boolean>() }
    val names = remember(roomId) { mutableStateMapOf<String, String?>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    DisposableEffect(roomId, encrypted) {
        violations.clear()
        val me = session.userId
        val subscription = if (encrypted) {
            client.watchIdentityChanges(roomId) { changes ->
                for (change in changes) {
                    if (change.userId == me) continue
                    when (change.state) {
                        "verificationViolation" -> violations[change.userId] = true
                        "pinViolation" -> violations[change.userId] = false
                        else -> violations.remove(change.userId)
                    }
                }
            }
        } else {
            null
        }
        onDispose { subscription?.cancel() }
    }

    val current = violations.entries.sortedWith(compareBy({ !it.value }, { it.key })).firstOrNull() ?: return
    val userId = current.key
    val verified = current.value
    LaunchedEffect(userId) {
        if (userId !in names) names[userId] = session.memberProfile(userId, roomId).name
    }
    val name = names[userId] ?: userId
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space5)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.bgTertiary)
            .padding(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        PhIcon("warning", size = WZ.SizeIcon.md, tint = if (verified) theme.danger else theme.warningColor)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(
                L10n.format(if (verified) "identityWarning.verifiedReset" else "identityWarning.reset", name),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textPrimary,
            )
            Text(userId, style = wizardFont(WZ.FontSize.xs), color = theme.textMuted)
            error?.let { Text(it, style = wizardFont(WZ.FontSize.xs), color = theme.danger) }
        }
        BarTextButton(
            tr(if (verified) "identityWarning.withdraw" else "common.ok"),
            {
                if (busy) return@BarTextButton
                busy = true
                error = null
                scope.launch {
                    runCatching { client.acknowledgeIdentity(userId) }
                        .onFailure { error = L10n.format("identityWarning.failed", it.message ?: "") }
                    busy = false
                }
            },
            bold = true,
        )
    }
}
