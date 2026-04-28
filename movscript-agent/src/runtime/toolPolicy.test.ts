import assert from 'node:assert/strict'
import test from 'node:test'
import { applyToolPolicy } from './toolPolicy.js'
import { DEFAULT_AGENT_MANIFEST } from './agentManifest.js'
import { DEFAULT_TOOL_REGISTRY } from './toolRegistry.js'

test('tool policy injects current projectId into project scoped tools', () => {
  const result = applyToolPolicy([
    { name: 'movscript.search_entities', args: { query: '角色', limit: 10 } },
    { name: 'movscript.create_draft', args: { kind: 'note', title: 't', content: 'c' } },
  ], { currentProjectId: 42 })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].args?.projectId, 42)
  assert.equal(result.toolCalls[1].args?.projectId, 42)
})

test('tool policy blocks project scoped tools without a current project', () => {
  const result = applyToolPolicy([
    { name: 'movscript.search_entities', args: { query: '角色', limit: 10 } },
  ], {})

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['当前没有选中项目'])
})

test('tool policy blocks tools outside the whitelist', () => {
  const result = applyToolPolicy([
    { name: 'movscript.delete_entity', args: { entityId: 1 } },
  ], { currentProjectId: 42 })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['movscript.delete_entity 未注册到当前 agent 工具表中'])
  assert.equal(result.blockedToolCalls[0].reason, 'unknown_tool')
})

test('tool policy blocks registered tools that the manifest does not grant', () => {
  const result = applyToolPolicy([
    { name: 'movscript.create_draft', args: { kind: 'note', title: 't', content: 'c' } },
  ], {
    currentProjectId: 42,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read'],
      tools: [{ name: 'movscript.search_entities', mode: 'allow' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['movscript.create_draft 未被当前 agent manifest 授权'])
  assert.equal(result.blockedToolCalls[0].reason, 'not_granted')
})

test('tool policy blocks write/generation tools until explicitly approved', () => {
  const result = applyToolPolicy([
    { name: 'movscript.create_generation_job', args: { prompt: 'test' } },
  ], {
    currentProjectId: 42,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['generation.create'],
      tools: [{ name: 'movscript.create_generation_job', mode: 'allow', approval: 'always' }],
    },
    registry: DEFAULT_TOOL_REGISTRY,
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['movscript.create_generation_job 需要用户确认后才能执行'])
  assert.equal(result.blockedToolCalls[0].reason, 'approval_required')
})

test('tool policy allows approved generation tools and injects projectId', () => {
  const result = applyToolPolicy([
    { name: 'movscript.create_generation_job', args: { prompt: 'test' } },
  ], {
    currentProjectId: 42,
    approvedToolNames: ['movscript.create_generation_job'],
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['generation.create'],
      tools: [{ name: 'movscript.create_generation_job', mode: 'allow', approval: 'always' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].args?.projectId, 42)
})
