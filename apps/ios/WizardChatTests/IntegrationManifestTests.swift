import XCTest
import WizardChatCore
@testable import WizardChat

/// The manifest validator against the web app's own fixtures (`tests/integrationManifestFixtures.ts`), dumped once from
/// node into `Resources/integration-manifests.json` (`good`, `bad`, `widgets`; the same file Android tests with)
final class IntegrationManifestTests: XCTestCase {
    static let key = "BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM="

    private func json(_ text: String) -> JSONValue {
        IntegrationNetwork.parseJSON(text) ?? .null
    }

    private func fixtures() throws -> [String: [String: JSONValue]] {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "integration-manifests", withExtension: "json"))
        let root = try XCTUnwrap(IntegrationNetwork.parseJSON(String(decoding: try Data(contentsOf: url), as: UTF8.self))?.object)
        return root.compactMapValues { $0.object }
    }

    private func usable(_ value: JSONValue) -> Bool {
        if case .valid(let manifest) = IntegrationManifest.validate(value) { return manifest.rejected.isEmpty }
        return false
    }

    private func repo(_ integrations: [JSONValue], serial: Double = 1) -> JSONValue {
        .object(["schema": .number(1), "key": .string(Self.key), "serial": .number(serial), "name": .string("Sample"),
                 "integrations": .array(integrations)])
    }

    private var base: [String: JSONValue] {
        json(#"""
        {"id":"altersend","name":"AlterSend","description":"Sample","version":"1.0.0","permissions":{
        "linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}],
        "composerActions":[{"id":"send","label":"Send","icon":"send","insert":"https://altersend.example/s?room={room}"}]}}
        """#).object ?? [:]
    }

    private func with(_ object: [String: JSONValue], _ changes: [String: JSONValue]) -> JSONValue {
        .object(object.merging(changes) { _, new in new })
    }

    func testGoodManifestsAreValidAndEveryEntryIsUsable() throws {
        let good = try XCTUnwrap(fixtures()["good"])
        XCTAssertEqual(good.count, 25)
        XCTAssertEqual(good.filter { !usable($0.value) }.keys.sorted(), [])
    }

    func testBadManifestsAreRefusedOrSetAside() throws {
        let bad = try XCTUnwrap(fixtures()["bad"])
        XCTAssertEqual(bad.count, 178)
        XCTAssertEqual(bad.filter { usable($0.value) }.keys.sorted(), [])
    }

    func testWidgetsAreSetAsideAsUnsupportedNeverAnErrorOfTheFile() throws {
        let widgets = try XCTUnwrap(fixtures()["widgets"])
        XCTAssertEqual(widgets.count, 11)
        let failed = widgets.filter { _, value in
            if case .valid(let manifest) = IntegrationManifest.validate(value) {
                return !(manifest.integrations.isEmpty && manifest.rejected.first?.reason == RejectedIntegration.unsupported)
            }
            return true
        }
        XCTAssertEqual(failed.keys.sorted(), [])
    }

    func testOversizeAndNotJsonAreRefused() {
        let oversize = #"{"schema":1,"key":"\#(Self.key)","serial":1,"name":""# + String(repeating: "x", count: maxManifestBytes) + #"","integrations":[]}"#
        guard case .invalid = IntegrationManifest.parseText(oversize) else { return XCTFail("oversize accepted") }
        guard case .invalid = IntegrationManifest.parseText("{not json") else { return XCTFail("not json accepted") }
        let ok = #"{"schema":1,"key":"\#(Self.key)","serial":1,"name":"Sample","integrations":[]}"#
        guard case .valid = IntegrationManifest.parseText(ok) else { return XCTFail("good file refused") }
    }

    func testOnlyAnEntryThatCannotBeUsedIsSetAside() throws {
        let toggle = json(#"{"id":"showStars","label":"Show stars","type":"toggle","default":true}"#).object ?? [:]
        let mixed = repo([
            .object(base),
            with(base, ["id": .string("newer"), "name": .string("Newer"), "permissions": json(#"{"teleport":[]}"#)]),
            with(base, ["id": .string("broken"), "name": .string("Broken"), "version": .number(1)]),
            with(base, ["id": .string("newtype"), "settings": .array([with(toggle, ["type": .string("slider")])])]),
            with(base, ["name": .string("Second AlterSend")]),
            .string("not an object"),
        ])
        guard case .valid(let manifest) = IntegrationManifest.validate(mixed) else { return XCTFail("repository refused") }
        func reason(_ id: String) -> String? { manifest.rejected.first { $0.id == id }?.reason }
        XCTAssertEqual(manifest.integrations.map(\.name), ["AlterSend"])
        XCTAssertEqual(manifest.rejected.count, 5)
        XCTAssertEqual(reason("newer"), RejectedIntegration.unsupported)
        XCTAssertEqual(reason("newtype"), RejectedIntegration.unsupported)
        XCTAssertEqual(reason("broken"), RejectedIntegration.invalid)
        XCTAssertTrue(manifest.rejected.first { $0.index == 4 }?.error.contains("duplicate") == true)
        let notObject = manifest.rejected.first { $0.index == 5 }
        XCTAssertNotNil(notObject)
        XCTAssertNil(notObject?.id)
        XCTAssertNil(notObject?.name)
        // The repository itself is still all or nothing
        var extra = repo([.object(base)]).object ?? [:]
        extra["extra"] = .number(1)
        guard case .invalid = IntegrationManifest.validate(.object(extra)) else { return XCTFail("unknown repo key accepted") }
        // An empty settings list is dropped, so the stored shape is canonical
        let empty = try XCTUnwrap(fixtures()["good"]?["settingsEmptyList"])
        guard case .valid(let canonical) = IntegrationManifest.validate(empty) else { return XCTFail("fixture refused") }
        XCTAssertNil(canonical.integrations[0].settings)
    }

    func testLocalApiHostsPortsAndAddressesAreNeverValid() {
        for host in ["localhost", "localhost:8080", "127.0.0.1:3000", "localhost:99999", "api.example.com:8443"] {
            let perms = json(#"{"api":{"host":"\#(host)","actions":[{"id":"push","label":"Send","path":"/v1/push"}]}}"#)
            XCTAssertFalse(usable(repo([with(base, ["permissions": perms])])), host)
        }
    }

    func testPathPatterns() {
        guard case .ok(let segments) = IntegrationManifest.parsePathPattern("/{owner}/{repo}/issues") else { return XCTFail() }
        XCTAssertEqual(segments, [.name("owner"), .name("repo"), .literal("issues")])
        XCTAssertEqual(IntegrationManifest.patternNames("/{owner}/{repo}"), ["owner", "repo"])
        for bad in ["owner", "/{a}/{a}", "/{A}", "/{}", "/a b", "/..", "/{a}{b}", "/1/2/3/4/5/6/7/8/9"] {
            guard case .error = IntegrationManifest.parsePathPattern(bad) else { return XCTFail("accepted \(bad)") }
        }
        XCTAssertEqual(IntegrationManifest.lookupNames("/repos/{owner}/{repo}"), ["owner", "repo"])
    }

    func testUnsafeCharacters() {
        XCTAssertTrue(IntegrationManifest.hasUnsafeChars("a\nb"))
        XCTAssertTrue(IntegrationManifest.hasUnsafeChars("a\u{202E}b"))
        XCTAssertFalse(IntegrationManifest.hasUnsafeChars("plain text"))
        XCTAssertEqual(IntegrationManifest.stripUnsafeChars("a\nb\u{202E}c"), "abc")
    }
}
