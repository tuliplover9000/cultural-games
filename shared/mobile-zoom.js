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

  var MAX_VIEWPORT = 900;     // phones / small tablets by WIDTH
  var MAX_LANDSCAPE_H = 500;  // landscape phones are short — treat as mobile too
  var MIN_SCALE    = 0.4;     // never shrink below this
  var MAX_SCALE    = 2.2;     // how far a small DOM layout may grow
  var EDGE_PAD     = 14;      // breathing room (px) at the bottom edge

  /* Run on phones in EITHER orientation. A big phone in LANDSCAPE can be wider
     than 900px (e.g. iPhone Pro Max ≈ 932px), but it's always SHORT (≤ ~500px
     tall) — so a short viewport counts as mobile regardless of width. Without
     this, large phones in landscape fell back to the desktop layout (game too
     tall → had to scroll). */
  function isMobileViewport() {
    return window.innerWidth <= MAX_VIEWPORT || window.innerHeight <= MAX_LANDSCAPE_H;
  }

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

  /* STABLE viewport height = the SMALL viewport (100svh), i.e. the height with
     the browser address bar SHOWN. window.innerHeight changes as the address
     bar hides/shows on scroll; fitting to it made the game overflow (bottom row
     clipped) once the bar reappeared, and jump while scrolling. Fitting to svh
     means the game always fits no matter the bar state, and never needs to
     re-fit on scroll. Falls back to innerHeight if svh is unsupported. */
  /* force-landscape.js rotates the page 90°. When active, the game's available
     "height" is the SHORT screen dimension (window.innerWidth) and its width is
     the LONG one (window.innerHeight) — see availRect(). Screen-space rects are
     rotated and unreliable here, so we use window dims + layout-space offsets. */
  function lsActive() {
    return document.documentElement.classList.contains('cg-landscape');
  }

  var _svhProbe = null;
  function viewportH() {
    if (lsActive()) return window.innerWidth;   // short screen dim = landscape height
    if (!_svhProbe && document.body) {
      _svhProbe = document.createElement('div');
      _svhProbe.setAttribute('aria-hidden', 'true');
      _svhProbe.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;z-index:-1;';
      document.body.appendChild(_svhProbe);
    }
    var h = _svhProbe ? _svhProbe.offsetHeight : 0;
    return h > 40 ? h : window.innerHeight;
  }

  /* Height reserved at the bottom for the mobile tab bar + breathing room, so
     the gold border clears the bottom edge. The leftover gap below the fitted
     container IS the bottom margin. */
  function bottomReserve() {
    var nav = document.querySelector('.mb-nav-bar, .mb-nav');
    var h = 0;
    if (nav && getComputedStyle(nav).display !== 'none') {
      // offsetHeight is layout-space (rotation-invariant); getBoundingClientRect
      // would return a rotated box under force-landscape.
      h = nav.offsetHeight || nav.getBoundingClientRect().height || 0;
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
    // In force-landscape, getBoundingClientRect().top is rotated/meaningless;
    // c.offsetTop is layout-space (rotation-invariant) and reserves the header.
    var top = lsActive() ? Math.max(c.offsetTop || 0, 0)
                         : Math.max(c.getBoundingClientRect().top, 0);
    // Cap to the viewport: some containers report a clientWidth wider than the
    // screen (content that overflows horizontally), which would size the board
    // off-screen. The game must never be wider than the viewport. In
    // force-landscape the usable width is the LONG screen dim (innerHeight).
    var vw = lsActive() ? window.innerHeight
                        : (document.documentElement.clientWidth || window.innerWidth);
    var usableW = Math.min(c.clientWidth, vw) - padX;
    return {
      w: Math.max(usableW, 80),
      h: Math.max(viewportH() - top - bottomReserve() - padY, 140)
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

    // Height taken by everything that is NOT the board. In a normal VERTICAL
    // stack (board above HUD/controls) that's scrollHeight − the board. But in a
    // SIDE-BY-SIDE layout (landscape: board left, HUD column right — display
    // grid, or flex-direction:row) the HUD sits BESIDE the board and shares the
    // height, so it must not be subtracted — the board gets the full height.
    var disp = getComputedStyle(c);
    var sideBySide = disp.display === 'grid' ||
                     (disp.display === 'flex' && disp.flexDirection.indexOf('row') === 0);
    // In force-landscape there is plenty of spare WIDTH (the long screen dim) and
    // HEIGHT is the constraint, so give the board the full height and let the HUD
    // sit beside it / scroll — otherwise the stacked HUD starves the board.
    var nonBoard = (sideBySide || lsActive()) ? 0 : Math.max(0, c.scrollHeight - canvas.offsetHeight);
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
    // SKIPPED under force-landscape: getBoundingClientRect() returns a rotated
    // box there, so cb.bottom is meaningless and would wrongly shrink the board.
    if (!lsActive()) {
      var limit = viewportH() - bottomReserve();
      var cb = c.getBoundingClientRect();
      var spill = cb.bottom - limit;
      if (spill > 3 && cb.height > 0) {
        c.style.zoom = String(Math.max(MIN_SCALE, (cb.height - spill - 4) / cb.height));
      }
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
    // measurement), shrink the whole container to fit. The root fit already
    // targets the same `limit`, so in the normal case spill ≈ 0 and this does
    // NOT fire — avoiding the double-zoom that made every DOM game too small.
    // It only fires on genuine overflow (stale measurement); the extra −4px
    // then absorbs nested-zoom getBoundingClientRect rounding.
    var limit = viewportH() - bottomReserve();
    var cb = c.getBoundingClientRect();
    var spill = cb.bottom - limit;
    if (spill > 3 && cb.height > 0) {
      c.style.zoom = String(Math.max(MIN_SCALE, (cb.height - spill - 4) / cb.height));
    }
  }

  function fit() {
    if (fitting) return;
    if (!isMobileViewport()) {
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

  // Public re-fit hook: content inserted ABOVE #game-container after the initial
  // fit (e.g. play-count.js's async header counter) shifts the board down without
  // changing the container's own size, so neither observer fires. Callers nudge a
  // re-fit here. No-op cost on desktop (fit early-returns when zoom is inactive).
  window.cgMobileRefit = schedule;

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
    if (!isMobileViewport()) return;
    var c = getContainer();
    if (!c) return;
    // Idempotent: if observers are already installed, don't double-attach.
    // (injectButton already self-guards on its element id.)
    if (resizeObs || mutationObs) return;

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

  // IMPORTANT: only re-fit when the viewport WIDTH changes (a real resize or
  // rotation). On phones, scrolling hides/shows the browser address bar, which
  // changes innerHeight and fires 'resize' — re-fitting then makes the whole
  // game visibly resize/jump while the user scrolls. Height-only changes are
  // ignored: the game was already fitted to the smaller (address-bar-shown)
  // height, so it still fits when the bar hides and more height appears.
  var lastViewportW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastViewportW) return;   // height-only → ignore
    lastViewportW = window.innerWidth;
    userIndex = 0; init(); remeasure(); schedule();
  });
  window.addEventListener('orientationchange', function () {
    userIndex = 0;
    setTimeout(function () { lastViewportW = window.innerWidth; remeasure(); fit(); }, 250);
  });

}());
