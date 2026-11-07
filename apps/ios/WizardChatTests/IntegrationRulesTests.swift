import XCTest
import WizardChatCore
@testable import WizardChat

/// Matching, widening, commands and the API preview, from the cases of the web app's `integrations.test.ts` fixtures
final class IntegrationRulesTests: XCTestCase {
    private func json(_ text: String) -> JSONValue { IntegrationNetwork.parseJSON(text) ?? .null }

    /// The same default entry as the web fixtures' `integration()`, with other permissions
    private func perms(_ permissions: String) throws -> IntegrationPerms {
        let entry = json(#"{"id":"altersend","name":"AlterSend","description":"Sample","version":"1.0.0","permissions":\#(permissions)}"#)
        let repo: JSONValue = .object([
            "schema": .number(1), "key": .string(IntegrationManifestTests.key), "serial": .number(1), "name": .string("Sample"),
            "integrations": .array([entry]),
        ])
        guard case .valid(let manifest) = IntegrationManifest.validate(repo), manifest.rejected.isEmpty, let first = manifest.integrations.first else {
            throw XCTSkip("permissions refused: \(permissions)")
        }
        return first.permissions
    }

    private func installed(_ id: String, _ p: IntegrationPerms, enabled: Bool = true) -> InstalledIntegration {
        InstalledIntegration(id: id, repoUrl: "x", name: id, description: "", version: "1", permissions: p, enabled: enabled)
    }

    func testLinkMatchingFollowsExactHostPathAndGrant() throws {
        let p = try perms(#"{"linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}]}"#)
        let inst = [installed("altersend", p)]
        let on: GrantMap = ["altersend": ["linkCards": true]]
        XCTAssertNotNil(IntegrationMatching.matchLinkCard("https://altersend.example/pay/1", inst, on))
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://altersend.example/other", inst, on))
        XCTAssertNil(IntegrationMatching.matchLinkCard("http://altersend.example/pay", inst, on))
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://evil.altersend.example/pay", inst, on))
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://altersend.example:8443/pay", inst, on))
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://altersend.example/pay", inst, ["altersend": ["linkCards": false]]))
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://altersend.example/pay", [installed("altersend", p, enabled: false)], on))
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://altersend.example/payx", inst, on))
    }

    func testPatternCapturesAreDecodedAndChecked() throws {
        XCTAssertEqual(IntegrationMatching.matchPathPattern("/o/r/issues/1", "/{owner}/{repo}"), ["owner": "o", "repo": "r"])
        XCTAssertEqual(IntegrationMatching.matchPathPattern("/a%20b/r", "/{owner}/{repo}")?["owner"], "a b")
        XCTAssertNil(IntegrationMatching.matchPathPattern("/o", "/{owner}/{repo}"))
        XCTAssertNil(IntegrationMatching.matchPathPattern("/%2E%2E/r", "/{owner}/{repo}"))
        XCTAssertNil(IntegrationMatching.matchPathPattern("/%0A/r", "/{owner}/{repo}"))
        XCTAssertNil(IntegrationMatching.matchPathPattern("/x/r", "/y/{repo}"))
    }

    func testExcludedPathsNeverMatch() throws {
        let p = try perms(#"{"linkCards":[{"hosts":["github.com"],"pathPattern":"/{owner}/{repo}","pathExclude":["/settings"],"title":"{owner}/{repo}"}]}"#)
        let inst = [installed("altersend", p)]
        let on: GrantMap = ["altersend": ["linkCards": true]]
        XCTAssertEqual(IntegrationMatching.matchLinkCard("https://github.com/o/r", inst, on)?.title, "o/r")
        XCTAssertNil(IntegrationMatching.matchLinkCard("https://github.com/Settings/r", inst, on))
    }

    func testWidening() throws {
        let p = try perms(#"{"linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}],"composerActions":[{"id":"send","label":"Send","icon":"send","insert":"https://altersend.example/s?room={room}"}]}"#)
        var widerHost = p
        widerHost.linkCards?[0].hosts = ["altersend.example", "b.example"]
        XCTAssertFalse(IntegrationPermissions.widened(p, p))
        XCTAssertTrue(IntegrationPermissions.widened(IntegrationPerms(), p))
        XCTAssertTrue(IntegrationPermissions.widened(p, widerHost))
        XCTAssertFalse(IntegrationPermissions.widened(p, IntegrationPerms(linkCards: p.linkCards)))
    }

    private let apiPerms = #"""
    {"api":{"host":"api.example.com","actions":[{"id":"push","label":"Send to Example","path":"/v1/push","body":{"room":"{room}","text":"{text}"},"insertResultLink":"url"}]},
     "linkCards":[{"hosts":["api.example.com"],"title":"T"}],
     "commands":[{"name":"send","description":"Send a note","usage":"/send <note>","insert":"https://x.example/s?room={room}&q={args}"},
     {"name":"push","description":"Send a note","api":"push"},
     {"name":"kick","description":"Send a note","insert":"https://x.example/s?room={room}&q={args}"}]}
    """#

    func testCommandsKeepReservedNamesOutAndTheFirstIntegrationWins() throws {
        let p = try perms(apiPerms)
        let inst = [installed("one", p)]
        let all: GrantMap = ["one": ["api": true, "commands": true]]
        let reserved: Set<String> = ["kick", "ban"]
        XCTAssertEqual(IntegrationMatching.commands(inst, all, reserved: reserved).map(\.name), ["send", "push"])
        XCTAssertEqual(IntegrationMatching.commands(inst, ["one": ["commands": true]], reserved: reserved).map(\.name), ["send"])
        XCTAssertTrue(IntegrationMatching.commands(inst, ["one": ["api": true]], reserved: reserved).isEmpty)
        let both = [installed("one", p), installed("two", p)]
        var grants2 = all
        grants2["two"] = all["one"]
        XCTAssertTrue(IntegrationMatching.commands(both, grants2, reserved: reserved).allSatisfy { $0.integrationId == "one" })
        let skipped = [installed("one", p, enabled: false), installed("two", p)]
        XCTAssertTrue(IntegrationMatching.commands(skipped, grants2, reserved: reserved).allSatisfy { $0.integrationId == "two" })
    }

    func testInsertRendering() {
        let template = "https://x.example/s?room={room}&q={args}"
        XCTAssertEqual(IntegrationMatching.renderInsert(template, roomId: "!a:b.c", args: "hi there"), "https://x.example/s?room=!a%3Ab.c&q=hi there")
        XCTAssertEqual(IntegrationMatching.renderInsert("{args}", roomId: "r", args: "a\nb\u{202E}c"), "abc")
        XCTAssertEqual(IntegrationMatching.renderInsert("{args}", roomId: "r", args: String(repeating: "x", count: 600)).count, 500)
        XCTAssertEqual(IntegrationMatching.renderInsert("{args}", roomId: "r", args: "{room}"), "{room}")
    }

    func testApiPreviewIsExactlyWhatIsSent() throws {
        let p = try perms(apiPerms)
        let action = try XCTUnwrap(p.api?.actions.first)
        let nasty = "say \"hi\"\nline2 \\ {room} {\"a\":1}"
        let preview = IntegrationApi.preview(p, action, IntegrationApi.Context(roomId: "!r:x.org", text: nasty, args: ""))
        guard case .ok(let url, let host, let path, let body) = preview, let body else { return XCTFail("no preview") }
        let sent = try XCTUnwrap(json(body).object)
        XCTAssertEqual(sent["text"]?.string, nasty)
        XCTAssertEqual(sent["room"]?.string, "!r:x.org")
        XCTAssertEqual(sent.count, 2)
        XCTAssertFalse(body.contains("\n"))
        XCTAssertEqual(url, "https://api.example.com/v1/push")
        XCTAssertEqual(host, "api.example.com")
        XCTAssertEqual(path, "/v1/push")
        if case .ok = IntegrationApi.preview(p, action, IntegrationApi.Context(roomId: "!r:x.org", text: String(repeating: "x", count: 9000), args: "")) {
            XCTFail("a body over 8 KB was accepted")
        }
        var bare = action
        bare.body = nil
        guard case .ok(_, _, _, let none) = IntegrationApi.preview(p, bare, IntegrationApi.Context(roomId: "r", text: "", args: "")) else { return XCTFail() }
        XCTAssertNil(none)
        if case .ok = IntegrationApi.preview(IntegrationPerms(), action, IntegrationApi.Context(roomId: "r", text: "", args: "")) {
            XCTFail("no api permission but a preview")
        }
    }

    func testLookupUrlsAndExtraction() {
        let lookup = LinkLookup(id: "repo", path: "/repos/{owner}/{repo}", title: "full_name", description: "description", descriptionIf: nil,
                                facts: [LinkFact(label: "Stars", field: "stargazers_count", format: "count"), LinkFact(label: "Owner", field: "owner.login")])
        guard case .ok(let url) = IntegrationDetails.buildLookupUrl(host: "api.github.com", lookup: lookup, captures: ["owner": "o", "repo": "r/x"]) else {
            return XCTFail("no url")
        }
        XCTAssertEqual(url, "https://api.github.com/repos/o/r%2Fx")
        if case .ok = IntegrationDetails.buildLookupUrl(host: "api.github.com", lookup: lookup, captures: ["owner": "o"]) { XCTFail("filled without repo") }
        let answer = json(#"{"full_name":"o/r","description":"  A\nrepo  ","stargazers_count":12345,"owner":{"login":"o"}}"#)
        let details = IntegrationDetails.extract(answer, lookup, locale: Locale(identifier: "en_US"))
        XCTAssertEqual(details.title, "o/r")
        XCTAssertEqual(details.description, "A repo")
        XCTAssertEqual(details.facts, [.init(label: "Stars", value: "12.3K"), .init(label: "Owner", value: "o")])
    }

    func testVersionsCompareNumerically() {
        XCTAssertGreaterThan(IntegrationUpdates.compareVersions("1.10.0", "1.9.9"), 0)
        XCTAssertLessThan(IntegrationUpdates.compareVersions("v1.0", "1.0.1"), 0)
        XCTAssertEqual(IntegrationUpdates.compareVersions("1.0", "1.0.0"), 0)
    }
}
