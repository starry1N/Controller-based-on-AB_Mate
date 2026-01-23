# AB-Mate 数据包格式分析

## 一、数据包格式概述

### 1.1 基本结构

AB-Mate 协议的数据包由**头部**和**载荷**组成：

```
┌─────────────────────────────────────┬──────────────┐
│         HEADER (7 字节)              │   PAYLOAD    │
├──┬──┬──┬──┬──┬──┬──┬──────────────┬──┴──────────────┤
│0 │1 │2 │3 │4 │5 │6 │ (可选)        │                 │
└──┴──┴──┴──┴──┴──┴──┴──────────────┴─────────────────┘
TAG   SEQ  CMD TYPE FRAME  LEN        PAYLOAD DATA
```

### 1.2 头部详细字段说明

| 字节位置 | 字段名 | 位宽 | 说明 | 范围/编码 |
|---------|--------|------|------|----------|
| **0** | TAG HIGH | 8bit | AB-Mate 标识高字节 | 0xAB (固定) |
| **1** | TAG LOW | 8bit | AB-Mate 标识低字节 | 0x23 (固定) |
| **2** | SEQ | 4bit | 消息序列号 | 0-15（循环使用，需要模16） |
| **2** | RESERVE | 3bit | 预留字段 | 0（当前未使用） |
| **2** | ENCRYPT | 1bit | 加密标志 | 0=不加密, 1=加密 |
| **3** | CMD | 8bit | 命令码 | 0x20-0x2F（见命令表） |
| **4** | CMD_TYPE | 8bit | 命令类型 | 1=REQUEST, 2=RESPONSE, 3=NOTIFY |
| **5** | FRAME_SEQ | 4bit | 分帧序列号 | 0-15（多帧命令使用） |
| **5** | FRAME_TOTAL | 4bit | 总帧数 | 0-15（0表示单帧） |
| **6** | PAYLOAD_LEN | 8bit | 载荷长度 | 0-250 字节 |
| **7+** | PAYLOAD | 可变 | 命令参数 | 取决于命令 |

### 1.3 字节2的位布局（SEQ/RESERVE/ENCRYPT）

```
字节2布局 (从低到高):
┌─────────┬─────────────┬─────┐
│ SEQ(4) │ RESERVE(3)  │ENC(1)│
│ 0-3    │   4-6       │  7   │
└─────────┴─────────────┴─────┘

示例：seq=5, reserve=0, encrypt=0
      二进制: 0000 0101 (十进制: 0x05)
      
示例：seq=11, reserve=0, encrypt=0  
      二进制: 0000 1011 (十进制: 0x0B)
```

### 1.4 字节5的位布局（FRAME_SEQ/FRAME_TOTAL）

```
字节5布局 (从低到高):
┌──────────────┬─────────────┐
│FRAME_SEQ(4) │FRAME_TOTAL(4)│
│   0-3       │    4-7       │
└──────────────┴─────────────┘

示例：frame_seq=0, frame_total=0（单帧命令）
      二进制: 0000 0000 (十进制: 0x00)
      
示例：frame_seq=1, frame_total=5（第2帧，共5帧）
      二进制: 0101 0001 (十进制: 0x51)
```

---

## 二、代码实现

### 2.1 设备端头部定义（ab_mate_app.h）

```c
#define AB_MATE_HEADER_LEN      5      // ⚠️ 注意：定义值与实际不符
#define AB_MATE_PAYLOAD_POS     5      // ⚠️ 注意：实际应为 7

typedef struct __attribute__((packed)){
    u32 seq     : 4;       // 字节 2，位 0-3
    u32 reserve : 3;       // 字节 2，位 4-6
    u32 encrypt : 1;       // 字节 2，位 7
    u8 cmd;                // 字节 3
    u8 cmd_type;           // 字节 4
    u32 frame_seq : 4;     // 字节 5，位 0-3
    u32 frame_total : 4;   // 字节 5，位 4-7
    u8 payload_len;        // 字节 6
}ab_mate_cmd_head_t;       // 总大小：7 字节
```

**⚠️ 问题**：
- `AB_MATE_HEADER_LEN` 定义为 5，但实际结构体大小为 7 字节
- `AB_MATE_PAYLOAD_POS` 定义为 5，但实际载荷应从字节 7 开始
- 这会导致 Electron APP 发送的数据包被错误解析

### 2.2 接收处理（ab_mate_app.c - 第 2031 行）

