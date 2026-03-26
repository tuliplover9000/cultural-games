/* =============================================================
   shared/mobile.js — Cultural Games Mobile Utility API
   Exposes: window.MobileUtils
   ============================================================= */
(function () {
  'use strict';

  var PHONE_MAX = 430;

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
      var handler = function () { cb(MobileUtils.isLandscape()); };
      window.addEventListener('resize', handler);
      handler(); // fire immediately
      return function destroy() { window.removeEventListener('resize', handler); };
    },

    /* ── Haptics ── */
    vibrate: function (pattern) {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    },

    /* ── DPR-aware canvas scaling ──────────────────────────────────
       Sets canvas.width/height to logical × dpr, calls ctx.scale(dpr,dpr),
       then sets CSS size to match the container.
       Returns { scale, dpr, cssW, cssH } for hit-test remapping.
    ─────────────────────────────────────────────────────────────── */
    scaleCanvas: function (canvas, logicalW, logicalH) {
      var dpr = window.devicePixelRatio || 1;
      var container = canvas.parentElement || document.body;
      var maxW = container.clientWidth  || logicalW;
      var maxH = container.clientHeight || logicalH;

      var scale = Math.min(maxW / logicalW, maxH / logicalH, 1);
      var cssW  = Math.floor(logicalW * scale);
      var cssH  = Math.floor(logicalH * scale);

      canvas.width  = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';

      var ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      return { scale: scale, dpr: dpr, cssW: cssW, cssH: cssH };
    },

    /* ── Touch coordinate remapping ── */
    remapTouch: function (e, canvas, scaleInfo) {
      var touch = e.touches ? e.touches[0] : e.changedTouches[0];
      var rect  = canvas.getBoundingClientRect();
      return {
        x: (touch.clientX - rect.left)  / scaleInfo.scale,
        y: (touch.clientY - rect.top)   / scaleInfo.scale
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
    }
  };

  window.MobileUtils = MobileUtils;
})();
