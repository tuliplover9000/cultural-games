/**
 * auth.js — Cultural Games account system
 * Phase 1: localStorage-backed UI.
 * Phase 2: replace the _save/_load calls inside signIn/signUp/signOut
 *          with real API calls — everything else stays identical.
 */
(function () {
  'use strict';

  /* ── Storage keys ── */
  var KEY_USER   = 'cg_user';
  var KEY_STATS  = 'cg_stats';

  /* ── Game registry (order = display order on account page) ── */
  var GAMES = [
    { id: 'bau-cua',     name: 'Bầu Cua Tôm Cá', icon: '🦐', href: 'games/bau-cua.html' },
    { id: 'o-an-quan',   name: 'Ô Ăn Quan',       icon: '⚫', href: 'games/o-an-quan.html' },
    { id: 'tien-len',    name: 'Tiến Lên',         icon: '🃏', href: 'games/tien-len.html' },
    { id: 'oware',       name: 'Oware',            icon: '🟤', href: 'games/oware.html' },
    { id: 'patolli',     name: 'Patolli',          icon: '🌿', href: 'games/patolli.html' },
    { id: 'puluc',       name: 'Puluc',            icon: '🌲', href: 'games/puluc.html' },
    { id: 'pallanguzhi', name: 'Pallanguzhi',      icon: '🐚', href: 'games/pallanguzhi.html' },
  ];

  /* ── localStorage helpers ── */
  function _save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function _load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  /* ── Event bus ── */
  var _listeners = [];
  function _emit() {
    _listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /* ── HTML escape ── */
  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Path helpers ── */
  function _depth() {
    var p = window.location.pathname.replace(/\\/g, '/');
    if (p.indexOf('/pages/games/') !== -1) return 'games';
    if (p.indexOf('/pages/')       !== -1) return 'pages';
    return 'root';
  }
  function _accountHref() {
    var d = _depth();
    if (d === 'games') return '../account.html';
    if (d === 'pages') return 'account.html';
    return 'pages/account.html';
  }

  /* ══════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════ */

  function getUser()    { return _load(KEY_USER); }
  function isLoggedIn() { return getUser() !== null; }

  /* Phase 1: compares btoa'd password against stored hash.
     Phase 2: replace body with a POST to /api/auth/signin. */
  function signIn(email, password) {
    var user = _load(KEY_USER);
    if (!user)
      return { ok: false, error: 'No account found. Please create one.' };
    if (user.email.toLowerCase() !== email.trim().toLowerCase())
      return { ok: false, error: 'No account found with that email.' };
    if (user.passwordHash !== btoa(unescape(encodeURIComponent(password))))
      return { ok: false, error: 'Incorrect password.' };
    _emit();
    return { ok: true };
  }

  /* Phase 1: stores user in localStorage.
     Phase 2: replace body with a POST to /api/auth/signup. */
  function signUp(username, email, password) {
    username = (username || '').trim();
    email    = (email    || '').trim().toLowerCase();

    if (username.length < 3)
      return { ok: false, error: 'Username must be at least 3 characters.' };
    if (!/\S+@\S+\.\S+/.test(email))
      return { ok: false, error: 'Please enter a valid email address.' };
    if (!password || password.length < 8)
      return { ok: false, error: 'Password must be at least 8 characters.' };
    if (_load(KEY_USER))
      return { ok: false, error: 'An account already exists on this device.' };

    _save(KEY_USER, {
      username:     username,
      email:        email,
      passwordHash: btoa(unescape(encodeURIComponent(password))), // Phase 1 only
      createdAt:    new Date().toISOString(),
    });

    var stats = {};
    GAMES.forEach(function (g) { stats[g.id] = { wins: 0, losses: 0, played: 0 }; });
    _save(KEY_STATS, stats);

    _emit();
    return { ok: true };
  }

  function signOut() {
    localStorage.removeItem(KEY_USER);
    _emit();
  }

  function getStats(gameId) {
    var stats = _load(KEY_STATS) || {};
    return stats[gameId] || { wins: 0, losses: 0, played: 0 };
  }

  function recordResult(gameId, outcome) {
    if (!isLoggedIn()) return;
    var stats = _load(KEY_STATS) || {};
    if (!stats[gameId]) stats[gameId] = { wins: 0, losses: 0, played: 0 };
    stats[gameId].played++;
    if (outcome === 'win')  stats[gameId].wins++;
    if (outcome === 'loss') stats[gameId].losses++;
    _save(KEY_STATS, stats);
  }

  function onAuthChange(fn) { _listeners.push(fn); }

  /* ══════════════════════════════════════════
     MODAL
  ══════════════════════════════════════════ */

  var _modalTrigger = null;

  function openModal(which) {
    _modalTrigger = document.activeElement;
    var overlay = document.getElementById('auth-overlay');
    if (!overlay) return;

    overlay.removeAttribute('hidden');
    overlay.classList.add('open');

    document.getElementById('auth-panel-signin').hidden = (which !== 'signin');
    document.getElementById('auth-panel-signup').hidden = (which !== 'signup');

    // Reset forms + errors
    overlay.querySelectorAll('form').forEach(function (f) { f.reset(); });
    overlay.querySelectorAll('.auth-error').forEach(function (e) {
      e.textContent = ''; e.hidden = true;
    });
    var bar = document.getElementById('pw-strength-bar');
    if (bar) { bar.className = 'pw-strength__bar'; bar.style.width = '0'; }

    // Focus first input
    var panel = document.getElementById('auth-panel-' + which);
    var first = panel ? panel.querySelector('input') : null;
    if (first) setTimeout(function () { first.focus(); }, 50);
  }

  function closeModal() {
    var overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('hidden', '');
    if (_modalTrigger && _modalTrigger.focus) {
      _modalTrigger.focus();
      _modalTrigger = null;
    }
  }

  function _buildModal() {
    var el = document.createElement('div');
    el.id = 'auth-overlay';
    el.className = 'auth-overlay';
    el.setAttribute('hidden', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'auth-modal-heading');

    el.innerHTML =
      '<div class="auth-card" role="document">' +
        '<button class="auth-close" id="auth-close" aria-label="Close">&times;</button>' +

        // ── Sign In panel ──
        '<div id="auth-panel-signin">' +
          '<h2 class="auth-heading" id="auth-modal-heading">Welcome Back</h2>' +
          '<p class="auth-subhead">Sign in to track your game stats.</p>' +
          '<form id="form-signin" novalidate>' +
            '<div class="form-group">' +
              '<label class="form-label" for="si-email">Email</label>' +
              '<input class="form-input" type="email" id="si-email" autocomplete="email" required />' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="si-password">Password</label>' +
              '<input class="form-input" type="password" id="si-password" autocomplete="current-password" required />' +
            '</div>' +
            '<p class="auth-error" id="si-error" hidden></p>' +
            '<button class="btn btn-primary auth-submit" type="submit">Sign In</button>' +
          '</form>' +
          '<div class="auth-divider"><span>or</span></div>' +
          '<p class="auth-switch">New here? <button class="auth-switch-btn" id="to-signup">Create an account</button></p>' +
        '</div>' +

        // ── Sign Up panel ──
        '<div id="auth-panel-signup" hidden>' +
          '<h2 class="auth-heading">Create Account</h2>' +
          '<p class="auth-subhead">Free to play. Track your wins, losses, and more.</p>' +
          '<form id="form-signup" novalidate>' +
            '<div class="form-group">' +
              '<label class="form-label" for="su-username">Username</label>' +
              '<input class="form-input" type="text" id="su-username" autocomplete="username" required minlength="3" maxlength="20" placeholder="3–20 characters" />' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="su-email">Email</label>' +
              '<input class="form-input" type="email" id="su-email" autocomplete="email" required placeholder="you@example.com" />' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="su-password">Password</label>' +
              '<input class="form-input" type="password" id="su-password" autocomplete="new-password" required minlength="8" placeholder="At least 8 characters" />' +
              '<div class="pw-strength" aria-label="Password strength"><div class="pw-strength__bar" id="pw-strength-bar"></div></div>' +
            '</div>' +
            '<p class="auth-error" id="su-error" hidden></p>' +
            '<button class="btn btn-primary auth-submit" type="submit">Create Account</button>' +
          '</form>' +
          '<div class="auth-divider"><span>or</span></div>' +
          '<p class="auth-switch">Already have an account? <button class="auth-switch-btn" id="to-signin">Sign in</button></p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);
    _wireModal(el);
  }

  function _wireModal(overlay) {
    document.getElementById('auth-close').addEventListener('click', closeModal);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });

    document.getElementById('to-signup').addEventListener('click', function () { openModal('signup'); });
    document.getElementById('to-signin').addEventListener('click',  function () { openModal('signin'); });

    // Sign In submit
    document.getElementById('form-signin').addEventListener('submit', function (e) {
      e.preventDefault();
      var result = signIn(
        document.getElementById('si-email').value,
        document.getElementById('si-password').value
      );
      if (result.ok) {
        closeModal();
      } else {
        var err = document.getElementById('si-error');
        err.textContent = result.error;
        err.hidden = false;
      }
    });

    // Sign Up submit
    document.getElementById('form-signup').addEventListener('submit', function (e) {
      e.preventDefault();
      var result = signUp(
        document.getElementById('su-username').value,
        document.getElementById('su-email').value,
        document.getElementById('su-password').value
      );
      if (result.ok) {
        closeModal();
      } else {
        var err = document.getElementById('su-error');
        err.textContent = result.error;
        err.hidden = false;
      }
    });

    // Password strength meter
    document.getElementById('su-password').addEventListener('input', function () {
      var pw   = this.value;
      var score = 0;
      if (pw.length >= 8)  score++;
      if (pw.length >= 12) score++;
      if (/[A-Z]/.test(pw) && /[0-9!@#$%^&*]/.test(pw)) score++;
      var bar    = document.getElementById('pw-strength-bar');
      var levels = ['', 'pw-strength--weak', 'pw-strength--ok', 'pw-strength--strong'];
      bar.className  = 'pw-strength__bar ' + (levels[score] || '');
      bar.style.width = (score * 33.4) + '%';
    });
  }

  /* ══════════════════════════════════════════
     NAV WIDGET
  ══════════════════════════════════════════ */

  function _renderNavWidget() {
    var container  = document.getElementById('nav-auth');
    var mobileItem = document.getElementById('nav-auth-mobile');
    if (!container) return;

    var acct = _accountHref();

    if (isLoggedIn()) {
      var user  = getUser();
      var init  = _esc(user.username.charAt(0).toUpperCase());
      var uname = _esc(user.username);

      container.innerHTML =
        '<div class="nav-auth">' +
          '<button class="nav-auth__trigger" id="nav-auth-trigger" aria-haspopup="true" aria-expanded="false">' +
            '<span class="nav-auth__avatar" aria-hidden="true">' + init + '</span>' +
            '<span class="nav-auth__name">' + uname + '</span>' +
            '<span class="nav-auth__caret" aria-hidden="true">▾</span>' +
          '</button>' +
          '<div class="nav-auth__dropdown" id="nav-auth-dropdown" hidden>' +
            '<a href="' + acct + '" class="nav-auth__dropdown-item">My Account</a>' +
            '<button class="nav-auth__dropdown-item nav-auth__dropdown-item--danger" id="nav-signout-btn">Sign Out</button>' +
          '</div>' +
        '</div>';

      document.getElementById('nav-auth-trigger').addEventListener('click', function (e) {
        e.stopPropagation();
        var dd   = document.getElementById('nav-auth-dropdown');
        var open = !dd.hidden;
        dd.hidden = open;
        this.setAttribute('aria-expanded', String(!open));
      });
      document.getElementById('nav-signout-btn').addEventListener('click', signOut);

      if (mobileItem) {
        mobileItem.innerHTML =
          '<a href="' + acct + '" class="nav-link">My Account</a>' +
          '<button class="nav-link nav-auth-mobile-btn" id="mobile-signout-btn">Sign Out</button>';
        document.getElementById('mobile-signout-btn').addEventListener('click', signOut);
      }

    } else {
      container.innerHTML = '<button class="nav-auth__signin-btn" id="nav-signin-btn">Sign In</button>';
      document.getElementById('nav-signin-btn').addEventListener('click', function () { openModal('signin'); });

      if (mobileItem) {
        mobileItem.innerHTML = '<button class="nav-link nav-auth-mobile-btn" id="mobile-signin-btn">Sign In</button>';
        document.getElementById('mobile-signin-btn').addEventListener('click', function () { openModal('signin'); });
      }
    }
  }

  function _injectNavWidget() {
    var hamburger = document.querySelector('.nav-hamburger');
    var navLinks  = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;

    // Desktop container — sits between nav-links and hamburger
    var container = document.createElement('div');
    container.id  = 'nav-auth';
    hamburger.parentNode.insertBefore(container, hamburger);

    // Mobile item — appended inside the collapsible ul
    var mobileItem    = document.createElement('li');
    mobileItem.id     = 'nav-auth-mobile';
    mobileItem.className = 'nav-auth-mobile-item';
    navLinks.appendChild(mobileItem);

    _renderNavWidget();

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      var dd  = document.getElementById('nav-auth-dropdown');
      var btn = document.getElementById('nav-auth-trigger');
      if (dd && !dd.hidden && btn && !btn.contains(e.target)) {
        dd.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Re-render on auth change
    onAuthChange(function () {
      _renderNavWidget();
      _renderFooterLink();
    });
  }

  /* ── Footer "My Account" link ── */
  function _renderFooterLink() {
    var footerLinks = document.querySelector('.footer-links');
    if (!footerLinks) return;
    var existing = document.getElementById('footer-auth-link');

    if (isLoggedIn()) {
      if (!existing) {
        var li = document.createElement('li');
        li.id  = 'footer-auth-link';
        li.innerHTML = '<a href="' + _accountHref() + '" class="footer-link">My Account</a>';
        footerLinks.appendChild(li);
      }
    } else {
      if (existing) existing.remove();
    }
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', function () {
    _buildModal();
    _injectNavWidget();
    _renderFooterLink();
  });

  /* ── Public API ── */
  window.Auth = {
    isLoggedIn:   isLoggedIn,
    getUser:      getUser,
    signIn:       signIn,
    signUp:       signUp,
    signOut:      signOut,
    getStats:     getStats,
    recordResult: recordResult,
    onAuthChange: onAuthChange,
    openModal:    openModal,
    closeModal:   closeModal,
    GAMES:        GAMES,
  };

}());
