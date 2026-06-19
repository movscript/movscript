import assert from 'node:assert/strict'
import test from 'node:test'

import { EDITING_LAYOUT_STORAGE_KEY } from '../domain/constants'
import {
  defaultEditingLayoutSizes,
  persistEditingLayoutSizes,
  readEditingLayoutSizes,
} from './layoutPersistence'

test('editing layout uses browser storage as the web fallback', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
  } as typeof window

  try {
    assert.deepEqual(readEditingLayoutSizes(), defaultEditingLayoutSizes())

    persistEditingLayoutSizes({ libraryWidth: 340, inspectorWidth: 360, timelineHeight: 260 })

    assert.equal(storage.get(EDITING_LAYOUT_STORAGE_KEY), JSON.stringify({ libraryWidth: 340, inspectorWidth: 360, timelineHeight: 260 }))
    assert.deepEqual(readEditingLayoutSizes(), { libraryWidth: 340, inspectorWidth: 360, timelineHeight: 260 })

    storage.set(EDITING_LAYOUT_STORAGE_KEY, JSON.stringify({ libraryWidth: 380, inspectorWidth: 390, timelineHeight: 280 }))
    assert.deepEqual(readEditingLayoutSizes(), { libraryWidth: 380, inspectorWidth: 390, timelineHeight: 280 })
  } finally {
    globalThis.window = previousWindow
  }
})

test('editing layout hydrates from MovScript Home desktop state', async () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>([
    [EDITING_LAYOUT_STORAGE_KEY, JSON.stringify({ libraryWidth: 300, inspectorWidth: 320, timelineHeight: 230 })],
  ])
  const desktopReads: Array<{ key: string }> = []
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    api: {
      getDesktopState: async (input: { key: string }) => {
        desktopReads.push(input)
        return {
          key: input.key,
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          path: '',
          version: '',
          value: JSON.stringify({ libraryWidth: 360, inspectorWidth: 380, timelineHeight: 280 }),
        }
      },
    },
  } as typeof window

  try {
    assert.deepEqual(readEditingLayoutSizes(), { libraryWidth: 300, inspectorWidth: 320, timelineHeight: 230 })
    assert.equal(desktopReads[0]?.key, 'movscript-editing-workspace-layout-v1')

    await waitForAsyncStorage()

    assert.deepEqual(readEditingLayoutSizes(), { libraryWidth: 360, inspectorWidth: 380, timelineHeight: 280 })
    assert.equal(storage.has(EDITING_LAYOUT_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

test('editing layout migrates legacy browser state into MovScript Home', async () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>([
    [EDITING_LAYOUT_STORAGE_KEY, JSON.stringify({ libraryWidth: 340, inspectorWidth: 360, timelineHeight: 260 })],
  ])
  const desktopWrites: Array<{ key: string; value: unknown }> = []
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    api: {
      getDesktopState: async (input: { key: string }) => ({
        key: input.key,
        movScriptHomeDir: '/tmp/movscript-home',
        workspaceDir: '/tmp/movscript-home',
        path: '',
        version: '',
        value: null,
      }),
      setDesktopState: async (input: { key: string; value: unknown }) => {
        desktopWrites.push(input)
        return {
          key: input.key,
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          path: '',
          version: '',
          value: input.value,
        }
      },
    },
  } as typeof window

  try {
    assert.deepEqual(readEditingLayoutSizes(), { libraryWidth: 340, inspectorWidth: 360, timelineHeight: 260 })

    await waitForAsyncStorage()

    assert.equal(desktopWrites.length, 1)
    assert.equal(desktopWrites[0]?.key, 'movscript-editing-workspace-layout-v1')
    assert.equal(desktopWrites[0]?.value, JSON.stringify({ libraryWidth: 340, inspectorWidth: 360, timelineHeight: 260 }))
    assert.equal(storage.has(EDITING_LAYOUT_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

test('editing layout writes updates to MovScript Home desktop state', async () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>([[EDITING_LAYOUT_STORAGE_KEY, '{}']])
  const desktopWrites: Array<{ key: string; value: unknown }> = []
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    api: {
      getDesktopState: async (input: { key: string }) => ({
        key: input.key,
        movScriptHomeDir: '/tmp/movscript-home',
        workspaceDir: '/tmp/movscript-home',
        path: '',
        version: '',
        value: null,
      }),
      setDesktopState: async (input: { key: string; value: unknown }) => {
        desktopWrites.push(input)
        return {
          key: input.key,
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          path: '',
          version: '',
          value: input.value,
        }
      },
    },
  } as typeof window

  try {
    persistEditingLayoutSizes({ libraryWidth: 350, inspectorWidth: 370, timelineHeight: 250 })

    await waitForAsyncStorage()

    assert.equal(desktopWrites.length, 1)
    assert.equal(desktopWrites[0]?.key, 'movscript-editing-workspace-layout-v1')
    assert.equal(desktopWrites[0]?.value, JSON.stringify({ libraryWidth: 350, inspectorWidth: 370, timelineHeight: 250 }))
    assert.equal(storage.has(EDITING_LAYOUT_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

function waitForAsyncStorage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
