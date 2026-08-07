// マシュマロビルド - ステージ定義（時間帯スキン＋自動生成BGMパターン）
window.MB = window.MB || {};

// 音楽パターンの記法:
//   kick/snare/hatC/hatO/clap: 16分ステップ番号の配列（1小節=16step）
//   roots: 小節ごとのベースルート(midi)。chords: 小節ごとの和音(midi配列)
//   bassSteps: 16step分の [ルートからの半音オフセット | null]
//   leadScale: リードが使う音階(midi)。leadDensity: 0..1 発音確率
MB.STAGES = [
  {
    id: 1, time: '19:00', name: '定時のあと',
    bpm: 96, sweepMeasures: 2, gravityMs: 1450, quota: 12,
    palette: {
      skyTop: '#4a3b78', skyBot: '#ff9a5c', city: '#2a2240',
      accent: '#ffd9a0', fieldBg: 'rgba(20,16,38,0.82)', frame: '#ffe9d4',
      stars: 0.15,
    },
    music: {
      kick: [0, 8], snare: [], hatC: [4, 12], hatO: [14], clap: [],
      roots: [36, 33, 29, 31],
      chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 65]],
      bassSteps: [0, null, null, null, null, null, 0, null, null, null, 12, null, null, null, null, null],
      leadScale: [72, 74, 76, 79, 81, 84], leadDensity: 0.22,
      padGain: 0.30, bassGain: 0.24, drumGain: 0.7, brightness: 900,
    },
  },
  {
    id: 2, time: '22:00', name: 'ノッてきた',
    bpm: 112, sweepMeasures: 2, gravityMs: 1150, quota: 17,
    palette: {
      skyTop: '#131b3a', skyBot: '#3a4a8c', city: '#0d1228',
      accent: '#7fd4ff', fieldBg: 'rgba(10,14,34,0.84)', frame: '#cfe9ff',
      stars: 0.5,
    },
    music: {
      kick: [0, 4, 8, 12], snare: [], hatC: [0, 4, 8, 12], hatO: [2, 6, 10, 14], clap: [4, 12],
      roots: [41, 36, 38, 34],
      chords: [[65, 69, 72], [64, 67, 72], [62, 65, 69], [58, 62, 65]],
      bassSteps: [0, null, 0, null, null, null, 0, null, 0, null, null, 0, null, null, 12, null],
      leadScale: [72, 74, 77, 79, 81, 84, 86], leadDensity: 0.3,
      padGain: 0.26, bassGain: 0.3, drumGain: 0.85, brightness: 1400,
    },
  },
  {
    id: 3, time: '25:00', name: '深夜のゾーン',
    bpm: 126, sweepMeasures: 2, gravityMs: 950, quota: 21,
    palette: {
      skyTop: '#07071e', skyBot: '#341b5e', city: '#0a0620',
      accent: '#b48cff', fieldBg: 'rgba(12,8,30,0.86)', frame: '#d9c8ff',
      stars: 0.9,
    },
    music: {
      kick: [0, 4, 8, 12], snare: [], hatC: [2, 6, 10, 14], hatO: [10], clap: [4, 12],
      roots: [33, 33, 29, 31],
      chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      bassSteps: [0, null, null, 0, null, null, 0, null, null, 0, null, null, 0, null, 3, null],
      leadScale: [69, 72, 74, 76, 79, 81, 84], leadDensity: 0.4,
      padGain: 0.22, bassGain: 0.32, drumGain: 0.9, brightness: 1800,
    },
  },
  {
    id: 4, time: '27:00', name: '眠気の谷',
    bpm: 134, sweepMeasures: 2, gravityMs: 820, quota: 26,
    palette: {
      skyTop: '#1a1030', skyBot: '#123a38', city: '#0c0a1e',
      accent: '#6cf0c8', fieldBg: 'rgba(8,14,24,0.86)', frame: '#c8f5e6',
      stars: 1.0,
    },
    music: {
      kick: [0, 4, 8, 12], snare: [4, 12], hatC: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hatO: [14], clap: [],
      roots: [38, 38, 34, 36],
      chords: [[62, 65, 69], [62, 65, 69], [58, 62, 65], [60, 63, 67]],
      bassSteps: [0, 0, null, 0, null, 0, 0, null, 0, 0, null, 0, null, 0, 3, 5],
      leadScale: [74, 77, 79, 81, 84, 86, 89], leadDensity: 0.5,
      padGain: 0.2, bassGain: 0.34, drumGain: 0.95, brightness: 2400,
    },
  },
  {
    id: 5, time: '28:30', name: '夜明け前、あとひとふんばり',
    bpm: 110, sweepMeasures: 2, gravityMs: 720, quota: 30,
    useTheme: true, // テーマ曲を使用（読めない場合は下記パターンにフォールバック）
    palette: {
      skyTop: '#0e1330', skyBot: '#27406e', city: '#101830',
      // 進捗で夜明けへ補間
      dawnTop: '#7fa8d9', dawnBot: '#ffd9b0',
      accent: '#ffd0e0', fieldBg: 'rgba(16,14,32,0.84)', frame: '#ffe2ec',
      stars: 0.6,
    },
    music: {
      kick: [0, 4, 8, 12], snare: [4, 12], hatC: [2, 6, 10, 14], hatO: [6, 14], clap: [],
      roots: [36, 43, 45, 41],
      chords: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]],
      bassSteps: [0, null, 0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 12],
      leadScale: [72, 74, 76, 79, 81, 84], leadDensity: 0.35,
      padGain: 0.3, bassGain: 0.3, drumGain: 0.85, brightness: 2000,
    },
  },
];

// テーマ曲の同期情報（tools/analyze.html で実測済み）
MB.THEME_SYNC = {
  bpm: 110,       // 実測 109.96
  offset: 0.464,  // 最初の拍の秒位置
};

// エンドレスモード: スキンを周回し、テンポと落下速度が漸増する
MB.ENDLESS = {
  order: [0, 1, 2, 3],
  squaresPerSkin: 16,          // この数だけ正方形を回収したら次のスキンへ
  bpmRamp: 4,                  // 周回ごとのBPM加算
  gravityRamp: 0.92,           // 周回ごとの落下間隔倍率
  minGravityMs: 240,
};
