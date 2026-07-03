import type {
  ProjectSurfaceShellJob,
  ProjectSurfaceShellJobInput,
  ProjectSurfaceShellJobListInput,
  ProjectSurfaceShellListInput,
  ProjectSurfaceShellSession,
  ShellGateway,
} from '@movscript/project-surface/runtime'

import type { ShellSession } from '@/features/shell/ShellWorkbenchModel'
import {
  createShellWorkbenchSession,
  getShellWorkbenchSession,
  getShellWorkbenchSessionLogs,
  listShellWorkbenchSessions,
  revealShellWorkbenchSession,
  runShellWorkbenchCommand,
  stopShellWorkbenchSession,
  writeShellWorkbenchSession,
} from '@/features/shell/useShellWorkbenchController'

export function createDesktopShellGateway(input: {
  projectId: string
  projectUid?: string
  projectDir?: string
}): ShellGateway {
  return {
    async list(listInput = {}) {
      return {
        sessions: listShellWorkbenchSessions()
          .filter((session) => shellSessionMatchesListInput(session, listInput))
          .map(projectSurfaceShellSessionFromShellWorkbench),
      }
    },
    async create(createInput = {}) {
      const projectContext = shellProjectContextForScope(createInput.scope, input, createInput)
      return projectSurfaceShellSessionFromShellWorkbench(createShellWorkbenchSession({
        title: createInput.title,
        owner: createInput.owner,
        scope: createInput.scope,
        ownerFeature: createInput.ownerFeature,
        cwd: createInput.scope === 'home' ? createInput.cwd : createInput.cwd ?? input.projectDir,
        ...projectContext,
        reveal: false,
      }))
    },
    async run(runInput) {
      const scope = runInput.scope ?? 'workspace'
      const projectContext = shellProjectContextForScope(scope, input, runInput)
      const reveal = normalizeShellGatewayReveal(runInput.reveal)
      return projectSurfaceShellSessionFromShellWorkbench(runShellWorkbenchCommand({
        title: runInput.title,
        owner: runInput.owner ?? 'system',
        scope,
        cwd: scope === 'home' ? runInput.cwd : runInput.cwd ?? input.projectDir,
        command: runInput.command,
        initialCommand: runInput.command,
        ownerFeature: runInput.ownerFeature,
        jobReveal: reveal,
        ...projectContext,
        previewUrl: runInput.previewUrl,
        reveal: reveal === 'always',
      }))
    },
    async get(sessionInput) {
      const session = getShellWorkbenchSession(sessionInput.sessionId)
      return session ? projectSurfaceShellSessionFromShellWorkbench(session) : undefined
    },
    async logs(sessionInput) {
      return {
        sessionId: sessionInput.sessionId,
        text: getShellWorkbenchSessionLogs(sessionInput.sessionId),
      }
    },
    async listJobs(listInput = {}) {
      return {
        jobs: listShellWorkbenchSessions()
          .filter((session) => shellSessionJobMatchesListInput(session, listInput))
          .map(projectSurfaceShellJobFromShellWorkbench)
          .filter((job): job is ProjectSurfaceShellJob => Boolean(job)),
      }
    },
    async getJob(jobInput) {
      const session = shellWorkbenchSessionForJobInput(jobInput)
      return session ? projectSurfaceShellJobFromShellWorkbench(session) : undefined
    },
    async jobLogs(jobInput) {
      const session = shellWorkbenchSessionForJobInput(jobInput)
      const sessionId = session?.id ?? jobInput.sessionId ?? ''
      const jobId = session?.jobId ?? jobInput.jobId ?? ''
      return {
        jobId,
        sessionId,
        text: sessionId ? getShellWorkbenchSessionLogs(sessionId) : '',
      }
    },
    async write(writeInput) {
      await writeShellWorkbenchSession(writeInput.sessionId, writeInput.data)
    },
    async stop(sessionInput) {
      await stopShellWorkbenchSession(sessionInput.sessionId)
    },
    async reveal(sessionInput) {
      revealShellWorkbenchSession(sessionInput.sessionId)
    },
  }
}

function normalizeShellGatewayReveal(reveal: boolean | 'always' | 'on_error' | 'silent' | undefined): 'always' | 'on_error' | 'silent' {
  if (reveal === false) return 'silent'
  if (reveal === 'on_error' || reveal === 'silent') return reveal
  return 'always'
}

