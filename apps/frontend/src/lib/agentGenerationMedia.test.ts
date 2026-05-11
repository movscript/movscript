import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectGeneratedMediaHints,
  generationMetadataByResourceIdFromEvents,
  generationProgressFromEvents,
  generationProgressListFromEvents,
  rawResourceFromUnknown,
  replayGenerationTrace,
} from './agentGenerationMedia'

test('rawResourceFromUnknown normalizes image and video resources', () => {
  assert.deepEqual(rawResourceFromUnknown({
    id: 42,
    ownerId: 7,
    type: 'video',
    name: 'shot.mp4',
    size: 1024,
    mimeType: 'video/mp4',
    direct_url: '/signed/shot.mp4',
  }), {
    ID: 42,
    owner_id: 7,
    type: 'video',
    name: 'shot.mp4',
    url: '/api/v1/resources/42/file',
    size: 1024,
    mime_type: 'video/mp4',
    direct_url: '/signed/shot.mp4',
  })

  assert.equal(rawResourceFromUnknown({ id: 9, type: 'folder' }), undefined)
})

test('collectGeneratedMediaHints extracts nested output resources and ids', () => {
  const resources = new Map()
  const ids = new Set<number>()

  collectGeneratedMediaHints({
    data: {
      job: {
        output_resource_id: 91,
        output_resources: [
          { ID: 92, type: 'image', name: 'frame.png', url: '/r/92', size: 2048, mime_type: 'image/png' },
          { ID: 93, type: 'text', name: 'notes.txt', url: '/r/93', size: 128, mime_type: 'text/plain' },
        ],
        media: { id: 94, type: 'video', name: 'preview.mp4', url: '/r/94', size: 4096, mimeType: 'video/mp4' },
      },
    },
  }, resources, ids)

  assert.deepEqual([...ids], [91])
  assert.deepEqual([...resources.keys()].sort((a, b) => a - b), [92, 94])
})

test('generationProgressListFromEvents keeps the latest state per async job', () => {
  const events = [
    {
      data: {
        generation: {
          jobId: 10,
          jobType: 'video_i2v',
          providerName: 'Provider A',
          modelDisplay: 'Video Model',
          modelIdentifier: 'video-model',
          modelConfigId: 5,
          status: 'running',
          stage: 'queued',
          progress: 5,
          terminal: false,
          message: 'queued',
        },
      },
    },
    {
      data: {
        generation: {
          jobId: 10,
          jobType: 'video_i2v',
          providerName: 'Provider A',
          modelDisplay: 'Video Model',
          modelConfigId: 5,
          status: 'succeeded',
          stage: 'completed',
          progress: 100,
          terminal: true,
          outputResourceId: 77,
          message: 'done',
        },
      },
    },
    {
      data: {
        generation: {
          jobId: 11,
          jobType: 'image',
          status: 'failed',
          stage: 'failed',
          terminal: true,
          message: 'provider rejected prompt',
        },
      },
    },
  ]

  assert.deepEqual(generationProgressListFromEvents(events), [
    {
      jobId: 10,
      jobType: 'video_i2v',
      providerName: 'Provider A',
      modelDisplay: 'Video Model',
      modelConfigId: 5,
      status: 'succeeded',
      stage: 'completed',
      progress: 100,
      terminal: true,
      outputResourceId: 77,
      message: 'done',
    },
    {
      jobId: 11,
      jobType: 'image',
      status: 'failed',
      stage: 'failed',
      terminal: true,
      message: 'provider rejected prompt',
    },
  ])
  assert.equal(generationProgressFromEvents(events)?.jobId, 11)
})

test('generationProgressListFromEvents keeps monitoring timestamps for async jobs', () => {
  const states = generationProgressListFromEvents([
    {
      createdAt: '2026-05-09T08:00:00.000Z',
      data: {
        generation: {
          jobId: 31,
          status: 'running',
          stage: 'queued',
          terminal: false,
        },
      },
    },
    {
      createdAt: '2026-05-09T08:00:12.000Z',
      completedAt: '2026-05-09T08:00:13.000Z',
      data: {
        generation: {
          jobId: 31,
          status: 'succeeded',
          stage: 'completed',
          progress: 100,
          terminal: true,
          outputResourceId: 310,
        },
      },
    },
  ])

  assert.deepEqual(states, [{
    jobId: 31,
    status: 'succeeded',
    stage: 'completed',
    progress: 100,
    terminal: true,
    outputResourceId: 310,
    firstSeenAt: '2026-05-09T08:00:00.000Z',
    updatedAt: '2026-05-09T08:00:12.000Z',
    completedAt: '2026-05-09T08:00:13.000Z',
  }])
})

