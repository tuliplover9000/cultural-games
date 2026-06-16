/**
 * shared/force-landscape.js — Always present games in landscape.
 *
 * Phones (and in-app browsers like Instagram / TikTok, which lock the webview
 * to portrait and ignore device rotation) get the page rotated 90° via CSS
 * (see force-landscape.css, html.cg-landscape). The user holds the phone
 * sideways and the game fills the screen in landscape — no reliance on the
 * webview honouring an orientation change.
 *
 * Rule: rotate whenever the viewport is PORTRAIT on a phone-sized screen.
 *  - Real browser, phone rotated to landscape  -> viewport is landscape  -> no rotation (native).
 *  - Real browser / webview held upright        -> viewport is portrait   -> rotate.
 *  - IG/TikTok webview, phone rotated landscape  -> viewport STAYS portrait -> rotate (this is the fix).
 *
 * Include only on game pages, AFTER mobile-zoom.js. Toggling the class fires a
 * resize so the fit engine re-measures in the new orientation.
 */
(function () {
  'use strict';

  var MAX_MIN_SIDE = 900;  // only phones / small tablets

  /* OPT-IN GATE (testing phase): only active when ?ls=1 is in the URL or
     localStorage 'cg_ls' is set, so we can validate the feel on a real device
     before enabling it for everyone. Once confirmed, remove this gate so it is
     always on for phones. */
  function enabled() {
    try {
      if (/[?&]ls=1\b/.test(location.search)) { localStorage.setItem('cg_ls', '1'); return true; }
      if (/[?&]ls=0\b/.test(location.search)) { localStorage.removeItem('cg_ls'); return false; }
      return localStorage.getItem('cg_ls') === '1';
    } catch (e) { return /[?&]ls=1\b/.test(location.search); }
  }

  function shouldRotate() {
    if (!enabled()) return false;
    var w = window.innerWidth, h = window.innerHeight;
    return (h > w) && (Math.min(w, h) <= MAX_MIN_SIDE);
  }

  function apply() {
    var html = document.documentElement;
    var on   = shouldRotate();
    var was  = html.classList.contains('cg-landscape');
    if (on === was) return;
    html.classList.toggle('cg-landscape', on);
    // Let the fit engine (and any orientation-aware game) re-measure.
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function () { setTimeout(apply, 60); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  }
  window.addEventListener('load', apply);
}());
