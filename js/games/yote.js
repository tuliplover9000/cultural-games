/**
 * yote.js — Yoté (West African capture game)
 *
 * SESSION 1 SCAFFOLD ONLY.
 * This file establishes the canvas, the window.CGTheme colour bridge, and the
 * resize hooks. There is NO game logic yet — it renders a blank, correctly
 * themed 6×5 board. Drop/move/capture mechanics arrive in later phases.
 */
(function () {
  'use strict';

  // ── Board geometry ───────────────────────────────────────────────────────
  var COLS = 6, ROWS = 5;          // 6 wide × 5 tall = 30 squares (landscape)
  var PAD  = 28;                   // canvas padding (device px) around the board
  var HAND_PER_PLAYER = 12;        // reserve pieces per player (for later phases)

  // ── Canvas ───────────────────────────────────────────────────────────────
  var cnv, ctx;

  // ── Colour bridge ─────────────────────────────────────────────────────────
  // Canvas cannot read CSS variables, so every colour is bridged through
  // window.CGTheme. We re-read these whenever the theme toggles (see below).
  // The board itself uses warm West-African wood tones in both themes; accents
  // come from the live theme palette.
  var C = {};
  function readColors() {
    var p = (window.CGTheme && typeof window.CGTheme.getColors === 'function')
      ? window.CGTheme.getColors() : {};
    var dark = (window.CGTheme && typeof window.CGTheme.getTheme === 'function')
      ? window.CGTheme.getTheme() === 'dark' : false;

    C = {
      // Container / board surface — warm wood, slightly deeper in dark mode.
      bg:        dark ? '#1d1206' : '#2a1606',
      board:     dark ? '#6a4422' : '#7a5028',
      boardHi:   dark ? '#a9743f' : '#c4894f',
      line:      dark ? '#2c1404' : '#3a1a05',
      cell:      dark ? '#7d5228' : '#8a5d30',
      cellEdge:  'rgba(0,0,0,0.28)',
      dot:       'rgba(0,0,0,0.18)',
      // Piece colours (used from the next phase on).
      p1:        '#F5E6C8',        // player (light)
      p1Ring:    '#9a7030',
      p2:        '#b03a28',        // opponent (terracotta)
      p2Ring:    '#6e2014',
      // Accents pulled from the live theme palette, with safe fallbacks.
      accent:    p.accentGold || '#C89B3C',
      text:      p.text       || '#F0E6D0',
      muted:     p.textMuted  || '#B09070',
    };
  }

  // ── Sizing (devicePixelRatio-aware) ───────────────────────────────────────
  function dpr() { return Math.max(1, Math.min(window.devicePixelRatio || 1, 3)); }

  // Lay the canvas out to a given CSS width; height follows the board aspect.
  function sizeToWidth(cssW) {
    if (!cnv) return;
    var scale = window.CGMobileScale || 1;
    var ratio = dpr();
    var w = Math.max(120, Math.round(cssW * scale));
    var cell = (w - PAD * 2) / COLS;
    var h = Math.round(cell * ROWS + PAD * 2);
    cnv.width  = Math.round(w * ratio);
    cnv.height = Math.round(h * ratio);
    cnv.style.width  = '100%';
    cnv.style.height = 'auto';
    render();
  }

  function resizeCanvas() {
    var wrap = document.getElementById('yo-board-wrap');
    if (!wrap) return;
    sizeToWidth(wrap.clientWidth || 480);
  }

  function cellSize() { return (cnv.width - PAD * 2 * dpr()) / COLS; }

  function cellCenter(c, r) {
    var cs = cellSize(), p = PAD * dpr();
    return { x: p + c * cs + cs / 2, y: p + r * cs + cs / 2 };
  }

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (!cnv || !ctx) return;
    var W = cnv.width, H = cnv.height;
    ctx.clearRect(0, 0, W, H);

    // Container background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Board body
    var p = PAD * dpr();
    var cs = cellSize();
    var bx = p - cs * 0.18, by = p - cs * 0.18;
    var bw = COLS * cs + cs * 0.36, bh = ROWS * cs + cs * 0.36;
    ctx.fillStyle = C.board;
    roundRect(bx, by, bw, bh, 10 * dpr()); ctx.fill();

    // Top highlight strip
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = C.boardHi;
    roundRect(bx + 2, by + 2, bw - 4, bh * 0.22, 8 * dpr()); ctx.fill();
    ctx.restore();

    // Cells
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = p + c * cs, y = p + r * cs;
        var inset = cs * 0.08;
        ctx.fillStyle = C.cell;
        roundRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2, 6 * dpr());
        ctx.fill();
        ctx.lineWidth = Math.max(1, 1.2 * dpr());
        ctx.strokeStyle = C.cellEdge;
        ctx.stroke();
        // Empty-square marker dot
        var ct = cellCenter(c, r);
        ctx.beginPath();
        ctx.arc(ct.x, ct.y, Math.max(2, cs * 0.06), 0, Math.PI * 2);
        ctx.fillStyle = C.dot;
        ctx.fill();
      }
    }
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function setStatus(msg) {
    var el = document.getElementById('yo-status');
    if (el) el.textContent = msg;
  }
  function updateScore() {
    var el = document.getElementById('yo-score');
    if (!el) return;
    el.innerHTML =
      '<span class="yo-score__you">You: ' + HAND_PER_PLAYER + ' in hand</span>' +
      '<span class="yo-score__ai">AI: ' + HAND_PER_PLAYER + ' in hand</span>';
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    cnv = document.getElementById('yo-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    readColors();

    // Re-read palette + redraw whenever the theme toggles.
    if (window.CGTheme) {
      var prev = window.CGTheme.onchange;
      window.CGTheme.onchange = function (t) {
        if (typeof prev === 'function') { try { prev(t); } catch (e) {} }
        readColors();
        render();
      };
    }

    // Buttons are inert in Session 1 (logic lands in later phases) but wired so
    // they don't error.
    var elNew  = document.getElementById('yo-new-btn');
    var elUndo = document.getElementById('yo-undo-btn');
    if (elNew)  elNew.addEventListener('click',  function () { resizeCanvas(); setStatus('New game — coming soon.'); });
    if (elUndo) elUndo.addEventListener('click', function () { setStatus('Nothing to undo yet.'); });

    window.addEventListener('resize', resizeCanvas);
    window.cgMobileResize = resizeCanvas;

    resizeCanvas();
    updateScore();
    setStatus('Yoté board ready — game logic coming soon.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Fullscreen / mobile-fit resize hooks ───────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { setTimeout(render, 50); };
    FSMode.onExit  = function () { setTimeout(render, 50); };
  }

  window.GameResize = function (availW, availH) {
    if (!cnv) return;
    var ratio = dpr();
    var maxW = availW, maxH = availH;
    // Fit the board within the available box, preserving aspect.
    var cellByW = (maxW - PAD * 2) / COLS;
    var cellByH = (maxH - PAD * 2) / ROWS;
    var cell = Math.max(20, Math.min(cellByW, cellByH));
    var w = Math.round(cell * COLS + PAD * 2);
    var h = Math.round(cell * ROWS + PAD * 2);
    cnv.width  = Math.round(w * ratio);
    cnv.height = Math.round(h * ratio);
    cnv.style.width  = w + 'px';
    cnv.style.height = h + 'px';
    render();
  };

}());
