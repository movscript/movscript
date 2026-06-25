import * as electron from 'electron'
import { resolve } from 'path'

import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../movscriptWorkspaceDefaults'

export function resolveMediaPipelineHomeDir(): string {
  return resolveDesktopDefaultMovScriptWorkspaceDir()
}

export function resolveLegacyMediaPipelineHomeDir(): string | undefined {
  const currentHomeDir = resolve(resolveMediaPipelineHomeDir())
  const legacyHomeDir = resolve(electron.app.getPath('userData'))
  return legacyHomeDir === currentHomeDir ? undefined : legacyHomeDir
}

export function resolveMediaPipelineReadHomeDirs(): string[] {
  const currentHomeDir = resolveMediaPipelineHomeDir()
  const legacyHomeDir = resolveLegacyMediaPipelineHomeDir()
  return legacyHomeDir ? [currentHomeDir, legacyHomeDir] : [currentHomeDir]
}
