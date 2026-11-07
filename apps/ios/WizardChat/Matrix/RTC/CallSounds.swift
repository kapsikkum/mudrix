import AVFoundation

/// Plays sound files once or in a loop. The app's own sounds are by name (`call_declined`); the ones
/// that follow the user's sound settings go through `Sounds`.
@MainActor
enum CallSounds {
    static let defaultVolume: Float = 0.5
    private static var playing: [AVAudioPlayer] = []

    static func play(_ name: String, volume: Float = defaultVolume) {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return }
        play(url: url, volume: volume)
    }

    static func play(url: URL, volume: Float = defaultVolume) {
        guard let player = makePlayer(url, volume: volume) else { return }
        playing.removeAll { !$0.isPlaying }
        playing.append(player)
        player.play()
    }

    static func loop(url: URL, volume: Float = defaultVolume) -> Loop? {
        guard let player = makePlayer(url, volume: volume) else { return nil }
        player.numberOfLoops = -1
        player.play()
        return Loop(player: player)
    }

    private static func makePlayer(_ url: URL, volume: Float) -> AVAudioPlayer? {
        guard let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.volume = volume
        return player
    }

    final class Loop {
        private let player: AVAudioPlayer
        init(player: AVAudioPlayer) { self.player = player }
        func stop() { player.stop() }
    }
}
