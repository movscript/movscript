import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCanvasPluginArgsWithInputs } from './canvasPluginArgs'

test('buildCanvasPluginArgsWithInputs maps reference input resources to plugin reference_resource_ids', () => {
  const args = buildCanvasPluginArgsWithInputs({
    targetNodeId: 'plugin-1',
    baseArgs: { prompt: '生成一张同风格海报' },
    inputPorts: [
      { id: 'prompt', type: 'text', required: true },
      { id: 'references', label: '参考图', type: 'image', maxCount: 8 },
    ],
    schemaProperties: {
      prompt: { type: 'string' },
      reference_resource_ids: { type: 'string' },
    },
    nodes: [
      {
        id: 'image-1',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { source: 'upload', resourceId: 42, resource: { ID: 42, owner_id: 1, type: 'image', name: 'ref.png', url: '/resources/42/file', size: 1, mime_type: 'image/png' } },
      },
      {
        id: 'plugin-1',
        type: 'plugin_card',
        position: { x: 0, y: 0 },
        data: { source: 'ai' },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'plugin-1',
        sourceHandle: 'out:image',
        targetHandle: 'in:references',
      },
    ],
  })

  assert.equal(args.reference_resource_ids, '42')
})

test('buildCanvasPluginArgsWithInputs fills prompt from connected text when the plugin arg is empty', () => {
  const args = buildCanvasPluginArgsWithInputs({
    targetNodeId: 'plugin-1',
    baseArgs: { prompt: '' },
    inputPorts: [{ id: 'prompt', type: 'text', required: true }],
    schemaProperties: { prompt: { type: 'string' } },
    nodes: [
      { id: 'text-1', type: 'text', position: { x: 0, y: 0 }, data: { source: 'manual', textContent: '赛博街巷，雨夜霓虹' } },
      { id: 'plugin-1', type: 'plugin_card', position: { x: 0, y: 0 }, data: { source: 'ai' } },
    ],
    edges: [
      { id: 'edge-1', source: 'text-1', target: 'plugin-1', sourceHandle: 'out:text', targetHandle: 'in:prompt' },
    ],
  })

  assert.equal(args.prompt, '赛博街巷，雨夜霓虹')
})

test('buildCanvasPluginArgsWithInputs maps connected plugin output resources to references', () => {
  const args = buildCanvasPluginArgsWithInputs({
    targetNodeId: 'plugin-2',
    baseArgs: { prompt: '基于上一张图做变体' },
    inputPorts: [
      { id: 'prompt', type: 'text', required: true },
      { id: 'references', label: '参考图', type: 'image', maxCount: 8 },
    ],
    schemaProperties: {
      prompt: { type: 'string' },
      reference_resource_ids: { type: 'string' },
    },
    nodes: [
      {
        id: 'plugin-1',
        type: 'plugin_card',
        position: { x: 0, y: 0 },
        data: {
          source: 'ai',
          outputPorts: [{ id: 'result', type: 'image' }],
          pluginResultData: { output_resource_ids: [88, 89] },
        },
      },
      {
        id: 'plugin-2',
        type: 'plugin_card',
        position: { x: 200, y: 0 },
        data: { source: 'ai' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'plugin-1', target: 'plugin-2', sourceHandle: 'out:result', targetHandle: 'in:references' },
    ],
  })

  assert.equal(args.reference_resource_ids, '88,89')
})

test('buildCanvasPluginArgsWithInputs includes attached and mentioned reference resources', () => {
  const args = buildCanvasPluginArgsWithInputs({
    targetNodeId: 'plugin-1',
    baseArgs: { prompt: '保持角色一致' },
    inputPorts: [
      { id: 'prompt', type: 'text', required: true },
      { id: 'references', label: '参考图', type: 'image', maxCount: 8 },
    ],
    schemaProperties: {
      prompt: { type: 'string' },
      reference_resource_ids: { type: 'string' },
    },
    nodes: [
      {
        id: 'plugin-1',
        type: 'plugin_card',
        position: { x: 0, y: 0 },
        data: {
          source: 'ai',
          pluginArgs: { prompt: '使用 @[resource:42]' },
          inputResourceIds: [42, 99],
        },
      },
    ],
    edges: [],
  })

  assert.equal(args.reference_resource_ids, '42,99')
})
