/**
 * play-with-friend.js - "Play with a Friend" CTA banner (Phase C).
 * Injects a banner below the game canvas on every game page.
 * Suppressed when running inside a room iframe.
 *
 * Each game page calls: PWF.init('game-key')
 */
(function () {
  'use strict';

  // Suppress inside room iframes
  if (window.parent !== window) return;

  function init(gameKey) {
    var mount = document.getElementById('pwf-mount');
    if (!mount || !gameKey) return;

    // Rooms page URL - works from pages/games/ depth (../../pages/rooms.html)
    var roomsUrl = '../../pages/rooms.html?create=' + encodeURIComponent(gameKey);

    mount.innerHTML =
      '<div class="pwf-banner" id="pwf-banner">' +
        '<div class="pwf-banner__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="9" cy="7" r="4"/>' +
            '<path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>' +
            '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>' +
            '<path d="M21 21v-2a4 4 0 0 0-3-3.87"/>' +
          '</svg>' +
        '</div>' +
        '<div class="pwf-banner__content">' +
          '<p class="pwf-banner__title">Play with a friend</p>' +
          '<p class="pwf-banner__sub">Create a room and share the link - they can join in seconds.</p>' +
        '</div>' +
        '<a href="' + roomsUrl + '" class="pwf-banner__btn" id="pwf-create-btn">' +
          'Create Room \u2192' +
        '</a>' +
      '</div>';
  }

  window.PWF = { init: init };
}());
