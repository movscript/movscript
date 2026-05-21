import type { AgentDraftKind, AgentRun } from '@/lib/localAgentClient'
import { isRecord } from '@/lib/jsonValue'

export interface AgentTaskArtifactRef {
  type: 'draft'
  draftId: string
  projectId?: number
  draftKind?: AgentDraftKind
  title?: string
  schema?: string
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  metadata?: Record<string, unknown>
  filePath?: string
  sourceRunId?: string
  sourceThreadId?: string
  updatedAt?: string
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function normalizeDraftKind(value: unknown): AgentDraftKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  const allowed: AgentDraftKind[] = [
    'script_split_proposal',
    'script',
    'asset_slot',
    'content_unit',
    'prompt',
    'note',
    'pipeline',
    'segment',
    'scene_moment',
    'asset_proposal',
    'project_standards_proposal',
    'production_proposal',
    'content_unit_proposal',
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
  const projectId = numberValue(candidate.projectId ?? candidate.project_id)
  const source = isRecord(candidate.source) ? candidate.source : undefined
  const target = isRecord(candidate.target) ? candidate.target : undefined
  const metadata = isRecord(candidate.metadata) ? candidate.metadata : undefined
  const filePath = stringValue(candidate.filePath ?? candidate.file_path)
  const sourceRunId = stringValue(candidate.createdByRunId ?? candidate.created_by_run_id ?? source?.runId ?? source?.run_id ?? fallback.runId)
  const sourceThreadId = stringValue(candidate.createdByThreadId ?? candidate.created_by_thread_id ?? source?.threadId ?? source?.thread_id ?? fallback.threadId)
  return {
    type: 'draft',
    draftId,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(draftKind ? { draftKind } : {}),
    ...(title ? { title } : {}),
    ...(schema ? { schema } : {}),
    ...(source ? { source } : {}),
    ...(target ? { target } : {}),
    ...(metadata ? { metadata } : {}),
    ...(filePath ? { filePath } : {}),
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
