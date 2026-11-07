package org.wizardchat.android.integrations

import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pure rules around updates, link matching, link details and settings, against the web app's `integrationBehaviourFixtures.ts` */
class IntegrationBehaviourTest {
    private fun card(hosts: List<String>, pathPrefix: String? = null) = LinkCardRule(hosts, pathPrefix = pathPrefix, title = "Card")

    private fun offered(version: String, permissions: Permissions, settings: List<IntegrationSetting>? = null) =
        Integration("one", "One", "Test integration", version, permissions = permissions, settings = settings)

    private fun installed(version: String, permissions: Permissions, settings: List<IntegrationSetting>? = null) = InstalledIntegration(
        id = "one", repoUrl = "https://repo.example.com/repo.json", name = "One", description = "Test integration", version = version,
        permissions = permissions, settings = settings, enabled = true, approvedAt = 0, publisherFingerprint = "aaaa",
    )

    private val linkCardsOnly: GrantMap = mapOf("one" to mapOf("linkCards" to true))

    @Test fun updatesAndLinkMatching() {
        val c = Checks()
        // Narrowing never needs a newer version string
        val wide = installed("1.0.0", Permissions(linkCards = listOf(card(listOf("a.example.com")), card(listOf("b.example.com")))))
        c.check("narrower update, same version, is taken",
            IntegrationUpdates.reconcile(wide, offered("1.0.0", Permissions(linkCards = listOf(card(listOf("a.example.com")))))).permissions.linkCards?.size == 1)
        c.check("narrower update, lower version, is taken",
            IntegrationUpdates.reconcile(wide, offered("0.9.0", Permissions(linkCards = listOf(card(listOf("a.example.com")))))).permissions.linkCards?.size == 1)

        // Widening waits for approval and leaves the approved permissions in force
        val narrow = installed("1.0.0", Permissions(linkCards = listOf(card(listOf("a.example.com")))))
        val both = Permissions(linkCards = listOf(card(listOf("a.example.com")), card(listOf("b.example.com"))))
        val widened = IntegrationUpdates.reconcile(narrow, offered("1.1.0", both))
        c.check("widening becomes a pending update", widened.pendingUpdate != null)
        c.check("widening keeps the approved permissions", widened.permissions == narrow.permissions)
        c.check("widening with the same version is still pending", IntegrationUpdates.reconcile(narrow, offered("1.0.0", both)).pendingUpdate != null)

        // Nothing changed: the very same object comes back (no needless writes)
        val plain = installed("1.0.0", Permissions(linkCards = listOf(card(listOf("a.example.com")))))
        c.check("unchanged keeps the same object", IntegrationUpdates.reconcile(plain, offered("1.0.0", Permissions(linkCards = listOf(card(listOf("a.example.com")))))) === plain)

        // Withdrawn by its repository: flagged, still installed, comes back when offered again
        val gone = IntegrationUpdates.reconcile(plain, null)
        c.check("withdrawn integration is flagged", gone.sourceGone)
        val back = IntegrationUpdates.reconcile(gone, offered("1.0.0", Permissions(linkCards = listOf(card(listOf("a.example.com"))))))
        c.check("a returning integration is not flagged", !back.sourceGone)

        // Link matching: exact host, default port, path boundary
        val withPath = listOf(installed("1.0.0", Permissions(linkCards = listOf(card(listOf("app.example.com"), "/s")))))
        fun match(url: String) = IntegrationMatching.matchLinkCard(url, withPath, linkCardsOnly) != null
        c.check("link: exact path", match("https://app.example.com/s"))
        c.check("link: below the prefix", match("https://app.example.com/s/abc"))
        c.check("link: not a longer segment", !match("https://app.example.com/sx"))
        c.check("link: not outside the prefix", !match("https://app.example.com/other"))
        c.check("link: not another port", !match("https://app.example.com:8443/s/abc"))
        c.check("link: not http", !match("http://app.example.com/s/abc"))
        c.check("link: not userinfo", !match("https://user:pw@app.example.com/s/abc"))
        c.check("link: not a look-alike host", !match("https://app.example.com.evil.example/s/abc"))
        val rootCard = listOf(installed("1.0.0", Permissions(linkCards = listOf(card(listOf("app.example.com"))))))
        c.check("link: no prefix covers the whole host", IntegrationMatching.matchLinkCard("https://app.example.com/anything", rootCard, linkCardsOnly) != null)
        c.done()
    }

