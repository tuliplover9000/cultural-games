/**
 * oware.js — Oware (Akan / West Africa)
 * Phase 5
 *
 * Board layout (player's perspective, CCW sowing):
 *   AI row displayed:     [11][10][ 9][ 8][ 7][ 6]
 *   Player row displayed: [ 0][ 1][ 2][ 3][ 4][ 5]
 *
 * CCW index order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 0 …
 * Player owns pits 0–5; AI owns pits 6–11.
 * scores[0] = player captured seeds, scores[1] = AI captured seeds.
 *
 * Rules implemented:
 *  - Lapping: if picked-up count ≥ 12, skip the origin pit on every pass
 *  - Capture: last seed in opponent territory at exactly 2 or 3 →
 *             capture chain backwards through consecutive qualifying opp pits
 *  - Starvation: cannot leave opponent with 0 seeds unless forced
 *  - End: 25+ captured OR < 12 board seeds → each side claims own row
 */
(function () {
  'use strict';

  const PLAYER      = 0;
  const AI          = 1;
  const PLAYER_PITS = [0, 1, 2, 3, 4, 5];
  const AI_PITS     = [6, 7, 8, 9, 10, 11];
  const SOW_MS      = 180;   // ms per seed step (normal speed)

  /* ── State ── */
  let state = {};
  let difficulty = 'hard'; // 'easy' | 'hard' — persists across games
  let mode = 'vs-ai';      // 'vs-ai' | 'vs-human' — persists across games
  let vsRoom     = false;
  let myRoomSeat = 0;

  function newGame() {
    state = {
      pits:     Array(12).fill(4),
      scores:   [0, 0],
      current:  PLAYER,
      phase:          'idle',  // idle | sowing | ai-selecting | ai-thinking | gameover
      sowFrom:        -1,
      sowHand:        0,
      sowPos:         -1,
      sowLap:         false,
      lastSown:       -1,
      aiSelectedPit:  -1,     // pit the AI chose; shown briefly before sowing
      winner:         -1,     // -1 none, 0 player, 1 AI, 2 draw
      log:      [],
    };
    render();
  }

  /* ════════════════════════════════════════════════════════════
     Pure game-logic helpers (work on snapshot objects, no side
     effects on the live `state`).
  ════════════════════════════════════════════════════════════ */

  /**
   * Apply one sow+capture move to a state snapshot.
   * Returns a new snapshot — the original is not mutated.
   */
  function applyMove(snap, fromPit, player) {
    const pits   = [...snap.pits];
    const scores = [...snap.scores];

    let seeds = pits[fromPit];
    pits[fromPit] = 0;
    const lapping = seeds >= 12;
    let pos = fromPit;

    while (seeds > 0) {
      pos = (pos + 1) % 12;
      if (lapping && pos === fromPit) continue; // skip origin each pass
      pits[pos]++;
      seeds--;
    }

    // Capture: last seed in opponent's territory at 2 or 3 → chain backward
    const inOpp = player === PLAYER ? (p => p >= 6) : (p => p < 6);
    if (inOpp(pos)) {
      let cp = pos;
      while (inOpp(cp) && (pits[cp] === 2 || pits[cp] === 3)) {
        scores[player] += pits[cp];
        pits[cp] = 0;
        cp = (cp - 1 + 12) % 12;
      }
    }

    const ns = { pits, scores, phase: snap.phase };
    checkEndSt(ns);
    return ns;
  }

  function checkEndSt(ns) {
    const total = ns.pits.reduce((a, b) => a + b, 0);
    if (ns.scores[PLAYER] >= 25 || ns.scores[AI] >= 25 || total < 12) {
      for (let p = 0;  p < 6;  p++) { ns.scores[PLAYER] += ns.pits[p]; ns.pits[p] = 0; }
      for (let p = 6; p < 12; p++) { ns.scores[AI]     += ns.pits[p]; ns.pits[p] = 0; }
      ns.phase = 'gameover';
    }
  }

  /**
   * Valid pits for `player` to sow from, respecting the starvation rule.
   * Starvation rule: you may not leave your opponent with 0 seeds unless
   * every possible move does so.
   */
  function validMoves(snap, player) {
    const mine    = player === PLAYER ? PLAYER_PITS : AI_PITS;
    const oppIdx  = player === PLAYER ? AI_PITS     : PLAYER_PITS;
    const nonEmpty = mine.filter(p => snap.pits[p] > 0);
    if (!nonEmpty.length) return [];

    const nonStarving = nonEmpty.filter(p => {
      const after = applyMove(snap, p, player);
      // game-ending moves are always valid; also allow if opponent keeps seeds
      if (after.phase === 'gameover') return true;
      return oppIdx.reduce((s, q) => s + after.pits[q], 0) > 0;
    });

    return nonStarving.length ? nonStarving : nonEmpty; // forced if all starve
  }

  /* ════════════════════════════════════════════════════════════
     Minimax with alpha-beta pruning (depth 5)
  ════════════════════════════════════════════════════════════ */

  function minimax(snap, depth, alpha, beta, player) {
    if (snap.phase === 'gameover' || depth === 0) {
      return snap.scores[AI] - snap.scores[PLAYER];
    }
    const moves = validMoves(snap, player);
    if (!moves.length) {
      // No moves → end game: claim remaining seeds
      const final = { pits: [...snap.pits], scores: [...snap.scores], phase: snap.phase };
      checkEndSt(final);
      return final.scores[AI] - final.scores[PLAYER];
    }

    const next = 1 - player;
    if (player === AI) {
      let val = -Infinity;
      for (const m of moves) {
        val = Math.max(val, minimax(applyMove(snap, m, AI), depth - 1, alpha, beta, next));
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break;
      }
      return val;
    } else {
      let val = Infinity;
      for (const m of moves) {
        val = Math.min(val, minimax(applyMove(snap, m, PLAYER), depth - 1, alpha, beta, next));
        beta = Math.min(beta, val);
        if (beta <= alpha) break;
      }
      return val;
    }
  }

  function findBestAIMove() {
    const snap  = { pits: [...state.pits], scores: [...state.scores], phase: state.phase };
    const moves = validMoves(snap, AI);
    if (!moves.length) return -1;

    if (difficulty === 'easy') {
      // Easy: pick a random valid move — no lookahead
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Hard: minimax depth 5
    let best = moves[0], bestVal = -Infinity;
    for (const m of moves) {
      const val = minimax(applyMove(snap, m, AI), 5, -Infinity, Infinity, PLAYER);
      if (val > bestVal) { bestVal = val; best = m; }
    }
    return best;
  }

  /* ════════════════════════════════════════════════════════════
     Sowing animation — shared by player and AI
  ════════════════════════════════════════════════════════════ */

  function doSow(fromPit) {
    state.phase   = 'sowing';
    state.sowFrom = fromPit;
    state.sowHand = state.pits[fromPit];
    state.sowLap  = state.sowHand >= 12;
    state.sowPos  = fromPit;
    state.pits[fromPit] = 0;
    state.lastSown = -1;

    const p1name = mode === 'vs-human' ? 'Player 1' : 'You';
    const p2name = mode === 'vs-human' ? 'Player 2' : 'Opponent';
    const label = state.current === PLAYER
      ? `${p1name} sow${mode === 'vs-human' ? 's' : ''} from pit ${fromPit + 1}.`
      : `${p2name} sows from their pit ${fromPit - 5}.`;
    addLog(label);

    render();
    setTimeout(sowStep, SOW_MS);
  }

  function sowStep() {
    if (state.sowHand === 0) {
      finishSow();
      return;
    }
    state.sowPos = (state.sowPos + 1) % 12;

    // Lapping: skip the origin pit on every full revolution
    if (state.sowLap && state.sowPos === state.sowFrom) {
      setTimeout(sowStep, 0);
      return;
    }

    state.pits[state.sowPos]++;
    state.sowHand--;
    state.lastSown = state.sowPos;
    render();
    setTimeout(sowStep, SOW_MS);
  }

  function finishSow() {
    const player = state.current;
    const pos    = state.sowPos;
    const inOpp  = player === PLAYER ? (p => p >= 6) : (p => p < 6);

    // Resolve capture chain
    if (inOpp(pos)) {
      let cp = pos, captured = 0;
      while (inOpp(cp) && (state.pits[cp] === 2 || state.pits[cp] === 3)) {
        captured += state.pits[cp];
        state.scores[player] += state.pits[cp];
        state.pits[cp] = 0;
        cp = (cp - 1 + 12) % 12;
      }
      if (captured) {
        const cp1 = mode === 'vs-human' ? 'Player 1' : 'You';
        const cp2 = mode === 'vs-human' ? 'Player 2' : 'Opponent';
        addLog(player === PLAYER
          ? `${cp1} captured ${captured} seed${captured > 1 ? 's' : ''}!`
          : `${cp2} captured ${captured} seed${captured > 1 ? 's' : ''}!`);
      }
    }

    // Check game end
    const total = state.pits.reduce((a, b) => a + b, 0);
    if (state.scores[PLAYER] >= 25 || state.scores[AI] >= 25 || total < 12) {
      for (let p = 0;  p < 6;  p++) { state.scores[PLAYER] += state.pits[p]; state.pits[p] = 0; }
      for (let p = 6; p < 12; p++) { state.scores[AI]     += state.pits[p]; state.pits[p] = 0; }
      state.phase  = 'gameover';
      state.winner = state.scores[PLAYER] > state.scores[AI] ? PLAYER
                   : state.scores[AI] > state.scores[PLAYER] ? AI : 2;
      if (window.Auth && Auth.isLoggedIn())
        Auth.recordResult('oware', state.winner === PLAYER ? 'win' : state.winner === 2 ? 'draw' : 'loss');
      const gp1 = mode === 'vs-human' ? 'Player 1 wins!' : 'you win!';
      const gp2 = mode === 'vs-human' ? 'Player 2 wins.' : 'opponent wins.';
      addLog(state.winner === PLAYER ? `Game over — ${gp1}`
           : state.winner === AI     ? `Game over — ${gp2}`
                                     : 'Game over — it\'s a draw!');
      if (vsRoom) syncRoomState();
      render();
      return;
    }

    state.lastSown = -1;

    // Hand off to the other player
    if (player === PLAYER) {
      state.current = AI;
      if (mode === 'vs-human') {
        state.phase = 'idle';
        if (vsRoom) syncRoomState();
        render();
      } else {
        state.phase = 'ai-thinking';
        render();
        setTimeout(runAI, 800 + Math.random() * 600);
      }
    } else {
      state.phase   = 'idle';
      state.current = PLAYER;
      if (vsRoom) syncRoomState();
      render();
    }
  }

  function runAI() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.phase !== 'ai-thinking') return;
    const snap  = { pits: [...state.pits], scores: [...state.scores], phase: state.phase };
    const moves = validMoves(snap, AI);
    if (!moves.length) {
      checkEndState();
      render();
      return;
    }

    const best = findBestAIMove();

    // Show the chosen pit highlighted before sowing begins
    state.phase         = 'ai-selecting';
    state.aiSelectedPit = best;
    render();
    setTimeout(() => doSow(best), 1000);
  }

  function checkEndState() {
    const total = state.pits.reduce((a, b) => a + b, 0);
    if (state.scores[PLAYER] >= 25 || state.scores[AI] >= 25 || total < 12) {
      for (let p = 0;  p < 6;  p++) { state.scores[PLAYER] += state.pits[p]; state.pits[p] = 0; }
      for (let p = 6; p < 12; p++) { state.scores[AI]     += state.pits[p]; state.pits[p] = 0; }
      state.phase  = 'gameover';
      state.winner = state.scores[PLAYER] > state.scores[AI] ? PLAYER
                   : state.scores[AI] > state.scores[PLAYER] ? AI : 2;
    }
  }

  /* ════════════════════════════════════════════════════════════
     Helpers
  ════════════════════════════════════════════════════════════ */

  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 12) state.log.length = 12;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ════════════════════════════════════════════════════════════
     Rendering
  ════════════════════════════════════════════════════════════ */

  function render() {
    const el = document.getElementById('game-container');
    if (!el) return;
    el.innerHTML = buildUI();
    wireEvents(el);
  }

  function buildUI() {
    if (state.phase === 'gameover') return buildGameOver();

    const snap    = { pits: [...state.pits], scores: [...state.scores], phase: state.phase };
    const vsHuman = mode === 'vs-human';

    // Clickable pits — in room mode only highlight the LOCAL player's pits on their turn
    const myTurn   = vsRoom ? state.current === myRoomSeat : true;
    const botIdle  = state.phase === 'idle' && state.current === PLAYER && (!vsRoom || myRoomSeat === PLAYER);
    const topIdle  = vsHuman && state.phase === 'idle' && state.current === AI && (!vsRoom || myRoomSeat === AI);
    const botMoves = (botIdle && myTurn) ? validMoves(snap, PLAYER) : [];
    const topMoves = (topIdle && myTurn) ? validMoves(snap, AI)     : [];
    const aiSel    = state.phase === 'ai-selecting' ? state.aiSelectedPit : -1;

    // Status message
    let statusMsg;
    if (state.phase === 'ai-thinking') {
      statusMsg = `Opponent is thinking <span class="ow-dots"><span></span><span></span><span></span></span>`;
    } else if (state.phase === 'ai-selecting') {
      statusMsg = 'Opponent chose a pit…';
    } else if (state.phase === 'sowing') {
      statusMsg = vsHuman
        ? (state.current === PLAYER ? 'Player 1 sowing…' : 'Player 2 sowing…')
        : (state.current === PLAYER ? 'Sowing…'          : 'Opponent sowing…');
    } else {
      statusMsg = vsHuman
        ? (state.current === PLAYER ? 'Player 1 — click a highlighted pit' : 'Player 2 — click a highlighted pit')
        : 'Your turn — click a highlighted pit to sow';
    }

    // Board rows — flip for seat 1 so each player sees their pits at the bottom
    const flip = vsRoom && myRoomSeat === 1;

    // Store / row labels
    const topLabel    = vsHuman ? 'Player 2'       : 'Opponent';
    const botLabel    = vsHuman ? 'Player 1'       : 'You';
    const topRowLabel = flip ? "Player 1's pits" : (vsHuman ? "Player 2's pits" : "Opponent's pits");
    const botRowLabel = flip ? "Player 2's pits" : (vsHuman ? "Player 1's pits" : 'Your pits');
    const topRow = (flip ? [5, 4, 3, 2, 1, 0] : [11, 10, 9, 8, 7, 6])
      .map(p => pitHTML(p, (flip ? botMoves : topMoves).includes(p), p === state.lastSown, p === aiSel))
      .join('');
    const botRow = (flip ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5])
      .map(p => pitHTML(p, (flip ? topMoves : botMoves).includes(p), p === state.lastSown, false))
      .join('');

    // Difficulty row (hidden in vs-human/room mode)
    const diffHTML = (vsHuman || vsRoom) ? '' : `
    <div class="ow-difficulty">
      <span class="ow-difficulty__label">Difficulty:</span>
      <button class="ow-diff-btn${difficulty === 'easy' ? ' active' : ''}" id="ow-easy">Easy</button>
      <button class="ow-diff-btn${difficulty === 'hard' ? ' active' : ''}" id="ow-hard">Hard</button>
    </div>`;

    // Mode selector hidden in room mode
    const modeHTML = vsRoom ? '' : `
    <div class="ow-mode">
      <span class="ow-difficulty__label">Mode:</span>
      <button class="ow-diff-btn${mode === 'vs-ai'    ? ' active' : ''}" id="ow-mode-ai">vs AI</button>
      <button class="ow-diff-btn${mode === 'vs-human' ? ' active' : ''}" id="ow-mode-human">vs Player</button>
    </div>`;

    return `<div class="ow-game">
  <div class="ow-status">${statusMsg}</div>
  <div class="ow-board-wrap">
    <div class="ow-store ow-store--ai">
      <div class="ow-store__label">${topLabel}</div>
      <div class="ow-store__val">${state.scores[AI]}</div>
      <div class="ow-store__sub">captured</div>
    </div>
    <div class="ow-board">
      <div class="ow-row-label ow-row-label--ai">${topRowLabel}</div>
      <div class="ow-row ow-row--ai">${topRow}</div>
      <div class="ow-divider"></div>
      <div class="ow-row ow-row--player">${botRow}</div>
      <div class="ow-row-label ow-row-label--player">${botRowLabel}</div>
    </div>
    <div class="ow-store ow-store--player">
      <div class="ow-store__label">${botLabel}</div>
      <div class="ow-store__val">${state.scores[PLAYER]}</div>
      <div class="ow-store__sub">captured</div>
    </div>
  </div>
  ${buildLog()}
  <div class="ow-actions">
    ${modeHTML}${diffHTML}
    ${!vsRoom ? `<button class="ow-btn" id="ow-new">New Game</button>` : ''}
  </div>
</div>`;
  }

  /** Deterministic but varied rotation per seed — avoids obvious patterns */
  function seedRot(pit, i) {
    const h = ((pit + 1) * 31 + i * 79 + (pit + 1) * (i + 1) * 13) % 160;
    return h - 80; // -80 … +79 degrees
  }

  /** Render seeds arranged in a circle within the pit */
  function circleSeeds(count, pit, lit) {
    const show = Math.min(count, 12);
    if (!show) return '';
    // Radius grows gently with seed count so seeds spread to fill the pit
    const r = show === 1 ? 0 : 8 + show * 0.9;
    return Array.from({ length: show }, (_, i) => {
      const angle = (2 * Math.PI * i / show) - Math.PI / 2; // start from top
      const x = show === 1 ? 0 : +(r * Math.cos(angle)).toFixed(1);
      const y = show === 1 ? 0 : +(r * Math.sin(angle)).toFixed(1);
      const rot = seedRot(pit, i);
      const isNew = lit && i === show - 1;
      return `<span class="ow-seed${isNew ? ' ow-seed--new' : ''}" style="--x:${x}px;--y:${y}px;--rot:${rot}deg"></span>`;
    }).join('');
  }

  function pitHTML(pit, clickable, lit, aiSelected) {
    const count = state.pits[pit];
    const cls = [
      'ow-pit',
      clickable  ? 'ow-pit--clickable'  : '',
      lit        ? 'ow-pit--lit'        : '',
      aiSelected ? 'ow-pit--ai-select'  : '',
    ].filter(Boolean).join(' ');

    return `<div class="${cls}" data-pit="${pit}">
  <div class="ow-pit__seeds">${circleSeeds(count, pit, lit)}</div>
  <div class="ow-pit__count">${count}</div>
</div>`;
  }

  function buildLog() {
    if (!state.log.length) return '';
    const rows = state.log.slice(0, 6)
      .map(m => `<li>${esc(m)}</li>`)
      .join('');
    return `<div class="ow-log"><ul>${rows}</ul></div>`;
  }

  function buildGameOver() {
    const ps      = state.scores[PLAYER];
    const as      = state.scores[AI];
    const w       = state.winner;
    const vsHuman = mode === 'vs-human';
    const icon    = w === PLAYER ? '🏆' : w === AI ? '🟤' : '🤝';
    const title   = w === PLAYER
      ? (vsHuman ? 'Player 1 Wins!' : 'You Win!')
      : w === AI
      ? (vsHuman ? 'Player 2 Wins'  : 'Opponent Wins')
      : "It's a Draw";
    const p1name  = vsHuman ? 'Player 1' : 'You';
    const p2name  = vsHuman ? 'Player 2' : 'Opponent';
    return `<div class="ow-game">
  <div class="ow-gameover">
    <div class="ow-gameover__icon">${icon}</div>
    <h2>${title}</h2>
    <p>Final score: ${p1name} <strong>${ps}</strong> — ${p2name} <strong>${as}</strong></p>
    <button class="ow-btn ow-btn--primary" id="ow-new">Play Again</button>
  </div>
</div>`;
  }

  /* ════════════════════════════════════════════════════════════
     Event wiring
  ════════════════════════════════════════════════════════════ */

  function wireEvents(el) {
    el.querySelectorAll('.ow-pit--clickable').forEach(pitEl => {
      pitEl.addEventListener('click', () => {
        if (state.phase !== 'idle') return;
        const validCurrent = vsRoom
          ? state.current === myRoomSeat
          : (state.current === PLAYER || (mode === 'vs-human' && state.current === AI));
        if (!validCurrent) return;
        const pit  = +pitEl.dataset.pit;
        const snap = { pits: [...state.pits], scores: [...state.scores], phase: state.phase };
        const moves = validMoves(snap, state.current);
        if (moves.includes(pit)) doSow(pit);
      });
    });

    el.querySelector('#ow-new')?.addEventListener('click', newGame);

    el.querySelector('#ow-mode-ai')?.addEventListener('click', () => {
      mode = 'vs-ai';
      newGame();
    });
    el.querySelector('#ow-mode-human')?.addEventListener('click', () => {
      mode = 'vs-human';
      newGame();
    });
    el.querySelector('#ow-easy')?.addEventListener('click', () => {
      difficulty = 'easy';
      render();
    });
    el.querySelector('#ow-hard')?.addEventListener('click', () => {
      difficulty = 'hard';
      render();
    });
  }

  function syncRoomState() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      pits:       state.pits.slice(),
      scores:     state.scores.slice(),
      phase:      state.phase,
      current:    state.current,
      winner:     state.winner,
      log:        (state.log || []).slice(),
      last_actor: 'room:' + myRoomSeat,
    });
    if (state.winner >= 0) RoomBridge.reportWin(state.winner === 2 ? 0 : state.winner);
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + myRoomSeat) return;
    state.pits    = data.pits    || state.pits;
    state.scores  = data.scores  || state.scores;
    state.phase   = data.phase   || state.phase;
    state.current = data.current !== undefined ? data.current : state.current;
    state.winner  = data.winner  !== undefined ? data.winner  : state.winner;
    state.log     = data.log     || [];
    render();
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive()) return;
    vsRoom      = true;
    myRoomSeat  = RoomBridge.getSeat();
    mode        = 'vs-human';
    RoomBridge.onState(receiveRoomState);
    if (myRoomSeat === 0) syncRoomState();
  }

  /* ── Init ── */
  function init() {
    if (document.getElementById('game-container')) newGame();
    initRoomMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial ────────────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('oware', [
      {
        target: '#game-container',
        title: 'The Oware Board',
        body: 'This is Oware — a 2×6 pit mancala from West Africa. Each pit starts with 4 seeds. Your row is the one nearest to you.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#game-container',
        title: 'How to Sow',
        body: 'Click one of your pits to scoop up all its seeds and distribute them one-by-one counter-clockwise around the board.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#game-container',
        title: 'Capturing',
        body: 'If your last seed lands in an opponent\'s pit containing exactly 2 or 3 seeds, you capture them. Captures continue backwards if the preceding pits also have 2 or 3.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#game-container',
        title: 'Grand Slam Rule',
        body: 'You cannot capture all of your opponent\'s seeds in one move — you must leave them able to play. Such moves are illegal.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#ow-new',
        title: 'New Game',
        body: 'Click here to reset the board and start over.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('oware');
  }

}());
