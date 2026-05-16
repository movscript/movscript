import assert from 'node:assert/strict'
import test from 'node:test'
import { isoNow, makeId } from './runtimeIdentity.js'

test('makeId prefixes runtime identifiers', () => {
  assert.match(makeId('run'), /^run_[a-z0-9]+_[a-z0-9]{6}$/)
})

test('isoNow returns an ISO timestamp', () => {
  const value = isoNow()

  assert.equal(new Date(value).toISOString(), value)
})
