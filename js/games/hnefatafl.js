/**
 * hnefatafl.js — Hnefatafl (Copenhagen rules, 11×11)
 * Asymmetric Viking board game.
 * Defenders escort the King to a corner; attackers try to capture him.
 */
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var SIZE     = 11;
  var EMPTY    = 0;
  var ATTACKER = 1;
  var DEFENDER = 2;
  var KING     = 3;

  var CORNER_CELLS = [[0,0],[0,10],[10,0],[10,10]];
  var THRONE_R = 5, THRONE_C = 5;

  function isCorner(r, c) {
    return (r === 0 || r === 10) && (c === 0 || c === 10);
  }
  function isThrone(r, c) {
    return r === THRONE_R && c === THRONE_C;
  }
  // Hostile squares act as capture partners for both sides, always.
  function isHostile(r, c) {
    return isCorner(r, c) || isThrone(r, c);
  }

  // ── Starting layout (Copenhagen 11×11) ───────────────────────────────────
  var INITIAL_BOARD = (function () {
    var b = [];
    for (var i = 0; i < SIZE; i++) b.push(new Array(SIZE).fill(EMPTY));

    b[5][5] = KING;

    // 12 defenders in cross around king
    [[3,5],[4,4],[4,5],[4,6],
     [5,3],[5,4],      [5,6],[5,7],
     [6,4],[6,5],[6,6],[7,5]].forEach(function(p){ b[p[0]][p[1]] = DEFENDER; });

    // 24 attackers on four edges
    [[0,3],[0,4],[0,5],[0,6],[0,7],[1,5],      // top
     [10,3],[10,4],[10,5],[10,6],[10,7],[9,5],  // bottom
     [3,0],[4,0],[5,0],[6,0],[7,0],[5,1],       // left
     [3,10],[4,10],[5,10],[6,10],[7,10],[5,9]   // right
    ].forEach(function(p){ b[p[0]][p[1]] = ATTACKER; });

    return b;
  }());

  // ── Canvas / sizing ───────────────────────────────────────────────────────
  var canvas, ctx;
  var CELL = 50;   // px per cell — recalculated on resize
  var PAD  = 28;   // canvas padding around board

  function csz() { return PAD * 2 + SIZE * CELL; }
  function cx(c)  { return PAD + c * CELL + CELL / 2; }
  function cy(r)  { return PAD + r * CELL + CELL / 2; }

  function cellFromPx(x, y) {
    var c = Math.floor((x - PAD) / CELL);
    var r = Math.floor((y - PAD) / CELL);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return [r, c];
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var vsAI       = true;
  var humanSide  = ATTACKER;
  var aiTimer    = null;
  var resizeTimer = null;
  var vsRoom     = false;
  var myRoomSeat = 0;
  var state;

  function freshState() {
    return {
      board:              INITIAL_BOARD.map(function(r){ return r.slice(); }),
      turn:               ATTACKER,
      selected:           null,
      validMoves:         [],
      gameOver:           false,
      winner:             null,
      capturedAttackers:  0,
      capturedDefenders:  0,
      moveCount:          0,
      boardHistory:       [],
      log:                [],
    };
  }

  // ── Move generation ───────────────────────────────────────────────────────
  function getValidMoves(r, c) {
    var piece = state.board[r][c];
    var moves = [];
    var dirs  = [[-1,0],[1,0],[0,-1],[0,1]];
    dirs.forEach(function(d) {
      var nr = r + d[0], nc = c + d[1];
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        if (state.board[nr][nc] !== EMPTY) break;
        if (isCorner(nr, nc)  && piece !== KING) { nr += d[0]; nc += d[1]; continue; }
        if (isThrone(nr, nc)  && piece !== KING) { nr += d[0]; nc += d[1]; continue; }
        moves.push([nr, nc]);
        nr += d[0]; nc += d[1];
      }
    });
    return moves;
  }

  function getAllMoves(side) {
    var moves = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = state.board[r][c];
        if (side === ATTACKER && p !== ATTACKER) continue;
        if (side === DEFENDER && p !== DEFENDER && p !== KING) continue;
        getValidMoves(r, c).forEach(function(t) {
          moves.push({ fr: r, fc: c, tr: t[0], tc: t[1] });
        });
      }
    }
    return moves;
  }

  // ── Capture helpers ───────────────────────────────────────────────────────
  function isEnemy(piece, side) {
    if (side === ATTACKER) return piece === DEFENDER || piece === KING;
    return piece === ATTACKER;
  }

  function isFriendly(piece, side) {
    if (side === ATTACKER) return piece === ATTACKER;
    return piece === DEFENDER || piece === KING;
  }

  function isCapturePartner(r, c, side) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
    return isFriendly(state.board[r][c], side) || isHostile(r, c);
  }

  // ── Custodian captures ────────────────────────────────────────────────────
  function resolveCaptures(toR, toC, side) {
    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    dirs.forEach(function(d) {
      var nr = toR + d[0], nc = toC + d[1];
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return;
      var p = state.board[nr][nc];
      if (!isEnemy(p, side) || p === KING) return;
      var or2 = nr + d[0], oc2 = nc + d[1];
      if (isCapturePartner(or2, oc2, side)) {
        if (p === ATTACKER) state.capturedAttackers++;
        else                state.capturedDefenders++;
        state.board[nr][nc] = EMPTY;
      }
    });

    // Shieldwall captures along all four edges
    resolveShieldwalls(side);
  }

  function resolveShieldwalls(side) {
    var edges = [
      { isRow: true,  fixed: 0  },
      { isRow: true,  fixed: 10 },
      { isRow: false, fixed: 0  },
      { isRow: false, fixed: 10 },
    ];
    edges.forEach(function(edge) {
      var i = 0;
      while (i <= 10) {
        var r = edge.isRow ? edge.fixed : i;
        var c = edge.isRow ? i : edge.fixed;
        var p = state.board[r][c];
        // Start of an enemy run (non-king enemies)
        if (isEnemy(p, side) && p !== KING) {
          var runStart = i;
          while (i <= 10) {
            var rr = edge.isRow ? edge.fixed : i;
            var rc = edge.isRow ? i : edge.fixed;
            var ep = state.board[rr][rc];
            if (!isEnemy(ep, side) || ep === KING) break;
            i++;
          }
          var runEnd = i - 1;
          if (runEnd - runStart < 1) continue; // Need at least 2 pieces

          // Check both flanks
          var bR = edge.isRow ? edge.fixed : runStart - 1;
          var bC = edge.isRow ? runStart - 1 : edge.fixed;
          var aR = edge.isRow ? edge.fixed : runEnd + 1;
          var aC = edge.isRow ? runEnd + 1  : edge.fixed;

          var beforeOk = (runStart === 0) || isCapturePartner(bR, bC, side);
          var afterOk  = (runEnd   === 10) || isCapturePartner(aR, aC, side);

          if (beforeOk && afterOk) {
            for (var j = runStart; j <= runEnd; j++) {
              var cr = edge.isRow ? edge.fixed : j;
              var cc = edge.isRow ? j : edge.fixed;
              var cp = state.board[cr][cc];
              if (cp !== EMPTY && cp !== KING) {
                if (cp === ATTACKER) state.capturedAttackers++;
                else                 state.capturedDefenders++;
                state.board[cr][cc] = EMPTY;
              }
            }
          }
        } else {
          i++;
        }
      }
    });
  }

  // ── King capture check ────────────────────────────────────────────────────
  function findKing() {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (state.board[r][c] === KING) return [r, c];
    return null;
  }

  function isKingCaptured() {
    var kp = findKing();
    if (!kp) return true;
    var kr = kp[0], kc = kp[1];
    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    return dirs.every(function(d) {
      var nr = kr + d[0], nc = kc + d[1];
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return true;
      return state.board[nr][nc] === ATTACKER || isHostile(nr, nc);
    });
  }

  // ── Win / draw detection ──────────────────────────────────────────────────
  function boardHash() {
    return state.board.map(function(row){ return row.join(''); }).join('|') + ':' + state.turn;
  }

  function checkWinConditions() {
    // King escapes
    var kp = findKing();
    if (kp && isCorner(kp[0], kp[1])) { endGame('defender'); return true; }

    // King captured
    if (isKingCaptured()) { endGame('attacker'); return true; }

    // Threefold repetition
    var hash = boardHash();
    var reps = 0;
    for (var i = 0; i < state.boardHistory.length; i++) {
      if (state.boardHistory[i] === hash) reps++;
    }
    if (reps >= 2) { endGame('draw'); return true; }
    state.boardHistory.push(hash);
    return false;
  }

  function endGame(winner) {
    state.gameOver = true;
    state.winner   = winner;
    updateHUD();
    render();
    if (!vsRoom && window.Auth && Auth.recordResult) {
      var outcome = winner === 'draw' ? 'draw'
                  : winner === humanSide ? 'win' : 'loss';
      Auth.recordResult('hnefatafl', outcome);
    }
  }

  // ── Execute move ──────────────────────────────────────────────────────────
  function executeMove(fr, fc, tr, tc) {
    var piece = state.board[fr][fc];
    var side  = (piece === ATTACKER) ? ATTACKER : DEFENDER;

    state.board[tr][tc] = piece;
    state.board[fr][fc] = EMPTY;
    state.moveCount++;

    resolveCaptures(tr, tc, side);

    addLog(piece, fr, fc, tr, tc);

    if (checkWinConditions()) {
      if (vsRoom) syncRoomState();
      return;
    }

    state.turn       = (state.turn === ATTACKER) ? DEFENDER : ATTACKER;
    state.selected   = null;
    state.validMoves = [];

    if (vsRoom) syncRoomState();

    updateHUD();
    render();

    if (vsAI && !state.gameOver && state.turn !== humanSide) {
      aiTimer = setTimeout(aiTakeTurn, 500);
    }
  }

  // ── Click / touch input ───────────────────────────────────────────────────
  function getCanvasPt(e) {
    var rect   = canvas.getBoundingClientRect();
    var scaleX = canvas.width  / rect.width;
    var scaleY = canvas.height / rect.height;
    var cx2    = e.touches ? e.touches[0].clientX : e.clientX;
    var cy2    = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx2 - rect.left) * scaleX, y: (cy2 - rect.top) * scaleY };
  }

  function isOwnPiece(piece, turn) {
    if (turn === ATTACKER) return piece === ATTACKER;
    return piece === DEFENDER || piece === KING;
  }

  function handleClick(e) {
    e.preventDefault();
    if (state.gameOver) return;
    if (vsRoom && (humanSide < 0 || state.turn !== humanSide)) return;
    if (vsAI && state.turn !== humanSide) return;

    var pt   = getCanvasPt(e);
    var cell = cellFromPx(pt.x, pt.y);
    if (!cell) return;
    var r = cell[0], c = cell[1];
    var piece = state.board[r][c];

    if (state.selected) {
      var sr = state.selected[0], sc = state.selected[1];
      // Valid destination — execute
      var isValid = state.validMoves.some(function(m){ return m[0]===r && m[1]===c; });
      if (isValid) { executeMove(sr, sc, r, c); return; }
      // Another own piece — switch selection
      if (isOwnPiece(piece, state.turn)) { selectPiece(r, c); return; }
      // Deselect
      state.selected   = null;
      state.validMoves = [];
      render();
      return;
    }

    if (isOwnPiece(piece, state.turn)) selectPiece(r, c);
  }

  function selectPiece(r, c) {
    state.selected   = [r, c];
    state.validMoves = getValidMoves(r, c);
    render();
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  function aiTakeTurn() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.gameOver) return;
    var side  = state.turn;
    var moves = getAllMoves(side);
    if (!moves.length) return;

    var best = moves[0], bestScore = -Infinity;
    moves.forEach(function(mv) {
      var s = scoreMove(mv, side);
      if (s > bestScore) { bestScore = s; best = mv; }
    });

    // Flash chosen move briefly
    state.selected   = [best.fr, best.fc];
    state.validMoves = [[best.tr, best.tc]];
    render();

    setTimeout(function() {
      state.selected   = null;
      state.validMoves = [];
      executeMove(best.fr, best.fc, best.tr, best.tc);
    }, 320);
  }

  function scoreMove(mv, side) {
    var score   = 0;
    var board   = state.board;
    var piece   = board[mv.fr][mv.fc];
    var kp      = findKing();

    if (side === ATTACKER) {
      // Close in on king
      if (kp) {
        var distBefore = Math.abs(mv.fr - kp[0]) + Math.abs(mv.fc - kp[1]);
        var distAfter  = Math.abs(mv.tr - kp[0]) + Math.abs(mv.tc - kp[1]);
        score += (distBefore - distAfter) * 3;
      }
      // Simulate captures
      score += countCaptures(mv.tr, mv.tc, side, mv.fr, mv.fc) * 12;
      // Prefer moves that tighten around king
      if (kp) {
        var kr = kp[0], kc2 = kp[1];
        var sameLine = (mv.tr === kr || mv.tc === kc2);
        if (sameLine) score += 5;
      }

    } else {
      // Defender: steer king toward corners
      if (piece === KING) {
        var minDist = 99;
        CORNER_CELLS.forEach(function(cp) {
          var d = Math.abs(mv.tr - cp[0]) + Math.abs(mv.tc - cp[1]);
          if (d < minDist) minDist = d;
        });
        var minDistBefore = 99;
        CORNER_CELLS.forEach(function(cp) {
          var d = Math.abs(mv.fr - cp[0]) + Math.abs(mv.fc - cp[1]);
          if (d < minDistBefore) minDistBefore = d;
        });
        score += (minDistBefore - minDist) * 5;
        if (isCorner(mv.tr, mv.tc)) score += 1000;
        // Clear lines toward corners are valuable
        score += openCornerLines(mv.tr, mv.tc) * 4;
      } else {
        // Non-king defenders: protect king's corridor, capture attackers
        score += countCaptures(mv.tr, mv.tc, side, mv.fr, mv.fc) * 10;
        score += Math.random() * 2;
      }
    }
    return score;
  }

  function countCaptures(tr, tc, side, fr, fc) {
    // Temporarily move piece to count custodian captures without modifying state
    var piece = state.board[fr][fc];
    state.board[tr][tc] = piece;
    state.board[fr][fc] = EMPTY;
    var count = 0;
    var dirs  = [[-1,0],[1,0],[0,-1],[0,1]];
    dirs.forEach(function(d) {
      var nr = tr + d[0], nc = tc + d[1];
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return;
      var p = state.board[nr][nc];
      if (!isEnemy(p, side) || p === KING) return;
      var or2 = nr + d[0], oc2 = nc + d[1];
      if (isCapturePartner(or2, oc2, side)) count++;
    });
    state.board[fr][fc] = piece;
    state.board[tr][tc] = EMPTY;
    return count;
  }

  function openCornerLines(r, c) {
    // Count how many of the 4 corners have a clear orthogonal path from (r,c)
    var open = 0;
    CORNER_CELLS.forEach(function(cp) {
      if (cp[0] !== r && cp[1] !== c) return; // not aligned
      var dr = Math.sign(cp[0] - r), dc = Math.sign(cp[1] - c);
      var nr = r + dr, nc = c + dc;
      var clear = true;
      while (nr !== cp[0] || nc !== cp[1]) {
        if (state.board[nr][nc] !== EMPTY) { clear = false; break; }
        nr += dr; nc += dc;
      }
      if (clear) open++;
    });
    return open;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function render() {
    var sz = csz();
    canvas.width  = sz;
    canvas.height = sz;
    ctx.clearRect(0, 0, sz, sz);
    drawBg();
    drawCells();
    drawSpecial();
    drawHighlights();
    drawPieces();
    if (state.gameOver) drawOverlay();
  }

  function drawBg() {
    ctx.fillStyle = '#1E1A14';
    ctx.fillRect(0, 0, csz(), csz());
  }

  function drawCells() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var x = PAD + c * CELL, y = PAD + r * CELL;
        ctx.fillStyle = (r + c) % 2 === 0 ? '#C4A265' : '#A8845A';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL, CELL);
      }
    }
  }

  function drawSpecial() {
    // Corners
    CORNER_CELLS.forEach(function(p) {
      var x = PAD + p[1] * CELL, y = PAD + p[0] * CELL;
      ctx.fillStyle = '#2E2218';
      ctx.fillRect(x, y, CELL, CELL);
      // X rune marker
      ctx.strokeStyle = '#C4A265';
      ctx.lineWidth = 1.5;
      var mx = x + CELL/2, my = y + CELL/2, ms = CELL * 0.27;
      ctx.beginPath();
      ctx.moveTo(mx-ms, my-ms); ctx.lineTo(mx+ms, my+ms);
      ctx.moveTo(mx+ms, my-ms); ctx.lineTo(mx-ms, my+ms);
      ctx.stroke();
    });

    // Throne
    var tx = PAD + THRONE_C * CELL, ty = PAD + THRONE_R * CELL;
    ctx.fillStyle = '#4A1010';
    ctx.fillRect(tx, ty, CELL, CELL);
    ctx.strokeStyle = '#D4A017';
    ctx.lineWidth = 1.8;
    var tmx = tx + CELL/2, tmy = ty + CELL/2, ts = CELL * 0.26;
    ctx.beginPath();
    ctx.moveTo(tmx, tmy-ts); ctx.lineTo(tmx, tmy+ts);
    ctx.moveTo(tmx-ts, tmy); ctx.lineTo(tmx+ts, tmy);
    ctx.stroke();
  }

  function drawHighlights() {
    if (!state.selected) return;
    var sr = state.selected[0], sc = state.selected[1];
    ctx.fillStyle = 'rgba(240,210,60,0.32)';
    ctx.fillRect(PAD + sc*CELL, PAD + sr*CELL, CELL, CELL);

    state.validMoves.forEach(function(m) {
      var mx = cx(m[1]), my = cy(m[0]);
      ctx.beginPath();
      ctx.arc(mx, my, CELL * 0.20, 0, Math.PI*2);
      ctx.fillStyle   = 'rgba(90,200,90,0.42)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,160,50,0.8)';
      ctx.lineWidth   = 1.8;
      ctx.stroke();
    });
  }

  function drawPieces() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var p = state.board[r][c];
        if (p !== EMPTY) drawPiece(r, c, p);
      }
    }
  }

  function drawPiece(r, c, piece) {
    var pcx = cx(c), pcy = cy(r);
    var rad = CELL * 0.38;
    ctx.beginPath();
    ctx.arc(pcx, pcy, rad, 0, Math.PI*2);

    if (piece === KING) {
      var g = ctx.createRadialGradient(pcx-rad*0.35, pcy-rad*0.35, 1, pcx, pcy, rad);
      g.addColorStop(0, '#F5D660');
      g.addColorStop(1, '#A07010');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#5a3010';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Crown cross
      var ks = rad * 0.42;
      ctx.strokeStyle = '#3a1a00';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(pcx, pcy-ks); ctx.lineTo(pcx, pcy+ks);
      ctx.moveTo(pcx-ks, pcy); ctx.lineTo(pcx+ks, pcy);
      ctx.stroke();
      // Tip dots
      ctx.fillStyle = '#3a1a00';
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(function(d) {
        ctx.beginPath();
        ctx.arc(pcx+d[0]*ks, pcy+d[1]*ks, 2.2, 0, Math.PI*2);
        ctx.fill();
      });
    } else if (piece === ATTACKER) {
      var ga = ctx.createRadialGradient(pcx-rad*0.3, pcy-rad*0.3, 1, pcx, pcy, rad);
      ga.addColorStop(0, '#C84040');
      ga.addColorStop(1, '#4A0808');
      ctx.fillStyle = ga;
      ctx.fill();
      ctx.strokeStyle = '#280000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      var gd = ctx.createRadialGradient(pcx-rad*0.3, pcy-rad*0.3, 1, pcx, pcy, rad);
      gd.addColorStop(0, '#FFFFFF');
      gd.addColorStop(1, '#C8B090');
      ctx.fillStyle = gd;
      ctx.fill();
      ctx.strokeStyle = '#7a5020';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawOverlay() {
    ctx.fillStyle = 'rgba(20,14,8,0.78)';
    ctx.fillRect(0, 0, csz(), csz());
    var line1 = state.winner === 'draw'
      ? 'Draw \u2014 Threefold Repetition'
      : state.winner === 'defender'
        ? 'King Escapes! Defenders Win'
        : 'King Captured! Attackers Win';
    ctx.fillStyle   = '#D4A017';
    ctx.font        = 'bold ' + Math.round(CELL * 0.44) + 'px Georgia, serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(line1, csz()/2, csz()/2 - CELL*0.4);
    ctx.fillStyle = '#C4A265';
    ctx.font      = Math.round(CELL * 0.28) + 'px Georgia, serif';
    ctx.fillText('Click \u201cNew Game\u201d to play again', csz()/2, csz()/2 + CELL*0.35);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  var elStatus, elLog, elAttCap, elDefCap, elMoves;

  function updateHUD() {
    if (state.gameOver) {
      elStatus.textContent =
        state.winner === 'draw'     ? 'Draw \u2014 Threefold Repetition' :
        state.winner === 'defender' ? 'Defenders win! King escaped.' :
                                      'Attackers win! King captured.';
    } else {
      var whose = state.turn === ATTACKER ? 'Attackers' : 'Defenders';
      elStatus.textContent = whose + ' to move';
    }
    elAttCap.textContent = state.capturedAttackers;
    elDefCap.textContent = state.capturedDefenders;
    elMoves.textContent  = state.moveCount;
  }

  // ── Move log ──────────────────────────────────────────────────────────────
  function toAlg(r, c) {
    return String.fromCharCode(97 + c) + (SIZE - r);
  }

  function addLog(piece, fr, fc, tr, tc) {
    var who = piece === KING ? 'King' : piece === ATTACKER ? 'Att' : 'Def';
    state.log.unshift(who + '\u00a0' + toAlg(fr,fc) + '\u2192' + toAlg(tr,tc));
    if (state.log.length > 20) state.log.pop();
    elLog.innerHTML = state.log.slice(0, 12).map(function(l) {
      return '<li>' + l + '</li>';
    }).join('');
  }

  // ── New game ──────────────────────────────────────────────────────────────
  function newGame() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    state = freshState();
    updateHUD();
    render();
    if (vsAI && state.turn !== humanSide) {
      aiTimer = setTimeout(aiTakeTurn, 600);
    }
  }

  // ── Room mode ─────────────────────────────────────────────────────────────
  function syncRoomState() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      board:             state.board.map(function(r){ return r.slice(); }),
      turn:              state.turn,
      capturedAttackers: state.capturedAttackers,
      capturedDefenders: state.capturedDefenders,
      moveCount:         state.moveCount,
      gameOver:          state.gameOver,
      winner:            state.winner,
      log:               state.log.slice(),
      last_actor:        'room:' + myRoomSeat,
    });
    if (state.gameOver) {
      RoomBridge.reportWin(state.winner === 'attacker' ? 0 : 1);
    }
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + myRoomSeat) return;
    state.board = data.board.map(function(r){ return r.slice(); });
    state.turn  = data.turn;
    state.capturedAttackers = data.capturedAttackers || 0;
    state.capturedDefenders = data.capturedDefenders || 0;
    state.moveCount = data.moveCount || 0;
    state.gameOver  = data.gameOver  || false;
    state.winner    = data.winner    || null;
    if (data.log) state.log = data.log.slice();
    state.selected   = null;
    state.validMoves = [];
    updateHUD();
    render();
    var myTurn = humanSide >= 0 && state.turn === humanSide;
    if (myTurn && !state.gameOver) {
      elStatus.textContent = 'Your turn to move';
    } else if (!state.gameOver) {
      elStatus.textContent = 'Waiting for opponent\u2026';
    }
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive()) return;
    vsRoom     = true;
    myRoomSeat = RoomBridge.getSeat();
    vsAI       = false;

    // Determine which side this player controls from the role assigned in the lobby
    var role = RoomBridge.getRole ? RoomBridge.getRole() : null;
    if (role === 'defender') {
      humanSide = DEFENDER;
    } else if (role === 'spectator') {
      humanSide = -1; // spectators control neither side
    } else {
      humanSide = ATTACKER; // 'attacker' or unset — default
    }

    var modeRow = document.querySelector('.ht-mode-row');
    if (modeRow) modeRow.style.display = 'none';
    RoomBridge.onState(receiveRoomState);

    // Attacker (seat 0) moves first — send initial state; defender waits
    if (humanSide === ATTACKER) {
      syncRoomState();
    } else {
      elStatus.textContent = 'Waiting for Attackers to move\u2026';
    }
  }

  // ── Canvas resize ─────────────────────────────────────────────────────────
  function resizeCanvas() {
    var maxW = Math.min(window.innerWidth - 32, 600);
    CELL = Math.floor((Math.max(maxW, 280) - PAD * 2) / SIZE);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    canvas   = document.getElementById('ht-canvas');
    ctx      = canvas.getContext('2d');
    elStatus = document.getElementById('ht-status');
    elLog    = document.getElementById('ht-log');
    elAttCap = document.getElementById('ht-att-cap');
    elDefCap = document.getElementById('ht-def-cap');
    elMoves  = document.getElementById('ht-moves');

    canvas.addEventListener('click',      handleClick);
    canvas.addEventListener('touchstart', handleClick, { passive: false });

    document.getElementById('ht-new-btn').addEventListener('click', newGame);

    var aiToggle = document.getElementById('ht-ai-toggle');
    aiToggle.addEventListener('change', function() {
      vsAI = this.checked;
      if (vsAI && !state.gameOver && state.turn !== humanSide) {
        aiTimer = setTimeout(aiTakeTurn, 400);
      }
    });

    var sideToggle = document.getElementById('ht-side-toggle');
    sideToggle.addEventListener('change', function() {
      humanSide = this.value === 'defender' ? DEFENDER : ATTACKER;
      newGame();
    });

    window.addEventListener('resize', function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() { resizeCanvas(); render(); }, 80);
    });

    resizeCanvas();
    state = freshState();
    updateHUD();
    render();
    initRoomMode();

    if (vsAI && state.turn !== humanSide) {
      aiTimer = setTimeout(aiTakeTurn, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial steps ──────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('hnefatafl', [
      {
        target: '#ht-canvas',
        title: 'The Board',
        body: 'This is the 11×11 Hnefatafl board. Corner squares are the Attackers\' goal — the King must reach one to escape.',
        position: 'bottom',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#ht-canvas',
        title: 'Two Sides',
        body: 'The King (marked differently) and Defenders start at the center. Attackers surround them and want to capture the King.',
        position: 'bottom',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#ht-canvas',
        title: 'Movement',
        body: 'All pieces move like rooks in chess — any number of squares in a straight line. No jumping over others.',
        position: 'top',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#ht-canvas',
        title: 'Capturing',
        body: 'Capture a piece by sandwiching it between two of yours on a straight line (custodian capture). The King needs to be surrounded on all 4 sides.',
        position: 'top',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#ht-status',
        title: 'Whose Turn',
        body: 'The status bar shows whose turn it is and any important game events.',
        position: 'bottom',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#ht-ai-toggle',
        title: 'Play vs AI',
        body: 'Toggle the AI on or off. Use the side selector below it to choose whether you command Attackers or Defenders.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#ht-new-btn',
        title: 'New Game',
        body: 'Start a new game at any time.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('hnefatafl');
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
    if (!canvas) return;
    var avail = Math.min(availW, availH);
    CELL = Math.floor((avail - PAD * 2) / SIZE);
    if (CELL < 20) CELL = 20;
    render();
  };

}());
