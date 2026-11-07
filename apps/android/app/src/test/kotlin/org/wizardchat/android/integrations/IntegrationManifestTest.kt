package org.wizardchat.android.integrations

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The manifest validator and the permission rules, against the web app's own fixtures (`integrationManifestFixtures.ts`) */
class IntegrationManifestTest {
    private fun result(v: kotlinx.serialization.json.JsonElement) = IntegrationManifest.validate(v)

    /** Valid, with every entry usable (an unusable entry is set aside, not an error of the file) */
    private fun usable(v: kotlinx.serialization.json.JsonElement): Boolean {
        val r = result(v)
        return r is ValidationResult.Valid && r.value.rejected.isEmpty()
    }

    @Test fun goodManifestsAreValidAndEveryEntryIsUsable() {
        val good = manifestFixtures["good"]!!.jsonObject
        assertEquals(25, good.size)
        val failed = good.filter { !usable(it.value) }.keys
        assertTrue("good manifests refused: $failed", failed.isEmpty())
    }

    @Test fun badManifestsAreRefusedOrSetAside() {
        val bad = manifestFixtures["bad"]!!.jsonObject
        assertEquals(178, bad.size)
        val accepted = bad.filter { usable(it.value) }.keys
        assertTrue("bad manifests accepted: $accepted", accepted.isEmpty())
    }

    @Test fun widgetsAreSetAsideAsUnsupportedNeverAnErrorOfTheFile() {
        val widgets = manifestFixtures["widgets"]!!.jsonObject
        val failed = widgets.filter { (_, v) ->
            val r = result(v)
            !(r is ValidationResult.Valid && r.value.integrations.isEmpty() && r.value.rejected.firstOrNull()?.reason == RejectedIntegration.UNSUPPORTED)
        }.keys
        assertTrue("widget manifests not set aside: $failed", failed.isEmpty())
    }

    @Test fun oversizeAndNotJsonAreRefused() {
        val oversize = """{"schema":1,"key":"$KEY","serial":1,"name":"${"x".repeat(MAX_MANIFEST_BYTES)}","integrations":[]}"""
        assertTrue(IntegrationManifest.parseText(oversize) is ValidationResult.Invalid)
        assertTrue(IntegrationManifest.parseText("{not json") is ValidationResult.Invalid)
        assertTrue(IntegrationManifest.parseText(repoOf().toString()) is ValidationResult.Valid)
    }

    @Test fun repositoryAddresses() {
        val urls = listOf(
            "https://example.com/repo.json" to true,
            "https://github.com/o/r" to true,
            "https://github.com/o/r/tree/main" to true,
            "http://example.com/repo.json" to false,
            "https://user:pw@example.com/repo.json" to false,
            "https://192.168.1.2/repo.json" to false,
            // Local hosts, ports and IP addresses are never accepted
            "https://localhost/repo.json" to false,
            "https://example.com:8443/repo.json" to false,
            "https://[::1]/repo.json" to false,
            "ftp://example.com/x" to false,
        )
        val failed = urls.filter { (u, expected) -> (IntegrationRepository.parseRepoUrl(u) is IntegrationRepository.UrlResult.Ok) != expected }
        assertTrue("addresses: $failed", failed.isEmpty())
        val github = IntegrationRepository.parseRepoUrl("https://github.com/o/r/tree/feature/x") as IntegrationRepository.UrlResult.Ok
        assertEquals("https://raw.githubusercontent.com/o/r/feature/x/repo.json", github.url)
        assertEquals("raw.githubusercontent.com", IntegrationRepository.repoHost("https://github.com/o/r"))
    }

