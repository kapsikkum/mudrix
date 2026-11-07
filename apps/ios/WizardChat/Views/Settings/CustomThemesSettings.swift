import SwiftUI
import UIKit

/// Settings > Appearance > Custom themes: up to 20 themes made from nine colours, shared as the web's JSON
struct CustomThemesSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var editing: EditTarget?
    @State private var showImport = false
    @State private var notice: String?

    /// A theme being edited, and whether it is new (not in the list yet)
    struct EditTarget: Identifiable {
        let theme: CustomTheme
        let isNew: Bool
        var id: String { theme.id }
    }

    private func swatch(_ custom: CustomTheme) -> LinearGradient {
        LinearGradient(
            stops: [.init(color: ThemeDerive.parse(custom.colors.bgSecondary), location: 0.5),
                    .init(color: ThemeDerive.parse(custom.colors.accent), location: 0.5)],
            startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private func isInUse(_ custom: CustomTheme) -> Bool {
        !prefs.followSystemTheme && prefs.theme == custom.themeName
    }

    var body: some View {
        SettingsPage(title: "settings.appearance.customTheme.title") {
            SettingsSection(note: "settings.appearance.customTheme.note") {
                ForEach(prefs.customThemes) { custom in
                    HStack(spacing: WZ.Space.space5) {
                        Circle()
                            .fill(swatch(custom))
                            .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                            .overlay(Circle().stroke(theme.border, lineWidth: 1))
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(verbatim: custom.name)
                                .font(.wizard(WZ.FontSize.lg))
                                .foregroundStyle(theme.textPrimary)
                            if isInUse(custom) {
                                Text("settings.appearance.customTheme.inUse")
                                    .font(.wizard(WZ.FontSize.sm))
                                    .foregroundStyle(theme.textMuted)
                            }
                        }
                        Spacer(minLength: 8)
                        if !isInUse(custom) {
                            Button {
                                use(custom)
                            } label: {
                                Text("settings.appearance.customTheme.use")
                            }
                            .buttonStyle(.borderless)
                        }
                        Button {
                            editing = EditTarget(theme: custom, isNew: false)
                        } label: {
                            Image("ph-pencil-simple-regular")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(String(localized: "settings.appearance.customTheme.edit"))
                    }
                }
                Button {
                    create()
                } label: {
                    Text("settings.appearance.customTheme.create")
                }
                Button {
                    showImport = true
                } label: {
                    Text("settings.appearance.customTheme.import")
                }
            }
            if let notice { StatusText(text: notice, isError: false) }
        }
        .sheet(item: $editing) { target in
            CustomThemeEditor(theme: target.theme, isNew: target.isNew) { message in notice = message }
        }
        .sheet(isPresented: $showImport) {
            ImportThemeSheet()
        }
    }

    private func use(_ custom: CustomTheme) {
        prefs.followSystemTheme = false
        prefs.theme = custom.themeName
    }

    private func create() {
        guard prefs.customThemes.count < CustomThemes.limit else {
            notice = L10n.format("settings.appearance.customTheme.limit", String(CustomThemes.limit))
            return
        }
        let name = L10n.format("settings.appearance.customTheme.newName", String(prefs.customThemes.count + 1))
        let fresh = CustomTheme(id: CustomThemes.newId(), name: name, colors: ThemeSpec.of(theme))
        editing = EditTarget(theme: fresh, isNew: true)
    }
}

private struct CustomThemeEditor: View {
    let isNew: Bool
    let onNotice: (String?) -> Void
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.dismiss) private var dismiss
    @State private var draft: CustomTheme
    @State private var confirmDelete = false

    init(theme: CustomTheme, isNew: Bool, onNotice: @escaping (String?) -> Void) {
        _draft = State(initialValue: theme)
        self.isNew = isNew
        self.onNotice = onNotice
    }

    private var title: LocalizedStringKey {
        isNew ? LocalizedStringKey("settings.appearance.customTheme.create")
              : LocalizedStringKey("settings.appearance.customTheme.edit")
    }

    private func colorLabel(_ key: String) -> LocalizedStringKey {
        LocalizedStringKey("settings.appearance.customTheme." + key)
    }

    private func colorBinding(_ key: String) -> Binding<Color> {
        Binding(
            get: { ThemeDerive.parse(draft.colors[key]) },
            set: { draft.colors[key] = ThemeDerive.hexOf($0) }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: "settings.appearance.customTheme.name"), text: $draft.name)
                }
                Section {
                    ThemePreview(spec: draft.colors)
                        .listRowInsets(EdgeInsets())
                }
                Section {
                    ForEach(ThemeSpec.keys, id: \.self) { key in
                        ColorPicker(selection: colorBinding(key), supportsOpacity: false) {
                            Text(colorLabel(key))
                        }
                    }
                }
                Section {
                    if !isNew {
                        Button {
                            UIPasteboard.general.string = CustomThemes.serialize(draft)
                            onNotice(String(localized: "settings.appearance.customTheme.copied"))
                        } label: {
                            Text("settings.appearance.customTheme.export")
                        }
                        Button(role: .destructive) {
                            confirmDelete = true
                        } label: {
                            Text("settings.appearance.customTheme.delete")
                        }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) { save() }
                        .disabled(CustomThemes.cleanName(draft.name).isEmpty)
                }
            }
            .confirmationDialog(String(localized: "settings.appearance.customTheme.delete"),
                                isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(String(localized: "settings.appearance.customTheme.delete"), role: .destructive) { delete() }
            }
        }
    }

    private func save() {
        var saved = draft
        saved.name = CustomThemes.cleanName(draft.name)
        if let index = prefs.customThemes.firstIndex(where: { $0.id == saved.id }) {
            prefs.customThemes[index] = saved
        } else {
            prefs.customThemes.append(saved)
        }
        dismiss()
    }

    private func delete() {
        let name = draft.themeName
        prefs.customThemes.removeAll { $0.id == draft.id }
        if prefs.theme == name { prefs.theme = Themes.defaultName }
        if prefs.systemDarkTheme == name { prefs.systemDarkTheme = Themes.defaultName }
        if prefs.systemLightTheme == name { prefs.systemLightTheme = Themes.defaultLightName }
        dismiss()
    }
}

