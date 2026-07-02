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
  var SLOTS = ['skin', 'eyes', 'mouth', 'hair', 'hat', 'accessory'];

  /* ── Catalog ──
     skin = face base colour (all free); eyes/mouth always render something;
     hat/accessory optional with a free *-none sentinel that renders nothing.
     Items with an `unlock` field are achievement-gated exclusives (price 0,
     equippable only once the named achievement is earned — gated client-side). */
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
      { id: 'eyes-star',   label: 'Star',    price: 120 },
      { id: 'eyes-side',   label: 'Side-Eye', price: 40 },
      { id: 'eyes-angry',  label: 'Fierce',  price: 60 },
      { id: 'eyes-cute',   label: 'Sparkle', price: 80 },
      { id: 'eyes-heart',  label: 'Hearts',  price: 150 },
      { id: 'eyes-money',  label: 'Jackpot', price: 150 }
    ],
    mouth: [
      { id: 'mouth-smile',   label: 'Smile',     price: 0 },
      { id: 'mouth-neutral', label: 'Neutral',   price: 0 },
      { id: 'mouth-grin',    label: 'Grin',      price: 40 },
      { id: 'mouth-open',    label: 'Open',      price: 40 },
      { id: 'mouth-cool',    label: 'Cool',      price: 60 },
      { id: 'mouth-stache',  label: 'Moustache', price: 80 },
      { id: 'mouth-frown',   label: 'Frown',     price: 40 },
      { id: 'mouth-o',       label: 'Whoa',      price: 40 },
      { id: 'mouth-smirk',   label: 'Smirk',     price: 60 },
      { id: 'mouth-tongue',  label: 'Cheeky',    price: 80 },
      { id: 'mouth-beard',   label: 'Beard',     price: 150 }
    ],
    hair: [
      { id: 'hair-none',  label: 'None',     price: 0 },
      { id: 'hair-short', label: 'Short',    price: 0 },
      { id: 'hair-buzz',  label: 'Buzz',     price: 40 },
      { id: 'hair-side',  label: 'Swoop',    price: 60 },
      { id: 'hair-bun',   label: 'Top Bun',  price: 100 },
      { id: 'hair-curly', label: 'Curls',    price: 120 },
      { id: 'hair-pony',  label: 'Ponytail', price: 150 },
      { id: 'hair-long',  label: 'Long',     price: 200 }
    ],
    hat: [
      { id: 'hat-none',  label: 'None',  price: 0 },
      { id: 'hat-cap',   label: 'Cap',   price: 60 },
      { id: 'hat-party', label: 'Party', price: 80 },
      { id: 'hat-band',  label: 'Band',  price: 60 },
      { id: 'hat-top',   label: 'Top',   price: 150 },
      { id: 'hat-crown', label: 'Crown', price: 200 },
      // Exclusive — not buyable. `unlock` is the achievement id that grants it
      // (gated client-side; price 0 so the server's set_avatar accepts it).
      { id: 'hat-tl-lord', label: 'Lord of the South', price: 0, unlock: 'tl_wins_50' },
      // Exclusive per-game gold (*_wins_50) hats — achievement-gated, price 0.
      { id: 'hat-fn', label: 'Master of Fanoron',  price: 0, unlock: 'fn_wins_50' },
      { id: 'hat-ht', label: 'Viking Warlord',     price: 0, unlock: 'ht_wins_50' },
      { id: 'hat-pc', label: "Akbar's Champion",   price: 0, unlock: 'pc_wins_50' },
      { id: 'hat-gj', label: 'Grand Vizier',       price: 0, unlock: 'gj_wins_50' },
      { id: 'hat-mj', label: 'Dragon of the East', price: 0, unlock: 'mj_wins_50' },
      { id: 'hat-ow', label: 'Grand Harvester',    price: 0, unlock: 'ow_wins_50' },
      { id: 'hat-lt', label: 'Consul of the Board',price: 0, unlock: 'lt_wins_50' },
      { id: 'hat-ca', label: 'El Gran Tahúr', price: 0, unlock: 'ca_wins_50' },
      { id: 'hat-xf', label: 'Khan of the Board',  price: 0, unlock: 'xf_wins_50' },
      { id: 'hat-fd', label: 'Hari ng Dama',       price: 0, unlock: 'fd_wins_50' },
      { id: 'hat-cu', label: 'Rey de la Baraja',   price: 0, unlock: 'cu_wins_50' },
      { id: 'hat-yn', label: '말 대장', price: 0, unlock: 'yn_wins_50' },
      { id: 'hat-yo', label: 'Master of Yoté', price: 0, unlock: 'yo_wins_50' },
      { id: 'hat-se', label: 'Justified Soul',     price: 0, unlock: 'se_wins_50' },
      { id: 'hat-tu', label: 'Campió de Penya',price: 0, unlock: 'tu_wins_50' }
    ],
    accessory: [
      { id: 'acc-none',    label: 'None',    price: 0 },
      { id: 'acc-glasses', label: 'Glasses', price: 60 },
      { id: 'acc-shades',  label: 'Shades',  price: 80 },
      { id: 'acc-earring', label: 'Earring', price: 40 },
      { id: 'acc-flower',  label: 'Flower',  price: 100 },
      { id: 'acc-monocle', label: 'Monocle', price: 120 },
      // Exclusive — not buyable. `unlock` is the achievement id that grants it
      // (gated client-side; price 0 so the server's set_avatar accepts it).
      { id: 'acc-tl-card', label: 'Card Shark', price: 0, unlock: 'tl_wins_10' },
      // Exclusive per-game silver (*_wins_10) accessories — achievement-gated, price 0.
      { id: 'acc-fn',  label: "Vaho's Tactician", price: 0, unlock: 'fn_wins_10'  },
      { id: 'acc-ht',  label: 'Jarl of the Board', price: 0, unlock: 'ht_wins_10'  },
      { id: 'acc-pc',  label: 'Court Favourite',   price: 0, unlock: 'pc_wins_10'  },
      { id: 'acc-gj',  label: 'Mughal Dealer',     price: 0, unlock: 'gj_wins_10'  },
      { id: 'acc-mj',  label: 'Tile Master',       price: 0, unlock: 'mj_wins_10'  },
      { id: 'acc-ow',  label: 'Seed Counter',      price: 0, unlock: 'ow_wins_10'  },
      { id: 'acc-oaq', label: 'Market Master',     price: 0, unlock: 'oaq_wins_10' },
      { id: 'acc-pt',  label: 'Serpent Caller',    price: 0, unlock: 'pt_wins_10'  },
      { id: 'acc-pu',  label: 'War Runner',        price: 0, unlock: 'pu_wins_10'  },
      { id: 'acc-pg',  label: 'Pit Master',        price: 0, unlock: 'pg_wins_10'  },
      { id: 'acc-bc',  label: 'Sea Gambler',       price: 0, unlock: 'bc_wins_10'  },
      { id: 'acc-lt',  label: 'Praetorian Guard',  price: 0, unlock: 'lt_wins_10'  },
      { id: 'acc-ca',  label: 'Cup Master',        price: 0, unlock: 'ca_wins_10'  },
      { id: 'acc-xf',  label: 'Square Master',     price: 0, unlock: 'xf_wins_10'  },
      { id: 'acc-fd',  label: 'Dama Majestro',     price: 0, unlock: 'fd_wins_10'  },
      { id: 'acc-cu',  label: 'Maestro de Mano',   price: 0, unlock: 'cu_wins_10'  },
      { id: 'acc-yn',  label: '윷 명인', price: 0, unlock: 'yn_wins_10'  },
      { id: 'acc-yo',  label: 'Sand Strategist',   price: 0, unlock: 'yo_wins_10'  },
      { id: 'acc-se',  label: 'Scribe of the Duat', price: 0, unlock: 'se_wins_10'  },
      { id: 'acc-tu',  label: 'Trucador de Barri', price: 0, unlock: 'tu_wins_10'  }
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
      hair:      'hair-none',
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
      '<path d="M61 40 L63 45 L68 45.5 L64 49 L65.5 54 L61 51 L56.5 54 L58 49 L54 45.5 L59 45 Z" fill="#F4B63E" stroke="#9A6E1A" stroke-width="0.8" stroke-linejoin="round"/>',
    // Looking to the side — round whites with both pupils shifted right.
    'eyes-side':
      '<circle cx="39" cy="46" r="6" fill="#FFFFFF" stroke="#3A2A20" stroke-width="1.5"/>' +
      '<circle cx="61" cy="46" r="6" fill="#FFFFFF" stroke="#3A2A20" stroke-width="1.5"/>' +
      '<circle cx="42.5" cy="46" r="2.8" fill="#3A2A20"/>' +
      '<circle cx="64.5" cy="46" r="2.8" fill="#3A2A20"/>',
    // Fierce — angled brows sloping down to the centre over sharp pupils.
    'eyes-angry':
      '<path d="M32 40.5 L46 44.5" stroke="#3A2A20" stroke-width="2.8" stroke-linecap="round"/>' +
      '<path d="M68 40.5 L54 44.5" stroke="#3A2A20" stroke-width="2.8" stroke-linecap="round"/>' +
      '<circle cx="39" cy="47.5" r="3.6" fill="#3A2A20"/>' +
      '<circle cx="61" cy="47.5" r="3.6" fill="#3A2A20"/>',
    // Sparkle — big kawaii eyes with a white glint.
    'eyes-cute':
      '<circle cx="39" cy="46" r="7.6" fill="#FFFFFF" stroke="#3A2A20" stroke-width="1.6"/>' +
      '<circle cx="61" cy="46" r="7.6" fill="#FFFFFF" stroke="#3A2A20" stroke-width="1.6"/>' +
      '<circle cx="39" cy="47" r="4.6" fill="#3A2A20"/>' +
      '<circle cx="61" cy="47" r="4.6" fill="#3A2A20"/>' +
      '<circle cx="41" cy="44" r="1.7" fill="#FFFFFF"/>' +
      '<circle cx="63" cy="44" r="1.7" fill="#FFFFFF"/>',
    // Hearts — a pair of pink heart eyes.
    'eyes-heart':
      '<path d="M39 50 C34 45 34 40.5 39 43 C44 40.5 44 45 39 50 Z" fill="#E8607A" stroke="#B8425C" stroke-width="0.8" stroke-linejoin="round"/>' +
      '<path d="M61 50 C56 45 56 40.5 61 43 C66 40.5 66 45 61 50 Z" fill="#E8607A" stroke="#B8425C" stroke-width="0.8" stroke-linejoin="round"/>',
    // Jackpot — gold-coin eyes stamped with a dollar sign (on theme with coins).
    'eyes-money':
      '<circle cx="39" cy="46" r="6.6" fill="#F4D335" stroke="#9A6E1A" stroke-width="1.4"/>' +
      '<circle cx="61" cy="46" r="6.6" fill="#F4D335" stroke="#9A6E1A" stroke-width="1.4"/>' +
      '<text x="39" y="49.4" font-family="Arial, sans-serif" font-size="8.5" font-weight="700" fill="#9A6E1A" text-anchor="middle">$</text>' +
      '<text x="61" y="49.4" font-family="Arial, sans-serif" font-size="8.5" font-weight="700" fill="#9A6E1A" text-anchor="middle">$</text>'
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
      '<path d="M42 69 Q50 74 58 69" fill="none" stroke="#7A3B2A" stroke-width="2.6" stroke-linecap="round"/>',
    'mouth-frown':
      '<path d="M40 69 Q50 61 60 69" fill="none" stroke="#7A3B2A" stroke-width="3" stroke-linecap="round"/>',
    // Whoa — a small surprised open "o".
    'mouth-o':
      '<ellipse cx="50" cy="66" rx="5" ry="5.5" fill="#7A3B2A"/>' +
      '<ellipse cx="50" cy="67.4" rx="2.6" ry="2.2" fill="#E4756A"/>',
    // Smirk — flat on one side, curling up on the other.
    'mouth-smirk':
      '<path d="M40 66 Q49 68.5 61 62.5" fill="none" stroke="#7A3B2A" stroke-width="3" stroke-linecap="round"/>',
    // Cheeky — a wide smile with the tongue sticking out.
    'mouth-tongue':
      '<path d="M40 63 Q50 72 60 63" fill="none" stroke="#7A3B2A" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M45.5 68 Q50 77 54.5 68 Z" fill="#E8607A" stroke="#B8425C" stroke-width="0.8" stroke-linejoin="round"/>',
    // Beard — a full dark beard framing a soft smile.
    'mouth-beard':
      '<path d="M33 57 Q34 79 50 81 Q66 79 67 57 Q60 65 50 65 Q40 65 33 57 Z" fill="#4A352A"/>' +
      '<path d="M42 66 Q50 71 58 66" fill="none" stroke="#2E2019" stroke-width="2.4" stroke-linecap="round"/>'
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
      '</g>',
    // Exclusive (Tiến Lên "Saigon Shark"): a small playing-card emblem tucked by
    // the cheek, in the cluster style of acc-flower. A tilted ace with a red pip.
    'acc-tl-card':
      '<g transform="translate(25,32) rotate(-12)">' +
        '<rect x="-7" y="-9" width="14" height="18" rx="2" fill="#FBF5E6" stroke="#5A3010" stroke-width="1.2"/>' +
        '<path d="M0 -5 L3.4 0.5 L0 4 L-3.4 0.5 Z" fill="#C0392B"/>' +
        '<text x="-4.6" y="-3.4" font-family="serif" font-size="4.2" font-weight="700" fill="#C0392B">A</text>' +
        '<text x="2.2" y="7.6" font-family="serif" font-size="4.2" font-weight="700" fill="#C0392B" transform="rotate(180 3.4 6)">A</text>' +
      '</g>',

    /* ════ Per-game exclusive accessories (silver *_wins_10) ════
       Small cheek-emblems in the cluster style of acc-flower / acc-tl-card,
       each themed to its game's culture; readable at ~32px. */

    // Fanorona (Madagascar) — an aloalo carving fretwork: a diamond lattice plaque.
    'acc-fn':
      '<g transform="translate(26,31)">' +
        '<rect x="-7.5" y="-8" width="15" height="16" rx="1.5" fill="#8A5A2B" stroke="#553415" stroke-width="1.1"/>' +
        '<path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill="none" stroke="#E8C98A" stroke-width="1.4"/>' +
        '<path d="M0 -3 L3 0 L0 3 L-3 0 Z" fill="#E8C98A"/>' +
        '<line x1="-6" y1="0" x2="-7.5" y2="0" stroke="#E8C98A" stroke-width="1.2"/>' +
        '<line x1="6" y1="0" x2="7.5" y2="0" stroke="#E8C98A" stroke-width="1.2"/>' +
      '</g>',
    // Hnefatafl (Norse) — a round Viking shield with iron boss and a bound rune.
    'acc-ht':
      '<g transform="translate(25,32)">' +
        '<circle cx="0" cy="0" r="8.5" fill="#B23A2E" stroke="#5A1E16" stroke-width="1.2"/>' +
        '<circle cx="0" cy="0" r="8.5" fill="none" stroke="#E8C98A" stroke-width="0.8" stroke-dasharray="2 1.4"/>' +
        '<circle cx="0" cy="0" r="2.8" fill="#C9CDD2" stroke="#5A1E16" stroke-width="0.9"/>' +
        '<path d="M0 -5.5 L0 5.5 M0 -2 L3.2 -4.4 M0 2 L-3.2 4.4" fill="none" stroke="#2A2A2E" stroke-width="1.1" stroke-linecap="round"/>' +
      '</g>',
    // Pachisi (Mughal India) — a cowrie shell (the game's dice), ridged & curled.
    'acc-pc':
      '<g transform="translate(26,32)">' +
        '<ellipse cx="0" cy="0" rx="6.5" ry="8.5" fill="#F2E6CE" stroke="#9C7A45" stroke-width="1.1"/>' +
        '<path d="M0 -7 Q2.4 0 0 7 Q-2.4 0 0 -7 Z" fill="#C9A86A"/>' +
        '<path d="M0 -6 L0 6" stroke="#6E4E22" stroke-width="1.1"/>' +
        '<path d="M-1.4 -3 L1.4 -3 M-1.7 0 L1.7 0 M-1.4 3 L1.4 3" stroke="#6E4E22" stroke-width="0.8"/>' +
      '</g>',
    // Ganjifa (Mughal) — a round hand-painted ganjifa playing card.
    'acc-gj':
      '<g transform="translate(26,31)">' +
        '<circle cx="0" cy="0" r="8.5" fill="#F6EAD0" stroke="#8A5A12" stroke-width="1.2"/>' +
        '<circle cx="0" cy="0" r="6" fill="none" stroke="#1C6B5A" stroke-width="1"/>' +
        '<circle cx="0" cy="0" r="3" fill="#C9302C"/>' +
        '<path d="M0 -6 L0 -3 M0 6 L0 3 M-6 0 L-3 0 M6 0 L3 0" stroke="#8A5A12" stroke-width="1"/>' +
      '</g>',
    // Mahjong (China) — a bamboo "1 Bamboo / 1 Circle" style tile.
    'acc-mj':
      '<g transform="translate(25,31)">' +
        '<rect x="-6.5" y="-9" width="13" height="18" rx="2" fill="#F4F1E4" stroke="#3A6B4A" stroke-width="1.1"/>' +
        '<rect x="-6.5" y="-9" width="13" height="18" rx="2" fill="none" stroke="#D8D2BE" stroke-width="0.6"/>' +
        '<circle cx="0" cy="-3.5" r="3.2" fill="none" stroke="#C0392B" stroke-width="1.4"/>' +
        '<circle cx="0" cy="-3.5" r="1" fill="#2E6FB0"/>' +
        '<rect x="-0.9" y="2" width="1.8" height="6" rx="0.9" fill="#2E8B57"/>' +
        '<path d="M-2.6 3 Q0 5 2.6 3 M-2.6 6.6 Q0 8.6 2.6 6.6" fill="none" stroke="#2E8B57" stroke-width="1"/>' +
      '</g>',
    // Oware (West Africa) — three cupped harvest seeds in a kente-coloured pit.
    'acc-ow':
      '<g transform="translate(26,32)">' +
        '<ellipse cx="0" cy="2.5" rx="8.5" ry="6" fill="#6E4523" stroke="#3F2712" stroke-width="1.1"/>' +
        '<ellipse cx="0" cy="2.5" rx="6" ry="3.8" fill="#4A2D15"/>' +
        '<ellipse cx="-3" cy="1.6" rx="2.2" ry="2.6" fill="#E8C98A"/>' +
        '<ellipse cx="2.6" cy="1.2" rx="2.2" ry="2.6" fill="#D9A441"/>' +
        '<ellipse cx="0.2" cy="3.4" rx="2.2" ry="2.6" fill="#C97B3C"/>' +
      '</g>',
    // Ô Ăn Quan (Vietnam) — the mandarin square: a quan stone flanked by pebbles.
    'acc-oaq':
      '<g transform="translate(26,32)">' +
        '<path d="M-8 -7 L8 -7 L8 7 L-8 7 Z" fill="#C9B79A" stroke="#6E5A3C" stroke-width="1.1"/>' +
        '<path d="M-8 -7 L8 7 M8 -7 L-8 7" stroke="#6E5A3C" stroke-width="0.7"/>' +
        '<circle cx="0" cy="0" r="3.4" fill="#7A6A88" stroke="#3F3450" stroke-width="0.9"/>' +
        '<circle cx="-5" cy="-4" r="1.5" fill="#F2E6CE"/>' +
        '<circle cx="5" cy="4" r="1.5" fill="#F2E6CE"/>' +
      '</g>',
    // Patolli (Mesoamerica) — a polished jade bead with a feathered-serpent glint.
    'acc-pt':
      '<g transform="translate(26,32)">' +
        '<circle cx="0" cy="0" r="8" fill="#2E8B6E" stroke="#15523F" stroke-width="1.2"/>' +
        '<circle cx="0" cy="0" r="8" fill="none" stroke="#7FE0BE" stroke-width="0.7" stroke-dasharray="1.6 1.4"/>' +
        '<path d="M-3.5 -2 Q0 -5 3.5 -2 Q1 0 3.5 2" fill="none" stroke="#0E3A2C" stroke-width="1.2" stroke-linecap="round"/>' +
        '<circle cx="-2.4" cy="-2.6" r="1.6" fill="#CFF5E6"/>' +
      '</g>',
    // Puluc (Maya) — a maize kernel token on a cut cane segment.
    'acc-pu':
      '<g transform="translate(26,32)">' +
        '<rect x="-7" y="-3.5" width="14" height="7" rx="3.5" fill="#C9A24B" stroke="#7A5C1E" stroke-width="1.1"/>' +
        '<line x1="-2" y1="-3.5" x2="-2" y2="3.5" stroke="#7A5C1E" stroke-width="0.9"/>' +
        '<line x1="3" y1="-3.5" x2="3" y2="3.5" stroke="#7A5C1E" stroke-width="0.9"/>' +
        '<path d="M-6 -6.5 Q-4 -10 -2 -6.5 Q-4 -5 -6 -6.5 Z" fill="#F4D335" stroke="#A07A12" stroke-width="0.8"/>' +
      '</g>',
    // Pallanguzhi (South India) — a cluster of cowrie shells.
    'acc-pg':
      '<g transform="translate(26,32)" stroke="#9C7A45" stroke-width="0.9">' +
        '<ellipse cx="-3" cy="-2" rx="3" ry="4.4" fill="#F2E6CE"/>' +
        '<ellipse cx="3.2" cy="-1" rx="3" ry="4.4" fill="#E6D3AE"/>' +
        '<ellipse cx="0" cy="3.5" rx="3" ry="4.4" fill="#F2E6CE"/>' +
        '<path d="M-3 -5.5 L-3 1.5 M3.2 -4.5 L3.2 2.5 M0 0 L0 7" stroke="#8A6A38" stroke-width="0.8" fill="none"/>' +
      '</g>',
    // Bầu Cua (Vietnam) — a painted die showing the crab pip (gourd-crab-fish game).
    'acc-bc':
      '<g transform="translate(26,31)">' +
        '<rect x="-8" y="-8" width="16" height="16" rx="3" fill="#FBF5E6" stroke="#A33" stroke-width="1.2"/>' +
        '<ellipse cx="0" cy="1" rx="4.4" ry="3.2" fill="#D24B3E"/>' +
        '<path d="M-5.5 -1 L-3.5 1 M5.5 -1 L3.5 1 M-5 3.5 L-3 2.5 M5 3.5 L3 2.5" stroke="#D24B3E" stroke-width="1.2" stroke-linecap="round"/>' +
        '<path d="M-2 -2.4 L-3 -4.4 M2 -2.4 L3 -4.4" stroke="#D24B3E" stroke-width="1.2" stroke-linecap="round"/>' +
        '<circle cx="-1.4" cy="0.4" r="0.7" fill="#FBF5E6"/>' +
        '<circle cx="1.4" cy="0.4" r="0.7" fill="#FBF5E6"/>' +
      '</g>',
    // Latrunculi (Rome) — a legionary aquila standard on a vexillum staff.
    'acc-lt':
      '<g transform="translate(25,31)">' +
        '<line x1="0" y1="-9" x2="0" y2="9" stroke="#8A5A2B" stroke-width="1.6"/>' +
        '<path d="M0 -9 Q-4 -9 -4 -5 Q-1 -6 0 -4 Q1 -6 4 -5 Q4 -9 0 -9 Z" fill="#E0B53A" stroke="#8A5A12" stroke-width="0.7"/>' +
        '<rect x="-5" y="-3" width="10" height="6" fill="#9C2B2B" stroke="#5A1414" stroke-width="0.8"/>' +
        '<text x="0" y="2" font-family="serif" font-size="4" font-weight="700" fill="#E8C98A" text-anchor="middle">SPQR</text>' +
      '</g>',
    // Cachos (Andes) — a leather dice cubilete (cup) tipped with two dice spilling.
    'acc-ca':
      '<g transform="translate(25,32)">' +
        '<path d="M-6 -7 L6 -7 L4.5 6 L-4.5 6 Z" fill="#6E4523" stroke="#3F2712" stroke-width="1.2" transform="rotate(18)"/>' +
        '<ellipse cx="2" cy="-6.6" rx="6" ry="2" fill="#4A2D15" transform="rotate(18)"/>' +
        '<rect x="3.5" y="3.5" width="5" height="5" rx="1" fill="#FBF5E6" stroke="#7A5C1E" stroke-width="0.8" transform="rotate(20 6 6)"/>' +
        '<circle cx="6" cy="6" r="0.8" fill="#3A2A20"/>' +
      '</g>',
    // Xinjiang Fangqi — a carved board square/tile with an Islamic eight-point star.
    'acc-xf':
      '<g transform="translate(26,31)">' +
        '<rect x="-8" y="-8" width="16" height="16" rx="1.5" fill="#1C6B7A" stroke="#0E3A44" stroke-width="1.2"/>' +
        '<path d="M0 -6 L1.8 -1.8 L6 0 L1.8 1.8 L0 6 L-1.8 1.8 L-6 0 L-1.8 -1.8 Z" fill="#E8C98A"/>' +
        '<path d="M-4.2 -4.2 L4.2 4.2 M4.2 -4.2 L-4.2 4.2" stroke="#E8C98A" stroke-width="1.1"/>' +
        '<circle cx="0" cy="0" r="1.6" fill="#C0392B"/>' +
      '</g>',
    // Filipino Dama — a crowned dama checker with the Philippine sun-ray star.
    'acc-fd':
      '<g transform="translate(26,32)">' +
        '<circle cx="0" cy="0" r="8.5" fill="#0C4DA2" stroke="#072F63" stroke-width="1.2"/>' +
        '<circle cx="0" cy="0" r="5.5" fill="#0C4DA2" stroke="#F4C430" stroke-width="1"/>' +
        '<g fill="#F4C430">' +
          '<path d="M0 -5 L1.2 -1.4 L0 0 L-1.2 -1.4 Z"/>' +
          '<path d="M5 0 L1.4 1.2 L0 0 L1.4 -1.2 Z"/>' +
          '<path d="M0 5 L-1.2 1.4 L0 0 L1.2 1.4 Z"/>' +
          '<path d="M-5 0 L-1.4 -1.2 L0 0 L-1.4 1.2 Z"/>' +
        '</g>' +
        '<circle cx="0" cy="0" r="1.4" fill="#F4C430"/>' +
      '</g>',
    // Cuarenta (Ecuador) — a Spanish-suit card (caballo de espadas) tilted.
    'acc-cu':
      '<g transform="translate(25,32) rotate(-10)">' +
        '<rect x="-7" y="-9" width="14" height="18" rx="2" fill="#FBF5E6" stroke="#5A3010" stroke-width="1.2"/>' +
        '<path d="M0 -5 L1.4 -2 L4 -2 L2 0.4 L2.8 3.4 L0 1.8 L-2.8 3.4 L-2 0.4 L-4 -2 L-1.4 -2 Z" fill="#2E6FB0"/>' +
        '<text x="-4.4" y="-3.4" font-family="serif" font-size="4" font-weight="700" fill="#2E6FB0">40</text>' +
      '</g>',
    // Yut Nori (Korea) — a fanned set of four yut sticks (flat/round).
    'acc-yn':
      '<g transform="translate(26,32)">' +
        '<g stroke="#6E4523" stroke-width="0.8">' +
          '<rect x="-8" y="-2.6" width="16" height="3.2" rx="1.6" fill="#D9B98A" transform="rotate(-20)"/>' +
          '<rect x="-8" y="-2.6" width="16" height="3.2" rx="1.6" fill="#E8D3A8" transform="rotate(-7)"/>' +
          '<rect x="-8" y="-2.6" width="16" height="3.2" rx="1.6" fill="#D9B98A" transform="rotate(7)"/>' +
          '<rect x="-8" y="-2.6" width="16" height="3.2" rx="1.6" fill="#E8D3A8" transform="rotate(20)"/>' +
        '</g>' +
        '<circle cx="-1" cy="0" r="1" fill="#C0392B"/>' +
      '</g>',
    // Yoté (West Africa) — a sown seed pressed into a sand pit, ripple rings.
    'acc-yo':
      '<g transform="translate(26,32)">' +
        '<ellipse cx="0" cy="0" rx="8.5" ry="7" fill="#E0C081" stroke="#A8803E" stroke-width="1.1"/>' +
        '<ellipse cx="0" cy="0.5" rx="5.5" ry="4.4" fill="none" stroke="#B8902E" stroke-width="0.8"/>' +
        '<ellipse cx="0" cy="1" rx="3" ry="2.4" fill="none" stroke="#B8902E" stroke-width="0.8"/>' +
        '<ellipse cx="0" cy="1" rx="2" ry="2.6" fill="#4A2D15"/>' +
      '</g>',
    // Senet (Egypt) — an ankh, the key of life, in gold.
    'acc-se':
      '<g transform="translate(25,31)">' +
        '<path d="M0 -9 Q-4 -9 -4 -5 Q-4 -1.5 0 -1 Q4 -1.5 4 -5 Q4 -9 0 -9 Z" fill="none" stroke="#E0B53A" stroke-width="2.2"/>' +
        '<line x1="0" y1="-1" x2="0" y2="9" stroke="#E0B53A" stroke-width="2.4" stroke-linecap="round"/>' +
        '<line x1="-5" y1="2" x2="5" y2="2" stroke="#E0B53A" stroke-width="2.4" stroke-linecap="round"/>' +
      '</g>',
    // Truc (Catalonia) — a Spanish-suit oros (coins) card with a barretina-red back.
    'acc-tu':
      '<g transform="translate(25,32) rotate(-10)">' +
        '<rect x="-7" y="-9" width="14" height="18" rx="2" fill="#FBF5E6" stroke="#5A3010" stroke-width="1.2"/>' +
        '<circle cx="0" cy="-1" r="3.6" fill="#E0B53A" stroke="#8A5A12" stroke-width="1"/>' +
        '<circle cx="0" cy="-1" r="1.6" fill="none" stroke="#8A5A12" stroke-width="0.7"/>' +
        '<text x="-4.4" y="-3.4" font-family="serif" font-size="4" font-weight="700" fill="#C0392B">3</text>' +
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
      '</g>',
    // Exclusive (Tiến Lên "Lord of the South"): an ornate gold crown — five tall
    // jewel-tipped points and a gem-studded band, visibly fancier than hat-crown.
    'hat-tl-lord':
      '<g>' +
        '<path d="M24 31 L27 8 L36 22 L43 4 L50 18 L57 4 L64 22 L73 8 L76 31 Q50 24 24 31 Z" fill="#F7C948" stroke="#8A5A12" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path d="M24 31 L27 8 L36 22 L43 4 L50 18 L57 4 L64 22 L73 8 L76 31" fill="none" stroke="#FCE3A0" stroke-width="0.9" stroke-linejoin="round"/>' +
        '<circle cx="27" cy="8"  r="2.6" fill="#6FCF97" stroke="#2E6F4A" stroke-width="0.6"/>' +
        '<circle cx="43" cy="4"  r="3"   fill="#E8607A" stroke="#8A2440" stroke-width="0.6"/>' +
        '<circle cx="50" cy="18" r="2.2" fill="#FFFFFF" stroke="#9A6E1A" stroke-width="0.6"/>' +
        '<circle cx="57" cy="4"  r="3"   fill="#56A8E0" stroke="#1E4F78" stroke-width="0.6"/>' +
        '<circle cx="73" cy="8"  r="2.6" fill="#9B59B6" stroke="#5A2E70" stroke-width="0.6"/>' +
        '<rect x="26" y="27" width="48" height="5" rx="1.5" fill="#E0A82E" stroke="#8A5A12" stroke-width="0.8"/>' +
        '<circle cx="34" cy="29.5" r="1.6" fill="#E8607A"/>' +
        '<circle cx="43" cy="29.5" r="1.6" fill="#56A8E0"/>' +
        '<circle cx="50" cy="29.5" r="1.6" fill="#6FCF97"/>' +
        '<circle cx="57" cy="29.5" r="1.6" fill="#9B59B6"/>' +
        '<circle cx="66" cy="29.5" r="1.6" fill="#F4D335"/>' +
      '</g>',

    /* ════ Per-game exclusive hats (gold *_wins_50) ════
       Each sits near the crown (~y 4-31), drawn last on top; a culturally
       distinct headpiece, differentiated from the buyable hat-crown. */

    // Fanorona "Master of Fanoron" — a woven raffia headband/crown (Madagascar).
    'hat-fn':
      '<g>' +
        '<path d="M20 31 Q50 22 80 31 L80 25 Q50 16 20 25 Z" fill="#C99A52" stroke="#7A5A28" stroke-width="1.2"/>' +
        '<path d="M22 22 L78 22" stroke="#8A6A38" stroke-width="1"/>' +
        '<path d="M24 19 L30 28 M32 18 L38 28 M40 17 L46 28 M50 16.5 L56 28 M58 17 L64 28 M66 18 L72 28" stroke="#E8C98A" stroke-width="1.4"/>' +
        '<path d="M24 28 L30 19 M32 28 L38 18 M40 28 L46 17 M50 28 L56 16.5 M58 28 L64 17 M66 28 L72 18" stroke="#8A6A38" stroke-width="1"/>' +
        '<path d="M44 14 L50 8 L56 14 Q50 11 44 14 Z" fill="#C99A52" stroke="#7A5A28" stroke-width="1"/>' +
      '</g>',
    // Hnefatafl "Viking Warlord" — a horned iron helm with riveted noseguard.
    'hat-ht':
      '<g>' +
        '<path d="M26 30 Q50 8 74 30 Q50 22 26 30 Z" fill="#9AA3AD" stroke="#4A525C" stroke-width="1.4"/>' +
        '<path d="M50 16 L50 34" stroke="#4A525C" stroke-width="1.4"/>' +
        '<rect x="47" y="28" width="6" height="10" rx="2" fill="#7C858F" stroke="#4A525C" stroke-width="1"/>' +
        '<path d="M28 27 Q14 24 12 10 Q22 14 30 24 Z" fill="#ECE3D0" stroke="#9A8A60" stroke-width="1.2"/>' +
        '<path d="M72 27 Q86 24 88 10 Q78 14 70 24 Z" fill="#ECE3D0" stroke="#9A8A60" stroke-width="1.2"/>' +
        '<circle cx="34" cy="27" r="1.3" fill="#4A525C"/>' +
        '<circle cx="66" cy="27" r="1.3" fill="#4A525C"/>' +
      '</g>',
    // Pachisi "Akbar's Champion" — a Mughal jewelled turban with plume (sarpech).
    'hat-pc':
      '<g>' +
        '<path d="M22 31 Q26 14 50 13 Q74 14 78 31 Q50 24 22 31 Z" fill="#E8E0D0" stroke="#9A8A60" stroke-width="1.2"/>' +
        '<path d="M26 27 Q38 20 50 21 Q62 20 74 27" fill="none" stroke="#B23A2E" stroke-width="1.6"/>' +
        '<path d="M24 30 Q38 24 50 25 Q62 24 76 30" fill="none" stroke="#1C6B5A" stroke-width="1.4"/>' +
        '<circle cx="50" cy="16" r="2.6" fill="#2E6FB0" stroke="#0E3A60" stroke-width="0.8"/>' +
        '<path d="M50 14 Q53 6 50 3 Q47 6 50 14 Z" fill="#E0B53A" stroke="#8A5A12" stroke-width="0.8"/>' +
      '</g>',
    // Ganjifa "Grand Vizier" — a tall vizier turban with a central ruby jewel.
    'hat-gj':
      '<g>' +
        '<path d="M24 31 Q24 10 50 9 Q76 10 76 31 Q50 24 24 31 Z" fill="#2E5E8C" stroke="#16344F" stroke-width="1.2"/>' +
        '<path d="M28 28 Q40 18 50 19 Q60 18 72 28" fill="none" stroke="#E8E0D0" stroke-width="1.6"/>' +
        '<path d="M26 31 Q40 23 50 24 Q60 23 74 31" fill="none" stroke="#E0B53A" stroke-width="1.4"/>' +
        '<path d="M44 14 L50 9 L56 14 Z" fill="#E0B53A" stroke="#8A5A12" stroke-width="0.8"/>' +
        '<circle cx="50" cy="13" r="2.6" fill="#C0392B" stroke="#7A1414" stroke-width="0.8"/>' +
      '</g>',
    // Mahjong "Dragon of the East" — a coiled jade dragon crest over a gold band.
    'hat-mj':
      '<g>' +
        '<path d="M22 31 Q50 24 78 31 L78 27 Q50 20 22 27 Z" fill="#C0392B" stroke="#7A1414" stroke-width="1.1"/>' +
        '<path d="M30 26 Q34 12 46 16 Q52 18 50 24 Q48 19 44 19 Q38 19 38 26 Z" fill="#2E8B6E" stroke="#15523F" stroke-width="1.1"/>' +
        '<path d="M50 24 Q56 14 66 18 Q72 21 70 26 Q66 20 60 21 Q54 22 56 26 Z" fill="#3AA886" stroke="#15523F" stroke-width="1.1"/>' +
        '<circle cx="40" cy="20" r="1.4" fill="#F4D335"/>' +
        '<path d="M30 26 Q26 22 24 24 M70 26 Q74 22 76 24" stroke="#15523F" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="36" cy="29" r="1.2" fill="#F4D335"/>' +
        '<circle cx="50" cy="29.5" r="1.2" fill="#F4D335"/>' +
        '<circle cx="64" cy="29" r="1.2" fill="#F4D335"/>' +
      '</g>',
    // Oware "Grand Harvester" — a kente-band crown topped with cowrie shells.
    'hat-ow':
      '<g>' +
        '<rect x="22" y="22" width="56" height="9" rx="2" fill="#D9A441" stroke="#8A5A12" stroke-width="1.2"/>' +
        '<path d="M26 22 L34 22 M42 22 L50 22 M58 22 L66 22" stroke="#1C6B5A" stroke-width="2.4"/>' +
        '<path d="M34 22 L42 22 M50 22 L58 22 M66 22 L74 22" stroke="#C0392B" stroke-width="2.4"/>' +
        '<rect x="22" y="28" width="56" height="3" fill="#2A2A2E" opacity="0.25"/>' +
        '<ellipse cx="36" cy="18" rx="3" ry="4" fill="#F2E6CE" stroke="#9C7A45" stroke-width="0.9"/>' +
        '<ellipse cx="50" cy="16" rx="3" ry="4" fill="#F2E6CE" stroke="#9C7A45" stroke-width="0.9"/>' +
        '<ellipse cx="64" cy="18" rx="3" ry="4" fill="#F2E6CE" stroke="#9C7A45" stroke-width="0.9"/>' +
        '<path d="M36 14.5 L36 21.5 M50 12.5 L50 19.5 M64 14.5 L64 21.5" stroke="#8A6A38" stroke-width="0.8"/>' +
      '</g>',
    // Latrunculi "Consul of the Board" — a Roman golden laurel wreath.
    'hat-lt':
      '<g fill="none" stroke="#3E7A3A" stroke-width="2.2" stroke-linecap="round">' +
        '<path d="M50 12 Q30 12 24 30"/>' +
        '<path d="M50 12 Q70 12 76 30"/>' +
        '<g fill="#5FB85A" stroke="#2E6F2A" stroke-width="0.7">' +
          '<path d="M30 16 q-5 -1 -7 3 q5 1 7 -3 Z"/>' +
          '<path d="M26 22 q-5 0 -6 4 q5 0 6 -4 Z"/>' +
          '<path d="M24 28 q-5 1 -5 5 q5 -1 5 -5 Z"/>' +
          '<path d="M70 16 q5 -1 7 3 q-5 1 -7 -3 Z"/>' +
          '<path d="M74 22 q5 0 6 4 q-5 0 -6 -4 Z"/>' +
          '<path d="M76 28 q5 1 5 5 q-5 -1 -5 -5 Z"/>' +
        '</g>' +
        '<path d="M50 12 l-3 -5 l3 2 l3 -2 Z" fill="#E0B53A" stroke="#8A5A12" stroke-width="0.7"/>' +
      '</g>',
    // Cachos "El Gran Tahúr" — a winner's red gambler's band with a die badge.
    'hat-ca':
      '<g>' +
        '<path d="M20 31 Q50 24 80 31 L80 25 Q50 17 20 25 Z" fill="#9C2B2B" stroke="#5A1414" stroke-width="1.2"/>' +
        '<path d="M20 27 Q50 20 80 27" fill="none" stroke="#E0B53A" stroke-width="1.4"/>' +
        '<rect x="44" y="13" width="12" height="12" rx="2" fill="#FBF5E6" stroke="#5A1414" stroke-width="1.1"/>' +
        '<circle cx="47.5" cy="16.5" r="1.1" fill="#3A2A20"/>' +
        '<circle cx="52.5" cy="16.5" r="1.1" fill="#3A2A20"/>' +
        '<circle cx="50" cy="19" r="1.1" fill="#3A2A20"/>' +
        '<circle cx="47.5" cy="21.5" r="1.1" fill="#3A2A20"/>' +
        '<circle cx="52.5" cy="21.5" r="1.1" fill="#3A2A20"/>' +
      '</g>',
    // Xinjiang Fangqi "Khan of the Board" — an embroidered Uyghur doppa cap.
    'hat-xf':
      '<g>' +
        '<path d="M26 30 Q26 12 50 11 Q74 12 74 30 Q50 24 26 30 Z" fill="#1C3F6B" stroke="#0E2444" stroke-width="1.3"/>' +
        '<path d="M26 28 Q50 22 74 28" fill="none" stroke="#E8C98A" stroke-width="1.6"/>' +
        '<g fill="#E8C98A">' +
          '<path d="M38 22 l1.6 3.6 l-3.2 0 Z"/>' +
          '<path d="M50 19 l1.8 4 l-3.6 0 Z"/>' +
          '<path d="M62 22 l1.6 3.6 l-3.2 0 Z"/>' +
        '</g>' +
        '<path d="M44 16 L50 12 L56 16" fill="none" stroke="#E8C98A" stroke-width="1.2"/>' +
      '</g>',
    // Filipino Dama "Hari ng Dama" — a sun-rayed crown (Philippine sun).
    'hat-fd':
      '<g>' +
        '<g stroke="#C99A1E" stroke-width="0.8" fill="#F4C430">' +
          '<path d="M50 4 l2 8 l-4 0 Z"/>' +
          '<path d="M34 8 l5 7 l-3 2 Z"/>' +
          '<path d="M66 8 l-5 7 l3 2 Z"/>' +
          '<path d="M22 18 l8 3 l-2 3 Z"/>' +
          '<path d="M78 18 l-8 3 l2 3 Z"/>' +
        '</g>' +
        '<path d="M26 30 Q26 16 50 15 Q74 16 74 30 Q50 24 26 30 Z" fill="#0C4DA2" stroke="#072F63" stroke-width="1.2"/>' +
        '<circle cx="50" cy="22" r="4.4" fill="#F4C430" stroke="#C99A1E" stroke-width="1"/>' +
        '<circle cx="50" cy="22" r="1.6" fill="#0C4DA2"/>' +
      '</g>',
    // Cuarenta "Rey de la Baraja" — a Spanish king's golden crown with the rey 'R'.
    'hat-cu':
      '<g>' +
        '<path d="M26 31 L29 14 L38 24 L50 12 L62 24 L71 14 L74 31 Q50 24 26 31 Z" fill="#E0B53A" stroke="#8A5A12" stroke-width="1.4" stroke-linejoin="round"/>' +
        '<rect x="28" y="28" width="44" height="4" rx="1.5" fill="#C99A1E" stroke="#8A5A12" stroke-width="0.8"/>' +
        '<circle cx="29" cy="14" r="2.4" fill="#C0392B"/>' +
        '<circle cx="50" cy="12" r="2.8" fill="#2E6FB0"/>' +
        '<circle cx="71" cy="14" r="2.4" fill="#C0392B"/>' +
        '<text x="50" y="27" font-family="serif" font-size="6" font-weight="700" fill="#8A5A12" text-anchor="middle">R</text>' +
      '</g>',
    // Yut Nori "말 대장" — a Korean gat (horsehair hat) with a jewelled band.
    'hat-yn':
      '<g>' +
        '<ellipse cx="50" cy="30" rx="32" ry="6" fill="#2A2A2E" opacity="0.92" stroke="#000000" stroke-width="0.8"/>' +
        '<path d="M37 30 Q37 12 50 11 Q63 12 63 30 Z" fill="#3A3A40" stroke="#15151A" stroke-width="1.1"/>' +
        '<ellipse cx="50" cy="11.5" rx="6.5" ry="2.4" fill="#4A4A52"/>' +
        '<path d="M37 26 Q50 22 63 26" fill="none" stroke="#C0392B" stroke-width="1.6"/>' +
        '<circle cx="50" cy="25.5" r="1.8" fill="#E0B53A" stroke="#8A5A12" stroke-width="0.7"/>' +
      '</g>',
    // Yoté "Master of Yoté" — a Sahelian strategist's wrapped indigo head-tie.
    'hat-yo':
      '<g>' +
        '<path d="M22 31 Q22 13 50 12 Q78 13 78 31 Q50 24 22 31 Z" fill="#2A3F86" stroke="#15224F" stroke-width="1.2"/>' +
        '<path d="M24 28 Q40 18 56 22 Q70 25 76 30" fill="none" stroke="#5468C0" stroke-width="2"/>' +
        '<path d="M24 31 Q42 24 60 27 Q70 28 78 31" fill="none" stroke="#E8C98A" stroke-width="1.4"/>' +
        '<path d="M70 16 q10 -2 12 6 q-8 0 -12 -6 Z" fill="#2A3F86" stroke="#15224F" stroke-width="1"/>' +
      '</g>',
    // Senet "Justified Soul" — the pharaoh's striped nemes headdress with uraeus.
    'hat-se':
      '<g>' +
        '<path d="M24 31 Q22 14 50 12 Q78 14 76 31 L70 31 Q72 18 50 17 Q28 18 30 31 Z" fill="#2E6FB0" stroke="#16344F" stroke-width="1.1"/>' +
        '<path d="M30 31 Q28 20 50 19 Q72 20 70 31" fill="#E0B53A" stroke="#8A5A12" stroke-width="1"/>' +
        '<path d="M50 19 L50 31 M44 19.5 L44 31 M56 19.5 L56 31" stroke="#16344F" stroke-width="1.1"/>' +
        '<path d="M48 17 Q46 11 50 9 Q54 11 52 17 Z" fill="#C0392B" stroke="#7A1414" stroke-width="0.8"/>' +
        '<circle cx="50" cy="10" r="1.4" fill="#E0B53A"/>' +
      '</g>',
    // Truc "Campió de Penya" — a Catalan red barretina cap, flopped to the side.
    'hat-tu':
      '<g>' +
        '<path d="M26 31 Q28 20 44 18 Q70 14 84 6 Q80 18 64 24 Q50 29 26 31 Z" fill="#C0392B" stroke="#7A1414" stroke-width="1.3" stroke-linejoin="round"/>' +
        '<path d="M26 31 Q50 28 64 24" fill="none" stroke="#7A1414" stroke-width="1.4"/>' +
        '<rect x="26" y="28" width="34" height="4" rx="1.5" fill="#7A1414" transform="rotate(-4 43 30)"/>' +
        '<circle cx="84" cy="6" r="2.4" fill="#9C2B2B" stroke="#5A1414" stroke-width="0.8"/>' +
      '</g>'
  };

  /* ── Hair (drawn over the scalp/sides, above the face but below the features
     and the hat; crown region ~y 10-40, must not cover eyes at y46) ── */
  var HAIR = {
    'hair-none': '',
    // Short — a neat rounded cap with a soft fringe.
    'hair-short':
      '<path d="M20 40 Q17 15 50 14 Q83 15 80 40 Q78 28 70 29 Q62 24 50 25 Q38 24 30 29 Q22 28 20 40 Z" fill="#6E4523"/>',
    // Buzz — very short, hugging the scalp with a low hairline.
    'hair-buzz':
      '<path d="M22 38 Q20 20 50 19 Q80 20 78 38 Q76 30 68 30 Q60 27 50 27.5 Q40 27 32 30 Q24 30 22 38 Z" fill="#2A211C"/>' +
      '<path d="M28 30 Q50 24 72 30" fill="none" stroke="#4A3A30" stroke-width="1.2"/>',
    // Swoop — side-parted with an asymmetric fringe sweeping across.
    'hair-side':
      '<path d="M20 40 Q17 15 50 14 Q83 15 80 40 Q79 27 68 28 Q64 20 44 24 Q30 27 26 36 Q22 30 20 40 Z" fill="#7A4A2A"/>' +
      '<path d="M64 22 Q52 22 42 26" fill="none" stroke="#8A5632" stroke-width="1.4" stroke-linecap="round"/>',
    // Top Bun — sleek pulled-back hair with a bun and tie on top. Brown (not
    // near-black) + an outline so the bun reads against the dark background tile.
    'hair-bun':
      '<path d="M22 40 Q20 24 50 23 Q80 24 78 40 Q76 32 68 32 Q60 29 50 30 Q40 29 32 32 Q24 32 22 40 Z" fill="#6E4523"/>' +
      '<circle cx="50" cy="14" r="7.5" fill="#6E4523" stroke="#3F2916" stroke-width="1.5"/>' +
      '<path d="M43.5 20.5 Q50 17.5 56.5 20.5" fill="none" stroke="#3F2916" stroke-width="1.6" stroke-linecap="round"/>',
    // Curls — a voluminous curly afro of overlapping tufts.
    'hair-curly':
      '<g fill="#2A211C">' +
        '<circle cx="50" cy="19" r="10"/>' +
        '<circle cx="34" cy="23" r="9.5"/>' +
        '<circle cx="66" cy="23" r="9.5"/>' +
        '<circle cx="23" cy="33" r="7.5"/>' +
        '<circle cx="77" cy="33" r="7.5"/>' +
        '<circle cx="42" cy="16" r="7"/>' +
        '<circle cx="58" cy="16" r="7"/>' +
      '</g>' +
      '<g fill="#3E322A">' +
        '<circle cx="44" cy="20" r="2"/>' +
        '<circle cx="58" cy="21" r="2"/>' +
        '<circle cx="30" cy="28" r="2"/>' +
        '<circle cx="70" cy="28" r="2"/>' +
      '</g>',
    // Ponytail — pulled back with a fuller tail flowing down the right side.
    'hair-pony':
      '<path d="M71 29 Q93 33 91 55 Q89 68 77 64 Q88 52 77 39 Q72 33 71 29 Z" fill="#A8432E" stroke="#7E2E1E" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M22 40 Q20 21 50 20 Q80 21 78 40 Q76 31 68 31 Q60 27 50 28 Q40 27 32 31 Q24 31 22 40 Z" fill="#A8432E"/>' +
      '<circle cx="72" cy="31" r="3" fill="#7E2E1E"/>',
    // Long — a top cap plus two curtains framing the face down past the jaw.
    'hair-long':
      '<path d="M22 38 Q20 18 50 17 Q80 18 78 38 Q76 30 68 30 Q60 25 50 26 Q40 25 32 30 Q24 30 22 38 Z" fill="#C99A52"/>' +
      '<path d="M22 34 Q13 40 15 66 Q17 73 25 70 Q22 54 29 42 Q25 36 22 34 Z" fill="#C99A52"/>' +
      '<path d="M78 34 Q87 40 85 66 Q83 73 75 70 Q78 54 71 42 Q75 36 78 34 Z" fill="#C99A52"/>' +
      '<path d="M50 26 Q42 27 36 31" fill="none" stroke="#B0843F" stroke-width="1.2" stroke-linecap="round"/>'
  };

  /* ── Tile (icon backdrop) colour ──
     Warm walnut, so the face reads as a museum plaque icon rather than a cold
     charcoal chip. One source of truth for every place the old #2A2A2E tile hex
     appeared. Kept at #241609 (not lifted to #2B1A0C): against the darkest hair
     fill (#2A211C) the walnut scores WCAG 1.116 vs the old charcoal's 1.102 —
     a marginal improvement — whereas #2B1A0C would REGRESS it to 1.061, so the
     lift is not applied. Dark-hair-on-dark-tile is a pre-existing silhouette
     trait of the avatar art, not introduced here. */
  var TILE_COLOR = '#241609';

  /* ── render(cfg, size, tileColor) → SVG string ──
     tileColor overrides the backdrop tile (defaults to TILE_COLOR). */
  function render(cfg, size, tileColor) {
    cfg = clean(cfg);
    var px = (typeof size === 'number' && size > 0) ? size : 64;
    var tile = (typeof tileColor === 'string' && tileColor) ? tileColor : TILE_COLOR;

    var skinColor = SKIN_COLORS[cfg.skin] || SKIN_COLORS['skin-light'];
    var eyes = EYES[cfg.eyes] || '';
    var mouth = MOUTH[cfg.mouth] || '';
    var hair = HAIR[cfg.hair] || '';
    var accessory = ACCESSORY[cfg.accessory] || '';
    var hat = HAT[cfg.hat] || '';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px + '" role="img" aria-label="Avatar">' +
      // (1) solid background circle — a warm walnut "tile" so the face reads
      // as a proper museum-plaque icon (pass tileColor to override).
      '<circle cx="50" cy="50" r="50" fill="' + tile + '"/>' +
      // (2) face circle filled by skin colour
      '<circle cx="50" cy="52" r="34" fill="' + skinColor + '"/>' +
      // subtle ear nubs for a friendlier silhouette
      '<circle cx="18" cy="54" r="5" fill="' + skinColor + '"/>' +
      '<circle cx="82" cy="54" r="5" fill="' + skinColor + '"/>' +
      // (3) hair — sits over the scalp/sides, above the face but below the facial
      // features (so eyes/mouth are never covered) and below the hat.
      hair +
      // (4) eyes
      eyes +
      // (5) mouth
      mouth +
      // (6) accessory (glasses over eyes)
      accessory +
      // (7) hat on top (covers hair)
      hat +
    '</svg>';
  }

  /* ── renderInto(el, cfg, size, tileColor) — convenience DOM setter ── */
  function renderInto(el, cfg, size, tileColor) {
    if (!el) return;
    el.innerHTML = render(cfg, size, tileColor);
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
