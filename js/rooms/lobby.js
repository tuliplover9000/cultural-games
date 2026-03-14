/**
 * lobby.js — Room lobby controller.
 * Handles: player list, mini game browser, suggestions, host-pick/lottery,
 * chat, ready state, and transitions to the assignment modal / in-game view.
 *
 * Depends on: room.js (window.Room), ingame.js (window.Ingame), endscreen.js (window.Endscreen)
 */
(function () {
  'use strict';

  // ── Game catalogue ─────────────────────────────────────────────────────────
  var GAMES = [
    { key: 'tien-len',    name: 'Tiến Lên',          icon: '🃏', badge: 'Card · 4P',  maxPlayers: 4 },
    { key: 'mahjong',     name: 'Hong Kong Mahjong',  icon: '🀄', badge: 'Tile · 4P',  maxPlayers: 4 },
    { key: 'oware',       name: 'Oware',              icon: '🟤', badge: 'Board · 2P', maxPlayers: 2 },
    { key: 'o-an-quan',   name: 'Ô Ăn Quan',          icon: '⚫', badge: 'Board · 2P', maxPlayers: 2 },
    { key: 'fanorona',    name: 'Fanorona',            icon: '⬡',  badge: 'Board · 2P', maxPlayers: 2 },
    { key: 'pallanguzhi', name: 'Pallanguzhi',         icon: '🐚', badge: 'Board · 2P', maxPlayers: 2 },
    { key: 'patolli',     name: 'Patolli',             icon: '🟩', badge: 'Dice · 2P',  maxPlayers: 2 },
    { key: 'puluc',       name: 'Puluc',               icon: '🪵', badge: 'Dice · 2P',  maxPlayers: 2 },
    { key: 'bau-cua',     name: 'Bầu Cua Tôm Cá',     icon: '🎲', badge: 'Dice · 1P',  maxPlayers: 1 },
  ];

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var elLoading         = document.getElementById('room-loading');
  var elError           = document.getElementById('room-error');
  var elErrorMsg        = document.getElementById('room-error-msg');
  var elLobby           = document.getElementById('room-lobby');
  var elCodeDisplay     = document.getElementById('lobby-code-display');
  var elStatusText      = document.getElementById('lobby-status-text');
  var elLeaveBtn        = document.getElementById('lobby-leave-btn');
  var elPlayerList      = document.getElementById('lobby-player-list');
  var elReadyBtn        = document.getElementById('lobby-ready-btn');
  var elGameGrid        = document.getElementById('lobby-game-grid');
  var elModeToggle      = document.getElementById('lobby-mode-toggle');
  var elSuggList        = document.getElementById('lobby-suggestions-list');
  var elSuggEmpty       = document.getElementById('lobby-suggestions-empty');
  var elLotteryBtn      = document.getElementById('lobby-lottery-btn');
  var elChatList        = document.getElementById('lobby-chat-list');
  var elChatEmpty       = document.getElementById('lobby-chat-empty');
  var elChatForm        = document.getElementById('lobby-chat-form');
  var elChatInput       = document.getElementById('lobby-chat-input');

  var elAssignModal     = document.getElementById('room-assign-modal');
  var elAssignDesc      = document.getElementById('assign-desc');
  var elAssignPlayerList= document.getElementById('assign-player-list');
  var elAssignDualOpt   = document.getElementById('assign-dual-option');
  var elAssignDualCb    = document.getElementById('assign-dual-cb');
  var elAssignCancel    = document.getElementById('assign-cancel-btn');
  var elAssignConfirm   = document.getElementById('assign-confirm-btn');

  // ── State ──────────────────────────────────────────────────────────────────
  var myPid        = null;
  var isReady      = false;
  var lotteryRunning = false;

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

  function showError(msg) {
    elLoading.hidden = true;
    elErrorMsg.textContent = msg;
    elError.hidden = false;
  }

  function gameMeta(key) {
    return GAMES.find(function(g){ return g.key === key; }) || { key: key, name: key, icon: '🎮', badge: '', maxPlayers: 2 };
  }

  // ── Player list ────────────────────────────────────────────────────────────
  function renderPlayerList(room) {
    var wins  = room.player_wins  || {};
    var names = room.player_names || {};
    var ready = room.player_ready || {};
    var ids   = room.player_ids   || [];
    var maxW  = ids.reduce(function(m,p){ return Math.max(m, wins[p]||0); }, 0);
    var showTrophy = maxW > 0;

    if (!ids.length) {
      elPlayerList.innerHTML = '<li style="font-size:var(--text-sm);color:var(--color-text-muted);padding:8px 0">Waiting for players…</li>';
      return;
    }

    elPlayerList.innerHTML = ids.map(function(pid) {
      var name  = esc(names[pid] || 'Player');
      var w     = wins[pid] || 0;
      var isMe  = pid === myPid;
      var isTop = showTrophy && w === maxW;
      var rdy   = ready[pid];
      return '<li class="lobby-player' + (isMe ? ' lobby-player--me' : '') + '" data-pid="' + esc(pid) + '">' +
        '<div class="lobby-player__avatar" aria-hidden="true">' + name[0].toUpperCase() + '</div>' +
        '<div class="lobby-player__info">' +
          '<span class="lobby-player__name">' + name + (isMe ? ' <em style="font-weight:400;color:var(--color-text-muted)">(you)</em>' : '') + '</span>' +
          '<span class="lobby-player__wins">' + w + ' win' + (w !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        (isTop ? '<span class="lobby-player__trophy" title="Leading!">🏆</span>' : '') +
        '<span class="lobby-player__ready ' + (rdy ? 'ready--yes' : 'ready--no') + '" aria-label="' + (rdy ? 'Ready' : 'Not ready') + '">' + (rdy ? '✓' : '·') + '</span>' +
      '</li>';
    }).join('');

    // Update ready button state
    var myReady = ready[myPid];
    elReadyBtn.textContent = myReady ? 'Not Ready' : 'Ready';
    elReadyBtn.classList.toggle('is-ready', !!myReady);
    isReady = !!myReady;

    // Status text
    var readyCount = ids.filter(function(p){ return ready[p]; }).length;
    if (Room.amHost()) {
      elStatusText.textContent = ids.length < 2
        ? 'Waiting for players to join… share the room code!'
        : readyCount + '/' + ids.length + ' ready — pick a game to start';
    } else {
      elStatusText.textContent = readyCount + '/' + ids.length + ' ready';
    }
  }

  // ── Game grid ─────────────────────────────────────────────────────────────
  // Re-rendered on each lobby update so host Play buttons reflect current state.
  function renderGameGrid() {
    var isHost = Room.amHost();
    elGameGrid.innerHTML = GAMES.map(function(g) {
      return '<div class="lobby-game-card" role="listitem">' +
        '<span class="lobby-game-card__icon" aria-hidden="true">' + g.icon + '</span>' +
        '<div class="lobby-game-card__info">' +
          '<span class="lobby-game-card__name">' + esc(g.name) + '</span>' +
          '<span class="badge badge--board" style="font-size:0.65rem;padding:2px 7px">' + esc(g.badge) + '</span>' +
        '</div>' +
        (isHost
          ? '<button class="btn btn-primary btn-sm lobby-play-direct-btn" data-game="' + g.key + '" aria-label="Play ' + esc(g.name) + '">▶ Play</button>'
          : '<button class="btn btn-teal btn-sm lobby-suggest-btn" data-game="' + g.key + '" aria-label="Suggest ' + esc(g.name) + '">Suggest</button>'
        ) +
      '</div>';
    }).join('');

    // Host: clicking Play directly selects that game
    elGameGrid.querySelectorAll('.lobby-play-direct-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.disabled = true;
        Room.selectGame(btn.dataset.game);
      });
    });

    // Non-hosts: Suggest button
    elGameGrid.querySelectorAll('.lobby-suggest-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = '✓';
        setTimeout(function(){ btn.disabled = false; btn.textContent = 'Suggest'; }, 1500);
        Room.suggestGame(btn.dataset.game);
      });
    });
  }

  // ── Suggestions ────────────────────────────────────────────────────────────
  function renderSuggestions(room) {
    var list   = room.suggestions || [];
    var isHost = Room.amHost();
    var mode   = room.lobby_mode || 'host-pick';

    // Mode toggle visibility (host only)
    elModeToggle.hidden = !isHost;
    if (isHost) {
      elModeToggle.querySelectorAll('.lobby-mode-btn').forEach(function(b) {
        var active = b.dataset.mode === mode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }

    // Lottery button
    elLotteryBtn.hidden = !(isHost && mode === 'lottery' && list.length > 0);

    if (!list.length) {
      elSuggList.innerHTML = '';
      elSuggEmpty.hidden = false;
      return;
    }
    elSuggEmpty.hidden = true;

    elSuggList.innerHTML = list.map(function(s, idx) {
      var meta    = gameMeta(s.game);
      var isOwn   = s.suggested_by === myPid;
      var canPlay = isHost && mode === 'host-pick';
      return '<li class="lobby-suggestion" data-idx="' + idx + '">' +
        '<span class="lobby-suggestion__icon" aria-hidden="true">' + meta.icon + '</span>' +
        '<div class="lobby-suggestion__info">' +
          '<span class="lobby-suggestion__name">' + esc(meta.name) + '</span>' +
          '<span class="lobby-suggestion__by">suggested by ' + esc(s.name || 'someone') + '</span>' +
        '</div>' +
        (canPlay ? '<button class="btn btn-primary btn-sm lobby-play-btn" data-game="' + s.game + '" data-idx="' + idx + '">Play this</button>' : '') +
        ((isOwn || isHost) ? '<button class="btn btn-ghost btn-sm lobby-remove-btn" data-idx="' + idx + '" aria-label="Remove suggestion">✕</button>' : '') +
      '</li>';
    }).join('');

    // Wire play buttons
    elSuggList.querySelectorAll('.lobby-play-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        Room.selectGame(btn.dataset.game);
      });
    });

    // Wire remove buttons
    elSuggList.querySelectorAll('.lobby-remove-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        Room.removeSuggestion(parseInt(btn.dataset.idx, 10));
      });
    });
  }

  // ── Lottery animation ──────────────────────────────────────────────────────
  function runLottery() {
    if (lotteryRunning) return;
    var room = Room.currentRoom();
    var list = (room && room.suggestions) || [];
    if (!list.length) return;

    lotteryRunning = true;
    elLotteryBtn.disabled = true;

    var items  = elSuggList.querySelectorAll('.lobby-suggestion');
    var pool   = list.map(function(s){ return s.game; });
    var idx    = 0;
    var delay  = 80;
    var elapsed = 0;
    var maxTime = 2400;

    function tick() {
      items.forEach(function(el){ el.classList.remove('lobby-suggestion--highlight'); });
      var item = items[idx % items.length];
      if (item) item.classList.add('lobby-suggestion--highlight');
      idx++;
      elapsed += delay;
      if (elapsed < maxTime) {
        delay = Math.min(delay + 12, 380);
        setTimeout(tick, delay);
      } else {
        // Land on final item
        var winner = pool[idx % pool.length];
        setTimeout(function() {
          lotteryRunning = false;
          elLotteryBtn.disabled = false;
          Room.selectGame(winner);
        }, 500);
      }
    }
    tick();
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  var lastChatLen = 0;

  function renderChat(messages) {
    if (!messages || !messages.length) {
      elChatEmpty.hidden = false;
      elChatList.innerHTML = '';
      lastChatLen = 0;
      return;
    }
    elChatEmpty.hidden = true;

    // Only re-render new messages (append-only optimisation)
    if (messages.length > lastChatLen) {
      var newMsgs = messages.slice(lastChatLen);
      newMsgs.forEach(function(m) {
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
      // Auto-scroll
      elChatList.scrollTop = elChatList.scrollHeight;
    }
  }

  // Same renderer used in in-game chat (ingame.js calls this)
  window.LobbyChat = { render: renderChat };

  // ── Assignment modal ────────────────────────────────────────────────────────
  function showAssignModal(room) {
    var game    = room.selected_game;
    var meta    = gameMeta(game);
    var players = room.player_ids || [];
    var names   = room.player_names || {};
    var seats   = meta.maxPlayers;

    elAssignDesc.innerHTML = '<strong>' + esc(meta.name) + '</strong> supports up to <strong>' + seats + ' player' + (seats !== 1 ? 's' : '') + '</strong>. Assign roles below.';

    // Build role map starting with all 'player', extra players default to 'spectator'
    var roles = {};
    players.forEach(function(pid, i) {
      roles[pid] = i < seats ? 'player' : 'spectator';
    });

    elAssignPlayerList.innerHTML = players.map(function(pid) {
      var name = names[pid] || 'Player';
      var role = roles[pid];
      return '<li class="assign-player-row" data-pid="' + esc(pid) + '">' +
        '<div class="lobby-player__avatar" style="width:30px;height:30px;font-size:var(--text-base)">' + esc(name[0].toUpperCase()) + '</div>' +
        '<span class="assign-player-name">' + esc(name) + (pid === myPid ? ' (you)' : '') + '</span>' +
        '<div class="assign-role-toggle" role="group" aria-label="Role for ' + esc(name) + '">' +
          '<button class="assign-role-btn' + (role === 'player' ? ' active' : '') + '" data-pid="' + esc(pid) + '" data-role="player">Player</button>' +
          '<button class="assign-role-btn' + (role === 'spectator' ? ' active' : '') + '" data-pid="' + esc(pid) + '" data-role="spectator">Spectator</button>' +
        '</div>' +
      '</li>';
    }).join('');

    // Wire role buttons
    elAssignPlayerList.querySelectorAll('.assign-role-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pid = btn.dataset.pid;
        elAssignPlayerList.querySelectorAll('.assign-role-btn[data-pid="' + pid + '"]').forEach(function(b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        roles[pid] = btn.dataset.role;
      });
    });

    // Dual instance option: only for 2P games with 4+ players
    var showDual = seats === 2 && players.length >= 4;
    elAssignDualOpt.hidden = !showDual;
    if (showDual) elAssignDualCb.checked = !!(room.dual_instance);

    elAssignModal.hidden = false;

    elAssignConfirm.onclick = function() {
      elAssignConfirm.disabled = true;
      var dual = !elAssignDualOpt.hidden && elAssignDualCb.checked;
      Room.setDualInstance(dual).then(function() {
        return Room.setPlayerRoles(roles);
      }).then(function() {
        return Room.startGame();
      }).then(function() {
        elAssignModal.hidden = true;
        elAssignConfirm.disabled = false;
      });
    };

    elAssignCancel.onclick = function() {
      elAssignModal.hidden = true;
      // Revert status to lobby
      if (Room.amHost()) {
        var db = window.supabase && window.supabase.createClient(
          'https://pnyvlqgllrpslhgimgve.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw',
          { auth: { persistSession: false } }
        );
        if (db) db.from('rooms').update({ status: 'lobby', selected_game: null }).eq('id', Room.currentRoom().id);
      }
    };
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function renderLobby(room) {
    elCodeDisplay.textContent = room.code;
    renderPlayerList(room);
    renderGameGrid();       // re-render so host/guest button state is always current
    renderSuggestions(room);
  }

  // ── Transitions ────────────────────────────────────────────────────────────
  function showLobby() {
    elLoading.hidden   = true;
    elError.hidden     = true;
    elLobby.hidden     = false;
    document.getElementById('room-endscreen').hidden = true;
    // Restore center panel to game-selector view
    if (window.Ingame && window.Ingame.hideBoardFrame) window.Ingame.hideBoardFrame();
  }

  // ── Initialise ─────────────────────────────────────────────────────────────
  function init() {
    var params = new URLSearchParams(location.search);
    var roomId = params.get('id');
    if (!roomId) {
      showError('No room ID specified. Please go back and create or join a room.');
      return;
    }

    myPid = Room.getPlayerId();

    // Fetch room and subscribe
    Room.rejoinRoom(roomId, {
      onLobbyUpdate: function(room) {
        showLobby();
        renderLobby(room);
      },
      onAssigning: function(room) {
        // Non-host players see a "waiting for host" message; host sees the modal
        if (Room.amHost()) {
          showAssignModal(room);
        } else {
          elStatusText.textContent = 'Host is assigning players…';
        }
      },
      onGameUpdate: function(room) {
        elAssignModal.hidden = true;
        var boardsEl = document.getElementById('ingame-boards');
        if (boardsEl && !boardsEl.hidden) {
          // Already showing game — just push latest board state to iframes
          if (window.Ingame && window.Ingame.syncBoardState) window.Ingame.syncBoardState(room);
        } else {
          if (window.Ingame) window.Ingame.launch(room);
        }
      },
      onEndscreen: function(room) {
        if (window.Endscreen) window.Endscreen.show(room);
      },
      onChatUpdate: function(messages) {
        renderChat(messages);
      },
      onError: function(msg) {
        showError(msg);
      },
    }).then(function(room) {
      if (!room) return; // error already shown
      // Set page title to include room code
      document.title = 'Room ' + room.code + ' — Cultural Games';
      showLobby();
      renderLobby(room); // renderGameGrid is called inside renderLobby now

      // If already in-game or at end screen, hand off immediately
      if (room.status === 'playing'   && window.Ingame)   window.Ingame.launch(room);
      if (room.status === 'endscreen' && window.Endscreen) window.Endscreen.show(room);
      if (room.status === 'assigning' && Room.amHost())    showAssignModal(room);
    });
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  // Leave
  elLeaveBtn.addEventListener('click', function() {
    if (!confirm('Leave this room?')) return;
    Room.leaveRoom().then(function() {
      window.location.href = 'rooms.html';
    });
  });

  // Ready toggle
  elReadyBtn.addEventListener('click', function() {
    isReady = !isReady;
    Room.setPlayerReady(isReady);
  });

  // Mode toggle (host only)
  elModeToggle.addEventListener('click', function(e) {
    var btn = e.target.closest('.lobby-mode-btn');
    if (!btn) return;
    Room.setLobbyMode(btn.dataset.mode);
  });

  // Lottery button
  elLotteryBtn.addEventListener('click', runLottery);

  // Chat form
  elChatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = elChatInput.value.trim();
    if (!text) return;
    elChatInput.value = '';
    Room.sendChatMessage(text);
  });

  // Boot
  init();

}());