test('generationMetadataByResourceIdFromEvents maps output media to provider metadata', () => {
  const metadata = generationMetadataByResourceIdFromEvents([
    {
      data: {
        generation: {
          jobId: 12,
          jobType: 'image',
          providerName: 'Provider B',
          modelDisplay: 'Image Model',
          modelIdentifier: 'image-model',
          modelConfigId: 8,
          status: 'succeeded',
          stage: 'completed',
          outputResourceId: 120,
          media: {
            ID: 121,
            type: 'image',
            name: 'result.png',
            url: '/r/121',
            size: 512,
            mime_type: 'image/png',
          },
        },
      },
    },
  ])

  assert.deepEqual(metadata.get(120), {
    jobId: 12,
    jobType: 'image',
    providerName: 'Provider B',
    modelDisplay: 'Image Model',
    modelIdentifier: 'image-model',
    modelConfigId: 8,
    status: 'succeeded',
    stage: 'completed',
  })
  assert.deepEqual(metadata.get(121), metadata.get(120))
})

test('replayGenerationTrace summarizes a provider trace replay', () => {
  const replay = replayGenerationTrace([
    {
      createdAt: '2026-05-09T08:00:00.000Z',
      data: {
        generation: {
          jobId: 50,
          jobType: 'video',
          providerName: 'Provider C',
          modelDisplay: 'Replay Model',
          status: 'running',
          stage: 'rendering',
          progress: 35,
          terminal: false,
          outputResourceId: 500,
        },
      },
    },
    {
      createdAt: '2026-05-09T08:00:20.000Z',
      completedAt: '2026-05-09T08:00:21.000Z',
      data: {
        generation: {
          jobId: 50,
          jobType: 'video',
          providerName: 'Provider C',
          modelDisplay: 'Replay Model',
          status: 'succeeded',
          stage: 'completed',
          progress: 100,
          terminal: true,
          outputResourceId: 500,
          media: {
            ID: 500,
            type: 'video',
            name: 'replay.mp4',
            url: '/r/500',
            size: 1234,
            mime_type: 'video/mp4',
          },
        },
      },
    },
    {
      data: {
        generation: {
          jobId: 51,
          status: 'failed',
          stage: 'failed',
          terminal: true,
          message: 'provider rejected request',
        },
      },
    },
  ])

  assert.equal(replay.jobs.length, 2)
  assert.equal(replay.latestJob?.jobId, 51)
  assert.equal(replay.active, 0)
  assert.equal(replay.terminal, 2)
  assert.equal(replay.succeeded, 1)
  assert.equal(replay.failed, 1)
  assert.equal(replay.outputResourceIds.includes(500), true)
  assert.deepEqual(replay.outputResources.map((resource) => resource.ID), [500])
  assert.equal(replay.metadataByResourceId.get(500)?.providerName, 'Provider C')
  assert.equal(replay.jobs[0]?.firstSeenAt, '2026-05-09T08:00:00.000Z')
  assert.equal(replay.jobs[0]?.completedAt, '2026-05-09T08:00:21.000Z')
})

test('replayGenerationTrace treats monitor timeouts as inactive even when the backend job may continue', () => {
  const replay = replayGenerationTrace([
    {
      data: {
        generation: {
          jobId: 72,
          jobType: 'video',
          status: 'timeout',
          stage: 'timeout',
          progress: 64,
          terminal: false,
          message: 'monitor timed out while provider task is still running',
        },
      },
    },
  ])

  assert.equal(replay.active, 0)
  assert.equal(replay.timeout, 1)
  assert.equal(replay.latestJob?.status, 'timeout')
})
