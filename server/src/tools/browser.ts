import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ToolContext } from './registry.js';

/**
 * Browser control — a real, visible Chromium the assistant drives.
 *
 * This replaces "open a URL and hope": handing a search URL to the system
 * browser navigates somewhere and stops. Asking for a song and landing on a
 * results page is not playing the song.
 *
 * The browser here is:
 *   - HEADED, always. The point is that the user watches it happen. A headless
 *     automation the user cannot see is indistinguishable from nothing
 *     happening, which is exactly the complaint this exists to fix.
 *   - PERSISTENT across calls, so a turn can navigate, then type, then click,
 *     each as a separate tool call against the same page.
 *   - SLOWED slightly, because instant clicks look like a glitch rather than
 *     an agent working. 60ms per action is enough to follow.
 *
 * SECURITY: selectors and text come from the model, which is influenced by
 * page content — so this never evaluates model-supplied JavaScript. Every
 * interaction goes through Playwright's own locator API, and navigation is
 * restricted to http/https.
 */

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/** A profile directory keeps logins between runs, as a real browser would. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function ensurePage(report?: (pct: number, msg: string) => void): Promise<Page> {
  if (page && !page.isClosed()) return page;

  if (!browser || !browser.isConnected()) {
    report?.(4, 'Starting the browser…');
    browser = await chromium.launch({
      headless: false,
      slowMo: 60,
      args: [
        '--start-maximized',
        // YouTube autoplay is blocked without this: Chromium requires a user
        // gesture before a video may play with sound, and an automated click
        // does not always count as one.
        '--autoplay-policy=no-user-gesture-required',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }

  report?.(7, 'Preparing the window…');
  if (!context) {
    context = await browser.newContext({
      viewport: null,
      userAgent: USER_AGENT,
      locale: 'en-US',
    });
  }

  page = await context.newPage();
  /* Generous on purpose. A first navigation on a cold profile — DNS, TLS, a
     consent redirect — measured over 20s here, and a timeout that fires while
     the page is still loading looks exactly like a broken tool. */
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(60_000);
  return page;
}

/** Closes everything. Called on shutdown and by the `close` action. */
export async function closeBrowser(): Promise<void> {
  try {
    await context?.close();
    await browser?.close();
  } catch {
    /* already gone */
  }
  page = null;
  context = null;
  browser = null;
}

/**
 * Cookie and consent walls block every later step, so they are cleared first.
 * Matching is by accessible name, which survives the markup changing.
 */
async function dismissConsent(p: Page): Promise<boolean> {
  const labels = [
    'Accept all', 'Accept the use of cookies', 'I agree', 'Agree to all',
    'Allow all cookies', 'Accept cookies', 'Got it', 'No thanks', 'Reject all',
  ];
  for (const label of labels) {
    try {
      const btn = p.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
      if (await btn.isVisible({ timeout: 700 })) {
        await btn.click({ timeout: 2500 });
        await p.waitForTimeout(600);
        return true;
      }
    } catch {
      /* not this one */
    }
  }
  return false;
}

const httpUrl = (raw: string): string => {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(url); // throws on nonsense, which is the point
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`Refusing to open a ${parsed.protocol} URL.`);
  }
  return parsed.toString();
};

export interface BrowserArgs {
  action:
    | 'open' | 'play_youtube' | 'search' | 'click' | 'type'
    | 'press' | 'read' | 'scroll' | 'close';
  url?: string;
  query?: string;
  text?: string;
  key?: string;
  /** Visible text of the thing to click, e.g. a button or link label. */
  target?: string;
}

export const BROWSER_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['open', 'play_youtube', 'search', 'click', 'type', 'press', 'read', 'scroll', 'close'],
      description:
        'play_youtube searches YouTube for `query` and PLAYS the first video — use it ' +
        'whenever the user asks to play a song, track or video. open navigates to `url`. ' +
        'search runs a web search for `query`. click clicks the visible text in `target`. ' +
        'type types `text` into the focused or main input. press sends a key such as Enter. ' +
        'read returns the visible text of the page.',
    },
    url: { type: 'string', description: 'For open.' },
    query: { type: 'string', description: 'For play_youtube and search. The song or search terms.' },
    text: { type: 'string', description: 'For type.' },
    key: { type: 'string', description: 'For press, e.g. Enter, Escape, ArrowDown.' },
    target: { type: 'string', description: 'For click: the visible label of the element.' },
  },
  required: ['action'],

  /**
   * Which parameter a bare, unlabelled value belongs to, per action.
   *
   * Small models call this as `browser(play_youtube, yellow coldplay)` with no
   * parameter names. Declaration order alone cannot resolve that — `url` is
   * declared before `query`, so the song title would be read as a URL. This
   * states the intent instead of leaving the parser to guess.
   */
  'x-primary': {
    open: 'url',
    play_youtube: 'query',
    search: 'query',
    click: 'target',
    type: 'text',
    press: 'key',
  },
} as const;

/* ─── YOUTUBE ─────────────────────────────────────────────────────── */

