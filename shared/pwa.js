/**
 * pwa.js — service-worker registration + "Add to Home Screen" prompt.
 *
 * Self-contained and fail-soft: if anything here throws, the site is exactly a
 * normal website. Registration is deferred to `load` so it never competes with
 * the first paint or the game boot.
 */
(function () {
  'use strict';

  /* ── 1. Register the service worker ───────────────────────────────────── */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        // If an updated worker is waiting, activate it on the next navigation
        // rather than leaving the user on stale files indefinitely.
        if (reg.waiting) reg.waiting.postMessage('skipWaiting');
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage('skipWaiting');
            }
          });
        });
      }).catch(function () { /* no offline support; site still works */ });
    });
  }

  /* ── 2. Install prompt (Android/Chrome) ───────────────────────────────── */
  // Chrome fires beforeinstallprompt when the app is installable; we stash it
  // and show our own button, because the browser's own prompt is suppressed
  // once preventDefault() is called.
  var deferred = null;
  var KEY = 'cg_install_dismissed';

  function dismissed() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function showButton() {
    if (document.getElementById('cg-install-btn') || dismissed()) return;
    var b = document.createElement('button');
    b.id = 'cg-install-btn';
    b.type = 'button';
    b.setAttribute('aria-label', 'Install Cultural Games');
    b.innerHTML = '<span aria-hidden="true">＋</span> Install app';
    b.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 74px);' +
      'z-index:1200;display:inline-flex;align-items:center;gap:.45em;padding:.55rem 1.1rem;' +
      'font:600 0.85rem/1 var(--font-body,system-ui);letter-spacing:.02em;cursor:pointer;' +
      'color:#1A0E06;background:var(--color-accent-gold,#C89B3C);border:0;border-radius:999px;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.45);';
    b.addEventListener('click', function () {
      b.remove();
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { remember(); deferred = null; });
    });
    // A second tap dismisses for good if they're not interested.
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); remember(); b.remove(); });
    document.body.appendChild(b);
    // Don't nag: auto-hide after 12s (it reappears next visit until installed).
    setTimeout(function () { if (b.isConnected) b.remove(); }, 12000);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showButton);
    } else {
      showButton();
    }
  });

  window.addEventListener('appinstalled', function () {
    remember();
    var b = document.getElementById('cg-install-btn');
    if (b) b.remove();
  });
}());
