/**
 * surakarta.js — Surakarta, an abstract loop-capture strategy game from Central
 * Java, Indonesia (named after the historic court city of Surakarta / Solo).
 * Played on a 6×6 grid of 36 intersections with the distinctive corner LOOP
 * arcs: a capturing piece slides along the grid lines, curls around at least one
 * corner loop, and strikes the first enemy it reaches with a clear path. Plain
 * (non-capturing) moves are a single step to any of the 8 neighbours. Win by
 * capturing all 12 enemy pieces.
 *
 * Canvas-rendered, vs-AI single player + local hotseat. Prefix: sk-  Key: surakarta
 *
 * Structurally a sibling of js/games/morabaraba.js / js/games/konane.js — mirrors
 * their module shape: canvas setup, state.padX/padY/cell, GameResize, minimax
 * alpha-beta AI, hotseat toggle (canActNow), self-rescheduling rAF+setTimeout
 * render loop, and pure-logic Node test exports.
 *
 * NOTE: online room multiplayer + server coin rewards are intentionally OUT OF
 * SCOPE for this build (deferred) — the game runs fully standalone.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var EMPTY = 0, LIGHT = 1, DARK = 2;    // LIGHT = player A (moves first); rows 1-2
  var SIZE = 6;                          // 6×6 = 36 intersections
  var PIECES_PER_SIDE = 12;
  var PAD = 44;                          // default outer padding (px) — leaves room for arcs
  var NO_CAP_DRAW_PLIES = 50;            // 50 plies with no capture → draw-by-more-pieces
  var REPEAT_DRAW = 3;                   // a position repeated 3× → draw-by-more-pieces

  // 8 directions for plain moves (orthogonal + diagonal). [dr,dc].
  var DIRS8 = [
    { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
    { dr: 0,  dc: -1 },                    { dr: 0,  dc: 1 },
    { dr: 1,  dc: -1 }, { dr: 1,  dc: 0 }, { dr: 1,  dc: 1 }
  ];

  // ── Index helpers (pure) ────────────────────────────────────────────────────
  function other(side) { return side === LIGHT ? DARK : LIGHT; }
  function inBounds(r, c) { return r >= 1 && r <= SIZE && c >= 1 && c <= SIZE; }
  // Board index for (r,c), r,c in 1..6. Row 1 = bottom (player A). Stored 0-based.
  function rc2i(r, c) { return (r - 1) * SIZE + (c - 1); }
  function i2r(i) { return Math.floor(i / SIZE) + 1; }
  function i2c(i) { return (i % SIZE) + 1; }

  // ── Loop rings (the unique mechanic — encoded verbatim, see §4) ──────────────
  // A ring is a CLOSED cyclic sequence of grid positions formed by two row-lines
  // and two col-lines joined by four corner arcs. For an "inset" pair (lo,hi):
  //   • row `lo` spanning c=1..6,  • col `hi` spanning r=1..6,
  //   • row `hi` spanning c=6..1,  • col `lo` spanning r=6..1,
  // walked in that order, closing the loop. The four transitions between these
  // four edge-runs (and the wrap) are the ARC crossings. The 4 corner-intersection
  // points (where a ring's row meets its col, e.g. (lo,lo),(lo,hi),(hi,lo),(hi,hi))
  // legitimately appear TWICE in the cycle — once on a row-run, once on a col-run.
  //
  //   INNER ring → inset pair (2,5)  (arcs tangent to rows/cols 2 & 5)
  //   OUTER ring → inset pair (3,4)  (arcs tangent to rows/cols 3 & 4)
  //   Rows/cols 1 & 6 (the outer edges) carry NO loop.
  function buildRing(lo, hi) {
    var seq = [];      // [{r,c}, ...] cyclic
    var arcAfter = []; // arcAfter[k] === true ⇒ stepping seq[k] → seq[k+1 mod n] crosses an arc
    var k = 0;
    function push(r, c, isArcBefore) {
      seq.push({ r: r, c: c });
      if (k > 0) arcAfter[k - 1] = isArcBefore;
      k++;
    }
    // row lo, left→right (no arc between consecutive grid steps)
    for (var c = 1; c <= SIZE; c++) push(lo, c, false);
    // arc from (lo,6) → (1,hi); then col hi bottom→top
    for (var r = 1; r <= SIZE; r++) push(r, hi, r === 1 ? true : false);
    // arc from (6,hi) → (hi,6); then row hi right→left
    for (var c2 = SIZE; c2 >= 1; c2--) push(hi, c2, c2 === SIZE ? true : false);
    // arc from (hi,1) → (6,lo); then col lo top→bottom
    for (var r2 = SIZE; r2 >= 1; r2--) push(r2, lo, r2 === SIZE ? true : false);
    // wrap arc: last position (1,lo) → first (lo,1)
    arcAfter[seq.length - 1] = true;
    return { seq: seq, arcAfter: arcAfter };
  }

  var INNER = buildRing(2, 5);
  var OUTER = buildRing(3, 4);
  var RINGS = [INNER, OUTER];

  // For each board index, the list of {ring, pos} occurrences of that point in any
  // ring cycle. A point can occur in up to two rings, and the 4 corner points of a
  // ring occur twice within that ring (row-run + col-run occurrence).
  var RING_OCCURRENCES = (function () {
    var occ = [];
    for (var i = 0; i < SIZE * SIZE; i++) occ.push([]);
    for (var ri = 0; ri < RINGS.length; ri++) {
      var seq = RINGS[ri].seq;
      for (var p = 0; p < seq.length; p++) {
        var idx = rc2i(seq[p].r, seq[p].c);
        occ[idx].push({ ring: ri, pos: p });
      }
    }
    return occ;
  }());

  // ── Board helpers ───────────────────────────────────────────────────────────
  function countOnBoard(board, side) {
    var n = 0;
    for (var i = 0; i < board.length; i++) if (board[i] === side) n++;
    return n;
  }

  function startBoard() {
    var board = [];
    for (var i = 0; i < SIZE * SIZE; i++) board.push(EMPTY);
    // Player A (LIGHT) fills rows 1 & 2; Player B (DARK) fills rows 5 & 6.
    for (var c = 1; c <= SIZE; c++) {
      board[rc2i(1, c)] = LIGHT;
      board[rc2i(2, c)] = LIGHT;
      board[rc2i(5, c)] = DARK;
      board[rc2i(6, c)] = DARK;
    }
    return board;
  }

  // ── Move generation ─────────────────────────────────────────────────────────
  // A move: { from, to, capture:bool, captured:(idx|null) }.

  // Plain moves: one step to an ADJACENT EMPTY intersection in any of 8 directions.
  function plainMovesFrom(board, from, side) {
    var out = [];
    if (board[from] !== side) return out;
    var r = i2r(from), c = i2c(from);
    for (var d = 0; d < DIRS8.length; d++) {
      var nr = r + DIRS8[d].dr, nc = c + DIRS8[d].dc;
      if (!inBounds(nr, nc)) continue;
      var ni = rc2i(nr, nc);
      if (board[ni] === EMPTY) out.push({ from: from, to: ni, capture: false, captured: null });
    }
    return out;
  }

  // Capture moves from a single origin. Walk every ring occurrence of `from` in
  // BOTH directions; the FIRST occupied point reached is the candidate. It is a
  // LEGAL capture iff (a) it holds an ENEMY, (b) at least one ARC was crossed on
  // the way, and (c) every point passed before it was EMPTY. Sliding is along the
  // grid/ring ONLY (never a free diagonal). We bound the walk to one full lap
  // (n steps) so it always terminates.
  function captureMovesFrom(board, from, side) {
    var out = [];
    var foe = other(side);
    var seen = {}; // dedupe by captured target idx (multiple ring entry points may reach the same enemy)
    var occs = RING_OCCURRENCES[from];

    for (var o = 0; o < occs.length; o++) {
      var ringI = occs[o].ring, startPos = occs[o].pos;
      var ring = RINGS[ringI];
      var seq = ring.seq, arcAfter = ring.arcAfter, n = seq.length;

      for (var dir = -1; dir <= 1; dir += 2) {
        var arcs = 0;
        var pos = startPos;
        var blocked = false;
        // Walk up to a full lap. Each step moves to the next ring position; the
        // first occupied position encountered terminates this direction.
        for (var step = 0; step < n; step++) {
          // moving from `pos` to next position in `dir`
          var nextPos;
          if (dir === 1) {
            if (arcAfter[pos]) arcs++;
            nextPos = (pos + 1) % n;
          } else {
            var prev = (pos - 1 + n) % n;
            if (arcAfter[prev]) arcs++;
            nextPos = prev;
          }
          pos = nextPos;
          var idx = rc2i(seq[pos].r, seq[pos].c);
          if (idx === from) {
            // Returned to our own origin without hitting anything — a full loop is
            // clear; keep walking (the lap bound stops infinite loops). The origin
            // is "occupied by us" but it is our launching square; treat as clear.
            continue;
          }
          if (board[idx] === EMPTY) continue; // clear point, keep sliding
          // First occupied point reached.
          if (board[idx] === foe && arcs >= 1) {
            if (!seen[idx]) {
              seen[idx] = true;
              out.push({ from: from, to: idx, capture: true, captured: idx });
            }
          }
          blocked = true;
          break; // a piece (friend OR enemy) stops this direction — no jumping
        }
        if (!blocked) { /* full clear lap — nothing to capture this way */ }
      }
    }
    return out;
  }

  // All legal moves (plain + capture) for the side to move.
  function legalMoves(board, side) {
    var out = [];
    for (var i = 0; i < board.length; i++) {
      if (board[i] !== side) continue;
      var pm = plainMovesFrom(board, i, side);
      for (var a = 0; a < pm.length; a++) out.push(pm[a]);
      var cm = captureMovesFrom(board, i, side);
      for (var b = 0; b < cm.length; b++) out.push(cm[b]);
    }
    return out;
  }

  // Just the captures (used for hints / AI ordering).
  function captureMoves(board, side) {
    var out = [];
    for (var i = 0; i < board.length; i++) {
      if (board[i] !== side) continue;
      var cm = captureMovesFrom(board, i, side);
      for (var b = 0; b < cm.length; b++) out.push(cm[b]);
    }
    return out;
  }

  // Does `side` have at least one capture available (a "threat")?
  function hasCaptureThreat(board, side) {
    for (var i = 0; i < board.length; i++) {
      if (board[i] !== side) continue;
      if (captureMovesFrom(board, i, side).length) return true;
    }
    return false;
  }

  // Apply a move to a board (mutates). For a capture the captured enemy AND the
  // origin are cleared and the mover lands ON the captured point.
  function applyMove(board, move, side) {
    board[move.from] = EMPTY;
    if (move.capture && move.captured != null) board[move.captured] = EMPTY;
    board[move.to] = side;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var vsAI = true;            // vs-AI (default). false = local 2-player hotseat.
  var humanSide = LIGHT;      // human's side in vs-AI mode (player A moves first)
  var gameVersion = 0;
  var state;

  // Online room state (set by initRoomMode when launched inside a Room iframe).
  // mySeat is 0-based (seat 0 → LIGHT/first player, seat 1 → DARK); myPlayer is
  // the colour this client controls online.
  var vsRoom = false, mySeat = -1, myPlayer = LIGHT;

  function canActNow() {
    if (vsRoom) return state.turn === myPlayer;
    if (vsAI) return state.turn === humanSide;
    return true;
  }

  function freshState() {
    return {
      board:       startBoard(),
      turn:        LIGHT,         // light (player A) moves first
      phase:       'play',        // 'play' | 'over'
      selected:    null,          // selected board index or null
      lastMove:    null,          // { from, to, captured } for highlight
      noCapPlies:  0,             // plies since the last capture (→ 50-ply draw)
      repeats:     {},            // position-string → count (→ 3× repeat draw)
      winner:      null,          // 'light' | 'dark' | 'draw' | null
      history:     [],
      aiThinking:  false
    };
  }

  // Stable position key (board + side to move) for repetition detection.
  function positionKey(board, turn) { return board.join('') + '|' + turn; }

  // ── Terminal detection (§5) ──────────────────────────────────────────────────
  // Evaluated for the side ABOUT TO MOVE. Returns 'light'|'dark'|'draw'|null.
  function checkTerminal(st) {
    var lo = countOnBoard(st.board, LIGHT), dk = countOnBoard(st.board, DARK);
    // Capture-all win.
    if (dk === 0) return 'light';
    if (lo === 0) return 'dark';
    // No-progress / repetition draw → more pieces wins, equal = draw.
    if (st.noCapPlies >= NO_CAP_DRAW_PLIES || repeatedThrice(st)) {
      if (lo > dk) return 'light';
      if (dk > lo) return 'dark';
      return 'draw';
    }
    // Side to move has no legal move at all → the other side wins (or draw-by-more).
    if (legalMoves(st.board, st.turn).length === 0) {
      if (lo > dk) return 'light';
      if (dk > lo) return 'dark';
      return 'draw';
    }
    return null;
  }

  function repeatedThrice(st) {
    var key = positionKey(st.board, st.turn);
    return (st.repeats[key] || 0) >= REPEAT_DRAW;
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────
  var cnv, ctx;

  // Batik-and-teak palette (canvas may use literal colours; checklist #5 exception).
  var C = {
    bg:        '#241409',   // dark teak surround
    grain1:    'rgba(150,96,44,0.20)',
    grain2:    'rgba(74,42,16,0.32)',
    plate:     '#8A5A2B',   // carved teak board plate
    plateHi:   '#A9743A',
    plateLo:   '#5C3A18',
    line:      '#F0CF92',   // incised batik-gold line
    lineDark:  'rgba(46,26,10,0.55)',
    arc:       '#F0CF92',   // loop arcs (same gold)
    arcGlow:   'rgba(240,207,146,0.30)',
    point:     '#E3B66A',   // empty point ring
    pointFill: '#3A2412',
    light:     '#F4E9CE',   // light piece (player A)
    lightHi:   '#FFFBF1',
    lightRim:  '#B89A63',
    dark:      '#3A2516',   // dark piece (player B)
    darkHi:    '#5E3F24',
    darkRim:   '#1B1009',
    selected:  '#E8A013',   // saffron selection glow
    validDot:  'rgba(120,180,110,0.80)',
    capRing:   '#C2412A',   // capture-target marker
    lastMove:  'rgba(232,160,19,0.50)',
    lastCap:   'rgba(194,65,42,0.9)'
  };

  // Canvas coord of point (r,c). x = padX + (c-1)*cell ; y = padY + (6-r)*cell.
  function ptXY(r, c) {
    return {
      x: state.padX + (c - 1) * state.cell,
      y: state.padY + (SIZE - r) * state.cell
    };
  }
  function idxXY(i) { return ptXY(i2r(i), i2c(i)); }

  // Map an event to the nearest intersection within a radius, else null.
  function pointFromEvent(e) {
    var rect = cnv.getBoundingClientRect();
    var scaleX = cnv.width / rect.width;
    var scaleY = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top) * scaleY;
    var best = null, bestDist = Infinity;
    for (var i = 0; i < SIZE * SIZE; i++) {
      var pt = idxXY(i);
      var d = Math.hypot(x - pt.x, y - pt.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best !== null && bestDist <= state.cell * 0.48) return best;
    return null;
  }

  function drawRoundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Draw the 4 corner arcs of one ring (inset pair lo/hi). Each arc is a quarter
  // circle joining the end of a row-line to the end of the perpendicular col-line.
  function drawRingArcs(lo, hi) {
    var cs = state.cell;
    var r = cs; // arc radius = one cell (joins line `lo`/`hi` to the edge+turn)
    // The arc centre for each corner sits at the grid corner one cell OUTSIDE the
    // board on the relevant edge, producing a smooth quarter-turn from row to col.
    // Bottom-left: connects (lo,1)≈left end of row lo to (1,lo) bottom of col lo.
    //   centre at (r=1,c=1) corner-ish → we anchor arcs at the board's outer
    //   corner offset by the inset. Compute via the two endpoint tangents.
    function arc(p1r, p1c, p2r, p2c, cr, cc) {
      var p1 = ptXY(p1r, p1c), p2 = ptXY(p2r, p2c), cen = ptXY(cr, cc);
      var rad = Math.hypot(p1.x - cen.x, p1.y - cen.y);
      var a1 = Math.atan2(p1.y - cen.y, p1.x - cen.x);
      var a2 = Math.atan2(p2.y - cen.y, p2.x - cen.x);
      // choose the short sweep
      var diff = a2 - a1;
      while (diff <= -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cen.x, cen.y, rad, a1, a1 + diff, diff < 0);
      ctx.stroke();
    }
    // glow underlay + gold stroke
    function bothArcs() {
      // Bottom-left corner: row `lo` left end (lo,1) ↔ col `lo` bottom (1,lo); centre (lo,lo)
      arc(lo, 1, 1, lo, lo, lo);
      // Bottom-right: row `lo` right end (lo,6) ↔ col `hi` bottom (1,hi); centre (lo,hi)
      arc(lo, SIZE, 1, hi, lo, hi);
      // Top-left: row `hi` left end (hi,1) ↔ col `lo` top (6,lo); centre (hi,lo)
      arc(hi, 1, SIZE, lo, hi, lo);
      // Top-right: row `hi` right end (hi,6) ↔ col `hi` top (6,hi); centre (hi,hi)
      arc(hi, SIZE, SIZE, hi, hi, hi);
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.arcGlow;
    ctx.lineWidth = 6.5;
    bothArcs();
    ctx.strokeStyle = C.arc;
    ctx.lineWidth = 2.2;
    bothArcs();
  }

  function render() {
    if (!cnv || !ctx) return;
    var cs = state.cell;
    var pr = cs * 0.30; // piece radius

    ctx.clearRect(0, 0, cnv.width, cnv.height);

    // Teak surround + grain
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var gy = 0; gy < cnv.height; gy += 11) ctx.fillRect(0, gy, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var gx = 0; gx < cnv.width; gx += 26) ctx.fillRect(gx, 0, 3, cnv.height);

    // Carved teak board plate (covers grid + arc margin)
    var tl = ptXY(SIZE, 1); // top-left grid point (r=6,c=1)
    var span = (SIZE - 1) * cs;
    var bx = tl.x - cs * 1.05, by = tl.y - cs * 1.05;
    var bw = span + cs * 2.1, bh = span + cs * 2.1;
    ctx.fillStyle = C.plate;
    drawRoundRect(bx, by, bw, bh, 14); ctx.fill();
    ctx.save();
    drawRoundRect(bx, by, bw, bh, 14); ctx.clip();
    ctx.fillStyle = 'rgba(46,26,10,0.22)';
    for (var t = 0; t < 8; t++) ctx.fillRect(bx, by + bh * (t / 8), bw, t % 2 === 0 ? 3 : 2);
    ctx.fillStyle = C.plateHi;
    ctx.globalAlpha = 0.13;
    drawRoundRect(bx + 3, by + 3, bw - 6, bh * 0.16, 10); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.plateLo;
    drawRoundRect(bx, by, bw, bh, 14); ctx.stroke();

    // 6×6 grid lines (rows + cols), incised gold over a dark underline.
    for (var k = 1; k <= SIZE; k++) {
      var rl1 = ptXY(k, 1), rl2 = ptXY(k, SIZE);
      var cl1 = ptXY(1, k), cl2 = ptXY(SIZE, k);
      // dark underline
      ctx.strokeStyle = C.lineDark; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rl1.x + 1, rl1.y + 1); ctx.lineTo(rl2.x + 1, rl2.y + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cl1.x + 1, cl1.y + 1); ctx.lineTo(cl2.x + 1, cl2.y + 1); ctx.stroke();
      // gold line
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(rl1.x, rl1.y); ctx.lineTo(rl2.x, rl2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cl1.x, cl1.y); ctx.lineTo(cl2.x, cl2.y); ctx.stroke();
    }

    // The signature corner loop arcs (inner inset 2/5, outer inset 3/4).
    drawRingArcs(2, 5);
    drawRingArcs(3, 4);

    // Empty point rings
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (state.board[i] !== EMPTY) continue;
      var pt = idxXY(i);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cs * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = C.pointFill;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = C.point;
      ctx.stroke();
    }

    // Last-move highlights
    if (state.lastMove) {
      if (state.lastMove.to != null) {
        var lm = idxXY(state.lastMove.to);
        ctx.beginPath();
        ctx.arc(lm.x, lm.y, pr + 6, 0, Math.PI * 2);
        ctx.strokeStyle = C.lastMove;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (state.lastMove.from != null) {
        var lf = idxXY(state.lastMove.from);
        ctx.beginPath();
        ctx.arc(lf.x, lf.y, cs * 0.10, 0, Math.PI * 2);
        ctx.strokeStyle = C.lastMove;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Interaction hints
    drawHints(pr);

    // Pieces
    for (var pi = 0; pi < SIZE * SIZE; pi++) {
      if (state.board[pi] === EMPTY) continue;
      var ppt = idxXY(pi);
      drawPiece(ppt.x, ppt.y, pr, state.board[pi], pi === state.selected);
    }
  }

  function drawPiece(x, y, r, side, sel) {
    ctx.beginPath();
    ctx.ellipse(x + 1.4, y + 2.2, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.1, x, y, r);
    if (side === LIGHT) {
      g.addColorStop(0, C.lightHi);
      g.addColorStop(0.55, C.light);
      g.addColorStop(1, '#D8C8A4');
    } else {
      g.addColorStop(0, C.darkHi);
      g.addColorStop(0.55, C.dark);
      g.addColorStop(1, '#23150B');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = side === LIGHT ? C.lightRim : C.darkRim;
    ctx.stroke();
    // glossy speck
    ctx.beginPath();
    ctx.arc(x - r * 0.30, y - r * 0.32, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = side === LIGHT ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)';
    ctx.fill();
    if (sel) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function drawHints(pr) {
    if (state.winner || state.phase === 'over') return;
    if (!canActNow() || state.aiThinking) return;
    if (window.CGTutorial && CGTutorial.isActive) return;

    if (state.selected != null) {
      // destinations of the selected piece — plain (dot) and capture (red ring)
      var ms = movesFromSelected();
      for (var di = 0; di < ms.length; di++) {
        var dp = idxXY(ms[di].to);
        if (ms[di].capture) {
          ctx.beginPath();
          ctx.arc(dp.x, dp.y, pr + 4, 0, Math.PI * 2);
          ctx.strokeStyle = C.capRing;
          ctx.lineWidth = 2.8;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(dp.x, dp.y, pr * 0.48, 0, Math.PI * 2);
          ctx.fillStyle = C.validDot;
          ctx.fill();
        }
      }
    } else {
      // ring movable pieces (those with at least one legal move) faintly
      var froms = {};
      var all = legalMoves(state.board, state.turn);
      for (var mi = 0; mi < all.length; mi++) froms[all[mi].from] = true;
      for (var f in froms) {
        if (!froms.hasOwnProperty(f)) continue;
        var fp = idxXY(parseInt(f, 10));
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, pr + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,160,19,0.30)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function movesFromSelected() {
    if (state.selected == null) return [];
    var pm = plainMovesFrom(state.board, state.selected, state.turn);
    var cm = captureMovesFrom(state.board, state.selected, state.turn);
    return pm.concat(cm);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elModeToggle, elModeWrap;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }
  function sideName(side) { return side === LIGHT ? 'Light' : 'Dark'; }

  function updateScore() {
    if (!elScore) return;
    var lo = countOnBoard(state.board, LIGHT), dk = countOnBoard(state.board, DARK);
    elScore.innerHTML =
      '<span class="sk-score__light">&#9899; Light &middot; ' + lo + ' pieces</span>' +
      '<span class="sk-score__dark">&#9898; Dark &middot; ' + dk + ' pieces</span>';
  }

  function phaseHint() {
    if (state.selected != null) {
      return 'Tap a green dot to step, or a red ring to loop-capture; tap the piece again to deselect.';
    }
    return 'Tap one of your pieces, then a highlighted point.';
  }

  function turnStatus() {
    var hint = phaseHint();
    if (vsRoom) {
      return (state.turn === myPlayer ? 'Your turn. ' : 'Opponent’s turn. ') + hint;
    }
    if (!vsAI) {
      return (state.turn === LIGHT ? 'Light’s turn (Player 1). ' : 'Dark’s turn (Player 2). ') + hint;
    }
    if (state.turn === humanSide) return 'Your turn (Light). ' + hint;
    return 'Computer’s turn (Dark). ' + hint;
  }

  // ── Human interaction ──────────────────────────────────────────────────────
  function humanClick(point) {
    if (point == null) return;
    if (state.winner || state.phase === 'over') return;
    if (state.aiThinking) return;
    if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return;
    if (!canActNow()) return;  // online: locks both the select-piece AND choose-destination clicks when not myPlayer's turn
    if (window.CGTutorial && CGTutorial.isActive) return;

    var b = state.board, side = state.turn;

    if (state.selected == null) {
      if (b[point] === side && hasMoveFrom(point)) { state.selected = point; render(); }
      return;
    }
    if (point === state.selected) { state.selected = null; render(); return; }
    if (b[point] === side && hasMoveFrom(point)) { state.selected = point; render(); return; }

    // Choose the move selected→point. Prefer a capture if both somehow land there.
    var cand = movesFromSelected().filter(function (m) { return m.to === point; });
    if (!cand.length) { state.selected = null; render(); return; }
    cand.sort(function (a, bb) { return (bb.capture ? 1 : 0) - (a.capture ? 1 : 0); });
    state.selected = null;
    commitMove(cand[0]);
  }

  function hasMoveFrom(i) {
    return plainMovesFrom(state.board, i, state.turn).length > 0 ||
           captureMovesFrom(state.board, i, state.turn).length > 0;
  }

  // ── Commit helpers ──────────────────────────────────────────────────────────
  function snapshot() {
    return {
      board:      state.board.slice(),
      turn:       state.turn,
      noCapPlies: state.noCapPlies,
      repeats:    cloneRepeats(state.repeats),
      lastMove:   state.lastMove
    };
  }
  function cloneRepeats(rep) {
    var o = {}; for (var k in rep) if (rep.hasOwnProperty(k)) o[k] = rep[k]; return o;
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 80) state.history.shift();
  }

  function commitMove(move) {
    pushHistory();
    var side = state.turn;
    applyMove(state.board, move, side);
    state.lastMove = { from: move.from, to: move.to, captured: move.captured };
    if (move.capture) state.noCapPlies = 0; else state.noCapPlies++;
    state.selected = null;
    state.turn = other(side);
    // record repetition AFTER the turn flips (position = board + side to move)
    var key = positionKey(state.board, state.turn);
    state.repeats[key] = (state.repeats[key] || 0) + 1;
    afterHandoff();
  }

  function afterHandoff() {
    updateScore();
    var winner = checkTerminal(state);
    if (winner) { endGame(winner); return; }
    render();
    if (vsRoom) { setStatus(turnStatus()); syncRoom(); return; }  // broadcast the move; no AI online
    if (vsAI && state.turn !== humanSide) {
      state.aiThinking = true;
      setStatus('Computer is thinking…');
      scheduleAIMove();
    } else {
      setStatus(turnStatus());
    }
  }

  function endGame(winner) {
    state.winner = winner;
    state.phase = 'over';
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    render();

    var lo = countOnBoard(state.board, LIGHT), dk = countOnBoard(state.board, DARK);
    var localSide = vsRoom ? myPlayer : (vsAI ? humanSide : null);
    var localWon = localSide !== null &&
      ((winner === 'light' && localSide === LIGHT) || (winner === 'dark' && localSide === DARK));

    if (winner === 'draw') {
      setStatus('Draw — the loop war stalled with the pieces level (' + lo + '–' + dk + ').');
    } else if (localSide === null) { // hotseat
      setStatus(winner === 'light'
        ? '🏆 Light wins! Player 1 has cleared (or out-pieced) Dark.'
        : '🏆 Dark wins! Player 2 has cleared (or out-pieced) Light.');
    } else if (localWon) {
      setStatus('🎉 You win! Your loops broke the opponent.');
    } else {
      setStatus(vsRoom
        ? 'Your opponent wins — their loops broke through. A rematch?'
        : 'The computer wins. Watch the corner loops — they strike from behind.');
    }

    var result = winner === 'draw' ? 'draw' : (localWon ? 'win' : 'loss');
    if (vsRoom) {
      syncRoom(); // broadcast the final board + report the winner seat (RoomBridge records stats/coins)
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({ gameId: 'surakarta', result: result, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()) });
      }
      return;
    }
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
      Auth.recordResult('surakarta', result);
    }
    if (vsAI && window.Achievements && Achievements.evaluate) {
      Achievements.evaluate({ gameId: 'surakarta', result: result });
    }
  }

  // ── Online room sync (RoomBridge — full-blob source of truth; yote pattern) ──
  // serializeRoom carries EVERY field that defines the visible board, whose turn
  // it is, the phase, the winner, the last-move highlight, and the draw/repetition
  // clocks (noCapPlies + repeats) — the per-side piece counts are derived from
  // `board`. last_actor encodes our seat so we can drop our own echoed update.
  function serializeRoom() {
    return {
      board:      state.board.slice(),
      turn:       state.turn,
      phase:      state.phase,
      lastMove:   state.lastMove,
      noCapPlies: state.noCapPlies,
      repeats:    cloneRepeats(state.repeats),
      winner:     state.winner,
      last_actor: 'room:' + mySeat
    };
  }
  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeRoom());
    if (state.winner === 'light' || state.winner === 'dark') {
      RoomBridge.reportWin(state.winner === 'light' ? 0 : 1);  // seat 0 = LIGHT (first), seat 1 = DARK
    } else if (state.winner === 'draw') {
      RoomBridge.reportWin(-1); // -1 → null winnerPid in ingame.handleWin → settles as a DRAW
    }
  }
  function receiveRoomState(blob) {
    if (!blob) return;
    if (blob.last_actor === 'room:' + mySeat) return; // suppress our own echoed update
    state.board      = blob.board.slice();
    state.turn       = blob.turn;
    state.phase      = blob.phase || 'play';
    state.lastMove   = blob.lastMove || null;
    state.noCapPlies = blob.noCapPlies || 0;
    state.repeats    = blob.repeats ? cloneRepeats(blob.repeats) : {};
    state.selected   = null;
    state.aiThinking = false;
    state.winner     = blob.winner || null;
    updateScore();
    if (state.winner) {
      state.phase = 'over';
      var lo = countOnBoard(state.board, LIGHT), dk = countOnBoard(state.board, DARK);
      var localWon = (state.winner === 'light' && myPlayer === LIGHT) ||
                     (state.winner === 'dark'  && myPlayer === DARK);
      if (state.winner === 'draw') {
        setStatus('Draw — the loop war stalled with the pieces level (' + lo + '–' + dk + ').');
      } else if (localWon) {
        setStatus('🎉 You win! Your loops broke the opponent.');
      } else {
        setStatus('Your opponent wins — their loops broke through. A rematch?');
      }
    } else {
      setStatus(turnStatus());
    }
    render();
  }
  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true; vsAI = false;
    mySeat = RoomBridge.getSeat();
    myPlayer = (mySeat === 0) ? LIGHT : DARK;  // seat 0 → LIGHT (moves first)
    gameVersion++;                              // invalidate any pending AI timer
    state.aiThinking = false;
    // Hide solo-only controls; online rematch is driven by the room's Play Again.
    if (elModeWrap) elModeWrap.style.display = 'none';
    if (elNewBtn)   elNewBtn.style.display   = 'none';
    if (elUndoBtn)  elUndoBtn.style.display  = 'none';
    RoomBridge.onState(receiveRoomState);   // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();            // host seeds the initial board + first turn
    updateScore();
    setStatus(turnStatus());
  }

  // ── AI (minimax / alpha-beta — §6) ──────────────────────────────────────────
  // Eval from `me`'s perspective: material (piece-count diff) PRIMARY, plus a
  // positional term for capture THREATS and mobility; symmetric for the opponent.
  function evaluate(board, me) {
    var foe = other(me);
    var myCt = countOnBoard(board, me), foeCt = countOnBoard(board, foe);
    var score = (myCt - foeCt) * 100;

    // Capture threats (can I/he reach an enemy through a loop next move?).
    var myCaps = captureMoves(board, me).length;
    var foeCaps = captureMoves(board, foe).length;
    score += (myCaps - foeCaps) * 8;

    // Mobility (total legal moves) — lighter weight.
    var myMob = legalMoves(board, me).length;
    var foeMob = legalMoves(board, foe).length;
    score += (myMob - foeMob) * 1;

    return score;
  }

  // Terminal score from `me`'s perspective, or null if non-terminal. `toMove` is
  // the side on turn. noCap is the running no-capture ply counter.
  function terminalScore(board, toMove, me, depth, noCap) {
    var foe = other(me);
    var myCt = countOnBoard(board, me), foeCt = countOnBoard(board, foe);
    if (foeCt === 0) return 100000 + depth;   // captured all enemies
    if (myCt === 0) return -100000 - depth;
    if (noCap >= NO_CAP_DRAW_PLIES) {
      // draw-by-more-pieces resolution
      if (myCt > foeCt) return 90000 + depth;
      if (foeCt > myCt) return -90000 - depth;
      return 0;
    }
    if (legalMoves(board, toMove).length === 0) {
      // side to move stuck → draw-by-more-pieces resolution
      if (myCt > foeCt) return 90000 + depth;
      if (foeCt > myCt) return -90000 - depth;
      return 0;
    }
    return null;
  }

  // Move ordering: captures first (improves alpha-beta cutoffs a lot here).
  function orderedMoves(board, side) {
    var moves = legalMoves(board, side);
    moves.sort(function (a, b) { return (b.capture ? 1 : 0) - (a.capture ? 1 : 0); });
    return moves;
  }

  function search(board, toMove, me, depth, alpha, beta, noCap) {
    var term = terminalScore(board, toMove, me, depth, noCap);
    if (term !== null) return term;
    if (depth === 0) return evaluate(board, me);

    var moves = orderedMoves(board, toMove);
    var maximizing = (toMove === me);
    var i, val;
    if (maximizing) {
      var best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        var nb = board.slice();
        applyMove(nb, moves[i], toMove);
        var nc = moves[i].capture ? 0 : noCap + 1;
        val = search(nb, other(toMove), me, depth - 1, alpha, beta, nc);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (i = 0; i < moves.length; i++) {
        var nb2 = board.slice();
        applyMove(nb2, moves[i], toMove);
        var nc2 = moves[i].capture ? 0 : noCap + 1;
        val = search(nb2, other(toMove), me, depth - 1, alpha, beta, nc2);
        if (val < worst) worst = val;
        if (worst < beta) beta = worst;
        if (alpha >= beta) break;
      }
      return worst;
    }
  }

  // Iterative-deepening best move with a wall-clock budget (responsive, §6).
  function getBestMove(board, toMove, noCap, budgetMs) {
    var moves = orderedMoves(board, toMove);
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];

    var maxDepth = 5;
    var deadline = Date.now() + (budgetMs || 380);
    var bestMove = moves[0];

    for (var depth = 2; depth <= maxDepth; depth++) {
      var bestVal = -Infinity, bestMoves = [];
      var aborted = false;
      for (var i = 0; i < moves.length; i++) {
        var nb = board.slice();
        applyMove(nb, moves[i], toMove);
        var nc = moves[i].capture ? 0 : noCap + 1;
        var val = search(nb, other(toMove), toMove, depth - 1, -Infinity, Infinity, nc);
        if (val > bestVal + 0.0001) { bestVal = val; bestMoves = [moves[i]]; }
        else if (val >= bestVal - 0.0001) bestMoves.push(moves[i]);
        if (Date.now() > deadline) { aborted = true; i++; break; }
      }
      if (bestMoves.length) {
        bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        // re-order: try the depth's best first next iteration
        moves.sort(function (a, b) {
          var ab = (a === bestMove) ? 1 : 0, bb = (b === bestMove) ? 1 : 0;
          if (ab !== bb) return bb - ab;
          return (b.capture ? 1 : 0) - (a.capture ? 1 : 0);
        });
      }
      if (aborted || Date.now() > deadline) break;
      // A decisive line found — stop early.
      if (bestVal >= 90000 || bestVal <= -90000) break;
    }
    return bestMove;
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var move = getBestMove(state.board, state.turn, state.noCapPlies, 380);
      state.aiThinking = false;
      if (!move) { // AI has no move → resolve terminal
        var winner = checkTerminal(state);
        endGame(winner || (state.turn === LIGHT ? 'dark' : 'light'));
        return;
      }
      pushHistory();
      var side = state.turn;
      applyMove(state.board, move, side);
      state.lastMove = { from: move.from, to: move.to, captured: move.captured };
      if (move.capture) state.noCapPlies = 0; else state.noCapPlies++;
      state.turn = other(side);
      var key = positionKey(state.board, state.turn);
      state.repeats[key] = (state.repeats[key] || 0) + 1;
      afterHandoff();
    }, 430);
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    state = freshState();
    layoutFromCanvas();
    updateScore();
    setStatus(turnStatus());
    render();
    // Light (player) always opens, so no AI kickoff at game start.
  }

  function undo() {
    if (state.aiThinking) return;
    if (!state.history.length) return;
    gameVersion++;
    restoreSnap(state.history.pop());
    if (vsAI && state.turn !== humanSide && state.history.length) {
      restoreSnap(state.history.pop());
    }
    state.winner = null;
    if (state.phase === 'over') state.phase = 'play';
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    setStatus(turnStatus());
    render();
  }

  function restoreSnap(s) {
    state.board      = s.board.slice();
    state.turn       = s.turn;
    state.noCapPlies = s.noCapPlies;
    state.repeats    = cloneRepeats(s.repeats);
    state.lastMove   = s.lastMove;
  }

  // ── Init / resize ──────────────────────────────────────────────────────────
  // Board spans (SIZE-1) cells; PAD must clear the arcs (~1 cell beyond the grid).
  function layoutFromCanvas() {
    if (!cnv) return;
    var size = Math.min(cnv.width, cnv.height);
    var cell = Math.floor((size - PAD * 2) / (SIZE - 1));
    if (cell < 22) cell = 22;
    state.cell = cell;
    var boardPx = cell * (SIZE - 1);
    state.padX = Math.max(PAD, Math.round((cnv.width - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((cnv.height - boardPx) / 2));
  }

  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('sk-board-wrap');
    if (!wrap || !cnv) return;
    var w = Math.max(280, Math.min(wrap.clientWidth, 620));
    cnv.width = w;
    cnv.height = w; // square board
    layoutFromCanvas();
    render();
  }

  function init() {
    cnv = document.getElementById('sk-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus     = document.getElementById('sk-status');
    elScore      = document.getElementById('sk-score');
    elNewBtn     = document.getElementById('sk-new-btn');
    elUndoBtn    = document.getElementById('sk-undo-btn');
    elModeToggle = document.getElementById('sk-ai-toggle');
    elModeWrap   = document.getElementById('sk-mode-label');

    state = freshState();
    state.cell = 70; state.padX = PAD; state.padY = PAD;

    cnv.addEventListener('click', function (e) {
      humanClick(pointFromEvent(e));
    });
    cnv.addEventListener('touchend', function (e) {
      e.preventDefault();
      humanClick(pointFromEvent(e));
    }, { passive: false });

    if (elNewBtn)  elNewBtn.addEventListener('click', newGame);
    if (elUndoBtn) elUndoBtn.addEventListener('click', undo);
    if (elModeToggle) {
      elModeToggle.addEventListener('change', function () {
        vsAI = elModeToggle.checked;
        var span = elModeWrap && elModeWrap.querySelector('span');
        if (span) span.textContent = vsAI ? 'vs Computer' : '2 Players';
        newGame();
      });
    }

    window.addEventListener('resize', sizeToWrap);
    window.cgMobileResize = sizeToWrap;

    if (window.Achievements && Achievements.init) Achievements.init();
    if (window.CGTutorial) CGTutorial.initTrigger('surakarta');
    if (window.PWF) try { PWF.init('surakarta'); } catch (e) {}

    sizeToWrap();
    updateScore();
    setStatus(turnStatus());

    initRoomMode();   // becomes online if launched inside a Room iframe (?roomId=)

    startRenderLoop();

    // Dev-only test seam for the 2-client relay harness (perfect-information game → safe).
    try {
      if (new URLSearchParams(location.search).get('roomTest') === '1') {
        window.__roomSim = {
          state:  function () { return state; },
          mySeat: function () { return mySeat; },
          vsRoom: function () { return vsRoom; },
          myTurn: function () {
            return !!(vsRoom &&
              !(window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) &&
              state.turn === myPlayer && !state.winner);
          },
          legal:  function () { return legalMoves(state.board, state.turn); },
          play:   function (mv) {
            // Route through the SAME gated commit path a real tap uses.
            if (state.winner || state.phase === 'over' || state.aiThinking) return false;
            if (window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return false;
            if (!canActNow()) return false;
            if (!mv) return false;
            state.selected = null;
            commitMove(mv);
            return true;
          }
        };
      }
    } catch (e) { /* no-op */ }
  }

  // ── Animation / refresh loop (rAF + setTimeout fallback — checklist #8) ─────
  var lastFrame = 0, _renderTimer = null;
  function tick() {
    var now = Date.now();
    if (now - lastFrame >= 120) { lastFrame = now; render(); }
    scheduleTick();
  }
  function scheduleTick() {
    if (window.requestAnimationFrame) requestAnimationFrame(tick);
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(tick, 150);
  }
  function startRenderLoop() { scheduleTick(); }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ── Tutorial steps ──────────────────────────────────────────────────────────
  if (typeof window !== 'undefined' && window.CGTutorial) {
    CGTutorial.register('surakarta', [
      {
        target: '#sk-canvas',
        title: 'The Board',
        body: 'Surakarta is played on a 6×6 grid of 36 points, with the distinctive loop arcs curling around all four corners. You play the light pieces (bottom two rows); the computer plays the dark.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#sk-canvas',
        title: 'Plain Moves',
        body: 'On a quiet turn, step one piece one space to any empty neighbour — orthogonally OR diagonally. No piece is captured by a plain move.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#sk-canvas',
        title: 'The Loop Capture',
        body: 'To capture, slide a piece along the grid lines, curl around at least one corner loop, and land on the first enemy you reach — the whole path must be clear. You can never capture in a straight line without using a loop, and never along a diagonal.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#sk-canvas',
        title: 'How to Win',
        body: 'Capture all 12 of your opponent’s pieces to win. If the game stalls — 50 moves with no capture — whoever has more pieces wins, and a tie is a draw.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#sk-new-btn',
        title: 'New Game',
        body: 'Start a fresh game any time from here. Use the toggle to switch between vs Computer and 2 Players.',
        position: 'left', highlight: true, beforeStep: null, afterStep: null
      }
    ]);
    CGTutorial.initTrigger('surakarta');
  }

  // ── Fullscreen resize hooks (checklist #3 — resize the canvas BUFFER) ───────
  if (typeof window !== 'undefined' && window.FSMode) {
    FSMode.onEnter = function () { setTimeout(render, 50); };
    FSMode.onExit = function () {
      setTimeout(function () {
        cnv.style.removeProperty('width');
        cnv.style.removeProperty('height');
        sizeToWrap();
      }, 50);
    };
  }

  // GameResize (checklist #3/#4): recompute cell + centred padX/padY, resize the
  // canvas BUFFER to the available box, and re-render.
  if (typeof window !== 'undefined') window.GameResize = function (availW, availH) {
    if (!cnv || !ctx) return;
    var size = Math.min(availW, availH);
    var newCell = Math.floor((size - PAD * 2) / (SIZE - 1));
    if (newCell < 22) newCell = 22;
    state.cell = newCell;
    var boardPx = newCell * (SIZE - 1);
    state.padX = Math.max(PAD, Math.round((availW - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((availH - boardPx) / 2));
    cnv.width = availW;
    cnv.height = availH;
    render();
  };

  // ── Expose pure logic for headless tests (Node) ─────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EMPTY: EMPTY, LIGHT: LIGHT, DARK: DARK, SIZE: SIZE,
      PIECES_PER_SIDE: PIECES_PER_SIDE, NO_CAP_DRAW_PLIES: NO_CAP_DRAW_PLIES,
      DIRS8: DIRS8, INNER: INNER, OUTER: OUTER, RINGS: RINGS,
      RING_OCCURRENCES: RING_OCCURRENCES,
      other: other, inBounds: inBounds, rc2i: rc2i, i2r: i2r, i2c: i2c,
      countOnBoard: countOnBoard, startBoard: startBoard, buildRing: buildRing,
      plainMovesFrom: plainMovesFrom, captureMovesFrom: captureMovesFrom,
      captureMoves: captureMoves, legalMoves: legalMoves, hasCaptureThreat: hasCaptureThreat,
      applyMove: applyMove, freshState: freshState, positionKey: positionKey,
      checkTerminal: checkTerminal,
      evaluate: evaluate, terminalScore: terminalScore, search: search, getBestMove: getBestMove
    };
  }

}());
