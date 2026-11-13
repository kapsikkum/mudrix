package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileActivity
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.matrix.accountDataJSON
import org.wizardchat.android.matrix.setAccountDataJSON
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.settings.VerificationModel
import org.wizardchat.android.ui.settings.VerificationSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.HomeserverSoftware
import org.wizardchat.core.UserTrust
import org.wizardchat.tokens.WZ

/** The colour a profile asks to be tinted with, or null */
internal fun accentColor(accent: String?): Color? =
    accent?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }

/** Pronouns, bio and what they are playing, under the name (the web's card body) */
@Composable
internal fun ProfileAbout(profile: ExtendedProfile, name: String) {
    var fullBio by remember { mutableStateOf(false) }
    val activities = ProfileFields.live(profile.activities)
    if (profile.pronouns.isEmpty() && profile.bio.isEmpty() && activities.isEmpty()) return
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        if (profile.pronouns.isNotEmpty()) {
            Text(profile.pronouns.joinToString(", "), style = wizardFont(WZ.FontSize.md), color = theme.textSecondary)
        }
        ProfileActivities(activities)
        if (profile.bio.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(WZ.Radius.lg)).background(theme.fill).padding(WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                SelectionContainer {
                    Text(
                        profile.bio,
                        style = wizardFont(WZ.FontSize.md),
                        color = theme.textPrimary,
                        maxLines = if (fullBio) Int.MAX_VALUE else BIO_CLAMP_LINES,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!fullBio && (profile.bio.count { it == '\n' } >= BIO_CLAMP_LINES || profile.bio.length > BIO_CLAMP_CHARS)) {
                    Text(
                        tr("profile.viewFullBio"),
                        Modifier.clickableNoRipple { fullBio = true },
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = theme.accent,
                    )
                }
            }
        }
    }
}

/** What the person is playing or listening to, as the cards the web shows on a profile */
@Composable
internal fun ProfileActivities(activities: List<ProfileActivity>) {
    if (activities.isEmpty()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        activities.forEach { ActivityCard(it) }
    }
}

/** The person's local time, with how far it is from yours (a row of the web's details tab) */
@Composable
internal fun ProfileLocalTime(profile: ExtendedProfile) {
    val local = profile.timezone?.let { ProfileFields.localTime(it) } ?: return
    val (time, offset) = local
    val hours = abs(offset)
    val shown = if (hours % 1.0 == 0.0) "${hours.toInt()}" else "%.1f".format(hours)
    val relative = when {
        offset == 0.0 -> tr("profile.sameTime")
        offset > 0 -> tr("profile.hoursAhead", shown)
        else -> tr("profile.hoursBehind", shown)
    }
    Text(
        "${time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))} · $relative",
        style = wizardFont(WZ.FontSize.md),
        color = theme.textSecondary,
    )
}

private const val BIO_CLAMP_LINES = 4
private const val BIO_CLAMP_CHARS = 200

private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier =
    this.then(Modifier.clickable(interactionSource = null, indication = null, onClick = onClick))

@Composable
private fun ActivityCard(activity: ProfileActivity) {
    val title = if (activity.type == "playing") {
        tr("profile.activity.playing", activity.name)
    } else if (activity.details.isNotEmpty()) {
        tr("profile.activity.listeningBy", activity.name, activity.details)
    } else {
        tr("profile.activity.listening", activity.name)
    }
    val since = if (activity.type == "playing" && activity.startedAt > 0) {
        val minutes = ((System.currentTimeMillis() - activity.startedAt) / 60_000).coerceAtLeast(0)
        if (minutes < 1) {
            tr("profile.activity.justStarted")
        } else {
            tr("profile.activity.forDuration", if (minutes >= 60) "${minutes / 60} h ${minutes % 60} min" else "$minutes min")
        }
    } else {
        null
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(WZ.Radius.lg)).background(theme.fill).padding(WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        Text(
            tr(if (activity.type == "playing") "profile.activity.cardPlaying" else "profile.activity.cardListening"),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textMuted,
        )
        Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
        since?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted) }
    }
}

