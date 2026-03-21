/**
 * entry.js — Rooms landing page logic.
 * Handles Create Room / Join Room flows, the guest name modal, and the
 * Public Room Browser (rb- prefix).
 */
(function () {
  'use strict';

  // ── Game display names and max players (for room browser) ────────────────
  var GAME_DISPLAY_NAMES = {
    'fanorona': 'Fanorona', 'hnefatafl': 'Hnefatafl', 'pachisi': 'Pachisi',
    'ganjifa': 'Ganjifa', 'tien-len': 'Tiến Lên', 'mahjong': 'Hong Kong Mahjong',
    'oware': 'Oware', 'o-an-quan': 'Ô Ăn Quan', 'pallanguzhi': 'Pallanguzhi',
    'patolli': 'Patolli', 'puluc': 'Puluc', 'bau-cua': 'Bầu Cua Tôm Cá',
  };
  var MAX_PLAYERS = {
    'fanorona': 2, 'hnefatafl': 2, 'o-an-quan': 2, 'oware': 2,
    'pallanguzhi': 2, 'patolli': 2, 'puluc': 2,
    'tien-len': 4, 'mahjong': 4, 'ganjifa': 4, 'pachisi': 4, 'bau-cua': 8,
  };

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
      var isPrivateCb = document.getElementById('rb-is-private');
      var isPrivate   = isPrivateCb ? isPrivateCb.checked : false;
      var roomNameEl = document.getElementById('rb-room-name');
      var roomName   = roomNameEl ? roomNameEl.value.trim() : '';
      Room.createRoom({ maxPlayers: maxPlayers, is_public: !isPrivate, gameName: null, roomName: roomName || null }, {
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
        if (window.Achievements) Achievements.checkAction('join_room');
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

  // ── Public Room Browser ───────────────────────────────────────────────────

  var elRbRefresh     = document.getElementById('rb-refresh');
  var elRbFilterGame  = document.getElementById('rb-filter-game');
  var elRbFilterSlots = document.getElementById('rb-filter-slots');
  var elRbLoading     = document.getElementById('rb-loading');
  var elRbList        = document.getElementById('rb-list');
  var elRbEmpty       = document.getElementById('rb-empty');
  var elRbError       = document.getElementById('rb-error');
  var elRbRetry       = document.getElementById('rb-retry');

  function formatRelativeTime(iso) {
    var diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    return Math.floor(diff / 3600) + ' hr ago';
  }

  function handleJoinRoom(code) {
    var joinInput = document.getElementById('rooms-join-code');
    var joinBtn   = document.getElementById('rooms-join-btn');
    if (!joinInput || !joinBtn) return;
    joinInput.value = code;
    joinBtn.click();
  }

  function buildRoomCard(room) {
    var li = document.createElement('li');
    li.className = 'rb-card';

    var gameName   = GAME_DISPLAY_NAMES[room.game_name] || (room.game_name || 'Unknown game');
    var hostName   = (room.player_names || {})[room.host_id] || 'Unknown host';
    var playerIds  = room.player_ids || [];
    var maxP       = MAX_PLAYERS[room.game_name] || 2;
    var playerCount = playerIds.length + ' / ' + maxP;
    var isFull     = playerIds.length >= maxP;
    var isPlaying  = room.status === 'playing';
    var canJoin    = !isPlaying && !isFull;

    var badgeClass = isPlaying ? 'rb-badge--playing' : 'rb-badge--waiting';
    var badgeText  = isPlaying ? 'In Progress'       : 'Waiting';

    var roomNameHtml = (room.room_name && room.room_name.trim())
      ? '<span class="rb-card__name">' + escHtml(room.room_name.trim()) + '</span>'
      : '';

    li.innerHTML =
      '<div class="rb-card__main">' +
        roomNameHtml +
        '<span class="rb-card__game">' + escHtml(gameName) + '</span>' +
        '<span class="rb-card__code">' + escHtml(room.code) + '</span>' +
        '<span class="rb-badge ' + badgeClass + '">' + badgeText + '</span>' +
      '</div>' +
      '<div class="rb-card__meta">' +
        '<span class="rb-card__players">' + escHtml(playerCount) + '</span>' +
        '<span class="rb-card__host">' + escHtml(hostName) + '</span>' +
        '<span class="rb-card__time">' + escHtml(formatRelativeTime(room.created_at)) + '</span>' +
      '</div>' +
      '<div class="rb-card__join">' +
        '<button class="btn btn-primary btn-sm"' + (canJoin ? '' : ' disabled') + '>' +
          (isPlaying ? 'In Progress' : (isFull ? 'Full' : 'Join')) +
        '</button>' +
      '</div>';

    if (canJoin) {
      li.querySelector('.rb-card__join .btn').addEventListener('click', function () {
        handleJoinRoom(room.code);
      });
    }

    return li;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderRoomList(rooms) {
    elRbList.innerHTML = '';
    elRbEmpty.hidden = rooms.length > 0;
    rooms.forEach(function(room) { elRbList.appendChild(buildRoomCard(room)); });
  }

  async function loadRooms() {
    elRbLoading.hidden = false;
    elRbError.hidden   = true;
    elRbList.innerHTML = '';
    elRbEmpty.hidden   = true;
    elRbRefresh.disabled = true;
    elRbRefresh.classList.add('rb-refresh--spinning');
    try {
      var filters = {
        gameName: elRbFilterGame.value || null,
        hasSlots: elRbFilterSlots.checked,
      };
      var rooms = await Room.fetchPublicRooms(filters);

      // Populate game filter dropdown from available games
      try {
        var availableGames = await Room.getAvailableGames();
        var currentVal = elRbFilterGame.value;
        // Keep "All games" option, replace the rest
        while (elRbFilterGame.options.length > 1) {
          elRbFilterGame.remove(1);
        }
        availableGames.forEach(function(gameKey) {
          var opt = document.createElement('option');
          opt.value = gameKey;
          opt.textContent = GAME_DISPLAY_NAMES[gameKey] || gameKey;
          elRbFilterGame.appendChild(opt);
        });
        // Restore selection if still valid
        if (currentVal) {
          elRbFilterGame.value = currentVal;
          if (elRbFilterGame.value !== currentVal) elRbFilterGame.value = '';
        }
      } catch (e) { /* non-fatal */ }

      renderRoomList(rooms);
    } catch (e) {
      elRbError.hidden = false;
      document.getElementById('rb-error-msg').textContent = 'Could not load rooms. Check your connection.';
    } finally {
      elRbLoading.hidden = true;
      elRbRefresh.disabled = false;
      elRbRefresh.classList.remove('rb-refresh--spinning');
    }
  }

  function initBrowser() {
    if (!elRbRefresh || !elRbFilterGame || !elRbList) return; // elements not present
    elRbRefresh.addEventListener('click', loadRooms);
    elRbFilterGame.addEventListener('change', loadRooms);
    elRbFilterSlots.addEventListener('change', loadRooms);
    elRbRetry.addEventListener('click', loadRooms);
    loadRooms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowser);
  } else {
    initBrowser();
  }

  // Auto-join from share link: rooms.html?join=CODE
  (function() {
    var params  = new URLSearchParams(location.search);
    var joinCode = params.get('join');
    if (!joinCode || !elJoinCode || !elJoinBtn) return;
    elJoinCode.value = joinCode.trim().toUpperCase().slice(0, 6);
    // Scroll to the join card so the user sees it, then trigger the join flow
    elJoinCode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elJoinBtn.click();
  }());

}());
