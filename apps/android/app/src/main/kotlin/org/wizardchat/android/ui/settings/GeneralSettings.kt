package org.wizardchat.android.ui.settings

import android.text.format.DateFormat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.PackageInfoCompat
import java.util.Date
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.AppPreferences
import org.wizardchat.android.matrix.DateFormatStyle
import org.wizardchat.android.matrix.Density
import org.wizardchat.android.matrix.EmojiOnlySize
import org.wizardchat.android.matrix.InviteBlocking
import org.wizardchat.android.matrix.PresenceChoice
import org.wizardchat.android.matrix.MessageLayout
import org.wizardchat.android.matrix.MessageMention
import org.wizardchat.android.matrix.ReducedMotion
import org.wizardchat.android.matrix.StreamerMode
import org.wizardchat.android.matrix.TimeFormat
import org.wizardchat.android.matrix.deviceId
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardLogo
import org.wizardchat.android.ui.theme.CustomTheme
import org.wizardchat.android.ui.theme.Themes
import org.wizardchat.android.ui.room.MentionColors
import org.wizardchat.android.ui.room.MessageText
import org.wizardchat.android.ui.theme.WizardTheme
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

@Composable
internal fun AppearanceSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val customs = prefs.customThemes
    val themeHasIcon = Themes.hasThemedLogo(prefs.effectiveThemeName(isSystemInDarkTheme()))
    val themeNames = Themes.builtin.map { it.label } + customs.map { it.themeName }
    val themeOptions = themeNames.map { name -> name to Themes.label(name, customs) }

    SettingsPage(tr("settings.appearance.title"), onBack) {
        SettingsSection { ChatPreview() }

        SettingsSection {
            ToggleRow(
                tr("settings.appearance.followSystemTheme"),
                prefs.followSystemTheme,
                { prefs.followSystemTheme = it },
                note = tr("settings.appearance.followSystemThemeNote"),
            )
            SettingsDivider()
            if (prefs.followSystemTheme) {
                PickerRow(tr("settings.appearance.systemDarkTheme"), prefs.systemDarkTheme, themeOptions, { prefs.systemDarkTheme = it })
                SettingsDivider()
                PickerRow(tr("settings.appearance.systemLightTheme"), prefs.systemLightTheme, themeOptions, { prefs.systemLightTheme = it })
            } else {
                // So many themes don't fit beside the label, so it sits above them
                SettingsItem {
                    Text(tr("settings.appearance.theme"), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                    ) {
                        themeNames.forEach { name ->
                            val selected = prefs.theme == name
                            val label = Themes.label(name, customs)
                            Box(
                                Modifier
                                    .padding(WZ.Space.space1)
                                    .size(WZ.Space.space9)
                                    .clip(CircleShape)
                                    .background(swatch(name, customs))
                                    .border(if (selected) 2.5.dp else 1.dp, if (selected) theme.accent else theme.border, CircleShape)
                                    .clickable { prefs.theme = name }
                                    .semantics {
                                        contentDescription = label
                                        this.selected = selected
                                        role = Role.RadioButton
                                    },
                            )
                        }
                    }
                }
            }
            SettingsDivider()
            PickerRow(
                tr("settings.appearance.messageLayoutMobile"),
                prefs.messageLayout,
                listOf(
                    MessageLayout.modern to tr("settings.appearance.modern"),
                    MessageLayout.classic to tr("settings.appearance.classic"),
                    MessageLayout.compact to tr("settings.appearance.compact"),
                ),
                { prefs.messageLayout = it },
                note = tr("settings.appearance.messageLayoutMobileNote"),
            )
            SettingsDivider()
            SettingsItem {
                Row(
                    Modifier.pointerInput(Unit) {
                        detectTapGestures(onDoubleTap = { prefs.chatFontSize = AppPreferences.DEFAULT_CHAT_FONT_SIZE })
                    },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tr("settings.appearance.textSize"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Text(
                        tr("settings.appearance.textSizePx", "${prefs.chatFontSize.toInt()}"),
                        style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
                        color = theme.textMuted,
                    )
                }
                val sizes = AppPreferences.CHAT_FONT_SIZES
                Slider(
                    value = sizes.indexOf(prefs.chatFontSize).takeIf { it >= 0 }?.toFloat() ?: 2f,
                    onValueChange = { prefs.chatFontSize = sizes[Math.round(it).coerceIn(0, sizes.lastIndex)] },
                    valueRange = 0f..sizes.lastIndex.toFloat(),
                    steps = sizes.size - 2,
                    colors = SliderDefaults.colors(
                        thumbColor = theme.accent,
                        activeTrackColor = theme.accent,
                        inactiveTrackColor = theme.fill,
                        activeTickColor = theme.textOnAccent.copy(alpha = 0.5f),
                        inactiveTickColor = theme.textMuted.copy(alpha = 0.5f),
                    ),
                )
            }
            SettingsDivider()
            PickerRow(tr("settings.appearance.density"), prefs.chatDensity, densityOptions(), { prefs.chatDensity = it })
            SettingsDivider()
            ToggleRow(tr("settings.appearance.colorUsernames"), prefs.colorUsernames, { prefs.colorUsernames = it })
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.prettifyLinks"),
                prefs.prettifyLinks,
                { prefs.prettifyLinks = it },
                note = tr("settings.appearance.prettifyLinksNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.groupImages"),
                prefs.groupImages,
                { prefs.groupImages = it },
                note = tr("settings.appearance.groupImagesNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.hideMembershipEvents"),
                prefs.hideMembershipEvents,
                { prefs.hideMembershipEvents = it },
                note = tr("settings.appearance.hideMembershipEventsNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.hideProfileEvents"),
                prefs.hideProfileEvents,
                { prefs.hideProfileEvents = it },
                note = tr("settings.appearance.hideProfileEventsNote"),
            )
            SettingsDivider()
            // Android can't swap the launcher icon per theme, so this themes the in-app logo
            ToggleRow(
                tr("settings.appearance.themedAppIcon"),
                themeHasIcon && prefs.themedAppIcon,
                { prefs.themedAppIcon = it },
                disabled = !themeHasIcon,
            )
        }

        CustomThemesSection()

        SettingsSection {
            PickerRow(
                tr("settings.appearance.uiDensity"),
                prefs.uiDensity,
                densityOptions(),
                { prefs.uiDensity = it },
                note = tr("settings.appearance.uiDensityNote"),
            )
            SettingsDivider()
            ToggleRow(tr("settings.appearance.showRoomAvatars"), prefs.showRoomAvatars, { prefs.showRoomAvatars = it })
        }

        SettingsSection {
            PickerRow(
                tr("settings.appearance.timeFormat"),
                prefs.timeFormat,
                listOf(
                    TimeFormat.auto to tr("settings.appearance.timeFormatAuto"),
                    TimeFormat.h12 to tr("settings.appearance.timeFormat12h"),
                    TimeFormat.h24 to tr("settings.appearance.timeFormat24h"),
                ),
                { prefs.timeFormat = it },
            )
            SettingsDivider()
            PickerRow(
                tr("settings.appearance.dateFormat"),
                prefs.dateFormat,
                listOf(
                    DateFormatStyle.long to tr("settings.appearance.dateFormatLong"),
                    DateFormatStyle.dmy to tr("settings.appearance.dateFormatDmy"),
                    DateFormatStyle.mdy to tr("settings.appearance.dateFormatMdy"),
                    DateFormatStyle.ymd to tr("settings.appearance.dateFormatYmd"),
                ),
                { prefs.dateFormat = it },
            )
        }

        SettingsSection(tr("settings.appearance.emoji")) {
            PickerRow(
                tr("settings.appearance.emojiOnlySize"),
                prefs.emojiOnlySize,
                listOf(
                    EmojiOnlySize.normal to tr("settings.appearance.emojiOnlySizeNormal"),
                    EmojiOnlySize.large to tr("settings.appearance.emojiOnlySizeLarge"),
                    EmojiOnlySize.jumbo to tr("settings.appearance.emojiOnlySizeJumbo"),
                ),
                { prefs.emojiOnlySize = it },
                note = tr("settings.appearance.emojiOnlySizeNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.emoticonsToEmoji"),
                prefs.emoticonsToEmoji,
                { prefs.emoticonsToEmoji = it },
                note = tr("settings.appearance.emoticonsToEmojiNote"),
            )
        }
    }
}

