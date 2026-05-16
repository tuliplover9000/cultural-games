/**
 * shared/mobile-scale.js — Mobile landscape game container scale
 * On mobile landscape (≤900px wide, height < width), measures #game-container
 * natural height and applies a CSS transform scale so it fits within the
 * available viewport height without scrolling.
 *
 * Works for both canvas-based and DOM-based games.
 * Portrait and desktop are completely unaffected.
 */
(function () {
  'use strict';

  function applyLandscapeScale() {
    var isMobileLandscape = window.innerWidth <= 900
      && window.innerHeight < window.innerWidth;

    if (!isMobileLandscape) {
      document.documentElement.style.removeProperty('--game-landscape-scale');
      return;
    }

    var container = document.getElementById('game-container');
    if (!container) return;

    var nav = document.querySelector('.site-nav, nav, header');
    var navHeight = nav ? nav.offsetHeight : 56;
    var availableH = window.innerHeight - navHeight;

    var naturalH = container.scrollHeight;
    if (naturalH <= availableH) return; // already fits

    var scale = availableH / naturalH;
    var clamped = Math.max(0.4, Math.min(1, scale));
    document.documentElement.style.setProperty('--game-landscape-scale', clamped);
  }

  window.addEventListener('orientationchange', function () {
    setTimeout(applyLandscapeScale, 300);
  });
  window.addEventListener('resize', applyLandscapeScale);
  document.addEventListener('DOMContentLoaded', applyLandscapeScale);
}());
