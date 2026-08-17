import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Home, MessageCircle, FolderGit2, Box, CheckCircle, Users, Zap, LayoutGrid, Layers, Settings,
  ChevronDown, CheckSquare, Clock, TrendingUp, Circle, CheckCircle2,
  Paperclip, Mic, Globe, FileText, ArrowRight, ChevronRight, ChevronLeft, X,
  Brain, Cpu, HardDrive, Database, Calendar, Video, Search, Plus, Trash2, Edit3,
  Sparkles, Activity, Check, Menu, PanelRight, Send, Volume2, VolumeX, AudioLines,
  Copy, ThumbsUp, ThumbsDown, Share2, RotateCcw, Download
} from 'lucide-react';
import logoImg from './logo.png';
import orbImg from './orb.png';
import SoftAurora from './SoftAurora';
import BackgroundShader from './components/BackgroundShader';
import NoiseBackground from './components/NoiseBackground';
import SettingsView from './SettingsView';
import { GoogleCalendarView } from './GoogleCalendarView';
import CalendarView from './CalendarView';
import ModelSelector from './ModelSelector';
import AssistantStream, { Markdown, cleanChatText } from './AssistantStream';
import { useAssistantStream, useSessionFlags } from './useAssistantStream';
import ChatView, { type ChatMessageItem } from './ChatView';
import ProjectsView from './ProjectsView';
import PlannerView from './PlannerView';
import BooksView from './BooksView';
import { type TaskItem } from './TasksView';
import type { Project } from './api';
import {
  answerPermission as postPermission, API_BASE, backendProvider, cancelChat,
  fetchSystem, LIVE_EVENTS_URL, sendChat, type SystemInfo,
} from './api';
import { getSelected } from './modelStore';
import { preloadSpeech, speak as speakNow, stopSpeaking } from './speech';
import { useDictation } from './useDictation';
import { useMicLevel } from './useMicLevel';
import { LiveWaveform } from './components/ui/live-waveform';
import { useWakeWord } from './useWakeWord';
import { useVoiceCall } from './useVoiceCall';
import PlusMenu, { type Attachment } from './PlusMenu';
import { AnimatedThemeToggler } from './AnimatedThemeToggler';
import { useTheme } from './theme';
import { TasksView } from './TasksView';
import ChatPage from './components/Chat/ChatPage';
import { TextAnimate } from '@/registry/magicui/text-animate';
import VoiceAgentOverlay from './components/VoiceAgentOverlay';
import { LiquidGlassCard } from './components/ui/liquid-glass';
import GradientWaves from './components/ui/GradientWaves';

