package chat.mudrix.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.MediaVisibility
import chat.mudrix.android.matrix.PhotoUploadSize
import chat.mudrix.android.matrix.VideoUploadHeight
import chat.mudrix.android.matrix.VideoUploadMinSize
import chat.mudrix.android.matrix.VideoUploadMode
import chat.mudrix.android.matrix.VideoUploadTarget
import chat.mudrix.android.media.CompressTarget
import chat.mudrix.android.media.FileSize
import chat.mudrix.android.media.VideoCompressor
import chat.mudrix.android.media.VideoMeta
import chat.mudrix.android.media.VideoPlan
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

private const val MB = 1024L * 1024

/** Lengths of a typical phone clip (1080p, ~8 Mbps) used to show what the chosen settings do to it */
private val EXAMPLE_MINUTES = listOf(1, 5, 20)

@Composable
internal fun MediaSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.media.title"), onBack) {
        SettingsSection(tr("settings.media.viewing")) {
            PickerRow(
                tr("settings.privacy.mediaVisibility"),
                prefs.mediaVisibility,
                listOf(
                    MediaVisibility.always to tr("settings.privacy.mediaVisibilityAlways"),
                    MediaVisibility.private to tr("settings.privacy.mediaVisibilityPrivate"),
                    MediaVisibility.never to tr("settings.privacy.mediaVisibilityNever"),
                ),
                { prefs.mediaVisibility = it },
            )
        }
        LinkEmbedSettings()
        SettingsSection(tr("settings.media.photoUpload.title")) {
            ToggleRow(
                tr("settings.media.photoUpload.strip"),
                prefs.photoStripMetadata,
                { prefs.photoStripMetadata = it },
                note = tr("settings.media.photoUpload.stripNote"),
            )
            SettingsDivider()
            PickerRow(
                tr("settings.media.photoUpload.size"),
                prefs.photoUploadSize,
                PhotoUploadSize.entries.map { it to photoSizeLabel(it) },
                { prefs.photoUploadSize = it },
                note = tr("settings.media.photoUpload.sizeNote"),
            )
        }
        VideoUploadSection()
    }
}

@Composable
private fun photoSizeLabel(size: PhotoUploadSize): String = when (size) {
    PhotoUploadSize.original -> tr("settings.media.photoUpload.sizeOriginal")
    PhotoUploadSize.px2560 -> tr("settings.media.photoUpload.sizeLarge", size.json)
    PhotoUploadSize.px1920 -> tr("settings.media.photoUpload.sizeMedium", size.json)
    PhotoUploadSize.px1280 -> tr("settings.media.photoUpload.sizeSmall", size.json)
}

@Composable
private fun VideoUploadSection() {
    val prefs = LocalPrefs.current
    val maxUploadBytes = LocalSession.current.uploadLimit
    val mode = prefs.videoUploadMode
    SettingsSection(tr("settings.media.videoUpload.title")) {
        PickerRow(
            tr("settings.media.videoUpload.mode"),
            mode,
            listOf(
                VideoUploadMode.original to tr("settings.media.videoUpload.modeOriginal"),
                VideoUploadMode.smart to tr("settings.media.videoUpload.modeSmart"),
                VideoUploadMode.fixed to tr("settings.media.videoUpload.modeFixed"),
            ),
            { prefs.videoUploadMode = it },
            note = tr("settings.media.videoUpload.modeNote"),
        )
        if (mode == VideoUploadMode.original) return@SettingsSection

        SettingsDivider()
        PickerRow(
            tr("settings.media.videoUpload.minSize"),
            prefs.videoUploadMinSize,
            VideoUploadMinSize.entries.map { it to FileSize.format(it.megabytes * MB) },
            { prefs.videoUploadMinSize = it },
        )
        SettingsDivider()
        if (mode == VideoUploadMode.smart) {
            PickerRow(
                tr("settings.media.videoUpload.target"),
                prefs.videoUploadTarget,
                VideoUploadTarget.entries.map { option ->
                    option to (option.megabytes?.let { FileSize.format(it * MB) } ?: tr("settings.media.videoUpload.targetServer", FileSize.format(maxUploadBytes)))
                },
                { prefs.videoUploadTarget = it },
                note = tr("settings.media.videoUpload.targetNote"),
            )
        } else {
            PickerRow(
                tr("settings.media.videoUpload.height"),
                prefs.videoUploadHeight,
                VideoUploadHeight.entries.map { it to "${it.json}p" },
                { prefs.videoUploadHeight = it },
            )
        }
        SettingsDivider()
        if (!VideoCompressor.isSupported) {
            SettingsItem { Text(tr("settings.media.videoUpload.unsupported"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted) }
            return@SettingsSection
        }

        val uploadPrefs = prefs.videoUploadPrefs()
        val target = if (mode == VideoUploadMode.fixed) {
            CompressTarget.Fixed(uploadPrefs.height)
        } else {
            CompressTarget.Smart(VideoPlan.smartMaxBytes(uploadPrefs, maxUploadBytes))
        }
        SettingsItem(verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(tr("settings.media.videoUpload.examples"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
            for (minutes in EXAMPLE_MINUTES) {
                val durationSec = minutes * 60.0
                val original = durationSec * 8_000_000 / 8
                val plan = VideoPlan.planCompression(VideoMeta(durationSec, 1920, 1080, 8_000_000.0), target)
                val line = if (plan != null) {
                    tr(
                        "settings.media.videoUpload.exampleShrunk",
                        minutes.toString(),
                        FileSize.format(original),
                        plan.height.toString(),
                        FileSize.format(minOf(plan.estimatedBytes, original)),
                    )
                } else {
                    tr("settings.media.videoUpload.exampleSame", minutes.toString(), FileSize.format(original))
                }
                Text(line, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        }
    }
}
