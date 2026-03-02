/**
 * BLE 通信服务 - Capacitor 版本（支持Android、iOS、Web）
 * 这个版本兼容Web和原生平台
 */

import { AB_MATE_CONSTANTS, BLEDeviceInfo } from '../types/ab-mate';

// Android原生BLE接口定义
interface AndroidBLEDevice {
  id: string;
  name: string;
  rssi: number;
}

interface AndroidBLEService {
  uuid: string;
  characteristics: AndroidBLECharacteristic[];
}

interface AndroidBLECharacteristic {
  uuid: string;
  properties: {
    read: boolean;
    readEncrypted: boolean;
    readEncryptedMitm: boolean;
    write: boolean;
    writeEncrypted: boolean;
    writeEncryptedMitm: boolean;
    writeWithoutResponse: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    extendedProps: boolean;
    notifyEncrypted: boolean;
    indicateEncrypted: boolean;
  };
}

/**
 * 平台检测工具类
 */
class PlatformDetector {
  static isAndroid(): boolean {
    return /android/i.test(navigator.userAgent);
  }

  static isIOS(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  static isWeb(): boolean {
    return !this.isAndroid() && !this.isIOS();
  }

  static isCapacitor(): boolean {
    return (window as any).Capacitor !== undefined;
  }

  static getPlatformName(): string {
    if (this.isAndroid()) return 'Android';
    if (this.isIOS()) return 'iOS';
    return 'Web';
  }
}

/**
 * Web BLE 实现（用于Web和Electron）
 */
class WebBLEImplementation {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeCmdChar: BluetoothRemoteGATTCharacteristic | null = null;

  private onDataCallback: ((data: DataView) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  async scanAndConnect(): Promise<BluetoothDevice> {
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          {
            services: [this.uuidTo128Bit(AB_MATE_CONSTANTS.SERVICE_UUID)]
          }
        ],
        optionalServices: [this.uuidTo128Bit(AB_MATE_CONSTANTS.SERVICE_UUID)]
      });

      console.log('[Web BLE] 发现设备:', this.device.name);

      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('[Web BLE] 设备已断开');
        this.onDisconnectCallback?.();
      });

      await this.connect();
      return this.device;
    } catch (error) {
      console.error('[Web BLE] 扫描设备失败:', error);
      throw new Error(`扫描失败: ${error}`);
    }
  }

  async connect(): Promise<void> {
    if (!this.device) {
      throw new Error('未找到设备，请先扫描');
    }

    try {
      console.log('[Web BLE] 正在连接 GATT 服务器...');
      this.server = await this.device.gatt!.connect();

      // 尝试从 Generic Access 服务读取设备名称（如果扫描时未获取）
      if (!this.device.name || this.device.name === '') {
        try {
          const gasService = await this.server.getPrimaryService('generic_access');
          const nameChar = await gasService.getCharacteristic('device_name');
          const value = await nameChar.readValue();
          const name = new TextDecoder().decode(value);
          if (name) {
            console.log('[Web BLE] 从 GATT 获取设备名称:', name);
            (this.device as any).name = name;
          }
        } catch (e) {
          console.log('[Web BLE] 从 Generic Access 读取设备名称失败');
        }
      }

      console.log('[Web BLE] 正在获取 AB-Mate 服务...');
      this.service = await this.server.getPrimaryService(
        this.uuidTo128Bit(AB_MATE_CONSTANTS.SERVICE_UUID)
      );

      console.log('[Web BLE] 正在获取特征...');
      const [notifyChar, writeChar, writeCmdChar] = await Promise.all([
        this.service.getCharacteristic(this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_NOTIFY_UUID)),
        this.service.getCharacteristic(this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_WRITE_UUID)),
        this.service.getCharacteristic(this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_WRITE_CMD_UUID))
      ]);

      this.notifyChar = notifyChar;
      this.writeChar = writeChar;
      this.writeCmdChar = writeCmdChar;

      console.log('[Web BLE] 特征属性验证:');
      console.log(`  Notify: ${notifyChar.properties.notify}`);
      console.log(`  Write: ${writeChar.properties.write}`);
      console.log(`  WriteCmd: ${writeCmdChar.properties.writeWithoutResponse}`);

      console.log('[Web BLE] 正在订阅 Notify 特征...');
      await this.notifyChar.startNotifications();
      console.log('[Web BLE] ✅ Notify 订阅成功');
      
      this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value!;
        this.onDataCallback?.(value);
      });

      console.log('[Web BLE] BLE 连接成功！');
    } catch (error) {
      console.error('[Web BLE] 连接失败:', error);
      throw new Error(`连接失败: ${error}`);
    }
  }

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

  async write(data: Uint8Array): Promise<void> {
    if (!this.writeChar) {
      throw new Error('未连接到设备');
    }
    await this.writeChar.writeValue(data);
  }

  async writeWithoutResponse(data: Uint8Array): Promise<void> {
    if (!this.writeCmdChar) {
      throw new Error('未连接到设备');
    }
    await this.writeCmdChar.writeValueWithoutResponse(data);
  }

  isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  getDeviceName(): string {
    return this.device?.name || '未知设备';
  }

  getDeviceInfo(): BLEDeviceInfo | null {
    if (!this.device) return null;
    return {
      device: this.device,
      name: this.device.name || 'Unknown',
    };
  }

  onData(callback: (data: DataView) => void): void {
    this.onDataCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  private uuidTo128Bit(uuid16: number): string {
    const hex = uuid16.toString(16).padStart(4, '0');
    return `0000${hex}-0000-1000-8000-00805f9b34fb`;
  }

  static isSupported(): boolean {
    return 'bluetooth' in navigator;
  }
}

