// マシュマロビルド - ゲーム本体（状態遷移・ルール・画面）
window.MB = window.MB || {};

(function () {
  const U = MB.util;
  const C = MB.C;
  const S = MB.STATE;

  MB.game = {
    state: S.BOOT,
    mode: 'story',
    stageIndex: 0,
    stage: null,          // 現在のステージ設定
    field: null,
    gen: null,
    queue: [],
    input: null,

    score: 0,
    stageStartScore: 0,
    flowGauge: 0,
    mach: false,
    machT: 0,
    machDur: 1,
    passSquares: 0,       // 今の周回で消した正方形数
    workPoints: 0,
    softDropping: false,
    gravAcc: 0,
    spawnDelay: 0,
    stateT: 0,            // 現在ステートの経過秒
    touchMode: false,
    uiButtons: [],
    menuIndex: 0,

    // エンドレス
    endlessLoop: 0,
    skinIdx: 0,
    squaresThisSkin: 0,

    // 統計
    stats: null,

    // 保存データ
    data: null,

    titleDecor: [],

    init(input) {
      this.input = input;
      this.field = new MB.Field();
      this.gen = new MB.PieceGen();
      this.data = MB.util.load() || { bestStory: 0, bestEndless: 0, clearedStages: 0, volume: 0.5, music: 'theme' };
      if (this.data.volume == null) this.data.volume = this.data.muted ? 0 : 0.5; // 旧データ移行
      if (!this.data.music) this.data.music = 'theme'; // デフォルトはテーマ曲
      MB.audio.setVolume(this.data.volume);
      this.field.onClear = (r) => this.handleClear(r);
      this.field.onSweepMiss = () => this.handleSweepMiss();
      this.field.onWrap = () => { this.passSquares = 0; };
      this.field.onLock = () => { if (MB.audio.ctx) MB.sfx.place(); };
      for (let i = 0; i < 14; i++) {
        this.titleDecor.push({
          x: Math.random(), y: Math.random(), spd: U.rand(0.02, 0.06),
          size: U.rand(0.5, 1.2), color: Math.random() < 0.5 ? C.WHITE : C.PINK,
          sway: U.rand(0, 6), s: Math.random() < 0.12,
        });
      }
      this.setState(S.TITLE);
    },

    setState(st) {
      this.state = st;
      this.stateT = 0;
      this.uiButtons = [];
    },

    palette() {
      if (this.stage) return this.stage.palette;
      return MB.STAGES[0].palette;
    },

    workProgress() {
      if (!this.stage || !this.stage.quota) return 0;
      return this.workPoints / this.stage.quota;
    },
    machRemain01() { return this.machDur > 0 ? U.clamp(this.machT / this.machDur, 0, 1) : 0; },

    setVolume(v) {
      this.data.volume = v;
      MB.audio.setVolume(v);
      U.save(this.data);
    },

    // 100 → 50 → 25 → 0 → 100 …
    cycleVolume() {
      const order = [1, 0.5, 0.25, 0];
      let idx = order.findIndex((v) => Math.abs(v - this.data.volume) < 0.01);
      if (idx < 0) idx = 1;
      this.setVolume(order[(idx + 1) % order.length]);
      if (MB.audio.ctx) MB.sfx.uiMove();
    },
    skinProgress() { return U.clamp(this.squaresThisSkin / MB.ENDLESS.squaresPerSkin, 0, 1); },
    gravityT() { return 0; },

    currentGravityMs() {
      let ms = this.stage ? this.stage.gravityMs : 800;
      if (this.mode === 'endless') {
        ms = Math.max(MB.ENDLESS.minGravityMs, ms * Math.pow(MB.ENDLESS.gravityRamp, this.endlessLoop));
      }
      return ms;
    },

    // ---- モード開始 ----
    startStory(fromStage) {
      this.mode = 'story';
      this.stageIndex = fromStage || 0;
      this.score = 0;
      this.startStage();
    },

    startEndless() {
      this.mode = 'endless';
      this.endlessLoop = 0;
      this.skinIdx = 0;
      this.squaresThisSkin = 0;
      this.score = 0;
      this.stage = this.makeEndlessStage();
      this.resetPlayfield();
      this.setState(S.STAGE_INTRO);
    },

    makeEndlessStage() {
      const base = MB.STAGES[MB.ENDLESS.order[this.skinIdx % MB.ENDLESS.order.length]];
      const st = Object.assign({}, base);
      st.bpm = base.bpm + this.endlessLoop * MB.ENDLESS.bpmRamp;
      st.quota = 0;
      st.useTheme = false;
      return st;
    },

    startStage() {
      this.stage = MB.STAGES[this.stageIndex];
      this.stageStartScore = this.score;
      this.resetPlayfield();
      this.setState(S.STAGE_INTRO);
    },

    resetPlayfield() {
      this.field.reset();
      this.gen = new MB.PieceGen();
      this.queue = [this.gen.next(), this.gen.next(), this.gen.next()];
      this.flowGauge = 0;
      this.mach = false;
      this.machT = 0;
      this.passSquares = 0;
      this.workPoints = 0;
      this.gravAcc = 0;
      this.softDropping = false;
      this.spawnDelay = 0;
      this.stats = { squares: 0, maxGroup: 0, chainCells: 0, machCount: 0, eaten: 0 };
      MB.fx.reset();
      MB.character.reset();
    },

    beginPlay() {
      this.setState(S.PLAY);
      MB.music.startStage(this.stage, null, this.data.music === 'theme');
      this.field.spawnDelayed = false;
      this.spawnNext();
    },

    spawnNext() {
      const p = this.queue.shift();
      this.queue.push(this.gen.next());
      this.field.spawn(p);
      this.pieceVisX = p.x;
      this.pieceVisY = p.y;
    },

    // ---- 回収処理 ----
    handleClear(r) {
      if (r.squares === 0 && r.chainCells === 0) return;
      const mult = this.mach ? 2 : 1;
      const gained = C.SCORE_SQUARE_BASE * r.squares * r.squares * mult +
                     r.chainCells * C.SCORE_CHAIN_CELL * mult;
      this.score += gained;

      // 進捗
      const wp = (r.squares + r.chainCells / 4) * mult;
      this.workPoints += wp;

      // ノリゲージ
      if (!this.mach) {
        for (let i = 0; i < r.squares; i++) {
          this.passSquares++;
          this.flowGauge += this.passSquares >= 3 ? C.GAUGE_PER_SQUARE_BONUS : C.GAUGE_PER_SQUARE;
        }
        this.flowGauge = Math.min(100, this.flowGauge);
        if (this.flowGauge >= 100) this.triggerMach();
      }

      // 統計
      this.stats.squares += r.squares;
      this.stats.maxGroup = Math.max(this.stats.maxGroup, r.squares);
      this.stats.chainCells += r.chainCells;

      // エンドレス: スキン進行
      if (this.mode === 'endless') {
        this.squaresThisSkin += r.squares;
        if (this.squaresThisSkin >= MB.ENDLESS.squaresPerSkin) this.nextSkin();
      }

      // 演出
      const R = MB.render.rects;
      let cx = 0, cy = 0;
      r.cells.forEach((cell, i) => {
        const px = R.field.x + (cell.x + 0.5) * R.cell;
        const py = R.field.y + (cell.y + 0.5) * R.cell;
        cx += px; cy += py;
        MB.fx.pop(px, py, cell.color);
        MB.character.feed({ x: px, y: py }, cell.color, cell.s, i * 0.07, R.cell);
        this.stats.eaten++;
      });
      cx /= r.cells.length; cy /= r.cells.length;
      if (MB.audio.ctx) {
        MB.sfx.groupClear(r.squares);
        MB.sfx.mashu(); // 「ましゅ〜♪」とうれしそうに飛んでいく
        if (r.chainCells > 0) MB.sfx.sChain(r.chainCells);
      }
      MB.fx.text(cx, cy - R.cell * 1.6, 'ましゅ〜♪', '#ffb9d4', Math.max(16, R.cell * 0.42));
      // うまく消えたらマロくんがよろこぶ
      if (r.squares >= 2 || r.chainCells > 0) {
        MB.character.say(U.pick(['ひらめいたー！！', 'できたー！！', 'てんさい かも！', 'すごい すごい！']), r.squares >= 3);
      }
      MB.fx.text(cx, cy - R.cell, `+${U.fmtScore(gained)}`, '#fff', Math.max(16, R.cell * 0.55));
      if (r.squares >= 3) {
        MB.fx.text(cx, cy - R.cell * 2.2, `${r.squares}こ どうじ!`, '#ffe28a', Math.max(20, R.cell * 0.7));
        MB.fx.shake(4 + r.squares);
        MB.fx.stars(cx, cy, 8 + r.squares * 2);
      }
      if (r.chainCells > 0) {
        MB.fx.text(cx, cy - R.cell * 3.2, `Sれんさ +${r.chainCells}`, '#ff9ec6', Math.max(18, R.cell * 0.62));
        MB.fx.stars(cx, cy, 10, '#ff9ec6');
      }

      // ステージクリア判定
      if (this.mode === 'story' && this.workPoints >= this.stage.quota && this.state === S.PLAY) {
        this.stageClear();
      }
    },

    handleSweepMiss() {
      if (!this.mach && this.flowGauge > 0) {
        this.flowGauge = Math.max(0, this.flowGauge - C.GAUGE_MISS_DECAY);
      }
    },

    triggerMach() {
      this.mach = true;
      this.stats.machCount++;
      const spb = 60 / (this.stage ? this.stage.bpm : 120);
      this.machDur = spb * 4 * C.MACH_MEASURES;
      this.machT = this.machDur;
      if (MB.audio.ctx) MB.sfx.machStart();
      MB.fx.doFlash(1);
      MB.fx.shake(8);
      MB.fx.text(MB.render.w / 2, MB.render.h * 0.4, 'マッハタイム!!', '#ffe28a', Math.max(30, MB.render.w * 0.04));
      MB.character.say('マッハの スピードだー！！', true);
    },

    endMach() {
      this.mach = false;
      this.flowGauge = 0;
      if (MB.audio.ctx) MB.sfx.machEnd();
    },

    nextSkin() {
      this.squaresThisSkin = 0;
      this.skinIdx++;
      if (this.skinIdx % MB.ENDLESS.order.length === 0) this.endlessLoop++;
      this.stage = this.makeEndlessStage();
      MB.music.startStage(this.stage, this.stage.bpm, this.data.music === 'theme');
      MB.fx.text(MB.render.w / 2, MB.render.h * 0.3, `${this.stage.time} ${this.stage.name}`, '#fff', 26);
    },

    stageClear() {
      this.setState(S.STAGE_CLEAR);
      // テーマ曲モード中は曲を止めずに続ける（つぎのステージへシームレスに）
      if (!(this.data.music === 'theme' && MB.music.mode === 'theme')) MB.music.stop();
      if (MB.audio.ctx) MB.sfx.stageClear();
      MB.character.mood = 'happy';
      MB.character.say('かんりょー！！', true);
      this.data.clearedStages = Math.max(this.data.clearedStages, this.stageIndex + 1);
      this.data.bestStory = Math.max(this.data.bestStory, this.score);
      U.save(this.data);
    },

    gameOver() {
      this.setState(S.GAME_OVER);
      MB.music.stop();
      if (MB.audio.ctx) MB.sfx.gameOver();
      MB.character.mood = 'ko';
      MB.character.say('あふれたー！？');
      if (this.mode === 'endless') {
        this.data.bestEndless = Math.max(this.data.bestEndless, this.score);
        U.save(this.data);
      }
    },

    // ---- 入力アクション ----
    action(name, arg) {
      const st = this.state;
      if (name === 'mute') {
        this.setVolume(this.data.volume > 0 ? 0 : (MB.audio.lastVol || 0.5));
        return;
      }
      if (st === S.PLAY) {
        switch (name) {
          case 'move':
            if (this.field.tryMove(arg) && MB.audio.ctx) MB.sfx.move();
            break;
          case 'rotateCW':
            if (this.field.tryRotate(1) && MB.audio.ctx) MB.sfx.rotate();
            break;
          case 'rotateCCW':
            if (this.field.tryRotate(-1) && MB.audio.ctx) MB.sfx.rotate();
            break;
          case 'softStart': this.softDropping = true; break;
          case 'softEnd': this.softDropping = false; break;
          case 'hard':
            if (this.field.piece) {
              this.field.hardDrop();
              if (MB.audio.ctx) MB.sfx.hardDrop();
              MB.fx.shake(3);
              this.gravAcc = 0;
            }
            break;
          case 'pause':
            this.setState(S.PAUSE);
            MB.music.pause();
            break;
        }
      } else if (st === S.PAUSE) {
        if (name === 'pause' || name === 'confirm') this.resumePlay();
      } else if (st === S.TITLE) {
        if (name === 'confirm') this.toMenu();
      } else if (st === S.MENU) {
        if (name === 'move' || name === 'rotateCW' || name === 'softStart') {
          this.menuIndex = (this.menuIndex + 1) % 2;
          if (MB.audio.ctx) MB.sfx.uiMove();
        } else if (name === 'confirm') {
          this.menuSelect(this.menuIndex);
        }
      } else if (st === S.STAGE_CLEAR) {
        if (name === 'confirm' && this.stateT > 1.2) this.advanceStage();
      } else if (st === S.GAME_OVER) {
        if (name === 'confirm' && this.stateT > 1.0) this.retry();
      } else if (st === S.ENDING || st === S.RESULT) {
        if (name === 'confirm' && this.stateT > 2.0) this.backToTitle();
      }
    },

    screenTap() {
      // タッチでの画面送り（uiButtonsに当たらなかったとき）
      const st = this.state;
      if (st === S.TITLE) this.toMenu();
      else if (st === S.STAGE_CLEAR && this.stateT > 1.2) this.advanceStage();
      else if (st === S.GAME_OVER && this.stateT > 1.0) this.retry();
      else if ((st === S.ENDING || st === S.RESULT) && this.stateT > 2.0) this.backToTitle();
    },

    uiAction(id) {
      if (MB.audio.ctx) MB.sfx.uiSelect();
      switch (id) {
        case 'menu_story': this.menuSelect(0); break;
        case 'menu_endless': this.menuSelect(1); break;
        case 'pause_resume': this.resumePlay(); break;
        case 'pause_retry': this.retry(); break;
        case 'pause_title': MB.music.stop(); this.backToTitle(); break;
        case 'pause_mute': this.cycleVolume(); break;
        case 'vol_cycle': this.cycleVolume(); break;
        case 'menu_music':
          this.data.music = this.data.music === 'theme' ? 'gen' : 'theme';
          U.save(this.data);
          if (this.state === S.MENU) {
            if (this.data.music === 'theme') MB.music.playThemeSolo(0.55);
            else MB.music.stopTheme();
          }
          break;
        case 'over_retry': this.retry(); break;
        case 'over_title': this.backToTitle(); break;
        case 'title_start': this.toMenu(); break;
      }
    },

    toMenu() {
      if (MB.audio.ctx) MB.sfx.uiSelect();
      MB.music.playThemeSolo(0.55);
      this.setState(S.MENU);
    },

    menuSelect(idx) {
      // テーマ曲モードならタイトル→ゲームへ曲が途切れず続く
      if (this.data.music !== 'theme') MB.music.stopTheme();
      if (idx === 0) this.startStory(0);
      else this.startEndless();
    },

    resumePlay() {
      this.setState(S.PLAY);
      MB.music.resume();
    },

    retry() {
      if (this.mode === 'story') {
        this.score = this.stageStartScore;
        this.startStage();
      } else {
        this.startEndless();
      }
    },

    advanceStage() {
      if (this.stageIndex >= MB.STAGES.length - 1) {
        this.setState(S.ENDING);
        MB.character.mood = 'beach';
        MB.music.playThemeSolo(0.75);
        this.data.bestStory = Math.max(this.data.bestStory, this.score);
        U.save(this.data);
      } else {
        this.stageIndex++;
        this.startStage();
      }
    },

    backToTitle() {
      MB.music.stop();
      this.setState(S.TITLE);
    },

    // ---- 更新 ----
    update(dt) {
      this.stateT += dt;
      this.input.update(dt);
      MB.music.update();
      MB.fx.update(dt);
      MB.character.update(dt);

      const st = this.state;

      if (st === S.STAGE_INTRO) {
        if (this.stateT > 2.1) this.beginPlay();
        return;
      }

      if (st !== S.PLAY) return;

      // 音楽状態
      MB.music.setIntensity(this.flowGauge / 100, this.mach);

      // マッハタイマー
      if (this.mach) {
        this.machT -= dt;
        if (this.machT <= 0) this.endMach();
      }

      // キャラクターの気分
      if (MB.character.mood !== 'happy') {
        const h = this.field.maxHeight();
        MB.character.mood =
          this.mach ? 'mach' :
          h >= C.ROWS - 2 ? 'worried' :
          this.flowGauge > 55 ? 'flow' :
          (this.stage && this.stage.id >= 4 && this.flowGauge < 12) ? 'sleepy' : 'idle';
      }

      // 分離落下
      const settled = this.field.updateFallers(dt);
      if (this.field.overflow) {
        this.gameOver();
        return;
      }

      // 重力
      if (this.field.piece) {
        this.gravAcc += dt * 1000;
        const interval = this.softDropping ? C.SOFT_DROP_MS : this.currentGravityMs();
        while (this.gravAcc >= interval && this.field.piece) {
          this.gravAcc -= interval;
          const res = this.field.dropStep();
          if (res === 'locked') {
            this.gravAcc = 0;
            this.spawnDelay = 0.12;
          } else if (this.softDropping && MB.audio.ctx) {
            MB.sfx.softDrop();
          }
        }
      } else if (settled) {
        this.spawnDelay -= dt;
        if (this.spawnDelay <= 0) this.spawnNext();
      }

      // マロくんの独り言（ときどき）
      this.sayTimer = (this.sayTimer == null ? 7 : this.sayTimer) - dt;
      if (this.sayTimer <= 0) {
        this.sayTimer = U.rand(10, 17);
        if (!MB.character.speech && !this.mach) {
          const mood = MB.character.mood;
          const lines =
            mood === 'worried' ? ['わわわ…！', 'つみすぎ では！？'] :
            mood === 'sleepy' ? ['ねむい…', 'コーヒー どこ…'] :
            mood === 'flow' ? ['ノッてきたぞー！', 'いい かんじ！'] :
            ['はやく かえりたいなー', 'マシュマロ たべたいなー', 'おしごと おしごと…', 'んしょ、んしょ…'];
          MB.character.say(U.pick(lines));
        }
      }

      // ピースのなめらか表示位置
      if (this.field.piece) {
        const p = this.field.piece;
        if (this.pieceVisX == null) { this.pieceVisX = p.x; this.pieceVisY = p.y; }
        this.pieceVisX += (p.x - this.pieceVisX) * Math.min(1, dt * 14);
        this.pieceVisY += (p.y - this.pieceVisY) * Math.min(1, dt * 18);
      } else {
        this.pieceVisX = null;
        this.pieceVisY = null;
      }

      // タイムライン
      if (MB.music.started) {
        this.field.setSweep(MB.music.getSweepPhase());
      }
    },

    // ---- 画面描画（PLAY以外のオーバーレイ含む） ----
    draw() {
      const st = this.state;
      const r = MB.render;
      const ctx = r.ctx;
      ctx.save();
      ctx.scale(r.dpr, r.dpr);
      this.uiButtons = [];

      if (st === S.TITLE || st === S.MENU) {
        this.drawTitle(ctx, r);
      } else if (st === S.ENDING) {
        this.drawEnding(ctx, r);
      } else {
        r.drawGame(this);
        if (st === S.STAGE_INTRO) this.drawStageIntro(ctx, r);
        else if (st === S.PAUSE) this.drawPause(ctx, r);
        else if (st === S.STAGE_CLEAR) this.drawStageClear(ctx, r);
        else if (st === S.GAME_OVER) this.drawGameOver(ctx, r);
      }
      this.drawVolumeButton(ctx, r);
      ctx.restore();
    },

    // 画面右上の音量ボタン（常時表示・クリックで 100→50→25→0 切替）
    drawVolumeButton(ctx, r) {
      const v = this.data.volume;
      const icon = v === 0 ? '🔇' : v <= 0.25 ? '🔈' : v <= 0.5 ? '🔉' : '🔊';
      const bw = 78, bh = 32;
      const x = r.w - bw - 10, y = 8;
      ctx.fillStyle = 'rgba(20,16,40,0.55)';
      U.rr(ctx, x, y, bw, bh, bh / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      U.rr(ctx, x, y, bw, bh, bh / 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 15px ${r.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${icon} ${Math.round(v * 100)}%`, x + bw / 2, y + bh / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      this.uiButtons.push({ id: 'vol_cycle', x, y, w: bw, h: bh });
    },

    overlayBg(ctx, r, alpha) {
      ctx.fillStyle = `rgba(12,10,26,${alpha == null ? 0.62 : alpha})`;
      ctx.fillRect(0, 0, r.w, r.h);
    },

    bigText(ctx, r, str, y, size, color) {
      ctx.font = `${size}px ${r.FONT_POP}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(30,20,45,0.75)';
      ctx.strokeText(str, r.w / 2, y);
      ctx.fillStyle = color || '#fff';
      ctx.fillText(str, r.w / 2, y);
      ctx.textAlign = 'left';
    },

    uiButton(ctx, r, id, label, cx, cy, w, h, primary) {
      const x = cx - w / 2, y = cy - h / 2;
      ctx.fillStyle = primary ? '#ff7fae' : 'rgba(255,255,255,0.14)';
      U.rr(ctx, x, y, w, h, h / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      U.rr(ctx, x, y, w, h, h / 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(h * 0.42)}px ${r.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      this.uiButtons.push({ id, x, y, w, h });
    },

    drawTitle(ctx, r) {
      // 夜空背景
      const g = ctx.createLinearGradient(0, 0, 0, r.h);
      g.addColorStop(0, '#1a1440');
      g.addColorStop(0.7, '#3a2a6e');
      g.addColorStop(1, '#7a4a8e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.w, r.h);
      const tNow = performance.now() / 1000;
      ctx.fillStyle = '#fff';
      for (const s of r.starSeed) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(tNow + s.tw);
        ctx.beginPath();
        ctx.arc(s.x * r.w, s.y * r.h * 0.9, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ふわふわ降るマシュマロ
      for (const d of this.titleDecor) {
        d.y += d.spd * (1 / 60);
        if (d.y > 1.05) { d.y = -0.08; d.x = Math.random(); }
        const size = d.size * Math.min(r.w, r.h) * 0.055;
        const px = (d.x + Math.sin(tNow * 0.7 + d.sway) * 0.02) * r.w;
        MB.draw.marshmallow(ctx, px, d.y * r.h, size, d.color, { s: d.s, round: 0.4 });
      }

      const isMenu = this.state === S.MENU;
      const cy = r.h * (isMenu ? 0.18 : 0.17);
      // ロゴ（でっかく・ぷくぷく）
      const logoSize = Math.min(r.w * 0.155, 132);
      this.drawLogo(ctx, r, cy, isMenu ? logoSize * 0.72 : logoSize);

      if (!isMenu) {
        this.drawRulesPanel(ctx, r, r.h * 0.27);
        if (Math.sin(tNow * 3.5) > -0.4) {
          this.bigText(ctx, r, 'タップ / Enter で スタート', r.h * 0.77, Math.min(r.w * 0.032, 24), '#fff');
        }
        ctx.font = `bold ${Math.min(r.w * 0.021, 15)}px ${r.FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,20,50,0.85)';
        ctx.lineJoin = 'round';
        const helpLines = [
          ['🖱 マウスをうごかすだけで いどう ／ クリック・ホイールまわし＝まわす ／ みぎクリック・ホイールおし＝ストン！', r.h * 0.84],
          ['⌨ キーボード： ←→ いどう ／ ↑ Z X まわす ／ ↓ ゆっくり ／ Space ストン', r.h * 0.885],
          ['ためしばん — おとが でます 🔊（みぎうえで おんりょう）', r.h * 0.93],
        ];
        for (const [txt, y] of helpLines) {
          ctx.strokeText(txt, r.w / 2, y);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText(txt, r.w / 2, y);
        }
        ctx.textAlign = 'left';
      } else {
        // モード選択
        const bw = Math.min(r.w * 0.6, 420);
        const bh = Math.min(r.h * 0.12, 74);
        this.uiButton(ctx, r, 'menu_story', 'ものがたり（よるの おしごと）', r.w / 2, r.h * 0.4, bw, bh, this.menuIndex === 0);
        this.uiButton(ctx, r, 'menu_endless', 'エンドレス（とことん）', r.w / 2, r.h * 0.4 + bh * 1.3, bw, bh, this.menuIndex === 1);
        // 音楽えらび
        const musLabel = this.data.music === 'theme'
          ? (MB.music.themeReady ? '♪ おんがく: マシュマロのうた' : '♪ おんがく: マシュマロのうた（このばんには 入ってないよ）')
          : '♪ おんがく: じどうせいせいBGM';
        this.uiButton(ctx, r, 'menu_music', musLabel, r.w / 2, r.h * 0.4 + bh * 2.5, bw * 0.94, bh * 0.72);
        ctx.font = `${Math.min(r.w * 0.024, 16)}px ${r.FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const cleared = this.data.clearedStages;
        ctx.fillText(cleared >= MB.STAGES.length ? '★ ものがたり クリアずみ！' : `おはなしの すすみ: ${cleared} / ${MB.STAGES.length}`,
                     r.w / 2, r.h * 0.4 + bh * 3.5);
        ctx.fillText(`ベスト: ものがたり ${U.fmtScore(this.data.bestStory)} ／ エンドレス ${U.fmtScore(this.data.bestEndless)}`,
                     r.w / 2, r.h * 0.4 + bh * 3.5 + 24);
        ctx.textAlign = 'left';
      }
    },

    // プレイ開始直後の操作ヒント
    drawHint(ctx, r) {
      const R = MB.render.rects;
      const f = R.field;
      const alpha = Math.min(1, this.hintT / 1.2);
      const fs = Math.min(f.w * 0.033, 19);
      const bw = f.w * 0.95;
      const bh = fs * 4.6;
      const bx = f.x + (f.w - bw) / 2;
      const by = f.y + f.h * 0.22;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(24,16,46,0.82)';
      U.rr(ctx, bx, by, bw, bh, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      U.rr(ctx, bx, by, bw, bh, 14);
      ctx.stroke();
      ctx.font = `bold ${fs}px ${r.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('🖱 マウスを うごかすだけで いどう ／ クリック・ホイール ＝ まわす', f.x + f.w / 2, by + bh * 0.38);
      ctx.fillStyle = '#ffe28a';
      ctx.fillText('おとすのは 右クリック・ホイールおし・Space・⤓ボタン！', f.x + f.w / 2, by + bh * 0.76);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    },

    // 描き文字ロゴ『マシュとマロ』
    drawLogo(ctx, r, cy, size) {
      const chars = [
        { c: 'マ', col: '#fff5ec', s: 1 },
        { c: 'シ', col: '#ffc9dc', s: 1 },
        { c: 'ュ', col: '#fff5ec', s: 0.9 },
        { c: 'と', col: '#ffe28a', s: 0.6 },
        { c: 'マ', col: '#ffc9dc', s: 1 },
        { c: 'ロ', col: '#fff5ec', s: 1 },
      ];
      const tNow = performance.now() / 1000;
      ctx.textAlign = 'center';
      const widths = chars.map((ch) => {
        ctx.font = `${Math.round(size * ch.s)}px ${r.FONT_POP}`;
        return ctx.measureText(ch.c).width;
      });
      const gap = size * 0.14;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
      let x = r.w / 2 - total / 2;
      const fixedRot = [-0.06, 0.045, -0.03, 0.07, -0.045, 0.05];
      chars.forEach((ch, i) => {
        const cxx = x + widths[i] / 2;
        const bounce = Math.sin(tNow * 2.2 + i * 0.9) * size * 0.06;
        const rot = Math.sin(tNow * 1.5 + i * 1.3) * 0.05 + fixedRot[i];
        ctx.save();
        ctx.translate(cxx, cy + bounce);
        ctx.rotate(rot);
        ctx.font = `${Math.round(size * ch.s)}px ${r.FONT_POP}`;
        ctx.lineJoin = 'round';
        // 落ち影
        ctx.fillStyle = 'rgba(30,15,45,0.4)';
        ctx.fillText(ch.c, size * 0.045, size * 0.06);
        // ぷくぷくステッカー風: 太い紫 → 白いふち → 色
        ctx.lineWidth = size * 0.38;
        ctx.strokeStyle = '#4a2a66';
        ctx.strokeText(ch.c, 0, 0);
        ctx.lineWidth = size * 0.2;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(ch.c, 0, 0);
        ctx.fillStyle = ch.col;
        ctx.fillText(ch.c, 0, 0);
        // つやハイライト
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ch.c, -size * 0.015, -size * 0.03);
        ctx.globalAlpha = 1;
        ctx.restore();
        x += widths[i] + gap;
      });
      ctx.textAlign = 'left';
    },

    // タイトルのルールせつめい
    drawRulesPanel(ctx, r, y0) {
      const pw = Math.min(r.w * 0.78, 640);
      const ph = r.h * 0.44;
      const px = (r.w - pw) / 2;
      ctx.fillStyle = 'rgba(20,14,40,0.55)';
      U.rr(ctx, px, y0, pw, ph, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.5;
      U.rr(ctx, px, y0, pw, ph, 18);
      ctx.stroke();

      const rowH = ph / 4;
      const fs = Math.min(rowH * 0.34, pw * 0.034);
      const icoX = px + pw * 0.1;
      const txtX = px + pw * 0.2;
      ctx.font = `bold ${fs}px ${r.FONT}`;
      ctx.textBaseline = 'middle';

      const rows = [
        () => { // 2x2でそろえる
          const m = rowH * 0.3;
          const cy = y0 + rowH * 0.5;
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            MB.draw.marshmallow(ctx, icoX - m + dx * m, cy - m + dy * m, m, MB.C.PINK, {});
          }
          return 'おなじ いろを 4つ くっつけると おおきな マシュマロに！';
        },
        () => { // ラインが回収
          const cy = y0 + rowH * 1.5;
          ctx.strokeStyle = 'rgba(150,220,255,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(icoX, cy - rowH * 0.3);
          ctx.lineTo(icoX, cy + rowH * 0.3);
          ctx.stroke();
          ctx.fillStyle = 'rgba(150,220,255,1)';
          ctx.beginPath();
          ctx.moveTo(icoX - 7, cy - rowH * 0.34);
          ctx.lineTo(icoX + 7, cy - rowH * 0.34);
          ctx.lineTo(icoX, cy - rowH * 0.2);
          ctx.closePath();
          ctx.fill();
          return 'ひかりの ラインが とおると、マロくんが ぱくっ！';
        },
        () => { // ノリゲージ→マッハ
          const cy = y0 + rowH * 2.5;
          ctx.fillStyle = 'rgba(15,14,30,0.7)';
          U.rr(ctx, icoX - rowH * 0.35, cy - rowH * 0.12, rowH * 0.7, rowH * 0.24, rowH * 0.12);
          ctx.fill();
          const grad = ctx.createLinearGradient(icoX - rowH * 0.35, 0, icoX + rowH * 0.35, 0);
          grad.addColorStop(0, '#ff9ec6');
          grad.addColorStop(1, '#ffd0a0');
          ctx.fillStyle = grad;
          U.rr(ctx, icoX - rowH * 0.33, cy - rowH * 0.1, rowH * 0.55, rowH * 0.2, rowH * 0.1);
          ctx.fill();
          return 'いっぱい たべさせると ノリノリ → マッハタイム で 2ばい！';
        },
        () => { // Sマーク
          const m = rowH * 0.55;
          MB.draw.marshmallow(ctx, icoX - m / 2, y0 + rowH * 3.5 - m / 2, m, MB.C.WHITE, { s: true });
          return 'Sマークは おなじ いろを まるごと おそうじ！';
        },
      ];
      rows.forEach((draw, i) => {
        const label = draw();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `bold ${fs}px ${r.FONT}`;
        ctx.fillText(label, txtX, y0 + rowH * (i + 0.5));
      });
      ctx.textBaseline = 'alphabetic';
    },

    drawStageIntro(ctx, r) {
      const t = this.stateT;
      this.overlayBg(ctx, r, 0.55 * Math.min(1, (2.1 - t)));
      const a = U.clamp(t * 3, 0, 1);
      ctx.globalAlpha = a;
      const st = this.stage;
      this.bigText(ctx, r, st.time, r.h * 0.38, Math.min(r.w * 0.09, 70), '#ffd9a0');
      this.bigText(ctx, r, st.name, r.h * 0.5, Math.min(r.w * 0.055, 42), '#fff');
      if (this.mode === 'story') {
        this.bigText(ctx, r, 'めざせ おしごと 100%！', r.h * 0.6, Math.min(r.w * 0.03, 22), '#c8f5e6');
      }
      if (t > 1.4) {
        this.bigText(ctx, r, 'READY…', r.h * 0.72, Math.min(r.w * 0.04, 30), '#ff9ec6');
      }
      ctx.globalAlpha = 1;
    },

    drawPause(ctx, r) {
      this.overlayBg(ctx, r);
      this.bigText(ctx, r, 'ひとやすみ', r.h * 0.3, Math.min(r.w * 0.06, 44));
      const bw = Math.min(r.w * 0.5, 320);
      const bh = Math.min(r.h * 0.09, 60);
      this.uiButton(ctx, r, 'pause_resume', 'さいかい', r.w / 2, r.h * 0.45, bw, bh, true);
      this.uiButton(ctx, r, 'pause_retry', 'やりなおす', r.w / 2, r.h * 0.45 + bh * 1.3, bw, bh);
      this.uiButton(ctx, r, 'pause_title', 'タイトルへ', r.w / 2, r.h * 0.45 + bh * 2.6, bw, bh);
      this.uiButton(ctx, r, 'pause_mute', `おんりょう ${Math.round(this.data.volume * 100)}%`, r.w / 2, r.h * 0.45 + bh * 3.9, bw, bh);
    },

    drawStageClear(ctx, r) {
      const t = this.stateT;
      this.overlayBg(ctx, r, 0.5);
      const pop = U.easeOut(U.clamp(t * 1.6, 0, 1));
      ctx.save();
      ctx.translate(r.w / 2, r.h * 0.35);
      ctx.scale(pop, pop);
      ctx.translate(-r.w / 2, -r.h * 0.35);
      this.bigText(ctx, r, '✓ おしごと かんりょう！', r.h * 0.32, Math.min(r.w * 0.06, 48), '#8df0a8');
      this.bigText(ctx, r, `${this.stage.time} ${this.stage.name} クリア！`, r.h * 0.42, Math.min(r.w * 0.035, 26));
      ctx.restore();
      if (t > 0.6) {
        ctx.font = `${Math.min(r.w * 0.028, 20)}px ${r.FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        const s = this.stats;
        ctx.fillText(`スコア ${U.fmtScore(this.score)}　たべたマシュマロ ${s.eaten}こ`, r.w / 2, r.h * 0.53);
        ctx.fillText(`さいだい同時消し ${s.maxGroup}　マッハ ${s.machCount}回`, r.w / 2, r.h * 0.575);
        ctx.textAlign = 'left';
      }
      if (t > 1.2 && Math.sin(t * 4) > -0.3) {
        const next = this.stageIndex >= MB.STAGES.length - 1 ? 'エンディングへ' : 'つぎの じかんへ';
        this.bigText(ctx, r, `タップ / Enter で ${next}`, r.h * 0.68, Math.min(r.w * 0.03, 22), '#ffd0e0');
      }
    },

    drawGameOver(ctx, r) {
      const t = this.stateT;
      this.overlayBg(ctx, r, 0.6);
      this.bigText(ctx, r, 'あふれちゃった…', r.h * 0.33, Math.min(r.w * 0.055, 44), '#ff8a9e');
      this.bigText(ctx, r, 'マシュマロが つみあがりすぎた！', r.h * 0.42, Math.min(r.w * 0.032, 24));
      ctx.font = `${Math.min(r.w * 0.028, 20)}px ${r.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(`スコア ${U.fmtScore(this.score)}`, r.w / 2, r.h * 0.5);
      ctx.textAlign = 'left';
      if (t > 1.0) {
        const bw = Math.min(r.w * 0.45, 300);
        const bh = Math.min(r.h * 0.085, 56);
        this.uiButton(ctx, r, 'over_retry', 'もういちど！', r.w / 2, r.h * 0.62, bw, bh, true);
        this.uiButton(ctx, r, 'over_title', 'タイトルへ', r.w / 2, r.h * 0.62 + bh * 1.3, bw, bh);
      }
    },

    drawEnding(ctx, r) {
      const t = this.stateT;
      // 朝焼けのビーチ
      const sunT = U.clamp(t / 6, 0, 1);
      const g = ctx.createLinearGradient(0, 0, 0, r.h * 0.62);
      g.addColorStop(0, MB.colorLerp('#3a5a9e', '#8fc8f0', sunT));
      g.addColorStop(1, MB.colorLerp('#ffb070', '#ffe8c0', sunT));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.w, r.h * 0.62);
      // 太陽
      const sunY = r.h * (0.58 - sunT * 0.28);
      ctx.fillStyle = '#fff0c8';
      ctx.beginPath();
      ctx.arc(r.w * 0.7, sunY, Math.min(r.w, r.h) * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.25)';
      ctx.beginPath();
      ctx.arc(r.w * 0.7, sunY, Math.min(r.w, r.h) * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // 海
      const sea = ctx.createLinearGradient(0, r.h * 0.55, 0, r.h * 0.78);
      sea.addColorStop(0, MB.colorLerp('#2a4a8e', '#4a9ac8', sunT));
      sea.addColorStop(1, MB.colorLerp('#1a3a6e', '#3a8ab8', sunT));
      ctx.fillStyle = sea;
      ctx.fillRect(0, r.h * 0.55, r.w, r.h * 0.23);
      // 波
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const wy = r.h * (0.6 + i * 0.045) + Math.sin(t * 1.2 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(0, wy);
        for (let x = 0; x <= r.w; x += 30) {
          ctx.lineTo(x, wy + Math.sin(x / 60 + t * 2 + i * 2) * 3);
        }
        ctx.stroke();
      }
      // 砂浜
      ctx.fillStyle = MB.colorLerp('#c8a878', '#f0dcb0', sunT);
      ctx.beginPath();
      ctx.moveTo(0, r.h);
      ctx.lineTo(0, r.h * 0.76);
      ctx.quadraticCurveTo(r.w * 0.5, r.h * 0.72, r.w, r.h * 0.8);
      ctx.lineTo(r.w, r.h);
      ctx.closePath();
      ctx.fill();

      // パラソル
      const px = r.w * 0.2, py = r.h * 0.6;
      ctx.strokeStyle = '#8a6a4a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, r.h * 0.82);
      ctx.stroke();
      ctx.fillStyle = '#ff8fae';
      ctx.beginPath();
      ctx.arc(px, py, Math.min(r.w, r.h) * 0.11, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const a0 = Math.PI + (i * 2 + 0.5) * (Math.PI / 6);
        ctx.arc(px, py, Math.min(r.w, r.h) * 0.11, a0, a0 + Math.PI / 12);
        ctx.lineTo(px, py);
        ctx.closePath();
        ctx.fill();
      }

      // ビーチのプログラマー（デスクなし・くつろぎ）
      MB.character.drawProgrammer(ctx, r.w * 0.38, r.h * 0.86,
        Math.min(r.w, r.h) / 520, { accent: '#ffd0e0' }, {}, { beach: true });

      // テキスト
      this.bigText(ctx, r, 'よあけだ！ おしごと ぜんぶ おわった！', r.h * 0.16, Math.min(r.w * 0.05, 42), '#8df0a8');
      if (t > 1.5) {
        this.bigText(ctx, r, 'マロくん、よく がんばりました…', r.h * 0.26, Math.min(r.w * 0.035, 26), '#fff');
      }
      if (t > 3) {
        this.bigText(ctx, r, 'どこかの しずかな ビーチにて', r.h * 0.33, Math.min(r.w * 0.028, 20), '#ffe8c0');
      }
      ctx.font = `bold ${Math.min(r.w * 0.032, 24)}px ${r.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(`さいしゅうスコア ${U.fmtScore(this.score)}`, r.w / 2, r.h * 0.9);
      ctx.textAlign = 'left';
      if (t > 4 && Math.sin(t * 3) > -0.3) {
        this.bigText(ctx, r, 'タップ / Enter でタイトルへ', r.h * 0.96, Math.min(r.w * 0.024, 17), 'rgba(255,255,255,0.8)');
      }
    },
  };
})();
