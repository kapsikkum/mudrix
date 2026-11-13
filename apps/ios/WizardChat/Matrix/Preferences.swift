import Foundation
import SwiftUI
import UIKit
import WizardChatCore

enum MessageLayout: String, CaseIterable { case modern, classic, compact }
/// The mobile shell: the space rail, or the earlier bottom tabs
enum NavigationStyle: String, CaseIterable { case rail, classic }
enum Density: String, CaseIterable { case compact, `default`, spacious }
enum ReducedMotion: String, CaseIterable { case system, on, off }
enum MediaVisibility: String, CaseIterable { case always, `private`, never }

/// The raw values are what the synced settings hold (`12h` cannot be a Swift name)
enum TimeFormat: String, CaseIterable { case auto, h12 = "12h", h24 = "24h" }
enum DateFormatStyle: String, CaseIterable { case long, dmy, mdy, ymd }
enum EmojiOnlySize: String, CaseIterable { case normal, large, jumbo }

/// Videos sent as they are, shrunk to fit a size (smart), or shrunk to one fixed resolution
enum VideoUploadMode: String, CaseIterable { case original, smart, fixed }

/// Short side, in pixels, a fixed-resolution upload is scaled to
enum VideoUploadHeight: String, CaseIterable {
    case p1080 = "1080", p720 = "720", p480 = "480"

    var pixels: Int { Int(rawValue) ?? 720 }
}

/// Size a smart upload aims for, in MB, or whatever the server allows
enum VideoUploadTarget: String, CaseIterable {
    case mb25 = "25", mb50 = "50", mb100 = "100", server

    var megabytes: Int? { Int(rawValue) }
}

/// Videos smaller than this many MB are never re-encoded
enum VideoUploadMinSize: String, CaseIterable {
    case mb10 = "10", mb25 = "25", mb50 = "50", mb100 = "100"

    var megabytes: Int { Int(rawValue) ?? 25 }
}

/// Longest side, in pixels, bigger photos are scaled down to before sending; nil keeps them
enum PhotoUploadSize: String, CaseIterable {
    case original, px2560 = "2560", px1920 = "1920", px1280 = "1280"

    var maxSide: Int? { Int(rawValue) }
}

/// YouTube link embeds: asked once, then on (cards that can play) or off (no embed at all)
enum YouTubeEmbeds: String, CaseIterable { case ask, on, off }

/// Streamer mode: hide private details always, or only while this device is being recorded or mirrored
enum StreamerMode: String, CaseIterable { case off, on, auto }

/// Settings on this device. Most of them sync with the other Mudrix apps through account data
/// (`SettingsSyncer`): a setting registered in `registerSynced` is part of the synced event under that key.
@MainActor
final class AppPreferences: ObservableObject {
    static let chatFontSizes: [Double] = [12, 14, 15, 16, 18, 20, 24]
    static let defaultChatFontSize: Double = 15

    /// The display languages, in the order of the picker (`packages/i18n/locales`)
    static let languages = ["en", "de", "es", "fr", "it", "pt", "ru", "ja", "tr", "nl", "pl"]

    private static let layouts: Set<String> = ["classic", "modern", "compact"]
    private static let navigationStyles: Set<String> = ["rail", "classic"]

    /// Names an earlier version of the base used, by the key they are now under
    private static let legacyKeys = ["sendTyping": "typingIndicators", "notificationSound": "notificationSounds"]

    private let defaults = UserDefaults.standard

    /// The chosen theme: a built-in theme's name (`Carbon`) or `custom:<id>`
    @Published var theme: String { didSet { save("theme", theme); syncIfNeeded() } }
    /// Themes the user made; chosen as `custom:<id>`
    @Published var customThemes: [CustomTheme] {
        didSet {
            let text = String(decoding: (try? JSONEncoder().encode(CustomThemes.toJson(customThemes))) ?? Data(), as: UTF8.self)
            save("customThemes", text)
            syncIfNeeded()
        }
    }
    /// Switch between the two themes below when the system changes between light and dark (the default until a theme is picked)
    @Published var followSystemTheme: Bool { didSet { save("followSystemTheme", followSystemTheme); syncIfNeeded() } }
    @Published var systemDarkTheme: String { didSet { save("systemDarkTheme", systemDarkTheme); syncIfNeeded() } }
    @Published var systemLightTheme: String { didSet { save("systemLightTheme", systemLightTheme); syncIfNeeded() } }

