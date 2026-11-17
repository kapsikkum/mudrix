import SwiftUI
import UIKit

/// Name, colour (`#rrggbb`, empty for the default) and, for your own roles, "show separately", order and delete
struct RoleEditSheet: View {
    let title: String
    let initialName: String
    let initialColor: String
    let namePlaceholder: String
    let hoist: Bool?
    let canMoveUp: Bool
    let canMoveDown: Bool
    let canReset: Bool
    let canDelete: Bool
    let onSave: (_ name: String, _ color: String?, _ hoist: Bool?) -> Void
    let onMove: (Int) -> Void
    let onDelete: () -> Void
    let onReset: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name = ""
    @State private var color = ""
    @State private var separate = false
    @State private var ready = false

    private var validColor: Bool { color.isEmpty || SpaceModern.isValidRoleColor(color) }

    private var pickerColor: Binding<Color> {
        Binding(
            get: { Color(hex: SpaceModern.isValidRoleColor(color) ? color : "#808080") },
            set: { color = Self.hex($0) }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(namePlaceholder, text: $name)
                }
                Section {
                    HStack(spacing: WZ.Space.space5) {
                        TextField("#rrggbb", text: $color)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(.body, design: .monospaced))
                            .onChange(of: color) { _, value in
                                let trimmed = value.trimmingCharacters(in: .whitespaces)
                                if trimmed != value { color = trimmed }
                            }
                        ColorPicker("", selection: pickerColor, supportsOpacity: false).labelsHidden()
                    }
                    if !validColor {
                        Text(String(localized: "room.settings.roles.color")).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                    }
                }
                if hoist != nil {
                    Section { Toggle(String(localized: "room.settings.roles.separate"), isOn: $separate) }
                }
                if canMoveUp || canMoveDown || canReset || canDelete {
                    Section {
                        if canMoveUp {
                            Button { onMove(-1); dismiss() } label: {
                                Label(String(localized: "room.settings.roles.moveUp"), systemImage: "chevron.up")
                            }
                        }
                        if canMoveDown {
                            Button { onMove(1); dismiss() } label: {
                                Label(String(localized: "room.settings.roles.moveDown"), systemImage: "chevron.down")
                            }
                        }
                        if canReset {
                            Button { onReset(); dismiss() } label: {
                                Label(String(localized: "room.settings.roles.reset"), systemImage: "arrow.uturn.backward")
                            }
                        }
                        if canDelete {
                            Button(role: .destructive) { onDelete(); dismiss() } label: {
                                Label(String(localized: "room.settings.roles.delete"), systemImage: "trash")
                            }
                        }
                    }
                }
            }
            .tint(theme.control)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) {
                        let chosen = color.isEmpty ? nil : color.lowercased()
                        onSave(name, chosen, hoist == nil ? nil : separate)
                        dismiss()
                    }
                    .disabled(!validColor)
                }
            }
        }
        .onAppear {
            guard !ready else { return }
            ready = true
            name = initialName
            color = initialColor
            separate = hoist == true
        }
    }

    /// `#rrggbb` of a colour
    static func hex(_ color: Color) -> String {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        func part(_ value: CGFloat) -> Int { max(0, min(255, Int((value * 255).rounded()))) }
        return String(format: "#%02x%02x%02x", part(red), part(green), part(blue))
    }
}
