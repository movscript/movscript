import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspace,
  ensureMovScriptWorkspaceRoot,
  normalizeMovScriptWorkspaceConfigDirName,
  resolveMovScriptWorkspacePaths,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/core/workspace/node'
import type { ElectronProviderSessionSummary } from '../../src/shared/contracts/electronApi'
import type { ElectronMovScriptHomeInput } from '../../src/shared/contracts/electronApi'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'

export const MOVSCRIPT_PROVIDER_SESSION_SCHEMA = 'movscript.provider-session.v1'

export type ProviderSessionWorkspaceRecord = ElectronProviderSessionSummary & {
  schema: typeof MOVSCRIPT_PROVIDER_SESSION_SCHEMA
  providerProfileId: string
  providerProfileKey: string
  providerKey?: string
  endpoint?: string
  label?: string
  executablePath?: string
  home?: string
  workspaceContext?: ElectronProviderSessionSummary['workspaceContext']
  providerSessionCwd?: string
  statusUpdatedAt: string
}

export type ProviderSessionWorkspaceUpsertInput = ElectronMovScriptHomeInput & {
  providerProfileKey?: string
  providerProfileId: string
  providerKey?: string
  label?: string
  endpoint?: string
  executablePath?: string
  home?: string
  workspaceContext?: ElectronProviderSessionSummary['workspaceContext']
  providerSessionCwd?: string
  status: string
  message?: string
  now?: Date
}

export function listProviderSessionsFromWorkspace(input: ElectronMovScriptHomeInput & { providerProfileKey?: string } = {}): { sessions: ElectronProviderSessionSummary[] } {
  const workspaceDir = resolveMovScriptHomeDir(input)
  const requestedProfile = normalizeMovScriptWorkspaceConfigDirName(input.providerProfileKey)
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  mkdirSync(root.providersDir, { recursive: true })

  const profileNames = requestedProfile
    ? [requestedProfile]
    : readdirSync(root.providersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

  const sessions = profileNames.flatMap((profileName) => {
    const paths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: profileName })
    const sessionDir = paths.sessionsDir
    if (!existsSync(sessionDir)) return []
    return readdirSync(sessionDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .flatMap((entry) => {
        const record = readProviderSessionRecord(join(sessionDir, entry.name))
        return record ? [providerSessionSummaryFromRecord(record)] : []
      })
  })

  sessions.sort((left, right) => (right.session.updatedAt || '').localeCompare(left.session.updatedAt || ''))
  return { sessions }
}

export function upsertProviderSessionInWorkspace(input: ProviderSessionWorkspaceUpsertInput): ProviderSessionWorkspaceRecord {
  const workspaceDir = resolveMovScriptHomeDir(input)
  const providerProfileKey = normalizeMovScriptWorkspaceConfigDirName(input.providerProfileKey) ?? input.providerKey ?? 'default'
  const paths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: providerProfileKey })
  ensureMovScriptWorkspace(paths)
  const recordPath = join(paths.sessionsDir, `${safeSessionFileName(input.providerProfileId)}.json`)
  const previous = readProviderSessionRecord(recordPath)
  const now = (input.now ?? new Date()).toISOString()
  const createdAt = previous?.session.createdAt ?? now
  const title = input.label?.trim() || previous?.session.title || input.providerProfileId
  const previousStateTitle = previous?.state?.title?.trim()
  const previousSessionTitle = previous?.session.title?.trim()
  const preservedThreadTitle = previousStateTitle && previousStateTitle !== previousSessionTitle ? previousStateTitle : undefined
  const home = input.home?.trim() || previous?.home
  const workspaceContext = input.workspaceContext ?? previous?.workspaceContext
  const providerSessionCwd = input.providerSessionCwd?.trim() || previous?.providerSessionCwd
  const projectId = projectIdFromWorkspaceContext(workspaceContext)
    ?? projectIdFromProviderSessionCwd(providerSessionCwd)
    ?? previous?.state?.projectId
    ?? previous?.session.projectId
  const record: ProviderSessionWorkspaceRecord = {
    schema: MOVSCRIPT_PROVIDER_SESSION_SCHEMA,
    providerProfileId: input.providerProfileId,
    providerProfileKey,
    ...(input.providerKey ? { providerKey: input.providerKey } : {}),
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(input.executablePath ? { executablePath: input.executablePath } : {}),
    ...(home ? { home } : {}),
    workspaceDir: paths.workspaceDir,
    ...(workspaceContext ? { workspaceContext } : {}),
    ...(providerSessionCwd ? { providerSessionCwd } : {}),
    statusUpdatedAt: now,
    session: {
      id: input.providerProfileId,
      title,
      ...(projectId !== undefined ? { projectId } : {}),
      createdAt,
      updatedAt: now,
    },
    state: {
      ...(preservedThreadTitle ? { title: preservedThreadTitle } : {}),
      status: input.status,
      ...(projectId !== undefined ? { projectId } : {}),
      messageCount: previous?.state?.messageCount ?? 0,
      threadUpdatedAt: now,
      ...(input.message ? { lastMessageAt: now } : {}),
    },
    ...(previous?.runs ? { runs: previous.runs } : {}),
  }
  writeJSONAtomic(recordPath, record)
  return record
}

