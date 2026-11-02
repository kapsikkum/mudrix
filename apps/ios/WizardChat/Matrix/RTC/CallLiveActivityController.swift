import ActivityKit
import Foundation

@MainActor
final class CallLiveActivityController {
    private var activity: Activity<CallActivityAttributes>?
    private var lastState: CallActivityAttributes.ContentState?
    private var lastUpdate = Date.distantPast
    private var pending: Task<Void, Never>?

    func start(roomName: String, isDirect: Bool, state: CallActivityAttributes.ContentState) {
        end()
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = CallActivityAttributes(roomName: roomName, isDirect: isDirect, startedAt: Date())
        do {
            activity = try Activity.request(attributes: attributes,
                                            content: ActivityContent(state: state, staleDate: nil),
                                            pushType: nil)
            lastState = state
            lastUpdate = Date()
        } catch {
            NSLog("WZCALL live activity: %@", String(describing: error))
        }
    }

    func update(_ state: CallActivityAttributes.ContentState) {
        guard let activity, state != lastState else { return }
        lastState = state
        pending?.cancel()
        let wait = max(0, 1 - Date().timeIntervalSince(lastUpdate))
        let urgent = state.micMuted != activity.content.state.micMuted || state.deafened != activity.content.state.deafened
        pending = Task { [weak self] in
            if !urgent && wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, let self, let latest = self.lastState else { return }
            self.lastUpdate = Date()
            await activity.update(ActivityContent(state: latest, staleDate: nil))
        }
    }

    func end() {
        pending?.cancel()
        pending = nil
        lastState = nil
        guard let activity else {
            for old in Activity<CallActivityAttributes>.activities {
                Task { await old.end(nil, dismissalPolicy: .immediate) }
            }
            return
        }
        self.activity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
