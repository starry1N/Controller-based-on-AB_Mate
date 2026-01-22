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
    await this.bleService.scanAndConnect();
    this.callbacks.onConnected?.();
    
    // 连接成功后查询设备信息
    setTimeout(() => {
      this.queryDeviceInfo();
    }, 500);
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
    const packet = this.buildPacket(ABMateCommand.DEVICE_RESET, ABMateCommandType.REQUEST, new Uint8Array([]));
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
    const headerLen = 5;
    const totalLen = headerLen + 1 + payload.length; // header + cmd + payload
    const packet = new Uint8Array(totalLen);

    // Header
    packet[0] = (AB_MATE_CONSTANTS.TAG >> 8) & 0xff; // TAG high byte
    packet[1] = AB_MATE_CONSTANTS.TAG & 0xff; // TAG low byte
    packet[2] = type;
    packet[3] = this.seq++;
    packet[4] = payload.length + 1; // len = cmd (1 byte) + payload

    // Command
    packet[5] = cmd;

    // Payload
    if (payload.length > 0) {
      packet.set(payload, 6);
    }

    return packet;
  }

  /**
   * 发送数据包
   */
  private async sendPacket(packet: Uint8Array): Promise<void> {
    try {
      // 优先使用快速写入（无响应）
      await this.bleService.writeWithoutResponse(packet);
      console.log('发送数据包:', Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' '));
    } catch (error) {
      console.error('发送数据包失败:', error);
      this.callbacks.onError?.(error as Error);
    }
  }

  /**
   * 处理接收到的数据
   */
  private handleReceivedData(data: DataView): void {
    try {
      // 解析数据包
      const packet = this.parsePacket(data);
      
      console.log('收到数据包:', {
        type: packet.type,
        cmd: packet.cmd,
        payload: Array.from(packet.payload)
      });

      // 根据命令类型处理
      if (packet.type === ABMateCommandType.RESPONSE) {
        this.handleResponse(packet);
      } else if (packet.type === ABMateCommandType.NOTIFY) {
        this.handleNotify(packet);
      }
    } catch (error) {
      console.error('解析数据包失败:', error);
      this.callbacks.onError?.(error as Error);
    }
  }

  /**
   * 解析数据包
   */
  private parsePacket(data: DataView): ABMatePacket {
    const tag = (data.getUint8(0) << 8) | data.getUint8(1);
    
    if (tag !== AB_MATE_CONSTANTS.TAG) {
      throw new Error(`无效的数据包标签: 0x${tag.toString(16)}`);
    }

    return {
      tag,
      type: data.getUint8(2) as ABMateCommandType,
      seq: data.getUint8(3),
      len: data.getUint8(4),
      cmd: data.getUint8(5) as ABMateCommand,
      payload: new Uint8Array(data.buffer, data.byteOffset + 6, data.byteLength - 6),
    };
  }

  /**
   * 处理响应
   */
  private handleResponse(packet: ABMatePacket): void {
    const result = packet.payload[0] as ABMateResult;
    
    if (result === ABMateResult.SUCCESS) {
      console.log(`命令 0x${packet.cmd.toString(16)} 执行成功`);
    } else {
      console.warn(`命令 0x${packet.cmd.toString(16)} 执行失败`);
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
