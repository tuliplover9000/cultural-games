/**
 * ingame.js — In-game wrapper controller (Phase G).
 * Handles: iframe embedding, player strip, chat sidebar toggle,
 * postMessage bridge, spectator mode, dual-instance layout.
 *
 * Exposes window.Ingame for lobby.js and endscreen.js to call.
 */
(function () {
  'use strict';

  var elIngame      = document.getElementById('room-ingame');
  var elStrip       = elIngame ? elIngame.querySelector('.ingame-strip') : null;
  var elCode        = document.getElementById('ingame-code');
  var elChips       = document.getElementById('ingame-player-chips');
  var elBoards      = document.getElementById('ingame-boards');
  var elChatToggle  = document.getElementById('ingame-chat-toggle');
  var elChatPanel   = document.getElementById('ingame-chat-panel');
  var elChatClose   = document.getElementById('ingame-chat-close');
  var elChatList    = document.getElementById('ingame-chat-list');
  var elChatEmpty   = document.getElementById('ingame-chat-empty');
  var elChatForm    = document.getElementById('ingame-chat-form');
  var elChatInput   = document.getElementById('ingame-chat-input');
  var elLeaveBtn    = document.getElementById('ingame-leave-btn');

  var lastChatLen  = 0;
  var _winHandled  = {};   // instanceId → true, prevents double-processing

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }

  // ── Player chips ───────────────────────────────────────────────────────────
  function renderChips(room) {
    if (!elChips) return;
    var wins   = room.player_wins  || {};
    var names  = room.player_names || {};
    var ids    = room.player_ids   || [];
    var myPid  = Room.getPlayerId();
    var maxW   = ids.reduce(function(m,p){ return Math.max(m, wins[p]||0); }, 0);
    var showT  = maxW > 0;

    elChips.innerHTML = ids.map(function(pid) {
      var name = names[pid] || 'Player';
      var w    = wins[pid]  || 0;
      var top  = showT && w === maxW;
      return '<div class="ingame-chip" role="listitem">' +
        '<div class="ingame-chip__avatar" aria-hidden="true">' + esc(name[0].toUpperCase()) + '</div>' +
        '<span class="ingame-chip__name">' + esc(name) + (pid === myPid ? ' ·' : '') + '</span>' +
        '<span class="ingame-chip__wins">' + w + '</span>' +
        (top ? '<span class="ingame-chip__trophy" aria-label="Leading">🏆</span>' : '') +
      '</div>';
    }).join('');
  }

  // ── Build game URL ─────────────────────────────────────────────────────────
  function buildSrc(room, instanceId) {
    var game    = room.selected_game;
    var roles   = room.player_roles || {};
    var ids     = room.player_ids   || [];
    var myPid   = Room.getPlayerId();
    var myRole  = roles[myPid] || 'player';

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

    var params = new URLSearchParams({
      roomId:   room.id,
      roomCode: room.code,
      seat:     seatIdx,
      role:     myRole,
      instance: instanceId,
    });

    return '../games/' + game + '.html?' + params.toString();
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  function renderChat(messages) {
    if (!elChatList) return;
    if (!messages || !messages.length) {
      if (elChatEmpty) elChatEmpty.hidden = false;
      return;
    }
    if (elChatEmpty) elChatEmpty.hidden = true;

    var myPid = Room.getPlayerId();
    if (messages.length > lastChatLen) {
      messages.slice(lastChatLen).forEach(function(m) {
        var isOwn = m.pid === myPid;
        var li = document.createElement('li');
        li.className = 'lobby-chat-msg' + (isOwn ? ' lobby-chat-msg--own' : '');
        li.innerHTML =
          '<div class="lobby-chat-msg__header">' +
            '<span class="lobby-chat-msg__name">' + esc(m.name || 'Player') + '</span>' +
            '<span class="lobby-chat-msg__time">' + fmtTime(m.ts) + '</span>' +
          '</div>' +
          '<p class="lobby-chat-msg__text">' + esc(m.text) + '</p>';
        elChatList.appendChild(li);
      });
      lastChatLen = messages.length;
      elChatList.scrollTop = elChatList.scrollHeight;
    }
  }

  // ── postMessage bridge ─────────────────────────────────────────────────────
  window.addEventListener('message', function(e) {
    if (!e.data) return;

    // Game iframe reports a move — forward to the other iframe and persist
    if (e.data.type === 'game-sync') {
      var instanceId = e.data.instance || '0';
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
      var winInst = e.data.instance || '0';
      if (!_winHandled[winInst]) {
        _winHandled[winInst] = true;
        handleWin(winInst, e.data.winnerSeat, e.data.score);
      }
    }

    // Game iframe is ready — push latest board_state so reconnecting players sync up
    if (e.data.type === 'game-ready') {
      var readyInst = e.data.instance || '0';
      var readyIdx  = parseInt(readyInst, 10);
      var readyRoom = Room.currentRoom();
      if (readyRoom) {
        var insts = readyRoom.game_instances || [];
        var inst  = insts[readyIdx];
        if (inst && inst.board_state && e.source) {
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

    var winnerPid = instancePlayers[winnerSeat] || null;

    if (winnerPid) Room.incrementWin(winnerPid);
    Room.endGame(instanceId, winnerPid);
  }

  // ── Launch ─────────────────────────────────────────────────────────────────
  function launch(room) {
    if (!elIngame) return;

    elIngame.hidden = false;
    document.getElementById('room-lobby').hidden = true;
    document.getElementById('room-endscreen').hidden = true;
    lastChatLen = 0; // reset so chat re-renders

    if (elCode) elCode.textContent = room.code;
    renderChips(room);

    // Reset per-game state
    _winHandled = {};

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

      var fr1 = document.createElement('iframe');
      fr1.className = 'ingame-frame ingame-frame--half';
      fr1.title     = room.selected_game + ' — Match 2';
      fr1.src       = buildSrc(room, '1');
      fr1.setAttribute('allow', 'autoplay');

      elBoards.appendChild(fr0);
      elBoards.appendChild(fr1);
    } else {
      var fr = document.createElement('iframe');
      fr.className = 'ingame-frame';
      fr.title     = room.selected_game;
      fr.src       = buildSrc(room, '0');
      fr.setAttribute('allow', 'autoplay');
      elBoards.appendChild(fr);
    }

    // Render existing chat
    if (room.chat_messages) renderChat(room.chat_messages);
  }

  // ── Chat sidebar toggle ────────────────────────────────────────────────────
  if (elChatToggle) {
    elChatToggle.addEventListener('click', function() {
      var open = elChatPanel.classList.toggle('is-open');
      elBoards.classList.toggle('chat-open', open);
      elChatToggle.setAttribute('aria-pressed', String(open));
      elChatPanel.setAttribute('aria-hidden', String(!open));
      if (open) elChatInput && elChatInput.focus();
    });
  }
  if (elChatClose) {
    elChatClose.addEventListener('click', function() {
      elChatPanel.classList.remove('is-open');
      elBoards.classList.remove('chat-open');
      elChatToggle && elChatToggle.setAttribute('aria-pressed', 'false');
      elChatPanel.setAttribute('aria-hidden', 'true');
    });
  }

  // In-game chat form
  if (elChatForm) {
    elChatForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var text = elChatInput.value.trim();
      if (!text) return;
      elChatInput.value = '';
      Room.sendChatMessage(text);
    });
  }

  // Leave from in-game
  if (elLeaveBtn) {
    elLeaveBtn.addEventListener('click', function() {
      if (!confirm('Leave this room?')) return;
      Room.leaveRoom().then(function() {
        window.location.href = 'rooms.html';
      });
    });
  }

  // ── Sync board state to existing iframes (called on Supabase game updates) ──
  function syncBoardState(room) {
    var instances = room.game_instances || [];
    var frames    = elBoards ? elBoards.querySelectorAll('iframe') : [];
    instances.forEach(function(inst, idx) {
      if (frames[idx] && inst && inst.board_state) {
        frames[idx].contentWindow.postMessage({ type: 'room-state', data: inst.board_state }, '*');
      }
    });
    renderChips(room);
  }

  // ── Expose ─────────────────────────────────────────────────────────────────
  window.Ingame = {
    launch:         launch,
    renderChat:     renderChat,
    syncBoardState: syncBoardState,
    renderChips:    renderChips,
  };

}());
