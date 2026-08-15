import React, { useState } from 'react';
import { FileUp, FolderUp, Clipboard, Globe, Link2, MoreHorizontal, Check, X, Code, HardDrive, MessageSquare } from 'lucide-react';

interface QuickActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAttachFile: (file: any) => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: (enabled: boolean) => void;
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  isOpen,
  onClose,
  onAttachFile,
  webSearchEnabled,
  onToggleWebSearch,
}) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'apps' | 'more'>('menu');
  const [connectedApps, setConnectedApps] = useState<Record<string, boolean>>({
    GitHub: true,
    VSCode: true,
    OpenAI: true,
    Ollama: true,
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      onAttachFile({
        id: `att-${Date.now()}`,
        name: f.name,
        type: f.type.startsWith('image/') ? 'image' : 'document',
        size: `${(f.size / 1024).toFixed(1)} KB`,
      });
      onClose();
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onAttachFile({
          id: `att-${Date.now()}`,
          name: 'Clipboard Snippet.txt',
          type: 'code',
          size: `${text.length} chars`,
        });
      }
    } catch (err) {
      console.warn('Clipboard read error', err);
    }
    onClose();
  };

  const toggleAppConnection = (appName: string) => {
    setConnectedApps(prev => ({
      ...prev,
      [appName]: !prev[appName],
    }));
  };

  return (
    <div className="quick-actions-backdrop-v2" onClick={onClose}>
      <div className="quick-actions-popover-v2" onClick={e => e.stopPropagation()}>
        <div className="qa-header">
          <span className="qa-title">Input Hub</span>
          <button className="qa-close-btn" onClick={onClose}><X size={14} /></button>
        </div>

        {activeTab === 'menu' && (
          <div className="qa-menu-list">
            <label className="qa-item">
              <FileUp size={15} />
              <div className="qa-item-text">
                <span className="qa-item-title">Upload File</span>
                <span className="qa-item-sub">PDF, Images, Video, Audio, Code</span>
              </div>
              <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>

            <label className="qa-item">
              <FolderUp size={15} />
              <div className="qa-item-text">
                <span className="qa-item-title">Upload Folder</span>
                <span className="qa-item-sub">Attach an entire project directory</span>
              </div>
              <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>

            <button className="qa-item" onClick={handlePasteClipboard}>
              <Clipboard size={15} />
              <div className="qa-item-text">
                <span className="qa-item-title">Paste Clipboard</span>
                <span className="qa-item-sub">Auto-detect text, image, code, or URL</span>
              </div>
            </button>

            <button
              className={`qa-item ${webSearchEnabled ? 'active-chip' : ''}`}
              onClick={() => {
                onToggleWebSearch(!webSearchEnabled);
                onClose();
              }}
            >
              <Globe size={15} />
              <div className="qa-item-text">
                <span className="qa-item-title">🌐 Web Search</span>
                <span className="qa-item-sub">Enable live internet context search</span>
              </div>
              {webSearchEnabled && <Check size={14} className="qa-check-icon" />}
            </button>

            <button className="qa-item" onClick={() => setActiveTab('apps')}>
              <Link2 size={15} />
              <div className="qa-item-text">
                <span className="qa-item-title">Connect Apps</span>
                <span className="qa-item-sub">GitHub, Linear, Notion, Claude Code</span>
              </div>
            </button>

            <button className="qa-item" onClick={() => setActiveTab('more')}>
              <MoreHorizontal size={15} />
              <div className="qa-item-text">
                <span className="qa-item-title">More</span>
                <span className="qa-item-sub">Export, Import, Dev Tools</span>
              </div>
            </button>
          </div>
        )}

        {activeTab === 'apps' && (
          <div className="qa-apps-view">
            <div className="qa-subnav">
              <button className="qa-back-btn" onClick={() => setActiveTab('menu')}>← Back</button>
              <span className="qa-subtitle">App Connectors</span>
            </div>
            <div className="qa-apps-grid">
              {[
                { name: 'GitHub', cat: 'Development', icon: Code },
                { name: 'Cursor', cat: 'Development', icon: Code },
                { name: 'Google Drive', cat: 'Storage', icon: HardDrive },
                { name: 'Linear', cat: 'Productivity', icon: MessageSquare },
                { name: 'Slack', cat: 'Communication', icon: MessageSquare },
                { name: 'Ollama', cat: 'Local AI', icon: HardDrive },
              ].map(app => {
                const Icon = app.icon;
                const isConnected = !!connectedApps[app.name];
                return (
                  <div key={app.name} className="qa-app-card">
                    <div className="qa-app-left">
                      <Icon size={14} />
                      <div>
                        <span className="qa-app-name">{app.name}</span>
                        <span className="qa-app-cat">{app.cat}</span>
                      </div>
                    </div>
                    <button
                      className={`qa-connect-btn ${isConnected ? 'connected' : ''}`}
                      onClick={() => toggleAppConnection(app.name)}
                    >
                      {isConnected ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'more' && (
          <div className="qa-more-view">
            <div className="qa-subnav">
              <button className="qa-back-btn" onClick={() => setActiveTab('menu')}>← Back</button>
              <span className="qa-subtitle">Advanced Tools</span>
            </div>
            <div className="qa-menu-list">
              <button className="qa-item" onClick={onClose}>
                <span className="qa-item-title">Export Chat History</span>
              </button>
              <button className="qa-item" onClick={onClose}>
                <span className="qa-item-title">Import Conversation</span>
              </button>
              <button className="qa-item" onClick={onClose}>
                <span className="qa-item-title">Workspace Developer Console</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
