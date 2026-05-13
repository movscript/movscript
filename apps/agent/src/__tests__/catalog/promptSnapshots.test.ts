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
    catalog.layeredRegistry.skills.get('movscript.workflow.project-proposal'),
    catalog.layeredRegistry.skills.get('movscript.workflow.proposal-first'),
  ]

  assert.ok(!persona || persona.kind === 'persona')
  assert.ok(policies.every((skill): skill is PolicySkill => skill?.kind === 'policy'))
  assert.ok(workflows.every((skill): skill is WorkflowSkill => skill?.kind === 'workflow'))

  const ctx: RuntimeContext = {
    profile,
    message: '请帮我做项目提案草稿',
    intents: ['project_proposal'],
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

  assert.match(prompt.systemPrompt, /Project Proposal/)
  assert.match(prompt.systemPrompt, /Proposal First/)
  assert.match(prompt.systemPrompt, /Core 是 agent 对自身运行能力的稳定认知层/)
  assert.match(prompt.systemPrompt, /读取记忆、请求用户输入、刷新 catalog、以及在 planner run 中编排 worker subagents/)
  assert.match(prompt.systemPrompt, /优先从当前 profile、active workflows 和可见工具判断自己能做什么/)
  assert.doesNotMatch(prompt.systemPrompt, /\{\{schema:/)
  assert.ok(prompt.parts.some((part) => part.id === 'movscript.policy.drafts'))
  assert.ok(prompt.parts.some((part) => part.id === 'movscript.workflow.project-proposal'))
})
