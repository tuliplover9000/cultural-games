/**
 * status-announce.js — makes the per-game status line audible to screen readers.
 *
 * Every game shows its turn/result text in a status line (.ow-status,
 * .tl-status-bar, #kn-status, …). Sighted players read it; screen-reader users
 * got nothing, so turn changes, captures and results were silent.
 *
 * Why this mirrors into #fs-announce instead of putting aria-live on the status
 * element itself: most games re-render by replacing innerHTML, which DESTROYS
 * and recreates the status node. A live region only announces when the text
 * inside a region that was already present changes — a brand-new region with
 * text in it announces nothing. #fs-announce is in the static page markup and
 * survives every re-render, so it is the one place an announcement reliably
 * lands. (The 16 games whose status IS static markup already carry aria-live;
 * this covers them too, and the de-dupe below means they are not announced
 * twice.)
 */
(function () {
  'use strict';

  // Ordered by specificity: an explicit id first, then the shared card-game
  // status bar, then any element whose class ends in -status.
  var SELECTORS = [
    '[id$="-status"]',
    '.tl-status-bar',
    '[class$="-status"]',
    '[class*="-status "]'
  ];

  var region = null;
  var last   = '';
  var timer  = null;

  function statusText() {
    for (var i = 0; i < SELECTORS.length; i++) {
      var el = document.querySelector(SELECTORS[i]);
      if (el && el.offsetParent !== null) {          // visible only
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
    }
    return '';
  }

  // ── Canvas boards ────────────────────────────────────────────────────────
  // The 15 canvas games already carry aria-label="<Game> board" role="img", but
  // a static name says nothing about the POSITION — a screen-reader user who
  // navigates to the board hears "Yoté board, image" and learns nothing. Fold
  // the live status and score summary into the label so focusing the board
  // reports the current state. This is not a substitute for a real per-game
  // board description; it is the generic part that can be done for every game
  // at once.
  var canvasEl = null, baseLabel = '';

  function scoreText() {
    var el = document.querySelector('[id$="-score"], [class*="-score"]');
    if (!el || el.offsetParent === null) return '';
    // Join the child spans explicitly. textContent runs them together, which
    // produced "0 lostPlayer 2 (AI): ..." — fine visually, where the spans are
    // laid out apart, but unreadable when spoken.
    var parts = [];
    if (el.children && el.children.length) {
      for (var i = 0; i < el.children.length; i++) {
        var t = (el.children[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      }
    }
    var out = parts.length ? parts.join('. ') : (el.textContent || '');
    return out.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  function updateCanvasLabel(status) {
    if (!canvasEl) return;
    var parts = [baseLabel];
    var sc = scoreText();
    if (sc) parts.push(sc);
    if (status) parts.push(status);
    canvasEl.setAttribute('aria-label', parts.join('. '));
  }

  function flush() {
    timer = null;
    if (!region) return;
    var t = statusText();
    updateCanvasLabel(t);
    // Only on a real change: re-announcing identical text on every render would
    // make a screen reader repeat itself constantly.
    if (!t || t === last) return;
    last = t;
    region.textContent = t;
  }

  function schedule() {
    if (timer) return;
    // Coalesce a burst of DOM writes from one render into a single announcement.
    timer = setTimeout(flush, 250);
  }

  function start() {
    region = document.getElementById('fs-announce');
    if (!region || typeof MutationObserver !== 'function') return;
    canvasEl  = document.querySelector('canvas[aria-label]');
    baseLabel = canvasEl ? (canvasEl.getAttribute('aria-label') || '') : '';
    last = statusText();          // seed, so the initial prompt isn't announced on load
    new MutationObserver(schedule).observe(document.body, {
      childList: true, subtree: true, characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
