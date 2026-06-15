import assert from 'node:assert/strict'
import test from 'node:test'

import type { RawResource } from '@/types'
import { analyzeShotReference } from './shotReferenceLibrary'
import {
  buildImportWorkspaces,
  detailWorkspaceFromEntry,
  formatWorkspaceRange,
  importWorkspaceToManualUpdate,
  optionalNumber,
  splitTags,
  workspaceRangeDuration,
} from './shotLibraryWorkspaceModel'

const resource: RawResource = {
  ID: 42,
  owner_id: 1,
  type: 'video',
  name: 'slow_push_reveal.mp4',
  url: '/api/v1/resources/42/file',
  size: 4096,
  mime_type: 'video/mp4',
}

test('shot workspace model round-trips editable fields to manual update payloads', () => {
  const entry = analyzeShotReference(resource, { name: resource.name, size: resource.size }, { durationSec: 9, width: 1920, height: 1080 })
  const workspace = {
    ...detailWorkspaceFromEntry(entry),
    title: 'Manual title',
    intent: 'reveal_information, create_tension',
    shotSize: 'close_up',
    requirements: 'tripod, controlled_light',
    startSec: '1.5',
    endSec: '7.25',
  }

  const update = importWorkspaceToManualUpdate({
    ...workspace,
    id: 'workspace-1',
    order: 1,
    status: 'ready',
    selected: true,
  })

  assert.equal(update.title, 'Manual title')
  assert.deepEqual(update.intent, ['reveal_information', 'create_tension'])
  assert.equal(update.visual_analysis?.shot_size, 'close_up')
  assert.deepEqual(update.execution_details?.requirements, ['tripod', 'controlled_light'])
  assert.equal(update.start_sec, 1.5)
  assert.equal(update.end_sec, 7.25)
})

test('shot workspace model builds deterministic import ranges', () => {
  const workspaces = buildImportWorkspaces(resource, { durationSec: 12, width: 1920, height: 1080 }, [
    { startSec: 0, endSec: 4.2 },
    { startSec: 4.2, endSec: 12 },
  ])

  assert.equal(workspaces.length, 2)
  assert.deepEqual(workspaces.map(workspace => workspace.order), [1, 2])
  assert.deepEqual(workspaces.map(formatWorkspaceRange), ['0:00-0:04', '0:04-0:12'])
  assert.equal(workspaceRangeDuration(workspaces[1]), 7.8)
  assert.deepEqual(splitTags('a, b，c\n d'), ['a', 'b', 'c', 'd'])
  assert.equal(optionalNumber(' 2.5 '), 2.5)
  assert.equal(optionalNumber('-1'), undefined)
})