@Composable
private fun densityOptions() = listOf(
    Density.compact to tr("settings.appearance.densityCompact"),
    Density.default to tr("settings.appearance.densityDefault"),
    Density.spacious to tr("settings.appearance.densitySpacious"),
)

private fun swatch(name: String, customs: List<CustomTheme>): Brush {
    val resolved = Themes.resolve(name, customs)
    return Brush.linearGradient(0f to resolved.bgSecondary, 0.5f to resolved.bgSecondary, 0.5f to resolved.accent, 1f to resolved.accent)
}

/** Two sample messages in the current theme, text size, density and layout */
@Composable
private fun ChatPreview() {
    val session = LocalSession.current
    val now = remember { System.currentTimeMillis() }
    val ownName = session.displayName ?: session.userId ?: "You"
    Column(Modifier.fillMaxWidth().padding(vertical = WZ.Space.space4)) {
        PreviewMessage(
            "Merlin",
            null,
            "settings.appearance.previewOtherMessage",
            mention = mentionLabel(ownName),
            mentionsMe = true,
            isOwn = false,
            senderId = "@merlin:wizardchat.org",
            timestamp = now - 120_000,
        )
        PreviewMessage(
            ownName,
            session.avatarUrl,
            "settings.appearance.previewOwnMessage",
            mention = mentionLabel("Merlin"),
            mentionsMe = false,
            senderId = session.userId ?: "@you:wizardchat.org",
            isOwn = true,
            timestamp = now - 60_000,
        )
    }
}