```c
bool ab_mate_receive_proc(u8 *data, u16 len, u8 con_type)
{
    ab_mate_cmd_head_t* cmd_head = (ab_mate_cmd_head_t*)data;
    u8 *p_data = &data[AB_MATE_PAYLOAD_POS];  // 从数据[5] 开始读载荷
    u8 payload_len = cmd_head->payload_len;
    
    // 验证载荷长度
    if(payload_len != (len - AB_MATE_HEADER_LEN)){
        printf("payload_len != (len - AB_MATE_HEADER_LEN) \n");
        return false;
    }
    
    // 验证序列号
    if(ab_mate_cmd_recv.next_header_seq != cmd_head->seq){
        printf("--->header_seq_err:%d,%d\n",
            ab_mate_cmd_recv.next_header_seq, cmd_head->seq);
        ab_mate_cmd_recv.next_header_seq = cmd_head->seq;
        return false;  // ❌ 序列号不匹配时返回错误
    }
    // ... 其他处理
}
```

### 2.3 Electron APP 发送实现（ABMateProtocol.ts）

```typescript
private buildPacket(cmd: ABMateCommand, type: ABMateCommandType, 
                    payload: Uint8Array): Uint8Array {
    const seq = this.getNextSeq();
    const headerLen = 7;
    const totalLen = headerLen + payload.length;
    const packet = new Uint8Array(totalLen);

    // 构建 7 字节头
    packet[0] = 0xAB;              // TAG HIGH
    packet[1] = 0x23;              // TAG LOW
    packet[2] = (seq & 0x0F) |     // SEQ + RESERVE + ENCRYPT
               ((0 & 0x07) << 4) |
               ((0 & 0x01) << 7);
    packet[3] = cmd;               // CMD
    packet[4] = type;              // CMD_TYPE
    packet[5] = (0 & 0x0F) |       // FRAME_SEQ + FRAME_TOTAL
               ((0 & 0x0F) << 4);
    packet[6] = payload.length;    // PAYLOAD_LEN
    
    // 从字节 7 开始放置载荷
    if (payload.length > 0) {
      packet.set(payload, 7);
    }
    return packet;
}
```

---

## 三、PRELOAD 参数

### 3.1 定义和用途

**PRELOAD** 在 AB-Mate 协议中的含义与位置：

- **位置**：字节 2 中的 RESERVE 字段（位 4-6）
- **当前状态**：未使用（值为 0）
- **预期用途**：预留给未来扩展功能，可能用于：
  - 流预加载指示
  - 缓冲优先级
  - 数据预处理标志

### 3.2 代码中的 PRELOAD 设置

在 Electron APP 中：

```typescript
// 字节2 的位布局中，RESERVE(3bit) 通常设为 0
packet[2] = (seq & 0x0F) |           // SEQ: 4bit
           ((0 & 0x07) << 4) |       // RESERVE: 3bit (现为 0)
           ((0 & 0x01) << 7);        // ENCRYPT: 1bit
```

在设备端：

```c
// 接收时，RESERVE 字段被忽略
u32 seq     : 4;       // 使用
u32 reserve : 3;       // 不使用（未来预留）
u32 encrypt : 1;       // 使用
```

### 3.3 预留字段扩展指南

如果未来需要使用 RESERVE 字段，修改方式：

```typescript
// 修改前
packet[2] = (seq & 0x0F) | ((0 & 0x07) << 4) | ((0 & 0x01) << 7);

// 修改后（如果需要 preload 支持）
packet[2] = (seq & 0x0F) | ((preloadFlag & 0x07) << 4) | ((encryptFlag & 0x01) << 7);
```

---

## 四、CRC/CSR 校验

### 4.1 校验方式

根据代码分析，**AB-Mate 协议本身不包含 CRC 校验**。校验机制由以下方式保证：

1. **BLE GATT 链路层校验** - 由 BLE 物理层自动处理
2. **序列号验证** - 通过 `seq` 字段检测乱序或丢包
3. **长度验证** - 通过 `payload_len` 与实际数据长度对比
4. **命令类型验证** - 验证 `cmd_type` 是否为有效值

### 4.2 校验代码实现

