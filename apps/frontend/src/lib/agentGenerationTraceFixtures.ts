import type { GenerationTraceEventLike } from './agentGenerationMedia.ts'

export interface GenerationTraceReplayFixture {
  name: string
  source: 'synthetic' | 'provider'
  provider?: string
  capturedAt?: string
  notes?: string
  events: GenerationTraceEventLike[]
  expected: {
    jobs: number
    active: number
    terminal: number
    succeeded: number
    failed: number
    cancelled: number
    timeout: number
    latestJobId?: number
    outputResourceIds: number[]
    metadataResourceIds: number[]
  }
}

export const generationTraceReplayFixtures: GenerationTraceReplayFixture[] = [
  {
    name: 'video job succeeds with output media',
    source: 'synthetic',
    events: [
      {
        createdAt: '2026-05-09T08:00:00.000Z',
        data: {
          generation: {
            jobId: 1001,
            jobType: 'video_i2v',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Video',
            modelIdentifier: 'replay-video-v1',
            modelConfigId: 21,
            status: 'running',
            stage: 'queued',
            progress: 5,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T08:00:12.000Z',
        data: {
          generation: {
            jobId: 1001,
            jobType: 'video_i2v',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Video',
            modelIdentifier: 'replay-video-v1',
            modelConfigId: 21,
            status: 'running',
            stage: 'rendering',
            progress: 66,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T08:00:30.000Z',
        completedAt: '2026-05-09T08:00:31.000Z',
        data: {
          generation: {
            jobId: 1001,
            jobType: 'video_i2v',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Video',
            modelIdentifier: 'replay-video-v1',
            modelConfigId: 21,
            status: 'succeeded',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: 9001,
            media: {
              ID: 9001,
              type: 'video',
              name: 'scene-001.mp4',
              url: '/api/v1/resources/9001/file',
              size: 2048,
              mime_type: 'video/mp4',
            },
          },
        },
      },
    ],
    expected: {
      jobs: 1,
      active: 0,
      terminal: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      timeout: 0,
      latestJobId: 1001,
      outputResourceIds: [9001],
      metadataResourceIds: [9001],
    },
  },
  {
    name: 'image job fails without media',
    source: 'synthetic',
    events: [
      {
        createdAt: '2026-05-09T09:00:00.000Z',
        data: {
          generation: {
            jobId: 1002,
            jobType: 'image',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Image',
            status: 'running',
            stage: 'prompt_submitted',
            progress: 20,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T09:00:04.000Z',
        completedAt: '2026-05-09T09:00:04.000Z',
        data: {
          generation: {
            jobId: 1002,
            jobType: 'image',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Image',
            status: 'failed',
            stage: 'failed',
            terminal: true,
            message: 'provider rejected request',
          },
        },
      },
    ],
    expected: {
      jobs: 1,
      active: 0,
      terminal: 1,
      succeeded: 0,
      failed: 1,
      cancelled: 0,
      timeout: 0,
      latestJobId: 1002,
      outputResourceIds: [],
      metadataResourceIds: [],
    },
  },
  {
    name: 'generation monitor times out',
    source: 'synthetic',
    events: [
      {
        createdAt: '2026-05-09T10:00:00.000Z',
        data: {
          generation: {
            jobId: 1003,
            jobType: 'video',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Video',
            status: 'running',
            stage: 'rendering',
            progress: 50,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T10:10:00.000Z',
        completedAt: '2026-05-09T10:10:00.000Z',
        data: {
          generation: {
            jobId: 1003,
            jobType: 'video',
            providerName: 'Replay Provider',
            modelDisplay: 'Replay Video',
            status: 'timeout',
            stage: 'timeout',
            terminal: true,
            message: 'monitoring timed out before provider returned a terminal result',
          },
        },
      },
    ],
    expected: {
      jobs: 1,
      active: 0,
      terminal: 1,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      timeout: 1,
      latestJobId: 1003,
      outputResourceIds: [],
      metadataResourceIds: [],
    },
  },
  {
    name: 'sanitized provider trace: image succeeds after polling',
    source: 'provider',
    provider: 'sanitized-image-provider',
    capturedAt: '2026-05-09T12:30:00.000Z',
    notes: 'Representative real-provider shape with identifiers, URLs, and prompt content redacted.',
    events: [
      {
        createdAt: '2026-05-09T12:00:00.000Z',
        data: {
          generation: {
            jobId: 2001,
            jobType: 'image',
            providerName: 'Sanitized Image Provider',
            modelDisplay: 'Provider Image Model',
            modelIdentifier: 'provider-image-v2',
            modelConfigId: 81,
            status: 'queued',
            stage: 'request_accepted',
            progress: 1,
            terminal: false,
            message: 'provider job accepted',
          },
        },
      },
      {
        createdAt: '2026-05-09T12:00:08.000Z',
        data: {
          generation: {
            jobId: 2001,
            jobType: 'image',
            providerName: 'Sanitized Image Provider',
            modelDisplay: 'Provider Image Model',
            modelIdentifier: 'provider-image-v2',
            modelConfigId: 81,
            status: 'running',
            stage: 'generating',
            progress: 47,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T12:00:21.000Z',
        completedAt: '2026-05-09T12:00:22.000Z',
        data: {
          generation: {
            jobId: 2001,
            jobType: 'image',
            providerName: 'Sanitized Image Provider',
            modelDisplay: 'Provider Image Model',
            modelIdentifier: 'provider-image-v2',
            modelConfigId: 81,
            status: 'succeeded',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: 9101,
            media: {
              ID: 9101,
              owner_id: 100,
              type: 'image',
              name: 'provider-image-redacted.png',
              url: '/api/v1/resources/9101/file',
              direct_url: '/signed/redacted/provider-image.png',
              size: 524288,
              mime_type: 'image/png',
              storage_backend: 'redacted',
              storage_key: 'redacted/provider-image.png',
            },
          },
        },
      },
    ],
    expected: {
      jobs: 1,
      active: 0,
      terminal: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      timeout: 0,
      latestJobId: 2001,
      outputResourceIds: [9101],
      metadataResourceIds: [9101],
    },
  },
  {
    name: 'sanitized provider trace: video fails with terminal message',
    source: 'provider',
    provider: 'sanitized-video-provider',
    capturedAt: '2026-05-09T13:10:00.000Z',
    notes: 'Representative provider failure trace with external job identifiers and request content removed.',
    events: [
      {
        createdAt: '2026-05-09T13:00:00.000Z',
        data: {
          generation: {
            jobId: 2002,
            jobType: 'video_i2v',
            providerName: 'Sanitized Video Provider',
            modelDisplay: 'Provider Video Model',
            modelIdentifier: 'provider-video-v3',
            modelConfigId: 82,
            status: 'running',
            stage: 'queued',
            progress: 5,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T13:00:16.000Z',
        data: {
          generation: {
            jobId: 2002,
            jobType: 'video_i2v',
            providerName: 'Sanitized Video Provider',
            modelDisplay: 'Provider Video Model',
            modelIdentifier: 'provider-video-v3',
            modelConfigId: 82,
            status: 'running',
            stage: 'rendering',
            progress: 38,
            terminal: false,
          },
        },
      },
      {
        createdAt: '2026-05-09T13:00:29.000Z',
        completedAt: '2026-05-09T13:00:29.000Z',
        data: {
          generation: {
            jobId: 2002,
            jobType: 'video_i2v',
            providerName: 'Sanitized Video Provider',
            modelDisplay: 'Provider Video Model',
            modelIdentifier: 'provider-video-v3',
            modelConfigId: 82,
            status: 'failed',
            stage: 'failed',
            terminal: true,
            message: 'provider returned a terminal failure',
          },
        },
      },
    ],
    expected: {
      jobs: 1,
      active: 0,
      terminal: 1,
      succeeded: 0,
      failed: 1,
      cancelled: 0,
      timeout: 0,
      latestJobId: 2002,
      outputResourceIds: [],
      metadataResourceIds: [],
    },
  },
]
