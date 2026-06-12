import {
  resolveMovScriptBackendSession,
  type MovScriptBackendSession,
  type MovScriptBackendSessionInput,
} from '@movscript/core/backend/node'
import { movScriptCliPathEnv, resolveMovScriptCliBinDir } from './movscriptCliPath'

export type LocalTerminalEnvInput = {
  inheritedEnv?: NodeJS.ProcessEnv
  workspaceDir: string
  projectDir?: string
  userId?: string
  orgId?: string
  projectId?: string
  resolveBackendSession?: (input: MovScriptBackendSessionInput) => MovScriptBackendSession
  resolveCliBinDir?: typeof resolveMovScriptCliBinDir
}

export function localTerminalEnv(input: LocalTerminalEnvInput): NodeJS.ProcessEnv {
  const inheritedEnv = input.inheritedEnv ?? process.env
  const resolveBackend = input.resolveBackendSession ?? resolveMovScriptBackendSession
  const resolveCliBin = input.resolveCliBinDir ?? resolveMovScriptCliBinDir
  const session = resolveBackend({ workspaceDir: input.workspaceDir })
  const cliBinDir = resolveCliBin({ workspaceDir: session.workspaceDir, env: inheritedEnv })
  const env = movScriptCliPathEnv({ env: inheritedEnv, cliBinDir })

  return {
    ...env,
    TERM: env.TERM || 'xterm-256color',
    COLORTERM: env.COLORTERM || 'truecolor',
    PATH: env.PATH || defaultTerminalPath(),
    MOVSCRIPT_WORKSPACE_DIR: session.workspaceDir,
    ...(input.projectDir ? { MOVSCRIPT_PROJECT_DIR: input.projectDir } : {}),
    ...(input.userId ? { MOVSCRIPT_USER_ID: input.userId } : {}),
    ...(input.orgId ? { MOVSCRIPT_ORG_ID: input.orgId } : {}),
    ...(input.projectId ? { MOVSCRIPT_PROJECT_ID: input.projectId } : {}),
    MOVSCRIPT_API_BASE_URL: session.baseURL,
    ...(session.token ? { MOVCLI_TOKEN: session.token } : {}),
    ...(session.userId ? { MOVCLI_USER_ID: session.userId } : {}),
  }
}

function defaultTerminalPath(): string {
  if (process.platform === 'win32') return [
    'C:\\Windows\\System32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
  ].join(';')
  if (process.platform === 'darwin') return '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  return '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
}
