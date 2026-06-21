import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentBrowserProjectFirstText,
  agentBrowserProjectRecordRouteId,
  agentBrowserProjectRecordStableId,
  agentBrowserProjectRecordTitle,
  visibleAgentBrowserProjectRecords,
} from './agentBrowserProjectHomeModel'
import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'

test('visibleAgentBrowserProjectRecords filters deleted records and sorts by order then id', () => {
  const records: SemanticEntityRecord[] = [
    { ID: 10, title: 'third' },
    { ID: 2, title: 'deleted', __delete: true },
    { ID: 8, title: 'first', order: 1 },
    { ID: 4, title: 'second', order: 1 },
    { ID: 6, title: 'removed', deleted: true },
  ]

  assert.deepEqual(
    visibleAgentBrowserProjectRecords(records).map((record) => record.title),
    ['second', 'first', 'third'],
  )
})

test('agent browser project record labels and ids use stable fallbacks', () => {
  assert.equal(agentBrowserProjectRecordTitle({ ID: 7 }, '素材'), '素材 #7')
  assert.equal(agentBrowserProjectRecordTitle({ title: ' 标题 ', name: '名称' }, '素材'), '标题')
  assert.equal(agentBrowserProjectRecordStableId({ uuid: 'u-1' }, 'asset', 3), 'u-1')
  assert.equal(agentBrowserProjectRecordStableId({}, 'asset', 3), 'asset-3')
  assert.equal(agentBrowserProjectRecordRouteId({ id: 'prod-alpha' }), 'prod-alpha')
  assert.equal(agentBrowserProjectRecordRouteId({ ID: '12' }), 12)
})

test('agentBrowserProjectFirstText keeps numeric values and skips empty text', () => {
  assert.equal(agentBrowserProjectFirstText('', '  ', 42, 'fallback'), '42')
  assert.equal(agentBrowserProjectFirstText(null, undefined, ' value '), 'value')
  assert.equal(agentBrowserProjectFirstText(null, undefined), '')
})
