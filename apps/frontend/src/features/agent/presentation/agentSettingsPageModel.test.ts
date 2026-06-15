import assert from 'node:assert/strict'
import test from 'node:test'
import {
  settingsSnapshotExportFilename,
  settingsSnapshotFileSizeError,
  validateSettingsSnapshotText,
} from '@/features/agent/presentation/agentSettingsPageModel'

const t = (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key

test('settings snapshot text validation accepts empty drafts', () => {
  assert.deepEqual(validateSettingsSnapshotText({ text: '  ', t }), {
    snapshot: null,
    error: null,
  })
})

test('settings snapshot text validation rejects oversized drafts before parsing', () => {
  const validation = validateSettingsSnapshotText({
    text: '{"schema":"wrong"}',
    t,
    maxBytes: 4,
  })

  assert.equal(validation.snapshot, null)
  assert.match(validation.error ?? '', /settingsSnapshotTooLarge/)
})

test('settings snapshot text validation parses valid snapshots and reports invalid JSON', () => {
  const valid = validateSettingsSnapshotText({ text: JSON.stringify(snapshotFixture()), t })
  assert.equal(valid.error, null)
  assert.equal(valid.snapshot?.schema, 'movscript.agent.settings.snapshot.v1')

  const invalid = validateSettingsSnapshotText({ text: '{', t })
  assert.equal(invalid.snapshot, null)
  assert.match(invalid.error ?? '', /agent settings snapshot JSON is invalid/)
})

test('settings snapshot helpers format export file names and file size errors', () => {
  assert.equal(
    settingsSnapshotExportFilename(new Date('2026-06-15T08:30:00.000Z')),
    'agent-settings-snapshot-2026-06-15.json',
  )
  assert.equal(settingsSnapshotFileSizeError({ size: 4, maxBytes: 4, t }), null)
  assert.match(settingsSnapshotFileSizeError({ size: 5, maxBytes: 4, t }) ?? '', /settingsSnapshotTooLarge/)
})

function snapshotFixture() {
  return {
    schema: 'movscript.agent.settings.snapshot.v1',
    schemaVersion: 1,
    schemaUrl: 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json',
    exportedAt: '2026-06-15T00:00:00.000Z',
  }
}
