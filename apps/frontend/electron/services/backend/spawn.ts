import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'

import {
  resolveAdminDir,
  resolveBackendBinary,
  resolveBackendCwd,
  resolveLocalDataDir,
  resolveLocalSecret,
} from './paths'
import { writeBackendPid } from './pid'
import { buildBackendSpawnEnv } from './env'

export function spawnBackendProcess(): ChildProcess {
  const bin = resolveBackendBinary()
  const adminDir = resolveAdminDir()
  const dataDir = resolveLocalDataDir()
  const localSecret = resolveLocalSecret(dataDir)
  const env = buildBackendSpawnEnv({ adminDir, dataDir, localSecret })
  console.info('[backend] spawn dependency providers', {
    profile: env.MOVSCRIPT_DEPENDENCY_PROFILE,
    database: env.DB_DRIVER,
    objectStorage: env.STORAGE_BACKEND,
    workspaceStorage: env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND || env.MOVSCRIPT_WORKSPACE_BACKEND,
    aiGateway: env.MOVSCRIPT_AI_GATEWAY_PROVIDER,
    cache: env.CACHE_BACKEND,
    gitHTTPRoot: env.MOVSCRIPT_GIT_HTTP_ROOT,
    gitBinary: env.MOVSCRIPT_GIT_BINARY,
    giteaConfigured: Boolean(env.MOVSCRIPT_GITEA_BASE_URL && (env.MOVSCRIPT_GITEA_TOKEN || (env.MOVSCRIPT_GITEA_ADMIN_USERNAME && env.MOVSCRIPT_GITEA_ADMIN_PASSWORD))),
  })

  const child = spawn(bin, [], {
    cwd: resolveBackendCwd(bin),
    detached: app.isPackaged,
    env,
    stdio: app.isPackaged ? 'ignore' : 'inherit',
  })

  if (app.isPackaged) child.unref()
  if (child.pid) writeBackendPid(child.pid)
  return child
}
