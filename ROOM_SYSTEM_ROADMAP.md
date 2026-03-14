# Room System — Implementation Roadmap

**Project:** Cultural Games
**Feature:** Global Room System replacing per-game multiplayer
**Date drafted:** 2026-03-14
**Phases:** A through J (10 phases)

---

## Codebase Audit Summary

Before reading this roadmap, the following files were read in full:

| File | Key findings |
|---|---|
| `js/utils/multiplayer.js` | Full-state blob sync via `postgres_changes` on `rooms` table; hardcoded 2-player (`host_id` + `guest_id`); echo suppression via `last_actor`; `sendState()` does a full row UPDATE |
| `js/games/tien-len.js` | Has `initOnlineUI()`, `syncOnlineState()`, `receiveOnlineState()`, `startOnlineGame()`, `leaveRoom()`. Reads/writes `Multiplayer.*`. 2-player online (host=seat 0, guest=seat 2, 2 AI fill seats 1 and 3) |
| `js/games/mahjong.js` | Identical pattern to tien-len. 4-player game but online is 1v1 (2 seats are human, 2 are AI placeholders). Full state blob includes `hands`, `wall`, `melds`, `discards`, `phase`, etc. |
| `js/utils/auth.js` | Manages Supabase auth, session, account page. Exposes `window._user`. GAMES registry array at line ~49 |
| `pages/games/mahjong.html` | Has `.mp-panel#mj-mp-panel` with three `.mp-row` divs (lobby/join-form/room). Scripts: supabase CDN → helpers.js → navigation.js → auth.js → multiplayer.js → mahjong.js |
| `pages/games/tien-len.html` | Same pattern as mahjong.html with `tl-` prefix IDs |
| `index.html` | Nav has `Browse Games` and `About` only. No `Rooms` tab yet. Scripts: navigation.js → auth.js |
| `css/global.css` | Design tokens: `--color-bg: #FBF5E6`, `--color-primary: #1A0E06`, `--color-accent-red: #B83232`, `--color-accent-gold: #C89B3C`, `--color-accent-teal: #2C7873`. Font: Inter + Playfair Display |
| `css/components.css` | `.site-nav`, `.btn`, `.game-card`, `.badge`, `.filter-btn`, `.games-grid`, `.browse-hero` |
| `css/games.css` | `.game-page`, `.game-container`, `.accordion`, `.mp-panel`, `.mp-row` (at line 3417) |
| No SQL migration files | No `/supabase` folder exists. Schema was created directly in Supabase dashboard |
| 9 game JS files | Only `tien-len.js` and `mahjong.js` have online multiplayer. The other 7 are local-only |

### Current `rooms` table schema (inferred from code)

```
rooms
  id          uuid  PRIMARY KEY
  code        text  UNIQUE        -- 4-char alpha e.g. "ABCD"
  game        text                -- e.g. 'tien-len', 'mahjong'
  host_id     text                -- cg_pid from localStorage
  guest_id    text                -- set when guest joins
  status      text                -- 'waiting' | 'playing' | 'finished'
  board_state jsonb               -- full game state blob
  (created_at timestamp implied)
```

---

## Architecture Decision: iframe Embedding

Games are self-contained IIFEs that own `#game-container`. Rather than refactoring all of them into importable modules, the room page embeds games in `<iframe>` elements. This provides:

- **Zero namespace collision** between game instances (critical for dual-instance mode)
- **Spectator isolation** — read-only iframe receives state via `postMessage`
- **Backwards compatibility** — standalone game pages continue to work unchanged
- **Clean dual-instance** — two iframes side by side

Communication channel: `window.postMessage` + `iframe.contentWindow.postMessage`. The game iframe listens for `{type:'room-state', data:{...}}` messages and the room page listens for `{type:'game-event', event:'win'|'sync', data:{...}}` messages.

Game pages detect they are embedded by reading `?roomId=...&roomCode=...&seat=...&role=host|guest|spectator` URL params and suppress their own mp-panel UI accordingly.

---

## Phase A — Database Schema Migration

**Complexity:** Low
**Files to create/modify:** Supabase dashboard SQL editor (no local file); create `supabase/migrations/001_room_system.sql` for reference

### What to build

Run the following SQL in the Supabase dashboard to extend the `rooms` table:

```sql
-- Extend rooms table for Room System v2
ALTER TABLE rooms
  -- Upgrade join code to 6-char alphanumeric (e.g. "BIRD42")
  ALTER COLUMN code TYPE text,

  -- Replace binary host/guest with ordered player array (up to 4)
  ADD COLUMN IF NOT EXISTS player_ids    jsonb DEFAULT '[]'::jsonb,

  -- Display name per player_id: { "p123abc": "Alice" }
  ADD COLUMN IF NOT EXISTS player_names  jsonb DEFAULT '{}'::jsonb,

  -- Win counter per player_id: { "p123abc": 3 }
  ADD COLUMN IF NOT EXISTS player_wins   jsonb DEFAULT '{}'::jsonb,

  -- Role per player_id: { "p123abc": "player" | "spectator" }
  ADD COLUMN IF NOT EXISTS player_roles  jsonb DEFAULT '{}'::jsonb,

  -- Ready state per player_id: { "p123abc": true }
  ADD COLUMN IF NOT EXISTS player_ready  jsonb DEFAULT '{}'::jsonb,

  -- Game suggestions queue: [{game, suggested_by, name, ts}]
  ADD COLUMN IF NOT EXISTS suggestions   jsonb DEFAULT '[]'::jsonb,

  -- Lobby selection mode
  ADD COLUMN IF NOT EXISTS lobby_mode    text  DEFAULT 'host-pick',

  -- Currently selected game (after host pick or lottery)
  ADD COLUMN IF NOT EXISTS selected_game text,

  -- Game instance state(s): [{instance_id, assignments, board_state, status, winner_id}]
  -- Replaces board_state for multi-instance support
  ADD COLUMN IF NOT EXISTS game_instances jsonb DEFAULT '[]'::jsonb,

  -- Chat log (last 200 messages): [{pid, name, text, ts}]
  ADD COLUMN IF NOT EXISTS chat_messages  jsonb DEFAULT '[]'::jsonb,

  -- Max players for this room (2 or 4)
  ADD COLUMN IF NOT EXISTS max_players    int   DEFAULT 4,

  -- TTL — room auto-expires after 4 hours of creation
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz DEFAULT (now() + interval '4 hours');

-- Keep board_state for backwards compatibility with old per-game mp-panels
-- during Phase H migration. Remove it in Phase J.

-- Index for fast code lookups (already exists but confirm)
CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_idx ON rooms(code);

-- RLS: allow any anon to read rooms by id or code
-- allow any anon to update rooms they are a participant of
-- (adjust to match existing RLS policies)
```

Create the reference file locally:

```
supabase/
  migrations/
    001_room_system.sql    ← paste the SQL above
```

### New join code format

Change `randomCode()` in `multiplayer.js` (and the new `room.js`) from 4-char alpha to 6-char alphanumeric using a wordlist-style generation:

```js
// Generates codes like BIRD42, MOON7X, LAKE93
function randomCode() {
  var words  = ['BIRD','MOON','LAKE','FISH','DRUM','GOLD','JADE','SILK','WAVE','FIRE',
                'STAR','RAIN','MIST','ROSE','SAGE','TIDE','DUSK','DAWN','HILL','REED'];
  var digits = '23456789';
  var word   = words[Math.floor(Math.random() * words.length)];
  var d1     = digits[Math.floor(Math.random() * digits.length)];
  var d2     = digits[Math.floor(Math.random() * digits.length)];
  return word + d1 + d2;
}
```

### Acceptance tests

- [ ] After running migration SQL, `SELECT * FROM rooms LIMIT 1` in Supabase shows all new columns
- [ ] Old rooms rows still exist and `board_state` column is intact
- [ ] `code` column accepts 6-char values like `BIRD42`
- [ ] `player_ids` column accepts a JSON array: `UPDATE rooms SET player_ids = '["p1","p2"]' WHERE id = ...`

---

## Phase B — Room Core JS (`js/utils/room.js`)

**Complexity:** Medium
**Files to create:** `js/utils/room.js`
**Files to modify:** none yet (multiplayer.js stays untouched until Phase J)

### What to build

`room.js` is the new central room management library. It exposes `window.Room` (distinct from `window.Multiplayer` which remains for legacy game pages). It wraps Supabase exactly like `multiplayer.js` does — same URL/KEY, same `postgres_changes` subscription pattern.

