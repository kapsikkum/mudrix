import AVFoundation

@MainActor
enum CallSounds {
    private static let volume: Float = 0.5
    private static var playing: [AVAudioPlayer] = []

    static func play(_ name: String) {
        guard let player = makePlayer(name) else { return }
        playing.removeAll { !$0.isPlaying }
        playing.append(player)
        player.play()
    }

    static func loop(_ name: String) -> Loop? {
        guard let player = makePlayer(name) else { return nil }
        player.numberOfLoops = -1
        player.play()
        return Loop(player: player)
    }

    /// The default session is silenced by the ring/silent switch, so an incoming call rings with
    /// `.playback` and the previous session comes back when it stops. In a call LiveKit's
    /// `.playAndRecord` already rings through the switch and is left alone.
    static func ringtone() -> Loop? {
        let session = AVAudioSession.sharedInstance()
        let previous = (session.category, session.mode, session.categoryOptions)
        let switched = previous.0 != .playAndRecord
        if switched {
            try? session.setCategory(.playback, mode: .default)
            try? session.setActive(true)
        }
        let restore = {
            guard switched else { return }
            try? session.setCategory(previous.0, mode: previous.1, options: previous.2)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        guard let ring = loop("ringtone") else {
            restore()
            return nil
        }
        ring.onStop = restore
        return ring
    }

    private static func makePlayer(_ name: String) -> AVAudioPlayer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
              let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.volume = volume
        return player
    }

    final class Loop {
        private let player: AVAudioPlayer
        fileprivate var onStop: (() -> Void)?
        init(player: AVAudioPlayer) { self.player = player }
        func stop() {
            player.stop()
            onStop?()
            onStop = nil
        }
    }
}
