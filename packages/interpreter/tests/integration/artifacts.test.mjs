import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveMovScriptWorkspaceArtifacts,
} from '../../dist/index.js'
import {
  deriveMovScriptWorkspaceDomainIndex,
  queryMovScriptCanonicalEntities,
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
} from '../../../workspace/dist/index.js'

import {
  sourceDocuments,
} from '../helpers.mjs'

test('workspace domain indexes hierarchical source entities', () => {
  const index = deriveMovScriptWorkspaceDomainIndex(sourceDocuments())

  assert.equal(queryMovScriptWorkspaceSettings(index, { kind: 'character' }).length, 1)
  assert.equal(index.byKind.get('asset')?.length, 1)
  assert.equal(index.byKind.get('shot')?.length, 1)
  assert.equal(index.byKind.get('storyboard')?.length, 1)
  assert.equal(index.byKind.get('audio_cue')?.length, 1)
  assert.equal(index.byKind.get('content_unit')?.length, 3)
  assert.equal(index.byKind.get('expression_unit')?.length, 1)
  assert.equal(index.byKind.get('script')?.[0]?.path, 'scripts/main/script.json')
  assert.equal(index.documents.some((document) => document.path === 'scripts/main/script.md'), true)
  assert.equal(queryMovScriptCanonicalEntities(index).some((entity) => entity.path === 'scripts/main/script.md'), false)

  const assets = queryMovScriptWorkspaceAssets(index, {
    settingId: 'hero',
    settingStateId: 'rain',
    includeCandidates: true,
  })
  assert.equal(assets.assets.length, 1)
  assert.equal(assets.candidates?.length, 0)

  const context = queryMovScriptWorkspaceProductionContext(index, {
    productionId: 'p8f3',
    segmentId: 'a19d',
    sceneMomentId: 'r72k',
  })
  assert.equal(context.productions.length, 1)
  assert.equal(context.segments.length, 1)
  assert.equal(context.scene_moments.length, 1)
  assert.equal(context.storyboards.length, 1)
  assert.equal(context.audio_cues.length, 1)
  assert.equal(context.expression_units.length, 1)
  assert.equal(context.content_units.length, 3)
})

test('interpreter derived artifacts are derived from canonical source only', () => {
  const index = deriveMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [{
      entityKind: 'content_unit',
      id: 'k41m',
      path: 'content_units/k41m/content_unit.json',
      state: 'modified',
    }],
    semanticChanges: [{
      entity: { kind: 'content_unit', id: 'k41m' },
      kind: 'semantic_input_changed',
      businessKind: 'content_unit_changed',
      propagation: 'self',
      fields: ['edit_prompt.text'],
      sourceChange: { operation: 'modified', path: 'content_units/k41m/content_unit.json' },
    }],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  assert.equal(artifacts.domainTree.schema, 'movscript.domain-tree.v1')
  assert.equal(artifacts.assetIndex.schema, 'movscript.asset-index.v1')
  assert.equal(artifacts.relationGraph.schema, 'movscript.relation-graph.v1')
  assert.ok(artifacts.assetIndex.assets.some((asset) => asset.id === 'wet_hair' && asset.owner.id === 'rain'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'k41m' && relation.to.id === 'phone'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'k41m' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'cu_wet_hair_ref' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'scene_anchor' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'phone_vibration' && relation.to.id === 'r72k'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.transition.out === 'hold_then_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'audio_cue' && item.entity.id === 'phone_vibration' && item.cueKind === 'sound_effect'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'expression_unit' && item.entity.id === 'caption_1'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'shot' && item.entity.id === 'phone' && item.contentUnitIds.includes('k41m')))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'keyframe' && item.entity.id === 'scene_anchor' && item.contentUnitIds.includes('cu_scene_anchor_keyframe_ref')))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'content_unit' && item.entity.id === 'cu_scene_anchor_keyframe_ref' && item.parentId === 'keyframe:scene_anchor'))
  assert.deepEqual(artifacts.impactReport.changedEntities[0].businessImpacts, ['Content unit changed'])
  assert.ok(artifacts.impactReport.changedEntities[0].editorImpacts.some((impact) => impact.includes('Content production context')))
  assert.equal(artifacts.contentUnitArtifacts.length, 3)
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel.content_unit_type, 'shot_ref')
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_scene_anchor_keyframe_ref')?.runtimePanel.content_unit_type, 'keyframe_ref')
})

test('interpreter impact report traces planning and asset changes to affected content units', () => {
  const index = deriveMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [
      {
        entityKind: 'storyboard',
        id: 'main',
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main/storyboard.json',
        state: 'modified',
      },
      {
        entityKind: 'asset',
        id: 'wet_hair',
        path: 'settings/hero/states/rain/assets/wet_hair/asset.json',
        state: 'modified',
      },
      {
        entityKind: 'keyframe',
        id: 'scene_anchor',
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/scene_anchor/keyframe.json',
        state: 'modified',
      },
    ],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const storyboardChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'storyboard')
  const assetChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'asset')
  const keyframeChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'keyframe')

  assert.equal(storyboardChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), false)
  assert.equal(storyboardChange?.staleMarkers.includes('content_unit:k41m:planning_context_changed'), false)
  assert.equal(assetChange?.affectedContentUnits.length, 0)
  assert.equal(assetChange?.staleMarkers.length, 0)
  assert.equal(keyframeChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), false)
  assert.equal(keyframeChange?.staleMarkers.includes('content_unit:k41m:visual_anchor_changed'), false)
})

test('content unit artifacts derive runtime panels from edit_prompt plus adapter context', () => {
  const index = deriveMovScriptWorkspaceDomainIndex(sourceDocuments())

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const assetRef = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_wet_hair_ref')
  const video = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')

  assert.equal(assetRef?.runtimePanel.output_kind, 'image')
  assert.match(assetRef?.runtimePanel.prompt?.text ?? '', /Cold phone light reference/)
  assert.equal(video?.runtimePanel.output_kind, 'video')
  assert.match(video?.runtimePanel.prompt?.text ?? '', /Cold phone light on frightened face/)
  assert.match(video?.runtimePanel.prompt?.text ?? '', /\{\{shot:phone\}\}/)
  assert.match(video?.runtimePanel.prompt?.text ?? '', /\{\{asset:wet_hair\}\}/)
  assert.equal(video?.runtimePanel.prompt?.negative_text, 'cartoon')
  assert.equal(video?.runtimePanel.runtime_request?.inputs.length, 0)
  assert.equal(video?.runtimePanel.status, 'blocked')
  assert.equal(video?.runtimePanel.input_version, undefined)
  assert.equal(video?.runtimePanel.dependency_hashes, undefined)
  assert.equal(video?.runtimePanel.hash_rule, undefined)
  assert.equal(video?.runtimePanel.upstream_selections, undefined)
  assert.equal(video?.generationPrompt.refs.some((ref) => ref.kind === 'shot' && ref.id === 'phone' && ref.role === 'primary'), true)
  assert.equal(video?.generationPrompt.refs.some((ref) => ref.kind === 'asset' && ref.id === 'wet_hair' && ref.role === 'input'), true)
  assert.ok(video?.dependencyReport.blockers?.some((blocker) => blocker.code === 'upstream_selection_missing'))
})
