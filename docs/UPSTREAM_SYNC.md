# Upstream sync report

Branch `sync/upstream` (from `port/mudrix` f6d6e1c) merged with `upstream/main`.

- Upstream range: `017f700` (previous merge base) .. `2190243` (`upstream/main`, v26.12.2), about 45 commits.
- Method: a real `git merge upstream/main` (one merge commit plus follow-up fix commits). No cherry-picks.
- Policy: upstream wins for fixes, core/Rust logic, CI and build scripts. Mudrix wins for names and copy, app ids, data namespace, updater URL, logos, 29 themes, 11 languages and every feature marked done in `docs/PORT.md`. Where both sides added a feature, both were kept.
- Native code (Android/iOS) was **not built** (no Gradle, no Xcode). See "Needs a build".

## Upstream changes taken

### Features

- Voice & Video settings tab (web, Android, iOS) with per-sound toggles.
- Settings search (web).
- Room-state explorer and Developer tab in room settings.
- "Get the apps" dialog (rewritten to read Mudrix GitHub releases).
- Lists and headings in the composer, backed by the rich-text core (`crates/core/src/rich_text.rs`).
- `#` room/space mentions, caption editing.
- What's New restyle.
- System-wide keybinds (mute, deafen, screen share) and a screen-share shortcut on desktop; keep-awake during calls.
- Encryption setup on first sign-in with a recovery key.
- Call history rows in the timeline.
- Android push via Firebase (gplay / fdroid flavours).
- Mobile voice/video settings, push-to-talk, CallKit.
- Mobile polish: colour usernames on mobile, full-screen session verification, account-switcher avatars.

### Fixes

- Avatar resolution; added-account startup.
- Windows screen-share loopback crash.
- Media key refresh after reconnect.
- Android: WebRTC loaded before E2EE; media decoded as blobs.
- iOS build number.
- Large i18n key cleanup (447 keys renamed or removed, mapped in code).

### CI / docs

- Signed Android APK in release CI.
- `CONTRIBUTING.md` and `docs/CODEBASE.md` split out of the README.
- Store screenshots (fastlane).

## Conflicted files

86 files were unmerged in the live merge (about 270 hunks). A `git merge-tree` re-simulation lists 91 paths. Resolution tags: **both** = both sides kept, **ours** = Mudrix side, **theirs** = upstream, **regen** = regenerated.

Generated: `apps/web/src/core/rpc/api.gen.ts`, `Api.gen.kt`, `Api.gen.swift` -> **regen** (taken theirs, then regenerated with the typegen example, so Mudrix RPC additions are kept; `api.gen.ts` formatted with prettier).

Web (resolved and fully checked):

- `package.json`: theirs version 26.12.2, ours description.
- `desktopApi.ts`: **both** (our `saveDownload`, settings, unread, fullscreen plus their `setGlobalKey`/`onGlobalKey`/`setKeepAwake`; old push-to-talk bridge removed).
- `useKeybinds.ts`, `shortcuts.ts`: **both**. Actions are toggleMute, toggleDeafen, toggleVideo, disconnect, toggleScreenShare; mute/deafen/screenshare also go through OS hotkeys.
- `Settings.tsx`: **both** (their search plus our sub-sections).
- `RoomSettings.tsx`: **both** (their Developer tab plus our Audit tab). `SpaceSettings.tsx`: **both**, Tab = SpaceSettingsTab | channels | roles | audit.
- `roomsettings/General.tsx`, `spacesettings/General.tsx`: **both** (their DM avatar reset in our identity form).
- `voiceSounds.ts`: **both** (our sound map plus their `VOICE_SOUND_TOGGLES`; new `isVoiceSoundEnabled` checked by `util/notificationSounds.ts`).
- `RoomListPanel.tsx`, `ChatListItem.tsx`, `RoomListItem.tsx`: **both**. Upstream voice list is now `room.callParticipants` (`useCallMemberships.ts` was deleted upstream); our drag-to-move (`canMoveVoiceUsers`) and call timer were re-applied. `VoiceJoinSheet.tsx` rewritten to the same model.
- `CallBar.tsx`, `CallControlBar.tsx`: **ours** (reactions rail). `CallStage.tsx`: **both** (their `participantInfo` and connecting spinner, our tiles; new `connected` prop on `TileAvatar`).
- `WhatsNewModal.tsx`: **theirs** restyle with Mudrix GitHub links; the Matrix-room social link was dropped.
- `About.tsx`: **ours**, with `viewSourceOnGitHub` key.
- `LoginForm.tsx`, `RegisterForm.tsx`, `ResetPasswordForm.tsx`, `WelcomePage.tsx`, `WelcomePage.css.ts`, `ClientLayout.tsx`: **both** (their behaviour, our branding and copy).
- `Composer.tsx`, `content.tsx`, `useAutocomplete.ts`: **both**.
- `MediaLightbox.tsx`, `UserProfilePopup.tsx`, `DeviceCard.tsx`, `store/atoms/settings.ts`: **both**.
- `packages/i18n/locales/en.json`, `de.json`: key-level 3-way merge (see below). `packages/icons/src/icons.json`: **both**.
- `README.md`: **ours** with upstream's doc-location links. `docs/BUILDING.md`: **ours** plus their gplay/fdroid flavour paragraph.
- `crates/core/src/lib.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/Cargo.toml`: **theirs** logic with our additions kept.
- `apps/android/scripts/build-core.sh`: **ours** (OS-specific library picker).

