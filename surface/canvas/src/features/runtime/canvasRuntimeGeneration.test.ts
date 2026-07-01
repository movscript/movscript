import assert from 'node:assert/strict'
import test from 'node:test'

import { generateCanvasRuntimeMedia, resolveCanvasRuntimeModel } from './canvasRuntimeGeneration.ts'
import { canvasApi, canvasServicePaths } from '../application/canvasServiceApi.ts'
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
    const resolved = await resolveCanvasRuntimeModel({ modelId: 'image.standard' }, 'image_generation')

    assert.deepEqual(requests, [{ path: canvasServicePaths.runtimeModels, capability: 'image_generation' }])
    assert.deepEqual(resolved, {
      modelId: 'image.standard',
    })
  } finally {
    canvasApi.get = originalGet
  }
})

test('generateCanvasRuntimeMedia submits explicit operation intent and typed reference assets', async () => {
  const originalGet = canvasApi.get
  const originalPost = canvasApi.post
  const getRequests: Array<{ path: string; params?: Record<string, unknown> }> = []
  const postRequests: Array<{ path: string; body: Record<string, unknown> }> = []
  canvasApi.get = (async (path: string, options?: { params?: Record<string, unknown> }) => {
    getRequests.push({ path, params: options?.params })
    if (path === canvasServicePaths.runtimeModels) {
      return {
        data: [modelFixture({ id: 9, model_id: 'seedance.canvas', is_default: true })],
      }
    }
    if (path === canvasServicePaths.runtimeJob(42)) {
      return {
        data: {
          ID: 42,
          job_type: 'video',
          status: 'succeeded',
          prompt: 'move between frames',
          output_resource_id: 88,
          CreatedAt: '2026-01-01T00:00:00.000Z',
          UpdatedAt: '2026-01-01T00:00:00.000Z',
        },
      }
    }
    throw new Error(`unexpected get ${path}`)
  }) as typeof canvasApi.get
  canvasApi.post = (async (path: string, body: Record<string, unknown>) => {
    postRequests.push({ path, body })
    return {
      data: {
        ID: 42,
        job_type: 'video',
        status: 'pending',
        prompt: 'move between frames',
        CreatedAt: '2026-01-01T00:00:00.000Z',
        UpdatedAt: '2026-01-01T00:00:00.000Z',
      },
    }
  }) as typeof canvasApi.post

  try {
    const job = await generateCanvasRuntimeMedia({
      nodeType: 'ai_gen',
      data: { source: 'ai', modelOperation: 'first_last_frame_to_video' },
      outputType: 'video',
      prompt: 'move between frames',
      inputResourceIds: [11, 12],
      inputValues: {
        first_frame: [{ type: 'image', resource_id: 11, media_type: 'image', role: 'first_frame' }],
        last_frame: [{ type: 'image', resource_id: 12, media_type: 'image', role: 'last_frame' }],
      },
    })

    assert.equal(job.output_resource_id, 88)
    assert.deepEqual(getRequests[0], {
      path: canvasServicePaths.runtimeModels,
      params: {
        capability: 'video_generation',
        operation: 'first_last_frame_to_video',
        reference_assets: '[{"role":"first_frame","media_type":"image"},{"role":"last_frame","media_type":"image"}]',
      },
    })
    assert.equal(postRequests[0]?.path, canvasServicePaths.runtimeMedia)
    assert.deepEqual(postRequests[0]?.body.generation_intent, {
      capability: 'video_generation',
      operation: 'first_last_frame_to_video',
      reference_assets: [
        { resource_id: 11, role: 'first_frame', media_type: 'image' },
        { resource_id: 12, role: 'last_frame', media_type: 'image' },
      ],
    })
    assert.equal(postRequests[0]?.body.job_type, 'video')
  } finally {
    canvasApi.get = originalGet
    canvasApi.post = originalPost
  }
})

