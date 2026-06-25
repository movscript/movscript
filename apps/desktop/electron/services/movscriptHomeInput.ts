import { resolve } from 'node:path'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import type { ElectronMovScriptHomeInput } from '../../src/shared/contracts/electronApi'

export function resolveMovScriptHomeDir(input?: ElectronMovScriptHomeInput | string): string {
  const rawDir = typeof input === 'string'
    ? input
    : input?.movScriptHomeDir ?? input?.workspaceDir
  return resolve(rawDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir())
}