Android (unverified, needs a build): `app/build.gradle.kts`, `gradle/libs.versions.toml`, `matrix/CallManager`, `MatrixSession`, `MediaLoader`, `MessageNotifier`, `Preferences`, `TimelineModel`, `rtc/CallSounds`, `ui/Components`, `composer/ComposerView`, `home/InboxSheet`, `home/RoomListScreen`, `login/LoginScreen`, `people/MembersUi`, `room/MessageContent`, `room/MessageText`, `room/RoomScreen`, `settings/GeneralSettings`, `SessionsSettings`, `SettingsUi`, `WhatsNew`, `theme/Theme`, `voice/VoiceUi`.

- `CallManager`: their ring/incoming logic (`incomingClient`, `ringEnded`, `missedCall`) and push-to-talk, plus our soundboard and `Sounds.*`.
- `Preferences`: our codec system, plus `colorUsernames`.
- `RoomScreen`: ours (folds, `HighlightBox`, integrations) plus their `CallRow`, `openRoomLink`, mentions, `allowsActions`.
- `MembersUi`, `InboxSheet`, `LoginScreen`, `TimelineModel`: **ours**.
- `MediaLoader`: their standard thumbnail sizes plus our `maxSide`. `MessageNotifier`: **ours** (streamer mode) with their silent and only-alert-once flags.

iOS (unverified, needs a build): `project.yml`, `Info.plist`, `Matrix/CallManager`, `MatrixSession`, `MessageNotifier`, `Preferences`, `RoomListModel`, `RTC/CallSounds`, `RTC/Sounds` (non-conflicting but edited), `RTC/WatchTogether`, `Composer/ComposerView`, `Home/RoomListScreen`, `InboxView`, `LoginView`, `Messages/MessageContentViews`, `People/PeopleViews`, `RoomView`, `Settings/EncryptionSettings`, `GeneralSettings`, `NotificationSettingsPage`, `SettingsView`, `WhatsNewSheet`, `Theme`, `Voice/VoiceRoomView`, `WizardChatApp`.

- `project.yml`: **both**. Their removal of BGTaskScheduler and the `voip`/`fetch` background modes was taken; our URL scheme, 11 localizations and `chat.mudrix.mobile` kept; `ITSAppUsesNonExemptEncryption: false` added.
- `EncryptionSettings`: **theirs** (new `EncryptionSetupPrompts`). `VoiceRoomView` title: **theirs**. `Theme`: **ours**.
- `PeopleViews`: `RoleBadge(level:)` plus our `ProfileBadges`/`ProfileAboutView`.
- `WizardChatApp`: theirs plus our `SavedMessages`/`Reminders` start.

Full list of the 91 paths from the re-simulation:

