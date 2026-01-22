/**
 * BLE 通信服务
 * 处理 Web Bluetooth API 的底层连接和数据传输
 */

import { AB_MATE_CONSTANTS, BLEDeviceInfo } from '../types/ab-mate';

export class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeCmdChar: BluetoothRemoteGATTCharacteristic | null = null;

  private onDataCallback: ((data: DataView) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  /**
   * 扫描并连接 AB-Mate 设备
   */
  async scanAndConnect(): Promise<BluetoothDevice> {
    try {
      // 请求蓝牙设备
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          {
            services: [this.uuidTo128Bit(AB_MATE_CONSTANTS.SERVICE_UUID)]
          }
        ],
        optionalServices: [this.uuidTo128Bit(AB_MATE_CONSTANTS.SERVICE_UUID)]
      });

      console.log('发现设备:', this.device.name);

      // 监听断开连接事件
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('设备已断开');
        this.onDisconnectCallback?.();
      });

      // 连接到 GATT 服务器
      await this.connect();

      return this.device;
    } catch (error) {
      console.error('扫描设备失败:', error);
      throw new Error(`扫描失败: ${error}`);
    }
  }

  /**
   * 连接到已配对的设备
   */
  async connect(): Promise<void> {
    if (!this.device) {
      throw new Error('未找到设备，请先扫描');
    }

    try {
      console.log('正在连接 GATT 服务器...');
      this.server = await this.device.gatt!.connect();

      // 如果扫描时未获取名称，从 Generic Access 服务读取
      if (!this.device.name || this.device.name === '') {
        try {
          const gasService = await this.server.getPrimaryService('generic_access');
          const nameChar = await gasService.getCharacteristic('device_name');
          const value = await nameChar.readValue();
          const name = new TextDecoder().decode(value);
          if (name) {
            console.log('从 GATT 获取设备名称:', name);
            // 更新设备名称
            (this.device as any).name = name;
          }
        } catch (e) {
          console.log('从 Generic Access 读取设备名称失败，使用默认名称');
        }
      }

      console.log('正在获取 AB-Mate 服务...');
      this.service = await this.server.getPrimaryService(
        this.uuidTo128Bit(AB_MATE_CONSTANTS.SERVICE_UUID)
      );

      // 获取特征
      console.log('正在获取特征...');
      const [notifyChar, writeChar, writeCmdChar] = await Promise.all([
        this.service.getCharacteristic(this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_NOTIFY_UUID)),
        this.service.getCharacteristic(this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_WRITE_UUID)),
        this.service.getCharacteristic(this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_WRITE_CMD_UUID))
      ]);

      this.notifyChar = notifyChar;
      this.writeChar = writeChar;
      this.writeCmdChar = writeCmdChar;

      // 验证特征属性
      console.log('特征属性验证:');
      console.log(`  Notify (0xFF18): 支持Notify=${notifyChar.properties.notify}, 支持Read=${notifyChar.properties.read}`);
      console.log(`  Write (0xFF16): 支持Write=${writeChar.properties.write}, 支持Read=${writeChar.properties.read}`);
      console.log(`  WriteCmd (0xFF17): 支持WriteWithoutResponse=${writeCmdChar.properties.writeWithoutResponse}, 支持Write=${writeCmdChar.properties.write}`);

      // 订阅通知
      console.log('正在订阅 Notify 特征...');
      await this.notifyChar.startNotifications();
      console.log('✅ Notify 订阅成功，开始监听数据...');
      
      this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value!;
        this.onDataCallback?.(value);
      });

      console.log('BLE 连接成功！');
    } catch (error) {
      console.error('连接失败:', error);
      throw new Error(`连接失败: ${error}`);
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.notifyChar = null;
    this.writeChar = null;
    this.writeCmdChar = null;
  }

  /**
   * 发送数据（带响应）
   */
  async write(data: Uint8Array): Promise<void> {
    if (!this.writeChar) {
      throw new Error('未连接到设备');
    }
    await this.writeChar.writeValue(data);
  }

  /**
   * 发送数据（无响应，更快）
   */
  async writeWithoutResponse(data: Uint8Array): Promise<void> {
    if (!this.writeCmdChar) {
      throw new Error('未连接到设备');
    }
    await this.writeCmdChar.writeValueWithoutResponse(data);
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.server?.connected ?? false;
  }
  /**
   * 获取设备名称
   */
  getDeviceName(): string {
    return this.device?.name || '未知设备';
  }
  /**
   * 获取设备信息
   */
  getDeviceInfo(): BLEDeviceInfo | null {
    if (!this.device) return null;
    
    return {
      device: this.device,
      name: this.device.name || 'Unknown',
    };
  }

  /**
   * 设置数据接收回调
   */
  onData(callback: (data: DataView) => void): void {
    this.onDataCallback = callback;
  }

  /**
   * 设置断开连接回调
   */
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * 将 16 位 UUID 转换为 128 位标准格式
   */
  private uuidTo128Bit(uuid16: number): string {
    const hex = uuid16.toString(16).padStart(4, '0');
    return `0000${hex}-0000-1000-8000-00805f9b34fb`;
  }

  /**
   * 检查浏览器是否支持 Web Bluetooth
   */
  static isSupported(): boolean {
    return 'bluetooth' in navigator;
  }
}
