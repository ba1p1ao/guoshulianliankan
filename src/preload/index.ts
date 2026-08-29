import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

// 该单机游戏的所有逻辑都在渲染进程中完成，主进程负责窗口与在线更新。
// 这里预留一个安全的 API 通道，方便后续扩展（如读取本地最高分等）。
type UpdateSource = 'auto' | 'github' | 'gitee'
type UpdateEvent = { type: string; payload?: Record<string, unknown> }

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  // 在线更新
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  isPortable: (): Promise<boolean> => ipcRenderer.invoke('app:is-portable'),
  checkUpdate: (source?: UpdateSource): Promise<unknown> =>
    ipcRenderer.invoke('updater:check', source ?? 'auto'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  openReleases: (): Promise<void> => ipcRenderer.invoke('updater:open-releases'),
  onUpdaterEvent: (
    callback: (event: UpdateEvent) => void
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, data: UpdateEvent): void =>
      callback(data)
    ipcRenderer.on('updater:event', listener)
    return () => ipcRenderer.removeListener('updater:event', listener)
  }
})
