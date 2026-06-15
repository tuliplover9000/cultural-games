/**
 * shared/sfx.js — tiny synthesized sound effects for the games (no audio files).
 *
 * Why: every game was completely silent — playing a card, rolling dice, capturing
 * a piece, winning, all made no sound, which makes a game feel dead. This adds a
 * subtle Web-Audio layer with zero assets.
 *
 * window.SFX: tap(), select(), place(), roll(), capture(), win(), lose(), error().
 *
 * - Lazy AudioContext, created/resumed on the first user gesture (autoplay policy).
 * - Master volume is quiet (0.16) and sounds are short + soft on purpose.
 * - Mute is remembered in localStorage 'cg-sfx-muted' (default: ON / unmuted).
 * - A small mute toggle is injected next to the theme toggle.
 * - GLOBAL hooks (no per-game edits): a soft tap on any interactive click inside
 *   the game area, and a win/lose chord when a game ends (via the *-gameover
 *   overlay and/or Auth.recordResult), deduped so it never double-plays.
 */
(function () {
  'use strict';

  var MUTE_KEY = 'cg-sfx-muted';
  var ctx = null, master = null;
  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return ctx; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  /* One short enveloped tone. */
  function tone(freq, dur, type, vol, delay) {
    if (muted) return;
    var c = ensureCtx(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  /* Short filtered noise burst — dice / shuffle feel. */
  function noise(dur, vol) {
    if (muted) return;
    var c = ensureCtx(); if (!c) return;
    var t0 = c.currentTime;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 2400;
    var g = c.createGain(); g.gain.value = vol || 0.3;
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t0);
  }

  var SFX = {
    tap:     function () { tone(440, 0.045, 'triangle', 0.30); },
    select:  function () { tone(640, 0.06, 'sine', 0.38); },
    place:   function () { tone(300, 0.07, 'sine', 0.5); tone(460, 0.05, 'sine', 0.28, 0.02); },
    roll:    function () { noise(0.22, 0.22); },
    capture: function () { tone(540, 0.07, 'triangle', 0.4); tone(360, 0.1, 'triangle', 0.38, 0.05); },
    win:     function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.5, i * 0.085); }); },
    lose:    function () { [440, 392, 311, 247].forEach(function (f, i) { tone(f, 0.22, 'sine', 0.4, i * 0.1); }); },
    error:   function () { tone(150, 0.16, 'sawtooth', 0.3); },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      updateBtn();
    },
    toggle: function () { var was = muted; SFX.setMuted(!muted); if (was) SFX.tap(); }
  };
  window.SFX = SFX;

  /* ── Mute toggle button ── */
  var btn = null;
  function svg(on) {
    return on
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
  }
  function updateBtn() {
    if (!btn) return;
    btn.innerHTML = svg(!muted);
    btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    btn.setAttribute('title', muted ? 'Unmute' : 'Mute');
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  /* Dock the button just before the theme toggle if it exists. The theme toggle
     is injected asynchronously (after auth resolves), so we retry. */
  function placeButton() {
    if (!btn) return false;
    var theme = document.querySelector('.theme-toggle');
    if (theme && theme.parentNode) {
      btn.classList.remove('sfx-mute-btn--float');
      if (btn.nextElementSibling !== theme) theme.parentNode.insertBefore(btn, theme);
      return true;
    }
    return false;
  }
  function injectButton() {
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'sfx-mute-btn';
      btn.type = 'button';
      btn.className = 'sfx-mute-btn';
      updateBtn();
      btn.addEventListener('click', function (e) { e.preventDefault(); SFX.toggle(); });
    }
    if (placeButton()) return;
    if (!btn.parentNode) { btn.classList.add('sfx-mute-btn--float'); document.body.appendChild(btn); }
    // Theme toggle may appear later — retry docking a few times.
    [500, 1200, 2500].forEach(function (d) { setTimeout(placeButton, d); });
  }

  /* ── Global: soft tap on interactive clicks inside the game area ── */
  var lastTap = 0;
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var area = t.closest('#fs-game-wrap, #game-container, [class*="game-container"], .games-grid');
    if (!area) return;
    if (t.closest('#sfx-mute-btn, #mobile-zoom-btn, .fs-toggle')) return; // their own sounds/none
    var hit = t.closest('button, a, [role="button"], canvas, label, select, input,' +
      '[class*="card"], [class*="pit"], [class*="cup"], [class*="cell"], [class*="zone"],' +
      '[class*="symbol"], [class*="tile"], [class*="seed"], [class*="node"], [class*="chip"], [class*="space"]');
    var interactive = !!hit;
    if (!interactive) {
      try { interactive = getComputedStyle(t).cursor === 'pointer'; } catch (er) {}
    }
    if (!interactive) return;
    var now = Date.now();
    if (now - lastTap < 45) return;        // de-dupe rapid bursts
    lastTap = now;
    SFX.tap();
  }, true);

  /* ── Win / lose chord ── */
  var lastResult = 0;
  function playResult(outcome) {
    if (!outcome) return;                  // neutral/draw/ambiguous → no chord
    var now = Date.now();
    if (now - lastResult < 2500) return;   // never double-play
    lastResult = now;
    if (outcome === 'win') SFX.win();
    else if (outcome === 'lose' || outcome === 'loss') SFX.lose();
  }

  // (a) Detect a *-gameover overlay becoming visible (works for guests too).
  var firedOverlays = [];
  function scanGameOver() {
    var els = document.querySelectorAll('[class*="-gameover"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (firedOverlays.indexOf(el) >= 0) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
      if (el.getBoundingClientRect().height < 4) continue;
      firedOverlays.push(el);
      var txt = (el.textContent || '').toLowerCase();
      var lose = /\b(lose|lost|defeat|ai win|opponent win|you lost)\b/.test(txt);
      // \b before an emoji never matches (emoji is not a word char), so test it separately.
      var win = (/\b(win|won|victor|champion|congrat)\b/.test(txt) || txt.indexOf('🎉') >= 0) && !lose;
      // Ambiguous / draw results play no chord rather than misfiring 'win'.
      playResult(win ? 'win' : lose ? 'lose' : null);
    }
  }
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function () { scanGameOver(); });
    function observe() {
      if (document.body) mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }
    if (document.body) observe(); else document.addEventListener('DOMContentLoaded', observe);
  }

  // (b) Hook Auth.recordResult (logged-in users) — outcome is 'win'|'loss'.
  function hookAuth() {
    if (window.Auth && typeof window.Auth.recordResult === 'function' && !window.Auth.__sfxHooked) {
      var orig = window.Auth.recordResult;
      window.Auth.recordResult = function (gameId, outcome) {
        try { playResult(outcome === 'win' ? 'win' : 'lose'); } catch (e) {}
        return orig.apply(this, arguments);
      };
      window.Auth.__sfxHooked = true;
    }
  }

  function init() {
    injectButton();
    hookAuth();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Auth.js may finish loading after us — retry the hook a couple times.
  setTimeout(hookAuth, 800);
  setTimeout(hookAuth, 2000);
}());
