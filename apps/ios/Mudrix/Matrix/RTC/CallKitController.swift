import CallKit
import SwiftUI

@MainActor
final class CallKitController: NSObject {
    var onAnswer: ((UUID) -> Void)?
    var onEnd: ((UUID) -> Void)?
    var onMute: ((UUID, Bool) -> Void)?

    private let provider: CXProvider
    private let controller = CXCallController()

    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        if Bundle.main.url(forResource: "ringtone", withExtension: "wav") != nil {
            configuration.ringtoneSound = "ringtone.wav"
        }
        let icon = ImageRenderer(content: WizardMark().fill(.black).frame(width: 40, height: 40))
        icon.scale = 3
        configuration.iconTemplateImageData = icon.uiImage?.pngData()
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    func reportIncoming(_ id: UUID, caller: String, video: Bool) async -> Bool {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: caller)
        update.localizedCallerName = caller
        update.hasVideo = video
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        do {
            try await provider.reportNewIncomingCall(with: id, update: update)
            return true
        } catch {
            return false
        }
    }

    func start(_ id: UUID, name: String, video: Bool) {
        let action = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: name))
        action.isVideo = video
        action.contactIdentifier = name
        controller.request(CXTransaction(action: action)) { _ in }
    }

    func update(_ id: UUID, name: String, video: Bool) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: name)
        update.localizedCallerName = name
        update.hasVideo = video
        update.supportsHolding = false
        update.supportsDTMF = false
        provider.reportCall(with: id, updated: update)
    }

    func connected(_ id: UUID) {
        provider.reportOutgoingCall(with: id, connectedAt: nil)
    }

    func answer(_ id: UUID) {
        controller.request(CXTransaction(action: CXAnswerCallAction(call: id))) { _ in }
    }

    func end(_ id: UUID) {
        controller.request(CXTransaction(action: CXEndCallAction(call: id))) { _ in }
    }

    func setMuted(_ id: UUID, _ muted: Bool) {
        controller.request(CXTransaction(action: CXSetMutedCallAction(call: id, muted: muted))) { _ in }
    }

    func reportEnded(_ id: UUID, reason: CXCallEndedReason) {
        provider.reportCall(with: id, endedAt: nil, reason: reason)
    }
}

extension CallKitController: CXProviderDelegate {
    nonisolated func providerDidReset(_ provider: CXProvider) {}

    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: nil)
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let id = action.callUUID
        MainActor.assumeIsolated { onAnswer?(id) }
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let id = action.callUUID
        MainActor.assumeIsolated { onEnd?(id) }
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let id = action.callUUID
        let muted = action.isMuted
        MainActor.assumeIsolated { onMute?(id, muted) }
        action.fulfill()
    }
}
