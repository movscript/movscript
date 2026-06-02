import { validateWorkspace, type AgentWorkspaceStore } from '../../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../../shared/protocol/types.js'
import { buildAgentFileRef, parseAgentFileRef } from '../core/ref/agentFileRef.js'
import {
  applyAgentFileEdits,
  contentRevision,
  type AgentFileDescriptor,
  type AgentFileEdit,
  type AgentFileEditResult,
  type AgentFileReadResult,
  type AgentFileSearchMatch,
  type AgentFileSearchResult,
} from '../core/edit/agentFileEdit.js'
import type { AgentFileProvider } from '../core/system/agentFileSystem.js'

export function workspaceContentFileRef(workspaceId: string): string {
  return buildAgentFileRef({ provider: 'workspace', id: workspaceId, path: '/content' })
}

export class WorkspaceFileProvider implements AgentFileProvider {
  readonly provider = 'workspace'

  constructor(
    private readonly workspaceStore: AgentWorkspaceStore,
  ) {}

  read(ref: string): AgentFileReadResult {
    const workspace = this.requireWorkspace(ref)
    const validation = validateWorkspace(workspace) as unknown as JSONValue
    return {
      file: workspaceDescriptor(workspace, ref),
      content: workspace.content,
      contentLength: workspace.content.length,
      revision: contentRevision(workspace.content),
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
    const workspace = this.requireWorkspace(ref)
    const baseRevision = contentRevision(workspace.content)
    if (input.precondition?.baseRevision && input.precondition.baseRevision !== baseRevision) {
      throw new Error(`core_file_edit baseRevision mismatch: expected ${input.precondition.baseRevision}, current ${baseRevision}`)
    }
    const edited = applyAgentFileEdits(workspace.content, input.edits)
    const updated = this.workspaceStore.updateWorkspace(workspace.id, { content: edited.content })
    const validation = validateWorkspace(updated) as unknown as JSONValue
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
      file: workspaceDescriptor(updated, ref),
      changeSet,
      contentLength: updated.content.length,
      validation,
    }
  }

  private requireWorkspace(ref: string) {
    const parts = parseAgentFileRef(ref)
    if (parts.provider !== this.provider) throw new Error(`unsupported workspace file provider: ${parts.provider}`)
    if (parts.path !== '/content') throw new Error(`unsupported workspace file path: ${parts.path}`)
    const workspace = this.workspaceStore.getWorkspace(parts.id)
    if (!workspace) throw new Error(`workspace not found: ${parts.id}`)
    return workspace
  }
}

function workspaceDescriptor(workspace: ReturnType<AgentWorkspaceStore['getWorkspace']> & {}, ref: string): AgentFileDescriptor {
  const provider = parseAgentFileRef(ref).provider
  return {
    provider,
    kind: workspace.kind,
    ref,
    id: workspace.id,
    title: workspace.title,
    updatedAt: workspace.updatedAt,
    metadata: {
      status: workspace.status,
      ...(workspace.projectId !== undefined ? { projectId: workspace.projectId } : {}),
      ...(workspace.filePath ? { legacyFilePath: workspace.filePath } : {}),
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