function providerSessionSummaryFromRecord(record: ProviderSessionWorkspaceRecord): ElectronProviderSessionSummary {
  const projectId = record.state?.projectId
    ?? record.session.projectId
    ?? projectIdFromWorkspaceContext(record.workspaceContext)
    ?? projectIdFromProviderSessionCwd(record.providerSessionCwd)
  return {
    session: {
      ...record.session,
      ...(projectId !== undefined ? { projectId } : {}),
    },
    ...(record.workspaceDir ? { movScriptHomeDir: record.workspaceDir, workspaceDir: record.workspaceDir } : {}),
    ...(record.workspaceContext ? { workspaceContext: record.workspaceContext } : {}),
    ...(record.providerSessionCwd ? { providerSessionCwd: record.providerSessionCwd } : {}),
    ...(record.state ? { state: { ...record.state, ...(projectId !== undefined ? { projectId } : {}) } } : {}),
    ...(record.runs ? { runs: record.runs } : {}),
  }
}

function readProviderSessionRecord(filePath: string): ProviderSessionWorkspaceRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_PROVIDER_SESSION_SCHEMA) return undefined
    if (!isRecord(parsed.session) || typeof parsed.session.id !== 'string' || typeof parsed.session.createdAt !== 'string' || typeof parsed.session.updatedAt !== 'string') return undefined
    if (typeof parsed.providerProfileId !== 'string' || typeof parsed.statusUpdatedAt !== 'string') return undefined
    const providerProfileKey = typeof parsed.providerProfileKey === 'string'
      ? parsed.providerProfileKey
      : typeof parsed.workspaceConfigDirName === 'string'
        ? parsed.workspaceConfigDirName
        : undefined
    if (!providerProfileKey) return undefined
    const providerKey = typeof parsed.providerKey === 'string' ? parsed.providerKey : undefined
    const providerSessionCwd = typeof parsed.providerSessionCwd === 'string' ? parsed.providerSessionCwd : undefined
    return {
      ...parsed,
      providerProfileKey,
      ...(providerKey ? { providerKey } : {}),
      ...(providerSessionCwd ? { providerSessionCwd } : {}),
    } as ProviderSessionWorkspaceRecord
  } catch {
    return undefined
  }
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function safeSessionFileName(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return safe || 'session'
}

function projectIdFromWorkspaceContext(context: ElectronProviderSessionSummary['workspaceContext'] | undefined): number | undefined {
  const value = context?.projectId
  const projectId = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
  return typeof projectId === 'number' && Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

function projectIdFromProviderSessionCwd(cwd: string | undefined): number | undefined {
  const normalized = cwd?.replace(/\\/g, '/')
  if (!normalized) return undefined
  const match = /(?:^|\/)(?:\.movscript\/)?(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
  if (!match?.[1]) return undefined
  const projectId = Number(match[1])
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
