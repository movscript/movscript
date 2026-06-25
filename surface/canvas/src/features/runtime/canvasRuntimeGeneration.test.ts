import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCanvasRuntimeModel } from './canvasRuntimeGeneration.ts'
import { canvasApi } from '../application/canvasServiceApi.ts'
import type { PublicModel } from '@movscript/shared'

test('resolveCanvasRuntimeModel resolves saved public model id through catalog models', async () => {
  const originalGet = canvasApi.get
  const requests: Array<{ path: string; capability: unknown }> = []
  canvasApi.get = (async (path: string, options?: { params?: Record<string, unknown> }) => {
    requests.push({ path, capability: options?.params?.capability })
    return {
      data: [
        modelFixture({
          id: 7,
          model_id: 'image.standard',
        }),
      ],
    }
  }) as typeof canvasApi.get

  try {
    const resolved = await resolveCanvasRuntimeModel({ modelId: 'image.standard' }, 'image')

    assert.deepEqual(requests, [{ path: '/canvas/runtime/models', capability: 'image' }])
    assert.deepEqual(resolved, {
      modelId: 'image.standard',
    })
  } finally {
    canvasApi.get = originalGet
  }
})

test('resolveCanvasRuntimeModel returns no model when saved model id is not in catalog models', async () => {
  const originalGet = canvasApi.get
  canvasApi.get = (async () => ({ data: [] })) as typeof canvasApi.get

  try {
    const resolved = await resolveCanvasRuntimeModel({ modelId: 'legacy.image' }, 'image')

    assert.deepEqual(resolved, {})
  } finally {
    canvasApi.get = originalGet
  }
})

function modelFixture(patch: Partial<PublicModel>): PublicModel {
	  return {
	    id: 1,
	    provider_id: 'local_provider:1',
	    model_id: 'model',
    display_name: 'Model',
    capabilities: ['image'],
    accepts_image_input: false,
    ...patch,
  }
}
