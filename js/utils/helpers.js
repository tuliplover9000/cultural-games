/**
 * helpers.js
 * Shared utility functions used across the site and game scripts.
 * Import or include this before any game-specific JS.
 */

(function (global) {
  'use strict';

  var Helpers = {};

  // ─── Random ────────────────────────────────────────────────────────────────

  /**
   * Return a random integer between min and max (inclusive).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  Helpers.randInt = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  /**
   * Shuffle an array in place using Fisher-Yates algorithm.
   * @param {Array} array
   * @returns {Array} the same array, shuffled
   */
  Helpers.shuffle = function (array) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = Helpers.randInt(0, i);
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  };

  /**
   * Pick a random item from an array.
   * @param {Array} array
   * @returns {*}
   */
  Helpers.sample = function (array) {
    return array[Helpers.randInt(0, array.length - 1)];
  };

  // ─── DOM ───────────────────────────────────────────────────────────────────

  /**
   * Shorthand for document.querySelector.
   * @param {string} selector
   * @param {Element} [context=document]
   * @returns {Element|null}
   */
  Helpers.qs = function (selector, context) {
    return (context || document).querySelector(selector);
  };

  /**
   * Shorthand for document.querySelectorAll (returns Array, not NodeList).
   * @param {string} selector
   * @param {Element} [context=document]
   * @returns {Element[]}
   */
  Helpers.qsa = function (selector, context) {
    return Array.from((context || document).querySelectorAll(selector));
  };

  /**
   * Add one or more class names to an element.
   * @param {Element} el
   * @param {...string} classes
   */
  Helpers.addClass = function (el) {
    var classes = Array.prototype.slice.call(arguments, 1);
    classes.forEach(function (c) { el.classList.add(c); });
  };

  /**
   * Remove one or more class names from an element.
   * @param {Element} el
   * @param {...string} classes
   */
  Helpers.removeClass = function (el) {
    var classes = Array.prototype.slice.call(arguments, 1);
    classes.forEach(function (c) { el.classList.remove(c); });
  };

  // ─── Number / Formatting ───────────────────────────────────────────────────

  /**
   * Clamp a number between min and max.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  Helpers.clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  /**
   * Format a number with a leading + sign if positive.
   * e.g. formatDelta(5) → "+5", formatDelta(-3) → "-3"
   * @param {number} n
   * @returns {string}
   */
  Helpers.formatDelta = function (n) {
    return (n >= 0 ? '+' : '') + n;
  };

  // ─── Timing ────────────────────────────────────────────────────────────────

  /**
   * Returns a Promise that resolves after `ms` milliseconds.
   * Usage: await Helpers.sleep(800);
   * @param {number} ms
   * @returns {Promise<void>}
   */
  Helpers.sleep = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  // ─── Storage ───────────────────────────────────────────────────────────────

  /**
   * Save a JSON-serializable value to localStorage.
   * @param {string} key
   * @param {*} value
   */
  Helpers.saveData = function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Helpers.saveData: could not write to localStorage.', e);
    }
  };

  /**
   * Load and JSON-parse a value from localStorage.
   * Returns defaultValue if the key does not exist or parsing fails.
   * @param {string} key
   * @param {*} [defaultValue=null]
   * @returns {*}
   */
  Helpers.loadData = function (key, defaultValue) {
    try {
      var raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : (defaultValue !== undefined ? defaultValue : null);
    } catch (e) {
      return defaultValue !== undefined ? defaultValue : null;
    }
  };

  // Expose globally
  global.Helpers = Helpers;

}(window));
