import { safeWorkspacePathToken } from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptWorkspaceEntityWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  projectId?: string | number
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
  entityKind: 'setting' | 'asset'
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
  const current = stripWorkspacePrivateFields(input.entity?.record ?? input.record ?? {})
  const id = stableEntityId(current, input.payload, 'setting', input.now)
  const path = sourcePath ?? `settings/${id}/setting.json`
  const record = pruneUndefined({
    ...current,
    ...input.payload,
    schema: 'movscript.setting.v1',
    kind: 'setting',
    id,
    project_id: input.projectId ?? current.project_id,
    title: stringValue(input.payload.title ?? input.payload.name ?? current.title ?? current.name) ?? 'Untitled setting',
    setting_kind: normalizeSettingKind(input.payload.setting_kind ?? input.payload.kind ?? current.setting_kind ?? current.kind),
    profile: normalizeProfile(input.payload, current),
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityKind: 'setting', record }
}

export async function upsertMovScriptWorkspaceAsset(
  input: MovScriptWorkspaceEntityWriteInput,
): Promise<MovScriptWorkspaceEntityWriteResult> {
  const sourcePath = input.entity?.path ?? workspacePath(input.record ?? {})
  const current = stripWorkspacePrivateFields(input.entity?.record ?? input.record ?? {})
  const id = stableEntityId(current, input.payload, 'asset', input.now)
  const settingId = entityRef(input.payload.setting_id ?? input.payload.settingId ?? current.setting_id ?? current.settingId)
  const settingStateId = entityRef(input.payload.setting_state_id ?? input.payload.settingStateId ?? current.setting_state_id ?? current.settingStateId)
  const path = sourcePath ?? assetPath({ id, settingId, settingStateId })
  const lockResourceId = input.payload.resource_id ?? input.payload.resourceId ?? current.resource_id ?? current.resourceId
  const record = pruneUndefined({
    ...current,
    ...input.payload,
    schema: 'movscript.asset.v1',
    kind: 'asset',
    id,
    project_id: input.projectId ?? current.project_id,
    title: stringValue(input.payload.title ?? input.payload.name ?? current.title ?? current.name) ?? 'Untitled asset',
    slot: stringValue(input.payload.slot ?? input.payload.slot_key ?? input.payload.slotKey ?? current.slot ?? current.slot_key ?? current.slotKey) ?? id,
    asset_kind: normalizeAssetKind(input.payload.asset_kind ?? input.payload.kind ?? current.asset_kind ?? current.kind),
    prompt_hint: stringValue(input.payload.prompt_hint ?? input.payload.promptHint ?? current.prompt_hint ?? current.promptHint),
    setting_id: settingId,
    setting_state_id: settingStateId,
    candidates: Array.isArray(current.candidates) ? current.candidates : [],
    ...(lockResourceId !== undefined && lockResourceId !== null && String(lockResourceId).trim() !== ''
      ? { lock: { resource_id: lockResourceId, reason: 'selected' } }
      : {}),
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, entityKind: 'asset', record }
}

export async function deleteMovScriptWorkspaceEntity(input: MovScriptWorkspaceEntityDeleteInput): Promise<void> {
  const path = input.entity?.path ?? workspacePath(input.record ?? {})
  if (!path) throw new Error('workspace entity path is required')
  await input.fileRepository.delete({ path })
}

export function movScriptWorkspaceAssetPath(input: { id: string; settingId?: string; settingStateId?: string }): string {
  const settingId = input.settingId ?? 'setting_unassigned'
  if (input.settingStateId) return `settings/${settingId}/states/${input.settingStateId}/assets/${input.id}/asset.json`
  return `settings/${settingId}/assets/${input.id}/asset.json`
}

const assetPath = movScriptWorkspaceAssetPath

function stableEntityId(
  current: Record<string, unknown>,
  payload: Record<string, unknown>,
  prefix: 'setting' | 'asset',
  now?: Date,
): string {
  const value = payload.workspace_entity_id
    ?? payload.workspaceEntityId
    ?? current.workspace_entity_id
    ?? current.workspaceEntityId
    ?? payload.id
    ?? payload.ID
    ?? current.id
    ?? current.ID
    ?? current.client_id
    ?? current.clientId
  const raw = value === undefined || value === null || String(value).trim() === ''
    ? `${prefix}_local_${(now ?? new Date()).getTime()}`
    : String(value)
  const token = safeWorkspacePathToken(raw)
  return token.startsWith(`${prefix}_`) ? token : `${prefix}_${token}`
}

function entityRef(value: unknown): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  const token = safeWorkspacePathToken(String(value))
  if (token.startsWith('setting_') || token.startsWith('setting_state_')) return token
  return /^\d+$/.test(token) ? `setting_${token}` : token
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

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
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
