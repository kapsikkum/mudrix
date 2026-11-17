import MudrixCore
import SwiftUI

/// How long a voice channel's call has been going: the time since the first person joined, ticking every second
struct RoomCallTimer: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var since: Int64?
    @State private var subscription: Subscription?

    var body: some View {
        Group {
            if let since {
                CallTimerText(startedAt: since)
                    .font(.wizard(WZ.FontSize.sm, .medium))
                    .foregroundStyle(theme.success)
                    .lineLimit(1)
            }
        }
        .onAppear { watch() }
        .onChange(of: roomId) { _, _ in watch() }
        .onDisappear {
            subscription?.cancel()
            subscription = nil
        }
    }

    private func watch() {
        subscription?.cancel()
        subscription = nil
        since = nil
        guard let client = session.client else { return }
        subscription = client.watchCallMembers(roomId: roomId) { members in
            let started = members.map(\.joinedAt).filter { $0 > 0 }.min()
            MainActor.assumeIsolated { since = started.map { Int64($0) } }
        }
    }
}
