import {
  sourceEntityStableId,
  sourceRecordByPathOrId,
  stableDirectoryIdForSourceEntity,
  type MovScriptSourceDomainGraph,
  type MovScriptSourceDomainRecord,
  type MovScriptSourceFileSnapshot,
} from '../entityChanges/index.js'
import {
  getSemanticEntitySchemaEntry,
} from '@movscript/language/domain'
import {
  assertExplicitParentRefMatchesPath,
  assertNamespaceCannotOwnContentUnitRef,
  assertNamespaceCannotOwnProductionState,
  classifyMovScriptEntityKind,
  contentUnitTargetValidationDiagnostics,
} from '@movscript/domain'
import {
  normalizeWorkspacePath,
  sameEntityRef,
} from '@movscript/workspace/layout'
import {
  expectedOutputKindForContentUnitType,
  parseContentUnitEditPromptRefs,
  parseUnsupportedContentUnitEditPromptRefs,
  primaryRefFieldNameForKind,
  primaryRefIdsForContentUnitRecord,
  primaryRefKindForContentUnitType,
} from '../artifacts/contentProductionHelpers.js'

export type MovScriptSourceValidationIssueSeverity = 'error' | 'warning'

export interface MovScriptSourceValidationIssue {
  path: string
  severity: MovScriptSourceValidationIssueSeverity
  message: string
}

export function validateEditableFiles(
  files: readonly MovScriptSourceFileSnapshot[],
): MovScriptSourceValidationIssue[] {
  const issues: MovScriptSourceValidationIssue[] = []
  for (const file of files) {
    if (file.path.endsWith('.json')) {
      try {
        JSON.parse(file.content)
      } catch (error) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  }
  return issues
}

export function validateSourceDomainGraph(
  graph: MovScriptSourceDomainGraph,
): MovScriptSourceValidationIssue[] {
  const issues: MovScriptSourceValidationIssue[] = []

  for (const entry of graph.records) {
    if (!entry.file.path.endsWith('.json')) continue
    if (!isRecord(entry.data)) continue
    const expectedKind = entry.entityKind
    const schemaKind = typeof entry.data.schema === 'string'
      ? entry.data.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
      : undefined
    const actualKind = typeof entry.data.kind === 'string' ? entry.data.kind : undefined
    if (!expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'unsupported source file path for MovScript domain entity',
      })
      continue
    }
    if (!sourcePathMatchesEntityKind(entry.file.relativePath, expectedKind)) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `source file name does not match workspace entity kind ${expectedKind}`,
      })
    }
    const directoryId = stableDirectoryIdForSourceEntity(entry.file.relativePath, expectedKind)
    const recordId = sourceEntityStableId(entry.data, expectedKind)
    if (directoryId !== undefined && recordId !== undefined && String(recordId) !== directoryId) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `id ${String(recordId)} does not match source directory id ${directoryId}`,
      })
    }
    if (!schemaKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'missing schema field',
      })
    } else if (schemaKind !== expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `schema kind ${schemaKind} does not match source path entity ${expectedKind}`,
      })
    } else {
      validateSemanticEntitySchema(entry.file, entry.data, issues)
    }
    if (actualKind && actualKind !== expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `kind ${actualKind} does not match source path entity ${expectedKind}`,
      })
    }
    if (sourceEntityStableId(entry.data, expectedKind) === undefined) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'missing stable id field',
      })
    }
    for (const diagnostic of assertNamespaceCannotOwnContentUnitRef({
      entityKind: expectedKind,
      record: entry.data,
      path: entry.file.relativePath,
    })) {
      issues.push({
        path: entry.file.path,
        severity: diagnostic.severity,
        message: diagnostic.message,
      })
    }
    for (const diagnostic of assertNamespaceCannotOwnProductionState({
      entityKind: expectedKind,
      record: entry.data,
      path: entry.file.relativePath,
    })) {
      issues.push({
        path: entry.file.path,
        severity: diagnostic.severity,
        message: diagnostic.message,
      })
    }
    validateExplicitPathParentRefs(entry, graph, issues)
    if (expectedKind === 'content_unit') {
      validateContentUnitRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'asset') {
      validateAssetOwnership(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'storyboard') {
      validateStoryboardSettingRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'audio_cue') {
      validateAudioCueRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'keyframe') {
      validateKeyframeReferenceAssetRefs(entry.file, entry.data, graph, issues)
    }
  }
  return issues
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function validateExplicitPathParentRefs(
  entry: MovScriptSourceDomainRecord,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  if (!entry.entityKind || !isRecord(entry.data)) return
  for (const ref of explicitPathParentRefs(entry.entityKind, entry.data)) {
    const pathParent = ref.parentKind
      ? nearestAncestorRecord(graph, entry.file.relativePath, ref.parentKind)
      : nearestPathParentRecord(graph, entry)
    const childId = sourceRecordStableRef(entry)
    const parentId = pathParent ? sourceRecordStableRef(pathParent) : undefined
    for (const diagnostic of assertExplicitParentRefMatchesPath({
      child: {
        kind: entry.entityKind,
        ...(childId !== undefined ? { id: childId } : {}),
        path: entry.file.relativePath,
      },
      pathParent: pathParent ? {
        kind: pathParent.entityKind ?? 'unknown',
        ...(parentId !== undefined ? { id: parentId } : {}),
        path: pathParent.file.relativePath,
      } : undefined,
      explicitParentRef: ref.value,
      field: ref.field,
      path: entry.file.relativePath,
    })) {
      issues.push({
        path: entry.file.path,
        severity: diagnostic.severity,
        message: diagnostic.message,
      })
    }
  }
}

