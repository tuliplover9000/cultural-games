/**
 * tsoro-yematatu.js — Tsoro Yematatu, a three-in-a-row strategy game of the
 * Shona people of Zimbabwe. Seven-point triangular board, 3 pieces per side,
 * place → then slide/jump. Form three of your pieces on one of the five drawn
 * lines to win. (Verified reconstruction of the most-cited ruleset.)
 *
 * Canvas-rendered: vs-AI single player, local hotseat, AND online room play
 * (RoomBridge full-blob sync, yote pattern). Prefix: ty-  Key: tsoro-yematatu
 *
 * Structurally a sibling of js/games/morabaraba.js — mirrors its module shape:
 * canvas setup, graph/adjacency, GameResize (cell/padX/padY via stored node
 * positions), minimax AI, hotseat toggle (canActNow), rAF+setTimeout loop.
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var EMPTY = 0, BLACK = 1, WHITE = 2;   // BLACK = player (moves first by convention)
  var PIECES = 3;
  var DRAW_PLIES = 40;                    // movement plies with no win → draw (anti-loop)
  var PAD = 30;                           // canvas padding around the board

  // ── Board graph (verified — 7 nodes; verbatim from roadmap §3) ──────────────
  // Normalized node positions (x right, y down), scaled to the board at layout.
  var NODE_POS = [
    [0.50, 0.00], // 0 apex
    [0.25, 0.50], // 1 left-mid (midpoint of left slanted side)
    [0.50, 0.50], // 2 centre
    [0.75, 0.50], // 3 right-mid (midpoint of right slanted side)
    [0.00, 1.00], // 4 bottom-left
    [0.50, 1.00], // 5 bottom-centre
    [1.00, 1.00]  // 6 bottom-right
  ];
  var N = 7;

  // Strict adjacency — only consecutive points on a drawn segment are neighbours.
  var ADJ = [
    [1, 2, 3],       // 0
    [0, 2, 4],       // 1
    [0, 1, 3, 5],    // 2
    [0, 2, 6],       // 3
    [1, 5],          // 4
    [2, 4, 6],       // 5
    [3, 5]           // 6
  ];

  // The 5 drawn lines = the 5 winning lines (no more). Each is 3 collinear points.
  var LINES = [
    [0, 1, 4], // left slanted side
    [0, 3, 6], // right slanted side
    [0, 2, 5], // vertical centre
    [1, 2, 3], // horizontal mid
    [4, 5, 6]  // base
  ];

  // Jumps (no capture): over the MIDDLE of a line to the far endpoint if the
  // middle is occupied (either colour) and the far endpoint is empty.
  // jumpsFrom[from] = [{ over, to }] derived from LINES' endpoints.
  var JUMPS = [];
  (function () {
    for (var i = 0; i < N; i++) JUMPS.push([]);
    LINES.forEach(function (L) {
      var a = L[0], m = L[1], c = L[2];
      JUMPS[a].push({ over: m, to: c });
      JUMPS[c].push({ over: m, to: a });
    });
  }());

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function other(side) { return side === BLACK ? WHITE : BLACK; }

  function countOnBoard(board, side) {
    var c = 0;
    for (var i = 0; i < N; i++) if (board[i] === side) c++;
    return c;
  }

  // Does `side` occupy a full line? Returns true if a 3-in-line exists.
  function hasLine(board, side) {
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (board[L[0]] === side && board[L[1]] === side && board[L[2]] === side) return true;
    }
    return false;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var vsAI = true;            // vs-AI default; false = local hotseat
  var humanSide = BLACK;
  var gameVersion = 0;
  var state;

  // Online room state (set by initRoomMode when launched inside a Room iframe).
  var vsRoom = false, mySeat = -1, mySide = BLACK;

  function canActNow() {
    if (vsRoom) return state.turn === mySide;
    if (vsAI) return state.turn === humanSide;
    return true;
  }

  function freshState() {
    var board = [];
    for (var i = 0; i < N; i++) board.push(EMPTY);
    return {
      board:       board,
      turn:        BLACK,
      phase:       'placement',   // 'placement' | 'movement' | 'over'
      inHand:      { 1: PIECES, 2: PIECES },
      selected:    null,
      lastMove:    null,          // {from,to}  (from=-1 placement)
      drawCounter: 0,             // movement plies with no win
      winner:      null,          // 'black' | 'white' | 'draw' | null
      // node pixel positions (recomputed on layout), cell ~= node spacing for hit-test
      nodes:       [],
      cell:        60,
      padX:        PAD,
      padY:        PAD,
      history:     [],
      aiThinking:  false
    };
  }

  // ── Move generation ─────────────────────────────────────────────────────────
  // Move object: { from, to }  (from === -1 → placement).
  function placementMoves(st) {
    var moves = [];
    for (var i = 0; i < N; i++) if (st.board[i] === EMPTY) moves.push({ from: -1, to: i });
    return moves;
  }

  function movementMoves(st) {
    var side = st.turn, board = st.board, moves = [];
    for (var from = 0; from < N; from++) {
      if (board[from] !== side) continue;
      // slides
      var adj = ADJ[from];
      for (var a = 0; a < adj.length; a++) {
        if (board[adj[a]] === EMPTY) moves.push({ from: from, to: adj[a] });
      }
      // jumps (no capture): over an occupied middle to an empty far endpoint
      var js = JUMPS[from];
      for (var j = 0; j < js.length; j++) {
        if (board[js[j].over] !== EMPTY && board[js[j].to] === EMPTY) {
          moves.push({ from: from, to: js[j].to });
        }
      }
    }
    return moves;
  }

  function legalMoves(st) {
    if (st.phase === 'placement') return placementMoves(st);
    if (st.phase === 'movement') return movementMoves(st);
    return [];
  }

  // Apply a move (mutate). Does NOT flip turn. Returns nothing.
  function applyMoveToState(st, move) {
    var side = st.turn;
    if (move.from === -1) {
      st.board[move.to] = side;
      st.inHand[side]--;
    } else {
      st.board[move.from] = EMPTY;
      st.board[move.to] = side;
      st.drawCounter++; // movement progresses the no-win draw clock
    }
    st.lastMove = { from: move.from, to: move.to };
  }

  // Terminal AFTER `side` (st.turn currently = side that just moved was flipped by caller).
  // We evaluate for the side ABOUT TO MOVE: a win is detected for whoever has a line.
  function checkTerminal(st) {
    if (hasLine(st.board, BLACK)) return 'black';
    if (hasLine(st.board, WHITE)) return 'white';
    if (st.phase === 'movement' && st.drawCounter >= DRAW_PLIES) return 'draw';
    if (legalMoves(st).length === 0) return 'draw'; // stuck (rare) → draw, not a false loss
    return null;
  }

  // ── Canvas rendering ─────────────────────────────────────────────────────────
  var cnv, ctx;

  // Earthy Shona palette (canvas may use literal colours; checklist #5 exception).
  var C = {
    bg:        '#241710',
    grain1:    'rgba(120,78,38,0.22)',
    grain2:    'rgba(70,44,20,0.28)',
    plate:     '#6E4A24',
    plateHi:   '#8E6230',
    line:      '#E3B65E',
    lineDark:  'rgba(40,25,12,0.55)',
    point:     '#D9A441',
    pointFill: '#33210F',
    black:     '#3A2616',   // black seed (player) — dark river stone
    blackHi:   '#5A3E22',
    blackRim:  '#1C1006',
    white:     '#F0E5CC',   // white seed (opponent)
    whiteHi:   '#FFFBF0',
    whiteRim:  '#B49B66',
    selected:  '#E8A013',
    validDot:  'rgba(120,160,80,0.72)',
    lastMove:  'rgba(232,160,19,0.5)',
    winLine:   '#F2C14E'
  };

  function nodeXY(i) { return state.nodes[i]; }

  function pointFromEvent(e) {
    var rect = cnv.getBoundingClientRect();
    var scaleX = cnv.width / rect.width, scaleY = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top) * scaleY;
    var best = null, bestDist = Infinity;
    for (var i = 0; i < N; i++) {
      var p = state.nodes[i];
      var d = Math.hypot(x - p.x, y - p.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best !== null && bestDist <= state.cell * 0.5) return best;
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
    if (!cnv || !ctx) return;
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    var cs = state.cell;
    var pr = cs * 0.30; // piece radius

    // Soil surround
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var ry = 0; ry < cnv.height; ry += 10) ctx.fillRect(0, ry, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var rx = 0; rx < cnv.width; rx += 24) ctx.fillRect(rx, 0, 3, cnv.height);

    // Lines: draw each of the 5 lines as a polyline through its 3 points.
    LINES.forEach(function (L) {
      var a = nodeXY(L[0]), b = nodeXY(L[1]), c = nodeXY(L[2]);
      ctx.beginPath();
      ctx.moveTo(a.x + 1, a.y + 1); ctx.lineTo(b.x + 1, b.y + 1); ctx.lineTo(c.x + 1, c.y + 1);
      ctx.strokeStyle = C.lineDark; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
      ctx.strokeStyle = C.line; ctx.lineWidth = 2.3; ctx.stroke();
    });

    // Winning-line glow (when a game is won)
    if (state.winner === 'black' || state.winner === 'white') {
      var ws = state.winner === 'black' ? BLACK : WHITE;
      for (var w = 0; w < LINES.length; w++) {
        var L2 = LINES[w];
        if (state.board[L2[0]] === ws && state.board[L2[1]] === ws && state.board[L2[2]] === ws) {
          var p0 = nodeXY(L2[0]), p2 = nodeXY(L2[2]);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(nodeXY(L2[1]).x, nodeXY(L2[1]).y); ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = C.winLine; ctx.lineWidth = 5; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    }

    // Empty point rings
    for (var i = 0; i < N; i++) {
      if (state.board[i] !== EMPTY) continue;
      var p = nodeXY(i);
      ctx.beginPath(); ctx.arc(p.x, p.y, cs * 0.11, 0, Math.PI * 2);
      ctx.fillStyle = C.pointFill; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C.point; ctx.stroke();
    }

    // Last-move highlight
    if (state.lastMove && state.lastMove.to >= 0) {
      var lm = nodeXY(state.lastMove.to);
      ctx.beginPath(); ctx.arc(lm.x, lm.y, pr + 6, 0, Math.PI * 2);
      ctx.strokeStyle = C.lastMove; ctx.lineWidth = 3; ctx.stroke();
    }

    // Valid-target hints
    currentTargets().forEach(function (t) {
      var p2 = nodeXY(t);
      ctx.beginPath(); ctx.arc(p2.x, p2.y, pr * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = C.validDot; ctx.fill();
    });

    // Pieces
    for (var pi = 0; pi < N; pi++) {
      if (state.board[pi] === EMPTY) continue;
      var pp = nodeXY(pi);
      drawSeed(pp.x, pp.y, pr, state.board[pi], pi === state.selected);
    }
  }

  function drawSeed(x, y, r, side, sel) {
    ctx.beginPath(); ctx.ellipse(x + 1.4, y + 2.2, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.1, x, y, r);
    if (side === BLACK) {
      g.addColorStop(0, C.blackHi); g.addColorStop(0.55, C.black); g.addColorStop(1, '#241406');
    } else {
      g.addColorStop(0, C.whiteHi); g.addColorStop(0.55, C.white); g.addColorStop(1, '#D8C8A4');
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = side === BLACK ? C.blackRim : C.whiteRim; ctx.stroke();
    if (sel) {
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.selected; ctx.lineWidth = 3; ctx.stroke();
    }
  }

  function currentTargets() {
    if (state.winner || state.phase === 'over') return [];
    if (!canActNow() || state.aiThinking) return [];
    if (state.phase === 'placement') {
      var arr = [];
      for (var i = 0; i < N; i++) if (state.board[i] === EMPTY) arr.push(i);
      return arr;
    }
    if (state.phase === 'movement' && state.selected != null) {
      return movementMoves(state).filter(function (m) { return m.from === state.selected; })
        .map(function (m) { return m.to; });
    }
    return [];
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elModeToggle, elModeWrap;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }
  function sideName(side) { return side === BLACK ? 'Black' : 'White'; }

  function updateScore() {
    if (!elScore) return;
    elScore.innerHTML =
      '<span class="ty-score__black">&#9899; Black &middot; ' + countOnBoard(state.board, BLACK) +
        ' down' + (state.inHand[BLACK] ? ' / ' + state.inHand[BLACK] + ' in hand' : '') + '</span>' +
      '<span class="ty-score__white">&#9898; White &middot; ' + countOnBoard(state.board, WHITE) +
        ' down' + (state.inHand[WHITE] ? ' / ' + state.inHand[WHITE] + ' in hand' : '') + '</span>';
  }

  function phaseHint() {
    if (state.phase === 'placement') return 'Placement: tap an empty point to drop a piece (' + state.inHand[state.turn] + ' left).';
    return 'Move: tap a piece, then an adjacent point, or jump over a neighbour to the empty point beyond.';
  }
  function turnStatus() {
    var hint = phaseHint();
    if (vsRoom) return (state.turn === mySide ? 'Your turn. ' : 'Opponent’s turn. ') + hint;
    if (!vsAI) return (state.turn === BLACK ? 'Black’s turn (Player 1). ' : 'White’s turn (Player 2). ') + hint;
    return (state.turn === humanSide ? 'Your turn (Black). ' : 'Computer’s turn (White). ') + hint;
  }

  // ── Human interaction ────────────────────────────────────────────────────────
  function humanClick(point) {
    if (state.winner || state.phase === 'over' || state.aiThinking) return;
    if (vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator()) return;
    if (!canActNow()) return;
    if (window.CGTutorial && CGTutorial.isActive) return;

    var b = state.board, side = state.turn;

    if (state.phase === 'placement') {
      if (b[point] === EMPTY) commitMove({ from: -1, to: point });
      return;
    }
    // Movement
    if (state.selected == null) {
      if (b[point] === side && hasMoveFrom(point)) { state.selected = point; render(); }
      return;
    }
    if (point === state.selected) { state.selected = null; render(); return; }
    if (b[point] === side && hasMoveFrom(point)) { state.selected = point; render(); return; }
    var mv = movementMoves(state).filter(function (m) { return m.from === state.selected && m.to === point; });
    if (mv.length === 0) { state.selected = null; render(); return; }
    var sel = state.selected; state.selected = null;
    commitMove({ from: sel, to: point });
  }

  function hasMoveFrom(i) {
    return movementMoves(state).some(function (m) { return m.from === i; });
  }

  function snapshot() {
    return {
      board: state.board.slice(), turn: state.turn, phase: state.phase,
      inHand: { 1: state.inHand[BLACK], 2: state.inHand[WHITE] },
      drawCounter: state.drawCounter, lastMove: state.lastMove
    };
  }
  function pushHistory() { state.history.push(snapshot()); if (state.history.length > 40) state.history.shift(); }

  function commitMove(move) {
    pushHistory();
    applyMoveToState(state, move);
    state.selected = null;
    // promote placement → movement once both hands are empty
    if (state.phase === 'placement' && state.inHand[BLACK] === 0 && state.inHand[WHITE] === 0) {
      state.phase = 'movement';
    }
    // Win is detected for the side that JUST moved (before flipping).
    if (hasLine(state.board, state.turn)) { endGame(state.turn === BLACK ? 'black' : 'white'); return; }
    afterTurn();
  }

  function afterTurn() {
    state.turn = other(state.turn);
    state.selected = null;
    updateScore();
    var winner = checkTerminal(state); // catches draw / stuck
    if (winner) { endGame(winner); return; }
    render();
    if (vsRoom) { setStatus(turnStatus()); syncRoom(); return; } // broadcast the move
    if (vsAI && state.turn !== humanSide) {
      state.aiThinking = true; setStatus('Computer is thinking…'); scheduleAIMove();
    } else {
      setStatus(turnStatus());
    }
  }

  function endGame(winner) {
    state.winner = winner; state.phase = 'over'; state.aiThinking = false; state.selected = null;
    updateScore(); render();
    var localSide = vsRoom ? mySide : (vsAI ? humanSide : null);
    var localWon = localSide !== null &&
      ((winner === 'black' && localSide === BLACK) || (winner === 'white' && localSide === WHITE));
    if (winner === 'draw') {
      setStatus('Draw — neither side can line up three. A fresh game?');
    } else if (localSide === null) {
      setStatus(winner === 'black' ? '🏆 Black wins — three in a row! (Player 1)' : '🏆 White wins — three in a row! (Player 2)');
    } else if (localWon) {
      setStatus('🎉 You win — three in a row!');
    } else {
      setStatus(vsRoom ? 'Your opponent lines up three and wins.' : 'The computer lines up three and wins. Watch its threats!');
    }
    var result = winner === 'draw' ? 'draw' : (localWon ? 'win' : 'loss');
    if (vsRoom) {
      syncRoom(); // broadcast the final board + report the winner seat (RoomBridge records stats/coins)
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({ gameId: 'tsoro-yematatu', result: result, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()) });
      }
      return;
    }
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) Auth.recordResult('tsoro-yematatu', result);
    if (vsAI && window.Achievements && Achievements.evaluate) Achievements.evaluate({ gameId: 'tsoro-yematatu', result: result });
  }

  // ── Online room sync (RoomBridge — full-blob source of truth; yote pattern) ──
  function serializeRoom() {
    return {
      board: state.board.slice(), turn: state.turn, phase: state.phase,
      inHand: { 1: state.inHand[BLACK], 2: state.inHand[WHITE] },
      drawCounter: state.drawCounter, lastMove: state.lastMove,
      winner: state.winner, last_actor: 'room:' + mySeat
    };
  }
  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeRoom());
    if (state.winner === 'black' || state.winner === 'white') {
      RoomBridge.reportWin(state.winner === 'black' ? 0 : 1);
    } else if (state.winner === 'draw') {
      RoomBridge.reportWin(-1); // -1 → null winnerPid in ingame.handleWin → settles as a DRAW
    }
  }
  function receiveRoomState(blob) {
    if (!blob) return;
    if (blob.last_actor === 'room:' + mySeat) return; // suppress our own echoed update
    state.board = blob.board.slice();
    state.turn = blob.turn; state.phase = blob.phase;
    state.inHand = { 1: blob.inHand[1], 2: blob.inHand[2] };
    state.drawCounter = blob.drawCounter || 0;
    state.lastMove = blob.lastMove || null;
    state.selected = null; state.aiThinking = false;
    state.winner = blob.winner || null;
    updateScore();
    if (state.winner) {
      state.phase = 'over';
      var localWon = (state.winner === 'black' && mySide === BLACK) || (state.winner === 'white' && mySide === WHITE);
      if (state.winner === 'draw') setStatus('Draw — neither side can line up three.');
      else if (localWon) setStatus('🎉 You win — three in a row!');
      else setStatus('Your opponent lines up three and wins.');
    } else {
      setStatus(turnStatus());
    }
    render();
  }
  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true; vsAI = false;
    mySeat = RoomBridge.getSeat();
    mySide = (mySeat === 0) ? BLACK : WHITE;
    // Hide solo-only controls; online rematch is driven by the room's Play Again.
    if (elModeWrap) elModeWrap.style.display = 'none';
    if (elNewBtn)   elNewBtn.style.display   = 'none';
    if (elUndoBtn)  elUndoBtn.style.display  = 'none';
    RoomBridge.onState(receiveRoomState);   // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();            // host seeds the initial empty board + first turn
    updateScore(); setStatus(turnStatus());
  }

  // ── AI (minimax / alpha-beta — small tree, search deep) ──────────────────────
  function cloneSim(st) {
    return {
      board: st.board.slice(), turn: st.turn, phase: st.phase,
      inHand: { 1: st.inHand[BLACK], 2: st.inHand[WHITE] }, drawCounter: st.drawCounter
    };
  }
  function applyActionSim(st, move) {
    applyMoveToState(st, move);
    if (st.phase === 'placement' && st.inHand[BLACK] === 0 && st.inHand[WHITE] === 0) st.phase = 'movement';
    // turn flips AFTER win-check by the caller's logic; in sim we flip here and let
    // terminalScore detect lines for either side.
    st.turn = other(st.turn);
  }

  // Count 2-in-line-with-empty-third threats for `side`.
  function threats(board, side) {
    var n = 0;
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i], mine = 0, empty = 0, foe = 0;
      for (var k = 0; k < 3; k++) {
        var v = board[L[k]];
        if (v === side) mine++; else if (v === EMPTY) empty++; else foe++;
      }
      if (mine === 2 && empty === 1) n++;
    }
    return n;
  }

  function evaluate(st, me) {
    var foe = other(me);
    if (hasLine(st.board, me)) return 100000;
    if (hasLine(st.board, foe)) return -100000;
    var score = (threats(st.board, me) - threats(st.board, foe)) * 30;
    // mobility for side to move
    score += (st.turn === me ? legalMoves(st).length : -legalMoves(st).length) * 2;
    // centre (high-degree) is valuable
    if (st.board[2] === me) score += 8; else if (st.board[2] === foe) score -= 8;
    return score;
  }

  function terminalScore(st, me, depth) {
    if (hasLine(st.board, me)) return 100000 + depth;
    if (hasLine(st.board, other(me))) return -100000 - depth;
    if (st.phase === 'movement' && st.drawCounter >= DRAW_PLIES) return 0;
    if (legalMoves(st).length === 0) return 0;
    return null;
  }

  function minimax(st, me, depth, alpha, beta) {
    var term = terminalScore(st, me, depth);
    if (term !== null) return term;
    if (depth === 0) return evaluate(st, me);
    var moves = legalMoves(st);
    if (moves.length === 0) return 0;
    var maximizing = st.turn === me, i, child, val;
    if (maximizing) {
      var best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        child = cloneSim(st); applyActionSim(child, moves[i]);
        val = minimax(child, me, depth - 1, alpha, beta);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (i = 0; i < moves.length; i++) {
        child = cloneSim(st); applyActionSim(child, moves[i]);
        val = minimax(child, me, depth - 1, alpha, beta);
        if (val < worst) worst = val;
        if (worst < beta) beta = worst;
        if (alpha >= beta) break;
      }
      return worst;
    }
  }

  function getBestMove(st) {
    var me = st.turn, moves = legalMoves(st);
    if (!moves.length) return null;
    var depth = st.phase === 'placement' ? 6 : 8; // tiny tree → deep search is cheap
    var bestVal = -Infinity, bestMoves = [];
    for (var i = 0; i < moves.length; i++) {
      var child = cloneSim(st); applyActionSim(child, moves[i]);
      var val = minimax(child, me, depth - 1, -Infinity, Infinity);
      if (val > bestVal + 0.0001) { bestVal = val; bestMoves = [moves[i]]; }
      else if (val >= bestVal - 0.0001) bestMoves.push(moves[i]);
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      if (window.CGTutorial && CGTutorial.isActive) return;
      var move = getBestMove(state);
      if (!move) { state.aiThinking = false; endGame('draw'); return; }
      state.aiThinking = false;
      pushHistory();
      applyMoveToState(state, move);
      if (state.phase === 'placement' && state.inHand[BLACK] === 0 && state.inHand[WHITE] === 0) state.phase = 'movement';
      if (hasLine(state.board, state.turn)) { endGame(state.turn === BLACK ? 'black' : 'white'); return; }
      afterTurn();
    }, 430);
  }

  // ── Controls ─────────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    var keepNodes = state ? state.nodes : [];
    var keepCell = state ? state.cell : 60, kpx = state ? state.padX : PAD, kpy = state ? state.padY : PAD;
    state = freshState();
    state.nodes = keepNodes; state.cell = keepCell; state.padX = kpx; state.padY = kpy;
    sizeToWrap();
    updateScore(); setStatus(turnStatus()); render();
    if (vsAI && state.turn !== humanSide) { state.aiThinking = true; scheduleAIMove(); }
  }

  function undo() {
    if (state.aiThinking || !state.history.length) return;
    gameVersion++;
    restoreSnap(state.history.pop());
    if (vsAI && state.turn !== humanSide && state.history.length) restoreSnap(state.history.pop());
    state.winner = null;
    if (state.phase === 'over') state.phase = (state.inHand[BLACK] > 0 || state.inHand[WHITE] > 0) ? 'placement' : 'movement';
    state.aiThinking = false; state.selected = null;
    updateScore(); setStatus(turnStatus()); render();
  }

  function restoreSnap(s) {
    state.board = s.board.slice(); state.turn = s.turn; state.phase = s.phase;
    state.inHand = { 1: s.inHand[BLACK], 2: s.inHand[WHITE] };
    state.drawCounter = s.drawCounter; state.lastMove = s.lastMove;
  }

  // ── Layout / resize ──────────────────────────────────────────────────────────
  // Compute node pixel positions for a square board of side `boardW` at (padX,padY).
  function computeNodes(boardW, padX, padY) {
    var nodes = [];
    for (var i = 0; i < N; i++) {
      nodes.push({ x: padX + NODE_POS[i][0] * boardW, y: padY + NODE_POS[i][1] * boardW });
    }
    return nodes;
  }

  function layout(availW, availH) {
    var boardW = Math.min(availW, availH) - PAD * 2;
    if (boardW < 120) boardW = 120;
    state.padX = Math.round((availW - boardW) / 2);
    state.padY = Math.round((availH - boardW) / 2);
    state.nodes = computeNodes(boardW, state.padX, state.padY);
    // cell ~= nominal node spacing (board is ~2 "cells" tall/wide of triangle) for hit-test + piece size
    state.cell = boardW * 0.30;
  }

  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('ty-board-wrap');
    if (!wrap || !cnv) return;
    var w = Math.max(260, Math.min(wrap.clientWidth, 560));
    cnv.width = w; cnv.height = w; // square
    layout(w, w);
    render();
  }

  function init() {
    cnv = document.getElementById('ty-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');
    elStatus = document.getElementById('ty-status');
    elScore = document.getElementById('ty-score');
    elNewBtn = document.getElementById('ty-new-btn');
    elUndoBtn = document.getElementById('ty-undo-btn');
    elModeToggle = document.getElementById('ty-ai-toggle');
    elModeWrap = document.getElementById('ty-mode-label');

    state = freshState();
    layout(360, 360);

    cnv.addEventListener('click', function (e) { var p = pointFromEvent(e); if (p !== null) humanClick(p); });
    cnv.addEventListener('touchend', function (e) { e.preventDefault(); var p = pointFromEvent(e); if (p !== null) humanClick(p); }, { passive: false });
    if (elNewBtn) elNewBtn.addEventListener('click', newGame);
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
    if (window.CGTutorial) CGTutorial.initTrigger('tsoro-yematatu');
    if (window.PWF) try { PWF.init('tsoro-yematatu'); } catch (e) {}

    sizeToWrap(); updateScore(); setStatus(turnStatus());
    initRoomMode();   // becomes online if launched inside a Room iframe (?roomId=)
    startRenderLoop();

    // Dev-only test seam for the 2-client relay harness (perfect-information game → safe).
    try {
      if (new URLSearchParams(location.search).get('roomTest') === '1') {
        window.__tySim = { state: function () { return state; }, click: humanClick,
                           mySeat: function () { return mySeat; }, vsRoom: function () { return vsRoom; } };
      }
    } catch (e) { /* no-op */ }
  }

  // ── Animation loop (rAF + setTimeout fallback — checklist #8) ────────────────
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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  // ── Fullscreen + GameResize hooks (checklist #3/#4) ──────────────────────────
  if (typeof window !== 'undefined' && window.FSMode) {
    FSMode.onEnter = function () { setTimeout(render, 50); };
    FSMode.onExit = function () { setTimeout(function () { cnv.style.removeProperty('width'); cnv.style.removeProperty('height'); sizeToWrap(); }, 50); };
  }
  if (typeof window !== 'undefined') window.GameResize = function (availW, availH) {
    if (!cnv || !ctx) return;
    cnv.width = availW; cnv.height = availH;
    layout(availW, availH);
    render();
  };

  // ── Tutorial steps ───────────────────────────────────────────────────────────
  if (typeof window !== 'undefined' && window.CGTutorial) {
    CGTutorial.register('tsoro-yematatu', [
      { target: '#ty-canvas', title: 'The Board', body: 'Tsoro Yematatu is played on a seven-point triangle with five drawn lines. You play the black seeds; the computer plays white.', position: 'bottom', highlight: true },
      { target: '#ty-canvas', title: 'Place Three', body: 'Each side has three seeds. Take turns dropping one onto any empty point until all six are down — line up three of your own on a drawn line at any time to win.', position: 'bottom', highlight: true },
      { target: '#ty-canvas', title: 'Move & Jump', body: 'Once placed, slide a seed to an adjacent point — or jump over a neighbouring seed (yours or the foe’s) to the empty point beyond. Jumps do NOT capture.', position: 'top', highlight: true },
      { target: '#ty-new-btn', title: 'New Game', body: 'Restart any time. Toggle between vs Computer and 2 Players.', position: 'left', highlight: true }
    ]);
    CGTutorial.initTrigger('tsoro-yematatu');
  }

  // ── Expose pure logic for headless tests (Node) ──────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, N: N, PIECES: PIECES, DRAW_PLIES: DRAW_PLIES,
      ADJ: ADJ, LINES: LINES, JUMPS: JUMPS,
      freshState: freshState, other: other, countOnBoard: countOnBoard, hasLine: hasLine,
      legalMoves: legalMoves, placementMoves: placementMoves, movementMoves: movementMoves,
      applyMoveToState: applyMoveToState, checkTerminal: checkTerminal,
      cloneSim: cloneSim, applyActionSim: applyActionSim, evaluate: evaluate, threats: threats,
      minimax: minimax, getBestMove: getBestMove,
      setTurn: function (st, t) { st.turn = t; }, setPhase: function (st, p) { st.phase = p; }
    };
  }

}());
