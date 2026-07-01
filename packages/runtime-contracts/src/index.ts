import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, win32 as pathWin32 } from 'node:path'

export const MOVSCRIPT_DEFAULT_HOME_DIR_NAME = '.movscript'
export const MOVSCRIPT_RUNTIME_DIR_NAME = 'runtime'
export const MOVSCRIPT_RUNTIME_APPS_DIR_NAME = 'apps'
export const MOVSCRIPT_RUNTIME_SERVICES_DIR_NAME = 'services'
export const MOVSCRIPT_RUNTIME_ENDPOINTS_DIR_NAME = 'endpoints'
export const MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA = 'movscript.application.v1'
export const MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA = 'movscript.program.v1'
export const MOVSCRIPT_SCENARIO_POLICY_SCHEMA = 'movscript.scenario-policy.v1'

export type RuntimeRecordStatus = 'starting' | 'ready' | 'stopping' | 'stopped' | 'error' | 'unknown'
export type ApplicationOwnerKind = 'electron' | 'agent-provider' | 'cloud-orchestrator' | 'cli' | 'test'
export type ProgramKind = 'service' | 'mcp-endpoint' | 'web' | 'cli' | 'worker' | 'desktop-shell'
export type ProgramTransportKind = 'http' | 'stdio' | 'ipc' | 'embedded' | 'none'
export type ProgramHealthKind = 'http' | 'process' | 'stdio_tool' | 'none'

export interface ProgramEntryManifest {
  command: string
  args?: string[]
  cwd?: string
}

export interface ProgramHealthManifest {
  kind: ProgramHealthKind
  target?: string
}

export interface ApplicationManifest {
  schema: typeof MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA
  applicationId: string
  name: string
  owner: ApplicationOwnerKind
  programs?: string[]
}

export interface ProgramManifest {
  schema: typeof MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA
  programId: string
  serviceName: string
  kind: ProgramKind
  name?: string
  profiles?: string[]
  entry?: ProgramEntryManifest
  transport?: ProgramTransportKind
  health?: ProgramHealthManifest
  dependsOn?: string[]
  provides?: string[]
}

export interface ScenarioProgramPolicy {
  serviceName: string
  required?: boolean
  profile?: string
}

export interface ScenarioPolicyManifest {
  schema: typeof MOVSCRIPT_SCENARIO_POLICY_SCHEMA
  scenarioId: string
  applicationId: string
  programs: ScenarioProgramPolicy[]
}

export interface ManifestValidationResult<T> {
  ok: boolean
  errors: string[]
  manifest?: T
}

export interface ResolveMovScriptHomeOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  userHomeDir?: string
}

export interface MovScriptRuntimeHomePaths {
  homeDir: string
  runtimeDir: string
  appsDir: string
  servicesDir: string
  endpointsDir: string
}

export interface RuntimeEndpointRecord {
  serviceName?: string
  applicationId?: string
  instanceId?: string
  baseURL?: string
  url?: string
  healthURL?: string
  protocol?: string
  pid?: number
  port?: number
  status: RuntimeRecordStatus
  ready: boolean
  updatedAt?: string
  raw: Record<string, unknown>
  path: string
}

export interface RuntimeAppRecord {
  applicationId: string
  owner?: string
  profile?: string
  pid?: number
  status: RuntimeRecordStatus
  ready: boolean
  endpoint?: RuntimeEndpointRecord
  updatedAt?: string
  raw: Record<string, unknown>
  path: string
}

export interface RuntimeServiceRecord {
  serviceName: string
  instanceId: string
  ownerApplicationId?: string
  profile?: string
  pid?: number
  status: RuntimeRecordStatus
  ready: boolean
  endpoint?: RuntimeEndpointRecord
  updatedAt?: string
  raw: Record<string, unknown>
  path: string
}

export interface RuntimeHomeSnapshot {
  homeDir: string
  apps: RuntimeAppRecord[]
  services: RuntimeServiceRecord[]
  endpoints: RuntimeEndpointRecord[]
}

export type RuntimeStaleRecordKind = 'app' | 'service' | 'endpoint'
export type RuntimeStaleRecordReason = 'inactive' | 'dead_pid'

