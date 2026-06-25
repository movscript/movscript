import type { WorkspaceRecord } from './projectStandardsModel'
import { isRecord } from './projectStandardsModel'
import { createSurfaceWorkspaceDomainService } from '@movscript/shared'

export async function saveProjectStandardsWorkspaceEdit(input: {
  projectId: number
  currentProject?: WorkspaceRecord | null
  projectStyle: Record<string, unknown>
}): Promise<void> {
  const service = createSurfaceWorkspaceDomainService({ projectId: input.projectId })
  await service.upsertProjectStandards({
    record: input.currentProject ?? undefined,
    projectStyle: projectStandardsPayload(input),
  })
}

function projectStandardsPayload(input: {
  projectId: number
  currentProject?: WorkspaceRecord | null
  projectStyle: Record<string, unknown>
}): Record<string, unknown> {
  const currentStyle = parseCurrentProjectStyle(input.currentProject)
  const projectStyle = {
    ...currentStyle,
    ...input.projectStyle,
  }
  return {
    aspect_ratio: stringValue(projectStyle.aspect_ratio) ?? input.currentProject?.aspect_ratio ?? '',
    visual_style: stringValue(projectStyle.visual_style) ?? input.currentProject?.visual_style ?? '',
    project_style: JSON.stringify(projectStyle),
  }
}

function parseCurrentProjectStyle(project?: WorkspaceRecord | null): Record<string, unknown> {
  const raw = project?.project_style
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
