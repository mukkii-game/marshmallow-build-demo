// マシュマロビルド - 自動生成BGMエンジン（ステップシーケンサ）＋テーマ曲同期
window.MB = window.MB || {};

(function () {
  const U = MB.util;
  const LOOKAHEAD = 0.16; // 先読み秒
  const STEPS = 16;       // 1小節 = 16分 x 16

  MB.music = {
    mode: 'off',          // 'gen' | 'theme' | 'off'
    cfg: null,            // ステージのmusic設定
    bpm: 120,
    sweepMeasures: 2,
    stepDur: 0,
    nextStepTime: 0,
    stepIndex: 0,
    measureIndex: 0,
    loopStartTime: 0,
    flow: 0,              // 0..1 ノリ
    mach: false,
    themeAudio: null,
    themeReady: false,
    started: false,

    themeBase: 0.8,

    // マスター音量変更をテーマ曲にも反映
    applyVolume() {
      if (this.themeAudio) this.themeAudio.volume = this.themeBase * MB.audio.volume;
    },

    initTheme(audioEl) {
      this.themeAudio = audioEl;
      if (!audioEl) return;
      audioEl.addEventListener('canplaythrough', () => { this.themeReady = true; }, { once: true });
      audioEl.addEventListener('error', () => { this.themeReady = false; });
      audioEl.load();
    },

    setIntensity(flow01, mach) {
      this.flow = U.clamp(flow01, 0, 1);
      this.mach = !!mach;
    },

    // preferTheme: 設定「マシュマロのうた」でテーマ曲を全ステージ通しで流す
    startStage(stage, bpmOverride, preferTheme) {
      const c = MB.audio.ensure();
      this.cfg = stage.music;
      this.sweepMeasures = stage.sweepMeasures || 2;
      const wantTheme = (preferTheme || stage.useTheme) && this.themeReady;
      if (wantTheme) {
        this.mode = 'theme';
        this.bpm = MB.THEME_SYNC.bpm;
        const a = this.themeAudio;
        a.loop = true;
        this.themeBase = 0.8;
        a.volume = this.themeBase * MB.audio.volume;
        if (a.paused) {
          a.currentTime = 0;
          a.play().catch(() => { this.startGenerative(c); });
        } // 再生中ならそのまま続ける（シームレス）
      } else {
        this.stopTheme();
        this.bpm = bpmOverride || stage.bpm;
        this.startGenerative(c);
      }
      this.started = true;
    },

    // オーディオ不可時（自動再生ブロック等）はperformance.nowで時を刻む
    now() {
      const c = MB.audio.ctx;
      if (c && c.state === 'running') return c.currentTime;
      return performance.now() / 1000;
    },

    startGenerative(c) {
      this.mode = 'gen';
      this.stepDur = 60 / this.bpm / 4;
      this.stepIndex = 0;
      this.measureIndex = 0;
      this._fallbackClock = !c || c.state !== 'running';
      this.loopStartTime = this.now() + 0.08;
      this.nextStepTime = this.loopStartTime;
    },

    stop() {
      this.mode = 'off';
      this.started = false;
      this.stopTheme();
    },

    stopTheme() {
      const a = this.themeAudio;
      if (a && !a.paused) a.pause();
    },

    playThemeSolo(volume) {
      // タイトル/エンディング用: テーマ曲のみ再生
      if (!this.themeReady) return false;
      this.mode = 'theme';
      this.bpm = MB.THEME_SYNC.bpm;
      this.sweepMeasures = 2;
      const a = this.themeAudio;
      a.loop = true;
      this.themeBase = volume == null ? 0.7 : volume;
      a.volume = this.themeBase * MB.audio.volume;
      if (a.paused) { a.currentTime = 0; a.play().catch(() => {}); }
      this.started = true;
      return true;
    },

    pause() {
      if (this.mode === 'theme' && this.themeAudio) this.themeAudio.pause();
      if (MB.audio.ctx && MB.audio.ctx.state === 'running') MB.audio.ctx.suspend();
    },
    resume() {
      if (MB.audio.ctx && MB.audio.ctx.state === 'suspended') MB.audio.ctx.resume();
      if (this.mode === 'theme' && this.themeAudio && this.started) this.themeAudio.play().catch(() => {});
    },

    // タイムライン位相 0..1（sweepMeasures小節で1周）
    getSweepPhase() {
      if (this.mode === 'theme' && this.themeAudio) {
        const t = this.themeAudio.currentTime - MB.THEME_SYNC.offset;
        const period = (60 / this.bpm) * 4 * this.sweepMeasures;
        return ((t / period) % 1 + 1) % 1;
      }
      if (this.mode === 'gen') {
        const t = this.now() - this.loopStartTime;
        const period = this.stepDur * STEPS * this.sweepMeasures;
        return ((t / period) % 1 + 1) % 1;
      }
      return 0;
    },

    // いまの拍情報: offsetMs=最寄りの拍からのズレ, idx=拍番号（4で1小節）
    beatInfo() {
      let t = -1;
      const spb = 60 / this.bpm;
      if (this.mode === 'theme' && this.themeAudio) {
        t = this.themeAudio.currentTime - MB.THEME_SYNC.offset;
      } else if (this.mode === 'gen') {
        t = this.now() - this.loopStartTime;
      }
      if (t < 0) return null;
      const frac = (t / spb) % 1;
      const off = frac < 0.5 ? frac : frac - 1;
      return { offsetMs: off * spb * 1000, idx: Math.floor(t / spb) };
    },

    // 拍位相 0..1（1拍で1周・演出パルス用）
    getBeatPulse() {
      let t = -1, spb = 60 / this.bpm;
      if (this.mode === 'theme' && this.themeAudio) {
        t = this.themeAudio.currentTime - MB.THEME_SYNC.offset;
      } else if (this.mode === 'gen') {
        t = this.now() - this.loopStartTime;
      }
      if (t < 0) return 0;
      return 1 - ((t / spb) % 1);
    },

    update() {
      if (this.mode !== 'gen' || !MB.audio.ctx || !this.cfg) return;
      const c = MB.audio.ctx;
      // オーディオが後から使えるようになったら時計を掛け替える
      if (this._fallbackClock && c.state === 'running') {
        const phase = this.getSweepPhase();
        this._fallbackClock = false;
        const period = this.stepDur * STEPS * this.sweepMeasures;
        this.loopStartTime = c.currentTime - phase * period;
        this.nextStepTime = c.currentTime + 0.05;
        this.stepIndex = Math.floor((phase * this.sweepMeasures % 1) * STEPS) % STEPS;
      }
      if (c.state !== 'running') return; // 無音でも時間は進む（スケジュールだけ休止）
      while (this.nextStepTime < c.currentTime + LOOKAHEAD) {
        this.scheduleStep(this.stepIndex, this.measureIndex, this.nextStepTime);
        this.stepIndex++;
        if (this.stepIndex >= STEPS) {
          this.stepIndex = 0;
          this.measureIndex++;
        }
        this.nextStepTime += this.stepDur;
      }
    },

    scheduleStep(step, measure, t) {
      const m = this.cfg;
      const bar = measure % m.roots.length;
      const drumG = m.drumGain * (this.mach ? 1.1 : 1);

      if (m.kick.includes(step)) this.kick(t, drumG);
      if (m.snare.includes(step)) this.snare(t, drumG * 0.8);
      if (m.clap.includes(step) && (this.flow > 0.25 || this.mach)) this.clap(t, drumG * 0.6);

      // ハイハット: ノリで音量、マッハで16分連打
      const hatOn = m.hatC.includes(step) || (this.mach && step % 2 === 0);
      if (hatOn) this.hatC(t, drumG * (0.35 + 0.45 * this.flow));
      if (m.hatO.includes(step) && (this.flow > 0.15 || this.mach)) this.hatO(t, drumG * 0.5);

      // ベース
      const off = m.bassSteps[step];
      if (off !== null && off !== undefined) {
        this.bass(t, U.midiToFreq(m.roots[bar] + off), m.bassGain, m.brightness * (0.7 + 0.5 * this.flow + (this.mach ? 0.5 : 0)));
      }

      // パッド: 小節頭
      if (step === 0) this.pad(t, m.chords[bar], m.padGain * (this.mach ? 0.8 : 1));

      // リード: ノリが高い or マッハ時
      const leadOn = this.mach || this.flow > 0.5;
      if (leadOn && step % 2 === 0) {
        const density = m.leadDensity * (this.mach ? 1.6 : 1);
        // 疑似乱数（再現性のため step/measure から生成）
        const h = Math.sin((measure * 16 + step) * 12.9898) * 43758.5453;
        const rnd = h - Math.floor(h);
        if (rnd < density) {
          const note = m.leadScale[Math.floor(rnd * 997) % m.leadScale.length];
          this.lead(t, U.midiToFreq(note), 0.09);
        }
      }
    },

    // ---- 音色 ----
    v(t) { return MB.audio.ctx; },

    kick(t, g) {
      const c = MB.audio.ctx;
      const o = c.createOscillator(), gn = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      gn.gain.setValueAtTime(0.5 * g, t);
      gn.gain.setTargetAtTime(0, t + 0.005, 0.05);
      o.connect(gn).connect(MB.audio.musicBus);
      o.start(t); o.stop(t + 0.3);
    },

    noiseBuf() {
      if (this._nb) return this._nb;
      const c = MB.audio.ctx;
      const len = c.sampleRate * 1;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._nb = buf;
      return buf;
    },

    noiseVoice(t, dur, g, freq, type, q) {
      const c = MB.audio.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf();
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
      const gn = c.createGain();
      gn.gain.setValueAtTime(g, t);
      gn.gain.setTargetAtTime(0, t, dur / 3);
      src.connect(f).connect(gn).connect(MB.audio.musicBus);
      src.start(t); src.stop(t + dur + 0.05);
    },

    hatC(t, g) { this.noiseVoice(t, 0.04, 0.25 * g, 8000, 'highpass', 1); },
    hatO(t, g) { this.noiseVoice(t, 0.18, 0.2 * g, 7000, 'highpass', 1); },
    clap(t, g) { this.noiseVoice(t, 0.12, 0.4 * g, 1800, 'bandpass', 1.5); },

    snare(t, g) {
      this.noiseVoice(t, 0.12, 0.5 * g, 2500, 'bandpass', 0.8);
      const c = MB.audio.ctx;
      const o = c.createOscillator(), gn = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      gn.gain.setValueAtTime(0.25 * g, t);
      gn.gain.setTargetAtTime(0, t, 0.04);
      o.connect(gn).connect(MB.audio.musicBus);
      o.start(t); o.stop(t + 0.2);
    },

    bass(t, freq, g, cutoff) {
      const c = MB.audio.ctx;
      const o = c.createOscillator(), gn = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 4;
      gn.gain.setValueAtTime(g, t);
      gn.gain.setTargetAtTime(0, t + 0.02, 0.08);
      o.connect(f).connect(gn).connect(MB.audio.musicBus);
      o.start(t); o.stop(t + 0.3);
    },

    pad(t, notes, g) {
      const c = MB.audio.ctx;
      const dur = this.stepDur * STEPS;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200 + this.flow * 1500 + (this.mach ? 1200 : 0);
      const gn = c.createGain();
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(g / notes.length, t + dur * 0.25);
      gn.gain.setValueAtTime(g / notes.length, t + dur * 0.7);
      gn.gain.linearRampToValueAtTime(0, t + dur);
      f.connect(gn).connect(MB.audio.musicBus);
      for (const n of notes) {
        for (const det of [-4, 4]) {
          const o = c.createOscillator();
          o.type = 'triangle';
          o.frequency.value = U.midiToFreq(n);
          o.detune.value = det;
          o.connect(f);
          o.start(t); o.stop(t + dur + 0.05);
        }
      }
    },

    lead(t, freq, g) {
      const c = MB.audio.ctx;
      const o = c.createOscillator(), gn = c.createGain(), f = c.createBiquadFilter();
      o.type = 'square';
      o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = 3500;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(g, t + 0.01);
      gn.gain.setTargetAtTime(0, t + 0.05, 0.06);
      o.connect(f).connect(gn).connect(MB.audio.musicBus);
      o.start(t); o.stop(t + 0.35);
      // 軽いエコー
      const o2 = c.createOscillator(), gn2 = c.createGain(), f2 = c.createBiquadFilter();
      o2.type = 'square'; o2.frequency.value = freq;
      f2.type = 'lowpass'; f2.frequency.value = 2200;
      const dt = this.stepDur * 3;
      gn2.gain.setValueAtTime(0, t + dt);
      gn2.gain.linearRampToValueAtTime(g * 0.35, t + dt + 0.01);
      gn2.gain.setTargetAtTime(0, t + dt + 0.04, 0.05);
      o2.connect(f2).connect(gn2).connect(MB.audio.musicBus);
      o2.start(t + dt); o2.stop(t + dt + 0.3);
    },
  };
})();
