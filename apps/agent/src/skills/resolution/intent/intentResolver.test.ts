import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentDebugContextPanel } from '../../../state/shared/types.js'
import { resolveRuntimeIntents } from './intentResolver.js'

test('resolveRuntimeIntents treats client labels as high-confidence structured intents', () => {
  const result = resolveRuntimeIntents('简单回答', debugContext({ labels: ['intent:content-unit-workspace', 'image_edit'] }))

  assert.ok(result.intents.includes('content_unit_workspace'))
  assert.ok(result.intents.includes('image_edit'))
  assert.ok(result.intents.includes('visual_generation'))
  assert.deepEqual(result.signals.find((signal) => signal.intent === 'content_unit_workspace'), {
    intent: 'content_unit_workspace',
    source: 'client_label',
    confidence: 'high',
    evidence: 'label:intent:content-unit-workspace',
  })
  assert.equal(result.signals.find((signal) => signal.intent === 'visual_generation')?.source, 'label_alias')
})

test('resolveRuntimeIntents records keyword activation as low-confidence fallback', () => {
  const result = resolveRuntimeIntents('请帮我做项目规范工作区', debugContext())

  assert.ok(result.intents.includes('project_standards_workspace'))
  assert.deepEqual(result.signals.find((signal) => signal.intent === 'project_standards_workspace'), {
    intent: 'project_standards_workspace',
    source: 'keyword_fallback',
    confidence: 'low',
    evidence: 'keyword:项目规范工作区',
  })
})

test('resolveRuntimeIntents activates route intents deterministically without keywords', () => {
  const result = resolveRuntimeIntents('当前页面有什么', debugContext({ route: { pathname: '/projects/42/project-workspace' } }))

  assert.ok(result.intents.includes('project_standards_workspace'))
  assert.equal(result.signals.find((signal) => signal.intent === 'project_standards_workspace')?.source, 'route')
  assert.equal(result.signals.find((signal) => signal.intent === 'project_standards_workspace')?.confidence, 'high')
})

test('resolveRuntimeIntents routes selected setting asset requirements to asset workspace only', () => {
  const result = resolveRuntimeIntents('请给这个设定添加基础形象素材需求', debugContext({
    route: { pathname: '/project/pre-production' },
    selection: { entityType: 'creative_reference', entityId: 31, label: '女主角' },
  }))

  assert.ok(result.intents.includes('asset_workspace'))
  assert.equal(result.intents.includes('setting_workspace'), false)
})

test('resolveRuntimeIntents does not activate generation for negated visual requests', () => {
  const result = resolveRuntimeIntents('不要生成图片，只分析这段文字', debugContext())

  assert.equal(result.intents.includes('visual_generation'), false)
  assert.equal(result.signals.some((signal) => signal.intent === 'visual_generation'), false)
})

test('resolveRuntimeIntents uses image context for edit-like references', () => {
  const result = resolveRuntimeIntents('让它站起来', debugContext({
    attachments: [{ id: 'att-1', name: 'pose.png', type: 'image', resourceId: 1 }],
  }))

  assert.ok(result.intents.includes('visual_generation'))
  assert.deepEqual(result.signals.find((signal) => signal.intent === 'visual_generation'), {
    intent: 'visual_generation',
    source: 'visual_context',
    confidence: 'medium',
    evidence: 'visual_context',
  })
})

test('resolveRuntimeIntents preserves content unit media aliases as visual generation', () => {
  const labeled = resolveRuntimeIntents('继续', debugContext({ labels: ['content_unit_media_workspace'] }))
  const keyword = resolveRuntimeIntents('请做 content unit media', debugContext())

  assert.ok(labeled.intents.includes('visual_generation'))
  assert.equal(labeled.signals.find((signal) => signal.intent === 'visual_generation')?.source, 'label_alias')
  assert.ok(keyword.intents.includes('visual_generation'))
  assert.equal(keyword.signals.find((signal) => signal.intent === 'visual_generation')?.evidence, 'keyword:content unit media')
})

function debugContext(overrides: Partial<AgentDebugContextPanel> = {}): AgentDebugContextPanel {
  return {
    route: { pathname: '/' },
    projects: [],
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
    ...overrides,
  }
}
