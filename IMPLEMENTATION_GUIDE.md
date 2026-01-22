# TWS 耳机控制 APP - 开发文档

## 📋 项目概述

这是一个基于 **Electron + React** 框架开发的轻量级 TWS 耳机控制应用，完全遵循 **AB-Mate 协议规范**。

### 核心特性

✅ **完整的 AB-Mate 协议支持**
- 10 段参数化 EQ 均衡器
- ANC 主动降噪（4 档位）
- 透传模式（3 档位）
- 游戏低延迟模式
- 设备查找功能
- 音量实时控制
- 设备信息查询

✅ **现代化技术栈**
- Electron 27 - 桌面应用框架
- React 18 + TypeScript - UI 开发
- Web Bluetooth API - BLE 通信
- Vite - 快速构建工具

✅ **轻量级设计**
- 无需后端服务器
- 直接 BLE 连接
- 体积小、响应快

---

## 🏗️ 项目架构

```
src/
├── main/                          # Electron 主进程
│   ├── main.ts                    # 主进程入口（已启用 Web Bluetooth）
│   └── preload.ts                 # 预加载脚本
│
├── renderer/                      # React 渲染进程
│   ├── types/
│   │   └── ab-mate.ts             # AB-Mate 协议类型定义
│   │
│   ├── services/
│   │   ├── BLEService.ts          # BLE 底层通信服务
│   │   └── ABMateProtocol.ts      # AB-Mate 协议处理类
│   │
│   ├── components/
│   │   ├── DeviceConnection.tsx   # 设备连接组件
│   │   ├── DeviceInfo.tsx         # 设备信息和快捷控制
│   │   ├── EQControl.tsx          # EQ 均衡器控制
│   │   └── ANCControl.tsx         # ANC 降噪控制
│   │
│   ├── App.tsx                    # 主应用组件
│   ├── App.css                    # 主样式
│   └── index.tsx                  # 入口文件
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd "d:\Electron App"
npm install
```

### 2. 启动开发模式

```bash
npm run dev
```

这将：
1. 启动 Vite 开发服务器（端口 5173）
2. 编译 Electron 主进程
3. 自动启动 Electron 应用

### 3. 构建生产版本

```bash
npm run build
```

生成的安装包位于 `dist/` 目录。

---

## 🔌 核心模块说明

### 1. BLE 通信服务 (`BLEService.ts`)

**功能**：
- 扫描并连接 AB-Mate 设备
- 管理 GATT 连接
- 发送/接收 BLE 数据

**主要方法**：
```typescript
class BLEService {
  // 扫描并连接设备
  async scanAndConnect(): Promise<BluetoothDevice>
  
  // 发送数据（带响应）
  async write(data: Uint8Array): Promise<void>
  
  // 发送数据（无响应，更快）
  async writeWithoutResponse(data: Uint8Array): Promise<void>
  
  // 断开连接
  async disconnect(): Promise<void>
  
  // 设置数据接收回调
  onData(callback: (data: DataView) => void): void
}
```

### 2. AB-Mate 协议处理 (`ABMateProtocol.ts`)

**功能**：
- 数据包编码/解码
- 命令发送和响应处理
- 设备信息管理

**主要方法**：
```typescript
class ABMateProtocol {
  // 连接设备
  async connect(): Promise<void>
  
  // 设置 EQ
  async setEQ(config: ABMateEQConfig): Promise<void>
  
  // 设置 ANC 模式
  async setANCMode(mode: ABMateANCMode): Promise<void>
  
  // 设置音量
  async setVolume(volume: number): Promise<void>
  
  // 设置工作模式
  async setDeviceMode(mode: ABMateDeviceMode): Promise<void>
  
  // 查找设备
  async findDevice(side: 'left' | 'right' | 'both'): Promise<void>
  
  // 事件监听
  on<K extends keyof ABMateEvents>(event: K, callback: ABMateEvents[K]): void
}
```

### 3. React 组件

#### DeviceConnection
- 显示连接状态
- 连接/断开按钮
- 错误提示

#### DeviceInfo
- 电池电量显示
- 音量控制
- 游戏模式切换
- 设备查找
- 设备详情

#### ANCControl
- ANC 模式切换（关闭/降噪/透传）
- 降噪等级调节（1-4）
- 透传等级调节（1-3）

#### EQControl
- 预设 EQ 模式选择
- 10 段均衡器调节
- 自定义 EQ 保存

---

## 📡 AB-Mate 协议详解

### 数据包格式

```
┌────────────────────────────────────────────────┐
│         AB-Mate 数据包结构                      │
├────────────────┬──────────────┬────────────────┤
│  Header (5B)   │  Command(1B) │   Payload      │
├────────────────┼──────────────┼────────────────┤
│ TAG(2B)=0xab23 │              │                │
│ + Type(1B)     │   Command    │  命令参数      │
│ + Seq(1B)      │     ID       │                │
│ + Len(1B)      │              │                │
└────────────────┴──────────────┴────────────────┘
```

### 主要命令

