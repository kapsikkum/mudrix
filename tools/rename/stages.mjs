// Rename stages for tools/rename/rename.mjs. Each stage must build and pass CI on its own.
const SELF = ['tools/rename/'];

export const stages = {
  // A: npm packages, Rust crates and the native library name (code identities, nothing stored)
  a: {
    skip: SELF,
    replace: [
      ['@wizardchat/', '@mudrix/'],
      ['wizardchat-core-wasm', 'mudrix-core-wasm'],
      ['wizardchat-core-ffi', 'mudrix-core-ffi'],
      ['wizardchat_core_ffi', 'mudrix_core_ffi'],
      ['wizardchat-core', 'mudrix-core'],
      ['wizardchat_core', 'mudrix_core'],
      ['wizardchat-desktop', 'mudrix-desktop'],
      ['wizardchat_desktop', 'mudrix_desktop'],
      [/("name":\s*)"wizardchat"/g, '$1"mudrix"'],
    ],
  },

  // C: build identities: Kotlin packages, design-token package, iOS folders/targets/scheme, theme and
  // i18n key names. Persisted literals (keystore alias org.wizardchat.session, the OAuth scheme
  // "org.wizardchat", the org.wizardchat.* data namespace) are deliberately not matched.
  c: {
    skip: [...SELF, 'docs/', 'README.md', 'tools/ci/branding-allow.txt'],
    replace: [
      ['kotlin/org/wizardchat/', 'kotlin/chat/mudrix/'],
      ['org/wizardchat/android', 'chat/mudrix/android'],
      ['org/wizardchat/core', 'chat/mudrix/core'],
      ['org.wizardchat.android', 'chat.mudrix.android'],
      ['org.wizardchat.core', 'chat.mudrix.core'],
      ['org.wizardchat.tokens', 'chat.mudrix.tokens'],
      ['org.wizardchat.call.', 'chat.mudrix.call.'],
      ['org.wizardchat.screen-share', 'chat.mudrix.screen-share'],
      ['org.wizardchat.desktop', 'chat.mudrix.desktop'],
      ['org.wizardchat.theme', 'chat.mudrix.theme'],
      ['Theme.WizardChat', 'Theme.Mudrix'],
      ['rootProject.name = "WizardChat"', 'rootProject.name = "Mudrix"'],
      ['wizardchatVoiceInCall', 'mudrixVoiceInCall'],
      ['wizardchatCall', 'mudrixCall'],
      ['WizardChatTokens', 'MudrixTokens'],
      ['WizardChatCore', 'MudrixCore'],
      ['WizardChatTests', 'MudrixTests'],
      ['WizardChatWidgets', 'MudrixWidgets'],
      ['WizardChatShare', 'MudrixShare'],
      ['WizardChatApp', 'MudrixApp'],
      ['WizardChat-Push', 'Mudrix-Push'],
      ['WizardChat.entitlements', 'Mudrix.entitlements'],
      ['WizardChat.xcodeproj', 'Mudrix.xcodeproj'],
      ['@testable import WizardChat', '@testable import Mudrix'],
    ],
    move: [
      ['kotlin/org/wizardchat/', 'kotlin/chat/mudrix/'],
      ['apps/ios/WizardChatCore/', 'apps/ios/MudrixCore/'],
      ['Sources/WizardChatCore/', 'Sources/MudrixCore/'],
      ['apps/ios/WizardChatTests/', 'apps/ios/MudrixTests/'],
      ['apps/ios/WizardChatWidgets/', 'apps/ios/MudrixWidgets/'],
      ['apps/ios/WizardChatShare/', 'apps/ios/MudrixShare/'],
      ['MudrixShare/WizardChatShare.entitlements', 'MudrixShare/MudrixShare.entitlements'],
      ['apps/ios/WizardChat/', 'apps/ios/Mudrix/'],
      ['Mudrix/WizardChat.entitlements', 'Mudrix/Mudrix.entitlements'],
      ['Mudrix/WizardChat-Push.entitlements', 'Mudrix/Mudrix-Push.entitlements'],
      ['Mudrix/WizardChatApp.swift', 'Mudrix/MudrixApp.swift'],
    ],
  },

  // C2: the bare app/target/scheme name in iOS build config, scripts and CI
  c2: {
    paths: [
      'apps/ios/project.yml',
      'apps/ios/Config/',
      'apps/ios/scripts/',
      '.github/workflows/ios.yml',
      'package.json',
      '.gitignore',
    ],
    replace: [[/WizardChat/g, 'Mudrix']],
  },
};