```
window.Room = {
  // Identity
  getPlayerId()                    → string (same cg_pid as Multiplayer)
  getPlayerName()                  → string (from localStorage 'cg_name' or _user.display_name)
  setPlayerName(name)              → void (saves to localStorage 'cg_name')

  // Room lifecycle
  createRoom(opts)                 → Promise<{code, roomId, role:'host'}>
  joinRoom(code, opts)             → Promise<{code, roomId, role:'guest'}>
  leaveRoom()                      → Promise<void>
  subscribeRoom(roomId, handlers)  → void (sets up postgres_changes)

  // Lobby actions (all do an UPDATE on rooms row)
  setPlayerReady(ready)            → Promise<void>
  suggestGame(gameKey)             → Promise<void>
  removeSuggestion(idx)            → Promise<void>
  setLobbyMode(mode)               → Promise<void>  // 'host-pick'|'lottery'
  selectGame(gameKey)              → Promise<void>   // host only
  sendChatMessage(text)            → Promise<void>

  // In-game actions
  setPlayerRoles(rolesMap)         → Promise<void>
  startGame(instanceId)            → Promise<void>
  endGame(instanceId, winnerId)    → Promise<void>
  incrementWin(playerId)           → Promise<void>
  rematch()                        → Promise<void>
  backToLobby()                    → Promise<void>

  // State getters (read from last received room row)
  currentRoom()                    → room object or null
  amHost()                         → boolean
  myRole()                         → 'player'|'spectator'|null
}
```

**Internal state:**

```js
var _room    = null;   // last received room row
var _channel = null;   // supabase channel
var _db      = null;
var _pid     = null;
var _cbs     = {};     // { onLobbyUpdate, onGameUpdate, onChatUpdate, onError }
```

**Subscription handler** — single `postgres_changes` UPDATE listener, dispatches to the right callback based on `room.status`:

```js
function onRoomUpdate(payload) {
  var r = payload.new;
  _room = r;
  if (r.status === 'lobby'   && _cbs.onLobbyUpdate)  _cbs.onLobbyUpdate(r);
  if (r.status === 'playing' && _cbs.onGameUpdate)   _cbs.onGameUpdate(r);
  if (_cbs.onChatUpdate) _cbs.onChatUpdate(r.chat_messages || []);
}
```

**`sendChatMessage`** appends to the `chat_messages` array (capped at 200 entries):

```js
sendChatMessage: async function(text) {
  var msgs = (_room.chat_messages || []).slice(-199);
  msgs.push({ pid: _pid, name: Room.getPlayerName(), text: text, ts: Date.now() });
  await db().from('rooms').update({ chat_messages: msgs }).eq('id', _room.id);
}
```

**`incrementWin`** reads `player_wins`, increments the target player, writes back:

```js
incrementWin: async function(playerId) {
  var wins = Object.assign({}, _room.player_wins || {});
  wins[playerId] = (wins[playerId] || 0) + 1;
  await db().from('rooms').update({ player_wins: wins }).eq('id', _room.id);
}
```

**`joinRoom`** also writes the joining player into `player_ids` and `player_names`:

```js
var ids   = Array.isArray(r.player_ids) ? r.player_ids.slice() : [];
if (!ids.includes(_pid)) ids.push(_pid);
var names = Object.assign({}, r.player_names || {});
names[_pid] = Room.getPlayerName();
await db().from('rooms').update({ player_ids: ids, player_names: names, guest_id: _pid, status: 'lobby' }).eq('id', r.id);
```

**`createRoom`** sets `status: 'lobby'` (not `'waiting'`), initialises `player_ids: [hostPid]`, `player_names: {hostPid: name}`.

### Acceptance tests

- [ ] `Room.createRoom({maxPlayers:4})` inserts a row with `status='lobby'`, 6-char code, `player_ids` contains host
- [ ] `Room.joinRoom('BIRD42', {})` from a second browser tab appends guest to `player_ids`
- [ ] `Room.sendChatMessage('hello')` → row's `chat_messages` array grows by 1
- [ ] `Room.suggestGame('mahjong')` → row's `suggestions` array grows by 1
- [ ] `Room.incrementWin(pid)` → `player_wins[pid]` increments correctly
- [ ] `onLobbyUpdate` fires in the other tab within 500ms of any update

---

## Phase C — Navigation + Entry Page

**Complexity:** Low
**Files to create:** `pages/rooms.html`
**Files to modify:** `index.html`, `pages/browse.html`, `pages/about.html`, every `pages/games/*.html` (nav only), `css/components.css`

### Nav change — all pages

Add a `Rooms` link between `Browse Games` and `About` in every `<ul class="nav-links">`:

```html
<li>
  <a href="/pages/rooms.html" class="nav-link nav-link--rooms" aria-label="Game Rooms">
    🎮 Rooms
  </a>
</li>
```

For game pages the path is `../rooms.html`. For `index.html` it is `pages/rooms.html`.

Add CSS in `components.css` (after `.nav-link--cta`):

```css
/* Rooms nav link — subtle teal pill */
.nav-link--rooms {
  background-color: rgba(44, 120, 115, 0.15);
  color: var(--color-accent-teal) !important;
  border-radius: var(--radius-full);
  font-weight: var(--weight-semibold);
}
.nav-link--rooms:hover {
  background-color: var(--color-accent-teal) !important;
  color: white !important;
}
```

### `pages/rooms.html` — Entry screen

This page has two states toggled by JS: **landing** (Create / Join) and **name prompt** (for anonymous guests before joining).

```
<body>
  <nav>...</nav>
  <main class="rooms-page">
    <div class="container">

      <!-- Landing state -->
      <div id="rooms-landing" class="rooms-landing">
        <header class="rooms-hero">
          <p class="rooms-hero__label">Multiplayer</p>
          <h1 class="rooms-hero__title">Game Rooms</h1>
          <p class="rooms-hero__desc">
            Play cultural games together — create a private room, share the code,
            and let the games begin.
          </p>
        </header>

        <div class="rooms-entry-cards">

          <!-- Create card -->
          <div class="rooms-entry-card">
            <div class="rooms-entry-card__icon">🎲</div>
            <h2 class="rooms-entry-card__title">Create Room</h2>
            <p class="rooms-entry-card__desc">
              Start a new room and invite friends with a short code.
            </p>
            <div class="rooms-entry-card__opts">
              <label class="rooms-opt-label">Max players</label>
              <div class="rooms-player-toggle" role="group" aria-label="Max players">
                <button class="rooms-player-btn active" data-n="2">2</button>
                <button class="rooms-player-btn" data-n="4">4</button>
              </div>
            </div>
            <button id="rooms-create-btn" class="btn btn-primary btn-lg">
              Create Room
            </button>
          </div>

          <!-- Join card -->
          <div class="rooms-entry-card">
            <div class="rooms-entry-card__icon">🚪</div>
            <h2 class="rooms-entry-card__title">Join Room</h2>
            <p class="rooms-entry-card__desc">
              Enter the room code shared by your host.
            </p>
            <input
              id="rooms-join-code"
              class="rooms-code-input"
              type="text"
              maxlength="6"
              placeholder="BIRD42"
              autocomplete="off"
              spellcheck="false"
              aria-label="Room code"
            />
            <button id="rooms-join-btn" class="btn btn-secondary btn-lg">
              Join Room
            </button>
            <p id="rooms-join-error" class="rooms-error" hidden></p>
          </div>

        </div>
      </div>

      <!-- Loading state (shown briefly during createRoom/joinRoom) -->
      <div id="rooms-loading" class="rooms-loading" hidden>
        <div class="rooms-loading__spinner"></div>
        <p id="rooms-loading-msg">Creating room…</p>
      </div>

    </div>
  </main>
  <footer>...</footer>

  <!-- Guest name modal (Phase D) -->
  <div id="rooms-name-modal" class="rooms-modal-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="rooms-name-title">
    ...
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  <script src="../js/utils/navigation.js"></script>
  <script src="../js/utils/auth.js"></script>
  <script src="../js/utils/room.js"></script>
  <script src="../js/rooms/entry.js"></script>
</body>
```

`js/rooms/entry.js` handles Create/Join button logic. On success it redirects to `pages/room.html?id=<roomId>` (the lobby/game shell, built in Phase E).

### Acceptance tests

- [ ] "Rooms" link appears in nav on `index.html`, `browse.html`, and `pages/games/tien-len.html`
- [ ] Nav link is active (gold) when on `rooms.html`
- [ ] Clicking "Create Room" with max=4 selected calls `Room.createRoom({maxPlayers:4})` and redirects to `room.html?id=...`
- [ ] Clicking "Join Room" with code "BIRD42" calls `Room.joinRoom('BIRD42', ...)` and redirects
- [ ] Invalid code shows inline error text below the input (no alert())
- [ ] Loading spinner shown during async operations

