/**
 * shared/mobile-zoom.js — Mobile zoom-out button + auto-fit for game pages
 *
 * AUTO-FIT: after the game renders, measures whether the game container's
 * natural content height exceeds the viewport space below it. If so, applies
 * CSS zoom to the container so ALL content (canvas, HUD, controls, text)
 * scales down proportionally to fit without scrolling.
 *
 * Why removing max-height from container matters:
 *   With max-height, CSS zoom scales content AND the constraint equally, so
 *   overflow persists (content × f > max-height × f when content > max-height).
 *   Without max-height, container height = content height, zoom scales both
 *   equally → no overflow, no scroll. autoFit computes the exact factor needed.
 *
 * Canvas re-render (no blur):
 *   After zoom f, wrap.clientWidth = f × naturalW.
 *   Set CGMobileScale = 1/f so cgMobileResize renders canvas at
 *   (1/f) × (f × naturalW) = naturalW px. Container zoom f then displays it
 *   at f × naturalW — correct size, full resolution.
 *
 * MANUAL BUTTON: cycles additional zoom-out levels on top of auto-fit.
 */
(function () {
  'use strict';

  var ZOOM_LEVELS = [1, 0.85, 0.7, 0.55];
  var LABELS      = ['1×', '0.85×', '0.7×', '0.55×'];
  var currentIndex = 0;
  var autoFitFactor = 1;
  var autoFitTimer  = null;

  function getContainer() {
    return document.getElementById('game-container') ||
           document.querySelector('.game-container');
  }

  /* ── Auto-fit ── */
  function autoFit() {
    if (window.innerWidth > 900) return;
    var container = getContainer();
    if (!container) return;

    // Reset to natural size so we can measure accurately
    container.style.zoom = '';
    window.CGMobileScale = 1;
    if (typeof window.cgMobileResize === 'function') window.cgMobileResize();

    requestAnimationFrame(function () {
      var naturalH = container.scrollHeight;
      var top      = container.getBoundingClientRect().top;
      var availH   = window.innerHeight - Math.max(top, 0) - 8;

      if (naturalH <= availH || availH < 60) {
        autoFitFactor = 1;
        return; // content already fits
      }

      var f = Math.max(0.35, availH / naturalH);
      autoFitFactor = f;

      container.style.zoom = f;
      window.CGMobileScale = 1 / f;
      if (typeof window.cgMobileResize === 'function') window.cgMobileResize();
    });
  }

  function scheduleAutoFit() {
    clearTimeout(autoFitTimer);
    autoFitTimer = setTimeout(autoFit, 500);
  }

  /* ── Manual zoom button ── */
  function applyZoom(level) {
    var container = getContainer();
    if (!container) return;
    var effective = autoFitFactor * level;
    container.style.zoom = effective;
    // CGMobileScale = 1/effective so canvas renders at natural resolution,
    // then zoom brings it to the correct display size
    window.CGMobileScale = 1 / effective;
    var label = document.getElementById('mobile-zoom-label');
    if (label) label.textContent = LABELS[currentIndex];
    if (typeof window.cgMobileResize === 'function') {
      window.cgMobileResize();
    }
  }

  function injectButton() {
    if (document.getElementById('mobile-zoom-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'mobile-zoom-btn';
    btn.setAttribute('aria-label', 'Zoom out');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="11" cy="11" r="8"/>' +
        '<line x1="8" y1="11" x2="14" y2="11"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
      '</svg>' +
      '<span id="mobile-zoom-label">1\u00d7</span>';
    document.body.appendChild(btn);
    return btn;
  }

  function init() {
    if (window.innerWidth > 900) return;
    if (!getContainer()) return;

    var btn = injectButton();
    if (btn) {
      btn.addEventListener('click', function () {
        currentIndex = (currentIndex + 1) % ZOOM_LEVELS.length;
        applyZoom(ZOOM_LEVELS[currentIndex]);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    init();
    scheduleAutoFit();
  });

  window.addEventListener('resize', function () {
    currentIndex = 0;
    scheduleAutoFit();
  });

}());
