# Notification sound packs

The files named `snd_<pack>_<sound>.<ext>` in `raw/` are the sound packs from Mudrix, so a user can pick a familiar
message sound. They are kept flat (Android resources have no folders); `<sound>` is `message`, `mention`, `ring`,
`ringback`, `callend`, `mute`, `unmute`, `camera_on`, `camera_off`, `join`, `leave`, `moved` or `watch_together_start`.
The ring and ringback files are WAV so they loop without a gap; the rest are MP3 or OGG.

The packs made for Mudrix (`bloop`, `glass`, `warm`, `megadrive`, `megadrive2`, `nes`, `nes2`, `sms`) are generated with
chip-sound emulation for Mudrix and are released under the same licence as this repository (AGPL-3.0). The other packs
are copied unmodified from other open-source Matrix clients:

| Pack       | Source repository                         | Licence of source                                                         | Files                                                                                        |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| wizardchat | WizardChat                                | AGPL-3.0                                                                  | `alert.wav` (the pack's message sound)                                                       |
| element    | element-hq/element-web (`res/media`)      | AGPL-3.0-only OR GPL-3.0-only OR commercial (used under AGPL-3.0)         | message, ring, ringback, callend                                                             |
| cinny      | cinnyapp/cinny (`public/sound`)           | AGPL-3.0 (repository licence; no separate sound licence stated)           | notification -> message, invite -> mention                                                   |
| fluffychat | krille-chan/fluffychat (`assets/sounds`)  | Sounds are CC-BY-4.0, copyright Pixabay (per REUSE.toml); app is AGPL-3.0 | notification -> message, call_attention -> mention, call_ring -> ring, call_leave -> callend |
| commet     | commetchat/commet (`commet/assets/sound`) | AGPL-3.0 (repository licence; no separate sound licence stated)           | message, left_call -> callend                                                                |
| lightning  | Lightning client (`data/sounds`)          | GPL-3.0 (compatible with AGPL-3.0 via GPLv3 section 13)                   | message, mention                                                                             |

Attribution for CC-BY-4.0 material: FluffyChat sounds by Pixabay, https://creativecommons.org/licenses/by/4.0/
