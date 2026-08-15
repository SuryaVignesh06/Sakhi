import { useMemo } from 'react';
import type { TaskItem } from '../TasksView';
import './TaskDashboard.css';

/**
 * How the work is going: a completion figure and a breakdown by state.
 *
 * The headline is a hero number rather than a chart, because "how far along
 * am I" is one value and a chart of one value is decoration. The breakdown
 * beside it is a bar chart: the job is comparing magnitudes across a handful
 * of named states, which is what bars do best.
 *
 * The three series colours are the validated categorical slots — checked with
 * the palette validator against the dark surface (worst adjacent CVD ΔE 8.4,
 * normal-vision 19.8, all above the 3:1 contrast floor). They are assigned in
 * fixed order and never cycled, so a state keeps its colour when another one
 * drops to zero and disappears from the chart.
 */

interface Slice { key: string; label: string; n: number }

/* Fixed order. Colour follows the state, never its rank — sorting the bars by
   size would otherwise repaint them on every change. */
const STATES: { key: string; label: string; match: (t: TaskItem) => boolean }[] = [
  { key: 'done', label: 'Completed', match: (t) => t.status === 'Completed' },
  { key: 'doing', label: 'In progress', match: (t) => t.status === 'In Progress' },
  { key: 'todo', label: 'Not started', match: (t) => t.status === 'Not Started' || t.status === 'Inbox' },
];

export default function TaskDashboard({ tasks }: { tasks: TaskItem[] }) {
  const { slices, total, done, pct } = useMemo(() => {
    const live = tasks.filter((t) => t.status !== 'Archived' && t.status !== 'Cancelled');
    const s: Slice[] = STATES.map((st) => ({
      key: st.key,
      label: st.label,
      n: live.filter(st.match).length,
    }));
    const d = s.find((x) => x.key === 'done')?.n ?? 0;
    return {
      slices: s,
      total: live.length,
      done: d,
      pct: live.length ? Math.round((d / live.length) * 100) : 0,
    };
  }, [tasks]);

  /* The bar scale is set by the largest state, not by the total — otherwise
     every bar is a sliver as soon as one state dominates. */
  const max = Math.max(1, ...slices.map((s) => s.n));

  return (
    <div className="td-root">
      <div className="td-hero">
        <span className="td-figure">{pct}<span className="td-unit">%</span></span>
        <span className="td-caption">
          {total === 0 ? 'No tasks yet' : `${done} of ${total} complete`}
        </span>
        {/* A single track, so the headline has a shape as well as a number. */}
        <div className="td-track" role="img" aria-label={`${pct} percent complete`}>
          <span className="td-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="td-chart">
        {slices.map((s) => (
          <div className="td-row" key={s.key}>
            <span className="td-label">{s.label}</span>
            <div className="td-barwrap">
              <span
                className={`td-bar td-bar--${s.key}`}
                style={{ width: `${(s.n / max) * 100}%` }}
              />
            </div>
            {/* Direct-labelled, so identity is never carried by colour alone. */}
            <span className="td-value">{s.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
