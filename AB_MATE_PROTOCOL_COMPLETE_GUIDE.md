# AB-Mate 协议完整指南

## 一、协议概述

AB-Mate 是耳机与 APP 之间的蓝牙通讯协议，基于 BLE GATT 和 SPP 连接，用于设备配置、状态查询和事件通知。

### 支持的连接方式
- **BLE GATT** - 主要连接方式（推荐）
- **SPP** - 备用串行连接（需要 CRC16 校验）

---

## 二、数据包格式

### 2.1 完整的 7 字节头部结构

```
┌──────────────────────────────────────────────┬──────────────┐
│         HEADER (7 字节)                       │   PAYLOAD    │
├──┬──┬──┬──┬──┬──┬──┬──────────────────────┬──┴──────────────┤
│0 │1 │2 │3 │4 │5 │6 │ (可选)              │                 │
└──┴──┴──┴──┴──┴──┴──┴──────────────────────┴─────────────────┘
TAG  TAG SEQ/RES/ENC CMD TYPE FRAME/FRAME  PAYLOAD_LEN   PAYLOAD
HIGH LOW              TYPE    SEQ/TOTAL
```

### 2.2 字段详解

| 字节 | 字段名 | 位宽 | 说明 | 范围/编码 |
|------|--------|------|------|----------|
| **0** | TAG HIGH | 8bit | AB-Mate 标识高字节 | 0xAB (固定) |
| **1** | TAG LOW | 8bit | AB-Mate 标识低字节 | 0x23 (固定) |
| **2** | SEQ | 4bit | 消息序列号 | 0-15（循环使用） |
| **2** | RESERVE | 3bit | 预留字段 | 0（当前未使用） |
| **2** | ENCRYPT | 1bit | 加密标志 | 0=不加密, 1=加密 |
| **3** | CMD | 8bit | 命令码 | 0x20-0x2F（见命令表） |
| **4** | CMD_TYPE | 8bit | 命令类型 | 1=REQUEST, 2=RESPONSE, 3=NOTIFY |
| **5** | FRAME_SEQ | 4bit | 分帧序列号 | 0-15（多帧命令使用） |
| **5** | FRAME_TOTAL | 4bit | 总帧数 | 0-15（0=单帧） |
| **6** | PAYLOAD_LEN | 8bit | 载荷长度 | 0-250 字节 |
| **7+** | PAYLOAD | 可变 | 命令参数 | 取决于命令 |

### 2.3 字节 2 的位布局（SEQ/RESERVE/ENCRYPT）

```
字节2布局 (从低到高):
┌─────────┬─────────────┬─────┐
│ SEQ(4) │ RESERVE(3)  │ENC(1)│
│ 0-3    │   4-6       │  7   │
└─────────┴─────────────┴─────┘

例1：seq=5, reserve=0, encrypt=0
     二进制: 0000 0101 (十进制: 0x05)
     
例2：seq=11, reserve=0, encrypt=0  
     二进制: 0000 1011 (十进制: 0x0B)
```

### 2.4 字节 5 的位布局（FRAME_SEQ/FRAME_TOTAL）

```
字节5布局 (从低到高):
┌──────────────┬─────────────┐
│FRAME_SEQ(4) │FRAME_TOTAL(4)│
│   0-3       │    4-7       │
└──────────────┴─────────────┘

例1：frame_seq=0, frame_total=0（单帧）
     二进制: 0000 0000 (十进制: 0x00)
     
例2：frame_seq=1, frame_total=5（第2帧，共5帧）
     二进制: 0101 0001 (十进制: 0x51)
```

---

## 三、命令码表

### 3.1 主要命令 (0x20-0x2F)

