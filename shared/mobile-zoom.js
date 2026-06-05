/**
 * shared/mobile-zoom.js — Mobile "fit to viewport" engine for game pages.
 *
 * GOAL: on phones/tablets (viewport ≤ 900px), every game — canvas board or
 * DOM cards/tiles/pits — fills the available space and stays FULLY VISIBLE
 * without scrolling or manual zoom, in BOTH portrait and landscape.
 *
 * The available rectangle is the viewport minus the header above the game and
 * the bottom nav bar / safe-area below it.
 *
 * Two strategies, picked automatically:
 *
 *   • CANVAS games (expose window.GameResize / window.cgMobileResize):
 *       Re-render the board into the available BOARD rectangle (viewport
 *       height minus the game's HUD + controls). The board stays crisp and
 *       height-aware; the HUD/controls keep their natural, readable size.
 *       This mirrors what fullscreen.js does, but for the inline viewport.
 *
 *   • DOM games (cards, tiles, pits): scale the game's root element with CSS
 *       `zoom` so it fits both dimensions — GROWING small layouts to fill the
 *       screen and SHRINKING tall ones so nothing is ever cut off.
 *
 * Unlike the old auto-fit this runs in BOTH orientations, GROWS as well as
 * shrinks, accounts for height (not just width), and re-runs whenever the
 * game re-renders (ResizeObserver) instead of firing once on a blind timer.
 *
 * A small floating button lets the user nudge an extra zoom level on top.
 */
