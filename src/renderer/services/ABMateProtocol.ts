/**
 * AB-Mate 协议处理类
 * 负责数据包的编码、解码和命令处理
 */

import {
  AB_MATE_CONSTANTS,
  ABMatePacket,
  ABMateCommand,
  ABMateCommandType,
  ABMateDeviceInfo,
  ABMateEQConfig,
  ABMateANCMode,
  ABMateDeviceMode,
  ABMateEvents,
  ABMateResult,
  ABMateEQMode,
} from '../types/ab-mate';
import { BLEService } from './BLEService';

export class ABMateProtocol {
  private bleService: BLEService;
  private seq: number = 0;
  private deviceInfo: Partial<ABMateDeviceInfo> = {};
  private callbacks: Partial<ABMateEvents> = {};

  // 响应等待队列：序列号 => Promise
  private pendingRequests: Map<number, {
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  /**
   * 获取下一个序列号（0-15 循环）
   * 注意：序列号是 4 位字段，范围应该是 0-15
   * 
   * ⚠️ 关键逻辑更新：
   * 设备在**发送每个数据包前都会递增SEQ**（包括初始化查询、响应和通知）
   * 为了与设备SEQ同步，APP也应该在**发送前递增**，而不是发送后递增
   * 
   * 旧逻辑：返回当前值，然后递增 → getNextSeq() 返回 0,1,2...
   * 新逻辑：先递增，然后返回 → getNextSeq() 返回 1,2,3...
   */
  private getNextSeq(): number {
    this.seq = (this.seq + 1) & 0x0F;   // 先递增（0-15循环）
    const nextSeq = this.seq & 0x0F;    // 返回递增后的值
    return nextSeq;
  }

  constructor(bleService: BLEService) {
    this.bleService = bleService;

    // 监听 BLE 数据
    this.bleService.onData((data) => {
      this.handleReceivedData(data);
    });

    // 监听断开连接
    this.bleService.onDisconnect(() => {
      // 断开连接时重置序列号
      this.seq = 0;
      console.log('🔄 连接已断开，序列号已重置为 0');
      this.callbacks.onDisconnected?.();
    });
  }

  /**
   * 连接设备
   */
  async connect(): Promise<void> {
    try {
      console.log('🔄 开始连接设备...');
      await this.bleService.scanAndConnect();
      console.log('✅ 设备已连接');

      // 重置序列号以与设备同步（设备期望序列号从 0 开始）
      this.seq = 0;
      console.log('🔄 序列号已重置为 0');

      this.callbacks.onConnected?.();
      
      // 连接成功后查询设备信息（等待500ms确保设备准备就绪）
      console.log('⏳ 等待 500ms 后发送初始查询...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('📤 发送初始设备信息查询...');
      await this.queryDeviceInfo();
      
      console.log('✅ 初始查询完成');
    } catch (error) {
      console.error('❌ 连接失败:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.bleService.disconnect();
  }

  /**
   * 查询设备信息
   * 使用 TLV (Type-Length-Value) 格式指定要查询的信息类型
   * 每个信息项占 2 字节：[TYPE(1B)] [LENGTH(1B)]
   * LENGTH 通常为 0（表示查询，不提供值）
   * 
   * @param infoTypes 要查询的信息类型数组，如果不指定则查询常用的几个
   */
  async queryDeviceInfo(infoTypes?: number[]): Promise<void> {
    // 如果没有指定信息类型，查询常用的几个
    if (!infoTypes) {
      infoTypes = [
        0x01,  // INFO_POWER - 电池电量
        0x02,  // INFO_VERSION - 固件版本
        0x04,  // INFO_EQ - EQ 设置
        0x0C,  // INFO_ANC - ANC 模式
        0xFF,  // INFO_MTU - MTU 大小
        0xFE,  // INFO_DEV_CAP - 设备能力
      ];
    }

    // 构建 TLV 载荷：每个信息类型 + length=0
    const payload = new Uint8Array(infoTypes.length * 2);
    for (let i = 0; i < infoTypes.length; i++) {
      payload[i * 2] = infoTypes[i];      // 信息类型
      payload[i * 2 + 1] = 0;             // 长度=0（查询）
    }

    console.log(`📋 准备查询设备信息: ${infoTypes.map(t => '0x' + t.toString(16).padStart(2, '0')).join(', ')}`);
    console.log(`   TLV 载荷 (${payload.length} 字节): ${Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    const packet = this.buildPacket(
      ABMateCommand.DEVICE_INFO_GET,
      ABMateCommandType.REQUEST,
      payload
    );
    
    // 使用 sendAndWait 确保注册待处理请求，等待设备响应
    const response = await this.sendAndWait(packet);
    if (response) {
      console.log(`✅ 收到设备信息响应，共 ${response.length} 字节`);
    } else {
      console.warn(`❌ 设备信息查询超时或无响应`);
    }
  }

  /**
   * 设置 EQ
   */
  async setEQ(config: ABMateEQConfig): Promise<void> {
    const payload = new Uint8Array(11);
    payload[0] = config.mode;
    
    // 10 段增益值 (-12 到 +12 转换为 0-24)
    for (let i = 0; i < 10; i++) {
      payload[i + 1] = Math.max(0, Math.min(24, config.gains[i] + 12));
    }

    const packet = this.buildPacket(ABMateCommand.EQ_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置 ANC 模式
   */
  async setANCMode(mode: ABMateANCMode): Promise<void> {
    const payload = new Uint8Array([mode]);
    const packet = this.buildPacket(ABMateCommand.ANC_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置 ANC 等级
   */
  async setANCLevel(level: number): Promise<void> {
    const payload = new Uint8Array([Math.max(0, Math.min(4, level))]);
    const packet = this.buildPacket(ABMateCommand.ANC_LEVEL_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置透传等级
   */
  async setTransparencyLevel(level: number): Promise<void> {
    const payload = new Uint8Array([Math.max(0, Math.min(3, level))]);
    const packet = this.buildPacket(ABMateCommand.TP_LEVEL_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置音量
   * 使用 MUSIC_SET 命令，TLV 格式：[Type, Length, Value]
   * Type = 0x01 (A2DP_CTL_VOICE 音量控制)
   * Length = 0x01 (1字节音量值)
   * Value = 0-100 (音量百分比)
   */
  async setVolume(volume: number): Promise<void> {
    const vol = Math.max(0, Math.min(100, volume));
    const payload = new Uint8Array([
      0x01,  // Type: A2DP_CTL_VOICE (音量控制)
      0x01,  // Length: 1字节
      vol    // Value: 音量值 0-100
    ]);
    const packet = this.buildPacket(ABMateCommand.MUSIC_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
    
    // ✅ 命令成功发送后，立即更新本地音量值和触发回调
    // 不能依赖响应中的值，因为响应只包含错误码，不包含音量值
    this.deviceInfo.volume = vol;
    this.callbacks.onVolumeChanged?.(vol);
    console.log(`🔊 音量已设置: ${vol}%`);
  }

  /**
   * 设置工作模式（普通/游戏）
   */
  async setDeviceMode(mode: ABMateDeviceMode): Promise<void> {
    const payload = new Uint8Array([mode]);
    const packet = this.buildPacket(ABMateCommand.MODE_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置入耳检测
   */
  async setInEarDetection(enabled: boolean): Promise<void> {
    const payload = new Uint8Array([enabled ? 1 : 0]);
    const packet = this.buildPacket(ABMateCommand.IN_EAR_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置 LED
   */
  async setLED(enabled: boolean): Promise<void> {
    const payload = new Uint8Array([enabled ? 1 : 0]);
    const packet = this.buildPacket(ABMateCommand.LED_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设置 3D 音效
   */
  async set3DAudio(enabled: boolean): Promise<void> {
    const payload = new Uint8Array([enabled ? 1 : 0]);
    const packet = this.buildPacket(ABMateCommand.V3D_AUDIO_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 设备查找（蜂鸣）
   */
  async findDevice(side: 'left' | 'right' | 'both'): Promise<void> {
    let payload: number;
    switch (side) {
      case 'left': payload = 1; break;
      case 'right': payload = 2; break;
      case 'both': payload = 3; break;
    }
    const packet = this.buildPacket(ABMateCommand.DEVICE_FIND, ABMateCommandType.REQUEST, new Uint8Array([payload]));
    await this.sendAndWait(packet);
  }

  /**
   * 设备复位
   */
  async resetDevice(): Promise<void> {
    // DEVICE_RESET 需要一个参数（通常为 0x00）
    const packet = this.buildPacket(ABMateCommand.DEVICE_RESET, ABMateCommandType.REQUEST, new Uint8Array([0x00]));
    await this.sendAndWait(packet);
  }

  /**
   * 设置蓝牙名称
   */
  async setBluetoothName(name: string): Promise<void> {
    const encoder = new TextEncoder();
    const payload = encoder.encode(name.substring(0, 32));
    const packet = this.buildPacket(ABMateCommand.BT_NAME_SET, ABMateCommandType.REQUEST, payload);
    await this.sendAndWait(packet);
  }

  /**
   * 获取当前设备信息
   */
  getDeviceInfo(): Partial<ABMateDeviceInfo> {
    return { ...this.deviceInfo };
  }

  /**
   * 设置事件回调
   */
  on<K extends keyof ABMateEvents>(event: K, callback: ABMateEvents[K]): void {
    this.callbacks[event] = callback;
  }

  /**
   * 构建 AB-Mate 数据包
   * 格式 (共 7 字节头 + payload):
   * [TAG_H(0xAB)][TAG_L(0x23)][seq/res/enc][cmd][cmd_type][frame_seq/frame_total][payload_len][payload...]
   * 
   * @param cmd 命令码
   * @param type 命令类型 (REQUEST/RESPONSE/NOTIFY)
   * @param payload 载荷数据
   * @param options 可选参数 { preload?: 0-7, encrypt?: boolean, frameSeq?: number, frameTotal?: number }
   */
  private buildPacket(
    cmd: ABMateCommand,
    type: ABMateCommandType,
    payload: Uint8Array,
    options?: {
      preload?: number;    // RESERVE 字段（预留字段）：0-7，默认 0
      encrypt?: boolean;   // ENCRYPT 字段：false=不加密, true=加密，默认 false
      frameSeq?: number;   // 分帧序列号：0-15，默认 0
      frameTotal?: number; // 总帧数：0-15 (0=单帧)，默认 0
    }
  ): Uint8Array {
    // 参数提取和校验
    const seq = this.getNextSeq();
    const preload = Math.max(0, Math.min(7, options?.preload ?? 0));
    const encrypt = options?.encrypt ?? false;
    const frameSeq = Math.max(0, Math.min(15, options?.frameSeq ?? 0));
    const frameTotal = Math.max(0, Math.min(15, options?.frameTotal ?? 0));

    // 载荷长度校验
    if (payload.length > 250) {
      console.error('❌ 载荷过长: %d 字节 (最大 250)', payload.length);
      throw new Error(`Payload too long: ${payload.length} bytes (max 250)`);
    }

    // === 7 字节头部结构 ===
    const headerLen = 7;
    const totalLen = headerLen + payload.length;
    const packet = new Uint8Array(totalLen);

    // 字节0-1: TAG (0xAB23)
    packet[0] = (AB_MATE_CONSTANTS.TAG >> 8) & 0xff;  // TAG HIGH (0xAB)
    packet[1] = AB_MATE_CONSTANTS.TAG & 0xff;         // TAG LOW (0x23)
    
    // 字节2: [seq(4bit)|reserve/preload(3bit)|encrypt(1bit)]
    packet[2] = (seq & 0x0F) | ((preload & 0x07) << 4) | ((encrypt ? 1 : 0) << 7);
    
    // 字节3-4: CMD 和 CMD_TYPE
    packet[3] = cmd;           // 字节3: CMD
    packet[4] = type;          // 字节4: CMD_TYPE
    
    // 字节5: [frame_seq(4bit)|frame_total(4bit)]
    packet[5] = (frameSeq & 0x0F) | ((frameTotal & 0x0F) << 4);
    
    // 字节6: PAYLOAD_LEN
    packet[6] = payload.length & 0xFF;
    
    // 字节7+: PAYLOAD
    if (payload.length > 0) {
      packet.set(payload, headerLen);
    }

    // 验证构建的数据包
    if (!this.validatePacket(packet)) {
      throw new Error('Data packet validation failed');
    }

    // 调试日志
    this.logPacketBuild(packet, { preload, encrypt, frameSeq, frameTotal, headerLen });

    return packet;
  }

  /**
   * 验证数据包的完整性和合法性
   */
  private validatePacket(packet: Uint8Array): boolean {
    // 检查最小长度（7 字节头）
    if (packet.length < 7) {
      console.error('❌ 数据包过短: %d 字节（最小 7）', packet.length);
      return false;
    }

    // 检查最大长度 (7 + 250)
    if (packet.length > 257) {
      console.error('❌ 数据包过长: %d 字节（最大 257）', packet.length);
      return false;
    }

    // 检查 TAG
    const tag = (packet[0] << 8) | packet[1];
    if (tag !== 0xAB23) {
      console.error('❌ TAG 错误: 0x%04X（应为 0xAB23）', tag);
      return false;
    }

    // 检查命令类型有效性（必须是 1、2 或 3）
    const cmdType = packet[4];
    if (cmdType < 1 || cmdType > 3) {
      console.error('❌ 命令类型无效: %d（应为 1-3）', cmdType);
      return false;
    }

    // 检查载荷长度是否与数据包一致
    const payloadLen = packet[6];
    const expectedTotalLen = 7 + payloadLen;
    if (packet.length !== expectedTotalLen) {
      console.warn('⚠️  数据包长度不匹配: 声明 %d，实际 %d', expectedTotalLen, packet.length);
    }

    return true;
  }

  /**
   * 输出构建的数据包信息用于调试
   */
  private logPacketBuild(
    packet: Uint8Array,
    params: { preload: number; encrypt: boolean; frameSeq: number; frameTotal: number; headerLen: number }
  ): void {
    const tag = (packet[0] << 8) | packet[1];
    const seq = packet[2] & 0x0F;
    const cmd = packet[3];
    const type = packet[4];
    const payloadLen = packet[6];
    const rawHex = Array.from(packet)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');

    console.log(
      `📦 [BUILD] TAG:0x${tag.toString(16).padStart(4, '0')} SEQ:${seq} ` +
      `CMD:0x${cmd.toString(16).padStart(2, '0')} TYPE:${type} FRAME:${params.frameSeq}/${params.frameTotal} ` +
      `PRELOAD:${params.preload} ENCRYPT:${params.encrypt ? 1 : 0} HEADER_LEN:${params.headerLen} PAYLOAD_LEN:${payloadLen}`
    );
    console.log(`    数据: ${rawHex}`);
  }

  /**
   * 计算 AB-Mate CRC16 校验码
   * 用于 SPP 串行连接（BLE GATT 链路层已包含 CRC，无需应用层校验）
   * 
   * @param data 要校验的数据
   * @returns 16位 CRC 校验码
   */
  private calculateCRC16(data: Uint8Array): number {
    let crc = 0xffff;

    for (let i = 0; i < data.length; i++) {
      // CRC 循环左移 8 位 + 循环右移 8 位
      crc = ((crc >> 8) | (crc << 8)) & 0xffff;
      crc ^= data[i];
      crc ^= ((crc & 0xff) >> 4);
      crc ^= (crc << 12) & 0xffff;
      crc ^= ((crc & 0xff) << 5) & 0xffff;
    }

    return crc & 0xffff;
  }

  /**
   * 为数据包添加 CRC16 校验码（用于 SPP 模式）
   * BLE GATT 模式不需要此函数
   */
  private addCRC16ToPacket(packet: Uint8Array): Uint8Array {
    const crc = this.calculateCRC16(packet);
    const packetWithCRC = new Uint8Array(packet.length + 2);
    packetWithCRC.set(packet);
    packetWithCRC[packet.length] = crc & 0xFF;           // CRC 低字节
    packetWithCRC[packet.length + 1] = (crc >> 8) & 0xFF; // CRC 高字节
    
    console.log(`[CRC16] 计算CRC: 0x${crc.toString(16).padStart(4, '0')} (用于SPP模式)`);
    return packetWithCRC;
  }

  /**
   * 发送数据包并等待响应
   */
  private async sendAndWait(packet: Uint8Array, timeoutMs: number = 5000): Promise<Uint8Array | null> {
    const seq = packet[2] & 0x0F; // 获取序列号（字节2的位0-3）

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // 超时处理 - 仔细检查是否确实存在该请求
        if (this.pendingRequests.has(seq)) {
          this.pendingRequests.delete(seq);
          console.warn(`❌ 命令超时（序列号: ${seq}），${timeoutMs}ms 无响应`);
          console.warn(`   待处理请求剩余: [${Array.from(this.pendingRequests.keys()).join(', ')}]`);
        } else {
          console.warn(`⚠️  超时触发但请求已被清理（SEQ=${seq}），可能已收到响应`);
        }
        this.callbacks.onError?.(new Error('设备无响应，请检查连接'));
        resolve(null);
      }, timeoutMs);

      // 检查是否已经有相同SEQ的待处理请求（序列号循环问题）
      if (this.pendingRequests.has(seq)) {
        console.warn(`⚠️  注意：序列号 ${seq} 已存在于待处理列表中（可能是序列号循环导致）`);
        console.warn(`   这表示前一个SEQ=${seq}的请求还没完成就又发送了新请求`);
        const oldPending = this.pendingRequests.get(seq);
        if (oldPending) {
          clearTimeout(oldPending.timeout);
        }
      }

      this.pendingRequests.set(seq, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.callbacks.onError?.(error);
          resolve(null);
        },
        timeout,
      });

      // 发送数据包
      this.bleService.writeWithoutResponse(packet).catch((error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(seq);
        this.callbacks.onError?.(error as Error);
        resolve(null);
      });

      const cmd = packet[3];
      const type = packet[4];
      const frameSeq = packet[5] & 0x0F;
      const frameTotal = (packet[5] >> 4) & 0x0F;
      const payloadLen = packet[6];
      console.log(`📤 发送命令: [TAG:AB23] [SEQ:${seq}] [CMD:0x${cmd.toString(16).padStart(2, '0')}] [TYPE:${type}] [FRAME:${frameSeq}/${frameTotal}] [PAYLOAD_LEN:${payloadLen}]`);
      console.log(`   内部SEQ计数: ${this.seq}（当前循环位置，应该在0-15范围）`);
      console.log(`   待处理请求SEQ: [${Array.from(this.pendingRequests.keys()).join(', ')}]`);
      console.log(`   完整数据: ${Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    });
  }

  /**
   * 发送数据包
   */
  private async sendPacket(packet: Uint8Array): Promise<void> {
    try {
      // 提取字段值（字节位置）
      const tag = (packet[0] << 8) | packet[1];           // 字节 0-1
      const seq = packet[2] & 0x0F;                       // 字节 2 低 4 位
      const preload = (packet[2] >> 4) & 0x07;            // 字节 2 位 4-6
      const encrypt = (packet[2] >> 7) & 0x01;            // 字节 2 位 7
      const cmd = packet[3];                              // 字节 3
      const type = packet[4];                             // 字节 4
      const frameSeq = packet[5] & 0x0F;                  // 字节 5 低 4 位
      const frameTotal = (packet[5] >> 4) & 0x0F;         // 字节 5 高 4 位
      const payloadLen = packet[6];                       // 字节 6
      
      const rawHex = Array.from(packet)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');

      console.log(
        `📤 发送: TAG:0x${tag.toString(16).padStart(4, '0')} SEQ:${seq} ` +
        `CMD:0x${cmd.toString(16).padStart(2, '0')} TYPE:${type} FRAME:${frameSeq}/${frameTotal} ` +
        `PAYLOAD_LEN:${payloadLen} TOTAL_LEN:${packet.length}`
      );
      console.log(`   PRELOAD:${preload} ENCRYPT:${encrypt ? '✓' : '✗'}`);
      console.log(`   数据: ${rawHex}`);

      // 优先使用快速写入（无响应）
      await this.bleService.writeWithoutResponse(packet);
      console.log(`   ✓ 已发送到特征 0xFF17`);
    } catch (error) {
      console.error('❌ 发送数据包失败:', error);
      this.callbacks.onError?.(error as Error);
    }
  }

  /**
   * 处理接收到的数据
   */
  private handleReceivedData(data: DataView): void {
    try {
      // 原始数据日志
      const rawData = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`📥 收到原始数据 (${data.byteLength} 字节): ${rawData}`);

      // 检查是否缺少TAG字节
      // TAG应该是0xAB23，如果第0-1字节不是TAG，说明数据缺少TAG前缀
      let dataToparse = data;
      const byte0 = data.getUint8(0);
      const byte1 = data.getUint8(1);
      const tag = (byte0 << 8) | byte1;

      if (tag !== AB_MATE_CONSTANTS.TAG && data.byteLength >= 5) {
        // 看起来缺少TAG，尝试重新构建
        // 检查byte0是否看起来像SEQ/RES/ENC字段（通常byte0 & 0x0F 应该在0-15之间）
        const potentialSeq = byte0 & 0x0F;
        // 检查byte1是否看起来像CMD字段（通常是0x20-0x3F或其他有效值）
        const potentialCmd = byte1;
        
        // 如果byte1看起来是有效的命令码，说明确实缺少TAG
        if ((potentialCmd >= 0x20 && potentialCmd <= 0x3F) || 
            potentialCmd === 0x28 || potentialCmd === 0xA0 || potentialCmd === 0xA1 || 
            potentialCmd === 0xA2 || potentialCmd === 0xA3 || potentialCmd === 0xE0) {
          console.warn(`⚠️  检测到缺少TAG字节，自动补全 (TAG应为0xAB23)`);
          
          // 创建新的 ArrayBuffer，在前面添加TAG
          const newBuffer = new ArrayBuffer(data.byteLength + 2);
          const newView = new Uint8Array(newBuffer);
          
          // 写入TAG
          newView[0] = 0xAB;
          newView[1] = 0x23;
          
          // 复制原始数据
          const originalData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          newView.set(originalData, 2);
          
          dataToparse = new DataView(newBuffer);
          console.log(`   补全后的数据: ${Array.from(newView).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        }
      }

      // 解析数据包
      const packet = this.parsePacket(dataToparse);
      
      console.log('📋 数据包结构:', {
        TAG: `0x${packet.tag.toString(16).padStart(4, '0')}`,
        Type: packet.type === 2 ? 'RESPONSE' : packet.type === 3 ? 'NOTIFY' : `UNKNOWN(${packet.type})`,
        Seq: packet.seq,
        Len: packet.len,
        Cmd: `0x${packet.cmd.toString(16).padStart(2, '0')}`,
        PayloadLen: packet.payload.length,
        Payload: packet.payload.length > 0 
          ? Array.from(packet.payload).map(b => b.toString(16).padStart(2, '0')).join(' ')
          : '(空)'
      });

      // 检查是否有待处理的请求
      // ⚠️ SEQ同步逻辑更新：
      // APP现在采用"发送前递增"，所以：
      // - APP发送SEQ=1,2,3...的请求
      // - 设备也在发送前递增，所以响应的SEQ = (待处理SEQ + 设备额外递增次数)
      // 
      // 设备的SEQ递增包括：
      // 1. 初始化时的查询响应（设备初始SEQ会+1）
      // 2. 每次发送响应前都会+1
      // 
      // 因此，响应匹配需要考虑设备已经额外递增的次数
      let matchedSeq: number | null = null;
      
      if (packet.type === ABMateCommandType.RESPONSE) {
        const pendingSeqs = Array.from(this.pendingRequests.keys());
        console.log(`   待处理请求SEQ列表: ${pendingSeqs.length === 0 ? '[]（无待处理）' : '[' + pendingSeqs.join(', ') + ']'}`);
        
        // 由于设备的初始化查询会导致SEQ额外递增一次，
        // 响应SEQ通常 = 请求SEQ + 1（或其他固定偏移）
        // 尝试多个可能的匹配：
        
        // 1. 精确匹配（理论上不太可能，除非SEQ完全同步）
        if (this.pendingRequests.has(packet.seq)) {
          matchedSeq = packet.seq;
          console.log(`   ✓ 序列号精确匹配: ${packet.seq}`);
        } else {
          // 2. 最常见：响应SEQ = 请求SEQ + 1（或更多）
          const seqMinus1 = (packet.seq - 1) & 0x0F;
          if (this.pendingRequests.has(seqMinus1)) {
            matchedSeq = seqMinus1;
            console.log(`   ✓ 序列号 (-1) 匹配: 待处理SEQ=${seqMinus1} 对应响应SEQ=${packet.seq}`);
          } else {
            // 3. 设备额外递增：响应SEQ = 请求SEQ + 2
            const seqMinus2 = (packet.seq - 2) & 0x0F;
            if (this.pendingRequests.has(seqMinus2)) {
              matchedSeq = seqMinus2;
              console.log(`   ✓ 序列号 (-2) 匹配: 待处理SEQ=${seqMinus2} 对应响应SEQ=${packet.seq}`);
            } else {
              // 4. 更多额外递增的情况
              const seqMinus3 = (packet.seq - 3) & 0x0F;
              if (this.pendingRequests.has(seqMinus3)) {
                matchedSeq = seqMinus3;
                console.log(`   ✓ 序列号 (-3) 匹配: 待处理SEQ=${seqMinus3} 对应响应SEQ=${packet.seq}`);
              } else {
                console.warn(`   ❌ 序列号完全匹配失败！`);
                console.warn(`      收到响应SEQ=${packet.seq}`);
                console.warn(`      尝试的SEQ值: ${packet.seq}, ${seqMinus1}, ${seqMinus2}, ${seqMinus3}`);
                console.warn(`      待处理请求SEQ=${pendingSeqs.length === 0 ? '[]' : '[' + pendingSeqs.join(', ') + ']'}`);
              }
            }
          }
        }

        if (matchedSeq !== null) {
          const pending = this.pendingRequests.get(matchedSeq);
          this.pendingRequests.delete(matchedSeq);
          clearTimeout(pending?.timeout);
          pending?.resolve(packet.payload);
          console.log(`✅ 序列号 ${matchedSeq} 的请求已匹配响应 (返回值 Seq: ${packet.seq})`);
        } else {
          console.warn(
            `⚠️  收到响应但无对应的待处理请求\n` +
            `   响应SEQ: ${packet.seq}\n` +
            `   期望SEQ: ${pendingSeqs.length === 0 ? '(无待处理)' : pendingSeqs.join(', ')}\n` +
            `   CMD: 0x${packet.cmd.toString(16).padStart(2, '0')}`
          );
          
          // 可能的原因日志
          if (pendingSeqs.length === 0) {
            console.warn(`   💡 可能原因: 没有待处理请求 (请求超时或未发送)`);
          } else if (packet.cmd === 0x28) {
            // DEVICE_INFO_NOTIFY
            console.warn(`   💡 可能原因: 这是一个主动通知，不是响应`);
          } else {
            console.warn(`   💡 序列号对应失败，可能是设备端SEQ管理异常`);
          }
        }
      }

      // 根据命令类型处理
      if (packet.type === ABMateCommandType.RESPONSE) {
        this.handleResponse(packet);
      } else if (packet.type === ABMateCommandType.NOTIFY) {
        this.handleNotify(packet);
      }
    } catch (error) {
      console.error('❌ 解析数据包失败:', error);
      this.callbacks.onError?.(error as Error);
    }
  }

  /**
   * 解析数据包
   * 7字节头部格式:
   * 字节0-1: TAG (0xAB23)
   * 字节2: SEQ(4bit) | PRELOAD(3bit) | ENCRYPT(1bit)
   * 字节3: CMD
   * 字节4: CMD_TYPE
   * 字节5: FRAME_SEQ(4bit) | FRAME_TOTAL(4bit)
   * 字节6: PAYLOAD_LEN
   * 字节7+: PAYLOAD
   */
  private parsePacket(data: DataView): ABMatePacket {
    const tag = (data.getUint8(0) << 8) | data.getUint8(1);
    
    if (tag !== AB_MATE_CONSTANTS.TAG) {
      throw new Error(`❌ 无效的数据包标签: 0x${tag.toString(16)}`);
    }

    if (data.byteLength < 7) {
      throw new Error(`❌ 数据包过短: ${data.byteLength} 字节`);
    }

    // 解析字节2的各个位
    const byte2 = data.getUint8(2);
    const seq = byte2 & 0x0F;           // 位0-3
    const preload = (byte2 >> 4) & 0x07; // 位4-6
    const encrypt = (byte2 >> 7) & 0x01; // 位7
    
    const cmd = data.getUint8(3);
    const type = data.getUint8(4);
    
    // 解析字节5的分帧信息
    const byte5 = data.getUint8(5);
    const frameSeq = byte5 & 0x0F;      // 位0-3
    const frameTotal = (byte5 >> 4) & 0x0F; // 位4-7
    
    // 读取PAYLOAD_LEN字段（字节6）
    const payloadLen = data.getUint8(6);
    
    // 计算实际载荷长度：使用min(PAYLOAD_LEN, 剩余字节)
    // 这样可以处理BLE接收缓冲区有多余数据的情况
    const remainingBytes = data.byteLength - 7;
    const len = Math.min(payloadLen, remainingBytes);
    
    // 验证长度
    if (data.byteLength < 7) {
      throw new Error(`❌ 数据包过短: ${data.byteLength} 字节（最小7字节）`);
    }

    // 如果实际数据少于PAYLOAD_LEN声称的长度，记录警告
    if (remainingBytes < payloadLen) {
      console.warn(
        `⚠️  数据包长度不匹配:\n` +
        `   PAYLOAD_LEN: ${payloadLen}\n` +
        `   实际字节数: ${remainingBytes}\n` +
        `   使用: ${len}`
      );
    }

    return {
      tag,
      type: type as ABMateCommandType,
      seq,
      len,
      cmd: cmd as ABMateCommand,
      payload: new Uint8Array(data.buffer, data.byteOffset + 7, len),
    };
  }

  /**
   * 处理响应
   */
  private handleResponse(packet: ABMatePacket): void {
    // 不同命令的响应格式不同，需要按命令类型来解析
    // MUSIC_SET 响应格式 (3字节): [控制类型][长度][错误码] ← 错误码在第三字节！
    // 其他命令响应格式: [错误码] ← 错误码在第一字节
    let result: ABMateResult;
    
    if (packet.cmd === ABMateCommand.MUSIC_SET) {
      // MUSIC_SET 的错误码在 payload[2]，不是 payload[0]
      // payload[0] = 控制类型 (例如: 1 = A2DP_CTL_VOICE)
      // payload[1] = 长度 (例如: 1)
      // payload[2] = 错误码 (0 = 成功, 1 = 失败)
      result = packet.payload.length > 2 ? (packet.payload[2] as ABMateResult) : ABMateResult.FAIL;
      console.log(`   [MUSIC_SET 响应详解] payload: [${Array.from(packet.payload).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
      console.log(`   控制类型=${packet.payload[0]}, 长度=${packet.payload[1]}, 错误码=${result}`);
    } else {
      // 其他命令：错误码在第一字节
      result = packet.payload[0] as ABMateResult;
    }
    
    const cmdHex = `0x${packet.cmd.toString(16).padStart(2, '0')}`;
    
    // 获取命令名称
    const cmdNames: Record<number, string> = {
      0x20: 'EQ_SET',
      0x21: 'MUSIC_SET',
      0x22: 'KEY_SET',
      0x23: 'POWER_OFF_SET',
      0x24: 'DEVICE_RESET',
      0x25: 'MODE_SET',
      0x26: 'IN_EAR_SET',
      0x27: 'DEVICE_INFO_GET',
      0x28: 'DEVICE_INFO_NOTIFY',
      0x29: 'LANGUAGE_SET',
      0x2A: 'DEVICE_FIND',
      0x2B: 'AUTO_ANSWER_SET',
      0x2C: 'ANC_SET',
      0x2D: 'BT_NAME_SET',
      0x2E: 'LED_SET',
      0x2F: 'BT_LINK_INFO_CLEAR',
      0x30: 'ANC_LEVEL_SET',
      0x31: 'TP_LEVEL_SET',
      0x32: 'V3D_AUDIO_SET',
      0xE0: 'CUSTOM',
    };
    
    const cmdName = cmdNames[packet.cmd] || '未知命令';
    
    if (result === ABMateResult.SUCCESS) {
      console.log(`✅ 命令 ${cmdName} (${cmdHex}) 执行成功`);
    } else {
      console.warn(
        `⚠️  命令 ${cmdName} (${cmdHex}) 执行失败\n` +
        `   错误码: ${result}\n` +
        `   可能原因: ` +
        (packet.cmd === 0x27 ? '查询信息格式错误或设备不支持' :
         packet.cmd === 0x2C ? 'ANC模式值无效' :
         packet.cmd === 0x20 ? 'EQ设置参数错误' :
         packet.cmd === 0x2A ? '设备查找参数无效' :
         packet.cmd === 0x21 ? '音量值无效(0-100)' :
         '设备处理失败')
      );
    }

    // 处理特定命令的响应
    this.handleCommandResponse(packet);
  }

  /**
   * 处理特定命令的响应数据
   */
  private handleCommandResponse(packet: ABMatePacket): void {
    const { cmd, payload } = packet;

    try {
      switch (cmd) {
        case ABMateCommand.DEVICE_INFO_GET:
        case ABMateCommand.DEVICE_INFO_NOTIFY:
          this.parseDeviceInfo(payload);
          break;

        case ABMateCommand.EQ_GET:
        case ABMateCommand.EQ_NOTIFY:
          if (payload.length >= 11) {
            const mode = payload[0];
            const gains = Array.from(payload.slice(1, 11)).map(g => g - 12);
            this.callbacks.onEQChanged?.({ mode, gains });
            console.log(`🎵 EQ 已更新: 模式=${mode}, 增益=${gains}`);
          }
          break;

        case ABMateCommand.BATT_GET:
        case ABMateCommand.BATT_NOTIFY:
          if (payload.length >= 3) {
            this.callbacks.onBatteryUpdated?.(payload[0], payload[1], payload[2]);
            console.log(`🔋 电池: L=${payload[0]}% R=${payload[1]}% Case=${payload[2]}%`);
          }
          break;

        case ABMateCommand.ANC_LEVEL_GET:
        case ABMateCommand.ANC_LEVEL_NOTIFY:
          if (payload.length >= 2) {
            this.callbacks.onANCModeChanged?.(payload[0], payload[1]);
            console.log(`🔊 ANC: 模式=${payload[0]} 等级=${payload[1]}`);
          }
          break;

        case ABMateCommand.MUSIC_SET:
          // 音量命令响应格式: [控制类型][长度][错误码]
          // 注意：响应中不包含音量值，只包含错误码
          // 音量值已在 setVolume() 中同步更新
          if (payload.length >= 3 && payload[0] === 0x01) {
            const resultCode = payload[2];
            if (resultCode === ABMateResult.SUCCESS) {
              console.log(`✅ 音量设置成功`);
            } else {
              console.warn(`⚠️  音量设置失败，错误码: ${resultCode}`);
            }
          }
          break;

        default:
          console.log(`📦 收到命令 ${`0x${cmd.toString(16)}`.padStart(4, '0x')} 响应`);
      }
    } catch (error) {
      console.error(`❌ 处理命令响应失败:`, error);
    }
  }

  /**
   * 处理通知
   */
  private handleNotify(packet: ABMatePacket): void {
    switch (packet.cmd) {
      case ABMateCommand.DEVICE_INFO_NOTIFY:
        this.parseDeviceInfo(packet.payload);
        break;
      
      case ABMateCommand.MUSIC_SET:
        // 音量变化通知（TLV格式：Type=0x01, Length, Value）
        if (packet.payload.length >= 3 && packet.payload[0] === 0x01) {
          this.deviceInfo.volume = packet.payload[2];
          this.callbacks.onVolumeChanged?.(packet.payload[2]);
        }
        break;

      case ABMateCommand.ANC_SET:
        this.deviceInfo.ancMode = packet.payload[0] as ABMateANCMode;
        this.callbacks.onANCModeChanged?.(
          this.deviceInfo.ancMode,
          this.deviceInfo.ancLevel || 0
        );
        break;

      case ABMateCommand.EQ_SET:
        this.parseEQInfo(packet.payload);
        break;

      default:
        console.log('未处理的通知命令:', packet.cmd);
    }

    // 触发设备信息更新回调
    this.callbacks.onDeviceInfoUpdated?.(this.deviceInfo);
  }

  /**
   * 解析设备信息（TLV 格式）
   * 格式: [TYPE(1B)] [LENGTH(1B)] [VALUE(length B)] ...
   */
  private parseDeviceInfo(payload: Uint8Array): void {
    let offset = 0;
    const parsedItems: { type: number; typeStr: string; length: number; value: string }[] = [];
    
    console.log(`📋 开始解析设备信息载荷，总长度: ${payload.length} 字节`);
    console.log(`   载荷数据: ${Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    try {
      while (offset < payload.length) {
        // 检查是否有足够的字节用于 TYPE 和 LENGTH
        if (offset + 1 >= payload.length) {
          console.warn(
            `⚠️  载荷数据不完整 (缺少LENGTH字段):\n` +
            `   offset=${offset}, 总长度=${payload.length}`
          );
          break;
        }

        const type = payload[offset];
        const len = payload[offset + 1];
        offset += 2;  // 先移动到VALUE部分
        
        // 增强的边界检查
        if (len === 0) {
          // LENGTH为0，表示没有VALUE数据，这是合法的（比如查询命令）
          console.log(`   ℹ️  TLV项: type=0x${type.toString(16).padStart(2, '0')}, len=0 (无数据)`);
          continue;
        }
        
        // 检查是否有足够的字节用于 VALUE
        if (offset + len > payload.length) {
          console.error(
            `❌ TLV 数据越界:\n` +
            `   type=0x${type.toString(16).padStart(2, '0')}\n` +
            `   len=${len} (VALUE应该占${len}字节)\n` +
            `   offset=${offset} (当前位置)\n` +
            `   需要字节到: ${offset + len}\n` +
            `   总长度: ${payload.length}\n` +
            `   差距: ${offset + len - payload.length} 字节`
          );
          break;
        }

        const data = payload.slice(offset, offset + len);
        offset += len;

        let typeStr = '未知';
        let logValue = '';

        switch (type) {
          case 0x01: // INFO_POWER - 电池电量
            typeStr = 'INFO_POWER (电池)';
            if (data.length >= 3) {
              this.deviceInfo.leftBattery = data[0];
              this.deviceInfo.rightBattery = data[1];
              this.deviceInfo.caseBattery = data[2];
              logValue = `L:${data[0]}% R:${data[1]}% B:${data[2]}%`;
              this.callbacks.onBatteryUpdated?.(data[0], data[1], data[2]);
            } else if (data.length >= 2) {
              this.deviceInfo.leftBattery = data[0];
              this.deviceInfo.rightBattery = data[1];
              logValue = `L:${data[0]}% R:${data[1]}%`;
            }
            break;
          
          case 0x02: // INFO_VERSION - 固件版本
            typeStr = 'INFO_VERSION (版本)';
            this.deviceInfo.firmwareVersion = this.parseVersion(data);
            logValue = this.deviceInfo.firmwareVersion;
            break;

          case 0x03: // INFO_BT_NAME - 蓝牙名称
            typeStr = 'INFO_BT_NAME (蓝牙名)';
            this.deviceInfo.bluetoothName = new TextDecoder().decode(data);
            logValue = this.deviceInfo.bluetoothName;
            break;

          case 0x04: // INFO_EQ - EQ 设置
            typeStr = 'INFO_EQ (EQ设置)';
            if (data.length >= 11) {
              this.deviceInfo.eqMode = data[0] as ABMateEQMode;
              logValue = `Mode:${data[0]}, Gains: ${Array.from(data.slice(1, 11)).map((g, i) => `${i}:${g - 12}`).join(' ')}`;
            }
            break;

          case 0x05: // INFO_KEY - 按键映射
            typeStr = 'INFO_KEY (按键)';
            logValue = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
            break;

          case 0x06: // INFO_VOL - 音量
            typeStr = 'INFO_VOL (音量)';
            this.deviceInfo.volume = data[0];
            logValue = `${data[0]}%`;
            break;

          case 0x07: // INFO_PLAY_STA - 播放状态
            typeStr = 'INFO_PLAY_STA (播放状态)';
            this.deviceInfo.playState = data[0] === 1;
            logValue = data[0] === 1 ? '播放中' : '暂停';
            break;

          case 0x08: // INFO_LATENCY_MODE - 延迟模式
            typeStr = 'INFO_LATENCY_MODE (延迟)';
            logValue = `Mode: ${data[0]}`;
            break;

          case 0x09: // INFO_IN_EAR_EN - 入耳检测
            typeStr = 'INFO_IN_EAR_EN (入耳检测)';
            this.deviceInfo.inEarEnabled = data[0] === 1;
            logValue = data[0] === 1 ? '启用' : '禁用';
            break;

          case 0x0a: // INFO_LANGUAGE - 语言
            typeStr = 'INFO_LANGUAGE (语言)';
            logValue = data[0] === 0 ? '中文' : data[0] === 1 ? '英文' : `其他(${data[0]})`;
            break;

          case 0x0c: // INFO_ANC - ANC 模式
            typeStr = 'INFO_ANC (ANC模式)';
            this.deviceInfo.ancMode = data[0] as ABMateANCMode;
            logValue = data[0] === 0 ? '关闭' : data[0] === 1 ? '启用' : data[0] === 2 ? '透传' : `未知(${data[0]})`;
            break;

          case 0x0f: // INFO_LED - LED
            typeStr = 'INFO_LED (LED)';
            this.deviceInfo.ledEnabled = data[0] === 1;
            logValue = data[0] === 1 ? '启用' : '禁用';
            break;

          case 0x11: // INFO_TWS_STA - TWS 连接状态
            typeStr = 'INFO_TWS_STA (TWS状态)';
            this.deviceInfo.twsConnected = data[0] === 1;
            logValue = data[0] === 1 ? '已连接' : '未连接';
            break;

          case 0x18: // INFO_V3D_AUDIO - 3D 音效
            typeStr = 'INFO_V3D_AUDIO (3D音效)';
            this.deviceInfo.v3dAudioEnabled = data[0] === 1;
            logValue = data[0] === 1 ? '启用' : '禁用';
            break;

          case 0x23: // INFO_BT_STA - 蓝牙连接状态
            typeStr = 'INFO_BT_STA (蓝牙状态)';
            logValue = data[0] === 1 ? '已连接' : '未连接';
            break;

          case 0xfe: // INFO_DEV_CAP - 设备能力
            typeStr = 'INFO_DEV_CAP (设备能力)';
            logValue = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
            break;

          case 0xff: // INFO_MTU - MTU 大小
            typeStr = 'INFO_MTU (MTU大小)';
            logValue = `${data[0]} 字节`;
            break;

          default:
            typeStr = `未知类型 (0x${type.toString(16).padStart(2, '0')})`;
            logValue = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        }

        parsedItems.push({ type, typeStr, length: len, value: logValue });
        console.log(`   ✓ ${typeStr}: ${logValue}`);
      }

      console.log(`✅ 设备信息解析完成，共 ${parsedItems.length} 项`);
      console.log('📊 解析结果:', this.deviceInfo);
    } catch (error) {
      console.error('❌ 解析设备信息失败:', error);
      console.error('   调试信息:', { offset, payloadLen: payload.length, error });
    }

    // 触发设备信息更新回调
    this.callbacks.onDeviceInfoUpdated?.(this.deviceInfo);
  }

  /**
   * 解析 EQ 信息
   */
  private parseEQInfo(payload: Uint8Array): void {
    if (payload.length >= 11) {
      const mode = payload[0] as ABMateEQMode;
      const gains = Array.from(payload.slice(1, 11)).map(g => g - 12);
      
      this.deviceInfo.eqMode = mode;
      this.callbacks.onEQChanged?.({ mode, gains });
    }
  }

  /**
   * 解析版本号
   */
  private parseVersion(data: Uint8Array): string {
    if (data.length >= 3) {
      return `${data[0]}.${data[1]}.${data[2]}`;
    }
    return 'Unknown';
  }
}
