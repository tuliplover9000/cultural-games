/**
 * fullscreen.js - Fullscreen engine for Cultural Games.
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
    // Hooks - game pages override these
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
  // Approach: physically move the canvas to be a DIRECT child of
  // #fs-game-wrap. This removes all containing-block ambiguity - no CSS
  // specificity battle, no intermediate-wrapper interference.
  //
  // After moving, call GameResize so the game re-renders at the new size.
  // Some render() functions reset canvas.width/height to a content-sized
  // value (e.g. a square board). We read those actual pixel dimensions
  // AFTER render() runs, then apply transform:scale() to fill the viewport
  // while preserving aspect ratio (letterboxed centering).
  //
  var _DOM_GAME_SELECTOR =
    '.tl-game, .oaq-game, .ow-game, .pg-game, ' +
    '.pt-game-wrap, .pu-game-wrap, .mj-wrap, .bc-game';

  function _triggerResize(active) {
    var w = wrap();
    if (!w) return;
    var canvas = w.querySelector('canvas');

    // ── Exit fullscreen ────────────────────────────────────────────────────────
    if (!active) {
      if (canvas) {
        // Restore canvas to its original DOM position
        if (canvas._fs_origParent) {
          try {
            canvas._fs_origParent.insertBefore(canvas, canvas._fs_origNextSibling || null);
          } catch (e) {
            canvas._fs_origParent.appendChild(canvas);
          }
          canvas._fs_origParent      = null;
          canvas._fs_origNextSibling = null;
        }
        // Clear all fullscreen inline overrides
        canvas.style.removeProperty('transform');
        canvas.style.removeProperty('transform-origin');
        canvas.style.removeProperty('width');
        canvas.style.removeProperty('height');
        canvas.style.removeProperty('top');
        canvas.style.removeProperty('left');
        canvas.style.removeProperty('position');
        canvas.style.removeProperty('z-index');
        // Restore original canvas buffer size and re-render at normal size
        if (canvas._fs_origW) {
          canvas.width  = canvas._fs_origW;
          canvas.height = canvas._fs_origH;
          if (window.GameResize) window.GameResize(canvas._fs_origW, canvas._fs_origH);
          canvas._fs_origW = null;
          canvas._fs_origH = null;
        }
      } else {
        // DOM game restore
        var domRoot = w.querySelector(_DOM_GAME_SELECTOR);
        if (domRoot) {
          domRoot.style.removeProperty('transform');
          domRoot.style.removeProperty('transform-origin');
          domRoot.style.removeProperty('width');
          domRoot.style.removeProperty('height');
          domRoot.style.removeProperty('min-height');
          domRoot.style.removeProperty('overflow');
        }
      }
      return;
    }

    // ── Enter fullscreen ───────────────────────────────────────────────────────
    var availW = window.innerWidth;
    var availH = window.innerHeight;

    if (!canvas) {
      // ── DOM game: scale root element to fill viewport ──────────────────────
      // Canvas games resize via GameResize + transform on the canvas element.
      // DOM games have no canvas; instead we scale the game's root div so
      // everything (cards, pits, pieces) fills the fullscreen viewport.
      var gameRoot = w.querySelector(_DOM_GAME_SELECTOR);
      if (!gameRoot) return;
      // Measure natural content height with height:auto (ignores our CSS override).
      gameRoot.style.setProperty('height',     'auto', 'important');
      gameRoot.style.setProperty('min-height', '0',    'important');
      var naturalH = gameRoot.scrollHeight;
      var naturalW = gameRoot.offsetWidth;  // equals availW (game fills container width)
      if (!naturalH || !naturalW) return;
      var scale = Math.min(availW / naturalW, availH / naturalH);
      if (scale <= 1.01) {
        // Content already fills or overflows - restore height and allow scroll.
        gameRoot.style.setProperty('height',     '100%', 'important');
        gameRoot.style.setProperty('min-height', '0',    'important');
        return;
      }
      // Shrink layout box by 1/scale so that after transform:scale it fills exactly.
      gameRoot.style.setProperty('width',            Math.round(availW / scale) + 'px', 'important');
      gameRoot.style.setProperty('height',           Math.round(availH / scale) + 'px', 'important');
      gameRoot.style.setProperty('min-height',       '0',                    'important');
      gameRoot.style.setProperty('transform',        'scale(' + scale + ')', 'important');
      gameRoot.style.setProperty('transform-origin', 'top left',             'important');
      gameRoot.style.setProperty('overflow',         'hidden',               'important');
      return;
    }

    // Save original canvas buffer size before any fullscreen resize
    if (!canvas._fs_origW) {
      canvas._fs_origW = canvas.width  || 1;
      canvas._fs_origH = canvas.height || 1;
    }

    // ── Move canvas to be a direct child of #fs-game-wrap ──────────────────
    // This guarantees position:absolute anchors to the fullscreen wrapper,
    // bypassing ALL intermediate containers regardless of their CSS.
    if (!canvas._fs_origParent) {
      canvas._fs_origParent      = canvas.parentNode;
      canvas._fs_origNextSibling = canvas.nextSibling;
      w.appendChild(canvas);
    }

    // Let the game update cell sizes and re-render at new dimensions.
    // After this, canvas.width/height reflect the actual content-sized buffer
    // (some games set it to availW×availH; others to a constrained square).
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

    // Apply as inline styles on the directly-parented canvas element.
    canvas.style.setProperty('position',         'absolute',             'important');
    canvas.style.setProperty('z-index',          '0',                    'important');
    canvas.style.setProperty('width',            cw + 'px',              'important');
    canvas.style.setProperty('height',           ch + 'px',              'important');
    canvas.style.setProperty('top',              offsetY + 'px',         'important');
    canvas.style.setProperty('left',             offsetX + 'px',         'important');
    canvas.style.setProperty('transform',        'scale(' + scale + ')', 'important');
    canvas.style.setProperty('transform-origin', 'top left',             'important');
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
