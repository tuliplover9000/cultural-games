/**
 * bau-cua.js - Bầu Cua Tôm Cá
 * Full game implementation - Phase 2.
 *
 * Requires helpers.js (Helpers.randInt) to be loaded first.
 *
 * Game flow:
 *   betting → locked → rolling → results → (new round) OR gameover
 */

(function () {
  'use strict';

  // ── Symbols ────────────────────────────────────────────────────────────────
  var IMG_BASE = '../../assets/icons/';
  var SYMBOLS = [
    { key: 'bau', img: IMG_BASE + 'bc-bau.svg', vn: 'Bầu',  en: 'Gourd'   },
    { key: 'cua', img: IMG_BASE + 'bc-cua.svg', vn: 'Cua',   en: 'Crab'    },
    { key: 'tom', img: IMG_BASE + 'bc-tom.svg', vn: 'Tôm',   en: 'Shrimp'  },
    { key: 'ca',  img: IMG_BASE + 'bc-ca.svg',  vn: 'Cá',    en: 'Fish'    },
    { key: 'nai', img: IMG_BASE + 'bc-nai.svg', vn: 'Nai',   en: 'Deer'    },
    { key: 'ga',  img: IMG_BASE + 'bc-ga.svg',  vn: 'Gà',    en: 'Rooster' },
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    wallet:     100,
    betAmount:  10,
    bets:       {},   // { symbolKey: coinAmount }
    phase:      'betting',  // 'betting' | 'locked' | 'rolling' | 'results' | 'gameover'
    diceResult: [],   // array of 3 SYMBOLS entries
    stats: {
      rounds:      0,
      biggestWin:  0,
      biggestLoss: 0,
    },
  };

  // Whether the player is betting with real site coins (opt-in, logged-in only)
  var useRealCoins = false;

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Room / group-play mode ──────────────────────────────────────────────────
  var vsRoom   = !!(window.RoomBridge && window.RoomBridge.isActive());
  var roomHost = vsRoom && window.RoomBridge.isRoomHost();

  // Per-seat color palette (up to 8 players)
  var SEAT_COLORS = ['#60a5fa','#4ade80','#f472b6','#fb923c','#a78bfa','#34d399','#fbbf24','#f87171'];

  // Group-play peer tracking: { seat: { name, wallet, bets } }
  var peerStates = {};
  var mySeat     = -1;
  var myName     = '';
  var _syncTimer = null;

  function getLocalPlayerName() {
    var u = window._user;
    if (u && u.display_name) return u.display_name;
    return localStorage.getItem('cg_name') || 'Player';
  }

  // ── DOM cache (populated by cacheDOMRefs) ──────────────────────────────────
  var els = {};

  // ── Entry point ────────────────────────────────────────────────────────────
  function init() {
    var container = document.getElementById('game-container');
    if (!container) return;
    renderGame(container);
    cacheDOMRefs();
    bindEvents();
    if (vsRoom) initRoomMode();
    refresh();

    // Show the real-coin toggle once auth settles
    if (window.Auth && Auth.onAuthChange) {
      Auth.onAuthChange(function () {
        if (!els.modeWrap) return;
        els.modeWrap.style.display = Auth.isLoggedIn() ? 'flex' : 'none';
        // If user logged out mid-game while using real coins, revert to practice
        if (!Auth.isLoggedIn() && useRealCoins) {
          useRealCoins = false;
          if (state.phase === 'betting') {
            state.wallet = 100;
            state.bets   = {};
            renderChips();
          }
          refresh();
        }
      });
    }
  }

  // ── Render game HTML ───────────────────────────────────────────────────────
  function renderGame(container) {
    container.innerHTML = [
      '<div class="bc-game" id="bc-game">',

      // Wallet bar
      '  <div class="bc-wallet-bar">',
      '    <div>',
      '      <div class="bc-wallet-bar__label" id="bc-wallet-label">Wallet</div>',
      '      <div class="bc-wallet-amount" id="bc-wallet">🪙 100</div>',
      '    </div>',
      '    <div id="bc-coin-mode-wrap" class="bc-coin-mode-wrap" style="display:none">',
      '      <button id="bc-mode-btn" class="bc-mode-btn" type="button">💰 Use Real Coins</button>',
      '    </div>',
      '    <div style="text-align:right;">',
      '      <div class="bc-wallet-bar__label">Round</div>',
      '      <div style="font-family:var(--font-display);font-size:var(--text-xl);font-weight:700;color:white;" id="bc-round">1</div>',
      '    </div>',
      '  </div>',

      // Bet row
      '  <div class="bc-bet-row">',
      '    <label for="bc-bet-input" style="font-size:var(--text-sm);font-weight:600;color:var(--color-text-muted);">Bet per symbol:</label>',
      '    <input type="number" id="bc-bet-input" class="bc-bet-input" min="1" max="100" value="10" aria-label="Bet amount" />',
      '    <span style="font-size:var(--text-sm);color:var(--color-text-muted);">coins</span>',
      '    <div class="bc-quick-bets">',
      '      <button class="bc-quick" data-amount="5">5</button>',
      '      <button class="bc-quick" data-amount="10">10</button>',
      '      <button class="bc-quick" data-amount="25">25</button>',
      '      <button class="bc-quick" data-amount="50">50</button>',
      '    </div>',
      '  </div>',

      // Betting mat
      '  <div class="bc-mat" id="bc-mat" role="group" aria-label="Betting mat">',
        SYMBOLS.map(function (s) {
          return [
            '<button class="bc-symbol-zone" data-key="' + s.key + '"',
            ' aria-label="Bet on ' + s.en + ' (' + s.vn + ')" aria-pressed="false">',
            '  <img class="bc-symbol-img" src="' + s.img + '" aria-hidden="true" alt="" />',
            '  <span class="bc-symbol-vn">' + s.vn + '</span>',
            '  <span class="bc-symbol-en">' + s.en + '</span>',
            '</button>',
          ].join('');
        }).join(''),
      '  </div>',

      // Action buttons
      '  <div class="bc-actions">',
      '    <button id="bc-clear-btn" class="btn btn-ghost" disabled>Clear Bets</button>',
      '    <button id="bc-place-btn" class="btn btn-secondary" disabled>Place Bet →</button>',
      '    <button id="bc-roll-btn"  class="btn btn-primary"  disabled>Roll Dice 🎲</button>',
      '  </div>',

      // Status
      '  <p id="bc-status" class="bc-status" aria-live="polite">Click a symbol on the mat to place your bet.</p>',

      // Dice
      '  <div class="bc-dice-area">',
      '    <div class="bc-dice-label">Dice</div>',
      '    <div class="bc-dice-row" aria-label="Dice" aria-live="polite">',
      '      <div class="bc-die" id="bc-die-0" aria-label="Die 1">-</div>',
      '      <div class="bc-die" id="bc-die-1" aria-label="Die 2">-</div>',
      '      <div class="bc-die" id="bc-die-2" aria-label="Die 3">-</div>',
      '    </div>',
      '  </div>',

      // Results panel (hidden until roll)
      '  <div class="bc-results" id="bc-results" aria-live="polite">',
      '    <h3 class="bc-results-title" id="bc-results-title"></h3>',
      '    <ul class="bc-results-list" id="bc-results-list"></ul>',
      '    <div class="bc-net" id="bc-net"></div>',
      '    <div class="bc-actions">',
      '      <button id="bc-again-btn" class="btn btn-primary btn-lg">Roll Again 🎲</button>',
      '    </div>',
      '  </div>',

      // Game Over panel (hidden until wallet = 0)
      '  <div class="bc-gameover" id="bc-gameover">',
      '    <div class="bc-gameover__emoji" aria-hidden="true">😔</div>',
      '    <h2>Out of coins!</h2>',
      '    <p>Better luck next time.</p>',
      '    <div class="bc-stats" id="bc-stats"></div>',
      '    <div class="bc-actions">',
      '      <button id="bc-restart-btn" class="btn btn-primary btn-lg">Play Again (100 🪙)</button>',
      '      <a href="../browse.html" class="btn btn-ghost btn-lg">Back to Browse</a>',
      '    </div>',
      '  </div>',

      '</div>', // bc-game
    ].join('\n');
  }

  function cacheDOMRefs() {
    els = {
      wallet:      document.getElementById('bc-wallet'),
      walletLabel: document.getElementById('bc-wallet-label'),
      modeWrap:    document.getElementById('bc-coin-mode-wrap'),
      modeBtn:     document.getElementById('bc-mode-btn'),
      round:       document.getElementById('bc-round'),
      betInput:  document.getElementById('bc-bet-input'),
      zones:     document.querySelectorAll('.bc-symbol-zone'),
      clearBtn:  document.getElementById('bc-clear-btn'),
      placeBtn:  document.getElementById('bc-place-btn'),
      rollBtn:   document.getElementById('bc-roll-btn'),
      status:    document.getElementById('bc-status'),
      dice: [
        document.getElementById('bc-die-0'),
        document.getElementById('bc-die-1'),
        document.getElementById('bc-die-2'),
      ],
      results:      document.getElementById('bc-results'),
      resultsTitle: document.getElementById('bc-results-title'),
      resultsList:  document.getElementById('bc-results-list'),
      netEl:        document.getElementById('bc-net'),
      againBtn:     document.getElementById('bc-again-btn'),
      gameover:     document.getElementById('bc-gameover'),
      statsEl:      document.getElementById('bc-stats'),
      restartBtn:   document.getElementById('bc-restart-btn'),
    };
  }

  function bindEvents() {
    // Quick-bet buttons
    document.querySelectorAll('.bc-quick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (state.phase !== 'betting') return;
        var amt = parseInt(btn.dataset.amount, 10);
        amt = Math.min(amt, state.wallet);
        els.betInput.value = amt;
        state.betAmount = amt;
      });
    });

    // Bet input
    els.betInput.addEventListener('input', function () {
      var val = parseInt(els.betInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > state.wallet) val = state.wallet;
      state.betAmount = val;
    });

    // Symbol zones
    els.zones.forEach(function (zone) {
      zone.addEventListener('click', function () {
        if (state.phase !== 'betting') return;
        toggleBet(zone.dataset.key);
      });
    });

    els.clearBtn.addEventListener('click', clearBets);
    els.placeBtn.addEventListener('click', lockBets);
    els.rollBtn.addEventListener('click', rollDice);
    els.againBtn.addEventListener('click', newRound);
    els.restartBtn.addEventListener('click', restartGame);
    if (els.modeBtn) els.modeBtn.addEventListener('click', toggleCoinMode);
  }

  // ── Betting phase ──────────────────────────────────────────────────────────

  function toggleBet(key) {
    var amount = parseInt(els.betInput.value, 10);
    if (isNaN(amount) || amount < 1) amount = 1;
    if (amount > state.wallet) amount = state.wallet;
    state.betAmount = amount;

    if (state.bets[key]) {
      // Remove existing bet on this symbol
      delete state.bets[key];
    } else {
      // Check total bets won't exceed wallet
      var currentTotal = totalBets();
      if (currentTotal + amount > state.wallet) {
        var remaining = state.wallet - currentTotal;
        if (remaining <= 0) {
          setStatus('Your bets are already using all your coins!');
          return;
        }
        // Auto-clamp to remaining
        amount = remaining;
        els.betInput.value = amount;
        state.betAmount = amount;
      }
      state.bets[key] = amount;
    }

    renderChips();
    refresh();
    if (vsRoom) syncMyState();
  }

  function clearBets() {
    state.bets = {};
    renderChips();
    refresh();
    setStatus('Bets cleared. Click a symbol to start again.');
    if (vsRoom) syncMyState();
  }

  function lockBets() {
    if (totalBets() === 0 || state.phase !== 'betting') return;
    state.phase = 'locked';
    refresh();
    setStatus('Bets locked! Click "Roll Dice" to roll.');
  }

  function toggleCoinMode() {
    if (state.phase !== 'betting') {
      setStatus('You can only switch modes between rounds.');
      return;
    }
    if (!useRealCoins) {
      var balance = window.Auth && Auth.getCoins ? Auth.getCoins() : 0;
      if (balance <= 0) {
        setStatus('No coins available - earn some by playing games in rooms!');
        return;
      }
      useRealCoins    = true;
      state.wallet    = balance;
      state.betAmount = Math.min(state.betAmount, state.wallet);
      state.bets      = {};
      renderChips();
      setStatus('Now using real coins. Good luck!');
    } else {
      useRealCoins    = false;
      state.wallet    = 100;
      state.betAmount = 10;
      state.bets      = {};
      renderChips();
      setStatus('Switched to practice mode (100 virtual coins).');
    }
    refresh();
  }

  function totalBets() {
    return Object.keys(state.bets).reduce(function (sum, k) {
      return sum + state.bets[k];
    }, 0);
  }

  function renderChips() {
    els.zones.forEach(function (zone) {
      var key = zone.dataset.key;

      // Remove old chips
      zone.querySelectorAll('.bc-bet-chip, .bc-match-chip').forEach(function (c) { c.remove(); });

      // Remove result classes
      zone.classList.remove('selected', 'matched', 'lost');
      zone.setAttribute('aria-pressed', 'false');

      if (state.bets[key] !== undefined) {
        zone.classList.add('selected');
        zone.setAttribute('aria-pressed', 'true');
        var chip = document.createElement('span');
        chip.className = 'bc-bet-chip';
        chip.textContent = state.bets[key];
        chip.setAttribute('aria-hidden', 'true');
        zone.appendChild(chip);
      }
    });
  }

  // ── Rolling phase ──────────────────────────────────────────────────────────

  function rollDice() {
    if (state.phase !== 'locked') return;
    state.phase = 'rolling';
    refresh();
    setStatus('Rolling…');

    var DURATION  = 1500;
    var FRAME_MS  = 80;
    var elapsed   = 0;

    els.dice.forEach(function (die) { die.classList.add('rolling'); });

    var ticker = setInterval(function () {
      elapsed += FRAME_MS;
      els.dice.forEach(function (die) {
        var s = SYMBOLS[Helpers.randInt(0, 5)];
        die.innerHTML = '<img src="' + s.img + '" alt="' + s.en + '" />';
      });
      if (elapsed >= DURATION) {
        clearInterval(ticker);
        finalizeDice();
      }
    }, FRAME_MS);
  }

  function finalizeDice() {
    // Pick final results
    state.diceResult = [
      SYMBOLS[Helpers.randInt(0, 5)],
      SYMBOLS[Helpers.randInt(0, 5)],
      SYMBOLS[Helpers.randInt(0, 5)],
    ];

    els.dice.forEach(function (die, i) {
      die.classList.remove('rolling');
      die.classList.add('settled');
      var s = state.diceResult[i];
      die.innerHTML = '<img src="' + s.img + '" alt="' + s.en + '" />';
    });

    // In group play, host syncs the result to all guests
    if (vsRoom && roomHost) {
      RoomBridge.sendState({
        type:     'results',
        diceKeys: state.diceResult.map(function(s){ return s.key; }),
        round:    state.stats.rounds + 1,
      });
    }

    setTimeout(showResults, 400);
  }

  // ── Results phase ──────────────────────────────────────────────────────────

  function showResults() {
    state.phase = 'results';
    state.stats.rounds++;

    // Count occurrences of each symbol in dice result
    var counts = {};
    state.diceResult.forEach(function (s) {
      counts[s.key] = (counts[s.key] || 0) + 1;
    });

    // Highlight mat zones
    els.zones.forEach(function (zone) {
      var key = zone.dataset.key;
      zone.querySelectorAll('.bc-bet-chip, .bc-match-chip').forEach(function (c) { c.remove(); });
      zone.classList.remove('selected', 'matched', 'lost');

      if (counts[key]) {
        zone.classList.add('matched');
        // Show match count chip
        var chip = document.createElement('span');
        chip.className = 'bc-match-chip';
        chip.textContent = '×' + counts[key];
        chip.setAttribute('aria-hidden', 'true');
        zone.appendChild(chip);
      } else if (state.bets[key]) {
        zone.classList.add('lost');
      }
    });

    // Calculate net and build result rows
    var net = 0;
    var rows = [];

    Object.keys(state.bets).forEach(function (key) {
      var betAmt  = state.bets[key];
      var matches = counts[key] || 0;
      var sym     = SYMBOLS.filter(function (s) { return s.key === key; })[0];
      var gain;

      var symImg = '<img src="' + sym.img + '" class="bc-result-img" alt="' + sym.en + '" />';
      if (matches === 0) {
        gain = -betAmt;
        rows.push({ label: symImg + ' ' + sym.vn, gain: gain, win: false });
      } else {
        gain = betAmt * matches;
        rows.push({ label: symImg + ' ' + sym.vn + ' ×' + matches, gain: gain, win: true });
      }
      net += gain;
    });

    // Update wallet
    state.wallet = Math.max(0, state.wallet + net);
    // Sync real-coin mode: push the delta to the global Auth balance and persist
    if (useRealCoins && window.Auth && Auth.addCoins) {
      Auth.addCoins(net);
      if (Auth.persistCoins) Auth.persistCoins();
    }
    if (vsRoom) syncMyState(); // broadcast updated wallet + empty bets to leaderboard

    // Track stats
    if (net > state.stats.biggestWin)  state.stats.biggestWin  = net;
    if (net < state.stats.biggestLoss) state.stats.biggestLoss = net;

    // Render results panel
    els.resultsTitle.textContent = net >= 0 ? '🎉 You won!' : '💸 You lost.';

    els.resultsList.innerHTML = rows.map(function (row) {
      return '<li class="bc-result-item ' + (row.win ? 'win' : 'loss') + '">'
        + '<span>' + row.label + '</span>'
        + '<strong>' + (row.gain >= 0 ? '+' : '') + row.gain + ' coins</strong>'
        + '</li>';
    }).join('');

    els.netEl.className = 'bc-net ' + (net >= 0 ? 'positive' : 'negative');
    els.netEl.textContent = (net >= 0 ? '+' : '') + net + ' coins this round';

    els.results.classList.add('visible');
    refresh();
    setStatus('');

    // Check game over
    if (state.wallet <= 0) {
      setTimeout(showGameOver, 1000);
    }
  }

  // ── New round ──────────────────────────────────────────────────────────────

  function newRound() {
    state.phase      = 'betting';
    state.bets       = {};
    state.diceResult = [];
    // Clear peer bets from mat at start of new round
    if (vsRoom) {
      Object.keys(peerStates).forEach(function(s) { peerStates[s].bets = {}; });
      renderPeerBetsOnMat();
    }
    // Host tells all guests a new round is starting
    if (vsRoom && roomHost) {
      RoomBridge.sendState({ type: 'newround', round: state.stats.rounds + 1 });
    }

    // Reset dice
    els.dice.forEach(function (die) {
      die.classList.remove('rolling', 'settled');
      die.textContent = '-';
    });

    // Reset zones
    els.zones.forEach(function (zone) {
      zone.classList.remove('selected', 'matched', 'lost');
      zone.setAttribute('aria-pressed', 'false');
      zone.querySelectorAll('.bc-bet-chip, .bc-match-chip').forEach(function (c) { c.remove(); });
    });

    els.results.classList.remove('visible');
    refresh();
    setStatus('Click a symbol on the mat to place your bet.');
  }

  // ── Game Over ──────────────────────────────────────────────────────────────

  function showGameOver() {
    state.phase = 'gameover';
    if (window.Auth && Auth.isLoggedIn()) Auth.recordResult('bau-cua', 'loss');
    refresh();
    els.gameover.classList.add('visible');

    els.statsEl.innerHTML = [
      '<div class="bc-stat">',
      '  <div class="bc-stat__num">' + state.stats.rounds + '</div>',
      '  <div class="bc-stat__label">Rounds Played</div>',
      '</div>',
      '<div class="bc-stat">',
      '  <div class="bc-stat__num" style="color:#4ade80;">+' + state.stats.biggestWin + '</div>',
      '  <div class="bc-stat__label">Biggest Win</div>',
      '</div>',
      '<div class="bc-stat">',
      '  <div class="bc-stat__num" style="color:var(--color-accent-red);">' + state.stats.biggestLoss + '</div>',
      '  <div class="bc-stat__label">Biggest Loss</div>',
      '</div>',
    ].join('');
  }

  function restartGame() {
    if (useRealCoins) {
      var balance = window.Auth && Auth.getCoins ? Auth.getCoins() : 0;
      if (balance <= 0) {
        // No real coins left - silently fall back to practice
        useRealCoins = false;
        state.wallet = 100;
      } else {
        state.wallet = balance;
      }
    } else {
      state.wallet = 100;
    }
    state.bets       = {};
    state.diceResult = [];
    state.phase      = 'betting';
    state.stats      = { rounds: 0, biggestWin: 0, biggestLoss: 0 };

    els.gameover.classList.remove('visible');
    els.results.classList.remove('visible');

    els.dice.forEach(function (die) {
      die.classList.remove('rolling', 'settled');
      die.textContent = '-';
    });

    els.zones.forEach(function (zone) {
      zone.classList.remove('selected', 'matched', 'lost');
      zone.setAttribute('aria-pressed', 'false');
      zone.querySelectorAll('.bc-bet-chip, .bc-match-chip').forEach(function (c) { c.remove(); });
    });

    refresh();
    setStatus('Click a symbol on the mat to place your bet.');
  }

  // ── UI refresh ─────────────────────────────────────────────────────────────
  // Called whenever state changes to sync all UI.

  function refresh() {
    var isBetting = state.phase === 'betting';
    var isLocked  = state.phase === 'locked';
    var hasBets   = Object.keys(state.bets).length > 0;

    // Wallet + round counter
    els.wallet.textContent = (useRealCoins ? '💰 ' : '🪙 ') + state.wallet;
    els.round.textContent  = state.stats.rounds + 1;

    // Coin mode label + toggle button
    if (els.walletLabel) {
      els.walletLabel.textContent = useRealCoins ? 'Real Coins' : 'Wallet';
    }
    if (els.modeBtn) {
      els.modeBtn.textContent = useRealCoins ? '🎮 Switch to Practice' : '💰 Use Real Coins';
      els.modeBtn.classList.toggle('bc-mode-btn--active', useRealCoins);
      els.modeBtn.disabled = (state.phase !== 'betting');
    }

    // Bet input cap
    els.betInput.max = state.wallet;

    if (vsRoom && !roomHost) {
      // Guests: freely bet during betting phase; host controls rolling
      var canBet = (state.phase === 'betting');
      els.clearBtn.disabled  = !(canBet && hasBets);
      els.betInput.disabled  = !canBet;
      document.querySelectorAll('.bc-quick').forEach(function(b){ b.disabled = !canBet; });
      els.zones.forEach(function(zone){ zone.disabled = !canBet; });
    } else {
      // Solo or host: full control
      els.clearBtn.disabled = !(isBetting && hasBets);
      if (els.placeBtn) els.placeBtn.disabled = !(isBetting && hasBets);
      if (els.rollBtn)  els.rollBtn.disabled  = !isLocked;
      els.betInput.disabled = !isBetting;
      document.querySelectorAll('.bc-quick').forEach(function(b){ b.disabled = !isBetting; });
      els.zones.forEach(function(zone){ zone.disabled = !isBetting; });
    }
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  // ── Group play (room mode) ─────────────────────────────────────────────────

  function initRoomMode() {
    mySeat = RoomBridge.getSeat();
    myName = getLocalPlayerName();
    peerStates[mySeat] = { name: myName, wallet: state.wallet, bets: {} };

    // Insert leaderboard panel after the wallet bar
    var bcGame    = document.getElementById('bc-game');
    var walletBar = bcGame && bcGame.querySelector('.bc-wallet-bar');
    if (walletBar) {
      var lb = document.createElement('div');
      lb.className = 'bc-leaderboard';
      lb.id = 'bc-leaderboard';
      lb.innerHTML = '<h4 class="bc-leaderboard__title">🏆 Leaderboard</h4><ul id="bc-lb-list" class="bc-lb-list"></ul>';
      walletBar.parentNode.insertBefore(lb, walletBar.nextSibling);
    }

    if (!roomHost) {
      if (els.placeBtn) els.placeBtn.style.display = 'none';
      if (els.rollBtn)  els.rollBtn.style.display  = 'none';
      if (els.againBtn) els.againBtn.style.display = 'none';
      setStatus('Place your bets and wait for the host to roll!');
    } else {
      setStatus('Everyone place your bets, then click Place Bet → Roll Dice!');
    }

    RoomBridge.onState(receiveGroupState);
    renderLeaderboard();
    syncMyState();
  }

  function syncMyState() {
    if (!vsRoom) return;
    peerStates[mySeat] = { name: myName, wallet: state.wallet, bets: Object.assign({}, state.bets) };
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function() {
      // Send ALL known player states so every recipient can update their full leaderboard.
      RoomBridge.sendState({
        type:    'groupstate',
        players: peerStates,
      });
    }, 150);
  }

  function renderPeerBetsOnMat() {
    if (!vsRoom) return;
    els.zones.forEach(function(zone) {
      var key = zone.dataset.key;
      var existing = zone.querySelector('.bc-peer-bets');
      if (existing) existing.remove();

      var chips = [];
      Object.keys(peerStates).forEach(function(seatStr) {
        var seat = parseInt(seatStr, 10);
        if (seat === mySeat) return; // own bets shown by regular chips
        var ps = peerStates[seatStr];
        if (ps.bets && ps.bets[key]) {
          var color   = SEAT_COLORS[seat % SEAT_COLORS.length];
          var initial = (ps.name || 'P')[0].toUpperCase();
          chips.push('<span class="bc-peer-chip" style="background:' + color + '" title="' + ps.name + ': ' + ps.bets[key] + ' coins">' + initial + '</span>');
        }
      });

      if (chips.length) {
        var div = document.createElement('div');
        div.className = 'bc-peer-bets';
        div.innerHTML = chips.join('');
        zone.appendChild(div);
      }
    });
  }

  function renderLeaderboard() {
    var lbList = document.getElementById('bc-lb-list');
    if (!lbList) return;

    var entries = Object.keys(peerStates).map(function(seatStr) {
      var ps = peerStates[seatStr];
      return { seat: parseInt(seatStr, 10), name: ps.name || 'Player', wallet: ps.wallet || 0 };
    });
    entries.sort(function(a, b) { return b.wallet - a.wallet; });

    var medals = ['🥇', '🥈', '🥉'];
    lbList.innerHTML = entries.map(function(e, i) {
      var color   = SEAT_COLORS[e.seat % SEAT_COLORS.length];
      var initial = e.name[0].toUpperCase();
      var rank    = medals[i] || ('#' + (i + 1));
      var isMe    = e.seat === mySeat;
      return '<li class="bc-lb-item' + (isMe ? ' bc-lb-item--me' : '') + '">' +
        '<span class="bc-lb-rank">' + rank + '</span>' +
        '<span class="bc-lb-avatar" style="background:' + color + '">' + initial + '</span>' +
        '<span class="bc-lb-name">' + esc(e.name) + (isMe ? ' <em style="font-weight:400;opacity:.6">(you)</em>' : '') + '</span>' +
        '<span class="bc-lb-coins">🪙 ' + e.wallet + '</span>' +
      '</li>';
    }).join('');
  }

  function receiveGroupState(blob) {
    if (!blob) return;

    // Full group-state: update all peer entries except our own seat
    if (blob.type === 'groupstate' && blob.players) {
      Object.keys(blob.players).forEach(function(seatStr) {
        var seat = parseInt(seatStr, 10);
        if (seat !== mySeat) {
          peerStates[seat] = blob.players[seatStr];
        }
      });
      renderPeerBetsOnMat();
      renderLeaderboard();
      return;
    }

    // Legacy per-player state (backwards compat)
    if (blob.type === 'playerstate' && blob.seat !== undefined && blob.seat !== mySeat) {
      peerStates[blob.seat] = { name: blob.name || 'Player', wallet: blob.wallet || 0, bets: blob.bets || {} };
      renderPeerBetsOnMat();
      renderLeaderboard();
      return;
    }

    // Game-control messages: only guests process (host is the source of truth)
    if (roomHost) return;

    if (blob.type === 'results' && blob.diceKeys && blob.diceKeys.length === 3) {
      state.diceResult = blob.diceKeys.map(function(k) {
        return SYMBOLS.filter(function(s){ return s.key === k; })[0];
      }).filter(Boolean);
      if (state.diceResult.length !== 3) return;

      state.phase = 'locked';
      els.dice.forEach(function(die){ die.classList.add('rolling'); });
      setTimeout(function() {
        els.dice.forEach(function(die, i) {
          die.classList.remove('rolling');
          die.classList.add('settled');
          var s = state.diceResult[i];
          die.innerHTML = '<img src="' + s.img + '" alt="' + s.en + '" />';
        });
        setTimeout(showResults, 400);
      }, 600);

    } else if (blob.type === 'newround') {
      newRound();
      setStatus('Place your bets and wait for the host to roll!');
    }
  }

  // Persist real-coin balance if player navigates away mid-game
  window.addEventListener('beforeunload', function () {
    if (useRealCoins && window.Auth && Auth.persistCoins) Auth.persistCoins();
  });

  // ── Boot ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

}());