---

## Phase D — Guest Name Modal

**Complexity:** Low
**Files to create:** (modal is inline in `rooms.html`; logic in `entry.js`)
**Files to modify:** `js/rooms/entry.js`, `css/rooms.css`

### What to build

Before joining (not creating — hosts are assumed to have a name from auth or a prior session), check if `Room.getPlayerName()` returns a non-empty string. If blank/null, show the name modal.

**Modal DOM (inside `rooms.html`):**

```html
<div id="rooms-name-modal" class="rooms-modal-backdrop" hidden
     role="dialog" aria-modal="true" aria-labelledby="rooms-name-title">
  <div class="rooms-modal">
    <h2 id="rooms-name-title" class="rooms-modal__title">What's your name?</h2>
    <p class="rooms-modal__desc">
      This is how other players will see you in the room.
    </p>
    <input
      id="rooms-name-input"
      class="rooms-text-input"
      type="text"
      maxlength="20"
      placeholder="e.g. Alex"
      autocomplete="off"
      autocorrect="off"
    />
    <div class="rooms-modal__actions">
      <button id="rooms-name-submit" class="btn btn-primary">Continue</button>
    </div>
  </div>
</div>
```

**Logic in `entry.js`:**

```js
function requireName(then) {
  var name = Room.getPlayerName();
  if (name && name.trim().length > 0) { then(name.trim()); return; }
  // Show modal
  document.getElementById('rooms-name-modal').hidden = false;
  document.getElementById('rooms-name-input').focus();
  document.getElementById('rooms-name-submit').onclick = function() {
    var v = document.getElementById('rooms-name-input').value.trim();
    if (!v) return;
    Room.setPlayerName(v);
    document.getElementById('rooms-name-modal').hidden = true;
    then(v);
  };
}
```

`requireName` is called before both Create and Join flows.

**CSS (in `css/rooms.css`):**

```css
.rooms-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(26,14,6,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(2px);
}
.rooms-modal-backdrop[hidden] { display: none; }
.rooms-modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  max-width: 420px;
  width: 92%;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rooms-modal__title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--color-text);
}
.rooms-modal__desc {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.rooms-modal__actions {
  display: flex;
  justify-content: flex-end;
}
```

### Acceptance tests

- [ ] Logged-in user skips modal entirely (name comes from `_user.display_name` or stored `cg_name`)
- [ ] Anonymous user clicking "Join Room" sees modal before join executes
- [ ] Submitting modal with empty input does nothing (no join)
- [ ] Name ≤ 20 chars enforced by `maxlength` + trim validation
- [ ] After submitting, `localStorage.getItem('cg_name')` equals the entered name
- [ ] Pressing Enter in the name input submits the modal

---

## Phase E — Lobby UI

**Complexity:** High
**Files to create:** `pages/room.html`, `js/rooms/lobby.js`
**Files to modify:** `css/rooms.css`

This is the main room shell. It serves both the lobby and the in-game wrapper (Phase G). On load it reads `?id=<roomId>` from the URL, calls `Room.subscribeRoom()`, and renders the lobby.

### `pages/room.html` overall structure

```html
<body class="room-body">
  <nav class="site-nav">...</nav>

  <!-- ── LOBBY VIEW ─────────────────────────────── -->
  <div id="room-lobby" class="room-lobby">

    <!-- Top bar: code + leave -->
    <div class="room-topbar">
      <span class="room-topbar__code">
        Room <strong id="lobby-code-display"></strong>
      </span>
      <span class="room-topbar__status" id="lobby-status-text">Waiting for players…</span>
      <button id="lobby-leave-btn" class="btn btn-ghost btn-sm">Leave</button>
    </div>

    <!-- Three-column layout -->
    <div class="room-lobby__body">

      <!-- LEFT: Player list -->
      <aside class="room-panel room-panel--players" aria-label="Players">
        <h3 class="room-panel__title">Players</h3>
        <ul id="lobby-player-list" class="lobby-player-list" role="list"></ul>
        <button id="lobby-ready-btn" class="btn btn-teal lobby-ready-btn">
          Ready
        </button>
      </aside>

      <!-- CENTER: Mini game browser + suggestions -->
      <main class="room-panel room-panel--games">
        <h3 class="room-panel__title">Pick a Game</h3>
        <!-- Mini game grid (Phase E detail below) -->
        <div id="lobby-game-grid" class="lobby-game-grid"></div>

        <div class="lobby-suggestions">
          <div class="lobby-suggestions__header">
            <h4 class="lobby-suggestions__title">Suggestions</h4>
            <!-- Host only -->
            <div id="lobby-mode-toggle" class="lobby-mode-toggle" hidden>
              <button class="lobby-mode-btn active" data-mode="host-pick">Host Pick</button>
              <button class="lobby-mode-btn" data-mode="lottery">Lottery</button>
            </div>
          </div>
          <ul id="lobby-suggestions-list" class="lobby-suggestions-list" role="list"></ul>
          <!-- Host Pick: "Play this" appears on each suggestion row -->
          <!-- Lottery mode: shows this button -->
          <button id="lobby-lottery-btn" class="btn btn-primary lobby-lottery-btn" hidden>
            🎰 Lottery!
          </button>
        </div>
      </main>

      <!-- RIGHT: Chat -->
      <aside class="room-panel room-panel--chat" aria-label="Chat">
        <h3 class="room-panel__title">Chat</h3>
        <ul id="lobby-chat-list" class="lobby-chat-list" role="log" aria-live="polite"></ul>
        <form id="lobby-chat-form" class="lobby-chat-form" autocomplete="off">
          <input
            id="lobby-chat-input"
            class="rooms-text-input lobby-chat-input"
            type="text"
            maxlength="200"
            placeholder="Say something…"
            aria-label="Chat message"
          />
          <button type="submit" class="btn btn-primary btn-sm">Send</button>
        </form>
      </aside>

    </div>
  </div>

  <!-- ── IN-GAME VIEW (hidden until game starts, Phase G) ─── -->
  <div id="room-ingame" class="room-ingame" hidden>
    <!-- Phase G content -->
  </div>

  <!-- ── END SCREEN (hidden until game ends, Phase I) ─── -->
  <div id="room-endscreen" class="room-endscreen" hidden>
    <!-- Phase I content -->
  </div>

  <!-- Player assignment modal (Phase G) -->
  <div id="room-assign-modal" class="rooms-modal-backdrop" hidden>...</div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  <script src="../js/utils/navigation.js"></script>
  <script src="../js/utils/auth.js"></script>
  <script src="../js/utils/room.js"></script>
  <script src="../js/rooms/lobby.js"></script>
  <script src="../js/rooms/ingame.js"></script>   <!-- Phase G -->
  <script src="../js/rooms/endscreen.js"></script> <!-- Phase I -->
</body>
```

### Player list rendering

Each item in `#lobby-player-list`:

```html
<li class="lobby-player" data-pid="p123abc">
  <div class="lobby-player__avatar" aria-hidden="true">A</div>  <!-- first letter of name -->
  <div class="lobby-player__info">
    <span class="lobby-player__name">Alice</span>
    <span class="lobby-player__wins">3 wins</span>
  </div>
  <span class="lobby-player__trophy" aria-label="Leading" title="Leading!">🏆</span>
  <span class="lobby-player__ready ready--yes" aria-label="Ready">✓</span>
</li>
```

Trophy logic: find the maximum win count across all players. Every player with that count (including 0 when all tied) gets `🏆`. If all players have 0 wins, show no trophies (first game — nothing to celebrate yet).

```js
function renderPlayerList(room) {
  var wins  = room.player_wins  || {};
  var names = room.player_names || {};
  var ready = room.player_ready || {};
  var ids   = room.player_ids   || [];
  var maxW  = Math.max.apply(null, ids.map(function(p){ return wins[p]||0; }));
  var showTrophy = maxW > 0;

  var html = ids.map(function(pid) {
    var name  = names[pid] || 'Player';
    var w     = wins[pid] || 0;
    var isMe  = pid === Room.getPlayerId();
    var isTop = showTrophy && w === maxW;
    var rdy   = ready[pid];
    return `<li class="lobby-player${isMe?' lobby-player--me':''}" data-pid="${pid}">
      <div class="lobby-player__avatar">${name[0].toUpperCase()}</div>
      <div class="lobby-player__info">
        <span class="lobby-player__name">${esc(name)}${isMe?' (you)':''}</span>
        <span class="lobby-player__wins">${w} win${w!==1?'s':''}</span>
      </div>
      ${isTop ? '<span class="lobby-player__trophy" aria-label="Leading">🏆</span>' : ''}
      <span class="lobby-player__ready ${rdy?'ready--yes':'ready--no'}" aria-label="${rdy?'Ready':'Not ready'}">${rdy?'✓':'·'}</span>
    </li>`;
  }).join('');
  document.getElementById('lobby-player-list').innerHTML = html;
}
```

