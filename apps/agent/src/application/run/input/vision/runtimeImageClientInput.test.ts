import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreImageProcessingPort, CoreImageProcessingResult } from '../../../../ports/media/imageProcessingPort.js'
import type { AgentRun } from '../../../../state/shared/types.js'
import { prepareRuntimeVisionClientInput } from './runtimeImageClientInput.js'

test('prepareRuntimeVisionClientInput replaces image dataUrl with optimized payload and keeps source metadata', async () => {
  const calls: Array<{ resourceId?: number; dataUrl?: string; preset?: string }> = []
  const result = await prepareRuntimeVisionClientInput({
    run: makeRun(),
    clientInput: {
      visibleMessage: 'look',
      attachments: [{
        id: 'att_1',
        name: 'original.png',
        type: 'image',
        mimeType: 'image/png',
        size: 120000,
        resourceId: 42,
        dataUrl: 'data:image/png;base64,ORIGINAL',
      }],
    },
    imageProcessingPort: {
      inspect: async () => { throw new Error('not used') },
      process: async (input) => {
        calls.push({ resourceId: input.resourceId, dataUrl: input.dataUrl, preset: input.preset })
        return processedImageResult()
      },
    } satisfies CoreImageProcessingPort,
  })

  assert.deepEqual(calls, [{ resourceId: 42, dataUrl: 'data:image/png;base64,ORIGINAL', preset: 'vision_default' }])
  assert.equal(result.clientInput.attachments[0]?.dataUrl, 'data:image/jpeg;base64,OPTIMIZED')
  assert.equal(result.clientInput.attachments[0]?.mimeType, 'image/jpeg')
  assert.equal(result.clientInput.attachments[0]?.size, 1024)
  assert.equal(result.clientInput.attachments[0]?.vision?.payload, 'optimized')
  assert.equal(result.clientInput.attachments[0]?.vision?.originalResourceId, 42)
  assert.equal(result.projections[0]?.status, 'optimized')
  assert.equal(result.projections[0]?.optimizedBytes, 1024)
  assert.deepEqual(result.warnings, [])
})

test('prepareRuntimeVisionClientInput withholds original payload when preprocessing is unavailable or fails', async () => {
  const unavailable = await prepareRuntimeVisionClientInput({
    run: makeRun(),
    clientInput: {
      visibleMessage: 'look',
      attachments: [{
        id: 'att_1',
        name: 'original.png',
        type: 'image',
        mimeType: 'image/png',
        size: 120000,
        resourceId: 42,
        dataUrl: 'data:image/png;base64,ORIGINAL',
      }],
    },
  })
  assert.equal(unavailable.clientInput.attachments[0]?.dataUrl, undefined)
  assert.equal(unavailable.clientInput.attachments[0]?.vision?.payload, 'metadata_only')
  assert.equal(unavailable.projections[0]?.status, 'metadata_only')

  const failed = await prepareRuntimeVisionClientInput({
    run: makeRun(),
    clientInput: {
      visibleMessage: 'look',
      attachments: [{
        id: 'att_2',
        type: 'image',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,ORIGINAL',
      }],
    },
    imageProcessingPort: {
      inspect: async () => { throw new Error('not used') },
      process: async () => { throw new Error('sharp unavailable') },
    } satisfies CoreImageProcessingPort,
  })
  assert.equal(failed.clientInput.attachments[0]?.dataUrl, undefined)
  assert.equal(failed.clientInput.attachments[0]?.vision?.payload, 'metadata_only')
  assert.equal(failed.projections[0]?.status, 'failed')
  assert.match(failed.projections[0]?.reason ?? '', /original image payload was not sent/)
})

function processedImageResult(): CoreImageProcessingResult {
  return {
    status: 'processed',
    preset: 'vision_default',
    source: {
      kind: 'data_url',
      resourceId: 42,
      mimeType: 'image/png',
      sizeBytes: 120000,
      hash: 'sha256:source',
    },
    original: {
      width: 3000,
      height: 2000,
      format: 'png',
      hasAlpha: true,
    },
    output: {
      width: 1600,
      height: 1067,
      format: 'jpeg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
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
