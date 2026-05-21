import { validateDraft, type AgentDraftStore } from '../../drafts/draftStore.js'
import type { JSONValue } from '../../types.js'
import { buildAgentFileRef, parseAgentFileRef } from '../agentFileRef.js'
import {
  applyAgentFileEdits,
  contentRevision,
  type AgentFileDescriptor,
  type AgentFileEdit,
  type AgentFileEditResult,
  type AgentFileReadResult,
  type AgentFileSearchMatch,
  type AgentFileSearchResult,
} from '../agentFileEdit.js'
import type { AgentFileProvider } from '../agentFileSystem.js'

export function draftContentFileRef(draftId: string): string {
  return buildAgentFileRef({ provider: 'draft', id: draftId, path: '/content' })
}

export class DraftFileProvider implements AgentFileProvider {
  readonly provider = 'draft'

  constructor(private readonly draftStore: AgentDraftStore) {}

  read(ref: string): AgentFileReadResult {
    const draft = this.requireDraft(ref)
    const validation = validateDraft(draft) as unknown as JSONValue
    return {
      file: draftDescriptor(draft, ref),
      content: draft.content,
      contentLength: draft.content.length,
      revision: contentRevision(draft.content),
      validation,
    }
  }

  search(ref: string, input: { query: string; limit?: number }): AgentFileSearchResult {
    const read = this.read(ref)
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 100))
    const matches = searchContent(read.content, input.query, limit)
    return {
      file: read.file,
      query: input.query,
      revision: read.revision,
      matches,
      matchCount: matches.length,
    }
  }

  edit(ref: string, input: {
    edits: AgentFileEdit[]
    precondition?: { baseRevision?: string }
    createdByRunId?: string
  }): AgentFileEditResult {
    const draft = this.requireDraft(ref)
    const baseRevision = contentRevision(draft.content)
    if (input.precondition?.baseRevision && input.precondition.baseRevision !== baseRevision) {
      throw new Error(`agent_file_edit baseRevision mismatch: expected ${input.precondition.baseRevision}, current ${baseRevision}`)
    }
    const edited = applyAgentFileEdits(draft.content, input.edits)
    const updated = this.draftStore.updateDraft(draft.id, { content: edited.content })
    const validation = validateDraft(updated) as unknown as JSONValue
    const nextRevision = contentRevision(updated.content)
    const changeSet = {
      id: makeChangeSetId(),
      fileRef: ref,
      baseRevision,
      nextRevision,
      edits: input.edits,
      replacementCount: edited.replacementCount,
      validation,
      ...(input.createdByRunId ? { createdByRunId: input.createdByRunId } : {}),
      createdAt: new Date().toISOString(),
    }
    return {
      file: draftDescriptor(updated, ref),
      changeSet,
      contentLength: updated.content.length,
      validation,
    }
  }

  validate(ref: string): JSONValue {
    return validateDraft(this.requireDraft(ref)) as unknown as JSONValue
  }

  private requireDraft(ref: string) {
    const parts = parseAgentFileRef(ref)
    if (parts.provider !== this.provider) throw new Error(`unsupported draft file provider: ${parts.provider}`)
    if (parts.path !== '/content') throw new Error(`unsupported draft file path: ${parts.path}`)
    const draft = this.draftStore.getDraft(parts.id)
    if (!draft) throw new Error(`draft not found: ${parts.id}`)
    return draft
  }
}

function draftDescriptor(draft: ReturnType<AgentDraftStore['getDraft']> & {}, ref: string): AgentFileDescriptor {
  return {
    provider: 'draft',
    kind: draft.kind,
    ref,
    id: draft.id,
    title: draft.title,
    updatedAt: draft.updatedAt,
    metadata: {
      status: draft.status,
      ...(draft.projectId !== undefined ? { projectId: draft.projectId } : {}),
      ...(draft.filePath ? { legacyFilePath: draft.filePath } : {}),
    },
  }
}

function searchContent(content: string, query: string, limit: number): AgentFileSearchMatch[] {
  const matches: AgentFileSearchMatch[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length && matches.length < limit; i += 1) {
    const line = lines[i] ?? ''
    const column = line.indexOf(query)
    if (column === -1) continue
    matches.push({
      line: i + 1,
      column: column + 1,
      excerpt: line.length > 240 ? `${line.slice(0, 237)}...` : line,
    })
  }
  return matches
}

function makeChangeSetId(): string {
  return `changeset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
