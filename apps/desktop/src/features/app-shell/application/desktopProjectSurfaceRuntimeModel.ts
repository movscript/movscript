import { projectSurfacePath } from '@movscript/project-surface/routes'
import type {
  ProjectSurfaceRemotionStudioSession,
  ProjectSurfaceRemotionStudioSessionLogs,
  ProjectSurfaceRouteKey,
  ProjectSurfaceRouteParams,
  ProjectSurfaceShellSession,
} from '@movscript/project-surface/runtime'

import { ROUTES } from '@/routes/projectRoutes'

export type DesktopRemotionStudioShellBinding = {
  shellSessionId: string
  shellJobId?: string
}

export function desktopRemotionStudioShellWorkspaceKey(input: {
  projectKey?: string
  projectDirectory?: string
  commandText?: string
}): string | undefined {
  const projectKey = readString(input.projectKey) ?? 'current-project'
  const projectDirectory = readString(input.projectDirectory)
  const commandText = readString(input.commandText)
  if (!projectDirectory || !commandText) return undefined
  return JSON.stringify({
    schema: 'movscript.remotion_studio_shell_binding_key.v1',
    projectKey,
    projectDirectory,
    commandText,
  })
}

export function desktopProjectSurfaceHref(
  route: ProjectSurfaceRouteKey,
  projectKey: string,
  params?: ProjectSurfaceRouteParams,
): string {
  const pathname = desktopProjectSurfacePath(route, projectKey)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    query.set(key, String(value))
  }
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function desktopProjectSurfacePath(route: ProjectSurfaceRouteKey, projectKey: string): string {
  if (route === 'overview') return ROUTES.project.home
  if (route === 'settings') return ROUTES.project.settings
  if (route === 'scripts') return ROUTES.project.scripts
  if (route === 'standards') return ROUTES.project.standards
  if (route === 'content') return ROUTES.project.content
  if (route === 'contentCanvas') return ROUTES.project.contentCanvas
  if (route === 'contentPreview') return ROUTES.project.contentPreview
  if (route === 'remotionStudio') return ROUTES.project.remotionStudio
  if (route === 'settingPreview') return ROUTES.project.settingPreview
  return projectSurfacePath(route, projectKey)
}

export function desktopRemotionStudioSessionWithShell(
  session: Record<string, unknown>,
  shellBinding: DesktopRemotionStudioShellBinding,
  shellSession?: ProjectSurfaceShellSession,
): ProjectSurfaceRemotionStudioSession {
  const status = readString(session.status)
  const shellStatus = shellSession?.status
  const shellFinishedBeforeReady = desktopRemotionStudioShellFinishedBeforeReady(session, shellSession)
  const shellFinishedStatus = shellStatus === 'failed' ? 'failed' : 'stopped'
  return {
    ...session,
    ...(shellFinishedBeforeReady ? { status: shellFinishedStatus } : status === 'needs_external_shell' ? { status: 'starting' } : {}),
    ...(shellFinishedBeforeReady && shellStatus === 'failed' ? { error: 'Remotion Studio 的 Shell 任务在 Studio 就绪前失败。' } : {}),
    ...(shellStatus ? { shellStatus, shell_status: shellStatus } : {}),
    shellSessionId: shellBinding.shellSessionId,
    shell_session_id: shellBinding.shellSessionId,
    ...(shellBinding.shellJobId ? { shellJobId: shellBinding.shellJobId, shell_job_id: shellBinding.shellJobId } : {}),
  } as ProjectSurfaceRemotionStudioSession
}

export async function postDaemonGateway(
  baseURL: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseURL.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = readString(recordValue(payload)?.message)
      ?? readString(recordValue(payload)?.error)
      ?? `Daemon gateway 请求失败，HTTP 状态码 ${response.status}。`
    throw new Error(message)
  }
  return recordValue(payload) ?? {}
}

export function readDesktopDaemonGatewayBaseURL(
  config: {
    runtimeConnection?: { gatewayBaseURL?: string }
    runtime?: { gateway?: { baseURL?: string } }
    gatewayBaseURL?: string
  } | null | undefined,
): string | undefined {
  return config?.runtimeConnection?.gatewayBaseURL
    ?? config?.runtime?.gateway?.baseURL
    ?? config?.gatewayBaseURL
}

export function resolveBackendGitRemoteURL(value: string | undefined, daemonGatewayBaseURL?: string): string | undefined {
  const remoteURL = value?.trim()
  if (!remoteURL) return undefined
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(remoteURL) || remoteURL.startsWith('file://')) return remoteURL
  if (!remoteURL.startsWith('/')) return remoteURL
  const gatewayBaseURL = daemonGatewayBaseURL?.trim()
  return gatewayBaseURL ? `${gatewayBaseURL.replace(/\/+$/, '')}${remoteURL}` : remoteURL
}

export function desktopRemotionStudioShellBinding(shellSession: { id: string; jobId?: string }): DesktopRemotionStudioShellBinding {
  return {
    shellSessionId: shellSession.id,
    ...(shellSession.jobId ? { shellJobId: shellSession.jobId } : {}),
  }
}

export function projectSurfaceRemotionStudioSessionFromRecord(session: Record<string, unknown>): ProjectSurfaceRemotionStudioSession {
  return session as unknown as ProjectSurfaceRemotionStudioSession
}

export function projectSurfaceRemotionStudioSessionLogsFromRecord(logs: Record<string, unknown>): ProjectSurfaceRemotionStudioSessionLogs {
  return logs as unknown as ProjectSurfaceRemotionStudioSessionLogs
}

export function shellLogEntriesFromText(text: string): Array<{ stream: string; text: string }> {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ stream: 'shell', text: line }))
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export function rendererCommandValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value.trim() ? value.trim() : undefined
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length > 0 ? items : undefined
}

export function desktopRemotionStudioShellFinishedBeforeReady(
  session: Record<string, unknown>,
  shellSession?: ProjectSurfaceShellSession,
): boolean {
  const status = readString(session.status)
  const shellStatus = shellSession?.status
  return (
    status === 'checking'
    || status === 'starting'
    || status === 'needs_external_shell'
    || status === undefined
  ) && (shellStatus === 'exited' || shellStatus === 'failed')
}
