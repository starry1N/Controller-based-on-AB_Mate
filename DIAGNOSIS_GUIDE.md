# AB-Mate 设备未响应诊断指南

## 📋 快速诊断检查列表

### 第一步：确认 BLE 连接已建立

打开 F12 Console，应该看到：
```
✅ 发现设备: [设备名称]
✅ 正在连接 GATT 服务器...
✅ 从 GATT 获取设备名称: [名称]
✅ 正在获取 AB-Mate 服务...
✅ 正在获取特征...
✅ BLE 连接成功！
```

❌ **如果看不到这些，问题在于连接阶段失败**

---

## 🔧 常见原因与修复

### 原因 1: Notify 特征未正确订阅 ⚠️

**症状**：
- 可以发送命令（Console 显示发送成功）
- 但收不到任何响应数据

**检查方法**：

在 [BLEService.ts](src/renderer/services/BLEService.ts) 的 `connect()` 中添加诊断代码：

```typescript
// 订阅通知
await this.notifyChar.startNotifications();
console.log('✅ Notify 订阅成功');

this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const value = target.value!;
  console.log('📥 收到 Notify 数据:', new Uint8Array(value.buffer).toString());
  this.onDataCallback?.(value);
});
```

**修复**：确保收到 "✅ Notify 订阅成功" 日志

---

### 原因 2: 使用了错误的写特征 ⚠️

**症状**：
- 发送时没有错误
- 但设备没有执行命令

**检查方法**：

AB-Mate 有两个写特征：
| 特征 | UUID | 用途 | 特点 |
|------|------|------|------|
| **Write** | 0xFF16 | 带响应的写 | 慢但可靠 |
| **Write Command** | 0xFF17 | 无响应的写 | 快速 |

当前代码使用 `0xFF17` (Write Command)，这是正确的。

**验证**：
```typescript
// 确认使用了正确的特征
console.log('Write Char UUID:', this.writeChar.uuid);      // 应该包含 ff16
console.log('WriteCmd Char UUID:', this.writeCmdChar.uuid);  // 应该包含 ff17
```

---

### 原因 3: 数据包格式错误 ⚠️

**发送的数据包应该是这样的**：

```
ab 23 | 01 | 00 | 02 | 27 00
└─┬─┘ └─┬─┘ └─┬─┘ └─┬─┘ └──┬──┘
  │     │     │     │      └─ Payload (参数)
  │     │     │     └───────── Length (1字节命令 + 1字节参数 = 2)
  │     │     └───────────── Seq (序列号 0-255)
  │     └─────────────────── Type (1=REQUEST)
  └───────────────────────── TAG (0xAB23)
```

**验证发送的数据包**：

在 Console 中查看 "📤 发送命令" 的输出：
```
📤 发送命令: [TAG:AB23] [Type:1] [Seq:0] [Len:2] [Cmd:0x27]
   完整数据: ab 23 01 00 02 27 00
```

❌ **错误示例**：
```
ab 23 01 01 02 27 00  ❌ 序列号不对 (应该递增)
ab 23 02 00 02 27 00  ❌ Type错了 (应该是01)
ab 23 01 00 03 27     ❌ Length错了 (缺少参数)
```

---

### 原因 4: 设备未启用 AB-Mate 框架 ⚠️

**设备固件必须启用**：

```c
#define AB_MATE_APP_EN = 1  ✅ 必须为 1
```

**检查方法**：
1. 连接设备后，点击"播放声音"
2. 设备应该发出蜂鸣声
3. 如果没有响应，说明设备固件未启用 AB-Mate

---

### 原因 5: 设备处于特殊模式 ⚠️

**可能的原因**：
- 设备处于 DFU/OTA 升级模式
- 设备正在重启
- TWS 尚未连接（对于 TWS 耳机）
- 设备电量过低

**解决方案**：
```
1. 长按设备按键 10 秒进行复位
2. 重新启动应用
3. 重新连接设备
```

---

## 🧪 逐步测试

### 测试 1: 验证基本连接

```javascript
// 在 Console 运行
console.log(BLEService.isSupported());  // 应该返回 true
```

### 测试 2: 检查特征属性

```javascript
// 发送一个简单的查询命令
// 应该在 Console 看到:

// 发送端：
📤 发送命令: [TAG:AB23] [Type:1] [Seq:X] [Len:2] [Cmd:0x27]

// 接收端：
📥 收到数据包: RESPONSE seq=X
✅ 收到序列号 X 的响应
✓ 命令 0x27 执行成功
🔋 电池: L=100% R=100% Case=50%
```

