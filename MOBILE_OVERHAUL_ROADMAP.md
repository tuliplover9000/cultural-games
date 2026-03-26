# MOBILE_OVERHAUL_ROADMAP.md
## Cultural Games — Full Mobile Overhaul
**Complexity: 5/5** — 14 canvas implementations, full room flow, shared infrastructure, gestures, and haptics across the entire site.

---

## Phase A — Shared Mobile Foundation & File Scaffold

**Goal:** Establish `/shared/mobile.css` and `/shared/mobile.js` as the authoritative mobile layer. Wire them into every HTML page. Define all breakpoints, CSS custom properties, and the JS utility API that all later phases will consume.

**Tasks:**
1. Create `/shared/mobile.css`
   - Define breakpoint custom properties at `:root`: `--mb-phone-max: 430px`, `--mb-phone-min: 360px`
   - CSS prefix `mb-` for all new mobile classes
   - Import at the bottom of every page's CSS link list (after game-specific CSS, before any inline styles)
   - Initial contents: just the reset/foundation rules — box-sizing, `touch-action: manipulation` on interactive elements, `-webkit-tap-highlight-color: transparent` globally, `user-select: none` on canvas elements
2. Create `/shared/mobile.js`
   - IIFE pattern, exposes `window.MobileUtils`
   - API surface:
     - `MobileUtils.isMobile()` → boolean, checks `window.innerWidth <= 430`
     - `MobileUtils.isLandscape()` → boolean
     - `MobileUtils.onOrientationChange(cb)` → registers listener, fires immediately with current state
     - `MobileUtils.vibrate(pattern)` → wraps `navigator.vibrate()` with feature detection fallback
     - `MobileUtils.scaleCanvas(canvas, logicalW, logicalH)` → computes and applies `devicePixelRatio`-aware scaling to fit canvas in its container, returns `{ scale, offsetX, offsetY }` for hit-test coordinate remapping
     - `MobileUtils.remapTouch(e, canvas, scaleInfo)` → converts `TouchEvent` coordinates to logical canvas coordinates using scale info from above
     - `MobileUtils.swipeDetector(element, { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold })` → attaches touchstart/touchend listeners, returns `destroy()` function
     - `MobileUtils.longPress(element, cb, duration=500)` → attaches touch listeners for long-press detection, returns `destroy()`
3. Add `<script src="/shared/mobile.js"></script>` and `<link rel="stylesheet" href="/shared/mobile.css">` to every HTML page's `<head>` — all 21 HTML files
4. Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` to every page that doesn't already have it (audit all 21)
5. Add `<meta name="mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-capable" content="yes">` to every page
6. Create `/shared/mobile-nav.css` and `/shared/mobile-nav.js` (stubs only — Phase B fills them)

**Acceptance criteria:**
- `window.MobileUtils` exists on every page
- `scaleCanvas()` tested manually: canvas fills container on iPhone SE (375px) and iPhone 15 Pro (393px) without overflow
- No horizontal scroll on index, browse, or any game page at 375px viewport width
- All tap targets pass 44px minimum height audit in Chrome DevTools

**Gotchas:**
- `devicePixelRatio` on high-DPI phones (2×, 3×) means your logical canvas size and CSS size diverge — `scaleCanvas()` must set `canvas.width = logicalW * dpr`, `canvas.height = logicalH * dpr`, then `ctx.scale(dpr, dpr)`, then set `canvas.style.width` and `canvas.style.height` via CSS. Don't conflate CSS pixels and canvas pixels.
- `viewport-fit=cover` is needed for iPhone notch/safe-area handling — pair with `env(safe-area-inset-*)` CSS vars in Phase B
- `touch-action: manipulation` prevents the 300ms tap delay on mobile browsers without needing a library

---

## Phase B — Bottom Tab Bar Navigation

**Goal:** Replace the current top nav with a thumb-friendly bottom tab bar on mobile. Desktop nav is completely unchanged.

**Tasks:**
1. Design the tab bar in `/shared/mobile-nav.css` (prefix `mb-nav-`)
   - Fixed to bottom of viewport: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000`
   - Height: 56px + `env(safe-area-inset-bottom)` padding for iPhone home indicator
   - 5 tabs: Home, Browse, Play (rooms), Profile, More (overflow drawer)
   - Active tab indicator: colored top border or filled icon
   - Background: `var(--surface)` with `backdrop-filter: blur(12px)` for frosted glass effect
   - Icons: use existing SVGs from `/assets/icons/` where possible; add 5 new tab icons if needed
   - Labels: 11px below icon, truncated if needed
   - `mb-nav-hidden` class: `transform: translateY(100%)` with transition — used to hide bar during fullscreen game play
