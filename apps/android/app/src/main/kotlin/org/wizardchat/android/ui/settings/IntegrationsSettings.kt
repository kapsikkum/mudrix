package org.wizardchat.android.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.integrations.ActionResult
import org.wizardchat.android.integrations.Capability
import org.wizardchat.android.integrations.Integration
import org.wizardchat.android.integrations.IntegrationPermissions
import org.wizardchat.android.integrations.IntegrationSetting
import org.wizardchat.android.integrations.IntegrationSettings
import org.wizardchat.android.integrations.IntegrationStore
import org.wizardchat.android.integrations.InstalledIntegration
import org.wizardchat.android.integrations.Permissions
import org.wizardchat.android.integrations.PreviewResult
import org.wizardchat.android.integrations.RejectedIntegration
import org.wizardchat.android.integrations.RepositoryPreview
import org.wizardchat.android.integrations.RepositoryRecord
import org.wizardchat.android.integrations.has
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.tokens.WZ

private fun capabilitiesOf(permissions: Permissions) = Capability.entries.filter { permissions.has(it) }

/** A fixed-width line of text: addresses, request lines and the text an action inserts */
@Composable
internal fun CodeText(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, style = wizardFont(WZ.FontSize.sm).copy(fontFamily = FontFamily.Monospace), color = theme.textPrimary)
}

@Composable
private fun Muted(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
}

@Composable
private fun IconTile(name: String) {
    Box(
        Modifier.size(WZ.SizeAvatar.md).background(theme.fill, RoundedCornerShape(WZ.Radius.md)),
        contentAlignment = Alignment.Center,
    ) {
        Text(name.trim().take(1).uppercase().ifEmpty { "?" }, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textMuted)
    }
}

private fun shortFingerprint(fingerprint: String) = fingerprint.split(" ").take(4).joinToString(" ")

/** Who published an integration. [full] shows the whole fingerprint, for the consent dialog. */
@Composable
private fun SourceNote(repo: String, official: Boolean, fingerprint: String?, full: Boolean = false) {
    if (official) {
        Muted(tr("settings.integrations.fromOfficial", repo))
    } else if (fingerprint != null) {
        if (full) {
            Muted(tr("settings.integrations.fromPublisherFull", repo))
            CodeText(fingerprint)
        } else {
            Muted(tr("settings.integrations.fromPublisher", repo, shortFingerprint(fingerprint)))
        }
    }
}

/** Plain-language description of one capability of a permission set */
@Composable
internal fun CapabilityDetail(capability: Capability, permissions: Permissions) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        Text(tr("settings.integrations.cap.${capability.name}.title"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
        when (capability) {
            Capability.linkCards -> permissions.linkCards.orEmpty().forEach { rule ->
                val extras = listOfNotNull(
                    rule.pathPrefix?.let { tr("settings.integrations.cap.linkCards.path", it) },
                    rule.pathPattern?.let { tr("settings.integrations.cap.linkCards.pattern", it) },
                    rule.pathExclude?.takeIf { it.isNotEmpty() }?.let { tr("settings.integrations.cap.linkCards.exclude", it.joinToString(", ")) },
                )
                Muted((listOf(tr("settings.integrations.cap.linkCards.rule", rule.hosts.joinToString(", "), rule.title)) + extras).joinToString(" "))
            }
            Capability.linkDetails -> permissions.linkDetails?.let { details ->
                Muted(tr("settings.integrations.cap.linkDetails.summary", details.host))
                details.lookups.forEach { l ->
                    val shown = listOfNotNull(
                        l.title?.let { tr("settings.integrations.cap.linkDetails.shownTitle") },
                        l.description?.let { tr("settings.integrations.cap.linkDetails.shownDescription") },
                    ) + l.facts.orEmpty().map { it.label }
                    CodeText("GET ${details.host}${l.path}")
                    Muted(tr("settings.integrations.cap.linkDetails.shows", shown.joinToString(", ")))
                }
            }
            Capability.composerActions -> permissions.composerActions.orEmpty().forEach { action ->
                Muted("${action.label}: ${tr("settings.integrations.cap.composerActions.inserts")}")
                CodeText(action.insert)
            }
            Capability.commands -> permissions.commands.orEmpty().forEach { cmd ->
                CodeText(cmd.usage ?: "/${cmd.name}")
                Muted(cmd.description)
                if (cmd.api != null) {
                    val label = permissions.api?.actions?.firstOrNull { it.id == cmd.api }?.label ?: cmd.api
                    Muted(tr("settings.integrations.cap.commands.runsApi", label))
                } else {
                    Muted(tr("settings.integrations.cap.commands.inserts"))
                    CodeText(cmd.insert.orEmpty())
                }
            }
            Capability.api -> permissions.api?.let { api ->
                Muted(tr("settings.integrations.cap.api.summary", api.host, api.actions.joinToString(", ") { it.label }))
                api.actions.forEach { a ->
                    CodeText("${a.label}: POST ${api.host}${a.path}")
                    Muted(
                        (if (a.body != null) tr("settings.integrations.cap.api.sends") else tr("settings.integrations.cap.api.sendsNothing")) +
                            (if (a.insertResultLink != null) " " + tr("settings.integrations.cap.api.link") else ""),
                    )
                    a.body?.let { CodeText(kotlinx.serialization.json.JsonObject(it.mapValues { (_, v) -> JsonPrimitive(v) }).toString()) }
                }
            }
        }
    }
}