| 命令 | 码值 | 方向 | 载荷大小 | 说明 |
|-----|------|------|---------|------|
| EQ_SET | 0x20 | APP→Dev | 11B | 设置 EQ（模式+10段增益） |
| MUSIC_SET | 0x21 | APP→Dev | 可变 | 音乐控制 (播放/暂停/上一首/下一首) |
| KEY_SET | 0x22 | APP→Dev | 可变 | 按键功能映射 |
| POWER_OFF_SET | 0x23 | APP→Dev | 1B | 关机延迟时间 |
| DEVICE_RESET | 0x24 | APP→Dev | 1B | 重置设备 |
| MODE_SET | 0x25 | APP→Dev | 1B | 工作模式（普通/游戏） |
| IN_EAR_SET | 0x26 | APP→Dev | 1B | 入耳检测开关 |
| **DEVICE_INFO_GET** | **0x27** | **APP→Dev** | **0B** | **查询设备信息** |
| DEVICE_INFO_NOTIFY | 0x28 | Dev→APP | 可变 | 设备信息通知（电池/版本/模式等） |
| LANGUAGE_SET | 0x29 | APP→Dev | 1B | 语言设置（中/英） |
| DEVICE_FIND | 0x2A | APP→Dev | 1B | 设备查找（蜂鸣） |
| AUTO_ANSWER_SET | 0x2B | APP→Dev | 1B | 自动接听设置 |
| ANC_SET | 0x2C | APP→Dev | 1B | ANC 模式开关 |
| BT_NAME_SET | 0x2D | APP→Dev | 可变 | 设置蓝牙名称 |
| LED_SET | 0x2E | APP→Dev | 1B | LED 开关 |
| BT_LINK_INFO_CLEAR | 0x2F | APP→Dev | 0B | 清除配对信息 |

### 3.2 扩展命令

| 命令 | 码值 | 说明 |
|-----|------|------|
| ANC_LEVEL_SET | 0x30 | 设置 ANC 等级 |
| TP_LEVEL_SET | 0x31 | 设置透传等级 |
| V3D_AUDIO_SET | 0x32 | 设置 3D 音效 |
| MULT_DEV_SET | 0x33 | 多设备管理 |
| CALL_CTRL | 0x39 | 通话控制 |
| MIC_CTRL | 0x3A | 麦克风控制 |
| RECORD_CTRL | 0x3B | 录音控制 |
| RECORD_DATA_NOTIFY | 0x3C | 录音数据上报 |
| OTA_REQ | 0xA0 | OTA 升级请求 |
| OTA_DATA_START | 0xA1 | OTA 数据开始 |
| OTA_DATA_CONTINUE | 0xA2 | OTA 数据继续 |
| OTA_STA | 0xA3 | OTA 状态上报 |
| CUSTOM | 0xE0 | 自定义命令 |

---

## 四、常用命令详解

### 4.1 查询设备信息 (0x27)

**请求**:
```
APP → Device
AB 23 00 27 01 00 00
 │  │  │  │  │  │  └─ PAYLOAD_LEN = 0
 │  │  │  │  │  └───── FRAME_SEQ=0, FRAME_TOTAL=0
 │  │  │  │  └──────── CMD_TYPE = REQUEST
 │  │  │  └─────────── CMD = 0x27 (DEVICE_INFO_GET)
 │  │  └──────────────── SEQ=0, RESERVE=0, ENCRYPT=0
 │  └─────────────────── TAG_LOW = 0x23
 └────────────────────── TAG_HIGH = 0xAB
```

**响应** (例如包含电池信息):
```
Device → APP
AB 23 01 28 02 00 [len] [INFO_TYPE] [len] [data...]
 │  │  │  │  │  │  │    └─ 设备信息数据
 │  │  │  │  │  │  └─────── 第一个信息的载荷长度
 │  │  │  │  │  └──────────── PAYLOAD_LEN (总载荷长度)
 │  │  │  │  └─────────────── CMD_TYPE = RESPONSE
 │  │  │  └────────────────── CMD = 0x28 (DEVICE_INFO_NOTIFY)
 │  │  └───────────────────── SEQ=1 (序列号递增)
 │  └──────────────────────── TAG_LOW = 0x23
 └─────────────────────────── TAG_HIGH = 0xAB
```

**设备信息类型** (TLV 格式):

| 类型 | 码值 | 载荷 | 说明 |
|------|------|------|------|
| INFO_POWER | 0x01 | 3B | 电池 [LEFT, RIGHT, BOX] |
| INFO_VERSION | 0x02 | 4B | 版本号 |
| INFO_BT_NAME | 0x03 | 可变 | 蓝牙名称 |
| INFO_EQ | 0x04 | 11B | EQ 模式+10段增益 |
| INFO_KEY | 0x05 | 6B | 按键映射 |
| INFO_VOL | 0x06 | 1B | 音量 (0-100) |
| INFO_PLAY_STA | 0x07 | 1B | 播放状态 |
| INFO_LATENCY_MODE | 0x08 | 1B | 延迟模式 |
| INFO_IN_EAR_EN | 0x09 | 1B | 入耳检测 |
| INFO_ANC | 0x0C | 1B | ANC 模式 |
| INFO_TWS_STA | 0x11 | 1B | TWS 状态 |
| INFO_LED | 0x0F | 1B | LED 开关 |
| INFO_V3D_AUDIO | 0x18 | 1B | 3D 音效 |
| INFO_BT_STA | 0x23 | 1B | 蓝牙连接状态 |
| INFO_MTU | 0xFF | 1B | MTU 大小 |