### Mini game browser

`#lobby-game-grid` renders compact cards for all 9 games. Each card shows the game icon, name, player count badge, and a "Suggest" button. Non-multiplayer games are still shown but marked "vs AI" — they can be suggested and played, they just won't use real online seats.

```html
<!-- One lobby-game-card -->
<div class="lobby-game-card" data-game="mahjong">
  <div class="lobby-game-card__icon">🀄</div>
  <div class="lobby-game-card__info">
    <span class="lobby-game-card__name">Hong Kong Mahjong</span>
    <span class="badge badge--board">Tile · 4P</span>
  </div>
  <button class="btn btn-teal btn-sm lobby-suggest-btn" data-game="mahjong">
    Suggest
  </button>
</div>
```

Game metadata array in `lobby.js`:

```js
var LOBBY_GAMES = [
  { key:'bau-cua',     name:'Bầu Cua Tôm Cá',  icon:'🎲', badge:'Dice · 1P',  maxPlayers:1, online:false },
  { key:'o-an-quan',   name:'Ô Ăn Quan',        icon:'⚫', badge:'Board · 2P', maxPlayers:2, online:false },
  { key:'tien-len',    name:'Tiến Lên',          icon:'🃏', badge:'Card · 4P',  maxPlayers:4, online:true  },
  { key:'oware',       name:'Oware',             icon:'🟤', badge:'Board · 2P', maxPlayers:2, online:false },
  { key:'patolli',     name:'Patolli',           icon:'🟩', badge:'Dice · 2P',  maxPlayers:2, online:false },
  { key:'puluc',       name:'Puluc',             icon:'🪵', badge:'Dice · 2P',  maxPlayers:2, online:false },
  { key:'pallanguzhi', name:'Pallanguzhi',       icon:'🐚', badge:'Board · 2P', maxPlayers:2, online:false },
  { key:'fanorona',    name:'Fanorona',          icon:'⬡',  badge:'Board · 2P', maxPlayers:2, online:false },
  { key:'mahjong',     name:'Hong Kong Mahjong', icon:'🀄', badge:'Tile · 4P',  maxPlayers:4, online:true  },
];
```

### Suggestions queue

`#lobby-suggestions-list` renders one row per suggestion:

```html
<li class="lobby-suggestion" data-idx="0">
  <span class="lobby-suggestion__icon">🀄</span>
  <span class="lobby-suggestion__name">Hong Kong Mahjong</span>
  <span class="lobby-suggestion__by">suggested by Alice</span>
  <!-- Host Pick mode only: -->
  <button class="btn btn-primary btn-sm lobby-play-btn" data-game="mahjong">Play this</button>
  <!-- Anyone can remove their own suggestion: -->
  <button class="btn btn-ghost btn-sm lobby-remove-btn" data-idx="0" aria-label="Remove">✕</button>
</li>
```

### Host Pick vs Lottery

**Host Pick mode** (default): Each suggestion row shows a "Play this" button visible only to the host. Clicking calls `Room.selectGame(gameKey)` which sets `selected_game` and `status: 'assigning'` (triggers Phase G player assignment).

**Lottery mode**: "Play this" buttons hidden. Host sees `#lobby-lottery-btn`. Clicking starts the lottery animation:

```js
function runLottery(suggestions) {
  // 1. Collect suggestion game keys
  var pool  = suggestions.map(function(s){ return s.game; });
  // 2. Animate: cycle through pool visually in #lobby-suggestions-list highlight
  //    Use CSS class 'lobby-suggestion--highlight' cycling every 80ms
  //    Total duration: 2200ms, slowing down toward end (easing via increasing interval)
  // 3. On final selection, call Room.selectGame(winner)
  var idx   = 0;
  var items = document.querySelectorAll('.lobby-suggestion');
  var delay = 80;
  var elapsed = 0;
  function tick() {
    items.forEach(function(el){ el.classList.remove('lobby-suggestion--highlight'); });
    items[idx % pool.length].classList.add('lobby-suggestion--highlight');
    idx++;
    elapsed += delay;
    if (elapsed < 2200) {
      delay = Math.min(delay + 15, 350); // ease out
      setTimeout(tick, delay);
    } else {
      var winner = pool[idx % pool.length];
      Room.selectGame(winner);
    }
  }
  tick();
}
```

### Chat sidebar

`#lobby-chat-list` renders up to 200 messages. Each:

```html
<li class="lobby-chat-msg">
  <span class="lobby-chat-msg__name">Alice</span>
  <span class="lobby-chat-msg__time">14:32</span>
  <p class="lobby-chat-msg__text">Ready when you are!</p>
</li>
```

Own messages get class `lobby-chat-msg--own`. Chat list auto-scrolls to bottom on each update. `onChatUpdate` callback from `Room` fires separately from `onLobbyUpdate` for efficiency.

### Acceptance tests

- [ ] `room.html?id=<id>` loads, reads room row, renders player list with correct names
- [ ] Second player joining triggers `onLobbyUpdate` → player list updates in first browser without refresh
- [ ] "Ready" button toggles own ready state; all players' ready indicators update live
- [ ] "Suggest" on a game card adds it to the suggestions list for all players
- [ ] Host Pick mode: "Play this" visible only when logged in as host
- [ ] Lottery: clicking "Lottery!" animates through suggestions and lands on one
- [ ] Chat: typing and pressing Enter appends message visible in all connected tabs within ~500ms
- [ ] Trophy (🏆) appears next to player with highest wins; absent when all tied at 0

---

## Phase F — CSS for Room System

**Complexity:** Low–Medium
**Files to create:** `css/rooms.css`
**Files to modify:** All game HTML files and `pages/rooms.html` and `pages/room.html` (add `<link rel="stylesheet" href="../css/rooms.css" />`)

### Structure of `css/rooms.css`

All classes prefixed `room-` or `lobby-` or `rooms-`. No class bleeds into global scope. Full token usage from `global.css`.

