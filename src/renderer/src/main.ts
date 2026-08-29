import "./style.css";
import { Board, Cell } from "./board";

// 素材导入
const fruitModules = import.meta.glob("./assets/fruits/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const FRUITS: string[] = Object.keys(fruitModules)
  .sort((a, b) => {
    const na = parseInt((a.match(/icon(\d+)/) || ["", "0"])[1]);
    const nb = parseInt((b.match(/icon(\d+)/) || ["", "0"])[1]);
    return na - nb;
  })
  .map((k) => fruitModules[k]);

import bgUrl from "./assets/ui/bg.png";
import titleUrl from "./assets/ui/title.png";
import helpUrl from "./assets/ui/help.png";
import countdownUrl from "./assets/ui/countdown.png";
import daojishiUrl from "./assets/ui/daojishi.png";
import tipUrl from "./assets/ui/tipBtn.png";
import shuffleUrl from "./assets/ui/resetBtn.png";
import pauseUrl from "./assets/ui/pauseBtn.png";
import startUrl from "./assets/ui/startBtn.png";

// 关卡配置（闯关模式：10 关，14 列 × 10 行）
const CONFIG = { rows: 10, cols: 14, time: 300, levels: 10 };
const GAP = 2; // 格子间隙（px）
const RECOVER = 5; // 每次消除恢复的时间（秒）

// 果蔬种类随关卡递增：1~2 关 25 种，3~7 关 40 种，8~10 关 45 种（全部素材上场）
function typesForLevel(level: number): number {
  if (level <= 2) return 25;
  if (level <= 7) return 40;
  return 45;
}

// 移动方式：消除后按方向补齐留空（无自主移动）
import type { MoveMode } from "./board";

// 各关移动方式
function makeMovement(level: number): MoveMode {
  switch (level) {
    case 1:
      return "none";
    case 2:
      return "down"; // 向下移动
    case 3:
      return "up"; // 向上移动
    case 4:
      return "left"; // 向左移动
    case 5:
      return "right"; // 向右移动
    case 6:
      return "dispH"; // 中间向左右（向两侧散开）
    case 7:
      return "dispV"; // 中间向上下（向两侧散开）
    case 8:
      return "gatherH"; // 左右向中间聚集
    case 9:
      return "gatherV"; // 上下向中间聚集
    case 10:
      return "gatherR"; // 四周向中间聚集
    default:
      return "none";
  }
}

// 状态
let board: Board;
let score = 0;
let timeLeft = 0;
let maxTime = CONFIG.time;
let timer: number | undefined;
let selected: Cell | null = null;
let cellSize = 50;
let linkTimer: number | undefined;
let combo = 0;
let lastMatchTime = 0;
let currentLevel = 1;
let lastWasFinalWin = false;
let currentMovement: MoveMode = "none";

// 根据窗口尺寸自适应格子大小（全屏时随之增大）
function computeCellSize() {
  const availW = window.innerWidth;
  const availH = window.innerHeight - 100;
  return Math.max(
    28,
    Math.min(
      100,
      Math.floor(
        Math.min(availW / (CONFIG.cols + 2), availH / (CONFIG.rows + 2)),
      ),
    ),
  );
}

// DOM
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const startScreen = $("start");
const gameScreen = $("game");
const overScreen = $("over");
const grid = $("grid");
const linkCanvas = $("link") as HTMLCanvasElement;
const toastEl = $("toast");

const titleImg = $("title-img") as HTMLImageElement;
titleImg.src = titleUrl;
gameScreen.style.background = `#000 url(${bgUrl}) center/cover no-repeat`;

const helpImg = $("help-img") as HTMLImageElement;
helpImg.src = helpUrl;

const clockBg = $("clock-bg") as HTMLImageElement;
const clockFg = $("clock-fg") as HTMLImageElement;
clockBg.src = daojishiUrl;
clockFg.src = countdownUrl;

const hintBtn = $("btn-hint").querySelector("img") as HTMLImageElement;
const shuffleBtnImg = $("btn-shuffle").querySelector("img") as HTMLImageElement;
const pauseBtnImg = $("btn-pause").querySelector("img") as HTMLImageElement;
hintBtn.src = tipUrl;
shuffleBtnImg.src = shuffleUrl;
pauseBtnImg.src = pauseUrl;

const startBtnImg = $("btn-start").querySelector("img") as HTMLImageElement;
startBtnImg.src = startUrl;

let cellEls: (HTMLElement | null)[][] = [];

// ---------- 屏幕切换 ----------
function show(el: HTMLElement) {
  [startScreen, gameScreen, overScreen].forEach((s) =>
    s.classList.add("hidden"),
  );
  el.classList.remove("hidden");
}

// ---------- 开始游戏 ----------
function startGame(level = 1) {
  currentLevel = level;
  score = 0;
  combo = 0;
  lastMatchTime = 0;
  selected = null;
  lastWasFinalWin = false;
  cellSize = computeCellSize();
  currentMovement = makeMovement(currentLevel);
  const typeIds = Array.from({ length: typesForLevel(currentLevel) }, (_, i) => i + 1);
  board = new Board(CONFIG.rows, CONFIG.cols, typeIds);
  renderBoard();
  timeLeft = CONFIG.time;
  updateHUD();
  show(gameScreen);
  startTimer();
}

// ---------- 渲染棋盘 ----------
function renderBoard() {
  const pitch = cellSize + GAP;
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${board.cols}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(${board.rows}, ${cellSize}px)`;
  grid.style.gap = `${GAP}px`;
  grid.style.width = `${board.cols * cellSize + (board.cols - 1) * GAP}px`;
  grid.style.height = `${board.rows * cellSize + (board.rows - 1) * GAP}px`;
  grid.style.left = `${pitch}px`;
  grid.style.top = `${pitch}px`;

  const wrap = $("board-wrap");
  wrap.style.width = `${(board.cols + 2) * pitch}px`;
  wrap.style.height = `${(board.rows + 2) * pitch}px`;
  // 让顶栏/工具栏与游戏本体同宽
  document.documentElement.style.setProperty("--game-w", wrap.style.width);

  cellEls = Array.from({ length: board.rows }, () =>
    new Array(board.cols).fill(null),
  );
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const t = board.typeAt(r, c);
      if (t === 0) continue;
      const el = document.createElement("div");
      el.className = "tile";
      el.style.width = `${cellSize}px`;
      el.style.height = `${cellSize}px`;
      // 固定在自己的格子，消除后其它方块不向前聚集
      el.style.gridColumn = String(c + 1);
      el.style.gridRow = String(r + 1);
      el.style.backgroundImage = `url(${FRUITS[t - 1]})`;
      el.addEventListener("click", () => onTileClick(r, c));
      grid.appendChild(el);
      cellEls[r][c] = el;
    }
  }

  const cv = linkCanvas.getContext("2d")!;
  linkCanvas.width = (board.cols + 2) * pitch;
  linkCanvas.height = (board.rows + 2) * pitch;
  linkCanvas.style.width = `${linkCanvas.width}px`;
  linkCanvas.style.height = `${linkCanvas.height}px`;
  cv.clearRect(0, 0, linkCanvas.width, linkCanvas.height);
}

// ---------- 点击处理 ----------
function onTileClick(r: number, c: number) {
  if (board.typeAt(r, c) === 0) return;

  if (!selected) {
    selected = { r, c };
    mark(selected, true);
    return;
  }

  if (selected.r === r && selected.c === c) {
    mark(selected, false);
    selected = null;
    return;
  }

  const a = selected;
  if (board.typeAt(a.r, a.c) === board.typeAt(r, c)) {
    const path = board.canConnect(a, { r, c });
    if (path) {
      const b = { r, c };
      mark(a, false);
      selected = null;
      // 立即消除，并按关卡方向补齐留空（无自主移动、无延迟）
      board.remove(a, b);
      board.collapse(currentMovement);
      const now = Date.now();
      combo = now - lastMatchTime < 3000 ? combo + 1 : 1;
      lastMatchTime = now;
      score += 10 + (combo - 1) * 2;
      timeLeft = Math.min(maxTime, timeLeft + RECOVER); // 消除恢复一点时间
      updateHUD();
      renderBoard();
      drawLink(path); // 连线反馈（基于消除前的路径）
      clearTimeout(linkTimer);
      linkTimer = window.setTimeout(fadeOutLink, 60);
      if (board.remaining() === 0) {
        win();
      } else if (!board.findAnyMove()) {
        toast("无可消除，已自动洗牌");
        board.shuffleUntilSolvable();
        renderBoard();
      }
      return;
    }
  }

  // 不能消：切换选中
  mark(a, false);
  selected = { r, c };
  mark(selected, true);
}

function mark(cell: Cell, on: boolean) {
  const el = cellEls[cell.r][cell.c];
  if (el) el.classList.toggle("selected", on);
}

// ---------- 连线动画 ----------
function drawLink(path: Cell[]) {
  const cv = linkCanvas.getContext("2d")!;
  const pitch = cellSize + GAP;
  cv.clearRect(0, 0, linkCanvas.width, linkCanvas.height);
  cv.strokeStyle = "#ffeb3b";
  cv.lineWidth = 4;
  cv.lineJoin = "round";
  cv.lineCap = "round";
  cv.beginPath();
  path.forEach((p, i) => {
    const x = p.c * pitch + cellSize / 2;
    const y = p.r * pitch + cellSize / 2;
    if (i === 0) cv.moveTo(x, y);
    else cv.lineTo(x, y);
  });
  cv.stroke();
  linkCanvas.style.opacity = "1";
}

function clearLink() {
  linkCanvas
    .getContext("2d")!
    .clearRect(0, 0, linkCanvas.width, linkCanvas.height);
}

// 快速淡出并清除连线
function fadeOutLink() {
  linkCanvas.style.opacity = "0";
  window.setTimeout(clearLink, 120);
}

// ---------- 提示 / 洗牌 ----------
function doHint() {
  const m = board.findAnyMove();
  if (!m) {
    toast("当前无可消除");
    return;
  }
  flash(m[0]);
  flash(m[1]);
}

function flash(cell: Cell) {
  const el = cellEls[cell.r][cell.c];
  if (!el) return;
  el.classList.remove("hint");
  // 重启动画
  void el.offsetWidth;
  el.classList.add("hint");
  setTimeout(() => el.classList.remove("hint"), 1900);
}

function doShuffle() {
  selected = null;
  board.shuffleUntilSolvable();
  renderBoard();
  toast("已洗牌");
}

// ---------- 计时 ----------
function startTimer() {
  stopTimer();
  timer = window.setInterval(() => {
    timeLeft--;
    updateHUD();
    if (timeLeft <= 0) {
      stopTimer();
      lose();
    }
  }, 1000);
}

function stopTimer() {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function updateHUD() {
  $("score").textContent = String(score);
  $("level").textContent = String(currentLevel);
  // countdown 覆盖在 daojishi 上，按剩余时间裁剪宽度（消除可恢复）
  const pct = Math.max(0, Math.min(1, timeLeft / maxTime)) * 100;
  clockFg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  clockFg.classList.toggle("low", pct <= 20);
}

// ---------- 结算 ----------
function win() {
  stopTimer();
  clearLink();
  const btnNext = $("btn-next");
  if (currentLevel < CONFIG.levels) {
    lastWasFinalWin = false;
    $("over-title").textContent = `第 ${currentLevel} 关 过关！`;
    btnNext.classList.remove("hidden");
  } else {
    lastWasFinalWin = true;
    $("over-title").textContent = "全部通关！";
    btnNext.classList.add("hidden");
  }
  $("over-score").textContent = String(score);
  show(overScreen);
}

function lose() {
  stopTimer();
  clearLink();
  lastWasFinalWin = false;
  $("btn-next").classList.add("hidden");
  $("over-title").textContent = "时间到";
  $("over-score").textContent = String(score);
  show(overScreen);
}

// ---------- 暂停 ----------
function pauseGame() {
  if (timer === undefined) return;
  stopTimer();
  $("pause-overlay").classList.remove("hidden");
}

function resumeGame() {
  $("pause-overlay").classList.add("hidden");
  if (board && board.remaining() > 0) {
    startTimer();
  }
}

// ---------- Toast ----------
let toastTimer: number | undefined;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1500);
}

// ---------- 关卡选择（测试用） ----------
const levelGrid = $("level-grid");
for (let i = 1; i <= CONFIG.levels; i++) {
  const b = document.createElement("button");
  b.className = "lvl-btn";
  b.textContent = String(i);
  b.addEventListener("click", () => startGame(i));
  levelGrid.appendChild(b);
}

// ---------- 在线更新 ----------
type UpdateSourcePref = 'auto' | 'github' | 'gitee'
type UpdateEventPayload = Record<string, any>

const updateOverlay = $('update-overlay')
const updateTitle = $('update-title')
const updateMsg = $('update-msg')
const updateProgress = $('update-progress')
const updateProgressInner = $('update-progress-inner')
const btnUpdateInstall = $('btn-update-install')
const btnUpdatePage = $('btn-update-download')
const btnUpdateClose = $('btn-update-close')
const updateStatus = $('update-status')
const sourceRadios = document.querySelectorAll<HTMLInputElement>(
  'input[name="update-source"]'
)

let portable = false
let updateReady = false // 新版本已下载，待重启安装
let availableVersion = ''
let currentAppVersion = ''
let lastProgress: {
  percent?: number
  transferred?: number
  total?: number
} | null = null

const SOURCE_CN: Record<string, string> = { github: 'GitHub', gitee: 'Gitee' }

function savedSource(): UpdateSourcePref {
  const v = localStorage.getItem('update-source')
  return v === 'github' || v === 'gitee' ? v : 'auto'
}

function fmtMB(n?: number): string {
  return n == null ? '?' : (n / 1024 / 1024).toFixed(1)
}

function dialogOpen(): boolean {
  return !updateOverlay.classList.contains('hidden')
}

function setStatus(text: string | null) {
  if (!text) {
    updateStatus.classList.add('hidden')
    return
  }
  updateStatus.textContent = text
  updateStatus.classList.remove('hidden')
}

function hideUpdateButtons() {
  btnUpdateInstall.classList.add('hidden')
  btnUpdatePage.classList.add('hidden')
}

function applyProgress() {
  if (!lastProgress) {
    updateProgress.classList.add('hidden')
    updateMsg.textContent = '正在后台下载新版本…'
    return
  }
  const pct = Math.max(0, Math.min(100, lastProgress.percent ?? 0))
  updateProgress.classList.remove('hidden')
  updateProgressInner.style.width = `${pct}%`
  updateMsg.textContent = `已下载 ${fmtMB(lastProgress.transferred)} MB / 共 ${fmtMB(
    lastProgress.total
  )} MB（${Math.round(pct)}%）`
}

function renderChecking(source: string) {
  updateTitle.textContent = '正在检查更新…'
  updateMsg.textContent = `更新源：${SOURCE_CN[source] ?? '自动'}`
  updateProgress.classList.add('hidden')
  hideUpdateButtons()
  btnUpdateClose.textContent = '关闭'
}

function renderLatest() {
  updateTitle.textContent = '已是最新版本'
  updateMsg.textContent = `当前版本 v${currentAppVersion} 已是最新`
  updateProgress.classList.add('hidden')
  hideUpdateButtons()
  btnUpdateClose.textContent = '关闭'
}

function renderAvailable(version: string) {
  updateTitle.textContent = `发现新版本 v${version}`
  btnUpdateClose.textContent = '后台下载'
  if (portable) {
    updateMsg.textContent = '便携版不支持自动更新，请前往发布页下载新版本'
    updateProgress.classList.add('hidden')
    btnUpdateInstall.classList.add('hidden')
    btnUpdatePage.classList.remove('hidden')
  } else {
    hideUpdateButtons()
    applyProgress()
  }
}

function renderDownloaded(version: string) {
  updateTitle.textContent = '新版本已就绪'
  updateMsg.textContent = `v${version} 下载完成。立即安装将自动重启；也可以稍后退出游戏时自动安装`
  updateProgress.classList.add('hidden')
  btnUpdatePage.classList.add('hidden')
  btnUpdateInstall.classList.remove('hidden')
  btnUpdateClose.textContent = '稍后'
}

function renderError(title: string, message: string) {
  updateTitle.textContent = title
  updateMsg.textContent = message || '网络异常，请稍后重试'
  updateProgress.classList.add('hidden')
  hideUpdateButtons()
  btnUpdateClose.textContent = '关闭'
}

async function openUpdateDialog() {
  updateOverlay.classList.remove('hidden')
  if (updateReady && availableVersion) {
    renderDownloaded(availableVersion)
    return
  }
  const pref = savedSource()
  renderChecking(pref)
  const res = await window.api?.checkUpdate(pref)
  if (!res) {
    renderError('检查更新失败', '当前环境不支持在线更新')
    return
  }
  if (res.ok === false) {
    renderError('检查更新失败', res.error)
    return
  }
  if (!res.updateAvailable) {
    renderLatest()
    return
  }
  // 有更新：进度与完成状态由事件流继续填充
  if (res.version) availableVersion = res.version
  renderAvailable(res.version ?? '')
}

function applyUpdateEvent(e: { type: string; payload?: UpdateEventPayload }) {
  const p = (e.payload || {}) as UpdateEventPayload
  switch (e.type) {
    case 'checking':
      if (dialogOpen()) renderChecking(String(p.source ?? ''))
      break
    case 'source-failed':
      if (dialogOpen()) {
        const name = SOURCE_CN[String(p.source)] ?? String(p.source ?? '')
        updateMsg.textContent = `${name} 不可用，尝试其他源…`
      }
      break
    case 'update-available':
      availableVersion = String(p.version ?? '')
      if (dialogOpen()) {
        renderAvailable(availableVersion)
      } else if (portable) {
        setStatus(`发现新版本 ${availableVersion}，点击"检查更新"前往发布页`)
      } else {
        setStatus(`发现新版本 ${availableVersion}，正在后台下载…`)
      }
      break
    case 'download-progress':
      lastProgress = p
      if (dialogOpen()) {
        applyProgress()
      } else if (availableVersion) {
        setStatus(`新版本 ${availableVersion}：已下载 ${Math.round(p.percent ?? 0)}%`)
      }
      break
    case 'update-downloaded':
      updateReady = true
      $('btn-check-update').textContent = '安装新版本'
      if (dialogOpen()) {
        renderDownloaded(String(p.version ?? availableVersion))
      } else {
        setStatus(
          `新版本 ${p.version ?? availableVersion} 已就绪，退出游戏时自动安装（点击查看）`
        )
      }
      break
    case 'download-error':
      if (dialogOpen()) {
        renderError('下载失败', String(p.message ?? ''))
      } else {
        setStatus('新版本下载失败，可点击"检查更新"重试')
      }
      break
    default:
      // 'error'（全部源失败）：手动检查通过返回值提示，自动检查保持静默
      break
  }
}

// 版本号显示 + 更新事件订阅（缺少 api 时说明运行在纯浏览器环境，跳过）
window.api?.getAppVersion().then((v) => {
  currentAppVersion = v
  $('app-version').textContent = `v${v}`
})
window.api?.isPortable().then((v) => {
  portable = v
})
window.api?.onUpdaterEvent(applyUpdateEvent)

// 更新源单选持久化
const initSource = savedSource()
sourceRadios.forEach((r) => {
  r.checked = r.value === initSource
  r.addEventListener('change', () => {
    if (r.checked) localStorage.setItem('update-source', r.value)
  })
})

// ---------- 事件绑定 ----------
$("btn-start").addEventListener("click", () => startGame(1));
$("btn-hint").addEventListener("click", doHint);
$("btn-shuffle").addEventListener("click", doShuffle);
$("btn-pause").addEventListener("click", pauseGame);
$("btn-resume").addEventListener("click", resumeGame);
$("btn-next").addEventListener("click", () => startGame(currentLevel + 1));
$("btn-again").addEventListener("click", () =>
  startGame(lastWasFinalWin ? 1 : currentLevel),
);
$("btn-menu").addEventListener("click", () => {
  stopTimer();
  $("pause-overlay").classList.add("hidden");
  show(startScreen);
});
$("btn-check-update").addEventListener("click", openUpdateDialog);
updateStatus.addEventListener("click", openUpdateDialog);
$("btn-update-close").addEventListener("click", () =>
  updateOverlay.classList.add("hidden")
);
$("btn-update-install").addEventListener("click", () => {
  window.api?.installUpdate();
});
$("btn-update-download").addEventListener("click", () => {
  window.api?.openReleases();
});

// 窗口尺寸变化时，棋盘重新自适应（全屏/缩放布局随之增大）
window.addEventListener("resize", () => {
  if (gameScreen.classList.contains("hidden")) return;
  if (!board) return;
  cellSize = computeCellSize();
  renderBoard();
});

show(startScreen);
