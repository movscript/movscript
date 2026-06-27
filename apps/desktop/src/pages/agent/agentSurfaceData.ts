import { api } from '@/shared/infrastructure/api'
import { createAgentSurfaceDataAdapter } from '@movscript/project-surface/data'

export {
  agentSurfaceParams,
  arrayValue,
  invalidateAgentSurfaceQueries,
  numberValue,
  recordValue,
  stringValue,
} from '@movscript/project-surface/data'
export type { AgentSurfaceSnapshot } from '@movscript/project-surface/data'

const agentSurfaceData = createAgentSurfaceDataAdapter(api)

export const agentSurfaceKeys = {
  snapshot: (surface: string, params: Record<string, unknown>) => ['agent-surface', surface, params] as const,
  resourceDetail: (resourceId: number | undefined) => ['agent-surface', 'resource-detail', resourceId] as const,
  resourceUsages: (resourceId: number | undefined) => ['agent-surface', 'resource-usages', resourceId] as const,
  generationJob: (jobId: number | undefined) => ['agent-surface', 'generation-job', jobId] as const,
  candidateResourcePreview: (resourceId: number) => ['agent-surface', 'candidate-resource-preview', resourceId] as const,
  timelineResourcePreview: (resourceId: number) => ['agent-surface', 'timeline-resource-preview', resourceId] as const,
}

export const fetchAgentSurfaceSnapshot = agentSurfaceData.fetchAgentSurfaceSnapshot
export const postAgentSurfaceAction = agentSurfaceData.postAgentSurfaceAction
