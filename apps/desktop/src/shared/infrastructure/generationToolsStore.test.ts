import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  GENERATION_TOOLS_SETTINGS_STORAGE_KEY,
  useGenerationToolsStore,
} from './generationToolsStore'

test('generation tools persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/generationToolsStore.ts'), 'utf8')

  assert.equal(GENERATION_TOOLS_SETTINGS_STORAGE_KEY, 'movscript-generation-tools-settings-v1')
  assert.match(source, /createDesktopStateStorage\(GENERATION_TOOLS_SETTINGS_STORAGE_KEY, fallback\)/)
})

test('generation tools store normalizes reset settings', () => {
  useGenerationToolsStore.setState({
    settings: DEFAULT_GENERATION_TOOLS_SETTINGS,
    savedAt: null,
    hydrated: true,
  })

  useGenerationToolsStore.getState().reset()
  assert.deepEqual(useGenerationToolsStore.getState().settings, DEFAULT_GENERATION_TOOLS_SETTINGS)
})
