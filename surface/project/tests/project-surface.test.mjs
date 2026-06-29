import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  PROJECT_SURFACE_ROUTES,
  projectSurfaceDescriptor,
  projectSurfacePath,
} from '../dist/index.js'
import {
  agentSurfaceDomainFocus,
  agentSurfaceFocusLabel,
  agentSurfaceHasTimelineFocus,
  agentSurfaceLegacyProductionId,
  agentSurfaceParams,
  agentSurfaceTimelineFocusHref,
  buildContentCanvasWorkspaceSnapshot,
  contentCanvasNodeCanGenerate,
  contentCanvasNodeCanUseCandidateFlow,
  contentCanvasNodeIsNamespace,
} from '../dist/data.js'
import {
  agentImpactPreviewTimelineHref,
  buildTimelineAssemblyState,
  buildWorkflowArtifactDebugView,
} from '../dist/react.js'
import {
  createHostedProjectSurfaceRuntime,
  projectSurfaceContextCommandEnvelope,
  unwrapProjectSurfaceGatewayResult,
} from '../dist/runtime.js'

test('project surface exposes studio routes independent of legacy agent routes', () => {
  assert.equal(PROJECT_SURFACE_ROUTES.overview, '/studio/:projectId/overview')
  assert.equal(PROJECT_SURFACE_ROUTES.progress, '/studio/:projectId/progress')
  assert.equal(PROJECT_SURFACE_ROUTES.dailies, '/studio/:projectId/dailies')
  assert.equal(PROJECT_SURFACE_ROUTES.scripts, '/studio/:projectId/scripts')
  assert.equal(PROJECT_SURFACE_ROUTES.standards, '/studio/:projectId/standards')
  assert.equal(PROJECT_SURFACE_ROUTES.content, '/studio/:projectId/content')
  assert.equal(PROJECT_SURFACE_ROUTES.contentCanvas, '/studio/:projectId/content/canvas')
  assert.equal(PROJECT_SURFACE_ROUTES.contentPreview, '/studio/:projectId/content/preview')
  assert.equal(projectSurfacePath('overview', 'rain/night'), '/studio/rain%2Fnight/overview')
  assert.equal(projectSurfacePath('scripts', 'rain/night'), '/studio/rain%2Fnight/scripts')
  assert.equal(projectSurfacePath('standards', 'rain/night'), '/studio/rain%2Fnight/standards')
  assert.equal(projectSurfacePath('content', 'rain/night'), '/studio/rain%2Fnight/content')
  assert.equal(projectSurfacePath('contentCanvas', 'rain/night'), '/studio/rain%2Fnight/content/canvas')
  assert.equal(projectSurfacePath('contentPreview', 'rain/night'), '/studio/rain%2Fnight/content/preview')
  assert.equal(projectSurfacePath('impact', 'rain/night'), '/studio/rain%2Fnight/impact')
})