    private val settingsDecl: List<IntegrationSetting> = listOf(
        IntegrationSetting.Toggle("showStars", "Show stars", default = true),
        IntegrationSetting.Toggle("showDescription", "Show description", default = false),
        IntegrationSetting.Text("prefix", "Prefix", default = "GH", maxLength = 10),
        IntegrationSetting.Choice("mode", "Mode", default = "short", options = listOf(ChoiceOption("short", "Short"), ChoiceOption("long", "Long"))),
    )

    private val defaults: SettingValues = mapOf("showStars" to true, "showDescription" to false, "prefix" to "GH", "mode" to "short")

    @Test fun settingsAreCheckedOnEveryRead() {
        val c = Checks()
        fun resolve(stored: String?) = IntegrationSettings.resolve(settingsDecl, stored?.let { json(it) })
        c.check("none stored", resolve(null) == defaults)
        c.check("not an object", resolve("[\"x\"]") == defaults)
        c.check("valid values kept", resolve("""{"showStars":false,"prefix":"x","mode":"long"}""") == defaults + mapOf("showStars" to false, "prefix" to "x", "mode" to "long"))
        c.check("tampered values fall back", resolve("""{"showStars":"yes","showDescription":1,"prefix":"xxxxxxxxxxx","mode":"evil","removed":"value"}""") == defaults)
        c.check("hidden characters refused", resolve("{\"prefix\":\"a\\u202eb\"}")["prefix"] == "GH")
        c.check("retyped setting degrades",
            IntegrationSettings.resolve(listOf(IntegrationSetting.Text("showStars", "Show stars", default = "", maxLength = 5)), json("""{"showStars":false}"""))["showStars"] == "")
        c.check("prototype key ignored", resolve("""{"__proto__":{"prefix":"evil"}}""")["prefix"] == "GH")
        c.check("none declared", IntegrationSettings.resolve(null, json("""{"a":1}""")).isEmpty())

        // Templates: one pass, values never expanded again, unknown names kept
        val vals = resolve("""{"prefix":"{owner}"}""")
        c.check("template: setting and capture", IntegrationSettings.render("{setting.prefix} {owner}", mapOf("owner" to "octo"), vals) == "{owner} octo")
        c.check("template: undeclared setting is empty", IntegrationSettings.render("[{setting.nope}]", emptyMap(), vals) == "[]")
        c.check("template: toggle is empty", IntegrationSettings.render("[{setting.showStars}]", emptyMap(), vals) == "[]")
        c.check("template: unknown name kept", IntegrationSettings.render("{zz}", emptyMap(), vals) == "{zz}")
        c.done()
    }

    private val ghLookup = LinkLookup(
        "repo", "/repos/{owner}/{repo}", title = "full_name", description = "description", descriptionIf = "showDescription",
        facts = listOf(LinkFact("Stars", "stargazers_count", "count", "showStars"), LinkFact("Owner", "owner.login")),
    )

