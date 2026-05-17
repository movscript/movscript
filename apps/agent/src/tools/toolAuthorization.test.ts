import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolAuthorizationUnavailableReason } from './toolAuthorization.js'
import type { AgentToolGrant } from '../catalog/agentManifest.js'
import type { RegisteredTool } from './toolRegistry.js'

test('getToolAuthorizationUnavailableReason reports registration and MCP availability first', () => {
  assert.equal(getToolAuthorizationUnavailableReason({}), 'unregistered')
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool({ source: 'mcp' }),
    grant: allowGrant(),
    hasMCPTool: false,
  }), 'mcp_unavailable')
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool({ source: 'plugin' }),
    grant: allowGrant(),
    hasMCPTool: false,
  }), 'mcp_unavailable')
})

test('getToolAuthorizationUnavailableReason reports manifest grant availability', () => {
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool(),
    grant: { name: 'tool_a', mode: 'deny' },
  }), 'denied')
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool(),
  }), 'not_granted')
})

test('getToolAuthorizationUnavailableReason enforces run role and project scope', () => {
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool({ allowedRunRoles: ['planner'] }),
    grant: allowGrant(),
    runRole: 'worker',
  }), 'wrong_run_role')
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool({ projectScoped: true }),
    grant: allowGrant(),
  }), 'missing_project')
  for (const currentProjectId of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getToolAuthorizationUnavailableReason({
      registeredTool: buildTool({ projectScoped: true }),
      grant: allowGrant(),
      currentProjectId,
    }), 'missing_project')
  }
})

test('getToolAuthorizationUnavailableReason returns undefined when base authorization passes', () => {
  assert.equal(getToolAuthorizationUnavailableReason({
    registeredTool: buildTool({ projectScoped: true, allowedRunRoles: ['worker'] }),
    grant: allowGrant(),
    currentProjectId: 1,
    runRole: 'worker',
  }), undefined)
})

function allowGrant(): AgentToolGrant {
  return { name: 'tool_a', mode: 'allow' }
}

function buildTool(input: Partial<RegisteredTool> = {}): RegisteredTool {
  return {
    name: 'tool_a',
    description: 'Tool A',
    permission: 'tool.a',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    ...input,
  }
}