export interface RuntimeStaleRecordCleanupItem {
  kind: RuntimeStaleRecordKind
  path: string
  reason: RuntimeStaleRecordReason
  pid?: number
}

export interface RuntimeStaleRecordCleanupResult {
  homeDir: string
  removed: RuntimeStaleRecordCleanupItem[]
}

export interface RuntimeEndpointRecordInput {
  serviceName?: string
  applicationId?: string
  instanceId?: string
  baseURL?: string
  url?: string
  healthURL?: string
  protocol?: string
  pid?: number
  port?: number
  status?: RuntimeRecordStatus
  ready?: boolean
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface RuntimeAppRecordInput {
  applicationId: string
  owner?: string
  profile?: string
  pid?: number
  status?: RuntimeRecordStatus
  ready?: boolean
  endpoint?: RuntimeEndpointRecordInput
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface RuntimeServiceRecordInput {
  serviceName: string
  instanceId: string
  ownerApplicationId?: string
  profile?: string
  pid?: number
  status?: RuntimeRecordStatus
  ready?: boolean
  endpoint?: RuntimeEndpointRecordInput
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export function validateApplicationManifest(value: unknown): ManifestValidationResult<ApplicationManifest> {
  const raw = asRecord(value)
  const errors: string[] = []
  if (!raw) return { ok: false, errors: ['manifest must be an object'] }
  if (raw.schema !== MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA) errors.push(`schema must be ${MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA}`)
  const applicationId = stringValue(raw.applicationId)
  const name = stringValue(raw.name)
  const owner = ownerKindValue(raw.owner)
  const programs = stringArrayValue(raw.programs)
  if (!applicationId) errors.push('applicationId is required')
  if (!name) errors.push('name is required')
  if (!owner) errors.push('owner must be a supported application owner kind')
  if (raw.programs !== undefined && !programs) errors.push('programs must be an array of strings')
  if (errors.length > 0 || !applicationId || !name || !owner) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    manifest: {
      schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
      applicationId,
      name,
      owner,
      ...(programs ? { programs } : {}),
    },
  }
}

export function validateProgramManifest(value: unknown): ManifestValidationResult<ProgramManifest> {
  const raw = asRecord(value)
  const errors: string[] = []
  if (!raw) return { ok: false, errors: ['manifest must be an object'] }
  if (raw.schema !== MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA) errors.push(`schema must be ${MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA}`)
  const programId = stringValue(raw.programId)
  const serviceName = stringValue(raw.serviceName)
  const kind = programKindValue(raw.kind)
  const name = stringValue(raw.name)
  const profiles = stringArrayValue(raw.profiles)
  const entry = programEntryValue(raw.entry)
  const transport = programTransportValue(raw.transport)
  const health = programHealthValue(raw.health)
  const dependsOn = stringArrayValue(raw.dependsOn)
  const provides = stringArrayValue(raw.provides)
  if (!programId) errors.push('programId is required')
  if (!serviceName) errors.push('serviceName is required')
  if (!kind) errors.push('kind must be a supported program kind')
  if (raw.profiles !== undefined && !profiles) errors.push('profiles must be an array of strings')
  if (raw.entry !== undefined && !entry) errors.push('entry must define a command and optional string args/cwd')
  if (raw.transport !== undefined && !transport) errors.push('transport must be a supported transport kind')
  if (raw.health !== undefined && !health) errors.push('health must define a supported kind and optional target')
  if (raw.dependsOn !== undefined && !dependsOn) errors.push('dependsOn must be an array of strings')
  if (raw.provides !== undefined && !provides) errors.push('provides must be an array of strings')
  if (errors.length > 0 || !programId || !serviceName || !kind) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    manifest: {
      schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
      programId,
      serviceName,
      kind,
      ...(name ? { name } : {}),
      ...(profiles ? { profiles } : {}),
      ...(entry ? { entry } : {}),
      ...(transport ? { transport } : {}),
      ...(health ? { health } : {}),
      ...(dependsOn ? { dependsOn } : {}),
      ...(provides ? { provides } : {}),
    },
  }
}

export function validateScenarioPolicyManifest(value: unknown): ManifestValidationResult<ScenarioPolicyManifest> {
  const raw = asRecord(value)
  const errors: string[] = []
  if (!raw) return { ok: false, errors: ['manifest must be an object'] }
  if (raw.schema !== MOVSCRIPT_SCENARIO_POLICY_SCHEMA) errors.push(`schema must be ${MOVSCRIPT_SCENARIO_POLICY_SCHEMA}`)
  const scenarioId = stringValue(raw.scenarioId)
  const applicationId = stringValue(raw.applicationId)
  const programRecords = Array.isArray(raw.programs) ? raw.programs : undefined
  if (!scenarioId) errors.push('scenarioId is required')
  if (!applicationId) errors.push('applicationId is required')
  if (!programRecords) errors.push('programs must be an array')
  const programs = (programRecords ?? []).flatMap((item, index) => {
    const record = asRecord(item)
    const serviceName = record ? stringValue(record.serviceName) : undefined
    if (!record || !serviceName) {
      errors.push(`programs[${index}].serviceName is required`)
      return []
    }
    return [{
      serviceName,
      ...(typeof record.required === 'boolean' ? { required: record.required } : {}),
      ...(stringValue(record.profile) ? { profile: stringValue(record.profile) } : {}),
    }]
  })
  if (errors.length > 0 || !scenarioId || !applicationId || !programRecords) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    manifest: {
      schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
      scenarioId,
      applicationId,
      programs,
    },
  }
}

