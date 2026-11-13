package org.wizardchat.android.ui.composer

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.content.MediaType
import androidx.compose.foundation.content.consume
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.content.hasMediaType
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.Emoticons
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.Emoji
import org.wizardchat.android.matrix.MediaMetadata
import org.wizardchat.android.media.FileSize
import org.wizardchat.android.media.ImagePrep
import org.wizardchat.android.media.VideoCompressor
import org.wizardchat.android.media.VideoMeta
import org.wizardchat.android.media.VideoPlan
import org.wizardchat.android.media.VideoQuality
import org.wizardchat.android.matrix.OutgoingFile
import org.wizardchat.android.matrix.PacksStore
import org.wizardchat.android.matrix.ScheduledMessages
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.matrix.UploadState
import org.wizardchat.android.matrix.UploadStatus
import org.wizardchat.android.matrix.canPreupload
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.imageWillProcess
import org.wizardchat.android.matrix.text
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.integrations.IntegrationMatching
import org.wizardchat.android.integrations.IntegrationStore
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.withNameColors
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.room.RoomLinks
import org.wizardchat.android.ui.room.ScheduleSheet
import org.wizardchat.android.ui.tr
import org.wizardchat.core.Member
import org.wizardchat.core.PackImage
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** A file waiting in the composer's tray until the message is sent */
class PendingAttachment(val file: File, val thumbnail: Bitmap?, val isVideo: Boolean, val mime: String, val id: Long = nextId++) {
    /** Length, size and bitrate of a video, once read; the size choices need them */
    var meta by mutableStateOf<VideoMeta?>(null)

    /** What the user picked for this video; null leaves it to the settings */
    var pick by mutableStateOf<VideoQuality?>(null)

    private companion object {
        var nextId = 0L
    }
}

private sealed interface Suggestion {
    data class MemberItem(val member: Member) : Suggestion
    data class RoomItem(val name: String, val avatarUrl: String?, val detail: String?, val link: String) : Suggestion
    data class EmojiItem(val emoji: Emoji) : Suggestion
    data class Custom(val image: PackImage) : Suggestion
    data class Command(val name: String, val description: String) : Suggestion
}

/** The soft keyboard's settled height by screen width (portrait and landscape differ); the docked picker takes its place */
private val keyboardHeights = mutableStateMapOf<Int, Dp>()

