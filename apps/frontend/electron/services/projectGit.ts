import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { resolveMovScriptBackendSession } from '@movscript/core/backend/node'
import { resolveMovScriptProjectProjectionPaths } from '@movscript/core/workspace/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import type {
  ElectronProjectGitActionInput,
  ElectronProjectGitActionResult,
} from '../../src/shared/contracts/electronApi'

type ProjectGitOperation = 'push'

type WorkspaceMetadata = {
  projectId?: number
  repo?: string
  defaultBranch?: string
  gitRemoteUrl?: string
  status?: string
}

export async function pushProjectGitWorkspace(input: ElectronProjectGitActionInput): Promise<ElectronProjectGitActionResult> {
  return runProjectGitOperation('push', input)
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
  const userId = input?.userId ?? session.userId ?? 'local'
  const projectPaths = resolveMovScriptProjectProjectionPaths({ workspaceDir, userId, projectId })
  const branch = metadata.defaultBranch || 'main'
  const remoteURL = absoluteRemoteURL(session.baseURL, metadata.gitRemoteUrl || `/api/v1/projects/${projectId}/git/${metadata.repo || `movscript-project-${projectId}`}.git`)

  mkdirSync(projectPaths.projectDir, { recursive: true })
  const setupOutput = await ensureGitRepository(projectPaths.projectDir, remoteURL)
  if (setupOutput.code !== 0) {
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
  const result = await gitPush(projectPaths.projectDir, remoteURL, branch, session.token, orgId)

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
  const status = await git(cwd, ['status', '--porcelain'])
  if (status.code !== 0) return status
  if (status.stdout.trim()) {
    const add = await git(cwd, ['add', '-A'])
    if (add.code !== 0) return add
    const commit = await git(cwd, ['commit', '-m', 'Update MovScript project workspace'])
    if (commit.code !== 0) return commit
  }
  const hasHead = await git(cwd, ['rev-parse', '--verify', 'HEAD'])
  if (hasHead.code !== 0) {
    return {
      code: hasHead.code,
      stdout: hasHead.stdout,
      stderr: hasHead.stderr || 'No Git commit exists for this project workspace.',
    }
  }
  return gitWithAuth(cwd, remoteURL, token, orgId, ['push', 'movscript', `HEAD:${branch}`])
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
      resolve({ code: 1, stdout, stderr: error.message })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
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