export function resolveMovScriptHomeDir(options: ResolveMovScriptHomeOptions = {}): string {
  const env = options.env ?? process.env
  const explicit = stringValue(env.MOVSCRIPT_HOME)
  if (explicit) return resolve(explicit)
  const legacy = stringValue(env.MOVSCRIPT_WORKSPACE_DIR)
  if (legacy) return resolve(legacy)
  const userHomeDir = options.userHomeDir ?? homedir()
  if ((options.platform ?? process.platform) === 'win32') {
    const localAppData = stringValue(env.LOCALAPPDATA) ?? pathWin32.join(userHomeDir, 'AppData', 'Local')
    return pathWin32.resolve(localAppData, 'MovScript', 'Home')
  }
  return resolve(userHomeDir, MOVSCRIPT_DEFAULT_HOME_DIR_NAME)
}

export function resolveRuntimeHomePaths(homeDir = resolveMovScriptHomeDir()): MovScriptRuntimeHomePaths {
  const runtimeDir = join(homeDir, MOVSCRIPT_RUNTIME_DIR_NAME)
  return {
    homeDir,
    runtimeDir,
    appsDir: join(runtimeDir, MOVSCRIPT_RUNTIME_APPS_DIR_NAME),
    servicesDir: join(runtimeDir, MOVSCRIPT_RUNTIME_SERVICES_DIR_NAME),
    endpointsDir: join(runtimeDir, MOVSCRIPT_RUNTIME_ENDPOINTS_DIR_NAME),
  }
}

export function readRuntimeHomeSnapshot(homeDir = resolveMovScriptHomeDir()): RuntimeHomeSnapshot {
  const paths = resolveRuntimeHomePaths(homeDir)
  return {
    homeDir: paths.homeDir,
    apps: readAppRecords(paths.appsDir),
    services: readServiceRecords(paths.servicesDir),
    endpoints: readEndpointRecords(paths.endpointsDir),
  }
}

export function writeRuntimeAppRecord(homeDir: string, input: RuntimeAppRecordInput): string {
  const paths = resolveRuntimeHomePaths(homeDir)
  const now = new Date().toISOString()
  const path = join(paths.appsDir, `${safeRecordFileName(input.applicationId)}.json`)
  writeJSONAtomic(path, compactRecord({
    applicationId: input.applicationId,
    owner: input.owner,
    profile: input.profile,
    pid: input.pid,
    status: input.status ?? 'ready',
    ready: input.ready ?? (input.status === undefined || input.status === 'ready'),
    endpoint: input.endpoint ? compactRecord({
      ...input.endpoint,
      status: input.endpoint.status ?? input.status ?? 'ready',
      ready: input.endpoint.ready ?? input.ready ?? (input.status === undefined || input.status === 'ready'),
      updatedAt: input.endpoint.updatedAt ?? input.updatedAt ?? now,
    }) : undefined,
    updatedAt: input.updatedAt ?? now,
    metadata: input.metadata,
  }))
  return path
}

