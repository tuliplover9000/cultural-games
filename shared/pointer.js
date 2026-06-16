/**
 * shared/pointer.js — CGPointer.toCanvas()
 *
 * Maps a pointer/touch event to internal canvas coordinates, correctly
 * accounting for the force-landscape CSS rotation (html.cg-landscape, see
 * shared/force-landscape.js). Canvas games can't rely on the usual
 * rect-based math when the page is rotated, because getBoundingClientRect()
 * returns the rotated axis-aligned box and the screen X/Y axes are swapped.
 *
 * Usage (replaces the inline `var rect = canvas.getBoundingClientRect(); ...`):
 *   var p = CGPointer.toCanvas(canvas, e);   // {x, y} in canvas.width/height space
 *
 * When no rotation is active this is identical to the standard mapping, so it
 * is safe to use unconditionally.
 */
(function () {
  'use strict';

  // Rotation (degrees, clockwise) currently applied to the page content.
  // Kept in sync with the CSS in force-landscape.css. 0 when not rotated.
  function rotationDeg() {
    return document.documentElement.classList.contains('cg-landscape') ? 90 : 0;
  }

  // Pull clientX/clientY from a mouse, pointer, or touch event.
  function clientXY(e) {
    if (e && e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e && e.changedTouches && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Event|{clientX,clientY}} e
   * @returns {{x:number, y:number}} coordinates in canvas.width × canvas.height space
   */
  function toCanvas(canvas, e) {
    var p   = clientXY(e);   // normalises mouse / pointer / touch to {x, y}
    var cx  = p.x, cy = p.y;
    var rect = canvas.getBoundingClientRect();
    var deg  = rotationDeg();

    if (!deg) {
      // Standard, un-rotated path.
      var sx = canvas.width  / rect.width;
      var sy = canvas.height / rect.height;
      return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
    }

    // Rotated path. The bounding-rect centre is rotation-invariant (it is the
    // canvas centre on screen). offsetWidth/offsetHeight are LAYOUT dims, which
    // CSS transforms do not affect, so they give the un-rotated CSS size.
    var dw = canvas.offsetWidth  || rect.height; // un-rotated CSS width
    var dh = canvas.offsetHeight || rect.width;  // un-rotated CSS height
    var ccx = rect.left + rect.width  / 2;
    var ccy = rect.top  + rect.height / 2;

    // Inverse-rotate the pointer vector by -deg around the centre.
    var rad = -deg * Math.PI / 180;
    var vx  = cx - ccx, vy = cy - ccy;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var rx  = vx * cos - vy * sin;
    var ry  = vx * sin + vy * cos;

    // Back into un-rotated CSS space (relative to top-left), then to internal px.
    var cssX = rx + dw / 2;
    var cssY = ry + dh / 2;
    return { x: cssX * (canvas.width / dw), y: cssY * (canvas.height / dh) };
  }

  window.CGPointer = { toCanvas: toCanvas, rotationDeg: rotationDeg };
}());
