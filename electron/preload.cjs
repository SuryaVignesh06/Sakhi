const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the renderer and the main process.
 *
 * Deliberately narrow: it exposes named commands, never `ipcRenderer` itself,
 * so a compromised page cannot reach arbitrary channels. The app previously
 * had no preload at all, which is why nothing in the UI could ask for a
 * desktop-level window.
 */
contextBridge.exposeInMainWorld('sakhi', {
  /** Show the floating desktop widget in a screen corner. */
  showWidget: () => ipcRenderer.invoke('widget:show'),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  /** Push the current call state into the widget. */
  updateWidget: (state) => ipcRenderer.send('widget:update', state),
  /** The widget subscribes to those updates. */
  onWidgetState: (fn) => {
    const h = (_e, s) => fn(s);
    ipcRenderer.on('widget:state', h);
    return () => ipcRenderer.removeListener('widget:state', h);
  },
  /** True only inside the widget window. */
  isWidget: () => ipcRenderer.invoke('widget:is'),
});
