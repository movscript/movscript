import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreImageProcessingPort, CoreImageProcessingResult } from '../../../../ports/media/imageProcessingPort.js'
import type { RuntimeToolHandlerContext } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import { createCoreImageToolHandler } from './imageToolHandler.js'

test('core_image_preprocess returns public metadata and sends optimized image as supplemental model input', async () => {
  const handler = createCoreImageToolHandler()
  const result = await handler.execute({
    call: { name: 'core_image_preprocess', args: { resourceId: 7, preset: 'vision_detail' } },
    args: { resourceId: 7, preset: 'vision_detail' },
    run: makeRun(),
    imageProcessingPort: fakeImageProcessingPort(),
  } as unknown as RuntimeToolHandlerContext)

  assert.equal(result?.result && (result.result as any).output.dataUrl, undefined)
  assert.equal((result?.result as any).output.image_payload, 'sent_to_model_as_image_part')
  assert.equal(result?.supplementalMessages?.[0]?.role, 'user')
  const imagePart = result?.supplementalMessages?.[0]?.content.find((part) => part.type === 'image')
  assert.equal(imagePart?.type, 'image')
  assert.equal(imagePart?.source.type, 'data_url')
  assert.equal(imagePart?.source.type === 'data_url' ? imagePart.source.dataUrl : undefined, 'data:image/jpeg;base64,OPTIMIZED')
})

test('core_image_crop requires crop coordinates', async () => {
  const handler = createCoreImageToolHandler()
  await assert.rejects(
    async () => {
      await handler.execute({
        call: { name: 'core_image_crop', args: { resourceId: 7 } },
        args: { resourceId: 7 },
        run: makeRun(),
        imageProcessingPort: fakeImageProcessingPort(),
      } as unknown as RuntimeToolHandlerContext)
    },
    /requires left, top, width, and height/,
  )
})

test('core_image_tile sends multiple optimized tile images and omits base64 from result JSON', async () => {
  const handler = createCoreImageToolHandler()
  const crops: Array<{ left: number; top: number; width: number; height: number } | undefined> = []
  const result = await handler.execute({
    call: { name: 'core_image_tile', args: { resourceId: 7, columns: 2, rows: 2, maxTiles: 3 } },
    args: { resourceId: 7, columns: 2, rows: 2, maxTiles: 3 },
    run: makeRun(),
    imageProcessingPort: fakeImageProcessingPort(crops),
  } as unknown as RuntimeToolHandlerContext)

  assert.equal((result?.result as any).status, 'tiled')
  assert.equal((result?.result as any).tile_count, 3)
  assert.equal((result?.result as any).omitted_count, 1)
  assert.equal((result?.result as any).tiles[0].output.image_payload, 'sent_to_model_as_image_part')
  assert.equal((result?.result as any).tiles[0].output.dataUrl, undefined)
  assert.deepEqual(crops, [
    { left: 0, top: 0, width: 1000, height: 600 },
    { left: 1000, top: 0, width: 1000, height: 600 },
    { left: 0, top: 600, width: 1000, height: 600 },
  ])
  assert.equal(result?.supplementalMessages?.[0]?.content.filter((part) => part.type === 'image').length, 3)
})

function fakeImageProcessingPort(crops?: Array<{ left: number; top: number; width: number; height: number } | undefined>): CoreImageProcessingPort {
  return {
    inspect: async () => ({
      status: 'inspected',
      source: {
        kind: 'backend_resource',
        resourceId: 7,
        mimeType: 'image/png',
        sizeBytes: 10000,
        hash: 'sha256:source',
      },
      image: {
        width: 2000,
        height: 1200,
        format: 'png',
      },
    }),
    process: async (input) => {
      crops?.push(input.crop)
      return {
        ...processedImageResult(),
        preset: input.preset ?? 'vision_default',
        output: {
          ...processedImageResult().output,
          dataUrl: crops ? `data:image/jpeg;base64,OPTIMIZED_${crops.length}` : 'data:image/jpeg;base64,OPTIMIZED',
          ...(input.crop ? { crop: input.crop } : {}),
        },
      }
    },
  }
}

function processedImageResult(): CoreImageProcessingResult {
  return {
    status: 'processed',
    preset: 'vision_default',
    source: {
      kind: 'backend_resource',
      resourceId: 7,
      mimeType: 'image/png',
      sizeBytes: 10000,
      hash: 'sha256:source',
    },
    original: {
      width: 2000,
      height: 1200,
      format: 'png',
    },
    output: {
      width: 1600,
      height: 960,
      format: 'jpeg',
      mimeType: 'image/jpeg',
      sizeBytes: 900,
      dataUrl: 'data:image/jpeg;base64,OPTIMIZED',
      quality: 82,
      maxDimension: 1600,
      hash: 'sha256:output',
    },
  }
}

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}
