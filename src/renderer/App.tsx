import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { BLEService } from './services/BLEService';
import { ABMateProtocol } from './services/ABMateProtocol';
import {
  ConnectionState,
  ABMateDeviceInfo,
  ABMateEQConfig,
  ABMateANCMode,
  ABMateDeviceMode,
  ABMateEQMode,
} from './types/ab-mate';
import { DeviceConnection } from './components/DeviceConnection';
import { DeviceInfo } from './components/DeviceInfo';
import { EQControl } from './components/EQControl';
import { ANCControl } from './components/ANCControl';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [deviceInfo, setDeviceInfo] = useState<Partial<ABMateDeviceInfo>>({});
  const [eqConfig, setEQConfig] = useState<ABMateEQConfig>({
    mode: ABMateEQMode.POPULAR,
    gains: new Array(10).fill(0),
  });

  const bleServiceRef = useRef<BLEService | null>(null);
  const protocolRef = useRef<ABMateProtocol | null>(null);

  useEffect(() => {
    // 检查浏览器支持
    if (!BLEService.isSupported()) {
      alert('您的浏览器不支持 Web Bluetooth，请使用 Chrome/Edge 浏览器');
      setConnectionState(ConnectionState.ERROR);
      return;
    }

    // 初始化服务
    bleServiceRef.current = new BLEService();
    protocolRef.current = new ABMateProtocol(bleServiceRef.current);

    // 设置事件监听
    protocolRef.current.on('onConnected', async () => {
      setConnectionState(ConnectionState.CONNECTED);
      
      // 先用 BLE 设备名称作为临时值
      const bleDeviceName = bleServiceRef.current?.getDeviceName();
      if (bleDeviceName) {
        setDeviceInfo((prev) => ({ ...prev, bluetoothName: bleDeviceName }));
      }
      
      // 连接成功后查询设备信息（包括蓝牙名称、电池、版本等）
      try {
        // 查询蓝牙名称、版本、电池、ANC模式、MTU和设备能力
        // 0x03=INFO_BT_NAME, 0x02=INFO_VERSION, 0x01=INFO_POWER, 0x0C=INFO_ANC, 0xFF=INFO_MTU, 0xFE=INFO_DEV_CAP
        await protocolRef.current?.queryDeviceInfo([0x03, 0x02, 0x01, 0x0C, 0xFF, 0xFE]);
        console.log('✅ 设备信息查询成功');
      } catch (error) {
        console.warn('⚠️  设备信息查询失败:', error);
        // 即使查询失败也继续运行，使用 BLE 设备名称
      }
    });

    protocolRef.current.on('onDisconnected', () => {
      setConnectionState(ConnectionState.DISCONNECTED);
      setDeviceInfo({});
      console.log('设备已断开');
    });

    protocolRef.current.on('onDeviceInfoUpdated', (info) => {
      setDeviceInfo((prev) => ({ ...prev, ...info }));
    });

    protocolRef.current.on('onBatteryUpdated', (left, right, caseLevel) => {
      setDeviceInfo((prev) => ({
        ...prev,
        leftBattery: left,
        rightBattery: right,
        caseBattery: caseLevel,
      }));
    });

    protocolRef.current.on('onEQChanged', (config) => {
      setEQConfig(config);
    });

    protocolRef.current.on('onVolumeChanged', (volume) => {
      setDeviceInfo((prev) => ({ ...prev, volume }));
    });

    protocolRef.current.on('onANCModeChanged', (mode, level) => {
      setDeviceInfo((prev) => ({ ...prev, ancMode: mode, ancLevel: level }));
    });

    protocolRef.current.on('onError', (error) => {
      console.error('协议错误:', error);
      
      // 检查是否为 GATT 操作错误
      if (error.message && error.message.includes('GATT operation already in progress')) {
        console.warn('⚠️  检测到 GATT 操作冲突，正在尝试同步设备...');
        
        // 尝试同步设备
        if (protocolRef.current) {
          protocolRef.current.syncWithDevice().then((success) => {
            if (success) {
              console.log('✅ 设备同步成功，连接已恢复');
              // 不显示错误弹窗，继续运行
            } else {
              console.error('❌ 设备同步失败');
              alert(`连接错误: ${error.message}\n请重新连接设备`);
            }
          });
        }
      } else {
        alert(`错误: ${error.message}`);
      }
    });

    return () => {
      // 清理
      if (bleServiceRef.current?.isConnected()) {
        bleServiceRef.current.disconnect();
      }
    };
  }, []);

  const handleConnect = async () => {
    try {
      setConnectionState(ConnectionState.SCANNING);
      await protocolRef.current?.connect();
    } catch (error) {
      console.error('连接失败:', error);
      setConnectionState(ConnectionState.ERROR);
      alert(`连接失败: ${error}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await protocolRef.current?.disconnect();
      setConnectionState(ConnectionState.DISCONNECTED);
      setDeviceInfo({});
    } catch (error) {
      console.error('断开连接失败:', error);
    }
  };

  const handleEQChange = async (config: ABMateEQConfig) => {
    setEQConfig(config);
    try {
      await protocolRef.current?.setEQ(config);
    } catch (error) {
      console.error('设置 EQ 失败:', error);
    }
  };

  const handleANCModeChange = async (mode: ABMateANCMode) => {
    // ✅ 立即更新本地UI（乐观更新）
    setDeviceInfo((prev) => ({ ...prev, ancMode: mode }));
    
    try {
      // 异步发送命令到设备
      await protocolRef.current?.setANCMode(mode);
    } catch (error) {
      console.error('设置 ANC 模式失败:', error);
      // 失败时UI会通过响应处理回退
    }
  };

  const handleANCLevelChange = async (level: number) => {
    // ✅ 立即更新本地UI（乐观更新）
    setDeviceInfo((prev) => ({ ...prev, ancLevel: level }));
    
    try {
      // 异步发送命令到设备
      await protocolRef.current?.setANCLevel(level);
    } catch (error) {
      console.error('设置 ANC 等级失败:', error);
    }
  };

  const handleTPLevelChange = async (level: number) => {
    // ✅ 立即更新本地UI（乐观更新）
    setDeviceInfo((prev) => ({ ...prev, tpLevel: level }));
    
    try {
      // 异步发送命令到设备
      await protocolRef.current?.setTransparencyLevel(level);
    } catch (error) {
      console.error('设置透传等级失败:', error);
    }
  };

  const handleVolumeChange = async (volume: number) => {
    // ✅ 立即更新本地UI（乐观更新）
    setDeviceInfo((prev) => ({ ...prev, volume }));
    
    try {
      // 异步发送命令到设备
      await protocolRef.current?.setVolume(volume);
    } catch (error) {
      console.error('设置音量失败:', error);
      // 如果失败，需要回退UI到之前的值
      // 但目前保持为用户设置的值，因为setVolume中会同步更新
    }
  };

  const handleToggleMode = async () => {
    // 确定要切换到的新模式
    const currentMode = deviceInfo.deviceMode || ABMateDeviceMode.NORMAL;
    const newMode =
      currentMode === ABMateDeviceMode.GAME
        ? ABMateDeviceMode.NORMAL
        : ABMateDeviceMode.GAME;

    try {
      console.log(
        `🎮 切换模式: ${currentMode === ABMateDeviceMode.GAME ? '游戏' : '普通'} → ${newMode === ABMateDeviceMode.GAME ? '游戏' : '普通'}`
      );
      // setDeviceMode 会自动进行乐观更新，所以不需要在这里再更新
      await protocolRef.current?.setDeviceMode(newMode);
      console.log('✅ 模式切换成功');
    } catch (error) {
      console.error('❌ 切换模式失败:', error);
      throw error; // 抛出错误以便 UI 可以恢复
    }
  };

  const handleFindDevice = async (side: 'left' | 'right' | 'both' | 'stop') => {
    try {
      await protocolRef.current?.findDevice(side);
    } catch (error) {
      console.error('查找设备失败:', error);
    }
  };

  const handleBluetoothNameChange = async (newName: string) => {
    if (!newName.trim()) {
      throw new Error('蓝牙名称不能为空');
    }

    const previousName = deviceInfo.bluetoothName;
    const isNameChanged = newName !== previousName;

    try {
      console.log(`📝 更改蓝牙名称: "${previousName}" → "${newName}" (长度: ${newName.length}/32)`);
      
      // 乐观更新UI
      setDeviceInfo((prev) => ({ ...prev, bluetoothName: newName }));

      // 发送命令到设备
      await protocolRef.current?.setBluetoothName(newName);
      
      // sendAndWait 已经在内部验证了响应，如果失败会抛出异常
      // 如果执行到这里说明修改成功
      console.log(`✅ 蓝牙名称修改成功: "${newName}"`);
    } catch (error) {
      console.error('❌ 蓝牙名称修改失败:', error);
      
      // 诊断信息
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('功能未启用')) {
        console.warn(
          `\n💡 诊断信息:\n` +
          `   • 固件可能未启用 BT_NAME 功能 (AB_MATE_BT_NAME_EN=0)\n` +
          `   • 检查固件编译配置\n`
        );
      } else if (errorMsg.includes('TWS连接')) {
        console.warn(
          `\n💡 诊断信息:\n` +
          `   • 如果使用真无线耳机，请确保:\n` +
          `     - 左右耳都已连接，或\n` +
          `     - 正处于配对模式\n`
        );
      }
      
      // 如果确实改变了名称，则回退
      if (isNameChanged) {
        setDeviceInfo((prev) => ({ ...prev, bluetoothName: previousName }));
        console.log(`↩️  已回滚蓝牙名称: "${newName}" → "${previousName}"`);
      }
      
      throw error;
    }
  };

  const handleOTAUpgrade = async (file: File) => {
    try {
      console.log(`🔄 开始OTA升级: ${file.name}`);
      await protocolRef.current?.startOTAUpgrade(file);
      console.log('✅ OTA升级成功，设备将重启');
      alert('✅ 固件升级成功！\n设备将在几秒内重启...');
      
      // 等待设备重启后重新连接
      setTimeout(async () => {
        console.log('⏳ 等待设备重启...');
        setConnectionState(ConnectionState.DISCONNECTED);
        // 可选：自动重新连接
        setTimeout(() => {
          console.log('🔄 尝试重新连接...');
          handleConnect();
        }, 5000);
      }, 3000);
      
    } catch (error) {
      console.error('❌ OTA升级失败:', error);
      throw error;
    }
  };

  return (
    <div className="App">
      <div className="app-header">
        <h1>🎧 TWS 耳机控制</h1>
        <p className="app-subtitle">基于 AB-Mate 协议的轻量级控制器</p>
      </div>

      <div className="app-container">
        <DeviceConnection
          connectionState={connectionState}
          deviceName={deviceInfo.bluetoothName || ''}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />

        {connectionState === ConnectionState.CONNECTED && (
          <>
            <DeviceInfo
              deviceInfo={deviceInfo}
              onFindDevice={handleFindDevice}
              onToggleMode={handleToggleMode}
              onVolumeChange={handleVolumeChange}
              onBluetoothNameChange={handleBluetoothNameChange}
              onOTAUpgrade={handleOTAUpgrade}
            />

            <ANCControl
              ancMode={deviceInfo.ancMode || ABMateANCMode.OFF}
              ancLevel={deviceInfo.ancLevel || 1}
              tpLevel={deviceInfo.tpLevel || 1}
              onModeChange={handleANCModeChange}
              onANCLevelChange={handleANCLevelChange}
              onTPLevelChange={handleTPLevelChange}
            />

            <EQControl eqConfig={eqConfig} onChange={handleEQChange} />
          </>
        )}

        {connectionState === ConnectionState.DISCONNECTED && (
          <div className="welcome-message">
            <div className="welcome-icon">🎵</div>
            <h2>欢迎使用 TWS 控制器</h2>
            <p>点击上方按钮连接您的 AB-Mate 耳机</p>
            <div className="features-list">
              <div className="feature-item">✅ 10 段 EQ 均衡器</div>
              <div className="feature-item">✅ ANC 主动降噪</div>
              <div className="feature-item">✅ 游戏低延迟模式</div>
              <div className="feature-item">✅ 设备查找功能</div>
            </div>
          </div>
        )}
      </div>

      <footer className="app-footer">
        <p>Powered by Electron + React | AB-Mate Protocol</p>
      </footer>
    </div>
  );
};

export default App;

