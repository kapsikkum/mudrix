# Local test server

A throwaway Matrix homeserver with calls, seeded with people, rooms and cosmetics, plus headless
browser "participants" that join calls with fake cameras. Use it to test the apps against a server
you can wipe, and to settle behaviour that needs two accounts and a real homeserver.

It exists for the parity rows **E1** (local server with call bots) and **Y6** (reachable from a USB
phone), and the three checks they unblock are written out below: **N4** (unread and mention
counts), **R8** (what counts as a DM) and **R10** (space hierarchy load).

Needs a container runtime (Docker, or Podman - Podman is what this was written against on
Windows), Node 22+, and Edge or Chrome for the bots. Nothing here is for production: open
registration with a known token, one fixed LiveKit secret, a database you are meant to delete.

| Service | What it is                                                              |
| ------- | ----------------------------------------------------------------------- |
| tuwunel | Homeserver for `mudrix.test`, port 6167                                 |
| LiveKit | Call media, ports 7880 / 7881 tcp / 7882 udp                            |
| lk-jwt  | Hands out LiveKit tokens for Matrix logins, port 8090                   |
| Caddy   | HTTPS for `mudrix.test` (443, 8448) with its own CA; advertises LiveKit |

Everything listens on one address and only on it: `127.0.0.1` when the runtime runs natively, or
the runtime's own private VM address (`172.x`, not a LAN address) when Podman runs in a WSL VM and
this machine reaches it there. Port forwarding in that VM does not work, so the containers share
the VM's network. `MUDRIX_TEST_HOST` overrides the address; `MUDRIX_TEST_MEDIA_HOST` overrides what
call clients are told to use for media; `MUDRIX_TEST_VOLUME` keeps more than one throwaway database
around (one per checkout, say). The container names are always `mudrix-test-*`, so only one copy of
the stack runs at a time.

## Start

```sh
npm run test-server          # start (or restart); writes .generated/env.json
npm run test-server:seed     # accounts, rooms, spaces, fixtures (see below)
npm run dev                  # the web app, http://localhost:5180
```

Running the seed again on a server it already filled exits straight away (the seeded marker is
set). If an earlier run was interrupted before that marker, the next run reuses the fixture rooms
it already made (each carries an `io.github.kapsikkum.mudrix.test.fixture` state event with its
key) and any DM ash already has with a fixture person (from `m.direct`), instead of creating
them again, and fills in what is missing. Space children are written with a zero-padded `order`
("01", "02", ...), so the rooms sort in the order the seed gives them.

`up.mjs` uses `podman` when it is installed and `docker` otherwise; set `MUDRIX_TEST_RUNTIME` to
force one. It pulls four images the first time (`tuwunel`, `livekit-server`, `lk-jwt-service`,
`caddy`), starts them, waits for the homeserver, LiveKit and the token service, then writes:

```sh
node -e "console.log(require('./tools/test-server/.generated/env.json').homeserver)"
```

Print that address; it is what the apps sign in to.

Stop, and start over:

```sh
npm run test-server:down     # stop the containers, keep the homeserver database
npm run test-server:reset    # stop, delete the database and the generated seed/session files
```

Then `npm run test-server` and `npm run test-server:seed` again. Nothing outside
`tools/test-server/.generated/` is written; that directory is git-ignored and holds the generated
configs, `env.json`, `seed.json`, `sessions.json`, `bots.json` and the fake camera clips.

## Accounts

Every account's password is `mudrix-test-password` - an obvious test value, not a secret. `ash` is
the account the scenarios below watch; `juno` is the second account that sends the messages.

| User    | What they are for                                               |
| ------- | --------------------------------------------------------------- |
| `ash`   | the viewer: owns the rooms, reads and marks unread              |
| `juno`  | the other side: sends messages, mentions, thread replies, DMs   |
| `theo`  | a DM, a missing avatar (shows the placeholder)                  |
| `mira`  | cosmetics (halo, nameplate), rich timeline                      |
| `wren`  | cosmetics, a second member in the mention/quiet rooms           |
| `sable` | a DM whose other member left, and the last to read in `general` |

Room keys for `participants.mjs` and for the checks (`general`, `dmJuno`, `unread`, ...) are in
`.generated/seed.json`; so are the fixture ids and their expected counts.

## Point the apps at it

**Web:** open `http://localhost:5180/welcome/<host>:6167` - for example
`http://localhost:5180/welcome/172.30.18.177:6167`, using the address printed above - and sign in
as `ash`. Typing the address into the welcome page works the same; the app remembers it. There is
no config file to edit: the server is chosen at sign-in, and `/welcome/<address>` is the app's own
way of defaulting it.