    // The main layout comes from the account (the web's desktop layout); this device is a phone, so its own
    // choice is the phone layout, and until one is made it follows the main one
    @Published private(set) var mainMessageLayout: String
    @Published private(set) var phoneMessageLayout: String?
    @Published private(set) var phoneNavigationStyle: String?

    @Published var chatFontSize: Double { didSet { save("chatFontSize", chatFontSize); syncIfNeeded() } }
    @Published var chatDensity: Density { didSet { save("chatDensity", chatDensity.rawValue); syncIfNeeded() } }
    @Published var uiDensity: Density { didSet { save("uiDensity", uiDensity.rawValue); syncIfNeeded() } }
    @Published var prettifyLinks: Bool { didSet { save("prettifyLinks", prettifyLinks); syncIfNeeded() } }
    @Published var colorUsernames: Bool { didSet { save("colorUsernames", colorUsernames); syncIfNeeded() } }
    /// Show images sent together as one gallery; off shows every image as its own message
    @Published var groupImages: Bool { didSet { save("groupImages", groupImages); syncIfNeeded() } }
    /// Leave join, leave, kick and ban notices out of timelines
    @Published var hideMembershipEvents: Bool { didSet { save("hideMembershipEvents", hideMembershipEvents); syncIfNeeded() } }
    /// Leave display name and picture changes out of timelines
    @Published var hideProfileEvents: Bool { didSet { save("hideProfileEvents", hideProfileEvents); syncIfNeeded() } }
    @Published var themedAppIcon: Bool { didSet { save("themedAppIcon", themedAppIcon); syncIfNeeded() } }
    @Published var showRoomAvatars: Bool { didSet { save("showRoomAvatars", showRoomAvatars); syncIfNeeded() } }
    @Published var reducedMotion: ReducedMotion { didSet { save("reducedMotion", reducedMotion.rawValue); syncIfNeeded() } }
    @Published var autoplayGifs: Bool { didSet { save("autoplayGifs", autoplayGifs); syncIfNeeded() } }
    @Published var typingIndicators: Bool { didSet { save("typingIndicators", typingIndicators); syncIfNeeded() } }
    @Published var sendReadReceipts: Bool { didSet { save("sendReadReceipts", sendReadReceipts); syncIfNeeded() } }
    @Published var mediaVisibility: MediaVisibility { didSet { save("mediaVisibility", mediaVisibility.rawValue); syncIfNeeded() } }

    @Published var videoUploadMode: VideoUploadMode { didSet { save("videoUploadMode", videoUploadMode.rawValue); syncIfNeeded() } }
    @Published var videoUploadHeight: VideoUploadHeight { didSet { save("videoUploadHeight", videoUploadHeight.rawValue); syncIfNeeded() } }
    @Published var videoUploadTarget: VideoUploadTarget { didSet { save("videoUploadTarget", videoUploadTarget.rawValue); syncIfNeeded() } }
    @Published var videoUploadMinSize: VideoUploadMinSize { didSet { save("videoUploadMinSize", videoUploadMinSize.rawValue); syncIfNeeded() } }
    @Published var photoStripMetadata: Bool { didSet { save("photoStripMetadata", photoStripMetadata); syncIfNeeded() } }
    @Published var photoUploadSize: PhotoUploadSize { didSet { save("photoUploadSize", photoUploadSize.rawValue); syncIfNeeded() } }
    @Published var youtubeEmbeds: YouTubeEmbeds { didSet { save("youtubeEmbeds", youtubeEmbeds.rawValue); syncIfNeeded() } }

