import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveRelationGraph,
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
  const documents = sourceDocuments()
  documents.push({
    path: 'content_units/cu_opening_assembly/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_assembly',
      title: 'Opening assembly',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:segment:a19d',
      edit_prompt: { text: 'Compose the opening assembly.' },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)

  assert.equal(queryMovScriptWorkspaceSettings(index, { kind: 'character' }).length, 1)
  assert.equal(index.byKind.get('asset')?.length, 1)
  assert.equal(index.byKind.get('storyboard')?.length, 1)
  assert.equal(index.byKind.get('audio_cue')?.length, 1)
  assert.equal(index.byKind.get('content_unit')?.length, 4)
  assert.equal(index.byKind.get('expression_unit')?.length, 2)
  assert.equal(index.byKind.get('script')?.[0]?.path, 'scripts/main/script.json')
  assert.equal(index.documents.some((document) => document.path === 'scripts/main/script.md'), true)
  assert.equal(queryMovScriptCanonicalEntities(index).some((entity) => entity.path === 'scripts/main/script.md'), false)
  assert.equal(index.domainNodes.find((node) => node.path === 'productions/p8f3/production.json')?.category, 'timeline_namespace')
  assert.equal(index.domainNodes.find((node) => node.path === 'settings/hero/setting.json')?.kind, 'character')
  assert.equal(index.domainNodes.find((node) => node.path === 'productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json')?.category, 'system_primitive')
  assert.ok(index.domainEdges.some((edge) => edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.path === 'productions/p8f3/segments/a19d/segment.json'
    && edge.target.path === 'productions/p8f3/production.json'))
  assert.ok(index.domainEdges.some((edge) => edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.path === 'productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json'
    && edge.target.path === 'productions/p8f3/segments/a19d/segment.json'))
  assert.ok(index.domainEdges.some((edge) => edge.origin === 'path'
    && edge.relation === 'parent'
    && edge.source.path === 'settings/hero/states/rain/assets/wet_hair/asset.json'
    && edge.target.path === 'settings/hero/states/rain/setting_state.json'))
  assert.ok(index.domainEdges.some((edge) => edge.origin === 'explicit_ref'
    && edge.relation === 'target'
    && edge.source.id === 'cu_opening_assembly'
    && edge.target.category === 'timeline_assembly'
    && edge.target.kind === 'timeline_assembly'
    && edge.target.id === 'timeline_assembly:segment:a19d'
    && edge.field === 'target_ref'))
  assert.ok(index.domainEdges.some((edge) => edge.origin === 'explicit_ref'
    && edge.relation === 'scope'
    && edge.source.id === 'cu_opening_assembly'
    && edge.target.category === 'timeline_namespace'
    && edge.target.id === 'a19d'
    && edge.target.kind === 'segment'
    && edge.field === 'target_ref'))

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
  assert.equal(context.expression_units.length, 2)
  assert.equal(context.content_units.length, 4)
})

