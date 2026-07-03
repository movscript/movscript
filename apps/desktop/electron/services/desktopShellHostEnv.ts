import {
  resolveMovScriptDataServiceSession,
  type MovScriptDataServiceSession,
  type MovScriptDataServiceSessionInput,
} from '@movscript/data-client'
import { movScriptCliPathEnv, pathEnvKey, resolveMovScriptCliBinDir } from './movscriptCliPath'

export type DesktopShellHostEnvInput = {
  inheritedEnv?: NodeJS.ProcessEnv
  workspaceDir: string
  projectDir?: string
  userId?: string
  orgId?: string
  projectId?: string
  platform?: NodeJS.Platform
  resolveBackendSession?: (input: MovScriptDataServiceSessionInput) => MovScriptDataServiceSession
  resolveCliBinDir?: typeof resolveMovScriptCliBinDir
}

export function desktopShellHostEnv(input: DesktopShellHostEnvInput): NodeJS.ProcessEnv {
  const inheritedEnv = input.inheritedEnv ?? process.env
  const platform = input.platform ?? process.platform
  const resolveBackend = input.resolveBackendSession ?? resolveMovScriptDataServiceSession
  const resolveCliBin = input.resolveCliBinDir ?? resolveMovScriptCliBinDir
  const session = resolveBackend({ workspaceDir: input.workspaceDir })
  const cliBinDir = resolveCliBin({ workspaceDir: session.workspaceDir, env: inheritedEnv, platform })
  const env = movScriptCliPathEnv({ env: inheritedEnv, cliBinDir, platform })
  const terminalPathKey = pathEnvKey(env, platform)

  const next: NodeJS.ProcessEnv = {
    ...env,
    TERM: env.TERM || 'xterm-256color',
    COLORTERM: env.COLORTERM || 'truecolor',
    [terminalPathKey]: normalizeDesktopShellHostPath(env[terminalPathKey], platform),
    MOVSCRIPT_WORKSPACE_DIR: session.workspaceDir,
    ...(input.projectDir ? { MOVSCRIPT_PROJECT_DIR: input.projectDir } : {}),
    ...(input.userId || session.userId ? { MOVSCRIPT_USER_ID: input.userId ?? session.userId } : {}),
    ...(input.orgId ? { MOVSCRIPT_ORG_ID: input.orgId } : {}),
    ...(input.projectId ? { MOVSCRIPT_PROJECT_ID: input.projectId } : {}),
    MOVSCRIPT_DATA_SERVICE_URL: session.baseURL,
    ...(session.token ? { MOVSCRIPT_DATA_SERVICE_TOKEN: session.token } : {}),
  }
  delete next.MOVSCRIPT_API_BASE_URL
  delete next.MOVSCRIPT_BACKEND_AUTH_TOKEN
  return next
}

function normalizeDesktopShellHostPath(currentPath: string | undefined, platform: NodeJS.Platform): string {
  const delimiter = platform === 'win32' ? ';' : ':'
  const entries = [
    ...(currentPath ?? '').split(delimiter),
    ...defaultTerminalPath(platform).split(delimiter),
  ].map((entry) => entry.trim()).filter(Boolean)
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = platform === 'win32' ? entry.toLowerCase() : entry
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(delimiter)
}

function defaultTerminalPath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return [
    'C:\\Windows\\System32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
  ].join(';')
  if (platform === 'darwin') return '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  return '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
}
