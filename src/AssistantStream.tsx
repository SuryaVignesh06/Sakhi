import { memo, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Bot, Check, ChevronDown, Code2, Copy, Eye, Globe,
  HardDrive, Loader2, Monitor, Search, Shield, Sparkles, Wrench, X, Zap,
} from 'lucide-react';
import type { AgentName, SessionState, ToolCall } from './events';
import './AssistantStream.css';

/* Icons per agent/tool. Unknown names fall back rather than render nothing —
   a backend can introduce a tool before the frontend knows its icon. */
const AGENT_ICON: Record<string, typeof Bot> = {
  planner: Sparkles,
  browser: Globe,
  desktop: Monitor,
  coding: Code2,
  memory: HardDrive,
  vision: Eye,
  research: Search,
  voice: Bot,
  automation: Zap,
};
const iconFor = (name: string) => AGENT_ICON[name] ?? Wrench;

/* ─── PLANNER TIMELINE ────────────────────────────────────────────── */

export const StageTimeline = memo(function StageTimeline({ s }: { s: SessionState }) {
  if (!s.stages.length) return null;
  const lastIdx = s.stages.length - 1;

  return (
    <div className="as-stages" role="list" aria-label="Execution stages">
      {s.stages.map((st, i) => {
        // The newest stage is "current" only while the turn is still running.
        const current = i === lastIdx && s.active && st.stage !== 'Completed';
        return (
          <div key={`${st.stage}-${st.at}-${i}`} className={`as-stage ${current ? 'is-current' : 'is-done'}`} role="listitem">
            <span className="as-stage-mark">
              {current ? <Loader2 size={12} className="as-spin" /> : <Check size={12} strokeWidth={3} />}
            </span>
            <span className="as-stage-text">
              <span className="as-stage-name">{st.stage}</span>
              {st.description && <span className="as-stage-desc">{st.description}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
});

/* ─── TOOL CARDS ──────────────────────────────────────────────────── */

function ToolCard({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(t.tool);
  const hasLog = Boolean(t.message || t.error);

  return (
    <div className={`as-tool as-tool--${t.status}`}>
      <button className="as-tool-head" onClick={() => hasLog && setOpen((o) => !o)} disabled={!hasLog}>
        <span className="as-tool-icon"><Icon size={14} /></span>
        <span className="as-tool-main">
          <span className="as-tool-title">{t.title || t.tool}</span>
          <span className="as-tool-sub">
            {t.status === 'running' && (t.message || 'Running…')}
            {t.status === 'completed' && `Completed${t.duration != null ? ` · ${t.duration}ms` : ''}`}
            {t.status === 'failed' && (t.error || 'Failed')}
          </span>
        </span>
        <span className="as-tool-right">
          {t.status === 'running' && <Loader2 size={13} className="as-spin" />}
          {t.status === 'completed' && <Check size={13} className="as-ok" strokeWidth={3} />}
          {t.status === 'failed' && <AlertTriangle size={13} className="as-bad" />}
          {hasLog && <ChevronDown size={12} className={`as-tool-chev ${open ? 'is-open' : ''}`} />}
        </span>
      </button>

      {/* Only rendered when the backend actually sent a progress number. */}
      {t.status === 'running' && typeof t.progress === 'number' && (
        <div className="as-tool-bar" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(0, Math.min(100, t.progress))}%` }} />
        </div>
      )}

      {open && hasLog && (
        <pre className="as-tool-log">{t.error ?? t.message}</pre>
      )}
    </div>
  );
}

export const ToolCards = memo(function ToolCards({ s }: { s: SessionState }) {
  if (!s.toolOrder.length) return null;
  return (
    <div className="as-tools">
      {s.toolOrder.map((k) => s.tools[k] && <ToolCard key={k} t={s.tools[k]} />)}
    </div>
  );
});

/* ─── CLAUDE-STYLE THINKING & BACKGROUND PROCESS ACCORDION ──────── */

export const BackgroundProcessAccordion = memo(function BackgroundProcessAccordion({ s }: { s: SessionState }) {
  const hasContent = Boolean(s.thinking || s.stages.length || s.toolOrder.length || s.tasks);
  // Default open while actively running, collapse when finished
  const [open, setOpen] = useState(() => s.active);

  // Auto-expand when active turn starts
  useEffect(() => {
    if (s.active) setOpen(true);
  }, [s.active]);

  if (!hasContent) return null;

  const activeStage = s.stages[s.stages.length - 1]?.stage || 'Processing';
  const toolCount = s.toolOrder.length;

  return (
    <div className="as-process-accordion">
      <button
        className={`as-process-head ${s.active ? 'is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="as-process-head-left">
          <Sparkles size={14} className={s.active ? 'as-spin text-accent' : ''} />
          <span className="as-process-title">
            {s.active ? `Thinking & ${activeStage}…` : 'Thinking & Background Processes'}
          </span>
          {toolCount > 0 && (
            <span className="as-process-badge">{toolCount} tool{toolCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <ChevronDown size={14} className={`as-tool-chev ${open ? 'is-open' : ''}`} />
      </button>

      {open && (
        <div className="as-process-body">
          <StageTimeline s={s} />
          {s.thinking && (
            <div className="as-think-body">
              <div className="as-think-label">Reasoning & Strategy Trace:</div>
              {s.thinking}
            </div>
          )}
          <ToolCards s={s} />
          <TaskList s={s} />
        </div>
      )}
    </div>
  );
});

export const ThinkingBlock = BackgroundProcessAccordion;

/* ─── MARKDOWN ────────────────────────────────────────────────────── */

export function cleanChatText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\[(?:Online Stream|Offline Local|Gemini|Google Gemini|Gemini [^\]]+)\]\s*/gi, '')
    .replace(/^(?:Gemini|Google Gemini|Gemini [\w\.\-]+):\s*/gi, '')
    .replace(/\s*\([^)]*Gemini[^)]*\)\s*/gi, '')
    .replace(/\s*via Gemini[\w\.\-]*\b/gi, '')
    .replace(/\s*\[Offline Engine — Gemini[^\]]*\]/gi, '')
    .trim();
}

/**
 * Minimal, dependency-free markdown renderer.
 *
 * Presentation only — it never alters the text's meaning. Everything is built
 * with createElement-equivalent JSX and escaped by React, so model output
 * cannot inject markup.
 */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="as-code">
      <div className="as-code-head">
        <span>{lang || 'code'}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function inline(text: string, key: string) {
  // Split on code spans, bold, italic and links, keeping the delimiters.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.filter(Boolean).map((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={k} className="as-icode">{p.slice(1, -1)}</code>;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*')) return <em key={k}>{p.slice(1, -1)}</em>;
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={k} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={k}>{p}</span>;
  });
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const cleaned = cleanChatText(text);
  if (!cleaned) return null;
  const out: React.ReactNode[] = [];
  const lines = cleaned.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) body.push(lines[i++]);
      i++; // closing fence
      out.push(<CodeBlock key={`c${i}`} code={body.join('\n')} lang={lang} />);
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const Tag = (['h3', 'h4', 'h5', 'h6'] as const)[lvl - 1];
      out.push(<Tag key={`h${i}`} className="as-h">{inline(h[2], `h${i}`)}</Tag>);
      i++;
      continue;
    }

    // Table — header, separator, then rows.
    // The dash must come last in the class: `[\s:-|]` reads `:-|` as the range
    // 58–124, which excludes `-` (45) itself, so `|---|---|` never matched and
    // every table fell through to a paragraph.
    if (line.includes('|') && lines[i + 1]?.match(/^\s*\|?[\s:|-]+\|/)) {
      const cells = (r: string) => r.split('|').map((c) => c.trim()).filter((_, idx, a) => !(idx === 0 && !a[0]) && !(idx === a.length - 1 && !a[a.length - 1]));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++]));
      out.push(
        <div key={`t${i}`} className="as-tablewrap">
          <table className="as-table">
            <thead><tr>{head.map((c, x) => <th key={x}>{inline(c, `th${x}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, y) => <tr key={y}>{r.map((c, x) => <td key={x}>{inline(c, `td${y}${x}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    // Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push(<ul key={`u${i}`} className="as-ul">{items.map((it, x) => <li key={x}>{inline(it, `li${x}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      out.push(<ol key={`o${i}`} className="as-ul">{items.map((it, x) => <li key={x}>{inline(it, `oi${x}`)}</li>)}</ol>);
      continue;
    }

    // Blockquote / callout
    if (line.trimStart().startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(<blockquote key={`q${i}`} className="as-quote">{inline(body.join(' '), `q${i}`)}</blockquote>);
      continue;
    }

    if (!line.trim()) { i++; continue; }

    // Paragraph
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*]|\d+\.|#{1,4}\s|>|```)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={`p${i}`} className="as-p">{inline(para.join(' '), `p${i}`)}</p>);
  }

  return <div className="as-md">{out}</div>;
});

