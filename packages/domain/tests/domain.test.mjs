import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyMovScriptEntityKind,
  assertExplicitParentRefMatchesPath,
  allocateMovScriptEntityId,
  contentUnitTargetValidationDiagnostics,
  normalizeContentUnitTarget,
  normalizeDomainFocus,
  suggestMovScriptEntityId,
  normalizeNamespaceVocabulary,
  namespaceVocabularyWithFallbacks,
  normalizePathParentEdge,
  parseImplicitTimelineAssemblyRef,
  assertNamespaceCannotOwnContentUnitRef,
  assertNamespaceCannotOwnProductionState,
  MOVSCRIPT_DOMAIN_PATH_SEMANTICS,
  MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES,
  MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES,
  childSettingNamespaceKind,
  childTimelineNamespaceKind,
  contentUnitTypesForPromptRefKind,
  implicitTimelineAssemblyRef,
  normalizeContentUnitTargetEdges,
  projectMovScriptDomainNodeKind,
  primaryRefKindForContentUnitType,
  primaryRefIdsForContentUnitRecord,
  rootSettingNamespaceKind,
  rootTimelineNamespaceKind,
  timelineNamespaceRootDefaultPreviewKind,
  timelineNamespaceTemplateDefaultPreviewKind,
  timelineNamespaceTemplateInitialNamespaces,
  timelineAssemblyScopeFromContentUnitRecord,
} from '../dist/index.js'

test('entity id suggestions derive readable IDs from titles', () => {
  assert.equal(suggestMovScriptEntityId({ title: 'Hero Portrait' }), 'hero_portrait')
  assert.equal(suggestMovScriptEntityId({ title: '  Hero: Portrait!!  ' }), 'hero_portrait')
  assert.match(suggestMovScriptEntityId({ title: '雨夜追车', fallbackPrefix: 'scene' }), /^scene_[a-z0-9]+$/)
})

test('entity id allocation preserves manual uniqueness with numeric suffixes', () => {
  assert.equal(allocateMovScriptEntityId({
    title: 'Hero Portrait',
    existingIds: ['hero_portrait', 'hero_portrait_2'],
  }), 'hero_portrait_3')
  assert.equal(allocateMovScriptEntityId({
    entityKind: 'content_unit',
    title: '雨夜追车',
    existingIds: [],
  }).startsWith('cu_'), true)
})

test('timeline_assembly_ref is the canonical content unit target for namespace scope output', () => {
  const target = normalizeContentUnitTarget({
    content_unit_type: 'timeline_assembly_ref',
    output_kind: 'video',
    target_kind: 'timeline_assembly',
    target_ref: 'timeline_assembly:episode:episode_01',
  })

  assert.equal(target.target?.targetCategory, 'timeline_assembly')
  assert.equal(target.target?.targetKind, 'timeline_assembly')
  assert.equal(target.target?.targetRef, 'timeline_assembly:episode:episode_01')
  assert.deepEqual(target.scope, {
    category: 'timeline_namespace',
    kind: 'episode',
    ref: 'episode_01',
    field: 'target_ref',
  })
  assert.equal(target.outputKind, 'video')
  assert.equal(target.diagnostics.length, 0)
  assert.ok(MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES.includes('timeline_assembly_ref'))
})

test('production type templates keep production root and recommend internal timeline namespaces', () => {
  assert.deepEqual([...timelineNamespaceTemplateInitialNamespaces('series')], ['production'])
  assert.equal(timelineNamespaceTemplateDefaultPreviewKind('series'), 'production')
  assert.equal(timelineNamespaceRootDefaultPreviewKind('production', 'series'), 'production')
  assert.deepEqual([...timelineNamespaceTemplateInitialNamespaces('film')], ['production'])
  assert.equal(timelineNamespaceTemplateDefaultPreviewKind('film'), 'production')
})

test('content unit target edge normalization emits target and scope edges', () => {
  const source = { category: 'content_unit', kind: 'content_unit', id: 'cu_episode' }
  const edges = normalizeContentUnitTargetEdges({
    source,
    record: {
      content_unit_type: 'timeline_assembly_ref',
      target_kind: 'timeline_assembly',
      target_ref: 'timeline_assembly:episode:episode_01',
    },
    scopeTarget(scope) {
      return { category: 'timeline_namespace', kind: 'episode', id: scope.ref, path: `timeline/${scope.ref}` }
    },
  })

  assert.deepEqual(edges, [
    {
      source,
      target: {
        category: 'timeline_assembly',
        kind: 'timeline_assembly',
        id: 'timeline_assembly:episode:episode_01',
      },
      relation: 'target',
      origin: 'explicit_ref',
      field: 'target_ref',
    },
    {
      source,
      target: {
        category: 'timeline_namespace',
        kind: 'episode',
        id: 'episode_01',
        path: 'timeline/episode_01',
      },
      relation: 'scope',
      origin: 'explicit_ref',
      field: 'target_ref',
    },
  ])
})

