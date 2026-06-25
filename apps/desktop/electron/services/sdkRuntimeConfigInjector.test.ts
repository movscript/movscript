import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizedSdkRuntimeEnv } from './sdkRuntimeConfigInjector'

test('normalizedSdkRuntimeEnv prepends common Node locations to PATH', () => {
  const env = normalizedSdkRuntimeEnv({ PATH: '/custom/bin' })
  const path = env.PATH || ''

  assert.equal(path.endsWith('/custom/bin'), true)
  if (process.platform === 'darwin') {
    assert.equal(path.includes('/opt/homebrew/opt/node@22/bin'), true)
    assert.equal(path.includes('/opt/homebrew/bin'), true)
  } else if (process.platform !== 'win32') {
    assert.equal(path.includes('/usr/local/bin'), true)
  }
})

test('normalizedSdkRuntimeEnv avoids duplicating existing PATH segments', () => {
  const env = normalizedSdkRuntimeEnv({ PATH: '/usr/bin:/custom/bin:/usr/bin' })
  const parts = (env.PATH || '').split(':')

  assert.equal(parts.filter((part) => part === '/usr/bin').length, 2)
  assert.equal(parts.includes('/custom/bin'), true)
})