/* ─── NOTICES + PERMISSIONS ───────────────────────────────────────── */

export const Notices = memo(function Notices({
  s, onDismiss, onPermission,
}: {
  s: SessionState;
  onDismiss?: (id: string) => void;
  onPermission?: (id: string, granted: boolean) => void;
}) {
  if (!s.notices.length && !s.permissions.length) return null;
  return (
    <div className="as-notices">
      {s.permissions.map((p) => (
        <div key={p.id} className="as-perm">
          <Shield size={15} />
          <span className="as-perm-main">
            <b>Permission required: {p.permission}</b>
            <span>{p.reason}</span>
          </span>
          <span className="as-perm-btns">
            <button className="as-deny" onClick={() => onPermission?.(p.id, false)}>Deny</button>
            <button className="as-allow" onClick={() => onPermission?.(p.id, true)}>Allow</button>
          </span>
        </div>
      ))}
      {s.notices.map((nt) => (
        <div key={nt.id} className={`as-notice as-notice--${nt.level}`}>
          <span>{nt.message}</span>
          <button onClick={() => onDismiss?.(nt.id)} aria-label="Dismiss"><X size={12} /></button>
        </div>
      ))}
    </div>
  );
});

/* ─── TASKS ───────────────────────────────────────────────────────── */

export const TaskList = memo(function TaskList({ s }: { s: SessionState }) {
  if (!s.taskOrder.length) return null;
  return (
    <div className="as-tasks">
      {s.taskOrder.map((id) => {
        const t = s.tasks[id];
        if (!t) return null;
        return (
          <div key={id} className={`as-task as-task--${t.status}`}>
            <div className="as-task-top">
              <span className="as-task-title">{t.title}</span>
              <span className="as-task-pct">{t.status === 'failed' ? 'Failed' : `${t.progress}%`}</span>
            </div>
            <div className="as-task-bar"><span style={{ width: `${t.progress}%` }} /></div>
            {t.error && <div className="as-task-err">{t.error}</div>}
          </div>
        );
      })}
    </div>
  );
});