```c
// ab_mate_app.c - 第 2031 行
bool ab_mate_receive_proc(u8 *data, u16 len, u8 con_type)
{
    ab_mate_cmd_head_t* cmd_head = (ab_mate_cmd_head_t*)data;
    
    // ✅ 检查 1：命令类型有效性
    if(cmd_head->cmd_type > CMD_TYPE_NOTIFY){
        return false;  // cmd_type 必须是 1、2 或 3
    }

    // ✅ 检查 2：载荷长度验证
    if(payload_len != (len - AB_MATE_HEADER_LEN)){
        printf("payload_len != (len - AB_MATE_HEADER_LEN) \n");
        return false;
    }

    // ✅ 检查 3：序列号连续性
    if(ab_mate_cmd_recv.next_header_seq != cmd_head->seq){
        printf("--->header_seq_err:%d,%d\n",
            ab_mate_cmd_recv.next_header_seq, cmd_head->seq);
        // 同步序列号
        ab_mate_cmd_recv.next_header_seq = cmd_head->seq;
#if AB_MATE_OTA_EN
        if(ab_mate_ota_is_start()){
            ab_mate_ota_seq_err_notify();  // 通知 OTA 模块
            ab_mate_cmd_recv.next_header_seq++;
            return false;
        }
#endif
    }
    
    ab_mate_cmd_recv.next_header_seq++;
}
```

### 4.3 分帧校验（Frame Validation）

对于多帧命令：

```c
// 多帧检查
if(cmd_head->frame_total != 0){
    // 验证帧序列号
    if(ab_mate_cmd_recv.next_frame_seq != cmd_head->frame_seq){
        TRACE("--->frame_seq_err\n");
        ab_mate_cmd_recv.next_frame_seq = 0;
        return false;  // ❌ 帧序列号错误
    }
    ab_mate_cmd_recv.next_frame_seq++;
    
    // 累积载荷数据
    memcpy(&ab_mate_cmd_recv.payload[ab_mate_cmd_recv.recv_len], 
           p_data, payload_len);
    ab_mate_cmd_recv.recv_len += payload_len;
    
    // 最后一帧判断
    if(cmd_head->frame_seq == cmd_head->frame_total){
        // 所有帧接收完毕
        ab_mate_cmd_recv.total_len = ab_mate_cmd_recv.recv_len;
        ab_mate_cmd_recv.next_frame_seq = 0;
        ab_mate_cmd_recv.recv_len = 0;
        ab_mate_receive_proc_do();  // 处理完整命令
    }
}
```

### 4.4 SPP 连接中的 CRC（ab_mate_profile.c）

SPP（Serial Port Profile）连接时，有一个 APP_CRC16 函数用于计算应用层 CRC：

```c
uint16_t app_crc16(const uint8_t *buffer, uint32_t size) {
    uint16_t crc = 0xffff;   // 初始化为 0xFFFF
    if (NULL != buffer && size > 0) {
        while (size--) {
            crc = (crc >> 8) | (crc << 8);
            crc ^= *buffer++;
            crc ^= ((unsigned char) crc) >> 4;
            crc ^= crc << 12;
            crc ^= (crc & 0xFF) << 5;
        }
    }
    return crc;
}

void send_luo() {
    u8 command_data[] = {0xff, 0x01, 0x01, 0x00, 0x01};
    u8 command_len = sizeof(command_data);
    uint16_t crc = app_crc16(command_data, command_len);  // 计算 CRC16
    
    // 将 CRC 附加到数据末尾
    u8 packet_with_crc[command_len + 2];
    memcpy(packet_with_crc, command_data, command_len);
    packet_with_crc[command_len] = crc & 0xFF;           // CRC 低字节
    packet_with_crc[command_len + 1] = (crc >> 8) & 0xFF; // CRC 高字节
    
    // 通过 BLE 发送
    ab_mate_ble_send_packet(packet_with_crc, command_len + 2);
}
```

**⚠️ 注意**：这个 CRC 仅在使用 SPP 连接时需要，BLE GATT 连接不需要额外的 CRC。

---

## 五、常见问题排查

### 问题 1：Header Seq Error

**症状**：`header_seq_err:expected,actual`

**原因**：
- ❌ 序列号没有正确递增
- ❌ 数据包被重复接收
- ❌ 网络延迟导致乱序

**解决方案**：
```typescript
// 确保 seq 正确递增
private getNextSeq(): number {
    const currentSeq = this.seq & 0xFF;
    this.seq = (this.seq + 1) & 0xFF;
    return currentSeq;
}

// 连接时重置
async connect(): Promise<void> {
    await this.bleService.scanAndConnect();
    this.seq = 0;  // ✅ 重置为 0
}
```

### 问题 2：Payload Length Error

**症状**：`payload_len != (len - AB_MATE_HEADER_LEN)`

**原因**：
- ❌ 头部长度定义不正确（应为 7，不是 5）
- ❌ 载荷长度字段设置错误
- ❌ 数据包截断或扩展

**解决方案**：
```c
// 修正 ab_mate_app.h 中的定义
#define AB_MATE_HEADER_LEN      7  // ✅ 修正为 7
#define AB_MATE_PAYLOAD_POS     7  // ✅ 修正为 7
```