/**
 * Sits through pre-roll ads and presses Skip as soon as it is offered.
 *
 * Two reasons this has to exist:
 *   1. The user watches an ad and then a second ad, with the Skip button going
 *      unclicked — the automation stopped at "a video is playing".
 *   2. Playback verification was measuring the AD's clock, so a 20-second
 *      pre-roll counted as the song playing. Skipping first makes the check
 *      mean what it claims.
 *
 * Skip is not offered immediately (usually ~5s in), and YouTube often queues
 * two ads back to back, so this polls rather than looking once.
 */
async function skipAds(p: Page, ctx: ToolContext, budgetMs = 45_000): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let skipped = 0;
  let announced = false;

  const adShowing = () =>
    p
      .evaluate(
        `!!document.querySelector('.html5-video-player.ad-showing, .ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-text')`
      )
      .catch(() => false);

  /* Class names first — they are stable and unambiguous. The accessible name
     is the fallback, since the markup changes more often than the label. */
  const SKIP = [
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    'button[class*="skip-button"]',
  ];

  while (Date.now() < deadline) {
    if (!(await adShowing())) break;

    if (!announced) {
      ctx.progress(70, 'Ad playing — waiting for Skip…');
      announced = true;
    }

    let clicked = false;
    for (const sel of SKIP) {
      const btn = p.locator(sel).first();
      try {
        if (await btn.isVisible({ timeout: 400 })) {
          await btn.click({ timeout: 3000 });
          skipped++;
          clicked = true;
          ctx.progress(75, `Skipped the ad${skipped > 1 ? ` (${skipped})` : ''}…`);
          break;
        }
      } catch {
        /* not this selector, or it vanished mid-click */
      }
    }

    if (!clicked) {
      try {
        const byName = p.getByRole('button', { name: /skip( ad(s)?)?/i }).first();
        if (await byName.isVisible({ timeout: 400 })) {
          await byName.click({ timeout: 3000 });
          skipped++;
          clicked = true;
          ctx.progress(75, `Skipped the ad${skipped > 1 ? ` (${skipped})` : ''}…`);
        }
      } catch {
        /* Skip is not offered yet — unskippable ads simply have to run. */
      }
    }

    await p.waitForTimeout(clicked ? 900 : 1200);
  }

  return skipped;
}

/**
 * Searches YouTube and plays the first real video.
 *
 * The steps that matter, each of which failed on its own in testing:
 *   1. consent wall — blocks everything behind it
 *   2. pick a VIDEO, not a shelf: results include channels, playlists, ads and
 *      "People also watched" rows, and clicking one of those lands nowhere
 *   3. skip the pre-roll ads, so the song actually starts
 *   4. confirm playback, and start it if the player came up paused, rather
 *      than reporting success because a page loaded
 */
async function playYouTube(p: Page, query: string, ctx: ToolContext): Promise<Record<string, unknown>> {
  ctx.progress(10, 'Opening YouTube…');
  await p.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await dismissConsent(p);
  ctx.progress(35, 'Finding the video…');

  // A video result always carries a watch?v= link with a title id.
  const firstVideo = p.locator('a#video-title[href*="/watch"]').first();
  await firstVideo.waitFor({ state: 'visible', timeout: 30_000 });

  const title = (await firstVideo.getAttribute('title')) ?? (await firstVideo.innerText()).trim();

  ctx.progress(55, `Playing "${title}"…`);
  await firstVideo.scrollIntoViewIfNeeded();
  await firstVideo.click();

  // The watch page is a client-side navigation; wait for the player itself.
  await p.waitForSelector('video', { timeout: 45_000 });
  await p.waitForTimeout(1500);

  const adsSkipped = await skipAds(p, ctx);

  ctx.progress(85, 'Confirming playback…');

  /* This callback is serialised and run inside the page, so it is typed
     loosely here — the server's lib has no DOM. */
  const state = async (): Promise<{ paused: boolean; time: number; duration: number; muted: boolean } | null> =>
    p.evaluate(`(() => {
      const v = document.querySelector('video');
      if (!v) return null;
      return { paused: v.paused, time: v.currentTime, duration: v.duration, muted: v.muted };
    })()`);

  let s = await state();

  /* If it came up paused, press it. `k` is YouTube's play/pause shortcut and
     counts as a user gesture where a synthetic click on the video may not. */
  if (s?.paused) {
    await p.locator('body').press('k').catch(() => {});
    await p.waitForTimeout(1200);
    s = await state();
  }
  if (s?.paused) {
    await p.locator('button.ytp-play-button').click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(1200);
    s = await state();
  }

  // Playing means the clock is moving, not merely that a page loaded.
  const before = s?.time ?? 0;
  await p.waitForTimeout(1400);
  const after = (await state())?.time ?? 0;
  const playing = after > before;

  return {
    success: playing,
    action: 'play_youtube',
    title,
    url: p.url(),
    playing,
    position: Number(after.toFixed(1)),
    duration: s?.duration ? Number(s.duration.toFixed(0)) : undefined,
    ...(adsSkipped ? { adsSkipped } : {}),
    ...(playing
      ? {}
      : { note: 'The video opened but is not advancing. It may need a click in the window.' }),
  };
}

