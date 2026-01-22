const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, args: any) => ipcRenderer.send(channel, args),
    on: (channel: string, func: any) => ipcRenderer.on(channel, (event: any, ...args: any[]) => func(...args)),
    once: (channel: string, func: any) => ipcRenderer.once(channel, (event: any, ...args: any[]) => func(...args)),
  },
});
