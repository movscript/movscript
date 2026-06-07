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
  console.info('[backend] spawn git config', {
    workspaceBackend: env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND || env.MOVSCRIPT_WORKSPACE_BACKEND,
    giteaBaseURLSet: Boolean(env.MOVSCRIPT_GITEA_BASE_URL),
    giteaTokenSet: Boolean(env.MOVSCRIPT_GITEA_TOKEN),
    giteaAdminBasicSet: Boolean(env.MOVSCRIPT_GITEA_ADMIN_USERNAME && env.MOVSCRIPT_GITEA_ADMIN_PASSWORD),
    giteaRepoPrefix: env.MOVSCRIPT_GITEA_REPO_PREFIX,
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