test('relation graph fallback derives content unit target and scope through domain normalizers', () => {
  const documents = sourceDocuments()
  documents.push({
    path: 'content_units/cu_opening_assembly/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_assembly',
      title: 'Opening assembly',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:segment:a19d',
      edit_prompt: { text: 'Compose the opening assembly.' },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const graph = deriveRelationGraph({ ...index, domainEdges: [] })

  assert.ok(graph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_opening_assembly'
    && relation.to.entityKind === 'timeline_assembly'
    && relation.to.id === 'timeline_assembly:segment:a19d'
    && relation.field === 'target_ref'))
  assert.ok(graph.relations.some((relation) => relation.type === 'uses'
    && relation.from.id === 'cu_opening_assembly'
    && relation.to.entityKind === 'segment'
    && relation.to.id === 'a19d'
    && relation.field === 'target_ref'))
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
  const productionNode = findDomainTreeNode(artifacts.domainTree.roots, 'production', 'p8f3')
  const settingNode = findDomainTreeNode(artifacts.domainTree.roots, 'setting', 'hero')
  const sceneMomentNode = findDomainTreeNode(artifacts.domainTree.roots, 'scene_moment', 'r72k')
  assert.equal(productionNode?.nodeCategory, 'timeline_namespace')
  assert.equal(productionNode?.nodeKind, 'production')
  assert.equal(settingNode?.nodeCategory, 'setting_namespace')
  assert.equal(settingNode?.nodeKind, 'character')
  assert.equal(sceneMomentNode?.nodeCategory, 'system_primitive')
  assert.equal(sceneMomentNode?.nodeKind, 'scene_moment')
  assert.equal(artifacts.assetIndex.schema, 'movscript.asset-index.v1')
  assert.equal(artifacts.relationGraph.schema, 'movscript.relation-graph.v1')
  assert.ok(artifacts.assetIndex.assets.some((asset) => asset.id === 'wet_hair' && asset.owner.id === 'rain'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'k41m' && relation.to.id === 'phone'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'k41m' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'cu_wet_hair_ref' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'scene_anchor' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'phone_vibration' && relation.to.id === 'r72k'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_scene_anchor_keyframe_ref'
    && relation.to.entityKind === 'keyframe'
    && relation.to.id === 'scene_anchor'
    && relation.field === 'keyframe_ref'))
  assert.equal(artifacts.relationGraph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_scene_anchor_keyframe_ref'
    && relation.field === 'target_ref'), false)
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.transition.out === 'hold_then_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'audio_cue' && item.entity.id === 'phone_vibration' && item.cueKind === 'sound_effect'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'expression_unit' && item.entity.id === 'caption_1'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'expression_unit' && item.entity.id === 'phone' && item.contentUnitIds.includes('k41m')))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'keyframe' && item.entity.id === 'scene_anchor' && item.contentUnitIds.includes('cu_scene_anchor_keyframe_ref')))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'content_unit' && item.entity.id === 'cu_scene_anchor_keyframe_ref' && item.parentId === 'keyframe:scene_anchor'))
  assert.deepEqual(artifacts.impactReport.changedEntities[0].businessImpacts, ['Content unit changed'])
  assert.ok(artifacts.impactReport.changedEntities[0].editorImpacts.some((impact) => impact.includes('Content production context')))
  assert.equal(artifacts.contentUnitArtifacts.length, 3)
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel.content_unit_type, 'expression_unit_ref')
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_scene_anchor_keyframe_ref')?.runtimePanel.content_unit_type, 'keyframe_ref')
  assert.equal(artifacts.productionWorkPlan.schema, 'movscript.production_work_plan.v1')
  assert.ok(artifacts.productionWorkPlan.items.some((item) => item.kind === 'edit_structure'
    && item.status === 'blocked'
    && item.target.id === 'k41m'
    && item.blockers.some((blocker) => blocker.code === 'upstream_selection_missing')))
  assert.ok(artifacts.productionWorkPlan.items.some((item) => item.kind === 'generate_candidates'
    && item.status === 'ready'
    && item.target.id === 'cu_wet_hair_ref'))
})

function findDomainTreeNode(nodes, entityKind, id) {
  for (const node of nodes) {
    if (node.entityKind === entityKind && String(node.id ?? '') === String(id)) return node
    const child = findDomainTreeNode(node.children ?? [], entityKind, id)
    if (child) return child
  }
  return undefined
}

test('interpreter carries active provider asset certification for selected asset refs', () => {
  const documents = sourceDocuments()
  const assetDocument = documents.find((document) => document.path === 'settings/hero/states/rain/assets/wet_hair/asset.json')
  assert.ok(assetDocument)
  assetDocument.data.provider_certifications = {
    seedance2: {
      status: 'active',
      hub_asset_id: 'sd2_asset_hero_wet_hair',
      asset_uri: 'asset://sd2_asset_hero_wet_hair',
      source_resource_id: 101,
      source_candidate_id: 'candidate_wet_hair_1',
      certified_at: '2026-06-07T00:00:00.000Z',
    },
  }
  const assetPromptSnapshot = {
    schema: 'movscript.content_unit_prompt.v1',
    content_unit_ref: 'content_units/cu_wet_hair_ref',
    content_unit_id: 'cu_wet_hair_ref',
    content_unit_type: 'asset_ref',
    output_kind: 'image',
    adapter_version: 'asset_ref@2',
    edit_prompt: {
      text: 'Cold phone light reference for wet hair continuity.',
      negative_text: 'cartoon',
    },
    model_intent: { capability: 'image', aspect_ratio: '1:1' },
    refs: [],
    runtime_request: {
      capability: 'image',
      model_intent: { capability: 'image', aspect_ratio: '1:1' },
      inputs: [],
    },
    created_at: '2026-06-07T00:00:00.000Z',
  }
  documents.push({
    path: 'content_units/cu_wet_hair_ref/candidates/candidate_wet_hair_1/content_candidate.json',
    data: {
      schema: 'movscript.content_candidate.v1',
      id: 'candidate_wet_hair_1',
      content_unit_ref: 'content_units/cu_wet_hair_ref',
      outputs: [{ kind: 'image', resource_id: 101, artifact_ref: 'resource_wet_hair_1' }],
      prompt_snapshot: assetPromptSnapshot,
    },
  })
  documents.push({
    path: '.movscript/decisions/content_units/cu_wet_hair_ref/decision_context.json',
    data: {
      schema: 'movscript.decision_context.v1',
      target_kind: 'content_unit',
      target_ref: 'content_units/cu_wet_hair_ref',
      selection: {
        candidate_id: 'candidate_wet_hair_1',
        resource_id: 101,
        selected_at: '2026-06-07T00:00:01.000Z',
      },
    },
  })

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index: deriveMovScriptWorkspaceDomainIndex(documents),
    changedEntities: [],
    semanticChanges: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:02.000Z',
  })
  const videoPrompt = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.generationPrompt
  const assetInput = videoPrompt?.runtime_request.inputs.find((input) => input.role === 'asset_ref')

  assert.equal(assetInput?.resource_id, 101)
  assert.equal(assetInput?.provider_asset?.provider, 'seedance2')
  assert.equal(assetInput?.provider_asset?.asset_uri, 'asset://sd2_asset_hero_wet_hair')
  assert.equal(videoPrompt?.refs[0]?.selection?.provider_asset?.hub_asset_id, 'sd2_asset_hero_wet_hair')
})

