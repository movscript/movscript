import { appendFile, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

import type { MediaPipelineTaskRequest, MediaPipelineTaskState } from './types'
import { stableMediaWorkspacePathPart } from './pathPart'

export interface MediaWorkspacePaths {
  root: string
  projectRoot: string
  cacheResources: string
  cacheProbes: string
  taskRoot: string
  taskInputs: string
  taskTemp: string
  taskOutputs: string
  taskLogs: string
  taskManifest: string
  exportsRoot: string
}

export function mediaWorkspaceProjectRoot(input: {
  userDataDir: string
  projectId: string
}): string {
  return join(input.userDataDir, 'media-workspaces', stableMediaWorkspacePathPart(input.projectId))
}

export function legacyMediaWorkspaceProjectRoot(input: {
  userDataDir: string
  projectId: string
}): string {
  return join(input.userDataDir, 'media-workspaces', legacySanitizedPathPart(input.projectId))
}

export function mediaWorkspaceTaskRoot(input: {
  userDataDir: string
  projectId: string
  taskId: string
}): string {
  return join(mediaWorkspaceProjectRoot(input), 'tasks', stableMediaWorkspacePathPart(input.taskId))
}

export function legacyMediaWorkspaceTaskRoot(input: {
  userDataDir: string
  projectId: string
  taskId: string
}): string {
  return join(legacyMediaWorkspaceProjectRoot(input), 'tasks', legacySanitizedPathPart(input.taskId))
}

export async function prepareMediaWorkspace(input: {
  userDataDir: string
  projectId: string
  taskId: string
}): Promise<MediaWorkspacePaths> {
  const root = join(input.userDataDir, 'media-workspaces')
  const projectRoot = mediaWorkspaceProjectRoot(input)
  const taskRoot = mediaWorkspaceTaskRoot(input)
  const paths: MediaWorkspacePaths = {
    root,
    projectRoot,
    cacheResources: join(projectRoot, 'cache', 'resources'),
    cacheProbes: join(projectRoot, 'cache', 'probes'),
    taskRoot,
    taskInputs: join(taskRoot, 'inputs'),
    taskTemp: join(taskRoot, 'temp'),
    taskOutputs: join(taskRoot, 'outputs'),
    taskLogs: join(taskRoot, 'logs'),
    taskManifest: join(taskRoot, 'manifest.json'),
    exportsRoot: join(projectRoot, 'exports'),
  }
  await Promise.all([
    mkdir(paths.cacheResources, { recursive: true }),
    mkdir(paths.cacheProbes, { recursive: true }),
    mkdir(paths.taskInputs, { recursive: true }),
    mkdir(paths.taskTemp, { recursive: true }),
    mkdir(paths.taskOutputs, { recursive: true }),
    mkdir(paths.taskLogs, { recursive: true }),
    mkdir(paths.exportsRoot, { recursive: true }),
  ])
  return paths
}

export async function writeTaskManifest(input: {
  manifestPath: string
  request: MediaPipelineTaskRequest
  state: MediaPipelineTaskState
}): Promise<void> {
  await writeFile(input.manifestPath, `${JSON.stringify({
    schema: 'movscript.media_pipeline_task.v1',
    request: input.request,
    state: input.state,
  }, null, 2)}\n`)
}

export async function appendTaskEventLog(input: {
  workspace: Pick<MediaWorkspacePaths, 'taskLogs'>
  event: Record<string, unknown>
}): Promise<string> {
  const logPath = taskEventLogPath(input.workspace)
  await appendFile(logPath, `${JSON.stringify({
    at: new Date().toISOString(),
    ...input.event,
  })}\n`)
  return logPath
}

export async function readTaskEventLogs(input: {
  workspacePath: string
}): Promise<{ logPath: string; logs: string[]; text: string }> {
  const logPath = join(input.workspacePath, 'logs', 'events.jsonl')
  const text = await readFile(logPath, 'utf8').catch(() => '')
  const logs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return { logPath, logs, text }
}

function taskEventLogPath(workspace: Pick<MediaWorkspacePaths, 'taskLogs'>): string {
  return join(workspace.taskLogs, 'events.jsonl')
}

function legacySanitizedPathPart(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'default'
}
