import {
  createMediaEditingProjectFromEditDecisions,
  type MediaEditDecisionsProjectOptions,
  type MovScriptAssetManifest,
  type MovScriptEditDecisionCut,
  type MovScriptEditDecisionOverlay,
  type MovScriptEditDecisionsArtifact,
  type MovScriptVideoComposeRenderRuntime,
} from './video-compose.js'
import {
  validateMediaEditingProjectTimeline,
  type MediaClip,
  type MediaEditingProject,
  type MediaTimelineDiagnostic,
  type MediaTrack,
} from './media-project.js'

export type TimelineAssemblyCompileBackend =
  | 'media_editing_project'
  | 'remotion'
  | 'hyperframes'
  | 'external_nle'
  | string

export type TimelineAssemblyCompileStatus = 'ready' | 'blocked'

export type TimelineAssemblyCompileSeverity = 'error' | 'warning' | 'info'

export interface TimelineAssemblyCompileDiagnostic {
  code: string
  severity: TimelineAssemblyCompileSeverity
  message: string
  action?: string
  asset_ref?: string
  details?: Record<string, unknown>
}

export interface TimelineAssemblyCompileRenderSettings {
  width?: number
  height?: number
  fps?: number
  background?: string
  default_duration_ms?: number
}

export interface TimelineAssemblyCompileManifest {
  schema: 'movscript.timeline_assembly.compile_manifest.v1'
  id: string
  status: TimelineAssemblyCompileStatus
  created_at: string
  timeline_assembly_id?: string
  target_kind?: string
  target_ref?: string
  scope_kind?: string
  scope_ref?: string
  backend: {
    target: TimelineAssemblyCompileBackend
    adapter: string
    adapter_version: string
    render_runtime?: MovScriptVideoComposeRenderRuntime
    runtime_locked: boolean
    fallback_policy: 'no_implicit_fallback'
  }
  input_hash: string
  inputs: {
    timeline_assembly_hash: string
    asset_manifest_hash: string
    edit_decisions_hash: string
    selected_resource_ids: number[]
    selected_candidate_ids: string[]
    referenced_asset_refs: string[]
    unresolved_asset_refs: string[]
  }
  render_settings: TimelineAssemblyCompileRenderSettings
  capabilities: {
    supported_actions: string[]
    unsupported_actions: string[]
    action_counts: Record<string, number>
  }
  diagnostics: TimelineAssemblyCompileDiagnostic[]
}

export interface TimelineAssemblyCompileManifestInput {
  timelineAssembly?: Record<string, unknown>
  assetManifest?: MovScriptAssetManifest
  editDecisions: MovScriptEditDecisionsArtifact
  backend?: TimelineAssemblyCompileBackend
  renderRuntime?: MovScriptVideoComposeRenderRuntime
  runtimeLocked?: boolean
  adapterVersion?: string
  now?: string
  renderSettings?: TimelineAssemblyCompileRenderSettings
}

export interface TimelineAssemblyMediaEditingCompileInput extends TimelineAssemblyCompileManifestInput {
  projectOptions?: MediaEditDecisionsProjectOptions
}

export interface TimelineAssemblyMediaEditingCompileResult {
  schema: 'movscript.timeline_assembly.media_editing_compile_result.v1'
  status: TimelineAssemblyCompileStatus
  compile_manifest: TimelineAssemblyCompileManifest
  media_editing_project?: MediaEditingProject
  editing_timeline_diagnostics: MediaTimelineDiagnostic[]
  diagnostics: TimelineAssemblyCompileDiagnostic[]
}

export type TimelineAssemblyFinishingBackend = 'media_editing_project' | 'hyperframes' | 'remotion'

export interface TimelineAssemblyFinishingProjectFile {
  path: string
  role: 'entrypoint' | 'source' | 'manifest' | 'design' | 'metadata' | 'package' | string
  language?: string
  content: string
}

export interface TimelineAssemblyFinishingProjectAdapter {
  name: string
  kind: 'movscript' | 'hyperframes' | 'remotion' | string
  version: string
  preview_command?: string
  render_command?: string
}

export interface TimelineAssemblyFinishingProject {
  schema: 'movscript.timeline_assembly.finishing_project.v1'
  backend: TimelineAssemblyCompileBackend
  project_id: string
  title: string
  status: TimelineAssemblyCompileStatus
  editable: boolean
  compile_manifest_id: string
  compile_input_hash: string
  source: {
    timeline_assembly_id?: string
    target_ref?: string
    scope_kind?: string
    scope_ref?: string
  }
  coarse_cut: {
    timeline_assembly: Record<string, unknown>
    asset_manifest: MovScriptAssetManifest
    edit_decisions: MovScriptEditDecisionsArtifact
    media_timeline?: MediaEditingProject['timeline']
  }
  adapter: TimelineAssemblyFinishingProjectAdapter
  entrypoint?: string
  files?: TimelineAssemblyFinishingProjectFile[]
  media_editing_project?: MediaEditingProject
  notes?: string[]
}

export interface TimelineAssemblyFinishingCompileInput extends TimelineAssemblyMediaEditingCompileInput {
  backend: TimelineAssemblyCompileBackend
  finishingProjectId?: string
  title?: string
}

export interface TimelineAssemblyFinishingCompileResult {
  schema: 'movscript.timeline_assembly.finishing_compile_result.v1'
  status: TimelineAssemblyCompileStatus
  backend: TimelineAssemblyCompileBackend
  compile_manifest: TimelineAssemblyCompileManifest
  finishing_project?: TimelineAssemblyFinishingProject
  media_editing_project?: MediaEditingProject
  editing_timeline_diagnostics: MediaTimelineDiagnostic[]
  diagnostics: TimelineAssemblyCompileDiagnostic[]
}

const MEDIA_EDITING_RUNTIME_ALLOW_LIST = new Set(['movscript_media_pipeline', 'ffmpeg'])
const BACKEND_RUNTIME_LOCKS = {
  hyperframes: 'hyperframes',
  remotion: 'remotion',
} as const
const IMPLEMENTED_BACKENDS = new Set<TimelineAssemblyCompileBackend>(['media_editing_project', 'hyperframes', 'remotion'])

