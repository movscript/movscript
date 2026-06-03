import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

export const AGENT_WORKSPACE_DIR_NAME = '.movscript'
export const AGENT_RUNTIME_DIR_NAME = 'agent'
export const AGENT_SESSIONS_DIR_NAME = 'sessions'
export const AGENT_CACHE_DIR_NAME = 'cache'
export const AGENT_RUN_DIR_NAME = 'run'
export const AGENT_CONFIG_FILE_NAME = 'config.json'
export const SESSION_FILE_NAME = 'session.json'
export const SESSION_ROLLOUT_LOG_FILE_PREFIX = 'rollout'
export const SESSION_RUNTIME_FILE_NAME = 'runtime.json'
export const SESSION_RUNTIME_CONFIG_SNAPSHOT_FILE_NAME = 'runtime-config.snapshot.json'
export const SESSION_LOCK_FILE_NAME = 'run.lock'
export const SESSION_HEARTBEAT_FILE_NAME = 'heartbeat'
export const SESSION_SOCKET_FILE_NAME = 'agent.sock'

export interface AgentWorkspaceRuntimePaths {
  workspaceDir: string
  rootDir: string
  agentDir: string
  configPath: string
  cacheDir: string
  runDir: string
  sessionsDir: string
}

export interface AgentSessionRuntimePaths extends AgentWorkspaceRuntimePaths {
  sessionId: string
  sessionDate: string
  sessionDir: string
  sessionPath: string
  runtimeLogPath: string
  memoryPath: string
  workspacePath: string
  toolResultPath: string
  catalogStatePath: string
  modelConfigPath: string
  traceDir: string
  runtimePath: string
  runtimeConfigSnapshotPath: string
  lockPath: string
  heartbeatPath: string
  socketPath: string
  logsDir: string
  artifactsDir: string
  tmpDir: string
}

export interface AgentWorkspaceConfig {
  schema: 'movscript.agent.workspace-config.v1'
  updatedAt: string
  modelConfig?: Record<string, unknown>
  catalog?: {
    skillsDir?: string
    toolsDir?: string
    packsDir?: string
    configFilesDir?: string
  }
  toolProviders?: Array<Record<string, unknown>>
  permissions?: Record<string, unknown>
  environment?: Record<string, string>
}

export interface AgentSessionRecord {
  schema: 'movscript.agent.session.v1'
  id: string
  title?: string
  projectId?: number
  createdAt: string
  updatedAt: string
  archived?: boolean
}

export interface AgentSessionRuntimeRecord {
  schema: 'movscript.agent.session-runtime.v1'
  sessionId: string
  pid: number
  endpoint: string
  transport: 'http' | 'unix-socket' | 'stdio'
  token?: string
  startedAt: string
  heartbeatAt: string
  version: string
  startedBy: 'desktop' | 'cli' | 'agent' | 'unknown'
  workspaceDir: string
}

export interface AgentSessionRuntimeHealth {
  alive: boolean
  stale: boolean
  heartbeatAgeMs?: number
  runtime?: AgentSessionRuntimeRecord
}

export interface AgentSessionRuntimeSummary {
  session: AgentSessionRecord
  workspaceDir: string
  state?: AgentSessionStateSummary
  runs?: AgentSessionRunSummary[]
  paths: Pick<AgentSessionRuntimePaths, 'sessionDate' | 'sessionDir' | 'runtimeLogPath' | 'runtimePath' | 'lockPath' | 'heartbeatPath' | 'socketPath'>
  runtime?: AgentSessionRuntimeRecord
  running: boolean
  stale: boolean
  heartbeatAgeMs?: number
}

export interface AgentSessionStateSummary {
  rootThreadId?: string
  interactiveThreadId?: string
  activeThreadId?: string
  title?: string
  projectId?: number
  archived?: boolean
  status?: string
  threadUpdatedAt?: string
  messageCount: number
  lastMessageAt?: string
}

export interface AgentSessionRunSummary {
  id: string
  sessionId?: string
  threadId: string
  status: string
  role?: string
  parentRunId?: string
  taskGraphId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
  pendingApprovals?: unknown[]
  pendingInputRequests?: unknown[]
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  error?: string
  warnings?: string[]
  steps: unknown[]
}

