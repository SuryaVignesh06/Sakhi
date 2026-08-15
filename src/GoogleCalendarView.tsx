import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, X,
  Clock, MapPin, Users, Tag, Trash2, Check, Search, Sparkles,
  ChevronDown, Filter, Zap, Bell, CheckSquare, Brain, LayoutGrid,
  Bot, AlertCircle, Copy, ArrowRight, Play, RefreshCw, Cpu
} from 'lucide-react';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string;
  duration?: string;
  eventType: 'Normal Event' | 'Meeting' | 'Reminder' | 'Task' | 'Deadline' | 'Birthday' | 'Holiday' | 'Automation';
  category: 'Coding' | 'Study' | 'Personal' | 'Health' | 'Fitness' | 'Finance' | 'Shopping' | 'Meetings' | 'Entertainment' | 'Automation' | 'Reminder' | 'Custom';
  color: string;
  bgLight: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled' | 'Overdue' | 'Rescheduled';
  location?: string;
  attendees?: string[];
  description?: string;
  allDay?: boolean;
  reminder?: string;
  aiSuggestion?: string;
  assignedAgent?: string;
  automationTrigger?: string;
}

const COLOR_SYSTEM: Record<string, { color: string; bg: string }> = {
  Coding: { color: '#10A37F', bg: 'rgba(16, 163, 127, 0.18)' },
  Study: { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.18)' },
  Meetings: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.18)' },
  Health: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.18)' },
  Personal: { color: '#F97316', bg: 'rgba(249, 115, 22, 0.18)' },
  Reminder: { color: '#EAB308', bg: 'rgba(234, 179, 8, 0.18)' },
  Automation: { color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.18)' },
  Completed: { color: '#7A7480', bg: 'rgba(122, 116, 128, 0.18)' },
  Fitness: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.18)' },
  Finance: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.18)' },
  Shopping: { color: '#F97316', bg: 'rgba(249, 115, 22, 0.18)' },
  Entertainment: { color: '#EC4899', bg: 'rgba(236, 72, 153, 0.18)' },
  Custom: { color: '#10A37F', bg: 'rgba(16, 163, 127, 0.18)' },
};

