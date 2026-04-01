/**
 * yut-nori.js — Yut Nori (윷놀이) game engine
 * Phase A scaffold: initialises without errors, renders placeholder board.
 *
 * Exposes: window.GameResize(availW, availH)
 * Prefix:  yn-
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════════
     CONSTANTS
  ════════════════════════════════════════════════════════════════════════ */

  var THROW_NAMES = {
    1: { name: 'Do',   ko: '도', moves: 1, extraThrow: false },
    2: { name: 'Gae',  ko: '개', moves: 2, extraThrow: false },
    3: { name: 'Geol', ko: '걸', moves: 3, extraThrow: false },
    4: { name: 'Yut',  ko: '윷', moves: 4, extraThrow: true  },
    5: { name: 'Mo',   ko: '모', moves: 5, extraThrow: true  },
  };

  /* ════════════════════════════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════════════════════════════ */

  var state = {
    mode: '2p',           // '2p' | '4p'
    phase: 'mode-select', // 'mode-select' | 'throw' | 'move' | 'gameover'
    currentTeam: 'a',
    pendingMoves: [],
    lastThrow: null,
    throwHistory: [],
    captureCount: { a: 0, b: 0 },
    winner: null,
    aiEnabled: true,
    // Pieces and board graph populated in Phases B & E
    pieces: {},
    padX: 0,
    padY: 0,
    boardSize: 480,
  };

  /* ════════════════════════════════════════════════════════════════════════
     DOM REFS
  ════════════════════════════════════════════════════════════════════════ */

  var canvas      = document.getElementById('yn-canvas');
  var ctx         = canvas ? canvas.getContext('2d') : null;
  var elStatus    = document.getElementById('yn-status');
  var elThrowBtn  = document.getElementById('yn-throw-btn');
  var elNewBtn    = document.getElementById('yn-new-btn');
  var elAiToggle  = document.getElementById('yn-ai-toggle');
  var elThrowRes  = document.getElementById('yn-throw-result');
  var elPending   = document.getElementById('yn-pending-moves');

  if (!canvas || !ctx) return; // guard: canvas not found

  /* ════════════════════════════════════════════════════════════════════════
     RESIZE — must resize canvas buffer, not just CSS
  ════════════════════════════════════════════════════════════════════════ */

  window.GameResize = function (availW, availH) {
    var size = Math.min(availW || 480, availH ? availH - 120 : 480, 520);
    size = Math.max(size, 200);
    canvas.width  = size;
    canvas.height = size;
    state.boardSize = size;
    state.padX = Math.round(size * 0.08);
    state.padY = Math.round(size * 0.08);
    render();
  };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER — placeholder board (Phase A)
  ════════════════════════════════════════════════════════════════════════ */

  function render() {
    if (!ctx) return;
    var w = canvas.width;
    var h = canvas.height;
    var pad = state.padX;

    ctx.clearRect(0, 0, w, h);

    // Board background
    ctx.fillStyle = '#fdf6e3';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, w, h, 8) : ctx.rect(0, 0, w, h);
    ctx.fill();

    // Draw cross-shaped path outline (placeholder — full graph in Phase B)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    var cx = w / 2;
    var cy = h / 2;
    var arm = (w - pad * 2) / 2;

    // Outer square
    ctx.beginPath();
    ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.stroke();

    // Diagonal shortcuts
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(pad, pad);         ctx.lineTo(cx, cy); // top-left corner → center
    ctx.moveTo(w - pad, pad);     ctx.lineTo(cx, cy); // top-right corner → center
    ctx.moveTo(cx, pad);          ctx.lineTo(cx, cy); // top center → center
    ctx.moveTo(cx, h - pad);      ctx.lineTo(cx, cy); // bottom center → center (start)
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner nodes
    var corners = [
      [pad, pad],
      [w - pad, pad],
      [pad, h - pad],
      [w - pad, h - pad],
    ];
    corners.forEach(function (pt) {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 9, 0, Math.PI * 2);
      ctx.fillStyle = '#c0392b';
      ctx.fill();
      ctx.strokeStyle = '#7a0000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Center node
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.strokeStyle = '#7a0000';
    ctx.stroke();

    // "Start" label at bottom-center node
    var startX = cx;
    var startY = h - pad;
    ctx.beginPath();
    ctx.arc(startX, startY, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.strokeStyle = '#7a0000';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('출발', startX, startY);

    // Placeholder "coming soon" notice
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = 'rgba(139, 69, 19, 0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Phase B — board graph coming', cx, cy + 36);
  }

  /* ════════════════════════════════════════════════════════════════════════
     UI HELPERS
  ════════════════════════════════════════════════════════════════════════ */

  function setStatus(msg) {
    if (elStatus) elStatus.textContent = msg;
  }

  function setThrowResult(msg) {
    if (elThrowRes) elThrowRes.innerHTML = msg;
  }

  function renderPendingMoves() {
    if (!elPending) return;
    elPending.innerHTML = '';
    state.pendingMoves.forEach(function (v) {
      var chip = document.createElement('span');
      chip.className = 'yn-move-chip';
      chip.textContent = v;
      elPending.appendChild(chip);
    });
  }

  function setThrowBtnEnabled(enabled) {
    if (elThrowBtn) elThrowBtn.disabled = !enabled;
  }

  /* ════════════════════════════════════════════════════════════════════════
     THROW LOGIC (stub — animation in Phase H)
  ════════════════════════════════════════════════════════════════════════ */

  function computeThrow() {
    // Each stick: 0 = round side up, 1 = flat side up
    // Mo: all round (0+0+0+0 = 0) maps to 5 moves — handle before sum
    var sticks = [
      Math.random() < 0.5 ? 1 : 0,
      Math.random() < 0.5 ? 1 : 0,
      Math.random() < 0.5 ? 1 : 0,
      Math.random() < 0.5 ? 1 : 0,
    ];
    var flat = sticks.reduce(function (s, v) { return s + v; }, 0);
    var value = flat === 0 ? 5 : flat; // Mo = all round = 5
    return { sticks: sticks, value: value, name: THROW_NAMES[value].name, ko: THROW_NAMES[value].ko };
  }

  function doThrow() {
    if (state.phase !== 'throw') return;
    setThrowBtnEnabled(false);

    var result = computeThrow();
    state.lastThrow = result;
    state.throwHistory.push(result.value);

    state.pendingMoves.push(result.value);

    var extra = THROW_NAMES[result.value].extraThrow;
    var label = result.ko + ' (' + result.name + ') — ' + result.value + ' move' + (result.value !== 1 ? 's' : '');
    if (extra) label += ' + throw again!';
    setThrowResult('<span class="yn-throw-ko">' + result.ko + '</span> (' + result.name + ') — ' + result.value + ' move' + (result.value !== 1 ? 's' : '') + (extra ? ' <strong>+ throw again!</strong>' : ''));

    renderPendingMoves();

    if (extra) {
      // Stay in throw phase for extra throw
      setStatus(state.currentTeam.toUpperCase() + ' team — throw again! 다시 던지세요!');
      setThrowBtnEnabled(true);
    } else {
      // Move to move phase
      state.phase = 'move';
      setStatus(state.currentTeam.toUpperCase() + ' team — select a piece to move');
      // Phase D: piece selection input handled here
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     GAME INIT
  ════════════════════════════════════════════════════════════════════════ */

  function startGame(mode) {
    state.mode = mode || '2p';
    state.phase = 'throw';
    state.currentTeam = 'a';
    state.pendingMoves = [];
    state.lastThrow = null;
    state.throwHistory = [];
    state.captureCount = { a: 0, b: 0 };
    state.winner = null;
    setThrowResult('');
    renderPendingMoves();
    setStatus('팀 A의 차례 (Team A\'s turn) — 윷 던지기!');
    setThrowBtnEnabled(true);
    render();
  }

  function newGame() {
    state.phase = 'mode-select';
    setThrowBtnEnabled(false);
    setThrowResult('');
    renderPendingMoves();
    setStatus('Choose a mode to start');
    render();
    // In Phase H this will show the mode selection overlay
    // For now, auto-start 2p for development
    startGame(state.mode);
  }

  /* ════════════════════════════════════════════════════════════════════════
     EVENT LISTENERS
  ════════════════════════════════════════════════════════════════════════ */

  if (elThrowBtn) {
    elThrowBtn.addEventListener('click', doThrow);
  }

  if (elNewBtn) {
    elNewBtn.addEventListener('click', newGame);
  }

  if (elAiToggle) {
    elAiToggle.addEventListener('change', function () {
      state.aiEnabled = elAiToggle.checked;
    });
  }

  // Theme change re-render
  if (window.CGTheme && window.CGTheme.onThemeChange) {
    window.CGTheme.onThemeChange = function () { render(); };
  }

  // Canvas click (Phase D: piece selection)
  canvas.addEventListener('click', function (e) {
    if (state.phase !== 'move') return;
    // Phase D will handle piece hit testing here
  });

  /* ════════════════════════════════════════════════════════════════════════
     FULLSCREEN SUPPORT
  ════════════════════════════════════════════════════════════════════════ */

  document.addEventListener('fs-enter', function () {
    var wrap = document.getElementById('yn-board-wrap');
    if (wrap) window.GameResize(wrap.clientWidth, wrap.clientHeight);
  });
  document.addEventListener('fs-exit', function () {
    var wrap = document.getElementById('yn-board-wrap');
    if (wrap) window.GameResize(wrap.clientWidth, wrap.clientHeight);
  });

  /* ════════════════════════════════════════════════════════════════════════
     INITIAL RENDER
  ════════════════════════════════════════════════════════════════════════ */

  (function init() {
    // Size canvas to its wrapper
    var wrap = document.getElementById('yn-board-wrap');
    var initSize = wrap ? Math.min(wrap.clientWidth || 480, 520) : 480;
    window.GameResize(initSize, initSize + 120);
    startGame('2p');
  }());

}());
