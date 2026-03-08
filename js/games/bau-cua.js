/**
 * bau-cua.js — Bầu Cua Tôm Cá
 * Full game implementation — Phase 2.
 *
 * Requires helpers.js (Helpers.randInt) to be loaded first.
 *
 * Game flow:
 *   betting → locked → rolling → results → (new round) OR gameover
 */

(function () {
  'use strict';

  // ── Symbols ────────────────────────────────────────────────────────────────
  var SYMBOLS = [
    { key: 'bau', emoji: '🎃', vn: 'Bầu',  en: 'Gourd'   },
    { key: 'cua', emoji: '🦀', vn: 'Cua',   en: 'Crab'    },
    { key: 'tom', emoji: '🦐', vn: 'Tôm',   en: 'Shrimp'  },
    { key: 'ca',  emoji: '🐟', vn: 'Cá',    en: 'Fish'    },
    { key: 'nai', emoji: '🦌', vn: 'Nai',   en: 'Deer'    },
    { key: 'ga',  emoji: '🐓', vn: 'Gà',    en: 'Rooster' },
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

  // ── DOM cache (populated by cacheDOMRefs) ──────────────────────────────────
  var els = {};

  // ── Entry point ────────────────────────────────────────────────────────────
  function init() {
    var container = document.getElementById('game-container');
    if (!container) return;
    renderGame(container);
    cacheDOMRefs();
    bindEvents();
    refresh();
  }

  // ── Render game HTML ───────────────────────────────────────────────────────
  function renderGame(container) {
    container.innerHTML = [
      '<div class="bc-game" id="bc-game">',

      // Wallet bar
      '  <div class="bc-wallet-bar">',
      '    <div>',
      '      <div class="bc-wallet-bar__label">Wallet</div>',
      '      <div class="bc-wallet-amount" id="bc-wallet">🪙 100</div>',
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
            '  <span class="bc-symbol-emoji" aria-hidden="true">' + s.emoji + '</span>',
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
      '      <div class="bc-die" id="bc-die-0" aria-label="Die 1">—</div>',
      '      <div class="bc-die" id="bc-die-1" aria-label="Die 2">—</div>',
      '      <div class="bc-die" id="bc-die-2" aria-label="Die 3">—</div>',
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
      wallet:    document.getElementById('bc-wallet'),
      round:     document.getElementById('bc-round'),
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
  }

  function clearBets() {
    state.bets = {};
    renderChips();
    refresh();
    setStatus('Bets cleared. Click a symbol to start again.');
  }

  function lockBets() {
    if (totalBets() === 0 || state.phase !== 'betting') return;
    state.phase = 'locked';
    refresh();
    setStatus('Bets locked! Click "Roll Dice" to roll.');
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
        die.textContent = SYMBOLS[Helpers.randInt(0, 5)].emoji;
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
      die.textContent = state.diceResult[i].emoji;
    });

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

      if (matches === 0) {
        gain = -betAmt;
        rows.push({ label: sym.emoji + ' ' + sym.vn, gain: gain, win: false });
      } else {
        gain = betAmt * matches;
        rows.push({ label: sym.emoji + ' ' + sym.vn + ' ×' + matches, gain: gain, win: true });
      }
      net += gain;
    });

    // Update wallet
    state.wallet = Math.max(0, state.wallet + net);

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
    state.phase    = 'betting';
    state.bets     = {};
    state.diceResult = [];

    // Reset dice
    els.dice.forEach(function (die) {
      die.classList.remove('rolling', 'settled');
      die.textContent = '—';
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
    state.wallet     = 100;
    state.bets       = {};
    state.diceResult = [];
    state.phase      = 'betting';
    state.stats      = { rounds: 0, biggestWin: 0, biggestLoss: 0 };

    els.gameover.classList.remove('visible');
    els.results.classList.remove('visible');

    els.dice.forEach(function (die) {
      die.classList.remove('rolling', 'settled');
      die.textContent = '—';
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
    els.wallet.textContent = '🪙 ' + state.wallet;
    els.round.textContent  = state.stats.rounds + 1;

    // Bet input cap
    els.betInput.max = state.wallet;

    // Buttons
    els.clearBtn.disabled = !(isBetting && hasBets);
    els.placeBtn.disabled = !(isBetting && hasBets);
    els.rollBtn.disabled  = !isLocked;

    // Input + quick bets
    els.betInput.disabled = !isBetting;
    document.querySelectorAll('.bc-quick').forEach(function (b) {
      b.disabled = !isBetting;
    });

    // Zones
    els.zones.forEach(function (zone) {
      zone.disabled = !isBetting;
    });
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

}());