    private val gh = installed(
        "1.0.0",
        Permissions(
            linkCards = listOf(
                LinkCardRule(
                    hosts = listOf("github.com"), pathPattern = "/{owner}/{repo}", pathExclude = listOf("/orgs", "/settings"),
                    title = "{setting.prefix} {owner}/{repo}", details = "repo",
                ),
            ),
            linkDetails = LinkDetailsPermission("api.github.com", listOf(ghLookup)),
            composerActions = listOf(ComposerAction("a", "A", insert = "{setting.prefix} {room}")),
            commands = listOf(SlashCommand("gh", "x", insert = "{setting.mode}: {args}")),
            api = ApiPermission("api.example.com", listOf(ApiAction("push", "Push", "/v1/push", body = mapOf("m" to "{setting.mode}")))),
        ),
        settingsDecl,
    )

    private val all: GrantMap = mapOf("one" to mapOf("linkCards" to true, "linkDetails" to true, "composerActions" to true, "commands" to true, "api" to true))
    private val stored: StoredSettings = mapOf("one" to json("""{"prefix":"Repo","mode":"long","showStars":false}"""))

    @Test fun settingsFeedCardsActionsCommandsAndApi() {
        val c = Checks()
        val m = IntegrationMatching.matchLinkCard("https://github.com/octo/hello", listOf(gh), all, stored)
        c.check("card: setting in title", m?.title == "Repo octo/hello")
        c.check("card: defaults without stored", IntegrationMatching.matchLinkCard("https://github.com/octo/hello", listOf(gh), all)?.title == "GH octo/hello")
        c.check("card: excluded path", IntegrationMatching.matchLinkCard("https://github.com/orgs/acme", listOf(gh), all) == null)
        c.check("card: excluded any case", IntegrationMatching.matchLinkCard("https://github.com/ORGS/acme", listOf(gh), all) == null)
        c.check("card: excluded deeper", IntegrationMatching.matchLinkCard("https://github.com/settings/keys", listOf(gh), all) == null)
        c.check("card: exclusion is whole segments", IntegrationMatching.matchLinkCard("https://github.com/orgsx/acme", listOf(gh), all) != null)
        c.check("card: other settings kept apart",
            IntegrationMatching.matchLinkCard("https://github.com/a/b", listOf(gh), all, mapOf("other" to json("""{"prefix":"X"}""")))?.title == "GH a/b")

        val action = IntegrationMatching.composerActions(listOf(gh), all, stored).firstOrNull()
        c.check("composer: setting filled", action != null && IntegrationMatching.renderInsert(action.action.insert, "!r:x", "", action.settings) == "Repo !r%3Ax")
        val command = IntegrationMatching.commands(listOf(gh), all, emptySet(), stored).firstOrNull()
        c.check("command: setting filled", command != null && IntegrationMatching.renderInsert(command.insert ?: "", "!r", "hi", command.settings) == "long: hi")
        val apiAction = IntegrationMatching.apiActions(listOf(gh), all, stored).firstOrNull()
        val preview = apiAction?.let { IntegrationApi.preview(gh.permissions, it.action, IntegrationApi.Context("!r", "", "", it.settings)) }
        c.check("api: choice setting in body", preview is IntegrationApi.Preview.Ok && preview.body == "{\"m\":\"long\"}")

        // Details: switched-off fields are not shown, and nothing is asked when nothing would show
        val answer = json("""{"full_name":"octo/hello","description":"Hi","stargazers_count":5,"owner":{"login":"octo"}}""")
        fun shownBy(st: String) = IntegrationDetails.extract(answer, ghLookup, Locale.ENGLISH, IntegrationSettings.resolve(settingsDecl, json(st)), ZoneId.of("UTC"))
        c.check("details: defaults", shownBy("{}").facts.map { it.label } == listOf("Stars", "Owner") && shownBy("{}").description == null)
        c.check("details: fact off", shownBy("""{"showStars":false}""").facts.none { it.label == "Stars" })
        c.check("details: description on", shownBy("""{"showDescription":true}""").description == "Hi")
        val onlyToggled = LinkLookup("x", "/x/{a}", facts = listOf(LinkFact("S", "s", ifToggle = "showStars")))
        c.check("details: asks when shown", IntegrationSettings.lookupShowsAnything(onlyToggled, IntegrationSettings.resolve(settingsDecl, json("{}"))))
        c.check("details: no request when all off", !IntegrationSettings.lookupShowsAnything(onlyToggled, IntegrationSettings.resolve(settingsDecl, json("""{"showStars":false}"""))))
        c.done()
    }

