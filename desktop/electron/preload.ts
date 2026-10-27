// desktop/electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  getVersion: (): Promise<string> => ipcRenderer.invoke('desktop:version'),
  signIn: () => ipcRenderer.invoke('desktop:sign-in'),
});
