// マシュマロビルド - オーディオ基盤＋シンセ効果音
window.MB = window.MB || {};

(function () {
  const U = MB.util;

  MB.audio = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    volume: 0.5,   // 0..1（デフォルトは控えめ）
    lastVol: 0.5,

    get muted() { return this.volume === 0; },

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8 * this.volume;
      // リミッター（音割れ・音圧の暴れ防止）
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 9;
      comp.attack.value = 0.003;
      comp.release.value = 0.24;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.75;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      return this.ctx;
    },

    setVolume(v) {
      this.volume = MB.util.clamp(v, 0, 1);
      if (this.volume > 0) this.lastVol = this.volume;
      if (this.master) this.master.gain.value = 0.8 * this.volume;
      if (MB.music && MB.music.applyVolume) MB.music.applyVolume();
    },

    // 互換用: ミュートのオン/オフ
    setMuted(m) {
      this.setVolume(m ? 0 : (this.lastVol || 0.5));
    },
  };

  // ---- シンセ効果音 ----
  const sfx = {};
  MB.sfx = sfx;

  function ctx() { return MB.audio.ctx; }
  function bus() { return MB.audio.sfxBus; }

  // 基本音: osc + envelope
  function tone({ type = 'sine', freq = 440, freqEnd = null, t = 0, dur = 0.15,
                  gain = 0.2, attack = 0.004, curve = 2 }) {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime + t;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setTargetAtTime(0, t0 + attack, dur / curve);
    o.connect(g).connect(bus());
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  function noise({ t = 0, dur = 0.1, gain = 0.15, freq = 1800, q = 1, type = 'bandpass',
                   freqEnd = null }) {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime + t;
    const len = Math.max(1, Math.floor(c.sampleRate * (dur + 0.05)));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.setTargetAtTime(0, t0, dur / 3);
    src.connect(f).connect(g).connect(bus());
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // やわらかベル（サイン基音＋非整数倍音で「ぽーん」）
  function bell({ freq = 660, t = 0, dur = 0.5, gain = 0.14, soft = false }) {
    const c = ctx();
    if (!c) return;
    tone({ type: 'sine', freq, t, dur, gain, attack: soft ? 0.02 : 0.005, curve: 2.4 });
    tone({ type: 'sine', freq: freq * 2.756, t, dur: dur * 0.4, gain: gain * 0.22, attack: 0.003 });
    tone({ type: 'sine', freq: freq * 5.4, t, dur: dur * 0.18, gain: gain * 0.08, attack: 0.002 });
  }

  // ぽわんとした木琴風
  function pluck({ freq = 440, t = 0, gain = 0.14 }) {
    tone({ type: 'triangle', freq, t, dur: 0.22, gain, attack: 0.004, curve: 3 });
    tone({ type: 'sine', freq: freq * 3, t, dur: 0.08, gain: gain * 0.25 });
  }

  const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
              C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77,
              C6: 1046.5, D6: 1174.66, E6: 1318.5, G6: 1567.98, A6: 1760, C7: 2093 };

  sfx.move = () => pluck({ freq: N.A5, gain: 0.05 });
  sfx.rotate = () => {
    pluck({ freq: N.D5, gain: 0.07 });
    pluck({ freq: N.G5, t: 0.03, gain: 0.06 });
  };
  sfx.softDrop = () => tone({ type: 'sine', freq: 300, dur: 0.03, gain: 0.04 });

  // 接地: やわらか「ぽふっ」
  sfx.place = () => {
    tone({ type: 'sine', freq: 150, freqEnd: 82, dur: 0.13, gain: 0.15, attack: 0.008 });
    noise({ dur: 0.09, gain: 0.06, freq: 650, freqEnd: 220, type: 'lowpass' });
  };

  sfx.hardDrop = () => {
    tone({ type: 'sine', freq: 210, freqEnd: 62, dur: 0.18, gain: 0.2, attack: 0.006 });
    noise({ dur: 0.1, gain: 0.08, freq: 900, freqEnd: 200, type: 'lowpass' });
  };

  // 回収ポップ: ペンタトニックのベルが駆け上がる
  const POP_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  sfx.pop = (i) => {
    const semis = POP_SCALE[Math.min(i, POP_SCALE.length - 1)];
    bell({ freq: N.E5 * Math.pow(2, semis / 12), dur: 0.35, gain: 0.12 });
  };

  // まとめて確定: Cadd9のベルアルペジオ（数が多いほど豪華）
  sfx.groupClear = (n) => {
    const notes = [N.C5, N.E5, N.G5, N.D6, N.C6, N.E6];
    const count = Math.min(notes.length, 2 + n);
    for (let i = 0; i < count; i++) {
      bell({ freq: notes[i], t: i * 0.055, dur: 0.55, gain: 0.13 });
    }
    if (n >= 3) {
      bell({ freq: N.G6, t: count * 0.055 + 0.05, dur: 0.9, gain: 0.11 });
      noise({ dur: 0.35, gain: 0.045, freq: 6000, q: 0.6, type: 'highpass', t: 0.1 });
    }
  };

  // S連鎖: きらきらグリッサンド
  sfx.sChain = (cells) => {
    const steps = Math.min(12, 4 + Math.floor(cells / 2));
    const scale = [0, 4, 7, 12, 16, 19, 24];
    for (let i = 0; i < steps; i++) {
      bell({ freq: N.A5 * Math.pow(2, scale[i % scale.length] / 12 + Math.floor(i / scale.length)), t: i * 0.045, dur: 0.4, gain: 0.09 });
    }
    noise({ dur: 0.5, gain: 0.05, freq: 7000, q: 0.5, type: 'highpass', t: 0.05 });
  };

  // もぐもぐ: ぷにっとした2連ブリップ
  sfx.munch = () => {
    tone({ type: 'sine', freq: 330, freqEnd: 210, dur: 0.05, gain: 0.09, attack: 0.005 });
    tone({ type: 'sine', freq: 290, freqEnd: 180, t: 0.06, dur: 0.05, gain: 0.07, attack: 0.005 });
    noise({ dur: 0.05, gain: 0.05, freq: 500, q: 1.2, freqEnd: 300, type: 'bandpass' });
  };

  sfx.gaugeUp = () => bell({ freq: N.B5, dur: 0.25, gain: 0.06 });

  // マッハタイム発動: ライザー→ベル和音＋サブドロップ
  sfx.machStart = () => {
    noise({ dur: 0.45, gain: 0.1, freq: 500, freqEnd: 5000, type: 'bandpass', q: 2.5 });
    tone({ type: 'sine', freq: 200, freqEnd: 55, t: 0.4, dur: 0.4, gain: 0.2 });
    [N.C5, N.E5, N.G5, N.B5, N.D6].forEach((f, i) =>
      bell({ freq: f, t: 0.38 + i * 0.045, dur: 1.0, gain: 0.12 }));
  };

  sfx.machEnd = () => {
    bell({ freq: N.G5, dur: 0.4, gain: 0.09, soft: true });
    bell({ freq: N.C5, t: 0.14, dur: 0.6, gain: 0.09, soft: true });
  };

  // ステージクリア: 「おしごとかんりょう」ジングル
  sfx.stageClear = () => {
    const melody = [[N.C5, 0], [N.E5, 0.1], [N.G5, 0.2], [N.C6, 0.32], [N.A5, 0.5], [N.C6, 0.62], [N.E6, 0.76]];
    for (const [f, t] of melody) bell({ freq: f, t, dur: 0.6, gain: 0.14 });
    bell({ freq: N.G6, t: 0.96, dur: 1.4, gain: 0.12 });
    // やわらかい和音の土台
    [N.C4, N.E4, N.G4].forEach((f) =>
      tone({ type: 'triangle', freq: f, t: 0.3, dur: 1.6, gain: 0.05, attack: 0.15, curve: 1.5 }));
  };

  // やさしい残念ジングル（責めない音）
  sfx.gameOver = () => {
    bell({ freq: N.E5, t: 0, dur: 0.5, gain: 0.11, soft: true });
    bell({ freq: N.C5, t: 0.22, dur: 0.5, gain: 0.11, soft: true });
    bell({ freq: N.A4, t: 0.44, dur: 0.9, gain: 0.11, soft: true });
    tone({ type: 'triangle', freq: N.F4, t: 0.44, dur: 1.2, gain: 0.05, attack: 0.2 });
  };

  sfx.danger = () => pluck({ freq: N.A5, gain: 0.05 });

  sfx.uiMove = () => pluck({ freq: N.G5, gain: 0.07 });
  sfx.uiSelect = () => {
    bell({ freq: N.G5, dur: 0.25, gain: 0.1 });
    bell({ freq: N.C6, t: 0.07, dur: 0.4, gain: 0.1 });
  };
  sfx.uiBack = () => pluck({ freq: N.D5, gain: 0.08 });

  sfx.countTick = () => pluck({ freq: N.A5, gain: 0.1 });
  sfx.countGo = () => bell({ freq: N.A6, dur: 0.5, gain: 0.13 });
})();
