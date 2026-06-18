/**
 * senet.js — Senet (Ancient Egypt, Kendall reconstruction, digital adaptation)
 *
 * SECTIONS:
 *   1.  Constants & path mapping (boustrophedon 3×10, squares 1–30)
 *   2.  Colour bridge (window.CGTheme) — Egyptian palette, light/dark variants
 *   3.  Sizing (dpr-aware) + locked `geo` layout object (board + stick tray)
 *   4.  State model (serializable blob) + helpers
 *   5.  Rules engine — throws, forward/backward moves, swap, protection,
 *       blockade walls, House of Beauty must-land, House of Water, bear-offs
 *   6.  Win detection + terminal-state audit
 *   7.  Animation engine (rAF) — stick tumble, piece slide, water, bear-off
 *   8.  Rendering — frame, ivory squares, hieroglyphs, pieces, tray, pulses
 *   9.  HUD / controls / end-screen overlay
 *   10. Turn flow — throw → move → extra throw / forfeit / pass
 *   11. AI opponent (P2) with gen-counter guard
 *   12. Input (canvas tap + throw button)
 *   13. Multiplayer (RoomBridge) — full-state blob, echo suppression
 *   14. Init, tutorial, FSMode hooks, GameResize
 *
 * Path positions are 0–29 internally (board array index); all rule logic and
 * comments speak in 1-based squares 1–30 to match the historical board.
 */
