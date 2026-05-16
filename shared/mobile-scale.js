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

    var nav = document.querySelector('nav, header, .site-nav, .main-nav');
    var navHeight = nav ? nav.offsetHeight : 56;
    var availableH = window.innerHeight - navHeight;
    var availableW = window.innerWidth;

    var naturalH = container.scrollHeight;
    var naturalW = container.scrollWidth;

    if (naturalH <= availableH && naturalW <= availableW) return; // already fits

    var scaleH = availableH / naturalH;
    var scaleW = availableW / naturalW;
    var scale = Math.max(0.4, Math.min(1, Math.min(scaleH, scaleW)));
    document.documentElement.style.setProperty('--game-landscape-scale', scale);
  }

  window.addEventListener('orientationchange', function () {
    setTimeout(applyLandscapeScale, 300);
  });
  window.addEventListener('resize', applyLandscapeScale);
  document.addEventListener('DOMContentLoaded', applyLandscapeScale);
}());
