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
} from '../dist/react.js'

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

test('project scripts surface reads script selection from router search params', () => {
  const source = readFileSync(new URL('../src/components/scripts/ProjectScriptsSurface.tsx', import.meta.url), 'utf8')
  const routeSource = readFileSync(new URL('../src/components/routes/ProjectSurfaceRouteView.tsx', import.meta.url), 'utf8')

  assert.match(source, /params\?: URLSearchParams/)
  assert.match(source, /selectedScriptIdFromSearchParams\(params\)/)
  assert.match(routeSource, /<ProjectScriptsSurface params=\{params\} \/>/)
  assert.doesNotMatch(source, /window\.location\.search/)
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
