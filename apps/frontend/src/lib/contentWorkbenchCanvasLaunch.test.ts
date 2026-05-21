import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildContentWorkbenchCanvasQueryParams,
  contentWorkbenchCanvasRoute,
  openContentWorkbenchUnitCanvas,
  type ContentWorkbenchCanvasLaunchClient,
} from './contentWorkbenchCanvasLaunch'
import type { Canvas } from '@/types'

function canvas(input: Partial<Canvas> & Pick<Canvas, 'ID'>): Canvas {
  return {
    owner_id: 1,
    name: `Canvas #${input.ID}`,
    ...input,
  }
}

test('content workbench canvas launch builds the scoped query contract', () => {
  assert.deepEqual(buildContentWorkbenchCanvasQueryParams({
    projectId: 123,
    contentUnitId: 801,
  }), {
    project_id: 123,
    type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: 801,
  })
})

test('content workbench canvas launch reuses an existing unit canvas', async () => {
  const calls: string[] = []
  const existing = canvas({
    ID: 88,
    canvas_type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: 801,
  })
  const client: ContentWorkbenchCanvasLaunchClient = {
    async get(url, config) {
      calls.push(`get:${url}:${config?.params?.ref_id}`)
      return { data: [existing] }
    },
    async post() {
      calls.push('post')
      return { data: canvas({ ID: 99 }) }
    },
  }

  const result = await openContentWorkbenchUnitCanvas({
    projectId: 123,
    unit: { ID: 801, title: '纸条特写' },
    client,
  })

  assert.equal(result.ID, 88)
  assert.deepEqual(calls, ['get:/canvases:801'])
})

test('content workbench canvas launch creates a traceable unit canvas when none exists', async () => {
  const postedPayloads: unknown[] = []
  const client: ContentWorkbenchCanvasLaunchClient = {
    async get() {
      return { data: [] }
    },
    async post(_url, payload) {
      postedPayloads.push(payload)
      return { data: canvas({ ID: 99 }) }
    },
  }

  const result = await openContentWorkbenchUnitCanvas({
    projectId: 123,
    unit: {
      ID: 801,
      title: '纸条特写',
      description: '纸条被灯光扫过',
      metadata_json: JSON.stringify({
        visual_plan: { space: '书房桌面', blocking: '手从画外进入' },
      }),
    },
    client,
  })

  assert.equal(result.ID, 99)
  assert.equal(postedPayloads.length, 1)
  assert.deepEqual(postedPayloads[0], {
    name: '纸条特写 · 内容编排',
    description: [
      '内容单元：纸条特写',
      '生成目标：纸条被灯光扫过',
      '视觉调度：\n空间关系：书房桌面\n人物走位：手从画外进入',
    ].join('\n\n'),
    project_id: 123,
    canvas_type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: 801,
  })
})

test('content workbench canvas launch exposes the standard canvas route', () => {
  assert.equal(contentWorkbenchCanvasRoute(canvas({ ID: 88 })), '/canvases/88')
})