test('hosted project surface runtime normalizes context and delegates host navigation', async () => {
  const opened = []
  const context = {
    schema: 'movscript.context-envelope.v1',
    contextId: 'ctx_1',
    revision: 3,
    issuedAt: '2026-06-29T00:00:00.000Z',
    runtime: { owner: 'desktop-owned' },
    principal: { userId: 'user_1', kind: 'cloud-user', scopeKind: 'org', scopeId: 7 },
    dataConnection: { kind: 'local' },
    session: {
      sessionId: 'session_1',
      project: { id: 'context-project', uid: 'proj_uid_7', title: 'Context Project' },
      workspace: { kind: 'local-fs', projectCwd: '/tmp/context-project' },
      capabilities: { localFileAccess: true, fileImport: true, mediaPreview: true },
    },
  }

  const runtime = createHostedProjectSurfaceRuntime({
    context,
    project: {
      projectId: 'fallback-project',
      location: 'remote',
      projectDir: '/tmp/fallback',
      title: 'Fallback Project',
    },
    href: (route, params, project) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined) query.set(key, String(value))
      }
      const search = query.toString()
      return `/hosted/${project.projectId}/${route}${search ? `?${search}` : ''}`
    },
    openHref: (href) => {
      opened.push(href)
    },
    capabilities: {
      localGit: true,
    },
    gateways: {
      project: {
        readModel: async () => ({ ok: true }),
      },
    },
  })

  assert.equal(runtime.project.projectId, 'context-project')
  assert.equal(runtime.project.projectDir, '/tmp/context-project')
  assert.equal(runtime.project.projectUid, 'proj_uid_7')
  assert.equal(runtime.project.title, 'Context Project')
  assert.equal(runtime.project.location, 'local')
  assert.equal(runtime.capabilities.localGit, true)
  assert.equal(runtime.capabilities.nativeWindowControls, false)
  assert.equal(runtime.navigator.href('scripts', { scriptId: 42 }), '/hosted/context-project/scripts?scriptId=42')

  await runtime.navigator.open('standards', { tab: 'style' })
  assert.deepEqual(opened, ['/hosted/context-project/standards?tab=style'])
  assert.deepEqual(projectSurfaceContextCommandEnvelope(context), {
    context: {
      sessionId: 'session_1',
      revision: 3,
    },
  })
  assert.equal(unwrapProjectSurfaceGatewayResult({ result: { ok: true } }).ok, true)
  assert.equal(unwrapProjectSurfaceGatewayResult({ ok: true }).ok, true)
})

test('project scripts surface reads script selection from router search params', () => {
  const source = readFileSync(new URL('../src/components/scripts/ProjectScriptsSurface.tsx', import.meta.url), 'utf8')
  const routeSource = readFileSync(new URL('../src/components/routes/ProjectSurfaceRouteView.tsx', import.meta.url), 'utf8')

  assert.match(source, /params\?: URLSearchParams/)
  assert.match(source, /selectedScriptIdFromSearchParams\(params\)/)
  assert.match(routeSource, /<ProjectScriptsSurface params=\{params\} \/>/)
  assert.doesNotMatch(source, /window\.location\.search/)
})

