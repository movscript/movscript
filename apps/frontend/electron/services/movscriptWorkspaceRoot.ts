import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceRootManifest,
} from '@movscript/core/workspace/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import type { ElectronMovScriptWorkspaceRootResult } from '../../src/shared/contracts/electronApi'

export function getMovScriptWorkspaceRoot(input?: { workspaceDir?: string }): ElectronMovScriptWorkspaceRootResult {
  const paths = resolveMovScriptWorkspaceRootPaths(input?.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir())
  const manifest = ensureMovScriptWorkspaceRoot(paths)
  return workspaceRootResult(paths, manifest)
}

function workspaceRootResult(
  paths: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  manifest: MovScriptWorkspaceRootManifest,
): ElectronMovScriptWorkspaceRootResult {
  return {
    workspaceDir: paths.workspaceDir,
    rootDir: paths.rootDir,
    controlDir: paths.controlDir,
    configTomlPath: paths.configTomlPath,
    manifestPath: paths.manifestPath,
    providersDir: paths.providersDir,
    backendDir: paths.backendDir,
    binDir: paths.binDir,
    manifest,
  }
}
