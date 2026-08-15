import { useCallback, useEffect, useState } from 'react';

/**
 * Theme, in one place.
 *
 * There were two independent notions of "the theme" before: a `dark | light`
 * useState in App that the header button flipped, and a `'Light' | 'Dark' |
 * 'System'` useState inside SettingsView that was never read by anything. The
 * Settings buttons therefore did nothing at all, and neither survived a reload.
 *
 * Here `Preference` is what the user chose and `Applied` is what is actually
 * painted; System resolves through `prefers-color-scheme` and keeps following
 * it while the OS setting changes.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type AppliedTheme = 'light' | 'dark';

const STORE = 'eva.theme.v1';

const systemTheme = (): AppliedTheme =>
  window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

export function getPreference(): ThemePreference {
  const raw = localStorage.getItem(STORE);
  return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'dark';
}

/**
 * The preference, resolved to something paintable.
 *
 * This used to `return 'dark'` unconditionally, ignoring its argument — so
 * the toggle flipped a preference that nothing downstream ever read, and the
 * app was permanently dark no matter what was chosen or stored.
 */
export const resolveTheme = (p: ThemePreference): AppliedTheme =>
  p === 'system' ? systemTheme() : p;

/** The single writer of the attribute every themed rule keys off. */
function paint(applied: AppliedTheme) {
  document.documentElement.dataset.theme = applied;
  // Native controls — scrollbars, form widgets — follow this, not our CSS.
  document.documentElement.style.colorScheme = applied;
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    try {
      return getPreference();
    } catch {
      return 'dark';
    }
  });
  const [applied, setApplied] = useState<AppliedTheme>(() => resolveTheme(preference));

  useEffect(() => {
    const next = resolveTheme(preference);
    setApplied(next);
    paint(next);
    try {
      localStorage.setItem(STORE, preference);
    } catch {
      /* private mode — the theme still applies for this session */
    }
  }, [preference]);

  /* Only while following the system: a preference of light or dark must not
     move when the OS flips at sunset. */
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = () => {
      const next = systemTheme();
      setApplied(next);
      paint(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => setPreferenceState(p), []);

  /** What the header button does: flip whatever is on screen right now. */
  const toggle = useCallback(() => {
    setPreferenceState(resolveTheme(preference) === 'dark' ? 'light' : 'dark');
  }, [preference]);

  return { preference, applied, setPreference, toggle };
}
