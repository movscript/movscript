import assert from 'node:assert/strict'
import test from 'node:test'

import { translateApiError } from './apiError'

test('translateApiError accepts nested backend error objects', () => {
  assert.equal(translateApiError({ error: { message: '目标对象不存在' } }), '目标对象不存在')
  assert.equal(translateApiError({ message: { detail: 'resource_id required' } }), 'resource_id required')
})
