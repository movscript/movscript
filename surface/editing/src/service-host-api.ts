import {
  EditingServiceClient,
  MediaPipelineServiceClient,
  type EditingMediaPipelineTaskRequest,
  type EditingMediaPipelineTaskState,
} from '@movscript/editing/browser'
import type { ElectronAPI } from './host-api'
import type {
  ElectronMediaEditingProjectEvent,
  ElectronMediaPipelineTaskEvent,
  ElectronMediaPipelineTaskState,
} from './contracts'

export interface LocalEditingMediaAPIInput {
  daemonGatewayBaseURL: string
}

export function createLocalEditingMediaAPI(input: LocalEditingMediaAPIInput): ElectronAPI {
  const editingService = new EditingServiceClient({ baseUrl: input.daemonGatewayBaseURL })
  const mediaPipeline = new MediaPipelineServiceClient({ baseUrl: input.daemonGatewayBaseURL })
  const taskListeners = new Set<(event: ElectronMediaPipelineTaskEvent) => void>()
  const projectListeners = new Set<(event: ElectronMediaEditingProjectEvent) => void>()
  const activeTaskPollers = new Map<string, number>()

  function emitTask(state: EditingMediaPipelineTaskState): void {
    const event: ElectronMediaPipelineTaskEvent = {
      at: new Date().toISOString(),
      taskId: state.taskId,
      event: state.status,
      state: state as ElectronMediaPipelineTaskState,
    }
    taskListeners.forEach((listener) => listener(event))
  }

  function startTaskPolling(initial: EditingMediaPipelineTaskState): void {
    emitTask(initial)
    if (isTerminalTask(initial.status) || activeTaskPollers.has(initial.taskId)) return
    const interval = window.setInterval(async () => {
      try {
        const result = await mediaPipeline.taskAction({
          action: 'getTask',
          taskId: initial.taskId,
          options: { projectId: initial.projectId },
        })
        if (result.task) {
          emitTask(result.task)
          if (isTerminalTask(result.task.status)) {
            window.clearInterval(interval)
            activeTaskPollers.delete(initial.taskId)
          }
        }
      } catch {
        window.clearInterval(interval)
        activeTaskPollers.delete(initial.taskId)
      }
    }, 1000)
    activeTaskPollers.set(initial.taskId, interval)
  }

  return {
    openFile: async () => {
      const picked = await pickLocalSurfaceFile()
      if (picked) return picked
      const value = window.prompt('输入本机媒体文件路径')
      return value?.trim() || null
    },
    revealFileInFolder: async () => ({ ok: true }),
    saveMediaEditingProject: async (request) => {
      const result = await editingService.projectCommand({
        command: 'saveProject',
        input: {
          editingProject: request.editingProject ?? request.editing_project,
          expectedRevision: request.expectedRevision ?? request.expected_revision,
        },
      })
      const payload = result.result as Awaited<ReturnType<NonNullable<ElectronAPI['saveMediaEditingProject']>>>
      if (payload.status === 'ok') {
        const project = payload.editingProject ?? payload.editing_project
        if (project) {
          const event: ElectronMediaEditingProjectEvent = {
            type: 'saved',
            projectId: project.projectId,
            project_id: project.projectId,
            editingProjectId: project.id,
            editing_project_id: project.id,
            revision: project.revision,
            editingProject: project,
            editing_project: project,
            projectPath: payload.projectPath ?? payload.project_path ?? '',
            project_path: payload.projectPath ?? payload.project_path ?? '',
          }
          projectListeners.forEach((listener) => listener(event))
        }
      }
      return payload
    },
    getMediaEditingProject: async (request) => {
      const result = await editingService.projectCommand({
        command: 'getProject',
        input: {
          projectId: request.projectId ?? request.project_id,
          editingProjectId: request.editingProjectId ?? request.editing_project_id,
        },
      })
      return result.result as Awaited<ReturnType<NonNullable<ElectronAPI['getMediaEditingProject']>>>
    },
    listMediaEditingProjects: async () => {
      const result = await editingService.projectCommand({
        command: 'listProjects',
        input: {},
      })
      return result.result as Awaited<ReturnType<NonNullable<ElectronAPI['listMediaEditingProjects']>>>
    },
    deleteMediaEditingProject: async (request) => {
      const result = await editingService.projectCommand({
        command: 'deleteProject',
        input: {
          projectId: request.projectId ?? request.project_id,
          editingProjectId: request.editingProjectId ?? request.editing_project_id,
        },
      })
      return result.result as Awaited<ReturnType<NonNullable<ElectronAPI['deleteMediaEditingProject']>>>
    },
    createMediaPipelineTask: async (request) => {
      const taskRequest = await editingService.taskRequest({
        taskType: request.taskType,
        input: {
          editing_project: request.editingProject,
          editingProject: request.editingProject,
          timeline: request.timeline,
          source: request.source,
          target: request.target,
          mode: request.mode,
          reframe: request.reframe,
          transcode: request.transcode,
          resourceCache: request.resourceCache ?? request.resource_cache,
          resourceDownload: request.resourceDownload ?? request.resource_download,
          output: request.output,
        },
      })
      const created = await mediaPipeline.createTask({
        request: taskRequest.request as unknown as EditingMediaPipelineTaskRequest,
      })
      startTaskPolling(created.task)
      return created.task as ElectronMediaPipelineTaskState
    },
    getMediaPipelineTask: async (request) => {
      const taskId = request.taskId ?? request.task_id
      if (!taskId) return null
      const result = await mediaPipeline.taskAction({
        action: 'getTask',
        taskId,
        options: { projectId: request.projectId ?? request.project_id },
      })
      return result.task as ElectronMediaPipelineTaskState | null
    },
    onMediaPipelineTaskEvent: (handler) => {
      taskListeners.add(handler)
      return () => taskListeners.delete(handler)
    },
    onMediaEditingProjectEvent: (handler) => {
      projectListeners.add(handler)
      return () => projectListeners.delete(handler)
    },
  }
}

async function pickLocalSurfaceFile(): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const file = await selectBrowserFile()
  if (!file) return null
  const response = await fetch(`/v1/host/editing/import-file?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`local surface file import failed: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json() as { localPath?: unknown; local_path?: unknown }
  const localPath = typeof payload.localPath === 'string'
    ? payload.localPath
    : typeof payload.local_path === 'string'
      ? payload.local_path
      : ''
  return localPath.trim() || null
}

function selectBrowserFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    let settled = false
    let focusTimer: number | undefined
    const settle = (file: File | null) => {
      if (settled) return
      settled = true
      if (focusTimer !== undefined) window.clearTimeout(focusTimer)
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve(file)
    }
    const handleFocus = () => {
      if (settled) return
      focusTimer = window.setTimeout(() => {
        if (!input.files?.length) settle(null)
      }, 500)
    }
    input.type = 'file'
    input.accept = 'video/*,audio/*,image/*,.srt,.vtt,.ass,.ssa,.txt,.md'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.top = '0'
    input.addEventListener('change', () => settle(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => settle(null), { once: true })
    document.body.append(input)
    window.setTimeout(() => window.addEventListener('focus', handleFocus), 0)
    input.click()
  })
}

function isTerminalTask(status: EditingMediaPipelineTaskState['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled'
}
