import assert from 'node:assert/strict'
import test from 'node:test'
import { WORKSPACE_CONTENT_SCHEMA_IDS, WORKSPACE_SCOPES } from '@movscript/workspaces'

import type { AgentWorkspace } from '@/shared/infrastructure/localAgentClient'
import {
  appendProductionWorkspaceWorkspaceSceneMoment,
  appendProductionWorkspaceWorkspaceSegment,
  appendProductionWorkspaceWorkspaceCreativeReference,
  productionWorkspaceWorkspaceNodeKey,
  removeProductionWorkspaceWorkspaceCreativeReference,
  removeProductionWorkspaceWorkspaceSceneMoment,
  removeProductionWorkspaceWorkspaceSegment,
  replaceProductionWorkspaceWorkspaceSceneMoment,
  replaceProductionWorkspaceWorkspaceSegment,
  updateProductionWorkspaceWorkspaceText,
} from './productionWorkspaceWorkspaceEdit'

test('production workspace workspace edits patch workspace content text', () => {
  const workspace = productionWorkspace({
    workspace: {
      segments: [{
        id: 10,
        title: '旧段落',
        kind: 'scene',
        summary: '旧摘要',
        scene_moments: [{
          id: 20,
          title: '旧情节',
          time_text: '夜',
          location_text: '街口',
          action_text: '等待',
        }],
      }],
    },
  })

  const result = updateProductionWorkspaceWorkspaceText(workspace, (content) => {
    const segmentKey = productionWorkspaceWorkspaceNodeKey(content.workspace.segments[0]!, 'segment:0')
    replaceProductionWorkspaceWorkspaceSegment(content, segmentKey, {
      ...content.workspace.segments[0]!,
      title: '新段落',
      summary: '新摘要',
    })
    replaceProductionWorkspaceWorkspaceSceneMoment(content, segmentKey, 'id:20', {
      ...content.workspace.segments[0]!.scene_moments![0]!,
      action_text: '推门进入',
    })
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.equal(content.schema, WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace)
  assert.equal(content.workspace.segments[0].title, '新段落')
  assert.equal(content.workspace.segments[0].summary, '新摘要')
  assert.equal(content.workspace.segments[0].scene_moments[0].action_text, '推门进入')
})

test('production workspace workspace edits add and remove workspace nodes', () => {
  const workspace = productionWorkspace({
    workspace: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        scene_moments: [{ client_id: 'moment-a', title: '情节 A' }],
      }],
    },
  })

  const result = updateProductionWorkspaceWorkspaceText(workspace, (content) => {
    removeProductionWorkspaceWorkspaceSceneMoment(content, 'client:segment-a', 'client:moment-a')
    appendProductionWorkspaceWorkspaceSceneMoment(content, 'client:segment-a', {
      client_id: 'moment-b',
      title: '情节 B',
      action_text: '新的动作',
    })
    appendProductionWorkspaceWorkspaceSegment(content, {
      client_id: 'segment-b',
      title: '段落 B',
      summary: '新增段落',
      scene_moments: [],
    })
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.workspace.segments.map((segment: { client_id: string }) => segment.client_id), ['segment-a', 'segment-b'])
  assert.deepEqual(content.workspace.segments[0].scene_moments.map((moment: { client_id: string }) => moment.client_id), ['moment-b'])
  assert.equal(content.workspace.segments[1].order, 2)
})

test('production workspace workspace edits can clear script block bindings', () => {
  const workspace = productionWorkspace({
    workspace: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        script_block_id: 5,
        scene_moments: [{ client_id: 'moment-a', title: '情节 A', script_block_id: 6 }],
      }],
    },
  })

  const result = updateProductionWorkspaceWorkspaceText(workspace, (content) => {
    replaceProductionWorkspaceWorkspaceSegment(content, 'client:segment-a', { script_block_id: null })
    replaceProductionWorkspaceWorkspaceSceneMoment(content, 'client:segment-a', 'client:moment-a', { script_block_id: null })
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.equal(content.workspace.segments[0].script_block_id, null)
  assert.equal(content.workspace.segments[0].scene_moments[0].script_block_id, null)
})

test('production workspace workspace edit rejects invalid workspace text', () => {
  const result = updateProductionWorkspaceWorkspaceText({ ...productionWorkspace({}), content: '{"schema":"wrong"}' }, () => {
    throw new Error('should not run')
  })

  assert.equal(result.error, '这不是可编辑的 production workspace snapshot 工作区。')
})

test('production workspace workspace edit can remove a segment from the workspace', () => {
  const workspace = productionWorkspace({
    workspace: {
      segments: [
        { client_id: 'keep', title: '保留', scene_moments: [] },
        { client_id: 'remove', title: '移除', scene_moments: [] },
      ],
    },
  })

  const result = updateProductionWorkspaceWorkspaceText(workspace, (content) => {
    assert.equal(replaceProductionWorkspaceWorkspaceSegment(content, 'missing', { title: '不会写入' }), false)
    const removed = removeProductionWorkspaceWorkspaceSegment(content, 'client:remove')
    assert.equal(removed, true)
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.workspace.segments.map((segment: { client_id: string }) => segment.client_id), ['keep'])
})

test('production workspace workspace edits scene moment creative references', () => {
  const workspace = productionWorkspace({
    workspace: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        scene_moments: [{
          client_id: 'moment-a',
          title: '情节 A',
          creative_references: [{ id: 1, name: '旧人物', role: 'supporting' }],
        }],
      }],
    },
  })

  const result = updateProductionWorkspaceWorkspaceText(workspace, (content) => {
    appendProductionWorkspaceWorkspaceCreativeReference(content, 'client:segment-a', 'client:moment-a', {
      id: 2,
      name: '新人物',
      kind: 'person',
      role: 'protagonist',
    })
    removeProductionWorkspaceWorkspaceCreativeReference(content, 'client:segment-a', 'client:moment-a', 'id:1')
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.workspace.segments[0].scene_moments[0].creative_references, [{
    id: 2,
    name: '新人物',
    kind: 'person',
    role: 'protagonist',
  }])
})

function productionWorkspace(content: Record<string, unknown>): AgentWorkspace {
  return {
    id: 'workspace-production',
    kind: 'production_workspace',
    title: 'Production workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace,
      scope: WORKSPACE_SCOPES.productionWorkspace,
      mode: 'snapshot',
      productionId: 12,
      workspaceScope: 'production',
      summary: '',
      workspace: { segments: [] },
      impact_notes: [],
      proposedAt: '2026-05-22T00:00:00.000Z',
      ...content,
    }),
    status: 'workspace',
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
  }
}
