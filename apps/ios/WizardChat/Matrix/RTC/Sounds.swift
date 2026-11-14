import UIKit
import UserNotifications

/// The sounds the user chose in Settings > Voice & Audio: a pack, an override per sound and a volume
@MainActor
enum Sounds {
    /// Set by `AppPreferences` when it is created
    static weak var prefs: AppPreferences?

    private struct Choice {
        let url: URL
        let volume: Float
    }

    /// The file of a sound in a pack: the pack's own, else the default pack's, else the app's own
    private static func file(_ pack: String, _ kind: SoundKind) -> (resource: String, url: URL)? {
        for candidate in [pack, SoundPacks.defaultId] {
            if let resource = SoundPacks.resource(candidate, kind), let url = SoundPacks.url(for: resource) {
                return (resource, url)
            }
        }
        return nil
    }

    /// The pack that plays a sound now, or nil when it is off
    private static func activePack(_ kind: SoundKind) -> String? {
        guard let prefs else { return nil }
        if kind.gated && !prefs.notificationSounds { return nil }
        return SoundPacks.resolve(kind, mainPack: prefs.notificationSoundPack, overrides: prefs.effectiveSoundOverrides())
    }

    /// The file and volume a sound would play with now, or nil when it is off
    private static func choice(_ kind: SoundKind) -> Choice? {
        // The per-sound switches in Settings > Voice & Video
        if let toggle = toggle(kind), !CallSounds.isOn(toggle) { return nil }
        guard let prefs, let pack = activePack(kind), let found = file(pack, kind) else { return nil }
        return Choice(url: found.url, volume: SoundPacks.volume(kind, slider: prefs.notificationSoundVolume))
    }

    /// The switch in Settings > Voice & Video a sound belongs to
    private static func toggle(_ kind: SoundKind) -> String? {
        switch kind {
        case .mute, .unmute: return "mute"
        case .cameraOn, .cameraOff: return "camera"
        case .join: return "join"
        case .leave: return "leave"
        case .ring: return "ringtone"
        case .ringback: return "ringback"
        case .callEnd: return "callEnded"
        case .watchTogetherStart: return "watchTogether"
        default: return nil
        }
    }

    /// Plays a call or voice sound once, as the settings say
    static func play(_ kind: SoundKind) {
        guard let choice = choice(kind) else { return }
        CallSounds.play(url: choice.url, volume: choice.volume)
    }

    /// Loops the ring or ringback until the returned loop is stopped; nil when it is off
    static func loop(_ kind: SoundKind) -> CallSounds.Loop? {
        guard let choice = choice(kind) else { return nil }
        if kind == .ring { return CallSounds.ringtone(url: choice.url, volume: choice.volume) }
        return CallSounds.loop(url: choice.url, volume: choice.volume)
    }

    /// The sound of an incoming message while the app is open (a mention, direct message or invite is
    /// `priority`). While the app is the screen being looked at it stays quiet unless the setting says otherwise.
    static func playMessage(priority: Bool) {
        guard let prefs else { return }
        if !prefs.notificationSoundsWhenFocused && UIApplication.shared.applicationState == .active { return }
        play(priority ? .mention : .message)
    }

    /// Any sound of any pack once, for the picker
    static func preview(_ kind: SoundKind, pack: String) {
        guard let prefs, let found = file(pack, kind) else { return }
        CallSounds.play(url: found.url, volume: SoundPacks.volume(kind, slider: prefs.notificationSoundVolume))
    }

    /// The sound a notification banner carries while the app is not on screen. iOS only plays wav, aiff
    /// and caf files shorter than 30 seconds as a notification's own sound and the volume is the
    /// system's, so a pack whose sound is an mp3 falls back to the system sound. Nil when the sound is off.
    static func notificationSound(priority: Bool) -> UNNotificationSound? {
        let kind: SoundKind = priority ? .mention : .message
        guard let pack = activePack(kind) else { return nil }
        for candidate in [pack, SoundPacks.defaultId] {
            if let resource = SoundPacks.resource(candidate, kind),
               let name = SoundPacks.notificationFileName(for: resource) {
                return UNNotificationSound(named: UNNotificationSoundName(rawValue: name))
            }
        }
        return .default
    }
}
