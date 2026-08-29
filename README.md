# 果蔬连连看（单机版）

基于 **Electron + electron-vite + TypeScript** 开发的果蔬主题连连看单机小游戏，支持 10 关闯关模式，每关拥有不同的方块移动规则。

## 功能特性

- 经典连连看玩法：点击两个相同图案、且连线路径转折不超过 2 次的方块即可消除。
- 10 关闯关模式，每关消除后剩余方块按本关方向移动（重力 / 聚散 / 放射），逐关递进。
- 计时进度条（倒计时随消除恢复），时间耗尽即失败。
- 提示、洗牌、暂停功能；通关后进入下一关，全部通关显示胜利。
- 自适应全屏窗口，格子大小随窗口自动缩放。
- **在线更新**：GitHub Releases + Gitee 发行版双更新源（GitHub 失败自动切换 Gitee），支持 blockmap 差量下载；启动后台自动检查 + 开始界面手动检查；安装版可自更新，便携版引导前往发布页下载。
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

## 在线更新与发布流程

应用集成 electron-updater，双更新源架构：

| | GitHub Releases（主源） | Gitee 发行版（备源） |
| --- | --- | --- |
| 方式 | electron-updater 原生 github provider | generic 直链（运行时经 Gitee API 解析最新 tag） |
| 地址 | 仓库 Releases 自动发现 | `https://gitee.com/ba1p1ao/guoshulianliankan/releases/download/<tag>/` |

- 默认"自动"模式：先查 GitHub，超时（12 秒）或失败自动切换 Gitee；也可在开始界面"检查更新"弹窗中手动指定更新源（偏好存 localStorage）。
- 差量更新依赖 `.blockmap`：Electron 运行时未变化的版本，通常只下载几 MB 增量。
- 便携版不支持自更新（electron-updater 限制），检测到新版本时引导打开发布页。
- 更新日志位置：`%LOCALAPPDATA%\guoshu-llk-updater\`。

### 发布新版本（双平台）

1. 提升版本号：`npm version patch`（生成 vX.Y.Z tag，**tag 必须与版本号一致**）。
2. 构建安装版：`npm run dist:setup`。
3. 在 **GitHub** 与 **Gitee** 两处各自创建**正式**发行版（不能是草稿，草稿不更新），均需上传以下四个同名文件：
   - `dist/guoshu-llk-<version>-setup.exe`
   - `dist/guoshu-llk-<version>-setup.exe.blockmap`
   - `dist/latest.yml`
   - `dist/guoshu-llk-<version>-portable.exe`
4. 发布后已安装的用户将在启动约 5 秒后收到更新并自动下载。

GitHub 侧可用 gh CLI：`gh release create vX.Y.Z dist/guoshu-llk-*-setup.exe dist/guoshu-llk-*-setup.exe.blockmap dist/latest.yml`。

### 本地测试更新链路

不依赖线上发布即可验证全流程：

```bash
npm run dist:setup                    # 构建当前版本（作为"旧版"安装/运行）
# 临时提升 package.json 版本号后再次 npm run dist:setup，得到"新版"产物
npx http-server dist -p 8080          # 本地模拟更新服务器
LLK_UPDATE_URL=http://127.0.0.1:8080/ "旧版应用路径/果蔬连连看.exe"  # 指向本地源
```

启动约 5 秒后旧版会自动发现新版本并下载；日志可通过附加 `--enable-logging` 参数观察。

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
| 第 10 关 | 由四周向中间聚集 |

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
