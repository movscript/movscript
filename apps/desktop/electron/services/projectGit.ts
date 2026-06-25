import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import type {
  ElectronProjectGitActionInput,
  ElectronProjectGitActionResult,
} from '../../src/shared/contracts/electronApi'

type ProjectGitOperation = 'commit' | 'init' | 'pull' | 'push' | 'status'

type GitRemote = {
  name: string
  url: string
}

export async function pushProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('push', input)
}

export async function initProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('init', input)
}

export async function getProjectGitWorkspaceStatus(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('status', input)
}

export async function commitProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('commit', input)
}

export async function pullProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('pull', input)
}

async function runProjectGitOperation(operation: ProjectGitOperation, input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  const projectCwd = normalizeProjectDir(input?.projectDir)
  const projectId = normalizeOptionalPositiveInteger(input?.projectId)
  const workspaceDir = resolveMovScriptHomeDir(input)
  const base = {
    operation,
    ...(projectId !== undefined ? { projectId } : {}),
    workspaceDir,
    path: projectCwd,
  }

  if (operation === 'status') {
    return { ...base, ...(await readGitStatus(projectCwd)) }
  }

  mkdirSync(projectCwd, { recursive: true })
  const init = await ensureLocalGitRepository(projectCwd)
  if (init.code !== 0) {
    return {
      ...base,
      ok: false,
      stdout: init.stdout,
      stderr: init.stderr,
      error: init.stderr || init.stdout || 'Git repository setup failed.',
    }
  }

  if (operation === 'init') {
    const remote = await resolveProjectRemote(projectCwd, input.remoteURL)
    const status = await readGitStatus(projectCwd)
    return {
      ...base,
      ...status,
      ok: true,
      initialized: true,
      hasGit: true,
      ...(remote ? { remoteName: remote.name, remoteURL: remote.url } : {}),
      stdout: init.stdout,
      stderr: init.stderr,
    }
  }

  if (operation === 'commit') {
    const commit = await gitCommit(projectCwd)
    const status = await readGitStatus(projectCwd)
    return {
      ...base,
      ...status,
      ok: commit.code === 0,
      hasGit: true,
      stdout: [init.stdout, commit.stdout].filter(Boolean).join('\n'),
      stderr: [init.stderr, commit.stderr].filter(Boolean).join('\n'),
      ...(commit.code === 0 ? {} : { error: commit.stderr || commit.stdout || 'git commit failed' }),
    }
  }

  const remote = await resolveProjectRemote(projectCwd, input.remoteURL)
  if (!remote) {
    const status = await readGitStatus(projectCwd)
    return {
      ...base,
      ...status,
      ok: false,
      hasGit: true,
      error: 'Project Git remote is not configured. Set a remote repository for this project directory before pull or push.',
    }
  }
  const branch = await currentBranch(projectCwd)
  const result = operation === 'pull'
    ? await git(projectCwd, ['pull', '--ff-only', remote.name, branch])
    : await gitPush(projectCwd, remote.name, branch)

  const status = await readGitStatus(projectCwd)
  return {
    ...base,
    ...status,
    ok: result.code === 0,
    hasGit: true,
    remoteName: remote.name,
    remoteURL: remote.url,
    branch,
    stdout: [init.stdout, result.stdout].filter(Boolean).join('\n'),
    stderr: [init.stderr, result.stderr].filter(Boolean).join('\n'),
    ...(result.code === 0 ? {} : { error: result.stderr || result.stdout || `git ${operation} failed with exit code ${result.code}` }),
  }
}

async function ensureLocalGitRepository(cwd: string): Promise<GitResult> {
  let stdout = ''
  let stderr = ''
  if (!existsSync(join(cwd, '.git'))) {
    const init = await git(cwd, ['init'])
    stdout += init.stdout
    stderr += init.stderr
    if (init.code !== 0) return init
  }
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

async function readGitStatus(cwd: string): Promise<Pick<ElectronProjectGitActionResult, 'ok' | 'hasGit' | 'hasHead' | 'isDirty' | 'changedFiles' | 'branch' | 'remoteName' | 'remoteURL' | 'stdout' | 'stderr' | 'error'>> {
  if (!existsSync(join(cwd, '.git'))) {
    return { ok: true, hasGit: false, hasHead: false, isDirty: false, changedFiles: 0 }
  }
  const status = await git(cwd, ['status', '--porcelain'])
  const branch = await currentBranch(cwd).catch(() => undefined)
  const remote = await resolveProjectRemote(cwd).catch(() => undefined)
  const hasHead = (await git(cwd, ['rev-parse', '--verify', 'HEAD'])).code === 0
  if (status.code !== 0) {
    return {
      ok: false,
      hasGit: true,
      hasHead,
      branch,
      ...(remote ? { remoteName: remote.name, remoteURL: remote.url } : {}),
      stdout: status.stdout,
      stderr: status.stderr,
      error: status.stderr || status.stdout || 'git status failed',
    }
  }
  const changedFiles = status.stdout.split('\n').map((line) => line.trim()).filter(Boolean).length
  return {
    ok: true,
    hasGit: true,
    hasHead,
    isDirty: changedFiles > 0,
    changedFiles,
    branch,
    ...(remote ? { remoteName: remote.name, remoteURL: remote.url } : {}),
    stdout: status.stdout,
    stderr: status.stderr,
  }
}

async function resolveProjectRemote(cwd: string, explicitRemoteURL?: string): Promise<GitRemote | undefined> {
  const explicit = explicitRemoteURL?.trim()
  if (explicit) {
    await setRemote(cwd, 'movscript', explicit)
    return { name: 'movscript', url: explicit }
  }
  for (const name of ['movscript', 'origin']) {
    const remote = await git(cwd, ['remote', 'get-url', name])
    if (remote.code === 0 && remote.stdout.trim()) return { name, url: remote.stdout.trim() }
  }
  return undefined
}

async function setRemote(cwd: string, name: string, url: string): Promise<void> {
  const existing = await git(cwd, ['remote', 'get-url', name])
  const result = existing.code === 0
    ? await git(cwd, ['remote', 'set-url', name, url])
    : await git(cwd, ['remote', 'add', name, url])
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `git remote ${name} failed`)
}

async function currentBranch(cwd: string): Promise<string> {
  const branch = await git(cwd, ['branch', '--show-current'])
  return branch.code === 0 && branch.stdout.trim() ? branch.stdout.trim() : 'main'
}

async function gitPush(cwd: string, remoteName: string, branch: string): Promise<GitResult> {
  const commit = await gitCommit(cwd, { noChangesMessage: null })
  if (commit.code !== 0) return commit
  const push = await git(cwd, ['push', remoteName, `HEAD:${branch}`])
  return {
    code: push.code,
    stdout: [commit.stdout, push.stdout].filter(Boolean).join('\n'),
    stderr: [commit.stderr, push.stderr].filter(Boolean).join('\n'),
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

type GitResult = {
  code: number
  stdout: string
  stderr: string
}

function git(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolveResult) => {
    logProjectGit('git command', { cwd, args })
    const child = spawn('git', args, {
      cwd,
      env: process.env,
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
      resolveResult({ code: 1, stdout, stderr: error.message })
    })
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }
      logProjectGit('git result', { cwd, args, ...result })
      resolveResult(result)
    })
  })
}

function normalizeProjectDir(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('projectDir is required. The legacy projectId workspace path is no longer supported.')
  }
  return resolve(value)
}

function normalizeOptionalPositiveInteger(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return undefined
  return id
}

function logProjectGit(message: string, details: Record<string, unknown>): void {
  console.log(`[movscript:project-git] ${message}`, details)
}