export function writeRuntimeServiceRecord(homeDir: string, input: RuntimeServiceRecordInput): string {
  const paths = resolveRuntimeHomePaths(homeDir)
  const now = new Date().toISOString()
  const serviceDir = join(paths.servicesDir, safeRecordFileName(input.serviceName))
  const path = join(serviceDir, `${safeRecordFileName(input.instanceId)}.json`)
  writeJSONAtomic(path, compactRecord({
    serviceName: input.serviceName,
    instanceId: input.instanceId,
    ownerApplicationId: input.ownerApplicationId,
    profile: input.profile,
    pid: input.pid,
    status: input.status ?? 'ready',
    ready: input.ready ?? (input.status === undefined || input.status === 'ready'),
    endpoint: input.endpoint ? compactRecord({
      ...input.endpoint,
      serviceName: input.endpoint.serviceName ?? input.serviceName,
      instanceId: input.endpoint.instanceId ?? input.instanceId,
      status: input.endpoint.status ?? input.status ?? 'ready',
      ready: input.endpoint.ready ?? input.ready ?? (input.status === undefined || input.status === 'ready'),
      updatedAt: input.endpoint.updatedAt ?? input.updatedAt ?? now,
    }) : undefined,
    updatedAt: input.updatedAt ?? now,
    metadata: input.metadata,
  }))
  return path
}

export function writeRuntimeEndpointRecord(homeDir: string, input: RuntimeEndpointRecordInput): string {
  const paths = resolveRuntimeHomePaths(homeDir)
  const id = input.serviceName ?? input.applicationId ?? input.instanceId
  if (!id) throw new Error('Runtime endpoint record requires serviceName, applicationId, or instanceId')
  const now = new Date().toISOString()
  const path = join(paths.endpointsDir, `${safeRecordFileName(id)}.json`)
  writeJSONAtomic(path, compactRecord({
    ...input,
    status: input.status ?? 'ready',
    ready: input.ready ?? (input.status === undefined || input.status === 'ready'),
    updatedAt: input.updatedAt ?? now,
  }))
  return path
}

export function activeAppRecords(snapshot: RuntimeHomeSnapshot): RuntimeAppRecord[] {
  return snapshot.apps.filter((record) => record.ready && pidIsAlive(record.pid))
}

export function activeServiceRecords(snapshot: RuntimeHomeSnapshot): RuntimeServiceRecord[] {
  return snapshot.services.filter((record) => record.ready && pidIsAlive(record.pid))
}

export function activeEndpointRecords(snapshot: RuntimeHomeSnapshot): RuntimeEndpointRecord[] {
  return snapshot.endpoints.filter((record) => record.ready && pidIsAlive(record.pid))
}

export function findRuntimeApp(snapshot: RuntimeHomeSnapshot, applicationId: string): RuntimeAppRecord | undefined {
  return activeAppRecords(snapshot).find((record) => record.applicationId === applicationId)
}

export function findRuntimeService(snapshot: RuntimeHomeSnapshot, serviceName: string): RuntimeServiceRecord | undefined {
  return activeServiceRecords(snapshot).find((record) => record.serviceName === serviceName)
}

export function findRuntimeEndpoint(snapshot: RuntimeHomeSnapshot, serviceName: string): RuntimeEndpointRecord | undefined {
  return activeEndpointRecords(snapshot).find((record) => record.serviceName === serviceName)
}

export function cleanupStaleRuntimeRecords(homeDir = resolveMovScriptHomeDir()): RuntimeStaleRecordCleanupResult {
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const removed: RuntimeStaleRecordCleanupItem[] = []
  for (const record of snapshot.apps) {
    const reason = staleRuntimeRecordReason(record)
    if (!reason) continue
    removeRuntimeRecordFile(record.path)
    removed.push({
      kind: 'app',
      path: record.path,
      reason,
      ...(record.pid !== undefined ? { pid: record.pid } : {}),
    })
  }
  for (const record of snapshot.services) {
    const reason = staleRuntimeRecordReason(record)
    if (!reason) continue
    removeRuntimeRecordFile(record.path)
    removed.push({
      kind: 'service',
      path: record.path,
      reason,
      ...(record.pid !== undefined ? { pid: record.pid } : {}),
    })
  }
  for (const record of snapshot.endpoints) {
    const reason = staleRuntimeRecordReason(record)
    if (!reason) continue
    removeRuntimeRecordFile(record.path)
    removed.push({
      kind: 'endpoint',
      path: record.path,
      reason,
      ...(record.pid !== undefined ? { pid: record.pid } : {}),
    })
  }
  return { homeDir: snapshot.homeDir, removed }
}