export function createTimelineAssemblyCompileManifest(
  input: TimelineAssemblyCompileManifestInput,
): TimelineAssemblyCompileManifest {
  const backend = input.backend ?? 'media_editing_project'
  const renderRuntime = input.renderRuntime ?? renderRuntimeFromEditDecisions(input.editDecisions)
  const runtimeLocked = input.runtimeLocked ?? renderRuntime !== undefined
  const renderSettings = normalizeRenderSettings(input)
  const timelineAssembly = input.timelineAssembly ?? {}
  const target = targetFromTimelineAssembly(timelineAssembly, input.editDecisions)
  const assetIndex = assetManifestIndex(input.assetManifest)
  const actionSummary = summarizeEditDecisionActions(input.editDecisions)
  const referencedAssets = collectReferencedAssets(input.editDecisions)
  const unresolvedRefs = referencedAssets
    .filter((entry) => !assetIndex.resolvableRefs.has(entry.ref))
    .map((entry) => entry.ref)
  const diagnostics = [
    ...capabilityDiagnostics({
      backend,
      renderRuntime,
      runtimeLocked,
      actionCounts: actionSummary.actionCounts,
      editDecisions: input.editDecisions,
    }),
    ...unresolvedRefs.map((ref): TimelineAssemblyCompileDiagnostic => ({
      code: 'asset_ref_unresolved',
      severity: 'error',
      message: `TimelineAssembly compile cannot resolve asset ref ${ref}.`,
      asset_ref: ref,
    })),
  ]
  const timelineAssemblyHash = stableHash(timelineAssembly)
  const assetManifestHash = stableHash(input.assetManifest ?? {})
  const editDecisionsHash = stableHash(input.editDecisions)
  const inputHash = stableHash({
    timelineAssemblyHash,
    assetManifestHash,
    editDecisionsHash,
    backend,
    renderRuntime,
    runtimeLocked,
    renderSettings,
  })
  const status: TimelineAssemblyCompileStatus = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'blocked'
    : 'ready'

  return {
    schema: 'movscript.timeline_assembly.compile_manifest.v1',
    id: `compile_${safeId(target.timelineAssemblyId ?? target.targetRef ?? 'timeline_assembly')}_${inputHash.slice(0, 12)}`,
    status,
    created_at: input.now ?? new Date().toISOString(),
    ...(target.timelineAssemblyId ? { timeline_assembly_id: target.timelineAssemblyId } : {}),
    ...(target.targetKind ? { target_kind: target.targetKind } : {}),
    ...(target.targetRef ? { target_ref: target.targetRef } : {}),
    ...(target.scopeKind ? { scope_kind: target.scopeKind } : {}),
    ...(target.scopeRef ? { scope_ref: target.scopeRef } : {}),
    backend: {
      target: backend,
      adapter: backend === 'media_editing_project'
        ? '@movscript/editing:createMediaEditingProjectFromEditDecisions'
        : `@movscript/editing:${backend}`,
      adapter_version: input.adapterVersion ?? '0.1.0',
      ...(renderRuntime ? { render_runtime: renderRuntime } : {}),
      runtime_locked: runtimeLocked,
      fallback_policy: 'no_implicit_fallback',
    },
    input_hash: inputHash,
    inputs: {
      timeline_assembly_hash: timelineAssemblyHash,
      asset_manifest_hash: assetManifestHash,
      edit_decisions_hash: editDecisionsHash,
      selected_resource_ids: assetIndex.selectedResourceIds,
      selected_candidate_ids: assetIndex.selectedCandidateIds,
      referenced_asset_refs: [...new Set(referencedAssets.map((entry) => entry.ref))].sort(),
      unresolved_asset_refs: [...new Set(unresolvedRefs)].sort(),
    },
    render_settings: renderSettings,
    capabilities: {
      supported_actions: actionSummary.supportedActions,
      unsupported_actions: diagnostics
        .filter((diagnostic) => diagnostic.code === 'backend_adapter_not_implemented' || diagnostic.code === 'runtime_lock_backend_mismatch')
        .flatMap((diagnostic) => stringValue(diagnostic.action) ? [String(diagnostic.action)] : [])
        .sort(),
      action_counts: actionSummary.actionCounts,
    },
    diagnostics,
  }
}

export function compileTimelineAssemblyToMediaEditingProject(
  input: TimelineAssemblyMediaEditingCompileInput,
): TimelineAssemblyMediaEditingCompileResult {
  const compileManifest = createTimelineAssemblyCompileManifest({
    ...input,
    backend: 'media_editing_project',
  })
  if (compileManifest.status === 'blocked') {
    return {
      schema: 'movscript.timeline_assembly.media_editing_compile_result.v1',
      status: 'blocked',
      compile_manifest: compileManifest,
      editing_timeline_diagnostics: [],
      diagnostics: compileManifest.diagnostics,
    }
  }

  const mediaEditingProject = createMediaEditingProjectFromEditDecisions(input.editDecisions, {
    ...(input.projectOptions ?? {}),
    assetManifest: input.assetManifest,
    sourceHash: compileManifest.input_hash,
    width: input.projectOptions?.width ?? input.renderSettings?.width,
    height: input.projectOptions?.height ?? input.renderSettings?.height,
    fps: input.projectOptions?.fps ?? input.renderSettings?.fps,
    background: input.projectOptions?.background ?? input.renderSettings?.background,
    defaultDurationMs: input.projectOptions?.defaultDurationMs ?? input.renderSettings?.default_duration_ms,
  })
  mediaEditingProject.timeline.metadata = {
    ...(mediaEditingProject.timeline.metadata ?? {}),
    compileManifestId: compileManifest.id,
    compileManifestHash: compileManifest.input_hash,
    backendTarget: compileManifest.backend.target,
    runtimeLocked: compileManifest.backend.runtime_locked,
  }
  const editingTimelineDiagnostics = validateMediaEditingProjectTimeline(mediaEditingProject)
  const diagnostics = [
    ...compileManifest.diagnostics,
    ...editingTimelineDiagnostics.map((diagnostic): TimelineAssemblyCompileDiagnostic => ({
      code: `media_timeline_${diagnostic.code}`,
      severity: diagnostic.severity,
      message: diagnostic.message,
      details: compactRecord({
        track_id: diagnostic.track_id ?? diagnostic.trackId,
        clip_id: diagnostic.clip_id ?? diagnostic.clipId,
        asset_id: diagnostic.asset_id ?? diagnostic.assetId,
        previous_clip_id: diagnostic.previous_clip_id ?? diagnostic.previousClipId,
        ...(diagnostic.details ? { details: diagnostic.details } : {}),
      }),
    })),
  ]
  const status: TimelineAssemblyCompileStatus = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'blocked'
    : 'ready'

  return {
    schema: 'movscript.timeline_assembly.media_editing_compile_result.v1',
    status,
    compile_manifest: {
      ...compileManifest,
      status,
      diagnostics,
    },
    media_editing_project: mediaEditingProject,
    editing_timeline_diagnostics: editingTimelineDiagnostics,
    diagnostics,
  }
}

