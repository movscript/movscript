import assert from 'node:assert/strict'
import test from 'node:test'
import type { PolicySkill, RuntimeContext, WorkflowSkill } from '../../catalog/types.js'
import { loadAgentPluginCatalog } from '../../catalog/loader.js'
import { resolveProfile } from '../../profiles/resolveProfile.js'
import { composePrompt } from '../../skills/promptComposer.js'

test('default profile prompt composition covers global policy and triggered workflows', () => {
  const catalog = loadAgentPluginCatalog()
  const { profile, warnings } = resolveProfile(catalog.layeredRegistry)
  assert.deepEqual(warnings, [])
  assert.equal(profile.id, 'movscript.profile.default')

  const persona = profile.persona ? catalog.layeredRegistry.skills.get(profile.persona) : undefined
  const policies = profile.enabledPolicies.map((id) => catalog.layeredRegistry.skills.get(id))
  const workflows = [
    catalog.layeredRegistry.skills.get('movscript.workflow.project-standards-proposal'),
    catalog.layeredRegistry.skills.get('movscript.workflow.proposal-first'),
  ]

  assert.ok(!persona || persona.kind === 'persona')
  assert.ok(policies.every((skill): skill is PolicySkill => skill?.kind === 'policy'))
  assert.ok(workflows.every((skill): skill is WorkflowSkill => skill?.kind === 'workflow'))

  const ctx: RuntimeContext = {
    profile,
    message: '请帮我做项目规范提案草稿',
    intents: ['project_standards_proposal'],
    uiContext: { route: '/project-workspace', projectId: 1 },
    conversation: { turnCount: 0, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx,
    ...(persona?.kind === 'persona' ? { persona } : {}),
    policies,
    workflows,
  })

  assert.match(prompt.systemPrompt, /Project Standards Proposal/)
  assert.match(prompt.systemPrompt, /Proposal First/)
  assert.match(prompt.systemPrompt, /定义 agent 对自身运行能力的稳定认知/)
  assert.match(prompt.systemPrompt, /能力发现、上下文读取、记忆、用户输入、catalog、审批状态和 planner subagents/)
  assert.match(prompt.systemPrompt, /当前 profile、active workflows、可见工具和工具 schema 是本轮能力边界/)
  assert.doesNotMatch(prompt.systemPrompt, /\{\{schema:/)
  assert.ok(prompt.parts.some((part) => part.id === 'movscript.policy.agent-core'))
  assert.equal(prompt.parts.some((part) => part.id === 'movscript.policy.drafts'), false)
  assert.ok(prompt.parts.some((part) => part.id === 'movscript.workflow.project-standards-proposal'))
})