**Desktop:** `npm run desktop`, then the same sign-in (the desktop app is the web app in Tauri).

**Android emulator:** the emulator reaches this machine's loopback as `10.0.2.2`, but the stack
listens on the runtime VM's address, not on the Windows loopback. Forward it first:

```sh
npm run test-server:forward            # 127.0.0.1:6167/8090/7880/7881 -> the stack
```

Then sign in on the emulator to `http://10.0.2.2:6167`. For calls, LiveKit also has to hand the
phone a reachable address, so start the stack with `MUDRIX_TEST_MEDIA_HOST=10.0.2.2`.

**USB phone or tablet:** start the stack with the media address set to loopback, forward the ports,
and hand the phone the same ports with `adb reverse`:

```sh
# Windows PowerShell
$env:MUDRIX_TEST_MEDIA_HOST = '127.0.0.1'; npm run test-server
npm run test-server:forward
adb reverse tcp:6167 tcp:6167
adb reverse tcp:8090 tcp:8090
adb reverse tcp:7880 tcp:7880
adb reverse tcp:7881 tcp:7881
```

Sign in on the phone to `http://localhost:6167`. `adb reverse` maps the phone's own `localhost` to
this machine, so no LAN address is involved. LiveKit's UDP media cannot be reversed; calls fall
back to TCP (7881), which is slower but works. `adb reverse --remove-all` (or unplugging) undoes
it. The tools here never call `adb` themselves.

### Calls need one more step

Call clients find LiveKit through the client well-known at `https://mudrix.test/.well-known/matrix/client`,
signed by Caddy's local CA, because the test server name has no DNS. The bots get round that with
`--ignore-certificate-errors`; a normal browser or phone will refuse the certificate unless the CA
is trusted. Either import Caddy's root certificate (`podman cp mudrix-test-federation-tls:/data/caddy/pki/authorities/local/root.crt .`
or `docker cp ...`) into the OS/browser trust store, or skip calls - N4, R8 and R10 below need no
call at all. The homeserver itself also answers the same well-known on its own plain-HTTP port, so
the RTC entry is visible without TLS (`curl http://<host>:6167/.well-known/matrix/client`).

## Call bots and screenshots

```sh
# Bots join the room's call; `:nocam` keeps a camera off. Ctrl+C or `stop` ends them.
npm run test-server:bots general ash:nocam juno mira:nocam wren theo:nocam

# Look at or drive a bot's browser.
MUDRIX_VIEWPORT=1440x900 node tools/test-server/cdp.mjs ash shot out.png
node tools/test-server/cdp.mjs ash eval "return document.title"

# README hero image: the chat in several themes, cut diagonally.
node tools/test-server/theme-hero.mjs out/themes.png
```

Bots reuse their device between runs (`.generated/sessions.json`, `.generated/bots.json`), so
restarting them replaces their call memberships instead of leaving ghost tiles behind for five
minutes. They sign in by injecting the session into localStorage, so no password is typed. Browsers
run with a fake camera/microphone from a generated `.y4m` clip and with `mudrix.test` mapped to the
stack, because the client well-known (and its local CA) is only reachable by name.

## Parity checks

Each check is a manual scenario: what to do, and what should be true when it works. The fixture
rooms are created by `seed.mjs`; open them from `Home` as `ash`. Where a count is stated, the seed
also prints what the homeserver reported for that room at the end of the run ("Fixture state as ash
sees it after seeding") - if those printed notification counts differ, the fixture is what is wrong,
not the app. The app counts mentions itself from the loaded messages (`m.mentions`), so the server's
highlight count is not what the mention marker reflects.

### N4 - unread and mention counts across rooms and threads

Row: "Unread counts from read receipts / thread unread / ignore join-leave-call events for unread".
The app shows `unreadNotifications` as the badge and `unreadMentions` as the mention marker, and
"mark unread" as one unread item. The fixtures each start with a message `ash` has already read, so
the counts below are only what came after.

| Room (seed key)                   | What is in it after ash's read marker                                 | Expected before opening                              |
| --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `n4 unread (3 messages)`          | three plain messages from Juno, room set to notify on all             | badge **3**, no mention                              |
| `n4 mention`                      | two plain messages and one that mentions `ash`                        | badge **3**, mention                                 |
| `n4 thread`                       | two replies in a thread on the read root, the last one @-mentions ash | **no** room badge; the thread is unread in the Inbox |
| `n4 quiet (join/leave/call only)` | Juno leaves, rejoins, sets and clears a call membership               | **no** badge                                         |
| `n4 read (mark unread from here)` | one message, read; the starting point for "mark unread"               | no badge                                             |

1. Sign in as `ash` and stay on Home without opening anything. Check the five rows above: badges
   and the mention marker match the table (the thread room shows nothing on the room row), and the
   quiet room shows nothing. This is the part that fails when join/leave or call-member events are
   counted as unread.
2. Open `n4 unread (3 messages)`, wait for the timeline, then go back to Home. The badge is gone:
   the read receipt was sent. Repeat on another device or window signed in as `ash` to see it clear
   there too.
3. Right-click `n4 read (mark unread from here)` → **Mark unread**. One unread item appears (a dot
   or `1`), and it stays after a reload because the mark is a server-side flag. Open the room: it
   clears.
4. Open **Inbox → Mentions**: the mention in `n4 mention` is listed with sender and text. Open it:
   the room opens at that message and the entry leaves the list. (The thread mention in `n4 thread`
   belongs to the thread, not to the room: it should show up under Threads below, not here. That
   split is part of what this row is checking.)
5. Open **Inbox → Threads**: the thread on `thread root` in `n4 thread` is listed as unread, with
   its reply count. Opening it marks the thread seen and the entry stops being unread.
6. In a private window sign in as `juno` and send another message to `n4 unread (3 messages)`.
   Without reloading, `ash`'s badge goes from cleared to `1` (or from 3 to 4 if step 2 was
   skipped). Send one that @-mentions `ash`: the mention marker appears.