export function resolveAgentWorkspaceRuntimePaths(workspaceDir = process.cwd()): AgentWorkspaceRuntimePaths {
  const rootDir = resolve(workspaceDir)
  const agentDir = join(rootDir, AGENT_WORKSPACE_DIR_NAME, AGENT_RUNTIME_DIR_NAME)
  return {
    workspaceDir: rootDir,
    rootDir,
    agentDir,
    configPath: join(agentDir, AGENT_CONFIG_FILE_NAME),
    cacheDir: join(agentDir, AGENT_CACHE_DIR_NAME),
    runDir: join(agentDir, AGENT_RUN_DIR_NAME),
    sessionsDir: join(agentDir, AGENT_SESSIONS_DIR_NAME),
  }
}

export function resolveAgentSessionRuntimePaths(input: { workspaceDir?: string; sessionId: string; createdAt?: string | Date }): AgentSessionRuntimePaths {
  const workspacePaths = resolveAgentWorkspaceRuntimePaths(input.workspaceDir)
  const sessionId = sanitizeSessionId(input.sessionId)
  const sessionDate = findExistingSessionDate(workspacePaths.sessionsDir, sessionId)
    ?? sessionDatePath(input.createdAt ?? new Date())
  const sessionDir = join(workspacePaths.sessionsDir, sessionDate, sessionId)
  return {
    ...workspacePaths,
    sessionId,
    sessionDate,
    sessionDir,
    sessionPath: join(sessionDir, SESSION_FILE_NAME),
    runtimeLogPath: join(sessionDir, sessionRolloutLogFileName(sessionDate, sessionId)),
    memoryPath: join(sessionDir, 'memories.json'),
    workspacePath: join(sessionDir, 'workspaces.json'),
    toolResultPath: join(sessionDir, 'tool-results.json'),
    catalogStatePath: join(sessionDir, 'catalog.json'),
    modelConfigPath: join(sessionDir, 'model-config.json'),
    traceDir: join(sessionDir, 'traces'),
    runtimePath: join(sessionDir, SESSION_RUNTIME_FILE_NAME),
    runtimeConfigSnapshotPath: join(sessionDir, SESSION_RUNTIME_CONFIG_SNAPSHOT_FILE_NAME),
    lockPath: join(sessionDir, SESSION_LOCK_FILE_NAME),
    heartbeatPath: join(sessionDir, SESSION_HEARTBEAT_FILE_NAME),
    socketPath: join(resolveAgentRuntimeSocketDir(), `${shortSessionPathHash(workspacePaths.workspaceDir, sessionId)}.${SESSION_SOCKET_FILE_NAME}`),
    logsDir: join(sessionDir, 'logs'),
    artifactsDir: join(sessionDir, 'artifacts'),
    tmpDir: join(sessionDir, 'tmp'),
  }
}

export function ensureAgentWorkspaceRuntime(paths: AgentWorkspaceRuntimePaths): void {
  mkdirSync(paths.agentDir, { recursive: true })
  mkdirSync(paths.cacheDir, { recursive: true })
  mkdirSync(paths.runDir, { recursive: true })
  mkdirSync(paths.sessionsDir, { recursive: true })
  if (!existsSync(paths.configPath)) writeAgentWorkspaceConfig(paths.configPath, defaultAgentWorkspaceConfig())
}

export function ensureAgentSessionRuntime(paths: AgentSessionRuntimePaths, input: { title?: string; projectId?: number } = {}): AgentSessionRecord {
  ensureAgentWorkspaceRuntime(paths)
  mkdirSync(paths.sessionDir, { recursive: true })
  mkdirSync(paths.traceDir, { recursive: true })
  mkdirSync(paths.logsDir, { recursive: true })
  mkdirSync(paths.artifactsDir, { recursive: true })
  mkdirSync(paths.tmpDir, { recursive: true })
  const now = new Date().toISOString()
  const existing = readAgentSessionRecord(paths.sessionPath)
  const title = input.title?.trim()
  const session: AgentSessionRecord = {
    ...(existing ?? {
      schema: 'movscript.agent.session.v1',
      id: paths.sessionId,
      createdAt: now,
      updatedAt: now,
    }),
    ...(title ? { title } : {}),
    ...(Number.isInteger(input.projectId) ? { projectId: input.projectId } : {}),
  }
  writeJSONAtomic(paths.sessionPath, { ...session, updatedAt: now })
  snapshotAgentWorkspaceConfig(paths)
  return { ...session, updatedAt: now }
}

