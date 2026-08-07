// マシュマロビルド - コアロジック（フィールド／ピース／スイープ回収）
window.MB = window.MB || {};

(function () {
  const C = MB.C;

  // ---- ピース ----
  // quad: 2x2マシュマロ（cells: 0=左上 1=右上 2=左下 3=右下）
  // bar : のっぽマシュマロ（縦1x3、回転で横3x1・単色）
  class Piece {
    constructor(cells, kind) {
      this.cells = cells; // [{color, s}]
      this.kind = kind || 'quad';
      this.orient = 0;    // barのみ: 0=縦 1=横
      this.x = C.SPAWN_X;
      this.y = -2;
    }
    offsets() {
      if (this.kind === 'bar') {
        return this.orient === 0
          ? [[0, 0], [0, 1], [0, 2]]
          : [[0, 0], [1, 0], [2, 0]];
      }
      return [[0, 0], [1, 0], [0, 1], [1, 1]];
    }
    width() { return this.kind === 'bar' ? (this.orient === 0 ? 1 : 3) : 2; }
    height() { return this.kind === 'bar' ? (this.orient === 0 ? 3 : 1) : 2; }
    rotate(dir) {
      const c = this.cells;
      if (dir > 0) { // 時計回り: TL->TR->BR->BL->TL
        this.cells = [c[2], c[0], c[3], c[1]];
      } else {
        this.cells = [c[1], c[3], c[0], c[2]];
      }
    }
  }

  class PieceGen {
    constructor() {
      this.sCountdown = MB.util.randInt(C.S_BLOCK_INTERVAL_MIN, C.S_BLOCK_INTERVAL_MAX);
      this.barCountdown = MB.util.randInt(C.BAR_INTERVAL_MIN, C.BAR_INTERVAL_MAX);
    }
    next() {
      // ときどき「のっぽマシュマロ」（単色の棒）
      if (--this.barCountdown <= 0) {
        this.barCountdown = MB.util.randInt(C.BAR_INTERVAL_MIN, C.BAR_INTERVAL_MAX);
        const col = Math.random() < 0.5 ? C.WHITE : C.PINK;
        return new Piece([{ color: col, s: false }, { color: col, s: false }, { color: col, s: false }], 'bar');
      }
      const r = Math.random();
      const A = Math.random() < 0.5 ? C.WHITE : C.PINK;
      const B = A === C.WHITE ? C.PINK : C.WHITE;
      let colors;
      if (r < 0.18) { // 単色（巨大合体のもと）
        colors = [A, A, A, A];
      } else if (r < 0.42) { // 3-1
        colors = [A, A, A, A];
        colors[MB.util.randInt(0, 3)] = B;
      } else if (r < 0.82) { // 2-2 隣接（縦割り/横割り）
        colors = Math.random() < 0.5 ? [A, B, A, B] : [A, A, B, B];
      } else { // 2-2 対角
        colors = [A, B, B, A];
      }
      const cells = colors.map((col) => ({ color: col, s: false }));
      if (--this.sCountdown <= 0) {
        cells[MB.util.randInt(0, 3)].s = true;
        this.sCountdown = MB.util.randInt(C.S_BLOCK_INTERVAL_MIN, C.S_BLOCK_INTERVAL_MAX);
      }
      return new Piece(cells);
    }
  }

  // ---- フィールド ----
  class Field {
    constructor() {
      this.grid = [];
      for (let y = 0; y < C.ROWS; y++) this.grid.push(new Array(C.COLS).fill(null));
      this.fallers = [];        // 分離落下中のマシュマロ {x, y(float), color, s}
      this.squareOrigins = [];  // 予約正方形の左上座標
      this.sweepGroup = [];     // スイープ回収中のセル座標
      this.sweepX = 0;          // タイムライン位置（0..COLS）
      this.prevSweepCol = -1;
      this.clearedThisSweep = false;
      this.overflow = false;
      this.piece = null;

      // コールバック（game.jsが設定）
      this.onClear = null;      // ({squares, chainCells, cells}) 回収発生
      this.onSweepMiss = null;  // 1周なにも消せなかった
      this.onWrap = null;       // タイムラインが1周した (clearedAny)
      this.onLock = null;       // ピース接地
    }

    reset() {
      for (let y = 0; y < C.ROWS; y++) this.grid[y].fill(null);
      this.fallers = [];
      this.squareOrigins = [];
      this.sweepGroup = [];
      this.sweepX = 0;
      this.prevSweepCol = -1;
      this.clearedThisSweep = false;
      this.overflow = false;
      this.piece = null;
    }

    cellAt(x, y) {
      if (y < 0) return null;
      if (x < 0 || x >= C.COLS || y >= C.ROWS) return undefined; // 場外
      return this.grid[y][x];
    }

    // ピースの形状で置けるか判定
    canPlacePiece(p, px, py) {
      for (const [dx, dy] of p.offsets()) {
        const x = px + dx, y = py + dy;
        if (x < 0 || x >= C.COLS) return false;
        if (y >= C.ROWS) return false;
        if (y >= 0 && this.grid[y][x]) return false;
      }
      return true;
    }

    canPlace(px, py) {
      return this.piece ? this.canPlacePiece(this.piece, px, py) : false;
    }

    spawn(piece) {
      piece.x = Math.min(C.SPAWN_X, C.COLS - piece.width());
      piece.y = -piece.height();
      this.piece = piece;
    }

    tryMove(dx) {
      const p = this.piece;
      if (!p) return false;
      if (this.canPlacePiece(p, p.x + dx, p.y)) { p.x += dx; return true; }
      return false;
    }

    tryRotate(dir) {
      const p = this.piece;
      if (!p) return false;
      if (p.kind === 'bar') {
        // 縦⇔横。壁や積みに当たるときは少しずらして試す（壁蹴り）
        const oldOrient = p.orient, oldX = p.x, oldY = p.y;
        p.orient ^= 1;
        const cands = p.orient === 1
          ? [[0, 0], [-1, 0], [-2, 0], [0, -1]]   // 横になる: 左へずらす
          : [[0, 0], [0, -1], [0, -2], [1, 0]];   // 縦になる: 上へずらす
        for (const [dx, dy] of cands) {
          const nx = MB.util.clamp(p.x + dx, 0, C.COLS - p.width());
          if (this.canPlacePiece(p, nx, p.y + dy)) {
            p.x = nx;
            p.y += dy;
            return true;
          }
        }
        p.orient = oldOrient; p.x = oldX; p.y = oldY;
        return false;
      }
      p.rotate(dir);
      return true; // 2x2の色回転は衝突形状が変わらないため常に成功
    }

    // 重力1段。動けなければ接地して列分離
    dropStep() {
      const p = this.piece;
      if (!p) return 'none';
      if (this.canPlacePiece(p, p.x, p.y + 1)) { p.y++; return 'moved'; }
      this.lockPiece();
      return 'locked';
    }

    hardDrop() {
      const p = this.piece;
      if (!p) return 0;
      let dist = 0;
      while (this.canPlacePiece(p, p.x, p.y + 1)) { p.y++; dist++; }
      this.lockPiece();
      return dist;
    }

    ghostY() {
      const p = this.piece;
      if (!p) return -99;
      let y = p.y;
      while (this.canPlacePiece(p, p.x, y + 1)) y++;
      return y;
    }

    lockPiece() {
      const p = this.piece;
      if (!p) return;
      // 列ごとに分離して落下アニメへ
      const offs = p.offsets();
      for (let i = 0; i < offs.length; i++) {
        const [dx, dy] = offs[i];
        this.fallers.push({
          x: p.x + dx, y: p.y + dy, vy: C.SETTLE_START_SPEED,
          color: p.cells[i].color, s: p.cells[i].s,
        });
      }
      this.piece = null;
      if (this.onLock) this.onLock();
    }

    // 落下中マシュマロの更新（重力加速つき）。全部着地したら true
    updateFallers(dt) {
      if (this.fallers.length === 0) return true;
      // 列ごとに下のものから処理
      const byCol = new Map();
      for (const f of this.fallers) {
        if (!byCol.has(f.x)) byCol.set(f.x, []);
        byCol.get(f.x).push(f);
      }
      const placed = new Set();
      for (const [x, list] of byCol) {
        list.sort((a, b) => b.y - a.y);
        // グリッド上の支え（いちばん上の占有セル）
        let gridTop = C.ROWS;
        for (let y = 0; y < C.ROWS; y++) {
          if (this.grid[y][x]) { gridTop = y; break; }
        }
        let cap = gridTop - 1;   // このセルが降りられる最下段
        let capSolid = true;     // capが接地由来（true）か、まだ落下中のセル由来（false）か
        for (const f of list) {
          f.vy = (f.vy || C.SETTLE_START_SPEED) + C.SETTLE_ACCEL * dt;
          f.y = Math.min(f.y + f.vy * dt, cap);
          if (capSolid && f.y >= cap - 1e-6) {
            // 着地（支えが確定しているときだけ固定する）
            const ty = Math.round(cap);
            if (ty < 0) {
              this.overflow = true;
              placed.add(f); // 場外（あふれ演出はゲーム側）
            } else {
              const now = performance.now();
              this.grid[ty][x] = { color: f.color, s: f.s, marked: false, sweeping: false, born: now };
              // まわりのマシュマロがぷにっと受け止める（下2つ＋左右）
              for (let jy = ty + 1; jy < Math.min(ty + 3, C.ROWS); jy++) {
                if (this.grid[jy][x]) this.grid[jy][x].jig = now;
              }
              for (const nx of [x - 1, x + 1]) {
                if (nx >= 0 && nx < C.COLS && this.grid[ty][nx]) this.grid[ty][nx].jig = now;
              }
              placed.add(f);
              cap = ty - 1;
            }
          } else {
            // まだ空中: 上のセルは自分のすぐ上まで
            cap = f.y - 1;
            capSolid = false;
          }
        }
      }
      if (placed.size) this.fallers = this.fallers.filter((f) => !placed.has(f));
      if (this.fallers.length === 0) {
        this.computeMarks();
        return true;
      }
      return false;
    }

    // 2x2同色の予約検出
    computeMarks() {
      this.squareOrigins = [];
      for (let y = 0; y < C.ROWS; y++) {
        for (let x = 0; x < C.COLS; x++) {
          const cell = this.grid[y][x];
          if (cell && !cell.sweeping) cell.marked = false;
        }
      }
      for (let y = 0; y < C.ROWS - 1; y++) {
        for (let x = 0; x < C.COLS - 1; x++) {
          const a = this.grid[y][x], b = this.grid[y][x + 1];
          const c2 = this.grid[y + 1][x], d = this.grid[y + 1][x + 1];
          if (a && b && c2 && d &&
              a.color === b.color && a.color === c2.color && a.color === d.color) {
            a.marked = b.marked = c2.marked = d.marked = true;
            this.squareOrigins.push({ x, y, color: a.color });
          }
        }
      }
    }

    countMarkedSquares() { return this.squareOrigins.length; }

    // タイムライン位置更新（sweepX01: 0..1）
    setSweep(sweepX01) {
      const newX = sweepX01 * C.COLS;
      const newCol = Math.floor(newX);
      const prevCol = this.prevSweepCol;
      if (newCol !== prevCol) {
        if (newX < this.sweepX - C.COLS * 0.5) {
          // 周回した: 残り列を処理して確定、空振り判定
          for (let c2 = prevCol + 1; c2 < C.COLS; c2++) this.collectColumn(c2);
          this.finalizeSweepGroup();
          if (!this.clearedThisSweep && this.onSweepMiss) this.onSweepMiss();
          if (this.onWrap) this.onWrap(this.clearedThisSweep);
          this.clearedThisSweep = false;
          for (let c2 = 0; c2 <= newCol; c2++) this.collectColumn(c2);
        } else {
          for (let c2 = prevCol + 1; c2 <= newCol; c2++) this.collectColumn(c2);
        }
        this.prevSweepCol = newCol;
      }
      this.sweepX = newX;
    }

    // タイムラインが列cを通過: 右端がcの正方形を丸ごと回収する
    collectColumn(c) {
      if (c < 0 || c >= C.COLS) return;
      for (const o of this.squareOrigins) {
        if (o.x + 1 !== c) continue;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const x = o.x + dx, y = o.y + dy;
          const cell = this.grid[y][x];
          if (cell && !cell.sweeping) {
            cell.sweeping = true;
            this.sweepGroup.push({ x, y });
          }
        }
      }
      // この列に回収中セルがなければ、予約の連なりが途切れた＝まとめて確定
      let colHasSweeping = false;
      for (let y = 0; y < C.ROWS; y++) {
        const cell = this.grid[y][c];
        if (cell && cell.sweeping) { colHasSweeping = true; break; }
      }
      if (!colHasSweeping && this.sweepGroup.length > 0) this.finalizeSweepGroup();
    }

    finalizeSweepGroup() {
      if (this.sweepGroup.length === 0) return;
      const inGroup = (x, y) => {
        const cell = this.cellAt(x, y);
        return !!(cell && cell.sweeping);
      };
      // 完全に回収された正方形の数
      let squares = 0;
      for (const o of this.squareOrigins) {
        if (inGroup(o.x, o.y) && inGroup(o.x + 1, o.y) &&
            inGroup(o.x, o.y + 1) && inGroup(o.x + 1, o.y + 1)) squares++;
      }
      // 回収セル＋S連鎖
      const removal = new Set();
      const chainSeeds = [];
      for (const g of this.sweepGroup) {
        removal.add(g.y * C.COLS + g.x);
        const cell = this.grid[g.y][g.x];
        if (cell && cell.s) chainSeeds.push({ x: g.x, y: g.y, color: cell.color });
      }
      let chainCells = 0;
      for (const seed of chainSeeds) {
        // 同色でつながる領域をすべて回収（回収済みセルも通過できる）
        const visited = new Set([seed.y * C.COLS + seed.x]);
        const stack = [[seed.x, seed.y]];
        while (stack.length) {
          const [sx, sy] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = sx + dx, ny = sy + dy;
            if (nx < 0 || nx >= C.COLS || ny < 0 || ny >= C.ROWS) continue;
            const key = ny * C.COLS + nx;
            if (visited.has(key)) continue;
            visited.add(key);
            const cell = this.grid[ny][nx];
            if (!cell || cell.color !== seed.color) continue;
            if (!removal.has(key)) {
              removal.add(key);
              chainCells++;
            }
            stack.push([nx, ny]);
          }
        }
      }
      // 消去
      const cellsInfo = [];
      for (const key of removal) {
        const x = key % C.COLS, y = Math.floor(key / C.COLS);
        const cell = this.grid[y][x];
        if (cell) cellsInfo.push({ x, y, color: cell.color, s: cell.s });
        this.grid[y][x] = null;
      }
      this.sweepGroup = [];
      if (squares > 0 || chainCells > 0) this.clearedThisSweep = true;
      this.applyGravity();
      this.computeMarks();
      if (this.onClear) this.onClear({ squares, chainCells, cells: cellsInfo });
    }

    // 浮いたマシュマロを落下アニメへ
    applyGravity() {
      for (let x = 0; x < C.COLS; x++) {
        let gapFound = false;
        for (let y = C.ROWS - 1; y >= 0; y--) {
          const cell = this.grid[y][x];
          if (!cell && !gapFound) gapFound = true;
          else if (cell && gapFound && !cell.sweeping) {
            this.fallers.push({ x, y, vy: C.SETTLE_START_SPEED, color: cell.color, s: cell.s });
            this.grid[y][x] = null;
          }
        }
      }
    }

    // 危険度: 最も高い列の高さ（0..ROWS）
    maxHeight() {
      let max = 0;
      for (let x = 0; x < C.COLS; x++) {
        for (let y = 0; y < C.ROWS; y++) {
          if (this.grid[y][x]) { max = Math.max(max, C.ROWS - y); break; }
        }
      }
      return max;
    }

    cellCount() {
      let n = 0;
      for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) if (this.grid[y][x]) n++;
      return n;
    }
  }

  MB.Piece = Piece;
  MB.PieceGen = PieceGen;
  MB.Field = Field;
})();