(function () {
  'use strict';

  var MAX_VIEWPORT = 900;     // engine only runs on phones / small tablets
  var MIN_SCALE    = 0.4;     // never shrink below this
  var MAX_SCALE    = 2.2;     // how far a small DOM layout may grow
  var EDGE_PAD     = 8;       // breathing room (px) at the bottom edge

  // Game roots for DOM (non-canvas) games — mirror of fullscreen.js list.
  var DOM_SELECTOR =
    '.tl-game, .oaq-game, .ow-game, .pg-game, ' +
    '.pt-game-wrap, .pu-game-wrap, .mj-wrap, .bc-game, .cu-game';

  // User nudge levels applied on top of the auto fit.
  var USER_LEVELS = [1, 0.85, 0.7, 1.15];
  var USER_LABELS = ['1×', '0.85×', '0.7×', '1.15×'];
  var userIndex   = 0;

  var fitting       = false;  // re-entrancy guard (fit() mutates the DOM)
  var debounceTimer = null;
  var releaseTimer  = null;
  var resizeObs     = null;
  var mutationObs   = null;

  // Cached natural (unzoomed) size of the current DOM-game root.
  var domDirty   = true;
  var domNatW    = 0;
  var domNatH    = 0;
  var domRootRef = null;

  function getContainer() {
    return document.getElementById('game-container') ||
           document.querySelector('.game-container');
  }

  function isCanvasGame(c) {
    return !!c.querySelector('canvas') &&
           (typeof window.GameResize === 'function' ||
            typeof window.cgMobileResize === 'function');
  }

  /* Height reserved at the bottom for the mobile tab bar + safe area. */
  function bottomReserve() {
    var nav = document.querySelector('.mb-nav-bar, .mb-nav');
    var h = 0;
    if (nav && getComputedStyle(nav).display !== 'none') {
      h = nav.getBoundingClientRect().height || 0;
    }
    return h + EDGE_PAD;
  }

  /* The CONTENT rectangle the game may occupy, in CSS px. We subtract the
     container's own padding so the fitted child PLUS that padding still fits
     the viewport (otherwise the padding pushes the bottom row off-screen). */
  function availRect(c) {
    var cs = getComputedStyle(c);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight)  || 0);
    var padY = (parseFloat(cs.paddingTop)  || 0) + (parseFloat(cs.paddingBottom) || 0);
    var top = Math.max(c.getBoundingClientRect().top, 0);
    // Cap to the viewport: some containers report a clientWidth wider than the
    // screen (content that overflows horizontally), which would size the board
    // off-screen. The game must never be wider than the viewport.
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var usableW = Math.min(c.clientWidth, vw) - padX;
    return {
      w: Math.max(usableW, 80),
      h: Math.max(window.innerHeight - top - bottomReserve() - padY, 140)
    };
  }

  /* ── Canvas games: render the board to fit, keep HUD/controls readable ── */
  function fitCanvas(c, canvas, rect, userScale) {
    // Clear any prior overrides so we measure the natural layout.
    c.style.zoom = '';
    canvas.style.removeProperty('width');
    canvas.style.removeProperty('height');
    window.CGMobileScale = 1;

    // Remember the board's NATURAL aspect (w/h) once, while it still looks like
    // a real board (not a previous distorted fit). Used to give GameResize an
    // aspect-correct box so the board fills it instead of being letterboxed.
    if (!canvas._cgAspect && canvas.width > 40 && canvas.height > 40) {
      var a = canvas.width / canvas.height;
      if (a > 0.25 && a < 4) canvas._cgAspect = a;
    }
    var aspect = canvas._cgAspect || 1;

    // Height taken by everything that is NOT the board (HUD, buttons, log…).
    var nonBoard = c.scrollHeight - canvas.offsetHeight;
    var availBoardH = Math.max(120, (rect.h - nonBoard - EDGE_PAD) * userScale);
    var availBoardW = rect.w * userScale;

    // Fit a box of the board's aspect into the available board area, so the
    // board grows to fill one dimension instead of floating in a wide letterbox.
    var boxW, boxH;
    if (availBoardW / availBoardH > aspect) {
      boxH = availBoardH; boxW = boxH * aspect;
    } else {
      boxW = availBoardW; boxH = boxW / aspect;
    }

    // Let the game re-render its board into that box (crisp + height-aware).
    if (typeof window.GameResize === 'function') {
      window.GameResize(Math.round(boxW), Math.round(boxH));
    } else if (typeof window.cgMobileResize === 'function') {
      window.cgMobileResize();
    }

    // Fit whatever buffer the game produced into the board box (display only).
    var cw = canvas.width, ch = canvas.height;
    if (cw && ch) {
      var s = Math.min(availBoardW / cw, availBoardH / ch);
      if (s > 0 && isFinite(s)) {
        var dispW = Math.min(Math.round(cw * s), Math.round(rect.w));
        var dispH = Math.min(Math.round(ch * s), Math.round(rect.h));
        canvas.style.width  = dispW + 'px';
        canvas.style.height = dispH + 'px';
      }
    }

    // Safety net: if the container still overflows the viewport (tall HUD, a
    // min-height we kept on canvas containers, late layout), shrink the whole
    // container so nothing is clipped or hidden under the tab bar.
    var limit = window.innerHeight - bottomReserve() - 4;
    var cb = c.getBoundingClientRect();
    if (cb.bottom > limit + 2 && cb.height > 0) {
      c.style.zoom = String(Math.max(MIN_SCALE, (cb.height - (cb.bottom - limit)) / cb.height));
    }
  }

  /* ── DOM games: scale the root to fit both dimensions (grow or shrink) ──
     We must NOT toggle the live zoom to measure on every fit — that resizes
     the element, the ResizeObserver fires, and we oscillate forever. Instead
     we cache the element's NATURAL (unzoomed) size and only re-measure when the
     game actually re-renders (tracked via MutationObserver → domDirty). On a
     plain viewport change we reuse the cached natural size, recompute the
     scale, and skip the write entirely if it hasn't meaningfully changed — so
     our own zoom write can't retrigger the loop. */
  function fitDom(c, root, rect, userScale) {
    c.style.zoom = '';   // start clean so the safety fallback recomputes fresh
    if (domDirty || domRootRef !== root) {
      var prev = root.style.zoom;
      root.style.zoom = '';
      domNatW = root.scrollWidth;
      domNatH = root.scrollHeight;
      root.style.zoom = prev;        // restore; final value set below
      domRootRef = root;
      domDirty = false;
    }
    if (!domNatW || !domNatH) return;

    var s = Math.min(rect.w / domNatW, rect.h / domNatH) * userScale;
    s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    var target = (Math.abs(s - 1) < 0.02) ? '' : String(s);
    var cur = root.style.zoom || '';
    var unchanged = (cur === target) ||
                    (cur && target && Math.abs(parseFloat(cur) - s) < 0.01);
    if (!unchanged) root.style.zoom = target;

    // Synchronous overflow correction. The cached natural height can lag late
    // layout (images/fonts decode after first paint and grow the content).
    // Measure the REAL rendered height now and, if it still overflows, correct
    // the cached natural size and re-fit. Updating the cache (not just the zoom)
    // keeps the next fit stable, so this can't oscillate.
    var applied = parseFloat(root.style.zoom) || 1;
    var realH = root.getBoundingClientRect().height / applied;  // true natural H
    if (realH > 4 && Math.abs(realH - domNatH) / domNatH > 0.03) {
      domNatH = realH;
      var s2 = Math.min(rect.w / domNatW, rect.h / domNatH) * userScale;
      s2 = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s2));
      root.style.zoom = (Math.abs(s2 - 1) < 0.02) ? '' : String(s2);
    }

    // Guaranteed-fit safety net: after scaling the root, if the CONTAINER still
    // spills past the viewport (unscaled siblings, content that grew after our
    // measurement), shrink the whole container by the exact overflow ratio.
    // We reset container zoom at the top of this function, so this recomputes
    // from a clean state every fit and cannot drift or oscillate.
    // SAFETY_FUDGE absorbs sub-pixel rounding + nonlinearity in nested-zoom
    // getBoundingClientRect, so the bottom row clears the edge for certain.
    var SAFETY_FUDGE = 16;
    var limit = window.innerHeight - bottomReserve() - SAFETY_FUDGE;
    var cb = c.getBoundingClientRect();
    var spill = cb.bottom - limit;
    if (spill > 2 && cb.height > 0) {
      c.style.zoom = String(Math.max(MIN_SCALE, (cb.height - spill) / cb.height));
    }
  }

  function fit() {
    if (fitting) return;
    if (window.innerWidth > MAX_VIEWPORT) {
      // Desktop: clear any overrides we may have set on a previous small size.
      var dc = getContainer();
      if (dc) {
        dc.style.zoom = '';
        var dcv = dc.querySelector('canvas');
        if (dcv) { dcv.style.removeProperty('width'); dcv.style.removeProperty('height'); }
      }
      window.CGMobileScale = 1;
      return;
    }

    var c = getContainer();
    if (!c) return;

    // Skip hidden containers (e.g. a game's setup/lobby screen keeps the board
    // container display:none until the game starts). Running here would waste
    // work and could cache a wrong board aspect from the default canvas. The
    // ResizeObserver re-fires the moment the container becomes visible.
    if (c.offsetParent === null && getComputedStyle(c).position !== 'fixed') return;

    fitting = true;
    try {
      var rect = availRect(c);
      var userScale = USER_LEVELS[userIndex] || 1;
      if (isCanvasGame(c)) {
        var canvas = c.querySelector('canvas');
        fitCanvas(c, canvas, rect, userScale);
      } else {
        var root = c.querySelector(DOM_SELECTOR) || c.firstElementChild;
        if (root) fitDom(c, root, rect, userScale);
      }
    } finally {
      // Release the guard shortly after so our own DOM writes don't re-trigger
      // the ResizeObserver into a loop. setTimeout (not rAF) so it always fires,
      // even when the tab is backgrounded and rAF is throttled.
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(function () { fitting = false; }, 80);
    }
  }

  function schedule() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fit, 90);
  }

  /* ── Manual nudge button ── */
  function injectButton() {
    if (document.getElementById('mobile-zoom-btn')) return null;
    var btn = document.createElement('button');
    btn.id = 'mobile-zoom-btn';
    btn.setAttribute('aria-label', 'Adjust zoom');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="11" cy="11" r="8"/>' +
        '<line x1="8" y1="11" x2="14" y2="11"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
      '</svg>' +
      '<span id="mobile-zoom-label">1×</span>';
    document.body.appendChild(btn);
    return btn;
  }

  function init() {
    if (window.innerWidth > MAX_VIEWPORT) return;
    var c = getContainer();
    if (!c) return;

    var btn = injectButton();
    if (btn) {
      btn.addEventListener('click', function () {
        userIndex = (userIndex + 1) % USER_LEVELS.length;
        var label = document.getElementById('mobile-zoom-label');
        if (label) label.textContent = USER_LABELS[userIndex];
        fit();
      });
    }

    // Re-fit when the container's size changes (viewport, fonts settling…).
    if ('ResizeObserver' in window) {
      resizeObs = new ResizeObserver(function () { if (!fitting) schedule(); });
      resizeObs.observe(c);
    }

    // Re-measure natural size when the game re-renders (new game, hand change,
    // AI move…). We watch CONTENT mutations only — NOT attributes — so our own
    // zoom writes (a style attribute change) never trigger a re-measure loop.
    if ('MutationObserver' in window) {
      mutationObs = new MutationObserver(function () {
        domDirty = true;
        if (!fitting) schedule();
      });
      mutationObs.observe(c, { childList: true, subtree: true, characterData: true });
    }
  }

  // Force a fresh natural-size measurement on the next fit (used when late
  // assets like fonts/images may have changed the layout).
  function remeasure() { domDirty = true; }

  document.addEventListener('DOMContentLoaded', function () {
    init();
    // A few passes as fonts/images/canvases settle after first paint.
    schedule();
    setTimeout(function () { remeasure(); fit(); }, 350);
    setTimeout(function () { remeasure(); fit(); }, 800);
  });

  // window.load fires after images decode — re-measure so late images count.
  window.addEventListener('load', function () { remeasure(); fit(); });
  window.addEventListener('resize', function () { userIndex = 0; remeasure(); schedule(); });
  window.addEventListener('orientationchange', function () {
    userIndex = 0;
    setTimeout(function () { remeasure(); fit(); }, 250);
  });

}());
