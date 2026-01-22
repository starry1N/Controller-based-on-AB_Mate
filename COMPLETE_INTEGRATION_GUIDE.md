/**
 * AB-Mate 协议集成完整指南
 * 
 * 问题: 设备收到查询命令后发送响应，但 APP 端可能没有正确解析
 * 状态: 双向数据流已建立，需要完整的命令处理
 */

// ============================================================================
// 第一步: 了解现有的处理结构
// ============================================================================

/*
 * 从 ab_mate_app.c 中看到的函数:
 * 
 * 1. ab_mate_eq_set()              - 设置 EQ (命令 0x20)
 * 2. ab_mate_music_set()           - 音乐控制 (命令 0x21)
 * 3. ab_mate_device_info_notify()  - 通知设备信息 (发送数据到 APP)
 * 4. ab_mate_request_common_response() - 发送通用响应 (成功/失败)
 * 
 * 关键洞察:
 * - ab_mate_request_common_response() 发送格式: [TAG][TYPE][SEQ][LEN=1][RESULT]
 * - ab_mate_device_info_notify()    发送格式: [TAG][TYPE=NOTIFY][SEQ][LEN][TLV...]
 * 
 * 但是 APP 端的查询请求 (0x27) 需要特殊处理!
 */

// ============================================================================
// 第二步: 修复 APP 端响应解析
// ============================================================================

/*
 * 问题分析:
 * 
 * 设备发送: ab 23 02 06 02 27 00
 * APP 期望什么格式?
 * 
 * 现有的 handleResponse() 函数期望:
 * [TAG_H=0xAB] [TAG_L=0x23] [TYPE=2] [SEQ] [LEN] [CMD] [DATA...]
 * 
 * 所以设备发送的格式正确!
 * 
 * ab_23_02_06_02_27_00:
 * - 0xAB 0x23 = TAG
 * - 0x02 = RESPONSE 类型
 * - 0x06 = 序列号 (匹配请求)
 * - 0x02 = 数据长度 (cmd + result)
 * - 0x27 = 命令回显
 * - 0x00 = 结果 (SUCCESS)
 * 
 * 这个格式正确！问题可能是:
 * 1. APP 没有启动 Notify 订阅 → 无法接收数据
 * 2. BLE 连接断开 → 数据丢失
 * 3. 特征 UUID 不匹配 → 无法接收
 * 4. 日志没有显示接收到数据
 */

// ============================================================================
// 第三步: 实现完整的命令分发系统
// ============================================================================

/*
 * 推荐的改进方案:
 * 
 * 在 ab_mate_profile.c 中添加命令分发函数:
 */

// 命令分发表
typedef struct {
    u8 cmd_id;
    void (*handler)(u8 *payload, u8 payload_len, u8 seq);
} ab_mate_cmd_handler_t;

// 命令处理函数示例 (实现在 ab_mate_app.c 中)
extern void ab_mate_eq_set(u8 *payload, u8 payload_len);
extern void ab_mate_music_set(u8 *payload, u8 payload_len);
extern void ab_mate_device_info_query(u8 seq);  // 新增: 需要序列号
extern void ab_mate_anc_set(u8 *payload, u8 payload_len);
extern void ab_mate_vol_set(u8 *payload, u8 payload_len);
extern void ab_mate_device_find(u8 *payload, u8 payload_len);

// 命令处理函数 (新建议)
static void ab_mate_cmd_handler_device_info(u8 *payload, u8 payload_len, u8 seq)
{
    // 发送设备信息 TLV 数据
    // 格式: [TAG][TYPE=NOTIFY][SEQ][LEN][TLV_TYPE][TLV_LEN][TLV_DATA...]
    
    // 示例: 发送设备版本
    u8 tlv_data[10];
    u8 idx = 0;
    
    // 添加版本信息 (TLV)
    tlv_data[idx++] = 0x01;                    // TLV Type: VERSION
    tlv_data[idx++] = 4;                       // TLV Length
    tlv_data[idx++] = 0x01;                    // 版本主号
    tlv_data[idx++] = 0x02;                    // 版本次号
    tlv_data[idx++] = 0x03;                    // 版本修订号
    tlv_data[idx++] = 0x04;                    // 构建号
    
    // 调用 Notify 发送
    ab_mate_device_info_notify(tlv_data, idx);
    
    // 最后发送成功响应
    ab_mate_request_common_response(AB_MATE_SUCCESS);
}

