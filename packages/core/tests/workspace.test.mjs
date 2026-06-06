import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMovScriptWorkspaceDomainIndex,
  createMovScriptWorkspaceDomainRepository,
  createMovScriptWorkspaceAssetSlotCandidate,
  createMovScriptWorkspaceKeyframeCandidate,
  getMovScriptWorkspaceModel,
  queryMovScriptWorkspaceAssetSlots,
  queryMovScriptWorkspaceSettings,
  queryMovScriptWorkspaceProductionContext,
} from '../dist/workspace/index.js'
import {
  buildMovScriptWorkspace,
  reviewMovScriptBuildWorkspace,
} from '../dist/workspace/node/index.js'

test('workspace domain indexes current build edit files for frontend queries', () => {
  const index = buildMovScriptWorkspaceDomainIndex([
    {
      path: 'edit/setting/setting_1.json',
      data: {
        schema: 'movscript.setting.v1',
        id: 1,
        kind: 'person',
        name: 'Mia',
        status: 'confirmed',
      },
    },
    {
      path: 'edit/assets/asset_slot_2.json',
      data: {
        schema: 'movscript.asset_slot.v1',
        id: 2,
        owner_type: 'setting',
        owner_id: 1,
        name: 'Mia portrait',
        status: 'missing',
      },
    },
    {
      path: 'edit/assets/asset_slot_2.candidates/candidate_1.json',
      data: {
        schema: 'movscript.candidate.v1',
        id: 'candidate_1',
        target: { type: 'asset_slot', id: 2 },
        resource_id: 'resource_1',
        status: 'proposed',
      },
    },
    {
      path: 'edit/productions/production_9/production.json',
      data: {
        schema: 'movscript.production.v1',
        id: 9,
        segments: [
          {
            ID: 3,
            production_id: 9,
            title: 'Opening',
            scene_moments: [
              {
                ID: 4,
                title: 'Morning',
                content_units: [
                  {
                    ID: 5,
                    title: 'Wake up shot',
                    keyframes: [{ ID: 6, title: 'First frame', content_unit_id: 5 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ])

  assert.equal(queryMovScriptWorkspaceSettings(index, { kind: 'person' }).length, 1)
  const assetSlots = queryMovScriptWorkspaceAssetSlots(index, { settingId: 1, includeCandidates: true })
  assert.equal(assetSlots.assetSlots.length, 1)
  assert.equal(assetSlots.candidates?.length, 1)
  const context = queryMovScriptWorkspaceProductionContext(index, { productionId: 9 })
  assert.equal(context.segments.length, 1)
  assert.equal(context.scene_moments.length, 1)
  assert.equal(context.content_units.length, 1)
  assert.equal(context.keyframes.length, 1)
})

test('workspace candidate writer stores asset slot candidates under candidate files', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)

  const result = await createMovScriptWorkspaceAssetSlotCandidate({
    fileRepository: repository,
    projectPath: 'edit',
    projectId: 7,
    nonce: 'fixed',
    payload: {
      asset_slot_id: 2,
      resource_id: 99,
      source_type: 'upload',
      note: 'Uploaded candidate',
    },
  })

  assert.equal(result.entityType, 'candidate')
  assert.equal(result.path, 'edit/assets/asset_slot_2.candidates/candidate_asset_slot_candidate_2_99_fixed.json')
  assert.equal(result.record.schema, 'movscript.candidate.v1')
  assert.deepEqual(result.record.target, { type: 'asset_slot', id: 2 })
  assert.equal(result.record.asset_slot_id, 2)
  assert.equal(result.record.resource_id, 99)
  assert.equal(files.has(result.path), true)
})

test('workspace candidate writer stores keyframe candidates under target keyframe files', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)

  const result = await createMovScriptWorkspaceKeyframeCandidate({
    fileRepository: repository,
    projectPath: 'edit',
    projectId: 7,
    nonce: 'fixed',
    payload: {
      production_id: 9,
      resource_id: 99,
      metadata_json: JSON.stringify({ target_keyframe_id: 6 }),
    },
  })

  assert.equal(result.entityType, 'candidate')
  assert.equal(result.path, 'edit/productions/production_9/keyframes/keyframe_6.candidates/candidate_keyframe_candidate_6_99_fixed.json')
  assert.equal(result.record.schema, 'movscript.candidate.v1')
  assert.deepEqual(result.record.target, { type: 'keyframe', id: 6 })
  assert.equal(result.record.keyframe_id, 6)
  assert.equal(files.has(result.path), true)
})

test('workspace domain repository loads files through a repository boundary', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', id: 123, name: 'Demo' })],
    ['references/setting_1.json', JSON.stringify({ schema: 'movscript.setting.v1', id: 1, name: 'Mia', kind: 'person' })],
    ['references/setting_1.meta.json', JSON.stringify({ state: { dirty: false } })],
    ['scripts/1/script.md', '# Script\n'],
  ])
  const repository = createMovScriptWorkspaceDomainRepository({
    fileRepository: memoryWorkspaceFileRepository(files),
  })

  const index = await repository.loadIndex()

  assert.equal(queryMovScriptWorkspaceSettings(index, { query: 'mia' }).length, 1)
  assert.equal(index.byType.get('script')?.[0]?.record.content, '# Script\n')
  assert.equal(index.entities.some((entity) => entity.path.endsWith('.meta.json')), false)
})

test('workspace ontology resolves entity editing model without namespace or projection', () => {
  const model = getMovScriptWorkspaceModel({ entityType: 'setting', entityId: 'hero' })

  assert.equal(model.workspaceKind, 'setting_workspace')
  assert.deepEqual(model.editablePaths, [
    'edit/setting/setting_hero.json',
    'edit/setting/setting_hero.states/state_hero.json',
    'edit/setting/relationships/relationship_hero.json',
  ])
  assert.ok(model.instructions.some((line) => line.includes('setting')))
})

test('workspace review compares .build/current to edit without making changes effective', async () => {
  const files = new Map([
    ['.build/current/setting/setting_hero.json', JSON.stringify({ schema: 'movscript.setting.v1', id: 'setting_hero', name: 'Old Hero' })],
    ['edit/setting/setting_hero.json', JSON.stringify({ schema: 'movscript.setting.v1', id: 'setting_hero', name: 'New Hero' })],
    ['edit/assets/asset_slot_1.json', JSON.stringify({ schema: 'movscript.asset_slot.v1', id: 'asset_slot_1', name: 'Hero portrait' })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.basePath, '.build/current')
  assert.equal(review.editPath, 'edit')
  assert.equal(review.readyToBuild, true)
  assert.equal(review.summary.total, 2)
  assert.equal(review.summary.added, 1)
  assert.equal(review.summary.modified, 1)
  assert.deepEqual(review.changedFiles.map((file) => [file.path, file.state]), [
    ['edit/assets/asset_slot_1.json', 'added'],
    ['edit/setting/setting_hero.json', 'modified'],
  ])
  assert.equal(files.has('.build/current/assets/asset_slot_1.json'), false)
})

test('workspace build writes .build/current and domain index when review is clean', async () => {
  const files = new Map([
    ['edit/setting/setting_hero.json', JSON.stringify({ schema: 'movscript.setting.v1', id: 'setting_hero', name: 'Hero' })],
    ['edit/assets/asset_slot_1.json', JSON.stringify({ schema: 'movscript.asset_slot.v1', id: 'asset_slot_1', name: 'Hero portrait' })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/setting/setting_hero.json'), true)
  assert.equal(files.has('.build/current/assets/asset_slot_1.json'), true)
  assert.equal(files.has('.build/indexes/domain-index.json'), true)
  assert.equal(files.has('.build/manifests/build_20260607000000000.json'), true)
  const domainIndex = JSON.parse(files.get('.build/indexes/domain-index.json'))
  assert.equal(domainIndex.schema, 'movscript.domain-index.v1')
  assert.ok(domainIndex.entities.some((entity) => entity.entityType === 'asset_slot'))
})

test('workspace build rejects invalid editable JSON', async () => {
  const files = new Map([
    ['edit/setting/setting_1.json', '{'],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.review.readyToBuild, false)
  assert.match(result.review.issues[0]?.message ?? '', /invalid JSON/)
  assert.equal(files.has('.build/current/setting/setting_1.json'), false)
})

function memoryWorkspaceFileRepository(files) {
  return {
    async list(input = {}) {
      const root = normalizeMemoryPath(input.path ?? '')
      const children = new Map()
      for (const path of files.keys()) {
        if (root && path !== root && !path.startsWith(`${root}/`)) continue
        const rest = root ? path.slice(root.length).replace(/^\//, '') : path
        if (!rest) continue
        const [name, ...tail] = rest.split('/')
        const childPath = root ? `${root}/${name}` : name
        children.set(childPath, {
          path: childPath,
          kind: tail.length > 0 ? 'directory' : 'file',
          size: tail.length > 0 ? undefined : files.get(path).length,
        })
      }
      return {
        path: root,
        entries: [...children.values()].sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
          return left.path.localeCompare(right.path)
        }),
      }
    },
    async read(input) {
      const path = normalizeMemoryPath(input.path)
      const content = files.get(path)
      if (content === undefined) throw new Error(`missing file: ${path}`)
      return { path, content, size: content.length }
    },
    async write(input) {
      const path = normalizeMemoryPath(input.path)
      files.set(path, input.content)
      return { path, content: input.content, size: input.content.length }
    },
    async delete(input) {
      files.delete(normalizeMemoryPath(input.path))
    },
  }
}

function normalizeMemoryPath(path) {
  return String(path).replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}
