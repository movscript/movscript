import { defineProjectionAdapter } from '../adapter.js'
import {
  createWritableProjectionDeleteTarget,
  createWritableProjectionUpdateTarget,
} from '../updateTarget.js'
import type {
  EntityId,
  JsonPatchOperation,
  JsonValue,
  ProjectionAction,
  ProjectionCommandInput,
  ValidationIssue,
  WorkspaceUpdateTarget,
} from '../types.js'

export const movscriptAssetSlotProjectionSchema = 'movscript.asset_slot.v1'
export const movscriptCreativeReferenceProjectionSchema = 'movscript.creative_reference.v1'

export type MovScriptAssetSlotKind = 'image' | 'video' | 'audio' | 'text' | 'file'
export type MovScriptCreativeReferenceKind =
  | 'person'
  | 'place'
  | 'prop'
  | 'product'
  | 'brand'
  | 'style'
  | 'world_rule'
  | 'time_period'
  | 'restriction'
  | string

export interface MovScriptEntityRef {
  entityType?: string
  type?: string
  entityId?: EntityId
  id?: EntityId
  label?: string
  path?: string
}

export interface MovScriptCreativeReferenceProjection {
  schema: typeof movscriptCreativeReferenceProjectionSchema
  id?: EntityId
  client_id?: string
  project_id?: EntityId
  kind?: MovScriptCreativeReferenceKind
  name: string
  alias?: string
  description?: string
  content?: string
  importance?: string
  status?: string
  profile_json?: string
  tags_json?: string
  merge_candidates?: JsonValue[]
  source_script_id?: EntityId
  source_analysis_id?: EntityId
}

export type MovScriptCreativeReferenceEntity = Partial<MovScriptCreativeReferenceProjection> & {
  id?: EntityId
  ID?: EntityId
  project_id?: EntityId
  projectId?: EntityId
  client_id?: string
  clientId?: string
  profile_json?: string
  profileJson?: string
  tags_json?: string
  tagsJson?: string
  merge_candidates?: JsonValue[]
  mergeCandidates?: JsonValue[]
  source_script_id?: EntityId
  sourceScriptId?: EntityId
  source_analysis_id?: EntityId
  sourceAnalysisId?: EntityId
}

export interface MovScriptAssetSlotProjection {
  schema: typeof movscriptAssetSlotProjectionSchema
  id?: EntityId
  client_id?: string
  project_id?: EntityId
  production_id?: EntityId
  owner?: MovScriptEntityRef
  creative_reference_id?: EntityId
  creative_reference_state_id?: EntityId
  owner_type?: string
  owner_id?: EntityId
  kind: MovScriptAssetSlotKind
  name: string
  description?: string
  slot_key?: string
  prompt_hint?: string
  status?: string
  priority?: string
  resource_id?: EntityId
  locked_asset_slot_id?: EntityId
  metadata_json?: string
}

export type MovScriptAssetSlotEntity = Partial<MovScriptAssetSlotProjection> & {
  id?: EntityId
  ID?: EntityId
  project_id?: EntityId
  projectId?: EntityId
  production_id?: EntityId
  productionId?: EntityId
  creative_reference_id?: EntityId
  creativeReferenceId?: EntityId
  creative_reference_state_id?: EntityId
  creativeReferenceStateId?: EntityId
  owner_type?: string
  ownerType?: string
  owner_id?: EntityId
  ownerId?: EntityId
  slot_key?: string
  slotKey?: string
  prompt_hint?: string
  promptHint?: string
  resource_id?: EntityId
  resourceId?: EntityId
  locked_asset_slot_id?: EntityId
  lockedAssetSlotId?: EntityId
  metadata_json?: string
  metadataJson?: string
}

export interface MovScriptAssetSlotCommand {
  type: 'movscript.asset_slot.create' | 'movscript.asset_slot.update' | 'movscript.asset_slot.delete'
  filePath: string
  entityType: 'asset_slot'
  entityId?: EntityId
  clientId?: string
  action: ProjectionAction
  input?: Partial<MovScriptAssetSlotProjection>
  patch: JsonPatchOperation[]
}

