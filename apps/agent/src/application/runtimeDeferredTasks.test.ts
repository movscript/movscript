import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'

test('RuntimeDeferredTaskRegistry tracks tasks until they settle', async () => {
  const registry = new RuntimeDeferredTaskRegistry()
  let resolved = false

  registry.track(new Promise<void>((resolve) => {
    setTimeout(() => {
      resolved = true
      resolve()
    }, 0)
  }))

  assert.equal(registry.size, 1)
  await registry.flush()
  assert.equal(resolved, true)
  assert.equal(registry.size, 0)
})

test('RuntimeDeferredTaskRegistry flushes tasks added by earlier tasks', async () => {
  const registry = new RuntimeDeferredTaskRegistry()
  const completed: string[] = []

  registry.track(new Promise<void>((resolve) => {
    setTimeout(() => {
      completed.push('first')
      registry.track(new Promise<void>((innerResolve) => {
        setTimeout(() => {
          completed.push('second')
          innerResolve()
        }, 0)
      }))
      resolve()
    }, 0)
  }))

  await registry.flush()
  assert.deepEqual(completed, ['first', 'second'])
  assert.equal(registry.size, 0)
})
