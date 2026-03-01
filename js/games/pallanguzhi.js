/* ─────────────────────────────────────────────────────────────────────────
   Pallanguzhi — South Indian Mancala
   js/games/pallanguzhi.js  |  CSS prefix: pg-

   Board layout (player's perspective, CCW sowing):
     AI row displayed:     [0][ 1][ 2][ 3][ 4][ 5][ 6]   (cups 0–6)
     Player row displayed: [7][ 8][ 9][10][11][12][13]   (cups 7–13)
   Cup 6 is directly above cup 13 (both at the right end).
   Cup 0 is directly above cup 7  (both at the left end).

   CCW cycle: 7→8→9→10→11→12→13→6→5→4→3→2→1→0→7…

   Rules:
   - 6 shells per cup at start (84 total)
   - Sow: pick up all shells, drop one per cup CCW
   - Capture-on-4: last shell makes cup reach 4 → capture 4, sow from next cup
   - Continue: last shell in non-empty cup (≠4) → re-pick and continue
   - Empty-cup capture (own row): last shell in own empty cup →
       if opposite cup has shells: capture them; turn ends
   - Win: player's row all-empty → sweep → most shells wins
───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────
  var PLAYER     = 0;   // owns cups 7–13 (bottom row)
  var AI         = 1;   // owns cups 0–6  (top row)
  var TOTAL_CUPS = 14;
  var SHELLS_PER = 6;
  var SOW_MS     = 160; // ms between shell drops

  // CCW cycle: player row L→R, then AI row R→L
  var CYCLE = [7, 8, 9, 10, 11, 12, 13, 6, 5, 4, 3, 2, 1, 0];

  // ── Module-level vars ─────────────────────────────────────────────────
  var mode  = 'vs-ai';   // 'vs-ai' | 'vs-human'
  var state = {};

  // ── Name helpers ──────────────────────────────────────────────────────
  function p1Name() { return 'Player 1'; }
  function p2Name() { return mode === 'vs-human' ? 'Player 2' : 'AI'; }
  function turnName() { return state.turn === PLAYER ? p1Name() : p2Name(); }

  // ── Log ───────────────────────────────────────────────────────────────
  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 14) state.log.length = 14;
  }

  // ── New game ──────────────────────────────────────────────────────────
  function newGame() {
    var cups = [];
    for (var i = 0; i < TOTAL_CUPS; i++) cups.push(SHELLS_PER);

    state = {
      phase:          'idle',   // idle | sowing | ai-thinking | ai-selecting | over
      turn:           PLAYER,
      cups:           cups,
      stores:         { 0: 0, 1: 0 },
      sowingCup:      -1,   // cup currently receiving a shell (for glow)
      aiSelectingCup: -1,   // cup AI chose (shown briefly before sowing)
      log:            [],
    };
    render();
  }

  // ── Board helpers ─────────────────────────────────────────────────────

  // Cup directly across the board: 0↔7, 1↔8, …, 6↔13
  function oppositeCup(cup) {
    return cup < 7 ? cup + 7 : cup - 7;
  }

  // Is this cup in the current player's own row?
  function isOwnCup(cup) {
    return state.turn === PLAYER ? cup >= 7 : cup < 7;
  }

  // 14 cups in CCW order starting AFTER startCup
  function sowingOrder(startCup) {
    var idx = CYCLE.indexOf(startCup);
    var result = [];
    for (var i = 1; i <= TOTAL_CUPS; i++) {
      result.push(CYCLE[(idx + i) % TOTAL_CUPS]);
    }
    return result;
  }

  // Next non-empty cup in CCW order after fromCup; -1 if none
  function findNextNonEmpty(fromCup) {
    var order = sowingOrder(fromCup);
    for (var i = 0; i < order.length; i++) {
      if (state.cups[order[i]] > 0) return order[i];
    }
    return -1;
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  function render() {
    var el = document.getElementById('game-container');
    if (!el) return;
    el.innerHTML = buildUI();
    wireEvents(el);
  }

  function buildUI() {
    var vsHuman = mode === 'vs-human';
    var you     = vsHuman ? 'Player 1' : 'You';
    var opp     = vsHuman ? 'Player 2' : 'AI';

    var isIdle = state.phase === 'idle';

    // Clickable cups this turn
    var clickablePlayer = [];
    var clickableAI     = [];
    if (isIdle && state.turn === PLAYER) {
      for (var i = 7; i < 14; i++) { if (state.cups[i] > 0) clickablePlayer.push(i); }
    }
    if (isIdle && state.turn === AI && vsHuman) {
      for (var i = 0; i < 7; i++) { if (state.cups[i] > 0) clickableAI.push(i); }
    }

    // Status message
    var statusMsg;
    if (state.phase === 'ai-thinking') {
      statusMsg = opp + ' is thinking <span class="pg-dots"><span></span><span></span><span></span></span>';
    } else if (state.phase === 'ai-selecting') {
      statusMsg = opp + ' chose a cup\u2026';
    } else if (state.phase === 'sowing') {
      if (vsHuman) {
        statusMsg = (state.turn === PLAYER ? 'Player 1' : 'Player 2') + ' sowing\u2026';
      } else {
        statusMsg = state.turn === PLAYER ? 'Sowing\u2026' : opp + ' sowing\u2026';
      }
    } else if (state.phase === 'over') {
      statusMsg = state.endMsg || 'Game over.';
    } else {
      statusMsg = vsHuman
        ? (state.turn === PLAYER ? 'Player 1 \u2014 click a highlighted cup' : 'Player 2 \u2014 click a highlighted cup')
        : 'Your turn \u2014 click a highlighted cup to sow';
    }

    // AI row: cups 0–6, left to right
    var aiRow = '';
    for (var i = 0; i < 7; i++) {
      aiRow += pitHTML(
        i,
        clickableAI.indexOf(i) !== -1,
        state.sowingCup === i,
        state.aiSelectingCup === i
      );
    }
    // Player row: cups 7–13, left to right
    var playerRow = '';
    for (var j = 7; j < 14; j++) {
      playerRow += pitHTML(
        j,
        clickablePlayer.indexOf(j) !== -1,
        state.sowingCup === j,
        false
      );
    }

    // Log HTML
    var logHtml = '';
    if (state.log.length) {
      var items = state.log.map(function (m) { return '<li>' + m + '</li>'; }).join('');
      logHtml = '<div class="pg-log"><ul>' + items + '</ul></div>';
    }

    // Mode + new-game controls
    var controls = '<div class="pg-actions">'
      + '<div class="pg-mode">'
      + '<span class="pg-mode-label">Mode:</span>'
      + '<button class="pg-diff-btn' + (mode === 'vs-ai'    ? ' active' : '') + '" id="pg-mode-ai">vs AI</button>'
      + '<button class="pg-diff-btn' + (mode === 'vs-human' ? ' active' : '') + '" id="pg-mode-human">vs Player</button>'
      + '</div>'
      + '<button class="pg-btn" id="pg-new">New Game</button>'
      + '</div>';

    return '<div class="pg-game">'
      + '<div class="pg-status">' + statusMsg + '</div>'
      + '<div class="pg-board-wrap">'
        + '<div class="pg-store pg-store--ai">'
          + '<div class="pg-store__label">' + opp + '</div>'
          + '<div class="pg-store__val">' + state.stores[AI] + '</div>'
          + '<div class="pg-store__sub">captured</div>'
        + '</div>'
        + '<div class="pg-board">'
          + '<div class="pg-row-label pg-row-label--ai">' + opp + '\u2019s cups</div>'
          + '<div class="pg-row pg-row--ai">' + aiRow + '</div>'
          + '<div class="pg-divider"></div>'
          + '<div class="pg-row pg-row--player">' + playerRow + '</div>'
          + '<div class="pg-row-label pg-row-label--player">' + you + '\u2019s cups</div>'
        + '</div>'
        + '<div class="pg-store pg-store--player">'
          + '<div class="pg-store__label">' + you + '</div>'
          + '<div class="pg-store__val">' + state.stores[PLAYER] + '</div>'
          + '<div class="pg-store__sub">captured</div>'
        + '</div>'
      + '</div>'
      + logHtml
      + controls
      + '</div>';
  }

  // Deterministic rotation — no obvious patterns
  function shellRot(cup, i) {
    var h = ((cup + 1) * 31 + i * 79 + (cup + 1) * (i + 1) * 13) % 140;
    return h - 70; // −70 … +69 degrees
  }

  // Cowrie shells arranged in a circle inside the cup
  function circleShells(count, cup, lit) {
    var show = Math.min(count, 14);
    if (!show) return '';
    // radius grows gently with count
    var r = show === 1 ? 0 : 5 + show * 1.2;
    var html = '';
    for (var i = 0; i < show; i++) {
      var angle = (2 * Math.PI * i / show) - Math.PI / 2; // start from top
      var x = show === 1 ? 0 : parseFloat((r * Math.cos(angle)).toFixed(1));
      var y = show === 1 ? 0 : parseFloat((r * Math.sin(angle)).toFixed(1));
      var rot = shellRot(cup, i);
      var isNew = lit && i === show - 1;
      html += '<span class="pg-shell' + (isNew ? ' pg-shell--new' : '') + '"'
            + ' style="--x:' + x + 'px;--y:' + y + 'px;--rot:' + rot + 'deg">'
            + '</span>';
    }
    return html;
  }

  function pitHTML(cup, clickable, lit, aiSelected) {
    var count = state.cups[cup];
    var cls = ['pg-pit'];
    if (clickable)  cls.push('pg-pit--clickable');
    if (lit)        cls.push('pg-pit--lit');
    if (aiSelected) cls.push('pg-pit--ai-select');

    return '<div class="' + cls.join(' ') + '" data-cup="' + cup + '">'
      + '<div class="pg-pit__shells">' + circleShells(count, cup, lit) + '</div>'
      + '<div class="pg-pit__count">' + count + '</div>'
      + '</div>';
  }

  // ── Event wiring ──────────────────────────────────────────────────────
  function wireEvents(el) {
    var newBtn = el.querySelector('#pg-new');
    if (newBtn) newBtn.addEventListener('click', newGame);

    var aiModeBtn  = el.querySelector('#pg-mode-ai');
    var humModeBtn = el.querySelector('#pg-mode-human');
    if (aiModeBtn)  aiModeBtn.addEventListener('click',  function () { mode = 'vs-ai';    newGame(); });
    if (humModeBtn) humModeBtn.addEventListener('click', function () { mode = 'vs-human'; newGame(); });

    el.querySelectorAll('.pg-pit--clickable').forEach(function (pitEl) {
      pitEl.addEventListener('click', function () {
        onCupClick(parseInt(pitEl.dataset.cup, 10));
      });
    });
  }

  // ── Sowing ────────────────────────────────────────────────────────────
  function onCupClick(cup) {
    if (state.phase !== 'idle') return;
    var validPlayer = state.turn === PLAYER && cup >= 7  && state.cups[cup] > 0;
    var validAI     = state.turn === AI     && cup < 7   && state.cups[cup] > 0 && mode === 'vs-human';
    if (!validPlayer && !validAI) return;

    var label = (cup < 7 ? (cup + 1) : (cup - 6)); // 1-based label within row
    addLog(turnName() + ' picks cup ' + label + ' (' + state.cups[cup] + ' shells)');
    state.phase = 'sowing';
    render();
    setTimeout(function () { sow(cup); }, 60);
  }

  function sow(cupIdx) {
    if (state.cups[cupIdx] === 0) {
      var next = findNextNonEmpty(cupIdx);
      if (next === -1) { endTurn(); return; }
      sow(next);
      return;
    }

    var shells = state.cups[cupIdx];
    state.cups[cupIdx] = 0;
    var order = sowingOrder(cupIdx);
    var step  = 0;
    var lastCup      = cupIdx;
    var lastWasEmpty = false;

    function dropOne() {
      if (shells === 0) {
        state.sowingCup = -1;
        render();
        setTimeout(function () { resolveLastDrop(lastCup, lastWasEmpty); }, 140);
        return;
      }
      var target    = order[step % order.length];
      lastWasEmpty  = (state.cups[target] === 0);
      state.cups[target]++;
      shells--;
      step++;
      lastCup       = target;
      state.sowingCup = target;
      render();
      setTimeout(dropOne, SOW_MS);
    }

    dropOne();
  }

  function resolveLastDrop(lastCup, wasEmpty) {
    // ── Capture-on-4 ──────────────────────────────────────────────────
    if (state.cups[lastCup] === 4) {
      state.stores[state.turn] += 4;
      state.cups[lastCup] = 0;
      addLog(turnName() + ' captured 4! Store \u2192 ' + state.stores[state.turn]);
      render();
      setTimeout(function () {
        var next = findNextNonEmpty(lastCup);
        if (next === -1) { endTurn(); }
        else             { sow(next); }
      }, 340);
      return;
    }

    // ── Empty-cup landing ──────────────────────────────────────────────
    if (wasEmpty) {
      var opp = oppositeCup(lastCup);
      if (isOwnCup(lastCup) && state.cups[opp] > 0) {
        var grabbed = state.cups[opp];
        state.stores[state.turn] += grabbed;
        state.cups[opp] = 0;
        addLog(turnName() + ' captured ' + grabbed + ' from opposite!');
        render();
      } else {
        addLog(turnName() + ' landed in empty cup \u2014 no capture.');
        render();
      }
      setTimeout(endTurn, 500);
      return;
    }

    // ── Continue sowing (non-empty, not 4) ────────────────────────────
    setTimeout(function () { sow(lastCup); }, 220);
  }

  // ── Turn management ───────────────────────────────────────────────────
  function endTurn() {
    if (checkGameOver()) return;

    state.turn = 1 - state.turn;
    state.phase = 'idle';

    if (state.turn === AI && mode === 'vs-ai') {
      state.phase = 'ai-thinking';
      render();
      setTimeout(runAI, 700 + Math.random() * 400);
    } else {
      render();
    }
  }

  function checkGameOver() {
    var playerEmpty = true, aiEmpty = true;
    for (var i = 7; i < 14; i++) { if (state.cups[i] > 0) { playerEmpty = false; break; } }
    for (var i = 0; i < 7;  i++) { if (state.cups[i] > 0) { aiEmpty     = false; break; } }
    if (!playerEmpty && !aiEmpty) return false;

    // Sweep remaining shells to their owners
    for (var i = 0; i < 7;  i++) { state.stores[AI]     += state.cups[i]; state.cups[i] = 0; }
    for (var i = 7; i < 14; i++) { state.stores[PLAYER] += state.cups[i]; state.cups[i] = 0; }

    state.phase = 'over';
    var ps = state.stores[PLAYER], as = state.stores[AI];
    var pn = mode === 'vs-human' ? 'Player 1' : 'You';
    var an = mode === 'vs-human' ? 'Player 2' : 'AI';

    if (ps > as) {
      state.endMsg = '\uD83C\uDFC6 ' + pn + ' win' + (mode === 'vs-human' ? 's' : '') + '! ' + ps + ' \u2013 ' + as + ' shells.';
      addLog(pn + ' wins ' + ps + '\u2013' + as + '!');
    } else if (as > ps) {
      state.endMsg = '\uD83C\uDFC6 ' + an + ' wins! ' + as + ' \u2013 ' + ps + ' shells.';
      addLog(an + ' wins ' + as + '\u2013' + ps + '!');
    } else {
      state.endMsg = 'Draw \u2014 both have ' + ps + ' shells.';
      addLog('Draw! ' + ps + '\u2013' + as);
    }

    render();
    return true;
  }

  // ── AI ────────────────────────────────────────────────────────────────
  function runAI() {
    if (state.phase !== 'ai-thinking') return;
    var cup = aiChooseMove();
    if (cup === -1) { endTurn(); return; }

    // Briefly show which cup the AI picked
    state.phase         = 'ai-selecting';
    state.aiSelectingCup = cup;
    render();

    setTimeout(function () {
      state.aiSelectingCup = -1;
      var label = cup + 1;
      addLog('AI picks cup ' + label + ' (' + state.cups[cup] + ' shells)');
      state.phase = 'sowing';
      sow(cup);
    }, 900);
  }

  function aiChooseMove() {
    var candidates = [];
    for (var i = 0; i < 7; i++) { if (state.cups[i] > 0) candidates.push(i); }
    if (!candidates.length) return -1;

    var best = candidates[0], bestScore = -Infinity;
    for (var j = 0; j < candidates.length; j++) {
      var s = scoreAICup(candidates[j]);
      if (s > bestScore) { bestScore = s; best = candidates[j]; }
    }
    return best;
  }

  function scoreAICup(cup) {
    var shells = state.cups[cup];
    if (!shells) return -Infinity;

    var order   = sowingOrder(cup);
    var landIdx = (shells - 1) % order.length;
    var landCup = order[landIdx];
    var landAfter = state.cups[landCup] + 1;

    if (landAfter === 4)              return 200;            // capture 4
    if (state.cups[landCup] === 0 && landCup < 7) {         // own empty cup
      var opp = oppositeCup(landCup);
      if (state.cups[opp] > 0)       return 100 + state.cups[opp]; // cross-capture
    }
    if (state.cups[landCup] > 0)     return 10 + shells;    // continue sowing
    return shells;
  }

  // ── Init ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () { newGame(); });
}());
