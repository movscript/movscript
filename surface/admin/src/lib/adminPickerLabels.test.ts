import assert from 'node:assert/strict'
import test from 'node:test'
import { activeOrgOptionLabel, activeUserOptionLabel } from './adminPickerLabels'

test('activeUserOptionLabel includes display name, username, id, and email when available', () => {
  assert.equal(
    activeUserOptionLabel({
      ID: 42,
      username: 'chen',
      display_name: ' Chen Qian ',
      primary_email: ' chen@example.com ',
    }),
    'Chen Qian / chen #42 · chen@example.com',
  )
})

test('activeUserOptionLabel falls back to username when display name and email are blank', () => {
  assert.equal(
    activeUserOptionLabel({
      ID: 7,
      username: 'editor',
      display_name: ' ',
      primary_email: '',
    }),
    'editor #7',
  )
})

test('activeOrgOptionLabel includes org name, slug, and id', () => {
  assert.equal(
    activeOrgOptionLabel({
      ID: 9,
      name: 'Production Team',
      slug: 'production-team',
    }),
    'Production Team / production-team #9',
  )
})
