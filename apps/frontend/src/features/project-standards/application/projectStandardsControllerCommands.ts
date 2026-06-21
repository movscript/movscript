import { getProject } from '@/shared/infrastructure/api/semanticEntities'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  buildProjectStyleApplyPayload,
  isRecord,
  type WorkspaceRecord,
} from '@/features/project-standards/application/projectStandardsModel'
import { saveProjectStandardsWorkspaceEdit } from '@/features/project-standards/application/projectStandardsWorkspaceRepository'
import {
  updateProjectStandardsWorkspaceArtifact,
  type ProjectStandardsWorkspaceArtifact,
} from '@/features/project-standards/application/projectStandardsWorkspaceArtifactService'

export async function saveProjectStandardsStylePatch(input: {
  projectId: number
  currentProject?: WorkspaceRecord | null
  projectStyle: Record<string, unknown>
  successMessage: string
  refetchProjectStandards: () => Promise<unknown>
}) {
  await saveProjectStandardsWorkspaceEdit({
    projectId: input.projectId,
    currentProject: input.currentProject,
    projectStyle: input.projectStyle,
  })
  const nextProject = await getProject(input.projectId)
  useProjectStore.getState().setCurrent(nextProject)
  await input.refetchProjectStandards()
  toast.success(input.successMessage)
}

export async function applyProjectStandardsWorkspace(input: {
  projectId: number
  currentProject?: WorkspaceRecord | null
  workspace: ProjectStandardsWorkspaceArtifact
  refetchProjectStandards: () => Promise<unknown>
  refetchWorkspaceArtifacts: () => Promise<unknown>
}) {
  const { projectId, workspace } = input
  if (workspace.kind !== 'project_standards_workspace') return

  try {
    const proposedValue = buildProjectStyleApplyPayload(workspace)
    const reviewedMetadata = {
      ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
      reviewedFrom: 'project-standards-workbench',
      reviewedAt: new Date().toISOString(),
    }
    await updateProjectStandardsWorkspaceArtifact(workspace.id, {
      metadata: reviewedMetadata,
    })
    const parsedWorkspace = JSON.parse(proposedValue) as Record<string, unknown>
    const workspacePayload = isRecord(parsedWorkspace.workspace) ? parsedWorkspace.workspace : {}
    await saveProjectStandardsWorkspaceEdit({
      projectId,
      currentProject: input.currentProject,
      projectStyle: isRecord(workspacePayload.project_style) ? workspacePayload.project_style : {},
    })
    await updateProjectStandardsWorkspaceArtifact(workspace.id, {
      status: 'applied',
      target: {
        projectId,
        entityType: 'project',
        entityId: projectId,
        field: 'workspace',
      },
      metadata: {
        ...reviewedMetadata,
        workspaceWritePerformed: true,
      },
    })
    const nextProject = await getProject(projectId)
    useProjectStore.getState().setCurrent(nextProject)
    toast.success('项目规范已写入工作区')
    await input.refetchProjectStandards()
    await input.refetchWorkspaceArtifacts()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '应用项目规范工作区失败')
  }
}
