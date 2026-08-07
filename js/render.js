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
    // x,y,size: 左上とセルサイズ
    marshmallow(ctx, x, y, size, color, opts) {
      opts = opts || {};
      const pad = size * 0.05;
      const bx = x + pad, by = y + pad, bs = size - pad * 2;
      const r = bs * (opts.round == null ? 0.34 : opts.round);
      const white = color === C.WHITE;
      let fill = white ? '#fdf6ee' : '#ffc6da';
      let shade = white ? '#e6d6c6' : '#eb9dbc';
      if (opts.sweeping) {
        fill = white ? '#efe9e4' : '#e8c3d1';
      }
      // 本体
      U.rr(ctx, bx, by, bs, bs, r);
      ctx.fillStyle = fill;
      ctx.fill();
      // 下側の焼き色シェード
      ctx.save();
      U.rr(ctx, bx, by, bs, bs, r);
      ctx.clip();
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(bx + bs / 2, by + bs * 1.12, bs * 0.62, bs * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // ハイライト
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(bx + bs * 0.32, by + bs * 0.26, bs * 0.2, bs * 0.13, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;

      // 予約マーク: ぷるぷる顔
      if (opts.marked && !opts.sweeping) {
        const ex = bx + bs / 2, ey = by + bs * 0.48;
        ctx.fillStyle = 'rgba(70,50,60,0.75)';
        ctx.beginPath();
        ctx.ellipse(ex - bs * 0.16, ey, bs * 0.05, bs * 0.07, 0, 0, Math.PI * 2);
        ctx.ellipse(ex + bs * 0.16, ey, bs * 0.05, bs * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,50,60,0.7)';
        ctx.lineWidth = Math.max(1, bs * 0.04);
        ctx.beginPath();
        ctx.arc(ex, ey + bs * 0.1, bs * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }

      // Sマーク
      if (opts.s) {
        ctx.fillStyle = '#ff5c96';
        ctx.beginPath();
        ctx.arc(bx + bs * 0.5, by + bs * 0.5, bs * 0.26, 0, Math.PI * 2);
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(bs * 0.38)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', bx + bs * 0.5, by + bs * 0.54);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
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
    FONT: `'Segoe UI', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', 'Meiryo', sans-serif`,
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
        // 横画面: 左パネル + 中央フィールド + 右ネクスト
        const cell = Math.min((h * 0.585) / C.ROWS, (w * 0.54) / C.COLS);
        const fw = cell * C.COLS, fh = cell * C.ROWS;
        const topPad = cell * 2.2;               // スポーン領域（ウィンドウ内）
        const winBarH = Math.max(20, cell * 0.55); // ウィンドウタイトルバー
        const barsH = cell * 0.82;
        let fx = w * 0.60 - fw / 2;
        fx = Math.min(fx, w - fw - cell * 2.7);  // 右のネクストが収まるように
        const fy = h * 0.97 - fh;
        R.cell = cell;
        R.topPad = topPad;
        R.winBarH = winBarH;
        R.field = { x: fx, y: fy, w: fw, h: fh };
        R.bars = { x: fx, y: fy - topPad - winBarH - barsH - 14, w: fw, h: barsH };
        R.hud = { x: fx, y: R.bars.y - h * 0.055, w: fw, h: h * 0.05 };
        R.panel = { x: w * 0.015, y: h * 0.09, w: fx - w * 0.05, h: h * 0.88 };
        R.next = { x: fx + fw + cell * 0.45, y: fy - topPad, w: cell * 1.7, h: cell * 6 };
        const bw = Math.min(74, h * 0.12);
        R.buttons = {
          size: bw,
          left: { x: w * 0.01 + bw * 0.1, y: h - bw * 1.25 },
          right: { x: w - bw * 2.4, y: h - bw * 1.25 },
        };
      } else {
        // 縦画面: 上フィールド + 下キャラ + ボタン
        const cell = Math.min((w * 0.96) / C.COLS, (h * 0.35) / C.ROWS);
        const fw = cell * C.COLS, fh = cell * C.ROWS;
        const topPad = cell * 2.2;
        const winBarH = Math.max(16, cell * 0.55);
        const barsH = cell * 0.9;
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
        const bw = Math.min(86, w * 0.16);
        R.buttons = {
          size: bw,
          left: { x: w * 0.02, y: h - bw * 1.3 },
          right: { x: w - w * 0.02 - bw * 2.2, y: h - bw * 1.3 },
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
      const title = game.mach ? 'build.mash — マッハビルド中!!' : 'build.mash — コンパイル中…';
      ctx.fillText(title, f.x + f.w / 2, wy - barH / 2 - 1);
      ctx.textAlign = 'left';

      // フィールド背景（スポーン領域は少し明るく）
      ctx.fillStyle = pal.fieldBg;
      ctx.fillRect(f.x, wy, f.w, f.h + topPad);
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

      // 置かれたマシュマロ
      for (let y = 0; y < C.ROWS; y++) {
        for (let x = 0; x < C.COLS; x++) {
          const cellData = field.grid[y][x];
          if (!cellData) continue;
          let px = f.x + x * cell, py = f.y + y * cell;
          let size = cell;
          if (cellData.marked && !cellData.sweeping) {
            const pulse = 1 + 0.05 * beat;
            const d = cell * (pulse - 1) / 2;
            px -= d; py -= d; size = cell * pulse;
          }
          MB.draw.marshmallow(ctx, px, py, size, cellData.color, {
            s: cellData.s, marked: cellData.marked, sweeping: cellData.sweeping,
          });
          if (cellData.marked && !cellData.sweeping) {
            ctx.strokeStyle = `rgba(255,235,150,${0.35 + 0.35 * beat})`;
            ctx.lineWidth = 2;
            U.rr(ctx, px + 1, py + 1, size - 2, size - 2, size * 0.3);
            ctx.stroke();
          }
        }
      }

      // 分離落下中
      for (const fal of field.fallers) {
        MB.draw.marshmallow(ctx, f.x + fal.x * cell, f.y + fal.y * cell, cell, fal.color, { s: fal.s });
      }

      // 操作ピース＋ゴースト
      const p = field.piece;
      if (p && game.state === MB.STATE.PLAY) {
        const gy = field.ghostY();
        if (gy > p.y) {
          ctx.globalAlpha = 0.22;
          for (const [i, dx, dy] of [[0, 0, 0], [1, 1, 0], [2, 0, 1], [3, 1, 1]]) {
            MB.draw.marshmallow(ctx, f.x + (p.x + dx) * cell, f.y + (gy + dy) * cell, cell, p.cells[i].color, {});
          }
          ctx.globalAlpha = 1;
        }
        const yOff = game.softDropping ? 0 : (1 - game.gravityT()) * 0; // グリッドスナップ
        for (const [i, dx, dy] of [[0, 0, 0], [1, 1, 0], [2, 0, 1], [3, 1, 1]]) {
          MB.draw.marshmallow(ctx, f.x + (p.x + dx) * cell, f.y + (p.y + dy + yOff) * cell, cell, p.cells[i].color, { s: p.cells[i].s });
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
      // 右: スコア
      ctx.textAlign = 'right';
      ctx.fillText(`SCORE ${U.fmtScore(game.score)}`, hud.x + hud.w, hud.y + fsize);
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
        ctx.fillText(`進捗 ${Math.floor(prog * 100)}%`, b.x + 8, b.y + halfH * 0.8);
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
        ctx.fillText(`つぎの時間帯まで`, b.x + 8, b.y + halfH * 0.8);
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

    // ---- タッチボタン ----
    drawTouchButtons(game) {
      if (!game.touchMode) return;
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
