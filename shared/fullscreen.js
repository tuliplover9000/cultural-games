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

  // ── State change dispatcher ────────────────────────────────────────────────
  function _onStateChange(isActive) {
    if (isActive) {
      // Wait two frames for the browser to apply fullscreen dimensions,
      // then fire onEnter so game canvas resizes to the correct size.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          FSMode.onEnter();
          _startHideTimer();
          _moveFocusIn();
        });
      });
    } else {
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
