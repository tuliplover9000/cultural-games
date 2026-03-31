/* =============================================================
   shared/mobile.js — Cultural Games Mobile Utility API
   Exposes: window.MobileUtils
   ============================================================= */
(function () {
  'use strict';

  var PHONE_MAX = 430;
  var _resizeDebounce = null;
  var _registeredCanvases = []; // for autoResize

  var MobileUtils = {

    /* ── Detection ── */
    isMobile: function () {
      return window.innerWidth <= PHONE_MAX;
    },

    isLandscape: function () {
      return window.innerWidth > window.innerHeight;
    },

    /* ── Orientation change ── */
    onOrientationChange: function (cb) {
      var last = MobileUtils.isLandscape();
      var handler = function () {
        clearTimeout(_resizeDebounce);
        _resizeDebounce = setTimeout(function () {
          var now = MobileUtils.isLandscape();
          cb(now);
          last = now;
          // re-run all registered autoResize canvases
          _registeredCanvases.forEach(function (reg) {
            MobileUtils.scaleCanvas(reg.canvas, reg.logicalW, reg.logicalH);
          });
        }, 150);
      };
      window.addEventListener('resize', handler);
      window.addEventListener('orientationchange', handler);
      return function destroy() {
        window.removeEventListener('resize', handler);
        window.removeEventListener('orientationchange', handler);
      };
    },

    /* ── Haptics ── */
    vibrate: function (pattern) {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    },

    /* ── DPR-aware canvas scaling ──────────────────────────────────
       Sets canvas.width/height to logical × dpr, calls ctx.scale(dpr,dpr),
       then sets CSS size to fit the container.
       Stores result on canvas._mbScale for remapTouch().
       Options: { autoResize: true } — re-runs on resize/orientation change.
       Returns { scale, dpr, cssW, cssH }.
    ─────────────────────────────────────────────────────────────── */
    scaleCanvas: function (canvas, logicalW, logicalH, opts) {
      var dpr = window.devicePixelRatio || 1;
      var container = canvas.parentElement || document.body;
      var maxW = container.clientWidth  || logicalW;
      var maxH = container.clientHeight || logicalH;

      // Letterbox: fit inside container, never upscale
      var scale = Math.min(maxW / logicalW, maxH / logicalH, 1);
      var cssW  = Math.floor(logicalW * scale);
      var cssH  = Math.floor(logicalH * scale);

      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';

      var ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      var info = { scale: scale, dpr: dpr, cssW: cssW, cssH: cssH };
      canvas._mbScale = info;

      // Register for auto-resize if requested
      if (opts && opts.autoResize) {
        var existing = false;
        for (var i = 0; i < _registeredCanvases.length; i++) {
          if (_registeredCanvases[i].canvas === canvas) { existing = true; break; }
        }
        if (!existing) {
          _registeredCanvases.push({ canvas: canvas, logicalW: logicalW, logicalH: logicalH });
          if (_registeredCanvases.length === 1) {
            // Set up the shared resize listener once
            var resizeHandler = function () {
              clearTimeout(_resizeDebounce);
              _resizeDebounce = setTimeout(function () {
                _registeredCanvases.forEach(function (reg) {
                  MobileUtils.scaleCanvas(reg.canvas, reg.logicalW, reg.logicalH);
                });
              }, 150);
            };
            window.addEventListener('resize', resizeHandler);
            window.addEventListener('orientationchange', resizeHandler);
          }
        }
      }

      return info;
    },

    /* ── Touch coordinate remapping ── */
    remapTouch: function (e, canvas, scaleInfo) {
      var touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
      var rect  = canvas.getBoundingClientRect();
      var si    = scaleInfo || canvas._mbScale || { scale: 1 };
      return {
        x: (touch.clientX - rect.left)  / si.scale,
        y: (touch.clientY - rect.top)   / si.scale
      };
    },

    /* ── Swipe detector ─────────────────────────────────────────────
       Returns destroy() to remove listeners.
    ─────────────────────────────────────────────────────────────── */
    swipeDetector: function (element, opts) {
      var threshold = (opts && opts.threshold) || 40;
      var startX, startY;

      function onStart(e) {
        var t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
      }

      function onEnd(e) {
        var t = e.changedTouches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx >  threshold && opts.onSwipeRight) opts.onSwipeRight();
          if (dx < -threshold && opts.onSwipeLeft)  opts.onSwipeLeft();
        } else {
          if (dy >  threshold && opts.onSwipeDown)  opts.onSwipeDown();
          if (dy < -threshold && opts.onSwipeUp)    opts.onSwipeUp();
        }
      }

      element.addEventListener('touchstart', onStart, { passive: true });
      element.addEventListener('touchend',   onEnd,   { passive: true });

      return function destroy() {
        element.removeEventListener('touchstart', onStart);
        element.removeEventListener('touchend',   onEnd);
      };
    },

    /* ── Long-press detector ────────────────────────────────────────
       Returns destroy() to remove listeners.
    ─────────────────────────────────────────────────────────────── */
    longPress: function (element, cb, duration) {
      var ms = duration || 500;
      var timer = null;

      function onStart(e) {
        timer = setTimeout(function () {
          cb(e);
          timer = null;
        }, ms);
      }

      function onEnd() {
        if (timer) { clearTimeout(timer); timer = null; }
      }

      element.addEventListener('touchstart', onStart, { passive: true });
      element.addEventListener('touchend',   onEnd,   { passive: true });
      element.addEventListener('touchmove',  onEnd,   { passive: true });

      return function destroy() {
        onEnd();
        element.removeEventListener('touchstart', onStart);
        element.removeEventListener('touchend',   onEnd);
        element.removeEventListener('touchmove',  onEnd);
      };
    },

    /* ── Landscape prompt ───────────────────────────────────────────
       Shows a full-screen overlay asking user to rotate to landscape.
       Dismissed by rotating OR by tapping "Play anyway".
       Injects overlay into document.body; call once per game page.
    ─────────────────────────────────────────────────────────────── */
    showLandscapePrompt: function (container) {
      if (!MobileUtils.isMobile()) return null;
      if (sessionStorage.getItem('mbLandscapeDismissed')) return null;

      var overlay = document.createElement('div');
      overlay.className = 'mb-land-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Rotate device for best experience');
      overlay.innerHTML =
        '<div class="mb-land-icon" aria-hidden="true">📱</div>' +
        '<h2 class="mb-land-title">Rotate for best experience</h2>' +
        '<p class="mb-land-body">This game plays best in landscape. Turn your device sideways.</p>' +
        '<button class="mb-land-dismiss" type="button">Play anyway</button>';

      document.body.appendChild(overlay);

      function update() {
        if (MobileUtils.isLandscape()) {
          overlay.classList.remove('mb-land-visible');
        } else {
          if (!sessionStorage.getItem('mbLandscapeDismissed')) {
            overlay.classList.add('mb-land-visible');
          }
        }
      }

      overlay.querySelector('.mb-land-dismiss').addEventListener('click', function () {
        sessionStorage.setItem('mbLandscapeDismissed', '1');
        overlay.classList.remove('mb-land-visible');
      });

      var destroy = MobileUtils.onOrientationChange(update);
      update();

      return { overlay: overlay, destroy: destroy };
    }
  };

  window.MobileUtils = MobileUtils;

  /* ── Header auto-hide on scroll (mobile only) ── */
  (function () {
    var nav    = document.querySelector('.site-nav');
    if (!nav) return;
    var lastY   = 0;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        if (window.innerWidth > 768) {
          nav.classList.remove('nav--hidden');
          lastY = window.scrollY;
          ticking = false;
          return;
        }
        var y = window.scrollY || window.pageYOffset;
        if (y > lastY && y > 80) {
          nav.classList.add('nav--hidden');
        } else {
          nav.classList.remove('nav--hidden');
        }
        lastY   = y;
        ticking = false;
      });
    }, { passive: true });
  })();

  /* ── Phase E: close "How to Play" accordion on mobile by default ── */
  document.addEventListener('DOMContentLoaded', function () {
    if (!MobileUtils.isMobile()) return;

    // Close "How to Play" (first accordion with [open]) on mobile
    var accordions = document.querySelectorAll('details.accordion[open]');
    accordions.forEach(function (el) {
      var title = el.querySelector('.accordion__title');
      if (title && title.textContent.trim().toLowerCase().indexOf('how') === 0) {
        el.removeAttribute('open');
        el.setAttribute('data-desktop-open', '1');
      }
    });

    // Auto-inject landscape prompt on game pages
    var gc = document.getElementById('game-container');
    if (gc) {
      // Defer until after game scripts have run
      setTimeout(function () {
        MobileUtils.showLandscapePrompt(gc);
      }, 800);
    }
  });
})();
