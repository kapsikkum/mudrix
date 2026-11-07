package org.wizardchat.android.matrix

import android.net.Uri
import java.security.SecureRandom
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.CreateRoomOptions
import org.wizardchat.core.UiaAuth
import org.wizardchat.core.UiaOutcome
import org.wizardchat.core.UserProfile
import org.wizardchat.core.UserResult
import org.wizardchat.core.WizardError

val MatrixSession.isOAuthAccount: Boolean get() = client?.session?.oauthClientId != null
val MatrixSession.deviceId: String? get() = client?.session?.deviceId

suspend fun MatrixSession.accountManagementUrl(): String? = runCatching { client?.accountManagementUrl() }.getOrNull()

suspend fun MatrixSession.setDisplayName(name: String) {
    requireClient.setDisplayName(name)
    setProfile(name, avatarUrl)
}

suspend fun MatrixSession.setAvatar(data: ByteArray, mimeType: String) {
    setProfile(displayName, requireClient.setAvatar(data, mimeType))
}

suspend fun MatrixSession.removeAvatar() {
    requireClient.removeAvatar()
    setProfile(displayName, null)
}

/**
 * Runs an account operation protected by user-interactive auth: first without, then with the
 * password the screen already asked for, if the server wants confirmation.
 */
private suspend fun withPassword(password: String?, run: suspend (UiaAuth?) -> UiaOutcome) {
    val challenge = run(null) as? UiaOutcome.AuthRequired ?: return
    if (password.isNullOrEmpty()) throw WizardError("passwordRequired", L10n.format("settings.account.authMethodUnsupported"))
    if (run(UiaAuth.Password(password, challenge.session)) is UiaOutcome.AuthRequired) {
        throw WizardError("invalidCredentials", L10n.format("auth.errors.credentials"))
    }
}

suspend fun MatrixSession.changePassword(current: String, new: String) {
    withPassword(current) { requireClient.changePasswordWithAuth(new, it) }
}

suspend fun MatrixSession.emailAddresses(): List<String> =
    requireClient.emailAddresses().filter { it.medium == "email" }.map { it.address }

/** Asks the server to mail a confirmation link; returns the session id and client secret */
suspend fun MatrixSession.requestEmailToken(email: String): Pair<String, String> {
    val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
    val secret = bytes.joinToString("") { "%02x".format(it) }
    val sid = requireClient.requestEmailToken(email, secret, 1)
    return sid to secret
}

suspend fun MatrixSession.addEmail(sid: String, secret: String, password: String?) {
    withPassword(password) { requireClient.addEmailWithAuth(secret, sid, null, it) }
}

suspend fun MatrixSession.removeEmail(email: String) {
    requireClient.removeEmail(email)
}

suspend fun MatrixSession.deactivateAccount(password: String, eraseData: Boolean) {
    withPassword(password) { requireClient.deactivateAccountWithAuth(eraseData, it) }
    logout()
}

suspend fun MatrixSession.deleteDevices(deviceIds: List<String>, password: String?) {
    withPassword(password) { requireClient.deleteDevicesWithAuth(deviceIds, it) }
}

suspend fun MatrixSession.uploadMedia(data: ByteArray, mimeType: String): String = requireClient.uploadMedia(data, mimeType)

suspend fun MatrixSession.recover(recoveryKey: String) {
    requireClient.recover(recoveryKey.trim())
}

suspend fun MatrixSession.enableRecovery(): String = requireClient.enableRecovery()

suspend fun MatrixSession.resetRecoveryKey(): String = requireClient.resetRecoveryKey()

suspend fun MatrixSession.createSpace(name: String, topic: String?, isPublic: Boolean): String =
    requireClient.createRoom(CreateRoomOptions(name = name, topic = topic, isPublic = isPublic, isSpace = true))

suspend fun MatrixSession.createRoom(
    name: String,
    topic: String?,
    isPublic: Boolean,
    encrypted: Boolean,
    isVoice: Boolean,
    alias: String?,
    spaceId: String?,
): String = requireClient.createRoom(
    CreateRoomOptions(
        name = name,
        topic = topic,
        isPublic = isPublic,
        alias = if (isPublic) alias else null,
        isVoice = isVoice,
        parentSpaceId = spaceId,
        encrypted = encrypted && !isPublic,
    ),
)

suspend fun MatrixSession.startDirectMessage(userId: String): String = requireClient.startDm(userId)

