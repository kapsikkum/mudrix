package org.wizardchat.android.ui.room

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.core.MediaSource
import org.wizardchat.tokens.WZ

/**
 * The app's own menu for a picture or video it holds (the web's right-click menu, M10): Copy image, and Save into a file
 * the system's save dialog asks for (no storage permission needed). The sheet stays up until the save dialog answers,
 * because the dialog's result is only delivered while this composable exists.
 */
@Composable
internal fun LocalMediaMenu(
    source: MediaSource,
    filename: String,
    mimetype: String?,
    isImage: Boolean,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mimetype ?: "*/*")) { target ->
        if (target == null || loader == null) {
            onDismiss()
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            val saved = runCatching {
                val file = loader.file(source, filename)
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(target)?.use { out -> file.inputStream().use { it.copyTo(out) } }
                        ?: error("The file could not be opened")
                }
            }.isSuccess
            CopyToast.show(if (saved) L10n.format("common.downloadSaved", filename) else L10n.format("common.downloadFailed"))
            onDismiss()
        }
    }

    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = WZ.Space.space4)) {
            if (isImage) {
                MenuRow(L10n.format("common.copyImage"), "copy", enabled = !busy) {
                    val client = loader ?: return@MenuRow
                    busy = true
                    scope.launch {
                        val copied = runCatching {
                            val file = client.file(source, filename)
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newUri(context.contentResolver, filename, shareableUri(context, file)))
                        }.isSuccess
                        CopyToast.show(L10n.format(if (copied) "common.copied" else "common.copyImageFailed"))
                        onDismiss()
                    }
                }
            }
            MenuRow(L10n.format(if (isImage) "common.saveImage" else "common.saveVideo"), "download-simple", enabled = !busy) {
                busy = true
                saver.launch(filename)
            }
        }
    }
}

@Composable
private fun MenuRow(label: String, icon: String, enabled: Boolean, onClick: () -> Unit) {
    val color = if (enabled) theme.textPrimary else theme.textMuted
    Row(
        Modifier.fillMaxWidth().heightIn(min = WZ.Space.space11).clickable(enabled = enabled, onClick = onClick).padding(horizontal = WZ.Space.space6),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        PhIcon(icon, tint = color)
        Text(label, style = wizardFont(WZ.FontSize.lg), color = color)
    }
}
