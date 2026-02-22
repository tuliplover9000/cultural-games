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
   * Run everything once the DOM is ready.
   */
  document.addEventListener('DOMContentLoaded', function () {
    highlightActiveLink();
    initMobileMenu();
  });
}());
