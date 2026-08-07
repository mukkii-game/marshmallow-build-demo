// マシュマロビルド - オーディオ基盤＋シンセ効果音
window.MB = window.MB || {};

(function () {
  const U = MB.util;

  MB.audio = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    muted: false,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
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

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.8;
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

  sfx.move = () => tone({ type: 'sine', freq: 520, dur: 0.05, gain: 0.08 });
  sfx.rotate = () => tone({ type: 'triangle', freq: 700, freqEnd: 880, dur: 0.07, gain: 0.1 });
  sfx.softDrop = () => tone({ type: 'sine', freq: 300, dur: 0.03, gain: 0.05 });

  // 接地: ぽふっ
  sfx.place = () => {
    tone({ type: 'sine', freq: 180, freqEnd: 90, dur: 0.12, gain: 0.18 });
    noise({ dur: 0.08, gain: 0.08, freq: 900, freqEnd: 300, type: 'lowpass' });
  };

  sfx.hardDrop = () => {
    tone({ type: 'sine', freq: 260, freqEnd: 80, dur: 0.16, gain: 0.22 });
    noise({ dur: 0.12, gain: 0.12, freq: 1200, freqEnd: 250, type: 'lowpass' });
  };

  // 回収ポップ: グループ内 i 個目（音階が上がる）
  const POP_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  sfx.pop = (i) => {
    const semis = POP_SCALE[Math.min(i, POP_SCALE.length - 1)];
    const f = 660 * Math.pow(2, semis / 12);
    tone({ type: 'triangle', freq: f, dur: 0.14, gain: 0.16 });
    noise({ dur: 0.05, gain: 0.05, freq: f * 3, q: 2 });
  };

  // まとめて確定（正方形数に応じて豪華に）
  sfx.groupClear = (n) => {
    const base = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    for (let i = 0; i < Math.min(4, 1 + n); i++) {
      tone({ type: 'triangle', freq: base[i], t: i * 0.04, dur: 0.3, gain: 0.14 });
    }
    if (n >= 3) tone({ type: 'sine', freq: 1318.5, t: 0.18, dur: 0.4, gain: 0.12 });
  };

  // S連鎖: キラキラアルペジオ
  sfx.sChain = (cells) => {
    const steps = Math.min(10, 3 + Math.floor(cells / 3));
    for (let i = 0; i < steps; i++) {
      const f = 880 * Math.pow(2, [0, 3, 7, 10, 12][i % 5] / 12 + Math.floor(i / 5));
      tone({ type: 'sine', freq: f, t: i * 0.05, dur: 0.2, gain: 0.1 });
    }
  };

  // もぐもぐ
  sfx.munch = () => {
    noise({ dur: 0.07, gain: 0.14, freq: 700, q: 0.8, freqEnd: 350, type: 'bandpass' });
    tone({ type: 'sine', freq: 220, freqEnd: 160, dur: 0.06, gain: 0.07 });
  };

  sfx.gaugeUp = () => tone({ type: 'sine', freq: 990, freqEnd: 1320, dur: 0.12, gain: 0.08 });

  // マッハタイム発動
  sfx.machStart = () => {
    noise({ dur: 0.5, gain: 0.12, freq: 400, freqEnd: 4000, type: 'bandpass', q: 3 });
    const chord = [523.25, 659.25, 783.99, 987.77, 1174.66];
    chord.forEach((f, i) => tone({ type: 'sawtooth', freq: f, t: 0.12 + i * 0.03, dur: 0.5, gain: 0.07 }));
  };

  sfx.machEnd = () => {
    tone({ type: 'triangle', freq: 880, freqEnd: 440, dur: 0.3, gain: 0.1 });
  };

  // ステージクリア: BUILD SUCCESS ジングル
  sfx.stageClear = () => {
    const seq = [[523.25, 0], [659.25, 0.09], [783.99, 0.18], [1046.5, 0.27], [1318.5, 0.42]];
    for (const [f, t] of seq) tone({ type: 'triangle', freq: f, t, dur: 0.35, gain: 0.16 });
    tone({ type: 'sine', freq: 2093, t: 0.42, dur: 0.6, gain: 0.08 });
  };

  sfx.gameOver = () => {
    tone({ type: 'triangle', freq: 392, freqEnd: 370, t: 0, dur: 0.4, gain: 0.14 });
    tone({ type: 'triangle', freq: 330, freqEnd: 300, t: 0.35, dur: 0.7, gain: 0.14 });
  };

  sfx.danger = () => tone({ type: 'square', freq: 880, dur: 0.08, gain: 0.05 });

  sfx.uiMove = () => tone({ type: 'sine', freq: 600, dur: 0.05, gain: 0.08 });
  sfx.uiSelect = () => {
    tone({ type: 'triangle', freq: 660, dur: 0.1, gain: 0.12 });
    tone({ type: 'triangle', freq: 990, t: 0.07, dur: 0.15, gain: 0.1 });
  };
  sfx.uiBack = () => tone({ type: 'triangle', freq: 440, freqEnd: 330, dur: 0.12, gain: 0.1 });

  sfx.countTick = () => tone({ type: 'sine', freq: 880, dur: 0.08, gain: 0.12 });
  sfx.countGo = () => tone({ type: 'sine', freq: 1760, dur: 0.3, gain: 0.14 });
})();
