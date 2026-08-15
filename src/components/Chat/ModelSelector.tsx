import React from 'react';
import { Search, RefreshCw, Check, AlertCircle, HardDrive, Cpu, ShieldCheck } from 'lucide-react';
import { ModelInfo, ProviderId, PROVIDERS } from '../../modelStore';
import { ModelFilterTag } from './hooks/useModelSelector';

interface ModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider: ProviderId;
  setActiveProvider: (p: ProviderId) => void;
  activeFilter: ModelFilterTag;
  setActiveFilter: (f: ModelFilterTag) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  models: ModelInfo[];
  isLoading: boolean;
  error: string | null;
  isBlocked: boolean;
  selectedModel: ModelInfo;
  onSelectModel: (m: ModelInfo) => void;
  onRefresh: () => void;
  localStats: {
    installedCount: number;
    ramUsage: string;
    status: string;
    detectionSource: string;
  };
}

const FILTER_TAGS: ModelFilterTag[] = [
  'All',
  'Free',
  'Paid',
  'Vision',
  'Reasoning',
  'Coding',
  'Thinking',
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  isOpen,
  onClose,
  activeProvider,
  setActiveProvider,
  activeFilter,
  setActiveFilter,
  searchQuery,
  setSearchQuery,
  models,
  isLoading,
  error,
  isBlocked,
  selectedModel,
  onSelectModel,
  onRefresh,
  localStats,
}) => {
  if (!isOpen) return null;

  return (
    <div className="model-selector-backdrop-v2" onClick={onClose}>
      <div className="model-selector-modal-v2" onClick={e => e.stopPropagation()}>
        {/* Provider Navigation Tabs */}
        <div className="ms-provider-tabs">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              className={`ms-provider-tab ${activeProvider === p.id ? 'active' : ''}`}
              onClick={() => setActiveProvider(p.id)}
            >
              <span>{p.label}</span>
              {p.id === 'local' && (
                <span className="ms-tab-badge">{localStats.installedCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search & Refresh Toolbar */}
        <div className="ms-toolbar">
          <div className="ms-search-box">
            <Search size={14} className="ms-search-icon" />
            <input
              type="text"
              placeholder={`Search ${PROVIDERS.find(p => p.id === activeProvider)?.label} models...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="ms-search-input"
            />
          </div>
          <button className="ms-refresh-btn" onClick={onRefresh} title="Refresh Catalogue">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filter Tags */}
        <div className="ms-filter-tags">
          {FILTER_TAGS.map(tag => (
            <button
              key={tag}
              className={`ms-filter-tag ${activeFilter === tag ? 'active' : ''}`}
              onClick={() => setActiveFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Local Provider Specific Telemetry */}
        {activeProvider === 'local' && (
          <div className="ms-local-telemetry-card">
            <div className="ms-telemetry-item">
              <HardDrive size={13} />
              <span>Auto-detected: <strong>{localStats.detectionSource}</strong></span>
            </div>
            <div className="ms-telemetry-item">
              <Cpu size={13} />
              <span>RAM Usage: <strong>{localStats.ramUsage}</strong></span>
            </div>
            <div className="ms-telemetry-item">
              <ShieldCheck size={13} />
              <span>Status: <strong className="status-green">{localStats.status}</strong></span>
            </div>
          </div>
        )}

        {/* Models List Area */}
        <div className="ms-model-list">
          {isLoading ? (
            <div className="ms-loading-state">
              <RefreshCw size={18} className="animate-spin" />
              <span>Loading catalogue...</span>
            </div>
          ) : isBlocked ? (
            <div className="ms-blocked-state">
              <AlertCircle size={20} className="text-warning" />
              <p>Direct browser request blocked for this provider. Needs backend proxy integration.</p>
            </div>
          ) : error ? (
            <div className="ms-error-state">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : models.length === 0 ? (
            <div className="ms-empty-state">
              <span>No models match current query/filter.</span>
            </div>
          ) : (
            models.map(m => {
              const isSelected = selectedModel.id === m.id;
              return (
                <div
                  key={m.id}
                  className={`ms-model-tile ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectModel(m)}
                >
                  <div className="ms-tile-info">
                    <div className="ms-tile-header">
                      <span className="ms-tile-name">{m.name}</span>
                      {m.recommended && <span className="ms-badge-rec">Recommended</span>}
                    </div>
                    <span className="ms-tile-id">{m.id}</span>
                    {m.description && <p className="ms-tile-desc">{m.description}</p>}
                  </div>

                  <div className="ms-tile-meta">
                    {m.supportsVision && <span className="ms-capability-tag">Vision</span>}
                    {m.supportsThinking && <span className="ms-capability-tag">Reasoning</span>}
                    {m.supportsTools && <span className="ms-capability-tag">Tools</span>}
                    {isSelected && <Check size={16} className="ms-check-icon" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