export function updateAgentSessionRecord(paths: AgentSessionRuntimePaths, input: { title?: string; projectId?: number; archived?: boolean; createdAt?: string; updatedAt?: string } = {}): AgentSessionRecord {
  ensureAgentWorkspaceRuntime(paths)
  mkdirSync(paths.sessionDir, { recursive: true })
  const now = input.updatedAt?.trim() || new Date().toISOString()
  const existing = readAgentSessionRecord(paths.sessionPath) ?? fallbackAgentSessionRecordFromDir(paths.sessionDir)
  const title = input.title?.trim()
  const existingProjectId = existing?.projectId
  const session: AgentSessionRecord = {
    schema: 'movscript.agent.session.v1',
    id: paths.sessionId,
    ...(existing?.title ? { title: existing.title } : {}),
    ...(Number.isInteger(existingProjectId) ? { projectId: existingProjectId } : {}),
    createdAt: input.createdAt?.trim() || existing?.createdAt || now,
    updatedAt: now,
    ...(existing?.archived === true ? { archived: true } : {}),
  }
  if (title) session.title = title
  if (Number.isInteger(input.projectId)) session.projectId = input.projectId
  if (input.archived === true) session.archived = true
  if (input.archived === false) delete session.archived
  writeJSONAtomic(paths.sessionPath, session)
  return session
}

export function defaultAgentWorkspaceConfig(): AgentWorkspaceConfig {
  return {
    schema: 'movscript.agent.workspace-config.v1',
    updatedAt: new Date().toISOString(),
  }
}

export function readAgentWorkspaceConfig(configPath: string): AgentWorkspaceConfig {
  const parsed = readJSON(configPath)
  if (!isRecord(parsed) || parsed.schema !== 'movscript.agent.workspace-config.v1') return defaultAgentWorkspaceConfig()
  return {
    schema: 'movscript.agent.workspace-config.v1',
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    ...(isRecord(parsed.modelConfig) ? { modelConfig: parsed.modelConfig } : {}),
    ...(normalizeWorkspaceCatalogConfig(parsed.catalog) ? { catalog: normalizeWorkspaceCatalogConfig(parsed.catalog) } : {}),
    ...(Array.isArray(parsed.toolProviders) ? { toolProviders: parsed.toolProviders.filter(isRecord) } : {}),
    ...(isRecord(parsed.permissions) ? { permissions: parsed.permissions } : {}),
    ...(isStringRecord(parsed.environment) ? { environment: parsed.environment } : {}),
  }
}

export function writeAgentWorkspaceConfig(configPath: string, config: AgentWorkspaceConfig): void {
  writeJSONAtomic(configPath, {
    ...config,
    schema: 'movscript.agent.workspace-config.v1',
    updatedAt: config.updatedAt || new Date().toISOString(),
  })
}

export function snapshotAgentWorkspaceConfig(paths: AgentSessionRuntimePaths): AgentWorkspaceConfig {
  const config = readAgentWorkspaceConfig(paths.configPath)
  writeJSONAtomic(paths.runtimeConfigSnapshotPath, config)
  return config
}

export function writeAgentSessionRuntimeRecord(paths: AgentSessionRuntimePaths, input: Omit<AgentSessionRuntimeRecord, 'schema' | 'workspaceDir' | 'sessionId' | 'heartbeatAt'> & { heartbeatAt?: string }): AgentSessionRuntimeRecord {
  const now = new Date().toISOString()
  const runtime: AgentSessionRuntimeRecord = {
    schema: 'movscript.agent.session-runtime.v1',
    sessionId: paths.sessionId,
    workspaceDir: paths.workspaceDir,
    heartbeatAt: input.heartbeatAt ?? now,
    ...input,
  }
  writeJSONAtomic(paths.runtimePath, runtime)
  writeFileSync(paths.heartbeatPath, `${runtime.heartbeatAt}\n`, 'utf8')
  return runtime
}

