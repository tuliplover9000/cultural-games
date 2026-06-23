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

      var stateClass = isEquipped ? ' avatar-item--equipped'
                     : isOwned    ? ' avatar-item--owned'
                     : ' avatar-item--locked';

      var badge;
      if (isEquipped) {
        badge = '<span class="avatar-item__badge avatar-item__badge--equipped">Equipped</span>';
      } else if (isOwned) {
        badge = '<span class="avatar-item__badge avatar-item__badge--owned">Owned</span>';
      } else if (canAfford) {
        badge = '<span class="avatar-item__price">&#128176; ' + item.price + '</span>';
      } else {
        badge = '<span class="avatar-item__price avatar-item__price--short">Need ' + item.price + '</span>';
      }

      return '<button class="avatar-item' + stateClass +
        '" role="listitem" data-id="' + item.id + '" type="button"' +
        (isEquipped ? ' aria-pressed="true"' : '') +
        '>' +
          '<span class="avatar-item__art">' + Avatar.render(previewCfg, 56) + '</span>' +
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
