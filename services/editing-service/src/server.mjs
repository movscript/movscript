import { createServer } from 'node:http'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  deriveMovScriptWorkspacePreviewTimelines,
  deriveMovScriptWorkspaceTimelineAssemblyPreviewTimeline,
  queryMovScriptWorkspaceProductionContext,
} from '@movscript/workspace'
import {
  EDITING_SERVICE_CAPABILITIES_ENDPOINT,
  EDITING_SERVICE_NAME,
  EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT,
  EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT,
  EDITING_SERVICE_TASK_REQUEST_ENDPOINT,
  EDITING_SERVICE_TASK_ACTION_ENDPOINT,
  compileTimelineAssemblyToMediaEditingProject,
  createMediaEditingProjectFromEditDecisions,
  createMediaEditingProjectFromMovScriptEditPlan,
  createMediaEditingProjectFromProductionTimelineClips,
  createMediaEditingProjectFromTimelineAssemblyClips,
  createMediaEditingProjectService,
  validateMediaEditingProjectTimeline,
} from '@movscript/editing'
import { createNodeMovScriptWorkspaceService } from '@movscript/workspace/node'
import { createMovScriptScopedProjectDataDecisionStore } from '@movscript/workspace/repository'

export {
  EDITING_SERVICE_CAPABILITIES_ENDPOINT,
  EDITING_SERVICE_NAME,
  EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT,
  EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT,
  EDITING_SERVICE_TASK_REQUEST_ENDPOINT,
  EDITING_SERVICE_TASK_ACTION_ENDPOINT,
} from '@movscript/editing'

export const EDITING_SERVICE_CAPABILITIES = Object.freeze([
  'timeline',
  'edit-plan',
  'edit-decisions',
  'editing-project-command',
  'editing-timeline-view',
  'production-timeline-bundle',
  'timeline-assembly-bundle',
  'preview-timeline',
  'render-request',
  'media-task-action',
  'video-compose-project',
])

export function createEditingServiceHandler(options = {}) {
  const serviceName = options.serviceName ?? EDITING_SERVICE_NAME
  const capabilities = options.capabilities ?? EDITING_SERVICE_CAPABILITIES
  const homeDir = options.homeDir ?? process.env.MOVSCRIPT_HOME ?? join(tmpdir(), 'movscript-editing-service')
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
      writeCORSHeaders(response, request.headers.origin)
      if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        writeJSON(response, 200, {
          status: 'ok',
          serviceName,
          capabilities,
        })
        return
      }
      if (request.method === 'GET' && url.pathname === EDITING_SERVICE_CAPABILITIES_ENDPOINT) {
        writeJSON(response, 200, {
          serviceName,
          capabilities,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT) {
        const body = await readJSONBody(request)
        const command = stringValue(body.command)
        if (!command) {
          throw httpError(400, 'editing_project_command_required', 'command is required')
        }
        const result = await executeEditingProjectCommand(command, recordValue(body.input) ?? {}, { homeDir })
        writeJSON(response, 200, {
          schema: 'movscript.editing-project-command-result.v1',
          command,
          result,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT) {
        const body = await readJSONBody(request)
        const kind = stringValue(body.kind)
        if (!kind) {
          throw httpError(400, 'editing_timeline_view_kind_required', 'kind is required')
        }
        const projectDir = projectDirFromBody(body)
        const result = await readEditingTimelineView({ projectDir, kind, input: body })
        writeJSON(response, 200, {
          schema: 'movscript.editing-timeline-view.v1',
          projectDir,
          kind,
          result: result ?? null,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === EDITING_SERVICE_TASK_REQUEST_ENDPOINT) {
        const body = await readJSONBody(request)
        const taskType = stringValue(body.taskType ?? body.task_type)
        if (!taskType) {
          throw httpError(400, 'editing_task_type_required', 'taskType is required')
        }
        const taskRequest = buildEditingTaskRequest(taskType, recordValue(body.input) ?? {})
        writeJSON(response, 200, {
          schema: 'movscript.editing-task-request.v1',
          taskType,
          request: taskRequest,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === EDITING_SERVICE_TASK_ACTION_ENDPOINT) {
        const body = await readJSONBody(request)
        const action = stringValue(body.action)
        if (!action) {
          throw httpError(400, 'editing_task_action_required', 'action is required')
        }
        const taskAction = buildEditingTaskAction(action, recordValue(body.input) ?? {})
        writeJSON(response, 200, {
          schema: 'movscript.editing-task-action.v1',
          action,
          status: taskAction.status ?? 'ready',
          ...(taskAction.request ? { request: taskAction.request } : {}),
          ...(taskAction.result ? { result: taskAction.result } : {}),
        })
        return
      }
      writeJSON(response, 404, {
        error: 'not_found',
      })
    } catch (error) {
      writeEditingServiceError(response, error)
    }
  }
}

async function readEditingTimelineView({ projectDir, kind, input }) {
  const decisionStore = optionalDecisionStoreFromBody(input)
  const workspaceService = createNodeMovScriptWorkspaceService({
    projectDir,
    ...(decisionStore ? { decisionStore } : {}),
  })
  switch (kind) {
    case 'previewTimeline': {
      const productionId = stringOrNumberValue(input.productionId ?? input.production_id)
      if (productionId === undefined) {
        throw httpError(400, 'editing_timeline_view_production_required', 'productionId is required')
      }
      return workspaceService.readPreviewTimeline(productionId)
    }
    case 'sceneMomentEditPlan': {
      const sceneMomentId = stringOrNumberValue(input.sceneMomentId ?? input.scene_moment_id)
      if (sceneMomentId === undefined) {
        throw httpError(400, 'editing_timeline_view_scene_moment_required', 'sceneMomentId is required')
      }
      return workspaceService.readSceneMomentEditPlan(sceneMomentId)
    }
    case 'sceneMomentTimelineBundle': {
      const sceneMomentId = stringOrNumberValue(input.sceneMomentId ?? input.scene_moment_id)
      if (sceneMomentId === undefined) {
        throw httpError(400, 'editing_timeline_view_scene_moment_required', 'sceneMomentId is required')
      }
      return readSceneMomentTimelineBundle(workspaceService, sceneMomentId, input)
    }
    case 'productionTimelineBundle': {
      const productionId = stringOrNumberValue(input.productionId ?? input.production_id)
      if (productionId === undefined) {
        throw httpError(400, 'editing_timeline_view_production_required', 'productionId is required')
      }
      return readProductionTimelineBundle(workspaceService, productionId, input)
    }
    case 'timelineAssemblyBundle': {
      const target = timelineAssemblyScopeFromInput(input)
      if (target.scopeKind === 'production') {
        return readProductionTimelineBundle(workspaceService, target.scopeRef, {
          ...input,
          targetKind: 'timeline_assembly',
          targetRef: target.targetRef,
          scopeKind: target.scopeKind,
          scopeRef: target.scopeRef,
        }, { canonical: true })
      }
      return readTimelineAssemblyBundle(workspaceService, target, input)
    }
    default:
      throw httpError(400, 'editing_timeline_view_unsupported', `unsupported editing timeline view: ${kind}`)
  }
}

async function readSceneMomentTimelineBundle(workspaceService, sceneMomentId, input) {
  const editPlan = await workspaceService.readSceneMomentEditPlan(sceneMomentId)
  if (!recordValue(editPlan)) {
    throw httpError(404, 'editing_scene_moment_edit_plan_missing', `scene_moment ${String(sceneMomentId)} edit plan was not found; run domain_interpret first`)
  }
  const mediaEditingProject = createMediaEditingProjectFromMovScriptEditPlan(editPlan, {
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id),
    projectId: projectIdValue(input) ?? `movscript_${String(editPlan.productionId)}`,
    title: stringValue(input.title ?? input.projectName ?? input.project_name ?? input.sceneName ?? input.scene_name),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    fps: optionalNumber(input.fps),
    background: stringValue(input.background),
    defaultDurationMs: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms)
      ?? secToMs(optionalNumber(input.defaultDurationSec ?? input.default_duration_sec)),
  })
  const composeInputs = buildMediaProjectComposeInputs(mediaEditingProject)
  return {
    schema: 'movscript.scene-moment-timeline-bundle.v1',
    status: editPlan.status === 'ready_to_compose' ? 'ok' : 'blocked',
    target_kind: 'scene_moment',
    scene_moment_id: sceneMomentId,
    edit_plan_status: editPlan.status,
    edit_plan: editPlan,
    editPlan,
    media_editing_project: mediaEditingProject,
    mediaEditingProject,
    compose_inputs: composeInputs,
    composeInputs,
    context: editingProjectContextFromEditPlan(editPlan),
    blockers: Array.isArray(editPlan.blockers) ? editPlan.blockers : [],
  }
}

async function readProductionTimelineBundle(workspaceService, productionId, input, options = {}) {
  const target = productionTimelineTargetFromInput(productionId, input)
  const index = await workspaceService.loadIndex()
  const context = queryMovScriptWorkspaceProductionContext(index, {
    include: ['productions', 'content_units'],
    limit: 1000,
  })
  const previewTimeline = readProductionPreviewTimelineFromIndex(index, productionId)
  const blockers = []
  if (!previewTimeline) {
    blockers.push({
      code: 'preview_timeline_missing',
      message: `production ${String(productionId)} preview timeline was not found; run domain_interpret first`,
    })
  }
  const clips = previewTimeline
    ? productionTimelineClips({
        previewTimeline,
        contentUnits: context.content_units ?? [],
        documents: index.documents,
        blockers,
      })
    : []
  const production = (context.productions ?? []).find((item) =>
    sameId(item.id, productionId)
    || sameId(item.record?.id, productionId)
    || (previewTimeline?.productionPath && item.path.startsWith(previewTimeline.productionPath)),
  )
  const productionPath = production?.path ?? previewTimeline?.productionPath
  const title = stringValue(input.title ?? input.projectName ?? input.project_name) ?? stringValue(production?.record?.title)
  const mediaEditingProject = createMediaEditingProjectFromProductionTimelineClips({
    productionId,
    productionPath,
    targetKind: target.targetKind,
    targetRef: target.targetRef,
    scopeKind: target.scopeKind,
    scopeRef: target.scopeRef,
    clips,
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id),
    projectId: projectIdValue(input),
    title,
    now: stringValue(input.now),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    fps: optionalNumber(input.fps),
    background: stringValue(input.background),
    defaultDurationMs: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms)
      ?? secToMs(optionalNumber(input.defaultDurationSec ?? input.default_duration_sec))
      ?? 4000,
  })
  const editPlan = productionEditPlanFromBundle({
    productionId,
    productionPath,
    target,
    projectName: title,
    clips,
    blockers,
  })
  const contextView = editingProjectContextFromProductionClips(productionId, clips, blockers, target)
  const composeInputs = buildMediaProjectComposeInputs(mediaEditingProject)
  return {
    schema: options.canonical ? 'movscript.timeline-assembly-bundle.v1' : 'movscript.production-timeline-bundle.v1',
    preferred_schema: 'movscript.timeline-assembly-bundle.v1',
    legacy_schema_alias: 'movscript.production-timeline-bundle.v1',
    status: blockers.length === 0 ? 'ok' : 'blocked',
    target_kind: target.targetKind,
    target_ref: target.targetRef,
    scope_kind: target.scopeKind,
    scope_ref: target.scopeRef,
    legacy_alias: target.legacyTargetKind ? {
      target_kind: target.legacyTargetKind,
      target_ref: target.legacyTargetRef,
    } : undefined,
    production_id: productionId,
    productionId,
    preview_timeline: previewTimeline,
    previewTimeline,
    media_editing_project: mediaEditingProject,
    mediaEditingProject,
    edit_plan: editPlan,
    editPlan,
    context: contextView,
    compose_inputs: composeInputs,
    composeInputs,
    clips,
    blockers,
  }
}

async function readTimelineAssemblyBundle(workspaceService, target, input) {
  const index = await workspaceService.loadIndex()
  const context = queryMovScriptWorkspaceProductionContext(index, {
    include: ['content_units'],
    limit: 1000,
  })
  const previewTimeline = deriveMovScriptWorkspaceTimelineAssemblyPreviewTimeline(index, {
    scopeKind: target.scopeKind,
    scopeRef: target.scopeRef,
    targetRef: target.targetRef,
  })
  const blockers = []
  if (!previewTimeline) {
    blockers.push({
      code: 'timeline_assembly_preview_timeline_missing',
      scope_kind: target.scopeKind,
      scope_ref: target.scopeRef,
      target_ref: target.targetRef,
      message: `timeline assembly ${target.targetRef} preview timeline was not found; ensure the namespace scope exists and run domain_interpret first`,
    })
  }
  const clips = previewTimeline
    ? productionTimelineClips({
        previewTimeline,
        contentUnits: context.content_units ?? [],
        documents: index.documents,
        blockers,
      })
    : []
  const title = stringValue(input.title ?? input.projectName ?? input.project_name)
    ?? stringValue(previewTimeline?.scopeTitle)
    ?? `Timeline assembly ${target.scopeKind}:${target.scopeRef}`
  const mediaEditingProject = createMediaEditingProjectFromTimelineAssemblyClips({
    targetKind: target.targetKind,
    targetRef: target.targetRef,
    scopeKind: target.scopeKind,
    scopeRef: target.scopeRef,
    scopePath: stringValue(previewTimeline?.scopePath),
    clips,
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id),
    projectId: projectIdValue(input),
    title,
    now: stringValue(input.now),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    fps: optionalNumber(input.fps),
    background: stringValue(input.background),
    defaultDurationMs: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms)
      ?? secToMs(optionalNumber(input.defaultDurationSec ?? input.default_duration_sec))
      ?? 4000,
  })
  const editPlan = timelineAssemblyEditPlanFromBundle({
    target,
    scopePath: stringValue(previewTimeline?.scopePath),
    projectName: title,
    clips,
    blockers,
  })
  const contextView = editingProjectContextFromAssemblyClips(clips, blockers, target, {
    source: 'timeline_assembly_preview_timeline',
    scopePath: stringValue(previewTimeline?.scopePath),
  })
  const composeInputs = buildMediaProjectComposeInputs(mediaEditingProject)
  return {
    schema: 'movscript.timeline-assembly-bundle.v1',
    status: blockers.length === 0 ? 'ok' : 'blocked',
    target_kind: target.targetKind,
    target_ref: target.targetRef,
    scope_kind: target.scopeKind,
    scope_ref: target.scopeRef,
    scope_path: stringValue(previewTimeline?.scopePath),
    preview_timeline: previewTimeline,
    previewTimeline,
    media_editing_project: mediaEditingProject,
    mediaEditingProject,
    edit_plan: editPlan,
    editPlan,
    context: contextView,
    compose_inputs: composeInputs,
    composeInputs,
    clips,
    blockers,
  }
}