2. Build `/shared/mobile-nav.js`
   - IIFE, exposes `window.MobileNav`
   - Injects the tab bar DOM into `<body>` on mobile only (`MobileUtils.isMobile()` guard)
   - Adds `mb-nav-active` class to correct tab based on `window.location.pathname`
   - "More" tab opens a slide-up drawer with links to: Tournament, About, Discord, Settings
   - `MobileNav.hide()` and `MobileNav.show()` — called by game pages when entering/exiting fullscreen
   - Handles `safe-area-inset-bottom` via CSS env() — no JS calculation needed
3. Add `padding-bottom: calc(56px + env(safe-area-inset-bottom))` to `<body>` on mobile so content doesn't get hidden behind the tab bar — add this to `/shared/mobile.css` as a media query
4. Suppress existing top nav links on mobile (`@media (max-width: 430px) { .nav-links { display: none; } }`) — keep logo/hamburger-free header for page title context or remove entirely per page
5. Wire `mobile-nav.js` into all 21 HTML pages

**Acceptance criteria:**
- Tab bar visible on all pages at 375px viewport
- Correct tab highlighted on each page
- "More" drawer opens/closes smoothly
- Tab bar hidden when game is in fullscreen mode
- No overlap with game canvas or modal content
- Safe area respected on iPhone with home indicator (test in Safari)

**Gotchas:**
- `env(safe-area-inset-bottom)` only works inside `calc()` in some browsers — always use `calc(56px + env(safe-area-inset-bottom))` not just `env()`
- The tab bar will conflict with the existing room system's in-game header strip — coordinate with Phase G so the strip and tab bar coexist without overlapping
- "Play" tab should deep-link to `/pages/rooms.html` or trigger the room browser, not just navigate to a game

---

## Phase C — Browse Page Mobile Pass

**Goal:** Make the browse page fully usable on a 375px phone. Cards readable, filters accessible, search usable.

**Tasks:**
1. Game cards: switch from current grid to single-column or 2-column grid at ≤430px
   - Card height auto, image/icon prominent (48px SVG icon centered)
   - Title, origin, category badge all visible without overflow
   - Play button: full-width, 48px tall minimum
2. Filter bar: convert horizontal filter row to a horizontally scrollable pill row (no wrapping)
   - `overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch`
   - Each filter pill: 36px height, 12px horizontal padding, rounded
   - Active filter: filled background
   - Hide scrollbar visually (`scrollbar-width: none`)
3. Search input: full-width at mobile, 48px tall, clear button inside input
4. Category section headers: reduce font size, tighten margins
5. "Featured" hero section (if present): stack vertically, reduce padding
6. Lazy-load game icons below the fold using `IntersectionObserver` — the 14 SVGs loading at once on slow mobile connections is noticeable
7. Add pull-to-refresh gesture using `MobileUtils.swipeDetector` on the page body (swipe down from top triggers `location.reload()` — optional, nice-to-have)

**Acceptance criteria:**
- All 14 game cards visible and tappable at 375px with no horizontal scroll
- Filter pills scroll smoothly with touch
- Search input doesn't trigger zoom (font-size ≥ 16px on input to prevent iOS zoom)
- No text overflow or clipping on any card

