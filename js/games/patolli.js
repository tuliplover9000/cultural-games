/**
 * patolli.js — Patolli (Phase 6)
 * Ancient Aztec cross-shaped race game with bean dice.
 * Board: 44-cell perimeter path on a 13×13 cross grid.
 * (Historical boards have 52 spaces; this playable version uses 44.)
 */
(function () {
  'use strict';

  var PLAYER = 0, AI = 1;
  var TOTAL_PIECES = 6;
  var MOVE_MS = 130;

  // ── Board track ───────────────────────────────────────────────────────────
  // Cross on 13×13 grid: vertical band cols 4-8, horizontal band rows 4-8.
  // 44 perimeter cells in clockwise order, starting at top-left corner [0,4].
  var TRACK = (function () {
    var t = [];
    var r, c;
    // Top of top arm: row 0, cols 4→8
    for (c = 4; c <= 8; c++) t.push([0, c]);
    // Right side of top arm: col 8, rows 1→3
    for (r = 1; r <= 3; r++) t.push([r, 8]);
    // Top of right arm: row 4, cols 9→12
    for (c = 9; c <= 12; c++) t.push([4, c]);
    // Right side of right arm: col 12, rows 5→8
    for (r = 5; r <= 8; r++) t.push([r, 12]);
    // Bottom of right arm: row 8, cols 11→9
    for (c = 11; c >= 9; c--) t.push([8, c]);
    // Right side of bottom arm: col 8, rows 9→12
    for (r = 9; r <= 12; r++) t.push([r, 8]);
    // Bottom of bottom arm: row 12, cols 7→4
    for (c = 7; c >= 4; c--) t.push([12, c]);
    // Left side of bottom arm: col 4, rows 11→9
    for (r = 11; r >= 9; r--) t.push([r, 4]);
    // Bottom of left arm: row 8, cols 3→0
    for (c = 3; c >= 0; c--) t.push([8, c]);
    // Left side of left arm: col 0, rows 7→4
    for (r = 7; r >= 4; r--) t.push([r, 0]);
    // Top of left arm: row 4, cols 1→3
    for (c = 1; c <= 3; c++) t.push([4, c]);
    // Left side of top arm: col 4, rows 3→1
    for (r = 3; r >= 1; r--) t.push([r, 4]);
    return t; // 44 cells
  }());

  var TRACK_LENGTH = TRACK.length; // 44

  // 13×13 grid: each cell = track index or null
  var BOARD_GRID = (function () {
    var g = [];
    for (var i = 0; i < 13; i++) g.push(new Array(13).fill(null));
    for (var j = 0; j < TRACK.length; j++) g[TRACK[j][0]][TRACK[j][1]] = j;
    return g;
  }());

  // Safe zones: 4 arm-tips + 4 arm-midpoints + entry corner
  var SAFE_INDICES = new Set([0, 4, 10, 14, 21, 25, 32, 36]);

  // ── State ─────────────────────────────────────────────────────────────────
  var state = {};

  function freshState() {
    return {
      phase: 'idle',       // idle | choosingPiece | moving | ai-thinking | over
      turn: PLAYER,
      roll: 0,
      rollDetail: [],
      rollAgain: false,
      validPieces: [],
      pieces: {
        0: new Array(TOTAL_PIECES).fill(null),
        1: new Array(TOTAL_PIECES).fill(null),
      },
      coins: [0, 0],
      animating: false,
      movingPiece: -1,
    };
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var elBoard, elDiceRow, elRollBtn, elNewGameBtn, elStatus, elScore, elLog;

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    renderBoard();
    renderDice();
    renderScore();
  }

  function renderBoard() {
    // Map track index → pieces present
    var cellMap = {};
    [PLAYER, AI].forEach(function (pl) {
      state.pieces[pl].forEach(function (pos, pi) {
        if (pos !== null && pos !== TRACK_LENGTH) {
          if (!cellMap[pos]) cellMap[pos] = { 0: [], 1: [] };
          cellMap[pos][pl].push(pi);
        }
      });
    });

    // Determine which track indices are selectable
    var selectableIdx = new Set();
    if (state.phase === 'choosingPiece') {
      state.validPieces.forEach(function (pi) {
        var pos = state.pieces[PLAYER][pi];
        selectableIdx.add(pos === null ? 0 : pos);
      });
    }

    var html = '';
    for (var r = 0; r < 13; r++) {
      for (var c = 0; c < 13; c++) {
        var idx = BOARD_GRID[r][c];
        if (idx === null) {
          html += '<div class="pt-cell pt-cell--empty"></div>';
          continue;
        }
        var cls = 'pt-cell';
        if (SAFE_INDICES.has(idx)) cls += ' pt-cell--safe';
        if (selectableIdx.has(idx)) cls += ' pt-cell--valid';

        var cp = cellMap[idx] || { 0: [], 1: [] };
        if (cp[0].length + cp[1].length > 1) cls += ' pt-cell--multi';

        var inner = '';
        cp[0].forEach(function (pi) {
          var mv = state.animating && state.movingPiece === pi && state.turn === PLAYER;
          inner += '<div class="pt-piece pt-piece--player' + (mv ? ' pt-piece--moving' : '') +
                   '" data-player="0" data-pi="' + pi + '"></div>';
        });
        cp[1].forEach(function (pi) {
          var mv = state.animating && state.movingPiece === pi && state.turn === AI;
          inner += '<div class="pt-piece pt-piece--ai' + (mv ? ' pt-piece--moving' : '') +
                   '" data-player="1" data-pi="' + pi + '"></div>';
        });

        html += '<div class="' + cls + '" data-idx="' + idx + '">' + inner + '</div>';
      }
    }

    hoveredPieceEl = null;
    hoveredPreviewIdx = -1;
    elBoard.style.gridTemplateColumns = 'repeat(13, 1fr)';
    elBoard.innerHTML = html;
  }

  function renderDice() {
    if (!state.rollDetail.length) { elDiceRow.innerHTML = ''; return; }
    var beans = state.rollDetail.map(function (m) {
      return '<div class="pt-bean' + (m ? ' pt-bean--marked' : '') + '">' + (m ? '●' : '○') + '</div>';
    }).join('');
    elDiceRow.innerHTML = beans + (state.roll > 0
      ? '<span class="pt-roll-total">Move: ' + state.roll + '</span>'
      : '');
  }

  function renderScore() {
    var pDone = state.pieces[PLAYER].filter(function (p) { return p === TRACK_LENGTH; }).length;
    var aDone = state.pieces[AI].filter(function (p) { return p === TRACK_LENGTH; }).length;
    elScore.innerHTML =
      '<span><span class="pt-score__label" style="color:#3a9abf">You</span> — ' +
        pDone + '/6 done &middot; ' + state.coins[PLAYER] + ' coins</span>' +
      '<span><span class="pt-score__label" style="color:#d45a20">AI</span> — ' +
        aDone + '/6 done &middot; ' + state.coins[AI] + ' coins</span>';
  }

  function addLog(msg) {
    var li = document.createElement('li');
    li.textContent = msg;
    elLog.insertBefore(li, elLog.firstChild);
    while (elLog.children.length > 20) elLog.removeChild(elLog.lastChild);
  }

  function setStatus(html) { elStatus.innerHTML = html; }

  // ── Dice ──────────────────────────────────────────────────────────────────
  function rollBeans() {
    var detail = [], marked = 0;
    for (var i = 0; i < 5; i++) {
      var m = Math.random() < 0.5;
      detail.push(m);
      if (m) marked++;
    }
    var value = (marked === 0) ? 10 : (marked === 5) ? 5 : marked;
    return { detail: detail, value: value, again: marked === 5 };
  }

  // ── Move logic ────────────────────────────────────────────────────────────
  function targetPos(currentPos, roll) {
    if (currentPos === null) {
      var t = roll - 1;
      return t >= TRACK_LENGTH ? TRACK_LENGTH : t;
    }
    var t2 = currentPos + roll;
    return t2 >= TRACK_LENGTH ? TRACK_LENGTH : t2;
  }

  function getValidMoves(player, roll) {
    var valid = [];
    for (var pi = 0; pi < TOTAL_PIECES; pi++) {
      var pos = state.pieces[player][pi];
      if (pos === TRACK_LENGTH) continue;
      var tgt = targetPos(pos, roll);
      if (tgt < 0) continue;
      // Not blocked by own piece
      var blocked = state.pieces[player].some(function (p, pj) {
        return pj !== pi && p === tgt;
      });
      if (!blocked) valid.push(pi);
    }
    return valid;
  }

  function movePiece(player, pieceIdx, steps, callback) {
    state.animating = true;
    state.movingPiece = pieceIdx;
    var moved = 0;

    function step() {
      if (moved >= steps) {
        state.animating = false;
        state.movingPiece = -1;
        resolveLanding(player, pieceIdx);
        render();
        callback();
        return;
      }
      var cur = state.pieces[player][pieceIdx];
      state.pieces[player][pieceIdx] = (cur === null) ? 0 : cur + 1;
      if (state.pieces[player][pieceIdx] >= TRACK_LENGTH) {
        state.pieces[player][pieceIdx] = TRACK_LENGTH;
        moved = steps;
      }
      render();
      moved++;
      setTimeout(step, MOVE_MS);
    }
    step();
  }

  function resolveLanding(player, pieceIdx) {
    var pos = state.pieces[player][pieceIdx];
    var opp = 1 - player;
    var name = player === PLAYER ? 'Your' : "AI's";

    if (pos === TRACK_LENGTH) {
      state.coins[player] += 3;
      addLog(name + ' piece finished the circuit! +3 coins');
      return;
    }

    if (!SAFE_INDICES.has(pos)) {
      for (var pi = 0; pi < TOTAL_PIECES; pi++) {
        if (state.pieces[opp][pi] === pos) {
          state.pieces[opp][pi] = null;
          state.coins[player] += 2;
          addLog((player === PLAYER ? 'You' : 'AI') + ' captured a piece! +2 coins');
        }
      }
    }
  }

  // ── Hover preview ─────────────────────────────────────────────────────────
  var hoveredPreviewIdx = -1;
  var hoveredPieceEl = null;

  function clearHover() {
    if (hoveredPieceEl) { hoveredPieceEl.classList.remove('pt-piece--hovered'); hoveredPieceEl = null; }
    if (hoveredPreviewIdx !== -1) {
      var old = elBoard.querySelector('[data-idx="' + hoveredPreviewIdx + '"]');
      if (old) old.classList.remove('pt-cell--preview');
      hoveredPreviewIdx = -1;
    }
  }

  function applyHover(pieceEl, previewIdx) {
    if (pieceEl) { pieceEl.classList.add('pt-piece--hovered'); hoveredPieceEl = pieceEl; }
    if (previewIdx !== -1) {
      var cell = elBoard.querySelector('[data-idx="' + previewIdx + '"]');
      if (cell) { cell.classList.add('pt-cell--preview'); hoveredPreviewIdx = previewIdx; }
    }
  }

  function onBoardMouseover(e) {
    if (state.phase !== 'choosingPiece') return;

    var newPieceEl = null;
    var newPreviewIdx = -1;

    var pieceEl = e.target.closest('[data-pi]');
    if (pieceEl && parseInt(pieceEl.dataset.player) === PLAYER) {
      var pi = parseInt(pieceEl.dataset.pi);
      if (state.validPieces.indexOf(pi) !== -1) {
        newPieceEl = pieceEl;
        var tgt = targetPos(state.pieces[PLAYER][pi], state.roll);
        if (tgt < TRACK_LENGTH) newPreviewIdx = tgt;
      }
    } else {
      // hovering entry cell (idx=0) when an off-board piece is valid
      var cellEl = e.target.closest('[data-idx]');
      if (cellEl && parseInt(cellEl.dataset.idx) === 0) {
        for (var pj = 0; pj < TOTAL_PIECES; pj++) {
          if (state.pieces[PLAYER][pj] === null && state.validPieces.indexOf(pj) !== -1) {
            var tgt0 = targetPos(null, state.roll);
            if (tgt0 < TRACK_LENGTH) newPreviewIdx = tgt0;
            break;
          }
        }
      }
    }

    // Only update DOM if something changed
    if (newPieceEl !== hoveredPieceEl || newPreviewIdx !== hoveredPreviewIdx) {
      clearHover();
      applyHover(newPieceEl, newPreviewIdx);
    }
  }

  function onBoardMouseout(e) {
    var to = e.relatedTarget;
    if (!to || !elBoard.contains(to)) clearHover();
  }

  // ── Player turn ───────────────────────────────────────────────────────────
  function onRollClick() {
    if (state.phase !== 'idle' || state.animating || state.turn !== PLAYER) return;

    var result = rollBeans();
    state.roll = result.value;
    state.rollDetail = result.detail;
    state.rollAgain = result.again;
    renderDice();

    var valid = getValidMoves(PLAYER, result.value);
    state.validPieces = valid;
    addLog('You rolled ' + result.value + (result.again ? ' — roll again!' : ''));

    if (valid.length === 0) {
      setStatus('No valid moves. Turn passes.');
      addLog('No valid moves — turn passes.');
      state.phase = 'idle';
      render();
      setTimeout(function () { endTurn(PLAYER); }, 900);
      return;
    }

    state.phase = 'choosingPiece';
    elRollBtn.disabled = true;
    setStatus('Choose a piece to move ' + result.value + ' space' + (result.value !== 1 ? 's' : '') + '.');
    render();
  }

  function onBoardClick(e) {
    if (state.phase !== 'choosingPiece' || state.animating) return;

    var pieceEl = e.target.closest('[data-player]');
    var cellEl  = e.target.closest('[data-idx]');
    var pieceIdx = -1;

    if (pieceEl && parseInt(pieceEl.dataset.player) === PLAYER) {
      pieceIdx = parseInt(pieceEl.dataset.pi);
    } else if (cellEl) {
      var idx = parseInt(cellEl.dataset.idx);
      // find player piece at this track index
      for (var pi = 0; pi < TOTAL_PIECES; pi++) {
        if (state.pieces[PLAYER][pi] === idx && state.validPieces.indexOf(pi) !== -1) {
          pieceIdx = pi; break;
        }
      }
      // clicking entry cell (idx=0) with an off-board piece
      if (pieceIdx === -1 && idx === 0) {
        for (var pj = 0; pj < TOTAL_PIECES; pj++) {
          if (state.pieces[PLAYER][pj] === null && state.validPieces.indexOf(pj) !== -1) {
            pieceIdx = pj; break;
          }
        }
      }
    }

    if (pieceIdx === -1 || state.validPieces.indexOf(pieceIdx) === -1) return;

    state.phase = 'moving';
    setStatus('Moving…');
    movePiece(PLAYER, pieceIdx, state.roll, function () {
      if (state.rollAgain) {
        state.rollAgain = false;
        state.phase = 'idle';
        elRollBtn.disabled = false;
        setStatus('Roll again!');
        render();
      } else {
        endTurn(PLAYER);
      }
    });
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  function aiChooseMove(roll) {
    var valid = getValidMoves(AI, roll);
    if (!valid.length) return null;

    var best = valid[0], bestScore = -Infinity;
    valid.forEach(function (pi) {
      var pos   = state.pieces[AI][pi];
      var tgt   = targetPos(pos, roll);
      var score = 0;

      if (tgt === TRACK_LENGTH) score += 500;

      if (tgt < TRACK_LENGTH && !SAFE_INDICES.has(tgt)) {
        state.pieces[PLAYER].forEach(function (pp) {
          if (pp === tgt) score += 1000;
        });
        // Avoid spots easily capturable by player
        state.pieces[PLAYER].forEach(function (pp) {
          if (pp !== null && pp !== TRACK_LENGTH && tgt - pp > 0 && tgt - pp <= 5) score -= 300;
        });
      }

      if (tgt < TRACK_LENGTH && SAFE_INDICES.has(tgt)) score += 50;
      if (pos !== null) score += pos * 2;
      else score += 15;

      if (score > bestScore) { bestScore = score; best = pi; }
    });
    return best;
  }

  function aiTurn() {
    state.phase = 'ai-thinking';
    setStatus('AI is thinking… <span class="pt-thinking"><span></span><span></span><span></span></span>');
    render();

    setTimeout(function () {
      var result = rollBeans();
      state.roll   = result.value;
      state.rollDetail = result.detail;
      renderDice();
      addLog('AI rolled ' + result.value + (result.again ? ' — rolls again!' : ''));

      var choice = aiChooseMove(result.value);
      if (choice === null) {
        addLog('AI has no valid moves — turn passes.');
        setTimeout(function () { endTurn(AI); }, 600);
        return;
      }

      setTimeout(function () {
        state.phase = 'moving';
        movePiece(AI, choice, result.value, function () {
          if (result.again) {
            setTimeout(aiTurn, 400);
          } else {
            endTurn(AI);
          }
        });
      }, 400);
    }, 700);
  }

  // ── Game flow ─────────────────────────────────────────────────────────────
  function endTurn(player) {
    if (state.pieces[player].every(function (p) { return p === TRACK_LENGTH; })) {
      gameOver(player); return;
    }
    var next = 1 - player;
    state.turn = next;
    state.phase = 'idle';
    state.validPieces = [];
    render();

    if (next === PLAYER) {
      elRollBtn.disabled = false;
      setStatus('Your turn — roll the beans!');
    } else {
      elRollBtn.disabled = true;
      setTimeout(aiTurn, 500);
    }
  }

  function gameOver(winner) {
    state.phase = 'over';
    elRollBtn.disabled = true;
    var you = state.coins[PLAYER], ai = state.coins[AI];
    if (winner === PLAYER) {
      setStatus('<div class="pt-gameover"><div class="pt-gameover__title">🏆 You Win!</div>' +
        '<div class="pt-gameover__sub">All pieces completed the circuit · ' + you + ' coins earned</div></div>');
    } else {
      setStatus('<div class="pt-gameover"><div class="pt-gameover__title">AI Wins</div>' +
        '<div class="pt-gameover__sub">The AI completed first · Your coins: ' + you + '</div></div>');
    }
    addLog('Game over — ' + (winner === PLAYER ? 'You win' : 'AI wins') +
           '! You: ' + you + ' coins · AI: ' + ai + ' coins');
    renderScore();
  }

  function newGame() {
    state = freshState();
    elRollBtn.disabled = false;
    elLog.innerHTML = '';
    elDiceRow.innerHTML = '';
    setStatus('Your turn — roll the beans!');
    render();
    addLog('New game started. You go first!');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    elBoard      = document.getElementById('pt-board');
    elDiceRow    = document.getElementById('pt-dice-row');
    elRollBtn    = document.getElementById('pt-roll-btn');
    elNewGameBtn = document.getElementById('pt-new-game-btn');
    elStatus     = document.getElementById('pt-status');
    elScore      = document.getElementById('pt-score');
    elLog        = document.getElementById('pt-log');

    elRollBtn.addEventListener('click', onRollClick);
    elNewGameBtn.addEventListener('click', newGame);
    elBoard.addEventListener('click', onBoardClick);
    elBoard.addEventListener('mouseover', onBoardMouseover);
    elBoard.addEventListener('mouseout', onBoardMouseout);
    newGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
