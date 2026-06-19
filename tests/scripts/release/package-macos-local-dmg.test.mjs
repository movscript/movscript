import assert from 'node:assert/strict'
import test from 'node:test'

import { dmgBuilderEnv } from '../../../scripts/release/package-macos-local-dmg.mjs'

test('dmgBuilderEnv lets electron-builder use its Python fallback by default', () => {
  assert.deepEqual(dmgBuilderEnv({ PATH: '/bin', PYTHON_PATH: '' }), { PATH: '/bin' })
  assert.deepEqual(dmgBuilderEnv({ PATH: '/bin' }), { PATH: '/bin' })
})

test('dmgBuilderEnv preserves an explicit Python override', () => {
  assert.deepEqual(dmgBuilderEnv({ PATH: '/bin', PYTHON_PATH: ' /custom/python ' }), {
    PATH: '/bin',
    PYTHON_PATH: '/custom/python',
  })
})