export function compileTimelineAssemblyToFinishingProject(
  input: TimelineAssemblyFinishingCompileInput,
): TimelineAssemblyFinishingCompileResult {
  if (input.backend === 'media_editing_project') {
    const mediaResult = compileTimelineAssemblyToMediaEditingProject(input)
    return {
      schema: 'movscript.timeline_assembly.finishing_compile_result.v1',
      status: mediaResult.status,
      backend: 'media_editing_project',
      compile_manifest: mediaResult.compile_manifest,
      ...(mediaResult.media_editing_project ? {
        finishing_project: createMediaEditingFinishingProject(input, mediaResult.compile_manifest, mediaResult.media_editing_project),
        media_editing_project: mediaResult.media_editing_project,
      } : {}),
      editing_timeline_diagnostics: mediaResult.editing_timeline_diagnostics,
      diagnostics: mediaResult.diagnostics,
    }
  }

  const compileManifest = createTimelineAssemblyCompileManifest({
    ...input,
    backend: input.backend,
    renderRuntime: input.renderRuntime ?? defaultRenderRuntimeForFinishingBackend(input.backend, input.editDecisions),
    runtimeLocked: input.runtimeLocked ?? true,
  })
  if (compileManifest.status === 'blocked') {
    return {
      schema: 'movscript.timeline_assembly.finishing_compile_result.v1',
      status: 'blocked',
      backend: input.backend,
      compile_manifest: compileManifest,
      editing_timeline_diagnostics: [],
      diagnostics: compileManifest.diagnostics,
    }
  }

  const mediaEditingProject = createMediaEditingProjectForCompile(input, compileManifest)
  const editingTimelineDiagnostics = validateMediaEditingProjectTimeline(mediaEditingProject)
  const diagnostics = [
    ...compileManifest.diagnostics,
    ...editingTimelineDiagnostics.map((diagnostic): TimelineAssemblyCompileDiagnostic => ({
      code: `media_timeline_${diagnostic.code}`,
      severity: diagnostic.severity,
      message: diagnostic.message,
      details: compactRecord({
        track_id: diagnostic.track_id ?? diagnostic.trackId,
        clip_id: diagnostic.clip_id ?? diagnostic.clipId,
        asset_id: diagnostic.asset_id ?? diagnostic.assetId,
        previous_clip_id: diagnostic.previous_clip_id ?? diagnostic.previousClipId,
        ...(diagnostic.details ? { details: diagnostic.details } : {}),
      }),
    })),
  ]
  const status: TimelineAssemblyCompileStatus = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'blocked'
    : 'ready'
  const finalCompileManifest = {
    ...compileManifest,
    status,
    diagnostics,
  }

  return {
    schema: 'movscript.timeline_assembly.finishing_compile_result.v1',
    status,
    backend: input.backend,
    compile_manifest: finalCompileManifest,
    ...(status === 'ready'
      ? { finishing_project: createAdapterFinishingProject(input, finalCompileManifest, mediaEditingProject) }
      : {}),
    editing_timeline_diagnostics: editingTimelineDiagnostics,
    diagnostics,
  }
}

function createMediaEditingFinishingProject(
  input: TimelineAssemblyFinishingCompileInput,
  compileManifest: TimelineAssemblyCompileManifest,
  mediaEditingProject: MediaEditingProject,
): TimelineAssemblyFinishingProject {
  return {
    schema: 'movscript.timeline_assembly.finishing_project.v1',
    backend: 'media_editing_project',
    project_id: mediaEditingProject.id,
    title: mediaEditingProject.title,
    status: compileManifest.status,
    editable: true,
    compile_manifest_id: compileManifest.id,
    compile_input_hash: compileManifest.input_hash,
    source: finishingSourceFromManifest(compileManifest),
    coarse_cut: coarseCutSnapshot(input, mediaEditingProject),
    adapter: {
      name: 'MovScript MediaEditingProject',
      kind: 'movscript',
      version: compileManifest.backend.adapter_version,
      preview_command: 'editing_project_get',
      render_command: 'editing_task_render_create',
    },
    media_editing_project: mediaEditingProject,
    notes: [
      'TimelineAssembly and CompileManifest define the repeatable rough cut.',
      'Fine cut edits continue in the MediaEditingProject timeline and can be rendered by Media Pipeline.',
    ],
  }
}

function createAdapterFinishingProject(
  input: TimelineAssemblyFinishingCompileInput,
  compileManifest: TimelineAssemblyCompileManifest,
  mediaEditingProject: MediaEditingProject,
): TimelineAssemblyFinishingProject {
  if (input.backend === 'hyperframes') return createHyperFramesFinishingProject(input, compileManifest, mediaEditingProject)
  if (input.backend === 'remotion') return createRemotionFinishingProject(input, compileManifest, mediaEditingProject)
  return {
    schema: 'movscript.timeline_assembly.finishing_project.v1',
    backend: input.backend,
    project_id: finishingProjectId(input, compileManifest),
    title: input.title ?? input.projectOptions?.title ?? `MovScript ${input.backend} rough cut`,
    status: compileManifest.status,
    editable: true,
    compile_manifest_id: compileManifest.id,
    compile_input_hash: compileManifest.input_hash,
    source: finishingSourceFromManifest(compileManifest),
    coarse_cut: coarseCutSnapshot(input, mediaEditingProject),
    adapter: {
      name: String(input.backend),
      kind: String(input.backend),
      version: compileManifest.backend.adapter_version,
    },
    notes: ['This finishing backend is recorded as an external editable project target.'],
  }
}

