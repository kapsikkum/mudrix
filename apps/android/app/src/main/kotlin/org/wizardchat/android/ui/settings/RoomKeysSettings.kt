package org.wizardchat.android.ui.settings

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomKeyFiles
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

private enum class KeyStep { None, ExportPassphrase, ImportPassphrase }

/** Export and import of the room keys as a passphrase-protected file (the format Element uses too) */
@Composable
internal fun RoomKeysSection() {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(KeyStep.None) }
    var passphrase by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var picked by remember { mutableStateOf<File?>(null) }

    fun fail(key: String, e: Exception) {
        val known = RoomKeyFiles.importErrorKey(e.message)?.let { L10n.format(it) }
        status = L10n.format(key, known ?: (e.message ?: e.toString())) to true
    }

    val create = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            val temp = File(context.cacheDir, "room-keys-export.txt")
            try {
                withContext(Dispatchers.IO) {
                    session.requireClient.exportRoomKeys(temp.absolutePath, passphrase)
                    context.contentResolver.openOutputStream(uri, "wt")!!.use { out -> temp.inputStream().use { it.copyTo(out) } }
                }
                status = L10n.format("settings.roomKeys.exportSuccess") to false
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                fail("settings.roomKeys.exportFailed", e)
            } finally {
                temp.delete()
                passphrase = ""
                confirm = ""
                busy = false
            }
        }
    }

    val open = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val temp = File(context.cacheDir, "room-keys-import.txt")
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)!!.use { input -> temp.outputStream().use { input.copyTo(it) } }
                }
                picked = temp
                passphrase = ""
                step = KeyStep.ImportPassphrase
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                fail("settings.roomKeys.importFailed", e)
            }
        }
    }

    fun close() {
        step = KeyStep.None
        picked?.delete()
        picked = null
        passphrase = ""
        confirm = ""
    }

    SettingsSection(tr("settings.roomKeys.title"), tr("settings.roomKeys.description")) {
        SettingsItem {
            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                LabelButton(tr("settings.roomKeys.exportBtn"), "export", {
                    status = null
                    passphrase = ""
                    confirm = ""
                    step = KeyStep.ExportPassphrase
                }, enabled = !busy)
                LabelButton(tr("settings.roomKeys.importBtn"), "download-simple", {
                    status = null
                    open.launch(arrayOf("*/*"))
                }, enabled = !busy)
            }
        }
    }
    status?.let { StatusText(it.first, isError = it.second) }

    if (step != KeyStep.None) {
        val exporting = step == KeyStep.ExportPassphrase
        val problem = if (exporting) RoomKeyFiles.exportProblem(passphrase, confirm) else if (passphrase.isEmpty()) "settings.roomKeys.passphrase" else null
        AlertDialog(
            onDismissRequest = { if (!busy) close() },
            containerColor = theme.bgTertiary,
            title = {
                Text(
                    tr(if (exporting) "settings.roomKeys.exportTitle" else "settings.roomKeys.importTitle"),
                    style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold),
                    color = theme.textPrimary,
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    WizardTextField(passphrase, { passphrase = it }, tr("settings.roomKeys.passphrase"), password = true, enabled = !busy)
                    if (exporting) {
                        WizardTextField(confirm, { confirm = it }, tr("settings.roomKeys.confirmPassphrase"), password = true, enabled = !busy)
                        if (confirm.isNotEmpty() && problem == "settings.roomKeys.passphraseMismatch") {
                            Text(tr(problem), style = wizardFont(WZ.FontSize.sm), color = theme.error)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = problem == null && !busy, onClick = {
                    if (exporting) {
                        step = KeyStep.None
                        create.launch("mudrix-room-keys.txt")
                    } else {
                        val file = picked ?: return@TextButton
                        val phrase = passphrase
                        scope.launch {
                            busy = true
                            try {
                                val result = withContext(Dispatchers.IO) { session.requireClient.importRoomKeys(file.absolutePath, phrase) }
                                status = L10n.format("settings.roomKeys.importSuccess", result.imported) to false
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                fail("settings.roomKeys.importFailed", e)
                            } finally {
                                busy = false
                                close()
                            }
                        }
                    }
                }) {
                    Text(
                        tr(if (exporting) "settings.roomKeys.exportBtn" else "settings.roomKeys.importBtn"),
                        color = theme.accent,
                        style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    )
                }
            },
            dismissButton = {
                TextButton(enabled = !busy, onClick = { close() }) {
                    Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg))
                }
            },
        )
    }
}
