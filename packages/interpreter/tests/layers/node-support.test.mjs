import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveMovScriptWorkspaceArtifacts,
} from '../../dist/index.js'
import {
  deriveV1RegenerationPlan,
  interpretWorkspaceOverview,
  commitCheckpoint,
  loadCheckpointSourceSnapshots,
  resolveWorkspaceSource,
  workspaceSnapshotId,
  writeDebugArtifacts,
} from '../../dist/node.js'
import {
  deriveMovScriptWorkspaceDomainIndex,
} from '../../../workspace/dist/index.js'

import {
  memoryWorkspaceFileRepository,
  sourceDocuments,
  sourceFileEntries,
} from '../helpers.mjs'

test('source store resolves source files and snapshot checkpoints without derived artifacts', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['content_units/k41m/content_unit.json', JSON.stringify({ schema: 'movscript.content_unit.v1', kind: 'content_unit', id: 'k41m', title: 'Phone close-up' })],
    ['.interpret/current/project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'interpret_copy' })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const source = await resolveWorkspaceSource(repository)
  assert.deepEqual(source.files.map((file) => file.relativePath), [
    'content_units/k41m/content_unit.json',
    'project.json',
  ])
  assert.notEqual(workspaceSnapshotId(source.files), 'empty-working-tree')

  const checkpoint = await commitCheckpoint(repository, source.files, {
    now: new Date('2026-06-07T00:00:00.000Z'),
    message: 'snapshot checkpoint',
  })
  const baseline = await loadCheckpointSourceSnapshots(repository)

  assert.equal(checkpoint.source, 'snapshot')
  assert.equal(baseline.source, 'snapshot')
  assert.equal(baseline.checkpointHash, checkpoint.id)
  assert.deepEqual(baseline.files.map((file) => file.relativePath), [
    'content_units/k41m/content_unit.json',
    'project.json',
  ])
  assert.equal(files.has('.movscript/checkpoints/current/source/.interpret/current/project.json'), false)
})

test('debug artifact sink writes interpreted outputs and removes stale cache files', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.interpret/current/content_units/stale/runtime_panel.json', JSON.stringify({ stale: true }))
  files.set('.interpret/current/productions/old/preview_timeline.json', JSON.stringify({ stale: true }))
  const repository = memoryWorkspaceFileRepository(files)
  const index = deriveMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: [],
    interpretationId: 'interpret_debug_sink',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const manifest = {
    schema: 'movscript.workspace-interpret.v1',
    interpretationId: 'interpret_debug_sink',
    interpretedAt: '2026-06-07T00:00:00.000Z',
    source: {
      sourcePath: '',
      sourceMode: 'source',
      sourceFileHashes: {},
    },
    output: {
      currentPath: '.interpret/current',
      domainIndexPath: '.interpret/current/domain-index.json',
      domainTreePath: '.interpret/current/domain-tree.json',
      editorStatePath: '.interpret/current/editor-state.json',
      assetIndexPath: '.interpret/current/asset-index.json',
      relationGraphPath: '.interpret/current/relation-graph.json',
      impactReportPath: '.interpret/reviews/impact-report_interpret_debug_sink.json',
    },
    review: {},
  }

  await writeDebugArtifacts(repository, artifacts, index, manifest, manifest.output.impactReportPath)

  assert.equal(files.has('.interpret/current/content_units/stale/runtime_panel.json'), false)
  assert.equal(files.has('.interpret/current/productions/old/preview_timeline.json'), false)
  assert.equal(files.has('.interpret/current/project.json'), true)
  assert.equal(files.has('.interpret/current/editor-state.json'), true)
  assert.equal(files.has('.interpret/current/domain-index.json'), true)
  assert.equal(files.has('.interpret/manifests/interpret_debug_sink.json'), true)
})