### 4.2 设置 EQ (0x20)

**请求**:
```
APP → Device
AB 23 01 20 01 00 0B [mode] [gain0] [gain1] ... [gain9]
                └─ 11字节载荷
                
载荷格式:
- mode: EQ模式 (0=Normal, 1=Pop, 2=Rock, 3=Jazz, 4=Classic, 5=Country, 0x20+=Custom)
- gain[0-9]: 10段增益值 (0-24, 其中12表示0dB)
```

**响应**:
```
Device → APP
AB 23 02 20 02 00 01 [status]
                    └─ 0=SUCCESS, 其他=FAIL
```

### 4.3 设置 ANC (0x2C)

**请求**:
```
AB 23 02 2C 01 00 01 [mode]
                    └─ 0=STOP, 1=START, 2=TRANSPARENCY
```

**响应**:
```
AB 23 03 2C 02 00 01 [status]
```

### 4.4 设备查找 (0x2A)

**请求**:
```
AB 23 04 2A 01 00 01 [side]
                    └─ 1=Left, 2=Right, 3=Both
```

---

## 五、序列号管理

### 5.1 序列号 (SEQ) 规则

- **范围**: 0-15（4 位，循环使用）
- **递增**: 每发送一个新命令，序列号加 1
- **回环**: 发到 15 后回到 0
- **同步**: 连接初始化时都从 0 开始
- **校验**: 设备检验序列号连续性，不连续则丢弃数据包

### 5.2 序列号错误处理

```c
if(ab_mate_cmd_recv.next_header_seq != cmd_head->seq){
    printf("--->header_seq_err:%d,%d\n",
        ab_mate_cmd_recv.next_header_seq, cmd_head->seq);
    ab_mate_cmd_recv.next_header_seq = cmd_head->seq;
    // 在 OTA 模式下会通知错误
    return false;
}
```

---

## 六、多帧传输

### 6.1 分帧机制

当载荷超过 MTU 大小时，需要分成多帧发送：

| 字段 | 范围 | 说明 |
|------|------|------|
| FRAME_SEQ | 0-15 | 当前帧编号 |
| FRAME_TOTAL | 0-15 | 总帧数（0=单帧，N=N帧） |

### 6.2 多帧例子

假设数据长度 300 字节，MTU=128，需要 3 帧：

**第 1 帧**:
```
AB 23 00 CMD 01 00 len [payload_0-126]
              ▲    ▲
         FRAME_SEQ=0, FRAME_TOTAL=3
```

**第 2 帧**:
```
AB 23 01 CMD 01 10 len [payload_127-253]
              ▲    ▲
         FRAME_SEQ=1, FRAME_TOTAL=3
```

**第 3 帧**:
```
AB 23 02 CMD 01 20 len [payload_254-299]
              ▲    ▲
         FRAME_SEQ=2, FRAME_TOTAL=3
```

---

## 七、校验机制

### 7.1 BLE GATT 模式（推荐）

- ✅ 链路层自动 CRC 校验
- ✅ 无需应用层额外校验
- ✅ 可靠的连接

### 7.2 SPP 模式

需要应用层 CRC16 校验：

```c
uint16_t app_crc16(const uint8_t *buffer, uint32_t size) {
    uint16_t crc = 0xffff;
    while (size--) {
        crc = (crc >> 8) | (crc << 8);
        crc ^= *buffer++;
        crc ^= ((unsigned char) crc) >> 4;
        crc ^= crc << 12;
        crc ^= (crc & 0xFF) << 5;
    }
    return crc;
}
```

CRC 追加在数据包末尾（2 字节，低字节在前）

---

## 八、命令类型

### 8.1 CMD_TYPE 含义

| 码值 | 类型 | 方向 | 说明 |
|------|------|------|------|
| 1 | REQUEST | APP→Device | 请求命令（需要响应或执行） |
| 2 | RESPONSE | Device→APP | 对请求的响应 |
| 3 | NOTIFY | Device→APP | 主动通知（不需要请求） |

### 8.2 通讯流程

```
REQUEST 流程:
APP 发送 REQUEST → Device 处理 → Device 发送 RESPONSE

NOTIFY 流程:
Device 发送 NOTIFY → APP 接收（无需响应）
```

---

## 九、连接管理

### 9.1 连接初始化

