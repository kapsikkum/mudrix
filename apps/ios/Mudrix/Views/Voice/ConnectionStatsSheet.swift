import Foundation
import MudrixCore
import SwiftUI

/// A call's connection info, polled from LiveKit's stats while the sheet is open, as the web popover shows it
struct ConnectionStatsSheet: View {
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var summary: ConnectionStats.Summary?
    @State private var unavailable = false
    @State private var pings: [Int] = []

    private var averagePing: Int? {
        pings.isEmpty ? nil : Int((Double(pings.reduce(0, +)) / Double(pings.count)).rounded())
    }

    private var sendingVideo: Bool {
        guard let video = summary?.sendVideo else { return false }
        return video.resolution != nil || (video.bitrate ?? 0) > 0
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                    if unavailable {
                        Text(String(localized: "voice.stats.unavailable"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                            .padding(.vertical, WZ.Space.space4)
                    } else {
                        HStack(spacing: WZ.Space.space6) {
                            ping("voice.stats.averagePing", averagePing)
                            ping("voice.stats.lastPing", pings.last)
                        }
                        .padding(.vertical, WZ.Space.space3)
                        Divider()
                        row("voice.stats.server", summary?.server)
                        row("voice.stats.transport", summary?.transport)
                        row("voice.stats.outboundLoss", summary?.outboundLoss.map { String(format: "%.1f%%", $0) })
                        row("voice.stats.inboundLoss", summary?.inboundLoss.map { String(format: "%.1f%%", $0) })
                        row("voice.stats.jitter", summary?.jitter.map { "\($0) ms" })
                        row("voice.stats.sendingAudio", summary?.sendAudio.description)
                        if sendingVideo, let video = summary?.sendVideo {
                            row("voice.stats.sendingVideo", video.description)
                        }
                        row("voice.stats.receiving", summary?.receiveBitrate.map(Self.kbps))
                    }
                }
                .padding(.horizontal, WZ.Space.space6)
                .padding(.vertical, WZ.Space.space3)
            }
            .background(theme.bgSecondary.ignoresSafeArea())
            .navigationTitle(String(localized: "voice.stats.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .task { await poll() }
    }

    private func ping(_ label: String, _ value: Int?) -> some View {
        Text("\(String(localized: String.LocalizationValue(label))) \(value.map { "\($0) ms" } ?? "–")")
            .font(.wizard(WZ.FontSize.md, .semibold))
            .foregroundStyle(theme.textPrimary)
            .monospacedDigit()
    }

    private func row(_ label: String, _ value: String?) -> some View {
        HStack(spacing: WZ.Space.space4) {
            Text(String(localized: String.LocalizationValue(label)))
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textMuted)
            Spacer(minLength: WZ.Space.space4)
            Text(value ?? "–")
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textPrimary)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, WZ.Space.space3)
    }

    private func poll() async {
        var previous: ConnectionStats.Sample?
        while !Task.isCancelled {
            if let sample = await calls.connectionStats() {
                let next = ConnectionStats.summarise(sample, previous: previous)
                previous = sample
                unavailable = false
                summary = next
                if let ping = next.ping { pings = Array((pings + [ping]).suffix(60)) }
            } else {
                unavailable = true
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private static func kbps(_ value: Double) -> String { "\(Int(value.rounded())) kbps" }
}

private extension ConnectionStats.Stream {
    /// `opus · 64 kbps`, or `1280×720 @ 30 · 480 kbps` for a video stream
    var description: String {
        var parts: [String] = []
        if let codec { parts.append(codec) }
        if let resolution {
            if let fps { parts.append("\(resolution) @ \(Int(fps.rounded()))") } else { parts.append(resolution) }
        }
        if let bitrate { parts.append("\(Int(bitrate.rounded())) kbps") }
        return parts.isEmpty ? "–" : parts.joined(separator: " · ")
    }
}