function readProductionPreviewTimelineFromIndex(index, productionId) {
  return deriveMovScriptWorkspacePreviewTimelines(index)
    .find((timeline) => sameTimelineProductionId(timeline.productionId, productionId))
}

function sameTimelineProductionId(left, right) {
  return sameId(left, right) || safeId(String(left)) === safeId(String(right))
}

function productionTimelineClips(input) {
  const contentUnitsById = new Map(input.contentUnits.map((unit) => [String(unit.id ?? pathSegmentAfter(unit.path, 'content_units') ?? unit.path), unit]))
  const candidatesByContentUnitId = contentCandidateRecordsByContentUnitId(input.documents)
  const selectionsByContentUnitId = selectionRecordsByContentUnitId(input.documents)
  return input.previewTimeline.items
    .filter((item) => item.itemType === 'scene_moment')
    .sort((left, right) => left.order - right.order)
    .flatMap((item, index) => {
      const contentUnitIds = productionSceneMomentContentUnitIds(input.contentUnits, item)
      if (contentUnitIds.length === 0) {
        input.blockers.push({
          code: 'scene_moment_content_unit_missing',
          scene_moment_id: item.entity.id,
          scene_moment_path: item.entity.path,
          message: `scene_moment ${String(item.entity.id ?? item.entity.path)} has no scene_moment_ref video content unit`,
        })
        return []
      }

      for (const contentUnitId of contentUnitIds) {
        const contentUnit = contentUnitsById.get(String(contentUnitId))
        const selection = selectionsByContentUnitId.get(String(contentUnitId))
        const candidateId = selection?.candidate_id
        const candidate = candidateId !== undefined
          ? candidatesByContentUnitId.get(String(contentUnitId))?.find((entry) => sameId(entry.id, candidateId))
          : undefined
        const resourceId = selectedVideoResourceId(candidate)
        if (resourceId !== undefined) {
          const durationSec = optionalNumber(firstCandidateOutput(candidate)?.duration_sec) ?? 4
          return [{
            id: `production_clip_${safeId(String(item.entity.id ?? index))}_${safeId(String(contentUnitId))}`,
            sceneMomentId: item.entity.id,
            sceneMomentPath: item.entity.path,
            sceneMomentTitle: previewTimelineItemTitle(item),
            contentUnitId,
            candidateId,
            resourceId,
            title: previewTimelineItemTitle(item) ?? String(item.entity.id ?? item.entity.path ?? `Scene ${index + 1}`),
            order: item.order,
            durationSec,
          }]
        }
        input.blockers.push({
          code: candidateId === undefined ? 'scene_moment_selection_missing' : 'scene_moment_resource_missing',
          scene_moment_id: item.entity.id,
          scene_moment_path: item.entity.path,
          content_unit_id: contentUnitId,
          candidate_id: candidateId,
          output_kind: stringValue(contentUnit?.record?.output_kind),
          message: candidateId === undefined
            ? `scene_moment ${String(item.entity.id ?? item.entity.path)} content unit ${String(contentUnitId)} has no selected candidate`
            : `scene_moment ${String(item.entity.id ?? item.entity.path)} selected candidate ${String(candidateId)} has no video resource_id`,
        })
      }
      return []
    })
}

function productionSceneMomentContentUnitIds(contentUnits, item) {
  const fromTimeline = previewTimelineItemContentUnitIds(item)
  const scanned = contentUnits
    .filter((unit) => recordValue(unit.record) && isSceneMomentVideoContentUnit(unit.record) && sceneMomentRefMatches(unit.record, item))
    .map((unit) => unit.id ?? pathSegmentAfter(unit.path, 'content_units'))
    .filter((id) => typeof id === 'string' || typeof id === 'number')
  return Array.from(new Map([...fromTimeline, ...scanned].map((id) => [String(id), id])).values())
}

function previewTimelineItemTitle(item) {
  return stringValue(item.title)
}

function previewTimelineItemContentUnitIds(item) {
  return Array.isArray(item.contentUnitIds)
    ? item.contentUnitIds.filter((id) => typeof id === 'string' || typeof id === 'number')
    : []
}

function isSceneMomentVideoContentUnit(record) {
  const type = stringValue(record.content_unit_type ?? record.contentUnitType)
  if (type !== 'scene_moment_ref' && type !== 'scence_moment_ref') return false
  const outputKind = stringValue(record.output_kind ?? record.outputKind)
  return outputKind === undefined || outputKind === 'video'
}

function sceneMomentRefMatches(record, item) {
  const refs = [record.scene_moment_ref, record.sceneMomentRef, record.scence_moment_ref, record.scenceMomentRef].flatMap((value) => {
    if (typeof value === 'number') return [String(value)]
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    return []
  })
  return refs.some((ref) =>
    sameId(ref, item.entity.id)
    || ref === item.entity.path
    || lastPathSegment(ref) === lastPathSegment(item.entity.path)
    || (item.entity.path !== undefined && ref.endsWith(item.entity.path)),
  )
}

function contentCandidateRecordsByContentUnitId(documents) {
  const output = new Map()
  for (const document of documents) {
    if (!document.path.endsWith('/content_candidate.json') || !recordValue(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringValue(document.data.content_unit_ref ?? document.data.contentUnitRef))
    if (!contentUnitId) continue
    output.set(contentUnitId, [...(output.get(contentUnitId) ?? []), document.data])
  }
  return output
}

function selectionRecordsByContentUnitId(documents) {
  const output = new Map()
  for (const document of documents) {
    if (!recordValue(document.data)) continue
    const selection = recordValue(document.data.selection)
    if (!selection) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringValue(document.data.target_ref ?? document.data.targetRef))
    if (!contentUnitId) continue
    output.set(contentUnitId, selection)
  }
  return output
}

function contentUnitIdForRuntimeDocument(path, ref) {
  if (ref) return lastPathSegment(ref) ?? ref
  return pathSegmentAfter(path, 'content_units')
}

function selectedVideoResourceId(candidate) {
  const output = firstCandidateOutput(candidate)
  const kind = stringValue(output?.kind)
  if (kind !== undefined && kind !== 'video') return undefined
  return optionalNumber(output?.resource_id ?? output?.resourceId)
}

function firstCandidateOutput(candidate) {
  const outputs = Array.isArray(candidate?.outputs) ? candidate.outputs : []
  return outputs.find(recordValue)
}

function timelineAssemblyScopeFromInput(input) {
  const parsedTarget = parseTimelineAssemblyRef(stringValue(input.targetRef ?? input.target_ref ?? input.timelineAssemblyRef ?? input.timeline_assembly_ref))
  const legacyProductionId = stringOrNumberValue(input.productionId ?? input.production_id)
  const scopeKind = stringValue(input.scopeKind ?? input.scope_kind) ?? parsedTarget?.scopeKind ?? (legacyProductionId !== undefined ? 'production' : undefined)
  const scopeRef = stringOrNumberValue(input.scopeRef ?? input.scope_ref) ?? parsedTarget?.scopeRef ?? stringOrNumberValue(input.productionId ?? input.production_id)
  if (!scopeKind || scopeRef === undefined) {
    throw httpError(400, 'editing_timeline_assembly_scope_required', 'timelineAssemblyBundle requires scopeRef, targetRef, or legacy productionId')
  }
  return {
    scopeKind,
    scopeRef: String(scopeRef),
    targetKind: 'timeline_assembly',
    targetRef: stringValue(input.targetRef ?? input.target_ref ?? input.timelineAssemblyRef ?? input.timeline_assembly_ref)
      ?? `timeline_assembly:${scopeKind}:${String(scopeRef)}`,
  }
}

