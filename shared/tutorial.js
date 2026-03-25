(function () {
  'use strict';

  /**
   * Tutorial Tooltip Engine - Cultural Games
   *
   * Step schema:
   * {
   *   target:     '#element-id',              // CSS selector for DOM element to highlight
   *   title:      'Short Title',              // ≤4 words
   *   body:       'One or two sentences.',    // tooltip body text
   *   position:   'top'|'bottom'|'left'|'right'|'center',  // preferred side
   *   highlight:  true|false,                 // default true
   *   beforeStep: null | function(),          // runs before tooltip shows
   *   afterStep:  null | function()           // runs after step dismissed
   * }
   *
   * Public API:
   *   CGTutorial.register(gameId, stepsArray)
   *   CGTutorial.initTrigger(gameId)
   *   CGTutorial.isActive  → boolean
   */

  var STORAGE_PREFIX = 'cg-tutorial-seen-';

  var _registry = {};   // gameId → steps[]

  var _state = {
    gameId:       null,
    steps:        [],
    currentStep:  0,
    isActive:     false,
    focusBefore:  null,
    keyHandler:   null,
    resizeTimer:  null,
  };

  var _el = {
    tooltip:   null,
    arrow:     null,
    title:     null,
    body:      null,
    progress:  null,
    prevBtn:   null,
    nextBtn:   null,
    skipBtn:   null,
    highlight: null,
    backdrop:  null,
    trigger:   null,
    badge:     null,
  };

  /* ═══════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════ */

  function register(gameId, steps) {
    _registry[gameId] = steps;
  }

  function initTrigger(gameId) {
    _el.trigger = document.getElementById('tt-trigger');
    _el.badge   = document.getElementById('tt-badge');
    if (!_el.trigger) return;

    // Move the button inside the game container so it sits within
    // the gold-bordered game area rather than floating over the page.
    // A MutationObserver re-appends it if a game re-renders via innerHTML.
    var gc = document.querySelector('.game-container');
    if (gc) {
      gc.appendChild(_el.trigger);
      var _obs = new MutationObserver(function () {
        if (!gc.contains(_el.trigger)) gc.appendChild(_el.trigger);
      });
      _obs.observe(gc, { childList: true });
    }

    var seen = false;
    try { seen = !!localStorage.getItem(STORAGE_PREFIX + gameId); } catch (e) {}
    if (!seen && _el.badge) _el.badge.removeAttribute('hidden');

    _el.trigger.addEventListener('click', function () {
      startTutorial(gameId);
    });
  }

  function startTutorial(gameId) {
    var steps = _registry[gameId];
    if (!steps || !steps.length) return;

    _initDOM();

    _state.gameId      = gameId;
    _state.steps       = steps;
    _state.currentStep = 0;
    _state.isActive    = true;
    _state.focusBefore = document.activeElement;

    // Mark seen + hide badge
    try { localStorage.setItem(STORAGE_PREFIX + gameId, '1'); } catch (e) {}
    if (_el.badge)   _el.badge.setAttribute('hidden', '');
    if (_el.trigger) _el.trigger.disabled = true;

    // Show backdrop
    _el.backdrop.hidden = false;

    // Keyboard handler - attached only while active
    _state.keyHandler = function (e) {
      if (e.key === 'Escape')                              { skipTutorial(); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter')     { _onNext();      return; }
      if (e.key === 'ArrowLeft')                           { prevStep();     return; }
      // Focus trap
      if (e.key === 'Tab') {
        var focusable = [_el.skipBtn, _el.prevBtn, _el.nextBtn]
          .filter(function (b) { return b && !b.hidden && !b.disabled; });
        if (!focusable.length) return;
        var first = focusable[0];
        var last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener('keydown', _state.keyHandler);

    showStep(0);
  }

  function showStep(idx) {
    var step = _state.steps[idx];
    if (!step) return;
    _state.currentStep = idx;

    var total = _state.steps.length;

    if (typeof step.beforeStep === 'function') step.beforeStep();

    // Populate content
    _el.title.textContent    = step.title;
    _el.body.textContent     = step.body;
    _el.progress.textContent = (idx + 1) + ' / ' + total;

    // Button states
    _el.prevBtn.hidden        = (idx === 0);
    _el.nextBtn.textContent   = (idx === total - 1) ? 'Finish' : 'Next →';

    // Target element
    var targetEl = document.querySelector(step.target);

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (step.highlight !== false) {
        _positionHighlight(targetEl);
        _el.highlight.hidden = false;
      } else {
        _el.highlight.hidden = true;
      }
      _el.tooltip.hidden = false;
      _positionTooltip(targetEl, step.position || 'bottom');
    } else {
      _el.highlight.hidden = true;
      _el.tooltip.hidden   = false;
      _centerTooltip();
    }

    // Animate in
    requestAnimationFrame(function () {
      _el.tooltip.classList.add('tt-tooltip--visible');
    });

    // Move focus to Next button
    setTimeout(function () { if (_el.nextBtn) _el.nextBtn.focus(); }, 80);
  }

  function _onNext() {
    var step = _state.steps[_state.currentStep];
    if (typeof step.afterStep === 'function') step.afterStep();
    _el.tooltip.classList.remove('tt-tooltip--visible');
    if (_state.currentStep >= _state.steps.length - 1) {
      finishTutorial();
    } else {
      setTimeout(function () { showStep(_state.currentStep + 1); }, 110);
    }
  }

  function nextStep()     { _onNext(); }
  function prevStep() {
    if (_state.currentStep <= 0) return;
    _el.tooltip.classList.remove('tt-tooltip--visible');
    setTimeout(function () { showStep(_state.currentStep - 1); }, 110);
  }
  function skipTutorial()   { _endTutorial(); }
  function finishTutorial() { _endTutorial(); }

  function _endTutorial() {
    _state.isActive = false;
    if (_el.tooltip)   { _el.tooltip.classList.remove('tt-tooltip--visible'); _el.tooltip.hidden = true; }
    if (_el.highlight) { _el.highlight.hidden = true; }
    if (_el.backdrop)  { _el.backdrop.hidden  = true; }
    if (_el.trigger)   { _el.trigger.disabled = false; }
    if (_state.keyHandler) {
      document.removeEventListener('keydown', _state.keyHandler);
      _state.keyHandler = null;
    }
    // Return focus
    var ret = _el.trigger || _state.focusBefore;
    if (ret && typeof ret.focus === 'function') ret.focus();
  }

  /* ═══════════════════════════════════════════════════════
     DOM INIT
  ═══════════════════════════════════════════════════════ */

  function _initDOM() {
    if (document.getElementById('tt-tooltip')) {
      // Re-grab refs if already initialised
      var t = document.getElementById('tt-tooltip');
      _el.tooltip   = t;
      _el.arrow     = t.querySelector('.tt-tooltip__arrow');
      _el.title     = t.querySelector('.tt-tooltip__title');
      _el.body      = t.querySelector('.tt-tooltip__body');
      _el.progress  = t.querySelector('.tt-tooltip__progress');
      _el.prevBtn   = t.querySelector('.tt-tooltip__btn--prev');
      _el.nextBtn   = t.querySelector('.tt-tooltip__btn--next');
      _el.skipBtn   = t.querySelector('.tt-tooltip__btn--skip');
      _el.highlight = document.getElementById('tt-highlight');
      _el.backdrop  = document.getElementById('tt-backdrop');
      return;
    }

    // Tooltip
    var tooltip = document.createElement('div');
    tooltip.id        = 'tt-tooltip';
    tooltip.className = 'tt-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'false');
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.hidden = true;
    tooltip.innerHTML =
      '<div class="tt-tooltip__arrow" aria-hidden="true"></div>' +
      '<div class="tt-tooltip__inner">' +
        '<p class="tt-tooltip__title"></p>' +
        '<p class="tt-tooltip__body"></p>' +
        '<div class="tt-tooltip__footer">' +
          '<span class="tt-tooltip__progress"></span>' +
          '<div class="tt-tooltip__actions">' +
            '<button class="tt-tooltip__btn tt-tooltip__btn--skip" type="button">Skip</button>' +
            '<button class="tt-tooltip__btn tt-tooltip__btn--prev" type="button" aria-label="Previous step">← Prev</button>' +
            '<button class="tt-tooltip__btn tt-tooltip__btn--next" type="button">Next →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(tooltip);

    // Highlight ring
    var highlight = document.createElement('div');
    highlight.id        = 'tt-highlight';
    highlight.className = 'tt-highlight';
    highlight.hidden    = true;
    document.body.appendChild(highlight);

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.id        = 'tt-backdrop';
    backdrop.className = 'tt-backdrop';
    backdrop.hidden    = true;
    backdrop.addEventListener('click', skipTutorial);
    document.body.appendChild(backdrop);

    _el.tooltip   = tooltip;
    _el.arrow     = tooltip.querySelector('.tt-tooltip__arrow');
    _el.title     = tooltip.querySelector('.tt-tooltip__title');
    _el.body      = tooltip.querySelector('.tt-tooltip__body');
    _el.progress  = tooltip.querySelector('.tt-tooltip__progress');
    _el.prevBtn   = tooltip.querySelector('.tt-tooltip__btn--prev');
    _el.nextBtn   = tooltip.querySelector('.tt-tooltip__btn--next');
    _el.skipBtn   = tooltip.querySelector('.tt-tooltip__btn--skip');
    _el.highlight = highlight;
    _el.backdrop  = backdrop;

    _el.nextBtn.addEventListener('click', nextStep);
    _el.prevBtn.addEventListener('click', prevStep);
    _el.skipBtn.addEventListener('click', skipTutorial);

    var _reposition = _debounce(_repositionCurrent, 60);
    window.addEventListener('resize', _reposition);
    window.addEventListener('scroll', _reposition, { passive: true });
  }

  /* ═══════════════════════════════════════════════════════
     POSITIONING
  ═══════════════════════════════════════════════════════ */

  var GAP    = 12;
  var ARROW  = 8;
  var MARGIN = 8;

  function _positionTooltip(targetEl, preferred) {
    var r  = targetEl.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Measure tooltip with visibility hidden to get actual dims
    _el.tooltip.style.visibility = 'hidden';
    _el.tooltip.style.display    = '';
    var tw = _el.tooltip.offsetWidth  || 280;
    var th = _el.tooltip.offsetHeight || 160;
    _el.tooltip.style.visibility = '';

    // Priority order: preferred → opposite → others → center
    var opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    var order = [preferred];
    if (opp[preferred]) order.push(opp[preferred]);
    ['top', 'bottom', 'left', 'right'].forEach(function (p) {
      if (order.indexOf(p) < 0) order.push(p);
    });
    order.push('center');

    var chosen = 'center', top = 0, left = 0;

    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      if (p === 'center') { chosen = 'center'; break; }

      var t, l;
      if (p === 'top') {
        t = r.top    - th - GAP - ARROW;
        l = r.left   + r.width  / 2 - tw / 2;
      } else if (p === 'bottom') {
        t = r.bottom + GAP + ARROW;
        l = r.left   + r.width  / 2 - tw / 2;
      } else if (p === 'left') {
        t = r.top    + r.height / 2 - th / 2;
        l = r.left   - tw - GAP - ARROW;
      } else { // right
        t = r.top    + r.height / 2 - th / 2;
        l = r.right  + GAP + ARROW;
      }

      // Check fits in viewport
      if (t < MARGIN || t + th > vh - MARGIN) continue;
      if (l < MARGIN || l + tw > vw - MARGIN) continue;

      chosen = p;
      top    = Math.max(MARGIN, Math.min(t, vh - th - MARGIN));
      left   = Math.max(MARGIN, Math.min(l, vw - tw - MARGIN));
      break;
    }

    if (chosen === 'center') { _centerTooltip(); return; }

    _el.tooltip.style.top       = top  + 'px';
    _el.tooltip.style.left      = left + 'px';
    _el.tooltip.style.transform = '';
    _el.tooltip.className = 'tt-tooltip tt-tooltip--' + chosen;
    if (_state.isActive) _el.tooltip.classList.add('tt-tooltip--visible');

    // Arrow offset - point at target center
    var cx = r.left + r.width  / 2;
    var cy = r.top  + r.height / 2;
    if (chosen === 'top' || chosen === 'bottom') {
      _el.arrow.style.left = Math.max(16, Math.min(cx - left, tw - 16)) + 'px';
      _el.arrow.style.top  = '';
    } else {
      _el.arrow.style.top  = Math.max(16, Math.min(cy - top, th - 16)) + 'px';
      _el.arrow.style.left = '';
    }
  }

  function _centerTooltip() {
    _el.tooltip.style.top       = '50%';
    _el.tooltip.style.left      = '50%';
    _el.tooltip.style.transform = 'translate(-50%, -50%)';
    _el.tooltip.className = 'tt-tooltip tt-tooltip--center';
    if (_state.isActive) _el.tooltip.classList.add('tt-tooltip--visible');
    _el.arrow.style.left = '';
    _el.arrow.style.top  = '';
  }

  function _positionHighlight(targetEl) {
    var r   = targetEl.getBoundingClientRect();
    var pad = 6;
    _el.highlight.style.top          = (r.top    - pad) + 'px';
    _el.highlight.style.left         = (r.left   - pad) + 'px';
    _el.highlight.style.width        = (r.width  + pad * 2) + 'px';
    _el.highlight.style.height       = (r.height + pad * 2) + 'px';
    var cs = window.getComputedStyle(targetEl);
    _el.highlight.style.borderRadius = cs.borderRadius || '8px';
  }

  function _repositionCurrent() {
    if (!_state.isActive) return;
    var step = _state.steps[_state.currentStep];
    if (!step) return;
    var targetEl = document.querySelector(step.target);
    if (!targetEl) return;
    _positionTooltip(targetEl, step.position || 'bottom');
    if (step.highlight !== false) _positionHighlight(targetEl);
  }

  function _debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* ═══════════════════════════════════════════════════════
     EXPOSE
  ═══════════════════════════════════════════════════════ */

  window.CGTutorial = {
    register:      register,
    initTrigger:   initTrigger,
    startTutorial: startTutorial,
    get isActive() { return _state.isActive; },
  };

}());
