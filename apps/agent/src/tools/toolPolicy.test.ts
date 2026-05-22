import assert from 'node:assert/strict'
import test from 'node:test'
import { applyToolPolicy } from './toolPolicy.js'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { StaticToolRegistry } from './toolRegistry.js'

const registry = new StaticToolRegistry([
  {
    name: 'movscript_project_script_read',
    description: 'Read project scripts.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'draft_create',
    description: 'Create a local draft artifact.',
    permission: 'draft.write',
    risk: 'draft',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_project_create',
    description: 'Create a project.',
    permission: 'project.write',
    risk: 'write',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
  {
    name: 'core_work_start',
    description: 'Start a runtime work.',
    permission: 'agent.work.write',
    risk: 'generate',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
  {
    name: 'core_work_get',
    description: 'Inspect a runtime work.',
    permission: 'agent.work.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'core_work_cancel',
    description: 'Cancel a runtime work.',
    permission: 'agent.work.write',
    risk: 'write',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
  {
    name: 'draft_apply',
    description: 'Apply a draft.',
    permission: 'draft.apply',
    risk: 'write',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript_delete_project',
    description: 'Delete a project.',
    permission: 'project.delete',
    risk: 'destructive',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
])

test('tool policy injects current projectId into project scoped tools', () => {
  const result = applyToolPolicy([
    { name: 'movscript_project_script_read', args: { limit: 10 } },
    { name: 'draft_create', args: { kind: 'note', title: 't', content: 'c' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'draft_create', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].args?.projectId, 42)
  assert.equal(result.toolCalls[1].args?.projectId, 42)
})

test('tool policy blocks project scoped tools without a current project', () => {
  const result = applyToolPolicy([
    { name: 'movscript_project_script_read', args: { limit: 10 } },
  ], { registry })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['当前没有选中项目'])
})

test('tool policy allows explicit projectId for read-only project scoped tools without a current project', () => {
  const result = applyToolPolicy([
    { name: 'movscript_project_script_read', args: { projectId: 42, limit: 10 } },
  ], { registry })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.blockedToolCalls.length, 0)
  assert.equal(result.toolCalls[0].name, 'movscript_project_script_read')
  assert.equal(result.toolCalls[0].args?.projectId, 42)
})

test('tool policy still requires a current project for non-read project scoped tools', () => {
  const result = applyToolPolicy([
    { name: 'draft_create', args: { projectId: 42, kind: 'note', title: 't', content: 'c' } },
  ], {
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'draft_create', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['当前没有选中项目'])
  assert.equal(result.blockedToolCalls[0]?.reason, 'missing_project')
})

test('tool policy blocks project scoped tools with invalid current project ids', () => {
  for (const currentProjectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = applyToolPolicy([
      { name: 'movscript_project_script_read', args: { limit: 10 } },
    ], { currentProjectId, registry })

    assert.deepEqual(result.toolCalls, [])
    assert.deepEqual(result.warnings, ['当前没有选中项目'])
    assert.equal(result.blockedToolCalls[0]?.reason, 'missing_project')
  }
})

test('tool policy allows approved project creation without a current project', () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [
      ...DEFAULT_AGENT_MANIFEST.tools,
      { name: 'movscript_project_create', mode: 'allow' as const, approval: 'always' as const },
    ],
  }
  const blocked = applyToolPolicy([
    { name: 'movscript_project_create', args: { name: '测试项目' } },
  ], { manifest, registry })

  assert.deepEqual(blocked.toolCalls, [])
  assert.equal(blocked.blockedToolCalls[0].reason, 'approval_required')

  const approved = applyToolPolicy([
    { name: 'movscript_project_create', args: { name: '测试项目' } },
  ], { manifest, approvedToolNames: ['movscript_project_create'], registry })

  assert.deepEqual(approved.warnings, [])
  assert.equal(approved.toolCalls[0].name, 'movscript_project_create')
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
    { name: 'draft_create', args: { kind: 'note', title: 't', content: 'c' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_project_script_read', mode: 'allow' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['draft_create 未被当前 agent manifest 授权'])
  assert.equal(result.blockedToolCalls[0].reason, 'not_granted')
})

test('tool policy blocks write/generation tools until explicitly approved', () => {
  const result = applyToolPolicy([
    { name: 'core_work_start', args: { kind: 'generation_job', request: { prompt: 'test' } } },
  ], {
    currentProjectId: 42,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'core_work_start', mode: 'allow', approval: 'always' }],
    },
    registry,
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['core_work_start 需要用户确认后才能执行'])
  assert.equal(result.blockedToolCalls[0].reason, 'approval_required')
})

test('tool policy allows approved generation tools and injects projectId', () => {
  const result = applyToolPolicy([
    { name: 'core_work_start', args: { kind: 'generation_job', request: { prompt: 'test' } } },
  ], {
    currentProjectId: 42,
    approvedToolNames: ['core_work_start'],
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'core_work_start', mode: 'allow', approval: 'always' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal((result.toolCalls[0].args?.request as any)?.projectId, 42)
})

test('tool policy allows generation job inspection without approval', () => {
  const result = applyToolPolicy([
    { name: 'core_work_get', args: { workId: 'work_123' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'core_work_get', mode: 'allow', approval: 'never' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].name, 'core_work_get')
  assert.equal(result.toolCalls[0].args?.projectId, 42)
})

test('tool policy requires approval before cancelling generation jobs', () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [{ name: 'core_work_cancel', mode: 'allow' as const, approval: 'always' as const }],
  }
  const blocked = applyToolPolicy([
    { name: 'core_work_cancel', args: { workId: 'work_123' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest,
  })

  assert.deepEqual(blocked.toolCalls, [])
  assert.equal(blocked.blockedToolCalls[0].reason, 'approval_required')

  const approved = applyToolPolicy([
    { name: 'core_work_cancel', args: { workId: 'work_123' } },
  ], {
    currentProjectId: 42,
    approvedToolNames: ['core_work_cancel'],
    registry,
    manifest,
  })

  assert.deepEqual(approved.warnings, [])
  assert.equal(approved.toolCalls[0].args?.projectId, 42)
})

test('tool policy lets sandbox intercept approval-gated write and generation tools', () => {
  const result = applyToolPolicy([
    { name: 'core_work_start', args: { kind: 'generation_job', request: { prompt: 'test' } } },
  ], {
    currentProjectId: 42,
    sandboxMode: true,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'core_work_start', mode: 'allow', approval: 'always' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.blockedToolCalls.length, 0)
  assert.equal((result.toolCalls[0].args?.request as any)?.projectId, 42)
})

test('tool policy auto approval mode allows granted write tools without explicit approval', () => {
  const result = applyToolPolicy([
    { name: 'draft_apply', args: { draftId: 'draft_1' } },
  ], {
    approvalMode: 'auto',
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'draft_apply', mode: 'allow', approval: 'on_write' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.blockedToolCalls.length, 0)
  assert.equal(result.toolCalls[0].name, 'draft_apply')
})

test('tool policy readonly auto mode still blocks draft apply writes', () => {
  const result = applyToolPolicy([
    { name: 'draft_apply', args: { draftId: 'draft_1' } },
  ], {
    approvalMode: 'auto_readonly',
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'draft_apply', mode: 'allow', approval: 'on_write' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.equal(result.blockedToolCalls[0]?.reason, 'approval_required')
})

test('tool policy auto approval mode does not auto-approve destructive tools', () => {
  const result = applyToolPolicy([
    { name: 'movscript_delete_project', args: { projectId: 42 } },
  ], {
    approvalMode: 'auto',
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_delete_project', mode: 'allow', approval: 'always' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.equal(result.blockedToolCalls[0]?.reason, 'approval_required')
})