### 测试 3: 设备日志

如果能访问设备串口日志，应该看到：

```c
[AB-Mate] GATT Write received: TAG=0xAB23 Type=1 Seq=0 Len=2
[AB-Mate] Command 0x27 (DEVICE_INFO_GET) received
[AB-Mate] Sending device info...
[AB-Mate] Response sent successfully
```

---

## 📊 完整诊断流程

```
1. 打开 F12 Console
   ↓
2. 点击"连接设备"
   ↓
   看到 "BLE 连接成功！"？
   ├─ 是 → 继续
   └─ 否 → 检查设备是否支持 BLE
   ↓
3. 点击"播放声音"（发送 DEVICE_FIND 命令）
   ↓
   Console 中看到"命令超时"？
   ├─ 是 → 设备未响应（见下方修复）
   └─ 否 → 继续
   ↓
4. 调整 EQ/ANC/音量
   ↓
   看到数据更新？
   ├─ 是 → 连接正常 ✅
   └─ 否 → 检查设备配置
```

---

## 🛠️ 修复步骤

### 步骤 1: 启用详细日志

修改 [ABMateProtocol.ts](src/renderer/services/ABMateProtocol.ts) 的 `handleReceivedData()` 方法：

```typescript
private handleReceivedData(data: DataView): void {
  try {
    const packet = this.parsePacket(data);
    
    // 详细日志
    console.log('📥 收到原始数据 (' + data.byteLength + ' 字节):', 
      Array.from(new Uint8Array(data.buffer)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    );
    
    console.log('📋 解析结果:', {
      TAG: `0x${packet.tag.toString(16)}`,
      Type: packet.type === 2 ? 'RESPONSE' : packet.type === 3 ? 'NOTIFY' : 'UNKNOWN',
      Seq: packet.seq,
      Len: packet.len,
      Cmd: `0x${packet.cmd.toString(16).padStart(2, '0')}`,
      PayloadLen: packet.payload.length,
      Payload: Array.from(packet.payload).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
```

### 步骤 2: 验证数据包序列号

确保序列号正确循环：

```typescript
// 应该看到：
Seq: 0, 1, 2, 3, ..., 254, 255, 0, 1, 2, ...  ✅

// 错误情况：
Seq: 0, 0, 0, 0, ...  ❌ 或
Seq: 0, 1, 2, ..., 255, 256, 257, ...  ❌
```

### 步骤 3: 检查 GATT 连接状态

```typescript
// 在 App.tsx 中添加
const handleConnect = async () => {
  try {
    await bleServiceRef.current?.scanAndConnect();
    
    // 检查连接状态
    setTimeout(() => {
      const isConnected = bleServiceRef.current?.isConnected();
      console.log('🔗 GATT 连接状态:', isConnected ? '已连接' : '已断开');
      
      // 尝试主动查询
      if (isConnected) {
        console.log('📤 发送查询命令...');
        protocolRef.current?.queryDeviceInfo();
      }
    }, 1000);
  } catch (error) {
    console.error('连接失败:', error);
  }
};
```

---

## 🚨 如果问题仍未解决

请提供以下信息：

1. **Console 完整日志**：包括连接和发送命令的部分
2. **设备信息**：品牌、型号、固件版本
3. **浏览器**：Chrome/Edge 版本号
4. **设备端日志**：如果可获取

---

## 📌 关键要点总结

| 检查项 | 预期结果 | 故障指示 |
|-------|--------|--------|
| BLE 连接 | "BLE 连接成功！" | "连接失败" |
| Notify 订阅 | "✅ Notify 订阅成功" | 无此日志 |
| 数据发送 | "📤 发送命令: ..." | 立即超时错误 |
| 数据接收 | "📥 收到数据包: RESPONSE" | "命令超时" |
| 序列号匹配 | seq=X 递增 0-255 | seq 重复或超出范围 |
| 设备响应 | "✅ 收到序列号 X 的响应" | 无此日志 |

---

**测试建议**：
1. 先用官方 APP（如果有）连接同一设备，确认设备正常
2. 使用 Chrome DevTools 的蓝牙调试工具检查 GATT 特征
3. 在设备端启用日志输出，观察是否收到命令

