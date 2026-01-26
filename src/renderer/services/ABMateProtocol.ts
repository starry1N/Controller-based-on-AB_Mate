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

  // 发送队列：确保命令按顺序发送（使用双向队列优化）
  private sendQueue: Array<{
    packet: Uint8Array;
    resolve: (data: Uint8Array | null) => void;
    reject: (error: Error) => void;
    timeoutMs: number;
    cmd: number;  // 命令码，用于去重优化
    priority?: boolean;  // 是否优先处理
  }> = [];
  private isSending: boolean = false;
  private maxQueueSize: number = 10;  // 队列最大长度

  /**
   * 获取下一个序列号（0-15 循环）
   * 注意：序列号是 4 位字段，范围应该是 0-15
   * 
   * ⚠️ 关键逻辑：
   * 初始查询SEQ为0（不递增），之后每次发送APP会递增SEQ
   * 设备对初始查询的响应SEQ也是0，对后续请求的响应SEQ = 请求SEQ
   */
  private getNextSeq(): number {
    // 返回当前SEQ，发送数据包后再递增
    return this.seq;
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
        0x06,  // INFO_VOL - 音量 ✅ 新增：初次连接时获取音量
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
    // ✅ 修复：12字节payload格式 [band_cnt][mode][gain0-gain9]
    const payload = new Uint8Array(12);
    payload[0] = 10;  // band_cnt = 10
    payload[1] = config.mode;  // mode
    
    // 10 段增益值 (-12 到 +12 转换为 0-24)
    for (let i = 0; i < 10; i++) {
      payload[i + 2] = Math.max(0, Math.min(24, config.gains[i] + 12));
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
    
    // ✅ 乐观UI：立即更新本地音量值，不等待设备响应
    this.deviceInfo.volume = vol;
    this.callbacks.onVolumeChanged?.(vol);
    
    const payload = new Uint8Array([
      0x01,  // Type: A2DP_CTL_VOICE (音量控制)
      0x01,  // Length: 1字节
      vol    // Value: 音量值 0-100
    ]);
    const packet = this.buildPacket(ABMateCommand.MUSIC_SET, ABMateCommandType.REQUEST, payload);
    
    // 使用高优先级发送，快速滑动时会去重
    await this.sendAndWaitWithPriority(packet, 5000, true);
  }

  /**
   * 设置工作模式（普通/游戏）
   */
  async setDeviceMode(mode: ABMateDeviceMode): Promise<void> {
    // 立即同步本地设备状态（乐观更新）
    console.log(`[setDeviceMode] Switching to: ${mode === ABMateDeviceMode.GAME ? 'GAME' : 'NORMAL'}`);
    this.deviceInfo.deviceMode = mode;
    
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
   * @param side 查找类型：
   *   - 'stop': 停止所有查找 (payload=0x00)
   *   - 'both': 两耳同时蜂鸣 (payload=0x01)
   *   - 'left': 启动左耳蜂鸣 (payload=0x02)
   *   - 'right': 启动右耳蜂鸣 (payload=0x04)
   * 
   * ⚠️ 注意：设备固件中的payload值定义如下:
   *   DEVICE_FIND_STOP = 0x00      // 停止查找
   *   DEVICE_FIND_START = 0x01     // 全设备查找
   *   DEVICE_FIND_START_L = 0x02   // 启动左耳
   *   DEVICE_FIND_STOP_L = 0x03    // 停止左耳
   *   DEVICE_FIND_START_R = 0x04   // 启动右耳
   *   DEVICE_FIND_STOP_R = 0x05    // 停止右耳
   */
  async findDevice(side: 'left' | 'right' | 'both' | 'stop'): Promise<void> {
    let payload: number;
    switch (side) {
      case 'stop': payload = 0x00; break;   // DEVICE_FIND_STOP
      case 'both': payload = 0x01; break;   // DEVICE_FIND_START
      case 'left': payload = 0x02; break;   // DEVICE_FIND_START_L
      case 'right': payload = 0x04; break;  // DEVICE_FIND_START_R
      default: throw new Error(`Invalid side: ${side}`);
    }
    const packet = this.buildPacket(ABMateCommand.DEVICE_FIND, ABMateCommandType.REQUEST, new Uint8Array([payload]));
    await this.sendAndWait(packet);
  }

  /**
   * 启动设备查找
   * 对应的停止操作使用 stopFindDevice()
   * 
   * @param target 查找目标：
   *   - 'left': 启动左耳蜂鸣 (DEVICE_FIND_START_L = 0x02)
   *   - 'right': 启动右耳蜂鸣 (DEVICE_FIND_START_R = 0x04)
   *   - 'both': 两耳同时蜂鸣 (DEVICE_FIND_START = 0x01)
   */
  async startFindDevice(target: 'left' | 'right' | 'both'): Promise<void> {
    let payload: number;
    switch (target) {
      case 'both': payload = 0x01; break;   // DEVICE_FIND_START
      case 'left': payload = 0x02; break;   // DEVICE_FIND_START_L
      case 'right': payload = 0x04; break;  // DEVICE_FIND_START_R
      default: throw new Error(`Invalid target: ${target}`);
    }
    const packet = this.buildPacket(ABMateCommand.DEVICE_FIND, ABMateCommandType.REQUEST, new Uint8Array([payload]));
    await this.sendAndWait(packet);
  }

  /**
   * 停止设备查找
   * 
   * @param target 停止目标：
   *   - 'left': 停止左耳蜂鸣 (DEVICE_FIND_STOP_L = 0x03)
   *   - 'right': 停止右耳蜂鸣 (DEVICE_FIND_STOP_R = 0x05)
   *   - 'all': 停止所有查找 (DEVICE_FIND_STOP = 0x00)
   */
  async stopFindDevice(target: 'left' | 'right' | 'all' = 'all'): Promise<void> {
    let payload: number;
    switch (target) {
      case 'all': payload = 0x00; break;    // DEVICE_FIND_STOP
      case 'left': payload = 0x03; break;   // DEVICE_FIND_STOP_L
      case 'right': payload = 0x05; break;  // DEVICE_FIND_STOP_R
      default: throw new Error(`Invalid target: ${target}`);
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
   * OTA升级固件
   * @param file 固件文件
   */
  async startOTAUpgrade(file: File): Promise<void> {
    console.log(`🔄 OTA升级开始: ${file.name}, 大小: ${file.size} 字节`);
    
    // 读取文件数据
    const fileData = await this.readFileAsArrayBuffer(file);
    const fileBytes = new Uint8Array(fileData);
    
    // 步骤1: 发送OTA请求 (CMD_OTA_REQ 0xA0)
    // 载荷格式: [文件大小(4B)][CRC32(4B)]
    const fileSize = fileBytes.length;
    const crc32 = this.calculateCRC32(fileBytes);
    
    const otaReqPayload = new Uint8Array(8);
    otaReqPayload[0] = fileSize & 0xFF;
    otaReqPayload[1] = (fileSize >> 8) & 0xFF;
    otaReqPayload[2] = (fileSize >> 16) & 0xFF;
    otaReqPayload[3] = (fileSize >> 24) & 0xFF;
    otaReqPayload[4] = crc32 & 0xFF;
    otaReqPayload[5] = (crc32 >> 8) & 0xFF;
    otaReqPayload[6] = (crc32 >> 16) & 0xFF;
    otaReqPayload[7] = (crc32 >> 24) & 0xFF;
    
    const otaReqPacket = this.buildPacket(ABMateCommand.OTA_REQ, ABMateCommandType.REQUEST, otaReqPayload);
    console.log(`📤 发送OTA请求: 文件大小=${fileSize}, CRC32=0x${crc32.toString(16).padStart(8, '0')}`);
    
    console.log(`🔍 OTA_REQ 诊断信息:`);
    console.log(`   - 报文长度: ${otaReqPacket.length} 字节`);
    console.log(`   - 报文数据: ${Array.from(otaReqPacket).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    console.log(`   - 当前SEQ: ${this.seq}`);
    console.log(`   - 待处理请求: ${this.pendingRequests.size}`);
    
    let response = null;
    try {
      response = await this.sendAndWait(otaReqPacket, 10000);
    } catch (error) {
      console.error(`❌ OTA_REQ发送异常:`, error);
      throw new Error(`OTA请求发送失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    
    if (!response) {
      // 响应为null，可能是超时
      console.error(`❌ OTA_REQ无响应 - 设备可能不支持OTA或未正确处理`);
      console.error(`   💡 诊断建议:`);
      console.error(`      1. 检查设备固件是否启用了 AB_MATE_OTA_EN`);
      console.error(`      2. 检查OTA_REQ载荷格式 (当前: 8字节文件大小+CRC32)`);
      console.error(`      3. 在设备端添加printf日志检查是否收到命令`);
      console.error(`      4. 尝试重启设备`);
      throw new Error(`OTA请求失败: 设备无响应，请检查固件是否支持OTA (AB_MATE_OTA_EN)`);
    }
    
    if (response[0] !== 0) {
      const errorCode = response[0];
      const errorMsg = this.getOTAErrorMessage(errorCode);
      console.error(`❌ OTA请求被拒绝 - 错误码: ${errorCode} (${errorMsg})`);
      throw new Error(`OTA请求失败: ${errorMsg} (错误码=${errorCode})`);
    }
    
    console.log('✅ OTA请求成功，开始传输数据...');
    
    // 步骤2: 分块传输固件数据（考虑BLE MTU限制）
    // BLE标准MTU为251字节，减去头部7字节，实际可用约244字节
    // 考虑分帧信息(8字节: 地址4B + 长度4B)，每块最多236字节
    const BLOCK_SIZE = 236;  // 单块最大数据字节数
    const OTA_PACKET_DELAY_MS = 30;  // 数据包发送间隔，避免GATT操作忙碌 (可调: 20-50ms)
    const totalBlocks = Math.ceil(fileSize / BLOCK_SIZE);
    let offset = 0;
    let blockIndex = 0;
    
    while (offset < fileSize) {
      const remainingBytes = fileSize - offset;
      const blockSize = Math.min(BLOCK_SIZE, remainingBytes);
      const blockData = fileBytes.slice(offset, offset + blockSize);
      
      // 构建数据包载荷
      // 格式: [地址(4B)][数据长度(4B)][数据(N B)]
      const dataPayload = new Uint8Array(8 + blockSize);
      dataPayload[0] = offset & 0xFF;
      dataPayload[1] = (offset >> 8) & 0xFF;
      dataPayload[2] = (offset >> 16) & 0xFF;
      dataPayload[3] = (offset >> 24) & 0xFF;
      dataPayload[4] = blockSize & 0xFF;
      dataPayload[5] = (blockSize >> 8) & 0xFF;
      dataPayload[6] = (blockSize >> 16) & 0xFF;
      dataPayload[7] = (blockSize >> 24) & 0xFF;
      dataPayload.set(blockData, 8);
      
      const cmd = blockIndex === 0 ? ABMateCommand.OTA_DATA_START : ABMateCommand.OTA_DATA_CONTINUE;
      
      // 检查是否需要分帧（如果载荷超过250字节）
      if (dataPayload.length > 250) {
        // 分帧传输大数据包
        const frameSize = 240;  // 每帧240字节（留出10字节安全余量）
        const totalFrames = Math.ceil(dataPayload.length / frameSize);
        
        console.log(`📤 发送数据块 ${blockIndex + 1}/${totalBlocks} (分${totalFrames}帧): 地址=0x${offset.toString(16)}, 总长度=${dataPayload.length}`);
        
        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          const frameStart = frameIdx * frameSize;
          const frameEnd = Math.min(frameStart + frameSize, dataPayload.length);
          const frameData = dataPayload.slice(frameStart, frameEnd);
          
          const dataPacket = this.buildPacket(cmd, ABMateCommandType.REQUEST, frameData, {
            frameSeq: frameIdx,
            frameTotal: totalFrames - 1,
          });
          
          const isLastFrame = frameIdx === totalFrames - 1;
          
          if (isLastFrame) {
            // 最后一帧：等待设备响应
            try {
              const dataResponse = await this.sendAndWait(dataPacket, 10000);
              if (!dataResponse || dataResponse[0] !== 0) {
                throw new Error(`数据传输失败 (块${blockIndex + 1}, 帧${frameIdx + 1}/${totalFrames}): ${dataResponse ? `错误码=${dataResponse[0]}` : '无响应'}`);
              }
              console.log(`   ✓ 帧 ${frameIdx + 1}/${totalFrames} 传输成功 (最后一帧)`);
            } catch (error) {
              console.error(`❌ OTA数据传输失败:`, error);
              // 尝试同步恢复
              const syncOk = await this.syncWithDevice();
              if (!syncOk) {
                throw new Error(`OTA数据传输中断，同步失败`);
              }
              throw error;
            }
          } else {
            // 中间帧：直接发送，不等待响应
            this.sendPacket(dataPacket);
            console.log(`   → 帧 ${frameIdx + 1}/${totalFrames} 已发送 (不等待响应)`);
            
            // 避免GATT操作忙碌，帧之间添加延迟
            await this.delay(OTA_PACKET_DELAY_MS);
          }
        }
      } else {
        // 单帧传输
        const dataPacket = this.buildPacket(cmd, ABMateCommandType.REQUEST, dataPayload);
        
        const progress = ((offset + blockSize) / fileSize * 100).toFixed(1);
        console.log(`📤 发送数据块 ${blockIndex + 1}/${totalBlocks} (${progress}%): 地址=0x${offset.toString(16)}, 长度=${blockSize}`);
        
        // OTA数据块传输不需要等待响应，直接发送
        this.sendPacket(dataPacket);
        
        // 避免GATT操作忙碌，块之间添加延迟
        if (offset + blockSize < fileSize) {
          await this.delay(OTA_PACKET_DELAY_MS);
        }
      }
      
      offset += blockSize;
      blockIndex++;
      
      // 触发进度回调
      this.callbacks.onOTAProgress?.(Math.round((offset / fileSize) * 100));
    }
    
    console.log('✅ 固件数据传输完成');
    
    // 等待设备验证并重启
    console.log('⏳ 等待设备验证固件...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ OTA升级完成');
  }

  /**
   * 获取OTA错误消息
   */
  private getOTAErrorMessage(errorCode: number): string {
    const errorMap: { [key: number]: string } = {
      0: '成功',
      1: '失败',
      2: '设备已连接通话',
      3: '文件大小超限',
      4: '版本号不符',
      5: 'CRC校验失败',
      6: '序列号错误',
      255: '未知错误',
    };
    return errorMap[errorCode] || `未定义的错误(${errorCode})`;
  }

  /**
   * 读取文件为ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 计算CRC32校验和
   */
  private calculateCRC32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      crc = crc ^ byte;
      
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xEDB88320;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
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
   * 同步设备连接状态和序列号
   * 当发生 GATT 错误时调用此方法来重新对齐 APP 和设备的 SEQ
   * 
   * 原理：通过查询一个简单的信息（MTU）来验证连接
   * 设备响应会包含当前的序列号，APP可以据此重新计算正确的SEQ
   */
  async syncWithDevice(): Promise<boolean> {
    try {
      console.log('🔄 开始同步设备连接状态...');
      
      // 等待100ms让BLE恢复
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 查询MTU来确认连接
      const response = await this.queryDeviceInfoWithSync([0xFF]);  // 0xFF = INFO_MTU
      
      if (response) {
        console.log('✅ 设备同步成功，连接已恢复');
        return true;
      } else {
        console.warn('❌ 设备同步失败，连接可能已断开');
        return false;
      }
    } catch (error) {
      console.error('❌ 同步过程错误:', error);
      return false;
    }
  }

  /**
   * 带同步的设备信息查询
   * 用于恢复 GATT 错误后重新同步序列号
   */
  private async queryDeviceInfoWithSync(infoTypes: number[]): Promise<Uint8Array | null> {
    try {
      // 构建 TLV 载荷
      const payload = new Uint8Array(infoTypes.length * 2);
      for (let i = 0; i < infoTypes.length; i++) {
        payload[i * 2] = infoTypes[i];      // 信息类型
        payload[i * 2 + 1] = 0;             // 长度=0（查询）
      }

      const packet = this.buildPacket(
        ABMateCommand.DEVICE_INFO_GET,
        ABMateCommandType.REQUEST,
        payload
      );
      
      // 记录发送前的SEQ
      const sendSeq = packet[2] & 0x0F;
      console.log(`   📤 同步查询 SEQ=${sendSeq}, 期望响应 SEQ=${sendSeq}`);
      
      const response = await this.sendAndWait(packet, 3000);
      if (response) {
        console.log(`   ✅ 收到同步响应，共 ${response.length} 字节`);
        return response;
      } else {
        console.warn(`   ⚠️  同步查询超时，SEQ=${sendSeq}`);
        return null;
      }
    } catch (error) {
      console.error('   ❌ 同步查询异常:', error);
      return null;
    }
  }

  /**
   * 发送数据包并等待响应（带队列管理和 GATT 错误处理）
   */
  private async sendAndWait(packet: Uint8Array, timeoutMs: number = 5000): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      // 提取命令码
      const cmd = packet.length >= 4 ? packet[3] : 0;
      
      // 将请求加入队列
      this.sendQueue.push({
        packet,
        resolve,
        reject,
        timeoutMs,
        cmd,
      });

      // 触发队列处理
      this.processSendQueue();
    });
  }

  /**
   * 发送高优先级数据包（用于音量等需要去重的命令）
   */
  private async sendAndWaitWithPriority(
    packet: Uint8Array, 
    timeoutMs: number = 5000,
    deduplicate: boolean = false
  ): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const cmd = packet.length >= 4 ? packet[3] : 0;
      
      // 🔥 智能去重：如果是音量命令，移除队列中旧的音量命令
      if (deduplicate && cmd === ABMateCommand.MUSIC_SET) {
        const removedCount = this.sendQueue.length;
        this.sendQueue = this.sendQueue.filter(item => {
          // 保留非音量命令
          if (item.cmd !== ABMateCommand.MUSIC_SET) {
            return true;
          }
          // 拒绝旧的音量命令（避免 Promise 悬挂）
          item.reject(new Error('Command superseded by newer volume command'));
          return false;
        });
        
        if (removedCount > this.sendQueue.length) {
          console.log(`🗑️ 移除 ${removedCount - this.sendQueue.length} 个过时的音量命令`);
        }
      }
      
      // 队列长度限制（保留最新的命令）
      if (this.sendQueue.length >= this.maxQueueSize) {
        const oldest = this.sendQueue.shift();
        oldest?.reject(new Error('Queue overflow - command dropped'));
        console.warn(`⚠️ 队列已满，丢弃最旧命令`);
      }
      
      // 将请求加入队列
      this.sendQueue.push({
        packet,
        resolve,
        reject,
        timeoutMs,
        cmd,
        priority: true,
      });

      // 触发队列处理
      this.processSendQueue();
    });
  }

  /**
   * 处理发送队列（确保命令按顺序发送）
   */
  private async processSendQueue(): Promise<void> {
    // 如果正在发送，等待当前发送完成
    if (this.isSending) {
      return;
    }

    // 如果队列为空，退出
    if (this.sendQueue.length === 0) {
      return;
    }

    // 标记为正在发送
    this.isSending = true;

    // 取出队列头部的请求
    const request = this.sendQueue.shift()!;
    const { packet, resolve, reject, timeoutMs } = request;

    try {
      const seq = packet[2] & 0x0F;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const result = await this.sendAndWaitInternal(packet, timeoutMs);
          resolve(result);
          break; // 成功，退出重试循环
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // 检查是否为 GATT operation already in progress 错误
          if (errorMsg.includes('GATT operation already in progress')) {
            retryCount++;
            console.warn(`⚠️  GATT 操作正在进行中 (${retryCount}/${maxRetries})，等待后重试...`);
            
            if (retryCount < maxRetries) {
              // 等待一段时间后重试
              await new Promise(r => setTimeout(r, 300 * retryCount));
              continue;
            } else {
              console.error(`❌ GATT 操作重试 ${maxRetries} 次后仍失败，尝试同步...`);
              // 最后一次重试失败，尝试同步
              const syncSuccess = await this.syncWithDevice();
              if (!syncSuccess) {
                this.callbacks.onError?.(new Error('GATT 连接异常，设备可能已断开'));
                resolve(null);
                break;
              }
              // 同步成功后再重试一次
              retryCount++;
              if (retryCount < maxRetries) {
                const result = await this.sendAndWaitInternal(packet, timeoutMs);
                resolve(result);
                break;
              }
            }
          } else {
            // 其他错误直接拒绝
            reject(error instanceof Error ? error : new Error(String(error)));
            break;
          }
        }
      }
      
      // 如果达到最大重试次数仍失败
      if (retryCount >= maxRetries) {
        resolve(null);
      }
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      // 标记为发送完成
      this.isSending = false;

      // 处理队列中的下一个请求
      if (this.sendQueue.length > 0) {
        // 短暂延迟后处理下一个，避免发送过快
        setTimeout(() => this.processSendQueue(), 10);
      }
    }
  }

  /**
   * 实际的发送和等待实现
   */
  private async sendAndWaitInternal(packet: Uint8Array, timeoutMs: number = 5000): Promise<Uint8Array | null> {
    const seq = packet[2] & 0x0F; // 获取序列号（字节2的位0-3）

    return new Promise((resolve, reject) => {
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
          reject(error);
        },
        timeout,
      });

      // 发送数据包
      this.bleService.writeWithoutResponse(packet).catch((error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(seq);
        reject(error);
      });
      // 发送后递增SEQ
      this.seq = (this.seq + 1) & 0x0F;

      const cmd = packet[3];
      const type = packet[4];
      const frameSeq = packet[5] & 0x0F;
      const frameTotal = (packet[5] >> 4) & 0x0F;
      const payloadLen = packet[6];
      console.log(`📤 发送命令: [TAG:AB23] [SEQ:${seq}] [CMD:0x${cmd.toString(16).padStart(2, '0')}] [TYPE:${type}] [FRAME:${frameSeq}/${frameTotal}] [PAYLOAD_LEN:${payloadLen}]`);
      console.log(`   下一个SEQ值: ${this.seq}（已递增）`);
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
      // ⚠️ SEQ同步逻辑：
      // - 初始查询SEQ=0，设备响应SEQ也=0（无递增）
      // - 之后APP每发送一个命令就递增SEQ，设备响应的SEQ = 请求SEQ
      // - 精确匹配：响应SEQ = 待处理请求SEQ
      let matchedSeq: number | null = null;
      
      if (packet.type === ABMateCommandType.RESPONSE) {
        const pendingSeqs = Array.from(this.pendingRequests.keys());
        console.log(`   待处理请求SEQ列表: ${pendingSeqs.length === 0 ? '[]（无待处理）' : '[' + pendingSeqs.join(', ') + ']'}`);
        
        // 策略1: 精确匹配：响应SEQ = 请求SEQ
        if (this.pendingRequests.has(packet.seq)) {
          matchedSeq = packet.seq;
          console.log(`   ✓ 序列号精确匹配: ${packet.seq}`);
        } 
        // 策略2: 如果精确匹配失败且有待处理请求，使用最早的请求（FIFO）
        else if (pendingSeqs.length > 0) {
          matchedSeq = pendingSeqs[0]; // 取第一个（最早的）
          console.warn(`   ⚠️  SEQ不匹配，使用FIFO策略: 响应SEQ=${packet.seq}, 匹配最早的请求SEQ=${matchedSeq}`);
        } 
        else {
          console.warn(`   ❌ 序列号匹配失败！`);
          console.warn(`      收到响应SEQ=${packet.seq}`);
          console.warn(`      待处理请求SEQ=${pendingSeqs.length === 0 ? '[]' : '[' + pendingSeqs.join(', ') + ']'}`);
        }

        if (matchedSeq !== null) {
          const pending = this.pendingRequests.get(matchedSeq);
          this.pendingRequests.delete(matchedSeq);
          clearTimeout(pending?.timeout);
          pending?.resolve(packet.payload);
          console.log(`✅ 序列号 ${matchedSeq} 的请求已匹配响应`);
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
            console.warn(`   💡 序列号对应失败，可能是SEQ同步异常`);
          }
        }
      }

      // 根据命令类型处理
      if (packet.type === ABMateCommandType.RESPONSE) {
        this.handleResponse(packet);
        // ⚠️ RESPONSE类型：SEQ不递增，因为这是对APP发送的命令的响应
        console.log(`   📥 收到RESPONSE（SEQ不递增）: ${packet.seq}`);
      } else if (packet.type === ABMateCommandType.NOTIFY) {
        this.handleNotify(packet);
        // ⚠️ NOTIFY类型：SEQ递增，因为这是设备主动发送的通知，相当于一次新的通信
        this.seq = (this.seq + 1) & 0x0F;
        console.log(`   📢 收到NOTIFY（SEQ递增）: ${packet.seq} → APP_SEQ: ${this.seq}`);
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
      0xA0: 'OTA_REQ',
      0xA1: 'OTA_DATA_START',
      0xA2: 'OTA_DATA_CONTINUE',
      0xA3: 'OTA_STA',
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

        case ABMateCommand.ANC_SET:
          // ANC_SET 响应仅包含错误码（1字节）
          // 实际的ANC模式值已在 setANCMode() 中同步更新
          if (payload.length >= 1) {
            const resultCode = payload[0];
            if (resultCode === ABMateResult.SUCCESS) {
              console.log(`✅ ANC 模式设置成功`);
            } else {
              console.warn(`⚠️  ANC 模式设置失败，错误码: ${resultCode}`);
            }
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

        case ABMateCommand.MODE_SET:
          // MODE_SET 响应仅包含错误码（1字节）
          // 实际的模式值已在 setDeviceMode() 中同步更新
          if (payload.length >= 1) {
            const resultCode = payload[0];
            if (resultCode === ABMateResult.SUCCESS) {
              console.log(`✅ 设备模式设置成功，当前模式: ${this.deviceInfo.deviceMode === ABMateDeviceMode.GAME ? '游戏' : '普通'}`);
              // 触发回调确保UI更新
              this.callbacks.onDeviceInfoUpdated?.(this.deviceInfo);
            } else {
              console.warn(`⚠️  设备模式设置失败，错误码: ${resultCode}`);
            }
          }
          break;

        case ABMateCommand.BT_NAME_SET:
          // BT_NAME_SET 响应仅包含错误码（1字节）
          // 响应格式: [PAYLOAD_LEN=1][RESULT_CODE]
          // 错误码: 0=成功, 1=失败
          if (payload.length >= 1) {
            const resultCode = payload[0] as ABMateResult;
            if (resultCode === ABMateResult.SUCCESS) {
              console.log(`✅ 蓝牙名称设置成功: "${this.deviceInfo.bluetoothName}"`);
              // 触发回调确保UI更新
              this.callbacks.onDeviceInfoUpdated?.(this.deviceInfo);
            } else {
              console.warn(
                `⚠️  蓝牙名称设置失败，错误码: ${resultCode}\n` +
                `   可能原因:\n` +
                `   1. 功能未启用 (AB_MATE_BT_NAME_EN=0)\n` +
                `   2. TWS连接异常 (左右耳未连接)\n` +
                `   3. 名称长度超过31字符\n` +
                `   4. 设备处理错误`
              );
            }
          }
          break;

        case ABMateCommand.OTA_REQ:
        case ABMateCommand.OTA_DATA_START:
        case ABMateCommand.OTA_DATA_CONTINUE:
          // OTA命令响应仅包含错误码（1字节）
          if (payload.length >= 1) {
            const resultCode = payload[0];
            if (resultCode === ABMateResult.SUCCESS) {
              console.log(`✅ OTA命令执行成功: 0x${cmd.toString(16)}`);
            } else {
              console.warn(`⚠️  OTA命令执行失败: 0x${cmd.toString(16)}, 错误码: ${resultCode}`);
            }
          }
          break;

        case ABMateCommand.OTA_STA:
          // OTA状态通知
          if (payload.length >= 1) {
            const status = payload[0];
            console.log(`📊 OTA状态: ${status}`);
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
        
        // 原始数据的十六进制表示
        const rawHex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');

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
            this.callbacks.onVolumeChanged?.(data[0]);  // ✅ 触发音量变化回调，更新UI
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
            // 蓝牙状态码定义（来自固件 api_btstack.h）
            const btStates: { [key: number]: string } = {
              0: 'OFF (模块已关闭)',
              1: 'INITING (初始化中)',
              2: 'IDLE (打开，未连接)',
              3: 'SCANNING (扫描中)',
              4: 'DISCONNECTING (断开中)',
              5: 'CONNECTING (连接中)',
              6: 'CONNECTED (已连接)', // ← 状态码 0x06
              7: 'PLAYING (播放中)',
              8: 'INCOMING (来电响铃)',
              9: 'OUTGOING (正在呼出)',
              10: 'INCALL (通话中)',
              11: 'RES (保留)',
              12: 'OTA (OTA升级中)',
            };
            logValue = btStates[data[0]] || `未知 (0x${data[0].toString(16).padStart(2, '0')})`;
            // 如果有扩展数据（电话号码等），一并显示
            if (len > 1) {
              const extData = Array.from(data.slice(1)).map(b => b.toString(16).padStart(2, '0')).join(' ');
              logValue += ` [扩展数据: ${extData}]`;
            }
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
        console.log(`   ✓ TYPE:0x${type.toString(16).padStart(2, '0')} ${typeStr}`);
        console.log(`     长度:${len}B 原始:${rawHex} 解析:${logValue}`);
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

  /**
   * 延迟指定毫秒数
   * @param ms 毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