export function readAgentSessionRuntimeRecord(runtimePath: string): AgentSessionRuntimeRecord | undefined {
  const parsed = readJSON(runtimePath)
  if (!isRecord(parsed) || parsed.schema !== 'movscript.agent.session-runtime.v1') return undefined
  const sessionId = stringField(parsed.sessionId)
  const pid = typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : undefined
  const endpoint = stringField(parsed.endpoint)
  const transport = parsed.transport === 'unix-socket' || parsed.transport === 'stdio' || parsed.transport === 'http' ? parsed.transport : undefined
  const startedAt = stringField(parsed.startedAt)
  const heartbeatAt = stringField(parsed.heartbeatAt)
  const version = stringField(parsed.version)
  const workspaceDir = stringField(parsed.workspaceDir)
  if (!sessionId || !pid || !endpoint || !transport || !startedAt || !heartbeatAt || !version || !workspaceDir) return undefined
  return {
    schema: 'movscript.agent.session-runtime.v1',
    sessionId,
    pid,
    endpoint,
    transport,
    ...(typeof parsed.token === 'string' ? { token: parsed.token } : {}),
    startedAt,
    heartbeatAt,
    version,
    startedBy: parsed.startedBy === 'desktop' || parsed.startedBy === 'cli' || parsed.startedBy === 'agent' ? parsed.startedBy : 'unknown',
    workspaceDir,
  }
}

export function touchAgentSessionHeartbeat(paths: AgentSessionRuntimePaths, now = new Date()): void {
  const runtime = readAgentSessionRuntimeRecord(paths.runtimePath)
  const heartbeatAt = now.toISOString()
  if (runtime) {
    writeAgentSessionRuntimeRecord(paths, {
      ...runtime,
      heartbeatAt,
    })
    return
  }
  writeFileSync(paths.heartbeatPath, `${heartbeatAt}\n`, 'utf8')
}

export function getAgentSessionRuntimeHealth(paths: AgentSessionRuntimePaths, input: { staleAfterMs?: number } = {}): AgentSessionRuntimeHealth {
  const staleAfterMs = input.staleAfterMs ?? 15_000
  const runtime = readAgentSessionRuntimeRecord(paths.runtimePath)
  if (!runtime) return { alive: false, stale: true }
  const heartbeatMs = Date.parse(runtime.heartbeatAt)
  const heartbeatAgeMs = Number.isFinite(heartbeatMs) ? Date.now() - heartbeatMs : undefined
  const stale = heartbeatAgeMs === undefined || heartbeatAgeMs > staleAfterMs
  return {
    alive: isProcessAlive(runtime.pid),
    stale,
    ...(heartbeatAgeMs !== undefined ? { heartbeatAgeMs } : {}),
    runtime,
  }
}

