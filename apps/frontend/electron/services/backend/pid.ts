import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolveLocalDataDir } from './paths'

function resolveBackendPidPath(): string {
  return join(resolveLocalDataDir(), 'movscript-backend.pid')
}

export function readBackendPid(): number | undefined {
  try {
    const raw = readFileSync(resolveBackendPidPath(), 'utf8').trim()
    const pid = Number(raw)
    return Number.isInteger(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

export function writeBackendPid(pid: number): void {
  const pidPath = resolveBackendPidPath()
  mkdirSync(join(pidPath, '..'), { recursive: true })
  writeFileSync(pidPath, String(pid), 'utf8')
}

export function clearBackendPid(): void {
  try {
    unlinkSync(resolveBackendPidPath())
  } catch {
    // Missing pid files are expected after manual cleanup or first launch.
  }
}
