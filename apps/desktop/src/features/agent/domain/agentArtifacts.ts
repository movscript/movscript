import type { AgentRun } from '@movscript/agent-protocol'
import type { MovScriptWorkspaceKind } from '@/shared/contracts/workspaceArtifact'
import { isRecord } from '@/shared/domain/jsonValue'

export interface AgentTaskArtifactRef {
  type: 'workspace'
  workspaceId: string
  projectId?: number
  workspaceKind?: MovScriptWorkspaceKind
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

function normalizeWorkspaceKind(value: unknown): MovScriptWorkspaceKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  const allowed: MovScriptWorkspaceKind[] = [
    'setting_workspace',
    'asset_workspace',
    'project_standards_workspace',
    'production_workspace',
    'content_unit_workspace',
  ]
  return allowed.includes(normalized as MovScriptWorkspaceKind) ? normalized as MovScriptWorkspaceKind : undefined
}

function readWorkspaceCandidate(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  if (isRecord(value.workspace)) return value.workspace
  return value
}

function artifactFromWorkspaceCandidate(
  candidate: Record<string, unknown> | undefined,
  fallback: { runId?: string; threadId?: string; completedAt?: string },
): AgentTaskArtifactRef | undefined {
  if (!candidate) return undefined
  const workspaceId = stringValue(candidate.id ?? candidate.workspaceId ?? candidate.workspace_id ?? candidate.workspaceRef ?? candidate.workspace_ref ?? candidate.workspaceRef ?? candidate.workspace_ref)
  if (!workspaceId) return undefined
  const workspaceKind = normalizeWorkspaceKind(candidate.kind ?? candidate.workspaceKind ?? candidate.workspace_kind)
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
    type: 'workspace',
    workspaceId,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(workspaceKind ? { workspaceKind } : {}),
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
    const candidate = readWorkspaceCandidate(step.result)
    const artifact = artifactFromWorkspaceCandidate(candidate, {
      runId: run.id,
      threadId: run.threadId,
      completedAt: step.completedAt,
    })
    if (!artifact) continue
    artifacts.set(artifact.workspaceId, artifact)
  }
  return Array.from(artifacts.values())
}

export function selectLatestWorkspaceArtifact(
  artifacts: AgentTaskArtifactRef[] | undefined,
  kind?: MovScriptWorkspaceKind,
): AgentTaskArtifactRef | undefined {
  if (!artifacts?.length) return undefined
  const filtered = kind ? artifacts.filter((artifact) => artifact.workspaceKind === kind) : artifacts
  return filtered.at(-1)
}