test('project edit desk exposes a draggable timeline assembly workbench', () => {
  const source = readFileSync(new URL('../src/components/edit-desk/ProjectEditDeskSurface.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/components/edit-desk/ProjectEditDeskSurface.css', import.meta.url), 'utf8')

  assert.match(source, /ProjectEditDeskWorkbench/)
  assert.match(source, /compileTimelineAssemblyToFinishingProject/)
  assert.match(source, /TimelineAssemblyState/)
  assert.match(source, /TimelineAssemblySourceNamespace/)
  assert.match(source, /TimelineAssemblyCoverageMap/)
  assert.match(source, /TimelineAssemblyDecisionLogEntry/)
  assert.match(source, /TimelineAssemblyEditActionPlan/)
  assert.match(source, /TimelineAssemblyClipEditIntent/)
  assert.match(source, /DEFAULT_EDIT_PROFILE/)
  assert.match(source, /buildTimelineAssemblyState/)
  assert.match(source, /buildTimelineAssemblySourceNamespace/)
  assert.match(source, /ContentUnitIntentPanel/)
  assert.match(source, /ContentUnitIntentCard/)
  assert.match(source, /contentUnitIntentSummary/)
  assert.match(source, /assetStatusOrder/)
  assert.match(source, /FinishingBackendPicker/)
  assert.match(source, /selectedBackends/)
  assert.match(source, /onToggleBackend/)
  assert.match(source, /buildEditDecisionHandoff/)
  assert.match(source, /buildTimelineAssemblyEditActionPlan/)
  assert.match(source, /buildOpenMontageEditDecisions/)
  assert.match(source, /buildOpenMontageAssetManifest/)
  assert.match(source, /openMontageTransitionsFromClips/)
  assert.match(source, /timelineAssemblyCoverage/)
  assert.match(source, /timelineAssemblyDecisionLog/)
  assert.match(source, /intentRefFromAsset/)
  assert.match(source, /editing_project_create_from_edit_decisions/)
  assert.match(source, /compile_manifest/)
  assert.match(source, /compile_result/)
  assert.match(source, /compile_diagnostics/)
  assert.match(source, /backend_options/)
  assert.match(source, /finishing_projects/)
  assert.match(source, /video_compose_request/)
  assert.match(source, /editing_video_compose/)
  assert.match(source, /ProjectServiceGateway/)
  assert.match(source, /readTimelineAssemblyDraft/)
  assert.match(source, /writeTimelineAssemblyDraft/)
  assert.match(source, /timelineAssemblyDraftPayload/)
  assert.match(source, /timelineAssemblyStateFromDraftRecord/)
  assert.match(source, /edit-desk-editor-picker/)
  assert.match(source, /type="checkbox"/)
  assert.match(source, /FINISHING_BACKEND_LABELS/)
  assert.match(source, /selected_output/)
  assert.match(source, /mediaLocalPathFromRecord/)
  assert.match(source, /local_path/)
  assert.match(source, /CompileManifest/)
  assert.match(source, /source_namespace/)
  assert.match(source, /coverage_map/)
  assert.match(source, /decision_log/)
  assert.match(source, /edit_action_plan/)
  assert.match(source, /intent_ref/)
  assert.match(source, /OpenMontage 动作/)
  assert.match(source, /transition_in/)
  assert.match(source, /ducking/)
  assert.match(source, /subtitle_style/)
  assert.match(source, /render_contract/)
  assert.match(source, /runtime: 'video_compose'/)
  assert.match(source, /fallback_policy: 'no_implicit_fallback'/)
  assert.match(source, /draggable/)
  assert.match(source, /onDropPayload/)
  assert.match(source, /edit_decisions/)
  assert.doesNotMatch(source, /NamespaceSpinePanel/)
  assert.doesNotMatch(source, /HandoffPanel/)
  assert.doesNotMatch(source, /ComposeResultCard/)
  assert.doesNotMatch(source, /edit-desk-toolbar/)
  assert.doesNotMatch(source, /edit-desk-backend-selector/)
  assert.doesNotMatch(source, /复制项目草案/)
  assert.match(css, /\.edit-desk-main/)
  assert.match(css, /\.edit-desk-left-rail/)
  assert.match(css, /\.edit-desk-content-unit-list/)
  assert.match(css, /\.edit-desk-content-unit-list__items/)
  assert.match(css, /\.edit-desk-editor-picker/)
  assert.match(css, /\.edit-desk-editor-checkbox/)
  assert.match(css, /\.edit-desk-inspector-section/)
  assert.match(css, /\.edit-desk-timeline/)
  assert.match(css, /\.edit-desk-clip/)
  assert.doesNotMatch(css, /\.edit-desk-toolbar/)
  assert.doesNotMatch(css, /\.edit-desk-backend-selector/)
  assert.doesNotMatch(css, /\.edit-desk-namespace-spine/)
  assert.match(css, /max-height: 310px/)
})

test('project edit desk reads timeline namespace and ContentUnit output refs from read models', () => {
  const debugView = buildWorkflowArtifactDebugView({
    readModel: {
      projectReadModel: {
        schema: 'movscript.project-read-model.v1',
        productions: [{
          id: 'ep01_rebirth_refusal',
          title: 'Rebirth Refusal',
        }],
        domainGraph: {
          nodes: [{
            category: 'timeline_namespace',
            kind: 'production',
            id: 'ep01_rebirth_refusal',
            title: 'Rebirth Refusal',
            path: 'productions/ep01_rebirth_refusal/production.json',
            metadata: { entityKind: 'production' },
          }],
        },
        contentUnits: [{
          id: 'cu_refusal_opening_shot',
          title: 'Opening shot',
          content_unit_type: 'expression_unit_ref',
          output_kind: 'video',
          content_unit_ref: 'content_units/cu_refusal_opening_shot',
          expression_unit_ref: 'productions/ep01_rebirth_refusal/segments/opening/scene_moments/refusal/expression_units/opening_shot',
          candidate_count: 1,
          selected_output: {
            candidate_id: 'cand_opening_shot',
            resource_id: 812,
          },
        }],
      },
    },
  })
  const assembly = buildTimelineAssemblyState({
    debugView,
    productionId: 'ep01_rebirth_refusal',
    targetRef: 'timeline_assembly:production:ep01_rebirth_refusal',
    focusLabel: 'production: ep01_rebirth_refusal',
  })

  assert.equal(debugView.timelineNamespaces.length, 1)
  assert.equal(assembly.sourceNamespace.root.title, 'Rebirth Refusal')
  assert.equal(debugView.assetManifest[0].semanticRef, '{{content_unit::cu_refusal_opening_shot}}')
  assert.equal(debugView.assetManifest[0].targetEntityRef, 'productions/ep01_rebirth_refusal/segments/opening/scene_moments/refusal/expression_units/opening_shot')
  assert.equal(debugView.assetManifest[0].resourceId, '812')
  assert.equal(assembly.clips[0].intentRef.contentUnitId, 'cu_refusal_opening_shot')
})

