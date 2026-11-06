package org.wizardchat.android.matrix

import android.graphics.BitmapFactory
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.media.ImagePrep
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.AttachmentOptions

/** A file shared into the app, copied to the cache until it's sent */
data class SharedFile(
    val file: File,
    val name: String,
    val mimetype: String,
    val width: Long? = null,
    val height: Long? = null,
)

/** Sends what another app shared into WizardChat; the share screen runs in the app's own process */
object ShareSender {
    private val scope = MainScope()

    fun send(roomId: String, text: String?, files: List<SharedFile>) {
        scope.launch {
            val session = WizardApplication.instance.session
            runCatching { session.restore() }
            var room = session.roomList?.room(roomId)
            repeat(40) {
                if (room != null) return@repeat
                delay(250)
                room = session.roomList?.room(roomId)
            }
            val summary = room ?: return@launch
            val client = session.roomList?.client ?: return@launch
            val timeline = runCatching { client.timeline(roomId) }.getOrNull() ?: return@launch
            for (shared in files) {
                val read = withContext(Dispatchers.IO) { runCatching { shared.file.readBytes() }.getOrNull() } ?: continue
                // Photos lose their details and shrink as in the composer; a photo that cannot be cleaned is not sent
                val prefs = WizardApplication.instance.prefs
                val options = ImagePrep.Options(prefs.photoStripMetadata, prefs.photoUploadSize.maxSide)
                var width = shared.width
                var height = shared.height
                val bytes = if (shared.mimetype.startsWith("image/")) {
                    val prepared = withContext(Dispatchers.Default) { runCatching { ImagePrep.prepare(read, options) } }
                    if (prepared.isFailure && options.stripMetadata) {
                        withContext(Dispatchers.IO) { shared.file.delete() }
                        continue
                    }
                    (prepared.getOrNull() ?: read).also {
                        if (it !== read) {
                            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(it, 0, it.size, bounds)
                            if (bounds.outWidth > 0) {
                                width = bounds.outWidth.toLong()
                                height = bounds.outHeight.toLong()
                            }
                        }
                    }
                } else {
                    read
                }
                runCatching {
                    timeline.sendFile(
                        bytes,
                        AttachmentOptions(filename = shared.name, mimetype = shared.mimetype, width = width, height = height),
                    )
                }
                withContext(Dispatchers.IO) { shared.file.delete() }
            }
            if (text != null) runCatching { timeline.sendText(text) }
            CopyToast.show(L10n.format("share.sentTo", summary.displayName))
        }
    }
}
