// Small polyfills for older Safari (the Mac app runs in the system WebKit; macOS 11 may have Safari 14 or 15).
// The draft AI (ai/trades.js) uses Array.prototype.at, which Safari has only from 15.4. Behaviour is the same.
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value(i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return i >= 0 && i < this.length ? this[i] : undefined; },
    writable: true, configurable: true,
  });
}
