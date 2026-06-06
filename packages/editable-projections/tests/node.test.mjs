import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  FileApplyReviewStore,
  FileWorkspaceUpdateTargetStore,
  FileSnapshotStore,
  JsonManifestStore,
  LocalWorkspaceFileSystem,
  createNodeEditableProjectionWorkflow,
  createNodeEditableProjectionWorkspace,
} from '../dist/node.js'
import {
  InvalidApplyReviewError,
  InvalidWorkspaceManifestError,
  MemoryApplyReviewStore,
  MemoryBackendStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  MemoryWorkspaceUpdateTargetStore,
  MissingApplyReviewArtifactError,
  MissingWorkspaceUpdateTargetArtifactError,
  MissingWorkspaceFileError,
  WorkspacePathEscapeError,
  createProjectionRegistry,
  movscriptAssetSlotAdapter,
  movscriptAssetSlotPath,
  movscriptAssetSlotUpdateTarget,
} from '../dist/index.js'

test('LocalWorkspaceFileSystem reads, writes, lists, and deletes under root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-fs-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)

    await fs.writeFile('data/project.json', '{"name":"A"}\n')
    await fs.writeFile('data/assets/asset_1.json', '{"name":"asset"}\n')

    assert.equal(await fs.readFile('data/project.json'), '{"name":"A"}\n')
    assert.deepEqual(await fs.listFiles('data'), [
      'data/assets/asset_1.json',
      'data/project.json',
    ])
    assert.deepEqual(await fs.listFiles('data/missing'), [])

    await fs.deleteFile('data/project.json')
    assert.equal(await fs.exists('data/project.json'), false)
    await assert.rejects(
      () => fs.readFile('data/project.json'),
      (error) => {
        assert.equal(error instanceof MissingWorkspaceFileError, true)
        assert.equal(error.code, 'missing_workspace_file')
        assert.equal(error.filePath, 'data/project.json')
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('LocalWorkspaceFileSystem rejects paths outside the root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-fs-escape-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)
    await assert.rejects(
      fs.writeFile('../outside.json', '{}\n'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '../outside.json')
        return true
      },
    )
    await assert.rejects(
      fs.writeFile('data/../inside.json', '{}\n'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, 'data/../inside.json')
        return true
      },
    )
    await assert.rejects(
      fs.writeFile('/outside.json', '{}\n'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '/outside.json')
        return true
      },
    )
    for (const { operation, path } of [
      { operation: () => fs.readFile('../outside.json'), path: '../outside.json' },
      { operation: () => fs.deleteFile('../outside.json'), path: '../outside.json' },
      { operation: () => fs.exists('../outside.json'), path: '../outside.json' },
      { operation: () => fs.listFiles('../outside'), path: '../outside' },
    ]) {
      await assert.rejects(operation, (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, path)
        return true
      })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('MemoryWorkspaceFileSystem reports missing files with a stable error', async () => {
  const fs = new MemoryWorkspaceFileSystem()

  await assert.rejects(
    () => fs.readFile('data/missing.json'),
    (error) => {
      assert.equal(error instanceof MissingWorkspaceFileError, true)
      assert.equal(error.code, 'missing_workspace_file')
      assert.equal(error.filePath, 'data/missing.json')
      return true
    },
  )
})

test('MemoryBackendStore mutates entities through stable test helpers', async () => {
  const store = new MemoryBackendStore()
  const entity = {
    entityType: 'asset',
    entityId: 1,
    hash: 'asset-v1',
    value: { name: 'Original' },
  }

  store.setEntity(entity)
  entity.value.name = 'Mutated outside store'

  assert.deepEqual(await store.getEntity({ entityType: 'asset', entityId: 1 }), {
    entityType: 'asset',
    entityId: 1,
    hash: 'asset-v1',
    value: { name: 'Original' },
  })
  assert.deepEqual(store.listEntities(), [{
    entityType: 'asset',
    entityId: 1,
    hash: 'asset-v1',
    value: { name: 'Original' },
  }])
  assert.equal(store.deleteEntity({ entityType: 'asset', entityId: 1 }), true)
  assert.equal(await store.getEntity({ entityType: 'asset', entityId: 1 }), undefined)

  store.setEntity({
    entityType: 'asset',
    entityId: 2,
    hash: 'asset-v1',
    value: { name: 'Second' },
  })
  store.clear()
  assert.deepEqual(store.listEntities(), [])
})

test('memory stores reject parent-directory paths', async () => {
  assert.throws(
    () => new MemoryWorkspaceFileSystem({ '../outside.json': '{}\n' }),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '../outside.json')
      return true
    },
  )

  const fs = new MemoryWorkspaceFileSystem()
  for (const operation of [
    () => fs.readFile('../outside.json'),
    () => fs.readFile('/outside.json'),
    () => fs.writeFile('data/../inside.json', '{}\n'),
    () => fs.deleteFile('../outside.json'),
    () => fs.exists('../outside.json'),
    () => fs.listFiles('../outside'),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      return true
    })
  }

  assert.throws(
    () => new MemorySnapshotStore({ '../outside.json': '{}\n' }),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '../outside.json')
      return true
    },
  )

  const snapshotStore = new MemorySnapshotStore()
  await assert.rejects(
    () => snapshotStore.writeBase('../outside.json', '{}\n'),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '../outside.json')
      return true
    },
  )
  await assert.rejects(
    () => snapshotStore.writeBase('C:\\workspace\\outside.json', '{}\n'),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, 'C:\\workspace\\outside.json')
      return true
    },
  )

  const emptyReview = {
    rootPath: '.',
    summary: {
      create: 0,
      update: 0,
      delete: 0,
      noop: 0,
      blocked: 0,
      conflicts: 0,
    },
    operations: [],
  }
  assert.throws(
    () => new MemoryApplyReviewStore({ '../outside': emptyReview }),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '../outside')
      return true
    },
  )
  const reviewStore = new MemoryApplyReviewStore()
  await assert.rejects(
    () => reviewStore.save('../outside', emptyReview),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '../outside')
      return true
    },
  )
  await assert.rejects(
    () => reviewStore.save('/outside', emptyReview),
    (error) => {
      assert.equal(error instanceof WorkspacePathEscapeError, true)
      assert.equal(error.code, 'path_escape')
      assert.equal(error.path, '/outside')
      return true
    },
  )
  for (const invalidPath of ['', '.', 'reviews/./latest']) {
    await assert.rejects(
      () => reviewStore.save(invalidPath, emptyReview),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, invalidPath)
        return true
      },
    )
  }

  const updateTargetStore = new MemoryWorkspaceUpdateTargetStore()
  for (const invalidPath of ['', '.', 'refresh/./latest']) {
    await assert.rejects(
      () => updateTargetStore.save(invalidPath, []),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, invalidPath)
        return true
      },
    )
  }
})