**Gotchas:**
- iOS zooms into inputs with `font-size < 16px` — set `font-size: 16px` on all `<input>` elements even if you visually scale them down with `transform`
- `IntersectionObserver` for lazy-loading: use a `data-src` pattern on `<img>` tags or swap SVG `use` hrefs on intersection

---

## Phase D — Modal & Overlay Mobile Pass

**Goal:** All modals, overlays, drawers, and toasts fit and are usable on a 375px screen.

**Affected components:** Auth modal, Achievement toast, Room create/join modal, Share/QR modal, Tutorial tooltips, Coin bet modal, Email capture, Tournament bracket modal

**Tasks:**
1. Global modal rule in `/shared/mobile.css`:
   ```css
   @media (max-width: 430px) {
     .modal, [class*="-modal"], [class*="-overlay"] {
       width: 100% !important;
       max-width: 100% !important;
       margin: 0 !important;
       border-radius: 16px 16px 0 0 !important;
       position: fixed !important;
       bottom: 0 !important;
       top: auto !important;
       max-height: 90vh;
       overflow-y: auto;
     }
   }
   ```
   This converts all modals to bottom sheets on mobile automatically. Audit each modal after applying — some will need individual fixes.
2. Auth modal: ensure form fields are 48px tall, labels above inputs (not inline), submit button full-width
3. Share/QR modal (`sr-`): QR code must be large enough to scan (min 200×200px); share URL input full-width with copy button stacked below on mobile
4. Achievement toasts: position `top: env(safe-area-inset-top) + 12px`, not bottom (conflicts with tab bar)
5. Tutorial tooltips (`tt-`): on mobile, convert floating tooltips to a bottom-anchored step panel (full-width bar at bottom of screen above tab bar, with prev/next buttons and step counter)
6. Tournament bracket modal: horizontal scroll with `overflow-x: auto` — bracket trees don't reflow, they scroll
7. Coin bet modal: large tap targets for +/- buttons (min 48×48px), number input centered and large
8. Email capture: single-column stacked layout, full-width button
9. All modals: add swipe-down-to-dismiss gesture using `MobileUtils.swipeDetector` on the modal element
10. Backdrop tap-to-dismiss must work on touch (verify `touchend` fires on backdrop, not just `click`)

**Acceptance criteria:**
- Every modal opens as a bottom sheet on mobile
- Swipe down dismisses any modal
- No modal content clipped below viewport or behind tab bar
- All form inputs ≥16px font-size (no iOS zoom)
- QR code scannable at arm's length

**Gotchas:**
- The wildcard CSS selector for modals will catch things you don't want — audit carefully and add `mb-no-sheet` class to any overlay that should NOT become a bottom sheet (e.g. fullscreen overlays, tutorial step panels)
- `-webkit-overflow-scrolling: touch` is deprecated but harmless — use `overscroll-behavior: contain` instead on modal scroll containers

---

## Phase E — Game Page Shell Mobile Pass

**Goal:** The game page wrapper (header, how-to-play accordion, cultural context, Play With Friend CTA) is clean and usable on mobile before we touch the canvas.

**Tasks:**
1. Game page header: icon + title + origin on one line at desktop; stack icon above title+origin on mobile. Badge wraps below.
2. "Back to Browse" link: ensure it's ≥44px tap target
3. How to Play accordion: open by default on desktop, **closed** by default on mobile (saves screen space)
4. Cultural Context accordion: closed on both
5. Accordion expand/collapse: chevron icon 44×44px tap target, smooth `max-height` transition
6. Play With Friend CTA (`pwf-`): full-width button on mobile, stacked layout if it has secondary text
7. Game container (`#game-container`): `width: 100%; overflow: hidden` on mobile — no horizontal scroll
8. Loading placeholder: centered spinner, appropriate height so page doesn't jump on load
9. Bottom padding on game page: account for tab bar height so "How to Play" content isn't hidden