7. With `ash` on Home, have `juno` leave and rejoin `n4 quiet (join/leave/call only)`, and join its
   call. No badge appears.

### R8 - which rooms count as direct messages

Row: "Unnamed 2-person room counts as DM". The core treats a room as a DM when the account's
`m.direct` lists it (or an invite says `is_direct`), not when it merely has two members.

| Room (seed key)                         | How it was made                                     | Expected                                              |
| --------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| DM with Juno (`dmJuno`)                 | `is_direct`, both sides' `m.direct` updated         | in **People/DMs**, named Juno                         |
| DM with Theo (`dmTheo`)                 | same                                                | in **People/DMs**, named Theo                         |
| DM with Sable (`dmLeft`)                | same, then Sable **left** the room                  | still in **People/DMs** as Sable                      |
| `Two people, not a DM` (`pairNamed`)    | two members, a name, no `is_direct`, no `m.direct`  | **not** a DM: under Home/rooms                        |
| unnamed two-person room (`pairUnnamed`) | two members, no name, no `is_direct`, no `m.direct` | **not** a DM: under Home/rooms, shown by member names |
| `general` (`general`)                   | a group room with six members                       | not a DM                                              |

1. Sign in as `ash` and look at the **People** (DMs) section: exactly the three DMs are there, and
   the Sable one survives even though Sable left. Its row still shows Sable, not a room id.
2. Look at Home: `Two people, not a DM` and the unnamed two-person room are there, and neither
   appears in People. This is the row's actual question: the old JavaScript client guessed from
   the member count, the core does not.
3. Open the Sable DM: the header shows Sable, and the room's member list has only you. Sending a
   message still works (it is just a room).
4. Cross-check with the server: the seed's closing output prints how many users `m.direct` lists;
   it must be three (Juno, Theo, Sable), and the two `pair*` rooms must not be in it.

### R10 - space hierarchy load time and behaviour

Row: "Space hierarchy cache/prefetch". Fixture: **Parity Space**, three categories
(`Parity Category A/B/C`) and 40 rooms (`parity-room-01` .. `parity-room-40`), all joined by `ash`.
`MUDRIX_SEED_SPACE_ROOMS=100` (PowerShell: `$env:MUDRIX_SEED_SPACE_ROOMS = '100'`) before a fresh
seed makes it bigger.

1. Sign in as `ash` on a fast connection (everything is local). Clear the app's site data once so
   there is no cached hierarchy.
2. Click **Parity Space** in the space rail and count: the room list must be complete (40 rooms
   under the three category headers, no placeholder rows left) within about two seconds, and the
   window must not freeze while it fills in. Expanding a category is instant, because the whole
   tree is built when the space loads.
3. Reload and click the space again: this is the cached path. The list appears without a visible
   loading state.
4. Check the shape: 3 category headers, 40 rooms spread over them in order, no room listed twice,
   no room missing, and each room's name (not its id) shown immediately.
5. Click through a few rooms: opening one must not trigger a new hierarchy request for the whole
   space, and going back must not reload the tree.
6. With DevTools' Network tab open, the first visit makes one space-hierarchy request for the root
   (plus state requests for the rooms); a second visit makes none. If the second visit still
   requests the hierarchy, the cache is not being used. On this homeserver that request gets a 404
   - see the caveat below - so read this step together with it.

