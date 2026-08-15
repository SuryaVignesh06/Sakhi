import React, { useState, useEffect } from 'react';
import {
  CheckSquare, Plus, Sparkles, Clock, Calendar as CalendarIcon, Tag, AlertCircle,
  Play, Pause, RotateCcw, Check, ChevronRight, Filter, Search, List, Kanban,
  Layers, Sliders, ArrowRight, Zap, Target, BookOpen, Trash2, Edit3, X, CheckCircle2,
  FileText, Link2, Shield, Activity, BarChart2
} from 'lucide-react';
import { Markdown } from './AssistantStream';
import './TasksView.css';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'Inbox' | 'Not Started' | 'In Progress' | 'Waiting' | 'Blocked' | 'Completed' | 'Cancelled' | 'Archived';
  priority: 'Critical' | 'High' | 'Medium' | 'Low' | 'None';
  category: 'Personal' | 'Work' | 'Study' | 'Coding' | 'Meetings' | 'Finance' | 'Health' | 'Shopping' | 'Travel';
  project: 'Sakhi' | 'Portfolio' | 'College' | 'Hackathon' | 'Internship' | 'Research';
  dueDate: string;
  estimatedTime: string;
  subtasks: Subtask[];
  dependencies: string[];
  notes: string;
}

const INITIAL_TASKS: TaskItem[] = [
  {
    id: 't1',
    title: 'Complete Sakhi React & Express Integration',
    description: 'Hook up LangGraph agent streaming and local SQLite database persistence.',
    status: 'In Progress',
    priority: 'Critical',
    category: 'Coding',
    project: 'Sakhi',
    dueDate: 'Today, 8:00 PM',
    estimatedTime: '1h 20m',
    subtasks: [
      { id: 's1', title: 'Setup Express API endpoint', completed: true },
      { id: 's2', title: 'Implement LangGraph Planner state', completed: true },
      { id: 's3', title: 'Verify frontend WebSocket listener', completed: false },
      { id: 's4', title: 'Test electron packaging build', completed: false },
    ],
    dependencies: [],
    notes: '### Backend Architecture\n- Use `StateGraph` for LangGraph agent pipeline.\n- Stream events via SSE endpoint `/api/events`.',
  },
  {
    id: 't2',
    title: 'Run System Diagnostic & Memory Cleanup',
    description: 'Audit RAM consumption of background Electron renderer processes.',
    status: 'Not Started',
    priority: 'Medium',
    category: 'Work',
    project: 'Sakhi',
    dueDate: 'Today, 11:30 PM',
    estimatedTime: '25m',
    subtasks: [
      { id: 's5', title: 'Inspect memory heap snapshot', completed: false },
      { id: 's6', title: 'Clean stale temporary cache files', completed: false },
    ],
    dependencies: ['t1'],
    notes: 'Run `npm run electron:start` and check Task Manager stats.',
  },
  {
    id: 't3',
    title: 'Prepare College Project Presentation',
    description: 'Draft slides for AI Desktop Assistant architecture and user evaluation.',
    status: 'In Progress',
    priority: 'High',
    category: 'Study',
    project: 'College',
    dueDate: 'Tomorrow, 10:00 AM',
    estimatedTime: '2h 00m',
    subtasks: [
      { id: 's7', title: 'Outline system architecture diagram', completed: true },
      { id: 's8', title: 'Record 2-minute demo video', completed: false },
      { id: 's9', title: 'Export PDF slides', completed: false },
    ],
    dependencies: [],
    notes: 'Include screenshot of the Tasks module and Voice engine.',
  },
  {
    id: 't4',
    title: 'Review Local LLM Latency Benchmarks',
    description: 'Compare response speed between Ollama Llama 3.2 3B and Qwen 2.5 Coder.',
    status: 'Inbox',
    priority: 'Low',
    category: 'Coding',
    project: 'Research',
    dueDate: 'Aug 8, 2026',
    estimatedTime: '45m',
    subtasks: [
      { id: 's10', title: 'Test TTFT (Time to First Token)', completed: false },
      { id: 's11', title: 'Measure tokens per second output', completed: false },
    ],
    dependencies: [],
    notes: 'Check local backend `/api/models/local` JSON response.',
  },
];