**Acceptance criteria:**
- Game page renders cleanly at 375px for all 14 game pages
- How to Play accordion closed by default on mobile
- No horizontal scroll anywhere on game page shell
- All tap targets ≥44px

**Gotchas:**
- Some game pages may have custom markup that deviates from the standard template — audit all 14 HTML files and normalize during this phase
- The PWF component has its own internal layout — may need a `mb-` override in its own CSS or a flag passed to its init function

---

## Phase F — Canvas Scaling & Landscape Prompt (Shared)

**Goal:** Build the shared canvas scaling utility and landscape orientation prompt. Every game will use this in Phase G.

**Tasks:**
1. Implement `MobileUtils.scaleCanvas(canvas, logicalW, logicalH)` fully (stubbed in Phase A):
   - Reads container width from `canvas.parentElement.getBoundingClientRect()`
   - Computes uniform scale to fit container while maintaining aspect ratio (letterbox)
   - Applies `devicePixelRatio` scaling to canvas internal resolution
   - Sets `canvas.style.width` and `canvas.style.height` to CSS pixel dimensions
   - Stores scale info on `canvas._mbScale = { scale, offsetX, offsetY, dpr }` for hit-testing
   - Returns the scale info object
   - Re-runs on `resize` and orientation change automatically if `autoResize: true` option passed
2. Implement `MobileUtils.remapTouch(e, canvas)`:
   - Reads `canvas._mbScale`
   - Converts `e.touches[0].clientX/Y` → logical canvas coordinates
   - Returns `{ x, y }` in logical space
3. Build the landscape prompt overlay:
   - `/shared/mobile-landscape.css` (prefix `mb-land-`)
   - Full-screen overlay with rotate-device icon + "Rotate for best experience" text
   - Shown when: `MobileUtils.isMobile() && !MobileUtils.isLandscape()`
   - Dismissable with a "Play anyway" button that sets `sessionStorage.mbLandscapeDismissed = true`
   - Hidden automatically when device rotates to landscape
   - Inject via `MobileUtils.showLandscapePrompt(gameContainerEl)` called from each game's init
4. `MobileUtils.onOrientationChange`: re-triggers `scaleCanvas` on all registered canvases when orientation changes
5. Test `scaleCanvas` against a dummy canvas at: 375px portrait, 667px landscape (iPhone SE), 393px portrait, 852px landscape (iPhone 15 Pro)

**Acceptance criteria:**
- Canvas fills available width without overflow at all tested resolutions
- No blurriness on retina displays (DPR scaling correct)
- Landscape prompt shows in portrait, hides in landscape
- "Play anyway" dismissal persists for the session
- Hit-testing still accurate after scaling (click a known coordinate, verify correct logical position)

**Gotchas:**
- ⚠️ DPR scaling is the #1 source of blurry canvas on mobile. Pattern is: `canvas.width = logicalW * dpr; canvas.height = logicalH * dpr; ctx.scale(dpr, dpr)`. The canvas CSS size stays at logical pixels. Any game that sets `canvas.width` directly in its own init will need to be updated in Phase G.
- Orientation change fires `resize` event on some browsers and `orientationchange` on others — listen to both, debounce by 150ms
- `getBoundingClientRect()` returns 0 for hidden elements — call `scaleCanvas` after the canvas is visible in the DOM

---

## Phase G — Per-Game Touch Controls ⚠️

**Goal:** All 14 games playable via touch on mobile. Each game gets tap/drag/swipe controls wired through `MobileUtils.remapTouch()` and `scaleCanvas()`.

**This is the largest phase. Work through games in this order (simplest touch model first):**

### Group 1 — Tap to select + tap to move (grid/point-based boards)
These games already use click events; add parallel touch handlers using `remapTouch`.

