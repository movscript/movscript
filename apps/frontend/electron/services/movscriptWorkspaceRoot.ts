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
    manifestPath: paths.manifestPath,
    editDir: paths.editDir,
    buildDir: paths.buildDir,
    buildCurrentDir: paths.buildCurrentDir,
    buildIndexesDir: paths.buildIndexesDir,
    buildReviewsDir: paths.buildReviewsDir,
    buildManifestsDir: paths.buildManifestsDir,
    providersDir: paths.providersDir,
    backendDir: paths.backendDir,
    manifest,
  }
}
