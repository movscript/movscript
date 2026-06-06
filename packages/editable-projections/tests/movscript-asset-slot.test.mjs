import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MemoryBackendStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  assertProjectionAdapterContract,
  createEditableProjectionWorkspace,
  createProjectionRegistry,
  movscriptAssetSlotAdapter,
  movscriptAssetSlotDeleteTarget,
  movscriptAssetSlotPath,
  movscriptAssetSlotProjectionSchema,
  movscriptAssetSlotUpdateTarget,
  movscriptCreativeReferenceAdapter,
  movscriptCreativeReferenceDeleteTarget,
  movscriptCreativeReferencePath,
  movscriptCreativeReferenceProjectionSchema,
  movscriptCreativeReferenceUpdateTarget,
  movscriptProjectAdapters,
  movscriptProjectRelativeAssetSlotPath,
  movscriptProjectRelativeCreativeReferencePath,
  normalizeMovScriptCreativeReferenceEntity,
  normalizeMovScriptAssetSlotEntity,
  sha256,
} from '../dist/index.js'

test('movscript project path helpers support workspace-root and project-root layouts', () => {
  assert.equal(movscriptCreativeReferencePath(1, 8), 'data/projects/1/references/creative_reference_8.json')
  assert.equal(movscriptAssetSlotPath(1, 12), 'data/projects/1/assets/asset_slot_12.json')
  assert.equal(movscriptProjectRelativeCreativeReferencePath(8), 'references/creative_reference_8.json')
  assert.equal(movscriptProjectRelativeAssetSlotPath(12), 'assets/asset_slot_12.json')
})

test('movscript creative reference adapter satisfies the projection adapter contract', () => {
  const report = assertProjectionAdapterContract({
    adapter: movscriptCreativeReferenceAdapter,
    entity: {
      ID: 8,
      projectId: 1,
      kind: 'person',
      name: 'Lina',
      description: 'Lead character',
    },
    entityId: 8,
    filePath: movscriptCreativeReferencePath(1, 8),
    validFile: json({
      schema: movscriptCreativeReferenceProjectionSchema,
      id: 8,
      project_id: 1,
      kind: 'person',
      name: 'Lina',
      description: 'Lead character',
    }),
    invalidFile: json({
      schema: movscriptCreativeReferenceProjectionSchema,
      id: 8,
      project_id: 1,
      kind: 'person',
      name: '',
    }),
  })

  assert.equal(report.ok, true)
})

test('movscript asset slot adapter satisfies the projection adapter contract', () => {
  const report = assertProjectionAdapterContract({
    adapter: movscriptAssetSlotAdapter,
    entity: {
      ID: 12,
      projectId: 1,
      owner: { type: 'creative_reference', id: 8 },
      kind: 'image',
      name: 'Hero portrait',
    },
    entityId: 12,
    filePath: movscriptAssetSlotPath(1, 12),
    validFile: json({
      schema: movscriptAssetSlotProjectionSchema,
      id: 12,
      project_id: 1,
      owner: { entityType: 'creative_reference', entityId: 8 },
      kind: 'image',
      name: 'Hero portrait',
    }),
    invalidFile: json({
      schema: movscriptAssetSlotProjectionSchema,
      id: 12,
      project_id: 1,
      kind: 'image',
      name: '',
    }),
  })

  assert.equal(report.ok, true)
})

test('movscript creative reference adapter normalizes backend-shaped entities', () => {
  assert.deepEqual(normalizeMovScriptCreativeReferenceEntity({
    ID: 8,
    projectId: 1,
    kind: 'person',
    name: 'Lina',
    alias: 'Hero',
    description: 'Lead character',
    profileJson: '{"age":29}',
    tagsJson: '["lead"]',
    sourceScriptId: 3,
  }), {
    schema: movscriptCreativeReferenceProjectionSchema,
    id: 8,
    project_id: 1,
    kind: 'person',
    name: 'Lina',
    alias: 'Hero',
    description: 'Lead character',
    profile_json: '{"age":29}',
    tags_json: '["lead"]',
    source_script_id: 3,
  })
})