/**
 * Android BLE 实现（通过Bridge或插件）
 * 注：需要在原生代码中实现对应的方法
 */
class AndroidBLEImplementation {
  private deviceId: string | null = null;
  private deviceName: string = '未知设备';
  private onDataCallback: ((data: DataView) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private isConnectedFlag: boolean = false;

  async scanAndConnect(): Promise<any> {
    try {
      console.log('[Android BLE] 启动扫描...');
      
      // 调用原生方法扫描设备
      const device = await this.callNativeMethod('scanABMateDevice', {});
      
      if (!device || !device.id) {
        throw new Error('未找到AB-Mate设备');
      }

      this.deviceId = device.id;
      this.deviceName = device.name || 'Unknown';
      console.log('[Android BLE] 发现设备:', this.deviceName);

      await this.connect();
      return {
        id: device.id,
        name: device.name
      };
    } catch (error) {
      console.error('[Android BLE] 扫描失败:', error);
      throw error;
    }
  }

  async connect(): Promise<void> {
    if (!this.deviceId) {
      throw new Error('未找到设备，请先扫描');
    }

    try {
      console.log('[Android BLE] 正在连接，设备ID:', this.deviceId);
      
      await this.callNativeMethod('connectDevice', {
        deviceId: this.deviceId
      });

      this.isConnectedFlag = true;
      console.log('[Android BLE] 设备已连接');

      // 设置数据接收监听
      this.setupDataListener();
    } catch (error) {
      console.error('[Android BLE] 连接失败:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.deviceId) {
      try {
        await this.callNativeMethod('disconnectDevice', {
          deviceId: this.deviceId
        });
      } catch (error) {
        console.error('[Android BLE] 断开连接失败:', error);
      }
    }
    this.isConnectedFlag = false;
    this.deviceId = null;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.deviceId) {
      throw new Error('未连接到设备');
    }

    const hexData = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    await this.callNativeMethod('writeCharacteristic', {
      deviceId: this.deviceId,
      characteristicUuid: this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_WRITE_UUID),
      data: hexData,
      withResponse: true
    });
  }

  async writeWithoutResponse(data: Uint8Array): Promise<void> {
    if (!this.deviceId) {
      throw new Error('未连接到设备');
    }

    const hexData = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    await this.callNativeMethod('writeCharacteristic', {
      deviceId: this.deviceId,
      characteristicUuid: this.uuidTo128Bit(AB_MATE_CONSTANTS.CHAR_WRITE_CMD_UUID),
      data: hexData,
      withResponse: false
    });
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  getDeviceName(): string {
    return this.deviceName;
  }

  getDeviceInfo(): BLEDeviceInfo | null {
    if (!this.deviceId) return null;
    return {
      device: { id: this.deviceId, name: this.deviceName } as any,
      name: this.deviceName,
    };
  }

  onData(callback: (data: DataView) => void): void {
    this.onDataCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  private setupDataListener(): void {
    // 监听原生层的数据接收事件
    console.log('[Android BLE] 设置数据监听器');
    // 这里通常通过 Capacitor 插件的事件监听实现
  }

  private async callNativeMethod(method: string, args: any): Promise<any> {
    // 这里需要实现与原生代码的通信
    // 可以使用 Capacitor Plugins 或自定义 Bridge
    console.log(`[Android BLE] 调用原生方法: ${method}`, args);
    
    // 模拟实现，实际需要在原生代码中实现
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('原生实现未完成'));
      }, 1000);
    });
  }

  private uuidTo128Bit(uuid16: number): string {
    const hex = uuid16.toString(16).padStart(4, '0');
    return `0000${hex}-0000-1000-8000-00805f9b34fb`;
  }

  static isSupported(): boolean {
    return PlatformDetector.isAndroid() && PlatformDetector.isCapacitor();
  }
}

/**
 * 统一的 BLE 服务接口（支持多平台）
 */
export class BLEService {
  private implementation: WebBLEImplementation | AndroidBLEImplementation;
  private platformName: string;

  constructor() {
    this.platformName = PlatformDetector.getPlatformName();
    console.log(`🔍 检测到平台: ${this.platformName}`);

    // 选择合适的实现
    if (PlatformDetector.isAndroid() && AndroidBLEImplementation.isSupported()) {
      console.log('📱 使用 Android 原生 BLE 实现');
      this.implementation = new AndroidBLEImplementation();
    } else {
      console.log('🌐 使用 Web BLE 实现');
      this.implementation = new WebBLEImplementation();
    }
  }

  async scanAndConnect(): Promise<any> {
    return this.implementation.scanAndConnect();
  }

  async connect(): Promise<void> {
    if (this.implementation instanceof WebBLEImplementation) {
      return (this.implementation as any).connect();
    }
  }

  async disconnect(): Promise<void> {
    return this.implementation.disconnect();
  }

  async write(data: Uint8Array): Promise<void> {
    return this.implementation.write(data);
  }

  async writeWithoutResponse(data: Uint8Array): Promise<void> {
    return this.implementation.writeWithoutResponse(data);
  }

  isConnected(): boolean {
    return this.implementation.isConnected();
  }

  getDeviceName(): string {
    return this.implementation.getDeviceName();
  }

  getDeviceInfo(): BLEDeviceInfo | null {
    return this.implementation.getDeviceInfo();
  }

  onData(callback: (data: DataView) => void): void {
    return this.implementation.onData(callback);
  }

  onDisconnect(callback: () => void): void {
    return this.implementation.onDisconnect(callback);
  }

  static isSupported(): boolean {
    return WebBLEImplementation.isSupported() || AndroidBLEImplementation.isSupported();
  }

  static getPlatform(): string {
    return PlatformDetector.getPlatformName();
  }
}
