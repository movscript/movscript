import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { normalizeWorkspacePath } from '../layout/index.js'

const execFileAsync = promisify(execFile)

export const MOVSCRIPT_GIT_SOURCE_PATHS = [
  'project.json',
  'project_standards.json',
  'settings',
  'scripts',
  'content_units',
  'productions',
] as const

export interface NodeMovScriptGitWorkspaceState {
  rootDir: string
  available: boolean
  insideWorkTree: boolean
  hasHead: boolean
  repoRoot?: string
  head?: string
}

export interface NodeMovScriptGitSourceFile {
  path: string
  content: string
}

export type NodeMovScriptGitSourceFileChangeState = 'added' | 'modified' | 'deleted' | 'moved'

export interface NodeMovScriptGitSourceFileChange {
  path: string
  state: NodeMovScriptGitSourceFileChangeState
  previousPath?: string
  statusCode: string
}

export interface NodeMovScriptGitCommitInput {
  message: string
  initIfMissing?: boolean
  userName?: string
  userEmail?: string
  pathspecs?: readonly string[]
}

export async function inspectNodeMovScriptGitWorkspace(rootDir: string): Promise<NodeMovScriptGitWorkspaceState> {
  const root = resolve(rootDir)
  if (!await isGitAvailable()) {
    return { rootDir: root, available: false, insideWorkTree: false, hasHead: false }
  }
  const repoRoot = await gitStdout(root, ['rev-parse', '--show-toplevel']).catch(() => undefined)
  if (!repoRoot) {
    return { rootDir: root, available: true, insideWorkTree: false, hasHead: false }
  }
  const head = await currentNodeMovScriptGitHead(root)
  return {
    rootDir: root,
    available: true,
    insideWorkTree: true,
    hasHead: Boolean(head),
    repoRoot: repoRoot.trim(),
    ...(head ? { head } : {}),
  }
}

export async function ensureNodeMovScriptGitRepository(rootDir: string): Promise<NodeMovScriptGitWorkspaceState> {
  const root = resolve(rootDir)
  const state = await inspectNodeMovScriptGitWorkspace(root)
  if (state.insideWorkTree) return state
  if (!state.available) throw new Error('git command is not available')
  await mkdir(root, { recursive: true })
  await execFileAsync('git', ['-C', root, 'init'])
  return inspectNodeMovScriptGitWorkspace(root)
}

export async function currentNodeMovScriptGitHead(rootDir: string): Promise<string | undefined> {
  const head = await gitStdout(rootDir, ['rev-parse', '--verify', 'HEAD']).catch(() => undefined)
  return head?.trim() || undefined
}

export async function readNodeMovScriptGitSourceFiles(
  rootDir: string,
  gitRef: string,
  pathspecs: readonly string[] = MOVSCRIPT_GIT_SOURCE_PATHS,
): Promise<NodeMovScriptGitSourceFile[]> {
  const stdout = await gitStdout(rootDir, [
    'ls-tree',
    '-r',
    '--name-only',
    gitRef,
    '--',
    ...pathspecs,
  ]).catch(() => '')
  const paths = stdout.split('\n').map((path) => normalizeWorkspacePath(path)).filter(Boolean)
  const files: NodeMovScriptGitSourceFile[] = []
  for (const path of paths) {
    try {
      const content = await gitStdout(rootDir, ['show', `${gitRef}:${path}`], 1024 * 1024 * 20)
      files.push({ path, content })
    } catch {
      // Ignore paths that cannot be materialized from this ref.
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

export async function readNodeMovScriptGitSourceFileChanges(
  rootDir: string,
  gitRef: string,
  pathspecs: readonly string[] = MOVSCRIPT_GIT_SOURCE_PATHS,
): Promise<NodeMovScriptGitSourceFileChange[]> {
  const trackedStdout = await gitStdout(rootDir, [
    'diff',
    '--name-status',
    '--find-renames',
    gitRef,
    '--',
    ...pathspecs,
  ]).catch(() => '')
  const changes = trackedStdout
    .split('\n')
    .map(parseGitNameStatusLine)
    .filter((change): change is NodeMovScriptGitSourceFileChange => change !== undefined)

  const seenPaths = new Set(changes.map((change) => change.path))
  const untrackedStdout = await gitStdout(rootDir, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    ...pathspecs,
  ]).catch(() => '')
  for (const path of untrackedStdout.split('\n').map((item) => normalizeWorkspacePath(item)).filter(Boolean)) {
    if (seenPaths.has(path)) continue
    changes.push({
      path,
      state: 'added',
      statusCode: '??',
    })
    seenPaths.add(path)
  }

  return changes.sort((left, right) => {
    return left.path.localeCompare(right.path)
      || String(left.previousPath ?? '').localeCompare(String(right.previousPath ?? ''))
      || left.statusCode.localeCompare(right.statusCode)
  })
}

export async function commitNodeMovScriptGitCheckpoint(
  rootDir: string,
  input: NodeMovScriptGitCommitInput,
): Promise<string> {
  const state = input.initIfMissing
    ? await ensureNodeMovScriptGitRepository(rootDir)
    : await inspectNodeMovScriptGitWorkspace(rootDir)
  if (!state.insideWorkTree) {
    throw new Error('commitCheckpoint requires a git repository; pass initIfMissing to initialize one explicitly')
  }
  const pathspecs = [...(input.pathspecs ?? MOVSCRIPT_GIT_SOURCE_PATHS)]
  await execFileAsync('git', ['-C', rootDir, 'add', '--all', '--', ...pathspecs])
  const status = await gitStdout(rootDir, ['status', '--porcelain', '--', ...pathspecs])
  if (status.trim()) {
    await execFileAsync('git', [
      '-C',
      rootDir,
      '-c',
      `user.name=${input.userName ?? 'MovScript'}`,
      '-c',
      `user.email=${input.userEmail ?? 'movscript@example.invalid'}`,
      'commit',
      '-m',
      input.message,
      '--',
      ...pathspecs,
    ])
  }
  const head = await currentNodeMovScriptGitHead(rootDir)
  if (!head) throw new Error('commitCheckpoint requires a git HEAD after commit')
  return head
}

async function isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'])
    return true
  } catch {
    return false
  }
}

async function gitStdout(rootDir: string, args: string[], maxBuffer?: number): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', rootDir, ...args], {
    ...(maxBuffer ? { maxBuffer } : {}),
  })
  return stdout
}

function parseGitNameStatusLine(line: string): NodeMovScriptGitSourceFileChange | undefined {
  const parts = line.split('\t').filter(Boolean)
  const statusCode = parts[0]
  if (!statusCode) return undefined
  const status = statusCode[0]
  if (status === 'R') {
    const previousPath = parts[1] ? normalizeWorkspacePath(parts[1]) : undefined
    const path = parts[2] ? normalizeWorkspacePath(parts[2]) : undefined
    if (!previousPath || !path) return undefined
    return {
      path,
      previousPath,
      state: 'moved',
      statusCode,
    }
  }
  const path = parts[1] ? normalizeWorkspacePath(parts[1]) : undefined
  if (!path) return undefined
  if (status === 'A') return { path, state: 'added', statusCode }
  if (status === 'D') return { path, state: 'deleted', statusCode }
  return { path, state: 'modified', statusCode }
}
