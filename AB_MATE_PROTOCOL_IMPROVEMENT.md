/**
 * AB-Mate 标准协议处理改进建议
 * 
 * 这个文件说明如何在 ab_mate_profile.c 中正确调用 ab_mate_app.c 的命令处理
 */

// ============================================================================
// 现状分析
// ============================================================================

/*
 * 当前问题：
 * 
 * APP 发送数据包: ab 23 01 06 02 27 00
 * 设备串口显示: "Data: AB 23 01 06 02 27 00"
 *              "No matching command found"
 * 
 * 原因：
 * gatt_callback_ab_mate_write() 只查找 APP_AGNES 特殊命令，
 * 没有识别和处理标准 AB-Mate 协议数据包。
 * 
 * 该数据包是标准 AB-Mate 查询设备信息请求 (0x27)，
 * 应该由 ab_mate_device_info_query() 处理
 */

// ============================================================================
// 解决方案
// ============================================================================

/*
 * 步骤 1: 在 gatt_callback_ab_mate_write() 中添加标准协议检查
 *        ✅ 已完成（见上面的修改）
 * 
 * 步骤 2: 通过序列号绑定请求和响应
 * 
 * 步骤 3: 确保正确调用 ab_mate_app.c 中的处理函数
 */

// ============================================================================
// 对应关系表
// ============================================================================

/*
 * AB-Mate 命令 (来自 ab-mate.ts) 与 ab_mate_app.c 函数的对应关系
 * 
 * CMD_ID | 命令名称              | ab_mate_app.c 处理函数
 * -------|----------------------|------------------------
 * 0x20   | EQ_SET               | ab_mate_eq_set()
 * 0x21   | MUSIC_SET            | ab_mate_music_set()
 * 0x22   | KEY_SET              | ab_mate_key_set()
 * 0x23   | POWER_OFF_SET        | (未在代码中显示)
 * 0x24   | DEVICE_RESET         | ab_mate_device_reset()
 * 0x25   | MODE_SET             | ab_mate_mode_set()
 * 0x26   | IN_EAR_SET           | ab_mate_in_ear_set()
 * 0x27   | DEVICE_INFO_GET      | ab_mate_device_info_query() ← APP 发送的是这个
 * 0x28   | DEVICE_INFO_NOTIFY   | ab_mate_device_info_notify()
 * 0x29   | LANGUAGE_SET         | ab_mate_language_set()
 * 0x2A   | BT_NAME_SET          | ab_mate_bt_name_set()
 * 0x2B   | LED_SET              | ab_mate_led_set()
 * 0x2C   | ANC_SET              | ab_mate_anc_set()
 * 0x2D   | VOL_SET              | ab_mate_vol_set()
 * 0x2E   | ANC_LEVEL_SET        | ab_mate_anc_level_set()
 * 0x2F   | TP_LEVEL_SET         | ab_mate_tp_level_set()
 * 0x30   | V3D_AUDIO_SET        | ab_mate_v3d_audio_set()
 * 0x31   | DEVICE_FIND          | ab_mate_device_find()
 */

// ============================================================================
// 正确的实现方式
// ============================================================================

#if 0  // 这是伪代码示例，不会编译

// 方法 1: 直接调用对应的处理函数
static int ab_mate_dispatch_command(u8 cmd, u8 *payload, u8 payload_len, u8 seq)
{
    printf("[AB-Mate] 分发命令 0x%02X, Seq=%u\n", cmd, seq);
    
    switch(cmd) {
        case 0x20:  // EQ_SET
            ab_mate_eq_set(payload, payload_len);
            break;
            
        case 0x21:  // MUSIC_SET
            ab_mate_music_set(payload, payload_len);
            break;
            
        case 0x22:  // KEY_SET
            ab_mate_key_set(payload, payload_len);
            break;
            
        case 0x24:  // DEVICE_RESET
            ab_mate_device_reset(payload, payload_len);
            break;
            
        case 0x25:  // MODE_SET
            ab_mate_mode_set(payload, payload_len);
            break;
            
        case 0x26:  // IN_EAR_SET
            ab_mate_in_ear_set(payload, payload_len);
            break;
            
        case 0x27:  // DEVICE_INFO_GET ← 你的数据包
            printf("[AB-Mate] 处理: 查询设备信息\n");
            ab_mate_device_info_query(payload, payload_len);
            // 这个函数会通过 Notify 发送响应
            break;
            
        case 0x29:  // LANGUAGE_SET
            ab_mate_language_set(payload, payload_len);
            break;
            
        case 0x2A:  // BT_NAME_SET
            ab_mate_bt_name_set(payload, payload_len);
            break;
            
        case 0x2B:  // LED_SET
            ab_mate_led_set(payload, payload_len);
            break;
            
        case 0x2C:  // ANC_SET
            ab_mate_anc_set(payload, payload_len);
            break;
            
        case 0x2D:  // VOL_SET
            ab_mate_vol_set(payload, payload_len);
            break;
            
        case 0x2E:  // ANC_LEVEL_SET
            ab_mate_anc_level_set(payload, payload_len);
            break;
            
        case 0x2F:  // TP_LEVEL_SET
            ab_mate_tp_level_set(payload, payload_len);
            break;
            
        case 0x30:  // V3D_AUDIO_SET
            ab_mate_v3d_audio_set(payload, payload_len);
            break;
            
        case 0x31:  // DEVICE_FIND
            ab_mate_device_find(payload, payload_len);
            break;
            
        default:
            printf("[AB-Mate] 未知命令: 0x%02X\n", cmd);
            // 发送错误响应
            ab_mate_send_error_response(seq, cmd, AB_MATE_FAIL);
            return -1;
    }
    
    // 注意：大多数函数会自动调用 ab_mate_request_common_response()
    // 所以不需要在这里手动发送响应
    
    return 0;
}