```apps/android/app/build.gradle.kts
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/CallManager.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/MatrixSession.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/MediaLoader.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/MessageNotifier.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/Preferences.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/rtc/CallSounds.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/matrix/TimelineModel.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/Components.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/composer/ComposerView.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/home/InboxSheet.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/home/RoomListScreen.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/login/LoginScreen.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/people/MembersUi.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/room/MessageContent.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/room/MessageText.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/room/RoomScreen.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/settings/GeneralSettings.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/settings/SessionsSettings.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/settings/SettingsUi.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/settings/WhatsNew.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/theme/Theme.kt
apps/android/app/src/main/kotlin/org/wizardchat/android/ui/voice/VoiceUi.kt
apps/android/core/src/main/kotlin/org/wizardchat/core/Api.gen.kt
apps/android/gradle/libs.versions.toml
apps/android/scripts/build-core.sh
apps/desktop/src-tauri/Cargo.toml
apps/desktop/src-tauri/src/lib.rs
apps/ios/project.yml
apps/ios/WizardChat/Info.plist
apps/ios/WizardChat/Matrix/CallManager.swift
apps/ios/WizardChat/Matrix/MatrixSession.swift
apps/ios/WizardChat/Matrix/MessageNotifier.swift
apps/ios/WizardChat/Matrix/Preferences.swift
apps/ios/WizardChat/Matrix/RoomListModel.swift
apps/ios/WizardChat/Matrix/RTC/CallSounds.swift
apps/ios/WizardChat/Matrix/RTC/WatchTogether.swift
apps/ios/WizardChat/Views/Composer/ComposerView.swift
apps/ios/WizardChat/Views/Home/RoomListScreen.swift
apps/ios/WizardChat/Views/InboxView.swift
apps/ios/WizardChat/Views/LoginView.swift
apps/ios/WizardChat/Views/Messages/MessageContentViews.swift
apps/ios/WizardChat/Views/People/PeopleViews.swift
apps/ios/WizardChat/Views/RoomView.swift
apps/ios/WizardChat/Views/Settings/EncryptionSettings.swift
apps/ios/WizardChat/Views/Settings/GeneralSettings.swift
apps/ios/WizardChat/Views/Settings/NotificationSettingsPage.swift
apps/ios/WizardChat/Views/Settings/SettingsView.swift
apps/ios/WizardChat/Views/Settings/WhatsNewSheet.swift
apps/ios/WizardChat/Views/Theme.swift
apps/ios/WizardChat/Views/Voice/VoiceRoomView.swift
apps/ios/WizardChat/WizardChatApp.swift
apps/ios/WizardChatCore/Sources/WizardChatCore/Api.gen.swift
apps/web/src/app/components/MediaLightbox/MediaLightbox.tsx
apps/web/src/app/features/calls/CallBar.tsx
apps/web/src/app/features/calls/CallControlBar.tsx
apps/web/src/app/features/calls/stage/CallStage.tsx
apps/web/src/app/features/keyboardShortcuts/shortcuts.ts
apps/web/src/app/features/profile/UserProfilePopup.tsx
apps/web/src/app/features/room/roomsettings/General.tsx
apps/web/src/app/features/room/roomsettings/RoomSettings.tsx
apps/web/src/app/features/settings/about/About.tsx
apps/web/src/app/features/settings/sessions/DeviceCard.tsx
apps/web/src/app/features/settings/Settings.tsx
apps/web/src/app/features/space/spacesettings/General.tsx
apps/web/src/app/features/space/spacesettings/SpaceSettings.tsx
apps/web/src/app/features/timeline/composer/Composer.tsx
apps/web/src/app/features/timeline/message/content.tsx
apps/web/src/app/features/timeline/useAutocomplete.ts
apps/web/src/app/features/voice/voiceSounds.ts
apps/web/src/app/features/whatsNew/WhatsNewModal.tsx
apps/web/src/app/hooks/useKeybinds.ts
apps/web/src/app/pages/auth/LoginForm.tsx
apps/web/src/app/pages/auth/RegisterForm.tsx
apps/web/src/app/pages/auth/ResetPasswordForm.tsx
apps/web/src/app/pages/auth/WelcomePage.css.ts
apps/web/src/app/pages/auth/WelcomePage.tsx
apps/web/src/app/pages/client/ChatListItem.tsx
apps/web/src/app/pages/client/ClientLayout.tsx
apps/web/src/app/pages/client/RoomListItem.tsx
apps/web/src/app/pages/client/RoomListPanel.tsx
apps/web/src/app/store/atoms/settings.ts
apps/web/src/bridge/desktopApi.ts
apps/web/src/core/rpc/api.gen.ts
crates/core/src/lib.rs
docs/BUILDING.md
package.json
packages/i18n/locales/de.json
packages/i18n/locales/en.json
packages/icons/src/icons.json
README.md
```

## Regressions and Mudrix features knowingly broken or dropped

- **Push is not functional for Mudrix on Android.** The gplay flavour ships upstream's Firebase project (`wizardchat-66016` in `src/gplay/res/values/firebase.xml`) and the gateway `https://push.wizardchat.org/_matrix/push/v1/notify` (`push/Push.kt`). Neither matches `chat.mudrix.mobile`. A Mudrix Firebase project and push gateway are needed.
- Two voice settings tabs now exist side by side on web, Android and iOS: our "Voice & Audio" (`voice`) and their `voice-video`. They should be unified.
- iOS `EncryptionSettings` lost our streamer-mode hiding of the recovery key.
- iOS voice-room navigation title lost the call timer (it is still in the mini bar).
- Android `MembersUi`: upstream restyle not taken (ours kept).
- Android and iOS inbox keep our 4 tabs rather than upstream's `Tabs` component.
- About (iOS/Android): the download-for-desktop button was dropped; the iOS privacy-policy link was dropped (Mudrix has no privacy page).
- Web settings-search index (`searchIndex.ts`) has no entries for Mudrix-only tabs.
- Android `TimelineModel` upload flow is ours; upstream's `uploadFile`/`sendUploaded` flow is not integrated.
- Android plain-text path: the compact-layout name/time prefix was not re-added.
- Android `Preferences` lacks upstream's `synced=true` mechanism (replaced by our codec).
- Web `roomsettings/General.tsx` keeps our dev-mode room-ID section, which duplicates upstream's Developer tab.
- What's New: the Matrix-room social link was dropped; the native What's New has a single GitHub social.
- Get the apps: web card removed; iOS card says sideload. Removed i18n keys: appleSilicon, intel, arch, tarball, beta, joinBeta, comingSoon, web, webNote, openWeb.
- Fixed an existing bug: `settings.about.viewSourceOnGitHub` carried stale GitLab text.
- `npm run core:types` script uses `> /dev/null`, which fails on Windows; the two steps were run by hand.

