import type { ToolSource } from '../../../ports/tools/toolExecutionSource.js'
import type { ContextRef, ContextSource, EvidenceLevel } from '../shared/contextLedgerTypes.js'

export interface SourceBoundary {
  source: ContextSource
  evidence: EvidenceLevel
}

export function sourceBoundaryForContextRef(ref: ContextRef, toolSource: ToolSource): SourceBoundary {
  if (ref.type === 'workspace') return { source: 'workspace', evidence: 'workspace' }
  if (ref.type === 'memory') return { source: 'memory', evidence: 'summary' }
  if (ref.type === 'reference') return { source: 'reference', evidence: 'advisory' }
  if (ref.type === 'project') {
    return { source: toolSource === 'mcp' ? 'mcp' : 'backend', evidence: 'verified' }
  }
  if (ref.type === 'generation_job') return { source: toolSource === 'mcp' ? 'mcp' : 'tool_result', evidence: 'runtime_state' }
  return { source: toolSource === 'mcp' ? 'mcp' : 'tool_result', evidence: toolSource === 'sandbox' ? 'advisory' : 'runtime_state' }
}

export function normalizeContextSource(value: unknown): ContextSource | undefined {
  return value === 'system'
    || value === 'catalog'
    || value === 'config_file'
    || value === 'skill'
    || value === 'tool_result'
    || value === 'mcp'
    || value === 'backend'
    || value === 'workspace'
    || value === 'memory'
    || value === 'reference'
    || value === 'user_input'
    || value === 'assistant_history'
    || value === 'thread_summary'
    ? value
    : undefined
}

export function normalizeEvidenceLevel(value: unknown): EvidenceLevel | undefined {
  return value === 'verified'
    || value === 'runtime_state'
    || value === 'user_claimed'
    || value === 'workspace'
    || value === 'advisory'
    || value === 'summary'
    || value === 'unknown'
    ? value
    : undefined
}
