import {
  compileTimelineAssemblyToFinishingProject,
  createTimelineAssemblyCompileManifest,
  type TimelineAssemblyCompileBackend,
  type TimelineAssemblyCompileDiagnostic,
  type TimelineAssemblyCompileManifest,
  type TimelineAssemblyCompileManifestInput,
  type TimelineAssemblyFinishingBackend,
  type TimelineAssemblyFinishingCompileInput,
} from '@movscript/editing'

type BackendCapability = {
  id: TimelineAssemblyCompileBackend
  execution_project: string
  implemented: boolean
  editable: boolean
  render_runtime?: string
  strengths: string[]
  followup_tools: string[]
}

const BACKEND_CAPABILITIES: BackendCapability[] = [
  {
    id: 'media_editing_project',
    execution_project: 'MediaEditingProject',
    implemented: true,
    editable: true,
    render_runtime: 'movscript_media_pipeline|ffmpeg',
    strengths: ['track-based editing', 'FFmpeg/local NLE-lite render', 'timeline mutation', 'HLS/export tasks'],
    followup_tools: ['editing_project_create_from_edit_decisions', 'editing_task_render_create', 'editing_export_create_candidate'],
  },
  {
    id: 'remotion',
    execution_project: 'RemotionCompositionProject',
    implemented: true,
    editable: true,
    render_runtime: 'remotion',
    strengths: ['React/frame-based composition', 'programmatic layout', 'data-driven captions', 'frame-accurate control'],
    followup_tools: ['timeline_backend_project_create'],
  },
  {
    id: 'hyperframes',
    execution_project: 'HyperFramesCompositionProject',
    implemented: true,
    editable: true,
    render_runtime: 'hyperframes',
    strengths: ['HTML/GSAP timed composition', 'dynamic typography', 'caption highlighting', 'motion graphics'],
    followup_tools: ['timeline_backend_project_create'],
  },
  {
    id: 'external_nle',
    execution_project: 'ExternalNleProject',
    implemented: false,
    editable: true,
    strengths: ['XML/EDL/OTIO/FCPXML exchange', 'handoff to Premiere/FCP/DaVinci', 'manual fine cut'],
    followup_tools: ['timeline_backend_conformance_report'],
  },
]

export function timelineBackendCapabilityList(args: Record<string, unknown> = {}): Record<string, unknown> {
  const backend = backendValue(args.backend)
  const backends = backend
    ? BACKEND_CAPABILITIES.filter((capability) => capability.id === backend)
    : BACKEND_CAPABILITIES
  return {
    schema: 'movscript.timeline_backend.capability_list.v1',
    status: 'ok',
    count: backends.length,
    backends,
    rules: [
      'TimelineAssembly is the edit intent IR.',
      'CompileManifest is the executable plan and conformance contract.',
      'Backend projects are sibling execution artifacts; MediaEditingProject is not the only canonical model.',
      'Unsupported capabilities must return diagnostics, not silent fallback.',
    ],
  }
}

export function timelineAssemblyGet(args: Record<string, unknown> = {}): Record<string, unknown> {
  const timelineAssembly = objectArg(args, 'timelineAssembly') ?? objectArg(args, 'timeline_assembly')
  if (!timelineAssembly) {
    return {
      schema: 'movscript.timeline_assembly.get_result.v1',
      status: 'blocked',
      blocker: {
        code: 'timeline_assembly_required',
        message: 'timeline_assembly_get does not infer TimelineAssembly from UI focus. Pass timelineAssembly or resolve it through Project Service first.',
      },
      locator: timelineLocator(args),
    }
  }
  return {
    schema: 'movscript.timeline_assembly.get_result.v1',
    status: 'ok',
    timeline_assembly: timelineAssembly,
    summary: timelineAssemblySummary(timelineAssembly),
  }
}

export function timelineAssemblyValidate(args: Record<string, unknown> = {}): Record<string, unknown> {
  const compileManifest = createTimelineAssemblyCompileManifest(timelineCompileManifestInput(args))
  return {
    schema: 'movscript.timeline_assembly.validate_result.v1',
    status: compileManifest.status,
    valid: compileManifest.status === 'ready',
    compile_manifest: compileManifest,
    conformance_report: conformanceReportFromManifest(compileManifest),
  }
}

