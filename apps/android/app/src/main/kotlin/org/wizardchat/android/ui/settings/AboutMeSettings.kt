package org.wizardchat.android.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.matrix.writeProfileField
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.people.accentColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** Settings > Account > About Me: bio, pronouns, timezone and accent colour of the extended profile */
@Composable
internal fun AboutMeSection() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var supported by remember { mutableStateOf(true) }
    var loaded by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(ExtendedProfile()) }
    var bio by remember { mutableStateOf("") }
    var pronouns by remember { mutableStateOf("") }
    var timezone by remember { mutableStateOf("") }
    var accent by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(session.client) {
        val client = session.client ?: return@LaunchedEffect
        supported = runCatching { client.supportsExtendedProfiles() }.getOrDefault(true)
        val profile = client.userId?.let { runCatching { client.profileFields(it) }.getOrNull() }
        saved = ProfileFields.parse(profile)
        bio = saved.bio
        pronouns = saved.pronouns.joinToString(", ")
        timezone = saved.timezone.orEmpty()
        accent = saved.accent.orEmpty()
        loaded = true
    }

    val deviceZone = ZoneId.systemDefault().id
    val zones = remember(saved.timezone) {
        buildList {
            addAll(ZoneId.getAvailableZoneIds().filter { '/' in it && !it.startsWith("Etc/") && !it.startsWith("SystemV/") }.sorted())
            add("UTC")
            saved.timezone?.let { if (it !in this) add(0, it) }
            if (deviceZone !in this) add(0, deviceZone)
        }
    }
    val zoneOptions = buildList {
        add("" to tr("settings.account.timezoneUnset"))
        zones.forEach { zone ->
            add(zone to if (zone == deviceZone) tr("settings.account.timezoneBrowser", zone.replace('_', ' ')) else zone.replace('_', ' '))
        }
    }

    val parsedPronouns = ProfileFields.parsePronounInput(pronouns)
    val accentNormalised = ProfileFields.normalizeHex(accent)
    val accentInvalid = accent.isNotBlank() && accentNormalised == null
    val dirty = loaded && (
        ProfileFields.sanitizeBio(bio) != saved.bio ||
            parsedPronouns != saved.pronouns ||
            (timezone.ifEmpty { null }) != saved.timezone ||
            (accentNormalised) != saved.accent
        )

    fun save() = scope.launch {
        busy = true
        try {
            val cleanBio = ProfileFields.sanitizeBio(bio)
            session.writeProfileField(ProfileFields.BIO_KEYS, cleanBio.takeIf { it.isNotEmpty() }?.let(ProfileFields::bioValue))
            session.writeProfileField(ProfileFields.PRONOUN_KEYS, parsedPronouns.takeIf { it.isNotEmpty() }?.let(ProfileFields::pronounsValue))
            session.writeProfileField(listOf(ProfileFields.TZ), timezone.takeIf { it.isNotEmpty() }?.let { kotlinx.serialization.json.JsonPrimitive(it) })
            session.writeProfileField(ProfileFields.ACCENT_KEYS, accentNormalised?.let { kotlinx.serialization.json.JsonPrimitive(it) })
            saved = saved.copy(bio = cleanBio, pronouns = parsedPronouns, timezone = timezone.ifEmpty { null }, accent = accentNormalised)
            bio = cleanBio
            CopyToast.show(L10n.format("settings.account.profileSaved"))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            CopyToast.show(L10n.format("common.saveFailed", e.text))
        } finally {
            busy = false
        }
    }

    SettingsSection(tr("settings.account.aboutTitle"), if (!supported) tr("settings.account.extendedProfileUnsupported") else null) {
        SettingsItem {
            Text(tr("settings.account.bio"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            WizardTextField(
                bio,
                { bio = it.take(ProfileFields.MAX_BIO_CHARS) },
                tr("settings.account.bioPlaceholder"),
                singleLine = false,
                enabled = supported,
            )
            Text(
                tr("settings.account.bioHintTouch", ProfileFields.MAX_BIO_CHARS, ProfileFields.MAX_BIO_LINES),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
        }
        SettingsDivider()
        SettingsItem {
            Text(tr("settings.account.pronouns"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            WizardTextField(pronouns, { pronouns = it }, tr("settings.account.pronounsPlaceholder"), enabled = supported)
            Text(
                tr("settings.account.pronounsHint", ProfileFields.MAX_PRONOUN_ENTRIES, ProfileFields.MAX_PRONOUN_CHARS),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
        }
        SettingsDivider()
        PickerRow(tr("settings.account.timezone"), timezone, zoneOptions, { timezone = it }, note = tr("settings.account.timezoneHint"), enabled = supported)
        SettingsDivider()
        SettingsItem {
            Text(tr("profile.accent.title"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                ProfileFields.ACCENT_PRESETS.forEach { hex ->
                    val color = accentColor(hex) ?: Color.Gray
                    Box(
                        Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(color)
                            .then(if (accentNormalised == hex) Modifier.border(3.dp, theme.textPrimary, CircleShape) else Modifier)
                            .clickable(enabled = supported) { accent = hex },
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                WizardTextField(accent, { accent = it.take(7) }, tr("profile.accent.hex"), Modifier.weight(1f), enabled = supported)
                if (accent.isNotEmpty()) {
                    Text(
                        tr("profile.accent.reset"),
                        Modifier.clickable { accent = "" },
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = theme.accent,
                    )
                }
            }
            if (accentInvalid) Text(tr("profile.accent.invalid"), style = wizardFont(WZ.FontSize.sm), color = theme.error)
            else Text(tr("profile.accent.hint"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
        SettingsDivider()
        SettingsItem {
            PrimaryButton(tr("common.save"), ::save, enabled = supported && dirty && !busy && !accentInvalid)
        }
    }
}
