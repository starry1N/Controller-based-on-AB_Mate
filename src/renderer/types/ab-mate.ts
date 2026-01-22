/**
 * AB-Mate 协议类型定义
 * 基于 AB-Mate APP 框架的完整协议规范
 */

// AB-Mate 常量定义
export const AB_MATE_CONSTANTS = {
  TAG: 0xab23,
  MANUFACTURER_ID: 0x0642, // Bluetrum
  VID: 2, // 广播协议版本
  SERVICE_UUID: 0xff01,
  CHAR_NOTIFY_UUID: 0xff18,
  CHAR_WRITE_UUID: 0xff16,
  CHAR_WRITE_CMD_UUID: 0xff17,
} as const;

// 命令类型枚举
export enum ABMateCommandType {
  REQUEST = 1,
  RESPONSE = 2,
  NOTIFY = 3,
}

// 命令 ID 枚举
export enum ABMateCommand {
  EQ_SET = 0x20,
  MUSIC_SET = 0x21,
  KEY_SET = 0x22,
  POWER_OFF_SET = 0x23,
  DEVICE_RESET = 0x24,
  MODE_SET = 0x25,
  IN_EAR_SET = 0x26,
  DEVICE_INFO_GET = 0x27,
  DEVICE_INFO_NOTIFY = 0x28,
  LANGUAGE_SET = 0x29,
  BT_NAME_SET = 0x2a,
  LED_SET = 0x2b,
  ANC_SET = 0x2c,
  VOL_SET = 0x2d,
  ANC_LEVEL_SET = 0x2e,
  TP_LEVEL_SET = 0x2f,
  V3D_AUDIO_SET = 0x30,
  DEVICE_FIND = 0x31,
}

// ANC 模式枚举
export enum ABMateANCMode {
  OFF = 0,
  ANC = 1,
  TRANSPARENCY = 2,
}

// EQ 模式枚举
export enum ABMateEQMode {
  POPULAR = 0,
  ROCK = 1,
  CLASSIC = 2,
  JAZZ = 3,
  BASS = 4,
  VOCAL = 5,
  CUSTOM = 0x20,
}

// 工作模式枚举
export enum ABMateDeviceMode {
  NORMAL = 0,
  GAME = 1, // 低延迟游戏模式
}

// 按键功能枚举
export enum ABMateKeyFunction {
  NONE = 0,
  PLAY_PAUSE = 1,
  NEXT = 2,
  PREV = 3,
  VOL_UP = 4,
  VOL_DOWN = 5,
  SIRI = 6,
  REDIALING = 7,
  DEVICE_FIND = 8,
  GAME_MODE = 9,
  ANC_SWITCH = 10,
}

// AB-Mate 数据包结构
export interface ABMatePacket {
  tag: number; // 0xab23
  type: ABMateCommandType;
  seq: number;
  len: number;
  cmd: ABMateCommand;
  payload: Uint8Array;
}

// 设备信息
export interface ABMateDeviceInfo {
  firmwareVersion: string;
  hardwareVersion: string;
  bluetoothName: string;
  bluetoothAddress: string;
  leftBattery: number; // 0-100
  rightBattery: number; // 0-100
  caseBattery?: number; // 0-100
  volume: number; // 0-100
  playState: boolean;
  ancMode: ABMateANCMode;
  ancLevel: number; // 0-4
  tpLevel: number; // 0-3
  eqMode: ABMateEQMode;
  deviceMode: ABMateDeviceMode;
  inEarEnabled: boolean;
  ledEnabled: boolean;
  v3dAudioEnabled: boolean;
  twsConnected: boolean;
  twsChannel: 'left' | 'right' | 'unknown';
}

// EQ 配置
export interface ABMateEQConfig {
  mode: ABMateEQMode;
  gains: number[]; // 10 段增益值 (-12 to +12 dB)
}

// 按键配置
export interface ABMateKeyConfig {
  leftShort: ABMateKeyFunction;
  leftDouble: ABMateKeyFunction;
  leftTriple: ABMateKeyFunction;
  leftLong: ABMateKeyFunction;
  rightShort: ABMateKeyFunction;
  rightDouble: ABMateKeyFunction;
  rightTriple: ABMateKeyFunction;
  rightLong: ABMateKeyFunction;
}

// BLE 设备信息
export interface BLEDeviceInfo {
  device: BluetoothDevice;
  name: string;
  rssi?: number;
  manufacturerData?: DataView;
}

// AB-Mate 响应结果
export enum ABMateResult {
  SUCCESS = 0,
  FAIL = 1,
}

// 连接状态
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  SCANNING = 'scanning',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// 事件类型
export interface ABMateEvents {
  onConnected: () => void;
  onDisconnected: () => void;
  onDeviceInfoUpdated: (info: Partial<ABMateDeviceInfo>) => void;
  onBatteryUpdated: (left: number, right: number, caseLevel?: number) => void;
  onVolumeChanged: (volume: number) => void;
  onANCModeChanged: (mode: ABMateANCMode, level: number) => void;
  onEQChanged: (config: ABMateEQConfig) => void;
  onError: (error: Error) => void;
}
