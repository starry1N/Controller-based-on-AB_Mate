/**
 * ANC 控制组件
 */

import React from 'react';
import { ABMateANCMode } from '../types/ab-mate';
import './ANCControl.css';

interface ANCControlProps {
  ancMode: ABMateANCMode;
  ancLevel: number;
  tpLevel: number;
  onModeChange: (mode: ABMateANCMode) => void;
  onANCLevelChange: (level: number) => void;
  onTPLevelChange: (level: number) => void;
}

export const ANCControl: React.FC<ANCControlProps> = ({
  ancMode,
  ancLevel,
  tpLevel,
  onModeChange,
  onANCLevelChange,
  onTPLevelChange,
}) => {
  const getModeIcon = (mode: ABMateANCMode) => {
    switch (mode) {
      case ABMateANCMode.OFF: return '🔇';
      case ABMateANCMode.ANC: return '🎧';
      case ABMateANCMode.TRANSPARENCY: return '👂';
    }
  };

  const getModeLabel = (mode: ABMateANCMode) => {
    switch (mode) {
      case ABMateANCMode.OFF: return '关闭';
      case ABMateANCMode.ANC: return '降噪';
      case ABMateANCMode.TRANSPARENCY: return '透传';
    }
  };

  return (
    <div className="anc-control">
      <div className="anc-header">
        <h3>🎚️ ANC 控制</h3>
      </div>

      {/* ANC 模式切换 */}
      <div className="anc-modes">
        {[ABMateANCMode.OFF, ABMateANCMode.ANC, ABMateANCMode.TRANSPARENCY].map((mode) => (
          <button
            key={mode}
            className={`anc-mode-btn ${ancMode === mode ? 'active' : ''}`}
            onClick={() => onModeChange(mode)}
          >
            <span className="mode-icon">{getModeIcon(mode)}</span>
            <span className="mode-label">{getModeLabel(mode)}</span>
          </button>
        ))}
      </div>

      {/* ANC 等级控制 */}
      {ancMode === ABMateANCMode.ANC && (
        <div className="anc-level-control">
          <div className="level-header">
            <span>降噪强度</span>
            <span className="level-value">等级 {ancLevel}</span>
          </div>
          <div className="level-slider-container">
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={ancLevel}
              onChange={(e) => onANCLevelChange(parseInt(e.target.value))}
              className="level-slider anc-slider"
            />
            <div className="level-marks">
              {[1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={`level-mark ${ancLevel >= level ? 'active' : ''}`}
                >
                  •
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 透传等级控制 */}
      {ancMode === ABMateANCMode.TRANSPARENCY && (
        <div className="anc-level-control">
          <div className="level-header">
            <span>透传强度</span>
            <span className="level-value">等级 {tpLevel}</span>
          </div>
          <div className="level-slider-container">
            <input
              type="range"
              min="1"
              max="3"
              step="1"
              value={tpLevel}
              onChange={(e) => onTPLevelChange(parseInt(e.target.value))}
              className="level-slider tp-slider"
            />
            <div className="level-marks">
              {[1, 2, 3].map((level) => (
                <span
                  key={level}
                  className={`level-mark ${tpLevel >= level ? 'active' : ''}`}
                >
                  •
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 提示信息 */}
      <div className="anc-info">
        {ancMode === ABMateANCMode.OFF && '降噪和透传已关闭'}
        {ancMode === ABMateANCMode.ANC && '主动降噪可减少环境噪音'}
        {ancMode === ABMateANCMode.TRANSPARENCY && '透传模式让您听到周围声音'}
      </div>
    </div>
  );
};
