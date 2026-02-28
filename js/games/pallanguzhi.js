/* ─────────────────────────────────────────────────────────────────────────
   Pallanguzhi — South Indian Mancala
   js/games/pallanguzhi.js  |  CSS prefix: pg-

   Rules:
   - 2 rows × 7 cups (indices 0–6: AI top row; 7–13: Player bottom row)
   - 6 shells per cup at start (84 total)
   - Sowing: pick up all shells, distribute one-by-one counter-clockwise
   - CCW cycle: 7→8→9→10→11→12→13→6→5→4→3→2→1→0→7…
   - Capture-on-4: last shell makes a cup reach exactly 4 → capture, continue
   - Continue sowing: last shell lands in non-empty cup (≠ 4) → re-pick, continue
   - Empty-cup capture (own row): last shell lands in own empty cup →
       if opposite cup non-empty: capture it; turn ends
   - Win: player's entire row empty → sweep board → most shells wins
───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────
  var PLAYER         = 0;   // owns cups 7–13 (bottom row)
  var AI             = 1;   // owns cups 0–6  (top row)
  var TOTAL_CUPS     = 14;
  var SHELLS_PER_CUP = 6;

  // Counter-clockwise cycle: player row left→right, then AI row right→left
  var CYCLE = [7, 8, 9, 10, 11, 12, 13, 6, 5, 4, 3, 2, 1, 0];

  // ── Module-level vars ─────────────────────────────────────────────────
  var mode  = 'vs-ai';   // 'vs-ai' | 'vs-human'
  var state = {};

  // ── Name helpers ──────────────────────────────────────────────────────
  function p1Name() { return 'Player 1'; }
  function p2Name() { return mode === 'vs-human' ? 'Player 2' : 'AI'; }
  function currentName() { return state.turn === PLAYER ? p1Name() : p2Name(); }

  // ── Status / log ──────────────────────────────────────────────────────
  function setStatus(msg) {
    var el = document.getElementById('pg-status');
    if (el) el.innerHTML = msg;
  }

  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 30) state.log.pop();
    renderLog();
  }

  // ── New game ──────────────────────────────────────────────────────────
  function newGame() {
    var cups = [];
    for (var i = 0; i < TOTAL_CUPS; i++) cups.push(SHELLS_PER_CUP);

    state = {
      phase:     'idle',   // idle | sowing | ai-thinking | over
      turn:      PLAYER,
      cups:      cups,
      stores:    { 0: 0, 1: 0 },   // keyed by PLAYER / AI
      sowingCup: -1,
      log:       [],
    };

    render();
    setStatus(p1Name() + ' — click a highlighted cup to sow.');
  }

  // ── Board helpers ─────────────────────────────────────────────────────

  // Opposite cup across the board: 0↔7, 1↔8, …, 6↔13
  function oppositeCup(cup) {
    return cup < 7 ? cup + 7 : cup - 7;
  }

  // Is this cup in the current player's own row?
  function isOwnCup(cup) {
    return state.turn === PLAYER ? cup >= 7 : cup < 7;
  }

  // Return the 14 cups in CCW order starting AFTER startCup
  function sowingOrder(startCup) {
    var idx = CYCLE.indexOf(startCup);
    var result = [];
    for (var i = 1; i <= TOTAL_CUPS; i++) {
      result.push(CYCLE[(idx + i) % TOTAL_CUPS]);
    }
    return result;
  }

  // Find the next non-empty cup in CCW order after fromCup; -1 if none
  function findNextNonEmpty(fromCup) {
    var order = sowingOrder(fromCup);
    for (var i = 0; i < order.length; i++) {
      if (state.cups[order[i]] > 0) return order[i];
    }
    return -1;
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  function render() {
    renderBoard();
    renderStores();
    renderLog();
  }

  function renderBoard() {
    var el = document.getElementById('pg-board');
    if (!el) return;

    var isIdle = state.phase === 'idle';
    var html = '';

    // AI row: cups 0–6, top row
    html += '<div class="pg-row pg-row--ai">';
    for (var i = 0; i < 7; i++) {
      var canClick = isIdle
        && (state.turn === AI && mode === 'vs-human')
        && state.cups[i] > 0;
      html += cupHTML(i, canClick);
    }
    html += '</div>';

    // Player row: cups 7–13, bottom row
    html += '<div class="pg-row pg-row--player">';
    for (var j = 7; j < 14; j++) {
      var canClickP = isIdle && state.turn === PLAYER && state.cups[j] > 0;
      html += cupHTML(j, canClickP);
    }
    html += '</div>';

    el.innerHTML = html;

    // Wire clicks
    el.querySelectorAll('.pg-cup--clickable').forEach(function (cupEl) {
      cupEl.addEventListener('click', function () {
        onCupClick(parseInt(cupEl.dataset.cup, 10));
      });
    });
  }

  function cupHTML(idx, canClick) {
    var count = state.cups[idx];
    var isSowing = state.sowingCup === idx;
    var cls = 'pg-cup';
    if (canClick)  cls += ' pg-cup--clickable';
    if (isSowing)  cls += ' pg-cup--sowing';
    if (count === 0) cls += ' pg-cup--empty';

    // Dot grid for small counts (≤ 9), number for larger
    var inner;
    if (count === 0) {
      inner = '<span class="pg-cup-big">—</span>';
    } else if (count <= 9) {
      var dots = '';
      for (var d = 0; d < count; d++) {
        dots += '<span class="pg-shell"></span>';
      }
      inner = '<div class="pg-shell-grid">' + dots + '</div>';
    } else {
      inner = '<span class="pg-cup-big">' + count + '</span>';
    }

    return '<div class="' + cls + '" data-cup="' + idx + '">' + inner + '</div>';
  }

  function renderStores() {
    var aiEl = document.getElementById('pg-store-ai');
    var plEl = document.getElementById('pg-store-player');
    var lbEl = document.getElementById('pg-ai-store-label');

    if (aiEl) aiEl.textContent = state.stores[AI];
    if (plEl) plEl.textContent = state.stores[PLAYER];

    // Update label for vs-human
    if (lbEl) lbEl.textContent = (mode === 'vs-human' ? 'Player 2' : 'AI') + ' Store';

    // Update "Your Store" label
    var playerLabel = document.querySelector('.pg-store-block:last-child .pg-store-label');
    if (playerLabel) playerLabel.textContent = (mode === 'vs-human' ? 'Player 1' : 'You') + ' Store';
  }

  function renderLog() {
    var el = document.getElementById('pg-log');
    if (!el) return;
    el.innerHTML = state.log.map(function (m) { return '<li>' + m + '</li>'; }).join('');
  }

  // ── Sowing ────────────────────────────────────────────────────────────
  function onCupClick(cupIdx) {
    if (state.phase !== 'idle') return;

    var validPlayer = state.turn === PLAYER && cupIdx >= 7 && cupIdx <= 13 && state.cups[cupIdx] > 0;
    var validAI     = state.turn === AI && mode === 'vs-human' && cupIdx >= 0 && cupIdx <= 6 && state.cups[cupIdx] > 0;
    if (!validPlayer && !validAI) return;

    var cupLabel = cupIdx < 7 ? (cupIdx + 1) : (cupIdx - 6); // 1-indexed label
    addLog(currentName() + ' picks cup ' + cupLabel + ' (' + state.cups[cupIdx] + ' shells)');
    state.phase = 'sowing';
    setStatus('Sowing…');

    setTimeout(function () { sow(cupIdx); }, 60);
  }

  function sow(cupIdx) {
    if (state.cups[cupIdx] === 0) {
      // Caller should have checked, but guard anyway
      var next = findNextNonEmpty(cupIdx);
      if (next === -1) { endTurn(); return; }
      sow(next);
      return;
    }

    var shells = state.cups[cupIdx];
    state.cups[cupIdx] = 0;

    var order = sowingOrder(cupIdx);
    var step = 0;
    var lastCup = cupIdx;
    var lastWasEmpty = false;

    function dropOne() {
      if (shells === 0) {
        state.sowingCup = -1;
        renderBoard();
        setTimeout(function () { resolveLastDrop(lastCup, lastWasEmpty); }, 140);
        return;
      }
      var target = order[step % order.length];
      lastWasEmpty = (state.cups[target] === 0);
      state.cups[target]++;
      shells--;
      step++;
      lastCup = target;
      state.sowingCup = target;
      renderBoard();
      setTimeout(dropOne, 160);
    }

    dropOne();
  }

  function resolveLastDrop(lastCup, wasEmpty) {
    // ── Capture-on-4 ────────────────────────────────────────────────────
    if (state.cups[lastCup] === 4) {
      state.stores[state.turn] += 4;
      state.cups[lastCup] = 0;
      addLog(currentName() + ' captured 4! Store → ' + state.stores[state.turn]);
      setStatus(currentName() + ' captured 4! Continuing…');
      renderBoard();
      renderStores();

      setTimeout(function () {
        var next = findNextNonEmpty(lastCup);
        if (next === -1) {
          endTurn();
        } else {
          sow(next);
        }
      }, 320);
      return;
    }

    // ── Empty-cup landing ────────────────────────────────────────────────
    if (wasEmpty) {
      if (isOwnCup(lastCup)) {
        var opp = oppositeCup(lastCup);
        if (state.cups[opp] > 0) {
          var grabbed = state.cups[opp];
          state.stores[state.turn] += grabbed;
          state.cups[opp] = 0;
          addLog(currentName() + ' landed in empty cup — captured ' + grabbed + ' from opposite!');
          setStatus(currentName() + ' captured ' + grabbed + ' shells from across!');
          renderBoard();
          renderStores();
        } else {
          addLog(currentName() + ' landed in empty cup — no capture.');
          setStatus('Empty cup — no capture. Turn ends.');
          renderBoard();
        }
      } else {
        // Landed in opponent's empty cup — no capture
        addLog(currentName() + ' landed in opponent\'s empty cup.');
        setStatus('Turn ends.');
        renderBoard();
      }
      setTimeout(endTurn, 500);
      return;
    }

    // ── Continue sowing (non-empty, not 4) ──────────────────────────────
    setStatus(currentName() + ' continues sowing…');
    setTimeout(function () { sow(lastCup); }, 220);
  }

  // ── Turn management ───────────────────────────────────────────────────
  function endTurn() {
    if (checkGameOver()) return;

    state.turn = 1 - state.turn;
    state.phase = 'idle';

    if (state.turn === AI && mode === 'vs-ai') {
      state.phase = 'ai-thinking';
      setStatus('<span class="pg-thinking"><span></span><span></span><span></span></span> AI is thinking…');
      renderBoard();
      setTimeout(aiTurn, 700 + Math.random() * 400);
    } else {
      setStatus(currentName() + ' — click a highlighted cup to sow.');
      renderBoard();
    }
  }

  function checkGameOver() {
    var playerEmpty = true;
    for (var i = 7; i < 14; i++) { if (state.cups[i] > 0) { playerEmpty = false; break; } }
    var aiEmpty = true;
    for (var i = 0; i < 7; i++) { if (state.cups[i] > 0) { aiEmpty = false; break; } }

    if (!playerEmpty && !aiEmpty) return false;

    // Sweep remaining shells: each player gets their own row's shells
    for (var i = 0; i < 7; i++) { state.stores[AI] += state.cups[i]; state.cups[i] = 0; }
    for (var i = 7; i < 14; i++) { state.stores[PLAYER] += state.cups[i]; state.cups[i] = 0; }

    state.phase = 'over';

    var ps = state.stores[PLAYER], as = state.stores[AI];
    var pn = (mode === 'vs-human' ? 'Player 1' : 'You');
    var an = (mode === 'vs-human' ? 'Player 2' : 'AI');

    var msg;
    if (ps > as) {
      msg = '🏆 ' + pn + ' wins! ' + ps + ' vs ' + as + ' shells.';
      addLog(pn + ' wins ' + ps + '–' + as + '!');
    } else if (as > ps) {
      msg = '🏆 ' + an + ' wins! ' + as + ' vs ' + ps + ' shells.';
      addLog(an + ' wins ' + as + '–' + ps + '!');
    } else {
      msg = 'Draw — both have ' + ps + ' shells!';
      addLog('Draw! ' + ps + '–' + as);
    }

    setStatus(msg);
    renderBoard();
    renderStores();
    return true;
  }

  // ── AI ────────────────────────────────────────────────────────────────
  function aiTurn() {
    var cup = aiChooseMove();
    if (cup === -1) { endTurn(); return; }

    var cupLabel = cup + 1; // AI cups 0-6 → label 1-7
    addLog('AI picks cup ' + cupLabel + ' (' + state.cups[cup] + ' shells)');
    state.phase = 'sowing';
    setTimeout(function () { sow(cup); }, 120);
  }

  function aiChooseMove() {
    var candidates = [];
    for (var i = 0; i < 7; i++) {
      if (state.cups[i] > 0) candidates.push(i);
    }
    if (candidates.length === 0) return -1;

    var best = candidates[0];
    var bestScore = -Infinity;
    for (var j = 0; j < candidates.length; j++) {
      var s = scoreAICup(candidates[j]);
      if (s > bestScore) { bestScore = s; best = candidates[j]; }
    }
    return best;
  }

  function scoreAICup(cup) {
    var shells = state.cups[cup];
    if (shells === 0) return -Infinity;

    var order = sowingOrder(cup);

    // Simulate first landing position (shells-1 steps, 0-indexed in order)
    var landIdx = (shells - 1) % order.length;
    var landCup = order[landIdx];
    var landCountAfter = state.cups[landCup] + 1;

    // Highest priority: will capture 4
    if (landCountAfter === 4) return 200;

    // Next: will land in own empty cup with non-empty opposite
    if (state.cups[landCup] === 0 && landCup < 7) {
      var opp = oppositeCup(landCup);
      if (state.cups[opp] > 0) return 100 + state.cups[opp];
    }

    // Next: will land in non-empty cup and continue (good — more sowing)
    if (state.cups[landCup] > 0) return 10 + shells;

    // Fallback: prefer more shells
    return shells;
  }

  // ── Mode buttons ──────────────────────────────────────────────────────
  function updateModeButtons() {
    var aiBtn  = document.getElementById('pg-mode-ai');
    var humBtn = document.getElementById('pg-mode-human');
    if (aiBtn)  aiBtn.classList.toggle('active', mode === 'vs-ai');
    if (humBtn) humBtn.classList.toggle('active', mode === 'vs-human');
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('pg-new-game-btn').addEventListener('click', newGame);

    var aiBtn  = document.getElementById('pg-mode-ai');
    var humBtn = document.getElementById('pg-mode-human');
    if (aiBtn)  aiBtn.addEventListener('click',  function () { mode = 'vs-ai';    updateModeButtons(); newGame(); });
    if (humBtn) humBtn.addEventListener('click', function () { mode = 'vs-human'; updateModeButtons(); newGame(); });

    newGame();
  }

  document.addEventListener('DOMContentLoaded', init);
}());