/**
 * The message bar under the timeline: draft (saved per room), mention, emoji and command
 * suggestions, reply/edit banners, attachments, formatting, voice messages, stickers and GIFs.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ComposerView(
    timeline: TimelineModel,
    room: RoomSummary,
    replyTo: ChatEntry?,
    onReplyToChange: (ChatEntry?) -> Unit,
    editing: ChatEntry?,
    onEditingChange: (ChatEntry?) -> Unit,
    onTyping: (Boolean) -> Unit,
    threadRoot: String? = null,
) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current

    val draft = rememberTextFieldState()
    val attachments = remember { mutableStateListOf<PendingAttachment>() }
    val packStore = remember { PacksStore() }
    val usedEmotes = remember { HashMap<String, PackImage>() }
    val mentions = remember { HashMap<String, String>() }
    val roomLinks = remember { HashMap<String, String>() }
    var members by remember { mutableStateOf(listOf<Member>()) }
    var pickerTab by remember { mutableStateOf<MediaPickerTab?>(null) }
    var plusMenu by remember { mutableStateOf(false) }
    var clipboardHasImages by remember { mutableStateOf(false) }
    var showPoll by remember { mutableStateOf(false) }
    var showLocation by remember { mutableStateOf(false) }
    var showSchedule by remember { mutableStateOf(false) }
    val recorder = remember { VoiceRecorder(context.applicationContext, scope) }
    var focused by remember { mutableStateOf(false) }
    // The formatting bar stays open, picked from the + menu (it also shows while text is selected)
    var formatting by remember { mutableStateOf(false) }
    var preparing by remember { mutableIntStateOf(0) }
    // Set while the keyboard comes back in the picker's place, so the composer does not jump
    var holdingDock by remember { mutableStateOf(false) }
    val pickerOpen = pickerTab != null
    val docked = pickerOpen || holdingDock
    val pickerHeight = (keyboardHeights[configuration.screenWidthDp] ?: (configuration.screenHeightDp * 0.45f).dp) +
        WZ.Space.space4 - WZ.Space.space3

    val text = draft.text.toString()
    val trimmed = text.trim()
    // Installed integrations: commands, "+" menu entries and API actions (nothing is sent without a confirmation)
    val integrations = IntegrationStore.get(context)
    val integrationCommands = remember(integrations.installed, integrations.grants, integrations.settings) {
        IntegrationMatching.commands(integrations.installed, integrations.grants, SlashCommand.builtinNames, integrations.settings)
    }
    val integrationInserts = remember(integrations.installed, integrations.grants, integrations.settings) {
        IntegrationMatching.composerActions(integrations.installed, integrations.grants, integrations.settings)
    }
    val integrationApis = remember(integrations.installed, integrations.grants, integrations.settings) {
        IntegrationMatching.apiActions(integrations.installed, integrations.grants, integrations.settings)
    }
    var apiRequest by remember { mutableStateOf<ApiRequest?>(null) }
    val uploadPrefs = prefs.videoUploadPrefs()
    val canSend = (trimmed.isNotEmpty() || attachments.isNotEmpty() || editing?.editableMedia != null) && preparing == 0
    val isRecording = recorder.state == VoiceRecorder.State.recording || recorder.state == VoiceRecorder.State.paused
    val hasSelection = !draft.selection.collapsed
    val draftKey = threadRoot?.let { "draft.${room.id}.$it" } ?: "draft.${room.id}"

    val currentEditing by rememberUpdatedState(editing)
    val currentOnTyping by rememberUpdatedState(onTyping)
    val currentReplyTo by rememberUpdatedState(replyTo)

    fun focus(on: Boolean) {
        if (on) runCatching { focusRequester.requestFocus() } else focusManager.clearFocus()
    }

    /** The picker takes the keyboard's place, so the keyboard goes away first */
    fun openPicker(tab: MediaPickerTab) {
        keyboard?.hide()
        focusManager.clearFocus()
        pickerTab = tab
    }

    fun closePicker(showKeyboard: Boolean) {
        if (pickerTab == null) return
        pickerTab = null
        if (showKeyboard) {
            holdingDock = true
            focus(true)
        }
    }

    BackHandler(enabled = pickerOpen) { closePicker(showKeyboard = false) }

    fun setDraft(value: String) = draft.setTextAndPlaceCursorAtEnd(value)

    /** Uploads an attachment in the background when its bytes are final, like the web composer; cancels one that no longer applies */
    fun startPreupload(attachment: PendingAttachment) {
        val limit = session.uploadLimit
        val prep = ImagePrep.Options(prefs.photoStripMetadata, prefs.photoUploadSize.maxSide)
            .takeIf { it.stripMetadata || it.maxSide != null }
        val target = if (attachment.isVideo && VideoCompressor.isSupported) {
            val quality = attachment.pick ?: VideoPlan.defaultQuality(uploadPrefs, attachment.file.length(), limit, true)
            VideoPlan.qualityTarget(quality, uploadPrefs, limit)
        } else {
            null
        }
        val allowed = canPreupload(
            size = attachment.file.length(),
            maxUploadBytes = limit,
            videoTarget = if (attachment.isVideo) target else null,
            imageWillProcess = imageWillProcess(attachment.mime, prep),
        )
        if (allowed) {
            timeline.preupload(attachment.id, Uri.fromFile(attachment.file))
        } else {
            timeline.cancelPreupload(attachment.id)
        }
    }

    fun addUri(uri: Uri, keepName: Boolean) {
        preparing += 1
        scope.launch {
            try {
                val resolver = context.contentResolver
                val mime = resolver.getType(uri)
                val data = withContext(Dispatchers.IO) { runCatching { resolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() }
                    ?: return@launch
                val isImage = mime?.startsWith("image/") == true
                val isVideo = mime?.startsWith("video/") == true
                val ext = mime?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
                    ?: if (isImage) "jpg" else "bin"
                val original = if (keepName) displayName(context, uri) else null
                val name = original ?: "${if (isVideo) "video" else if (isImage) "image" else "file"}-${System.currentTimeMillis()}.$ext"
                val file = MediaMetadata.temporaryCopy(data, name)
                val attachment = PendingAttachment(file, if (isImage) thumbnail(data) else null, isVideo, mime ?: "application/octet-stream")
                attachments.add(attachment)
                startPreupload(attachment)
                if (isVideo) {
                    scope.launch {
                        val video = MediaMetadata.video(Uri.fromFile(file))
                        val size = video.size
                        val duration = video.duration
                        if (size != null && duration != null && duration > 0) {
                            attachment.meta = VideoMeta(duration, size.first, size.second, file.length() * 8.0 / duration)
                        }
                    }
                }
            } finally {
                preparing = maxOf(preparing - 1, 0)
            }
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        uris.forEach { addUri(it, keepName = false) }
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { addUri(it, keepName = true) }
    }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = cameraUri
        if (saved && uri != null) addUri(uri, keepName = false)
    }
    fun launchCamera() {
        val file = File(context.cacheDir, "camera-${System.currentTimeMillis()}.jpg")
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        cameraUri = uri
        takePicture.launch(uri)
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera()
    }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) recorder.start() else recorder.state = VoiceRecorder.State.denied
    }

    fun startRecording() {
        recorder.state = VoiceRecorder.State.requesting
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            recorder.start()
        } else {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun pasteImages() {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = clipboard.primaryClip ?: return
        for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let { addUri(it, keepName = false) }
    }

    val currentToken = text.split(" ").lastOrNull()?.takeIf { it.isNotEmpty() && !it.contains("\n") }
    val suggestions: List<Suggestion> = when {
        text.startsWith("/") && !text.contains(" ") -> {
            val query = text.drop(1).lowercase()
            SlashCommand.all.filter { it.name.startsWith(query) }.map { Suggestion.Command(it.name, it.description) } +
                integrationCommands.filter { it.name.lowercase().startsWith(query) }
                    .map { Suggestion.Command(it.name, L10n.format("integrations.command.description", it.description, it.integrationName)) }
        }
        currentToken == null -> emptyList()
        currentToken.startsWith("@") && currentToken.length >= 2 -> {
            val query = currentToken.drop(1)
            members.filter {
                (it.displayName ?: "").contains(query, ignoreCase = true) || it.userId.contains(query, ignoreCase = true)
            }.take(6).map { Suggestion.MemberItem(it) }
        }
        currentToken.startsWith("#") && !currentToken.drop(1).contains("#") -> {
            val query = currentToken.drop(1)
            val roomList = session.roomList
            val rooms = roomList?.joinedRooms.orEmpty()
                .filter { !it.isDirect && !it.isInvite && !it.isTombstoned }
                .map { Suggestion.RoomItem(it.displayName, it.avatarUrl, if (it.isSpace) tr("explore.typeSpace") else it.canonicalAlias, RoomLinks.link(it)) }
            val spaces = roomList?.allSpaces.orEmpty()
                .filter { space -> rooms.none { it.link.contains(space.id) } }
                .map { Suggestion.RoomItem(it.name, it.avatarUrl, tr("explore.typeSpace"), RoomLinks.link(it)) }
            (rooms + spaces)
                .filter { it.name.contains(query, ignoreCase = true) || it.detail?.contains(query, ignoreCase = true) == true }
                .sortedByDescending { it.name.startsWith(query, ignoreCase = true) }
                .take(6)
        }
        currentToken.startsWith(":") && currentToken.length >= 3 && !currentToken.drop(1).contains(":") -> {
            val query = currentToken.drop(1)
            val custom = packStore.packs.flatMap { pack -> pack.images.filter { it.emoticon && it.shortcode.contains(query, ignoreCase = true) } }
                .take(4).map { Suggestion.Custom(it) }
            val emoji = Emoji.all.filter { emoji -> emoji.s.any { it.startsWith(query.lowercase()) } }.take(6).map { Suggestion.EmojiItem(it) }
            custom + emoji
        }
        else -> emptyList()
    }

    fun apply(suggestion: Suggestion) {
        if (suggestion is Suggestion.Command) {
            setDraft("/${suggestion.name} ")
            return
        }
        val token = currentToken ?: return
        val base = text.dropLast(token.length)
        when (suggestion) {
            is Suggestion.MemberItem -> {
                val name = suggestion.member.displayName ?: suggestion.member.userId
                mentions[name] = suggestion.member.userId
                setDraft("$base$name ")
            }
            is Suggestion.RoomItem -> {
                val label = "#${suggestion.name}"
                roomLinks[label] = suggestion.link
                setDraft("$base$label ")
            }
            is Suggestion.EmojiItem -> setDraft("$base${suggestion.emoji.e} ")
            is Suggestion.Custom -> {
                usedEmotes[suggestion.image.shortcode] = suggestion.image
                setDraft("$base:${suggestion.image.shortcode}: ")
            }
            is Suggestion.Command -> Unit
        }
    }

    fun wrap(open: String, close: String, block: Boolean) {
        val selection = draft.selection
        val selected = text.substring(selection.min, selection.max)
        var before = text.substring(0, selection.min)
        if (block && before.isNotEmpty() && !before.endsWith("\n")) before += "\n"
        val after = text.substring(selection.max)
        val result = before + open + selected + close + after
        val cursor = before.length + open.length + selected.length + if (selected.isEmpty()) 0 else close.length
        draft.edit {
            replace(0, length, result)
            this.selection = TextRange(cursor)
        }
    }

    /** Puts plain text at the cursor (an integration's insert); it is never sent on its own */
    fun insertAtCursor(insert: String) {
        val selection = draft.selection
        draft.edit {
            replace(selection.min, selection.max, insert)
            this.selection = TextRange(selection.min + insert.length)
        }
    }

    /** Prefixes each selected line, prefix getting its 1-based number */
    fun prefixLines(prefix: (Int) -> String) {
        val selection = draft.selection
        val lineStart = if (selection.min == 0) 0 else text.lastIndexOf('\n', selection.min - 1) + 1
        val lineEnd = text.indexOf('\n', selection.max).let { if (it < 0) text.length else it }
        val replaced = text.substring(lineStart, lineEnd).split("\n")
            .mapIndexed { index, line -> prefix(index + 1) + line }
            .joinToString("\n")
        draft.edit {
            replace(lineStart, lineEnd, replaced)
            this.selection = TextRange(lineStart + replaced.length)
        }
    }

    suspend fun send(message: String, reply: String?) {
        val message = if (prefs.emoticonsToEmoji) Emoticons.replaceInMessage(message) else message
        val links = roomLinks.filterKeys { message.contains(it) }.entries.sortedByDescending { it.key.length }
        val body = links.fold(message) { text, (label, link) -> text.replace(label, RoomLinks.target(link) ?: link) }
        val html = richHtml(body, usedEmotes, mentions, timeline.client, links.associate { (_, link) -> (RoomLinks.target(link) ?: link) to link })
        usedEmotes.clear()
        mentions.clear()
        roomLinks.clear()
        timeline.send(body, html = html, replyTo = reply)
    }

    /** Has the homeserver send the draft after [delayMs] (send later); throws when it can't, leaving the draft alone */
    suspend fun scheduleSend(delayMs: Long) {
        val message = trimmed
        if (message.isEmpty()) throw IllegalStateException(L10n.format("composer.schedule.noDraft"))
        if (message.startsWith("/") && !message.startsWith("//")) throw IllegalStateException(L10n.format("composer.schedule.noCommands"))
        val prepared = if (prefs.emoticonsToEmoji) Emoticons.replaceInMessage(message) else message
        val links = roomLinks.filterKeys { prepared.contains(it) }.entries.sortedByDescending { it.key.length }
        val body = links.fold(prepared) { text, (label, link) -> text.replace(label, RoomLinks.target(link) ?: link) }
        val html = richHtml(body, usedEmotes, mentions, timeline.client, links.associate { (_, link) -> (RoomLinks.target(link) ?: link) to link })
            ?: runCatching { timeline.client.markdownToHtml(body) }.getOrNull()
        val mentioned = mentions.filterKeys { body.contains(it) }.values.toList()
        val content = ScheduledMessages.content(body, html, mentioned, replyTo?.eventId, threadRoot)
        timeline.client.sendDelayedEvent(room.id, "m.room.message", content, delayMs, null)
        usedEmotes.clear()
        mentions.clear()
        roomLinks.clear()
        setDraft("")
        onReplyToChange(null)
    }

    suspend fun submit() {
        val message = trimmed
        val reply = replyTo?.eventId
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        // The keyboard stays up so you can keep typing

        editing?.let { entry ->
            onEditingChange(null)
            setDraft("")
            timeline.edit(entry, message)
            return
        }

        if (attachments.isNotEmpty()) {
            val pending = attachments.toList()
            attachments.clear()
            setDraft("")
            onReplyToChange(null)
            val limit = session.uploadLimit
            val videoTargets = pending.mapNotNull { attachment ->
                if (!attachment.isVideo || !VideoCompressor.isSupported) return@mapNotNull null
                val quality = attachment.pick ?: VideoPlan.defaultQuality(uploadPrefs, attachment.file.length(), limit, true)
                VideoPlan.qualityTarget(quality, uploadPrefs, limit)?.let { Uri.fromFile(attachment.file) to it }
            }.toMap()
            val image = ImagePrep.Options(prefs.photoStripMetadata, prefs.photoUploadSize.maxSide).takeIf { it.stripMetadata || it.maxSide != null }
            timeline.sendFiles(
                pending.map { OutgoingFile(Uri.fromFile(it.file), it.thumbnail, it.id) },
                caption = message.ifEmpty { null },
                replyTo = reply,
                prep = TimelineModel.SendPrep(image, videoTargets, session.knownUploadLimit),
            )
            return
        }

        setDraft("")
        onReplyToChange(null)
        if (message.startsWith("/") && !message.startsWith("//")) {
            val typed = message.drop(1).takeWhile { !it.isWhitespace() }.lowercase()
            val args = message.drop(1 + typed.length).trim(' ', '\t')
            val custom = integrationCommands.firstOrNull { it.name.lowercase() == typed }
            if (custom != null) {
                if (custom.api != null) {
                    apiRequest = ApiRequest(custom.integrationId, custom.api, room.id, args, args)
                } else {
                    // Replaces the draft; the person decides whether to send it
                    setDraft(IntegrationMatching.renderInsert(custom.insert.orEmpty(), room.id, args, custom.settings))
                }
                return
            }
            val result = SlashCommand.run(message, timeline, session, reply)
            if (result != null) {
                if (result == SlashCommand.Result.unknown) send(message, reply)
                return
            }
        }
        send(if (message.startsWith("//")) message.drop(1) else message, reply)
    }

    fun sentSomething() {
        onReplyToChange(null)
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        focus(false)
    }

    suspend fun sendSticker(sticker: PackImage) {
        val reply = currentReplyTo?.eventId
        val source = JsonObject(mapOf("url" to JsonPrimitive(sticker.url)))
        val info = runCatching { timeline.client.media(source) }.getOrNull()?.let { data ->
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
            if (bounds.outWidth <= 0) return@let null
            val isGif = data.startsWith(0x47, 0x49, 0x46)
            buildJsonObject {
                put("w", bounds.outWidth)
                put("h", bounds.outHeight)
                put("size", data.size)
                put("mimetype", if (isGif) "image/gif" else if (data.startsWith(0x89, 0x50)) "image/png" else "image/webp")
                if (isAnimatedImage(data)) put("is_animated", true)
            }
        } ?: JsonObject(emptyMap())
        timeline.sendSticker(sticker.url, sticker.text, info, reply)
        sentSomething()
    }

    suspend fun sendGif(gif: GiphyGif) {
        val data = download(gif.url)
        val mxc = data?.let { runCatching { timeline.client.uploadMedia(it, "image/gif") }.getOrNull() }
        if (data == null || mxc == null) {
            timeline.sendError = L10n.format("composer.gifSendFailed")
            return
        }
        val info = buildJsonObject {
            put("mimetype", "image/gif")
            put("w", gif.width)
            put("h", gif.height)
            put("size", data.size)
        }
        timeline.sendSticker(mxc, gif.title.ifEmpty { "GIF" }, info, currentReplyTo?.eventId)
        sentSomething()
    }

    fun insertEmoji(emoji: String, image: PackImage?) {
        if (image != null) usedEmotes[image.shortcode] = image
        setDraft(draft.text.toString() + emoji)
    }

    LaunchedEffect(room.id) { packStore.load(session, room.id) }
    LaunchedEffect(room.id) { members = timeline.members() }
    LaunchedEffect(room.id) {
        if (draft.text.isEmpty() && currentEditing == null) composerDefaults.getString(draftKey, null)?.let { setDraft(it) }
        snapshotFlow { draft.text.toString() }.collect { value ->
            currentOnTyping(value.isNotEmpty())
            if (currentEditing == null) {
                if (value.isEmpty()) composerDefaults.edit().remove(draftKey).apply()
                else composerDefaults.edit().putString(draftKey, value).apply()
            }
        }
    }
    LaunchedEffect(editing?.id) {
        val text = editing?.editableText ?: return@LaunchedEffect
        setDraft(text)
        focus(true)
    }
    LaunchedEffect(replyTo?.id) { if (replyTo != null) focus(true) }
    LaunchedEffect(focused) { if (focused) closePicker(showKeyboard = true) }
    val imeInsets = WindowInsets.ime
    LaunchedEffect(configuration.screenWidthDp) {
        snapshotFlow { imeInsets.getBottom(density) }
            .distinctUntilChanged()
            .debounce(160)
            .collect { px -> if (px > 0) keyboardHeights[configuration.screenWidthDp] = with(density) { px.toDp() } }
    }
    LaunchedEffect(holdingDock) {
        if (holdingDock) {
            withTimeoutOrNull(1_000) {
                snapshotFlow { imeInsets.getBottom(density) }
                    .distinctUntilChanged()
                    .debounce(120)
                    .first { it > 0 }
            }
            holdingDock = false
        }
    }
    LaunchedEffect(timeline.sendError) {
        if (timeline.sendError != null) {
            delay(5000)
            timeline.sendError = null
        }
    }

    // While docked, the picker fills the keyboard's space, so the composer drops its keyboard/gesture-bar inset
    Column(
        Modifier
            .fillMaxWidth()
            .then(if (docked) Modifier else Modifier.windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime)))
            .padding(horizontal = WZ.Space.space4)
            .padding(top = WZ.Space.space2, bottom = if (docked) 0.dp else WZ.Space.space4)
            .animateContentSize(tween(WZ.MotionDuration.slow)),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        if (suggestions.isNotEmpty()) SuggestionList(suggestions, ::apply)
        timeline.sendError?.let { error ->
            Text(
                error,
                Modifier.padding(horizontal = WZ.Space.space6).clickable { timeline.sendError = null },
                style = wizardFont(WZ.FontSize.sm),
                color = theme.error,
            )
        }
        if (isRecording) {
            RecordingBar(
                recorder,
                Modifier.floatingGlass(CircleShape, theme.bgTertiary),
                onSend = {
                    val result = recorder.finish()
                    if (result != null) {
                        val reply = replyTo?.eventId
                        sentSomething()
                        scope.launch { timeline.sendVoiceMessage(result.file, result.duration, result.waveform, reply) }
                    }
                },
            )
        } else {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                if (editing == null) {
                    Box {
                        Bubble("plus", tr("composer.attach")) {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboardHasImages = clipboard.primaryClipDescription?.hasMimeType("image/*") == true
                            plusMenu = true
                        }
                        WizardMenu(
                            plusMenu,
                            { plusMenu = false },
                            buildList {
                                add(MenuItem(tr("composer.photosVideos"), "images") {
                                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                                })
                                if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
                                    add(MenuItem(tr("composer.camera"), "camera") {
                                        val granted = androidx.core.content.ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                                            PackageManager.PERMISSION_GRANTED
                                        if (granted) launchCamera() else cameraPermission.launch(Manifest.permission.CAMERA)
                                    })
                                }
                                add(MenuItem(tr("composer.file"), "file") { filePicker.launch(arrayOf("*/*")) })
                                if (clipboardHasImages) add(MenuItem(tr("composer.pasteImage"), "clipboard-text") { pasteImages() })
                                add(MenuItem(tr("composer.formatting.toolbar"), "text-aa", divider = true) {
                                    formatting = !formatting
                                    if (formatting) runCatching { focusRequester.requestFocus() }
                                })
                                add(MenuItem(tr("composer.poll.create"), "chart-bar-horizontal") { showPoll = true })
                                add(MenuItem(tr("composer.location.share"), "map-pin") { showLocation = true })
                                add(MenuItem(tr("composer.voice.record"), "microphone") { startRecording() })
                                add(MenuItem(tr("composer.schedule.menu").trimEnd('.', '…'), "alarm") { showSchedule = true })
                                integrationInserts.forEachIndexed { index, entry ->
                                    val icon = when (entry.action.icon) { "send" -> "paper-plane-right"; "download" -> "download-simple"; "link" -> "link"; else -> "plus" }
                                    add(MenuItem(tr("integrations.composer.actionLabel", entry.action.label, entry.integrationName), icon, divider = index == 0) {
                                        insertAtCursor(IntegrationMatching.renderInsert(entry.action.insert, room.id, "", entry.settings))
                                    })
                                }
                                integrationApis.forEachIndexed { index, entry ->
                                    add(MenuItem(tr("integrations.composer.actionLabel", entry.action.label, entry.integrationName), "paper-plane-right", divider = index == 0 && integrationInserts.isEmpty()) {
                                        apiRequest = ApiRequest(entry.integrationId, entry.action.id, room.id, text, "")
                                    })
                                }
                            },
                        )
                    }
                }
                Column(Modifier.weight(1f).floatingGlass(RoundedCornerShape(WZ.Radius.xl), theme.bgTertiary)) {
                    replyTo?.let { entry ->
                        ContextBar("arrow-bend-up-left", L10n.format("composer.replyingToName", entry.senderName), entry.summary, entry.senderName to nameColor(entry.sender)) {
                            onReplyToChange(null)
                        }
                    }
                    editing?.let { entry ->
                        ContextBar("pencil-simple", tr("timeline.editing"), entry.summary) {
                            onEditingChange(null)
                            setDraft("")
                        }
                    }
                    if (attachments.isNotEmpty() || preparing > 0) {
                        AttachmentTray(
                            attachments = attachments,
                            preparing = preparing,
                            uploadPrefs = uploadPrefs,
                            uploadLimit = session.uploadLimit,
                            uploads = timeline.uploadStates,
                            onRemove = { attachment ->
                                timeline.cancelPreupload(attachment.id)
                                attachments.removeAll { it.id == attachment.id }
                            },
                            onRetry = { attachment -> timeline.retryPreupload(attachment.id) },
                            onQualityChange = ::startPreupload,
                        )
                    }
                    if (formatting || (focused && hasSelection)) {
                        FormatBar(
                            Modifier.padding(horizontal = WZ.Space.space4).padding(top = WZ.Space.space2),
                            selectionHasLines = text.substring(draft.selection.min, draft.selection.max).contains('\n'),
                            onWrap = ::wrap,
                            onPrefix = ::prefixLines,
                            onClose = if (formatting) ({ formatting = false }) else null,
                        )
                    }
                    InputField(
                        draft,
                        placeholder = when {
                            editing != null -> tr("composer.editMessage")
                            threadRoot != null -> tr("timeline.threadComposerPlaceholder")
                            else -> L10n.format("composer.messageRoom", room.displayName)
                        },
                        modifier = Modifier
                            .focusRequester(focusRequester)
                            .onFocusChanged { focused = it.isFocused }
                            .contentReceiver { content ->
                                if (content.hasMediaType(MediaType.Text) && !content.hasMediaType(MediaType.Image)) return@contentReceiver content
                                content.consume { item ->
                                    val uri = item.uri ?: return@consume false
                                    addUri(uri, keepName = false)
                                    true
                                }
                            },
                    )
                }
                AnimatedContent(
                    canSend || editing != null,
                    transitionSpec = { (scaleIn() + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
                    label = "send",
                ) { showSend ->
                    if (showSend) {
                        val label = if (editing == null) tr("composer.send") else tr("composer.saveEdit")
                        Box(
                            Modifier
                                .size(WZ.Space.space10)
                                .alpha(if (canSend) 1f else 0.5f)
                                .clip(CircleShape)
                                .background(theme.accent)
                                .combinedClickable(
                                    enabled = canSend,
                                    onLongClick = if (editing == null) ({
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                        showSchedule = true
                                    }) else null,
                                    onLongClickLabel = tr("composer.schedule.menu").trimEnd('.', '…'),
                                    onClick = { scope.launch { submit() } },
                                )
                                .semantics { contentDescription = label },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (editing == null) {
                                PhIcon("paper-plane-right", PhWeight.fill, size = WZ.SizeIcon.md, tint = theme.textOnAccent)
                            } else {
                                PhIcon("check", PhWeight.bold, size = WZ.SizeIcon.md, tint = theme.textOnAccent)
                            }
                        }
                    } else if (pickerOpen) {
                        Bubble("keyboard", tr("common.close"), iconSize = WZ.Space.space7) { closePicker(showKeyboard = true) }
                    } else {
                        Bubble("smiley", tr("common.emoji"), iconSize = WZ.Space.space7) { openPicker(MediaPickerTab.emoji) }
                    }
                }
            }
        }
        if (docked) {
            Box(Modifier.fillMaxWidth().height(pickerHeight)) {
                pickerTab?.let { tab ->
                    DockedMediaPicker(
                        tab = tab,
                        store = packStore,
                        onEmoji = ::insertEmoji,
                        onSticker = { sticker -> scope.launch { sendSticker(sticker) } },
                        onGif = { gif -> sendGif(gif) },
                        onDismiss = { closePicker(showKeyboard = false) },
                    )
                }
            }
        }
    }
    apiRequest?.let { request ->
        ApiConfirmSheet(request, onDismiss = { apiRequest = null }, onInsertLink = { insertAtCursor(it) })
    }
    if (showPoll) {
        PollCreatorSheet(
            onSend = { question, answers, disclosed -> timeline.createPoll(question, answers, disclosed) },
            onDismiss = { showPoll = false },
        )
    }
    if (showSchedule) {
        ScheduleSheet(
            client = timeline.client,
            roomId = room.id,
            roomEncrypted = room.isEncrypted,
            draftPreview = trimmed,
            onSchedule = { delayMs -> scheduleSend(delayMs) },
            onDismiss = { showSchedule = false },
        )
    }
    if (showLocation) {
        LocationShareSheet(
            onSend = { lat, lon, note ->
                timeline.sendLocation(lat, lon, note, currentReplyTo?.eventId)
                onReplyToChange(null)
            },
            onDismiss = { showLocation = false },
        )
    }
}

