/**
 * mu-torere.js — Mū Tōrere, one of the very few board games the Māori are
 * documented to have played before European contact (associated especially with
 * the Ngāti Porou of the East Coast of Aotearoa New Zealand). Played on an
 * eight-pointed star: eight outer arms (kewai) around a centre (pūtahi). Four
 * black pieces vs four white; the centre starts empty. A player who cannot move
 * loses. Mathematically the game is SOLVED — with perfect play it is a draw —
 * so a flawless AI never loses but is a boring wall, hence three difficulty
 * tiers (Easy beatable / Medium default / Hard near-perfect).
 *
 * Canvas-rendered, vs-AI single player + local hotseat. Difficulty selector.
 * Prefix: mt-  Key: mu-torere
 *
 * Structurally a sibling of js/games/morabaraba.js + js/games/konane.js —
 * mirrors their module shape: canvas setup, state.padX/padY/cell + stored node
 * pixel positions, GameResize, minimax AI, hotseat toggle (canActNow),
 * self-rescheduling rAF+setTimeout render loop, and pure-logic Node test exports.
 *
 * NOTE: online room multiplayer + server coin rewards are intentionally OUT OF
 * SCOPE for this build (deferred) — the game runs fully standalone.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var EMPTY = 0, BLACK = 1, WHITE = 2;   // BLACK = player (moves first by convention)
  var PAD = 40;                          // default outer padding (px)

  // 9 nodes: 8 outer "kewai" indexed 0..7 clockwise + the centre "pūtahi" (= 8).
  var CENTRE = 8;
  var N = 9;
  var OUTERS = [0, 1, 2, 3, 4, 5, 6, 7];

  // The two ring-neighbours of an outer node i: (i+1)%8 and (i+7)%8.
  function ringNext(i) { return (i + 1) % 8; }
  function ringPrev(i) { return (i + 7) % 8; }

  // ── Adjacency (symmetric, verified in tests) ───────────────────────────────
  // outer i ↔ outer (i±1)%8, and outer i ↔ CENTRE. CENTRE ↔ all 8 outers.
  // Outer points do NOT connect to non-neighbour outers.
  var ADJ = (function () {
    var adj = [];
    for (var i = 0; i < 8; i++) {
      adj.push([ringPrev(i), ringNext(i), CENTRE]);
    }
    adj.push(OUTERS.slice()); // CENTRE adjacent to all 8 outers
    return adj;
  }());

  // Quick membership test for adjacency.
  function isAdjacent(a, b) {
    var list = ADJ[a];
    for (var i = 0; i < list.length; i++) if (list[i] === b) return true;
    return false;
  }

  // ── Board helpers (pure) ────────────────────────────────────────────────────
  function other(side) { return side === BLACK ? WHITE : BLACK; }

  function countOnBoard(board, side) {
    var n = 0;
    for (var i = 0; i < N; i++) if (board[i] === side) n++;
    return n;
  }

  // START position (§3): contiguous blocks. BLACK on {0,1,2,3}, WHITE on {4,5,6,7},
  // CENTRE empty. BLACK moves first.
  function startBoard() {
    var board = [];
    for (var i = 0; i < N; i++) board.push(EMPTY);
    board[0] = BLACK; board[1] = BLACK; board[2] = BLACK; board[3] = BLACK;
    board[4] = WHITE; board[5] = WHITE; board[6] = WHITE; board[7] = WHITE;
    board[CENTRE] = EMPTY;
    return board;
  }

  // ── Rules (§4) ──────────────────────────────────────────────────────────────
  // The centre-entry adjacency rule. `centreAlways` (default true) applies the
  // restriction on EVERY centre entry; the optional variant restricts only the
  // first two plies (ply 0 and 1).
  var centreAlways = true;

  // May `side` legally move the piece at outer node `i` into the (empty) centre,
  // given the board and the current ply count? Legal ONLY if a ring-neighbour of
  // i ((i±1)%8) holds an ENEMY piece. With the variant, the restriction only
  // applies while ply < 2; afterwards centre entry is unrestricted.
  function canEnterCentre(board, i, side, ply) {
    if (!centreAlways && ply >= 2) return true;
    var foe = other(side);
    return board[ringNext(i)] === foe || board[ringPrev(i)] === foe;
  }

  // All legal moves for `side` on `board` at the given `ply`. A move:
  //   { from, to }
  // Three move types:
  //   (a) outer i → adjacent outer (if empty) — always allowed.
  //   (b) outer i → CENTRE (if empty) — only if canEnterCentre.
  //   (c) CENTRE → any empty outer — always allowed.
  function legalMovesFor(board, side, ply) {
    var moves = [];
    for (var i = 0; i < N; i++) {
      if (board[i] !== side) continue;
      if (i === CENTRE) {
        // (c) centre → any empty outer.
        for (var k = 0; k < OUTERS.length; k++) {
          var o = OUTERS[k];
          if (board[o] === EMPTY) moves.push({ from: CENTRE, to: o });
        }
      } else {
        // (a) outer → adjacent empty outer.
        var nx = ringNext(i), pv = ringPrev(i);
        if (board[nx] === EMPTY) moves.push({ from: i, to: nx });
        if (board[pv] === EMPTY) moves.push({ from: i, to: pv });
        // (b) outer → centre, gated by the centre-entry rule.
        if (board[CENTRE] === EMPTY && canEnterCentre(board, i, side, ply)) {
          moves.push({ from: i, to: CENTRE });
        }
      }
    }
    return moves;
  }

  // Apply a move to a board (mutates). Pure mover swap.
  function applyMoveToBoard(board, move, side) {
    board[move.from] = EMPTY;
    board[move.to] = side;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var vsAI = true;            // vs-AI (default). false = local 2-player hotseat.
  var humanSide = BLACK;      // human's side in vs-AI mode (player moves first)
  var difficulty = 'medium';  // 'easy' | 'medium' | 'hard'
  var DRAW_PLIES = 60;        // turn-cap: this many plies with no win → draw
  var gameVersion = 0;
  var state;

  // Online room state (set by initRoomMode when launched inside a Room iframe).
  // seat 0 = first player (BLACK, moves first); seat 1 = second player (WHITE).
  var vsRoom = false, mySeat = -1, myPlayer = BLACK;

  // Can the LOCAL player act on the current turn right now?
  //   online → only on my seat's side
  //   vs-AI  → only on the human's side
  //   hotseat→ always (whoever's turn it is shares the device)
  function canActNow() {
    if (vsRoom) return state.turn === myPlayer;
    if (vsAI) return state.turn === humanSide;
    return true;
  }

  function freshState() {
    return {
      board:    startBoard(),
      turn:     BLACK,          // black moves first
      ply:      0,              // total plies played (for the variant rule)
      selected: null,           // selected board index (or null)
      lastMove: null,           // { from, to } for highlight
      winner:   null,           // 'black' | 'white' | 'draw' | null
      repeat:   {},             // position-key → repetition count (3× = draw)
      history:  [],
      aiThinking: false,
      cell:     80,             // outer-ring radius (derived in layout)
      padX:     PAD,
      padY:     PAD,
      nodes:    []              // stored node pixel positions (recomputed on resize)
    };
  }

  // A compact key of the position (board + side to move) for repetition draws.
  function positionKey(board, turn) {
    return board.join('') + '|' + turn;
  }

  // ── Terminal detection (§4) ─────────────────────────────────────────────────
  // Returns 'black' | 'white' | 'draw' | null, evaluated for the side ABOUT TO
  // MOVE. No legal move → that side loses. Repetition (3×) / turn-cap → draw.
  function checkTerminal(st) {
    if (st.repeat[positionKey(st.board, st.turn)] >= 3) return 'draw';
    if (st.ply >= DRAW_PLIES) return 'draw';
    if (legalMovesFor(st.board, st.turn, st.ply).length === 0) {
      return st.turn === BLACK ? 'white' : 'black';
    }
    return null;
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────
  var cnv, ctx;

  // Carved-bark + greenstone palette (canvas may use literal colours; checklist
  // #5 exception — the page chrome uses CSS variables).
  var C = {
    bg:        '#14120C',   // dark surround
    grain1:    'rgba(120,98,52,0.16)',
    grain2:    'rgba(54,42,22,0.30)',
    plate:     '#5A4326',   // tōtara-bark board plate
    plateHi:   '#7A5C34',
    plateLo:   '#33260F',
    line:      '#E2C079',   // incised ochre star line
    lineDark:  'rgba(28,20,10,0.55)',
    node:      '#D9B05A',   // empty node ring
    nodeFill:  '#2C2110',
    centreRing:'#F0CF92',   // pūtahi accent
    black:     '#1B1714',   // black piece (player)
    blackHi:   '#4A413B',
    blackRim:  '#0B0908',
    white:     '#F2EAD6',   // white piece (opponent)
    whiteHi:   '#FFFDF5',
    whiteRim:  '#B7A579',
    selected:  '#E8A013',   // saffron glow
    validDot:  'rgba(120,190,140,0.85)',
    legalRing: 'rgba(232,160,19,0.85)',
    lastMove:  'rgba(232,160,19,0.55)'
  };

  // Recompute + store the pixel position of every node from state.padX/padY/cell.
  // Outer nodes sit on a circle of radius R = cell at angles k*45° (k=0..7),
  // starting at the top (−90°) and going clockwise. CENTRE at the middle.
  function layoutNodes() {
    var cx = state.padX, cy = state.padY, R = state.cell;
    var nodes = [];
    for (var k = 0; k < 8; k++) {
      var ang = (-90 + k * 45) * Math.PI / 180;
      nodes.push({ x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
    }
    nodes.push({ x: cx, y: cy }); // CENTRE
    state.nodes = nodes;
  }

  // Map an event to the nearest node index within a tolerance, else null.
  function nodeFromEvent(e) {
    var rect = cnv.getBoundingClientRect();
    var scaleX = cnv.width / rect.width;
    var scaleY = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top) * scaleY;
    var best = null, bestDist = Infinity;
    for (var i = 0; i < N; i++) {
      var p = state.nodes[i];
      if (!p) continue;
      var d = Math.hypot(x - p.x, y - p.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    // tolerance = ~40% of the ring radius (node spacing is generous on a star).
    if (best !== null && bestDist <= state.cell * 0.42) return best;
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

  function render() {
    if (!cnv || !ctx || !state.nodes.length) return;
    var pr = state.cell * 0.16; // piece radius (relative to ring radius)
    if (pr < 9) pr = 9;

    ctx.clearRect(0, 0, cnv.width, cnv.height);

    // Dark surround + grain.
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var gy = 0; gy < cnv.height; gy += 11) ctx.fillRect(0, gy, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var gx = 0; gx < cnv.width; gx += 26) ctx.fillRect(gx, 0, 3, cnv.height);

    // Bark board plate (a rounded square framing the star).
    var span = state.cell * 2 + pr * 2 + 28;
    var bx = state.padX - span / 2, by = state.padY - span / 2;
    ctx.fillStyle = C.plate;
    drawRoundRect(bx, by, span, span, 16); ctx.fill();
    ctx.save();
    drawRoundRect(bx, by, span, span, 16); ctx.clip();
    ctx.fillStyle = 'rgba(20,14,6,0.18)';
    for (var t = 0; t < 7; t++) ctx.fillRect(bx, by + span * (t / 7), span, t % 2 === 0 ? 3 : 2);
    ctx.fillStyle = C.plateHi;
    ctx.globalAlpha = 0.12;
    drawRoundRect(bx + 3, by + 3, span - 6, span * 0.18, 11); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.plateLo;
    drawRoundRect(bx, by, span, span, 16); ctx.stroke();

    // ── Star lines: the 8 ring edges (outer↔adjacent-outer) + the 8 spokes ──
    function stroke(p1, p2, w, col) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // dark underlines first (incised look), then bright lines.
    for (var pass = 0; pass < 2; pass++) {
      var col = pass === 0 ? C.lineDark : C.line;
      var w = pass === 0 ? 4.4 : 2.6;
      var off = pass === 0 ? 1 : 0;
      for (var s = 0; s < 8; s++) {
        var a = state.nodes[s], b = state.nodes[ringNext(s)], cn = state.nodes[CENTRE];
        stroke({ x: a.x + off, y: a.y + off }, { x: b.x + off, y: b.y + off }, w, col); // ring edge
        stroke({ x: a.x + off, y: a.y + off }, { x: cn.x + off, y: cn.y + off }, w, col); // spoke
      }
    }

    // Last-move destination highlight (ring at the destination).
    if (state.lastMove && state.lastMove.to != null) {
      var lm = state.nodes[state.lastMove.to];
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, pr + 6, 0, Math.PI * 2);
      ctx.strokeStyle = C.lastMove;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Empty node discs (with a special centre accent).
    for (var i = 0; i < N; i++) {
      if (state.board[i] !== EMPTY) continue;
      var p = state.nodes[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = C.nodeFill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = i === CENTRE ? C.centreRing : C.node;
      ctx.stroke();
    }

    // Interaction hints (selectable movers / destinations).
    drawHints(pr);

    // Pieces.
    for (var pi = 0; pi < N; pi++) {
      if (state.board[pi] === EMPTY) continue;
      var pp = state.nodes[pi];
      drawPiece(pp.x, pp.y, pr, state.board[pi], pi === state.selected);
    }
  }

  function drawPiece(x, y, r, side, sel) {
    ctx.beginPath();
    ctx.ellipse(x + 1.3, y + 2.2, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.36, r * 0.1, x, y, r);
    if (side === BLACK) {
      g.addColorStop(0, C.blackHi);
      g.addColorStop(0.5, C.black);
      g.addColorStop(1, '#0D0A08');
    } else {
      g.addColorStop(0, C.whiteHi);
      g.addColorStop(0.55, C.white);
      g.addColorStop(1, '#D8C8A4');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = side === BLACK ? C.blackRim : C.whiteRim;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - r * 0.30, y - r * 0.32, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = side === BLACK ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.60)';
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
    if (state.winner) return;
    if (!canActNow() || state.aiThinking) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    var side = state.turn;

    if (state.selected != null) {
      // Destinations of the selected piece.
      var dests = legalMovesFor(state.board, side, state.ply).filter(function (m) {
        return m.from === state.selected;
      });
      for (var di = 0; di < dests.length; di++) {
        var dp = state.nodes[dests[di].to];
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, pr * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = C.validDot;
        ctx.fill();
      }
    } else {
      // Ring every piece that has at least one legal move.
      var moves = legalMovesFor(state.board, side, state.ply);
      var froms = {};
      for (var mi = 0; mi < moves.length; mi++) froms[moves[mi].from] = true;
      for (var f in froms) {
        if (!froms.hasOwnProperty(f)) continue;
        var fp = state.nodes[+f];
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, pr + 3, 0, Math.PI * 2);
        ctx.strokeStyle = C.legalRing;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elModeToggle, elModeWrap, elDiff;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function sideName(side) { return side === BLACK ? 'Black' : 'White'; }

  function updateScore() {
    if (!elScore) return;
    var dotBlack = '<span aria-hidden="true" style="display:inline-block;width:.62em;height:.62em;border-radius:50%;background:#1B1714;box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);vertical-align:-0.02em;margin-right:.35em;"></span>';
    var dotWhite = '<span aria-hidden="true" style="display:inline-block;width:.62em;height:.62em;border-radius:50%;background:#F2EAD6;box-shadow:inset 0 0 0 1px #B7A579;vertical-align:-0.02em;margin-right:.35em;"></span>';
    if (vsRoom) {
      elScore.innerHTML =
        '<span class="mt-score__black">' + dotBlack + 'Black &middot; ' + (myPlayer === BLACK ? 'you' : 'opponent') + '</span>' +
        '<span class="mt-score__white">' + dotWhite + 'White &middot; ' + (myPlayer === WHITE ? 'you' : 'opponent') + '</span>';
      return;
    }
    elScore.innerHTML =
      '<span class="mt-score__black">' + dotBlack + 'Black &middot; you move first</span>' +
      '<span class="mt-score__white">' + dotWhite + 'White' + (vsAI ? ' &middot; computer' : ' &middot; Player 2') + '</span>';
  }

  function phaseHint() {
    if (state.selected != null) return 'Tap a green spot to move there; tap the piece again to deselect.';
    return 'Tap one of your highlighted pieces, then an empty neighbour.';
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
  function humanClick(node) {
    if (node == null) return;
    if (state.winner) return;
    if (state.aiThinking) return;
    if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return;
    if (!canActNow()) return;
    if (window.CGTutorial && CGTutorial.isActive) return;

    var side = state.turn, b = state.board;

    if (state.selected == null) {
      if (b[node] === side && hasMoveFrom(node)) { state.selected = node; render(); }
      return;
    }
    if (node === state.selected) { state.selected = null; render(); return; }
    if (b[node] === side && hasMoveFrom(node)) { state.selected = node; render(); return; }

    var mv = legalMovesFor(b, side, state.ply).filter(function (m) {
      return m.from === state.selected && m.to === node;
    });
    if (!mv.length) { state.selected = null; render(); return; }
    var sel = state.selected;
    state.selected = null;
    commitMove({ from: sel, to: node });
  }

  function hasMoveFrom(i) {
    return legalMovesFor(state.board, state.turn, state.ply).some(function (m) {
      return m.from === i;
    });
  }

  // ── Commit helpers ──────────────────────────────────────────────────────────
  function snapshot() {
    return {
      board:    state.board.slice(),
      turn:     state.turn,
      ply:      state.ply,
      lastMove: state.lastMove,
      repeat:   cloneRepeat(state.repeat)
    };
  }
  function cloneRepeat(r) {
    var o = {};
    for (var k in r) if (r.hasOwnProperty(k)) o[k] = r[k];
    return o;
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 80) state.history.shift();
  }

  function commitMove(move) {
    pushHistory();
    var side = state.turn;
    applyMoveToBoard(state.board, move, side);
    state.lastMove = { from: move.from, to: move.to };
    state.selected = null;
    state.ply++;
    state.turn = other(side);
    // Record the new position for repetition draws.
    var key = positionKey(state.board, state.turn);
    state.repeat[key] = (state.repeat[key] || 0) + 1;
    afterHandoff();
  }

  // Update score, check terminal, hand off to AI if needed.
  function afterHandoff() {
    updateScore();
    var winner = checkTerminal(state);
    if (winner) { endGame(winner); return; }
    render();
    if (vsRoom) {
      // Online: broadcast the move; no AI. The opponent's client drives their turn.
      setStatus(turnStatus());
      syncRoom();
      return;
    }
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
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    render();

    var localSide = vsRoom ? myPlayer : (vsAI ? humanSide : null);
    var localWon = localSide !== null &&
      ((winner === 'black' && localSide === BLACK) || (winner === 'white' && localSide === WHITE));

    if (winner === 'draw') {
      setStatus('Draw — neither side can be trapped. A perfectly played Mū tōrere is a draw.');
    } else if (localSide === null) { // hotseat
      setStatus(winner === 'black'
        ? 'Black wins! White has no legal move — trapped.'
        : 'White wins! Black has no legal move — trapped.');
    } else if (localWon) {
      setStatus(vsRoom
        ? 'You win! Your opponent has no legal move — trapped.'
        : 'You win! The computer is trapped with no legal move.');
    } else {
      setStatus(vsRoom
        ? 'Your opponent wins — you have no legal move. Try blocking their pieces instead.'
        : 'The computer wins — you have no legal move. Try blocking its pieces instead.');
    }

    var result = winner === 'draw' ? 'draw' : (localWon ? 'win' : 'loss');
    if (vsRoom) {
      // The room system records stats/coins/bets via RoomBridge.reportWin
      // (fired from syncRoom). Avoid a direct Auth.recordResult here.
      syncRoom();
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({
          gameId: 'mu-torere', result: result, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost())
        });
      }
      return;
    }
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
      Auth.recordResult('mu-torere', result);
    }
    if (vsAI && window.Achievements && Achievements.evaluate) {
      Achievements.evaluate({ gameId: 'mu-torere', result: result });
    }
  }

  // ── Online room sync (RoomBridge — full-blob source of truth; yote pattern) ──
  // Publish EVERY field that defines the visible board + whose turn + phase +
  // winner. ply gates centre-entry + the turn-cap; repeat drives 3× draws — both
  // sides must agree, so both ride along. last_actor carries our seat so we can
  // suppress our own echoed update.
  function serializeRoom() {
    return {
      board:      state.board.slice(),
      turn:       state.turn,
      ply:        state.ply,
      lastMove:   state.lastMove,
      repeat:     cloneRepeat(state.repeat),
      winner:     state.winner,
      last_actor: 'room:' + mySeat
    };
  }

  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeRoom());
    // First player (BLACK) = seat 0, second (WHITE) = seat 1.
    if (state.winner === 'black' || state.winner === 'white') {
      RoomBridge.reportWin(state.winner === 'black' ? 0 : 1);
    } else if (state.winner === 'draw') {
      RoomBridge.reportWin(-1); // -1 → null winnerPid in ingame.handleWin → settles as a DRAW
    }
  }

  function receiveRoomState(blob) {
    if (!blob) return;
    if (blob.last_actor === 'room:' + mySeat) return; // suppress our own echoed update
    if (blob.board) state.board = blob.board.slice();
    if (blob.turn !== undefined) state.turn = blob.turn;
    if (blob.ply !== undefined) state.ply = blob.ply;
    state.lastMove = blob.lastMove || null;
    state.repeat = blob.repeat ? cloneRepeat(blob.repeat) : {};
    state.selected = null;
    state.aiThinking = false;
    state.winner = blob.winner || null;
    updateScore();
    if (state.winner) {
      var localWon =
        (state.winner === 'black' && myPlayer === BLACK) ||
        (state.winner === 'white' && myPlayer === WHITE);
      if (state.winner === 'draw') {
        setStatus('Draw — neither side can be trapped. A perfectly played Mū tōrere is a draw.');
      } else if (localWon) {
        setStatus('You win! Your opponent has no legal move — trapped.');
      } else {
        setStatus('Your opponent wins — you have no legal move. Try blocking their pieces instead.');
      }
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
    myPlayer = (mySeat === 0) ? BLACK : WHITE;
    gameVersion++; // invalidate any in-flight AI timer
    state.aiThinking = false;

    // Hide solo-only controls; online rematch is driven by the room's Play Again.
    if (elModeWrap) elModeWrap.style.display = 'none';
    if (elNewBtn)   elNewBtn.style.display   = 'none';
    if (elUndoBtn)  elUndoBtn.style.display  = 'none';
    if (elDiff) {
      elDiff.style.display = 'none';
      var diffLabel = elDiff.closest ? elDiff.closest('label') : null;
      if (diffLabel) diffLabel.style.display = 'none';
    }

    RoomBridge.onState(receiveRoomState);   // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();            // host seeds the initial board + first turn
    updateScore();
    setStatus(turnStatus());
  }

  // ── AI — difficulty tiers (§5) ──────────────────────────────────────────────
  // Mū tōrere is SOLVED and its state space is tiny. The Hard tier is therefore
  // an EXACT solver: a memoised negamax that returns the game-theoretic value of
  // a position. With the default ("always") centre rule the legal moves depend
  // only on the board + side to move (not on the ply), so we can memoise purely
  // on positionKey — making the whole reachable tree resolve in well under a
  // millisecond and cache across the game. Cycles on the current search path are
  // treated as draws (neither side can force progress through a repetition).
  //
  // Outcome value (from the side-to-move's perspective):
  //   v > 0   → forced WIN; larger v = quicker win  (v = WIN_BASE - distance)
  //   v < 0   → forced LOSS; v closer to 0 = slower loss (v = -(WIN_BASE - dist))
  //   v === 0 → DRAW (with perfect play).

  var WIN_BASE = 100000;

  // Heuristic eval from `me`'s perspective for the depth-capped tiers
  // (Easy/Medium). Mobility-dominant: the loser is whoever runs out of moves.
  // Also reward holding the centre (a strong tempo resource).
  function evaluate(board, me, ply) {
    var foe = other(me);
    var myMob = legalMovesFor(board, me, ply).length;
    var foeMob = legalMovesFor(board, foe, ply).length;
    var score = (myMob - foeMob) * 10;
    if (board[CENTRE] === me) score += 6;
    else if (board[CENTRE] === foe) score -= 6;
    return score;
  }

  // EXACT SOLVE via retrograde analysis (backward induction). Because the game
  // graph has cycles (repetitions), a naïve recursive minimax can loop / blow
  // up. Retrograde analysis labels EVERY reachable position definitively as
  // WIN / LOSS / DRAW for the side to move, then a tiny distance pass picks the
  // quickest win / slowest loss. Built once and cached on `_solved` (the table
  // is ply-independent under the default "always" centre rule, which Hard uses).
  //
  // Result table: _solved[key] = { r: 'W'|'L'|'D', d: distance-to-result }.
  var _solved = null;
  var _solvedCentreAlways = null;

  // Enumerate all positions reachable from the start (both sides to move).
  function enumeratePositions() {
    var seen = {};
    var list = [];
    var stack = [];
    function push(board, toMove) {
      var key = positionKey(board, toMove);
      if (seen[key]) return;
      seen[key] = true;
      var node = { key: key, board: board, toMove: toMove };
      list.push(node);
      stack.push(node);
    }
    push(startBoard(), BLACK);
    while (stack.length) {
      var n = stack.pop();
      var moves = legalMovesFor(n.board, n.toMove, 0);
      for (var i = 0; i < moves.length; i++) {
        var nb = n.board.slice();
        applyMoveToBoard(nb, moves[i], n.toMove);
        push(nb, other(n.toMove));
      }
    }
    return { list: list, seen: seen };
  }

  // Build the solved table via retrograde analysis.
  function buildSolved() {
    var enum_ = enumeratePositions();
    var list = enum_.list;
    var WL = {};          // key → 'W' | 'L' (decided); absent = undecided → DRAW
    var dist = {};        // key → distance to the decided result
    var succ = {};        // key → [child keys]
    var pred = {};        // child key → [parent keys]
    var outDeg = {};      // key → number of children
    var queue = [];

    var i, j;
    // Build successor / predecessor graph; seed terminal losses (no moves).
    for (i = 0; i < list.length; i++) {
      var n = list[i];
      var moves = legalMovesFor(n.board, n.toMove, 0);
      var kids = [];
      for (j = 0; j < moves.length; j++) {
        var nb = n.board.slice();
        applyMoveToBoard(nb, moves[j], n.toMove);
        var ck = positionKey(nb, other(n.toMove));
        kids.push(ck);
        if (!pred[ck]) pred[ck] = [];
        pred[ck].push(n.key);
      }
      succ[n.key] = kids;
      outDeg[n.key] = kids.length;
      if (kids.length === 0) {
        // Side to move cannot move → LOSS for the side to move, distance 0.
        WL[n.key] = 'L'; dist[n.key] = 0;
        queue.push(n.key);
      }
    }

    // Backward induction. A position is a WIN if ANY child is a LOSS (for the
    // mover-to-move there); a LOSS if ALL children are WINs. Process a worklist.
    var lossChildCount = {}; // key → count of children proven WIN (for LOSS test)
    while (queue.length) {
      var key = queue.shift();
      var result = WL[key];
      var parents = pred[key] || [];
      for (var p = 0; p < parents.length; p++) {
        var pk = parents[p];
        if (WL[pk]) continue; // already decided
        if (result === 'L') {
          // Parent can move INTO a losing-for-the-mover-there position → parent WINS.
          WL[pk] = 'W';
          dist[pk] = dist[key] + 1;
          queue.push(pk);
        } else { // result === 'W'
          lossChildCount[pk] = (lossChildCount[pk] || 0) + 1;
          if (lossChildCount[pk] === outDeg[pk]) {
            // ALL children are WINs → parent is a LOSS.
            WL[pk] = 'L';
            // distance = 1 + max child distance (slowest forced loss).
            var maxd = 0, kids2 = succ[pk];
            for (var q = 0; q < kids2.length; q++) {
              if (dist[kids2[q]] != null && dist[kids2[q]] > maxd) maxd = dist[kids2[q]];
            }
            dist[pk] = maxd + 1;
            queue.push(pk);
          }
        }
      }
    }

    // Anything still undecided is a DRAW.
    var table = {};
    for (i = 0; i < list.length; i++) {
      var k2 = list[i].key;
      if (WL[k2] === 'W') table[k2] = { r: 'W', d: dist[k2] };
      else if (WL[k2] === 'L') table[k2] = { r: 'L', d: dist[k2] };
      else table[k2] = { r: 'D', d: 0 };
    }
    return table;
  }

  // Lazily build + cache the solved table (rebuild if the centre rule changed).
  function solvedTable() {
    if (_solved === null || _solvedCentreAlways !== centreAlways) {
      _solved = buildSolved();
      _solvedCentreAlways = centreAlways;
    }
    return _solved;
  }

  // Exact value (negamax-style) for the side to move, derived from the table.
  // Returns >0 forced win (bigger = quicker), <0 forced loss (closer to 0 =
  // slower), 0 draw. Used by tests + the Hard picker.
  function solve(board, toMove) {
    var key = positionKey(board, toMove);
    var t = solvedTable()[key];
    if (!t) {
      // Position not in the reachable-from-start table (e.g. a synthetic test
      // board). Fall back to an immediate-terminal check + 1-ply lookahead.
      if (legalMovesFor(board, toMove, 0).length === 0) return -WIN_BASE;
      return 0;
    }
    if (t.r === 'W') return WIN_BASE - t.d;
    if (t.r === 'L') return -(WIN_BASE - t.d);
    return 0;
  }

  // Depth-limited heuristic negamax for Easy/Medium (so the human can win).
  function searchDL(board, toMove, me, ply, depthLeft, onPath) {
    var moves = legalMovesFor(board, toMove, ply);
    if (moves.length === 0) {
      // toMove loses → from `me`'s view, big +/-.
      return toMove === me ? -WIN_BASE : WIN_BASE;
    }
    if (depthLeft <= 0 || ply >= DRAW_PLIES) return evaluate(board, me, ply);
    var key = positionKey(board, toMove);
    if (onPath[key]) return 0; // repetition → draw
    onPath[key] = true;
    var maximizing = (toMove === me);
    var best = maximizing ? -Infinity : Infinity;
    for (var i = 0; i < moves.length; i++) {
      var nb = board.slice();
      applyMoveToBoard(nb, moves[i], toMove);
      var v = searchDL(nb, other(toMove), me, ply + 1, depthLeft - 1, onPath);
      if (maximizing) { if (v > best) best = v; }
      else { if (v < best) best = v; }
    }
    delete onPath[key];
    return best;
  }

  // Pick the AI's move. Returns a move object or null (no legal move = AI loses).
  function getBestMove(board, toMove, ply, diff) {
    var moves = legalMovesFor(board, toMove, ply);
    if (!moves.length) return null;
    var me = toMove;

    // Easy: frequently play a purely random legal move so it blunders.
    if (diff === 'easy' && Math.random() < 0.55) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    var scored = [];
    var bestVal = -Infinity;

    if (diff === 'hard') {
      // EXACT solver — choose the move with the best game-theoretic outcome,
      // looked up from the retrograde-analysis table.
      for (var i = 0; i < moves.length; i++) {
        var nb = board.slice();
        applyMoveToBoard(nb, moves[i], me);
        var childVal = solve(nb, other(me));      // value for the opponent
        var val = -childVal;                      // negamax: value for `me`
        if (val > 0) val -= 1; else if (val < 0) val += 1;
        scored.push({ move: moves[i], val: val });
        if (val > bestVal) bestVal = val;
      }
      // Optimal play: pick uniformly among the strictly-best moves (variety).
      var pool = scored.filter(function (s) { return s.val === bestVal; });
      return pool[Math.floor(Math.random() * pool.length)].move;
    }

    // Easy / Medium: depth-limited heuristic search.
    var depthLeft = (diff === 'medium') ? 6 : 2;
    for (var j = 0; j < moves.length; j++) {
      var nb2 = board.slice();
      applyMoveToBoard(nb2, moves[j], me);
      var op = {};
      op[positionKey(board, me)] = true;
      var v2 = searchDL(nb2, other(me), me, ply + 1, depthLeft - 1, op);
      scored.push({ move: moves[j], val: v2 });
      if (v2 > bestVal) bestVal = v2;
    }
    // Near-equal pooling: Medium a small margin, Easy a wide one (beatable).
    var margin = (diff === 'medium') ? 12 : 1e9;
    var pool2 = scored.filter(function (s) { return s.val >= bestVal - margin; });
    if (!pool2.length) pool2 = scored;
    return pool2[Math.floor(Math.random() * pool2.length)].move;
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner) return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var move = getBestMove(state.board, state.turn, state.ply, difficulty);
      state.aiThinking = false;
      if (!move) { // AI has no move → AI loses
        endGame(state.turn === BLACK ? 'white' : 'black');
        return;
      }
      pushHistory();
      var side = state.turn;
      applyMoveToBoard(state.board, move, side);
      state.lastMove = { from: move.from, to: move.to };
      state.ply++;
      state.turn = other(side);
      var key = positionKey(state.board, state.turn);
      state.repeat[key] = (state.repeat[key] || 0) + 1;
      afterHandoff();
    }, 430);
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    state = freshState();
    var key = positionKey(state.board, state.turn);
    state.repeat[key] = 1;
    layoutFromCanvas();
    updateScore();
    setStatus(turnStatus());
    render();
    // Black (player) always opens, so no AI kickoff at game start.
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
    state.board    = s.board.slice();
    state.turn     = s.turn;
    state.ply      = s.ply;
    state.lastMove = s.lastMove;
    state.repeat   = cloneRepeat(s.repeat);
  }

  // ── Init / resize ──────────────────────────────────────────────────────────
  // Derive the ring radius (cell) + centred padX/padY (board centre) from the
  // current canvas buffer, then recompute stored node positions.
  function layoutFromCanvas() {
    if (!cnv) return;
    var size = Math.min(cnv.width, cnv.height);
    // The star fits inside size with margin for the piece radius + plate.
    var R = (size - PAD * 2) / 2;
    if (R < 60) R = 60;
    state.cell = R;
    state.padX = Math.round(cnv.width / 2);
    state.padY = Math.round(cnv.height / 2);
    layoutNodes();
  }

  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('mt-board-wrap');
    if (!wrap || !cnv) return;
    var w = Math.max(280, Math.min(wrap.clientWidth, 560));
    cnv.width = w;
    cnv.height = w; // square board
    layoutFromCanvas();
    render();
  }

  function init() {
    cnv = document.getElementById('mt-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus     = document.getElementById('mt-status');
    elScore      = document.getElementById('mt-score');
    elNewBtn     = document.getElementById('mt-new-btn');
    elUndoBtn    = document.getElementById('mt-undo-btn');
    elModeToggle = document.getElementById('mt-ai-toggle');
    elModeWrap   = document.getElementById('mt-mode-label');
    elDiff       = document.getElementById('mt-difficulty');

    state = freshState();
    var key0 = positionKey(state.board, state.turn);
    state.repeat[key0] = 1;
    state.cell = 100; state.padX = 150; state.padY = 150;
    layoutNodes();

    cnv.addEventListener('click', function (e) {
      humanClick(nodeFromEvent(e));
    });
    cnv.addEventListener('touchend', function (e) {
      e.preventDefault();
      humanClick(nodeFromEvent(e));
    }, { passive: false });

    if (elNewBtn)  elNewBtn.addEventListener('click', newGame);
    if (elUndoBtn) elUndoBtn.addEventListener('click', undo);
    if (elModeToggle) {
      elModeToggle.addEventListener('change', function () {
        vsAI = elModeToggle.checked;
        var span = elModeWrap && elModeWrap.querySelector('span');
        if (span) span.textContent = vsAI ? 'vs Computer' : '2 Players';
        if (elDiff) elDiff.disabled = !vsAI;
        newGame();
      });
    }
    if (elDiff) {
      elDiff.value = difficulty;
      elDiff.addEventListener('change', function () {
        difficulty = elDiff.value;
        newGame();
      });
    }

    window.addEventListener('resize', sizeToWrap);
    window.cgMobileResize = sizeToWrap;

    if (window.Achievements && Achievements.init) Achievements.init();
    if (window.CGTutorial) CGTutorial.initTrigger('mu-torere');
    if (window.PWF) try { PWF.init('mu-torere'); } catch (e) {}

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
          legal: function () { return legalMovesFor(state.board, state.turn, state.ply); },
          play: function (mv) {
            // Route through the SAME gated commit path a real tap uses.
            if (!mv) return false;
            if (state.winner || state.aiThinking) return false;
            if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return false;
            if (!canActNow()) return false;
            var ok = legalMovesFor(state.board, state.turn, state.ply).some(function (m) {
              return m.from === mv.from && m.to === mv.to;
            });
            if (!ok) return false;
            state.selected = null;
            commitMove({ from: mv.from, to: mv.to });
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
    CGTutorial.register('mu-torere', [
      {
        target: '#mt-canvas',
        title: 'The Star',
        body: 'Mū tōrere is played on an eight-pointed star: eight outer arms (kewai) around a centre point (pūtahi). You have four black pieces; the computer has four white. The centre starts empty.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mt-canvas',
        title: 'How Pieces Move',
        body: 'On your turn, slide ONE of your pieces to an empty point that is directly connected to it — an adjacent arm, into the empty centre, or from the centre out to any empty arm.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mt-canvas',
        title: 'The Centre Rule',
        body: 'You may only move a piece INTO the centre if one of its two arm-neighbours holds an OPPONENT’s piece. This famous restriction is what gives Mū tōrere its strategy.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mt-canvas',
        title: 'How to Win',
        body: 'There is no capturing. You win by leaving your opponent with NO legal move — trapped. With perfect play the game is a draw, so watch for a blunder and pounce.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null
      },
      {
        target: '#mt-difficulty',
        title: 'Difficulty',
        body: 'Pick Easy (beatable), Medium, or Hard (near-perfect — it will only draw or win). Use the toggle to switch between vs Computer and 2 Players, and New Game to restart.',
        position: 'left', highlight: true, beforeStep: null, afterStep: null
      }
    ]);
    CGTutorial.initTrigger('mu-torere');
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

  // GameResize (checklist #3/#4): recompute ring radius + centred padX/padY,
  // resize the canvas BUFFER to the available box, recompute node positions,
  // and re-render.
  if (typeof window !== 'undefined') window.GameResize = function (availW, availH) {
    if (!cnv || !ctx) return;
    var size = Math.min(availW, availH);
    var R = (size - PAD * 2) / 2;
    if (R < 60) R = 60;
    state.cell = R;
    cnv.width = availW;
    cnv.height = availH;
    state.padX = Math.round(availW / 2);
    state.padY = Math.round(availH / 2);
    layoutNodes();
    render();
  };

  // ── Expose pure logic for headless tests (Node) ─────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, CENTRE: CENTRE, N: N, OUTERS: OUTERS,
      DRAW_PLIES: DRAW_PLIES, ADJ: ADJ,
      ringNext: ringNext, ringPrev: ringPrev, isAdjacent: isAdjacent,
      other: other, countOnBoard: countOnBoard, startBoard: startBoard,
      canEnterCentre: canEnterCentre, legalMovesFor: legalMovesFor,
      applyMoveToBoard: applyMoveToBoard, positionKey: positionKey,
      evaluate: evaluate, solve: solve, searchDL: searchDL, getBestMove: getBestMove,
      // Allow tests to toggle the variant rule.
      setCentreAlways: function (v) { centreAlways = v; },
      getCentreAlways: function () { return centreAlways; },
      // A freshState-like object for terminal tests.
      makeState: function (board, turn, ply) {
        return {
          board: board.slice(), turn: turn, ply: ply || 0,
          repeat: {}, winner: null
        };
      },
      checkTerminal: checkTerminal
    };
  }

}());