export function pidIsAlive(pid: number | undefined): boolean {
  if (pid === undefined) return true
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function staleRuntimeRecordReason(record: { ready: boolean; status: RuntimeRecordStatus; pid?: number }): RuntimeStaleRecordReason | undefined {
  if (!record.ready || record.status === 'stopped' || record.status === 'error') return 'inactive'
  if (record.pid !== undefined && !pidIsAlive(record.pid)) return 'dead_pid'
  return undefined
}

function removeRuntimeRecordFile(path: string): void {
  rmSync(path, { force: true })
  pruneEmptyRuntimeRecordDir(dirname(path))
}

function pruneEmptyRuntimeRecordDir(dir: string): void {
  if (safeReaddir(dir).length > 0) return
  rmSync(dir, { recursive: true, force: true })
}

function readAppRecords(appsDir: string): RuntimeAppRecord[] {
  return readJSONFiles(appsDir).flatMap(({ path, value }) => {
    const raw = asRecord(value)
    if (!raw) return []
    const applicationId = stringValue(raw.applicationId ?? raw.appId ?? raw.id)
      ?? fileStem(path)
    if (!applicationId) return []
    const endpoint = endpointRecordFrom(raw.endpoint, path, { applicationId })
    return [{
      applicationId,
      owner: stringValue(raw.owner ?? raw.runtimeOwner),
      profile: stringValue(raw.profile),
      pid: numberValue(raw.pid),
      status: statusValue(raw.status),
      ready: readyValue(raw),
      ...(endpoint ? { endpoint } : {}),
      updatedAt: stringValue(raw.updatedAt ?? raw.startedAt ?? raw.createdAt),
      raw,
      path,
    }]
  })
}

function readServiceRecords(servicesDir: string): RuntimeServiceRecord[] {
  if (!existsSync(servicesDir)) return []
  const records: RuntimeServiceRecord[] = []
  for (const serviceName of safeReaddir(servicesDir)) {
    const serviceDir = join(servicesDir, serviceName)
    for (const { path, value } of readJSONFiles(serviceDir)) {
      const raw = asRecord(value)
      if (!raw) continue
      const instanceId = stringValue(raw.instanceId ?? raw.id) ?? fileStem(path)
      if (!instanceId) continue
      const endpoint = endpointRecordFrom(raw.endpoint, path, { serviceName, instanceId })
      records.push({
        serviceName: stringValue(raw.serviceName) ?? serviceName,
        instanceId,
        ownerApplicationId: stringValue(raw.ownerApplicationId ?? raw.applicationId ?? raw.appId),
        profile: stringValue(raw.profile),
        pid: numberValue(raw.pid),
        status: statusValue(raw.status),
        ready: readyValue(raw),
        ...(endpoint ? { endpoint } : {}),
        updatedAt: stringValue(raw.updatedAt ?? raw.startedAt ?? raw.createdAt),
        raw,
        path,
      })
    }
  }
  return records
}

function readEndpointRecords(endpointsDir: string): RuntimeEndpointRecord[] {
  return readJSONFiles(endpointsDir).flatMap(({ path, value }) => {
    const record = endpointRecordFrom(value, path, { serviceName: fileStem(path) })
    return record ? [record] : []
  })
}

function endpointRecordFrom(
  value: unknown,
  path: string,
  defaults: { serviceName?: string; applicationId?: string; instanceId?: string },
): RuntimeEndpointRecord | undefined {
  const raw = asRecord(value)
  if (!raw) return undefined
  const serviceName = stringValue(raw.serviceName ?? raw.service ?? defaults.serviceName)
  const applicationId = stringValue(raw.applicationId ?? raw.appId ?? defaults.applicationId)
  const instanceId = stringValue(raw.instanceId ?? raw.id ?? defaults.instanceId)
  const baseURL = stringValue(raw.baseURL ?? raw.baseUrl ?? raw.url)
  const url = stringValue(raw.url ?? raw.endpointURL ?? raw.endpointUrl ?? raw.mcpURL ?? raw.mcpUrl)
  const healthURL = stringValue(raw.healthURL ?? raw.healthUrl ?? raw.healthEndpoint)
  const port = numberValue(raw.port)
  const pid = numberValue(raw.pid)
  const protocol = stringValue(raw.protocol)
  if (!serviceName && !applicationId && !baseURL && !url && !healthURL && !port && !pid) return undefined
  return {
    ...(serviceName ? { serviceName } : {}),
    ...(applicationId ? { applicationId } : {}),
    ...(instanceId ? { instanceId } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(url ? { url } : {}),
    ...(healthURL ? { healthURL } : {}),
    ...(protocol ? { protocol } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(port !== undefined ? { port } : {}),
    status: statusValue(raw.status),
    ready: readyValue(raw),
    updatedAt: stringValue(raw.updatedAt ?? raw.startedAt ?? raw.createdAt),
    raw,
    path,
  }
}

function readJSONFiles(dir: string): Array<{ path: string; value: unknown }> {
  if (!existsSync(dir)) return []
  return safeReaddir(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const path = join(dir, name)
      return { path, value: readJSON(path) }
    })
}

function readJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function writeJSONAtomic(path: string, value: unknown): void {
  mkdirSync(path.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, path)
}

function safeRecordFileName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '_') || 'unknown'
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function fileStem(path: string): string | undefined {
  const name = path.split(/[\\/]/).pop()
  if (!name) return undefined
  return name.endsWith('.json') ? name.slice(0, -5) : name
}

function statusValue(value: unknown): RuntimeRecordStatus {
  if (value === 'starting' || value === 'ready' || value === 'stopping' || value === 'stopped' || value === 'error') return value
  return 'unknown'
}

function readyValue(raw: Record<string, unknown>): boolean {
  if (typeof raw.ready === 'boolean') return raw.ready
  const status = statusValue(raw.status)
  return status === 'ready' || status === 'unknown'
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map((item) => stringValue(item))
  return items.every((item): item is string => Boolean(item)) ? items : undefined
}

function programEntryValue(value: unknown): ProgramEntryManifest | undefined {
  const raw = asRecord(value)
  if (!raw) return undefined
  const command = stringValue(raw.command)
  const args = stringArrayValue(raw.args)
  const cwd = stringValue(raw.cwd)
  if (!command) return undefined
  if (raw.args !== undefined && !args) return undefined
  return {
    command,
    ...(args ? { args } : {}),
    ...(cwd ? { cwd } : {}),
  }
}

function programHealthValue(value: unknown): ProgramHealthManifest | undefined {
  const raw = asRecord(value)
  if (!raw) return undefined
  const kind = programHealthKindValue(raw.kind)
  const target = stringValue(raw.target)
  if (!kind) return undefined
  return {
    kind,
    ...(target ? { target } : {}),
  }
}

function ownerKindValue(value: unknown): ApplicationOwnerKind | undefined {
  if (
    value === 'electron'
    || value === 'agent-provider'
    || value === 'cloud-orchestrator'
    || value === 'cli'
    || value === 'test'
  ) return value
  return undefined
}

function programKindValue(value: unknown): ProgramKind | undefined {
  if (
    value === 'service'
    || value === 'mcp-endpoint'
    || value === 'web'
    || value === 'cli'
    || value === 'worker'
    || value === 'desktop-shell'
  ) return value
  return undefined
}

function programTransportValue(value: unknown): ProgramTransportKind | undefined {
  if (
    value === 'http'
    || value === 'stdio'
    || value === 'ipc'
    || value === 'embedded'
    || value === 'none'
  ) return value
  return undefined
}

function programHealthKindValue(value: unknown): ProgramHealthKind | undefined {
  if (
    value === 'http'
    || value === 'process'
    || value === 'stdio_tool'
    || value === 'none'
  ) return value
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