    @Published var timeFormat: TimeFormat { didSet { save("timeFormat", timeFormat.rawValue); syncIfNeeded() } }
    @Published var dateFormat: DateFormatStyle { didSet { save("dateFormat", dateFormat.rawValue); syncIfNeeded() } }
    @Published var emojiOnlySize: EmojiOnlySize { didSet { save("emojiOnlySize", emojiOnlySize.rawValue); syncIfNeeded() } }
    @Published var emoticonsToEmoji: Bool { didSet { save("emoticonsToEmoji", emoticonsToEmoji); syncIfNeeded() } }

    // Whether this device is being streamed is a fact about this device, so it is not synced
    @Published var streamerMode: StreamerMode { didSet { save("streamerMode", streamerMode.rawValue) } }
    /// Whether the screen is being recorded or mirrored right now
    @Published private(set) var screenCaptured = false

    @Published var showPresence: Bool { didSet { save("showPresence", showPresence); syncIfNeeded() } }
    @Published var showHomeserverSoftware: Bool { didSet { save("showHomeserverSoftware", showHomeserverSoftware); syncIfNeeded() } }
    /// Draw cosmetics that come from packs, anyone's; built-in ones always draw
    @Published var showCosmeticPacks: Bool { didSet { save("showCosmeticPacks", showCosmeticPacks); syncIfNeeded() } }
    @Published var notificationSounds: Bool { didSet { save("notificationSounds", notificationSounds); syncIfNeeded() } }
    /// Message sounds also play while the app is open on screen
    @Published var notificationSoundsWhenFocused: Bool {
        didSet { save("notificationSoundsWhenFocused", notificationSoundsWhenFocused); syncIfNeeded() }
    }
    /// The sound pack for every sound without an override of its own
    @Published var notificationSoundPack: String { didSet { save("notificationSoundPack", notificationSoundPack); syncIfNeeded() } }
    /// The mention pack of earlier versions; read as the mention override
    @Published var notificationMentionSoundPack: String {
        didSet { save("notificationMentionSoundPack", notificationMentionSoundPack); syncIfNeeded() }
    }
    /// 0-100, for message, mention and call sounds
    @Published var notificationSoundVolume: Double { didSet { save("notificationSoundVolume", notificationSoundVolume); syncIfNeeded() } }
    /// Per sound (by its id): a pack id or "off"; a sound left out follows `notificationSoundPack`
    @Published var soundOverrides: [String: String] {
        didSet {
            let text = String(decoding: (try? JSONEncoder().encode(SoundPacks.overridesJson(soundOverrides))) ?? Data(), as: UTF8.self)
            save("soundOverrides", text)
            syncIfNeeded()
        }
    }
    /// Microphone processing applied when a call is joined
    @Published var noiseSuppression: Bool { didSet { save("noiseSuppression", noiseSuppression); syncIfNeeded() } }
    @Published var echoCancellation: Bool { didSet { save("echoCancellation", echoCancellation); syncIfNeeded() } }
    /// Let people who manage a space move you between its voice channels (`voice_move` requests)
    @Published var allowVoiceMoves: Bool { didSet { save("allowVoiceMoves", allowVoiceMoves); syncIfNeeded() } }
    @Published var autoGainControl: Bool { didSet { save("autoGainControl", autoGainControl); syncIfNeeded() } }

    // Soundboard listening choices are per device (a phone in a pocket and a desktop with speakers differ), so they are not synced
    @Published var soundboardEnabled: Bool { didSet { save("soundboardEnabled", soundboardEnabled) } }
    /// 0-100, separate from voice and notification volume
    @Published var soundboardVolume: Double { didSet { save("soundboardVolume", soundboardVolume) } }
    /// People whose soundboard clips are muted on this device
    @Published var soundboardMutedUsers: [String] { didSet { save("soundboardMutedUsers", soundboardMutedUsers) } }
    @Published var notificationBanners: Bool { didSet { save("notificationBanners", notificationBanners) } }
    @Published var language: String { didSet { save("language", language); applyLanguage(); syncIfNeeded() } }
    @Published var developerMode: Bool { didSet { save("developerMode", developerMode) } }
    @Published var pushToTalk: Bool { didSet { save("pushToTalk", pushToTalk) } }

    /// Called after a synced setting changed on this device
    var onSyncedSettingsChange: (() -> Void)?
    private var isApplyingRemote = false

