/**
 * avatar.js - Cultural Games customizable avatars.
 * Exposes window.Avatar: catalog + render + default + clean.
 *
 * IIFE, no dependencies. Renders friendly layered SVG faces from a config of
 * 5 slots (skin, eyes, mouth, hat, accessory). Each slot value is an item id
 * drawn from CATALOG. clean() is the XSS gate: every id that reaches markup is
 * whitelisted against CATALOG first, so no unvalidated string is ever
 * interpolated into the generated SVG.
 *
 * Shop prices here are DISPLAY values; the server (migration 017 shop_items)
 * is authoritative. Buying/equipping is validated by SECURITY DEFINER RPCs.
 */
(function () {
  'use strict';

  /* ── Slots ── */
  var SLOTS = ['skin', 'eyes', 'mouth', 'hat', 'accessory'];

  /* ── Catalog (EXACT 30 ids) ──
     skin = face base colour (all free); eyes/mouth always render something;
     hat/accessory optional with a free *-none sentinel that renders nothing. */
  var CATALOG = {
    // skin = face fill colour. All free. `color` is the swatch/fill hex.
    skin: [
      { id: 'skin-light',  label: 'Light',  price: 0, color: '#F3C9A0' },
      { id: 'skin-tan',    label: 'Tan',    price: 0, color: '#E0A878' },
      { id: 'skin-brown',  label: 'Brown',  price: 0, color: '#B57A50' },
      { id: 'skin-deep',   label: 'Deep',   price: 0, color: '#7A4A30' },
      { id: 'skin-olive',  label: 'Olive',  price: 0, color: '#C9A66B' },
      { id: 'skin-mint',   label: 'Mint',   price: 0, color: '#A8D5BA' },
      { id: 'skin-red',    label: 'Red',    price: 0, color: '#E2574C' },
      { id: 'skin-coral',  label: 'Coral',  price: 0, color: '#F0816A' },
      { id: 'skin-orange', label: 'Orange', price: 0, color: '#EF8E3B' },
      { id: 'skin-amber',  label: 'Amber',  price: 0, color: '#F4B63E' },
      { id: 'skin-yellow', label: 'Yellow', price: 0, color: '#F4D335' },
      { id: 'skin-lime',   label: 'Lime',   price: 0, color: '#A7D957' },
      { id: 'skin-green',  label: 'Green',  price: 0, color: '#5FB85A' },
      { id: 'skin-teal',   label: 'Teal',   price: 0, color: '#3FBFA8' },
      { id: 'skin-cyan',   label: 'Cyan',   price: 0, color: '#4FC3D9' },
      { id: 'skin-sky',    label: 'Sky',    price: 0, color: '#56A8E0' },
      { id: 'skin-blue',   label: 'Blue',   price: 0, color: '#5B8DEF' },
      { id: 'skin-indigo', label: 'Indigo', price: 0, color: '#6C5CE7' },
      { id: 'skin-purple', label: 'Purple', price: 0, color: '#9B59B6' },
      { id: 'skin-violet', label: 'Violet', price: 0, color: '#B57EDC' },
      { id: 'skin-pink',   label: 'Pink',   price: 0, color: '#EC6FA8' },
      { id: 'skin-rose',   label: 'Rose',   price: 0, color: '#F291B0' },
      { id: 'skin-gray',   label: 'Gray',   price: 0, color: '#9AA3AD' },
      { id: 'skin-slate',  label: 'Slate',  price: 0, color: '#5D6B7A' },
      { id: 'skin-white',  label: 'White',  price: 0, color: '#ECECEC' },
      { id: 'skin-black',  label: 'Black',  price: 0, color: '#3A3A3A' }
    ],
    eyes: [
      { id: 'eyes-dot',    label: 'Dots',    price: 0 },
      { id: 'eyes-round',  label: 'Round',   price: 0 },
      { id: 'eyes-happy',  label: 'Happy',   price: 40 },
      { id: 'eyes-sleepy', label: 'Sleepy',  price: 40 },
      { id: 'eyes-wink',   label: 'Wink',    price: 60 },
      { id: 'eyes-star',   label: 'Star',    price: 120 }
    ],
    mouth: [
      { id: 'mouth-smile',   label: 'Smile',     price: 0 },
      { id: 'mouth-neutral', label: 'Neutral',   price: 0 },
      { id: 'mouth-grin',    label: 'Grin',      price: 40 },
      { id: 'mouth-open',    label: 'Open',      price: 40 },
      { id: 'mouth-cool',    label: 'Cool',      price: 60 },
      { id: 'mouth-stache',  label: 'Moustache', price: 80 }
    ],
    hat: [
      { id: 'hat-none',  label: 'None',  price: 0 },
      { id: 'hat-cap',   label: 'Cap',   price: 60 },
      { id: 'hat-party', label: 'Party', price: 80 },
      { id: 'hat-band',  label: 'Band',  price: 60 },
      { id: 'hat-top',   label: 'Top',   price: 150 },
      { id: 'hat-crown', label: 'Crown', price: 200 }
    ],
    accessory: [
      { id: 'acc-none',    label: 'None',    price: 0 },
      { id: 'acc-glasses', label: 'Glasses', price: 60 },
      { id: 'acc-shades',  label: 'Shades',  price: 80 },
      { id: 'acc-earring', label: 'Earring', price: 40 },
      { id: 'acc-flower',  label: 'Flower',  price: 100 },
      { id: 'acc-monocle', label: 'Monocle', price: 120 }
    ]
  };

  /* ── Fast lookup maps: id → { slot, item } and id → price ── */
  var _itemById = {};
  var _slotOfId = {};
  SLOTS.forEach(function (slot) {
    CATALOG[slot].forEach(function (item) {
      _itemById[item.id] = item;
      _slotOfId[item.id] = slot;
    });
  });

  function priceOf(id) {
    var item = _itemById[id];
    return item ? (item.price | 0) : 0;
  }

  function isFree(id) {
    return priceOf(id) === 0;
  }

  /* ── Skin id → fill colour (derived from CATALOG so there's one source) ── */
  var SKIN_COLORS = {};
  CATALOG.skin.forEach(function (it) { SKIN_COLORS[it.id] = it.color; });

  // colorOf(id) → the skin swatch/fill hex, or null for non-skin ids.
  function colorOf(id) {
    return SKIN_COLORS[id] || null;
  }

  /* ── Validity helper: is `id` a real id for `slot`? ── */
  function _validFor(slot, id) {
    return _slotOfId[id] === slot;
  }

  // First free item id for a slot (skin/eyes/mouth use index 0; hat/accessory
  // use the *-none sentinel which is index 0 and price 0).
  function _firstFree(slot) {
    var list = CATALOG[slot];
    for (var i = 0; i < list.length; i++) {
      if (list[i].price === 0) return list[i].id;
    }
    return list[0].id;
  }

  /* ── clean(cfg) — the XSS gate ──
     Returns a config whose every slot holds a VALID id for that slot. Unknown,
     foreign, null, or undefined values are replaced by that slot's first free
     item (hat/accessory fall back to their *-none sentinel). NEVER returns an id
     that is not in CATALOG. */
  function clean(cfg) {
    cfg = cfg || {};
    var out = {};
    SLOTS.forEach(function (slot) {
      var v = cfg[slot];
      out[slot] = _validFor(slot, v) ? v : _firstFree(slot);
    });
    return out;
  }

  /* ── Deterministic string hash (FNV-1a-ish, no Math.random/Date) ── */
  function _hash(str) {
    str = String(str == null ? '' : str);
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* ── defaultConfig(seed) — deterministic free face from a string ──
     Same seed → same face every call. Picks among FREE items per slot for
     skin/eyes/mouth; hat/accessory default to their *-none sentinel. */
  function defaultConfig(seed) {
    var h = _hash(seed);
    function pickFree(slot, salt) {
      var free = CATALOG[slot].filter(function (it) { return it.price === 0; });
      if (!free.length) free = CATALOG[slot];
      var idx = ((_hash(seed + '|' + salt) ^ h) >>> 0) % free.length;
      return free[idx].id;
    }
    return {
      skin:      pickFree('skin', 's'),
      eyes:      pickFree('eyes', 'e'),
      mouth:     pickFree('mouth', 'm'),
      hat:       'hat-none',
      accessory: 'acc-none'
    };
  }

  /* ════════════════════════════════════════════
     SVG FRAGMENTS — viewBox 0 0 100 100
     Face circle is centred at (50,52), radius 34.
     Eyes sit around y≈45, mouth around y≈66.
  ════════════════════════════════════════════ */

  /* ── Eyes ── */
  var EYES = {
    'eyes-dot':
      '<circle cx="39" cy="46" r="4" fill="#3A2A20"/>' +
      '<circle cx="61" cy="46" r="4" fill="#3A2A20"/>',
    'eyes-round':
      '<circle cx="39" cy="46" r="6" fill="#FFFFFF" stroke="#3A2A20" stroke-width="1.5"/>' +
      '<circle cx="61" cy="46" r="6" fill="#FFFFFF" stroke="#3A2A20" stroke-width="1.5"/>' +
      '<circle cx="40" cy="47" r="2.6" fill="#3A2A20"/>' +
      '<circle cx="62" cy="47" r="2.6" fill="#3A2A20"/>',
    'eyes-happy':
      '<path d="M33 48 Q39 41 45 48" fill="none" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M55 48 Q61 41 67 48" fill="none" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>',
    'eyes-sleepy':
      '<path d="M33 47 Q39 50 45 47" fill="none" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M55 47 Q61 50 67 47" fill="none" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>',
    'eyes-wink':
      '<circle cx="39" cy="46" r="4.5" fill="#3A2A20"/>' +
      '<path d="M55 47 Q61 43 67 47" fill="none" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>',
    'eyes-star':
      '<path d="M39 40 L41 45 L46 45.5 L42 49 L43.5 54 L39 51 L34.5 54 L36 49 L32 45.5 L37 45 Z" fill="#F4B63E" stroke="#9A6E1A" stroke-width="0.8" stroke-linejoin="round"/>' +
      '<path d="M61 40 L63 45 L68 45.5 L64 49 L65.5 54 L61 51 L56.5 54 L58 49 L54 45.5 L59 45 Z" fill="#F4B63E" stroke="#9A6E1A" stroke-width="0.8" stroke-linejoin="round"/>'
  };

  /* ── Mouth ── */
  var MOUTH = {
    'mouth-smile':
      '<path d="M40 64 Q50 73 60 64" fill="none" stroke="#7A3B2A" stroke-width="3" stroke-linecap="round"/>',
    'mouth-neutral':
      '<line x1="42" y1="66" x2="58" y2="66" stroke="#7A3B2A" stroke-width="3" stroke-linecap="round"/>',
    'mouth-grin':
      '<path d="M39 63 Q50 75 61 63 Z" fill="#FFFFFF" stroke="#7A3B2A" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<line x1="39" y1="64" x2="61" y2="64" stroke="#7A3B2A" stroke-width="2"/>',
    'mouth-open':
      '<ellipse cx="50" cy="67" rx="7" ry="9" fill="#7A3B2A"/>' +
      '<ellipse cx="50" cy="71.5" rx="4.5" ry="3.5" fill="#E4756A"/>',
    'mouth-cool':
      '<path d="M40 65 Q50 70 60 65" fill="none" stroke="#7A3B2A" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M58 63 Q62 64 60 67" fill="none" stroke="#7A3B2A" stroke-width="2.4" stroke-linecap="round"/>',
    'mouth-stache':
      '<path d="M36 62 Q44 58 50 63 Q56 58 64 62 Q56 68 50 64 Q44 68 36 62 Z" fill="#4A352A"/>' +
      '<path d="M42 69 Q50 74 58 69" fill="none" stroke="#7A3B2A" stroke-width="2.6" stroke-linecap="round"/>'
  };

  /* ── Accessory (glasses sit over eyes; drawn after eyes, before hat) ── */
  var ACCESSORY = {
    'acc-none': '',
    'acc-glasses':
      '<g fill="none" stroke="#3A2A20" stroke-width="2.4">' +
        '<circle cx="39" cy="46" r="8" fill="rgba(255,255,255,0.18)"/>' +
        '<circle cx="61" cy="46" r="8" fill="rgba(255,255,255,0.18)"/>' +
        '<line x1="47" y1="46" x2="53" y2="46"/>' +
        '<line x1="31" y1="44" x2="25" y2="42"/>' +
        '<line x1="69" y1="44" x2="75" y2="42"/>' +
      '</g>',
    'acc-shades':
      '<g stroke="#1A1A1A" stroke-width="2.4">' +
        '<path d="M30 42 H48 V49 Q39 55 30 49 Z" fill="#222222"/>' +
        '<path d="M52 42 H70 V49 Q61 55 52 49 Z" fill="#222222"/>' +
        '<line x1="48" y1="44" x2="52" y2="44"/>' +
        '<line x1="30" y1="43" x2="24" y2="41"/>' +
        '<line x1="70" y1="43" x2="76" y2="41"/>' +
      '</g>',
    'acc-earring':
      '<circle cx="20" cy="60" r="3.4" fill="#F4B63E" stroke="#9A6E1A" stroke-width="1"/>',
    'acc-flower':
      '<g transform="translate(26,30)">' +
        '<circle cx="0" cy="-5" r="3.4" fill="#E8607A"/>' +
        '<circle cx="5" cy="-1.5" r="3.4" fill="#E8607A"/>' +
        '<circle cx="3" cy="4" r="3.4" fill="#E8607A"/>' +
        '<circle cx="-3" cy="4" r="3.4" fill="#E8607A"/>' +
        '<circle cx="-5" cy="-1.5" r="3.4" fill="#E8607A"/>' +
        '<circle cx="0" cy="0" r="2.6" fill="#F4D35E"/>' +
      '</g>',
    'acc-monocle':
      '<g fill="none" stroke="#9A6E1A" stroke-width="2.2">' +
        '<circle cx="61" cy="47" r="8.5" fill="rgba(255,255,255,0.16)"/>' +
        '<line x1="61" y1="55.5" x2="59" y2="70" stroke-width="1.4"/>' +
      '</g>'
  };

  /* ── Hat (drawn last, on top, near the crown of the head ~y 14-30) ── */
  var HAT = {
    'hat-none': '',
    'hat-cap':
      '<g>' +
        '<path d="M22 30 Q50 6 78 30 Q50 22 22 30 Z" fill="#2E6F6A"/>' +
        '<path d="M22 30 Q50 22 78 30 L84 33 Q50 30 22 33 Z" fill="#235653"/>' +
        '<circle cx="50" cy="15" r="3" fill="#1C413F"/>' +
      '</g>',
    'hat-party':
      '<g>' +
        '<path d="M50 4 L62 32 Q50 28 38 32 Z" fill="#E8607A" stroke="#B8425C" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<circle cx="50" cy="4" r="3.4" fill="#F4D35E"/>' +
        '<circle cx="44" cy="20" r="1.8" fill="#F4D35E"/>' +
        '<circle cx="55" cy="14" r="1.8" fill="#6FCF97"/>' +
        '<circle cx="52" cy="26" r="1.8" fill="#56A8E0"/>' +
      '</g>',
    'hat-band':
      '<g>' +
        '<path d="M20 31 Q50 24 80 31 L80 36 Q50 30 20 36 Z" fill="#C0392B"/>' +
        '<path d="M70 30 l8 -6 l1 7 l-7 4 Z" fill="#C0392B"/>' +
      '</g>',
    'hat-top':
      '<g>' +
        '<rect x="36" y="6" width="28" height="24" rx="2" fill="#2B2B2B"/>' +
        '<rect x="36" y="24" width="28" height="6" fill="#C0392B"/>' +
        '<path d="M22 31 Q50 24 78 31 Q50 36 22 31 Z" fill="#1F1F1F"/>' +
      '</g>',
    'hat-crown':
      '<g>' +
        '<path d="M28 30 L31 12 L40 24 L50 8 L60 24 L69 12 L72 30 Q50 24 28 30 Z" fill="#F4B63E" stroke="#9A6E1A" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<circle cx="31" cy="12" r="2.4" fill="#E8607A"/>' +
        '<circle cx="50" cy="8" r="2.8" fill="#56A8E0"/>' +
        '<circle cx="69" cy="12" r="2.4" fill="#6FCF97"/>' +
        '<rect x="30" y="28" width="40" height="3" fill="#D89A2A"/>' +
      '</g>'
  };

  /* ── render(cfg, size) → SVG string ── */
  function render(cfg, size) {
    cfg = clean(cfg);
    var px = (typeof size === 'number' && size > 0) ? size : 64;

    var skinColor = SKIN_COLORS[cfg.skin] || SKIN_COLORS['skin-light'];
    var eyes = EYES[cfg.eyes] || '';
    var mouth = MOUTH[cfg.mouth] || '';
    var accessory = ACCESSORY[cfg.accessory] || '';
    var hat = HAT[cfg.hat] || '';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px + '" role="img" aria-label="Avatar">' +
      // (1) soft background circle — neutral semi-transparent so it reads on light & dark
      '<circle cx="50" cy="50" r="50" fill="rgba(120,120,120,0.16)"/>' +
      // (2) face circle filled by skin colour
      '<circle cx="50" cy="52" r="34" fill="' + skinColor + '"/>' +
      // subtle ear nubs for a friendlier silhouette
      '<circle cx="18" cy="54" r="5" fill="' + skinColor + '"/>' +
      '<circle cx="82" cy="54" r="5" fill="' + skinColor + '"/>' +
      // (3) eyes
      eyes +
      // (4) mouth
      mouth +
      // (5) accessory (glasses over eyes)
      accessory +
      // (6) hat on top
      hat +
    '</svg>';
  }

  /* ── renderInto(el, cfg, size) — convenience DOM setter ── */
  function renderInto(el, cfg, size) {
    if (!el) return;
    el.innerHTML = render(cfg, size);
  }

  /* ── Public API ── */
  window.Avatar = {
    CATALOG:       CATALOG,
    SLOTS:         SLOTS,
    priceOf:       priceOf,
    isFree:        isFree,
    colorOf:       colorOf,
    clean:         clean,
    defaultConfig: defaultConfig,
    render:        render,
    renderInto:    renderInto
  };

}());
