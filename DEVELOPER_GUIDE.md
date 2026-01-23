# 🎧 TWS 耳机控制 APP 开发文档

> 基于 **Electron + React + TypeScript + AB-Mate 协议** 的完整开发指南

---

## 📚 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术架构](#2-技术架构)
- [3. 目录结构](#3-目录结构)
- [4. 核心模块详解](#4-核心模块详解)
- [5. AB-Mate 协议实现](#5-ab-mate-协议实现)
- [6. 开发流程](#6-开发流程)
- [7. 构建与部署](#7-构建与部署)
- [8. 调试指南](#8-调试指南)
- [9. 常见问题](#9-常见问题)
- [10. API 文档](#10-api-文档)

---

## 1. 项目概览

### 1.1 项目简介

这是一个专为 TWS（True Wireless Stereo）蓝牙耳机开发的桌面控制应用，使用 **AB-Mate 协议**与耳机进行通信。应用支持 Windows、macOS 和 Linux 平台，提供丰富的耳机控制功能。

### 1.2 核心功能

| 功能分类 | 功能列表 | 说明 |
|---------|---------|------|
| **连接管理** | 设备扫描、连接、断开 | 基于 Web Bluetooth API |
| **音频控制** | 10段EQ均衡器、音量调节 | 支持6种预设EQ + 自定义 |
| **降噪控制** | ANC主动降噪、透传模式 | 4档降噪 + 3档透传 |
| **设备信息** | 电池电量、固件版本 | 左右耳 + 充电盒电量 |
| **高级功能** | 游戏模式、设备查找、入耳检测 | 低延迟模式、蜂鸣定位 |

### 1.3 技术亮点

✅ **TypeScript 全栈开发** - 类型安全、代码提示完善  
✅ **React Hooks 架构** - 函数式组件、状态管理清晰  
✅ **AB-Mate 协议完整实现** - 支持所有官方命令  
✅ **响应式 UI 设计** - 适配不同屏幕尺寸  
✅ **实时数据同步** - 设备状态自动更新  
✅ **完善的错误处理** - 超时机制、重连逻辑  

---

## 2. 技术架构

### 2.1 技术栈

```
┌─────────────────────────────────────────┐
│           Electron 应用层                │
├─────────────────────────────────────────┤
│  主进程 (Main Process)                   │
│  - Node.js 运行时                        │
│  - 窗口管理                              │
│  - BLE 权限配置                          │
├─────────────────────────────────────────┤
│  渲染进程 (Renderer Process)             │
│  - React 18.2                           │
│  - TypeScript 5.3                       │
│  - Vite 5.0 (构建工具)                  │
├─────────────────────────────────────────┤
│  通信层                                  │
│  - Web Bluetooth API                    │
│  - AB-Mate Protocol Handler             │
│  - BLE GATT Service                     │
├─────────────────────────────────────────┤
│  硬件层                                  │
│  - TWS 蓝牙耳机                         │
│  - AB-Mate 协议固件                     │
└─────────────────────────────────────────┘
```

### 2.2 架构设计

#### 分层架构

```
┌──────────────────────────────────────────┐
│         UI Layer (组件层)                 │
│  - DeviceConnection  设备连接             │
│  - DeviceInfo        设备信息             │
│  - ANCControl        降噪控制             │
│  - EQControl         均衡器控制           │
└──────────────────────────────────────────┘
              ↓ Props / Callbacks
┌──────────────────────────────────────────┐
│      Business Logic Layer (业务层)        │
│  - App.tsx           应用主逻辑           │
│  - 状态管理 (useState)                    │
│  - 事件处理器                             │
└──────────────────────────────────────────┘
              ↓ API Calls
┌──────────────────────────────────────────┐
│      Service Layer (服务层)               │
│  - ABMateProtocol    协议处理             │
│  - BLEService        蓝牙通信             │
└──────────────────────────────────────────┘
              ↓ GATT Operations
┌──────────────────────────────────────────┐
│      Hardware Layer (硬件层)              │
│  - Web Bluetooth API                     │
│  - BLE GATT Services & Characteristics   │
└──────────────────────────────────────────┘
```

### 2.3 数据流

```
用户操作 → UI组件 → 事件处理器 → ABMateProtocol
                                      ↓
                              构建数据包 (buildPacket)
                                      ↓
                              BLEService.writeWithoutResponse
                                      ↓
                              Web Bluetooth API
                                      ↓
                              蓝牙耳机接收处理
                                      ↓
                              设备响应 (RESPONSE)
                                      ↓
                              BLEService.onData 回调
                                      ↓
                              ABMateProtocol.handleReceivedData
                                      ↓
                              解析响应 (parsePacket)
                                      ↓
                              更新设备信息 → UI 更新
```

---

## 3. 目录结构

### 3.1 完整目录树

```
Electron App/
├── src/                          # 源代码目录
│   ├── main/                     # 主进程代码
│   │   ├── main.ts              # Electron 主进程入口
│   │   └── preload.ts           # 预加载脚本
│   │
│   └── renderer/                # 渲染进程代码
│       ├── App.tsx              # React 应用主组件
│       ├── App.css              # 应用样式
│       ├── index.tsx            # React 入口文件
│       ├── index.css            # 全局样式
│       ├── vite-env.d.ts        # Vite 类型声明
│       │
│       ├── components/          # React 组件
│       │   ├── DeviceConnection.tsx   # 设备连接组件
│       │   ├── DeviceConnection.css
│       │   ├── DeviceInfo.tsx         # 设备信息组件
│       │   ├── DeviceInfo.css
│       │   ├── ANCControl.tsx         # ANC控制组件
│       │   ├── ANCControl.css
│       │   ├── EQControl.tsx          # EQ控制组件
│       │   └── EQControl.css
│       │
│       ├── services/            # 业务服务层
│       │   ├── ABMateProtocol.ts      # AB-Mate 协议实现
│       │   └── BLEService.ts          # BLE 通信服务
│       │
│       └── types/               # TypeScript 类型定义
│           └── ab-mate.ts             # AB-Mate 协议类型
│
├── public/                      # 公共资源
│   └── index.html              # HTML 模板
│
├── dist/                        # 构建输出目录
│   ├── main/                   # 主进程构建产物
│   └── renderer/               # 渲染进程构建产物
│
├── docs/                        # 文档目录
│   ├── AB_MATE_PROTOCOL_COMPLETE_GUIDE.md    # 协议完整指南
│   ├── IMPLEMENTATION_GUIDE.md               # 实现指南
│   ├── DIAGNOSIS_GUIDE.md                    # 诊断指南
│   └── COMMAND_RESPONSE_MATCHING_FIX.md      # 响应匹配修复
│
├── package.json                 # NPM 包配置
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 渲染进程配置
├── vite.config.main.ts         # Vite 主进程配置
└── README.md                   # 项目说明
```

### 3.2 关键文件说明

| 文件路径 | 功能说明 | 重要度 |
|---------|---------|-------|
| `src/main/main.ts` | Electron 主进程入口，窗口管理、BLE权限 | ⭐⭐⭐⭐⭐ |
| `src/renderer/App.tsx` | React 应用主组件，状态管理、事件协调 | ⭐⭐⭐⭐⭐ |
| `src/renderer/services/ABMateProtocol.ts` | AB-Mate 协议核心实现 | ⭐⭐⭐⭐⭐ |
| `src/renderer/services/BLEService.ts` | BLE 底层通信封装 | ⭐⭐⭐⭐⭐ |
| `src/renderer/types/ab-mate.ts` | 完整的类型定义 | ⭐⭐⭐⭐ |
| `package.json` | 依赖管理、构建脚本 | ⭐⭐⭐⭐ |

---

## 4. 核心模块详解

### 4.1 主进程 (Main Process)

**文件**: `src/main/main.ts`

#### 核心功能

1. **窗口管理**
```typescript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,        // 安全：禁用 Node 集成
      contextIsolation: true,        // 安全：启用上下文隔离
      enableRemoteModule: false,     // 安全：禁用 remote 模块
      preload: path.join(__dirname, 'preload.js'),
      enableBlinkFeatures: 'WebBluetooth',  // 启用 Web Bluetooth
    },
  });
}
```

2. **BLE 设备选择处理**
```typescript
mainWindow.webContents.session.on('select-bluetooth-device', 
  (event, deviceList, callback) => {
    event.preventDefault();
    if (deviceList.length > 0) {
      callback(deviceList[0].deviceId);  // 选择第一个设备
    }
});
```

3. **BLE 配对处理**
```typescript
mainWindow.webContents.session.setBluetoothPairingHandler(
  (details, callback) => {
    if (details.pairingKind === 'confirm') {
      callback({ confirmed: true });  // 自动确认配对
    }
});
```

#### 生命周期

```
app.on('ready')        → 创建窗口
app.on('activate')     → macOS 重新激活
app.on('window-all-closed') → 退出应用 (非 macOS)
```

### 4.2 预加载脚本 (Preload Script)

**文件**: `src/main/preload.ts`

暴露安全的 IPC 接口到渲染进程：

```typescript
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, args: any) => ipcRenderer.send(channel, args),
    on: (channel: string, func: any) => ipcRenderer.on(channel, func),
  },
});
```

### 4.3 BLE 服务 (BLEService)

**文件**: `src/renderer/services/BLEService.ts`

#### 核心职责

- 设备扫描与连接
- GATT 服务发现
- 特征读写操作
- 通知订阅管理

#### 关键方法

```typescript
class BLEService {
  // 扫描并连接设备
  async scanAndConnect(): Promise<BluetoothDevice>
  
  // 连接到 GATT 服务器
  async connect(): Promise<void>
  
  // 断开连接
  async disconnect(): Promise<void>
  
  // 发送数据（无响应，快速）
  async writeWithoutResponse(data: Uint8Array): Promise<void>
  
  // 发送数据（带响应）
  async write(data: Uint8Array): Promise<void>
  
  // 设置数据接收回调
  onData(callback: (data: DataView) => void): void
  
  // 设置断开连接回调
  onDisconnect(callback: () => void): void
}
```

#### AB-Mate GATT 服务结构

```
Service UUID: 0xFF01
├── Characteristic 0xFF18 (Notify)     - 接收设备通知
├── Characteristic 0xFF16 (Write)      - 发送命令（带响应）
└── Characteristic 0xFF17 (WriteCmd)   - 发送命令（无响应，推荐）
```

### 4.4 AB-Mate 协议 (ABMateProtocol)

**文件**: `src/renderer/services/ABMateProtocol.ts`

#### 核心职责

- 数据包构建与解析
- 命令发送与响应匹配
- 序列号管理
- 设备信息缓存
- 事件通知

#### 关键方法分类

**连接管理**
```typescript
async connect(): Promise<void>           // 连接设备
async disconnect(): Promise<void>        // 断开连接
```

**设备查询**
```typescript
async queryDeviceInfo(infoTypes?: number[]): Promise<void>  // 查询设备信息
getDeviceInfo(): Partial<ABMateDeviceInfo>                 // 获取缓存信息
```

**音频控制**
```typescript
async setEQ(config: ABMateEQConfig): Promise<void>      // 设置 EQ
async setVolume(volume: number): Promise<void>          // 设置音量
```

**降噪控制**
```typescript
async setANCMode(mode: ABMateANCMode): Promise<void>    // 设置 ANC 模式
async setANCLevel(level: number): Promise<void>         // 设置降噪等级
async setTransparencyLevel(level: number): Promise<void> // 设置透传等级
```

**设备设置**
```typescript
async setDeviceMode(mode: ABMateDeviceMode): Promise<void> // 设置工作模式
async setInEarDetection(enabled: boolean): Promise<void>   // 入耳检测
async setLED(enabled: boolean): Promise<void>              // LED 灯
async set3DAudio(enabled: boolean): Promise<void>          // 3D 音效
```

**特殊功能**
```typescript
async findDevice(side: 'left'|'right'|'both'): Promise<void> // 设备查找
async resetDevice(): Promise<void>                           // 设备复位
async setBluetoothName(name: string): Promise<void>          // 设置蓝牙名称
```

#### 事件系统

```typescript
protocol.on('onConnected', () => {})           // 连接成功
protocol.on('onDisconnected', () => {})        // 断开连接
protocol.on('onDeviceInfoUpdated', (info) => {}) // 设备信息更新
protocol.on('onBatteryUpdated', (l, r, c) => {}) // 电池电量更新
protocol.on('onEQChanged', (config) => {})     // EQ 变化
protocol.on('onError', (error) => {})          // 错误事件
```

### 4.5 React 组件

#### App.tsx - 应用主组件

**状态管理**
```typescript
const [connectionState, setConnectionState] = useState<ConnectionState>()
const [deviceInfo, setDeviceInfo] = useState<Partial<ABMateDeviceInfo>>()
const [eqConfig, setEQConfig] = useState<ABMateEQConfig>()
```

**服务引用**
```typescript
const bleServiceRef = useRef<BLEService | null>(null)
const protocolRef = useRef<ABMateProtocol | null>(null)
```

**生命周期**
```typescript
useEffect(() => {
  // 初始化服务
  bleServiceRef.current = new BLEService()
  protocolRef.current = new ABMateProtocol(bleServiceRef.current)
  
  // 设置事件监听
  protocolRef.current.on('onConnected', handleConnected)
  
  // 清理
  return () => {
    bleServiceRef.current?.disconnect()
  }
}, [])
```

#### DeviceConnection - 设备连接组件

```typescript
interface DeviceConnectionProps {
  connectionState: ConnectionState    // 连接状态
  deviceName: string                 // 设备名称
  onConnect: () => void              // 连接回调
  onDisconnect: () => void           // 断开回调
}
```

#### DeviceInfo - 设备信息组件

```typescript
interface DeviceInfoProps {
  deviceInfo: Partial<ABMateDeviceInfo>  // 设备信息
  onFindDevice: (side: 'left'|'right'|'both') => void  // 查找设备
  onToggleMode: () => void                              // 切换模式
  onVolumeChange: (volume: number) => void             // 音量变化
}
```

#### ANCControl - 降噪控制组件

```typescript
interface ANCControlProps {
  ancMode: ABMateANCMode              // 当前模式
  ancLevel: number                    // 降噪等级
  tpLevel: number                     // 透传等级
  onModeChange: (mode: ABMateANCMode) => void
  onANCLevelChange: (level: number) => void
  onTPLevelChange: (level: number) => void
}
```

#### EQControl - 均衡器控制组件

```typescript
interface EQControlProps {
  eqConfig: ABMateEQConfig           // EQ 配置
  onChange: (config: ABMateEQConfig) => void  // 变化回调
}
```

---

## 5. AB-Mate 协议实现

### 5.1 数据包格式

#### 完整格式（7 字节头部）

```
┌─────────┬─────────┬──────────┬──────┬──────────┬──────────┬─────────────┬─────────┐
│ TAG_H   │ TAG_L   │ Seq/Res  │ CMD  │ CMD_TYPE │ Frame    │ PAYLOAD_LEN │ PAYLOAD │
│ 0xAB    │ 0x23    │ (1 byte) │      │          │ (1 byte) │ (1 byte)    │ (N)     │
└─────────┴─────────┴──────────┴──────┴──────────┴──────────┴─────────────┴─────────┘
  Byte 0    Byte 1    Byte 2    Byte 3  Byte 4     Byte 5     Byte 6      Byte 7+
```

#### 字节详解

**Byte 0-1: TAG (固定 0xAB23)**
- 标识 AB-Mate 协议数据包

**Byte 2: SEQ/RES/ENC**
```
Bit 7      Bit 6-4        Bit 3-0
┌────────┬────────────┬─────────────┐
│ ENCRYPT│  PRELOAD   │    SEQ      │
│ (1bit) │  (3bits)   │  (4bits)    │
└────────┴────────────┴─────────────┘
```
- SEQ: 序列号 (0-15)
- PRELOAD: 预留字段 (0-7)
- ENCRYPT: 加密标志 (0=未加密, 1=加密)

**Byte 3: CMD (命令码)**
```
0x20 - EQ_SET             均衡器设置
0x24 - DEVICE_RESET       设备复位
0x25 - MODE_SET           工作模式
0x26 - IN_EAR_SET         入耳检测
0x27 - DEVICE_INFO_GET    查询设备信息
0x28 - DEVICE_INFO_NOTIFY 设备信息通知
0x2A - BT_NAME_SET        蓝牙名称
0x2B - LED_SET            LED 灯
0x2C - ANC_SET            ANC 模式
0x2D - VOL_SET            音量
0x2E - ANC_LEVEL_SET      降噪等级
0x2F - TP_LEVEL_SET       透传等级
0x30 - V3D_AUDIO_SET      3D 音效
0x31 - DEVICE_FIND        设备查找
```

**Byte 4: CMD_TYPE**
```
1 - REQUEST   请求
2 - RESPONSE  响应
3 - NOTIFY    通知
```

**Byte 5: FRAME**
```
Bit 7-4         Bit 3-0
┌─────────────┬─────────────┐
│ FRAME_TOTAL │  FRAME_SEQ  │
│  (4bits)    │  (4bits)    │
└─────────────┴─────────────┘
```
- FRAME_SEQ: 当前帧序号 (0-15)
- FRAME_TOTAL: 总帧数 (0=单帧, 1-15=多帧)

**Byte 6: PAYLOAD_LEN**
- 载荷长度 (0-250)

**Byte 7+: PAYLOAD**
- 实际载荷数据

### 5.2 TLV 格式

设备信息查询/响应使用 TLV (Type-Length-Value) 格式：

```
┌──────┬────────┬────────────────┐
│ TYPE │ LENGTH │     VALUE      │
│ 1B   │ 1B     │  (LENGTH 字节) │
└──────┴────────┴────────────────┘
```

**常用 Type 值**
```
0x01 - INFO_POWER      电池电量
0x02 - INFO_VERSION    固件版本
0x04 - INFO_EQ         EQ 设置
0x0C - INFO_ANC        ANC 模式
0xFF - INFO_MTU        MTU 大小
0xFE - INFO_DEV_CAP    设备能力
```

### 5.3 序列号机制

#### 序列号规则

1. **APP 端**：每次发送命令前递增 (0-15 循环)
2. **设备端**：收到命令后递增，发送响应时再次递增
3. **匹配策略**：支持精确匹配和 `(seq-1) & 0x0F` 匹配

#### 实现代码

```typescript
private getNextSeq(): number {
  const currentSeq = this.seq & 0xFF;
  this.seq = (this.seq + 1) & 0xFF;
  return currentSeq;
}

// 发送时
const seq = this.getNextSeq();
packet[2] = (seq & 0x0F) | ...

// 接收时匹配
const matchedSeq = this.pendingRequests.has(packet.seq)
  ? packet.seq
  : ((packet.seq - 1) & 0x0F);
```

### 5.4 请求-响应匹配

#### pendingRequests 机制

```typescript
private pendingRequests: Map<number, {
  resolve: (data: Uint8Array) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}> = new Map();

// 注册请求
this.pendingRequests.set(seq, {
  resolve: (data) => { /* 处理响应 */ },
  reject: (error) => { /* 处理错误 */ },
  timeout: setTimeout(() => {
    // 5000ms 超时
    this.pendingRequests.delete(seq);
    console.warn('命令超时');
  }, 5000)
});

// 接收到响应时
const request = this.pendingRequests.get(matchedSeq);
if (request) {
  clearTimeout(request.timeout);
  request.resolve(packet.payload);
  this.pendingRequests.delete(matchedSeq);
}
```

### 5.5 错误处理

#### 常见错误码

```typescript
export enum ABMateResult {
  SUCCESS = 0,  // 成功
  FAIL = 1,     // 失败
}
```

#### 错误处理流程

```typescript
// 超时错误
setTimeout(() => {
  this.callbacks.onError?.(new Error('设备无响应，请检查连接'));
}, 5000);

// BLE 发送错误
try {
  await this.bleService.writeWithoutResponse(packet);
} catch (error) {
  this.callbacks.onError?.(error as Error);
}

// 协议错误
if (packet.payload[0] === ABMateResult.FAIL) {
  console.warn('命令执行失败，错误码:', packet.payload[0]);
}
```

---

## 6. 开发流程

### 6.1 环境准备

#### 系统要求

- **Node.js**: 18.0+ (推荐 18.x LTS)
- **npm**: 9.0+
- **操作系统**: Windows 10+, macOS 10.15+, Ubuntu 20.04+
- **浏览器内核**: Chromium 90+ (Electron 内置)

#### 开发工具

- **IDE**: VS Code (推荐)
- **VS Code 插件**:
  - ESLint
  - TypeScript Vue Plugin (Volar)
  - Prettier
  - Error Lens

### 6.2 初始化项目

```bash
# 1. 克隆仓库
git clone <repository-url>
cd Electron App

# 2. 安装依赖
npm install

# 3. 验证安装
npm run dev
```

### 6.3 开发命令

```bash
# 开发模式（热重载）
npm run dev
# → 启动 Vite 开发服务器 (localhost:5173)
# → 自动构建主进程
# → 启动 Electron 窗口

# 仅构建主进程
npm run build-main
# → esbuild 构建 main.ts 和 preload.ts
# → 输出到 dist/main/

# 仅构建渲染进程
npm run build-renderer
# → Vite 构建 React 应用
# → 输出到 dist/renderer/

# 完整构建
npm run build
# → 构建主进程 + 渲染进程
# → 使用 electron-builder 打包应用

# 预览构建结果
npm run preview
# → 启动 Vite 预览服务器

# 启动已构建的应用
npm start
# → electron . (需要先 build)
```

### 6.4 开发工作流

#### 添加新功能

1. **定义类型** (`src/renderer/types/ab-mate.ts`)
```typescript
// 1. 添加命令枚举
export enum ABMateCommand {
  NEW_FEATURE = 0x35,
}

// 2. 添加相关类型
export interface NewFeatureConfig {
  enabled: boolean;
  level: number;
}
```

2. **实现协议** (`src/renderer/services/ABMateProtocol.ts`)
```typescript
async setNewFeature(config: NewFeatureConfig): Promise<void> {
  const payload = new Uint8Array([
    config.enabled ? 1 : 0,
    config.level
  ]);
  const packet = this.buildPacket(
    ABMateCommand.NEW_FEATURE,
    ABMateCommandType.REQUEST,
    payload
  );
  await this.sendAndWait(packet);
}
```

3. **创建组件** (`src/renderer/components/NewFeatureControl.tsx`)
```typescript
interface NewFeatureControlProps {
  config: NewFeatureConfig;
  onChange: (config: NewFeatureConfig) => void;
}

export const NewFeatureControl: React.FC<NewFeatureControlProps> = ({
  config,
  onChange
}) => {
  // 组件实现
};
```

4. **集成到 App** (`src/renderer/App.tsx`)
```typescript
const [featureConfig, setFeatureConfig] = useState<NewFeatureConfig>({
  enabled: false,
  level: 0
});

const handleFeatureChange = async (config: NewFeatureConfig) => {
  setFeatureConfig(config);
  await protocolRef.current?.setNewFeature(config);
};

// JSX
<NewFeatureControl 
  config={featureConfig} 
  onChange={handleFeatureChange} 
/>
```

#### 调试技巧

**1. 启用详细日志**

所有协议交互都有详细的控制台日志：
```
📤 发送命令: [TAG:AB23] [SEQ:0] [CMD:0x2C] ...
📥 收到原始数据 (8 字节): ab 23 02 2c 02 00 01 00
✅ 序列号 0 的请求已匹配响应
```

**2. Chrome DevTools**

主进程自动打开 DevTools：
- **Console**: 查看日志
- **Network**: 无 HTTP 请求（使用 BLE）
- **Application**: 查看存储

**3. React DevTools**

安装 React DevTools 浏览器插件查看组件树和状态。

**4. BLE 调试**

使用 `chrome://bluetooth-internals` 查看底层 BLE 交互（仅限开发模式）。

### 6.5 代码规范

#### TypeScript 规范

```typescript
// ✅ 显式类型注解
const volume: number = 50;
async function setVolume(vol: number): Promise<void> { }

// ✅ 接口定义
interface DeviceInfo {
  name: string;
  battery: number;
}

// ✅ 枚举使用
enum ConnectionState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected'
}

// ❌ 避免 any
const data: any = getData();  // 不推荐
```

#### React 规范

```typescript
// ✅ 函数组件 + Hooks
const MyComponent: React.FC<Props> = ({ value }) => {
  const [state, setState] = useState(0);
  return <div>{value}</div>;
};

// ✅ useEffect 清理
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe();
}, []);

// ❌ 避免内联函数
<button onClick={() => handleClick()}>  // 不推荐
<button onClick={handleClick}>          // 推荐
```

#### 命名规范

```typescript
// 组件: PascalCase
DeviceConnection, ANCControl

// 函数/变量: camelCase
handleConnect, deviceInfo

// 常量: UPPER_SNAKE_CASE
AB_MATE_CONSTANTS, SERVICE_UUID

// 类型/接口: PascalCase
ABMateDeviceInfo, ConnectionState

// 文件名: kebab-case (组件除外)
ab-mate.ts, device-connection.tsx
```

---

## 7. 构建与部署

### 7.1 构建配置

#### package.json 配置

```json
{
  "build": {
    "appId": "com.electron.app",
    "productName": "Electron React App",
    "files": [
      "dist/",
      "node_modules/",
      "package.json"
    ],
    "directories": {
      "buildResources": "public"
    },
    "win": {
      "target": ["nsis", "portable"]
    },
    "mac": {
      "target": ["dmg", "zip"]
    },
    "linux": {
      "target": ["AppImage", "deb"]
    }
  }
}
```

#### Vite 配置

**渲染进程** (`vite.config.ts`)
```typescript
export default defineConfig({
  base: './',               // 相对路径
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    minify: true,           // 生产环境压缩
    sourcemap: true
  }
})
```

**主进程** (`vite.config.main.ts`)
```typescript
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs']
    },
    outDir: 'dist/main',
    target: 'node18',
    rollupOptions: {
      external: ['electron']
    }
  }
})
```

### 7.2 打包应用

#### Windows

```bash
# 安装 Windows 构建工具
npm install --save-dev electron-builder

# 构建 Windows 安装包
npm run build
# → 生成 dist/Electron React App Setup.exe

# 构建便携版
npm run build -- --win portable
# → 生成 dist/Electron React App Portable.exe
```

#### macOS

```bash
# 构建 DMG
npm run build -- --mac dmg
# → 生成 dist/Electron React App.dmg

# 签名应用（需要 Apple Developer 证书）
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
npm run build
```

#### Linux

```bash
# 构建 AppImage
npm run build -- --linux AppImage
# → 生成 dist/Electron React App.AppImage

# 构建 DEB 包
npm run build -- --linux deb
# → 生成 dist/electron-react-app_1.0.0_amd64.deb
```

### 7.3 发布流程

#### 1. 版本管理

```bash
# 更新版本号
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.1 → 1.1.0
npm version major  # 1.1.0 → 2.0.0

# 提交标签
git push --tags
```

#### 2. 自动更新

配置 `electron-updater`:

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();
autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    message: '新版本已下载，重启应用安装？'
  });
});
```

---

## 8. 调试指南

### 8.1 常见问题排查

#### 无法连接设备

**症状**: 点击"连接设备"后无反应或报错

**排查步骤**:
1. 检查浏览器支持
```typescript
if (!navigator.bluetooth) {
  console.error('浏览器不支持 Web Bluetooth');
}
```

2. 检查权限
- Windows: 设置 → 蓝牙和设备 → 允许应用访问蓝牙
- macOS: 系统偏好设置 → 安全性与隐私 → 蓝牙
- Linux: 确保 `bluez` 服务运行

3. 检查设备状态
- 耳机是否开机
- 是否处于配对模式
- 是否已连接其他设备

4. 查看控制台日志
```
🔄 开始连接设备...
发现设备: TWS Earbuds
正在连接 GATT 服务器...
✅ 设备已连接
```

#### 命令无响应

**症状**: 发送命令后超时，提示"设备无响应"

**原因**:
1. 序列号不匹配
2. 设备固件版本不兼容
3. BLE 连接不稳定

**解决方案**:
```typescript
// 检查待处理请求
console.log('待处理请求:', this.pendingRequests.size);

// 检查序列号匹配
if (packet.type === ABMateCommandType.RESPONSE) {
  const matchedSeq = this.pendingRequests.has(packet.seq)
    ? packet.seq
    : ((packet.seq - 1) & 0x0F);
  console.log('响应序列号:', packet.seq, '匹配序列号:', matchedSeq);
}

// 增加超时时间
await this.sendAndWait(packet, 10000);  // 10秒超时
```

#### 数据解析错误

**症状**: 收到数据但解析失败，提示 "TLV data overflow"

**原因**:
1. PAYLOAD_LEN 字段与实际长度不符
2. TLV 数据格式错误

**解决方案**:
参考 [COMMAND_RESPONSE_MATCHING_FIX.md](COMMAND_RESPONSE_MATCHING_FIX.md)

### 8.2 性能优化

#### 减少重渲染

```typescript
// ✅ 使用 React.memo
export const DeviceInfo = React.memo<DeviceInfoProps>(({ deviceInfo }) => {
  // ...
});

// ✅ 使用 useCallback
const handleVolumeChange = useCallback((vol: number) => {
  protocolRef.current?.setVolume(vol);
}, []);

// ✅ 使用 useMemo
const batteryPercentage = useMemo(() => {
  return Math.round((deviceInfo.leftBattery + deviceInfo.rightBattery) / 2);
}, [deviceInfo.leftBattery, deviceInfo.rightBattery]);
```

#### 减少 BLE 交互

```typescript
// ❌ 频繁查询
setInterval(() => {
  queryDeviceInfo();
}, 1000);

// ✅ 订阅通知
protocol.on('onDeviceInfoUpdated', (info) => {
  setDeviceInfo(info);
});
```

---

## 9. 常见问题

### 9.1 编译错误

#### "Cannot find module 'electron'"

```bash
# 解决：重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript 类型错误

```bash
# 解决：安装类型定义
npm install --save-dev @types/web-bluetooth
npm install --save-dev @types/node
```

### 9.2 运行时错误

#### "Bluetooth adapter not available"

- Windows: 确保蓝牙适配器已启用
- Linux: 安装 `bluez` 并启动服务
  ```bash
  sudo apt install bluez
  sudo systemctl start bluetooth
  ```

#### "User cancelled the requestDevice() chooser"

用户取消了设备选择对话框，这是正常行为。

### 9.3 平台特定问题

#### macOS 权限问题

编辑 `Info.plist`:
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>此应用需要蓝牙权限以连接耳机</string>
```

#### Linux AppImage 无法运行

```bash
# 添加执行权限
chmod +x Electron\ React\ App.AppImage

# 或使用 --no-sandbox
./Electron\ React\ App.AppImage --no-sandbox
```

---

## 10. API 文档

### 10.1 ABMateProtocol API

#### 构造函数

```typescript
new ABMateProtocol(bleService: BLEService)
```

#### 连接管理

```typescript
async connect(): Promise<void>
// 连接设备并初始化
// 抛出: Error - 连接失败

async disconnect(): Promise<void>
// 断开设备连接
```

#### 查询方法

```typescript
async queryDeviceInfo(infoTypes?: number[]): Promise<void>
// 参数:
//   infoTypes - 要查询的信息类型数组
//     [0x01] - 电池电量
//     [0x02] - 固件版本
//     [0x04] - EQ 设置
//     [0x0C] - ANC 模式
// 示例:
//   await protocol.queryDeviceInfo([0x01, 0x02])

getDeviceInfo(): Partial<ABMateDeviceInfo>
// 返回: 当前缓存的设备信息
```

#### 音频控制

```typescript
async setEQ(config: ABMateEQConfig): Promise<void>
// 参数:
//   config.mode - EQ 模式 (0-5: 预设, 0x20: 自定义)
//   config.gains - 10段增益 (-12 到 +12 dB)
// 示例:
//   await protocol.setEQ({
//     mode: ABMateEQMode.BASS,
//     gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
//   })

async setVolume(volume: number): Promise<void>
// 参数: 0-100
// 示例: await protocol.setVolume(80)
```

#### 降噪控制

```typescript
async setANCMode(mode: ABMateANCMode): Promise<void>
// 参数:
//   0 - OFF (关闭)
//   1 - ANC (主动降噪)
//   2 - TRANSPARENCY (透传模式)
// 示例: await protocol.setANCMode(ABMateANCMode.ANC)

async setANCLevel(level: number): Promise<void>
// 参数: 1-4 (降噪强度)
// 示例: await protocol.setANCLevel(3)

async setTransparencyLevel(level: number): Promise<void>
// 参数: 1-3 (透传强度)
// 示例: await protocol.setTransparencyLevel(2)
```

#### 设备设置

```typescript
async setDeviceMode(mode: ABMateDeviceMode): Promise<void>
// 参数:
//   0 - NORMAL (普通模式)
//   1 - GAME (游戏低延迟模式)
// 示例: await protocol.setDeviceMode(ABMateDeviceMode.GAME)

async setInEarDetection(enabled: boolean): Promise<void>
// 参数: true=启用, false=禁用
// 示例: await protocol.setInEarDetection(true)

async setLED(enabled: boolean): Promise<void>
// 参数: true=开启, false=关闭
// 示例: await protocol.setLED(false)

async set3DAudio(enabled: boolean): Promise<void>
// 参数: true=启用, false=禁用
// 示例: await protocol.set3DAudio(true)
```

#### 特殊功能

```typescript
async findDevice(side: 'left' | 'right' | 'both'): Promise<void>
// 参数: 'left'=左耳, 'right'=右耳, 'both'=双耳
// 示例: await protocol.findDevice('both')
// 功能: 设备会发出蜂鸣声以便查找

async resetDevice(): Promise<void>
// 功能: 恢复出厂设置
// 警告: 会清除所有自定义设置
// 示例: await protocol.resetDevice()

async setBluetoothName(name: string): Promise<void>
// 参数: 最长 32 字符
// 示例: await protocol.setBluetoothName('My Earbuds')
```

#### 事件监听

```typescript
on<K extends keyof ABMateEvents>(event: K, callback: ABMateEvents[K]): void

// 可用事件:
'onConnected'         - () => void
'onDisconnected'      - () => void
'onDeviceInfoUpdated' - (info: Partial<ABMateDeviceInfo>) => void
'onBatteryUpdated'    - (left: number, right: number, caseLevel?: number) => void
'onVolumeChanged'     - (volume: number) => void
'onANCModeChanged'    - (mode: ABMateANCMode, level: number) => void
'onEQChanged'         - (config: ABMateEQConfig) => void
'onError'             - (error: Error) => void

// 示例:
protocol.on('onBatteryUpdated', (left, right, caseLevel) => {
  console.log(`电量: 左=${left}%, 右=${right}%, 盒=${caseLevel}%`);
});
```

### 10.2 BLEService API

```typescript
class BLEService {
  static isSupported(): boolean
  // 返回: 浏览器是否支持 Web Bluetooth
  
  async scanAndConnect(): Promise<BluetoothDevice>
  // 扫描并连接设备
  // 返回: BluetoothDevice 对象
  
  async connect(): Promise<void>
  // 连接到已配对设备
  
  async disconnect(): Promise<void>
  // 断开连接
  
  async writeWithoutResponse(data: Uint8Array): Promise<void>
  // 发送数据（无响应，快速）
  
  async write(data: Uint8Array): Promise<void>
  // 发送数据（带响应）
  
  isConnected(): boolean
  // 返回: 当前连接状态
  
  getDeviceName(): string
  // 返回: 设备名称
  
  onData(callback: (data: DataView) => void): void
  // 设置数据接收回调
  
  onDisconnect(callback: () => void): void
  // 设置断开连接回调
}
```

### 10.3 类型定义

完整类型定义参见 `src/renderer/types/ab-mate.ts`

---

## 附录

### A. 依赖清单

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@types/web-bluetooth": "^0.0.20"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "concurrently": "^8.2.0",
    "cross-env": "^10.1.0",
    "electron": "^27.0.0",
    "electron-builder": "^24.6.4",
    "esbuild": "^0.19.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

### B. 参考文档

- [AB-Mate 协议完整指南](AB_MATE_PROTOCOL_COMPLETE_GUIDE.md)
- [实现指南](IMPLEMENTATION_GUIDE.md)
- [诊断指南](DIAGNOSIS_GUIDE.md)
- [命令响应匹配修复](COMMAND_RESPONSE_MATCHING_FIX.md)
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Electron 官方文档](https://www.electronjs.org/docs)
- [React 官方文档](https://react.dev/)

### C. 贡献指南

欢迎提交 Pull Request！

1. Fork 仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### D. 许可证

MIT License

---

**最后更新**: 2026-01-24  
**版本**: 1.0.0  
**维护者**: Development Team