/**
 * HTML only when the message has custom emoji or mentions (otherwise the core turns the Markdown
 * into HTML); its Markdown is rendered first so formatting isn't lost.
 */
internal suspend fun richHtml(
    text: String,
    emotes: Map<String, PackImage>,
    mentions: Map<String, String>,
    client: WizardClient,
    roomLinks: Map<String, String> = emptyMap(),
): String? {
    val usedEmotes = emotes.filter { text.contains(":${it.key}:") }
    val usedMentions = mentions.filter { text.contains(it.key) }
    val usedRooms = roomLinks.filter { text.contains(it.key) }
    if (usedEmotes.isEmpty() && usedMentions.isEmpty() && usedRooms.isEmpty()) return null
    var html = runCatching { client.markdownToHtml(text) }.getOrNull()
        ?: text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
    for ((name, userId) in usedMentions) {
        html = html.replace(name, "<a href=\"https://matrix.to/#/$userId\">$name</a>")
    }
    for ((label, link) in usedRooms.entries.sortedByDescending { it.key.length }) {
        html = html.replace(label, "<a href=\"$link\">$label</a>")
    }
    for ((code, image) in usedEmotes) {
        html = html.replace(
            ":$code:",
            "<img data-mx-emoticon height=\"32\" src=\"${image.url}\" alt=\":$code:\" title=\":$code:\">",
        )
    }
    return html
}

