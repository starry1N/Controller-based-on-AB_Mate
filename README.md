# Electron + React 应用框架

一个现代化的桌面应用程序开发框架，集成了 Electron 和 React，使用 TypeScript 和 Vite 开发。

## 功能特性

- ⚛️ **React 18** - 现代 UI 库
- 🔧 **Electron 27** - 跨平台桌面应用框架
- ⚡ **Vite 5** - 极速前端构建工具
- 📘 **TypeScript** - 类型安全的开发体验
- 🎨 **现代化样式** - CSS3 和响应式设计
- 🔐 **安全上下文** - 进程隔离和上下文桥接
- 🚀 **快速 HMR** - 热模块替换支持

## 项目结构

```
electron-react-app/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 主进程入口
│   │   └── preload.ts     # 预加载脚本
│   └── renderer/          # React 应用（渲染进程）
│       ├── App.tsx        # 主应用组件
│       ├── App.css        # 样式文件
│       ├── index.tsx      # React 入口
│       └── index.css      # 全局样式
├── public/                # 静态资源
│   └── index.html         # HTML 模板
├── dist/                  # 编译输出（自动生成）
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── vite.config.ts         # Vite 渲染进程配置
├── vite.config.main.ts    # Vite 主进程配置
└── .gitignore            # Git 忽略文件
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

运行以下命令同时启动 Vite 开发服务器和 Electron：

```bash
npm run dev
```

Vite 提供快速的热模块替换（HMR），修改 React 代码会自动刷新应用。

### 3. 生产构建

构建应用程序：

```bash
npm run build
```

### 4. 启动应用

```bash
npm start
```

## 可用的脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（Vite + Electron）|
| `npm run build-main` | 构建 Electron 主进程 |
| `npm run build-renderer` | 构建 React 应用 |
| `npm run build` | 完整构建和打包 |
| `npm run preview` | 预览生产构建 |
| `npm start` | 启动 Electron 应用 |

## 开发指南

### 修改主进程代码

编辑 `src/main/main.ts` 中的代码，需要重启 Electron 才能看到更改。

### 修改 React 应用

编辑 `src/renderer/` 中的代码，Vite 会自动进行热模块替换，无需重启。

### 使用 Electron 功能

通过预加载脚本 (`src/main/preload.ts`) 将 Electron 功能暴露给渲染进程。

## 配置说明

### TypeScript 配置

- **目标**：ES2020
- **模块**：ESNext
- **JSX**：react-jsx

### Vite 配置

两个独立的 Vite 配置：

1. **vite.config.ts** - 渲染进程（React）
   - 端口：5173
   - 输出目录：`dist/renderer`
   - 启用 HMR

2. **vite.config.main.ts** - 主进程（Electron）
   - 输出目录：`dist/main`
   - 外部依赖：electron
   - 目标：Node 18

## 系统要求

- Node.js 16 或更高版本
- npm 8 或更高版本

## 许可证

MIT

## 后续步骤

1. 安装依赖：`npm install`
2. 启动开发服务器：`npm run dev`
3. 在 VS Code 中按 F5 调试应用
4. 自定义应用功能和样式

有问题？查看官方文档：
- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)
- [Vite 文档](https://vitejs.dev)
