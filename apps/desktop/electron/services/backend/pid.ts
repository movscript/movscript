import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../movscriptWorkspaceDefaults'
import { resolveLocalBackendPidPath } from './paths'

export function readBackendPid(): number | undefined {
  try {
    const pid = Number(readFileSync(defaultPidPath(), 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

export function writeBackendPid(pid: number): void {
  const path = defaultPidPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${pid}\n`, 'utf8')
}

export function clearBackendPid(): void {
  const path = defaultPidPath()
  if (existsSync(path)) rmSync(path, { force: true })
}

function defaultPidPath(): string {
  return resolveLocalBackendPidPath(resolveDesktopDefaultMovScriptWorkspaceDir())
}
