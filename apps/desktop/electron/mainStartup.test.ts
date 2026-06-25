import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('desktop main attaches to local runtime daemon when bootstrap requests it', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'main.ts'), 'utf8')

  assert.match(source, /const bootstrap = await bootstrapManagedServicesBeforeWindow\(\)/)
  assert.match(source, /bootstrap\.localRuntime \? \{ localRuntime: bootstrap\.localRuntime \}/)
  assert.doesNotMatch(source, /await startDesktopApplicationRuntime\(\)/)
})