    @Test fun onlyAnEntryThatCannotBeUsedIsSetAside() {
        val setting0 = json("""{"id":"showStars","label":"Show stars","type":"toggle","default":true}""").jsonObject
        val mixed = result(
            repoOf(
                baseIntegration,
                baseIntegration.with("id" to str("newer"), "name" to str("Newer"), "permissions" to json("""{"teleport":[]}""")),
                baseIntegration.with("id" to str("broken"), "name" to str("Broken"), "version" to JsonPrimitive(1)),
                baseIntegration.with("id" to str("newtype"), "settings" to json("[${setting0.with("type" to str("slider"))}]")),
                baseIntegration.with("name" to str("Second AlterSend")),
                str("not an object"),
            ),
        ) as ValidationResult.Valid
        val integrations = mixed.value.integrations
        val rejected = mixed.value.rejected
        fun reason(id: String) = rejected.firstOrNull { it.id == id }?.reason
        val c = Checks()
        c.check("firstKept", integrations.size == 1 && integrations[0].name == "AlterSend")
        c.check("count", rejected.size == 5)
        c.check("unknownCapability", reason("newer") == RejectedIntegration.UNSUPPORTED)
        c.check("unknownSettingType", reason("newtype") == RejectedIntegration.UNSUPPORTED)
        c.check("invalid", reason("broken") == RejectedIntegration.INVALID)
        c.check("duplicate", rejected.firstOrNull { it.index == 4 }?.error?.contains("duplicate") == true)
        val notObject = rejected.firstOrNull { it.index == 5 }
        c.check("notObject", notObject != null && notObject.id == null && notObject.name == null)
        // The repository itself is still all or nothing
        c.check("repoKey", result((repoOf(baseIntegration) as JsonObject).with("extra" to JsonPrimitive(1))) is ValidationResult.Invalid)
        // An empty settings list is dropped, so the stored shape is canonical
        val empty = result(manifestFixtures["good"]!!.jsonObject["settingsEmptyList"]!!) as ValidationResult.Valid
        c.check("emptySettings", empty.value.integrations[0].settings == null)
        c.done()
    }

    @Test fun localApiHostsPortsAndAddressesAreNeverValid() {
        listOf("localhost", "localhost:8080", "127.0.0.1:3000", "localhost:99999", "api.example.com:8443").forEach { host ->
            val perms = """{"api":{"host":"$host","actions":[{"id":"push","label":"Send","path":"/v1/push"}]}}"""
            assertTrue("api host $host", !usable(repoOf(baseIntegration.with("permissions" to json(perms)))))
        }
    }

    @Test fun linkMatchingFollowsExactHostPathAndGrant() {
        val p = manifestWith("""{"linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}]}""").integrations[0].permissions
        val installed = listOf(InstalledIntegration("altersend", "x", "AlterSend", "", "1", p, enabled = true))
        val on = mapOf("altersend" to mapOf("linkCards" to true))
        val c = Checks()
        c.check("hit", IntegrationMatching.matchLinkCard("https://altersend.example/pay/1", installed, on) != null)
        c.check("path", IntegrationMatching.matchLinkCard("https://altersend.example/other", installed, on) == null)
        c.check("http", IntegrationMatching.matchLinkCard("http://altersend.example/pay", installed, on) == null)
        c.check("subdomain", IntegrationMatching.matchLinkCard("https://evil.altersend.example/pay", installed, on) == null)
        c.check("revoked", IntegrationMatching.matchLinkCard("https://altersend.example/pay", installed, mapOf("altersend" to mapOf("linkCards" to false))) == null)
        c.check("disabled", IntegrationMatching.matchLinkCard("https://altersend.example/pay", listOf(installed[0].copy(enabled = false)), on) == null)
        c.done()
    }

    @Test fun widening() {
        val p = manifestWith("""{"linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}],"composerActions":[{"id":"send","label":"Send","icon":"send","insert":"https://altersend.example/s?room={room}"}]}""")
            .integrations[0].permissions
        val widerHost = p.copy(linkCards = listOf(p.linkCards!![0].copy(hosts = listOf("altersend.example", "b.example"))))
        val c = Checks()
        c.check("same", !IntegrationPermissions.widened(p, p))
        c.check("newCapability", IntegrationPermissions.widened(Permissions(), p))
        c.check("newHost", IntegrationPermissions.widened(p, widerHost))
        c.check("narrower", !IntegrationPermissions.widened(p, Permissions(linkCards = p.linkCards)))
        c.done()
    }

    private val details = """{"id":"repo","path":"/repos/{owner}/{repo}","title":"full_name","description":"description","facts":[{"label":"Stars","field":"stargazers_count","format":"count"},{"label":"Owner","field":"owner.login"}]}"""
    private val patternCard = """{"hosts":["github.com"],"pathPattern":"/{owner}/{repo}","title":"{owner}/{repo}","subtitle":"GitHub","details":"repo"}"""

