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

  /* ── Flying sow cluster (lives on body; survives game-container re-renders) ── */
  let owCluster = null;

  function owGetPitRect(pitIdx) {
    const el = document.querySelector(`[data-pit="${pitIdx}"]`);
    return el ? el.getBoundingClientRect() : null;
  }

  function owCreateCluster(count, fromPit) {
    owDestroyCluster();
    const rect = owGetPitRect(fromPit);
    const div  = document.createElement('div');
    div.className   = 'ow-fly-cluster';
    div.textContent = count;
    if (rect) {
      div.style.left = (rect.left + rect.width  / 2) + 'px';
      div.style.top  = (rect.top  + rect.height / 2) + 'px';
    }
    document.body.appendChild(div);
    owCluster = div;
    // Enable smooth transitions after first paint so it doesn't slide from 0,0
    requestAnimationFrame(() => {
      if (owCluster) owCluster.classList.add('ow-fly-cluster--moving');
    });
  }

  function owMoveCluster(pitIdx) {
    if (!owCluster) return;
    const rect = owGetPitRect(pitIdx);
    if (!rect) return;
    owCluster.style.left = (rect.left + rect.width  / 2) + 'px';
    owCluster.style.top  = (rect.top  + rect.height / 2) + 'px';
  }

  function owSetClusterCount(count) {
    if (owCluster) owCluster.textContent = count;
  }

  function owDestroyCluster() {
    if (owCluster) { owCluster.remove(); owCluster = null; }
  }

  /* ── State ── */
  let state = {};
  let difficulty = 'hard'; // 'easy' | 'hard' — persists across games

  function newGame() {
    owDestroyCluster();
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

    const label = state.current === PLAYER
      ? `You sow from pit ${fromPit + 1}.`
      : `Opponent sows from their pit ${fromPit - 5}.`;
    addLog(label);

    // Create flying cluster at source pit (query DOM BEFORE render destroys it)
    owCreateCluster(state.sowHand, fromPit);
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

    // Move cluster to target pit (query DOM BEFORE render; layout is stable)
    owMoveCluster(state.sowPos);
    owSetClusterCount(state.sowHand);

    render();
    setTimeout(sowStep, SOW_MS);
  }

  function finishSow() {
    owDestroyCluster();
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
        addLog(player === PLAYER
          ? `You captured ${captured} seed${captured > 1 ? 's' : ''}!`
          : `Opponent captured ${captured} seed${captured > 1 ? 's' : ''}!`);
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
      addLog(state.winner === PLAYER ? 'Game over — you win!'
           : state.winner === AI     ? 'Game over — opponent wins.'
                                     : 'Game over — it\'s a draw!');
      render();
      return;
    }

    state.lastSown = -1;

    // Hand off to the other player
    if (player === PLAYER) {
      state.phase   = 'ai-thinking';
      state.current = AI;
      render();
      setTimeout(runAI, 800 + Math.random() * 600);
    } else {
      state.phase   = 'idle';
      state.current = PLAYER;
      render();
    }
  }

  function runAI() {
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
    const isIdle  = state.phase === 'idle' && state.current === PLAYER;
    const moves   = isIdle ? validMoves(snap, PLAYER) : [];
    const aiSel   = state.phase === 'ai-selecting' ? state.aiSelectedPit : -1;

    let statusMsg;
    if (state.phase === 'ai-thinking') {
      statusMsg = `Opponent is thinking <span class="ow-dots"><span></span><span></span><span></span></span>`;
    } else if (state.phase === 'ai-selecting') {
      statusMsg = 'Opponent chose a pit…';
    } else if (state.phase === 'sowing' && state.current === AI) {
      statusMsg = 'Opponent sowing…';
    } else if (state.phase === 'sowing' && state.current === PLAYER) {
      statusMsg = 'Sowing…';
    } else {
      statusMsg = 'Your turn — click a highlighted pit to sow';
    }

    // AI row: display pits 11 → 6 (left to right from player's perspective)
    const topRow = [11, 10, 9, 8, 7, 6]
      .map(p => pitHTML(p, false, p === state.lastSown, p === aiSel))
      .join('');

    // Player row: pits 0 → 5
    const botRow = [0, 1, 2, 3, 4, 5]
      .map(p => pitHTML(p, moves.includes(p), p === state.lastSown, false))
      .join('');

    return `<div class="ow-game">
  <div class="ow-status">${statusMsg}</div>
  <div class="ow-board-wrap">
    <div class="ow-store ow-store--ai">
      <div class="ow-store__label">Opponent</div>
      <div class="ow-store__val">${state.scores[AI]}</div>
      <div class="ow-store__sub">captured</div>
    </div>
    <div class="ow-board">
      <div class="ow-row-label ow-row-label--ai">Opponent's pits</div>
      <div class="ow-row ow-row--ai">${topRow}</div>
      <div class="ow-divider"></div>
      <div class="ow-row ow-row--player">${botRow}</div>
      <div class="ow-row-label ow-row-label--player">Your pits</div>
    </div>
    <div class="ow-store ow-store--player">
      <div class="ow-store__label">You</div>
      <div class="ow-store__val">${state.scores[PLAYER]}</div>
      <div class="ow-store__sub">captured</div>
    </div>
  </div>
  ${buildLog()}
  <div class="ow-actions">
    <div class="ow-difficulty">
      <span class="ow-difficulty__label">Difficulty:</span>
      <button class="ow-diff-btn${difficulty === 'easy' ? ' active' : ''}" id="ow-easy">Easy</button>
      <button class="ow-diff-btn${difficulty === 'hard' ? ' active' : ''}" id="ow-hard">Hard</button>
    </div>
    <button class="ow-btn" id="ow-new">New Game</button>
  </div>
</div>`;
  }

  // Golden angle — drives sunflower spiral so seeds fill centre too
  const OW_GOLDEN = 2.399963;

  /** Render round pebble seeds in a sunflower spiral (fills centre outward) */
  function circleSeeds(count, pit, lit) {
    const show = Math.min(count, 12);
    if (!show) return '';
    const maxR = 22; // fits 11px seeds in 70px pit
    return Array.from({ length: show }, (_, i) => {
      const r   = show === 1 ? 0 : Math.sqrt((i + 0.5) / show) * maxR;
      const ang = i * OW_GOLDEN;
      const x   = show === 1 ? 0 : +(r * Math.cos(ang)).toFixed(1);
      const y   = show === 1 ? 0 : +(r * Math.sin(ang)).toFixed(1);
      const isNew = lit && i === show - 1;
      return `<span class="ow-seed${isNew ? ' ow-seed--new' : ''}" style="--x:${x}px;--y:${y}px"></span>`;
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
    const ps = state.scores[PLAYER];
    const as = state.scores[AI];
    const w  = state.winner;
    const icon  = w === PLAYER ? '🏆' : w === AI ? '🟤' : '🤝';
    const title = w === PLAYER ? 'You Win!' : w === AI ? 'Opponent Wins' : "It's a Draw";
    return `<div class="ow-game">
  <div class="ow-gameover">
    <div class="ow-gameover__icon">${icon}</div>
    <h2>${title}</h2>
    <p>Final score: You <strong>${ps}</strong> — Opponent <strong>${as}</strong></p>
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
        if (state.phase !== 'idle' || state.current !== PLAYER) return;
        const pit   = +pitEl.dataset.pit;
        const snap  = { pits: [...state.pits], scores: [...state.scores], phase: state.phase };
        const moves = validMoves(snap, PLAYER);
        if (moves.includes(pit)) doSow(pit);
      });
    });

    el.querySelector('#ow-new')?.addEventListener('click', newGame);

    el.querySelector('#ow-easy')?.addEventListener('click', () => {
      difficulty = 'easy';
      render();
    });
    el.querySelector('#ow-hard')?.addEventListener('click', () => {
      difficulty = 'hard';
      render();
    });
  }

  /* ── Init ── */
  function init() {
    if (document.getElementById('game-container')) newGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
