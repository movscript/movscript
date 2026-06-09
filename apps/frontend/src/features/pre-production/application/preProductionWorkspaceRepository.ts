import type { SemanticEntityPayload, SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import {
  createElectronMovScriptWorkspaceService,
} from '@/shared/infrastructure/workspaceDomainRepository'
import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type {
  AssetSlotRecord,
  AssetSlotCandidateRecord,
  SettingRecord,
} from '@/features/pre-production/domain/preProductionAssetRows'

const entityByRecord = new WeakMap<Record<string, unknown>, MovScriptWorkspaceIndexedEntity>()
const candidateTargetByRecord = new WeakMap<Record<string, unknown>, MovScriptWorkspaceIndexedEntity>()

export interface PreProductionWorkspaceRecord<TRecord extends SemanticEntityRecord> {
  record: TRecord
  path: string
}

export interface PreProductionWorkspaceData {
  settings: SettingRecord[]
  assetSlots: AssetSlotRecord[]
  candidates: AssetSlotCandidateRecord[]
  source: 'workspace'
}

export async function loadPreProductionWorkspaceData(projectId: number): Promise<PreProductionWorkspaceData> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const [settingEntities, assetResult] = await Promise.all([
    service.querySettings(),
    service.queryAssets({ includeCandidates: true }),
  ])
  const assetSlots = assetResult.assets.map((entity: MovScriptWorkspaceIndexedEntity) => assetSlotRecordFromWorkspaceEntity(entity, projectId))
  return {
    source: 'workspace',
    settings: settingEntities.map((entity: MovScriptWorkspaceIndexedEntity) => settingRecordFromWorkspaceEntity(entity, projectId)),
    assetSlots,
    candidates: assetResult.assets.flatMap((entity: MovScriptWorkspaceIndexedEntity) => candidateRecordsFromAssetEntity(entity, projectId)),
  }
}

export async function savePreProductionWorkspaceSetting(
  projectId: number,
  record: SettingRecord | null | undefined,
  payload: SemanticEntityPayload,
): Promise<SettingRecord> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const result = await service.upsertSetting({
    entity: record ? entityByRecord.get(record as Record<string, unknown>) : undefined,
    payload,
  })
  return settingRecordFromWorkspaceEntity({ entityKind: 'setting', record: result.record, path: result.path, index: 0, id: entityId(result.record.id) }, projectId)
}

export async function savePreProductionWorkspaceAssetSlot(
  projectId: number,
  record: AssetSlotRecord | null | undefined,
  payload: SemanticEntityPayload,
): Promise<AssetSlotRecord> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const result = await service.upsertAsset({
    entity: record ? entityByRecord.get(record as Record<string, unknown>) : undefined,
    payload,
  })
  return assetSlotRecordFromWorkspaceEntity({ entityKind: 'asset', record: result.record, path: result.path, index: 0, id: entityId(result.record.id) }, projectId)
}

export async function deletePreProductionWorkspaceSetting(projectId: number, record: SettingRecord): Promise<void> {
  await createElectronMovScriptWorkspaceService({ projectId }).deleteEntity({ entity: entityByRecord.get(record as Record<string, unknown>) })
}

export async function deletePreProductionWorkspaceAssetSlot(projectId: number, record: AssetSlotRecord): Promise<void> {
  await createElectronMovScriptWorkspaceService({ projectId }).deleteEntity({ entity: entityByRecord.get(record as Record<string, unknown>) })
}

export async function savePreProductionWorkspaceAssetCandidate(
  projectId: number,
  record: AssetSlotCandidateRecord,
  payload: SemanticEntityPayload,
): Promise<AssetSlotCandidateRecord> {
  const candidateId = stringValue(record.client_id ?? record.id)
  if (!candidateId) throw new Error('候选缺少 ID')
  const targetEntity = candidateTargetByRecord.get(record as Record<string, unknown>)
  if (!targetEntity) throw new Error('候选缺少目标记录')
  const result = await createElectronMovScriptWorkspaceService({ projectId }).updateCandidate({
    targetEntity,
    targetKind: 'asset',
    candidateId,
    payload: {
      notes: stringValue(payload.note ?? payload.notes ?? record.note),
    },
  })
  return candidateRecordFromInlineCandidate(result.candidate, {
    entityKind: 'asset',
    record: result.record,
    path: result.path,
    index: 0,
    id: result.record.id as string | number | undefined,
  }, projectId, numberValue(record.asset_slot_id))
}

function settingRecordFromWorkspaceEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number): SettingRecord {
  const value = entity.record
  const profile = isRecord(value.profile) ? value.profile : {}
  const id = workspaceRecordId(value)
  const record = pruneUndefined({
    ...value,
    ID: id,
    id,
    workspace_entity_id: entityId(value.id),
    project_id: numberValue(value.project_id) ?? projectId,
    kind: normalizeUiSettingKind(value.setting_kind ?? value.kind),
    name: stringValue(value.name ?? value.title),
    alias: stringValue(value.alias ?? profile.alias),
    description: stringValue(value.description ?? profile.description),
    content: stringValue(value.content ?? profile.content),
    importance: stringValue(value.importance ?? profile.importance),
    status: normalizeUiDraftStatus(value.status),
    __workspace_entity_type: entity.entityKind,
  }) as SettingRecord
  entityByRecord.set(record as Record<string, unknown>, entity)
  return record
}

function assetSlotRecordFromWorkspaceEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number): AssetSlotRecord {
  const value = entity.record
  const id = workspaceRecordId(value)
  const record = pruneUndefined({
    ...value,
    ID: id,
    id,
    workspace_entity_id: entityId(value.id),
    project_id: numberValue(value.project_id) ?? projectId,
    production_id: numberValue(value.production_id),
    owner_id: numberValue(value.owner_id),
    setting_id: numericSuffix(value.setting_id),
    setting_state_id: numericSuffix(value.setting_state_id),
    kind: normalizeUiAssetKind(value.asset_kind ?? value.kind),
    name: stringValue(value.name ?? value.title),
    slot_key: stringValue(value.slot_key ?? value.slot),
    resource_id: numberValue(value.resource_id ?? (isRecord(value.lock) ? value.lock.resource_id : undefined)),
    locked_asset_slot_id: numberValue(value.locked_asset_slot_id),
    status: normalizeUiAssetStatus(value.status, value.lock),
    __workspace_entity_type: entity.entityKind,
  }) as AssetSlotRecord
  entityByRecord.set(record as Record<string, unknown>, entity)
  return record
}

function candidateRecordsFromAssetEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number): AssetSlotCandidateRecord[] {
  const candidates = Array.isArray(entity.record.candidates) ? entity.record.candidates.filter(isRecord) : []
  const assetSlotId = workspaceRecordId(entity.record)
  return candidates.map((candidate: Record<string, unknown>) => candidateRecordFromInlineCandidate(candidate, entity, projectId, assetSlotId))
}

function candidateRecordFromInlineCandidate(
  value: Record<string, unknown>,
  entity: MovScriptWorkspaceIndexedEntity,
  projectId: number,
  assetSlotId?: number,
): AssetSlotCandidateRecord {
  const id = workspaceRecordId(value)
  const record = pruneUndefined({
    ...value,
    ID: id,
    id,
    client_id: stringValue(value.client_id ?? value.id),
    project_id: numberValue(value.project_id) ?? projectId,
    asset_slot_id: numberValue(value.asset_slot_id ?? value.assetSlotId) ?? assetSlotId,
    candidate_asset_slot_id: numberValue(value.candidate_asset_slot_id),
    resource_id: numberValue(value.resource_id),
    source_type: stringValue(value.source_type ?? value.source),
    source_id: numberValue(value.source_id ?? (isRecord(value.metadata) ? value.metadata.source_id : undefined)),
    score: numberValue(value.score ?? (isRecord(value.metadata) ? value.metadata.score : undefined)),
    status: normalizeUiCandidateStatus(value.status),
    note: stringValue(value.note ?? value.notes),
    __workspace_entity_type: 'candidate',
  }) as AssetSlotCandidateRecord
  candidateTargetByRecord.set(record as Record<string, unknown>, entity)
  return record
}

function workspaceRecordId(value: Record<string, unknown>): number {
  const id = positiveId(value.id) ?? positiveId(value.ID)
  if (id) return id
  const suffixId = numericSuffix(value.id ?? value.ID)
  if (suffixId) return suffixId
  const clientId = stringValue(value.client_id ?? value.id ?? value.title ?? value.name) ?? 'workspace_record'
  return -stablePositiveHash(clientId)
}

function entityId(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
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

function numericSuffix(value: unknown): number | undefined {
  const direct = numberValue(value)
  if (direct !== undefined) return direct
  const text = stringValue(value)
  const match = text?.match(/(\d+)$/)
  return match ? numberValue(match[1]) : undefined
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

function normalizeUiSettingKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'character') return 'person'
  if (kind === 'location') return 'place'
  return kind ?? 'other'
}

function normalizeUiAssetKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text' || kind === 'reference') return kind
  return 'other'
}

function normalizeUiDraftStatus(value: unknown): string {
  const status = stringValue(value)
  if (status === 'draft') return 'workspace'
  if (status === 'confirmed') return 'active'
  return status ?? 'workspace'
}

function normalizeUiAssetStatus(value: unknown, lock: unknown): string {
  if (isRecord(lock)) return 'locked'
  const status = stringValue(value)
  if (status === 'draft') return 'missing'
  if (status === 'accepted') return 'locked'
  return status ?? 'missing'
}

function normalizeUiCandidateStatus(value: unknown): string {
  const status = stringValue(value)
  if (status === 'draft') return 'candidate'
  if (status === 'accepted') return 'selected'
  return status ?? 'candidate'
}

function stablePositiveHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}