/** The servers an integration may contact, shown before it is installed or updated: every other address is refused */
@Composable
internal fun HostList(permissions: Permissions) {
    val hosts = IntegrationPermissions.contactedHosts(permissions)
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        Text(tr("settings.integrations.hosts.title"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
        if (hosts.isEmpty()) {
            Muted(tr("settings.integrations.hosts.none"))
        } else {
            hosts.forEach { CodeText(it) }
            Muted(tr("settings.integrations.hosts.note"))
        }
    }
}

/** The settings an integration offers, by name, for the install and update dialogs */
@Composable
private fun SettingNames(settings: List<IntegrationSetting>?) {
    if (settings.isNullOrEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        Text(tr("settings.integrations.settings.offered"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
        Muted(settings.joinToString(", ") { it.label })
    }
}

@Composable
private fun rejectedText(r: RejectedIntegration): String =
    if (r.reason == RejectedIntegration.UNSUPPORTED) tr("settings.integrations.rejected.unsupported", r.error) else tr("settings.integrations.rejected.invalid", r.error)

/** The text of an alert, scrolling when it is long */
@Composable
private fun DialogBody(content: @Composable () -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) { content() }
}

@Composable
private fun ConsentDialog(integration: Integration, repo: RepositoryRecord, onInstall: () -> String?, onDismiss: () -> Unit) {
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(tr("settings.integrations.consent.title", integration.name), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            DialogBody {
                Muted(integration.description)
                SourceNote(repo.name, repo.official, repo.fingerprint, full = true)
                Text(tr("settings.integrations.consent.intro"), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                capabilitiesOf(integration.permissions).forEach { CapabilityDetail(it, integration.permissions) }
                HostList(integration.permissions)
                SettingNames(integration.settings)
                val permissions = integration.permissions
                Muted(
                    tr(
                        when {
                            permissions.api != null -> "settings.integrations.consent.safetyApi"
                            permissions.linkDetails != null -> "settings.integrations.consent.safetyDetails"
                            else -> "settings.integrations.consent.safety"
                        },
                    ),
                )
                error?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = onInstall()
                if (error == null) onDismiss()
            }) { Text(tr("settings.integrations.install"), color = theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg)) } },
    )
}

