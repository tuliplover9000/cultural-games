/**
 * cookie-consent.js — first-visit analytics consent gate.
 *
 * Google Analytics is loaded in each page's <head> with Consent Mode defaulting
 * analytics_storage to 'denied' (see consent-mode-ga.js). This banner lets the
 * visitor make an explicit choice; only on Accept do we grant analytics consent.
 * Essential cookies (login session) are exempt and always allowed.
 *
 * Choice is stored in localStorage under 'cg_analytics_consent' ('granted' |
 * 'denied'). The banner only appears until a choice is made. No dependencies.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cg_analytics_consent';

  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    if (value === 'granted' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
    }
  }

  function getPrivacyPath() {
    /* Resolve privacy.html relative to the current page (any nesting depth). */
    var path = window.location.pathname.replace(/\\/g, '/');
    var dir  = path.replace(/\/[^/]*$/, '') || '/';
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
    p.innerHTML = 'We use essential cookies to keep you logged in, and — only with '
      + 'your consent — anonymous analytics to improve the site. See our '
      + '<a href="' + getPrivacyPath() + '">Privacy Policy</a>.';

    var actions = document.createElement('div');
    actions.id = 'cookie-consent-actions';

    var decline = document.createElement('button');
    decline.id = 'cookie-consent-decline';
    decline.type = 'button';
    decline.textContent = 'Decline';

    var accept = document.createElement('button');
    accept.id = 'cookie-consent-btn';   // keep id for existing CSS styling
    accept.type = 'button';
    accept.textContent = 'Accept';

    function close() { if (banner.parentNode) banner.parentNode.removeChild(banner); }
    accept.addEventListener('click', function ()  { setConsent('granted'); close(); });
    decline.addEventListener('click', function () { setConsent('denied');  close(); });

    actions.appendChild(decline);
    actions.appendChild(accept);
    banner.appendChild(p);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var choice = null;
    try { choice = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    // Re-apply a prior 'granted' choice in case the head snippet ran before the
    // value was readable (defensive; the inline snippet also does this).
    if (choice === 'granted') { setConsent('granted'); return; }
    if (choice === 'denied') return;
    inject();
  });

  // Public API so a "Manage cookie preferences" control (e.g. on the Privacy
  // page) can let the visitor change or withdraw their analytics consent.
  window.CookieConsent = {
    open: function () { if (!document.getElementById('cookie-consent')) inject(); },
    current: function () { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } },
  };

}());