static void ab_mate_cmd_handler_eq_set(u8 *payload, u8 payload_len, u8 seq)
{
    // 调用现有的 EQ 设置函数
    ab_mate_eq_set(payload, payload_len);
    // ab_mate_eq_set 内部会调用 ab_mate_request_common_response()
}

// 命令分发表
static const ab_mate_cmd_handler_t cmd_handlers[] = {
    {0x20, ab_mate_cmd_handler_eq_set},              // EQ_SET
    {0x21, ab_mate_music_set},                       // MUSIC_SET
    // 更多命令处理器...
    {0x27, ab_mate_cmd_handler_device_info},         // DEVICE_INFO_GET
    {0x2C, ab_mate_anc_set},                         // ANC_SET
    {0x2D, ab_mate_vol_set},                         // VOL_SET
    {0x31, ab_mate_device_find},                     // DEVICE_FIND
};

// 主命令分发函数
static void ab_mate_cmd_dispatch(u8 cmd, u8 *payload, u8 payload_len, u8 seq)
{
    for (int i = 0; i < sizeof(cmd_handlers) / sizeof(cmd_handlers[0]); i++) {
        if (cmd_handlers[i].cmd_id == cmd) {
            printf("[AB-Mate] 分发命令 0x%02X, Seq=%u\n", cmd, seq);
            if (cmd_handlers[i].handler) {
                cmd_handlers[i].handler(payload, payload_len, seq);
            }
            return;
        }
    }
    
    // 命令未找到 - 发送错误响应
    printf("[AB-Mate] 未知命令: 0x%02X\n", cmd);
    ab_mate_request_common_response(AB_MATE_FAIL);
}

// ============================================================================
// 第四步: 修改 gatt_callback_ab_mate_write()
// ============================================================================

/*
 * 新的实现方式 (替换临时响应):
 */

static int gatt_callback_ab_mate_write(uint16_t con_handle, uint16_t handle, 
                                       uint32_t flag, uint8_t *ptr, uint16_t len)
{
    if (ab_mate_app.update_param_flag) {
        ab_mate_app.update_param_flag = 0;
        ble_update_conn_param(AB_MATE_CON_INTERVAL, 0, 400);
    }
    
    printf("AB-Mate RX (%d bytes): ", len);
    for (uint16_t i = 0; i < len; i++) {
        printf("%02X ", ptr[i]);
    }
    printf("\n");

    // ========== 标准 AB-Mate 协议处理 ==========
    if (len >= 6 && ptr[0] == 0xAB && ptr[1] == 0x23) {
        u8 type = ptr[2];
        u8 seq = ptr[3];
        u8 cmdLen = ptr[4];
        u8 cmd = ptr[5];
        u8 *payload = (cmdLen > 1) ? &ptr[6] : NULL;
        u8 payload_len = cmdLen - 1;
        
        printf("[AB-Mate] 解析数据包: Type=%u Seq=%u Len=%u Cmd=0x%02X\n", 
               type, seq, cmdLen, cmd);
        
        // 只处理请求类型 (Type=1)
        if (type == 0x01) {
            // 调用命令分发器
            ab_mate_cmd_dispatch(cmd, payload, payload_len, seq);
            return 0;
        }
    }

    // ========== APP_AGNES 特殊命令处理 ==========
#ifdef APP_AGNES
    for (int i = 0; i < sizeof(commands) / sizeof(commands[0]); i++) {
        if (len != commands[i].len) {
            continue;
        }
        int match = 1;
        for (uint16_t j = 0; j < len; j++) {
            if (ptr[j] != commands[i].data[j]) {
                match = 0;
                break;
            }
        }
        if (match) {
            printf("[APP_AGNES] 命令匹配成功\n");
            commands[i].callback();
            return 0;
        }
    }
    printf("No matching command found\n");
#endif

    return 0;
}

// ============================================================================
// 第五步: 诊断 APP 端接收问题
// ============================================================================

