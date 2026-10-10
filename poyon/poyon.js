// マシュとマロ「ぎゅっとリズム」
// ぽん=落とす / ぎゅっ=抱きしめて同じ大きさを合体（合体はぎゅっの瞬間だけ）
(function () {
  'use strict';
  const U = MB.util;

  // ---------- 定数 ----------
  const W = 10, H = 12;                 // 瓶の内寸（ワールド単位）
  const RAD = [0, 0.6, 0.79, 1.04, 1.37, 1.8, 2.36, 3.05];
  const MAXL = 7;
  const LV = [null,
    { name: 'ちび', fill: '#fffaf2', shade: '#e6d6c4', pts: 0 },
    { name: 'ふつう', fill: '#fbeedb', shade: '#dcc2a0', pts: 10 },
    { name: 'いちご', fill: '#ffd3e3', shade: '#e8a2bf', pts: 30 },
    { name: 'はちみつ', fill: '#ffdc86', shade: '#d9a24a', pts: 80 },
    { name: 'ココア', fill: '#c99a72', shade: '#94643f', pts: 200 },
    { name: 'ジャンボ', fill: '#e8f4ff', shade: '#a9c4dc', pts: 400 },
    { name: 'キング', fill: '#fffdf7', shade: '#e3cfb6', pts: 900 },
  ];
  const DROP_W = [0, 0.42, 0.33, 0.2, 0.05];
  const KINGS_FOR_DAWN = 4;
  const POWER_MAX = 4;        // ぎゅっ の ちから（2拍ごとに1回復）
  const NIGHT = [
    { time: '19:00', top: '#4a3b78', bot: '#ff9a5c' },
    { time: '22:00', top: '#16204a', bot: '#3d4f96' },
    { time: '25:00', top: '#0a0a24', bot: '#3a1f66' },
    { time: '27:00', top: '#1b1234', bot: '#1d4a48' },
    { time: 'よあけ', top: '#7fa8d9', bot: '#ffd9b0' },
  ];
  const STEP = 1 / 240;
  const STICK = 1.25;          // すき間がこの比率までなら ぎゅっ で引き寄せて合体

  // ---------- 状態 ----------
  const G = {
    state: 'title', bodies: [], ghosts: [], parts: [], texts: [],
    aimX: W / 2, cur: 1, next: 2, score: 0, kings: 0, chain: 0, best: 0,
    lastSqSlot: -99, lastSqMerged: false, sqT: 9, queue: [], lastSlot: -1,
    lane: [], danger: 0, beatIdx: -1, shake: 0, pred: { steps: 0, pairs: [] },
    flying: null, idSeq: 1, acc: 0, stateT: 0, clearShown: false, kingQueue: [],
    keys: {}, uiButtons: [], touch: false, sayT: 6, power: POWER_MAX, barIdx: -1, ponThisBar: true,
  };
  const save = U.load() || {};
  G.best = save.poyonBest || 0;

  // ---------- 時間（曲） ----------
  let localStart = performance.now() / 1000;
  function bpm() { return MB.music.bpm || 110; }
  function musicTime() {
    const m = MB.music;
    if (m.mode === 'theme' && m.themeAudio) return m.themeAudio.currentTime - MB.THEME_SYNC.offset;
    if (m.mode === 'gen') return m.now() - m.loopStartTime;
    return performance.now() / 1000 - localStart;
  }
  const eighth = () => 30 / bpm();

  // ---------- 物理 ----------
  function makeBody(level, x, y) {
    return { id: G.idSeq++, level, x, y, px: x, py: y, r: RAD[level], rT: RAD[level],
             ang: U.rand(-0.3, 0.3), wob: 0, wobV: 0, age: 0, pop: 0, landed: false };
  }
  function sqAmt() {
    const t = G.sqT;
    if (t < 0.05) return t / 0.05;
    if (t < 0.12) return 1;
    if (t < 0.3) return 1 - (t - 0.12) / 0.18;
    return 0;
  }
  function inset() { return sqAmt() * 0.32; }

  function physStep(dt) {
    const a = sqAmt();
    const grav = 34 * (1 + a * 3.5);
    const comp = a * 0.14;
    const ins = inset();
    const B = G.bodies;
    for (const b of B) {
      const vx = (b.x - b.px) * 0.996, vy = (b.y - b.py) * 0.996;
      b.px = b.x; b.py = b.y;
      b.x += vx; b.y += vy + grav * dt * dt;
      b.ang += vx / b.r * 0.8;
      b.r += (b.rT - b.r) * Math.min(1, dt * 22);
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < B.length; i++) {
        const p = B[i];
        for (let j = i + 1; j < B.length; j++) {
          const q = B[j];
          const R = (p.r + q.r) * (1 - comp);
          const dx = q.x - p.x, dy = q.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), ov = (R - d) * 0.75;
          const nx = dx / d, ny = dy / d;
          const mp = p.r * p.r, mq = q.r * q.r, wp = mq / (mp + mq);
          p.x -= nx * ov * wp; p.y -= ny * ov * wp;
          q.x += nx * ov * (1 - wp); q.y += ny * ov * (1 - wp);
          if (ov > 0.02 && !q.landed && q.age > 0.15) landHit(q, ov);
          if (ov > 0.02 && !p.landed && p.age > 0.15) landHit(p, ov);
        }
      }
      for (const b of B) {
        if (b.x < b.r + ins) b.x = b.r + ins;
        if (b.x > W - b.r - ins) b.x = W - b.r - ins;
        if (b.y > H - b.r) {
          b.y = H - b.r;
          b.px += (b.x - b.px) * 0.12; // 床の摩擦
          if (!b.landed) landHit(b, 0.1);
        }
      }
    }
    for (const b of B) {
      // 速度の上限（ぎゅっ解放の跳ねすぎ防止）
      const vx = b.x - b.px, vy = b.y - b.py, v = Math.hypot(vx, vy), mx = 0.09;
      if (v > mx) { b.px = b.x - vx / v * mx; b.py = b.y - vy / v * mx; }
      b.age += dt;
    }
  }
  function landHit(b, ov) {
    b.landed = true;
    b.wobV += 7 + ov * 20;
    snd.plop(b.level);
  }

  // ---------- 合体 ----------
  function findPairs(list, tol) {
    const pairs = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.level >= MAXL || p.eating) continue;
      for (let j = i + 1; j < list.length; j++) {
        const q = list[j];
        if (q.level !== p.level || q.eating) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < (p.r + q.r) * tol) pairs.push([p, q, d]);
      }
    }
    pairs.sort((a, b) => a[2] - b[2]);
    const used = new Set(), out = [];
    for (const pr of pairs) {
      if (used.has(pr[0]) || used.has(pr[1])) continue;
      used.add(pr[0]); used.add(pr[1]);
      out.push(pr);
    }
    return out;
  }

  // 合体した子が生まれる位置: 次の大きさの仲間がいればそっち側のメンバーの位置へ寄る
  function mergePos(p, q, list) {
    const wp = p.r * p.r, wq = q.r * q.r;
    let x = (p.x * wp + q.x * wq) / (wp + wq), y = (p.y * wp + q.y * wq) / (wp + wq);
    let best = null, bd = Infinity;
    for (const o of list) {
      if (o === p || o === q || o.level !== p.level + 1) continue;
      const d = Math.min(Math.hypot(o.x - p.x, o.y - p.y), Math.hypot(o.x - q.x, o.y - q.y));
      if (d < bd) { bd = d; best = o; }
    }
    if (best && bd < (RAD[p.level] + RAD[p.level + 1]) * 1.6) {
      const near = Math.hypot(best.x - p.x, best.y - p.y) < Math.hypot(best.x - q.x, best.y - q.y) ? p : q;
      x = U.lerp(x, near.x, 0.85); y = U.lerp(y, near.y, 0.85);
    }
    return { x, y };
  }

  // ぎゅっ したら何連鎖になるか（静止位置での見込み）
  function predict() {
    let snap = G.bodies.filter((b) => b.age > 0.3).map((b) => ({ x: b.x, y: b.y, r: b.r, level: b.level, id: b.id }));
    const first = findPairs(snap, STICK).map((p) => [p[0].id, p[1].id]);
    let steps = 0;
    for (let s = 0; s < 6; s++) {
      const ps = findPairs(snap, s === 0 ? STICK : STICK + 0.04);
      if (!ps.length) break;
      steps++;
      const rm = new Set();
      const add = [];
      for (const [p, q] of ps) {
        rm.add(p); rm.add(q);
        const mp = mergePos(p, q, snap);
        add.push({ x: mp.x, y: mp.y, r: RAD[p.level + 1], level: p.level + 1 });
      }
      snap = snap.filter((b) => !rm.has(b)).concat(add.filter((b) => b.level < MAXL));
    }
    G.pred = { steps, pairs: first };
  }

  function doSqueeze(slot) {
    if (G.power <= 0) {
      popText(W / 2, 1.5, 'ちから が たりない…', '#ffffffcc', 0.75);
      maro.tired = 0.8;
      G.chain = 0; G.lastSqMerged = false;
      return;
    }
    G.power--;
    G.sqT = 0;
    snd.squeeze();
    const pairs = findPairs(G.bodies, STICK);
    const cont = G.lastSqMerged && slot - G.lastSqSlot <= 2;
    if (!pairs.length) {
      G.chain = 0;
      G.lastSqMerged = false;
      G.lastSqSlot = slot;
      popText(W / 2, 1.5, 'ぎゅ…', '#ffffffaa', 0.7);
      return;
    }
    const quick = slot - G.lastSqSlot === 1;
    G.chain = cont ? G.chain + 1 : 1;
    G.lastSqMerged = true;
    G.lastSqSlot = slot;
    let gained = 0, cx = 0, cy = 0;
    for (const [p, q] of pairs) {
      const mp = mergePos(p, q, G.bodies);
      const nx = mp.x, ny = mp.y;
      const nb = makeBody(p.level + 1, nx, ny);
      nb.r = Math.max(p.r, q.r);
      nb.py = ny + 0.04; // ちょっと上へぽよん
      nb.landed = true; nb.age = 0.4;
      nb.pop = 1; nb.wobV = -10;
      G.bodies = G.bodies.filter((b) => b !== p && b !== q);
      G.bodies.push(nb);
      G.ghosts.push({ a: p, b: q, x: nx, y: ny, t: 0 });
      gained += LV[nb.level].pts || 5;
      cx += nx; cy += ny;
      sparkle(nx, ny, LV[nb.level].fill, 8);
      if (nb.level === MAXL) G.kingQueue.push({ body: nb, t: 0.5 });
    }
    cx /= pairs.length; cy /= pairs.length;
    const pts = gained * G.chain * (pairs.length > 1 ? pairs.length : 1);
    G.score += pts;
    snd.merge(Math.max(...pairs.map((p) => p[0].level)), G.chain);
    G.shake = Math.min(0.5, 0.08 + G.chain * 0.05);
    popText(cx, cy - 0.8, `+${pts}`, '#fff', 0.8);
    if (G.chain >= 2) {
      const label = quick && G.chain >= 3 ? `タタタン！ ×${G.chain}` : `${G.chain} れんさ！`;
      G.texts = G.texts.filter((t) => !t.chainLabel);
      popText(cx, cy - 1.9, label, '#ffe28a', 1.2 + G.chain * 0.1);
      G.texts[G.texts.length - 1].chainLabel = true;
    }
    if (G.chain === 2) maro.say('ひらめいたー！！');
    else if (G.chain >= 3) maro.say('マッハの スピードだー！！', true);
  }

  function doDrop() {
    const r = RAD[G.cur];
    const x = U.clamp(G.aimX, r + 0.05, W - r - 0.05);
    const b = makeBody(G.cur, x, -r - 0.15);
    b.wobV = 4;
    G.bodies.push(b);
    G.cur = G.next;
    G.next = rollLevel();
    G.ponThisBar = true;
    snd.drop();
  }
  function rollLevel() {
    let r = Math.random();
    for (let l = 1; l < DROP_W.length; l++) { r -= DROP_W[l]; if (r <= 0) return l; }
    return 1;
  }

  // ---------- 入力の格子吸い付け ----------
  function press(action) {
    if (G.state !== 'play') return;
    if (G.queue.length >= 2) return;
    const t = musicTime(), e = eighth();
    let slot = Math.round(t / e);
    if (slot * e < t - 0.09) slot += 1;
    if (slot <= G.lastSlot) slot = G.lastSlot + 1;
    const qmax = G.queue.length ? G.queue[G.queue.length - 1].slot : -1;
    if (slot <= qmax) slot = qmax + 1;
    G.queue.push({ action, slot });
    G.lastSlot = slot;
  }
  function runQueue(t) {
    const e = eighth();
    while (G.queue.length && G.queue[0].slot * e <= t + 0.004) {
      const q = G.queue.shift();
      if (q.action === 'pon') doDrop();
      else doSqueeze(q.slot);
      G.lane.push({ action: q.action, slot: q.slot, chain: q.action === 'gyu' ? G.chain : 0 });
      if (G.lane.length > 40) G.lane.shift();
    }
  }

  // ---------- キングを食べる ----------
  function updateKings(dt) {
    for (const k of G.kingQueue) k.t -= dt;
    const ready = G.kingQueue.filter((k) => k.t <= 0);
    G.kingQueue = G.kingQueue.filter((k) => k.t > 0);
    for (const k of ready) {
      const b = k.body;
      if (!G.bodies.includes(b)) continue;
      G.bodies = G.bodies.filter((x) => x !== b);
      G.flying = { level: MAXL, from: worldToScreen(b.x, b.y), t: 0, dur: 0.9, ang: b.ang };
      maro.mouthOpen = 1;
      maro.say('キングだー！ いただきまーす！', true);
      snd.king();
    }
    if (G.flying) {
      G.flying.t += dt;
      if (G.flying.t >= G.flying.dur) {
        G.flying = null;
        maro.cheek = 1.6; maro.munch = 1.4; maro.mouthOpen = 0;
        G.kings++;
        G.score += 1000 * G.kings;
        snd.gulpBig();
        if (G.kings === KINGS_FOR_DAWN && !G.clearShown) {
          G.clearShown = true;
          G.dawnT = 0;
          snd.fanfare();
          setTimeout(() => maro.say('よあけだー！ おしごと かんりょう！', true), 900);
        } else {
          setTimeout(() => maro.say(U.pick(['うまー！', 'しあわせ…', 'ちからが みなぎる！'])), 700);
        }
      }
    }
  }

  // ---------- 効果 ----------
  function sparkle(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, Math.PI * 2), s = U.rand(2, 6);
      G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: U.rand(0.4, 0.8), t: 0,
                     col, size: U.rand(0.08, 0.18), star: Math.random() < 0.5 });
    }
  }
  function popText(x, y, str, col, size) { G.texts.push({ x, y, str, col, size, t: 0, life: 1.0 }); }

  // ---------- 音 ----------
  const snd = (() => {
    const ac = () => MB.audio.ctx;
    function tone(type, f, f2, t0, dur, gain, attack) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (t0 || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + (attack || 0.006));
      g.gain.setTargetAtTime(0, t + (attack || 0.006), dur / 2.5);
      o.connect(g).connect(MB.audio.sfxBus);
      o.start(t); o.stop(t + dur + 0.2);
    }
    function noise(t0, dur, gain, f, f2, q, type) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (t0 || 0);
      const len = Math.floor(c.sampleRate * (dur + 0.05));
      const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = buf;
      const fl = c.createBiquadFilter(); fl.type = type || 'bandpass'; fl.Q.value = q || 2;
      fl.frequency.setValueAtTime(f, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0, t + dur * 0.6, dur / 4);
      s.connect(fl).connect(g).connect(MB.audio.sfxBus);
      s.start(t); s.stop(t + dur + 0.1);
    }
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
    const nf = (semi) => 523.25 * Math.pow(2, semi / 12);
    let plopGate = 0;
    return {
      drop() { tone('sine', 880, 520, 0, 0.08, 0.06); },
      plop(level) {
        const now = performance.now();
        if (now - plopGate < 45) return; plopGate = now;
        const f = 330 - level * 32;
        tone('sine', f, f * 0.55, 0, 0.16, 0.12, 0.008);
        tone('sine', f * 0.62, f * 0.75, 0.05, 0.12, 0.05);
      },
      squeeze() {
        // ゴムがきしむ「ぎゅっ」
        noise(0, 0.16, 0.12, 900, 2400, 6);
        tone('sawtooth', 190, 260, 0, 0.12, 0.035, 0.01);
        tone('sine', 120, 70, 0.02, 0.15, 0.12);
      },
      merge(level, chain) {
        const base = PENTA[Math.min(PENTA.length - 1, level + chain * 2)];
        tone('sine', nf(base) * 1.2, nf(base) * 0.85, 0, 0.12, 0.15);
        tone('triangle', nf(base + 12), null, 0.04, 0.3, 0.07);
        tone('sine', nf(base + 7), null, 0.08, 0.35, 0.05);
        if (chain >= 2) noise(0.02, 0.3, 0.04, 6000, null, 0.6, 'highpass');
      },
      king() {
        [0, 4, 7, 12].forEach((s, i) => tone('triangle', nf(s), null, i * 0.07, 0.4, 0.1));
      },
      gulpBig() {
        tone('sine', 280, 90, 0, 0.2, 0.16, 0.01);
        tone('sine', 180, 240, 0.22, 0.1, 0.07);
        [12, 16, 19, 24].forEach((s, i) => tone('sine', nf(s), null, 0.3 + i * 0.06, 0.5, 0.08));
      },
      fanfare() {
        [0, 4, 7, 12, 9, 12, 16].forEach((s, i) => tone('triangle', nf(s), null, i * 0.11, 0.6, 0.12));
        tone('sine', nf(19), null, 0.8, 1.4, 0.1);
      },
      tick() { tone('square', 1320, null, 0, 0.05, 0.03); },
    };
  })();

  // ---------- マロくん ----------
  const maro = {
    cheek: 0, munch: 0, mouthOpen: 0, blink: 0, blinkNext: 2, speech: null, bob: 0, happy: 0,
    say(text, big) { this.speech = { text, big: !!big, t: 0, life: big ? 2.3 : 1.8 }; },
    update(dt) {
      this.cheek = Math.max(0, this.cheek - dt * 0.6);
      this.munch = Math.max(0, this.munch - dt);
      this.mouthOpen = Math.max(0, this.mouthOpen - dt * 0.4);
      this.blink += dt;
      if (this.blink > this.blinkNext) { this.blink = 0; this.blinkNext = U.rand(1.8, 4.5); }
      this.bob += dt;
      if (this.speech) { this.speech.t += dt; if (this.speech.t > this.speech.life) this.speech = null; }
    },
  };

  // ---------- レイアウト ----------
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const FONT = `'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', sans-serif`;
  const POP = `'Mochiy Pop One', ${FONT}`;
  let VW = 0, VH = 0, DPR = 1, S = 30, JX = 0, JY = 0, portrait = false;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const m = location.search.match(/size=(\d+)x(\d+)/);
    VW = m ? +m[1] : window.innerWidth;
    VH = m ? +m[2] : window.innerHeight;
    cv.width = VW * DPR; cv.height = VH * DPR;
    cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
    portrait = VH > VW * 1.05;
    if (portrait) {
      const top = 128, bottom = Math.min(VW * 0.3, 130) + 20;
      S = Math.min((VH - top - bottom) / (3.0 + H + 2.4), (VW * 0.94) / 11.6);
      JX = (VW - 10 * S) / 2 - 0.7 * S;
      JY = top + 3.0 * S;
    } else {
      const vUnits = 3.6 + H + 3.0;
      S = Math.min((VH * 0.95) / vUnits, (VW * 0.94) / 15.5);
      const compW = 15.2 * S;
      JX = (VW - compW) / 2 + Math.min(VW * 0.08, 3 * S);
      JY = 3.6 * S;
    }
  }
  window.addEventListener('resize', resize);
  resize();
  const wx = (x) => JX + x * S, wy = (y) => JY + y * S;
  function worldToScreen(x, y) { return { x: wx(x), y: wy(y) }; }
  function maroHead() { return portrait ? { x: JX + 10.6 * S, y: JY - 0.9 * S, r: 1.9 * S } : { x: JX + 12.9 * S, y: JY + 1.4 * S, r: 2.5 * S }; }
  function maroMouth() { const h = maroHead(); return { x: h.x - h.r * 0.42, y: h.y + h.r * 0.5 }; }

  // ---------- 描画: マシュマロ ----------
  function rimFor(b, list, sxw, ins) {
    const N = 26, n = 2.7, pts = [];
    const wob = b.wob, pop = b.pop;
    const scale = 1 + pop * 0.12;
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2;
      const ph = th - b.ang;
      const c = Math.abs(Math.cos(ph)), s = Math.abs(Math.sin(ph));
      const rs = b.r * 0.94 * scale / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
      pts.push({ dx: Math.cos(th) * rs * (1 + wob), dy: Math.sin(th) * rs * (1 - wob), free: true });
    }
    const planes = [];
    for (const o of list) {
      if (o === b) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
      if (d > b.r + o.r + 0.05 || d < 1e-6) continue;
      planes.push([dx / d, dy / d, d * b.r / (b.r + o.r) + 0.02]);
    }
    planes.push([-1, 0, b.x - ins]);
    planes.push([1, 0, W - ins - b.x]);
    planes.push([0, 1, H - b.y]);
    const clampPts = () => {
      for (const p of pts) {
        for (const [nx, ny, s] of planes) {
          const proj = p.dx * nx + p.dy * ny;
          if (proj > s) { const k = s / proj; p.dx *= k; p.dy *= k; p.free = false; }
        }
      }
    };
    clampPts();
    // 体積を保つ: つぶれた分、自由な側がふくらむ
    let A = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      A += p.dx * q.dy - q.dx * p.dy;
    }
    A = Math.abs(A) / 2;
    const A0 = b.r * b.r * Math.PI * 0.97 * scale * scale;
    const k = U.clamp(Math.sqrt(A0 / Math.max(A, 1e-4)), 1, 1.16);
    if (k > 1.001) { for (const p of pts) if (p.free) { p.dx *= k; p.dy *= k; } clampPts(); }
    return pts;
  }

  function pathPts(pts, cx, cy) {
    ctx.beginPath();
    const n = pts.length;
    const P = (i) => pts[(i + n) % n];
    const m0x = (P(0).dx + P(1).dx) / 2, m0y = (P(0).dy + P(1).dy) / 2;
    ctx.moveTo(cx + m0x * S, cy + m0y * S);
    for (let i = 1; i <= n; i++) {
      const p = P(i), q = P(i + 1);
      ctx.quadraticCurveTo(cx + p.dx * S, cy + p.dy * S, cx + (p.dx + q.dx) / 2 * S, cy + (p.dy + q.dy) / 2 * S);
    }
    ctx.closePath();
  }

  function drawMallow(b, pts, opts) {
    const cx = wx(b.x), cy = wy(b.y), L = LV[b.level];
    const R = b.r * S;
    pathPts(pts, cx, cy);
    ctx.fillStyle = L.fill;
    ctx.fill();
    ctx.save();
    pathPts(pts, cx, cy);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = L.shade;
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 1.15, R * 1.3, R * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.05, cx, cy, R * 1.25);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
    // ココアはチョコの縞
    if (b.level === 5) {
      ctx.strokeStyle = 'rgba(110,64,38,0.35)';
      ctx.lineWidth = R * 0.12;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - R * 1.2, cy + i * R * 0.5 - R * 0.3);
        ctx.quadraticCurveTo(cx, cy + i * R * 0.5, cx + R * 1.2, cy + i * R * 0.5 - R * 0.3);
        ctx.stroke();
      }
    }
    ctx.restore();
    pathPts(pts, cx, cy);
    ctx.strokeStyle = 'rgba(80,50,70,0.18)';
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.stroke();
    drawFace(cx, cy, R, b, opts);
  }

  function drawFace(cx, cy, R, b, opts) {
    const s = R * (b.level === MAXL ? 0.75 : 0.9);
    const fy = cy - R * 0.05;
    ctx.save();
    ctx.translate(cx, fy);
    ctx.rotate(b.ang * 0.6);
    const ink = 'rgba(70,45,55,0.85)';
    if (opts.squeezing) {
      // > < で ぎゅー
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.2, s * 0.07); ctx.lineCap = 'round';
      for (const sg of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sg * s * 0.34, -s * 0.08); ctx.lineTo(sg * s * 0.18, 0); ctx.lineTo(sg * s * 0.34, s * 0.08);
        ctx.stroke();
      }
    } else if (opts.ready) {
      // キラキラおめめ（つぎの ぎゅっ で がったい！）
      for (const sg of [-1, 1]) {
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.ellipse(sg * s * 0.24, 0, s * 0.09, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sg * s * 0.24 - s * 0.03, -s * 0.04, s * 0.04, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = ink;
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(sg * s * 0.24, 0, s * 0.055, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * 0.05); ctx.lineCap = 'round';
    ctx.beginPath();
    if (opts.ready || b.pop > 0.2) ctx.arc(0, s * 0.12, s * 0.1, 0.1 * Math.PI, 0.9 * Math.PI);
    else ctx.arc(0, s * 0.12, s * 0.07, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    if (opts.ready || b.level >= 3) {
      ctx.fillStyle = 'rgba(255,130,150,0.38)';
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sg * s * 0.42, s * 0.13, s * 0.1, s * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    if (b.level === MAXL) drawCrown(cx, cy - R * 0.98, R * 0.55);
  }

  function drawCrown(x, y, s) {
    ctx.save();
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = '#b8862a';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.35);
    ctx.lineTo(x - s * 0.95, y - s * 0.45);
    ctx.lineTo(x - s * 0.45, y);
    ctx.lineTo(x, y - s * 0.6);
    ctx.lineTo(x + s * 0.45, y);
    ctx.lineTo(x + s * 0.95, y - s * 0.45);
    ctx.lineTo(x + s, y + s * 0.35);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff7fae';
    ctx.beginPath(); ctx.arc(x, y + s * 0.05, s * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // もち糸（つぎの ぎゅっ で合体するペアをつなぐ）
  function drawMochiNeck(p, q, beat) {
    const ax = wx(p.x), ay = wy(p.y), bx = wx(q.x), by = wy(q.y);
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const w = Math.min(p.r, q.r) * S * 0.5;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const pinch = 0.55 + 0.1 * beat;
    ctx.fillStyle = LV[p.level].fill;
    ctx.beginPath();
    ctx.moveTo(ax + nx * w, ay + ny * w);
    ctx.quadraticCurveTo(mx + nx * w * pinch, my + ny * w * pinch, bx + nx * w, by + ny * w);
    ctx.lineTo(bx - nx * w, by - ny * w);
    ctx.quadraticCurveTo(mx - nx * w * pinch, my - ny * w * pinch, ax - nx * w, ay - ny * w);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- 描画: 瓶・マロくん・背景 ----------
  function nightIdx() { return Math.min(G.kings, NIGHT.length - 1); }
  function drawBackground(beat) {
    const nI = nightIdx();
    const n = NIGHT[nI];
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, n.top); g.addColorStop(1, n.bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    // ゆっくり流れる水玉
    const t = performance.now() / 1000;
    const sp = Math.max(36, S * 1.6);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = -sp; y < VH + sp; y += sp) {
      for (let x = -sp; x < VW + sp; x += sp) {
        const ox = (t * 8) % sp, oy = (t * 5) % sp;
        const big = ((x / sp + y / sp) | 0) % 2 === 0;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, (big ? 5 : 3) * (1 + beat * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 机
    ctx.fillStyle = '#6b4f3a';
    ctx.fillRect(0, wy(H) + 0.15 * S, VW, VH);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, wy(H) + 0.15 * S, VW, 0.18 * S);
  }

  function jarPath(ins) {
    const l = wx(-0.25 + ins), r = wx(W + 0.25 - ins), top = wy(-0.3), bot = wy(H + 0.25);
    const rr = 1.2 * S;
    ctx.beginPath();
    ctx.moveTo(l, top);
    ctx.lineTo(l, bot - rr);
    ctx.quadraticCurveTo(l, bot, l + rr, bot);
    ctx.lineTo(r - rr, bot);
    ctx.quadraticCurveTo(r, bot, r, bot - rr);
    ctx.lineTo(r, top);
  }

  function drawMaroBody() {
    const h = maroHead();
    const a = sqAmt();
    // からだ（瓶のうしろ右。まるっとアンコ型）
    const bx = JX + (portrait ? 10.9 : 12.7) * S, by = JY + (portrait ? 5.5 : 8.4) * S;
    const breathe = 1 + Math.sin(maro.bob * 2.2) * 0.012 + a * 0.03;
    ctx.fillStyle = '#bfe3d4';
    ctx.beginPath();
    ctx.ellipse(bx, by, 3.7 * S * breathe, 4.3 * S / breathe, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(bx - 0.2 * S, by + 1.0 * S, 2.3 * S, 2.5 * S, 0, 0, Math.PI * 2); ctx.fill();
    // マシュマロ柄
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const [ox, oy] of [[1.2, -1.8], [2.2, 0.2], [0.9, 2.3], [2.4, 2.4], [-0.6, -0.4]]) {
      U.rr(ctx, bx + ox * S - 0.3 * S, by + oy * S - 0.25 * S, 0.6 * S, 0.5 * S, 0.22 * S); ctx.fill();
    }
    // 腕（瓶のうしろへ回して抱える。ガラス越しにうっすら）
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.25 * S;
    ctx.strokeStyle = '#bfe3d4';
    ctx.beginPath();
    ctx.moveTo(bx - 2.6 * S, by + 0.4 * S);
    ctx.quadraticCurveTo(JX + 10.8 * S, JY + 9.6 * S, wx(W + 0.3 - a * 0.32), JY + 9.0 * S);
    ctx.stroke();
    return h;
  }

  function drawHands() {
    const a = sqAmt();
    const sq = 1 - a * 0.15;
    ctx.fillStyle = '#ffe0c2';
    ctx.strokeStyle = 'rgba(120,80,60,0.35)';
    ctx.lineWidth = 2;
    for (const [x, y] of [[wx(-0.3 + a * 0.32), JY + 6.2 * S], [wx(W + 0.3 - a * 0.32), JY + 9.2 * S]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 0.62 * S * sq, 0.78 * S, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  function drawMaroHead(beat, danger) {
    const h = maroHead();
    const a = sqAmt();
    const bob = Math.sin(maro.bob * 2.2) * 0.06 * S + beat * 0.08 * S;
    const x = h.x, y = h.y + bob, r = h.r;
    // 頭
    ctx.fillStyle = '#ffe0c2';
    ctx.strokeStyle = 'rgba(120,80,60,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.06, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 髪（くるんとアホ毛）
    ctx.fillStyle = '#4a3528';
    ctx.beginPath(); ctx.ellipse(x + r * 0.1, y - r * 0.55, r * 0.95, r * 0.55, 0.05, Math.PI * 1.02, Math.PI * 2.02); ctx.fill();
    ctx.strokeStyle = '#4a3528'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.arc(x + r * 0.15, y - r * 1.2, r * 0.18, Math.PI * 0.6, Math.PI * 2.1); ctx.stroke();
    // ほっぺ（食べるとパンパン）
    const ck = r * (0.2 + maro.cheek * 0.22);
    ctx.fillStyle = 'rgba(255,150,160,0.55)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.72, y + r * 0.35, ck, ck * 0.75, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.55, y + r * 0.35, ck, ck * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    // メガネ（左を向いた3/4）
    const gx1 = x - r * 0.48, gx2 = x + r * 0.22, gy = y - r * 0.02, gr = r * 0.3;
    // 目
    const ink = '#2c2a3a';
    const blink = maro.blink < 0.12;
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round'; ctx.lineWidth = r * 0.07;
    for (const ex of [gx1, gx2]) {
      if (a > 0.1) {
        ctx.beginPath(); ctx.moveTo(ex - gr * 0.4, gy - gr * 0.25); ctx.lineTo(ex, gy); ctx.lineTo(ex - gr * 0.4, gy + gr * 0.25);
        if (ex === gx2) { ctx.moveTo(ex + gr * 0.4, gy - gr * 0.25); ctx.lineTo(ex, gy); ctx.lineTo(ex + gr * 0.4, gy + gr * 0.25); }
        ctx.stroke();
      } else if (maro.cheek > 0.4 || blink) {
        ctx.beginPath(); ctx.arc(ex - gr * 0.1, gy + gr * 0.15, gr * 0.42, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(ex - gr * 0.15, gy, gr * 0.2, gr * 0.27, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex - gr * 0.22, gy - gr * 0.1, gr * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ink;
      }
    }
    ctx.strokeStyle = '#3a3550'; ctx.lineWidth = r * 0.075;
    ctx.beginPath(); ctx.ellipse(gx1, gy, gr, gr * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(gx2, gy, gr, gr * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx1 + gr, gy); ctx.lineTo(gx2 - gr, gy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(gx1 + gr * 0.3, gy - gr * 0.35, gr * 0.25, gr * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
    // 口
    const m = maroMouth();
    const my = m.y + bob;
    ctx.fillStyle = '#a3574f';
    ctx.beginPath();
    if (maro.mouthOpen > 0.2 || G.flying) {
      ctx.ellipse(m.x, my, r * 0.22, r * 0.26, 0, 0, Math.PI * 2);
    } else if (maro.munch > 0) {
      const o = 0.5 + 0.5 * Math.sin(maro.munch * 22);
      ctx.ellipse(m.x, my, r * 0.18, r * (0.05 + 0.12 * o), 0, 0, Math.PI * 2);
    } else if (a > 0.1) {
      ctx.ellipse(m.x, my, r * 0.16, r * 0.05, 0, 0, Math.PI * 2);
    } else if (danger > 0.5) {
      ctx.ellipse(m.x, my + r * 0.04, r * 0.14, r * 0.07, 0, Math.PI, Math.PI * 2);
    } else {
      ctx.ellipse(m.x, my - r * 0.03, r * 0.17, r * 0.12, 0, 0, Math.PI);
    }
    ctx.fill();
    if (danger > 0.5) {
      ctx.fillStyle = 'rgba(140,200,255,0.9)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.95, y - r * 0.2 + (maro.bob * 30 % 12), r * 0.09, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    }
    return { x, y, r };
  }

  function drawSpeech(head) {
    const sp = maro.speech;
    if (!sp) return;
    const pr = sp.t / sp.life;
    const pop = U.easeOut(U.clamp(sp.t / 0.14, 0, 1));
    const alpha = pr > 0.75 ? 1 - (pr - 0.75) / 0.25 : 1;
    const size = Math.min(S * (sp.big ? 1.25 : 0.95), VW * 0.06) * (0.6 + 0.4 * pop);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.round(size)}px ${POP}`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    const tw = ctx.measureText(sp.text).width;
    const x = U.clamp(head.x - head.r * 0.5, tw / 2 + 8, VW - tw / 2 - 8);
    const y = Math.max(size * 1.1 + 40, head.y - head.r * 1.45 - pr * 0.6 * S);
    ctx.lineWidth = size * 0.26; ctx.strokeStyle = '#4a2a66'; ctx.strokeText(sp.text, x, y);
    ctx.fillStyle = sp.big ? '#ffe28a' : '#fff'; ctx.fillText(sp.text, x, y);
    ctx.restore();
  }

  // ---------- 描画: レーン（八分の格子） ----------
  function drawLane(t) {
    const e = eighth();
    const lx = wx(0), lw = W * S, ly = wy(H) + 0.75 * S, lh = 1.25 * S;
    ctx.fillStyle = 'rgba(25,18,45,0.72)';
    U.rr(ctx, lx, ly, lw, lh, lh / 2); ctx.fill();
    const slotW = lw / 11;
    const headX = lx + lw * 0.22;
    const now = t / e;
    ctx.save();
    U.rr(ctx, lx, ly, lw, lh, lh / 2); ctx.clip();
    const s0 = Math.floor(now - 3), s1 = Math.ceil(now + 9);
    for (let s = s0; s <= s1; s++) {
      const x = headX + (s - now) * slotW;
      const isBeat = s % 2 === 0, isBar = s % 8 === 0;
      ctx.fillStyle = isBar ? 'rgba(255,255,255,0.45)' : isBeat ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(x, ly + lh / 2, isBeat ? lh * 0.12 : lh * 0.07, 0, Math.PI * 2); ctx.fill();
    }
    const icon = (s, action, ghost, chain) => {
      const x = headX + (s - now) * slotW, y = ly + lh / 2;
      ctx.globalAlpha = ghost ? 0.45 : 1;
      ctx.fillStyle = action === 'pon' ? '#ffb9d4' : '#ffd86b';
      ctx.beginPath(); ctx.arc(x, y, lh * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a2440';
      ctx.font = `bold ${Math.round(lh * 0.32)}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(action === 'pon' ? 'ぽん' : 'ぎゅ', x, y + 1);
      if (chain >= 2) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(lh * 0.26)}px ${FONT}`;
        ctx.fillText(`×${chain}`, x, y - lh * 0.55);
      }
      ctx.globalAlpha = 1;
    };
    for (const l of G.lane) icon(l.slot, l.action, false, l.chain);
    for (const q of G.queue) icon(q.slot, q.action, true, 0);
    ctx.restore();
    // 再生位置
    const pulse = beatPulse();
    ctx.strokeStyle = `rgba(150,220,255,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(headX, ly - 4); ctx.lineTo(headX, ly + lh + 4); ctx.stroke();
  }

  function beatPulse() {
    const t = musicTime(), spb = 60 / bpm();
    if (t < 0) return 0;
    return Math.pow(1 - ((t / spb) % 1), 3);
  }

  // ---------- 描画: HUD・UI ----------
  function drawHud() {
    const n = NIGHT[nightIdx()];
    const fs = Math.max(14, Math.min(S * 0.62, 26));
    ctx.font = `${Math.round(fs)}px ${POP}`;
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    const lines = [
      [`${n.time}`, '#ffd9a0'],
      [`スコア ${U.fmtScore(G.score)}`, '#fff'],
      [`キング ${Math.min(G.kings, KINGS_FOR_DAWN)}/${KINGS_FOR_DAWN}${G.kings > KINGS_FOR_DAWN ? ` (+${G.kings - KINGS_FOR_DAWN})` : ''}`, '#fff'],
    ];
    const x0 = portrait ? 12 : 16, y0 = portrait ? 12 : 18;
    lines.forEach(([s, col], i) => {
      const y = y0 + fs * (i + 1) * 1.2;
      ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(40,20,60,0.85)'; ctx.strokeText(s, x0, y);
      ctx.fillStyle = col; ctx.fillText(s, x0, y);
    });
    // つぎ
    const nx = wx(-0.6) - 2.2 * S, ny = JY + 1.2 * S;
    if (!portrait && nx > 10) {
      ctx.font = `${Math.round(fs * 0.8)}px ${POP}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('つぎ', nx, ny - 0.2 * S);
      drawPreviewMallow(G.next, nx, ny + 1.4 * S, 1.0);
    }
    // ぎゅっ の よそう
    // ぎゅっ の ちから（ちびマシュマロのアイコン）
    {
      const iy = y0 + fs * 3.6 + fs * 0.35, is = fs * 0.85;
      ctx.font = `${Math.round(fs * 0.7)}px ${POP}`;
      ctx.lineWidth = fs * 0.2; ctx.strokeStyle = 'rgba(40,20,60,0.85)';
      ctx.strokeText('ちから', x0, iy + is * 0.75); ctx.fillStyle = '#fff'; ctx.fillText('ちから', x0, iy + is * 0.75);
      for (let i = 0; i < POWER_MAX; i++) {
        const ix = x0 + fs * 3.1 + i * is * 1.1;
        ctx.globalAlpha = i < G.power ? 1 : 0.25;
        ctx.fillStyle = i < G.power ? '#ffd86b' : '#ffffff';
        U.rr(ctx, ix, iy, is, is, is * 0.4); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // ぎゅっ の よそう（左の列、スコアの下）
    const pr = G.pred.steps;
    {
      const big = pr >= 2;
      const txt = pr === 0 ? 'ぎゅっ：まだ がったい なし' : big ? `ぎゅっ で ${pr}れんさ！` : 'ぎゅっ で がったい OK';
      const ty = y0 + fs * 5 * 1.2 + fs * 0.5;
      ctx.font = `${Math.round(fs * (big ? 0.95 : 0.7))}px ${POP}`;
      ctx.textAlign = 'left';
      ctx.lineWidth = fs * 0.2; ctx.strokeStyle = 'rgba(40,20,60,0.85)'; ctx.strokeText(txt, x0, ty);
      ctx.fillStyle = big ? '#ffe28a' : pr ? '#fff' : 'rgba(255,255,255,0.55)'; ctx.fillText(txt, x0, ty);
    }
    ctx.textAlign = 'left';
  }

  function drawPreviewMallow(level, x, y, scl) {
    const b = { x: 0, y: 0, r: RAD[level] * scl, level, ang: 0, wob: 0, pop: 0 };
    const pts = rimFor(b, [], 0, -99);
    const save = [JX, JY];
    JX = x; JY = y;
    drawMallow(b, pts, {});
    [JX, JY] = save;
  }

  function uiButton(id, label, cx, cy, w, h, primary) {
    const x = cx - w / 2, y = cy - h / 2;
    ctx.fillStyle = primary ? '#ff8fb8' : 'rgba(255,255,255,0.16)';
    U.rr(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    U.rr(ctx, x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(h * 0.4)}px ${POP}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    G.uiButtons.push({ id, x, y, w, h });
  }

  function touchButtons() {
    if (!G.touch) return [];
    const bs = Math.min(VW * 0.26, 110);
    const y = VH - bs * 0.75;
    return [
      { id: 'pon', label: 'ぽん', x: VW * 0.25, y, r: bs / 2, col: '#ffb9d4' },
      { id: 'gyu', label: 'ぎゅっ', x: VW * 0.75, y, r: bs / 2, col: '#ffd86b' },
    ];
  }

  function drawVolume() {
    const v = MB.audio.volume;
    const icon = v === 0 ? '🔇' : v <= 0.25 ? '🔈' : v <= 0.5 ? '🔉' : '🔊';
    const bw = 78, bh = 32, x = VW - bw - 10, y = 8;
    ctx.fillStyle = 'rgba(20,16,40,0.55)';
    U.rr(ctx, x, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${icon} ${Math.round(v * 100)}%`, x + bw / 2, y + bh / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    G.uiButtons.push({ id: 'vol', x, y, w: bw, h: bh });
  }

  function bigText(str, y, size, col) {
    ctx.font = `${Math.round(size)}px ${POP}`;
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.22; ctx.strokeStyle = '#4a2a66'; ctx.strokeText(str, VW / 2, y);
    ctx.fillStyle = col || '#fff'; ctx.fillText(str, VW / 2, y);
    ctx.textAlign = 'left';
  }

  // ---------- メイン描画 ----------
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    G.uiButtons = [];
    const beat = G.state === 'play' ? beatPulse() : 0;
    ctx.save();
    if (G.shake > 0) ctx.translate(U.rand(-1, 1) * G.shake * S * 0.3, U.rand(-1, 1) * G.shake * S * 0.3);
    drawBackground(beat);
    drawMaroBody();
    const ins = inset();
    // 瓶（奥のガラス: 中身が映えるよう濃いめ）
    jarPath(ins * 0.0);
    const jg = ctx.createLinearGradient(wx(0), 0, wx(W), 0);
    jg.addColorStop(0, 'rgba(34,26,64,0.86)');
    jg.addColorStop(0.5, 'rgba(46,36,82,0.78)');
    jg.addColorStop(1, 'rgba(34,26,64,0.86)');
    ctx.fillStyle = jg;
    ctx.fill();
    // ふちライン（あふれ注意）
    const dangerA = U.clamp(G.danger / 3, 0, 1);
    ctx.strokeStyle = dangerA > 0.05 ? `rgba(255,90,110,${0.4 + 0.5 * Math.abs(Math.sin(performance.now() / 120))})` : 'rgba(255,255,255,0.18)';
    ctx.setLineDash([8, 7]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wx(0), wy(0)); ctx.lineTo(wx(W), wy(0)); ctx.stroke();
    ctx.setLineDash([]);

    // ねらいのガイド
    if (G.state === 'play') {
      const r = RAD[G.cur];
      const ax = U.clamp(G.aimX, r, W - r);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(wx(ax), wy(-1.6)); ctx.lineTo(wx(ax), wy(H)); ctx.stroke();
      ctx.setLineDash([]);
      // マシュマロ袋からぶらさがる今の子
      drawPreviewMallow(G.cur, wx(ax), wy(-2.0 + Math.sin(performance.now() / 300) * 0.05), 1);
    }

    // マシュマロ
    const B = G.bodies;
    const readyIds = new Set();
    for (const [a, b] of G.pred.pairs) { readyIds.add(a); readyIds.add(b); }
    const byId = new Map(B.map((b) => [b.id, b]));
    for (const [a, b] of G.pred.pairs) {
      const p = byId.get(a), q = byId.get(b);
      if (p && q) drawMochiNeck(p, q, beat);
    }
    const squeezing = sqAmt() > 0.2;
    for (const b of B) {
      const pts = rimFor(b, B, 0, ins);
      drawMallow(b, pts, { ready: readyIds.has(b.id), squeezing });
    }
    // 合体ゴースト（二つが吸い寄せられる）
    for (const g of G.ghosts) {
      const k = U.easeIn(U.clamp(g.t / 0.13, 0, 1));
      for (const o of [g.a, g.b]) {
        const gb = { x: U.lerp(o.x, g.x, k), y: U.lerp(o.y, g.y, k), r: o.r * (1 - k * 0.5), level: o.level, ang: o.ang, wob: 0, pop: 0 };
        ctx.globalAlpha = 1 - k;
        drawMallow(gb, rimFor(gb, [], 0, -99), {});
        ctx.globalAlpha = 1;
      }
    }

    // 瓶（手前のガラス）
    jarPath(ins);
    ctx.strokeStyle = 'rgba(220,240,255,0.75)';
    ctx.lineWidth = Math.max(3, S * 0.16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(wx(0.2 + ins), wy(0.6), S * 0.35, H * S * 0.75);
    // ふちのリップ
    ctx.fillStyle = 'rgba(220,240,255,0.85)';
    U.rr(ctx, wx(-0.55 + ins), wy(-0.55), (W + 1.1 - ins * 2) * S, 0.45 * S, 0.2 * S); ctx.fill();
    // フタの S マーク
    ctx.save();
    ctx.fillStyle = '#ff5c96';
    ctx.beginPath(); ctx.arc(wx(0.6), wy(-0.33), 0.42 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(S * 0.5)}px ${POP}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('S', wx(0.6), wy(-0.3));
    ctx.restore();

    drawHands();
    const head = drawMaroHead(beat, G.danger);

    // キングが口へ
    if (G.flying) {
      const f = G.flying, k = U.clamp(f.t / f.dur, 0, 1), e = U.ease(k);
      const m = maroMouth();
      const mx = (f.from.x + m.x) / 2, my = Math.min(f.from.y, m.y) - 4 * S;
      const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * mx + e * e * m.x;
      const y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * my + e * e * m.y;
      const scl = 1 - 0.55 * Math.max(0, (k - 0.7) / 0.3);
      const fb = { x: 0, y: 0, r: RAD[MAXL] * scl, level: MAXL, ang: f.ang + k * 6, wob: Math.sin(k * 20) * 0.08, pop: 0 };
      const save = [JX, JY]; JX = x; JY = y;
      drawMallow(fb, rimFor(fb, [], 0, -99), { ready: true });
      [JX, JY] = save;
    }

    // パーティクル・文字
    for (const p of G.parts) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.star ? '#ffe9a0' : p.col;
      ctx.beginPath(); ctx.arc(wx(p.x), wy(p.y), p.size * S * a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const tx of G.texts) {
      const a = 1 - Math.pow(tx.t / tx.life, 2);
      const sz = S * 0.7 * tx.size;
      ctx.globalAlpha = a;
      ctx.font = `${Math.round(sz)}px ${POP}`;
      ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.lineWidth = sz * 0.22; ctx.strokeStyle = 'rgba(50,25,70,0.85)';
      const x = wx(tx.x), y = wy(tx.y) - tx.t * S * 0.8;
      ctx.strokeText(tx.str, x, y);
      ctx.fillStyle = tx.col; ctx.fillText(tx.str, x, y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';

    if (G.state === 'play' || G.state === 'over') drawLane(musicTime());
    drawSpeech(head);
    drawHud();
    for (const b of touchButtons()) {
      ctx.fillStyle = b.col; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a2440'; ctx.font = `${Math.round(b.r * 0.42)}px ${POP}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x, b.y + 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    if (G.state === 'title') drawTitle();
    else if (G.state === 'over') drawOver();
    if (G.dawnT != null && G.dawnT < 5) {
      const a = G.dawnT < 0.5 ? G.dawnT * 2 : G.dawnT > 4 ? 5 - G.dawnT : 1;
      ctx.globalAlpha = a;
      bigText('よあけだー！', VH * 0.32, Math.min(VW * 0.1, 72), '#ffe28a');
      bigText('キング4こ たべて おしごと かんりょう！', VH * 0.42, Math.min(VW * 0.04, 26), '#fff');
      bigText('このまま つづけて ハイスコアを ねらおう', VH * 0.49, Math.min(VW * 0.03, 20), '#ffe8c0');
      ctx.globalAlpha = 1;
    }
    drawVolume();
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(20,12,40,0.55)';
    ctx.fillRect(0, 0, VW, VH);
    const t = performance.now() / 1000;
    const chars = [['マ', '#fff5ec'], ['シ', '#ffd3e3'], ['ュ', '#fff5ec'], ['と', '#ffe28a', 0.6], ['マ', '#ffd3e3'], ['ロ', '#fff5ec']];
    const size = Math.min(VW * 0.12, 110);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const ws = chars.map(([c, , s]) => { ctx.font = `${Math.round(size * (s || 1))}px ${POP}`; return ctx.measureText(c).width; });
    let x = VW / 2 - (ws.reduce((a, b) => a + b, 0) + size * 0.12 * 5) / 2;
    const cy = VH * 0.2;
    chars.forEach(([c, col, s], i) => {
      ctx.save();
      ctx.translate(x + ws[i] / 2, cy + Math.sin(t * 2.2 + i) * size * 0.05);
      ctx.rotate(Math.sin(t * 1.5 + i * 1.3) * 0.05 + [-0.06, 0.04, -0.03, 0.07, -0.04, 0.05][i]);
      ctx.font = `${Math.round(size * (s || 1))}px ${POP}`;
      ctx.fillStyle = 'rgba(30,15,45,0.4)'; ctx.fillText(c, size * 0.04, size * 0.06);
      ctx.lineWidth = size * 0.36; ctx.strokeStyle = '#4a2a66'; ctx.strokeText(c, 0, 0);
      ctx.lineWidth = size * 0.18; ctx.strokeStyle = '#fff'; ctx.strokeText(c, 0, 0);
      ctx.fillStyle = col; ctx.fillText(c, 0, 0);
      ctx.restore();
      x += ws[i] + size * 0.12;
    });
    bigText('ぎゅっとリズム', cy + size * 0.75, size * 0.32, '#ffe28a');
    const fs = Math.min(VW * 0.032, 22);
    const rows = [
      '🖱 うごかして ねらう ／ クリック・Space で「ぽん」と おとす',
      '右クリック・ホイールおし・X で「ぎゅっ」！ くっついた おなじ大きさが がったい',
      'ぎゅっ を リズムよく つづけると れんさ ×2 ×3！（タタタン と はやく でもOK）',
      'ぎゅっ は「ちから」を つかう（2拍で1かいふく）→ ためて いっきに！',
      '1小節 なにも おとさないと 袋から ぽろっ。いつ押しても 曲に ぴったり うごくよ',
      'キングマシュマロを 4こ たべさせたら よあけ！',
    ];
    ctx.font = `${Math.round(fs)}px ${FONT}`;
    const py = VH * 0.42;
    ctx.fillStyle = 'rgba(24,16,46,0.75)';
    const pw = Math.min(VW * 0.92, fs * 34);
    U.rr(ctx, VW / 2 - pw / 2, py - fs * 1.4, pw, fs * 1.75 * rows.length + fs * 0.9, 16); ctx.fill();
    rows.forEach((r, i) => {
      ctx.textAlign = 'center';
      ctx.fillStyle = i === 1 || i === 2 ? '#ffe28a' : '#fff';
      ctx.fillText(r, VW / 2, py + i * fs * 1.75, pw - 20);
    });
    if (Math.sin(t * 3.5) > -0.4) bigText('クリック / タップ で スタート', VH * 0.86, Math.min(VW * 0.045, 30));
    ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
    ctx.fillText(`ベスト ${U.fmtScore(G.best)}`, VW / 2, VH * 0.92);
    ctx.textAlign = 'left';
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(20,12,40,0.6)';
    ctx.fillRect(0, 0, VW, VH);
    bigText('あふれちゃった…', VH * 0.32, Math.min(VW * 0.08, 60), '#ff9eb5');
    bigText(`スコア ${U.fmtScore(G.score)}　キング ${G.kings}こ`, VH * 0.43, Math.min(VW * 0.04, 28));
    bigText(`ベスト ${U.fmtScore(G.best)}`, VH * 0.5, Math.min(VW * 0.03, 20), '#ffe8c0');
    if (G.stateT > 1) uiButton('retry', 'もういちど！', VW / 2, VH * 0.64, Math.min(VW * 0.6, 320), 62, true);
  }

  // ---------- 更新 ----------
  function update(dt) {
    G.stateT += dt;
    MB.music.update();
    maro.update(dt);
    if (G.dawnT != null) G.dawnT += dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2);
    for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt; }
    G.parts = G.parts.filter((p) => p.t < p.life);
    for (const t of G.texts) t.t += dt;
    G.texts = G.texts.filter((t) => t.t < t.life);
    for (const g of G.ghosts) g.t += dt;
    G.ghosts = G.ghosts.filter((g) => g.t < 0.13);
    if (G.state !== 'play') return;

    // キーボードでねらい
    if (G.keys.ArrowLeft) G.aimX -= dt * 9;
    if (G.keys.ArrowRight) G.aimX += dt * 9;
    G.aimX = U.clamp(G.aimX, 0, W);

    const t = musicTime();
    if (t < G.prevT - 1) { G.queue = []; G.lastSlot = -1; G.lane = []; G.lastSqSlot = -99; }
    G.prevT = t;
    runQueue(t);

    // 拍ごとにぷるっ
    const bi = Math.floor(t / (60 / bpm()));
    if (bi !== G.beatIdx) {
      G.beatIdx = bi;
      for (const b of G.bodies) b.wobV -= 1.6;
      if (bi >= 0 && bi % 2 === 0 && G.power < POWER_MAX) G.power++;
      // 小節の頭: ちから回復・落とさなかったら袋から ぽろっ
      const bar = Math.floor(bi / 4);
      if (bi >= 0 && bar !== G.barIdx) {
        if (G.barIdx >= 1 && !G.ponThisBar) {
          doDrop();
          popText(U.clamp(G.aimX, 1, W - 1), -1.2, 'ぽろっ', '#ffd3e3', 0.7);
        }
        G.barIdx = bar;
        G.ponThisBar = false;
      }
    }

    G.sqT += dt;
    G.acc += dt;
    while (G.acc >= STEP) { physStep(STEP); G.acc -= STEP; }
    for (const b of G.bodies) {
      // ぷるぷるバネ
      b.wobV += -b.wob * 260 * dt - b.wobV * 9 * dt;
      b.wob = U.clamp(b.wob + b.wobV * dt, -0.18, 0.18);
      b.pop = Math.max(0, b.pop - dt * 3);
    }
    updateKings(dt);
    if ((G.frame = (G.frame || 0) + 1) % 5 === 0) predict();

    // あふれ判定
    const over = G.bodies.some((b) => b.age > 1.6 && b.y - b.r < -0.15);
    G.danger = over ? G.danger + dt : Math.max(0, G.danger - dt * 2);
    if (over && Math.floor(G.danger * 4) !== Math.floor((G.danger - dt) * 4)) snd.tick();
    if (over && G.danger > 0.6 && !maro.speech) maro.say('あふれるー！？');
    if (G.danger > 3) gameOver();

    // 独り言
    G.sayT -= dt;
    if (G.sayT <= 0) {
      G.sayT = U.rand(11, 18);
      if (!maro.speech) maro.say(U.pick(['はやく かえりたいなー', 'マシュマロ たべたいなー', 'ぎゅっと するの すき', 'キング まだかなー', 'んしょ、んしょ…']));
    }
  }

  function gameOver() {
    G.state = 'over'; G.stateT = 0;
    if (G.score > G.best) { G.best = G.score; const s = U.load() || {}; s.poyonBest = G.best; U.save(s); }
    MB.sfx.gameOver && MB.sfx.gameOver();
    maro.say('あふれたー！？');
  }

  function start() {
    MB.audio.ensure();
    G.state = 'play'; G.stateT = 0;
    G.bodies = []; G.ghosts = []; G.parts = []; G.texts = []; G.queue = []; G.lane = [];
    G.score = 0; G.kings = 0; G.chain = 0; G.danger = 0; G.kingQueue = []; G.flying = null;
    G.lastSlot = -1; G.lastSqSlot = -99; G.lastSqMerged = false; G.clearShown = false; G.dawnT = null;
    G.power = POWER_MAX; G.barIdx = -1; G.ponThisBar = true; G.beatIdx = -1;
    G.cur = 1; G.next = rollLevel(); G.prevT = -1e9;
    // 最初からちょっとだけ入っている
    for (let i = 0; i < 6; i++) G.bodies.push(Object.assign(makeBody(U.randInt(1, 2), 1 + i * 1.6, H - 1 - (i % 2)), { landed: true, age: 2 }));
    if (!MB.music.started) MB.music.startStage(MB.STAGES[4], null, true);
    localStart = performance.now() / 1000;
    maro.say('きょうも ぎゅっと がんばるぞー！');
  }

  // ---------- 入力 ----------
  function setAim(clientX) { G.aimX = U.clamp((clientX - JX) / S, 0, W); }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('auxclick', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || G.dragging) setAim(e.clientX);
  });
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    MB.audio.ensure();
    if (e.pointerType === 'touch') G.touch = true;
    const x = e.clientX, y = e.clientY;
    for (const b of G.uiButtons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.id === 'vol') {
          const order = [1, 0.5, 0.25, 0];
          const i = order.findIndex((v) => Math.abs(v - MB.audio.volume) < 0.01);
          MB.audio.setVolume(order[(i + 1) % order.length]);
          const s = U.load() || {}; s.volume = MB.audio.volume; U.save(s);
        } else if (b.id === 'retry') start();
        return;
      }
    }
    if (G.state === 'title') { start(); return; }
    if (G.state === 'over') { if (G.stateT > 1) start(); return; }
    for (const b of touchButtons()) {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r * 1.1) ** 2) { press(b.id); return; }
    }
    if (e.pointerType === 'touch') { G.dragging = true; setAim(x); return; }
    if (e.button === 0) { setAim(x); press('pon'); }
    else if (e.button === 1 || e.button === 2) press('gyu');
  });
  cv.addEventListener('pointerup', () => { G.dragging = false; });
  let wheelAcc = 0;
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAcc += Math.abs(e.deltaY);
    if (wheelAcc > 60) { wheelAcc = 0; press('gyu'); }
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { e.preventDefault(); return; }
    G.keys[e.key] = true;
    MB.audio.ensure();
    if (G.state === 'title' && (e.key === 'Enter' || e.key === ' ')) { start(); e.preventDefault(); return; }
    if (G.state === 'over' && (e.key === 'Enter' || e.key === ' ') && G.stateT > 1) { start(); e.preventDefault(); return; }
    if ([' ', 'z', 'Z', 'j', 'J'].includes(e.key)) { press('pon'); e.preventDefault(); }
    if (['x', 'X', 'k', 'K', 'ArrowDown'].includes(e.key)) { press('gyu'); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { G.keys[e.key] = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) MB.music.pause(); else MB.music.resume();
  });

  // ---------- 起動 ----------
  const sv = U.load() || {};
  MB.audio.volume = sv.volume != null ? sv.volume : 0.5;
  MB.music.initTheme(document.getElementById('themeAudio'));
  if (document.fonts && document.fonts.load) { document.fonts.load(`32px "Mochiy Pop One"`); document.fonts.load(`700 16px "M PLUS Rounded 1c"`); }
  // タイトル背景用に少し入れておく
  for (let i = 0; i < 9; i++) G.bodies.push(Object.assign(makeBody(U.randInt(1, 4), 1 + (i % 5) * 2, H - 1 - Math.floor(i / 5) * 2), { landed: true, age: 2 }));
  for (let i = 0; i < 400; i++) physStep(STEP);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (window.innerWidth !== VW && !/size=/.test(location.search)) resize();
    if (!document.hidden) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 自動テスト用
  window.POYON = { G, press, start, update, draw, predict, physStep, doSqueeze, doDrop, musicTime, maro };
})();
