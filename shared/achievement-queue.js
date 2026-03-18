/**
 * achievement-queue.js — Offline queue for achievements.
 * When not logged in, queues achievement IDs in localStorage.
 * On sign-in, the queue is flushed by achievements.js.
 *
 * Exposes: window.AchievementQueue
 */
(function () {
  'use strict';

  var KEY = 'cg-achievement-queue';

  function add(id) {
    if (!id) return;
    var list = get();
    if (list.indexOf(id) === -1) {
      list.push(id);
    }
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  function get() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  window.AchievementQueue = {
    KEY: KEY,
    add: add,
    get: get,
    clear: clear,
  };

}());