    /// How one synced setting is read from and written to the settings event
    private struct Synced {
        let key: String
        let topLevel: Bool
        let read: () -> JSONValue?
        let normalise: (JSONValue) -> JSONValue?
        let apply: (JSONValue) -> Void
    }

    private var synced: [Synced] = []
    private var captureObserver: NSObjectProtocol?

    init() {
        let d = UserDefaults.standard
        // "theme.device" is where this app kept the theme before it followed the web's settings: "system" or a theme id
        let earlierTheme = d.string(forKey: "theme.device")
        let earlierName = WZ.Theme.allCases.first { $0.rawValue == earlierTheme }?.name
        theme = d.string(forKey: "theme") ?? earlierName ?? Themes.defaultName
        let storedThemes = d.string(forKey: "customThemes").flatMap { text in
            try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
        }
        customThemes = CustomThemes.sanitize(storedThemes)
        followSystemTheme = d.object(forKey: "followSystemTheme") as? Bool ?? (earlierTheme == nil || earlierTheme == "system")
        systemDarkTheme = d.string(forKey: "systemDarkTheme") ?? Themes.defaultName
        systemLightTheme = d.string(forKey: "systemLightTheme") ?? Themes.defaultLightName

        mainMessageLayout = d.string(forKey: "messageLayout.main") ?? "modern"
        // "messageLayout" is where this device's own choice was kept before the phone layout existed
        let phone = d.string(forKey: "messageLayoutMobile") ?? d.string(forKey: "messageLayout")
        phoneMessageLayout = Self.layouts.contains(phone ?? "") ? phone : nil

        let navigation = d.string(forKey: "navigationStyle")
        phoneNavigationStyle = Self.navigationStyles.contains(navigation ?? "") ? navigation : nil

        chatFontSize = d.object(forKey: "chatFontSize") as? Double ?? Self.defaultChatFontSize
        chatDensity = Self.stored(d, "chatDensity", .default)
        uiDensity = Self.stored(d, "uiDensity", .default)
        prettifyLinks = d.object(forKey: "prettifyLinks") as? Bool ?? true
        groupImages = d.object(forKey: "groupImages") as? Bool ?? true
        hideMembershipEvents = d.object(forKey: "hideMembershipEvents") as? Bool ?? false
        hideProfileEvents = d.object(forKey: "hideProfileEvents") as? Bool ?? true
        colorUsernames = d.object(forKey: "colorUsernames") as? Bool ?? true
        themedAppIcon = d.bool(forKey: "themedAppIcon")
        showRoomAvatars = d.object(forKey: "showRoomAvatars") as? Bool ?? true
        reducedMotion = Self.stored(d, "reducedMotion", .system)
        autoplayGifs = d.object(forKey: "autoplayGifs") as? Bool ?? true
        typingIndicators = d.object(forKey: "typingIndicators") as? Bool ?? true
        sendReadReceipts = d.object(forKey: "sendReadReceipts") as? Bool ?? true
        mediaVisibility = Self.stored(d, "mediaVisibility", .always)

        videoUploadMode = Self.stored(d, "videoUploadMode", .original)
        videoUploadHeight = Self.stored(d, "videoUploadHeight", .p720)
        videoUploadTarget = Self.stored(d, "videoUploadTarget", .mb50)
        videoUploadMinSize = Self.stored(d, "videoUploadMinSize", .mb25)
        photoStripMetadata = d.bool(forKey: "photoStripMetadata")
        photoUploadSize = Self.stored(d, "photoUploadSize", .original)
        youtubeEmbeds = Self.stored(d, "youtubeEmbeds", .ask)

        timeFormat = Self.stored(d, "timeFormat", .auto)
        dateFormat = Self.stored(d, "dateFormat", .long)
        emojiOnlySize = Self.stored(d, "emojiOnlySize", .large)
        emoticonsToEmoji = d.object(forKey: "emoticonsToEmoji") as? Bool ?? true

        streamerMode = Self.stored(d, "streamerMode", .auto)
        // Off until chosen, like Mudrix: you appear offline and nobody sees your status
        showPresence = d.object(forKey: "showPresence") as? Bool ?? false
        showHomeserverSoftware = d.object(forKey: "showHomeserverSoftware") as? Bool ?? true
        showCosmeticPacks = d.object(forKey: "showCosmeticPacks") as? Bool ?? true
        notificationSounds = d.object(forKey: "notificationSounds") as? Bool ?? true
        notificationSoundsWhenFocused = d.object(forKey: "notificationSoundsWhenFocused") as? Bool ?? false
        let storedPack = d.string(forKey: "notificationSoundPack")
        notificationSoundPack = SoundPacks.isPackId(storedPack) ? (storedPack ?? SoundPacks.defaultId) : SoundPacks.defaultId
        let storedMentionPack = d.string(forKey: "notificationMentionSoundPack")
        notificationMentionSoundPack = SoundPacks.isPackId(storedMentionPack) ? (storedMentionPack ?? "") : ""
        let storedVolume = d.object(forKey: "notificationSoundVolume") as? Double ?? 70
        notificationSoundVolume = min(max(storedVolume, 0), 100)
        let storedOverrides = d.string(forKey: "soundOverrides").flatMap { text in
            try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
        }
        soundOverrides = SoundPacks.sanitizeOverrides(storedOverrides) ?? [:]
        noiseSuppression = d.object(forKey: "noiseSuppression") as? Bool ?? true
        echoCancellation = d.object(forKey: "echoCancellation") as? Bool ?? true
        autoGainControl = d.object(forKey: "autoGainControl") as? Bool ?? true
        allowVoiceMoves = d.object(forKey: "allowVoiceMoves") as? Bool ?? true
        soundboardEnabled = d.object(forKey: "soundboardEnabled") as? Bool ?? true
        let storedBoardVolume = d.object(forKey: "soundboardVolume") as? Double ?? 70
        soundboardVolume = min(max(storedBoardVolume, 0), 100)
        soundboardMutedUsers = d.stringArray(forKey: "soundboardMutedUsers") ?? []
        notificationBanners = d.object(forKey: "notificationBanners") as? Bool ?? true
        language = d.string(forKey: "language") ?? ""
        pushToTalk = d.bool(forKey: "pushToTalk")
        developerMode = d.bool(forKey: "developerMode")

        registerSynced()
        Sounds.prefs = self
        screenCaptured = UIScreen.main.isCaptured
        captureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.screenCaptured = UIScreen.main.isCaptured }
        }
    }

    private static func stored<E: RawRepresentable>(_ d: UserDefaults, _ key: String, _ fallback: E) -> E
    where E.RawValue == String {
        E(rawValue: d.string(forKey: key) ?? "") ?? fallback
    }

    /// The layout in use on this device: its own phone choice, else the account's main one
    var messageLayout: MessageLayout {
        get { (phoneMessageLayout ?? mainMessageLayout) == "classic" ? .classic : .modern }
        set {
            setPhoneLayout(newValue.rawValue)
            syncIfNeeded()
        }
    }

    /// The shell in use on this device: the space rail unless the classic tabs were chosen
    var navigationStyle: NavigationStyle {
        get { phoneNavigationStyle == NavigationStyle.classic.rawValue ? .classic : .rail }
        set {
            setNavigationStyle(newValue.rawValue)
            syncIfNeeded()
        }
    }

    var chatScale: CGFloat { CGFloat(chatFontSize / Self.defaultChatFontSize) }

    var chatSpacing: CGFloat {
        switch chatDensity {
        case .compact: return 0.35
        case .default: return 1
        case .spacious: return 1.8
        }
    }

    var roomAvatarSize: CGFloat { [Density.compact: 32, .default: 44, .spacious: 52][uiDensity]! }
    var roomRowPadding: CGFloat { [Density.compact: 6, .default: 9, .spacious: 12][uiDensity]! }
    var spaceGap: CGFloat { [Density.compact: 4, .default: 6, .spacious: 10][uiDensity]! }

    func reducesMotion(systemSetting: Bool) -> Bool {
        switch reducedMotion {
        case .system: return systemSetting
        case .on: return true
        case .off: return false
        }
    }

    /// The theme in use: the chosen one, or the one for the system's light or dark mode when following it
    func effectiveThemeName(systemDark: Bool) -> String {
        if !followSystemTheme { return theme }
        return systemDark ? systemDarkTheme : systemLightTheme
    }

    /// Whether streamer mode hides private details now: always when chosen, or "auto" while the
    /// screen is being recorded or mirrored
    var streamerModeActive: Bool {
        streamerMode == .on || (streamerMode == .auto && screenCaptured)
    }

    // MARK: Sync

    private func registerSynced() {
        synced = [
            stringKey("theme", \.theme, topLevel: true, allowed: { Themes.isValidName($0) }),
            customThemesKey(),
            boolKey("followSystemTheme", \.followSystemTheme),
            stringKey("systemDarkTheme", \.systemDarkTheme, topLevel: false, allowed: { Themes.isValidName($0) }),
            stringKey("systemLightTheme", \.systemLightTheme, topLevel: false, allowed: { Themes.isValidName($0) }),
            layoutKey("messageLayout", mobile: false),
            layoutKey("messageLayoutMobile", mobile: true),
            navigationKey(),
            languageKey(),
            numberKey("chatFontSize", \.chatFontSize, range: 8...40),
            enumKey("chatDensity", \.chatDensity),
            enumKey("uiDensity", \.uiDensity),
            boolKey("prettifyLinks", \.prettifyLinks),
            boolKey("colorUsernames", \.colorUsernames),
            boolKey("groupImages", \.groupImages),
            boolKey("hideMembershipEvents", \.hideMembershipEvents),
            boolKey("hideProfileEvents", \.hideProfileEvents),
            boolKey("themedAppIcon", \.themedAppIcon),
            boolKey("showRoomAvatars", \.showRoomAvatars),
            enumKey("reducedMotion", \.reducedMotion),
            boolKey("autoplayGifs", \.autoplayGifs),
            boolKey("typingIndicators", \.typingIndicators),
            boolKey("sendReadReceipts", \.sendReadReceipts),
            enumKey("mediaVisibility", \.mediaVisibility),
            enumKey("videoUploadMode", \.videoUploadMode),
            enumKey("videoUploadHeight", \.videoUploadHeight),
            enumKey("videoUploadTarget", \.videoUploadTarget),
            enumKey("videoUploadMinSize", \.videoUploadMinSize),
            boolKey("photoStripMetadata", \.photoStripMetadata),
            enumKey("photoUploadSize", \.photoUploadSize),
            enumKey("youtubeEmbeds", \.youtubeEmbeds),
            enumKey("timeFormat", \.timeFormat),
            enumKey("dateFormat", \.dateFormat),
            enumKey("emojiOnlySize", \.emojiOnlySize),
            boolKey("emoticonsToEmoji", \.emoticonsToEmoji),
            boolKey("showPresence", \.showPresence),
            boolKey("showHomeserverSoftware", \.showHomeserverSoftware),
            boolKey("showCosmeticPacks", \.showCosmeticPacks),
            boolKey("notificationSounds", \.notificationSounds),
            boolKey("notificationSoundsWhenFocused", \.notificationSoundsWhenFocused),
            packKey("notificationSoundPack", \.notificationSoundPack),
            packKey("notificationMentionSoundPack", \.notificationMentionSoundPack),
            numberKey("notificationSoundVolume", \.notificationSoundVolume, range: 0...100),
            soundOverridesKey(),
            boolKey("noiseSuppression", \.noiseSuppression),
            boolKey("echoCancellation", \.echoCancellation),
            boolKey("autoGainControl", \.autoGainControl),
            boolKey("allowVoiceMoves", \.allowVoiceMoves),
        ]
    }

    private func packKey(_ key: String, _ path: ReferenceWritableKeyPath<AppPreferences, String>) -> Synced {
        stringKey(key, path, topLevel: false, allowed: { SoundPacks.isPackId($0) })
    }

    private func soundOverridesKey() -> Synced {
        Synced(
            key: "soundOverrides", topLevel: false,
            read: { [unowned self] in SoundPacks.overridesJson(self.soundOverrides) },
            normalise: { value in
                guard let overrides = SoundPacks.sanitizeOverrides(value) else { return nil }
                return SoundPacks.overridesJson(overrides)
            },
            apply: { [unowned self] value in
                guard let overrides = SoundPacks.sanitizeOverrides(value), overrides != self.soundOverrides else { return }
                self.soundOverrides = overrides
            })
    }

    /// The overrides with the older mention pack read as the mention override
    func effectiveSoundOverrides() -> [String: String] {
        guard soundOverrides[SoundKind.mention.id] == nil, !notificationMentionSoundPack.isEmpty else { return soundOverrides }
        var merged = soundOverrides
        merged[SoundKind.mention.id] = notificationMentionSoundPack
        return merged
    }

    private func boolKey(_ key: String, _ path: ReferenceWritableKeyPath<AppPreferences, Bool>) -> Synced {
        Synced(
            key: key, topLevel: false,
            read: { [unowned self] in .bool(self[keyPath: path]) },
            normalise: { value in
                if case .bool = value { return value }
                return nil
            },
            apply: { [unowned self] value in
                if case .bool(let flag) = value, self[keyPath: path] != flag { self[keyPath: path] = flag }
            })
    }

    private func enumKey<E: RawRepresentable & Equatable>(
        _ key: String, _ path: ReferenceWritableKeyPath<AppPreferences, E>
    ) -> Synced where E.RawValue == String {
        Synced(
            key: key, topLevel: false,
            read: { [unowned self] in .string(self[keyPath: path].rawValue) },
            normalise: { value in
                if case .string(let text) = value, E(rawValue: text) != nil { return value }
                return nil
            },
            apply: { [unowned self] value in
                if case .string(let text) = value, let item = E(rawValue: text), self[keyPath: path] != item {
                    self[keyPath: path] = item
                }
            })
    }

    private func numberKey(_ key: String, _ path: ReferenceWritableKeyPath<AppPreferences, Double>,
                           range: ClosedRange<Double>) -> Synced {
        Synced(
            key: key, topLevel: false,
            read: { [unowned self] in .number(self[keyPath: path]) },
            normalise: { value in
                if case .number(let number) = value, range.contains(number) { return value }
                return nil
            },
            apply: { [unowned self] value in
                if case .number(let number) = value, range.contains(number), self[keyPath: path] != number {
                    self[keyPath: path] = number
                }
            })
    }

    private func stringKey(_ key: String, _ path: ReferenceWritableKeyPath<AppPreferences, String>,
                           topLevel: Bool, allowed: @escaping (String) -> Bool) -> Synced {
        Synced(
            key: key, topLevel: topLevel,
            read: { [unowned self] in .string(self[keyPath: path]) },
            normalise: { value in
                if case .string(let text) = value, allowed(text) { return value }
                return nil
            },
            apply: { [unowned self] value in
                if case .string(let text) = value, allowed(text), self[keyPath: path] != text {
                    self[keyPath: path] = text
                }
            })
    }

    private func customThemesKey() -> Synced {
        Synced(
            key: "customThemes", topLevel: true,
            read: { [unowned self] in CustomThemes.toJson(self.customThemes) },
            normalise: { value in
                if case .array = value { return CustomThemes.toJson(CustomThemes.sanitize(value)) }
                return nil
            },
            apply: { [unowned self] value in
                let list = CustomThemes.sanitize(value)
                if list != self.customThemes { self.customThemes = list }
            })
    }

    /// The account's main layout (`messageLayout`) or the one for phones (`messageLayoutMobile`)
    private func layoutKey(_ key: String, mobile: Bool) -> Synced {
        Synced(
            key: key, topLevel: true,
            read: { [unowned self] in
                if mobile { return self.phoneMessageLayout.map { JSONValue.string($0) } }
                return JSONValue.string(self.mainMessageLayout)
            },
            normalise: { value in
                if case .string(let text) = value, Self.layouts.contains(text) { return value }
                return nil
            },
            apply: { [unowned self] value in
                guard case .string(let text) = value, Self.layouts.contains(text) else { return }
                if mobile {
                    if self.phoneMessageLayout != text { self.setPhoneLayout(text) }
                } else if self.mainMessageLayout != text {
                    self.setMainLayout(text)
                }
            })
    }

    private func setMainLayout(_ value: String) {
        mainMessageLayout = value
        save("messageLayout.main", value)
    }

    private func setPhoneLayout(_ value: String) {
        phoneMessageLayout = value
        save("messageLayoutMobile", value)
    }

    private func navigationKey() -> Synced {
        Synced(
            key: "navigationStyle", topLevel: true,
            read: { [unowned self] in self.phoneNavigationStyle.map { JSONValue.string($0) } },
            normalise: { value in
                if case .string(let text) = value, Self.navigationStyles.contains(text) { return value }
                return nil
            },
            apply: { [unowned self] value in
                guard case .string(let text) = value, Self.navigationStyles.contains(text) else { return }
                if self.phoneNavigationStyle != text { self.setNavigationStyle(text) }
            })
    }

    private func setNavigationStyle(_ value: String) {
        phoneNavigationStyle = value
        save("navigationStyle", value)
    }

    private func languageKey() -> Synced {
        Synced(
            key: "language", topLevel: true,
            read: { [unowned self] in .string(self.language.isEmpty ? "system" : self.language) },
            normalise: { value in
                if case .string(let text) = value, text == "system" || Self.languages.contains(text) { return value }
                return nil
            },
            apply: { [unowned self] value in
                guard case .string(let text) = value, text == "system" || Self.languages.contains(text) else { return }
                let code = text == "system" ? "" : text
                if code != self.language { self.language = code }
            })
    }

    /// The settings event as this device would save it
    func settingsSnapshot() -> [String: JSONValue] {
        var top: [String: JSONValue] = [:]
        var preferences: [String: JSONValue] = [:]
        for item in synced {
            guard let value = item.read() else { continue }
            if item.topLevel { top[item.key] = value } else { preferences[item.key] = value }
        }
        top["preferences"] = .object(preferences)
        return top
    }

    /// Keeps what this version understands of a settings event, in the form `settingsSnapshot`
    /// has: known keys only, with a value of the right type and an allowed value.
    func sanitizeSettings(_ raw: [String: JSONValue]) -> [String: JSONValue] {
        var top: [String: JSONValue] = [:]
        for item in synced where item.topLevel {
            if let value = raw[item.key], let normal = item.normalise(value) { top[item.key] = normal }
        }
        // The WizardChat base keeps the preferences next to the theme instead of in a `preferences` object
        var flat = raw
        for (old, current) in Self.legacyKeys where flat[current] == nil {
            if let value = raw[old] { flat[current] = value }
        }
        if let nested = SettingsSync.object(raw["preferences"]) {
            for (key, value) in nested { flat[key] = value }
        }
        var preferences: [String: JSONValue] = [:]
        for item in synced where !item.topLevel {
            if let value = flat[item.key], let normal = item.normalise(value) { preferences[item.key] = normal }
        }
        top["preferences"] = .object(preferences)
        return top
    }

    /// Applies a sanitized settings event (`sanitizeSettings`) to this device
    func applySettings(_ settings: [String: JSONValue]) {
        isApplyingRemote = true
        defer { isApplyingRemote = false }
        let preferences = SettingsSync.object(settings["preferences"]) ?? [:]
        for item in synced {
            let value = item.topLevel ? settings[item.key] : preferences[item.key]
            if let value { item.apply(value) }
        }
    }

    private func syncIfNeeded() {
        guard !isApplyingRemote else { return }
        onSyncedSettingsChange?()
    }

    private func save(_ key: String, _ value: Any) {
        defaults.set(value, forKey: key)
    }

    /// iOS picks the app language at launch, so a change applies after reopening the app.
    private func applyLanguage() {
        if language.isEmpty {
            defaults.removeObject(forKey: "AppleLanguages")
        } else {
            defaults.set([language], forKey: "AppleLanguages")
        }
    }
}