test('timeline_assembly_ref can derive target refs from explicit scope fields', () => {
  const targetRef = implicitTimelineAssemblyRef('production', 'pilot')
  const normalized = normalizeContentUnitTarget({
    content_unit_type: 'timeline_assembly_ref',
    scope_kind: 'production',
    scope_ref: 'pilot',
  })

  assert.equal(normalized.target?.targetRef, targetRef)
  assert.equal(normalized.scope?.kind, 'production')
  assert.equal(normalized.scope?.ref, 'pilot')
  assert.deepEqual(timelineAssemblyScopeFromContentUnitRecord({
    content_unit_type: 'timeline_assembly_ref',
    target_kind: 'timeline_assembly',
    target_ref: targetRef,
  }), {
    category: 'timeline_namespace',
    kind: 'production',
    ref: 'pilot',
    field: 'target_ref',
  })
  assert.deepEqual(primaryRefIdsForContentUnitRecord({
    content_unit_type: 'timeline_assembly_ref',
    target_kind: 'timeline_assembly',
    target_ref: targetRef,
  }, 'production'), ['pilot'])
  assert.deepEqual(contentUnitTypesForPromptRefKind('production'), ['production_ref', 'timeline_assembly_ref'])
})

test('legacy production and segment refs normalize to timeline assembly scopes', () => {
  const productionTarget = normalizeContentUnitTarget({
    content_unit_type: 'production_ref',
    production_ref: 'pilot',
  })

  assert.equal(productionTarget.target?.targetCategory, 'timeline_assembly')
  assert.equal(productionTarget.target?.targetKind, 'timeline_assembly')
  assert.equal(productionTarget.target?.targetRef, 'timeline_assembly:production:pilot')
  assert.deepEqual(productionTarget.scope, {
    category: 'timeline_namespace',
    kind: 'production',
    ref: 'pilot',
    field: 'production_ref',
  })
  assert.equal(productionTarget.diagnostics.length, 0)

  const productionEdges = normalizeContentUnitTargetEdges({
    source: { category: 'content_unit', kind: 'content_unit', id: 'cu_pilot' },
    record: {
      content_unit_type: 'production_ref',
      target_kind: 'production',
      target_ref: 'productions/pilot',
      production_ref: 'pilot',
    },
  })

  assert.equal(productionEdges.find((edge) => edge.relation === 'target')?.origin, 'legacy_alias')
  assert.equal(productionEdges.find((edge) => edge.relation === 'target')?.target.id, 'timeline_assembly:production:pilot')
  assert.equal(productionEdges.find((edge) => edge.relation === 'target')?.field, 'production_ref')
  assert.equal(productionEdges.find((edge) => edge.relation === 'scope')?.target.kind, 'production')
  assert.equal(productionEdges.find((edge) => edge.relation === 'scope')?.target.id, 'pilot')

  const segmentTarget = normalizeContentUnitTarget({
    content_unit_type: 'segment_ref',
    target_kind: 'segment',
    target_ref: 'productions/pilot/segments/opening',
    segment_ref: 'opening',
  })

  assert.equal(segmentTarget.target?.targetRef, 'timeline_assembly:segment:opening')
  assert.equal(segmentTarget.scope?.kind, 'segment')
  assert.equal(segmentTarget.scope?.ref, 'opening')
  assert.deepEqual(primaryRefIdsForContentUnitRecord({
    content_unit_type: 'segment_ref',
    target_kind: 'segment',
    target_ref: 'productions/pilot/segments/opening',
    segment_ref: 'opening',
  }, 'segment'), ['opening', 'productions/pilot/segments/opening'])
  assert.equal(segmentTarget.diagnostics.length, 0)
})

