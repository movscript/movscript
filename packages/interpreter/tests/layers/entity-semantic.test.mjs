import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSourceDomainGraph,
  businessChangesFromChangedEntities,
  changedEntitiesFromFiles,
  productionImpactsFromSemanticChanges,
  semanticChangesFromEntityChanges,
  summarizeReview,
  validateEditableFiles,
  validateSourceDomainGraph,
} from '../../dist/index.js'

test('entity change layer maps changed json files to source entities and field changes', () => {
  const baselineFiles = [{
    path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json',
    relativePath: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json',
    content: JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'scene_anchor',
      title: 'Scene anchor',
      reference_asset_refs: ['wet_hair', 'umbrella'],
    }),
  }]
  const workingFiles = [{
    ...baselineFiles[0],
    content: JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'scene_anchor',
      title: 'Scene anchor updated',
      reference_asset_refs: ['umbrella', 'wet_hair'],
    }),
  }]

  const entities = changedEntitiesFromFiles([{
    path: baselineFiles[0].path,
    state: 'modified',
  }], buildSourceDomainGraph(workingFiles), buildSourceDomainGraph(baselineFiles))
  const entity = entities[0]

  assert.equal(entity?.entityKind, 'keyframe')
  assert.equal(entity?.id, 'scene_anchor')
  assert.equal(entity?.state, 'modified')
  assert.ok(entity?.fieldChanges?.some((change) => change.field === 'title'
    && change.jsonPointer === '/title'
    && change.jsonOperation === 'replaced'
    && change.oldValue === 'Scene anchor'
    && change.newValue === 'Scene anchor updated'))
  assert.ok(entity?.fieldChanges?.some((change) => change.field === 'reference_asset_refs'
    && change.jsonPointer === '/reference_asset_refs'
    && change.jsonOperation === 'reordered'))
})

test('semantic change layer maps field changes to domain propagation rules', () => {
  const changes = semanticChangesFromEntityChanges([{
    entityKind: 'keyframe',
    id: 'scene_anchor',
    path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json',
    state: 'modified',
    fieldChanges: [
      { field: 'title', operation: 'modified' },
      { field: 'reference_asset_refs', operation: 'modified' },
      { field: 'reference_asset_refs', operation: 'modified', jsonOperation: 'reordered' },
      { field: 'selection.resource_id', operation: 'modified' },
      { field: 'visual_intent', operation: 'modified' },
    ],
  }])

  assert.ok(changes.some((change) => change.kind === 'metadata_changed'
    && change.propagation === 'none'
    && change.fields.includes('title')))
  assert.ok(changes.some((change) => change.kind === 'reference_changed'
    && change.propagation === 'downstream_reference'
    && change.fields.includes('reference_asset_refs')))
  assert.ok(changes.some((change) => change.kind === 'reference_changed'
    && change.businessKind === 'sequence_reordered'
    && change.propagation === 'downstream_reference'
    && change.fields.includes('reference_asset_refs')))
  assert.ok(changes.some((change) => change.kind === 'selection_changed'
    && change.businessKind === 'selection_changed'
    && change.propagation === 'downstream_reference'
    && change.fields.includes('selection.resource_id')))
  assert.ok(changes.some((change) => change.kind === 'semantic_input_changed'
    && change.businessKind === 'keyframe_changed'
    && change.propagation === 'downstream_reference'
    && change.fields.includes('visual_intent')))

  const expressionUnitChanges = semanticChangesFromEntityChanges([{
    entityKind: 'expression_unit',
    id: 'phone',
    path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/expression_unit.json',
    state: 'modified',
    fieldChanges: [
      { field: 'angle', operation: 'modified' },
    ],
  }])
  assert.ok(expressionUnitChanges.some((change) => change.kind === 'semantic_input_changed'
    && change.businessKind === 'expression_unit_changed'
    && change.propagation === 'self'
    && change.fields.includes('angle')))
})