function explicitPathParentRefs(
  entityKind: string,
  record: Record<string, unknown>,
): { field: string; value: string | number; parentKind?: string }[] {
  const refs: { field: string; value: string | number; parentKind?: string }[] = []
  for (const field of [
    'parent_ref',
    'parentRef',
    'parent_id',
    'parentId',
    'parent_scope_ref',
    'parentScopeRef',
    'parent_scope_id',
    'parentScopeId',
    'parent_namespace_ref',
    'parentNamespaceRef',
  ]) {
    const value = idField(record[field])
    if (value !== undefined) refs.push({ field, value })
  }

  if (classifyMovScriptEntityKind(entityKind) === 'timeline_namespace') {
    for (const field of ['scope_ref', 'scopeRef']) {
      const value = idField(record[field])
      if (value !== undefined) refs.push({ field, value })
    }
  }

  if (entityKind === 'setting_state') {
    for (const field of ['setting_id', 'settingId', 'setting_ref', 'settingRef']) {
      const value = idField(record[field])
      if (value !== undefined) refs.push({ field, value, parentKind: 'setting' })
    }
  }

  if (entityKind === 'storyboard' || entityKind === 'keyframe') {
    for (const field of ['scene_moment_ref', 'sceneMomentRef']) {
      const value = idField(record[field])
      if (value !== undefined) refs.push({ field, value, parentKind: 'scene_moment' })
    }
    for (const field of ['expression_unit_ref', 'expressionUnitRef']) {
      const value = idField(record[field])
      if (value !== undefined) refs.push({ field, value, parentKind: 'expression_unit' })
    }
  }

  return refs
}

function validateSemanticEntitySchema(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  issues: MovScriptSourceValidationIssue[],
): void {
  const schemaId = typeof record.schema === 'string' ? record.schema : undefined
  const schema = schemaId ? getSemanticEntitySchemaEntry(schemaId) : null
  if (!schema) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `unknown semantic entity schema: ${schemaId ?? '<missing>'}`,
    })
    return
  }
  for (const message of validateJsonSchemaValue(record, schema.jsonSchema, '$')) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `schema validation failed: ${message}`,
    })
  }
}

