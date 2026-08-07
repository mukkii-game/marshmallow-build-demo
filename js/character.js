// マシュマロビルド - プログラマーくん（キャラクター描画・アニメ）
window.MB = window.MB || {};

(function () {
  const U = MB.util;

  MB.character = {
    mood: 'idle',      // idle | flow | mach | worried | sleepy | happy | ko | beach
    typePhase: 0,      // タイピングアニメ位相
    blinkT: 0,
    blinkNext: 2,
    munch: 0,          // 0..1 もぐもぐ中
    cheek: 0,          // 頬のふくらみ
    bob: 0,
    zzz: 0,
    monitorSpin: 0,    // ワイヤーフレームマシュマロ回転
    flying: [],        // 口へ飛ぶマシュマロ {from:{x,y}, to:{x,y}, t, dur, color, s}
    mouthPos: { x: 0, y: 0 },
    eatenCount: 0,

    reset() {
      this.mood = 'idle';
      this.flying = [];
      this.munch = 0;
      this.cheek = 0;
      this.eatenCount = 0;
      this.zzz = 0;
    },

    // マシュマロを口へ飛ばす（fromは画面座標）
    feed(from, color, s, delay) {
      this.flying.push({
        from: { x: from.x, y: from.y },
        to: null, // 描画時の口位置で解決
        t: -(delay || 0),
        dur: U.rand(0.45, 0.62),
        color, s,
        arc: U.rand(60, 140),
        size: U.rand(0.8, 1.1),
      });
    },

    update(dt) {
      const speed = this.mood === 'mach' ? 26 : this.mood === 'flow' ? 15 :
                    this.mood === 'sleepy' ? 3 : this.mood === 'ko' ? 0 : 8;
      this.typePhase += dt * speed;
      this.bob += dt * (this.mood === 'mach' ? 6 : 2);
      this.monitorSpin += dt * (this.mood === 'mach' ? 3.2 : 1.1);

      this.blinkT += dt;
      if (this.blinkT > this.blinkNext) {
        this.blinkT = 0;
        this.blinkNext = U.rand(1.6, 4.5);
      }

      if (this.munch > 0) this.munch = Math.max(0, this.munch - dt * 3.2);
      if (this.cheek > 0) this.cheek = Math.max(0, this.cheek - dt * 0.35);
      if (this.mood === 'sleepy') this.zzz += dt; else this.zzz = 0;

      // 飛行マシュマロ
      for (const f of this.flying) {
        f.t += dt;
        if (f.to === null) f.to = { x: this.mouthPos.x, y: this.mouthPos.y };
      }
      const arrived = this.flying.filter((f) => f.t >= f.dur);
      if (arrived.length) {
        this.flying = this.flying.filter((f) => f.t < f.dur);
        for (const f of arrived) {
          this.munch = 1;
          this.cheek = Math.min(1, this.cheek + 0.34);
          this.eatenCount++;
          if (MB.sfx && MB.audio.ctx) MB.sfx.munch();
          if (MB.fx) MB.fx.crumbs(this.mouthPos.x, this.mouthPos.y, f.color);
        }
      }
    },

    flyPos(f) {
      const t = U.clamp(f.t / f.dur, 0, 1);
      const e = U.ease(t);
      const to = f.to || this.mouthPos;
      const mx = (f.from.x + to.x) / 2;
      const my = Math.min(f.from.y, to.y) - f.arc;
      // 2次ベジェ
      const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * my + e * e * to.y;
      return { x, y, t };
    },

    // rect: {x,y,w,h} パネル領域。palette: ステージ配色
    draw(ctx, rect, palette, opts) {
      opts = opts || {};
      const s = Math.min(rect.w / 300, rect.h / 420); // 基準スケール
      const cx = rect.x + rect.w / 2;

      ctx.save();

      // ---- モニター（上部）: 回転ポリゴンマシュマロ ----
      const mw = Math.min(rect.w * 0.86, 270 * s * 1.2);
      const mh = mw * 0.62;
      const mx = cx - mw / 2;
      const my = rect.y + rect.h * 0.02;
      this.drawMonitor(ctx, mx, my, mw, mh, palette, opts);

      // ---- デスク＋キャラクター（下部） ----
      const deskY = rect.y + rect.h * 0.88;
      const charCx = cx;
      const charScale = s * (opts.mini ? 0.8 : 1);
      this.drawProgrammer(ctx, charCx, deskY, charScale, palette, rect);

      // 飛行中マシュマロ
      for (const f of this.flying) {
        if (f.t < 0) continue;
        const p = this.flyPos(f);
        const r = 10 * s * f.size * (1 - p.t * 0.25);
        MB.draw.marshmallow(ctx, p.x - r, p.y - r, r * 2, f.color, { s: f.s, round: 0.5 });
      }

      ctx.restore();
    },

    drawMonitor(ctx, x, y, w, h, palette, opts) {
      const r = Math.min(w, h) * 0.06;
      // 本体
      ctx.fillStyle = '#232433';
      U.rr(ctx, x - 6, y - 6, w + 12, h + 12, r + 6);
      ctx.fill();
      // 画面
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#101322');
      grad.addColorStop(1, '#181d33');
      ctx.fillStyle = grad;
      U.rr(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.save();
      U.rr(ctx, x, y, w, h, r);
      ctx.clip();

      // コード行（進捗で増える）
      const progress = opts.progress || 0;
      const lines = 7;
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < lines; i++) {
        const ly = y + h * 0.12 + i * h * 0.085;
        const full = w * (0.22 + ((i * 37) % 40) / 100);
        const shown = U.clamp(progress * lines - i, 0, 1);
        if (shown <= 0) break;
        ctx.fillStyle = ['#7fd4ff', '#b48cff', '#8cf0c8', '#ffd9a0'][i % 4];
        ctx.fillRect(x + w * 0.07 + (i % 3) * w * 0.05, ly, full * shown * 0.8, h * 0.035);
      }
      ctx.globalAlpha = 1;

      // カーソル点滅
      if (Math.sin(performance.now() / 280) > 0) {
        const doneLines = Math.floor(U.clamp(progress, 0, 1) * lines);
        const cy = y + h * 0.12 + Math.min(doneLines, lines - 1) * h * 0.085;
        ctx.fillStyle = '#e8ecff';
        ctx.fillRect(x + w * 0.07, cy, w * 0.018, h * 0.045);
      }

      // 回転ワイヤーフレームマシュマロ（右側に浮かぶ）
      const wx = x + w * 0.72, wy = y + h * 0.5, wr = h * 0.3;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = Math.max(1, wr * 0.05);
      ctx.globalAlpha = 0.9;
      this.wireMallow(ctx, wx, wy, wr, this.monitorSpin);
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    // 円筒マシュマロのワイヤーフレーム
    wireMallow(ctx, cx, cy, r, spin) {
      const N = 10;
      const H = r * 1.1;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + spin;
        pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
      }
      const proj = (px, pz, py) => {
        const persp = 1 + pz / (r * 6);
        const tilt = 0.42; // 上から少し覗く
        return {
          x: cx + px * persp,
          y: cy + py * persp - pz * tilt * 0.4,
        };
      };
      // 上面・下面
      for (const py of [-H / 2, H / 2]) {
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const p = pts[i % N];
          const q = proj(p.x, p.z, py);
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      }
      // 縦線
      for (let i = 0; i < N; i += 2) {
        const p = pts[i];
        const a = proj(p.x, p.z, -H / 2);
        const b = proj(p.x, p.z, H / 2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    },

    drawProgrammer(ctx, cx, deskY, s, palette, rect, opts2) {
      const beach = !!(opts2 && opts2.beach);
      const mood = this.mood;
      const bobY = Math.sin(this.bob) * 3 * s;
      const bodyW = 150 * s, bodyH = 120 * s;
      const bodyY = deskY - bodyH * 0.55 + bobY;

      ctx.save();

      // マッハ時のスピード線
      if (mood === 'mach') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2 * s;
        for (let i = 0; i < 6; i++) {
          const ly = deskY - U.rand(20, 150) * s;
          const lx = cx + U.rand(-130, 130) * s;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx - U.rand(20, 60) * s, ly);
          ctx.stroke();
        }
      }

      // ---- 体（まるっと） ----
      const shirt = mood === 'mach' ? '#ffe9b8' : '#cfe6d8';
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(cx, bodyY, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,60,0.25)';
      ctx.lineWidth = 2 * s;
      ctx.stroke();

      // ---- 頭 ----
      const headR = 52 * s;
      const headY = bodyY - bodyH / 2 - headR * 0.55;
      const skin = '#ffe0c2';
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(cx, headY, headR * 1.05, headR, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 髪（短め）
      ctx.fillStyle = '#4a3b2e';
      ctx.beginPath();
      ctx.ellipse(cx, headY - headR * 0.55, headR * 0.92, headR * 0.5, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // 頬（マシュマロ食べたらふくらむ）
      const cheekR = headR * (0.22 + this.cheek * 0.25);
      ctx.fillStyle = 'rgba(255,160,160,0.5)';
      ctx.beginPath();
      ctx.ellipse(cx - headR * 0.62, headY + headR * 0.28, cheekR, cheekR * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + headR * 0.62, headY + headR * 0.28, cheekR, cheekR * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // メガネ
      const gy = headY + headR * 0.02;
      const gr = headR * 0.34;
      ctx.strokeStyle = '#39364a';
      ctx.lineWidth = 3.5 * s;
      ctx.beginPath();
      ctx.ellipse(cx - headR * 0.38, gy, gr, gr * 0.85, 0, 0, Math.PI * 2);
      ctx.moveTo(cx + headR * 0.38 + gr, gy);
      ctx.ellipse(cx + headR * 0.38, gy, gr, gr * 0.85, 0, 0, Math.PI * 2);
      ctx.moveTo(cx - headR * 0.38 + gr, gy);
      ctx.lineTo(cx + headR * 0.38 - gr, gy);
      ctx.stroke();
      // レンズ反射（マッハで光る）
      if (mood === 'mach' || mood === 'flow') {
        ctx.fillStyle = mood === 'mach' ? 'rgba(255,255,210,0.6)' : 'rgba(200,230,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(cx - headR * 0.38, gy, gr * 0.9, gr * 0.75, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + headR * 0.38, gy, gr * 0.9, gr * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 目
      const blink = this.blinkT < 0.12 || mood === 'sleepy' || mood === 'ko';
      ctx.fillStyle = '#2c2a3a';
      if (mood === 'happy' || mood === 'beach') {
        // にっこり
        ctx.strokeStyle = '#2c2a3a';
        ctx.lineWidth = 3 * s;
        for (const dx of [-0.38, 0.38]) {
          ctx.beginPath();
          ctx.arc(cx + headR * dx, gy + gr * 0.1, gr * 0.4, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
      } else if (blink) {
        ctx.strokeStyle = '#2c2a3a';
        ctx.lineWidth = 2.5 * s;
        for (const dx of [-0.38, 0.38]) {
          ctx.beginPath();
          ctx.moveTo(cx + headR * dx - gr * 0.35, gy);
          ctx.lineTo(cx + headR * dx + gr * 0.35, gy);
          ctx.stroke();
        }
      } else {
        for (const dx of [-0.38, 0.38]) {
          ctx.beginPath();
          ctx.ellipse(cx + headR * dx, gy, gr * 0.22, gr * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 口（もぐもぐ）
      const mouthY = headY + headR * 0.5;
      this.mouthPos = { x: cx, y: mouthY };
      ctx.fillStyle = '#a3574f';
      ctx.beginPath();
      if (this.munch > 0) {
        const open = 0.5 + 0.5 * Math.sin(this.munch * Math.PI * 4);
        ctx.ellipse(cx, mouthY, headR * 0.16, headR * (0.05 + 0.13 * open), 0, 0, Math.PI * 2);
      } else if (mood === 'worried') {
        ctx.ellipse(cx, mouthY + headR * 0.03, headR * 0.14, headR * 0.05, 0, Math.PI, Math.PI * 2);
      } else if (mood === 'happy' || mood === 'beach' || mood === 'flow' || mood === 'mach') {
        ctx.ellipse(cx, mouthY - headR * 0.02, headR * 0.16, headR * 0.1, 0, 0, Math.PI);
      } else {
        ctx.ellipse(cx, mouthY, headR * 0.1, headR * 0.045, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      // 汗（worried）
      if (mood === 'worried') {
        ctx.fillStyle = 'rgba(140,200,255,0.9)';
        const swT = (this.bob * 2) % 1;
        ctx.beginPath();
        ctx.ellipse(cx + headR * 0.95, headY - headR * 0.3 + swT * 14 * s, 4.5 * s, 6.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Zzz（sleepy）
      if (mood === 'sleepy' && this.zzz > 0.5) {
        ctx.fillStyle = 'rgba(220,225,255,0.85)';
        ctx.font = `${Math.round(16 * s)}px sans-serif`;
        const zt = (this.zzz % 2) / 2;
        ctx.fillText('z', cx + headR * 1.0, headY - headR * 0.4 - zt * 18 * s);
        if (zt > 0.4) ctx.fillText('Z', cx + headR * 1.25, headY - headR * 0.7 - zt * 24 * s);
      }

      if (beach) {
        // ビーチ: くつろぎの腕 ＋ マシュマロを持つ
        ctx.strokeStyle = shirt;
        ctx.lineWidth = 16 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - bodyW * 0.34, bodyY + 4 * s);
        ctx.lineTo(cx - bodyW * 0.52, bodyY + 42 * s);
        ctx.moveTo(cx + bodyW * 0.34, bodyY + 4 * s);
        ctx.lineTo(cx + bodyW * 0.44, headY + headR * 0.72);
        ctx.stroke();
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(cx - bodyW * 0.52, bodyY + 42 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + bodyW * 0.44, headY + headR * 0.72, 8 * s, 7 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // 手の上のマシュマロ
        MB.draw.marshmallow(ctx, cx + bodyW * 0.44 - 11 * s, headY + headR * 0.72 - 24 * s, 22 * s, 0, { round: 0.42 });
        ctx.restore();
        return;
      }

      // ---- デスク ----
      ctx.fillStyle = '#6b4f3a';
      U.rr(ctx, cx - 160 * s, deskY - 8 * s, 320 * s, 16 * s, 6 * s);
      ctx.fill();

      // ノートPC
      const lapW = 95 * s;
      ctx.fillStyle = '#3a3d52';
      U.rr(ctx, cx - lapW / 2, deskY - 46 * s, lapW, 38 * s, 4 * s); // 画面
      ctx.fill();
      ctx.fillStyle = mood === 'mach' ? '#9fd8ff' : '#7aa8d8';
      U.rr(ctx, cx - lapW / 2 + 4 * s, deskY - 42 * s, lapW - 8 * s, 30 * s, 3 * s);
      ctx.fill();
      ctx.fillStyle = '#494d66';
      U.rr(ctx, cx - lapW / 2 - 6 * s, deskY - 10 * s, lapW + 12 * s, 8 * s, 3 * s); // キーボード
      ctx.fill();

      // ---- 腕（タイピング） ----
      ctx.strokeStyle = shirt;
      ctx.lineWidth = 16 * s;
      ctx.lineCap = 'round';
      const typeL = Math.sin(this.typePhase * 2) * 5 * s;
      const typeR = Math.sin(this.typePhase * 2 + Math.PI) * 5 * s;
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 0.32, bodyY + 10 * s);
      ctx.lineTo(cx - lapW * 0.3, deskY - 12 * s + typeL);
      ctx.moveTo(cx + bodyW * 0.32, bodyY + 10 * s);
      ctx.lineTo(cx + lapW * 0.3, deskY - 12 * s + typeR);
      ctx.stroke();
      // 手
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(cx - lapW * 0.3, deskY - 12 * s + typeL, 8 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + lapW * 0.3, deskY - 12 * s + typeR, 8 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // ---- マシュマロ袋（Sマーク） ----
      const bagX = cx + 118 * s, bagY = deskY - 30 * s;
      ctx.fillStyle = '#fff';
      U.rr(ctx, bagX - 22 * s, bagY - 4 * s, 44 * s, 34 * s, 8 * s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,100,130,0.4)';
      ctx.lineWidth = 1.5 * s;
      U.rr(ctx, bagX - 22 * s, bagY - 4 * s, 44 * s, 34 * s, 8 * s);
      ctx.stroke();
      ctx.fillStyle = '#ff6b9e';
      ctx.font = `bold ${Math.round(20 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', bagX, bagY + 13 * s);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      ctx.restore();
    },
  };
})();
