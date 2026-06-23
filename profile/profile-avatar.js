/**
 * profile-avatar.js - Avatar customizer / shop controller for the profile page.
 *
 * Reads from Auth (getAvatar, getOwnedItems, getCoins, buyAvatarItem, setAvatar)
 * and Avatar (CATALOG, SLOTS, clean, defaultConfig, render). Renders the live
 * preview, the hero avatar (#prof-initial), category tabs, and the item grid.
 *
 * Equip = update working config + Auth.setAvatar(cfg). Buy = Auth.buyAvatarItem(id)
 * then equip. The server (RPCs) is authoritative; this is the optimistic UI.
 * Every id rendered to markup goes through Avatar.clean / the known CATALOG, so
 * nothing unvalidated reaches the DOM.
 */
(function () {
  'use strict';

  if (!window.Avatar) return; // avatar.js must load first

  var SLOT_LABELS = {
    skin:      'Skin',
    eyes:      'Eyes',
    mouth:     'Mouth',
    hat:       'Hat',
    accessory: 'Accessory'
  };

  /* ── state ── */
  var _cfg        = null;   // working config (always cleaned)
  var _activeSlot = 'skin';

  /* ── el refs ── */
  function $(id) { return document.getElementById(id); }

  function ownedSet() {
    var owned = (window.Auth && Auth.getOwnedItems) ? Auth.getOwnedItems() : [];
    var set = {};
    owned.forEach(function (id) { set[id] = true; });
    return set;
  }

  function coins() {
    return (window.Auth && Auth.getCoins) ? Auth.getCoins() : 0;
  }

  /* ── build the working config from the equipped avatar (or a default) ── */
  function buildCfg() {
    var user = window.Auth && Auth.getUser && Auth.getUser();
    var seed = (user && user.username) || 'guest';
    var base = (window.Auth && Auth.getAvatar && Auth.getAvatar()) || Avatar.defaultConfig(seed);
    return Avatar.clean(base);
  }

  /* ── renderers ── */
  function renderPreview() {
    var preview = $('avatar-preview');
    if (preview) Avatar.renderInto(preview, _cfg, 132);
    // Mirror into the hero avatar (repurposed #prof-initial).
    var hero = $('prof-initial');
    if (hero) Avatar.renderInto(hero, _cfg, 84);
    var bal = $('avatar-coin-balance');
    if (bal) bal.textContent = coins().toLocaleString();
  }

  function renderTabs() {
    var tabs = $('avatar-tabs');
    if (!tabs) return;
    tabs.innerHTML = Avatar.SLOTS.map(function (slot) {
      var active = slot === _activeSlot;
      return '<button class="avatar-tab' + (active ? ' avatar-tab--active' : '') +
        '" role="tab" aria-selected="' + (active ? 'true' : 'false') +
        '" data-slot="' + slot + '" type="button">' + SLOT_LABELS[slot] + '</button>';
    }).join('');
    tabs.querySelectorAll('.avatar-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _activeSlot = btn.dataset.slot;
        renderTabs();
        renderItems();
      });
    });
  }

  function renderItems() {
    var grid = $('avatar-items');
    if (!grid) return;
    var slot   = _activeSlot;
    var items  = Avatar.CATALOG[slot] || [];
    var owned  = ownedSet();
    var bal    = coins();
    var current = _cfg[slot];

    grid.innerHTML = items.map(function (item) {
      // Build a mini preview that swaps only this slot so the player sees the
      // change in context. ids come straight from CATALOG so they're safe.
      var previewCfg = Avatar.clean(Object.assign({}, _cfg, defObj(slot, item.id)));
      var isFree     = item.price === 0;
      var isOwned    = isFree || owned[item.id];
      var isEquipped = current === item.id;
      var canAfford  = bal >= item.price;

      // Achievement-gated exclusive items (e.g. the Tiến Lên accessories). These
      // are price 0 but NOT freely available — they require an unlocked
      // achievement. When not yet earned they render locked and non-equippable.
      var isUnlockItem = !!item.unlock;
      var earned       = unlockEarned(item);
      var achLocked    = isUnlockItem && !earned;

      var stateClass = achLocked   ? ' avatar-item--achievement-locked'
                     : isEquipped  ? ' avatar-item--equipped'
                     : isOwned     ? ' avatar-item--owned'
                     : ' avatar-item--locked';

      // Skin is a colour picker: show a solid swatch box (not a mini face), and
      // since every colour is free, skip the noisy "Owned" tag.
      var isSkin = slot === 'skin';

      var badge;
      if (achLocked) {
        // Not equippable yet — show how to earn it (achievement title escaped).
        badge = '<span class="avatar-item__badge avatar-item__badge--achievement">&#128274; Earn: ' + escLabel(unlockTitle(item.unlock)) + '</span>';
      } else if (isUnlockItem) {
        // Earned exclusive — equippable. Distinguish from bought items.
        badge = isEquipped
          ? '<span class="avatar-item__badge avatar-item__badge--equipped">Equipped</span>'
          : '<span class="avatar-item__badge avatar-item__badge--earned">Earned</span>';
      } else if (isEquipped) {
        badge = '<span class="avatar-item__badge avatar-item__badge--equipped">Equipped</span>';
      } else if (isSkin) {
        badge = '';
      } else if (isOwned) {
        badge = '<span class="avatar-item__badge avatar-item__badge--owned">Owned</span>';
      } else if (canAfford) {
        badge = '<span class="avatar-item__price">&#128176; ' + item.price + '</span>';
      } else {
        badge = '<span class="avatar-item__price avatar-item__price--short">Need ' + item.price + '</span>';
      }

      // colorOf() returns a hex straight from the trusted CATALOG (never user input).
      var art = isSkin
        ? '<span class="avatar-item__swatch" style="background:' + (Avatar.colorOf(item.id) || '#cccccc') + '"></span>'
        : Avatar.render(previewCfg, 56);

      return '<button class="avatar-item' + stateClass + (isSkin ? ' avatar-item--swatch' : '') +
        '" role="listitem" data-id="' + item.id + '" type="button"' +
        (achLocked ? ' aria-disabled="true"' : '') +
        (isEquipped ? ' aria-pressed="true"' : '') +
        '>' +
          '<span class="avatar-item__art">' + art + '</span>' +
          '<span class="avatar-item__label">' + escLabel(item.label) + '</span>' +
          badge +
        '</button>';
    }).join('');

    grid.querySelectorAll('.avatar-item').forEach(function (btn) {
      btn.addEventListener('click', function () { onItemClick(btn.dataset.id); });
    });
  }

  // tiny helper to make a one-key object literal in ES5
  function defObj(k, v) { var o = {}; o[k] = v; return o; }

  // Has the player earned the achievement that gates this item? (Items without
  // an `unlock` field are always available.)
  function unlockEarned(item) {
    if (!item || !item.unlock) return true;
    return !!(window.Achievements && Achievements.getUnlocked &&
              Achievements.getUnlocked().indexOf(item.unlock) !== -1);
  }

  // The human title of the achievement that grants an `unlock` item, for the
  // "Earn: <title>" badge. Comes from the trusted ACHIEVEMENTS array.
  function unlockTitle(unlockId) {
    var list = (window.Achievements && Achievements.ACHIEVEMENTS) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === unlockId) return list[i].title || unlockId;
    }
    return unlockId;
  }

  // The labels come from CATALOG (trusted), but escape defensively anyway.
  function escLabel(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── interactions ── */
  function equip(id) {
    var slot = _activeSlot;
    _cfg = Avatar.clean(Object.assign({}, _cfg, defObj(slot, id)));
    renderPreview();
    renderItems();
    if (window.Auth && Auth.setAvatar) {
      Auth.setAvatar(_cfg).then(function (res) {
        if (res && !res.ok) {
          // Server rejected — rebuild from the authoritative state.
          _cfg = buildCfg();
          renderPreview();
          renderItems();
        }
      });
    }
  }

  function onItemClick(id) {
    var item = findItem(id);
    if (!item) return;

    // Achievement-gated item the player hasn't earned → not equippable; ignore.
    if (item.unlock && !unlockEarned(item)) return;

    var owned = ownedSet();
    var isOwnedOrFree = item.price === 0 || owned[id];

    if (isOwnedOrFree) {
      equip(id);
      return;
    }

    // Locked → confirm purchase.
    var bal = coins();
    if (bal < item.price) return; // button shows "Need X"; ignore click
    if (!window.confirm('Buy "' + item.label + '" for ' + item.price + ' coins?')) return;

    if (!(window.Auth && Auth.buyAvatarItem)) return;
    Auth.buyAvatarItem(id).then(function (res) {
      if (res && res.ok) {
        equip(id);
      } else {
        renderPreview();
        renderItems();
      }
    });
  }

  function findItem(id) {
    var items = Avatar.CATALOG[_activeSlot] || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /* ── main render / mount ── */
  function render() {
    var section = $('prof-avatar-section');
    var loggedIn = window.Auth && Auth.isLoggedIn && Auth.isLoggedIn();
    if (!loggedIn) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    _cfg = buildCfg();
    renderTabs();
    renderItems();
    renderPreview();
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
    if (window.Auth && Auth.onAuthChange) Auth.onAuthChange(function () { render(); });
  });

}());