function validateContentUnitRefs(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  const contentUnitType = typeof record.content_unit_type === 'string' ? record.content_unit_type : undefined
  const outputKind = typeof record.output_kind === 'string' ? record.output_kind : undefined
  if (!contentUnitType) return
  for (const diagnostic of contentUnitTargetValidationDiagnostics(record)) {
    issues.push({
      path: file.path,
      severity: diagnostic.severity,
      message: diagnostic.message,
    })
  }
  const expectedOutputKind = expectedOutputKindForContentUnitType(contentUnitType)
  if (expectedOutputKind && outputKind !== expectedOutputKind) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${contentUnitType} content_unit output_kind must be ${expectedOutputKind}`,
    })
  }
  const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
  for (const ref of parseUnsupportedContentUnitEditPromptRefs(record.edit_prompt)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `unsupported content_unit prompt ref kind "${ref.kind}": ${ref.raw}. Namespace vocabulary is context, not a selected-resource dependency`,
    })
  }
  if (!primaryKind) return
  const primaryRefs = primaryRefIdsForContentUnitRecord(record, primaryKind)
  const primaryFieldName = primaryRefFieldNameForKind(primaryKind)
  if (primaryRefs.length === 0) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${contentUnitType} content_unit requires ${primaryFieldName}`,
    })
  }
  const uniquePrimaryRefs: string[] = []
  for (const ref of primaryRefs) {
    if (uniquePrimaryRefs.some((primaryRef) => sameRefId(primaryRef, ref, primaryKind))) continue
    uniquePrimaryRefs.push(ref)
  }
  if (uniquePrimaryRefs.length > 1) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${contentUnitType} content_unit accepts only one ${primaryFieldName}`,
    })
  }
  for (const ref of primaryRefs) {
    if (!sourceRecordByPathOrId(graph, primaryKind, ref)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `${contentUnitType} content_unit ${primaryFieldName} does not resolve: ${ref}`,
      })
    }
  }
  const refs = parseContentUnitEditPromptRefs(record.edit_prompt)
  for (const ref of refs) {
    if (ref.kind === primaryKind && primaryRefs.some((primaryRef) => sameRefId(primaryRef, ref.id, primaryKind))) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `${contentUnitType} content_unit edit_prompt must not reference its own ${primaryFieldName}: ${ref.raw}`,
      })
    }
    const resolved = sourceRecordByPathOrId(graph, ref.kind, ref.id)
    if (!resolved && ref.kind !== 'content_unit') {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `content_unit prompt ref does not resolve: ${ref.raw}`,
      })
    }
  }
}

function validateAssetOwnership(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  const setting = nearestAncestorRecord(graph, file.relativePath, 'setting')
  const settingState = nearestAncestorRecord(graph, file.relativePath, 'setting_state')
  const pathSettingId = setting ? sourceRecordStableRef(setting) : undefined
  const pathStateId = settingState ? sourceRecordStableRef(settingState) : undefined
  const recordSettingId = idField(record.setting_id ?? record.settingId ?? record.setting_ref ?? record.settingRef)
  const recordStateId = idField(record.setting_state_id ?? record.settingStateId ?? record.setting_state_ref ?? record.settingStateRef)
  if (!setting) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: 'asset source path setting parent does not resolve',
    })
  }
  if (!settingState) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: 'asset source path setting state parent does not resolve',
    })
  }
  if (recordSettingId === undefined) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: 'asset requires setting_id matching source path',
    })
  } else if (pathSettingId !== undefined && !sameRefId(String(recordSettingId), pathSettingId, 'setting')) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `asset setting_id ${String(recordSettingId)} does not match source path setting ${pathSettingId}`,
    })
  }
  if (recordStateId === undefined) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: 'asset requires setting_state_id matching source path',
    })
  } else if (pathStateId !== undefined && !sameRefId(String(recordStateId), pathStateId, 'setting_state')) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `asset setting_state_id ${String(recordStateId)} does not match source path state ${pathStateId}`,
    })
  }

  if (setting && settingState && !isDescendantDir(settingState.dir, setting.dir)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `asset setting_state_id does not belong to setting_id: ${pathStateId}`,
    })
  }
}

function validateAudioCueRefs(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  const scopeRef = typeof record.scope_ref === 'string' ? normalizeWorkspacePath(record.scope_ref) : undefined
  const expressionUnitRef = typeof record.expression_unit_ref === 'string' ? normalizeWorkspacePath(record.expression_unit_ref) : undefined
  const storyboardRef = typeof record.storyboard_ref === 'string' ? normalizeWorkspacePath(record.storyboard_ref) : undefined
  const scope = scopeRef ? sourceRecordByPathOrId(graph, 'scene_moment', scopeRef) : undefined
  const expressionUnit = expressionUnitRef ? sourceRecordByPathOrId(graph, 'expression_unit', expressionUnitRef) : undefined
  const storyboard = storyboardRef ? sourceRecordByPathOrId(graph, 'storyboard', storyboardRef) : undefined
  const cueDir = file.relativePath.replace(/\/audio_cue\.json$/, '')
  const sceneMomentDir = cueDir.replace(/\/audio_cues\/[^/]+$/, '')
  if (scopeRef && !scope) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue scope_ref does not resolve: ${scopeRef}`,
    })
  }
  if (scope && scope.dir !== sceneMomentDir) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue scope_ref must reference the owning scene moment: ${scopeRef}`,
    })
  }
  if (expressionUnitRef && !expressionUnit) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue expression_unit_ref does not resolve: ${expressionUnitRef}`,
    })
  }
  if (expressionUnit && !isDescendantDir(expressionUnit.dir, sceneMomentDir)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue expression_unit_ref is not under owning scene moment: ${expressionUnitRef}`,
    })
  }
  if (storyboardRef && !storyboard) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue storyboard_ref does not resolve: ${storyboardRef}`,
    })
  }
  if (storyboard && !isStoryboardUnderSceneMoment(storyboard.dir, sceneMomentDir)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue storyboard_ref is not under owning scene moment: ${storyboardRef}`,
    })
  }
  const assetRefs = Array.isArray(record.asset_refs) ? record.asset_refs : []
  for (const [index, assetRef] of assetRefs.entries()) {
    const assetId = idField(assetRef)
    const asset = assetId !== undefined ? sourceRecordByPathOrId(graph, 'asset', assetId) : undefined
    if (assetId === undefined || !asset) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `audio_cue asset_refs[${index}] does not resolve: ${String(assetRef)}`,
      })
    }
  }
}

function validateStoryboardSettingRefs(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  const settingRefs = Array.isArray(record.setting_refs) ? record.setting_refs.filter(isRecord) : []
  for (const [index, settingRef] of settingRefs.entries()) {
    const settingId = idField(settingRef.setting_id)
    const settingStateId = idField(settingRef.setting_state_id)
    const setting = settingId !== undefined ? sourceRecordByPathOrId(graph, 'setting', settingId) : undefined
    if (settingId !== undefined && !setting) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard setting_refs[${index}].setting_id does not resolve: ${String(settingId)}`,
      })
    }
    if (settingStateId !== undefined) {
      const settingState = sourceRecordByPathOrId(graph, 'setting_state', settingStateId)
      if (!settingState) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard setting_refs[${index}].setting_state_id does not resolve: ${String(settingStateId)}`,
        })
      } else if (setting && !isDescendantDir(settingState.dir, setting.dir)) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard setting_refs[${index}].setting_state_id does not belong to setting_id: ${String(settingStateId)}`,
        })
      }
    }
  }
}