**Fanorona** (`fn-`): `touchend` → `remapTouch` → same handler as `click`. No drag needed.
**Hnefatafl** (`ht-`): same pattern. Tap piece to select, tap destination to move.
**Latrunculi** (`ll-`): same pattern.
**Xinjiang Fangqi** (`xf-`): same pattern.
**Filipino Dama** (`fd-`): same pattern — tap to select, valid moves highlight, tap to move.
**Oware** (`ow-`): tap pit to sow — single tap, no drag.
**Patolli** (`pt-`): tap to move token along track. Dice roll: tap button.
**Puluc** (`pu-`): tap to select piece and move.
**Pallanguzhi** (`pg-`): tap pit — same as Oware pattern.

**For all Group 1 games:**
- Replace or augment `canvas.addEventListener('click', handler)` with:
  ```js
  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    const pos = MobileUtils.remapTouch(e, canvas);
    handler({ offsetX: pos.x, offsetY: pos.y });
  }, { passive: false });
  ```
- Call `MobileUtils.scaleCanvas(canvas, LOGICAL_W, LOGICAL_H)` in each game's init
- Call `MobileUtils.showLandscapePrompt(document.getElementById('game-container'))` in each game's init

### Group 2 — Complex touch (drag, multi-touch, or special interactions)

**Pachisi** (`pc-`): Cowrie dice animation triggered by tap (currently button click). Token movement is tap-based. Add haptic feedback via `MobileUtils.vibrate([30])` on dice roll and `[15]` on token move.

**Mahjong** (`mj-`): Tile selection is tap. Drawing from wall is tap. Discard is tap. Consider long-press on tile to show enlarged view via `MobileUtils.longPress()`. Haptic on discard: `vibrate([20])`.

**Ganjifa** (`gj-`): Circular card layout — tap to select card from hand, tap play area to play. Cards may be small on 375px — increase hit area by 8px padding around each card's logical bounds in the touch handler, not the visual render.

**Tiến Lên** (`tl-`): Card selection (tap to toggle), play button (tap). Card fan layout may be tight — same expanded hit area approach as Ganjifa.

**Bầu Cua** (`bc-`): Betting interface — tap animal tiles to place bet. Dice shake animation: add `touchstart` → `vibrate([10, 50, 10])` pattern on the roll button for a "rumble" feel.

**Cachos** (`ca-`): Dice game — tap to roll, tap dice to hold/release. Long-press on held die to release all. Haptic on roll: `vibrate([20, 30, 20])`.

**For all Group 2 games:** same `scaleCanvas` + `showLandscapePrompt` calls as Group 1, plus the specific interactions above.

**Tasks (apply to all 14 games):**
1. Add `MobileUtils.scaleCanvas(canvas, W, H)` call in each game's init function, after canvas is appended to DOM
2. Re-run `scaleCanvas` in each game's existing `window.addEventListener('resize', ...)` handler
3. Add `touchend` handlers mapped through `remapTouch` for all tap interactions
4. Add `MobileUtils.showLandscapePrompt(document.getElementById('game-container'))` to each game's init
5. Add haptic feedback at meaningful moments (dice rolls, captures, wins)
6. Win screen: ensure "Play Again" / "Back to Browse" buttons are ≥48px tall on mobile
7. Test each game end-to-end on a 375px viewport — complete one full game per title

**Acceptance criteria:**
- All 14 games completable by touch from start to finish
- No touch event falls through to browser scroll behavior during gameplay (`e.preventDefault()` where needed)
- Canvas not blurry on retina
- Haptic fires on supported devices, silently no-ops on unsupported
- Landscape prompt shown in portrait for all games