private fun ByteArray.startsWith(vararg bytes: Int) = size >= bytes.size && bytes.indices.all { this[it] == bytes[it].toByte() }

private fun displayName(context: Context, uri: Uri): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }
}.getOrNull()?.takeIf { it.isNotBlank() }

/** A small preview of an image for the attachment tray */
private suspend fun thumbnail(data: ByteArray): Bitmap? = withContext(Dispatchers.Default) {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 320) sample *= 2
    BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
}

@Composable
private fun Bubble(icon: String, label: String, iconSize: Dp = WZ.SizeIcon.md, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space10)
            .floatingGlass(CircleShape, theme.bgTertiary)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, size = iconSize, tint = theme.textPrimary)
    }
}

@Composable
private fun InputField(state: TextFieldState, placeholder: String, modifier: Modifier = Modifier) {
    BasicTextField(
        state,
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space10)
            .padding(vertical = WZ.Space.space5, horizontal = WZ.Space.space6),
        textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
        lineLimits = TextFieldLineLimits.MultiLine(maxHeightInLines = 6),
        cursorBrush = SolidColor(theme.accent),
        decorator = { inner ->
            Box {
                if (state.text.isEmpty()) {
                    Text(placeholder, style = wizardFont(WZ.FontSize.lg), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                inner()
            }
        },
    )
}

@Composable
private fun FormatBar(
    modifier: Modifier,
    selectionHasLines: Boolean,
    onWrap: (String, String, Boolean) -> Unit,
    onPrefix: ((Int) -> String) -> Unit,
    onClose: (() -> Unit)?,
) {
    // The same options as the web's toolbar, written as the Markdown sending turns into formatting
    Row(modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
        FormatButton("text-b", tr("composer.formatting.bold")) { onWrap("**", "**", false) }
        FormatButton("text-italic", tr("composer.formatting.italic")) { onWrap("_", "_", false) }
        FormatButton("text-strikethrough", tr("composer.formatting.strikethrough")) { onWrap("~~", "~~", false) }
        FormatButton("code", tr("composer.formatting.code")) {
            if (selectionHasLines) onWrap("```\n", "\n```", true) else onWrap("`", "`", false)
        }
        FormatButton("text-h", tr("composer.formatting.heading")) { onPrefix { "# " } }
        FormatButton("list-bullets", tr("composer.formatting.bulletList")) { onPrefix { "- " } }
        FormatButton("list-numbers", tr("composer.formatting.numberedList")) { onPrefix { "$it. " } }
        FormatButton("quotes", tr("composer.formatting.quote")) { onPrefix { "> " } }
        FormatButton("link", tr("composer.formatting.link")) { onWrap("[", "](https://)", false) }
        if (onClose != null) FormatButton("x", tr("common.close"), tint = theme.textMuted, onClick = onClose)
    }
}

@Composable
private fun FormatButton(icon: String, label: String, tint: Color = theme.textPrimary, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space10, WZ.Space.space9)
            .clip(RoundedCornerShape(WZ.Radius.md))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, size = WZ.SizeIcon.sm, tint = tint)
    }
}