export const TasksView = () => {
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [activeCategory, setActiveCategory] = useState<string>('Today');
  const [activeView, setActiveView] = useState<'list' | 'board' | 'timeline' | 'focus' | 'table'>('list');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>('t1');
  const [quickInput, setQuickInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);

  // Focus Mode Timer State (25 mins Pomodoro)
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (timerActive && timerSeconds > 0) {
      interval = setInterval(() => setTimerSeconds(s => s - 1), 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || tasks[0];

  // Quick Add Parser
  const handleQuickAdd = () => {
    if (!quickInput.trim()) return;
    const newTask: TaskItem = {
      id: `t_${Date.now()}`,
      title: quickInput.trim(),
      description: 'Quick captured task via natural language parser.',
      status: 'Inbox',
      priority: quickInput.toLowerCase().includes('urgent') ? 'Critical' : 'Medium',
      category: 'Work',
      project: 'Sakhi',
      dueDate: 'Today',
      estimatedTime: '30m',
      subtasks: [],
      dependencies: [],
      notes: '',
    };
    setTasks(prev => [newTask, ...prev]);
    setSelectedTaskId(newTask.id);
    setQuickInput('');
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: t.subtasks.map(s => (s.id === subtaskId ? { ...s, completed: !s.completed } : s)),
        };
      })
    );
  };

  const handleToggleTaskCompleted = (taskId: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== taskId) return t;
        const isDone = t.status === 'Completed';
        return { ...t, status: isDone ? 'In Progress' : 'Completed' };
      })
    );
  };

  const handleAddSubtask = (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: [...t.subtasks, { id: `s_${Date.now()}`, title: newSubtaskTitle.trim(), completed: false }],
        };
      })
    );
    setNewSubtaskTitle('');
  };

  // AI Subtask Breakdown Trigger
  const handleAiBreakdown = (taskId: string) => {
    const aiGeneratedSubtasks: Subtask[] = [
      { id: `s_ai_${Date.now()}_1`, title: 'Analyze requirements & dependencies', completed: false },
      { id: `s_ai_${Date.now()}_2`, title: 'Draft implementation blueprint', completed: false },
      { id: `s_ai_${Date.now()}_3`, title: 'Execute core module logic', completed: false },
      { id: `s_ai_${Date.now()}_4`, title: 'Run unit verification & automated tests', completed: false },
    ];
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, subtasks: [...t.subtasks, ...aiGeneratedSubtasks] };
      })
    );
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.category.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeCategory === 'Today') return t.dueDate.includes('Today');
    if (activeCategory === 'Upcoming') return t.dueDate.includes('Tomorrow') || t.dueDate.includes('Aug');
    if (activeCategory === 'Inbox') return t.status === 'Inbox';
    if (activeCategory === 'Completed') return t.status === 'Completed';
    return true;
  });

  const completedCount = tasks.filter(t => t.status === 'Completed').length;
  const totalCount = tasks.length;
  const pctDone = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="tasks-container">
      {/* ─── AI NEXT BEST ACTION BANNER ───────────────────────────────── */}
      <div className="next-best-action-card">
        <div className="nba-header">
          <span className="nba-badge">
            <Sparkles size={13} /> AI NEXT BEST ACTION
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={12} color="currentColor" /> Synced with Google Calendar & Local LLM Planner
          </span>
        </div>

        <div className="nba-content">
          <span className="nba-subtitle">
            Based on your priority schedule, calendar availability (Free slot until 3:00 PM), and task dependencies:
          </span>
          <div className="nba-title-row">
            <span className="nba-title">
              Complete Sakhi React & Express Integration
            </span>
            <span className="nba-meta-pill">Estimated: 1h 20m</span>
            <span className="nba-meta-pill" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444' }}>Critical Priority</span>
          </div>
        </div>

        <div className="nba-actions">
          <button
            className="btn-primary"
            style={{ height: 32, fontSize: 12 }}
            onClick={() => setActiveView('focus')}
          >
            <Target size={14} /> Start Focus Session
          </button>
          <button
            className="btn-secondary"
            style={{ height: 32, fontSize: 12 }}
            onClick={() => handleToggleTaskCompleted('t1')}
          >
            <Check size={14} /> Mark Complete
          </button>
          <button
            className="btn-secondary"
            style={{ height: 32, fontSize: 12 }}
            onClick={() => handleAiBreakdown('t1')}
          >
            <Sparkles size={14} color="currentColor" /> AI Break Down Subtasks
          </button>
        </div>
      </div>

      {/* ─── 3-COLUMN WORKSPACE ───────────────────────────────────────── */}
      <div className={`tasks-workspace ${selectedTaskId ? 'tasks-workspace--with-drawer' : ''}`}>
        
        {/* ─── LEFT SUB-SIDEBAR ───────────────────────────────────────── */}
        <aside className="tasks-sidebar">
          <div>
            <div className="sidebar-group-title">Views & Filters</div>
            <div className="sidebar-nav-list">
              {[
                { id: 'Today', label: 'Today', icon: CheckSquare, count: tasks.filter(t => t.dueDate.includes('Today')).length },
                { id: 'Upcoming', label: 'Upcoming', icon: CalendarIcon, count: tasks.filter(t => t.dueDate.includes('Tomorrow') || t.dueDate.includes('Aug')).length },
                { id: 'Inbox', label: 'Inbox', icon: Tag, count: tasks.filter(t => t.status === 'Inbox').length },
                { id: 'Completed', label: 'Completed', icon: CheckCircle2, count: completedCount },
              ].map(cat => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    className={`tasks-nav-btn ${activeCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <div className="tasks-nav-btn-left">
                      <Icon size={15} />
                      <span>{cat.label}</span>
                    </div>
                    <span className="nav-count-badge">{cat.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="sidebar-group-title">Projects</div>
            <div className="sidebar-nav-list">
              {[
                { name: 'Sakhi', color: '#10A37F' },
                { name: 'College', color: '#3B82F6' },
                { name: 'Portfolio', color: '#F59E0B' },
                { name: 'Research', color: '#10B981' },
              ].map(proj => (
                <button key={proj.name} className="tasks-nav-btn">
                  <div className="tasks-nav-btn-left">
                    <span className="project-dot" style={{ background: proj.color }} />
                    <span>{proj.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats Box */}
          <div className="tasks-stats-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Completion Rate</span>
              <span style={{ color: 'var(--text-primary)' }}>{pctDone}%</span>
            </div>
            <div className="stats-progress-bar">
              <div className="stats-progress-fill" style={{ width: `${pctDone}%` }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>
              {completedCount} of {totalCount} tasks finished
            </div>
          </div>
        </aside>

        {/* ─── MIDDLE MAIN CONTENT ────────────────────────────────────── */}
        <main className="tasks-main">
          
          {/* Top Toolbar */}
          <div className="tasks-toolbar">
            {/* View Switcher Tabs */}
            <div className="view-tabs-group">
              {[
                { id: 'list', label: 'List', icon: List },
                { id: 'board', label: 'Board (Kanban)', icon: Kanban },
                { id: 'timeline', label: 'Timeline', icon: Layers },
                { id: 'focus', label: 'Focus Mode', icon: Target },
                { id: 'table', label: 'Table', icon: Sliders },
              ].map(v => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    className={`view-tab-btn ${activeView === v.id ? 'active' : ''}`}
                    onClick={() => setActiveView(v.id as any)}
                  >
                    <Icon size={14} />
                    <span>{v.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="quick-add-bar" style={{ height: 34, padding: '0 10px' }}>
                <Search size={14} color="currentColor" />
                <input
                  type="text"
                  placeholder="Filter tasks..."
                  className="quick-add-input"
                  style={{ fontSize: 12 }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Quick Add Bar */}
          <div className="quick-add-bar">
            <Plus size={16} color="currentColor" />
            <input
              type="text"
              placeholder='Quick add task (e.g. "Finish assignment tomorrow 6 PM")...'
              className="quick-add-input"
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
            />
            <button
              className="btn-primary"
              style={{ height: 28, fontSize: 11, padding: '0 10px' }}
              onClick={handleQuickAdd}
            >
              Add Task
            </button>
          </div>

          {/* ─── RENDER SELECTED VIEW ─────────────────────────────────── */}
          {activeView === 'list' && (
            <div className="task-list-view">
              {filteredTasks.map(t => {
                const isSelected = t.id === selectedTaskId;
                const completedSubs = t.subtasks.filter(s => s.completed).length;
                const totalSubs = t.subtasks.length;

                return (
                  <div
                    key={t.id}
                    className={`task-item-row ${isSelected ? 'selected' : ''} ${t.status === 'Completed' ? 'completed' : ''}`}
                    onClick={() => setSelectedTaskId(t.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        className={`task-check-btn ${t.status === 'Completed' ? 'checked' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          handleToggleTaskCompleted(t.id);
                        }}
                      >
                        {t.status === 'Completed' && <Check size={12} strokeWidth={3} />}
                      </button>
                      <div>
                        <div className="task-title-text">{t.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', gap: 10, marginTop: 3 }}>
                          <span><Clock size={11} /> {t.dueDate}</span>
                          <span>• {t.project}</span>
                          {totalSubs > 0 && <span>• Subtasks ({completedSubs}/{totalSubs})</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`priority-badge ${t.priority}`}>{t.priority}</span>
                      <button
                        className="btn-secondary"
                        style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                        onClick={e => {
                          e.stopPropagation();
                          handleAiBreakdown(t.id);
                        }}
                        title="Generate Subtasks"
                      >
                        <Sparkles size={12} color="currentColor" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* KANBAN BOARD VIEW */}
          {activeView === 'board' && (
            <div className="kanban-grid">
              {['Inbox', 'Not Started', 'In Progress', 'Completed'].map(colStatus => (
                <div key={colStatus} className="kanban-column">
                  <div className="kanban-col-head">
                    <span>{colStatus}</span>
                    <span>({tasks.filter(t => t.status === colStatus).length})</span>
                  </div>
                  {tasks
                    .filter(t => t.status === colStatus)
                    .map(t => (
                      <div
                        key={t.id}
                        className="kanban-card"
                        onClick={() => setSelectedTaskId(t.id)}
                      >
                        <span className={`priority-badge ${t.priority}`} style={{ width: 'fit-content' }}>{t.priority}</span>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t.project}</span>
                          <span>{t.dueDate}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}

          {/* TIMELINE VIEW */}
          {activeView === 'timeline' && (
            <div className="task-list-view">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Gantt Timeline & Dependency Map (Task A → Task B)
              </div>
              {tasks.map((t, idx) => (
                <div key={t.id} className="task-item-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 220 }}>
                    <span className="task-title-text" style={{ fontSize: 12.5 }}>{t.title}</span>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(var(--ink), 0.04)', height: 24, borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: `${(idx * 20) % 60}%`,
                        width: '35%',
                        height: '100%',
                        background: 'linear-gradient(90deg, rgba(var(--ink), 0.4), rgba(var(--ink), 0.6))',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 8,
                        fontSize: 11,
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {t.estimatedTime}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* FOCUS MODE VIEW */}
          {activeView === 'focus' && (
            <div className="focus-mode-wrapper">
              <div className="timer-circle">
                <div className="timer-digits">{formatTimer(timerSeconds)}</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Pomodoro Focus</span>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn-primary"
                  style={{ height: 38, padding: '0 20px' }}
                  onClick={() => setTimerActive(!timerActive)}
                >
                  {timerActive ? <Pause size={16} /> : <Play size={16} />}
                  <span>{timerActive ? 'Pause Session' : 'Start Focus'}</span>
                </button>
                <button
                  className="btn-secondary"
                  style={{ height: 38, padding: '0 16px' }}
                  onClick={() => {
                    setTimerActive(false);
                    setTimerSeconds(25 * 60);
                  }}
                >
                  <RotateCcw size={15} /> Reset
                </button>
              </div>

              <div style={{ maxWidth: 450, marginTop: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedTask.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{selectedTask.description}</div>
              </div>
            </div>
          )}

          {/* TABLE VIEW */}
          {activeView === 'table' && (
            <div className="as-tablewrap">
              <table className="as-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Project</th>
                    <th>Category</th>
                    <th>Due Date</th>
                    <th>Est. Time</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(t => (
                    <tr key={t.id} onClick={() => setSelectedTaskId(t.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</td>
                      <td><span className="nba-meta-pill" style={{ fontSize: 10 }}>{t.status}</span></td>
                      <td><span className={`priority-badge ${t.priority}`}>{t.priority}</span></td>
                      <td>{t.project}</td>
                      <td>{t.category}</td>
                      <td>{t.dueDate}</td>
                      <td>{t.estimatedTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </main>

        {/* ─── RIGHT DRAWER (TASK DETAILS & AI EDITOR) ───────────────── */}
        {selectedTaskId && selectedTask && (
          <aside className="task-drawer">
            <div className="drawer-header">
              <input
                type="text"
                className="drawer-title-input"
                value={selectedTask.title}
                onChange={e => {
                  const val = e.target.value;
                  setTasks(prev => prev.map(t => (t.id === selectedTaskId ? { ...t, title: val } : t)));
                }}
              />
              <button
                className="sidebar-close-btn"
                onClick={() => setSelectedTaskId(null)}
                style={{ width: 26, height: 26 }}
              >
                <X size={14} />
              </button>
            </div>

            {/* AI Action Quick Buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                style={{ height: 28, fontSize: 11, background: 'rgba(var(--ink), 0.1)', color: 'var(--text-primary)', borderColor: 'rgba(var(--ink), 0.3)' }}
                onClick={() => handleAiBreakdown(selectedTask.id)}
              >
                <Sparkles size={12} /> AI Break Down
              </button>
              <button className="btn-secondary" style={{ height: 28, fontSize: 11 }}>
                <Clock size={12} /> Estimate Time
              </button>
            </div>

            {/* Properties Grid */}
            <div className="prop-grid">
              <span className="prop-label">Status</span>
              <select
                className="prop-select"
                value={selectedTask.status}
                onChange={e => {
                  const val = e.target.value as any;
                  setTasks(prev => prev.map(t => (t.id === selectedTaskId ? { ...t, status: val } : t)));
                }}
              >
                <option value="Inbox">Inbox</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting">Waiting</option>
                <option value="Blocked">Blocked</option>
                <option value="Completed">Completed</option>
              </select>

              <span className="prop-label">Priority</span>
              <select
                className="prop-select"
                value={selectedTask.priority}
                onChange={e => {
                  const val = e.target.value as any;
                  setTasks(prev => prev.map(t => (t.id === selectedTaskId ? { ...t, priority: val } : t)));
                }}
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="None">None</option>
              </select>

              <span className="prop-label">Project</span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{selectedTask.project}</span>

              <span className="prop-label">Due Date</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedTask.dueDate}</span>
            </div>

            {/* Subtasks Section */}
            <div className="subtasks-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>Subtasks Checklist</span>
                <span>
                  {selectedTask.subtasks.filter(s => s.completed).length} / {selectedTask.subtasks.length}
                </span>
              </div>

              {selectedTask.subtasks.map(sub => (
                <div key={sub.id} className="subtask-item">
                  <button
                    className={`task-check-btn ${sub.completed ? 'checked' : ''}`}
                    style={{ width: 16, height: 16 }}
                    onClick={() => handleToggleSubtask(selectedTask.id, sub.id)}
                  >
                    {sub.completed && <Check size={10} strokeWidth={3} />}
                  </button>
                  <span style={{ textDecoration: sub.completed ? 'line-through' : 'none', color: sub.completed ? 'var(--text-faint)' : 'var(--text-primary)' }}>
                    {sub.title}
                  </span>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  type="text"
                  className="quick-add-input"
                  placeholder="+ Add subtask..."
                  style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 6, background: 'rgba(var(--ink), 0.05)' }}
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddSubtask(selectedTask.id)}
                />
              </div>
            </div>

            {/* Notes Section with Formatted Markdown Rendering */}
            <div>
              <div className="task-notes-header">
                <span className="task-notes-title">Markdown Notes</span>
                <button
                  type="button"
                  className="task-notes-toggle-btn"
                  onClick={() => setEditingNotesId(editingNotesId === selectedTask.id ? null : selectedTask.id)}
                  title={editingNotesId === selectedTask.id ? "Done / View Formatted" : "Edit Notes"}
                >
                  {editingNotesId === selectedTask.id ? (
                    <>
                      <Check size={12} color="#10B981" />
                      <span>Done</span>
                    </>
                  ) : (
                    <>
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </>
                  )}
                </button>
              </div>

              {editingNotesId === selectedTask.id ? (
                <textarea
                  className="composer-input"
                  style={{
                    width: '100%',
                    minHeight: 120,
                    fontSize: 12,
                    borderRadius: 10,
                    padding: 12,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(var(--ink), 0.3)',
                    color: 'var(--text-primary)',
                    fontFamily: 'Fira Code, monospace',
                  }}
                  value={selectedTask.notes}
                  onChange={e => {
                    const val = e.target.value;
                    setTasks(prev => prev.map(t => (t.id === selectedTaskId ? { ...t, notes: val } : t)));
                  }}
                  placeholder="Add markdown notes, links, code snippets..."
                  autoFocus
                />
              ) : (
                <div
                  className="task-notes-preview-box"
                  onClick={() => setEditingNotesId(selectedTask.id)}
                  title="Click to edit notes"
                >
                  {selectedTask.notes && selectedTask.notes.trim() ? (
                    <Markdown text={selectedTask.notes} />
                  ) : (
                    <span style={{ fontStyle: 'italic', color: 'var(--text-faint)', fontSize: 12 }}>
                      No notes added yet. Click to edit...
                    </span>
                  )}
                </div>
              )}
            </div>

          </aside>
        )}
      </div>
    </div>
  );
};