**Gotchas:**
- ⚠️ `e.preventDefault()` on `touchstart`/`touchend` inside canvas blocks scroll — this is intentional during gameplay but you must NOT prevent default on the game page's scroll areas outside the canvas. Use `{ passive: false }` only on canvas touch listeners, not on the page body.
- ⚠️ Some games may set `canvas.width/height` at init and again on resize — make sure `scaleCanvas` is the single source of truth for canvas dimensions after mobile integration. Remove any conflicting resize logic.
- Card games (Tiến Lên, Ganjifa, Mahjong) may need a "zoom/pan" mode if cards are too small even after scaling — flag for post-MVP if hit areas remain problematic after testing

---

## Phase H — Rooms & Lobby Mobile Pass

**Goal:** The full room flow (create → join → lobby → assign → play → endscreen) is clean, readable, and fully operable on a 375px phone.

**Tasks:**

**Room Browser (`rb-`):**
- Card layout: single column on mobile, full-width cards
- Room name, game name, player count, join button all visible without truncation
- Join button: full-width, 48px

**Create Room modal:**
- Bottom sheet (handled by Phase D global rule)
- Game selector: scrollable list, not a dropdown — dropdowns are hard to use on mobile
- Room name input: 48px tall, 16px font
- Max players stepper: large +/- buttons

**Join Room modal:**
- Code input: large, centered, 48px tall, `inputmode="numeric"` or `inputmode="text"` depending on code format
- Auto-focus on open

**Lobby:**
- Player list: full-width cards, avatar/name/status clearly readable
- Host controls (start, kick): grouped at bottom, large buttons
- Game suggestion queue: scrollable horizontally
- Chat sidebar: on mobile, chat collapses to a toggle button (chat icon in corner) that slides up a full-screen chat panel. Chat panel has its own close button. Unread badge on chat toggle icon.
- "Waiting for players" state: animated indicator, not just static text

**In-game header strip:**
- Slim strip stays at top (above canvas), height ≤ 40px
- Must not overlap canvas — `game-container` top margin accounts for strip height on mobile
- Tab bar hidden during active room game (`MobileNav.hide()` called when room game starts, `MobileNav.show()` on exit)

**Endscreen:**
- Full-screen overlay on mobile
- Winner name large and prominent
- Stats (coins won, game name) readable
- Rematch / Leave Room buttons: full-width, stacked, 52px tall each
- Session leaderboard: scrollable table, condensed columns on mobile

**Tasks:**
1. Audit every room JS file (`/js/rooms/`) and its associated HTML/CSS for mobile breakpoint gaps
2. Implement chat collapse/expand for mobile in room lobby
3. Wire `MobileNav.hide()` / `MobileNav.show()` around room game start/end
4. Test full room flow: create room → join on second device → lobby → start game → play → endscreen → rematch

**Acceptance criteria:**
- Complete room flow operable on a 375px phone
- Chat accessible but not intrusive on small screens
- In-game strip doesn't overlap canvas
- Tab bar hidden during room gameplay, restored on exit
- Endscreen readable and actionable without scrolling

**Gotchas:**
- The chat sidebar in desktop mode is likely absolutely or fixed positioned — on mobile it needs to become a full-screen panel driven by a toggle, not a sidebar. This is a significant layout change for the lobby component.
- `MobileNav.hide()` must be called early enough in the room game start flow that there's no flash of the tab bar during the transition

---

## Phase I — Profile, Tournament & Remaining Pages Mobile Pass

**Goal:** Every remaining page (profile, tournament, about, landing/index) is clean on mobile.

**Tasks:**

**Profile page (`/profile/`):**
- Avatar + username + coin balance: stacked vertically, centered
- Achievement grid: 3-column grid (badges are small) → 4-column on mobile (icon only, name on tap via tooltip)
- Stats table: 2 columns max on mobile, scroll horizontally if needed
- Favorite games: horizontal scroll row

**Tournament page (`tn-`):**
- Bracket view: horizontal scroll, `overflow-x: auto` on bracket container
- Bracket nodes: minimum 80px wide, tappable
- Join/spectate buttons: full-width on mobile
- Prize/coin display: prominent, large font