export function createAgentSessionLockFile(paths: AgentSessionRuntimePaths): void {
  mkdirSync(paths.sessionDir, { recursive: true })
  writeFileSync(paths.lockPath, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx' })
}

export function releaseAgentSessionLockFile(paths: AgentSessionRuntimePaths): void {
  try {
    const owner = readFileSync(paths.lockPath, 'utf8').trim()
    if (owner === String(process.pid)) rmSync(paths.lockPath, { force: true })
  } catch {
    // Missing or inaccessible lock files are non-fatal during shutdown.
  }
}

export function listAgentSessionRecords(workspaceDir = process.cwd()): AgentSessionRecord[] {
  const paths = resolveAgentWorkspaceRuntimePaths(workspaceDir)
  if (!existsSync(paths.sessionsDir)) return []
  return listSessionDirs(paths.sessionsDir)
    .flatMap((sessionDir) => readAgentSessionRecord(join(sessionDir, SESSION_FILE_NAME)) ?? fallbackAgentSessionRecordFromDir(sessionDir) ?? [])
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function listAgentSessionRuntimeSummaries(workspaceDir = process.cwd(), input: { staleAfterMs?: number } = {}): AgentSessionRuntimeSummary[] {
  const paths = resolveAgentWorkspaceRuntimePaths(workspaceDir)
  if (!existsSync(paths.sessionsDir)) return []
  return listSessionDirs(paths.sessionsDir)
    .flatMap((sessionDir) => {
      const session = readAgentSessionRecord(join(sessionDir, SESSION_FILE_NAME)) ?? fallbackAgentSessionRecordFromDir(sessionDir)
      if (!session) return []
      const sessionPaths = resolveAgentSessionRuntimePaths({
        workspaceDir,
        sessionId: session.id,
        createdAt: session.createdAt,
      })
      const health = getAgentSessionRuntimeHealth(sessionPaths, input)
      const state = readAgentSessionRuntimeLogSummary(sessionPaths.runtimeLogPath, session.id)
      const runs = readAgentSessionRuntimeLogRuns(sessionPaths.runtimeLogPath, session.id)
      return [{
        session,
        workspaceDir: paths.workspaceDir,
        ...(state ? { state } : {}),
        ...(runs.length > 0 ? { runs } : {}),
        paths: {
          sessionDate: sessionPaths.sessionDate,
          sessionDir: sessionPaths.sessionDir,
          runtimeLogPath: sessionPaths.runtimeLogPath,
          runtimePath: sessionPaths.runtimePath,
          lockPath: sessionPaths.lockPath,
          heartbeatPath: sessionPaths.heartbeatPath,
          socketPath: sessionPaths.socketPath,
        },
        ...(health.runtime ? { runtime: health.runtime } : {}),
        running: health.alive,
        stale: health.stale,
        ...(health.heartbeatAgeMs !== undefined ? { heartbeatAgeMs: health.heartbeatAgeMs } : {}),
      }]
    })
    .sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt))
}

export function resolveDefaultAgentWorkspaceDir(): string {
  return process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR
    || process.env.MOVSCRIPT_WORKSPACE_DIR
    || process.cwd()
}

export function resolveAgentRuntimeSocketDir(): string {
  return process.env.MOVSCRIPT_AGENT_SOCKET_DIR
    || join(tmpdir(), `movscript-agent-${process.getuid?.() ?? 'user'}`)
}

export function fallbackUserAgentWorkspaceDir(): string {
  return join(homedir(), AGENT_WORKSPACE_DIR_NAME)
}

function readAgentSessionRecord(sessionPath: string): AgentSessionRecord | undefined {
  const parsed = readJSON(sessionPath)
  if (!isRecord(parsed) || parsed.schema !== 'movscript.agent.session.v1') return undefined
  const id = stringField(parsed.id)
  const createdAt = stringField(parsed.createdAt)
  const updatedAt = stringField(parsed.updatedAt)
  if (!id || !createdAt || !updatedAt) return undefined
  return {
    schema: 'movscript.agent.session.v1',
    id,
    ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
    ...(Number.isInteger(parsed.projectId) ? { projectId: parsed.projectId as number } : {}),
    createdAt,
    updatedAt,
    ...(parsed.archived === true ? { archived: true } : {}),
  }
}

function fallbackAgentSessionRecordFromDir(sessionDir: string): AgentSessionRecord | undefined {
  const id = basename(sessionDir)
  if (!isValidSessionId(id)) return undefined
  const createdAt = createdAtFromSessionDir(sessionDir) ?? statMtimeISOString(sessionDir) ?? new Date().toISOString()
  const updatedAt = statMtimeISOString(sessionDir) ?? createdAt
  return {
    schema: 'movscript.agent.session.v1',
    id,
    createdAt,
    updatedAt,
  }
}

function isValidSessionId(sessionId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(sessionId)
}

