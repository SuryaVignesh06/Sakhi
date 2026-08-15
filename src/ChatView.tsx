import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, AudioLines, Check, ChevronDown, ChevronRight, Clipboard, Code2, Copy, Eye, FolderOpen,
  Globe, HardDrive, Loader2, Mic, Monitor, RotateCcw, Search, Send, Shield,
  Sparkles, Square, TerminalSquare, ThumbsDown, ThumbsUp, Wrench, X, Zap,
} from 'lucide-react';
import { Message, MessageContent } from './components/ui/message';
import { ProcessingStatus, TraceRecord } from './components/ProcessingStatus';
import { useDictation } from './useDictation';
import { useMicLevel } from './useMicLevel';
import { Response } from './components/ui/response';
import { TextAnimate } from './components/ui/text-animate';
import type { PlannerStage, SessionState, ToolCall } from './events';
import { Markdown, cleanChatText } from './AssistantStream';
import PlusMenu, { type Attachment } from './PlusMenu';
import './ChatView.css';

/**
 * The chat surface.
 *
 * Everything below the composer is a projection of backend events. There is no
 * timer that advances a fake stage, no scripted "Analyzing…" sequence, and no
 * placeholder text: if the backend says nothing, this renders nothing. The one
 * clock on this page is the elapsed counter, which measures real wall time
 * since the request was sent.
 */

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  /** Filled in when the turn actually ran tools, so the receipt is truthful. */
  steps?: { tool: string; title: string; status: ToolCall['status']; duration?: number }[];
  meta?: { model?: string; provider?: string; duration?: number; tokens?: number };
  error?: boolean;
}

/* ─── ICONS ───────────────────────────────────────────────────────── */

const TOOL_ICON: Record<string, typeof Wrench> = {
  browser: Globe,
  desktop: Monitor,
  terminal: TerminalSquare,
  clipboard: Clipboard,
  files: FolderOpen,
  memory: HardDrive,
  coding: Code2,
  research: Search,
  vision: Eye,
  automation: Zap,
  planner: Sparkles,
};
const iconFor = (name: string) => TOOL_ICON[name] ?? Wrench;

/* ─── ACTIVITY LABEL ──────────────────────────────────────────────── */

/**
 * What the assistant is doing right now, in the user's words.
 *
 * Every label is derived from an event that already arrived. The mapping is
 * presentational only — it renames a stage, it never invents one.
 */
const STAGE_LABEL: Record<PlannerStage, string> = {
  'Understanding Request': 'Thinking',
  'Analyzing Context': 'Analyzing',
  'Planning': 'Planning',
  'Selecting Model': 'Determining',
  'Selecting Agent': 'Routing',
  'Preparing Tools': 'Preparing',
  'Executing': 'Automating',
  'Generating Response': 'Writing',
  'Completed': 'Finishing',
};

export function activityOf(s: SessionState): { label: string; detail?: string; progress?: number } {
  // A running tool is the most specific truth available, so it wins.
  const running = s.toolOrder.map((k) => s.tools[k]).find((t) => t?.status === 'running');
  if (running) {
    return {
      label: 'Automating',
      detail: [running.title || running.tool, running.message].filter(Boolean).join(' · '),
      progress: running.progress,
    };
  }

  if (s.permissions.length) {
    return { label: 'Waiting for you', detail: `${s.permissions[0].permission} needs permission` };
  }

  const last = s.stages[s.stages.length - 1];
  if (!last) return { label: 'Connecting' };

  // Text already flowing means the stage label is behind reality.
  if (s.response && last.stage === 'Generating Response') return { label: 'Writing', detail: undefined };
  if (!s.response && s.thinking && last.stage === 'Generating Response') return { label: 'Reasoning' };

  return { label: STAGE_LABEL[last.stage] ?? last.stage, detail: last.description };
}

/* ─── LOGO MARK ───────────────────────────────────────────────────── */

/**
 * The animated mark. `active` comes from the event stream, so the animation
 * starts and stops with real backend work rather than on a timeout.
 */
export function AgentMark({ src, active, size = 18 }: { src: string; active: boolean; size?: number }) {
  return (
    <span className={`cv-mark ${active ? 'is-active' : ''}`} style={{ width: size, height: size }} aria-hidden>
      <img src={src} alt="" />
    </span>
  );
}

