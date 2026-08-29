import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { NsisUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'

// ---------- 更新源配置 ----------
const GITHUB_OWNER = 'ba1p1ao'
const GITHUB_REPO = 'guoshulianliankan'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const GITEE_RELEASES_API = `https://gitee.com/api/v5/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const GITEE_DOWNLOAD_BASE = `https://gitee.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/`

const CHECK_TIMEOUT_MS = 12000 // 单个源检查超时，超时即切换下一个源
const AUTO_CHECK_DELAY_MS = 5000 // 启动后延迟自动检查
// 测试后门：设置该环境变量后强制以 generic 方式使用该地址（本地模拟更新服务器）
const TEST_URL = process.env.LLK_UPDATE_URL

export type SourcePref = 'auto' | 'github' | 'gitee'

export type CheckResult =
  | { ok: true; source: string; updateAvailable: boolean; version?: string }
  | { ok: false; error: string }

type State =
  | 'idle'
  | 'checking'
  | 'none'
  | 'downloading'
  | 'available' // 有新版本但未下载（便携版）
  | 'downloaded'
  | 'error'

let win: BrowserWindow | null = null
let updater: NsisUpdater | null = null // 检查成功后持有的实例，负责后续下载与安装
let state: State = 'idle'
let updateInfo: UpdateInfo | null = null
let activeSource = ''
let inFlight: Promise<CheckResult> | null = null

// 便携版无法自更新（portable 目标不支持 electron-updater），只提示并引导手动下载
function isPortable(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR
}

function send(type: string, payload?: Record<string, unknown>): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:event', { type, payload })
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Gitee 走 generic 直链：先经 API 解析最新发行版 tag，再拼附件目录
async function fetchGiteeLatestTag(timeoutMs: number): Promise<string> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(GITEE_RELEASES_API, { signal: ac.signal })
    if (!res.ok) throw new Error(`Gitee API ${res.status}`)
    const data = (await res.json()) as { tag_name?: string }
    const tag = data.tag_name?.trim()
    if (!tag) throw new Error('Gitee 最新发行版缺少 tag')
    return tag
  } finally {
    clearTimeout(timer)
  }
}

function createUpdater(): NsisUpdater {
  const u = new NsisUpdater()
  // 检查与下载分离：确定源并检查成功后才显式下载，超时被抛弃的实例不会偷跑下载
  u.autoDownload = false
  u.autoInstallOnAppQuit = true
  if (!app.isPackaged) u.forceDevUpdateConfig = true // 配合 setFeedURL 支持开发模式测试
  u.logger = console

  // 仅当前持有的实例向渲染层转发下载阶段事件；检查阶段事件由 checkOn 作用域处理
  u.on('download-progress', (p: ProgressInfo) => {
    if (u !== updater) return
    state = 'downloading'
    send('download-progress', {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond
    })
  })
  u.on('update-downloaded', (info: UpdateInfo) => {
    if (u !== updater) return
    state = 'downloaded'
    send('update-downloaded', { version: info.version })
  })
  u.on('error', (err: Error) => {
    if (u !== updater || state !== 'downloading') return
    state = 'error'
    send('download-error', { message: errorMessage(err) })
  })
  return u
}

type AttemptResult =
  | { ok: true; u: NsisUpdater; info: UpdateInfo | null }
  | { ok: false; message: string }

