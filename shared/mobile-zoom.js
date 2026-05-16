/**
 * shared/mobile-zoom.js — Mobile zoom-out button for game pages
 * Injects a floating button that cycles the game container through
 * zoom levels so players can shrink the board to fit their screen.
 * Only active on mobile (≤900px). Desktop: button hidden via CSS.
 */
(function () {
  'use strict';

  var ZOOM_LEVELS = [1, 0.85, 0.7, 0.55];
  var LABELS      = ['1×', '0.85×', '0.7×', '0.55×'];
  var currentIndex = 0;

  function getContainer() {
    return document.getElementById('game-container') ||
           document.querySelector('.game-container');
  }

  function applyZoom(level) {
    var container = getContainer();
    if (container) container.style.zoom = level;
    var label = document.getElementById('mobile-zoom-label');
    if (label) label.textContent = LABELS[currentIndex];
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
    if (!btn) return;

    btn.addEventListener('click', function () {
      currentIndex = (currentIndex + 1) % ZOOM_LEVELS.length;
      applyZoom(ZOOM_LEVELS[currentIndex]);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
}());
