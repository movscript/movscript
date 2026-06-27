import type { JSONValue } from './protocolJson.js'
import type { MovScriptNormalizedFocus } from '@movscript/domain'
import type { MovScriptWorkspaceKind } from './providerCatalog.js'

export interface ProviderSessionClientAttachmentRef {
  id?: string
  name?: string
  type?: string
  mimeType?: string
  size?: number
  url?: string
  resourceId?: number
  dataUrl?: string
  source?: AgentAttachmentSource
  vision?: Record<string, JSONValue>
}

export interface ProviderSessionClientResourceRef {
  id?: number
  name?: string
  type?: string
  mimeType?: string
  size?: number
}

export interface ProviderSessionClientInput {
  message: string
  attachments?: ProviderSessionClientAttachmentRef[]
  uiSnapshot?: {
    route?: {
      pathname?: string
      search?: string
      hash?: string
    }
    pageContext?: {
      pageKey?: string
      pageType?: string
      pageRoute?: string
      pageEntityType?: string
      pageEntityId?: number | string
      workspaceId?: string
    }
    project?: {
      id?: number
      name?: string
      status?: string
      description?: string
    }
    workspaceId?: string
    domainFocus?: MovScriptNormalizedFocus
    agent?: {
      key?: string
      name?: string
    }
    selection?: {
      entityType?: string
      entityId?: number | string
      label?: string
    } | null
    recentResources?: ProviderSessionClientResourceRef[]
    labels?: string[]
  }
}

export interface AgentAttachment {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  mimeType: string
  size: number
  url?: string
  previewUrl?: string
  resourceId?: number
  dataUrl?: string
  source?: AgentAttachmentSource
  generated?: {
    jobId?: number
    jobType?: string
    contentUnitId?: string | number
    candidateId?: string | number
    resourceId?: number
    providerName?: string
    modelDisplay?: string
    modelIdentifier?: string
    status?: string
    stage?: string
  }
}

export type AgentAttachmentSource =
  | { kind: 'inline_data'; dataUrl: string }
  | { kind: 'backend_resource'; resourceId: number }
  | { kind: 'local_file'; fileId: string }
  | { kind: 'local_path'; path: string }
  | { kind: 'remote_url'; url: string }
  | { kind: 'display_url'; url: string }

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
