import assert from 'node:assert/strict'
import test from 'node:test'
import { applyToolPermissions } from './toolPermissions.js'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import { StaticToolRegistry } from '../../registry/core/toolRegistry.js'

const registry = new StaticToolRegistry([
  {
    name: 'movscript_script_locate',
    description: 'Read project scripts.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'workspace_open',
    description: 'Create a local workspace artifact.',
    permission: 'workspace.write',
    risk: 'workspace',
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
    name: 'workspace_apply',
    description: 'Apply a workspace.',
    permission: 'workspace.apply',
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

test('tool permissions injects current projectId into project scoped tools', () => {
  const result = applyToolPermissions([
    { name: 'movscript_script_locate', args: { limit: 10 } },
    { name: 'workspace_open', args: { kind: 'project_standards_workspace', title: 't', content: 'c' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'workspace_open', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.toolCalls[0].args?.projectId, 42)
  assert.equal(result.toolCalls[1].args?.projectId, 42)
})

test('tool permissions blocks project scoped tools without a current project', () => {
  const result = applyToolPermissions([
    { name: 'movscript_script_locate', args: { limit: 10 } },
  ], { registry })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['当前没有选中项目'])
})

test('tool permissions allows explicit projectId for read-only project scoped tools without a current project', () => {
  const result = applyToolPermissions([
    { name: 'movscript_script_locate', args: { projectId: 42, limit: 10 } },
  ], { registry })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.blockedToolCalls.length, 0)
  assert.equal(result.toolCalls[0].name, 'movscript_script_locate')
  assert.equal(result.toolCalls[0].args?.projectId, 42)
})

test('tool permissions still requires a current project for non-read project scoped tools', () => {
  const result = applyToolPermissions([
    { name: 'workspace_open', args: { projectId: 42, kind: 'project_standards_workspace', title: 't', content: 'c' } },
  ], {
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'workspace_open', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['当前没有选中项目'])
  assert.equal(result.blockedToolCalls[0]?.reason, 'missing_project')
})

test('tool permissions blocks project scoped tools with invalid current project ids', () => {
  for (const currentProjectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = applyToolPermissions([
      { name: 'movscript_script_locate', args: { limit: 10 } },
    ], { currentProjectId, registry })

    assert.deepEqual(result.toolCalls, [])
    assert.deepEqual(result.warnings, ['当前没有选中项目'])
    assert.equal(result.blockedToolCalls[0]?.reason, 'missing_project')
  }
})

test('tool permissions allows approved project creation without a current project', () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [
      ...DEFAULT_AGENT_MANIFEST.tools,
      { name: 'movscript_project_create', mode: 'allow' as const, approval: 'always' as const },
    ],
  }
  const blocked = applyToolPermissions([
    { name: 'movscript_project_create', args: { name: '测试项目' } },
  ], { manifest, registry })

  assert.deepEqual(blocked.toolCalls, [])
  assert.equal(blocked.blockedToolCalls[0].reason, 'approval_required')

  const approved = applyToolPermissions([
    { name: 'movscript_project_create', args: { name: '测试项目' } },
  ], { manifest, approvedToolNames: ['movscript_project_create'], registry })

  assert.deepEqual(approved.warnings, [])
  assert.equal(approved.toolCalls[0].name, 'movscript_project_create')
  assert.equal(approved.toolCalls[0].args?.projectId, undefined)
})

test('tool permissions blocks tools outside the whitelist', () => {
  const result = applyToolPermissions([
    { name: 'movscript.delete_entity', args: { entityId: 1 } },
  ], { currentProjectId: 42 })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['movscript.delete_entity 未注册到当前 agent 工具表中'])
  assert.equal(result.blockedToolCalls[0].reason, 'unknown_tool')
})

test('tool permissions blocks registered tools that the manifest does not grant', () => {
  const result = applyToolPermissions([
    { name: 'workspace_open', args: { kind: 'project_standards_workspace', title: 't', content: 'c' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_script_locate', mode: 'allow' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.deepEqual(result.warnings, ['workspace_open 未被当前 agent manifest 授权'])
  assert.equal(result.blockedToolCalls[0].reason, 'not_granted')
})

test('tool permissions blocks write/generation tools until explicitly approved', () => {
  const result = applyToolPermissions([
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

test('tool permissions allows approved generation tools and injects projectId', () => {
  const result = applyToolPermissions([
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

test('tool permissions allows generation job inspection without approval', () => {
  const result = applyToolPermissions([
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

test('tool permissions requires approval before cancelling generation jobs', () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [{ name: 'core_work_cancel', mode: 'allow' as const, approval: 'always' as const }],
  }
  const blocked = applyToolPermissions([
    { name: 'core_work_cancel', args: { workId: 'work_123' } },
  ], {
    currentProjectId: 42,
    registry,
    manifest,
  })

  assert.deepEqual(blocked.toolCalls, [])
  assert.equal(blocked.blockedToolCalls[0].reason, 'approval_required')

  const approved = applyToolPermissions([
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

test('tool permissions lets sandbox intercept approval-gated write and generation tools', () => {
  const result = applyToolPermissions([
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

test('tool permissions auto approval mode allows granted write tools without explicit approval', () => {
  const result = applyToolPermissions([
    { name: 'workspace_apply', args: { workspaceId: 'workspace_1' } },
  ], {
    approvalMode: 'auto',
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'workspace_apply', mode: 'allow', approval: 'on_write' }],
    },
  })

  assert.deepEqual(result.warnings, [])
  assert.equal(result.blockedToolCalls.length, 0)
  assert.equal(result.toolCalls[0].name, 'workspace_apply')
})

test('tool permissions readonly auto mode still blocks workspace apply writes', () => {
  const result = applyToolPermissions([
    { name: 'workspace_apply', args: { workspaceId: 'workspace_1' } },
  ], {
    approvalMode: 'auto_readonly',
    registry,
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'workspace_apply', mode: 'allow', approval: 'on_write' }],
    },
  })

  assert.deepEqual(result.toolCalls, [])
  assert.equal(result.blockedToolCalls[0]?.reason, 'approval_required')
})

test('tool permissions auto approval mode does not auto-approve destructive tools', () => {
  const result = applyToolPermissions([
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
