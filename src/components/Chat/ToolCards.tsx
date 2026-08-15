import React, { useState } from 'react';
import { Terminal, Globe, Monitor, Code2, Database, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { ToolCall } from '../../events';

interface ToolCardsProps {
  tools: ToolCall[];
}

function getToolIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('browser')) return Globe;
  if (lower.includes('desktop') || lower.includes('screen')) return Monitor;
  if (lower.includes('coding') || lower.includes('code')) return Code2;
  if (lower.includes('memory') || lower.includes('db')) return Database;
  return Terminal;
}

export const ToolCards: React.FC<ToolCardsProps> = ({ tools }) => {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  if (!tools || tools.length === 0) return null;

  return (
    <div className="tool-cards-container-v2">
      {tools.map((tc, idx) => {
        const Icon = getToolIcon(tc.tool);
        const isExpanded = expandedTool === `${tc.tool}-${idx}`;

        return (
          <div key={idx} className={`tool-card-v2 ${tc.status}`}>
            <div
              className="tool-card-header"
              onClick={() => setExpandedTool(prev => (prev === `${tc.tool}-${idx}` ? null : `${tc.tool}-${idx}`))}
            >
              <div className="tool-card-left">
                <div className="tool-icon-box">
                  <Icon size={14} />
                </div>
                <div className="tool-name-info">
                  <span className="tool-title">{tc.title || tc.tool}</span>
                  <span className="tool-category">Tool Execution</span>
                </div>
              </div>

              <div className="tool-card-right">
                {tc.status === 'running' && (
                  <span className="tool-status-badge running">
                    <Loader2 size={11} className="animate-spin" /> Running
                  </span>
                )}
                {tc.status === 'completed' && (
                  <span className="tool-status-badge completed">
                    <CheckCircle size={11} /> Completed {tc.duration ? `(${tc.duration}ms)` : ''}
                  </span>
                )}
                {tc.status === 'failed' && (
                  <span className="tool-status-badge failed">
                    <AlertTriangle size={11} /> Failed
                  </span>
                )}
                <button className="tool-expand-btn">
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {/* Progress bar if running */}
            {tc.status === 'running' && tc.progress !== undefined && (
              <div className="tool-progress-bar-wrap">
                <div className="tool-progress-bar-fill" style={{ width: `${Math.min(100, tc.progress * 100)}%` }} />
              </div>
            )}

            {/* Expandable Logs */}
            {isExpanded && (
              <div className="tool-card-logs">
                {tc.message && <p className="tool-log-line">{tc.message}</p>}
                {tc.error && <p className="tool-log-error">{tc.error}</p>}
                <div className="tool-meta-row">
                  <span>Started: {new Date(tc.startedAt).toLocaleTimeString()}</span>
                  <span>Target: {tc.tool}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
