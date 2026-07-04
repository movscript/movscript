import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../movscriptWorkspaceDefaults'
import { buildBackendSpawnEnv } from './env'
import { createBackendOutputCapture, type BackendDiagnostics } from './diagnostics'
import { resolveLocalBackendLogPath, resolveLocalDataDir, resolveLocalSecret } from './paths'
import { writeBackendPid } from './pid'

export interface SpawnedBackendProcess {
  child: ChildProcess
  diagnostics: BackendDiagnostics
}

export function spawnBackendProcess(): SpawnedBackendProcess {
  const movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const dataDir = resolveLocalDataDir(movScriptHomeDir)
  const localSecret = resolveLocalSecret(dataDir)
  const binary = resolveBackendBinary()
  const cwd = resolve(process.cwd(), 'services/data-service')
  const logPath = resolveLocalBackendLogPath(movScriptHomeDir)
  const capture = createBackendOutputCapture()
  const env = buildBackendSpawnEnv({ dataDir, localSecret })

  mkdirSync(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(binary, [], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  if (child.pid) writeBackendPid(child.pid)
  child.stdout?.on('data', (chunk) => {
    capture.append(chunk)
    log.write(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    capture.append(chunk)
    log.write(chunk)
  })
  child.once('close', () => log.end())

  return {
    child,
    diagnostics: {
      binary,
      cwd,
      dataDir,
      logPath,
      recentOutput: capture.recentOutput,
    },
  }
}

function resolveBackendBinary(): string {
  const explicit = process.env.MOVSCRIPT_BACKEND_BINARY?.trim()
  if (explicit) return explicit
  const extension = process.platform === 'win32' ? '.exe' : ''
  return join(process.cwd(), 'services/data-service/bin/movscript-server' + extension)
}