private fun mentionLabel(name: String) = if (name.startsWith("@")) name else "@$name"

@Composable
private fun PreviewMessage(
    sender: String,
    avatarUrl: String?,
    textKey: String,
    mention: String,
    mentionsMe: Boolean,
    isOwn: Boolean,
    senderId: String,
    timestamp: Long,
) {
    val body = tr(textKey, mention)
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    val scale = prefs.chatScale
    val spacing = prefs.chatSpacing
    val isClassic = prefs.messageLayout == MessageLayout.classic
    val linkColor = if (isClassic && isOwn && theme.isDark) theme.textOnAccent else theme.linkColor
    val text = MessageText.attributed(
        body,
        prefs.prettifyLinks,
        linkColor,
        mentions = listOf(MessageMention(mention, "", isOwn = mentionsMe)),
        mentionColors = MentionColors(theme.mention, if (isClassic && isOwn && theme.isDark) theme.textOnAccent else theme.accent),
        onMention = {},
    )
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6)
            .padding(top = (6 * spacing).dp, bottom = (2 * spacing).dp),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Avatar(sender, avatarUrl, size = WZ.SizeAvatar.md, modifier = Modifier.padding(top = WZ.Space.space1))
        Column(Modifier.weight(1f).padding(end = WZ.Space.space5)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                Text(
                    sender,
                    Modifier.weight(1f, fill = false),
                    style = wizardFont(WZ.FontSize.md * scale, FontWeight.SemiBold),
                    color = nameColor(senderId),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    DateFormat.getTimeFormat(context).format(Date(timestamp)),
                    style = wizardFont(WZ.FontSize.sm * scale),
                    color = theme.textMuted,
                )
            }
            Text(
                text,
                Modifier
                    .then(
                        if (isClassic) {
                            Modifier
                                .clip(RoundedCornerShape(WZ.Radius.xl))
                                .background(if (isOwn) theme.msgMineBg else theme.msgOtherBg)
                                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)
                        } else {
                            Modifier
                        },
                    ),
                style = wizardFont(WZ.FontSize.lg * scale).copy(lineHeight = WZ.FontSize.lg * scale * 1.25f),
                color = if (isClassic && isOwn && theme.isDark) theme.textOnAccent else theme.textPrimary,
            )
        }
    }
}

@Composable
internal fun AccessibilitySettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.accessibility.title"), onBack) {
        SettingsSection {
            PickerRow(
                tr("settings.accessibility.reducedMotion"),
                prefs.reducedMotion,
                listOf(
                    ReducedMotion.system to tr("settings.accessibility.reducedMotionSystem"),
                    ReducedMotion.on to tr("settings.accessibility.reducedMotionOn"),
                    ReducedMotion.off to tr("settings.accessibility.reducedMotionOff"),
                ),
                { prefs.reducedMotion = it },
                note = tr("settings.accessibility.reducedMotionNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.accessibility.autoplayGifs"),
                prefs.autoplayGifs,
                { prefs.autoplayGifs = it },
                note = tr("settings.accessibility.autoplayGifsNote"),
            )
        }
    }
}