function productionTimelineTargetFromInput(productionId, input) {
  const explicitTargetRef = stringValue(input.targetRef ?? input.target_ref ?? input.timelineAssemblyRef ?? input.timeline_assembly_ref)
  const parsedTarget = parseTimelineAssemblyRef(explicitTargetRef)
  const targetKind = stringValue(input.targetKind ?? input.target_kind) ?? 'timeline_assembly'
  const scopeKind = stringValue(input.scopeKind ?? input.scope_kind) ?? parsedTarget?.scopeKind ?? (targetKind === 'timeline_assembly' ? 'production' : undefined)
  const scopeRef = stringOrNumberValue(input.scopeRef ?? input.scope_ref) ?? parsedTarget?.scopeRef ?? (scopeKind === 'production' ? productionId : undefined)
  const targetRef = explicitTargetRef
    ?? (targetKind === 'timeline_assembly' ? `timeline_assembly:${scopeKind ?? 'production'}:${String(scopeRef ?? productionId)}` : String(productionId))
  return {
    targetKind,
    targetRef,
    ...(scopeKind ? { scopeKind } : {}),
    ...(scopeRef !== undefined ? { scopeRef: String(scopeRef) } : {}),
    ...(targetKind === 'timeline_assembly' ? {
      legacyTargetKind: 'production',
      legacyTargetRef: String(productionId),
    } : {}),
  }
}

function parseTimelineAssemblyRef(value) {
  if (!value?.startsWith('timeline_assembly:')) return undefined
  const [, scopeKind, ...scopeRefParts] = value.split(':')
  const scopeRef = scopeRefParts.join(':')
  if (!scopeKind?.trim() || !scopeRef.trim()) return undefined
  return { scopeKind: scopeKind.trim(), scopeRef: scopeRef.trim() }
}

function productionEditPlanFromBundle(input) {
  const target = input.target ?? productionTimelineTargetFromInput(input.productionId, {})
  let cursorSec = 0
  const items = input.clips
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((clip, index) => {
      const durationSec = Math.max(0.1, clip.durationSec || 4)
      const item = {
        id: clip.id,
        content_unit_id: clip.contentUnitId,
        content_unit_ref: `content_units/${String(clip.contentUnitId)}`,
        output_kind: 'video',
        target_kind: 'scene_moment',
        target_ref: clip.sceneMomentPath ?? String(clip.sceneMomentId ?? clip.contentUnitId),
        expression_unit_ref: clip.sceneMomentPath,
        expression_modality: 'visual',
        expression_role: 'scene_moment_output',
        candidate_id: clip.candidateId,
        resource_id: clip.resourceId,
        selected: true,
        stale: false,
        generation_role: 'composed_scene_moment',
        timing_intent: {
          timeline_start_sec: cursorSec,
          duration_sec: durationSec,
          source_duration_sec: durationSec,
        },
        order: index + 1,
      }
      cursorSec += durationSec
      return item
    })
  return {
    schema: 'movscript.edit_plan.v1',
    target_kind: target.targetKind,
    productionId: input.productionId,
    productionPath: input.productionPath ?? `productions/${String(input.productionId)}`,
    sceneMomentId: `production_${String(input.productionId)}`,
    sceneMomentPath: input.productionPath ?? `productions/${String(input.productionId)}`,
    target_ref: target.targetRef,
    scope_kind: target.scopeKind,
    scope_ref: target.scopeRef,
    legacy_target_kind: target.legacyTargetKind,
    legacy_target_ref: target.legacyTargetRef,
    status: input.blockers.length === 0 ? 'ready_to_compose' : 'missing_selection',
    tracks: [{ type: 'video', items }],
    compose_inputs: items.map((item) => ({
      content_unit_id: item.content_unit_id,
      resource_id: item.resource_id ?? 0,
      output_kind: 'video',
      track_type: 'video',
    })).filter((item) => item.resource_id > 0),
    ...(input.blockers.length
      ? {
          blockers: input.blockers.map((blocker) => ({
            code: blocker.code === 'selection_stale' || blocker.code === 'resource_missing' ? blocker.code : 'selection_missing',
            content_unit_id: blockerContentUnitId(blocker),
            message: stringValue(blocker.message) ?? 'Production edit plan is blocked by missing scene_moment output selection.',
          })),
        }
      : {}),
  }
}

function timelineAssemblyEditPlanFromBundle(input) {
  const target = input.target
  let cursorSec = 0
  const items = input.clips
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((clip, index) => {
      const durationSec = Math.max(0.1, clip.durationSec || 4)
      const item = {
        id: clip.id,
        content_unit_id: clip.contentUnitId,
        content_unit_ref: `content_units/${String(clip.contentUnitId)}`,
        output_kind: 'video',
        target_kind: 'scene_moment',
        target_ref: clip.sceneMomentPath ?? String(clip.sceneMomentId ?? clip.contentUnitId),
        expression_unit_ref: clip.sceneMomentPath,
        expression_modality: 'visual',
        expression_role: 'scene_moment_output',
        candidate_id: clip.candidateId,
        resource_id: clip.resourceId,
        selected: true,
        stale: false,
        generation_role: 'composed_scene_moment',
        timing_intent: {
          timeline_start_sec: cursorSec,
          duration_sec: durationSec,
          source_duration_sec: durationSec,
        },
        order: index + 1,
      }
      cursorSec += durationSec
      return item
    })
  return {
    schema: 'movscript.edit_plan.v1',
    target_kind: target.targetKind,
    target_ref: target.targetRef,
    scope_kind: target.scopeKind,
    scope_ref: target.scopeRef,
    scope_path: input.scopePath,
    assemblyId: target.targetRef,
    assemblyTitle: input.projectName,
    status: input.blockers.length === 0 ? 'ready_to_compose' : 'missing_selection',
    tracks: [{ type: 'video', items }],
    compose_inputs: items.map((item) => ({
      content_unit_id: item.content_unit_id,
      resource_id: item.resource_id ?? 0,
      output_kind: 'video',
      track_type: 'video',
    })).filter((item) => item.resource_id > 0),
    ...(input.blockers.length
      ? {
          blockers: input.blockers.map((blocker) => ({
            code: blocker.code === 'selection_stale' || blocker.code === 'resource_missing' ? blocker.code : 'selection_missing',
            content_unit_id: blockerContentUnitId(blocker),
            message: stringValue(blocker.message) ?? 'Timeline assembly edit plan is blocked by missing scene_moment output selection.',
          })),
        }
      : {}),
  }
}

function blockerContentUnitId(blocker) {
  const value = blocker.content_unit_id ?? blocker.contentUnitId
  if (typeof value === 'string' || typeof value === 'number') return value
  return 'unknown'
}

function editingProjectContextFromEditPlan(editPlan) {
  const tracks = Array.isArray(editPlan.tracks) ? editPlan.tracks : []
  const items = tracks.flatMap((track) => (Array.isArray(track.items) ? track.items : []).map((item) => ({ track, item })))
  return {
    production_id: editPlan.productionId,
    production_path: editPlan.productionPath,
    scene_moment_id: editPlan.sceneMomentId,
    scene_moment_path: editPlan.sceneMomentPath,
    target_ref: editPlan.target_ref,
    selected_content_units: uniqueBy(items.map(({ item }) => ({
      content_unit_id: item.content_unit_id,
      content_unit_ref: item.content_unit_ref,
      output_kind: item.output_kind,
      target_kind: item.target_kind,
      target_ref: item.target_ref,
    })), (item) => String(item.content_unit_id)),
    selected_candidates: items.flatMap(({ item }) => item.candidate_id === undefined ? [] : [{
      content_unit_id: item.content_unit_id,
      candidate_id: item.candidate_id,
      resource_id: item.resource_id,
      selected: item.selected,
      stale: item.stale,
    }]),
    resources: items.flatMap(({ track, item }) => item.resource_id === undefined ? [] : [{
      resource_id: item.resource_id,
      content_unit_id: item.content_unit_id,
      candidate_id: item.candidate_id,
      output_kind: item.output_kind,
      track_type: track.type,
    }]),
    provenance: {
      source: 'movscript_edit_plan',
      selected_candidate_ids: items.flatMap(({ item }) => item.candidate_id === undefined ? [] : [String(item.candidate_id)]),
      input_resource_ids: items.flatMap(({ item }) => item.resource_id === undefined ? [] : [item.resource_id]),
    },
  }
}

function editingProjectContextFromProductionClips(productionId, clips, blockers, target = productionTimelineTargetFromInput(productionId, {})) {
  return {
    target_kind: target.targetKind,
    target_ref: target.targetRef,
    scope_kind: target.scopeKind,
    scope_ref: target.scopeRef,
    legacy_alias: target.legacyTargetKind ? {
      target_kind: target.legacyTargetKind,
      target_ref: target.legacyTargetRef,
    } : undefined,
    production_id: productionId,
    selected_content_units: uniqueBy(clips.map((clip) => ({
      content_unit_id: clip.contentUnitId,
      scene_moment_id: clip.sceneMomentId,
      scene_moment_path: clip.sceneMomentPath,
      output_kind: 'video',
      target_kind: target.targetKind,
      target_ref: target.targetRef,
      scope_kind: target.scopeKind,
      scope_ref: target.scopeRef,
    })), (item) => String(item.content_unit_id)),
    selected_candidates: clips.flatMap((clip) => clip.candidateId === undefined ? [] : [{
      content_unit_id: clip.contentUnitId,
      candidate_id: clip.candidateId,
      resource_id: clip.resourceId,
      selected: true,
      stale: false,
    }]),
    resources: clips.map((clip) => ({
      resource_id: clip.resourceId,
      content_unit_id: clip.contentUnitId,
      candidate_id: clip.candidateId,
      output_kind: 'video',
      track_type: 'video',
    })),
    blockers,
    provenance: {
      source: 'production_preview_timeline',
      target_kind: target.targetKind,
      target_ref: target.targetRef,
      scope_kind: target.scopeKind,
      scope_ref: target.scopeRef,
      legacy_target_kind: target.legacyTargetKind,
      legacy_target_ref: target.legacyTargetRef,
      selected_candidate_ids: clips.flatMap((clip) => clip.candidateId === undefined ? [] : [String(clip.candidateId)]),
      input_resource_ids: clips.map((clip) => clip.resourceId),
    },
  }
}