/** Step 2 of adding a repository: the person sees who signed it and accepts the key, which is then pinned */
@Composable
private fun TrustDialog(preview: RepositoryPreview, onTrust: () -> String?, onDismiss: () -> Unit) {
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(tr("settings.integrations.trust.title"), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            DialogBody {
                Text(preview.name, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary)
                CodeText(preview.url)
                Muted(tr("settings.integrations.release", preview.serial))
                if (preview.official) Text(tr("settings.integrations.official"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.success)
                if (preview.integrations.isNotEmpty()) {
                    Text(trPlural("settings.integrations.trust.lists", preview.integrations.size, preview.integrations.size), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    preview.integrations.forEach { Muted("${it.name} ${it.version}") }
                }
                if (preview.rejected.isNotEmpty()) {
                    Text(trPlural("settings.integrations.trust.rejected", preview.rejected.size, preview.rejected.size), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    preview.rejected.forEach { Muted("${it.name ?: it.id ?: tr("settings.integrations.rejected.unnamed")}: ${rejectedText(it)}") }
                }
                Text(tr("settings.integrations.trust.fingerprint"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
                CodeText(preview.fingerprint)
                Muted(tr("settings.integrations.trust.explain"))
                error?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = onTrust()
                if (error == null) onDismiss()
            }) { Text(tr("settings.integrations.trust.confirm"), color = theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg)) } },
    )
}

/** Errors about signatures and keys are security failures; the rest (network, parsing) are not */
private fun isSecurityError(error: String, keyChanged: Boolean): Boolean {
    if (keyChanged) return true
    if (error.startsWith("Could not load", ignoreCase = true)) return false
    return Regex("signature|signed|signing key|older than|cannot check|cannot be trusted|cannot compute the key", RegexOption.IGNORE_CASE).containsMatchIn(error)
}

/** Settings > Integrations: repositories, install and update approval, and what each installed integration may do */
@Composable
internal fun IntegrationsSettings(onBack: () -> Unit) {
    val store = IntegrationStore.get(LocalContext.current)
    val scope = rememberCoroutineScope()
    var consent by remember { mutableStateOf<Pair<Integration, RepositoryRecord>?>(null) }
    var preview by remember { mutableStateOf<RepositoryPreview?>(null) }
    var url by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var addError by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf<RepositoryRecord?>(null) }
    var uninstalling by remember { mutableStateOf<InstalledIntegration?>(null) }

    val repositories = store.repositories
    val installed = store.installed
    val installedIds = installed.map { it.id }.toSet()
    val unknownSource = tr("settings.integrations.unknownSource")
    val alreadyAdded = tr("settings.integrations.alreadyAdded")
    val repoName = { repoUrl: String -> repositories.firstOrNull { it.url == repoUrl }?.name ?: unknownSource }

    fun add() {
        if (adding) return
        adding = true
        addError = null
        scope.launch {
            when (val res = store.previewRepository(url)) {
                is PreviewResult.Error -> addError = res.error
                is PreviewResult.Ok -> if (res.preview.alreadyAdded) addError = alreadyAdded else preview = res.preview
            }
            adding = false
        }
    }

    SettingsPage(tr("settings.integrations.title"), onBack) {
        Text(tr("settings.integrations.intro"), Modifier.padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space4), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)

        SettingsSection(tr("settings.integrations.installed")) {
            if (installed.isEmpty()) {
                SettingsItem { Muted(tr("settings.integrations.installedEmpty")) }
            }
        }
        installed.forEach { item ->
            InstalledCard(store, item, repoName(item.repoUrl), onUninstall = { uninstalling = item })
        }

        SettingsSection(tr("settings.integrations.available")) {
            val offers = repositories.flatMap { repo -> repo.integrations.filter { it.id !in installedIds }.map { it to repo } }
            if (offers.isEmpty() && repositories.all { it.rejected.isNullOrEmpty() }) {
                SettingsItem { Muted(tr("settings.integrations.availableEmpty")) }
            }
            offers.forEachIndexed { index, (integration, repo) ->
                if (index > 0) SettingsDivider()
                SettingsItem {
                    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4), verticalAlignment = Alignment.CenterVertically) {
                        IconTile(integration.name)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                            Text(integration.name, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary)
                            Muted(tr("settings.integrations.versionSource", integration.version, repo.name))
                        }
                    }
                    Muted(integration.description)
                    LabelButton(tr("settings.integrations.install"), "plus", { consent = integration to repo }, primary = true)
                }
            }
            // Entries this app can not use are listed, with the reason, and can never be installed
            repositories.forEach { repo ->
                repo.rejected.orEmpty().filter { r -> installed.none { it.id == r.id } }.forEach { r ->
                    SettingsDivider()
                    SettingsItem {
                        Text(r.name ?: r.id ?: tr("settings.integrations.rejected.unnamed"), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textMuted)
                        Muted(rejectedText(r))
                        Muted(tr("settings.integrations.rejected.source", repo.name))
                    }
                }
            }
        }

        SettingsSection(tr("settings.integrations.repositories"), tr("settings.integrations.repositoriesNote")) {
            repositories.forEach { repo ->
                SettingsItem {
                    Text(repo.name, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary)
                    CodeText(repo.url)
                    Muted(trPlural("settings.integrations.integrationCount", repo.integrations.size, repo.integrations.size) + " · " + tr("settings.integrations.release", repo.serial))
                    if (repo.official) Text(tr("settings.integrations.official"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.success) else Muted(tr("settings.integrations.publisherKey") + ": " + shortFingerprint(repo.fingerprint) + "…")
                    if (repo.keyChanged) {
                        Text(tr("settings.integrations.keyChanged.title"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.error)
                        Muted(tr("settings.integrations.keyChanged.body"))
                    } else if (repo.error != null) {
                        val key = if (isSecurityError(repo.error, false)) "settings.integrations.securityError" else "settings.integrations.fetchError"
                        Text(tr(key, repo.error), style = wizardFont(WZ.FontSize.sm), color = theme.error)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        LabelButton(tr("settings.integrations.refresh"), "arrows-clockwise", {
                            refreshing = repo.url
                            scope.launch {
                                store.refreshRepository(repo.url)
                                refreshing = null
                            }
                        }, Modifier.weight(1f), enabled = refreshing != repo.url)
                        LabelButton(tr("settings.integrations.remove"), "trash", { removing = repo }, Modifier.weight(1f), color = theme.danger)
                    }
                }
                SettingsDivider()
            }
            SettingsItem {
                WizardTextField(url, { url = it; addError = null }, tr("settings.integrations.repoUrl"), keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri, onSubmit = ::add)
                LabelButton(tr("settings.integrations.add"), "plus", ::add, primary = true, enabled = url.isNotBlank() && !adding)
                addError?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
            }
        }
    }

    consent?.let { (integration, repo) ->
        ConsentDialog(
            integration, repo,
            onInstall = { (store.install(integration, repo.url, integration.permissions) as? ActionResult.Error)?.error },
            onDismiss = { consent = null },
        )
    }
    preview?.let { p ->
        TrustDialog(p, onTrust = { (store.confirmRepository(p) as? ActionResult.Error)?.error }, onDismiss = { preview = null; url = "" })
    }
    removing?.let { repo ->
        ConfirmDialog(repo.name, tr("settings.integrations.remove"), { store.removeRepository(repo.url) }, { removing = null })
    }
    uninstalling?.let { item ->
        ConfirmDialog(item.name, tr("settings.integrations.uninstall"), { store.uninstall(item.id) }, { uninstalling = null })
    }
}

