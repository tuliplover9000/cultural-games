/**
 * o-an-quan.js — Ô Ăn Quan (Mandarin's Squares)
 * Phase 3: Vietnamese mancala-style board game.
 *
 * Board index layout (counterclockwise circuit):
 *   0–4  : Player 1 pits (bottom row, left → right)
 *   5    : Q1 — Player 1's quan (right side)
 *   6–10 : Player 2 pits (top row, right → left in CCW order)
 *   11   : Q2 — Player 2's quan (left side)
 *
 * Visual grid:
 *   [Q2=11] [pit10] [pit9] [pit8] [pit7] [pit6] [Q1=5]
 *           [pit0]  [pit1] [pit2] [pit3] [pit4]
 */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const TOTAL_PITS = 12;  // 10 small + 2 quan
  const P1_PITS = [0, 1, 2, 3, 4];
  const P2_PITS = [6, 7, 8, 9, 10];
  const Q1 = 5;   // Player 1's quan
  const Q2 = 11;  // Player 2's quan
  const SEEDS_PER_PIT = 5;

  // ── State ──────────────────────────────────────────────────────────────────
  let state = null;

  function initState() {
    const board = new Array(TOTAL_PITS).fill(0);
    // Fill small pits with seeds
    P1_PITS.forEach(i => { board[i] = SEEDS_PER_PIT; });
    P2_PITS.forEach(i => { board[i] = SEEDS_PER_PIT; });
    // Quan pits start empty
    board[Q1] = 0;
    board[Q2] = 0;

    return {
      board,
      currentPlayer: 1,   // 1 or 2
      phase: 'select',    // 'select' | 'sowing' | 'gameover'
      log: [],
    };
  }

  // ── Next index in CCW circuit ─────────────────────────────────────────────
  function nextIdx(idx) {
    return (idx + 1) % TOTAL_PITS;
  }

  // ── Whose quan is this player's? ──────────────────────────────────────────
  function myQuan(player) {
    return player === 1 ? Q1 : Q2;
  }

  // ── Does this pit belong to the given player? ─────────────────────────────
  function isMyPit(idx, player) {
    return player === 1 ? P1_PITS.includes(idx) : P2_PITS.includes(idx);
  }

  // ── Does the current player have any valid moves? ─────────────────────────
  function hasMoves(player) {
    const pits = player === 1 ? P1_PITS : P2_PITS;
    return pits.some(i => state.board[i] > 0);
  }

  // ── Check if game should end ──────────────────────────────────────────────
  function checkEnd() {
    const p1Empty = P1_PITS.every(i => state.board[i] === 0);
    const p2Empty = P2_PITS.every(i => state.board[i] === 0);
    return p1Empty || p2Empty;
  }

  // ── Sow seeds from a pit, then handle continuation / capture ─────────────
  async function sow(startIdx) {
    if (state.phase !== 'select') return;
    if (state.board[startIdx] === 0) return;

    state.phase = 'sowing';
    refresh();

    let hand = state.board[startIdx];
    state.board[startIdx] = 0;
    flashPit(startIdx, 'active');

    const playerName = state.currentPlayer === 1 ? 'P1' : 'P2';
    const pitLabel = pitName(startIdx);
    addLog(state.currentPlayer, `${playerName} sowed from ${pitLabel} (${hand} seeds)`);

    await sleep(350);

    // ── Sowing loop ──
    let cur = startIdx;
    while (hand > 0) {
      cur = nextIdx(cur);
      if (cur === startIdx) continue; // skip the origin pit on full loops

      state.board[cur]++;
      hand--;
      flashPit(cur, 'sow-flash');
      renderBoard();
      await sleep(220);
    }

    // ── After sowing: continuation or capture ──
    await handleLanding(cur, startIdx);
  }

  async function handleLanding(landIdx, originIdx) {
    const board = state.board;

    // If landed on a non-empty small pit (not a quan), continue sowing
    const isSmall = P1_PITS.includes(landIdx) || P2_PITS.includes(landIdx);
    if (isSmall && board[landIdx] > 0) {
      // Pick up and keep going
      let hand = board[landIdx];
      board[landIdx] = 0;
      flashPit(landIdx, 'active');
      renderBoard();
      await sleep(350);

      let cur = landIdx;
      while (hand > 0) {
        cur = nextIdx(cur);
        if (cur === landIdx) continue;
        board[cur]++;
        hand--;
        flashPit(cur, 'sow-flash');
        renderBoard();
        await sleep(220);
      }
      await handleLanding(cur, landIdx);
      return;
    }

    // If landed on an empty small pit → attempt capture
    if (isSmall && board[landIdx] === 0) {
      await attemptCapture(landIdx);
    }
    // If landed on a quan, turn just ends (no continuation, no capture)

    endTurn();
  }

  async function attemptCapture(emptyIdx) {
    // Check the immediately next pit CCW from the empty landing pit
    const captureIdx = nextIdx(emptyIdx);
    const myQ = myQuan(state.currentPlayer);
    const isSmallPit = P1_PITS.includes(captureIdx) || P2_PITS.includes(captureIdx);

    if (isSmallPit && state.board[captureIdx] > 0) {
      const captured = state.board[captureIdx];
      state.board[captureIdx] = 0;
      state.board[myQ] += captured;
      flashPit(captureIdx, 'sow-flash');
      renderBoard();
      addLog(state.currentPlayer, `P${state.currentPlayer} captured ${captured} seeds!`);
      await sleep(300);
    }
    // If neighbor is empty or is a quan, turn simply ends (no capture)
  }

  function endTurn() {
    if (checkEnd()) {
      // Claim remaining seeds
      const p1Remaining = P1_PITS.reduce((s, i) => s + state.board[i], 0);
      const p2Remaining = P2_PITS.reduce((s, i) => s + state.board[i], 0);
      state.board[Q1] += p1Remaining;
      state.board[Q2] += p2Remaining;
      P1_PITS.forEach(i => { state.board[i] = 0; });
      P2_PITS.forEach(i => { state.board[i] = 0; });

      state.phase = 'gameover';
      addLog(0, 'Game over! Seeds claimed.');
      refresh();
      return;
    }

    // Switch player
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;

    // If next player has no moves, try to switch back; if neither can move, end game
    if (!hasMoves(state.currentPlayer)) {
      const other = state.currentPlayer === 1 ? 2 : 1;
      if (!hasMoves(other)) {
        state.phase = 'gameover';
        refresh();
        return;
      }
      // Skip this player (they forfeit their turn)
      addLog(state.currentPlayer, `P${state.currentPlayer} has no moves — skipping.`);
      state.currentPlayer = other;
    }

    state.phase = 'select';
    refresh();
  }

  // ── Log helpers ───────────────────────────────────────────────────────────
  function addLog(player, text) {
    state.log.unshift({ player, text });
    if (state.log.length > 6) state.log.pop();
    renderLog();
  }

  function pitName(idx) {
    if (idx === Q1) return 'Q1';
    if (idx === Q2) return 'Q2';
    if (P1_PITS.includes(idx)) return `P1-pit${P1_PITS.indexOf(idx) + 1}`;
    return `P2-pit${P2_PITS.indexOf(idx) + 1}`;
  }

  // ── Sleep ─────────────────────────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Flash animation on a pit element ─────────────────────────────────────
  function flashPit(idx, cls) {
    const el = document.querySelector(`[data-pit="${idx}"]`);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // reflow
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 350);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderGame(container) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'oaq-game';
    wrap.innerHTML = buildHTML();
    container.appendChild(wrap);

    // Wire up pit clicks
    container.querySelectorAll('.oaq-pit.clickable').forEach(el => {
      const idx = parseInt(el.dataset.pit, 10);
      el.addEventListener('click', () => sow(idx));
    });

    // Restart button
    const restartBtn = container.querySelector('#oaq-restart');
    if (restartBtn) restartBtn.addEventListener('click', restartGame);
  }

  function buildHTML() {
    const { board, currentPlayer, phase } = state;

    // Turn banner text
    let bannerClass = `p${currentPlayer}`;
    let bannerText = phase === 'gameover'
      ? 'Game Over'
      : phase === 'sowing'
      ? `Player ${currentPlayer} sowing…`
      : `Player ${currentPlayer}'s Turn`;
    if (phase === 'gameover') bannerClass = 'gameover';

    // Score bar
    const p1Score = board[Q1];
    const p2Score = board[Q2];

    // Board HTML
    const boardHTML = buildBoardHTML();

    // Log HTML
    const logHTML = buildLogHTML();

    // Game over HTML
    const gameoverHTML = buildGameOverHTML(p1Score, p2Score);

    return `
      <div class="oaq-turn-banner ${bannerClass}">${bannerText}</div>

      <div class="oaq-score-bar">
        <div class="oaq-score-player p1">
          <div class="oaq-score-player__label">Player 1</div>
          <div class="oaq-score-player__num">${p1Score}</div>
        </div>
        <div class="oaq-score-divider">vs</div>
        <div class="oaq-score-player p2">
          <div class="oaq-score-player__label">Player 2</div>
          <div class="oaq-score-player__num">${p2Score}</div>
        </div>
      </div>

      <div class="oaq-board" role="grid" aria-label="Ô Ăn Quan board">
        ${boardHTML}
      </div>

      <p class="oaq-status" id="oaq-status" aria-live="polite">
        ${phase === 'sowing' ? 'Sowing…' : phase === 'select' ? 'Choose a pit to sow from.' : ''}
      </p>

      ${logHTML}

      <div class="oaq-actions">
        <button class="btn btn--outline" id="oaq-restart">Restart Game</button>
      </div>

      ${gameoverHTML}
    `;
  }

  function buildBoardHTML() {
    const { board, currentPlayer, phase } = state;
    const isSelecting = phase === 'select';

    // Top row (P2 pits): displayed left-to-right as indices 10,9,8,7,6
    // (counterclockwise from viewer left = index 10, viewer right = index 6)
    const topPits = [10, 9, 8, 7, 6];

    // Bottom row (P1 pits): displayed left-to-right as indices 0,1,2,3,4
    const bottomPits = [0, 1, 2, 3, 4];

    // colOffset: top pits [10,9,8,7,6] → columns 2,3,4,5,6; bottom pits [0..4] → columns 2..6
    function pitHTML(idx, row, col) {
      const count = board[idx];
      const isEmpty = count === 0;
      const mine = isMyPit(idx, currentPlayer);
      const canClick = isSelecting && mine && count > 0;
      const gridRow = row === 'top' ? 1 : 2;
      const classes = [
        'oaq-pit',
        isEmpty ? 'empty' : '',
        canClick ? 'clickable' : '',
      ].filter(Boolean).join(' ');

      const label = row === 'top' ? 'P2 pit' : 'P1 pit';
      const seedWord = count === 1 ? 'seed' : 'seeds';

      return `
        <button
          class="${classes}"
          data-pit="${idx}"
          style="grid-column:${col};grid-row:${gridRow};"
          ${canClick ? '' : 'disabled'}
          aria-label="${label}: ${count} ${seedWord}"
        >
          <span class="oaq-pit__count">${count}</span>
          <span class="oaq-pit__seeds">${seedWord}</span>
        </button>`;
    }

    // Q2: column 1, rows 1-2
    const q2 = `
      <div class="oaq-quan oaq-quan--p2" style="grid-column:1;grid-row:1/3;" aria-label="Player 2 quan: ${board[Q2]} seeds">
        <span class="oaq-quan__label">P2 Quan</span>
        <span class="oaq-quan__count">${board[Q2]}</span>
        <span class="oaq-quan__seeds-label">seeds</span>
      </div>`;

    // Q1: column 7, rows 1-2
    const q1 = `
      <div class="oaq-quan oaq-quan--p1" style="grid-column:7;grid-row:1/3;" aria-label="Player 1 quan: ${board[Q1]} seeds">
        <span class="oaq-quan__label">P1 Quan</span>
        <span class="oaq-quan__count">${board[Q1]}</span>
        <span class="oaq-quan__seeds-label">seeds</span>
      </div>`;

    // Top pits: indices 10,9,8,7,6 → columns 2,3,4,5,6
    const topRow = topPits.map((i, j) => pitHTML(i, 'top', j + 2)).join('');

    // Bottom pits: indices 0,1,2,3,4 → columns 2,3,4,5,6
    const bottomRow = bottomPits.map((i, j) => pitHTML(i, 'bottom', j + 2)).join('');

    return q2 + q1 + topRow + bottomRow;
  }

  function buildLogHTML() {
    if (state.log.length === 0) {
      return `<div class="oaq-log"><p class="oaq-log__title">Move Log</p><ul class="oaq-log__list"><li class="oaq-log__entry">Game started.</li></ul></div>`;
    }
    const items = state.log.map(e =>
      `<li class="oaq-log__entry p${e.player || ''}">${e.text}</li>`
    ).join('');
    return `<div class="oaq-log"><p class="oaq-log__title">Move Log</p><ul class="oaq-log__list">${items}</ul></div>`;
  }

  function buildGameOverHTML(p1Score, p2Score) {
    let winner, icon;
    if (p1Score > p2Score) { winner = 'Player 1 wins!'; icon = '🎉'; }
    else if (p2Score > p1Score) { winner = 'Player 2 wins!'; icon = '🎉'; }
    else { winner = "It's a draw!"; icon = '🤝'; }

    return `
      <div class="oaq-gameover ${state.phase === 'gameover' ? 'visible' : ''}" aria-live="assertive">
        <div class="oaq-gameover__icon">${icon}</div>
        <h2>${winner}</h2>
        <p>All seeds have been claimed.</p>
        <div class="oaq-final-scores">
          <div class="oaq-final-score p1">
            <div class="oaq-final-score__num">${p1Score}</div>
            <div class="oaq-final-score__label">Player 1</div>
          </div>
          <div class="oaq-final-score p2">
            <div class="oaq-final-score__num">${p2Score}</div>
            <div class="oaq-final-score__label">Player 2</div>
          </div>
        </div>
      </div>`;
  }

  // ── Partial re-renders ─────────────────────────────────────────────────────
  function renderBoard() {
    const container = document.getElementById('game-container');
    if (!container) return;

    // Re-render just the board + score bar + turn banner
    const board = container.querySelector('.oaq-board');
    if (board) {
      board.innerHTML = buildBoardHTML();
      // Re-wire clicks
      container.querySelectorAll('.oaq-pit.clickable').forEach(el => {
        const idx = parseInt(el.dataset.pit, 10);
        el.addEventListener('click', () => sow(idx));
      });
    }

    // Update score numbers
    const p1Num = container.querySelector('.oaq-score-player.p1 .oaq-score-player__num');
    const p2Num = container.querySelector('.oaq-score-player.p2 .oaq-score-player__num');
    if (p1Num) p1Num.textContent = state.board[Q1];
    if (p2Num) p2Num.textContent = state.board[Q2];
  }

  function renderLog() {
    const container = document.getElementById('game-container');
    if (!container) return;
    const logEl = container.querySelector('.oaq-log');
    if (!logEl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildLogHTML();
    logEl.replaceWith(tmp.firstElementChild);
  }

  function refresh() {
    const container = document.getElementById('game-container');
    if (!container) return;
    renderGame(container);
  }

  // ── Restart ───────────────────────────────────────────────────────────────
  function restartGame() {
    state = initState();
    refresh();
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('game-container');
    if (!container) return;

    state = initState();
    renderGame(container);
  });

}());