**Landing page / index:**
- Hero section: stacked layout, CTA button full-width
- Featured games row: horizontal scroll carousel
- "How it works" section: single column

**About page:**
- Single column, generous padding, readable font size (≥16px body)

**Acceptance criteria:**
- Profile, tournament, landing, about pages all clean at 375px
- No horizontal scroll except intentional carousels/brackets
- Achievement badges tappable to show names on mobile

**Gotchas:**
- Tournament bracket is inherently wide — don't try to reflow it, just make it scroll horizontally with a visual hint (gradient fade on right edge)

---

## Phase J — QA, Performance & Final Polish

**Goal:** Full end-to-end QA pass on mobile. Performance audit. Accessibility check. Ship.

**Tasks:**

**QA Checklist:**
1. Test every page at 375px (iPhone SE) and 393px (iPhone 15 Pro) in Chrome DevTools
2. Test in actual Safari on iOS (DevTools mobile simulation misses some Safari quirks)
3. Verify safe-area-inset on iPhone with home indicator (bottom of tab bar, top of landscape prompt)
4. Test every game: complete one full game by touch on each of the 14 titles
5. Test full room flow on two devices simultaneously
6. Verify dark mode + mobile combination on all pages (theme switch while on mobile)
7. Verify all modals open as bottom sheets and swipe-dismiss works
8. Check all form inputs don't trigger iOS zoom (font-size ≥ 16px)
9. Verify haptics fire on physical iOS and Android devices
10. Verify landscape prompt shows/hides correctly on device rotation for all 14 games

**Performance:**
1. Run Lighthouse mobile audit on index, browse, and one game page
2. Lazy-load game SVG icons on browse page (Phase C item — verify it shipped)
3. Verify `/shared/mobile.js` and `/shared/mobile.css` are not blocking render (defer JS, CSS in head is fine)
4. Check that `scaleCanvas` is not called on every frame — it should only run on resize/orientation change

**Accessibility:**
1. All interactive elements reachable and activatable by keyboard (for tablet users with keyboards)
2. Tab bar icons have `aria-label` attributes
3. Landscape prompt has `role="dialog"` and `aria-label`
4. Touch targets ≥44×44px verified with axe DevTools

**Final Polish:**
1. Add `transition: transform 0.2s ease` to tab bar show/hide
2. Add momentum scrolling (`-webkit-overflow-scrolling: touch` → replaced by `overscroll-behavior`) to all scroll containers
3. Verify no `console.error` on any page in mobile emulation
4. Update `README.md` with mobile architecture notes (which files handle what)

**Acceptance criteria:**
- Lighthouse mobile Performance score ≥ 75 on browse page
- Zero horizontal scroll on any page except intentional carousels
- All 14 games completable by touch
- Full room flow works on two physical devices
- Zero iOS zoom triggered by inputs
- Dark mode + mobile works everywhere

---

## Cultural Notes
N/A — this is an infrastructure roadmap with no cultural content.

## Complexity Rating
**5/5** — This touches every layer of the stack: 21 HTML pages, 14 canvas game implementations each with unique interaction models, the full room multiplayer flow, shared CSS/JS infrastructure, iOS/Android quirks (safe area, DPR, tap delay, zoom), and gesture/haptic systems — all without any external libraries.

## Flagged Complex Phases
- ⚠️ **Phase F** — DPR canvas scaling is subtle. Getting it wrong produces blurry canvases or broken hit-testing. The `scaleCanvas` utility must be bulletproof before Phase G begins.
- ⚠️ **Phase G** — 14 games × unique touch models = largest single phase in any roadmap to date. Work through Group 1 games first to validate the pattern, then tackle Group 2. Budget 2–3x the time of a normal phase.
- ⚠️ **Phase H** — The room chat sidebar → mobile panel conversion is a significant layout refactor, not just a CSS tweak. The lobby component likely needs structural HTML changes.