@Composable
private fun InstalledCard(store: IntegrationStore, item: InstalledIntegration, repoName: String, onUninstall: () -> Unit) {
    var showSettings by remember { mutableStateOf(false) }
    val grants = store.grants[item.id].orEmpty()
    SettingsSection {
        SettingsItem {
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4), verticalAlignment = Alignment.CenterVertically) {
                IconTile(item.name)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                    Text(item.name, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary)
                    Muted(tr("settings.integrations.versionSource", item.version, repoName))
                    SourceNote(repoName, item.official, item.publisherFingerprint)
                }
            }
            Muted(item.description)
            if (item.sourceGone) Muted(tr("settings.integrations.sourceGone"))
            item.blockedUpdate?.let { blocked ->
                Muted(tr("settings.integrations.rejected.keepsWorking"))
                Muted(rejectedText(RejectedIntegration(0, error = blocked.error, reason = blocked.reason)))
            }
        }
        SettingsDivider()
        ToggleRow(tr("settings.integrations.enabled"), item.enabled, { store.setEnabled(item.id, it) })

        item.pendingUpdate?.let { update ->
            SettingsDivider()
            SettingsItem {
                Text(tr("settings.integrations.updateAvailableVersion", update.version), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.accent)
                Muted(tr("settings.integrations.updateRequests"))
                capabilitiesOf(update.permissions).forEach { CapabilityDetail(it, update.permissions) }
                HostList(update.permissions)
                SettingNames(update.settings)
                Muted(tr("settings.integrations.updateOldStays"))
                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    LabelButton(tr("settings.integrations.approveUpdate"), "check", { store.approveUpdate(item.id) }, Modifier.weight(1f), primary = true)
                    LabelButton(tr("settings.integrations.dismiss"), null, { store.dismissUpdate(item.id) }, Modifier.weight(1f))
                }
            }
        }

        SettingsDivider()
        val capabilities = capabilitiesOf(item.permissions)
        if (capabilities.isEmpty()) {
            SettingsItem { Muted(tr("settings.integrations.noPermissions")) }
        }
        capabilities.forEach { capability ->
            SettingsItem {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
                    Text(
                        tr("settings.integrations.allowCap", tr("settings.integrations.cap.${capability.name}.title")),
                        Modifier.weight(1f),
                        style = wizardFont(WZ.FontSize.lg),
                        color = theme.textPrimary,
                    )
                    WizardSwitch(grants[capability.name] == true, { store.setGrant(item.id, capability, it) })
                }
                CapabilityDetail(capability, item.permissions)
            }
            SettingsDivider()
        }

        if (!item.settings.isNullOrEmpty()) {
            RowFrame(onClick = { showSettings = !showSettings }) {
                Text(tr("settings.integrations.settings.title"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                PhIcon(if (showSettings) "caret-up" else "caret-down", size = WZ.SizeIcon.sm, tint = theme.textMuted)
            }
            if (showSettings) IntegrationSettingValues(store, item)
            SettingsDivider()
        }
        RowFrame(onClick = onUninstall) {
            PhIcon("trash", size = WZ.SizeIcon.md, tint = theme.danger)
            Text(tr("settings.integrations.uninstall"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg), color = theme.danger)
        }
    }
}