```
1. APP 连接 BLE 设备
2. APP 发送查询命令 (CMD_DEVICE_INFO_GET)
3. 设备返回信息
4. 序列号同步 (都从当前值开始)
5. 准备就绪
```

### 9.2 断开处理

```
- BLE 断开: 清空待处理请求，序列号重置为 0
- SPP 断开: 同上
- OTA 中断开: 结束 OTA，恢复正常模式
```

---

## 十、常见错误诊断

### 10.1 "payload_len != (len - AB_MATE_HEADER_LEN)"

**原因**:
- 发送的数据包总长度与声明的载荷长度不符
- 数据包被截断或扩展

**解决**:
```
接收: AB 23 00 27 01 00 00 (7字节)
计算: payload_len=0, len=7, AB_MATE_HEADER_LEN=7
检验: 0 == (7-7) ? YES ✓
```

### 10.2 "header_seq_err"

**原因**:
- 序列号不连续
- APP 和设备的序列号不同步

**解决**:
- 重新连接，重置序列号为 0
- 确保序列号每次递增 1
- 检查是否有数据包丢失

### 10.3 命令无响应

**排查**:
1. 检查连接是否正常
2. 检查序列号是否正确
3. 检查命令码是否有效
4. 查看设备侧日志

---

## 十一、APP 实现清单

### 11.1 初始化

- [ ] 配置 BLE 服务 UUID
  - Primary Service: 0xFF01
  - Notify Char: 0xFF18
  - Write Char: 0xFF16
  - Write Without Response: 0xFF17

### 11.2 发送命令

- [ ] 构建 7 字节头 + 载荷
- [ ] 提取序列号（字节2低4位）
- [ ] 检查数据包长度（最大257字节）
- [ ] 通过 `writeWithoutResponse` 发送
- [ ] 记录待处理请求（用于响应匹配）

### 11.3 接收响应

- [ ] 监听 Notify 特征
- [ ] 解析 7 字节头
- [ ] 提取序列号进行匹配
- [ ] 处理 TLV 格式的设备信息
- [ ] 超时控制（建议 5000ms）

### 11.4 错误处理

- [ ] 连接超时
- [ ] 命令超时
- [ ] 序列号同步错误
- [ ] 数据包验证失败

---

## 十二、设备端核心数据结构

```c
// 7字节头部 (不包括TAG的2字节)
typedef struct __attribute__((packed)){
    u32 seq     : 4;       // 字节2, 位0-3
    u32 reserve : 3;       // 字节2, 位4-6
    u32 encrypt : 1;       // 字节2, 位7
    u8 cmd;                // 字节3
    u8 cmd_type;           // 字节4
    u32 frame_seq : 4;     // 字节5, 位0-3
    u32 frame_total : 4;   // 字节5, 位4-7
    u8 payload_len;        // 字节6
}ab_mate_cmd_head_t;       // 总大小: 5字节

// 接收数据包格式
[TAG(2B)] + [ab_mate_cmd_head_t(5B)] + [PAYLOAD(可变)]
= 7字节头 + 载荷
```

---

## 十三、快速参考

### 常用常量
```
TAG = 0xAB23
HEADER_LEN = 7 (包括TAG)
PAYLOAD_POS = 7 (TAG后的偏移)
MAX_PAYLOAD = 250
MAX_FRAME_COUNT = 15
SEQ_MASK = 0x0F (4位)
```

### 最小数据包
```
AB 23 00 27 01 00 00
= TAG + SEQ=0 + CMD=0x27 + TYPE=REQUEST + FRAME=0/0 + PAYLOAD_LEN=0
```

### 完整数据包
```
AB 23 01 20 01 00 0B 00 0C 0C 0C 0C 0C 0C 0C 0C 0C 0C 0C
= TAG + SEQ=1 + CMD=0x20 (EQ_SET) + TYPE=REQUEST + FRAME=0/0 + PAYLOAD_LEN=11 + [EQ数据]
```

---

## 总结

✅ **核心要点**:
1. 固定 7 字节头部 (TAG 2B + 数据 5B)
2. 序列号范围 0-15，每次递增
3. 支持多帧传输（超过 MTU 时）
4. BLE GATT 无需应用层 CRC，SPP 需要
5. 命令按 CMD_TYPE 分为 REQUEST/RESPONSE/NOTIFY

✅ **实现要求**:
1. 序列号管理和同步
2. 数据包长度校验
3. TLV 格式设备信息解析
4. 超时和错误处理
5. 连接状态管理