test('generateCanvasRuntimeMedia rejects first-last frame operation without typed roles', async () => {
  const originalGet = canvasApi.get
  const originalPost = canvasApi.post
  let posted = false
  canvasApi.get = (async () => {
    throw new Error('model lookup should not run before input validation')
  }) as typeof canvasApi.get
  canvasApi.post = (async () => {
    posted = true
    throw new Error('post should not run')
  }) as typeof canvasApi.post

  try {
    await assert.rejects(
      generateCanvasRuntimeMedia({
        nodeType: 'ai_gen',
        data: { source: 'ai', modelOperation: 'first_last_frame_to_video' },
        outputType: 'video',
        prompt: 'move between frames',
        inputResourceIds: [11, 12],
        inputValues: {
          references: [
            { type: 'image', resource_id: 11, media_type: 'image', role: 'reference_image' },
            { type: 'image', resource_id: 12, media_type: 'image', role: 'reference_image' },
          ],
        },
      }),
      /first_last_frame_requires_first_frame_and_last_frame/,
    )
    assert.equal(posted, false)
  } finally {
    canvasApi.get = originalGet
    canvasApi.post = originalPost
  }
})

test('generateCanvasRuntimeMedia submits multimodal reference-to-video assets', async () => {
  const originalGet = canvasApi.get
  const originalPost = canvasApi.post
  const postRequests: Array<{ path: string; body: Record<string, unknown> }> = []
  canvasApi.get = (async (path: string, options?: { params?: Record<string, unknown> }) => {
    if (path === canvasServicePaths.runtimeModels) {
      assert.deepEqual(options?.params, {
        capability: 'video_generation',
        operation: 'reference_to_video',
        reference_assets: '[{"role":"reference_image","media_type":"image"},{"role":"reference_video","media_type":"video"},{"role":"reference_audio","media_type":"audio"}]',
      })
      return {
        data: [modelFixture({ id: 10, model_id: 'reference.video', is_default: true })],
      }
    }
    if (path === canvasServicePaths.runtimeJob(43)) {
      return {
        data: {
          ID: 43,
          job_type: 'video',
          status: 'succeeded',
          prompt: 'use all references',
          output_resource_id: 89,
          CreatedAt: '2026-01-01T00:00:00.000Z',
          UpdatedAt: '2026-01-01T00:00:00.000Z',
        },
      }
    }
    throw new Error(`unexpected get ${path}`)
  }) as typeof canvasApi.get
  canvasApi.post = (async (path: string, body: Record<string, unknown>) => {
    postRequests.push({ path, body })
    return {
      data: {
        ID: 43,
        job_type: 'video',
        status: 'pending',
        prompt: 'use all references',
        CreatedAt: '2026-01-01T00:00:00.000Z',
        UpdatedAt: '2026-01-01T00:00:00.000Z',
      },
    }
  }) as typeof canvasApi.post

  try {
    await generateCanvasRuntimeMedia({
      nodeType: 'reference_to_video',
      data: { source: 'ai', modelOperation: 'reference_to_video' },
      outputType: 'video',
      prompt: 'use all references',
      inputResourceIds: [21, 22, 23],
      inputValues: {
        reference_images: [{ type: 'image', resource_id: 21, media_type: 'image', role: 'reference_image' }],
        reference_video: [{ type: 'video', resource_id: 22, media_type: 'video', role: 'reference_video' }],
        reference_audio: [{ type: 'audio', resource_id: 23, media_type: 'audio', role: 'reference_audio' }],
      },
    })

    assert.deepEqual(postRequests[0]?.body.generation_intent, {
      capability: 'video_generation',
      operation: 'reference_to_video',
      reference_assets: [
        { resource_id: 21, role: 'reference_image', media_type: 'image' },
        { resource_id: 22, role: 'reference_video', media_type: 'video' },
        { resource_id: 23, role: 'reference_audio', media_type: 'audio' },
      ],
    })
  } finally {
    canvasApi.get = originalGet
    canvasApi.post = originalPost
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
    capabilities: ['image_generation'],
    accepts_image_input: false,
    ...patch,
  }
}
