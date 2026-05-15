import type { ToolSource } from '../orchestration/toolExecutor.js'
import type { ContextRef, ContextSource, EvidenceLevel } from './types.js'

export interface SourceBoundary {
  source: ContextSource
  evidence: EvidenceLevel
}

export function sourceBoundaryForContextRef(ref: ContextRef, toolSource: ToolSource): SourceBoundary {
  if (ref.type === 'draft') return { source: 'draft', evidence: 'draft' }
  if (ref.type === 'memory') return { source: 'memory', evidence: 'summary' }
  if (ref.type === 'knowledge') return { source: 'knowledge', evidence: 'advisory' }
  if (ref.type === 'project' || ref.type === 'production' || ref.type === 'asset_slot') {
    return { source: toolSource === 'mcp' ? 'mcp' : 'backend', evidence: 'verified' }
  }
  if (ref.type === 'generation_job') return { source: toolSource === 'mcp' ? 'mcp' : 'tool_result', evidence: 'runtime_state' }
  return { source: toolSource === 'mcp' ? 'mcp' : 'tool_result', evidence: toolSource === 'sandbox' ? 'advisory' : 'runtime_state' }
}

export function normalizeContextSource(value: unknown): ContextSource | undefined {
  return value === 'system'
    || value === 'catalog'
    || value === 'profile'
    || value === 'skill'
    || value === 'tool_result'
    || value === 'mcp'
    || value === 'backend'
    || value === 'draft'
    || value === 'memory'
    || value === 'knowledge'
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
    || value === 'draft'
    || value === 'advisory'
    || value === 'summary'
    || value === 'unknown'
    ? value
    : undefined
}
