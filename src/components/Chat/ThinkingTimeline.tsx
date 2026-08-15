import React from 'react';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { ThinkingState } from './hooks/useStreaming';

interface ThinkingTimelineProps {
  thinkingState: ThinkingState;
}

export const ThinkingTimeline: React.FC<ThinkingTimelineProps> = ({ thinkingState }) => {
  if (!thinkingState.isThinking && thinkingState.stageHistory.length === 0) return null;

  return (
    <div className="thinking-timeline-v2">
      <div className="thinking-header-row">
        <Clock size={13} className="thinking-icon" />
        <span className="thinking-title">Backend Event Stream</span>
        {thinkingState.isThinking && (
          <span className="thinking-active-pill">
            <Loader2 size={11} className="animate-spin" />
            <span>Processing</span>
          </span>
        )}
      </div>

      <div className="thinking-stages-list">
        {thinkingState.stageHistory.map((item, idx) => {
          const isLatest = idx === thinkingState.stageHistory.length - 1;
          const isDone = item.stage === 'Completed' || (!isLatest && thinkingState.isThinking);

          return (
            <div key={idx} className={`stage-item ${isLatest ? 'latest' : ''} ${isDone ? 'done' : ''}`}>
              <div className="stage-status-icon">
                {isDone ? (
                  <CheckCircle2 size={12} className="icon-success" />
                ) : (
                  <Loader2 size={12} className="animate-spin icon-loader" />
                )}
              </div>
              <div className="stage-details">
                <span className="stage-name">{item.stage}</span>
                {item.description && <span className="stage-desc">{item.description}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
