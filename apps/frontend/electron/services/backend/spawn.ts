import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'

import {
  resolveBackendBinary,
  resolveBackendCwd,
  resolveLocalDataDir,
  resolveLocalSecret,
} from './paths'
import { writeBackendPid } from './pid'
import { buildBackendSpawnEnv } from './env'
import { createBackendOutputCapture, type BackendProcessDiagnostics } from './diagnostics'

export interface SpawnedBackendProcess {
  child: ChildProcess
  diagnostics: BackendProcessDiagnostics
}

export function spawnBackendProcess(): SpawnedBackendProcess {
  const bin = resolveBackendBinary()
  const cwd = resolveBackendCwd(bin)
  const dataDir = resolveLocalDataDir()
  const localSecret = resolveLocalSecret(dataDir)
  const env = buildBackendSpawnEnv({ dataDir, localSecret })
  const output = createBackendOutputCapture()
  console.info('[backend] spawn dependency providers', {
    profile: env.MOVSCRIPT_DEPENDENCY_PROFILE,
    database: env.DB_DRIVER,
    objectStorage: env.STORAGE_BACKEND,
    workspaceStorage: env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND || env.MOVSCRIPT_WORKSPACE_BACKEND,
    aiGateway: 'local',
    cache: env.CACHE_BACKEND,
    gitHTTPRoot: env.MOVSCRIPT_GIT_HTTP_ROOT,
    gitBinary: env.MOVSCRIPT_GIT_BINARY,
    giteaConfigured: Boolean(env.MOVSCRIPT_GITEA_BASE_URL && (env.MOVSCRIPT_GITEA_TOKEN || (env.MOVSCRIPT_GITEA_ADMIN_USERNAME && env.MOVSCRIPT_GITEA_ADMIN_PASSWORD))),
  })

  const child = spawn(bin, [], {
    cwd,
    detached: app.isPackaged,
    env,
    stdio: app.isPackaged ? 'ignore' : ['ignore', 'pipe', 'pipe'],
  })

  if (!app.isPackaged) {
    child.stdout?.on('data', (chunk: Buffer) => {
      output.append(chunk)
      process.stdout.write(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output.append(chunk)
      process.stderr.write(chunk)
    })
  }

  if (app.isPackaged) child.unref()
  if (child.pid) writeBackendPid(child.pid)
  return {
    child,
    diagnostics: {
      binary: bin,
      cwd,
      dataDir,
      recentOutput: () => output.tail(),
    },
  }
}