    @Test fun linkDetailsPermissionsWidenOnAnyChange() {
        val p = manifestWith("""{"linkCards":[$patternCard],"linkDetails":{"host":"api.github.com","lookups":[$details]}}""").integrations[0].permissions
        val d = p.linkDetails!!
        val l0 = d.lookups[0]
        val r0 = p.linkCards!![0]
        fun widened(n: Permissions) = IntegrationPermissions.widened(p, n)
        fun withLookup(l: LinkLookup) = p.copy(linkDetails = d.copy(lookups = listOf(l)))
        val c = Checks()
        c.check("has", p.has(Capability.linkDetails) && !Permissions().has(Capability.linkDetails))
        c.check("widenedSame", !widened(p))
        c.check("widenedNew", IntegrationPermissions.widened(Permissions(linkCards = p.linkCards), p))
        c.check("widenedHost", widened(p.copy(linkDetails = d.copy(host = "evil.example.com"))))
        c.check("widenedPath", widened(withLookup(l0.copy(path = "/users/{owner}"))))
        c.check("widenedField", widened(withLookup(l0.copy(description = "owner.email"))))
        c.check("widenedFact", widened(withLookup(l0.copy(facts = l0.facts!! + LinkFact("X", "x")))))
        c.check("widenedPattern", widened(p.copy(linkCards = listOf(r0.copy(pathPattern = "/{owner}/{repo}/{x}")))))
        c.check("widenedRuleLookup", widened(p.copy(linkCards = listOf(r0.copy(details = "other")))))
        c.check("removalIsNarrowing", !widened(p.copy(linkDetails = null, linkCards = listOf(r0.copy(details = null)))))
        c.done()
    }

    private val apiPerms = """{"api":{"host":"api.example.com","actions":[{"id":"push","label":"Send to Example","path":"/v1/push","body":{"room":"{room}","text":"{text}"},"insertResultLink":"url"}]},
        "linkCards":[{"hosts":["api.example.com"],"title":"T"}],
        "commands":[{"name":"send","description":"Send a note","usage":"/send <note>","insert":"https://x.example/s?room={room}&q={args}"},
        {"name":"push","description":"Send a note","api":"push"},
        {"name":"kick","description":"Send a note","insert":"https://x.example/s?room={room}&q={args}"}]}"""

    private fun installedOf(id: String, p: Permissions, enabled: Boolean = true) = InstalledIntegration(id, "x", id, "", "1", p, enabled = enabled)

    @Test fun apiAndCommandWidening() {
        val full = manifestWith(apiPerms).integrations[0].permissions
        val p = full.copy(commands = full.commands!!.take(2))
        val a0 = p.api!!.actions[0]
        val cmds = p.commands!!
        fun withActions(actions: List<ApiAction>) = p.copy(api = p.api!!.copy(actions = actions))
        fun widened(n: Permissions) = IntegrationPermissions.widened(p, n)
        val c = Checks()
        c.check("api:widenedSame", !widened(p))
        c.check("api:widenedNew", IntegrationPermissions.widened(p.copy(api = null), p))
        c.check("api:widenedHost", widened(p.copy(api = p.api!!.copy(host = "other.example.com"))))
        c.check("api:widenedAction", widened(withActions(p.api!!.actions + a0.copy(id = "two"))))
        c.check("api:widenedPath", widened(withActions(listOf(a0.copy(path = "/v2/push")))))
        c.check("api:widenedBody", widened(withActions(listOf(a0.copy(body = mapOf("room" to "{room}"))))))
        c.check("api:widenedBodyDropped", widened(withActions(listOf(a0.copy(body = null)))))
        c.check("api:widenedLinkField", widened(withActions(listOf(a0.copy(insertResultLink = "link")))))
        c.check("api:widenedLabel", widened(withActions(listOf(a0.copy(label = "Other")))))
        c.check("api:widenedKeyOrder", !widened(withActions(listOf(a0.copy(body = mapOf("text" to "{text}", "room" to "{room}"))))))
        c.check("api:removalIsNarrowing", !widened(p.copy(api = null)))
        c.check("commands:widenedNew", widened(p.copy(commands = cmds + SlashCommand("more", "m", insert = "x"))))
        c.check("commands:widenedDescription", widened(p.copy(commands = listOf(cmds[0].copy(description = "Changed")) + cmds.drop(1))))
        c.check("commands:widenedInsert", widened(p.copy(commands = listOf(cmds[0].copy(insert = "https://evil.example/{args}")) + cmds.drop(1))))
        c.check("commands:widenedUsage", widened(p.copy(commands = listOf(cmds[0].copy(usage = "/send changed")) + cmds.drop(1))))
        c.check("commands:widenedApiTarget", widened(p.copy(commands = listOf(cmds[0], cmds[1].copy(api = "other")))))
        c.check("commands:removalIsNarrowing", !widened(p.copy(commands = cmds.take(1))))
        c.check("commands:widenedFromNone", IntegrationPermissions.widened(Permissions(linkCards = p.linkCards), p))
        c.done()
    }