test('namespace targets are rejected for content units', () => {
  const normalized = normalizeContentUnitTarget({
    content_unit_type: 'custom_ref',
    target_kind: 'production',
    target_ref: 'pilot',
  })

  assert.equal(normalized.target, undefined)
  assert.deepEqual(normalized.diagnostics.map((diagnostic) => diagnostic.code), ['content_unit_namespace_target'])

  const explicitNamespace = normalizeContentUnitTarget({
    content_unit_type: 'custom_ref',
    target_kind: 'timeline_namespace',
    target_ref: 'episode_01',
  })

  assert.equal(explicitNamespace.target, undefined)
  assert.deepEqual(explicitNamespace.diagnostics.map((diagnostic) => diagnostic.code), ['content_unit_namespace_target'])

  const settingNamespace = normalizeContentUnitTarget({
    content_unit_type: 'custom_ref',
    target_kind: 'setting',
    target_ref: 'hero',
  })

  assert.equal(settingNamespace.target, undefined)
  assert.deepEqual(settingNamespace.diagnostics.map((diagnostic) => diagnostic.code), ['content_unit_namespace_target'])

  const customNamespaceCategory = normalizeContentUnitTarget({
    content_unit_type: 'custom_ref',
    target_category: 'timeline_namespace',
    target_kind: 'episode',
    target_ref: 'episode_01',
  })

  assert.equal(customNamespaceCategory.target, undefined)
  assert.deepEqual(customNamespaceCategory.diagnostics.map((diagnostic) => diagnostic.code), ['content_unit_namespace_target'])
})

test('content unit target validation diagnostics centralize blocking target invariants', () => {
  assert.deepEqual(contentUnitTargetValidationDiagnostics({
    content_unit_type: 'custom_ref',
    target_kind: 'production',
    target_category: 'timeline_namespace',
    target_ref: 'episode_01',
  }).map((diagnostic) => diagnostic.code), ['content_unit_namespace_target', 'content_unit_namespace_target'])

  assert.deepEqual(contentUnitTargetValidationDiagnostics({
    content_unit_type: 'timeline_assembly_ref',
    target_kind: 'timeline_assembly',
    target_ref: 'episode_01',
  }).map((diagnostic) => diagnostic.code), ['content_unit_scope_ref_invalid'])

  assert.deepEqual(contentUnitTargetValidationDiagnostics({
    content_unit_type: 'production_ref',
  }), [])
})

test('system primitive content unit targets keep fixed production semantics', () => {
  const normalized = normalizeContentUnitTarget({
    content_unit_type: 'scene_moment_ref',
    scene_moment_ref: 'rain_call',
  })

  assert.equal(normalized.target?.targetCategory, 'system_primitive')
  assert.equal(normalized.target?.targetKind, 'scene_moment')
  assert.equal(normalized.target?.targetRef, 'rain_call')
  assert.equal(normalized.outputKind, 'video')
  assert.equal(primaryRefKindForContentUnitType('scene_moment_ref'), 'scene_moment')
  assert.ok(MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES.includes('production_ref'))

  const audioCueTarget = normalizeContentUnitTarget({
    content_unit_type: 'audio_cue_ref',
    audio_cue_ref: 'phone_vibration',
  })

  assert.equal(audioCueTarget.target?.targetCategory, 'system_primitive')
  assert.equal(audioCueTarget.target?.targetKind, 'audio_cue')
  assert.equal(audioCueTarget.target?.targetRef, 'phone_vibration')
  assert.equal(audioCueTarget.outputKind, 'audio')
  assert.equal(primaryRefKindForContentUnitType('audio_cue_ref'), 'audio_cue')
  assert.deepEqual(contentUnitTypesForPromptRefKind('audio_cue'), ['audio_cue_ref'])
  assert.ok(MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES.includes('audio_cue_ref'))
})

test('path-derived parent edges are explicit and vocabulary stays separate', () => {
  assert.equal(MOVSCRIPT_DOMAIN_PATH_SEMANTICS.structureSource, 'source_path')
  assert.equal(MOVSCRIPT_DOMAIN_PATH_SEMANTICS.vocabularyRole, 'labels_templates_and_aliases')
  assert.ok(MOVSCRIPT_DOMAIN_PATH_SEMANTICS.rules.some((rule) => rule.includes('do not create a second instance tree')))

  const parentEdge = normalizePathParentEdge(
    { category: 'timeline_namespace', kind: 'beat', id: 'beat_01', path: 'productions/pilot/segments/opening' },
    { category: 'timeline_namespace', kind: 'episode', id: 'pilot', path: 'productions/pilot' },
  )

  assert.equal(parentEdge.edge?.relation, 'parent')
  assert.equal(parentEdge.edge?.origin, 'path')
  assert.equal(parentEdge.edge?.source.kind, 'beat')
  assert.equal(parentEdge.edge?.target.kind, 'episode')

  const vocabulary = normalizeNamespaceVocabulary({
    timeline_template: 'series',
    timeline_namespaces: ['beat', 'tag'],
  })

  assert.deepEqual(vocabulary.timelineNamespaces, ['act', 'sequence', 'beat', 'tag'])
})

