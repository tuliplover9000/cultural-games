/**
 * entry.js — Rooms landing page logic.
 * Handles Create Room / Join Room flows and the guest name modal.
 */
(function () {
  'use strict';

  var elLanding      = document.getElementById('rooms-landing');
  var elLoading      = document.getElementById('rooms-loading');
  var elLoadingMsg   = document.getElementById('rooms-loading-msg');

  var elCreateBtn    = document.getElementById('rooms-create-btn');
  var elCreateError  = document.getElementById('rooms-create-error');
  var elJoinBtn      = document.getElementById('rooms-join-btn');
  var elJoinCode     = document.getElementById('rooms-join-code');
  var elJoinError    = document.getElementById('rooms-join-error');

  var elNameModal    = document.getElementById('rooms-name-modal');
  var elNameInput    = document.getElementById('rooms-name-input');
  var elNameError    = document.getElementById('rooms-name-error');
  var elNameSubmit   = document.getElementById('rooms-name-submit');
  var elNameCancel   = document.getElementById('rooms-name-cancel');

  // ── Game Picker ───────────────────────────────────────────────────────────
  var selectedGame    = null;
  var elGameSearch    = document.getElementById('rooms-game-search');
  var elCultureFilter = document.getElementById('rooms-culture-filter');
  var elGameList      = document.getElementById('rooms-game-list');
  var elGameHint      = document.getElementById('rooms-game-hint');
  var games           = window.GAMES_DATA || [];

  // Populate culture dropdown
  var cultures = [];
  games.forEach(function (g) {
    if (cultures.indexOf(g.culture) === -1) cultures.push(g.culture);
  });
  cultures.sort().forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    elCultureFilter.appendChild(opt);
  });

  // Render game items
  games.forEach(function (g) {
    var item = document.createElement('div');
    item.className = 'rooms-game-item';
    item.dataset.key     = g.key;
    item.dataset.culture = g.culture;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.innerHTML =
      '<span class="rooms-game-item__name">' + g.name + '</span>' +
      '<span class="rooms-game-item__culture">' + g.culture + '</span>';
    item.addEventListener('click', function () {
      if (selectedGame === g.key) {
        selectedGame = null;
        item.classList.remove('selected');
        item.setAttribute('aria-selected', 'false');
        elGameHint.hidden = true;
      } else {
        elGameList.querySelectorAll('.rooms-game-item').forEach(function (el) {
          el.classList.remove('selected');
          el.setAttribute('aria-selected', 'false');
        });
        selectedGame = g.key;
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
        elGameHint.textContent = '\u2713 ' + g.name + ' selected — click again to deselect';
        elGameHint.hidden = false;
      }
    });
    elGameList.appendChild(item);
  });

  function filterGames() {
    var q = elGameSearch.value.trim().toLowerCase();
    var c = elCultureFilter.value;
    elGameList.querySelectorAll('.rooms-game-item').forEach(function (item) {
      var nameMatch    = !q || item.querySelector('.rooms-game-item__name').textContent.toLowerCase().indexOf(q) !== -1;
      var cultureMatch = !c || item.dataset.culture === c;
      item.hidden = !(nameMatch && cultureMatch);
    });
  }
  elGameSearch.addEventListener('input', filterGames);
  elCultureFilter.addEventListener('change', filterGames);

  // Max-players toggle
  var maxPlayers = 4;
  document.querySelectorAll('.rooms-player-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.rooms-player-btn').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      maxPlayers = parseInt(btn.dataset.n, 10);
    });
  });

  // ── Utility ───────────────────────────────────────────────────────────────

  function showLoading(msg) {
    elLanding.hidden = true;
    elLoading.hidden = false;
    elLoadingMsg.textContent = msg || 'Loading…';
  }

  function showLanding() {
    elLoading.hidden = true;
    elLanding.hidden = false;
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError(el) {
    el.textContent = '';
    el.hidden = true;
  }

  // ── Name prompt ───────────────────────────────────────────────────────────
  // Calls then(name) once we have a confirmed name; shows modal if none yet.

  function requireName(then) {
    // Authenticated users: use their profile name silently
    if (window._user && window._user.display_name) {
      Room.setPlayerName(window._user.display_name);
      then(window._user.display_name);
      return;
    }
    // Guests: always show the modal so they can confirm / change their name
    var stored = localStorage.getItem('cg_name') || '';
    elNameInput.value = stored;
    clearError(elNameError);
    elNameModal.hidden = false;
    elNameInput.focus();
    if (stored) elNameInput.select(); // highlight so they can replace easily

    elNameSubmit.onclick = function () {
      var v = elNameInput.value.trim();
      if (!v) { showError(elNameError, 'Please enter a name to continue.'); return; }
      Room.setPlayerName(v);
      elNameModal.hidden = true;
      then(v);
    };
    elNameCancel.onclick = function () {
      elNameModal.hidden = true;
    };
  }

  // Enter key in name input
  elNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') elNameSubmit.click();
  });

  // ── Create Room ───────────────────────────────────────────────────────────

  elCreateBtn.addEventListener('click', function () {
    clearError(elCreateError);
    requireName(function () {
      showLoading('Creating room…');
      Room.createRoom({ maxPlayers: maxPlayers, game: selectedGame }, {
        onError: function (msg) {
          showLanding();
          showError(elCreateError, msg);
        },
      }).then(function (result) {
        if (!result) return; // error already shown via callback
        window.location.href = 'room.html?id=' + encodeURIComponent(result.roomId);
      });
    });
  });

  // ── Join Room ─────────────────────────────────────────────────────────────

  elJoinBtn.addEventListener('click', function () {
    clearError(elJoinError);
    var code = elJoinCode.value.trim().toUpperCase();
    if (!code) { showError(elJoinError, 'Please enter a room code.'); return; }
    if (code.length !== 6) { showError(elJoinError, 'Room codes are 6 characters (e.g. BIRD42).'); return; }

    requireName(function () {
      showLoading('Joining room…');
      Room.joinRoom(code, {
        onError: function (msg) {
          showLanding();
          showError(elJoinError, msg);
        },
      }).then(function (result) {
        if (!result) return;
        window.location.href = 'room.html?id=' + encodeURIComponent(result.roomId);
      });
    });
  });

  // Enter key in code input
  elJoinCode.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') elJoinBtn.click();
  });

  // Auto-uppercase code input as user types
  elJoinCode.addEventListener('input', function () {
    var sel = elJoinCode.selectionStart;
    elJoinCode.value = elJoinCode.value.toUpperCase();
    elJoinCode.setSelectionRange(sel, sel);
  });

}());