function editingProjectContextFromAssemblyClips(clips, blockers, target, options = {}) {
  return {
    target_kind: target.targetKind,
    target_ref: target.targetRef,
    scope_kind: target.scopeKind,
    scope_ref: target.scopeRef,
    scope_path: options.scopePath,
    selected_content_units: uniqueBy(clips.map((clip) => ({
      content_unit_id: clip.contentUnitId,
      scene_moment_id: clip.sceneMomentId,
      scene_moment_path: clip.sceneMomentPath,
      output_kind: 'video',
      target_kind: target.targetKind,
      target_ref: target.targetRef,
      scope_kind: target.scopeKind,
      scope_ref: target.scopeRef,
    })), (item) => String(item.content_unit_id)),
    selected_candidates: clips.flatMap((clip) => clip.candidateId === undefined ? [] : [{
      content_unit_id: clip.contentUnitId,
      candidate_id: clip.candidateId,
      resource_id: clip.resourceId,
      selected: true,
      stale: false,
    }]),
    resources: clips.map((clip) => ({
      resource_id: clip.resourceId,
      content_unit_id: clip.contentUnitId,
      candidate_id: clip.candidateId,
      output_kind: 'video',
      track_type: 'video',
    })),
    blockers,
    provenance: {
      source: options.source ?? 'timeline_assembly_preview_timeline',
      target_kind: target.targetKind,
      target_ref: target.targetRef,
      scope_kind: target.scopeKind,
      scope_ref: target.scopeRef,
      scope_path: options.scopePath,
      selected_candidate_ids: clips.flatMap((clip) => clip.candidateId === undefined ? [] : [String(clip.candidateId)]),
      input_resource_ids: clips.map((clip) => clip.resourceId),
    },
  }
}

function buildMediaProjectComposeInputs(project) {
  return mediaProjectVideoItems(project).map((input) => ({
    resource_id: input.resource_id,
    ...(optionalNumber(input.start_sec) !== undefined ? { start_sec: input.start_sec } : {}),
    ...(optionalNumber(input.end_sec) !== undefined ? { end_sec: input.end_sec } : {}),
    ...(optionalNumber(input.duration_sec) !== undefined ? { duration_sec: input.duration_sec } : {}),
    trim_start_sec: input.trim_start_sec,
    trim_end_sec: input.trim_end_sec,
    timeline_start_sec: input.timeline_start_sec,
    timeline_duration_sec: input.timeline_duration_sec,
    clip_id: input.clip_id,
    track_id: input.track_id,
    content_unit_id: input.content_unit_id,
  }))
}

function mediaProjectVideoItems(project) {
  return project.timeline.tracks
    .filter((track) => (track.type === 'video' || track.type === 'image') && track.locked !== true)
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .filter(({ clip }) => clip.assetType === 'video' || clip.assetType === 'image')
    .map(({ track, clip }) => mediaProjectVideoItem(track, clip))
    .filter((item) => item !== undefined)
    .sort((left, right) => (optionalNumber(left.timeline_start_sec) ?? 0) - (optionalNumber(right.timeline_start_sec) ?? 0) || String(left.clip_id).localeCompare(String(right.clip_id)))
}

function mediaProjectVideoItem(track, clip) {
  const asset = clip.asset
  const resourceId = optionalNumber(asset?.resourceId)
  if (resourceId === undefined) return undefined
  const startMs = msValue(clip.sourceStartMs) ?? 0
  const durationMs = msValue(clip.durationMs) ?? Math.max(1, (msValue(clip.sourceEndMs) ?? startMs + 4000) - startMs)
  const endMs = msValue(clip.sourceEndMs) ?? startMs + durationMs
  const movscript = recordValue(clip.metadata?.movscript)
  return {
    resource_id: resourceId,
    start_sec: startMs / 1000,
    end_sec: endMs / 1000,
    duration_sec: durationMs / 1000,
    trim_start_sec: startMs / 1000,
    trim_end_sec: Math.max(0, endMs - startMs - durationMs) / 1000,
    timeline_start_sec: (msValue(clip.timelineStartMs) ?? 0) / 1000,
    timeline_duration_sec: durationMs / 1000,
    clip_id: clip.id,
    track_id: track.id,
    ...(movscript?.contentUnitId !== undefined ? { content_unit_id: movscript.contentUnitId } : {}),
  }
}

function uniqueBy(items, keyOf) {
  const seen = new Set()
  const output = []
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}

export function startEditingService(options = {}) {
  const host = options.host ?? '127.0.0.1'
  const port = Number(options.port ?? 0)
  const server = createServer(createEditingServiceHandler(options))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        server,
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve())
        }),
      })
    })
  })
}

export async function runEditingServiceCLI(argv = [], env = process.env) {
  const command = argv[0] ?? 'serve'
  if (command !== 'serve') {
    throw new Error(`unsupported editing-service command: ${command}`)
  }
  const host = env.MOVSCRIPT_EDITING_SERVICE_HOST || '127.0.0.1'
  const port = Number(env.MOVSCRIPT_EDITING_SERVICE_PORT || env.PORT || 0)
  const runtime = await startEditingService({ host, port })
  process.stdout.write(JSON.stringify({
    serviceName: EDITING_SERVICE_NAME,
    url: runtime.url,
  }) + '\n')
  await waitForShutdown(runtime)
}

function writeJSON(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function writeCORSHeaders(response, origin) {
  response.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' && origin ? origin : '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Credentials', 'false')
  response.setHeader('Vary', 'Origin')
}

async function executeEditingProjectCommand(command, input, context = {}) {
  switch (command) {
    case 'createProject':
      return createProject(input)
    case 'createProjectFromEditPlan':
      return createProjectFromEditPlan(input)
    case 'createProjectFromEditDecisions':
      return createProjectFromEditDecisions(input)
    case 'createProjectFromPreviewTimeline':
      return createProjectFromPreviewTimeline(input)
    case 'saveProject':
      return saveEditingProject(input, context)
    case 'getProject':
      return getEditingProject(input, context)
    case 'listProjects':
      return listEditingProjects(input, context)
    case 'deleteProject':
      return deleteEditingProject(input, context)
    case 'updateProjectSettings':
      return updateProjectSettings(input)
    case 'addAsset':
      return addAsset(input)
    case 'removeAsset':
      return removeAsset(input)
    case 'applyTimelineCommands':
      return applyTimelineCommands(input)
    case 'validateTimeline':
      return validateTimeline(input)
    case 'addTrack': {
      const track = mediaTrackArg(input)
      return applySingleTimelineCommand(input, {
        type: 'add_track',
        track,
      }, (editingProject) => ({
        status: 'ok',
        track_id: track.id,
        track,
        editing_project: editingProject,
      }))
    }
    case 'removeTrack':
      return applySingleTimelineCommand(input, {
        type: 'remove_track',
        trackId: trackIdValue(input),
      }, (editingProject) => ({
        status: 'ok',
        track_id: trackIdValue(input),
        editing_project: editingProject,
      }))
    case 'addClip':
      return addClip(input)
    case 'updateClip':
      return applySingleTimelineCommand(input, {
        type: 'update_clip',
        clipId: clipIdValue(input),
        patch: mediaClipPatchArg(input),
      }, (editingProject) => ({
        status: 'ok',
        clip_id: clipIdValue(input),
        clip: findClip(editingProject, clipIdValue(input))?.clip,
        editing_project: editingProject,
      }))
    case 'splitClip':
      return applySingleTimelineCommand(input, {
        type: 'split_clip',
        clipId: clipIdValue(input),
        splitTimeMs: requiredNumeric(input, 'splitTimeMs', 'split_time_ms'),
        ...(retainSideValue(input.retainSide ?? input.retain_side) ? { retainSide: retainSideValue(input.retainSide ?? input.retain_side) } : {}),
      }, (editingProject) => ({
        status: 'ok',
        clip_id: clipIdValue(input),
        clips: relatedSplitClips(editingProject, clipIdValue(input)),
        editing_project: editingProject,
      }))
    case 'moveClip':
      return applySingleTimelineCommand(input, {
        type: 'move_clip',
        clipId: clipIdValue(input),
        timelineStartMs: requiredNumeric(input, 'timelineStartMs', 'timeline_start_ms'),
        ...(stringValue(input.targetTrackId ?? input.target_track_id) ? { targetTrackId: stringValue(input.targetTrackId ?? input.target_track_id) } : {}),
      }, (editingProject) => ({
        status: 'ok',
        clip_id: clipIdValue(input),
        clip: findClip(editingProject, clipIdValue(input))?.clip,
        editing_project: editingProject,
      }))
    case 'deleteClip':
      return applySingleTimelineCommand(input, {
        type: 'delete_clip',
        clipId: clipIdValue(input),
      }, (editingProject) => ({
        status: 'ok',
        clip_id: clipIdValue(input),
        editing_project: editingProject,
      }))
    default:
      throw httpError(400, 'editing_project_command_unsupported', `unsupported editing project command: ${command}`)
  }
}

async function saveEditingProject(input, context) {
  const project = editingProjectArg(input)
  const expectedRevision = optionalNumber(input.expectedRevision ?? input.expected_revision)
  const projectPath = editingProjectPath(context.homeDir, project.id)
  if (expectedRevision !== undefined) {
    const current = await readEditingProject(projectPath)
    const currentRevision = optionalNumber(current?.revision)
    if (current && currentRevision !== expectedRevision) {
      return {
        status: 'conflict',
        code: 'EDITING_PROJECT_REVISION_CONFLICT',
        message: `Editing project revision conflict: expected ${expectedRevision}, found ${currentRevision ?? 'unknown'}`,
        projectId: String(project.projectId ?? 'standalone'),
        project_id: String(project.projectId ?? 'standalone'),
        editingProjectId: String(project.id),
        editing_project_id: String(project.id),
        expectedRevision,
        expected_revision: expectedRevision,
        ...(currentRevision !== undefined ? { currentRevision, current_revision: currentRevision } : {}),
        editingProject: current,
        editing_project: current,
        projectPath,
        project_path: projectPath,
      }
    }
  }
  await mkdir(dirname(projectPath), { recursive: true })
  await writeFile(projectPath, `${JSON.stringify({
    schema: 'movscript.editing_service_project.v1',
    editingProject: project,
  }, null, 2)}\n`, 'utf8')
  return {
    status: 'ok',
    editingProject: project,
    editing_project: project,
    projectPath,
    project_path: projectPath,
  }
}

async function getEditingProject(input, context) {
  const editingProjectId = editingProjectIdValue(input)
  const projectPath = editingProjectPath(context.homeDir, editingProjectId)
  const project = await readEditingProject(projectPath)
  if (!project) {
    const projectId = projectIdValue(input) ?? 'standalone'
    return {
      status: 'not_found',
      projectId,
      project_id: projectId,
      editingProjectId,
      editing_project_id: editingProjectId,
      projectPath,
      project_path: projectPath,
    }
  }
  return {
    status: 'ok',
    editingProject: project,
    editing_project: project,
    projectPath,
    project_path: projectPath,
  }
}

async function listEditingProjects(_input, context) {
  const root = editingProjectStoreRoot(context.homeDir)
  let entries = []
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return {
      status: 'ok',
      projects: [],
      editingProjects: [],
      editing_projects: [],
    }
  }
  const projects = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const projectPath = join(root, entry.name)
    const project = await readEditingProject(projectPath)
    if (!project) continue
    projects.push({
      status: 'ok',
      editingProject: project,
      editing_project: project,
      projectPath,
      project_path: projectPath,
    })
  }
  projects.sort((left, right) => {
    const leftTime = Date.parse(stringValue(left.editingProject.updatedAt) ?? '')
    const rightTime = Date.parse(stringValue(right.editingProject.updatedAt) ?? '')
    const leftSort = Number.isFinite(leftTime) ? leftTime : 0
    const rightSort = Number.isFinite(rightTime) ? rightTime : 0
    return rightSort - leftSort || String(left.editingProject.id).localeCompare(String(right.editingProject.id))
  })
  const editingProjects = projects.map((project) => project.editingProject)
  return {
    status: 'ok',
    projects,
    editingProjects,
    editing_projects: editingProjects,
  }
}

