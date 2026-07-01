import assert from 'node:assert/strict'
import test from 'node:test'
import type { Job } from '@movscript/shared'
import {
  filterJobs,
  jobGenerationCategory,
  jobGenerationDisplay,
  jobGenerationIntent,
  jobIsVideoGeneration,
} from './jobGenerationIntentModel'

test('job generation category prefers explicit capability operation intent', () => {
	const firstLast = job({
		ID: 1,
		job_type: 'video',
    request_context: JSON.stringify({
      intent: {
        capability: 'video_generation',
        operation: 'first_last_frame_to_video',
      },
    }),
  })
	const reference = job({
		ID: 2,
		job_type: 'video',
    request_context: JSON.stringify({
      intent: {
        capability: 'video_generation',
        operation: 'reference_to_video',
      },
    }),
  })
	const legacy = job({ ID: 3, job_type: 'video' })

  assert.deepEqual(jobGenerationIntent(firstLast), {
    capability: 'video_generation',
    operation: 'first_last_frame_to_video',
  })
  assert.equal(jobGenerationCategory(firstLast), 'video_generation:first_last_frame_to_video')
	assert.equal(jobGenerationCategory(legacy), 'video')
  assert.deepEqual(
    filterJobs([firstLast, reference, legacy], 'video_generation:first_last_frame_to_video').map((item) => item.ID),
    [1],
  )
  assert.deepEqual(
    filterJobs([firstLast, reference, legacy], 'video_generation:reference_to_video').map((item) => item.ID),
    [2],
  )
})

test('job generation display and cancellation use capability semantics', () => {
	const imageTypedAsVideo = job({
		job_type: 'video',
		request_context: JSON.stringify({
			intent: {
				capability: 'image_generation',
				operation: 'reference_to_image',
			},
		}),
	})
  const videoTypedAsImage = job({
    job_type: 'image',
    request_context: JSON.stringify({
      intent: {
        capability: 'video_generation',
        operation: 'reference_to_video',
      },
    }),
  })
	const t = ((key: string, options?: { defaultValue?: string }) => {
		if (key === 'pages.jobs.operations.reference_to_video') return '全能参考生视频'
		if (key === 'pages.jobs.operations.reference_to_image') return '参考生图'
		return options?.defaultValue ?? key
	}) as Parameters<typeof jobGenerationDisplay>[1]

	assert.equal(jobGenerationDisplay(videoTypedAsImage, t), '全能参考生视频')
	assert.equal(jobGenerationDisplay(imageTypedAsVideo, t), '参考生图')
  assert.equal(jobIsVideoGeneration(videoTypedAsImage), true)
  assert.equal(jobIsVideoGeneration(imageTypedAsVideo), false)
})

function job(overrides: Partial<Job>): Job {
  return {
    ID: 1,
    user_id: 1,
    job_type: 'image',
    status: 'succeeded',
    prompt: 'prompt',
    CreatedAt: '2026-01-01T00:00:00.000Z',
    UpdatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
