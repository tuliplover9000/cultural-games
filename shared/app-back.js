/**
 * shared/app-back.js — Back button for installed-app (standalone) mode.
 *
 * Launched from the Home Screen the site runs with display:"standalone", which
 * means NO browser chrome — and therefore no back arrow. Game pages carry a
 * "← Back to Browse" link, but that is a fixed destination, and the rest of the
 * site (how-to-play, collections, rooms, account, about) has no way back at
 * all, so a player who taps through can end up stranded with only "force quit"
 * as an exit.
 *
 * Deliberately position:fixed rather than living inside .site-nav: the nav
 * slides away on scroll (.nav--hidden), and an escape hatch that disappears
 * when you scroll is not an escape hatch. It sits inside the safe-area insets
 * so it clears the iPhone status bar and the rounded corners.
 *
 * Shown ONLY in standalone mode — in a normal browser tab the browser's own
 * back button already does this and a second one would be clutter.
 */
(function () {
  'use strict';

  var HOME = '/index.html';

  function isStandalone() {
    // navigator.standalone is the iOS Safari signal for a Home Screen app and
    // is the one that matters on iPhone; the media queries cover Android and
    // desktop installs (and newer iOS, which supports them too).
    try {
      if (navigator.standalone === true) return true;
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.matchMedia('(display-mode: fullscreen)').matches ||
             window.matchMedia('(display-mode: minimal-ui)').matches;
    } catch (e) {
      return navigator.standalone === true;
    }
  }

  // The launch page itself has nothing to go back to.
  function isStartPage() {
    var p = location.pathname.replace(/\/index\.html$/, '/');
    return p === '/' || p === '';
  }

  function build() {
    var btn = document.createElement('button');
    btn.id = 'cg-app-back';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Go back');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M15 18l-6-6 6-6"/>' +
      '</svg>';

    btn.addEventListener('click', function () {
      // history.length is the only signal available for "is there anywhere to
      // go back to". It never shrinks, so after stepping back to the first
      // entry it still reads > 1 — hence the home fallback rather than leaving
      // the button dead.
      if (history.length > 1) {
        history.back();
      } else {
        location.href = HOME;
      }
    });
    return btn;
  }

  function init() {
    if (!isStandalone() || isStartPage()) return;
    if (document.getElementById('cg-app-back')) return;
    document.body.appendChild(build());
    document.documentElement.classList.add('cg-standalone');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
