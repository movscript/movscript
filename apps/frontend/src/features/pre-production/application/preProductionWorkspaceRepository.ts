import type {
  ElectronMovScriptWorkspaceFileEntry,
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'
import type { SemanticEntityPayload, SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type {
  AssetSlotRecord,
  SettingRecord,
} from '@/features/pre-production/domain/preProductionAssetRows'

const SETTING_SCHEMA = 'movscript.setting.v1'
const ASSET_SLOT_SCHEMA = 'movscript.asset_slot.v1'

export interface PreProductionWorkspaceFilesAPI {
  root(input?: { workspaceDir?: string }): Promise<ElectronMovScriptWorkspaceRootResult>
  list(input?: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceFilesListResult>
  read(input: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceFileReadResult>
  write(input: ElectronMovScriptWorkspaceFilesInput & { content: string }): Promise<ElectronMovScriptWorkspaceFileReadResult>
  delete(input: ElectronMovScriptWorkspaceFilesInput): Promise<unknown>
}

export interface PreProductionWorkspaceRecord<TRecord extends SemanticEntityRecord> {
  record: TRecord
  path: string
}

export interface PreProductionWorkspaceData {
  settings: SettingRecord[]
  assetSlots: AssetSlotRecord[]
  source: 'workspace'
  projectPath: string
}

type WorkspaceRecordMapper<TRecord extends SemanticEntityRecord> = (value: Record<string, unknown>, path: string) => TRecord

export function requirePreProductionWorkspaceAPI(): PreProductionWorkspaceFilesAPI {
  const api = window.api
  if (
    !api?.getMovScriptWorkspaceRoot
    || !api.listMovScriptWorkspaceFiles
    || !api.readMovScriptWorkspaceFile
    || !api.writeMovScriptWorkspaceFile
    || !api.deleteMovScriptWorkspaceFile
  ) {
    throw new Error('当前窗口没有 MovScript 工作区文件能力')
  }
  return {
    root: api.getMovScriptWorkspaceRoot,
    list: api.listMovScriptWorkspaceFiles,
    read: api.readMovScriptWorkspaceFile,
    write: api.writeMovScriptWorkspaceFile,
    delete: api.deleteMovScriptWorkspaceFile,
  }
}

export async function loadPreProductionWorkspaceData(projectId: number): Promise<PreProductionWorkspaceData> {
  const api = requirePreProductionWorkspaceAPI()
  const projectPath = await resolvePreProductionWorkspaceProjectPath(api, projectId)
  const [editableReferences, editableSlots] = await Promise.all([
    listWorkspaceRecords(api, `${projectPath}/setting`, settingRecordFromProjection, /^setting_[^/\\]+\.json$/),
    listWorkspaceRecords(api, `${projectPath}/assets`, assetSlotRecordFromProjection, /^asset_slot_[^/\\]+\.json$/),
  ])
  return {
    source: 'workspace',
    projectPath,
    settings: editableReferences.map((item) => item.record),
    assetSlots: editableSlots.map((item) => item.record),
  }
}

export async function savePreProductionWorkspaceSetting(
  projectId: number,
  record: SettingRecord | null | undefined,
  payload: SemanticEntityPayload,
): Promise<SettingRecord> {
  const api = requirePreProductionWorkspaceAPI()
  const projectPath = await resolvePreProductionWorkspaceProjectPath(api, projectId)
  const local = normalizeSettingProjection(projectId, record, payload)
  const fileKey = projectionFileKey(record, local)
  const path = positiveId(record?.ID)
    ? `${projectPath}/setting/setting_${fileKey}.json`
    : `${projectPath}/setting/setting_${local.client_id}.json`
  await api.write({ path, content: serializeProjection(local) })
  return settingRecordFromProjection(local, path)
}

export async function savePreProductionWorkspaceAssetSlot(
  projectId: number,
  record: AssetSlotRecord | null | undefined,
  payload: SemanticEntityPayload,
): Promise<AssetSlotRecord> {
  const api = requirePreProductionWorkspaceAPI()
  const projectPath = await resolvePreProductionWorkspaceProjectPath(api, projectId)
  const local = normalizeAssetSlotProjection(projectId, record, payload)
  const fileKey = projectionFileKey(record, local)
  const path = positiveId(record?.ID)
    ? `${projectPath}/assets/asset_slot_${fileKey}.json`
    : `${projectPath}/assets/asset_slot_${local.client_id}.json`
  await api.write({ path, content: serializeProjection(local) })
  return assetSlotRecordFromProjection(local, path)
}

export async function deletePreProductionWorkspaceSetting(projectId: number, record: SettingRecord): Promise<void> {
  const api = requirePreProductionWorkspaceAPI()
  const projectPath = await resolvePreProductionWorkspaceProjectPath(api, projectId)
  await api.delete({ path: `${projectPath}/setting/setting_${projectionFileKey(record)}.json` })
}

export async function deletePreProductionWorkspaceAssetSlot(projectId: number, record: AssetSlotRecord): Promise<void> {
  const api = requirePreProductionWorkspaceAPI()
  const projectPath = await resolvePreProductionWorkspaceProjectPath(api, projectId)
  await api.delete({ path: `${projectPath}/assets/asset_slot_${projectionFileKey(record)}.json` })
}

export function preProductionWorkspaceProjectPath(userId: string | number, projectId: string | number): string {
  return `edit/projects/${String(projectId)}`
}

export function preProductionWorkspacePath(projectId: string | number): string {
  return preProductionWorkspaceProjectPath('local', projectId)
}

async function listWorkspaceRecords<TRecord extends SemanticEntityRecord>(
  api: PreProductionWorkspaceFilesAPI,
  directory: string,
  mapRecord: WorkspaceRecordMapper<TRecord>,
  fileNamePattern: RegExp,
): Promise<Array<PreProductionWorkspaceRecord<TRecord>>> {
  let listed: ElectronMovScriptWorkspaceFilesListResult
  try {
    listed = await api.list({ path: directory })
  } catch {
    return []
  }
  const files = listed.entries.filter((entry) => entry.kind === 'file' && fileNamePattern.test(entry.name))
  const rows = await Promise.all(files.map((entry) => readWorkspaceRecord(api, entry, mapRecord)))
  return rows.filter((item): item is PreProductionWorkspaceRecord<TRecord> => Boolean(item))
}

async function readWorkspaceSnapshotRecords<TRecord extends SemanticEntityRecord>(
  api: PreProductionWorkspaceFilesAPI,
  path: string,
  workspaceKeys: string[],
  mapRecord: WorkspaceRecordMapper<TRecord>,
): Promise<Array<PreProductionWorkspaceRecord<TRecord>>> {
  try {
    const file = await api.read({ path })
    const value = JSON.parse(file.content) as unknown
    const rows = workspaceSnapshotRows(value, workspaceKeys)
    return rows.map((row, index) => ({
      path: `${path}#${index}`,
      record: mapRecord(row, `${path}#${index}`),
    }))
  } catch {
    return []
  }
}

async function readWorkspaceRecord<TRecord extends SemanticEntityRecord>(
  api: PreProductionWorkspaceFilesAPI,
  entry: ElectronMovScriptWorkspaceFileEntry,
  mapRecord: WorkspaceRecordMapper<TRecord>,
): Promise<PreProductionWorkspaceRecord<TRecord> | null> {
  try {
    const file = await api.read({ path: entry.path })
    const value = JSON.parse(file.content) as unknown
    if (!isRecord(value)) return null
    return { path: entry.path, record: mapRecord(value, entry.path) }
  } catch {
    return null
  }
}

async function resolvePreProductionWorkspaceProjectPath(api: PreProductionWorkspaceFilesAPI, projectId: number): Promise<string> {
  await api.root()
  return preProductionWorkspaceProjectPath('local', projectId)
}

function workspaceSnapshotRows(value: unknown, workspaceKeys: string[]): Array<Record<string, unknown>> {
  const envelope = isRecord(value) ? value : {}
  const workspace = isRecord(envelope.workspace)
    ? envelope.workspace
    : isRecord(envelope.data)
      ? envelope.data
      : envelope
  for (const key of workspaceKeys) {
    const rows = workspace[key]
    if (Array.isArray(rows)) return rows.filter(isRecord)
  }
  return []
}

function normalizeSettingProjection(
  projectId: number,
  record: SettingRecord | null | undefined,
  payload: SemanticEntityPayload,
): Record<string, unknown> {
  const clientId = stringValue(record?.client_id) ?? `local-${Date.now()}`
  return pruneUndefined({
    schema: SETTING_SCHEMA,
    id: positiveId(record?.ID),
    client_id: positiveId(record?.ID) ? undefined : clientId,
    project_id: projectId,
    kind: payload.kind ?? record?.kind ?? 'person',
    name: payload.name ?? record?.name ?? '未命名设定',
    alias: payload.alias ?? record?.alias,
    description: payload.description ?? record?.description,
    content: payload.content ?? record?.content,
    importance: payload.importance ?? record?.importance,
    status: payload.status ?? record?.status ?? 'workspace',
  })
}

function normalizeAssetSlotProjection(
  projectId: number,
  record: AssetSlotRecord | null | undefined,
  payload: SemanticEntityPayload,
): Record<string, unknown> {
  const clientId = stringValue(record?.client_id) ?? `local-${Date.now()}`
  return pruneUndefined({
    schema: ASSET_SLOT_SCHEMA,
    id: positiveId(record?.ID),
    client_id: positiveId(record?.ID) ? undefined : clientId,
    project_id: projectId,
    owner_type: payload.owner_type ?? record?.owner_type,
    owner_id: numberValue(payload.owner_id ?? record?.owner_id),
    setting_id: numberValue(payload.setting_id ?? record?.setting_id),
    setting_state_id: numberValue(payload.setting_state_id ?? record?.setting_state_id),
    kind: payload.kind ?? record?.kind ?? 'image',
    name: payload.name ?? record?.name ?? '未命名素材',
    description: payload.description ?? record?.description,
    slot_key: payload.slot_key ?? record?.slot_key,
    prompt_hint: payload.prompt_hint ?? record?.prompt_hint,
    priority: payload.priority ?? record?.priority,
    status: payload.status ?? record?.status ?? 'missing',
    resource_id: numberValue(payload.resource_id ?? record?.resource_id),
    locked_asset_slot_id: numberValue(payload.locked_asset_slot_id ?? record?.locked_asset_slot_id),
    metadata_json: payload.metadata_json ?? record?.metadata_json,
  })
}

function settingRecordFromProjection(value: Record<string, unknown>, path: string): SettingRecord {
  const id = workspaceRecordId(value, path)
  return pruneUndefined({
    ...value,
    ID: id,
    id,
    project_id: numberValue(value.project_id),
    status: stringValue(value.status),
  }) as SettingRecord
}

function assetSlotRecordFromProjection(value: Record<string, unknown>, path: string): AssetSlotRecord {
  const id = workspaceRecordId(value, path)
  return pruneUndefined({
    ...value,
    ID: id,
    id,
    project_id: numberValue(value.project_id),
    production_id: numberValue(value.production_id),
    owner_id: numberValue(value.owner_id),
    setting_id: numberValue(value.setting_id),
    setting_state_id: numberValue(value.setting_state_id),
    resource_id: numberValue(value.resource_id),
    locked_asset_slot_id: numberValue(value.locked_asset_slot_id),
    status: stringValue(value.status),
  }) as AssetSlotRecord
}

function workspaceRecordId(value: Record<string, unknown>, path: string): number {
  const id = positiveId(value.id) ?? positiveId(value.ID)
  if (id) return id
  const clientId = stringValue(value.client_id) ?? path
  return -stablePositiveHash(clientId)
}

function projectionFileKey(record: SemanticEntityRecord | null | undefined, fallback?: Record<string, unknown>): string {
  const id = positiveId(record?.ID) ?? positiveId(record?.id)
  if (id) return String(id)
  return stringValue(record?.client_id)
    ?? stringValue(fallback?.client_id)
    ?? `local-${Date.now()}`
}

function positiveId(value: unknown): number | undefined {
  const numeric = numberValue(value)
  return numeric && numeric > 0 ? numeric : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}

function serializeProjection(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function stablePositiveHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}
