/**
 * sanitize.js — centralised input sanitization helpers
 *
 * Exposes: window.Sanitize
 *   .text(str)      — HTML-entity-escape any string before innerHTML injection
 *   .username(str)  — strip disallowed chars, enforce max length (display name / guest name)
 *   .roomName(str)  — strip disallowed chars, enforce max length (room name)
 *
 * No external dependencies. Pure vanilla JS. IIFE pattern.
 */
(function () {
  'use strict';

  /**
   * Escapes HTML special characters so a string is safe to inject via innerHTML.
   * Converts  & < > " '  to their HTML entity equivalents.
   */
  function sanitizeText(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  /**
   * Strips any character that is not alphanumeric, underscore, hyphen, or space.
   * Trims whitespace and enforces a 30-character maximum.
   * Used for player display names / usernames before they are stored or rendered.
   */
  function sanitizeUsername(str) {
    if (str == null) return '';
    return String(str)
      .replace(/[^A-Za-z0-9_\- ]/g, '')
      .trim()
      .slice(0, 30);
  }

  /**
   * Allows alphanumeric characters, spaces, hyphens, underscores, and common
   * punctuation  ! ? . , ( )  — enough for a descriptive room name.
   * Trims whitespace and enforces a 50-character maximum.
   */
  function sanitizeRoomName(str) {
    if (str == null) return '';
    return String(str)
      .replace(/[^A-Za-z0-9 \-_!?.,()]/g, '')
      .trim()
      .slice(0, 50);
  }

  window.Sanitize = {
    text:     sanitizeText,
    username: sanitizeUsername,
    roomName: sanitizeRoomName,
  };

}());
