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

    private static func makePlayer(_ name: String) -> AVAudioPlayer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
              let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.volume = volume
        return player
    }

    final class Loop {
        private let player: AVAudioPlayer
        init(player: AVAudioPlayer) { self.player = player }
        func stop() { player.stop() }
    }
}