    @Test fun settingsTravelWithTheirPermissions() {
        val c = Checks()
        val prefix = settingsDecl[2] as IntegrationSetting.Text
        val mode = settingsDecl[3] as IntegrationSetting.Choice
        c.check("widened: same", !IntegrationSettings.widened(settingsDecl, settingsDecl))
        c.check("widened: none to some", !IntegrationSettings.widened(null, settingsDecl))
        c.check("widened: removed", !IntegrationSettings.widened(settingsDecl, settingsDecl.drop(1)))
        c.check("widened: relabelled", !IntegrationSettings.widened(settingsDecl, listOf((settingsDecl[0] as IntegrationSetting.Toggle).copy(label = "Stars"))))
        c.check("widened: new default", IntegrationSettings.widened(settingsDecl, listOf(prefix.copy(default = "X"))))
        c.check("widened: retyped",
            IntegrationSettings.widened(settingsDecl, listOf(IntegrationSetting.Choice("prefix", "Prefix", default = "a", options = listOf(ChoiceOption("a", "A"), ChoiceOption("b", "B"))))))
        c.check("widened: new choice value", IntegrationSettings.widened(settingsDecl, listOf(mode.copy(options = mode.options + ChoiceOption("evil", "E")))))
        c.check("widened: choice value removed", !IntegrationSettings.widened(settingsDecl, listOf(mode.copy(options = listOf(mode.options[0])))))

        val plain = installed("1.0.0", Permissions(), settingsDecl)
        c.check("reconcile: unchanged settings", IntegrationUpdates.reconcile(plain, offered("1.0.0", Permissions(), settingsDecl)) === plain)
        val relabelled = IntegrationUpdates.reconcile(plain, offered("1.0.0", Permissions(), listOf((settingsDecl[0] as IntegrationSetting.Toggle).copy(label = "Stars"))))
        c.check("reconcile: narrower settings taken", relabelled.pendingUpdate == null && relabelled.settings?.get(0)?.label == "Stars")
        val dropped = IntegrationUpdates.reconcile(plain, offered("1.0.0", Permissions(), null))
        c.check("reconcile: settings removed", dropped.settings == null && dropped.pendingUpdate == null)
        val newDefault = IntegrationUpdates.reconcile(plain, offered("1.0.0", Permissions(), listOf(prefix.copy(default = "X"))))
        c.check("reconcile: changed default waits", newDefault.settings === plain.settings && newDefault.pendingUpdate?.settings == listOf(prefix.copy(default = "X")))

        // An entry this app can not use keeps the installed version as it is
        val blocked = IntegrationUpdates.reconcile(plain, null, RejectedIntegration(0, "one", error = "x: unknown key", reason = RejectedIntegration.UNSUPPORTED))
        c.check("reconcile: rejected entry blocks, keeps working", blocked.blockedUpdate?.reason == RejectedIntegration.UNSUPPORTED && !blocked.sourceGone && blocked.permissions === plain.permissions)
        c.check("reconcile: valid again clears the block", IntegrationUpdates.reconcile(blocked, offered("1.0.0", Permissions(), settingsDecl)).blockedUpdate == null)
        c.done()
    }

    @Test fun versionsCompareNumerically() {
        assertTrue(IntegrationUpdates.compareVersions("1.10.0", "1.9.0") > 0)
        assertTrue(IntegrationUpdates.compareVersions("v1.0", "1.0.0") == 0)
        assertTrue(IntegrationUpdates.compareVersions("1.0.0", "1.0.1") < 0)
        assertTrue(IntegrationUpdates.compareVersions("2.0.0-beta", "2.0.0-alpha") > 0)
    }

