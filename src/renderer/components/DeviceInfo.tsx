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
  onBluetoothNameChange?: (name: string) => void;
  onOTAUpgrade?: (file: File) => void;
}

export const DeviceInfo: React.FC<DeviceInfoProps> = ({
  deviceInfo,
  onFindDevice,
  onToggleMode,
  onVolumeChange,
  onBluetoothNameChange,
  onOTAUpgrade,
}) => {
  const [isFindingDevice, setIsFindingDevice] = useState(false);
  const [showFindOptions, setShowFindOptions] = useState(false);
  const [localMode, setLocalMode] = useState<ABMateDeviceMode>(ABMateDeviceMode.NORMAL);
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isChangingName, setIsChangingName] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // 当设备模式更新时，同步本地状态
  useEffect(() => {
    if (deviceInfo.deviceMode !== undefined) {
      setLocalMode(deviceInfo.deviceMode);
    }
  }, [deviceInfo.deviceMode]);

  // 初始化编辑名称
  useEffect(() => {
    if (deviceInfo.bluetoothName) {
      setEditingName(deviceInfo.bluetoothName);
    }
  }, [deviceInfo.bluetoothName]);

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

  const handleStartEditName = () => {
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditingName(deviceInfo.bluetoothName || '');
  };

  const handleSaveBluetoothName = async () => {
    if (!editingName.trim()) {
      console.error('蓝牙名称不能为空');
      return;
    }

    if (editingName === deviceInfo.bluetoothName) {
      setIsEditingName(false);
      return;
    }

    setIsChangingName(true);
    try {
      await onBluetoothNameChange?.(editingName.trim());
      setIsEditingName(false);
    } catch (error) {
      console.error('设置蓝牙名称失败:', error);
      // 恢复为原值
      setEditingName(deviceInfo.bluetoothName || '');
    } finally {
      setIsChangingName(false);
    }
  };

  const handleStopFinding = () => {
    onFindDevice('stop');
    setIsFindingDevice(false);
  };

  // 处理OTA升级
  const handleOTAClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型（根据固件文件扩展名调整）
    const validExtensions = ['.bin', '.fw', '.hex'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      console.error('无效的固件文件格式，支持的格式:', validExtensions.join(', '));
      alert(`无效的固件文件格式\n支持的格式: ${validExtensions.join(', ')}`);
      event.target.value = ''; // 清空选择
      return;
    }

    setIsUpgrading(true);
    try {
      console.log(`🔄 开始OTA升级: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
      await onOTAUpgrade?.(file);
      console.log('✅ OTA升级成功');
    } catch (error) {
      console.error('❌ OTA升级失败:', error);
      alert(`OTA升级失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUpgrading(false);
      event.target.value = ''; // 清空选择，允许再次选择同一文件
    }
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
          {isEditingName ? (
            <div className="name-edit-container">
              <input
                type="text"
                className="name-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value.substring(0, 32))}
                placeholder="输入蓝牙名称"
                maxLength={32}
                disabled={isChangingName}
                autoFocus
              />
              <div className="name-edit-controls">
                <button
                  className="name-btn save"
                  onClick={handleSaveBluetoothName}
                  disabled={isChangingName || !editingName.trim()}
                  title="保存蓝牙名称"
                >
                  {isChangingName ? '保存中...' : '✓ 保存'}
                </button>
                <button
                  className="name-btn cancel"
                  onClick={handleCancelEditName}
                  disabled={isChangingName}
                  title="取消编辑"
                >
                  ✕ 取消
                </button>
              </div>
              <p className="name-char-count">{editingName.length}/32</p>
            </div>
          ) : (
            <div className="name-display-container">
              <h2 onClick={handleStartEditName} className="device-name-display" title="点击编辑蓝牙名称">
                📱 {deviceInfo.bluetoothName}
              </h2>
              <button
                className="name-edit-btn"
                onClick={handleStartEditName}
                title="编辑蓝牙名称"
              >
                ✏️
              </button>
            </div>
          )}
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

        <button
          className={`action-btn ota-btn ${isUpgrading ? 'upgrading' : ''}`}
          onClick={handleOTAClick}
          disabled={isUpgrading}
          title={isUpgrading ? '正在升级固件...' : '升级固件'}
        >
          <span className="action-icon">{isUpgrading ? '⏳' : '🔄'}</span>
          <span className="action-label">{isUpgrading ? '升级中' : 'OTA升级'}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin,.fw,.hex"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

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