/* ── Tutorial ────────────────────────────────────────────────────────────── */
if (window.CGTutorial) {
  CGTutorial.register('bau-cua', [
    {
      target:   '#game-container',
      title:    'Welcome to Bầu Cua',
      body:     'Bầu Cua Tôm Cá ("Gourd Crab Shrimp Fish") is a classic Vietnamese gambling game played at Tết. Bet on symbols and see if the dice match!',
      position: 'center',
      highlight: false,
    },
    {
      target:   '#bc-wallet',
      title:    'Your Wallet',
      body:     'This is your coin balance. Place bets wisely - if your wallet hits zero the game is over!',
      position: 'bottom',
    },
    {
      target:   '#bc-place-btn',
      title:    'Place Your Bets',
      body:     'Click the six symbol zones to place chips on any combination of Gourd, Crab, Shrimp, Fish, Deer, or Rooster. Then click Place Bets to lock them in.',
      position: 'top',
    },
    {
      target:   '#bc-roll-btn',
      title:    'Roll the Dice',
      body:     'Once bets are placed, click Roll. Three dice are shaken - each one that matches your bet pays 1:1. Hit all three of a symbol and win triple!',
      position: 'top',
    },
    {
      target:   '#bc-status',
      title:    'Round Status',
      body:     'Follow the game flow here - betting phase, roll results, and winnings are all announced in this bar.',
      position: 'bottom',
    },
    {
      target:   '#bc-restart-btn',
      title:    'Restart',
      body:     'Ran out of coins or want a fresh start? Click Restart to top up your wallet and begin a new session.',
      position: 'top',
    },
  ]);
  CGTutorial.initTrigger('bau-cua');
}

// ── Fullscreen resize hooks ────────────────────────────────────────────────
if (window.FSMode) {
  FSMode.onEnter = function () { _fsResize(); };
  FSMode.onExit  = function () { _fsResize(); };
}

function _fsResize() {
  setTimeout(function () {
    var container = document.getElementById('game-container');
    if (container && typeof renderGame === 'function') renderGame(container);
  }, 50);
}

// DOM-based game - re-render to let CSS fill the new available space
window.GameResize = function (availW, availH) {
  if (typeof refresh === 'function') refresh();
};
