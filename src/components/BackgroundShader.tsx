import React, { useEffect, useState } from 'react';
import morningBg from '../assets/mrngbg.png';
import eveningBg from '../assets/evngbg.png';
import nightBg from '../assets/nightbg.png';

interface BackgroundShaderProps {
  isDark?: boolean;
}

/**
 * The backdrop, chosen by the time of day.
 *
 * Morning, evening and night are real photographs rather than a generated
 * gradient, so the palette is fixed and the text on top has to be made
 * legible against it rather than the other way round — see the scrim below.
 *
 * The period is re-checked on a timer instead of only at mount. This window
 * routinely stays open across an evening, and a backdrop that is still
 * showing morning at 11pm is worse than not changing at all.
 */

export type DayPeriod = 'morning' | 'evening' | 'night';

/**
 * Boundaries, stated once.
 *
 * 05:00–16:59 morning · 17:00–19:59 evening · 20:00–04:59 night.
 * Night deliberately wraps midnight, which is why it is the fallback rather
 * than a range test.
 */
export function periodFor(date = new Date()): DayPeriod {
  const h = date.getHours();
  if (h >= 5 && h < 17) return 'morning';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

const IMAGE: Record<DayPeriod, string> = {
  morning: morningBg,
  evening: eveningBg,
  night: nightBg,
};

export const BackgroundShader: React.FC<BackgroundShaderProps> = ({ isDark = true }) => {
  const [period, setPeriod] = useState<DayPeriod>(() => periodFor());

  useEffect(() => {
    /* A minute is far finer than the boundaries need, and costs nothing —
       it just means the change lands promptly rather than up to an hour
       late. setState with the same value is a no-op, so this does not
       re-render between transitions. */
    const id = window.setInterval(() => setPeriod(periodFor()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={`bg-photo bg-photo--${period} ${isDark ? '' : 'bg-photo--light'}`}
      style={{ backgroundImage: `url(${IMAGE[period]})` }}
      aria-hidden="true"
      data-period={period}
    />
  );
};

export default BackgroundShader;
