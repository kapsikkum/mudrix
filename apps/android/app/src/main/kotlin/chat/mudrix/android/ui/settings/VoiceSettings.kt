package chat.mudrix.android.ui.settings

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.SoundKind
import chat.mudrix.android.matrix.SoundPack
import chat.mudrix.android.matrix.SoundPacks
import chat.mudrix.android.matrix.memberProfile
import chat.mudrix.android.matrix.rtc.Soundboard
import chat.mudrix.android.matrix.rtc.Sounds
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.PhWeight
import chat.mudrix.android.ui.PrimaryButton
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

// The Mudrix-only sections of Settings > Voice & Video (`VoiceVideoSettings` lays them out):
// microphone processing, sound effects and moving people between voice rooms. The soundboard has its own page.

/** Microphone processing, applied to the next call */
@Composable
internal fun VoiceProcessingSection() {
    val prefs = LocalPrefs.current
    SettingsSection(tr("settings.voice.inputTitle"), tr("settings.voice.processingNote")) {
        ToggleRow(
            tr("settings.voice.noiseSuppression"),
            prefs.noiseSuppression,
            { prefs.noiseSuppression = it },
            note = tr("settings.voice.noiseSuppressionNote"),
        )
        SettingsDivider()
        ToggleRow(
            tr("settings.voice.echoCancellation"),
            prefs.echoCancellation,
            { prefs.echoCancellation = it },
            note = tr("settings.voice.echoCancellationNote"),
        )
        SettingsDivider()
        ToggleRow(
            tr("settings.voice.autoGainControl"),
            prefs.autoGainControl,
            { prefs.autoGainControl = it },
            note = tr("settings.voice.autoGainControlNote"),
        )
    }
}

/** Whether other people may move you between voice rooms */
@Composable
internal fun VoiceMovesSection() {
    val prefs = LocalPrefs.current
    SettingsSection(null, tr("settings.voice.allowMovesNote")) {
        ToggleRow(tr("settings.voice.allowMoves"), prefs.allowVoiceMoves, { prefs.allowVoiceMoves = it })
    }
}

@Composable
private fun packOptions(): List<Pair<String, String>> =
    SoundPacks.CATEGORIES.flatMap { category ->
        SoundPacks.all.filter { it.category == category }.map { pack ->
            pack.id to "${pack.name} (${tr("settings.voice.packGroup.$category")})"
        }
    }

/** Sound pack, volume and per-sound overrides for messages and calls */
@Composable
internal fun SoundEffectsSection() {
    val prefs = LocalPrefs.current
    val overrides = prefs.soundOverrides
    val mainPack: SoundPack = SoundPacks.get(prefs.notificationSoundPack)
    SettingsSection(tr("settings.voice.soundsTitle"), tr("settings.voice.soundsNote")) {
        PickerRow(tr("settings.voice.soundPack"), mainPack.id, packOptions(), { prefs.notificationSoundPack = it })
        SettingsDivider()
        VolumeRow(tr("settings.voice.soundVolume"), prefs.notificationSoundVolume, { prefs.notificationSoundVolume = it }) {
            Sounds.preview(SoundKind.Message, mainPack.id)
        }
        SoundKind.entries.forEach { kind ->
            SettingsDivider()
            val chosen = overrides[kind]
            val options = buildList {
                add("" to tr("settings.voice.soundSame", mainPack.name))
                add(SoundPacks.OFF to tr("settings.voice.soundOff"))
                addAll(packOptions())
            }
            // A pack that lacks this sound plays the fallback for it, so every pack can be picked
            val selection = if (chosen != null && (chosen == SoundPacks.OFF || SoundPacks.all.any { it.id == chosen })) chosen else ""
            PickerRow(
                tr(kind.labelKey),
                selection,
                options,
                { value ->
                    prefs.soundOverrides = if (value.isEmpty()) overrides - kind else overrides + (kind to value)
                    if (value != SoundPacks.OFF) Sounds.preview(kind, value.ifEmpty { mainPack.id })
                },
            )
        }
        if (overrides.isNotEmpty()) {
            SettingsItem {
                PrimaryButton(tr("settings.voice.resetSounds"), { prefs.soundOverrides = emptyMap() })
            }
        }
    }
}

@Composable
internal fun SoundboardSettings(onBack: () -> Unit) {
    val client = LocalSession.current.client
    SettingsPage(tr("settings.soundboard.title"), onBack) {
        SoundboardSection()
        if (client != null) {
            DefaultPackSection(client)
            FavoritePacksSection(client)
        }
    }
}

@Composable
private fun MutedUserRow(userId: String, onUnmute: () -> Unit) {
    val session = LocalSession.current
    var name by remember(userId) { mutableStateOf<String?>(null) }
    LaunchedEffect(userId) { name = session.memberProfile(userId, null).name }
    SettingRow(name?.takeIf { it.isNotBlank() } ?: userId) {
        IconAction("x", tr("settings.voice.soundboardUnmute"), onClick = onUnmute)
    }
}

@Composable
private fun SoundboardSection() {
    val prefs = LocalPrefs.current
    val client = LocalSession.current.client
    val sample = Soundboard.builtInClips.firstOrNull()
    SettingsSection(tr("settings.voice.soundboardTitle")) {
        ToggleRow(
            tr("settings.voice.soundboardEnable"),
            prefs.soundboardEnabled,
            { prefs.soundboardEnabled = it },
            note = tr("settings.voice.soundboardEnableNote"),
        )
        SettingsDivider()
        VolumeRow(
            tr("settings.voice.soundboardVolume"),
            prefs.soundboardVolume,
            { prefs.soundboardVolume = it },
            onPreview = null,
            testClip = if (sample != null && client != null) ({ Soundboard.preview(client, sample) }) else null,
            testEnabled = prefs.soundboardEnabled,
        )
    }
    val muted = prefs.soundboardMutedUsers
    SettingsSection(
        tr("settings.voice.soundboardMuted"),
        tr(if (muted.isEmpty()) "settings.voice.soundboardMutedNone" else "settings.voice.soundboardMutedNote"),
    ) {
        muted.sorted().forEachIndexed { index, userId ->
            if (index > 0) SettingsDivider()
            MutedUserRow(userId) { prefs.soundboardMutedUsers = prefs.soundboardMutedUsers - userId }
        }
    }
}

@Composable
private fun VolumeRow(
    label: String,
    volume: Int,
    onChange: (Int) -> Unit,
    testClip: (() -> Unit)? = null,
    testEnabled: Boolean = true,
    onPreview: (() -> Unit)?,
) {
    SettingsItem {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(label, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
            Text("$volume%", style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.textMuted)
            if (testClip != null) {
                IconAction("play", tr("settings.voice.soundboardPreview"), PhWeight.fill, if (testEnabled) theme.accent else theme.textMuted) {
                    if (testEnabled) testClip() else CopyToast.show(L10n.format("soundboard.play.disabled"))
                }
            }
        }
        Slider(
            value = volume.toFloat(),
            onValueChange = { onChange(it.toInt()) },
            onValueChangeFinished = { onPreview?.invoke() },
            valueRange = 0f..100f,
            colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent, inactiveTrackColor = theme.fill),
        )
    }
}