@Composable
private fun ContextBar(icon: String, title: String, text: String, name: Pair<String, Color>? = null, onClose: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space5)
            .padding(top = WZ.Space.space4, bottom = WZ.Space.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        PhIcon(icon, tint = theme.accent)
        Column(Modifier.weight(1f)) {
            Text(
                withNameColors(title, listOfNotNull(name)),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.accent,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(text, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.clip(CircleShape).clickable(onClick = onClose)) {
            PhIcon("x-circle", size = WZ.SizeIcon.md, tint = theme.textMuted, contentDescription = tr("common.cancel"))
        }
    }
}

@Composable
private fun AttachmentTray(
    attachments: List<PendingAttachment>,
    preparing: Int,
    uploadPrefs: VideoPlan.UploadPrefs,
    uploadLimit: Long,
    uploads: Map<Long, UploadState>,
    onRemove: (PendingAttachment) -> Unit,
    onRetry: (PendingAttachment) -> Unit,
    onQualityChange: (PendingAttachment) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = WZ.Space.space5)
            .padding(top = WZ.Space.space5),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        attachments.forEach { attachment ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                Box {
                    Box(
                        Modifier.size(WZ.SizeAvatar.xl).clip(RoundedCornerShape(WZ.Radius.lg)).background(theme.fill),
                        contentAlignment = Alignment.Center,
                    ) {
                        val thumb = attachment.thumbnail
                        if (thumb != null) {
                            Image(thumb.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        } else {
                            Column(
                                Modifier.padding(WZ.Space.space3),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                            ) {
                                if (attachment.isVideo) {
                                    PhIcon("video-camera", PhWeight.fill, size = WZ.SizeIcon.md, tint = theme.textMuted)
                                } else {
                                    PhIcon("file", size = WZ.SizeIcon.md, tint = theme.textMuted)
                                }
                                Text(attachment.file.name, style = wizardFont(WZ.FontSize.xs), color = theme.textMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = WZ.Space.space3, y = -WZ.Space.space3)
                            .clip(CircleShape)
                            .background(theme.overlay)
                            .clickable { onRemove(attachment) },
                    ) {
                        PhIcon("x-circle", size = WZ.SizeIcon.md, tint = theme.textOnAccent, contentDescription = tr("common.remove"))
                    }
                }
                VideoQualityChip(attachment, uploadPrefs, uploadLimit) { onQualityChange(attachment) }
                UploadChip(uploads[attachment.id]) { onRetry(attachment) }
            }
        }
        repeat(preparing) {
            val label = tr("composer.preparing")
            Box(
                Modifier
                    .size(WZ.SizeAvatar.xl)
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill)
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Spinner(color = theme.textMuted)
            }
        }
    }
}

