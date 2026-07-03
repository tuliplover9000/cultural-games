/**
 * konane.js — Kōnane (Hawaiian stone-jumping game), a.k.a. "Hawaiian checkers".
 * Played on a papamū (a filled grid of small depressions in lava stone) with
 * ʻiliʻili pebbles of black lava and white coral. The board starts COMPLETELY
 * full in an alternating checkerboard; after two forced opening removals the
 * sides take turns making orthogonal jump-captures. The player who has no legal
 * jump on their turn LOSES — last to move wins, and draws are impossible.
 *
 * Canvas-rendered, vs-AI single player + local hotseat. Board-size toggle
 * (8×8 standard / 6×6 quick). Prefix: kn-  Key: konane
 *
 * Structurally a sibling of js/games/morabaraba.js — mirrors its module shape:
 * canvas setup, state.padX/padY/cell, GameResize, minimax (mobility-dominant)
 * AI, hotseat toggle (canActNow), self-rescheduling rAF+setTimeout render loop,
 * and pure-logic Node test exports.
 *
 * NOTE: online room multiplayer + server coin rewards are intentionally OUT OF
 * SCOPE for this build (deferred) — the game runs fully standalone.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var EMPTY = 0, BLACK = 1, WHITE = 2;   // BLACK = player (moves first by convention)
  var PAD = 30;                          // default outer padding (px)

  // Orthogonal directions only (NEVER diagonal — checklist & §4).
  // Each: [dr, dc]. Jumps step TWO cells in one of these directions.
  var DIRS = [
    { dr: -1, dc: 0 },   // up
    { dr: 1,  dc: 0 },   // down
    { dr: 0,  dc: -1 },  // left
    { dr: 0,  dc: 1 }    // right
  ];

  // ── Board helpers (pure, N-parameterised so logic is Node-testable) ─────────
  function other(side) { return side === BLACK ? WHITE : BLACK; }

  function inBounds(N, r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

  function idx(N, r, c) { return r * N + c; }

  // The colour of a freshly-filled (untouched) cell. Black on the (r+c) even
  // diagonals, white on the odd ones — a perfect alternating checkerboard so
  // every black has only white orthogonal neighbours and vice versa.
  function startColour(r, c) { return ((r + c) % 2 === 0) ? BLACK : WHITE; }

  // A completely full board for the given size.
  function fullBoard(N) {
    var board = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) board.push(startColour(r, c));
    }
    return board;
  }

  function countOnBoard(board, side) {
    var n = 0;
    for (var i = 0; i < board.length; i++) if (board[i] === side) n++;
    return n;
  }

  // ── Opening removal sets (§4 — RESTRICTED opening) ──────────────────────────
  // BLACK's first move removes ONE of its own pieces from a RESTRICTED set:
  // a corner cell OR a cell of the central 2×2 block — whichever are black.
  function isCorner(N, r, c) {
    return (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
  }
  function isCentre(N, r, c) {
    var lo = N / 2 - 1, hi = N / 2; // central 2×2 block rows/cols
    return (r === lo || r === hi) && (c === lo || c === hi);
  }

  // Legal opening-removal cells for BLACK: black-coloured cells that are a
  // corner OR in the central 2×2 block. (On both 8×8 and 6×6 exactly the two
  // black corners + the two black centre cells qualify — 4 options.)
  function openingBlackRemovals(N, board) {
    var out = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var i = idx(N, r, c);
        if (board[i] !== BLACK) continue;
        if (isCorner(N, r, c) || isCentre(N, r, c)) out.push(i);
      }
    }
    return out;
  }

  // After BLACK removes a piece, WHITE removes ONE white piece ORTHOGONALLY
  // ADJACENT to the just-emptied cell. (Always exists — the board alternates.)
  function openingWhiteRemovals(N, board, emptiedIdx) {
    var r0 = Math.floor(emptiedIdx / N), c0 = emptiedIdx % N;
    var out = [];
    for (var d = 0; d < DIRS.length; d++) {
      var r = r0 + DIRS[d].dr, c = c0 + DIRS[d].dc;
      if (!inBounds(N, r, c)) continue;
      var i = idx(N, r, c);
      if (board[i] === WHITE) out.push(i);
    }
    return out;
  }

  // ── Jump-move generation (§4 — must-jump, ortho-only, same-direction) ───────
  // A "move" is a single piece taking 1..k hops in ONE orthogonal direction:
  //   { from, dir, hops, path:[...landing indices], captures:[...jumped indices], to }
  // Each hop requires the (enemy-then-empty) pattern: an enemy on the adjacent
  // cell and an EMPTY cell immediately beyond it, both in the SAME direction.

  // All maximal-or-partial jump moves for `side` from a single origin `from`.
  // We enumerate every prefix length (>=1 hop) so a player MAY stop early.
  function jumpMovesFrom(N, board, from, side) {
    var moves = [];
    if (board[from] !== side) return moves;
    var foe = other(side);
    var r0 = Math.floor(from / N), c0 = from % N;

    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d].dr, dc = DIRS[d].dc;
      var r = r0, c = c0;
      var captures = [];
      var path = [];
      // Walk hop by hop in this single direction.
      while (true) {
        var er = r + dr, ec = c + dc;        // enemy cell
        var lr = r + 2 * dr, lc = c + 2 * dc; // landing cell
        if (!inBounds(N, lr, lc)) break;
        var ei = idx(N, er, ec), li = idx(N, lr, lc);
        if (board[ei] !== foe) break;         // need an enemy to jump
        if (board[li] !== EMPTY) break;       // need an empty landing
        captures.push(ei);
        path.push(li);
        // A valid move ending here (>=1 capture).
        moves.push({
          from: from,
          dir: d,
          hops: path.length,
          path: path.slice(),
          captures: captures.slice(),
          to: li
        });
        // Continue the multi-jump from the landing cell, SAME direction only.
        r = lr; c = lc;
      }
    }
    return moves;
  }

  // All legal jump moves for the side to move across the whole board.
  function allJumpMoves(N, board, side) {
    var moves = [];
    for (var i = 0; i < board.length; i++) {
      if (board[i] !== side) continue;
      var fm = jumpMovesFrom(N, board, i, side);
      for (var k = 0; k < fm.length; k++) moves.push(fm[k]);
    }
    return moves;
  }

  // Does `side` have at least one legal jump on `board`?
  function hasAnyJump(N, board, side) {
    for (var i = 0; i < board.length; i++) {
      if (board[i] !== side) continue;
      var r0 = Math.floor(i / N), c0 = i % N;
      var foe = other(side);
      for (var d = 0; d < DIRS.length; d++) {
        var er = r0 + DIRS[d].dr, ec = c0 + DIRS[d].dc;
        var lr = r0 + 2 * DIRS[d].dr, lc = c0 + 2 * DIRS[d].dc;
        if (!inBounds(N, lr, lc)) continue;
        if (board[idx(N, er, ec)] === foe && board[idx(N, lr, lc)] === EMPTY) return true;
      }
    }
    return false;
  }

  // Count of distinct legal jump moves (mobility proxy) — counts every legal
  // prefix length, matching the move set the player can actually choose from.
  function mobility(N, board, side) {
    return allJumpMoves(N, board, side).length;
  }

  // Apply a jump move to a board (mutates): clear origin, remove all captured
  // enemy pieces, place the mover on the final landing cell.
  function applyJump(N, board, move, side) {
    board[move.from] = EMPTY;
    for (var k = 0; k < move.captures.length; k++) board[move.captures[k]] = EMPTY;
    board[move.to] = side;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var vsAI = true;            // vs-AI (default). false = local 2-player hotseat.
  var humanSide = BLACK;      // human's side in vs-AI mode (player moves first)
  var boardSize = 8;          // 8 (standard) or 6 (quick)
  var gameVersion = 0;
  var state;

  // Online room state (set by initRoomMode when launched inside a Room iframe).
  // myPlayer is the side this client controls (seat 0 → BLACK, the first mover).
  var vsRoom = false, mySeat = -1, myPlayer = BLACK;

  // Can the LOCAL player act on the current turn right now?
  //   online → only on this client's side (myPlayer)
  //   vs-AI  → only on the human's side
  //   hotseat→ always (whoever's turn it is shares the device)
  function canActNow() {
    if (vsRoom) return state.turn === myPlayer;
    if (vsAI) return state.turn === humanSide;
    return true;
  }

  function freshState(N) {
    return {
      N:          N,
      board:      fullBoard(N),
      turn:       BLACK,          // black moves first
      phase:      'open-black',   // 'open-black' | 'open-white' | 'play' | 'over'
      openEmpty:  null,           // index BLACK emptied (used by white's removal)
      selected:   null,           // selected board index (play) or null
      lastMove:   null,           // { from, to, captures:[...] } for highlight
      winner:     null,           // 'black' | 'white' | null
      history:    [],
      aiThinking: false
    };
  }

  // ── Terminal detection (§4 — no legal jump = loss; no draws) ────────────────
  // Returns 'black' | 'white' | null. Evaluated for the side ABOUT TO MOVE in
  // the play phase. The side to move with no legal jump LOSES.
  function checkTerminal(st) {
    if (st.phase !== 'play') return null;
    if (!hasAnyJump(st.N, st.board, st.turn)) {
      return st.turn === BLACK ? 'white' : 'black';
    }
    return null;
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────
  var cnv, ctx;

  // Lava-and-coral palette (canvas may use literal colours; checklist #5 exception).
  var C = {
    bg:        '#1A130E',   // dark surround
    grain1:    'rgba(120,86,52,0.18)',
    grain2:    'rgba(60,40,24,0.30)',
    stone:     '#4A3526',   // lava-stone board plate
    stoneHi:   '#6B4C34',
    stoneLo:   '#2E2014',
    holeRim:   '#1C1208',   // depression rim
    holeFill:  '#352616',   // empty depression
    grid:      'rgba(231,196,140,0.30)',
    black:     '#1C1714',   // black lava pebble
    blackHi:   '#4A413B',
    blackRim:  '#0C0A08',
    white:     '#F2EAD8',   // white coral pebble
    whiteHi:   '#FFFDF6',
    whiteRim:  '#B9A87E',
    selected:  '#E8A013',   // saffron glow
    validDot:  'rgba(120,190,140,0.80)',
    legalRing: 'rgba(232,160,19,0.85)',
    lastMove:  'rgba(232,160,19,0.55)',
    capX:      'rgba(206,86,52,0.9)'
  };

  // Canvas centre of cell (r,c). x = padX + (c+0.5)*cell ; y = padY + (r+0.5)*cell.
  function cellXY(r, c) {
    return {
      x: state.padX + (c + 0.5) * state.cell,
      y: state.padY + (r + 0.5) * state.cell
    };
  }

  // Map an event to a board cell {r,c,i} via floor((x-padX)/cell) etc., else null.
  function cellFromEvent(e) {
    var rect = cnv.getBoundingClientRect();
    var scaleX = cnv.width / rect.width;
    var scaleY = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top) * scaleY;
    var c = Math.floor((x - state.padX) / state.cell);
    var r = Math.floor((y - state.padY) / state.cell);
    if (!inBounds(state.N, r, c)) return null;
    return { r: r, c: c, i: idx(state.N, r, c) };
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
    var N = state.N, cs = state.cell;
    var pr = cs * 0.34; // pebble radius

    ctx.clearRect(0, 0, cnv.width, cnv.height);

    // Dark surround + grain
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var gy = 0; gy < cnv.height; gy += 11) ctx.fillRect(0, gy, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var gx = 0; gx < cnv.width; gx += 26) ctx.fillRect(gx, 0, 3, cnv.height);

    // Lava-stone board plate (papamū)
    var bx = state.padX - cs * 0.30, by = state.padY - cs * 0.30;
    var bw = N * cs + cs * 0.60, bh = N * cs + cs * 0.60;
    ctx.fillStyle = C.stone;
    drawRoundRect(bx, by, bw, bh, 14); ctx.fill();
    ctx.save();
    drawRoundRect(bx, by, bw, bh, 14); ctx.clip();
    // mottled lava texture
    ctx.fillStyle = 'rgba(20,12,6,0.20)';
    for (var t = 0; t < 7; t++) {
      ctx.fillRect(bx, by + bh * (t / 7) + (t % 2 ? 2 : 0), bw, t % 2 === 0 ? 3 : 2);
    }
    ctx.fillStyle = C.stoneHi;
    ctx.globalAlpha = 0.12;
    drawRoundRect(bx + 3, by + 3, bw - 6, bh * 0.18, 10); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.stoneLo;
    drawRoundRect(bx, by, bw, bh, 14); ctx.stroke();

    // Faint papamū grid lines (the filled grid of depressions)
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (var k = 0; k <= N; k++) {
      var gxp = state.padX + k * cs;
      ctx.beginPath(); ctx.moveTo(gxp, state.padY); ctx.lineTo(gxp, state.padY + N * cs); ctx.stroke();
      var gyp = state.padY + k * cs;
      ctx.beginPath(); ctx.moveTo(state.padX, gyp); ctx.lineTo(state.padX + N * cs, gyp); ctx.stroke();
    }

    // Depressions (every cell has a carved hole) + pebbles on filled cells.
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var i = idx(N, r, c);
        var p = cellXY(r, c);
        // depression
        ctx.beginPath();
        ctx.arc(p.x, p.y, cs * 0.40, 0, Math.PI * 2);
        ctx.fillStyle = C.holeFill;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = C.holeRim;
        ctx.stroke();
        if (state.board[i] !== EMPTY) {
          drawPebble(p.x, p.y, pr, state.board[i], i === state.selected);
        }
      }
    }

    // Last-move trail: captured cells get an X, destination gets a ring.
    if (state.lastMove) {
      var lm = state.lastMove;
      if (lm.captures) {
        for (var ci = 0; ci < lm.captures.length; ci++) {
          var cap = cellXY(Math.floor(lm.captures[ci] / N), lm.captures[ci] % N);
          ctx.strokeStyle = C.capX;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(cap.x - pr * 0.5, cap.y - pr * 0.5);
          ctx.lineTo(cap.x + pr * 0.5, cap.y + pr * 0.5);
          ctx.moveTo(cap.x + pr * 0.5, cap.y - pr * 0.5);
          ctx.lineTo(cap.x - pr * 0.5, cap.y + pr * 0.5);
          ctx.stroke();
        }
      }
      if (lm.to != null) {
        var dst = cellXY(Math.floor(lm.to / N), lm.to % N);
        ctx.beginPath();
        ctx.arc(dst.x, dst.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.lastMove;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Interaction hints (legal removals / selectable movers / destinations).
    drawHints(pr);
  }

  function drawPebble(x, y, r, side, sel) {
    // shadow
    ctx.beginPath();
    ctx.ellipse(x + 1.4, y + 2.4, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.36, r * 0.1, x, y, r);
    if (side === BLACK) {
      g.addColorStop(0, C.blackHi);
      g.addColorStop(0.5, C.black);
      g.addColorStop(1, '#0E0B09');
    } else {
      g.addColorStop(0, C.whiteHi);
      g.addColorStop(0.55, C.white);
      g.addColorStop(1, '#D9CCAC');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = side === BLACK ? C.blackRim : C.whiteRim;
    ctx.stroke();
    // glossy speck
    ctx.beginPath();
    ctx.arc(x - r * 0.30, y - r * 0.32, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = side === BLACK ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.65)';
    ctx.fill();
    if (sel) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // Compute + draw the highlight set for the human's current interaction.
  function drawHints(pr) {
    if (state.winner || state.phase === 'over') return;
    if (!canActNow() || state.aiThinking) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    var N = state.N;

    // Opening: highlight legal removal cells.
    if (state.phase === 'open-black' || state.phase === 'open-white') {
      var rem = state.phase === 'open-black'
        ? openingBlackRemovals(N, state.board)
        : openingWhiteRemovals(N, state.board, state.openEmpty);
      for (var ri = 0; ri < rem.length; ri++) {
        var rp = cellXY(Math.floor(rem[ri] / N), rem[ri] % N);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.legalRing;
        ctx.lineWidth = 2.8;
        ctx.stroke();
      }
      return;
    }

    // Play: if a mover is selected, show its destinations; else ring movable pieces.
    if (state.phase === 'play') {
      if (state.selected != null) {
        var dests = jumpMovesFrom(N, state.board, state.selected, state.turn);
        var seen = {};
        for (var di = 0; di < dests.length; di++) {
          var to = dests[di].to;
          if (seen[to]) continue; seen[to] = true;
          var dp = cellXY(Math.floor(to / N), to % N);
          ctx.beginPath();
          ctx.arc(dp.x, dp.y, pr * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = C.validDot;
          ctx.fill();
        }
      } else {
        var moves = allJumpMoves(N, state.board, state.turn);
        var froms = {};
        for (var mi = 0; mi < moves.length; mi++) froms[moves[mi].from] = true;
        for (var f in froms) {
          if (!froms.hasOwnProperty(f)) continue;
          var fp = cellXY(Math.floor(f / N), f % N);
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, pr + 3, 0, Math.PI * 2);
          ctx.strokeStyle = C.legalRing;
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
      }
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elModeToggle, elModeWrap, elSizeToggle, elSizeWrap;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function sideName(side) { return side === BLACK ? 'Black' : 'White'; }

  function updateScore() {
    if (!elScore) return;
    var b = countOnBoard(state.board, BLACK), w = countOnBoard(state.board, WHITE);
    var dotBlack = '<span aria-hidden="true" style="display:inline-block;width:.62em;height:.62em;border-radius:50%;background:#1C1714;box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);vertical-align:-0.02em;margin-right:.35em;"></span>';
    var dotWhite = '<span aria-hidden="true" style="display:inline-block;width:.62em;height:.62em;border-radius:50%;background:#F2EAD8;box-shadow:inset 0 0 0 1px #B9A87E;vertical-align:-0.02em;margin-right:.35em;"></span>';
    elScore.innerHTML =
      '<span class="kn-score__black">' + dotBlack + 'Black &middot; ' + b + ' stones</span>' +
      '<span class="kn-score__white">' + dotWhite + 'White &middot; ' + w + ' stones</span>';
  }

  function phaseHint() {
    if (state.phase === 'open-black') return 'Opening: remove one black stone from a highlighted corner or centre cell.';
    if (state.phase === 'open-white') return 'Opening: remove one white stone next to the empty space.';
    if (state.selected != null) return 'Tap a green dot to jump; tap the stone again to deselect.';
    return 'Tap one of your highlighted stones to jump an adjacent enemy.';
  }

  function turnStatus() {
    var hint = phaseHint();
    if (vsRoom) {
      return (state.turn === myPlayer ? 'Your turn. ' : 'Opponent’s turn. ') + hint;
    }
    if (!vsAI) {
      return (state.turn === BLACK ? 'Black’s turn (Player 1). ' : 'White’s turn (Player 2). ') + hint;
    }
    if (state.turn === humanSide) return 'Your turn (Black). ' + hint;
    return 'Computer’s turn (White). ' + hint;
  }

  // ── Human interaction ──────────────────────────────────────────────────────
  function humanClick(cell) {
    if (!cell) return;
    if (state.winner || state.phase === 'over') return;
    if (state.aiThinking) return;
    if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return;
    if (!canActNow()) return;   // online: blocks input when it is not myPlayer's turn
    if (window.CGTutorial && CGTutorial.isActive) return;

    var N = state.N, i = cell.i;

    // Opening — black removal.
    if (state.phase === 'open-black') {
      if (openingBlackRemovals(N, state.board).indexOf(i) !== -1) commitOpenBlack(i);
      return;
    }
    // Opening — white removal (only reached in hotseat; AI auto-resolves in vs-AI).
    if (state.phase === 'open-white') {
      if (openingWhiteRemovals(N, state.board, state.openEmpty).indexOf(i) !== -1) commitOpenWhite(i);
      return;
    }

    // Play phase.
    if (state.phase !== 'play') return;
    var side = state.turn, b = state.board;

    if (state.selected == null) {
      if (b[i] === side && jumpMovesFrom(N, b, i, side).length) { state.selected = i; render(); }
      return;
    }
    if (i === state.selected) { state.selected = null; render(); return; }
    if (b[i] === side && jumpMovesFrom(N, b, i, side).length) { state.selected = i; render(); return; }

    // Choose the move from selected→i. Prefer the LONGEST same-direction jump
    // that lands on i (a clicked far landing implies taking all hops to it).
    var candidates = jumpMovesFrom(N, b, state.selected, side).filter(function (m) {
      return m.to === i;
    });
    if (!candidates.length) { state.selected = null; render(); return; }
    candidates.sort(function (a, bb) { return bb.hops - a.hops; });
    var sel = state.selected;
    state.selected = null;
    commitPlay(candidates[0]);
  }

  // ── Commit helpers ──────────────────────────────────────────────────────────
  function snapshot() {
    return {
      board:     state.board.slice(),
      turn:      state.turn,
      phase:     state.phase,
      openEmpty: state.openEmpty,
      lastMove:  state.lastMove
    };
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
  }

  function commitOpenBlack(i) {
    pushHistory();
    state.board[i] = EMPTY;
    state.openEmpty = i;
    state.lastMove = { from: null, to: null, captures: [i] };
    state.phase = 'open-white';
    state.turn = WHITE;
    updateScore();
    render();
    if (vsRoom) { setStatus(turnStatus()); syncRoom(); return; } // broadcast → seat 1 makes the white removal
    if (vsAI && state.turn !== humanSide) {
      state.aiThinking = true;
      setStatus('Computer removes a coral stone…');
      scheduleAIOpenWhite();
    } else {
      setStatus(turnStatus());
    }
  }

  function commitOpenWhite(i) {
    pushHistory();
    state.board[i] = EMPTY;
    state.lastMove = { from: null, to: null, captures: [i] };
    state.openEmpty = null;
    state.phase = 'play';
    state.turn = BLACK;
    afterHandoff();
  }

  function commitPlay(move) {
    pushHistory();
    var side = state.turn;
    applyJump(state.N, state.board, move, side);
    state.lastMove = { from: move.from, to: move.to, captures: move.captures.slice() };
    state.selected = null;
    state.turn = other(side);
    afterHandoff();
  }

  // Update score, check terminal, hand off to AI if needed.
  function afterHandoff() {
    updateScore();
    var winner = checkTerminal(state);
    if (winner) { endGame(winner); return; }
    render();
    if (vsRoom) { setStatus(turnStatus()); syncRoom(); return; } // broadcast the committed move
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

    var localSide = vsRoom ? myPlayer : (vsAI ? humanSide : null);
    var localWon = localSide !== null &&
      ((winner === 'black' && localSide === BLACK) || (winner === 'white' && localSide === WHITE));

    if (localSide === null) { // hotseat
      setStatus(winner === 'black'
        ? 'Black wins! White has no legal jump — last to move wins.'
        : 'White wins! Black has no legal jump — last to move wins.');
    } else if (localWon) {
      setStatus(vsRoom
        ? 'You win! Your opponent has no legal jump left.'
        : 'You win! The computer has no legal jump left.');
    } else {
      setStatus(vsRoom
        ? 'Your opponent wins — you have no legal jump. Last to move wins in Kōnane.'
        : 'The computer wins — you have no legal jump. Last to move wins in Kōnane.');
    }

    var result = localWon ? 'win' : 'loss';
    if (vsRoom) {
      syncRoom(); // broadcast the final board + report the winner seat (RoomBridge records stats/coins)
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({ gameId: 'konane', result: result, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()) });
      }
      return;
    }
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
      Auth.recordResult('konane', result);
    }
    if (vsAI && window.Achievements && Achievements.evaluate) {
      Achievements.evaluate({ gameId: 'konane', result: result });
    }
  }

  // ── Online room sync (RoomBridge — full-blob source of truth; yote pattern) ──
  // The blob carries EVERY field that defines the visible board + whose turn +
  // phase + opening-empty cell + last-move highlight + winner. selected /
  // aiThinking / history are local-only and intentionally NOT synced.
  function serializeRoom() {
    return {
      N:          state.N,
      board:      state.board.slice(),
      turn:       state.turn,
      phase:      state.phase,
      openEmpty:  state.openEmpty,
      lastMove:   state.lastMove,
      winner:     state.winner,
      last_actor: 'room:' + mySeat
    };
  }

  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeRoom());
    if (state.winner === 'black' || state.winner === 'white') {
      RoomBridge.reportWin(state.winner === 'black' ? 0 : 1); // seat 0 = black (first), 1 = white
    }
  }

  function receiveRoomState(blob) {
    if (!blob) return;
    if (blob.last_actor === 'room:' + mySeat) return; // suppress our own echoed update
    if (blob.N && blob.N !== state.N) { state.N = blob.N; layoutFromCanvas(); }
    state.board     = blob.board.slice();
    state.turn      = blob.turn;
    state.phase     = blob.phase;
    state.openEmpty = (blob.openEmpty != null) ? blob.openEmpty : null;
    state.lastMove  = blob.lastMove || null;
    state.selected  = null;
    state.aiThinking = false;
    state.winner    = blob.winner || null;
    updateScore();
    if (state.winner) {
      state.phase = 'over';
      var localWon = (state.winner === 'black' && myPlayer === BLACK) ||
                     (state.winner === 'white' && myPlayer === WHITE);
      if (localWon) setStatus('You win! Your opponent has no legal jump left.');
      else setStatus('Your opponent wins — you have no legal jump. Last to move wins in Kōnane.');
    } else {
      setStatus(turnStatus());
    }
    render();
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true;
    vsAI = false;
    mySeat = RoomBridge.getSeat();
    myPlayer = (mySeat === 0) ? BLACK : WHITE; // seat 0 moves first (black)
    gameVersion++;                              // invalidate any pending AI timer
    state.aiThinking = false;
    // Hide solo-only controls; online rematch is driven by the room's Play Again.
    if (elModeWrap)  elModeWrap.style.display  = 'none';
    if (elSizeWrap)  elSizeWrap.style.display  = 'none';
    if (elNewBtn)    elNewBtn.style.display    = 'none';
    RoomBridge.onState(receiveRoomState);   // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();            // host seeds the initial full board + black's opening turn
    updateScore();
    setStatus(turnStatus());
  }

  // ── AI (mobility-dominant minimax / alpha-beta — §5) ────────────────────────
  // Eval from `me`'s perspective: MOBILITY (my legal-move count − opp's) is the
  // dominant Kōnane heuristic (the loser is whoever runs out of moves), plus a
  // smaller material term.
  function evaluate(N, board, me) {
    var foe = other(me);
    var myMob = mobility(N, board, me);
    var foeMob = mobility(N, board, foe);
    var myMat = countOnBoard(board, me);
    var foeMat = countOnBoard(board, foe);
    return (myMob - foeMob) * 10 + (myMat - foeMat) * 2;
  }

  // Terminal score from `me`'s view, or null if non-terminal. The side TO MOVE
  // with no jump loses.
  function terminalScore(N, board, toMove, me, depth) {
    if (!hasAnyJump(N, board, toMove)) {
      // toMove loses.
      return toMove === me ? -100000 - depth : 100000 + depth;
    }
    return null;
  }

  // Negamax-style alpha-beta over jump moves. `toMove` is the side on turn.
  function search(N, board, toMove, me, depth, alpha, beta) {
    var term = terminalScore(N, board, toMove, me, depth);
    if (term !== null) return term;
    if (depth === 0) return evaluate(N, board, me);

    var moves = allJumpMoves(N, board, toMove);
    // (moves is guaranteed non-empty here: terminalScore returned null.)
    var maximizing = (toMove === me);
    var i, val;
    if (maximizing) {
      var best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        var nb = board.slice();
        applyJump(N, nb, moves[i], toMove);
        val = search(N, nb, other(toMove), me, depth - 1, alpha, beta);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (i = 0; i < moves.length; i++) {
        var nb2 = board.slice();
        applyJump(N, nb2, moves[i], toMove);
        val = search(N, nb2, other(toMove), me, depth - 1, alpha, beta);
        if (val < worst) worst = val;
        if (worst < beta) beta = worst;
        if (alpha >= beta) break;
      }
      return worst;
    }
  }

  // Pick the AI's best legal jump for the side to move on `board`.
  // Depth-capped (shallower on 8×8 for phone responsiveness). Returns a move or null.
  function getBestMove(N, board, toMove) {
    var moves = allJumpMoves(N, board, toMove);
    if (!moves.length) return null;

    // Adaptive depth + node budget. 8×8 branches widely → shallower; 6×6 deeper.
    var depth = (N >= 8) ? 4 : 5;
    if (moves.length > 24 && depth > 3) depth = 3;
    if (moves.length > 60) depth = 2;

    var bestVal = -Infinity, bestMoves = [];
    for (var i = 0; i < moves.length; i++) {
      var nb = board.slice();
      applyJump(N, nb, moves[i], toMove);
      var val = search(N, nb, other(toMove), toMove, depth - 1, -Infinity, Infinity);
      if (val > bestVal + 0.0001) { bestVal = val; bestMoves = [moves[i]]; }
      else if (val >= bestVal - 0.0001) bestMoves.push(moves[i]);
    }
    // Variety among equally-good moves (render path stays deterministic).
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // AI's opening white removal: pick the removal that best preserves its mobility.
  function bestOpenWhite(N, board, emptied) {
    var rem = openingWhiteRemovals(N, board, emptied);
    if (!rem.length) return null;
    var best = rem[0], bestVal = -Infinity;
    for (var i = 0; i < rem.length; i++) {
      var nb = board.slice();
      nb[rem[i]] = EMPTY;
      // After this, BLACK is to move; evaluate from WHITE's perspective.
      var v = evaluate(N, nb, WHITE);
      if (v > bestVal) { bestVal = v; best = rem[i]; }
    }
    return best;
  }

  function scheduleAIOpenWhite() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var pick = bestOpenWhite(state.N, state.board, state.openEmpty);
      state.aiThinking = false;
      if (pick == null) { // impossible (alternating board guarantees one) — guard
        // fall back to any white adjacent; if truly none, BLACK simply proceeds
        state.phase = 'play'; state.turn = BLACK; state.openEmpty = null;
        afterHandoff();
        return;
      }
      pushHistory();
      state.board[pick] = EMPTY;
      state.lastMove = { from: null, to: null, captures: [pick] };
      state.openEmpty = null;
      state.phase = 'play';
      state.turn = BLACK;
      afterHandoff();
    }, 430);
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var move = getBestMove(state.N, state.board, state.turn);
      state.aiThinking = false;
      if (!move) { // AI has no jump → AI loses
        endGame(state.turn === BLACK ? 'white' : 'black');
        return;
      }
      pushHistory();
      var side = state.turn;
      applyJump(state.N, state.board, move, side);
      state.lastMove = { from: move.from, to: move.to, captures: move.captures.slice() };
      state.turn = other(side);
      afterHandoff();
    }, 430);
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    state = freshState(boardSize);
    layoutFromCanvas();
    updateScore();
    setStatus(turnStatus());
    render();
    // Black (player) always opens, so no AI kickoff needed at game start.
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
    if (state.phase === 'over') state.phase = 'play';
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    setStatus(turnStatus());
    render();
  }

  function restoreSnap(s) {
    state.board     = s.board.slice();
    state.turn      = s.turn;
    state.phase     = s.phase;
    state.openEmpty = s.openEmpty;
    state.lastMove  = s.lastMove;
  }

  // ── Init / resize ──────────────────────────────────────────────────────────
  function layoutFromCanvas() {
    if (!cnv) return;
    var N = state.N;
    var size = Math.min(cnv.width, cnv.height);
    var cell = Math.floor((size - PAD * 2) / N);
    if (cell < 18) cell = 18;
    state.cell = cell;
    var boardPx = cell * N;
    state.padX = Math.max(PAD, Math.round((cnv.width - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((cnv.height - boardPx) / 2));
  }

  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('kn-board-wrap');
    if (!wrap || !cnv) return;
    var w = Math.max(280, Math.min(wrap.clientWidth, 620));
    cnv.width = w;
    cnv.height = w; // square board
    layoutFromCanvas();
    render();
  }

  function init() {
    cnv = document.getElementById('kn-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus     = document.getElementById('kn-status');
    elScore      = document.getElementById('kn-score');
    elNewBtn     = document.getElementById('kn-new-btn');
    elModeToggle = document.getElementById('kn-ai-toggle');
    elModeWrap   = document.getElementById('kn-mode-label');
    elSizeToggle = document.getElementById('kn-size-toggle');
    elSizeWrap   = document.getElementById('kn-size-label');

    state = freshState(boardSize);
    state.cell = 60; state.padX = PAD; state.padY = PAD;

    cnv.addEventListener('click', function (e) {
      humanClick(cellFromEvent(e));
    });
    cnv.addEventListener('touchend', function (e) {
      e.preventDefault();
      humanClick(cellFromEvent(e));
    }, { passive: false });

    if (elNewBtn) elNewBtn.addEventListener('click', newGame);
    if (elModeToggle) {
      elModeToggle.addEventListener('change', function () {
        vsAI = elModeToggle.checked;
        var span = elModeWrap && elModeWrap.querySelector('span');
        if (span) span.textContent = vsAI ? 'vs Computer' : '2 Players';
        newGame();
      });
    }
    if (elSizeToggle) {
      elSizeToggle.addEventListener('change', function () {
        boardSize = elSizeToggle.checked ? 6 : 8;
        var span = elSizeWrap && elSizeWrap.querySelector('span');
        if (span) span.textContent = boardSize === 6 ? '6×6 quick' : '8×8 board';
        newGame();
      });
    }

    window.addEventListener('resize', sizeToWrap);
    window.cgMobileResize = sizeToWrap;

    if (window.Achievements && Achievements.init) Achievements.init();
    if (window.CGTutorial) CGTutorial.initTrigger('konane');
    if (window.PWF) try { PWF.init('konane'); } catch (e) {}

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
          // Legal move objects for the side to move, by phase.
          legal: function () {
            if (state.winner || state.phase === 'over') return [];
            var N = state.N;
            if (state.phase === 'open-black') {
              return openingBlackRemovals(N, state.board).map(function (i) { return { remove: i }; });
            }
            if (state.phase === 'open-white') {
              return openingWhiteRemovals(N, state.board, state.openEmpty).map(function (i) { return { remove: i }; });
            }
            if (state.phase === 'play') {
              return allJumpMoves(N, state.board, state.turn);
            }
            return [];
          },
          // Apply a move object through the SAME gated commit path a real tap uses.
          play: function (mv) {
            if (!mv) return false;
            if (state.winner || state.phase === 'over' || state.aiThinking) return false;
            if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return false;
            if (!canActNow()) return false; // turn-gating exercised here
            var N = state.N;
            if (state.phase === 'open-black') {
              if (openingBlackRemovals(N, state.board).indexOf(mv.remove) === -1) return false;
              commitOpenBlack(mv.remove); return true;
            }
            if (state.phase === 'open-white') {
              if (openingWhiteRemovals(N, state.board, state.openEmpty).indexOf(mv.remove) === -1) return false;
              commitOpenWhite(mv.remove); return true;
            }
            if (state.phase === 'play') {
              var ok = jumpMovesFrom(N, state.board, mv.from, state.turn).some(function (m) {
                return m.to === mv.to && m.dir === mv.dir && m.hops === mv.hops;
              });
              if (!ok) return false;
              commitPlay(mv); return true;
            }
            return false;
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
    CGTutorial.register('konane', [
      {
        target: '#kn-canvas',
        title: 'The Papamū',
        body: 'Kōnane begins with the board completely full — black lava stones and white coral stones in a checkerboard. You play black; the computer plays white.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#kn-canvas',
        title: 'The Opening',
        body: 'Black removes one of its own stones from a highlighted corner or centre cell, then White removes one of its stones next to that empty space. Now play begins.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#kn-canvas',
        title: 'Jump to Capture',
        body: 'Every move is a jump: hop one of your stones straight over an adjacent enemy into the empty space just beyond, removing the stone you jumped. Jumps are orthogonal only — never diagonal.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#kn-canvas',
        title: 'Multi-Jumps',
        body: 'You may keep jumping with the same stone in the SAME straight line, as long as an enemy-then-empty pattern continues. You can stop after any jump, but every turn must capture at least one stone.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#kn-canvas',
        title: 'Last to Move Wins',
        body: 'When the player to move has no legal jump, they lose. There are no draws — keep your options open and starve your opponent of moves.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#kn-new-btn',
        title: 'New Game',
        body: 'Start fresh any time. Toggle between vs Computer and 2 Players, and between the 8×8 board and the quicker 6×6 board.',
        position: 'left', highlight: true, beforeStep: null, afterStep: null
      }
    ]);
    CGTutorial.initTrigger('konane');
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
    var N = state.N;
    var size = Math.min(availW, availH);
    var newCell = Math.floor((size - PAD * 2) / N);
    if (newCell < 18) newCell = 18;
    state.cell = newCell;
    var boardPx = newCell * N;
    state.padX = Math.max(PAD, Math.round((availW - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((availH - boardPx) / 2));
    cnv.width = availW;
    cnv.height = availH;
    render();
  };

  // ── Expose pure logic for headless tests (Node) ─────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, DIRS: DIRS,
      other: other, inBounds: inBounds, idx: idx, startColour: startColour,
      fullBoard: fullBoard, countOnBoard: countOnBoard,
      isCorner: isCorner, isCentre: isCentre,
      openingBlackRemovals: openingBlackRemovals, openingWhiteRemovals: openingWhiteRemovals,
      jumpMovesFrom: jumpMovesFrom, allJumpMoves: allJumpMoves,
      hasAnyJump: hasAnyJump, mobility: mobility, applyJump: applyJump,
      freshState: freshState, checkTerminal: checkTerminal,
      evaluate: evaluate, terminalScore: terminalScore, search: search,
      getBestMove: getBestMove, bestOpenWhite: bestOpenWhite
    };
  }

}());