test('project edit desk keeps ContentUnits visible before candidate output exists', () => {
  const debugView = buildWorkflowArtifactDebugView({
    readModel: {
      projectReadModel: {
        schema: 'movscript.project-read-model.v1',
        overview: {
          contentUnits: [{
            id: 'content_unit:cu_nested_opening_shot',
            path: 'content_units/cu_nested_opening_shot/content_unit.json',
            record: {
              id: 'cu_nested_opening_shot',
              title: 'Nested opening shot',
              content_unit_type: 'expression_unit_ref',
              output_kind: 'video',
              expression_unit_ref: 'productions/ep01/segments/opening/scene_moments/wakeup/expression_units/opening_shot',
            },
          }],
        },
      },
    },
  })

  assert.equal(debugView.requiredAssets.length, 1)
  assert.equal(debugView.requiredAssets[0].contentUnitId, 'cu_nested_opening_shot')
  assert.equal(debugView.requiredAssets[0].targetEntityRef, 'productions/ep01/segments/opening/scene_moments/wakeup/expression_units/opening_shot')
  assert.equal(debugView.assetManifest.length, 1)
  assert.equal(debugView.assetManifest[0].semanticRef, '{{content_unit::cu_nested_opening_shot}}')
  assert.equal(debugView.assetManifest[0].status, 'missing_candidate')
})

test('project surface descriptor carries host-neutral project intent', () => {
  assert.deepEqual(
    projectSurfaceDescriptor({
      surface: 'dailies',
      projectId: 'chang-an-rain-night',
      params: { contentUnitId: '04_chase_video' },
      reason: 'review candidates',
      source: 'agent',
    }),
    {
      scope: 'project',
      surface: 'dailies',
      projectId: 'chang-an-rain-night',
      params: { contentUnitId: '04_chase_video' },
      reason: 'review candidates',
      source: 'agent',
    },
  )
})

test('agent surface params carry normalized focus while preserving legacy production compatibility', () => {
  const params = new URLSearchParams({
    projectId: 'project-a',
    targetKind: 'timeline_assembly',
    scopeKind: 'production',
    scopeRef: 'pilot',
  })

  const query = agentSurfaceParams(params)
  assert.equal(query.productionId, 'pilot')

  const focus = agentSurfaceDomainFocus(query)
  assert.equal(focus.target?.targetCategory, 'timeline_assembly')
  assert.equal(focus.target?.targetRef, 'timeline_assembly:production:pilot')
  assert.equal(focus.scope?.kind, 'production')
  assert.equal(agentSurfaceFocusLabel(focus), 'production: pilot')
  assert.equal(agentSurfaceLegacyProductionId(focus), 'pilot')
  assert.equal(agentSurfaceHasTimelineFocus(focus), true)
})

test('agent surface params keep non-production timeline scopes out of legacy production projection', () => {
  const params = new URLSearchParams({
    projectId: 'project-a',
    targetKind: 'timeline_assembly',
    scopeKind: 'episode',
    scopeRef: 'ep01',
  })

  const query = agentSurfaceParams(params)
  assert.equal(query.productionId, undefined)

  const focus = agentSurfaceDomainFocus(query)
  assert.equal(focus.target?.targetCategory, 'timeline_assembly')
  assert.equal(focus.target?.targetRef, 'timeline_assembly:episode:ep01')
  assert.equal(focus.scope?.kind, 'episode')
  assert.equal(agentSurfaceFocusLabel(focus), 'episode: ep01')
  assert.equal(agentSurfaceLegacyProductionId(focus), undefined)
  assert.equal(agentSurfaceHasTimelineFocus(focus), true)
})

