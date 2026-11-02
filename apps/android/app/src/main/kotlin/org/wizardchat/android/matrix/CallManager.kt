package org.wizardchat.android.matrix

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import io.livekit.android.AudioOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.audio.NoAudioHandler
import io.livekit.android.e2ee.BaseKeyProvider
import io.livekit.android.e2ee.E2EEOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.participant.AudioTrackPublishDefaults
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.participant.VideoTrackPublishDefaults
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.DataPublishReliability
import io.livekit.android.room.track.LocalAudioTrackOptions
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.RemoteAudioTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCodec
import io.livekit.android.room.track.VideoEncoding
import io.livekit.android.room.track.VideoPreset169
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import livekit.org.webrtc.FrameCryptorKeyDerivationAlgorithm
import livekit.org.webrtc.RtpParameters
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.rtc.CallActivityState
import org.wizardchat.android.matrix.rtc.CallNotificationController
import org.wizardchat.android.matrix.rtc.CallSounds
import org.wizardchat.android.matrix.rtc.WatchParticipant
import org.wizardchat.android.matrix.rtc.WatchTogether
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.CallEvent
import org.wizardchat.core.CallMember
import org.wizardchat.core.CallSession
import org.wizardchat.core.IncomingCall
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient
import io.livekit.android.room.Room as LiveKitRoom

/** One device in the call, with its media state */
data class CallParticipantInfo(
    val identity: String,
    val userId: String,
    val deviceId: String,
    val isLocal: Boolean,
    val connected: Boolean = false,
    val speaking: Boolean = false,
    val micMuted: Boolean = true,
    val cameraTrack: VideoTrack? = null,
    val screenTrack: VideoTrack? = null,
    /** The LiveKit room the tracks come from (video views render with its EGL context) */
    val connection: LiveKitRoom? = null,
    val handRaised: Boolean = false,
    val reaction: String? = null,
    val volume: Double = 1.0,
    val locallyMuted: Boolean = false,
) {
    val id: String get() = identity
}

/** Someone ringing you */
data class RingingCall(
    val roomId: String,
    val eventId: String,
    val callerId: String,
    val callerName: String?,
    val voiceOnly: Boolean,
)

/** An emoji you can send into a call */
data class CallReaction(val emoji: String, val name: String) {
    val id: String get() = name

    companion object {
        val all = listOf(
            CallReaction("👍", "thumbsup"), CallReaction("👎", "thumbsdown"),
            CallReaction("👏", "clap"), CallReaction("😂", "laugh"),
            CallReaction("😮", "wow"), CallReaction("❤️", "heart"),
            CallReaction("🎉", "party"), CallReaction("🔥", "fire"),
        )
    }
}

/**
 * Calls: MatrixRTC membership and media keys through the core, media through LiveKit (one
 * connection per call server in use).
 */
class CallManager {
    sealed interface State {
        data object Idle : State
        data object Joining : State
        data object Joined : State
        data class Failed(val message: String) : State
    }

    enum class RingState { ringing, declined, unanswered }

    var state by mutableStateOf<State>(State.Idle)
        private set
    var room by mutableStateOf<RoomSummary?>(null)
        private set
    var participants by mutableStateOf<List<CallParticipantInfo>>(emptyList())
        private set
    var cameraOn by mutableStateOf(false)
        private set
    var screenSharing by mutableStateOf(false)
        private set
    var handRaised by mutableStateOf(false)
        private set
    var reconnecting by mutableStateOf(false)
        private set
    var watch by mutableStateOf<WatchTogether?>(null)
        private set
    var ring by mutableStateOf<RingState?>(null)
        private set
    var incoming by mutableStateOf<RingingCall?>(null)
        private set
    var showCallScreen by mutableStateOf(false)

    private val context: Context get() = WizardApplication.instance
    private val defaults = WizardApplication.instance.getSharedPreferences("calls", Context.MODE_PRIVATE)

