import React from 'react';
import { Cpu, HardDrive, ShieldCheck } from 'lucide-react';

interface StatusBarProps {
  activeModelName: string;
  isGenerating: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ activeModelName, isGenerating }) => {
  return (
    <footer className="status-bar-v2">
      <div className="sb-left">
        <span className="sb-item">
          <ShieldCheck size={11} className="sb-icon text-success" />
          <span>Eva Event Bus: <strong>Active</strong></span>
        </span>
        <span className="sb-divider">•</span>
        <span className="sb-item">
          <Cpu size={11} className="sb-icon" />
          <span>Model: <strong>{activeModelName}</strong></span>
        </span>
      </div>

      <div className="sb-right">
        <span className="sb-item">
          <HardDrive size={11} className="sb-icon" />
          <span>State: <strong>{isGenerating ? 'Streaming Output...' : 'Idle'}</strong></span>
        </span>
      </div>
    </footer>
  );
};