function isStoryboardUnderSceneMoment(storyboardDir: string, sceneMomentDir: string): boolean {
  return storyboardDir.startsWith(`${sceneMomentDir}/storyboards/`)
    || /^.+\/expression_units\/[^/]+\/storyboards\/[^/]+$/.test(storyboardDir)
      && storyboardDir.startsWith(`${sceneMomentDir}/expression_units/`)
}

function validateKeyframeReferenceAssetRefs(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  const assetRefs = Array.isArray(record.reference_asset_refs) ? record.reference_asset_refs : []
  for (const [index, assetRef] of assetRefs.entries()) {
    const assetId = idField(assetRef)
    if (assetId === undefined) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `keyframe reference_asset_refs[${index}] must be a stable asset id or path`,
      })
      continue
    }
    if (!sourceRecordByPathOrId(graph, 'asset', assetId)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `keyframe reference_asset_refs[${index}] does not resolve: ${String(assetId)}`,
      })
    }
  }
}

function validateJsonSchemaValue(value: unknown, schema: unknown, path: string): string[] {
  if (!isRecord(schema)) return []
  const messages: string[] = []
  if ('const' in schema && !jsonValueEquals(value, schema.const)) {
    messages.push(`${path} must be ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonValueEquals(value, item))) {
    messages.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`)
  }
  if (schema.type !== undefined && !jsonSchemaTypeMatches(value, schema.type)) {
    messages.push(`${path} must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : String(schema.type)}`)
    return messages
  }
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    messages.push(`${path} must contain at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'}`)
  }
  if (schema.type === 'object' && isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []
    for (const key of required) {
      if (value[key] === undefined) messages.push(`${path}.${key} is required`)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (properties[key] === undefined) messages.push(`${path}.${key} is not allowed`)
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (value[key] !== undefined) messages.push(...validateJsonSchemaValue(value[key], propertySchema, `${path}.${key}`))
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => {
      messages.push(...validateJsonSchemaValue(item, schema.items, `${path}[${index}]`))
    })
  }
  return messages
}

