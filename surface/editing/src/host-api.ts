import type {
  ElectronMediaEditingProjectDeleteResult,
  ElectronMediaEditingProjectEvent,
  ElectronMediaEditingProjectGetResult,
  ElectronMediaEditingProjectListResult,
  ElectronMediaEditingProjectSaveResult,
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskEvent,
  ElectronMediaPipelineTaskRequest,
  ElectronMediaPipelineTaskState,
} from './contracts'

export interface ElectronDesktopStateInput {
  key: string
}

export interface ElectronDesktopStateResult {
  key: string
  value?: string
}

export interface ElectronDesktopStateSaveInput {
  key: string
  value: string
}

export interface ElectronOpenEditingProjectWindowInput {
  editingProjectId: string
  title?: string
  route?: string
}

export interface ElectronAPI {
  openFile?: () => Promise<string | null>
  revealFileInFolder?: (input: { path: string }) => Promise<{ ok: true }>
  openEditingProjectWindow?: (input: ElectronOpenEditingProjectWindowInput) => Promise<unknown>
  getDesktopState?: (input: ElectronDesktopStateInput) => Promise<ElectronDesktopStateResult>
  setDesktopState?: (input: ElectronDesktopStateSaveInput) => Promise<{ ok: true }>
  saveMediaEditingProject?: (input: {
    editingProject?: ElectronMediaPipelineEditingProject
    editing_project?: ElectronMediaPipelineEditingProject
    expectedRevision?: number
    expected_revision?: number
  }) => Promise<ElectronMediaEditingProjectSaveResult>
  getMediaEditingProject?: (input: {
    projectId?: string
    project_id?: string
    editingProjectId?: string
    editing_project_id?: string
  }) => Promise<ElectronMediaEditingProjectGetResult>
  listMediaEditingProjects?: () => Promise<ElectronMediaEditingProjectListResult>
  deleteMediaEditingProject?: (input: {
    projectId?: string
    project_id?: string
    editingProjectId?: string
    editing_project_id?: string
  }) => Promise<ElectronMediaEditingProjectDeleteResult>
  createMediaPipelineTask?: (input: ElectronMediaPipelineTaskRequest) => Promise<ElectronMediaPipelineTaskState>
  getMediaPipelineTask?: (input: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => Promise<ElectronMediaPipelineTaskState | null>
  onMediaPipelineTaskEvent?: (handler: (event: ElectronMediaPipelineTaskEvent) => void) => () => void
  onMediaEditingProjectEvent?: (handler: (event: ElectronMediaEditingProjectEvent) => void) => () => void
}

export type EditingHostApi = ElectronAPI
export type EditingHostStateInput = ElectronDesktopStateInput
export type EditingHostStateResult = ElectronDesktopStateResult
export type EditingHostStateSaveInput = ElectronDesktopStateSaveInput
export type EditingHostOpenProjectWindowInput = ElectronOpenEditingProjectWindowInput

export function readEditingHostApi(): EditingHostApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: EditingHostApi }).api
}