function createMediaEditingProjectForCompile(
  input: TimelineAssemblyMediaEditingCompileInput,
  compileManifest: TimelineAssemblyCompileManifest,
): MediaEditingProject {
  const mediaEditingProject = createMediaEditingProjectFromEditDecisions(input.editDecisions, {
    ...(input.projectOptions ?? {}),
    assetManifest: input.assetManifest,
    sourceHash: compileManifest.input_hash,
    width: input.projectOptions?.width ?? input.renderSettings?.width,
    height: input.projectOptions?.height ?? input.renderSettings?.height,
    fps: input.projectOptions?.fps ?? input.renderSettings?.fps,
    background: input.projectOptions?.background ?? input.renderSettings?.background,
    defaultDurationMs: input.projectOptions?.defaultDurationMs ?? input.renderSettings?.default_duration_ms,
  })
  mediaEditingProject.timeline.metadata = {
    ...(mediaEditingProject.timeline.metadata ?? {}),
    compileManifestId: compileManifest.id,
    compileManifestHash: compileManifest.input_hash,
    backendTarget: compileManifest.backend.target,
    runtimeLocked: compileManifest.backend.runtime_locked,
  }
  return mediaEditingProject
}

function createHyperFramesFinishingProject(
  input: TimelineAssemblyFinishingCompileInput,
  compileManifest: TimelineAssemblyCompileManifest,
  mediaEditingProject: MediaEditingProject,
): TimelineAssemblyFinishingProject {
  const projectId = finishingProjectId(input, compileManifest)
  const title = input.title ?? input.projectOptions?.title ?? 'MovScript HyperFrames rough cut'
  const html = hyperFramesIndexHtml(mediaEditingProject)
  const roughCut = {
    compile_manifest_id: compileManifest.id,
    compile_input_hash: compileManifest.input_hash,
    timeline: mediaEditingProject.timeline,
    assets: mediaEditingProject.assets.assets,
  }

  return {
    schema: 'movscript.timeline_assembly.finishing_project.v1',
    backend: 'hyperframes',
    project_id: projectId,
    title,
    status: compileManifest.status,
    editable: true,
    compile_manifest_id: compileManifest.id,
    compile_input_hash: compileManifest.input_hash,
    source: finishingSourceFromManifest(compileManifest),
    coarse_cut: coarseCutSnapshot(input, mediaEditingProject),
    adapter: {
      name: 'HyperFrames HTML composition',
      kind: 'hyperframes',
      version: compileManifest.backend.adapter_version,
      preview_command: 'npx hyperframes preview',
      render_command: 'npx hyperframes render',
    },
    entrypoint: 'index.html',
    files: [
      {
        path: 'DESIGN.md',
        role: 'design',
        language: 'markdown',
        content: hyperFramesDesignMarkdown(title),
      },
      {
        path: 'compile-manifest.json',
        role: 'manifest',
        language: 'json',
        content: prettyJson(compileManifest),
      },
      {
        path: 'rough-cut.json',
        role: 'metadata',
        language: 'json',
        content: prettyJson(roughCut),
      },
      {
        path: 'asset-map.json',
        role: 'metadata',
        language: 'json',
        content: prettyJson(assetMap(mediaEditingProject)),
      },
      {
        path: 'index.html',
        role: 'entrypoint',
        language: 'html',
        content: html,
      },
    ],
    notes: [
      'TimelineAssembly -> CompileManifest is the repeatable rough cut.',
      'HyperFrames HTML becomes the fine-cut source of truth after project creation.',
      'resource:<id> sources must be materialized or mapped by the HyperFrames project creator before render.',
    ],
  }
}

function createRemotionFinishingProject(
  input: TimelineAssemblyFinishingCompileInput,
  compileManifest: TimelineAssemblyCompileManifest,
  mediaEditingProject: MediaEditingProject,
): TimelineAssemblyFinishingProject {
  const projectId = finishingProjectId(input, compileManifest)
  const title = input.title ?? input.projectOptions?.title ?? 'MovScript Remotion rough cut'
  const props = remotionRoughCutProps(mediaEditingProject)

  return {
    schema: 'movscript.timeline_assembly.finishing_project.v1',
    backend: 'remotion',
    project_id: projectId,
    title,
    status: compileManifest.status,
    editable: true,
    compile_manifest_id: compileManifest.id,
    compile_input_hash: compileManifest.input_hash,
    source: finishingSourceFromManifest(compileManifest),
    coarse_cut: coarseCutSnapshot(input, mediaEditingProject),
    adapter: {
      name: 'Remotion React composition',
      kind: 'remotion',
      version: compileManifest.backend.adapter_version,
      preview_command: 'npx remotion studio',
      render_command: 'npx remotion render src/Root.tsx MovScriptRoughCut out/rough-cut.mp4',
    },
    entrypoint: 'src/Root.tsx',
    files: [
      {
        path: 'package.json',
        role: 'package',
        language: 'json',
        content: prettyJson(remotionPackageJson(projectId)),
      },
      {
        path: 'compile-manifest.json',
        role: 'manifest',
        language: 'json',
        content: prettyJson(compileManifest),
      },
      {
        path: 'asset-map.json',
        role: 'metadata',
        language: 'json',
        content: prettyJson(assetMap(mediaEditingProject)),
      },
      {
        path: 'src/rough-cut-props.json',
        role: 'metadata',
        language: 'json',
        content: prettyJson(props),
      },
      {
        path: 'src/Root.tsx',
        role: 'entrypoint',
        language: 'tsx',
        content: remotionRootTsx(),
      },
      {
        path: 'src/MovScriptRoughCut.tsx',
        role: 'source',
        language: 'tsx',
        content: remotionRoughCutTsx(),
      },
    ],
    notes: [
      'TimelineAssembly -> CompileManifest is the repeatable rough cut.',
      'Remotion props seed a React composition that can be fine-cut without mutating TimelineAssembly.',
      'resource:<id> sources must be materialized or mapped by the Remotion project creator before render.',
    ],
  }
}

function renderRuntimeFromEditDecisions(editDecisions: MovScriptEditDecisionsArtifact): MovScriptVideoComposeRenderRuntime | undefined {
  return stringValue(editDecisions.render_runtime ?? editDecisions.renderRuntime) as MovScriptVideoComposeRenderRuntime | undefined
}