The row's "core caches `spaceHierarchy`" claim is what steps 3 and 6 measure. There is no
benchmark number in the repo to compare against; record what you see in the parity row's note when
you settle it.

One caveat of this homeserver: **tuwunel does not implement `GET /rooms/{id}/hierarchy`** (it answers
404 `M_UNRECOGNIZED`), so on this stack the list is built from the joined rooms' own `m.space.child`
state, which is why every fixture room is joined by `ash`. That still exercises the rendering,
ordering and the app's persisted cache, but not the server-hierarchy fetch itself. To measure that
part, point the same account at a homeserver that implements the endpoint (Synapse does) with the
same space shape.

## Feature scenarios (S1-S9)

The checks above settle individual parity rows. These scenarios are broader smoke tests of what
people do every day, written to run unchanged on the web app and on the Android emulator. Each one
says which seeded accounts act, what to send from the other account, and what to look at in the app.
Room ids and expected counts are under `fixtures.s1` ... `fixtures.s9` in `.generated/seed.json`.

Fixtures are made by `seed.mjs` on a fresh seed. After pulling a change that adds fixtures, run
`npm run test-server:reset`, then `npm run test-server` and `npm run test-server:seed` once; a
re-run before the seed finishes reuses the fixture rooms it already made and fills in the rest, but a
fully seeded server exits straight away and gets nothing new.

### Running a scenario

1. `npm run test-server`, `npm run test-server:seed`, then `npm run dev` for the web app.
2. Sign in to the web app as `ash` (see "Point the apps at it" above).
3. For Android, `npm run test-server:forward` first, then sign in on the emulator to
   `http://10.0.2.2:6167`. Calls also need the media address: start the stack with
   `MUDRIX_TEST_MEDIA_HOST=10.0.2.2`.
4. The second side is `juno`: a private window (or another browser profile) on the web app, a second
   emulator, or the client-server API. Only S7 (calls) and S9 (sync) genuinely need two clients at
   once; the other scenarios can also be driven one account at a time.

Tokens for the API are in `.generated/sessions.json`, room ids in `.generated/seed.json`, and the
homeserver URL in `.generated/env.json`. A PowerShell send as `juno`:

```powershell
$hs = (Get-Content tools/test-server/.generated/env.json | ConvertFrom-Json).homeserver
$seed = (Get-Content tools/test-server/.generated/seed.json | ConvertFrom-Json)
$sessions = Get-Content tools/test-server/.generated/sessions.json | ConvertFrom-Json
$juno = @{ Authorization = "Bearer $($sessions.juno.access_token)" }
$room = $seed.rooms.s1Chat
$body = '{"msgtype":"m.text","body":"sent from juno"}'
Invoke-RestMethod -Method Put -Headers $juno -ContentType 'application/json' `
  -Uri "$hs/_matrix/client/v3/rooms/$room/send/m.room.message/$([guid]::NewGuid())" -Body $body
