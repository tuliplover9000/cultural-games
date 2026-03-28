/**
 * browse-panel.js — Cultural Games browse page side panel
 * Shows game details on hover (desktop) / tap (mobile bottom sheet).
 * Prefix: bp-
 */
(function () {
  'use strict';

  /* ── World map SVG ────────────────────────────────────────────────────
   * Equirectangular projection. ViewBox 0 0 1000 500.
   * svgX = (lon+180)/360*1000,  svgY = (90-lat)/180*500
   * Base land paths (bp-map-land) draw continent shapes.
   * data-region paths are transparent overlays that highlight on hover.
   * Each continent is traced ~20-35 keypoints clockwise from NW corner.
   * ──────────────────────────────────────────────────────────────────── */
  var MAP_SVG = [
    '<svg id="bp-world-map" viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '<rect class="bp-map-ocean" width="1000" height="500"/>',

    /* ── Base land shapes ─────────────────────────────────────────────── */

    /* North America — Alaska → Canada N → Labrador → E coast → Gulf →
       Yucatan → Panama → Pacific coast → back to Alaska             */
    '<path class="bp-map-land" d="M42,69L131,56L167,44L250,47L272,83L319,75L347,100L353,119L328,125L306,133L278,175L275,181L231,178L231,194L258,192L250,206L264,219L286,228L236,206L194,186L172,158L156,128L150,108L128,92L75,92L42,97Z"/>',

    /* Greenland */
    '<path class="bp-map-land" d="M347,39L403,19L450,36L439,53L372,72Z"/>',

    /* South America — Colombia/Venezuela N coast → Brazil bulge →
       Cape Horn → Chile W coast → Ecuador → back to Panama          */
    '<path class="bp-map-land" d="M286,228L289,219L314,219L331,219L342,231L361,244L403,261L403,272L394,286L389,308L381,314L372,317L356,336L339,347L319,367L311,400L308,406L292,400L294,364L306,300L286,272L278,253L286,244Z"/>',

    /* Iceland */
    '<path class="bp-map-land" d="M433,67L450,67L464,69L442,75L433,75Z"/>',

    /* Europe — N Norway → Finland/Russia NW → Black Sea coast →
       Turkey W → Balkans → Adriatic → Italy → Iberia → Bay of Biscay →
       N Sea coast → Scandinavia → N Norway                           */
    '<path class="bp-map-land" d="M544,53L572,53L581,56L592,61L592,78L583,83L567,89L558,94L550,97L539,100L528,97L514,103L506,108L494,119L492,128L475,128L475,144L486,150L500,147L514,131L525,128L539,128L547,139L544,144L550,139L556,139L561,147L572,144L581,136L594,122L600,119L606,97L583,69Z"/>',

    /* British Isles (UK main island) */
    '<path class="bp-map-land" d="M483,89L494,89L500,108L486,111L486,100Z"/>',
    /* Ireland */
    '<path class="bp-map-land" d="M472,106L483,97L472,100Z"/>',

    /* Africa — Morocco NW → Libya/Egypt N coast → Horn of Africa →
       E coast → Cape of Good Hope → Namibia → W coast → Senegal →
       Morocco W                                                       */
    '<path class="bp-map-land" d="M461,150L528,158L589,164L619,217L642,219L617,253L611,281L597,300L583,336L550,344L542,333L533,297L525,258L508,242L492,236L467,233L458,219L453,208L453,192L461,167Z"/>',

    /* Madagascar */
    '<path class="bp-map-land" d="M619,283L636,283L639,319L622,322Z"/>',

    /* Asia — Turkey W → Caucasus → Ural → N Russia → Pacific coast →
       Japan lat → SE Asia → India S tip → India W → Arabia → Red Sea →
       Turkey                                                          */
    '<path class="bp-map-land" d="M581,136L600,133L619,131L639,133L667,106L667,61L722,50L833,50L950,75L1000,83L1000,122L892,153L839,183L803,217L789,247L722,228L700,189L672,181L661,189L625,217L597,172Z"/>',

    /* Japan (Honshu simplified) */
    '<path class="bp-map-land" d="M892,139L892,153L861,164L861,153Z"/>',

    /* Australia */
    '<path class="bp-map-land" d="M819,311L867,289L878,289L906,297L928,325L919,353L864,342L819,344Z"/>',

    /* New Zealand (N + S island) */
    '<path class="bp-map-land" d="M981,347L989,358L983,369L978,358Z"/>',
    '<path class="bp-map-land" d="M970,367L978,375L970,386L964,381Z"/>',

    /* ── Region highlight overlays ────────────────────────────────────── */

    /* south-america: full South America shape */
    '<path data-region="south-america" d="M286,228L289,219L314,219L342,231L361,244L403,261L403,272L394,286L389,308L381,314L356,336L339,347L319,367L311,400L308,406L292,400L294,364L306,300L286,272L278,253L286,244Z"/>',

    /* mesoamerica: Mexico + Central America (US border → Panama, Pacific back) */
    '<path data-region="mesoamerica" d="M175,167L231,178L258,189L258,192L269,222L286,228L236,206L194,186L175,186Z"/>',

    /* west-africa: Senegal → Ghana coast → Gabon → Congo coast */
    '<path data-region="west-africa" d="M453,208L508,236L525,258L497,264L453,236Z"/>',

    /* north-africa: Morocco/Sahara → Egypt → Horn top → Central Africa N */
    '<path data-region="north-africa" d="M453,147L589,147L639,217L542,236L497,236L453,208Z"/>',

    /* northern-europe: Scandinavia + Baltics (lat 48–72, lon -10 to 32) */
    '<path data-region="northern-europe" d="M472,50L592,50L606,97L583,83L567,89L558,94L550,97L539,100L528,97L514,103L472,103Z"/>',

    /* southern-europe: Iberia + France + Italy + Balkans + Turkey W */
    '<path data-region="southern-europe" d="M472,111L606,97L594,122L600,119L581,136L561,147L544,144L514,131L492,128L475,128L475,144L486,150L472,150Z"/>',

    /* central-asia: Kazakhstan + stans + Xinjiang (lat 35–55, lon 50–100) */
    '<path data-region="central-asia" d="M639,97L778,97L778,153L639,153Z"/>',

    /* south-asia: Indian subcontinent (lat 5–37, lon 60–92) */
    '<path data-region="south-asia" d="M667,147L756,172L722,236L689,228L667,189Z"/>',

    /* southeast-asia: mainland SE Asia + maritime (lat -10 to 25, lon 95–130) */
    '<path data-region="southeast-asia" d="M764,181L861,181L861,278L764,278Z"/>',

    /* east-asia: China + Korea + Japan (lat 20–55, lon 100–148) */
    '<path data-region="east-asia" d="M778,97L911,125L903,194L778,194Z"/>',

    /* madagascar: highlight + glow in CSS */
    '<path data-region="madagascar" d="M619,283L636,283L639,319L622,322Z"/>',

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
