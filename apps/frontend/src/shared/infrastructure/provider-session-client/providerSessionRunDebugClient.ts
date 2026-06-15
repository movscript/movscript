import { normalizeAgentTraceDebugView } from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { ProviderSessionStreamingClient } from '@/shared/infrastructure/provider-session-client/providerSessionStreamingClient'
import type {
  AgentRunDebugEvidence,
  AgentRunDebugEvidenceRefQuery,
  AgentRunDebugEvidenceRefResponse,
  AgentRunDebugLedger,
  AgentRunGenerationView,
  AgentRunTraceResponse,
  AgentRunTraceSummary,
  AgentTraceDebugView,
  AgentTraceQuery,
} from '@/shared/infrastructure/provider-session-client/types'

export abstract class ProviderSessionRunDebugClient extends ProviderSessionStreamingClient {
  getRunTraceEvents(runId: string, query: AgentTraceQuery = {}): Promise<AgentRunTraceResponse> {
    const params = new URLSearchParams()
    if (query.cursor) params.set('cursor', query.cursor)
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace${params.size ? `?${params.toString()}` : ''}`)
  }

  getRunTraceEventData(runId: string, eventId: string): Promise<{ runId: string; eventId: string; data: unknown }> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/events/${encodeURIComponent(eventId)}/data`)
  }

  getRunTraceSummary(runId: string): Promise<AgentRunTraceSummary> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/summary`)
  }

  async getRunTraceDebugView(runId: string): Promise<AgentTraceDebugView> {
    return normalizeAgentTraceDebugView(await this.getJSON(`/runs/${encodeURIComponent(runId)}/trace/debug-view`))
  }

  getRunDebugLedger(runId: string): Promise<AgentRunDebugLedger> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/debug-ledger`)
  }

  findRunDebugEvidenceRefs(runId: string, query: AgentRunDebugEvidenceRefQuery): Promise<AgentRunDebugEvidenceRefResponse> {
    const params = new URLSearchParams()
    if (query.kind) params.set('kind', query.kind)
    if (query.contextBundleId) params.set('contextBundleId', query.contextBundleId)
    if (query.refKey) params.set('refKey', query.refKey)
    if (query.contentHash) params.set('contentHash', query.contentHash)
    if (query.resultHash) params.set('resultHash', query.resultHash)
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/debug-evidence-refs${params.size ? `?${params.toString()}` : ''}`)
  }

  getRunDebugEvidence(runId: string, evidenceId: string): Promise<AgentRunDebugEvidence> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/debug-evidence/${encodeURIComponent(evidenceId)}`)
  }

  getRunGenerationView(runId: string): Promise<AgentRunGenerationView> {
    return this.getJSON(`/runs/${encodeURIComponent(runId)}/generation-view`)
  }
}