```css
/* ── Entry page ── */
.rooms-page { padding-block: var(--space-10); }

.rooms-hero {
  text-align: center;
  background-color: var(--color-primary);
  padding: var(--space-10) var(--space-4) var(--space-8);
  border-radius: var(--radius-xl);
  margin-bottom: var(--space-8);
  border-bottom: 3px solid var(--color-accent-gold);
  position: relative;
  overflow: hidden;
}
/* rainbow top border (same pattern as .hero::before) */
.rooms-hero::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg,
    var(--color-accent-red), var(--color-accent-gold),
    var(--color-accent-teal), var(--color-accent-warm),
    var(--color-accent-red));
}
.rooms-hero__label {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-accent-teal);
  margin-bottom: var(--space-2);
}
.rooms-hero__title {
  font-family: var(--font-display);
  font-size: clamp(var(--text-3xl), 5vw, var(--text-5xl));
  color: white;
  margin-bottom: var(--space-2);
}
.rooms-hero__desc {
  color: rgba(255,255,255,0.6);
  font-size: var(--text-lg);
  max-width: 50ch;
  margin-inline: auto;
}

/* ── Entry cards ── */
.rooms-entry-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
  max-width: 800px;
  margin-inline: auto;
}
@media (max-width: 600px) {
  .rooms-entry-cards { grid-template-columns: 1fr; }
}
.rooms-entry-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
  transition: box-shadow var(--transition-base), transform var(--transition-base);
}
.rooms-entry-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-3px);
}
.rooms-entry-card__icon { font-size: 3rem; line-height: 1; }
.rooms-entry-card__title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--color-text);
}
.rooms-entry-card__desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* ── Player count toggle ── */
.rooms-player-toggle {
  display: flex;
  gap: 4px;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 3px;
}
.rooms-player-btn {
  padding: 6px 20px;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.rooms-player-btn.active {
  background: var(--color-primary);
  color: var(--color-accent-gold);
}

/* ── Code input ── */
.rooms-code-input {
  width: 100%;
  padding: 14px var(--space-3);
  font-size: var(--text-2xl);
  font-family: monospace;
  font-weight: var(--weight-bold);
  letter-spacing: 0.3em;
  text-align: center;
  text-transform: uppercase;
  background: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  outline: none;
}
.rooms-code-input:focus {
  border-color: var(--color-accent-gold);
  box-shadow: 0 0 0 3px rgba(200,155,60,0.18);
}

/* ── Text input (shared) ── */
.rooms-text-input {
  width: 100%;
  padding: 10px var(--space-2);
  font-size: var(--text-base);
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  outline: none;
}
.rooms-text-input:focus {
  border-color: var(--color-accent-gold);
  box-shadow: 0 0 0 3px rgba(200,155,60,0.18);
}

/* ── Error text ── */
.rooms-error {
  font-size: var(--text-sm);
  color: var(--color-accent-red);
  text-align: center;
}
.rooms-error[hidden] { display: none; }

/* ── Loading spinner ── */
.rooms-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  gap: var(--space-4);
  color: var(--color-text-muted);
}
.rooms-loading__spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-accent-gold);
  border-radius: 50%;
  animation: rooms-spin 0.8s linear infinite;
}
@keyframes rooms-spin { to { transform: rotate(360deg); } }

/* ── Room body (full-height, no page scroll during game) ── */
.room-body {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Lobby top bar ── */
.room-topbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--color-primary);
  border-bottom: 2px solid var(--color-accent-gold);
  flex-shrink: 0;
}
.room-topbar__code {
  font-size: var(--text-sm);
  color: rgba(255,255,255,0.65);
}
.room-topbar__code strong {
  font-size: var(--text-lg);
  letter-spacing: 0.15em;
  color: var(--color-accent-gold);
  font-family: monospace;
}
.room-topbar__status {
  flex: 1;
  font-size: var(--text-sm);
  color: rgba(255,255,255,0.5);
  text-align: center;
}

/* ── Lobby layout ── */
.room-lobby {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
.room-lobby__body {
  display: grid;
  grid-template-columns: 220px 1fr 280px;
  flex: 1;
  overflow: hidden;
}
@media (max-width: 900px) {
  .room-lobby__body { grid-template-columns: 1fr; overflow-y: auto; }
}

/* ── Panel ── */
.room-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--color-border);
  padding: var(--space-3);
  gap: var(--space-3);
}
.room-panel:last-child { border-right: none; }
.room-panel--games { overflow-y: auto; }
.room-panel--chat  { background: var(--color-surface-alt); }
.room-panel__title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* ── Player list ── */
.lobby-player-list { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.lobby-player {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: box-shadow var(--transition-fast);
}
.lobby-player--me { border-color: var(--color-accent-gold); }
.lobby-player__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-accent-gold);
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lobby-player__info { flex: 1; min-width: 0; }
.lobby-player__name {
  display: block;
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lobby-player__wins {
  display: block;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.lobby-player__trophy { font-size: 1.1rem; }
.lobby-player__ready { font-size: var(--text-lg); }
.ready--yes { color: var(--color-accent-teal); }
.ready--no  { color: var(--color-border); }

.lobby-ready-btn { width: 100%; margin-top: auto; }
.lobby-ready-btn.is-ready {
  background: var(--color-accent-teal);
  border-color: var(--color-accent-teal);
  color: white;
}

/* ── Mini game grid ── */
.lobby-game-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lobby-game-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: box-shadow var(--transition-fast);
}
.lobby-game-card:hover { box-shadow: var(--shadow-sm); }
.lobby-game-card__icon { font-size: 1.6rem; flex-shrink: 0; }
.lobby-game-card__info { flex: 1; min-width: 0; }
.lobby-game-card__name {
  display: block;
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  color: var(--color-text);
}

/* ── Suggestions ── */
.lobby-suggestions__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.lobby-suggestions__title {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
}
.lobby-mode-toggle {
  display: flex;
  gap: 2px;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 2px;
}
.lobby-mode-btn {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.lobby-mode-btn.active {
  background: var(--color-primary);
  color: var(--color-accent-gold);
}

.lobby-suggestions-list { display: flex; flex-direction: column; gap: 6px; }
.lobby-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.lobby-suggestion--highlight {
  background: rgba(200,155,60,0.12);
  border-color: var(--color-accent-gold);
}
.lobby-suggestion__icon { font-size: 1.2rem; }
.lobby-suggestion__name { font-weight: var(--weight-semibold); font-size: var(--text-sm); flex: 1; }
.lobby-suggestion__by { font-size: var(--text-xs); color: var(--color-text-muted); }

/* ── Chat ── */
.lobby-chat-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
}
.lobby-chat-msg {}
.lobby-chat-msg--own .lobby-chat-msg__name { color: var(--color-accent-teal); }
.lobby-chat-msg__header {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 2px;
}
.lobby-chat-msg__name {
  font-weight: var(--weight-semibold);
  font-size: var(--text-xs);
  color: var(--color-accent-gold);
}
.lobby-chat-msg__time { font-size: var(--text-xs); color: var(--color-text-muted); }
.lobby-chat-msg__text { font-size: var(--text-sm); color: var(--color-text); line-height: var(--leading-snug); }

.lobby-chat-form {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.lobby-chat-input { flex: 1; }
```

### Acceptance tests

- [ ] Entry page and room lobby render correctly on Chrome/Firefox/Safari
- [ ] `rooms-entry-cards` stacks to single column below 600px
- [ ] `room-lobby__body` stacks to single column below 900px; all three panels scroll independently
- [ ] Lottery animation visibly cycles through suggestion highlights before settling
- [ ] Player avatar shows first letter of name in gold on dark background
- [ ] Chat auto-scrolls to bottom on new message
- [ ] No class names from `rooms.css` appear in `global.css` or `components.css` searches (scoping verified)

---

## Phase G — In-Game Wrapper

**Complexity:** ★ MOST COMPLEX PHASE ★ (see explanation below)
**Files to create:** `js/rooms/ingame.js`, `js/rooms/assign.js`
**Files to modify:** `pages/room.html`, `css/rooms.css`

### Why this is the most complex phase

1. **Game isolation vs. embedding.** All 9 games are self-contained IIFEs that assume they own the entire page and `#game-container`. They cannot be `import()`-ed or instantiated multiple times without rewriting them. The iframe approach solves this but introduces a postMessage boundary for every interaction.

2. **Spectator mode.** Games have no read-only rendering mode. A spectator's iframe must suppress all click handlers and display a "Spectating" badge — achievable by passing `?role=spectator` to the game URL and having the game check it, but this requires touching every multiplayer game JS file.

3. **Dual-instance mode.** Two iframes running the same game simultaneously means two separate Supabase `board_state` syncs must not interfere. They use separate `game_instances[0]` and `game_instances[1]` within the room row rather than a single `board_state`.

4. **Player count mismatch.** The host must see an assignment modal when room has N players but game needs M (N ≠ M), before any iframe is created. This logic runs before game launch.

5. **Chat persistence.** The in-game view must keep the chat sidebar alive (same DOM element moved or cloned), without destroying existing chat history.

### In-game DOM structure (inside `#room-ingame`)

```html
<div id="room-ingame" class="room-ingame" hidden>

  <!-- Persistent header strip -->
  <div class="ingame-strip">
    <span class="ingame-strip__code">
      <span class="ingame-strip__code-label">Room</span>
      <strong id="ingame-code" class="ingame-strip__code-val"></strong>
    </span>
    <div class="ingame-strip__players" id="ingame-player-chips" role="list">
      <!-- One chip per player: avatar · name · wins · trophy -->
    </div>
    <button id="ingame-chat-toggle" class="btn btn-ghost btn-sm ingame-chat-btn"
            aria-label="Toggle chat" aria-pressed="false">
      💬 Chat
    </button>
    <button id="ingame-leave-btn" class="btn btn-ghost btn-sm">Leave</button>
  </div>

  <!-- Game area: single or dual instances -->
  <div class="ingame-boards" id="ingame-boards">
    <!-- Populated dynamically by ingame.js -->
    <!-- Single: one full-width iframe -->
    <!-- Dual:   two iframes side by side or in tabs on mobile -->
  </div>

  <!-- Chat sidebar (slides in over game) -->
  <div class="ingame-chat-panel" id="ingame-chat-panel" aria-hidden="true">
    <div class="ingame-chat-panel__header">
      <h3>Chat</h3>
      <button id="ingame-chat-close" class="btn btn-ghost btn-sm">✕</button>
    </div>
    <ul id="ingame-chat-list" class="lobby-chat-list" role="log" aria-live="polite"></ul>
    <form id="ingame-chat-form" class="lobby-chat-form" autocomplete="off">
      <input id="ingame-chat-input" class="rooms-text-input lobby-chat-input"
             type="text" maxlength="200" placeholder="Say something…" />
      <button type="submit" class="btn btn-primary btn-sm">Send</button>
    </form>
  </div>

</div>
```

### Player chip (in-game strip)

```html
<div class="ingame-chip" role="listitem" data-pid="p123abc">
  <div class="ingame-chip__avatar">A</div>
  <span class="ingame-chip__name">Alice</span>
  <span class="ingame-chip__wins">3</span>
  <span class="ingame-chip__trophy" aria-label="Leading">🏆</span>
</div>
```