    private var micMutedState by mutableStateOf(defaults.getBoolean("voice.micMuted", false))
    var micMuted: Boolean
        get() = micMutedState
        set(value) {
            micMutedState = value
            defaults.edit().putBoolean("voice.micMuted", value).apply()
        }
    private var deafenedState by mutableStateOf(defaults.getBoolean("voice.deafened", false))
    var deafened: Boolean
        get() = deafenedState
        set(value) {
            deafenedState = value
            defaults.edit().putBoolean("voice.deafened", value).apply()
        }

    /** Asks for runtime permissions; set by the UI while an activity is around */
    internal var permissionRequester: (suspend (Array<String>) -> Unit)? = null

    /** Asks to capture the screen: the result data for LiveKit's screen capture, or null */
    internal var screenCaptureRequester: (suspend () -> Intent?)? = null

    private val scope = MainScope()
    private var ringback: CallSounds.Loop? = null
    private var ringtone: CallSounds.Loop? = null
    private var incomingTimer: Job? = null
    private var knownOthers = setOf<String>()
    private val notification = CallNotificationController()
    private val displayNames = mutableMapOf<String, String>()

    private var session: CallSession? = null
    private var run: Subscription? = null
    private var incomingWatch: Subscription? = null
    private var members = listOf<CallMember>()
    private var mutedBeforeDeafen = false
    private var client: WizardClient? = null
    private var keyProvider: BaseKeyProvider? = null
    private val connections = mutableMapOf<String, LiveKitRoom>()
    private val connectionUrls = mutableMapOf<LiveKitRoom, String>()
    private val connectionJobs = mutableMapOf<LiveKitRoom, Job>()
    private val pendingServices = mutableSetOf<String>()
    private var refreshTimer: Job? = null
    private val userVolumes = mutableMapOf<String, Double>()
    private val mutedUsers = mutableSetOf<String>()
    private val appliedVolumes = mutableMapOf<String, Double>()
    private val reactions = mutableMapOf<String, String>()
    private val raisedHands = mutableSetOf<String>()

    init {
        notification.end()
    }

    val isInCall: Boolean get() = state == State.Joining || state == State.Joined

    fun isInCall(roomId: String): Boolean = isInCall && room?.id == roomId