function shellSessionMatchesListInput(
  session: ShellSession,
  input: ProjectSurfaceShellListInput,
): boolean {
  if (input.scope && session.scope !== input.scope) return false
  if (input.projectId && session.projectId !== input.projectId) return false
  if (input.projectUid && session.projectUid !== input.projectUid) return false
  return true
}

function shellSessionJobMatchesListInput(
  session: ShellSession,
  input: ProjectSurfaceShellJobListInput,
): boolean {
  const job = projectSurfaceShellJobFromShellWorkbench(session)
  if (!job) return false
  if (input.ownerFeature && job.ownerFeature !== input.ownerFeature) return false
  return shellSessionMatchesListInput(session, input)
}

function shellWorkbenchSessionForJobInput(input: ProjectSurfaceShellJobInput): ShellSession | undefined {
  const jobId = input.jobId?.trim()
  const sessionId = input.sessionId?.trim() || shellWorkbenchSessionIdFromJobId(jobId)
  return listShellWorkbenchSessions().find((session) => {
    if (sessionId) return session.id === sessionId
    return Boolean(jobId && session.jobId === jobId)
  })
}

function shellWorkbenchSessionIdFromJobId(jobId: string | undefined): string {
  const normalized = jobId?.trim() ?? ''
  const prefix = 'desktop-shell-host-job:'
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : ''
}

function shellProjectContextForScope(
  scope: ProjectSurfaceShellListInput['scope'] | undefined,
  fallback: { projectId: string; projectUid?: string; projectDir?: string },
  input: ProjectSurfaceShellListInput,
): { projectId?: string; projectUid?: string; projectDir?: string } {
  if (scope === 'home') return {}
  return {
    projectId: input.projectId ?? fallback.projectId,
    ...(input.projectUid ?? fallback.projectUid ? { projectUid: input.projectUid ?? fallback.projectUid } : {}),
    ...(input.projectDir ?? fallback.projectDir ? { projectDir: input.projectDir ?? fallback.projectDir } : {}),
  }
}

function projectSurfaceShellJobFromShellWorkbench(session: ShellSession): ProjectSurfaceShellJob | undefined {
  const commandText = session.command || session.initialCommand
  if (session.owner !== 'system' || !commandText) return undefined
  const status = projectSurfaceShellJobStatusFromShellSession(session)
  return {
    schema: 'movscript.shell_job.v1',
    jobId: session.jobId ?? `desktop-shell-host-job:${session.id}`,
    sessionId: session.id,
    title: session.title,
    ownerFeature: session.ownerFeature ?? 'shell',
    scope: session.scope,
    status,
    cwd: session.cwd,
    command: shellCommandTextFallbackArray(commandText),
    commandText,
    command_text: commandText,
    reveal: session.jobReveal ?? 'always',
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ? { projectDir: session.projectDir } : {}),
    ...(session.previewUrl ? { previewUrl: session.previewUrl } : {}),
    startedAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(status === 'running' || status === 'queued' ? {} : { endedAt: session.updatedAt }),
  }
}

function projectSurfaceShellJobStatusFromShellSession(session: ShellSession): ProjectSurfaceShellJob['status'] {
  if (session.status === 'starting') return 'queued'
  if (session.status === 'running') return 'running'
  if (session.status === 'failed') return 'failed'
  if (session.signal !== undefined) return 'stopped'
  if (session.status === 'exited' && session.exitCode === 0) return 'succeeded'
  if (session.status === 'exited') return 'failed'
  return 'queued'
}

function shellCommandTextFallbackArray(commandText: string): string[] {
  return [commandText.trim()].filter(Boolean)
}

function projectSurfaceShellSessionFromShellWorkbench(session: ShellSession): ProjectSurfaceShellSession {
  return {
    schema: session.schema,
    id: session.id,
    ...(session.jobId ? { jobId: session.jobId } : {}),
    title: session.title,
    owner: session.owner,
    scope: session.scope,
    ...(session.ownerFeature ? { ownerFeature: session.ownerFeature } : {}),
    status: session.status,
    cwd: session.cwd,
    command: session.command,
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ? { projectDir: session.projectDir } : {}),
    ...(session.previewUrl ? { previewUrl: session.previewUrl } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}