### 问题 3：Frame Seq Error

**症状**：`frame_seq_err` 在多帧传输时出现

**原因**：
- ❌ 帧编号不连续
- ❌ 帧丢失或重复
- ❌ 帧总数设置错误

**解决方案**：
```c
// 发送端
packet[5] = (frame_seq & 0x0F) | ((frame_total & 0x0F) << 4);

// 接收端校验
if(ab_mate_cmd_recv.next_frame_seq != cmd_head->frame_seq){
    // ❌ 帧序列不正确，需要重新同步或重传
    ab_mate_cmd_recv.next_frame_seq = 0;
    return false;
}
```

---

## 六、协议命令表

| 命令 | 码值 | 方向 | 载荷 | 说明 |
|-----|------|------|------|------|
| EQ_SET | 0x20 | APP→Dev | 11B | 设置 EQ（模式+10段增益） |
| MUSIC_SET | 0x21 | APP→Dev | 可变 | 音乐播放参数 |
| KEY_SET | 0x22 | APP→Dev | 可变 | 按键功能映射 |
| POWER_OFF_SET | 0x23 | APP→Dev | 1B | 关机延迟时间 |
| DEVICE_RESET | 0x24 | APP→Dev | 0B | 重置设备 |
| MODE_SET | 0x25 | APP→Dev | 1B | 工作模式（游戏/音乐） |
| IN_EAR_SET | 0x26 | APP→Dev | 1B | 入耳检测开关 |
| **DEVICE_INFO_GET** | **0x27** | **APP→Dev** | **0B** | **查询设备信息** |
| DEVICE_INFO_NOTIFY | 0x28 | Dev→APP | 可变 | 设备信息通知 |
| LANGUAGE_SET | 0x29 | APP→Dev | 1B | 语言设置 |

---

## 七、修复建议

### 建议 1：更正头部长度定义

**文件**：`d:\earphone\app\modules\bluetooth\app\ab_mate\ab_mate_app.h`

```c
// 修改前
#define AB_MATE_HEADER_LEN      5
#define AB_MATE_PAYLOAD_POS     5

// 修改后
#define AB_MATE_HEADER_LEN      7
#define AB_MATE_PAYLOAD_POS     7
```

### 建议 2：添加 DEBUG 日志

在接收函数中增加详细日志：

```c
void ab_mate_receive_proc(u8 *data, u16 len, u8 con_type)
{
    ab_mate_cmd_head_t* cmd_head = (ab_mate_cmd_head_t*)data;
    
    // 输出接收到的数据包信息
    printf("[AB_MATE RX] len=%d, seq=%d, cmd=0x%02X, type=%d, payload_len=%d\n",
        len, cmd_head->seq, cmd_head->cmd, cmd_head->cmd_type, 
        cmd_head->payload_len);
    
    // 输出原始数据用于调试
    printf("[AB_MATE DATA] ");
    for(int i = 0; i < len; i++) printf("%02X ", data[i]);
    printf("\n");
}
```

### 建议 3：完善 Electron 端校验

```typescript
// 在 ABMateProtocol.ts 中添加
private validatePacket(data: Uint8Array): boolean {
    if (data.length < 7) {
        console.error('❌ 数据包过短，长度:', data.length);
        return false;
    }
    
    // 检查 TAG
    if (data[0] !== 0xAB || data[1] !== 0x23) {
        console.error('❌ TAG 错误: 0x%02X%02X', data[0], data[1]);
        return false;
    }
    
    // 检查载荷长度
    const payloadLen = data[6];
    if (data.length !== 7 + payloadLen) {
        console.error('❌ 载荷长度不匹配');
        return false;
    }
    
    return true;
}
```

---

## 总结

| 项目 | 说明 | 状态 |
|------|------|------|
| **头部长度** | 7 字节（TAG+SEQ+CMD+TYPE+FRAME+LEN） | ✅ 正确 |
| **载荷位置** | 字节 7 开始 | ✅ 正确 |
| **预留字段** | RESERVE(3bit) 在字节2的位4-6 | ✅ 未使用 |
| **加密字段** | ENCRYPT(1bit) 在字节2的位7 | ✅ 现不加密 |
| **CRC 校验** | BLE GATT 无需应用层 CRC，SPP 需要 | ✅ 正确 |
| **序列号验证** | 通过 seq 字段验证包的连续性 | ✅ 正确 |
| **分帧支持** | 通过 frame_seq/frame_total 支持 | ✅ 正确 |

