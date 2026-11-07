import SwiftUI

/// A timeline row: one entry, or a folded run of unreadable messages
enum TimelineItem: Identifiable {
    /// `collapsible` marks the first message of an expanded run, which gets a "Collapse" button
    case single(ChatEntry, collapsible: Bool)
    case fold([ChatEntry])

    var id: String {
        switch self {
        case .single(let entry, _): return entry.id
        case .fold(let entries): return "fold-" + (entries.first?.id ?? "")
        }
    }

    /// `entries` (oldest first) with runs of `UndecryptableRuns.threshold` or more unreadable messages
    /// folded into one row, unless `expanded`
    static func folding(_ entries: [ChatEntry], expanded: Bool) -> [TimelineItem] {
        let runs = UndecryptableRuns.compute(entries.map { entry in
            if case .undecryptable = entry.kind { return true }
            return false
        })
        var result: [TimelineItem] = []
        result.reserveCapacity(entries.count)
        var index = 0
        while index < entries.count {
            if let run = runs[index], run.count >= UndecryptableRuns.threshold {
                if expanded {
                    result.append(.single(entries[index], collapsible: run.isFirst))
                    index += 1
                } else {
                    result.append(.fold(Array(entries[index..<(index + run.count)])))
                    index += run.count
                }
            } else {
                result.append(.single(entries[index], collapsible: false))
                index += 1
            }
        }
        return result
    }
}

/// Why a message cannot be read here and what can be done; shown by "How to fix"
struct UndecryptableHelp: View {
    let reason: String?

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var showVerify = false

    var body: some View {
        let kind = UndecryptableRuns.helpKind(reason: reason, sessionVerified: session.encryption?.deviceVerified != false)
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(NSLocalizedString("timeline.undecryptable.help.\(kind.rawValue)", comment: ""))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            if kind == .unverified {
                Button(String(localized: "timeline.undecryptable.verifySession")) { showVerify = true }
                    .buttonStyle(PrimaryButtonStyle())
            }
        }
        .sheet(isPresented: $showVerify) {
            NavigationStack {
                SessionsSettings()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { showVerify = false } }
                    }
            }
        }
    }
}

/// A small text button with a caret for "How to fix"
struct HowToFixButton: View {
    let isOpen: Bool
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            HStack(spacing: WZ.Space.space2) {
                Image("ph-caret-down-regular")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
                Text(String(localized: "timeline.undecryptable.howToFix"))
                    .font(.wizard(WZ.FontSize.sm, .medium))
            }
            .foregroundStyle(theme.accent)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
    }
}

/// "How to fix" with its explanation opening below, for one unreadable message
struct UndecryptableHowToFix: View {
    let reason: String
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            HowToFixButton(isOpen: open) { open.toggle() }
            if open { UndecryptableHelp(reason: reason) }
        }
    }
}

/// Stands in for a run of unreadable messages: one row that says how many, and how to fix it
struct UndecryptableFoldRow: View {
    let entries: [ChatEntry]
    let onShow: () -> Void
    @Environment(\.theme) private var theme
    @State private var help = false

    private var reason: String? {
        if let first = entries.first, case .undecryptable(let why) = first.kind { return why }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            HStack(spacing: WZ.Space.space3) {
                Image("ph-lock-regular")
                    .font(.system(size: WZ.SizeIcon.sm))
                    .foregroundStyle(theme.textMuted)
                Text(L10n.format("timeline.undecryptable.group", entries.count))
                    .font(.wizard(WZ.FontSize.md, .medium))
                    .foregroundStyle(theme.textPrimary)
                Spacer(minLength: 0)
            }
            HStack(spacing: WZ.Space.space5) {
                HowToFixButton(isOpen: help) { help.toggle() }
                Button(action: onShow) {
                    Text(String(localized: "timeline.undecryptable.showAll"))
                        .font(.wizard(WZ.FontSize.sm, .medium))
                        .foregroundStyle(theme.accent)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if help { UndecryptableHelp(reason: reason) }
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .padding(.horizontal, WZ.Space.space6)
        .padding(.vertical, WZ.Space.space3)
    }
}

/// "Collapse" after the first message of an expanded run
struct UndecryptableCollapseRow: View {
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            Text(String(localized: "timeline.undecryptable.collapse"))
                .font(.wizard(WZ.FontSize.sm, .medium))
                .foregroundStyle(theme.accent)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.leading, WZ.Space.space6 + WZ.SizeAvatar.md + WZ.Space.space5)
    }
}