/** The background upload of one attachment: how far it got, done, or failed with a way to try again */
@Composable
private fun UploadChip(state: UploadState?, onRetry: () -> Unit) {
    when (state?.status) {
        UploadStatus.Uploading -> {
            val label = tr("attachment.uploading")
            Box(
                Modifier
                    .width(72.dp)
                    .height(WZ.Space.space1)
                    .clip(CircleShape)
                    .background(theme.fill)
                    .semantics { contentDescription = label },
            ) {
                Box(Modifier.fillMaxWidth(state.progress).fillMaxHeight().background(theme.accent))
            }
        }
        UploadStatus.Done -> PhIcon("check", PhWeight.bold, size = WZ.SizeIcon.sm, tint = theme.success, contentDescription = tr("common.done"))
        UploadStatus.Failed -> Box(
            Modifier.clip(CircleShape).clickable(onClick = onRetry).padding(WZ.Space.space1),
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("arrow-clockwise", PhWeight.bold, size = WZ.SizeIcon.sm, tint = theme.danger, contentDescription = tr("common.retry"))
        }
        null -> Unit
    }
}

/**
 * What a video will be sent as, with its expected size, and a menu to change it. Only for videos the
 * settings or the server limit make worth shrinking, and only where the device can encode them.
 */
@Composable
private fun VideoQualityChip(attachment: PendingAttachment, prefs: VideoPlan.UploadPrefs, uploadLimit: Long, onChange: () -> Unit) {
    val size = attachment.file.length()
    // A video over the server limit can only be sent by shrinking it, so it always gets the choice
    if (!attachment.isVideo || !VideoCompressor.isSupported || (size < prefs.minBytes && size <= uploadLimit)) return
    val choices = VideoPlan.choices(attachment.meta, size, prefs, uploadLimit)
    val wanted = attachment.pick ?: VideoPlan.defaultQuality(prefs, size, uploadLimit, true)
    val chosen = choices.firstOrNull { it.quality == wanted } ?: choices.first()
    var open by remember { mutableStateOf(false) }

    val original = tr("attachment.qualityOriginal")
    val smart = tr("attachment.qualitySmart")
    fun name(quality: VideoQuality) = when (quality) {
        VideoQuality.Original -> original
        VideoQuality.Smart -> smart
        is VideoQuality.Fixed -> "${quality.height}p"
    }

    val menuItems = choices.map { choice ->
        val choiceSize = choice.size
        val label = when {
            choiceSize == null -> name(choice.quality)
            choice.quality == VideoQuality.Original -> "${name(choice.quality)} · ${FileSize.format(choiceSize)}"
            else -> "${name(choice.quality)} · ${L10n.format("attachment.qualityEstimate", FileSize.format(choiceSize))}"
        }
        MenuItem(label, icon = if (choice.quality == chosen.quality) "check" else null) {
            attachment.pick = choice.quality
            onChange()
        }
    }
    val chosenSize = chosen.size
    val summary = if (chosen.quality != VideoQuality.Original && chosenSize != null) {
        L10n.format("attachment.shrinkTo", FileSize.format(size), FileSize.format(chosenSize))
    } else {
        name(chosen.quality)
    }
    Box {
        Row(
            Modifier
                .clip(RoundedCornerShape(WZ.Radius.lg))
                .background(theme.fill)
                .clickable { open = true }
                .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1)
                .semantics { contentDescription = summary },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
        ) {
            Text(summary, style = wizardFont(WZ.FontSize.xs), color = theme.textSecondary, maxLines = 1)
            PhIcon("caret-up-down", size = WZ.SizeIcon.sm, tint = theme.textMuted)
        }
        WizardMenu(open, { open = false }, menuItems)
    }
}