export function timelineCompileManifestCreate(args: Record<string, unknown> = {}): Record<string, unknown> {
  const compileManifest = createTimelineAssemblyCompileManifest(timelineCompileManifestInput(args))
  return {
    schema: 'movscript.timeline_assembly.compile_manifest_create_result.v1',
    status: compileManifest.status,
    compile_manifest: compileManifest,
    conformance_report: conformanceReportFromManifest(compileManifest),
  }
}

export function timelineBackendSelect(args: Record<string, unknown> = {}): Record<string, unknown> {
  const backend = backendValue(args.backend ?? args.preferredBackend ?? args.preferred_backend) ?? 'media_editing_project'
  const capability = backendCapability(backend)
  const editDecisions = objectArg(args, 'editDecisions') ?? objectArg(args, 'edit_decisions')
  const compileManifest = editDecisions
    ? createTimelineAssemblyCompileManifest(timelineCompileManifestInput({ ...args, backend }))
    : undefined
  const conformanceReport = compileManifest ? conformanceReportFromManifest(compileManifest) : undefined
  const selected = capability.implemented && (conformanceReport === undefined || conformanceReport.status !== 'blocked')
  return {
    schema: 'movscript.timeline_backend.selection_result.v1',
    status: selected ? 'selected' : 'blocked',
    selected_backend: backend,
    backend,
    capability,
    ...(conformanceReport ? { conformance_report: conformanceReport } : {}),
    review_gate: {
      required: true,
      reason: 'Backend selection affects editable project format, renderer requirements, and human review surface.',
    },
  }
}

export function timelineBackendProjectCreate(args: Record<string, unknown> = {}): Record<string, unknown> {
  const backend = backendValue(args.backend) ?? 'media_editing_project'
  const result = compileTimelineAssemblyToFinishingProject(timelineFinishingCompileInput({ ...args, backend }))
  return {
    schema: 'movscript.timeline_backend.project_create_result.v1',
    status: result.status,
    backend: result.backend,
    compile_manifest: result.compile_manifest,
    conformance_report: conformanceReportFromManifest(result.compile_manifest, result.diagnostics),
    ...(result.finishing_project ? { backend_project: result.finishing_project } : {}),
    ...(result.media_editing_project ? { media_editing_project: result.media_editing_project } : {}),
    editing_timeline_diagnostics: result.editing_timeline_diagnostics,
    diagnostics: result.diagnostics,
    persisted: false,
    rendered: false,
  }
}

export function timelineAssemblyCompile(args: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...timelineBackendProjectCreate(args),
    schema: 'movscript.timeline_assembly.compile_result.v1',
  }
}

export function timelineBackendConformanceReport(args: Record<string, unknown> = {}): Record<string, unknown> {
  const compileManifest = objectArg(args, 'compileManifest') ?? objectArg(args, 'compile_manifest')
  if (compileManifest) {
    return {
      schema: 'movscript.timeline_backend.conformance_report_result.v1',
      status: statusValue(compileManifest.status) ?? 'ready',
      conformance_report: conformanceReportFromManifest(compileManifest as unknown as TimelineAssemblyCompileManifest),
    }
  }
  const manifest = createTimelineAssemblyCompileManifest(timelineCompileManifestInput(args))
  return {
    schema: 'movscript.timeline_backend.conformance_report_result.v1',
    status: manifest.status,
    conformance_report: conformanceReportFromManifest(manifest),
    compile_manifest: manifest,
  }
}

function timelineCompileManifestInput(args: Record<string, unknown>): TimelineAssemblyCompileManifestInput {
  const editDecisions = objectArg(args, 'editDecisions') ?? objectArg(args, 'edit_decisions')
  if (!editDecisions) throw new Error('TimelineAssembly compile requires editDecisions or edit_decisions.')
  const backend = backendValue(args.backend ?? args.preferredBackend ?? args.preferred_backend) ?? 'media_editing_project'
  return {
    timelineAssembly: objectArg(args, 'timelineAssembly') ?? objectArg(args, 'timeline_assembly'),
    assetManifest: objectArg(args, 'assetManifest') ?? objectArg(args, 'asset_manifest'),
    editDecisions: editDecisions as TimelineAssemblyCompileManifestInput['editDecisions'],
    backend,
    renderRuntime: stringValue(args.renderRuntime ?? args.render_runtime) as TimelineAssemblyCompileManifestInput['renderRuntime'],
    runtimeLocked: booleanValue(args.runtimeLocked ?? args.runtime_locked),
    renderSettings: renderSettings(args),
  }
}

