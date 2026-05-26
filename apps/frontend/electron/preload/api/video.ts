import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createVideoAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'clipVideo' | 'exportTimelineVideo' | 'getVideoClipStatus'> {
  return {
    clipVideo: (input) => ipcRenderer.invoke('video:clip', input),
    exportTimelineVideo: (input) => ipcRenderer.invoke('video:timeline-export', input),
    getVideoClipStatus: () => ipcRenderer.invoke('video:clip-status'),
  }
}