function defaultRenderRuntimeForFinishingBackend(
  backend: TimelineAssemblyCompileBackend,
  editDecisions: MovScriptEditDecisionsArtifact,
): MovScriptVideoComposeRenderRuntime | undefined {
  if (backend === 'hyperframes') return 'hyperframes'
  if (backend === 'remotion') return 'remotion'
  if (backend === 'media_editing_project') return renderRuntimeFromEditDecisions(editDecisions) ?? 'movscript_media_pipeline'
  return renderRuntimeFromEditDecisions(editDecisions)
}

function finishingProjectId(
  input: TimelineAssemblyFinishingCompileInput,
  compileManifest: TimelineAssemblyCompileManifest,
): string {
  return input.finishingProjectId
    ?? `${safeId(String(input.backend))}_${safeId(compileManifest.target_ref ?? compileManifest.timeline_assembly_id ?? 'draft')}_${compileManifest.input_hash.slice(0, 8)}`
}

function finishingSourceFromManifest(
  compileManifest: TimelineAssemblyCompileManifest,
): TimelineAssemblyFinishingProject['source'] {
  return compactRecord({
    timeline_assembly_id: compileManifest.timeline_assembly_id,
    target_ref: compileManifest.target_ref,
    scope_kind: compileManifest.scope_kind,
    scope_ref: compileManifest.scope_ref,
  }) as TimelineAssemblyFinishingProject['source']
}

function coarseCutSnapshot(
  input: TimelineAssemblyFinishingCompileInput,
  mediaEditingProject: MediaEditingProject,
): TimelineAssemblyFinishingProject['coarse_cut'] {
  return {
    timeline_assembly: input.timelineAssembly ?? {},
    asset_manifest: input.assetManifest ?? { version: '1.0', assets: [] },
    edit_decisions: input.editDecisions,
    media_timeline: mediaEditingProject.timeline,
  }
}

function hyperFramesDesignMarkdown(title: string): string {
  return [
    '# DESIGN',
    '',
    '## Style Prompt',
    `${title} is a neutral rough-cut review composition. The visual system should stay quiet and preserve source media fidelity: black canvas, white subtitles, no decorative gradients, no brand claims, and no generated motion that changes editorial timing.`,
    '',
    '## Colors',
    '- Canvas: #000000',
    '- Primary text: #ffffff',
    '- Subtitle shadow: #000000',
    '- Debug accent: #8bd3ff',
    '',
    '## Typography',
    '- Inter, Arial, sans-serif',
    '',
    '## What NOT to Do',
    '- Do not add decorative backgrounds.',
    '- Do not alter source media color or crop intent unless the fine cut explicitly asks for it.',
    '- Do not invent transitions beyond the compiled edit decisions.',
    '- Do not use infinite animations.',
    '',
  ].join('\n')
}

function hyperFramesIndexHtml(mediaEditingProject: MediaEditingProject): string {
  const timeline = mediaEditingProject.timeline
  const width = positiveNumber(timeline.width) ?? 1920
  const height = positiveNumber(timeline.height) ?? 1080
  const durationMs = positiveNumber(timeline.durationMs) ?? 1000
  const durationSeconds = formatSeconds(durationMs / 1000)
  const clips = finishingTimelineClips(mediaEditingProject)
  const clipMarkup = clips.flatMap((clip) => hyperFramesClipMarkup(clip)).join('\n')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(mediaEditingProject.title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #000000;
      overflow: hidden;
    }
    [data-composition-id="movscript-rough-cut"] {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: ${timeline.background ?? '#000000'};
      color: #ffffff;
      font-family: Inter, Arial, sans-serif;
    }
    .hf-media {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #000000;
    }
    .hf-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    .hf-subtitle {
      position: absolute;
      left: 8%;
      right: 8%;
      bottom: 7%;
      box-sizing: border-box;
      padding: 18px 24px;
      color: #ffffff;
      font-size: 44px;
      line-height: 1.18;
      text-align: center;
      text-shadow: 0 2px 10px #000000, 0 0 18px #000000;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div data-composition-id="movscript-rough-cut" data-start="0" data-duration="${durationSeconds}" data-width="${width}" data-height="${height}">
${clipMarkup}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["movscript-rough-cut"] = tl;
  </script>
</body>
</html>
`
}

function hyperFramesClipMarkup(clip: FinishingTimelineClip): string[] {
  const start = formatSeconds(clip.start_ms / 1000)
  const duration = formatSeconds(clip.duration_ms / 1000)
  const mediaStart = formatSeconds((clip.source_start_ms ?? 0) / 1000)
  const style = `z-index: ${clip.z_index}; opacity: ${formatNumber(clip.opacity ?? 1)};`
  const attrs = [
    `id="${escapeAttribute(clip.id)}"`,
    `data-start="${start}"`,
    `data-duration="${duration}"`,
    `data-track-index="${clip.track_index}"`,
  ]
  if (clip.source_start_ms) attrs.push(`data-media-start="${mediaStart}"`)

  if (clip.type === 'subtitle') {
    return [`    <div class="hf-subtitle" ${attrs.join(' ')} style="${style}">${escapeHtml(clip.text ?? '')}</div>`]
  }
  if (!clip.src) return []
  if (clip.type === 'audio') {
    return [`    <audio ${attrs.join(' ')} src="${escapeAttribute(clip.src)}" data-volume="${formatNumber(clip.volume ?? 1)}"></audio>`]
  }
  if (clip.type === 'image') {
    return [`    <img class="hf-overlay" ${attrs.join(' ')} src="${escapeAttribute(clip.src)}" style="${style}" />`]
  }
  const media = [`    <video class="hf-media" ${attrs.join(' ')} src="${escapeAttribute(clip.src)}" style="${style}" muted playsinline></video>`]
  if ((clip.volume ?? 1) > 0 && !clip.muted) {
    media.push(`    <audio id="${escapeAttribute(`${clip.id}_audio`)}" data-start="${start}" data-duration="${duration}" data-track-index="${clip.track_index + 1000}" data-media-start="${mediaStart}" src="${escapeAttribute(clip.src)}" data-volume="${formatNumber(clip.volume ?? 1)}"></audio>`)
  }
  return media
}

function remotionPackageJson(projectId: string): Record<string, unknown> {
  return {
    scripts: {
      studio: 'remotion studio src/Root.tsx',
      render: 'remotion render src/Root.tsx MovScriptRoughCut out/rough-cut.mp4',
    },
    dependencies: {
      '@remotion/cli': 'latest',
      remotion: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      typescript: 'latest',
    },
    private: true,
    name: safeId(projectId).toLowerCase(),
  }
}

function remotionRootTsx(): string {
  return `import React from 'react';
import { Composition } from 'remotion';
import { MovScriptRoughCut, type MovScriptRoughCutProps } from './MovScriptRoughCut';
import roughCutProps from './rough-cut-props.json';

export const RemotionRoot: React.FC = () => {
  const props = roughCutProps as MovScriptRoughCutProps;

  return (
    <Composition
      id="MovScriptRoughCut"
      component={MovScriptRoughCut}
      width={props.width}
      height={props.height}
      fps={props.fps}
      durationInFrames={props.durationInFrames}
      defaultProps={props}
    />
  );
};
`
}

function remotionRoughCutTsx(): string {
  return `import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, Video } from 'remotion';

export type MovScriptRoughCutClip = {
  id: string;
  type: 'video' | 'image' | 'audio' | 'subtitle';
  src?: string;
  text?: string;
  startFrame: number;
  durationInFrames: number;
  sourceStartFrame?: number;
  sourceEndFrame?: number;
  volume?: number;
  zIndex: number;
  opacity?: number;
  fit?: 'cover' | 'contain' | string;
};

export type MovScriptRoughCutProps = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  background: string;
  clips: MovScriptRoughCutClip[];
};

