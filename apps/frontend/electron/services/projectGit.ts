import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { resolveMovScriptBackendSession } from '@movscript/core/backend/node'
import { resolveMovScriptProjectWorkspacePaths } from '@movscript/core/workspace/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import type {
  ElectronProjectGitActionInput,
  ElectronProjectGitActionResult,
} from '../../src/shared/contracts/electronApi'

type ProjectGitOperation = 'commit' | 'init' | 'pull' | 'push'

type WorkspaceMetadata = {
  projectId?: number
  provider?: string
  owner?: string
  repo?: string
  defaultBranch?: string
  gitRemoteUrl?: string
  status?: string
  lastSyncError?: string
}

export async function pushProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('push', input)
}

export async function initProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('init', input)
}

export async function commitProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('commit', input)
}

export async function pullProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('pull', input)
}

async function runProjectGitOperation(operation: ProjectGitOperation, input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  const projectId = normalizeProjectId(input?.projectId)
  const workspaceDir = input?.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
  const session = resolveMovScriptBackendSession({ workspaceDir })
  const orgId = normalizeOptionalId(input?.orgId)
  if (!session.token) {
    return {
      ok: false,
      operation,
      projectId,
      workspaceDir,
      path: '',
      error: 'MovScript backend auth token is missing.',
    }
  }
  const metadata = await fetchWorkspaceMetadata(session, projectId, orgId)
  logProjectGit('metadata', {
    operation,
    projectId,
    provider: metadata.provider,
    owner: metadata.owner,
    repo: metadata.repo,
    defaultBranch: metadata.defaultBranch,
    status: metadata.status,
    lastSyncError: metadata.lastSyncError,
    gitRemoteUrl: metadata.gitRemoteUrl,
  })
  if (metadata.status && metadata.status !== 'active') {
    return {
      ok: false,
      operation,
      projectId,
      workspaceDir,
      path: '',
      branch: metadata.defaultBranch || 'main',
      error: `Project repository is not ready: ${metadata.status}${metadata.lastSyncError ? ` (${metadata.lastSyncError})` : ''}`,
    }
  }
  const userId = input?.userId ?? session.userId ?? 'local'
  const projectPaths = resolveMovScriptProjectWorkspacePaths({ workspaceDir, userId, projectId })
  const branch = metadata.defaultBranch || 'main'
  const remoteURL = absoluteRemoteURL(session.baseURL, metadata.gitRemoteUrl || `/api/v1/projects/${projectId}/git/${metadata.repo || `movscript-project-${projectId}`}.git`)

  mkdirSync(projectPaths.projectDir, { recursive: true })
  if (operation !== 'pull') {
    ensureProjectReadme(projectPaths.projectDir, projectId)
  }
  logProjectGit('start', {
    operation,
    projectId,
    workspaceDir,
    projectDir: projectPaths.projectDir,
    remoteURL,
    branch,
  })
  const setupOutput = await ensureGitRepository(projectPaths.projectDir, remoteURL)
  if (setupOutput.code !== 0) {
    logProjectGit('setup failed', {
      operation,
      projectId,
      projectDir: projectPaths.projectDir,
      code: setupOutput.code,
      stdout: setupOutput.stdout,
      stderr: setupOutput.stderr,
    })
    return {
      ok: false,
      operation,
      projectId,
      workspaceDir,
      path: projectPaths.projectDir,
      remoteURL,
      branch,
      stdout: setupOutput.stdout,
      stderr: setupOutput.stderr,
      error: setupOutput.stderr || setupOutput.stdout || 'Git repository setup failed.',
    }
  }
  if (operation === 'init') {
    logProjectGit('init completed', {
      operation,
      projectId,
      projectDir: projectPaths.projectDir,
      stdout: setupOutput.stdout,
      stderr: setupOutput.stderr,
    })
    return {
      ok: true,
      operation,
      projectId,
      workspaceDir,
      path: projectPaths.projectDir,
      remoteURL,
      branch,
      stdout: setupOutput.stdout,
      stderr: setupOutput.stderr,
    }
  }
  const result = operation === 'pull'
    ? await gitPull(projectPaths.projectDir, remoteURL, branch, session.token, projectId, orgId)
    : operation === 'commit'
      ? await gitCommit(projectPaths.projectDir)
      : await gitPush(projectPaths.projectDir, remoteURL, branch, session.token, orgId)
  if (operation === 'pull' && result.code === 0) {
    ensureProjectReadme(projectPaths.projectDir, projectId)
  }

  logProjectGit('finished', {
    operation,
    projectId,
    projectDir: projectPaths.projectDir,
    code: result.code,
    stdout: [setupOutput.stdout, result.stdout].filter(Boolean).join('\n'),
    stderr: [setupOutput.stderr, result.stderr].filter(Boolean).join('\n'),
  })
  return {
    ok: result.code === 0,
    operation,
    projectId,
    workspaceDir,
    path: projectPaths.projectDir,
    remoteURL,
    branch,
    stdout: [setupOutput.stdout, result.stdout].filter(Boolean).join('\n'),
    stderr: [setupOutput.stderr, result.stderr].filter(Boolean).join('\n'),
    ...(result.code === 0 ? {} : { error: result.stderr || result.stdout || `git ${operation} failed with exit code ${result.code}` }),
  }
}

