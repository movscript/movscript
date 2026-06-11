export type MovScriptFileChangeState = 'added' | 'modified' | 'deleted' | 'unchanged'

export interface MovScriptFileSnapshot {
  path: string
  relativePath: string
  hash: string
}

export interface MovScriptFileChange {
  path: string
  currentPath: string
  state: MovScriptFileChangeState
  contentHash?: string
  currentContentHash?: string
}

export interface DiffMovScriptFileSnapshotsOptions {
  basePath?: string
}

export function diffMovScriptFileSnapshots(
  workingFiles: readonly MovScriptFileSnapshot[],
  baselineFiles: readonly MovScriptFileSnapshot[],
  options: DiffMovScriptFileSnapshotsOptions = {},
): MovScriptFileChange[] {
  const basePath = options.basePath ?? ''
  const workingByRelativePath = new Map(workingFiles.map((file) => [file.relativePath, file]))
  const baselineByRelativePath = new Map(baselineFiles.map((file) => [file.relativePath, file]))
  const keys = [...new Set([...workingByRelativePath.keys(), ...baselineByRelativePath.keys()])].sort()

  return keys.flatMap((relativePath): MovScriptFileChange[] => {
    const working = workingByRelativePath.get(relativePath)
    const baseline = baselineByRelativePath.get(relativePath)
    if (working && !baseline) {
      return [{
        path: working.path,
        currentPath: joinWorkspacePath(basePath, relativePath),
        state: 'added',
        contentHash: working.hash,
      }]
    }
    if (!working && baseline) {
      return [{
        path: relativePath,
        currentPath: baseline.path,
        state: 'deleted',
        currentContentHash: baseline.hash,
      }]
    }
    if (working && baseline && working.hash !== baseline.hash) {
      return [{
        path: working.path,
        currentPath: baseline.path,
        state: 'modified',
        contentHash: working.hash,
        currentContentHash: baseline.hash,
      }]
    }
    return []
  })
}

function joinWorkspacePath(root: string, relativePath: string): string {
  return root ? `${root.replace(/\/$/, '')}/${relativePath}` : relativePath
}
