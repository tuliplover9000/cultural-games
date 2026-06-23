/**
 * profile-titles.js - Wearable-title picker for the profile page.
 *
 * Every unlocked achievement that carries a `title` becomes a wearable title.
 * Reads from Achievements (getUnlocked, ACHIEVEMENTS) and Auth (getTitle,
 * setTitle, onAuthChange, isLoggedIn). Renders:
 *   - the hero badge (#prof-title) with the equipped title, tier-coloured;
 *   - a picker grid (#prof-titles-grid): a "None" chip + one chip per earned
 *     title; clicking equips via Auth.setTitle (optimistic re-render).
 *
 * XSS: equipped_title is a non-frozen DB column (a user can write arbitrary
 * text). Every title string rendered here goes through esc() first.
 */
(function () {
  'use strict';

  if (!window.Auth) return; // auth.js must load first

  var TIER_COLORS = {
    bronze: '#CD7F32',
    silver: '#A8A9AD',
    gold:   '#D4A017'
  };

  function $(id) { return document.getElementById(id); }

  // Titles are untrusted free text (non-frozen column) — escape every render.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Earned titles: unlocked achievements that carry a `title`, de-duped ── */
  function earnedTitles() {
    if (!window.Achievements || !Achievements.getUnlocked || !Achievements.ACHIEVEMENTS) return [];
    var unlocked = {};
    Achievements.getUnlocked().forEach(function (id) { unlocked[id] = true; });

    var seenTitle = {};
    var out = [];
    Achievements.ACHIEVEMENTS.forEach(function (a) {
      if (!a || !a.title) return;
      if (!unlocked[a.id]) return;
      if (seenTitle[a.title]) return;   // de-dupe identical title text
      seenTitle[a.title] = true;
      out.push({ id: a.id, title: a.title, tier: a.tier || 'bronze' });
    });
    return out;
  }

  function tierColor(tier) {
    return TIER_COLORS[tier] || TIER_COLORS.bronze;
  }

  /* ── Hero badge ── */
  function renderHero(earned) {
    var hero = $('prof-title');
    if (!hero) return;
    var current = (window.Auth && Auth.getTitle && Auth.getTitle()) || null;
    if (!current) {
      hero.hidden = true;
      hero.textContent = '';
      return;
    }
    // Tier-colour the badge when the equipped title resolves to an earned one.
    var match = null;
    for (var i = 0; i < earned.length; i++) {
      if (earned[i].title === current) { match = earned[i]; break; }
    }
    hero.hidden = false;
    hero.innerHTML = esc(current);
    hero.style.color = match ? tierColor(match.tier) : '';
  }

  /* ── Picker grid ── */
  function renderGrid(earned) {
    var grid = $('prof-titles-grid');
    var readout = $('prof-titles-current');
    if (!grid) return;

    var current = (window.Auth && Auth.getTitle && Auth.getTitle()) || null;

    if (readout) {
      readout.innerHTML = current
        ? 'Wearing: <strong>' + esc(current) + '</strong>'
        : 'No title equipped.';
    }

    if (!earned.length) {
      grid.innerHTML = '<p class="prof-titles-empty">Unlock achievements to earn titles.</p>';
      return;
    }

    // "None" chip + one chip per earned title.
    var chips = [];
    chips.push(
      '<button class="prof-title-chip prof-title-chip--none' + (!current ? ' prof-title-chip--active' : '') +
      '" role="listitem" data-title="" type="button"' + (!current ? ' aria-pressed="true"' : '') + '>None</button>'
    );
    earned.forEach(function (t) {
      var active = current === t.title;
      chips.push(
        '<button class="prof-title-chip prof-title-chip--' + esc(t.tier) + (active ? ' prof-title-chip--active' : '') +
        '" role="listitem" data-title="' + esc(t.title) + '" type="button"' +
        ' style="--chip-tier:' + tierColor(t.tier) + '"' +
        (active ? ' aria-pressed="true"' : '') + '>' +
        esc(t.title) + '</button>'
      );
    });
    grid.innerHTML = chips.join('');

    grid.querySelectorAll('.prof-title-chip').forEach(function (btn) {
      btn.addEventListener('click', function () { onChipClick(btn.getAttribute('data-title')); });
    });
  }

  /* ── Equip (optimistic) ── */
  function onChipClick(title) {
    var next = title || null;            // "" → None → null
    if (window.Auth && Auth.setTitle) {
      Auth.setTitle(next).then(function (res) {
        // setTitle already updated local state + emitted; onAuthChange re-renders.
        // On failure just re-render from the authoritative local state.
        if (res && !res.ok) render();
      });
    }
    render();                            // optimistic immediate re-render
  }

  /* ── Main render / mount ── */
  function render() {
    var section = $('prof-titles-section');
    var loggedIn = window.Auth && Auth.isLoggedIn && Auth.isLoggedIn();
    if (!loggedIn) {
      if (section) section.hidden = true;
      var hero = $('prof-title');
      if (hero) { hero.hidden = true; hero.textContent = ''; }
      return;
    }
    if (section) section.hidden = false;
    var earned = earnedTitles();
    renderHero(earned);
    renderGrid(earned);
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
    if (window.Auth && Auth.onAuthChange) Auth.onAuthChange(function () { render(); });
  });

}());
