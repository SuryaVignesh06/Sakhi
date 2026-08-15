import { useEffect, useState } from 'react';
import VoiceOrb from './components/VoiceOrb';
import './DesktopWidget.css';

/**
 * The floating desktop presence.
 *
 * Rendered into the frameless, transparent, always-on-top window created by
 * the main process. It is deliberately only two things: the orb, and a strip
 * showing the last thing said on each side — so it can sit over a browser or
 * any other app without covering the work.
 *
 * State arrives over IPC from the main window, which owns the actual call.
 */

export interface WidgetState {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  level: number;
  you: string;
  sakhi: string;
  isDark: boolean;
}

const EMPTY: WidgetState = {
  state: 'idle', level: 0, you: '', sakhi: '', isDark: true,
};

export default function DesktopWidget() {
  const [s, setS] = useState<WidgetState>(EMPTY);

  useEffect(() => {
    const api = (window as any).sakhi;
    if (!api?.onWidgetState) return;
    return api.onWidgetState((next: Partial<WidgetState>) =>
      setS((cur) => ({ ...cur, ...next }))
    );
  }, []);

  const label =
    s.state === 'listening' ? 'Listening'
    : s.state === 'thinking' ? 'Working'
    : s.state === 'speaking' ? 'Speaking'
    : s.state === 'error' ? 'Problem' : 'Ready';

  /**
   * The transcript only exists while there is a conversation happening.
   *
   * Idle, this is just the orb sitting on the desktop — a strip repeating the
   * last exchange indefinitely is clutter over whatever the user is actually
   * working in.
   */
  const talking = s.state === 'listening' || s.state === 'thinking' || s.state === 'speaking';
  const showStrip = talking && Boolean(s.you || s.sakhi);

  /* Idle fades the whole widget back rather than hiding it, so it stays
     glanceable without competing with the app underneath. */
  const dimmed = s.state === 'idle' || s.state === 'error';

  return (
    <div
      className={[
        'dw-root',
        s.isDark ? 'dw-dark' : 'dw-light',
        dimmed ? 'is-dim' : 'is-awake',
      ].join(' ')}
    >
      {/* The orb is the drag handle — there is no title bar to grab. */}
      <div className="dw-orb">
        <VoiceOrb level={s.level} isDark={s.isDark} />
      </div>

      <div className={`dw-strip ${showStrip ? 'is-shown' : ''}`}>
        <span className={`dw-state dw-state--${s.state}`}>{label}</span>
        {s.you && <p className="dw-line dw-line--you"><b>You</b> {s.you}</p>}
        {s.sakhi && <p className="dw-line dw-line--sakhi"><b>Sakhi</b> {s.sakhi}</p>}
      </div>
    </div>
  );
}
