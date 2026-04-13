/**
 * rate-limit.js — client-side sliding-window rate limiter
 *
 * Exposes: window.RateLimit
 *   .check(key, maxCalls, windowMs) — returns true if action is allowed,
 *                                     false if the limit is exceeded
 *   .reset(key)                     — clears a key manually
 *
 * Uses an in-memory map keyed by action name. Each entry holds an array of
 * timestamps; stale timestamps (older than windowMs) are pruned on every check.
 * No external dependencies. Pure vanilla JS. IIFE pattern.
 */
(function () {
  'use strict';

  /* map of key → [timestamp, timestamp, …] */
  var _buckets = {};

  /**
   * Check whether the action identified by `key` is within the allowed rate.
   * Prunes expired timestamps before deciding.
   *
   * @param  {string} key       — unique action identifier, e.g. 'room-create'
   * @param  {number} maxCalls  — maximum number of calls allowed inside windowMs
   * @param  {number} windowMs  — rolling window length in milliseconds
   * @returns {boolean}  true = action is allowed; false = limit exceeded
   */
  function check(key, maxCalls, windowMs) {
    var now  = Date.now();
    var cutoff = now - windowMs;

    if (!_buckets[key]) _buckets[key] = [];

    /* prune timestamps outside the window */
    _buckets[key] = _buckets[key].filter(function (ts) { return ts > cutoff; });

    if (_buckets[key].length >= maxCalls) return false;

    _buckets[key].push(now);
    return true;
  }

  /**
   * Manually clear the bucket for a given key (e.g. after a successful action
   * that should reset the counter, or during testing).
   *
   * @param {string} key
   */
  function reset(key) {
    delete _buckets[key];
  }

  window.RateLimit = { check: check, reset: reset };

}());