test('agent surface timeline focus href replaces stale legacy production query', () => {
  const params = new URLSearchParams('mcpApiBaseURL=http://mcp.test/agent-api/v1&productionId=pilot&scopeKind=production&scopeRef=pilot')
  const focus = agentSurfaceDomainFocus({
    projectId: 'project-a',
    scopeKind: 'episode',
    scopeRef: 'ep01',
  })

  const href = agentSurfaceTimelineFocusHref('/agent/preview/timeline', params, focus, { projectId: 'project-a' })
  const query = new URL(`http://surface.test${href}`).searchParams

  assert.equal(query.get('mcpApiBaseURL'), 'http://mcp.test/agent-api/v1')
  assert.equal(query.get('productionId'), null)
  assert.equal(query.get('projectId'), 'project-a')
  assert.equal(query.get('scopeKind'), 'episode')
  assert.equal(query.get('scopeRef'), 'ep01')
  assert.equal(query.get('targetKind'), 'timeline_assembly')
  assert.equal(query.get('targetRef'), 'timeline_assembly:episode:ep01')
})

test('impact preview links use timeline scope before legacy production path', () => {
  const scopedHref = agentImpactPreviewTimelineHref({
    item: {
      scope_kind: 'episode',
      scope_ref: 'ep02',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:episode:ep02',
    },
    params: new URLSearchParams('productionId=pilot'),
    fallbackProjectId: 'project-a',
  })
  const scopedQuery = new URL(`http://surface.test${scopedHref}`).searchParams

  assert.equal(scopedQuery.get('productionId'), null)
  assert.equal(scopedQuery.get('scopeKind'), 'episode')
  assert.equal(scopedQuery.get('scopeRef'), 'ep02')
  assert.equal(scopedQuery.get('targetRef'), 'timeline_assembly:episode:ep02')

  const legacyHref = agentImpactPreviewTimelineHref({
    item: {
      target_path: 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json',
    },
    params: new URLSearchParams(),
    fallbackProjectId: 'project-a',
  })
  const legacyQuery = new URL(`http://surface.test${legacyHref}`).searchParams

  assert.equal(legacyQuery.get('productionId'), 'pilot')
  assert.equal(legacyQuery.get('scopeKind'), 'production')
  assert.equal(legacyQuery.get('scopeRef'), 'pilot')
  assert.equal(legacyQuery.get('targetRef'), 'timeline_assembly:production:pilot')
})

test('content canvas domain graph treats namespaces as structure, not candidate targets', () => {
  const production = indexedEntity('production', 'pilot', 'productions/pilot/production.json', {
    id: 'pilot',
    title: 'Pilot',
    namespace_kind: 'episode',
  })
  const segment = indexedEntity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', {
    id: 'opening',
    title: 'Opening',
    namespace_kind: 'beat',
  })
  const sceneMoment = indexedEntity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', {
    id: 'rain_call',
    title: 'Rain call',
  })
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [production],
    segments: [segment],
    sceneMoments: [sceneMoment],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [],
    keyframes: [],
    assets: [],
    settings: [],
    settingStates: [],
    audioCues: [],
    contentUnitCandidates: {},
    domainGraph: {
      nodes: [
        { category: 'timeline_namespace', kind: 'episode', id: 'pilot', path: production.path, title: 'Pilot', metadata: { entityKind: 'production' } },
        { category: 'timeline_namespace', kind: 'beat', id: 'opening', path: segment.path, title: 'Opening', metadata: { entityKind: 'segment' } },
        { category: 'system_primitive', kind: 'scene_moment', id: 'rain_call', path: sceneMoment.path, title: 'Rain call', metadata: { entityKind: 'scene_moment' } },
      ],
      edges: [],
      timelineNamespaceNodes: [],
      settingNamespaceNodes: [],
      systemPrimitiveNodes: [],
      contentUnitNodes: [],
    },
  })
  const episode = graph.nodes.find((node) => node.id === 'production:pilot')
  const beat = graph.nodes.find((node) => node.id === 'segment:opening')
  const scene = graph.nodes.find((node) => node.id === 'scene_moment:rain_call')

  assert.equal(episode.domainCategory, 'timeline_namespace')
  assert.equal(episode.domainKind, 'episode')
  assert.equal(beat.domainCategory, 'timeline_namespace')
  assert.equal(beat.domainKind, 'beat')
  assert.equal(scene.domainCategory, 'system_primitive')
  assert.equal(scene.domainKind, 'scene_moment')
  assert.equal(contentCanvasNodeIsNamespace(episode), true)
  assert.equal(contentCanvasNodeCanUseCandidateFlow(episode), false)
  assert.equal(contentCanvasNodeCanGenerate(episode), false)
  assert.equal(contentCanvasNodeCanUseCandidateFlow(beat), false)
  assert.equal(contentCanvasNodeCanUseCandidateFlow(scene), true)
  assert.equal(contentCanvasNodeCanGenerate(scene), true)
})

