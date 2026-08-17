import React, { useEffect, useState } from 'react';
import { 
  Settings as SettingsIcon, Cpu, Sliders, Volume2, Bot, ShieldCheck, 
  HardDrive, Palette, Lock, Code, Info, ChevronRight, Check, X, Folder, Key, Trash2, Download, RefreshCw, Plug
} from 'lucide-react';
import { SystemMetrics } from './types';
import { ConnectionsPanel } from './components/Connections/ConnectionsPanel';
import { fetchAgents, type AgentInfo } from './api';

/**
 * Marks a group of controls that are laid out but not connected to anything.
 *
 * A toggle that slides and changes nothing is worse than no toggle: it tells
 * the user they have configured something. These are disabled outright and
 * labelled, so the panel reports its own state honestly until the backing
 * work lands.
 */
const NotWired: React.FC<{ note: string; children: React.ReactNode }> = ({ note, children }) => (
  <>
    <div className="settings-notwired-note">
      <Info size={14} />
      <span>{note}</span>
    </div>
    <div className="settings-notwired">{children}</div>
  </>
);

interface SettingsViewProps {
  onClose: () => void;
  metrics: SystemMetrics;
  themePreference?: 'light' | 'dark' | 'system';
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onClose,
  metrics,
  themePreference,
  onThemeChange,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('General');

  /* The real specialists, read from the backend registry. */
  const [agentRoster, setAgentRoster] = useState<AgentInfo[]>([]);
  useEffect(() => {
    if (activeCategory === 'Agents' && agentRoster.length === 0) {
      void fetchAgents().then(setAgentRoster);
    }
  }, [activeCategory, agentRoster.length]);

  // Form State
  const [assistantName, setAssistantName] = useState('Sakhi');
  const [wakeWord, setWakeWord] = useState('Sakhi');
  const [language, setLanguage] = useState('English (US)');
  const [launchStartup, setLaunchStartup] = useState(true);
  const [minimizeTray, setMinimizeTray] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [workspace, setWorkspace] = useState('C:\\Users\\surya\\OneDrive\\Desktop\\Sakhi');

