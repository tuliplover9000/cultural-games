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
      var selectedGame = window.pickerGetSelectedGame ? window.pickerGetSelectedGame() : null;
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
