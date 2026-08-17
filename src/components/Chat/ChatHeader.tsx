import React from 'react';
import { ChevronDown, Settings, Mic, Wifi, Sparkles } from 'lucide-react';
import logoImg from '../../logo.png';
import { ModelInfo } from '../../modelStore';
import { VoiceState } from '../../events';

interface ChatHeaderProps {
  selectedModel: ModelInfo;
  onOpenModelSelector: () => void;
  connectionStatus: 'connected' | 'reconnecting' | 'offline';
  voiceState: VoiceState;
  onOpenSettings?: () => void;
  isGenerating?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedModel,
  onOpenModelSelector,
  connectionStatus,
  voiceState,
  onOpenSettings,
  isGenerating = false,
}) => {
  return (
    <header className="chat-header-v2">
      <div className="chat-header-left">
        <div className="assistant-logo-wrapper">
          <img
            src={logoImg}
            alt="Eva OS"
            className={`assistant-logo-img ${isGenerating ? 'logo-rotating' : ''}`}
          />
        </div>
        <div className="assistant-header-title">
          <span className="assistant-brand-name">Eva OS</span>
          <span className="assistant-sub-tag">Chat V2</span>
        </div>
      </div>

      <div className="chat-header-center">
        <button
          className="model-selector-btn-v2"
          onClick={onOpenModelSelector}
          title="Change AI Model"
        >
          <Sparkles size={14} className="model-btn-sparkle" />
          <span className="model-btn-name">{selectedModel.name}</span>
          <span className="model-btn-provider-pill">{selectedModel.provider}</span>
          <ChevronDown size={14} className="model-btn-chevron" />
        </button>
      </div>

      <div className="chat-header-right">
        {/* Connection Status Pill */}
        <div className={`status-pill ${connectionStatus}`} title={`Status: ${connectionStatus}`}>
          <Wifi size={12} />
          <span className="status-text">{connectionStatus}</span>
        </div>

        {/* Voice Mode State */}
        {voiceState !== 'idle' && (
          <div className={`voice-state-badge voice-${voiceState}`} title={`Voice: ${voiceState}`}>
            <Mic size={12} className={voiceState === 'speaking' || voiceState === 'recording' ? 'pulse-icon' : ''} />
            <span className="voice-text">{voiceState}</span>
          </div>
        )}


      </div>
    </header>
  );
};