@Composable
private fun SuggestionList(suggestions: List<Suggestion>, onPick: (Suggestion) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .floatingGlass(RoundedCornerShape(WZ.Radius.xl), theme.bgTertiary)
            .padding(vertical = WZ.Space.space2),
    ) {
        suggestions.forEach { suggestion ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = WZ.Space.space10)
                    .clickable { onPick(suggestion) }
                    .padding(horizontal = WZ.Space.space5),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                when (suggestion) {
                    is Suggestion.MemberItem -> {
                        val member = suggestion.member
                        Avatar(member.displayName ?: member.userId, member.avatarUrl, WZ.SizeAvatar.sm)
                        Text(
                            member.displayName ?: member.userId,
                            style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            member.userId,
                            Modifier.weight(1f, fill = false),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    is Suggestion.RoomItem -> {
                        Avatar(suggestion.name, suggestion.avatarUrl, WZ.SizeAvatar.sm)
                        Text(
                            suggestion.name,
                            style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        suggestion.detail?.let {
                            Text(
                                it,
                                Modifier.weight(1f, fill = false),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    is Suggestion.EmojiItem -> {
                        Box(Modifier.widthIn(min = WZ.Space.space8), contentAlignment = Alignment.Center) {
                            Text(suggestion.emoji.e, fontSize = WZ.SizeIcon.lg.value.sp)
                        }
                        Text(
                            ":${suggestion.emoji.s.firstOrNull() ?: suggestion.emoji.label}:",
                            style = wizardFont(WZ.FontSize.md),
                            color = theme.textPrimary,
                            maxLines = 1,
                        )
                    }
                    is Suggestion.Custom -> {
                        PackThumb(suggestion.image.url, Modifier.size(WZ.Space.space8))
                        Text(":${suggestion.image.shortcode}:", style = wizardFont(WZ.FontSize.md), color = theme.textPrimary, maxLines = 1)
                    }
                    is Suggestion.Command -> {
                        Text(
                            "/${suggestion.name}",
                            Modifier.widthIn(min = WZ.SizeAvatar.xl),
                            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                        )
                        Text(
                            suggestion.description,
                            Modifier.weight(1f, fill = false),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RecordingBar(recorder: VoiceRecorder, modifier: Modifier, onSend: () -> Unit) {
    val recording = recorder.state == VoiceRecorder.State.recording
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .padding(horizontal = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(Modifier.size(WZ.Space.space10).clip(CircleShape).clickable { recorder.cancel() }, contentAlignment = Alignment.Center) {
            PhIcon("trash", size = WZ.SizeIcon.md, tint = theme.error, contentDescription = tr("composer.voice.cancel"))
        }
        Box(Modifier.size(WZ.Space.space4).clip(CircleShape).background(if (recording) theme.danger else theme.textMuted))
        val seconds = recorder.elapsed.toInt()
        Text(
            "%d:%02d".format(seconds / 60, seconds % 60),
            style = wizardFont(WZ.FontSize.md).copy(fontFeatureSettings = "tnum"),
            color = theme.textPrimary,
        )
        RecordingWaveform(recorder.samples.takeLast(60), Modifier.weight(1f).height(WZ.Space.space8))
        Box(
            Modifier.size(WZ.Space.space9, WZ.Space.space10).clip(CircleShape).clickable { recorder.togglePause() },
            contentAlignment = Alignment.Center,
        ) {
            PhIcon(
                if (recording) "pause" else "record",
                if (recording) PhWeight.fill else PhWeight.regular,
                size = WZ.SizeIcon.md,
                tint = theme.textMuted,
                contentDescription = if (recording) tr("composer.voice.pause") else tr("composer.voice.resume"),
            )
        }
        Box(Modifier.clip(CircleShape).clickable(onClick = onSend)) {
            PhIcon("arrow-circle-up", PhWeight.fill, size = WZ.SizeIcon.xl, tint = theme.accent, contentDescription = tr("composer.voice.send"))
        }
    }
}

private fun isAnimatedImage(data: ByteArray): Boolean {
    fun ascii(at: Int, text: String) = at + text.length <= data.size && text.indices.all { data[at + it] == text[it].code.toByte() }
    return when {
        ascii(0, "GIF") -> (0 until data.size - 1).count { data[it] == 0x21.toByte() && data[it + 1] == 0xF9.toByte() } > 1
        ascii(0, "RIFF") && ascii(8, "WEBPVP8X") -> data.size > 20 && data[20].toInt() and 0x02 != 0
        data.startsWith(0x89, 0x50) -> {
            val idat = (0 until data.size - 4).firstOrNull { ascii(it, "IDAT") } ?: data.size
            (0 until idat - 4).any { ascii(it, "acTL") }
        }
        else -> false
    }
}
