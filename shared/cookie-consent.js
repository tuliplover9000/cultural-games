/**
 * cookie-consent.js — bottom banner shown once on first visit.
 *
 * Checks localStorage for 'cookie_consent_accepted' on DOMContentLoaded.
 * If not set, injects the banner. Dismissal sets the key and removes the banner.
 * No external dependencies. Pure vanilla JS. IIFE pattern.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cookie_consent_accepted';

  function getPrivacyPath() {
    /* Resolve the path to privacy.html relative to the current page.
       Works for pages at any nesting depth by counting path segments. */
    var path = window.location.pathname.replace(/\\/g, '/');
    /* Strip trailing filename — keep only the directory */
    var dir  = path.replace(/\/[^/]*$/, '') || '/';
    /* Count how many segments deep we are below the site root.
       Each segment needs one '../' to climb back. */
    var depth = dir.replace(/^\//, '').split('/').filter(Boolean).length;
    var prefix = depth > 0 ? (new Array(depth + 1).join('../')) : '';
    return prefix + 'pages/privacy.html';
  }

  function inject() {
    var banner = document.createElement('div');
    banner.id = 'cookie-consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');

    var p = document.createElement('p');
    p.innerHTML = 'We use cookies for login sessions and anonymous analytics. '
      + 'By continuing to use this site, you agree to our '
      + '<a href="' + getPrivacyPath() + '">Privacy Policy</a>.';

    var btn = document.createElement('button');
    btn.id = 'cookie-consent-btn';
    btn.type = 'button';
    btn.textContent = 'Got it';

    btn.addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });

    banner.appendChild(p);
    banner.appendChild(btn);
    document.body.appendChild(banner);
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (e) {}
    inject();
  });

}());
