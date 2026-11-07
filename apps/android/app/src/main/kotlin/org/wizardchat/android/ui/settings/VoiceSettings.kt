package org.wizardchat.android.ui.settings

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.SoundKind
import org.wizardchat.android.matrix.SoundPack
import org.wizardchat.android.matrix.SoundPacks
import org.wizardchat.android.matrix.rtc.Sounds
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** Settings > Voice & Audio: sound effects, microphone processing and the soundboard on this device */
@Composable
internal fun VoiceSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.voice.title"), onBack) {
        SoundEffectsSection()
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
        SoundboardSection()
    }
}

@Composable
private fun packOptions(): List<Pair<String, String>> =
    SoundPacks.CATEGORIES.flatMap { category ->
        SoundPacks.all.filter { it.category == category }.map { pack ->
            pack.id to "${pack.name} (${tr("settings.voice.packGroup.$category")})"
        }
    }

@Composable
private fun SoundEffectsSection() {
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
private fun SoundboardSection() {
    val prefs = LocalPrefs.current
    SettingsSection(tr("settings.voice.soundboardTitle")) {
        ToggleRow(
            tr("settings.voice.soundboardEnable"),
            prefs.soundboardEnabled,
            { prefs.soundboardEnabled = it },
            note = tr("settings.voice.soundboardEnableNote"),
        )
        SettingsDivider()
        VolumeRow(tr("settings.voice.soundboardVolume"), prefs.soundboardVolume, { prefs.soundboardVolume = it }, onPreview = null)
        if (prefs.soundboardMutedUsers.isNotEmpty()) {
            SettingsDivider()
            prefs.soundboardMutedUsers.sorted().forEach { userId ->
                SettingRow(userId) {
                    IconAction("x", tr("settings.voice.soundboardUnmute")) { prefs.soundboardMutedUsers = prefs.soundboardMutedUsers - userId }
                }
            }
        }
    }
}

@Composable
private fun VolumeRow(label: String, volume: Int, onChange: (Int) -> Unit, onPreview: (() -> Unit)?) {
    SettingsItem {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(label, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
            Text("$volume%", style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.textMuted)
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