test('production impact layer maps semantic changes without requiring reshoots', () => {
  const impacts = productionImpactsFromSemanticChanges([
    {
      entity: { kind: 'keyframe', id: 'scene_anchor' },
      kind: 'metadata_changed',
      businessKind: 'metadata_changed',
      propagation: 'none',
      fields: ['title'],
      sourceChange: { operation: 'modified', path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json' },
    },
    {
      entity: { kind: 'content_unit', id: 'k41m' },
      kind: 'semantic_input_changed',
      businessKind: 'content_unit_changed',
      propagation: 'self',
      fields: ['edit_prompt.text'],
      sourceChange: { operation: 'modified', path: 'content_units/k41m/content_unit.json' },
    },
    {
      entity: { kind: 'keyframe', id: 'scene_anchor' },
      kind: 'reference_changed',
      businessKind: 'sequence_reordered',
      propagation: 'downstream_reference',
      fields: ['reference_asset_refs'],
      sourceChange: { operation: 'modified', path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json' },
    },
  ], {
    impactReport: {
      changedEntities: [{
        entityKind: 'keyframe',
        id: 'scene_anchor',
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json',
        affectedContentUnits: [{
          entityKind: 'content_unit',
          id: 'k41m',
          path: 'content_units/k41m/content_unit.json',
        }],
      }],
    },
  }, [{
    contentUnitId: 'k41m',
    contentUnitPath: 'content_units/k41m',
  }])

  assert.ok(impacts.some((impact) => impact.kind === 'diagnostic_only'
    && impact.businessKinds.includes('metadata_changed')
    && impact.businessImpacts.includes('Metadata changed')
    && impact.sourceChanges[0]?.fields.includes('title')))
  assert.ok(impacts.some((impact) => impact.kind === 'self_selection_stale'
    && impact.businessKinds.includes('content_unit_changed')
    && impact.businessImpacts.includes('Content unit changed')
    && impact.contentUnit?.id === 'k41m'))
  assert.ok(impacts.some((impact) => impact.kind === 'downstream_reference_changed'
    && impact.businessKinds.includes('sequence_reordered')
    && impact.businessImpacts.includes('Sequence reordered')
    && impact.contentUnit?.id === 'k41m'))
  assert.equal(impacts.every((impact) => impact.reshootRequired === false), true)
})

test('source validation layer reports parse, hierarchy, and reference issues', () => {
  const invalidJsonIssues = validateEditableFiles([{
    path: 'project.json',
    relativePath: 'project.json',
    content: '{"schema":',
  }])
  assert.ok(invalidJsonIssues.some((issue) => issue.message.includes('invalid JSON')))

  const files = [
    {
      path: 'settings/hero/setting.json',
      relativePath: 'settings/hero/setting.json',
      content: JSON.stringify({
        schema: 'movscript.setting.v1',
        kind: 'setting',
        id: 'different_hero',
        setting_kind: 'character',
      }),
    },
    {
      path: 'content_units/k41m/content_unit.json',
      relativePath: 'content_units/k41m/content_unit.json',
      content: JSON.stringify({
        schema: 'movscript.content_unit.v1',
        kind: 'content_unit',
        id: 'k41m',
        content_unit_type: 'asset_ref',
        output_kind: 'image',
        edit_prompt: { text: 'Prompt for {{asset:missing_asset}}.' },
        model_intent: { capability: 'image' },
      }),
    },
  ]
  const issues = validateSourceDomainGraph(buildSourceDomainGraph(files))

  assert.ok(issues.some((issue) => issue.message.includes('id different_hero does not match source directory id hero')))
  assert.ok(issues.some((issue) => issue.message.includes('content_unit prompt ref does not resolve: {{asset:missing_asset}}')))
})

test('review summary layer builds business changes and counts review state', () => {
  const files = [{
    path: 'content_units/k41m/content_unit.json',
    relativePath: 'content_units/k41m/content_unit.json',
    content: JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
    }),
  }]
  const graph = buildSourceDomainGraph(files)
  const changedEntities = [{
    entityKind: 'content_unit',
    path: 'content_units/k41m/content_unit.json',
    id: 'k41m',
    state: 'modified',
  }]
  const businessChanges = businessChangesFromChangedEntities(changedEntities, graph, buildSourceDomainGraph([]), [{
    entity: { kind: 'content_unit', id: 'k41m' },
    kind: 'semantic_input_changed',
    businessKind: 'content_unit_changed',
    propagation: 'self',
    fields: ['edit_prompt.text'],
    sourceChange: { operation: 'modified', path: 'content_units/k41m/content_unit.json' },
  }])
  const summary = summarizeReview([
    { path: 'content_units/k41m/content_unit.json', currentPath: '.interpret/current/content_units/k41m/content_unit.json', state: 'modified' },
    { path: 'project.json', currentPath: '.interpret/current/project.json', state: 'added' },
  ], businessChanges, [
    { path: 'project.json', severity: 'warning', message: 'warning' },
    { path: 'content_units/k41m/content_unit.json', severity: 'error', message: 'error' },
  ])

  assert.equal(businessChanges[0]?.title, 'Phone close-up')
  assert.equal(businessChanges[0]?.summary, 'Content unit changed: Phone close-up')
  assert.deepEqual(businessChanges[0]?.impactAreas, ['content_production', 'generation_prompts', 'preview_timeline'])
  assert.deepEqual(businessChanges[0]?.semanticKinds, ['semantic_input_changed'])
  assert.deepEqual(businessChanges[0]?.businessKinds, ['content_unit_changed'])
  assert.deepEqual(summary, {
    total: 2,
    added: 1,
    modified: 1,
    deleted: 0,
    businessChanges: 1,
    errors: 1,
    warnings: 1,
  })
})