const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Deep Work & Neural Core Coding',
    date: '2026-08-05',
    time: '09:00 AM',
    duration: '2 Hours',
    eventType: 'Task',
    category: 'Coding',
    color: '#10A37F',
    bgLight: 'rgba(16, 163, 127, 0.18)',
    priority: 'High',
    status: 'In Progress',
    reminder: '15 Minutes Before',
    aiSuggestion: 'Focus mode active. Recommended uninterrupted 2h slot.',
    assignedAgent: 'Coding Agent',
    description: 'Refine Sakhi React state architecture & event sync.'
  },
  {
    id: 'e2',
    title: 'AI System Architecture Sync',
    date: '2026-08-05',
    time: '10:30 AM',
    duration: '1 Hour',
    eventType: 'Meeting',
    category: 'Meetings',
    color: '#10B981',
    bgLight: 'rgba(16, 185, 129, 0.18)',
    priority: 'High',
    status: 'Upcoming',
    location: 'Zoom Video Room',
    attendees: ['Surya Vignesh', 'Alex Chen', 'Elena Rostova'],
    reminder: '10 Minutes Before',
    aiSuggestion: 'Generate meeting agenda & key discussion points.',
    assignedAgent: 'Planner Agent',
    description: 'Quarterly review of neural core orchestration & model latencies.'
  },
  {
    id: 'e3',
    title: 'Design System Sprint',
    date: '2026-08-05',
    time: '11:30 AM',
    duration: '1.5 Hours',
    eventType: 'Normal Event',
    category: 'Study',
    color: '#8B5CF6',
    bgLight: 'rgba(139, 92, 246, 0.18)',
    priority: 'Medium',
    status: 'Upcoming',
    location: 'Figma Huddle',
    reminder: '5 Minutes Before',
    description: 'Refining frosted glass aesthetic tokens.'
  },
  {
    id: 'e4',
    title: 'Startup Workspace Warmup',
    date: '2026-08-05',
    time: '08:00 AM',
    duration: '15 Mins',
    eventType: 'Automation',
    category: 'Automation',
    color: '#06B6D4',
    bgLight: 'rgba(6, 182, 212, 0.18)',
    priority: 'Low',
    status: 'Completed',
    automationTrigger: 'Open VS Code & GitHub',
    aiSuggestion: 'Automated script triggered on system launch.',
    description: 'Launch VS Code, open repo, and initialize Kokoro TTS engine.'
  },
  {
    id: 'e5',
    title: 'Health & Fitness Mobility Routine',
    date: '2026-08-05',
    time: '01:30 PM',
    duration: '1 Hour',
    eventType: 'Reminder',
    category: 'Health',
    color: '#EF4444',
    bgLight: 'rgba(239, 68, 68, 0.18)',
    priority: 'Medium',
    status: 'Upcoming',
    location: 'Equinox Gym',
    reminder: '30 Minutes Before',
    aiSuggestion: 'Optimal break time after morning coding sessions.'
  },
  {
    id: 'e6',
    title: 'Sakhi OS Roadmap Review',
    date: '2026-08-06',
    time: '02:00 PM',
    duration: '1.5 Hours',
    eventType: 'Meeting',
    category: 'Meetings',
    color: '#10B981',
    bgLight: 'rgba(16, 185, 129, 0.18)',
    priority: 'High',
    status: 'Upcoming',
    location: 'Conference Room 4B',
    attendees: ['Core Dev Team']
  },
  {
    id: 'e7',
    title: 'GitHub Release & Documentation Sync',
    date: '2026-08-07',
    time: '10:00 AM',
    duration: '1 Hour',
    eventType: 'Deadline',
    category: 'Coding',
    color: '#C77DFF',
    bgLight: 'rgba(199, 125, 255, 0.18)',
    priority: 'High',
    status: 'Upcoming',
    reminder: '1 Day Before'
  }
];

interface GoogleCalendarViewProps {
  onClose: () => void;
}

