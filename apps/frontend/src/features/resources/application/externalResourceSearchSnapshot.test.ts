import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY,
  EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY,
  externalResourceSearchInitialData,
  loadExternalResourceSearchSnapshot,
  normalizeExternalMediaTypes,
  normalizeExternalOrientation,
  normalizeExternalSnapshotPage,
  parseExternalResourceSearchSnapshot,
  saveExternalResourceSearchSnapshot,
  type ExternalResourceSearchSnapshot,
} from './externalResourceSearchSnapshot'

const result = {
  total: 1,
  items: [{ provider_key: 'pexels', media_type: 'image', external_id: '1' }],
  page: 2,
  page_size: 20,
  provider: 'pexels',
}

test('external resource search snapshot parser normalizes persisted filters', () => {
  assert.deepEqual(
    parseExternalResourceSearchSnapshot(JSON.stringify({
      sourceId: 7,
      query: '  city ',
      submittedQuery: ' city ',
      mediaTypes: ['video', 'image', 'image', 'bad'],
      orientation: 'portrait',
      page: '3',
      result,
    })),
    {
      sourceId: 7,
      query: 'city',
      submittedQuery: 'city',
      mediaTypes: ['image', 'video'],
      orientation: 'portrait',
      page: 3,
      result,
    },
  )
})

test('external resource search snapshot rejects unusable payloads', () => {
  assert.equal(parseExternalResourceSearchSnapshot(null), null)
  assert.equal(parseExternalResourceSearchSnapshot('{'), null)
  assert.equal(parseExternalResourceSearchSnapshot(JSON.stringify({ submittedQuery: '', result })), null)
  assert.equal(parseExternalResourceSearchSnapshot(JSON.stringify({ submittedQuery: 'city', result: { items: null } })), null)
})

test('external resource search initial data only restores exact active searches', () => {
  const snapshot = parseExternalResourceSearchSnapshot(JSON.stringify({
    sourceId: 7,
    submittedQuery: 'city',
    mediaTypes: ['image'],
    orientation: 'landscape',
    page: 2,
    result,
  }))

  assert.deepEqual(
    externalResourceSearchInitialData(snapshot, {
      sourceId: 7,
      submittedQuery: ' city ',
      mediaTypeKey: 'image',
      orientation: 'landscape',
      page: 2,
    }),
    result,
  )
  assert.equal(
    externalResourceSearchInitialData(snapshot, {
      sourceId: 8,
      submittedQuery: 'city',
      mediaTypeKey: 'image',
      orientation: 'landscape',
      page: 2,
    }),
    undefined,
  )
})

test('external resource search filter normalizers provide stable defaults', () => {
  assert.deepEqual(normalizeExternalMediaTypes(['video', 'image', 'image']), ['image', 'video'])
  assert.deepEqual(normalizeExternalMediaTypes(['bad']), ['image', 'video'])
  assert.equal(normalizeExternalOrientation('square'), 'square')
  assert.equal(normalizeExternalOrientation('wide'), 'all')
  assert.equal(normalizeExternalSnapshotPage(4.8), 4)
  assert.equal(normalizeExternalSnapshotPage(-1), 1)
})

test('external resource search snapshot uses browser storage as the web fallback', () => {
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
    const snapshot = externalResourceSearchSnapshot()

    assert.equal(loadExternalResourceSearchSnapshot(), null)

    saveExternalResourceSearchSnapshot(snapshot)

    assert.equal(storage.get(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY), JSON.stringify(snapshot))
    assert.deepEqual(loadExternalResourceSearchSnapshot(), snapshot)
  } finally {
    globalThis.window = previousWindow
  }
})

test('external resource search snapshot hydrates from MovScript Home desktop state', async () => {
  const previousWindow = globalThis.window
  const legacySnapshot = externalResourceSearchSnapshot({ submittedQuery: 'legacy' })
  const homeSnapshot = externalResourceSearchSnapshot({ submittedQuery: 'home', query: 'home', page: 3 })
  const storage = new Map<string, string>([[EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(legacySnapshot)]])
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
          value: JSON.stringify(homeSnapshot),
        }
      },
    },
  } as typeof window

  try {
    assert.equal(loadExternalResourceSearchSnapshot(), null)
    assert.equal(desktopReads[0]?.key, EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY)

    await waitForAsyncStorage()

    assert.deepEqual(loadExternalResourceSearchSnapshot(), homeSnapshot)
    assert.equal(storage.has(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

test('external resource search snapshot migrates legacy browser state into MovScript Home', async () => {
  const previousWindow = globalThis.window
  const legacySnapshot = externalResourceSearchSnapshot({ submittedQuery: 'legacy', query: 'legacy', page: 2 })
  const storage = new Map<string, string>([[EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(legacySnapshot)]])
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
    assert.equal(loadExternalResourceSearchSnapshot(), null)

    await waitForAsyncStorage()

    assert.deepEqual(loadExternalResourceSearchSnapshot(), legacySnapshot)
    assert.equal(desktopWrites.length, 1)
    assert.equal(desktopWrites[0]?.key, EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY)
    assert.equal(desktopWrites[0]?.value, JSON.stringify(legacySnapshot))
    assert.equal(storage.has(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

test('external resource search snapshot writes updates to MovScript Home desktop state', async () => {
  const previousWindow = globalThis.window
  const snapshot = externalResourceSearchSnapshot({ submittedQuery: 'mountain', query: 'mountain' })
  const storage = new Map<string, string>([[EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, '{}']])
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
    saveExternalResourceSearchSnapshot(snapshot)

    await waitForAsyncStorage()

    assert.deepEqual(loadExternalResourceSearchSnapshot(), snapshot)
    assert.equal(desktopWrites.length, 1)
    assert.equal(desktopWrites[0]?.key, EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY)
    assert.equal(desktopWrites[0]?.value, JSON.stringify(snapshot))
    assert.equal(storage.has(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

function externalResourceSearchSnapshot(input: Partial<ExternalResourceSearchSnapshot> = {}): ExternalResourceSearchSnapshot {
  return {
    sourceId: 7,
    query: 'city',
    submittedQuery: 'city',
    mediaTypes: ['image'],
    orientation: 'landscape',
    page: 2,
    result,
    ...input,
  } as NonNullable<ReturnType<typeof parseExternalResourceSearchSnapshot>>
}

function waitForAsyncStorage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
