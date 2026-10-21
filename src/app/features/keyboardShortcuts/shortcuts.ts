import type { Keybinds } from '@/app/store/atoms/settings';
import { MODIFIER_KEY } from '@/app/util/platform';

export type KeybindAction = keyof Keybinds;

export interface ShortcutItem {
  id: string;
  labelKey: string;
  keys: string;
  editable?: false;
}

export interface EditableShortcutItem {
  id: KeybindAction;
  labelKey: string;
  keys: '';
  editable: true;
}

export type AnyShortcutItem = ShortcutItem | EditableShortcutItem;

export interface ShortcutGroup {
  id: string;
  labelKey: string;
  items: AnyShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'general',
    labelKey: 'settings.keybinds.groupGeneral',
    items: [
      {
        id: 'searchGlobal',
        labelKey: 'settings.keybinds.searchGlobal',
        keys: `${MODIFIER_KEY} + K`,
      },
      {
        id: 'searchInRoom',
        labelKey: 'settings.keybinds.searchInRoom',
        keys: `${MODIFIER_KEY} + F`,
      },
      {
        id: 'showHelp',
        labelKey: 'settings.keybinds.showHelp',
        keys: `${MODIFIER_KEY} + /`,
      },
    ],
  },
  {
    id: 'composer',
    labelKey: 'settings.keybinds.groupComposer',
    items: [
      { id: 'close', labelKey: 'settings.keybinds.close', keys: 'Escape' },
      { id: 'send', labelKey: 'settings.keybinds.send', keys: 'Enter' },
      { id: 'newLine', labelKey: 'settings.keybinds.newLine', keys: 'Shift + Enter' },
      { id: 'bold', labelKey: 'settings.keybinds.bold', keys: `${MODIFIER_KEY} + B` },
      { id: 'italic', labelKey: 'settings.keybinds.italic', keys: `${MODIFIER_KEY} + I` },
      {
        id: 'strikethrough',
        labelKey: 'settings.keybinds.strikethrough',
        keys: `${MODIFIER_KEY} + Shift + S`,
      },
      { id: 'inlineCode', labelKey: 'settings.keybinds.inlineCode', keys: `${MODIFIER_KEY} + E` },
      {
        id: 'editPrevious',
        labelKey: 'settings.keybinds.editPrevious',
        keys: '↑',
      },
      {
        id: 'editNext',
        labelKey: 'settings.keybinds.editNext',
        keys: '↓',
      },
      {
        id: 'emojiPicker',
        labelKey: 'settings.keybinds.emojiPicker',
        keys: `${MODIFIER_KEY} + ;`,
      },
      {
        id: 'acceptSuggestion',
        labelKey: 'settings.keybinds.acceptSuggestion',
        keys: 'Tab',
      },
    ],
  },
  {
    id: 'voice',
    labelKey: 'settings.keybinds.voiceRoom',
    items: [
      {
        id: 'toggleMute',
        labelKey: 'settings.keybinds.toggleMute',
        keys: '',
        editable: true,
      },
      {
        id: 'toggleDeafen',
        labelKey: 'settings.keybinds.toggleDeafen',
        keys: '',
        editable: true,
      },
      {
        id: 'toggleVideo',
        labelKey: 'settings.keybinds.toggleVideo',
        keys: '',
        editable: true,
      },
      {
        id: 'disconnect',
        labelKey: 'settings.keybinds.disconnect',
        keys: '',
        editable: true,
      },
    ],
  },
];
