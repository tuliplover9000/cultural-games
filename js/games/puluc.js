/* ─────────────────────────────────────────────────────────────────────────
   Puluc — Maya / Mesoamerica
   js/games/puluc.js  |  CSS prefix: pu-

   Rules (Brewster/Acosta version):
   - 11-space linear track; Player moves L→R (exits ≥11), AI moves R→L (exits <0)
   - 5 pieces each, all start off-board
   - 4 stick dice: count marked sides; all-0 or all-4 → move 4
   - Landing on enemy: capture it (prisoner under your piece, moves with you)
   - When captured: your prisoners are freed to their owner's entry pool
   - When exiting: your prisoners freed back to opponent's entry pool
   - Win: first to move all 5 pieces off the far end
───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────
  var TRACK_LEN      = 11;   // spaces 0–10; player exits when pos ≥ 11, AI when pos < 0
  var PLAYER         = 0;
  var AI             = 1;
  var PIECES         = 5;
  var ALL_MARKED_VAL = 4;    // all-0 or all-4 sticks both count as 4 moves

  // ── Module-level vars ─────────────────────────────────────────────────
  var mode  = 'vs-ai';       // 'vs-ai' | 'vs-human'
  var vsRoom     = false;
  var myRoomSeat = 0;
  var state = {};

  // ── DOM refs ──────────────────────────────────────────────────────────
  var elTrack, elDiceRow, elRollBtn, elStatus, elScore, elLog;

  // ── Name helpers ──────────────────────────────────────────────────────
  function p1Name()     { return 'Player 1'; }
  function p2Name()     { return mode === 'vs-human' ? 'Player 2' : 'AI'; }
  function playerName(p){ return p === PLAYER ? p1Name() : p2Name(); }

  // ── Status / log ──────────────────────────────────────────────────────
  function setStatus(msg) { elStatus.innerHTML = msg; }

  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 20) state.log.pop();
    elLog.innerHTML = state.log
      .map(function (m) { return '<li>' + m + '</li>'; })
      .join('');
  }

  function thinking() {
    return '<span class="pu-thinking"><span></span><span></span><span></span></span>';
  }

  // ── New game ──────────────────────────────────────────────────────────
  function newGame() {
    // stacks start empty — pieces enter one at a time via entry moves
    state = {
      phase:       'idle',   // idle | choosingMove | moving | ai-thinking | over
      turn:        PLAYER,
      roll:        0,
      stickDetail: [],
      stacks:      { 0: [], 1: [] },
      offBoard:    { 0: PIECES, 1: PIECES },
      captured:    { 0: 0,      1: 0      },
      _validMoves: null,
      log:         [],
    };
    render();
    elRollBtn.disabled = false;
    setStatus(p1Name() + ' — roll the sticks!');
  }

  // ── Dice ──────────────────────────────────────────────────────────────
  function rollSticks() {
    var detail = [], marked = 0;
    for (var i = 0; i < 4; i++) {
      var m = Math.random() < 0.5;
      detail.push(m);
      if (m) marked++;
    }
    var value = (marked === 0 || marked === ALL_MARKED_VAL) ? ALL_MARKED_VAL : marked;
    state.roll        = value;
    state.stickDetail = detail;
    return value;
  }

  // ── Move validation ───────────────────────────────────────────────────
  function ownAt(who, pos) {
    var stacks = state.stacks[who];
    for (var i = 0; i < stacks.length; i++) {
      if (stacks[i].pos === pos) return true;
    }
    return false;
  }

  // Returns array of move objects for `who` with `roll`
  // Move: { type:'enter'|'move'|'exit', stackIdx, from, to }
  // For 'enter': stackIdx = -1 (no existing stack), from = null
  function getValidMoves(who, roll) {
    var moves  = [];
    var stacks = state.stacks[who];

    // Entry move — place a new piece from off-board
    if (state.offBoard[who] > 0) {
      var entryPos = (who === PLAYER) ? (roll - 1) : (TRACK_LEN - roll);
      if (!ownAt(who, entryPos)) {
        moves.push({ type: 'enter', stackIdx: -1, from: null, to: entryPos });
      }
    }

    // Movement of on-board pieces
    for (var j = 0; j < stacks.length; j++) {
      var stack = stacks[j];
      if (stack.pos === null) continue;   // still off-board

      var dest;
      if (who === PLAYER) {
        dest = stack.pos + roll;
        if (dest >= TRACK_LEN) {
          moves.push({ type: 'exit', stackIdx: j, from: stack.pos, to: dest });
          continue;
        }
      } else {
        dest = stack.pos - roll;
        if (dest < 0) {
          moves.push({ type: 'exit', stackIdx: j, from: stack.pos, to: dest });
          continue;
        }
      }

      if (ownAt(who, dest)) continue;   // can't stack own pieces
      moves.push({ type: 'move', stackIdx: j, from: stack.pos, to: dest });
    }

    return moves;
  }

  // ── Resolve landing: capture enemy at same position ───────────────────
  function resolveLanding(who, stackIdx) {
    var myStack   = state.stacks[who][stackIdx];
    var foe       = 1 - who;
    var foeStacks = state.stacks[foe];

    for (var i = foeStacks.length - 1; i >= 0; i--) {
      if (foeStacks[i].pos === myStack.pos) {
        var foeStack = foeStacks[i];
        // Free the enemy's prisoners (they are own pieces held captive)
        state.offBoard[who] += foeStack.prisoners;
        // Capture the enemy's lead piece
        myStack.prisoners++;
        // Remove enemy stack from board
        foeStacks.splice(i, 1);
        addLog(playerName(who) + ' captures ' + playerName(foe) + '\'s piece!');
        return;
      }
    }
  }

  // ── Animate + resolve a single move ───────────────────────────────────
  // Handles enter, move, and exit all in one function.
  // For enter moves, call with stackIdx = the newly pushed stack index.
  function animateMove(who, stackIdx, to, callback) {
    var stack = state.stacks[who][stackIdx];
    var step  = (who === PLAYER) ? 1 : -1;
    var foe   = 1 - who;

    function doStep() {
      if (stack.pos === null) {
        // First step: piece enters the board from its side
        stack.pos = (who === PLAYER) ? 0 : (TRACK_LEN - 1);
      } else {
        stack.pos += step;
      }

      // Check for exit
      var exited = (who === PLAYER) ? (stack.pos >= TRACK_LEN) : (stack.pos < 0);
      if (exited) {
        state.offBoard[foe] += stack.prisoners;   // release prisoners back to foe
        state.stacks[who].splice(stackIdx, 1);
        state.captured[who]++;
        addLog(playerName(who) + ' exits a piece! (' + state.captured[who] + '/' + PIECES + ')');
        render();
        callback();
        return;
      }

      render();

      // Check if reached destination
      if (stack.pos === to) {
        resolveLanding(who, stackIdx);
        render();
        callback();
        return;
      }

      setTimeout(doStep, 130);
    }

    doStep();
  }

  // ── Execute a move ────────────────────────────────────────────────────
  function executeMove(who, move, callback) {
    if (move.type === 'enter') {
      state.offBoard[who]--;
      state.stacks[who].push({ pos: null, prisoners: 0 });
      var newIdx = state.stacks[who].length - 1;
      animateMove(who, newIdx, move.to, callback);
      return;
    }
    // 'move' and 'exit' both handled by animateMove
    animateMove(who, move.stackIdx, move.to, callback);
  }

  // ── Game over ─────────────────────────────────────────────────────────
  function checkGameOver() {
    if (state.captured[PLAYER] >= PIECES) { gameOver(PLAYER); return true; }
    if (state.captured[AI]     >= PIECES) { gameOver(AI);     return true; }
    return false;
  }

  function gameOver(winner) {
    state.phase = 'over';
    if (window.Auth && Auth.isLoggedIn())
      Auth.recordResult('puluc', winner === PLAYER ? 'win' : 'loss');
    elRollBtn.disabled = true;
    setStatus('🎉 ' + playerName(winner) + ' wins! All ' + PIECES + ' pieces escaped.');
    addLog('─── ' + playerName(winner) + ' wins! ───');
    renderScore();
    render();
    if (vsRoom) syncRoomState();
  }

  // ── End turn ──────────────────────────────────────────────────────────
  function endTurn(who) {
    if (checkGameOver()) return;

    var next = 1 - who;
    state.turn        = next;
    state.roll        = 0;
    state.stickDetail = [];
    state.phase       = 'idle';
    state._validMoves = null;
    if (vsRoom) syncRoomState();

    if (next === AI && mode === 'vs-ai') {
      elRollBtn.disabled = true;
      setStatus(thinking() + ' AI is thinking…');
      render();
      setTimeout(aiTurn, 700 + Math.random() * 200);
    } else {
      elRollBtn.disabled = false;
      var msg = mode === 'vs-human'
        ? playerName(next) + ' — roll the sticks!'
        : 'Your turn — roll the sticks!';
      setStatus(msg);
      render();
    }
  }

  // ── AI logic ──────────────────────────────────────────────────────────
  function aiTurn() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.phase === 'over') return;

    state.phase = 'moving';
    var roll  = rollSticks();
    renderDice();
    addLog(p2Name() + ' rolls ' + roll);

    var moves = getValidMoves(AI, roll);
    if (moves.length === 0) {
      addLog(p2Name() + ' has no valid moves.');
      endTurn(AI);
      return;
    }

    var playerPos = {};
    state.stacks[PLAYER].forEach(function (s) { if (s.pos !== null) playerPos[s.pos] = true; });

    var chosen = null;

    // 1. Exit move (win progress)
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].type === 'exit') { chosen = moves[i]; break; }
    }

    // 2. Capture move
    if (!chosen) {
      for (var j = 0; j < moves.length; j++) {
        if (playerPos[moves[j].to]) { chosen = moves[j]; break; }
      }
    }

    // 3. Enter safely (target not within player's next-turn reach)
    if (!chosen) {
      var playerReach = {};
      state.stacks[PLAYER].forEach(function (s) {
        if (s.pos !== null) {
          for (var k = 1; k <= 4; k++) playerReach[s.pos + k] = true;
        }
      });
      for (var l = 0; l < moves.length; l++) {
        if (moves[l].type === 'enter' && !playerReach[moves[l].to]) {
          chosen = moves[l]; break;
        }
      }
    }

    // 4. Advance piece closest to exit (lowest pos for AI = furthest right = most progress)
    if (!chosen) {
      var best = null, bestPos = Infinity;
      for (var m = 0; m < moves.length; m++) {
        var mv = moves[m];
        if (mv.type === 'exit' || mv.type === 'move') {
          var stackPos = state.stacks[AI][mv.stackIdx] ? state.stacks[AI][mv.stackIdx].pos : Infinity;
          if (stackPos !== null && stackPos < bestPos) { bestPos = stackPos; best = mv; }
        }
      }
      if (best) chosen = best;
    }

    // Fallback
    if (!chosen) chosen = moves[0];

    setTimeout(function () {
      executeMove(AI, chosen, function () { endTurn(AI); });
    }, 300);
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  function renderDice() {
    if (!state.stickDetail.length) { elDiceRow.innerHTML = ''; return; }
    var stickHtml = state.stickDetail.map(function (m) {
      return '<div class="pu-stick' + (m ? ' pu-stick--marked' : '') + '" aria-hidden="true"></div>';
    }).join('');
    elDiceRow.innerHTML =
      '<div class="pu-sticks">' + stickHtml + '</div>' +
      '<div class="pu-roll-total">Roll: <strong>' + state.roll + '</strong></div>';
  }

  function renderTrack() {
    var curTurn  = state.turn;
    var validMvs = state._validMoves || [];
    var hasEnter = false;
    var selectIdx = {};

    validMvs.forEach(function (mv) {
      if (mv.type === 'enter') { hasEnter = true; }
      else                     { selectIdx[mv.stackIdx] = true; }
    });

    // ── Board strip (11 spaces, full width) ───────────────────────────
    var boardHtml = '<div class="pu-board">';
    for (var s = 0; s < TRACK_LEN; s++) {
      var piecesHtml = '';

      // AI pieces — prisoners first (bottom), then lead piece (top)
      state.stacks[AI].forEach(function (stack, idx) {
        if (stack.pos !== s) return;
        for (var pr = 0; pr < stack.prisoners; pr++) {
          piecesHtml += '<div class="pu-piece pu-piece--player pu-piece--prisoner"></div>';
        }
        var sel = state.phase === 'choosingMove' && curTurn === AI && selectIdx[idx] && (!vsRoom || state.turn === myRoomSeat);
        piecesHtml +=
          '<div class="pu-piece pu-piece--ai' + (sel ? ' pu-piece--selectable' : '') +
          '" data-who="1" data-stack-idx="' + idx + '"></div>';
      });

      // Player pieces — prisoners first (bottom), then lead piece (top)
      state.stacks[PLAYER].forEach(function (stack, idx) {
        if (stack.pos !== s) return;
        for (var pr = 0; pr < stack.prisoners; pr++) {
          piecesHtml += '<div class="pu-piece pu-piece--ai pu-piece--prisoner"></div>';
        }
        var sel = state.phase === 'choosingMove' && curTurn === PLAYER && selectIdx[idx] && (!vsRoom || state.turn === myRoomSeat);
        piecesHtml +=
          '<div class="pu-piece pu-piece--player' + (sel ? ' pu-piece--selectable' : '') +
          '" data-who="0" data-stack-idx="' + idx + '"></div>';
      });

      boardHtml +=
        '<div class="pu-space" data-pos="' + s + '">' +
        piecesHtml +
        '<span class="pu-space__num">' + (s + 1) + '</span>' +
        '</div>';
    }
    boardHtml += '</div>';

    // ── Entry zones row (below board) ─────────────────────────────────
    var myTurn          = !vsRoom || state.turn === myRoomSeat;
    var playerEnterable = state.phase === 'choosingMove' && curTurn === PLAYER && hasEnter && myTurn;
    var aiEnterable     = state.phase === 'choosingMove' && curTurn === AI     && hasEnter && myTurn;
    var p2Label         = mode === 'vs-human' ? 'P2' : 'AI';

    function pieceDots(who, waiting, scored) {
      var html = '';
      for (var i = 0; i < waiting; i++) {
        html += '<div class="pu-piece pu-piece--' + (who === PLAYER ? 'player' : 'ai') + ' pu-piece--waiting"></div>';
      }
      for (var j = 0; j < scored; j++) {
        html += '<div class="pu-piece pu-piece--' + (who === PLAYER ? 'player' : 'ai') + ' pu-piece--scored"></div>';
      }
      return html;
    }

    var playerZone =
      '<div class="pu-offboard pu-offboard--player' + (playerEnterable ? ' pu-offboard--selectable' : '') + '">' +
      '<div class="pu-offboard__head"><span class="pu-offboard__name">P1</span><span class="pu-offboard__dir">→→→</span></div>' +
      '<div class="pu-offboard__pieces">' + pieceDots(PLAYER, state.offBoard[PLAYER], state.captured[PLAYER]) + '</div>' +
      '</div>';

    var aiZone =
      '<div class="pu-offboard pu-offboard--ai' + (aiEnterable ? ' pu-offboard--selectable' : '') + '">' +
      '<div class="pu-offboard__head"><span class="pu-offboard__dir">←←←</span><span class="pu-offboard__name">' + p2Label + '</span></div>' +
      '<div class="pu-offboard__pieces">' + pieceDots(AI, state.offBoard[AI], state.captured[AI]) + '</div>' +
      '</div>';

    var entryRowHtml = '<div class="pu-entry-row">' + playerZone + aiZone + '</div>';

    elTrack.innerHTML = boardHtml + entryRowHtml;
  }

  function renderScore() {
    elScore.innerHTML =
      '<span>' + p1Name() + ': ' + state.captured[PLAYER] + '/' + PIECES + ' exited</span>' +
      '<span>' + p2Name() + ': ' + state.captured[AI]     + '/' + PIECES + ' exited</span>';
  }

  function render() {
    renderTrack();
    renderScore();
  }

  // ── Roll handler ──────────────────────────────────────────────────────
  function onRollClick() {
    if (vsRoom && state.turn !== myRoomSeat) return;
    if (mode === 'vs-ai' && state.turn !== PLAYER) return;
    if (state.phase !== 'idle') return;

    var curTurn = state.turn;
    var roll    = rollSticks();
    renderDice();
    addLog(playerName(curTurn) + ' rolls ' + roll);

    var moves = getValidMoves(curTurn, roll);
    if (moves.length === 0) {
      addLog(playerName(curTurn) + ' has no valid moves.');
      setStatus(playerName(curTurn) + ' has no valid moves — passing turn.');
      render();
      setTimeout(function () { endTurn(curTurn); }, 800);
      return;
    }

    state._validMoves = moves;
    state.phase       = 'choosingMove';
    elRollBtn.disabled = true;
    render();   // re-render with highlights

    // Auto-move if only one option
    if (moves.length === 1) {
      setStatus(playerName(curTurn) + ' rolled ' + roll + ' — moving automatically…');
      setTimeout(function () {
        state._validMoves = null;
        state.phase       = 'moving';
        executeMove(curTurn, moves[0], function () { endTurn(curTurn); });
      }, 350);
      return;
    }

    var hasEnter = moves.some(function (m) { return m.type === 'enter'; });
    var hint = hasEnter
      ? 'Click your entry zone or a highlighted piece.'
      : 'Click a highlighted piece to move.';
    setStatus(playerName(curTurn) + ' rolled ' + roll + ' — ' + hint);
  }

  // ── Track click handler ───────────────────────────────────────────────
  function onTrackClick(e) {
    if (vsRoom && state.turn !== myRoomSeat) return;
    if (state.phase !== 'choosingMove') return;
    var isHumanTurn = state.turn === PLAYER || mode === 'vs-human';
    if (!isHumanTurn) return;

    var curTurn = state.turn;
    var moves   = state._validMoves || [];
    var chosen  = null;

    // Click on a selectable piece
    var pieceEl = e.target.closest('.pu-piece--selectable');
    if (pieceEl) {
      var stackIdx = parseInt(pieceEl.dataset.stackIdx, 10);
      for (var i = 0; i < moves.length; i++) {
        if (moves[i].stackIdx === stackIdx) { chosen = moves[i]; break; }
      }
    }

    // Click on selectable off-board zone (enter new piece)
    if (!chosen) {
      var zoneEl = e.target.closest('.pu-offboard--selectable');
      if (zoneEl) {
        for (var j = 0; j < moves.length; j++) {
          if (moves[j].type === 'enter') { chosen = moves[j]; break; }
        }
      }
    }

    if (!chosen) return;

    state._validMoves = null;
    state.phase       = 'moving';
    render();

    executeMove(curTurn, chosen, function () { endTurn(curTurn); });
  }

  // ── Mode buttons ──────────────────────────────────────────────────────
  function updateModeButtons() {
    var aiBtn    = document.getElementById('pu-mode-ai');
    var humanBtn = document.getElementById('pu-mode-human');
    if (aiBtn)    aiBtn.classList.toggle('active',    mode === 'vs-ai');
    if (humanBtn) humanBtn.classList.toggle('active', mode === 'vs-human');
  }

  function syncRoomState() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      stacks:   [
        state.stacks[0].map(function(st){ return Object.assign({}, st); }),
        state.stacks[1].map(function(st){ return Object.assign({}, st); }),
      ],
      offBoard: [state.offBoard[0], state.offBoard[1]],
      captured: [state.captured[0], state.captured[1]],
      turn:     state.turn,
      phase:    state.phase,
      roll:     state.roll,
      log:      (state.log || []).slice(),
      last_actor: 'room:' + myRoomSeat,
    });
    if (state.phase === 'over') RoomBridge.reportWin(state.captured[PLAYER] >= PIECES ? 0 : 1);
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + myRoomSeat) return;
    Object.assign(state, data);
    if (data.stacks)   state.stacks   = { 0: data.stacks[0].map(function(st){ return Object.assign({}, st); }), 1: data.stacks[1].map(function(st){ return Object.assign({}, st); }) };
    if (data.offBoard) state.offBoard = { 0: data.offBoard[0], 1: data.offBoard[1] };
    if (data.captured) state.captured = { 0: data.captured[0], 1: data.captured[1] };
    state.animating = false;
    render();
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive()) return;
    vsRoom     = true;
    myRoomSeat = RoomBridge.getSeat();
    mode       = 'vs-human';
    RoomBridge.onState(receiveRoomState);
    if (myRoomSeat === 0) syncRoomState();
    // Hide non-room UI
    var newGameBtn = document.getElementById('pu-new-game-btn');
    if (newGameBtn) newGameBtn.style.display = 'none';
    var aiBtn    = document.getElementById('pu-mode-ai');
    var humanBtn = document.getElementById('pu-mode-human');
    if (aiBtn)    aiBtn.style.display    = 'none';
    if (humanBtn) humanBtn.style.display = 'none';
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    elTrack   = document.getElementById('pu-track');
    elDiceRow = document.getElementById('pu-dice-row');
    elRollBtn = document.getElementById('pu-roll-btn');
    elStatus  = document.getElementById('pu-status');
    elScore   = document.getElementById('pu-score');
    elLog     = document.getElementById('pu-log');

    if (!elTrack) return;

    document.getElementById('pu-new-game-btn').addEventListener('click', newGame);
    elRollBtn.addEventListener('click', onRollClick);
    elTrack.addEventListener('click', onTrackClick);

    var aiBtn    = document.getElementById('pu-mode-ai');
    var humanBtn = document.getElementById('pu-mode-human');
    if (aiBtn)    aiBtn.addEventListener('click',    function () { mode = 'vs-ai';    updateModeButtons(); newGame(); });
    if (humanBtn) humanBtn.addEventListener('click', function () { mode = 'vs-human'; updateModeButtons(); newGame(); });

    newGame();
    initRoomMode();
  }

  document.addEventListener('DOMContentLoaded', init);
}());

/* ── Tutorial ────────────────────────────────────────────────────────────── */
if (window.CGTutorial) {
  CGTutorial.register('puluc', [
    {
      target:   '#pu-track',
      title:    'The Puluc Track',
      body:     'This is the race track. Your pieces (dark) and the AI\'s pieces (light) battle up and down it. Capture opponent pieces by landing on them and escort them to your end.',
      position: 'bottom',
    },
    {
      target:   '#pu-roll-btn',
      title:    'Roll the Sticks',
      body:     'Click Roll to throw the corn-kernel dice. The result determines how many spaces your active piece moves this turn.',
      position: 'top',
    },
    {
      target:   '#pu-status',
      title:    'Game Status',
      body:     'Follow the action here — whose turn it is, roll results, captures, and who wins the round are all announced in this bar.',
      position: 'bottom',
    },
    {
      target:   '#pu-score',
      title:    'Score Tracker',
      body:     'Each time you escort captured prisoners off the track you gain a point. The first to the target score wins the match.',
      position: 'bottom',
    },
    {
      target:   '#pu-mode-ai',
      title:    'Switch Game Mode',
      body:     'Toggle between playing against the AI or a local two-player game.',
      position: 'bottom',
    },
    {
      target:   '#pu-new-game-btn',
      title:    'New Game',
      body:     'Reset the board and start a fresh match at any time.',
      position: 'bottom',
    },
  ]);
  CGTutorial.initTrigger('puluc');
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

// DOM-based game — re-render to let CSS fill the new available space
window.GameResize = function (availW, availH) {
  if (typeof render === 'function') render();
};
