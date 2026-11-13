package org.wizardchat.android.matrix

import org.wizardchat.android.media.CompressTarget
import org.wizardchat.android.media.ImagePrep

/** Where the background upload of a composer attachment is */
enum class UploadStatus { Uploading, Done, Failed }

/** One attachment's background upload: what it is doing and how far it got */
data class UploadState(val status: UploadStatus, val progress: Float)

/** Tracks the background uploads of a composer's attachments so a send can reuse them, like the web's `attachmentUploads.ts` */
class ComposerUploads {
    /** What sending does with one attachment: reuse what is uploaded, wait for it, or upload it now */
    enum class SendPlan { Reuse, Wait, Upload }

    private val states = LinkedHashMap<Long, UploadState>()
    private val tokens = HashMap<Long, Long>()
    private var lastToken = 0L

    /** Starts the upload of [id] and returns its token, which keeps an older attempt's result out */
    fun start(id: Long): Long {
        val token = ++lastToken
        tokens[id] = token
        states[id] = UploadState(UploadStatus.Uploading, 0f)
        return token
    }

    /** Starts a failed upload again; null when it never failed or is still running */
    fun retry(id: Long): Long? = if (states[id]?.status == UploadStatus.Failed) start(id) else null

    /** Records how far an upload got; a late call from an older attempt is ignored */
    fun progress(id: Long, token: Long, fraction: Float) {
        if (tokens[id] != token) return
        states[id] = UploadState(UploadStatus.Uploading, fraction.coerceIn(0f, 1f))
    }

    /** Marks the upload finished, with its file ready to send */
    fun finish(id: Long, token: Long) {
        if (tokens[id] != token) return
        states[id] = UploadState(UploadStatus.Done, 1f)
    }

    /** Marks the upload failed, to be tried again when it is sent or by hand */
    fun fail(id: Long, token: Long) {
        if (tokens[id] != token) return
        states[id] = UploadState(UploadStatus.Failed, 0f)
    }

    /** Forgets the upload (removed, sent, or the room left): a result arriving later is ignored */
    fun forget(id: Long) {
        states.remove(id)
        tokens[id] = ++lastToken
    }

    /** The upload's state, or null when it has none */
    fun state(id: Long): UploadState? = states[id]

    /** Whether [token] is the attempt this attachment is still waiting for */
    fun isCurrent(id: Long, token: Long): Boolean = tokens[id] == token

    /** What sending does with the attachment */
    fun plan(id: Long): SendPlan = when (states[id]?.status) {
        UploadStatus.Done -> SendPlan.Reuse
        UploadStatus.Uploading -> SendPlan.Wait
        else -> SendPlan.Upload
    }

    /** Every tracked upload, for drawing the tray */
    fun snapshot(): Map<Long, UploadState> = states.toMap()
}

/** Whether an attachment's bytes are final when it is added, so it can upload before it is sent (the web's rule) */
fun canPreupload(size: Long, maxUploadBytes: Long, videoTarget: CompressTarget?, imageWillProcess: Boolean): Boolean =
    size <= maxUploadBytes && videoTarget == null && !imageWillProcess

/** Whether the photo settings would rewrite these bytes (only JPEG and PNG are ever cleaned or scaled, like the web) */
fun imageWillProcess(mimetype: String, options: ImagePrep.Options?): Boolean =
    options != null && (mimetype == "image/jpeg" || mimetype == "image/png")
