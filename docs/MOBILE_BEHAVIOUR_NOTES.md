# Mobile behaviour notes: the reference app, and where Mudrix Android differs

> Correction from the owner: the reference app does have swipe-to-reply. Swiping a message to the left replies;
> swiping right goes back. Statements below that say it has no swipe-to-reply are wrong.

Written 2026-11-13 from a running Android phone (1080×2424 px at 420 dpi, so 411 × 923 dp; 1 dp = 2.625 px),
one hand-set dark theme, left-to-right. Numbers below are converted from on-screen bounds, rounded to whole dp.
"the reference app" is the popular voice/chat client that was observed; no product, server, channel or person is
named on purpose.

This file is a design reference, not a bug list. Nothing here was copied from the reference app's source, only from
its rendered UI.

---

## 1. How the observations were made

- Screens were read as **accessibility trees** (text, content-description, bounds, clickable/scrollable), with
  screenshots for appearance and for anything custom-drawn. The tree is unusually complete: message rows, reaction
  pills, reply previews, sheet rows, dialog buttons and every content tile all expose a label, so measurements and
  entry order in this document are read off the tree, not guessed from pictures.
- Emoji/sticker grid cells expose only a shortcode label; the grid itself is drawn. That is the one place the tree
  is thinner than the screen.
- Only one account was signed in, and it has no second live person, so anything that needs a peer (typing dots,
  "new messages" bar, a call with two participants) could not be observed. See §13.
- Every screen was reached with taps on navigation, never by changing settings.

---

## 2. Overall navigation

**There is no bottom tab bar.** The app is **rail | pane | detail**, all the time, on a 411 dp wide phone:

| Element         | Size on this device                                        | Notes                                                                  |
| --------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Left rail       | 189 px = **72 dp** wide, full height, scrollable           | separate surface colour from the pane                                  |
| Rail slot       | 158 px = **60 dp** tall                                    | icon is 116 px = **44 dp**, radius 16 dp (servers) or circle (DM home) |
| Content pane    | 888 px = **338 dp** wide, top-left radius ~16 dp           | looks like a card sitting next to the rail                             |
| Pane header     | 44 dp tall                                                 | see §5                                                                 |
| Bottom user bar | pinned inside the rail's pane, 32 dp visual + 12 dp margin | avatar + name + custom status + bell                                   |

The rail's first slot is the **direct-messages** icon (a chat bubble), then every server, then a pinned block at the
bottom with the **user bar**. Long server lists scroll inside the rail; the user bar never scrolls away.

**Moving between the three levels**

- Tap a rail icon → that server's channel list replaces the pane (the pane cross-fades, ~150 ms, no slide).
- Tap a channel or DM row → the chat slides in from the right over the pane (~250 ms, the pane shifts left by ~1/3
  as a parallax).
- **Swipe right anywhere in the chat** (not just the left edge) → back to the list. There is no visible peek or
  rubber-band; the gesture is recognised at roughly 100–120 px of horizontal travel.
- The chat's back arrow does the same thing. **Both are one level, always**: chat → list, list → (system back) exit.
  The channel list has no back arrow of its own; the rail _is_ the way up.
- **Left-edge** swipe-right and mid-screen swipe-right behave identically; the system back gesture also works.
- State survives process death: after killing and relaunching, the same server, channel, and message scroll offset
  came back. The rail keeps its scroll position too.

---

## 3. Server rail

- **Selection**: a 4 dp white pill on the rail's outer edge (left) beside the selected icon, 40 px tall, plus the
  icon itself is rounded-square (servers) and slightly enlarged.
- **Unread**: a short white dash on that same outer edge (7 dp tall) instead of a pill.
- **Mentions**: a red circle badge at the icon's bottom-right, white 11 sp number, 2 dp ring in the rail colour.
  The badge is the only saturated colour in the rail.
- Icon art is arbitrary (custom images, initials on a coloured square, a glyph); selected/unselected is expressed by
  shape and the edge pill, not by tint.
- **Long-press a server** → a **floating pop-up anchored to the icon** (not a bottom sheet, not centred): a card
  14 dp from the rail with the server name as a header, then `Mark as Read`, `Notifications`, `More Options`, rows
  ~56 dp, followed by an outside tap to dismiss.
- Folders are not present in this account, so folder rows, folder expansion and folder badges were **not observed**.
- **The header inside a server pane**: server name (20 sp bold) + chevron on its own line; below it a full-width
  rounded **Search** button (32 dp tall, magnifier + "Search" centred, radius 16 dp) with two 32 dp square icon
  buttons to its right: **Invite** and **Events**. The chevron / name opens the **server sheet** (§12).

