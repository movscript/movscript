import {
  buildContentSourceWorkspaceProjectTimelineStatus,
  buildContentSourceWorkspaceData,
  contentSourceWorkspaceContentUnitStatusSummaries,
} from '@movscript/core/content'
import {
  loadContentSourceWorkspaceSnapshotFromEngine,
} from '@movscript/core/content/node'

import {
  httpError,
  idValue,
  isNotFoundError,
  normalizeProjectAssetSourcePath,
  numberValue,
  parseJSONObjectFile,
  pathSegmentAfter,
  providerCertificationStorageKey,
  pruneUndefinedRecord,
  recordValue,
  stringValue,
} from './common.mjs'

const CONTENT_CANVAS_DIRECTORY = 'content_canvases'
const CONTENT_CANVAS_FILE_NAME = 'canvas.json'
const CONTENT_CANVAS_SCHEMA = 'movscript.content_canvas.v1'
const CONTENT_CANVASES_SCHEMA = 'movscript.content_canvases.v1'
const CONTENT_CANVAS_TITLE_MAX_LENGTH = 80
const CONTENT_CANVAS_TITLE_INVALID_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/

export async function listProjectContentCanvases(fileRepository) {
  const root = await fileRepository.list({ path: CONTENT_CANVAS_DIRECTORY })
  const canvases = []
  for (const entry of root.entries) {
    if (entry.kind !== 'directory') continue
    const path = `${entry.path}/${CONTENT_CANVAS_FILE_NAME}`
    const file = await fileRepository.read({ path }).catch((error) => {
      if (isNotFoundError(error)) return undefined
      throw error
    })
    if (!file) continue
    const record = parseProjectContentCanvasFile(file.content, path)
    canvases.push({
      canvasKind: 'content',
      canvas_kind: 'content',
      owner: 'project-service',
      path: file.path,
      version: file.version,
      updatedAt: file.updatedAt,
      record,
    })
  }
  canvases.sort((left, right) => {
    const updated = String(right.record.updated_at ?? '').localeCompare(String(left.record.updated_at ?? ''))
    return updated || String(left.record.title ?? left.record.id).localeCompare(String(right.record.title ?? right.record.id))
  })
  return {
    schema: CONTENT_CANVASES_SCHEMA,
    canvases,
  }
}

export async function writeProjectContentCanvas(fileRepository, input) {
  const record = projectContentCanvasRecordFromInput(input)
  const titleValidationError = validateProjectContentCanvasTitle(record.title)
  if (titleValidationError) throw titleValidationError
  const path = contentCanvasProjectFilePath(record.id)
  const source = recordValue(input) ?? {}
  const expectedVersion = stringValue(source.expectedVersion ?? source.expected_version)
  const written = await fileRepository.write({
    path,
    content: `${JSON.stringify(record, null, 2)}\n`,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  })
  return {
    status: 'written',
    canvasKind: 'content',
    canvas_kind: 'content',
    path: written.path,
    version: written.version,
    title: record.title,
    normalizedTitle: record.title,
    record,
    diagnostics: [],
  }
}