| 命令 ID | 名称 | 功能 |
|---------|------|------|
| 0x20 | EQ_SET | 设置 EQ 模式和增益 |
| 0x25 | MODE_SET | 切换游戏/普通模式 |
| 0x26 | IN_EAR_SET | 开关入耳检测 |
| 0x27 | DEVICE_INFO_GET | 查询设备信息 |
| 0x2c | ANC_SET | 设置 ANC 模式 |
| 0x2d | VOL_SET | 设置音量 |
| 0x2e | ANC_LEVEL_SET | 设置降噪等级 |
| 0x2f | TP_LEVEL_SET | 设置透传等级 |
| 0x30 | V3D_AUDIO_SET | 开关 3D 音效 |
| 0x31 | DEVICE_FIND | 查找设备 |

### GATT 服务

```
Service UUID: 0xFF01 (AB-Mate 主服务)
├─ 0xFF18 - Notify 特征（设备→APP 数据）
├─ 0xFF16 - Write 特征（APP→设备命令，需响应）
└─ 0xFF17 - Write Command 特征（APP→设备命令，快速无响应）
```

---

## 🎨 UI 设计

### 色彩方案

- **主色调**：紫色渐变 `#667eea → #764ba2`
- **成功色**：绿色 `#10b981`
- **警告色**：橙色 `#f59e0b`
- **错误色**：红色 `#ef4444`
- **背景**：灰白渐变 `#f5f7fa → #c3cfe2`

### 响应式布局

- 最大宽度：800px
- 移动端适配：自动切换单列布局

---

## 🔧 开发指南

### 添加新功能

1. **在 `types/ab-mate.ts` 添加类型定义**
```typescript
export interface MyNewFeature {
  // 定义数据结构
}
```

2. **在 `ABMateProtocol.ts` 添加方法**
```typescript
async setMyFeature(config: MyNewFeature): Promise<void> {
  const payload = // 编码数据
  const packet = this.buildPacket(ABMateCommand.MY_CMD, ...);
  await this.sendPacket(packet);
}
```

3. **创建 React 组件**
```tsx
export const MyFeatureControl: React.FC = ({ ... }) => {
  // UI 实现
};
```

4. **在 `App.tsx` 集成**
```tsx
<MyFeatureControl ... />
```

### 调试技巧

1. **查看 BLE 数据流**
```typescript
// 在 BLEService.ts 中
console.log('发送:', Array.from(data));
console.log('接收:', Array.from(new Uint8Array(value.buffer)));
```

2. **监控协议解析**
```typescript
// 在 ABMateProtocol.ts 中
console.log('数据包:', packet);
console.log('设备信息:', this.deviceInfo);
```

3. **Chrome DevTools**
- 使用 Electron 内置开发者工具
- 查看 Console 日志
- Network 面板（查看资源加载）

---

## 📝 注意事项

### Web Bluetooth 限制

1. **仅支持 HTTPS 或 localhost**
   - Electron 应用已自动满足

2. **需要用户交互触发**
   - 必须通过按钮点击等用户操作触发扫描

3. **浏览器支持**
   - ✅ Chrome/Edge（推荐）
   - ❌ Firefox/Safari（不支持）

### Electron 配置

必须在 `BrowserWindow` 中启用：
```typescript
webPreferences: {
  enableBlinkFeatures: 'WebBluetooth',
}
```

### 安全性

- 所有 BLE 通信都在本地完成
- 无需网络连接
- 数据不会上传到云端

---

## 🐛 常见问题

### 1. 扫描不到设备

**原因**：
- 设备未开启蓝牙
- 设备未进入配对模式
- 电脑蓝牙未开启

**解决**：
```typescript
// 检查浏览器支持
if (!BLEService.isSupported()) {
  alert('不支持 Web Bluetooth');
}
```

### 2. 连接后无响应

**原因**：
- GATT 服务未正确订阅
- UUID 不匹配

**解决**：
```typescript
// 检查 UUID 格式
const uuid = this.uuidTo128Bit(0xff01);
console.log('Service UUID:', uuid);
```

### 3. 命令发送失败

**原因**：
- 数据包格式错误
- 特征不支持写入

**解决**：
```typescript
// 验证数据包
console.log('Packet:', Array.from(packet));
// 确认特征属性
console.log('Char properties:', char.properties);
```

---

## 📦 打包发布

### Windows

```bash
npm run build
# 生成: dist/win-unpacked/ 和 .exe 安装包
```

### macOS

```bash
npm run build
# 生成: dist/mac/ 和 .dmg 镜像
```

### Linux

```bash
npm run build
# 生成: dist/linux-unpacked/ 和 .AppImage
```

---

## 🎯 性能优化建议

1. **减少不必要的重渲染**
```tsx
const memoizedComponent = React.memo(MyComponent);
```

2. **使用防抖处理高频事件**
```typescript
const debouncedSetVolume = debounce(setVolume, 300);
```

3. **批量发送命令**
```typescript
// 避免频繁发送，合并多个命令
await Promise.all([setEQ(...), setANC(...)]);
```

---

## 📚 相关文档

- [AB_MATE_APP_DETAILED.md](d:\earphone\app\AB_MATE_APP_DETAILED.md) - AB-Mate 完整协议
- [AB_MATE_APP_DEVELOPMENT.md](d:\earphone\app\AB_MATE_APP_DEVELOPMENT.md) - APP 开发指南
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

**开发者**: TWS Control Team  
**版本**: 1.0.0  
**更新日期**: 2026-01-22