/* ─── DASHBOARD GRAPHIC SVGS ────────────────────────────────────────── */
const CardMiniWave = () => (
  <svg width="100%" height="16" viewBox="0 0 60 16" fill="none" style={{ marginTop: 'auto', flexShrink: 0 }}>
    <path
      d="M2 10 C10 6, 18 14, 26 10 C34 6, 42 14, 50 10 C54 8, 57 9, 58 10"
      stroke="rgba(255, 255, 255, 0.16)"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

const GlowingSineWave = ({ color = "#10A37F" }: { color?: string }) => (
  <svg width="100%" height="20" viewBox="0 0 110 22" preserveAspectRatio="none" fill="none" style={{ flex: 1, maxWidth: 70, minWidth: 35, marginLeft: 'auto' }}>
    <path
      d="M2 11 C14 3, 24 19, 36 11 C48 3, 58 19, 70 11 C80 4, 92 18, 104 11"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="104" cy="11" r="3.5" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
  </svg>
);

const BrainDotMatrix = () => (
  <div className="brain-matrix-container" aria-hidden="true">
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
      {/* Background Matrix Dots */}
      {Array.from({ length: 8 }).map((_, r) =>
        Array.from({ length: 12 }).map((_, c) => (
          <circle
            key={`${r}-${c}`}
            cx={10 + c * 9}
            cy={10 + r * 11}
            r="1"
            fill="rgba(255, 255, 255, 0.10)"
          />
        ))
      )}
      {/* Brain Silhouette with Neural Nodes */}
      <g filter="drop-shadow(0 0 10px rgba(16, 163, 127, 0.35))">
        <path
          d="M48 26 C40 20 30 24 28 34 C24 40 28 48 32 52 C28 58 32 68 40 70 C48 72 54 66 58 60 C62 66 68 72 76 70 C84 68 88 58 84 52 C88 48 92 40 88 34 C86 24 76 20 68 26 C62 20 54 20 48 26 Z"
          fill="rgba(16, 163, 127, 0.08)"
          stroke="#10A37F"
          strokeWidth="1.4"
          strokeDasharray="3 2"
        />
        <path d="M58 24 V 72" stroke="#10A37F" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        {/* Nodes */}
        <circle cx="42" cy="38" r="2.5" fill="#10A37F" />
        <circle cx="74" cy="38" r="2.5" fill="#10A37F" />
        <circle cx="50" cy="50" r="3" fill="#FFFFFF" />
        <circle cx="66" cy="50" r="3" fill="#FFFFFF" />
        <circle cx="44" cy="62" r="2.5" fill="#10A37F" />
        <circle cx="72" cy="62" r="2.5" fill="#10A37F" />
      </g>
    </svg>
  </div>
);

/* ─── FULL BACKGROUND SHADER GRADIENT + GRAIN ────────────────────────
   The shader canvas paints the animated gradient; the noise layer sits on
   top of it (and on top of the frosted overlay) so the grain stays crisp
   instead of being blurred back into flat colour. */
const BackgroundAnimation = ({ isDark = true }: { isDark?: boolean; paused?: boolean }) => {
  return (
    <>
      <BackgroundShader isDark={isDark} />
      <NoiseBackground />
    </>
  );
};

/* ─── CUSTOM ICON COMPONENTS ─────────────────────────────────────── */
interface CustomIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const HomeCustomIcon = ({ size = 20, className = '' }: CustomIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      d="M8.737 8.737a21.49 21.49 0 0 1 3.308-2.724m0 0c3.063-2.026 5.99-2.641 7.331-1.3 1.827 1.828.026 6.591-4.023 10.64-4.049 4.049-8.812 5.85-10.64 4.023-1.33-1.33-.736-4.218 1.249-7.253m6.083-6.11c-3.063-2.026-5.99-2.641-7.331-1.3-1.827 1.828-.026 6.591 4.023 10.64m3.308-9.34a21.497 21.497 0 0 1 3.308 2.724m2.775 3.386c1.985 3.035 2.579 5.923 1.248 7.253-1.336 1.337-4.245.732-7.295-1.275M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"
    />
  </svg>
);

const ProjectsCustomIcon = ({ size = 20, className = '' }: CustomIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path
      fillRule="evenodd"
      d="M3 6a2 2 0 0 1 2-2h5.532a2 2 0 0 1 1.536.72l1.9 2.28H3V6Zm0 3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H3Z"
      clipRule="evenodd"
    />
  </svg>
);

const PlannerCustomIcon = ({ size = 20, className = '' }: CustomIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M9 6c0-1.65685 1.3431-3 3-3s3 1.34315 3 3-1.3431 3-3 3-3-1.34315-3-3Zm2 3.62992c-.1263-.04413-.25-.08799-.3721-.13131-1.33928-.47482-2.49256-.88372-4.77995-.8482C4.84875 8.66593 4 9.46413 4 10.5v7.2884c0 1.0878.91948 1.8747 1.92888 1.8616 1.283-.0168 2.04625.1322 2.79671.3587.29285.0883.57733.1863.90372.2987l.00249.0008c.11983.0413.24534.0845.379.1299.2989.1015.6242.2088.9892.3185V9.62992Zm2-.00374V20.7551c.5531-.1678 1.0379-.3374 1.4545-.4832.2956-.1034.5575-.1951.7846-.2653.7257-.2245 1.4655-.3734 2.7479-.3566.5019.0065.9806-.1791 1.3407-.4788.3618-.3011.6723-.781.6723-1.3828V10.5c0-.58114-.2923-1.05022-.6377-1.3503-.3441-.29904-.8047-.49168-1.2944-.49929-2.2667-.0352-3.386.36906-4.6847.83812-.1256.04539-.253.09138-.3832.13765Z" />
  </svg>
);

const BooksCustomIcon = ({ size = 20, className = '' }: CustomIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path
      fillRule="evenodd"
      d="M6 2a2 2 0 0 0-2 2v15a3 3 0 0 0 3 3h12a1 1 0 1 0 0-2h-2v-2h2a1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-8v16h5v2H7a1 1 0 1 1 0-2h1V2H6Z"
      clipRule="evenodd"
    />
  </svg>
);

/* ─── NAV DATA ───────────────────────────────────────────────────────
   The rail listed four destinations and then ran out, leaving most of a
   1000px column empty — while Tasks, Calendar, Memory, Agents, Automations,
   Tools and Integrations were all fully built views below with no way to
   reach them. Every entry here routes to a branch that already exists in the
   content switch; nothing is a placeholder.

   Grouping rather than one long list: twelve undifferentiated rows is a menu
   to be read, three labelled runs of four is a shape to be recognised. */
const NAV_GROUPS: {
  id: string;
  label: string;
  items: { name: string; icon: React.ComponentType<any>; label?: string }[];
}[] = [
  {
    id: 'work',
    label: 'Workspace',
    items: [
      { name: 'Home',     icon: HomeCustomIcon },
      { name: 'Chat',     icon: MessageCircle },
      { name: 'Projects', icon: ProjectsCustomIcon },
      { name: 'Books',    icon: BooksCustomIcon },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    items: [
      { name: 'Planner',  icon: PlannerCustomIcon },
      { name: 'Tasks',    icon: CheckSquare },
      { name: 'Calendar', icon: Calendar },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { name: 'Memory',       icon: Brain },
      { name: 'Agents',       icon: Users },
      { name: 'Automations',  icon: Zap },
      { name: 'Tools',        icon: LayoutGrid },
      { name: 'Integrations', icon: Layers },
    ],
  },
];

/* ─── SYSTEM PROCESSES BREAKDOWN DATA ────────────────────────────── */
const SYSTEM_PROCESSES: Record<string, { name: string; usage: string; color: string }[]> = {
  cpu: [
    { name: 'Vite Dev Server', usage: '11.2%', color: '#F5F5F5' },
    { name: 'Electron Main Engine', usage: '6.4%', color: '#10A37F' },
    { name: 'Kokoro TTS Inference', usage: '4.1%', color: '#22C55E' },
    { name: 'System Idle', usage: '78.3%', color: '#666666' },
  ],
  gpu: [
    { name: 'Gemini 2.5 Pro Inference', usage: '8.5%', color: '#10A37F' },
    { name: 'Ferrofluid WebGL Canvas', usage: '3.1%', color: '#F5F5F5' },
    { name: 'NVENC Video Pipeline', usage: '0.4%', color: '#22C55E' },
  ],
  ram: [
    { name: 'Node.js Worker Runtime', usage: '1.4 GB', color: '#10A37F' },
    { name: 'Electron App Renderer', usage: '820 MB', color: '#B4B4B4' },
    { name: 'OS System Services', usage: '4.1 GB', color: '#666666' },
  ],
  disk: [
    { name: 'Sakhi Workspace', usage: '12.4 GB', color: '#10A37F' },
    { name: 'Local Model Weights', usage: '8.2 GB', color: '#22C55E' },
    { name: 'Cache & Artifact Store', usage: '2.1 GB', color: '#B4B4B4' },
  ],
};

/* ─── CALENDAR DATES & MEETINGS DATA ────────────────────────────── */
const CALENDAR_DATES = [
  { day: 'MON', date: '03', fullDate: '2026-08-03' },
  { day: 'TUE', date: '04', fullDate: '2026-08-04' },
  { day: 'WED', date: '05', fullDate: '2026-08-05' },
  { day: 'THU', date: '06', fullDate: '2026-08-06' },
  { day: 'FRI', date: '07', fullDate: '2026-08-07' },
  { day: 'SAT', date: '08', fullDate: '2026-08-08' },
  { day: 'SUN', date: '09', fullDate: '2026-08-09' },
  { day: 'MON', date: '10', fullDate: '2026-08-10' },
];

const DATE_MEETINGS: Record<string, { id: string; title: string; time: string; members: string; type: string; isNow?: boolean }[]> = {
  '2026-08-05': [
    { id: 'm1', title: 'AI System Architecture Sync', time: '10:30 AM', members: '4 Members • Zoom', type: 'Meeting', isNow: true },
    { id: 'm2', title: 'Sakhi OS Roadmap Review', time: '02:00 PM', members: 'Core Team', type: 'Work' },
  ],
  '2026-08-06': [
    { id: 'm3', title: 'Team Daily Standup', time: '09:30 AM', members: 'Engineering Team', type: 'Meeting' },
    { id: 'm4', title: 'Sprint Retrospective', time: '04:00 PM', members: 'Product Team', type: 'Work' },
  ],
  '2026-08-07': [
    { id: 'm5', title: 'Design System Sprint', time: '11:00 AM', members: 'UI/UX Guild', type: 'Work' },
  ],
  '2026-08-10': [
    { id: 'm6', title: 'Product Release v2.4', time: '05:00 PM', members: 'All Hands', type: 'Urgent' },
  ],
};

/* ─── PROFILE MENU ─────────────────────────────────────────────────── */
interface ProfileActionArgs {
  setActiveTab: (t: string) => void;
  setIsVoiceModeActive: (fn: (v: boolean) => boolean) => void;
  toggleTheme: () => void;
}

const PROFILE_MENU: {
  label: string;
  icon: typeof Home;
  hint?: string;
  action: (a: ProfileActionArgs) => void;
}[] = [
  {
    label: 'Settings',
    icon: Settings,
    action: ({ setActiveTab }) => setActiveTab('Settings'),
  },
  {
    label: 'Memory',
    icon: Brain,
    action: ({ setActiveTab }) => setActiveTab('Memory'),
  },
  {
    label: 'Toggle voice mode',
    icon: Mic,
    hint: 'V',
    action: ({ setIsVoiceModeActive }) => setIsVoiceModeActive(v => !v),
  },
  {
    label: 'Toggle theme',
    icon: Sparkles,
    action: ({ toggleTheme }) => toggleTheme(),
  },
];

/* ─── MESSAGE INTERFACE ────────────────────────────────────────────── */
export interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

/* ─── ACTION CARDS ────────────────────────────────────────────────── */
const ACTION_CARDS = [
  {
    chip: 'Content Help',
    chipClass: 'chip-mint',
    body: 'Help with text, answers & explanations',
    bloomColor: '#10A37F',
    prompt: 'Help me analyze and draft my workspace project content.',
  },
  {
    chip: 'Suggestions',
    chipClass: 'chip-peach',
    body: 'Ideas, plans & creative inspiration',
    bloomColor: '#10A37F',
    prompt: 'Give me creative ideas and feature suggestions for Sakhi.',
  },
  {
    chip: 'Job Application',
    chipClass: 'chip-lime',
    body: 'Help optimize your CVs & cover letters',
    bloomColor: '#10A37F',
    prompt: 'Help optimize my CV and draft an impactful cover letter.',
  },
];



/* ─── 2. MEMORY VIEW ─────────────────────────────────────────────── */
const MemorySectionView = ({ messages }: { messages: MessageItem[] }) => {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Preferences');
  const [newText, setNewText] = useState('');

  const INITIAL_MEMORIES = [
    { id: 'mem-1', title: 'Coding Preferences', tag: 'Preferences', text: 'Prefers TypeScript, React with Vite, HSL dark modes, and functional component design.', pinned: true },
    { id: 'mem-2', title: 'Project Workspace', tag: 'Project', text: 'Default directory is C:\\Users\\surya\\OneDrive\\Desktop\\Sakhi. Main entry electron/main.cjs.', pinned: true },
    { id: 'mem-3', title: 'System Environment', tag: 'General', text: 'Windows 11, Node v20+, NVIDIA RTX GPU active for local LLM & TTS inference.', pinned: false },
    { id: 'mem-4', title: 'AI Learned Patterns', tag: 'Learned', text: 'Prefers minimal 10-category settings and non-scrolling right rail dashboards.', pinned: false },
  ];

  const [memories, setMemories] = useState(() => {
    try {
      const saved = localStorage.getItem('eva.memories.v1');
      return saved ? JSON.parse(saved) : INITIAL_MEMORIES;
    } catch {
      return INITIAL_MEMORIES;
    }
  });

  const saveMemories = (next: typeof memories) => {
    setMemories(next);
    try {
      localStorage.setItem('eva.memories.v1', JSON.stringify(next));
    } catch {}
  };

  const handleAddMemory = () => {
    if (!newTitle.trim() || !newText.trim()) return;
    const item = {
      id: `mem-${Date.now()}`,
      title: newTitle.trim(),
      tag: newCategory,
      text: newText.trim(),
      pinned: false,
    };
    saveMemories([item, ...memories]);
    setNewTitle('');
    setNewText('');
    setShowAddModal(false);
  };

  const handleDeleteMemory = (id: string) => {
    saveMemories(memories.filter((m: any) => m.id !== id));
  };

  const handleDownloadMemories = () => {
    const exportData = {
      app: 'Sakhi OS',
      exportedAt: new Date().toISOString(),
      structuredMemories: memories,
      chatLogs: messages.map(m => ({ timestamp: m.timestamp, sender: m.sender, text: m.text })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eva_memories_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMemories = memories.filter((m: any) => {
    const matchesFilter = filter === 'All' || m.tag === filter;
    const matchesSearch = !search.trim() || `${m.title} ${m.text} ${m.tag}`.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="nav-section-wrapper stagger-1">
      <div className="section-header-block">
        <div className="section-header-title">
          <h2>Long-Term Memory & Context Knowledgebase</h2>
          <p>All conversation entries and extracted user facts stored in structured memory format</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" style={{ height: 34, fontSize: 12.5 }} onClick={handleDownloadMemories}>
            <Download size={14} /> Download Memory
          </button>
          <button className="btn-primary" style={{ height: 34, fontSize: 12.5 }} onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> Add Memory
          </button>
        </div>
      </div>

      <div className="section-toolbar">
        <div className="search-input-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search long-term memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-pills-row">
          {['All', 'Conversations', 'Preferences', 'Project', 'General', 'Learned'].map((f) => (
            <button
              key={f}
              className={`filter-pill ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Add Memory Modal */}
      {showAddModal && (
        <div className="settings-modal-overlay" style={{ zIndex: 100 }}>
          <div className="settings-modal-card" style={{ maxWidth: '480px', height: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Add New Memory</h3>
              <button className="settings-close-btn" onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Memory Title</label>
                <input
                  type="text"
                  placeholder="e.g. Preferred Framework"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="setting-input-text"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="setting-select"
                  style={{ width: '100%' }}
                >
                  <option>Preferences</option>
                  <option>Project</option>
                  <option>General</option>
                  <option>Learned</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Memory Content</label>
                <textarea
                  rows={4}
                  placeholder="Detail the memory or preference to remember..."
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  className="setting-input-text"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAddMemory}>Save Memory</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conversation Log Bullet Points */}
      {(filter === 'All' || filter === 'Conversations') && (
        <div className="feature-glass-card" style={{ marginBottom: '16px' }}>
          <div className="card-top-row">
            <span className="card-title-text">
              <Brain size={15} style={{ color: 'var(--accent-blue, #38BDF8)' }} /> Stored Chat Logs (Structured Bullet Points)
            </span>
            <span className="calendar-date-badge">#Conversations</span>
          </div>
          <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.map((m) => (
              <li key={m.id} style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                <strong style={{ color: m.sender === 'user' ? 'var(--text-primary)' : 'var(--accent-blue, #38BDF8)' }}>
                  [{m.timestamp}] {m.sender === 'user' ? 'User' : 'Sakhi'}:
                </strong>{' '}
                {m.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="memory-grid">
        {filteredMemories.map((m: any) => (
          <div key={m.id} className="feature-glass-card" style={{ position: 'relative' }}>
            <div className="card-top-row">
              <span className="card-title-text">
                <Brain size={15} style={{ color: 'var(--accent-blue, #38BDF8)' }} /> {m.title}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="calendar-date-badge">#{m.tag}</span>
                <button
                  onClick={() => handleDeleteMemory(m.id)}
                  title="Delete memory"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="card-desc-text" style={{ marginTop: '8px' }}>{m.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── 3. TASKS VIEW ───────────────────────────────────────────────── */
const TasksSectionView = () => <TasksView />;

/* ─── 4. AGENTS VIEW ──────────────────────────────────────────────── */
const AgentsSectionView = () => {
  const agents = [
    { name: 'Planner Agent', status: 'running', task: 'Decomposing task dependencies', resp: '120ms' },
    { name: 'Browser Agent', status: 'running', task: 'Extracting web page DOM content', resp: '450ms' },
    { name: 'Desktop Agent', status: 'idle', task: 'Standing by for window commands', resp: '80ms' },
    { name: 'Coding Agent', status: 'running', task: 'Verifying TypeScript compilation', resp: '350ms' },
    { name: 'Memory Agent', status: 'running', task: 'Vector index synchronization', resp: '60ms' },
    { name: 'Vision Agent', status: 'disabled', task: 'OCR & Screen capture inactive', resp: '0ms' },
    { name: 'Research Agent', status: 'idle', task: 'Literature & web search standing by', resp: '800ms' },
    { name: 'Voice Agent', status: 'running', task: 'NVIDIA Parakeet STT Active', resp: '90ms' },
  ];

  return (
    <div className="nav-section-wrapper stagger-1">
      <div className="section-header-block">
        <div className="section-header-title">
          <h2>AI Agents Controller</h2>
          <p>Monitor and control autonomous workers executing system background tasks</p>
        </div>
      </div>

      <div className="agent-grid">
        {agents.map((ag, idx) => (
          <div key={idx} className="feature-glass-card">
            <div className="card-top-row">
              <span className="card-title-text"><Users size={15} color="currentColor" /> {ag.name}</span>
              <span className={`status-badge ${ag.status}`}>{ag.status}</span>
            </div>
            <p className="card-desc-text">{ag.task}</p>
            <div className="card-bottom-actions">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg: {ag.resp}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>
                  {ag.status === 'disabled' ? 'Enable' : 'Disable'}
                </button>
                <button className="btn-secondary" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>Logs</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── 5. AUTOMATIONS VIEW ─────────────────────────────────────────── */
const AutomationsSectionView = () => {
  const automations = [
    { title: 'Launch Dev Workspace', trigger: 'Time: Mon-Fri @ 9:00 AM', action: 'Open VS Code & Chrome dev tools', status: 'active' },
    { title: 'Startup System Warmup', trigger: 'System Startup', action: 'Launch Sakhi tray & Kokoro TTS', status: 'active' },
    { title: 'Nightly Document Backup', trigger: 'Time: Daily @ 12:00 AM', action: 'Compress & backup project files', status: 'active' },
    { title: 'Post-Download Handler', trigger: 'Folder Watcher', action: 'Sort downloads by file extension', status: 'paused' },
  ];

  return (
    <div className="nav-section-wrapper stagger-1">
      <div className="section-header-block">
        <div className="section-header-title">
          <h2>Automations & Triggers</h2>
          <p>Automate repetitive work based on time, startup, system events, and voice rules</p>
        </div>
        <button className="btn-primary" style={{ height: 34, fontSize: 12.5 }}><Plus size={14} /> Create Automation</button>
      </div>

      <div className="automation-grid">
        {automations.map((a, idx) => (
          <div key={idx} className="feature-glass-card">
            <div className="card-top-row">
              <span className="card-title-text"><Zap size={15} color="currentColor" /> {a.title}</span>
              <span className={`status-badge ${a.status}`}>{a.status}</span>
            </div>
            <p className="card-desc-text"><strong>Trigger:</strong> {a.trigger}</p>
            <p className="card-desc-text"><strong>Action:</strong> {a.action}</p>
            <div className="card-bottom-actions">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>History: 14 runs</span>
              <button className="btn-secondary" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>
                {a.status === 'active' ? 'Pause' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── 6. TOOLS VIEW ───────────────────────────────────────────────── */
const ToolsSectionView = () => {
  const tools = [
    { name: 'Browser Controller', perm: 'Granted', usage: '342 calls', desc: 'Automates web navigation, DOM parsing, and web searches.' },
    { name: 'Terminal Executor', perm: 'Prompt', usage: '128 calls', desc: 'Runs safe terminal & PowerShell commands inside workspace.' },
    { name: 'File System Access', perm: 'Granted', usage: '850 calls', desc: 'Reads, writes, and manages project files and directories.' },
    { name: 'Desktop Vision & OCR', perm: 'Granted', usage: '64 calls', desc: 'Captures screen content and extracts text via optical recognition.' },
  ];

  return (
    <div className="nav-section-wrapper stagger-1">
      <div className="section-header-block">
        <div className="section-header-title">
          <h2>Sakhi Capability Directory</h2>
          <p>Native system tools and APIs available for assistant execution</p>
        </div>
      </div>

      <div className="tool-grid">
        {tools.map((t, idx) => (
          <div key={idx} className="feature-glass-card">
            <div className="card-top-row">
              <span className="card-title-text"><LayoutGrid size={15} color="currentColor" /> {t.name}</span>
              <span className={`status-badge ${t.perm === 'Granted' ? 'running' : 'disabled'}`}>{t.perm}</span>
            </div>
            <p className="card-desc-text">{t.desc}</p>
            <div className="card-bottom-actions">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Usage: {t.usage}</span>
              <button className="btn-secondary" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>Configure</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── 7. INTEGRATIONS VIEW (formerly Plugins) ─────────────────────── */
const IntegrationsSectionView = () => {
  const integrations = [
    { name: 'GitHub', category: 'Developer', status: 'connected', desc: 'Repo sync, issue tracking, and automated pull request management.' },
    { name: 'Notion', category: 'Productivity', status: 'connected', desc: 'Sync tasks, notes, and database items directly with Notion workspaces.' },
    { name: 'VS Code', category: 'Developer', status: 'connected', desc: 'Real-time pair programming, file editing, and terminal integration.' },
    { name: 'Slack', category: 'Communication', status: 'disconnected', desc: 'Send notifications, summary reports, and receive team commands.' },
    { name: 'Google Drive', category: 'Storage', status: 'connected', desc: 'Access cloud documents, spreadsheets, and automated backups.' },
    { name: 'Figma', category: 'Design', status: 'disconnected', desc: 'Inspect design components, export assets, and review wireframes.' },
  ];

  return (
    <div className="nav-section-wrapper stagger-1">
      <div className="section-header-block">
        <div className="section-header-title">
          <h2>Service Integrations</h2>
          <p>Connect Sakhi with external developer tools, workspace apps, and cloud platforms</p>
        </div>
      </div>

      <div className="integration-grid">
        {integrations.map((ig, idx) => (
          <div key={idx} className="feature-glass-card">
            <div className="card-top-row">
              <span className="card-title-text"><Layers size={15} color="currentColor" /> {ig.name}</span>
              <span className={`status-badge ${ig.status}`}>{ig.status}</span>
            </div>
            <p className="card-desc-text">{ig.desc}</p>
            <div className="card-bottom-actions">
              <span className="calendar-date-badge">{ig.category}</span>
              <button className={ig.status === 'connected' ? 'btn-secondary' : 'btn-primary'} style={{ height: 26, padding: '0 10px', fontSize: 11 }}>
                {ig.status === 'connected' ? 'Configure' : 'Connect'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LM_MODEL_CATEGORIES = [
  {
    category: 'Google Gemini',
    icon: Sparkles,
    color: '#10A37F',
    models: [
      { id: 'Gemini 3.6 Flash', desc: 'Next-gen experimental Flash model with ultra-low latency & multimodal vision', badge: 'Flash' },
      { id: 'Gemini 3.1 Pro', desc: 'Advanced reasoning & complex problem solving engine', badge: 'Reasoning' },
      { id: 'Gemini 2.5 Pro', desc: 'Default high-performance balanced flagship model', badge: 'Flagship' },
      { id: 'Gemini 1.5 Flash', desc: 'Fast, lightweight conversational model for quick answers', badge: 'Fast' },
    ],
  },
  {
    category: 'Anthropic Claude',
    icon: Cpu,
    color: '#F59E0B',
    models: [
      { id: 'Claude 3.5 Sonnet', desc: 'Industry-leading code generation & complex analytical writing', badge: 'Best Coding' },
      { id: 'Claude 3.5 Haiku', desc: 'Blazing fast responses for rapid conversation flow', badge: 'Ultra Fast' },
      { id: 'Claude 3.0 Opus', desc: 'Deep creative reasoning & high-context comprehension', badge: 'Deep Reasoning' },
    ],
  },
  {
    category: 'OpenAI',
    icon: Zap,
    color: '#10A37F',
    models: [
      { id: 'GPT-4o', desc: 'Omni multimodal intelligence for code, math & general tasks', badge: 'Omni' },
      { id: 'GPT-4o-mini', desc: 'Fast, lightweight GPT model for daily tasks', badge: 'Mini' },
      { id: 'o3-mini', desc: 'Specialized reasoning model for STEM, math & logic puzzles', badge: 'Reasoning' },
    ],
  },
  {
    category: 'OpenRouter & DeepSeek',
    icon: Globe,
    color: '#3B82F6',
    models: [
      { id: 'DeepSeek R1', desc: 'Open-weights reasoning model with chain-of-thought processing', badge: 'Open Reasoning' },
      { id: 'DeepSeek V3', desc: 'High-speed Mixture-of-Experts (MoE) model', badge: 'MoE' },
      { id: 'OpenRouter Auto', desc: 'Dynamically routes your prompt to the best available LLM API', badge: 'Smart Router' },
    ],
  },
  {
    category: 'Local Device LLMs (Offline / Privacy)',
    icon: HardDrive,
    color: 'var(--text-primary)',
    models: [
      { id: 'Llama 3.2 3B (Local)', desc: 'Meta open-source local LLM running directly on your CPU/GPU', badge: 'Local 3B' },
      { id: 'Qwen 2.5 Coder 7B (Local)', desc: 'Alibaba local coding model for offline code assistance', badge: 'Local Code 7B' },
      { id: 'Mistral 7B (Local)', desc: 'Mistral AI efficient local 7B model for offline privacy', badge: 'Local 7B' },
      { id: 'Phi-3 Mini (Local)', desc: 'Microsoft compact local model running offline', badge: 'Local Mini' },
    ],
  },
];

/* ─── DYNAMIC CONTEXT & TIME-AWARE RANDOM GREETINGS ────────────────── */
export const getDynamicGreeting = (): string => {
  const now = new Date();
  const hour = now.getHours();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  let options: string[] = [];
  if (hour >= 5 && hour < 12) {
    options = [
      `Good morning, **Surya**! What's on your mind today? (${dateStr})`,
      `Morning, **Surya**! Ready to code and tackle new ideas today?`,
      `Good morning, **Surya**! How can I assist your workspace today?`,
      `Hello **Surya**! Hope your morning is going great. What shall we build?`,
    ];
  } else if (hour >= 12 && hour < 17) {
    options = [
      `Good afternoon, **Surya**! What's on your mind today? (${dateStr})`,
      `Hello **Surya**! What would you like to create or automate today?`,
      `Good afternoon, **Surya**! Ready to continue working on your features?`,
      `Hey **Surya**! How can I assist you this afternoon?`,
    ];
  } else if (hour >= 17 && hour < 22) {
    options = [
      `Good evening, **Surya**! What's on your mind tonight? (${dateStr})`,
      `Hello **Surya**! How can I help with your projects this evening?`,
      `Good evening, **Surya**! Ready to refine code or test automated tasks?`,
      `Hey **Surya**! Let's build something extraordinary tonight.`,
    ];
  } else {
    options = [
      `Working late, **Surya**? What's on your mind tonight? (${dateStr})`,
      `Late night coding, **Surya**! How can I assist your workspace?`,
      `Hello **Surya**! What would you like to build tonight?`,
      `Night shift session, **Surya**! Ready to tackle your next feature?`,
    ];
  }

  const idx = Math.floor(Math.random() * options.length);
  return options[idx];
};

/* Short by design: a long greeting delays the question the user came to ask. */
const WAKE_REPLIES = ['Yes?', "I'm here.", 'Yes, boss?', 'Go ahead.'];

/* ─── MAIN APP ─────────────────────────────────────────────────────── */
export const App = () => {
  const [activeTab, setActiveTab] = useState('Home');
  /* The project a turn belongs to. Null means the global workspace, whose
     memories apply everywhere. */
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  /* One task list behind the planner, so the rail, the grid and the strips
     never disagree about what is due. */
  const [plannerTasks, setPlannerTasks] = useState<TaskItem[]>([]);
  const [plannerSelected, setPlannerSelected] = useState<string | null>(null);
  /* Polled only while the Developer panel is on screen — there is no reason
     to keep sampling CPU for a page nobody is looking at. */
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearch, setWebSearch] = useState(false);

  /* Backend event stream. Every assistant visual below — stages, tool cards,
     thinking, streaming text, voice state — is rendered from these events.
     With no backend running the session stays empty and nothing is faked.
     Exposed on window in dev so the protocol can be exercised without one. */
  const { session, conn, push } = useAssistantStream({
    wsUrl: import.meta.env.VITE_WS_URL,
    // Live only: this page keeps its own transcript, so replaying the previous
    // turn on load would show an answer to a question the user cannot see.
    sseUrl: LIVE_EVENTS_URL,
  });
  const flags = useSessionFlags(session);

  useEffect(() => {
    (window as any).__ff = { push, session, conn };
  }, [push, session, conn]);
  /* One source of truth, shared with Settings and persisted. The old local
     useState here could not be reached by the Settings panel, which is why its
     Light/Dark/System buttons did nothing. */
  const { preference, applied, setPreference, toggle: toggleTheme } = useTheme();
  const [selectedModel, setSelectedModel] = useState('Gemini 2.5 Pro');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [offlineWarning, setOfflineWarning] = useState<string | null>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const [localModels, setLocalModels] = useState<string[]>([
    'Llama 3.2 3B (Local)',
    'Qwen 2.5 Coder 7B (Local)',
    'Mistral 7B (Local)',
    'Phi-3 Mini (Local)',
  ]);

  /* Local tags come from the backend's provider layer. This used to hit a
     server on :3001 that no longer exists, which failed on every page load. */
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/providers/ollama/models`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const names = (data?.models ?? []).map((m: { id: string }) => m.id);
        if (!cancelled && names.length) setLocalModels(names);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [expandedSysMetric, setExpandedSysMetric] = useState<'cpu' | 'gpu' | 'ram' | 'disk' | null>(null);
  const [selectedCalDate, setSelectedCalDate] = useState('2026-08-05');
  const [todayTasks, setTodayTasks] = useState([
    { id: 't1', title: 'Complete Sakhi React Upgrade', time: '08:00 PM', priority: 'high', completed: false },
    { id: 't2', title: 'Run System Diagnostic & Memory Cleanup', time: '11:30 PM', priority: 'medium', completed: true },
    { id: 't3', title: 'Sync GitHub Repository & Release Build', time: '10:00 AM', priority: 'high', completed: false },
    { id: 't4', title: 'Review Local LLM Response Latency', time: '03:30 PM', priority: 'low', completed: false },
  ]);
  const profileRef = useRef<HTMLDivElement>(null);
  /* Starts empty. A pre-seeded greeting looked like the assistant had already
     spoken; the chat view shows its own idle state instead. */
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ─── TURN BOOKKEEPING ────────────────────────────────────────────
     `busy` is true from the moment a message is posted until the backend
     emits response.completed. The gap between those two is real network
     latency, so it is tracked separately rather than guessed at. */
  const [isSending, setIsSending] = useState(false);
  const [turnStartedAt, setTurnStartedAt] = useState(0);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const requestId = useRef<string | null>(null);
  /** True while a turn we started is still owed an answer. */
  const pendingTurn = useRef(false);
  /** Set by Stop, so the closing effect knows the end was deliberate. */
  const stopped = useRef(false);

  /* `session.active` is only ever cleared by a response.completed event. If the
     backend dies mid-turn that event never arrives, so a local override exists
     purely so the composer can always be recovered. It is cleared the moment a
     real turn starts again. */
  const [forceIdle, setForceIdle] = useState(false);
  const busy = !forceIdle && (isSending || session.active);

  useEffect(() => {
    if (session.conversationId) setConversationId(session.conversationId);
  }, [session.conversationId]);

  /* The first event of a turn closes the send gap. */
  useEffect(() => {
    if (session.active && isSending) setIsSending(false);
  }, [session.active, isSending]);

  /* Stop with Escape, the way every other "cancel this" in the app works. */
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleStop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  /**
   * Commits a finished turn into the transcript.
   *
   * Runs on the transition to `!active` and only for a turn this client
   * started, so a replayed or someone-else's turn cannot append a message the
   * user never asked for. The receipt is built from tool events only — if no
   * tool ran, no tool is claimed.
   */
  useEffect(() => {
    if (session.active || !pendingTurn.current) return;

    /* Nothing has arrived yet, so the turn has not really started — UNLESS the
       user already pressed Stop. Without that second clause, cancelling in the
       first moments left `pendingTurn` set and the composer stuck on "working"
       with no way back: the guard below would return early forever. */
    if (!session.stages.length && !session.response && !stopped.current) return;

    const wasStopped = stopped.current;
    stopped.current = false;
    pendingTurn.current = false;
    requestId.current = null;
    setIsSending(false);

    // Stopped with nothing to show: return to idle rather than inventing a
    // message about it. The user knows — they pressed the button.
    if (wasStopped && !session.response.trim() && !session.toolOrder.length) return;

    const steps = session.toolOrder
      .map(k => session.tools[k])
      .filter(Boolean)
      .map(t => ({ tool: t.tool, title: t.title || t.tool, status: t.status, duration: t.duration }));

    const text = session.response.trim();
    const failed = steps.filter(s => s.status === 'failed');

    setMessages(prev => [
      ...prev,
      {
        id: `a${Date.now()}`,
        sender: 'assistant',
        text:
          text ||
          (failed.length
            ? `I could not finish that — ${failed.map(f => f.title).join(', ')} did not run.`
            : 'The turn ended without a reply. Check that the selected model is available.'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...(steps.length ? { steps } : {}),
        meta: {
          model: session.model,
          provider: session.provider,
          duration: session.duration,
          tokens: session.tokens,
        },
        ...(text ? {} : { error: true }),
      },
    ]);
  }, [session.active, session.response, session.toolOrder, session.tools, session.stages.length,
      session.model, session.provider, session.duration, session.tokens]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  /* Dismiss the profile menu on an outside click or Escape. */
  useEffect(() => {
    if (!profileOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [profileOpen]);

  /* Dismiss the model dropdown on an outside click or Escape. */
  useEffect(() => {
    if (!modelDropdownOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!modelRef.current?.contains(e.target as Node)) setModelDropdownOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelDropdownOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [modelDropdownOpen]);

  /* Always-on wake word: "Sakhi" / "Hey Sakhi", and the neighbours a
     recogniser actually lands on. Runs locally through Moonshine — see
     useWakeWord for why the old Web Speech version never fired at all.
     Disabled while the call is open rather than competing for the mic. */
  const wake = useWakeWord(!isVoiceModeActive, () => {
    setVoiceTranscript('');
    setIsVoiceModeActive(true);
    /* Answer out loud straight away. Opening a window silently leaves the
       user waiting to find out whether they were heard at all. */
    void speakNow(WAKE_REPLIES[Math.floor(Math.random() * WAKE_REPLIES.length)]);
  });
  void wake;


  /* ─── SENDING ───────────────────────────────────────────────────────
     One path only: POST to the backend and listen. The frontend deliberately
     cannot call a model itself — it has no key handling, no provider logic and
     no fallback that answers on its own. Anything shown below came from an
     event the backend actually emitted.

     This used to fan out to Ollama, Gemini, OpenRouter and OpenAI straight from
     the browser, which meant tool calling could never work (no tool loop lives
     here) and keys sat in localStorage. */

  const handleSendMessage = async (textOverride?: string) => {
    const text = (textOverride !== undefined ? textOverride : chatInput).trim();
    if (!text) return;

    /* Answer a pending consent question in words.
       Sakhi asks "shall I go ahead?" and then waits behind a card with two
       buttons, which means the reply it invited — "yes" — does nothing, and
       the turn is stuck until you notice the card and reach for the mouse.
       An affirmative or a refusal is now taken as the answer.

       Only these exact words count. Anything else is sent as an ordinary
       message and the card stays up: guessing intent here would risk reading
       consent into a sentence that never gave it. */
    const pending = session.permissions[0];
    if (pending) {
      const t = text.toLowerCase().replace(/[!.]+$/, '').trim();
      const yes = /^(y|ya|yes|yep|yeah|yup|ok|okay|sure|go ahead|do it|proceed|please do|confirm|allow)$/.test(t);
      const no = /^(n|no|nope|nah|stop|cancel|don'?t|do not|deny|abort)$/.test(t);
      if (yes || no) {
        if (textOverride === undefined) setChatInput('');
        setMessages(prev => [
          ...prev,
          {
            id: `u${Date.now()}`,
            sender: 'user',
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        await handlePermission(pending.id, yes, false);
        return;
      }
    }

    setActiveTab('Chat');
    setLeftSidebarOpen(false);

    setMessages(prev => [
      ...prev,
      {
        id: `u${Date.now()}`,
        sender: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    if (textOverride === undefined) setChatInput('');

    setTurnStartedAt(Date.now());
    setIsSending(true);
    setForceIdle(false);
    stopped.current = false;
    pendingTurn.current = true;

    // Only forward a model the user actually picked; otherwise the backend
    // resolves one itself (local runtimes first).
    const picked = getSelected();
    const res = await sendChat({
      message: text,
      conversationId,
      provider: backendProvider(picked),
      model: picked?.id,
      projectId: activeProject?.id,
    });

    if (!res.ok) {
      pendingTurn.current = false;
      setIsSending(false);
      setMessages(prev => [
        ...prev,
        {
          id: `e${Date.now()}`,
          sender: 'assistant',
          text: res.error ?? 'The request could not be sent.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
        },
      ]);
      return;
    }

    requestId.current = res.requestId ?? null;
  };

  /**
   * Stops the running turn.
   *
   * This aborts the upstream HTTP call to the model, not just the UI: the
   * orchestrator holds an AbortSignal that is threaded into `fetch`. The id is
   * omitted when the POST has not come back yet, which cancels everything in
   * flight — the right behaviour when the user wants it to stop NOW.
   */
  /* ─── VOICE CALL ──────────────────────────────────────────────────
     Voice and chat are the SAME agent. An utterance goes through
     handleSendMessage exactly as typed text does, so tools, permissions,
     memory and history behave identically whichever way you talk to it. */
  const lastSpoken = useRef<string | undefined>(undefined);

  /* Which message is being read right now, so its button can show as active
     and a second press can stop it. */
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  /**
   * Dictation into the composer.
   *
   * The engine settles one phrase at a time and hands each back, so the text
   * builds up in the box as you talk and is ordinary editable text the moment
   * you stop — no separate "transcript" state to accept or discard.
   */
  const dictation = useDictation({
    offline: isOfflineMode,
    onFinal: (said) =>
      setChatInput((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${said}` : said)),
  });

  /* Real microphone loudness, so the waveform reflects the room rather than
     animating on a timer while nobody is speaking. */
  const mic = useMicLevel(dictation.recording);

  /* "Read every reply" — off by default. Remembered, because having to switch
     it on every launch is what makes a feature like this go unused. */
  const [speakReplies, setSpeakReplies] = useState<boolean>(false);
  useEffect(() => {
    try { localStorage.setItem('sakhi.speakReplies', String(speakReplies)); } catch { /* private mode */ }
    if (!speakReplies) stopSpeaking();
  }, [speakReplies]);
  const [replyToSpeak, setReplyToSpeak] = useState<string | undefined>();

  useEffect(() => {
    if (activeTab !== 'Settings') return;
    let alive = true;
    const read = async () => {
      const s = await fetchSystem();
      if (alive) setSysInfo(s);
    };
    void read();
    const t = setInterval(read, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [activeTab]);

  const call = useVoiceCall({
    active: isVoiceModeActive,
    busy,
    speak: replyToSpeak,
    // Offline mode keeps recognition local; online reaches for Parakeet.
    engine: isOfflineMode ? 'moonshine' : 'parakeet',
    pendingPermissionId: session.permissions[0]?.id,
    pendingPermissionPrompt: session.permissions[0]
      ? `Should I go ahead and ${session.permissions[0].reason || `use ${session.permissions[0].permission}`}? Say yes to continue, or no to stop.`
      : undefined,
    onAnswerPermission: (id, granted) => { void handlePermission(id, granted, false); },
    onUtterance: async (text) => {
      await handleSendMessage(text);
    },
  });

  /**
   * Warm the speech models when the app starts, not when they are first used.
   *
   * Cold-loading Kokoro measured ~36s and Moonshine ~24s on this machine. Any
   * of that paid at the moment someone presses the microphone reads as the
   * app hanging. Doing it at startup means the weights are resident long
   * before the first phrase, and the request is fire-and-forget so nothing
   * here waits on it.
   */
  useEffect(() => {
    void preloadSpeech();
  }, []);

  /**
   * Mirror the call into the floating desktop widget.
   *
   * The widget is a separate window with no state of its own, so everything
   * it draws is pushed from here. `window.sakhi` only exists under Electron;
   * in a browser tab this is a no-op.
   */
  useEffect(() => {
    const api = (window as any).sakhi;
    if (!api) return;

    /* The widget is the assistant's presence OUTSIDE the app. While the
       window has focus the overlay already shows the orb, so a second one
       floating over it is just a duplicate. It appears when focus leaves and
       goes away when it comes back. */
    if (!isVoiceModeActive) {
      void api.hideWidget?.();
      return;
    }

    const show = () => void api.showWidget?.();
    const hide = () => void api.hideWidget?.();

    // document.hasFocus() covers the case where the app was already in the
    // background when voice mode opened (a wake word, typically).
    if (document.hasFocus()) hide(); else show();

    window.addEventListener('blur', show);
    window.addEventListener('focus', hide);
    return () => {
      window.removeEventListener('blur', show);
      window.removeEventListener('focus', hide);
    };
  }, [isVoiceModeActive]);

  useEffect(() => {
    const api = (window as any).sakhi;
    if (!api?.updateWidget || !isVoiceModeActive) return;

    const lastUser = [...messages].reverse().find((m) => m.sender === 'user');
    const lastBot = [...messages].reverse().find((m) => m.sender === 'assistant');

    api.updateWidget({
      state: call.state,
      you: lastUser?.text ?? '',
      sakhi: lastBot?.text ?? '',
      isDark: applied === 'dark',
    });
  }, [isVoiceModeActive, call.state, messages, applied]);

  /* The reply to read out is the last assistant message — the same text the
     chat shows. Nothing is generated specially for voice. */
  useEffect(() => {
    if (!isVoiceModeActive) return;
    const last = [...messages].reverse().find(m => m.sender === 'assistant');
    if (last && last.text && last.id !== lastSpoken.current) {
      lastSpoken.current = last.id;
      setReplyToSpeak(last.text);
    }
  }, [messages, isVoiceModeActive]);

  /**
   * Speak one reply, on request.
   *
   * This used to fire automatically on every finished answer whenever the
   * toggle was on, which meant a long technical reply was read start to
   * finish while you were already reading it. Reading aloud is useful when
   * you ask for it and an imposition when you do not, so it is now a button
   * per message. The header toggle keeps the hands-free behaviour for anyone
   * who does want every answer spoken.
   */
  const speakMessage = useCallback((id: string, text: string) => {
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(id);
    void speakNow(text)
      .catch(() => { /* the text is on screen; synthesis failing is not fatal */ })
      .finally(() => setSpeakingId(cur => (cur === id ? null : cur)));
  }, [speakingId]);

  /* Opt-in "read everything" — off unless asked for, and stands down during a
     voice call, which owns playback itself. */
  useEffect(() => {
    if (!speakReplies || isVoiceModeActive || isSending) return;
    const last = [...messages].reverse().find(m => m.sender === 'assistant');
    if (!last?.text || last.id === lastSpoken.current) return;
    lastSpoken.current = last.id;
    void speakNow(last.text).catch(() => {});
  }, [messages, speakReplies, isVoiceModeActive, isSending]);

  /* Live captions, from whichever part of the utterance exists right now. */
  useEffect(() => {
    if (!isVoiceModeActive) return;
    setVoiceTranscript(call.partial || call.heard || '');
  }, [call.partial, call.heard, isVoiceModeActive]);

  const handleStop = async () => {
    if (!pendingTurn.current && !isSending) return;
    stopped.current = true;
    await cancelChat(requestId.current ?? undefined);

    /* The backend always emits response.completed on cancel, and that is what
       closes the turn. This is the belt-and-braces path for the case where the
       event never lands (backend gone, socket dropped) — without it the
       composer would stay disabled with no way to recover. */
    window.setTimeout(() => {
      if (stopped.current) {
        stopped.current = false;
        pendingTurn.current = false;
        requestId.current = null;
        setIsSending(false);
        setForceIdle(true);
      }
    }, 2500);
  };

  const handlePermission = async (id: string, granted: boolean, remember: boolean) => {
    await postPermission(id, granted, remember);
  };

  const dismissNotice = (id: string) => {
    // Notices live in the reducer, so they are cleared by an event like
    // everything else rather than by mutating state behind its back.
    push({ id: `d${id}`, type: 'notice.dismissed', timestamp: Date.now(), payload: { id } });
  };

  return (
    <div className={`app-shell ${mounted ? 'app-mounted' : ''} ${activeTab === 'Chat' ? 'app-shell--chat-active' : ''}`}
      style={{
        position: 'relative', // Needed so the absolute GradientWaves sits nicely
        background: 'transparent'
      }}>
      <GradientWaves
        horizonColor={applied === 'dark' ? '#0A0A10' : '#FFFFFF'}
        waveColor={applied === 'dark' ? '#7C3AED' : '#5227FF'}
        crestColor={applied === 'dark' ? '#C084FC' : '#FF9FFC'}
        speed={0.4}
        amplitude={2.5}
        waveScale={0.6}
        waveRatio={0.9}
        swell={35}
        turbulence={20}
        tilt={1.11}
        zoom={1}
        height={5.5}
        fogDepth={15}
        detail="medium"
        brightness={1}
        opacity={1}
        mouseInteraction
        parallaxStrength={0.5}
        grain
        grainIntensity={0.05}
      />


      {/* Mobile Overlay Backdrop */}
      {leftSidebarOpen && (
        <div
          className="mobile-overlay-backdrop"
          onClick={() => {
            setLeftSidebarOpen(false);
          }}
        />
      )}

      {/* ══════════ LEFT SIDEBAR CARD (ROUNDED FLOATING LIQUID GLASS) ══════════ */}
      <nav className="sidebar" aria-label="Main navigation">
        <LiquidGlassCard
          glowIntensity="sm"
          shadowIntensity="sm"
          borderRadius="12px"
          blurIntensity="sm"
          draggable
          className="sidebar-liquid-inner"
        >
          <div className="sidebar-header">
            <div className="sidebar-brand">
              <img src={logoImg} alt="" className="sidebar-brand-logo" />
              <span className="sidebar-brand-name">Sakhi</span>
            </div>
            <button
              className="sidebar-close-btn"
              onClick={() => setLeftSidebarOpen(false)}
              title="Close sidebar"
              aria-label="Close sidebar"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Nav List.
              Scrolls internally rather than pushing the account card off the
              bottom — the rail has to hold twelve rows on a laptop screen. */}
          <div className="nav-list">
            {NAV_GROUPS.map((group) => (
              <div className="nav-group" key={group.id}>
                {/* Collapsed, the label has nowhere to go, so the rule alone
                    carries the separation. Expanded, it gets its name back. */}
                <div className="nav-group-label" aria-hidden="true">
                  <span>{group.label}</span>
                </div>
                <ul className="nav-group-items" role="list" aria-label={group.label}>
                  {group.items.map(({ name, icon: Icon, label }) => (
                    <li key={name}>
                      <button
                        className={`nav-item ${activeTab === name ? 'nav-item--active' : ''}`}
                        onClick={() => {
                          setActiveTab(name);
                          if (window.innerWidth < 768) setLeftSidebarOpen(false);
                        }}
                        aria-current={activeTab === name ? 'page' : undefined}
                        title={label ?? name}
                      >
                        <Icon size={18} strokeWidth={1.8} className="nav-icon" />
                        <span className="nav-text">{label ?? name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Settings sits with the account rather than in a group: it is
              about you, not about the workspace. */}
          <button
            className={`nav-item nav-item--foot ${activeTab === 'Settings' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('Settings')}
            aria-current={activeTab === 'Settings' ? 'page' : undefined}
            title="Settings"
          >
            <Settings size={18} strokeWidth={1.8} className="nav-icon" />
            <span className="nav-text">Settings</span>
          </button>

          {/* Account card + profile menu */}
          <div className="account-wrap" ref={profileRef} style={{ marginTop: 'auto' }}>
            {profileOpen && (
              <div className="profile-menu" role="menu">
                <div className="profile-menu-head">
                  <div className="account-avatar">SV</div>
                  <div className="account-info">
                    <div className="account-name">Surya Vignesh</div>
                    <div className="profile-menu-mail">surya@eva.ai</div>
                  </div>
                </div>

                <div className="profile-menu-sep" />

                {PROFILE_MENU.map(({ label, icon: Icon, hint, action }) => (
                  <button
                    key={label}
                    className="profile-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      action({ setActiveTab, setIsVoiceModeActive, toggleTheme });
                    }}
                  >
                    <Icon size={15} strokeWidth={1.8} className="profile-menu-icon" />
                    <span className="profile-menu-label">{label}</span>
                    {hint && <span className="profile-menu-hint">{hint}</span>}
                  </button>
                ))}
              </div>
            )}

            <button
              className={`account-card ${profileOpen ? 'account-card--open' : ''}`}
              onClick={() => setProfileOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              title="Account"
            >
              <div className="account-avatar">SV</div>
              <div className="account-info">
                <div className="account-name">Surya Vignesh</div>
                <div className="account-status">
                  <span className="status-dot" />
                  <span className="status-label">{isVoiceModeActive ? 'Voice active' : 'Online'}</span>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={`account-chevron ${profileOpen ? 'account-chevron--up' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </LiquidGlassCard>
      </nav>

      {/* ══════════ MAIN COLUMN ══════════ */}
      <main className="main-col">
        {/* Top Header Bar (Hidden on Calendar view to maximize screen frame) */}
        {/* Planner carries its own header, so the app topbar would be a
            second one stacked above it. */}
        {activeTab !== 'Calendar' && activeTab !== 'Planner' && (
          <header className="topbar">
            <button
              className="mobile-nav-btn mobile-left-btn"
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              title="Toggle Navigation"
              aria-label="Toggle Navigation"
            >
              <Menu size={20} />
            </button>

            {/* Models & Mode Selector (Left).
                Model lists are fetched per provider — never hardcoded — so new
                releases appear without a code change. See modelStore.ts. */}
            <div className="topbar-selectors" ref={modelRef} style={{ position: 'relative' }}>
              <ModelSelector
                onChange={(m) => {
                  setSelectedModel(m.name);
                  // Picking a local model implies offline; a cloud model implies online.
                  setIsOfflineMode(m.provider === 'local');
                }}
              />
            </div>

            {/* Topbar Right Controls: Single Online/Offline Mode Toggle + AnimatedThemeToggler */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className={`topbar-mode-btn ${isOfflineMode ? 'mode-offline' : 'mode-online'}`}
                onClick={() => {
                  setIsOfflineMode(prev => {
                    const next = !prev;
                    if (next) {
                      if (localModels.length > 0 && !selectedModel.includes('(Local)')) {
                        setSelectedModel(localModels[0]);
                      }
                      setModelDropdownOpen(true);
                    }
                    return next;
                  });
                }}
                title={`Click to switch to ${isOfflineMode ? 'Online Mode' : 'Offline Mode'}`}
              >
                <span className="mode-dot" />
                <span className="mode-label">{isOfflineMode ? 'Offline Mode' : 'Online Mode'}</span>
              </button>

              {/* Read replies aloud while typing. Kokoro was previously only
                  reachable inside a voice call, so most of the time the
                  speech engine was loaded and silent. */}
              <button
                type="button"
                className={`topbar-mode-btn ${speakReplies ? 'mode-online' : ''}`}
                onClick={() => setSpeakReplies(v => !v)}
                aria-pressed={speakReplies}
                title={speakReplies ? 'Replies are read aloud — click to mute' : 'Read replies aloud'}
              >
                {speakReplies ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span className="mode-label">{speakReplies ? 'Voice On' : 'Voice Off'}</span>
              </button>

              <AnimatedThemeToggler theme={applied} onToggle={toggleTheme} />
            </div>
          </header>
        )}

        {/* Content column */}
        <div className={`content-col ${(activeTab === 'Planner' || activeTab === 'Projects' || activeTab === 'Calendar' || activeTab === 'Tasks' || activeTab === 'Chat') ? 'content-col--full' : ''}`}>
          {activeTab === 'Planner' ? (
            <PlannerView
              tasks={plannerTasks}
              selectedId={plannerSelected}
              onSelect={setPlannerSelected}
              onEdit={(id, patch) =>
                setPlannerTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
              }
              onToggle={(id) =>
                setPlannerTasks((ts) =>
                  ts.map((t) =>
                    t.id === id
                      ? { ...t, status: t.status === 'Completed' ? 'In Progress' : 'Completed' }
                      : t
                  )
                )
              }
              userName="Surya"
              onAdd={(title, dueISO) =>
                setPlannerTasks((ts) => [
                  ...ts,
                  {
                    id: `t${Date.now()}`,
                    title,
                    description: '',
                    status: 'Not Started',
                    priority: 'Medium',
                    category: 'Personal',
                    project: 'Sakhi',
                    /* A slot click supplies the exact time. Otherwise it
                       defaults to later today so the task lands on the grid
                       rather than vanishing into an unscheduled pile. */
                    dueDate: dueISO ?? new Date(Date.now() + 3 * 3600_000).toISOString(),
                    estimatedTime: '1h',
                    subtasks: [],
                    dependencies: [],
                    notes: '',
                  },
                ])
              }
            />
          ) : activeTab === 'Projects' ? (
            <ProjectsView
              activeId={activeProject?.id}
              onOpen={(p) => {
                setActiveProject(p);
                // Opening a project drops you into its conversation.
                if (p) setActiveTab('Home');
              }}
            />
          ) : activeTab === 'Books' ? (
            <BooksView
              onAskAI={(prompt) => {
                setChatInput(prompt);
                setActiveTab('Home');
                handleSendMessage(prompt);
              }}
            />
          ) : activeTab === 'Chat' ? (
            <ChatView
              messages={messages}
              session={session}
              busy={busy}
              startedAt={turnStartedAt}
              connected={conn === 'open'}
              offlineMode={isOfflineMode}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSend={handleSendMessage}
              onStop={handleStop}
              onPermission={handlePermission}
              onDismissNotice={dismissNotice}
              logoSrc={logoImg}
              textareaRef={textareaRef}
              composerFocused={composerFocused}
              setComposerFocused={setComposerFocused}
              voiceActive={isVoiceModeActive}
              onToggleVoice={() => setIsVoiceModeActive(!isVoiceModeActive)}
              onAttach={(a) => setAttachments((prev) => [...prev, ...a])}
              webSearch={webSearch}
              onToggleWebSearch={setWebSearch}
              onOpenSettings={() => setActiveTab('Settings')}
            />
          ) : activeTab === 'Calendar' ? (
            <CalendarView />
          ) : activeTab === 'Memory' ? (
            <MemorySectionView messages={messages} />
          ) : activeTab === 'Tasks' ? (
            <TasksSectionView />
          ) : activeTab === 'Agents' ? (
            <AgentsSectionView />
          ) : activeTab === 'Automations' ? (
            <AutomationsSectionView />
          ) : activeTab === 'Tools' ? (
            <ToolsSectionView />
          ) : activeTab === 'Integrations' ? (
            <IntegrationsSectionView />
          ) : (
            <>
              {/* The greeting and the starter cards are a *welcome*, so they
                  belong to an empty thread only. 'Home' and 'Chat' both land in
                  this branch, so switching tabs never dismissed them: the
                  answer appended underneath the hero and the screen ended up
                  showing a greeting, three prompts and a reply all at once. */}
              {messages.length === 0 && (
                <>
                  <div className="content-hero stagger-1">
                    <h1 className="greeting-line-1">
                      <span className="g-light">Good afternoon,</span>{' '}
                      <span className="g-bold">Surya</span>
                    </h1>
                    <h2 className="greeting-line-2">
                      <span className="g-light">What would you like to</span>{' '}
                      <span className="g-bold">build today?</span>
                    </h2>
                  </div>

                  <div className="cards-row stagger-2">
                    {ACTION_CARDS.map((card, i) => (
                      <button
                        key={i}
                        type="button"
                        className="action-card"
                        onClick={() => {
                          setChatInput(card.prompt);
                          setActiveTab('Chat');
                          setLeftSidebarOpen(false);
                        }}
                        style={{ '--bloom-color': card.bloomColor } as React.CSSProperties}
                      >
                        <span className={`card-chip ${card.chipClass}`}>{card.chip}</span>
                        <p className="card-body">{card.body}</p>
                        <ArrowRight size={18} className="card-arrow" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Live backend execution — planner stages, tool cards, thinking,
                  streaming response. Renders only events that actually arrived;
                  with no backend connected it renders nothing at all. */}
              <AssistantStream
                s={session}
                logoSrc={logoImg}
                speaking={speakingId === 'current'}
                onSpeak={() => speakMessage('current', session.response)}
              />

              {/* Compact Composer Chat Bar */}
              <div
                className={`composer stagger-3 ${composerFocused ? 'composer--focused' : ''}`}
              >
                <textarea
                  ref={textareaRef}
                  className="composer-input"
                  placeholder="What's on your mind?"
                  rows={2}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  onFocus={() => {
                    setComposerFocused(true);
                    if (activeTab === 'Home') {
                      setActiveTab('Chat');
                      setLeftSidebarOpen(false);
                    }
                  }}
                  onBlur={() => setComposerFocused(false)}
                  aria-label="What's on your mind?"
                />
                <div className="composer-footer">
                  {/* Adds input to the conversation. The model lives in the top
                      bar only — naming it here duplicated the selector. */}
                  <PlusMenu
                    onAttach={(a) => setAttachments((prev) => [...prev, ...a])}
                    webSearch={webSearch}
                    onToggleWebSearch={setWebSearch}
                    onOpenSettings={() => setActiveTab('Settings')}
                  />
                  {/* While dictating, the waveform replaces the row of buttons:
                      it is the only thing that matters at that moment, and it
                      is driven by real microphone loudness rather than a timer,
                      so a silent room reads as silent. */}
                  {dictation.recording && (
                    <div className="composer-wave">
                      <LiveWaveform
                        active={!dictation.transcribing}
                        processing={dictation.transcribing}
                        level={mic.level}
                        height={26}
                        barWidth={2}
                        barGap={2}
                        mode="scrolling"
                        fadeEdges
                        barColor="currentColor"
                        historySize={64}
                      />
                      <span className="composer-wave-hint">
                        {dictation.transcribing ? 'Transcribing…' : dictation.silent ? 'Listening…' : 'Speak now'}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Dictation: speak and the words land in the box as
                        ordinary editable text. Separate from voice-call mode,
                        which is the hands-free conversation. */}
                    <button
                      className={`btn-mic ${dictation.recording ? 'is-recording' : ''}`}
                      type="button"
                      onClick={dictation.toggle}
                      title={dictation.recording ? 'Stop dictation' : 'Dictate into the box'}
                      aria-label={dictation.recording ? 'Stop dictation' : 'Dictate into the box'}
                      aria-pressed={dictation.recording}
                    >
                      <Mic size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      className={`btn-mic ${isVoiceModeActive ? 'active' : ''}`}
                      type="button"
                      onClick={() => setIsVoiceModeActive(!isVoiceModeActive)}
                      title="Hands-free voice conversation"
                      aria-label="Voice conversation mode"
                      aria-pressed={isVoiceModeActive}
                    >
                      <AudioLines size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      className={`btn-send ${chatInput.trim() ? 'is-ready' : 'is-hidden'}`}
                      type="button"
                      onClick={() => handleSendMessage()}
                      disabled={!chatInput.trim()}
                      tabIndex={chatInput.trim() ? 0 : -1}
                      aria-hidden={!chatInput.trim()}
                      title="Send message"
                      aria-label="Send message"
                    >
                      <Send size={17} strokeWidth={1.9} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Settings Modal View */}
      {activeTab === 'Settings' && (
        <SettingsView
          onClose={() => setActiveTab('Home')}
          metrics={{
            cpu: sysInfo?.cpu ?? 0,
            mem: sysInfo?.mem ?? 0,
            gpu: sysInfo
              ? `${sysInfo.cpuModel} · ${sysInfo.cores} cores`
              : 'Backend not reachable',
            voiceLevel: 0,
          }}
          themePreference={preference}
          onThemeChange={setPreference}
        />
      )}

      {/* Google Calendar View Modal */}
      {isCalendarOpen && (
        <GoogleCalendarView onClose={() => setIsCalendarOpen(false)} />
      )}

      {/* LM Studio Style Large Model & Provider Hub Modal */}
      {modelModalOpen && (
        <div className="lm-model-overlay" onClick={() => setModelModalOpen(false)}>
          <div className="lm-model-card" onClick={e => e.stopPropagation()}>
            <div className="lm-model-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Box size={22} color="currentColor" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Model & Provider Hub</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                    Select your active LLM or switch between Online Cloud and Offline Local Mode
                  </p>
                </div>
              </div>
              <button className="sys-collapse-btn" onClick={() => setModelModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="lm-model-search-bar">
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filter models (e.g. Gemini 3.6, Claude 3.5, Llama)..."
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
              />
              {modelSearch && (
                <button onClick={() => setModelSearch('')} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Offline Mode Alert Toast if trying to select cloud while offline */}
            {offlineWarning && (
              <div className="lm-offline-alert">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HardDrive size={16} color="#F59E0B" />
                  <span>{offlineWarning}</span>
                </div>
                <button
                  className="lm-switch-online-btn"
                  onClick={() => {
                    setIsOfflineMode(false);
                    setOfflineWarning(null);
                  }}
                >
                  Switch to Online Mode
                </button>
              </div>
            )}

            <div className="lm-model-grid-scroll">
              {LM_MODEL_CATEGORIES.map(cat => {
                const filtered = cat.models.filter(m =>
                  m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
                  m.desc.toLowerCase().includes(modelSearch.toLowerCase())
                );
                if (filtered.length === 0) return null;
                const Icon = cat.icon;

                return (
                  <div key={cat.category} className="lm-category-block">
                    <div className="lm-category-title">
                      <Icon size={16} color={cat.color} />
                      <span>{cat.category}</span>
                    </div>
                    <div className="lm-models-subgrid">
                      {filtered.map(m => {
                        const isSelected = selectedModel === m.id;
                        const isLocal = m.id.includes('(Local)');

                        return (
                          <button
                            key={m.id}
                            className={`lm-model-tile ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              if (isOfflineMode && !isLocal) {
                                setOfflineWarning(`Internet/Offline Mode Active: "${m.id}" requires an Online connection.`);
                              } else {
                                setSelectedModel(m.id);
                                setOfflineWarning(null);
                                setModelModalOpen(false);
                              }
                            }}
                          >
                            <div className="lm-tile-header">
                              <span className="lm-tile-name">{m.id}</span>
                              <span className="lm-tile-badge">{m.badge}</span>
                            </div>
                            <p className="lm-tile-desc">{m.desc}</p>
                            {isSelected && (
                              <div className="lm-tile-check">
                                <CheckCircle2 size={14} color="currentColor" />
                                <span>Active Model</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* Voice AI Agent Full Overlay Screen (Triggered by wake words "Hey Feter", "Sakhi" or mic button) */}
      <VoiceAgentOverlay
        isOpen={isVoiceModeActive}
        onClose={() => setIsVoiceModeActive(false)}
        transcript={call.partial}
        callState={call.state}
        callError={call.error}
        notice={call.notice}
        onInterrupt={call.interrupt}
        isDark={applied === 'dark'}
        permissions={session.permissions}
        onPermission={handlePermission}
        /* The same messages the chat thread shows — the call is a different
           way into one conversation, not a second one. The tail is enough:
           this is a live transcript, not the archive. */
        turns={messages.slice(-12).map((m) => ({
          id: m.id,
          who: m.sender === 'user' ? ('you' as const) : ('eva' as const),
          text: m.text,
          live: m.sender === 'assistant' && busy && m.id === messages[messages.length - 1]?.id,
        }))}
      />
    </div>
  );
};
