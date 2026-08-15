import React from 'react';
import { Sparkles, Code, Cpu, Terminal, Zap } from 'lucide-react';
import logoImg from '../../logo.png';
import { ModelInfo } from '../../modelStore';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
  selectedModel: ModelInfo;
}

const SUGGESTED_PROMPTS = [
  {
    icon: Code,
    title: 'Analyze Repository',
    subtitle: 'Inspect & optimize workspace codebase architecture',
    prompt: 'Help me review and optimize my Eva workspace architecture.',
  },
  {
    icon: Cpu,
    title: 'Local Model Benchmark',
    subtitle: 'Evaluate Ollama & local inference latency',
    prompt: 'Run a performance check on my local LLM models and memory footprint.',
  },
  {
    icon: Terminal,
    title: 'Automate Tasks',
    subtitle: 'Create a background trigger & agent workflow',
    prompt: 'Help me set up an automated background task trigger in Eva OS.',
  },
  {
    icon: Zap,
    title: 'Creative Feature Ideas',
    subtitle: 'Brainstorm next features for project roadmap',
    prompt: 'Brainstorm creative feature suggestions and UX enhancements.',
  },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt, selectedModel }) => {
  return (
    <div className="empty-state-v2">
      <div className="empty-logo-wrapper">
        <img src={logoImg} alt="Eva OS" className="empty-logo-img" />
      </div>

      <h1 className="empty-welcome-title">Eva OS</h1>
      <p className="empty-welcome-sub">
        Connected to <strong className="empty-model-name">{selectedModel.name}</strong> ({selectedModel.provider})
      </p>

      <div className="suggested-prompts-grid-v2">
        {SUGGESTED_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="prompt-card-v2"
              onClick={() => onSelectPrompt(item.prompt)}
            >
              <div className="prompt-card-top">
                <Icon size={16} className="prompt-card-icon" />
                <span className="prompt-card-title">{item.title}</span>
              </div>
              <p className="prompt-card-sub">{item.subtitle}</p>
              <span className="prompt-card-action">
                Use prompt <Sparkles size={11} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