/* ─── DISPATCH ────────────────────────────────────────────────────── */

/**
 * Every action runs under a hard deadline.
 *
 * Playwright's own timeouts cover a single call, not a sequence of them, and a
 * page that never settles left one turn stuck for over six minutes with no
 * event and no way out except cancelling. A tool that can hang forever is a
 * broken tool however good its happy path is: better to return a failure the
 * model can report than to stall the conversation.
 */
const ACTION_DEADLINE_MS = Number(process.env.BROWSER_DEADLINE_MS ?? 150_000);

function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const bell = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The browser did not finish "${what}" within ${Math.round(ms / 1000)}s.`)),
      ms
    );
  });
  return Promise.race([work, bell]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export async function runBrowser(args: BrowserArgs, ctx: ToolContext): Promise<Record<string, unknown>> {
  try {
    return await withDeadline(runBrowserInner(args, ctx), ACTION_DEADLINE_MS, String(args.action));
  } catch (e) {
    const error = (e as Error).message;
    /* Leave nothing half-driving the machine, and make the next call start
       from a clean browser rather than a wedged one. */
    await closeBrowser();
    return { success: false, action: args.action, error };
  }
}

async function runBrowserInner(args: BrowserArgs, ctx: ToolContext): Promise<Record<string, unknown>> {
  const action = String(args.action ?? '').toLowerCase() as BrowserArgs['action'];

  if (action === 'close') {
    await closeBrowser();
    return { success: true, action, closed: true };
  }

  const p = await ensurePage(ctx.progress);

  // Cancelling the turn must not leave a browser driving itself.
  const onAbort = () => { void closeBrowser(); };
  ctx.signal.addEventListener('abort', onAbort, { once: true });

  try {
    switch (action) {
      case 'open': {
        if (!args.url) throw new Error('open needs a url.');
        const url = httpUrl(args.url);
        ctx.progress(30, `Opening ${url}…`);
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await dismissConsent(p);
        return { success: true, action, url: p.url(), title: await p.title() };
      }

      case 'play_youtube': {
        if (!args.query) throw new Error('play_youtube needs a query.');
        return await playYouTube(p, args.query, ctx);
      }

      case 'search': {
        if (!args.query) throw new Error('search needs a query.');
        ctx.progress(30, `Searching for ${args.query}…`);
        await p.goto(`https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await dismissConsent(p);
        const results = await p
          .locator('article h2, [data-testid="result-title-a"]')
          .allInnerTexts()
          .catch(() => [] as string[]);
        return {
          success: true,
          action,
          url: p.url(),
          results: results.slice(0, 8).map((r) => r.trim()).filter(Boolean),
        };
      }

      case 'click': {
        if (!args.target) throw new Error('click needs a target.');
        ctx.progress(40, `Clicking "${args.target}"…`);
        const name = args.target;
        /* Ordered by how specific the match is. A plain text match last, since
           it can hit a paragraph that merely mentions the word. */
        const candidates = [
          p.getByRole('button', { name, exact: false }).first(),
          p.getByRole('link', { name, exact: false }).first(),
          p.getByPlaceholder(name).first(),
          p.getByText(name, { exact: false }).first(),
        ];
        for (const c of candidates) {
          try {
            if (await c.isVisible({ timeout: 1200 })) {
              await c.scrollIntoViewIfNeeded();
              await c.click({ timeout: 5000 });
              await p.waitForTimeout(700);
              return { success: true, action, clicked: name, url: p.url() };
            }
          } catch {
            /* try the next strategy */
          }
        }
        return { success: false, action, error: `Nothing visible matching "${name}".` };
      }

      case 'type': {
        if (!args.text) throw new Error('type needs text.');
        ctx.progress(40, 'Typing…');
        const box = p
          .locator('input:visible, textarea:visible, [contenteditable="true"]:visible')
          .first();
        if (await box.count()) {
          await box.click();
          // Typed key by key so the page's own handlers fire, and so the user
          // can see it being written.
          // pressSequentially, not fill: the page's own key handlers have to
          // fire (search suggestions, validation), and the user sees it typed.
          await box.pressSequentially(args.text, { delay: 45 });
        } else {
          await p.keyboard.type(args.text, { delay: 45 });
        }
        return { success: true, action, typed: args.text };
      }

      case 'press': {
        const key = args.key || 'Enter';
        ctx.progress(50, `Pressing ${key}…`);
        await p.keyboard.press(key);
        await p.waitForTimeout(900);
        return { success: true, action, key, url: p.url() };
      }

      case 'scroll': {
        await p.mouse.wheel(0, 600);
        await p.waitForTimeout(400);
        return { success: true, action };
      }

      case 'read': {
        const text = await p.locator('body').innerText();
        return {
          success: true,
          action,
          url: p.url(),
          title: await p.title(),
          // Capped: a full page can blow the model's context window.
          text: text.replace(/\n{3,}/g, '\n\n').slice(0, 4000),
        };
      }

      default:
        return { success: false, error: `Unknown browser action "${action}".` };
    }
  } finally {
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

export const _internals = { httpUrl, dismissConsent };