    suspend fun join(room: RoomSummary, session: MatrixSession, intent: String? = null, ring: Boolean = false) {
        if (isInCall(room.id)) return
        if (incoming?.roomId == room.id) dismissIncoming()
        if (isInCall) leaveAndWait()
        val wanted = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions(wanted)
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            state = State.Failed(L10n.format("call.micPermission"))
            return
        }
        val client = session.client ?: return
        this.room = room
        this.client = client
        state = State.Joining
        try {
            val call = client.joinCall(room.id, video = intent == "video", ring = ring)
            this.session = call
            if (call.encrypted()) {
                keyProvider = BaseKeyProvider(
                    ratchetWindowSize = 10,
                    enableSharedKey = false,
                    keyRingSize = 256,
                    keyDerivationAlgorithm = FrameCryptorKeyDerivationAlgorithm.HKDF,
                )
            }
            run = call.run { handle(it) }
            val publisher = connect(call.serviceUrl, publisher = true)
            state = State.Joined
            watch = WatchTogether(
                ownUserId = client.userId ?: "",
                send = { sendData(it, WatchTogether.TOPIC) },
                participants = {
                    participants.filter { it.connected }.map { WatchParticipant(it.identity, it.userId, it.isLocal) }
                },
            )
            runCatching { publisher.localParticipant.setMicrophoneEnabled(!micMuted && !deafened) }
            CallSounds.play("call_join")
            notification.start(room.displayName, room.isDirect, activityState)
            if (intent == "video") toggleCamera()
            if (ring && room.isDirect && members.none { it.userId != client.userId }) startRinging()
            syncRemoteConnections()
            startRefreshing()
        } catch (error: Exception) {
            val call = this.session
            runCatching { call?.leave() }
            tearDown()
            state = State.Failed(error.message ?: L10n.format("common.somethingWentWrong"))
        }
    }

    /** [join] in the background, so it goes on when the screen that started it goes away */
    fun launchJoin(room: RoomSummary, session: MatrixSession, intent: String? = null, ring: Boolean = false) {
        scope.launch { join(room, session, intent, ring) }
    }

    fun leave() {
        scope.launch { leaveAndWait() }
    }

    private suspend fun leaveAndWait() {
        if (state == State.Joined) CallSounds.play("call_leave")
        val call = session
        tearDown()
        runCatching { call?.leave() }
        state = State.Idle
        room = null
    }

    private fun tearDown() {
        notification.end()
        displayNames.clear()
        stopRinging()
        ring = null
        showCallScreen = false
        knownOthers = emptySet()
        watch?.close()
        watch = null
        refreshTimer?.cancel()
        refreshTimer = null
        run?.cancel()
        run = null
        val rooms = connections.values.toList()
        connections.clear()
        pendingServices.clear()
        rooms.forEach(::close)
        session = null
        members = emptyList()
        client = null
        keyProvider = null
        participants = emptyList()
        reactions.clear()
        raisedHands.clear()
        handRaised = false
        cameraOn = false
        screenSharing = false
        reconnecting = false
        appliedVolumes.clear()
    }

    private fun close(connection: LiveKitRoom) {
        connectionJobs.remove(connection)?.cancel()
        connectionUrls.remove(connection)
        connection.disconnect()
        connection.release()
    }

    private fun handle(event: CallEvent) {
        when (event) {
            is CallEvent.Members -> membersChanged(event.members)
            is CallEvent.Key -> {
                val data = runCatching { Base64.decode(event.key, Base64.DEFAULT) }.getOrNull() ?: return
                // The provider's own setKey takes text; the core hands out raw key bytes
                keyProvider?.rtcKeyProvider?.setKey(event.identity, event.index.toInt(), data)
            }
            is CallEvent.Declined -> if (ring == RingState.ringing) endRinging(RingState.declined)
            CallEvent.Unanswered -> if (ring == RingState.ringing) endRinging(RingState.unanswered)
            is CallEvent.Reaction -> show(event.emoji, event.identity)
            is CallEvent.HandRaised -> {
                if (event.raised) raisedHands.add(event.identity) else raisedHands.remove(event.identity)
                refresh()
            }
            is CallEvent.Error -> Log.w(TAG, event.message)
        }
    }

    private fun membersChanged(members: List<CallMember>) {
        this.members = members
        val client = client ?: return
        for (userId in members.map { it.userId }.toSet()) {
            if (displayNames[userId] != null) continue
            displayNames[userId] = userId.removePrefix("@").substringBefore(':')
            scope.launch {
                runCatching { client.userProfile(userId).displayName }.getOrNull()?.let { displayNames[userId] = it }
            }
        }
        val others = members.filter { it.userId != client.userId }.map { it.userId }.toSet()
        if (state == State.Joined) {
            if ((others - knownOthers).isNotEmpty()) {
                CallSounds.play("call_join")
            } else if ((knownOthers - others).isNotEmpty()) {
                CallSounds.play("call_leave")
            }
        }
        knownOthers = others
        if (others.isNotEmpty() && ring == RingState.ringing) {
            stopRinging()
            ring = null
        }
        syncRemoteConnections()
        refresh()
    }

    private suspend fun connect(service: String, publisher: Boolean): LiveKitRoom {
        val session = session ?: throw CancellationException()
        val client = client ?: throw CancellationException()
        val room = room ?: throw CancellationException()
        val sfu = client.sfuConfig(room.id, service)
        connectionUrls.entries.firstOrNull { it.value == sfu.url }?.let { return it.key }
        val options = RoomOptions(
            adaptiveStream = true,
            dynacast = true,
            e2eeOptions = keyProvider?.let { E2EEOptions(keyProvider = it) },
            audioTrackCaptureDefaults = LocalAudioTrackOptions(noiseSuppression = true, echoCancellation = true, autoGainControl = true),
            videoTrackCaptureDefaults = LocalVideoTrackOptions(position = CameraPosition.FRONT, captureParams = VideoPreset169.H720.capture),
            screenShareTrackCaptureDefaults = LocalVideoTrackOptions(isScreencast = true, captureParams = VideoPreset169.H1080.capture),
            // No RED (redundant audio): browsers can't decrypt RED-wrapped frames
            audioTrackPublishDefaults = AudioTrackPublishDefaults(dtx = true, red = false),
            videoTrackPublishDefaults = VideoTrackPublishDefaults(
                videoEncoding = VideoEncoding(2_500_000, 30),
                simulcastLayers = listOf(VideoPreset169.H180, VideoPreset169.H360),
                videoCodec = VideoCodec.VP8.codecName,
                degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION,
            ),
        )
        // Only the publishing connection manages audio routing and focus, so another call
        // server's connection going away doesn't reset it
        val overrides = if (publisher) {
            LiveKitOverrides()
        } else {
            LiveKitOverrides(audioOptions = AudioOptions(audioHandler = NoAudioHandler(), disableCommunicationModeWorkaround = true))
        }
        val livekit = LiveKit.create(context, options, overrides)
        connectionUrls[livekit] = sfu.url
        connectionJobs[livekit] = scope.launch { livekit.events.collect { roomEvent(livekit, it) } }
        try {
            livekit.connect(sfu.url, sfu.jwt)
        } catch (error: Exception) {
            close(livekit)
            throw error
        }
        if (this.session !== session) {
            close(livekit)
            throw CancellationException()
        }
        connections[service] = livekit
        return livekit
    }

    private fun syncRemoteConnections() {
        val session = session ?: return
        if (state != State.Joined) return
        val own = session.serviceUrl
        val wanted = members.mapNotNull { it.serviceUrl }.filter { it != own }.toSet()
        for (service in wanted) {
            if (connections[service] != null || service in pendingServices) continue
            pendingServices.add(service)
            scope.launch {
                try {
                    connect(service, publisher = false)
                } catch (error: Exception) {
                    Log.w(TAG, "could not connect to $service: $error")
                }
                pendingServices.remove(service)
            }
        }
        for ((service, connection) in connections.toMap()) {
            if (service == own || service in wanted) continue
            connections.remove(service)
            close(connection)
        }
    }

    private val publisher: LiveKitRoom? get() = session?.let { connections[it.serviceUrl] }

    private fun sendData(message: JsonObject, topic: String) {
        val publisher = publisher ?: return
        val data = message.toString().encodeToByteArray()
        scope.launch {
            publisher.localParticipant.publishData(data, DataPublishReliability.RELIABLE, topic)
                .onFailure { Log.w(TAG, "data: $it") }
        }
    }

    /** Unmuting while deafened also undeafens you (you can't talk without hearing) */
    fun toggleMic() {
        if (deafened) {
            deafened = false
            micMuted = false
        } else {
            micMuted = !micMuted
        }
        applyMic()
    }

    fun toggleDeafen() {
        if (deafened) {
            deafened = false
            micMuted = mutedBeforeDeafen
        } else {
            mutedBeforeDeafen = micMuted
            deafened = true
            micMuted = true
        }
        applyMic()
    }

    private fun applyMic() {
        val enabled = !micMuted
        val publisher = publisher
        scope.launch { runCatching { publisher?.localParticipant?.setMicrophoneEnabled(enabled) } }
        refresh()
    }

    fun toggleCamera() {
        val enabled = !cameraOn
        scope.launch {
            if (enabled) {
                requestPermissions(listOf(Manifest.permission.CAMERA))
                if (!hasPermission(Manifest.permission.CAMERA)) return@launch
            }
            try {
                publisher?.localParticipant?.setCameraEnabled(enabled)
                cameraOn = enabled
                notification.cameraChanged()
            } catch (error: Exception) {
                Log.w(TAG, "camera: $error")
            }
            refresh()
        }
    }

    fun toggleScreenShare() {
        val enabled = !screenSharing
        scope.launch {
            val local = publisher?.localParticipant
            try {
                if (enabled) {
                    val data = screenCaptureRequester?.invoke() ?: return@launch
                    screenSharing = local?.setScreenShareEnabled(
                        true,
                        ScreenCaptureParams(data, onStop = { scope.launch { refresh() } }),
                    ) == true
                } else {
                    local?.setScreenShareEnabled(false)
                    screenSharing = false
                }
            } catch (error: Exception) {
                Log.w(TAG, "screen share: $error")
                screenSharing = local?.isScreenShareEnabled ?: false
            }
            refresh()
        }
    }

    fun setVolume(volume: Double, userId: String) {
        userVolumes[userId] = volume
        refresh()
    }

    fun toggleLocalMute(userId: String) {
        if (!mutedUsers.remove(userId)) mutedUsers.add(userId)
        refresh()
    }

    fun sendReaction(reaction: CallReaction) {
        val session = session ?: return
        show(reaction.emoji, session.identity)
        scope.launch {
            try {
                session.sendReaction(reaction.emoji, reaction.name)
            } catch (error: Exception) {
                Log.w(TAG, "reaction: $error")
            }
        }
    }

    fun toggleHand() {
        val session = session ?: return
        handRaised = !handRaised
        val raise = handRaised
        if (raise) raisedHands.add(session.identity) else raisedHands.remove(session.identity)
        refresh()
        scope.launch { runCatching { session.setHandRaised(raise) } }
    }

    private fun show(emoji: String, identity: String) {
        reactions[identity] = emoji
        refresh()
        scope.launch {
            delay(REACTION_VISIBLE_MILLIS)
            if (reactions[identity] == emoji) {
                reactions.remove(identity)
                refresh()
            }
        }
    }

    private fun startRefreshing() {
        refreshTimer?.cancel()
        refreshTimer = scope.launch {
            while (isActive) {
                delay(250)
                refresh()
            }
        }
    }

    private fun refresh() {
        if (session == null) {
            if (participants.isNotEmpty()) participants = emptyList()
            return
        }
        val remotes = mutableMapOf<String, Pair<RemoteParticipant, LiveKitRoom>>()
        for (connection in connections.values) {
            for ((identity, participant) in connection.remoteParticipants) remotes[identity.value] = participant to connection
        }
        val publisher = publisher
        val local = publisher?.localParticipant
        if (local != null && screenSharing && !local.isScreenShareEnabled) screenSharing = false
        val list = mutableListOf<CallParticipantInfo>()
        val seen = mutableSetOf<String>()
        for (member in members) {
            if (!seen.add(member.identity)) continue
            val isLocal = member.isOwnDevice
            val remote = if (isLocal) null else remotes[member.identity]
            val participant: Participant? = if (isLocal) local else remote?.first
            var info = CallParticipantInfo(member.identity, member.userId, member.deviceId, isLocal)
            if (participant != null) {
                val videos = participant.trackPublications.values.filter { it.kind == Track.Kind.VIDEO && !it.muted }
                info = info.copy(
                    connected = true,
                    speaking = participant.isSpeaking,
                    micMuted = !participant.isMicrophoneEnabled,
                    cameraTrack = videos.firstOrNull { it.source == Track.Source.CAMERA }?.track as? VideoTrack,
                    screenTrack = videos.firstOrNull { it.source == Track.Source.SCREEN_SHARE }?.track as? VideoTrack,
                    connection = if (isLocal) publisher else remote?.second,
                )
            }
            if (isLocal) info = info.copy(micMuted = micMuted, connected = state == State.Joined)
            info = info.copy(
                handRaised = member.identity in raisedHands,
                reaction = reactions[member.identity],
                volume = userVolumes[member.userId] ?: 1.0,
                locallyMuted = member.userId in mutedUsers,
            )
            list.add(info)

            // Deafen and per-person volume, applied only when they change
            if (participant is RemoteParticipant) {
                val target = if (deafened || info.locallyMuted) 0.0 else info.volume
                for (publication in participant.trackPublications.values) {
                    val track = publication.track as? RemoteAudioTrack ?: continue
                    val key = "${member.identity}|${publication.sid}"
                    if (appliedVolumes[key] != target) {
                        appliedVolumes[key] = target
                        track.setVolume(target)
                    }
                }
            }
        }
        if (list != participants) participants = list
        notification.update(activityState)
    }

    private fun roomEvent(livekit: LiveKitRoom, event: RoomEvent) {
        when (event) {
            is RoomEvent.Reconnecting -> if (livekit === publisher) reconnecting = true
            is RoomEvent.Reconnected -> if (livekit === publisher) reconnecting = false
            is RoomEvent.DataReceived ->
                if (event.topic == WatchTogether.TOPIC) watch?.receive(event.data, event.participant?.identity?.value ?: "")
            is RoomEvent.Disconnected -> {
                if (livekit !== publisher || state != State.Joined) return
                val call = session
                tearDown()
                scope.launch { runCatching { call?.leave() } }
                room = null
                state = State.Failed(event.error?.message ?: L10n.format("call.disconnected"))
            }
            else -> {}
        }
    }

    /** What the ongoing-call notification shows */
    val activityState: CallActivityState
        get() {
            val speaker = participants.firstOrNull { it.speaking && !it.isLocal }
            return CallActivityState(
                micMuted = micMuted,
                deafened = deafened,
                othersSpeaking = speaker != null,
                speakerName = speaker?.let { displayNames[it.userId] ?: it.userId },
                participantCount = participants.map { it.userId }.toSet().size.coerceAtLeast(1),
                ringing = ring == RingState.ringing,
            )
        }

    private fun startRinging() {
        ring = RingState.ringing
        ringback = CallSounds.loop("ringback")
    }

    fun ringAgain() {
        val session = session ?: return
        if (ring == RingState.ringing) return
        scope.launch {
            if (runCatching { session.ringAgain() }.getOrNull() == true) startRinging()
        }
    }

    private fun endRinging(result: RingState) {
        stopRinging()
        ring = result
        CallSounds.play(if (result == RingState.declined) "call_declined" else "call_no_answer")
    }

    private fun stopRinging() {
        ringback?.stop()
        ringback = null
    }

    fun watchIncoming(client: WizardClient) {
        incomingWatch?.cancel()
        incomingWatch = client.watchIncomingCalls { ringIn(it) }
    }

    fun stopWatchingIncoming() {
        incomingWatch?.cancel()
        incomingWatch = null
        dismissIncoming()
    }

    private fun ringIn(call: IncomingCall) {
        if (incoming != null || isInCall(call.roomId)) return
        val remaining = call.expiresAt - System.currentTimeMillis()
        if (remaining <= 0) return
        incoming = RingingCall(call.roomId, call.eventId, call.sender, call.senderName, voiceOnly = call.intent == "audio")
        if (call.ring) ringtone = CallSounds.loop("ringtone")
        incomingTimer?.cancel()
        incomingTimer = scope.launch {
            delay(remaining)
            dismissIncoming()
        }
    }

    fun acceptIncoming(session: MatrixSession) {
        val call = incoming ?: return
        val room = session.roomList?.room(call.roomId) ?: return
        dismissIncoming()
        showCallScreen = true
        scope.launch { join(room, session, intent = if (call.voiceOnly) "audio" else "video") }
    }

    fun declineIncoming(session: MatrixSession) {
        val call = incoming ?: return
        dismissIncoming()
        scope.launch { runCatching { session.client?.declineCall(call.roomId, call.eventId) } }
    }

    fun dismissIncoming() {
        incomingTimer?.cancel()
        incomingTimer = null
        ringtone?.stop()
        ringtone = null
        incoming = null
    }

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private suspend fun requestPermissions(permissions: List<String>) {
        val missing = permissions.filterNot(::hasPermission)
        if (missing.isEmpty()) return
        runCatching { permissionRequester?.invoke(missing.toTypedArray()) }
    }

    companion object {
        private const val TAG = "WZCALL"
        private const val REACTION_VISIBLE_MILLIS = 3000L

        val shared = CallManager()
    }
}