```

The other endpoints the steps use are the normal client-server ones:

| Action | Request                                                  |
| ------ | -------------------------------------------------------- |
| Send   | `PUT /rooms/<room>/send/<type>/<txn>` (new `<txn>` each) |
| React  | `PUT /rooms/<room>/send/m.reaction/<txn>`                |
| Edit   | `PUT /rooms/<room>/send/m.room.message/<txn>`            |
| Delete | `PUT /rooms/<room>/redact/<eventId>/<txn>` with `{}`     |
| Read   | `POST /rooms/<room>/read_markers`                        |

The bodies for the non-obvious ones:

```jsonc
// React: the emoji is the annotation key
{ "m.relates_to": { "rel_type": "m.annotation", "event_id": "$...", "key": "🎉" } }
// Edit: the new text, plus a replace relation to the original
{
  "msgtype": "m.text",
  "body": "* edited text",
  "m.new_content": { "msgtype": "m.text", "body": "edited text" },
  "m.relates_to": { "rel_type": "m.replace", "event_id": "$..." }
}
// Read: both the marker (fully read) and the receipt
{ "m.fully_read": "$...", "m.read": "$..." }
```

| Scenario | Feature                                 | Fixture                                  | Two accounts |
| -------- | --------------------------------------- | ---------------------------------------- | ------------ |
| S1       | send, edit, delete, react, reply        | `s1 chat`                                | helps        |
| S2       | threads, thread list, unread            | `s2 thread`                              | helps        |
| S3       | image, video, file and voice uploads    | `s3 media`                               | helps        |
| S4       | room search, global search, paging      | `s4 search`                              | no           |
| S5       | Inbox mentions, threads, mark read      | `s5 inbox`                               | helps        |
| S6       | web and Android notifications, mute     | `s6 notifications`                       | yes          |
| S7       | voice calls, mute, participants         | `Hangout` (`voice`), DM `dmJuno`         | yes          |
| S8       | nameplates, decorations, banners, packs | `s8 cosmetic pack`, seeded profiles      | helps        |
| S9       | settings sync between web and Android   | none; the same account signed in on both | no           |

### S1 - send, edit, delete, react and reply

Fixture: `s1 chat` (`fixtures.s1`), ash and Juno. It holds a reply to ash's message, one line with a
single 👍 from ash, one with two 🎉 (one from each account), and a line waiting to be edited.

1. Open `s1 chat` as `ash`. Under "this message has a reply under it", Juno's "a reply with a quoted
   preview" shows the quoted original above the text. Clicking or tapping the quote jumps to the
   original; on Android the same works from the reply row.
2. Send a message from ash: type in the composer and press Enter/send. It appears immediately at the
   bottom, and on Juno's client within a sync round-trip. Reload: it is still there (it was sent, not
   only drawn).
3. Edit your new message: hover → **Edit** on web, long-press → **Edit** on Android. Change the text
   and save. The bubble changes in place and gets the `(edited)` marker; Juno sees the new text and
   the marker too. Opening the marker (or the message menu → edit history) lists the old and new
   versions.
4. From Juno, edit their own "welcome to S1: reply, edit me, then delete me" line, by the same
   menu or by sending an `m.replace`. Ash sees the text update and `(edited)` appear without a
   reload.
5. Delete (redact) the line you edited: message menu → **Delete**, confirm. Both clients replace it
   with the deleted-message placeholder and it stays deleted after a reload. The API alternative is
   the redact request in the table above.
6. Reactions: the line with the single 👍 shows **no number** on the chip. On web this holds in every
   message layout; on Android it holds in the **Bubble** layout - the Modern and Compact layouts
   print a `1` on every reaction chip, which is worth recording if the row expects otherwise. Tap
   the chip to remove your reaction and again to add it back; the count follows.
7. On "two reactions on this line show a count", the two 🎉 show a `2`. Remove one (from Juno via the
   API, or from ash's chip) and the chip goes back to one reaction with no number. Long-press
   (Android) or hover (web) the chip to see who reacted.
8. Reply to a Juno message: **Reply**, type, send. The sent message carries a preview of Juno's line
   (avatar, name, snippet) above it; clicking it jumps to the original. From Juno, reply to an ash
   message and check the preview on ash's side.
9. Reload both clients once. Reply previews, `(edited)` markers and reaction counts all come back
   from the server; no marker or count is left over from local state.

### S2 - threads

Fixture: `s2 thread` (`fixtures.s2`), ash and Juno. The root "thread root: what should the thread
test cover?" is by ash and already read; Juno has two replies in it, the second mentioning ash. The
room must show **no** badge before it is opened. (The seed's closing server counts may include the
thread replies - tuwunel counts them - but the app's room badge must not.)

1. On Home, `s2 thread` has no unread badge and no mention marker: the two replies belong to the
   thread, not to the room. (The same rule as N4.)
2. Open the room. Under the root, the thread summary says **2 replies** and shows the latest reply.
   Clicking it, or **Reply in thread** in the message menu, opens the thread: web uses the right-hand
   panel, Android a thread screen. The root stays pinned at the top.
3. Reply as ash in the thread. The summary under the root becomes **3 replies**; sending a message in
   the thread panel must not post it into the main timeline (check from Juno's client).
4. In the Inbox, **Threads** lists this thread as unread with its reply count (web: Inbox → Threads;
   Android: the thread button in the room, or Inbox → Threads). Opening it marks it seen, and the
   unread dot there goes away without adding a room badge. Android's thread list also has **All** and
   **My** filters (threads you take part in).
5. With ash on Home, have Juno send one more thread reply (API: a message whose `m.relates_to` is
   `{"rel_type":"m.thread","event_id":"<root>","is_falling_back":true,"m.in_reply_to":{"event_id":"<root>"}}`).
   The Inbox thread count rises; the room row still shows nothing.
6. Have Juno send a **plain** message in the same room instead. Now the room row does badge (this is
   the difference the thread rule makes), and opening the room clears it while the thread's own
   unread stays until the thread is opened.
7. Delete a thread reply as its sender and check the summary in the main timeline: the count drops
   and the latest-reply line updates or falls back to the previous reply. An empty thread shows the
   "no replies yet" state.

### S3 - uploads: image, video or file, voice

Fixture: `s3 media` (`fixtures.s3`), ash and Juno, with one image from Juno already in it. Use small
files; this homeserver keeps its media in the throwaway volume.

1. Open `s3 media`. Juno's `parity-photo.png` renders as an image bubble with a thumbnail. Click or
   tap it: the lightbox opens, and download/save works. On Android the image also opens in the gallery
   viewer with zoom.
2. As ash on web, attach an image with the paperclip or by dropping it on the timeline; on Android
   use **+ → Photo**. While it uploads, a progress row appears in the composer (percentage or
   indeterminate bar) and it can be cancelled; cancelling leaves nothing in the room.
3. When it finishes, send it. The bubble shows the image, not a file row, and Juno receives it without
   a reload. The upload row disappears once the message is sent.
4. Upload a short video the same way. Expect a video bubble with a thumbnail and play control; web
   opens the player/lightbox, Android plays inline or in the media viewer. The other client can play
   it too.
5. Upload a file (a PDF, zip or text file). Expect a file row with name, size and type, and a working
   download on both clients. A file too big for the homeserver is refused before or during upload
   with a visible error, not a silent failure.
6. Send a voice message: web has the microphone button in the composer, Android the voice recorder in
   the attachments sheet. Record a few seconds and send. Expect an audio bubble with play/pause, a
   waveform and the duration; the other client plays it, and the bubble still works after a reload.
7. Scroll back and reload. Every attachment comes back from the homeserver (thumbnail or file icon),
   not only from the local cache.

### S4 - search: room, global, paging

Fixture: `s4 search` (`fixtures.s4`), ash and Juno, unencrypted. It has 36 messages containing
`parity needle` - 35 from Juno and the newest from ash. That is two server pages (30 + 6).

1. Web, in `s4 search`: press Ctrl/Cmd+F (or use the room search in the header). Type
   `parity needle`. The timeline is replaced by a result list with sender, date and a highlighted
   snippet, newest first, and the search field shows a match count and next/previous arrows.
2. The first page lists 30 matches and a **Load more results** button. Click it: the remaining 6
   arrive, with no duplicates and no gap, and the button disappears at the end. Clicking a result
   jumps to that message in the timeline and closes the result list.
3. Android, in the same room: open the search screen from the room top bar. Type the same phrase. The
   list fills with matches and a **Searching older messages...** footer while it pages backwards; on
   reaching the start all 36 are listed. There is no `Load more` button - Android pages the loaded
   history itself - so the expected end state (36 matches, no duplicates) is the same.
4. Global search on web: press Ctrl/Cmd+K. It searches room and DM names, spaces and the messages
   already loaded in the current room, under headed sections. Type `s4`: `s4 search` is listed; open
   it from there.
5. In the same palette, type `parity needle` while `s4 search` is open. The **Messages in #s4 search**
   section shows the loaded matches and, when not all are shown, **Show all N matches in #s4 search**;
   that opens the room search from step 1. (Web global search does not search other rooms' history.)
6. Global search on Android: use the search field on Home. Rooms, DMs and spaces match by name after
   any text; after three characters it also asks the server for messages across unencrypted rooms,
   shown with room name and sender, and opening one jumps to it. There is no paging here either.
7. Encrypted rooms are the known limit: the server cannot index ciphertext, so web's room search
   falls back to matching only the messages this device has loaded and the palette says so. The
   fixture rooms are unencrypted; use an encrypted room to check the message.

### S5 - Inbox: mentions, threads, mark read

Fixture: `s5 inbox` (`fixtures.s5`), ash, Juno and Wren. Ash's read marker is on "thread root for the
Inbox"; after it Wren sent one plain message, Juno one that mentions ash and two thread replies (the
last mentions ash). Expected before opening: room badge **2**, mention marker present, no thread
count on the room row; Inbox has **1 mention** and **1 thread with 2 replies**. (The seed's closing
server counts may be higher because tuwunel counts the thread replies; the app's badge is the number
above.)

1. On Home as ash, check the badge and mention marker for `s5 inbox` against the line above. The
   plain message and the mention count; the thread replies do not.
2. Open **Inbox → Mentions** (web) or the Inbox sheet (Android). Exactly one row from Juno is listed,
   with the message text; the thread mention is **not** here (it belongs to the thread). Open the
   row: the room opens at that message, the entry leaves the list, and the room badge clears.
3. Open **Inbox → Threads**: the thread on "thread root for the Inbox" is listed with 2 replies and
   an unread dot. Open it: the thread opens on the root and the dot clears. The thread's unread is
   independent of the room's now-cleared badge.
4. Back on Home, have Juno send one more mention (API or second client). It appears in **Mentions**
   and the room badge becomes 1. Use the Inbox's mark-all-read action (web) or **Mark all read**
   (Android) without opening the room: the list empties and the badge drops to 0, because the mark
   is a server-side read receipt.
5. With ash on Home, have Juno send another mention and another thread reply. The mention appears in
   **Mentions**, the reply under **Threads**, and only the mention raises the room badge. Mark all
   read clears the mention list; the thread keeps its own unread until that thread is opened.
6. Optional but useful: save a message (message menu → **Save**), then check **Inbox → Saved**; it
   appears with room and text, opening jumps to it, and unsaving removes it.
7. Cross-client: open the mention on Android, then open web's Inbox without reloading. The mention
   is gone there too because the read receipt is server-side. Android's Inbox reads the same
   receipts.

### S6 - notifications: web, Android, mentions, mute

Fixture: `s6 notifications` (`fixtures.s6`), ash and Juno. Ash's read marker is on the last message
and the room notifies on all messages, so it starts with no unread and every new message notifies.

1. Web: Settings → Notifications, turn on desktop notifications and grant the browser/OS permission
   when it asks. Android: enable message notifications and grant the notification permission
   (Android 13+). Without the permission there is no banner, and the app must not pretend otherwise.
2. Put ash's client in the background (another tab or minimised window on web; Home on Android).
   From Juno send a plain `m.text` to `s6 notifications`. Web: a banner titled
   `Juno in s6 notifications` with the message text; on the desktop app it is an OS toast with Juno's
   avatar. Android: a notification titled `s6 notifications` with `Juno: <text>`, the room avatar and
   **Reply** and **Mark as read** actions.
3. Tapping the notification opens the room at the message. On Android, replying from the notification
   posts into the room (check with Juno) and **Mark as read** clears the notification and the badge.
4. Mention vs plain: from Juno send a message with
   `{"msgtype":"m.text","body":"...","m.mentions":{"user_ids":["<ash id>"]}}`. It notifies with the
   mention sound and high priority (Android), and sets the mention marker in the app; a plain message
   uses the ordinary sound. The banner text looks the same - the difference is the sound/priority and
   the marker, so listen and watch the badge.
5. Mute: room menu → notification mode → **Mute**. With ash in another room, have Juno send both a
   plain message and a mention. No banner and no sound arrive, and Android shows no notification.
   The messages still exist: opening the room shows them, and the Inbox may still list the mention
   (the Inbox reads the timeline, not push rules). Unmute and repeat: notifications return.
6. Focus rules: with `s6 notifications` open and focused on web, or on screen on Android, a new
   message produces no banner/sound (only the timeline updates). Switch away and it notifies.
7. Optional: in Settings, turn desktop notifications off but keep sounds on. Banners stop, sounds
   continue. On Android, the "notification sounds" toggle does the same independently of banners.

### S7 - calls: start, join, leave, mute, participants

Fixtures: the voice room `Hangout` (`rooms.voice`), created as a call room, and the DM with Juno
(`rooms.dmJuno`), which can start a call like any room. **This scenario needs two clients**: ash on
web (or the emulator) and Juno on the other. Calls also need the client well-known and Caddy's CA
trusted (see "Calls need one more step"); on the emulator start the stack with
`MUDRIX_TEST_MEDIA_HOST=10.0.2.2` and forward 7880/7881. UDP is not forwarded, so the emulator falls
back to TCP media.

1. As ash on web, open `Hangout` and join its voice channel from the sidebar/room (or, in a DM, use
   the phone button in the header to start a call). As Juno on the second client, join the same call
   (accept the incoming call in a DM, or join the voice room).
2. Expected within a few seconds: both clients show the call bar/stage with **2 participants**, names
   and avatars, and **Connected** (not "Connecting"). In a DM, Juno gets the incoming-call overlay
   first and answers it.
3. Mute on one side: the other sees the mic-off icon next to that participant; unmuting restores it.
   In a voice room the participant is not removed by muting, only marked muted. Deafening is local
   to the deafened client.
4. Leave from one client. The other stays in the call with **1 participant** and no error. The last
   one leaves: the call ends and the remaining client shows its "only one here" countdown before
   leaving, with **Stay** and **Leave now**. No ghost participant remains after the countdown.
5. Rejoin: the same accounts can join again, and a second device signed in as ash shows the "in this
   call on another device" notice with **Join here** rather than silently joining twice.
6. Declining: start a DM call from Juno and decline on ash. Juno sees "declined"; the room timeline
   gets the call event, not a message. A missed ring shows as a missed call.
7. If a client cannot reach LiveKit (untrusted CA, wrong media host), expect a clear call error
   (`errorAuth`/`errorConnection`) instead of a frozen stage. The call bots are the fallback when only
   one human client is available:
   `npm run test-server:bots Hangout ash:nocam juno mira:nocam`.

### S8 - cosmetics: nameplate, decoration, banner, packs

Fixtures: the seeded profiles already wear cosmetics - ash `crown` + `aurora`, Juno `cat-ears` +
`sunset`, Mira `halo` + `ocean-waves`, Sable `flame` + `starry-night`. `s8 cosmetic pack`
(`fixtures.s8`) is a room image pack named `Parity Art Pack` with a decoration (`Parity Sparkle`) and
a nameplate (`Parity Nameplate`); ash and Juno are subscribed to it.

1. As Juno, open Settings → Cosmetics. Under Decorations, the pack's **Parity Sparkle** is listed with
   the built-ins; choose it and save. Under Nameplates choose **Parity Nameplate**. Both are stored in
   Juno's extended profile, so they should appear on every client, not only in Juno's.
2. As ash, open Juno's profile from a message or the member list. The pack decoration is drawn around
   the avatar and the nameplate strip behind the display name; the profile card shows the same art.
   In a room, Juno's messages carry the decoration/nameplate too.
3. As ash, open your own profile → **Edit profile**/**Profile style** and change the decoration to a
   built-in (for example `neon-ring`) and the nameplate to `ocean-waves`. Juno sees the change
   without a reload. Returning to `crown`/`aurora` restores the seeded look.
4. Banner: on ash's own profile, use the banner area to upload an image (or pick a gradient where the
   client offers it), then save. Juno sees it on ash's profile card and in the lightbox. Removing the
   banner returns the generated gradient. Android offers the same from the profile style screen.
5. Pack switch: as ash, Settings → Cosmetics, turn **Show cosmetic packs** off. Juno's pack
   decoration and nameplate disappear from ash's views (avatars, profile, room list), while built-in
   cosmetics such as Mira's halo and ash's crown still draw. The pack's entries are hidden from the
   picker and the panel explains that packs are off. Turn it back on: the art returns immediately.
6. The switch is a synced preference of ash's account, not a server-wide setting: if ash's Android is
   signed in, it hides packs there too after sync, while Juno's own client still shows Juno's pack art
   (Juno's switch is on). This is the difference between a cosmetic (profile state) and the switch
   (account setting).
7. Reload both clients: decoration, nameplate and banner are still there (profile state), and the
   pack switch is still off/on as chosen (settings account data). Nothing is local-only.

### S9 - settings sync between web and Android

No room fixture: sign in as `ash` on both the web app and the emulator. Settings live in Matrix
account data (`io.github.kapsikkum.mudrix.settings`, plus the earlier `chat.mudrix.settings` name,
both written on every save), so they are not end-to-end encrypted - other users cannot read them, but
the homeserver admin can.

Synced: `theme`, `customThemes`, `messageLayout`, `messageLayoutMobile`, `language`, and the
preferences that are choices rather than facts about a device - for example `typingIndicators`,
`sendReadReceipts`, `showPresence`, time/date formats, notification sound packs and
`showCosmeticPacks`; every preference not in the device-only list below travels with them. Not synced
(device-only): UI scale/zoom, streamer mode, reduced-motion state, the notification-banner permission,
soundboard listening choices, and spellcheck settings.

1. On web as ash, Settings → Appearance: choose **Gruvbox** and message layout **Compact**. Change
   one preference too, for example turn **Show presence** off in Privacy. If the phone has its own
   **Message layout on phones** choice, clear it first (follow the main layout) or expect that
   choice to win on the phone - it is synced separately on purpose.
2. Wait a second for the save. To see what was written, request
   `GET /user/<ash id>/account_data/io.github.kapsikkum.mudrix.settings` with ash's token: the body
   has `theme`, `messageLayout` and `preferences` with the changed keys. The earlier
   `chat.mudrix.settings` event has the same content.
3. Force stop the Android app (not just background it) and relaunch, signed in as ash. The theme is
   Gruvbox, the timeline is Compact, and the presence toggle is off. Force-stopping proves the values
   came from the account, not from a live push the app happened to receive.
4. Change something on Android: theme **Ethereal**, layout **Bubble**, and turn presence back on.
   Wait a second, then reload web (not just focus the tab). Web matches. Change the language to
   **Deutsch** on web and relaunch Android: the app comes up in German; set it back to English.
5. Custom themes travel too: create one on web, choose it (`custom:<id>`), and Android offers and
   applies it because `customThemes` is part of the same event. A theme id whose custom theme has not
   arrived yet should fall back, not crash.
6. Check the boundary: change UI scale on web, or toggle the notification-banner permission. Android
   does not follow (those are device-only), and changing Android's own notification permission does
   not touch web. Soundboard volume/mutes and spellcheck settings behave the same way.
7. Privacy check: a second account's client cannot read ash's settings event (it is account data, not
   profile or room state). The homeserver admin can - do not put secrets there.
