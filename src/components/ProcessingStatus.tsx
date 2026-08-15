import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Square, XCircle } from 'lucide-react';
import type { SessionState, ToolCall } from '../events';

/**
 * What the assistant is doing, and what it did to get there.
 *
 * Two coupled pieces: a status pill that names the current stage, and a trace
 * panel that lists the discrete steps behind it.
 *
 * Everything here is derived from events that already arrived. There is no
 * timer that advances a fake stage and no scripted sequence — if the backend
 * reports nothing, this renders nothing. The only clock is the elapsed
 * counter, which measures real wall time.
 */

/* ─── STATE → WORD + ICON ─────────────────────────────────────────── */

export type StatusKey =
  | 'thinking' | 'analyzing' | 'searching' | 'reading'
  | 'writing' | 'coding' | 'reviewing' | 'processing'
  | 'waiting' | 'continuing';

const STATUS: Record<StatusKey, { word: string }> = {
  thinking:   { word: 'Thinking' },
  analyzing:  { word: 'Analyzing' },
  searching:  { word: 'Searching' },
  reading:    { word: 'Reading' },
  writing:    { word: 'Writing' },
  coding:     { word: 'Coding' },
  reviewing:  { word: 'Reviewing' },
  processing: { word: 'Processing' },
  waiting:    { word: 'Waiting for you' },
  continuing: { word: 'Continuing' },
};

/** Which tools mean which word. Keyed on the backend's tool names. */
const TOOL_STATUS: Record<string, StatusKey> = {
  browser: 'searching',
  research: 'searching',
  vision: 'reading',
  files: 'reading',
  memory: 'reading',
  coding: 'coding',
  terminal: 'coding',
  automation: 'processing',
  desktop: 'processing',
  clipboard: 'processing',
  planner: 'thinking',
};

/**
 * The current status, from real session state.
 *
 * Order matters: a running tool is the most specific truth available, so it
 * outranks the planner stage, which is only ever a coarse label.
 */
export function statusOf(s: SessionState): { key: StatusKey; detail?: string } {
  const running = s.toolOrder.map((k) => s.tools[k]).find((t) => t?.status === 'running');
  if (running) {
    return {
      key: TOOL_STATUS[running.tool] ?? 'processing',
      detail: [running.title || running.tool, running.message].filter(Boolean).join(' · '),
    };
  }

  if (s.permissions.length) {
    return { key: 'waiting', detail: `${s.permissions[0].permission} needs permission` };
  }

  /* A tool that just failed must not leave the pill stuck on its label —
     spec §7. Fall back to a neutral word and let the trace carry the detail. */
  const lastTool = s.toolOrder.length ? s.tools[s.toolOrder[s.toolOrder.length - 1]] : undefined;
  if (lastTool?.status === 'failed' && !s.response) return { key: 'continuing' };

  const last = s.stages[s.stages.length - 1];
  if (!last) return { key: 'processing' };

  if (last.stage === 'Generating Response') {
    if (s.response) return { key: 'writing' };
    if (s.thinking) return { key: 'thinking' };
    return { key: 'writing' };
  }

  const byStage: Partial<Record<string, StatusKey>> = {
    'Understanding Request': 'thinking',
    'Analyzing Context': 'analyzing',
    'Planning': 'thinking',
    'Selecting Model': 'processing',
    'Selecting Agent': 'processing',
    'Preparing Tools': 'processing',
    'Executing': 'processing',
    'Completed': 'reviewing',
  };
  return { key: byStage[last.stage] ?? 'processing', detail: last.description };
}

/* ─── ELAPSED ─────────────────────────────────────────────────────── */

/** Wall time since the request was sent. It measures; it does not fake. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [since]);
  const s = Math.max(0, (now - since) / 1000);
  return <span className="ps-elapsed">{s < 10 ? s.toFixed(1) : Math.round(s)}s</span>;
}

/* ─── ROTATING WORD ───────────────────────────────────────────────── */

/** Per-character timings. Deleting is quicker than typing, as when a person
    corrects themselves — an even rate reads as a machine, not a mind. */
const TYPE_MS = 55;
const DELETE_MS = 28;
/** Beat before the word starts erasing, so it can actually be read. */
const HOLD_MS = 420;