function jsonSchemaTypeMatches(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((item) => jsonSchemaTypeMatches(value, item))
  if (type === 'object') return isRecord(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return true
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sourcePathMatchesEntityKind(path: string, entityKind: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  const fileName = normalized.split('/').pop()
  const fileNames: Record<string, string[]> = {
    project: ['project.json'],
    project_standards: ['project_standards.json'],
    setting: ['setting.json'],
    setting_state: ['setting_state.json'],
    asset: ['asset.json'],
    script: ['script.json'],
    script_version: ['script_version.json'],
    script_block: ['script_block.json'],
    content_unit: ['content_unit.json'],
    keyframe: ['keyframe.json'],
    production: ['production.json'],
    segment: ['segment.json'],
    scene_moment: ['scene_moment.json'],
    storyboard: ['storyboard.json'],
    audio_cue: ['audio_cue.json'],
    expression_unit: ['expression_unit.json'],
  }
  return fileName !== undefined && (fileNames[entityKind] ?? []).includes(fileName)
}

function nearestAncestorRecord(
  graph: MovScriptSourceDomainGraph,
  path: string,
  entityKind: string,
): MovScriptSourceDomainRecord | undefined {
  const dir = normalizeWorkspacePath(path).replace(/\/[^/]+$/, '')
  const candidates = graph.records
    .filter((record) => record.entityKind === entityKind && isDescendantDir(dir, record.dir))
    .sort((left, right) => right.dir.length - left.dir.length)
  return candidates[0]
}

function nearestPathParentRecord(
  graph: MovScriptSourceDomainGraph,
  entry: MovScriptSourceDomainRecord,
): MovScriptSourceDomainRecord | undefined {
  const dir = normalizeWorkspacePath(entry.file.relativePath).replace(/\/[^/]+$/, '')
  const candidates = graph.records
    .filter((record) => record.file.relativePath !== entry.file.relativePath)
    .filter((record) => record.entityKind !== undefined)
    .filter((record) => classifyMovScriptEntityKind(record.entityKind ?? '') !== undefined)
    .filter((record) => isDescendantDir(dir, record.dir))
    .sort((left, right) => right.dir.length - left.dir.length)
  return candidates[0]
}

function sourceRecordStableRef(record: MovScriptSourceDomainRecord): string | undefined {
  if (record.id !== undefined) return String(record.id)
  return stableDirectoryIdForSourceEntity(record.file.relativePath, record.entityKind ?? '')
}

function isDescendantDir(child: string, parent: string): boolean {
  const normalizedChild = normalizeWorkspacePath(child)
  const normalizedParent = normalizeWorkspacePath(parent)
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`)
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function sameRefId(left: string, right: string, kind: string): boolean {
  return sameEntityRef(left, right, kind)
    || lastPathSegment(left) === right
    || lastPathSegment(right) === left
}

function lastPathSegment(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.includes('/')) return undefined
  return value.split('/').filter(Boolean).at(-1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