export async function patchProjectAssetProviderCertification(fileRepository, input) {
  const source = recordValue(input) ?? {}
  const path = normalizeProjectAssetSourcePath(source.assetPath ?? source.asset_path ?? source.path)
  const provider = stringValue(source.provider ?? source.provider_id ?? source.providerId)
  if (!provider) throw httpError(400, 'project_asset_provider_required', 'provider is required')
  const certification = recordValue(source.certification)
  if (!certification) throw httpError(400, 'project_asset_certification_required', 'certification is required')
  const file = await fileRepository.read({ path }).catch((error) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  const current = file ? parseJSONObjectFile(file.content, path) : recordValue(source.fallbackRecord ?? source.fallback_record)
  if (!current) throw httpError(404, 'project_asset_source_not_found', `asset source not found: ${path}`)
  const providerCertifications = recordValue(current.provider_certifications)
    ? { ...current.provider_certifications }
    : {}
  const storageKey = stringValue(source.storageKey ?? source.storage_key) ?? providerCertificationStorageKey(provider, certification)
  providerCertifications[storageKey] = certification
  const next = {
    ...current,
    provider_certifications: providerCertifications,
  }
  const expectedVersion = stringValue(source.expectedVersion ?? source.expected_version)
  const written = await fileRepository.write({
    path,
    content: `${JSON.stringify(next, null, 2)}\n`,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  })
  return {
    status: 'patched',
    path: written.path,
    version: written.version,
    provider,
    provider_id: provider,
    storage_key: storageKey,
    certification,
    record: next,
  }
}

export async function renameProjectContentCanvas(fileRepository, input) {
  const source = recordValue(input) ?? {}
  const id = stringValue(source.id ?? source.canvasId ?? source.canvas_id)
  if (!id) throw httpError(400, 'project_content_canvas_id_required', 'canvas id is required')
  const title = normalizeProjectContentCanvasTitle(source.title ?? source.name)
  const titleValidationError = validateProjectContentCanvasTitle(title)
  if (titleValidationError) throw titleValidationError
  const path = contentCanvasProjectFilePath(id)
  const file = await fileRepository.read({ path }).catch((error) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  if (!file) throw httpError(404, 'project_content_canvas_not_found', `content canvas not found: ${id}`)
  const current = parseProjectContentCanvasFile(file.content, path)
  const now = new Date().toISOString()
  const record = {
    ...current,
    title,
    name: title,
    updated_at: now,
  }
  const expectedVersion = stringValue(source.expectedVersion ?? source.expected_version)
  const written = await fileRepository.write({
    path,
    content: `${JSON.stringify(record, null, 2)}\n`,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  })
  return {
    status: 'renamed',
    canvasKind: 'content',
    canvas_kind: 'content',
    path: written.path,
    version: written.version,
    title,
    normalizedTitle: title,
    record,
    diagnostics: [],
  }
}

export async function runProjectContentCanvas({ projectDir, fileRepository, engine, input, now }) {
  const source = recordValue(input) ?? {}
  const canvasId = stringValue(source.id ?? source.canvasId ?? source.canvas_id)
  if (!canvasId) throw httpError(400, 'project_content_canvas_id_required', 'canvas id is required')
  const canvas = await readProjectContentCanvas(fileRepository, canvasId)
  const interpretation = await engine.interpret()
  const contentSnapshot = await loadContentSourceWorkspaceSnapshotFromEngine(engine)
  const contentData = buildContentSourceWorkspaceData(contentSnapshot)
  const contentUnitSummaries = contentSourceWorkspaceContentUnitStatusSummaries(contentSnapshot)
  const affectedContentUnitIds = contentCanvasRunAffectedContentUnitIds(canvas.record, contentSnapshot)
  const candidateImpact = contentCanvasRunCandidateImpact({
    affectedContentUnitIds,
    contentUnitSummaries,
    contentData,
  })
  const projectTimelineStatus = buildContentSourceWorkspaceProjectTimelineStatus(contentSnapshot, contentUnitSummaries)
  const operationId = `content-canvas-run:${contentCanvasProjectPathSegment(canvas.record.id)}:${now.getTime()}`
  return {
    schema: 'movscript.content_canvas_run.v1',
    status: 'completed',
    operationId,
    operation_id: operationId,
    canvasId: canvas.record.id,
    canvas_id: canvas.record.id,
    canvas: {
      canvasKind: 'content',
      canvas_kind: 'content',
      owner: 'project-service',
      path: canvas.path,
      version: canvas.version,
      record: canvas.record,
    },
    trace: {
      projectDir,
      command: 'runContentCanvas',
      interpretationId: interpretation?.manifest?.interpretationId,
      interpretation_id: interpretation?.manifest?.interpretationId,
      editorStatePath: interpretation?.manifest?.output?.editorStatePath,
      completedAt: now.toISOString(),
      completed_at: now.toISOString(),
    },
    readModel: {
      schema: 'movscript.content_canvas_run_read_model_summary.v1',
      status: projectTimelineStatus.status,
      timelineNamespaceCount: projectTimelineStatus.timeline_namespace_count,
      timeline_namespace_count: projectTimelineStatus.timeline_namespace_count,
      systemPrimitives: projectTimelineStatus.system_primitives,
      system_primitives: projectTimelineStatus.system_primitives,
    },
    candidateImpact,
    candidate_impact: candidateImpact,
  }
}

export async function deleteProjectContentCanvas(fileRepository, input) {
  const id = stringValue(input.id ?? input.canvasId ?? input.canvas_id)
  if (!id) throw httpError(400, 'project_content_canvas_id_required', 'canvas id is required')
  const path = contentCanvasProjectFilePath(id)
  await fileRepository.delete({ path })
  return {
    status: 'deleted',
    canvasKind: 'content',
    canvas_kind: 'content',
    path,
  }
}

export async function readProjectContentCanvas(fileRepository, id) {
  const path = contentCanvasProjectFilePath(id)
  const file = await fileRepository.read({ path }).catch((error) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  if (!file) throw httpError(404, 'project_content_canvas_not_found', `content canvas not found: ${id}`)
  return {
    canvasKind: 'content',
    canvas_kind: 'content',
    owner: 'project-service',
    path: file.path,
    version: file.version,
    updatedAt: file.updatedAt,
    record: parseProjectContentCanvasFile(file.content, path),
  }
}


function parseProjectContentCanvasFile(content, path) {
  try {
    return projectContentCanvasRecordFromInput(JSON.parse(content), { path })
  } catch (error) {
    if (error?.statusCode) throw error
    throw httpError(400, 'project_content_canvas_invalid', `content canvas file is invalid: ${path}`)
  }
}

function projectEditingPathSegment(value) {
  const safe = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'project'
}

function contentCanvasRunAffectedContentUnitIds(canvasRecord, snapshot) {
  const nodeRefs = new Set()
  for (const node of Array.isArray(canvasRecord.nodes) ? canvasRecord.nodes : []) {
    const nodeId = stringValue(node.node_id ?? node.nodeId ?? node.id)
    const kind = stringValue(node.kind)
    if (!nodeId) continue
    const suffix = contentCanvasNodeIdSuffix(nodeId)
    nodeRefs.add(nodeId)
    nodeRefs.add(suffix)
    if (kind) {
      nodeRefs.add(`${kind}:${suffix}`)
      nodeRefs.add(`${kind}:${nodeId}`)
    }
  }
  const affected = []
  for (const unit of snapshot.contentUnits ?? []) {
    const unitId = idValue(unit.id ?? unit.record?.id ?? pathSegmentAfter(unit.path, 'content_units'))
    if (unitId === undefined) continue
    const refs = contentUnitRunRefs(unit)
    if (refs.some((ref) => nodeRefs.has(ref) || nodeRefs.has(contentCanvasNodeIdSuffix(ref)))) {
      affected.push(String(unitId))
    }
  }
  return affected
}

function contentUnitRunRefs(unit) {
  const record = recordValue(unit.record) ?? {}
  const id = idValue(unit.id ?? record.id ?? pathSegmentAfter(unit.path, 'content_units'))
  const refs = [
    id,
    id !== undefined ? `content_unit:${id}` : undefined,
    unit.path,
    id !== undefined ? `content_units/${id}` : undefined,
    record.target_ref,
    record.targetRef,
    record.expression_unit_ref,
    record.expressionUnitRef,
    record.storyboard_ref,
    record.storyboardRef,
    record.keyframe_ref,
    record.keyframeRef,
    record.audio_cue_ref,
    record.audioCueRef,
    record.asset_ref,
    record.assetRef,
    record.scene_moment_ref,
    record.sceneMomentRef,
  ].map(idValue).filter((value) => value !== undefined).map(String)
  return [...new Set(refs.flatMap((ref) => [ref, contentCanvasNodeIdSuffix(ref)]))]
}

function contentCanvasNodeIdSuffix(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const colonParts = text.split(':').filter(Boolean)
  if (colonParts.length > 1) return colonParts[colonParts.length - 1]
  const slashParts = text.split('/').filter(Boolean)
  return slashParts[slashParts.length - 1] ?? text
}

function contentCanvasRunCandidateImpact({ affectedContentUnitIds, contentUnitSummaries, contentData }) {
  const affected = new Set(affectedContentUnitIds.map(String))
  const summaries = contentUnitSummaries.filter((summary) => {
    if (affected.size === 0) return false
    return affected.has(String(summary.content_unit_id))
  })
  const candidateCounts = Object.fromEntries(summaries.map((summary) => [
    String(summary.content_unit_id),
    numberValue(summary.candidate_count) ?? 0,
  ]))
  const selectedContentUnitIds = summaries
    .filter((summary) => summary.selected_candidate !== undefined)
    .map((summary) => String(summary.content_unit_id))
  const missingSelectionContentUnitIds = summaries
    .filter((summary) => Array.isArray(summary.blocking_refs) && summary.blocking_refs.includes('selection_missing'))
    .map((summary) => String(summary.content_unit_id))
  return {
    schema: 'movscript.content_canvas_candidate_impact.v1',
    affectedContentUnitIds: summaries.map((summary) => String(summary.content_unit_id)),
    affected_content_unit_ids: summaries.map((summary) => String(summary.content_unit_id)),
    affectedContentUnitCount: summaries.length,
    affected_content_unit_count: summaries.length,
    candidateCounts: candidateCounts,
    candidate_counts: candidateCounts,
    selectedContentUnitIds,
    selected_content_unit_ids: selectedContentUnitIds,
    missingSelectionContentUnitIds,
    missing_selection_content_unit_ids: missingSelectionContentUnitIds,
    totalCandidateCount: summaries.reduce((sum, summary) => sum + (numberValue(summary.candidate_count) ?? 0), 0),
    total_candidate_count: summaries.reduce((sum, summary) => sum + (numberValue(summary.candidate_count) ?? 0), 0),
    workspaceCandidateMapCount: Object.keys(recordValue(contentData.contentUnitCandidates) ?? {}).length,
    workspace_candidate_map_count: Object.keys(recordValue(contentData.contentUnitCandidates) ?? {}).length,
  }
}

function projectContentCanvasRecordFromInput(input, options = {}) {
  const source = recordValue(input)
  const record = source ? recordValue(source.canvas ?? source.record) ?? source : undefined
  if (!record) throw httpError(400, 'project_content_canvas_required', 'content canvas record is required')
  const id = stringValue(record.id ?? record.canvasId ?? record.canvas_id)
    ?? contentCanvasProjectIdFromPath(options.path)
    ?? createProjectContentCanvasId()
  const updatedAt = stringValue(record.updated_at ?? record.updatedAt) ?? new Date().toISOString()
  const titleInput = contentCanvasTitleInput(record)
  const title = titleInput === undefined
    ? contentCanvasTitleFromProjectPath(options.path) ?? 'Untitled Canvas'
    : normalizeProjectContentCanvasTitle(titleInput)
  return pruneUndefinedRecord({
    schema: CONTENT_CANVAS_SCHEMA,
    kind: 'content_canvas',
    canvasKind: 'content',
    canvas_kind: 'content',
    id,
    title,
    name: title,
    scope: projectContentCanvasScope(record.scope),
    nodes: projectContentCanvasNodes(record.nodes),
    groups: projectContentCanvasGroups(record.groups ?? record.group_nodes ?? record.groupNodes),
    layouts: projectContentCanvasLayouts(record.layouts ?? record.node_layouts ?? record.nodeLayouts),
    updated_at: updatedAt,
    created_at: stringValue(record.created_at ?? record.createdAt),
  })
}

function contentCanvasTitleInput(record) {
  if (Object.prototype.hasOwnProperty.call(record, 'title')) return record.title
  if (Object.prototype.hasOwnProperty.call(record, 'name')) return record.name
  return undefined
}

function normalizeProjectContentCanvasTitle(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function validateProjectContentCanvasTitle(title) {
  if (!title) return httpError(400, 'project_content_canvas_title_required', 'content canvas title is required')
  if (title.length > CONTENT_CANVAS_TITLE_MAX_LENGTH) {
    return httpError(400, 'project_content_canvas_title_too_long', `content canvas title must be at most ${CONTENT_CANVAS_TITLE_MAX_LENGTH} characters`)
  }
  if (CONTENT_CANVAS_TITLE_INVALID_PATTERN.test(title)) {
    return httpError(400, 'project_content_canvas_title_invalid', 'content canvas title contains unsupported characters')
  }
  return undefined
}

function projectContentCanvasScope(value) {
  const scope = recordValue(value)
  if (!scope || scope.kind === 'global') return { kind: 'global' }
  if (scope.kind !== 'production') return { kind: 'global' }
  const productionId = stringValue(scope.production_id ?? scope.productionId)
  if (!productionId) return { kind: 'global' }
  return pruneUndefinedRecord({
    kind: 'production',
    production_id: productionId,
    production_title: stringValue(scope.production_title ?? scope.productionTitle),
    production_node_id: stringValue(scope.production_node_id ?? scope.productionNodeId),
    production_path: stringValue(scope.production_path ?? scope.productionPath),
  })
}

function projectContentCanvasNodes(value) {
  const values = Array.isArray(value)
    ? value
    : Object.values(recordValue(value) ?? {})
  return values
    .map(projectContentCanvasNode)
    .filter(Boolean)
    .sort((left, right) => left.node_id.localeCompare(right.node_id))
}

function projectContentCanvasNode(value) {
  const node = recordValue(value)
  if (!node) return undefined
  const nodeId = stringValue(node.node_id ?? node.nodeId ?? node.id)
  if (!nodeId) return undefined
  return pruneUndefinedRecord({
    node_id: nodeId,
    kind: stringValue(node.kind),
    added_at: stringValue(node.added_at ?? node.addedAt),
  })
}

function projectContentCanvasGroups(value) {
  const values = Array.isArray(value)
    ? value
    : Object.values(recordValue(value) ?? {})
  return values
    .map(projectContentCanvasGroup)
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id))
}

function projectContentCanvasGroup(value) {
  const group = recordValue(value)
  if (!group) return undefined
  const id = stringValue(group.id ?? group.groupId ?? group.group_id)
  if (!id) return undefined
  const memberNodeIds = uniqueStringValues(group.member_node_ids ?? group.memberNodeIds ?? group.nodes ?? group.node_ids ?? group.nodeIds)
  if (memberNodeIds.length < 2) return undefined
  return pruneUndefinedRecord({
    id,
    title: stringValue(group.title ?? group.name ?? group.label),
    member_node_ids: memberNodeIds,
    created_at: stringValue(group.created_at ?? group.createdAt),
    updated_at: stringValue(group.updated_at ?? group.updatedAt),
  })
}

function projectContentCanvasLayouts(value) {
  const layouts = recordValue(value)
  if (!layouts) return {}
  return Object.fromEntries(Object.entries(layouts)
    .map(([nodeId, layout]) => [nodeId, projectContentCanvasLayout(layout)])
    .filter(([, layout]) => Boolean(layout)))
}

function projectContentCanvasLayout(value) {
  const layout = recordValue(value)
  if (!layout) return undefined
  const x = numberValue(layout.x)
  const y = numberValue(layout.y)
  const width = numberValue(layout.width)
  const height = numberValue(layout.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined
  return pruneUndefinedRecord({
    x,
    y,
    width,
    height,
    manual: layout.manual === true,
    source: stringValue(layout.source),
    updated_at: stringValue(layout.updated_at ?? layout.updatedAt),
  })
}

function uniqueStringValues(value) {
  if (!Array.isArray(value)) return []
  const output = []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const next = item.trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    output.push(next)
  }
  return output
}

function contentCanvasProjectFilePath(id) {
  return `${CONTENT_CANVAS_DIRECTORY}/${contentCanvasProjectPathSegment(id)}/${CONTENT_CANVAS_FILE_NAME}`
}

function contentCanvasProjectPathSegment(id) {
  const safe = String(id).trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'canvas'
}

function contentCanvasProjectIdFromPath(path) {
  const segment = contentCanvasProjectPathSegmentFromPath(path)
  return segment ? String(segment).trim() : undefined
}

function contentCanvasTitleFromProjectPath(path) {
  const segment = contentCanvasProjectPathSegmentFromPath(path)
  if (!segment) return undefined
  return segment
    .replace(/^canvas[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    || undefined
}

function contentCanvasProjectPathSegmentFromPath(path) {
  const parts = String(path ?? '').split(/[\\/]+/).filter(Boolean)
  const candidate = parts.at(-1) === CONTENT_CANVAS_FILE_NAME ? parts.at(-2) : parts.at(-1)
  return stringValue(candidate)
}

function createProjectContentCanvasId() {
  return `canvas:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}