/**
 * The word, typed out and backspaced away — not swapped or faded.
 *
 * When the state changes the current word is erased character by character,
 * then the new one is typed in. The pill therefore reads as one continuous
 * line of thought rather than a label being replaced.
 */
const StatusWord = memo(function StatusWord({ word }: { word: string }) {
  const [shown, setShown] = useState('');
  /* The word being typed toward. Held separately from the prop so a change
     mid-erase does not restart the erase from the new word's length. */
  const target = useRef(word);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    target.current = word;
  }, [word]);

  useEffect(() => {
    const tick = () => {
      setShown((cur) => {
        const want = target.current;

        if (cur === want) return cur;

        // Erase back to the common prefix before typing the new word, so
        // "Thinking" -> "Typing" does not delete the whole thing needlessly.
        let shared = 0;
        while (shared < cur.length && shared < want.length && cur[shared] === want[shared]) shared++;

        if (cur.length > shared) {
          timer.current = window.setTimeout(tick, DELETE_MS);
          return cur.slice(0, -1);
        }

        timer.current = window.setTimeout(tick, TYPE_MS);
        return want.slice(0, cur.length + 1);
      });
    };

    timer.current = window.setTimeout(tick, shown ? HOLD_MS : 0);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // Re-arms whenever the target moves; `shown` is read through the setter.
  }, [word]);

  return (
    <span className="ps-word-slot">
      {/* Reserves the widest width so the pill does not breathe in and out
          on every character. */}
      <span className="ps-word-ghost" aria-hidden="true">{word}</span>
      <span className="ps-word">
        {shown}
        <span className="ps-type-caret" aria-hidden="true" />
      </span>
    </span>
  );
});

/* ─── TRACE ROW ───────────────────────────────────────────────────── */

const TraceRow = memo(function TraceRow({ t }: { t: ToolCall }) {
  return (
    <li className={`ps-trace-row ps-trace-row--${t.status}`}>
      <span className="ps-trace-icon">
        {t.status === 'running' && <Loader2 size={16} className="ps-spin" />}
        {t.status === 'completed' && <CheckCircle2 size={16} />}
        {t.status === 'failed' && <XCircle size={16} />}
      </span>
      <span className="ps-trace-body">
        <span className="ps-trace-label">{t.title || t.tool}</span>
        {t.status === 'failed' && t.error && <span className="ps-trace-reason">{t.error}</span>}
        {t.status === 'running' && t.message && <span className="ps-trace-reason">{t.message}</span>}
      </span>
      {t.status !== 'running' && t.duration != null && (
        <span className="ps-trace-time">{(t.duration / 1000).toFixed(1)}s</span>
      )}
    </li>
  );
});

/* ─── TRACE PANEL ─────────────────────────────────────────────────── */

/**
 * The steps behind the pill. Collapsed by default and never auto-opened —
 * a panel that expands itself while you are reading is a panel that moves
 * the text out from under you.
 */
