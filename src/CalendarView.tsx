import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Check, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Home, MapPin, Plus, Search, Sparkles, Trash2, Users, X,
} from 'lucide-react';

import './CalendarView.css';

/* ─── MODEL ───────────────────────────────────────────────────────── */

export type EventType =
  | 'Event' | 'Meeting' | 'Reminder' | 'Task' | 'Deadline' | 'Birthday' | 'Holiday' | 'Automation';

export type Category =
  | 'Coding' | 'Study' | 'Personal' | 'Health' | 'Fitness' | 'Finance'
  | 'Shopping' | 'Meetings' | 'Entertainment' | 'Reminder' | 'Automation' | 'Custom';

export type Priority = 'High' | 'Medium' | 'Low';
export type Status = 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled' | 'Overdue' | 'Rescheduled';
export type ViewMode = 'Day' | 'Week' | 'Month' | 'Year' | 'Agenda';
export type TabId = 'All' | 'Tasks' | 'Meetings' | 'Reminders' | 'Automations' | 'Archived';

export interface CalEvent {
  id: string;
  title: string;
  /** Day offset from the start of the displayed week, 0 = Monday. */
  day: number;
  /** Minutes from midnight. */
  start: number;
  /** Minutes. */
  duration: number;
  type: EventType;
  category: Category;
  priority: Priority;
  status: Status;
  location?: string;
  attendees?: string[];
  reminder?: string;
  description?: string;
  aiSuggestion?: string;
  archived?: boolean;
  dot?: boolean;
}

/* The spec's colour system. `tint` is the card fill, `edge` the left rule and
   text — kept as one source so a category can never disagree with itself. */
export const CATEGORY_COLORS: Record<Category, { edge: string; tint: string }> = {
  Coding:        { edge: '#A78BFA', tint: 'rgba(167, 139, 250, 0.14)' },
  Study:         { edge: '#C084FC', tint: 'rgba(192, 132, 252, 0.14)' },
  Meetings:      { edge: '#34D399', tint: 'rgba(52, 211, 153, 0.13)' },
  Health:        { edge: '#F87171', tint: 'rgba(248, 113, 113, 0.13)' },
  Personal:      { edge: '#FB923C', tint: 'rgba(251, 146, 60, 0.13)' },
  Reminder:      { edge: '#FBBF24', tint: 'rgba(251, 191, 36, 0.13)' },
  Automation:    { edge: '#38BDF8', tint: 'rgba(56, 189, 248, 0.13)' },
  Fitness:       { edge: '#A3E635', tint: 'rgba(163, 230, 53, 0.13)' },
  Finance:       { edge: '#34D399', tint: 'rgba(52, 211, 153, 0.13)' },
  Shopping:      { edge: '#FB923C', tint: 'rgba(251, 146, 60, 0.13)' },
  Entertainment: { edge: '#818CF8', tint: 'rgba(129, 140, 248, 0.13)' },
  Custom:        { edge: '#A9A3B0', tint: 'rgba(169, 163, 176, 0.13)' },
};

const TABS: TabId[] = ['All', 'Tasks', 'Meetings', 'Reminders', 'Automations', 'Archived'];
const VIEWS: ViewMode[] = ['Day', 'Week', 'Month', 'Year', 'Agenda'];

const DAY_START = 8 * 60;   // grid begins 8 AM
const DAY_END = 19 * 60;    // and ends 7 PM
const HOUR_H = 82;          // px per hour — sets the whole grid's rhythm

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'];

const hhmm = (mins: number) => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
};

const durationLabel = (mins: number) =>
  mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : `${mins} min`;

/* ─── SEED DATA ───────────────────────────────────────────────────── */

/* Placement mirrors the reference exactly — same day, same start, same span,
   same colour family. Mon 6: standup + content planning. Tue 7: Sakhi 1:1 +
   Alex. Wed 8: deep work, design sync, SEO, meetup. Thur 9: lunch. Fri 10:
   standup, Olivia x Riley, product demo. Sat 11: inspection. Sun 12: party. */
