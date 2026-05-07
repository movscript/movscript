import assert from 'node:assert/strict'
import test from 'node:test'
import { applyToolPolicy } from './toolPolicy.js'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
import { StaticToolRegistry } from './toolRegistry.js'

const registry = new StaticToolRegistry([
  {
    name: 'movscript_search_entities',
    description: 'Search project items by business terms.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_list_productions',
    description: 'List productions.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_create_draft',
    description: 'Create a local draft artifact.',
    permission: 'draft.write',
    risk: 'draft',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_create_project',
    description: 'Create a project.',
    permission: 'project.write',
    risk: 'write',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript_create_generation_job',
    description: 'Create a generation job.',
    permission: 'generation.create',
    risk: 'generate',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
])

test('tool policy injects current projectId into project scoped tools', () => {
  const result = applyToolPolicy([
    { name: 'movscript_search_entities', args: { query: '角色', limit: 10 } },
    { name: 'movscript_list_productions', args: { limit: 10 } },
    { name: 'movscript_create_draft', args: { kind: 'note', title: 't', content: 'c' } },
  ], { currentProjectId: 42, registry })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].args?.projectId, 42)
  assert.equal(result.toolCalls[1].args?.projectId, 42)
  assert.equal(result.toolCalls[2].args?.projectId, 42)
})

test('tool policy blocks project scoped tools without a current project', () => {
  const result = applyToolPolicy([
    { name: 'movscript_search_entities', args: { query: '角色', limit: 10 } },
  ], { registry })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['当前没有选中项目'])
})

test('tool policy allows approved project creation without a current project', () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    permissions: [...DEFAULT_AGENT_MANIFEST.permissions, 'project.write'],
    tools: [
      ...DEFAULT_AGENT_MANIFEST.tools,
      { name: 'movscript_create_project', mode: 'allow' as const, approval: 'always' as const },
    ],
  }
  const blocked = applyToolPolicy([
    { name: 'movscript_create_project', args: { name: '测试项目' } },
  ], { manifest, registry })

  assert.deepEqual(blocked.toolCalls, [])
  assert.equal(blocked.blockedToolCalls[0].reason, 'approval_required')

  const approved = applyToolPolicy([
    { name: 'movscript_create_project', args: { name: '测试项目' } },
  ], { manifest, approvedToolNames: ['movscript_create_project'], registry })

  assert.deepEqual(approved.warnings, [])
  assert.equal(approved.toolCalls[0].name, 'movscript_create_project')
  assert.equal(approved.toolCalls[0].args?.projectId, undefined)
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
    { name: 'movscript_create_draft', args: { kind: 'note', title: 't', content: 'c' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read'],
      tools: [{ name: 'movscript_search_entities', mode: 'allow' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['movscript_create_draft 未被当前 agent manifest 授权'])
  assert.equal(result.blockedToolCalls[0].reason, 'not_granted')
})

test('tool policy blocks write/generation tools until explicitly approved', () => {
  const result = applyToolPolicy([
    { name: 'movscript_create_generation_job', args: { prompt: 'test' } },
  ], {
    currentProjectId: 42,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['generation.create'],
      tools: [{ name: 'movscript_create_generation_job', mode: 'allow', approval: 'always' }],
    },
    registry,
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['movscript_create_generation_job 需要用户确认后才能执行'])
  assert.equal(result.blockedToolCalls[0].reason, 'approval_required')
})

test('tool policy allows approved generation tools and injects projectId', () => {
  const result = applyToolPolicy([
    { name: 'movscript_create_generation_job', args: { prompt: 'test' } },
  ], {
    currentProjectId: 42,
    approvedToolNames: ['movscript_create_generation_job'],
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['generation.create'],
      tools: [{ name: 'movscript_create_generation_job', mode: 'allow', approval: 'always' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].args?.projectId, 42)
})

test('tool policy lets sandbox intercept approval-gated write and generation tools', () => {
  const result = applyToolPolicy([
    { name: 'movscript_create_generation_job', args: { prompt: 'test' } },
  ], {
    currentProjectId: 42,
    sandboxMode: true,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['generation.create'],
      tools: [{ name: 'movscript_create_generation_job', mode: 'allow', approval: 'always' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.blockedToolCalls.length, 0)
  assert.equal(result.toolCalls[0].args?.projectId, 42)
})
