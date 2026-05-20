/**
 * shared/mobile-zoom.js — Mobile zoom-out button + auto-fit for game pages
 *
 * AUTO-FIT: on load and resize, measures whether the game container content
 * overflows the available viewport height. If it does, applies CSS zoom to
 * the container so everything (canvas, HUD, controls) scales proportionally.
 *
 * Canvas re-render math:
 *   zoom factor f = availH / scrollH
 *   After container.style.zoom = f, wrap.clientWidth = f × naturalW
 *   To avoid blurry canvas: CGMobileScale = 1/f so cgMobileResize renders
 *   canvas at (1/f) × (f × naturalW) = naturalW px, then zoom f displays it
 *   at f × naturalW — correct size, no blur.
 *
 * MANUAL BUTTON: floating pill that lets user cycle through additional
 * zoom-out levels on top of the auto-fit baseline.
 */
(function () {
  'use strict';

  var ZOOM_LEVELS = [1, 0.85, 0.7, 0.55];
  var LABELS      = ['1×', '0.85×', '0.7×', '0.55×'];
  var currentIndex = 0;
  var autoFitFactor = 1;   // set by autoFit, used as baseline
  var autoFitTimer  = null;

  function getContainer() {
    return document.getElementById('game-container') ||
           document.querySelector('.game-container');
  }

  /* ── Auto-fit: scale content to fill (not overflow) the viewport ── */
  function autoFit() {
    if (window.innerWidth > 900) return;
    var container = getContainer();
    if (!container) return;

    // Reset to natural size so scrollHeight is accurate
    container.style.zoom = '';
    window.CGMobileScale = 1;
    if (typeof window.cgMobileResize === 'function') window.cgMobileResize();

    requestAnimationFrame(function () {
      var naturalH = container.scrollHeight;
      var top      = container.getBoundingClientRect().top;
      var availH   = window.innerHeight - top - 8; // 8px bottom margin

      if (naturalH <= availH || availH < 60) {
        autoFitFactor = 1;
        return; // already fits
      }

      var f = Math.max(0.35, availH / naturalH);
      autoFitFactor = f;

      container.style.zoom = f;
      // Canvas games: render at 1/f scale so zoom f brings it back to natural size
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
    // Apply on top of autoFit baseline
    var effective = autoFitFactor * level;
    container.style.zoom = effective;
    window.CGMobileScale = (1 / autoFitFactor) * level;
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
    currentIndex = 0; // reset manual zoom on resize
    scheduleAutoFit();
  });

}());
