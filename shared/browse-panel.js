/**
 * browse-panel.js — Cultural Games browse page side panel
 * Shows game details on hover (desktop) / tap (mobile bottom sheet).
 * Prefix: bp-
 */
(function () {
  'use strict';

  /* ── Simplified world map SVG ─────────────────────────────────────────
   * Equirectangular projection. ViewBox 0 0 1000 500.
   * svgX = (lon+180)/360*1000,  svgY = (90-lat)/180*500
   * Base land paths provide the continent shapes (bp-map-land class).
   * data-region paths are transparent overlays that highlight on hover.
   * ──────────────────────────────────────────────────────────────────── */
  var MAP_SVG = [
    '<svg id="bp-world-map" viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '<rect class="bp-map-ocean" width="1000" height="500"/>',

    /* ── Base land shapes (visual only, no data-region) ── */
    /* North America + Mesoamerica */
    '<path class="bp-map-land" d="M45,83L222,45L352,97L322,133L295,200L280,238L258,248L245,238L168,190L153,147L112,86Z"/>',
    /* Greenland */
    '<path class="bp-map-land" d="M348,64L375,50L417,17L452,30L436,50Z"/>',
    /* South America */
    '<path class="bp-map-land" d="M270,245L380,205L410,268L410,328L387,418L300,418L268,358Z"/>',
    /* Europe */
    '<path class="bp-map-land" d="M472,52L550,50L600,75L608,122L585,148L520,158L475,148L460,108Z"/>',
    /* Africa */
    '<path class="bp-map-land" d="M455,148L600,148L648,202L652,305L602,375L532,392L448,360L428,272L442,200Z"/>',
    /* Asia (Turkey → Russia N → Pacific → SE Asia → India → Arabia) */
    '<path class="bp-map-land" d="M582,140L592,55L1000,55L1000,280L905,280L782,270L722,225L668,185L650,220L600,195Z"/>',
    /* Australia */
    '<path class="bp-map-land" d="M822,312L868,293L908,298L932,330L922,418L826,430L772,395Z"/>',
    /* Madagascar (also used as region overlay) */
    '<path class="bp-map-land" d="M622,280L640,278L649,323L636,342L618,320Z"/>',

    /* ── Region highlight overlays ── */
    '<path data-region="south-america"  d="M270,245L380,205L410,268L410,328L387,418L300,418L268,358Z"/>',
    '<path data-region="mesoamerica"    d="M168,190L258,175L280,238L258,248L245,238L153,210Z"/>',
    '<path data-region="west-africa"    d="M450,208L530,208L540,265L492,268L450,250Z"/>',
    '<path data-region="north-africa"   d="M450,148L600,148L648,202L540,265L530,208L450,208Z"/>',
    '<path data-region="northern-europe" d="M472,52L589,52L589,117L472,117Z"/>',
    '<path data-region="southern-europe" d="M472,117L611,117L611,153L472,153Z"/>',
    '<path data-region="central-asia"   d="M639,97L778,97L778,153L639,153Z"/>',
    '<path data-region="south-asia"     d="M667,147L752,147L724,236L690,228Z"/>',
    '<path data-region="southeast-asia" d="M764,181L847,181L847,278L764,278Z"/>',
    '<path data-region="east-asia"      d="M778,97L911,97L911,194L778,194Z"/>',
    '<path data-region="madagascar"     d="M622,280L640,278L649,323L636,342L618,320Z"/>',
    '</svg>',
  ].join('');

  /* ── Panel object ─────────────────────────────────────────────────── */
  var BrowsePanel = {
    currentGame: null,
    isMobile: false,

    init: function () {
      this.isMobile = window.innerWidth < 900;
      this.injectMap();
      this.bindCardHovers();
      this.bindMobileSheetTriggers();
      this.bindFavourite();
      this.showFeaturedGame();
      var self = this;
      window.addEventListener('resize', function () {
        self.isMobile = window.innerWidth < 900;
      });
    },

    injectMap: function () {
      var c = document.getElementById('bp-map-container');
      if (c) c.innerHTML = MAP_SVG;
    },

    showFeaturedGame: function () {
      var games = window.GAMES_DATA || [];
      if (!games.length) return;
      var g = games[Math.floor(Math.random() * games.length)];
      this.populatePanel(g);
    },

    /* ── Populate desktop panel ──────────────────────────────────────── */
    populatePanel: function (game) {
      var panel = document.getElementById('bp-panel');
      if (!panel) return;

      var set = function (id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text || '';
      };

      set('bp-game-title',    game.name);
      set('bp-region-name',   game.culture);
      set('bp-origin-story',  game.description || '');
      set('bp-dyk-text',      game.didYouKnow  || '');
      set('bp-players',       '\uD83D\uDC65 ' + (game.players || ''));

      var badge = document.getElementById('bp-category-badge');
      if (badge) {
        badge.textContent  = game.type || '';
        badge.className    = 'badge badge--' + (game.type || '').toLowerCase();
      }

      this.renderComplexity(game.complexity || 1);
      this.highlightRegion(game.region || '');

      var p = game.path || '#';
      var playNow = document.getElementById('bp-play-now');
      if (playNow) playNow.setAttribute('href', p);
      var playFriends = document.getElementById('bp-play-friends');
      if (playFriends) playFriends.setAttribute('href', 'rooms.html?create=' + encodeURIComponent(game.key));

      this.updateFavouriteBtn(game.key);

      var content = document.getElementById('bp-content');
      if (content) {
        content.removeAttribute('hidden');
        content.classList.remove('bp-fade-in');
        void content.offsetWidth; // force reflow to re-trigger animation
        content.classList.add('bp-fade-in');
      }
      var def = document.getElementById('bp-default');
      if (def) def.setAttribute('hidden', '');

      this.currentGame = game;
    },

    /* ── Complexity dots ─────────────────────────────────────────────── */
    renderComplexity: function (level) {
      var el = document.getElementById('bp-complexity');
      if (!el) return;
      var html = '<span class="bp-complexity-label">Complexity</span><span class="bp-dots">';
      for (var i = 1; i <= 5; i++) {
        var cls = i <= level ? 'bp-dot bp-dot--filled' : 'bp-dot bp-dot--empty';
        var sty = i <= level ? ' style="animation-delay:' + ((i - 1) * 50) + 'ms"' : '';
        html += '<span class="' + cls + '"' + sty + '></span>';
      }
      html += '</span>';
      el.innerHTML = html;
    },

    /* ── Map region highlight ────────────────────────────────────────── */
    highlightRegion: function (regionKey) {
      var map = document.getElementById('bp-world-map');
      if (!map) return;
      var all = map.querySelectorAll('[data-region]');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('bp-region-active');
      if (regionKey) {
        var t = map.querySelector('[data-region="' + regionKey + '"]');
        if (t) t.classList.add('bp-region-active');
      }
    },

    /* ── Favourite button ────────────────────────────────────────────── */
    updateFavouriteBtn: function (key) {
      var btn = document.getElementById('bp-favourite');
      if (!btn) return;
      var isFav = window.Auth && Auth.isLoggedIn && Auth.isLoggedIn() && Auth.isFavorite(key);
      btn.setAttribute('aria-pressed', String(!!isFav));
      btn.setAttribute('aria-label', isFav ? 'Remove from favourites' : 'Add to favourites');
      btn.classList.toggle('bp-fav-active', !!isFav);
      btn.querySelector('svg').setAttribute('fill', isFav ? '#e74c3c' : 'none');
    },

    bindFavourite: function () {
      var self = this;
      var btn = document.getElementById('bp-favourite');
      if (!btn) return;
      btn.addEventListener('click', function () {
        if (!self.currentGame) return;
        if (!window.Auth || !Auth.isLoggedIn || !Auth.isLoggedIn()) {
          if (window.Auth && Auth.openModal) Auth.openModal('signin');
          return;
        }
        Auth.toggleFavorite(self.currentGame.key).then(function () {
          self.updateFavouriteBtn(self.currentGame.key);
        });
      });
    },

    /* ── Card hover / focus bindings ─────────────────────────────────── */
    bindCardHovers: function () {
      var self = this;
      var wrappers = document.querySelectorAll('.game-card-wrapper[data-game-key]');
      for (var i = 0; i < wrappers.length; i++) {
        (function (wrapper) {
          var key  = wrapper.getAttribute('data-game-key');
          var game = (window.GAMES_DATA || []).filter(function (g) { return g.key === key; })[0];
          if (!game) return;
          wrapper.addEventListener('mouseenter', function () {
            if (!self.isMobile) self.populatePanel(game);
          });
          // keyboard focus: capture on inner focusable elements
          wrapper.addEventListener('focusin', function () {
            if (!self.isMobile) self.populatePanel(game);
          });
        })(wrappers[i]);
      }
    },

    /* ── Mobile bottom sheet ─────────────────────────────────────────── */
    bindMobileSheetTriggers: function () {
      var self = this;
      var wrappers = document.querySelectorAll('.game-card-wrapper[data-game-key]');
      for (var i = 0; i < wrappers.length; i++) {
        (function (wrapper) {
          var key  = wrapper.getAttribute('data-game-key');
          var game = (window.GAMES_DATA || []).filter(function (g) { return g.key === key; })[0];
          if (!game) return;
          wrapper.addEventListener('touchend', function (e) {
            if (!self.isMobile) return;
            if (e.target.closest('a, button')) return; // let play-button navigate normally
            e.preventDefault();
            self.showSheet(game);
          });
        })(wrappers[i]);
      }

      var backdrop = document.getElementById('bp-sheet-backdrop');
      if (backdrop) backdrop.addEventListener('click', function () { self.hideSheet(); });

      var closeBtn = document.getElementById('bp-sheet-close');
      if (closeBtn) closeBtn.addEventListener('click', function () { self.hideSheet(); });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.hideSheet();
      });
    },

    showSheet: function (game) {
      this.populateSheetContent(game);
      var sheet    = document.getElementById('bp-bottom-sheet');
      var backdrop = document.getElementById('bp-sheet-backdrop');
      if (!sheet || !backdrop) return;
      sheet.removeAttribute('hidden');
      backdrop.removeAttribute('hidden');
      requestAnimationFrame(function () {
        sheet.classList.add('bp-sheet-open');
      });
      document.body.classList.add('bp-no-scroll');
    },

    hideSheet: function () {
      var sheet    = document.getElementById('bp-bottom-sheet');
      var backdrop = document.getElementById('bp-sheet-backdrop');
      if (!sheet || !sheet.classList.contains('bp-sheet-open')) return;
      sheet.classList.remove('bp-sheet-open');
      setTimeout(function () {
        if (sheet)    sheet.setAttribute('hidden', '');
        if (backdrop) backdrop.setAttribute('hidden', '');
        document.body.classList.remove('bp-no-scroll');
      }, 300);
    },

    populateSheetContent: function (game) {
      var sc = document.getElementById('bp-sheet-content');
      if (!sc) return;
      var qs = function (sel) { return sc.querySelector(sel); };
      var setT = function (sel, txt) { var el = qs(sel); if (el) el.textContent = txt || ''; };
      setT('.bp-sheet-title',   game.name);
      setT('.bp-sheet-culture', game.culture);
      setT('.bp-sheet-desc',    game.description || '');
      setT('.bp-sheet-dyk',     game.didYouKnow  || '');
      var playNow = qs('.bp-sheet-play-now');
      if (playNow) playNow.setAttribute('href', game.path || '#');
      var playFriends = qs('.bp-sheet-play-friends');
      if (playFriends) playFriends.setAttribute('href', 'rooms.html?create=' + encodeURIComponent(game.key));
    },
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('bp-panel')) BrowsePanel.init();
  });
})();
