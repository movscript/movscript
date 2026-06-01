import type { AgentRun, JSONValue } from '../../state/types.js'

export interface ProjectStandardsBackendRead {
  performed: boolean
  skippedReason?: string
  response?: JSONValue
}

export interface MovscriptProjectStandardsPort {
  loadProject(input: {
    projectId: number
    run: AgentRun
    fallbackProject?: Record<string, JSONValue>
  }): Promise<{
    source: 'backend' | 'run_context' | 'unavailable'
    project?: Record<string, JSONValue>
    backendRead?: ProjectStandardsBackendRead
  }>
}