async function deleteEditingProject(input, context) {
  const editingProjectId = editingProjectIdValue(input)
  const projectId = projectIdValue(input) ?? 'standalone'
  const projectPath = editingProjectPath(context.homeDir, editingProjectId)
  try {
    await unlink(projectPath)
    return {
      status: 'ok',
      projectId,
      project_id: projectId,
      editingProjectId,
      editing_project_id: editingProjectId,
      projectPath,
      project_path: projectPath,
    }
  } catch {
    return {
      status: 'not_found',
      projectId,
      project_id: projectId,
      editingProjectId,
      editing_project_id: editingProjectId,
      projectPath,
      project_path: projectPath,
    }
  }
}

async function readEditingProject(projectPath) {
  try {
    const raw = JSON.parse(await readFile(projectPath, 'utf8'))
    const project = recordValue(raw.editingProject ?? raw.editing_project ?? raw.project)
    if (!project) return undefined
    assertMediaEditingProjectEnvelope(project)
    return project
  } catch {
    return undefined
  }
}

function editingProjectPath(homeDir, editingProjectId) {
  return join(editingProjectStoreRoot(homeDir), `${stableEditingProjectPathPart(editingProjectId)}.json`)
}

function editingProjectStoreRoot(homeDir) {
  return join(homeDir, 'editing-service', 'projects')
}

function stableEditingProjectPathPart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'editing_project'
}

function createProject(input) {
  const now = new Date().toISOString()
  const projectId = projectIdValue(input) ?? 'standalone'
  const width = optionalNumber(input.width) ?? 1080
  const height = optionalNumber(input.height) ?? 1920
  const fps = optionalNumber(input.fps) ?? 30
  const background = stringValue(input.background) ?? '#000000'
  const editingProject = {
    version: 1,
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id) ?? `editing_project_${Date.now()}`,
    projectId,
    title: stringValue(input.title) ?? 'Untitled edit',
    source: { kind: 'manual' },
    timeline: {
      version: 1,
      id: stringValue(input.timelineId ?? input.timeline_id) ?? `timeline_${Date.now()}`,
      fps,
      width,
      height,
      background,
      durationMs: 0,
      tracks: [],
    },
    assets: { assets: [] },
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }
  return {
    status: 'ok',
    editing_project: editingProject,
  }
}

function createProjectFromEditPlan(input) {
  const editPlan = recordValue(input.editPlan) ?? recordValue(input.edit_plan)
  if (!editPlan) throw new Error('editPlan is required')
  const editingProject = createMediaEditingProjectFromMovScriptEditPlan(editPlan, {
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id),
    projectId: projectIdValue(input) ?? 'standalone',
    title: stringValue(input.title),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    fps: optionalNumber(input.fps),
    background: stringValue(input.background),
    defaultDurationMs: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms),
  })
  return {
    status: 'ok',
    editing_project: editingProject,
  }
}

function createProjectFromEditDecisions(input) {
  const editDecisions = recordValue(input.editDecisions) ?? recordValue(input.edit_decisions)
  if (!editDecisions) throw new Error('editDecisions is required')
  const assetManifest = recordValue(input.assetManifest) ?? recordValue(input.asset_manifest)
  const timelineAssembly = recordValue(input.timelineAssembly) ?? recordValue(input.timeline_assembly)
  const suppliedCompileManifest = recordValue(input.compileManifest) ?? recordValue(input.compile_manifest)
  const projectOptions = {
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id),
    projectId: projectIdValue(input) ?? 'standalone',
    title: stringValue(input.title),
    now: stringValue(input.now),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    fps: optionalNumber(input.fps),
    background: stringValue(input.background),
    defaultDurationMs: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms),
    productionId: stringOrNumberValue(input.productionId ?? input.production_id),
    productionPath: stringValue(input.productionPath ?? input.production_path),
    targetKind: stringValue(input.targetKind ?? input.target_kind),
    targetRef: stringValue(input.targetRef ?? input.target_ref),
    scopeKind: stringValue(input.scopeKind ?? input.scope_kind),
    scopeRef: stringOrNumberValue(input.scopeRef ?? input.scope_ref),
    sourceHash: stringValue(input.sourceHash ?? input.source_hash),
  }
  if (timelineAssembly || suppliedCompileManifest) {
    const compileResult = compileTimelineAssemblyToMediaEditingProject({
      timelineAssembly,
      assetManifest,
      editDecisions,
      renderRuntime: stringValue(input.renderRuntime ?? input.render_runtime ?? editDecisions.render_runtime ?? editDecisions.renderRuntime),
      runtimeLocked: booleanValue(input.runtimeLocked ?? input.runtime_locked) ?? true,
      now: stringValue(input.now),
      renderSettings: {
        width: optionalNumber(input.width),
        height: optionalNumber(input.height),
        fps: optionalNumber(input.fps),
        background: stringValue(input.background),
        default_duration_ms: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms),
      },
      projectOptions,
    })
    if (compileResult.status === 'blocked' || !compileResult.media_editing_project) {
      return {
        status: 'blocked',
        code: 'TIMELINE_ASSEMBLY_COMPILE_BLOCKED',
        message: 'TimelineAssembly compile did not create a MediaEditingProject because the compile manifest has blockers.',
        compile_manifest: compileResult.compile_manifest,
        compileManifest: compileResult.compile_manifest,
        compile_result: compileResult,
        compileResult,
        diagnostics: compileResult.diagnostics,
      }
    }
    return {
      status: 'ok',
      editing_project: compileResult.media_editing_project,
      compile_manifest: compileResult.compile_manifest,
      compileManifest: compileResult.compile_manifest,
      compile_result: compileResult,
      compileResult,
    }
  }
  const editingProject = createMediaEditingProjectFromEditDecisions(editDecisions, {
    ...projectOptions,
    assetManifest,
  })
  return {
    status: 'ok',
    editing_project: editingProject,
  }
}

function createProjectFromPreviewTimeline(input) {
  const productionId = stringOrNumberValue(input.productionId ?? input.production_id)
  if (productionId === undefined) throw new Error('productionId is required')
  const clips = productionTimelineClipsArg(input)
  const editingProject = createMediaEditingProjectFromProductionTimelineClips({
    productionId,
    productionPath: stringValue(input.productionPath ?? input.production_path),
    clips,
    id: stringValue(input.id ?? input.editingProjectId ?? input.editing_project_id),
    projectId: projectIdValue(input),
    title: stringValue(input.title ?? input.projectName ?? input.project_name),
    now: stringValue(input.now),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    fps: optionalNumber(input.fps),
    background: stringValue(input.background),
    defaultDurationMs: optionalNumber(input.defaultDurationMs ?? input.default_duration_ms),
  })
  return {
    status: 'ok',
    editing_project: editingProject,
  }
}

function updateProjectSettings(input) {
  const next = cloneProject(editingProjectArg(input))
  const title = stringValue(input.title)
  const width = optionalNumber(input.width)
  const height = optionalNumber(input.height)
  const fps = optionalNumber(input.fps)
  const background = stringValue(input.background)
  const workspace = recordValue(input.workspace)
  if (title) next.title = title
  if (width !== undefined) next.timeline.width = width
  if (height !== undefined) next.timeline.height = height
  if (fps !== undefined) next.timeline.fps = fps
  if (background) next.timeline.background = background
  if (workspace) next.workspace = workspace
  touchProject(next)
  return {
    status: 'ok',
    editing_project: next,
  }
}

function addAsset(input) {
  const project = editingProjectArg(input)
  const asset = mediaAssetArg(input)
  const next = cloneProject(project)
  if (next.assets.assets.some((candidate) => candidate.id === asset.id)) {
    throw new Error(`Media asset already exists: ${asset.id}`)
  }
  next.assets.assets.push(asset)
  next.assets.assets.sort((left, right) => left.id.localeCompare(right.id))
  touchProject(next)
  return {
    status: 'ok',
    asset,
    media_asset: asset,
    editing_project: next,
  }
}

function removeAsset(input) {
  const project = editingProjectArg(input)
  const assetId = assetIdValue(input)
  const referenced = project.timeline.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .find(({ clip }) => clip.asset?.id === assetId)
  if (referenced) {
    throw new Error(`Cannot remove media asset ${assetId}; it is still referenced by clip ${referenced.clip.id} on track ${referenced.track.id}`)
  }
  const next = cloneProject(project)
  const before = next.assets.assets.length
  next.assets.assets = next.assets.assets.filter((asset) => asset.id !== assetId)
  if (next.assets.assets.length === before) {
    return {
      status: 'not_found',
      asset_id: assetId,
      editing_project: next,
    }
  }
  touchProject(next)
  return {
    status: 'ok',
    asset_id: assetId,
    editing_project: next,
  }
}

function applyTimelineCommands(input) {
  const project = editingProjectArg(input)
  const commands = commandList(input)
  const service = createMediaEditingProjectService(project)
  for (const command of commands) service.applyCommand(command)
  return {
    status: 'ok',
    editing_project: service.getProject(),
    applied_count: commands.length,
  }
}

function validateTimeline(input) {
  const project = editingProjectArg(input)
  const diagnostics = validateMediaEditingProjectTimeline(project)
  return {
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'diagnostics' : 'ok',
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  }
}

function buildEditingTaskRequest(taskType, input) {
  switch (taskType) {
    case 'timeline_render':
      return buildTimelineTaskRequest(input, 'timeline_render', 'mp4')
    case 'timeline_hls':
      return buildTimelineTaskRequest(input, 'timeline_hls', 'hls')
    case 'media_transcode':
      return buildSourceTaskRequest(input, 'media_transcode')
    case 'media_reframe':
      return buildSourceTaskRequest(input, 'media_reframe')
    default:
      throw httpError(400, 'editing_task_type_unsupported', `unsupported editing task request type: ${taskType}`)
  }
}