const mediaStyle = (clip: MovScriptRoughCutClip): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  objectFit: clip.fit === 'contain' ? 'contain' : 'cover',
  opacity: clip.opacity ?? 1,
});

const subtitleStyle: React.CSSProperties = {
  position: 'absolute',
  left: '8%',
  right: '8%',
  bottom: '7%',
  color: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 44,
  lineHeight: 1.18,
  fontWeight: 700,
  textAlign: 'center',
  textShadow: '0 2px 10px #000000, 0 0 18px #000000',
};

const renderClip = (clip: MovScriptRoughCutClip) => {
  if (clip.type === 'subtitle') {
    return <div style={subtitleStyle}>{clip.text}</div>;
  }
  if (!clip.src) return null;
  if (clip.type === 'audio') {
    return (
      <Audio
        src={clip.src}
        startFrom={clip.sourceStartFrame ?? 0}
        endAt={clip.sourceEndFrame}
        volume={clip.volume ?? 1}
      />
    );
  }
  if (clip.type === 'image') {
    return <Img src={clip.src} style={mediaStyle({ ...clip, fit: clip.fit ?? 'contain' })} />;
  }
  return (
    <Video
      src={clip.src}
      startFrom={clip.sourceStartFrame ?? 0}
      endAt={clip.sourceEndFrame}
      volume={clip.volume ?? 1}
      style={mediaStyle(clip)}
    />
  );
};

