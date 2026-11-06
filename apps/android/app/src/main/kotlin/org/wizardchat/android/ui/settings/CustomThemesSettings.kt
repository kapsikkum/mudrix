package org.wizardchat.android.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.CustomTheme
import org.wizardchat.android.ui.theme.CustomThemes
import org.wizardchat.android.ui.theme.ThemeDerive
import org.wizardchat.android.ui.theme.ThemeSpec
import org.wizardchat.android.ui.theme.Themes
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

private fun labelKey(color: String) = "settings.appearance.customTheme.$color"

/** Create, edit, share and delete custom themes. Edits apply as you type: the edited theme is simply selected. */
@Composable
internal fun CustomThemesSection() {
    val prefs = LocalPrefs.current
    val systemDark = isSystemInDarkTheme()
    val customs = prefs.customThemes
    val effective = prefs.effectiveThemeName(systemDark)
    var editingId by remember { mutableStateOf<String?>(null) }
    var importOpen by remember { mutableStateOf(false) }
    var importText by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    fun add(name: String, colors: ThemeSpec) {
        if (customs.size >= CustomThemes.MAX) {
            error = L10n.format("settings.appearance.customTheme.limit", CustomThemes.MAX)
            return
        }
        val created = CustomTheme(CustomThemes.newId(), name, colors)
        prefs.customThemes = customs + created
        prefs.followSystemTheme = false
        prefs.theme = created.themeName
        editingId = created.id
        error = null
    }

    fun update(id: String, change: (CustomTheme) -> CustomTheme) {
        prefs.customThemes = customs.map { if (it.id == id) change(it) else it }
    }

    val newName = tr("settings.appearance.customTheme.newName", customs.size + 1)
    val invalid = tr("settings.appearance.customTheme.importInvalid")
    val copied = tr("settings.appearance.customTheme.copied")

    SettingsSection(tr("settings.appearance.customTheme.title"), note = tr("settings.appearance.customTheme.note")) {
        customs.forEach { custom ->
            val active = prefs.theme == custom.themeName && !prefs.followSystemTheme
            val editing = editingId == custom.id
            val (surface, accent) = CustomThemes.swatch(custom)
            SettingsItem {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    Box(
                        Modifier
                            .size(WZ.Space.space9)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(0f to surface, 0.5f to surface, 0.5f to accent, 1f to accent))
                            .border(1.dp, theme.border, CircleShape),
                    )
                    Text(
                        custom.name,
                        Modifier.weight(1f),
                        style = wizardFont(WZ.FontSize.lg),
                        color = theme.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (active) {
                        Text(tr("settings.appearance.customTheme.inUse"), style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.textMuted)
                    } else {
                        Text(
                            tr("settings.appearance.customTheme.use"),
                            Modifier.clip(CircleShape).clickable {
                                prefs.followSystemTheme = false
                                prefs.theme = custom.themeName
                            }.padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space3),
                            style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                            color = theme.accent,
                        )
                    }
                    IconAction("pencil-simple", tr("settings.appearance.customTheme.edit")) {
                        editingId = if (editing) null else custom.id
                    }
                }
                if (editing) {
                    var name by remember(custom.id) { mutableStateOf(custom.name) }
                    WizardTextField(
                        name,
                        {
                            name = it.take(CustomThemes.MAX_NAME_LENGTH)
                            CustomThemes.cleanName(name).takeIf { clean -> clean.isNotEmpty() }?.let { clean -> update(custom.id) { c -> c.copy(name = clean) } }
                        },
                        tr("settings.appearance.customTheme.name"),
                    )
                    ThemeSpec.KEYS.forEach { key ->
                        ColorField(tr(labelKey(key)), custom.colors.toMap().getValue(key)) { hex ->
                            update(custom.id) { c -> c.copy(colors = c.colors.with(key, hex)) }
                        }
                    }
                    LabelButton(
                        tr("settings.appearance.customTheme.export"),
                        "copy",
                        { copyToClipboard(CustomThemes.serialize(custom), copied) },
                    )
                    LabelButton(
                        tr("settings.appearance.customTheme.delete"),
                        "trash",
                        {
                            prefs.customThemes = customs.filter { it.id != custom.id }
                            if (prefs.theme == custom.themeName) prefs.theme = Themes.defaultName
                            editingId = null
                        },
                        color = theme.danger,
                    )
                }
            }
            SettingsDivider()
        }
        SettingsItem {
            LabelButton(
                tr("settings.appearance.customTheme.create"),
                "plus",
                { add(newName, ThemeSpec.of(Themes.resolve(effective, customs).colors)) },
            )
            LabelButton(tr("settings.appearance.customTheme.import"), null, { importOpen = !importOpen })
            if (importOpen) {
                WizardTextField(
                    importText,
                    { importText = it },
                    tr("settings.appearance.customTheme.importPlaceholder"),
                    singleLine = false,
                )
                LabelButton(
                    tr("settings.appearance.customTheme.importConfirm"),
                    null,
                    {
                        val shared = CustomThemes.parseShared(importText)
                        if (shared == null) {
                            error = invalid
                        } else {
                            add(shared.first, shared.second)
                            importText = ""
                            importOpen = false
                        }
                    },
                    primary = true,
                    enabled = importText.isNotBlank(),
                )
            }
        }
    }
    error?.let { StatusText(it) }
}

/** A colour's swatch and its `#rrggbb` text; a valid value applies as soon as it is typed */
@Composable
private fun ColorField(label: String, value: String, onChange: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(
            Modifier
                .size(WZ.Space.space9)
                .clip(CircleShape)
                .background(ThemeDerive.parse(value))
                .border(1.dp, theme.border, CircleShape),
        )
        Text(label, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
        WizardTextField(
            text,
            {
                text = it
                val hex = "#" + it.trim().removePrefix("#")
                if (ThemeDerive.isHexColor(hex)) onChange(hex.lowercase())
            },
            "#rrggbb",
            Modifier.width(132.dp).padding(0.dp),
        )
    }
}