    @Test fun activeActionsAndCommands() {
        val p = manifestWith(apiPerms).integrations[0].permissions
        val inst = listOf(installedOf("one", p))
        val all = mapOf("one" to mapOf("api" to true, "commands" to true))
        val c = Checks()
        val apiActions = IntegrationMatching.apiActions(inst, all)
        c.check("getApiActions:hit", apiActions.size == 1 && apiActions[0].host == "api.example.com")
        c.check("getApiActions:revoked", IntegrationMatching.apiActions(inst, mapOf("one" to mapOf("api" to false))).isEmpty())
        c.check("getApiActions:disabled", IntegrationMatching.apiActions(listOf(installedOf("one", p, false)), all).isEmpty())
        c.check("getApiActions:noGrant", IntegrationMatching.apiActions(inst, mapOf("one" to mapOf("commands" to true))).isEmpty())

        val reserved = setOf("kick", "ban")
        val found = IntegrationMatching.commands(inst, all, reserved)
        c.check("getCommands:reservedDropped", found.joinToString(",") { it.name } == "send,push")
        c.check("getCommands:kinds", found.joinToString(",") { if (it.isApi) "api" else "insert" } == "insert,api")
        c.check("getCommands:apiNeedsApiGrant", IntegrationMatching.commands(inst, mapOf("one" to mapOf("commands" to true)), reserved).joinToString(",") { it.name } == "send")
        c.check("getCommands:noGrant", IntegrationMatching.commands(inst, mapOf("one" to mapOf("api" to true)), reserved).isEmpty())
        val grants2 = all + ("two" to all["one"]!!)
        val dup = IntegrationMatching.commands(listOf(installedOf("one", p), installedOf("two", p)), grants2, reserved)
        c.check("getCommands:firstWins", dup.size == 2 && dup.all { it.integrationId == "one" })
        val skip = IntegrationMatching.commands(listOf(installedOf("one", p, false), installedOf("two", p)), grants2, reserved)
        c.check("getCommands:disabledDoesNotShadow", skip.size == 2 && skip.all { it.integrationId == "two" })

        val tpl = "https://x.example/s?room={room}&q={args}"
        c.check("render:basic", IntegrationMatching.renderInsert(tpl, "!a:b.c", "hi there") == "https://x.example/s?room=!a%3Ab.c&q=hi there")
        c.check("render:stripped", IntegrationMatching.renderInsert("{args}", "r", "a\nb‮c") == "abc")
        c.check("render:capped", IntegrationMatching.renderInsert("{args}", "r", "x".repeat(600)).length == 500)
        c.check("render:noReexpand", IntegrationMatching.renderInsert("{args}", "r", "{room}") == "{room}")
        c.done()
    }

    @Test fun apiPreviewIsExactlyWhatIsSent() {
        val p = manifestWith(apiPerms).integrations[0].permissions
        val a0 = p.api!!.actions[0]
        val ctx = IntegrationApi.Context("!r:x.org", "", "")
        val nasty = "say \"hi\"\nline2 \\ {room} {\"a\":1}"
        val prev = IntegrationApi.preview(p, a0, IntegrationApi.Context("!r:x.org", nasty, ""))
        val c = Checks()
        c.check("preview:ok", prev is IntegrationApi.Preview.Ok)
        if (prev is IntegrationApi.Preview.Ok) {
            val body = json(prev.body!!).jsonObject.mapValues { (it.value as JsonPrimitive).content }
            c.check("preview:roundTrip", body["text"] == nasty && body["room"] == "!r:x.org")
            c.check("preview:keys", body.size == 2)
            c.check("preview:rawNewline", !prev.body.contains('\n'))
            c.check("preview:url", prev.url == "https://api.example.com/v1/push" && prev.host == "api.example.com")
            c.check("preview:path", prev.path == "/v1/push")
        }
        c.check("preview:tooBig", IntegrationApi.preview(p, a0, IntegrationApi.Context("!r:x.org", "x".repeat(9000), "")) is IntegrationApi.Preview.Error)
        val nobody = IntegrationApi.preview(p, a0.copy(body = null), ctx)
        c.check("preview:noBody", nobody is IntegrationApi.Preview.Ok && nobody.body == null)
        c.check("preview:noApi", IntegrationApi.preview(Permissions(), a0, ctx) is IntegrationApi.Preview.Error)
        c.done()
    }
}
