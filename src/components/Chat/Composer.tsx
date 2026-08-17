import React, { useRef, useState } from 'react';
import { Plus, Mic, Send, Globe, X, Paperclip } from 'lucide-react';
import { Attachment } from './hooks/useChat';
import { VoiceState } from '../../events';
import { QuickActionsMenu } from './QuickActionsMenu';
import { LiveWaveform } from '../ui/LiveWaveform';

interface ComposerProps {
  chatInput: string;
  setChatInput: (val: string) => void;
  onSendMessage: () => void;
  attachments: Attachment[];
  onAddAttachment: (item: Attachment) => void;
  onRemoveAttachment: (id: string) => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: (enabled: boolean) => void;
  voiceState: VoiceState;
}

export const Composer: React.FC<ComposerProps> = ({
  chatInput,
  setChatInput,
  onSendMessage,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  webSearchEnabled,
  onToggleWebSearch,
  voiceState,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  const hasContent = chatInput.trim().length > 0 || attachments.length > 0;

  return (
    <div className={`composer-container-v2 ${isFocused ? 'focused' : ''}`}>
      {/* Plus Menu Popover */}
      <QuickActionsMenu
        isOpen={isPlusMenuOpen}
        onClose={() => setIsPlusMenuOpen(false)}
        onAttachFile={onAddAttachment}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={onToggleWebSearch}
      />

      {/* Attachments & Active Chips Row */}
      {(attachments.length > 0 || webSearchEnabled) && (
        <div className="composer-chips-row">
          {webSearchEnabled && (
            <div className="composer-chip web-search-chip">
              <Globe size={12} />
              <span>🌐 Web Search Active</span>
              <button className="chip-remove-btn" onClick={() => onToggleWebSearch(false)}>
                <X size={11} />
              </button>
            </div>
          )}
          {attachments.map(att => (
            <div key={att.id} className="composer-chip attachment-chip">
              <Paperclip size={12} />
              <span>{att.name}</span>
              <button className="chip-remove-btn" onClick={() => onRemoveAttachment(att.id)}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <div className="composer-box-inner">
        <textarea
          ref={textareaRef}
          className="composer-textarea-v2"
          placeholder="Ask Eva OS anything..."
          rows={2}
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {/* Toolbar Footer */}
        <div className="composer-footer-v2">
          <div className="composer-left-actions">
            <button
              className="composer-action-btn plus-btn"
              onClick={() => setIsPlusMenuOpen(true)}
              title="Open Input Hub"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="composer-center-actions" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <LiveWaveform 
              active={voiceState === 'recording'} 
              processing={voiceState === 'transcribing' || voiceState === 'thinking'} 
            />
          </div>

          <div className="composer-right-actions">
            <button
              className={`composer-action-btn mic-btn ${voiceState !== 'idle' ? `voice-${voiceState}` : ''}`}
              title={`Voice mode: ${voiceState}`}
            >
              <Mic size={16} />
            </button>

            {/* Send button fades in smoothly without altering input width */}
            <button
              className={`composer-send-btn ${hasContent ? 'visible' : 'hidden'}`}
              onClick={onSendMessage}
              disabled={!hasContent}
              title="Send message"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