### Launching a game (ingame.js)

```js
function launchGame(room) {
  var game     = room.selected_game;
  var meta     = LOBBY_GAMES.find(function(g){ return g.key === game; });
  var players  = room.player_ids || [];
  var roles    = room.player_roles || {};
  var myPid    = Room.getPlayerId();
  var myRole   = roles[myPid] || 'player';

  // Build iframe URL params
  var activePlayers = players.filter(function(p){ return roles[p] !== 'spectator'; });
  var seatIdx  = activePlayers.indexOf(myPid);   // -1 if spectator
  var params   = new URLSearchParams({
    roomId:   room.id,
    roomCode: room.code,
    seat:     seatIdx,
    role:     myRole,
    instance: '0',
  });
  var src = '../games/' + game + '.html?' + params.toString();

  var boardsEl = document.getElementById('ingame-boards');

  if (room.dual_instance) {
    // Two iframes — assign players 0+1 to instance 0, players 2+3 to instance 1
    boardsEl.innerHTML =
      '<iframe class="ingame-frame ingame-frame--half" src="' + src + '&instance=0" title="Game 1"></iframe>' +
      '<iframe class="ingame-frame ingame-frame--half" src="' + makeSrc(game, room, 1) + '&instance=1" title="Game 2"></iframe>';
    boardsEl.classList.add('ingame-boards--dual');
  } else {
    boardsEl.innerHTML =
      '<iframe class="ingame-frame" src="' + src + '" title="' + meta.name + '"></iframe>';
  }
}
```

### Spectator mode (game side — Phase H prerequisite)

Game pages detect `?role=spectator` via:

```js
var urlRole = new URLSearchParams(location.search).get('role');
if (urlRole === 'spectator') {
  // suppress wireEvents() click binding
  // add .game-spectator-badge overlay
  // still receive state updates via postMessage
}
```

### Player assignment modal (`assign.js`)

Triggered when host calls `Room.selectGame(key)` and room `status` moves to `'assigning'`. All players see the modal; only the host can submit.

```html
<div id="room-assign-modal" class="rooms-modal-backdrop" hidden>
  <div class="rooms-modal rooms-assign-modal">
    <h2 class="rooms-modal__title">Assign Players</h2>
    <p class="rooms-assign-desc">
      <strong id="assign-game-name"></strong> supports
      <strong id="assign-game-seats"></strong> players.
      Assign roles below.
    </p>
    <ul id="assign-player-list" class="assign-player-list">
      <!-- One row per player with Player/Spectator toggle -->
    </ul>
    <!-- If seats == 2 and players == 4, show dual-instance option -->
    <div id="assign-dual-option" class="assign-dual-option" hidden>
      <label class="assign-dual-label">
        <input type="checkbox" id="assign-dual-cb" />
        Run 2 simultaneous matches (2 players each)
      </label>
    </div>
    <div class="rooms-modal__actions">
      <button id="assign-cancel-btn" class="btn btn-ghost">Back</button>
      <button id="assign-confirm-btn" class="btn btn-primary">Start Game</button>
    </div>
  </div>
</div>
```

Each player row:

```html
<li class="assign-player-row" data-pid="p123abc">
  <div class="lobby-player__avatar">A</div>
  <span class="assign-player-name">Alice</span>
  <div class="assign-role-toggle" role="group">
    <button class="assign-role-btn active" data-role="player">Player</button>
    <button class="assign-role-btn" data-role="spectator">Spectator</button>
  </div>
</li>
```

Confirm calls `Room.setPlayerRoles(rolesMap)` then `Room.startGame('0')` which sets `status: 'playing'`.

### Chat sidebar animation

```css
.ingame-chat-panel {
  position: fixed;
  top: var(--nav-height);
  right: 0;
  width: 300px;
  height: calc(100vh - var(--nav-height));
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--transition-base);
  z-index: 50;
}
.ingame-chat-panel.is-open {
  transform: translateX(0);
}
/* Boards shrink to avoid overlap on large screens */
@media (min-width: 900px) {
  .ingame-boards.chat-open {
    margin-right: 300px;
    transition: margin-right var(--transition-base);
  }
}
```

Toggle: clicking `#ingame-chat-toggle` adds `.is-open` to panel and `.chat-open` to boards.

### In-game strip CSS

```css
.ingame-strip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px var(--space-3);
  background: var(--color-primary);
  border-bottom: 2px solid var(--color-accent-gold);
  flex-shrink: 0;
  overflow-x: auto;
}
.ingame-strip__code-label {
  font-size: var(--text-xs);
  color: rgba(255,255,255,0.45);
  margin-right: 4px;
}
.ingame-strip__code-val {
  font-size: var(--text-base);
  letter-spacing: 0.15em;
  color: var(--color-accent-gold);
  font-family: monospace;
}
.ingame-strip__players {
  display: flex;
  gap: 8px;
  flex: 1;
  justify-content: center;
  flex-wrap: wrap;
}
.ingame-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.07);
  border-radius: var(--radius-full);
  padding: 4px 10px;
}
.ingame-chip__avatar {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--color-accent-gold);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  display: flex; align-items: center; justify-content: center;
}
.ingame-chip__name  { font-size: var(--text-xs); color: rgba(255,255,255,0.8); }
.ingame-chip__wins  { font-size: var(--text-xs); color: var(--color-accent-gold); font-weight: var(--weight-bold); }
.ingame-chip__trophy { font-size: 0.8rem; }

/* Iframe containers */
.ingame-frame {
  border: none;
  width: 100%;
  height: 100%;
  display: block;
}
.ingame-boards {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.ingame-boards--dual .ingame-frame--half {
  flex: 1;
  border-right: 1px solid var(--color-border);
}
.ingame-boards--dual .ingame-frame--half:last-child { border-right: none; }
```

### Acceptance tests

- [ ] Clicking "Play this" on a suggestion (host) → assignment modal appears for all players
- [ ] Assignment modal shows correct number of available seats for selected game
- [ ] Dual-instance checkbox appears when room has 4 players and game supports 2
- [ ] Confirming assignment → lobby hides, `#room-ingame` shows, iframe(s) load correct game URL
- [ ] URL params `?roomId=...&seat=0&role=player` visible in iframe src
- [ ] In-game strip shows all player chips with correct names and win counts
- [ ] Chat toggle slides panel in/out; boards shrink on desktop to avoid overlap
- [ ] Spectator sees "Spectating" badge in game iframe and cannot click game controls

---

## Phase H — Game Adapter (Connecting Existing Games to Room System)

**Complexity:** Medium-High
**Files to modify:** `js/games/tien-len.js`, `js/games/mahjong.js`
**Files to create:** `js/rooms/game-bridge.js`

### What to build

Games need to detect when they are launched from a room (URL params present) and switch from their own mp-panel logic to the room postMessage bridge.

**`js/rooms/game-bridge.js`** — loaded in game HTML pages, handles the URL param detection and postMessage plumbing:

```js
(function() {
  'use strict';
  var params = new URLSearchParams(location.search);
  var roomId   = params.get('roomId');
  var roomCode = params.get('roomCode');
  var seat     = parseInt(params.get('seat'), 10);
  var role     = params.get('role') || 'player';
  var instance = params.get('instance') || '0';

  if (!roomId) return; // standalone mode — do nothing

  window.RoomBridge = {
    roomId:   roomId,
    roomCode: roomCode,
    seat:     seat,
    role:     role,
    instance: instance,
    isRoom:   true,
    isSpectator: role === 'spectator',

    // Called by game JS to send state up to parent room page
    sendState: function(blob) {
      if (role === 'spectator') return;
      window.parent.postMessage({ type: 'game-sync', instance: instance, data: blob }, '*');
    },

    // Called by game JS to report a win
    reportWin: function(winnerSeat) {
      window.parent.postMessage({ type: 'game-win', instance: instance, winnerSeat: winnerSeat }, '*');
    },

    // Parent room page calls this to push remote state into the game
    onRemoteState: null, // game sets this callback

    _init: function() {
      window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'room-state' && RoomBridge.onRemoteState) {
          RoomBridge.onRemoteState(e.data.data);
        }
      });
    }
  };

  RoomBridge._init();
}());
```

**Changes to `tien-len.js` (and analogously `mahjong.js`):**

At the top of `initOnlineUI()`, add a check:

```js
function initOnlineUI() {
  // If launched from a Room, skip mp-panel entirely
  if (window.RoomBridge && window.RoomBridge.isRoom) {
    initRoomMode();
    return;
  }
  // ... existing mp-panel code unchanged ...
}

function initRoomMode() {
  var rb = window.RoomBridge;

  // Hide the old mp-panel
  var panel = document.getElementById('tl-mp-panel');
  if (panel) panel.hidden = true;

  // Configure seats
  vsOnline = true;
  twoPlayer = true;
  isHost   = (rb.seat === 0);
  mySeat   = rb.seat;

  if (rb.isSpectator) {
    // Spectator: suppress wireEvents, show badge, receive state only
    state._spectatorMode = true;
    rb.onRemoteState = function(data) { receiveOnlineState(data); };
    // After first render, inject spectator badge
    var badge = document.createElement('div');
    badge.className = 'game-spectator-badge';
    badge.textContent = '👁 Spectating';
    document.getElementById('game-container').prepend(badge);
    return;
  }

  // Host starts game
  if (isHost) {
    startOnlineGame('host');
  } else {
    // Guest waits for host's first state push
    rb.onRemoteState = function(data) { receiveOnlineState(data); };
  }

  // Override syncOnlineState to use bridge instead of Multiplayer
  // The original syncOnlineState calls Multiplayer.sendState —
  // replace that call with RoomBridge.sendState
}
```

**In `syncOnlineState()`** for both games, add a branch:

```js
function syncOnlineState() {
  var blob = { hands: state.hands, current: state.current, /* etc */ last_actor: pid };
  if (window.RoomBridge && window.RoomBridge.isRoom) {
    RoomBridge.sendState(blob);
    return;
  }
  if (!window.Multiplayer) return;
  Multiplayer.sendState(blob);
}
```

**`ingame.js` (parent room page)** receives postMessages and routes them:

```js
window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'game-sync') {
    // Push state to all other game iframes in same instance
    var frames = document.querySelectorAll('.ingame-frame');
    frames.forEach(function(fr) {
      if (fr.contentWindow !== e.source) {
        fr.contentWindow.postMessage({ type: 'room-state', data: e.data.data }, '*');
      }
    });
    // Also persist to Supabase for spectators and reconnection
    Room.updateGameInstance(e.data.instance, e.data.data);
  }
  if (e.data.type === 'game-win') {
    handleGameWin(e.data.instance, e.data.winnerSeat);
  }
});
```

**`Room.updateGameInstance(instanceId, blob)`** — new method in `room.js`:

```js
updateGameInstance: async function(instanceId, blob) {
  var instances = (_room.game_instances || []).slice();
  var idx = instances.findIndex(function(i){ return i.instance_id === instanceId; });
  if (idx === -1) {
    instances.push({ instance_id: instanceId, board_state: blob });
  } else {
    instances[idx] = Object.assign({}, instances[idx], { board_state: blob });
  }
  await db().from('rooms').update({ game_instances: instances }).eq('id', _room.id);
}
```

**Add `game-bridge.js` to game HTML files:**

In `pages/games/tien-len.html` and `pages/games/mahjong.html`, add before the game script:

```html
<script src="../../js/rooms/game-bridge.js"></script>
```

**Spectator badge CSS (in `css/rooms.css`):**

```css
.game-spectator-badge {
  position: fixed;
  top: calc(var(--nav-height) + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(26,14,6,0.82);
  color: var(--color-accent-gold);
  border: 1px solid var(--color-accent-gold);
  border-radius: var(--radius-full);
  padding: 6px 18px;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  z-index: 50;
  pointer-events: none;
  backdrop-filter: blur(4px);
}
```

### Acceptance tests

- [ ] Opening `tien-len.html` directly (no URL params) → mp-panel works as before (no regression)
- [ ] Opening `tien-len.html?roomId=xxx&seat=0&role=host` → mp-panel hidden, game starts as host
- [ ] Guest iframe at `seat=1&role=guest` receives state from host and renders correctly
- [ ] Spectator at `role=spectator` sees board but all buttons disabled; badge visible
- [ ] `game-sync` postMessage from game iframe reaches `ingame.js` and triggers Supabase update
- [ ] Supabase `room_messages` (or `game_instances`) updates within 600ms of a move

---

## Phase I — End Screen + Win Counters + Rematch

**Complexity:** Medium
**Files to create:** `js/rooms/endscreen.js`
**Files to modify:** `pages/room.html`, `css/rooms.css`

### Triggering end screen

When `ingame.js` receives `game-win` postMessage from any game iframe, it calls `handleGameWin(instanceId, winnerSeat)`:

```js
function handleGameWin(instanceId, winnerSeat) {
  var room = Room.currentRoom();
  var instances  = room.game_instances || [];
  var inst       = instances.find(function(i){ return i.instance_id === instanceId; });
  var activePids = (inst && inst.player_assignments) || (room.player_ids || []);
  var winnerPid  = activePids[winnerSeat];

  // Increment win counter on Supabase
  Room.incrementWin(winnerPid);

  // Mark instance as finished
  Room.updateGameInstance(instanceId, Object.assign({}, inst.board_state, {
    _finished: true, _winner_pid: winnerPid
  }));

  // If dual instance, wait for both to finish; otherwise show end screen now
  var allDone = (room.dual_instance)
    ? checkBothInstancesFinished()
    : true;

  if (allDone) {
    Room.setStatus('endscreen');
  }
}
```

`Room.setStatus('endscreen')` → `UPDATE rooms SET status='endscreen'`. All clients' `onRoomUpdate` fires → they show `#room-endscreen`.

### End screen DOM

```html
<div id="room-endscreen" class="room-endscreen" hidden>
  <div class="endscreen-inner">

    <div class="endscreen-result" id="endscreen-result">
      <!-- Single instance -->
      <div class="endscreen-winner">
        <div class="endscreen-winner__avatar" id="endscreen-winner-avatar"></div>
        <h2 class="endscreen-winner__name" id="endscreen-winner-name"></h2>
        <p class="endscreen-winner__label">wins this round!</p>
        <p class="endscreen-winner__score" id="endscreen-winner-score"></p>
      </div>

      <!-- Dual instance (hidden if single) -->
      <div class="endscreen-dual" id="endscreen-dual" hidden>
        <div class="endscreen-dual-half" id="endscreen-dual-a"></div>
        <div class="endscreen-dual-divider">vs</div>
        <div class="endscreen-dual-half" id="endscreen-dual-b"></div>
      </div>
    </div>

    <!-- Session leaderboard -->
    <div class="endscreen-leaderboard">
      <h3 class="endscreen-leaderboard__title">Session Leaderboard</h3>
      <ul id="endscreen-leaderboard-list" class="endscreen-lb-list" role="list"></ul>
    </div>

    <!-- Actions -->
    <div class="endscreen-actions">
      <button id="endscreen-rematch-btn" class="btn btn-primary btn-lg">Rematch?</button>
      <button id="endscreen-lobby-btn"   class="btn btn-secondary btn-lg">Back to Lobby</button>
    </div>

  </div>
</div>
```

### Session leaderboard rendering

Same trophy logic as lobby player list. Each row:

```html
<li class="endscreen-lb-row">
  <div class="lobby-player__avatar">A</div>
  <span class="endscreen-lb-name">Alice</span>
  <span class="endscreen-lb-wins">3 wins</span>
  <span class="endscreen-lb-trophy">🏆</span>
</li>
```

### Rematch flow

`#endscreen-rematch-btn` → host calls `Room.rematch()`:

```js
rematch: async function() {
  // Reset game_instances, keep player_wins and player_roles, re-use selected_game
  await db().from('rooms').update({
    status:         'playing',
    game_instances: [],
  }).eq('id', _room.id);
}
```

All clients' `onRoomUpdate` fires with `status='playing'` → `ingame.js` re-launches the game iframes with fresh state. The host's game iframe auto-starts; guest iframes wait for first sync.

### Back to Lobby flow

`#endscreen-lobby-btn` → host calls `Room.backToLobby()`:

```js
backToLobby: async function() {
  await db().from('rooms').update({
    status:         'lobby',
    selected_game:  null,
    game_instances: [],
    player_roles:   {},
    player_ready:   {},
    dual_instance:  false,
  }).eq('id', _room.id);
}
```

All clients show `#room-lobby`, hide `#room-ingame` and `#room-endscreen`.

### End screen CSS