test('interpreter tracks production_ref and segment_ref content units as video outputs', () => {
  const documents = sourceDocuments()
  documents.push({
    path: 'content_units/cu_opening_video/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_video',
      title: 'Opening segment video',
      content_unit_type: 'segment_ref',
      output_kind: 'video',
      target_kind: 'segment',
      target_ref: 'productions/p8f3/segments/a19d',
      segment_ref: 'a19d',
      edit_prompt: { text: 'Compose the opening segment video.' },
    },
  })
  documents.push({
    path: 'content_units/cu_episode_final/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_episode_final',
      title: 'Episode final video',
      content_unit_type: 'production_ref',
      output_kind: 'video',
      target_kind: 'production',
      target_ref: 'p8f3',
      production_ref: 'p8f3',
      edit_prompt: { text: 'Compose final episode using {{segment:a19d}}.' },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [{
      entityKind: 'production',
      id: 'p8f3',
      path: 'productions/p8f3/production.json',
      state: 'modified',
    }],
    semanticChanges: [{
      entity: { kind: 'production', id: 'p8f3' },
      kind: 'semantic_input_changed',
      businessKind: 'production_structure_changed',
      propagation: 'downstream_reference',
      fields: ['*'],
      sourceChange: { operation: 'modified', path: 'productions/p8f3/production.json' },
    }],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const productionArtifact = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_episode_final')
  const segmentArtifact = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_opening_video')
  assert.equal(productionArtifact?.runtimePanel.content_unit_type, 'production_ref')
  assert.equal(productionArtifact?.runtimePanel.output_kind, 'video')
  assert.equal(productionArtifact?.runtimePanel.status, 'blocked')
  assert.equal(productionArtifact?.dependencyReport.blockers?.some((blocker) => blocker.code === 'upstream_selection_missing'), true)
  assert.equal(segmentArtifact?.runtimePanel.content_unit_type, 'segment_ref')
  assert.equal(segmentArtifact?.runtimePanel.output_kind, 'video')
  assert.equal(segmentArtifact?.runtimePanel.status, 'ready')
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses'
    && relation.from.id === 'cu_episode_final'
    && relation.to.entityKind === 'production'
    && relation.to.id === 'p8f3'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_episode_final'
    && relation.to.entityKind === 'timeline_assembly'
    && relation.to.id === 'timeline_assembly:production:p8f3'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses'
    && relation.from.id === 'cu_episode_final'
    && relation.to.entityKind === 'segment'
    && relation.to.id === 'a19d'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_opening_video'
    && relation.to.entityKind === 'timeline_assembly'
    && relation.to.id === 'timeline_assembly:segment:a19d'))
  const changedProduction = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'production' && entity.id === 'p8f3')
  assert.equal(changedProduction?.affectedContentUnits.some((entity) => entity.id === 'cu_episode_final'), true)
})

