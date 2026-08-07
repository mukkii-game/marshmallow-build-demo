// マシュマロビルド - ユーティリティ
window.MB = window.MB || {};

MB.util = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  easeOut(t) { return 1 - Math.pow(1 - t, 3); },
  easeIn(t) { return t * t * t; },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(MB.util.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  midiToFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); },

  // 角丸矩形パス
  rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  fmtScore(n) { return n.toLocaleString('ja-JP'); },

  save(data) {
    try { localStorage.setItem(MB.C.STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  },
  load() {
    try {
      const raw = localStorage.getItem(MB.C.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
};