/** "Mudrix user" and the software the person's homeserver runs */
@Composable
internal fun ProfileBadges(isMudrixUser: Boolean, software: HomeserverSoftware?) {
    if (!isMudrixUser && software == null) return
    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalAlignment = Alignment.CenterVertically) {
        if (isMudrixUser) Badge(tr("profile.badge.mudrixUser"), "M", theme.accent)
        software?.let {
            val known = ProfileFields.describeSoftware(it.name)
            Badge(listOf(known.label, it.version).filter(String::isNotEmpty).joinToString(" "), known.glyph, Color(known.color))
        }
    }
}

@Composable
private fun Badge(text: String, glyph: String, color: Color) {
    Row(
        Modifier.clip(CircleShape).background(theme.fill).padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(WZ.SizeIcon.md).background(color, CircleShape), contentAlignment = Alignment.Center) {
            Text(glyph, style = wizardFont(WZ.FontSize.xs, FontWeight.Bold), color = Color.White)
        }
        Text(text, style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Whether you verified this person, and a button to do it (emoji comparison) when they have an identity */
@Composable
internal fun ProfileVerification(userId: String) {
    val session = LocalSession.current
    var trust by remember(userId) { mutableStateOf<UserTrust?>(null) }
    var model by remember { mutableStateOf<VerificationModel?>(null) }
    LaunchedEffect(userId, model) {
        trust = session.client?.let { runCatching { it.userTrust(userId) }.getOrNull() }
    }
    val current = trust?.takeIf { it.verified || it.hasIdentity } ?: return
    GroupedSection {
        GroupedRow(
            tr(if (current.verified) "profile.verifiedUser" else "profile.notVerifiedUser"),
            icon = if (current.verified) "shield-check" else "shield-warning",
            iconTint = if (current.verified) theme.success else theme.textMuted,
            onClick = if (current.verified) null else ({ model = VerificationModel(VerificationModel.Start.User(userId)) }),
        ) {
            if (!current.verified) {
                Text(tr("verification.verifyUser"), style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), color = theme.accent)
            }
        }
    }
    model?.let { VerificationSheet(it) { model = null } }
}

/** A private note on someone, kept in account data and saved when the box loses focus */
@Composable
internal fun ProfileNote(userId: String) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var note by remember(userId) { mutableStateOf("") }
    var loaded by remember(userId) { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }

    suspend fun current(): Map<String, String> {
        val content: JsonElement? = session.accountDataJSON(ProfileFields.NOTES_TYPE) ?: session.accountDataJSON(ProfileFields.LEGACY_NOTES_TYPE)
        return ProfileFields.parseNotes(content)
    }

    LaunchedEffect(userId) {
        note = current()[userId].orEmpty()
        loaded = true
    }
    LaunchedEffect(saved) {
        if (saved) {
            delay(1600)
            saved = false
        }
    }

    fun save() {
        if (!loaded) return
        scope.launch {
            val notes = current().toMutableMap()
            val trimmed = note.take(ProfileFields.MAX_NOTE_LENGTH)
            if (trimmed == notes[userId].orEmpty()) return@launch
            if (trimmed.isEmpty()) notes.remove(userId) else notes[userId] = trimmed
            runCatching { session.setAccountDataJSON(ProfileFields.NOTES_TYPE, ProfileFields.notesValue(notes)) }
                .onSuccess { saved = true }
        }
    }

    GroupedSection(header = tr("profile.notes"), footer = if (saved) tr("profile.notesSaved") else null) {
        Box(Modifier.padding(WZ.Space.space3)) {
            WizardTextField(
                note,
                { note = it.take(ProfileFields.MAX_NOTE_LENGTH) },
                tr("profile.notesPlaceholderTouch"),
                Modifier.onFocusChanged {
                    if (focused && !it.isFocused) save()
                    focused = it.isFocused
                },
                singleLine = false,
            )
        }
    }
}

/** The profile picture, with a ring in the person's accent colour when they chose one */
@Composable
internal fun AccentAvatar(name: String, url: String?, accent: String?, decoration: org.wizardchat.android.ui.cosmetics.CosmeticCatalog.Image? = null) {
    val color = accentColor(accent)
    Box(contentAlignment = Alignment.Center) {
        if (color == null) {
            Avatar(name, url, WZ.SizeAvatar.xl)
        } else {
            Box(Modifier.border(3.dp, color, CircleShape).padding(3.dp)) { Avatar(name, url, WZ.SizeAvatar.xl) }
        }
        org.wizardchat.android.ui.cosmetics.DecorationOverlay(decoration, WZ.SizeAvatar.xl, animate = true)
    }
}
