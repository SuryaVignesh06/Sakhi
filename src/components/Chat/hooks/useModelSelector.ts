import { useState, useEffect, useMemo, useCallback } from 'react';
import { ModelInfo, ProviderId, fetchModels, getSelected, setSelected } from '../../../modelStore';

export type ModelFilterTag = 'All' | 'Free' | 'Paid' | 'Vision' | 'Reasoning' | 'Coding' | 'Thinking';

const DEFAULT_MODEL: ModelInfo = {
  id: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  provider: 'gemini',
  supportsVision: true,
  supportsTools: true,
  supportsThinking: true,
  recommended: true,
  description: 'Most capable model for complex reasoning and coding.',
};

export function useModelSelector() {
  const [activeProvider, setActiveProvider] = useState<ProviderId>('gemini');
  const [activeFilter, setActiveFilter] = useState<ModelFilterTag>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([DEFAULT_MODEL]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelInfo>(() => getSelected() || DEFAULT_MODEL);
  const [isOpen, setIsOpen] = useState(false);

  // Local models specific telemetry info
  const [localStats, setLocalStats] = useState({
    installedCount: 0,
    ramUsage: '1.4 GB',
    status: 'Ready',
    detectionSource: 'Ollama / LM Studio',
  });

  const loadProviderModels = useCallback(async (provider: ProviderId) => {
    setIsLoading(true);
    setError(null);
    setIsBlocked(false);

    try {
      const res = await fetchModels(provider);
      setModels(res.models || []);
      if (res.error) setError(res.error);
      if (res.blocked) setIsBlocked(true);

      if (provider === 'local') {
        setLocalStats(prev => ({
          ...prev,
          installedCount: res.models ? res.models.length : 0,
          status: res.models && res.models.length > 0 ? 'Active' : 'Offline / Unreachable',
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviderModels(activeProvider);
  }, [activeProvider, loadProviderModels]);

  const selectModel = useCallback((model: ModelInfo) => {
    setSelectedModel(model);
    setSelected(model);
    setIsOpen(false);
  }, []);

  const filteredModels = useMemo(() => {
    return models.filter(m => {
      // Search match
      const matchesSearch =
        searchQuery.trim() === '' ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Tag filter
      switch (activeFilter) {
        case 'Free':
          return !m.pricePer1M || m.pricePer1M === 0;
        case 'Paid':
          return typeof m.pricePer1M === 'number' && m.pricePer1M > 0;
        case 'Vision':
          return !!m.supportsVision;
        case 'Reasoning':
        case 'Thinking':
          return !!m.supportsThinking;
        case 'Coding':
          return !!m.supportsTools || m.id.includes('coder') || m.name.toLowerCase().includes('code');
        case 'All':
        default:
          return true;
      }
    });
  }, [models, searchQuery, activeFilter]);

  return {
    isOpen,
    setIsOpen,
    activeProvider,
    setActiveProvider,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    models: filteredModels,
    rawModelCount: models.length,
    isLoading,
    error,
    isBlocked,
    selectedModel,
    selectModel,
    refresh: () => loadProviderModels(activeProvider),
    localStats,
  };
}
