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

  /* ── 2. One-time "Add to your phone" sheet ────────────────────────────── */
  // Shown ONCE, ever. The flag is written the moment it appears, so ignoring it
  // is as final as dismissing it — no one gets nagged twice.
  //
  // Two flavours, because the platforms differ:
  //   • Android/Chrome fires `beforeinstallprompt`; we stash it and let our
  //     Install button call the real browser prompt.
  //   • iOS Safari has NO install API at all — the only route is
  //     Share → "Add to Home Screen" — so there we show those instructions.
  //
  // Force it open for QA with ?pwaprompt=1 (or ?pwaprompt=ios to preview the
  // iPhone wording on any device); that bypasses the once-only flag.

  var KEY      = 'cg_install_prompted';
  var deferred = null;
  var shown    = false;

  var force = (function () {
    var m = /[?&]pwaprompt=([a-z0-9]+)/i.exec(location.search);
    return m ? m[1].toLowerCase() : null;
  })();

  function alreadyPrompted() {
    if (force) return false;
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markPrompted() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           navigator.standalone === true;
  }
  function isIOS() {
    if (force === 'ios') return true;
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           // iPadOS 13+ reports as Mac but has touch
           (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  }
  function isPhoneish() {
    if (force) return true;
    return window.innerWidth <= 900 ||
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function show(mode) {                       // mode: 'prompt' | 'ios'
    if (shown || alreadyPrompted() || isStandalone() || !document.body) return;
    shown = true;
    markPrompted();                           // once means once, even if ignored

    var wrap = document.createElement('div');
    wrap.id = 'cg-install-sheet';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'cg-install-title');
    wrap.innerHTML =
      '<div class="cg-is__backdrop"></div>' +
      '<div class="cg-is__panel">' +
        '<img class="cg-is__icon" src="/assets/pwa/icon-192.png" alt="" aria-hidden="true">' +
        '<h2 class="cg-is__title" id="cg-install-title">Add to your phone</h2>' +
        '<p class="cg-is__body">' +
          (mode === 'ios'
            ? 'Tap <strong>Share</strong> in Safari, then <strong>“Add to Home Screen”</strong> — ' +
              'the games open full-screen and work offline.'
            : 'Install Cultural Games for a full-screen board, offline play, and ' +
              'one-tap access from your home screen.') +
        '</p>' +
        '<div class="cg-is__actions">' +
          (mode === 'ios'
            ? '<button class="cg-is__btn cg-is__btn--go" data-act="close" type="button">Got it</button>'
            : '<button class="cg-is__btn cg-is__btn--go" data-act="install" type="button">Install</button>' +
              '<button class="cg-is__btn cg-is__btn--ghost" data-act="close" type="button">Not now</button>') +
        '</div>' +
      '</div>';

    var css = document.createElement('style');
    css.textContent =
      '#cg-install-sheet{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-end;justify-content:center}' +
      '#cg-install-sheet .cg-is__backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}' +
      '#cg-install-sheet .cg-is__panel{position:relative;width:100%;max-width:420px;margin:0 10px 10px;' +
        'padding:20px 20px calc(20px + env(safe-area-inset-bottom,0px));text-align:center;' +
        'background:var(--color-surface,#221709);color:var(--color-text,#F2E7D3);' +
        'border:1px solid var(--color-border,rgba(200,155,60,.35));border-radius:16px;' +
        'box-shadow:0 -8px 40px rgba(0,0,0,.6);animation:cgIsUp .28s cubic-bezier(.2,.8,.3,1) both}' +
      '@keyframes cgIsUp{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}' +
      '@media (prefers-reduced-motion: reduce){#cg-install-sheet .cg-is__panel{animation:none}}' +
      '#cg-install-sheet .cg-is__icon{width:56px;height:56px;border-radius:12px;margin:0 auto 10px;display:block}' +
      '#cg-install-sheet .cg-is__title{font-family:var(--font-display,Georgia,serif);font-size:1.15rem;margin:0 0 6px}' +
      '#cg-install-sheet .cg-is__body{font-size:.88rem;line-height:1.55;color:var(--color-text-muted,#B9A584);margin:0 0 16px}' +
      '#cg-install-sheet .cg-is__actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
      '#cg-install-sheet .cg-is__btn{flex:1 1 120px;min-height:44px;padding:.6rem 1rem;font:600 .9rem/1 inherit;' +
        'border-radius:999px;cursor:pointer;border:1px solid transparent}' +
      '#cg-install-sheet .cg-is__btn--go{background:var(--color-accent-gold,#C89B3C);color:#1A0E06}' +
      '#cg-install-sheet .cg-is__btn--ghost{background:transparent;color:var(--color-text-muted,#B9A584);' +
        'border-color:var(--color-border,rgba(200,155,60,.35))}';
    wrap.appendChild(css);

    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    wrap.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (e.target.className === 'cg-is__backdrop' || act === 'close') { close(); return; }
      if (act === 'install') {
        close();
        if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); }
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    var go = wrap.querySelector('.cg-is__btn--go');
    if (go) go.focus();
  }

  /* Android/Chrome: the browser tells us when it's installable. */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (!isPhoneish()) return;                 // "add to your PHONE"
    // Let them look around first — a sheet on arrival is just an ad.
    setTimeout(function () { show('prompt'); }, 4000);
  });

  /* iOS Safari: no event will ever fire, so decide for ourselves. */
  window.addEventListener('load', function () {
    if (force) { show(force === 'ios' ? 'ios' : 'prompt'); return; }
    if (isIOS() && isPhoneish() && !isStandalone()) {
      setTimeout(function () { show('ios'); }, 6000);
    }
  });

  window.addEventListener('appinstalled', function () {
    markPrompted();
    var s = document.getElementById('cg-install-sheet');
    if (s) s.remove();
  });
}());