## i18n

- Merged key by key (3-way against the old base). Global "WizardChat" -> "Mudrix" in all 11 locale values. Code references to the 447 renamed or deleted upstream keys were rewritten (web, Android, iOS) using a generated key map.
- `npm run i18n`: 2217 keys in de, en, es, fr, it, ja, nl, pl, pt, ru, tr, all languages complete.
- German has real translations. **es, fr, it, ja, nl, pl, pt, ru, tr carry English placeholders** for the keys below (475 keys each), plus the `getApps` keys `sideload`, `androidNote`, `iosNote` (German translated them).

Keys awaiting translation in the 9 extra languages:

```common.saveToPhotos
common.savedToPhotos
common.newDm
common.noResults
common.joinFailed
common.reloadNow
common.continueWithSso
common.passwordMismatch
common.reasonOptional
common.rename
common.moreOptions
common.download
common.fullscreen
common.exitFullscreen
common.verified
common.name
auth.tagline
auth.sourceCode
auth.poweredByMatrix
auth.login
auth.register
auth.confirmPassword
auth.registerSubmit
auth.noAccount
auth.haveAccount
auth.continueWithIdp
auth.noLoginMethod
auth.customServer
auth.serverUrl
auth.loggingIn
auth.registering
auth.passwordRequirements.title
auth.passwordRequirements.length
auth.passwordRequirements.uppercase
auth.passwordRequirements.lowercase
auth.passwordRequirements.number
auth.passwordRequirements.special
auth.oidcLogin
auth.oidcRegister
auth.oidcLoginFailed
auth.redirecting
auth.backToLogin
auth.fillAllFields
auth.usernameTaken
auth.invalidUsername
auth.usernameReserved
auth.registrationFailed
auth.additionalVerification
auth.registrationUnavailable
auth.registrationRateLimited
auth.serverUnreachable
auth.notMatrixServer
auth.checkingServer
auth.forgotPassword
auth.resetTitle
auth.resetEmailPrompt
auth.emailPlaceholder
auth.emailRequired
auth.resetSendCode
auth.sending
auth.resetLinkSent
auth.resetCheckEmail
auth.resetComplete
auth.resetting
auth.resetClickLinkFirst
auth.resetSuccess
auth.resetDelegatedInfo
auth.resetOpenAccountPortal
auth.resetNotSupported
auth.usernameHint
auth.usernameChecking
auth.usernameAvailable
auth.usernameInvalidChars
auth.passwordTooShort
auth.passwordStrength.weak
auth.passwordStrength.okay
auth.passwordStrength.strong
auth.weakPassword
auth.qr.linkTitle
auth.qr.signInTitle
auth.qr.qrLabel
auth.qr.linkStep1
auth.qr.linkStep2
auth.qr.linkStep3
auth.qr.signInStep1
auth.qr.signInStep2
auth.qr.signInStep3
auth.qr.enterCode
auth.qr.codeMismatch
auth.qr.showCode
auth.qr.waitingForApproval
auth.qr.approveInBrowser
auth.qr.openApproval
auth.qr.linkDone
auth.qr.failCancelled
auth.qr.failExpired
auth.qr.failInsecure
auth.qr.failUnsupported
auth.qr.failAlreadySignedIn
auth.qr.failGeneric
auth.qr.cameraDenied
auth.qr.scanIntroTitle
auth.qr.scanIntroNote
auth.qr.scanStep1
auth.qr.scanStep2
auth.qr.scanStep3
auth.qr.scanStep4
auth.qr.readyToScan
auth.qr.scanTitle
auth.qr.showQrInstead
auth.qr.scanQrInstead
auth.qr.showApprovalCode
nav.reorderFailed
nav.title
nav.home
nav.rooms
nav.favourites
nav.noRooms
nav.noDms
nav.activeNow
nav.activeNowEmpty
nav.morePeople_one
nav.morePeople_other
nav.noMatches
nav.markAsUnread
nav.searchPlaceholder
nav.new
nav.noDirectMessagesYet
nav.noRoomsHereYet
nav.createOrJoin
nav.reorderRooms
nav.dms
nav.spaces
nav.you
nav.newRoom
room.members.owner
room.members.invited
room.members.invite
room.members.admins
room.members.moderators
room.members.ignoreHint
room.members.removeConfirm
room.members.ignoreConfirm
room.members.searchHint
room.members.noOneFound
room.members.changeRole
room.members.selfDemoteWarning
room.members.equalLevelWarning
room.members.selfDemoteTitle
room.members.equalLevelTitle
room.members.customLevel
room.members.noAdminsOrModerators
room.members.changeRoleHint
room.members.everyone
room.create.accessStandardNote
room.create.accessInviteNote
room.create.type
room.create.accessPublicNote
room.create.topicOptional
room.settings.general.resetAvatar
room.settings.widgets.url
room.settings.widgets.urlHint
room.settings.widgets.addedBy
room.settings.widgets.untitled
room.settings.widgets.privacy
room.settings.emojis.packsHint
room.settings.emojis.empty
room.settings.emojis.roomPack
room.settings.emojis.pack
room.settings.emojis.useAsEmoji
room.settings.emojis.useAsStickers
room.settings.emojis.imageActionsHint
room.settings.permissions.removePeople
room.settings.permissions.banPeople
room.settings.permissions.deleteOthersMessages
room.settings.permissions.changeName
room.settings.permissions.changePicture
room.settings.permissions.sectionTitle
room.settings.permissions.editHint
room.dm.resetAvatarConfirm
room.notifications.default
room.notifications.all
room.notifications.mentions
room.notifications.mute
room.info.leaveConfirm
room.info.copyLink
room.info.leaveConversation
room.info.conversation
room.info.title
room.info.changePicture
developer.title
developer.roomState.title
developer.roomState.filter
developer.roomState.empty
developer.roomState.emptyKey
developer.roomState.stateEvent
developer.roomState.stateEventNote
developer.roomState.timelineEventNote
developer.roomState.sendEvent
developer.roomState.stateKey
developer.roomState.sent
developer.roomState.sendFailed
developer.roomState.loadFailed
developer.typeCount_one
developer.typeCount_other
developer.eventType
developer.content
developer.notObject
developer.enable
developer.enableDescription
developer.accessToken
developer.accessTokenWarning
developer.homeserverUrl
developer.accountData.title
developer.accountData.new
developer.accountData.empty
developer.accountData.saved
developer.accountData.saveFailed
space.name
space.namePlaceholder
space.leave
space.leaveConfirm
space.removeRoom
space.removeFailed
space.addExistingRoom
space.addExistingRoomSearchPlaceholder
space.addExistingRoomFailed
space.addExistingRoomNoResults
space.addExistingRoomEmpty
space.loadFailed
space.noPreview
space.addExistingSubSpace
space.addExistingSubSpaceSearchPlaceholder
space.addExistingSubSpaceFailed
space.addExistingSubSpaceNoResults
space.addExistingSubSpaceEmpty
space.add
space.create.title
space.create.public
space.create.publicNote
space.create.roomAddress
space.create.roomAddressPlaceholder
space.create.failed
space.create.aliasCreateFailed
space.create.titleInParent
space.create.accessInvite
space.create.accessPublicNote
space.create.access
space.join.title
space.join.titleShort
space.join.spaceId
space.join.spaceIdPlaceholder
space.join.failed
space.join.discoverSpaces
space.settings.general.spaceId
space.pinToSidebar
space.unpinFromSidebar
space.overview
space.setSuggested
space.unsetSuggested
space.chooseCreateJoin
space.suggested
space.createSubspace
space.addExistingRooms
space.swipeToRemoveHint
space.copyLink
space.notJoined
space.noOtherRooms
space.addRooms
space.newRoom
space.settingsTitle
space.addSpace
space.addSpaceHint
space.joinHint
composer.formatting.heading
composer.formatting.bulletList
composer.formatting.numberedList
composer.camera
timeline.openThread
timeline.threadComposerPlaceholder
timeline.pinnedEmpty
timeline.addReaction
call.event.ongoing
call.event.ended
call.event.participants
call.event.missed
call.event.declined
call.event.unanswered
call.popOut
call.returnToCall
call.poppedOut
call.startCall
call.joinCall
call.callActive
call.hangup
call.noActiveCall
call.statusConnecting
call.statusConnected
call.statusReconnecting
call.toastAlreadyInCall
call.controls
call.stopShare
call.switchToSpotlight
call.switchToGrid
call.reactions
call.incomingVoiceCall
call.incomingVideoCall
call.moreParticipants
call.watchTogether.videoUnplayable
call.watchTogether.stopJustMe
call.watchTogether.stopForEveryone
call.watchTogether.stopConfirm
call.watchTogether.isWatching
call.watchTogether.consentNote
call.watchTogether.pasteLink
call.watchTogether.joinNote
call.watchTogether.stopTogether
call.watchTogether.menuBeta
call.volumeHint
call.userScreen
call.inVoice
call.turnCameraOff
call.turnCameraOn
call.stopSharingScreen
call.moreActionsHint
call.incomingFrom
call.minimize
call.waitingForThem
call.callAgain
call.inProgress
call.missedFrom
call.inCallElsewhere
call.joinHere
call.joinTimeout
call.ownOtherDevice
call.holdToTalk
call.talking
call.frontCamera
call.backCamera
call.systemDefault
settings.account.emailLinkHint
settings.appearance.themeSystem
settings.appearance.textSizePx
settings.privacy.readReceipts
settings.privacy.readReceiptsNote
settings.privacy.presence
settings.privacy.presenceNote
settings.language.restartHint
settings.notifications.bannerNote
settings.notifications.systemDisabledIos
settings.notifications.systemDisabledAndroid
settings.voiceVideo.title
settings.voiceVideo.voice
settings.voiceVideo.video
settings.voiceVideo.previewCamera
settings.voiceVideo.stopPreview
settings.voiceVideo.cameraFailed
settings.voiceVideo.cameraPermission
settings.voiceVideo.startTest
settings.voiceVideo.stopTest
settings.voiceVideo.inputLevel
settings.voiceVideo.testNote
settings.voiceVideo.testFailed
settings.voiceVideo.inputMode
settings.voiceVideo.pushToTalkKey
settings.voiceVideo.noKey
settings.voiceVideo.pushToTalkBrowserHint
settings.voiceVideo.pushToTalkPermission
settings.voiceVideo.pushToTalkGrant
settings.voiceVideo.keybindsHint
settings.voiceVideo.openKeybinds
settings.voiceVideo.sounds
settings.voiceVideo.sound.mute
settings.voiceVideo.sound.deafen
settings.voiceVideo.sound.camera
settings.voiceVideo.sound.screenshare
settings.voiceVideo.sound.join
settings.voiceVideo.sound.leave
settings.voiceVideo.sound.ringtone
settings.voiceVideo.sound.ringback
settings.voiceVideo.sound.callEnded
settings.voiceVideo.sound.raiseHand
settings.voiceVideo.sound.reaction
settings.voiceVideo.sound.watchTogether
settings.voiceVideo.pushToTalkNote
settings.emojisStickers.upload
settings.emojisStickers.imageActionsHint
settings.keybinds.toggleScreenShare
settings.keybinds.takenByOtherApp
settings.sessions.removeConfirm
settings.encryption.setUpRecoveryKey
settings.encryption.recoveryKey
settings.encryption.recoveryKeyMissingNote
settings.encryption.recoveryKeyActiveNote
settings.encryption.changeRecoveryKey
settings.encryption.changeRecoveryKeyConfirm
settings.encryption.enterRecoveryKeyNote
settings.encryption.verifyWithDevice
settings.encryption.resetKeys
settings.encryption.wrongKey
settings.encryption.recoveryKeySaveHint
settings.search
verification.otherDeviceHint
verification.waitingForOtherDevice
verification.compareEmojis
verification.setupOverwritesTitle
verification.setupOverwritesConfirm
verification.session.title
verification.session.body
verification.session.useOtherDevice
verification.session.useRecoveryKey
verification.session.reset
verification.session.setupTitle
verification.session.setupBody
verification.session.setupButton
verification.session.skip
verification.session.skipConfirmTitle
verification.session.skipConfirmBody
verification.session.skipConfirm
verification.session.verified
verification.session.invalidKey
verification.session.noIdentityBackup
verification.session.failed
verification.session.backupOnly
verification.session.noWayToVerify
verification.session.resetAndSetUp
verification.identityWarning.reset
verification.identityWarning.verifiedReset
verification.identityWarning.withdraw
verification.identityWarning.failed
search.global.places
search.global.recent
search.global.roomsAndDms
search.global.spaces
search.global.messagesIn
search.global.showAll
search.global.noMessages
search.switcher.title
search.switcher.noResults
search.switcher.prefixRooms
search.switcher.prefixDms
search.switcher.prefixSpaces
search.switcher.hintOpen
search.switcher.hintClose
search.roomHint
search.thisRoom
search.searchingOlder
getApps.title
getApps.subtitle
getApps.desktop
getApps.mobile
getApps.yourSystem
getApps.download
getApps.installed
getApps.appleSilicon
getApps.intel
getApps.appImage
getApps.deb
getApps.rpm
getApps.arch
getApps.tarball
getApps.beta
getApps.androidNote
getApps.joinBeta
getApps.comingSoon
getApps.iosNote
getApps.web
getApps.webNote
getApps.openWeb
getApps.allReleases
whatsNew.version
whatsNew.dateVersion
whatsNew.website
share.messagePlaceholder
share.noRoomsHint
```

