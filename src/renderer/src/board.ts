// 连连看棋盘逻辑 + 连接判定（≤2 个拐角）

export interface Cell {
  r: number
  c: number
}

// 关卡移动方式（消除后按方向补齐留空）
export type MoveMode =
  | 'none'
  | 'down'
  | 'up'
  | 'left'
  | 'right'
  | 'dispH'
  | 'dispV'
  | 'gatherH'
  | 'gatherV'
  | 'gatherR'

export class Board {
  rows: number
  cols: number
  // 内部网格：rows x cols，0 表示空格，>0 表示果蔬类型 id（1 起）
  grid: number[][]
  // 带 1 圈边界的网格，便于路径绕到棋盘外面
  private R: number
  private C: number
  private pad: number[][]

  constructor(rows: number, cols: number, typeIds: number[]) {
    this.rows = rows
    this.cols = cols
    this.R = rows + 2
    this.C = cols + 2
    this.grid = []
    this.pad = []
    this.generate(typeIds)
  }

  private buildPad(): void {
    this.pad = Array.from({ length: this.R }, () => new Array(this.C).fill(0))
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.pad[r + 1][c + 1] = this.grid[r][c]
      }
    }
  }

  // 随机填充棋盘
  private fillRandom(typeIds: number[]): void {
    const total = this.rows * this.cols
    const tiles: number[] = []
    let i = 0
    while (tiles.length < total) {
      const t = typeIds[i % typeIds.length]
      tiles.push(t, t)
      i++
    }
    tiles.length = total // 保证偶数个
    for (let k = tiles.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1))
      ;[tiles[k], tiles[j]] = [tiles[j], tiles[k]]
    }
    this.grid = []
    let idx = 0
    for (let r = 0; r < this.rows; r++) {
      const row: number[] = []
      for (let c = 0; c < this.cols; c++) row.push(tiles[idx++])
      this.grid.push(row)
    }
    this.buildPad()
  }

  // 生成：保证开局至少存在一步可走（整盘可全消由玩家卡住时自动洗牌兜底）
  generate(typeIds: number[]): void {
    let guard = 0
    do {
      this.fillRandom(typeIds)
      // 随机布局在种类较多时一步可走对可能缺失，循环至多 200 次
    } while (this.remaining() > 0 && !this.findAnyMove() && guard < 200)
    // 仍无一步可走时，直接构造一个相邻同型对
    if (this.remaining() > 0 && !this.findAnyMove()) this.ensureMove()
  }

  // 交换构造一个相邻同型对，保证开局至少存在一步可走
  private ensureMove(): void {
    for (let guard = 0; guard < 50; guard++) {
      // 收集每种类型的方块位置
      const byType = new Map<number, Cell[]>()
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.grid[r][c]
          if (t === 0) continue
          if (!byType.has(t)) byType.set(t, [])
          byType.get(t)!.push({ r, c })
        }
      }
      const candidates = [...byType.entries()].filter(([, v]) => v.length >= 2)
      if (candidates.length === 0) break
      // 随机挑一种类型及其两个方块 a、b
      const [, cells] = candidates[Math.floor(Math.random() * candidates.length)]
      const i = Math.floor(Math.random() * cells.length)
      const a = cells[i]
      const b = cells[(i + 1 + Math.floor(Math.random() * (cells.length - 1))) % cells.length]
      // 取 b 的一个相邻格 n，把 a 的类型换到 n 上，使 n 与 b 相邻同型
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)]
      const nr = b.r + dr
      const nc = b.c + dc
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue
      const t = this.grid[b.r][b.c]
      this.grid[a.r][a.c] = this.grid[nr][nc]
      this.grid[nr][nc] = t
      this.buildPad()
      if (this.solvable()) return
    }
    this.buildPad()
  }

  remaining(): number {
    let n = 0
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) if (this.grid[r][c] !== 0) n++
    return n
  }

  typeAt(r: number, c: number): number {
    return this.grid[r][c]
  }

  remove(a: Cell, b: Cell): void {
    this.grid[a.r][a.c] = 0
    this.grid[b.r][b.c] = 0
    this.buildPad()
  }

  // 关卡移动方式：消除后按方向把留空补齐（重力聚拢/散开）
  // 无自主移动，仅在消除后触发一次 collapse
  collapse(mode: MoveMode): void {
    switch (mode) {
      case 'none':
        return
      case 'down':
        this.gravityCardinal(1, 0)
        break
      case 'up':
        this.gravityCardinal(-1, 0)
        break
      case 'left':
        this.gravityCardinal(0, -1)
        break
      case 'right':
        this.gravityCardinal(0, 1)
        break
      case 'dispH':
        this.collapseCenter('h', false)
        break
      case 'dispV':
        this.collapseCenter('v', false)
        break
      case 'gatherH':
        this.collapseCenter('h', true)
        break
      case 'gatherV':
        this.collapseCenter('v', true)
        break
      case 'gatherR':
        this.collapseCenter('radial', true)
        break
    }
  }

  // 向某一面墙重力聚拢（消除留空后，上方/下方/左/右的方块滑入补位）
  private gravityCardinal(dr: number, dc: number): void {
    const g = this.grid
    if (dc === 0) {
      for (let c = 0; c < this.cols; c++) {
        const col: number[] = []
        for (let r = 0; r < this.rows; r++) if (g[r][c] !== 0) col.push(g[r][c])
        for (let r = 0; r < this.rows; r++) g[r][c] = 0
        if (dr === 1) {
          let rr = this.rows - col.length
          for (const t of col) g[rr++][c] = t
        } else {
          let rr = 0
          for (const t of col) g[rr++][c] = t
        }
      }
    } else {
      for (let r = 0; r < this.rows; r++) {
        const row: number[] = []
        for (let c = 0; c < this.cols; c++) if (g[r][c] !== 0) row.push(g[r][c])
        for (let c = 0; c < this.cols; c++) g[r][c] = 0
        if (dc === 1) {
          let cc = this.cols - row.length
          for (const t of row) g[r][cc++] = t
        } else {
          let cc = 0
          for (const t of row) g[r][cc++] = t
        }
      }
    }
    this.buildPad()
  }

  // 向中心聚拢（toward=true）或从中心向四周散开（toward=false），反复步进直至稳定
  private collapseCenter(mode: 'h' | 'v' | 'radial', toward: boolean): void {
    let guard = 0
    while (guard++ < this.rows * this.cols) {
      if (this.stepCenter(mode, toward) === 0) break
    }
    this.buildPad()
  }

  // 单步：每个方块朝中心/四周移动一格，碰撞则不动；返回实际移动数
  private stepCenter(mode: 'h' | 'v' | 'radial', toward: boolean): number {
    const cr = (this.rows - 1) / 2
    const cc = (this.cols - 1) / 2
    const dist = (r: number, c: number) => Math.abs(r - cr) + Math.abs(c - cc)
    const tiles: { r: number; c: number; t: number }[] = []
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.grid[r][c] !== 0) tiles.push({ r, c, t: this.grid[r][c] })
    tiles.sort((a, b) => dist(a.r, a.c) - dist(b.r, b.c))
    if (!toward) tiles.reverse()
    const work = this.grid.map((row) => row.slice())
    let moved = 0
    for (const tile of tiles) {
      let dr = 0
      let dc = 0
      if (mode === 'h' || mode === 'radial') dc = toward ? Math.sign(cc - tile.c) : -Math.sign(cc - tile.c)
      if (mode === 'v' || mode === 'radial') dr = toward ? Math.sign(cr - tile.r) : -Math.sign(cr - tile.r)
      if (dr === 0 && dc === 0) continue
      const nr = tile.r + dr
      const nc = tile.c + dc
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue
      if (work[nr][nc] === 0) {
        work[nr][nc] = tile.t
        work[tile.r][tile.c] = 0
        moved++
      }
    }
    this.grid = work
    return moved
  }

  // 连接判定：返回路径（pad 坐标），不可连返回 null
  canConnect(a: Cell, b: Cell): Cell[] | null {
    if (a.r === b.r && a.c === b.c) return null
    const ta = this.pad[a.r + 1][a.c + 1]
    const tb = this.pad[b.r + 1][b.c + 1]
    if (ta === 0 || tb === 0 || ta !== tb) return null
    const A = { r: a.r + 1, c: a.c + 1 }
    const B = { r: b.r + 1, c: b.c + 1 }
    return this.linkPath(A, B)
  }

  // 纯布尔连接判定（供求解器复用），坐标均为 pad 坐标
  private canLinkOn(pad: number[][], R: number, C: number, A: Cell, B: Cell): boolean {
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ]
    const inB = (r: number, c: number) => r >= 0 && r < R && c >= 0 && c < C
    const passable = (r: number, c: number, t: Cell) => {
      if (!inB(r, c)) return false
      if (r === t.r && c === t.c) return true
      return pad[r][c] === 0
    }
    const best: number[][][] = Array.from({ length: R }, () =>
      Array.from({ length: C }, () => [Infinity, Infinity, Infinity, Infinity])
    )
    const queue: any[] = []
    for (let d = 0; d < 4; d++) {
      const nr = A.r + dirs[d][0]
      const nc = A.c + dirs[d][1]
      if (passable(nr, nc, B)) {
        best[nr][nc][d] = 0
        queue.push({ r: nr, c: nc, dir: d, turns: 0 })
      }
    }
    while (queue.length) {
      const cur = queue.shift()
      if (cur.r === B.r && cur.c === B.c) return true
      for (let nd = 0; nd < 4; nd++) {
        const nturns = cur.turns + (nd !== cur.dir ? 1 : 0)
        if (nturns > 2) continue
        const nr = cur.r + dirs[nd][0]
        const nc = cur.c + dirs[nd][1]
        if (!passable(nr, nc, B)) continue
        if (best[nr][nc][nd] <= nturns) continue
        best[nr][nc][nd] = nturns
        queue.push({ r: nr, c: nc, dir: nd, turns: nturns })
      }
    }
    return false
  }

  // 带路径的 BFS（pad 坐标），返回压缩后的路径
  private linkPath(A: Cell, B: Cell): Cell[] | null {
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ]
    const R = this.R
    const C = this.C
    const pad = this.pad
    const inB = (r: number, c: number) => r >= 0 && r < R && c >= 0 && c < C
    const passable = (r: number, c: number, t: Cell) => {
      if (!inB(r, c)) return false
      if (r === t.r && c === t.c) return true
      return pad[r][c] === 0
    }
    const best: number[][][] = Array.from({ length: R }, () =>
      Array.from({ length: C }, () => [Infinity, Infinity, Infinity, Infinity])
    )
    const prev: any[][][] = Array.from({ length: R }, () =>
      Array.from({ length: C }, () => [null, null, null, null])
    )
    const queue: any[] = []
    for (let d = 0; d < 4; d++) {
      const nr = A.r + dirs[d][0]
      const nc = A.c + dirs[d][1]
      if (passable(nr, nc, B)) {
        best[nr][nc][d] = 0
        prev[nr][nc][d] = { r: A.r, c: A.c, dir: -1, turns: -1 }
        queue.push({ r: nr, c: nc, dir: d, turns: 0 })
      }
    }
    let result: any = null
    while (queue.length) {
      const cur = queue.shift()
      if (cur.r === B.r && cur.c === B.c) {
        result = cur
        break
      }
      for (let nd = 0; nd < 4; nd++) {
        const nturns = cur.turns + (nd !== cur.dir ? 1 : 0)
        if (nturns > 2) continue
        const nr = cur.r + dirs[nd][0]
        const nc = cur.c + dirs[nd][1]
        if (!passable(nr, nc, B)) continue
        if (best[nr][nc][nd] <= nturns) continue
        best[nr][nc][nd] = nturns
        prev[nr][nc][nd] = { r: cur.r, c: cur.c, dir: cur.dir, turns: cur.turns }
        queue.push({ r: nr, c: nc, dir: nd, turns: nturns })
      }
    }
    if (!result) return null
    const path: Cell[] = []
    let cur: any = result
    while (cur) {
      path.push({ r: cur.r, c: cur.c })
      const p = prev[cur.r][cur.c][cur.dir]
      if (!p || p.dir === -1) {
        path.push({ r: A.r, c: A.c })
        break
      }
      cur = { r: p.r, c: p.c, dir: p.dir, turns: p.turns }
    }
    path.reverse()
    return compress(path)
  }

  // 贪心随机模拟，判断当前棋盘是否可解
  private solvable(): boolean {
    const g = this.grid.map((row) => row.slice())
    const R = this.rows + 2
    const C = this.cols + 2
    const pad = Array.from({ length: R }, () => new Array(C).fill(0))
    const rebuild = () => {
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++) pad[r + 1][c + 1] = g[r][c]
    }
    rebuild()
    let remaining = this.remaining()
    let guard = 0
    while (remaining > 0) {
      const byType = new Map<number, Cell[]>()
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++) {
          const t = g[r][c]
          if (t !== 0) {
            if (!byType.has(t)) byType.set(t, [])
            byType.get(t)!.push({ r, c })
          }
        }
      const pairs: [Cell, Cell][] = []
      for (const cells of byType.values()) {
        for (let i = 0; i < cells.length; i++)
          for (let j = i + 1; j < cells.length; j++) {
            if (
              this.canLinkOn(
                pad,
                R,
                C,
                { r: cells[i].r + 1, c: cells[i].c + 1 },
                { r: cells[j].r + 1, c: cells[j].c + 1 }
              )
            )
              pairs.push([cells[i], cells[j]])
          }
      }
      if (pairs.length === 0) return false
      const [x, y] = pairs[Math.floor(Math.random() * pairs.length)]
      g[x.r][x.c] = 0
      g[y.r][y.c] = 0
      pad[x.r + 1][x.c + 1] = 0
      pad[y.r + 1][y.c + 1] = 0
      remaining -= 2
      guard++
      if (guard > this.rows * this.cols) return false
    }
    return true
  }

  // 查找任意一对可消除的格子（用于提示 / 死局检测）
  findAnyMove(): [Cell, Cell] | null {
    const byType = new Map<number, Cell[]>()
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c]
        if (t !== 0) {
          if (!byType.has(t)) byType.set(t, [])
          byType.get(t)!.push({ r, c })
        }
      }
    }
    for (const cells of byType.values()) {
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (this.canConnect(cells[i], cells[j])) return [cells[i], cells[j]]
        }
      }
    }
    return null
  }

  // 对剩余格子洗牌
  shuffle(): void {
    const positions: Cell[] = []
    const types: number[] = []
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== 0) {
          positions.push({ r, c })
          types.push(this.grid[r][c])
        }
      }
    }
    for (let k = types.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1))
      ;[types[k], types[j]] = [types[j], types[k]]
    }
    for (let i = 0; i < positions.length; i++) {
      this.grid[positions[i].r][positions[i].c] = types[i]
    }
    this.buildPad()
  }

  // 洗牌直到有可消除的一步（尽量保证可解）
  shuffleUntilSolvable(): void {
    let guard = 0
    do {
      this.shuffle()
      guard++
    } while (this.remaining() > 0 && !this.findAnyMove() && guard < 100)
    if (this.remaining() > 0 && !this.solvable()) {
      let g2 = 0
      do {
        this.shuffle()
        g2++
      } while (this.remaining() > 0 && !this.solvable() && g2 < 30)
    }
  }
}

// 压缩共线点，只保留转折点
function compress(path: Cell[]): Cell[] {
  if (path.length <= 2) return path
  const out: Cell[] = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1]
    const b = path[i]
    const c = path[i + 1]
    if (b.r - a.r !== c.r - b.r || b.c - a.c !== c.c - b.c) out.push(b)
  }
  out.push(path[path.length - 1])
  return out
}
