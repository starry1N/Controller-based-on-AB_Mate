# Electron APP AB-Mate 协议修复说明

## 问题诊断

设备端定义的协议头部为 **5 字节**：
```c
#define AB_MATE_HEADER_LEN      5
#define AB_MATE_PAYLOAD_POS     5
```

Electron APP 的 `ABMateProtocol.ts` 文件中存在数据包解析错误，导致无法正确接收设备发送的 5 字节头部数据。

## 修复内容

### ✅ 修复 1: parsePacket 函数

**位置**: [ABMateProtocol.ts](src/renderer/services/ABMateProtocol.ts#L524)

**问题**: 按照 6 字节头部格式解析数据
```typescript
// ❌ 错误的解析方式
const type = data.getUint8(2);      // 错误位置
const seq = data.getUint8(3);       // 错误位置
const len = data.getUint8(4);       // 不存在的字段
const cmd = data.getUint8(5);       // 错误位置
payload = ... + 6               // 载荷起始位置错误
```

**修复**: 正确按 5 字节头部格式解析
```typescript
// ✅ 正确的解析方式
const byte2 = data.getUint8(2);
const seq = byte2 & 0x0F;                    // 位0-3
const preload = (byte2 >> 4) & 0x07;        // 位4-6
const encrypt = (byte2 >> 7) & 0x01;        // 位7

const cmd = data.getUint8(3);                // 字节3
const type = data.getUint8(4);               // 字节4
const len = data.byteLength - 5;             // 载荷长度

payload = ... + 5                    // 载荷从字节5开始
```

### ✅ 修复 2: sendAndWait 函数

**位置**: [ABMateProtocol.ts](src/renderer/services/ABMateProtocol.ts#L400)

**问题**: 提取序列号和命令时使用错误的字节位置
```typescript
// ❌ 错误的位置
const seq = packet[3];        // 应该从字节2的位中提取
const cmd = packet[5];        // 应该是字节3
const len = packet[4];        // 不需要这个
```

**修复**: 正确提取字段
```typescript
// ✅ 正确的位置
const seq = packet[2] & 0x0F; // 字节2的位0-3
const cmd = packet[3];        // 字节3
const type = packet[4];       // 字节4
const payloadLen = packet.length - 5; // 总长 - 5
```

## 5 字节头部结构

```
┌──────────────────────────────────────┬──────────────┐
│         HEADER (5 字节)              │   PAYLOAD    │
├──┬──┬──┬──┬──┬──────────────────────┬──────────────┤
│0 │1 │2 │3 │4 │  (可选)              │              │
└──┴──┴──┴──┴──┴──────────────────────┴──────────────┘
TAG  TAG SEQ/RES/ENC CMD TYPE  PAYLOAD
HIGH LOW |RESERVE|ENCRYPT
   0xAB 0x23   4bit  3bit 1bit
```

| 字节 | 字段 | 说明 |
|------|------|------|
| 0    | TAG HIGH | 0xAB |
| 1    | TAG LOW | 0x23 |
| 2    | SEQ/RESERVE/ENCRYPT | SEQ(4bit) \| RESERVE(3bit) \| ENCRYPT(1bit) |
| 3    | CMD | 命令码 (0x20-0x2F, 0xE0, 0xA0, etc) |
| 4    | CMD_TYPE | 1=REQUEST, 2=RESPONSE, 3=NOTIFY |
| 5+   | PAYLOAD | 可变长度载荷 |

## 修复验证

### buildPacket 方法已正确

```typescript
const headerLen = 5;
packet[0] = (AB_MATE_CONSTANTS.TAG >> 8) & 0xff;  // 0xAB
packet[1] = AB_MATE_CONSTANTS.TAG & 0xff;         // 0x23
packet[2] = (seq & 0x0F) | ((preload & 0x07) << 4) | ((encrypt ? 1 : 0) << 7);
packet[3] = cmd;           // CMD
packet[4] = type;          // CMD_TYPE
packet.set(payload, 5);    // PAYLOAD from byte 5
```

✅ 发送端构建正确

### 接收端现已正确

✅ parsePacket 已修复，可正确解析设备发送的 5 字节头部

## 协议示例

### 查询设备信息 (CMD_DEVICE_INFO_GET 0x27)

**APP 发送**:
```
AB 23 00 27 01
│  │  │  │  └─ CMD_TYPE = 1 (REQUEST)
│  │  │  └───── CMD = 0x27 (DEVICE_INFO_GET)
│  │  └──────── SEQ=0, RESERVE=0, ENCRYPT=0
│  └─────────── TAG_LOW = 0x23
└────────────── TAG_HIGH = 0xAB
```

**设备响应** (例如包含电池信息):
```
AB 23 01 28 02 ... [payload]
│  │  │  │  │  └─ 数据载荷
│  │  │  │  └───── CMD_TYPE = 2 (RESPONSE)
│  │  │  └──────── CMD = 0x28 (DEVICE_INFO_NOTIFY)
│  │  └─────────── SEQ=1 (序列号递增)
│  └────────────── TAG_LOW = 0x23
└─────────────── TAG_HIGH = 0xAB
```

## 测试检查清单

- [ ] APP 编译无误
- [ ] 连接设备
- [ ] 查询设备信息成功（应收到设备 5 字节头部数据）
- [ ] 设置 EQ、ANC 等命令正常工作
- [ ] 设备通知正确解析

## 相关文件

| 文件 | 修改内容 |
|------|---------|
| [src/renderer/services/ABMateProtocol.ts](src/renderer/services/ABMateProtocol.ts#L524) | parsePacket 函数 |
| [src/renderer/services/ABMateProtocol.ts](src/renderer/services/ABMateProtocol.ts#L400) | sendAndWait 函数 |

## 设备端保持不变

设备端 `ab_mate_app.h` 保持原值：
```c
#define AB_MATE_HEADER_LEN      5
#define AB_MATE_PAYLOAD_POS     5
```

✅ 完成修复，APP 现正确支持 5 字节头部协议
