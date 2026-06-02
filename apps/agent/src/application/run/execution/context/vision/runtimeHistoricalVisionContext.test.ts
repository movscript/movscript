import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveRuntimeHistoricalVisionContext } from './runtimeHistoricalVisionContext.js'
import type { CoreImageProcessingPort } from '../../../../../ports/media/imageProcessingPort.js'
import type { AgentRun, AgentThread } from '../../../../../state/shared/types.js'

test('resolveRuntimeHistoricalVisionContext rebuilds prior image attachments from resource ids', async () => {
  const run = makeRun()
  const thread = makeThread()
  const processed: number[] = []
  const imageProcessingPort: CoreImageProcessingPort = {
    async inspect() {
      throw new Error('inspect should not be called')
    },
    async process(input) {
      processed.push(input.resourceId ?? 0)
      return {
        status: 'processed',
        preset: 'vision_default',
        source: {
          kind: 'backend_resource',
          resourceId: input.resourceId,
          mimeType: input.mimeType,
          sizeBytes: 100,
          hash: 'sha256:source',
        },
        original: { width: 100, height: 80, format: 'png' },
        output: {
          width: 100,
          height: 80,
          format: 'jpeg',
          mimeType: 'image/jpeg',
          sizeBytes: 20,
          dataUrl: 'data:image/jpeg;base64,BBBB',
          quality: 82,
          maxDimension: 1600,
          hash: 'sha256:output',
        },
      }
    },
  }

  const context = await resolveRuntimeHistoricalVisionContext({
    run,
    thread,
    sourceMessageId: 'msg_current',
    imageProcessingPort,
  })

  assert.deepEqual(processed, [7])
  assert.equal(context?.references[0]?.resourceId, 7)
  assert.equal(context?.references[0]?.dataUrl, 'data:image/jpeg;base64,BBBB')
  assert.equal(context?.projection.includedInlineImageCount, 1)
})

test('resolveRuntimeHistoricalVisionContext keeps history images metadata-only when current input has images', async () => {
  const context = await resolveRuntimeHistoricalVisionContext({
    run: makeRun(),
    thread: makeThread(),
    sourceMessageId: 'msg_current',
    currentClientInput: {
      visibleMessage: 'new image',
      attachments: [{ id: 'current', type: 'image', mimeType: 'image/png', dataUrl: 'data:image/png;base64,CCCC' }],
    },
  })

  assert.equal(context?.references[0]?.dataUrl, undefined)
  assert.equal(context?.projection.includedInlineImageCount, 0)
  assert.equal(context?.projection.metadataOnlyCount, 1)
})

test('resolveRuntimeHistoricalVisionContext withholds original dataUrl when preprocessing is unavailable', async () => {
  const context = await resolveRuntimeHistoricalVisionContext({
    run: makeRun(),
    thread: {
      ...makeThread(),
      messages: [{
        id: 'msg_prior',
        threadId: 'thread_1',
        role: 'user',
        content: 'prior image',
        clientInput: {
          visibleMessage: 'prior image',
          attachments: [{ id: 'att_1', name: 'prior.png', type: 'image', mimeType: 'image/png', dataUrl: 'data:image/png;base64,ORIGINAL' }],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      }, {
        id: 'msg_current',
        threadId: 'thread_1',
        role: 'user',
        content: 'continue',
        createdAt: '2026-01-01T00:01:00.000Z',
      }],
    },
    sourceMessageId: 'msg_current',
  })

  assert.equal(context?.references[0]?.dataUrl, undefined)
  assert.equal(context?.projection.includedInlineImageCount, 0)
  assert.equal(context?.projection.metadataOnlyCount, 1)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 8, allowNetwork: false, allowFileBytes: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [{
      id: 'msg_prior',
      threadId: 'thread_1',
      role: 'user',
      content: 'prior image',
      clientInput: {
        visibleMessage: 'prior image',
        attachments: [{ id: 'att_1', name: 'prior.png', type: 'image', mimeType: 'image/png', size: 100, resourceId: 7 }],
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    }, {
      id: 'msg_current',
      threadId: 'thread_1',
      role: 'user',
      content: 'continue',
      createdAt: '2026-01-01T00:01:00.000Z',
    }],
  }
}
