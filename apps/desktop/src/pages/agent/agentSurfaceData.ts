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

export const fetchAgentSurfaceSnapshot = agentSurfaceData.fetchAgentSurfaceSnapshot
export const postAgentSurfaceAction = agentSurfaceData.postAgentSurfaceAction
