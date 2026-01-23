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
    protocolRef.current.on('onConnected', () => {
      setConnectionState(ConnectionState.CONNECTED);
      // 连接成功后获取设备名称
      const deviceName = bleServiceRef.current?.getDeviceName();
      if (deviceName) {
        setDeviceInfo((prev) => ({ ...prev, name: deviceName }));
      }
      console.log('设备已连接:', deviceName);
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
    const newMode =
      deviceInfo.deviceMode === ABMateDeviceMode.GAME
        ? ABMateDeviceMode.NORMAL
        : ABMateDeviceMode.GAME;
    try {
      await protocolRef.current?.setDeviceMode(newMode);
    } catch (error) {
      console.error('切换模式失败:', error);
    }
  };

  const handleFindDevice = async (side: 'left' | 'right' | 'both') => {
    try {
      await protocolRef.current?.findDevice(side);
    } catch (error) {
      console.error('查找设备失败:', error);
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

