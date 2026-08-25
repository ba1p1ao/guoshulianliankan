import { contextBridge, ipcRenderer } from 'electron'

// 该单机游戏的所有逻辑都在渲染进程中完成，主进程仅负责窗口。
// 这里预留一个安全的 API 通道，方便后续扩展（如读取本地最高分等）。
contextBridge.exposeInMainWorld('api', {
  platform: process.platform
})
