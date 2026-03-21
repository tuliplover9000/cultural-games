/**
 * ingame.js — In-game wrapper controller (Phase G).
 * Handles: iframe embedding, player strip, chat sidebar toggle,
 * postMessage bridge, spectator mode, dual-instance layout.
 *
 * Exposes window.Ingame for lobby.js and endscreen.js to call.
 */
(function () {
  'use strict';

  // #ingame-boards now lives inside the lobby center panel
  var elBoards       = document.getElementById('ingame-boards');
  var elQuitBtn      = document.getElementById('ingame-quit-btn');
  var elGamesSection = document.getElementById('lobby-games-section');
  var elCenterTitle  = document.getElementById('center-panel-title');
  var elCenterPanel  = document.querySelector('.room-panel--games');

  var _winHandled  = {};   // instanceId → true, prevents double-processing
  var _launchGen   = 0;   // incremented on each launch(); rejects stale iframe messages

  // ── Game name lookup ───────────────────────────────────────────────────────
  var GAME_NAMES = {
    'tien-len': 'Tiến Lên', 'mahjong': 'Hong Kong Mahjong',
    'oware': 'Oware', 'o-an-quan': 'Ô Ăn Quan', 'fanorona': 'Fanorona',
    'pallanguzhi': 'Pallanguzhi', 'patolli': 'Patolli', 'puluc': 'Puluc',
    'bau-cua': 'Bầu Cua Tôm Cá', 'hnefatafl': 'Hnefatafl', 'pachisi': 'Pachisi',
    'ganjifa': 'Ganjifa',
  };

  // Games where AI fill doesn't apply (group/betting games)
  var NO_AI_GAMES = { 'bau-cua': true };
  function gameLabel(key) { return GAME_NAMES[key] || key; }

  // Max players per game (for AI seat calculation)
  var GAME_MAX_PLAYERS = {
    'tien-len': 4, 'mahjong': 4, 'ganjifa': 4,
    'oware': 2, 'o-an-quan': 2, 'fanorona': 2,
    'pallanguzhi': 2, 'patolli': 2, 'puluc': 2, 'hnefatafl': 2, 'pachisi': 4,
  };

  // Games with named seat roles (role string → seat index by array position)
  var GAME_SEAT_ROLES = {
    'hnefatafl': ['attacker', 'defender'],
  };

  // ── Build game URL ─────────────────────────────────────────────────────────
  function buildSrc(room, instanceId) {
    var game    = room.selected_game;
    var roles   = room.player_roles || {};
    var ids     = room.player_ids   || [];
    var myPid   = Room.getPlayerId();
    var myRole  = roles[myPid] || 'player';
    var mode    = room.game_mode || 'normal';

    // Work out which players are in this instance
    var allPlayers = ids.filter(function(p){ return roles[p] !== 'spectator'; });

    // For dual: split into two halves
    var instancePlayers;
    if (room.dual_instance) {
      var half = Math.ceil(allPlayers.length / 2);
      instancePlayers = instanceId === '0' ? allPlayers.slice(0, half) : allPlayers.slice(half);
    } else {
      instancePlayers = allPlayers;
    }

    var seatIdx = instancePlayers.indexOf(myPid);
    // Spectators have seatIdx = -1
    if (myRole === 'spectator') seatIdx = -1;

    // Games with named roles (e.g. hnefatafl attacker/defender): derive seat from role string
    var seatRolesList = GAME_SEAT_ROLES[game];
    var gameSeat;
    if (seatRolesList) {
      gameSeat = myRole === 'spectator' ? -1 : seatRolesList.indexOf(myRole);
      if (gameSeat < 0 && myRole !== 'spectator') gameSeat = seatIdx; // fallback
    } else {
      // 1v1 mode: second player maps to game seat 2 (tien-len twoPlayer convention: seats 0 & 2)
      gameSeat = seatIdx;
      if (mode === '1v1' && seatIdx === 1) gameSeat = 2;
    }

    // AI seats: fill remaining slots up to game max.
    // Group/betting games (like bau-cua) and Pachisi (human-only in rooms)
    // never use AI fill. 1v1 mode never gets AI fill.
    var NO_AI_ROOM = { 'bau-cua': true, 'pachisi': true };
    var aiSeats = [];
    if (!NO_AI_ROOM[game] && mode !== '1v1') {
      var maxP = GAME_MAX_PLAYERS[game] || 2;
      if (instancePlayers.length < maxP) {
        for (var i = instancePlayers.length; i < maxP; i++) aiSeats.push(i);
      }
    }

    var params = new URLSearchParams({
      roomId:   room.id,
      roomCode: room.code,
      seat:     gameSeat,
      role:     myRole,
      instance: instanceId,
      gen:      _launchGen,
      mode:     mode,
      aiSeats:  aiSeats.join(','),
      isHost:   (myPid === room.host_id) ? '1' : '0',
    });

    return 'games/' + game + '.html?' + params.toString();
  }

  // ── postMessage bridge ─────────────────────────────────────────────────────
  window.addEventListener('message', function(e) {
    if (!e.data) return;

    // Game iframe reports a move — forward to the other iframe and persist
    if (e.data.type === 'game-sync') {
      if (String(e.data.gen) !== String(_launchGen)) return;
      var instanceId = e.data.instance || '0';
      // Don't overwrite finished status with a state-sync that raced endGameWithWin
      if (_winHandled[instanceId]) return;
      // Forward to all iframes except sender
      var frames = elBoards ? elBoards.querySelectorAll('iframe') : [];
      frames.forEach(function(fr) {
        if (fr.contentWindow !== e.source) {
          fr.contentWindow.postMessage({ type: 'room-state', data: e.data.data }, '*');
        }
      });
      // Persist to Supabase (non-blocking)
      Room.updateGameInstance(instanceId, e.data.data);
    }

    // Game reports a win (guard against duplicate messages from multiple iframes)
    if (e.data.type === 'game-win') {
      if (String(e.data.gen) !== String(_launchGen)) return;
      var winInst = e.data.instance || '0';
      if (!_winHandled[winInst]) {
        _winHandled[winInst] = true;
        handleWin(winInst, e.data.winnerSeat, e.data.score);
      }
    }

    // Game iframe is ready — push latest board_state so reconnecting players sync up
    if (e.data.type === 'game-ready') {
      if (String(e.data.gen) !== String(_launchGen)) return;
      var readyInst = e.data.instance || '0';
      var readyIdx  = parseInt(readyInst, 10);
      var readyRoom = Room.currentRoom();
      if (readyRoom) {
        var insts = readyRoom.game_instances || [];
        var inst  = insts[readyIdx];
        if (inst && inst.board_state && inst.status !== 'finished' && e.source) {
          e.source.postMessage({ type: 'room-state', data: inst.board_state }, '*');
        }
      }
    }
  });

  function handleWin(instanceId, winnerSeat, score) {
    var room    = Room.currentRoom();
    if (!room) return;

    var roles   = room.player_roles || {};
    var ids     = room.player_ids   || [];
    var players = ids.filter(function(p){ return roles[p] !== 'spectator'; });

    // In dual mode, figure out which half these players belong to
    var instancePlayers;
    if (room.dual_instance) {
      var half = Math.ceil(players.length / 2);
      instancePlayers = instanceId === '0' ? players.slice(0, half) : players.slice(half);
    } else {
      instancePlayers = players;
    }

    // For role-based games (e.g. hnefatafl), resolve winner by role string,
    // not by join-order index, since the host can assign roles freely.
    var winnerPid;
    var seatRolesList = GAME_SEAT_ROLES[room.selected_game];
    if (seatRolesList) {
      var winnerRole = seatRolesList[winnerSeat];
      winnerPid = instancePlayers.find(function(p) { return roles[p] === winnerRole; }) || null;
    } else {
      winnerPid = instancePlayers[winnerSeat] || null;
    }

    Room.endGameWithWin(instanceId, winnerPid);
  }

  // ── Launch — shows game inline in the lobby center panel ──────────────────
  function launch(room) {
    if (!elBoards) return;

    // Swap center panel: hide game selector, show board frame
    if (elGamesSection) elGamesSection.hidden = true;
    if (elCenterTitle)  elCenterTitle.textContent = gameLabel(room.selected_game);
    if (elCenterPanel)  elCenterPanel.classList.add('is-playing');
    elBoards.hidden = false;

    // Show "← Game Selection" button in topbar for host only
    if (elQuitBtn) {
      if (Room.amHost()) {
        elQuitBtn.hidden = false;
        elQuitBtn.onclick = function () {
          if (!confirm('End the game and return everyone to the lobby?')) return;
          hideBoardFrame();
          Room.backToLobby();
        };
      } else {
        elQuitBtn.hidden = true;
      }
    }

    // Hide endscreen if it was showing
    document.getElementById('room-endscreen').hidden = true;

    // Bump generation so stale postMessages from destroyed iframes are ignored
    _launchGen++;
    // Reset per-game win tracking and coin-award dedup
    _winHandled = {};
    if (window.Endscreen && Endscreen.reset) Endscreen.reset();

    // Clear old frames
    elBoards.innerHTML = '';
    elBoards.classList.remove('ingame-boards--dual');

    if (room.dual_instance) {
      elBoards.classList.add('ingame-boards--dual');
      var fr0 = document.createElement('iframe');
      fr0.className = 'ingame-frame ingame-frame--half';
      fr0.title     = room.selected_game + ' — Match 1';
      fr0.src       = buildSrc(room, '0');
      fr0.setAttribute('allow', 'autoplay');
      fr0.setAttribute('allowfullscreen', '');

      var fr1 = document.createElement('iframe');
      fr1.className = 'ingame-frame ingame-frame--half';
      fr1.title     = room.selected_game + ' — Match 2';
      fr1.src       = buildSrc(room, '1');
      fr1.setAttribute('allow', 'autoplay');
      fr1.setAttribute('allowfullscreen', '');

      elBoards.appendChild(fr0);
      elBoards.appendChild(fr1);
    } else {
      var fr = document.createElement('iframe');
      fr.className = 'ingame-frame';
      fr.title     = room.selected_game;
      fr.src       = buildSrc(room, '0');
      fr.setAttribute('allow', 'autoplay');
      fr.setAttribute('allowfullscreen', '');
      elBoards.appendChild(fr);
    }
  }

  // ── hideBoardFrame — restore game selector in center panel ─────────────────
  function hideBoardFrame() {
    if (!elBoards) return;
    elBoards.hidden = true;
    elBoards.innerHTML = '';
    if (elQuitBtn) elQuitBtn.hidden = true;
    if (elGamesSection) elGamesSection.hidden = false;
    if (elCenterTitle)  elCenterTitle.textContent = 'Pick a Game';
    if (elCenterPanel)  elCenterPanel.classList.remove('is-playing');
  }

  // ── Sync board state to existing iframes (called on Supabase game updates) ──
  function syncBoardState(room) {
    var instances = room.game_instances || [];
    var frames    = elBoards ? elBoards.querySelectorAll('iframe') : [];
    instances.forEach(function(inst, idx) {
      if (frames[idx] && inst && inst.board_state && inst.status !== 'finished') {
        frames[idx].contentWindow.postMessage({ type: 'room-state', data: inst.board_state }, '*');
      }
    });
  }

  // ── Expose ─────────────────────────────────────────────────────────────────
  window.Ingame = {
    launch:         launch,
    hideBoardFrame: hideBoardFrame,
    syncBoardState: syncBoardState,
  };

}());
