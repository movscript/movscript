import { spawn, type ChildProcess } from 'child_process'
import { appendFileSync, closeSync, createWriteStream, mkdirSync, openSync } from 'fs'
import { app } from 'electron'
import { dirname } from 'path'

import {
  resolveBackendBinary,
  resolveBackendCwd,
  resolveLocalBackendLogPath,
  resolveLocalDataDir,
  resolveLocalSecret,
} from './paths'
import { writeBackendPid } from './pid'
import { buildBackendSpawnEnv } from './env'
import { createBackendOutputCapture, readTextFileTail, type BackendProcessDiagnostics } from './diagnostics'

export interface SpawnedBackendProcess {
  child: ChildProcess
  diagnostics: BackendProcessDiagnostics
}

export function spawnBackendProcess(): SpawnedBackendProcess {
  const bin = resolveBackendBinary()
  const cwd = resolveBackendCwd(bin)
  const dataDir = resolveLocalDataDir()
  const localSecret = resolveLocalSecret(dataDir)
  const logPath = resolveLocalBackendLogPath()
  const env = buildBackendSpawnEnv({ dataDir, localSecret })
  const output = createBackendOutputCapture()
  mkdirSync(dirname(logPath), { recursive: true })
  appendBackendLogHeader(logPath, { bin, cwd, dataDir })
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

  const child = app.isPackaged
    ? spawnPackagedBackend({ bin, cwd, env, logPath })
    : spawnDevelopmentBackend({ bin, cwd, env, logPath, output })

  if (!app.isPackaged) {
    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk))
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
  }

  if (app.isPackaged) child.unref()
  if (child.pid) writeBackendPid(child.pid)
  return {
    child,
    diagnostics: {
      binary: bin,
      cwd,
      dataDir,
      logPath,
      recentOutput: () => output.tail() || readTextFileTail(logPath),
    },
  }
}

function spawnPackagedBackend(input: {
  bin: string
  cwd: string
  env: NodeJS.ProcessEnv
  logPath: string
}): ChildProcess {
  const logFd = openSync(input.logPath, 'a')
  try {
    const child = spawn(input.bin, [], {
      cwd: input.cwd,
      detached: true,
      env: input.env,
      stdio: ['ignore', logFd, logFd],
    })
    return child
  } finally {
    closeSync(logFd)
  }
}

function spawnDevelopmentBackend(input: {
  bin: string
  cwd: string
  env: NodeJS.ProcessEnv
  logPath: string
  output: ReturnType<typeof createBackendOutputCapture>
}): ChildProcess {
  const child = spawn(input.bin, [], {
    cwd: input.cwd,
    detached: false,
    env: input.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logStream = createWriteStream(input.logPath, { flags: 'a' })
  logStream.on('error', (error) => {
    console.warn('[backend] failed to write local backend log', error)
  })
  child.stdout?.on('data', (chunk: Buffer) => {
    input.output.append(chunk)
    logStream.write(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    input.output.append(chunk)
    logStream.write(chunk)
  })
  child.once('close', () => logStream.end())
  child.once('error', () => logStream.end())
  return child
}

function appendBackendLogHeader(path: string, input: { bin: string; cwd: string; dataDir: string }): void {
  appendFileSync(path, [
    '',
    `===== MovScript local backend start ${new Date().toISOString()} =====`,
    `binary=${input.bin}`,
    `cwd=${input.cwd}`,
    `dataDir=${input.dataDir}`,
    '',
  ].join('\n'))
}