function createdAtFromSessionDir(sessionDir: string): string | undefined {
  const day = basename(dirname(sessionDir))
  const month = basename(dirname(dirname(sessionDir)))
  const year = basename(dirname(dirname(dirname(sessionDir))))
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return undefined
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function statMtimeISOString(path: string): string | undefined {
  try {
    return statSync(path).mtime.toISOString()
  } catch {
    return undefined
  }
}

function readAgentSessionRuntimeLogSummary(runtimeLogPath: string, sessionId: string): AgentSessionStateSummary | undefined {
  const index = readJSON(runtimeLogIndexPath(runtimeLogPath))
  if (!isRecord(index) || !isRecord(index.currentEntities)) return undefined
  const sessionEvent = readCurrentRuntimeLogEntity(runtimeLogPath, index.currentEntities, 'sessions', sessionId)
  const session = runtimeLogEntityValue(sessionEvent, 'session')
  const threads = Object.values(isRecord(index.currentEntities.threads) ? index.currentEntities.threads : {})
    .filter(isRecord)
    .flatMap((record) => {
      if (stringField(record.sessionId) !== sessionId) return []
      const event = readRuntimeLogEventAt(runtimeLogPath, record)
      const thread = runtimeLogEntityValue(event, 'thread')
      return isRecord(thread) ? [thread] : []
    })
  const rootThreadId = stringField(session?.rootThreadId)
    ?? stringField(threads.find((thread) => thread.agentRole === 'root')?.id)
    ?? stringField(threads[0]?.id)
  const interactiveThreadId = stringField(session?.interactiveThreadId) ?? rootThreadId
  const activeThreadId = stringField(session?.activeThreadId) ?? interactiveThreadId
  const displayThread = threads.find((thread) => thread.id === interactiveThreadId)
    ?? threads.find((thread) => thread.id === rootThreadId)
    ?? threads.find((thread) => thread.id === activeThreadId)
    ?? threads[0]
  if (!isRecord(session) && !isRecord(displayThread)) return undefined
  const displayThreadId = stringField(displayThread?.id)
  const messageSummary = displayThreadId
    ? readRuntimeLogThreadMessageSummary(runtimeLogPath, displayThreadId)
    : { messageCount: 0 }
  const title = stringField(displayThread?.title) ?? stringField(session?.title)
  const projectId = Number.isInteger(displayThread?.projectId)
    ? displayThread?.projectId as number
    : Number.isInteger(session?.projectId)
      ? session?.projectId as number
      : undefined
  const status = stringField(displayThread?.status) ?? stringField(session?.status)
  const threadUpdatedAt = stringField(displayThread?.updatedAt)
  return {
    ...(rootThreadId ? { rootThreadId } : {}),
    ...(interactiveThreadId ? { interactiveThreadId } : {}),
    ...(activeThreadId ? { activeThreadId } : {}),
    ...(title ? { title } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...((displayThread?.archived === true || session?.archived === true) ? { archived: true } : {}),
    ...(status ? { status } : {}),
    ...(threadUpdatedAt ? { threadUpdatedAt } : {}),
    messageCount: messageSummary.messageCount,
    ...(messageSummary.lastMessageAt ? { lastMessageAt: messageSummary.lastMessageAt } : {}),
  }
}

function readAgentSessionRuntimeLogRuns(runtimeLogPath: string, sessionId: string): AgentSessionRunSummary[] {
  const index = readJSON(runtimeLogIndexPath(runtimeLogPath))
  if (!isRecord(index) || !isRecord(index.currentEntities)) return []
  const records = isRecord(index.currentEntities.runs) ? index.currentEntities.runs : undefined
  if (!records) return []
  return Object.values(records)
    .filter(isRecord)
    .flatMap((record) => {
      if (stringField(record.sessionId) !== sessionId) return []
      const event = readRuntimeLogEventAt(runtimeLogPath, record)
      const run = runtimeLogEntityValue(event, 'run')
      const summary = run ? agentSessionRunSummary(run, sessionId) : undefined
      return summary ? [summary] : []
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function agentSessionRunSummary(value: Record<string, unknown>, fallbackSessionId: string): AgentSessionRunSummary | undefined {
  const id = stringField(value.id)
  const threadId = stringField(value.threadId)
  const status = stringField(value.status)
  const createdAt = stringField(value.createdAt)
  const updatedAt = stringField(value.updatedAt)
  if (!id || !threadId || !status || !createdAt || !updatedAt) return undefined
  const metadata = isRecord(value.metadata) ? value.metadata : undefined
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((item): item is string => typeof item === 'string')
    : undefined
  return {
    id,
    sessionId: stringField(value.sessionId) ?? fallbackSessionId,
    threadId,
    status,
    ...(stringField(value.role) ? { role: stringField(value.role) } : {}),
    ...(stringField(value.parentRunId) ? { parentRunId: stringField(value.parentRunId) } : {}),
    ...(stringField(value.taskGraphId) ? { taskGraphId: stringField(value.taskGraphId) } : {}),
    ...(stringField(value.taskId) ? { taskId: stringField(value.taskId) } : {}),
    ...(typeof value.progress === 'number' ? { progress: value.progress } : {}),
    ...(stringField(value.blockedReason) ? { blockedReason: stringField(value.blockedReason) } : {}),
    ...(Array.isArray(value.pendingApprovals) ? { pendingApprovals: value.pendingApprovals } : {}),
    ...(Array.isArray(value.pendingInputRequests) ? { pendingInputRequests: value.pendingInputRequests } : {}),
    ...(metadata ? { metadata } : {}),
    createdAt,
    updatedAt,
    ...(stringField(value.startedAt) ? { startedAt: stringField(value.startedAt) } : {}),
    ...(stringField(value.completedAt) ? { completedAt: stringField(value.completedAt) } : {}),
    ...(stringField(value.failedAt) ? { failedAt: stringField(value.failedAt) } : {}),
    ...(stringField(value.cancelledAt) ? { cancelledAt: stringField(value.cancelledAt) } : {}),
    ...(stringField(value.error) ? { error: stringField(value.error) } : {}),
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
    steps: Array.isArray(value.steps) ? value.steps : [],
  }
}

function readCurrentRuntimeLogEntity(runtimeLogPath: string, currentEntities: Record<string, unknown>, collection: string, id: string): unknown {
  const records = isRecord(currentEntities[collection]) ? currentEntities[collection] : undefined
  const record = isRecord(records?.[id]) ? records[id] : undefined
  return record ? readRuntimeLogEventAt(runtimeLogPath, record) : undefined
}

function readRuntimeLogEventAt(runtimeLogPath: string, record: Record<string, unknown>): unknown {
  const eventOffset = nonNegativeIntegerField(record.eventOffset)
  const eventBytes = positiveIntegerField(record.eventBytes)
  if (eventOffset === undefined || eventBytes === undefined) return undefined
  try {
    const fd = openFileForRead(runtimeLogPath)
    try {
      const buffer = Buffer.alloc(eventBytes)
      const read = readSync(fd, buffer, 0, eventBytes, eventOffset)
      if (read <= 0) return undefined
      return JSON.parse(buffer.subarray(0, read).toString('utf8')) as unknown
    } finally {
      closeFile(fd)
    }
  } catch {
    return undefined
  }
}

function runtimeLogEntityValue(event: unknown, type: string): Record<string, unknown> | undefined {
  if (!isRecord(event) || !isRecord(event.entity)) return undefined
  if (event.entity.type !== type || !isRecord(event.entity.value)) return undefined
  return event.entity.value
}

function readRuntimeLogThreadMessageSummary(runtimeLogPath: string, threadId: string): { messageCount: number; lastMessageAt?: string } {
  const messageIndexPath = runtimeLogMessageIndexPath(runtimeLogPath)
  if (!existsSync(messageIndexPath)) return { messageCount: 0 }
  let messageCount = 0
  let lastMessageAt: string | undefined
  const text = readTextSafe(messageIndexPath)
  if (!text) return { messageCount: 0 }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line) as unknown
      if (!isRecord(record) || record.threadId !== threadId) continue
      messageCount += 1
      const createdAt = stringField(record.createdAt)
      if (createdAt && (!lastMessageAt || createdAt.localeCompare(lastMessageAt) > 0)) lastMessageAt = createdAt
    } catch {
      continue
    }
  }
  return {
    messageCount,
    ...(lastMessageAt ? { lastMessageAt } : {}),
  }
}

function sanitizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(trimmed)) throw new Error(`Invalid agent session id: ${sessionId}`)
  return trimmed
}

