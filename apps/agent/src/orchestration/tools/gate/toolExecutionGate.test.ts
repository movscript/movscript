import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import { StaticToolRegistry } from '../../../tools/registry/core/toolRegistry.js'
import { buildToolExecutionGatePendingActions, evaluateToolExecutionGate } from './toolExecutionGate.js'
import { preflightToolExecutionPipeline } from '../execution/pipeline/toolExecutionPipeline.js'

const manifest: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'test-agent',
  version: '0.1.0',
  name: 'Test Agent',
  tools: [
    { name: 'studio_read', mode: 'allow', approval: 'never' },
    { name: 'studio_write', mode: 'allow', approval: 'always' },
    { name: 'studio_project_read', mode: 'allow', approval: 'never' },
    { name: 'core_user_input_request', mode: 'allow', approval: 'never' },
  ],
}

const registry = new StaticToolRegistry([
  {
    name: 'studio_read',
    description: 'Read studio state.',
    permission: 'studio.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'studio_write',
    description: 'Write studio state.',
    permission: 'studio.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
  {
    name: 'studio_project_read',
    description: 'Read project state.',
    permission: 'project.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
])

const catalog = { discovered: [], available: [], blocked: [], byName: {} }

test('evaluateToolExecutionGate short-circuits user input requests before tool permissions', () => {
  const decision = evaluateToolExecutionGate([
    { name: 'core_user_input_request', args: { question: 'Continue?' } },
    { name: 'unknown_tool', args: {} },
  ], {
    manifest,
    catalog,
    registry,
    approvalMode: 'interactive',
    sandboxMode: false,
  })

  assert.equal(decision.decision, 'input_required')
  assert.equal(decision.inputCalls.length, 1)
  assert.deepEqual(decision.allowedCalls, [])
  assert.deepEqual(decision.blockedToolCalls, [])
  assert.deepEqual(decision.warnings, [])
  const pending = buildToolExecutionGatePendingActions({
    decision,
    runId: 'run_1',
    makeId: (prefix) => `${prefix}_1`,
  })
  assert.deepEqual(pending.pendingApprovals, [])
  assert.equal(pending.pendingInputRequests[0]?.id, 'input_1')
  assert.equal(pending.pendingInputRequests[0]?.question, 'Continue?')
})

test('evaluateToolExecutionGate exposes approval-required decisions for permissions and pipeline callers', () => {
  const decision = evaluateToolExecutionGate([
    { name: 'studio_write', args: { value: 'x' } },
  ], {
    manifest,
    catalog,
    registry,
    approvalMode: 'interactive',
    sandboxMode: false,
  })

  assert.equal(decision.decision, 'approval_required')
  assert.deepEqual(decision.allowedCalls, [])
  assert.equal(decision.approvalBlockedToolCalls[0]?.call.name, 'studio_write')
  assert.equal(decision.approvalBlockedToolCalls[0]?.reason, 'approval_required')
  assert.equal(decision.permissionResult.blockedToolCalls[0], decision.approvalBlockedToolCalls[0])
  assert.match(decision.warnings[0] ?? '', /需要用户确认/)
  const pending = buildToolExecutionGatePendingActions({
    decision,
    runId: 'run_1',
    makeId: (prefix) => `${prefix}_1`,
  })
  assert.deepEqual(pending.pendingInputRequests, [])
  assert.equal(pending.pendingApprovals[0]?.id, 'approval_1')
  assert.equal(pending.pendingApprovals[0]?.toolName, 'studio_write')
  assert.equal(pending.pendingApprovals[0]?.risk, 'write')
  assert.equal(pending.pendingApprovals[0]?.permission, 'studio.write')
})

test('preflightToolExecutionPipeline owns pending approval materialization before graph pause', () => {
  const preflight = preflightToolExecutionPipeline({
    requestedCalls: [{ name: 'studio_write', args: { value: 'x' } }],
    runId: 'run_1',
    makeId: (prefix) => `${prefix}_1`,
    options: {
      manifest,
      catalog,
      registry,
      approvalMode: 'interactive',
      sandboxMode: false,
    },
  })

  assert.equal(preflight.kind, 'approval_required')
  assert.equal(preflight.gate.decision, 'approval_required')
  assert.equal(preflight.permissions.decision, 'approval_required')
  assert.equal(preflight.permissions.approvalBlockedToolCalls[0]?.call.name, 'studio_write')
  assert.equal(preflight.pendingActions.pendingApprovals[0]?.id, 'approval_1')
  assert.equal(preflight.pendingActions.pendingApprovals[0]?.toolName, 'studio_write')
  assert.deepEqual(preflight.pendingActions.pendingInputRequests, [])
})

test('preflightToolExecutionPipeline owns skill activation repair checks', () => {
  const repairRegistry = new StaticToolRegistry([
    {
      name: 'core_skill_update',
      description: 'Update skills.',
      permission: 'agent.skill.write',
      risk: 'write',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'movscript_script_locate',
      description: 'Read scripts.',
      permission: 'project.script.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
  ])
  const repairManifest: AgentManifest = {
    ...manifest,
    tools: [{ name: 'core_skill_update', mode: 'allow', approval: 'never' }],
  }
  const preflight = preflightToolExecutionPipeline({
    requestedCalls: [{ name: 'movscript_script_locate', args: { projectId: 1 } }],
    runId: 'run_1',
    makeId: (prefix) => `${prefix}_1`,
    options: {
      manifest: repairManifest,
      catalog: {
        discovered: [],
        blocked: [],
        available: [],
        byName: {
          core_skill_update: {
            name: 'core_skill_update',
            source: 'runtime',
            registered: true,
            granted: true,
            approval: 'never',
            available: true,
            requiresApproval: false,
          },
        },
      },
      registry: repairRegistry,
      approvalMode: 'interactive',
      sandboxMode: false,
    },
    skillRepair: {
      capabilities: {
        discovered: [],
        blocked: [],
        available: [],
        byName: {
          core_skill_update: {
            name: 'core_skill_update',
            source: 'runtime',
            registered: true,
            granted: true,
            approval: 'never',
            available: true,
            requiresApproval: false,
          },
        },
      },
      skills: [],
    },
  })

  assert.equal(preflight.kind, 'repair')
  assert.equal(preflight.kind === 'repair' ? preflight.permissions.blockedToolCalls[0]?.call.name : undefined, 'movscript_script_locate')
  assert.equal(preflight.kind === 'repair' ? preflight.repairCalls[0]?.name : undefined, 'core_skill_update')
  assert.deepEqual(preflight.kind === 'repair' ? preflight.repairCalls[0]?.args?.load : undefined, ['movscript.script_reading'])
})

test('evaluateToolExecutionGate returns normalized allowed calls from the runtime permissions', () => {
  const decision = evaluateToolExecutionGate([
    { name: 'studio_project_read', args: {} },
  ], {
    currentProjectId: 42,
    manifest,
    catalog,
    registry,
    approvalMode: 'interactive',
    sandboxMode: false,
  })

  assert.equal(decision.decision, 'allow')
  assert.deepEqual(decision.allowedCalls, [{ name: 'studio_project_read', args: { projectId: 42 } }])
  assert.deepEqual(decision.blockedToolCalls, [])
})
