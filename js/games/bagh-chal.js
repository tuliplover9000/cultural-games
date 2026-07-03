/**
 * bagh-chal.js — Bagh-Chal (बाघचाल, "Moving Tigers"), Nepal's national board game.
 * Asymmetric hunt: 4 tigers vs 20 goats on a 5×5 alquerque board.
 * Canvas-rendered, vs-AI single player. Prefix: bg-   Key: bagh-chal
 *
 * Adjacency graph + minimax pattern: js/games/fanorona.js
 * Checklist-compliant GameResize (cellSize/padX/padY): xinjiang-fangqi/xinjiang-fangqi.js
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var COLS = 5, ROWS = 5, TOTAL = 25;
  var EMPTY = 0, TIGER = 1, GOAT = 2;
  var CORNERS = [0, 4, 20, 24];
  var GOATS_TOTAL = 20;
  var CAPTURE_TO_WIN = 5;        // tigers win at 5 goats captured
  var DRAW_NOPROGRESS = 60;      // plies (30 full rounds) without a capture post-placement → draw.
                                 // Generous so a legitimate goat squeeze toward a trap (which makes
                                 // no captures) is never cut short by a premature draw.
  var PAD = 44;                  // default padding to first point

  // ── Board helpers ────────────────────────────────────────────────────────
  function idx(c, r)  { return r * COLS + c; }
  function col(i)     { return i % COLS; }
  function row(i)     { return Math.floor(i / COLS); }
  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  // ── Adjacency graph (alquerque) ────────────────────────────────────────────
  // Strong points ((col+row) even) have 8 directions; weak points 4 orthogonal.
  // Generated programmatically (= fanorona GRAPH with COLS=ROWS=5).
  var GRAPH = (function () {
    var adj = [];
    var i;
    for (i = 0; i < TOTAL; i++) adj.push([]);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var strong = (c + r) % 2 === 0;
        var dirs = strong
          ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
          : [[-1,0],[1,0],[0,-1],[0,1]];
        dirs.forEach(function (d) {
          var nc = c + d[0], nr = r + d[1];
          if (inBounds(nc, nr)) {
            adj[idx(c, r)].push({ to: idx(nc, nr), dc: d[0], dr: d[1] });
          }
        });
      }
    }
    return adj;
  }());

  // edge from `from` in direction (dc,dr); returns target idx or -1
  function edgeTo(from, dc, dr) {
    var edges = GRAPH[from];
    for (var k = 0; k < edges.length; k++) {
      if (edges[k].dc === dc && edges[k].dr === dr) return edges[k].to;
    }
    return -1;
  }

  // ── Initial board ────────────────────────────────────────────────────────
  function initialBoard() {
    var b = [];
    for (var i = 0; i < TOTAL; i++) b.push(EMPTY);
    CORNERS.forEach(function (ci) { b[ci] = TIGER; });
    return b;
  }

  // ── State ────────────────────────────────────────────────────────────────
  var vsAI = true;               // vs-AI (default). false = local 2-player hotseat.
  var humanSide = GOAT;          // human's side in vs-AI mode
  var vsRoom = false;            // online room multiplayer
  var mySeat = 0;                // online seat: 0 = goats (move first), 1 = tigers
  var winReported = false;       // online: reportWin fired once
  var gameVersion = 0;
  var state;

  // Online seat → side. Seat 0 plays goats (they move first), seat 1 plays tigers.
  function seatSide(seat) { return seat === 0 ? GOAT : TIGER; }
  function mySide() { return seatSide(mySeat); }

  // Can the LOCAL player act on the current turn right now?
  //   vs-AI  → only on the human's side
  //   online → only on this seat's side (turn-gating)
  //   hotseat→ always (whoever's turn it is shares the device)
  function canActNow() {
    if (vsRoom) return state.turn === mySide();
    if (vsAI)   return state.turn === humanSide;
    return true;
  }

  function freshState() {
    return {
      board:         initialBoard(),
      turn:          GOAT,       // goats move first
      phase:         'placement',
      goatsInHand:   GOATS_TOTAL,
      goatsCaptured: 0,
      selected:      null,
      noProgress:    0,          // plies since last capture (counts post-placement)
      lastMove:      null,       // {from,to} for highlight
      winner:        null,       // 'tigers' | 'goats' | 'draw' | null
      history:       [],
      aiThinking:    false,
    };
  }

  // ── Move logic ───────────────────────────────────────────────────────────
  // Tiger moves from i: steps to adjacent empties, and single-jump captures.
  function tigerMoves(board, i) {
    var moves = [];
    GRAPH[i].forEach(function (edge) {
      var to = edge.to, dc = edge.dc, dr = edge.dr;
      if (board[to] === EMPTY) {
        moves.push({ from: i, to: to, cap: -1 });
      } else if (board[to] === GOAT) {
        // landing = point beyond `to` in the same direction (same edge type)
        var land = edgeTo(to, dc, dr);
        if (land !== -1 && board[land] === EMPTY) {
          moves.push({ from: i, to: land, cap: to });
        }
      }
    });
    return moves;
  }

  function allTigerMoves(board) {
    var moves = [];
    for (var i = 0; i < TOTAL; i++) {
      if (board[i] === TIGER) moves = moves.concat(tigerMoves(board, i));
    }
    return moves;
  }

  // Goat step moves (movement phase) from i.
  function goatMoves(board, i) {
    var moves = [];
    GRAPH[i].forEach(function (edge) {
      if (board[edge.to] === EMPTY) moves.push({ from: i, to: edge.to, cap: -1 });
    });
    return moves;
  }

  function allGoatStepMoves(board) {
    var moves = [];
    for (var i = 0; i < TOTAL; i++) {
      if (board[i] === GOAT) moves = moves.concat(goatMoves(board, i));
    }
    return moves;
  }

  // Goat placements (placement phase): every empty point.
  function goatPlacements(board) {
    var moves = [];
    for (var i = 0; i < TOTAL; i++) {
      if (board[i] === EMPTY) moves.push({ from: -1, to: i, cap: -1 });
    }
    return moves;
  }

  // All legal moves for the side to move, given a state.
  function legalForState(st) {
    if (st.turn === GOAT) {
      return st.phase === 'placement' ? goatPlacements(st.board) : allGoatStepMoves(st.board);
    }
    return allTigerMoves(st.board);
  }

  // ── Win detection ────────────────────────────────────────────────────────
  // Returns 'tigers' | 'goats' | 'draw' | null.
  function checkWinnerState(st) {
    if (st.goatsCaptured >= CAPTURE_TO_WIN) return 'tigers';
    if (allTigerMoves(st.board).length === 0) return 'goats';
    if (st.phase === 'movement' && st.noProgress >= DRAW_NOPROGRESS) return 'draw';
    return null;
  }

  // ── Apply a move (mutates a state object) ──────────────────────────────────
  // move: {from, to, cap}. from===-1 → placement.
  function applyMoveToState(st, move) {
    if (move.from === -1) {
      // Goat placement
      st.board[move.to] = GOAT;
      st.goatsInHand--;
      if (st.goatsInHand <= 0) st.phase = 'movement';
      // placement is not "no progress" until movement begins; counter idle here
    } else {
      var piece = st.board[move.from];
      st.board[move.from] = EMPTY;
      st.board[move.to] = piece;
      if (move.cap >= 0) {
        st.board[move.cap] = EMPTY;
        st.goatsCaptured++;
        st.noProgress = 0;
      } else if (st.phase === 'movement') {
        st.noProgress++;
      }
    }
    st.lastMove = { from: move.from, to: move.to };
  }

  // Clone a lightweight state for AI search (no UI fields).
  function cloneSim(st) {
    return {
      board:         st.board.slice(),
      turn:          st.turn,
      phase:         st.phase,
      goatsInHand:   st.goatsInHand,
      goatsCaptured: st.goatsCaptured,
      noProgress:    st.noProgress,
    };
  }

  // ── Canvas rendering ─────────────────────────────────────────────────────
  var cnv, ctx;

  // Brass-on-wood register. Canvas may use hardcoded colors (checklist #5 exception).
  var C = {
    bg:         '#3A2616',   // dark wood surround
    grain1:     'rgba(94,58,28,0.30)',
    grain2:     'rgba(139,90,46,0.22)',
    plate:      '#7A5024',   // wood board plate
    plateHi:    '#9A6A34',
    brassLine:  '#D9A441',   // incised brass lines
    brassDark:  'rgba(60,38,12,0.55)',
    strongPt:   '#E8C06A',   // brass point inlay
    weakPt:     '#B98A3C',
    tiger:      '#C8822C',   // tawny tiger body
    tigerHi:    '#E0A552',
    tigerStripe:'#3A2410',
    tigerRim:   '#7A4818',
    goat:       '#EDE3C8',   // cream goat body
    goatHi:     '#FBF6E9',
    goatRim:    '#A98C58',
    goatHorn:   '#8A7048',
    selected:   '#E8A013',   // saffron glow
    validDot:   'rgba(110,150,70,0.65)',
    capRing:    '#B5331E',   // deep red capture target
    lastMove:   'rgba(232,160,19,0.45)',
  };

  function getCellXY(c, r) {
    return { x: state.padX + c * state.cellSize, y: state.padY + r * state.cellSize };
  }

  function getCellFromEvent(e) {
    var rect   = cnv.getBoundingClientRect();
    var scaleX = cnv.width  / rect.width;
    var scaleY = cnv.height / rect.height;
    var src    = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    var x = (src.clientX - rect.left) * scaleX;
    var y = (src.clientY - rect.top)  * scaleY;
    var c = Math.round((x - state.padX) / state.cellSize);
    var r = Math.round((y - state.padY) / state.cellSize);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    var snapX = state.padX + c * state.cellSize;
    var snapY = state.padY + r * state.cellSize;
    var dist  = Math.hypot(x - snapX, y - snapY);
    if (dist > state.cellSize * 0.5) return null;
    return idx(c, r);
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

    var cs = state.cellSize;
    var pr = cs * 0.30; // piece radius

    // Wood surround
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = C.grain1;
    for (var ry = 0; ry < cnv.height; ry += 9) ctx.fillRect(0, ry, cnv.width, 2);
    ctx.fillStyle = C.grain2;
    for (var rx = 0; rx < cnv.width; rx += 22) ctx.fillRect(rx, 0, 3, cnv.height);

    // Board plate
    var bx = state.padX - cs * 0.6, by = state.padY - cs * 0.6;
    var bw = (COLS - 1) * cs + cs * 1.2, bh = (ROWS - 1) * cs + cs * 1.2;
    ctx.fillStyle = C.plate;
    drawRoundRect(bx, by, bw, bh, 10); ctx.fill();
    ctx.save();
    drawRoundRect(bx, by, bw, bh, 10); ctx.clip();
    ctx.fillStyle = 'rgba(58,38,12,0.28)';
    [0.16, 0.40, 0.64, 0.86].forEach(function (f, gi) {
      ctx.fillRect(bx, by + bh * f, bw, gi % 2 === 0 ? 3 : 2);
    });
    ctx.restore();
    ctx.fillStyle = C.plateHi;
    ctx.globalAlpha = 0.14;
    drawRoundRect(bx + 3, by + 3, bw - 6, bh * 0.22, 8); ctx.fill();
    ctx.globalAlpha = 1;

    // Incised brass edges from GRAPH (dedup)
    var drawn = {};
    for (var i = 0; i < TOTAL; i++) {
      var p1 = getCellXY(col(i), row(i));
      GRAPH[i].forEach(function (edge) {
        var key = i < edge.to ? i + ',' + edge.to : edge.to + ',' + i;
        if (drawn[key]) return;
        drawn[key] = true;
        var p2 = getCellXY(col(edge.to), row(edge.to));
        ctx.beginPath();
        ctx.moveTo(p1.x + 1, p1.y + 1);
        ctx.lineTo(p2.x + 1, p2.y + 1);
        ctx.strokeStyle = C.brassDark;
        ctx.lineWidth   = 2.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = C.brassLine;
        ctx.lineWidth   = 1.8;
        ctx.stroke();
      });
    }

    // Point inlays
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var strong = (c + r) % 2 === 0;
        var pt = getCellXY(c, r);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, strong ? cs * 0.07 : cs * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = strong ? C.strongPt : C.weakPt;
        ctx.fill();
      }
    }

    // Last move highlight
    if (state.lastMove && state.lastMove.to >= 0) {
      var lm = getCellXY(col(state.lastMove.to), row(state.lastMove.to));
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, pr + 6, 0, Math.PI * 2);
      ctx.strokeStyle = C.lastMove;
      ctx.lineWidth   = 3;
      ctx.stroke();
    }

    // Valid-move targets for the selected piece / placement hints
    var targets = currentTargets();
    targets.forEach(function (m) {
      var pt = getCellXY(col(m.to), row(m.to));
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pr * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = C.validDot;
      ctx.fill();
      if (m.cap >= 0) {
        var cp = getCellXY(col(m.cap), row(m.cap));
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.capRing;
        ctx.lineWidth   = 2.5;
        ctx.stroke();
      }
    });

    // Pieces
    for (var pi = 0; pi < TOTAL; pi++) {
      if (state.board[pi] === EMPTY) continue;
      var ppt = getCellXY(col(pi), row(pi));
      if (state.board[pi] === TIGER) drawTiger(ppt.x, ppt.y, pr * 1.12, pi === state.selected);
      else                           drawGoat(ppt.x, ppt.y, pr * 0.92, pi === state.selected);
    }
  }

  function drawTiger(x, y, r, sel) {
    // Shadow
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2.5, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    // Body
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.12, x, y, r);
    g.addColorStop(0, C.tigerHi);
    g.addColorStop(0.6, C.tiger);
    g.addColorStop(1, C.tigerRim);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = C.tigerRim;
    ctx.stroke();
    // Ears
    ctx.fillStyle = C.tiger;
    [[-0.55, -0.7], [0.55, -0.7]].forEach(function (e) {
      ctx.beginPath();
      ctx.arc(x + e[0] * r, y + e[1] * r, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.tigerRim;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
    // Stripes (clipped to body)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = C.tigerStripe;
    ctx.lineWidth = Math.max(1.4, r * 0.13);
    [-0.45, 0, 0.45].forEach(function (o) {
      ctx.beginPath();
      ctx.moveTo(x + o * r - r * 0.2, y - r);
      ctx.lineTo(x + o * r + r * 0.2, y + r);
      ctx.stroke();
    });
    ctx.restore();
    if (sel) selRing(x, y, r);
  }

  function drawGoat(x, y, r, sel) {
    ctx.beginPath();
    ctx.ellipse(x + 1.2, y + 2, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.1, x, y, r);
    g.addColorStop(0, C.goatHi);
    g.addColorStop(0.55, C.goat);
    g.addColorStop(1, '#CFC2A0');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.goatRim;
    ctx.stroke();
    // Horns (small curved nubs)
    ctx.strokeStyle = C.goatHorn;
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.5, r * 0.4, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 0.32, y - r * 0.5, r * 0.4, Math.PI * 1.3, Math.PI * 1.95);
    ctx.stroke();
    if (sel) selRing(x, y, r);
  }

  function selRing(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = C.selected;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Targets to highlight: if a piece is selected → its moves; if placement & goat
  // human turn → no dots (whole board is legal, would be noisy) unless selected.
  function currentTargets() {
    if (state.phase === 'over' || state.winner) return [];
    if (state.selected === null) return [];
    if (state.board[state.selected] === TIGER && state.turn === TIGER) {
      return tigerMoves(state.board, state.selected);
    }
    if (state.board[state.selected] === GOAT && state.turn === GOAT && state.phase === 'movement') {
      return goatMoves(state.board, state.selected);
    }
    return [];
  }

  // ── UI helpers ───────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elModeToggle, elModeWrap;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function updateScore() {
    if (!elScore) return;
    var tigers = 0;
    state.board.forEach(function (v) { if (v === TIGER) tigers++; });
    elScore.innerHTML =
      '<span class="bg-score__tigers">&#128047; Tigers &middot; ' + tigers + ' on board</span>' +
      '<span class="bg-score__goats">&#128016; Goats &middot; ' +
        state.goatsCaptured + ' lost / ' + state.goatsInHand + ' in hand</span>';
  }

  function phaseHint() {
    if (state.phase === 'placement') {
      return 'Placement: tap an empty point to place a goat (' + state.goatsInHand + ' left).';
    }
    return 'Movement: tap a goat, then an adjacent point to move it.';
  }

  // ── Human interaction ────────────────────────────────────────────────────
  function humanClick(point) {
    if (state.winner || state.phase === 'over') return;
    if (state.aiThinking) return;
    if (!canActNow()) return;     // gates vs-AI side, online turn, hotseat passthrough
    if (window.CGTutorial && CGTutorial.isActive) return;

    var b = state.board;

    if (state.turn === GOAT) {
      if (state.phase === 'placement') {
        if (b[point] === EMPTY) commitMove({ from: -1, to: point, cap: -1 });
        return;
      }
      // movement phase: select a goat, then move
      if (state.selected === null) {
        if (b[point] === GOAT && goatMoves(b, point).length > 0) {
          state.selected = point; render();
        }
        return;
      }
      if (point === state.selected) { state.selected = null; render(); return; }
      if (b[point] === GOAT && goatMoves(b, point).length > 0) {
        state.selected = point; render(); return;
      }
      var gm = goatMoves(b, state.selected).filter(function (m) { return m.to === point; });
      if (gm.length === 0) { state.selected = null; render(); return; }
      var sel = state.selected;
      state.selected = null;
      commitMove({ from: sel, to: point, cap: -1 });
      return;
    }

    if (state.turn === TIGER) {
      if (state.selected === null) {
        if (b[point] === TIGER && tigerMoves(b, point).length > 0) {
          state.selected = point; render();
        }
        return;
      }
      if (point === state.selected) { state.selected = null; render(); return; }
      if (b[point] === TIGER && tigerMoves(b, point).length > 0) {
        state.selected = point; render(); return;
      }
      var tm = tigerMoves(b, state.selected).filter(function (m) { return m.to === point; });
      if (tm.length === 0) { state.selected = null; render(); return; }
      var selT = state.selected;
      state.selected = null;
      commitMove(tm[0]);
      return;
    }
  }

  // Commit a human (or programmatic) move, push undo, then hand off.
  function commitMove(move) {
    state.history.push({
      board:         state.board.slice(),
      turn:          state.turn,
      phase:         state.phase,
      goatsInHand:   state.goatsInHand,
      goatsCaptured: state.goatsCaptured,
      noProgress:    state.noProgress,
      lastMove:      state.lastMove,
    });
    if (state.history.length > 30) state.history.shift();
    applyMoveToState(state, move);
    state.selected = null;
    afterMove();
  }

  // Status line for the side to move, adapted to the mode.
  function turnStatus() {
    var sideName = state.turn === GOAT ? 'Goats' : 'Tigers';
    var hint = state.turn === GOAT ? phaseHint() : 'Tap a tiger, then a point to move or jump.';
    if (vsRoom) {
      return state.turn === mySide()
        ? 'Your turn (' + sideName + '). ' + hint
        : 'Opponent’s turn (' + sideName + ')…';
    }
    if (!vsAI) { // hotseat
      return (state.turn === GOAT ? 'Goats’ turn (Player 1). ' : 'Tigers’ turn (Player 2). ') + hint;
    }
    return (state.turn === GOAT ? 'Your turn. ' : 'Your turn (Tigers). ') + hint;
  }

  function afterMove() {
    updateScore();
    render();
    var winner = checkWinnerState(state);
    if (!winner) {
      state.turn = state.turn === GOAT ? TIGER : GOAT;   // flip turn
      // If the side to move has no legal move: tigers→goats win, goats→draw (never freeze).
      var legal = legalForState(state);
      if (legal.length === 0) winner = (state.turn === TIGER) ? 'goats' : 'draw';
    }

    if (winner) {
      endGame(winner);
      if (vsRoom) syncRoomState();   // broadcast terminal state (incl. winner) to peer
      return;
    }

    if (vsRoom) syncRoomState();     // broadcast the new turn state

    if (vsAI && state.turn !== humanSide) {
      state.aiThinking = true;
      setStatus(state.turn === TIGER ? 'Tigers are prowling…' : 'Goats are thinking…');
      scheduleAIMove();
    } else {
      setStatus(turnStatus());
    }
  }

  function endGame(winner) {
    state.winner = winner;
    state.phase  = 'over';
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    render();
    // localSide = the side this viewer controls: online → seat side; vs-AI → human
    // side; hotseat → null (both players share the screen, so announce neutrally).
    var localSide = vsRoom ? mySide() : (vsAI ? humanSide : null);
    var localWon = localSide !== null &&
      ((winner === 'goats' && localSide === GOAT) || (winner === 'tigers' && localSide === TIGER));
    if (winner === 'draw') {
      setStatus('Draw — 60 moves passed with no capture. The herd holds, the tigers cannot break through.');
    } else if (localSide === null) { // hotseat — neutral announcement
      setStatus(winner === 'tigers'
        ? 'Tigers win! Five goats devoured — Player 2 prevails.'
        : 'Goats win! Every tiger is trapped — Player 1 prevails.');
    } else if (winner === 'tigers') {
      setStatus(localWon
        ? 'Tigers win! Five goats devoured.'
        : 'Tigers win — five goats were captured. Try walling them in sooner.');
    } else { // goats
      setStatus(localWon
        ? 'Goats win! Every tiger is trapped — strength in numbers.'
        : 'Goats win — the tigers are all trapped.');
    }
    // Only vs-AI records to the player's account; hotseat is local, and online
    // results are recorded per-seat by the room end screen.
    if (vsAI && window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) {
      Auth.recordResult('bagh-chal', winner === 'draw' ? 'draw' : (localWon ? 'win' : 'loss'));
    }
    if (vsAI && window.Achievements && Achievements.evaluate) {
      Achievements.evaluate({ gameId: 'bagh-chal',
        result: winner === 'draw' ? 'draw' : (localWon ? 'win' : 'loss') });
    }

    // Shared end-of-game plaque. Status line above is the fallback. Suppressed
    // in room mode — the room end screen records/announces the result per seat.
    if (!vsRoom && window.CGEndPlaque) {
      var _plaqueResult = winner === 'draw'
        ? 'draw'
        : (localSide === null ? 'win' : (localWon ? 'win' : 'loss'));
      var _title = winner === 'draw'
        ? 'A Draw'
        : localSide === null
          ? (winner === 'tigers' ? 'Tigers Win' : 'Goats Win')
          : (localWon ? 'You Win' : 'You Lose');
      var _sub = winner === 'draw'
        ? 'Sixty moves passed with no capture.'
        : winner === 'tigers'
          ? 'Five goats were devoured.'
          : 'Every tiger is trapped.';
      window.CGEndPlaque.show({
        result: _plaqueResult,
        title: _title,
        subtitle: _sub,
        stats: [
          { label: 'Goats Taken', value: state.goatsCaptured }
        ],
        onRematch: newGame,
        rematchText: 'Play Again',
        accent: '#C98A3C'
      });
    }
  }

  // ── AI (minimax, asymmetric — tigers maximise, goats minimise) ─────────────
  // Score from the TIGERS' perspective. Higher = better for tigers.
  function scoreState(st) {
    var captured = st.goatsCaptured;
    if (captured >= CAPTURE_TO_WIN) return 100000;
    var tMoves = allTigerMoves(st.board);
    if (tMoves.length === 0) return -100000; // tigers trapped → goats win
    var captureThreats = 0, tigerMobility = tMoves.length;
    tMoves.forEach(function (m) { if (m.cap >= 0) captureThreats++; });
    // Goats value clustering/blocking; tigers value mobility + capture pressure.
    return captured * 1000
         + captureThreats * 60
         + tigerMobility * 8;
  }

  function terminalScore(st, depth) {
    var w = checkWinnerState(st);
    if (w === 'tigers') return 100000 + depth;
    if (w === 'goats')  return -100000 - depth;
    if (w === 'draw')   return 0;
    return null;
  }

  // For the goat side, placement branching can be ≤23. Cap depth there.
  function minimax(st, depth, alpha, beta) {
    var term = terminalScore(st, depth);
    if (term !== null) return term;
    if (depth === 0) return scoreState(st);

    var moves = legalForState(st);
    if (moves.length === 0) {
      // side to move stuck: tigers stuck → goats win; goats stuck → draw
      return st.turn === TIGER ? -100000 - depth : 0;
    }

    var isMax = st.turn === TIGER;
    var i, child, val;
    if (isMax) {
      var best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        child = cloneSim(st);
        applyMoveToState(child, moves[i]);
        child.turn = GOAT;
        val = minimax(child, depth - 1, alpha, beta);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var best2 = Infinity;
      for (i = 0; i < moves.length; i++) {
        child = cloneSim(st);
        applyMoveToState(child, moves[i]);
        child.turn = TIGER;
        val = minimax(child, depth - 1, alpha, beta);
        if (val < best2) best2 = val;
        if (best2 < beta) beta = best2;
        if (alpha >= beta) break;
      }
      return best2;
    }
  }

  // Pick the AI's best move for the current side. Deterministic tie-break (first best).
  function getBestAIMove(st) {
    var moves = legalForState(st);
    if (!moves.length) return null;
    var aiIsTiger = st.turn === TIGER;
    // Placement (goat) branching is wide → shallower search; movement deeper.
    var depth;
    if (st.phase === 'placement') depth = 3;
    else depth = 4;

    var bestMove = moves[0];
    var bestVal = aiIsTiger ? -Infinity : Infinity;
    for (var i = 0; i < moves.length; i++) {
      var child = cloneSim(st);
      applyMoveToState(child, moves[i]);
      child.turn = aiIsTiger ? GOAT : TIGER;
      var val = minimax(child, depth - 1, -Infinity, Infinity);
      if (aiIsTiger) {
        if (val > bestVal) { bestVal = val; bestMove = moves[i]; }
      } else {
        if (val < bestVal) { bestVal = val; bestMove = moves[i]; }
      }
    }
    return bestMove;
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.winner || state.phase === 'over') return;
      if (window.CGTutorial && CGTutorial.isActive) { return; }
      var move = getBestAIMove(state);
      if (!move) {
        // AI side has no move: resolve as terminal (never freeze)
        state.aiThinking = false;
        if (state.turn === TIGER) endGame('goats'); else endGame('draw');
        return;
      }
      state.aiThinking = false;
      // Push undo snapshot for AI move too (so Undo rewinds a full round).
      state.history.push({
        board:         state.board.slice(),
        turn:          state.turn,
        phase:         state.phase,
        goatsInHand:   state.goatsInHand,
        goatsCaptured: state.goatsCaptured,
        noProgress:    state.noProgress,
        lastMove:      state.lastMove,
      });
      if (state.history.length > 30) state.history.shift();
      applyMoveToState(state, move);
      afterMove();
    }, 420);
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    winReported = false;
    state = freshState();
    state.cellSize = state.cellSize || (cnv ? (cnv.width - PAD * 2) / (COLS - 1) : 80);
    state.padX = state.padX || PAD;
    state.padY = state.padY || PAD;
    updateScore();
    setStatus(turnStatus());
    render();
    if (vsAI && state.turn !== humanSide) { state.aiThinking = true; scheduleAIMove(); }
    else if (vsRoom && mySeat === 0) syncRoomState();   // seat 0 seeds the fresh game
  }

  function undo() {
    if (state.aiThinking) return;
    if (!state.history.length) return;
    gameVersion++;
    // Pop back to the most recent human-controlled position: pop once (AI) then
    // once more (human) if needed so the human gets a fresh decision.
    var prev = state.history.pop();
    restoreSnap(prev);
    // If it's now the AI's turn, pop again to land on the human's move.
    if (vsAI && state.turn !== humanSide && state.history.length) {
      restoreSnap(state.history.pop());
    }
    state.winner = null;
    state.phase = state.phase === 'over' ? (state.goatsInHand > 0 ? 'placement' : 'movement') : state.phase;
    state.aiThinking = false;
    state.selected = null;
    updateScore();
    setStatus('Your turn. ' + phaseHint());
    render();
  }

  function restoreSnap(snap) {
    state.board         = snap.board;
    state.turn          = snap.turn;
    state.phase         = snap.phase;
    state.goatsInHand   = snap.goatsInHand;
    state.goatsCaptured = snap.goatsCaptured;
    state.noProgress    = snap.noProgress;
    state.lastMove      = snap.lastMove;
  }

  // ── Online room sync (RoomBridge) ──────────────────────────────────────────
  // Board values arrive from a peer (untrusted); coerce each cell to a valid piece.
  function cleanBoard(arr) {
    if (!Array.isArray(arr) || arr.length !== COLS * ROWS) return null;
    return arr.map(function (v) { return (v === TIGER || v === GOAT) ? v : EMPTY; });
  }

  function syncRoomState() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      board:         state.board.slice(),
      turn:          state.turn,
      phase:         state.phase,
      goatsInHand:   state.goatsInHand,
      goatsCaptured: state.goatsCaptured,
      noProgress:    state.noProgress,
      lastMove:      state.lastMove,
      winner:        state.winner,
      last_actor:    'room:' + mySeat,
    });
    if (state.winner) reportRoomWin();
  }

  function reportRoomWin() {
    if (!vsRoom || !window.RoomBridge || winReported) return;
    winReported = true;
    if (state.winner === 'draw') return;                 // no winner seat on a draw
    RoomBridge.reportWin(state.winner === 'goats' ? 0 : 1);  // seat 0 goats, seat 1 tigers
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + mySeat) return;   // ignore our own echo
    var b = cleanBoard(data.board);
    if (b) state.board = b;
    state.turn          = (data.turn === TIGER || data.turn === GOAT) ? data.turn : state.turn;
    state.phase         = data.phase || state.phase;
    state.goatsInHand   = typeof data.goatsInHand   === 'number' ? data.goatsInHand   : state.goatsInHand;
    state.goatsCaptured = typeof data.goatsCaptured === 'number' ? data.goatsCaptured : state.goatsCaptured;
    state.noProgress    = typeof data.noProgress    === 'number' ? data.noProgress    : 0;
    state.lastMove      = data.lastMove || null;
    state.selected      = null;
    state.aiThinking    = false;
    updateScore();
    render();
    if (data.winner) { endGame(data.winner); reportRoomWin(); return; }  // display end (no re-broadcast)
    setStatus(turnStatus());
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true;
    vsAI   = false;
    mySeat = RoomBridge.getSeat();
    RoomBridge.onState(receiveRoomState);
    newGame();   // deterministic opening — both seats compute the same board; seat 0 broadcasts.
    setStatus(turnStatus());
    // Hide single-player controls in a room.
    if (elNewBtn)   elNewBtn.style.display   = 'none';
    if (elUndoBtn)  elUndoBtn.style.display  = 'none';
    if (elModeWrap) elModeWrap.style.display = 'none';
  }

  // ── Init / resize ──────────────────────────────────────────────────────────
  function sizeToWrap() {
    if (window.FSMode && window.FSMode.isActive && window.FSMode.isActive()) return;
    var wrap = document.getElementById('bg-board-wrap');
    if (!wrap || !cnv) return;
    var w = Math.max(280, Math.min(wrap.clientWidth, 620));
    cnv.width  = w;
    cnv.height = w; // square board
    state.cellSize = (w - PAD * 2) / (COLS - 1);
    state.padX = PAD;
    state.padY = PAD;
    render();
  }

  function init() {
    cnv = document.getElementById('bg-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus     = document.getElementById('bg-status');
    elScore      = document.getElementById('bg-score');
    elNewBtn     = document.getElementById('bg-new-btn');
    elUndoBtn    = document.getElementById('bg-undo-btn');
    elModeToggle = document.getElementById('bg-ai-toggle');
    elModeWrap   = document.getElementById('bg-mode-label');

    state = freshState();
    state.cellSize = 80; state.padX = PAD; state.padY = PAD;

    cnv.addEventListener('click', function (e) {
      var p = getCellFromEvent(e);
      if (p !== null) humanClick(p);
    });
    cnv.addEventListener('touchend', function (e) {
      e.preventDefault();
      var p = getCellFromEvent(e);
      if (p !== null) humanClick(p);
    }, { passive: false });

    if (elNewBtn)  elNewBtn.addEventListener('click', newGame);
    if (elUndoBtn) elUndoBtn.addEventListener('click', undo);
    if (elModeToggle) {
      elModeToggle.addEventListener('change', function () {
        vsAI = elModeToggle.checked;             // checked = vs Computer; unchecked = 2 players
        var span = elModeWrap && elModeWrap.querySelector('span');
        if (span) span.textContent = vsAI ? 'vs Computer' : '2 Players';
        newGame();                                // restart in the chosen mode
      });
    }

    window.addEventListener('resize', sizeToWrap);
    window.cgMobileResize = sizeToWrap;

    if (window.Achievements && Achievements.init) Achievements.init();
    if (window.CGTutorial) CGTutorial.initTrigger('bagh-chal');
    if (window.PWF) try { PWF.init('bagh-chal'); } catch (e) {}

    sizeToWrap();
    updateScore();
    setStatus(turnStatus());
    initRoomMode();   // activates online sync + hides single-player controls if in a room
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial steps ──────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('bagh-chal', [
      {
        target: '#bg-canvas',
        title: 'The Board',
        body: 'Bagh-Chal is played on a 5×5 board of points connected by lines. Some points have diagonals too — these "strong" points give more directions.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#bg-canvas',
        title: 'You Are the Goats',
        body: 'You command 20 goats against 4 tigers. The tigers start on the corners. Goats are weak alone but win by surrounding the tigers.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#bg-canvas',
        title: 'Placement Phase',
        body: 'First, place your 20 goats one per turn on any empty point. You cannot move goats yet — the tigers move and hunt between your placements.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#bg-canvas',
        title: 'Tigers Capture by Jumping',
        body: 'A tiger jumps a single adjacent goat into the empty point beyond it (along a line), removing that goat. Five captured goats and the tigers win.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#bg-canvas',
        title: 'Win by Trapping',
        body: 'After all 20 goats are placed, move them one step at a time to box in the tigers. If no tiger can move or jump, the goats win.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#bg-new-btn',
        title: 'New Game',
        body: 'Start a fresh game any time from here.',
        position: 'left', highlight: true, beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('bagh-chal');
  }

  // ── Fullscreen resize hooks (checklist #3 — resize the canvas BUFFER) ───────
  if (window.FSMode) {
    FSMode.onEnter = function () { setTimeout(render, 50); };
    FSMode.onExit  = function () {
      setTimeout(function () {
        cnv.style.removeProperty('width');
        cnv.style.removeProperty('height');
        sizeToWrap();
      }, 50);
    };
  }

  window.GameResize = function (availW, availH) {
    if (!cnv || !ctx) return;
    var size = Math.min(availW, availH);
    var newCell = Math.floor((size - PAD * 2) / (COLS - 1));
    if (newCell < 30) newCell = 30;
    state.cellSize = newCell;
    var boardPx = (COLS - 1) * newCell;
    state.padX = Math.max(PAD, Math.round((availW - boardPx) / 2));
    state.padY = Math.max(PAD, Math.round((availH - boardPx) / 2));
    cnv.width  = availW;
    cnv.height = availH;
    render();
  };

  // ── Expose move logic for self-play / tests (node) ─────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      COLS: COLS, ROWS: ROWS, TOTAL: TOTAL,
      EMPTY: EMPTY, TIGER: TIGER, GOAT: GOAT, CORNERS: CORNERS,
      GRAPH: GRAPH, initialBoard: initialBoard, freshState: freshState,
      tigerMoves: tigerMoves, allTigerMoves: allTigerMoves,
      goatMoves: goatMoves, allGoatStepMoves: allGoatStepMoves,
      goatPlacements: goatPlacements, legalForState: legalForState,
      applyMoveToState: applyMoveToState, checkWinnerState: checkWinnerState,
      cloneSim: cloneSim,
      CAPTURE_TO_WIN: CAPTURE_TO_WIN, DRAW_NOPROGRESS: DRAW_NOPROGRESS,
    };
  }

}());
