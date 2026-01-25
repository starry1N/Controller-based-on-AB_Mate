/**
 * 设备信息和快捷控制组件
 */

import React, { useState, useEffect } from 'react';
import { ABMateDeviceInfo, ABMateDeviceMode } from '../types/ab-mate';
import './DeviceInfo.css';

interface DeviceInfoProps {
  deviceInfo: Partial<ABMateDeviceInfo>;
  onFindDevice: (side: 'left' | 'right' | 'both' | 'stop') => void;
  onToggleMode: () => void;
  onVolumeChange: (volume: number) => void;
}

export const DeviceInfo: React.FC<DeviceInfoProps> = ({
  deviceInfo,
  onFindDevice,
  onToggleMode,
  onVolumeChange,
}) => {
  const [isFindingDevice, setIsFindingDevice] = useState(false);
  const [showFindOptions, setShowFindOptions] = useState(false);
  const [localMode, setLocalMode] = useState<ABMateDeviceMode>(ABMateDeviceMode.NORMAL);
  const [isTogglingMode, setIsTogglingMode] = useState(false);

  // 当设备模式更新时，同步本地状态
  useEffect(() => {
    if (deviceInfo.deviceMode !== undefined) {
      setLocalMode(deviceInfo.deviceMode);
    }
  }, [deviceInfo.deviceMode]);

  const handleFindDevice = (side: 'left' | 'right' | 'both') => {
    setIsFindingDevice(true);
    onFindDevice(side);
    // 30 秒后自动停止查找
    const timeout = setTimeout(() => {
      onFindDevice('stop');
      setIsFindingDevice(false);
    }, 30000);
    
    return () => clearTimeout(timeout);
  };

  const handleStopFinding = () => {
    onFindDevice('stop');
    setIsFindingDevice(false);
  };

  // 处理游戏模式切换
  const handleModeToggle = async () => {
    if (isTogglingMode) return;

    setIsTogglingMode(true);
    const previousMode = localMode;  // 保存切换前的模式
    
    // 立即切换本地状态，更新UI
    const newMode = localMode === ABMateDeviceMode.GAME 
      ? ABMateDeviceMode.NORMAL 
      : ABMateDeviceMode.GAME;
    
    setLocalMode(newMode);

    try {
      // 异步发送命令到设备
      console.log(`[Mode Toggle] Switching from ${previousMode === ABMateDeviceMode.GAME ? 'GAME' : 'NORMAL'} to ${newMode === ABMateDeviceMode.GAME ? 'GAME' : 'NORMAL'}`);
      await onToggleMode();
      console.log(`[Mode Toggle] ✅ Mode switched successfully`);
    } catch (error) {
      console.error('❌ 切换模式失败:', error);
      // 如果失败，恢复到之前的状态
      console.log(`[Mode Toggle] Reverting to previous mode: ${previousMode === ABMateDeviceMode.GAME ? 'GAME' : 'NORMAL'}`);
      setLocalMode(previousMode);
    } finally {
      setIsTogglingMode(false);
    }
  };

  const getBatteryIcon = (level: number) => {
    if (level > 75) return '🔋';
    if (level > 50) return '🔋';
    if (level > 25) return '🪫';
    return '🪫';
  };

  const getBatteryClass = (level: number) => {
    if (level > 50) return 'good';
    if (level > 20) return 'medium';
    return 'low';
  };

  return (
    <div className="device-info">
      {/* 设备名称 */}
      {deviceInfo.bluetoothName && (
        <div className="device-name-section">
          <div className="device-name-header">
            <h2>📱 {deviceInfo.bluetoothName}</h2>
            <button
              className="action-btn find-btn"
              onClick={() => handleFindDevice('both')}
              title="向设备播放声音以确认连接"
            >
              <span className="action-icon">🔔</span>
              <span className="action-label">播放声音</span>
            </button>
          </div>
          {deviceInfo.firmwareVersion && (
            <p className="device-version">固件版本: {deviceInfo.firmwareVersion}</p>
          )}
        </div>
      )}

      {/* 电池信息 */}
      <div className="battery-section">
        <h3>🔋 电池状态</h3>
        <div className="battery-grid">
          <div className="battery-item">
            <div className="battery-label">左耳</div>
            <div className={`battery-level ${getBatteryClass(deviceInfo.leftBattery || 0)}`}>
              {getBatteryIcon(deviceInfo.leftBattery || 0)}
              <span className="battery-percent">{deviceInfo.leftBattery || 0}%</span>
            </div>
          </div>

          <div className="battery-item">
            <div className="battery-label">右耳</div>
            <div className={`battery-level ${getBatteryClass(deviceInfo.rightBattery || 0)}`}>
              {getBatteryIcon(deviceInfo.rightBattery || 0)}
              <span className="battery-percent">{deviceInfo.rightBattery || 0}%</span>
            </div>
          </div>

          {deviceInfo.caseBattery !== undefined && (
            <div className="battery-item">
              <div className="battery-label">充电盒</div>
              <div className={`battery-level ${getBatteryClass(deviceInfo.caseBattery)}`}>
                {getBatteryIcon(deviceInfo.caseBattery)}
                <span className="battery-percent">{deviceInfo.caseBattery}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 音量控制 */}
      <div className="volume-section">
        <div className="volume-header">
          <span>🔊 音量</span>
          <span className="volume-value">{deviceInfo.volume || 0}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={deviceInfo.volume || 0}
          onChange={(e) => onVolumeChange(parseInt(e.target.value))}
          className="volume-slider"
        />
      </div>

      {/* 快捷功能 */}
      <div className="quick-actions">
        <button
          className={`action-btn mode-btn ${localMode === ABMateDeviceMode.GAME ? 'active' : ''}`}
          onClick={handleModeToggle}
          disabled={isTogglingMode}
          title={localMode === ABMateDeviceMode.GAME ? '点击切换到普通模式' : '点击切换到游戏模式'}
        >
          <span className="action-icon">🎮</span>
          <span className="action-label">
            {localMode === ABMateDeviceMode.GAME ? '游戏模式' : '普通模式'}
          </span>
        </button>

        <div className="find-device-group">
          <button
            className={`action-btn find-device-btn ${isFindingDevice ? 'finding' : ''}`}
            onClick={() => setShowFindOptions(!showFindOptions)}
            title={isFindingDevice ? '正在查找设备' : '查找设备选项'}
          >
            <span className="action-icon">{isFindingDevice ? '🔊' : '📍'}</span>
            <span className="action-label">{isFindingDevice ? '查找中' : '查找设备'}</span>
          </button>

          {/* 查找设备选项菜单 */}
          {showFindOptions && (
            <div className="find-options-menu">
              {!isFindingDevice ? (
                <>
                  <button
                    className="find-option"
                    onClick={() => {
                      handleFindDevice('both');
                      setShowFindOptions(false);
                    }}
                  >
                    🔊 两耳蜂鸣
                  </button>
                  <button
                    className="find-option"
                    onClick={() => {
                      handleFindDevice('left');
                      setShowFindOptions(false);
                    }}
                  >
                    🔉 左耳蜂鸣
                  </button>
                  <button
                    className="find-option"
                    onClick={() => {
                      handleFindDevice('right');
                      setShowFindOptions(false);
                    }}
                  >
                    🔉 右耳蜂鸣
                  </button>
                </>
              ) : (
                <button
                  className="find-option stop"
                  onClick={() => {
                    handleStopFinding();
                    setShowFindOptions(false);
                  }}
                >
                  ⏹️ 停止查找
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 设备详情 */}
      <div className="device-details">
        <h4>ℹ️ 设备信息</h4>
        <div className="detail-item">
          <span className="detail-label">🎧 蓝牙名称</span>
          <span className="detail-value">{deviceInfo.bluetoothName || 'Unknown'}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">📦 固件版本</span>
          <span className="detail-value">{deviceInfo.firmwareVersion || 'Unknown'}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">🔗 TWS 状态</span>
          <span className={`detail-value ${deviceInfo.twsConnected ? 'connected' : 'disconnected'}`}>
            {deviceInfo.twsConnected ? '✅ 已连接' : '❌ 未连接'}
          </span>
        </div>
        {deviceInfo.twsChannel && (
          <div className="detail-item">
            <span className="detail-label">🎵 当前声道</span>
            <span className="detail-value">
              {deviceInfo.twsChannel === 'left' ? '🎧 左声道' : '🎧 右声道'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
