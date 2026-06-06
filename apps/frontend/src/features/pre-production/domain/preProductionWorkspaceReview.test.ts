import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPreProductionWorkspaceContentForEntries,
  buildPreProductionWorkspaceEntryDiffRows,
  parsePreProductionWorkspaceArtifact,
} from '@/features/pre-production/domain/preProductionWorkspaceReview'
import type { WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'

function workspace(input: Partial<WorkspaceArtifact> & Pick<WorkspaceArtifact, 'id' | 'kind' | 'content'>): WorkspaceArtifact {
  return {
    title: input.id,
    status: 'workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...input,
  }
}

test('project layer workspace review can isolate setting workspace entries', () => {
  const view = parsePreProductionWorkspaceArtifact(
    workspace({
      id: 'setting-workspace',
      kind: 'setting_workspace',
      content: JSON.stringify({
        summary: '整理角色设定',
        mode: 'snapshot',
        workspace: {
          creative_references: [
            { id: 7, name: '主角', description: '新的角色说明' },
          ],
          asset_slots: [
            { name: '角色头像', kind: 'image' },
          ],
        },
      }),
    }),
    {
      creativeReferences: [{ ID: 7, name: '主角', description: '旧的角色说明' }],
      assetSlots: [],
    },
    { includeAssetSlots: false },
  )

  assert.equal(view?.summary, '整理角色设定')
  assert.equal(view?.creativeReferences.length, 1)
  assert.equal(view?.assetSlots.length, 0)
  assert.equal(view?.creativeReferences[0]?.changeType, 'modified')
})

test('project layer workspace review matches backend-shaped setting workspace rows by uppercase ID', () => {
  const view = parsePreProductionWorkspaceArtifact(
    workspace({
      id: 'setting-workspace',
      kind: 'setting_workspace',
      content: JSON.stringify({
        schema: 'movscript.setting_workspace.v1',
        scope: 'setting_workspace',
        mode: 'snapshot',
        workspace: {
          creative_references: [
            {
              ID: 7,
              project_id: 2,
              workspace_client_id: 'cr_hero',
              kind: 'character',
              name: '主角',
              description: '旧的角色说明',
              content: '关系：家人',
              importance: 'core',
              status: 'needs_review',
            },
            {
              ID: 8,
              project_id: 2,
              workspace_client_id: 'cr_supporting',
              kind: 'character',
              name: '配角',
              description: '保留不动',
              content: '',
              importance: 'supporting',
              status: 'needs_review',
            },
          ],
        },
      }),
    }),
    {
      creativeReferences: [
        { ID: 7, name: '主角', kind: 'character', description: '旧的角色说明', content: '关系：家人', importance: 'core', status: 'needs_review' },
        { ID: 8, name: '配角', kind: 'character', description: '保留不动', content: '', importance: 'supporting', status: 'needs_review' },
      ],
      assetSlots: [],
    },
    { includeAssetSlots: false },
  )

  assert.equal(view?.creativeReferences.length, 2)
  assert.deepEqual(view?.creativeReferences.map((entry) => entry.changeType), ['unchanged', 'unchanged'])
  assert.deepEqual(view?.creativeReferences.map((entry) => entry.target), ['合并到 #7', '合并到 #8'])
  assert.equal(view?.creativeReferences.some((entry) => entry.inferred && entry.changeType === 'deleted'), false)
})

test('project layer workspace review can isolate asset slot workspace entries and diff owner', () => {
  const view = parsePreProductionWorkspaceArtifact(
    workspace({
      id: 'asset-workspace-workspace',
      kind: 'asset_workspace',
      content: JSON.stringify({
        mode: 'snapshot',
        workspace: {
          creative_references: [
            { name: '角色设定' },
          ],
          asset_slots: [
            {
              id: 12,
              owner: { type: 'creative_reference', id: 9 },
              name: '角色半身照',
              kind: 'image',
              prompt_hint: '正面站姿',
            },
          ],
        },
      }),
    }),
    {
      creativeReferences: [],
      assetSlots: [{ ID: 12, name: '角色半身照', prompt_hint: '侧面站姿', creative_reference_id: 8 }],
    },
    { includeCreativeReferences: false },
  )

  assert.equal(view?.creativeReferences.length, 0)
  assert.equal(view?.assetSlots.length, 1)
  assert.equal(view?.assetSlots[0]?.changeType, 'modified')

  const rows = buildPreProductionWorkspaceEntryDiffRows(
    view!.assetSlots[0]!,
    {
      creativeReferences: [],
      assetSlots: [{ ID: 12, name: '角色半身照', prompt_hint: '侧面站姿', creative_reference_id: 8 }],
    },
    new Map([
      ['8', '旧角色'],
      ['9', '新角色'],
    ]),
  )

  assert.ok(rows.some((row) => row.label === '用途' && row.before === '侧面站姿' && row.after === '正面站姿'))
  assert.ok(rows.some((row) => row.label === '归属' && row.before === '旧角色' && row.after === '新角色'))
})

test('project layer workspace review matches backend-shaped asset slot workspace rows by uppercase ID', () => {
  const view = parsePreProductionWorkspaceArtifact(
    workspace({
      id: 'asset-workspace',
      kind: 'asset_workspace',
      content: JSON.stringify({
        schema: 'movscript.asset_workspace.v1',
        scope: 'asset_workspace',
        mode: 'snapshot',
        workspace: {
          asset_slots: [
            {
              ID: 12,
              name: '角色半身照',
              kind: 'image',
              description: '正面站姿',
              prompt_hint: '干净背景',
              priority: 'high',
              status: 'needs_review',
              creative_reference_id: 7,
            },
            {
              ID: 13,
              name: '场景俯视图',
              kind: 'image',
              description: '街区空间关系',
              prompt_hint: '俯视调度图',
              priority: 'normal',
              status: 'needs_review',
              creative_reference_id: 8,
            },
          ],
        },
      }),
    }),
    {
      creativeReferences: [
        { ID: 7, name: '主角' },
        { ID: 8, name: '街区' },
      ],
      assetSlots: [
        { ID: 12, name: '角色半身照', kind: 'image', description: '正面站姿', prompt_hint: '干净背景', priority: 'high', status: 'needs_review', creative_reference_id: 7 },
        { ID: 13, name: '场景俯视图', kind: 'image', description: '街区空间关系', prompt_hint: '俯视调度图', priority: 'normal', status: 'needs_review', creative_reference_id: 8 },
      ],
    },
    { includeCreativeReferences: false },
  )

  assert.equal(view?.assetSlots.length, 2)
  assert.deepEqual(view?.assetSlots.map((entry) => entry.changeType), ['unchanged', 'unchanged'])
  assert.deepEqual(view?.assetSlots.map((entry) => entry.target), ['调整 #12', '调整 #13'])
  assert.equal(view?.assetSlots.some((entry) => entry.inferred && entry.changeType === 'deleted'), false)
})

test('buildPreProductionWorkspaceContentForEntries keeps unselected backend rows in snapshot apply payload', () => {
  const sourceWorkspace = workspace({
    id: 'setting-workspace',
    kind: 'setting_workspace',
    content: JSON.stringify({
      mode: 'snapshot',
      workspace: {
        creative_references: [
          { id: 7, name: '主角', description: '新的角色说明' },
        ],
      },
    }),
  })
  const data = {
    creativeReferences: [
      { ID: 7, name: '主角', description: '旧的角色说明' },
      { ID: 8, name: '配角', description: '保留不动' },
    ],
    assetSlots: [],
  }
  const view = parsePreProductionWorkspaceArtifact(sourceWorkspace, data, { includeAssetSlots: false })
  const payload = JSON.parse(buildPreProductionWorkspaceContentForEntries(sourceWorkspace, [view!.creativeReferences[0]!], data)) as Record<string, any>

  assert.equal(payload.mode, 'snapshot')
  assert.equal(payload.snapshot_base, undefined)
  assert.deepEqual(payload.workspace.creative_references.map((item: any) => item.id).sort(), [7, 8])
  assert.equal(payload.workspace.creative_references.find((item: any) => item.id === 7)?.description, '新的角色说明')
  assert.equal(payload.workspace.creative_references.find((item: any) => item.id === 8)?.description, '保留不动')
  assert.equal(payload.workspace.asset_slots, undefined)
})

test('buildPreProductionWorkspaceContentForEntries scopes asset workspace payload to asset slots', () => {
  const sourceWorkspace = workspace({
    id: 'asset-workspace',
    kind: 'asset_workspace',
    content: JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [{ id: 7, name: '工作区内设定' }],
        asset_slots: [
          { name: '角色头像', kind: 'image', owner: { type: 'creative_reference', client_id: 'hero_ref' } },
        ],
      },
    }),
  })
  const data = {
    creativeReferences: [
      { ID: 7, name: '已入库角色', description: '当前设定' },
    ],
    assetSlots: [
      { ID: 12, name: '旧头像', kind: 'image', creative_reference_id: 7 },
    ],
  }
  const view = parsePreProductionWorkspaceArtifact(sourceWorkspace, data, { includeCreativeReferences: false })
  const payload = JSON.parse(buildPreProductionWorkspaceContentForEntries(sourceWorkspace, [view!.assetSlots[0]!], data)) as Record<string, any>

  assert.equal(payload.mode, 'snapshot')
  assert.equal(payload.snapshot_base, undefined)
  assert.equal(payload.workspace.creative_references, undefined)
  assert.deepEqual(payload.workspace.asset_slots.map((item: any) => item.name).sort(), ['旧头像', '角色头像'])
})

test('buildPreProductionWorkspaceContentForEntries rebases stale asset owner ids from current references', () => {
  const sourceWorkspace = workspace({
    id: 'asset-workspace',
    kind: 'asset_workspace',
    content: JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [],
        asset_slots: [
          { name: '女主形象图', kind: 'image', owner: { type: 'creative_reference', id: 999 }, description: '女主官方人设图' },
        ],
      },
    }),
  })
  const data = {
    creativeReferences: [
      { ID: 41, name: '苏晚', description: '女主，单亲妈妈' },
      { ID: 42, name: '陆景深', description: '男主，集团总裁' },
    ],
    assetSlots: [],
  }
  const view = parsePreProductionWorkspaceArtifact(sourceWorkspace, data, { includeCreativeReferences: false })
  const payload = JSON.parse(buildPreProductionWorkspaceContentForEntries(sourceWorkspace, [view!.assetSlots[0]!], data)) as Record<string, any>
  const slot = payload.workspace.asset_slots[0]

  assert.equal(slot.owner.id, 41)
  assert.equal(slot.creative_reference_id, 41)
})
