import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import DesktopWidget from './DesktopWidget';
import './index.css';
/* Last, deliberately. Vite emits CSS in import order, so this is the sheet
   that wins ties — which is what lets it undo the older `!important` rules in
   ChatView.css that pinned answer text to white and broke light mode. */
import './markdown.css';

/**
 * One bundle, two windows.
 *
 * The main process opens the floating widget with `?widget=1`, and that flag
 * is the only thing separating the two entry points — the widget must not
 * mount the whole app shell, or it would run a second event stream, a second
 * voice loop, and a second copy of every background poller.
 */
const isWidget = new URLSearchParams(window.location.search).has('widget');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isWidget ? <DesktopWidget /> : <App />}
  </React.StrictMode>
);
