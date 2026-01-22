/**
 * 设备连接组件
 */

import React, { useState } from 'react';
import { ConnectionState } from '../types/ab-mate';
import './DeviceConnection.css';

interface DeviceConnectionProps {
  connectionState: ConnectionState;
  deviceName: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const DeviceConnection: React.FC<DeviceConnectionProps> = ({
  connectionState,
  deviceName,
  onConnect,
  onDisconnect,
}) => {
  const getStateText = () => {
    switch (connectionState) {
      case ConnectionState.DISCONNECTED:
        return '未连接';
      case ConnectionState.SCANNING:
        return '扫描中...';
      case ConnectionState.CONNECTING:
        return '连接中...';
      case ConnectionState.CONNECTED:
        return '已连接';
      case ConnectionState.ERROR:
        return '连接错误';
    }
  };

  const getStateClass = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return 'connected';
      case ConnectionState.ERROR:
        return 'error';
      case ConnectionState.SCANNING:
      case ConnectionState.CONNECTING:
        return 'connecting';
      default:
        return 'disconnected';
    }
  };

  const isConnecting = connectionState === ConnectionState.SCANNING || 
                       connectionState === ConnectionState.CONNECTING;

  return (
    <div className="device-connection">
      <div className={`connection-status ${getStateClass()}`}>
        <div className="status-indicator"></div>
        <div className="status-info">
          <div className="status-text">{getStateText()}</div>
          {deviceName && connectionState === ConnectionState.CONNECTED && (
            <div className="device-name">{deviceName}</div>
          )}
        </div>
      </div>

      <div className="connection-actions">
        {connectionState !== ConnectionState.CONNECTED ? (
          <button
            className="btn-connect"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? '连接中...' : '🔗 连接设备'}
          </button>
        ) : (
          <button
            className="btn-disconnect"
            onClick={onDisconnect}
          >
            ❌ 断开连接
          </button>
        )}
      </div>

      {connectionState === ConnectionState.ERROR && (
        <div className="error-message">
          连接失败，请检查设备是否开启蓝牙并重试
        </div>
      )}
    </div>
  );
};
