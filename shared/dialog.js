/**
 * dialog.js — on-brand confirm dialog, a styled replacement for window.confirm().
 *
 * Self-contained: injects its own styles (scoped to .cg-dialog*) built from the
 * site's CSS variables, so it looks right on any page and in both themes, and
 * reuses the shared .btn classes for the buttons.
 *
 * Usage:
 *   CGDialog.confirm({
 *     title: 'Buy "Star"?',
 *     message: 'Unlock this eyes for your avatar.',
 *     coinCost: 120,          // optional — shows a gold cost row + 🪙
 *     balanceAfter: 990,      // optional — "Balance after: 🪙 990"
 *     confirmText: 'Buy',
 *     cancelText: 'Cancel'
 *   }).then(function (ok) { if (ok) { ... } });
 *
 * Returns a Promise<boolean>. Confirm / Enter → true; Cancel / Esc / backdrop → false.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cg-dialog-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.cg-dialog-backdrop{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;' +
        'justify-content:center;padding:20px;background:rgba(26,14,6,0.72);' +
        '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;' +
        'transition:opacity .16s ease}' +
      '.cg-dialog-backdrop--open{opacity:1}' +
      '.cg-dialog{background:var(--color-surface,#1e1309);border:1px solid var(--color-border,rgba(255,255,255,.14));' +
        'border-radius:var(--radius-plaque,6px);padding:var(--space-6,28px);max-width:400px;width:100%;' +
        'box-shadow:var(--shadow-xl,0 20px 60px rgba(0,0,0,.45));display:flex;flex-direction:column;' +
        'gap:var(--space-3,12px);text-align:center;transform:translateY(10px) scale(.97);' +
        'transition:transform .16s ease}' +
      '.cg-dialog-backdrop--open .cg-dialog{transform:none}' +
      '.cg-dialog__icon{font-size:34px;line-height:1}' +
      '.cg-dialog__title{font-family:var(--font-display,Fraunces,Georgia,serif);' +
        'font-size:var(--text-2xl,1.5rem);font-weight:var(--weight-bold,700);color:var(--color-text,#f5e9d5);margin:0}' +
      '.cg-dialog__msg{font-size:var(--text-sm,.9rem);color:var(--color-text-muted,rgba(240,230,208,.7));margin:0}' +
      '.cg-dialog__cost{display:flex;flex-direction:column;gap:2px;align-items:center;margin:var(--space-1,4px) 0}' +
      '.cg-dialog__cost-amt{font-family:var(--font-display,Fraunces,Georgia,serif);font-size:var(--text-2xl,1.5rem);' +
        'font-weight:var(--weight-bold,700);color:var(--color-accent-gold,#C89B3C)}' +
      '.cg-dialog__cost-after{font-size:var(--text-xs,.75rem);color:var(--color-text-muted,rgba(240,230,208,.7))}' +
      '.cg-dialog__actions{display:flex;gap:var(--space-2,8px);justify-content:center;margin-top:var(--space-2,8px)}' +
      '.cg-dialog__actions .btn{min-width:112px}' +
      '@media (max-width:420px){.cg-dialog__actions{flex-direction:column-reverse}.cg-dialog__actions .btn{width:100%}}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function esc(s) {
    if (window.Sanitize) return Sanitize.text(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Coin marker for cost rows. Prefer the shared inline-SVG glyph so it matches
  // the site's icon system; fall back to the emoji only when Icon isn't loaded.
  // Resolved per-call (Icon.js may load after this IIFE runs).
  function coinGlyph() {
    if (window.Icon && Icon.svg) return Icon.svg('coin', 15);
    return '🪙';
  }

  function confirmDialog(opts) {
    opts = opts || {};
    injectStyles();
    var COIN = coinGlyph();

    return new Promise(function (resolve) {
      var lastFocus = document.activeElement;
      var prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      var backdrop = document.createElement('div');
      backdrop.className = 'cg-dialog-backdrop';

      var costHtml = '';
      if (typeof opts.coinCost === 'number') {
        costHtml = '<div class="cg-dialog__cost">' +
          '<span class="cg-dialog__cost-amt">' + COIN + ' ' + opts.coinCost.toLocaleString() + '</span>' +
          (typeof opts.balanceAfter === 'number'
            ? '<span class="cg-dialog__cost-after">Balance after: ' + COIN + ' ' + opts.balanceAfter.toLocaleString() + '</span>'
            : '') +
          '</div>';
      }

      backdrop.innerHTML =
        '<div class="cg-dialog" role="dialog" aria-modal="true" aria-labelledby="cg-dialog-title">' +
          (opts.icon ? '<div class="cg-dialog__icon" aria-hidden="true">' + opts.icon + '</div>' : '') +
          '<h2 class="cg-dialog__title" id="cg-dialog-title">' + esc(opts.title || 'Are you sure?') + '</h2>' +
          (opts.message ? '<p class="cg-dialog__msg">' + esc(opts.message) + '</p>' : '') +
          costHtml +
          '<div class="cg-dialog__actions">' +
            '<button type="button" class="btn btn-ghost cg-dialog__cancel">' + esc(opts.cancelText || 'Cancel') + '</button>' +
            '<button type="button" class="btn btn-primary cg-dialog__confirm">' + esc(opts.confirmText || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(backdrop);
      requestAnimationFrame(function () { backdrop.classList.add('cg-dialog-backdrop--open'); });

      var btnConfirm = backdrop.querySelector('.cg-dialog__confirm');
      var btnCancel  = backdrop.querySelector('.cg-dialog__cancel');
      var done = false;

      function close(result) {
        if (done) return;
        done = true;
        backdrop.classList.remove('cg-dialog-backdrop--open');
        document.removeEventListener('keydown', onKey, true);
        document.body.style.overflow = prevOverflow;
        setTimeout(function () {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
        }, 170);
        resolve(!!result);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        else if (e.key === 'Enter') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') {
          // Keep focus trapped between the two buttons.
          var f = [btnCancel, btnConfirm];
          var idx = f.indexOf(document.activeElement);
          e.preventDefault();
          var next = e.shiftKey ? (idx <= 0 ? f.length - 1 : idx - 1)
                                : (idx >= f.length - 1 ? 0 : idx + 1);
          f[next].focus();
        }
      }

      btnConfirm.addEventListener('click', function () { close(true); });
      btnCancel.addEventListener('click', function () { close(false); });
      backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) close(false); });
      document.addEventListener('keydown', onKey, true);
      btnConfirm.focus();
    });
  }

  window.CGDialog = { confirm: confirmDialog };
}());
