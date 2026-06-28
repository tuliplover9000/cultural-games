/**
 * morabaraba.js — Morabaraba ("the mill"), a strategy game of the Sotho and
 * Tswana peoples of Southern Africa. 24-point three-square board with four
 * corner diagonals (Morabaraba's signature). 12 "cows" per side. MSSA
 * tournament rules: place → move → fly, mills shoot, draw at 3v3.
 *
 * Canvas-rendered, vs-AI single player + local hotseat. Prefix: mb-  Key: morabaraba
 *
 * Structurally a sibling of js/games/bagh-chal.js — mirrors its module shape:
 * canvas setup, named graph/adjacency, GameResize (cell/padX/padY), minimax AI,
 * hotseat toggle (canActNow), rAF+setTimeout animation fallback.
 *
 * NOTE: online room multiplayer + server coin rewards are intentionally OUT OF
 * SCOPE for this build (deferred) — the game runs fully standalone.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var EMPTY = 0, LIGHT = 1, DARK = 2;   // LIGHT = player (moves first by convention)
  var COWS_PER_SIDE = 12;
  var FLY_AT = 3;                        // a side at exactly 3 cows may fly
  var LOSE_AT = 2;                       // a side reduced to 2 cows loses
  var DRAW_PLIES = 10;                   // plies with no shoot once someone is at ≤3 → draw
  var PAD = 40;                          // default padding to outer square

  // ── Board graph (verbatim from roadmap §3 — do NOT re-derive) ──────────────
  // 24 points on a 7×7 conceptual grid. cols a–g = 1–7, rows 1–7 bottom→top.
  // Each point: id → {col, row}. Canvas y uses (7-row) so row 7 is at the top.
  var POINTS = {
    // Outer square
    A7: { col: 1, row: 7 }, D7: { col: 4, row: 7 }, G7: { col: 7, row: 7 },
    G4: { col: 7, row: 4 }, G1: { col: 7, row: 1 }, D1: { col: 4, row: 1 },
    A1: { col: 1, row: 1 }, A4: { col: 1, row: 4 },
    // Middle square
    B6: { col: 2, row: 6 }, D6: { col: 4, row: 6 }, F6: { col: 6, row: 6 },
    F4: { col: 6, row: 4 }, F2: { col: 6, row: 2 }, D2: { col: 4, row: 2 },
    B2: { col: 2, row: 2 }, B4: { col: 2, row: 4 },
    // Inner square
    C5: { col: 3, row: 5 }, D5: { col: 4, row: 5 }, E5: { col: 5, row: 5 },
    E4: { col: 5, row: 4 }, E3: { col: 5, row: 3 }, D3: { col: 4, row: 3 },
    C3: { col: 3, row: 3 }, C4: { col: 3, row: 4 }
  };

  // Stable index order for the board array (24 points).
  var IDS = [
    'A7', 'D7', 'G7', 'G4', 'G1', 'D1', 'A1', 'A4',
    'B6', 'D6', 'F6', 'F4', 'F2', 'D2', 'B2', 'B4',
    'C5', 'D5', 'E5', 'E4', 'E3', 'D3', 'C3', 'C4'
  ];
  var N = IDS.length; // 24
  var IDX = {};       // id → index
  (function () { for (var i = 0; i < N; i++) IDX[IDS[i]] = i; }());

  // Adjacency (verbatim from roadmap §3). Symmetric by construction; verified in tests.
  var ADJ_BY_ID = {
    A1: ['D1', 'A4', 'B2'],            D1: ['A1', 'G1', 'D2'],            G1: ['D1', 'G4', 'F2'],
    A4: ['A1', 'A7', 'B4'],            G4: ['G1', 'G7', 'F4'],            A7: ['A4', 'D7', 'B6'],
    D7: ['A7', 'G7', 'D6'],            G7: ['D7', 'G4', 'F6'],
    B2: ['A1', 'D2', 'B4', 'C3'],      D2: ['D1', 'B2', 'F2', 'D3'],      F2: ['G1', 'D2', 'F4', 'E3'],
    B4: ['A4', 'B2', 'B6', 'C4'],      F4: ['G4', 'F2', 'F6', 'E4'],
    B6: ['A7', 'B4', 'D6', 'C5'],      D6: ['D7', 'B6', 'F6', 'D5'],      F6: ['G7', 'D6', 'F4', 'E5'],
    C3: ['B2', 'D3', 'C4'],            D3: ['D2', 'C3', 'E3', 'D5'],      E3: ['F2', 'D3', 'E4'],
    C4: ['B4', 'C3', 'C5'],            E4: ['F4', 'E3', 'E5'],
    C5: ['B6', 'C4', 'D5'],            D5: ['D6', 'C5', 'E5', 'D3'],      E5: ['F6', 'D5', 'E4']
  };

  // Mills (20 lines of 3) — by id (verbatim from roadmap §3).
  var MILLS_BY_ID = [
    // Rows
    ['A1', 'D1', 'G1'], ['B2', 'D2', 'F2'], ['C3', 'D3', 'E3'], ['A4', 'B4', 'C4'],
    ['E4', 'F4', 'G4'], ['C5', 'D5', 'E5'], ['B6', 'D6', 'F6'], ['A7', 'D7', 'G7'],
    // Cols
    ['A1', 'A4', 'A7'], ['B2', 'B4', 'B6'], ['C3', 'C4', 'C5'], ['D1', 'D2', 'D3'],
    ['D5', 'D6', 'D7'], ['E3', 'E4', 'E5'], ['F2', 'F4', 'F6'], ['G1', 'G4', 'G7'],
    // Diagonals (corner-only — the defining feature)
    ['A1', 'B2', 'C3'], ['G1', 'F2', 'E3'], ['A7', 'B6', 'C5'], ['G7', 'F6', 'E5']
  ];

  // ── Compiled (index-based) graph structures ────────────────────────────────
  var ADJ = [];      // index → [neighbour indices]
  (function () {
    for (var i = 0; i < N; i++) ADJ.push([]);
    for (var id in ADJ_BY_ID) {
      if (!ADJ_BY_ID.hasOwnProperty(id)) continue;
      var from = IDX[id];
      ADJ_BY_ID[id].forEach(function (nid) { ADJ[from].push(IDX[nid]); });
    }
  }());

  var MILLS = MILLS_BY_ID.map(function (m) {
    return [IDX[m[0]], IDX[m[1]], IDX[m[2]]];
  });

  // millsAt[index] = list of mill-line indices that include that point.
  var MILLS_AT = [];
  (function () {
    for (var i = 0; i < N; i++) MILLS_AT.push([]);
    for (var m = 0; m < MILLS.length; m++) {
      for (var k = 0; k < 3; k++) MILLS_AT[MILLS[m][k]].push(m);
    }
  }());

  // High-degree junction points (deg-4) — favoured in evaluation.
  var JUNCTIONS = (function () {
    var arr = [];
    for (var i = 0; i < N; i++) if (ADJ[i].length === 4) arr.push(i);
    return arr;
  }());

  // ── Board helpers ──────────────────────────────────────────────────────────
  function other(side) { return side === LIGHT ? DARK : LIGHT; }

  function countOnBoard(board, side) {
    var c = 0;
    for (var i = 0; i < N; i++) if (board[i] === side) c++;
    return c;
  }

  // Is the point `i` part of a *completed* mill of `side` on this board?
  function inCompletedMill(board, i, side) {
    var lines = MILLS_AT[i];
    for (var k = 0; k < lines.length; k++) {
      var m = MILLS[lines[k]];
      if (board[m[0]] === side && board[m[1]] === side && board[m[2]] === side) return true;
    }
    return false;
  }

  // Does occupying point `i` with `side` *complete a new mill*? Returns the count
  // of mills that become complete by `i` being `side` (board already has i=side or not).
  // We check assuming board[i] === side.
  function millsFormedAt(board, i, side) {
    var n = 0;
    var lines = MILLS_AT[i];
    for (var k = 0; k < lines.length; k++) {
      var m = MILLS[lines[k]];
      if (board[m[0]] === side && board[m[1]] === side && board[m[2]] === side) n++;
    }
    return n;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var vsAI = true;            // vs-AI (default). false = local 2-player hotseat.
  var humanSide = LIGHT;      // human's side in vs-AI mode (player moves first)
  var gameVersion = 0;
  var state;

  // Can the LOCAL player act on the current turn right now?
  //   vs-AI  → only on the human's side
  //   hotseat→ always (whoever's turn it is shares the device)
  function canActNow() {
    if (vsAI) return state.turn === humanSide;
    return true;
  }

  function freshState() {
    var board = [];
    for (var i = 0; i < N; i++) board.push(EMPTY);
    return {
      board:       board,
      turn:        LIGHT,        // light moves first
      phase:       'placement',  // 'placement' | 'movement' | 'over'
      inHand:      { 1: COWS_PER_SIDE, 2: COWS_PER_SIDE }, // cows still to place
      pendingShoot: false,       // true when current side just formed a mill & must shoot
      selected:    null,         // selected board index (movement) or null
      lastMove:    null,         // {from,to} for highlight (from=-1 placement)
      lastShot:    null,         // index just shot (for highlight)
      // anti-oscillation: the cow that just broke a mill to form a new one may not
      // immediately move back to its origin if that would re-form the broken mill.
      banReturn:   null,         // { cow: index (current location), origin: index }
      drawCounter: 0,            // plies since last shoot while someone is at ≤ FLY_AT
      winner:      null,         // 'light' | 'dark' | 'draw' | null
      history:     [],
      aiThinking:  false
    };
  }

  // Side may fly iff it has exactly FLY_AT cows on board (placement done).
  function sideFlies(st, side) {
    if (st.phase === 'placement') return false;
    return countOnBoard(st.board, side) === FLY_AT;
  }

  // ── Move generation ────────────────────────────────────────────────────────
  // A "move" object: { from, to, mill } where:
  //   from === -1  → placement (movement otherwise)
  //   to           → destination index
  //   mill         → true if this move completes a new mill (shoot follows)
  // Shooting is resolved as a *separate* action (see shootTargets / applyShoot),
  // mirroring how Morabaraba turns split into move-then-remove.

  function placementMoves(st) {
    var side = st.turn, board = st.board, moves = [];
    for (var i = 0; i < N; i++) {
      if (board[i] !== EMPTY) continue;
      board[i] = side;
      var formed = millsFormedAt(board, i, side) > 0;
      board[i] = EMPTY;
      moves.push({ from: -1, to: i, mill: formed });
    }
    return moves;
  }

  function movementMoves(st) {
    var side = st.turn, board = st.board, moves = [];
    var fly = sideFlies(st, side);
    for (var from = 0; from < N; from++) {
      if (board[from] !== side) continue;
      var dests = fly ? allEmpties(board) : ADJ[from];
      for (var d = 0; d < dests.length; d++) {
        var to = dests[d];
        if (board[to] !== EMPTY) continue;
        // anti-oscillation: forbid the just-moved cow returning to origin if that
        // re-forms the mill it broke.
        if (st.banReturn && from === st.banReturn.cow && to === st.banReturn.origin) {
          if (wouldReformBrokenMill(board, from, to, side, st.banReturn)) continue;
        }
        board[from] = EMPTY;
        board[to] = side;
        var formed = millsFormedAt(board, to, side) > 0;
        board[to] = EMPTY;
        board[from] = side;
        moves.push({ from: from, to: to, mill: formed });
      }
    }
    return moves;
  }

  function allEmpties(board) {
    var arr = [];
    for (var i = 0; i < N; i++) if (board[i] === EMPTY) arr.push(i);
    return arr;
  }

  // Would moving the banned cow from→to re-form exactly the mill it had broken?
  function wouldReformBrokenMill(board, from, to, side, ban) {
    if (!ban || ban.mill == null) return false;
    var m = MILLS[ban.mill];
    // After the move: to is occupied by side; check the broken mill line.
    var occ = function (idx2) { return (idx2 === to) ? true : (idx2 === from ? false : board[idx2] === side); };
    return occ(m[0]) && occ(m[1]) && occ(m[2]);
  }

  // All legal *moves* (not shoots) for the side to move.
  function legalMoves(st) {
    if (st.phase === 'placement') return placementMoves(st);
    if (st.phase === 'movement') return movementMoves(st);
    return [];
  }

  // Legal shoot targets for `shooter` given the board: opponent cows NOT in a
  // completed mill; if ALL opponent cows are in mills, any opponent cow is legal.
  function shootTargets(board, shooter) {
    var foe = other(shooter);
    var free = [], all = [];
    for (var i = 0; i < N; i++) {
      if (board[i] !== foe) continue;
      all.push(i);
      if (!inCompletedMill(board, i, foe)) free.push(i);
    }
    return free.length > 0 ? free : all;
  }

  // ── Apply move / shoot (mutate a state) ────────────────────────────────────
  // Apply a non-shoot move. Sets st.pendingShoot if a mill formed. Does NOT flip turn.
  function applyMoveToState(st, move) {
    var side = st.turn;
    var brokeMill = null; // the mill index broken by leaving `from`, if any (movement)

    if (move.from === -1) {
      st.board[move.to] = side;
      st.inHand[side]--;
      st.banReturn = null; // placement never bans
    } else {
      // Detect which completed mill (if any) `from` belonged to BEFORE moving.
      brokeMill = completedMillIndexAt(st.board, move.from, side);
      st.board[move.from] = EMPTY;
      st.board[move.to] = side;
    }

    st.lastMove = { from: move.from, to: move.to };
    st.lastShot = null;

    // Did a new mill form at `to`?
    var formed = millsFormedAt(st.board, move.to, side) > 0;
    st.pendingShoot = formed;

    // Anti-oscillation bookkeeping: if a movement broke a mill AND formed a new
    // one, ban returning the cow to its origin when that would re-form the broken mill.
    if (move.from !== -1 && brokeMill != null && formed) {
      st.banReturn = { cow: move.to, origin: move.from, mill: brokeMill };
    } else {
      st.banReturn = null;
    }

    // Draw counter: advances each ply once either side is at ≤ FLY_AT; reset on shoot.
    advanceDrawCounter(st);
  }

  // The index of a completed mill that point `i` (of `side`) is part of, else null.
  function completedMillIndexAt(board, i, side) {
    var lines = MILLS_AT[i];
    for (var k = 0; k < lines.length; k++) {
      var m = MILLS[lines[k]];
      if (board[m[0]] === side && board[m[1]] === side && board[m[2]] === side) return lines[k];
    }
    return null;
  }

  // Apply a shoot (remove opponent cow at index `target`). Resets draw counter.
  function applyShoot(st, target) {
    st.board[target] = EMPTY;
    st.pendingShoot = false;
    st.lastShot = target;
    st.drawCounter = 0; // a shoot always resets the no-progress draw clock
  }

  // Advance the draw counter: only ticks while someone is at ≤ FLY_AT cows and
  // we are in movement. (Placement can't realistically reach this; guarded anyway.)
  function advanceDrawCounter(st) {
    var lo = countOnBoard(st.board, LIGHT);
    var dk = countOnBoard(st.board, DARK);
    if (st.phase !== 'placement' && (lo <= FLY_AT || dk <= FLY_AT)) {
      st.drawCounter++;
    }
  }

  // ── Win / terminal detection ───────────────────────────────────────────────
  // Returns 'light' | 'dark' | 'draw' | null. Evaluated for the side ABOUT TO MOVE
  // (i.e. after turn has flipped to `st.turn`). Reduce-to-2 and no-move both lose.
  function checkTerminal(st) {
    // Reduced to 2 board cows → that side loses (a mill becomes impossible).
    // Only meaningful in the movement phase (no shooting occurs during placement).
    if (st.phase !== 'placement') {
      if (countOnBoard(st.board, LIGHT) <= LOSE_AT) return 'dark';
      if (countOnBoard(st.board, DARK)  <= LOSE_AT) return 'light';
    }

    // Draw: once either side is at ≤3, 10 plies with no shoot → draw.
    if (st.drawCounter >= DRAW_PLIES) return 'draw';

    // Side to move has no legal move → that side loses.
    if (legalMoves(st).length === 0) {
      return st.turn === LIGHT ? 'dark' : 'light';
    }

    return null;
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────
  var cnv, ctx;

  // Earth-and-cattle palette (canvas may use literal colours; checklist #5 exception).
  var C = {
    bg:        '#2E1D10',   // dark soil surround
    grain1:    'rgba(120,78,38,0.26)',
    grain2:    'rgba(76,48,22,0.30)',
    plate:     '#7A4F22',   // packed-earth board plate
    plateHi:   '#9A6C34',
    line:      '#E0B05A',   // ochre/brass incised line
    lineDark:  'rgba(46,29,14,0.55)',
    point:     '#D9A441',   // empty point ring
    pointFill: '#3A2614',
    millGlow:  '#F2C14E',   // active mill highlight
    light:     '#F2E6CC',   // light cow (player)
    lightHi:   '#FFFBF0',
    lightRim:  '#B79A63',
    dark:      '#5B3A1E',   // dark cow (opponent) — burnt-umber cattle
    darkHi:    '#7E5128',
    darkRim:   '#2C1B0C',
    selected:  '#E8A013',   // saffron glow
    validDot:  'rgba(120,160,80,0.70)',
    shootRing: '#C2412A',   // shoot target marker
    lastMove:  'rgba(232,160,19,0.45)',
    lastShot:  'rgba(194,65,42,0.85)'
  };

  // Canvas coord of a point index. x = padX + (col-1)*cell ; y = padY + (7-row)*cell.
  function ptXY(i) {
    var p = POINTS[IDS[i]];
    return {
      x: state.padX + (p.col - 1) * state.cell,
      y: state.padY + (7 - p.row) * state.cell
    };
  }

  // Map an event to the nearest point index (within a tolerance), else null.
  function pointFromEvent(e) {
    var rect = cnv.getBoundingClientRect();
    var scaleX = cnv.width / rect.width;
    var scaleY = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top) * scaleY;
    var best = null, bestDist = Infinity;
    for (var i = 0; i < N; i++) {
      var pt = ptXY(i);
      var d = Math.hypot(x - pt.x, y - pt.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best !== null && bestDist <= state.cell * 0.45) return best;
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

  // The board lines to draw: 3 squares + 4 cross arms + 4 corner diagonals.
  // Defined as id-pairs of segment endpoints (each segment passes through points).
  var LINE_SEGMENTS = [
    // Outer square
    ['A7', 'G7'], ['G7', 'G1'], ['G1', 'A1'], ['A1', 'A7'],
    // Middle square
    ['B6', 'F6'], ['F6', 'F2'], ['F2', 'B2'], ['B2', 'B6'],
    // Inner square
    ['C5', 'E5'], ['E5', 'E3'], ['E3', 'C3'], ['C3', 'C5'],
    // Cross arms (col-4 vertical top & bottom; row-4 horizontal left & right)
    ['D7', 'D5'], ['D3', 'D1'], ['A4', 'C4'], ['E4', 'G4'],
    // Corner diagonals (the signature)
    ['A1', 'C3'], ['G1', 'E3'], ['A7', 'C5'], ['G7', 'E5']
  ];

  function render() {
    if (!cnv || !ctx) return;
    ctx.clearRect(0, 0, cnv.width, cnv.height);

    var cs = state.cell;
    var pr = cs * 0.26; // piece radius

    // Soil surround
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var ry = 0; ry < cnv.height; ry += 10) ctx.fillRect(0, ry, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var rx = 0; rx < cnv.width; rx += 24) ctx.fillRect(rx, 0, 3, cnv.height);

    // Board plate (covers the outer square + margin)
    var o = ptXY(IDX.A7); // top-left outer corner (col1,row7)
    var span = 6 * cs;    // board spans 6 cells
    var bx = o.x - cs * 0.55, by = o.y - cs * 0.55;
    var bw = span + cs * 1.1, bh = span + cs * 1.1;
    ctx.fillStyle = C.plate;
    drawRoundRect(bx, by, bw, bh, 12); ctx.fill();
    ctx.save();
    drawRoundRect(bx, by, bw, bh, 12); ctx.clip();
    ctx.fillStyle = 'rgba(46,29,14,0.26)';
    [0.18, 0.42, 0.66, 0.88].forEach(function (f, gi) {
      ctx.fillRect(bx, by + bh * f, bw, gi % 2 === 0 ? 3 : 2);
    });
    ctx.restore();
    ctx.fillStyle = C.plateHi;
    ctx.globalAlpha = 0.13;
    drawRoundRect(bx + 3, by + 3, bw - 6, bh * 0.20, 9); ctx.fill();
    ctx.globalAlpha = 1;

    // Incised ochre lines (dark underline + bright line on top)
    LINE_SEGMENTS.forEach(function (seg) {
      var p1 = ptXY(IDX[seg[0]]), p2 = ptXY(IDX[seg[1]]);
      ctx.beginPath();
      ctx.moveTo(p1.x + 1, p1.y + 1);
      ctx.lineTo(p2.x + 1, p2.y + 1);
      ctx.strokeStyle = C.lineDark;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    });

    // Highlight any completed mills (subtle glow over the 3 line points)
    [LIGHT, DARK].forEach(function (side) {
      for (var m = 0; m < MILLS.length; m++) {
        var mm = MILLS[m];
        if (state.board[mm[0]] === side && state.board[mm[1]] === side && state.board[mm[2]] === side) {
          var a = ptXY(mm[0]), b = ptXY(mm[2]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = C.millGlow;
          ctx.lineWidth = 4.5;
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    });

    // Empty point rings
    for (var i = 0; i < N; i++) {
      if (state.board[i] !== EMPTY) continue;
      var pt = ptXY(i);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cs * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = C.pointFill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.point;
      ctx.stroke();
    }

    // Last-move destination highlight
    if (state.lastMove && state.lastMove.to >= 0) {
      var lm = ptXY(state.lastMove.to);
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, pr + 6, 0, Math.PI * 2);
      ctx.strokeStyle = C.lastMove;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // Last-shot marker (where an opponent cow was removed)
    if (state.lastShot != null) {
      var ls = ptXY(state.lastShot);
      ctx.beginPath();
      ctx.moveTo(ls.x - pr * 0.6, ls.y - pr * 0.6);
      ctx.lineTo(ls.x + pr * 0.6, ls.y + pr * 0.6);
      ctx.moveTo(ls.x + pr * 0.6, ls.y - pr * 0.6);
      ctx.lineTo(ls.x - pr * 0.6, ls.y + pr * 0.6);
      ctx.strokeStyle = C.lastShot;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Valid-target hints
    var targets = currentTargets();
    targets.forEach(function (t) {
      var pt2 = ptXY(t.to);
      if (t.shoot) {
        ctx.beginPath();
        ctx.arc(pt2.x, pt2.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.shootRing;
        ctx.lineWidth = 2.8;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(pt2.x, pt2.y, pr * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = C.validDot;
        ctx.fill();
      }
    });

    // Cows
    for (var pi = 0; pi < N; pi++) {
      if (state.board[pi] === EMPTY) continue;
      var ppt = ptXY(pi);
      drawCow(ppt.x, ppt.y, pr, state.board[pi], pi === state.selected);
    }
  }

  function drawCow(x, y, r, side, sel) {
    // shadow
    ctx.beginPath();
    ctx.ellipse(x + 1.4, y + 2.2, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.1, x, y, r);
    if (side === LIGHT) {
      g.addColorStop(0, C.lightHi);
      g.addColorStop(0.55, C.light);
      g.addColorStop(1, '#D8C8A4');
    } else {
      g.addColorStop(0, C.darkHi);
      g.addColorStop(0.55, C.dark);
      g.addColorStop(1, '#3C2412');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = side === LIGHT ? C.lightRim : C.darkRim;
    ctx.stroke();
    // little horn nubs (cattle motif)
    ctx.strokeStyle = side === LIGHT ? '#8A7048' : '#1F1208';
    ctx.lineWidth = Math.max(1.1, r * 0.12);
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.5, r * 0.4, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 0.34, y - r * 0.5, r * 0.4, Math.PI * 1.3, Math.PI * 1.95);
    ctx.stroke();
    if (sel) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // Targets to highlight for the human's current interaction.
  function currentTargets() {
    if (state.winner || state.phase === 'over') return [];
    if (!canActNow() || state.aiThinking) return [];

    // Pending shoot → highlight legal shoot targets.
    if (state.pendingShoot) {
      return shootTargets(state.board, state.turn).map(function (i) {
        return { to: i, shoot: true };
      });
    }
    // Movement with a selected cow → its destinations.
    if (state.phase === 'movement' && state.selected != null) {
      return movementMoves(state).filter(function (m) {
        return m.from === state.selected;
      }).map(function (m) { return { to: m.to, shoot: false }; });
    }
    return [];
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elModeToggle, elModeWrap;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function sideName(side) { return side === LIGHT ? 'Light' : 'Dark'; }

  function updateScore() {
    if (!elScore) return;
    var lOn = countOnBoard(state.board, LIGHT), dOn = countOnBoard(state.board, DARK);
    elScore.innerHTML =
      '<span class="mb-score__light">&#9899; Light &middot; ' + lOn +
        ' on board' + (state.inHand[LIGHT] ? ' / ' + state.inHand[LIGHT] + ' in hand' : '') + '</span>' +
      '<span class="mb-score__dark">&#9898; Dark &middot; ' + dOn +
        ' on board' + (state.inHand[DARK] ? ' / ' + state.inHand[DARK] + ' in hand' : '') + '</span>';
  }

  function phaseHint() {
    if (state.pendingShoot) return 'Mill! Tap an opponent cow to remove it.';
    if (state.phase === 'placement') {
      return 'Placement: tap an empty point to place a cow (' + state.inHand[state.turn] + ' in hand).';
    }
    if (sideFlies(state, state.turn)) return 'Flying: tap a cow, then ANY empty point.';
    return 'Movement: tap a cow, then an adjacent empty point.';
  }

  function turnStatus() {
    var sn = sideName(state.turn);
    var hint = phaseHint();
    if (!vsAI) { // hotseat
      return (state.turn === LIGHT ? 'Light’s turn (Player 1). ' : 'Dark’s turn (Player 2). ') + hint;
    }
    return (state.turn === humanSide ? 'Your turn. ' : 'Computer’s turn (Dark). ') + hint;
  }

  // ── Human interaction ──────────────────────────────────────────────────────
  function humanClick(point) {
    if (state.winner || state.phase === 'over') return;
    if (state.aiThinking) return;
    if (!canActNow()) return;
    if (window.CGTutorial && CGTutorial.isActive) return;

    var b = state.board, side = state.turn;

    // Resolve a pending shoot first.
    if (state.pendingShoot) {
      var legal = shootTargets(b, side);
      if (legal.indexOf(point) !== -1) {
        commitShoot(point);
      }
      return;
    }

    if (state.phase === 'placement') {
      if (b[point] === EMPTY) commitMove({ from: -1, to: point });
      return;
    }

    // Movement phase.
    if (state.selected == null) {
      if (b[point] === side && hasMoveFrom(point)) { state.selected = point; render(); }
      return;
    }
    if (point === state.selected) { state.selected = null; render(); return; }
    if (b[point] === side && hasMoveFrom(point)) { state.selected = point; render(); return; }

    var mv = movementMoves(state).filter(function (m) {
      return m.from === state.selected && m.to === point;
    });
    if (mv.length === 0) { state.selected = null; render(); return; }
    var sel = state.selected;
    state.selected = null;
    commitMove({ from: sel, to: point });
  }

  function hasMoveFrom(i) {
    return movementMoves(state).some(function (m) { return m.from === i; });
  }

  function snapshot() {
    return {
      board:       state.board.slice(),
      turn:        state.turn,
      phase:       state.phase,
      inHand:      { 1: state.inHand[LIGHT], 2: state.inHand[DARK] },
      pendingShoot: state.pendingShoot,
      banReturn:   state.banReturn ? { cow: state.banReturn.cow, origin: state.banReturn.origin, mill: state.banReturn.mill } : null,
      drawCounter: state.drawCounter,
      lastMove:    state.lastMove,
      lastShot:    state.lastShot
    };
  }

  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 40) state.history.shift();
  }

  // Commit a move (placement or movement). If it forms a mill, we DON'T flip turn
  // yet — the same side must shoot. Otherwise hand off.
  function commitMove(move) {
    pushHistory();
    maybePromotePhase(); // ensure phase is correct before applying
    applyMoveToState(state, move);
    state.selected = null;
    if (state.pendingShoot) {
      // Same side keeps the turn to shoot. AI auto-resolves; human taps a target.
      afterMoveFormedMill();
    } else {
      afterTurn();
    }
  }

  function commitShoot(target) {
    // (history already pushed at the move that formed the mill — do not double-push;
    //  but if a human is shooting after their own move, snapshot is already taken.)
    applyShoot(state, target);
    afterTurn();
  }

  // After a placement that exhausts the hand, switch to movement at the right time.
  function maybePromotePhase() {
    if (state.phase === 'placement' && state.inHand[LIGHT] === 0 && state.inHand[DARK] === 0) {
      state.phase = 'movement';
    }
  }

  // A mill formed and a shoot is pending for the side that just moved.
  function afterMoveFormedMill() {
    // promote phase if placement just ended
    if (state.phase === 'placement' && state.inHand[LIGHT] === 0 && state.inHand[DARK] === 0) {
      state.phase = 'movement';
    }
    updateScore();
    render();
    if (vsAI && state.turn !== humanSide) {
      // AI resolves its own shoot.
      state.aiThinking = true;
      setStatus('Computer forms a mill…');
      scheduleAIShoot();
    } else {
      setStatus(turnStatus());
    }
  }

  // Flip turn, promote phase, evaluate terminal, hand off to AI if needed.
  function afterTurn() {
    // promote placement → movement once both hands are empty
    if (state.phase === 'placement' && state.inHand[LIGHT] === 0 && state.inHand[DARK] === 0) {
      state.phase = 'movement';
    }
    state.turn = other(state.turn);
    state.selected = null;
    updateScore();

    var winner = checkTerminal(state);
    if (winner) { endGame(winner); return; }

    render();
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
    state.pendingShoot = false;
    updateScore();
    render();

    var localSide = vsAI ? humanSide : null;
    var localWon = localSide !== null &&
      ((winner === 'light' && localSide === LIGHT) || (winner === 'dark' && localSide === DARK));

    if (winner === 'draw') {
      setStatus('Draw — 10 moves passed with no cow taken. Neither herd can break through.');
    } else if (localSide === null) { // hotseat
      setStatus(winner === 'light'
        ? '🏆 Light wins! Player 1 has broken the herd — Dark cannot continue.'
        : '🏆 Dark wins! Player 2 has broken the herd — Light cannot continue.');
    } else if (localWon) {
      setStatus('🎉 You win! The opponent’s herd is broken.');
    } else {
      setStatus('The computer wins — your herd is broken. Try guarding your mills.');
    }

    var result = winner === 'draw' ? 'draw' : (localWon ? 'win' : 'loss');
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
      Auth.recordResult('morabaraba', result);
    }
    if (vsAI && window.Achievements && Achievements.evaluate) {
      Achievements.evaluate({ gameId: 'morabaraba', result: result });
    }
  }

  // ── AI (minimax / alpha-beta over the graph) ───────────────────────────────
  // Lightweight sim clone (no UI fields).
  function cloneSim(st) {
    return {
      board:       st.board.slice(),
      turn:        st.turn,
      phase:       st.phase,
      inHand:      { 1: st.inHand[LIGHT], 2: st.inHand[DARK] },
      pendingShoot: st.pendingShoot,
      banReturn:   st.banReturn ? { cow: st.banReturn.cow, origin: st.banReturn.origin, mill: st.banReturn.mill } : null,
      drawCounter: st.drawCounter
    };
  }

  // Generate full "actions" for the side to move from a sim state, where an action
  // bundles a move and (if it forms a mill) the chosen shoot. This keeps minimax
  // a clean alternating-turn search. Each action: { move, shoot|null }.
  function generateActions(st) {
    var moves = legalMoves(st);
    var actions = [];
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      if (!mv.mill) {
        actions.push({ move: mv, shoot: null });
      } else {
        // Apply the move on a scratch board to compute legal shoot targets.
        var sim = cloneSim(st);
        applyMoveToState(sim, mv);
        var targets = shootTargets(sim.board, st.turn);
        for (var t = 0; t < targets.length; t++) {
          actions.push({ move: mv, shoot: targets[t] });
        }
      }
    }
    return actions;
  }

  // Apply a bundled action to a sim state and flip the turn. Promotes phase.
  function applyActionSim(st, action) {
    applyMoveToState(st, action.move);
    if (action.shoot != null) applyShoot(st, action.shoot);
    if (st.phase === 'placement' && st.inHand[LIGHT] === 0 && st.inHand[DARK] === 0) {
      st.phase = 'movement';
    }
    st.turn = other(st.turn);
  }

  // Evaluation from `me`'s perspective. Higher = better for `me`.
  function evaluate(st, me) {
    var foe = other(me);
    var myOn = countOnBoard(st.board, me), foeOn = countOnBoard(st.board, foe);
    var myTotal = myOn + st.inHand[me], foeTotal = foeOn + st.inHand[foe];

    // Material (cows on board + in hand) heavily weighted.
    var score = (myTotal - foeTotal) * 100;

    // Completed mills + near-mills (2-in-a-line with empty third) + blocked foe lines.
    var myMills = 0, foeMills = 0, myNear = 0, foeNear = 0;
    for (var m = 0; m < MILLS.length; m++) {
      var mm = MILLS[m];
      var mine = 0, theirs = 0, empty = 0;
      for (var k = 0; k < 3; k++) {
        var v = st.board[mm[k]];
        if (v === me) mine++;
        else if (v === foe) theirs++;
        else empty++;
      }
      if (mine === 3) myMills++;
      else if (theirs === 3) foeMills++;
      else {
        if (mine === 2 && empty === 1) myNear++;
        if (theirs === 2 && empty === 1) foeNear++;
      }
    }
    score += (myMills - foeMills) * 26;
    score += (myNear - foeNear) * 10;

    // Mobility (legal moves for the side to move, relative to me).
    var movesNow = legalMoves(st).length;
    score += (st.turn === me ? movesNow : -movesNow) * 2;

    // Occupy high-degree junctions.
    var myJ = 0, foeJ = 0;
    for (var j = 0; j < JUNCTIONS.length; j++) {
      var jv = st.board[JUNCTIONS[j]];
      if (jv === me) myJ++; else if (jv === foe) foeJ++;
    }
    score += (myJ - foeJ) * 6;

    return score;
  }

  // Terminal score (from `me`'s perspective) or null if non-terminal.
  function terminalScore(st, me, depth) {
    var lightCt = countOnBoard(st.board, LIGHT);
    var darkCt  = countOnBoard(st.board, DARK);
    if (st.phase !== 'placement') {
      if (lightCt <= LOSE_AT) return me === DARK ? 100000 + depth : -100000 - depth;
      if (darkCt  <= LOSE_AT) return me === LIGHT ? 100000 + depth : -100000 - depth;
    }
    if (st.drawCounter >= DRAW_PLIES) return 0;
    if (legalMoves(st).length === 0) {
      // side to move loses
      var loser = st.turn;
      return loser === me ? -100000 - depth : 100000 + depth;
    }
    return null;
  }

  function minimax(st, me, depth, alpha, beta) {
    var term = terminalScore(st, me, depth);
    if (term !== null) return term;
    if (depth === 0) return evaluate(st, me);

    var actions = generateActions(st);
    if (actions.length === 0) {
      // No move: side to move loses.
      return st.turn === me ? -100000 - depth : 100000 + depth;
    }

    var maximizing = st.turn === me;
    var i, child, val;
    if (maximizing) {
      var best = -Infinity;
      for (i = 0; i < actions.length; i++) {
        child = cloneSim(st);
        applyActionSim(child, actions[i]);
        val = minimax(child, me, depth - 1, alpha, beta);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (i = 0; i < actions.length; i++) {
        child = cloneSim(st);
        applyActionSim(child, actions[i]);
        val = minimax(child, me, depth - 1, alpha, beta);
        if (val < worst) worst = val;
        if (worst < beta) beta = worst;
        if (alpha >= beta) break;
      }
      return worst;
    }
  }

  // Choose the AI's best action. `me` = side to move. Returns { move, shoot } or null.
  function getBestAction(st) {
    var me = st.turn;
    var actions = generateActions(st);
    if (!actions.length) return null;

    // Adaptive depth: placement branches widely (≤24) → shallower; movement deeper.
    // Flying also branches widely; keep it modest. Cap node growth for phone speed.
    var depth;
    if (st.phase === 'placement') depth = 3;
    else if (sideFlies(st, me)) depth = 3;
    else depth = 4;
    if (actions.length > 36 && depth > 3) depth = 3;

    var bestVal = -Infinity, bestActs = [];
    for (var i = 0; i < actions.length; i++) {
      var child = cloneSim(st);
      applyActionSim(child, actions[i]);
      var val = minimax(child, me, depth - 1, -Infinity, Infinity);
      if (val > bestVal + 0.0001) {
        bestVal = val; bestActs = [actions[i]];
      } else if (val >= bestVal - 0.0001) {
        bestActs.push(actions[i]);
      }
    }
    // Tie-break: prefer mill-forming actions, then deterministic-ish variety.
    bestActs.sort(function (a, b) {
      var am = a.shoot != null ? 0 : 1, bm = b.shoot != null ? 0 : 1;
      if (am !== bm) return am - bm;
      return 0;
    });
    // Pick among the top tier (those that form a mill if any do, else all best).
    var topShoot = bestActs[0].shoot != null;
    var pool = bestActs.filter(function (a) { return (a.shoot != null) === topShoot; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var action = getBestAction(state);
      if (!action) {
        // AI has no move → AI loses.
        state.aiThinking = false;
        endGame(state.turn === LIGHT ? 'dark' : 'light');
        return;
      }
      state.aiThinking = false;
      pushHistory();
      maybePromotePhase();
      applyMoveToState(state, action.move);
      if (action.shoot != null && state.pendingShoot) {
        applyShoot(state, action.shoot);
      }
      afterTurn();
    }, 430);
  }

  // AI must resolve a shoot it just earned (when its move formed a mill and the
  // shoot wasn't bundled — defensive; the bundled path above is the norm).
  function scheduleAIShoot() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      var targets = shootTargets(state.board, state.turn);
      if (targets.length) {
        // Pick the shoot that best improves the AI's position by 1-ply eval.
        var me = state.turn, best = targets[0], bestVal = -Infinity;
        for (var i = 0; i < targets.length; i++) {
          var sim = cloneSim(state);
          applyShoot(sim, targets[i]);
          sim.turn = other(me);
          if (sim.phase === 'placement' && sim.inHand[LIGHT] === 0 && sim.inHand[DARK] === 0) sim.phase = 'movement';
          var v = evaluate(sim, me);
          if (v > bestVal) { bestVal = v; best = targets[i]; }
        }
        applyShoot(state, best);
      } else {
        state.pendingShoot = false;
      }
      state.aiThinking = false;
      afterTurn();
    }, 360);
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    state = freshState();
    layoutFromCanvas();
    updateScore();
    setStatus(turnStatus());
    render();
    if (vsAI && state.turn !== humanSide) { state.aiThinking = true; scheduleAIMove(); }
  }

  function undo() {
    if (state.aiThinking) return;
    if (!state.history.length) return;
    gameVersion++;
    restoreSnap(state.history.pop());
    // If it's now the AI's turn (and not pending a human shoot), pop once more to
    // land on a human decision point.
    if (vsAI && state.turn !== humanSide && !state.pendingShoot && state.history.length) {
      restoreSnap(state.history.pop());
    }
    state.winner = null;
    if (state.phase === 'over') {
      state.phase = (state.inHand[LIGHT] > 0 || state.inHand[DARK] > 0) ? 'placement' : 'movement';
    }
    state.aiThinking = false;
    state.selected = null;
    state.lastShot = null;
    updateScore();
    setStatus(turnStatus());
    render();
  }

  function restoreSnap(s) {
    state.board       = s.board.slice();
    state.turn        = s.turn;
    state.phase       = s.phase;
    state.inHand      = { 1: s.inHand[LIGHT], 2: s.inHand[DARK] };
    state.pendingShoot = s.pendingShoot;
    state.banReturn   = s.banReturn ? { cow: s.banReturn.cow, origin: s.banReturn.origin, mill: s.banReturn.mill } : null;
    state.drawCounter = s.drawCounter;
    state.lastMove    = s.lastMove;
    state.lastShot    = s.lastShot;
  }

  // ── Init / resize ──────────────────────────────────────────────────────────
  // Derive cell + centred padding from the current canvas buffer.
  function layoutFromCanvas() {
    if (!cnv) return;
    var size = Math.min(cnv.width, cnv.height);
    var cell = (size - PAD * 2) / 6; // board spans 6 cells
    if (cell < 24) cell = 24;
    state.cell = cell;
    var boardPx = cell * 6;
    state.padX = Math.max(PAD, Math.round((cnv.width - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((cnv.height - boardPx) / 2));
  }

  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('mb-board-wrap');
    if (!wrap || !cnv) return;
    var w = Math.max(280, Math.min(wrap.clientWidth, 620));
    cnv.width = w;
    cnv.height = w; // square board
    layoutFromCanvas();
    render();
  }

  function init() {
    cnv = document.getElementById('mb-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus     = document.getElementById('mb-status');
    elScore      = document.getElementById('mb-score');
    elNewBtn     = document.getElementById('mb-new-btn');
    elUndoBtn    = document.getElementById('mb-undo-btn');
    elModeToggle = document.getElementById('mb-ai-toggle');
    elModeWrap   = document.getElementById('mb-mode-label');

    state = freshState();
    state.cell = 80; state.padX = PAD; state.padY = PAD;

    cnv.addEventListener('click', function (e) {
      var p = pointFromEvent(e);
      if (p !== null) humanClick(p);
    });
    cnv.addEventListener('touchend', function (e) {
      e.preventDefault();
      var p = pointFromEvent(e);
      if (p !== null) humanClick(p);
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
    if (window.CGTutorial) CGTutorial.initTrigger('morabaraba');
    if (window.PWF) try { PWF.init('morabaraba'); } catch (e) {}

    sizeToWrap();
    updateScore();
    setStatus(turnStatus());

    // rAF + setTimeout fallback render loop (checklist #8) — keeps the board fresh
    // and animating even when a background tab throttles requestAnimationFrame.
    startRenderLoop();
  }

  // ── Animation / refresh loop (rAF + setTimeout fallback — checklist #8) ─────
  // Self-rescheduling rAF + setTimeout fallback (checklist #8, senet pattern):
  // each tick re-arms BOTH a rAF and a 150ms timer. In an active tab rAF fires
  // first (~16ms) and the timer is perpetually reset; in a throttled/background
  // tab rAF stalls and the timer drives, so the loop never freezes — and there's
  // never more than one pending rAF + one pending timer (no accumulation).
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
    CGTutorial.register('morabaraba', [
      {
        target: '#mb-canvas',
        title: 'The Board',
        body: 'Morabaraba is played on 24 points — three nested squares joined by cross-arms, plus four corner diagonals that are the game’s signature. You play the light cows; the computer plays the dark.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mb-canvas',
        title: 'Place Your Cows',
        body: 'Each side has 12 cows. Take turns placing one cow on any empty point until all 24 are down. Lining up three of your cows on a line makes a “mill.”',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mb-canvas',
        title: 'Mills Shoot a Cow',
        body: 'Every time you complete a new mill — on placement or by moving — you remove one of the opponent’s cows. You can’t shoot a cow that is already in a mill, unless they are all in mills.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mb-canvas',
        title: 'Move, then Fly',
        body: 'Once all cows are placed, slide a cow along a line to an adjacent empty point. When you are reduced to just 3 cows, those cows may “fly” to ANY empty point.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mb-canvas',
        title: 'How to Win',
        body: 'Reduce your opponent to 2 cows, or leave them with no legal move, and you win. If a 3-cow stalemate drags on, the game is a draw.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mb-new-btn',
        title: 'New Game',
        body: 'Start a fresh game any time from here. Use the toggle to switch between vs Computer and 2 Players.',
        position: 'left', highlight: true, beforeStep: null, afterStep: null
      }
    ]);
    CGTutorial.initTrigger('morabaraba');
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
    var newCell = Math.floor((size - PAD * 2) / 6);
    if (newCell < 24) newCell = 24;
    state.cell = newCell;
    var boardPx = newCell * 6;
    state.padX = Math.max(PAD, Math.round((availW - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((availH - boardPx) / 2));
    cnv.width = availW;
    cnv.height = availH;
    render();
  };

  // ── Expose pure logic for headless tests (Node) ─────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EMPTY: EMPTY, LIGHT: LIGHT, DARK: DARK, N: N,
      COWS_PER_SIDE: COWS_PER_SIDE, FLY_AT: FLY_AT, LOSE_AT: LOSE_AT, DRAW_PLIES: DRAW_PLIES,
      IDS: IDS, IDX: IDX, POINTS: POINTS, ADJ: ADJ, ADJ_BY_ID: ADJ_BY_ID,
      MILLS: MILLS, MILLS_BY_ID: MILLS_BY_ID, MILLS_AT: MILLS_AT, JUNCTIONS: JUNCTIONS,
      freshState: freshState, other: other, countOnBoard: countOnBoard,
      inCompletedMill: inCompletedMill, millsFormedAt: millsFormedAt,
      legalMoves: legalMoves, placementMoves: placementMoves, movementMoves: movementMoves,
      sideFlies: sideFlies, shootTargets: shootTargets,
      applyMoveToState: applyMoveToState, applyShoot: applyShoot,
      checkTerminal: checkTerminal, advanceDrawCounter: advanceDrawCounter,
      cloneSim: cloneSim, generateActions: generateActions, applyActionSim: applyActionSim,
      evaluate: evaluate, minimax: minimax, getBestAction: getBestAction,
      setTurn: function (st, t) { st.turn = t; },
      setPhase: function (st, p) { st.phase = p; }
    };
  }

}());