// 然后在 gatt_callback_ab_mate_write() 中调用：
static int gatt_callback_ab_mate_write(uint16_t con_handle, uint16_t handle, 
                                       uint32_t flag, uint8_t *ptr, uint16_t len)
{
    // ... 连接参数更新代码 ...
    
    // 标准 AB-Mate 协议处理
    if (len >= 6 && ptr[0] == 0xAB && ptr[1] == 0x23) {
        u8 type = ptr[2];
        u8 seq = ptr[3];
        u8 cmdLen = ptr[4];
        u8 cmd = ptr[5];
        u8 *payload = (cmdLen > 1) ? &ptr[6] : NULL;
        u8 payload_len = cmdLen - 1;
        
        if (type == 0x01) {  // REQUEST
            ab_mate_dispatch_command(cmd, payload, payload_len, seq);
            return 0;
        }
    }
    
    // APP_AGNES 特殊命令处理
    // ...
    
    return 0;
}

#endif

// ============================================================================
// 重要说明
// ============================================================================

/*
 * 为什么修改后可能仍然没有响应：
 * 
 * 1. ab_mate_device_info_query() 会调用 ab_mate_device_info_notify()
 * 2. ab_mate_device_info_notify() 会通过 Notify 特征发送数据
 * 3. Notify 特征需要客户端已订阅才能接收数据
 * 
 * 检查点：
 * ✓ gatt_callback_ab_mate_client_config_write() 是否被调用？
 * ✓ cfg 是否等于 GATT_CLIENT_CONFIG_NOTIFY?
 * ✓ ab_mate_connect_proc() 是否执行？
 * 
 * 如果 CLIENT_CONFIG_NOTIFY 没有被设置，设备发送的数据将被忽略！
 */

// ============================================================================
// 数据流验证
// ============================================================================

/*
 * APP 端：
 * 1. 调用 startNotifications() ← 必须做这个
 *    ↓
 * 2. 发送查询命令: ab 23 01 06 02 27 00
 *    ↓
 * 设备端：
 * 3. gatt_callback_ab_mate_client_config_write() 接收订阅请求
 *    ↓
 * 4. 调用 ab_mate_connect_proc()
 *    ↓
 * 5. gatt_callback_ab_mate_write() 接收查询命令
 *    ↓
 * 6. 调用 ab_mate_device_info_query()
 *    ↓
 * 7. 调用 ab_mate_device_info_notify() 发送数据
 *    ↓
 * 8. ab_mate_ble_send_packet() 通过 Notify 特征发送
 *    ↓
 * APP 端：
 * 9. characteristicvaluechanged 事件触发
 *    ↓
 * 10. onDataCallback() 接收响应数据
 */

// ============================================================================
// 测试步骤
// ============================================================================

/*
 * 1. 重新编译设备固件，包含修改后的 gatt_callback_ab_mate_write()
 * 
 * 2. 在设备串口中应该看到新的日志：
 *    [AB-Mate] 解析数据包: Type=1 Seq=6 Len=2 Cmd=0x27
 *    [AB-Mate] 处理命令 0x27
 * 
 * 3. 然后设备会调用 ab_mate_device_info_query() 处理
 * 
 * 4. 查看是否有以下日志：
 *    [AB-Mate]: latt conn  ← 表示客户端已订阅
 * 
 * 5. 检查 ab_mate_ble_send_packet() 是否被调用
 * 
 * 6. 在 APP 的 Console 中应该看到：
 *    📥 收到原始数据 (N 字节): ...
 *    📋 数据包结构: {Type: RESPONSE, ...}
 */