// 对单个源发起一次检查；成功返回实例与结果，超时/失败返回原因（实例随之抛弃，
// 避免一次挂起的请求毒化后续检查——electron-updater 对并发检查返回同一个 promise）
async function checkOn(
  source: 'github' | 'gitee' | 'test'
): Promise<AttemptResult> {
  const u = createUpdater()
  try {
    if (source === 'github') {
      u.setFeedURL({ provider: 'github', owner: GITHUB_OWNER, repo: GITHUB_REPO })
    } else if (source === 'test') {
      u.setFeedURL({ provider: 'generic', url: TEST_URL! })
    } else {
      const tag = await fetchGiteeLatestTag(CHECK_TIMEOUT_MS)
      u.setFeedURL({ provider: 'generic', url: `${GITEE_DOWNLOAD_BASE}${tag}/` })
    }

    const outcome = await new Promise<
      | { kind: 'available'; info: UpdateInfo }
      | { kind: 'none' }
      | { kind: 'error'; message: string }
    >((resolve) => {
      const timer = setTimeout(
        () => resolve({ kind: 'error', message: `${source} 检查超时` }),
        CHECK_TIMEOUT_MS
      )
      u.once('update-available', (info: UpdateInfo) => {
        clearTimeout(timer)
        resolve({ kind: 'available', info })
      })
      u.once('update-not-available', () => {
        clearTimeout(timer)
        resolve({ kind: 'none' })
      })
      u.once('error', (err: Error) => {
        clearTimeout(timer)
        resolve({ kind: 'error', message: errorMessage(err) })
      })
      u.checkForUpdates().catch((err: unknown) => {
        clearTimeout(timer)
        resolve({ kind: 'error', message: errorMessage(err) })
      })
    })

    if (outcome.kind === 'error') return { ok: false, message: outcome.message }
    return { ok: true, u, info: outcome.kind === 'available' ? outcome.info : null }
  } catch (err) {
    return { ok: false, message: errorMessage(err) }
  }
}

async function performCheck(pref: SourcePref): Promise<CheckResult> {
  const order: Array<'github' | 'gitee' | 'test'> = TEST_URL
    ? ['test']
    : pref === 'gitee'
      ? ['gitee', 'github']
      : ['github', 'gitee']

  state = 'checking'
  let lastError = ''
  for (const source of order) {
    send('checking', { source })
    const attempt = await checkOn(source)
    // 用 === 显式判别：项目 tsconfig 关闭了 strictNullChecks，布尔真值收窄会失效
    if (attempt.ok === true) {
      updater = attempt.u
      activeSource = source
      updateInfo = attempt.info
      if (attempt.info) {
        state = isPortable() ? 'available' : 'downloading'
        send('update-available', { version: attempt.info.version, source })
        if (!isPortable()) {
          attempt.u.downloadUpdate().catch((err: unknown) => {
            state = 'error'
            send('download-error', { message: errorMessage(err) })
          })
        }
      } else {
        state = 'none'
        send('update-not-available', { source })
      }
      return {
        ok: true,
        source,
        updateAvailable: !!attempt.info,
        version: attempt.info?.version
      }
    }
    lastError = attempt.message
    send('source-failed', { source, message: attempt.message })
  }

  state = 'error'
  send('error', { message: lastError })
  return { ok: false, error: lastError || '所有更新源均不可用' }
}

export function checkForUpdates(pref: SourcePref = 'auto'): Promise<CheckResult> {
  // 已在下载/已就绪时直接回报状态，避免重复检查产生两个实例同时下载
  if (state === 'downloading' || state === 'downloaded' || state === 'available') {
    return Promise.resolve({
      ok: true,
      source: activeSource,
      updateAvailable: true,
      version: updateInfo?.version
    })
  }
  if (inFlight) return inFlight
  inFlight = performCheck(pref).finally(() => {
    inFlight = null
  })
  return inFlight
}

function installNow(): void {
  if (state === 'downloaded' && updater) {
    // 向导式安装器会以静默 update 模式运行，并沿用原安装目录
    updater.quitAndInstall()
  }
}

function openReleasesPage(): void {
  const url =
    activeSource === 'gitee'
      ? `https://gitee.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
      : GITHUB_RELEASES_URL
  shell.openExternal(url)
}

export function initUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:is-portable', () => isPortable())
  ipcMain.handle('updater:check', (_e, pref: SourcePref) =>
    checkForUpdates(pref ?? 'auto')
  )
  ipcMain.handle('updater:install', () => installNow())
  ipcMain.handle('updater:open-releases', () => openReleasesPage())

  // 开发模式默认不联网检查；用 LLK_UPDATE_URL 指向本地服务可测试完整更新链路
  if (!app.isPackaged && !process.env.LLK_UPDATE_URL) return

  setTimeout(() => {
    checkForUpdates('auto').catch(() => {})
  }, AUTO_CHECK_DELAY_MS)
}