test('regeneration module returns V1 empty planning surfaces with review impact summary', () => {
  const plan = deriveV1RegenerationPlan({
    createdAt: '2026-06-07T00:00:00.000Z',
    latestInterpretation: {
      path: '.interpret/manifests/interpret_1.json',
      manifest: {
        schema: 'movscript.workspace-interpret.v1',
        interpretationId: 'interpret_1',
        interpretedAt: '2026-06-07T00:00:00.000Z',
        output: { impactReportPath: '.interpret/reviews/impact-report_interpret_1.json' },
      },
    },
    review: {
      semanticChanges: [{ kind: 'reference_changed' }],
      staleSelections: [{ contentUnitId: 'k41m' }],
      productionImpacts: [{
        kind: 'downstream_reference_changed',
        contentUnit: { id: 'k41m', path: 'content_units/k41m' },
        sourceChanges: [{
          entity: { kind: 'keyframe', id: 'scene_anchor' },
          kind: 'reference_changed',
          propagation: 'downstream_reference',
          fields: ['reference_asset_refs'],
          sourceChange: {
            operation: 'modified',
            path: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/scene_anchor/keyframe.json',
          },
        }],
      }],
    },
  })

  assert.equal(plan.interpret?.interpretationId, 'interpret_1')
  assert.equal(plan.changedEntities[0]?.entityKind, 'keyframe')
  assert.equal(plan.changedEntities[0]?.affectedContentUnits[0]?.id, 'k41m')
  assert.deepEqual(plan.affectedContentUnits, [{
    contentUnitId: 'k41m',
    contentUnitPath: 'content_units/k41m',
    reasons: ['downstream_reference_changed', 'selection_stale'],
    staleReasons: [],
  }])
  assert.deepEqual(plan.promptBundles, [{
    contentUnitId: 'k41m',
    contentUnitPath: 'content_units/k41m',
    reasons: ['downstream_reference_changed', 'selection_stale'],
    staleReasons: [],
  }])
  assert.deepEqual(plan.previewTimelines, [{
    productionId: 'p8f3',
    path: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/scene_anchor/keyframe.json',
    reasons: ['downstream_reference_changed'],
  }])
  assert.equal(plan.summary.changedEntities, 1)
  assert.equal(plan.summary.staleContentUnits, 1)
  assert.equal(plan.summary.previewTimelines, 1)
})

test('overview module summarizes source, interpretation, changes, and next actions', () => {
  const overview = interpretWorkspaceOverview({
    createdAt: '2026-06-07T00:00:00.000Z',
    source: {
      rootPath: '',
      mode: 'source',
      files: [{
        path: 'project.json',
        relativePath: 'project.json',
        content: JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' }),
      }, {
        path: 'content_units/k41m/content_unit.json',
        relativePath: 'content_units/k41m/content_unit.json',
        content: JSON.stringify({ schema: 'movscript.content_unit.v1', kind: 'content_unit', id: 'k41m' }),
      }],
    },
    latestInterpretation: {
      path: '.interpret/manifests/interpret_1.json',
      manifest: {
        schema: 'movscript.workspace-interpret.v1',
        interpretationId: 'interpret_1',
        interpretedAt: '2026-06-07T00:00:00.000Z',
        output: { impactReportPath: '.interpret/reviews/impact-report_interpret_1.json' },
      },
    },
    inspection: {
      changedEntities: [{ entityKind: 'content_unit' }],
      issues: [],
      readyToInterpret: true,
      summary: {
        total: 1,
        added: 0,
        modified: 1,
        deleted: 0,
        businessChanges: 1,
        errors: 0,
        warnings: 0,
      },
    },
    regeneration: {
      schema: 'movscript.workspace-regeneration-plan.v1',
      operation: 'regen-plan',
      createdAt: '2026-06-07T00:00:00.000Z',
      status: 'ready',
      changedEntities: [],
      affectedContentUnits: [],
      promptBundles: [],
      previewTimelines: [],
      summary: {
        changedEntities: 1,
        affectedContentUnits: 0,
        staleContentUnits: 0,
        promptBundles: 0,
        previewTimelines: 0,
      },
    },
  })

  assert.equal(overview.workspace.projectId, 'project_demo')
  assert.equal(overview.workspace.title, 'Demo')
  assert.equal(overview.source.documentCount, 2)
  assert.equal(overview.source.entityCount, 2)
  assert.equal(overview.interpret.status, 'stale')
  assert.deepEqual(overview.changes.affectedEntityKinds, ['content_unit'])
  assert.deepEqual(overview.nextActions, ['inspect', 'interpret'])
})