/** Joins by room id, alias or matrix.to link (its `via` servers included) */
suspend fun MatrixSession.join(idOrAliasOrLink: String, via: List<String> = emptyList()): String {
    var target = idOrAliasOrLink.trim()
    target.indexOf("matrix.to/#/").takeIf { it >= 0 }?.let { target = target.substring(it + "matrix.to/#/".length) }
    val servers = via.toMutableList()
    val query = target.indexOf('?')
    if (query >= 0) {
        val params = Uri.parse("x:/" + target.substring(query))
        servers += runCatching { params.getQueryParameters("via") }.getOrNull().orEmpty()
        target = target.substring(0, query)
    }
    target = runCatching { Uri.decode(target) }.getOrDefault(target)
    return requireClient.join(target, servers)
}

suspend fun MatrixSession.addChild(roomId: String, spaceId: String) {
    requireClient.addToSpace(spaceId, roomId, false)
}

suspend fun MatrixSession.searchUsers(term: String): List<UserResult> {
    val client = client ?: return emptyList()
    if (term.isEmpty()) return emptyList()
    return runCatching { client.searchUsers(term, 20) }.getOrDefault(emptyList())
}

/**
 * Writes or deletes one logical profile field under all of its key names (stable and unstable), so a client
 * that only knows one of them sees it. Succeeds when at least one write lands; deleting a key that was never
 * set may fail, which is not an error.
 */
suspend fun MatrixSession.writeProfileField(keys: List<String>, value: JsonElement?) {
    val client = requireClient
    val failures = keys.mapNotNull { key ->
        runCatching { if (value == null) client.deleteProfileField(key) else client.setProfileField(key, value) }.exceptionOrNull()
    }
    if (value != null && failures.size == keys.size) throw failures.first()
}

/**
 * Marks the account as one that uses Mudrix (the `is_user` profile field other clients show as a badge); done
 * once per account and device, and only on servers with extended profiles.
 */
suspend fun MatrixSession.ensureMudrixUserFlag() {
    val client = client ?: return
    val userId = client.userId ?: return
    val defaults = org.wizardchat.android.WizardApplication.instance.getSharedPreferences("profile", android.content.Context.MODE_PRIVATE)
    val done = "userFlagSet.$userId"
    if (defaults.getBoolean(done, false)) return
    val current = runCatching { client.profileField(userId, ProfileFields.IS_USER_KEYS.first()) }.getOrNull()
    if ((current as? JsonPrimitive)?.content != "true") {
        if (!runCatching { client.supportsExtendedProfiles() }.getOrDefault(false)) return
        if (runCatching { writeProfileField(ProfileFields.IS_USER_KEYS, JsonPrimitive(true)) }.isFailure) return
    }
    defaults.edit().putBoolean(done, true).apply()
}

suspend fun MatrixSession.profile(userId: String): UserProfile? = runCatching { client?.userProfile(userId) }.getOrNull()

suspend fun MatrixSession.ignore(userId: String) {
    requireClient.ignoreUser(userId)
}

/** Every state event of a type in a room, as (state key, content) */
suspend fun MatrixSession.stateEvents(eventType: String, roomId: String): List<Pair<String, JsonObject>> {
    val pairs = runCatching { client?.stateEventsOfType(roomId, eventType) }.getOrNull() ?: return emptyList()
    return pairs.mapNotNull { pair ->
        if (pair.size != 2) return@mapNotNull null
        val key = (pair[0] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return@mapNotNull null
        val content = pair[1] as? JsonObject ?: return@mapNotNull null
        key to content
    }
}

suspend fun MatrixSession.setStateEvent(eventType: String, key: String, content: JsonElement, roomId: String) {
    requireClient.setStateEvent(roomId, eventType, key, content)
}

suspend fun MatrixSession.canSendState(eventType: String, roomId: String): Boolean {
    val client = client ?: return false
    val details = runCatching { client.roomDetails(roomId) }.getOrNull() ?: return false
    val own = details.ownPowerLevel ?: return true
    val levels = runCatching { client.stateEvent(roomId, "m.room.power_levels", "") }.getOrNull() as? JsonObject
    val events = levels?.get("events") as? JsonObject
    val needed = (events?.get(eventType) as? JsonPrimitive)?.doubleOrNull
        ?: (levels?.get("state_default") as? JsonPrimitive)?.doubleOrNull
        ?: 50.0
    return own.toDouble() >= needed
}

suspend fun MatrixSession.accountDataJSON(eventType: String): JsonObject? =
    runCatching { client?.accountData(eventType) }.getOrNull() as? JsonObject

suspend fun MatrixSession.setAccountDataJSON(eventType: String, content: JsonObject) {
    requireClient.setAccountData(eventType, content)
}
