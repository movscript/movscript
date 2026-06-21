import type {
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'
import {
  createMediaEditingProjectService,
  type MediaEditingProject,
  type MediaEditingProjectServiceOptions,
  type MediaTimelineCommand,
} from '@movscript/editing'

function mediaProjectForService(project: ElectronMediaPipelineEditingProject): MediaEditingProject {
  const now = new Date().toISOString()
  return {
    ...project,
    source: project.source ?? { kind: 'manual' },
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now,
    revision: project.revision ?? 0,
  } as unknown as MediaEditingProject
}

export function applyTimelineCommands(
  project: ElectronMediaPipelineEditingProject,
  commands: MediaTimelineCommand[],
  options?: MediaEditingProjectServiceOptions,
): ElectronMediaPipelineEditingProject {
  const service = createMediaEditingProjectService(mediaProjectForService(project), options)
  let nextProject = service.getProject()
  for (const command of commands) {
    nextProject = service.applyCommand(command)
  }
  return nextProject as unknown as ElectronMediaPipelineEditingProject
}