export interface MovScriptCreativeReferenceCommand {
  type:
    | 'movscript.creative_reference.create'
    | 'movscript.creative_reference.update'
    | 'movscript.creative_reference.delete'
  filePath: string
  entityType: 'creative_reference'
  entityId?: EntityId
  clientId?: string
  action: ProjectionAction
  input?: Partial<MovScriptCreativeReferenceProjection>
  patch: JsonPatchOperation[]
}

export type MovScriptProjectCommand =
  | MovScriptAssetSlotCommand
  | MovScriptCreativeReferenceCommand

export const movscriptCreativeReferenceAdapter = defineProjectionAdapter<
  MovScriptCreativeReferenceProjection,
  MovScriptCreativeReferenceEntity,
  MovScriptCreativeReferenceCommand
>({
  schema: movscriptCreativeReferenceProjectionSchema,
  entityType: 'creative_reference',

  parseFile(content) {
    return JSON.parse(content) as MovScriptCreativeReferenceProjection
  },

  validateFile(value) {
    return validateMovScriptCreativeReferenceProjection(value)
  },

  toProjection(entity) {
    return normalizeMovScriptCreativeReferenceEntity(entity)
  },

  createCommands(input) {
    return {
      commands: [movscriptCreativeReferenceCommand(input)],
    }
  },
})

export const movscriptAssetSlotAdapter = defineProjectionAdapter<
  MovScriptAssetSlotProjection,
  MovScriptAssetSlotEntity,
  MovScriptAssetSlotCommand
>({
  schema: movscriptAssetSlotProjectionSchema,
  entityType: 'asset_slot',

  parseFile(content) {
    return JSON.parse(content) as MovScriptAssetSlotProjection
  },

  validateFile(value) {
    return validateMovScriptAssetSlotProjection(value)
  },

  toProjection(entity) {
    return normalizeMovScriptAssetSlotEntity(entity)
  },

  createCommands(input) {
    return {
      commands: [movscriptAssetSlotCommand(input)],
    }
  },
})

export const movscriptProjectAdapters = [
  movscriptCreativeReferenceAdapter,
  movscriptAssetSlotAdapter,
] as const

export function movscriptCreativeReferencePath(projectId: EntityId, id: EntityId | string): string {
  return `data/projects/${String(projectId)}/references/creative_reference_${String(id)}.json`
}

export function movscriptProjectRelativeCreativeReferencePath(id: EntityId | string): string {
  return `references/creative_reference_${String(id)}.json`
}

export function movscriptAssetSlotPath(projectId: EntityId, id: EntityId | string): string {
  return `data/projects/${String(projectId)}/assets/asset_slot_${String(id)}.json`
}

export function movscriptProjectRelativeAssetSlotPath(id: EntityId | string): string {
  return `assets/asset_slot_${String(id)}.json`
}

export function movscriptCreativeReferenceUpdateTarget(
  entity: MovScriptCreativeReferenceEntity,
  options: { path?: string; backendHash?: string } = {},
): WorkspaceUpdateTarget {
  const projection = normalizeMovScriptCreativeReferenceEntity(entity)
  return createWritableProjectionUpdateTarget({
    adapter: movscriptCreativeReferenceAdapter,
    entity: projection,
    entityId: projection.id,
    path: options.path ?? movscriptCreativeReferencePath(
      projection.project_id ?? 'unknown',
      projection.id ?? projection.client_id ?? 'new',
    ),
    backendHash: options.backendHash,
  })
}

export function movscriptAssetSlotUpdateTarget(
  entity: MovScriptAssetSlotEntity,
  options: { path?: string; backendHash?: string } = {},
): WorkspaceUpdateTarget {
  const projection = normalizeMovScriptAssetSlotEntity(entity)
  return createWritableProjectionUpdateTarget({
    adapter: movscriptAssetSlotAdapter,
    entity: projection,
    entityId: projection.id,
    path: options.path ?? movscriptAssetSlotPath(projection.project_id ?? 'unknown', projection.id ?? projection.client_id ?? 'new'),
    backendHash: options.backendHash,
  })
}

export function movscriptCreativeReferenceDeleteTarget(
  entity: Pick<MovScriptCreativeReferenceProjection, 'id' | 'project_id'>,
  options: { path?: string; backendHash?: string } = {},
): WorkspaceUpdateTarget {
  return createWritableProjectionDeleteTarget({
    adapter: movscriptCreativeReferenceAdapter,
    entityId: entity.id,
    path: options.path ?? movscriptCreativeReferencePath(entity.project_id ?? 'unknown', entity.id ?? 'unknown'),
    backendHash: options.backendHash,
  })
}