(function () {
  'use strict';

  // ── 1. Constants & path mapping ─────────────────────────────────────────────
  var COLS = 10, ROWS = 3, TOTAL = 30;
  var P1 = 'P1', P2 = 'P2';            // P1 = light cones (human/seat 0), P2 = dark spools
  var PIECES = 5;
  var PAD = 18;                        // CSS px padding around everything

  // Layout factors in cell units (LOCKED — geo is the single source of truth)
  var FRAME_F = 0.30;                  // ebony frame thickness
  var GAP_F   = 0.30;                  // gap between frame and stick tray
  var TRAY_F  = 1.50;                  // stick-tray strip height
  var W_CELLS = COLS + FRAME_F * 2;                       // 10.6
  var H_CELLS = FRAME_F * 2 + ROWS + GAP_F + TRAY_F;      // 5.4
  var MAX_BOARD_W = 860;

  // Special squares (1-based, historical names)
  var SQ_REBIRTH = 15;   // House of Rebirth (ankh)
  var SQ_BEAUTY  = 26;   // House of Beauty (nefer) — every piece must land here
  var SQ_WATER   = 27;   // House of Water — sends the piece back to 15
  var SQ_THREE   = 28;   // House of Three Truths — exact 3 bears off
  var SQ_TWO     = 29;   // House of Re-Atoum — exact 2 bears off
  var SQ_HORUS   = 30;   // House of Horus — any throw bears off

  // Boustrophedon: squares 1–10 top row L→R, 11–20 middle row R→L, 21–30 bottom L→R.
  function posToRC(p) {                // p = 0-based path position
    var row = Math.floor(p / COLS);
    var col = p % COLS;
    if (row === 1) col = (COLS - 1) - col;
    return { row: row, col: col };
  }
  function rcToPos(row, col) {
    if (row === 1) return row * COLS + ((COLS - 1) - col);
    return row * COLS + col;
  }

  // ── Canvas ──────────────────────────────────────────────────────────────────
  var cnv, ctx;

  // ── 2. Colour bridge (window.CGTheme) ───────────────────────────────────────
  var C = {};
  function readColors() {
    var p = (window.CGTheme && typeof window.CGTheme.getColors === 'function')
      ? window.CGTheme.getColors() : {};
    var dark = (window.CGTheme && typeof window.CGTheme.getTheme === 'function')
      ? window.CGTheme.getTheme() === 'dark' : false;

    C = {
      bg:        dark ? '#171007' : '#211608',
      frame:     dark ? '#0f0a06' : '#1a120a',          // ebony
      frameLine: dark ? 'rgba(200,155,60,0.40)' : 'rgba(200,155,60,0.55)',
      sqA:       dark ? '#cfc1a0' : '#e8dcc0',          // ivory
      sqB:       dark ? '#c2b390' : '#ddd0b2',          // alternating tint
      sqBorder:  dark ? '#74603f' : '#8a6f4d',
      ink:       dark ? '#3c2c18' : '#4a3520',          // hieroglyph ink
      teal:      p.accentTeal || '#3A9990',             // faience accent
      gold:      p.accentGold || '#C89B3C',
      tray:      'rgba(0,0,0,0.32)',
      stickIvory:dark ? '#d9ccab' : '#e9ddc2',
      stickBark: dark ? '#43301c' : '#503a22',
      stickGrain:dark ? '#2e2012' : '#3a2a16',
      // Pieces
      p1:        '#F5E6C8',                             // light cones
      p1Ring:    '#9a7030',
      p1Shine:   'rgba(255,255,255,0.50)',
      p2:        '#2a1a10',                             // dark spools
      p2Top:     '#3a2718',
      p2Ring:    '#0d0703',
      p2Shine:   'rgba(255,255,255,0.12)',
      shadow:    'rgba(0,0,0,0.30)',
      // Highlights
      pulse:     p.accentGold || '#E8C84A',
      backPulse: '#cf5340',                             // backward-only warning
      destDot:   'rgba(232,200,74,0.45)',
      text:      p.text      || '#F0E6D0',
      muted:     p.textMuted || '#B09070',
    };
  }

  // ── 3. Sizing (devicePixelRatio-aware) + geo ────────────────────────────────
  function dpr() { return Math.max(1, Math.min(window.devicePixelRatio || 1, 3)); }

  // Lay the canvas out to a given CSS width; height follows the locked aspect.
  // Explicit px style size so the canvas centres (margin:auto) inside the wrap.
  function sizeToWidth(cssW) {
    if (!cnv) return;
    var scale = window.CGMobileScale || 1;
    var ratio = dpr();
    var wCss = Math.max(180, Math.min(Math.round(cssW * scale), MAX_BOARD_W));
    var cellCss = (wCss - PAD * 2) / W_CELLS;
    var hCss = Math.round(PAD * 2 + cellCss * H_CELLS);
    cnv.width  = Math.round(wCss * ratio);
    cnv.height = Math.round(hCss * ratio);
    // Width only — leaving height auto means the display box always follows the
    // buffer aspect, so a CSS max-width clamp can never distort the board.
    cnv.style.width  = wCss + 'px';
    cnv.style.height = '';
    render();
  }

  function resizeCanvas() {
    var wrap = document.getElementById('se-board-wrap');
    if (!wrap) return;
    sizeToWidth(wrap.clientWidth || 480);
  }

  // All offsets/sizes live here — computed once per render, nothing inline twice.
  var geo = {};
  function computeLayout() {
    var ratio = dpr();
    var pad = PAD * ratio;
    var cell = (cnv.width - pad * 2) / W_CELLS;
    var frame = cell * FRAME_F;
    geo = {
      ratio:  ratio,
      pad:    pad,
      cell:   cell,
      frame:  frame,
      frameX: pad,
      frameY: pad,
      frameW: cell * COLS + frame * 2,
      frameH: cell * ROWS + frame * 2,
      boardX: pad + frame,
      boardY: pad + frame,
      boardW: cell * COLS,
      boardH: cell * ROWS,
    };
    geo.trayX = geo.frameX;
    geo.trayY = geo.frameY + geo.frameH + cell * GAP_F;
    geo.trayW = geo.frameW;
    geo.trayH = cell * TRAY_F;
  }

  function posToXY(p) {
    var rc = posToRC(p);
    return {
      x: geo.boardX + rc.col * geo.cell + geo.cell / 2,
      y: geo.boardY + rc.row * geo.cell + geo.cell / 2,
    };
  }
  // Device-px point → path position 0–29, or null if outside the board.
  function xyToPos(x, y) {
    if (x < geo.boardX || y < geo.boardY) return null;
    var col = Math.floor((x - geo.boardX) / geo.cell);
    var row = Math.floor((y - geo.boardY) / geo.cell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return rcToPos(row, col);
  }

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // ── 4. State model ──────────────────────────────────────────────────────────
  var state;
  function freshState() {
    var board = new Array(TOTAL), i;
    for (i = 0; i < TOTAL; i++) board[i] = null;
    // Setup: light (P1) on squares 2,4,6,8,10; dark (P2) on 1,3,5,7,9.
    for (i = 0; i < PIECES; i++) {
      board[i * 2]     = P2;   // squares 1,3,5,7,9
      board[i * 2 + 1] = P1;   // squares 2,4,6,8,10
    }
    return {
      board: board,                       // array(30): null | 'P1' | 'P2'
      borneOff: { P1: 0, P2: 0 },
      turn: P1,                           // P1 (light, lead piece on 10) throws first
      thrw: null,                         // {value, faces:[4 bools], awaitingMove} | null
      extra: false,                       // current throw entitlement is an earned extra
      winner: null,
      last_actor: null,
    };
  }

  function other(p) { return p === P1 ? P2 : P1; }
  function boardAt(b, sq) { return (sq >= 1 && sq <= TOTAL) ? b[sq - 1] : null; }
  function at(sq) { return boardAt(state.board, sq); }

  // AI / mode flags
  var AI_PLAYER = P2;
  var vsAI = true;
  var aiTimer = null, forfeitTimer = null;
  // Generation counter — bumped on new game / room overwrite so stale timers
  // never fire into a fresh game (rematch bug guard).
  var gen = 0;

  // Multiplayer
  var vsRoom = false;
  var mySeat = 0;
  var myPlayer = P1;
  var winReported = false;

  // Local-only achievement trackers (never serialized)
  var localWater = false;    // any of the local player's pieces fell into 27 this game
  var chain = 0;             // consecutive extra throws earned this turn (local player)
  var ended = false;         // end-screen / achievements fired once guard

  // Overlay elements
  var overlayEl, overlayTitleEl, overlaySubEl;

  // ── 5. Rules engine ─────────────────────────────────────────────────────────
  // An enemy piece is protected when a same-colour piece sits on a path-adjacent
  // square (sq±1) — landing on it (swap) is then illegal.
  function isProtected(sq, owner) {
    if (at(sq - 1) === owner) return true;
    if (at(sq + 1) === owner) return true;
    return false;
  }

  // BLOCKADE: a run of 3+ consecutive enemy pieces strictly between the two
  // endpoints cannot be jumped. Forward: from < i && i+2 < dest; the backward
  // case is the mirror — generalized here via lo/hi.
  function blockadeCrossed(p, a, b) {
    var enemy = other(p);
    var lo = Math.min(a, b), hi = Math.max(a, b), i;
    for (i = lo + 1; i + 2 <= hi - 1; i++) {
      if (at(i) === enemy && at(i + 1) === enemy && at(i + 2) === enemy) return true;
    }
    return false;
  }

  // Forward move for `p` from 1-based square `from` with throw `v`.
  // Returns {to: sq|'OFF', swap?, water?} or null if illegal.
  function forwardDest(p, from, v) {
    var enemy = other(p), dest;

    // Parked final squares: only exact bear-offs.
    if (from === SQ_THREE) return v === 3 ? { to: 'OFF' } : null;   // 28 → exact 3
    if (from === SQ_TWO)   return v === 2 ? { to: 'OFF' } : null;   // 29 → exact 2
    if (from === SQ_HORUS) return { to: 'OFF' };                    // 30 → any throw

    if (from === SQ_BEAUTY) {            // 26: 1→27, 2→28, 3→29, 4→30, 5→off
      if (v === 5) return { to: 'OFF' };
      dest = from + v;                   // 27..30
      // Squares 26–30 are safe: cannot land on ANY occupied square (no swaps).
      if (at(dest) !== null) return null;
      if (blockadeCrossed(p, from, dest)) return null;
      if (dest === SQ_WATER) return { to: dest, water: true };
      return { to: dest };
    }

    // Squares 1–25: must land on or before 26 — carrying past 26 is illegal.
    dest = from + v;
    if (dest > SQ_BEAUTY) return null;
    if (dest === SQ_BEAUTY) {
      if (at(dest) !== null) return null;       // 26 is a safe square too
      if (blockadeCrossed(p, from, dest)) return null;
      return { to: dest };
    }
    if (at(dest) === p) return null;            // never land on your own piece
    if (at(dest) === enemy && isProtected(dest, enemy)) return null;
    if (blockadeCrossed(p, from, dest)) return null;
    return { to: dest, swap: at(dest) === enemy };
  }

  // Backward move — only legal when NO forward move exists with this throw.
  // Pieces on 28/29/30 are parked; 27 is never occupied.
  function backwardDest(p, from, v) {
    if (from > SQ_BEAUTY) return null;
    var enemy = other(p), dest = from - v;
    if (dest < 1) return null;
    if (at(dest) === p) return null;
    if (at(dest) === enemy && isProtected(dest, enemy)) return null;
    if (blockadeCrossed(p, from, dest)) return null;   // mirrored run check
    return { to: dest, swap: at(dest) === enemy, backward: true };
  }

  // All legal moves for `p` with throw `v`. Forward moves first; backward only
  // as a fallback. Empty list ⇒ the throw is forfeited.
  function legalMoves(p, v) {
    var list = [], sq, mv;
    for (sq = 1; sq <= TOTAL; sq++) {
      if (at(sq) !== p) continue;
      mv = forwardDest(p, sq, v);
      if (mv) { mv.from = sq; list.push(mv); }
    }
    if (list.length) return { list: list, backward: false };
    for (sq = 1; sq <= TOTAL; sq++) {
      if (at(sq) !== p) continue;
      mv = backwardDest(p, sq, v);
      if (mv) { mv.from = sq; list.push(mv); }
    }
    return { list: list, backward: true };
  }

  // House of Water relocation target: 15, else first empty square below.
  // Squares 1–15 can hold at most 9 other pieces, so an empty one always exists.
  function findRebirth(b) {
    var sq;
    for (sq = SQ_REBIRTH; sq >= 1; sq--) {
      if (boardAt(b, sq) === null) return sq;
    }
    return SQ_REBIRTH; // unreachable
  }

  function currentMoves() {
    if (!state || !state.thrw || !state.thrw.awaitingMove) return null;
    return legalMoves(state.turn, state.thrw.value);
  }

  // ── 6. Win detection ────────────────────────────────────────────────────────
  // TERMINAL-STATE AUDIT: the ONLY terminal state is borneOff === 5 for one
  // player, checked after every bear-off. A forfeited throw is never terminal —
  // the turn simply passes. "Both players blocked" cannot deadlock: forfeits
  // alternate and stick values change every throw, and a backward move is
  // always attempted before forfeiting, so play always eventually resolves
  // (worst case the players keep alternating forfeits until a stick value
  // unlocks a move — no draw rule exists in this ruleset).
  function checkWin(p) { return state.borneOff[p] >= PIECES; }

  // ── 7. Animation engine (rAF) ───────────────────────────────────────────────
  // State is committed FIRST; animations are purely visual ghosts drawn over a
  // board whose `hide` squares are skipped. Cancelling an animation (room blob,
  // new game) always leaves a render reproducible from state alone.
  var anim = null;
  var rafId = null;
  var loopTimer = null;

  function needLoop() {
    if (anim) return true;
    return !!(state && !state.winner && state.thrw && state.thrw.awaitingMove);
  }
  // rAF for smooth frames PLUS a coarse setTimeout fallback: rAF never fires in
  // hidden/background tabs, and without the fallback a mid-animation tab switch
  // would freeze the game (the done-callback chain drives the turn flow).
  function startLoop() {
    if (rafId === null) rafId = window.requestAnimationFrame(rafTick);
    if (loopTimer === null) loopTimer = setTimeout(timerTick, 150);
  }
  function rafTick() { rafId = null; tick(); }
  function timerTick() { loopTimer = null; tick(); }
  function tick() {
    var now = Date.now();
    stepAnim(now);
    render();
    if (needLoop()) startLoop();
  }
  function stepAnim(now) {
    if (!anim) return;
    if (now - anim.start < anim.dur) return;
    var a = anim, cb = anim.done;
    anim = null;
    if (a.type === 'move' && window.SFX) {
      if (a.swap && SFX.capture) SFX.capture();
      else if (SFX.place) SFX.place();
    }
    if (typeof cb === 'function') cb();
  }

  // info: {fromSq, toSq, player, swap:{fromSq,toSq}|null, water:{rebirthSq}|null, off:bool}
  function startMoveAnim(info, done) {
    var fromPos = info.fromSq - 1;
    var toPos;
    if (info.off) toPos = SQ_HORUS - 1;
    else if (info.water) toPos = SQ_WATER - 1;
    else toPos = info.toSq - 1;

    var seq = [], q, step = (toPos >= fromPos) ? 1 : -1;
    for (q = fromPos; q !== toPos; q += step) seq.push(q);
    seq.push(toPos);

    var segs = Math.max(0, seq.length - 1);
    var slideDur = Math.min(700, Math.max(140, segs * 140));
    var hide = [];
    if (!info.off && !info.water) hide.push(toPos);
    if (info.swap)  hide.push(info.swap.toSq - 1);
    if (info.water) hide.push(info.water.rebirthSq - 1);

    anim = {
      type: 'move',
      start: Date.now(),
      seq: seq,
      slideDur: slideDur,
      dur: slideDur + (info.water ? 550 : 0) + (info.off ? 260 : 0),
      player: info.player,
      hide: hide,
      swap: info.swap
        ? { player: other(info.player), fromPos: info.swap.fromSq - 1, toPos: info.swap.toSq - 1 }
        : null,
      water: info.water ? { rebirthPos: info.water.rebirthSq - 1 } : null,
      off: !!info.off,
      done: done,
    };
    startLoop();
  }

  function startStickAnim(finalFaces, done) {
    var seq = [], k, s, j;
    for (k = 0; k < 9; k++) {                 // random face-set every ~70ms
      s = [];
      for (j = 0; j < 4; j++) s.push(Math.random() < 0.5);
      seq.push(s);
    }
    anim = { type: 'sticks', start: Date.now(), dur: 600, seq: seq, faces: finalFaces, done: done };
    startLoop();
  }

  // ── 8. Rendering ────────────────────────────────────────────────────────────
  function drawPieceAt(x, y, r, who, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // soft shadow
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.55, r * 0.85, r * 0.30, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.shadow;
    ctx.fill();

    if (who === P1) {
      // LIGHT CONE: base ellipse + curved-sided triangle + shine
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.42, r * 0.80, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.p1; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.strokeStyle = C.p1Ring; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.0);
      ctx.quadraticCurveTo(x - r * 0.80, y - r * 0.15, x - r * 0.78, y + r * 0.42);
      ctx.quadraticCurveTo(x, y + r * 0.72, x + r * 0.78, y + r * 0.42);
      ctx.quadraticCurveTo(x + r * 0.80, y - r * 0.15, x, y - r * 1.0);
      ctx.closePath();
      ctx.fillStyle = C.p1; ctx.fill();
      ctx.strokeStyle = C.p1Ring; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.20, y - r * 0.45);
      ctx.lineTo(x - r * 0.06, y - r * 0.80);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, r * 0.10);
      ctx.strokeStyle = C.p1Shine; ctx.stroke();
    } else {
      // DARK SPOOL: waisted profile (two trapezoids tip-to-tip) + top ellipse
      var w = r * 0.78, h = r * 0.80, waist = w * 0.40;
      ctx.beginPath();
      ctx.moveTo(x - w, y - h);
      ctx.lineTo(x + w, y - h);
      ctx.lineTo(x + waist, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x - w, y + h);
      ctx.lineTo(x - waist, y);
      ctx.closePath();
      ctx.fillStyle = C.p2; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.strokeStyle = C.p2Ring; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y - h, w, w * 0.30, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.p2Top; ctx.fill();
      ctx.strokeStyle = C.p2Ring; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - w * 0.30, y - h, w * 0.30, w * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.p2Shine; ctx.fill();
    }
    ctx.restore();
  }

  // Hieroglyphs — minimal dark-ink ctx paths on the special squares.
  function drawGlyph(sq, cx, cy, s) {
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = C.ink;
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.lineCap = 'round';
    var k, yy, xx;
    if (sq === SQ_REBIRTH) {                    // ANKH: loop + stem + crossbar
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.20, s * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.07); ctx.lineTo(cx, cy + s * 0.30);
      ctx.moveTo(cx - s * 0.18, cy + s * 0.02); ctx.lineTo(cx + s * 0.18, cy + s * 0.02);
      ctx.stroke();
    } else if (sq === SQ_BEAUTY) {              // NEFER (lute shape): oval body at
      ctx.beginPath();                          // the BOTTOM, neck up, crossbar high
      ctx.ellipse(cx, cy + s * 0.17, s * 0.13, s * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.01); ctx.lineTo(cx, cy - s * 0.32);
      ctx.moveTo(cx - s * 0.15, cy - s * 0.18); ctx.lineTo(cx + s * 0.15, cy - s * 0.18);
      ctx.stroke();
    } else if (sq === SQ_WATER) {               // WATER: 3 stacked zigzags
      for (k = 0; k < 3; k++) {
        yy = cy - s * 0.16 + k * s * 0.16;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.26, yy);
        ctx.lineTo(cx - s * 0.13, yy - s * 0.06);
        ctx.lineTo(cx,            yy);
        ctx.lineTo(cx + s * 0.13, yy - s * 0.06);
        ctx.lineTo(cx + s * 0.26, yy);
        ctx.stroke();
      }
    } else if (sq === SQ_THREE || sq === SQ_TWO) {  // 3 / 2 vertical strokes
      var n = (sq === SQ_THREE) ? 3 : 2;
      for (k = 0; k < n; k++) {
        xx = cx + (k - (n - 1) / 2) * s * 0.16;
        ctx.beginPath();
        ctx.moveTo(xx, cy - s * 0.24); ctx.lineTo(xx, cy + s * 0.24);
        ctx.stroke();
      }
    } else if (sq === SQ_HORUS) {               // simplified perched falcon
      ctx.beginPath();                          // back: tail up to head
      ctx.moveTo(cx - s * 0.20, cy + s * 0.24);
      ctx.quadraticCurveTo(cx - s * 0.16, cy - s * 0.10, cx + s * 0.02, cy - s * 0.15);
      ctx.stroke();
      ctx.beginPath();                          // head
      ctx.arc(cx + s * 0.07, cy - s * 0.15, s * 0.07, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();                          // beak
      ctx.moveTo(cx + s * 0.14, cy - s * 0.15); ctx.lineTo(cx + s * 0.19, cy - s * 0.11);
      ctx.stroke();
      ctx.beginPath();                          // chest down to base
      ctx.moveTo(cx + s * 0.07, cy - s * 0.08);
      ctx.quadraticCurveTo(cx + s * 0.13, cy + s * 0.06, cx + s * 0.07, cy + s * 0.24);
      ctx.stroke();
      ctx.beginPath();                          // perch base
      ctx.moveTo(cx - s * 0.24, cy + s * 0.26); ctx.lineTo(cx + s * 0.14, cy + s * 0.26);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawChevron(cx, cy, dx, dy, s) {
    // small triangle pointing in (dx,dy) — path-direction cue
    var px = -dy, py = dx;     // perpendicular
    ctx.beginPath();
    ctx.moveTo(cx + dx * s, cy + dy * s);
    ctx.lineTo(cx - dx * s * 0.6 + px * s * 0.8, cy - dy * s * 0.6 + py * s * 0.8);
    ctx.lineTo(cx - dx * s * 0.6 - px * s * 0.8, cy - dy * s * 0.6 - py * s * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  function drawPathCues() {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = C.ink;
    var s = geo.cell * 0.10;
    var cues = [
      [0,  1, 0, 0.30, 0],      // sq1 → right
      [9,  0, 1, 0, 0.32],      // sq10 → down into middle row
      [10, -1, 0, -0.30, 0],    // sq11 → left
      [19, 0, 1, 0, 0.32],      // sq20 → down into bottom row
      [20, 1, 0, 0.30, 0],      // sq21 → right
      [29, 1, 0, 0.34, 0],      // sq30 → exit
    ];
    var i, pt;
    for (i = 0; i < cues.length; i++) {
      pt = posToXY(cues[i][0]);
      drawChevron(pt.x + cues[i][3] * geo.cell, pt.y + cues[i][4] * geo.cell,
                  cues[i][1], cues[i][2], s);
    }
    ctx.restore();
  }

  function drawBoard() {
    var g = geo, i, rc, x, y;
    // Ebony frame with a thin gold inlay line
    ctx.fillStyle = C.frame;
    roundRect(g.frameX, g.frameY, g.frameW, g.frameH, 10 * g.ratio);
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.4 * g.ratio);
    ctx.strokeStyle = C.frameLine;
    roundRect(g.frameX + g.frame * 0.35, g.frameY + g.frame * 0.35,
              g.frameW - g.frame * 0.70, g.frameH - g.frame * 0.70, 7 * g.ratio);
    ctx.stroke();

    // Ivory squares with alternating tint + inlay borders
    for (i = 0; i < TOTAL; i++) {
      rc = posToRC(i);
      x = g.boardX + rc.col * g.cell;
      y = g.boardY + rc.row * g.cell;
      ctx.fillStyle = ((rc.row + rc.col) % 2 === 0) ? C.sqA : C.sqB;
      ctx.fillRect(x, y, g.cell, g.cell);
      ctx.lineWidth = Math.max(1, 1.1 * g.ratio);
      ctx.strokeStyle = C.sqBorder;
      ctx.strokeRect(x + 0.5, y + 0.5, g.cell - 1, g.cell - 1);
      // faint square number (1–30) for orientation
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = C.ink;
      ctx.font = '600 ' + Math.max(8, Math.round(g.cell * 0.16)) + 'px Outfit, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), x + g.cell * 0.07, y + g.cell * 0.06);
      ctx.restore();
      // hieroglyphs on the special squares
      var sq = i + 1;
      if (sq === SQ_REBIRTH || sq >= SQ_BEAUTY) {
        drawGlyph(sq, x + g.cell / 2, y + g.cell / 2, g.cell);
      }
    }
    drawPathCues();
  }

  function drawStick(x, y, w, h, light) {
    roundRect(x, y, w, h, w * 0.45);
    if (light) {
      ctx.fillStyle = C.stickIvory; ctx.fill();
      ctx.lineWidth = Math.max(1, geo.ratio);
      ctx.strokeStyle = C.sqBorder; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h * 0.12); ctx.lineTo(x + w / 2, y + h * 0.88);
      ctx.lineWidth = Math.max(1, geo.ratio * 0.8);
      ctx.strokeStyle = 'rgba(138,111,77,0.35)'; ctx.stroke();
    } else {
      ctx.fillStyle = C.stickBark; ctx.fill();
      ctx.lineWidth = Math.max(1, geo.ratio);
      ctx.strokeStyle = C.stickGrain; ctx.stroke();
      var k;                                       // bark grain curves
      for (k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.moveTo(x + w * (0.30 + k * 0.40), y + h * 0.14);
        ctx.quadraticCurveTo(x + w * (0.10 + k * 0.40), y + h * 0.5,
                             x + w * (0.30 + k * 0.40), y + h * 0.86);
        ctx.lineWidth = Math.max(1, geo.ratio * 0.8);
        ctx.strokeStyle = C.stickGrain; ctx.stroke();
      }
    }
  }

  function drawMiniAnkh(x, y, s) {
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1, s * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.32, s * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.06); ctx.lineTo(x, y + s * 0.52);
    ctx.moveTo(x - s * 0.34, y + s * 0.08); ctx.lineTo(x + s * 0.34, y + s * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  function drawBorneOffRow(y, who, label) {
    var g = geo;
    var x0 = g.trayX + g.trayW * 0.56;
    // mini piece as the row label
    drawPieceAt(x0, y, g.cell * 0.16, who, 1);
    ctx.fillStyle = C.muted;
    ctx.font = '600 ' + Math.max(9, Math.round(g.cell * 0.20)) + 'px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + g.cell * 0.30, y);
    var slotR = g.cell * 0.115;
    var sx = x0 + g.cell * 1.20;
    var n = state ? state.borneOff[who] : 0;
    var i, cx;
    for (i = 0; i < PIECES; i++) {
      cx = sx + i * g.cell * 0.33;
      ctx.beginPath();
      ctx.arc(cx, y, slotR, 0, Math.PI * 2);
      if (i < n) {
        ctx.fillStyle = C.gold; ctx.fill();
        drawMiniAnkh(cx, y, slotR * 0.85);
      } else {
        ctx.lineWidth = Math.max(1, geo.ratio);
        ctx.strokeStyle = 'rgba(200,155,60,0.35)';
        ctx.stroke();
      }
    }
  }

  function drawTray(now) {
    var g = geo;
    ctx.fillStyle = C.tray;
    roundRect(g.trayX, g.trayY, g.trayW, g.trayH, 10 * g.ratio);
    ctx.fill();
    ctx.lineWidth = Math.max(1, g.ratio);
    ctx.strokeStyle = C.frameLine;
    ctx.stroke();

    // Faces to show: tumbling sequence → settled throw → resting
    var faces = null, tumbling = false;
    if (anim && anim.type === 'sticks') {
      var el = now - anim.start;
      if (el < anim.dur) {
        tumbling = true;
        faces = anim.seq[Math.min(anim.seq.length - 1, Math.floor(el / 70))];
      } else {
        faces = anim.faces;
      }
    } else if (state && state.thrw) {
      faces = state.thrw.faces;
    }

    // 4 throwing sticks (left)
    var sw = g.cell * 0.26, sgap = g.cell * 0.18;
    var sh = g.trayH * 0.72;
    var sy = g.trayY + (g.trayH - sh) / 2;
    var sx = g.trayX + g.cell * 0.45;
    var i;
    ctx.save();
    if (!faces) ctx.globalAlpha = 0.45;
    for (i = 0; i < 4; i++) {
      drawStick(sx + i * (sw + sgap), sy, sw, sh, faces ? !!faces[i] : true);
    }
    ctx.restore();

    // Throw value (centre): big gold number + pips
    var vx = g.trayX + g.trayW * 0.40;
    var vy = g.trayY + g.trayH * 0.46;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (tumbling) {
      ctx.fillStyle = C.muted;
      ctx.font = '700 ' + Math.round(g.trayH * 0.42) + 'px "Playfair Display", serif';
      ctx.fillText('?', vx, vy);
    } else if (faces && state && state.thrw) {
      var v = state.thrw.value;
      ctx.fillStyle = C.gold;
      ctx.font = '700 ' + Math.round(g.trayH * 0.52) + 'px "Playfair Display", serif';
      ctx.fillText(String(v), vx, vy - g.trayH * 0.04);
      var pr = g.cell * 0.05;
      var px0 = vx - ((v - 1) * pr * 2.6) / 2;
      for (i = 0; i < v; i++) {
        ctx.beginPath();
        ctx.arc(px0 + i * pr * 2.6, g.trayY + g.trayH * 0.82, pr, 0, Math.PI * 2);
        ctx.fillStyle = C.gold;
        ctx.fill();
      }
    } else {
      ctx.fillStyle = C.muted;
      ctx.font = '600 ' + Math.round(g.trayH * 0.30) + 'px "Playfair Display", serif';
      ctx.fillText('–', vx, vy);
    }

    // Borne-off counters (right): You row + opponent row, 5 slots each
    var me = myPlayer, opp = other(myPlayer);
    drawBorneOffRow(g.trayY + g.trayH * 0.30, me, 'You');
    drawBorneOffRow(g.trayY + g.trayH * 0.70, opp,
      vsRoom ? 'Opp' : (vsAI ? 'AI' : 'P2'));
  }

  function drawPieces() {
    if (!state) return;
    var i, pt;
    for (i = 0; i < TOTAL; i++) {
      var who = state.board[i];
      if (!who) continue;
      if (anim && anim.type === 'move' && anim.hide.indexOf(i) >= 0) continue;
      pt = posToXY(i);
      drawPieceAt(pt.x, pt.y, geo.cell * 0.36, who, 1);
    }
  }

  // Pulsing gold (or red, backward-only) rings on movable pieces + dest dots.
  function drawHighlights(now) {
    if (!state || state.winner || anim) return;
    var lm = currentMoves();
    if (!lm || !lm.list.length) return;
    var pulse = 0.55 + 0.35 * Math.sin(now / 240);
    var color = lm.backward ? C.backPulse : C.pulse;
    var i, pt, mv;
    ctx.save();
    for (i = 0; i < lm.list.length; i++) {
      mv = lm.list[i];
      pt = posToXY(mv.from - 1);
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, geo.cell * 0.46, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, geo.cell * 0.07);
      ctx.strokeStyle = color;
      ctx.stroke();
      // destination cue
      ctx.globalAlpha = 0.5;
      if (mv.to === 'OFF') {
        pt = posToXY(SQ_HORUS - 1);
        ctx.fillStyle = C.destDot;
        drawChevron(pt.x + geo.cell * 0.40, pt.y, 1, 0, geo.cell * 0.12);
      } else {
        pt = posToXY(mv.to - 1);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, geo.cell * 0.10, 0, Math.PI * 2);
        ctx.fillStyle = mv.water ? C.teal : C.destDot;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function lerp(a, b, f) { return a + (b - a) * f; }

  // Animated ghost pieces (the committed board hides the squares involved).
  function drawAnim(now) {
    if (!anim || anim.type !== 'move') return;
    var t = now - anim.start;
    var segs = Math.max(1, anim.seq.length - 1);
    var f = Math.min(1, t / anim.slideDur);
    var r = geo.cell * 0.36;
    var pt;

    // Swapped enemy slides straight from dest back to origin during the slide.
    if (anim.swap) {
      var a = posToXY(anim.swap.fromPos), b = posToXY(anim.swap.toPos);
      drawPieceAt(lerp(a.x, b.x, f), lerp(a.y, b.y, f), r, anim.swap.player, 1);
    }

    if (t < anim.slideDur) {
      // slide along consecutive path squares
      var idxf = f * segs;
      var i = Math.min(segs - 1, Math.floor(idxf));
      var frac = (anim.seq.length === 1) ? 1 : idxf - i;
      var p0 = posToXY(anim.seq[i]);
      var p1 = posToXY(anim.seq[Math.min(anim.seq.length - 1, i + 1)]);
      drawPieceAt(lerp(p0.x, p1.x, frac), lerp(p0.y, p1.y, frac), r, anim.player, 1);
      return;
    }

    var t2 = t - anim.slideDur;
    if (anim.water) {
      pt = posToXY(SQ_WATER - 1);
      if (t2 < 300) {
        // teal ripple flash + drowning fade-out on 27
        var rf = t2 / 300;
        ctx.save();
        ctx.globalAlpha = (1 - rf) * 0.7;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, geo.cell * (0.15 + rf * 0.40), 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, geo.cell * 0.06);
        ctx.strokeStyle = C.teal;
        ctx.stroke();
        ctx.restore();
        drawPieceAt(pt.x, pt.y, r, anim.player, 1 - rf);
      } else {
        // fade in at the rebirth square
        var f2 = Math.min(1, (t2 - 300) / 250);
        pt = posToXY(anim.water.rebirthPos);
        drawPieceAt(pt.x, pt.y, r, anim.player, f2);
      }
      return;
    }
    if (anim.off) {
      // bear-off: slide off past square 30 + fade
      var fo = Math.min(1, t2 / 260);
      pt = posToXY(SQ_HORUS - 1);
      drawPieceAt(pt.x + fo * geo.cell * 1.3, pt.y, r, anim.player, 1 - fo);
    }
  }

  function render() {
    if (!cnv || !ctx) return;
    computeLayout();
    var now = Date.now();
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    drawBoard();
    drawTray(now);
    drawPieces();
    drawHighlights(now);
    drawAnim(now);
    syncOverlay();
  }

  // Keep the game-over overlay's box matched to the canvas, which may be
  // fit-shrunk and centred (margin:auto) inside a wider wrap.
  function syncOverlay() {
    if (!overlayEl || !cnv) return;
    overlayEl.style.left   = cnv.offsetLeft + 'px';
    overlayEl.style.top    = cnv.offsetTop + 'px';
    overlayEl.style.width  = cnv.offsetWidth + 'px';
    overlayEl.style.height = cnv.offsetHeight + 'px';
    overlayEl.style.right  = 'auto';
    overlayEl.style.bottom = 'auto';
  }

  // ── 9. HUD / controls / end screen ──────────────────────────────────────────
  function opponentWord() {
    return vsRoom ? 'Opponent' : (vsAI ? 'Player 2 (AI)' : 'Player 2');
  }
  function playerLabel(p) { return p === myPlayer ? 'You' : opponentWord(); }

  // Can the local user act on the current turn?
  function canAct() {
    if (!state || state.winner) return false;
    if (vsRoom) {
      if (window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return false;
      return state.turn === myPlayer;
    }
    if (vsAI && state.turn === AI_PLAYER) return false;
    return true;   // hotseat: both players are local
  }

  function updateScore() {
    var el = document.getElementById('se-score');
    if (!el || !state) return;
    el.innerHTML =
      '<span class="se-score__you">You: ' + state.borneOff[myPlayer] + ' home</span>' +
      '<span class="se-score__ai">' + opponentWord() + ': ' +
        state.borneOff[other(myPlayer)] + ' home</span>';
  }
  function setStatus(msg) {
    var el = document.getElementById('se-status');
    if (el) el.textContent = msg;
  }
  function refreshStatus() {
    if (!state || state.winner) return;
    var p = state.turn, lbl = playerLabel(p);
    if (anim && anim.type === 'sticks') {
      setStatus(lbl === 'You' ? 'You throw the sticks…' : lbl + ' throws the sticks…');
      return;
    }
    if (!state.thrw) {
      if (canAct()) {
        setStatus(state.extra
          ? (lbl === 'You' ? 'Extra throw! Throw the sticks again.' : lbl + ' — extra throw! Throw again.')
          : (lbl === 'You' ? 'Throw the sticks!' : lbl + ' — throw the sticks!'));
      } else {
        setStatus(vsRoom ? 'Waiting for ' + lbl + ' to throw…' : lbl + ' is thinking…');
      }
      return;
    }
    var v = state.thrw.value;
    if (state.thrw.awaitingMove) {
      if (canAct()) {
        var lm = currentMoves();
        if (lm && lm.backward) {
          setStatus((lbl === 'You' ? 'You' : lbl) + ' threw ' + v +
            ' — no forward moves, you must move backward. Tap a red-ringed piece.');
        } else {
          setStatus((lbl === 'You' ? 'You' : lbl) + ' threw ' + v + ' — choose a glowing piece.');
        }
      } else {
        setStatus(lbl + ' threw ' + v + (vsAI ? ' — thinking…' : ' — choosing a move…'));
      }
    } else {
      setStatus(lbl + ' threw ' + v + ' — no legal move. Throw forfeited, turn passes.');
    }
  }
  function updateControls() {
    var btn = document.getElementById('se-throw-btn');
    if (!btn) return;
    var can = !!(state && !state.winner && !anim && !state.thrw && canAct());
    btn.disabled = !can;
    btn.textContent = (state && !state.winner && state.extra && canAct())
      ? 'Extra Throw!' : 'Throw Sticks';
  }
  function updateHud() { updateScore(); refreshStatus(); }
  function updateAll() { render(); updateHud(); updateControls(); }

  function showOverlay(winner) {
    var title;
    if (vsRoom) title = (winner === myPlayer) ? 'You Win!' : 'You Lost';
    else if (winner === P1) title = vsAI ? 'You Win!' : 'Player 1 Wins!';
    else title = vsAI ? 'You Lost' : 'Player 2 Wins!';
    if (overlayTitleEl) overlayTitleEl.textContent = title;
    if (overlaySubEl)   overlaySubEl.textContent = 'All five pieces have passed into the afterlife.';
    if (overlayEl)      overlayEl.classList.add('active');
    setStatus(title);
  }
  function hideOverlay() { if (overlayEl) overlayEl.classList.remove('active'); }

  // End of game — auth & achievements from the LOCAL player's perspective.
  function endGame(winner) {
    state.winner = winner;
    clearAI();
    if (ended) { showOverlay(winner); return; }
    ended = true;
    var outcome = (winner === myPlayer) ? 'win' : 'loss';
    // Spectators run endGame too (via receiveRoomState) but must never record
    // achievements/results for a game they only watched.
    var spectating = !!(vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator());
    if (window.Achievements && !spectating) {
      // se_no_water_win: won without any of the local player's pieces drowning.
      if (outcome === 'win' && !localWater) Achievements.checkAction('se_no_water_win');
    }
    if (vsRoom) {
      // Room stats/coins flow through RoomBridge.reportWin (fired in syncRoom);
      // only evaluate online achievements locally here.
      if (window.Achievements && !spectating) {
        Achievements.evaluate({
          gameId: 'senet', result: outcome, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()),
        });
      }
    } else if (window.Auth && Auth.recordResult) {
      Auth.recordResult('senet', outcome);   // guest-safe; updates local stats too
    }
    showOverlay(winner);
    updateControls();
  }

  // ── 10. Turn flow — throw → move → extra / forfeit / pass ───────────────────
  function clearAI() {
    if (aiTimer)      { clearTimeout(aiTimer);      aiTimer = null; }
    if (forfeitTimer) { clearTimeout(forfeitTimer); forfeitTimer = null; }
  }

  // Throw the 4 two-sided sticks. Value = light faces up (1–4); all dark = 5.
  function doThrow() {
    if (!state || state.winner || anim || state.thrw) return;
    var p = state.turn;
    var faces = [], lights = 0, i;
    for (i = 0; i < 4; i++) {
      var f = Math.random() < 0.5;
      faces.push(f);
      if (f) lights++;
    }
    var value = (lights === 0) ? 5 : lights;
    state.thrw = { value: value, faces: faces, awaitingMove: false };
    var lm = legalMoves(p, value);
    state.thrw.awaitingMove = lm.list.length > 0;
    state.last_actor = vsRoom ? ('room:' + mySeat) : ('local:' + p);
    if (vsRoom) syncRoom();                 // remote sees the thrown sticks
    if (window.SFX && SFX.roll) SFX.roll();
    startStickAnim(faces, onThrowSettled);
    updateControls();
    refreshStatus();
  }

  function onThrowSettled() {
    if (!state || state.winner || !state.thrw) { updateControls(); return; }
    if (state.thrw.awaitingMove) {
      updateAll();
      maybeScheduleAI();
    } else {
      // No legal move (forward or backward): throw forfeited, extra entitlement
      // lost, turn passes after a short pause so the player reads the sticks.
      updateAll();
      var myGen = gen;
      forfeitTimer = setTimeout(function () {
        forfeitTimer = null;
        if (myGen !== gen || !state || state.winner || !state.thrw) return;
        passTurn();
      }, 1300);
    }
  }

  function passTurn() {
    var p = state.turn;
    if (p === myPlayer) chain = 0;
    state.turn = other(p);
    state.thrw = null;
    state.extra = false;
    state.last_actor = vsRoom ? ('room:' + mySeat) : ('local:' + p);
    if (vsRoom) syncRoom();
    updateAll();
    maybeScheduleAI();
  }

  // Execute a chosen legal move. State is committed atomically here (including
  // water relocation, bear-off and turn/extra resolution); the animation that
  // follows is purely visual.
  function executeMove(mv) {
    if (!state || state.winner || !state.thrw || anim) return;
    var p = state.turn, enemy = other(p);
    var v = state.thrw.value;
    var info = { fromSq: mv.from, toSq: mv.to, player: p, swap: null, water: null, off: false };

    state.board[mv.from - 1] = null;
    if (mv.to === 'OFF') {
      state.borneOff[p] += 1;
      info.off = true;
    } else if (mv.water) {
      // House of Water: the piece drowns and resurfaces at the House of
      // Rebirth (15) or the first empty square below it.
      var rb = findRebirth(state.board);
      state.board[rb - 1] = p;
      info.water = { rebirthSq: rb };
      if (p === myPlayer) localWater = true;
    } else {
      if (mv.swap) {
        state.board[mv.from - 1] = enemy;     // enemy goes to our origin square
        info.swap = { fromSq: mv.to, toSq: mv.from };
      }
      state.board[mv.to - 1] = p;
    }

    // Turn resolution: 1/4/5 → same player throws again; 2/3 → turn passes.
    var extraThrow = (v === 1 || v === 4 || v === 5);
    state.thrw = null;
    if (checkWin(p)) {
      state.winner = p;
      state.extra = false;
    } else if (extraThrow) {
      state.extra = true;
      if (p === myPlayer) {
        chain += 1;
        // se_throw_chain: 3+ consecutive extra throws earned within one turn.
        if (chain === 3 && window.Achievements) Achievements.checkAction('se_throw_chain');
      }
    } else {
      state.turn = enemy;
      state.extra = false;
      if (p === myPlayer) chain = 0;
    }
    state.last_actor = vsRoom ? ('room:' + mySeat) : ('local:' + p);
    if (vsRoom) syncRoom();                 // publish the resolved move (and win)

    startMoveAnim(info, function () { afterMoveSettled(p, info); });
    updateControls();
    setStatus(playerLabel(p) + (info.off ? ' bears a piece off…' : ' moves…'));
  }

  function afterMoveSettled(p, info) {
    if (!state) return;
    if (state.winner) { updateAll(); endGame(state.winner); return; }
    render();
    updateScore();
    updateControls();
    if (info && info.water) {
      setStatus(playerLabel(p) + ' fell into the House of Water — reborn at square ' +
        info.water.rebirthSq + '! The 1 still earns an extra throw.');
    } else {
      refreshStatus();
    }
    maybeScheduleAI();
  }

  // ── 11. AI opponent (P2) ────────────────────────────────────────────────────
  // Every AI code path ends in another scheduled step or a turn pass — the AI
  // can never hang the turn. Stale timers are killed by the gen counter.
  function maybeScheduleAI() {
    if (!vsAI || vsRoom || !state || state.winner || state.turn !== AI_PLAYER) {
      updateControls();
      return;
    }
    if (anim) return;                       // anim done-callbacks re-invoke us
    var myGen = gen;
    if (!state.thrw) {
      if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
      setStatus('Player 2 (AI) is thinking…');
      aiTimer = setTimeout(function () {
        aiTimer = null;
        if (myGen !== gen || !state || state.winner || state.turn !== AI_PLAYER || state.thrw) return;
        doThrow();
      }, 700);
    } else if (state.thrw.awaitingMove) {
      if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
      aiTimer = setTimeout(function () {
        aiTimer = null;
        if (myGen !== gen || !state || state.winner || state.turn !== AI_PLAYER) return;
        if (!state.thrw || !state.thrw.awaitingMove) return;
        aiPickMove();
      }, 500);
    }
    // thrw && !awaitingMove → the forfeit timer (onThrowSettled) handles the pass.
  }

  // Score one legal move for the AI (see brief: bear-off, House of Beauty,
  // swaps, lone-target danger, water avoidance, pairing, rearmost tiebreak).
  function scoreMove(p, mv, onlyMove) {
    var enemy = other(p);
    var s = 0;
    if (mv.to === 'OFF') {
      s += 100;
    } else {
      var dest = mv.to;
      if (dest === SQ_BEAUTY) s += 40;                 // land exactly on 26
      if (mv.water && !onlyMove) s -= 60;              // avoid the water unless forced
      if (mv.swap) s += 30 + dest;                     // sending leaders back is best
      // Simulate the landing position
      var sim = state.board.slice();
      sim[mv.from - 1] = null;
      var L;
      if (mv.water) {
        L = findRebirth(sim);
        sim[L - 1] = p;
      } else {
        if (mv.swap) sim[mv.from - 1] = enemy;
        sim[mv.to - 1] = p;
        L = mv.to;
      }
      var paired = (boardAt(sim, L - 1) === p) || (boardAt(sim, L + 1) === p);
      if (paired) s += 10;                             // forming a protected pair
      if (!paired && L <= 25) {
        // lone attackable target: any enemy 1–5 behind could swap onto us
        var k;
        for (k = 1; k <= 5; k++) {
          if (L - k >= 1 && boardAt(sim, L - k) === enemy) { s -= 15; break; }
        }
      }
    }
    // Tiebreak: prefer advancing the rearmost piece.
    s += (31 - mv.from) * 0.1;
    return s;
  }

  function aiPickMove() {
    var lm = legalMoves(AI_PLAYER, state.thrw.value);
    if (!lm.list.length) { passTurn(); return; }       // safety: should not happen
    var onlyMove = lm.list.length === 1;
    var best = lm.list[0], bestS = -Infinity, i, s;
    for (i = 0; i < lm.list.length; i++) {
      s = scoreMove(AI_PLAYER, lm.list[i], onlyMove);
      if (s > bestS) { bestS = s; best = lm.list[i]; }
    }
    executeMove(best);
  }

  // ── 12. Input ───────────────────────────────────────────────────────────────
  function getCanvasXY(e) {
    var rect = cnv.getBoundingClientRect();
    var sx = cnv.width / rect.width;
    var sy = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  function onTap(e) {
    if (!state || state.winner || anim) return;
    if (!canAct()) return;
    var lm = currentMoves();
    if (!lm || !lm.list.length) return;
    var xy = getCanvasXY(e);
    var pos = xyToPos(xy.x, xy.y);
    if (pos === null) return;
    var sq = pos + 1, i;
    for (i = 0; i < lm.list.length; i++) {
      if (lm.list[i].from === sq) { executeMove(lm.list[i]); return; }
    }
    if (state.board[pos] === state.turn) {
      setStatus('That piece has no legal move with a ' + state.thrw.value + ' — pick a glowing one.');
    }
  }

  function onThrowClick() {
    if (!state || state.winner || anim || state.thrw) return;
    if (!canAct()) return;
    doThrow();
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  function newGame() {
    gen++;                       // invalidate any pending AI/forfeit timers
    clearAI();
    anim = null;
    hideOverlay();
    state = freshState();
    ended = false;
    winReported = false;
    localWater = false;
    chain = 0;
    updateAll();
    if (vsRoom) {
      if (window.RoomBridge && RoomBridge.resetWin) RoomBridge.resetWin();
      syncRoom();
    }
    maybeScheduleAI();           // no-op while P1 starts, but safe
  }

  // ── 13. Multiplayer (RoomBridge) ────────────────────────────────────────────
  // Full-state blob published after every resolved event (throw, move, water
  // relocation, pass, win, rematch). last_actor carries our seat for echo
  // suppression. The incoming blob is the source of truth.
  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      board:      state.board.slice(),
      borneOff:   { P1: state.borneOff.P1, P2: state.borneOff.P2 },
      turn:       state.turn,
      'throw':    state.thrw ? {
                    value: state.thrw.value,
                    faces: state.thrw.faces.slice(),
                    awaitingMove: state.thrw.awaitingMove,
                  } : null,
      extra:      state.extra,
      winner:     state.winner,
      last_actor: 'room:' + mySeat,
    });
    if ((state.winner === P1 || state.winner === P2) && !winReported) {
      winReported = true;
      RoomBridge.reportWin(state.winner === P1 ? 0 : 1);
    }
  }

  function receiveRoomState(data) {
    if (!data) return;
    if (data.last_actor === 'room:' + mySeat) return;   // ignore our own echo
    gen++;                                              // kill stale local timers
    clearAI();
    anim = null;                                        // cancel local animations
    if (data.board) state.board = data.board.slice();
    if (data.borneOff) state.borneOff = { P1: data.borneOff.P1, P2: data.borneOff.P2 };
    if (data.turn !== undefined) state.turn = data.turn;
    var th = data['throw'];
    state.thrw = th ? {
      value: th.value,
      faces: (th.faces || []).slice(),
      awaitingMove: !!th.awaitingMove,
    } : null;
    state.extra = !!data.extra;
    state.winner = (data.winner === undefined) ? null : data.winner;
    updateAll();
    if (state.winner === P1 || state.winner === P2) {
      endGame(state.winner);                            // once-guarded internally
    } else {
      ended = false;
      hideOverlay();
    }
    startLoop();                                        // pulse if it's now our move
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true;
    vsAI = false;
    mySeat = RoomBridge.getSeat();
    myPlayer = (mySeat === 0) ? P1 : P2;                // seat 0 = P1, throws first
    clearAI();

    // Hide solo-only controls; online rematch happens via the Play Again button.
    var aiLabel = document.querySelector('.se-ai-label'); if (aiLabel) aiLabel.style.display = 'none';
    var newBtn  = document.getElementById('se-new-btn');  if (newBtn)  newBtn.style.display  = 'none';

    RoomBridge.onState(receiveRoomState);   // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();           // host seeds the initial board
    updateHud();
    updateControls();
  }

  // ── 14. Init ────────────────────────────────────────────────────────────────
  function init() {
    cnv = document.getElementById('se-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    readColors();
    if (window.CGTheme) {
      var prev = window.CGTheme.onchange;
      window.CGTheme.onchange = function (t) {
        if (typeof prev === 'function') { try { prev(t); } catch (e) {} }
        readColors();
        render();
      };
    }
    if (window.Achievements && Achievements.init) Achievements.init();

    overlayEl      = document.getElementById('se-overlay');
    overlayTitleEl = document.getElementById('se-overlay-title');
    overlaySubEl   = document.getElementById('se-overlay-sub');

    var elThrow   = document.getElementById('se-throw-btn');
    var elNew     = document.getElementById('se-new-btn');
    var elRematch = document.getElementById('se-rematch-btn');
    var elAi      = document.getElementById('se-ai-toggle');
    if (elThrow)   elThrow.addEventListener('click', onThrowClick);
    if (elNew)     elNew.addEventListener('click', newGame);
    if (elRematch) elRematch.addEventListener('click', newGame);
    if (elAi) {
      vsAI = !!elAi.checked;
      elAi.addEventListener('change', function () {
        if (vsRoom) return;                 // forced off in rooms
        vsAI = elAi.checked;
        newGame();
      });
    }

    cnv.addEventListener('click', onTap);
    cnv.addEventListener('touchend', function (e) { e.preventDefault(); onTap(e); }, { passive: false });

    // The mobile-fit engine sets the canvas display size asynchronously; keep
    // the overlay box matched to it.
    if (window.ResizeObserver) {
      try { new ResizeObserver(syncOverlay).observe(cnv); } catch (e) {}
    }

    window.addEventListener('resize', resizeCanvas);
    window.cgMobileResize = resizeCanvas;

    gen++;
    clearAI();
    state = freshState();
    resizeCanvas();
    updateHud();
    updateControls();
    initRoomMode();              // switches to multiplayer if inside a room iframe
    maybeScheduleAI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial ────────────────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('senet', [
      {
        target: '#se-canvas',
        title: 'The Board of Thirty Houses',
        body: 'Senet is a 5,000-year-old race across 30 squares. The path snakes like a river: squares 1–10 run left to right along the top, 11–20 run right to left through the middle, and 21–30 run left to right along the bottom to the exit.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#se-canvas',
        title: 'Cones vs Spools',
        body: 'You play the five light cones; your opponent plays the five dark spools. The pieces start interleaved on squares 1–10, and you (light, lead piece on 10) throw first.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#se-canvas',
        title: 'The Throwing Sticks',
        body: 'Four two-sided sticks replace dice: count the light faces showing for your move (1–4); all dark faces counts as 5. Throws of 1, 4, and 5 earn you ANOTHER throw after you move — chains of extra throws win races.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#se-canvas',
        title: 'Moving, Swapping & Walls',
        body: 'Move one piece forward by the thrown value — pieces with a legal move glow gold. You can never land on your own piece. Land on a LONE enemy and you swap places with it — but an enemy with a same-colour neighbour is protected, and three enemies in a row form a wall you cannot pass. If no forward move exists you must move backward; if no move exists at all, the throw is forfeited.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#se-canvas',
        title: 'Beauty and Water',
        body: 'Every piece must land EXACTLY on square 26, the House of Beauty (nefer glyph), before the final stretch. Beware square 27, the House of Water — a piece that falls in is swept back to square 15, the House of Rebirth (ankh glyph).',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#se-canvas',
        title: 'Bearing Off',
        body: 'The last squares demand exact throws: square 28 needs a 3, square 29 needs a 2, and square 30 escapes on any throw. From square 26 itself, a 5 bears straight off. Pieces waiting on 28–30 are parked and safe.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#se-throw-btn',
        title: 'Throw the Sticks!',
        body: 'Be the first to guide all five of your pieces off the board into the afterlife to win. Press Throw Sticks to begin your journey.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('senet');
  }

  // ── Fullscreen / mobile-fit resize hooks ────────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { setTimeout(render, 50); };
    FSMode.onExit  = function () { setTimeout(render, 50); };
  }

  // Resize the REAL canvas buffer (dpr-aware) to fit the full board+tray
  // aspect into availW×availH — a CSS-only stub breaks fullscreen.
  window.GameResize = function (availW, availH) {
    if (!cnv) return;
    var ratio = dpr();
    var cellByW = (availW - PAD * 2) / W_CELLS;
    var cellByH = (availH - PAD * 2) / H_CELLS;
    var cell = Math.max(16, Math.min(cellByW, cellByH));
    var wCss = Math.round(cell * W_CELLS + PAD * 2);
    var hCss = Math.round(cell * H_CELLS + PAD * 2);
    cnv.width  = Math.round(wCss * ratio);
    cnv.height = Math.round(hCss * ratio);
    // Width only — height follows the buffer aspect (see sizeToWidth).
    cnv.style.width  = wCss + 'px';
    cnv.style.height = '';
    render();
  };

}());
