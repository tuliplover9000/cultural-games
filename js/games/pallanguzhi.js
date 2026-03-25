/* ─────────────────────────────────────────────────────────────────────────
   Pallanguzhi - South Indian Mancala
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

  // CCW cycle: player row L→R, then AI row R→L
  var CYCLE = [7, 8, 9, 10, 11, 12, 13, 6, 5, 4, 3, 2, 1, 0];

  // Golden angle for sunflower spiral shell placement
  var GOLDEN_ANGLE = 2.399963;

  // ── Module-level vars ─────────────────────────────────────────────────
  var mode        = 'vs-ai';   // 'vs-ai' | 'vs-human'
  var vsRoom     = false;
  var myRoomSeat = 0;
  var state       = {};
  var skipSowing  = false;
  var skipResolve = null;

  // ── Name helpers ──────────────────────────────────────────────────────
  function p1Name()   { return 'Player 1'; }
  function p2Name()   { return mode === 'vs-human' ? 'Player 2' : 'AI'; }
  function turnName() { return state.turn === PLAYER ? p1Name() : p2Name(); }

  // ── Log ───────────────────────────────────────────────────────────────
  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 14) state.log.length = 14;
  }

  // ── New game ──────────────────────────────────────────────────────────
  function newGame() {
    skipSowing  = false;
    skipResolve = null;
    var cups = [];
    for (var i = 0; i < TOTAL_CUPS; i++) cups.push(SHELLS_PER);

    state = {
      phase:          'idle',   // idle | sowing | ai-thinking | ai-selecting | over
      turn:           PLAYER,
      cups:           cups,
      stores:         { 0: 0, 1: 0 },
      sowingCup:      -1,
      aiSelectingCup: -1,
      log:            [],
    };
    render();
  }

  // ── Board helpers ─────────────────────────────────────────────────────
  function oppositeCup(cup) { return cup < 7 ? cup + 7 : cup - 7; }
  function isOwnCup(cup)    { return state.turn === PLAYER ? cup >= 7 : cup < 7; }

  function sowingOrder(startCup) {
    var idx = CYCLE.indexOf(startCup);
    var result = [];
    for (var i = 1; i <= TOTAL_CUPS; i++) {
      result.push(CYCLE[(idx + i) % TOTAL_CUPS]);
    }
    return result;
  }

  function findNextNonEmpty(fromCup) {
    var order = sowingOrder(fromCup);
    for (var i = 0; i < order.length; i++) {
      if (state.cups[order[i]] > 0) return order[i];
    }
    return -1;
  }

  // ── Animation helpers ─────────────────────────────────────────────────
  function sleep(ms) {
    if (skipSowing) return Promise.resolve();
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function requestSkip() {
    skipSowing = true;
    if (skipResolve) { skipResolve(); skipResolve = null; }
  }

  async function animatePickup(cup) {
    if (skipSowing) return;
    var el = document.querySelector('[data-cup="' + cup + '"]');
    if (!el) return;
    var skip = new Promise(function (res) { skipResolve = res; });
    var anim = el.animate([
      { transform: 'scale(1)',    boxShadow: '0 0 0 0px rgba(232,160,0,0)',    filter: 'brightness(1)'    },
      { transform: 'scale(1.2)', boxShadow: '0 0 0 10px rgba(232,160,0,0.45)', filter: 'brightness(1.7)' },
      { transform: 'scale(0.9)', boxShadow: '0 0 0 0px rgba(232,160,0,0)',    filter: 'brightness(0.8)'  },
      { transform: 'scale(1)',   boxShadow: '0 0 0 0px rgba(232,160,0,0)',    filter: 'brightness(1)'    },
    ], { duration: 360, easing: 'ease-out' });
    await Promise.race([anim.finished, skip]);
    anim.cancel();
  }

  function setClusterContent(cluster, count) {
    if (count <= 0) { cluster.innerHTML = ''; return; }
    var show = Math.min(count, 8);
    var r = show === 1 ? 0 : 4 + show * 1.6;
    var html = '';
    for (var i = 0; i < show; i++) {
      var angle = (2 * Math.PI * i / show) - Math.PI / 2;
      var x = show === 1 ? 0 : parseFloat((r * Math.cos(angle)).toFixed(1));
      var y = show === 1 ? 0 : parseFloat((r * Math.sin(angle)).toFixed(1));
      html += '<span class="pg-cluster-shell" style="--x:' + x + 'px;--y:' + y + 'px"></span>';
    }
    cluster.innerHTML = html;
  }

  async function flyClusterTo(cluster, curX, curY, toCup, duration) {
    var toEl = document.querySelector('[data-cup="' + toCup + '"]');
    if (!toEl) return { x: curX, y: curY };
    var tr      = toEl.getBoundingClientRect();
    var targetX = tr.left + tr.width  / 2;
    var targetY = tr.top  + tr.height / 2;

    if (!skipSowing) {
      var dx   = targetX - curX;
      var dy   = targetY - curY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var arc  = Math.min(Math.max(28, dist * 0.45), 90);

      var skip = new Promise(function (res) { skipResolve = res; });
      var anim = cluster.animate([
        { transform: 'translate(-50%,-50%) scale(1.05)' },
        { transform: 'translate(calc(-50% + ' + (dx * 0.5) + 'px), calc(-50% + ' + (dy * 0.5 - arc) + 'px)) scale(1.18)',
          offset: 0.4 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(1)' },
      ], { duration: duration, easing: 'ease-in-out', fill: 'both' });
      await Promise.race([anim.finished, skip]);
      anim.cancel();
    }

    cluster.style.left = targetX + 'px';
    cluster.style.top  = targetY + 'px';
    return { x: targetX, y: targetY };
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
    var isIdle  = state.phase === 'idle';

    var clickablePlayer = [];
    var clickableAI     = [];
    if (isIdle && state.turn === PLAYER && (!vsRoom || myRoomSeat === PLAYER)) {
      for (var i = 7; i < 14; i++) { if (state.cups[i] > 0) clickablePlayer.push(i); }
    }
    if (isIdle && state.turn === AI && vsHuman && (!vsRoom || myRoomSeat === AI)) {
      for (var j = 0; j < 7; j++) { if (state.cups[j] > 0) clickableAI.push(j); }
    }

    // Status message
    var statusMsg;
    if (state.phase === 'ai-thinking') {
      statusMsg = opp + ' is thinking <span class="pg-dots"><span></span><span></span><span></span></span>';
    } else if (state.phase === 'ai-selecting') {
      statusMsg = opp + ' chose a cup\u2026';
    } else if (state.phase === 'sowing') {
      statusMsg = vsHuman
        ? (state.turn === PLAYER ? 'Player 1' : 'Player 2') + ' sowing\u2026'
        : (state.turn === PLAYER ? 'Sowing\u2026' : opp + ' sowing\u2026');
    } else if (state.phase === 'over') {
      statusMsg = state.endMsg || 'Game over.';
    } else {
      statusMsg = vsHuman
        ? (state.turn === PLAYER ? 'Player 1 \u2014 click a highlighted cup' : 'Player 2 \u2014 click a highlighted cup')
        : 'Your turn \u2014 click a highlighted cup to sow';
    }

    // Board rows - flip for seat 1 so each player sees their cups at the bottom
    var flip = vsRoom && myRoomSeat === 1;
    var aiRow = '';
    var aiOrder = flip ? [6,5,4,3,2,1,0] : [0,1,2,3,4,5,6];
    for (var ai = 0; ai < 7; ai++) {
      var a = aiOrder[ai];
      aiRow += pitHTML(a, clickableAI.indexOf(a) !== -1, state.sowingCup === a, state.aiSelectingCup === a);
    }
    var playerRow = '';
    var plOrder = flip ? [13,12,11,10,9,8,7] : [7,8,9,10,11,12,13];
    for (var pi = 0; pi < 7; pi++) {
      var p = plOrder[pi];
      playerRow += pitHTML(p, clickablePlayer.indexOf(p) !== -1, state.sowingCup === p, false);
    }

    // Log
    var logHtml = '';
    if (state.log.length) {
      var items = state.log.map(function (m) { return '<li>' + m + '</li>'; }).join('');
      logHtml = '<div class="pg-log"><ul>' + items + '</ul></div>';
    }

    // Controls
    var skipBtn = (state.phase === 'sowing')
      ? '<button class="pg-btn pg-btn--skip" id="pg-skip">Skip</button>' : '';
    var controls = '<div class="pg-actions">'
      + (!vsRoom
        ? '<div class="pg-mode">'
          + '<span class="pg-mode-label">Mode:</span>'
          + '<button class="pg-diff-btn' + (mode === 'vs-ai'    ? ' active' : '') + '" id="pg-mode-ai">vs AI</button>'
          + '<button class="pg-diff-btn' + (mode === 'vs-human' ? ' active' : '') + '" id="pg-mode-human">vs Player</button>'
          + '</div>'
        : '')
      + '<div class="pg-btn-row">'
      + skipBtn
      + (!vsRoom ? '<button class="pg-btn" id="pg-new">New Game</button>' : '')
      + '</div>'
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
          + '<div class="pg-row-label pg-row-label--ai">' + (flip ? you : opp) + '\u2019s cups</div>'
          + '<div class="pg-row pg-row--ai">' + (flip ? playerRow : aiRow) + '</div>'
          + '<div class="pg-divider"></div>'
          + '<div class="pg-row pg-row--player">' + (flip ? aiRow : playerRow) + '</div>'
          + '<div class="pg-row-label pg-row-label--player">' + (flip ? opp : you) + '\u2019s cups</div>'
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

  // Deterministic rotation for visual variety
  function shellRot(cup, i) {
    var h = ((cup + 1) * 31 + i * 79 + (cup + 1) * (i + 1) * 13) % 140;
    return h - 70;
  }

  // Golden-angle sunflower spiral (matches OAQ visual)
  function spiralShells(count, cup, lit) {
    var show = Math.min(count, 14);
    if (!show) return '';
    var maxR = show === 1 ? 0 : 5 + show * 1.1;
    var html = '';
    for (var i = 0; i < show; i++) {
      var r   = show === 1 ? 0 : Math.sqrt((i + 0.5) / show) * maxR;
      var ang = i * GOLDEN_ANGLE;
      var x   = show === 1 ? 0 : parseFloat((r * Math.cos(ang)).toFixed(1));
      var y   = show === 1 ? 0 : parseFloat((r * Math.sin(ang)).toFixed(1));
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
      + '<div class="pg-pit__shells">' + spiralShells(count, cup, lit) + '</div>'
      + '<div class="pg-pit__count">' + count + '</div>'
      + '</div>';
  }

  // ── Event wiring ──────────────────────────────────────────────────────
  function wireEvents(el) {
    var newBtn = el.querySelector('#pg-new');
    if (newBtn) newBtn.addEventListener('click', newGame);

    var skipBtn = el.querySelector('#pg-skip');
    if (skipBtn) skipBtn.addEventListener('click', requestSkip);

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

  // ── Sowing (async, skippable) ─────────────────────────────────────────
  async function onCupClick(cup) {
    if (vsRoom && state.turn !== myRoomSeat) return;
    if (state.phase !== 'idle') return;
    var validPlayer = state.turn === PLAYER && cup >= 7  && state.cups[cup] > 0;
    var validAI     = state.turn === AI     && cup < 7   && state.cups[cup] > 0 && mode === 'vs-human';
    if (!validPlayer && !validAI) return;

    var label = cup < 7 ? (cup + 1) : (cup - 6);
    addLog(turnName() + ' picks cup ' + label + ' (' + state.cups[cup] + ' shells)');
    state.phase = 'sowing';
    skipSowing  = false;
    skipResolve = null;
    render();

    await sow(cup);
  }

  async function sow(cupIdx) {
    var shells = state.cups[cupIdx];

    await animatePickup(cupIdx);
    state.cups[cupIdx] = 0;
    state.sowingCup = -1;
    render();

    // Spawn flying cluster at source pit
    var srcEl   = document.querySelector('[data-cup="' + cupIdx + '"]');
    var srcRect = srcEl
      ? srcEl.getBoundingClientRect()
      : { left: 0, top: 0, width: 70, height: 70 };
    var curX = srcRect.left + srcRect.width  / 2;
    var curY = srcRect.top  + srcRect.height / 2;

    var cluster = document.createElement('div');
    cluster.className = 'pg-fly-cluster';
    cluster.style.cssText = 'position:fixed;left:' + curX + 'px;top:' + curY + 'px;'
      + 'transform:translate(-50%,-50%);pointer-events:none;z-index:9999;';
    setClusterContent(cluster, shells);
    document.body.appendChild(cluster);

    var order        = sowingOrder(cupIdx);
    var step         = 0;
    var lastCup      = cupIdx;
    var lastWasEmpty = false;

    while (shells > 0) {
      var target   = order[step % order.length];
      lastWasEmpty = (state.cups[target] === 0);

      var pos = await flyClusterTo(cluster, curX, curY, target, 500);
      curX = pos.x;
      curY = pos.y;

      state.cups[target]++;
      shells--;
      step++;
      lastCup         = target;
      state.sowingCup = target;
      render();
      setClusterContent(cluster, shells);

      if (shells > 0) await sleep(65);
    }

    cluster.remove();
    state.sowingCup = -1;
    render();

    await sleep(160);
    await resolveLastDrop(lastCup, lastWasEmpty);
  }

  async function resolveLastDrop(lastCup, wasEmpty) {
    // ── Capture-on-4 ──────────────────────────────────────────────────
    if (state.cups[lastCup] === 4) {
      state.stores[state.turn] += 4;
      state.cups[lastCup] = 0;
      addLog(turnName() + ' captured 4! Store \u2192 ' + state.stores[state.turn]);
      render();
      await sleep(340);
      var next = findNextNonEmpty(lastCup);
      if (next === -1) { await endTurn(); }
      else             { await sow(next); }
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
        addLog(turnName() + ' landed empty \u2014 no capture.');
        render();
      }
      await sleep(500);
      await endTurn();
      return;
    }

    // ── Continue sowing (non-empty, not 4) ────────────────────────────
    await sleep(200);
    await sow(lastCup);
  }

  // ── Turn management ───────────────────────────────────────────────────
  async function endTurn() {
    if (checkGameOver()) return;

    state.turn  = 1 - state.turn;
    state.phase = 'idle';

    if (state.turn === AI && mode === 'vs-ai') {
      state.phase = 'ai-thinking';
      render();
      // Always show "AI is thinking" for at least 350ms even if skip was pressed
      await new Promise(function (r) { setTimeout(r, 350); });
      // Rest of the thinking delay respects skip
      await sleep(350 + Math.random() * 300);
      await runAI();
    } else {
      // Reset skip when control returns to the player
      skipSowing  = false;
      skipResolve = null;
      render();
    }
    if (vsRoom && window.RoomBridge) {
      RoomBridge.sendState(Object.assign({}, state, {
        cups:   state.cups.slice(),
        last_actor: 'room:' + myRoomSeat,
      }));
      if (state.phase === 'over') {
        RoomBridge.reportWin(state.stores[PLAYER] >= state.stores[AI] ? 0 : 1);
      }
    }
  }

  function checkGameOver() {
    var playerEmpty = true, aiEmpty = true;
    for (var i = 7; i < 14; i++) { if (state.cups[i] > 0) { playerEmpty = false; break; } }
    for (var j = 0; j < 7;  j++) { if (state.cups[j] > 0) { aiEmpty     = false; break; } }
    if (!playerEmpty && !aiEmpty) return false;

    for (var a = 0; a < 7;  a++) { state.stores[AI]     += state.cups[a]; state.cups[a] = 0; }
    for (var b = 7; b < 14; b++) { state.stores[PLAYER] += state.cups[b]; state.cups[b] = 0; }

    state.phase = 'over';
    if (window.Auth && Auth.isLoggedIn()) {
      var _ps = state.stores[PLAYER], _as = state.stores[AI];
      Auth.recordResult('pallanguzhi', _ps > _as ? 'win' : _as > _ps ? 'loss' : 'draw');
    }
    var ps = state.stores[PLAYER], as = state.stores[AI];
    var pn = mode === 'vs-human' ? 'Player 1' : 'You';
    var an = mode === 'vs-human' ? 'Player 2' : 'AI';

    if (ps > as) {
      state.endMsg = '\uD83C\uDFC6 ' + pn + (mode === 'vs-human' ? ' wins' : ' win') + '! ' + ps + ' \u2013 ' + as;
      addLog(pn + ' wins ' + ps + '\u2013' + as + '!');
    } else if (as > ps) {
      state.endMsg = '\uD83C\uDFC6 ' + an + ' wins! ' + as + ' \u2013 ' + ps;
      addLog(an + ' wins ' + as + '\u2013' + ps + '!');
    } else {
      state.endMsg = 'Draw \u2014 both have ' + ps + ' shells.';
      addLog('Draw! ' + ps + '\u2013' + as);
    }
    render();
    return true;
  }

  // ── AI ────────────────────────────────────────────────────────────────
  async function runAI() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.phase !== 'ai-thinking') return;
    var cup = aiChooseMove();
    if (cup === -1) { await endTurn(); return; }

    state.phase          = 'ai-selecting';
    state.aiSelectingCup = cup;
    render();

    await sleep(900);
    state.aiSelectingCup = -1;
    addLog('AI picks cup ' + (cup + 1) + ' (' + state.cups[cup] + ' shells)');
    state.phase = 'sowing';
    // Don't reset skipSowing here - let it cascade so one skip gets player to their turn
    render();

    await sow(cup);
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

    var order    = sowingOrder(cup);
    var landIdx  = (shells - 1) % order.length;
    var landCup  = order[landIdx];
    var landAfter = state.cups[landCup] + 1;

    if (landAfter === 4)             return 200;
    if (state.cups[landCup] === 0 && landCup < 7) {
      var opp = oppositeCup(landCup);
      if (state.cups[opp] > 0)       return 100 + state.cups[opp];
    }
    if (state.cups[landCup] > 0)     return 10 + shells;
    return shells;
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + myRoomSeat) return;
    Object.assign(state, data);
    if (Array.isArray(data.cups)) state.cups = data.cups.slice();
    render();
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive()) return;
    vsRoom     = true;
    myRoomSeat = RoomBridge.getSeat();
    mode       = 'vs-human';
    RoomBridge.onState(receiveRoomState);
    if (myRoomSeat === 0) {
      RoomBridge.sendState(Object.assign({}, state, { cups: state.cups.slice(), last_actor: 'room:0' }));
    }
    render(); // re-render now that vsRoom=true so mode selector is hidden
  }

  // ── Init ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () { newGame(); initRoomMode(); });

  // ── Tutorial ────────────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('pallanguzhi', [
      {
        target: '#game-container',
        title: 'The Board',
        body: 'Pallanguzhi is a South Indian mancala played on 2 rows of 7 cups. Each cup starts with 6 shells.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#game-container',
        title: 'Sowing Shells',
        body: 'Click one of your cups to pick up all its shells and distribute them one-by-one clockwise. Your side is the row closest to you.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#game-container',
        title: 'Capturing',
        body: 'When your last shell lands in a cup, skip over the next cup. If the cup after that has shells, capture them - then keep going.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#game-container',
        title: 'Your Store',
        body: 'Captured shells go into your store on the right. The player with the most shells in their store at the end wins.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#pg-mode-ai',
        title: 'Play vs AI',
        body: 'Switch to AI mode to play against the computer.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#pg-new',
        title: 'New Game',
        body: 'Reset the board and start a fresh game.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('pallanguzhi');
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

  // DOM-based game - re-render to let CSS fill the new available space
  window.GameResize = function (availW, availH) {
    if (typeof render === 'function') render();
  };

}());
