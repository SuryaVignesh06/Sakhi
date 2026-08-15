const { app, BrowserWindow, ipcMain, screen, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

/**
 * The desktop shell.
 *
 * One launch brings up everything: the API server, the renderer, and the
 * window — in that order, so the UI never paints against a backend that is not
 * listening yet.
 *
 * This used to spawn `src/backend/server.ts` on port 3001, which no longer
 * exists. The real backend is `server/` on 3007, and nothing started it, so
 * every API call from the packaged app failed.
 */

/* `require('electron')` yields the binary's PATH (a string) instead of the API
   when the process is running as plain Node. That happens whenever
   ELECTRON_RUN_AS_NODE is set in the environment, and the resulting
   "Cannot read properties of undefined (reading 'whenReady')" says nothing
   about the cause. */
if (!app || typeof app.whenReady !== 'function') {
  console.error(
    'This must run under Electron, not Node.\n' +
      (process.env.ELECTRON_RUN_AS_NODE
        ? 'ELECTRON_RUN_AS_NODE is set in your environment — unset it and retry.\n'
        : '') +
      'Use: npm start'
  );
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

const BACKEND_PORT = Number(process.env.PORT || 3007);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);

/** Dev when asked (`electron . --dev`), or when there is no build to load. */
const DEV =
  process.argv.includes('--dev') ||
  process.env.FF_DEV === '1' ||
  !fs.existsSync(DIST_INDEX);

const children = [];
const isWin = process.platform === 'win32';

function log(...a) {
  console.log('[Sakhi]', ...a);
}

/** Pipes a child's output through with a tag, so one console shows everything. */
function track(name, child) {
  if (!child) return null;
  children.push({ name, child });
  child.stdout?.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  child.on('error', (e) => console.error(`[${name}] failed to start:`, e.message));
  child.on('exit', (code) => log(`${name} exited (${code})`));
  return child;
}

function npm(args, cwd) {
  return spawn(isWin ? 'npm.cmd' : 'npm', args, {
    cwd,
    shell: isWin,
    env: { ...process.env },
  });
}

/**
 * Resolves once the port answers, or rejects after `timeoutMs`.
 *
 * The host is `localhost`, not `127.0.0.1`: Vite binds to ::1 only, so an
 * IPv4-literal probe never connects and the wait times out against a server
 * that is in fact listening. `autoSelectFamily` tries both stacks.
 */
function waitForPort(port, pathname, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: 'localhost', port, path: pathname, timeout: 1500, autoSelectFamily: true },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`:${port} did not come up in ${timeoutMs}ms`));
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

function startBackend() {
  const built = path.join(SERVER_DIR, 'dist', 'index.js');

  if (!DEV && fs.existsSync(built)) {
    log('starting backend (compiled)');
    return track('server', spawn(process.execPath, [built], {
      cwd: SERVER_DIR,
      // ELECTRON_RUN_AS_NODE makes the bundled Electron binary behave as plain
      // Node, so a packaged app needs no separate Node install.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(BACKEND_PORT) },
    }));
  }

  log('starting backend (tsx watch)');
  return track('server', npm(['run', 'dev'], SERVER_DIR));
}

function startRenderer() {
  if (!DEV) return null;
  log('starting Vite');
  return track('vite', npm(['run', 'dev'], ROOT));
}

/** Opt-in: the legacy Python agent is not part of this pipeline. */
function startPythonAgent() {
  if (process.env.FF_PYTHON !== '1') return null;
  const venv = path.join(ROOT, 'Mark-XXXIX-OR', '.venv', 'Scripts', 'python.exe');
  const script = path.join(ROOT, 'Mark-XXXIX-OR', 'main.py');
  if (!fs.existsSync(script)) return null;
  return track('python', spawn(fs.existsSync(venv) ? venv : 'python', [script, '--headless'], {
    cwd: path.join(ROOT, 'Mark-XXXIX-OR'),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    shell: isWin,
  }));
}


/* ─── FLOATING DESKTOP WIDGET ─────────────────────────────────────────
   A small frameless, transparent, always-on-top window holding just the orb
   and a live transcript strip. It is what lets the assistant stay visible
   over whatever app it was asked to open, instead of the main window having
   to keep focus. */
