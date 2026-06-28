export type MovScriptPrincipalKind =
  | 'local-owner'
  | 'cloud-user'
  | 'service-account'
  | 'external-user'

export type MovScriptDataConnectionKind = 'local' | 'cloud' | 'external'

export type MovScriptDaemonRuntimeOwner = 'movscript.local-node'

export type MovScriptRuntimeOwner =
  | 'local-node'
  | 'desktop-owned'
  | 'cloud'
  | 'external'
  | 'unknown'

export interface MovScriptRuntimeContextSummary {
  owner: MovScriptRuntimeOwner
  appId?: string
  gatewayPrefix?: '/v1'
  startedAt?: string
}

export interface MovScriptPrincipalContext {
  userId: string
  kind: MovScriptPrincipalKind
  accountId?: string
  displayName?: string
  scopeKind?: 'user' | 'org' | 'local'
  scopeId?: string | number
}

export interface MovScriptDataConnectionContext {
  kind: MovScriptDataConnectionKind
  authMode?: 'local-owner' | 'session' | 'service-account' | 'external'
  status?: 'connected' | 'degraded' | 'unavailable'
  displayName?: string
}

export interface MovScriptRuntimeDescriptor {
  schema: 'movscript.runtime-descriptor.v1'
  runtime: {
    owner: MovScriptDaemonRuntimeOwner
    appId: MovScriptDaemonRuntimeOwner
    name: 'MovScript Local Node Daemon'
  }
  gateway: {
    baseURL: string
    canonicalPrefix: '/v1'
  }
  dataConnection: MovScriptDataConnectionContext
  capabilities: {
    project: boolean
    canvas: boolean
    resources: boolean
    editing: boolean
    media: boolean
  }
}

export interface MovScriptWorkspaceSessionCapabilities {
  localFileAccess: boolean
  fileImport: boolean
  mediaPreview: boolean
}

export interface MovScriptWorkspaceSessionContext {
  sessionId: string
  windowId?: string
  project?: {
    id: string
    uid?: string
    slug?: string
    title?: string
  }
  workspace?: {
    kind: 'local-fs' | 'cloud' | 'external'
    projectCwd?: string
    rootUri?: string
  }
  capabilities: MovScriptWorkspaceSessionCapabilities
}

export interface MovScriptContextEnvelope {
  schema: 'movscript.context-envelope.v1'
  contextId: string
  revision: number
  issuedAt: string
  runtime: MovScriptRuntimeContextSummary
  principal: MovScriptPrincipalContext
  dataConnection: MovScriptDataConnectionContext
  session?: MovScriptWorkspaceSessionContext
}

export interface MovScriptContextSessionInput {
  sessionId?: string
  windowId?: string
  projectId?: string | number
  projectUid?: string
  projectSlug?: string
  projectTitle?: string
  projectDir?: string
  workspaceRootUri?: string
  workspaceKind?: NonNullable<MovScriptWorkspaceSessionContext['workspace']>['kind']
  capabilities?: Partial<MovScriptWorkspaceSessionCapabilities>
  principal?: Partial<MovScriptPrincipalContext>
}

export function movScriptContextProjectCwd(
  context: Pick<MovScriptContextEnvelope, 'session'> | undefined,
): string | undefined {
  const session = context?.session
  if (!session?.capabilities.localFileAccess) return undefined
  return session.workspace?.projectCwd?.trim() || undefined
}

export function movScriptContextProjectId(
  context: Pick<MovScriptContextEnvelope, 'session'> | undefined,
): string | undefined {
  return context?.session?.project?.id?.trim() || undefined
}