function buildEditingTaskAction(action, input) {
  switch (action) {
    case 'getTask':
    case 'cancelTask':
    case 'getTaskLogs': {
      const taskId = taskIdValue(input)
      const projectId = projectIdValue(input)
      return {
        status: 'ready',
        request: {
          action,
          taskId,
          task_id: taskId,
          options: {
            ...(projectId ? { projectId, project_id: projectId } : {}),
          },
        },
      }
    }
    case 'importExportResource':
      return buildImportExportResourceAction(input)
    case 'saveLocalExport':
      return buildSaveLocalExportAction(input)
    case 'publishHlsStream':
      return buildPublishHlsStreamAction(input)
    default:
      throw httpError(400, 'editing_task_action_unsupported', `unsupported editing task action: ${action}`)
  }
}

function buildImportExportResourceAction(input) {
  const taskId = stringValue(input.taskId ?? input.task_id)
  const task = recordValue(input.task)
  const explicitOutputPath = stringValue(input.outputPath ?? input.output_path)
  if (taskId && !task && !explicitOutputPath) {
    return {
      status: 'not_found',
      result: {
        status: 'not_found',
        task_id: taskId,
      },
    }
  }
  const outputPath = explicitOutputPath ?? stringValue(task?.outputPath)
  if (!outputPath) {
    if (taskId) {
      return {
        status: 'pending_output',
        result: {
          status: 'pending_output',
          task_id: taskId,
          ...(task ? { task } : {}),
        },
      }
    }
    throw new Error('outputPath or taskId is required')
  }
  if (isHlsTaskOutput(task, outputPath)) {
    return {
      status: 'unsupported_output',
      result: {
        status: 'unsupported_output',
        code: 'USE_EDITING_EXPORT_PUBLISH_HLS',
        message: 'Output is an HLS manifest. Use editing_export_publish_hls for HLS artifacts instead of importing it as a RawResource.',
        task_id: taskId,
        outputPath,
        output_path: outputPath,
        ...(task ? { task } : {}),
      },
    }
  }
  const outputName = stringValue(input.filename) ?? stringValue(task?.outputName)
  const mimeType = stringValue(input.mimeType ?? input.mime_type)
  const folderId = stringOrNumberValue(input.folderId ?? input.folder_id)
  return {
    status: 'ready',
    request: {
      outputPath,
      output_path: outputPath,
      ...(outputName ? { filename: outputName } : {}),
      ...(mimeType ? { mimeType, mime_type: mimeType } : {}),
      ...(folderId !== undefined ? { folderId, folder_id: folderId } : {}),
      ...exportImportDerivativeRequest(input),
    },
  }
}

function buildSaveLocalExportAction(input) {
  const explicitOutputPath = stringValue(input.outputPath ?? input.output_path)
  const savePath = stringValue(input.savePath ?? input.save_path ?? input.destinationPath ?? input.destination_path)
  const saveDirectory = stringValue(input.saveDirectory ?? input.save_directory ?? input.destinationDirectory ?? input.destination_directory)
  const taskId = stringValue(input.taskId ?? input.task_id)
  const projectId = projectIdValue(input)
  const task = recordValue(input.task)
  if (explicitOutputPath && !savePath && !saveDirectory) {
    return {
      status: 'result',
      result: {
        status: 'ok',
        outputPath: explicitOutputPath,
        output_path: explicitOutputPath,
        persisted: true,
        uploaded: false,
        candidate_created: false,
      },
    }
  }
  if (!explicitOutputPath && !taskId) throw new Error('outputPath or taskId is required')
  if (taskId && !task && !explicitOutputPath) {
    return {
      status: 'not_found',
      result: {
        status: 'not_found',
        task_id: taskId,
      },
    }
  }
  const outputPath = explicitOutputPath
    ?? stringValue(task?.outputPath ?? task?.hlsManifestPath ?? task?.hls_manifest_path)
  if (!outputPath) {
    return {
      status: 'pending_output',
      result: {
        status: 'pending_output',
        task_id: taskId,
        ...(task ? { task } : {}),
      },
    }
  }
  if (isHlsTaskOutput(task, outputPath)) {
    if (saveDirectory) {
      const segmentPaths = stringList(input.segmentPaths ?? input.segment_paths)
        ?? stringList(task?.hlsSegmentPaths ?? task?.hls_segment_paths)
      const hlsDirectory = stringValue(input.hlsDirectory ?? input.hls_directory)
        ?? stringValue(task?.hlsDirectory ?? task?.hls_directory)
      return {
        status: 'ready',
        request: {
          outputPath,
          output_path: outputPath,
          ...(projectId ? { projectId, project_id: projectId } : {}),
          ...(taskId ? { taskId, task_id: taskId } : {}),
          saveDirectory,
          save_directory: saveDirectory,
          ...(hlsDirectory ? { hlsDirectory, hls_directory: hlsDirectory } : {}),
          ...(segmentPaths ? { segmentPaths, segment_paths: segmentPaths } : {}),
          ...(stringValue(input.filename) ?? stringValue(task?.outputName) ? { filename: stringValue(input.filename) ?? stringValue(task?.outputName) } : {}),
        },
      }
    }
    return {
      status: 'unsupported_output',
      result: {
        status: 'unsupported_output',
        code: 'USE_EDITING_EXPORT_PUBLISH_HLS',
        message: 'Output is an HLS manifest. Use saveDirectory to save the complete HLS bundle locally, or use editing_export_publish_hls for hosted HLS artifacts.',
        task_id: taskId,
        outputPath,
        output_path: outputPath,
        ...(task ? { task } : {}),
      },
    }
  }
  if (saveDirectory) throw new Error('saveDirectory is only supported for HLS manifest outputs')
  if (savePath) {
    return {
      status: 'ready',
      request: {
        outputPath,
        output_path: outputPath,
        ...(projectId ? { projectId, project_id: projectId } : {}),
        ...(taskId ? { taskId, task_id: taskId } : {}),
        savePath,
        save_path: savePath,
        ...(stringValue(input.filename) ?? stringValue(task?.outputName) ? { filename: stringValue(input.filename) ?? stringValue(task?.outputName) } : {}),
      },
    }
  }
  return {
    status: 'result',
    result: {
      status: 'ok',
      task_id: taskId,
      outputPath,
      output_path: outputPath,
      persisted: true,
      uploaded: false,
      candidate_created: false,
      ...(task ? { task } : {}),
    },
  }
}

