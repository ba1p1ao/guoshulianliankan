# 果蔬连连看（单机版）

基于 **Electron + electron-vite + TypeScript** 开发的果蔬主题连连看单机小游戏，支持 10 关闯关模式，每关拥有不同的方块移动规则。

## 功能特性

- 经典连连看玩法：点击两个相同图案、且连线路径转折不超过 2 次的方块即可消除。
- 10 关闯关模式，每关消除后剩余方块按本关方向移动（重力 / 聚散 / 放射），逐关递进。
- 计时进度条（倒计时随消除恢复），时间耗尽即失败。
- 提示、洗牌、暂停功能；通关后进入下一关，全部通关显示胜利。
- 自适应全屏窗口，格子大小随窗口自动缩放。
- 两种发布形态：
  - **安装版** `guoshu-llk-x.x.x-setup.exe`：含桌面与开始菜单快捷方式，安装后自动运行。
  - **便携版** `guoshu-llk-x.x.x-portable.exe`：单文件，免安装，双击即玩。

## 技术栈

- 渲染框架：Electron 31
- 构建工具：electron-vite 2
- 语言：TypeScript 5 / Vite 5
- 打包：electron-builder 24

## 环境要求

- Node.js 18+（开发使用 v24）
- Windows（当前目标平台为 win32 x64）

## 开发运行

```bash
npm install      # 安装依赖
npm run dev      # 启动开发模式（自动打开调试控制台）
```

开发模式下按 `Ctrl+Shift+I` 或 `F12` 可随时开关 DevTools。

## 打包发布

```bash
npm run dist           # 同时生成安装版与便携版到 dist/
npm run dist:setup     # 仅生成安装版
npm run dist:portable  # 仅生成便携版
```

产物位于 `dist/`：

- `guoshu-llk-<version>-setup.exe` —— 安装版
- `guoshu-llk-<version>-portable.exe` —— 便携版

> 说明：安装包未做代码签名，首次运行时 Windows SmartScreen 可能拦截，点击"仍要运行"即可。

## 操作说明

| 操作 | 说明 |
| --- | --- |
| 鼠标左键点击方块 | 选中；再次点击相同可连的方块即消除 |
| 提示按钮 | 高亮一对可消除的方块 |
| 洗牌按钮 | 当无可消除对时，重新打乱剩余方块 |
| 暂停按钮 | 暂停计时与操作，可继续或返回主菜单 |

## 关卡移动规则

消除后，剩余方块按当前关卡方向移动填补空隙：

| 关卡 | 移动方向 |
| --- | --- |
| 第 1 关 | 不移动（固定） |
| 第 2 关 | 向下重力 |
| 第 3 关 | 向上重力 |
| 第 4 关 | 向左重力 |
| 第 5 关 | 向右重力 |
| 第 6 关 | 中间向左右分散 |
| 第 7 关 | 中间向上下分散 |
| 第 8 关 | 左右向中间聚集 |
| 第 9 关 | 上下向中间聚集 |
| 第 10 关 | 由中心向四周放射 |

## 目录结构

```
.
├── assets/                 # 图标与原始素材（icon.ico 用于程序图标）
├── src/
│   ├── main/               # Electron 主进程（窗口、打包图标）
│   ├── preload/            # 预加载脚本
│   └── renderer/           # 渲染进程
│       ├── board.ts        # 棋盘逻辑（生成、连接判定、聚散/重力）
│       ├── main.ts         # 界面与交互
│       ├── style.css       # 样式
│       ├── index.html      # 页面结构
│       └── src/assets/     # 水果与 UI 图片素材
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

## 许可证

见仓库 `LICENSE` 文件。