    @Test fun pathPatternsAndLookupUrls() {
        val c = Checks()
        val pat = "/{owner}/{repo}"
        fun cap(path: String) = IntegrationMatching.matchPathPattern(path, pat)
        c.check("pattern: basic", cap("/octo/hello") == mapOf("owner" to "octo", "repo" to "hello"))
        c.check("pattern: deeper path", cap("/octo/hello/tree/main/src") == mapOf("owner" to "octo", "repo" to "hello"))
        c.check("pattern: trailing slash", cap("/octo/hello/") == mapOf("owner" to "octo", "repo" to "hello"))
        c.check("pattern: decoded", cap("/octo/h%C3%A9llo") == mapOf("owner" to "octo", "repo" to "héllo"))
        c.check("pattern: too short", cap("/octo") == null)
        c.check("pattern: empty segment", cap("//hello") == null)
        c.check("pattern: dot-dot", cap("/octo/%2E%2E") == null)
        c.check("pattern: bad escape", cap("/octo/%E0%A4") == null)
        c.check("pattern: bidi refused", cap("/octo/a%E2%80%AEb") == null)
        c.check("pattern: too long", cap("/octo/" + "a".repeat(101)) == null)
        c.check("pattern: literal", IntegrationMatching.matchPathPattern("/u/x/v1", "/u/{n}/v1") != null)
        c.check("pattern: literal mismatch", IntegrationMatching.matchPathPattern("/u/x/v2", "/u/{n}/v1") == null)
        c.check("pattern: literal case", IntegrationMatching.matchPathPattern("/U/x", "/u/{n}") == null)
        c.check("fill: no re-expansion", IntegrationMatching.fillCaptures("{a}/{b}", mapOf("a" to "{b}", "b" to "x")) == "{b}/x")
        c.check("fill: unknown kept", IntegrationMatching.fillCaptures("{z}", mapOf("a" to "1")) == "{z}")

        val lookup = LinkLookup(
            "repo", "/repos/{owner}/{repo}", title = "full_name", description = "description",
            facts = listOf(
                LinkFact("Stars", "stargazers_count", "count"), LinkFact("Language", "language"),
                LinkFact("Owner", "owner.login"), LinkFact("Updated", "pushed_at", "date"),
            ),
        )
        val ghCard = installed(
            "1.0.0",
            Permissions(
                linkCards = listOf(LinkCardRule(hosts = listOf("github.com"), pathPattern = pat, title = "{owner}/{repo}", subtitle = "GitHub", details = "repo")),
                linkDetails = LinkDetailsPermission("api.github.com", listOf(lookup)),
            ),
        )
        val bothGrants: GrantMap = mapOf("one" to mapOf("linkCards" to true, "linkDetails" to true))
        val m = IntegrationMatching.matchLinkCard("https://github.com/octo/hello/issues", listOf(ghCard), bothGrants)
        c.check("card: captures", m?.captures?.get("owner") == "octo" && m.captures["repo"] == "hello")
        c.check("card: title filled", m?.title == "octo/hello" && m.subtitle == "GitHub")
        c.check("card: pattern must fit", IntegrationMatching.matchLinkCard("https://github.com/octo", listOf(ghCard), bothGrants) == null)
        c.check("card: lookup with grant", m != null && IntegrationMatching.findLinkLookup(m, listOf(ghCard), bothGrants)?.host == "api.github.com")
        c.check("card: no lookup without the grant", m != null && IntegrationMatching.findLinkLookup(m, listOf(ghCard), mapOf("one" to mapOf("linkCards" to true, "linkDetails" to false))) == null)
        c.check("card: no lookup when disabled", m != null && IntegrationMatching.findLinkLookup(m, listOf(ghCard.copy(enabled = false)), bothGrants) == null)

        fun url(captures: Map<String, String>, l: LinkLookup = lookup) = IntegrationDetails.buildLookupUrl("api.github.com", l, captures).let { if (it is IntegrationDetails.LookupUrl.Ok) it.url else "error:" + (it as IntegrationDetails.LookupUrl.Error).error }
        c.check("url: basic", url(mapOf("owner" to "octo", "repo" to "next.js")) == "https://api.github.com/repos/octo/next.js")
        c.check("url: encoded", url(mapOf("owner" to "a/b", "repo" to "c?d#e")) == "https://api.github.com/repos/a%2Fb/c%3Fd%23e")
        c.check("url: dot-dot refused", url(mapOf("owner" to "..", "repo" to "x")).startsWith("error:"))
        c.check("url: missing capture", url(mapOf("owner" to "x")).startsWith("error:"))
        c.check("url: joined dots refused", url(mapOf("a" to ".", "b" to "."), lookup.copy(path = "/x/{a}{b}")).startsWith("error:"))

        val answer = json(
            "{\"full_name\":\"octo/hello\",\"description\":\"Line one\\nline  two \\u202e evil\",\"stargazers_count\":12345," +
                "\"language\":null,\"owner\":{\"login\":\"octo\"},\"pushed_at\":\"2026-03-04T10:00:00Z\",\"__proto__\":{\"x\":1}}",
        )
        val en = Locale.ENGLISH
        val utc = ZoneId.of("UTC")
        val d = IntegrationDetails.extract(answer, lookup, en, IntegrationSettings.NONE, utc)
        c.check("extract: title", d.title == "octo/hello")
        c.check("extract: description cleaned", d.description == "Line one line two evil")
        c.check("extract: count", d.facts.firstOrNull { it.label == "Stars" }?.value == "12.3K")
        c.check("extract: null left out", d.facts.none { it.label == "Language" })
        c.check("extract: nested", d.facts.firstOrNull { it.label == "Owner" }?.value == "octo")
        c.check("extract: date", d.facts.firstOrNull { it.label == "Updated" }?.value == "Mar 4, 2026")
        c.check("extract: not an object", IntegrationDetails.extract(json("[1,2]"), lookup, en).facts.isEmpty())
        c.check("extract: wrong types", IntegrationDetails.extract(json("""{"full_name":5,"stargazers_count":"many"}"""), lookup, en).title == null)
        c.check("extract: long text capped", (IntegrationDetails.extract(json("""{"description":"${"x".repeat(1000)}"}"""), lookup, en).description ?: "").length == 300)
        c.check("format: object is not text", IntegrationDetails.formatValue(json("""{"a":1}"""), "text", en) == "")
        c.check("format: bad date", IntegrationDetails.formatValue(JsonPrimitive("yesterday"), "date", en) == "")
        c.check("format: counts", listOf(5.0, 999.0, 1000.0, 1500.0, 999999.0, 2.5e9).map { IntegrationDetails.formatValue(JsonPrimitive(it), "count", en) } == listOf("5", "999", "1K", "1.5K", "1M", "2.5B"))
        c.done()
    }