test('movscript asset slot adapter normalizes backend-shaped entities', () => {
  assert.deepEqual(normalizeMovScriptAssetSlotEntity({
    ID: 12,
    projectId: 1,
    productionId: 3,
    ownerType: 'creative_reference',
    ownerId: 8,
    kind: 'image',
    name: 'Hero portrait',
    slotKey: 'hero_portrait',
    promptHint: 'Readable portrait reference.',
    metadataJson: '{"source":"test"}',
  }), {
    schema: movscriptAssetSlotProjectionSchema,
    id: 12,
    project_id: 1,
    production_id: 3,
    owner: {
      entityType: 'creative_reference',
      entityId: 8,
    },
    owner_type: 'creative_reference',
    owner_id: 8,
    kind: 'image',
    name: 'Hero portrait',
    slot_key: 'hero_portrait',
    prompt_hint: 'Readable portrait reference.',
    metadata_json: '{"source":"test"}',
  })
})

test('movscript creative reference adapter validates core editable fields', () => {
  const invalid = movscriptCreativeReferenceAdapter.validateFile({
    schema: movscriptCreativeReferenceProjectionSchema,
    name: '',
    kind: 12,
    profile_json: '{bad json',
  })

  assert.equal(invalid.ok, false)
  assert.deepEqual(invalid.issues.map((issue) => issue.path), ['/name', '/kind', '/profile_json'])
})

test('movscript asset slot adapter validates core editable fields', () => {
  const invalid = movscriptAssetSlotAdapter.validateFile({
    schema: movscriptAssetSlotProjectionSchema,
    kind: 'spreadsheet',
    name: '',
  })

  assert.equal(invalid.ok, false)
  assert.deepEqual(invalid.issues.map((issue) => issue.path), ['/name', '/kind'])
})

test('movscript creative reference delete target removes canonical local projections', () => {
  assert.deepEqual(movscriptCreativeReferenceDeleteTarget({
    id: 8,
    project_id: 1,
  }, {
    backendHash: 'reference-deleted',
  }), {
    path: 'data/projects/1/references/creative_reference_8.json',
    schema: movscriptCreativeReferenceProjectionSchema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'creative_reference',
    entityId: 8,
    backendHash: 'reference-deleted',
    operation: 'delete',
  })
})

test('movscript asset slot delete target removes canonical local projections', () => {
  assert.deepEqual(movscriptAssetSlotDeleteTarget({
    id: 12,
    project_id: 1,
  }, {
    backendHash: 'slot-deleted',
  }), {
    path: 'data/projects/1/assets/asset_slot_12.json',
    schema: movscriptAssetSlotProjectionSchema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'asset_slot',
    entityId: 12,
    backendHash: 'slot-deleted',
    operation: 'delete',
  })
})

test('movscript creative reference adapter creates service command payloads', async () => {
  const local = json({
    schema: movscriptCreativeReferenceProjectionSchema,
    client_id: 'ref_hero',
    project_id: 1,
    kind: 'person',
    name: 'Lina',
    description: 'Lead character',
    profile_json: '{"age":29}',
  })
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/projects/1/references/creative_reference_ref_hero.json': local,
    }),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry(movscriptProjectAdapters),
  })

  const review = await workspace.applyReview('data/projects/1/references')

  assert.equal(review.summary.create, 1)
  assert.deepEqual(review.operations[0].commands[0], {
    type: 'movscript.creative_reference.create',
    filePath: 'data/projects/1/references/creative_reference_ref_hero.json',
    entityType: 'creative_reference',
    clientId: 'ref_hero',
    action: 'create',
    input: {
      client_id: 'ref_hero',
      project_id: 1,
      kind: 'person',
      name: 'Lina',
      description: 'Lead character',
      profile_json: '{"age":29}',
    },
    patch: [
      { op: 'add', path: '/client_id', value: 'ref_hero' },
      { op: 'add', path: '/description', value: 'Lead character' },
      { op: 'add', path: '/kind', value: 'person' },
      { op: 'add', path: '/name', value: 'Lina' },
      { op: 'add', path: '/profile_json', value: '{"age":29}' },
      { op: 'add', path: '/project_id', value: 1 },
      { op: 'add', path: '/schema', value: movscriptCreativeReferenceProjectionSchema },
    ],
  })
})