function timelineFinishingCompileInput(args: Record<string, unknown>): TimelineAssemblyFinishingCompileInput {
  const input = timelineCompileManifestInput(args)
  return {
    ...input,
    backend: backendValue(args.backend) as TimelineAssemblyFinishingBackend,
    finishingProjectId: stringValue(args.finishingProjectId ?? args.finishing_project_id),
    title: stringValue(args.title),
    projectOptions: {
      title: stringValue(args.title),
      width: numberValue(args.width),
      height: numberValue(args.height),
      fps: numberValue(args.fps),
      background: stringValue(args.background),
      defaultDurationMs: numberValue(args.defaultDurationMs ?? args.default_duration_ms),
    },
  }
}

function conformanceReportFromManifest(
  compileManifest: TimelineAssemblyCompileManifest,
  diagnostics = compileManifest.diagnostics,
): Record<string, unknown> {
  const blockers = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  return {
    schema: 'movscript.timeline_backend.conformance_report.v1',
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'degraded' : 'ready',
    backend: compileManifest.backend.target,
    compile_manifest_id: compileManifest.id,
    fallback_policy: compileManifest.backend.fallback_policy,
    runtime_locked: compileManifest.backend.runtime_locked,
    blockers,
    warnings,
    diagnostics,
    capability_summary: compileManifest.capabilities,
    inputs: compileManifest.inputs,
  }
}

function backendCapability(backend: TimelineAssemblyCompileBackend): BackendCapability {
  return BACKEND_CAPABILITIES.find((capability) => capability.id === backend) ?? {
    id: backend,
    execution_project: `${backend}Project`,
    implemented: false,
    editable: true,
    strengths: ['custom backend adapter'],
    followup_tools: ['timeline_backend_conformance_report'],
  }
}

function timelineAssemblySummary(timelineAssembly: Record<string, unknown>): Record<string, unknown> {
  return {
    id: stringValue(timelineAssembly.id ?? timelineAssembly.timeline_assembly_id),
    target_kind: stringValue(timelineAssembly.target_kind ?? timelineAssembly.targetKind),
    target_ref: stringValue(timelineAssembly.target_ref ?? timelineAssembly.targetRef),
    scope_kind: stringValue(timelineAssembly.scope_kind ?? timelineAssembly.scopeKind),
    scope_ref: stringOrNumberValue(timelineAssembly.scope_ref ?? timelineAssembly.scopeRef),
    track_count: arrayValue(timelineAssembly.tracks).length,
    clip_count: arrayValue(timelineAssembly.clips).length,
  }
}

function timelineLocator(args: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    target_ref: stringValue(args.targetRef ?? args.target_ref),
    scope_kind: stringValue(args.scopeKind ?? args.scope_kind),
    scope_ref: stringOrNumberValue(args.scopeRef ?? args.scope_ref),
  })
}

function renderSettings(args: Record<string, unknown>): TimelineAssemblyCompileManifestInput['renderSettings'] {
  return compactRecord({
    width: numberValue(args.width),
    height: numberValue(args.height),
    fps: numberValue(args.fps),
    background: stringValue(args.background),
    default_duration_ms: numberValue(args.defaultDurationMs ?? args.default_duration_ms),
  })
}

function backendValue(value: unknown): TimelineAssemblyCompileBackend | undefined {
  return stringValue(value) as TimelineAssemblyCompileBackend | undefined
}

function statusValue(value: unknown): 'ready' | 'blocked' | undefined {
  return value === 'ready' || value === 'blocked' ? value : undefined
}

function objectArg(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = args[key]
  return isRecord(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringOrNumberValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringValue(value)
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