function buildPublishHlsStreamAction(input) {
  const taskId = stringValue(input.taskId ?? input.task_id)
  const task = recordValue(input.task)
  const hasExplicitManifest = !!stringValue(input.manifestPath ?? input.manifest_path)
  const hasExplicitSegments = !!stringList(input.segmentPaths ?? input.segment_paths)?.length
  if (taskId && !task && !hasExplicitManifest) {
    return {
      status: 'not_found',
      result: {
        status: 'not_found',
        task_id: taskId,
        message: 'No Electron mediaPipeline task was found for taskId. Pass projectId with taskId for persisted workspace recovery, or provide manifestPath and segmentPaths explicitly.',
      },
    }
  }
  const manifestPath = stringValue(input.manifestPath ?? input.manifest_path)
    ?? stringValue(task?.hlsManifestPath ?? task?.hls_manifest_path ?? task?.outputPath)
  const segmentPaths = stringList(input.segmentPaths ?? input.segment_paths)
    ?? stringList(task?.hlsSegmentPaths ?? task?.hls_segment_paths)
  if (taskId && task && (!manifestPath || !segmentPaths?.length) && !hasExplicitManifest && !hasExplicitSegments) {
    return {
      status: 'pending_output',
      result: {
        status: 'pending_output',
        task_id: taskId,
        message: 'The Electron mediaPipeline task does not have a complete HLS manifest/segment output yet.',
        task,
      },
    }
  }
  if (!manifestPath) throw new Error('manifestPath is required')
  if (!segmentPaths?.length) throw new Error('segmentPaths is required')

  const title = stringValue(input.title)
  const projectId = stringOrNumberValue(input.projectId ?? input.project_id)
  const sourceResourceId = stringOrNumberValue(input.sourceResourceId ?? input.source_resource_id)
  const sourceDerivativeId = stringOrNumberValue(input.sourceDerivativeId ?? input.source_derivative_id)
  const durationMs = optionalNumber(input.durationMs ?? input.duration_ms)
  const width = optionalNumber(input.width)
  const height = optionalNumber(input.height)
  return {
    status: 'ready',
    request: {
      manifestPath,
      manifest_path: manifestPath,
      segmentPaths,
      segment_paths: segmentPaths,
      ...(taskId ? { taskId, task_id: taskId } : {}),
      ...(title ? { title } : {}),
      ...(projectId !== undefined ? { projectId, project_id: projectId } : {}),
      ...(sourceResourceId !== undefined ? { sourceResourceId, source_resource_id: sourceResourceId } : {}),
      ...(sourceDerivativeId !== undefined ? { sourceDerivativeId, source_derivative_id: sourceDerivativeId } : {}),
      ...(durationMs !== undefined ? { durationMs, duration_ms: durationMs } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    },
  }
}

function buildTimelineTaskRequest(input, taskType, defaultFormat) {
  const project = editingProjectArg(input)
  return {
    projectId: projectIdValue(input) ?? project.projectId,
    taskType,
    editingProject: project,
    timeline: project.timeline,
    ...resourceRuntimeOptions(input),
    output: outputSpec(input, defaultFormat),
  }
}

function buildSourceTaskRequest(input, taskType) {
  const projectId = projectIdValue(input)
  if (!projectId) {
    throw new Error(`projectId is required for ${taskType} Electron media workspace tasks`)
  }
  const source = recordValue(input.source)
  if (!source) throw new Error('source is required')
  return {
    projectId,
    taskType,
    source,
    ...(taskType === 'media_reframe' ? reframeRuntimeOptions(input) : {}),
    ...(taskType === 'media_transcode' ? transcodeRuntimeOptions(input) : {}),
    ...resourceRuntimeOptions(input),
    output: outputSpec(input, 'mp4'),
  }
}

function addClip(input) {
  const project = editingProjectArg(input)
  const trackId = trackIdValue(input)
  const clip = mediaClipArg(input, project)
  const editingProject = applyTimelineCommand(project, { type: 'add_clip', trackId, clip })
  return {
    status: 'ok',
    track_id: trackId,
    clip_id: clip.id,
    clip,
    editing_project: editingProject,
  }
}

function applySingleTimelineCommand(input, command, result) {
  const editingProject = applyTimelineCommand(editingProjectArg(input), command)
  return result(editingProject)
}

function applyTimelineCommand(project, command) {
  const service = createMediaEditingProjectService(project)
  service.applyCommand(command)
  return service.getProject()
}

function editingProjectArg(input) {
  const project = recordValue(input.editingProject) ?? recordValue(input.editing_project) ?? recordValue(input.project)
  if (!project) throw new Error('editingProject is required')
  assertMediaEditingProjectEnvelope(project)
  return project
}

function assertMediaEditingProjectEnvelope(project) {
  if (project.version !== 1 || !stringValue(project.id) || !stringValue(project.projectId ?? project.project_id)) {
    throw new Error('editingProject must be a MediaEditingProject v1 object')
  }
  if (!recordValue(project.timeline) || project.timeline.version !== 1 || !Array.isArray(project.timeline.tracks)) {
    throw new Error('editingProject.timeline must be a MediaTimelineRecipe v1 object')
  }
  if (!recordValue(project.assets) || !Array.isArray(project.assets.assets)) {
    throw new Error('editingProject.assets must contain an assets array')
  }
}

function commandList(input) {
  const commands = Array.isArray(input.commands) ? input.commands : undefined
  if (commands) return commands
  const command = recordValue(input.command)
  if (command) return [command]
  return []
}

function mediaAssetArg(input) {
  const asset = recordValue(input.asset)
  if (!asset) throw new Error('asset is required')
  const sourceKind = sourceKindValue(asset.sourceKind ?? asset.source_kind)
  const assetType = assetTypeValue(asset.assetType ?? asset.asset_type)
  const resourceId = optionalNumber(asset.resourceId ?? asset.resource_id)
  const localPath = stringValue(asset.localPath ?? asset.local_path)
  const id = stringValue(asset.id) ?? mediaAssetId({ sourceKind, assetType, resourceId, localPath })
  return {
    id,
    sourceKind,
    assetType,
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(localPath ? { localPath } : {}),
    ...(stringValue(asset.mimeType ?? asset.mime_type) ? { mimeType: stringValue(asset.mimeType ?? asset.mime_type) } : {}),
    ...(stringValue(asset.checksum) ? { checksum: stringValue(asset.checksum) } : {}),
    ...(stringValue(asset.label) ? { label: stringValue(asset.label) } : {}),
    ...(recordValue(asset.metadata) ? { metadata: asset.metadata } : {}),
  }
}

function mediaTrackArg(input) {
  const track = recordValue(input.track)
  if (track) {
    return {
      id: stringValue(track.id) ?? `track_${trackTypeValue(track.type)}_${Date.now()}`,
      type: trackTypeValue(track.type),
      zIndex: optionalNumber(track.zIndex ?? track.z_index) ?? 0,
      ...(stringValue(track.name) ? { name: stringValue(track.name) } : {}),
      ...(booleanValue(track.muted) !== undefined ? { muted: booleanValue(track.muted) } : {}),
      ...(booleanValue(track.locked) !== undefined ? { locked: booleanValue(track.locked) } : {}),
      clips: Array.isArray(track.clips) ? track.clips : [],
    }
  }
  const type = trackTypeValue(input.type ?? input.trackType ?? input.track_type)
  return {
    id: stringValue(input.trackId ?? input.track_id) ?? `track_${type}_${Date.now()}`,
    type,
    zIndex: optionalNumber(input.zIndex ?? input.z_index) ?? 0,
    ...(stringValue(input.name) ? { name: stringValue(input.name) } : {}),
    ...(booleanValue(input.muted) !== undefined ? { muted: booleanValue(input.muted) } : {}),
    ...(booleanValue(input.locked) !== undefined ? { locked: booleanValue(input.locked) } : {}),
    clips: [],
  }
}

function mediaClipArg(input, project) {
  const clip = recordValue(input.clip)
  const source = clip ?? input
  const asset = recordValue(source.asset)
  const assetId = stringValue(source.assetId ?? source.asset_id)
  const registeredAsset = assetId ? project.assets.assets.find((candidate) => candidate.id === assetId) : undefined
  const resolvedAsset = asset ?? registeredAsset
  const assetType = assetTypeValue(source.assetType ?? source.asset_type ?? resolvedAsset?.assetType)
  return {
    id: stringValue(source.id ?? source.clipId ?? source.clip_id) ?? `clip_${Date.now()}`,
    assetType,
    ...(resolvedAsset ? { asset: resolvedAsset } : {}),
    timelineStartMs: optionalNumber(source.timelineStartMs ?? source.timeline_start_ms) ?? 0,
    durationMs: optionalNumber(source.durationMs ?? source.duration_ms) ?? 4000,
    ...(optionalNumber(source.sourceStartMs ?? source.source_start_ms) !== undefined ? { sourceStartMs: optionalNumber(source.sourceStartMs ?? source.source_start_ms) } : {}),
    ...(optionalNumber(source.sourceEndMs ?? source.source_end_ms) !== undefined ? { sourceEndMs: optionalNumber(source.sourceEndMs ?? source.source_end_ms) } : {}),
    ...(optionalNumber(source.volume) !== undefined ? { volume: optionalNumber(source.volume) } : {}),
    ...(booleanValue(source.muted) !== undefined ? { muted: booleanValue(source.muted) } : {}),
    ...(fitValue(source.fit) ? { fit: fitValue(source.fit) } : {}),
    ...(stringValue(source.position) ? { position: stringValue(source.position) } : {}),
    ...(optionalNumber(source.xPercent ?? source.x_percent) !== undefined ? { xPercent: optionalNumber(source.xPercent ?? source.x_percent) } : {}),
    ...(optionalNumber(source.yPercent ?? source.y_percent) !== undefined ? { yPercent: optionalNumber(source.yPercent ?? source.y_percent) } : {}),
    ...(optionalNumber(source.scale) !== undefined ? { scale: optionalNumber(source.scale) } : {}),
    ...(optionalNumber(source.opacity) !== undefined ? { opacity: optionalNumber(source.opacity) } : {}),
    ...(recordValue(source.crop) ? { crop: source.crop } : {}),
    ...(recordValue(source.transition) ? { transition: source.transition } : {}),
    ...(recordValue(source.text) ? { text: source.text } : {}),
    ...(recordValue(source.subtitle) ? { subtitle: source.subtitle } : {}),
    ...(recordValue(source.metadata) ? { metadata: source.metadata } : {}),
  }
}

function mediaClipPatchArg(input) {
  const patch = recordValue(input.patch)
  const source = patch ?? input
  const next = {}
  for (const [inputKey, outputKey] of [
    ['timelineStartMs', 'timelineStartMs'],
    ['timeline_start_ms', 'timelineStartMs'],
    ['durationMs', 'durationMs'],
    ['duration_ms', 'durationMs'],
    ['sourceStartMs', 'sourceStartMs'],
    ['source_start_ms', 'sourceStartMs'],
    ['sourceEndMs', 'sourceEndMs'],
    ['source_end_ms', 'sourceEndMs'],
    ['volume', 'volume'],
    ['xPercent', 'xPercent'],
    ['x_percent', 'xPercent'],
    ['yPercent', 'yPercent'],
    ['y_percent', 'yPercent'],
    ['scale', 'scale'],
    ['opacity', 'opacity'],
  ]) {
    const value = optionalNumber(source[inputKey])
    if (value !== undefined) next[outputKey] = value
  }
  if (booleanValue(source.muted) !== undefined) next.muted = booleanValue(source.muted)
  if (fitValue(source.fit)) next.fit = fitValue(source.fit)
  if (stringValue(source.position)) next.position = stringValue(source.position)
  if (recordValue(source.crop)) next.crop = source.crop
  if (recordValue(source.transition)) next.transition = source.transition
  if (recordValue(source.text)) next.text = source.text
  if (recordValue(source.subtitle)) next.subtitle = source.subtitle
  if (recordValue(source.metadata)) next.metadata = source.metadata
  return next
}

function trackIdValue(input) {
  const trackId = stringValue(input.trackId ?? input.track_id)
  if (!trackId) throw new Error('trackId is required')
  return trackId
}

function clipIdValue(input) {
  const clipId = stringValue(input.clipId ?? input.clip_id)
  if (!clipId) throw new Error('clipId is required')
  return clipId
}

function assetIdValue(input) {
  const assetId = stringValue(input.assetId ?? input.asset_id)
  if (!assetId) throw new Error('assetId is required')
  return assetId
}

function productionTimelineClipsArg(input) {
  const clips = input.clips
  if (!Array.isArray(clips)) throw new Error('clips is required')
  return clips.map((clip, index) => {
    const record = recordValue(clip)
    if (!record) throw new Error(`clips[${index}] must be an object`)
    const contentUnitId = stringOrNumberValue(record.contentUnitId ?? record.content_unit_id)
    if (contentUnitId === undefined) throw new Error(`clips[${index}].contentUnitId is required`)
    const resourceId = optionalNumber(record.resourceId ?? record.resource_id)
    if (!Number.isInteger(resourceId) || resourceId <= 0) throw new Error(`clips[${index}].resourceId is required`)
    return {
      id: stringValue(record.id) ?? `production_clip_${index + 1}`,
      title: stringValue(record.title) ?? `Scene ${index + 1}`,
      contentUnitId,
      resourceId,
      ...(stringOrNumberValue(record.sceneMomentId ?? record.scene_moment_id) !== undefined
        ? { sceneMomentId: stringOrNumberValue(record.sceneMomentId ?? record.scene_moment_id) }
        : {}),
      ...(stringValue(record.sceneMomentPath ?? record.scene_moment_path) ? { sceneMomentPath: stringValue(record.sceneMomentPath ?? record.scene_moment_path) } : {}),
      ...(stringOrNumberValue(record.candidateId ?? record.candidate_id) !== undefined
        ? { candidateId: stringOrNumberValue(record.candidateId ?? record.candidate_id) }
        : {}),
      ...(optionalNumber(record.durationSec ?? record.duration_sec) !== undefined ? { durationSec: optionalNumber(record.durationSec ?? record.duration_sec) } : {}),
    }
  })
}

function projectIdValue(input) {
  const value = input.projectId ?? input.project_id
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value)
}

function editingProjectIdValue(input) {
  const editingProjectId = stringValue(input.editingProjectId ?? input.editing_project_id)
  if (!editingProjectId) throw new Error('editingProjectId is required')
  return editingProjectId
}

function taskIdValue(input) {
  const taskId = stringValue(input.taskId ?? input.task_id)
  if (!taskId) throw new Error('taskId is required')
  return taskId
}

function outputSpec(input, defaultFormat) {
  const output = recordValue(input.output)
  const format = stringValue(output?.format) === 'hls' ? 'hls' : stringValue(output?.format) === 'mp4' ? 'mp4' : defaultFormat
  return {
    format,
    ...(stringValue(output?.filename) ? { filename: stringValue(output?.filename) } : {}),
    ...(booleanValue(output?.importToResource ?? output?.import_to_resource) !== undefined
      ? { importToResource: booleanValue(output?.importToResource ?? output?.import_to_resource) }
      : {}),
    ...(stringOrNumberValue(output?.folderId ?? output?.folder_id) !== undefined
      ? { folderId: stringOrNumberValue(output?.folderId ?? output?.folder_id) }
      : {}),
    ...(exportDerivativePayload(output ?? {}) ? { derivative: exportDerivativePayload(output ?? {}) } : {}),
    ...(Array.isArray(output?.hlsVariants ?? output?.hls_variants)
      ? { hlsVariants: output?.hlsVariants ?? output?.hls_variants }
      : {}),
  }
}

