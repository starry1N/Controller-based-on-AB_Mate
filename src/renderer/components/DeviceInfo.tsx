/**
 * 设备信息和快捷控制组件
 */

import React from 'react';
import { ABMateDeviceInfo, ABMateDeviceMode } from '../types/ab-mate';
import './DeviceInfo.css';

interface DeviceInfoProps {
  deviceInfo: Partial<ABMateDeviceInfo>;
  onFindDevice: (side: 'left' | 'right' | 'both') => void;
  onToggleMode: () => void;
  onVolumeChange: (volume: number) => void;
}

export const DeviceInfo: React.FC<DeviceInfoProps> = ({
  deviceInfo,
  onFindDevice,
  onToggleMode,
  onVolumeChange,
}) => {
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
          className={`action-btn mode-btn ${deviceInfo.deviceMode === ABMateDeviceMode.GAME ? 'active' : ''}`}
          onClick={onToggleMode}
        >
          <span className="action-icon">🎮</span>
          <span className="action-label">
            {deviceInfo.deviceMode === ABMateDeviceMode.GAME ? '游戏模式' : '普通模式'}
          </span>
        </button>

        <button
          className="action-btn"
          onClick={() => onFindDevice('both')}
        >
          <span className="action-icon">📍</span>
          <span className="action-label">查找设备</span>
        </button>
      </div>

      {/* 设备详情 */}
      <div className="device-details">
        <div className="detail-item">
          <span className="detail-label">蓝牙名称</span>
          <span className="detail-value">{deviceInfo.bluetoothName || 'Unknown'}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">固件版本</span>
          <span className="detail-value">{deviceInfo.firmwareVersion || 'Unknown'}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">TWS 状态</span>
          <span className="detail-value">
            {deviceInfo.twsConnected ? '✅ 已连接' : '❌ 未连接'}
          </span>
        </div>
        {deviceInfo.twsChannel && (
          <div className="detail-item">
            <span className="detail-label">当前声道</span>
            <span className="detail-value">
              {deviceInfo.twsChannel === 'left' ? '左声道' : '右声道'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
