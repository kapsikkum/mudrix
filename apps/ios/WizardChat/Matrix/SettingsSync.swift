import Foundation
import WizardChatCore

/// Settings in Matrix account data, compatible with the web app (`client/settingsSync.ts`): one
/// nested event `{ theme, customThemes, messageLayout, language, preferences: { ... } }`. Only
/// non-secret appearance and behaviour choices belong here; the homeserver admin can read it.
enum SettingsSync {
    /// The current event
    static let settingsType = Namespace.mudrixKey("settings")

    /// Where earlier Mudrix versions kept the settings; every save also writes it, and it is read first
    static let previousSettingsType = Namespace.legacyMudrixKey("settings")

    /// Every name a save writes
    static let writeTypes = [settingsType, previousSettingsType]

    /// The WizardChat base's flat settings, a fallback that is never written
    static let wizardchatSettingsType = Namespace.wizardchatKey("settings")

    /// The older WizardChat web app's event
    static let legacySettingsType = "io.gitlab.wizardchat.settings"

    /// Every settings event, best source first
    static let readTypes = [previousSettingsType, settingsType, wizardchatSettingsType, legacySettingsType]

    static func object(_ value: JSONValue?) -> [String: JSONValue]? {
        if case .object(let fields)? = value { return fields }
        return nil
    }

    /// The first settings event the account has, in the order of `readTypes`
    static func pick(_ contents: [String: JSONValue]) -> [String: JSONValue]? {
        for type in readTypes {
            if let fields = object(contents[type]) { return fields }
        }
        return nil
    }

    /// Whether the account has saved Mudrix settings yet (as opposed to only WizardChat's)
    static func hasMudrixSettings(_ contents: [String: JSONValue]) -> Bool {
        writeTypes.contains { object(contents[$0]) != nil }
    }

    /// The same text for equal values, whatever the key order
    static func stable(_ value: JSONValue?) -> String {
        guard let value else { return "null" }
        switch value {
        case .null:
            return "null"
        case .bool(let flag):
            return flag ? "true" : "false"
        case .number(let number):
            if number == number.rounded() && abs(number) < 1e15 { return String(Int(number)) }
            return String(number)
        case .string(let text):
            return quoted(text)
        case .array(let items):
            return "[" + items.map { stable($0) }.joined(separator: ",") + "]"
        case .object(let fields):
            let parts = fields.keys.sorted().map { quoted($0) + ":" + stable(fields[$0]) }
            return "{" + parts.joined(separator: ",") + "}"
        }
    }

    private static func quoted(_ text: String) -> String {
        let escaped = text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        return "\"" + escaped + "\""
    }

    /// What to write to the settings event `type`: the content already stored there with only the
    /// keys that differ from `current` replaced. Keys this version does not know (written by the
    /// web app or a newer version) are kept. With no saved Mudrix settings yet (`writeAll`),
    /// everything is written.
    static func mergeForWrite(contents: [String: JSONValue], type: String, next: [String: JSONValue],
                              current: [String: JSONValue], writeAll: Bool) -> [String: JSONValue] {
        // A name nothing has been saved under yet starts from the other one, so it is not left partial
        var base: [String: JSONValue] = [:]
        for name in [type] + writeTypes {
            if let fields = object(contents[name]) {
                base = fields
                break
            }
        }
        func changed(_ a: JSONValue?, _ b: JSONValue?) -> Bool {
            writeAll || stable(a) != stable(b)
        }
        for (key, value) in next where key != "preferences" {
            if changed(value, current[key]) { base[key] = value }
        }
        if let nextPrefs = object(next["preferences"]) {
            let currentPrefs = object(current["preferences"]) ?? [:]
            var prefs = object(base["preferences"]) ?? [:]
            for (key, value) in nextPrefs {
                if changed(value, currentPrefs[key]) { prefs[key] = value }
            }
            base["preferences"] = .object(prefs)
        }
        return base
    }
}

/// Keeps `AppPreferences` and the account's settings in step: applies what the account has
/// (live), and writes local changes after a short pause.
@MainActor
final class SettingsSyncer {
    private let client: WizardClient
    private let prefs: AppPreferences
    private var contents: [String: JSONValue] = [:]
    private var subscriptions: [Subscription] = []
    private var pushTask: Task<Void, Never>?

    /// Whether the account's data has loaded; nothing is written before, or an empty account
    /// would be taken for a new one
    private var ready = false

    init(client: WizardClient, prefs: AppPreferences) {
        self.client = client
        self.prefs = prefs
    }

    func start() {
        var watches: [Subscription] = SettingsSync.readTypes.map { type in
            client.watchAccountData(eventType: type) { [weak self] content in
                MainActor.assumeIsolated { self?.received(type, content) }
            }
        }
        watches.append(client.watchLoadState { [weak self] state in
            if state != .loading {
                Task { @MainActor in await self?.becomeReady() }
            }
        })
        subscriptions = watches
        prefs.onSyncedSettingsChange = { [weak self] in
            guard let self, self.ready else { return }
            self.schedulePush()
        }
        Task { await becomeReady() }
    }

    func stop() {
        prefs.onSyncedSettingsChange = nil
        pushTask?.cancel()
        pushTask = nil
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
    }

    private func received(_ type: String, _ content: JSONValue?) {
        contents[type] = content
        applyRemote()
        if ready { schedulePush() }
    }

    private func becomeReady() async {
        guard !ready else { return }
        var failed = false
        for type in SettingsSync.readTypes where contents[type] == nil {
            do {
                if let value = try await client.accountData(eventType: type) {
                    contents[type] = value
                }
            } catch {
                failed = true
            }
        }
        guard !failed, !ready else { return }
        ready = true
        applyRemote()
        schedulePush()
    }

    private func applyRemote() {
        guard let raw = SettingsSync.pick(contents) else { return }
        prefs.applySettings(prefs.sanitizeSettings(raw))
    }

    private func schedulePush() {
        pushTask?.cancel()
        pushTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            await self?.push()
        }
    }

    private func push() async {
        let next = prefs.settingsSnapshot()
        var current: [String: JSONValue] = [:]
        if let raw = SettingsSync.pick(contents) { current = prefs.sanitizeSettings(raw) }
        // Until the first save there is no Mudrix event, only (maybe) WizardChat's copy to carry over
        let hasSaved = SettingsSync.hasMudrixSettings(contents)
        if hasSaved && SettingsSync.stable(.object(next)) == SettingsSync.stable(.object(current)) { return }
        // Under the current name and the one earlier versions read, so devices not updated yet keep following
        var writes: [(String, [String: JSONValue])] = []
        for type in SettingsSync.writeTypes {
            let merged = SettingsSync.mergeForWrite(contents: contents, type: type, next: next,
                                                    current: current, writeAll: !hasSaved)
            writes.append((type, merged))
        }
        for (type, content) in writes {
            do {
                try await client.setAccountData(eventType: type, content: .object(content))
                contents[type] = .object(content)
            } catch {
                continue
            }
        }
    }
}