test('interpreter tracks timeline_assembly_ref as canonical namespace scope video output', () => {
  const documents = sourceDocuments()
  documents.push({
    path: 'content_units/cu_opening_video/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_video',
      title: 'Opening segment video',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:segment:a19d',
      edit_prompt: { text: 'Compose the opening segment video.' },
    },
  })
  documents.push({
    path: 'content_units/cu_episode_final/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_episode_final',
      title: 'Episode final video',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:production:p8f3',
      edit_prompt: { text: 'Compose final episode using {{segment:a19d}}.' },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    semanticChanges: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const productionArtifact = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_episode_final')
  const segmentArtifact = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_opening_video')
  assert.equal(productionArtifact?.runtimePanel.content_unit_type, 'timeline_assembly_ref')
  assert.equal(productionArtifact?.runtimePanel.output_kind, 'video')
  assert.equal(productionArtifact?.runtimePanel.status, 'blocked')
  assert.equal(productionArtifact?.dependencyReport.blockers?.some((blocker) => blocker.code === 'upstream_selection_missing'), true)
  assert.equal(segmentArtifact?.runtimePanel.content_unit_type, 'timeline_assembly_ref')
  assert.equal(segmentArtifact?.runtimePanel.output_kind, 'video')
  assert.equal(segmentArtifact?.runtimePanel.status, 'ready')
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_episode_final'
    && relation.to.entityKind === 'timeline_assembly'
    && relation.to.id === 'timeline_assembly:production:p8f3'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses'
    && relation.from.id === 'cu_episode_final'
    && relation.to.entityKind === 'production'
    && relation.to.id === 'p8f3'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'targets'
    && relation.from.id === 'cu_opening_video'
    && relation.to.entityKind === 'timeline_assembly'
    && relation.to.id === 'timeline_assembly:segment:a19d'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses'
    && relation.from.id === 'cu_opening_video'
    && relation.to.entityKind === 'segment'
    && relation.to.id === 'a19d'))
})

test('generic content unit artifacts report namespace target issues', () => {
  const documents = sourceDocuments()
  documents.push({
    path: 'content_units/cu_namespace_target/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_namespace_target',
      title: 'Namespace target',
      content_unit_type: 'custom_video',
      output_kind: 'video',
      target_kind: 'production',
      target_ref: 'p8f3',
      edit_prompt: { text: 'Generic provider-specific video task.' },
    },
  })

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index: deriveMovScriptWorkspaceDomainIndex(documents),
    changedEntities: [],
    semanticChanges: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const artifact = artifacts.contentUnitArtifacts.find((item) => item.contentUnitId === 'cu_namespace_target')
  assert.equal(artifact?.runtimePanel.adapter_version, 'generic_prompt@1')
  assert.ok(artifact?.dependencyReport.issues.some((issue) => issue.message.includes('namespace production cannot be a content unit target')))
})

