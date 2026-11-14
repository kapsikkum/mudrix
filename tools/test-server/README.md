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