function reframeRuntimeOptions(input) {
  const output = recordValue(input.output)
  const reframe = recordValue(input.reframe) ?? {}
  const target = stringValue(input.target ?? reframe.target ?? output?.target)
  const mode = stringValue(input.mode ?? reframe.mode ?? output?.mode)
  const width = optionalNumber(input.width ?? reframe.width ?? output?.width)
  const height = optionalNumber(input.height ?? reframe.height ?? output?.height)
  const background = stringValue(input.background ?? reframe.background ?? output?.background)
  const spec = {
    ...reframe,
    ...(target ? { target } : {}),
    ...(mode ? { mode } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(background ? { background } : {}),
  }
  return {
    ...(target ? { target } : {}),
    ...(mode ? { mode } : {}),
    ...(Object.keys(spec).length ? { reframe: spec } : {}),
  }
}

function transcodeRuntimeOptions(input) {
  const output = recordValue(input.output)
  const transcode = recordValue(input.transcode) ?? {}
  const videoCodec = stringValue(input.videoCodec ?? input.video_codec ?? transcode.videoCodec ?? transcode.video_codec ?? output?.videoCodec ?? output?.video_codec)
  const audioCodec = stringValue(input.audioCodec ?? input.audio_codec ?? transcode.audioCodec ?? transcode.audio_codec ?? output?.audioCodec ?? output?.audio_codec)
  const videoBitrateKbps = optionalNumber(input.videoBitrateKbps ?? input.video_bitrate_kbps ?? transcode.videoBitrateKbps ?? transcode.video_bitrate_kbps ?? output?.videoBitrateKbps ?? output?.video_bitrate_kbps)
  const audioBitrateKbps = optionalNumber(input.audioBitrateKbps ?? input.audio_bitrate_kbps ?? transcode.audioBitrateKbps ?? transcode.audio_bitrate_kbps ?? output?.audioBitrateKbps ?? output?.audio_bitrate_kbps)
  const spec = {
    ...transcode,
    ...(videoCodec ? { videoCodec } : {}),
    ...(audioCodec ? { audioCodec } : {}),
    ...(videoBitrateKbps !== undefined ? { videoBitrateKbps } : {}),
    ...(audioBitrateKbps !== undefined ? { audioBitrateKbps } : {}),
  }
  return Object.keys(spec).length ? { transcode: spec } : {}
}

function resourceRuntimeOptions(input) {
  const output = recordValue(input.output)
  const resourceCache = recordValue(input.resourceCache)
    ?? recordValue(input.resource_cache)
    ?? recordValue(output?.resourceCache)
    ?? recordValue(output?.resource_cache)
  const resourceDownload = recordValue(input.resourceDownload)
    ?? recordValue(input.resource_download)
    ?? recordValue(output?.resourceDownload)
    ?? recordValue(output?.resource_download)
  return {
    ...(resourceCache ? { resourceCache } : {}),
    ...(resourceDownload ? { resourceDownload } : {}),
  }
}

function exportImportDerivativeRequest(input) {
  const derivative = exportDerivativePayload(input)
  return {
    ...(derivative ? { derivative } : {}),
    ...(stringValue(input.operation) ? { operation: stringValue(input.operation) } : {}),
    ...(stringValue(input.tool) ? { tool: stringValue(input.tool) } : {}),
    ...(idList(input.inputResourceIds) ? { inputResourceIds: idList(input.inputResourceIds) } : {}),
    ...(idList(input.input_resource_ids) ? { input_resource_ids: idList(input.input_resource_ids) } : {}),
    ...(stringOrNumberValue(input.sourceResourceId) !== undefined ? { sourceResourceId: stringOrNumberValue(input.sourceResourceId) } : {}),
    ...(stringOrNumberValue(input.source_resource_id) !== undefined ? { source_resource_id: stringOrNumberValue(input.source_resource_id) } : {}),
    ...(idList(input.sourceResourceIds) ? { sourceResourceIds: idList(input.sourceResourceIds) } : {}),
    ...(idList(input.source_resource_ids) ? { source_resource_ids: idList(input.source_resource_ids) } : {}),
    ...(recordValue(input.params) ? { params: input.params } : {}),
  }
}

function exportDerivativePayload(source) {
  const explicit = source.derivative
  if (recordValue(explicit)) {
    const operation = stringValue(explicit.operation)
    if (!operation) return undefined
    const inputIds = numericIdList(explicit.input_resource_ids ?? explicit.inputResourceIds)
    return {
      operation,
      ...(stringValue(explicit.tool) ? { tool: stringValue(explicit.tool) } : {}),
      ...(inputIds.length ? { input_resource_ids: inputIds } : {}),
      ...(recordValue(explicit.params) ? { params: explicit.params } : {}),
    }
  }
  return undefined
}

function idList(value) {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((item) => typeof item === 'string' || typeof item === 'number')
  return list.length ? list : undefined
}

function numericIdList(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return Array.from(new Set(values
    .map((item) => typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN)
    .filter((item) => Number.isInteger(item) && item > 0)))
}

function isHlsTaskOutput(task, outputPath) {
  if (recordValue(task) && stringValue(task.taskType ?? task.task_type) === 'timeline_hls') return true
  return outputPath.toLowerCase().endsWith('.m3u8')
}

function requiredNumeric(input, camelKey, snakeKey) {
  const value = optionalNumber(input[camelKey] ?? input[snakeKey])
  if (value === undefined) throw new Error(`${camelKey} is required`)
  return value
}

function sourceKindValue(value) {
  const kind = stringValue(value)
  if (kind === 'local_file' || kind === 'raw_resource' || kind === 'generated_resource' || kind === 'bytes' || kind === 'external_url') return kind
  if (kind === 'resource') return 'raw_resource'
  return 'local_file'
}

function assetTypeValue(value) {
  const type = stringValue(value)
  if (type === 'video' || type === 'image' || type === 'audio' || type === 'subtitle' || type === 'text') return type
  return 'video'
}

function trackTypeValue(value) {
  const type = stringValue(value)
  if (type === 'video' || type === 'image' || type === 'audio' || type === 'text' || type === 'subtitle' || type === 'effect') return type
  return 'video'
}

function fitValue(value) {
  const fit = stringValue(value)
  if (fit === 'cover' || fit === 'contain' || fit === 'fill' || fit === 'none') return fit
  return undefined
}

function retainSideValue(value) {
  const side = stringValue(value)
  if (side === 'left' || side === 'right' || side === 'both') return side
  return undefined
}

function mediaAssetId(input) {
  if (input.resourceId !== undefined) return `resource_${input.resourceId}`
  if (input.localPath) return input.localPath.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9_-]+/g, '_') || `${input.assetType}_${Date.now()}`
  return `${input.sourceKind}_${input.assetType}_${Date.now()}`
}

function findClip(project, clipId) {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) return { track, clip }
  }
  return undefined
}

function relatedSplitClips(project, clipId) {
  return project.timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.id === clipId || clip.id.startsWith(`${clipId}_right_`))
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project))
}

function touchProject(project) {
  project.updatedAt = new Date().toISOString()
  project.revision = typeof project.revision === 'number' ? project.revision + 1 : 1
}

async function readJSONBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw httpError(400, 'invalid_json', 'request body must be valid JSON')
  }
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function msValue(value) {
  const number = optionalNumber(value)
  return number === undefined ? undefined : Math.max(1, number)
}

function secToMs(value) {
  return value === undefined ? undefined : Math.max(1, Math.round(value * 1000))
}

function stringOrNumberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringValue(value)
}

function stringList(value) {
  if (Array.isArray(value)) {
    const list = value.map((item) => stringValue(item)).filter(Boolean)
    return list.length ? list : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    const list = value.split(',').map((item) => item.trim()).filter(Boolean)
    return list.length ? list : undefined
  }
  return undefined
}

function booleanValue(value) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringRecord(value) {
  const record = recordValue(value)
  if (!record) return undefined
  return Object.fromEntries(Object.entries(record)
    .filter(([, item]) => typeof item === 'string')
    .map(([key, item]) => [key, item]))
}

function optionalDecisionStoreFromBody(body) {
  return recordValue(body.decisionStore ?? body.decision_store)
    ? decisionStoreFromBody(body)
    : undefined
}

function decisionStoreFromBody(body) {
  const config = recordValue(body.decisionStore ?? body.decision_store)
  if (!config) return undefined
  if (config.kind !== 'scoped-project-data') {
    throw httpError(400, 'editing_decision_store_unsupported', 'only scoped-project-data decisionStore is supported')
  }
  const baseUrl = stringValue(config.baseUrl ?? config.base_url)
  const projectUid = stringValue(config.projectUid ?? config.project_uid)
  if (!baseUrl || !projectUid) {
    throw httpError(400, 'editing_decision_store_invalid', 'decisionStore.baseUrl and decisionStore.projectUid are required')
  }
  return createMovScriptScopedProjectDataDecisionStore({
    baseUrl,
    projectUid,
    ...(stringValue(config.title) ? { title: stringValue(config.title) } : {}),
    ...(config.scopeKind === 'user' || config.scopeKind === 'org' ? { scopeKind: config.scopeKind } : {}),
    ...(config.scopeId !== undefined || config.scope_id !== undefined ? { scopeId: config.scopeId ?? config.scope_id } : {}),
    ...(stringValue(config.token) ? { token: stringValue(config.token) } : {}),
    ...(stringRecord(config.headers) ? { headers: stringRecord(config.headers) } : {}),
  })
}

function projectDirFromBody(body) {
  const projectDir = stringValue(body.projectDir ?? body.project_dir ?? body.cwd)
  if (!projectDir) {
    throw httpError(400, 'editing_project_dir_required', 'projectDir is required')
  }
  return resolve(projectDir)
}

function pathSegmentAfter(path, segment) {
  if (!path) return undefined
  const parts = path.split('/').filter(Boolean)
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function lastPathSegment(path) {
  return path?.split('/').filter(Boolean).at(-1)
}

function safeId(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'item'
}

function sameId(left, right) {
  return left !== undefined && right !== undefined && String(left) === String(right)
}

function httpError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function writeEditingServiceError(response, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400
  writeJSON(response, statusCode, {
    error: error?.code ?? 'editing_service_error',
    message: error?.message ?? 'editing service error',
  })
}

function waitForShutdown(runtime) {
  return new Promise(resolve => {
    let closing = false
    const close = async () => {
      if (closing) return
      closing = true
      await runtime.close()
      resolve()
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })
}