/// What a theme looks like: a few messages on its own background
private struct ThemePreview: View {
    let spec: ThemeSpec

    var body: some View {
        let preview = WizardTheme(colors: ThemeDerive.build(spec), isLight: ThemeDerive.isLightColor(spec.bgPrimary))
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(verbatim: "Merlin")
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(preview.accent)
            Text(verbatim: "Abracadabra")
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(preview.textPrimary)
                .padding(WZ.Space.space4)
                .background(preview.msgOtherBg, in: RoundedRectangle(cornerRadius: WZ.Radius.lg))
            HStack {
                Spacer()
                Text(verbatim: "Hocus pocus")
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(preview.textPrimary)
                    .padding(WZ.Space.space4)
                    .background(preview.msgMineBg, in: RoundedRectangle(cornerRadius: WZ.Radius.lg))
            }
            Text(verbatim: "10:42")
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(preview.textMuted)
        }
        .padding(WZ.Space.space5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(preview.bgPrimary)
    }
}

private struct ImportThemeSheet: View {
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .font(.system(.footnote, design: .monospaced))
                        .frame(minHeight: 180)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("settings.appearance.customTheme.importPlaceholder")
                }
                if let error { StatusText(text: error) }
            }
            .navigationTitle("settings.appearance.customTheme.import")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "settings.appearance.customTheme.importConfirm")) { importTheme() }
                        .disabled(text.isEmpty)
                }
            }
        }
    }

    private func importTheme() {
        guard let parsed = CustomThemes.parseShared(text) else {
            error = String(localized: "settings.appearance.customTheme.importInvalid")
            return
        }
        guard prefs.customThemes.count < CustomThemes.limit else {
            error = L10n.format("settings.appearance.customTheme.limit", String(CustomThemes.limit))
            return
        }
        prefs.customThemes.append(CustomTheme(id: CustomThemes.newId(), name: parsed.name, colors: parsed.colors))
        dismiss()
    }
}
