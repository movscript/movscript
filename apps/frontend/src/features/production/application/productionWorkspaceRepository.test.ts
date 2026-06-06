import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProductionWritingExpressionWorkspaceEdit,
  deleteProductionWritingExpressionWorkspaceEdit,
  linkProductionSceneMomentReferenceWorkspaceEdit,
  productionWorkspaceFilePath,
  saveProductionSceneMomentOrderWorkspaceEdit,
  saveProductionSegmentWorkspaceEdit,
  saveProductionWritingExpressionWorkspaceEdit,
  unlinkProductionSceneMomentReferenceWorkspaceEdit,
  type ProductionWorkspaceSnapshot,
} from './productionWorkspaceRepository'

test('production workspace repository saves segment edits into the edit workspace file', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await saveProductionSegmentWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      segmentId: 1,
      payload: {
        title: '新段落',
        kind: 'reversal',
        summary: '新的结构摘要',
        status: 'workspace',
      },
    })

    const content = files.get('edit/productions/production_7/production.json')
    assert.ok(content)
    const projection = JSON.parse(content)
    assert.equal(projection.schema, 'movscript.production_workspace.v1')
    assert.equal(projection.scope, 'production_workspace')
    assert.equal(projection.productionId, 7)
    assert.equal(projection.workspace.segments[0].title, '新段落')
    assert.equal(projection.workspace.segments[0].kind, 'reversal')
    assert.equal(projection.workspace.segments[0].scene_moments[0].title, '情节一')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('production workspace repository saves scene moment reorder across segments', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await saveProductionSceneMomentOrderWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      patches: [
        { momentId: 11, payload: { order: 1 } },
        { momentId: 10, payload: { order: 2, segment_id: 2 } },
      ],
    })

    const projection = JSON.parse(files.get('edit/productions/production_7/production.json') ?? '{}')
    assert.deepEqual(projection.workspace.segments[0].scene_moments.map((moment: { id: number }) => moment.id), [11])
    assert.deepEqual(projection.workspace.segments[1].scene_moments.map((moment: { id: number }) => moment.id), [20, 10])
    assert.equal(projection.workspace.segments[1].scene_moments[1].order, 2)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('production workspace repository saves writing expression changes into production snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await saveProductionWritingExpressionWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      target: { kind: 'writingExpressions', id: 100 },
      payload: {
        kind: 'dialogue',
        speaker: '林夏',
        text: '我看见了。',
        note: '压低声音',
        intent: '发现线索',
      },
    })

    const projection = JSON.parse(files.get('edit/productions/production_7/production.json') ?? '{}')
    const expression = projection.workspace.segments[0].scene_moments[0].writing_expressions[0]
    assert.equal(expression.id, 100)
    assert.equal(expression.speaker, '林夏')
    assert.equal(expression.text, '我看见了。')
    assert.equal(expression.intent, '发现线索')
  } finally {
    restoreWindow(previousWindow)
  }
})

test('production workspace repository creates and deletes writing expressions in production snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  const originalDateNow = Date.now
  Date.now = () => 123456
  try {
    await createProductionWritingExpressionWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      momentId: 11,
      order: 2,
      scriptBlockId: null,
    })
    let projection = JSON.parse(files.get('edit/productions/production_7/production.json') ?? '{}')
    let expressions = projection.workspace.segments[0].scene_moments[1].writing_expressions
    assert.equal(expressions[0].client_id, 'writing_expression_local_123456')
    assert.equal(expressions[0].kind, 'dialogue')
    assert.equal(expressions[0].order, 2)

    await deleteProductionWritingExpressionWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      expressionId: 100,
    })
    projection = JSON.parse(files.get('edit/productions/production_7/production.json') ?? '{}')
    expressions = projection.workspace.segments[0].scene_moments[0].writing_expressions
    assert.equal(expressions[0].id, 100)
    assert.equal(expressions[0].__delete, true)
  } finally {
    Date.now = originalDateNow
    restoreWindow(previousWindow)
  }
})

test('production workspace repository links and unlinks scene moment references in production snapshot', async () => {
  const previousWindow = globalThis.window
  const files = new Map<string, string>()
  setWorkspaceTestWindow(files)
  try {
    await linkProductionSceneMomentReferenceWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      momentId: 11,
      reference: { ID: 501, name: '林夏', kind: 'person' },
      role: 'lead',
    })
    let projection = JSON.parse(files.get('edit/productions/production_7/production.json') ?? '{}')
    let references = projection.workspace.segments[0].scene_moments[1].settings
    assert.equal(references[0].id, 501)
    assert.equal(references[0].name, '林夏')
    assert.equal(references[0].role, 'lead')

    await unlinkProductionSceneMomentReferenceWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      momentId: 10,
      referenceId: 500,
    })
    projection = JSON.parse(files.get('edit/productions/production_7/production.json') ?? '{}')
    references = projection.workspace.segments[0].scene_moments[0].settings
    assert.equal(references[0].id, 500)
    assert.equal(references[0].__delete, true)
  } finally {
    restoreWindow(previousWindow)
  }
})

test('production workspace file path follows the project repository layout', () => {
  assert.equal(
    productionWorkspaceFilePath('local', 9, 7),
    'edit/productions/production_7/production.json',
  )
})

function snapshot(): ProductionWorkspaceSnapshot {
  return {
    segments: [
      {
        id: 1,
        title: '段落一',
        kind: 'setup',
        order: 1,
        scene_moments: [
          {
            id: 10,
            title: '情节一',
            order: 1,
            settings: [
              { id: 500, name: '旧设定', kind: 'person', role: 'supporting' },
            ],
            writing_expressions: [
              { id: 100, kind: 'dialogue', speaker: '旧说话人', text: '旧台词', order: 1 },
            ],
          },
          { id: 11, title: '情节二', order: 2 },
        ],
      },
      {
        id: 2,
        title: '段落二',
        kind: 'reversal',
        order: 2,
        scene_moments: [
          { id: 20, title: '情节三', order: 1 },
        ],
      },
    ],
  }
}

function setWorkspaceTestWindow(files: Map<string, string>): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        getMovScriptWorkspaceRoot: async () => ({
          workspaceDir: '/tmp/movscript',
          rootDir: '/tmp/movscript',
          controlDir: '/tmp/movscript/.movscript',
          manifestPath: '/tmp/movscript/.movscript/manifest.json',
          editDir: '/tmp/movscript/edit',
          buildDir: '/tmp/movscript/.build',
          buildCurrentDir: '/tmp/movscript/.build/current',
          buildIndexesDir: '/tmp/movscript/.build/indexes',
          buildReviewsDir: '/tmp/movscript/.build/reviews',
          buildManifestsDir: '/tmp/movscript/.build/manifests',
          providersDir: '/tmp/movscript/.movscript/providers',
          backendDir: '/tmp/movscript/.movscript/backend',
          manifest: {
            schema: 'movscript.project-workspace.v1',
            workspaceId: 'test',
            activeUserId: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            layout: {
              editableRoot: 'edit',
              buildRoot: '.build',
              providerConfigRoot: 'providers',
            },
          },
        }),
        writeMovScriptWorkspaceFile: async ({ path, content }: { path: string; content: string }) => {
          files.set(path, content)
          return {
            rootPath: '/tmp/movscript/.movscript',
            path,
            content,
            size: content.length,
            updatedAt: '2026-01-01T00:00:00.000Z',
          }
        },
      },
    },
  })
}

function restoreWindow(previousWindow: typeof globalThis.window): void {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
    return
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: previousWindow,
  })
}
