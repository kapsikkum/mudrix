import SwiftUI

/// The DM screen's order, sections and pins. Every change is saved to account data immediately
/// and takes effect behind the sheet, so the list is already right when it closes.
struct RoomListSortSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var options: RoomListOptions
    private let onChange: (RoomListOptions) -> Void

    init(options: RoomListOptions, onChange: @escaping (RoomListOptions) -> Void) {
        _options = State(initialValue: options)
        self.onChange = onChange
    }

    private func label(_ mode: RoomSortMode) -> String {
        switch mode {
        case .recent: String(localized: "roomList.sortRecent")
        case .newest: String(localized: "roomList.sortNewest")
        case .oldest: String(localized: "roomList.sortOldest")
        case .categorised: String(localized: "roomList.sortCategorised")
        }
    }

    private func apply(_ change: (inout RoomListOptions) -> Void) {
        var next = options
        change(&next)
        options = next
        onChange(next)
    }

    private func toggle(_ keyPath: WritableKeyPath<RoomListOptions, Bool>) -> Binding<Bool> {
        Binding(
            get: { options[keyPath: keyPath] },
            set: { value in apply { $0[keyPath: keyPath] = value } }
        )
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(RoomSortMode.allCases, id: \.self) { mode in
                        Button {
                            apply { $0.sort = mode }
                        } label: {
                            HStack {
                                Text(label(mode))
                                    .foregroundStyle(theme.textPrimary)
                                Spacer()
                                if options.sort == mode {
                                    Image("ph-check-bold")
                                        .font(.system(size: WZ.SizeIcon.sm))
                                        .foregroundStyle(theme.accent)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                Section {
                    Toggle(String(localized: "roomList.separateRoomsAndDms"),
                           isOn: toggle(\.separateRoomsAndDms))
                        .tint(theme.accent)
                    Toggle(String(localized: "roomList.favouritesSection"),
                           isOn: toggle(\.favouritesSection))
                        .tint(theme.accent)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.bgPrimary)
            .navigationTitle(String(localized: "roomList.sortTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