test('movscript asset slot adapter creates service command payloads', async () => {
  const local = json({
    schema: movscriptAssetSlotProjectionSchema,
    project_id: 1,
    owner: {
      type: 'creative_reference',
      id: 8,
      label: 'Lina',
      path: '../references/creative_reference_8.json',
    },
    kind: 'image',
    name: 'Opening room floor plan',
    slot_key: 'top_down_floor_plan',
    prompt_hint: 'Readable top-down room plan.',
  })
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/projects/1/assets/asset_slot_new.json': local,
    }),
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore: new MemoryBackendStore(),
    registry: createProjectionRegistry(movscriptProjectAdapters),
  })

  const review = await workspace.applyReview('data/projects/1/assets')

  assert.equal(review.summary.create, 1)
  assert.deepEqual(review.operations[0].commands[0], {
    type: 'movscript.asset_slot.create',
    filePath: 'data/projects/1/assets/asset_slot_new.json',
    entityType: 'asset_slot',
    action: 'create',
    input: {
      project_id: 1,
      kind: 'image',
      name: 'Opening room floor plan',
      slot_key: 'top_down_floor_plan',
      prompt_hint: 'Readable top-down room plan.',
      owner_type: 'creative_reference',
      owner_id: 8,
    },
    patch: [
      { op: 'add', path: '/kind', value: 'image' },
      { op: 'add', path: '/name', value: 'Opening room floor plan' },
      {
        op: 'add',
        path: '/owner',
        value: {
          type: 'creative_reference',
          id: 8,
          label: 'Lina',
          path: '../references/creative_reference_8.json',
        },
      },
      { op: 'add', path: '/project_id', value: 1 },
      { op: 'add', path: '/prompt_hint', value: 'Readable top-down room plan.' },
      { op: 'add', path: '/schema', value: movscriptAssetSlotProjectionSchema },
      { op: 'add', path: '/slot_key', value: 'top_down_floor_plan' },
    ],
  })
})

test('movscript project adapters keep references normalized across update, edit, apply, and canonical refresh', async () => {
  const referencePath = movscriptCreativeReferencePath(1, 8)
  const slotPath = movscriptAssetSlotPath(1, 12)
  const reference = {
    ID: 8,
    projectId: 1,
    kind: 'person',
    name: 'Lina',
    description: 'Lead character',
    profileJson: '{"age":29}',
  }
  const slot = {
    id: 12,
    projectId: 1,
    owner: {
      type: 'creative_reference',
      id: 8,
      label: 'Lina',
      path: '../references/creative_reference_8.json',
    },
    kind: 'image',
    name: 'Hero portrait',
    status: 'missing',
  }
  const backendStore = new MemoryBackendStore([
    {
      entityType: 'creative_reference',
      entityId: 8,
      hash: 'reference-v1',
      value: reference,
    },
    {
      entityType: 'asset_slot',
      entityId: 12,
      hash: 'slot-v1',
      value: slot,
    },
  ])
  const fs = new MemoryWorkspaceFileSystem()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore,
    registry: createProjectionRegistry(movscriptProjectAdapters),
  })

  await workspace.update([
    movscriptCreativeReferenceUpdateTarget(reference, { path: referencePath, backendHash: 'reference-v1' }),
    movscriptAssetSlotUpdateTarget(slot, { path: slotPath, backendHash: 'slot-v1' }),
  ])
  const editedReference = JSON.parse(await fs.readFile(referencePath))
  editedReference.description = 'Lead character with a sharper visual identity.'
  await fs.writeFile(referencePath, json(editedReference))
  const editedSlot = JSON.parse(await fs.readFile(slotPath))
  editedSlot.prompt_hint = 'Use the creative reference identity; clean front-facing portrait.'
  await fs.writeFile(slotPath, json(editedSlot))

  const review = await workspace.applyReview('data/projects/1')
  assert.equal(review.summary.update, 2)
  assert.deepEqual(review.operations.map((operation) => operation.commands[0].type).sort(), [
    'movscript.asset_slot.update',
    'movscript.creative_reference.update',
  ])
  const slotCommand = review.operations
    .flatMap((operation) => operation.commands)
    .find((command) => command.type === 'movscript.asset_slot.update')
  assert.deepEqual(slotCommand.input.owner_type, 'creative_reference')
  assert.deepEqual(slotCommand.input.owner_id, 8)
  assert.equal('owner' in slotCommand.input, false)

  const result = await workspace.apply(review, {
    executor: {
      async execute(commands) {
        const refreshTargets = []
        for (const command of commands) {
          if (command.type === 'movscript.creative_reference.update') {
            const canonical = {
              ...editedReference,
              status: 'active',
            }
            backendStore.setEntity({
              entityType: 'creative_reference',
              entityId: 8,
              hash: 'reference-v2',
              value: canonical,
            })
            refreshTargets.push(movscriptCreativeReferenceUpdateTarget(canonical, {
              path: command.filePath,
              backendHash: 'reference-v2',
            }))
          }
          if (command.type === 'movscript.asset_slot.update') {
            const canonical = {
              ...editedSlot,
              status: 'candidate',
            }
            backendStore.setEntity({
              entityType: 'asset_slot',
              entityId: 12,
              hash: 'slot-v2',
              value: canonical,
            })
            refreshTargets.push(movscriptAssetSlotUpdateTarget(canonical, {
              path: command.filePath,
              backendHash: 'slot-v2',
            }))
          }
        }
        return { updateTargets: refreshTargets }
      },
    },
  })

  assert.equal(result.refresh.summary.updated, 2)
  assert.equal(JSON.parse(await fs.readFile(referencePath)).status, 'active')
  assert.equal(JSON.parse(await fs.readFile(slotPath)).status, 'candidate')
  assert.deepEqual((await workspace.status('data/projects/1')).files.map((file) => file.state), ['clean', 'clean'])
})

