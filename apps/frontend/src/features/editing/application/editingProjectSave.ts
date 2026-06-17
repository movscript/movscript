import type { ElectronAPI } from '@/shared/contracts/electronApi'
import type {
  ElectronMediaEditingProjectSaveResult,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

type EditingProjectSaveAPI = Pick<ElectronAPI, 'saveMediaEditingProject'>

export type EditingProjectSaveOutcome =
  | {
    status: 'saved'
    editingProject: ElectronMediaPipelineEditingProject
    projectPath?: string
    nativeResult?: ElectronMediaEditingProjectSaveResult
    updatedAt: string
  }
  | {
    status: 'conflict'
    result: Extract<ElectronMediaEditingProjectSaveResult, { status: 'conflict' }>
  }

export async function saveEditingProjectSnapshot(input: {
  project: ElectronMediaPipelineEditingProject
  mediaAPI?: EditingProjectSaveAPI | null
  now?: () => string
  onAttempt?: (project: ElectronMediaPipelineEditingProject) => void
}): Promise<EditingProjectSaveOutcome> {
  const now = input.now ?? (() => new Date().toISOString())
  const updatedAt = now()
  let expectedRevision = input.project.revision
  let nextProject = withNextRevision(input.project, updatedAt, (input.project.revision ?? 0) + 1)
  input.onAttempt?.(nextProject)
  let result = input.mediaAPI?.saveMediaEditingProject
    ? await input.mediaAPI.saveMediaEditingProject({ editingProject: nextProject, expectedRevision })
    : undefined

  if (result?.status === 'conflict') {
    const currentProject = result.editingProject ?? result.editing_project
    const currentRevision = result.currentRevision ?? result.current_revision ?? currentProject?.revision
    const localRevision = input.project.revision
    if (typeof currentRevision === 'number' && typeof localRevision === 'number' && currentRevision < localRevision && input.mediaAPI?.saveMediaEditingProject) {
      expectedRevision = currentRevision
      nextProject = withNextRevision(input.project, now(), currentRevision + 1)
      input.onAttempt?.(nextProject)
      result = await input.mediaAPI.saveMediaEditingProject({ editingProject: nextProject, expectedRevision })
    }
  }

  if (result?.status === 'conflict') {
    return { status: 'conflict', result }
  }

  return {
    status: 'saved',
    editingProject: result?.editingProject ?? result?.editing_project ?? nextProject,
    projectPath: result?.projectPath ?? result?.project_path,
    nativeResult: result,
    updatedAt,
  }
}

function withNextRevision(
  project: ElectronMediaPipelineEditingProject,
  updatedAt: string,
  revision: number,
): ElectronMediaPipelineEditingProject {
  return {
    ...project,
    updatedAt,
    revision,
  }
}
