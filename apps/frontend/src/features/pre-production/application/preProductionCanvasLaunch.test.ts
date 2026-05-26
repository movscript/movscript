import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPreProductionAssetSlotCanvasMutationOptions,
  buildPreProductionAssetSlotCanvasPayload,
  createPreProductionAssetSlotCanvas,
  preProductionCanvasRoute,
  type PreProductionCanvasLaunchClient,
} from './preProductionCanvasLaunch'
import type { Canvas } from '@/types'

function canvas(input: Partial<Canvas> & Pick<Canvas, 'ID'>): Canvas {
  return {
    owner_id: 1,
    name: `Canvas #${input.ID}`,
    ...input,
  }
}

test('pre-production canvas launch builds an asset slot canvas payload', () => {
  assert.deepEqual(buildPreProductionAssetSlotCanvasPayload({
    projectId: 123,
    slot: { ID: 88, name: '主角雨衣' },
  }), {
    name: '主角雨衣 · 素材准备画布',
    project_id: 123,
    canvas_type: 'inspiration',
    stage: 'asset_prep',
    ref_type: 'asset_slot',
    ref_id: 88,
  })
})

test('pre-production canvas launch falls back to asset slot id in title', () => {
  assert.equal(buildPreProductionAssetSlotCanvasPayload({
    projectId: 123,
    slot: { ID: 88 },
  }).name, '素材需求 #88 · 素材准备画布')
})

test('pre-production canvas launch creates the canvas through the canvas API', async () => {
  const postedPayloads: unknown[] = []
  const client: PreProductionCanvasLaunchClient = {
    async post(_url, payload) {
      postedPayloads.push(payload)
      return { data: canvas({ ID: 99 }) }
    },
  }

  const result = await createPreProductionAssetSlotCanvas({
    projectId: 123,
    slot: { ID: 88, name: '主角雨衣' },
    client,
  })

  assert.equal(result.ID, 99)
  assert.deepEqual(postedPayloads, [{
    name: '主角雨衣 · 素材准备画布',
    project_id: 123,
    canvas_type: 'inspiration',
    stage: 'asset_prep',
    ref_type: 'asset_slot',
    ref_id: 88,
  }])
})

test('pre-production canvas launch exposes the standard canvas route', () => {
  assert.equal(preProductionCanvasRoute(canvas({ ID: 99 })), '/canvases/99')
})

test('pre-production canvas launch mutation navigates to the opened canvas', async () => {
  const navigated: string[] = []
  const options = buildPreProductionAssetSlotCanvasMutationOptions({
    projectId: 123,
    navigateToCanvas: (path) => navigated.push(path),
    client: {
      async post() {
        return { data: canvas({ ID: 99 }) }
      },
    },
  })
  const result = await options.mutationFn({ ID: 88, name: '主角雨衣' })

  options.onSuccess(result)

  assert.equal(result.ID > 0, true)
  assert.equal(navigated[0], `/canvases/${result.ID}`)
})
