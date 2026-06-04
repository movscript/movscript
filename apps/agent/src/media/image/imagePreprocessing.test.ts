import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import test from 'node:test'
import { createSharpImageProcessingPort, type ImageProcessorFactory } from './imagePreprocessing.js'
import { defaultRuntimeLimits } from '../../state/run/core/limits/runtimeLimits.js'
import type { AgentRun } from '../../state/shared/types.js'

test('image preprocessing reuses immutable backend resource bytes for repeated resource ids', async () => {
  let downloads = 0
  let sharpFactoryLoads = 0
  const port = createSharpImageProcessingPort({
    resourceFileDownloader: {
      downloadResourceFile: async (resourceId, targetPath) => {
        downloads += 1
        assert.equal(resourceId, 42)
        await writeFile(targetPath, Buffer.from('image-bytes'))
        return {
          performed: true,
          method: 'GET',
          url: 'http://backend/api/v1/resources/42/file',
          path: targetPath,
          contentType: 'image/png',
          contentLength: 11,
        }
      },
    },
    processorFactory: (async () => {
      sharpFactoryLoads += 1
      return fakeSharpFactory()
    }) satisfies ImageProcessorFactory,
  })

  const run = agentRunFixture()
  const first = await port.process({ run, resourceId: 42, preset: 'vision_default' })
  const second = await port.process({ run, resourceId: 42, preset: 'vision_default' })

  assert.equal(downloads, 1)
  assert.equal(sharpFactoryLoads, 1)
  assert.equal(first.output.dataUrl, second.output.dataUrl)
  assert.equal(first.source.hash, second.source.hash)
})

function fakeSharpFactory() {
  return () => fakeSharpPipeline()
}

function fakeSharpPipeline() {
  const pipeline = {
    metadata: async () => ({ width: 640, height: 360, format: 'png', hasAlpha: false }),
    rotate: () => pipeline,
    toColorspace: () => pipeline,
    resize: () => pipeline,
    extract: () => pipeline,
    flatten: () => pipeline,
    jpeg: () => pipeline,
    png: () => pipeline,
    webp: () => pipeline,
    toBuffer: async () => ({
      data: Buffer.from('optimized-image'),
      info: { width: 640, height: 360 },
    }),
  }
  return pipeline
}

function agentRunFixture(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: defaultRuntimeLimits(),
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      context: {
        user: { id: 7 },
      },
    },
  }
}
