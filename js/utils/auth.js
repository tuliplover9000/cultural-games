/**
 * auth.js — Cultural Games account system (Phase 2: Supabase Auth + DB)
 * Real email/password auth with sessions that persist across devices.
 *
 * Supabase setup (run once in your Supabase SQL Editor):
 *
 *   create table profiles (
 *     id uuid references auth.users(id) on delete cascade primary key,
 *     username text unique not null,
 *     created_at timestamptz default now()
 *   );
 *   alter table profiles enable row level security;
 *   create policy "public read"   on profiles for select using (true);
 *   create policy "own insert"    on profiles for insert with check (auth.uid() = id);
 *   create policy "own update"    on profiles for update using (auth.uid() = id);
 *
 *   create table stats (
 *     user_id uuid references auth.users(id) on delete cascade,
 *     game_id text not null,
 *     wins    int  not null default 0,
 *     losses  int  not null default 0,
 *     played  int  not null default 0,
 *     primary key (user_id, game_id)
 *   );
 *   alter table stats enable row level security;
 *   create policy "public read"   on stats for select using (true);
 *   create policy "own insert"    on stats for insert with check (auth.uid() = user_id);
 *   create policy "own update"    on stats for update using (auth.uid() = user_id);
 *
 * Coins + betting (run once):
 *   alter table profiles add column if not exists coins integer not null default 0;
 *   alter table rooms    add column if not exists bets  jsonb   not null default '{}';
 *
 * Also go to Supabase → Authentication → Settings and DISABLE "Enable email confirmations"
 * so users can sign in immediately after registering.
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  /* ── Game registry ── */
  var GAMES = [
    { id: 'bau-cua',     name: 'Bầu Cua Tôm Cá', iconPath: 'assets/icons/bau-cua.svg',     href: 'games/bau-cua.html' },
    { id: 'o-an-quan',   name: 'Ô Ăn Quan',       iconPath: 'assets/icons/o-an-quan.svg',   href: 'games/o-an-quan.html' },
    { id: 'tien-len',    name: 'Tiến Lên',         iconPath: 'assets/icons/tien-len.svg',    href: 'games/tien-len.html' },
    { id: 'oware',       name: 'Oware',            iconPath: 'assets/icons/oware.svg',       href: 'games/oware.html' },
    { id: 'patolli',     name: 'Patolli',          iconPath: 'assets/icons/patolli.svg',     href: 'games/patolli.html' },
    { id: 'puluc',       name: 'Puluc',            iconPath: 'assets/icons/puluc.svg',       href: 'games/puluc.html' },
    { id: 'pallanguzhi', name: 'Pallanguzhi',      iconPath: 'assets/icons/pallanguzhi.svg', href: 'games/pallanguzhi.html' },
    { id: 'fanorona',    name: 'Fanorona',          iconPath: 'assets/icons/fanorona.svg',    href: 'games/fanorona.html' },
    { id: 'mahjong',     name: 'Hong Kong Mahjong', iconPath: '',                              href: 'games/mahjong.html' },
    { id: 'latrunculi',  name: 'Ludus Latrunculorum', iconPath: '',                            href: 'games/latrunculi.html' },
  ];

  /* ── Session storage key (custom — NOT the Supabase internal key) ── */
  var SB_SESSION_KEY = 'cg_session';

  /* ── In-memory state ── */
  var _sb           = null;
  var _accessToken  = null;  // current JWT access token
  var _user         = null;  // auth user object
  var _profile      = null;  // { username, created_at }
  var _stats        = {};    // { gameId: { wins, losses, played } }
  var _favorites    = new Set(); // Set of favorited game keys
  var _coins        = 0;         // coin balance
  var _refreshTimer = null;  // proactive token refresh timer
  var _listeners    = [];

  // DB client for public reads (anon key, no auth needed due to public read policies)
  function getSB() {
    if (!_sb) _sb = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return _sb;
  }

  // DB client with user JWT injected for authenticated writes (RLS)
  function _authedSB() {
    return window.supabase.createClient(SB_URL, SB_KEY, {
      global: { headers: { Authorization: 'Bearer ' + _accessToken } },
      auth:   { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  /* ── Session persistence ── */
  function _saveSession(data) {
    _accessToken = data.access_token;
    try {
      localStorage.setItem(SB_SESSION_KEY, JSON.stringify({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        token_type:    'bearer',
        expires_in:    data.expires_in || 3600,
        expires_at:    Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        user:          data.user,
      }));
    } catch (e) {}
  }

  function _clearSession() {
    _accessToken = null;
    try { localStorage.removeItem(SB_SESSION_KEY); } catch (e) {}
  }

  function _readStoredSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SB_SESSION_KEY));
      if (!s || !s.access_token || !s.user) return null;
      return s; // return even if expired — _boot() handles refresh
    } catch (e) { return null; }
  }

  /* ── Token refresh ── */
  async function _tryRefresh(refreshToken) {
    try {
      var res = await _authFetch('/token?grant_type=refresh_token', { refresh_token: refreshToken });
      if (!res.ok || !res.data.access_token) return false;
      _saveSession(res.data);
      _accessToken = res.data.access_token;
      if (res.data.user) _user = res.data.user;
      return true;
    } catch (e) { return false; }
  }

  function _scheduleRefresh(session) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    if (!session || !session.refresh_token || !session.expires_at) return;
    var msUntilExpiry  = session.expires_at * 1000 - Date.now();
    var msUntilRefresh = Math.max(msUntilExpiry - 5 * 60 * 1000, 10000); // 5 min before expiry, min 10s
    _refreshTimer = setTimeout(async function () {
      var s = _readStoredSession();
      if (!s || !s.refresh_token) return;
      var ok = await _tryRefresh(s.refresh_token);
      if (ok) {
        var fresh = _readStoredSession();
        if (fresh) _scheduleRefresh(fresh);
        _emit();
      } else {
        _clearSession();
        _user = null; _profile = null; _stats = {}; _favorites = new Set(); _coins = 0;
        _emit();
      }
    }, msUntilRefresh);
  }

  /* ── Auth REST helper (bypasses Supabase JS auth module) ── */
  async function _authFetch(path, body, token) {
    var headers = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var resp = await _withTimeout(
      fetch(SB_URL + '/auth/v1' + path, { method: 'POST', headers: headers, body: JSON.stringify(body) }),
      12000, 'Request timed out — check your connection and try again.'
    );
    var data = await resp.json();
    return { ok: resp.ok, data: data };
  }

  /* ── Event bus ── */
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
    if (d === 'games') return '../../profile/';
    if (d === 'pages') return '../profile/';
    return 'profile/';
  }

  /* ── Favorites — direct REST calls (bypasses Supabase JS auth override) ── */
  function _favCacheKey(userId) { return 'cg_favs_' + userId; }

  function _saveFavCache(userId) {
    try { localStorage.setItem(_favCacheKey(userId), JSON.stringify(Array.from(_favorites))); } catch (e) {}
  }

  // Raw PostgREST fetch — guarantees our JWT reaches RLS, no Supabase client interference
  function _pgFetch(method, path, body, extra) {
    var headers = {
      'apikey':        SB_KEY,
      'Authorization': 'Bearer ' + _accessToken,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    };
    if (method === 'POST') headers['Prefer'] = 'return=minimal';
    var opts = Object.assign({ method: method, headers: headers }, extra || {});
    if (body) opts.body = JSON.stringify(body);
    return fetch(SB_URL + '/rest/v1/' + path, opts);
  }

  async function _loadFavorites(userId) {
    // Seed from cache first so UI is instant on page load
    try {
      var cached = JSON.parse(localStorage.getItem(_favCacheKey(userId)));
      if (Array.isArray(cached)) _favorites = new Set(cached);
    } catch (e) {}

    // Confirm from server via raw fetch — explicit JWT header, no client override
    try {
      var resp = await _pgFetch('GET', 'favorites?select=game_key&user_id=eq.' + userId);
      if (resp.ok) {
        var data = await resp.json();
        _favorites = new Set(data.map(function (r) { return r.game_key; }));
        _saveFavCache(userId);
      }
      // Non-200 (table missing, RLS error, etc) → keep localStorage cache
    } catch (e) { /* keep cache */ }
  }

  function isFavorite(gameKey) { return _favorites.has(gameKey); }

  function getFavorites() { return Array.from(_favorites); }

  /* ── Coins ── */
  function getCoins() { return _coins; }

  async function addCoins(delta) {
    if (!_user || !_accessToken) return;
    _coins = Math.max(0, _coins + delta);
    _emit();
    // keepalive:true lets the request survive page navigation / room leave
    _pgFetch('PATCH', 'profiles?id=eq.' + _user.id, { coins: _coins }, { keepalive: true });
  }

  async function toggleFavorite(gameKey) {
    if (!_user || !_accessToken) return false;
    if (_favorites.has(gameKey)) {
      _favorites.delete(gameKey);
      _pgFetch('DELETE', 'favorites?user_id=eq.' + _user.id + '&game_key=eq.' + gameKey);
    } else {
      _favorites.add(gameKey);
      _pgFetch('POST', 'favorites', { user_id: _user.id, game_key: gameKey });
      // Award favourite achievement
      if (window.Achievements) Achievements.checkAction('set_favorite');
    }
    _saveFavCache(_user.id);
    _emit();
    return _favorites.has(gameKey);
  }

  /* ── Load profile + stats from DB after auth ── */
  async function _loadUserData(user) {
    _user = user;
    if (!user) { _profile = null; _stats = {}; _favorites = new Set(); _coins = 0; return; }

    var pRes = await getSB().from('profiles').select('username,created_at,coins').eq('id', user.id).single();
    _profile = pRes.data || { username: user.email.split('@')[0], created_at: user.created_at };
    _coins   = (pRes.data && pRes.data.coins) || 0;

    var sRes = await getSB().from('stats').select('game_id,wins,losses,played').eq('user_id', user.id);
    _stats = {};
    (sRes.data || []).forEach(function (row) {
      _stats[row.game_id] = { wins: row.wins, losses: row.losses, played: row.played };
    });

    await _loadFavorites(user.id);
  }

  /* ══════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════ */

  function isLoggedIn() { return _user !== null; }

  function getUser() {
    if (!_user || !_profile) return null;
    return {
      username:  _profile.username,
      email:     _user.email,
      createdAt: _profile.created_at,
    };
  }

  function _withTimeout(promise, ms, msg) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(msg || 'Request timed out.')); }, ms);
      }),
    ]);
  }

  async function signIn(email, password) {
    var res = await _authFetch('/token?grant_type=password', {
      email: email.trim().toLowerCase(), password: password,
    });
    if (!res.ok) return { ok: false, error: res.data.error_description || res.data.msg || 'Invalid email or password.' };
    _saveSession(res.data);
    _scheduleRefresh(_readStoredSession());
    try { await _loadUserData(res.data.user); } catch (e) { _user = res.data.user; }
    _emit();
    return { ok: true };
  }

  async function signUp(username, email, password) {
    username = (username || '').trim();
    email    = (email    || '').trim().toLowerCase();

    if (username.length < 3)
      return { ok: false, error: 'Username must be at least 3 characters.' };
    if (username.length > 20)
      return { ok: false, error: 'Username must be 20 characters or fewer.' };
    if (!/^[A-Za-z0-9_]+$/.test(username))
      return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' };
    if (!/\S+@\S+\.\S+/.test(email))
      return { ok: false, error: 'Please enter a valid email address.' };
    if (!password || password.length < 8)
      return { ok: false, error: 'Password must be at least 8 characters.' };

    // Check username availability
    var uCheck = await getSB().from('profiles').select('id').eq('username', username).limit(1);
    if (uCheck.data && uCheck.data.length)
      return { ok: false, error: 'That username is already taken.' };

    // Create auth user via REST
    var res = await _authFetch('/signup', { email: email, password: password });
    if (!res.ok) return { ok: false, error: res.data.error_description || res.data.msg || 'Sign up failed.' };
    if (!res.data.access_token) return { ok: false, error: 'Please confirm your email, then sign in.' };

    _saveSession(res.data);
    _scheduleRefresh(_readStoredSession());
    var userId = res.data.user.id;

    // Create profile + init stats using authed client
    var db = _authedSB();
    var pRes = await db.from('profiles').insert({ id: userId, username: username });
    if (pRes.error) return { ok: false, error: 'Account created but profile save failed. Try signing in.' };

    await db.from('stats').insert(
      GAMES.map(function (g) {
        return { user_id: userId, game_id: g.id, wins: 0, losses: 0, played: 0 };
      })
    );

    try { await _loadUserData(res.data.user); } catch (e) { _user = res.data.user; }
    _emit();
    return { ok: true };
  }

  async function signOut() {
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    if (_accessToken) {
      try { await _authFetch('/logout', {}, _accessToken); } catch (e) {}
    }
    if (_user) { try { localStorage.removeItem(_favCacheKey(_user.id)); } catch (e) {} }
    _clearSession();
    _user = null; _profile = null; _stats = {}; _favorites = new Set(); _coins = 0;
    _emit();
  }

  function getStats(gameId) {
    return _stats[gameId] || { wins: 0, losses: 0, played: 0 };
  }

  // Coin reward table — long-form games pay more for both outcomes.
  // Short-form games: win = 100, loss = 0.
  var COIN_REWARDS = {
    'mahjong':  { win: 500, loss: 150 },
    'tien-len': { win: 500, loss: 150 },
    'pachisi':  { win: 500, loss: 150 },
    'ganjifa':  { win: 500, loss: 150 },
  };

  function recordResult(gameId, outcome) {
    if (!_user || !_accessToken) return;
    if (!_stats[gameId]) _stats[gameId] = { wins: 0, losses: 0, played: 0 };
    _stats[gameId].played++;
    if (outcome === 'win')  _stats[gameId].wins++;
    if (outcome === 'loss') _stats[gameId].losses++;
    // Award coins based on game type
    var rewards   = COIN_REWARDS[gameId] || { win: 100, loss: 0 };
    var coinDelta = outcome === 'win'  ? rewards.win
                  : outcome === 'loss' ? rewards.loss
                  : 0;
    if (coinDelta > 0) addCoins(coinDelta);
    // Fire-and-forget upsert using authed client (RLS requires JWT)
    _authedSB().from('stats').upsert({
      user_id: _user.id,
      game_id: gameId,
      wins:    _stats[gameId].wins,
      losses:  _stats[gameId].losses,
      played:  _stats[gameId].played,
    }, { onConflict: 'user_id,game_id' });

    // Track win streak in localStorage
    var streakKey = 'cg-streak';
    var streak = 0;
    try { streak = parseInt(localStorage.getItem(streakKey) || '0', 10); } catch (e) {}
    if (outcome === 'win')  { streak++; } else { streak = 0; }
    try { localStorage.setItem(streakKey, streak); } catch (e) {}

    // Fire achievement evaluation
    if (window.Achievements) {
      Achievements.evaluate({
        gameId:   gameId,
        result:   outcome,
        isOnline: !!(window.Room && Room.currentRoom()),
        isHost:   !!(window.Room && Room.amHost()),
        stats:    _stats,
        streak:   streak,
      });
    }
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

    overlay.querySelectorAll('form').forEach(function (f) { f.reset(); });
    overlay.querySelectorAll('.auth-error').forEach(function (e) {
      e.textContent = ''; e.hidden = true;
    });
    var bar = document.getElementById('pw-strength-bar');
    if (bar) { bar.className = 'pw-strength__bar'; bar.style.width = '0'; }

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
            '<button class="btn btn-primary auth-submit" type="submit" id="si-submit">Sign In</button>' +
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
              '<input class="form-input" type="text" id="su-username" autocomplete="username" required minlength="3" maxlength="20" placeholder="Letters, numbers, underscores" />' +
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
            '<button class="btn btn-primary auth-submit" type="submit" id="su-submit">Create Account</button>' +
          '</form>' +
          '<div class="auth-divider"><span>or</span></div>' +
          '<p class="auth-switch">Already have an account? <button class="auth-switch-btn" id="to-signin">Sign in</button></p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);
    _wireModal(el);
  }

  function _setLoading(btnId, loading, defaultLabel) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait…' : defaultLabel;
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
    document.getElementById('form-signin').addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = document.getElementById('si-error');
      errEl.hidden = true;
      _setLoading('si-submit', true, 'Sign In');
      try {
        var result = await signIn(
          document.getElementById('si-email').value,
          document.getElementById('si-password').value
        );
        _setLoading('si-submit', false, 'Sign In');
        if (result.ok) {
          closeModal();
        } else {
          errEl.textContent = result.error;
          errEl.hidden = false;
        }
      } catch (err) {
        _setLoading('si-submit', false, 'Sign In');
        errEl.textContent = (err && err.message) ? err.message : 'Something went wrong. Please try again.';
        errEl.hidden = false;
      }
    });

    // Sign Up submit
    document.getElementById('form-signup').addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = document.getElementById('su-error');
      errEl.hidden = true;
      _setLoading('su-submit', true, 'Create Account');
      try {
        var result = await signUp(
          document.getElementById('su-username').value,
          document.getElementById('su-email').value,
          document.getElementById('su-password').value
        );
        _setLoading('su-submit', false, 'Create Account');
        if (result.ok) {
          closeModal();
        } else {
          errEl.textContent = result.error;
          errEl.hidden = false;
        }
      } catch (err) {
        _setLoading('su-submit', false, 'Create Account');
        errEl.textContent = (err && err.message) ? err.message : 'Something went wrong. Please try again.';
        errEl.hidden = false;
      }
    });

    // Password strength meter
    document.getElementById('su-password').addEventListener('input', function () {
      var pw = this.value;
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

    if (isLoggedIn() && _profile) {
      var init  = _esc(_profile.username.charAt(0).toUpperCase());
      var uname = _esc(_profile.username);

      container.innerHTML =
        '<div class="nav-auth">' +
          '<span class="nav-coins" aria-label="Coin balance" title="Your coins">💰 ' + _coins.toLocaleString() + '</span>' +
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
      document.getElementById('nav-signout-btn').addEventListener('click', async function () {
        await signOut();
      });

      if (mobileItem) {
        mobileItem.innerHTML =
          '<a href="' + acct + '" class="nav-link">My Account</a>' +
          '<button class="nav-link nav-auth-mobile-btn" id="mobile-signout-btn">Sign Out</button>';
        document.getElementById('mobile-signout-btn').addEventListener('click', async function () {
          await signOut();
        });
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

    var container = document.createElement('div');
    container.id  = 'nav-auth';
    hamburger.parentNode.insertBefore(container, hamburger);

    var mobileItem    = document.createElement('li');
    mobileItem.id     = 'nav-auth-mobile';
    mobileItem.className = 'nav-auth-mobile-item';
    navLinks.appendChild(mobileItem);

    _renderNavWidget();

    document.addEventListener('click', function (e) {
      var dd  = document.getElementById('nav-auth-dropdown');
      var btn = document.getElementById('nav-auth-trigger');
      if (dd && !dd.hidden && btn && !btn.contains(e.target)) {
        dd.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    onAuthChange(function () {
      _renderNavWidget();
      _renderFooterLink();
    });
  }

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

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */

  async function _boot() {
    _buildModal();
    _injectNavWidget();
    _renderFooterLink();

    var stored = _readStoredSession();
    if (stored) {
      var isExpired = stored.expires_at && stored.expires_at * 1000 < Date.now();
      if (isExpired) {
        if (stored.refresh_token) {
          var refreshed = await _tryRefresh(stored.refresh_token);
          if (refreshed) {
            stored = _readStoredSession();
          } else {
            _clearSession();
            stored = null;
          }
        } else {
          _clearSession();
          stored = null;
        }
      }
    }

    if (stored) {
      _accessToken = stored.access_token;
      _user        = stored.user;
      _profile     = { username: stored.user.email.split('@')[0], created_at: stored.user.created_at };
      _scheduleRefresh(stored);
      // Pre-load favorites from cache so UI is instant before server responds
      try {
        var cachedFavs = JSON.parse(localStorage.getItem(_favCacheKey(stored.user.id)));
        if (Array.isArray(cachedFavs)) _favorites = new Set(cachedFavs);
      } catch (e) {}
    }

    // Defer emit one tick so all DOMContentLoaded handlers (including account page)
    // have registered their onAuthChange callbacks before we fire
    setTimeout(function () {
      _emit();
      if (stored) {
        _loadUserData(stored.user)
          .then(function () { _emit(); })
          .catch(function () {});
      }
    }, 0);
  }

  function _loadSBThenBoot() {
    if (window.supabase) { _boot(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.onload = function () { _boot(); };
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', _loadSBThenBoot);

  /* ── Public API ── */
  window.Auth = {
    isLoggedIn:     isLoggedIn,
    getUser:        getUser,
    signIn:         signIn,
    signUp:         signUp,
    signOut:        signOut,
    getStats:       getStats,
    recordResult:   recordResult,
    onAuthChange:   onAuthChange,
    openModal:      openModal,
    closeModal:     closeModal,
    isFavorite:     isFavorite,
    getFavorites:   getFavorites,
    toggleFavorite: toggleFavorite,
    getCoins:       getCoins,
    addCoins:       addCoins,
    GAMES:          GAMES,
  };

}());