export function movscriptAssetSlotDeleteTarget(
  entity: Pick<MovScriptAssetSlotProjection, 'id' | 'project_id'>,
  options: { path?: string; backendHash?: string } = {},
): WorkspaceUpdateTarget {
  return createWritableProjectionDeleteTarget({
    adapter: movscriptAssetSlotAdapter,
    entityId: entity.id,
    path: options.path ?? movscriptAssetSlotPath(entity.project_id ?? 'unknown', entity.id ?? 'unknown'),
    backendHash: options.backendHash,
  })
}

export function normalizeMovScriptCreativeReferenceEntity(
  entity: MovScriptCreativeReferenceEntity,
): MovScriptCreativeReferenceProjection {
  const projection: MovScriptCreativeReferenceProjection = {
    schema: movscriptCreativeReferenceProjectionSchema,
    id: entity.id ?? entity.ID,
    client_id: entity.client_id ?? entity.clientId,
    project_id: entity.project_id ?? entity.projectId,
    kind: entity.kind,
    name: entity.name ?? '',
    alias: entity.alias,
    description: entity.description,
    content: entity.content,
    importance: entity.importance,
    status: entity.status,
    profile_json: entity.profile_json ?? entity.profileJson,
    tags_json: entity.tags_json ?? entity.tagsJson,
    merge_candidates: entity.merge_candidates ?? entity.mergeCandidates,
    source_script_id: entity.source_script_id ?? entity.sourceScriptId,
    source_analysis_id: entity.source_analysis_id ?? entity.sourceAnalysisId,
  }
  return pruneUndefined(projection)
}

export function normalizeMovScriptAssetSlotEntity(entity: MovScriptAssetSlotEntity): MovScriptAssetSlotProjection {
  const id = entity.id ?? entity.ID
  const ownerType = entity.owner?.entityType ?? entity.owner?.type ?? entity.owner_type ?? entity.ownerType
  const ownerId = entity.owner?.entityId ?? entity.owner?.id ?? entity.owner_id ?? entity.ownerId

  const projection: MovScriptAssetSlotProjection = {
    schema: movscriptAssetSlotProjectionSchema,
    id,
    client_id: entity.client_id,
    project_id: entity.project_id ?? entity.projectId,
    production_id: entity.production_id ?? entity.productionId,
    owner: ownerType ? pruneUndefined({
      entityType: ownerType,
      entityId: ownerId,
      label: entity.owner?.label,
      path: entity.owner?.path,
    }) : undefined,
    creative_reference_id: entity.creative_reference_id ?? entity.creativeReferenceId,
    creative_reference_state_id: entity.creative_reference_state_id ?? entity.creativeReferenceStateId,
    owner_type: ownerType,
    owner_id: ownerId,
    kind: entity.kind ?? 'image',
    name: entity.name ?? '',
    description: entity.description,
    slot_key: entity.slot_key ?? entity.slotKey,
    prompt_hint: entity.prompt_hint ?? entity.promptHint,
    status: entity.status,
    priority: entity.priority,
    resource_id: entity.resource_id ?? entity.resourceId,
    locked_asset_slot_id: entity.locked_asset_slot_id ?? entity.lockedAssetSlotId,
    metadata_json: entity.metadata_json ?? entity.metadataJson,
  }
  return pruneUndefined(projection)
}

function validateMovScriptCreativeReferenceProjection(value: unknown): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ severity: 'error', message: 'Creative reference projection must be an object.' }],
    }
  }

  const projection = value as Partial<MovScriptCreativeReferenceProjection>
  if (projection.schema !== movscriptCreativeReferenceProjectionSchema) {
    issues.push({ severity: 'error', path: '/schema', message: `Expected schema ${movscriptCreativeReferenceProjectionSchema}.` })
  }
  if (!projection.name || typeof projection.name !== 'string') {
    issues.push({ severity: 'error', path: '/name', message: 'Creative reference projection requires a name.' })
  }
  if (projection.kind !== undefined && typeof projection.kind !== 'string') {
    issues.push({ severity: 'error', path: '/kind', message: 'Creative reference kind must be a string when present.' })
  }
  validateJsonStringField(projection.profile_json, '/profile_json', 'profile_json', issues)
  validateJsonStringField(projection.tags_json, '/tags_json', 'tags_json', issues)
  if (projection.merge_candidates !== undefined && !Array.isArray(projection.merge_candidates)) {
    issues.push({ severity: 'error', path: '/merge_candidates', message: 'merge_candidates must be an array when present.' })
  }

  return { ok: issues.length === 0, issues }
}