## Needs a build (hand-resolved, unverified)

Every Android and iOS file listed under "Conflicted files" above, plus `Sounds.swift` (iOS, toggle mapping, `CallSounds.isOn`, `CallSounds.ringtone(url:volume:)`). Brace balance was checked heuristically and two real brace bugs were fixed (Android `RoomScreen.kt`, iOS `GeneralSettings.swift`), but nothing was compiled. Also the `build.gradle.kts`/`libs.versions.toml` merge (flavours, Firebase) and `project.yml` need an `xcodegen` + build pass. The call-sound toggles touch `CallSounds` on both platforms; test them.

## New WizardChat-branded strings and assets still to replace

- fastlane screenshots: `apps/android/fastlane/` and `apps/ios/fastlane/` (`raw-screenshots`, `screenshots/en-US`).
- Extra iOS alternate app icons `AppIcon-{Ethereal,Pewter,Umbra,Eclipse,Garnet,Blossom}.icon` (hat logo).
- `PrivacyInfo.xcprivacy` files.
- Android Firebase config and the push gateway (see above).
- `apps/web/public/desktop/latest*.yml` still point at the old WizardChat GitLab feed.
- Intentionally kept: `*.wizardchat.org` runtime hosts (e.g. the youtube-player host), LICENSE, upstream copyright and the "Based on WizardChat" attribution, and internal identifiers (`wizardchat-core`, `org.wizardchat.*`, `WizardChat/` iOS dir).
- Done: `whatsnew/26.12.2.md` and `.de.md`, root `CONTRIBUTING.md`, README, GetApps, WhatsNew.