export const MovScriptRoughCut: React.FC<MovScriptRoughCutProps> = ({
  background,
  clips,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      {clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={Math.max(1, clip.durationInFrames)}
          style={{ zIndex: clip.zIndex }}
        >
          {renderClip(clip)}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
`
}

function remotionRoughCutProps(mediaEditingProject: MediaEditingProject): Record<string, unknown> {
  const timeline = mediaEditingProject.timeline
  const fps = positiveNumber(timeline.fps) ?? 30
  const durationMs = positiveNumber(timeline.durationMs) ?? 1000
  const durationInFrames = Math.max(1, msToFrames(durationMs, fps))
  return {
    schema: 'movscript.remotion.rough_cut_props.v1',
    width: positiveNumber(timeline.width) ?? 1920,
    height: positiveNumber(timeline.height) ?? 1080,
    fps,
    durationInFrames,
    background: timeline.background ?? '#000000',
    clips: finishingTimelineClips(mediaEditingProject).map((clip) => ({
      id: clip.id,
      type: clip.type,
      ...(clip.src ? { src: clip.src } : {}),
      ...(clip.text ? { text: clip.text } : {}),
      startFrame: msToFrames(clip.start_ms, fps),
      durationInFrames: Math.max(1, msToFrames(clip.duration_ms, fps)),
      sourceStartFrame: msToFrames(clip.source_start_ms ?? 0, fps),
      sourceEndFrame: msToFrames((clip.source_end_ms ?? (clip.source_start_ms ?? 0) + clip.duration_ms), fps),
      volume: clip.volume ?? 1,
      zIndex: clip.z_index,
      opacity: clip.opacity ?? 1,
      fit: clip.fit ?? (clip.type === 'image' ? 'contain' : 'cover'),
    })),
  }
}

interface FinishingTimelineClip {
  id: string
  type: 'video' | 'image' | 'audio' | 'subtitle'
  track_id: string
  track_type: string
  asset_type: string
  src?: string
  text?: string
  start_ms: number
  duration_ms: number
  source_start_ms?: number
  source_end_ms?: number
  volume?: number
  muted?: boolean
  opacity?: number
  fit?: string
  z_index: number
  track_index: number
}

function finishingTimelineClips(mediaEditingProject: MediaEditingProject): FinishingTimelineClip[] {
  const tracks = [...mediaEditingProject.timeline.tracks]
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
  return tracks.flatMap((track, trackIndex) => track.clips.map((clip) => finishingTimelineClip(track, trackIndex, clip)))
    .sort((left, right) => left.start_ms - right.start_ms || left.z_index - right.z_index || left.id.localeCompare(right.id))
}

function finishingTimelineClip(track: MediaTrack, trackIndex: number, clip: MediaClip): FinishingTimelineClip {
  const source = mediaClipSource(clip)
  const type: FinishingTimelineClip['type'] = track.type === 'audio'
    ? 'audio'
    : track.type === 'subtitle' || clip.assetType === 'text' || clip.text
      ? 'subtitle'
      : clip.assetType === 'image'
        ? 'image'
        : 'video'
  return {
    id: safeId(clip.id),
    type,
    track_id: track.id,
    track_type: track.type,
    asset_type: clip.assetType,
    ...(source ? { src: source } : {}),
    ...(clip.text?.content ? { text: clip.text.content } : {}),
    start_ms: Math.max(0, Math.round(clip.timelineStartMs)),
    duration_ms: Math.max(1, Math.round(clip.durationMs)),
    source_start_ms: Math.max(0, Math.round(clip.sourceStartMs ?? 0)),
    ...(clip.sourceEndMs !== undefined ? { source_end_ms: Math.max(0, Math.round(clip.sourceEndMs)) } : {}),
    volume: volumeRatio(clip.volume),
    muted: clip.muted,
    opacity: clip.opacity,
    fit: clip.fit,
    z_index: track.zIndex,
    track_index: trackIndex,
  }
}

function mediaClipSource(clip: MediaClip): string | undefined {
  if (clip.asset?.localPath) return clip.asset.localPath
  if (clip.asset?.resourceId !== undefined) return `resource:${clip.asset.resourceId}`
  return undefined
}

function assetMap(mediaEditingProject: MediaEditingProject): Record<string, unknown> {
  return {
    schema: 'movscript.timeline_assembly.asset_map.v1',
    assets: mediaEditingProject.assets.assets.map((asset) => compactRecord({
      id: asset.id,
      type: asset.assetType,
      source_kind: asset.sourceKind,
      resource_id: asset.resourceId,
      local_path: asset.localPath,
      mime_type: asset.mimeType,
      label: asset.label,
      src: asset.localPath ?? (asset.resourceId === undefined ? undefined : `resource:${asset.resourceId}`),
    })),
  }
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps))
}

function volumeRatio(value: unknown): number | undefined {
  const raw = numberField(value)
  if (raw === undefined) return undefined
  const ratio = raw > 1 ? raw / 100 : raw
  return Math.max(0, Math.min(1, ratio))
}

function formatSeconds(value: number): string {
  return formatNumber(value)
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(3)).toString()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

function normalizeRenderSettings(input: TimelineAssemblyCompileManifestInput): TimelineAssemblyCompileRenderSettings {
  return compactRecord({
    width: positiveNumber(input.renderSettings?.width),
    height: positiveNumber(input.renderSettings?.height),
    fps: positiveNumber(input.renderSettings?.fps),
    background: stringValue(input.renderSettings?.background),
    default_duration_ms: positiveNumber(input.renderSettings?.default_duration_ms),
  }) as TimelineAssemblyCompileRenderSettings
}

function targetFromTimelineAssembly(
  timelineAssembly: Record<string, unknown>,
  editDecisions: MovScriptEditDecisionsArtifact,
): {
  timelineAssemblyId?: string
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string
} {
  const metadata = recordValue(editDecisions.metadata)
  const editProfile = recordValue(timelineAssembly.edit_profile ?? timelineAssembly.editProfile)
  return {
    timelineAssemblyId: stringValue(timelineAssembly.id ?? timelineAssembly.timeline_assembly_id ?? metadata?.timeline_assembly_id),
    targetKind: stringValue(timelineAssembly.target_kind ?? timelineAssembly.targetKind ?? metadata?.target_kind),
    targetRef: stringValue(timelineAssembly.target_ref ?? timelineAssembly.targetRef ?? metadata?.target_ref),
    scopeKind: stringValue(timelineAssembly.scope_kind ?? timelineAssembly.scopeKind ?? editProfile?.scope_kind),
    scopeRef: stringValue(timelineAssembly.scope_ref ?? timelineAssembly.scopeRef ?? editProfile?.scope_ref),
  }
}

function capabilityDiagnostics(input: {
  backend: TimelineAssemblyCompileBackend
  renderRuntime?: MovScriptVideoComposeRenderRuntime
  runtimeLocked: boolean
  actionCounts: Record<string, number>
  editDecisions: MovScriptEditDecisionsArtifact
}): TimelineAssemblyCompileDiagnostic[] {
  const diagnostics: TimelineAssemblyCompileDiagnostic[] = []
  if (!IMPLEMENTED_BACKENDS.has(input.backend)) {
    diagnostics.push({
      code: 'backend_adapter_not_implemented',
      severity: 'error',
      action: `compile_to_${input.backend}`,
      message: `TimelineAssembly backend ${input.backend} is not implemented yet.`,
      details: { implemented_backends: [...IMPLEMENTED_BACKENDS].sort() },
    })
  }
  if (
    input.runtimeLocked
    && input.renderRuntime
    && input.backend === 'media_editing_project'
    && !MEDIA_EDITING_RUNTIME_ALLOW_LIST.has(input.renderRuntime)
  ) {
    diagnostics.push({
      code: 'runtime_lock_backend_mismatch',
      severity: 'error',
      action: `render_runtime:${input.renderRuntime}`,
      message: `TimelineAssembly is locked to ${input.renderRuntime}; media_editing_project cannot silently replace it.`,
      details: {
        backend: input.backend,
        allowed_render_runtimes: [...MEDIA_EDITING_RUNTIME_ALLOW_LIST].sort(),
      },
    })
  }
  const lockedRuntime = BACKEND_RUNTIME_LOCKS[input.backend as keyof typeof BACKEND_RUNTIME_LOCKS]
  if (
    input.runtimeLocked
    && input.renderRuntime
    && lockedRuntime
    && input.renderRuntime !== lockedRuntime
  ) {
    diagnostics.push({
      code: 'runtime_lock_backend_mismatch',
      severity: 'error',
      action: `render_runtime:${input.renderRuntime}`,
      message: `TimelineAssembly is locked to ${input.renderRuntime}; ${input.backend} cannot silently replace it.`,
      details: {
        backend: input.backend,
        required_render_runtime: lockedRuntime,
      },
    })
  }
  if ((input.actionCounts.cut ?? 0) === 0) {
    diagnostics.push({
      code: 'primary_visual_action_missing',
      severity: 'error',
      action: 'cut',
      message: 'TimelineAssembly compile requires at least one primary visual cut.',
    })
  }
  for (const overlay of arrayValue<MovScriptEditDecisionOverlay>(input.editDecisions.overlays)) {
    const animation = stringValue(overlay.animation)
    if (animation && animation !== 'static' && animation !== 'fade-in') {
      diagnostics.push({
        code: 'overlay_animation_degraded',
        severity: 'warning',
        action: 'overlay',
        message: `Overlay animation ${animation} will be carried as metadata unless the selected finishing backend implements it.`,
        details: { animation },
      })
    }
  }
  return diagnostics
}

function summarizeEditDecisionActions(editDecisions: MovScriptEditDecisionsArtifact): {
  actionCounts: Record<string, number>
  supportedActions: string[]
} {
  const audio = recordValue(editDecisions.audio)
  const narration = recordValue(audio?.narration)
  const narrationSegments = Array.isArray(audio?.narration)
    ? audio?.narration
    : arrayValue(narration?.segments)
  const subtitles = recordValue(editDecisions.subtitles)
  const actionCounts: Record<string, number> = {
    cut: arrayValue(editDecisions.cuts).length,
    overlay: arrayValue(editDecisions.overlays).length,
    narration_segment: narrationSegments.length,
    music_bed: recordValue(audio?.music) ? 1 : 0,
    sfx_hit: arrayValue(audio?.sfx).length,
    subtitle_segment: arrayValue(subtitles?.segments).length + arrayValue(subtitles?.captions).length,
  }
  return {
    actionCounts,
    supportedActions: Object.entries(actionCounts)
      .filter(([, count]) => count > 0)
      .map(([action]) => action)
      .sort(),
  }
}

function collectReferencedAssets(editDecisions: MovScriptEditDecisionsArtifact): Array<{ action: string; ref: string }> {
  const refs: Array<{ action: string; ref: string }> = []
  for (const cut of arrayValue<MovScriptEditDecisionCut>(editDecisions.cuts)) {
    pushAssetRef(refs, 'cut', assetRef(cut))
  }
  for (const overlay of arrayValue<MovScriptEditDecisionOverlay>(editDecisions.overlays)) {
    pushAssetRef(refs, 'overlay', assetRef(overlay))
  }
  const audio = recordValue(editDecisions.audio)
  const narration = recordValue(audio?.narration)
  const narrationSegments = Array.isArray(audio?.narration)
    ? audio?.narration
    : arrayValue(narration?.segments)
  for (const segment of narrationSegments) {
    pushAssetRef(refs, 'narration_segment', assetRef(recordValue(segment) ?? {}))
  }
  pushAssetRef(refs, 'music_bed', assetRef(recordValue(audio?.music) ?? {}))
  for (const segment of arrayValue(audio?.sfx)) {
    pushAssetRef(refs, 'sfx_hit', assetRef(recordValue(segment) ?? {}))
  }
  const subtitles = recordValue(editDecisions.subtitles)
  pushAssetRef(refs, 'subtitle_file', assetRef(subtitles ?? {}))
  return refs
}

function pushAssetRef(output: Array<{ action: string; ref: string }>, action: string, value: unknown): void {
  const ref = refKey(value)
  if (!ref || ref === 'auto' || ref === 'segments' || ref === 'captions' || ref === 'script') return
  output.push({ action, ref })
}

function assetManifestIndex(manifest: MovScriptAssetManifest | undefined): {
  resolvableRefs: Set<string>
  selectedResourceIds: number[]
  selectedCandidateIds: string[]
} {
  const resolvableRefs = new Set<string>()
  const selectedResourceIds = new Set<number>()
  const selectedCandidateIds = new Set<string>()
  for (const entry of arrayValue<Record<string, unknown>>(manifest?.assets)) {
    const refs = assetRefsFromRecord(entry)
    const resourceId = resourceIdFromRecord(entry)
    const candidateId = stringValue(
      entry.candidate_id
      ?? entry.candidateId
      ?? recordValue(entry.metadata)?.candidate_id
      ?? recordValue(entry.metadata)?.candidateId
      ?? recordValue(recordValue(entry.metadata)?.intent_ref)?.candidate_id,
    )
    if (resourceId !== undefined) selectedResourceIds.add(resourceId)
    if (candidateId) selectedCandidateIds.add(candidateId)
    if (assetRecordIsResolvable(entry, resourceId)) {
      for (const ref of refs) resolvableRefs.add(ref)
      if (resourceId !== undefined) resolvableRefs.add(String(resourceId))
    }
  }
  return {
    resolvableRefs,
    selectedResourceIds: [...selectedResourceIds].sort((left, right) => left - right),
    selectedCandidateIds: [...selectedCandidateIds].sort(),
  }
}

function assetRecordIsResolvable(record: Record<string, unknown>, resourceId: number | undefined): boolean {
  if (resourceId !== undefined) return true
  return !!assetPathValue(record.localPath ?? record.local_path ?? record.path ?? record.file_path ?? record.filePath ?? record.src)
}

function assetRefsFromRecord(record: Record<string, unknown>): string[] {
  return [
    record.id,
    record.asset_id,
    record.assetId,
    record.ref,
    record.name,
    record.path,
    record.localPath,
    record.local_path,
    record.file_path,
    record.filePath,
    record.resource_id,
    record.resourceId,
  ].flatMap((value) => {
    const key = refKey(value)
    return key ? [key] : []
  })
}

function assetRef(record: Record<string, unknown>): unknown {
  return record.source ?? record.asset_id ?? record.assetId ?? record.resource_id ?? record.resourceId
}

function resourceIdFromRecord(record: Record<string, unknown>): number | undefined {
  return integerField(record.resourceId ?? record.resource_id)
    ?? resourceIdFromString(stringValue(record.path) ?? '')
}

function assetPathValue(value: unknown): string | undefined {
  const path = stringValue(value)
  if (!path) return undefined
  if (/^(?:content-unit|content_unit):/i.test(path)) return undefined
  return path
}

function resourceIdFromString(value: string): number | undefined {
  const match = value.match(/^(?:resource|raw_resource|backend_resource)[:_](\d+)$/i)
  const raw = match?.[1]
  return raw === undefined ? undefined : integerField(raw)
}

function stableHash(value: unknown): string {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '"__undefined__"'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
  }
  return JSON.stringify(String(value))
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function positiveNumber(value: unknown): number | undefined {
  const number = numberField(value)
  return number === undefined || number <= 0 ? undefined : number
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function integerField(value: unknown): number | undefined {
  const number = numberField(value)
  if (number === undefined || !Number.isInteger(number) || number <= 0) return undefined
  return number
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function arrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function refKey(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value)
}

function safeId(value: unknown): string {
  const raw = String(value ?? 'draft').trim() || 'draft'
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'draft'
}