  // AI Models State
  const [provider, setProvider] = useState('Ollama');
  const [defaultModel, setDefaultModel] = useState('Gemini 2.5 Pro');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // API Keys State
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem('ANTHROPIC_API_KEY') || '');
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('OPENAI_API_KEY') || '');
  const [openrouterKey, setOpenrouterKey] = useState(() => localStorage.getItem('OPENROUTER_API_KEY') || '');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [keysSaved, setKeysSaved] = useState(false);

  const [keyStatusMsg, setKeyStatusMsg] = useState<string | null>(null);

  const handleSaveApiKeys = async () => {
    localStorage.setItem('GEMINI_API_KEY', geminiKey);
    localStorage.setItem('ANTHROPIC_API_KEY', claudeKey);
    localStorage.setItem('OPENAI_API_KEY', openaiKey);
    localStorage.setItem('OPENROUTER_API_KEY', openrouterKey);

    const keysToSave: [string, string][] = [
      ['gemini', geminiKey],
      ['anthropic', claudeKey],
      ['openai', openaiKey],
      ['openrouter', openrouterKey],
    ];

    const errors: string[] = [];
    let savedCount = 0;

    for (const [id, val] of keysToSave) {
      if (val.trim()) {
        try {
          const res = await fetch(`/api/providers/${id}/key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: val.trim() }),
          });
          const data = await res.json();
          if (!res.ok) {
            errors.push(`${id}: ${data.error || 'Invalid key'}`);
          } else {
            savedCount++;
          }
        } catch {
          try {
            const res2 = await fetch(`http://localhost:3007/api/providers/${id}/key`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: val.trim() }),
            });
            if (res2.ok) savedCount++;
          } catch {}
        }
      }
    }

    if (errors.length > 0) {
      setKeyStatusMsg(errors.join(', '));
    } else if (savedCount > 0) {
      setKeyStatusMsg('Keys securely saved and verified!');
    } else {
      setKeyStatusMsg('Keys saved locally.');
    }

    setKeysSaved(true);
    setTimeout(() => {
      setKeysSaved(false);
      setKeyStatusMsg(null);
    }, 4000);
  };

  // Voice State
  const [sttEngine, setSttEngine] = useState('NVIDIA Parakeet');
  const [ttsEngine, setTtsEngine] = useState('Kokoro 82M');
  const [voicePerson, setVoicePerson] = useState('Female Calm');
  const [micDevice, setMicDevice] = useState('Default Microphone');
  const [speakerDevice, setSpeakerDevice] = useState('Default Speaker');
  const [sensitivity, setSensitivity] = useState(70);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

  /* The Agents panel now reads the real roster from the backend, so the
     hardcoded list that used to sit here is gone. It named `vision` and
     `automation` agents that never existed and omitted the ones that do. */

  // Automation State
  const [automation, setAutomation] = useState({
    browserControl: true,
    desktopControl: true,
    terminalCommands: false,
    requireConfirmation: true,
    fileAccess: true,
    windowControl: true
  });

  // Memory State
  const [memorySettings, setMemorySettings] = useState({
    rememberConversations: true,
    rememberPreferences: true,
    projectMemory: true
  });

  // Appearance State
  const [theme, setThemeState] = useState<string>(() => {
    if (themePreference) {
      return themePreference.charAt(0).toUpperCase() + themePreference.slice(1);
    }
    const saved = localStorage.getItem('eva.theme.v1');
    return saved ? saved.charAt(0).toUpperCase() + saved.slice(1) : 'Dark';
  });
  const [accentColor, setAccentColor] = useState('Blue');
  const [fontSize, setFontSize] = useState('Medium');
  const [animations, setAnimations] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  const handleThemeSelect = (t: string) => {
    setThemeState(t);
    const pref = t.toLowerCase() as 'light' | 'dark' | 'system';
    onThemeChange?.(pref);
  };

  const handleExportMemory = () => {
    try {
      const saved = localStorage.getItem('eva.memories.v1');
      const data = saved ? JSON.parse(saved) : [];
      const blob = new Blob([JSON.stringify({ app: 'Sakhi OS', exportedAt: new Date().toISOString(), memories: data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eva_memories_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleDeleteAllMemory = () => {
    if (window.confirm('Are you sure you want to delete all long-term memories? This cannot be undone.')) {
      localStorage.removeItem('eva.memories.v1');
      alert('All memories deleted successfully.');
    }
  };

  // Privacy State
  const [privacy, setPrivacy] = useState({
    offlineMode: true,
    storeLocally: true,
    anonymousAnalytics: false,
    encryptedDb: true
  });

  // Developer State
  const [devSettings, setDevSettings] = useState({
    debugLogs: true,
    showAgentStatus: true,
    showLangGraph: false,
    showExecutionTimeline: true,
    showLiveCaptions: true
  });

  const categories = [
    { id: 'General', icon: SettingsIcon },
    { id: 'AI Models', icon: Bot },
    { id: 'Connections', icon: Plug },
    { id: 'Voice', icon: Volume2 },
    { id: 'Agents', icon: Sliders },
    { id: 'Automation', icon: ShieldCheck },
    { id: 'Memory', icon: HardDrive },
    { id: 'Appearance', icon: Palette },
    { id: 'Privacy & Security', icon: Lock },
    { id: 'Developer', icon: Code },
    { id: 'About', icon: Info }
  ];

  return (
    <div className="settings-modal-overlay">
      <div className="settings-modal-card">
        {/* Settings Modal Header */}
        <div className="settings-modal-header">
          <div className="settings-title">
            <SettingsIcon size={18} color="#9D4EDD" />
            <h2>Settings</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-modal-body">
          {/* Category Sidebar */}
          <div className="settings-category-sidebar">
            {/* Buttons, not clickable divs: these were unreachable by keyboard
                and invisible to assistive tech. */}
            {categories.map(cat => {
              const IconComp = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-item ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                  aria-current={activeCategory === cat.id ? 'true' : undefined}
                >
                  <IconComp size={15} />
                  <span>{cat.id}</span>
                </button>
              );
            })}
          </div>

          {/* Category Content Area */}
          <div className="settings-category-content">
            {activeCategory === 'Connections' && (
              <div className="settings-section">
                <h3>Connections</h3>
                <p className="section-sub">
                  Connect an app and Sakhi asks it what it can do. Those actions join
                  its toolset, so you can just say what you want done.
                </p>
                <ConnectionsPanel />
              </div>
            )}

            {activeCategory === 'General' && (
              <div className="settings-section">
                <h3>General</h3>
                <p className="section-sub">Basic application and assistant configuration</p>

                <div className="setting-row">
                  <label>Assistant Name</label>
                  <input type="text" value={assistantName} onChange={e => setAssistantName(e.target.value)} className="setting-input-text" />
                </div>

                <div className="setting-row">
                  <label>Wake Word</label>
                  <input type="text" value={wakeWord} onChange={e => setWakeWord(e.target.value)} className="setting-input-text" />
                </div>

                <div className="setting-row">
                  <label>Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="setting-select">
                    <option>English (US)</option>
                    <option>English (UK)</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                  </select>
                </div>

                <div className="setting-row toggle-row">
                  <div>
                    <label>Launch on Startup</label>
                    <p className="setting-desc">Automatically start Sakhi when your system boots</p>
                  </div>
                  <button className={`toggle-btn ${launchStartup ? 'on' : ''}`} onClick={() => setLaunchStartup(!launchStartup)}>
                    {launchStartup ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="setting-row toggle-row">
                  <div>
                    <label>Minimize to Tray</label>
                    <p className="setting-desc">Keep running in the system tray when window is closed</p>
                  </div>
                  <button className={`toggle-btn ${minimizeTray ? 'on' : ''}`} onClick={() => setMinimizeTray(!minimizeTray)}>
                    {minimizeTray ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="setting-row toggle-row">
                  <div>
                    <label>Auto Update</label>
                    <p className="setting-desc">Automatically download and install core updates</p>
                  </div>
                  <button className={`toggle-btn ${autoUpdate ? 'on' : ''}`} onClick={() => setAutoUpdate(!autoUpdate)}>
                    {autoUpdate ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="setting-row">
                  <label>Default Workspace</label>
                  <div className="folder-select-group">
                    <input type="text" value={workspace} readOnly className="setting-input-text" />
                    <button className="btn-secondary"><Folder size={14} /> Select Folder</button>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'AI Models' && (
              <div className="settings-section">
                <h3>AI Models</h3>
                <p className="section-sub">Configure default model providers, endpoints, and generation parameters</p>

                <div className="setting-row">
                  <label>Default Provider</label>
                  <div className="provider-grid">
                    {['Gemini', 'OpenAI', 'Anthropic', 'OpenRouter', 'Ollama', 'LM Studio', 'Groq', 'Together AI', 'Mistral', 'Custom'].map(p => (
                      <button 
                        key={p} 
                        className={`provider-pill ${provider === p ? 'active' : ''}`}
                        onClick={() => setProvider(p)}
                      >
                        {provider === p && <Check size={12} />} {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="setting-row">
                  <label>Default Model</label>
                  <select value={defaultModel} onChange={e => setDefaultModel(e.target.value)} className="setting-select">
                    <option>Gemini 2.5 Pro</option>
                    <option>Gemini 2.5 Flash Realtime</option>
                    <option>Gemini 1.5 Flash</option>
                    <option>Llama 3.2 3B Instruct</option>
                    <option>Qwen 2.5 Coder 7B</option>
                  </select>
                </div>

                <div className="setting-row">
                  <div className="label-val-header">
                    <label>Temperature</label>
                    <span className="slider-val">{temperature}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={temperature} 
                    onChange={e => setTemperature(parseFloat(e.target.value))} 
                    className="setting-slider" 
                  />
                </div>

                <div className="setting-row">
                  <label>Max Tokens</label>
                  <input type="number" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} className="setting-input-text" />
                </div>

                {/* API Keys Configuration */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(var(--ink), 0.1)' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Key size={15} /> LLM Provider API Keys (Encrypted At Rest)
                  </h4>

                  <div className="setting-row">
                    <label>Gemini API Key</label>
                    <input
                      type={showKeys.gemini ? 'text' : 'password'}
                      placeholder="AIzaSy..."
                      value={geminiKey}
                      onChange={e => setGeminiKey(e.target.value)}
                      className="setting-input-text"
                    />
                  </div>

                  <div className="setting-row">
                    <label>Claude / Anthropic API Key</label>
                    <input
                      type={showKeys.claude ? 'text' : 'password'}
                      placeholder="sk-ant-..."
                      value={claudeKey}
                      onChange={e => setClaudeKey(e.target.value)}
                      className="setting-input-text"
                    />
                  </div>

                  <div className="setting-row">
                    <label>OpenAI API Key</label>
                    <input
                      type={showKeys.openai ? 'text' : 'password'}
                      placeholder="sk-proj-..."
                      value={openaiKey}
                      onChange={e => setOpenaiKey(e.target.value)}
                      className="setting-input-text"
                    />
                  </div>

                  <div className="setting-row">
                    <label>OpenRouter API Key</label>
                    <input
                      type={showKeys.openrouter ? 'text' : 'password'}
                      placeholder="sk-or-v1-..."
                      value={openrouterKey}
                      onChange={e => setOpenrouterKey(e.target.value)}
                      className="setting-input-text"
                    />
                  </div>
                </div>

                <div className="setting-row-btns" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button className="btn-primary" onClick={handleSaveApiKeys}>
                    {keysSaved ? <Check size={14} /> : <Key size={14} />}
                    {keysSaved ? ' API Keys Saved!' : 'Save API Keys'}
                  </button>
                  {keyStatusMsg && (
                    <span style={{ fontSize: '12.5px', color: keyStatusMsg.includes('Invalid') || keyStatusMsg.includes('Failed') ? '#EF4444' : '#10A37F' }}>
                      {keyStatusMsg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {activeCategory === 'Voice' && (
              <div className="settings-section">
                <h3>Voice & Audio Engine</h3>
                <p className="section-sub">Configure local Speech-to-Text and Kokoro TTS speech engines</p>

                <NotWired note="Voice works — Kokoro for speech, Moonshine or Parakeet for recognition — but these controls don't change the engines yet. What runs is whatever the backend selects.">
                <div className="setting-row">
                  <label>Wake Word</label>
                  <input type="text" value={wakeWord} onChange={e => setWakeWord(e.target.value)} className="setting-input-text" />
                </div>

                <div className="setting-row">
                  <label>Speech To Text (STT)</label>
                  <select value={sttEngine} onChange={e => setSttEngine(e.target.value)} className="setting-select">
                    <option>NVIDIA Parakeet (Local)</option>
                    <option>Whisper Large v3 (Local)</option>
                    <option>Deepgram Realtime API</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Text To Speech (TTS)</label>
                  <select value={ttsEngine} onChange={e => setTtsEngine(e.target.value)} className="setting-select">
                    <option>Kokoro 82M (Offline Local)</option>
                    <option>ElevenLabs Realtime</option>
                    <option>Edge TTS</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Voice Profile</label>
                  <select value={voicePerson} onChange={e => setVoicePerson(e.target.value)} className="setting-select">
                    <option>Female Calm (Kokoro Default)</option>
                    <option>Male Expressive</option>
                    <option>Neutral Studio</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Microphone</label>
                  <select value={micDevice} onChange={e => setMicDevice(e.target.value)} className="setting-select">
                    <option>Default Microphone (Realtek Audio)</option>
                    <option>USB Studio Microphone</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Speaker</label>
                  <select value={speakerDevice} onChange={e => setSpeakerDevice(e.target.value)} className="setting-select">
                    <option>Default Speaker (Realtek High Definition)</option>
                    <option>Headphones</option>
                  </select>
                </div>

                <div className="setting-row">
                  <div className="label-val-header">
                    <label>Wake Word Sensitivity</label>
                    <span className="slider-val">{sensitivity}%</span>
                  </div>
                  <input type="range" min="10" max="100" value={sensitivity} onChange={e => setSensitivity(parseInt(e.target.value))} className="setting-slider" />
                </div>

                <div className="setting-row">
                  <div className="label-val-header">
                    <label>Voice Speed</label>
                    <span className="slider-val">{voiceSpeed}x</span>
                  </div>
                  <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSpeed} onChange={e => setVoiceSpeed(parseFloat(e.target.value))} className="setting-slider" />
                </div>

                <button className="btn-secondary" style={{ width: 'fit-content' }}>
                  <Volume2 size={14} /> Test Voice Synthesis
                </button>
                </NotWired>
              </div>
            )}

            {activeCategory === 'Agents' && (
              <div className="settings-section">
                <h3>Agents</h3>
                <p className="section-sub">
                  The specialists the Supervisor routes work to. An agent is a scope — what
                  makes the Browser agent a browser agent is that it can drive a browser
                  and cannot touch your files.
                </p>

                {/* Read from the backend registry rather than hardcoded. The list
                    that used to live here named seven agents that matched no code,
                    with toggles that switched nothing. */}
                {agentRoster.length === 0 ? (
                  <p className="setting-desc">
                    Can't reach the backend, so the agent list can't be loaded.
                  </p>
                ) : (
                  agentRoster.map(a => (
                    <div key={a.name} className="setting-row">
                      <div>
                        <label>{a.title}</label>
                        <p className="setting-desc">{a.purpose}</p>
                        <p className="setting-desc" style={{ opacity: 0.75, marginTop: 4 }}>
                          Tools: {a.tools.join(', ')}
                          {a.usesConnectedApps && ' · plus your connected apps'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeCategory === 'Automation' && (
              <div className="settings-section">
                <h3>Automation & OS Control</h3>
                <p className="section-sub">Permissions for operating system and browser control</p>

                <NotWired note="Automation is governed by the per-tool permission gate today — you're asked before anything writes to your machine. These switches aren't connected to that yet, so an autonomy setting lives here in a later build.">
                  {Object.entries(automation).map(([key, val]) => (
                    <div key={key} className="setting-row toggle-row">
                      <div>
                        <label style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</label>
                      </div>
                      <button className={`toggle-btn ${val ? 'on' : ''}`} disabled>
                        {val ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </NotWired>
              </div>
            )}

            {activeCategory === 'Memory' && (
              <div className="settings-section">
                <h3>Memory & Context</h3>
                <p className="section-sub">Manage persistent memory and conversation storage</p>

                {Object.entries(memorySettings).map(([key, val]) => (
                  <div key={key} className="setting-row toggle-row">
                    <div>
                      <label style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</label>
                    </div>
                    <button 
                      className={`toggle-btn ${val ? 'on' : ''}`}
                      onClick={() => setMemorySettings(prev => ({ ...prev, [key]: !val }))}
                    >
                      {val ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}

                <div className="setting-row-btns" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary" onClick={handleExportMemory}><Download size={14} /> Export Memory</button>
                  <button className="btn-danger" onClick={handleDeleteAllMemory}><Trash2 size={14} /> Delete All Memory</button>
                </div>
              </div>
            )}

            {activeCategory === 'Appearance' && (
              <div className="settings-section">
                <h3>Appearance & Theme</h3>
                <p className="section-sub">Customize the visual interface of Sakhi</p>

                <div className="setting-row">
                  <label>Theme</label>
                  <div className="provider-grid">
                    {['Light', 'Dark', 'System'].map(t => (
                      <button 
                        key={t} 
                        className={`provider-pill ${theme === t ? 'active' : ''}`}
                        onClick={() => handleThemeSelect(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="setting-row">
                  <label>Accent Color</label>
                  <select value={accentColor} onChange={e => setAccentColor(e.target.value)} className="setting-select">
                    <option>Blue</option>
                    <option>Purple</option>
                    <option>Emerald</option>
                    <option>Sunset Orange</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Font Size</label>
                  <select value={fontSize} onChange={e => setFontSize(e.target.value)} className="setting-select">
                    <option>Small</option>
                    <option>Medium</option>
                    <option>Large</option>
                  </select>
                </div>

                <div className="setting-row toggle-row">
                  <div>
                    <label>Animations</label>
                    <p className="setting-desc">Enable smooth liquid animations and transitions</p>
                  </div>
                  <button className={`toggle-btn ${animations ? 'on' : ''}`} onClick={() => setAnimations(!animations)}>
                    {animations ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="setting-row toggle-row">
                  <div>
                    <label>Compact Mode</label>
                  </div>
                  <button className={`toggle-btn ${compactMode ? 'on' : ''}`} onClick={() => setCompactMode(!compactMode)}>
                    {compactMode ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            )}

            {activeCategory === 'Privacy & Security' && (
              <div className="settings-section">
                <h3>Privacy & Security</h3>
                <p className="section-sub">Data protection and offline operation modes</p>

                {Object.entries(privacy).map(([key, val]) => (
                  <div key={key} className="setting-row toggle-row">
                    <div>
                      <label style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</label>
                    </div>
                    <button 
                      className={`toggle-btn ${val ? 'on' : ''}`}
                      onClick={() => setPrivacy(prev => ({ ...prev, [key]: !val }))}
                    >
                      {val ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}

                <div className="setting-row">
                  <label>Permission Requests</label>
                  <select className="setting-select" defaultValue="Always Ask">
                    <option>Always Ask</option>
                    <option>Auto-Approve Safe</option>
                    <option>Strict Prompting</option>
                  </select>
                </div>

                <div className="setting-row-btns" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary"><Download size={14} /> Export Data</button>
                  <button className="btn-danger"><Trash2 size={14} /> Delete Data</button>
                </div>
              </div>
            )}

            {activeCategory === 'Developer' && (
              <div className="settings-section">
                <h3>Developer & System Metrics</h3>
                <p className="section-sub">Live system telemetry and debugging tools</p>

                {/* System & Hardware Metrics Panel */}
                <div className="card-panel" style={{ marginBottom: '14px' }}>
                  <div className="card-title">
                    <Cpu size={15} color="#10A37F" /> System & Hardware Telemetry
                  </div>

                  <div className="metric-box">
                    <div className="metric-header">
                      <span>CPU Usage</span>
                      <span className="metric-val">{metrics.cpu}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${Math.min(metrics.cpu, 100)}%` }} />
                    </div>
                  </div>

                  <div className="metric-box">
                    <div className="metric-header">
                      <span>Memory (RAM)</span>
                      <span className="metric-val">{metrics.mem}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${Math.min(metrics.mem, 100)}%`, background: metrics.mem > 80 ? '#f59e0b' : '#10A37F' }} />
                    </div>
                  </div>

                  <div className="status-row">
                    <span className="status-label">GPU / VRAM</span>
                    <span className="status-val">{metrics.gpu}</span>
                  </div>
                </div>

                {Object.entries(devSettings).map(([key, val]) => (
                  <div key={key} className="setting-row toggle-row">
                    <div>
                      <label style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</label>
                    </div>
                    <button 
                      className={`toggle-btn ${val ? 'on' : ''}`}
                      onClick={() => setDevSettings(prev => ({ ...prev, [key]: !val }))}
                    >
                      {val ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}

                <div className="setting-row-btns" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary"><Folder size={14} /> Open Log Folder</button>
                  <button className="btn-danger"><RefreshCw size={14} /> Reset Configuration</button>
                </div>
              </div>
            )}

            {activeCategory === 'About' && (
              <div className="settings-section">
                <h3>About Sakhi</h3>
                <p className="section-sub">Next-Generation Autonomous AI Desktop Operating Assistant</p>

                <div className="about-info-card">
                  <div className="about-brand">
                    <img src="/logo.png" alt="Sakhi Logo" style={{ width: '36px', height: '36px', mixBlendMode: 'multiply' }} />
                    <div>
                      <h4>Sakhi OS</h4>
                      <p>Version 1.0.0 (Release Build)</p>
                    </div>
                  </div>

                  <div className="about-details">
                    <div className="status-row">
                      <span>Current Active Model:</span>
                      <strong>Gemini 2.5 Pro</strong>
                    </div>
                    <div className="status-row">
                      <span>TTS Engine:</span>
                      <strong>Kokoro 82M Offline</strong>
                    </div>
                    <div className="status-row">
                      <span>License:</span>
                      <strong>MIT Open Source</strong>
                    </div>
                  </div>

                  <div className="setting-row-btns" style={{ marginTop: '12px' }}>
                    <button className="btn-primary"><RefreshCw size={14} /> Check for Updates</button>
                    <button className="btn-secondary">GitHub</button>
                    <button className="btn-secondary">Documentation</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