test('explicit parent refs must agree with the path-derived parent when both are present', () => {
  const child = { category: 'timeline_namespace', kind: 'beat', id: 'opening', path: 'timeline/episode_01/beats/opening/segment.json' }
  const pathParent = { category: 'timeline_namespace', kind: 'production', id: 'episode_01', path: 'timeline/episode_01/production.json' }

  assert.deepEqual(assertExplicitParentRefMatchesPath({
    child,
    pathParent,
    explicitParentRef: 'episode_01',
    field: 'parent_ref',
  }), [])

  assert.deepEqual(assertExplicitParentRefMatchesPath({
    child,
    pathParent,
    explicitParentRef: 'timeline/episode_01',
    field: 'parent_ref',
  }), [])

  const diagnostics = assertExplicitParentRefMatchesPath({
    child,
    pathParent,
    explicitParentRef: 'episode_02',
    field: 'parent_ref',
    path: child.path,
  })

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), ['path_parent_ref_conflict'])
  assert.match(diagnostics[0].message, /source path is the canonical instance parent/)
})

test('namespace vocabulary normalizes nested project configuration without creating parents', () => {
  const vocabulary = normalizeNamespaceVocabulary({
    namespace_vocabulary: {
      timeline_template: 'series',
      timeline_namespaces: ['sequence', 'beat'],
      setting_namespaces: ['character', 'voice_state'],
    },
    timeline_namespaces: ['chapter'],
    setting_namespaces: ['costume'],
  })

  assert.equal(vocabulary.timelineTemplate, 'series')
  assert.deepEqual(vocabulary.timelineNamespaces, ['act', 'sequence', 'beat', 'chapter'])
  assert.deepEqual(vocabulary.settingNamespaces, ['character', 'voice_state', 'costume'])
  assert.deepEqual(vocabulary.diagnostics, [])
})

test('namespace vocabulary fallbacks provide creation order without parent ownership', () => {
  const emptyVocabulary = namespaceVocabularyWithFallbacks(undefined)

  assert.deepEqual(emptyVocabulary.timelineNamespaces, [...MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES])
  assert.equal(rootTimelineNamespaceKind(emptyVocabulary), 'episode')
  assert.equal(childTimelineNamespaceKind('episode', emptyVocabulary), 'act')
  assert.equal(childTimelineNamespaceKind('beat', emptyVocabulary), 'episode')
  assert.equal(rootSettingNamespaceKind(emptyVocabulary), 'character')
  assert.equal(childSettingNamespaceKind('character', emptyVocabulary), 'costume')

  const projectVocabulary = namespaceVocabularyWithFallbacks({
    timelineNamespaces: ['series', 'episode', 'beat'],
    settingNamespaces: ['character', 'costume_state'],
    timelineTemplate: 'series',
  })

  assert.equal(projectVocabulary.timelineTemplate, 'series')
  assert.deepEqual(projectVocabulary.timelineNamespaces, ['series', 'episode', 'beat', 'act'])
  assert.deepEqual(projectVocabulary.settingNamespaces, ['character', 'costume_state', 'costume', 'state'])
  assert.equal(rootTimelineNamespaceKind(projectVocabulary), 'series')
  assert.equal(childTimelineNamespaceKind('episode', projectVocabulary), 'beat')
  assert.equal(childSettingNamespaceKind('character', projectVocabulary), 'costume_state')
})

test('domain node kind projection separates user labels from storage entity kinds', () => {
  assert.equal(projectMovScriptDomainNodeKind('production', { kind: 'episode' }), 'episode')
  assert.equal(projectMovScriptDomainNodeKind('segment', { namespace_kind: 'beat' }), 'beat')
  assert.equal(projectMovScriptDomainNodeKind('setting', { setting_kind: 'character' }), 'character')
  assert.equal(projectMovScriptDomainNodeKind('setting_state', { namespace_kind: 'costume_state' }), 'costume_state')
  assert.equal(projectMovScriptDomainNodeKind('scene_moment', { kind: 'scene_moment' }), 'scene_moment')
})

test('normalized focus maps legacy production focus to an assembly work target', () => {
  const focus = normalizeDomainFocus({
    projectId: 'project-a',
    productionId: 'pilot',
    entityKind: 'scene_moment',
    entityId: 'rain_call',
  })

  assert.equal(focus.projectId, 'project-a')
  assert.equal(focus.target?.targetCategory, 'timeline_assembly')
  assert.equal(focus.target?.targetRef, 'timeline_assembly:production:pilot')
  assert.equal(focus.scope?.kind, 'production')
  assert.equal(focus.entity?.category, 'system_primitive')
  assert.equal(classifyMovScriptEntityKind('production'), 'timeline_namespace')
})

