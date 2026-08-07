// マシュマロビルド - 定数
window.MB = window.MB || {};

MB.C = {
  COLS: 10,            // でっかいマシュマロの粗いグリッド
  ROWS: 8,
  SPAWN_X: 4,          // ピース左上の初期列
  WHITE: 0,            // マシュマロ色: 真っ白
  PINK: 1,             // マシュマロ色: いちご
  STORAGE_KEY: 'mashubuild_v1',

  // ゲージ調整値
  GAUGE_PER_SQUARE: 8,
  GAUGE_PER_SQUARE_BONUS: 13, // 1周3個目以降
  GAUGE_MISS_DECAY: 8,        // 空振り周回
  MACH_MEASURES: 8,           // マッハタイム継続小節数

  // スコア
  SCORE_SQUARE_BASE: 40,      // 40 * n^2
  SCORE_CHAIN_CELL: 10,

  // ピース
  S_BLOCK_INTERVAL_MIN: 9,    // Sマーク出現間隔
  S_BLOCK_INTERVAL_MAX: 14,
  BAR_INTERVAL_MIN: 6,        // のっぽマシュマロ（棒）出現間隔
  BAR_INTERVAL_MAX: 10,

  SOFT_DROP_MS: 40,
  SETTLE_START_SPEED: 5,      // 分離落下の初速（行/秒）
  SETTLE_ACCEL: 70,           // 分離落下の重力加速（行/秒²）
};

MB.STATE = {
  BOOT: 'boot',
  TITLE: 'title',
  MENU: 'menu',
  STAGE_INTRO: 'stage_intro',
  PLAY: 'play',
  PAUSE: 'pause',
  STAGE_CLEAR: 'stage_clear',
  GAME_OVER: 'game_over',
  ENDING: 'ending',
  RESULT: 'result',
};