export const TracePanel = memo(function TracePanel({
  steps, open,
}: {
  steps: ToolCall[];
  open: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /* Follow the newest step only while the user is already at the bottom.
     Scrolling up is a deliberate act; yanking them back down fights it. */
  const stick = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !open || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [steps.length, open]);

  return (
    <div className={`ps-trace-wrap ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="ps-trace-clip">
        <div className="ps-trace-scroll" ref={scrollRef} onScroll={onScroll}>
          <ol className="ps-trace-list">
            {steps.map((t) => <TraceRow key={`${t.tool}-${t.startedAt}`} t={t} />)}
          </ol>
        </div>
      </div>
    </div>
  );
});

/* ─── THE PILL ────────────────────────────────────────────────────── */

export const ProcessingStatus = memo(function ProcessingStatus({
  session, startedAt, onStop, logoSrc, defaultOpen = false,
}: {
  session: SessionState;
  startedAt: number;
  onStop?: () => void;
  /** The mark that spins while the turn runs. */
  logoSrc: string;
  /** Only ever true for a finished message's permanent record. */
  defaultOpen?: boolean;
}) {
  /* The reasoning text lives behind a chevron on this row rather than in its
     own panel below the card — it belongs next to the word describing the
     work, not stacked under the reply. */
  const [thinkOpen, setThinkOpen] = useState(false);
  const { key, detail } = statusOf(session);
  const { word } = STATUS[key];

  const steps = session.toolOrder.map((k) => session.tools[k]).filter(Boolean);
  const hasTrace = steps.length > 0;

  /* Hand off to the reply itself once text is flowing and nothing is still
     running in parallel — at that point the pill would only be narrating
     what the user can already read. Tools still in flight keep it up. */
  const running = steps.some((t) => t.status === 'running');
  const handedOff = Boolean(session.response) && !running && !session.permissions.length;

  const [open, setOpen] = useState(defaultOpen);
  const [slow, setSlow] = useState(false);
  const [bump, setBump] = useState(false);

  /* Reassurance only — nothing about the turn changes at 15 seconds. */
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(t);
  }, [startedAt]);

  /* A step landed while the panel was shut: nudge the chevron rather than
     opening the panel out from under whatever the user is reading. */
  const seen = useRef(steps.length);
  useEffect(() => {
    if (steps.length === seen.current) return;
    const grew = steps.length > seen.current;
    seen.current = steps.length;
    if (!grew || open) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 220);
    return () => clearTimeout(t);
  }, [steps.length, open]);

  if (handedOff) return null;

  return (
    <div className="ps-root">
      <div className="ps-row">
        <div className="ps-pill" aria-live="polite">
          {/* The mark, not a per-tool glyph. A different icon for every stage
              read as decoration and fought the word for attention. */}
          <img src={logoSrc} alt="" className="ps-mark" />
          <StatusWord word={word} />
        </div>

        {/* Reasoning, behind a chevron right beside the word. Only rendered
            when the model actually produced any. */}
        {session.thinking.trim() && (
          <button
            className={`ps-think-toggle ${thinkOpen ? 'is-open' : ''}`}
            onClick={() => setThinkOpen((o) => !o)}
            aria-expanded={thinkOpen}
            title={thinkOpen ? 'Hide thought process' : 'Show thought process'}
          >
            <ChevronRight size={14} />
            <span>Thought process</span>
          </button>
        )}

        {detail && <span className="ps-detail">{detail}</span>}

        <span className="ps-right">
          <Elapsed since={startedAt} />

          {hasTrace && (
            <button
              className={`ps-chev ${open ? 'is-open' : ''} ${bump ? 'is-bumped' : ''}`}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? 'Hide steps' : `Show ${steps.length} steps`}
            >
              <ChevronDown size={14} />
            </button>
          )}

          {onStop && (
            <button className="ps-stop" onClick={onStop} title="Stop generating" aria-label="Stop generating">
              <Square size={9} fill="currentColor" />
              Stop
            </button>
          )}
        </span>
      </div>

      {session.thinking.trim() && (
        <div className={`ps-think-wrap ${thinkOpen ? 'is-open' : ''}`} aria-hidden={!thinkOpen}>
          <div className="ps-think-clip">
            <div className="ps-think-body">{session.thinking}</div>
          </div>
        </div>
      )}

      {slow && !session.response && (
        <div className="ps-slow">This is taking a little longer than usual</div>
      )}

      {hasTrace && <TracePanel steps={steps} open={open} />}
    </div>
  );
});

/* ─── PERMANENT RECORD ────────────────────────────────────────────── */

/**
 * The same trace, attached to a finished message.
 *
 * Kept rather than discarded once the turn ends, so the user can go back and
 * see what actually ran. Collapsed by default, like the live one.
 */
export const TraceRecord = memo(function TraceRecord({
  steps,
}: {
  steps: { tool: string; title: string; status: ToolCall['status']; duration?: number }[];
}) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;

  const rows: ToolCall[] = steps.map((s, i) => ({
    tool: s.tool,
    title: s.title,
    status: s.status,
    duration: s.duration,
    // Only used as a render key here; the real timestamps are not persisted.
    startedAt: i,
  }));

  const ok = steps.filter((s) => s.status !== 'failed').length;

  return (
    <div className="ps-root ps-root--record">
      <button
        className="ps-record-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <CheckCircle2 size={13} />
        <span>
          {ok === steps.length
            ? `Ran ${steps.length} step${steps.length > 1 ? 's' : ''}`
            : `${ok} of ${steps.length} steps succeeded`}
        </span>
        <ChevronDown size={14} className={`ps-chev-inline ${open ? 'is-open' : ''}`} />
      </button>
      <TracePanel steps={rows} open={open} />
    </div>
  );
});

export default ProcessingStatus;