const SEED: CalEvent[] = [
  // Mon 6
  { id: 'e1', title: 'Monday standup', day: 0, start: 9 * 60, duration: 30, type: 'Meeting', category: 'Custom', priority: 'Medium', status: 'Upcoming', attendees: ['Sakhi', 'Riley'], reminder: '10 minutes before' },
  { id: 'e2', title: 'Content planning', day: 0, start: 11 * 60, duration: 90, type: 'Task', category: 'Coding', priority: 'Medium', status: 'Upcoming', reminder: '15 minutes before' },
  // Tue 7
  { id: 'e3', title: 'One-on-one with Sakhi', day: 1, start: 10 * 60, duration: 60, type: 'Meeting', category: 'Health', priority: 'High', status: 'Upcoming', location: 'Room 2', attendees: ['Sakhi'] },
  { id: 'e4', title: 'Catch up w/ Alex', day: 1, start: 15 * 60 + 30, duration: 90, type: 'Meeting', category: 'Study', priority: 'Low', status: 'Upcoming', attendees: ['Alex'] },
  // Wed 8
  { id: 'e5', title: 'Deep work', day: 2, start: 9 * 60, duration: 120, type: 'Task', category: 'Coding', priority: 'High', status: 'Upcoming', reminder: '15 minutes before' },
  { id: 'e6', title: 'Design sync', day: 2, start: 10 * 60 + 30, duration: 60, type: 'Meeting', category: 'Coding', priority: 'Medium', status: 'Upcoming', attendees: ['Riley', 'Sam'] },
  { id: 'e7', title: 'SEO planning', day: 2, start: 13 * 60 + 30, duration: 60, type: 'Task', category: 'Coding', priority: 'Low', status: 'Upcoming' },
  { id: 'e8', title: 'Meetup event', day: 2, start: 15 * 60, duration: 120, type: 'Event', category: 'Reminder', priority: 'Low', status: 'Upcoming', location: 'Kings Cross' },
  // Thur 9
  { id: 'e9', title: 'Lunch with Olivia', day: 3, start: 12 * 60, duration: 60, type: 'Event', category: 'Meetings', priority: 'Low', status: 'Upcoming', location: 'Cafe Nero', attendees: ['Olivia'], dot: true },
  // Fri 10
  { id: 'e10', title: 'Friday standup', day: 4, start: 9 * 60, duration: 30, type: 'Meeting', category: 'Custom', priority: 'Medium', status: 'Upcoming', attendees: ['Team'] },
  { id: 'e11', title: 'Olivia x Riley', day: 4, start: 10 * 60, duration: 60, type: 'Meeting', category: 'Study', priority: 'Medium', status: 'Upcoming', attendees: ['Olivia', 'Riley'] },
  { id: 'e12', title: 'Product demo', day: 4, start: 13 * 60 + 30, duration: 150, type: 'Meeting', category: 'Coding', priority: 'High', status: 'Upcoming', location: 'Zoom', attendees: ['Core team'] },
  // Sat 11
  { id: 'e13', title: 'House inspection', day: 5, start: 11 * 60, duration: 45, type: 'Reminder', category: 'Personal', priority: 'Medium', status: 'Upcoming', dot: true },
  // Sun 12
  { id: 'e14', title: "Ava's engagment par…", day: 6, start: 13 * 60, duration: 90, type: 'Birthday', category: 'Study', priority: 'Low', status: 'Upcoming', dot: true },
  // Not in the reference grid — archived, so it only shows under that tab.
  { id: 'e16', title: 'Old sprint review', day: 1, start: 9 * 60, duration: 45, type: 'Meeting', category: 'Meetings', priority: 'Low', status: 'Completed', archived: true },
];

/* Which tabs a given event belongs to. */
function matchesTab(e: CalEvent, tab: TabId) {
  if (tab === 'Archived') return Boolean(e.archived);
  if (e.archived) return false;
  if (tab === 'All') return true;
  if (tab === 'Tasks') return e.type === 'Task' || e.type === 'Deadline';
  if (tab === 'Meetings') return e.type === 'Meeting';
  if (tab === 'Reminders') return e.type === 'Reminder' || e.type === 'Birthday' || e.type === 'Holiday';
  if (tab === 'Automations') return e.type === 'Automation';
  return true;
}

/* ─── COMPONENT ───────────────────────────────────────────────────── */