/* ─── ASSISTANT MARK ──────────────────────────────────────────────── */

/**
 * Rotates only while `active` — which is set by events, never by a timer.
 * When the backend stops, the mark stops.
 */
export function AssistantMark({ active, src, size = 20 }: { active: boolean; src: string; size?: number }) {
  return (
    <div className={`as-mark ${active ? 'is-active' : ''}`} style={{ width: size, height: size }} aria-hidden>
      <img src={src} alt="" />
    </div>
  );
}

/* ─── STREAMING RESPONSE ──────────────────────────────────────────── */

export const StreamedResponse = memo(function StreamedResponse({ s }: { s: SessionState }) {
  const ref = useRef<HTMLDivElement>(null);

  // Follow the tail while streaming, but only if the user is already near it.
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [s.response]);

  if (!s.response) return null;
  return (
    <div className="as-response" ref={ref}>
      <Markdown text={s.response} />
      {s.active && <span className="as-caret" aria-hidden />}
      {!s.active && (s.tokens || s.duration) && (
        <div className="as-meta">
          {s.tokens != null && <span>{s.tokens} tokens</span>}
          {s.duration != null && <span>{s.duration}s</span>}
        </div>
      )}
    </div>
  );
});

/* ─── COMPOSITE ───────────────────────────────────────────────────── */

export default function AssistantStream({
  s, logoSrc, onDismissNotice, onPermission,
}: {
  s: SessionState;
  logoSrc: string;
  onDismissNotice?: (id: string) => void;
  onPermission?: (id: string, granted: boolean) => void;
}) {
  const idle =
    !s.active && !s.stages.length && !s.toolOrder.length && !s.response && !s.taskOrder.length && !s.thinking;
  if (idle) return null;

  return (
    <div className="as-root">
      {s.active && (
        <div className="as-markrow">
          <AssistantMark active src={logoSrc} />
          {s.agent && <span className="as-agent">{s.agent} agent</span>}
        </div>
      )}
      <Notices s={s} onDismiss={onDismissNotice} onPermission={onPermission} />
      <BackgroundProcessAccordion s={s} />
      <StreamedResponse s={s} />
    </div>
  );
}
