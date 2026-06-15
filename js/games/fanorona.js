/**
 * fanorona.js - Fanorona (Madagascar strategy game)
 * Approach / withdrawal capture mechanics on a 5×9 intersection grid.
 */
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  var COLS = 9, ROWS = 5, TOTAL = 45;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var PAD = 44; // canvas padding to first intersection

  // ── Board helpers ────────────────────────────────────────────────────────
  function idx(c, r)  { return r * COLS + c; }
  function col(i)     { return i % COLS; }
  function row(i)     { return Math.floor(i / COLS); }
  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  function nextIdx(i, dc, dr) {
    var nc = col(i) + dc, nr = row(i) + dr;
    return inBounds(nc, nr) ? idx(nc, nr) : -1;
  }

  // ── Adjacency graph ──────────────────────────────────────────────────────
  // Strong points (col+row even) have 8-directional connections.
  // Weak points have 4 orthogonal connections only.
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

  // ── Initial board ────────────────────────────────────────────────────────
  function initialBoard() {
    var b = [];
    for (var i = 0; i < TOTAL; i++) {
      var r = row(i), c = col(i);
      if (r < 2)      b.push(WHITE);
      else if (r > 2) b.push(BLACK);
      else {
        if (c === 4)  b.push(EMPTY);
        else          b.push(c % 2 === 0 ? BLACK : WHITE);
      }
    }
    return b;
  }

  // ── State ────────────────────────────────────────────────────────────────
  var vsAI = true;
  var vsRoom     = false;
  var myRoomSeat = 0;
  var myFanColor = 0; // BLACK or WHITE, set in initRoomMode
  var gameVersion = 0;
  var state;

  function freshState() {
    return {
      board:            initialBoard(),
      turn:             BLACK,
      selected:         null,
      capturing:        null,     // piece mid-sequence
      visitedThisTurn:  [],       // indices visited during current sequence
      lastCapDir:       null,     // {dc,dr} of last capture
      history:          [],       // undo snapshots
      phase:            'playing',
      winner:           null,
      aiThinking:       false,
    };
  }

  // ── Move logic ───────────────────────────────────────────────────────────

  // All consecutive enemy pieces in a straight line from startIdx
  function captureLine(board, startIdx, dc, dr, enemy) {
    var caps = [], c = col(startIdx) + dc, r = row(startIdx) + dr;
    while (inBounds(c, r)) {
      var i = idx(c, r);
      if (board[i] !== enemy) break;
      caps.push(i);
      c += dc; r += dr;
    }
    return caps;
  }

  // All moves for a single piece. captureOnly=true skips paika.
  // visitedSet and lastCapDir restrict capture-sequence moves.
  function movesForPiece(fromIdx, board, visitedSet, lastCapDir, captureOnly) {
    var moves = [];
    var myColor = board[fromIdx];
    var enemy   = myColor === BLACK ? WHITE : BLACK;

    GRAPH[fromIdx].forEach(function (edge) {
      var to = edge.to, dc = edge.dc, dr = edge.dr;
      if (board[to] !== EMPTY) return;
      if (visitedSet && visitedSet.indexOf(to) !== -1) return;
      // Block repeating the same direction during a capture sequence.
      // Reversal (opposite direction) is a different direction and is allowed;
      // the visitedSet check above already prevents revisiting a position.
      if (lastCapDir) {
        if (dc === lastCapDir.dc  && dr === lastCapDir.dr)  return;
      }

      // Approach: enemy immediately beyond `to` in (dc, dr)
      var appC = col(to) + dc, appR = row(to) + dr;
      if (inBounds(appC, appR) && board[idx(appC, appR)] === enemy) {
        var aCaps = captureLine(board, to, dc, dr, enemy);
        moves.push({ from: fromIdx, to: to, dc: dc, dr: dr, type: 'approach', captures: aCaps });
      }

      // Withdrawal: enemy immediately behind `fromIdx` in -(dc, dr)
      var wdC = col(fromIdx) - dc, wdR = row(fromIdx) - dr;
      if (inBounds(wdC, wdR) && board[idx(wdC, wdR)] === enemy) {
        var wCaps = captureLine(board, fromIdx, -dc, -dr, enemy);
        moves.push({ from: fromIdx, to: to, dc: dc, dr: dr, type: 'withdrawal', captures: wCaps });
      }

      // Paika (non-capture) - only if not in forced-capture mode
      if (!captureOnly) {
        moves.push({ from: fromIdx, to: to, dc: dc, dr: dr, type: 'paika', captures: [] });
      }
    });
    return moves;
  }

  // All valid moves for a player. If any capture exists, only captures returned.
  // If capturingPiece !== null, only continuation moves for that piece.
  function allMoves(board, player, visitedSet, lastCapDir, capturingPiece) {
    if (capturingPiece !== null) {
      var cont = movesForPiece(capturingPiece, board, visitedSet, lastCapDir, true);
      return cont.filter(function (m) { return m.captures.length > 0; });
    }
    var captures = [], paikas = [];
    for (var i = 0; i < TOTAL; i++) {
      if (board[i] !== player) continue;
      var ms = movesForPiece(i, board, null, null, false);
      ms.forEach(function (m) {
        if (m.captures.length > 0) captures.push(m);
        else paikas.push(m);
      });
    }
    return captures.length > 0 ? captures : paikas;
  }

  function applyMove(board, move) {
    var b = board.slice();
    b[move.to]   = b[move.from];
    b[move.from] = EMPTY;
    move.captures.forEach(function (ci) { b[ci] = EMPTY; });
    return b;
  }

  function checkWinner(board) {
    var hasB = false, hasW = false;
    for (var i = 0; i < TOTAL; i++) {
      if (board[i] === BLACK) hasB = true;
      if (board[i] === WHITE) hasW = true;
    }
    if (!hasB) return WHITE;
    if (!hasW) return BLACK;
    return null;
  }

  // ── Canvas rendering ─────────────────────────────────────────────────────
  var cnv, ctx;

  var C = {
    bg:        '#C7A76C',   // raffia mat surround
    board:     '#4A2A1C',   // palissandre rosewood
    boardHi:   '#8A5638',
    line:      '#D9C49A',   // incised pale grooves
    strongPt:  '#D9C49A',   // worn cuvettes
    darkPiece: '#2F2B27',   // basalt pebble
    darkRing:  '#6E675D',
    darkShine: 'rgba(255,255,255,0.16)',
    lightPiece:'#EDE5D3',   // quartz pebble
    lightRing: '#A9894F',
    lightShine:'rgba(255,255,255,0.55)',
    selected:  '#E0973E',   // market amber glow
    validDot:  'rgba(110,131,69,0.55)',  // rice-terrace green
    capRing:   '#A8432A',   // laterite red
  };

  function cellSize()        { return (cnv.width - PAD * 2) / (COLS - 1); }
  function ptXY(c, r) {
    var cs = cellSize();
    var dc = (vsRoom && myRoomSeat === 1) ? (COLS - 1 - c) : c;
    var dr = (vsRoom && myRoomSeat === 1) ? (ROWS - 1 - r) : r;
    return { x: PAD + dc * cs, y: PAD + dr * cs };
  }
  function hitTest(x, y) {
    var cs = cellSize(), snap = cs * 0.52, best = null, bestD = Infinity;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var pt = ptXY(c, r);
        var d  = Math.hypot(x - pt.x, y - pt.y);
        if (d < snap && d < bestD) { bestD = d; best = idx(c, r); }
      }
    }
    return best;
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

    var cs = cellSize();
    var pr = cs * 0.28; // piece radius

    // ── Board surface
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cnv.width, cnv.height);

    // Raffia weave across the whole mat (deterministic, no random)
    ctx.fillStyle = 'rgba(169,137,79,0.28)';
    for (var ry = 0; ry < cnv.height; ry += 7) {
      ctx.fillRect(0, ry, cnv.width, 2);
    }
    ctx.fillStyle = 'rgba(169,137,79,0.18)';
    for (var rx = 0; rx < cnv.width; rx += 16) {
      ctx.fillRect(rx, 0, 3, cnv.height);
    }

    var bx = PAD - cs * 0.52, by = PAD - cs * 0.52;
    var bw = (COLS - 1) * cs + cs * 1.04, bh = (ROWS - 1) * cs + cs * 1.04;
    ctx.fillStyle = C.board;
    drawRoundRect(bx, by, bw, bh, 8); ctx.fill();

    // Rosewood grain — clipped to the plank
    ctx.save();
    drawRoundRect(bx, by, bw, bh, 8); ctx.clip();
    var darkFracs = [0.14, 0.33, 0.52, 0.71, 0.88];
    var darkHts   = [3, 2, 4, 2, 3];
    ctx.fillStyle = 'rgba(51,31,21,0.30)';
    for (var gi = 0; gi < darkFracs.length; gi++) {
      ctx.fillRect(bx, by + bh * darkFracs[gi], bw, darkHts[gi]);
    }
    ctx.fillStyle = 'rgba(138,86,56,0.22)';
    ctx.fillRect(bx, by + bh * 0.24, bw, 3);
    ctx.fillRect(bx, by + bh * 0.62, bw, 2);
    ctx.restore();

    // Subtle top sheen on the plank
    ctx.fillStyle = C.boardHi;
    ctx.globalAlpha = 0.12;
    drawRoundRect(bx + 2, by + 2, bw - 4, bh * 0.25, 6); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Draw edges (carved grooves — shadow then pale incision)
    var drawn = {};
    for (var i = 0; i < TOTAL; i++) {
      var p1 = ptXY(col(i), row(i));
      GRAPH[i].forEach(function (edge) {
        var key = i < edge.to ? i + ',' + edge.to : edge.to + ',' + i;
        if (drawn[key]) return;
        drawn[key] = true;
        var p2 = ptXY(col(edge.to), row(edge.to));
        // groove shadow, offset down-right
        ctx.beginPath();
        ctx.moveTo(p1.x + 1, p1.y + 1);
        ctx.lineTo(p2.x + 1, p2.y + 1);
        ctx.strokeStyle = 'rgba(31,18,12,0.5)';
        ctx.lineWidth   = 2;
        ctx.stroke();
        // pale incision
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = C.line;
        ctx.lineWidth   = 2;
        ctx.stroke();
      });
    }

    // ── Strong points: worn cuvettes (shallow rubbed hollows)
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if ((c + r) % 2 !== 0) continue;
        var pt = ptXY(c, r);
        var cr = cs * 0.10;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, cr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(217,196,154,0.16)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, cr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217,196,154,0.55)';
        ctx.lineWidth   = 1.2;
        ctx.stroke();
      }
    }

    // ── Determine valid-move targets
    var validMoves = [];
    var src = state.capturing !== null ? state.capturing : state.selected;
    if (src !== null) {
      validMoves = allMoves(state.board, state.board[src],
        state.visitedThisTurn, state.lastCapDir, state.capturing);
    }
    var validTargets = {};
    validMoves.forEach(function (m) {
      if (!validTargets[m.to]) validTargets[m.to] = [];
      validTargets[m.to].push(m);
    });

    // ── Hint mode: highlight all moveable pieces + all their targets
    if (showHints && state.phase === 'playing' && state.capturing === null) {
      var hintMoves = allMoves(state.board, state.turn, null, null, null);
      var hintSources = {}, hintTargets = {};
      hintMoves.forEach(function (m) { hintSources[m.from] = true; hintTargets[m.to] = true; });

      // Glow ring around moveable pieces
      Object.keys(hintSources).forEach(function (fi) {
        var pt = ptXY(col(+fi), row(+fi));
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pr + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(224,151,62,0.55)';
        ctx.lineWidth   = 2;
        ctx.stroke();
      });

      // Soft dot on all reachable targets
      Object.keys(hintTargets).forEach(function (tIdx) {
        var pt = ptXY(col(+tIdx), row(+tIdx));
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pr * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(224,151,62,0.20)';
        ctx.fill();
      });
    }

    // ── Valid move dots (for selected piece)
    Object.keys(validTargets).forEach(function (tIdx) {
      var pt = ptXY(col(+tIdx), row(+tIdx));
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pr * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = C.validDot;
      ctx.fill();
    });

    // ── Capture target rings (enemy pieces that would be taken)
    validMoves.forEach(function (m) {
      m.captures.forEach(function (ci) {
        var pt = ptXY(col(ci), row(ci));
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.capRing;
        ctx.lineWidth   = 2;
        ctx.stroke();
      });
    });

    // ── Pieces
    for (var pi = 0; pi < TOTAL; pi++) {
      if (state.board[pi] === EMPTY) continue;
      var pt2     = ptXY(col(pi), row(pi));
      var isBlack = state.board[pi] === BLACK;
      var isSel   = pi === state.selected || pi === state.capturing;

      // Shadow (squashed pebble footprint)
      ctx.beginPath();
      ctx.ellipse(pt2.x + 1.5, pt2.y + 2, pr, pr * 0.94, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fill();

      // Body — water-rounded stone with radial sheen
      var grad = ctx.createRadialGradient(
        pt2.x - pr * 0.3, pt2.y - pr * 0.32, pr * 0.1,
        pt2.x, pt2.y, pr);
      if (isBlack) {
        grad.addColorStop(0,    '#565048');
        grad.addColorStop(0.55, '#2F2B27');
        grad.addColorStop(1,    '#1E1B18');
      } else {
        grad.addColorStop(0,   '#FBF6E9');
        grad.addColorStop(0.5, '#EDE5D3');
        grad.addColorStop(1,   '#C8BFA9');
      }
      ctx.beginPath();
      ctx.ellipse(pt2.x, pt2.y, pr, pr * 0.94, 0, 0, Math.PI * 2);
      ctx.fillStyle   = grad;
      ctx.fill();
      ctx.strokeStyle = isBlack ? C.darkRing : C.lightRing;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Shine
      ctx.beginPath();
      ctx.arc(pt2.x - pr * 0.28, pt2.y - pr * 0.28, pr * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = isBlack ? C.darkShine : C.lightShine;
      ctx.fill();

      // Selection ring
      if (isSel) {
        ctx.beginPath();
        ctx.arc(pt2.x, pt2.y, pr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.selected;
        ctx.lineWidth   = 2.5;
        ctx.stroke();
      }
    }
  }

  // ── UI helpers ───────────────────────────────────────────────────────────
  var elStatus, elScore, elNewBtn, elUndoBtn, elHintBtn, elAiToggle;
  var showHints = false;

  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function updateScore() {
    if (!elScore) return;
    var blacks = 0, whites = 0;
    state.board.forEach(function (v) {
      if (v === BLACK) blacks++;
      else if (v === WHITE) whites++;
    });
    var blackLabel, whiteLabel;
    if (vsAI) {
      blackLabel = 'You';
      whiteLabel = 'AI';
    } else {
      blackLabel = 'Dark';
      whiteLabel = 'Light';
    }
    elScore.innerHTML =
      '<span class="fn-score__you">&#9679; ' + blackLabel + '&nbsp;' + blacks + '</span>' +
      '<span class="fn-score__ai">' + whiteLabel + '&nbsp;' + whites + '&#9675;</span>';
  }

  // ── Human interaction ────────────────────────────────────────────────────
  function humanClick(intersIdx) {
    if (state.phase !== 'playing') return;
    if (state.aiThinking) return;
    if (vsAI && state.turn === WHITE) return;

    var b = state.board;

    // Mid-capture sequence
    if (state.capturing !== null) {
      var contMoves = allMoves(b, b[state.capturing],
        state.visitedThisTurn, state.lastCapDir, state.capturing);
      var seqMove = null;
      for (var k = 0; k < contMoves.length; k++) {
        if (contMoves[k].to === intersIdx) { seqMove = contMoves[k]; break; }
      }
      if (seqMove) {
        executeMove(seqMove, true);
      } else {
        // Click anywhere invalid = end sequence
        endTurn();
      }
      return;
    }

    // No piece selected
    if (state.selected === null) {
      if (b[intersIdx] === state.turn) {
        var avail = allMoves(b, state.turn, null, null, null);
        var hasMoves = avail.some(function (m) { return m.from === intersIdx; });
        if (hasMoves) { state.selected = intersIdx; render(); }
      }
      return;
    }

    // Clicked own piece: re-select
    if (b[intersIdx] === state.turn && intersIdx !== state.selected) {
      var avail2 = allMoves(b, state.turn, null, null, null);
      var hasMoves2 = avail2.some(function (m) { return m.from === intersIdx; });
      if (hasMoves2) { state.selected = intersIdx; render(); }
      else            { state.selected = null;      render(); }
      return;
    }

    // Deselect
    if (intersIdx === state.selected) {
      state.selected = null; render(); return;
    }

    // Try move
    var avail3 = allMoves(b, state.turn, null, null, null);
    var candidates = avail3.filter(function (m) {
      return m.from === state.selected && m.to === intersIdx;
    });
    if (candidates.length === 0) {
      state.selected = null; render(); return;
    }
    // Prefer approach when both options exist for the same target
    var chosen = candidates.find(function (m) { return m.type === 'approach'; }) || candidates[0];
    executeMove(chosen, false);
  }

  function executeMove(move, inSequence) {
    if (!inSequence) {
      // Save undo snapshot at the start of a full turn
      var snap = {
        board: state.board.slice(),
        turn:  state.turn,
      };
      state.history.push(snap);
      if (state.history.length > 20) state.history.shift();
    }

    state.board    = applyMove(state.board, move);
    state.selected = null;

    if (move.captures.length > 0) {
      state.visitedThisTurn.push(move.from);
      state.lastCapDir = { dc: move.dc, dr: move.dr };
      state.capturing  = move.to;

      // Check if continuation is possible
      var contMoves = allMoves(
        state.board, state.board[move.to],
        state.visitedThisTurn, state.lastCapDir, move.to
      );

      updateScore();
      render();

      if (contMoves.length > 0) {
        if (vsAI && state.turn === WHITE) {
          setStatus('AI capturing…');
          scheduleAIContinue(contMoves);
        } else {
          setStatus('Continue capturing, or click elsewhere to end turn.');
        }
        return; // stay in sequence
      }
    }

    endTurn();
  }

  function endTurn() {
    state.aiThinking       = false;
    state.capturing        = null;
    state.visitedThisTurn  = [];
    state.lastCapDir       = null;
    state.selected         = null;

    var winner = checkWinner(state.board);
    if (winner !== null) {
      state.phase  = 'over';
      state.winner = winner;
      setStatus(winner === BLACK ? '🎉 You win! All white pieces captured.' : 'AI wins. Better luck next time!');
      updateScore();
      render();
      if (window.Auth && Auth.isLoggedIn())
        Auth.recordResult('fanorona', winner === BLACK ? 'win' : 'loss');
      return;
    }

    state.turn = state.turn === BLACK ? WHITE : BLACK;

    var nextMoves = allMoves(state.board, state.turn, null, null, null);
    if (nextMoves.length === 0) {
      // A player with no legal moves loses (per the rules).
      var blockedLoser = state.turn;
      var blockWinner  = blockedLoser === BLACK ? WHITE : BLACK;
      state.phase  = 'over';
      state.winner = blockWinner;
      setStatus(blockWinner === BLACK
        ? '🎉 You win! Opponent has no legal moves.'
        : 'AI wins. You have no legal moves.');
      updateScore(); render();
      if (window.Auth && Auth.isLoggedIn())
        Auth.recordResult('fanorona', blockWinner === BLACK ? 'win' : 'loss');
      return;
    }

    updateScore(); render();

    if (vsAI && state.turn === WHITE) {
      state.aiThinking = true;
      setStatus('AI is thinking…');
      scheduleAIMove();
    } else {
      setStatus(state.turn === BLACK ? 'Your turn - select a piece.' : 'Player 2 - select a piece.');
    }
    if (vsRoom) syncRoomState();
  }

  // ── AI ───────────────────────────────────────────────────────────────────
  function countPieces(board, color) {
    var n = 0;
    for (var i = 0; i < TOTAL; i++) if (board[i] === color) n++;
    return n;
  }

  function scoreBoard(board) {
    return countPieces(board, WHITE) - countPieces(board, BLACK);
  }

  function minimax(board, depth, alpha, beta, player, visitedSet, lastCapDir, capPiece) {
    var winner = checkWinner(board);
    if (winner === WHITE) return  1000 + depth;
    if (winner === BLACK) return -1000 - depth;

    var moves = allMoves(board, player, visitedSet, lastCapDir, capPiece);
    // A player with no legal moves loses, so treat it like a terminal loss
    // for the side to move (mirrors the checkWinner returns above).
    if (moves.length === 0) return player === WHITE ? -1000 - depth : 1000 + depth;
    if (depth === 0) return scoreBoard(board);

    var isMax = player === WHITE;

    if (isMax) {
      var best = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        var m  = moves[i];
        var nb = applyMove(board, m);
        var val;
        if (m.captures.length > 0) {
          var nv = visitedSet.concat([m.from]);
          var nd = { dc: m.dc, dr: m.dr };
          var nc = allMoves(nb, WHITE, nv, nd, m.to);
          val = nc.length > 0
            ? minimax(nb, depth - 1, alpha, beta, WHITE, nv, nd, m.to)
            : minimax(nb, depth - 1, alpha, beta, BLACK, [], null, null);
        } else {
          val = minimax(nb, depth - 1, alpha, beta, BLACK, [], null, null);
        }
        if (val > best) best = val;
        alpha = Math.max(alpha, best);
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var best2 = Infinity;
      for (var j = 0; j < moves.length; j++) {
        var m2  = moves[j];
        var nb2 = applyMove(board, m2);
        var val2;
        if (m2.captures.length > 0) {
          var nv2 = visitedSet.concat([m2.from]);
          var nd2 = { dc: m2.dc, dr: m2.dr };
          var nc2 = allMoves(nb2, BLACK, nv2, nd2, m2.to);
          val2 = nc2.length > 0
            ? minimax(nb2, depth - 1, alpha, beta, BLACK, nv2, nd2, m2.to)
            : minimax(nb2, depth - 1, alpha, beta, WHITE, [], null, null);
        } else {
          val2 = minimax(nb2, depth - 1, alpha, beta, WHITE, [], null, null);
        }
        if (val2 < best2) best2 = val2;
        beta = Math.min(beta, best2);
        if (alpha >= beta) break;
      }
      return best2;
    }
  }

  function getBestAIMove(board, visitedSet, lastCapDir, capPiece) {
    var moves = allMoves(board, WHITE, visitedSet || [], lastCapDir, capPiece);
    if (!moves.length) return null;
    var best = -Infinity, bestMove = null;
    moves.forEach(function (m) {
      var nb  = applyMove(board, m);
      var val;
      if (m.captures.length > 0) {
        var nv = (visitedSet || []).concat([m.from]);
        var nd = { dc: m.dc, dr: m.dr };
        var nc = allMoves(nb, WHITE, nv, nd, m.to);
        val = nc.length > 0
          ? minimax(nb, 2, -Infinity, Infinity, WHITE, nv, nd, m.to)
          : minimax(nb, 2, -Infinity, Infinity, BLACK, [], null, null);
      } else {
        val = minimax(nb, 2, -Infinity, Infinity, BLACK, [], null, null);
      }
      if (val > best) { best = val; bestMove = m; }
    });
    return bestMove;
  }

  function scheduleAIMove() {
    var ver = gameVersion;
    setTimeout(function () {
      if (window.CGTutorial && CGTutorial.isActive) return;
      if (ver !== gameVersion || state.phase !== 'playing') return;
      var move = getBestAIMove(state.board, [], null, null);
      if (!move) { endTurn(); return; }
      state.aiThinking = false;
      executeMove(move, false);
    }, 380);
  }

  function scheduleAIContinue(contMoves) {
    var ver = gameVersion;
    setTimeout(function () {
      if (ver !== gameVersion || state.phase !== 'playing') return;
      // Pick continuation with most captures
      var best = contMoves[0];
      contMoves.forEach(function (m) {
        if (m.captures.length > best.captures.length) best = m;
      });
      executeMove(best, true);
    }, 300);
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  function newGame() {
    gameVersion++;
    state = freshState();
    updateScore();
    setStatus('Your turn - select a dark piece.');
    render();
  }

  function undo() {
    if (!state.history.length) return;
    if (state.capturing !== null) return;
    if (state.aiThinking) return;
    gameVersion++;
    var prev      = state.history.pop();
    state.board   = prev.board;
    state.turn    = prev.turn;
    state.capturing       = null;
    state.visitedThisTurn = [];
    state.lastCapDir      = null;
    state.selected        = null;
    state.phase           = 'playing';
    state.winner          = null;
    state.aiThinking      = false;
    updateScore();
    setStatus('Your turn - select a dark piece.');
    render();
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function resizeCanvas() {
    var wrap = document.getElementById('fn-board-wrap');
    if (!wrap) return;
    var scale = window.CGMobileScale || 1;
    var w = Math.round(wrap.clientWidth * scale);
    cnv.width  = w;
    cnv.height = Math.round(w * (ROWS - 1) / (COLS - 1)) + PAD * 2;
    render();
  }

  function getCanvasXY(e) {
    var rect   = cnv.getBoundingClientRect();
    var scaleX = cnv.width  / rect.width;
    var scaleY = cnv.height / rect.height;
    var src    = e.touches ? e.changedTouches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  function syncRoomState() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      board:    state.board.slice(),
      turn:     state.turn,
      phase:    state.phase,
      winner:   state.winner,
      last_actor: 'room:' + myRoomSeat,
    });
    if (state.winner !== null && state.winner !== undefined) {
      RoomBridge.reportWin(state.winner === BLACK ? 0 : 1);
    }
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + myRoomSeat) return;
    state.board    = data.board  || state.board;
    state.turn     = data.turn   !== undefined ? data.turn   : state.turn;
    state.phase    = data.phase  || state.phase;
    state.winner   = data.winner !== undefined ? data.winner : state.winner;
    state.selected = null;
    state.capturing = null;
    state.visitedThisTurn = [];
    state.aiThinking = false;
    render();
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive()) return;
    vsRoom      = true;
    myRoomSeat  = RoomBridge.getSeat();
    myFanColor  = myRoomSeat === 0 ? BLACK : WHITE;
    vsAI        = false;
    RoomBridge.onState(receiveRoomState);
    if (myRoomSeat === 0) syncRoomState();
    // Hide non-room UI
    if (elNewBtn)   elNewBtn.style.display   = 'none';
    if (elAiToggle) {
      var aiToggleWrap = elAiToggle.closest('.fn-ai-toggle-wrap') || elAiToggle.parentElement;
      if (aiToggleWrap) aiToggleWrap.style.display = 'none';
      else elAiToggle.style.display = 'none';
    }
  }

  function init() {
    cnv = document.getElementById('fn-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    elStatus   = document.getElementById('fn-status');
    elScore    = document.getElementById('fn-score');
    elNewBtn   = document.getElementById('fn-new-btn');
    elUndoBtn  = document.getElementById('fn-undo-btn');
    elHintBtn  = document.getElementById('fn-hint-btn');
    elAiToggle = document.getElementById('fn-ai-toggle');

    cnv.addEventListener('click', function (e) {
      if (vsRoom && state.turn !== myFanColor) return;
      var xy = getCanvasXY(e);
      var i  = hitTest(xy.x, xy.y);
      if (i !== null) humanClick(i);
    });
    cnv.addEventListener('touchend', function (e) {
      if (vsRoom && state.turn !== myFanColor) return;
      e.preventDefault();
      var xy = getCanvasXY(e);
      var i  = hitTest(xy.x, xy.y);
      if (i !== null) humanClick(i);
    }, { passive: false });

    if (elNewBtn)  elNewBtn.addEventListener('click', newGame);
    if (elUndoBtn) elUndoBtn.addEventListener('click', undo);
    if (elHintBtn) {
      elHintBtn.addEventListener('click', function () {
        showHints = !showHints;
        elHintBtn.textContent = showHints ? 'Hide Moves' : 'Show Moves';
        elHintBtn.style.color       = showHints ? '#e8c87a' : '';
        elHintBtn.style.borderColor = showHints ? '#e8c87a' : '';
        render();
      });
    }
    if (elAiToggle) {
      elAiToggle.addEventListener('change', function () {
        vsAI = elAiToggle.checked;
        newGame();
      });
    }

    window.addEventListener('resize', resizeCanvas);
    window.cgMobileResize = resizeCanvas;
    state = freshState();
    resizeCanvas();
    updateScore();
    setStatus('Your turn - select a dark piece.');
    initRoomMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial steps ──────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('fanorona', [
      {
        target: '#fn-canvas',
        title: 'The Board',
        body: 'This is the Fanorona board - 5×9 intersections connected by lines. Pieces move along these lines, one step at a time.',
        position: 'bottom',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#fn-canvas',
        title: 'Your Pieces',
        body: 'You play the lighter pieces. Your goal is to capture all of your opponent\'s darker pieces.',
        position: 'bottom',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#fn-canvas',
        title: 'How to Move',
        body: 'Click a piece, then click a connected intersection to move. Capturing moves are mandatory when available.',
        position: 'bottom',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#fn-canvas',
        title: 'Capturing',
        body: 'Capture by Approach (move toward enemy pieces) or Withdrawal (move away). All enemy pieces in that line are removed.',
        position: 'top',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#fn-hint-btn',
        title: 'Need a Hint?',
        body: 'Press "Show Moves" to highlight all legal moves for the selected piece.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#fn-ai-toggle',
        title: 'Play vs AI',
        body: 'Toggle the AI on or off. With AI on, your opponent plays automatically.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#fn-new-btn',
        title: 'New Game',
        body: 'Click here any time to start a fresh game.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('fanorona');
  }

  // ── Fullscreen resize hooks ────────────────────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { _fsResize(); };
    FSMode.onExit  = function () { _fsResize(); };
  }

  function _fsResize() {
    setTimeout(function () {
      if (typeof render === 'function') render();
    }, 50);
  }

  window.GameResize = function (availW, availH) {
    if (!cnv) return;
    // Keep aspect ratio: board is (COLS-1)/(ROWS-1) wide-to-tall plus PAD*2
    var maxW = availW;
    var maxH = availH;
    var aspectW = COLS - 1;
    var aspectH = ROWS - 1;
    var w = maxW;
    var h = Math.round(w * aspectH / aspectW) + PAD * 2;
    if (h > maxH) {
      h = maxH;
      w = Math.round((h - PAD * 2) * aspectW / aspectH);
    }
    cnv.width  = Math.max(w, 100);
    cnv.height = Math.max(h, 100);
    render();
  };

}());