export default function CalendarView() {
  const [events, setEvents] = useState<CalEvent[]>(SEED);
  const [tab, setTab] = useState<TabId>('All');
  const [view, setView] = useState<ViewMode>('Week');
  const [viewOpen, setViewOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* Live "now" marker. Minute resolution is plenty and avoids a 1s timer. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowInGrid = nowMins >= DAY_START && nowMins <= DAY_END;
  /* JS weeks start Sunday; this grid starts Monday. */
  const todayCol = (now.getDay() + 6) % 7;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(e => {
      if (!matchesTab(e, tab)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q) ||
        (e.attendees ?? []).join(' ').toLowerCase().includes(q)
      );
    });
  }, [events, tab, query]);

  const timeOptions: number[] = useMemo(() => {
    const opts: number[] = [];
    for (let m = DAY_START; m <= DAY_END; m += 30) opts.push(m);
    return opts;
  }, []);

  const handleSlotClick = (dayIndex: number, startMins: number) => {
    const id = `n${Date.now()}`;
    let eventType: EventType = 'Task';
    if (tab === 'Meetings') eventType = 'Meeting';
    else if (tab === 'Reminders') eventType = 'Reminder';
    else if (tab === 'Automations') eventType = 'Automation';

    const fresh: CalEvent = {
      id,
      title: 'New Event',
      day: dayIndex,
      start: startMins,
      duration: 60,
      type: eventType,
      category: 'Coding',
      priority: 'Medium',
      status: 'Upcoming',
      location: '',
      description: '',
    };
    setEvents(p => [...p, fresh]);
    setSelected(fresh);

    if (gridRef.current) {
      const targetTop = Math.max(0, ((startMins - DAY_START) / 60) * HOUR_H - 40);
      gridRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  };

  const handleUpdateSelected = (fields: Partial<CalEvent>) => {
    if (!selected) return;
    const updated = { ...selected, ...fields };
    setSelected(updated);
    setEvents(p => p.map(e => (e.id === updated.id ? updated : e)));
  };

  const addEvent = () => {
    handleSlotClick(todayCol, 10 * 60);
  };

  const removeEvent = (id: string) => {
    setEvents(p => p.filter(e => e.id !== id));
    setSelected(null);
  };

  const duplicate = (ev: CalEvent) => {
    const copy = { ...ev, id: `d${Date.now()}`, title: `${ev.title} (copy)`, start: ev.start + ev.duration };
    setEvents(p => [...p, copy]);
    setSelected(copy);
  };

  const setStatus = (id: string, status: Status) => {
    setEvents(p => p.map(e => (e.id === id ? { ...e, status } : e)));
    setSelected(s => (s && s.id === id ? { ...s, status } : s));
  };

  /* Keyboard shortcuts from the spec. Ignored while typing so they cannot
     hijack the search field or a future inline editor. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;

      if (e.key === 'Escape') { setSelected(null); setViewOpen(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (typing) return;

      if (e.key.toLowerCase() === 'n') { e.preventDefault(); addEvent(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selected) { e.preventDefault(); duplicate(selected); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeEvent(selected.id); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') { e.preventDefault(); setWeekOffset(w => w - 1); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { e.preventDefault(); setWeekOffset(w => w + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  /* Open on the working day rather than at midnight. */
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = Math.max(0, ((9 * 60 - DAY_START) / 60) * HOUR_H - 20);
  }, []);

  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);

  const weekStart = 6 + weekOffset * 7;
  const rangeLabel = `Jan ${weekStart}, 2025 – Jan ${weekStart + 6}, 2025`;

  const todaysTasks = visible.filter(e => e.day === todayCol && (e.type === 'Task' || e.type === 'Deadline'));
  const upcoming = [...visible].sort((a, b) => a.day * 1440 + a.start - (b.day * 1440 + b.start)).slice(0, 4);
  const completed = events.filter(e => e.status === 'Completed').length;
  const scheduled = visible.reduce((s, e) => s + e.duration, 0) / 60;

  return (
    <div className="cal-root">
      {/* Breadcrumb */}
      <nav className="cal-crumbs" aria-label="Breadcrumb">
        <Home size={15} strokeWidth={1.8} />
        <ChevronRight size={13} className="cal-crumb-sep" />
        <span className="cal-crumb">Sakhi</span>
        <ChevronRight size={13} className="cal-crumb-sep" />
        <span className="cal-crumb cal-crumb--active">Calendar</span>
      </nav>

      {/* Title + search */}
      <header className="cal-head">
        <h1 className="cal-title">Calendar</h1>
        <div className="cal-search">
          <Search size={15} strokeWidth={1.8} />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search title, person, place…"
            aria-label="Search events"
          />
          <kbd className="cal-kbd">⌘F</kbd>
        </div>
      </header>

      {/* Tabs */}
      <div className="cal-tabs" role="tablist">
        {TABS.map(t => {
          const count = events.filter(e => matchesTab(e, t)).length;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`cal-tab ${tab === t ? 'cal-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
              <span className="cal-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="cal-body">
        {/* ── Calendar card ── */}
        <section className="cal-card">
          <div className="cal-toolbar">
            <div className="cal-datebadge">
              <span className="cal-datebadge-m">JAN</span>
              <span className="cal-datebadge-d">{weekStart + 4}</span>
            </div>
            <div className="cal-period">
              <div className="cal-period-title">January 2025</div>
              <div className="cal-period-range">{rangeLabel}</div>
            </div>

            <div className="cal-toolbar-right">
              <div className="cal-nav">
                <button onClick={() => setWeekOffset(w => w - 1)} title="Previous week (Ctrl+←)" aria-label="Previous week">
                  <ChevronLeft size={16} strokeWidth={1.9} />
                </button>
                <button className="cal-today" onClick={() => setWeekOffset(0)}>Today</button>
                <button onClick={() => setWeekOffset(w => w + 1)} title="Next week (Ctrl+→)" aria-label="Next week">
                  <ChevronRight size={16} strokeWidth={1.9} />
                </button>
              </div>

              <div className="cal-viewsel">
                <button className="cal-viewbtn" onClick={() => setViewOpen(o => !o)} aria-haspopup="menu" aria-expanded={viewOpen}>
                  {view} view
                  <ChevronDown size={14} strokeWidth={1.9} />
                </button>
                {viewOpen && (
                  <div className="cal-viewmenu" role="menu">
                    {VIEWS.map(v => (
                      <button key={v} role="menuitem" className={v === view ? 'is-on' : ''} onClick={() => { setView(v); setViewOpen(false); }}>
                        {v} view {v === view && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className="cal-add" onClick={addEvent} title="New event (N)">
                <Plus size={15} strokeWidth={2.2} />
                Add event
              </button>
            </div>
          </div>

          {view === 'Week' || view === 'Day' ? (
            <>
              <div className="cal-daybar">
                <div className="cal-gutter-head" />
                {DAY_NAMES.map((d, i) => (
                  (view === 'Day' && i !== todayCol) ? null : (
                    <div key={d} className="cal-dayhead">
                      <span className="cal-dayname">{d}</span>
                      <span className={`cal-daynum ${i === todayCol ? 'cal-daynum--today' : ''}`}>{weekStart + i}</span>
                    </div>
                  )
                ))}
              </div>

              <div className="cal-grid" ref={gridRef}>
                <div className="cal-grid-inner" style={{ height: ((DAY_END - DAY_START) / 60) * HOUR_H }}>
                  <div className="cal-gutter">
                    {hours.map(m => (
                      <div key={m} className="cal-gutter-cell" style={{ height: HOUR_H }}>
                        <span>{hhmm(m).replace(':00', '')}</span>
                      </div>
                    ))}
                  </div>

                  {DAY_NAMES.map((d, i) => {
                    if (view === 'Day' && i !== todayCol) return null;
                    return (
                      <div key={d} className="cal-col">
                        {hours.map(m => (
                          <div
                            key={m}
                            className="cal-slot"
                            style={{ height: HOUR_H }}
                            onClick={() => handleSlotClick(i, m)}
                            title={`Click to add event at ${hhmm(m)} on ${d}`}
                          />
                        ))}

                        {visible.filter(e => e.day === i).map(e => {
                          const c = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.Custom;
                          const top = ((e.start - DAY_START) / 60) * HOUR_H;
                          const h = (e.duration / 60) * HOUR_H;
                          const done = e.status === 'Completed';
                          return (
                            <button
                              key={e.id}
                              className={`cal-ev ${done ? 'cal-ev--done' : ''} ${selected?.id === e.id ? 'cal-ev--sel' : ''}`}
                              style={{ top, height: Math.max(h - 4, 26), background: c.tint, borderLeftColor: c.edge }}
                              onClick={() => setSelected(e)}
                            >
                              {/* The hue lives in the left rule and the dot. Colouring the
                                  TITLE too was what made a week of events read as a bag of
                                  loose colours rather than one calendar. */}
                              <span className="cal-ev-title">
                                {e.title}
                                {e.dot && <span className="cal-ev-dot" style={{ background: c.edge }} />}
                              </span>
                              {/* Short events show the title only, as in the
                                  reference — a 30-minute card has no room. */}
                              {h > 50 && <span className="cal-ev-time">{hhmm(e.start)}</span>}
                            </button>
                          );
                        })}

                        {nowInGrid && i === todayCol && (
                          <div className="cal-nowline" style={{ top: ((nowMins - DAY_START) / 60) * HOUR_H }}>
                            <span className="cal-nowdot" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : view === 'Agenda' ? (
            <div className="cal-agenda">
              {DAY_NAMES.map((d, i) => {
                const list = visible.filter(e => e.day === i).sort((a, b) => a.start - b.start);
                if (!list.length) return null;
                return (
                  <div key={d} className="cal-agenda-day">
                    <div className="cal-agenda-date">
                      <span className="cal-agenda-dname">{d}</span>
                      <span className={`cal-agenda-dnum ${i === todayCol ? 'cal-daynum--today' : ''}`}>{weekStart + i}</span>
                    </div>
                    <div className="cal-agenda-list">
                      {list.map(e => {
                        const c = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.Custom;
                        return (
                          <button key={e.id} className="cal-agenda-row" onClick={() => setSelected(e)}>
                            <span className="cal-agenda-bar" style={{ background: c.edge }} />
                            <span className="cal-agenda-time">{hhmm(e.start)}</span>
                            <span className="cal-agenda-title">{e.title}</span>
                            <span className="cal-chip" style={{ color: c.edge, borderColor: c.edge, background: c.tint }}>{e.category}</span>
                            <span className={`cal-status cal-status--${e.status.replace(' ', '').toLowerCase()}`}>{e.status}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="cal-month">
              {DAY_NAMES.map(d => <div key={d} className="cal-month-head">{d}</div>)}
              {Array.from({ length: 35 }).map((_, idx) => {
                const dayNum = idx - 2;
                const col = idx % 7;
                const inMonth = dayNum >= 1 && dayNum <= 31;
                const list = inMonth && idx < 14 ? visible.filter(e => e.day === col) : [];
                return (
                  <div
                    key={idx}
                    className={`cal-month-cell ${inMonth ? '' : 'cal-month-cell--out'}`}
                    onClick={(e) => {
                      if (inMonth && e.target === e.currentTarget) {
                        handleSlotClick(col, 9 * 60);
                      }
                    }}
                  >
                    <span className="cal-month-num">{inMonth ? dayNum : ''}</span>
                    {list.slice(0, 3).map(e => {
                      const c = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.Custom;
                      return (
                        <button key={e.id} className="cal-month-ev" style={{ background: c.tint, color: c.edge }} onClick={() => setSelected(e)}>
                          {e.title}
                        </button>
                      );
                    })}
                    {list.length > 3 && <span className="cal-month-more">+{list.length - 3} more</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Right sidebar ── */}
        <aside className="cal-side">
          <div className="cal-panel">
            <div className="cal-panel-head"><Clock size={13} /> UPCOMING</div>
            {upcoming.map(e => {
              const c = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.Custom;
              return (
                <button key={e.id} className="cal-side-row" onClick={() => setSelected(e)}>
                  <span className="cal-side-bar" style={{ background: c.edge }} />
                  <span className="cal-side-main">
                    <span className="cal-side-title">{e.title}</span>
                    <span className="cal-side-sub">{DAY_NAMES[e.day]} · {hhmm(e.start)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cal-panel">
            <div className="cal-panel-head"><Check size={13} /> TODAY'S TASKS</div>
            {todaysTasks.length === 0 && <div className="cal-empty">Nothing scheduled today.</div>}
            {todaysTasks.map(e => (
              <button
                key={e.id}
                className={`cal-task ${e.status === 'Completed' ? 'cal-task--done' : ''}`}
                onClick={() => setStatus(e.id, e.status === 'Completed' ? 'Upcoming' : 'Completed')}
              >
                <span className="cal-task-box">{e.status === 'Completed' && <Check size={11} strokeWidth={3} />}</span>
                <span className="cal-task-title">{e.title}</span>
              </button>
            ))}
          </div>

          <div className="cal-panel">
            <div className="cal-panel-head">STATISTICS</div>
            <div className="cal-stats">
              <div className="cal-stat"><span className="cal-stat-v">{visible.length}</span><span className="cal-stat-l">Events</span></div>
              <div className="cal-stat"><span className="cal-stat-v">{completed}</span><span className="cal-stat-l">Completed</span></div>
              <div className="cal-stat"><span className="cal-stat-v">{scheduled.toFixed(1)}h</span><span className="cal-stat-l">Scheduled</span></div>
              <div className="cal-stat"><span className="cal-stat-v">82%</span><span className="cal-stat-l">Productivity</span></div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Event details & Inline Editor ── */}
      {selected && (
        <>
          <div className="cal-scrim" onClick={() => setSelected(null)} />
          <aside className="cal-detail" role="dialog" aria-label="Event details and edit">
            <div className="cal-detail-head">
              <span
                className="cal-detail-swatch"
                style={{ background: (CATEGORY_COLORS[selected.category] ?? CATEGORY_COLORS.Custom).edge }}
              />
              <input
                type="text"
                className="cal-edit-title-input"
                value={selected.title}
                onChange={e => handleUpdateSelected({ title: e.target.value })}
                placeholder="Event Title..."
              />
              <button onClick={() => setSelected(null)} aria-label="Close"><X size={17} /></button>
            </div>

            <div className="cal-detail-body">
              <div className="cal-edit-grid">
                <div className="cal-edit-group">
                  <label className="cal-edit-label"><Clock size={12} /> Day</label>
                  <select
                    className="cal-edit-select"
                    value={selected.day}
                    onChange={e => handleUpdateSelected({ day: Number(e.target.value) })}
                  >
                    {DAY_NAMES.map((d, idx) => (
                      <option key={d} value={idx}>{d} (Day {idx + 1})</option>
                    ))}
                  </select>
                </div>

                <div className="cal-edit-group">
                  <label className="cal-edit-label"><Clock size={12} /> Start Time</label>
                  <select
                    className="cal-edit-select"
                    value={selected.start}
                    onChange={e => handleUpdateSelected({ start: Number(e.target.value) })}
                  >
                    {timeOptions.map(m => (
                      <option key={m} value={m}>{hhmm(m)}</option>
                    ))}
                  </select>
                </div>

                <div className="cal-edit-group">
                  <label className="cal-edit-label"><Clock size={12} /> Duration</label>
                  <select
                    className="cal-edit-select"
                    value={selected.duration}
                    onChange={e => handleUpdateSelected({ duration: Number(e.target.value) })}
                  >
                    <option value={15}>15 Mins</option>
                    <option value={30}>30 Mins</option>
                    <option value={45}>45 Mins</option>
                    <option value={60}>1 Hour</option>
                    <option value={90}>1.5 Hours</option>
                    <option value={120}>2 Hours</option>
                    <option value={180}>3 Hours</option>
                  </select>
                </div>

                <div className="cal-edit-group">
                  <label className="cal-edit-label">Type</label>
                  <select
                    className="cal-edit-select"
                    value={selected.type}
                    onChange={e => handleUpdateSelected({ type: e.target.value as EventType })}
                  >
                    {(['Event', 'Meeting', 'Reminder', 'Task', 'Deadline', 'Birthday', 'Holiday', 'Automation'] as EventType[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="cal-edit-group">
                  <label className="cal-edit-label">Category</label>
                  <select
                    className="cal-edit-select"
                    value={selected.category}
                    onChange={e => handleUpdateSelected({ category: e.target.value as Category })}
                  >
                    {Object.keys(CATEGORY_COLORS).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="cal-edit-group">
                  <label className="cal-edit-label">Priority</label>
                  <select
                    className="cal-edit-select"
                    value={selected.priority}
                    onChange={e => handleUpdateSelected({ priority: e.target.value as Priority })}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div className="cal-edit-group">
                  <label className="cal-edit-label">Status</label>
                  <select
                    className="cal-edit-select"
                    value={selected.status}
                    onChange={e => handleUpdateSelected({ status: e.target.value as Status })}
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="cal-edit-group">
                <label className="cal-edit-label"><MapPin size={12} /> Location / Link</label>
                <input
                  type="text"
                  className="cal-edit-input"
                  value={selected.location || ''}
                  onChange={e => handleUpdateSelected({ location: e.target.value })}
                  placeholder="e.g. Conference Room B / Zoom"
                />
              </div>

              <div className="cal-edit-group">
                <label className="cal-edit-label">Description & Notes</label>
                <textarea
                  className="cal-edit-textarea"
                  rows={3}
                  value={selected.description || ''}
                  onChange={e => handleUpdateSelected({ description: e.target.value })}
                  placeholder="Add notes..."
                />
              </div>

              <div className="cal-detail-actions" style={{ marginTop: 10 }}>
                <button className="cal-save-btn" onClick={() => setSelected(null)}>
                  <Check size={14} /> Save & Done
                </button>
                <button onClick={() => duplicate(selected)}>Duplicate</button>
                <button className="cal-danger" onClick={() => removeEvent(selected.id)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>

              <div className="cal-detail-shortcuts">
                <span><kbd>N</kbd> new</span>
                <span><kbd>⌘D</kbd> duplicate</span>
                <span><kbd>Del</kbd> delete</span>
                <span><kbd>Esc</kbd> close</span>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
