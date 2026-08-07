// マシュマロビルド - 定数
window.MB = window.MB || {};

MB.C = {
  COLS: 16,
  ROWS: 10,
  SPAWN_X: 7,          // ピース左上の初期列
  WHITE: 0,            // マシュマロ色: 真っ白
  PINK: 1,             // マシュマロ色: いちご
  STORAGE_KEY: 'mashubuild_v1',

  // ゲージ調整値
  GAUGE_PER_SQUARE: 6,
  GAUGE_PER_SQUARE_BONUS: 10, // 1周3個目以降
  GAUGE_MISS_DECAY: 8,        // 空振り周回
  MACH_MEASURES: 8,           // マッハタイム継続小節数

  // スコア
  SCORE_SQUARE_BASE: 40,      // 40 * n^2
  SCORE_CHAIN_CELL: 10,

  // ピース
  S_BLOCK_INTERVAL_MIN: 9,    // Sマーク出現間隔
  S_BLOCK_INTERVAL_MAX: 14,

  SOFT_DROP_MS: 35,
  SETTLE_ROWS_PER_SEC: 46,    // 分離落下の速度
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
