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
  var vsRoom     = false;
  var myRoomSeat = 0;

  // ── Skip-animation flag ───────────────────────────────────────────────────
  // When the player clicks Skip, skipSowing is set to true and skipResolve()
  // is called so the current in-flight Promise.race resolves immediately.
  let skipSowing  = false;
  let skipResolve = null;

  // ── Animation-replay flags (room mode) ────────────────────────────────────
  // When the opponent's move arrives, we replay their sow animation locally.
  // _isSowingAsReplay prevents the receiver from sending state back.
  // _pendingFinalState buffers a final state that arrived during replay.
  var _isSowingAsReplay  = false;
  var _pendingFinalState = null;

  function requestSkip() {
    skipSowing = true;
    if (skipResolve) { skipResolve(); skipResolve = null; }
  }

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

  // ── Pickup burst animation on the source pit ─────────────────────────────
  async function animatePickup(idx) {
    if (skipSowing) return;
    const el = document.querySelector(`[data-pit="${idx}"]`);
    if (!el) return;
    const skip = new Promise(res => { skipResolve = res; });
    const anim = el.animate([
      { transform: 'scale(1)',    boxShadow: '0 0 0 0px rgba(200,155,60,0)',   filter: 'brightness(1)' },
      { transform: 'scale(1.18)', boxShadow: '0 0 0 8px rgba(200,155,60,0.5)', filter: 'brightness(1.6)' },
      { transform: 'scale(0.92)', boxShadow: '0 0 0 0px rgba(200,155,60,0)',   filter: 'brightness(0.85)' },
      { transform: 'scale(1)',    boxShadow: '0 0 0 0px rgba(200,155,60,0)',   filter: 'brightness(1)' },
    ], { duration: 380, easing: 'ease-out' });
    await Promise.race([anim.finished, skip]);
    anim.cancel();
  }

  // ── Set content of a flying seed cluster (scattered pile of circles) ────────
  function setClusterContent(el, count) {
    if (count <= 0) { el.innerHTML = ''; return; }
    const show = Math.min(count, 10);
    const r = show === 1 ? 0 : 3 + show * 1.5;
    let html = '';
    for (let i = 0; i < show; i++) {
      const angle = (2 * Math.PI * i / show) - Math.PI / 2;
      const jx = (((i * 37 + 11) % 100) / 100 - 0.5) * 5;
      const jy = (((i * 53 + 23) % 100) / 100 - 0.5) * 5;
      const x = show === 1 ? 0 : +(r * Math.cos(angle) + jx).toFixed(1);
      const y = show === 1 ? 0 : +(r * Math.sin(angle) + jy).toFixed(1);
      html += `<span class="oaq-seed" style="--x:${x}px;--y:${y}px"></span>`;
    }
    el.innerHTML = html;
  }

  // ── Arc the cluster element from its current position to a target pit ─────
  async function flyClusterTo(cluster, curX, curY, toIdx, duration) {
    const toEl = document.querySelector(`[data-pit="${toIdx}"]`);
    if (!toEl) return { x: curX, y: curY };
    const tr      = toEl.getBoundingClientRect();
    const targetX = tr.left + tr.width  / 2;
    const targetY = tr.top  + tr.height / 2;

    if (!skipSowing) {
      const dx   = targetX - curX;
      const dy   = targetY - curY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const arc  = Math.min(Math.max(36, dist * 0.52), 110);

      const skip = new Promise(res => { skipResolve = res; });
      const anim = cluster.animate([
        { transform: 'translate(-50%,-50%) scale(1.05)' },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - arc}px)) scale(1.2)`,
          offset: 0.42 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
      ], { duration, easing: 'ease-in-out', fill: 'both' });

      await Promise.race([anim.finished, skip]);
      anim.cancel();
    }

    cluster.style.left = `${targetX}px`;
    cluster.style.top  = `${targetY}px`;
    return { x: targetX, y: targetY };
  }

  // ── Core sow loop: pick up from startIdx, carry cluster CCW pit by pit ───
  async function sowSeeds(startIdx) {
    let remaining = state.board[startIdx];

    await animatePickup(startIdx);
    state.board[startIdx] = 0;
    renderBoard();

    // Spawn cluster centred on the source pit
    const srcEl   = document.querySelector(`[data-pit="${startIdx}"]`);
    const srcRect = srcEl ? srcEl.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    let curX = srcRect.left + srcRect.width  / 2;
    let curY = srcRect.top  + srcRect.height / 2;

    const cluster = document.createElement('div');
    cluster.className = 'oaq-fly-cluster';
    cluster.style.cssText =
      `position:fixed;left:${curX}px;top:${curY}px;` +
      `transform:translate(-50%,-50%);pointer-events:none;z-index:9999;`;
    setClusterContent(cluster, remaining);
    document.body.appendChild(cluster);

    let cur = startIdx;

    while (remaining > 0) {
      const next = nextIdx(cur);
      if (next === startIdx) { cur = next; continue; }

      const pos = await flyClusterTo(cluster, curX, curY, next, 680);
      curX = pos.x;
      curY = pos.y;

      state.board[next]++;
      remaining--;
      renderBoard();
      setClusterContent(cluster, remaining);
      cur = next;
      if (remaining > 0) await sleep(90);
    }

    cluster.remove();
    return cur;
  }

  // ── Entry point: sow, handle continuation loop, then capture / end turn ──
  async function sow(startIdx) {
    if (state.phase !== 'select') return;
    if (state.board[startIdx] === 0) return;

    skipSowing  = false;
    skipResolve = null;

    // Broadcast move intent so opponent can replay the animation in parallel.
    // Send BEFORE modifying state so board still has the pre-sow seed counts.
    if (vsRoom && window.RoomBridge && !_isSowingAsReplay) {
      RoomBridge.sendState(Object.assign({}, state, {
        board:      state.board.slice(),
        sowFrom:    startIdx,
        phase:      'sowing',
        last_actor: 'room:' + myRoomSeat,
      }));
    }

    state.phase = 'sowing';
    refresh();

    const pName = state.currentPlayer === 1 ? 'P1' : 'P2';
    addLog(state.currentPlayer, `${pName} picked up ${state.board[startIdx]} seeds from ${pitName(startIdx)}`);

    let lastPit = await sowSeeds(startIdx);
    let isSmall = P1_PITS.includes(lastPit) || P2_PITS.includes(lastPit);

    // Continuation: last seed landed in a non-empty small pit → pick up & keep going
    while (isSmall && state.board[lastPit] > 1) {
      addLog(state.currentPlayer, `Continuing from ${pitName(lastPit)}…`);
      await sleep(120);
      lastPit = await sowSeeds(lastPit);
      isSmall = P1_PITS.includes(lastPit) || P2_PITS.includes(lastPit);
    }

    // Capture: last seed landed in an empty small pit
    if (isSmall && state.board[lastPit] === 1) {
      await attemptCapture(lastPit);
    }

    endTurn();
  }

  async function attemptCapture(emptyIdx) {
    const captureIdx = nextIdx(emptyIdx);
    const myQ        = myQuan(state.currentPlayer);
    const isSmallPit = P1_PITS.includes(captureIdx) || P2_PITS.includes(captureIdx);

    if (isSmallPit && state.board[captureIdx] > 0) {
      const captured = state.board[captureIdx];

      // Fly a cluster from the captured pit to the player's quan
      const srcEl = document.querySelector(`[data-pit="${captureIdx}"]`);
      if (srcEl) {
        const sr   = srcEl.getBoundingClientRect();
        const curX = sr.left + sr.width  / 2;
        const curY = sr.top  + sr.height / 2;
        const cluster = document.createElement('div');
        cluster.className = 'oaq-fly-cluster';
        cluster.style.cssText =
          `position:fixed;left:${curX}px;top:${curY}px;` +
          `transform:translate(-50%,-50%);pointer-events:none;z-index:9999;`;
        setClusterContent(cluster, captured);
        document.body.appendChild(cluster);
        await flyClusterTo(cluster, curX, curY, myQ, 600);
        cluster.remove();
      }

      state.board[captureIdx] = 0;
      state.board[myQ] += captured;
      renderBoard();
      addLog(state.currentPlayer, `P${state.currentPlayer} captured ${captured} seeds!`);
      await sleep(200);
    }
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
      if (window.Auth && Auth.isLoggedIn()) {
        var _oaq = state.board[Q1] > state.board[Q2] ? 'win' : state.board[Q2] > state.board[Q1] ? 'loss' : 'draw';
        Auth.recordResult('o-an-quan', _oaq);
      }
      if (vsRoom && window.RoomBridge && !_isSowingAsReplay) {
        RoomBridge.sendState(Object.assign({}, state, { last_actor: 'room:' + myRoomSeat }));
        var winner = state.board[Q1] > state.board[Q2] ? 0 : state.board[Q2] > state.board[Q1] ? 1 : -1;
        if (winner >= 0) RoomBridge.reportWin(winner);
      }
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
        if (vsRoom && window.RoomBridge && !_isSowingAsReplay) {
          RoomBridge.sendState(Object.assign({}, state, { last_actor: 'room:' + myRoomSeat }));
          var noMoveWinner = state.board[Q1] > state.board[Q2] ? 0 : state.board[Q2] > state.board[Q1] ? 1 : -1;
          if (noMoveWinner >= 0) RoomBridge.reportWin(noMoveWinner);
        }
        refresh();
        return;
      }
      // Skip this player (they forfeit their turn)
      addLog(state.currentPlayer, `P${state.currentPlayer} has no moves — skipping.`);
      state.currentPlayer = other;
    }

    state.phase = 'select';
    refresh();
    if (vsRoom && window.RoomBridge && !_isSowingAsReplay) {
      RoomBridge.sendState(Object.assign({}, state, { last_actor: 'room:' + myRoomSeat }));
    }
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

  // ── Sleep (resolves immediately when skip is active) ──────────────────────
  function sleep(ms) {
    if (skipSowing) return Promise.resolve();
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
      el.addEventListener('click', () => {
        if (vsRoom && state.currentPlayer !== myRoomSeat + 1) return;
        sow(idx);
      });
    });

    // Skip animation button (only present during sowing phase)
    const skipBtn = container.querySelector('#oaq-skip');
    if (skipBtn) skipBtn.addEventListener('click', requestSkip);

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
        <div class="oaq-score-player p2">
          <div class="oaq-score-player__label">Player 2</div>
          <div class="oaq-score-player__num">${p2Score}</div>
        </div>
        <div class="oaq-score-divider">vs</div>
        <div class="oaq-score-player p1">
          <div class="oaq-score-player__label">Player 1</div>
          <div class="oaq-score-player__num">${p1Score}</div>
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
        ${phase === 'sowing' ? '<button class="btn btn--outline" id="oaq-skip">Skip Animation</button>' : ''}
        ${!vsRoom ? '<button class="btn btn--outline" id="oaq-restart">Restart Game</button>' : ''}
      </div>

      ${gameoverHTML}
    `;
  }

  // ── Deterministic jitter so seeds look naturally scattered, not perfectly circular
  function seedJitter(pit, i, axis) {
    const h = ((pit + 1) * 31 + i * 79 + axis * 53 + pit * i * 11) % 100;
    return (h / 100 - 0.5) * 6; // ±3 px offset
  }

  // Golden angle in radians — drives sunflower spiral (no obvious rings)
  const GOLDEN_ANGLE = 2.399963;

  // ── Sunflower spiral: seeds spread from centre outward, fills the whole pit
  function spiralSeeds(count, pitIdx, maxShown, maxR, cssClass) {
    const cls = cssClass ? `oaq-seeds ${cssClass}` : 'oaq-seeds';
    if (count === 0) return `<${cssClass ? 'div' : 'span'} class="${cls}"></${cssClass ? 'div' : 'span'}>`;
    const show = Math.min(count, maxShown);
    let html = `<div class="${cls}">`;
    for (let i = 0; i < show; i++) {
      // sqrt gives even area coverage — centre seeds are densely placed
      const r   = show === 1 ? 0 : Math.sqrt((i + 0.5) / show) * maxR;
      const ang = i * GOLDEN_ANGLE;
      const jx  = show > 1 ? seedJitter(pitIdx, i, 0) * 0.5 : 0;
      const jy  = show > 1 ? seedJitter(pitIdx, i, 1) * 0.5 : 0;
      const x   = show === 1 ? 0 : +(r * Math.cos(ang) + jx).toFixed(1);
      const y   = show === 1 ? 0 : +(r * Math.sin(ang) + jy).toFixed(1);
      html += `<span class="oaq-seed" style="--x:${x}px;--y:${y}px"></span>`;
    }
    if (count > maxShown) html += `<span class="oaq-seed-overflow">+${count - maxShown}</span>`;
    html += '</div>';
    return html;
  }

  // Small pits — max 12 shown, radius ~20px
  function circleSeeds(count, pitIdx) {
    if (count === 0) return '<span class="oaq-seed-none"></span>';
    return spiralSeeds(count, pitIdx, 12, 20, '');
  }

  // Quan stores — max 18 shown, larger radius to fill the taller store
  function quanSeeds(count, pitIdx) {
    return spiralSeeds(count, pitIdx, 18, 28, 'oaq-quan-seeds');
  }

  function buildBoardHTML() {
    const { board, currentPlayer, phase } = state;
    const isSelecting = phase === 'select';

    // Flip board for seat 1 so each player sees their own pits at the bottom
    const flip = vsRoom && myRoomSeat === 1;

    // Top row: P2 pits normally, P1 pits (reversed) when flipped
    const topPits    = flip ? [4, 3, 2, 1, 0]   : [10, 9, 8, 7, 6];
    // Bottom row: P1 pits normally, P2 pits when flipped
    const bottomPits = flip ? [6, 7, 8, 9, 10]  : [0, 1, 2, 3, 4];

    // colOffset: top pits [10,9,8,7,6] → columns 2,3,4,5,6; bottom pits [0..4] → columns 2..6
    function pitHTML(idx, row, col) {
      const count = board[idx];
      const isEmpty = count === 0;
      const mine = isMyPit(idx, currentPlayer);
      const canClick = isSelecting && mine && count > 0 &&
                       (!vsRoom || state.currentPlayer === myRoomSeat + 1);
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
          ${circleSeeds(count, idx)}
          <div class="oaq-pit__count">${count}</div>
        </button>`;
    }

    // Q2: column 1 normally, column 7 when flipped
    const q2 = `
      <div class="oaq-quan oaq-quan--p2" data-pit="11" style="grid-column:${flip ? 7 : 1};grid-row:1/3;" aria-label="Player 2 quan: ${board[Q2]} seeds">
        <span class="oaq-quan__label">P2</span>
        ${quanSeeds(board[Q2], Q2)}
      </div>`;

    // Q1: column 7 normally, column 1 when flipped
    const q1 = `
      <div class="oaq-quan oaq-quan--p1" data-pit="5" style="grid-column:${flip ? 1 : 7};grid-row:1/3;" aria-label="Player 1 quan: ${board[Q1]} seeds">
        <span class="oaq-quan__label">P1</span>
        ${quanSeeds(board[Q1], Q1)}
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

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + myRoomSeat) return;

    // Opponent started sowing — replay their animation locally in parallel.
    if (data.sowFrom !== undefined && data.phase === 'sowing') {
      if (_isSowingAsReplay) return; // already animating
      state.board = Array.isArray(data.board) ? data.board.slice() : state.board;
      state.currentPlayer = data.currentPlayer || state.currentPlayer;
      state.log  = data.log || state.log;
      state.phase = 'select'; // sow() requires phase==='select' to start
      _isSowingAsReplay = true;
      sow(data.sowFrom).finally(function () {
        _isSowingAsReplay = false;
        if (_pendingFinalState) {
          var p = _pendingFinalState;
          _pendingFinalState = null;
          Object.assign(state, p);
          if (Array.isArray(p.board)) state.board = p.board.slice();
          refresh();
        }
      });
      return;
    }

    // Final state arrived while replaying — buffer it; apply after animation.
    if (_isSowingAsReplay) {
      _pendingFinalState = data;
      return;
    }

    Object.assign(state, data);
    if (Array.isArray(data.board)) state.board = data.board.slice();
    refresh();
  }

  function initRoomMode(container) {
    if (!window.RoomBridge || !RoomBridge.isActive()) return;
    vsRoom      = true;
    myRoomSeat  = RoomBridge.getSeat();
    RoomBridge.onState(receiveRoomState);
    if (myRoomSeat === 0) {
      RoomBridge.sendState(Object.assign({}, state, { last_actor: 'room:0' }));
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('game-container');
    if (!container) return;

    state = initState();
    renderGame(container);
    initRoomMode(container);
  });

}());

