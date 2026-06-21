import {
  entityIdentity,
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptWorkspaceEntityWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  entity?: {
    record: Record<string, unknown>
    path: string
  } | null
  record?: Record<string, unknown> | null
  payload: Record<string, unknown>
  now?: Date
}

export interface MovScriptWorkspaceEntityWriteResult {
  path: string
  entityKind: 'setting' | 'setting_state' | 'asset'
  record: Record<string, unknown>
}

export interface MovScriptWorkspaceEntityDeleteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  entity?: {
    record: Record<string, unknown>
    path: string
  } | null
  record?: Record<string, unknown>
}

export async function upsertMovScriptWorkspaceSetting(
  input: MovScriptWorkspaceEntityWriteInput,
): Promise<MovScriptWorkspaceEntityWriteResult> {
  const sourcePath = input.entity?.path ?? workspacePath(input.record ?? {})
  const current = stripEntityPrivateFields(input.entity?.record ?? input.record ?? {})
  const payload = stripEntityPrivateFields(input.payload)
  const identity = entityIdentity(entityIdentityValue(current, payload, input.now), 'setting')
  const title = stringValue(payload.title ?? current.title)
    ?? displayName(identity.id)
  const path = sourcePath ?? `settings/${identity.slug}/setting.json`
  const record = pruneUndefined({
    ...current,
    ...payload,
    schema: 'movscript.setting.v1',
    kind: 'setting',
    id: identity.id,
    title,
    setting_kind: normalizeSettingKind(payload.setting_kind ?? payload.kind ?? current.setting_kind ?? current.kind),
    profile: normalizeProfile(payload, current),
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityKind: 'setting', record }
}

export async function upsertMovScriptWorkspaceAsset(
  input: MovScriptWorkspaceEntityWriteInput,
): Promise<MovScriptWorkspaceEntityWriteResult> {
  const sourcePath = input.entity?.path ?? workspacePath(input.record ?? {})
  const current = stripEntityPrivateFields(input.entity?.record ?? input.record ?? {})
  const payload = stripEntityPrivateFields(input.payload)
  const identity = entityIdentity(entityIdentityValue(current, payload, input.now), 'asset')
  const sourcePathSettingId = sourcePath ? pathSegmentAfter(sourcePath, 'settings') : undefined
  const sourcePathSettingStateId = sourcePath ? pathSegmentAfter(sourcePath, 'states') : undefined
  if (sourcePath && !sourcePathSettingStateId) {
    throw new Error('asset source path must be under a setting state')
  }
  const settingId = entityRef(
    payload.setting_id ?? payload.settingId ?? payload.setting_ref ?? payload.settingRef
    ?? current.setting_id ?? current.settingId ?? current.setting_ref ?? current.settingRef,
    'setting',
  )
    ?? sourcePathSettingId
  const settingStateId = entityRef(
    payload.setting_state_id ?? payload.settingStateId ?? payload.setting_state_ref ?? payload.settingStateRef
    ?? current.setting_state_id ?? current.settingStateId ?? current.setting_state_ref ?? current.settingStateRef,
    'setting_state',
  )
    ?? sourcePathSettingStateId
  if (!settingId) {
    throw new Error('asset requires setting_id; assets must be stored under settings/{setting}/states/{state}/assets/{asset}/asset.json')
  }
  if (!settingStateId) {
    throw new Error('asset requires setting_state_id; assets must be stored under settings/{setting}/states/{state}/assets/{asset}/asset.json')
  }
  const title = stringValue(payload.title ?? current.title)
    ?? displayName(identity.id)
  const path = sourcePath ?? assetPath({ id: identity.id, settingId, settingStateId })
  const record = pruneUndefined({
    ...stripAssetOwnershipAliasFields(current),
    ...stripAssetOwnershipAliasFields(payload),
    schema: 'movscript.asset.v1',
    kind: 'asset',
    id: identity.id,
    title,
    slot: stringValue(payload.slot ?? payload.slot_key ?? payload.slotKey ?? current.slot ?? current.slot_key ?? current.slotKey) ?? identity.slug,
    asset_kind: normalizeAssetKind(payload.asset_kind ?? payload.kind ?? current.asset_kind ?? current.kind),
    prompt_hint: stringValue(payload.prompt_hint ?? payload.promptHint ?? current.prompt_hint ?? current.promptHint),
    setting_id: settingId,
    setting_state_id: settingStateId,
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityKind: 'asset', record }
}

export async function upsertMovScriptWorkspaceSettingState(
  input: MovScriptWorkspaceEntityWriteInput,
): Promise<MovScriptWorkspaceEntityWriteResult> {
  const sourcePath = input.entity?.path ?? workspacePath(input.record ?? {})
  const current = stripEntityPrivateFields(input.entity?.record ?? input.record ?? {})
  const payload = stripEntityPrivateFields(input.payload)
  const identity = entityIdentity(entityIdentityValue(current, payload, input.now), 'setting_state')
  const sourcePathSettingId = sourcePath ? pathSegmentAfter(sourcePath, 'settings') : undefined
  const settingId = entityRef(
    payload.setting_id ?? payload.settingId ?? payload.setting_ref ?? payload.settingRef
    ?? current.setting_id ?? current.settingId ?? current.setting_ref ?? current.settingRef,
    'setting',
  )
    ?? sourcePathSettingId
  if (!settingId) {
    throw new Error('setting state requires setting_id; states must be stored under settings/{setting}/states/{state}/setting_state.json')
  }
  const title = stringValue(payload.title ?? current.title)
    ?? displayName(identity.id)
  const path = sourcePath ?? `settings/${entityPathSlug(settingId, 'setting')}/states/${identity.slug}/setting_state.json`
  const record = pruneUndefined({
    ...current,
    ...payload,
    schema: 'movscript.setting_state.v1',
    kind: 'setting_state',
    id: identity.id,
    title,
    setting_id: settingId,
    state_kind: stringValue(payload.state_kind ?? payload.stateKind ?? payload.kind ?? current.state_kind ?? current.stateKind ?? current.kind),
    description: stringValue(payload.description ?? current.description),
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityKind: 'setting_state', record }
}

export async function deleteMovScriptWorkspaceEntity(input: MovScriptWorkspaceEntityDeleteInput): Promise<void> {
  const path = input.entity?.path ?? workspacePath(input.record ?? {})
  if (!path) throw new Error('workspace entity path is required')
  await input.fileRepository.delete({ path })
}

export function movScriptWorkspaceAssetPath(input: { id: string; settingId: string; settingStateId: string }): string {
  const settingSlug = entityPathSlug(input.settingId, 'setting')
  const assetSlug = entityPathSlug(input.id, 'asset')
  return `settings/${settingSlug}/states/${entityPathSlug(input.settingStateId, 'setting_state')}/assets/${assetSlug}/asset.json`
}

const assetPath = movScriptWorkspaceAssetPath

function entityIdentityValue(
  current: Record<string, unknown>,
  payload: Record<string, unknown>,
  now?: Date,
): unknown {
  return payload.workspace_slug
    ?? payload.workspaceSlug
    ?? current.workspace_slug
    ?? current.workspaceSlug
    ?? payload.workspace_entity_id
    ?? payload.workspaceEntityId
    ?? current.workspace_entity_id
    ?? current.workspaceEntityId
    ?? payload.id
    ?? payload.ID
    ?? current.id
    ?? current.ID
    ?? current.client_id
    ?? current.clientId
    ?? `local_${(now ?? new Date()).getTime()}`
}

function entityRef(value: unknown, entityKind: string): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  return semanticEntityId(value, entityKind)
}

function stripAssetOwnershipAliasFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'setting_ref' || key === 'settingRef' || key === 'setting_state_ref' || key === 'settingStateRef') continue
    output[key] = value
  }
  return output
}

function normalizeSettingKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'person' || kind === 'character') return 'character'
  if (kind === 'place' || kind === 'location') return 'location'
  if (kind === 'prop' || kind === 'world_rule' || kind === 'style' || kind === 'other') return kind
  return 'other'
}

function normalizeAssetKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text' || kind === 'reference' || kind === 'other') return kind
  return 'other'
}

function normalizeProfile(payload: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> | undefined {
  const existing = isRecord(current.profile) ? current.profile : {}
  const profile = pruneUndefined({
    ...existing,
    alias: payload.alias ?? current.alias,
    description: payload.description ?? current.description,
    content: payload.content ?? current.content,
    importance: payload.importance ?? current.importance,
  })
  return Object.keys(profile).length > 0 ? profile : undefined
}

function workspacePath(record: Record<string, unknown>): string | undefined {
  return stringValue(record.__workspace_path ?? record.workspace_path ?? record.path)
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function stripEntityPrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    if (key === 'name') continue
    output[key] = value
  }
  return output
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function displayName(value: unknown): string {
  const text = stringValue(value)
  return text ?? 'Untitled'
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
