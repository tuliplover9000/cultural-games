// Runs in <head> - applies room-mode class before HTML renders so site chrome
// (nav, footer, back link) never flashes when a game is inside a room iframe.
(function () {
  if (location.search.indexOf('roomId=') !== -1) {
    document.documentElement.classList.add('room-mode');
  }
}());
