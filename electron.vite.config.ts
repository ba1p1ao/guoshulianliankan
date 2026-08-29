import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  // electron-updater 等运行时依赖不打进 bundle，由 electron-builder 随 node_modules 打包
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {}
})
