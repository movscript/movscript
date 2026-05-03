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

test('planner treats /production_plan as structured production orchestration command', () => {
  const planned = planAgentRun('/production_plan 第一场：主角在雨夜进入废弃剧院')

  assert.equal(planned.toolCalls.length, 1)
  assert.equal(planned.toolCalls[0].name, 'movscript.read_project_structure')
  assert.equal(planned.plan.tasks.length, 5)
  assert.equal(planned.plan.tasks[0].title, '读取项目事实源')
  assert.equal(planned.plan.tasks[1].title, '规划制作对象清单')
  assert.equal(planned.plan.tasks[2].title, '分派工作人员生成素材')
  assert.equal(planned.plan.tasks[3].title, '管理人员项目预演')
  assert.equal(planned.plan.tasks[4].title, '进入正式内容单元生成')
  assert.match(planned.plan.tasks[1].description, /片段、情节、创作资料、素材位、内容单元/)
  assert.match(planned.plan.tasks[4].description, /预演无阻塞/)
})

test('planner keeps /project_plan as a compatibility alias', () => {
  const planned = planAgentRun('/project_plan 第一场：主角在雨夜进入废弃剧院')

  assert.equal(planned.toolCalls.length, 1)
  assert.equal(planned.toolCalls[0].name, 'movscript.read_project_structure')
  assert.equal(planned.plan.tasks[0].title, '读取项目事实源')
  assert.equal(planned.plan.tasks.at(-1)?.title, '进入正式内容单元生成')
})

test('planner detects production orchestration wording without slash command', () => {
  const planned = planAgentRun('开始制作编排：先规划素材准备，再让管理人员做项目预演，没问题后生成内容单元')

  assert.equal(planned.toolCalls.length, 1)
  assert.equal(planned.toolCalls[0].name, 'movscript.read_project_structure')
  assert.equal(planned.plan.tasks.length, 5)
  assert.equal(planned.plan.tasks[2].agentRole, 'coordinator')
  assert.match(planned.plan.tasks[3].successCriteria ?? '', /预演检查项/)
})

test('planner keeps generic planning on the existing research and draft path', () => {
  const planned = planAgentRun('规划一下：搜索主角，并帮我写一个镜头草稿')

  assert.equal(planned.plan.tasks[0].title, '拆解目标和执行顺序')
  assert.equal(planned.plan.tasks.some((task) => task.title === '管理人员项目预演'), false)
})

test('planner supports explicit text command forms for debug UI', () => {
  assert.equal(planToolCalls('/inspect_context').length, 0)
  assert.equal(planAgentRun('/inspect_context').plan.tasks[0].title, '输出运行上下文')

  const draftCalls = planToolCalls('/draft 写一版第一场镜头草稿')
  assert.equal(draftCalls[0].name, 'movscript.create_draft')
  assert.equal(draftCalls[0].args?.kind, 'content_unit')

  const structureCalls = planToolCalls('/project_structure')
  assert.equal(structureCalls[0].name, 'movscript.read_project_structure')

  const listCalls = planToolCalls('/list_drafts')
  assert.equal(listCalls[0].name, 'movscript.list_drafts')

  const applyCalls = planToolCalls('/apply_draft draft_abc123 to script #12 field content')
  assert.equal(applyCalls[0].name, 'movscript.apply_draft')
  assert.equal(applyCalls[0].args?.draftId, 'draft_abc123')

  const searchCalls = planToolCalls('/search 主角')
  assert.equal(searchCalls[0].name, 'movscript.search_entities')
  assert.equal(searchCalls[0].args?.query, '主角')
})