test('content prompt canvas inline generation compiles prompt refs before choosing operation', () => {
  const source = readFileSync(new URL('../src/features/content/components/ContentPromptCanvasPanel.tsx', import.meta.url), 'utf8')

  assert.match(source, /onCandidatePromptPreview/)
  assert.doesNotMatch(source, /void onCandidatePromptPreview/)
  assert.match(source, /onPromptPreview=\{data\.onCandidatePromptPreview\}/)
  assert.match(source, /compiledPromptPreview\?\.referenceAssets/)
  assert.match(source, /contentCanvasGenerationOperationOptions\(mediaKind, promptReferenceAssets\)/)
  assert.match(source, /compiledPromptLoaded: onPromptPreview \? !compiledPromptPending/)
})

test('content prompt canvas does not recompile generation prompt on node drag identity churn', () => {
  const source = readFileSync(new URL('../src/features/content/components/ContentPromptCanvasPanel.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/features/content/components/ContentCanvasWorkspacePage.prompt-canvas.css', import.meta.url), 'utf8')

  assert.match(source, /contentPromptGenerationNodeKey/)
  assert.match(source, /promptPreviewTargetKey/)
  assert.match(source, /generationNodeKey/)
  assert.match(source, /reconcileCreativeFlowNodes/)
  assert.doesNotMatch(source, /\[generationPrompt, node, onPromptPreview/)
  assert.doesNotMatch(source, /setManualPositions/)
  assert.match(css, /\.content-prompt-flow-node[\s\S]*transition: none/)
  assert.doesNotMatch(css, /transition: width 180ms ease, transform 180ms ease/)
})

test('content prompt reference drops require choosing reference role before inserting typed token', () => {
  const panelSource = readFileSync(new URL('../src/features/content/components/ContentPromptCanvasPanel.tsx', import.meta.url), 'utf8')
  const editorSource = readFileSync(new URL('../src/features/content/components/ContentCanvasPromptReferences.tsx', import.meta.url), 'utf8')
  const nodeModelSource = readFileSync(new URL('../src/features/content/components/contentCanvasWorkspaceNodeModel.ts', import.meta.url), 'utf8')

  assert.match(panelSource, /GenerationReferenceRoleMenu/)
  assert.match(panelSource, /onReferenceDrop\(node, sourceNodeId, \{ x: event\.clientX, y: event\.clientY \}\)/)
  assert.match(panelSource, /appendReferenceToPromptTargetWithRole/)
  assert.match(editorSource, /PromptReferenceDropRoleMenu/)
  assert.match(editorSource, /insertAt: \{\s*value: dropRoleMenu\.promptValue/)
  assert.match(nodeModelSource, /role=\$\{normalizePromptReferenceMetadataValue\(options\.role\)\}/)
  assert.match(nodeModelSource, /media=\$\{normalizePromptReferenceMetadataValue\(options\.mediaType\)\}/)
})

test('content prompt and candidate generation use the shared call composer layout', () => {
  const promptPanelSource = readFileSync(new URL('../src/features/content/components/ContentPromptCanvasPanel.tsx', import.meta.url), 'utf8')
  const inspectorSource = readFileSync(new URL('../src/features/content/components/ContentCanvasInspectorParts.tsx', import.meta.url), 'utf8')
  const promptCss = readFileSync(new URL('../src/features/content/components/ContentCanvasWorkspacePage.prompt-canvas.css', import.meta.url), 'utf8')
  const inspectorCss = readFileSync(new URL('../src/features/content/components/ContentCanvasWorkspacePage.inspector-candidates.css', import.meta.url), 'utf8')

  assert.match(promptPanelSource, /\bGenerationCallComposerRoot\b/)
  assert.match(promptPanelSource, /\bGenerationCallPromptBlock\b/)
  assert.match(promptPanelSource, /\bGenerationCallConfigBlock\b/)
  assert.match(promptPanelSource, /\bGenerationCallMetaRow\b/)
  assert.match(promptPanelSource, /\bGenerationCallField\b/)
  assert.match(promptPanelSource, /\bGenerationCallBadge\b/)
  assert.match(promptPanelSource, /\bGenerationCallMessages\b/)
  assert.match(promptPanelSource, /\bGenerationCallFooter\b/)
  assert.match(promptPanelSource, /content-prompt-flow-node__generation-composer/)
  assert.match(promptPanelSource, /content-prompt-flow-node__generation-grid/)
  assert.match(promptCss, /\.content-prompt-flow-node__generation-composer/)
  assert.match(promptCss, /\.content-prompt-flow-node__generation-grid[\s\S]*grid-template-columns: minmax\(92px, 0\.75fr\) minmax\(82px, 0\.55fr\) minmax\(132px, 1\.15fr\)/)
  assert.match(promptCss, /\.content-prompt-flow-node__generation-params[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)

  assert.match(inspectorSource, /\bGenerationCallComposerRoot\b/)
  assert.match(inspectorSource, /\bGenerationCallPromptBlock\b/)
  assert.match(inspectorSource, /\bGenerationCallConfigBlock\b/)
  assert.match(inspectorSource, /\bGenerationCallMetaRow\b/)
  assert.match(inspectorSource, /\bGenerationCallField\b/)
  assert.match(inspectorSource, /\bGenerationCallBadge\b/)
  assert.match(inspectorSource, /\bGenerationCallMessages\b/)
  assert.match(inspectorSource, /\bGenerationCallFooter\b/)
  assert.match(inspectorSource, /content-canvas-generation-candidate-select/)
  assert.match(inspectorCss, /\.content-canvas-generation-candidate-dialog__body/)
  assert.match(inspectorCss, /\.content-canvas-generation-candidate-select/)
  assert.match(inspectorCss, /\.content-canvas-generation-candidate-dialog__actions/)
})

test('content canvas hierarchy prefers normalized domain parent edges over legacy namespace fields', () => {
  const production = indexedEntity('production', 'pilot', 'timeline/pilot/production.json', {
    id: 'pilot',
    title: 'Pilot',
    namespace_kind: 'episode',
  })
  const legacyWrongProduction = indexedEntity('production', 'legacy_wrong', 'timeline/legacy_wrong/production.json', {
    id: 'legacy_wrong',
    title: 'Legacy wrong',
    namespace_kind: 'episode',
  })
  const segment = indexedEntity('segment', 'opening', 'timeline/pilot/opening/segment.json', {
    id: 'opening',
    production_id: 'legacy_wrong',
    title: 'Opening',
    namespace_kind: 'beat',
  })
  const sceneMoment = indexedEntity('scene_moment', 'rain_call', 'timeline/pilot/opening/rain_call/scene_moment.json', {
    id: 'rain_call',
    segment_id: 'legacy_wrong_segment',
    title: 'Rain call',
  })
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [production, legacyWrongProduction],
    segments: [segment],
    sceneMoments: [sceneMoment],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [],
    keyframes: [],
    assets: [],
    settings: [],
    settingStates: [],
    audioCues: [],
    contentUnitCandidates: {},
    domainGraph: {
      nodes: [
        { category: 'timeline_namespace', kind: 'episode', id: 'pilot', path: production.path, title: 'Pilot', metadata: { entityKind: 'production' } },
        { category: 'timeline_namespace', kind: 'episode', id: 'legacy_wrong', path: legacyWrongProduction.path, title: 'Legacy wrong', metadata: { entityKind: 'production' } },
        { category: 'timeline_namespace', kind: 'beat', id: 'opening', path: segment.path, title: 'Opening', metadata: { entityKind: 'segment' } },
        { category: 'system_primitive', kind: 'scene_moment', id: 'rain_call', path: sceneMoment.path, title: 'Rain call', metadata: { entityKind: 'scene_moment' } },
      ],
      edges: [
        {
          source: { category: 'timeline_namespace', kind: 'beat', id: 'opening', path: segment.path },
          target: { category: 'timeline_namespace', kind: 'episode', id: 'pilot', path: production.path },
          relation: 'parent',
          origin: 'path',
        },
        {
          source: { category: 'system_primitive', kind: 'scene_moment', id: 'rain_call', path: sceneMoment.path },
          target: { category: 'timeline_namespace', kind: 'beat', id: 'opening', path: segment.path },
          relation: 'parent',
          origin: 'path',
        },
      ],
      timelineNamespaceNodes: [],
      settingNamespaceNodes: [],
      systemPrimitiveNodes: [],
      contentUnitNodes: [],
    },
  })
  const segmentNode = graph.nodes.find((node) => node.id === 'segment:opening')
  const sceneNode = graph.nodes.find((node) => node.id === 'scene_moment:rain_call')

  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'hierarchy'
    && edge.source === 'production:pilot'
    && edge.target === 'segment:opening',
  ), true)
  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'hierarchy'
    && edge.source === 'segment:opening'
    && edge.target === 'scene_moment:rain_call',
  ), true)
  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'hierarchy'
    && edge.source === 'production:legacy_wrong'
    && edge.target === 'segment:opening',
  ), false)
  assert.equal(segmentNode?.domainParentNodeId, 'production:pilot')
  assert.deepEqual(segmentNode?.domainAncestorNodeIds, ['production:pilot'])
  assert.equal(sceneNode?.domainParentNodeId, 'segment:opening')
  assert.deepEqual(sceneNode?.domainAncestorNodeIds, ['segment:opening', 'production:pilot'])
})

