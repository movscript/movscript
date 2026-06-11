import assert from 'node:assert/strict'
import { test } from 'node:test'

import { subscribeTransientOverlayDismissal } from './transientOverlayDismissal'

test('transient overlay dismissal subscription is safe without a browser window', () => {
  let dismissed = false
  const unsubscribe = subscribeTransientOverlayDismissal({
    onDismiss: () => {
      dismissed = true
    },
    pointerDown: true,
    escapeKey: true,
  })

  unsubscribe()
  assert.equal(dismissed, false)
})
