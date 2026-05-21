import assert from 'node:assert/strict'
import test from 'node:test'

import { settingPreparationWorkbenchQueryKey } from './settingPreparationDataController'

test('setting preparation data controller defines the shared workbench query key', () => {
  assert.deepEqual(settingPreparationWorkbenchQueryKey(12), ['workbench', 'creative', 12])
  assert.deepEqual(settingPreparationWorkbenchQueryKey(), ['workbench', 'creative', undefined])
})
