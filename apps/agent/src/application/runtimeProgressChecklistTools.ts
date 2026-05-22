import { cloneJSONValue, isJSONRecord } from '../jsonValue.js'
import type {
  AgentMessage,
  AgentProgressChecklist,
  AgentProgressChecklistItem,
  AgentProgressChecklistItemStatus,
  AgentProgressChecklistRevision,
  AgentRun,
  AgentThread,
  JSONValue,
} from '../state/types.js'
import type { AgentStore } from '../state/store.js'
import { buildThreadMessage } from './threadLifecycle.js'
import { isoNow, makeId } from './runtimeIdentity.js'
import { requireRuntimeThread } from './runtimeStoreLookup.js'

const PROGRESS_CHECKLIST_SCHEMA = 'movscript.agent.progress-checklist.v1'
const PROGRESS_CHECKLIST_REVISION_SCHEMA = 'movscript.agent.progress-checklist-revision.v1'
const MAX_PROGRESS_CHECKLIST_ITEMS = 20
const MAX_PROGRESS_CHECKLIST_REVISIONS = 100
const MAX_STEP_CHARS = 300
const MAX_EXPLANATION_CHARS = 1000
const VALID_STATUSES = new Set<AgentProgressChecklistItemStatus>(['pending', 'in_progress', 'completed'])

export interface UpdateProgressChecklistInput {
  explanation?: unknown
  checklist?: unknown
}

export interface UpdateProgressChecklistResult {
  status: 'updated'
  checklist: AgentProgressChecklist
  revision: AgentProgressChecklistRevision
  message: AgentMessage
}

export function updateRuntimeProgressChecklist(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  run: AgentRun
  request?: UpdateProgressChecklistInput | Record<string, JSONValue>
  now?: string
  checklistId?: string
  revisionId?: string
  messageId?: string
}): UpdateProgressChecklistResult {
  const now = input.now ?? isoNow()
  const thread = requireRuntimeThread(input.store, input.run.threadId)
  const items = normalizeProgressChecklistItems((input.request ?? {}).checklist)
  const explanation = normalizeOptionalString((input.request ?? {}).explanation, MAX_EXPLANATION_CHARS)
  assertAtMostOneInProgress(items)

  const current = thread.currentProgressChecklist
  const checklist: AgentProgressChecklist = {
    schema: PROGRESS_CHECKLIST_SCHEMA,
    id: current?.id ?? input.checklistId ?? makeId('progress_checklist'),
    threadId: thread.id,
    runId: input.run.id,
    ...(explanation ? { explanation } : {}),
    items,
    completedCount: items.filter((item) => item.status === 'completed').length,
    totalCount: items.length,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
  const revision: AgentProgressChecklistRevision = {
    schema: PROGRESS_CHECKLIST_REVISION_SCHEMA,
    id: input.revisionId ?? makeId('progress_checklist_revision'),
    checklistId: checklist.id,
    threadId: thread.id,
    runId: input.run.id,
    ...(explanation ? { explanation } : {}),
    snapshot: cloneProgressChecklist(checklist),
    createdAt: now,
  }
  const message = buildThreadMessage({
    id: input.messageId ?? makeId('msg'),
    threadId: thread.id,
    role: 'assistant',
    content: 'Progress checklist updated',
    now,
    runId: input.run.id,
    metadata: {
      kind: 'progress_checklist_revision',
      progressChecklistRevision: revision as unknown as JSONValue,
    },
  })

  applyProgressChecklistRevision({ thread, checklist, revision, message })
  input.store.updateThread(thread)
  return { status: 'updated', checklist, revision, message }
}

export function applyProgressChecklistRevision(input: {
  thread: AgentThread
  checklist: AgentProgressChecklist
  revision: AgentProgressChecklistRevision
  message: AgentMessage
}): AgentThread {
  input.thread.currentProgressChecklist = cloneProgressChecklist(input.checklist)
  input.thread.progressChecklistRevisions = [
    ...(input.thread.progressChecklistRevisions ?? []),
    cloneProgressChecklistRevision(input.revision),
  ].slice(-MAX_PROGRESS_CHECKLIST_REVISIONS)
  input.thread.messages.push(input.message)
  input.thread.updatedAt = input.message.createdAt
  return input.thread
}

function normalizeProgressChecklistItems(value: unknown): AgentProgressChecklistItem[] {
  if (!Array.isArray(value)) throw new Error('core_progress_update requires checklist to be an array')
  if (value.length > MAX_PROGRESS_CHECKLIST_ITEMS) throw new Error(`core_progress_update supports at most ${MAX_PROGRESS_CHECKLIST_ITEMS} items`)
  return value.map((item, index) => {
    if (!isJSONRecord(item)) throw new Error(`core_progress_update checklist[${index}] must be an object`)
    const step = normalizeOptionalString(item.step, MAX_STEP_CHARS)
    if (!step) throw new Error(`core_progress_update checklist[${index}].step is required`)
    const status = item.status
    if (!VALID_STATUSES.has(status as AgentProgressChecklistItemStatus)) {
      throw new Error(`core_progress_update checklist[${index}].status must be pending, in_progress, or completed`)
    }
    return { step, status: status as AgentProgressChecklistItemStatus }
  })
}

function assertAtMostOneInProgress(items: AgentProgressChecklistItem[]): void {
  const count = items.filter((item) => item.status === 'in_progress').length
  if (count > 1) throw new Error('core_progress_update allows at most one in_progress item')
}

function normalizeOptionalString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxChars)
}

function cloneProgressChecklist(checklist: AgentProgressChecklist): AgentProgressChecklist {
  return cloneJSONValue(checklist as unknown as JSONValue) as unknown as AgentProgressChecklist
}

function cloneProgressChecklistRevision(revision: AgentProgressChecklistRevision): AgentProgressChecklistRevision {
  return cloneJSONValue(revision as unknown as JSONValue) as unknown as AgentProgressChecklistRevision
}
