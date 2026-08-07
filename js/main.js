// マシュマロビルド - エントリーポイント
(function () {
  function boot() {
    // デバッグ: ?size=1280x720 で固定サイズ描画（自動テスト用）
    const m = location.search.match(/size=(\d+)x(\d+)/);
    if (m) MB.DEBUG_SIZE = { w: +m[1], h: +m[2] };

    // Webフォントの先読み（オフライン時はシステムフォントにフォールバック）
    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 32px "Mochiy Pop One"');
      document.fonts.load('700 16px "M PLUS Rounded 1c"');
      document.fonts.load('800 16px "M PLUS Rounded 1c"');
    }

    const canvas = document.getElementById('game');
    MB.render.init(canvas);
    MB.game.init(MB.input);
    MB.input.init(canvas, MB.game);
    MB.input.layoutButtons();
    MB.music.initTheme(document.getElementById('themeAudio'));

    window.addEventListener('resize', () => {
      MB.render.resize();
      MB.input.layoutButtons();
    });

    // タブ非表示で自動ポーズ
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && MB.game.state === MB.STATE.PLAY) {
        MB.game.action('pause');
      }
    });

    // 最初の操作でオーディオ解錠
    const unlock = () => { MB.audio.ensure(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // ウィンドウサイズ変化の検知（resizeイベントを取りこぼす環境対策）
      if (!MB.DEBUG_SIZE && window.innerWidth > 0 &&
          (window.innerWidth !== MB.render.w || window.innerHeight !== MB.render.h)) {
        MB.render.resize();
        MB.input.layoutButtons();
      }
      MB.game.update(dt);
      MB.game.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // デバッグ: 手動でフレームを進める（rAFが止まる環境の自動テスト用）
    MB.step = (n, dt) => {
      for (let i = 0; i < (n || 1); i++) {
        MB.game.update(dt || 1 / 60);
      }
      MB.game.draw();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