function sessionDatePath(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date()
  const year = String(safeDate.getFullYear()).padStart(4, '0')
  const month = String(safeDate.getMonth() + 1).padStart(2, '0')
  const day = String(safeDate.getDate()).padStart(2, '0')
  return join(year, month, day)
}

function sessionRolloutLogFileName(sessionDate: string, sessionId: string): string {
  const datePart = sessionDate.split(/[\\/]/).join('-')
  return `${SESSION_ROLLOUT_LOG_FILE_PREFIX}-${datePart}-${sessionId}.jsonl`
}

function findExistingSessionDate(sessionsDir: string, sessionId: string): string | undefined {
  for (const sessionDir of listSessionDirs(sessionsDir)) {
    if (sessionDir.endsWith(`${sessionDateSeparator()}${sessionId}`)) {
      return dirnameRelative(sessionsDir, dirname(sessionDir))
    }
  }
  return undefined
}

function listSessionDirs(sessionsDir: string): string[] {
  if (!existsSync(sessionsDir)) return []
  const result: string[] = []
  for (const year of readdirSafe(sessionsDir)) {
    const yearDir = join(sessionsDir, year)
    if (!isDirectorySafe(yearDir)) continue
    for (const month of readdirSafe(yearDir)) {
      const monthDir = join(yearDir, month)
      if (!isDirectorySafe(monthDir)) continue
      for (const day of readdirSafe(monthDir)) {
        const dayDir = join(monthDir, day)
        if (!isDirectorySafe(dayDir)) continue
        for (const sessionId of readdirSafe(dayDir)) {
          const sessionDir = join(dayDir, sessionId)
          if (isDirectorySafe(sessionDir)) result.push(sessionDir)
        }
      }
    }
  }
  return result
}

