/**
 * profile.js — Profile & Achievements page logic.
 * Reads from Auth, Achievements, and GAMES_DATA.
 */
(function () {
  'use strict';

  /* ── helpers ── */
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function countUp(el, target, suffix, delay) {
    setTimeout(function () {
      if (target === 0) { el.textContent = '0' + (suffix || ''); return; }
      var start = performance.now();
      var dur   = Math.min(900, 300 + target * 18);
      function tick(now) {
        var p = Math.min((now - start) / dur, 1);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(e * target) + (suffix || '');
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay || 0);
  }

  /* ── state ── */
  var _filterCategory = '';
  var _filterTier     = '';
  var _filterStatus   = '';

  /* ── render hero ── */
  function renderHero() {
    var user = Auth.getUser();
    if (!user) return;

    document.getElementById('prof-initial').textContent  = user.username.charAt(0).toUpperCase();
    document.getElementById('prof-username').textContent = user.username;
    document.getElementById('prof-joined').textContent   = 'Member since ' + fmtDate(user.createdAt);

    var allGames       = window.GAMES_DATA || [];
    var totalPlayed    = 0;
    var totalWins      = 0;
    var culturesPlayed = new Set();

    allGames.forEach(function (g) {
      var s = Auth.getStats(g.key || g.id);
      if (!s) return;
      totalPlayed += s.played;
      totalWins   += s.wins;
      if (s.played > 0 && g.culture) culturesPlayed.add(g.culture);
    });

    var winRate = totalPlayed > 0 ? Math.round(totalWins / totalPlayed * 100) : 0;

    countUp(document.getElementById('prof-stat-played'),   totalPlayed,         '',  100);
    countUp(document.getElementById('prof-stat-winrate'),  winRate,             '%', 180);
    countUp(document.getElementById('prof-stat-cultures'), culturesPlayed.size, '',  260);
    countUp(document.getElementById('prof-stat-coins'),    Auth.getCoins ? Auth.getCoins() : 0, '', 340);

    // Achievement count
    var unlockedCount  = window.Achievements ? Achievements.getUnlocked().length : 0;
    var totalAchCount  = window.Achievements ? Achievements.ACHIEVEMENTS.length  : 0;
    countUp(document.getElementById('prof-stat-achievements'), unlockedCount, '/' + totalAchCount, 420);
  }

  /* ── render game stats ── */
  function renderStats() {
    var grid = document.getElementById('prof-stats-grid');
    if (!grid) return;

    var allGames = window.GAMES_DATA || [];

    grid.innerHTML = allGames.map(function (game) {
      var id   = game.key || game.id;
      var s    = Auth.getStats(id);
      var rate = s.played > 0 ? Math.round(s.wins / s.played * 100) : 0;

      var iconHtml = '<img src="../assets/icons/' + esc(id) + '.svg" class="prof-gsc__icon" aria-hidden="true" alt="" onerror="this.style.display=\'none\'" />';

      var body = s.played === 0
        ? '<p class="prof-gsc__empty">No games played yet.</p>'
        : '<div class="prof-gsc__nums">' +
            '<div class="prof-gsc__num">' +
              '<span class="prof-gsc__num-val">' + s.played + '</span>' +
              '<span class="prof-gsc__num-lab">Played</span>' +
            '</div>' +
            '<div class="prof-gsc__num">' +
              '<span class="prof-gsc__num-val prof-gsc__num-val--win">' + s.wins + '</span>' +
              '<span class="prof-gsc__num-lab">Won</span>' +
            '</div>' +
            '<div class="prof-gsc__num">' +
              '<span class="prof-gsc__num-val prof-gsc__num-val--loss">' + s.losses + '</span>' +
              '<span class="prof-gsc__num-lab">Lost</span>' +
            '</div>' +
          '</div>' +
          '<div class="prof-gsc__bar-wrap"><div class="prof-gsc__bar" data-rate="' + rate + '" style="width:0%"></div></div>' +
          '<p class="prof-gsc__rate">' + rate + '% win rate</p>';

      return '<div class="prof-gsc prof-reveal">' +
        '<div class="prof-gsc__header">' + iconHtml +
          '<span class="prof-gsc__name">' + esc(game.name) + '</span>' +
        '</div>' +
        '<div class="prof-gsc__body">' + body +
          '<a href="../pages/games/' + esc(id) + '.html" class="btn btn-sm btn-secondary" style="align-self:flex-start;margin-top:4px">Play &#8594;</a>' +
        '</div>' +
      '</div>';
    }).join('');

    // Animate win bars on scroll
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var bar = e.target.querySelector('.prof-gsc__bar');
        if (bar) bar.style.width = bar.dataset.rate + '%';
        io.unobserve(e.target);
      });
    }, { threshold: 0.3 });
    grid.querySelectorAll('.prof-gsc').forEach(function (el) { io.observe(el); });
  }

  /* ── render achievements ── */
  function renderAchievements() {
    if (!window.Achievements) return;

    var all          = Achievements.ACHIEVEMENTS;
    var unlockedSet  = {};
    Achievements.getUnlocked().forEach(function (id) { unlockedSet[id] = true; });

    var total    = all.length;
    var unlocked = Achievements.getUnlocked().length;

    // Progress
    var pct = total > 0 ? Math.round(unlocked / total * 100) : 0;
    document.getElementById('ach-count').textContent = unlocked + ' / ' + total + ' unlocked';
    var bar = document.getElementById('ach-progress-bar');
    if (bar) setTimeout(function () { bar.style.width = pct + '%'; }, 100);

    // Apply filters
    var filtered = all.filter(function (a) {
      if (_filterCategory && a.category !== _filterCategory) return false;
      if (_filterTier     && a.tier      !== _filterTier)     return false;
      if (_filterStatus === 'unlocked' && !unlockedSet[a.id]) return false;
      if (_filterStatus === 'locked'   &&  unlockedSet[a.id]) return false;
      return true;
    });

    var grid = document.getElementById('ach-grid');
    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = '<p class="ach-empty">No achievements match your filters.</p>';
      return;
    }

    var TIER_ICONS = { bronze: '&#127942;', silver: '&#127942;', gold: '&#127942;' };
    var TIER_COLORS = { bronze: '#CD7F32', silver: '#A8A9AD', gold: '#D4A017' };

    grid.innerHTML = filtered.map(function (a) {
      var isUnlocked = !!unlockedSet[a.id];
      var stateClass = isUnlocked ? 'ach-card--unlocked' : 'ach-card--locked';
      var tierColor  = TIER_COLORS[a.tier] || '#CD7F32';

      return '<div class="ach-card ach-card--' + esc(a.tier) + ' ' + stateClass + ' prof-reveal" role="listitem">' +
        '<span class="ach-card__category">' + esc(a.category) + '</span>' +
        '<div class="ach-card__header">' +
          '<div class="ach-card__icon" aria-hidden="true" style="color:' + tierColor + '">' + (TIER_ICONS[a.tier] || '&#127942;') + '</div>' +
          '<div class="ach-card__meta">' +
            '<p class="ach-card__title">' + esc(a.title) + '</p>' +
            '<p class="ach-card__tier">' + esc(a.tier) + '</p>' +
          '</div>' +
        '</div>' +
        '<p class="ach-card__desc">' + esc(a.description) + '</p>' +
        (isUnlocked ? '<p class="ach-card__badge">&#10003; Unlocked</p>' : '') +
      '</div>';
    }).join('');

    initReveal();
  }

  /* ── scroll-reveal ── */
  function initReveal() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('prof-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.prof-reveal:not(.prof-in)').forEach(function (el) { io.observe(el); });
  }

  /* ── filter controls ── */
  function bindFilters() {
    var catSel    = document.getElementById('ach-filter-category');
    var tierSel   = document.getElementById('ach-filter-tier');
    var statusSel = document.getElementById('ach-filter-status');

    if (catSel)    catSel.addEventListener('change',    function () { _filterCategory = this.value; renderAchievements(); });
    if (tierSel)   tierSel.addEventListener('change',   function () { _filterTier     = this.value; renderAchievements(); });
    if (statusSel) statusSel.addEventListener('change', function () { _filterStatus   = this.value; renderAchievements(); });
  }

  /* ── main render ── */
  var _settled = false;

  function render() {
    var loggedIn    = window.Auth && Auth.isLoggedIn();
    var placeholder = document.getElementById('prof-locked');
    var dashboard   = document.getElementById('prof-dashboard');

    if (!loggedIn) {
      if (!_settled) return;
      if (placeholder) placeholder.style.display = 'flex';
      if (dashboard)   dashboard.hidden = true;
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (dashboard)   dashboard.hidden = false;

    renderHero();
    renderStats();
    renderAchievements();
    initReveal();
  }

  document.addEventListener('DOMContentLoaded', function () {
    _settled = true;
    render();
    bindFilters();

    if (window.Auth) Auth.onAuthChange(function () { render(); });

    var pSignin = document.getElementById('prof-signin-btn');
    var pSignup = document.getElementById('prof-signup-btn');
    if (pSignin) pSignin.addEventListener('click', function () { Auth.openModal('signin'); });
    if (pSignup) pSignup.addEventListener('click', function () { Auth.openModal('signup'); });
  });

}());
