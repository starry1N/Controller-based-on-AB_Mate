- [x] 创建项目目录结构
- [x] 创建 package.json 配置
- [x] 设置 Electron 主进程
- [x] 设置 React 应用程序
- [x] 配置 TypeScript 和构建工具（Vite）
- [x] 创建启动脚本和文档

## 项目已成功创建

项目框架已完成设置，包括：
- ✅ Electron 主进程和预加载脚本
- ✅ React 应用和样式
- ✅ TypeScript 支持
- ✅ Vite 构建配置（已替换 Webpack）
- ✅ NPM 启动脚本

## 项目配置

- **构建工具**：Vite 5
- **开发端口**：5173
- **主进程配置**：vite.config.main.ts
- **渲染进程配置**：vite.config.ts

## 下一步

1. 安装依赖：`npm install`
2. 启动开发模式：`npm run dev`
3. 修改应用代码并开始开发
# AB-Mate 协议开发者完整指南

## 目录
1. [协议概述](#1-协议概述)
2. [数据包格式](#2-数据包格式)
3. [命令类型详解](#3-命令类型详解)
4. [响应数据包分析](#4-响应数据包分析)
5. [TLV信息格式](#5-tlv信息格式)
6. [序列号管理机制](#6-序列号管理机制)
7. [常见命令示例](#7-常见命令示例)
8. [错误处理](#8-错误处理)
9. [开发注意事项](#9-开发注意事项)

---

## 1. 协议概述

### 1.1 基本信息
- **协议名称**: AB-Mate 蓝牙耳机通信协议
- **传输方式**: BLE GATT / SPP
- **服务UUID**: 0xFF01
- **特征UUID**:
  - Notify: 0xFF18 (设备→APP)
  - Write: 0xFF16 (APP→设备，带响应)
  - Write Cmd: 0xFF17 (APP→设备，无响应，推荐)

### 1.2 协议特点
- ✅ 固定7字节头部结构（包含TAG）
- ✅ 支持多帧传输（大数据分片）
- ✅ TLV格式信息交换
- ✅ 序列号验证机制
- ✅ BLE GATT链路层CRC（无需应用层CRC）
- ⚠️ 设备端响应前会自动递增序列号

---

## 2. 数据包格式

### 2.1 完整数据包结构

```
完整数据包 (BLE GATT传输时不包含TAG)
┌────────────────────────────────────────────┬──────────────┐
│         HEADER (7 字节，含TAG)              │   PAYLOAD    │
├──┬──┬──┬──┬──┬──┬──┬──────────────────────┬──┴──────────────┤
│0 │1 │2 │3 │4 │5 │6 │ (可选 0-250 字节)    │                 │
└──┴──┴──┴──┴──┴──┴──┴──────────────────────┴─────────────────┘
TAG  TAG SEQ/ CMD TYPE FRAME/ PAYLOAD_LEN    PAYLOAD
HIGH LOW RES/          SEQ/
         ENC           TOTAL

注意：BLE GATT Notify返回时可能不包含TAG字节，需要APP端自动补全！
```

### 2.2 头部字段详解

| 字节 | 字段 | 位宽 | 值范围 | 说明 |
|------|------|------|--------|------|
| 0 | TAG_HIGH | 8bit | 0xAB | 固定标识 |
| 1 | TAG_LOW | 8bit | 0x23 | 固定标识 |
| 2 | SEQ | 4bit | 0-15 | 序列号（循环） |
| 2 | RESERVE | 3bit | 0-7 | 预留（未使用） |
| 2 | ENCRYPT | 1bit | 0-1 | 加密标志 |
| 3 | CMD | 8bit | 0x20-0xFF | 命令码 |
| 4 | CMD_TYPE | 8bit | 1-3 | 命令类型 |
| 5 | FRAME_SEQ | 4bit | 0-15 | 当前帧序号 |
| 5 | FRAME_TOTAL | 4bit | 0-15 | 总帧数（0=单帧） |
| 6 | PAYLOAD_LEN | 8bit | 0-250 | 载荷长度 |
| 7+ | PAYLOAD | 可变 | - | 命令参数/数据 |

### 2.3 字节2位布局（SEQ/RESERVE/ENCRYPT）

```
字节2 (从低位到高位):
┌─────────┬─────────────┬─────┐
│ SEQ(4) │ RESERVE(3)  │ENC(1)│
│ bit 0-3│  bit 4-6    │bit 7 │
└─────────┴─────────────┴─────┘

示例1: SEQ=5, RESERVE=0, ENCRYPT=0
       二进制: 0000 0101 → 0x05

示例2: SEQ=11, RESERVE=0, ENCRYPT=0
       二进制: 0000 1011 → 0x0B
```

### 2.4 字节5位布局（FRAME_SEQ/FRAME_TOTAL）

```
字节5 (从低位到高位):
┌──────────────┬─────────────┐
│FRAME_SEQ(4) │FRAME_TOTAL(4)│
│  bit 0-3    │   bit 4-7    │
└──────────────┴─────────────┘

示例1: 单帧命令
       FRAME_SEQ=0, FRAME_TOTAL=0
       二进制: 0000 0000 → 0x00

示例2: 第2帧/共5帧
       FRAME_SEQ=1, FRAME_TOTAL=4
       二进制: 0100 0001 → 0x41
```

---

## 3. 命令类型详解

### 3.1 CMD_TYPE 枚举

| 类型 | 值 | 名称 | 方向 | 说明 |
|------|-----|------|------|------|
| REQUEST | 1 | 请求 | APP→设备 | 需要设备响应 |
| RESPONSE | 2 | 响应 | 设备→APP | 对REQUEST的回复 |
| NOTIFY | 3 | 通知 | 设备→APP | 主动推送，无需请求 |

### 3.2 命令码表 (CMD)

#### 标准命令 (0x20-0x2F)

| 命令 | 码值 | 方向 | 载荷 | 功能 |
|------|------|------|------|------|
| **CMD_EQ_SET** | **0x20** | APP→Dev | 11B | 设置EQ（模式+10段增益） |
| **CMD_MUSIC_SET** | **0x21** | APP→Dev | TLV | 音乐控制（播放/暂停/上下曲/音量） |
| **CMD_KEY_SET** | **0x22** | APP→Dev | TLV | 按键功能映射设置 |
| **CMD_POWER_OFF_SET** | **0x23** | APP→Dev | 1B | 关机延迟时间 |
| **CMD_DEVICE_RESET** | **0x24** | APP→Dev | 0B | 设备重置 |
| **CMD_MODE_SET** | **0x25** | APP→Dev | 1B | 工作模式（普通/游戏） |
| **CMD_IN_EAR_SET** | **0x26** | APP→Dev | 1B | 入耳检测开关 |
| **CMD_DEVICE_INFO_GET** | **0x27** | APP→Dev | TLV | 查询设备信息（TLV格式） |
| **CMD_DEVICE_INFO_NOTIFY** | **0x28** | Dev→APP | TLV | 设备信息通知（响应0x27或主动推送） |
| **CMD_LANGUAGE_SET** | **0x29** | APP→Dev | 1B | 语言设置 |
| **CMD_DEVICE_FIND** | **0x2A** | APP→Dev | 1B | 设备查找（蜂鸣） |
| **CMD_AUTO_ANSWER_SET** | **0x2B** | APP→Dev | 1B | 自动接听 |
| **CMD_ANC_SET** | **0x2C** | APP→Dev | 1B | ANC模式（关闭/降噪/透传） |
| **CMD_BT_NAME_SET** | **0x2D** | APP→Dev | 可变 | 设置蓝牙名称 |
| **CMD_LED_SET** | **0x2E** | APP→Dev | 1B | LED开关 |
| **CMD_BT_LINK_INFO_CLEAR** | **0x2F** | APP→Dev | 0B | 清除配对信息 |

#### 扩展命令 (0x30-0x39)

| 命令 | 码值 | 功能 |
|------|------|------|
| **CMD_ANC_LEVEL_SET** | **0x30** | 设置ANC等级 (0-4) |
| **CMD_TP_LEVEL_SET** | **0x31** | 设置透传等级 (0-3) |
| **CMD_V3D_AUDIO_SET** | **0x32** | 3D音效开关 |
| **CMD_MULT_DEV_SET** | **0x33** | 多设备管理 |
| **CMD_CALL_CTRL** | **0x39** | 通话控制 |
| **CMD_MIC_CTRL** | **0x3A** | 麦克风控制 |
| **CMD_RECORD_CTRL** | **0x3B** | 录音控制 |
| **CMD_RECORD_DATA_NOTIFY** | **0x3C** | 录音数据上报 |

#### OTA命令 (0xA0-0xA3)

| 命令 | 码值 | 功能 |
|------|------|------|
| **CMD_OTA_REQ** | **0xA0** | OTA升级请求 |
| **CMD_OTA_DATA_START** | **0xA1** | OTA数据开始 |
| **CMD_OTA_DATA_CONTINUE** | **0xA2** | OTA数据继续 |
| **CMD_OTA_STA** | **0xA3** | OTA状态上报 |

#### 自定义命令 (0xE0)

| 命令 | 码值 | 功能 |
|------|------|------|
| **CMD_CUSTOM** | **0xE0** | 自定义命令（提示音、拨号等） |

---

## 4. 响应数据包分析

### 4.1 通用响应格式

#### 简单响应（成功/失败）

```
格式: [HEADER(7B)] + [RESULT(1B)]

示例（成功）:
AB 23 05 2C 02 00 01 00
│  │  │  │  │  │  │  └─ RESULT = 0x00 (成功)
│  │  │  │  │  │  └───── PAYLOAD_LEN = 1
│  │  │  │  │  └──────── FRAME = 0/0
│  │  │  │  └─────────── CMD_TYPE = 0x02 (RESPONSE)
│  │  │  └──────────────── CMD = 0x2C (ANC_SET)
│  │  └─────────────────── SEQ = 5 (设备端响应前递增)
│  └────────────────────── TAG = 0xAB23
└───────────────────────── (BLE可能缺失TAG)

实际BLE返回: 05 2C 02 00 01 00 (缺少TAG)
```

#### 结果码定义

```c
typedef enum {
    AB_MATE_SUCCESS = 0,  // 成功
    AB_MATE_FAIL    = 1,  // 失败
} ab_mate_result_t;
```

### 4.2 TLV格式响应（设备信息）

#### CMD_DEVICE_INFO_NOTIFY (0x28) 响应格式

```
格式: [HEADER(7B)] + [TLV项1] + [TLV项2] + ...

TLV项格式: [TYPE(1B)] [LENGTH(1B)] [VALUE(LENGTH B)]

示例（电池+版本+ANC+MTU）:
00 28 02 00 20 01 03 00 3B 00 02 04 01 00 00 00 04 0C 0A ...
│  │  │  │  │  │  │  └─────────────────────────┬─ TLV载荷
│  │  │  │  │  │  └────────────────────────────┘
│  │  │  │  │  └───────── FRAME_TOTAL = 0
│  │  │  │  └──────────── FRAME_SEQ = 0
│  │  │  └─────────────── CMD_TYPE = 0x02 (RESPONSE)
│  │  └────────────────── CMD = 0x28 (DEVICE_INFO_NOTIFY)
│  └───────────────────── SEQ = 0
└──────────────────────── (缺失TAG，需补全为AB 23)

TLV解析:
01 03 00 3B 00     → INFO_POWER: L=3, R=59%, Box=0%
02 04 01 00 00 00  → INFO_VERSION: 1.0.0.0
0C 0A ...          → INFO_ANC: Mode=10
FF 01 FF           → INFO_MTU: 255 bytes
FE 02 01 00        → INFO_DEV_CAP: 0x0001
```

### 4.3 TLV格式响应（按键设置）

```
CMD_KEY_SET (0x22) 响应:

请求: [TYPE(1B)] [LEN(1B)] [VALUE]
      01 01 03  → 设置左耳短按=播放暂停(0x03)

响应: [TYPE(1B)] [LEN(1B)] [RESULT(1B)]
      01 01 00  → 左耳短按设置成功

完整示例:
AB 23 06 22 02 00 06 01 01 00 02 01 00
                     │  │  └─ 成功
                     │  └──── LENGTH=1
                     └─────── TYPE=KEY_LEFT_SHORT
```

### 4.4 音乐控制响应

```
CMD_MUSIC_SET (0x21) 响应:

请求: 01 01 64  → 设置音量=100
响应: 01 01 00  → 设置成功

请求: 02 00     → 播放
响应: 02 01 00  → 播放成功
```

---

## 5. TLV信息格式

### 5.1 信息类型码表

| 类型码 | 名称 | 长度 | 数据格式 | 说明 |
|--------|------|------|----------|------|
| **0x01** | INFO_POWER | 3B | [L][R][Box] | 电池电量（0-100%） |
| **0x02** | INFO_VERSION | 4B | [V1][V2][V3][V4] | 固件版本号 |
| **0x03** | INFO_BT_NAME | 可变 | 字符串 | 蓝牙名称（UTF-8） |
| **0x04** | INFO_EQ | 11B | [Mode][Gain×10] | EQ模式+10段增益 |
| **0x05** | INFO_KEY | 8B | [L_S][R_S][L_D][R_D][L_T][R_T][L_L][R_L] | 按键映射 |
| **0x06** | INFO_VOL | 1B | [Vol] | 音量（0-100） |
| **0x07** | INFO_PLAY_STA | 1B | [Sta] | 播放状态（0=暂停，1=播放） |
| **0x08** | INFO_LATENCY_MODE | 1B | [Mode] | 延迟模式（0=普通，1=游戏） |
| **0x09** | INFO_IN_EAR_EN | 1B | [En] | 入耳检测（0=关，1=开） |
| **0x0A** | INFO_LANGUAGE | 1B | [Lang] | 语言（0=中文，1=英文） |
| **0x0C** | INFO_ANC | 1B | [Mode] | ANC模式（0=关，1=降噪，2=透传） |
| **0x0F** | INFO_LED | 1B | [En] | LED开关 |
| **0x11** | INFO_TWS_STA | 1B | [Sta] | TWS连接状态 |
| **0x12** | INFO_TWS_CHANNEL | 1B | [Ch] | TWS声道（0=左，1=右） |
| **0x18** | INFO_V3D_AUDIO | 1B | [En] | 3D音效 |
| **0x23** | INFO_BT_STA | 1-12B | [Sta][Num...] | 蓝牙状态+电话号码 |
| **0xFE** | INFO_DEV_CAP | 2B | [Cap_L][Cap_H] | 设备能力位图 |
| **0xFF** | INFO_MTU | 1B | [MTU] | MTU大小 |

### 5.2 扩展信息类型

| 类型码 | 名称 | 说明 |
|--------|------|------|
| **0x40** | INFO_CRC | 固件CRC32校验 |
| **0x41** | INFO_ANC_CUR_LEVEL | 当前ANC等级 |
| **0x42** | INFO_TRANSPARENCY_CUR_LEVEL | 当前透传等级 |
| **0x43** | INFO_ANC_TOTAL_LEVEL | ANC总等级数 |
| **0x44** | INFO_TRANSPARENCY_TOTAL_LEVEL | 透传总等级数 |
| **0x50** | INFO_EQ_ALL_MODE | 所有EQ模式数据 |
| **0x60** | INFO_PID | 产品ID |
| **0x70** | INFO_MULT_DEV | 多设备状态 |
| **0x71** | INFO_PAIRED_INFO | 已配对设备信息 |

### 5.3 设备能力位图 (INFO_DEV_CAP)

```
u16 capacity 位定义:
BIT(0) - TWS功能支持
BIT(1) - 音乐播放支持（保留）
BIT(2) - 多设备连接支持
BIT(3) - ANC功能支持
BIT(4-15) - 保留

示例: 0x0009 = 0b0000000000001001
      → 支持TWS + ANC
```

### 5.4 查询设备信息示例

#### 查询单个信息

```typescript
// 查询MTU
const payload = new Uint8Array([0xFF, 0x00]);
//                              │     └─ LENGTH = 0（查询）
//                              └──────── TYPE = INFO_MTU

发送: AB 23 00 27 01 00 02 FF 00
响应: AB 23 01 28 02 00 03 FF 01 FF
                           │  │  └─ MTU = 255
                           │  └──── LENGTH = 1
                           └─────── TYPE = INFO_MTU
```

#### 查询多个信息

```typescript
// 查询电池+版本+EQ+ANC+MTU+能力
const payload = new Uint8Array([
    0x01, 0x00,  // INFO_POWER
    0x02, 0x00,  // INFO_VERSION
    0x04, 0x00,  // INFO_EQ
    0x0C, 0x00,  // INFO_ANC
    0xFF, 0x00,  // INFO_MTU
    0xFE, 0x00,  // INFO_DEV_CAP
]);

发送: AB 23 00 27 01 00 0C 01 00 02 00 04 00 0C 00 FF 00 FE 00
响应: AB 23 01 28 02 00 [len] [TLV1] [TLV2] [TLV3] ...
```

---

## 6. 序列号管理机制

### 6.1 序列号规则

| 项目 | 说明 |
|------|------|
| **范围** | 0-15（4位，循环使用） |
| **递增** | 每发送一个命令递增1 |
| **回环** | 15 → 0 |
| **初始值** | 连接时从0开始 |
| **验证** | 设备检验序列号连续性 |

### 6.2 序列号自动递增机制

**⚠️ 关键发现：设备端在发送数据前会自动递增序列号！**

```c
// 设备端发送逻辑 (ab_mate_app.c)
void ab_mate_data_send(u8* buf, u16 len)
{
    // ...
    do {
        ab_mate_cmd_send.cmd_head.seq++;  // ← 自动递增！
        ab_mate_cmd_send.cmd_head.payload_len = send_len;
        memcpy(p_data, &ab_mate_cmd_send.cmd_head, AB_MATE_HEADER_LEN);
        ab_mate_data_send_do(p_data, send_len + AB_MATE_HEADER_LEN);
        // ...
    } while(total_frame--);
}
```

### 6.3 序列号匹配策略

```typescript
// APP端响应匹配逻辑
if (packet.type === ABMateCommandType.RESPONSE) {
    // 策略1: 精确匹配
    if (this.pendingRequests.has(packet.seq)) {
        matchedSeq = packet.seq;
    } 
    // 策略2: 设备端递增后的匹配
    else {
        const prevSeq = (packet.seq - 1) & 0x0F;
        if (this.pendingRequests.has(prevSeq)) {
            matchedSeq = prevSeq;  // ✓ 匹配成功
        }
    }
}
```

### 6.4 序列号错误处理

```c
// 设备端序列号验证 (ab_mate_app.c)
if (ab_mate_cmd_recv.next_header_seq != cmd_head->seq) {
    printf("--->header_seq_err:%d,%d\n",
        ab_mate_cmd_recv.next_header_seq, cmd_head->seq);
    
    // 同步序列号
    ab_mate_cmd_recv.next_header_seq = cmd_head->seq;
    
    // OTA模式下通知错误
    #if AB_MATE_OTA_EN
        if (ab_mate_ota_is_start()) {
            ab_mate_ota_seq_err_notify();
            ab_mate_cmd_recv.next_header_seq++;
            return false;  // ❌ 拒绝数据包
        }
    #endif
}

ab_mate_cmd_recv.next_header_seq++;
```

### 6.5 序列号流程图

```
APP端发送流程:
┌──────────────┐
│ seq = 0      │  初始化
├──────────────┤
│ seq = 1      │  发送第1个命令
│ 期望响应: 1  │
├──────────────┤
│ 收到响应: 2  │  ← 设备端seq++后发送
│ 匹配: (2-1)=1│  ✓ 成功
├──────────────┤
│ seq = 2      │  发送第2个命令
│ 期望响应: 2  │
├──────────────┤
│ 收到响应: 3  │  ← 设备端seq++后发送
│ 匹配: (3-1)=2│  ✓ 成功
└──────────────┘
```

---

## 7. 常见命令示例

### 7.1 设置ANC模式

#### 请求

```
命令: CMD_ANC_SET (0x2C)
载荷: [MODE]
      0 = APP_ANC_STOP (关闭)
      1 = APP_ANC_START (降噪)
      2 = APP_ANC_TRANSPARENCY (透传)

示例（启用降噪）:
AB 23 04 2C 01 00 01 01
│  │  │  │  │  │  │  └─ MODE = 1 (降噪)
│  │  │  │  │  │  └───── PAYLOAD_LEN = 1
│  │  │  │  │  └──────── FRAME = 0/0
│  │  │  │  └─────────── CMD_TYPE = 1 (REQUEST)
│  │  │  └──────────────── CMD = 0x2C
│  │  └─────────────────── SEQ = 4
│  └────────────────────── TAG = 0xAB23
└───────────────────────── TAG HIGH
```

#### 响应

```
响应成功:
AB 23 05 2C 02 00 01 00
│  │  │  │  │  │  │  └─ RESULT = 0 (成功)
│  │  │  │  │  │  └───── PAYLOAD_LEN = 1
│  │  │  │  │  └──────── FRAME = 0/0
│  │  │  │  └─────────── CMD_TYPE = 2 (RESPONSE)
│  │  │  └──────────────── CMD = 0x2C
│  │  └─────────────────── SEQ = 5 (递增)
│  └────────────────────── TAG = 0xAB23
└───────────────────────── (BLE可能缺失)

实际BLE返回: 05 2C 02 00 01 00
```

### 7.2 设置EQ

#### 请求

```
命令: CMD_EQ_SET (0x20)
载荷: [BAND_CNT][MODE][GAIN0...GAIN9]

EQ模式:
0 = Normal
1 = Pop
2 = Rock
3 = Jazz
4 = Classic
5 = Country
≥0x20 = Custom (自定义)

增益值: 0-24 (12 = 0dB, <12 衰减, >12 增强)

示例（设置为Pop模式）:
AB 23 01 20 01 00 0B 0A 00 0F 0D 0C 0A 08 0A 0C 0D 0E
│  │  │  │  │  │  │  │  └──────────────────────┬─ 10段增益
│  │  │  │  │  │  │  └─────────────────────────┘
│  │  │  │  │  │  └────────────────────────────── MODE = 0 (Normal)
│  │  │  │  │  └───────────────────────────────── BAND_CNT = 10
│  │  │  │  └──────────────────────────────────── PAYLOAD_LEN = 11
│  │  │  └─────────────────────────────────────── CMD = 0x20
│  │  └────────────────────────────────────────── SEQ = 1
│  └───────────────────────────────────────────── TAG
└──────────────────────────────────────────────── TAG
```

#### 响应

```
AB 23 02 20 02 00 01 00
                     └─ RESULT = 0 (成功)
```

### 7.3 音乐控制

#### 音量控制

```
请求:
AB 23 02 21 01 00 03 01 01 64
                     │  │  └─ VOLUME = 100
                     │  └──── LENGTH = 1
                     └─────── TYPE = A2DP_CTL_VOICE (1)

响应:
AB 23 03 21 02 00 03 01 01 00
                     │  │  └─ RESULT = 0
                     │  └──── LENGTH = 1
                     └─────── TYPE = A2DP_CTL_VOICE
```

#### 播放/暂停

```
播放:
AB 23 03 21 01 00 02 02 00
                     │  └─ LENGTH = 0
                     └──── TYPE = A2DP_CTL_PLAY (2)

暂停:
AB 23 04 21 01 00 02 03 00
                     └──── TYPE = A2DP_CTL_PAUSE (3)

上一首:
AB 23 05 21 01 00 02 04 00
                     └──── TYPE = A2DP_CTL_PREV (4)

下一首:
AB 23 06 21 01 00 02 05 00
                     └──── TYPE = A2DP_CTL_NEXT (5)
```

### 7.4 设备查找

```
查找左耳:
AB 23 04 2A 01 00 01 02
                     └─ SIDE = DEVICE_FIND_START_L (2)

查找右耳:
AB 23 05 2A 01 00 01 04
                     └─ SIDE = DEVICE_FIND_START_R (4)

停止查找:
AB 23 06 2A 01 00 01 00
                     └─ SIDE = DEVICE_FIND_STOP (0)
```

### 7.5 设置LED

```
开启LED:
AB 23 07 2E 01 00 01 01
                     └─ ENABLE = 1

关闭LED:
AB 23 08 2E 01 00 01 00
                     └─ ENABLE = 0
```

---

## 8. 错误处理

### 8.1 常见错误码

| 错误 | 现象 | 原因 | 解决方案 |
|------|------|------|----------|
| **header_seq_err** | 序列号不连续 | APP序列号与设备不同步 | 重置连接，seq归零 |
| **payload_len error** | 载荷长度不匹配 | 数据包截断或长度错误 | 检查PAYLOAD_LEN字段 |
| **frame_seq_err** | 分帧序号错误 | 多帧传输时帧丢失 | 重传整个命令 |
| **TAG missing** | BLE返回缺少TAG | GATT层处理差异 | APP端自动补全TAG |
| **no response** | 设备无响应 | 空载荷或序列号错误 | 检查TLV格式和seq |

### 8.2 错误处理流程

```typescript
// APP端错误处理
try {
    const packet = this.parsePacket(data);
    
    // 验证TAG
    if (packet.tag !== 0xAB23) {
        throw new Error('Invalid TAG');
    }
    
    // 验证长度
    if (packet.len !== packet.payload.length) {
        throw new Error('Payload length mismatch');
    }
    
    // 处理数据
    this.handlePacket(packet);
    
} catch (error) {
    console.error('Parse error:', error);
    this.callbacks.onError?.(error);
    
    // 可选：请求重传
    // this.requestRetransmit(seq);
}
```

### 8.3 超时处理

```typescript
// 请求超时控制
private async sendAndWait(packet: Uint8Array, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            this.pendingRequests.delete(seq);
            reject(new Error(`Request timeout: seq=${seq}`));
        }, timeoutMs);
        
        this.pendingRequests.set(seq, { resolve, reject, timeout });
        this.bleService.writeWithoutResponse(packet);
    });
}
```

---

## 9. 开发注意事项

### 9.1 关键注意点

#### ⚠️ TAG字节问题
- BLE GATT Notify返回的数据**可能不包含TAG字节**
- APP必须检测并自动补全 `AB 23`
- 检测方法：如果字节0-1不是0xAB23，且字节1看起来像命令码，则补全TAG

#### ⚠️ 序列号递增
- 设备在**发送任何数据前**都会执行 `seq++`
- APP匹配响应时需要考虑：`matchSeq = (receivedSeq - 1) & 0x0F`
- 连接断开后序列号必须重置为0

#### ⚠️ TLV格式查询
- `CMD_DEVICE_INFO_GET` (0x27) 必须使用TLV格式指定查询类型
- 空载荷会导致设备返回空响应
- 正确格式：`[TYPE1][LEN1] [TYPE2][LEN2] ...`，LEN通常为0

#### ⚠️ 多帧传输
- 当载荷超过MTU时自动分片
- FRAME_SEQ从0开始递增
- FRAME_TOTAL = 总帧数 - 1（0表示单帧）
- 每帧的seq都会递增

### 9.2 最佳实践

#### ✅ 连接初始化

```typescript
async connect() {
    await this.bleService.scanAndConnect();
    
    // 重置序列号
    this.seq = 0;
    console.log('序列号已重置');
    
    // 等待稳定后查询设备信息
    setTimeout(() => {
        this.queryDeviceInfo([0x01, 0x02, 0x04, 0x0C, 0xFF, 0xFE]);
    }, 500);
}
```

#### ✅ 发送数据包

```typescript
private buildPacket(cmd, type, payload) {
    const seq = this.getNextSeq();
    const packet = new Uint8Array(7 + payload.length);
    
    // 构建头部
    packet[0] = 0xAB;
    packet[1] = 0x23;
    packet[2] = seq & 0x0F;
    packet[3] = cmd;
    packet[4] = type;
    packet[5] = 0x00;  // 单帧
    packet[6] = payload.length;
    
    // 载荷
    if (payload.length > 0) {
        packet.set(payload, 7);
    }
    
    return packet;
}
```

#### ✅ 解析响应

```typescript
private parsePacket(data: DataView) {
    // 自动补全TAG
    if ((data.getUint8(0) << 8 | data.getUint8(1)) !== 0xAB23) {
        const newBuffer = new ArrayBuffer(data.byteLength + 2);
        const newView = new Uint8Array(newBuffer);
        newView[0] = 0xAB;
        newView[1] = 0x23;
        newView.set(new Uint8Array(data.buffer), 2);
        data = new DataView(newBuffer);
    }
    
    return {
        tag: (data.getUint8(0) << 8) | data.getUint8(1),
        seq: data.getUint8(2) & 0x0F,
        cmd: data.getUint8(3),
        type: data.getUint8(4),
        payloadLen: data.getUint8(6),
        payload: new Uint8Array(data.buffer, 7)
    };
}
```

#### ✅ TLV信息解析

```typescript
private parseDeviceInfo(payload: Uint8Array) {
    let offset = 0;
    
    while (offset < payload.length) {
        // 边界检查
        if (offset + 1 >= payload.length) break;
        
        const type = payload[offset++];
        const len = payload[offset++];
        
        // 越界检查
        if (offset + len > payload.length) {
            console.error(`TLV overflow: type=0x${type.toString(16)}`);
            break;
        }
        
        const data = payload.slice(offset, offset + len);
        offset += len;
        
        // 解析数据
        switch (type) {
            case 0x01: // 电池
                this.deviceInfo.leftBattery = data[0];
                this.deviceInfo.rightBattery = data[1];
                this.deviceInfo.caseBattery = data[2];
                break;
            // ... 其他类型
        }
    }
}
```

### 9.3 调试技巧

#### 日志输出

```typescript
// 发送日志
console.log(`📤 [SEQ:${seq}] CMD:0x${cmd.toString(16)} ` +
           `TYPE:${type} PAYLOAD:${payload.length}B`);
console.log(`   数据: ${Array.from(packet).map(b => 
           b.toString(16).padStart(2, '0')).join(' ')}`);

// 接收日志
console.log(`📥 [SEQ:${seq}] CMD:0x${cmd.toString(16)} ` +
           `TYPE:${type} PAYLOAD:${len}B`);
console.log(`   原始: ${rawHex}`);
```

#### 抓包分析

```
使用 nRF Connect 或 Wireshark 抓取BLE数据包:
1. 查看实际传输的字节序列
2. 确认是否缺少TAG
3. 验证序列号递增逻辑
4. 检查MTU协商结果
```

---

## 10. 快速参考

### 10.1 常量定义

```typescript
const AB_MATE_CONSTANTS = {
    TAG: 0xAB23,
    HEADER_LEN: 7,
    PAYLOAD_POS: 7,
    MAX_PAYLOAD: 250,
    MAX_SEQ: 15,
    
    SERVICE_UUID: 0xFF01,
    CHAR_NOTIFY_UUID: 0xFF18,
    CHAR_WRITE_UUID: 0xFF16,
    CHAR_WRITE_CMD_UUID: 0xFF17,
};
```

### 10.2 命令类型

```typescript
enum ABMateCommandType {
    REQUEST = 1,
    RESPONSE = 2,
    NOTIFY = 3,
}
```

### 10.3 结果码

```typescript
enum ABMateResult {
    SUCCESS = 0,
    FAIL = 1,
}
```

### 10.4 ANC模式

```typescript
enum ABMateANCMode {
    STOP = 0,          // 关闭
    START = 1,         // 降噪
    TRANSPARENCY = 2,  // 透传
}
```

### 10.5 工作模式

```typescript
enum ABMateDeviceMode {
    NORMAL = 0,  // 普通模式
    GAME = 1,    // 游戏模式（低延迟）
}
```

---

## 11. 总结

### 核心要点

1. **7字节头部结构**：TAG(2B) + SEQ/RES/ENC(1B) + CMD(1B) + TYPE(1B) + FRAME(1B) + LEN(1B)
2. **BLE可能缺TAG**：Notify返回时可能不包含TAG，需APP自动补全
3. **序列号自动递增**：设备发送前执行seq++，APP需要匹配(seq-1)
4. **TLV信息格式**：查询和响应都使用[TYPE][LENGTH][VALUE]格式
5. **多帧传输支持**：超过MTU的数据自动分片
6. **无需应用层CRC**：BLE GATT链路层已包含CRC

### 开发检查清单

- [ ] 实现TAG自动补全逻辑
- [ ] 实现序列号递增匹配策略
- [ ] TLV格式正确构建和解析
- [ ] 边界检查和越界保护
- [ ] 连接时序列号重置
- [ ] 超时和错误处理
- [ ] 详细日志输出
- [ ] 响应匹配机制
- [ ] 多帧传输支持（可选）

---

**文档版本**: 1.0  
**更新日期**: 2026-01-24  
**作者**: AB-Mate 协议分析团队
