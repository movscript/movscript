import type { IpcRenderer } from 'electron'
import type { ElectronAPI, ElectronMediaPipelineTaskEvent } from '../../../src/shared/contracts/electronApi'

export function createMediaPipelineAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'saveMediaEditingProject' | 'getMediaEditingProject' | 'importMediaExportResource' | 'saveMediaExportLocal' | 'publishMediaHlsStream' | 'getMediaPipelineCapabilities' | 'getMediaPipelineFFmpegStatus' | 'renderMediaPipelineSingleClip' | 'renderMediaPipelineTimelineVideo' | 'analyzeMediaPipelineShotCuts' | 'createMediaPipelineTask' | 'getMediaPipelineTask' | 'cancelMediaPipelineTask' | 'getMediaPipelineTaskLogs' | 'onMediaPipelineTaskEvent'> {
  const taskEvents = createMessageSubscription<ElectronMediaPipelineTaskEvent>(ipcRenderer, 'media-pipeline:task-event')
  return {
    saveMediaEditingProject: (input) => ipcRenderer.invoke('media-pipeline:save-editing-project', input),
    getMediaEditingProject: (input) => ipcRenderer.invoke('media-pipeline:get-editing-project', input),
    importMediaExportResource: (input) => ipcRenderer.invoke('media-pipeline:import-export-resource', input),
    saveMediaExportLocal: (input) => ipcRenderer.invoke('media-pipeline:save-export-local', input),
    publishMediaHlsStream: (input) => ipcRenderer.invoke('media-pipeline:publish-hls-stream', input),
    getMediaPipelineCapabilities: () => ipcRenderer.invoke('media-pipeline:get-capabilities'),
    getMediaPipelineFFmpegStatus: () => ipcRenderer.invoke('media-pipeline:get-ffmpeg-status'),
    renderMediaPipelineSingleClip: (input) => ipcRenderer.invoke('media-pipeline:render-single-clip', input),
    renderMediaPipelineTimelineVideo: (input) => ipcRenderer.invoke('media-pipeline:render-timeline-video', input),
    analyzeMediaPipelineShotCuts: (input) => ipcRenderer.invoke('media-pipeline:analyze-shot-cuts', input),
    createMediaPipelineTask: (input) => ipcRenderer.invoke('media-pipeline:create-task', input),
    getMediaPipelineTask: (input) => ipcRenderer.invoke('media-pipeline:get-task', input),
    cancelMediaPipelineTask: (input) => ipcRenderer.invoke('media-pipeline:cancel-task', input),
    getMediaPipelineTaskLogs: (input) => ipcRenderer.invoke('media-pipeline:get-task-logs', input),
    onMediaPipelineTaskEvent: taskEvents.subscribe,
  }
}

function createMessageSubscription<TMessage>(ipcRenderer: IpcRenderer, channel: string): { subscribe: (handler: (message: TMessage) => void) => () => void } {
  const handlers = new Set<(message: TMessage) => void>()
  let installed = false
  const listener = (_event: unknown, message: TMessage) => {
    for (const handler of Array.from(handlers)) handler(message)
  }
  const ensureInstalled = () => {
    if (installed) return
    ipcRenderer.on(channel, listener)
    installed = true
  }
  const removeIfUnused = () => {
    if (!installed || handlers.size > 0) return
    ipcRenderer.removeListener(channel, listener)
    installed = false
  }
  return {
    subscribe: (handler) => {
      handlers.add(handler)
      ensureInstalled()
      return () => {
        handlers.delete(handler)
        removeIfUnused()
      }
    },
  }
}
