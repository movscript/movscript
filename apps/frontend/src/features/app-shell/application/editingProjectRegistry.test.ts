import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { readEditingProjectRegistry } from './editingProjectRegistry'

test('editing project registry is safe to read outside the browser', () => {
  assert.deepEqual(readEditingProjectRegistry(), [])
})

test('editing project registry persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/features/app-shell/application/editingProjectRegistry.ts'), 'utf8')

  assert.match(source, /EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY = 'movscript-editing-projects-v1'/)
  assert.match(source, /api\.getDesktopState\(\{ key: EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY \}\)/)
  assert.match(source, /api\.setDesktopState\(\{ key: EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY, value: serialized \}\)/)
  assert.doesNotMatch(source, /window\.localStorage/)
})