let widget = null;

function createWidget() {
  if (widget && !widget.isDestroyed()) return widget;

  const { workArea } = screen.getPrimaryDisplay();
  const W = 380;
  const H = 300;
  const M = 24;

  widget = new BrowserWindow({
    width: W,
    height: H,
    // Bottom-right of the WORK area, so it never sits under the taskbar.
    x: workArea.x + workArea.width - W - M,
    y: workArea.y + workArea.height - H - M,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // "screen-saver" keeps it above full-screen apps, which "floating" does not.
  widget.setAlwaysOnTop(true, 'screen-saver');
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const q = 'widget=1';
  if (DEV) widget.loadURL(`http://localhost:${VITE_PORT}?${q}`);
  else widget.loadFile(DIST_INDEX, { search: q });

  widget.once('ready-to-show', () => widget.showInactive());
  widget.on('closed', () => { widget = null; });
  return widget;
}

ipcMain.handle('widget:show', () => {
  const w = createWidget();
  if (!w.isVisible()) w.showInactive();
  return true;
});

ipcMain.handle('widget:hide', () => {
  if (widget && !widget.isDestroyed()) widget.hide();
  return true;
});

ipcMain.handle('widget:is', (e) =>
  Boolean(widget && !widget.isDestroyed() && e.sender.id === widget.webContents.id)
);

ipcMain.on('widget:update', (_e, state) => {
  if (widget && !widget.isDestroyed()) widget.webContents.send('widget:state', state);
});

function createWindow(backendUp) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Sakhi',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the real browser, not inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV) {
    win.loadURL(`http://localhost:${VITE_PORT}`);
  } else {
    win.loadFile(DIST_INDEX);
  }

  if (!backendUp) {
    log('WARNING: the backend never answered; the UI will show it as disconnected');
  }
  return win;
}

/**
 * The wake word needs the microphone, and Electron denies device access by
 * default — which is why "Hey Feter" could never trigger inside the app even
 * though it worked in a browser tab.
 */
function grantMediaPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'audioCapture', 'mediaKeySystem', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });

  ses.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'audioCapture', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)
  );
}

app.whenReady().then(async () => {
  grantMediaPermissions();

  const alreadyUp = await new Promise((res) => {
    const req = http.get(
      { host: 'localhost', port: BACKEND_PORT, path: '/api/health', timeout: 600, autoSelectFamily: true },
      (r) => { r.resume(); res(true); }
    );
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });

  if (!alreadyUp) {
    startBackend();
  } else {
    log(`backend already running on :${BACKEND_PORT}`);
  }

  startRenderer();
  startPythonAgent();

  const backendUp = await waitForPort(BACKEND_PORT, '/api/health').then(
    () => { log(`backend ready on :${BACKEND_PORT}`); return true; },
    (e) => { console.error('[Sakhi]', e.message); return false; }
  );

  if (DEV) {
    // Vite is quick, but the window must not load before it is listening or
    // Electron shows its own error page and does not retry.
    await waitForPort(VITE_PORT, '/', 30_000).catch((e) => console.error('[Sakhi]', e.message));
  }

  createWindow(backendUp);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(backendUp);
  });
});

/**
 * Kills the children as a process TREE, synchronously.
 *
 * Both details matter. `npm run dev` is a cmd.exe wrapper whose real work is a
 * grandchild, so killing the direct pid leaves tsx and Vite holding :3007 and
 * :5173 — the next launch then fails on a port that nothing appears to own.
 * And an async spawn during shutdown never gets to run: the quit completes
 * first and the kill is lost. spawnSync finishes before quit continues.
 */
let stopped = false;
function stopChildren() {
  if (stopped) return;
  stopped = true;

  for (const { name, child } of children) {
    if (!child || child.exitCode !== null) continue;
    try {
      if (isWin) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch (e) {
      log(`could not stop ${name}: ${e.message}`);
    }
  }
  children.length = 0;
}

app.on('before-quit', stopChildren);
app.on('will-quit', stopChildren);
process.on('exit', stopChildren);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
