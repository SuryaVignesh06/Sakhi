import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Calendar as CalIcon, Check, CheckCircle2,
  Clock, Inbox, Pencil, Plus, Target, X,
} from 'lucide-react';
import type { Subtask, TaskItem } from './TasksView';
import './PlannerView.css';

/**
 * Tasks and calendar on one page.
 *
 * Three columns, each answering a different question: the rail is "what is on
 * my plate", the grid is "when does it happen", the panel is "what is this
 * one". All three read off a single task list, so ticking a box in the rail
 * moves the block on the grid and updates the figure at the bottom left.
 */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const START_HOUR = 8;
const END_HOUR = 18;
const HOUR_PX = 74;

const PROJECT_DOT: Record<string, string> = {
  Sakhi: '#EC6A9C', College: '#5B8DEF', Portfolio: '#F0A030',
  Hackathon: '#9B7BEA', Internship: '#38BDA8', Research: '#3FBF71',
};

const startOfWeek = (d: Date) => {
  const out = new Date(d);
  // getDay() is Sunday-first; this grid is Monday-first.
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  out.setHours(0, 0, 0, 0);
  return out;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes a task is expected to take; an hour when there is nothing to read. */
function minutesOf(t: TaskItem): number {
  const h = /(\d+)\s*h/.exec(t.estimatedTime);
  const m = /(\d+)\s*m/.exec(t.estimatedTime);
  if (!h && !m) return 60;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

function tintOf(t: TaskItem): 'pink' | 'blue' | 'violet' {
  if (t.priority === 'Critical' || t.priority === 'High') return 'pink';
  if (t.category === 'Meetings' || t.project === 'Sakhi') return 'blue';
  return 'violet';
}

export default function PlannerView({
  tasks, onToggle, onAdd, onSelect, onEdit, selectedId, userName = 'there',
}: {
  tasks: TaskItem[];
  onToggle: (id: string) => void;
  /** `dueISO` is set when the task was created by clicking a slot. */
  onAdd: (title: string, dueISO?: string) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string, patch: Partial<TaskItem>) => void;
  selectedId?: string | null;
  userName?: string;
}) {
  const [scale, setScale] = useState<'week' | 'month' | 'year'>('week');
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [bucket, setBucket] = useState<'Today' | 'Upcoming' | 'Inbox' | 'Completed'>('Today');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  /* An empty slot the user clicked: the composer opens already knowing the
     date and hour, so scheduling is one gesture rather than "create it, find
     it, then set a time". */
  const [slot, setSlot] = useState<{ iso: string; label: string } | null>(null);
  const [slotTitle, setSlotTitle] = useState('');

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      return d;
    }),
    [anchor]
  );

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  );

  const now = new Date();

  const buckets = useMemo(() => {
    const today: TaskItem[] = [], upcoming: TaskItem[] = [];
    const inbox: TaskItem[] = [], completed: TaskItem[] = [];
    const ref = new Date();
    for (const t of tasks) {
      if (t.status === 'Completed') { completed.push(t); continue; }
      if (t.status === 'Archived' || t.status === 'Cancelled') continue;
      const d = new Date(t.dueDate);
      if (Number.isNaN(+d)) inbox.push(t);
      else if (sameDay(d, ref)) today.push(t);
      else if (d > ref) upcoming.push(t);
      else inbox.push(t);
    }
    return { Today: today, Upcoming: upcoming, Inbox: inbox, Completed: completed };
  }, [tasks]);

  const projects = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks) seen.add(t.project);
    return [...seen];
  }, [tasks]);

  const doneCount = buckets.Completed.length;
  const totalCount = tasks.filter((t) => t.status !== 'Archived' && t.status !== 'Cancelled').length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  /** Timed tasks placed on the grid. Anything outside the band rides the
      all-day strip rather than being clamped into a slot it does not own. */
  const { placed, allDay } = useMemo(() => {
    const byDay: Record<number, { task: TaskItem; top: number; height: number }[]> = {};
    const chips: { task: TaskItem; col: number }[] = [];

    for (const t of tasks) {
      const due = new Date(t.dueDate);
      if (Number.isNaN(+due)) continue;
      const col = days.findIndex((d) => sameDay(d, due));
      if (col < 0) continue;

      const h = due.getHours() + due.getMinutes() / 60;
      if (h < START_HOUR || h >= END_HOUR) { chips.push({ task: t, col }); continue; }

      (byDay[col] ??= []).push({
        task: t,
        top: (h - START_HOUR) * HOUR_PX,
        height: Math.max(34, (minutesOf(t) / 60) * HOUR_PX - 4),
      });
    }
    return { placed: byDay, allDay: chips };
  }, [tasks, days]);

  const monthCells = useMemo(() => {
    const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor]);

  const yearCells = useMemo(() => {
    const y = anchor.getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const items = tasks.filter((t) => {
        const d = new Date(t.dueDate);
        return !Number.isNaN(+d) && d.getFullYear() === y && d.getMonth() === m;
      });
      return {
        month: m,
        label: new Date(y, m, 1).toLocaleDateString(undefined, { month: 'short' }),
        total: items.length,
        done: items.filter((t) => t.status === 'Completed').length,
      };
    });
  }, [tasks, anchor]);

  const forDay = (d: Date) =>
    tasks.filter((t) => {
      const due = new Date(t.dueDate);
      return !Number.isNaN(+due) && sameDay(due, d);
    });

  const shift = (dir: number) => {
    const next = new Date(anchor);
    if (scale === 'week') next.setDate(anchor.getDate() + dir * 7);
    else if (scale === 'month') next.setMonth(anchor.getMonth() + dir, 1);
    else next.setFullYear(anchor.getFullYear() + dir, 0, 1);
    setAnchor(scale === 'week' ? next : startOfWeek(next));
  };

  const detail = tasks.find((t) => t.id === selectedId) ?? null;

  const openSlot = (day: Date, hour: number) => {
    const at = new Date(day);
    at.setHours(hour, 0, 0, 0);
    setSlot({
      iso: at.toISOString(),
      label: at.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      }),
    });
    setSlotTitle('');
  };

  const commitSlot = () => {
    if (!slotTitle.trim() || !slot) return;
    onAdd(slotTitle.trim(), slot.iso);
    setSlot(null);
    setSlotTitle('');
  };

  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowTop = nowHour >= START_HOUR && nowHour < END_HOUR
    ? (nowHour - START_HOUR) * HOUR_PX
    : null;
  const todayCol = days.findIndex((d) => sameDay(d, now));

  const toggleSub = (t: TaskItem, sub: Subtask) =>
    onEdit(t.id, {
      subtasks: t.subtasks.map((s) => (s.id === sub.id ? { ...s, completed: !s.completed } : s)),
    });

  const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';

  return (
    <div className="pl-page">
      <header className="pl-greet">
        <h1>Good {greeting}, {userName}</h1>
        <p>Let&rsquo;s make today productive.</p>
      </header>

      <div className="pl-cols">
        {/* ── Rail ──────────────────────────────────────────────────── */}
        <aside className="pl-rail">
          <div className="pl-card">
            <header className="pl-card-head">
              <h2>My Tasks</h2>
              <button
                className="pl-plus"
                onClick={() => { if (draft.trim()) { onAdd(draft.trim()); setDraft(''); } }}
                title="Add task"
              >
                <Plus size={15} />
              </button>
            </header>

            <input
              className="pl-quick"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) { onAdd(draft.trim()); setDraft(''); }
              }}
              placeholder="Add a task…"
            />

            {(['Today', 'Upcoming', 'Inbox', 'Completed'] as const).map((b) => {
              const Icon = b === 'Today' ? Target
                : b === 'Upcoming' ? Clock
                : b === 'Inbox' ? Inbox : CheckCircle2;
              return (
                <div key={b} className="pl-bucketwrap">
                  <button
                    className={`pl-bucket ${bucket === b ? 'is-on' : ''}`}
                    onClick={() => setBucket(b)}
                  >
                    <Icon size={15} />
                    <span>{b}</span>
                    <em>{buckets[b].length}</em>
                  </button>

                  {bucket === b && (
                    <ul className="pl-items">
                      {buckets[b].length === 0 && <li className="pl-empty">Nothing here.</li>}
                      {buckets[b].map((t) => (
                        <li key={t.id}>
                          <button
                            className={`pl-box ${t.status === 'Completed' ? 'is-done' : ''}`}
                            onClick={() => onToggle(t.id)}
                            aria-label={`Toggle ${t.title}`}
                          >
                            {t.status === 'Completed' && <Check size={11} strokeWidth={3} />}
                          </button>
                          <button
                            className={`pl-itemtext ${selectedId === t.id ? 'is-on' : ''}`}
                            onClick={() => { onSelect(t.id); setEditing(false); }}
                          >
                            <span>{t.title}</span>
                            <em className={`pl-pri pl-pri--${t.priority.toLowerCase()}`}>{t.priority}</em>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pl-card">
            <header className="pl-card-head"><h2>Projects</h2></header>
            <ul className="pl-projects">
              {projects.length === 0 && <li className="pl-empty">No projects yet.</li>}
              {projects.map((p) => (
                <li key={p}>
                  <span className="pl-pdot" style={{ background: PROJECT_DOT[p] ?? 'var(--accent)' }} />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="pl-card">
            <header className="pl-card-head">
              <h2>Progress Overview</h2>
              <strong className="pl-pct">{pct}%</strong>
            </header>
            <div className="pl-track"><span style={{ width: `${pct}%` }} /></div>
            <p className="pl-progline"><b>{doneCount}</b> of <b>{totalCount}</b> tasks completed</p>
            <p className="pl-progsub">
              {totalCount === 0 ? 'Add a task to get started.' : 'Keep going — you’re doing great.'}
            </p>
          </div>
        </aside>

        {/* ── Calendar ──────────────────────────────────────────────── */}
        <section className="pl-card pl-cal">
          <header className="pl-cal-head">
            <h2>
              {anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              <span className="pl-sep">/</span>
              <span className="pl-wk">
                W{Math.ceil(((+anchor - +new Date(anchor.getFullYear(), 0, 1)) / 86_400_000 + 1) / 7)}
              </span>
            </h2>
            <div className="pl-arrows">
              <button onClick={() => shift(-1)} aria-label="Previous"><ArrowLeft size={17} /></button>
              <button onClick={() => shift(1)} aria-label="Next"><ArrowRight size={17} /></button>
            </div>
            <div className="pl-scale">
              {(['week', 'month', 'year'] as const).map((v) => (
                <button key={v} className={scale === v ? 'is-on' : ''} onClick={() => setScale(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button className="pl-today" onClick={() => setAnchor(startOfWeek(new Date()))}>Today</button>
          </header>

          {scale === 'week' && (
            <>
              <div className="pl-daysrow">
                <span />
                {days.map((d, i) => (
                  <div key={i} className={`pl-dayhead ${sameDay(d, now) ? 'is-today' : ''}`}>
                    <strong>{pad(d.getDate())}</strong>
                    <span>{DAY_LABELS[i]}</span>
                  </div>
                ))}
              </div>

              <div className="pl-allday">
                <span className="pl-alllabel">all-day</span>
                {days.map((_, col) => (
                  <div key={col} className="pl-allcell">
                    {allDay.filter((c) => c.col === col).map((c) => (
                      <button
                        key={c.task.id}
                        className={`pl-allchip pl-t--${tintOf(c.task)}`}
                        onClick={() => { onSelect(c.task.id); setEditing(false); }}
                      >
                        {c.task.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="pl-scroll">
                <div className="pl-grid" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
                  <div className="pl-gutter">
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_PX }}>
                        <span>{h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}</span>
                      </div>
                    ))}
                  </div>

                  {days.map((day, col) => (
                    <div key={col} className="pl-daycol">
                      {/* Every empty slot is a target — clicking one opens the
                          composer already dated and timed. */}
                      {hours.map((h) => (
                        <button
                          key={h}
                          className="pl-slot"
                          style={{ height: HOUR_PX }}
                          onClick={() => openSlot(day, h)}
                          aria-label={`Add a task on ${DAY_LABELS[col]} at ${h}:00`}
                        />
                      ))}

                      {(placed[col] ?? []).map(({ task, top, height }) => (
                        <button
                          key={task.id}
                          className={`pl-ev pl-t--${tintOf(task)} ${selectedId === task.id ? 'is-on' : ''}`}
                          style={{ top, height }}
                          onClick={() => { onSelect(task.id); setEditing(false); }}
                        >
                          <span className="pl-ev-title">{task.title}</span>
                          <span className="pl-ev-time">
                            {new Date(task.dueDate).toLocaleTimeString(undefined, {
                              hour: 'numeric', minute: '2-digit',
                            })}
                          </span>
                        </button>
                      ))}

                      {col === todayCol && nowTop !== null && (
                        <span className="pl-now" style={{ top: nowTop }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {scale === 'month' && (
            <div className="pl-scroll">
              <div className="pl-mhead">{DAY_LABELS.map((d) => <span key={d}>{d}</span>)}</div>
              <div className="pl-month">
                {monthCells.map((d, i) => {
                  const items = forDay(d);
                  return (
                    <div
                      key={i}
                      className={`pl-cell ${d.getMonth() !== anchor.getMonth() ? 'is-out' : ''} ${sameDay(d, now) ? 'is-today' : ''}`}
                    >
                      <button className="pl-cellnum" onClick={() => openSlot(d, 9)} title="Add a task">
                        {d.getDate()}
                      </button>
                      {items.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          className={`pl-chip pl-t--${tintOf(t)}`}
                          onClick={() => { onSelect(t.id); setEditing(false); }}
                          title={t.title}
                        >
                          {t.title}
                        </button>
                      ))}
                      {items.length > 3 && <span className="pl-more">+{items.length - 3}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {scale === 'year' && (
            <div className="pl-scroll pl-year">
              {yearCells.map((m) => (
                <button
                  key={m.month}
                  className="pl-mcard"
                  onClick={() => {
                    setAnchor(startOfWeek(new Date(anchor.getFullYear(), m.month, 1)));
                    setScale('month');
                  }}
                >
                  <span className="pl-mname">{m.label}</span>
                  <span className="pl-mcount">{m.total}</span>
                  <span className="pl-mbar">
                    <span style={{ width: m.total ? `${(m.done / m.total) * 100}%` : '0%' }} />
                  </span>
                  <span className="pl-mdone">{m.done} done</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Detail ──────────────────────────────────────────────────
            Nothing selected means no column: an empty placeholder card held a
            third of the page open to say "nothing here", and the calendar —
            the thing the page is actually for — was squeezed to pay for it.
            The column now appears only when there is a task to show. */}
        {detail && (
        <aside className="pl-detail">
          {(
            <>
              <div className="pl-card">
                <header className="pl-detail-head">
                  <h2>{detail.title}</h2>
                  <button className="pl-iconbtn" onClick={() => setEditing((e) => !e)} title="Edit">
                    {editing ? <Check size={15} /> : <Pencil size={15} />}
                  </button>
                  <button className="pl-iconbtn" onClick={() => onSelect('')} title="Close">
                    <X size={15} />
                  </button>
                </header>

                <div className="pl-chips">
                  <span className={`pl-flag pl-pri--${detail.priority.toLowerCase()}`}>
                    <i /> {detail.priority}
                  </span>
                  <span className="pl-flag pl-flag--status"><i /> {detail.status}</span>
                </div>

                {!editing ? (
                  <dl className="pl-facts">
                    <div>
                      <dt>Project</dt>
                      <dd>
                        <span className="pl-pdot" style={{ background: PROJECT_DOT[detail.project] ?? 'var(--accent)' }} />
                        {detail.project}
                      </dd>
                    </div>
                    <div>
                      <dt>Due date</dt>
                      <dd>{new Date(detail.dueDate).toLocaleString(undefined, {
                        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                      })}</dd>
                    </div>
                    <div><dt>Estimated time</dt><dd>{detail.estimatedTime || '—'}</dd></div>
                    <div><dt>Type</dt><dd>{detail.category}</dd></div>
                  </dl>
                ) : (
                  <div className="pl-form">
                    <label>
                      <span>Title</span>
                      <input value={detail.title} onChange={(e) => onEdit(detail.id, { title: e.target.value })} />
                    </label>
                    <div className="pl-form2">
                      <label>
                        <span>Date</span>
                        <input
                          type="date"
                          value={toDateInput(detail.dueDate)}
                          onChange={(e) => onEdit(detail.id, {
                            dueDate: mergeDateTime(detail.dueDate, e.target.value, null),
                          })}
                        />
                      </label>
                      <label>
                        <span>Time</span>
                        <input
                          type="time"
                          value={toTimeInput(detail.dueDate)}
                          onChange={(e) => onEdit(detail.id, {
                            dueDate: mergeDateTime(detail.dueDate, null, e.target.value),
                          })}
                        />
                      </label>
                    </div>
                    <div className="pl-form2">
                      <label>
                        <span>Status</span>
                        <select
                          value={detail.status}
                          onChange={(e) => onEdit(detail.id, { status: e.target.value as TaskItem['status'] })}
                        >
                          {['Not Started', 'In Progress', 'Waiting', 'Blocked', 'Completed'].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Estimate</span>
                        <input
                          value={detail.estimatedTime}
                          onChange={(e) => onEdit(detail.id, { estimatedTime: e.target.value })}
                          placeholder="1h 20m"
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="pl-actions">
                  <button className="pl-focus"><Target size={14} /> Start Focus</button>
                  <button className="pl-complete" onClick={() => onToggle(detail.id)}>
                    <Check size={14} /> {detail.status === 'Completed' ? 'Completed' : 'Mark Complete'}
                  </button>
                </div>
              </div>

              <div className="pl-card">
                <header className="pl-card-head">
                  <h2>Subtasks</h2>
                  <strong className="pl-pct">
                    {detail.subtasks.filter((s) => s.completed).length} / {detail.subtasks.length}
                  </strong>
                </header>
                <ul className="pl-subs">
                  {detail.subtasks.length === 0 && <li className="pl-empty">No subtasks.</li>}
                  {detail.subtasks.map((s) => (
                    <li key={s.id}>
                      <button
                        className={`pl-box ${s.completed ? 'is-done' : ''}`}
                        onClick={() => toggleSub(detail, s)}
                        aria-label={`Toggle ${s.title}`}
                      >
                        {s.completed && <Check size={11} strokeWidth={3} />}
                      </button>
                      <span className={s.completed ? 'is-struck' : ''}>{s.title}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className="pl-addsub"
                  onClick={() => {
                    const title = window.prompt('Subtask');
                    if (title?.trim()) {
                      onEdit(detail.id, {
                        subtasks: [
                          ...detail.subtasks,
                          { id: `s${Date.now()}`, title: title.trim(), completed: false },
                        ],
                      });
                    }
                  }}
                >
                  <Plus size={13} /> Add subtask
                </button>
              </div>

              <div className="pl-card">
                <header className="pl-card-head"><h2>Notes</h2></header>
                <textarea
                  className="pl-notes"
                  value={detail.notes}
                  onChange={(e) => onEdit(detail.id, { notes: e.target.value })}
                  placeholder="Anything worth remembering about this task…"
                />
              </div>
            </>
          )}
        </aside>
        )}
      </div>

      {slot && (
        <div className="pl-slotmodal" onClick={() => setSlot(null)}>
          <div className="pl-slotbox" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>New task</strong>
              <button onClick={() => setSlot(null)} aria-label="Close"><X size={15} /></button>
            </header>
            <p className="pl-slotwhen"><Clock size={13} /> {slot.label}</p>
            <input
              autoFocus
              value={slotTitle}
              onChange={(e) => setSlotTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSlot();
                if (e.key === 'Escape') setSlot(null);
              }}
              placeholder="What needs doing?"
            />
            <button className="pl-slotadd" onClick={commitSlot} disabled={!slotTitle.trim()}>
              Add to calendar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Each edit merges its half into the existing timestamp rather than rebuilding
   it, so changing the date cannot silently reset the time. */

function toDateInput(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mergeDateTime(iso: string, date: string | null, time: string | null): string {
  const base = new Date(iso);
  const out = Number.isNaN(+base) ? new Date() : new Date(base);
  if (date) {
    const [y, m, day] = date.split('-').map(Number);
    // All three at once: setMonth alone overflows on the 31st.
    out.setFullYear(y, m - 1, day);
  }
  if (time) {
    const [h, min] = time.split(':').map(Number);
    out.setHours(h, min, 0, 0);
  }
  return out.toISOString();
}
