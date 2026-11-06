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

## Soundboard clips

The files named `sb_<clip>.mp3` in `raw/` are the call soundboard's default clips (hyphens in the clip id become underscores in the
file name). Each is a trimmed, loudness-normalised (about -18 LUFS, mono, 44.1 kHz) MP3 copy of a sound from
[Freesound](https://freesound.org) released under Creative Commons 0 (public domain dedication). No attribution is required;
credit is given anyway.

| Clip           | Freesound title                   | Author             | Source (CC0 1.0)                                               |
| -------------- | --------------------------------- | ------------------ | -------------------------------------------------------------- |
| airhorn        | DJ airhorn sound                  | pfranzen           | https://freesound.org/people/pfranzen/sounds/528807/           |
| applause       | Concert audience applause 1       | thaighaudio        | https://freesound.org/people/thaighaudio/sounds/478414/        |
| cheer          | BerlinGameScene.com Crowd Cheer 1 | BerlinGameScene    | https://freesound.org/people/BerlinGameScene/sounds/267249/    |
| clap           | Hand Clap                         | stuntstudio        | https://freesound.org/people/stuntstudio/sounds/421711/        |
| giggle         | giggles_girl_daughter             | 3LMN_audio         | https://freesound.org/people/3LMN_audio/sounds/754382/         |
| rimshot        | Rimshot (sweet)                   | Sajmund            | https://freesound.org/people/Sajmund/sounds/132418/            |
| sad-trombone   | horn_fail_wahwah_1.wav            | TaranP             | https://freesound.org/people/TaranP/sounds/362206/             |
| ding           | bell ding 1.wav                   | 5ro4               | https://freesound.org/people/5ro4/sounds/611113/               |
| whoosh         | Whoosh For Whip Zoom              | BennettFilmTeacher | https://freesound.org/people/BennettFilmTeacher/sounds/486234/ |
| pop            | Bubble Pop                        | YehawSnail         | https://freesound.org/people/YehawSnail/sounds/683587/         |
| tada           | Tada Fanfare A                    | plasterbrain       | https://freesound.org/people/plasterbrain/sounds/397355/       |
| boing          | Boing 2                           | magnuswaker        | https://freesound.org/people/magnuswaker/sounds/540790/        |
| record-scratch | record_scratch.wav                | ludvique           | https://freesound.org/people/ludvique/sounds/71853/            |
| crickets       | cricket chirping (slow)           | _sinny_            | https://freesound.org/people/_sinny_/sounds/822935/            |
| gong           | Gong Brilliant Paiste 32"         | JensZygar          | https://freesound.org/people/JensZygar/sounds/486629/          |
| drumroll       | Drum Roll, Please!                | HoBoTrails         | https://freesound.org/people/HoBoTrails/sounds/424927/         |
| sparkle        | Item Sparkle                      | Mr._Fritz_         | https://freesound.org/people/Mr._Fritz_/sounds/545238/         |
| honk           | Double car horn                   | mudflea2           | https://freesound.org/people/mudflea2/sounds/705723/           |