## Verification (worktree `E:\code\web\mudrix-sync2`)

| Check                                                                                         | Result                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm install`                                                                                 | OK                                                                              |
| `npm run tokens`                                                                              | OK (29 themes; upstream `color.role.*` block added to our 20 extra themes)      |
| `npm run i18n`                                                                                | 2217 keys in de, en, es, fr, it, ja, nl, pl, pt, ru, tr, all languages complete |
| `npx tsc --noEmit` (apps/web)                                                                 | clean                                                                           |
| `npx eslint .` (apps/web)                                                                     | 14 problems (0 errors, 14 warnings)                                             |
| typegen + `api.gen` diff vs upstream                                                          | only Mudrix RPC additions                                                       |
| `cargo check --workspace -j 4`                                                                | Finished                                                                        |
| `cargo check -p wizardchat-core -p wizardchat-core-wasm --target wasm32-unknown-unknown -j 4` | Finished                                                                        |
| `npm run core:web:dev`                                                                        | Done                                                                            |
| `npx vite build`                                                                              | built in 10.16s                                                                 |
| `cargo fmt --all --check`                                                                     | clean                                                                           |
| Android / iOS                                                                                 | not built (by instruction)                                                      |

## Merge into web-look

`sync/upstream` (7b45978) merged into `web-look` (the visual-parity branch that makes `apps/web` look like the old Mudrix app). Policy: look (css.ts, class names, markup, copy) -> web-look; logic and new upstream features -> `sync/upstream`; everything outside `apps/web`, `packages`, `tools/parity`, `docs` -> `sync/upstream`. Merge base was `f6d6e1c` (`port/mudrix`).

### Conflicted files (31)

Resolution tags: **look** = web-look kept, **upstream** = sync/upstream taken, **both** = union, **redo** = upstream taken, web-look styling is to be redone.

- `packages/i18n/locales/{de,en,es,fr,it,ja,nl,pl,pt,ru,tr}.json` (11): key-level 3-way merge against `f6d6e1c`. Upstream's key set and order, plus keys only web-look added (307 per language, appended). Where web-look changed a value upstream also had, web-look's text won (10 in `en`). Exception: `settings.about.matrixSdk` kept upstream's text, web-look's copy said matrix-js-sdk (wrong for the Rust core); the link in `About.tsx` points at matrix-rust-sdk. Renamed upstream keys: web-look's `welcome.tagline` ("Simple, Secure, Muddy") and `welcome.noAccount` text carried over to `auth.tagline` and `auth.noAccount`. 2518 keys; `npm run i18n` reports all 11 languages complete.
- `components/Settings/Settings.css.ts`: both (web-look's `PANEL_OVERLAY_QUERY` import, upstream's `keyframes` import).
- `features/keyboardShortcuts/keyCombo.ts`: upstream (`keybindCapture`); web-look's `formatCombo`/`formatHeldModifiers` dropped as unused.
- `features/keyboardShortcuts/shortcuts.ts`: upstream.
- `features/globalSearch/GlobalSearch.tsx`: upstream footer (`KeyCaps`, `keyboardHints`), rest of file web-look. Imports re-added by hand.
- `features/timeline/Timeline.tsx`: upstream (call history rows replace web-look's `callSession` receipt grouping; its two leftover uses were removed).
- `features/whatsNew/whatsNew.ts`: both (web-look's pre-release `FILE_PATTERN` and `compareVersions`, upstream's `FRONTMATTER`). web-look's `import.meta.glob('@whatsnew/26.10.*.md')` is kept, so the 26.11 and 26.12.2 notes are not loaded yet. Widen the glob when the look work for What's New is done.
- `features/room/roomsettings/RoomSettings.tsx`: upstream `RoomSettingsTab`, plus web-look's `'cosmetics'` tab.
- `features/settings/about/About.tsx`: upstream "Get the apps" button and dialog; web-look kept (no donate button, WizardChat credit link).
- `pages/client/ClientLayout.tsx`: web-look `aria-label`, upstream `tabletDrawerOpen`.
- `pages/auth/WelcomePage.css.ts`: both. web-look's file plus every upstream-only export (`container`, `formSection`, `serverPresets`, `backButton`, ...), so `AuthField`, `ServerPicker` and `PasswordChecklist` keep their web-look classes and the upstream forms have theirs.
- redo: `features/profile/UserProfilePopup.tsx` (upstream; `UserProfilePopup.css.ts` is upstream's plus web-look's `bioLink`, `timeValue`, `timeOffset`, `notes*` for `ProfileExtras.tsx`)
- redo: `features/whatsNew/WhatsNewModal.tsx` (upstream `Dialog` restyle; web-look's `Modal` with "Got it" button is gone)
- redo: `features/settings/Settings.tsx` (upstream: settings search, narrow list/page, account switcher in nav footer; web-look's logout button in the nav and icon-only narrow nav are gone; dialog size 900x640 and `zIndex.modal` re-applied)
- redo: `features/settings/keybinds/Keybinds.tsx` (upstream, `KeyCaps` rows)
- redo: `features/space/spacesettings/SpaceSettings.tsx` (upstream: search, narrow view, audit; 900x640 and `zIndex.modal` re-applied; web-look's `cosmetics` tab is gone here)
- redo: `pages/auth/LoginForm.tsx`, `RegisterForm.tsx`, `ResetPasswordForm.tsx`, `WelcomePage.tsx` (upstream layout and `auth.*` keys; web-look's old-Mudrix card layout, `welcome.*` keys and `col`/`back` classes are not used; the web-look css for them is still in `WelcomePage.css.ts`)

### Non-conflicting but regenerated or changed

- `apps/web/src/core/rpc/api.gen.ts`: regenerated (typegen + prettier). `Api.gen.kt` and `Api.gen.swift` are unchanged by it.
- `package-lock.json`, `Cargo.lock`: `npm install` and cargo.
- Fix-ups after merge: `store/atoms/settings.ts` lost its `MOD_MODIFIER` import in the auto-merge (re-added).
- `features/calls/useCallMemberships.ts` and `features/timeline/message/callSessions.ts` are deleted (upstream removed them, web-look's merged code no longer uses them).

### New upstream UI with no Mudrix styling yet

Upstream look, nothing in old Mudrix to match: settings search (`SettingsSearch`, `searchIndex.ts`), narrow settings list/page (`NarrowSettings`), Voice & Video tab (`settings/voiceVideo`, next to web-look's Voice & Audio), Get-the-apps dialog, encryption setup screen (session verification and recovery key prompts), room state explorer and Developer panel, caption editing, `#` room mentions, lists/headings in the composer and toolbar, call history rows in the timeline, `KeyCaps` (keybinds, global search, room switcher), account switcher in settings and the user profile popup, What's New dialog, `AuthField`-less auth layout (see redo list).

### Checks (on `web-look` after the merge)

| Check | Result |
| --- | --- |
| `npm install` | OK |
| `npm run tokens` | 29 themes |
| `npm run i18n` | 2518 keys in de, en, es, fr, it, ja, nl, pl, pt, ru, tr, all languages complete |
| `npx tsc --noEmit` (apps/web) | no errors |
| `npx eslint .` (apps/web) | 0 errors, 15 warnings |
| `cargo check --workspace -j 4` | Finished |
| `npm run core:web:dev` | Done |
| `npx vite build` | built |
| Android / iOS | not built |