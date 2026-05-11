import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import { replayGenerationTrace } from './agentGenerationMedia'

test('sanitize-generation-trace produces replayable redacted provider fixtures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'generation-trace-'))
  const inputPath = join(dir, 'raw.json')
  const outputPath = join(dir, 'sanitized.json')
  writeFileSync(inputPath, JSON.stringify([
    {
      createdAt: '2026-05-09T12:00:00.000Z',
      data: {
        generation: {
          id: 3001,
          job_type: 'image',
          provider_name: 'Provider Secret',
          model_display: 'Image Model',
          model_identifier: 'image-model-v1',
          status: 'running',
          provider_status: 'generating',
          progress_percent: 50,
          terminal: false,
          error_msg: 'track https://provider.example/jobs/secret user@example.com abcdefghijklmnopqrstuvwxyz123456',
        },
      },
    },
    {
      createdAt: '2026-05-09T12:00:10.000Z',
      completedAt: '2026-05-09T12:00:11.000Z',
      data: {
        generation: {
          id: 3001,
          job_type: 'image',
          provider_name: 'Provider Secret',
          model_display: 'Image Model',
          model_identifier: 'image-model-v1',
          status: 'succeeded',
          stage: 'completed',
          progress: 100,
          terminal: true,
          output_resource_id: 9301,
          output_resource: {
            id: 9301,
            owner_id: 9,
            type: 'image',
            name: 'customer-prompt.png',
            direct_url: 'https://cdn.provider.example/private/result.png?token=secret',
            storage_backend: 's3',
            storage_key: 'tenant/user/private/result.png',
            size: 4096,
            mime_type: 'image/png',
          },
        },
      },
    },
  ]))

  execFileSync(process.execPath, ['../../scripts/sanitize-generation-trace.mjs', inputPath, outputPath], {
    cwd: process.cwd(),
  })

  const fixture = JSON.parse(readFileSync(outputPath, 'utf8'))
  const serialized = JSON.stringify(fixture)
  assert.equal(serialized.includes('https://provider.example'), false)
  assert.equal(serialized.includes('user@example.com'), false)
  assert.equal(serialized.includes('abcdefghijklmnopqrstuvwxyz123456'), false)
  assert.equal(serialized.includes('tenant/user/private'), false)
  assert.equal(fixture.source, 'provider')
  assert.equal(fixture.provider, 'provider-secret')
  assert.equal(fixture.expected.latestJobId, 3001)
  assert.deepEqual(fixture.expected.outputResourceIds, [9301])

  const replay = replayGenerationTrace(fixture.events)
  assert.equal(replay.succeeded, 1)
  assert.equal(replay.outputResources[0]?.url, '/api/v1/resources/9301/file')
  assert.equal(replay.outputResources[0]?.direct_url, '/signed/redacted/resource-9301')
})