/* ── Tutorial ────────────────────────────────────────────────────────────── */
if (window.CGTutorial) {
  CGTutorial.register('o-an-quan', [
    {
      target:   '#game-container',
      title:    'Welcome to Ô Ăn Quan',
      body:     'Ô Ăn Quan ("Mandarin\'s Box") is a Vietnamese mancala-style game for two players. Sow seeds around the board and capture as many as possible.',
      position: 'center',
      highlight: false,
    },
    {
      target:   '#game-container',
      title:    'The Board',
      body:     'The board has 10 small pits (5 per player) and 2 large Mandarin squares at the ends. Your pits are on the bottom row.',
      position: 'top',
    },
    {
      target:   '#game-container',
      title:    'Sowing Seeds',
      body:     'Click one of your pits to pick up all its seeds and distribute them one-by-one into consecutive pits going clockwise or counter-clockwise.',
      position: 'top',
    },
    {
      target:   '#game-container',
      title:    'Capturing Seeds',
      body:     'If the last seed lands on an empty pit and the pit directly ahead has seeds, you capture those seeds. Chained captures continue while pits alternate occupied → empty.',
      position: 'top',
    },
    {
      target:   '#game-container',
      title:    'Mandarin Squares',
      body:     'The large squares at each end hold many seeds. Capturing a Mandarin square is a huge gain — but landing there ends your turn with no capture.',
      position: 'top',
    },
    {
      target:   '#oaq-restart',
      title:    'Restart Game',
      body:     'Click here to reset the board and begin a new match.',
      position: 'bottom',
    },
  ]);
  CGTutorial.initTrigger('o-an-quan');
}

// ── Fullscreen resize hooks ────────────────────────────────────────────────
if (window.FSMode) {
  FSMode.onEnter = function () { _fsResize(); };
  FSMode.onExit  = function () { _fsResize(); };
}

function _fsResize() {
  setTimeout(function () {
    if (typeof renderBoard === 'function') renderBoard();
  }, 50);
}

// DOM-based game — re-render to let CSS fill the new available space
window.GameResize = function (availW, availH) {
  var container = document.getElementById('game-container');
  if (container && typeof renderBoard === 'function') renderBoard();
};
