import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LOCAL_ADMIN_PROMPT_DISMISSED_KEY,
  readLocalAdminPromptDismissed,
  saveLocalAdminPromptDismissed,
  type LocalAdminPromptPreferenceStorage,
} from './localAdminPromptPreference'

function memoryStorage(initial?: string): LocalAdminPromptPreferenceStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === LOCAL_ADMIN_PROMPT_DISMISSED_KEY ? this.value : null
    },
    setItem(key, value) {
      if (key === LOCAL_ADMIN_PROMPT_DISMISSED_KEY) this.value = value
    },
  }
}

test('local admin prompt preference reads dismissed state from its storage owner', () => {
  assert.equal(readLocalAdminPromptDismissed(memoryStorage('true')), true)
  assert.equal(readLocalAdminPromptDismissed(memoryStorage('false')), false)
  assert.equal(readLocalAdminPromptDismissed(memoryStorage()), false)
  assert.equal(readLocalAdminPromptDismissed(null), false)
})

test('local admin prompt preference persists dismissals best-effort', () => {
  const storage = memoryStorage()

  saveLocalAdminPromptDismissed(storage)

  assert.equal(storage.value, 'true')
  assert.equal(readLocalAdminPromptDismissed(storage), true)
})

test('local admin prompt preference ignores blocked storage', () => {
  const storage: LocalAdminPromptPreferenceStorage = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('blocked')
    },
  }

  assert.equal(readLocalAdminPromptDismissed(storage), false)
  assert.doesNotThrow(() => saveLocalAdminPromptDismissed(storage))
})
