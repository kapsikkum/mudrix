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

  // B: local names on web, desktop, the core and tools. Stored upstream values stay readable; their
  // literals live in apps/web/src/util/namespace.ts and the allow-listed lines.
  b: {
    paths: [
      'apps/web/src/',
      'apps/web/tests/',
      'apps/desktop/',
      'crates/',
      'tools/parity/',
      'tools/test-server/',
    ],
    skip: ['apps/web/src/util/namespace.ts'],
    replace: [
      ['wizardchatKey', 'upstreamKey'],
      [/WIZARDCHAT_(?!LOG|URL)/g, 'UPSTREAM_'],
      ['wizardchatSynced', 'upstreamSynced'],
      ['wizardchat:state', 'mudrix:state'],
      ['wizardchat-sign-in', 'mudrix-sign-in'],
      ['wizardchat-gain', 'mudrix-gain'],
      ['[wizardchat-call]', '[mudrix-call]'],
      ['[wizardchat]', '[mudrix]'],
      ['wizardchat-auth-callback', 'mudrix-auth-callback'],
      ["'wizardchat-auth'", "'mudrix-auth'"],
      ["'org.wizardchat.mobile'", "'chat.mudrix.mobile'"],
      ["nativePromise<T>('WizardChat'", "nativePromise<T>('Mudrix'"],
      ['wizardchatNativeBack', 'mudrixNativeBack'],
      ['WIZARDCHAT_LOG', 'MUDRIX_LOG'],
      ['wizardchat-account-', 'mudrix-account-'],
      ['"wizardchat-{example}', '"mudrix-{example}'],
      ['wizardchat-rpc-', 'mudrix-rpc-'],
      ["'wizardchat-session-'", "'mudrix-session-'"],
      ["'wizardchat.accounts'", "'mudrix.accounts'"],
      ['wizardchat_accounts', 'mudrix_accounts'],
      ['.app_name("WizardChat")', '.app_name("Mudrix")'],
      ['"WizardChatScreenShareOutput"', '"MudrixScreenShareOutput"'],
      ['`wizardchat-${version}-linux-x86_64.tar.gz`', '`mudrix-${version}-linux-x86_64.tar.gz`'],
      ['packaging/aur/wizardchat-bin/', 'packaging/aur/mudrix-bin/'],
      ["clientPack('wizardchat', 'WizardChat',", "clientPack('wizardchat', 'Original',"],
      ['The WizardChat base', 'The upstream base'],
      ['the WizardChat base', 'the upstream base'],
      ["only (maybe) WizardChat's copy", "only (maybe) the upstream base's copy"],
      ["(as opposed to only WizardChat's)", "(as opposed to only the upstream base's)"],
      ["The older WizardChat web app's event.", "The upstream base's older web app event."],
      ['message sound of the WizardChat pack', 'message sound of the Original pack'],
      ['The WizardChat style contract', 'The style contract'],
      ["//! WizardChat's client core.", "//! Mudrix's client core."],
      ['Everything a WizardChat app needs', 'Everything a Mudrix app needs'],
      [
        'Where earlier Mudrix versions and WizardChat kept it',
        'Where earlier Mudrix versions and the upstream base kept it',
      ],
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
