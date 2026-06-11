import assert from 'node:assert/strict'
import test from 'node:test'

import type { RawResource } from '@/types'
import {
  writeResourceDragPayload,
  type ResourceDragDataTransfer,
} from '@/features/resources/domain/resourceDragPayload'
import {
  acceptAgentComposerDropDragOver,
  agentComposerDropKind,
  readAgentComposerResourceDrop,
} from './agentComposerDropInteraction'

class FakeDataTransfer implements ResourceDragDataTransfer {
  readonly data = new Map<string, string>()
  files: File[] = []
  effectAllowed?: string
  dropEffect?: string

  get types() {
    return [...this.data.keys()]
  }

  setData(type: string, data: string) {
    this.data.set(type, data)
  }

  getData(type: string) {
    return this.data.get(type) ?? ''
  }
}

const resource = {
  ID: 42,
  name: 'reference.png',
  type: 'image',
  size: 1024,
} as RawResource

test('agent composer drop interaction accepts file drops as copy', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.files = [{ name: 'frame.png' } as File]

  assert.equal(agentComposerDropKind(dataTransfer), 'files')
  assert.equal(acceptAgentComposerDropDragOver(dataTransfer), true)
  assert.equal(dataTransfer.dropEffect, 'copy')
})

test('agent composer drop interaction accepts resource drags as copy', () => {
  const dataTransfer = new FakeDataTransfer()
  writeResourceDragPayload(dataTransfer, resource)

  assert.equal(agentComposerDropKind(dataTransfer), 'resource')
  assert.equal(acceptAgentComposerDropDragOver(dataTransfer), true)
  assert.equal(dataTransfer.dropEffect, 'copy')
  assert.deepEqual(readAgentComposerResourceDrop(dataTransfer), {
    resourceId: 42,
    resource,
  })
})

test('agent composer drop interaction rejects unsupported drags', () => {
  const dataTransfer = new FakeDataTransfer()

  assert.equal(agentComposerDropKind(dataTransfer), null)
  assert.equal(acceptAgentComposerDropDragOver(dataTransfer), false)
  assert.equal(dataTransfer.dropEffect, undefined)
})
