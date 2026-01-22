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
   * 获取下一个序列号（0-255）
   */
  private getNextSeq(): number {
    const currentSeq = this.seq & 0xFF;  // 确保在 0-255 范围内
    this.seq = (this.seq + 1) & 0xFF;
    return currentSeq;
  }

  constructor(bleService: BLEService) {
    this.bleService = bleService;

    // 监听 BLE 数据
    this.bleService.onData((data) => {
      this.handleReceivedData(data);
    });

    // 监听断开连接
    this.bleService.onDisconnect(() => {
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

      this.callbacks.onConnected?.();
      
      // 连接成功后查询设备信息
      setTimeout(() => {
        console.log('📤 延迟 500ms 后发送初始查询...');
        this.queryDeviceInfo();
      }, 500);
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
   */
  async queryDeviceInfo(): Promise<void> {
    const packet = this.buildPacket(ABMateCommand.DEVICE_INFO_GET, ABMateCommandType.REQUEST, new Uint8Array([0]));
    await this.sendPacket(packet);
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
    await this.sendPacket(packet);
  }

  /**
   * 设置 ANC 模式
   */
  async setANCMode(mode: ABMateANCMode): Promise<void> {
    const payload = new Uint8Array([mode]);
    const packet = this.buildPacket(ABMateCommand.ANC_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置 ANC 等级
   */
  async setANCLevel(level: number): Promise<void> {
    const payload = new Uint8Array([Math.max(0, Math.min(4, level))]);
    const packet = this.buildPacket(ABMateCommand.ANC_LEVEL_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置透传等级
   */
  async setTransparencyLevel(level: number): Promise<void> {
    const payload = new Uint8Array([Math.max(0, Math.min(3, level))]);
    const packet = this.buildPacket(ABMateCommand.TP_LEVEL_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置音量
   */
  async setVolume(volume: number): Promise<void> {
    const payload = new Uint8Array([Math.max(0, Math.min(100, volume))]);
    const packet = this.buildPacket(ABMateCommand.VOL_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置工作模式（普通/游戏）
   */
  async setDeviceMode(mode: ABMateDeviceMode): Promise<void> {
    const payload = new Uint8Array([mode]);
    const packet = this.buildPacket(ABMateCommand.MODE_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置入耳检测
   */
  async setInEarDetection(enabled: boolean): Promise<void> {
    const payload = new Uint8Array([enabled ? 1 : 0]);
    const packet = this.buildPacket(ABMateCommand.IN_EAR_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置 LED
   */
  async setLED(enabled: boolean): Promise<void> {
    const payload = new Uint8Array([enabled ? 1 : 0]);
    const packet = this.buildPacket(ABMateCommand.LED_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
  }

  /**
   * 设置 3D 音效
   */
  async set3DAudio(enabled: boolean): Promise<void> {
    const payload = new Uint8Array([enabled ? 1 : 0]);
    const packet = this.buildPacket(ABMateCommand.V3D_AUDIO_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
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
    await this.sendPacket(packet);
  }

  /**
   * 设备复位
   */
  async resetDevice(): Promise<void> {
    // DEVICE_RESET 需要一个参数（通常为 0x00）
    const packet = this.buildPacket(ABMateCommand.DEVICE_RESET, ABMateCommandType.REQUEST, new Uint8Array([0x00]));
    await this.sendPacket(packet);
  }

  /**
   * 设置蓝牙名称
   */
  async setBluetoothName(name: string): Promise<void> {
    const encoder = new TextEncoder();
    const payload = encoder.encode(name.substring(0, 32));
    const packet = this.buildPacket(ABMateCommand.BT_NAME_SET, ABMateCommandType.REQUEST, payload);
    await this.sendPacket(packet);
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
   */
  private buildPacket(cmd: ABMateCommand, type: ABMateCommandType, payload: Uint8Array): Uint8Array {
    const seq = this.getNextSeq();  // 使用正确的序列号管理
    const headerLen = 5;
    const totalLen = headerLen + 1 + payload.length; // header + cmd + payload
    const packet = new Uint8Array(totalLen);

    // Header
    packet[0] = (AB_MATE_CONSTANTS.TAG >> 8) & 0xff; // TAG high byte (0xAB)
    packet[1] = AB_MATE_CONSTANTS.TAG & 0xff;        // TAG low byte  (0x23)
    packet[2] = type;                                  // Type (REQUEST/RESPONSE/NOTIFY)
    packet[3] = seq;                                   // Seq (0-255, 循环)
    packet[4] = payload.length + 1;                    // Len = cmd(1) + payload(n)

    // Command
    packet[5] = cmd;

    // Payload
    if (payload.length > 0) {
      packet.set(payload, 6);
    }

    return packet;
  }

  /**
   * 发送数据包并等待响应
   */
  private async sendAndWait(packet: Uint8Array, timeoutMs: number = 5000): Promise<Uint8Array | null> {
    const seq = packet[3]; // 获取序列号

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seq);
        console.warn(`❌ 命令超时（序列号: ${seq}），设备无响应`);
        this.callbacks.onError?.(new Error('设备无响应，请检查连接'));
        resolve(null);
      }, timeoutMs);

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

      const cmd = packet[5];
      const len = packet[4];
      console.log(`📤 发送命令: [TAG:AB23] [Type:${packet[2]}] [Seq:${seq}] [Len:${len}] [Cmd:0x${cmd.toString(16).padStart(2, '0')}]`);
      console.log(`   完整数据: ${Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    });
  }

  /**
   * 发送数据包
   */
  private async sendPacket(packet: Uint8Array): Promise<void> {
    try {
      const cmd = packet[5];
      const len = packet[4];
      const seq = packet[3];
      const type = packet[2];
      
      const rawHex = Array.from(packet)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');

      console.log(
        `📤 发送数据包: [Seq:${seq}] [Type:${type}] [Len:${len}] [Cmd:0x${cmd.toString(16).padStart(2, '0')}]`
      );
      console.log(`   完整数据: ${rawHex}`);

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

      // 解析数据包
      const packet = this.parsePacket(data);
      
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
      if (packet.type === ABMateCommandType.RESPONSE && this.pendingRequests.has(packet.seq)) {
        const pending = this.pendingRequests.get(packet.seq)!;
        this.pendingRequests.delete(packet.seq);
        pending.resolve(packet.payload);
        console.log(`✅ 序列号 ${packet.seq} 的请求已匹配响应`);
      } else if (packet.type === ABMateCommandType.RESPONSE) {
        console.warn(`⚠️  收到响应但无对应的待处理请求 (Seq: ${packet.seq})`);
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
   */
  private parsePacket(data: DataView): ABMatePacket {
    const tag = (data.getUint8(0) << 8) | data.getUint8(1);
    
    if (tag !== AB_MATE_CONSTANTS.TAG) {
      throw new Error(`❌ 无效的数据包标签: 0x${tag.toString(16)}`);
    }

    if (data.byteLength < 6) {
      throw new Error(`❌ 数据包过短: ${data.byteLength} 字节`);
    }

    const type = data.getUint8(2);
    const seq = data.getUint8(3);
    const len = data.getUint8(4);
    const cmd = data.getUint8(5);

    // 验证长度
    if (data.byteLength < 6 + len - 1) {
      console.warn(`⚠️  数据包不完整: 声明长度${len}，实际${data.byteLength - 5}`);
    }

    return {
      tag,
      type: type as ABMateCommandType,
      seq,
      len,
      cmd: cmd as ABMateCommand,
      payload: new Uint8Array(data.buffer, data.byteOffset + 6, data.byteLength - 6),
    };
  }

  /**
   * 处理响应
   */
  private handleResponse(packet: ABMatePacket): void {
    const result = packet.payload[0] as ABMateResult;
    const cmdHex = `0x${packet.cmd.toString(16).padStart(2, '0')}`;
    
    if (result === ABMateResult.SUCCESS) {
      console.log(`✅ 命令 ${cmdHex} 执行成功`);
    } else {
      console.warn(`⚠️  命令 ${cmdHex} 执行失败，错误码: ${result}`);
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
      
      case ABMateCommand.VOL_SET:
        this.deviceInfo.volume = packet.payload[0];
        this.callbacks.onVolumeChanged?.(packet.payload[0]);
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
   * 解析设备信息
   */
  private parseDeviceInfo(payload: Uint8Array): void {
    let offset = 0;
    
    while (offset < payload.length) {
      const type = payload[offset++];
      const len = payload[offset++];
      const data = payload.slice(offset, offset + len);
      offset += len;

      switch (type) {
        case 0x01: // 固件版本
          this.deviceInfo.firmwareVersion = this.parseVersion(data);
          break;
        
        case 0x02: // 蓝牙名称
          this.deviceInfo.bluetoothName = new TextDecoder().decode(data);
          break;

        case 0x03: // 电池电量
          if (data.length >= 2) {
            this.deviceInfo.leftBattery = data[0];
            this.deviceInfo.rightBattery = data[1];
            if (data.length >= 3) {
              this.deviceInfo.caseBattery = data[2];
            }
            this.callbacks.onBatteryUpdated?.(
              data[0],
              data[1],
              data[2]
            );
          }
          break;

        case 0x04: // 音量
          this.deviceInfo.volume = data[0];
          break;

        case 0x05: // 播放状态
          this.deviceInfo.playState = data[0] === 1;
          break;

        case 0x06: // ANC 模式
          this.deviceInfo.ancMode = data[0] as ABMateANCMode;
          break;

        case 0x07: // ANC 等级
          this.deviceInfo.ancLevel = data[0];
          break;

        case 0x08: // 透传等级
          this.deviceInfo.tpLevel = data[0];
          break;

        case 0x09: // EQ 模式
          this.deviceInfo.eqMode = data[0] as ABMateEQMode;
          break;

        case 0x0a: // 工作模式
          this.deviceInfo.deviceMode = data[0] as ABMateDeviceMode;
          break;

        case 0x0b: // 入耳检测
          this.deviceInfo.inEarEnabled = data[0] === 1;
          break;

        case 0x0c: // LED 开关
          this.deviceInfo.ledEnabled = data[0] === 1;
          break;

        case 0x0d: // 3D 音效
          this.deviceInfo.v3dAudioEnabled = data[0] === 1;
          break;

        case 0x0e: // TWS 连接状态
          this.deviceInfo.twsConnected = data[0] === 1;
          break;

        case 0x0f: // TWS 声道
          this.deviceInfo.twsChannel = data[0] === 0 ? 'left' : data[0] === 1 ? 'right' : 'unknown';
          break;
      }
    }

    console.log('设备信息已更新:', this.deviceInfo);
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