function ensureProjectReadme(projectDir: string, projectId: number): void {
  const readmePath = join(projectDir, 'project.md')
  if (existsSync(readmePath)) return
  writeFileSync(readmePath, projectReadmeContent(projectId), 'utf8')
  logProjectGit('created project.md', { projectId, projectDir, path: readmePath })
}

function removeGeneratedProjectReadme(projectDir: string, projectId: number): boolean {
  const readmePath = join(projectDir, 'project.md')
  if (!existsSync(readmePath)) return false
  if (!statSync(readmePath).isFile()) return false
  const content = readFileSync(readmePath, 'utf8')
  if (content !== projectReadmeContent(projectId)) return false
  unlinkSync(readmePath)
  logProjectGit('removed generated project.md before initial checkout', { projectId, projectDir, path: readmePath })
  return true
}

function projectReadmeContent(projectId: number): string {
  return `# MovScript Project ${projectId}\n\nThis file anchors the project workspace Git repository.\n`
}

async function fetchWorkspaceMetadata(session: ReturnType<typeof resolveMovScriptBackendSession>, projectId: number, orgId?: string): Promise<WorkspaceMetadata> {
  const headers: Record<string, string> = {}
  if (session.token) headers.Authorization = `Bearer ${session.token}`
  if (session.userId) headers['X-User-ID'] = session.userId
  if (orgId) headers['X-Org-ID'] = orgId
  const response = await fetch(`${session.apiBaseURL}/projects/${encodeURIComponent(String(projectId))}/workspace`, { headers })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GET project workspace failed with ${response.status}${text.trim() ? `: ${text.trim()}` : ''}`)
  }
  return await response.json() as WorkspaceMetadata
}

async function ensureGitRepository(cwd: string, remoteURL: string): Promise<GitResult> {
  let stdout = ''
  let stderr = ''
  if (!existsSync(join(cwd, '.git'))) {
    const init = await git(cwd, ['init'])
    stdout += init.stdout
    stderr += init.stderr
    if (init.code !== 0) return init
  }
  const remote = await git(cwd, ['remote'])
  stdout += remote.stdout
  stderr += remote.stderr
  if (remote.code !== 0) return remote
  const remotes = new Set(remote.stdout.split(/\s+/).map((value) => value.trim()).filter(Boolean))
  const remoteResult = remotes.has('movscript')
    ? await git(cwd, ['remote', 'set-url', 'movscript', remoteURL])
    : await git(cwd, ['remote', 'add', 'movscript', remoteURL])
  stdout += remoteResult.stdout
  stderr += remoteResult.stderr
  if (remoteResult.code !== 0) return remoteResult
  await ensureGitIdentity(cwd)
  return { code: 0, stdout, stderr }
}

async function ensureGitIdentity(cwd: string): Promise<void> {
  const name = await git(cwd, ['config', 'user.name'])
  if (name.code !== 0 || !name.stdout.trim()) {
    await git(cwd, ['config', 'user.name', 'MovScript'])
  }
  const email = await git(cwd, ['config', 'user.email'])
  if (email.code !== 0 || !email.stdout.trim()) {
    await git(cwd, ['config', 'user.email', 'movscript@localhost'])
  }
}

async function gitPush(cwd: string, remoteURL: string, branch: string, token: string, orgId?: string): Promise<GitResult> {
  const commit = await gitCommit(cwd, { noChangesMessage: null })
  if (commit.code !== 0) return commit
  const push = await gitWithAuth(cwd, remoteURL, token, orgId, ['push', 'movscript', `HEAD:${branch}`])
  if (push.code === 0 || !isPushRejectedBecauseRemoteHasWork(push)) {
    return {
      code: push.code,
      stdout: [commit.stdout, push.stdout].filter(Boolean).join('\n'),
      stderr: [commit.stderr, push.stderr].filter(Boolean).join('\n'),
    }
  }
  const sync = await syncRemoteBranchBeforePush(cwd, remoteURL, branch, token, orgId)
  if (sync.code !== 0) {
    return {
      code: sync.code,
      stdout: [commit.stdout, push.stdout, sync.stdout].filter(Boolean).join('\n'),
      stderr: [commit.stderr, push.stderr, sync.stderr].filter(Boolean).join('\n'),
    }
  }
  const retryPush = await gitWithAuth(cwd, remoteURL, token, orgId, ['push', 'movscript', `HEAD:${branch}`])
  return {
    code: retryPush.code,
    stdout: [commit.stdout, push.stdout, sync.stdout, retryPush.stdout].filter(Boolean).join('\n'),
    stderr: [commit.stderr, push.stderr, sync.stderr, retryPush.stderr].filter(Boolean).join('\n'),
  }
}

function isPushRejectedBecauseRemoteHasWork(result: GitResult): boolean {
  return /non-fast-forward|fetch first|failed to push some refs|rejected/i.test(`${result.stdout}\n${result.stderr}`)
}

async function syncRemoteBranchBeforePush(cwd: string, remoteURL: string, branch: string, token: string, orgId?: string): Promise<GitResult> {
  const fetch = await gitWithAuth(cwd, remoteURL, token, orgId, ['fetch', 'movscript', branch])
  if (fetch.code !== 0) {
    if (/couldn't find remote ref|could not find remote ref/i.test(fetch.stderr)) {
      return { code: 0, stdout: '', stderr: '' }
    }
    return fetch
  }
  const mergeBase = await git(cwd, ['merge-base', 'HEAD', 'FETCH_HEAD'])
  const merge = mergeBase.code === 0
    ? await git(cwd, ['merge', '--ff-only', 'FETCH_HEAD'])
    : await git(cwd, ['merge', '--allow-unrelated-histories', '--no-edit', 'FETCH_HEAD'])
  return {
    code: merge.code,
    stdout: [fetch.stdout, merge.stdout].filter(Boolean).join('\n'),
    stderr: [fetch.stderr, merge.stderr].filter(Boolean).join('\n'),
  }
}

async function gitCommit(cwd: string, options: { noChangesMessage?: string | null } = {}): Promise<GitResult> {
  const status = await git(cwd, ['status', '--porcelain'])
  if (status.code !== 0) return status
  if (!status.stdout.trim()) {
    const hasHead = await git(cwd, ['rev-parse', '--verify', 'HEAD'])
    if (hasHead.code === 0) {
      const noChangesMessage = options.noChangesMessage === undefined ? 'No local changes to commit.' : options.noChangesMessage
      logProjectGit('skip commit: no local changes', { cwd, hasHead: true })
      return { code: 0, stdout: noChangesMessage || '', stderr: '' }
    }
  }
  const add = await git(cwd, ['add', '-A'])
  if (add.code !== 0) return add
  const commit = await git(cwd, ['commit', '-m', 'Update MovScript project workspace'])
  if (commit.code !== 0) return commit
  const hasHead = await git(cwd, ['rev-parse', '--verify', 'HEAD'])
  if (hasHead.code !== 0) {
    return {
      code: hasHead.code,
      stdout: hasHead.stdout,
      stderr: hasHead.stderr || 'No Git commit exists for this project workspace.',
    }
  }
  return commit
}

async function gitPull(cwd: string, remoteURL: string, branch: string, token: string, projectId: number, orgId?: string): Promise<GitResult> {
  const hasHead = await git(cwd, ['rev-parse', '--verify', 'HEAD'])
  if (hasHead.code !== 0) {
    const fetch = await gitWithAuth(cwd, remoteURL, token, orgId, ['fetch', 'movscript', branch])
    if (fetch.code !== 0) return fetch
    removeGeneratedProjectReadme(cwd, projectId)
    const checkout = await git(cwd, ['checkout', '-B', branch, 'FETCH_HEAD'])
    return {
      code: checkout.code,
      stdout: [fetch.stdout, checkout.stdout].filter(Boolean).join('\n'),
      stderr: [fetch.stderr, checkout.stderr].filter(Boolean).join('\n'),
    }
  }
  return gitWithAuth(cwd, remoteURL, token, orgId, ['pull', '--ff-only', 'movscript', branch])
}

function gitWithAuth(cwd: string, remoteURL: string, token: string, orgId: string | undefined, args: string[]): Promise<GitResult> {
  const entries = [
    ['http.extraHeader', `Authorization: Bearer ${token}`],
    ...(orgId ? [['http.extraHeader', `X-Org-ID: ${orgId}`]] : []),
  ]
  const env: Record<string, string> = {
    GIT_CONFIG_COUNT: String(entries.length),
  }
  entries.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key
    env[`GIT_CONFIG_VALUE_${index}`] = value
  })
  return git(cwd, args, env)
}

type GitResult = {
  code: number
  stdout: string
  stderr: string
}

function git(cwd: string, args: string[], env?: Record<string, string>): Promise<GitResult> {
  return new Promise((resolve) => {
    logProjectGit('git command', { cwd, args })
    const child = spawn('git', args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      logProjectGit('git error', { cwd, args, error: error.message })
      resolve({ code: 1, stdout, stderr: error.message })
    })
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }
      logProjectGit('git result', { cwd, args, ...result })
      resolve(result)
    })
  })
}

function logProjectGit(message: string, details: Record<string, unknown>): void {
  console.log(`[movscript:project-git] ${message}`, details)
}

function normalizeProjectId(value: string | number | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('projectId must be a positive integer')
  }
  return id
}

function normalizeOptionalId(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('orgId must be a positive integer')
  }
  return String(id)
}

function absoluteRemoteURL(baseURL: string, remoteURL: string): string {
  return new URL(remoteURL, `${baseURL.replace(/\/+$/, '')}/`).toString()
}
