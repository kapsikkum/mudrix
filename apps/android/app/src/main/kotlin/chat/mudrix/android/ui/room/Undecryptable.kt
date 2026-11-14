package chat.mudrix.android.ui.room

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import androidx.compose.material3.Text
import chat.mudrix.android.LocalSession
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.SecondaryButton
import chat.mudrix.android.ui.PrimaryButton
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.core.KeyRestoreProgress
import chat.mudrix.core.WizardError
import chat.mudrix.tokens.WZ

/**
 * Reasons a retry can help: a key may arrive from the backup or another session. A message sent before
 * this device joined, held back by the sender or from an untrusted sender can't be recovered by trying.
 */
internal fun canRetryDecryption(reason: String) = when (reason) {
    "sentBeforeWeJoined", "verificationViolation", "withheldForUnverifiedOrInsecureDevice", "withheldBySender" -> false
    else -> true
}

/** An unreadable message with "Try again" and, when this device can read the key backup, "Restore from key backup" */
@Composable
internal fun UndecryptableContent(roomId: String?, reason: String, label: @Composable () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var backupReadable by remember { mutableStateOf(false) }
    var retrying by remember { mutableStateOf(false) }
    var restore by remember { mutableStateOf<KeyRestoreProgress?>(null) }
    val canRetry = roomId != null && canRetryDecryption(reason)

    LaunchedEffect(session.client, canRetry) {
        if (!canRetry) return@LaunchedEffect
        // Only a backup whose key is on this device can be restored from
        backupReadable = runCatching { session.client?.encryptionStatus()?.backupEnabled }.getOrNull() == true
    }

    var help by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            label()
            HowToFixButton(help) { help = !help }
        }
        if (help) UndecryptableHelp(reason)
        restore?.let {
            Text(
                tr("timeline.undecryptable.restoreProgress", "${it.roomsDone}", "${it.roomsTotal}"),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
        }
        if (canRetry && roomId != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                if (backupReadable) {
                    PrimaryButton(
                        tr("timeline.undecryptable.restoreBackup"),
                        {
                            val client = session.client ?: return@PrimaryButton
                            scope.launch {
                                restore = KeyRestoreProgress(0, 0, 0)
                                try {
                                    val result = client.restoreKeyBackup { restore = it }
                                    CopyToast.show(L10n.format("timeline.undecryptable.restored", "${result.keysRestored}"))
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    CopyToast.show(
                                        if (e is WizardError && e.code == "noKeyBackup") {
                                            L10n.format("timeline.undecryptable.restoreNeedsKey")
                                        } else {
                                            L10n.format("timeline.undecryptable.restoreFailed", e.message ?: "")
                                        },
                                    )
                                } finally {
                                    restore = null
                                }
                            }
                        },
                        Modifier.weight(1f),
                        enabled = restore == null,
                    )
                }
                SecondaryButton(
                    tr("timeline.undecryptable.retry"),
                    {
                        val client = session.client ?: return@SecondaryButton
                        scope.launch {
                            retrying = true
                            try {
                                client.retryDecryption(roomId)
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                CopyToast.show(L10n.format("timeline.undecryptable.retryFailed", e.message ?: ""))
                            } finally {
                                retrying = false
                            }
                        }
                    },
                    Modifier.weight(1f),
                    enabled = !retrying && restore == null,
                )
            }
        }
    }
}

/** Shown at the top of the history when older messages stopped loading because this device can't read them */
@Composable
internal fun UndecryptableHistoryNotice(loading: Boolean, onLoadOlder: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space6),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(tr("timeline.undecryptable.historyPaused"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
        Text(tr("timeline.undecryptable.historyPausedReason"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        SecondaryButton(tr("timeline.undecryptable.loadOlder"), onLoadOlder, enabled = !loading)
    }
}
