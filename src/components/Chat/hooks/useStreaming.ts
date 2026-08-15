import { useState, useCallback } from 'react';
import { AppEvent, PlannerStage, ToolCall, VoiceState } from '../../../events';

export interface ThinkingState {
  currentStage: PlannerStage | null;
  stageHistory: { stage: PlannerStage; description?: string; at: number }[];
  isThinking: boolean;
}

export function useStreaming() {
  const [thinkingState, setThinkingState] = useState<ThinkingState>({
    currentStage: null,
    stageHistory: [],
    isThinking: false,
  });

  const [activeTools, setActiveTools] = useState<Record<string, ToolCall>>({});
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('connected');

  const processEvent = useCallback((event: AppEvent) => {
    switch (event.type) {
      case 'conversation.started':
        setIsGenerating(true);
        setThinkingState({ currentStage: 'Understanding Request', stageHistory: [{ stage: 'Understanding Request', at: Date.now() }], isThinking: true });
        break;

      case 'planner.stage':
        setThinkingState(prev => ({
          currentStage: event.payload.stage,
          stageHistory: [...prev.stageHistory, { stage: event.payload.stage, description: event.payload.description, at: event.timestamp }],
          isThinking: event.payload.stage !== 'Completed',
        }));
        if (event.payload.stage === 'Completed') {
          setIsGenerating(false);
        }
        break;

      case 'tool.started':
        setActiveTools(prev => ({
          ...prev,
          [event.payload.tool]: {
            tool: event.payload.tool,
            title: event.payload.title,
            status: 'running',
            startedAt: event.timestamp,
            progress: 0,
          },
        }));
        break;

      case 'tool.progress':
        setActiveTools(prev => ({
          ...prev,
          [event.payload.tool]: {
            ...prev[event.payload.tool],
            progress: event.payload.progress,
            message: event.payload.message,
          },
        }));
        break;

      case 'tool.completed':
        setActiveTools(prev => ({
          ...prev,
          [event.payload.tool]: {
            ...prev[event.payload.tool],
            status: 'completed',
            duration: event.payload.duration,
          },
        }));
        break;

      case 'tool.failed':
        setActiveTools(prev => ({
          ...prev,
          [event.payload.tool]: {
            ...prev[event.payload.tool],
            status: 'failed',
            error: event.payload.error,
          },
        }));
        break;

      case 'response.chunk':
        setIsGenerating(true);
        break;

      case 'response.completed':
        setIsGenerating(false);
        setThinkingState(prev => ({ ...prev, isThinking: false, currentStage: 'Completed' }));
        break;

      case 'voice.state':
        setVoiceState(event.payload.state);
        break;

      default:
        break;
    }
  }, []);

  const resetStreaming = useCallback(() => {
    setThinkingState({ currentStage: null, stageHistory: [], isThinking: false });
    setActiveTools({});
    setIsGenerating(false);
  }, []);

  return {
    thinkingState,
    activeTools: Object.values(activeTools),
    voiceState,
    isGenerating,
    connectionStatus,
    setConnectionStatus,
    processEvent,
    resetStreaming,
  };
}
