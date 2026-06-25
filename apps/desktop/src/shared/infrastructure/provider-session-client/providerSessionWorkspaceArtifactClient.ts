import { ProviderSessionHTTPError } from '@/shared/infrastructure/provider-session-client/errors'
import { isBackendAPIV1Endpoint } from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { ProviderSessionRunDebugClient } from '@/shared/infrastructure/provider-session-client/providerSessionRunDebugClient'
import type {
  MovScriptWorkspaceKind,
  ProviderMemory,
  ProviderMemoryKind,
  ProviderMemoryScope,
  WorkspaceArtifact,
  WorkspaceArtifactApplyPreview,
  WorkspaceArtifactStatus,
} from '@/shared/infrastructure/provider-session-client/types'

export abstract class ProviderSessionWorkspaceArtifactClient extends ProviderSessionRunDebugClient {
  listMemories(query: { scope?: ProviderMemoryScope; projectId?: number; threadId?: string; kind?: ProviderMemoryKind } = {}): Promise<{ memories: ProviderMemory[] }> {
    const params = new URLSearchParams()
    if (query.scope) params.set('scope', query.scope)
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.kind) params.set('kind', query.kind)
    return this.getJSON(`/memories${params.size ? `?${params.toString()}` : ''}`)
  }

  listWorkspaceArtifacts(query: { projectId?: number; kind?: MovScriptWorkspaceKind; status?: WorkspaceArtifactStatus | WorkspaceArtifactStatus[]; threadId?: string; runId?: string; pageKey?: string; pageType?: string; pageRoute?: string; pageEntityType?: string; pageEntityId?: number | string; current?: boolean; limit?: number } = {}): Promise<{ workspaces: WorkspaceArtifact[] }> {
    if (isBackendAPIV1Endpoint(this.baseURL)) return Promise.resolve({ workspaces: [] })
    const params = new URLSearchParams()
    if (typeof query.projectId === 'number') params.set('projectId', String(query.projectId))
    if (query.kind) params.set('kind', query.kind)
    if (Array.isArray(query.status)) {
      for (const status of query.status) params.append('status', status)
    } else if (query.status) {
      params.set('status', query.status)
    }
    if (query.threadId) params.set('threadId', query.threadId)
    if (query.runId) params.set('runId', query.runId)
    if (query.pageKey) params.set('pageKey', query.pageKey)
    if (query.pageType) params.set('pageType', query.pageType)
    if (query.pageRoute) params.set('pageRoute', query.pageRoute)
    if (query.pageEntityType) params.set('pageEntityType', query.pageEntityType)
    if (query.pageEntityId !== undefined) params.set('pageEntityId', String(query.pageEntityId))
    if (typeof query.current === 'boolean') params.set('current', String(query.current))
    if (typeof query.limit === 'number') params.set('limit', String(query.limit))
    return this.getJSON(`/workspaces${params.size ? `?${params.toString()}` : ''}`)
  }

  getWorkspaceArtifact(workspaceId: string): Promise<WorkspaceArtifact> {
    if (isBackendAPIV1Endpoint(this.baseURL)) {
      return Promise.reject(new ProviderSessionHTTPError(404, '', `workspace artifact ${workspaceId} is not available on the backend API endpoint`))
    }
    return this.getJSON(`/workspaces/${encodeURIComponent(workspaceId)}`)
  }

  createWorkspaceArtifact(input: { projectId?: number; kind?: MovScriptWorkspaceKind; title: string; content: string; source?: Record<string, unknown>; target?: Record<string, unknown>; seed?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<WorkspaceArtifact> {
    return this.postJSON('/workspace', input)
  }

  updateWorkspaceArtifact(workspaceId: string, input: { status?: WorkspaceArtifactStatus; title?: string; content?: string; target?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<WorkspaceArtifact> {
    return this.patchJSON(`/workspaces/${encodeURIComponent(workspaceId)}`, input)
  }

  previewApplyWorkspaceArtifact(workspaceId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<WorkspaceArtifactApplyPreview> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/apply-preview`, input)
  }

  applyWorkspaceArtifact(workspaceId: string, input: { target?: Record<string, unknown>; targetEntityType?: string; targetEntityId?: number | string; targetField?: string; currentValue?: unknown; proposedValue?: unknown } = {}): Promise<WorkspaceArtifactApplyPreview> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/apply`, input)
  }

  rejectWorkspaceArtifact(workspaceId: string, reason?: string): Promise<WorkspaceArtifact> {
    return this.postJSON(`/workspaces/${encodeURIComponent(workspaceId)}/reject`, { reason })
  }

  createMemory(input: { scope: ProviderMemoryScope; kind: ProviderMemoryKind; content: string; projectId?: number; threadId?: string }): Promise<ProviderMemory> {
    return this.postJSON('/memories', input)
  }

  deleteMemory(memoryId: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    return this.deleteJSON(`/memories/${encodeURIComponent(memoryId)}`, signal)
  }
}
