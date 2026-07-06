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
  agentContentCandidateResourceIds,
  agentImpactPreviewTimelineHref,
} from '../dist/react.js'
import {
  createHostedProjectSurfaceRuntime,
  projectSurfaceContextCommandEnvelope,
  unwrapProjectSurfaceGatewayResult,
} from '../dist/runtime.js'

function readContentPromptCanvasPanelSource() {
  return [
    'ContentPromptCanvasPanel.tsx',
    'ContentPromptCanvasPanelParts.tsx',
    'ContentPromptCanvasPanelModel.tsx',
  ]
    .map((fileName) => readFileSync(new URL(`../src/features/content/components/${fileName}`, import.meta.url), 'utf8'))
    .join('\n')
}

test('project surface exposes studio routes independent of legacy agent routes', () => {
  assert.equal(PROJECT_SURFACE_ROUTES.overview, '/studio/:projectKey/overview')
  assert.equal(PROJECT_SURFACE_ROUTES.progress, '/studio/:projectKey/progress')
  assert.equal(PROJECT_SURFACE_ROUTES.dailies, '/studio/:projectKey/dailies')
  assert.equal(PROJECT_SURFACE_ROUTES.scripts, '/studio/:projectKey/scripts')
  assert.equal(PROJECT_SURFACE_ROUTES.standards, '/studio/:projectKey/standards')
  assert.equal(PROJECT_SURFACE_ROUTES.content, '/studio/:projectKey/content')
  assert.equal(PROJECT_SURFACE_ROUTES.contentCanvas, '/studio/:projectKey/content/canvas')
  assert.equal(PROJECT_SURFACE_ROUTES.contentPreview, '/studio/:projectKey/content/preview')
  assert.equal(PROJECT_SURFACE_ROUTES.remotionStudio, '/studio/:projectKey/remotion-studio')
  assert.equal(projectSurfacePath('overview', 'rain/night'), '/studio/rain%2Fnight/overview')
  assert.equal(projectSurfacePath('scripts', 'rain/night'), '/studio/rain%2Fnight/scripts')
  assert.equal(projectSurfacePath('standards', 'rain/night'), '/studio/rain%2Fnight/standards')
  assert.equal(projectSurfacePath('content', 'rain/night'), '/studio/rain%2Fnight/content')
  assert.equal(projectSurfacePath('contentCanvas', 'rain/night'), '/studio/rain%2Fnight/content/canvas')
  assert.equal(projectSurfacePath('contentPreview', 'rain/night'), '/studio/rain%2Fnight/content/preview')
  assert.equal(projectSurfacePath('remotionStudio', 'rain/night'), '/studio/rain%2Fnight/remotion-studio')
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

test('remotion studio shell reveal uses a single host event path', () => {
  const source = readFileSync(new URL('../src/components/remotion/ProjectRemotionStudioSurface.tsx', import.meta.url), 'utf8')

  assert.match(source, /async function revealRemotionShellSession\(shellGateway: ShellGateway, sessionId: string\): Promise<void>/)
  assert.match(source, /if \(shellGateway\.reveal\) \{[\s\S]*await shellGateway\.reveal\(\{ sessionId \}\)[\s\S]*return[\s\S]*\}/)
  assert.match(source, /requestHostShellWorkbenchReveal\(sessionId\)/)
  assert.doesNotMatch(source, /await shellGateway\.reveal\(\{ sessionId: activeShellSessionId \}\)[\s\S]*requestHostShellWorkbenchReveal\(activeShellSessionId\)/)
  assert.doesNotMatch(source, /await shellGateway\.reveal\?\.\(\{ sessionId: existingJob\.sessionId \}\)[\s\S]*requestHostShellWorkbenchReveal\(existingJob\.sessionId\)/)
})

test('project picker derives project list URL from daemon gateway before legacy apiV1BaseURL', () => {
  const source = readFileSync(new URL('../src/components/home/ProjectPickerSurface.tsx', import.meta.url), 'utf8')

  assert.match(source, /gatewayBaseURL\?: string/, 'ProjectPickerSurface must expose gatewayBaseURL as the primary runtime base')
  assert.match(source, /@deprecated Use gatewayBaseURL/, 'ProjectPickerSurface legacy apiV1BaseURL must be marked deprecated')
  assert.match(source, /const projectsAPIBaseURL = projectPickerProjectsAPIBaseURL\(\{ gatewayBaseURL, apiV1BaseURL \}\)/)
  assert.match(source, /fetch\(`\$\{projectsAPIBaseURL\}\/projects`\)/)
  assert.match(source, /return gateway\.endsWith\('\/api\/v1'\) \? gateway : `\$\{gateway\}\/api\/v1`/)
  assert.doesNotMatch(source, /fetch\(`\$\{trimTrailingSlash\(apiV1BaseURL\)\}/, 'ProjectPickerSurface must not fetch directly from legacy apiV1BaseURL')
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
      projectKey: 'chang-an-rain-night',
      projectId: 'chang-an-rain-night',
      params: { contentUnitId: '04_chase_video' },
      reason: 'review candidates',
      source: 'agent',
    },
  )
})

test('agent content candidate surface preloads every output resource', () => {
  const ids = agentContentCandidateResourceIds({
    data: {
      candidate_visibility: {
        content_unit_candidates: [
          {
            id: 'candidate_group',
            outputs: [
              { resource_id: 101 },
              { resourceId: '102' },
              { resource_id: 101 },
            ],
          },
          {
            id: 'candidate_single',
            outputs: [{ resource_id: 103 }],
          },
        ],
      },
    },
  })

  assert.deepEqual(ids, [101, 102, 103])
})

test('agent surface params carry normalized production scope focus', () => {
  const params = new URLSearchParams({
    projectId: 'project-a',
    scopeKind: 'production',
    scopeRef: 'pilot',
  })

  const query = agentSurfaceParams(params)
  assert.equal(query.productionId, 'pilot')

  const focus = agentSurfaceDomainFocus(query)
  assert.equal(focus.target, undefined)
  assert.equal(focus.scope?.kind, 'production')
  assert.equal(agentSurfaceFocusLabel(focus), 'production: pilot')
  assert.equal(agentSurfaceLegacyProductionId(focus), 'pilot')
  assert.equal(agentSurfaceHasTimelineFocus(focus), true)
})

test('agent surface params keep non-production scopes out of legacy production projection', () => {
  const params = new URLSearchParams({
    projectId: 'project-a',
    scopeKind: 'episode',
    scopeRef: 'ep01',
  })

  const query = agentSurfaceParams(params)
  assert.equal(query.productionId, undefined)

  const focus = agentSurfaceDomainFocus(query)
  assert.equal(focus.target, undefined)
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
  assert.equal(query.get('targetKind'), null)
  assert.equal(query.get('targetRef'), null)
})

test('impact preview links use timeline scope before legacy production path', () => {
  const scopedHref = agentImpactPreviewTimelineHref({
    item: {
      scope_kind: 'episode',
      scope_ref: 'ep02',
    },
    params: new URLSearchParams('productionId=pilot'),
    fallbackProjectId: 'project-a',
  })
  const scopedQuery = new URL(`http://surface.test${scopedHref}`).searchParams

  assert.equal(scopedQuery.get('productionId'), null)
  assert.equal(scopedQuery.get('scopeKind'), 'episode')
  assert.equal(scopedQuery.get('scopeRef'), 'ep02')
  assert.equal(scopedQuery.get('targetRef'), null)

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
  assert.equal(legacyQuery.get('targetRef'), null)
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
  const beat = graph.nodes.find((node) => node.id === 'segment:pilot/opening')
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
  const source = readContentPromptCanvasPanelSource()

  assert.match(source, /onCandidatePromptPreview/)
  assert.doesNotMatch(source, /void onCandidatePromptPreview/)
  assert.match(source, /onPromptPreview=\{data\.onCandidatePromptPreview\}/)
  assert.match(source, /compiledPromptPreview\?\.referenceAssets/)
  assert.match(source, /contentCanvasGenerationOperationOptions\(mediaKind, promptReferenceAssets\)/)
  assert.match(source, /compiledPromptLoaded: onPromptPreview \? !compiledPromptPending/)
})

test('content prompt canvas does not recompile generation prompt on node drag identity churn', () => {
  const source = readContentPromptCanvasPanelSource()
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

test('content prompt reference drops add reference pool entries instead of inserting prompt tokens', () => {
  const panelSource = readContentPromptCanvasPanelSource()
  const editorSource = readFileSync(new URL('../src/features/content/components/ContentCanvasPromptReferences.tsx', import.meta.url), 'utf8')
  const nodeModelSource = readFileSync(new URL('../src/features/content/components/contentCanvasWorkspaceNodeModel.ts', import.meta.url), 'utf8')

  assert.match(panelSource, /GenerationReferenceRoleMenu/)
  assert.match(panelSource, /onReferenceDrop\(node, sourceNodeId, \{ x: event\.clientX, y: event\.clientY \}\)/)
  assert.match(panelSource, /appendReferenceToPromptTargetWithRole/)
  assert.match(panelSource, /onGenerationReferenceAppend\(targetNode, sourceNode/)
  assert.doesNotMatch(panelSource, /appendContentNodeReferenceToPrompt/)
  assert.match(editorSource, /referenceItems/)
  assert.match(editorSource, /filterPromptMentionOptions/)
  assert.doesNotMatch(editorSource, /insertAt: \{\s*value: dropRoleMenu\.promptValue/)
  assert.match(nodeModelSource, /generationReferencesFromContentNode/)
  assert.match(nodeModelSource, /upsertContentNodeGenerationReference/)
})

test('content prompt and candidate generation use the shared call composer layout', () => {
  const promptPanelSource = readContentPromptCanvasPanelSource()
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
  assert.match(promptCss, /\.content-prompt-flow-node__generation-grid[\s\S]*display: flex/)
  assert.match(promptCss, /\.content-prompt-flow-node__generation-params[\s\S]*flex-wrap: wrap/)

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
  const segmentNode = graph.nodes.find((node) => node.id === 'segment:pilot/opening')
  const sceneNode = graph.nodes.find((node) => node.id === 'scene_moment:rain_call')

  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'hierarchy'
    && edge.source === 'production:pilot'
    && edge.target === 'segment:pilot/opening',
  ), true)
  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'hierarchy'
    && edge.source === 'segment:pilot/opening'
    && edge.target === 'scene_moment:rain_call',
  ), true)
  assert.equal(graph.edges.some((edge) =>
    edge.kind === 'hierarchy'
    && edge.source === 'production:legacy_wrong'
    && edge.target === 'segment:pilot/opening',
  ), false)
  assert.equal(segmentNode?.domainParentNodeId, 'production:pilot')
  assert.deepEqual(segmentNode?.domainAncestorNodeIds, ['production:pilot'])
  assert.equal(sceneNode?.domainParentNodeId, 'segment:pilot/opening')
  assert.deepEqual(sceneNode?.domainAncestorNodeIds, ['segment:pilot/opening', 'production:pilot'])
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
