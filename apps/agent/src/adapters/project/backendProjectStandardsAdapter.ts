import type { BackendApplyClient } from '../../workspaces/adapters/backend/backendApplyClient.js'
import { isValidAgentReferenceId } from '../../context/runtime/runtimeContext.js'
import { isJSONRecord } from '../../shared/json/jsonValue.js'
import type { ProjectStandardsPort } from '../../ports/project/projectStandardsPort.js'
import type { AgentRun, JSONValue } from '../../state/shared/types.js'

export function createBackendProjectStandardsPort(
  backendApplyClient: Pick<BackendApplyClient, 'getProject'>,
): ProjectStandardsPort {
  return {
    async loadProject(input) {
      const backendRead = await backendApplyClient.getProject(input.projectId, backendAuthFromRun(input.run))
      const backendProject = isJSONRecord(backendRead.response) ? backendRead.response : undefined
      return {
        source: backendProject ? 'backend' : input.fallbackProject ? 'run_context' : 'unavailable',
        ...(backendProject ?? input.fallbackProject ? { project: backendProject ?? input.fallbackProject } : {}),
        backendRead,
      }
    },
  }
}

function backendAuthFromRun(run: AgentRun): {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
} {
  const user = userFromRunContext(run)
  return {
    ...(isValidAgentReferenceId(user?.id) ? { userId: user.id } : {}),
    ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
    ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
  }
}

function userFromRunContext(run: AgentRun): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  return isJSONRecord(context?.user) ? context.user : undefined
}