```css
.room-endscreen {
  position: fixed;
  inset: 0;
  background: rgba(26,14,6,0.88);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.room-endscreen[hidden] { display: none; }

.endscreen-inner {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  border-top: 4px solid var(--color-accent-gold);
  padding: var(--space-8) var(--space-6);
  max-width: 560px;
  width: 92%;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  text-align: center;
  max-height: 90vh;
  overflow-y: auto;
}

.endscreen-winner__avatar {
  width: 72px; height: 72px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-accent-gold);
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: var(--weight-bold);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto var(--space-2);
  border: 3px solid var(--color-accent-gold);
}
.endscreen-winner__name {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  color: var(--color-text);
}
.endscreen-winner__label {
  font-size: var(--text-lg);
  color: var(--color-accent-teal);
  font-weight: var(--weight-medium);
}
.endscreen-winner__score {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.endscreen-dual {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-3);
  align-items: center;
}
.endscreen-dual-divider {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--color-text-muted);
}

.endscreen-leaderboard__title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  margin-bottom: var(--space-3);
}
.endscreen-lb-list { display: flex; flex-direction: column; gap: 8px; }
.endscreen-lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.endscreen-lb-name  { flex: 1; font-weight: var(--weight-semibold); font-size: var(--text-sm); }
.endscreen-lb-wins  { font-size: var(--text-sm); color: var(--color-text-muted); }
.endscreen-lb-trophy { font-size: 1.1rem; }

.endscreen-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  flex-wrap: wrap;
}
```

### Acceptance tests

- [ ] When game reports a win, `player_wins[winnerPid]` increments by 1 in Supabase
- [ ] All clients transition from in-game view to end screen within 1 second of win
- [ ] End screen shows correct winner name and avatar initial
- [ ] Session leaderboard lists all players, sorted by wins descending
- [ ] Trophy shows next to player(s) with highest cumulative wins; absent if all at 0
- [ ] Dual instance: end screen shows two result panels side by side
- [ ] "Rematch?" re-launches same game with same player roles; iframes reload; win counter not reset
- [ ] "Back to Lobby" resets everything except `player_wins`; lobby is shown again
- [ ] Non-host players see both buttons but clicking them has no effect (only host triggers the DB update)

---

## Phase J — Cleanup, Migration, and Breaking Changes

**Complexity:** Low (mechanical but many files)
**Files to modify:** All `pages/games/*.html`, `js/utils/multiplayer.js`, `css/games.css`

> ⚠️ **Breaking change warning:** The per-game mp-panels (`#tl-mp-panel`, `#mj-mp-panel`) will be removed. This breaks the old standalone Create/Join experience for Tiến Lên and Mahjong. The replacement is the global Room System. Before executing this phase, confirm the Room System (Phases A–I) is fully functional.

### Changes per file

**`pages/games/tien-len.html`** — Remove the `#tl-mp-panel` `<div>` block entirely (lines 57–73). Add `game-bridge.js` script tag before `tien-len.js`.

**`pages/games/mahjong.html`** — Same: remove `#mj-mp-panel`, add `game-bridge.js`.

**`js/games/tien-len.js`** — Remove `initOnlineUI()` function and its call from `DOMContentLoaded`. The room bridge handles all room setup now.

**`js/games/mahjong.js`** — Same.

**`js/utils/multiplayer.js`** — Deprecate in-place. Add a console warning at the top:

```js
console.warn('[Cultural Games] multiplayer.js is deprecated. Use room.js instead.');
```

Keep the file present; legacy bookmark users who land on old game URLs will get a graceful degradation until Phase J is fully rolled out. Remove the file entirely in a follow-up once traffic confirms no lingering usage.

**`css/games.css`** — Remove the `.mp-panel`, `.mp-row`, `.mp-label`, `.mp-code-input`, `.mp-code-display`, `.mp-status-text` blocks (lines 3417–3475). These are now superseded by `rooms.css`.

**Nav update** — The `Rooms` nav link (added in Phase C) should now be marked `aria-current="page"` on `rooms.html` and `room.html` via navigation.js. Add detection:

```js
// In navigation.js, after setting active links:
var path = location.pathname;
document.querySelectorAll('.nav-link').forEach(function(a) {
  var href = a.getAttribute('href') || '';
  if (href && path.endsWith(href.replace(/^\.\.\//, '').replace(/^\.\//, ''))) {
    a.setAttribute('aria-current', 'page');
    a.classList.add('active');
  }
});
```

**Footer links** — Add `Rooms` to the footer `<ul class="footer-links">` in all pages (same `href` depth-adjusted pattern as nav).

**`index.html` stats section** — Update "7 Traditional Games" stat to reflect current count. Update hero eyebrow text to include "Multiplayer Rooms".

### Acceptance tests

- [ ] `pages/games/tien-len.html` loads with no mp-panel visible; no JS errors
- [ ] `pages/games/mahjong.html` same
- [ ] Both game pages still work standalone (AI vs player, no room)
- [ ] Opening either game with `?roomId=xxx&seat=0&role=host` still works via `game-bridge.js`
- [ ] `css/games.css` Grep for `.mp-panel` returns zero results
- [ ] `multiplayer.js` console warning appears when any page loads it (should be no pages after cleanup)
- [ ] Nav "Rooms" link is `aria-current="page"` on `rooms.html` and `room.html`
- [ ] Footer `Rooms` link appears on all pages

---

## Phase Complexity Summary

| Phase | Title | Complexity |
|---|---|---|
| A | Database Schema Migration | Low |
| B | Room Core JS (`room.js`) | Medium |
| C | Navigation + Entry Page | Low |
| D | Guest Name Modal | Low |
| E | Lobby UI | High |
| F | CSS for Room System | Low–Medium |
| **G** | **In-Game Wrapper** | **★ HIGHEST** |
| H | Game Adapter Layer | Medium–High |
| I | End Screen + Win Counters + Rematch | Medium |
| J | Cleanup + Breaking Changes | Low (mechanical) |

---

## Gotchas and Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| **`postgres_changes` fires for own UPDATE** | Chat and state updates echo back to sender | Use `last_actor` / `last_pid` field in every blob; recipients check before applying |
| **Chat blob growth** | 200+ messages → large row → slow subscription payloads | Cap `chat_messages` array at 200 entries on every write (`slice(-199)`) |
| **iframe cross-origin** | If games are ever served from a different subdomain, `postMessage` needs explicit origin checking | Keep all pages same-origin for now; add `targetOrigin` param when deploying to CDN |
| **Game iframe height** | Games use `min-height` on game container but iframe needs explicit height | Set `ingame-frame` to `height: 100%` on a flex parent; test each game individually |
| **Supabase anon key in JS** | Key is public and already in multiplayer.js — not a secret | RLS policies on `rooms` table are the security boundary; ensure RLS is correctly set |
| **Room expiry** | Rooms with `expires_at` in the past pile up | Run a Supabase `pg_cron` job: `DELETE FROM rooms WHERE expires_at < now()` — or handle in a Supabase Edge Function |
| **4-player Mahjong in room** | Current mahjong.js online mode is only 1v1 (2 human + 2 AI). True 4-player online requires significant mahjong.js changes | Phase H only connects 2 humans in a room for mahjong; full 4P online is a separate future phase |
| **Removing mp-panel** (Phase J) | Any bookmarked or shared links to per-game multiplayer break | Phase J should be deployed after room system has been live for ≥1 week with confirmed usage |
| **Mobile layout** | 3-column lobby layout collapses; chat panel obscures game on mobile | Phase F CSS has `@media (max-width:900px)` stacking; chat panel is full-screen modal on mobile |
| **Dual-instance board_state collision** | Two game instances writing to same room row at same time | Each instance writes to `game_instances[n].board_state` keyed by `instance_id`, not to the top-level `board_state` |

---

## File Index — All Files Created or Modified

| File | Action | Phase |
|---|---|---|
| `supabase/migrations/001_room_system.sql` | Create | A |
| `js/utils/room.js` | Create | B |
| `pages/rooms.html` | Create | C |
| `js/rooms/entry.js` | Create | C |
| `css/rooms.css` | Create | D/F |
| `pages/room.html` | Create | E |
| `js/rooms/lobby.js` | Create | E |
| `js/rooms/ingame.js` | Create | G |
| `js/rooms/assign.js` | Create | G |
| `js/rooms/game-bridge.js` | Create | H |
| `js/rooms/endscreen.js` | Create | I |
| `js/games/tien-len.js` | Modify | H, J |
| `js/games/mahjong.js` | Modify | H, J |
| `pages/games/tien-len.html` | Modify | H, J |
| `pages/games/mahjong.html` | Modify | H, J |
| `js/utils/multiplayer.js` | Deprecate | J |
| `css/games.css` | Remove mp-panel rules | J |
| `css/components.css` | Add `nav-link--rooms` | C |
| `index.html` | Add Rooms nav link | C |
| `pages/browse.html` | Add Rooms nav link | C |
| `pages/about.html` | Add Rooms nav link | C |
| All `pages/games/*.html` | Add Rooms nav link | C |
| `js/utils/navigation.js` | Active link detection | J |