/** The integration's own settings. Values stay on this device. */
@Composable
private fun IntegrationSettingValues(store: IntegrationStore, item: InstalledIntegration) {
    val defs = item.settings.orEmpty()
    val values = IntegrationSettings.resolve(item.settings, store.settings[item.id])
    defs.forEach { def ->
        when (def) {
            is IntegrationSetting.Toggle -> ToggleRow(def.label, values[def.id] == true, { store.setSetting(item.id, def.id, JsonPrimitive(it)) }, note = def.description)
            is IntegrationSetting.Choice -> PickerRow(
                def.label, values[def.id] as? String ?: def.default, def.options.map { it.value to it.label },
                { store.setSetting(item.id, def.id, JsonPrimitive(it)) }, note = def.description,
            )
            is IntegrationSetting.Text -> TextSetting(store, item.id, def, values[def.id] as? String ?: def.default)
        }
        SettingsDivider()
    }
    SettingsItem {
        Muted(tr("settings.integrations.settings.note"))
        LabelButton(tr("settings.integrations.settings.reset"), null, { store.resetSettings(item.id) }, enabled = defs.any { values[it.id] != when (it) { is IntegrationSetting.Toggle -> it.default; is IntegrationSetting.Text -> it.default; is IntegrationSetting.Choice -> it.default } })
    }
}

@Composable
private fun TextSetting(store: IntegrationStore, id: String, def: IntegrationSetting.Text, value: String) {
    var draft by remember(value) { mutableStateOf(value) }
    val valid = IntegrationSettings.isValid(def, JsonPrimitive(draft))
    fun commit() {
        if (valid && draft != value) store.setSetting(id, def.id, JsonPrimitive(draft))
    }
    SettingsItem {
        RowLabel(def.label, def.description)
        WizardTextField(draft, { draft = it.take(def.maxLength) }, def.label, Modifier.onFocusChanged { if (!it.isFocused) commit() }, onSubmit = ::commit)
        if (!valid) Text(tr("settings.integrations.settings.invalidText"), style = wizardFont(WZ.FontSize.sm), color = theme.error)
    }
}
