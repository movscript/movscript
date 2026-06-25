import { readFile } from 'fs/promises'
import { basename, dirname, join } from 'path'

import type {
  MediaPipelineTaskEvent,
  MediaPipelineTaskLogs,
  MediaPipelineTaskRequest,
  MediaPipelineTaskState,
} from './types'
import {
  appendTaskEventLog,
  legacyMediaWorkspaceTaskRoot,
  mediaWorkspaceTaskRoot,
  readTaskEventLogs,
  type MediaWorkspacePaths,
} from './workspace'

export interface MediaPipelineTaskRun {
  abortController: AbortController
  request: MediaPipelineTaskRequest
  workspace: MediaWorkspacePaths
  promise: Promise<void>
}

export interface StoredMediaPipelineTaskManifest {
  request?: MediaPipelineTaskRequest
  state: MediaPipelineTaskState
}

const tasks = new Map<string, MediaPipelineTaskState>()
const taskEventListeners = new Set<(event: MediaPipelineTaskEvent) => void>()
const taskRuns = new Map<string, MediaPipelineTaskRun>()

export function onMediaPipelineTaskEvent(listener: (event: MediaPipelineTaskEvent) => void): () => void {
  taskEventListeners.add(listener)
  return () => {
    taskEventListeners.delete(listener)
  }
}

export function setMediaPipelineTaskState(state: MediaPipelineTaskState): MediaPipelineTaskState {
  tasks.set(state.taskId, state)
  return structuredClone(state)
}

export function getMediaPipelineTask(taskId: string): MediaPipelineTaskState | undefined {
  const state = tasks.get(taskId)
  return state ? structuredClone(state) : undefined
}

export function updateMediaPipelineTask(taskId: string, patch: Partial<MediaPipelineTaskState>): MediaPipelineTaskState {
  const current = tasks.get(taskId)
  if (!current) throw new Error(`Media pipeline task not found: ${taskId}`)
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  tasks.set(taskId, next)
  return structuredClone(next)
}

export function getRequiredMediaPipelineTask(taskId: string): MediaPipelineTaskState {
  const state = tasks.get(taskId)
  if (!state) throw new Error(`Media pipeline task not found: ${taskId}`)
  return structuredClone(state)
}

export function setMediaPipelineTaskRun(taskId: string, run: MediaPipelineTaskRun): void {
  taskRuns.set(taskId, run)
}

export function getMediaPipelineTaskRun(taskId: string): MediaPipelineTaskRun | undefined {
  return taskRuns.get(taskId)
}

export function deleteMediaPipelineTaskRun(taskId: string): void {
  taskRuns.delete(taskId)
}

export async function getStoredMediaPipelineTask(
  input: { projectId: string; taskId: string },
  options: { homeDir: string },
): Promise<MediaPipelineTaskState | undefined> {
  const manifest = await readStoredTaskManifestForIdentity(input, options)
  const state = manifest?.state
  if (!state) return undefined
  tasks.set(input.taskId, state)
  return structuredClone(state)
}

export async function readStoredTaskManifestForIdentity(
  input: { projectId: string; taskId: string },
  options: { homeDir: string },
): Promise<StoredMediaPipelineTaskManifest | undefined> {
  const manifest = await readTaskManifest(mediaWorkspaceTaskRoot({
    homeDir: options.homeDir,
    projectId: input.projectId,
    taskId: input.taskId,
  })) ?? await readTaskManifest(legacyMediaWorkspaceTaskRoot({
    homeDir: options.homeDir,
    projectId: input.projectId,
    taskId: input.taskId,
  }))
  if (!manifest) return undefined
  if (manifest.state.projectId !== input.projectId || manifest.state.taskId !== input.taskId) {
    throw new Error(`Media pipeline task identity mismatch: ${manifest.state.manifestPath ?? input.taskId}`)
  }
  return manifest
}

export async function getMediaPipelineTaskLogs(
  taskId: string,
  options?: { projectId?: string; homeDir?: string },
): Promise<MediaPipelineTaskLogs> {
  const state = tasks.get(taskId)
    ?? (options?.projectId && options.homeDir
      ? await getStoredMediaPipelineTask({ projectId: options.projectId, taskId }, { homeDir: options.homeDir })
      : undefined)
  if (!state?.workspacePath) {
    return {
      status: 'not_found',
      taskId,
    }
  }
  const logs = await readTaskEventLogs({ workspacePath: state.workspacePath })
  return {
    status: 'ok',
    taskId,
    logPath: logs.logPath,
    logs: logs.logs,
    text: logs.text,
  }
}

export async function appendTaskLog(workspace: MediaWorkspacePaths, event: Record<string, unknown>): Promise<void> {
  const taskEvent = normalizeTaskEvent(workspace, event)
  await appendTaskEventLog({ workspace, event: taskEvent }).catch(() => undefined)
  emitTaskEvent(taskEvent)
}

export async function appendTaskLogForState(state: MediaPipelineTaskState, event: Record<string, unknown>): Promise<void> {
  if (!state.workspacePath) return
  const workspace = {
    taskRoot: state.workspacePath,
    taskLogs: join(state.workspacePath, 'logs'),
  }
  const taskEvent = normalizeTaskEvent(workspace, event)
  await appendTaskEventLog({ workspace, event: taskEvent }).catch(() => undefined)
  emitTaskEvent(taskEvent)
}

async function readTaskManifest(taskRoot: string): Promise<StoredMediaPipelineTaskManifest | undefined> {
  const manifestPath = join(taskRoot, 'manifest.json')
  const text = await readFile(manifestPath, 'utf8').catch((error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  })
  if (!text) return undefined
  const parsed = JSON.parse(text) as { request?: MediaPipelineTaskRequest; state?: MediaPipelineTaskState }
  if (!parsed.state || typeof parsed.state !== 'object') throw new Error(`Invalid media pipeline task manifest: ${manifestPath}`)
  return {
    request: parsed.request,
    state: {
      ...parsed.state,
      workspacePath: parsed.state.workspacePath ?? taskRoot,
      manifestPath: parsed.state.manifestPath ?? manifestPath,
    },
  }
}

function normalizeTaskEvent(
  workspace: Pick<MediaWorkspacePaths, 'taskLogs'> & Partial<Pick<MediaWorkspacePaths, 'taskRoot'>>,
  event: Record<string, unknown>,
): MediaPipelineTaskEvent {
  const state = isTaskState(event.state) ? event.state : undefined
  const taskId = typeof event.taskId === 'string'
    ? event.taskId
    : state?.taskId ?? workspaceTaskId(workspace)
  const name = typeof event.event === 'string' ? event.event : 'task.event'
  return {
    at: typeof event.at === 'string' ? event.at : new Date().toISOString(),
    taskId,
    ...event,
    event: name,
  } as MediaPipelineTaskEvent
}

function workspaceTaskId(workspace: Pick<MediaWorkspacePaths, 'taskLogs'> & Partial<Pick<MediaWorkspacePaths, 'taskRoot'>>): string {
  if (workspace.taskRoot) return basename(workspace.taskRoot)
  return basename(dirname(workspace.taskLogs))
}

function isTaskState(value: unknown): value is MediaPipelineTaskState {
  return Boolean(value && typeof value === 'object' && typeof (value as { taskId?: unknown }).taskId === 'string')
}

function emitTaskEvent(event: MediaPipelineTaskEvent): void {
  for (const listener of Array.from(taskEventListeners)) {
    try {
      listener(structuredClone(event))
    } catch {
      // Task execution should not fail because a UI event listener failed.
    }
  }
}
