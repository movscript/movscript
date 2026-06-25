import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceRootManifest,
} from '@movscript/workspace/home'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import type { ElectronMovScriptHomeInput, ElectronMovScriptWorkspaceRootResult } from '../../src/shared/contracts/electronApi'

export function getMovScriptWorkspaceRoot(input?: ElectronMovScriptHomeInput): ElectronMovScriptWorkspaceRootResult {
  const paths = resolveMovScriptWorkspaceRootPaths(resolveMovScriptHomeDir(input))
  const manifest = ensureMovScriptWorkspaceRoot(paths)
  return workspaceRootResult(paths, manifest)
}

function workspaceRootResult(
  paths: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>,
  manifest: MovScriptWorkspaceRootManifest,
): ElectronMovScriptWorkspaceRootResult {
  return {
    movScriptHomeDir: paths.workspaceDir,
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
