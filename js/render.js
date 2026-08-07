// マシュマロビルド - 描画（背景/フィールド/HUD/パーティクル）
window.MB = window.MB || {};

(function () {
  const U = MB.util;
  const C = MB.C;

  // ---- 色ユーティリティ ----
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function colorLerp(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return `rgb(${Math.round(U.lerp(a[0], b[0], t))},${Math.round(U.lerp(a[1], b[1], t))},${Math.round(U.lerp(a[2], b[2], t))})`;
  }
  MB.colorLerp = colorLerp;

  // ---- マシュマロ描画 ----
  MB.draw = {
    // 着地・衝撃のぷにぷに変形量を計算
    squash(cell) {
      const now = performance.now();
      let sx = 1, sy = 1;
      if (cell.born) {
        const t = (now - cell.born) / 300;
        if (t < 1) {
          const k = Math.sin(Math.PI * Math.min(t * 1.6, 1)) * (1 - t);
          sy = 1 - 0.34 * k;
          sx = 1 + 0.30 * k;
        } else cell.born = 0;
      }
      if (cell.jig) {
        const t = (now - cell.jig) / 260;
        if (t < 1) {
          const k = Math.sin(Math.PI * t) * (1 - t);
          sy *= 1 - 0.15 * k;
          sx *= 1 + 0.12 * k;
        } else cell.jig = 0;
      }
      return { sx, sy };
    },

    // x,y,size: 左上とセルサイズ。opts: {s, marked, sweeping, round, sx, sy, rot}
    marshmallow(ctx, x, y, size, color, opts) {
      opts = opts || {};
      const bs = size * 1.06; // セルよりちょい大きく描いてむぎゅっと密着
      const cx = x + size / 2, cy = y + size / 2;
      const sx = opts.sx == null ? 1 : opts.sx;
      const sy = opts.sy == null ? 1 : opts.sy;
      ctx.save();
      ctx.translate(cx, cy + (1 - sy) * size * 0.5); // つぶれた分は下に沈む
      if (opts.rot) ctx.rotate(opts.rot);
      ctx.scale(sx, sy);
      const h = bs / 2;
      const r = bs * (opts.round == null ? 0.44 : opts.round);
      const white = color === C.WHITE;
      let fill = white ? '#fdf5ec' : '#ffc9dc';
      let shade = white ? '#e3d2c2' : '#ea9dbd';
      if (opts.sweeping) {
        // 回収中はキラッと明るく（透明にはしない）
        fill = white ? '#fffef8' : '#ffe4ef';
        shade = white ? '#f5ecdf' : '#f8ccdd';
      }

      // ふんわり影（下）
      ctx.fillStyle = 'rgba(60,40,60,0.14)';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.92, h * 0.85, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // 本体
      U.rr(ctx, -h, -h, bs, bs, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.save();
      U.rr(ctx, -h, -h, bs, bs, r);
      ctx.clip();
      // 下側のやわらか陰影
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(0, h * 1.15, h * 1.25, h * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      // 中心のふわっと感（radial）
      const g = ctx.createRadialGradient(-h * 0.35, -h * 0.4, bs * 0.05, 0, 0, bs * 0.85);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      U.rr(ctx, -h, -h, bs, bs, r);
      ctx.fill();
      ctx.restore();

      // 回収中のキラキラ
      if (opts.sweeping) {
        const tw = performance.now() / 130;
        ctx.strokeStyle = `rgba(255,230,150,${0.5 + 0.4 * Math.sin(tw)})`;
        ctx.lineWidth = Math.max(2, bs * 0.05);
        U.rr(ctx, -h + 1, -h + 1, bs - 2, bs - 2, r);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(tw * 1.7)})`;
        ctx.beginPath();
        ctx.arc(bs * 0.18, -bs * 0.18, bs * 0.1, 0, Math.PI * 2);
        ctx.arc(-bs * 0.2, bs * 0.1, bs * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }

      // 予約マーク: ぷるぷる顔
      if (opts.marked && !opts.sweeping && !opts.noFace) {
        const ey = bs * -0.02;
        ctx.fillStyle = 'rgba(70,50,60,0.75)';
        ctx.beginPath();
        ctx.ellipse(-bs * 0.16, ey, bs * 0.05, bs * 0.07, 0, 0, Math.PI * 2);
        ctx.ellipse(bs * 0.16, ey, bs * 0.05, bs * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,50,60,0.7)';
        ctx.lineWidth = Math.max(1, bs * 0.04);
        ctx.beginPath();
        ctx.arc(0, ey + bs * 0.1, bs * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        // ほっぺ
        ctx.fillStyle = 'rgba(255,140,160,0.35)';
        ctx.beginPath();
        ctx.ellipse(-bs * 0.28, ey + bs * 0.12, bs * 0.08, bs * 0.05, 0, 0, Math.PI * 2);
        ctx.ellipse(bs * 0.28, ey + bs * 0.12, bs * 0.08, bs * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sマーク
      if (opts.s) {
        ctx.fillStyle = '#ff5c96';
        ctx.beginPath();
        ctx.arc(0, 0, bs * 0.24, 0, Math.PI * 2);
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(bs * 0.34)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', 0, bs * 0.03);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
    },

    // 色と状態から塗り色を返す
    fillFor(color, sweeping) {
      const white = color === C.WHITE;
      if (sweeping) {
        return { fill: white ? '#fffef8' : '#ffe4ef', shade: white ? '#f5ecdf' : '#f8ccdd' };
      }
      return { fill: white ? '#fdf5ec' : '#ffc9dc', shade: white ? '#e3d2c2' : '#ea9dbd' };
    },

    // となり同士のマシュマロを「もち」のようにつなぐ（中央がくびれた曲線）
    // (x1,y1)-(x2,y2) はセル左上のピクセル座標（縦横いずれか隣接）
    bridge(ctx, x1, y1, x2, y2, cell, color, sweeping) {
      const f = this.fillFor(color, sweeping);
      const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
      ctx.fillStyle = f.fill;
      if (horizontal) {
        const ex = Math.max(x1, x2);       // 共有辺のx
        const cy = y1 + cell / 2;
        const attach = cell * 0.43;        // 本体に接する部分の半分の高さ
        const span = cell * 0.52;          // 左右にどこまで食い込むか
        const neckT = cell * 0.26;         // 上のくびれ（きつめ）
        const neckB = cell * 0.36;         // 下のくびれ（ゆるめ＝もちの垂れ）
        const lx = ex - span, rx = ex + span;
        ctx.beginPath();
        ctx.moveTo(lx, cy - attach);
        ctx.quadraticCurveTo(ex, cy - neckT, rx, cy - attach);
        ctx.lineTo(rx, cy + attach);
        ctx.quadraticCurveTo(ex, cy + neckB, lx, cy + attach);
        ctx.closePath();
        ctx.fill();
        // くびれの下側にうっすら陰
        ctx.fillStyle = f.shade;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(lx + span * 0.25, cy + attach * 0.5);
        ctx.quadraticCurveTo(ex, cy + neckB * 0.92, rx - span * 0.25, cy + attach * 0.5);
        ctx.quadraticCurveTo(ex, cy + attach * 0.98, lx + span * 0.25, cy + attach * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const ey = Math.max(y1, y2);       // 共有辺のy
        const cx = x1 + cell / 2;
        const attach = cell * 0.43;
        const span = cell * 0.52;
        const neck = cell * 0.28;
        const ty = ey - span, by = ey + span;
        ctx.beginPath();
        ctx.moveTo(cx - attach, ty);
        ctx.quadraticCurveTo(cx - neck, ey, cx - attach, by);
        ctx.lineTo(cx + attach, by);
        ctx.quadraticCurveTo(cx + neck, ey, cx + attach, ty);
        ctx.closePath();
        ctx.fill();
      }
    },

    // にっこり顔（予約マシュマロ・キングマシュマロ用）
    face(ctx, cx, cy, s, beat) {
      const blink = beat != null && beat > 0.92;
      ctx.fillStyle = 'rgba(70,50,60,0.8)';
      if (blink) {
        ctx.strokeStyle = 'rgba(70,50,60,0.8)';
        ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.22, cy);
        ctx.lineTo(cx - s * 0.1, cy);
        ctx.moveTo(cx + s * 0.1, cy);
        ctx.lineTo(cx + s * 0.22, cy);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(cx - s * 0.16, cy, s * 0.05, s * 0.07, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + s * 0.16, cy, s * 0.05, s * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(70,50,60,0.75)';
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.1, s * 0.11, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,160,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.3, cy + s * 0.13, s * 0.09, s * 0.055, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.3, cy + s * 0.13, s * 0.09, s * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  };

  // ---- パーティクル＆演出 ----
  MB.fx = {
    parts: [],
    texts: [],
    shakeT: 0,
    shakeAmp: 0,
    flash: 0,

    reset() { this.parts = []; this.texts = []; this.shakeT = 0; this.flash = 0; },

    pop(x, y, color) {
      const col = color === C.WHITE ? '#fff4e8' : '#ffc6da';
      for (let i = 0; i < 7; i++) {
        const a = U.rand(0, Math.PI * 2), sp = U.rand(40, 190);
        this.parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: U.rand(0.35, 0.7), age: 0, size: U.rand(3, 8), color: col, type: 'circle', g: 300,
        });
      }
    },

    crumbs(x, y, color) {
      const col = color === C.WHITE ? '#fff' : '#ffd4e2';
      for (let i = 0; i < 4; i++) {
        this.parts.push({
          x: x + U.rand(-6, 6), y: y + U.rand(-3, 3),
          vx: U.rand(-35, 35), vy: U.rand(-10, 45),
          life: U.rand(0.3, 0.5), age: 0, size: U.rand(2, 4), color: col, type: 'circle', g: 200,
        });
      }
    },

    stars(x, y, n, color) {
      for (let i = 0; i < (n || 6); i++) {
        const a = U.rand(0, Math.PI * 2), sp = U.rand(60, 260);
        this.parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: U.rand(0.4, 0.9), age: 0, size: U.rand(4, 9), color: color || '#ffe9a0', type: 'star', g: 60, spin: U.rand(0, 6),
        });
      }
    },

    text(x, y, str, color, size) {
      this.texts.push({ x, y, str, color: color || '#fff', size: size || 22, age: 0, life: 0.9 });
    },

    shake(amp) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = 0.3; },
    doFlash(v) { this.flash = Math.max(this.flash, v); },

    update(dt) {
      for (const p of this.parts) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.g || 0) * dt;
        if (p.spin != null) p.spin += dt * 8;
      }
      this.parts = this.parts.filter((p) => p.age < p.life);
      for (const t of this.texts) { t.age += dt; t.y -= 34 * dt; }
      this.texts = this.texts.filter((t) => t.age < t.life);
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    },

    draw(ctx) {
      for (const p of this.parts) {
        const a = 1 - p.age / p.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.type === 'star') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.spin || 0);
          const s = p.size * a;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2;
            ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
            ctx.lineTo(Math.cos(ang + Math.PI / 4) * s * 0.4, Math.sin(ang + Math.PI / 4) * s * 0.4);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const t of this.texts) {
        const a = 1 - Math.pow(t.age / t.life, 2);
        ctx.globalAlpha = a;
        ctx.font = `bold ${t.size}px ${MB.render.FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,20,40,0.6)';
        ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    },
  };

  // ---- メインレンダラ ----
  MB.render = {
    FONT: `'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', 'Meiryo', sans-serif`,
    FONT_POP: `'Mochiy Pop One', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', sans-serif`,
    canvas: null,
    ctx: null,
    w: 0, h: 0, dpr: 1,
    rects: {},
    portrait: false,
    starSeed: [],
    citySeed: [],

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      for (let i = 0; i < 90; i++) {
        this.starSeed.push({ x: Math.random(), y: Math.random() * 0.7, r: U.rand(0.6, 1.9), tw: U.rand(0, 6) });
      }
      let x = 0;
      while (x < 1.0) {
        const w = U.rand(0.03, 0.09);
        this.citySeed.push({ x, w, h: U.rand(0.08, 0.26), win: Math.random() });
        x += w + U.rand(0.005, 0.02);
      }
      this.resize();
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      if (MB.DEBUG_SIZE) {
        this.w = MB.DEBUG_SIZE.w;
        this.h = MB.DEBUG_SIZE.h;
      } else {
        this.w = window.innerWidth || 1280;
        this.h = window.innerHeight || 720;
      }
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.layout();
    },

    layout() {
      const w = this.w, h = this.h;
      this.portrait = h > w * 1.05;
      const R = {};
      if (!this.portrait) {
        // 横画面: 左パネル + 中央フィールド + 右ネクスト/ボタン
        const cell = Math.min((h * 0.60) / C.ROWS, (w * 0.55) / C.COLS);
        const fw = cell * C.COLS, fh = cell * C.ROWS;
        const topPad = cell * 2.15;              // スポーン領域（ウィンドウ内）
        const winBarH = Math.max(20, cell * 0.5); // ウィンドウタイトルバー
        const barsH = cell * 0.68;
        let fx = w * 0.60 - fw / 2;
        fx = Math.min(fx, w - fw - cell * 2.7);  // 右のネクストが収まるように
        const fy = h * 0.965 - fh;
        R.cell = cell;
        R.topPad = topPad;
        R.winBarH = winBarH;
        R.field = { x: fx, y: fy, w: fw, h: fh };
        R.bars = { x: fx, y: fy - topPad - winBarH - barsH - 12, w: fw, h: barsH };
        R.hud = { x: fx, y: Math.max(4, R.bars.y - h * 0.052), w: fw, h: h * 0.045 };
        R.panel = { x: w * 0.015, y: h * 0.09, w: fx - w * 0.05, h: h * 0.88 };
        R.next = { x: fx + fw + cell * 0.4, y: fy - topPad, w: cell * 1.7, h: cell * 6 };
        // 操作ボタン: フィールド右下の2列グリッド
        const margin = w - (fx + fw);
        const bs = Math.min(60, h * 0.09, (margin - 16) / 2.3);
        const bx = fx + fw + (margin - bs * 2.2) / 2;
        const by = h - bs * 3.75;
        R.buttons = {
          size: bs,
          pos: {
            left: { x: bx, y: by },
            right: { x: bx + bs * 1.2, y: by },
            soft: { x: bx, y: by + bs * 1.2 },
            rotate: { x: bx + bs * 1.2, y: by + bs * 1.2 },
            hard: { x: bx + bs * 0.6, y: by + bs * 2.4 },
          },
        };
      } else {
        // 縦画面: 上フィールド + 下キャラ + ボタン
        const cell = Math.min((w * 0.96) / C.COLS, (h * 0.37) / C.ROWS);
        const fw = cell * C.COLS, fh = cell * C.ROWS;
        const topPad = cell * 2.15;
        const winBarH = Math.max(16, cell * 0.5);
        const barsH = cell * 0.8;
        const fx = (w - fw) / 2;
        R.cell = cell;
        R.topPad = topPad;
        R.winBarH = winBarH;
        R.hud = { x: fx, y: h * 0.012, w: fw, h: h * 0.04 };
        R.next = { x: fx + fw - cell * 4.9, y: h * 0.06, w: cell * 6, h: cell * 1.6, horizontal: true };
        R.bars = { x: fx, y: h * 0.055 + cell * 1.75 + 8, w: fw, h: barsH };
        const fy = R.bars.y + barsH + winBarH + topPad + 10;
        R.field = { x: fx, y: fy, w: fw, h: fh };
        const btnH = Math.min(h * 0.14, 110);
        R.panel = { x: w * 0.26, y: fy + fh + h * 0.005, w: w * 0.48, h: Math.max(120, h - (fy + fh) - btnH - h * 0.02) };
        const bs = Math.min(86, w * 0.16);
        const ly = h - bs * 1.3, lx = w * 0.02;
        const rx = w - w * 0.02 - bs * 2.2;
        R.buttons = {
          size: bs,
          pos: {
            left: { x: lx, y: ly },
            right: { x: lx + bs * 1.15, y: ly },
            soft: { x: lx + bs * 2.3, y: ly },
            rotate: { x: rx, y: ly - bs * 0.55 },
            hard: { x: rx + bs * 1.15, y: ly },
          },
        };
      }
      this.rects = R;
      return R;
    },

    // ---- 背景 ----
    drawBackground(game) {
      const ctx = this.ctx;
      const pal = game.palette();
      let top = pal.skyTop, bot = pal.skyBot;
      if (pal.dawnTop && game.mode === 'story') {
        const t = U.ease(U.clamp(game.workProgress(), 0, 1));
        top = colorLerp(pal.skyTop, pal.dawnTop, t);
        bot = colorLerp(pal.skyBot, pal.dawnBot, t);
      }
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      if (typeof top === 'string' && top[0] === '#') {
        g.addColorStop(0, top); g.addColorStop(1, bot);
      } else {
        g.addColorStop(0, top); g.addColorStop(1, bot);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);

      // 星
      if (pal.stars > 0.01) {
        const tNow = performance.now() / 1000;
        ctx.fillStyle = '#fff';
        for (const s of this.starSeed) {
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(tNow * 0.8 + s.tw));
          ctx.globalAlpha = pal.stars * tw * 0.8;
          ctx.beginPath();
          ctx.arc(s.x * this.w, s.y * this.h, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // 街のシルエット
      const baseY = this.h;
      ctx.fillStyle = pal.city;
      for (const b of this.citySeed) {
        const bh = b.h * this.h * 0.9;
        ctx.fillRect(b.x * this.w, baseY - bh, b.w * this.w + 1, bh);
      }
      // 窓明かり
      ctx.fillStyle = 'rgba(255,220,140,0.5)';
      for (const b of this.citySeed) {
        if (b.win < 0.6) continue;
        const bh = b.h * this.h * 0.9;
        const cols = Math.max(1, Math.floor(b.w * this.w / 14));
        for (let i = 0; i < cols * 3; i++) {
          const wx = b.x * this.w + 3 + (i % cols) * 14;
          const wy = baseY - bh + 6 + Math.floor(i / cols) * 18;
          if ((i * 7 + Math.floor(b.win * 100)) % 3 === 0 && wy < baseY - 8) ctx.fillRect(wx, wy, 5, 7);
        }
      }

      // マッハタイム: 全体を暖色に
      if (game.mach) {
        ctx.fillStyle = 'rgba(255,180,80,0.09)';
        ctx.fillRect(0, 0, this.w, this.h);
      }
    },

    // ---- フィールド ----
    drawField(game) {
      const ctx = this.ctx;
      const R = this.rects;
      const f = R.field;
      const cell = R.cell;
      const field = game.field;
      const pal = game.palette();
      const beat = MB.music.getBeatPulse();

      // エディタ風ウィンドウフレーム（スポーン領域込み）
      const barH = R.winBarH;
      const topPad = R.topPad;
      const wy = f.y - topPad; // ウィンドウ内側の上端
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = game.mach ? '#3a2438' : '#262336';
      U.rr(ctx, f.x - 6, wy - barH - 6, f.w + 12, f.h + topPad + barH + 12, 10);
      ctx.fill();
      ctx.restore();
      // タイトルバー
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      U.rr(ctx, f.x - 6, wy - barH - 6, f.w + 12, barH, 10);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ['#ff6b6b', '#ffc94d', '#5dd97a'][i];
        ctx.beginPath();
        ctx.arc(f.x + 8 + i * 16, wy - barH / 2 - 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `${Math.round(barH * 0.5)}px ${this.FONT}`;
      ctx.textAlign = 'center';
      const title = game.mach ? '🔥 マッハタイム!! 🔥' : 'マロくん おしごとちゅう…';
      ctx.fillText(title, f.x + f.w / 2, wy - barH / 2 - 1);
      ctx.textAlign = 'left';

      // フィールド背景（スポーン領域は少し明るく）
      ctx.fillStyle = pal.fieldBg;
      ctx.fillRect(f.x, wy, f.w, f.h + topPad);
      // ポップな背景: ゆっくり流れる水玉 ＋ マロくんの透かし
      ctx.save();
      ctx.beginPath();
      ctx.rect(f.x, wy, f.w, f.h + topPad);
      ctx.clip();
      const bgT = performance.now() / 1000;
      const sp = cell * 1.15;
      const ox = (bgT * 7) % (sp * 2);
      const oy = (bgT * 4.5) % (sp * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let iy = -2; iy * sp < f.h + topPad + sp * 2; iy++) {
        for (let ix = -2; ix * sp < f.w + sp * 2; ix++) {
          const dx = f.x + ix * sp + ox;
          const dy = wy + iy * sp + oy;
          const big = (ix + iy) % 2 === 0;
          ctx.beginPath();
          ctx.arc(dx, dy, big ? cell * 0.1 : cell * 0.055, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // マロくんの顔の透かし
      const wcx = f.x + f.w / 2, wcy = f.y + f.h * 0.52;
      const wr = f.h * 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = Math.max(3, cell * 0.11);
      ctx.beginPath();
      ctx.ellipse(wcx, wcy, wr * 1.05, wr, 0, 0, Math.PI * 2);
      ctx.stroke();
      const gr2 = wr * 0.34;
      ctx.beginPath();
      ctx.ellipse(wcx - wr * 0.38, wcy - wr * 0.05, gr2, gr2 * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(wcx + wr * 0.38, wcy - wr * 0.05, gr2, gr2 * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wcx - wr * 0.38 + gr2, wcy - wr * 0.05);
      ctx.lineTo(wcx + wr * 0.38 - gr2, wcy - wr * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wcx, wcy + wr * 0.45, wr * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      // 中央がほんのり明るいビネット
      const vg = ctx.createRadialGradient(wcx, wcy, wr * 0.2, wcx, wcy, f.w * 0.7);
      vg.addColorStop(0, 'rgba(255,240,250,0.04)');
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(f.x, wy, f.w, f.h + topPad);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(f.x, wy, f.w, topPad);
      // 限界ライン（ここより上に積むとビルド失敗）
      ctx.strokeStyle = 'rgba(255,160,170,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + f.w, f.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // 薄いグリッド
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < C.COLS; x++) {
        ctx.moveTo(f.x + x * cell, f.y);
        ctx.lineTo(f.x + x * cell, f.y + f.h);
      }
      for (let y = 1; y < C.ROWS; y++) {
        ctx.moveTo(f.x, f.y + y * cell);
        ctx.lineTo(f.x + f.w, f.y + y * cell);
      }
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(f.x, wy, f.w, f.h + topPad);
      ctx.clip();

      // 危険警告
      const danger = field.maxHeight() >= C.ROWS - 2;
      if (danger && game.state === MB.STATE.PLAY) {
        const a = 0.12 + 0.1 * Math.sin(performance.now() / 130);
        ctx.fillStyle = `rgba(255,70,90,${a})`;
        ctx.fillRect(f.x, wy, f.w, topPad + cell * 2);
      }

      // ---- 置かれたマシュマロ（同色はむにっと融合、2×2はキングマシュマロ）----
      const grid = field.grid;
      // 予約領域（同色でつながった marked セル）を抽出
      const compOf = {};
      const comps = [];
      for (let y = 0; y < C.ROWS; y++) {
        for (let x = 0; x < C.COLS; x++) {
          const cd = grid[y][x];
          const key = y * C.COLS + x;
          if (!cd || !cd.marked || cd.sweeping || compOf[key] !== undefined) continue;
          const comp = { cells: [], color: cd.color, minX: x, minY: y, maxX: x, maxY: y, hasS: false };
          const stack = [[x, y]];
          compOf[key] = comps.length;
          while (stack.length) {
            const [sx2, sy2] = stack.pop();
            const c2 = grid[sy2][sx2];
            comp.cells.push([sx2, sy2]);
            comp.minX = Math.min(comp.minX, sx2); comp.maxX = Math.max(comp.maxX, sx2);
            comp.minY = Math.min(comp.minY, sy2); comp.maxY = Math.max(comp.maxY, sy2);
            if (c2.s) comp.hasS = true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = sx2 + dx, ny = sy2 + dy;
              if (nx < 0 || nx >= C.COLS || ny < 0 || ny >= C.ROWS) continue;
              const nk = ny * C.COLS + nx;
              const nc = grid[ny][nx];
              if (nc && nc.marked && !nc.sweeping && nc.color === comp.color && compOf[nk] === undefined) {
                compOf[nk] = comps.length;
                stack.push([nx, ny]);
              }
            }
          }
          comp.isKing = comp.cells.length === 4 &&
            (comp.maxX - comp.minX === 1) && (comp.maxY - comp.minY === 1);
          comps.push(comp);
        }
      }
      const inKing = (x, y) => {
        const id = compOf[y * C.COLS + x];
        return id !== undefined && comps[id].isKing;
      };

      // パスA: 個別マシュマロ（キング化した4つは飛ばす）
      for (let y = 0; y < C.ROWS; y++) {
        for (let x = 0; x < C.COLS; x++) {
          const cd = grid[y][x];
          if (!cd || inKing(x, y)) continue;
          const px = f.x + x * cell, py = f.y + y * cell;
          const sq = MB.draw.squash(cd);
          const rot = (((x * 13 + y * 7) % 9) - 4) * 0.014;
          MB.draw.marshmallow(ctx, px, py, cell, cd.color, {
            s: cd.s, sweeping: cd.sweeping, noFace: true,
            marked: cd.marked, sx: sq.sx, sy: sq.sy, rot,
          });
        }
      }
      // パスB: 同色・同状態の隣どうしをブリッジで融合
      const stateOf = (cd) => cd.color * 4 + ((cd.marked && !cd.sweeping) ? 2 : 0) + (cd.sweeping ? 1 : 0);
      for (let y = 0; y < C.ROWS; y++) {
        for (let x = 0; x < C.COLS; x++) {
          const cd = grid[y][x];
          if (!cd || inKing(x, y)) continue;
          const px = f.x + x * cell, py = f.y + y * cell;
          const right = x + 1 < C.COLS ? grid[y][x + 1] : null;
          if (right && !inKing(x + 1, y) && stateOf(right) === stateOf(cd)) {
            MB.draw.bridge(ctx, px, py, px + cell, py, cell, cd.color, cd.sweeping);
          }
          const down = y + 1 < C.ROWS ? grid[y + 1][x] : null;
          if (down && !inKing(x, y + 1) && stateOf(down) === stateOf(cd)) {
            MB.draw.bridge(ctx, px, py, px, py + cell, cell, cd.color, cd.sweeping);
          }
        }
      }
      // パスC: 予約領域の仕上げ（キングマシュマロ／領域の顔と光）
      for (const comp of comps) {
        const pulse = 1 + 0.04 * beat;
        if (comp.isKing) {
          const size = cell * 2 * pulse;
          const px = f.x + comp.minX * cell - (size - cell * 2) / 2;
          const py = f.y + comp.minY * cell - (size - cell * 2) / 2;
          MB.draw.marshmallow(ctx, px, py, size, comp.color, { round: 0.36, noFace: true, marked: true });
          const cx2 = px + size / 2, cy2 = py + size * 0.46;
          MB.draw.face(ctx, cx2, cy2, size * 0.5, beat);
          if (comp.hasS) {
            ctx.fillStyle = '#ff5c96';
            ctx.beginPath();
            ctx.arc(px + size * 0.8, py + size * 0.22, size * 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(size * 0.13)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', px + size * 0.8, py + size * 0.23);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          }
          ctx.strokeStyle = `rgba(255,235,150,${0.35 + 0.35 * beat})`;
          ctx.lineWidth = 3;
          U.rr(ctx, px + 2, py + 2, size - 4, size - 4, size * 0.33);
          ctx.stroke();
        } else {
          // 大きな連結領域: 中央にひとつ顔、外周はほんのり光る
          let cx2 = 0, cy2 = 0;
          for (const [x, y] of comp.cells) {
            cx2 += f.x + (x + 0.5) * cell;
            cy2 += f.y + (y + 0.5) * cell;
          }
          cx2 /= comp.cells.length; cy2 /= comp.cells.length;
          const fs = cell * Math.min(1.5, 0.95 + comp.cells.length * 0.05);
          MB.draw.face(ctx, cx2, cy2, fs, beat);
          ctx.strokeStyle = `rgba(255,235,150,${0.25 + 0.3 * beat})`;
          ctx.lineWidth = 2.5;
          const bx = f.x + comp.minX * cell, by = f.y + comp.minY * cell;
          U.rr(ctx, bx + 2, by + 2, (comp.maxX - comp.minX + 1) * cell - 4, (comp.maxY - comp.minY + 1) * cell - 4, cell * 0.4);
          ctx.stroke();
        }
      }

      // 分離落下中（落下スピードでびよーんと伸びる）
      for (const fal of field.fallers) {
        const stretch = U.clamp(1 + (fal.vy || 0) * 0.012, 1, 1.18);
        MB.draw.marshmallow(ctx, f.x + fal.x * cell, f.y + fal.y * cell, cell, fal.color, {
          s: fal.s, sy: stretch, sx: 2 - stretch,
        });
      }

      // 操作ピース＋ゴースト
      const p = field.piece;
      if (p && game.state === MB.STATE.PLAY) {
        const gy = field.ghostY();
        if (gy > p.y) {
          // 着地予測: 点線の枠だけ（マシュマロと見間違えないように）
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([7, 6]);
          U.rr(ctx, f.x + p.x * cell + 3, f.y + gy * cell + 3, cell * 2 - 6, cell * 2 - 6, cell * 0.45);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // なめらか移動＋動きに合わせてぷるんと傾く
        const vx = game.pieceVisX == null ? p.x : game.pieceVisX;
        const vy = game.pieceVisY == null ? p.y : game.pieceVisY;
        const wob = U.clamp((p.x - vx) * -0.2, -0.16, 0.16);
        const cellPos = [[0, 0, 0], [1, 1, 0], [2, 0, 1], [3, 1, 1]];
        for (const [i, dx, dy] of cellPos) {
          MB.draw.marshmallow(ctx, f.x + (vx + dx) * cell, f.y + (vy + dy) * cell, cell, p.cells[i].color, {
            s: p.cells[i].s, rot: wob + (i - 1.5) * 0.015,
          });
        }
        // ピース内の同色もむにっと融合
        for (const [a, b] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {
          if (p.cells[a].color !== p.cells[b].color) continue;
          const [, ax, ay] = cellPos[a];
          const [, bx2, by2] = cellPos[b];
          MB.draw.bridge(ctx,
            f.x + (vx + ax) * cell, f.y + (vy + ay) * cell,
            f.x + (vx + bx2) * cell, f.y + (vy + by2) * cell,
            cell, p.cells[a].color, false);
        }
      }

      // タイムライン（ビルドバー）
      if (game.state === MB.STATE.PLAY || game.state === MB.STATE.PAUSE) {
        const sx = f.x + (field.sweepX / C.COLS) * f.w;
        const grad = ctx.createLinearGradient(sx - cell * 2.2, 0, sx, 0);
        const col = game.mach ? '255,200,90' : '150,220,255';
        grad.addColorStop(0, `rgba(${col},0)`);
        grad.addColorStop(1, `rgba(${col},0.28)`);
        ctx.fillStyle = grad;
        ctx.fillRect(sx - cell * 2.2, f.y, cell * 2.2, f.h);
        ctx.strokeStyle = `rgba(${col},0.9)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, f.y);
        ctx.lineTo(sx, f.y + f.h);
        ctx.stroke();
        // ヘッド
        ctx.fillStyle = `rgba(${col},1)`;
        ctx.beginPath();
        ctx.moveTo(sx - 6, f.y - 8);
        ctx.lineTo(sx + 6, f.y - 8);
        ctx.lineTo(sx, f.y + 2);
        ctx.closePath();
        ctx.fill();
        // 回収カウンタ
        if (field.sweepGroup.length > 0) {
          ctx.font = `bold ${Math.round(cell * 0.6)}px ${this.FONT}`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText(`${field.sweepGroup.length}`, sx, f.y - cell * 0.4);
          ctx.textAlign = 'left';
        }
      }
      ctx.restore();
    },

    // ---- ネクスト ----
    drawNext(game) {
      const ctx = this.ctx;
      const R = this.rects;
      const n = R.next;
      const cell = R.cell * 0.62;
      ctx.fillStyle = 'rgba(20,18,38,0.55)';
      ctx.font = `bold ${Math.round(cell * 0.62)}px ${this.FONT}`;
      if (n.horizontal) {
        U.rr(ctx, n.x - 6, n.y - 6, cell * 7.6, cell * 2.6 + 12, 8);
        ctx.fill();
        game.queue.slice(0, 3).forEach((pc, i) => {
          const px = n.x + i * cell * 2.6, py = n.y;
          const scale = i === 0 ? 1 : 0.82;
          this.drawMiniPiece(pc, px, py, cell * scale);
        });
      } else {
        U.rr(ctx, n.x - 6, n.y - 6, cell * 2 + 12, cell * 7.4 + 12, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('つぎ', n.x, n.y - 12);
        game.queue.slice(0, 3).forEach((pc, i) => {
          const px = n.x, py = n.y + i * cell * 2.6;
          const scale = i === 0 ? 1 : 0.82;
          this.drawMiniPiece(pc, px, py, cell * scale);
        });
      }
    },

    drawMiniPiece(pc, x, y, cell) {
      const ctx = this.ctx;
      for (const [i, dx, dy] of [[0, 0, 0], [1, 1, 0], [2, 0, 1], [3, 1, 1]]) {
        MB.draw.marshmallow(ctx, x + dx * cell, y + dy * cell, cell, pc.cells[i].color, { s: pc.cells[i].s });
      }
    },

    // ---- HUD（スコア/進捗/ノリゲージ） ----
    drawHud(game) {
      const ctx = this.ctx;
      const R = this.rects;
      const hud = R.hud;
      const fsize = Math.max(13, Math.round(hud.h * 0.62));

      ctx.font = `bold ${fsize}px ${this.FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      // 左: ステージ情報
      let label;
      if (game.mode === 'story') {
        const st = game.stage;
        label = `${st.time}  ${st.name}`;
      } else {
        label = `エンドレス  Lv.${game.endlessLoop + 1}`;
      }
      ctx.fillText(label, hud.x, hud.y + fsize);
      // 右: スコア（右上の音量ボタンを避ける）
      ctx.textAlign = 'right';
      ctx.fillText(`スコア ${U.fmtScore(game.score)}`, Math.min(hud.x + hud.w, this.w - 100), hud.y + fsize);
      ctx.textAlign = 'left';

      // バー（進捗＋ノリ）
      const b = R.bars;
      const halfH = b.h * 0.46;
      // 進捗バー
      const prog = game.mode === 'story' ? U.clamp(game.workProgress(), 0, 1) : null;
      ctx.fillStyle = 'rgba(15,14,30,0.6)';
      U.rr(ctx, b.x, b.y, b.w, halfH, halfH / 2);
      ctx.fill();
      if (prog !== null) {
        const grad = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
        grad.addColorStop(0, '#67d98a');
        grad.addColorStop(1, '#b0f0a0');
        ctx.fillStyle = grad;
        if (prog > 0.005) {
          U.rr(ctx, b.x + 2, b.y + 2, Math.max(halfH, (b.w - 4) * prog), halfH - 4, (halfH - 4) / 2);
          ctx.fill();
        }
        ctx.font = `bold ${Math.round(halfH * 0.78)}px ${this.FONT}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`おしごと ${Math.floor(prog * 100)}%`, b.x + 8, b.y + halfH * 0.8);
      } else {
        // エンドレス: 次スキンまで
        const t = game.skinProgress();
        ctx.fillStyle = '#7fd4ff';
        if (t > 0.01) {
          U.rr(ctx, b.x + 2, b.y + 2, Math.max(halfH, (b.w - 4) * t), halfH - 4, (halfH - 4) / 2);
          ctx.fill();
        }
        ctx.font = `bold ${Math.round(halfH * 0.78)}px ${this.FONT}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`つぎの じかんまで`, b.x + 8, b.y + halfH * 0.8);
      }

      // ノリゲージ / マッハタイム残り
      const y2 = b.y + b.h * 0.54;
      ctx.fillStyle = 'rgba(15,14,30,0.6)';
      U.rr(ctx, b.x, y2, b.w, halfH, halfH / 2);
      ctx.fill();
      if (game.mach) {
        const t = game.machRemain01();
        const hue = (performance.now() / 6) % 360;
        ctx.fillStyle = `hsl(${hue},90%,65%)`;
        if (t > 0.01) {
          U.rr(ctx, b.x + 2, y2 + 2, Math.max(halfH, (b.w - 4) * t), halfH - 4, (halfH - 4) / 2);
          ctx.fill();
        }
        ctx.font = `bold ${Math.round(halfH * 0.78)}px ${this.FONT}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`マッハタイム!! ×2`, b.x + 8, y2 + halfH * 0.8);
      } else {
        const t = game.flowGauge / 100;
        const grad = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
        grad.addColorStop(0, '#ff9ec6');
        grad.addColorStop(1, '#ffd0a0');
        ctx.fillStyle = grad;
        if (t > 0.01) {
          U.rr(ctx, b.x + 2, y2 + 2, Math.max(halfH, (b.w - 4) * t), halfH - 4, (halfH - 4) / 2);
          ctx.fill();
        }
        ctx.font = `bold ${Math.round(halfH * 0.78)}px ${this.FONT}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`ノリ`, b.x + 8, y2 + halfH * 0.8);
      }
    },

    // ---- 操作ボタン（マウス/タッチ共用・常時表示） ----
    drawTouchButtons(game) {
      const ctx = this.ctx;
      const B = this.rects.buttons;
      const s = B.size;
      ctx.font = `bold ${Math.round(s * 0.42)}px ${this.FONT}`;
      const drawBtn = (bx, by, label, active) => {
        ctx.fillStyle = active ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.arc(bx + s / 2, by + s / 2, s / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + s / 2, by + s / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      };
      const bt = game.input.touchButtons;
      for (const b of bt) drawBtn(b.x, b.y, b.label, b.pressed);
      // ボタンの説明ラベル
      const caps = { left: 'いどう', right: 'いどう', soft: 'ゆっくり', rotate: 'まわす', hard: 'ストン' };
      ctx.font = `bold ${Math.round(s * 0.2)}px ${this.FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.textAlign = 'center';
      for (const b of bt) {
        ctx.fillText(caps[b.id], b.x + s / 2, b.y + s + s * 0.26);
      }
      ctx.textAlign = 'left';
    },

    // メイン描画（PLAY中）
    drawGame(game) {
      const ctx = this.ctx;
      ctx.save();
      // 画面シェイク
      if (MB.fx.shakeT > 0) {
        const a = MB.fx.shakeT / 0.3 * MB.fx.shakeAmp;
        ctx.translate(U.rand(-a, a), U.rand(-a, a));
      } else {
        MB.fx.shakeAmp = 0;
      }

      this.drawBackground(game);

      // キャラクターパネル
      MB.character.draw(ctx, this.rects.panel, game.palette(), {
        progress: game.mode === 'story' ? game.workProgress() : (game.flowGauge / 100),
        mini: this.portrait,
      });

      this.drawField(game);
      this.drawNext(game);
      this.drawHud(game);
      MB.fx.draw(ctx);
      this.drawTouchButtons(game);

      // フラッシュ
      if (MB.fx.flash > 0) {
        ctx.fillStyle = `rgba(255,250,235,${MB.fx.flash * 0.5})`;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      ctx.restore();
    },
  };
})();