@Composable
internal fun PrivacySettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.privacy.title"), onBack) {
        SettingsSection(tr("settings.privacy.chat")) {
            ToggleRow(
                tr("settings.privacy.typingIndicators"),
                prefs.typingIndicators,
                { prefs.typingIndicators = it },
                note = tr("settings.privacy.typingIndicatorsNote"),
            )
            SettingsDivider()
            ToggleRow(tr("settings.privacy.readReceipts"), prefs.sendReadReceipts, { prefs.sendReadReceipts = it }, note = tr("settings.privacy.readReceiptsNote"))
        }
        SettingsSection(tr("settings.privacy.streamer.title")) {
            PickerRow(
                tr("settings.privacy.streamer.mode"),
                prefs.streamerMode,
                listOf(
                    StreamerMode.off to tr("settings.privacy.streamer.off"),
                    StreamerMode.auto to tr("settings.privacy.streamer.auto"),
                    StreamerMode.on to tr("settings.privacy.streamer.on"),
                ),
                { prefs.streamerMode = it },
                note = tr("settings.privacy.streamer.note"),
            )
        }
        SettingsSection(tr("settings.privacy.other")) {
            ToggleRow(tr("settings.privacy.showPresence"), prefs.showPresence, { prefs.showPresence = it }, note = tr("settings.privacy.showPresenceNote"))
            if (prefs.showPresence) {
                SettingsDivider()
                PickerRow(
                    tr("presence.changeStatus"),
                    prefs.presenceChoice,
                    listOf(
                        PresenceChoice.auto to tr("presence.auto"),
                        PresenceChoice.online to tr("presence.online"),
                        PresenceChoice.away to tr("presence.away"),
                        PresenceChoice.invisible to tr("mobile.presence.invisible"),
                    ),
                    { prefs.presenceChoice = it },
                )
            }
            SettingsDivider()
            ToggleRow(
                tr("settings.privacy.showHomeserverSoftware"),
                prefs.showHomeserverSoftware,
                { prefs.showHomeserverSoftware = it },
                note = tr("settings.privacy.showHomeserverSoftwareNote"),
            )
            BlockInvitesRow()
        }
    }
}

/** "Block all invites" (MSC4380); not shown when the homeserver has no such setting */
@Composable
private fun BlockInvitesRow() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var eventType by remember { mutableStateOf<String?>(null) }
    var blocked by remember { mutableStateOf(false) }
    LaunchedEffect(session.client) {
        val client = session.client ?: return@LaunchedEffect
        val type = runCatching { InviteBlocking.eventType(client.serverFeatures().unstableFeatures) }.getOrNull() ?: return@LaunchedEffect
        blocked = InviteBlocking.isBlocked(runCatching { client.accountData(type) }.getOrNull())
        eventType = type
    }
    val type = eventType ?: return
    SettingsDivider()
    ToggleRow(
        tr("settings.privacy.blockInvites"),
        blocked,
        { next ->
            val client = session.client ?: return@ToggleRow
            val before = blocked
            blocked = next
            scope.launch {
                try {
                    client.setAccountData(type, InviteBlocking.content(next))
                } catch (e: Exception) {
                    blocked = before
                    CopyToast.show(L10n.format("settings.privacy.blockInvitesFailed", e.message ?: ""))
                }
            }
        },
        note = tr("settings.privacy.blockInvitesNote"),
    )
}

/** The app language; Android applies it right away (per-app languages), so there's no "reopen" note */
@Composable
internal fun LanguageSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.language.title"), onBack) {
        SettingsSection {
            PickerRow(
                tr("settings.language.languageDisplay"),
                prefs.language,
                listOf("" to tr("settings.language.languageSystem")) +
                    AppPreferences.LANGUAGES.map { code -> code to tr("settings.language.language${code.replaceFirstChar { it.uppercase() }}") },
                { prefs.language = it },
            )
        }
    }
}

