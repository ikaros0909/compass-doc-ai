const { contextBridge, ipcRenderer } = require("electron");

/**
 * 렌더러(웹 UI)에서 사용 가능한 안전한 업데이트 API.
 * window.compassUpdater.onProgress(cb) 등으로 진행률을 구독한다.
 */
const channels = [
  "updater:checking",
  "updater:available",
  "updater:not-available",
  "updater:progress",
  "updater:downloaded",
  "updater:error",
];

contextBridge.exposeInMainWorld("compassUpdater", {
  on: (event, listener) => {
    const channel = `updater:${event}`;
    if (!channels.includes(channel)) return () => {};
    const wrapped = (_e, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  checkNow: () => ipcRenderer.invoke("updater:check"),
  quitAndInstall: () => ipcRenderer.invoke("updater:quit-and-install"),
});
