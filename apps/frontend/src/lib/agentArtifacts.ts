import type { AgentDraftKind, AgentRun } from '@/lib/localAgentClient'

export interface AgentTaskArtifactRef {
  type: 'draft'
  draftId: string
  draftKind?: AgentDraftKind
  title?: string
  schema?: string
  sourceRunId?: string
  sourceThreadId?: string
  updatedAt?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeDraftKind(value: unknown): AgentDraftKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  const allowed: AgentDraftKind[] = [
    'script_split',
    'script',
    'asset_slot',
    'storyboard_line',
    'content_unit',
    'prompt',
    'note',
    'pipeline',
    'segment',
    'scene_moment',
    'asset_proposal',
    'project_proposal',
    'production_proposal',
  ]
  return allowed.includes(normalized as AgentDraftKind) ? normalized as AgentDraftKind : undefined
}

function readDraftCandidate(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  if (isRecord(value.draft)) return value.draft
  return value
}

function artifactFromDraftCandidate(
  candidate: Record<string, unknown> | undefined,
  fallback: { runId?: string; threadId?: string; completedAt?: string },
): AgentTaskArtifactRef | undefined {
  if (!candidate) return undefined
  const draftId = stringValue(candidate.id ?? candidate.draftId ?? candidate.draft_id ?? candidate.proposalRef ?? candidate.proposal_ref ?? candidate.draftRef ?? candidate.draft_ref)
  if (!draftId) return undefined
  const draftKind = normalizeDraftKind(candidate.kind ?? candidate.draftKind ?? candidate.draft_kind)
  const updatedAt = stringValue(candidate.updatedAt ?? candidate.updated_at ?? candidate.createdAt ?? candidate.created_at ?? fallback.completedAt)
  const schema = stringValue(candidate.schema)
  const title = stringValue(candidate.title)
  const source = isRecord(candidate.source) ? candidate.source : undefined
  const sourceRunId = stringValue(candidate.createdByRunId ?? candidate.created_by_run_id ?? source?.runId ?? source?.run_id ?? fallback.runId)
  const sourceThreadId = stringValue(candidate.createdByThreadId ?? candidate.created_by_thread_id ?? source?.threadId ?? source?.thread_id ?? fallback.threadId)
  return {
    type: 'draft',
    draftId,
    ...(draftKind ? { draftKind } : {}),
    ...(title ? { title } : {}),
    ...(schema ? { schema } : {}),
    ...(sourceRunId ? { sourceRunId } : {}),
    ...(sourceThreadId ? { sourceThreadId } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

export function extractAgentTaskArtifacts(run?: AgentRun): AgentTaskArtifactRef[] {
  if (run?.streamPartial) return []
  if (!run?.steps?.length) return []
  const artifacts = new Map<string, AgentTaskArtifactRef>()
  for (const step of run.steps) {
    if (step.type !== 'tool_call') continue
    const candidate = readDraftCandidate(step.result)
    const artifact = artifactFromDraftCandidate(candidate, {
      runId: run.id,
      threadId: run.threadId,
      completedAt: step.completedAt,
    })
    if (!artifact) continue
    artifacts.set(artifact.draftId, artifact)
  }
  return Array.from(artifacts.values())
}

export function selectLatestDraftArtifact(
  artifacts: AgentTaskArtifactRef[] | undefined,
  kind?: AgentDraftKind,
): AgentTaskArtifactRef | undefined {
  if (!artifacts?.length) return undefined
  const filtered = kind ? artifacts.filter((artifact) => artifact.draftKind === kind) : artifacts
  return filtered.at(-1)
}