test('normalized focus accepts explicit timeline assembly scopes without duplicating structure', () => {
  const focus = normalizeDomainFocus({
    project_id: 'project-a',
    target_kind: 'timeline_assembly',
    scope_kind: 'episode',
    scope_ref: 'episode_01',
  })

  assert.equal(focus.target?.targetCategory, 'timeline_assembly')
  assert.equal(focus.target?.targetRef, 'timeline_assembly:episode:episode_01')
  assert.deepEqual(focus.scope, {
    category: 'timeline_namespace',
    kind: 'episode',
    ref: 'episode_01',
    field: 'scopeRef',
  })
  assert.equal(focus.diagnostics.length, 0)

  const parsed = normalizeDomainFocus({
    projectId: 'project-a',
    targetKind: 'timeline_assembly',
    targetRef: 'timeline_assembly:production:pilot',
  })

  assert.equal(parsed.scope?.kind, 'production')
  assert.equal(parsed.scope?.ref, 'pilot')
  assert.equal(parsed.scope?.field, 'targetRef')
  assert.deepEqual(parseImplicitTimelineAssemblyRef('timeline_assembly:episode:ep:01'), {
    scopeKind: 'episode',
    scopeRef: 'ep:01',
  })
})

test('normalized focus accepts timeline assembly ref aliases from surface urls', () => {
  const focus = normalizeDomainFocus({
    projectId: 'project-a',
    timeline_assembly_ref: 'timeline_assembly:episode:episode_01',
  })

  assert.equal(focus.target?.targetCategory, 'timeline_assembly')
  assert.equal(focus.target?.targetKind, 'timeline_assembly')
  assert.equal(focus.target?.targetRef, 'timeline_assembly:episode:episode_01')
  assert.equal(focus.scope?.kind, 'episode')
  assert.equal(focus.scope?.ref, 'episode_01')
  assert.equal(focus.scope?.field, 'targetRef')
  assert.equal(focus.diagnostics.length, 0)
})

test('focus rejects namespace target categories', () => {
  const focus = normalizeDomainFocus({
    projectId: 'project-a',
    targetCategory: 'timeline_namespace',
    targetKind: 'episode',
    targetRef: 'episode_01',
  })

  assert.equal(focus.target, undefined)
  assert.deepEqual(focus.diagnostics.map((diagnostic) => diagnostic.code), ['focus_namespace_target'])
})

test('namespace source records cannot own content unit refs', () => {
  const diagnostics = assertNamespaceCannotOwnContentUnitRef({
    entityKind: 'production',
    record: {
      id: 'pilot',
      namespace_kind: 'episode',
      content_unit_ref: 'content_units/pilot_video',
      main_content_unit_id: 'pilot_video',
    },
    path: 'productions/pilot/production.json',
  })

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    'namespace_content_unit_ref_forbidden',
    'namespace_content_unit_ref_forbidden',
  ])
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.field), [
    'content_unit_ref',
    'main_content_unit_id',
  ])
  assert.match(diagnostics[0].message, /namespace episode must not own content unit ref field content_unit_ref/)

  assert.deepEqual(assertNamespaceCannotOwnContentUnitRef({
    entityKind: 'scene_moment',
    record: { id: 'rain_call', content_unit_ref: 'content_units/rain_call_video' },
  }), [])
})

test('namespace source records cannot own production state', () => {
  const diagnostics = assertNamespaceCannotOwnProductionState({
    entityKind: 'production',
    record: {
      id: 'pilot',
      namespace_kind: 'episode',
      candidates: [{ id: 'legacy-candidate' }],
      selection: { candidate_id: 'legacy-candidate' },
      selected_resource_id: 123,
      resource_id: 123,
    },
    path: 'productions/pilot/production.json',
  })

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    'namespace_production_state_forbidden',
    'namespace_production_state_forbidden',
    'namespace_production_state_forbidden',
    'namespace_production_state_forbidden',
  ])
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.field), [
    'candidates',
    'selection',
    'selected_resource_id',
    'resource_id',
  ])
  assert.match(diagnostics[0].message, /namespace episode must not own production state field candidates/)

  assert.deepEqual(assertNamespaceCannotOwnProductionState({
    entityKind: 'asset',
    record: { id: 'hero_front', candidates: [], selection: {} },
  }), [])
})
