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
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'
import {
  expectedOutputKindForContentUnitType,
  parseContentUnitEditPromptRefs,
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
    if (!expectedKind && isRuntimeContentUnitDocument(entry.file.relativePath)) {
      continue
    }
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
        message: `source path does not match required workspace hierarchy for ${expectedKind}`,
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
    if (expectedKind === 'content_unit') {
      validateContentUnitRefs(entry.file, entry.data, graph, issues)
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
  const expectedOutputKind = expectedOutputKindForContentUnitType(contentUnitType)
  if (expectedOutputKind && outputKind !== expectedOutputKind) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${contentUnitType} content_unit output_kind must be ${expectedOutputKind}`,
    })
  }
  const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
  if (!primaryKind) return
  const refs = parseContentUnitEditPromptRefs(record.edit_prompt)
  const primaryRefs = refs.filter((ref) => ref.kind === primaryKind)
  if (primaryRefs.length === 0) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${contentUnitType} content_unit requires {{${primaryKind}:id}} in edit_prompt`,
    })
  }
  if (primaryRefs.length > 1) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `${contentUnitType} content_unit accepts only one {{${primaryKind}:id}} primary ref`,
    })
  }
  for (const ref of refs) {
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

function validateAudioCueRefs(
  file: MovScriptSourceDomainRecord['file'],
  record: Record<string, unknown>,
  graph: MovScriptSourceDomainGraph,
  issues: MovScriptSourceValidationIssue[],
): void {
  const scopeRef = typeof record.scope_ref === 'string' ? normalizeWorkspacePath(record.scope_ref) : undefined
  const storyboardRef = typeof record.storyboard_ref === 'string' ? normalizeWorkspacePath(record.storyboard_ref) : undefined
  const scope = scopeRef ? sourceRecordByPathOrId(graph, 'scene_moment', scopeRef) : undefined
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
      } else if (setting && !settingState.dir.startsWith(`${setting.dir}/states/`)) {
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
  return /^.+\/shots\/[^/]+\/storyboards\/[^/]+$/.test(storyboardDir)
    && storyboardDir.startsWith(`${sceneMomentDir}/shots/`)
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
  const patterns: Record<string, RegExp> = {
    project: /^project\.json$/,
    project_standards: /^(project_standards\.json|project_standards\/project_standards\.json)$/,
    setting: /^settings\/[^/]+\/setting\.json$/,
    setting_state: /^settings\/[^/]+\/states\/[^/]+\/setting_state\.json$/,
    asset: /^settings\/[^/]+\/states\/[^/]+\/assets\/[^/]+\/asset\.json$/,
    script: /^scripts\/[^/]+\/script\.json$/,
    script_version: /^scripts\/[^/]+\/versions\/[^/]+\/script_version\.json$/,
    script_block: /^scripts\/[^/]+\/versions\/[^/]+\/blocks\/[^/]+\/script_block\.json$/,
    content_unit: /^content_units\/[^/]+\/content_unit\.json$/,
    keyframe: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/shots\/[^/]+\/keyframes\/[^/]+\/keyframe\.json$/,
    production: /^productions\/[^/]+\/production\.json$/,
    segment: /^productions\/[^/]+\/segments\/[^/]+\/segment\.json$/,
    scene_moment: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/scene_moment\.json$/,
    shot: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/shots\/[^/]+\/shot\.json$/,
    storyboard: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/shots\/[^/]+\/storyboards\/[^/]+\/storyboard\.json$/,
    audio_cue: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/audio_cues\/[^/]+\/audio_cue\.json$/,
    expression_unit: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/expression_units\/[^/]+\/expression_unit\.json$/,
  }
  return patterns[entityKind]?.test(normalized) ?? false
}

function isRuntimeContentUnitDocument(path: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  return /^content_units\/[^/]+\/candidates\/[^/]+\/content_candidate\.json$/.test(normalized)
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