test('production work plan derives candidate selection and stale review items in memory', () => {
  const documents = sourceDocuments()
  documents.push({
    path: '.movscript/decisions/content_units/cu_wet_hair_ref/decision_context.json',
    data: {
      schema: 'movscript.decision_context.v1',
      target_kind: 'content_unit',
      target_ref: 'content_units/cu_wet_hair_ref',
      candidates: [{
        schema: 'movscript.content_candidate.v1',
        id: 'candidate_wet_hair_1',
        content_unit_ref: 'content_units/cu_wet_hair_ref',
	        outputs: [{ kind: 'image', resource_id: 101, artifact_ref: 'resource_wet_hair_1' }],
        prompt_snapshot: {
          schema: 'movscript.content_unit_prompt.v1',
          content_unit_ref: 'content_units/cu_wet_hair_ref',
          content_unit_id: 'cu_wet_hair_ref',
          content_unit_type: 'asset_ref',
          output_kind: 'image',
          adapter_version: 'asset_ref@1',
          refs: [],
          runtime_request: { capability: 'image', inputs: [] },
          created_at: '2026-06-06T00:00:00.000Z',
        },
      }],
    },
  })
  documents.push({
    path: '.movscript/decisions/content_units/cu_scene_anchor_keyframe_ref/decision_context.json',
    data: {
      schema: 'movscript.decision_context.v1',
      target_kind: 'content_unit',
      target_ref: 'content_units/cu_scene_anchor_keyframe_ref',
      candidates: [{
        schema: 'movscript.content_candidate.v1',
        id: 'candidate_anchor_1',
        content_unit_ref: 'content_units/cu_scene_anchor_keyframe_ref',
	        outputs: [{ kind: 'image', resource_id: 102, artifact_ref: 'resource_anchor_1' }],
        prompt_snapshot: {
          schema: 'movscript.content_unit_prompt.v1',
          content_unit_ref: 'content_units/cu_scene_anchor_keyframe_ref',
          content_unit_id: 'cu_scene_anchor_keyframe_ref',
          content_unit_type: 'keyframe_ref',
          output_kind: 'image',
          adapter_version: 'keyframe_ref@1',
          edit_prompt: { text: 'Old prompt.' },
          refs: [],
          runtime_request: { capability: 'image', inputs: [] },
          created_at: '2026-06-06T00:00:00.000Z',
        },
      }],
      selection: {
        candidate_id: 'candidate_anchor_1',
	        resource_id: 102,
	        artifact_ref: 'resource_anchor_1',
        stale_policy: 'strict',
      },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const selectItem = artifacts.productionWorkPlan.items.find((item) => item.kind === 'select_candidate' && item.target.id === 'cu_wet_hair_ref')
  const staleItem = artifacts.productionWorkPlan.items.find((item) => item.kind === 'review_stale_selection' && item.target.id === 'cu_scene_anchor_keyframe_ref')

  assert.equal(selectItem?.status, 'ready')
  assert.equal(selectItem?.recommended_actor, 'human')
  assert.equal(selectItem?.evidence?.candidateCount, 1)
  assert.equal(staleItem?.status, 'open')
  assert.equal(staleItem?.recommended_actor, 'human')
  assert.ok(Array.isArray(staleItem?.evidence?.staleReasons))
  assert.ok(staleItem?.actions.some((action) => action.type === 'accept_stale'))
})

test('interpreter impact report traces planning and asset changes to affected content units', () => {
  const index = deriveMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [
      {
        entityKind: 'storyboard',
        id: 'main',
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/storyboards/main/storyboard.json',
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
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json',
        state: 'modified',
      },
    ],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const storyboardChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'storyboard')
  const assetChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'asset')
  const keyframeChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'keyframe')

  assert.equal(storyboardChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), true)
  assert.equal(storyboardChange?.staleMarkers.includes('content_unit:k41m:planning_context_changed'), true)
  assert.equal(assetChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), true)
  assert.equal(assetChange?.affectedContentUnits.some((entity) => entity.id === 'cu_wet_hair_ref'), true)
  assert.equal(assetChange?.staleMarkers.includes('content_unit:k41m:setting_context_changed'), true)
  assert.equal(keyframeChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), true)
  assert.equal(keyframeChange?.affectedContentUnits.some((entity) => entity.id === 'cu_scene_anchor_keyframe_ref'), true)
  assert.equal(keyframeChange?.staleMarkers.includes('content_unit:k41m:visual_anchor_changed'), true)
})

test('interpreter impact report propagates namespace context changes through relation graph', () => {
  const documents = sourceDocuments()
  documents.push({
    path: 'content_units/cu_opening_assembly/content_unit.json',
    data: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_assembly',
      title: 'Opening assembly',
      content_unit_type: 'timeline_assembly_ref',
      output_kind: 'video',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:segment:a19d',
      edit_prompt: { text: 'Compose the opening assembly.' },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [
      {
        entityKind: 'production',
        id: 'p8f3',
        path: 'productions/p8f3/production.json',
        state: 'modified',
      },
      {
        entityKind: 'segment',
        id: 'a19d',
        path: 'productions/p8f3/segments/a19d/segment.json',
        state: 'modified',
      },
      {
        entityKind: 'setting_state',
        id: 'rain',
        path: 'settings/hero/states/rain/setting_state.json',
        state: 'modified',
      },
    ],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const productionChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'production')
  const segmentChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'segment')
  const settingStateChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'setting_state')

  assert.equal(productionChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), true)
  assert.equal(productionChange?.affectedContentUnits.some((entity) => entity.id === 'cu_scene_anchor_keyframe_ref'), true)
  assert.equal(productionChange?.affectedContentUnits.some((entity) => entity.id === 'cu_opening_assembly'), true)
  assert.equal(segmentChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'), true)
  assert.equal(segmentChange?.affectedContentUnits.some((entity) => entity.id === 'cu_scene_anchor_keyframe_ref'), true)
  assert.equal(segmentChange?.affectedContentUnits.some((entity) => entity.id === 'cu_opening_assembly'), true)
  assert.equal(settingStateChange?.affectedContentUnits.some((entity) => entity.id === 'cu_wet_hair_ref'), true)
  assert.equal(settingStateChange?.staleMarkers.includes('content_unit:cu_wet_hair_ref:setting_context_changed'), true)
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
  assert.match(video?.runtimePanel.prompt?.text ?? '', /\{\{asset:wet_hair\}\}/)
  assert.equal(video?.runtimePanel.prompt?.negative_text, 'cartoon')
  assert.equal(video?.runtimePanel.runtime_request?.inputs.length, 0)
  assert.equal(video?.runtimePanel.status, 'blocked')
  assert.equal(video?.runtimePanel.input_version, undefined)
  assert.equal(video?.runtimePanel.dependency_hashes, undefined)
  assert.equal(video?.runtimePanel.hash_rule, undefined)
  assert.equal(video?.runtimePanel.upstream_selections, undefined)
  assert.equal(video?.generationPrompt.refs.every((ref) => ref.role === 'input'), true)
  assert.equal(video?.generationPrompt.refs.some((ref) => ref.kind === 'asset' && ref.id === 'wet_hair' && ref.role === 'input'), true)
  assert.ok(video?.dependencyReport.blockers?.some((blocker) => blocker.code === 'upstream_selection_missing'))
})