---

## 4. Channel list

- Sections: an optional promo row first ("Server Boosts" + a `NEW` pill, 95 px = 36 dp tall), then category headers,
  then channel rows.
- **Category header**: 14 sp semibold grey, chevron right of the label, 28 dp tall, tap toggles the chevron.
  _(Collapsing the default "Text channels" section flipped its chevron but the channel stayed on screen in this
  build — treat collapse as "chevron state only" until checked on another server.)_ Long-press a category → an
  options sheet in the same shape as the channel sheet.
- **Channel row**: 95 px = **36 dp** tall, 8 dp horizontal inset, radius 8 dp when selected (a lighter fill), `#`
  glyph 20 dp muted, name 16 sp. Unread = white dot + semibold text; mention = red count badge at the right.
- **Voice channel row**: speaker glyph. When people are in it, participants are listed underneath as avatar + name
  (not observed with participants present).
- **Long-press a channel** → bottom sheet. Sheet top edge at ~370 dp (≈62 % of the screen) with a 4 dp drag handle
  and 24 dp corner radius, over a dimmed scrim. **Scrolling the sheet's content first drags the sheet up to ~85 %**
  (two detents, not three). Rows are 56 dp, grouped into cards with 8 dp gaps:
  1. header — server icon + `#channel-name`
  2. `Add to Favourites`
  3. `Invite`
  4. `Pin Channel to Top`, `Copy Link`
  5. `Mark as Read`, `Mute Channel`, `Notification Settings`, `Edit Channel`, `Duplicate Channel`, `Copy Channel ID`
- **Tap a voice channel** → the voice preview described in §11 (never joins by itself).

---

## 5. Chat screen

**Header (44 dp)**

```
[← with red mention count]   [#] channel-name  ›     [call] [search]
                             ● 1 Online
```

- The back button carries a **red counter of pending mentions** (the same number persists across the app); it is
  drawn on the button, not next to the title.
- The title block is a large tap target (~90 dp wide, full header height): channel glyph or DM avatar, name 20 sp
  bold, chevron, and a **subtitle line** — presence dot + "1 Online" for groups/DMs, nothing for channels without
  presence.
- Tapping the title block opens **channel details** (full screen, §10).
- Right icons: for a group DM a single **voice call** button; for a 1:1 a **voice** and a **video** button; then
  **search**. No overflow menu in the header.

**Messages**

- Avatar 40 dp at 12 dp from the left edge; content column starts at 64 dp.
- First message of a run: `name` 16 sp semibold, then inline tags (a small role/custom-status pill, a badge glyph),
  then the timestamp 12 sp in grey, all on one baseline; content on the next line.
- Continuation messages of the same author within a few minutes: content only, aligned to the same 64 dp column —
  no avatar, no name, no timestamp.
- Content line height ≈ 26 sp, so a one-line message row is ~22 dp and a three-line one ~82 dp.
- **Date separator**: centred 12 sp grey label with a 1 px rule either side, 24 dp of vertical air ("13 October 2026").
  Today / yesterday are spelled out, not dated.
- **Reply preview inside a message**: a small L-shaped connector line at the left, 24 dp avatar, author name and the
  quoted text truncated to one line, 12 sp, all clickable to jump to the original.
- **Edited**: ` (edited)` appended to the content in 12 sp grey, inline after the last character.
- **Reactions**: a row under the content. Each pill is ~44 × 30 dp, radius 15 dp, emoji 18 dp + count 13 sp; the
  pill you reacted with gets a 1 dp accent border and a tinted fill; a circular "add reaction" button (30 dp) sits
  after the last pill.
- **System rows** (joins, leaves, name changes) are single grey 13 sp lines at the 64 dp column with a small
  timestamp on a second line — no avatar.
- **Jump to present**: a 40 dp circular button with a down chevron, 16 dp above the composer, right aligned, visible
  as soon as the list is scrolled away from the bottom; tapping it animates back to the newest message.
- Large single images are aspect-fit, max ~63 % of the pane width, 16 dp corners.

---

## 6. Message interactions