    // ---------- the details loader's request discipline ----------

    private val loaderLookup = LinkLookup("repo", "/repos/{owner}/{repo}", title = "full_name")
    private val caps = mapOf("owner" to "octo", "repo" to "hello")

    private class Script(private val answers: List<(IntegrationNetwork.WireRequest) -> IntegrationNetwork.WireResponse>) {
        val calls = mutableListOf<IntegrationNetwork.WireRequest>()
        val transport = IntegrationNetwork.Transport { req ->
            calls += req
            answers[minOf(calls.size - 1, answers.size - 1)](req)
        }
    }

    private fun ok(body: String, vararg headers: Pair<String, String>) = { _: IntegrationNetwork.WireRequest ->
        IntegrationNetwork.WireResponse(200, mapOf("content-type" to "application/json") + headers, body.byteInputStream())
    }

    private fun status(code: Int) = { _: IntegrationNetwork.WireRequest -> IntegrationNetwork.WireResponse(code, emptyMap(), null) }

    @Test fun lookupsAreCachedDedupedAndBudgeted() = runBlocking {
        var clock = 1_000_000L
        val script = Script(listOf(ok("""{"full_name":"octo/hello"}""", "etag" to "\"v1\"")))
        val loader = LinkDetailsLoader(script.transport) { clock }
        val allow = listOf("api.github.com")
        val first = loader.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH)
        assertEquals("octo/hello", (first as LinkDetailsLoader.Result.Ok).details.title)
        loader.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH)
        assertEquals("a fresh answer is not asked for again", 1, script.calls.size)
        assertEquals("https://api.github.com/repos/octo/hello", script.calls[0].url)
        assertEquals(setOf("Accept"), script.calls[0].headers.keys)

        // Stale: asked again with the entity tag, and a 304 keeps the answer
        clock += 16 * 60 * 1000
        val script2 = Script(listOf(status(304)))
        val loader2 = LinkDetailsLoader(script2.transport) { clock }
        // (a loader that never saw the first answer has nothing to confirm)
        assertTrue(loader2.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH) is LinkDetailsLoader.Result.Error)
        val third = loader.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH)
        assertTrue(third is LinkDetailsLoader.Result.Ok)
        assertEquals(2, script.calls.size)
        assertEquals("\"v1\"", script.calls[1].headers["If-None-Match"])
    }

    @Test fun aRateLimitBacksOffAndAHostBudgetIsKept() = runBlocking {
        var clock = 1_000_000L
        val limited = Script(listOf(status(429)))
        val loader = LinkDetailsLoader(limited.transport) { clock }
        val allow = listOf("api.github.com")
        val r = loader.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH)
        assertTrue(r is LinkDetailsLoader.Result.Error)
        val other = loader.load("api.github.com", loaderLookup, mapOf("owner" to "a", "repo" to "b"), allow, Locale.ENGLISH)
        assertTrue("backed off after a 429", (other as LinkDetailsLoader.Result.Error).error.contains("slow down"))
        assertEquals(1, limited.calls.size)

        val answering = Script(listOf(ok("""{"full_name":"x"}""")))
        val budgeted = LinkDetailsLoader(answering.transport) { clock }
        repeat(30) { i -> budgeted.load("api.github.com", loaderLookup, mapOf("owner" to "o$i", "repo" to "r"), allow, Locale.ENGLISH) }
        val spent = budgeted.load("api.github.com", loaderLookup, mapOf("owner" to "extra", "repo" to "r"), allow, Locale.ENGLISH)
        assertTrue((spent as LinkDetailsLoader.Result.Error).error.contains("Too many lookups"))
        assertEquals(30, answering.calls.size)
        clock += 11 * 60 * 1000
        assertTrue(budgeted.load("api.github.com", loaderLookup, mapOf("owner" to "extra", "repo" to "r"), allow, Locale.ENGLISH) is LinkDetailsLoader.Result.Ok)
    }

    @Test fun streamerModePausesLookupsNobodyAskedFor() = runBlocking {
        val script = Script(listOf(ok("""{"full_name":"x"}""")))
        val loader = LinkDetailsLoader(script.transport)
        val allow = listOf("api.github.com")
        IntegrationNetwork.setPassiveBlocker { true }
        try {
            val passive = loader.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH, passive = true)
            assertTrue((passive as LinkDetailsLoader.Result.Error).paused)
            assertEquals(0, script.calls.size)
            // The person pressing the card's button is not blocked
            assertTrue(loader.load("api.github.com", loaderLookup, caps, allow, Locale.ENGLISH, passive = false) is LinkDetailsLoader.Result.Ok)
        } finally {
            IntegrationNetwork.setPassiveBlocker(null)
        }
    }
}