/* ─── ELAPSED ─────────────────────────────────────────────────────── */

/** Wall time since the request was sent. Honest: it measures, it does not fake. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [since]);
  const s = Math.max(0, (now - since) / 1000);
  return <span className="cv-elapsed">{s < 10 ? s.toFixed(1) : Math.round(s)}s</span>;
}

/* ─── LIVE ACTIVITY ───────────────────────────────────────────────── */

/* The live indicator now lives in components/ProcessingStatus.tsx.
   It used to render its own copy of the logo mark, which — once the message
   avatar became the logo too — put two of the same spinning mark on one row. */

/* ─── PERMISSION ──────────────────────────────────────────────────── */

export const PermissionCard = memo(function PermissionCard({
  ask, onAnswer,
}: {
  ask: { id: string; permission: string; reason: string };
  onAnswer: (id: string, granted: boolean, remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  const [sent, setSent] = useState<null | boolean>(null);
  const Icon = iconFor(ask.permission);

  return (
    <div className={`cv-perm ${sent === null ? '' : sent ? 'is-allowed' : 'is-denied'}`}>
      <span className="cv-perm-icon"><Icon size={16} /></span>
      <div className="cv-perm-body">
        <div className="cv-perm-title">
          <Shield size={13} />
          Allow <b>{ask.permission}</b> to run on your computer?
        </div>
        <div className="cv-perm-reason">{ask.reason}</div>
        {sent === null ? (
          <>
            <label className="cv-perm-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Don't ask again this session
            </label>
            <div className="cv-perm-actions">
              <button
                className="cv-btn cv-btn--ghost"
                onClick={() => { setSent(false); onAnswer(ask.id, false, false); }}
              >
                Deny
              </button>
              <button
                className="cv-btn cv-btn--primary"
                onClick={() => { setSent(true); onAnswer(ask.id, true, remember); }}
              >
                <Check size={13} /> Allow
              </button>
            </div>
          </>
        ) : (
          <div className="cv-perm-done">{sent ? 'Allowed — running now.' : 'Denied. Nothing was run.'}</div>
        )}
      </div>
    </div>
  );
});

/* ─── TOOL CARD ───────────────────────────────────────────────────── */

const ToolRow = memo(function ToolRow({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(t.tool);
  const detail = t.error ?? t.message;

  return (
    <div className={`cv-tool cv-tool--${t.status}`}>
      <button className="cv-tool-head" onClick={() => detail && setOpen((o) => !o)} disabled={!detail}>
        <span className="cv-tool-icon"><Icon size={13} /></span>
        <span className="cv-tool-name">{t.title || t.tool}</span>
        <span className="cv-tool-status">
          {t.status === 'running' && (t.message || 'Running')}
          {t.status === 'completed' && `Done${t.duration != null ? ` · ${t.duration}ms` : ''}`}
          {t.status === 'failed' && (t.error || 'Failed')}
        </span>
        {t.status === 'running' && <Loader2 size={12} className="cv-spin" />}
        {t.status === 'completed' && <Check size={12} className="cv-ok" strokeWidth={3} />}
        {t.status === 'failed' && <AlertTriangle size={12} className="cv-bad" />}
        {detail && <ChevronRight size={12} className={`cv-chev ${open ? 'is-open' : ''} transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />}
      </button>
      {t.status === 'running' && typeof t.progress === 'number' && (
        <div className="cv-tool-bar"><span style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }} /></div>
      )}
      {open && detail && <pre className="cv-tool-log">{detail}</pre>}
    </div>
  );
});

/* ─── THINKING ────────────────────────────────────────────────────── */

const ThinkingPanel = memo(function ThinkingPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="cv-think">
      <button className="cv-think-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={14} className={`cv-chev ${open ? 'is-open' : ''} transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        <span className="font-medium text-[var(--text-muted)]">Thought Process</span>
      </button>
      {open && <div className="cv-think-body">{text}</div>}
    </div>
  );
});

/* ─── FINISHED MESSAGE ────────────────────────────────────────────── */

const AssistantMessage = memo(function AssistantMessage({
  m, logoSrc, onRegenerate,
}: {
  m: ChatMessageItem;
  logoSrc: string;
  onRegenerate?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  const copy = () => {
    navigator.clipboard?.writeText(cleanChatText(m.text));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={`message-demo-lists w-full flex-shrink-0 ${m.error ? 'is-error' : ''}`} key={m.id}>
      <Message from="assistant">
        <img src={logoSrc} alt="" className="assistant-avatar-logo" />
        <MessageContent>
          {m.steps && m.steps.length > 0 && (
            <TraceRecord steps={m.steps} />
          )}

          <Response>
            <TextAnimate animation="blurInUp" by="character" once>
              <Markdown text={m.text} />
            </TextAnimate>
          </Response>

          <div className="cv-msg-actions">
            <button className={copied ? 'is-on' : ''} onClick={copy} title="Copy">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button className={vote === 'up' ? 'is-on' : ''} onClick={() => setVote(vote === 'up' ? null : 'up')} title="Good response">
              <ThumbsUp size={13} />
            </button>
            <button className={vote === 'down' ? 'is-on' : ''} onClick={() => setVote(vote === 'down' ? null : 'down')} title="Bad response">
              <ThumbsDown size={13} />
            </button>
            {onRegenerate && (
              <button onClick={() => onRegenerate(m.text)} title="Regenerate">
                <RotateCcw size={13} />
              </button>
            )}
            {m.meta && (m.meta.duration || m.meta.model) && (
              <span className="cv-msg-meta">
                {m.meta.model && <span>{m.meta.model}</span>}
                {m.meta.duration != null && <span>{m.meta.duration}s</span>}
                {m.meta.tokens != null && <span>{m.meta.tokens} tok</span>}
              </span>
            )}
          </div>
        </MessageContent>
      </Message>
    </div>
  );
});

import { LiveWaveform } from './components/ui/live-waveform';

/* ─── COMPOSER ────────────────────────────────────────────────────── */

function Composer({
  value, onChange, onSend, onStop, busy, focused, setFocused, textareaRef,
  onAttach, webSearch, onToggleWebSearch, voiceActive, onToggleVoice, onOpenSettings,
  offlineMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy: boolean;
  focused: boolean;
  setFocused: (b: boolean) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onAttach: (a: Attachment[]) => void;
  webSearch: boolean;
  onToggleWebSearch: (b: boolean) => void;
  voiceActive: boolean;
  onToggleVoice: () => void;
  onOpenSettings?: () => void;
  /** Offline keeps recognition on the local Moonshine model. */
  offlineMode: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ta = textareaRef ?? localRef;

  /**
   * Dictated text lands at the caret, not at the end.
   *
   * That is what lets someone type and speak into the same buffer without one
   * clobbering the other (spec §7): the caret is wherever the user last put
   * it, so a spoken phrase inserts there and the caret moves past it.
   */
  const appendFinal = (text: string) => {
    const el = ta.current;
    const at = el && el.selectionStart != null ? el.selectionStart : value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const next = `${before}${pad}${text}${after}`;
    onChange(next);

    // Put the caret back after the words we just inserted, once React has
    // written the new value to the DOM.
    const caret = before.length + pad.length + text.length;
    requestAnimationFrame(() => {
      if (!el) return;
      el.selectionStart = el.selectionEnd = caret;
      el.scrollTop = el.scrollHeight;
    });
  };

  const dictation = useDictation({ onFinal: appendFinal, offline: offlineMode });
  const { level } = useMicLevel(dictation.recording);

  /* Grow with the text up to 200px, then let it scroll. Measured from
     scrollHeight on every change rather than counting lines, which cannot
     know about wrapping. */
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, dictation.recording, ta]);

  const ready = value.trim().length > 0 || voiceActive;

  return (
    <div
      className={`composer cv-composer ${focused || voiceActive ? 'composer--focused' : ''} ${
        dictation.recording ? 'composer--recording' : ''
      }`}
    >
      {voiceActive ? (
        <div className="composer-input flex flex-col justify-center min-h-[44px] py-2 px-3">
          <LiveWaveform active={!busy} processing={busy} level={level} height={26} barColor="var(--accent)" historySize={64} />
          {value && <div className="text-xs text-center text-muted-foreground mt-1 truncate">{value}</div>}
        </div>
      ) : (
        <div className="cv-input-stack">
          <textarea
            ref={ta}
            className="composer-input"
            placeholder={busy ? 'Sakhi is working…' : 'Ask anything, or tell me to do something on your computer'}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (ready) onSend();
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Message Sakhi"
          />
          {/* While dictating, the waveform sits over the input and reacts to
              real amplitude. Transcribed phrases drop into the textarea
              underneath it as they land, so the box fills as you speak. */}
          {dictation.recording && (
            <div className="cv-dictation-layer">
              <LiveWaveform
                active={dictation.capturing}
                processing={dictation.transcribing}
                level={level}
                height={34}
                barWidth={2}
                barGap={2}
                mode="scrolling"
                historySize={72}
                barColor="var(--accent)"
              />
              <span className="cv-dictation-state">
                {dictation.transcribing
                  ? 'Transcribing…'
                  : dictation.capturing
                  ? 'Listening'
                  : dictation.silent
                  ? 'Say something'
                  : 'Ready'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Throttled by the browser's own coalescing of live regions; the text
          only changes on a settled phrase, not on every interim word. */}
      <span className="sr-only" aria-live="polite">
        {dictation.recording ? value : ''}
      </span>

      {dictation.error && <div className="cv-voice-note is-warn">{dictation.error.message}</div>}

      <div className="composer-footer">
        <PlusMenu
          onAttach={onAttach}
          webSearch={webSearch}
          onToggleWebSearch={onToggleWebSearch}
          onOpenSettings={onOpenSettings}
        />
        <div className="cv-composer-right">
          {dictation.recording && (
            <button
              className="btn-mic-discard"
              type="button"
              onClick={() => { dictation.stop(); onChange(''); }}
              title="Discard transcript"
              aria-label="Discard transcript"
            >
              <X size={15} strokeWidth={2} />
            </button>
          )}

          <button
            className={`btn-mic ${dictation.recording ? 'active is-recording' : ''}`}
            type="button"
            onClick={dictation.toggle}
            aria-pressed={dictation.recording}
            title={dictation.recording ? 'Stop dictating' : 'Dictate a message'}
            aria-label={dictation.recording ? 'Stop dictating' : 'Dictate a message'}
          >
            {dictation.recording
              ? <Square size={14} fill="currentColor" />
              : <Mic size={18} strokeWidth={1.75} />}
          </button>

          <button
            className={`btn-mic btn-voice-call ${voiceActive ? 'active' : ''}`}
            type="button"
            onClick={onToggleVoice}
            title="Hands-free voice mode"
            aria-label="Hands-free voice mode"
          >
            <AudioLines size={18} strokeWidth={1.75} />
          </button>
          {busy && onStop ? (
            <button className="btn-send is-ready cv-send-stop" type="button" onClick={onStop} title="Stop" aria-label="Stop">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              className={`btn-send ${ready ? 'is-ready' : 'is-hidden'}`}
              type="button"
              onClick={onSend}
              disabled={!ready}
              tabIndex={ready ? 0 : -1}
              aria-hidden={!ready}
              title="Send"
              aria-label="Send message"
            >
              <Send size={17} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── VIEW ────────────────────────────────────────────────────────── */

const SUGGESTIONS = [
  { label: 'Open my browser', prompt: 'Open my web browser.' },
  { label: "What's my disk usage?", prompt: 'Check the disk usage on this computer.' },
  { label: 'Save a note', prompt: 'Save a file called notes.md in my workspace with a short checklist for today.' },
  { label: 'Copy something for me', prompt: 'Copy the text "Sakhi is running" to my clipboard.' },
];

export default function ChatView({
  messages, session, busy, startedAt, connected,
  chatInput, setChatInput, onSend, onStop, onPermission, onDismissNotice,
  logoSrc, textareaRef, composerFocused, setComposerFocused,
  voiceActive, onToggleVoice, onAttach, webSearch, onToggleWebSearch, onOpenSettings,
  offlineMode = false,
}: {
  offlineMode?: boolean;
  messages: ChatMessageItem[];
  session: SessionState;
  busy: boolean;
  startedAt: number;
  connected: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
  onPermission: (id: string, granted: boolean, remember: boolean) => void;
  onDismissNotice: (id: string) => void;
  logoSrc: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  composerFocused: boolean;
  setComposerFocused: (b: boolean) => void;
  voiceActive: boolean;
  onToggleVoice: () => void;
  onAttach: (a: Attachment[]) => void;
  webSearch: boolean;
  onToggleWebSearch: (b: boolean) => void;
  onOpenSettings?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  /* Follow the tail only while the user is already there — scrolling up to read
     during a long tool run must not be yanked back. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (pinned) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, session.response, session.toolOrder.length, session.permissions.length, busy, pinned]);

  const liveTools = useMemo(
    () => session.toolOrder.map((k) => session.tools[k]).filter(Boolean),
    [session.toolOrder, session.tools]
  );

  const empty = messages.length === 0;

  return (
    <div className="nav-section-wrapper cv-root">
      <div className="cv-scroll" ref={scrollRef}>
        <div className="cv-thread">
          {empty && !busy && (
            <div className="cv-empty">
              <AgentMark src={logoSrc} active={false} size={44} />
              <h2>What should I do for you?</h2>
              <p>I can answer questions, or act on this computer — open apps, read and write files, use the clipboard, and check the system.</p>
              <div className="cv-suggest">
                {SUGGESTIONS.map((sg) => (
                  <button key={sg.label} onClick={() => onSend(sg.prompt)}>{sg.label}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.sender === 'user' ? (
              <div className="w-full flex-shrink-0" key={m.id}>
                <Message from="user">
                  <MessageContent>
                    <Response>{m.text}</Response>
                  </MessageContent>
                </Message>
              </div>
            ) : (
              <div className="w-full flex-shrink-0" key={m.id}>
                <AssistantMessage m={m} logoSrc={logoSrc} onRegenerate={(t) => onSend(t)} />
              </div>
            )
          )}

          {/* ── the live turn ── */}
          {busy && (
            <div className="message-demo-lists w-full flex-shrink-0">
              {/* The indicator sits OUTSIDE the message card and flush with
                  the thread's left edge. Inside the card it was inset by the
                  avatar column, so it read as floating in the middle of the
                  bubble rather than as the turn starting.
                  Keyed on the turn so a rapid follow-up cannot inherit the
                  previous turn's open trace panel. */}
              <ProcessingStatus
                key={startedAt}
                session={session}
                startedAt={startedAt}
                onStop={onStop}
                logoSrc={logoSrc}
              />

              {/* The card only appears once there is something to put in it —
                  no empty bubble sitting under the status line. */}
              {(session.response || session.thinking || session.permissions.length > 0) && (
                <Message from="assistant">
                  <img
                    src={logoSrc}
                    alt=""
                    className="assistant-avatar-logo assistant-avatar-logo--busy"
                  />
                  <MessageContent>
                    {session.permissions.map((p) => (
                      <PermissionCard key={p.id} ask={p} onAnswer={onPermission} />
                    ))}

                    {session.response && (
                      <Response>
                        <Markdown text={session.response} />
                        <span className="cv-caret" aria-hidden />
                      </Response>
                    )}
                  </MessageContent>
                </Message>
              )}
            </div>
          )}

          {session.notices.length > 0 && (
            <div className="cv-notices">
              {session.notices.map((n) => (
                <div key={n.id} className={`cv-notice cv-notice--${n.level}`}>
                  <span>{n.message}</span>
                  <button onClick={() => onDismissNotice(n.id)} aria-label="Dismiss"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {!connected && (
        <div className="cv-offline">
          <AlertTriangle size={13} />
          Backend not connected — start it with <code>npm run dev</code> in <code>server/</code>.
        </div>
      )}

      <Composer
        value={chatInput}
        onChange={setChatInput}
        onSend={() => onSend()}
        onStop={onStop}
        busy={busy}
        focused={composerFocused}
        setFocused={setComposerFocused}
        textareaRef={textareaRef}
        onAttach={onAttach}
        webSearch={webSearch}
        onToggleWebSearch={onToggleWebSearch}
        voiceActive={voiceActive}
        onToggleVoice={onToggleVoice}
        onOpenSettings={onOpenSettings}
        offlineMode={offlineMode}
      />
    </div>
  );
}
