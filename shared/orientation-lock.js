/**
 * shared/orientation-lock.js — Force landscape when playing a game
 *
 * Tries screen.orientation.lock('landscape-primary') on page load.
 * Works on Android Chrome / Firefox automatically.
 * Silently fails on iOS Safari (non-PWA) — the CSS rotate-prompt
 * defined in mobile-landscape.css acts as a visual fallback there.
 *
 * When the lock succeeds the browser rotates the viewport, so
 * window.innerWidth/innerHeight reflect landscape values and all
 * canvas resize handlers work normally.
 */
(function () {
  'use strict';

  function tryLock() {
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') return;
    screen.orientation.lock('landscape-primary').then(function () {
      // Success — trigger a resize so canvas games re-render at landscape size
      window.dispatchEvent(new Event('resize'));
    }).catch(function () {
      // Lock denied (iOS Safari, desktop, etc.) — rotate-prompt CSS handles it
    });
  }

  // Run as early as possible and again after load in case browser needs it later
  tryLock();
  window.addEventListener('load', tryLock);
}());
