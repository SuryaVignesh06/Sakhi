export type AgentState = 'LISTENING' | 'THINKING' | 'SPEAKING' | 'IDLE';

export interface SystemMetrics {
  cpu: number;
  mem: number;
  gpu: string | number;
  voiceLevel: number;
}

export type EngineMode = 'online' | 'offline';
export type ViewMode = 'voice' | 'chat';

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  type: 'local' | 'cloud';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
}

export interface ThoughtStep {
  id: string;
  title: string;
  description: string;
  status: 'done' | 'active' | 'pending';
}

export interface AgentMode {
  id: string;
  name: string;
  gradient: string;
  active?: boolean;
}

export interface WSMessage {
  type: 'state' | 'log' | 'metrics' | 'models' | 'model_changed';
  state?: AgentState;
  text?: string;
  cpu?: number;
  mem?: number;
  gpu?: string | number;
  voiceLevel?: number;
  models?: ModelItem[];
  selectedModel?: string;
}
