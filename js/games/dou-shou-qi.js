/**
 * dou-shou-qi.js — Dou Shou Qi (斗兽棋, "the game of fighting animals"), also
 * called Jungle or Animal Chess. A popular Chinese strategy game on a 7×9 board
 * split by two rivers. Eight ranked animals — Elephant(8) down to Rat(1) — race
 * for the enemy den, with a set of famous exceptions: the rat alone swims and
 * fells the mighty elephant, while the lion and tiger leap clear over the water.
 *
 * Canvas-rendered, vs-AI single player + local hotseat. Prefix: dsq-  Key: dou-shou-qi
 *
 * Structurally a sibling of js/games/morabaraba.js & js/games/konane.js — mirrors
 * their module shape: canvas setup, state.padX/padY/cell, GameResize, alpha-beta
 * AI, hotseat toggle (canActNow), self-rescheduling rAF+setTimeout render loop,
 * and pure-logic Node test exports.
 *
 * NOTE: online room multiplayer + server coin rewards are intentionally OUT OF
 * SCOPE for this build (deferred) — the game runs fully standalone.
 *
 * BUILD FLAG CHOICES (per roadmap §5): Wolf(4) > Dog(3); BOTH Lion AND Tiger
 * leap rivers in BOTH directions (horizontal 2-wide and vertical 3-tall). The
 * non-standard "leopard-leap" is rejected.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var EMPTY = 0;
  var TOP = 1, BOTTOM = 2;        // TOP = AI's home side; BOTTOM = human's home side
  // Human plays BOTTOM (den at (3,8)); AI plays TOP (den at (3,0)).

  var COLS = 7, ROWS = 9;        // 7 wide (col 0-6), 9 tall (row 0-8)
  var PAD = 22;                  // default outer padding (px)
  // No-progress draw: if this many plies pass with NO capture, the game is a draw.
  // (Keeps the game from softlocking when two strong defenders shuffle forever —
  // roadmap §5's optional clean-terminal rule. Den-entry & captures still win.)
  var NO_PROGRESS_LIMIT = 60;

  // Ranks (strong→weak). Wolf 4 > Dog 3 (build flag).
  var RANK = {
    elephant: 8, lion: 7, tiger: 6, leopard: 5,
    wolf: 4, dog: 3, cat: 2, rat: 1
  };
  // Short display glyph (Chinese initial-style label drawn on the disc — NOT an
  // emoji; rendered as canvas text). Kept ASCII-safe single letters as a fallback.
  var ANIMAL_NAME = {
    8: 'Elephant', 7: 'Lion', 6: 'Tiger', 5: 'Leopard',
    4: 'Wolf', 3: 'Dog', 2: 'Cat', 1: 'Rat'
  };
  // Single-letter board labels (drawn on the disc next to the rank number).
  var ANIMAL_LETTER = {
    8: 'E', 7: 'L', 6: 'T', 5: 'P', 4: 'W', 3: 'D', 2: 'C', 1: 'R'
  };

  // ── Board geometry (verified — roadmap §3) ──────────────────────────────────
  // Cells addressed (col, row). Index = row * COLS + col.
  function idx(c, r) { return r * COLS + c; }
  function colOf(i) { return i % COLS; }
  function rowOf(i) { return Math.floor(i / COLS); }
  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  // Dens: top (3,0), bottom (3,8).
  var DEN = { 1: idx(3, 0), 2: idx(3, 8) };   // TOP den / BOTTOM den

  // Traps: top {(2,0),(4,0),(3,1)}, bottom {(2,8),(4,8),(3,7)}.
  var TRAPS = {
    1: [idx(2, 0), idx(4, 0), idx(3, 1)],     // TOP's traps (belong to TOP side)
    2: [idx(2, 8), idx(4, 8), idx(3, 7)]      // BOTTOM's traps (belong to BOTTOM side)
  };

  // Water: two 2×3 ponds. Left cols 1-2, right cols 4-5, both rows 3-5.
  // Column 3 rows 3-5 is DRY (centre bridge).
  var WATER = (function () {
    var set = {};
    var cols = [1, 2, 4, 5];
    for (var ci = 0; ci < cols.length; ci++) {
      for (var r = 3; r <= 5; r++) set[idx(cols[ci], r)] = true;
    }
    return set;
  }());

  function isWater(i) { return !!WATER[i]; }
  function isDen(i, side) { return DEN[side] === i; }
  function isAnyDen(i) { return i === DEN[TOP] || i === DEN[BOTTOM]; }

  // Is cell i a trap belonging to `side`? (Own trap.)
  function isOwnTrap(i, side) {
    var t = TRAPS[side];
    return i === t[0] || i === t[1] || i === t[2];
  }
  // Is cell i a trap belonging to the OPPONENT of `side`?
  function isEnemyTrap(i, side) { return isOwnTrap(i, other(side)); }

  function other(side) { return side === TOP ? BOTTOM : TOP; }

  // Orthogonal step directions.
  var DIRS = [
    { dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }
  ];

  // ── Starting layout (verified — roadmap §4) ─────────────────────────────────
  // Each piece: { rank, side }. Stored on the board array by index; EMPTY === 0.
  var START_LAYOUT = [
    // TOP (AI)
    { c: 0, r: 0, rank: RANK.lion,    side: TOP },
    { c: 6, r: 0, rank: RANK.tiger,   side: TOP },
    { c: 1, r: 1, rank: RANK.dog,     side: TOP },
    { c: 5, r: 1, rank: RANK.cat,     side: TOP },
    { c: 0, r: 2, rank: RANK.rat,     side: TOP },
    { c: 2, r: 2, rank: RANK.leopard, side: TOP },
    { c: 4, r: 2, rank: RANK.wolf,    side: TOP },
    { c: 6, r: 2, rank: RANK.elephant,side: TOP },
    // BOTTOM (human)
    { c: 0, r: 6, rank: RANK.elephant,side: BOTTOM },
    { c: 2, r: 6, rank: RANK.wolf,    side: BOTTOM },
    { c: 4, r: 6, rank: RANK.leopard, side: BOTTOM },
    { c: 6, r: 6, rank: RANK.rat,     side: BOTTOM },
    { c: 1, r: 7, rank: RANK.cat,     side: BOTTOM },
    { c: 5, r: 7, rank: RANK.dog,     side: BOTTOM },
    { c: 0, r: 8, rank: RANK.tiger,   side: BOTTOM },
    { c: 6, r: 8, rank: RANK.lion,    side: BOTTOM }
  ];

  // Build a fresh board array of length COLS*ROWS. Each cell is null (EMPTY) or a
  // piece object { rank, side }.
  function startBoard() {
    var board = [];
    var n = COLS * ROWS;
    for (var i = 0; i < n; i++) board.push(null);
    for (var k = 0; k < START_LAYOUT.length; k++) {
      var p = START_LAYOUT[k];
      board[idx(p.c, p.r)] = { rank: p.rank, side: p.side };
    }
    return board;
  }

  function cloneBoard(board) {
    var b = [];
    for (var i = 0; i < board.length; i++) {
      b.push(board[i] ? { rank: board[i].rank, side: board[i].side } : null);
    }
    return b;
  }

  function countPieces(board, side) {
    var n = 0;
    for (var i = 0; i < board.length; i++) if (board[i] && board[i].side === side) n++;
    return n;
  }

  // ── Capture legality (rank rules + all exceptions — roadmap §5) ─────────────
  // Effective rank of the piece at index `i` *as a target* of capture, given the
  // capturing situation. A piece standing on an ENEMY trap (a trap belonging to
  // the capturer's side) has effective rank 0. Own traps do NOT weaken pieces.
  function effectiveTargetRank(board, targetIdx, attackerSide) {
    var target = board[targetIdx];
    if (!target) return 0;
    // If the target is standing on a trap belonging to the ATTACKER's side, its
    // rank drops to 0 (anyone may take it). That trap is the target's enemy trap.
    if (isOwnTrap(targetIdx, attackerSide)) return 0;
    return target.rank;
  }

  // Can the piece `attacker` (at attackerIdx) capture the enemy piece `target`
  // (at targetIdx)? Implements ALL the special rules. `attackerInWater` and
  // `targetInWater` reflect the squares the two pieces stand on (after the would-be
  // move the attacker is ON the target's square, so attackerInWater here means the
  // square the attacker is moving FROM is water — used for the no-capture-on-leave
  // rule; the destination water-ness is handled by the caller's move generation).
  //
  // This pure predicate assumes attacker and target are orthogonally adjacent OR
  // the attacker is leaping onto the target (lion/tiger); it judges only the rank
  // + water + trap relationship, not adjacency.
  function canCapture(board, attackerIdx, targetIdx) {
    var attacker = board[attackerIdx];
    var target = board[targetIdx];
    if (!attacker || !target) return false;
    if (attacker.side === target.side) return false;

    var aWater = isWater(attackerIdx);
    var tWater = isWater(targetIdx);

    // Water rules:
    //  - A rat IN water cannot capture a LAND piece.
    //  - A land piece cannot capture a rat that is IN water (rat invulnerable).
    //  - A water-rat CAN capture an enemy water-rat.
    if (aWater && !tWater) {
      // attacker (a rat — only rats can be in water) attacking a land piece → illegal
      return false;
    }
    if (!aWater && tWater) {
      // land piece attacking a piece in water (must be a rat) → illegal (invulnerable)
      return false;
    }
    // (aWater && tWater): both in water → only rats can be in water → rat vs rat,
    // resolved by rank rule below (equal ranks → capture allowed).

    // Rank rule with the rat↔elephant exception.
    var aRank = attacker.rank;
    var tRank = effectiveTargetRank(board, targetIdx, attacker.side);

    // Asymmetric exception: Rat(1) captures Elephant(8); Elephant CANNOT capture Rat.
    // Note: the trap exception (tRank === 0) still lets anyone take a trapped piece,
    // so an elephant CAN take a rat sitting on the elephant's enemy trap.
    if (target.rank === RANK.rat && attacker.rank === RANK.elephant && tRank !== 0) {
      // Elephant vs un-trapped Rat → forbidden.
      return false;
    }
    if (attacker.rank === RANK.rat && target.rank === RANK.elephant) {
      // Rat vs Elephant → always allowed (rank gate bypassed). Still respects the
      // water rules already checked above (a water-rat can't hit a land elephant).
      return true;
    }

    // Standard: capture an enemy of EQUAL or LOWER (effective) rank.
    return aRank >= tRank;
  }

  // ── Move generation (orthogonal steps + lion/tiger leaps — roadmap §5) ──────
  // A move: { from, to, capture: bool }.

  // Is there ANY rat (either colour) on a water cell strictly between `fromIdx`
  // and `toIdx` along a straight line? Used to block lion/tiger leaps.
  function ratInLeapPath(board, fromIdx, toIdx) {
    var c0 = colOf(fromIdx), r0 = rowOf(fromIdx);
    var c1 = colOf(toIdx), r1 = rowOf(toIdx);
    var dc = c1 === c0 ? 0 : (c1 > c0 ? 1 : -1);
    var dr = r1 === r0 ? 0 : (r1 > r0 ? 1 : -1);
    var c = c0 + dc, r = r0 + dr;
    while (c !== c1 || r !== r1) {
      var i = idx(c, r);
      if (isWater(i) && board[i] && board[i].rank === RANK.rat) return true;
      c += dc; r += dr;
    }
    return false;
  }

  // If the piece at `from` is a lion or tiger sitting at the edge of a pond and
  // the straight line in direction (dc,dr) crosses the pond to a land cell, return
  // that landing index — else -1. The full pond span (every intermediate cell)
  // must be water.
  function leapTarget(board, fromIdx, dc, dr) {
    var c0 = colOf(fromIdx), r0 = rowOf(fromIdx);
    var c = c0 + dc, r = r0 + dr;
    // First step beyond `from` must be water for a leap to begin.
    if (!inBounds(c, r) || !isWater(idx(c, r))) return -1;
    // Walk over consecutive water cells in this direction.
    while (inBounds(c, r) && isWater(idx(c, r))) {
      c += dc; r += dr;
    }
    // Now (c,r) is the first NON-water cell beyond the pond (the landing).
    if (!inBounds(c, r)) return -1;
    return idx(c, r);
  }

  // All legal moves for `side`. Each move respects every special rule.
  function legalMoves(board, side) {
    var moves = [];
    for (var i = 0; i < board.length; i++) {
      var p = board[i];
      if (!p || p.side !== side) continue;
      addMovesFrom(board, i, moves);
    }
    return moves;
  }

  function addMovesFrom(board, fromIdx, out) {
    var p = board[fromIdx];
    if (!p) return;
    var side = p.side;
    var fromWater = isWater(fromIdx);

    // 1) Orthogonal single steps.
    for (var d = 0; d < DIRS.length; d++) {
      var c = colOf(fromIdx) + DIRS[d].dc;
      var r = rowOf(fromIdx) + DIRS[d].dr;
      if (!inBounds(c, r)) continue;
      var to = idx(c, r);

      // Cannot enter own den.
      if (isDen(to, side)) continue;

      // Only the RAT may enter water.
      if (isWater(to) && p.rank !== RANK.rat) continue;

      var occ = board[to];
      if (!occ) {
        out.push({ from: fromIdx, to: to, capture: false });
        continue;
      }
      // Occupied: only a capture of an enemy is possible.
      if (occ.side === side) continue;

      // No capture on the move that ENTERS or LEAVES the water (a rat stepping
      // from land into water, or from water onto land, may not capture that step).
      var toWater = isWater(to);
      if (fromWater !== toWater) continue; // crossing the water boundary → no capture

      if (canCapture(board, fromIdx, to)) {
        out.push({ from: fromIdx, to: to, capture: true });
      }
    }

    // 2) Lion / Tiger river-leap (BOTH leap BOTH directions). Blocked by a rat in path.
    if (p.rank === RANK.lion || p.rank === RANK.tiger) {
      for (var ld = 0; ld < DIRS.length; ld++) {
        var land = leapTarget(board, fromIdx, DIRS[ld].dc, DIRS[ld].dr);
        if (land < 0) continue;
        // Blocked if ANY rat (either colour) sits on a water square in the path.
        if (ratInLeapPath(board, fromIdx, land)) continue;
        // Cannot land on own den.
        if (isDen(land, side)) continue;
        // Cannot land on water (leap always ends on land by construction) — guard.
        if (isWater(land)) continue;
        var lp = board[land];
        if (!lp) {
          out.push({ from: fromIdx, to: land, capture: false });
        } else if (lp.side !== side) {
          // Capture at the leap landing: a land-to-land capture (neither in water),
          // so the water boundary rule does not forbid it.
          if (canCapture(board, fromIdx, land)) {
            out.push({ from: fromIdx, to: land, capture: true });
          }
        }
      }
    }
  }

  // Apply a move to a board (mutates). Returns the captured piece (or null).
  function applyMove(board, move) {
    var p = board[move.from];
    var captured = board[move.to] || null;
    board[move.from] = null;
    board[move.to] = p;
    return captured;
  }

  // ── Win / terminal detection (roadmap §5) ───────────────────────────────────
  // WIN: a piece entered the OPPONENT'S den → that piece's side wins.
  //      capturing ALL enemy pieces wins; a side with NO legal move on its turn loses.
  // Returns the WINNING side (TOP|BOTTOM) given a board + the side ABOUT TO MOVE,
  // plus an explicit denWinner check; else null.

  // Has `side` occupied the enemy den? (Checked after a move lands.)
  function denWinner(board) {
    var topDen = board[DEN[TOP]];     // a BOTTOM piece reaching TOP's den → BOTTOM wins
    var botDen = board[DEN[BOTTOM]];  // a TOP piece reaching BOTTOM's den → TOP wins
    if (topDen && topDen.side === BOTTOM) return BOTTOM;
    if (botDen && botDen.side === TOP) return TOP;
    return null;
  }

  // Evaluate terminal state for the position where `toMove` is on turn.
  // Returns 'top' | 'bottom' | 'draw' | null. `noProgress` (optional) is the count
  // of plies since the last capture; at NO_PROGRESS_LIMIT the game is a draw.
  function checkTerminal(board, toMove, noProgress) {
    var dw = denWinner(board);
    if (dw) return dw === TOP ? 'top' : 'bottom';
    // Capture-all: a side with zero pieces loses.
    if (countPieces(board, TOP) === 0) return 'bottom';
    if (countPieces(board, BOTTOM) === 0) return 'top';
    // No legal move for the side to move → that side loses.
    if (legalMoves(board, toMove).length === 0) {
      return toMove === TOP ? 'bottom' : 'top';
    }
    // No-progress draw (optional clean terminal).
    if (typeof noProgress === 'number' && noProgress >= NO_PROGRESS_LIMIT) return 'draw';
    return null;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var vsAI = true;             // vs-AI (default). false = local 2-player hotseat.
  var humanSide = BOTTOM;      // human's side in vs-AI mode (BOTTOM, moves first)
  var gameVersion = 0;
  var state;

  // ── Online room multiplayer (RoomBridge — yote/tsoro pattern) ────────────────
  // vsRoom=true only when launched inside a Room iframe (?roomId=). mySeat is
  // 0-based (seat 0 = first player = BOTTOM; seat 1 = TOP). myPlayer is the side
  // (TOP|BOTTOM) this client controls. Defaults keep solo/hotseat byte-for-byte
  // unchanged when RoomBridge is absent.
  var vsRoom = false, mySeat = -1, myPlayer = BOTTOM;

  function canActNow() {
    if (vsRoom) return state.turn === myPlayer;
    if (vsAI) return state.turn === humanSide;
    return true;
  }

  function freshState() {
    return {
      board:      startBoard(),
      turn:       BOTTOM,        // bottom (human) moves first
      selected:   null,          // selected board index or null
      lastMove:   null,          // { from, to } for highlight
      winner:     null,          // 'top' | 'bottom' | 'draw' | null
      moveCount:  0,             // total plies played
      noProgress: 0,             // plies since the last capture (no-progress draw clock)
      history:    [],
      aiThinking: false
    };
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────
  var cnv, ctx;

  // Jungle palette (canvas may use literal colours; checklist #5 exception).
  var C = {
    bg:        '#15110A',   // dark surround
    grain1:    'rgba(120,92,52,0.16)',
    grain2:    'rgba(50,34,18,0.30)',
    plate:     '#C9A86A',   // bamboo/parchment board plate
    plateLine: 'rgba(90,64,30,0.55)',
    cellLine:  'rgba(90,64,30,0.40)',
    land:      '#E4CC93',   // dry land cell
    landAlt:   '#DCC084',
    water:     '#5D9CA8',   // river tint
    waterDk:   '#3F7B86',
    den:       '#8C5A2B',   // den fill
    denMark:   '#3A220E',
    trap:      'rgba(176,76,52,0.30)', // trap tint
    trapMark:  '#B04C34',
    topPiece:  '#B23A2E',   // AI (TOP) — red
    topHi:     '#D6614E',
    topRim:    '#5C160F',
    botPiece:  '#2E5E8C',   // human (BOTTOM) — blue
    botHi:     '#4C84BC',
    botRim:    '#11283F',
    pieceText: '#FBF3DE',
    selected:  '#E8A013',   // saffron glow
    validDot:  'rgba(70,150,90,0.85)',
    capRing:   'rgba(206,86,52,0.95)',
    lastMove:  'rgba(232,160,19,0.55)'
  };

  function cellXY(c, r) {
    return {
      x: state.padX + (c + 0.5) * state.cell,
      y: state.padY + (r + 0.5) * state.cell
    };
  }

  function cellFromEvent(e) {
    var rect = cnv.getBoundingClientRect();
    var scaleX = cnv.width / rect.width;
    var scaleY = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top) * scaleY;
    var c = Math.floor((x - state.padX) / state.cell);
    var r = Math.floor((y - state.padY) / state.cell);
    if (!inBounds(c, r)) return null;
    return { c: c, r: r, i: idx(c, r) };
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

  function render() {
    if (!cnv || !ctx) return;
    var cs = state.cell;
    var pr = cs * 0.40; // piece radius

    ctx.clearRect(0, 0, cnv.width, cnv.height);

    // Dark surround + grain
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var gy = 0; gy < cnv.height; gy += 11) ctx.fillRect(0, gy, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var gx = 0; gx < cnv.width; gx += 26) ctx.fillRect(gx, 0, 3, cnv.height);

    // Board plate
    var bx = state.padX - cs * 0.20, by = state.padY - cs * 0.20;
    var bw = COLS * cs + cs * 0.40, bh = ROWS * cs + cs * 0.40;
    ctx.fillStyle = C.plate;
    drawRoundRect(bx, by, bw, bh, 12); ctx.fill();

    // Cells
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var i = idx(c, r);
        var x = state.padX + c * cs, y = state.padY + r * cs;
        // base land tint (checkerboard-ish for legibility)
        ctx.fillStyle = ((c + r) % 2 === 0) ? C.land : C.landAlt;
        ctx.fillRect(x, y, cs, cs);
        if (isWater(i)) {
          ctx.fillStyle = C.water;
          ctx.fillRect(x, y, cs, cs);
          // ripple lines
          ctx.strokeStyle = C.waterDk;
          ctx.lineWidth = 1;
          for (var w = 1; w <= 2; w++) {
            ctx.beginPath();
            ctx.moveTo(x + cs * 0.12, y + cs * (w / 3));
            ctx.lineTo(x + cs * 0.88, y + cs * (w / 3));
            ctx.stroke();
          }
        }
        // den
        if (isAnyDen(i)) {
          ctx.fillStyle = C.den;
          ctx.fillRect(x, y, cs, cs);
          drawDenMark(x + cs / 2, y + cs / 2, cs * 0.30);
        }
        // trap
        if (isOwnTrap(i, TOP) || isOwnTrap(i, BOTTOM)) {
          ctx.fillStyle = C.trap;
          ctx.fillRect(x, y, cs, cs);
          drawTrapMark(x + cs / 2, y + cs / 2, cs * 0.26);
        }
        // grid line
        ctx.strokeStyle = C.cellLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      }
    }

    // Outer plate border
    ctx.strokeStyle = C.plateLine;
    ctx.lineWidth = 2;
    drawRoundRect(bx, by, bw, bh, 12); ctx.stroke();

    // Last-move highlight
    if (state.lastMove) {
      var lm = state.lastMove;
      [lm.from, lm.to].forEach(function (cellIdx, k) {
        if (cellIdx == null) return;
        var p = cellXY(colOf(cellIdx), rowOf(cellIdx));
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.lastMove;
        ctx.lineWidth = k === 1 ? 3 : 2;
        ctx.stroke();
      });
    }

    // Move hints for the human
    drawHints(pr);

    // Pieces
    for (var pi = 0; pi < state.board.length; pi++) {
      var pc = state.board[pi];
      if (!pc) continue;
      var ppt = cellXY(colOf(pi), rowOf(pi));
      drawPiece(ppt.x, ppt.y, pr, pc, pi === state.selected);
    }
  }

  function drawDenMark(x, y, r) {
    ctx.strokeStyle = C.denMark;
    ctx.lineWidth = 2;
    // a little house / shrine glyph
    ctx.beginPath();
    ctx.moveTo(x - r, y + r * 0.7);
    ctx.lineTo(x - r, y - r * 0.2);
    ctx.lineTo(x, y - r);
    ctx.lineTo(x + r, y - r * 0.2);
    ctx.lineTo(x + r, y + r * 0.7);
    ctx.stroke();
  }

  function drawTrapMark(x, y, r) {
    ctx.strokeStyle = C.trapMark;
    ctx.lineWidth = 2;
    // an X-in-diamond trap glyph
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.stroke();
  }

  function drawPiece(x, y, r, piece, sel) {
    // shadow
    ctx.beginPath();
    ctx.ellipse(x + 1.4, y + 2.2, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.34, r * 0.1, x, y, r);
    if (piece.side === TOP) {
      g.addColorStop(0, C.topHi);
      g.addColorStop(0.55, C.topPiece);
      g.addColorStop(1, '#7A2018');
    } else {
      g.addColorStop(0, C.botHi);
      g.addColorStop(0.55, C.botPiece);
      g.addColorStop(1, '#1A3E5E');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = piece.side === TOP ? C.topRim : C.botRim;
    ctx.stroke();

    // rank number (top) + animal letter (bottom)
    ctx.fillStyle = C.pieceText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (r * 0.92).toFixed(0) + "px 'Be Vietnam Pro', sans-serif";
    ctx.fillText(ANIMAL_LETTER[piece.rank], x, y - r * 0.18);
    ctx.font = 'bold ' + (r * 0.62).toFixed(0) + "px 'Be Vietnam Pro', sans-serif";
    ctx.fillText(String(piece.rank), x, y + r * 0.42);

    if (sel) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function drawHints(pr) {
    if (state.winner) return;
    if (!canActNow() || state.aiThinking) return;
    if (window.CGTutorial && CGTutorial.isActive) return;

    if (state.selected != null) {
      var dests = legalMoves(state.board, state.turn).filter(function (m) {
        return m.from === state.selected;
      });
      for (var d = 0; d < dests.length; d++) {
        var p = cellXY(colOf(dests[d].to), rowOf(dests[d].to));
        if (dests[d].capture) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, pr + 4, 0, Math.PI * 2);
          ctx.strokeStyle = C.capRing;
          ctx.lineWidth = 2.8;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, pr * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = C.validDot;
          ctx.fill();
        }
      }
    } else {
      // ring movable pieces
      var moves = legalMoves(state.board, state.turn);
      var froms = {};
      for (var mi = 0; mi < moves.length; mi++) froms[moves[mi].from] = true;
      for (var f in froms) {
        if (!froms.hasOwnProperty(f)) continue;
        var fp = cellXY(colOf(+f), rowOf(+f));
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, pr + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,160,19,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elModeToggle, elModeWrap;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function sideName(side) { return side === TOP ? 'Red' : 'Blue'; }

  function updateScore() {
    if (!elScore) return;
    var t = countPieces(state.board, TOP), b = countPieces(state.board, BOTTOM);
    elScore.innerHTML =
      '<span class="dsq-score__top">&#9899; Red (AI) &middot; ' + t + ' animals</span>' +
      '<span class="dsq-score__bottom">&#9898; Blue (You) &middot; ' + b + ' animals</span>';
  }

  function phaseHint() {
    if (state.selected != null) {
      return 'Tap a green dot to move, a red ring to capture, or the piece again to deselect.';
    }
    return 'Tap one of your highlighted animals, then a destination. Reach the enemy den to win.';
  }

  function turnStatus() {
    var hint = phaseHint();
    if (vsRoom) {
      return (state.turn === myPlayer ? 'Your turn. ' : 'Opponent’s turn. ') + hint;
    }
    if (!vsAI) {
      return (state.turn === BOTTOM ? 'Blue’s turn (Player 1). ' : 'Red’s turn (Player 2). ') + hint;
    }
    if (state.turn === humanSide) return 'Your turn (Blue). ' + hint;
    return 'Computer’s turn (Red). ' + hint;
  }

  // ── Human interaction ──────────────────────────────────────────────────────
  function humanClick(cell) {
    if (!cell) return;
    if (state.winner) return;
    if (state.aiThinking) return;
    // Online: spectators never act; only the side on turn may act (covers BOTH
    // the select-piece click and the choose-destination click below).
    if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return;
    if (!canActNow()) return;
    if (window.CGTutorial && CGTutorial.isActive) return;

    var i = cell.i, side = state.turn, b = state.board;

    if (state.selected == null) {
      if (b[i] && b[i].side === side && hasMoveFrom(i)) { state.selected = i; render(); }
      return;
    }
    if (i === state.selected) { state.selected = null; render(); return; }
    if (b[i] && b[i].side === side && hasMoveFrom(i)) { state.selected = i; render(); return; }

    var mv = legalMoves(b, side).filter(function (m) {
      return m.from === state.selected && m.to === i;
    });
    if (!mv.length) { state.selected = null; render(); return; }
    var sel = state.selected;
    state.selected = null;
    commitMove(mv[0]);
  }

  function hasMoveFrom(i) {
    return legalMoves(state.board, state.turn).some(function (m) { return m.from === i; });
  }

  // ── Commit / turn flow ──────────────────────────────────────────────────────
  function snapshot() {
    return {
      board:    cloneBoard(state.board),
      turn:     state.turn,
      lastMove: state.lastMove ? { from: state.lastMove.from, to: state.lastMove.to } : null,
      moveCount: state.moveCount,
      noProgress: state.noProgress
    };
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 80) state.history.shift();
  }

  function commitMove(move) {
    pushHistory();
    state.noProgress = move.capture ? 0 : (state.noProgress + 1);
    applyMove(state.board, move);
    state.lastMove = { from: move.from, to: move.to };
    state.selected = null;
    state.moveCount++;
    state.turn = other(state.turn);
    afterHandoff();
  }

  function afterHandoff() {
    updateScore();
    var winner = checkTerminal(state.board, state.turn, state.noProgress);
    if (winner) { endGame(winner); return; }
    render();
    if (vsRoom) { setStatus(turnStatus()); syncRoom(); return; } // broadcast the move (no AI online)
    if (vsAI && state.turn !== humanSide) {
      state.aiThinking = true;
      setStatus('Computer is thinking…');
      scheduleAIMove();
    } else {
      setStatus(turnStatus());
    }
  }

  function endGame(winner) {
    // winner: 'top' | 'bottom' | 'draw'
    state.winner = winner;
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    render();

    if (winner === 'draw') {
      setStatus('Draw — many moves passed with no capture, and neither side could break through.');
      if (vsRoom) {
        syncRoom(); // broadcast the final board (no win to report on a draw)
        if (window.Achievements && Achievements.evaluate) {
          Achievements.evaluate({ gameId: 'dou-shou-qi', result: 'draw', isOnline: true,
            isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()) });
        }
        return;
      }
      if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
        Auth.recordResult('dou-shou-qi', 'draw');
      }
      if (vsAI && window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({ gameId: 'dou-shou-qi', result: 'draw' });
      }
      return;
    }

    var winSide = winner === 'top' ? TOP : BOTTOM;
    var localSide = vsRoom ? myPlayer : (vsAI ? humanSide : null);
    var localWon = localSide !== null && winSide === localSide;

    if (localSide === null) { // hotseat
      setStatus(winSide === BOTTOM
        ? 'Blue wins! Player 1 has broken through to the den.'
        : 'Red wins! Player 2 has broken through to the den.');
    } else if (localWon) {
      setStatus(vsRoom ? 'You win! You stormed the enemy den.'
                       : 'You win! You stormed the computer’s den.');
    } else {
      setStatus(vsRoom ? 'Your opponent reached your den or trapped your animals.'
                       : 'The computer wins — it reached your den or trapped your animals.');
    }

    var result = localWon ? 'win' : 'loss';
    if (vsRoom) {
      syncRoom(); // broadcast the final board + report the winner seat (RoomBridge records stats/coins)
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({ gameId: 'dou-shou-qi', result: result, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()) });
      }
      return;
    }
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
      Auth.recordResult('dou-shou-qi', result);
    }
    if (vsAI && window.Achievements && Achievements.evaluate) {
      Achievements.evaluate({ gameId: 'dou-shou-qi', result: result });
    }
  }

  // ── Online room sync (RoomBridge — full-blob source of truth; yote pattern) ──
  // The blob carries EVERY field that defines the visible board so a fresh client
  // can reconstruct the exact position: the full piece array (rank+owner per cell),
  // whose turn, the winner, and the draw/no-progress clocks. The board is a deep
  // copy (cloneBoard) — never a shared reference.
  function serializeRoom() {
    return {
      board:      cloneBoard(state.board),   // deep copy: array of {rank,side}|null
      turn:       state.turn,                 // TOP|BOTTOM — side on turn
      selected:   null,                       // selection is local-only; never shared
      lastMove:   state.lastMove ? { from: state.lastMove.from, to: state.lastMove.to } : null,
      moveCount:  state.moveCount,
      noProgress: state.noProgress,
      winner:     state.winner,               // 'top'|'bottom'|'draw'|null
      last_actor: 'room:' + mySeat
    };
  }

  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeRoom());
    // reportWin once when a side has actually won (not on a draw). First player =
    // BOTTOM = seat 0; second player = TOP = seat 1.
    if (state.winner === 'top' || state.winner === 'bottom') {
      RoomBridge.reportWin(state.winner === 'bottom' ? 0 : 1);
    } else if (state.winner === 'draw') {
      RoomBridge.reportWin(-1); // -1 → null winnerPid in ingame.handleWin → settles as a DRAW
    }
  }

  function receiveRoomState(blob) {
    if (!blob) return;
    if (blob.last_actor === 'room:' + mySeat) return; // suppress our own echoed update
    // Replace ALL state fields. Deep-copy the board so the two clients never share
    // piece-object references.
    state.board      = cloneBoard(blob.board);
    state.turn       = blob.turn;
    state.lastMove   = blob.lastMove ? { from: blob.lastMove.from, to: blob.lastMove.to } : null;
    state.moveCount  = blob.moveCount || 0;
    state.noProgress = blob.noProgress || 0;
    state.selected   = null;
    state.aiThinking = false;
    state.winner     = blob.winner || null;
    updateScore();
    if (state.winner) {
      var winSide = state.winner === 'top' ? TOP : (state.winner === 'bottom' ? BOTTOM : null);
      if (state.winner === 'draw') {
        setStatus('Draw — many moves passed with no capture, and neither side could break through.');
      } else if (winSide === myPlayer) {
        setStatus('You win! You stormed the enemy den.');
      } else {
        setStatus('Your opponent reached your den or trapped your animals.');
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
    myPlayer = (mySeat === 0) ? BOTTOM : TOP;  // seat 0 = first player = BOTTOM
    // No AI online — kill any pending AI move and never schedule one.
    gameVersion++;
    state.aiThinking = false;
    // Hide solo-only controls; online rematch is driven by the room's Play Again.
    if (elModeWrap) elModeWrap.style.display = 'none';
    if (elNewBtn)   elNewBtn.style.display   = 'none';
    if (elUndoBtn)  elUndoBtn.style.display  = 'none';
    RoomBridge.onState(receiveRoomState);   // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();            // host seeds the initial board + first turn
    updateScore();
    setStatus(turnStatus());
    render();
  }

  // ── AI (alpha-beta with iterative deepening — roadmap §6) ───────────────────
  // Distance (Manhattan-ish, in steps) from cell i toward the enemy den of `side`.
  function denDistance(i, side) {
    var den = DEN[other(side)];
    return Math.abs(colOf(i) - colOf(den)) + Math.abs(rowOf(i) - rowOf(den));
  }

  // Evaluation from `me`'s perspective. Higher = better for me.
  function evaluate(board, me) {
    var foe = other(me);
    var score = 0;
    for (var i = 0; i < board.length; i++) {
      var p = board[i];
      if (!p) continue;
      var sign = (p.side === me) ? 1 : -1;
      // Material weighted by rank (lose the elephant ≫ lose the cat).
      var matVal = 24 + p.rank * p.rank * 3;  // rat≈27 … elephant≈216
      score += sign * matVal;
      // Advancement toward the enemy den. Closer = better. Max dist on this board
      // is ~ (6 + 8) = 14; reward proximity.
      var dist = denDistance(i, p.side);
      var adv = (16 - dist);
      // The enemy nearing OUR den is dangerous — weight the foe's advance heavily.
      if (p.side === me) score += adv * 4;
      else score -= adv * 6;
    }
    return score;
  }

  // Terminal score from `me`'s perspective, or null if non-terminal. `toMove` is
  // the side on turn at this node; `depth` rewards faster wins.
  function terminalScore(board, toMove, me, depth) {
    var dw = denWinner(board);
    if (dw) return (dw === me) ? (100000 + depth) : (-100000 - depth);
    if (countPieces(board, TOP) === 0) return (me === BOTTOM) ? (100000 + depth) : (-100000 - depth);
    if (countPieces(board, BOTTOM) === 0) return (me === TOP) ? (100000 + depth) : (-100000 - depth);
    if (legalMoves(board, toMove).length === 0) {
      // toMove loses.
      return (toMove === me) ? (-100000 - depth) : (100000 + depth);
    }
    return null;
  }

  // Order moves: captures + den-advancing moves first (better alpha-beta cuts).
  function orderMoves(board, moves, side) {
    return moves.map(function (m) {
      var key = 0;
      if (m.capture) key += 1000;
      // den-advance: smaller resulting distance is better
      key += (16 - denDistance(m.to, side));
      // landing on enemy den is the win
      if (m.to === DEN[other(side)]) key += 100000;
      return { m: m, key: key };
    }).sort(function (a, b) { return b.key - a.key; })
      .map(function (o) { return o.m; });
  }

  function search(board, toMove, me, depth, alpha, beta) {
    var term = terminalScore(board, toMove, me, depth);
    if (term !== null) return term;
    if (depth === 0) return evaluate(board, me);

    var moves = orderMoves(board, legalMoves(board, toMove), toMove);
    var maximizing = (toMove === me);
    var i, val, nb, cap;

    if (maximizing) {
      var best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        nb = cloneBoard(board);
        applyMove(nb, moves[i]);
        val = search(nb, other(toMove), me, depth - 1, alpha, beta);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (i = 0; i < moves.length; i++) {
        nb = cloneBoard(board);
        applyMove(nb, moves[i]);
        val = search(nb, other(toMove), me, depth - 1, alpha, beta);
        if (val < worst) worst = val;
        if (worst < beta) beta = worst;
        if (alpha >= beta) break;
      }
      return worst;
    }
  }

  // Pick the AI's best move. Iterative deepening with a node/time budget.
  function getBestMove(board, toMove) {
    var moves = legalMoves(board, toMove);
    if (!moves.length) return null;

    // Immediate-win shortcut: any move landing on the enemy den wins now.
    for (var w = 0; w < moves.length; w++) {
      if (moves[w].to === DEN[other(toMove)]) return moves[w];
    }

    moves = orderMoves(board, moves, toMove);

    var maxDepth = 4;
    var deadline = Date.now() + 480; // ~ phone budget
    var bestMove = moves[0];

    for (var depth = 1; depth <= maxDepth; depth++) {
      var bestVal = -Infinity, bestList = [];
      var alpha = -Infinity, beta = Infinity;
      var timedOut = false;
      for (var i = 0; i < moves.length; i++) {
        var nb = cloneBoard(board);
        applyMove(nb, moves[i]);
        var val = search(nb, other(toMove), toMove, depth - 1, alpha, beta);
        if (val > bestVal + 0.0001) { bestVal = val; bestList = [moves[i]]; }
        else if (val >= bestVal - 0.0001) bestList.push(moves[i]);
        if (val > alpha) alpha = val;
        if (Date.now() > deadline) { timedOut = true; break; }
      }
      if (bestList.length) bestMove = bestList[Math.floor(Math.random() * bestList.length)];
      // Promote the best move to the front for the next (deeper) iteration.
      var bi = moves.indexOf(bestMove);
      if (bi > 0) { moves.splice(bi, 1); moves.unshift(bestMove); }
      if (timedOut) break;
      // A forced win/loss found — stop deepening.
      if (bestVal >= 90000 || bestVal <= -90000) break;
    }
    return bestMove;
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner) return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var move = getBestMove(state.board, state.turn);
      state.aiThinking = false;
      if (!move) { // AI has no move → AI loses
        endGame(state.turn === TOP ? 'bottom' : 'top');
        return;
      }
      pushHistory();
      state.noProgress = move.capture ? 0 : (state.noProgress + 1);
      applyMove(state.board, move);
      state.lastMove = { from: move.from, to: move.to };
      state.moveCount++;
      state.turn = other(state.turn);
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
    // Blue (human) moves first → no AI kickoff at start in vs-AI.
    if (vsAI && state.turn !== humanSide) { state.aiThinking = true; scheduleAIMove(); }
  }

  function undo() {
    if (state.aiThinking) return;
    if (!state.history.length) return;
    gameVersion++;
    restoreSnap(state.history.pop());
    // In vs-AI, step back past the AI's reply to land on a human decision point.
    if (vsAI && state.turn !== humanSide && state.history.length) {
      restoreSnap(state.history.pop());
    }
    state.winner = null;
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    setStatus(turnStatus());
    render();
  }

  function restoreSnap(s) {
    state.board     = cloneBoard(s.board);
    state.turn      = s.turn;
    state.lastMove  = s.lastMove ? { from: s.lastMove.from, to: s.lastMove.to } : null;
    state.moveCount = s.moveCount;
    state.noProgress = s.noProgress || 0;
  }

  // ── Init / resize ──────────────────────────────────────────────────────────
  // Fit BOTH the 7-wide and 9-tall board into the available box (roadmap §3).
  function fitCell(availW, availH) {
    var cell = Math.floor(Math.min((availW - PAD * 2) / COLS, (availH - PAD * 2) / ROWS));
    if (cell < 14) cell = 14;
    return cell;
  }

  function layoutFromCanvas() {
    if (!cnv) return;
    var cell = fitCell(cnv.width, cnv.height);
    state.cell = cell;
    state.padX = Math.max(PAD, Math.round((cnv.width - cell * COLS) / 2));
    state.padY = Math.max(PAD, Math.round((cnv.height - cell * ROWS) / 2));
  }

  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('dsq-board-wrap');
    if (!wrap || !cnv) return;
    // The board is taller than wide (7×9). Size the canvas buffer to keep that
    // aspect ratio while fitting the wrap width.
    var w = Math.max(252, Math.min(wrap.clientWidth, 560));
    var h = Math.round(w * (ROWS / COLS)); // 9/7 aspect
    cnv.width = w;
    cnv.height = h;
    layoutFromCanvas();
    render();
  }

  function init() {
    cnv = document.getElementById('dsq-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus     = document.getElementById('dsq-status');
    elScore      = document.getElementById('dsq-score');
    elNewBtn     = document.getElementById('dsq-new-btn');
    elUndoBtn    = document.getElementById('dsq-undo-btn');
    elModeToggle = document.getElementById('dsq-ai-toggle');
    elModeWrap   = document.getElementById('dsq-mode-label');

    state = freshState();
    state.cell = 40; state.padX = PAD; state.padY = PAD;

    cnv.addEventListener('click', function (e) {
      humanClick(cellFromEvent(e));
    });
    cnv.addEventListener('touchend', function (e) {
      e.preventDefault();
      humanClick(cellFromEvent(e));
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
    if (window.CGTutorial) CGTutorial.initTrigger('dou-shou-qi');
    if (window.PWF) try { PWF.init('dou-shou-qi'); } catch (e) {}

    sizeToWrap();
    updateScore();
    setStatus(turnStatus());

    initRoomMode();   // becomes online if launched inside a Room iframe (?roomId=)

    startRenderLoop();

    // Dev-only test seam for the 2-client relay harness (perfect-information game → safe).
    try {
      if (new URLSearchParams(location.search).get('roomTest') === '1') {
        window.__roomSim = {
          state: function () { return state; },
          mySeat: function () { return mySeat; },
          vsRoom: function () { return vsRoom; },
          myTurn: function () {
            return !!(vsRoom &&
              !(window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) &&
              state.turn === myPlayer && !state.winner);
          },
          // Legal move objects { from, to, capture } for the side to move.
          legal: function () { return legalMoves(state.board, state.turn); },
          // Apply a move object through the SAME gated commit path a real tap uses:
          // two taps — select the source cell, then tap the destination.
          play: function (mv) {
            if (!mv) return false;
            humanClick({ c: colOf(mv.from), r: rowOf(mv.from), i: mv.from });
            if (state.selected !== mv.from) return false; // gate rejected the selection
            humanClick({ c: colOf(mv.to), r: rowOf(mv.to), i: mv.to });
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
    CGTutorial.register('dou-shou-qi', [
      {
        target: '#dsq-canvas',
        title: 'The Jungle Board',
        body: 'Dou Shou Qi is played on a 7×9 board split by two rivers. You play the blue animals at the bottom; the computer plays red at the top. Reach the enemy den (the marked square on the far side) to win.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#dsq-canvas',
        title: 'Ranked Animals',
        body: 'Each animal has a rank, from Elephant (8) down to Rat (1). On your turn, slide one animal one square up, down, left or right. You may capture an enemy of EQUAL or LOWER rank that sits next to you.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#dsq-canvas',
        title: 'The Rat & the Elephant',
        body: 'The famous twist: the Rat (1) alone can swim into the rivers, and the Rat alone can capture the mighty Elephant (8) — yet the Elephant can NEVER capture the Rat. A rat in the water is safe from land animals and cannot attack them.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#dsq-canvas',
        title: 'Lions & Tigers Leap',
        body: 'The Lion and the Tiger can leap straight across a river — over the full pond — to the first land square beyond, capturing whatever they land on. But a rat sitting in the water blocks the leap.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#dsq-canvas',
        title: 'Traps & Dens',
        body: 'Three traps surround each den. An enemy animal standing on YOUR trap drops to rank 0 — any of your animals may take it. You can never enter your own den. Step into the enemy den, or capture every enemy, and you win.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#dsq-new-btn',
        title: 'New Game',
        body: 'Start fresh any time. Use the toggle to switch between vs Computer and 2 Players.',
        position: 'left', highlight: true, beforeStep: null, afterStep: null
      }
    ]);
    CGTutorial.initTrigger('dou-shou-qi');
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

  // GameResize (checklist #3/#4): fit BOTH 7-wide and 9-tall into the box,
  // resize the canvas BUFFER, and re-render.
  if (typeof window !== 'undefined') window.GameResize = function (availW, availH) {
    if (!cnv || !ctx) return;
    var cell = fitCell(availW, availH);
    state.cell = cell;
    state.padX = Math.max(PAD, Math.round((availW - cell * COLS) / 2));
    state.padY = Math.max(PAD, Math.round((availH - cell * ROWS) / 2));
    cnv.width = availW;
    cnv.height = availH;
    render();
  };

  // ── Expose pure logic for headless tests (Node) ─────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EMPTY: EMPTY, TOP: TOP, BOTTOM: BOTTOM, COLS: COLS, ROWS: ROWS,
      RANK: RANK, ANIMAL_NAME: ANIMAL_NAME, DEN: DEN, TRAPS: TRAPS, WATER: WATER,
      idx: idx, colOf: colOf, rowOf: rowOf, inBounds: inBounds, other: other,
      isWater: isWater, isDen: isDen, isAnyDen: isAnyDen,
      isOwnTrap: isOwnTrap, isEnemyTrap: isEnemyTrap,
      startBoard: startBoard, cloneBoard: cloneBoard, countPieces: countPieces,
      effectiveTargetRank: effectiveTargetRank, canCapture: canCapture,
      ratInLeapPath: ratInLeapPath, leapTarget: leapTarget,
      legalMoves: legalMoves, addMovesFrom: addMovesFrom, applyMove: applyMove,
      denWinner: denWinner, checkTerminal: checkTerminal,
      freshState: freshState, evaluate: evaluate, terminalScore: terminalScore,
      orderMoves: orderMoves, search: search, getBestMove: getBestMove,
      START_LAYOUT: START_LAYOUT
    };
  }

}());