test('content canvas maps audio cue content units as system primitive production tasks', () => {
  const audioCue = indexedEntity('audio_cue', 'phone_buzz', 'timeline/pilot/opening/rain_call/audio_cues/phone_buzz/audio_cue.json', {
    id: 'phone_buzz',
    title: 'Phone buzz',
  })
  const contentUnit = indexedEntity('content_unit', 'cu_phone_buzz', 'content_units/cu_phone_buzz/content_unit.json', {
    id: 'cu_phone_buzz',
    title: 'Phone buzz audio',
    content_unit_type: 'audio_cue_ref',
    audio_cue_ref: 'phone_buzz',
    edit_prompt: { text: 'Create a short phone buzz sound.' },
  })
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [contentUnit],
    keyframes: [],
    assets: [],
    settings: [],
    settingStates: [],
    audioCues: [audioCue],
    contentUnitCandidates: {},
  })
  const audioNode = graph.nodes.find((node) => node.id === 'audio_cue:phone_buzz')

  assert.equal(audioNode.generationTask?.id, 'cu_phone_buzz')
  assert.equal(audioNode.generationTask?.contentUnitType, 'audio_cue_ref')
  assert.equal(audioNode.generationTask?.outputKind, 'audio')
  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'reference'
    && edge.relation === 'content_unit_audio_cue'
    && edge.source === 'content_unit:cu_phone_buzz'
    && edge.target === 'audio_cue:phone_buzz',
  ), true)
  assert.equal(graph.edges.find((edge) => edge.relation === 'content_unit_audio_cue')?.type, 'depends_on')
})

function indexedEntity(entityKind, id, path, record) {
  return {
    entityKind,
    id,
    path,
    record,
  }
}
