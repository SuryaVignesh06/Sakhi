import React, { useRef, useEffect } from 'react';
import { ChatMessage } from './hooks/useChat';
import { ThinkingState } from './hooks/useStreaming';
import { ToolCall } from '../../events';
import { MessageBubble } from './MessageBubble';
import { ThinkingTimeline } from './ThinkingTimeline';
import { ToolCards } from './ToolCards';
import { EmptyState } from './EmptyState';
import { ModelInfo } from '../../modelStore';

interface MessageListProps {
  messages: ChatMessage[];
  thinkingState: ThinkingState;
  activeTools: ToolCall[];
  selectedModel: ModelInfo;
  onSelectPrompt: (prompt: string) => void;
  onRegenerateMessage?: (text: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  thinkingState,
  activeTools,
  selectedModel,
  onSelectPrompt,
  onRegenerateMessage,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, thinkingState.stageHistory.length, activeTools.length]);

  if (messages.length === 0) {
    return <EmptyState onSelectPrompt={onSelectPrompt} selectedModel={selectedModel} />;
  }

  return (
    <div className="message-list-container-v2">
      <div className="message-list-inner-900">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} onRegenerate={onRegenerateMessage} />
        ))}

        {/* Real-time Tool Cards Execution */}
        <ToolCards tools={activeTools} />

        {/* Event-driven Thinking Timeline */}
        <ThinkingTimeline thinkingState={thinkingState} />

        <div ref={bottomRef} className="scroll-anchor" />
      </div>
    </div>
  );
};