function validateMovScriptAssetSlotProjection(value: unknown): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ severity: 'error', message: 'Asset slot projection must be an object.' }],
    }
  }

  const projection = value as Partial<MovScriptAssetSlotProjection>
  if (projection.schema !== movscriptAssetSlotProjectionSchema) {
    issues.push({ severity: 'error', path: '/schema', message: `Expected schema ${movscriptAssetSlotProjectionSchema}.` })
  }
  if (!projection.name || typeof projection.name !== 'string') {
    issues.push({ severity: 'error', path: '/name', message: 'Asset slot projection requires a name.' })
  }
  if (!projection.kind || !['image', 'video', 'audio', 'text', 'file'].includes(projection.kind)) {
    issues.push({ severity: 'error', path: '/kind', message: 'Asset slot kind must be image, video, audio, text, or file.' })
  }
  if (projection.owner && typeof (projection.owner.entityType ?? projection.owner.type) !== 'string') {
    issues.push({ severity: 'error', path: '/owner/entityType', message: 'Owner reference requires entityType.' })
  }
  validateJsonStringField(projection.metadata_json, '/metadata_json', 'metadata_json', issues)

  return { ok: issues.length === 0, issues }
}

function movscriptCreativeReferenceCommand(
  input: ProjectionCommandInput<MovScriptCreativeReferenceProjection>,
): MovScriptCreativeReferenceCommand {
  const local = input.target ?? input.local
  const commandType = input.action === 'create'
    ? 'movscript.creative_reference.create'
    : input.action === 'delete'
      ? 'movscript.creative_reference.delete'
      : 'movscript.creative_reference.update'

  return pruneUndefined({
    type: commandType,
    filePath: input.filePath,
    entityType: 'creative_reference',
    entityId: input.entity.entityId,
    clientId: local?.client_id,
    action: input.action,
    input: input.action === 'delete' ? undefined : creativeReferenceInput(local),
    patch: input.patch,
  })
}

function movscriptAssetSlotCommand(
  input: ProjectionCommandInput<MovScriptAssetSlotProjection>,
): MovScriptAssetSlotCommand {
  const local = input.target ?? input.local
  const commandType = input.action === 'create'
    ? 'movscript.asset_slot.create'
    : input.action === 'delete'
      ? 'movscript.asset_slot.delete'
      : 'movscript.asset_slot.update'

  return pruneUndefined({
    type: commandType,
    filePath: input.filePath,
    entityType: 'asset_slot',
    entityId: input.entity.entityId,
    clientId: local?.client_id,
    action: input.action,
    input: input.action === 'delete' ? undefined : assetSlotInput(local),
    patch: input.patch,
  })
}

function creativeReferenceInput(
  value: MovScriptCreativeReferenceProjection | undefined,
): Partial<MovScriptCreativeReferenceProjection> | undefined {
  if (!value) return undefined
  const {
    schema,
    id,
    ...input
  } = value
  return pruneUndefined(input)
}

function assetSlotInput(value: MovScriptAssetSlotProjection | undefined): Partial<MovScriptAssetSlotProjection> | undefined {
  if (!value) return undefined
  const {
    schema,
    id,
    owner,
    ...input
  } = value
  return pruneUndefined({
    ...input,
    owner_type: value.owner_type ?? owner?.entityType ?? owner?.type,
    owner_id: value.owner_id ?? owner?.entityId ?? owner?.id,
  })
}

function validateJsonStringField(
  value: unknown,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined || value === null) return
  if (typeof value !== 'string') {
    issues.push({ severity: 'error', path, message: `${label} must be a JSON string when present.` })
    return
  }
  try {
    JSON.parse(value)
  } catch {
    issues.push({ severity: 'error', path, message: `${label} must contain valid JSON when present.` })
  }
}

function pruneUndefined<T extends object>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}
