import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceRootManifest,
} from '@movscript/workspaces/node'
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
    controlDir: paths.controlDir,
    manifestPath: paths.manifestPath,
    projectionRootDir: paths.projectionRootDir,
    reviewsDir: paths.reviewsDir,
    syncDir: paths.syncDir,
    providersDir: paths.providersDir,
    manifest,
  }
}
