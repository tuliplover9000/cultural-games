/**
 * icons.js - Cultural Games inline SVG icon set (replaces UI emoji).
 *
 * Open-source line icons in the Lucide style (ISC-licensed paths), drawn at a
 * 24x24 viewBox with stroke="currentColor" so they inherit the surrounding
 * text colour and theme. No dependencies, no external CSS required — every
 * attribute the icon needs is baked into the returned <svg> string.
 *
 *   window.Icon.svg(name, size, extraClass)   → SVG string (size: number px or
 *                                                a CSS length; default '1em')
 *   window.Icon.has(name)                      → boolean
 *
 * Static HTML can use a placeholder that this module hydrates on load:
 *   <span data-icon="coins" data-icon-size="22"></span>
 */
(function () {
  'use strict';

  /* ── Icon path data (inner SVG markup; Lucide line style) ── */
  var ICONS = {
    coins:
      '<circle cx="8" cy="8" r="6"/>' +
      '<path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>' +
      '<path d="M7 6h1v4"/>' +
      '<path d="m16.71 13.88.7.71-2.82 2.82"/>',
    'gamepad':
      '<line x1="6" x2="10" y1="11" y2="11"/>' +
      '<line x1="8" x2="8" y1="9" y2="13"/>' +
      '<line x1="15" x2="15.01" y1="12" y2="12"/>' +
      '<line x1="18" x2="18.01" y1="10" y2="10"/>' +
      '<path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
    trophy:
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>' +
      '<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>' +
      '<path d="M4 22h16"/>' +
      '<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>' +
      '<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>' +
      '<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    globe:
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>' +
      '<path d="M2 12h20"/>',
    star:
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'star-fill':
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>',
    x:
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    palette:
      '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none"/>' +
      '<circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none"/>' +
      '<circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none"/>' +
      '<circle cx="6.5" cy="12.5" r=".5" fill="currentColor" stroke="none"/>' +
      '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/>',
    lock:
      '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
      '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    swords:
      '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>' +
      '<line x1="13" x2="19" y1="19" y2="13"/>' +
      '<line x1="16" x2="20" y1="16" y2="20"/>' +
      '<line x1="19" x2="21" y1="21" y2="19"/>' +
      '<polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/>' +
      '<line x1="5" x2="9" y1="14" y2="18"/>' +
      '<line x1="7" x2="4" y1="17" y2="20"/>' +
      '<line x1="3" x2="5" y1="19" y2="21"/>',
    compass:
      '<circle cx="12" cy="12" r="10"/>' +
      '<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
      '<circle cx="9" cy="7" r="4"/>' +
      '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' +
      '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    flag:
      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>' +
      '<line x1="4" x2="4" y1="22" y2="15"/>',
    medal:
      '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/>' +
      '<path d="M11 12 5.12 2.2"/>' +
      '<path d="m13 12 5.88-9.8"/>' +
      '<path d="M8 7h8"/>' +
      '<circle cx="12" cy="17" r="5"/>' +
      '<path d="M12 18v-2h-.5"/>',
    check:
      '<polyline points="20 6 9 17 4 12"/>',
    dice:
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>' +
      '<path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/>' +
      '<path d="M16 16h.01"/><path d="M12 12h.01"/>',
    door:
      '<path d="M13 4h3a2 2 0 0 1 2 2v14"/>' +
      '<path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/>' +
      '<path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.562Z"/>',
    link:
      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
      '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    message:
      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'party':
      '<path d="M5.8 11.3 2 22l10.7-3.79"/>' +
      '<path d="M4 3h.01"/>' +
      '<path d="M22 8h.01"/>' +
      '<path d="M15 2h.01"/>' +
      '<path d="M22 20h.01"/>' +
      '<path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L12 12"/>' +
      '<path d="m17 6-2.89-.45c-.84-.13-1.65.36-1.94 1.16L11 11"/>' +
      '<path d="M2 12c0-1.1.9-2 2-2 .67 0 1.26.33 1.62.84"/>'
  };

  /* ── svg(name, size, extraClass) → SVG string ── */
  function svg(name, size, extra) {
    var inner = ICONS[name];
    if (!inner) return '';
    var dim = (size === undefined || size === null) ? '1em'
            : (typeof size === 'number' ? size + 'px' : String(size));
    return '<svg class="cg-icon' + (extra ? ' ' + extra : '') +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + dim +
      '" height="' + dim + '" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      ' style="display:inline-block;vertical-align:-0.14em;flex-shrink:0">' +
      inner + '</svg>';
  }

  function has(name) { return !!ICONS[name]; }

  /* ── Hydrate <span data-icon="name" [data-icon-size="22"]> placeholders ── */
  function hydrate(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute('data-icon');
      if (!has(name)) continue;
      var sz = el.getAttribute('data-icon-size');
      el.innerHTML = svg(name, sz ? parseInt(sz, 10) : undefined);
    }
  }

  window.Icon = { svg: svg, has: has, hydrate: hydrate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  } else {
    hydrate();
  }

}());
