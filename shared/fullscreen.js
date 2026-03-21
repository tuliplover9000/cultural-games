/**
 * fullscreen.js — Fullscreen engine for Cultural Games.
 * Exposes window.FSMode with enter/exit/toggle + onEnter/onExit hooks.
 * Supports native Fullscreen API with CSS fallback (iOS Safari).
 */
(function () {
  'use strict';

  // ── Feature detection ──────────────────────────────────────────────────────
  if (document.fullscreenEnabled) {
    document.documentElement.classList.add('fs-supported');
  } else {
    document.documentElement.classList.add('fs-css-only');
  }

  var _savedScrollY = 0;
  var _hideTimer    = null;
  var _wrap         = null;  // lazily resolved
  var _btn          = null;
  var _announce     = null;

  function wrap() {
    if (!_wrap) _wrap = document.getElementById('fs-game-wrap');
    return _wrap;
  }
  function btn() {
    if (!_btn) _btn = document.getElementById('fs-toggle');
    return _btn;
  }
  function announce() {
    if (!_announce) _announce = document.getElementById('fs-announce');
    return _announce;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var FSMode = {
    // Hooks — game pages override these
    onEnter: function () {},
    onExit:  function () {},
  };

  FSMode.isActive = function () {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      (wrap() && wrap().classList.contains('fs-active'))
    );
  };

  // ── Native API ─────────────────────────────────────────────────────────────
  FSMode.enter = async function () {
    var el = wrap();
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else {
        FSMode.enterCSS();
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
      FSMode.enterCSS();
    }
  };

  FSMode.exit = function () {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    } else {
      FSMode.exitCSS();
    }
  };

  FSMode.toggle = function () {
    if (FSMode.isActive()) {
      FSMode.exit();
    } else if (document.fullscreenEnabled) {
      FSMode.enter();
    } else {
      FSMode.enterCSS();
    }
  };

  // ── CSS fallback ───────────────────────────────────────────────────────────
  FSMode.enterCSS = function () {
    var el = wrap();
    if (!el) return;
    _savedScrollY = window.scrollY;
    el.classList.add('fs-active');
    document.body.classList.add('fs-body-lock');
    _updateToggleUI(true);
    _onStateChange(true);
    document.addEventListener('keydown', _cssEscHandler);
  };

  FSMode.exitCSS = function () {
    var el = wrap();
    if (!el) return;
    el.classList.remove('fs-active');
    document.body.classList.remove('fs-body-lock');
    _updateToggleUI(false);
    _onStateChange(false);
    window.scrollTo(0, _savedScrollY);
    document.removeEventListener('keydown', _cssEscHandler);
  };

  function _cssEscHandler(e) {
    if (e.key === 'Escape' && FSMode.isActive()) {
      FSMode.exitCSS();
    }
  }

  // ── Native fullscreen change ───────────────────────────────────────────────
  function _onNativeChange() {
    var active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    _updateToggleUI(active);
    _onStateChange(active);
    if (!active) _clearHideTimer();
  }

  document.addEventListener('fullscreenchange',       _onNativeChange);
  document.addEventListener('webkitfullscreenchange', _onNativeChange);

  // ── Resize dispatcher ──────────────────────────────────────────────────────
  //
  // Strategy: call GameResize(availW, availH) so the game can update its
  // cell/layout variables and call render(). Some render() functions
  // reset canvas.width/height to content-size (e.g. a square board).
  // After that we read the actual canvas pixel dimensions and apply a
  // CSS transform:scale() to fill the viewport, preserving aspect ratio.
  // Inline styles with !important beat any stylesheet rule.
  //
  function _triggerResize(active) {
    var w = wrap();
    if (!w) return;
    var canvas = w.querySelector('canvas');

    if (!active) {
      // Clear all fullscreen inline overrides
      if (canvas) {
        canvas.style.removeProperty('transform');
        canvas.style.removeProperty('transform-origin');
        canvas.style.removeProperty('width');
        canvas.style.removeProperty('height');
        canvas.style.removeProperty('top');
        canvas.style.removeProperty('left');
        canvas.style.removeProperty('position');
        // Restore original canvas buffer size and re-render at normal size
        if (canvas._fs_origW) {
          canvas.width  = canvas._fs_origW;
          canvas.height = canvas._fs_origH;
          if (window.GameResize) window.GameResize(canvas._fs_origW, canvas._fs_origH);
          canvas._fs_origW = null;
          canvas._fs_origH = null;
        }
      }
      return;
    }

    if (!canvas) return;

    // Save original canvas buffer size before any fullscreen resize
    if (!canvas._fs_origW) {
      canvas._fs_origW = canvas.width;
      canvas._fs_origH = canvas.height;
    }

    // Use window.innerWidth/Height — most reliable during fullscreen transitions.
    var availW = window.innerWidth;
    var availH = window.innerHeight;

    // Let the game update cell sizes and re-render.
    // After this, canvas.width/height hold the content-sized canvas
    // (may be viewport-sized, or a constrained square/rectangle).
    if (window.GameResize) {
      window.GameResize(availW, availH);
    }

    // ── Scale-to-fit: fill viewport while preserving aspect ratio ──────────
    var cw = canvas.width;
    var ch = canvas.height;
    if (!cw || !ch) return;

    var scale   = Math.min(availW / cw, availH / ch);
    var offsetX = Math.round((availW - cw * scale) / 2);
    var offsetY = Math.round((availH - ch * scale) / 2);

    // Pin canvas to #fs-game-wrap (position:fixed/relative) and scale it up.
    // setProperty priority:'important' beats CSS !important in stylesheets.
    canvas.style.setProperty('position',         'absolute',              'important');
    canvas.style.setProperty('width',            cw + 'px',               'important');
    canvas.style.setProperty('height',           ch + 'px',               'important');
    canvas.style.setProperty('top',              offsetY + 'px',          'important');
    canvas.style.setProperty('left',             offsetX + 'px',          'important');
    canvas.style.setProperty('transform',        'scale(' + scale + ')',  'important');
    canvas.style.setProperty('transform-origin', 'top left',              'important');
  }

  // ── State change dispatcher ────────────────────────────────────────────────
  function _onStateChange(isActive) {
    if (isActive) {
      // Wait two frames for the browser to commit fullscreen dimensions,
      // then scale the canvas and fire the game's onEnter hook.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          _triggerResize(true);
          FSMode.onEnter();
          _startHideTimer();
          _moveFocusIn();
        });
      });
    } else {
      _triggerResize(false);
      FSMode.onExit();
      _clearHideTimer();
      _restoreFocus();
    }
    if (announce()) {
      announce().textContent = isActive ? 'Fullscreen mode enabled' : 'Fullscreen mode disabled';
    }
  }

  // ── Button UI ──────────────────────────────────────────────────────────────
  function _updateToggleUI(isActive) {
    var b = btn();
    if (!b) return;
    var enterIcon = b.querySelector('.fs-toggle__icon--enter');
    var exitIcon  = b.querySelector('.fs-toggle__icon--exit');
    if (enterIcon) enterIcon.style.display = isActive ? 'none'  : 'block';
    if (exitIcon)  exitIcon.style.display  = isActive ? 'block' : 'none';
    b.setAttribute('aria-label', isActive ? 'Exit fullscreen' : 'Enter fullscreen');
    b.setAttribute('title',      isActive ? 'Exit fullscreen' : 'Enter fullscreen');
    b.style.opacity = '1';
  }

  // ── Auto-hide ──────────────────────────────────────────────────────────────
  function _startHideTimer() {
    _resetHideTimer();
    var el = wrap();
    if (el) {
      el.addEventListener('mousemove',  _resetHideTimer);
      el.addEventListener('touchstart', _resetHideTimer, { passive: true });
    }
  }

  function _clearHideTimer() {
    clearTimeout(_hideTimer);
    var b = btn();
    if (b) b.style.opacity = '1';
    var el = wrap();
    if (el) {
      el.removeEventListener('mousemove',  _resetHideTimer);
      el.removeEventListener('touchstart', _resetHideTimer);
    }
  }

  function _resetHideTimer() {
    clearTimeout(_hideTimer);
    var b = btn();
    if (b) b.style.opacity = '1';
    _hideTimer = setTimeout(function () {
      if (FSMode.isActive() && btn()) btn().style.opacity = '0.3';
    }, 3000);
  }

  // ── Focus management ───────────────────────────────────────────────────────
  var _prevFocus = null;
  function _moveFocusIn() {
    _prevFocus = document.activeElement;
    var canvas = wrap() && wrap().querySelector('canvas');
    if (canvas) canvas.focus();
  }
  function _restoreFocus() {
    if (_prevFocus && _prevFocus.focus) {
      try { _prevFocus.focus(); } catch(e) {}
    }
    _prevFocus = null;
  }

  // ── Clean exit on page unload ──────────────────────────────────────────────
  window.addEventListener('beforeunload', function () {
    if (FSMode.isActive()) FSMode.exit();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && FSMode.isActive()) FSMode.exitCSS();
  });

  // ── Wire up button ─────────────────────────────────────────────────────────
  // Defer until DOM is ready
  function _init() {
    var b = document.getElementById('fs-toggle');
    if (b) {
      b.addEventListener('click', function () { FSMode.toggle(); });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  window.FSMode = FSMode;
})();
