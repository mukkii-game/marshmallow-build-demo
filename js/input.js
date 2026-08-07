// マシュマロビルド - 入力（キーボード / タッチ / マウス）
window.MB = window.MB || {};

(function () {
  const U = MB.util;

  const DAS_DELAY = 0.17;  // 横移動オートリピート開始
  const DAS_REPEAT = 0.045;

  MB.input = {
    game: null,
    touchButtons: [],
    heldDir: 0,           // -1/0/1
    dasT: 0,
    dasRepeating: false,
    softHeld: false,
    fieldGesture: null,   // {id, sx, sy, lastCellX, t, moved}
    pointers: new Map(),

    init(canvas, game) {
      this.game = game;

      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));

      canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
      canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
      canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    layoutButtons() {
      const R = MB.render.rects;
      if (!R.buttons) return;
      const s = R.buttons.size;
      const L = R.buttons.left, Rt = R.buttons.right;
      const keep = new Map(this.touchButtons.map((b) => [b.id, b.pressed]));
      this.touchButtons = [
        { id: 'left', label: '◀', x: L.x, y: L.y, r: s / 2 },
        { id: 'right', label: '▶', x: L.x + s * 1.15, y: L.y, r: s / 2 },
        { id: 'soft', label: '▼', x: L.x + s * 2.3, y: L.y, r: s / 2 },
        { id: 'rotate', label: '⟳', x: Rt.x, y: Rt.y - s * 0.55, r: s / 2 },
        { id: 'hard', label: '⤓', x: Rt.x + s * 1.15, y: Rt.y, r: s / 2 },
      ];
      for (const b of this.touchButtons) {
        b.size = s;
        b.pressed = keep.get(b.id) || false;
      }
    },

    onKey(e, down) {
      const g = this.game;
      if (!g) return;
      if (e.repeat) { e.preventDefault(); return; }
      const k = e.key;
      let handled = true;
      if (down) {
        switch (k) {
          case 'ArrowLeft': this.startMove(-1); break;
          case 'ArrowRight': this.startMove(1); break;
          case 'ArrowDown': this.softHeld = true; g.action('softStart'); break;
          case 'ArrowUp': case 'x': case 'X': g.action('rotateCW'); break;
          case 'z': case 'Z': g.action('rotateCCW'); break;
          case ' ': g.action('hard'); break;
          case 'p': case 'P': case 'Escape': g.action('pause'); break;
          case 'm': case 'M': g.action('mute'); break;
          case 'Enter': g.action('confirm'); break;
          default: handled = false;
        }
      } else {
        switch (k) {
          case 'ArrowLeft': if (this.heldDir === -1) this.stopMove(); break;
          case 'ArrowRight': if (this.heldDir === 1) this.stopMove(); break;
          case 'ArrowDown': this.softHeld = false; g.action('softEnd'); break;
          default: handled = false;
        }
      }
      if (handled) e.preventDefault();
    },

    startMove(dir) {
      this.heldDir = dir;
      this.dasT = 0;
      this.dasRepeating = false;
      this.game.action('move', dir);
    },
    stopMove() {
      this.heldDir = 0;
      this.dasRepeating = false;
    },

    update(dt) {
      if (this.game && this.game.state !== MB.STATE.PLAY) return; // DASはプレイ中のみ
      if (this.heldDir !== 0) {
        this.dasT += dt;
        if (!this.dasRepeating && this.dasT >= DAS_DELAY) {
          this.dasRepeating = true;
          this.dasT = 0;
          this.game.action('move', this.heldDir);
        } else if (this.dasRepeating && this.dasT >= DAS_REPEAT) {
          this.dasT = 0;
          this.game.action('move', this.heldDir);
        }
      }
    },

    hitButton(x, y) {
      for (const b of this.touchButtons) {
        const cx = b.x + b.r, cy = b.y + b.r;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= (b.r * 1.15) ** 2) return b;
      }
      return null;
    },

    onPointerDown(e) {
      const g = this.game;
      if (!g) return;
      e.preventDefault();
      const x = e.clientX, y = e.clientY;
      if (e.pointerType === 'touch') g.touchMode = true;
      MB.audio.ensure();

      // UIボタン（メニュー等）優先
      if (g.uiButtons && g.uiButtons.length) {
        for (const b of g.uiButtons) {
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            g.uiAction(b.id);
            return;
          }
        }
      }

      if (g.state !== MB.STATE.PLAY) {
        // 画面タップで進む系
        g.screenTap();
        return;
      }

      // タッチ操作ボタン
      if (g.touchMode) {
        const b = this.hitButton(x, y);
        if (b) {
          b.pressed = true;
          this.pointers.set(e.pointerId, { type: 'button', button: b });
          switch (b.id) {
            case 'left': this.startMove(-1); break;
            case 'right': this.startMove(1); break;
            case 'soft': this.softHeld = true; g.action('softStart'); break;
            case 'rotate': g.action('rotateCW'); break;
            case 'hard': g.action('hard'); break;
          }
          return;
        }
      }

      // フィールドジェスチャー
      const f = MB.render.rects.field;
      if (f && x >= f.x - 40 && x <= f.x + f.w + 40 && y >= f.y - 40 && y <= f.y + f.h + 60) {
        this.pointers.set(e.pointerId, {
          type: 'field', sx: x, sy: y, t: performance.now(), moved: false,
          lastCol: Math.floor((x - f.x) / MB.render.rects.cell),
        });
      }
    },

    onPointerMove(e) {
      const g = this.game;
      const p = this.pointers.get(e.pointerId);
      if (!p || p.type !== 'field' || !g) return;
      const cell = MB.render.rects.cell;
      const dx = e.clientX - p.sx;
      const col = Math.floor((e.clientX - MB.render.rects.field.x) / cell);
      if (Math.abs(dx) > cell * 0.55) p.moved = true;
      // ドラッグでピースを列追従
      if (p.moved && g.field.piece) {
        const diff = col - p.lastCol;
        if (diff !== 0) {
          const step = diff > 0 ? 1 : -1;
          for (let i = 0; i < Math.abs(diff); i++) {
            if (!g.field.tryMove(step)) break;
            if (MB.sfx && MB.audio.ctx) MB.sfx.move();
          }
          p.lastCol = col;
        }
      }
    },

    onPointerUp(e) {
      const g = this.game;
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p || !g) return;
      if (p.type === 'button') {
        p.button.pressed = false;
        switch (p.button.id) {
          case 'left': if (this.heldDir === -1) this.stopMove(); break;
          case 'right': if (this.heldDir === 1) this.stopMove(); break;
          case 'soft': this.softHeld = false; g.action('softEnd'); break;
        }
        return;
      }
      if (p.type === 'field') {
        const dt = performance.now() - p.t;
        const dy = e.clientY - p.sy;
        const dx = e.clientX - p.sx;
        // 下フリック = ハードドロップ
        if (dy > 70 && dy > Math.abs(dx) * 1.4 && dt < 400) {
          g.action('hard');
          return;
        }
        // 短タップ = 回転
        if (!p.moved && dt < 280 && Math.abs(dy) < 30) {
          g.action('rotateCW');
        }
      }
    },
  };
})();