@Composable
internal fun DeveloperSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val session = LocalSession.current
    var tokenExpanded by remember { mutableStateOf(false) }
    var showAccountData by remember { mutableStateOf(false) }
    SettingsPage(tr("developer.title"), onBack) {
        SettingsSection {
            ToggleRow(
                tr("developer.enable"),
                prefs.developerMode,
                { prefs.developerMode = it },
                note = tr("developer.enableDescription"),
            )
        }
        if (prefs.developerMode) {
            SettingsSection {
                val rotation by animateFloatAsState(if (tokenExpanded) 90f else 0f, label = "disclosure")
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = WZ.Space.space11)
                        .clickable { tokenExpanded = !tokenExpanded }
                        .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tr("developer.accessToken"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Box(Modifier.rotate(rotation)) {
                        PhIcon("caret-right", org.wizardchat.android.ui.PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.accent)
                    }
                }
                AnimatedVisibility(tokenExpanded) {
                    Column {
                        Row(
                            Modifier.padding(horizontal = WZ.Space.space5),
                            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                        ) {
                            PhIcon("warning", size = WZ.SizeIcon.sm, tint = theme.warningColor)
                            Text(tr("developer.accessTokenWarning"), style = wizardFont(WZ.FontSize.sm), color = theme.warningColor)
                        }
                        CopyRow(tr("developer.accessToken"), session.client?.session?.accessToken ?: "", secret = true)
                    }
                }
                SettingsDivider()
                CopyRow(tr("developer.homeserverUrl"), session.client?.session?.homeserverUrl ?: "")
                session.deviceId?.let { deviceId ->
                    SettingsDivider()
                    CopyRow(tr("settings.sessions.deviceId"), deviceId)
                }
            }
            SettingsSection {
                Text(
                    tr("developer.accountData.title"),
                    Modifier
                        .fillMaxWidth()
                        .clickable { showAccountData = true }
                        .heightIn(min = WZ.Space.space11)
                        .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textPrimary,
                )
            }
        }
    }
    if (showAccountData) AccountDataSheet(onDismiss = { showAccountData = false })
}

@Composable
internal fun AboutSettings(onBack: () -> Unit) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val whatsNew = remember { WhatsNew.latest(context) }
    var showWhatsNew by remember { mutableStateOf(false) }
    val version = remember {
        runCatching {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            "v${info.versionName ?: "?"} (${PackageInfoCompat.getLongVersionCode(info)})"
        }.getOrDefault("v? (?)")
    }
    SettingsPage(tr("settings.about.title"), onBack) {
        SettingsSection {
            SettingsItem(horizontalAlignment = Alignment.CenterHorizontally) {
                WizardLogo(size = WZ.Space.space12)
                Text(tr("app.name"), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary)
                Text(tr("auth.tagline"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                Text(version, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
            SettingsItem {
                LabelButton(
                    tr("settings.downloadMudrixForDesktop"),
                    "download-simple",
                    { uriHandler.openUri("https://github.com/kapsikkum/mudrix/releases/latest") },
                )
            }
            SettingsItem {
                LabelButton(
                    tr("settings.about.viewSourceOnGitHub"),
                    "code",
                    { uriHandler.openUri("https://github.com/kapsikkum/mudrix") },
                )
            }
        }

        SettingsSection(tr("settings.about.credits")) {
            SettingsItem {
                Credit("matrix-rust-sdk", "https://github.com/matrix-org/matrix-rust-sdk", tr("settings.about.creditMatrix"))
                Credit("Roboto", "https://fonts.google.com/specimen/Roboto", tr("settings.about.creditRoboto"))
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space7),
        ) {
            if (whatsNew != null) FooterLink(tr("whatsNew.title"), "sparkle") { showWhatsNew = true }
            FooterLink(tr("settings.about.privacyPolicy"), "shield-check") { uriHandler.openUri("https://github.com/kapsikkum/mudrix") }
        }
    }
    if (showWhatsNew && whatsNew != null) WhatsNewSheet(whatsNew) { showWhatsNew = false }
}

@Composable
private fun FooterLink(text: String, icon: String, onClick: () -> Unit) {
    Row(
        Modifier.clickable(onClick = onClick).padding(vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        PhIcon(icon, size = WZ.SizeIcon.sm, tint = theme.textMuted)
        Text(text, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
    }
}

@Composable
private fun Credit(name: String, url: String, text: String) {
    val accent = theme.accent
    val muted = theme.textMuted
    Text(
        buildAnnotatedString {
            withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = accent)))) { append(name) }
            withStyle(SpanStyle(color = muted)) { append(" $text") }
        },
        style = wizardFont(WZ.FontSize.sm),
    )
}
