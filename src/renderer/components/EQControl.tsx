/**
 * EQ 均衡器组件
 */

import React from 'react';
import { ABMateEQMode, ABMateEQConfig } from '../types/ab-mate';
import './EQControl.css';

interface EQControlProps {
  eqConfig: ABMateEQConfig;
  onChange: (config: ABMateEQConfig) => void;
}

const EQ_MODES = [
  { value: ABMateEQMode.POPULAR, label: '流行' },
  { value: ABMateEQMode.ROCK, label: '摇滚' },
  { value: ABMateEQMode.CLASSIC, label: '古典' },
  { value: ABMateEQMode.JAZZ, label: '爵士' },
  { value: ABMateEQMode.BASS, label: '低音' },
  { value: ABMateEQMode.VOCAL, label: '人声' },
  { value: ABMateEQMode.CUSTOM, label: '自定义' },
];

const EQ_BANDS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export const EQControl: React.FC<EQControlProps> = ({ eqConfig, onChange }) => {
  const handleModeChange = (mode: ABMateEQMode) => {
    onChange({ ...eqConfig, mode });
  };

  const handleGainChange = (index: number, value: number) => {
    const newGains = [...eqConfig.gains];
    newGains[index] = value;
    onChange({ ...eqConfig, gains: newGains });
  };

  const resetEQ = () => {
    onChange({
      ...eqConfig,
      gains: new Array(10).fill(0),
    });
  };

  return (
    <div className="eq-control">
      <div className="eq-header">
        <h3>🎵 音效均衡器</h3>
      </div>

      {/* EQ 模式选择 */}
      <div className="eq-modes">
        {EQ_MODES.map((mode) => (
          <button
            key={mode.value}
            className={`eq-mode-btn ${eqConfig.mode === mode.value ? 'active' : ''}`}
            onClick={() => handleModeChange(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* EQ 滑块 */}
      <div className="eq-sliders">
        {eqConfig.gains.map((gain, index) => (
          <div key={index} className="eq-slider-container">
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={gain}
              onChange={(e) => handleGainChange(index, parseInt(e.target.value))}
              className="eq-slider"
              orient="vertical"
              disabled={eqConfig.mode !== ABMateEQMode.CUSTOM}
            />
            <div className="eq-value">{gain > 0 ? '+' : ''}{gain}</div>
            <div className="eq-label">{EQ_BANDS[index]}Hz</div>
          </div>
        ))}
      </div>

      {/* 重置按钮 */}
      {eqConfig.mode === ABMateEQMode.CUSTOM && (
        <div className="eq-actions">
          <button className="btn-reset" onClick={resetEQ}>
            🔄 重置
          </button>
        </div>
      )}
    </div>
  );
};
