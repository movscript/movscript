import { parseAgentFileRef } from '../ref/agentFileRef.js'
import type {
  AgentFileChangeSet,
  AgentFileDescriptor,
  AgentFileEdit,
  AgentFileEditPrecondition,
  AgentFileEditResult,
  AgentFileReadResult,
  AgentFileSearchResult,
} from '../edit/agentFileEdit.js'

export interface AgentFileProvider {
  readonly provider: string
  read(ref: string): AgentFileReadResult
  search(ref: string, input: { query: string; limit?: number }): AgentFileSearchResult
  edit(ref: string, input: {
    edits: AgentFileEdit[]
    precondition?: AgentFileEditPrecondition
    createdByRunId?: string
  }): AgentFileEditResult
}

export class AgentFileSystem {
  private readonly providers = new Map<string, AgentFileProvider>()

  constructor(providers: AgentFileProvider[] = []) {
    for (const provider of providers) this.register(provider)
  }

  register(provider: AgentFileProvider): void {
    this.providers.set(provider.provider, provider)
  }

  read(input: { ref: string }): AgentFileReadResult {
    return this.providerFor(input.ref).read(input.ref)
  }

  search(input: { ref: string; query: string; limit?: number }): AgentFileSearchResult {
    if (!input.query.trim()) throw new Error('core_file_search requires query')
    return this.providerFor(input.ref).search(input.ref, {
      query: input.query,
      limit: input.limit,
    })
  }

  edit(input: {
    ref: string
    edits: AgentFileEdit[]
    precondition?: AgentFileEditPrecondition
    createdByRunId?: string
  }): AgentFileEditResult {
    if (!Array.isArray(input.edits) || input.edits.length === 0) {
      throw new Error('core_file_edit requires at least one edit')
    }
    return this.providerFor(input.ref).edit(input.ref, {
      edits: input.edits,
      precondition: input.precondition,
      createdByRunId: input.createdByRunId,
    })
  }

  private providerFor(ref: string): AgentFileProvider {
    const parts = parseAgentFileRef(ref)
    const provider = this.providers.get(parts.provider)
    if (!provider) throw new Error(`agent file provider not found: ${parts.provider}`)
    return provider
  }
}

export type {
  AgentFileChangeSet,
  AgentFileDescriptor,
  AgentFileEdit,
  AgentFileEditPrecondition,
  AgentFileEditResult,
  AgentFileReadResult,
  AgentFileSearchResult,
}
