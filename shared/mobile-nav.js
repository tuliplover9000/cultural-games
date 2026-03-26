/* =============================================================
   shared/mobile-nav.js — Bottom Tab Bar Navigation
   Exposes: window.MobileNav
   Depends on: window.MobileUtils (mobile.js loaded before this)
   ============================================================= */
(function () {
  'use strict';

  /* ── Inline SVG icons ── */
  var ICONS = {
    home: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    browse: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>',
    play: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>',
    more: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    /* drawer item icons */
    trophy: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 4H2v5c0 2.5 1.9 4.6 4.4 4.9.5 1.6 1.7 2.9 3.1 3.4V19H7v2h10v-2h-2.5v-1.7c1.5-.5 2.6-1.8 3.1-3.4C20.1 13.6 22 11.5 22 9V4h-5V2H7v2zM4 9V6h3v5.9C5.3 11.4 4 10.3 4 9zm16 0c0 1.3-1.3 2.4-3 2.9V6h3v3z"/></svg>',
    about: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>'
  };

  /* ── Route → tab mapping ── */
  function activeTab(path) {
    if (path.match(/\/(pages\/games\/|cachos\/|filipino-dama\/|xinjiang-fangqi\/|how-to-play\/)/)) return 'play';
    if (path.match(/\/pages\/rooms?(\.html)?/)) return 'play';
    if (path.match(/\/pages\/browse(\.html)?/)) return 'browse';
    if (path.match(/\/profile\//)) return 'profile';
    if (path.match(/\/pages\/account(\.html)?/)) return 'profile';
    if (path.match(/\/pages\/about(\.html)?/)) return 'more';
    if (path.match(/\/(index\.html)?$/)) return 'home';
    return 'home';
  }

  /* ── Resolve root-relative href from any page depth ── */
  function rootHref(abs) {
    // count directory depth from pathname
    var path = window.location.pathname;
    var depth = (path.match(/\//g) || []).length - 1;
    // clamp: root pages have depth 0 (served as /index.html or /)
    if (depth < 0) depth = 0;
    var prefix = '';
    for (var i = 0; i < depth; i++) prefix += '../';
    return prefix + abs;
  }

  /* ── Build the tab bar HTML ── */
  function buildBar() {
    var path = window.location.pathname;
    var cur  = activeTab(path);

    var tabs = [
      { id: 'home',    label: 'Home',    icon: ICONS.home,    href: rootHref('index.html') },
      { id: 'browse',  label: 'Browse',  icon: ICONS.browse,  href: rootHref('pages/browse.html') },
      { id: 'play',    label: 'Play',    icon: ICONS.play,    href: rootHref('pages/rooms.html') },
      { id: 'profile', label: 'Profile', icon: ICONS.profile, href: rootHref('profile/index.html') },
      { id: 'more',    label: 'More',    icon: ICONS.more,    href: null }
    ];

    var tabsHtml = tabs.map(function (t) {
      var active = t.id === cur ? ' mb-nav-active' : '';
      if (t.href) {
        return '<li><a class="mb-nav-tab' + active + '" href="' + t.href + '" data-tab="' + t.id + '">' +
          t.icon + '<span>' + t.label + '</span></a></li>';
      }
      return '<li><button class="mb-nav-tab' + active + '" data-tab="' + t.id + '">' +
        t.icon + '<span>' + t.label + '</span></button></li>';
    }).join('');

    var drawerItems = [
      { label: 'Tournament', icon: ICONS.trophy,   href: rootHref('pages/rooms.html') },
      { label: 'About',      icon: ICONS.about,    href: rootHref('pages/about.html') },
      { label: 'Discord',    icon: ICONS.discord,  href: 'https://discord.gg/culturalgames' },
      { label: 'Settings',   icon: ICONS.settings, href: rootHref('pages/account.html') }
    ];

    var drawerHtml = drawerItems.map(function (d) {
      var target = d.href.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return '<a class="mb-nav-drawer-item" href="' + d.href + '"' + target + '>' +
        d.icon + d.label + '</a>';
    }).join('');

    var bar = document.createElement('div');
    bar.className = 'mb-nav-bar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Mobile navigation');
    bar.innerHTML = '<ul class="mb-nav-tabs">' + tabsHtml + '</ul>';

    var overlay = document.createElement('div');
    overlay.className = 'mb-nav-drawer-overlay';

    var drawer = document.createElement('div');
    drawer.className = 'mb-nav-drawer';
    drawer.innerHTML = '<div class="mb-nav-drawer-handle"></div>' + drawerHtml;

    return { bar: bar, overlay: overlay, drawer: drawer };
  }

  /* ── Init ── */
  function init() {
    if (!window.MobileUtils || !window.MobileUtils.isMobile()) return;

    var els = buildBar();
    document.body.appendChild(els.overlay);
    document.body.appendChild(els.drawer);
    document.body.appendChild(els.bar);

    /* More button → toggle drawer */
    var moreBtn = els.bar.querySelector('[data-tab="more"]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleDrawer(els.drawer, els.overlay);
      });
    }

    /* Overlay click → close drawer */
    els.overlay.addEventListener('click', function () {
      closeDrawer(els.drawer, els.overlay);
    });

    /* Swipe drawer down to close */
    MobileUtils.swipeDetector(els.drawer, {
      onSwipeDown: function () { closeDrawer(els.drawer, els.overlay); }
    });

    /* Hook into FSMode if available */
    if (window.FSMode) {
      var origEnter = FSMode.onEnter;
      var origExit  = FSMode.onExit;
      FSMode.onEnter = function () {
        MobileNav.hide();
        if (typeof origEnter === 'function') origEnter();
      };
      FSMode.onExit = function () {
        MobileNav.show();
        if (typeof origExit === 'function') origExit();
      };
    }

    MobileNav._bar     = els.bar;
    MobileNav._drawer  = els.drawer;
    MobileNav._overlay = els.overlay;
  }

  function toggleDrawer(drawer, overlay) {
    var open = drawer.classList.contains('mb-nav-drawer-open');
    if (open) {
      closeDrawer(drawer, overlay);
    } else {
      drawer.classList.add('mb-nav-drawer-open');
      overlay.classList.add('mb-nav-drawer-open');
    }
  }

  function closeDrawer(drawer, overlay) {
    drawer.classList.remove('mb-nav-drawer-open');
    overlay.classList.remove('mb-nav-drawer-open');
  }

  /* ── Public API ── */
  window.MobileNav = {
    _bar: null,
    _drawer: null,
    _overlay: null,

    hide: function () {
      if (this._bar) this._bar.classList.add('mb-nav-hidden');
    },
    show: function () {
      if (this._bar) this._bar.classList.remove('mb-nav-hidden');
    },
    init: init
  };

  /* Auto-init after DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