test('content unit stale checks tolerate legacy candidate prompt snapshots', () => {
  const documents = sourceDocuments()
  documents.push({
    path: '.movscript/decisions/content_units/cu_wet_hair_ref/decision_context.json',
    data: {
      schema: 'movscript.decision_context.v1',
      target_kind: 'content_unit',
      target_ref: 'content_units/cu_wet_hair_ref',
      candidates: [{
        schema: 'movscript.content_candidate.v1',
        id: 'candidate_wet_hair_legacy',
        content_unit_ref: 'content_units/cu_wet_hair_ref',
        outputs: [{ kind: 'image', resource_id: 101, artifact_ref: 'resource_wet_hair_legacy' }],
        prompt_snapshot: { text: 'Legacy generation prompt snapshot.' },
      }],
      selection: {
        candidate_id: 'candidate_wet_hair_legacy',
        resource_id: 101,
        artifact_ref: 'resource_wet_hair_legacy',
        stale_policy: 'strict',
      },
    },
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const video = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')
  const assetRef = video?.generationPrompt.refs.find((ref) => ref.kind === 'asset' && ref.id === 'wet_hair')

  assert.equal(assetRef?.selection?.candidate_id, 'candidate_wet_hair_legacy')
  assert.equal(assetRef?.selection?.stale, true)
  assert.ok(video?.dependencyReport.blockers?.some((blocker) => blocker.code === 'upstream_selection_stale'))
})

test('content unit artifacts track double-colon asset prompt references', () => {
  const documents = sourceDocuments().map((document) => {
    if (document.path !== 'content_units/k41m/content_unit.json') return document
    return {
      ...document,
      data: {
        ...document.data,
        edit_prompt: {
          ...document.data.edit_prompt,
          text: 'Cold phone light on frightened face. Use selected visual reference {{asset::wet_hair}}.',
        },
      },
    }
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const video = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')

  assert.equal(video?.generationPrompt.refs.some((ref) => ref.kind === 'asset' && ref.id === 'wet_hair' && ref.raw === '{{asset::wet_hair}}'), true)
  assert.equal(video?.dependencyReport.refs.some((ref) => ref.kind === 'asset' && ref.id === 'wet_hair'), true)
  assert.ok(video?.dependencyReport.dependencies.some((dependency) => dependency.role === 'asset' && dependency.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses'
    && relation.from.id === 'k41m'
    && relation.to.id === 'wet_hair'))
})

test('content unit runtime requests include project style reference images', () => {
  const documents = sourceDocuments().map((document) => {
    if (document.path !== 'project_standards.json') return document
    return {
      ...document,
      data: {
        ...document.data,
        custom_rules: [{
          key: 'style_reference_images',
          label: 'Style references',
          enabled: true,
          value: '画风参考图片：resource#88；reference_resource_ids=[88, 99]。',
        }],
      },
    }
  })
  const index = deriveMovScriptWorkspaceDomainIndex(documents)

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    interpretationId: 'interpret_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const video = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')
  const styleInputs = video?.runtimePanel.runtime_request?.inputs.filter((input) => input.role === 'style_reference')

  assert.deepEqual(styleInputs?.map((input) => input.resource_id), [88, 99])
  assert.deepEqual(video?.runtimePanel.runtime_request?.metadata?.style_reference_resource_ids, [88, 99])
  assert.equal(styleInputs?.every((input) => input.kind === 'image' && input.required === false), true)
})
