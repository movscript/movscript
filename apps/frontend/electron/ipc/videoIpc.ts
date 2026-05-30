import { ipcMain } from 'electron'
import {
  analyzeShotCuts,
  clipVideo,
  exportVideoTimeline,
  getVideoClipStatus,
  type VideoClipInput,
  type VideoShotCutInput,
  type VideoTimelineExportInput,
} from '../services/videoClip'

export function registerVideoIpcHandlers(): void {
  ipcMain.handle('video:clip', async (_e, input: VideoClipInput) => {
    return clipVideo({ ...input, sourcePath: undefined })
  })

  ipcMain.handle('video:timeline-export', async (_e, input: VideoTimelineExportInput) => {
    return exportVideoTimeline(input)
  })

  ipcMain.handle('video:clip-status', async () => {
    return getVideoClipStatus()
  })

  ipcMain.handle('video:shot-cuts', async (_e, input: VideoShotCutInput) => {
    return analyzeShotCuts(input)
  })
}