/*
 * 在 ABMateProtocol.ts 中检查:
 * 
 * 1. startNotifications() 是否被调用?
 *    检查方式: 在 setupCharacteristicsListeners() 中加入日志
 * 
 * 2. 是否已订阅 NOTIFY 特征?
 *    检查方式: 看 clientConfigDescriptor 是否被写入 0x0001
 * 
 * 3. handleReceivedData() 是否被触发?
 *    检查方式: 在 onDataCallback 中加入日志
 * 
 * 4. 响应匹配是否成功?
 *    检查方式: 看 pendingRequests Map 是否找到对应的 SEQ
 * 
 * 测试流程:
 * 1. APP 启动 → "连接设备"
 * 2. 选择设备 → "开始连接"
 * 3. 读取设备名称 → 应该显示设备名
 * 4. Console 显示所有日志
 * 5. 尝试查询设备信息 (点击某个按钮)
 * 6. 观察:
 *    - APP Console 是否显示 "📤 发送数据包"?
 *    - 设备串口是否显示 "AB-Mate RX"?
 *    - APP Console 是否显示 "📥 收到数据包"?
 *    - Console 是否显示 "✅ 序列号匹配"?
 */

// ============================================================================
// 第六步: 测试场景
// ============================================================================

/*
 * 场景 1: 查询设备信息 (DEVICE_INFO_GET = 0x27)
 * 
 * APP 发送:
 * ab 23 01 00 02 27 00
 * │  │  │  │  │  │  │
 * TAG TYPE SEQ LEN CMD PARAM
 * 
 * 设备接收并处理:
 * - 验证 TAG = 0xAB23
 * - 验证 TYPE = 0x01 (REQUEST)
 * - 提取 SEQ = 0x00
 * - 提取 CMD = 0x27
 * 
 * 设备发送通知 (NOTIFY):
 * [TAG=ab23] [TYPE=03] [SEQ=00] [LEN=...] [TLV_DATA...]
 * 然后发送响应:
 * ab 23 02 00 02 27 00
 * 
 * APP 接收并处理:
 * - 验证 TAG = 0xAB23
 * - 验证 TYPE = 0x02 (RESPONSE)
 * - 查找 SEQ = 0x00 的待处理请求
 * - 提取 CMD = 0x27
 * - 提取 RESULT = 0x00 (SUCCESS)
 * 
 * 场景 2: 设置 ANC (ANC_SET = 0x2C)
 * 
 * APP 发送:
 * ab 23 01 01 03 2c 01 00
 * │  │  │  │  │  │  │  │
 * TAG TYPE SEQ LEN CMD MODE ?
 * 
 * 设备处理:
 * - 提取 SEQ = 0x01
 * - 提取 CMD = 0x2C
 * - 提取 PAYLOAD = [0x01, 0x00] (长度 2)
 * - 调用 ab_mate_anc_set(payload, 2)
 * - anc_set 内部调用 ab_mate_request_common_response()
 * 
 * 设备发送:
 * ab 23 02 01 01 00
 * (RESPONSE, SEQ=1, LEN=1, RESULT=0x00)
 * 
 * APP 接收:
 * - 查找 SEQ = 0x01
 * - 看到 RESULT = 0x00 (SUCCESS)
 * - 显示 "✅ ANC 设置成功"
 */

// ============================================================================
// 总结
// ============================================================================

/*
 * ✅ 完成的工作:
 * 1. APP 能够发送标准 AB-Mate 数据包
 * 2. 设备能够接收和解析 AB-Mate 数据包
 * 3. 设备能够发送响应数据包
 * 4. 响应格式正确 (包含序列号)
 * 
 * 🔄 需要完成的工作:
 * 1. 实现设备端的命令分发系统 (见第三步)
 * 2. 验证 APP 已订阅 Notify
 * 3. 测试完整的双向通信流程
 * 4. 实现所有命令的处理函数
 * 
 * 🎯 下一步:
 * 1. 应用第三和第四步的代码到设备固件
 * 2. 重新编译并烧录
 * 3. 在 APP Console 中查看完整的日志流
 * 4. 验证响应是否被正确接收和解析
 * 5. 如果还有问题，检查 BLE 连接参数和 MTU 设置
 */
