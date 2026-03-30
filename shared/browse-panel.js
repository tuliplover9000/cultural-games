/**
 * browse-panel.js — Cultural Games browse page side panel
 * Shows game details on hover (desktop) / tap (mobile bottom sheet).
 * Prefix: bp-
 */
(function () {
  'use strict';

  /* ── Region → ISO 3166-1 numeric country codes ───────────────────────
   * Used to assign data-region to D3-rendered country paths.
   * world-atlas countries-110m uses numeric ISO codes as feature.id.
   * ──────────────────────────────────────────────────────────────────── */
  var REGION_COUNTRIES = {
    'southeast-asia':  [96,116,360,418,104,458,608,702,626,764,704],
    // Brunei, Cambodia, Indonesia, Laos, Myanmar, Malaysia, Philippines,
    // Singapore, Timor-Leste, Thailand, Vietnam
    'west-africa':     [132,204,270,288,324,430,466,478,562,566,624,686,694,768,854,384],
    // Cape Verde, Benin, Gambia, Ghana, Guinea, Liberia, Mali, Mauritania,
    // Niger, Nigeria, Guinea-Bissau, Senegal, Sierra Leone, Togo, Burkina Faso, Ivory Coast
    'south-asia':      [50,64,356,462,524,586,144],
    // Bangladesh, Bhutan, India, Maldives, Nepal, Pakistan, Sri Lanka
    'east-asia':       [156,158,392,408,410,496],
    // China, Taiwan, Japan, North Korea, South Korea, Mongolia
    'mesoamerica':     [84,188,222,320,340,484,558,591],
    // Belize, Costa Rica, El Salvador, Guatemala, Honduras, Mexico, Nicaragua, Panama
    'south-america':   [32,68,76,152,170,218,254,328,600,604,740,858,862],
    // Argentina, Bolivia, Brazil, Chile, Colombia, Ecuador, French Guiana,
    // Guyana, Paraguay, Peru, Suriname, Uruguay, Venezuela
    'northern-europe': [208,233,246,352,428,440,578,752],
    // Denmark, Estonia, Finland, Iceland, Latvia, Lithuania, Norway, Sweden
    'southern-europe': [8,40,56,70,100,191,250,276,300,348,380,492,499,528,620,642,688,705,724,756,792,807],
    // Albania, Austria, Belgium, Bosnia, Bulgaria, Croatia, France, Germany,
    // Greece, Hungary, Italy, Monaco, Montenegro, Netherlands, Portugal,
    // Romania, Serbia, Slovenia, Spain, Switzerland, Turkey, North Macedonia
    'central-asia':    [4,31,51,156,268,364,398,417,496,762,795,860],
    // Afghanistan, Azerbaijan, Armenia, China, Georgia, Iran, Kazakhstan,
    // Kyrgyzstan, Mongolia, Tajikistan, Turkmenistan, Uzbekistan
    'madagascar':      [450],
  };

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
      if (this.isMobile) return;
      var self = this;
      var container = document.getElementById('bp-map-container');
      if (!container) return;

      var NS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'bp-world-map');
      svg.setAttribute('viewBox', '0 0 960 500');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'width:100%;height:auto;display:block;';

      var bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('class', 'bp-map-ocean');
      bg.setAttribute('width', '960');
      bg.setAttribute('height', '500');
      svg.appendChild(bg);
      container.appendChild(svg);

      if (!window.topojson) return;

      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
        .then(function (r) { return r.json(); })
        .then(function (world) {
          var features = topojson.feature(world, world.objects.countries).features;

          features.forEach(function (feature) {
            var iso = +feature.id;
            if (iso === 10) return; /* skip Antarctica */
            var d = self.geoFeatureToPath(feature);
            if (!d) return;
            var region = self.getRegionForCountry(iso);
            var el = document.createElementNS(NS, 'path');
            el.setAttribute('d', d);
            el.setAttribute('class', 'bp-map-land');
            if (region) el.setAttribute('data-region', region);
            svg.appendChild(el);
          });

          if (self.currentGame && self.currentGame.region) {
            self.highlightRegion(self.currentGame.region);
          }
        })
        .catch(function () { /* ocean fallback */ });
    },

    /* ── Inline equirectangular projection ───────────────────────────── */
    /* Latitude is clamped to 83°N → 57°S so Antarctica and empty       */
    /* Arctic don't bloat the map. ViewBox stays 0 0 960 500.           */
    /* Miller cylindrical projection — reduces high-latitude stretching.
     * Constants pre-computed for lat range 83°N → 57°S:
     *   millerY(83°N)  ≈  1.880
     *   millerY(-57°S) ≈ -1.114   range ≈ 2.994
     * ViewBox 960×500 chosen for panel proportions.                    */
    _MILLER_YMAX: 1.880, _MILLER_YRANGE: 2.994,

    geoProject: function (lon, lat) {
      var latRad = lat * Math.PI / 180;
      var my = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * latRad));
      return [
        (lon + 180) / 360 * 960,
        (this._MILLER_YMAX - my) / this._MILLER_YRANGE * 500,
      ];
    },

    geoRingToD: function (ring) {
      var d = '';
      var prevLon = null;
      for (var i = 0; i < ring.length; i++) {
        var lon = ring[i][0], lat = ring[i][1];
        var p = this.geoProject(lon, lat);
        /* Jump > 180° in lon = antimeridian crossing → lift pen */
        var cmd = (i === 0 || (prevLon !== null && Math.abs(lon - prevLon) > 180))
                  ? 'M' : 'L';
        d += cmd + p[0].toFixed(1) + ',' + p[1].toFixed(1);
        prevLon = lon;
      }
      return d + 'Z';
    },

    geoFeatureToPath: function (feature) {
      var g = feature.geometry;
      if (!g) return '';
      var polys = g.type === 'Polygon'      ? [g.coordinates] :
                  g.type === 'MultiPolygon' ?  g.coordinates  : [];
      var self = this;
      return polys.map(function (poly) {
        return poly.map(function (ring) { return self.geoRingToD(ring); }).join('');
      }).join('');
    },

    getRegionForCountry: function (iso) {
      for (var r in REGION_COUNTRIES) {
        if (REGION_COUNTRIES[r].indexOf(iso) !== -1) return r;
      }
      return null;
    },

    showFeaturedGame: function () {
      if (this.isMobile) return;
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

      var htpLink = document.getElementById('bp-how-to-play');
      if (htpLink) {
        if (game.howToPlay) {
          htpLink.setAttribute('href', '../' + game.howToPlay);
          htpLink.hidden = false;
        } else {
          htpLink.hidden = true;
        }
      }

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
        var targets = map.querySelectorAll('[data-region="' + regionKey + '"]');
        for (var i = 0; i < targets.length; i++) targets[i].classList.add('bp-region-active');
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
      // iOS scroll-lock: save position before fixing body, prevents page jump
      this._scrollY = window.scrollY;
      document.body.style.top = '-' + this._scrollY + 'px';
      document.body.classList.add('bp-no-scroll');
      this._bindSwipeDismiss(sheet);
    },

    hideSheet: function () {
      var sheet    = document.getElementById('bp-bottom-sheet');
      var backdrop = document.getElementById('bp-sheet-backdrop');
      if (!sheet || !sheet.classList.contains('bp-sheet-open')) return;
      sheet.classList.remove('bp-sheet-open');
      // Restore scroll position before removing fixed positioning
      document.body.classList.remove('bp-no-scroll');
      document.body.style.top = '';
      window.scrollTo(0, this._scrollY || 0);
      setTimeout(function () {
        if (sheet)    sheet.setAttribute('hidden', '');
        if (backdrop) backdrop.setAttribute('hidden', '');
      }, 300);
    },

    // Swipe-down to dismiss — attached once per sheet element
    _bindSwipeDismiss: function (sheet) {
      if (sheet._swipeBound) return;
      sheet._swipeBound = true;
      var self = this;
      var startY = 0;
      sheet.addEventListener('touchstart', function (e) {
        startY = e.touches[0].clientY;
      }, { passive: true });
      sheet.addEventListener('touchend', function (e) {
        if (e.changedTouches[0].clientY - startY > 60) self.hideSheet();
      }, { passive: true });
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
