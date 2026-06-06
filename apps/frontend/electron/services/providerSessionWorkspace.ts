import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspace,
  ensureMovScriptWorkspaceRoot,
  normalizeMovScriptWorkspaceConfigDirName,
  resolveMovScriptWorkspacePaths,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspaces/node'
import type { ElectronProviderSessionSummary } from '../../src/shared/contracts/electronApi'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

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

export type ProviderSessionWorkspaceUpsertInput = {
  workspaceDir?: string
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

export function listProviderSessionsFromWorkspace(input: { workspaceDir?: string; providerProfileKey?: string } = {}): { sessions: ElectronProviderSessionSummary[] } {
  const workspaceDir = input.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
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
  const workspaceDir = input.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
  const providerProfileKey = normalizeMovScriptWorkspaceConfigDirName(input.providerProfileKey) ?? input.providerKey ?? 'default'
  const paths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: providerProfileKey })
  ensureMovScriptWorkspace(paths)
  const recordPath = join(paths.sessionsDir, `${safeSessionFileName(input.providerProfileId)}.json`)
  const previous = readProviderSessionRecord(recordPath)
  const now = (input.now ?? new Date()).toISOString()
  const createdAt = previous?.session.createdAt ?? now
  const title = input.label?.trim() || previous?.session.title || input.providerProfileId
  const home = input.home?.trim() || previous?.home
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
    ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : previous?.workspaceContext ? { workspaceContext: previous.workspaceContext } : {}),
    ...(input.providerSessionCwd?.trim() ? { providerSessionCwd: input.providerSessionCwd.trim() } : previous?.providerSessionCwd ? { providerSessionCwd: previous.providerSessionCwd } : {}),
    statusUpdatedAt: now,
    session: {
      id: input.providerProfileId,
      title,
      createdAt,
      updatedAt: now,
    },
    state: {
      title,
      status: input.status,
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
  return {
    session: record.session,
    ...(record.workspaceDir ? { workspaceDir: record.workspaceDir } : {}),
    ...(record.workspaceContext ? { workspaceContext: record.workspaceContext } : {}),
    ...(record.providerSessionCwd ? { providerSessionCwd: record.providerSessionCwd } : {}),
    ...(record.state ? { state: record.state } : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