test('movscript asset slot adapter works through update, edit, apply, and canonical refresh', async () => {
  const filePath = movscriptAssetSlotPath(1, 12)
  const initial = {
    id: 12,
    projectId: 1,
    ownerType: 'creative_reference',
    ownerId: 8,
    kind: 'image',
    name: 'Hero portrait',
    status: 'missing',
  }
  const backendStore = new MemoryBackendStore([
    {
      entityType: 'asset_slot',
      entityId: 12,
      hash: 'slot-v1',
      value: initial,
    },
  ])
  const fs = new MemoryWorkspaceFileSystem()
  const manifestStore = new MemoryManifestStore()
  const snapshotStore = new MemorySnapshotStore()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore,
    snapshotStore,
    backendStore,
    registry: createProjectionRegistry(movscriptProjectAdapters),
  })

  await workspace.update([movscriptAssetSlotUpdateTarget(initial, { path: filePath, backendHash: 'slot-v1' })])
  const edited = JSON.parse(await fs.readFile(filePath))
  edited.prompt_hint = 'Keep face identity consistent and readable.'
  await fs.writeFile(filePath, json(edited))

  const review = await workspace.applyReview(filePath)
  assert.equal(review.summary.update, 1)
  assert.equal(review.operations[0].commands[0].type, 'movscript.asset_slot.update')

  const canonical = {
    ...edited,
    status: 'candidate',
  }
  const result = await workspace.apply(review, {
    executor: {
      async execute(commands) {
        assert.equal(commands[0].input.prompt_hint, 'Keep face identity consistent and readable.')
        backendStore.setEntity({
          entityType: 'asset_slot',
          entityId: 12,
          hash: 'slot-v2',
          value: canonical,
        })
        return {
          updateTargets: [
            movscriptAssetSlotUpdateTarget(canonical, { path: filePath, backendHash: 'slot-v2' }),
          ],
        }
      },
    },
  })

  assert.equal(result.refresh.summary.updated, 1)
  assert.deepEqual(JSON.parse(await fs.readFile(filePath)).status, 'candidate')
  assert.equal((await workspace.status(filePath)).files[0].state, 'clean')
})

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
