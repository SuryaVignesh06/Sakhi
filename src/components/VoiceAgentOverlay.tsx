import React, { useEffect, useRef } from 'react';
import { Check, Mic, Shield, X } from 'lucide-react';
import ModelSelector from '../ModelSelector';
import VoiceOrb from './VoiceOrb';
import { useMicLevel } from '../useMicLevel';
import './VoiceAgentOverlay.css';

/**
 * The voice call, full screen.
 *
 * The orb is the whole of the visual: the noise-displaced blob, driven by
 * real microphone amplitude, sitting in the middle of an otherwise empty
 * field. Under it runs the transcript of the conversation as it happens —
 * what was heard, and what is being said back.
 *
 * The previous version of this screen carried a column of invented task rows
 * ("Handle customer complaints", "Consent required") that were wired to
 * nothing. They are gone: a status this screen cannot actually report should
 * not be drawn.
 */

export type CallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface TranscriptTurn {
  id: string;
  who: 'you' | 'eva';
  text: string;
  /** True while this line is still being added to. */
  live?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Words captured but not yet transcribed, if the engine reports any. */
  transcript?: string;
  callState?: CallState;
  callError?: string | null;
  /** Informational aside — shown quietly, never as a fault. */
  notice?: string | null;
  onInterrupt?: () => void;
  /** The conversation so far, oldest first. */
  turns?: TranscriptTurn[];
  isDark?: boolean;
  /**
   * Permission requests for THIS turn.
   *
   * They used to surface only in the chat thread, so asking the agent to open
   * YouTube by voice left it silently waiting on a card the user could not
   * see — the call looked hung. Hands-free means the question has to be asked
   * where the user is.
   */
  permissions?: { id: string; permission: string; reason: string }[];
  onPermission?: (id: string, granted: boolean, remember: boolean) => void;
}

const LABEL: Record<CallState, string> = {
  idle: 'Voice mode',
  listening: 'Listening',
  thinking: 'Working on it',
  speaking: 'Speaking — say anything to interrupt',
  error: 'Something went wrong',
};

export const VoiceAgentOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  transcript = '',
  callState = 'listening',
  callError = null,
  notice = null,
  onInterrupt,
  turns = [],
  isDark = true,
  permissions = [],
  onPermission,
}) => {
  const { level, available } = useMicLevel(isOpen && callState === 'listening');
  const feedRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  /* Follow the newest line unless the user has scrolled back to read. */
  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  useEffect(() => {
    const el = feedRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.text, transcript]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Space interrupts, but not while the user is typing somewhere.
      if (e.code === 'Space' && callState === 'speaking' && onInterrupt) {
        e.preventDefault();
        onInterrupt();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, onInterrupt, callState]);

  if (!isOpen) return null;

  const status = callError ?? (callState === 'listening' && !available
    ? 'Waiting for the microphone…'
    : LABEL[callState]);

  return (
    <div className={`vo-root ${isDark ? 'vo-dark' : 'vo-light'}`} role="dialog" aria-modal="true">
      <div className="vo-topbar">
        <span className={`vo-badge ${callError ? 'is-error' : ''}`}>
          <span className="vo-dot" />
          <Mic size={14} />
          {status}
        </span>
        {notice && !callError && <span className="vo-notice">{notice}</span>}
        {/* Reasoning model, switchable without leaving the call. */}
        <div className="vo-model"><ModelSelector /></div>
        <button className="vo-close" onClick={onClose} title="Exit voice mode (Esc)" aria-label="Exit voice mode">
          <X size={20} />
        </button>
      </div>

      {/* The orb: white on dark, black on light — always the opposite of the
          field behind it, so it reads in either theme. */}
      <div className="vo-orb-slot">
        <VoiceOrb level={callState === 'listening' ? level : 0.25} isDark={isDark} />
      </div>

      {/* Asked here, answered here — by button or by saying "yes". */}
      {permissions.length > 0 && onPermission && (
        <div className="vo-perms">
          {permissions.map((p) => (
            <div key={p.id} className="vo-perm">
              <Shield size={16} />
              <div className="vo-perm-body">
                <span className="vo-perm-title">Should I go ahead and use <b>{p.permission}</b>?</span>
                <span className="vo-perm-reason">{p.reason}</span>
                <span className="vo-perm-hint">Say “yes” or “no”, or use the buttons.</span>
              </div>
              <div className="vo-perm-actions">
                <button className="vo-perm-deny" onClick={() => onPermission(p.id, false, false)}>No</button>
                <button className="vo-perm-allow" onClick={() => onPermission(p.id, true, false)}>
                  <Check size={14} /> Yes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="vo-feed" ref={feedRef} onScroll={onScroll} aria-live="polite">
        {turns.length === 0 && !transcript && (
          <p className="vo-hint">Say something — the conversation will appear here.</p>
        )}

        {turns.map((t) => (
          <div key={t.id} className={`vo-turn vo-turn--${t.who} ${t.live ? 'is-live' : ''}`}>
            <span className="vo-who">{t.who === 'you' ? 'You' : 'Sakhi'}</span>
            <p className="vo-text">{t.text}</p>
          </div>
        ))}

        {/* Audio captured but not yet transcribed. Marked as provisional so it
            is never mistaken for something that was actually understood. */}
        {transcript && (
          <div className="vo-turn vo-turn--you is-pending">
            <span className="vo-who">You</span>
            <p className="vo-text">{transcript === '…' ? 'Listening…' : transcript}</p>
          </div>
        )}
      </div>

      {callState === 'speaking' && onInterrupt && (
        <button className="vo-interrupt" onClick={onInterrupt}>Interrupt</button>
      )}
    </div>
  );
};

export default VoiceAgentOverlay;
