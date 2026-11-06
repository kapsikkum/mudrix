import { globalStyle } from '@vanilla-extract/css';
import { iconSizes, sizes } from '@/app/components/Button/Button.css';
import * as roomHeader from '@/app/features/timeline/RoomHeader.css';
import * as composer from '@/app/features/timeline/Composer.css';
import * as timeline from '@/app/features/timeline/Timeline.css';
import * as mobileHeader from '@/app/pages/client/MobileHeader.css';
import * as membersSidebar from '@/app/pages/client/MembersSidebar.css';
import * as roomList from '@/app/pages/client/RoomListPanel.css';
import * as inbox from '@/app/features/inbox/Inbox.css';
import * as encryptionWarning from '@/app/components/EncryptionWarningButton/EncryptionWarningButton.css';
import * as callBar from '@/app/features/calls/CallBar.css';
import * as callControls from '@/app/features/calls/CallControlBar.css';
import * as profile from '@/app/features/profile/UserProfilePopup.css';
import * as settings from '@/app/features/settings/Settings.css';
import * as appearance from '@/app/features/settings/appearance/Appearance.css';
import * as voiceAudio from '@/app/features/settings/voice/VoiceAudio.css';
import * as sessions from '@/app/features/settings/sessions/Sessions.css';
import * as select from '@/app/components/Select/Select.css';
import * as slider from '@/app/components/Slider/Slider.css';

// Touch layer: fingers need ~44px targets, mice do not. Everything here sits behind
// `(pointer: coarse)`, so the desktop layout is untouched. Most controls keep their drawn size and
// grow an invisible hit area instead, so icons do not get bigger. Static CSS only: nothing runs
// per frame or per render.

const COARSE = '(pointer: coarse)';
const TARGET = 44;

// A vanilla-extract class can be several class names (a style built from another); the element
// carries all of them, so they form one compound selector.
const cls = (c: string) => `.${c.split(' ').join('.')}`;
const each = (classes: string[], suffix = '') =>
  classes.map((c) => `${cls(c)}${suffix}`).join(', ');

/**
 * Grows the tappable area of `classes` to at least `min` px square around the element's centre,
 * without changing its size or layout. The area is a ::after, so it cannot be used on elements that
 * clip their overflow or draw their own ::after.
 */
function hitArea(classes: string[], min = TARGET, positioned = true) {
  if (positioned) {
    globalStyle(each(classes), { '@media': { [COARSE]: { position: 'relative' } } });
  }
  globalStyle(each(classes, '::after'), {
    '@media': {
      [COARSE]: {
        content: '""',
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `max(100%, ${min}px)`,
        height: `max(100%, ${min}px)`,
        transform: 'translate(-50%, -50%)',
      },
    },
  });
}

/** Resizes the box itself (for icon buttons that sit in a tight row and need real spacing). */
function resize(classes: string[], size: number) {
  globalStyle(each(classes), {
    '@media': { [COARSE]: { width: `${size}px`, height: `${size}px` } },
  });
}

// Shared components: IconButton (user panel, call bar, members and thread panels, profile sheet)
// and Button (settings, dialogs).
hitArea([iconSizes.xs, iconSizes.sm, iconSizes.md, iconSizes.lg, sizes.sm, sizes.md]);

// Headers.
resize([roomHeader.headerBtn, mobileHeader.mobileActionBtn, inbox.inboxButton], 40);
hitArea([
  roomHeader.headerBtn,
  roomHeader.topicTrigger,
  mobileHeader.mobileMenuBtn,
  mobileHeader.mobileActionBtn,
  inbox.inboxButton,
  encryptionWarning.button,
]);

// Composer: six buttons share one row on a phone, so they are 40px apart-ish boxes with a 44px
// hit area, and the row keeps its 48px height.
globalStyle(cls(composer.inputRow), {
  '@media': { [COARSE]: { padding: '0 6px', gap: '2px' } },
});
resize([composer.attachBtn, composer.moreBtn, composer.sendBtn], 40);
hitArea([composer.attachBtn, composer.moreBtn, composer.sendBtn]);

// Side panels and the room list: the members panel's close button is 24px, and the "Rooms" heading
// is a 19px toggle (a smaller area, so it does not swallow taps meant for the first room).
hitArea([membersSidebar.membersSidebarClose]);
hitArea([roomList.subspaceToggle], 36);

// Calls.
hitArea([callBar.ctrl, callControls.ctrl]);

// Message rows: the read receipt avatars are 16px; a 32px area is as much as their overlap allows.
globalStyle(cls(timeline.readReceiptAvatarBtn), {
  '@media': { [COARSE]: { overflow: 'visible' } },
});
hitArea([timeline.readReceiptAvatarBtn], 32);
// Smaller than a full 44px so they do not swallow taps meant for the message around them.
hitArea([timeline.msgSender, timeline.reactionChip, timeline.reactionQuickAdd], 36);
globalStyle(`${cls(timeline.msgAvatarCol)} > button`, {
  '@media': { [COARSE]: { position: 'relative' } },
});
globalStyle(`${cls(timeline.msgAvatarCol)} > button::after`, {
  '@media': { [COARSE]: { content: '""', position: 'absolute', inset: '-8px' } },
});

// Profile sheet: the link/ignore buttons sit side by side, so space them out.
globalStyle(cls(profile.avatarRow), { '@media': { [COARSE]: { gap: '16px' } } });
globalStyle(cls(profile.userIdRow), { '@media': { [COARSE]: { gap: '8px' } } });

// Settings.
hitArea([
  settings.actionBtn,
  settings.clearBtn,
  settings.accessTokenBtn,
  voiceAudio.button,
  sessions.expandBtn,
  select.trigger,
  select.triggerMd,
  select.triggerPill,
]);
globalStyle(cls(appearance.swatchRow), { '@media': { [COARSE]: { gap: '14px' } } });
hitArea([appearance.swatch], 40);

// Range sliders: a 16px track is nearly impossible to grab with a finger.
globalStyle(cls(slider.input), { '@media': { [COARSE]: { height: `${TARGET}px` } } });
globalStyle(cls(voiceAudio.volumeSlider), {
  '@media': { [COARSE]: { height: `${TARGET}px` } },
});
// (The ticks are absolutely positioned already, which anchors the hit area as well.)
hitArea([slider.tick], 32, false);
