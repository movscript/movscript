import type {
  NodeMovScriptGitSourceFileChange,
} from '@movscript/workspace/node'
import {
  getNodeMovScriptWorkspaceFileRepositoryRoot,
  readNodeMovScriptGitSourceFileChanges,
} from '@movscript/workspace/node'
import type {
  MovScriptWorkspaceFileRepository,
} from '@movscript/workspace/repository'
import {
  isMovScriptContentUnitDecisionPath,
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'
import {
  MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR,
  type CheckpointSourceSnapshot,
  type WorkspaceSourceOptions,
} from './sourceStore.js'
import type {
  MovScriptWorkspaceChangedFile,
  MovScriptWorkspaceReviewIssue,
} from './types.js'

export function findUncoveredGitSourceFileChanges(
  gitChanges: readonly NodeMovScriptGitSourceFileChange[],
  changedFiles: readonly MovScriptWorkspaceChangedFile[],
): NodeMovScriptGitSourceFileChange[] {
  const reviewPaths = new Set(changedFiles.flatMap((file) => {
    const path = normalizeWorkspacePath(file.path)
    const currentPath = normalizeWorkspacePath(file.currentPath)
    return [path, currentPath].filter((item) => item && !item.startsWith(`${MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR}/`))
  }))
  return gitChanges.filter((change) => {
    const paths = [
      normalizeWorkspacePath(change.path),
      ...(change.previousPath ? [normalizeWorkspacePath(change.previousPath)] : []),
    ]
    return paths.every((path) => !reviewPaths.has(path))
  })
}

export async function validateGitFileChangeCoverage(
  fileRepository: MovScriptWorkspaceFileRepository,
  baseline: CheckpointSourceSnapshot,
  changedFiles: readonly MovScriptWorkspaceChangedFile[],
  options: WorkspaceSourceOptions = {},
): Promise<MovScriptWorkspaceReviewIssue[]> {
  if (baseline.source !== 'git' || !baseline.checkpointHash) return []
  const rootDir = getNodeMovScriptWorkspaceFileRepositoryRoot(fileRepository)
  if (!rootDir) return []
  const gitChanges = (await readNodeMovScriptGitSourceFileChanges(rootDir, baseline.checkpointHash))
    .filter((change) => {
      if (options.includeContentUnitDecisionDocuments !== false) return true
      return !isMovScriptContentUnitDecisionPath(change.path)
        && (change.previousPath === undefined || !isMovScriptContentUnitDecisionPath(change.previousPath))
    })
  if (gitChanges.length === 0) return []

  const missing = findUncoveredGitSourceFileChanges(gitChanges, changedFiles)
  if (missing.length === 0) return []
  return [{
    path: '.',
    severity: 'warning',
    message: `git diff reported source file changes not present in review changedFiles: ${missing.map((change) => change.previousPath ? `${change.previousPath}->${change.path}` : change.path).join(', ')}`,
  }]
}
