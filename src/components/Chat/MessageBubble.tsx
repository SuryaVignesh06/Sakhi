import React, { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, Share2, RotateCcw, FileText, Image as ImageIcon } from 'lucide-react';
import { ChatMessage } from './hooks/useChat';
import logoImg from '../../logo.png';
import { Markdown } from '../../AssistantStream';
import { TextAnimate } from '@/registry/magicui/text-animate';

interface MessageBubbleProps {
  message: ChatMessage;
  onRegenerate?: (text: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onRegenerate }) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.sender === 'user';

  return (
    <div className={`chat-bubble-row-v2 ${isUser ? 'user-row' : 'assistant-row'}`}>
      {isUser ? (
        <div className="user-bubble-v2 user-single-line-rectangle">
          {message.attachments && message.attachments.length > 0 && (
            <div className="bubble-attachments">
              {message.attachments.map(att => (
                <div key={att.id} className="attachment-chip">
                  {att.type === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
                  <span>{att.name}</span>
                </div>
              ))}
            </div>
          )}
          <span className="user-text">{message.text}</span>
        </div>
      ) : (
        <div className="assistant-bubble-container-v2 assistant-frameless">
          <div className="assistant-header-row">
            <img src={logoImg} alt="Assistant" className="assistant-avatar" />
            <span className="assistant-name">Eva OS</span>
            <span className="message-timestamp">{message.timestamp}</span>
          </div>

          <div className="assistant-text-content-v2 frameless-content">
            <TextAnimate animation="blurInUp" by="character" once>
              {message.text}
            </TextAnimate>
          </div>

          <div className="assistant-actions-bar-v2">
            <button className={`action-btn-v2 ${copied ? 'copied' : ''}`} onClick={handleCopy} title="Copy response">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              className={`action-btn-v2 ${liked === 'up' ? 'active-like' : ''}`}
              onClick={() => setLiked(prev => (prev === 'up' ? null : 'up'))}
              title="Good response"
            >
              <ThumbsUp size={13} />
            </button>
            <button
              className={`action-btn-v2 ${liked === 'down' ? 'active-dislike' : ''}`}
              onClick={() => setLiked(prev => (prev === 'down' ? null : 'down'))}
              title="Bad response"
            >
              <ThumbsDown size={13} />
            </button>
            <button className="action-btn-v2" onClick={handleCopy} title="Share response">
              <Share2 size={13} />
            </button>
            {onRegenerate && (
              <button className="action-btn-v2" onClick={() => onRegenerate(message.text)} title="Regenerate">
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