export const GoogleCalendarView: React.FC<GoogleCalendarViewProps> = ({ onClose }) => {
  const [viewMode, setViewMode] = useState<'Day View' | 'Week View' | 'Month View' | 'Year View' | 'Agenda View'>('Week View');
  const [activeTabFilter, setActiveTabFilter] = useState<'All' | 'Tasks' | 'Meetings' | 'Reminders' | 'Automations' | 'Archived'>('All');
  const [currentDate, setCurrentDate] = useState(new Date(2026, 7, 5));
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPlannerDrawer, setShowPlannerDrawer] = useState(false);
  const [aiToastMessage, setAiToastMessage] = useState<string | null>(null);

  // Form State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-08-05');
  const [newEventTime, setNewEventTime] = useState('09:00 AM');
  const [newEventDuration, setNewEventDuration] = useState('1 Hour');
  const [newEventCategory, setNewEventCategory] = useState<CalendarEvent['category']>('Coding');
  const [newEventType, setNewEventType] = useState<CalendarEvent['eventType']>('Task');
  const [newEventPriority, setNewEventPriority] = useState<CalendarEvent['priority']>('High');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Keyboard Shortcuts Handler (N: New, Delete: Delete event, Ctrl+D: Duplicate, Ctrl+F: Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsAddModalOpen(true);
      } else if (e.key === 'Delete' && selectedEvent) {
        e.preventDefault();
        handleDeleteEvent(selectedEvent.id);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'd' && selectedEvent) {
        e.preventDefault();
        handleDuplicateEvent(selectedEvent);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent]);

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();

  const handlePrev = () => setCurrentDate(new Date(year, monthIndex, currentDate.getDate() - 7));
  const handleNext = () => setCurrentDate(new Date(year, monthIndex, currentDate.getDate() + 7));
  const handleToday = () => setCurrentDate(new Date(2026, 7, 5));

  const showAiToast = (msg: string) => {
    setAiToastMessage(msg);
    setTimeout(() => setAiToastMessage(null), 3500);
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const style = COLOR_SYSTEM[newEventCategory] || COLOR_SYSTEM.Coding;
    const created: CalendarEvent = {
      id: Date.now().toString(),
      title: newEventTitle.trim(),
      date: newEventDate,
      time: newEventTime,
      duration: newEventDuration,
      eventType: newEventType,
      category: newEventCategory,
      color: style.color,
      bgLight: style.bg,
      priority: newEventPriority,
      status: 'Upcoming',
      location: newEventLocation.trim() || 'Online',
      description: newEventDescription.trim() || 'AI Scheduled Event',
      reminder: '15 Minutes Before',
      assignedAgent: 'Planner Agent'
    };

    setEvents(prev => [...prev, created]);
    setIsAddModalOpen(false);
    showAiToast(`Event "${created.title}" scheduled successfully!`);
    setNewEventTitle('');
    setNewEventLocation('');
    setNewEventDescription('');
  };

  const handleGridSlotClick = (dateStr: string, timeStr: string) => {
    setNewEventTitle('');
    setNewEventDate(dateStr);
    setNewEventTime(timeStr);
    setNewEventDuration('1 Hour');
    setNewEventCategory('Coding');
    setNewEventType('Task');
    setNewEventPriority('Medium');
    setNewEventLocation('');
    setNewEventDescription('');
    setIsAddModalOpen(true);
  };

  const handleUpdateSelectedEvent = (fields: Partial<CalendarEvent>) => {
    if (!selectedEvent) return;
    const cat = fields.category || selectedEvent.category;
    const style = COLOR_SYSTEM[cat] || COLOR_SYSTEM.Coding;
    const updated: CalendarEvent = {
      ...selectedEvent,
      ...fields,
      color: style.color,
      bgLight: style.bg,
    };
    setSelectedEvent(updated);
    setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(prev => prev.filter(ev => ev.id !== id));
    setSelectedEvent(null);
  };

  const handleDuplicateEvent = (ev: CalendarEvent) => {
    const dup: CalendarEvent = {
      ...ev,
      id: Date.now().toString(),
      title: `${ev.title} (Copy)`,
    };
    setEvents(prev => [...prev, dup]);
  };

  const filteredEvents = events.filter(ev => {
    // Tab Filter
    if (activeTabFilter === 'Tasks' && ev.eventType !== 'Task') return false;
    if (activeTabFilter === 'Meetings' && ev.eventType !== 'Meeting') return false;
    if (activeTabFilter === 'Reminders' && ev.eventType !== 'Reminder') return false;
    if (activeTabFilter === 'Automations' && ev.eventType !== 'Automation') return false;
    if (activeTabFilter === 'Archived' && ev.status !== 'Completed' && ev.status !== 'Cancelled') return false;

    // Search query
    return (
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.location && ev.location.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  const getEventsForDate = (dateStr: string) => {
    return filteredEvents.filter(ev => ev.date === dateStr);
  };

  const weekDays = [
    { dayName: 'Mon', dayNum: 3, fullDate: '2026-08-03', isToday: false },
    { dayName: 'Tue', dayNum: 4, fullDate: '2026-08-04', isToday: false },
    { dayName: 'Wed', dayNum: 5, fullDate: '2026-08-05', isToday: true },
    { dayName: 'Thu', dayNum: 6, fullDate: '2026-08-06', isToday: false },
    { dayName: 'Fri', dayNum: 7, fullDate: '2026-08-07', isToday: false },
    { dayName: 'Sat', dayNum: 8, fullDate: '2026-08-08', isToday: false },
    { dayName: 'Sun', dayNum: 9, fullDate: '2026-08-09', isToday: false },
  ];

  const timeSlots = [
    '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'
  ];

  // Productivity Metrics
  const completedCount = events.filter(e => e.status === 'Completed').length;
  const pendingCount = events.filter(e => e.status !== 'Completed').length;

  return (
    <div className="uu-backdrop" onClick={onClose}>
      <div className="uu-modal-container" onClick={e => e.stopPropagation()}>
        {/* Toast Notification */}
        {aiToastMessage && (
          <div className="ai-toast-banner">
            <Sparkles size={14} className="animate-spin" />
            <span>{aiToastMessage}</span>
          </div>
        )}

        {/* Top Header & Breadcrumb Bar */}
        <header className="uu-header">
          <div className="uu-header-top-row">
            <div className="uu-breadcrumb-row">
              <span className="uu-bc-item">Home</span>
              <span className="uu-bc-sep">›</span>
              <span className="uu-bc-item uu-bc-active">Calendar</span>
            </div>

            <div className="uu-header-right-tools">
              <button className="uu-icon-tool-btn" title="Notifications">
                <Bell size={16} />
                <span className="bell-dot" />
              </button>
              <div className="account-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>SV</div>
            </div>
          </div>

          <div className="uu-title-row">
            <h1 className="uu-page-title">Calendar</h1>
            <div className="uu-top-search-box">
              <Search size={14} className="uu-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search events, tags, categories..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <kbd className="uu-search-kbd">⌘F</kbd>
              <button className="uu-close-modal-btn" onClick={onClose} title="Close Calendar">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Navigation Filter Tabs */}
          <div className="uu-tabs-row">
            {(['All', 'Tasks', 'Meetings', 'Reminders', 'Automations', 'Archived'] as const).map(tab => (
              <button
                key={tab}
                className={`uu-filter-tab ${activeTabFilter === tab ? 'active' : ''}`}
                onClick={() => setActiveTabFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>



        {/* Main Content Body (Calendar Grid + Right Statistics Sidebar) */}
        <div className="uu-calendar-card">
          {/* Card Toolbar */}
          <div className="uu-card-toolbar">
            <div className="uu-date-badge-box">
              <div className="uu-badge-date-sq">
                <span className="uu-badge-mon">AUG</span>
                <span className="uu-badge-num">05</span>
              </div>
              <div className="uu-badge-text-col">
                <h2 className="uu-month-heading">August 2026</h2>
                <span className="uu-date-range-sub">Aug 1, 2026 – Aug 31, 2026</span>
              </div>
            </div>

            <div className="uu-toolbar-actions">
              <div className="uu-nav-pill-group">
                <button className="uu-nav-pill-arrow" onClick={handlePrev} title="Previous (Ctrl+Left)">
                  <ChevronLeft size={16} />
                </button>
                <button className="uu-nav-pill-today" onClick={handleToday}>
                  Today
                </button>
                <button className="uu-nav-pill-arrow" onClick={handleNext} title="Next (Ctrl+Right)">
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="uu-select-wrapper">
                <select
                  value={viewMode}
                  onChange={e => setViewMode(e.target.value as any)}
                  className="uu-view-select"
                >
                  <option value="Week View">Week View</option>
                  <option value="Day View">Day View</option>
                  <option value="Month View">Month View</option>
                  <option value="Year View">Year View</option>
                  <option value="Agenda View">Agenda View</option>
                </select>
                <ChevronDown size={14} className="uu-select-arrow" />
              </div>

              <button className="uu-btn-add-event" onClick={() => setIsAddModalOpen(true)} title="Shortcut: N">
                <Plus size={15} strokeWidth={2.5} />
                <span>+ Add Event</span>
              </button>
            </div>
          </div>

          {/* Calendar Grid Viewport & Statistics Sidebar */}
          <div className="uu-grid-body-layout">
            <div className="uu-grid-viewport">
              {/* 1. WEEK VIEW */}
              {viewMode === 'Week View' && (
                <div className="uu-week-grid-table">
                  <div className="uu-days-header-row">
                    <div className="uu-time-corner-cell" />
                    {weekDays.map(wd => (
                      <div key={wd.fullDate} className={`uu-day-header-cell ${wd.isToday ? 'is-today' : ''}`}>
                        <span className="uu-dh-name">{wd.dayName}</span>
                        <span className={`uu-dh-num ${wd.isToday ? 'uu-dh-num-active' : ''}`}>{wd.dayNum}</span>
                      </div>
                    ))}
                  </div>

                  <div className="uu-time-grid-body">
                    {/* Dotted Timeline Indicator at 2:20 PM */}
                    <div className="uu-timeline-line" style={{ top: '340px' }}>
                      <span className="uu-timeline-badge">2:20 PM</span>
                      <div className="uu-dotted-line" />
                    </div>

                    {timeSlots.map(timeLabel => (
                      <div key={timeLabel} className="uu-time-slot-row">
                        <div className="uu-time-label-cell">{timeLabel}</div>
                        {weekDays.map(wd => {
                          const matchedEvs = filteredEvents.filter(ev =>
                            ev.date === wd.fullDate &&
                            ev.time.startsWith(timeLabel.split(':')[0])
                          );

                          return (
                            <div
                              key={wd.fullDate}
                              className="uu-grid-slot-cell"
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => {
                                if (e.target === e.currentTarget) {
                                  handleGridSlotClick(wd.fullDate, timeLabel);
                                }
                              }}
                              title={`Click to add event on ${wd.dayName} at ${timeLabel}`}
                            >
                              {matchedEvs.map(ev => (
                                <div
                                  key={ev.id}
                                  className="uu-event-card-pastel"
                                  style={{
                                    borderLeftColor: ev.color,
                                    backgroundColor: ev.bgLight,
                                    color: 'var(--text-primary)'
                                  }}
                                  onClick={() => setSelectedEvent(ev)}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <strong className="uu-ev-card-title">{ev.title}</strong>
                                    <span className={`priority-tag ${ev.priority.toLowerCase()}`} style={{ fontSize: 9, padding: '1px 4px' }}>{ev.priority}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, opacity: 0.85 }}>
                                    <span><Clock size={10} /> {ev.time}</span>
                                    <span>• {ev.category}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. AGENDA VIEW */}
              {viewMode === 'Agenda View' && (
                <div className="uu-agenda-view-container">
                  <div className="agenda-list">
                    {filteredEvents.map(ev => (
                      <div key={ev.id} className="agenda-item-card" onClick={() => setSelectedEvent(ev)}>
                        <div className="agenda-time-col">
                          <span className="agenda-time">{ev.time}</span>
                          <span className="agenda-date">{ev.date}</span>
                        </div>
                        <div className="agenda-bar" style={{ background: ev.color }} />
                        <div className="agenda-details">
                          <h4 className="agenda-title">{ev.title}</h4>
                          <span className="agenda-meta">
                            {ev.category} • {ev.eventType} • {ev.location || 'Online'}
                          </span>
                        </div>
                        <span className={`priority-tag ${ev.priority.toLowerCase()}`}>{ev.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. MONTH VIEW */}
              {viewMode === 'Month View' && (
                <div className="uu-month-view-grid">
                  <div className="uu-days-header-row">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="uu-day-header-cell"><span className="uu-dh-name">{d}</span></div>
                    ))}
                  </div>
                  <div className="uu-month-cells-container">
                    {Array.from({ length: 35 }).map((_, idx) => {
                      const dayNum = (idx % 31) + 1;
                      const dateStr = `2026-08-${String(dayNum).padStart(2, '0')}`;
                      const dayEvs = getEventsForDate(dateStr);
                      return (
                        <div
                          key={idx}
                          className="uu-month-cell"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            if (e.target === e.currentTarget) {
                              handleGridSlotClick(dateStr, '09:00 AM');
                            }
                          }}
                          title={`Click to add event on ${dateStr}`}
                        >
                          <span className="uu-month-date-num">{dayNum}</span>
                          <div className="uu-month-ev-list">
                            {dayEvs.slice(0, 2).map(ev => (
                              <div key={ev.id} className="uu-mini-chip" style={{ borderLeftColor: ev.color, background: ev.bgLight, color: ev.color }}>
                                {ev.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DAY / YEAR FALLBACK */}
              {(viewMode === 'Day View' || viewMode === 'Year View') && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <h3>{viewMode} Overview</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '540px', margin: '20px auto 0' }}>
                    {filteredEvents.map(ev => (
                      <div key={ev.id} className="uu-event-card-pastel" style={{ borderLeftColor: ev.color, backgroundColor: ev.bgLight, color: 'var(--text-primary)', padding: '12px' }} onClick={() => setSelectedEvent(ev)}>
                        <strong>{ev.title}</strong> — {ev.time} ({ev.category})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Statistics & Tasks Sidebar inside Calendar */}
            <aside className="uu-cal-right-sidebar">
              {/* Productivity Statistics */}
              <div className="uu-stat-box">
                <span className="uu-stat-heading">PRODUCTIVITY SCORE</span>
                <div className="uu-stat-score-row">
                  <span className="uu-score-num">94%</span>
                  <Sparkles size={16} color="#10B981" />
                </div>
                <div className="uu-stat-progress-track">
                  <div className="uu-stat-progress-bar" style={{ width: '94%' }} />
                </div>
              </div>

              <div className="uu-stats-grid">
                <div className="uu-mini-stat">
                  <span className="mini-stat-val" style={{ color: '#10B981' }}>{completedCount}</span>
                  <span className="mini-stat-lbl">Completed</span>
                </div>
                <div className="uu-mini-stat">
                  <span className="mini-stat-val" style={{ color: '#F43F5E' }}>{pendingCount}</span>
                  <span className="mini-stat-lbl">Pending</span>
                </div>
              </div>

              {/* Tasks Synced Module List */}
              <div className="uu-synced-tasks-box">
                <span className="uu-stat-heading">TODAY'S TASKS</span>
                <div className="synced-tasks-list">
                  {events.filter(e => e.eventType === 'Task' || e.category === 'Coding').map(t => (
                    <div key={t.id} className="synced-task-row" onClick={() => {
                      setEvents(prev => prev.map(item => item.id === t.id ? { ...item, status: item.status === 'Completed' ? 'Upcoming' : 'Completed' } : item));
                    }}>
                      <div className={`rail-task-checkbox ${t.status === 'Completed' ? 'checked' : ''}`}>
                        {t.status === 'Completed' && <Check size={10} strokeWidth={3} />}
                      </div>
                      <span className={`synced-task-title ${t.status === 'Completed' ? 'done' : ''}`}>{t.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
                Press <kbd style={{ padding: '1px 4px', background: 'rgba(var(--ink), 0.1)', borderRadius: 3 }}>N</kbd> for New Event
              </div>
            </aside>
          </div>
        </div>

        {/* Selected Event Details & Edit Modal */}
        {selectedEvent && (
          <div className="gcal-popover-overlay" onClick={() => setSelectedEvent(null)}>
            <div className="gcal-create-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit Event</h3>
                <button className="popover-close-btn" onClick={() => setSelectedEvent(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className="gcal-create-form">
                <div className="form-group">
                  <label>Event Title</label>
                  <input
                    type="text"
                    required
                    value={selectedEvent.title}
                    onChange={e => handleUpdateSelectedEvent({ title: e.target.value })}
                    className="gcal-form-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={selectedEvent.date}
                      onChange={e => handleUpdateSelectedEvent({ date: e.target.value })}
                      className="gcal-form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Time</label>
                    <input
                      type="text"
                      value={selectedEvent.time}
                      onChange={e => handleUpdateSelectedEvent({ time: e.target.value })}
                      className="gcal-form-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={selectedEvent.eventType}
                      onChange={e => handleUpdateSelectedEvent({ eventType: e.target.value as any })}
                      className="gcal-form-input"
                    >
                      <option value="Task">Task</option>
                      <option value="Meeting">Meeting</option>
                      <option value="Normal Event">Normal Event</option>
                      <option value="Reminder">Reminder</option>
                      <option value="Automation">Automation</option>
                      <option value="Deadline">Deadline</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={selectedEvent.category}
                      onChange={e => handleUpdateSelectedEvent({ category: e.target.value as any })}
                      className="gcal-form-input"
                    >
                      <option value="Coding">Coding</option>
                      <option value="Study">Study</option>
                      <option value="Meetings">Meetings</option>
                      <option value="Health">Health</option>
                      <option value="Personal">Personal</option>
                      <option value="Reminder">Reminder</option>
                      <option value="Automation">Automation</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={selectedEvent.priority}
                      onChange={e => handleUpdateSelectedEvent({ priority: e.target.value as any })}
                      className="gcal-form-input"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={selectedEvent.status}
                      onChange={e => handleUpdateSelectedEvent({ status: e.target.value as any })}
                      className="gcal-form-input"
                    >
                      <option value="Upcoming">Upcoming</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Location</label>
                  <input
                    type="text"
                    value={selectedEvent.location || ''}
                    onChange={e => handleUpdateSelectedEvent({ location: e.target.value })}
                    className="gcal-form-input"
                    placeholder="Zoom / Conference Room"
                  />
                </div>

                <div className="form-group">
                  <label>Description & Notes</label>
                  <textarea
                    rows={2}
                    value={selectedEvent.description || ''}
                    onChange={e => handleUpdateSelectedEvent({ description: e.target.value })}
                    className="gcal-form-input"
                    placeholder="Details..."
                  />
                </div>

                <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    className="cal-view-btn-white btn-danger-glass"
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="cal-view-btn-white"
                      onClick={() => handleDuplicateEvent(selectedEvent)}
                    >
                      <Copy size={14} /> Duplicate
                    </button>
                    <button
                      type="button"
                      className="cal-view-btn-white btn-primary-glass"
                      onClick={() => setSelectedEvent(null)}
                    >
                      <Check size={14} /> Save & Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Event Creation Modal */}
        {isAddModalOpen && (
          <div className="gcal-popover-overlay" onClick={() => setIsAddModalOpen(false)}>
            <div className="gcal-create-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add New Event</h3>
                <button className="popover-close-btn" onClick={() => setIsAddModalOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateEvent} className="gcal-create-form">
                <div className="form-group">
                  <label>Event Title</label>
                  <input
                    type="text"
                    required
                    placeholder="Title..."
                    value={newEventTitle}
                    onChange={e => setNewEventTitle(e.target.value)}
                    className="gcal-form-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={newEventDate}
                      onChange={e => setNewEventDate(e.target.value)}
                      className="gcal-form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Time</label>
                    <input
                      type="text"
                      placeholder="09:00 AM"
                      value={newEventTime}
                      onChange={e => setNewEventTime(e.target.value)}
                      className="gcal-form-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={newEventType}
                      onChange={e => setNewEventType(e.target.value as any)}
                      className="gcal-form-input"
                    >
                      <option value="Task">Task</option>
                      <option value="Meeting">Meeting</option>
                      <option value="Normal Event">Normal Event</option>
                      <option value="Reminder">Reminder</option>
                      <option value="Automation">Automation</option>
                      <option value="Deadline">Deadline</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={newEventCategory}
                      onChange={e => setNewEventCategory(e.target.value as any)}
                      className="gcal-form-input"
                    >
                      <option value="Coding">Coding</option>
                      <option value="Study">Study</option>
                      <option value="Meetings">Meetings</option>
                      <option value="Health">Health</option>
                      <option value="Personal">Personal</option>
                      <option value="Reminder">Reminder</option>
                      <option value="Automation">Automation</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={newEventPriority}
                      onChange={e => setNewEventPriority(e.target.value as any)}
                      className="gcal-form-input"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Location</label>
                    <input
                      type="text"
                      placeholder="Zoom / Conference Room"
                      value={newEventLocation}
                      onChange={e => setNewEventLocation(e.target.value)}
                      className="gcal-form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    placeholder="Details..."
                    value={newEventDescription}
                    onChange={e => setNewEventDescription(e.target.value)}
                    className="gcal-form-input"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="cal-view-btn-white" onClick={() => setIsAddModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="cal-view-btn-white btn-primary-glass">
                    <Check size={14} />
                    <span>Save Event</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
