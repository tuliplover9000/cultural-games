/**
 * lobby.js - Room lobby controller.
 * Handles: player list, mini game browser, suggestions, host-pick/lottery,
 * chat, ready state, and transitions to the assignment modal / in-game view.
 *
 * Depends on: room.js (window.Room), ingame.js (window.Ingame), endscreen.js (window.Endscreen)
 */
(function () {
  'use strict';

  // ── Game catalogue ─────────────────────────────────────────────────────────
  var GAMES = [
    { key: 'tien-len',    name: 'Tiến Lên',          culture: 'Vietnam',              type: 'Card',     icon: '🃏', svg: '../assets/icons/tien-len.svg',    badge: 'Card · 4P',    maxPlayers: 4,
      rules: ['Play cards in ascending rank order, beating the previous play or pass.', 'Combos: pairs, triples, sequences - all must be beaten by a higher combo of the same type.', 'First player to empty their hand wins the round.'] },
    { key: 'mahjong',     name: 'Hong Kong Mahjong',  culture: 'China',                type: 'Tile',     icon: '🀄', svg: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPGcgdHJhbnNmb3JtPSJyb3RhdGUoLTE0IDIwIDI5KSI+CiAgICA8cmVjdCB4PSI4IiB5PSIxNCIgd2lkdGg9IjIyIiBoZWlnaHQ9IjMwIiByeD0iMyIgZmlsbD0iI2M4YTQ2ZSIgc3Ryb2tlPSIjN2E1MDIwIiBzdHJva2Utd2lkdGg9IjEuNSIvPgogICAgPHJlY3QgeD0iMTEiIHk9IjE3IiB3aWR0aD0iMTYiIGhlaWdodD0iMjQiIHJ4PSIxLjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2IwODA0MCIgc3Ryb2tlLXdpZHRoPSIwLjgiLz4KICAgIDxjaXJjbGUgY3g9IjE5IiBjeT0iMjkiIHI9IjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2IwODA0MCIgc3Ryb2tlLXdpZHRoPSIwLjgiLz4KICAgIDxjaXJjbGUgY3g9IjE5IiBjeT0iMjkiIHI9IjEuNSIgZmlsbD0iI2IwODA0MCIvPgogIDwvZz4KICAKICA8cmVjdCB4PSIyNCIgeT0iMjIiIHdpZHRoPSIyMiIgaGVpZ2h0PSIzMCIgcng9IjMiIGZpbGw9IiMxYTA4MDAiIG9wYWNpdHk9IjAuMTgiLz4KICAKICA8cmVjdCB4PSIyMiIgeT0iMTkiIHdpZHRoPSIyMiIgaGVpZ2h0PSIzMCIgcng9IjMiIGZpbGw9IiNGQkY1RTYiIHN0cm9rZT0iIzVhMzAxMCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHJlY3QgeD0iMjUiIHk9IjIyIiB3aWR0aD0iMTYiIGhlaWdodD0iMjQiIHJ4PSIxLjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0M4OUIzQyIgc3Ryb2tlLXdpZHRoPSIxLjIiLz4KCiAgPGxpbmUgeDE9IjMzIiB5MT0iMjUiIHgyPSIzMyIgeTI9IjQzIiBzdHJva2U9IiNjYzIyMDAiIHN0cm9rZS13aWR0aD0iMi4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cmVjdCB4PSIyNy41IiB5PSIyOC41IiB3aWR0aD0iMTEiIGhlaWdodD0iMTAiIHJ4PSIwLjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2NjMjIwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjwvc3ZnPg==', badge: 'Tile · 4P',    maxPlayers: 4,
      rules: ['Draw and discard tiles each turn to build a winning hand.', 'A hand = 4 sets (sequences or triplets) + 1 pair. Declare Mahjong to win.', 'Special hands (e.g. all pairs) also win. Flower tiles score bonus points.'] },
    { key: 'oware',       name: 'Oware',              culture: 'West Africa',          type: 'Board',    icon: '🟤', svg: '../assets/icons/oware.svg',       badge: 'Board · 2P',   maxPlayers: 2,
      rules: ['Pick up seeds from any pit on your side and sow them counter-clockwise.', 'Capture when your last seed lands in an opponent\'s pit holding 2 or 3 seeds.', 'Most seeds captured (out of 48) wins.'] },
    { key: 'o-an-quan',   name: 'Ô Ăn Quan',          culture: 'Vietnam',              type: 'Board',    icon: '⚫', svg: '../assets/icons/o-an-quan.svg',  badge: 'Board · 2P',   maxPlayers: 2,
      rules: ['Sow stones from any pit on your side in either direction.', 'Capture all stones in the next pit if it is empty, then keep going if the following pit is also empty.', 'Game ends when both Quan (mandarin) pits are empty. Most stones wins.'] },
    { key: 'fanorona',    name: 'Fanorona',            culture: 'Madagascar',           type: 'Board',    icon: '⬡',  svg: '../assets/icons/fanorona.svg',   badge: 'Board · 2P',   maxPlayers: 2,
      rules: ['Move a piece to an adjacent intersection along a line.', 'Capture by approach (move into line with opponent) or withdrawal (move away from a line).', 'Eliminate all opponent pieces to win.'] },
    { key: 'pallanguzhi', name: 'Pallanguzhi',         culture: 'South India',          type: 'Board',    icon: '🐚', svg: '../assets/icons/pallanguzhi.svg',badge: 'Board · 2P',   maxPlayers: 2,
      rules: ['Sow shells counter-clockwise from any pit on your side.', 'If your last shell lands in a pit with shells, pick them up and continue sowing.', 'Capture the next pit\'s contents when you land in an empty pit. Most shells wins.'] },
    { key: 'patolli',     name: 'Patolli',             culture: 'Mesoamerica',          type: 'Dice',     icon: '🟩', svg: '../assets/icons/patolli.svg',    badge: 'Dice · 2P',    maxPlayers: 2,
      rules: ['Race 6 markers around a cross-shaped board by rolling marked beans.', 'Land on an opponent\'s marker to send it back to start. Certain squares grant safe passage.', 'First to move all markers off the board wins.'] },
    { key: 'puluc',       name: 'Puluc',               culture: 'Mesoamerica',          type: 'Dice',     icon: '🪵', svg: '../assets/icons/puluc.svg',      badge: 'Dice · 2P',    maxPlayers: 2,
      rules: ['Move your pieces toward the opponent\'s end of a 9-square strip using stick dice.', 'Land on an opponent\'s piece to capture and carry it. Land on a stack to capture the whole stack.', 'Clear all enemy pieces from the board to win.'] },
    { key: 'bau-cua',     name: 'Bầu Cua Tôm Cá',     culture: 'Vietnam',              type: 'Dice',     icon: '🎲', svg: '../assets/icons/bau-cua.svg',    badge: 'Dice · Group', maxPlayers: 8,
      rules: ['Place bets on any of 6 symbols: gourd, shrimp, crab, fish, deer, rooster.', 'Banker rolls 3 dice. Win 1× your bet for each die showing your symbol.', 'No match = you lose your bet. Match all 3 = win 3×.'] },
    { key: 'hnefatafl',   name: 'Hnefatafl',           culture: 'Norse',                type: 'Strategy', icon: '♟',  svg: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPCEtLSBCb2FyZCBiYWNrZ3JvdW5kIC0tPgogIDxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgcng9IjQiIGZpbGw9IiMzRDMyMjgiLz4KICA8IS0tIDPDlzMgZ3JpZDogMTZweCBjZWxscywgMnB4IGdhcHMsIDJweCBtYXJnaW4g4oCUIHBlcmZlY3RseSBjZW50cmVkIGluIDU2w5c1NiAtLT4KICA8IS0tIFJvdyAxIC0tPgogIDxyZWN0IHg9IjYiICB5PSI2IiAgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMSIgZmlsbD0iIzJhMjAxYSIvPgogIDxyZWN0IHg9IjI0IiB5PSI2IiAgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMSIgZmlsbD0iI0M0QTI2NSIgb3BhY2l0eT0iMC45Ii8+CiAgPHJlY3QgeD0iNDIiIHk9IjYiICB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHJ4PSIxIiBmaWxsPSIjMmEyMDFhIi8+CiAgPCEtLSBSb3cgMiAtLT4KICA8cmVjdCB4PSI2IiAgeT0iMjQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgcng9IjEiIGZpbGw9IiNDNEEyNjUiIG9wYWNpdHk9IjAuOSIvPgogIDxyZWN0IHg9IjI0IiB5PSIyNCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMSIgZmlsbD0iIzVDMUExQSIgb3BhY2l0eT0iMC45NSIvPgogIDxyZWN0IHg9IjQyIiB5PSIyNCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMSIgZmlsbD0iI0M0QTI2NSIgb3BhY2l0eT0iMC45Ii8+CiAgPCEtLSBSb3cgMyAtLT4KICA8cmVjdCB4PSI2IiAgeT0iNDIiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgcng9IjEiIGZpbGw9IiMyYTIwMWEiLz4KICA8cmVjdCB4PSIyNCIgeT0iNDIiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgcng9IjEiIGZpbGw9IiNDNEEyNjUiIG9wYWNpdHk9IjAuOSIvPgogIDxyZWN0IHg9IjQyIiB5PSI0MiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMSIgZmlsbD0iIzJhMjAxYSIvPgogIDwhLS0gS2luZyBvbiB0aHJvbmUgKGNlbnRyZSBjZWxsIGNlbnRyZWQgYXQgMzIsMzIpIC0tPgogIDxjaXJjbGUgY3g9IjMyIiBjeT0iMzIiIHI9IjciIGZpbGw9IiNENEEwMTciIHN0cm9rZT0iIzVhMzAxMCIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KICA8bGluZSB4MT0iMzIiIHkxPSIyNyIgeDI9IjMyIiB5Mj0iMzciIHN0cm9rZT0iIzVhMzAxMCIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxsaW5lIHgxPSIyNyIgeTE9IjMyIiB4Mj0iMzciIHkyPSIzMiIgc3Ryb2tlPSIjNWEzMDEwIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPCEtLSBBdHRhY2tlciBwaWVjZSAocmVkKSBpbiBib3R0b20tY2VudHJlIGNlbGwgKGNlbnRyZWQgYXQgMzIsNTApIC0tPgogIDxjaXJjbGUgY3g9IjMyIiBjeT0iNTAiIHI9IjUuNSIgZmlsbD0iIzhCMjAyMCIgc3Ryb2tlPSIjM2EwODA4IiBzdHJva2Utd2lkdGg9IjEuMiIvPgogIDwhLS0gRGVmZW5kZXIgcGllY2UgKGJvbmUpIGluIHJpZ2h0LWNlbnRyZSBjZWxsIChjZW50cmVkIGF0IDUwLDMyKSAtLT4KICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjMyIiByPSI1LjUiIGZpbGw9IiNGMEU2QzgiIHN0cm9rZT0iIzdhNTAyMCIgc3Ryb2tlLXdpZHRoPSIxLjIiLz4KPC9zdmc+Cg==', badge: 'Strategy · 2P', maxPlayers: 2, seatRoles: ['attacker', 'defender'],
      rules: ['Attackers (24 pieces) try to surround and capture the King. Defenders escort the King to any corner.', 'Pieces move like rooks in chess. Capture by sandwiching an opponent\'s piece between two of yours.', 'Attackers win by capturing the King. Defenders win if the King reaches a corner.'] },
    { key: 'ganjifa',     name: 'Ganjifa',             culture: 'Mughal India',         type: 'Card',     icon: '🃏', svg: '../assets/icons/ganjifa.svg',    badge: 'Card · 4P',    maxPlayers: 4,
      rules: ['Circular hand-painted cards organised into suits with a trump suit each round.', 'Lead any card; others must follow suit if able. Highest card of the led suit (or trump) wins the trick.', 'Most tricks at the end of the hand wins.'] },
    { key: 'latrunculi',  name: 'Ludus Latrunculorum', culture: 'Ancient Rome',         type: 'Strategy', icon: '⚔️', svg: '../assets/icons/latrunculi.svg', badge: 'Strategy · 2P', maxPlayers: 2,
      rules: ['Move any piece orthogonally any number of squares (like a rook in chess).', 'Capture an opponent\'s piece by sandwiching it between two of yours on a row or column.', 'Player who captures the most pieces, or leaves the opponent with no legal moves, wins.'] },
    { key: 'pachisi',     name: 'Pachisi',             culture: 'Indian Subcontinent',  type: 'Dice',     icon: '🎯', svg: '../assets/icons/pachisi.svg',    badge: 'Dice · 4P',    maxPlayers: 4,
      rules: ['Race 4 pieces around a cross-shaped board back to the centre using cowrie-shell dice.', 'Land on an opponent\'s piece (not on a safe square) to send it back to start.', 'First player to move all 4 pieces home wins.'],
      gameModes: [
        { value: '2player', label: '2 Players', hint: '1 v 1' },
        { value: '4player', label: '4 Players', hint: 'Teams A & B' },
      ]},
    { key: 'cachos',      name: 'Cachos',              culture: 'Latin America',         type: 'Dice',     icon: '🎲', svg: '../assets/icons/cachos.svg',     badge: 'Dice · Bluffing', maxPlayers: 6,
      rules: ['Everyone rolls 5 dice secretly under a cup. Only you see your own.', 'Bid how many of a face you think exist across ALL cups combined. Each bid must go higher.', 'Call \u00a1Dudo! to challenge. If the bid was wrong, the bidder loses a die - if right, the challenger does. Last dice standing wins.'],
      gameModes: [
        { value: '2p', label: '2 Players' },
        { value: '3p', label: '3 Players' },
        { value: '4p', label: '4 Players' },
        { value: '5p', label: '5 Players' },
        { value: '6p', label: '6 Players' },
      ]},
  ];

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var elLoading         = document.getElementById('room-loading');
  var elError           = document.getElementById('room-error');
  var elErrorMsg        = document.getElementById('room-error-msg');
  var elLobby           = document.getElementById('room-lobby');
  var elCodeDisplay     = document.getElementById('lobby-code-display');
  var elNameDisplay     = document.getElementById('lobby-name-display');
  var elStatusText      = document.getElementById('lobby-status-text');
  var elLeaveBtn        = document.getElementById('lobby-leave-btn');
  var elPlayerList      = document.getElementById('lobby-player-list');
  var elGameGrid        = document.getElementById('lobby-game-grid');
  var elModeToggle      = document.getElementById('lobby-mode-toggle');
  var elSuggList        = document.getElementById('lobby-suggestions-list');
  var elSuggEmpty       = document.getElementById('lobby-suggestions-empty');
  var elLotteryBtn      = document.getElementById('lobby-lottery-btn');
  var elChatList        = document.getElementById('lobby-chat-list');
  var elChatEmpty       = document.getElementById('lobby-chat-empty');
  var elChatForm        = document.getElementById('lobby-chat-form');
  var elChatInput       = document.getElementById('lobby-chat-input');

  var elBetPanel   = document.getElementById('lobby-bet-panel');
  var elBetBalance = document.getElementById('lobby-bet-balance');
  var elBetInput   = document.getElementById('lobby-bet-input');
  var elBetBtn     = document.getElementById('lobby-bet-btn');
  var elBetStatus  = document.getElementById('lobby-bet-status');

  var elShareBtn        = document.getElementById('lobby-share-btn');
  var elShareModal      = document.getElementById('share-modal');
  var elShareCode       = document.getElementById('share-modal-code');
  var elShareQr         = document.getElementById('share-modal-qr');
  var elShareLink       = document.getElementById('share-modal-link');
  var elShareCopy       = document.getElementById('share-modal-copy');
  var elShareClose      = document.getElementById('share-modal-close');

  var elAssignModal     = document.getElementById('room-assign-modal');
  var elAssignDesc      = document.getElementById('assign-desc');
  var elAssignPlayerList= document.getElementById('assign-player-list');
  var elAssignDualOpt   = document.getElementById('assign-dual-option');
  var elAssignDualCb    = document.getElementById('assign-dual-cb');
  var elAssignCancel      = document.getElementById('assign-cancel-btn');
  var elAssignConfirm     = document.getElementById('assign-confirm-btn');
  var elAssignModeSection = document.getElementById('assign-mode-section');
  var elAssignMode1v1     = document.getElementById('assign-mode-1v1');
  var elAssignGameModes   = document.getElementById('assign-game-modes');
  var elAssignGameModesBtns = document.getElementById('assign-game-modes-btns');

  // Games that support a true 1v1 (2-player) variant
  var SUPPORTS_1V1 = { 'tien-len': true };

  // ── State ──────────────────────────────────────────────────────────────────
  var myPid          = null;
  var lotteryRunning = false;
  var _filterQ       = '';
  var _filterCulture = '';
  var _filterType    = '';
  var _filterPlayers = '';

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

  // ── Filter ─────────────────────────────────────────────────────────────────
  function applyFilter() {
    var q = _filterQ.toLowerCase();
    elGameGrid.querySelectorAll('.lobby-game-card').forEach(function (card) {
      var nameMatch    = !q              || card.dataset.name.toLowerCase().indexOf(q) !== -1;
      var cultureMatch = !_filterCulture || card.dataset.culture    === _filterCulture;
      var typeMatch    = !_filterType    || card.dataset.type        === _filterType;
      var playersMatch = !_filterPlayers || String(card.dataset.maxPlayers) === _filterPlayers;
      card.style.display = (nameMatch && cultureMatch && typeMatch && playersMatch) ? '' : 'none';
    });
  }

  // ── Player list ────────────────────────────────────────────────────────────
  function renderPlayerList(room) {
    var wins  = room.player_wins  || {};
    var names = room.player_names || {};
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
      return '<li class="lobby-player' + (isMe ? ' lobby-player--me' : '') + '" data-pid="' + esc(pid) + '">' +
        '<div class="lobby-player__avatar" aria-hidden="true">' + name[0].toUpperCase() + '</div>' +
        '<div class="lobby-player__info">' +
          '<span class="lobby-player__name">' + name + (isMe ? ' <em style="font-weight:400;color:var(--color-text-muted)">(you)</em>' : '') + '</span>' +
          '<span class="lobby-player__wins">' + w + ' win' + (w !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        (isTop ? '<span class="lobby-player__trophy" title="Leading!">🏆</span>' : '') +
      '</li>';
    }).join('');

    // Status text
    elStatusText.textContent = Room.amHost()
      ? (ids.length < 2 ? 'Waiting for players to join… share the room code!' : 'Pick a game to start')
      : 'Waiting for host to start a game…';
  }

  // ── Game grid ─────────────────────────────────────────────────────────────
  // Re-rendered on each lobby update so host Play buttons reflect current state.
  function renderGameGrid() {
    var isHost = Room.amHost();
    var favs   = new Set((window.Auth && Auth.getFavorites) ? Auth.getFavorites() : []);
    var curRoom    = (Room.currentRoom && Room.currentRoom()) || {};
    var roomSize   = (curRoom.player_ids || []).length;
    var tooFew     = isHost && roomSize < 2;

    // Favorites float to the top, otherwise keep original catalogue order
    var sorted = GAMES.slice().sort(function(a, b) {
      return (favs.has(a.key) ? 0 : 1) - (favs.has(b.key) ? 0 : 1);
    });

    elGameGrid.innerHTML = sorted.map(function(g) {
      var isFav     = favs.has(g.key);
      var iconInner = g.svg
        ? '<img src="' + g.svg + '" class="lobby-game-card__icon-img" alt="" aria-hidden="true" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + g.icon + '\'">'
        : g.icon;
      var rulesHtml = (g.rules && g.rules.length)
        ? '<div class="lobby-game-rules" hidden>' +
            '<ul class="lobby-game-rules__list">' +
              g.rules.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('') +
            '</ul>' +
          '</div>'
        : '';
      return '<div class="lobby-game-card" role="listitem" data-name="' + esc(g.name) + '" data-culture="' + esc(g.culture || '') + '" data-type="' + esc(g.type || '') + '" data-max-players="' + (g.maxPlayers || '') + '">' +
        '<button class="lobby-star-btn' + (isFav ? ' lobby-star-btn--on' : '') + '" data-game="' + g.key + '" type="button" aria-label="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '">' + (isFav ? '★' : '☆') + '</button>' +
        '<span class="lobby-game-card__icon" aria-hidden="true">' + iconInner + '</span>' +
        '<div class="lobby-game-card__info">' +
          '<span class="lobby-game-card__name">' + esc(g.name) + '</span>' +
          '<span class="badge badge--board" style="font-size:0.65rem;padding:2px 7px">' + esc(g.badge) + '</span>' +
        '</div>' +
        (g.rules && g.rules.length ? '<button class="lobby-rules-btn" type="button" aria-expanded="false" aria-label="How to play ' + esc(g.name) + '">? Rules</button>' : '') +
        (isHost
          ? '<button class="btn btn-primary btn-sm lobby-play-direct-btn" data-game="' + g.key + '" aria-label="Play ' + esc(g.name) + '"' + (tooFew ? ' disabled title="Need at least 2 players to start"' : '') + '>▶ Play</button>'
          : '<button class="btn btn-teal btn-sm lobby-suggest-btn" data-game="' + g.key + '" aria-label="Suggest ' + esc(g.name) + '">Suggest</button>'
        ) +
        rulesHtml +
      '</div>';
    }).join('');

    // Star buttons - toggle favorite
    elGameGrid.querySelectorAll('.lobby-star-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.Auth && Auth.toggleFavorite) {
          Auth.toggleFavorite(btn.dataset.game);
          renderGameGrid();
        }
      });
    });

    // Rules toggle
    elGameGrid.querySelectorAll('.lobby-rules-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var card  = btn.closest('.lobby-game-card');
        var panel = card && card.querySelector('.lobby-game-rules');
        if (!panel) return;
        var open = !panel.hidden;
        panel.hidden = open;
        btn.setAttribute('aria-expanded', String(!open));
        btn.classList.toggle('lobby-rules-btn--open', !open);
      });
    });

    // Host: clicking Play directly selects that game
    elGameGrid.querySelectorAll('.lobby-play-direct-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.disabled = true;
        Room.selectGame(btn.dataset.game);
      });
    });

    // Re-apply current filter after re-render
    applyFilter();

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
    elLotteryBtn.hidden = !(isHost && mode === 'lottery');

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
    lotteryRunning = true;
    elLotteryBtn.disabled = true;

    // Pick a random game from the full catalogue
    var winnerGame = GAMES[Math.floor(Math.random() * GAMES.length)];

    // Animate through the game grid cards
    var cards   = elGameGrid.querySelectorAll('.lobby-game-card');
    var pool    = GAMES;
    var idx     = 0;
    var delay   = 80;
    var elapsed = 0;
    var maxTime = 2400;

    // Decide which card index the winner lands on
    var winnerIdx = GAMES.indexOf(winnerGame);

    function tick() {
      cards.forEach(function(el){ el.classList.remove('lottery-highlight'); });
      var card = cards[idx % cards.length];
      if (card) card.classList.add('lottery-highlight');
      idx++;
      elapsed += delay;
      if (elapsed < maxTime) {
        delay = Math.min(delay + 12, 380);
        setTimeout(tick, delay);
      } else {
        // Make sure we land on the winner card
        cards.forEach(function(el){ el.classList.remove('lottery-highlight'); });
        if (cards[winnerIdx]) cards[winnerIdx].classList.add('lottery-highlight');
        setTimeout(function() {
          cards.forEach(function(el){ el.classList.remove('lottery-highlight'); });
          lotteryRunning = false;
          elLotteryBtn.disabled = false;
          Room.selectGame(winnerGame.key);
        }, 800);
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
    var selectedMode     = 'normal';
    var selectedGameMode = null; // for games with explicit mode choices (e.g. Pachisi)

    elAssignDesc.innerHTML = '<strong>' + esc(meta.name) + '</strong> supports up to <strong>' + seats + ' player' + (seats !== 1 ? 's' : '') + '</strong>. Assign roles below.';

    // ── Per-game mode picker (e.g. Pachisi 2P / 4P) ─────────────────────────
    if (meta.gameModes && meta.gameModes.length) {
      // Auto-select: match mode to player count.
      // For numeric modes like '2p','3p' → match parseInt(value) to players.length.
      // For legacy text modes like '2player','4player' → fall back to threshold logic.
      selectedGameMode = meta.gameModes[0].value;
      meta.gameModes.forEach(function(gm) {
        var n = parseInt(gm.value, 10);
        if (!isNaN(n) && n <= players.length) selectedGameMode = gm.value;
        else if (isNaN(n) && gm.value === (players.length >= 3 ? '4player' : '2player')) selectedGameMode = gm.value;
      });
      elAssignGameModes.hidden = false;
      elAssignGameModesBtns.innerHTML = meta.gameModes.map(function (gm) {
        return '<button class="assign-mode-btn' + (gm.value === selectedGameMode ? ' active' : '') +
               '" data-gmode="' + esc(gm.value) + '">' + esc(gm.label) +
               (gm.hint ? '<span class="assign-mode-hint">' + esc(gm.hint) + '</span>' : '') + '</button>';
      }).join('');
      elAssignGameModesBtns.querySelectorAll('.assign-mode-btn').forEach(function (btn) {
        btn.onclick = function () {
          selectedGameMode = btn.dataset.gmode;
          elAssignGameModesBtns.querySelectorAll('.assign-mode-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.gmode === selectedGameMode);
          });
        };
      });
    } else {
      elAssignGameModes.hidden = true;
    }

    // Build role map. Games with seatRoles get named seats; others get generic 'player'.
    var seatRoles = meta.seatRoles; // e.g. ['attacker','defender'] or undefined
    var roles = {};
    players.forEach(function(pid, i) {
      if (seatRoles) {
        roles[pid] = i < seatRoles.length ? seatRoles[i] : 'spectator';
      } else {
        roles[pid] = i < seats ? 'player' : 'spectator';
      }
    });

    elAssignPlayerList.innerHTML = players.map(function(pid) {
      var name     = names[pid] || 'Player';
      var role     = roles[pid];
      var btnDefs  = seatRoles ? seatRoles.concat(['spectator']) : ['player', 'spectator'];
      var btns = btnDefs.map(function(r) {
        var label = r.charAt(0).toUpperCase() + r.slice(1);
        return '<button class="assign-role-btn' + (role === r ? ' active' : '') +
               '" data-pid="' + esc(pid) + '" data-role="' + esc(r) + '">' + label + '</button>';
      }).join('');
      return '<li class="assign-player-row" data-pid="' + esc(pid) + '">' +
        '<div class="lobby-player__avatar" style="width:30px;height:30px;font-size:var(--text-base)">' + esc(name[0].toUpperCase()) + '</div>' +
        '<span class="assign-player-name">' + esc(name) + (pid === myPid ? ' (you)' : '') + '</span>' +
        '<div class="assign-role-toggle" role="group" aria-label="Role for ' + esc(name) + '">' + btns + '</div>' +
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

    // Mode selection: show when room has fewer players than game max
    var underPopulated = players.length < seats;
    elAssignModeSection.hidden = !underPopulated;
    if (underPopulated) {
      // 1v1 option only for games with a true 2-player variant
      elAssignMode1v1.hidden = !SUPPORTS_1V1[game];
      selectedMode = 'normal';
      // Wire mode buttons
      elAssignModeSection.querySelectorAll('.assign-mode-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.mode === selectedMode);
        btn.onclick = function() {
          selectedMode = btn.dataset.mode;
          elAssignModeSection.querySelectorAll('.assign-mode-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.mode === selectedMode);
          });
        };
      });
    }

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
        var modeToStart = selectedGameMode || (underPopulated ? selectedMode : 'normal');
        return Room.startGame(modeToStart);
      }).then(function() {
        elAssignModal.hidden = true;
        elAssignConfirm.disabled = false;
      });
    };

    elAssignCancel.onclick = function() {
      elAssignModal.hidden = true;
      renderGameGrid(); // immediately re-enable play buttons
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

  // ── Bet panel ──────────────────────────────────────────────────────────────
  function updateBetPanel(room) {
    if (!elBetPanel) return;
    if (!window.Auth || !Auth.isLoggedIn()) { elBetPanel.hidden = true; return; }
    elBetPanel.hidden = false;
    var coins = Auth.getCoins ? Auth.getCoins() : 0;
    elBetBalance.textContent = coins.toLocaleString();
    var r    = room || (window.Room && Room.currentRoom()) || {};
    var bets = r.bets || {};
    var myBet = bets[Room.getPlayerId()] || 0;
    if (myBet > 0) {
      elBetStatus.textContent = 'Your bet: ' + myBet.toLocaleString() + ' coins';
      elBetStatus.hidden = false;
    } else {
      elBetStatus.hidden = true;
    }
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function renderLobby(room) {
    elCodeDisplay.textContent = room.code;
    if (elNameDisplay) {
      var rn = room.room_name && room.room_name.trim();
      elNameDisplay.textContent = rn || '';
      elNameDisplay.hidden = !rn;
    }
    renderPlayerList(room);
    renderGameGrid();       // re-render so host/guest button state is always current
    renderSuggestions(room);
    updateBetPanel(room);
  }

  // ── Transitions ────────────────────────────────────────────────────────────
  function showLobby() {
    elLoading.hidden   = true;
    elError.hidden     = true;
    elLobby.hidden     = false;
    document.getElementById('room-endscreen').hidden = true;
    // Restore center panel to game-selector view
    if (window.Ingame && window.Ingame.hideBoardFrame) window.Ingame.hideBoardFrame();
    // Failsafe: always hide the mid-game quit button in lobby state
    var quitBtn = document.getElementById('ingame-quit-btn');
    if (quitBtn) quitBtn.hidden = true;
    // Allow coins to be re-awarded for next game
    if (window.Endscreen && Endscreen.reset) Endscreen.reset();
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
          // Already showing game - just push latest board state to iframes
          if (window.Ingame && window.Ingame.syncBoardState) window.Ingame.syncBoardState(room);
        } else {
          if (window.Ingame) window.Ingame.launch(room);
        }
      },
      onEndscreen: function(room) {
        if (window.Endscreen) window.Endscreen.show(room);
      },
      onFinished: function() {
        // Host left - persist any local coin changes before redirecting
        if (window.Auth && Auth.persistCoins) Auth.persistCoins();
        showError('The host left the room. Your coins have been saved.');
        setTimeout(function() { window.location.href = 'rooms.html'; }, 3000);
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
      var titleName = (room.room_name && room.room_name.trim()) || ('Room ' + room.code);
      document.title = titleName + ' - Cultural Games';
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

  // Share
  if (elShareBtn) {
    elShareBtn.addEventListener('click', function() {
      var room = Room.currentRoom() || {};
      var code = room.code || '';
      var url = 'https://playculturalgames.com/pages/rooms.html?join=' + encodeURIComponent(code);
      if (elShareCode) elShareCode.textContent = code;
      if (elShareQr)   elShareQr.src = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(url) + '&size=160x160&margin=8';
      if (elShareLink) elShareLink.value = url;
      if (elShareModal) elShareModal.hidden = false;
    });
  }
  if (elShareCopy) {
    elShareCopy.addEventListener('click', function() {
      var val = elShareLink ? elShareLink.value : '';
      if (!val) return;
      navigator.clipboard.writeText(val).then(function() {
        elShareCopy.textContent = 'Copied!';
        setTimeout(function() { elShareCopy.textContent = 'Copy'; }, 2000);
      }).catch(function() {
        if (elShareLink) { elShareLink.select(); document.execCommand('copy'); }
        elShareCopy.textContent = 'Copied!';
        setTimeout(function() { elShareCopy.textContent = 'Copy'; }, 2000);
      });
    });
  }
  if (elShareClose) {
    elShareClose.addEventListener('click', function() { elShareModal.hidden = true; });
  }
  if (elShareModal) {
    elShareModal.addEventListener('click', function(e) {
      if (e.target === elShareModal) elShareModal.hidden = true;
    });
  }


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

  // Filter inputs
  var elGameSearch     = document.getElementById('lobby-game-search');
  var elCultureFilter  = document.getElementById('lobby-culture-filter');
  var elTypeFilter     = document.getElementById('lobby-type-filter');
  var elPlayersFilter  = document.getElementById('lobby-players-filter');

  // Populate culture dropdown from GAMES data
  var cultures = [];
  GAMES.forEach(function (g) {
    if (g.culture && cultures.indexOf(g.culture) === -1) cultures.push(g.culture);
  });
  cultures.sort().forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    elCultureFilter.appendChild(opt);
  });

  elGameSearch.addEventListener('input', function () {
    _filterQ = elGameSearch.value.trim();
    applyFilter();
  });
  elCultureFilter.addEventListener('change', function () {
    _filterCulture = elCultureFilter.value;
    applyFilter();
  });
  elTypeFilter.addEventListener('change', function () {
    _filterType = elTypeFilter.value;
    applyFilter();
  });
  elPlayersFilter.addEventListener('change', function () {
    _filterPlayers = elPlayersFilter.value;
    applyFilter();
  });

  // Bet button
  if (elBetBtn) {
    elBetBtn.addEventListener('click', function() {
      var amount = parseInt(elBetInput.value, 10) || 0;
      if (amount < 0) return;
      var coins = window.Auth && Auth.getCoins ? Auth.getCoins() : 0;
      if (amount > coins) {
        elBetStatus.textContent = 'Not enough coins! (Balance: ' + coins.toLocaleString() + ')';
        elBetStatus.hidden = false;
        return;
      }
      elBetBtn.disabled = true;
      Room.placeBet(amount).then(function() {
        elBetInput.value = '';
        elBetBtn.disabled = false;
        updateBetPanel();
      });
    });
  }

  // Re-render game grid when auth state / favorites change
  if (window.Auth && Auth.onAuthChange) Auth.onAuthChange(function() {
    renderGameGrid();
    updateBetPanel();
  });

  // Boot
  init();

}());
