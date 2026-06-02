import assert from 'node:assert/strict'
import test from 'node:test'
import { createBackendVideoFrameExtractionPort } from './backendVideoFrameExtractionAdapter.js'
import { defaultRuntimeLimits } from '../../state/run/core/limits/runtimeLimits.js'
import type { AgentRun } from '../../state/shared/types.js'
import type { VideoFrameExtraction, VideoFrameExtractionRequest } from '../../media/video/videoFrameExtraction.js'

test('backend video frame extraction port caches immutable resource extraction by request parameters', async () => {
  let extractorCalls = 0
  const port = createBackendVideoFrameExtractionPort(
    { downloadResourceFile: async () => ({ performed: true, path: '/tmp/resource-video' }) },
    async (input) => {
      extractorCalls += 1
      return videoFrameExtractionFixture(input, extractorCalls)
    },
  )
  const run = agentRunFixture()

  const first = await port.extract({
    run,
    resourceId: 42,
    count: 2,
    mode: 'overview',
    maxWidth: 768,
    imageFormat: 'jpeg',
  })
  first.frames[0]!.dataUrl = 'mutated'
  const second = await port.extract({
    run,
    resourceId: 42,
    count: 2,
    mode: 'overview',
    maxWidth: 768,
    imageFormat: 'jpeg',
  })
  const third = await port.extract({
    run,
    resourceId: 42,
    count: 2,
    timestampsSec: [3],
    maxWidth: 768,
    imageFormat: 'jpeg',
  })
  await port.extract({
    run: agentRunFixture({ backendAPIBaseURL: 'http://other-backend' }),
    resourceId: 42,
    count: 2,
    mode: 'overview',
    maxWidth: 768,
    imageFormat: 'jpeg',
  })

  assert.equal(extractorCalls, 3)
  assert.equal(second.frames[0]?.dataUrl, 'data:image/jpeg;base64,frame-1')
  assert.equal(second.sampling.mode, 'overview')
  assert.equal(third.sampling.mode, 'timestamps')
})

test('backend video frame extraction port separates cache by backend auth token', async () => {
  let extractorCalls = 0
  const port = createBackendVideoFrameExtractionPort(
    { downloadResourceFile: async () => ({ performed: true, path: '/tmp/resource-video' }) },
    async (input) => {
      extractorCalls += 1
      return videoFrameExtractionFixture(input, extractorCalls)
    },
  )

  const first = await port.extract({
    run: agentRunFixture({ backendAuthToken: 'token-one' }),
    resourceId: 42,
    count: 2,
    mode: 'overview',
    maxWidth: 768,
    imageFormat: 'jpeg',
  })
  const second = await port.extract({
    run: agentRunFixture({ backendAuthToken: 'token-two' }),
    resourceId: 42,
    count: 2,
    mode: 'overview',
    maxWidth: 768,
    imageFormat: 'jpeg',
  })
  const third = await port.extract({
    run: agentRunFixture({ backendAuthToken: 'token-one' }),
    resourceId: 42,
    count: 2,
    mode: 'overview',
    maxWidth: 768,
    imageFormat: 'jpeg',
  })

  assert.equal(extractorCalls, 2)
  assert.equal(first.frames[0]?.dataUrl, 'data:image/jpeg;base64,frame-1')
  assert.equal(second.frames[0]?.dataUrl, 'data:image/jpeg;base64,frame-2')
  assert.equal(third.frames[0]?.dataUrl, 'data:image/jpeg;base64,frame-1')
})

function videoFrameExtractionFixture(input: VideoFrameExtractionRequest, callIndex: number): VideoFrameExtraction {
  const mode = input.timestampsSec && input.timestampsSec.length > 0 ? 'timestamps' : input.mode ?? 'overview'
  return {
    status: 'extracted',
    resourceId: input.resourceId,
    frameCount: 1,
    frames: [{
      index: 1,
      timestampSec: input.timestampsSec?.[0] ?? 0,
      mimeType: 'image/jpeg',
      sizeBytes: 7,
      dataUrl: `data:image/jpeg;base64,frame-${callIndex}`,
    }],
    download: {
      performed: true,
      method: 'GET',
      url: `http://backend/api/v1/resources/${input.resourceId}/file`,
      path: '/tmp/resource-video',
    },
    video: { durationSec: 10, width: 1280, height: 720 },
    sampling: {
      mode,
      timestampsSec: input.timestampsSec ?? [0],
      requestedFrameCount: input.count,
      returnedFrameCount: 1,
      maxFrames: input.maxFrames ?? 8,
      warnings: [],
    },
    outputLayout: input.outputLayout ?? 'individual',
  }
}

function agentRunFixture(metadata: Record<string, unknown> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: defaultRuntimeLimits(),
    steps: [],
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    metadata: {
      ...metadata,
      context: {
        user: { id: 7 },
      },
    },
  }
}
