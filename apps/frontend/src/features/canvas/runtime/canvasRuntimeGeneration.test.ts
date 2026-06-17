import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCanvasRuntimeModel } from '@/features/canvas/runtime/canvasRuntimeGeneration'
import { api } from '@/shared/infrastructure/api'
import type { PublicModel } from '@/types'

test('resolveCanvasRuntimeModel resolves saved public model id through catalog models', async () => {
  const originalGet = api.get
  const requests: Array<{ path: string; capability: unknown }> = []
  api.get = (async (path: string, options?: { params?: Record<string, unknown> }) => {
    requests.push({ path, capability: options?.params?.capability })
    return {
      data: [
        modelFixture({
          id: 7,
          model_id: 'image.standard',
        }),
      ],
    }
  }) as typeof api.get

  try {
    const resolved = await resolveCanvasRuntimeModel({ modelId: 'image.standard' }, 'image')

    assert.deepEqual(requests, [{ path: '/models', capability: 'image' }])
    assert.deepEqual(resolved, {
      modelId: 'image.standard',
    })
  } finally {
    api.get = originalGet
  }
})

test('resolveCanvasRuntimeModel returns no model when saved model id is not in catalog models', async () => {
  const originalGet = api.get
  api.get = (async () => ({ data: [] })) as typeof api.get

  try {
    const resolved = await resolveCanvasRuntimeModel({ modelId: 'legacy.image' }, 'image')

    assert.deepEqual(resolved, {})
  } finally {
    api.get = originalGet
  }
})

function modelFixture(patch: Partial<PublicModel>): PublicModel {
  return {
    id: 1,
    credential_id: 1,
    model_id: 'model',
    display_name: 'Model',
    capabilities: ['image'],
    accepts_image_input: false,
    ...patch,
  }
}