- **Tap** a message body: nothing, except links/embeds/media (media opens the viewer) and the reply preview (jump).
- **Tap the avatar**: profile sheet for that author.
- **Long-press ≈ 0.5 s** (with a short haptic tick): bottom sheet, **top edge at ~62 %** of screen height, same
  two-detent behaviour as the channel sheet. Contents, top to bottom:
  1. **quick reaction row** — six 48 dp circles: the five most recently used emoji, then a grey `Add Reaction`
     circle. The one(s) you already reacted with are tinted. These are _your_ recents, not a fixed set.
  2. a hint line: `Double-tap a message to` + an inline underlined **Edit** (a teaching affordance, shown for your
     own messages).
  3. card: `Reply`, `Forward`, `Create Thread` (in a DM: no Create Thread)
  4. card: `Copy Text`, `Mark Unread`, `Pin Message`, `Bookmark Message`, `Create Reminder`, `Apps`,
     `Copy Message Link`, `Copy Message ID`
  5. card: `Report` (other people's messages only)
  6. card: `Delete Message` (own messages), destructive colour
     Own-message sheet is the same, with `Edit Message` first in card 3.
- **Double-tap** a message: reacts immediately with the first quick reaction, no menu, no confirmation.
- **Swipe**: left-to-right anywhere in the chat = go back. Swipe-left on a message does nothing. There is **no
  swipe-to-reply** in the reference app; reply lives in the long-press sheet.
- **Delete flow**: sheet → `Delete Message` → a centred dialog with a preview card of the message and two
  full-width stacked buttons `Yes` / `No` (105 px = 40 dp each). No "undo" toast.

---

## 7. Composer

Collapsed state (relative: 12 dp side margins, no border, sits 12 dp above the keyboard or gesture bar):

```
[ + ]  Message #channel           [gift] [emoji] [mic]
```

- One **pill**: radius 22 dp, height 44 dp, fill one step lighter than the pane; icons 20 dp with 12 dp gaps.
- Tap the input: keyboard rises, the pill **grows to multi-line** (up to ~6 lines, animated height), the `gift`
  icon is removed, and the **mic becomes a 36 dp blue rounded-square Send button** (radius 12 dp, scale+fade swap).
- While typing, a one-cell emoji suggestion tile appears just above the composer's right edge.
- **Reply / edit** are strips **inside** the pill, above the input, so the pill becomes two-storey:
  `Replying to <name>` … `[Mention OFF]` … `[x]`, or `Editing Message` … `[x]`. In a DM the Mention toggle defaults
  to **OFF**; the toggle is a small right-aligned chip.
- **`+`** does not open a menu: it swaps the keyboard for an **inline tray** — a media-selector panel (drag handle,
  empty-state art, "Enable in Settings") plus a card of four 52 dp tiles: `Photos`, `Poll`, `Apps`, `Files`
  (icon above a 12 sp label). The `+` itself becomes an `x` to close.
- **Emoji button** swaps the keyboard for a **docked panel**, not a modal: no scrim, message list still visible
  above, ~48 % of screen height, drag handle, then a **3-segment control `Emoji | GIFs | Stickers`** (active segment
  is a lighter pill), then a search field, then sections ("Favourites", "Frequently Used") in a **9-column grid** of
  33 dp cells with 8 dp gaps, and at the very bottom a strip of pack tabs (star = favourites, clock = recently
  used, then one tab per installed pack), a Unicode-category button, and a backspace key. The composer's emoji icon
  becomes a keyboard icon while the panel is open — the two never stack.
- **GIF tab**: search field, then a 2-column grid of category tiles with centred overlay labels, the first two being
  `Favourites` and `Trending`.
- **Slash autocomplete**: typing `/` opens a **floating card above the composer** (12 dp inset, 16 dp radius, no
  scrim): header with a clock icon and "Frequently Used", rows = app avatar + `/command` + one-line description +
  app name right-aligned, and a horizontal strip of app filter chips at the bottom of the card.
- **Mention autocomplete**: same card; user rows (avatar, display name, handle right-aligned) then special rows
  (`@game`, `@time`) with descriptions.
- **Mic**: with an empty composer the mic starts recording in place; the pill is replaced by a recording bar with
  cancel and send.
- **Attachment tray** above the input holds staged files (thumbnail, name, size, remove) and quality chip for video.

---

## 8. Direct-message list (the pane's "Messages" screen)

```
Messages                                    (+ new message, top right)
[search] [inbox]      [ Add Friends ]        [+]

── Happening Now (horizontal cards) ──
row: avatar  name                        4h
     You: last message preview…
```

- Title "Messages" 28 sp bold at 24 dp; a **toolbar row** of four controls under it: 32 dp search button, 32 dp
  inbox button, a wide `Add Friends` pill (32 dp tall, centred icon + label), and a 32 dp accent `+` (new message)
  square at the right edge.
- **"Happening Now"**: horizontal carousel of 149 × 88 dp cards (radius 16 dp) — avatar 48 dp, name 16 sp semibold,
  a status line (custom status / game) — scrolls independently of the list.
- **Rows are 50 dp**: avatar 40 dp with a 10 dp presence dot bottom-right, name 16 sp semibold, **timestamp 12 sp
  right-aligned**, **preview 14 sp single line** prefixed with `You: ` for your own messages, custom-status pills
  inline after the name, badges on the avatar. Pressed/selected row = lighter rounded rectangle.
- **Long-press a row** → sheet: header (56 dp avatar + `@handle`), then `Profile`, `Close DM` / `Add to
Favourites` / `Pin` / `Mark as Read`, `Mute Conversation` / `Copy Channel ID`.
- **`+` (new message)** → full screen: back arrow, "To:" chip field with "Search your friends", fixed rows
  `New Group`, `Add a Friend`, then the friend list grouped by initial with presence + handle.
- **Inbox button** → the notifications screen (§12): header with back + `Bookmarks` / `Reminders` / `More`, a
  dismissible promo card, then "Recent Activity" cards (avatar, "X mentioned you in …", relative time, one-line
  preview, a `Send a Reply` chip).
- **Message requests** is its own full screen with a `Requests | Spam` segmented control and a mascot empty state.

---

## 9. Member list, profile sheets, the "You" screen

- **No persistent member panel on phones.** The member list is the **Members tab of channel details** (§10):
  horizontally scrolling tabs, then `Online — 1` style group headers, then 56 dp member rows (presence dot, name,
  role tags, presence emoji, a crown for the owner).
- **Profile sheet**: near-full-screen sheet with a drag handle, banner, 68 dp avatar + presence, name + handle +
  badges, action buttons, then `Main | Activity | Wishlist` tabs and sections: `Bio`, `Member Since`,
  `Connections` (rows with an external-link glyph), `Note (only visible to you)`, plus a `…` overflow at the top
  right. Tapping your own avatar in a message opens the same sheet for yourself.
- **The "You" screen** (bottom user bar): full screen with an `X` close, a 90 dp avatar with status dot, name +
  handle, a full-width **Edit Profile** pill, the same three tabs, cards, a `Friends` row, and a floating
  bottom dock of four icon+label buttons (Quests / Shop / a subscription store / **Settings**), each with a red dot
  for new items. This is the app's only "profile + settings + store" surface.
- **Settings**: full screen, `X` close at the top left, title, a **search field**, grey section headers in small
  caps, and grouped 56 dp rows (leading icon, label, chevron). Sections are grouped by domain, not one long list.
  Only the top level was opened; nothing was changed.

---

## 10. Channel details (the "info" screen behind the chat header)

Full screen, slides in from the right:

- Top bar: `←`, then `search`, `mute`, `settings` icon buttons.
- A 68 dp tile with the channel glyph, the channel name (24 sp bold) and its type ("Text Channel").
- **Horizontally scrolling tabs with a 2 dp underline**: `Members`, `Media`, `Pins`, `Threads`, `Links`, `Files`.
  (A DM's version drops `Pins`.)
- Body per tab: `Invite Members` row, then the grouped member list; `Media` = a 3-column grid of square tiles
  (123 dp cells, 4 dp gaps); `Threads` = empty state ("There are no threads." + explanation + `Create Thread`);
  `Pins`, `Links`, `Files` reuse the same card/grid grammar.

---

## 11. Voice (observed without joining)

Tapping a voice channel does **not** join. It opens a preview that takes the bottom ~55 % of the screen:

- The channel list stays visible above, dimmed.
- A bar: `⌄` collapse, **channel name ›**, a notifications glyph, an invite glyph.
- Centred empty state: "No one's here yet! When you are ready to talk, just hop in."
- Bottom bar: a **red muted-mic toggle** (48 dp), a large **green "Join Voice"** button (~62 % width, 48 dp), and
  a chat-bubble button that opens the channel's text chat.
- Collapsing returns to the channel list; the preview is a state, not a route (back exits it first).

---

## 12. Unread, notifications and sheets

**Surfaces, and how they move**

| Surface                                                                                 | Type                                                              | Motion                                                                 |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Server sheet, channel sheet, message sheet, DM row sheet                                | full-width **bottom sheet**, 24 dp top radius, 4 dp handle, scrim | slide up ~200 ms; two detents (~62 % then ~85 %); drag down to dismiss |
| Server long-press                                                                       | **floating pop-up** anchored to the icon                          | fade/scale in place                                                    |
| Destructive confirm                                                                     | centred **dialog**                                                | fade                                                                   |
| Channel details, settings, search, profile, "You", inbox, message requests, new message | **full screen** pushed from the right                             | slide + pane parallax                                                  |
| Emoji/GIF/sticker panel, attachment tray                                                | **docked panel**, replaces the keyboard, no scrim                 | height animation with the IME                                          |
| Slash/mention autocomplete                                                              | floating card **above** the composer                              | fade + rise                                                            |

**Unread / mention signals**

- Rail: edge pill (selected), edge dash (unread), red count badge (mentions).
- Channel rows: dot + bold (unread), red badge (mentions).
- List rows: bold name, and the preview reads `You: …` for your own last message.
- Chat: back arrow carries the mention count; "Jump to present" appears when scrolled away.
- Inbox: bell dot, then Recent Activity cards with a `Send a Reply` chip.
- There is no "mark all read" in any of the surfaces reached; the only mark-read affordances are inside the
  long-press sheets.

**Search**

- Full screen: search field with an accent focus ring, a filter glyph at the right, a tab row
  `Recent | People | Media | Pins | Links | Files` with an underline, and an empty state that is already useful
  (a 3-column "Photos & Media" grid + `View all`). The placeholder states the scope ("Search in DMs").

**Media viewer**

- Full screen black: `X` top-left, `…` top-right, image letterboxed and aspect-fit, horizontal paging inside a
  gallery.
- Bottom: author avatar + name + badge + timestamp, a `React` pill, and a **thumbnail strip** of the gallery with
  the active thumb outlined.

---

## 13. What could not be observed

| Not observed                                               | Why                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Typing indicator, "new messages" bar, jump-to-newest count | needs a second live participant; nothing could be triggered without messaging someone               |
| Server folders, folder badges, folder expand               | no folders in the signed-in account                                                                 |
| Category collapse actually hiding channels                 | the chevron flipped but rows stayed; may be a server without real categories                        |
| Voice channel with participants (avatars, speaking ring)   | nobody was in the voice channels, and joining is out of scope                                       |
| Call / stage screens                                       | would require joining                                                                               |
| Push notification appearance, notification settings pages  | system + account state, out of scope                                                                |
| Tablet / foldable layout, split view                       | single phone form factor only                                                                       |
| Message swipes other than "back"                           | the reference app has none; swipe-left was tried and does nothing                                   |
| Mid-gesture animation frames (slow swipe)                  | three captures taken during a slow swipe came out identical, so timing claims above are approximate |

---

## 14. Behaviour vs. Mudrix Android today

Read-only audit of `apps/android/app/src/main/kotlin/org/wizardchat/android/ui/**`. Sizes: **S** ≤ half a day,
**M** 1–3 days, **L** ≥ a week.

| #   | Behaviour                | the reference app                                                                                 | Mudrix Android today (file:line)                                                                                             | Gap                                                                                   | Suggested change                                                                              | Size         |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| 1   | Primary navigation shell | persistent 72 dp **server rail** + pane + chat; no bottom bar                                     | floating pill island with 4 tabs, hidden inside rooms — `ui/home/MainScreen.kt:377`, tab enum `:93`, hidden `:167`           | different model: Mudrix has no rail, and spaces are a separate list tab               | add a rail variant behind a pref (see #15); keep the island for one-handed use                | L            |
| 2   | Space/server switching   | one tap on the rail, pane cross-fades                                                             | switch tab → Spaces list → tap space (`MainScreen.kt:349-353`)                                                               | two taps + a full list screen                                                         | rail removes the middle screen                                                                | L (iOS: yes) |
| 3   | Rail long-press          | floating pop-up: Mark as Read / Notifications / More Options                                      | no long-press on the space list (`ModernSpaceList.kt`)                                                                       | missing                                                                               | anchored `DropdownMenu` on each rail/list item                                                | S            |
| 4   | DM row content           | avatar + presence dot + name + **timestamp** + **preview line** + status pills                    | name only, no preview, no time — `ui/home/RoomListScreen.kt:582-593`                                                         | the list cannot be skimmed                                                            | add preview + relative time + presence dot; `RoomSummary` already carries last event          | M            |
| 5   | List header controls     | title, then search 32 dp, inbox 32 dp, wide `Add Friends`, accent `+`                             | big title, `+` dropdown and inbox icon in the bar; search is a **text field** in the body — `RoomListScreen.kt:206-237`      | no one-tap search, no wide action, `+` is a menu                                      | add a toolbar row; keep the inline field for quick filter or drop it                          | S–M          |
| 6   | Unread feel              | edge dash on rail, red count badges, bold rows, `You: ` prefix, mention counter on the back arrow | badges on rows — `RoomListScreen.kt:596-603`; section headers aggregate — `:648-651`                                         | no rail, no back-arrow counter, previews missing                                      | derive the counter from the same unread state in `RoomScreen.kt:664` header                   | S            |
| 7   | Chat header              | title block with presence subtitle + chevron, back with mention badge, call + search icons        | floating title capsule, 3 icon buttons (threads, jump-to-date, call) — `ui/room/RoomScreen.kt:664-694`                       | capsule reads as a button; no presence subtitle; no search in header                  | flatten into a header: back, name + subtitle, chevron, search + call                          | M            |
| 8   | Message grouping         | name/tags/time on first row, bare content after                                                   | implemented — `RoomScreen.kt:991-1113`                                                                                       | none                                                                                  | keep                                                                                          | –            |
| 9   | Date separators          | centred label with rules, today/yesterday words                                                   | `RoomScreen.kt:834-841` + `Formats.isToday/isYesterday`                                                                      | none                                                                                  | keep                                                                                          | –            |
| 10  | Reply preview in message | connector line + 24 dp avatar + one-line quote                                                    | `RoomScreen.kt:1113` `ReplyQuoteView`                                                                                        | visual detail unknown, structure present                                              | match the connector line and 24 dp avatar                                                     | S            |
| 11  | Edited mark              | inline 12 sp ` (edited)`                                                                          | `RoomScreen.kt:1317-1321`, `:1346-1355`                                                                                      | none                                                                                  | keep                                                                                          | –            |
| 12  | Reaction pills           | 30 dp tall pills, accent border on mine, add-reaction circle                                      | `RoomScreen.kt:1170-1172` `ReactionsBar`                                                                                     | check pill height/border                                                              | align to 30 dp pill + border on own                                                           | S            |
| 13  | Message long-press sheet | author header card, 5 quick reactions + add, teach line, 4 grouped cards, delete last             | one flat `WizardSheet` list, circle emoji, no header — `RoomScreen.kt:1578-1673`                                             | no grouping, no author header, no teach line; drag = one detent (`Navigation.kt:180`) | restructure into cards + author header; add the double-tap hint                               | M            |
| 14  | Double-tap to react      | reacts instantly with the first quick emoji                                                       | only `onLongClick` — `RoomScreen.kt:1051-1055`                                                                               | missing                                                                               | add `onDoubleClick` to the existing `combinedClickable`                                       | S            |
| 15  | Swipe gesture in chat    | swipe-right anywhere = back                                                                       | swipe-right **replies** at 64 dp — `RoomScreen.kt:1006-1042`; back only via system/back button                               | conflicting gesture                                                                   | pick one: recommend swipe-right = back and reply stays in the sheet (parity X2 says the same) | M            |
| 16  | Delete confirmation      | centred dialog with message preview + `Yes`/`No`                                                  | `ConfirmDialog` with title/message text — `Navigation.kt:221-248`                                                            | no preview card, buttons side by side                                                 | pass the preview composable; stack the buttons                                                | S            |
| 17  | Composer shape           | single 44 dp pill, 12 dp margins, icons inside                                                    | pill with `floatingGlass` + shadow — `composer/ComposerView.kt:651`                                                          | shadow + separate send button box                                                     | flatten shadow, 22 dp radius, 44 dp min height                                                | S            |
| 18  | Send/mic swap            | mic ↔ 36 dp accent square, gift icon hides while typing                                           | `AnimatedContent` swap — `ComposerView.kt:695-699`                                                                           | close already                                                                         | verify size/radius                                                                            | S            |
| 19  | Reply/edit strip         | inside the pill: label + Mention toggle + X                                                       | `ContextBar` inside the pill — `ComposerView.kt:652-662`, `:901`                                                             | no Mention toggle in replies                                                          | add an "include-mention" chip for replies                                                     | S            |
| 20  | `+` attachment surface   | inline tray: recent-media strip + 4 big tiles (Photos/Poll/Apps/Files)                            | dropdown menu of 12 items — `ComposerView.kt:612-648`                                                                        | a menu, not a tray; no recent media                                                   | convert to a tray panel with a media strip and 4 tiles, keep the long tail behind "more"      | M            |
| 21  | Emoji/GIF/sticker panel  | docked panel, no scrim, 3 segmented tabs, 9-col grid, pack strip at the bottom                    | `ModalBottomSheet` at 90 % height, 3 `SegmentedButton` tabs, grid + jump bar — `composer/MediaPicker.kt:95-157`, `:160+`     | modal instead of docked; no pack strip                                                | re-host the same content in an IME-height panel above the composer                            | M            |
| 22  | Autocomplete surface     | floating card above the composer with app/emoji/mention rows                                      | `SuggestionList` — `ComposerView.kt:581`, suggestions built `:340-364`                                                       | shape/spacing unknown; works                                                          | style as the floating card                                                                    | S            |
| 23  | Channel details          | full screen, tabs Members/Media/Pins/Threads/Links/Files                                          | room info sheet + separate threads/gallery screens (`ui/people/RoomInfo.kt`, `ui/room/Threads.kt`, `GalleryAndMedia.kt:350`) | no single tabbed info surface; members live in a sheet                                | add a tabbed info screen and route the header tap there                                       | L            |
| 24  | Member list              | grouped sections with counts, 56 dp rows                                                          | `lazyGroupedSection(... "title  ${size}")` — `ui/people/MembersUi.kt:121-158`                                                | already grouped with counts                                                           | keep; surface it from the new info screen                                                     | –            |
| 25  | Profile sheet            | near-full-screen sheet, banner, tabs, Connections, Note                                           | `ui/people/MembersUi.kt:196` `UserProfileSheet`                                                                              | unknown parity; check banner/tabs/note                                                | align layout order                                                                            | M            |
| 26  | "You" screen             | full screen from the bottom user bar: avatar, Edit Profile, tabs, dock                            | `Tab.me` → `SettingsScreen(isTab = true)` — `MainScreen.kt:327-330`, `ui/settings/SettingsUi.kt:88`                          | Mudrix jumps straight into settings; no profile home                                  | add a profile head above settings (avatar, name, Edit Profile)                                | M            |
| 27  | Settings chrome          | search field, grey section caps, grouped rows, X close                                            | `SettingsUi.kt:127-141` with search + grouped rows; "Done" text button                                                       | close affordance is text, sections may be flatter                                     | use an X/back icon and group by domain                                                        | S            |
| 28  | Voice preview            | bottom-half preview with "No one's here yet", mic toggle, Join, chat                              | tap goes straight into `VoiceRoomScreen` (`MainScreen.kt:359`, join at `ui/voice/VoiceUi.kt:178`)                            | no preview step, so you cannot peek at a room without entering it                     | add a preview state before joining                                                            | M            |
| 29  | Media viewer             | thumbnail strip + author row + React pill                                                         | `MediaPagerView` pager + `1/3` indicator + dots menu — `ui/room/GalleryAndMedia.kt:200-267`                                  | no thumb strip, no author row, no react                                               | add the strip and the footer chip                                                             | M            |
| 30  | Search screen            | field with focus ring, Recent/People/Media/Pins/Links/Files tabs, useful empty grid               | `ui/search/SearchUi.kt`                                                                                                      | parity unknown                                                                        | align tab set + empty state                                                                   | M            |
| 31  | Inbox card               | mention cards with avatar, "mentioned you in", time, preview, `Send a Reply`                      | `ui/home/InboxSheet.kt`, `InboxExtras.kt`                                                                                    | sheet, not a screen; card wording to check                                            | keep sheet, adopt card content                                                                | S            |
| 32  | Jump to present          | 40 dp circular button, 16 dp above composer                                                       | `JumpToNewestButton` — `RoomScreen.kt:758-791`, new-count label                                                              | text label vs icon                                                                    | keep the count (better), use the circular icon form                                           | S            |
| 33  | Sheet detents            | 62 % → 85 % on scroll                                                                             | `skipPartiallyExpanded = true` — `Navigation.kt:183`                                                                         | single detent                                                                         | allow a partial detent for message/channel sheets                                             | S            |
| 34  | Category collapse        | chevron + persisted collapsed set                                                                 | persisted per section — `RoomListScreen.kt:141-147`, animated chevron `:626`                                                 | Mudrix is _ahead_ here                                                                | keep                                                                                          | –            |
| 35  | DM row long-press        | Profile / Close DM / Favourite / Pin / Mark read / Mute / Copy ID                                 | `RoomMenu.actions(...)` — `RoomListScreen.kt:436`                                                                            | verify wording/order parity                                                           | align order with the reference                                                                | S            |

---

## 15. Top 15 changes, in priority order

"iOS" says whether the same change applies to the iOS app (it is the same shell idea, so most do).

| #   | Change                                                                                                                                                          | Why it matters                                                                                           | Size | iOS     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- | ------- |
| 1   | **Make the DM row carry the conversation**: preview line, relative time, presence dot, status pills (`RoomListScreen.kt:582`)                                   | it is the single most-used screen; today it is a bare name list                                          | M    | yes     |
| 2   | **Flatten the chat header** into back + name with presence subtitle + chevron + search/call, and put the mention count on the back button (`RoomScreen.kt:664`) | the capsule reads as a button inside a button, and the subtitle is the only "who is here" cue in the app | M    | yes     |
| 3   | **Rebuild the message sheet** as author header + quick reactions + grouped cards (`RoomScreen.kt:1578`)                                                         | this is the app's main verb; grouping and the reaction row are what makes it feel native                 | M    | yes     |
| 4   | **Add double-tap to react** (`RoomScreen.kt:1051`)                                                                                                              | one gesture replaces three taps; zero visual cost                                                        | S    | yes     |
| 5   | **Resolve the swipe conflict**: swipe-right = back, reply stays in the sheet (`RoomScreen.kt:1006`)                                                             | parity requires a back gesture; two conflicting right-swipes cannot coexist                              | M    | yes     |
| 6   | **Dock the emoji/GIF/sticker panel** instead of a 90 % modal (`MediaPicker.kt:95`)                                                                              | docking keeps the conversation visible and makes pickers instant                                         | M    | yes     |
| 7   | **Turn `+` into a tray** with a recent-media strip and four big tiles (`ComposerView.kt:612`)                                                                   | a 12-item dropdown is the least phone-like surface in the app                                            | M    | yes     |
| 8   | **Channel details as one tabbed screen** (Members/Media/Pins/Threads/Links/Files) (`RoomInfo.kt` + `Threads.kt` + `GalleryAndMedia.kt:350`)                     | today the same content is split across a sheet and two routes                                            | L    | yes     |
| 9   | **Give the You tab a profile head** (avatar, name, Edit Profile) above settings (`MainScreen.kt:327`)                                                           | the reference's "me" is a place; Mudrix's is a settings list                                             | M    | yes     |
| 10  | **Voice channel preview** before joining (`MainScreen.kt:359`)                                                                                                  | lets you peek at who is in a room; currently the only way to look is to join                             | M    | yes     |
| 11  | **Rail as an optional navigation shell** (pref), keeping the pill island for those who like it (`MainScreen.kt:377`)                                            | the whole three-pane model hangs off this; but it is the biggest change, so it is opt-in first           | L    | partial |
| 12  | **Delete confirmation with a preview**, stacked Yes/No (`Navigation.kt:221`)                                                                                    | destructive actions deserve the message in front of you                                                  | S    | yes     |
| 13  | **Second sheet detent** (62 % → 85 %) for message/channel sheets (`Navigation.kt:183`)                                                                          | makes long sheets feel light instead of full-screen                                                      | S    | partial |
| 14  | **List toolbar**: search button + inbox + a wide primary action + accent `+` (`RoomListScreen.kt:206`)                                                          | one-tap search instead of a text field that hijacks the list                                             | S    | yes     |
| 15  | **Media viewer footer**: thumbnail strip, author row, react chip (`GalleryAndMedia.kt:200`)                                                                     | small, but it is the moment after every screenshot                                                       | M    | yes     |

Honourable mentions, not in the 15: rail long-press pop-up (#3 in the table), reaction pill border (#12),
`You: ` preview prefix (#6), mention count on the back arrow (#6), and keeping Mudrix's persisted category
collapse (#34), which is already better than the reference app.

---

## 16. One-line summary

The reference app is **rail-first, sheet-second, modal-never**: a persistent 72 dp server rail, a single content
pane, full-screen pages pushed right, two-detent bottom sheets for every menu, and pickers docked into the
composer. Mudrix Android already has the hard parts — grouping, replies, reactions, date separators, jump-to-newest,
typing, threads, pinned/reminders, voice — and its weak points are the _surfaces_: the DM row carries no
conversation, the header is a capsule, menus are flat dropdowns or modals, and there is no rail.