test('JsonManifestStore and FileSnapshotStore persist through the workspace filesystem', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-store-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)
    const manifestStore = new JsonManifestStore(fs)
    const snapshotStore = new FileSnapshotStore(fs)

    await manifestStore.save({
      version: 1,
      files: {
        'data/project.json': {
          schema: 'example.project.v1',
          kind: 'writable_projection',
          writable: true,
          entityType: 'project',
          entityId: 1,
          baseHash: 'base',
        },
      },
    })
    await snapshotStore.writeBase('data/project.json', '{"name":"A"}\n')

    assert.equal((await manifestStore.load()).files['data/project.json'].entityType, 'project')
    assert.equal(await snapshotStore.readBase('data/project.json'), '{"name":"A"}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('JsonManifestStore validates manifest JSON on load and save', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-invalid-manifest-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)
    const manifestStore = new JsonManifestStore(fs)

    await fs.writeFile('meta/manifest.json', '{')
    await assert.rejects(
      () => manifestStore.load(),
      (error) => {
        assert.equal(error instanceof InvalidWorkspaceManifestError, true)
        assert.equal(error.code, 'invalid_manifest')
        assert.equal(error.manifestPath, 'meta/manifest.json')
        return true
      },
    )

    await assert.rejects(
      () => manifestStore.save({
        version: 1,
        files: {
          'data/asset.json': {
            schema: 'example.asset.v1',
            kind: 'writable_projection',
            writable: 'yes',
            entityType: 'asset',
          },
        },
      }),
      (error) => {
        assert.equal(error instanceof InvalidWorkspaceManifestError, true)
        assert.equal(error.issues[0].path, '/files/data~1asset.json/writable')
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Node stores reject absolute control paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-absolute-control-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)
    await assert.rejects(
      () => new JsonManifestStore(fs, '/manifest.json').load(),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '/manifest.json')
        return true
      },
    )
    await assert.rejects(
      () => new FileSnapshotStore(fs, '/base').writeBase('data/project.json', '{}\n'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '/base')
        return true
      },
    )
    await assert.rejects(
      () => new FileSnapshotStore(fs).writeBase('/data/project.json', '{}\n'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '/data/project.json')
        return true
      },
    )
    await assert.rejects(
      () => new FileApplyReviewStore(fs, 'C:\\reviews').load('latest'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, 'C:\\reviews')
        return true
      },
    )
    for (const { operation, path } of [
      { operation: () => new JsonManifestStore(fs, 'meta/./manifest.json').load(), path: 'meta/./manifest.json' },
      { operation: () => new FileSnapshotStore(fs, '').writeBase('data/project.json', '{}\n'), path: '' },
      { operation: () => new FileApplyReviewStore(fs, 'reviews/./drafts').load('latest'), path: 'reviews/./drafts' },
      { operation: () => new FileWorkspaceUpdateTargetStore(fs, 123).load('latest'), path: '123' },
    ]) {
      await assert.rejects(
        operation,
        (error) => {
          assert.equal(error instanceof WorkspacePathEscapeError, true)
          assert.equal(error.code, 'path_escape')
          assert.equal(error.path, path)
          return true
        },
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('createNodeEditableProjectionWorkspace wires filesystem, stores, and workspace defaults', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-node-workspace-'))
  try {
    const { workspace, fs, manifestStore, snapshotStore } = createNodeEditableProjectionWorkspace(root, {
      backendStore: new MemoryBackendStore(),
      registry: createProjectionRegistry([movscriptAssetSlotAdapter]),
    })
    const filePath = movscriptAssetSlotPath(1, 12)

    await workspace.update([
      movscriptAssetSlotUpdateTarget({
        id: 12,
        projectId: 1,
        ownerType: 'creative_reference',
        ownerId: 8,
        kind: 'image',
        name: 'Hero portrait',
      }, {
        path: filePath,
        backendHash: 'slot-v1',
      }),
    ])

    assert.equal(await fs.exists(filePath), true)
    assert.equal((await manifestStore.load()).files[filePath].backendHash, 'slot-v1')
    assert.match(await snapshotStore.readBase(filePath), /Hero portrait/)
    assert.equal((await workspace.status('.')).files.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('FileApplyReviewStore persists and validates review artifacts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-review-store-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)
    const reviewStore = new FileApplyReviewStore(fs)
    const review = {
      rootPath: 'data/assets',
      summary: {
        create: 0,
        update: 1,
        delete: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'planned',
        action: 'update',
        filePath: 'data/assets/asset_1.json',
        commands: [{ type: 'asset.update' }],
        issues: [],
      }],
    }

    await reviewStore.save('latest', review)
    assert.deepEqual(await reviewStore.load('latest'), review)
    assert.equal(await fs.exists('reviews/latest.json'), true)

    await assert.rejects(
      () => reviewStore.load('missing'),
      (error) => {
        assert.equal(error instanceof MissingApplyReviewArtifactError, true)
        assert.equal(error.code, 'missing_review_artifact')
        assert.equal(error.reviewPath, 'reviews/missing.json')
        return true
      },
    )
    await fs.writeFile('reviews/broken.json', '{')
    await assert.rejects(
      () => reviewStore.load('broken'),
      (error) => {
        assert.equal(error instanceof InvalidApplyReviewError, true)
        assert.equal(error.code, 'invalid_apply_review')
        assert.equal(error.reviewPath, 'reviews/broken.json')
        return true
      },
    )
    await assert.rejects(
      () => reviewStore.load('../meta/manifest'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '../meta/manifest')
        return true
      },
    )
    for (const invalidPath of ['', '.', 'nested/./latest']) {
      await assert.rejects(
        () => reviewStore.load(invalidPath),
        (error) => {
          assert.equal(error instanceof WorkspacePathEscapeError, true)
          assert.equal(error.code, 'path_escape')
          assert.equal(error.path, invalidPath)
          return true
        },
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('FileWorkspaceUpdateTargetStore persists and validates update target artifacts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-update-target-store-'))
  try {
    const fs = new LocalWorkspaceFileSystem(root)
    const store = new FileWorkspaceUpdateTargetStore(fs)
    const targets = [movscriptAssetSlotUpdateTarget({
      id: 12,
      projectId: 1,
      ownerType: 'creative_reference',
      ownerId: 8,
      kind: 'image',
      name: 'Hero portrait',
    }, {
      path: movscriptAssetSlotPath(1, 12),
      backendHash: 'slot-v1',
    })]

    await store.save('asset-slot-12', targets)

    assert.deepEqual(await store.load('asset-slot-12'), targets)
    assert.equal(await fs.exists('update-targets/asset-slot-12.json'), true)

    await assert.rejects(
      () => store.load('missing'),
      (error) => {
        assert.equal(error instanceof MissingWorkspaceUpdateTargetArtifactError, true)
        assert.equal(error.code, 'missing_update_target_artifact')
        assert.equal(error.artifactPath, 'update-targets/missing.json')
        return true
      },
    )
    await assert.rejects(
      () => store.load('../meta/manifest'),
      (error) => {
        assert.equal(error instanceof WorkspacePathEscapeError, true)
        assert.equal(error.code, 'path_escape')
        assert.equal(error.path, '../meta/manifest')
        return true
      },
    )
    for (const invalidPath of ['', '.', 'nested/./latest']) {
      await assert.rejects(
        () => store.load(invalidPath),
        (error) => {
          assert.equal(error instanceof WorkspacePathEscapeError, true)
          assert.equal(error.code, 'path_escape')
          assert.equal(error.path, invalidPath)
          return true
        },
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('createNodeEditableProjectionWorkflow wires Node stores and workflow facade', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-node-workflow-'))
  try {
    const filePath = movscriptAssetSlotPath(1, 12)
    const backendStore = new MemoryBackendStore([
      {
        entityType: 'asset_slot',
        entityId: 12,
        hash: 'slot-v1',
        value: {
          id: 12,
          projectId: 1,
          ownerType: 'creative_reference',
          ownerId: 8,
          kind: 'image',
          name: 'Hero portrait',
        },
      },
    ])
    const { workflow, fs, manifestStore, snapshotStore, updateTargetStore } = createNodeEditableProjectionWorkflow(root, {
      backendStore,
      registry: createProjectionRegistry([movscriptAssetSlotAdapter]),
      executor: {
        async execute(commands) {
          assert.equal(commands[0].type, 'movscript.asset_slot.update')
          backendStore.setEntity({
            entityType: 'asset_slot',
            entityId: 12,
            hash: 'slot-v2',
            value: {
              id: 12,
              projectId: 1,
              ownerType: 'creative_reference',
              ownerId: 8,
              kind: 'image',
              name: 'Hero portrait updated',
            },
          })
          return {
            updateTargets: [
              movscriptAssetSlotUpdateTarget({
                id: 12,
                projectId: 1,
                ownerType: 'creative_reference',
                ownerId: 8,
                kind: 'image',
                name: 'Hero portrait updated',
              }, {
                path: filePath,
                backendHash: 'slot-v2',
              }),
            ],
          }
        },
      },
    })

    await workflow.saveUpdateTargets('initial-slot-12', [
      movscriptAssetSlotUpdateTarget({
        id: 12,
        projectId: 1,
        ownerType: 'creative_reference',
        ownerId: 8,
        kind: 'image',
        name: 'Hero portrait',
      }, {
        path: filePath,
        backendHash: 'slot-v1',
      }),
    ])
    await workflow.loadAndUpdate('initial-slot-12')

    const edited = JSON.parse(await fs.readFile(filePath))
    edited.name = 'Hero portrait updated'
    await fs.writeFile(filePath, `${JSON.stringify(edited, null, 2)}\n`)

    const review = await workflow.reviewAndSave('data/projects/1/assets', 'asset-slot-12')
    const applied = await workflow.loadAndApply('asset-slot-12')

    assert.equal(review.reviewPath, 'asset-slot-12')
    assert.equal(await fs.exists('reviews/asset-slot-12.json'), true)
    assert.deepEqual(await updateTargetStore.load('initial-slot-12'), [
      movscriptAssetSlotUpdateTarget({
        id: 12,
        projectId: 1,
        ownerType: 'creative_reference',
        ownerId: 8,
        kind: 'image',
        name: 'Hero portrait',
      }, {
        path: filePath,
        backendHash: 'slot-v1',
      }),
    ])
    assert.equal(applied.review.summary.update, 1)
    assert.equal(applied.reviewPath, 'asset-slot-12')
    assert.equal(applied.result.appliedCommands, 1)
    assert.match(applied.markdown, /Applied commands: 1/)
    assert.equal((await manifestStore.load()).files[filePath].backendHash, 'slot-v2')
    assert.match(await snapshotStore.readBase(filePath), /Hero portrait updated/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
