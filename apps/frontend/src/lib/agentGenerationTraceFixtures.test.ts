import assert from 'node:assert/strict'
import test from 'node:test'

import { replayGenerationTrace } from './agentGenerationMedia'
import { generationTraceReplayFixtures } from './agentGenerationTraceFixtures'

for (const fixture of generationTraceReplayFixtures) {
  test(`generation replay fixture: ${fixture.name}`, () => {
    const replay = replayGenerationTrace(fixture.events)

    assert.equal(replay.jobs.length, fixture.expected.jobs)
    assert.equal(replay.active, fixture.expected.active)
    assert.equal(replay.terminal, fixture.expected.terminal)
    assert.equal(replay.succeeded, fixture.expected.succeeded)
    assert.equal(replay.failed, fixture.expected.failed)
    assert.equal(replay.cancelled, fixture.expected.cancelled)
    assert.equal(replay.timeout, fixture.expected.timeout)
    assert.equal(replay.latestJob?.jobId, fixture.expected.latestJobId)
    assert.deepEqual(replay.outputResourceIds.sort((a, b) => a - b), fixture.expected.outputResourceIds)
    assert.deepEqual([...replay.metadataByResourceId.keys()].sort((a, b) => a - b), fixture.expected.metadataResourceIds)
  })
}

test('generation replay fixtures include sanitized provider traces for async success and failure', () => {
  const providerFixtures = generationTraceReplayFixtures.filter((fixture) => fixture.source === 'provider')
  assert.equal(providerFixtures.length >= 2, true, 'expected at least one provider success and one provider failure fixture')
  assert.equal(providerFixtures.some((fixture) => fixture.expected.succeeded > 0 && fixture.expected.outputResourceIds.length > 0), true)
  assert.equal(providerFixtures.some((fixture) => fixture.expected.failed > 0 && fixture.expected.outputResourceIds.length === 0), true)

  for (const fixture of providerFixtures) {
    assert.equal(typeof fixture.provider, 'string')
    assert.equal(typeof fixture.capturedAt, 'string')
    assert.equal(fixture.events.length >= 2, true, 'provider fixture must show asynchronous lifecycle polling')

    const replay = replayGenerationTrace(fixture.events)
    assert.equal(replay.active, 0)
    assert.equal(replay.terminal, fixture.expected.terminal)
    assert.equal(replay.latestJob?.terminal, true)

    const runningEvent = fixture.events.some((event) => {
      const data = event.data as { generation?: { terminal?: unknown; progress?: unknown; stage?: unknown } } | undefined
      return data?.generation?.terminal === false &&
        (typeof data.generation.progress === 'number' || typeof data.generation.stage === 'string')
    })
    assert.equal(runningEvent, true, 'provider fixture must include a non-terminal progress update')
  }
})

test('provider replay fixtures do not contain unsanitized secrets or external URLs', () => {
  const providerFixtures = generationTraceReplayFixtures.filter((fixture) => fixture.source === 'provider')
  for (const fixture of providerFixtures) {
    const findings = findUnsafeProviderFixtureStrings(fixture)
    assert.deepEqual(findings, [], `provider fixture ${fixture.name} contains unsafe strings:\n${findings.join('\n')}`)
  }
})

function findUnsafeProviderFixtureStrings(value: unknown, path = 'fixture'): string[] {
  const findings: string[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...findUnsafeProviderFixtureStrings(item, `${path}[${index}]`)))
    return findings
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      findings.push(...findUnsafeProviderFixtureStrings(entry, `${path}.${key}`))
    }
    return findings
  }
  if (typeof value !== 'string') return findings

  if (/https?:\/\//i.test(value)) findings.push(`${path}: external URL`)
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(value)) findings.push(`${path}: email address`)
  if (isSensitiveFreeTextPath(path) && /\b[A-Za-z0-9_-]{24,}\b/.test(value) && !value.includes('redacted')) findings.push(`${path}: token-like value`)
  if (path.endsWith('.url') && !value.startsWith('/api/v1/resources/')) findings.push(`${path}: resource URL must be API-relative`)
  if (path.endsWith('.direct_url') && !value.startsWith('/signed/redacted/')) findings.push(`${path}: direct URL must be redacted`)
  if (path.endsWith('.storage_key') && !value.startsWith('redacted/')) findings.push(`${path}: storage key must be redacted`)

  return findings
}

function isSensitiveFreeTextPath(path: string): boolean {
  return path.endsWith('.message') ||
    path.endsWith('.error') ||
    path.endsWith('.direct_url') ||
    path.endsWith('.storage_key') ||
    path.endsWith('.url')
}
