/**
 * navigation.js
 * Handles shared navigation behavior:
 *  - Active link highlighting based on current URL
 *  - Mobile hamburger menu toggle
 */

(function () {
  'use strict';

  /**
   * Mark the nav link that matches the current page as active.
   * Compares the link's href pathname to the current window pathname.
   */
  function highlightActiveLink() {
    var links = document.querySelectorAll('.nav-link');
    var currentPath = window.location.pathname;

    links.forEach(function (link) {
      var linkPath = new URL(link.href, window.location.origin).pathname;

      // Normalize trailing slashes and index.html
      var normalizedCurrent = currentPath.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
      var normalizedLink    = linkPath.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';

      if (normalizedCurrent === normalizedLink) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  /**
   * Wire up the hamburger button to toggle the mobile nav menu.
   */
  function initMobileMenu() {
    var hamburger = document.querySelector('.nav-hamburger');
    var navLinks  = document.querySelector('.nav-links');

    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', function () {
      var isOpen = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', String(!isOpen));
      navLinks.classList.toggle('nav-links--open', !isOpen);
    });

    // Close menu when a link is clicked (useful on mobile)
    navLinks.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('nav-links--open');
      });
    });

    // Close menu when clicking outside the nav
    document.addEventListener('click', function (e) {
      var nav = document.querySelector('.site-nav');
      if (nav && !nav.contains(e.target)) {
        hamburger.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('nav-links--open');
      }
    });
  }

  /**
   * Turn the "Browse Games" header link into a dropdown: All Games + Collections
   * (with a link per collection). Built here so it applies to every page without
   * editing each file's static nav. Desktop header nav only — on phones the header
   * links are hidden and the bottom tab bar is used instead.
   */
  var COLLECTIONS = [
    ['/collections/',                          'All collections'],
    ['/collections/ancient-board-games/',      'Ancient Board Games'],
    ['/collections/african-board-games/',      'African Board Games'],
    ['/collections/asian-board-games/',        'Asian Board Games'],
    ['/collections/traditional-card-games/',   'Card Games'],
    ['/collections/two-player-strategy-games/','Two-Player Strategy']
  ];

  function initBrowseDropdown() {
    var navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    var browseLink = null;
    navLinks.querySelectorAll('a.nav-link').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (/browse\.html/.test(href) || /browse\s*games/i.test(a.textContent)) browseLink = a;
    });
    if (!browseLink) return;
    var li = browseLink.closest('li');
    if (!li || li.classList.contains('nav-dropdown')) return;

    // Fold any standalone "Collections" nav item into this dropdown.
    navLinks.querySelectorAll('a.nav-link').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var txt  = a.textContent.trim();
      if ((/\/collections\/?$/.test(href) || /^collections$/i.test(txt))) {
        var cli = a.closest('li');
        if (cli && cli !== li) cli.remove();
      }
    });

    li.classList.add('nav-dropdown');

    var menu = document.createElement('div');
    menu.className = 'nav-dropdown__menu';
    menu.setAttribute('role', 'menu');
    var html = '<a class="nav-dropdown__item nav-dropdown__item--all" role="menuitem" href="/pages/browse.html">All Games</a>' +
               '<span class="nav-dropdown__label">Collections</span>';
    COLLECTIONS.forEach(function (c) {
      html += '<a class="nav-dropdown__item" role="menuitem" href="' + c[0] + '">' + c[1] + '</a>';
    });
    menu.innerHTML = html;
    li.appendChild(menu);

    var caret = document.createElement('span');
    caret.className = 'nav-dropdown__caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    browseLink.appendChild(caret);

    browseLink.setAttribute('aria-haspopup', 'true');
    browseLink.setAttribute('aria-expanded', 'false');

    function setOpen(open) {
      li.classList.toggle('open', open);
      browseLink.setAttribute('aria-expanded', String(open));
    }

    // Pressing "Browse Games" opens the menu (rather than navigating away); the
    // "All Games" item inside goes to the full browse page. Hover also opens it
    // on desktop (CSS).
    browseLink.addEventListener('click', function (e) {
      e.preventDefault();
      setOpen(!li.classList.contains('open'));
    });
    document.addEventListener('click', function (e) {
      if (!li.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /**
   * Run everything once the DOM is ready.
   */
  document.addEventListener('DOMContentLoaded', function () {
    highlightActiveLink();
    initMobileMenu();
    initBrowseDropdown();
  });
}());
