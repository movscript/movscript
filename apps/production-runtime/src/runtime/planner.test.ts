import assert from 'node:assert/strict'
import test from 'node:test'
import { planAgentRun, planToolCalls } from './planner.js'

test('planner turns lookup text into search call without project policy', () => {
  const calls = planToolCalls('搜索主角相关内容')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'movscript.search_entities')
  assert.equal(calls[0].args?.query, '搜索主角相关内容')
  assert.equal(calls[0].args?.limit, 10)
  assert.equal(calls[0].args?.projectId, undefined)
})

test('planner infers read target and draft candidate calls', () => {
  const calls = planToolCalls('读取 content_unit #12，并帮我写一个镜头草稿')

  assert.equal(calls.length, 3)
  assert.equal(calls[0].name, 'movscript.read_project_structure')
  assert.deepEqual(calls[1], {
    name: 'movscript.read_entity',
    args: { entityType: 'content_unit', entityId: 12 },
  })
  assert.equal(calls[2].name, 'movscript.create_draft')
  assert.equal(calls[2].args?.kind, 'content_unit')
})

test('planner builds structured plan tasks for research and draft work', () => {
  const planned = planAgentRun('规划一下：搜索主角，并帮我写一个镜头草稿')

  assert.equal(planned.plan.tasks.some((task) => task.agentRole === 'planner'), true)
  assert.equal(planned.plan.tasks.some((task) => task.agentRole === 'researcher'), true)
  assert.equal(planned.plan.tasks.some((task) => task.agentRole === 'creator'), true)
  assert.equal(planned.toolCalls.length, 3)
  assert.equal(planned.toolCalls.some((call) => call.name === 'movscript.read_project_structure'), true)
})