function dirnameRelative(root: string, dir: string): string {
  return dir.slice(root.length).replace(/^[/\\]+/, '')
}

function sessionDateSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/'
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isDirectorySafe(dir: string): boolean {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function shortSessionPathHash(workspaceDir: string, sessionId: string): string {
  return createHash('sha256').update(`${workspaceDir}\n${sessionId}`).digest('hex').slice(0, 16)
}

function readJSON(filePath: string): unknown {
  try {
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) return undefined
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function readTextSafe(filePath: string): string | undefined {
  try {
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) return undefined
    return readFileSync(filePath, 'utf8')
  } catch {
    return undefined
  }
}

function runtimeLogIndexPath(runtimeLogPath: string): string {
  if (extname(runtimeLogPath) === '.jsonl') {
    return join(dirname(runtimeLogPath), `${basename(runtimeLogPath, '.jsonl')}.index.json`)
  }
  return join(runtimeLogPath, 'index.json')
}

function runtimeLogMessageIndexPath(runtimeLogPath: string): string {
  if (extname(runtimeLogPath) === '.jsonl') {
    return join(dirname(runtimeLogPath), `${basename(runtimeLogPath, '.jsonl')}.message-index.jsonl`)
  }
  return join(runtimeLogPath, 'message-index.jsonl')
}

function nonNegativeIntegerField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function positiveIntegerField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function openFileForRead(filePath: string): number {
  return openSync(filePath, 'r')
}

function closeFile(fd: number): void {
  closeSync(fd)
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function normalizeWorkspaceCatalogConfig(value: unknown): AgentWorkspaceConfig['catalog'] | undefined {
  if (!isRecord(value)) return undefined
  const catalog = {
    ...(stringField(value.skillsDir) ? { skillsDir: stringField(value.skillsDir) } : {}),
    ...(stringField(value.toolsDir) ? { toolsDir: stringField(value.toolsDir) } : {}),
    ...(stringField(value.packsDir) ? { packsDir: stringField(value.packsDir) } : {}),
    ...(stringField(value.configFilesDir) ? { configFilesDir: stringField(value.configFilesDir) } : {}),
  }
  return Object.keys(catalog).length > 0 ? catalog : undefined
}
