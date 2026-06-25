import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentAttachmentDataUrl } from '@/features/agent/application/agentAttachmentDataUrl'
import { __resetAgentLocalFileRegistryForTests, registerAgentLocalFile, releaseAgentLocalFile } from '@/features/agent/application/agentLocalFileRegistry'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

test('resolveAgentAttachmentDataUrl returns existing image payload without loading resource bytes', async () => {
  let loads = 0
  const dataUrl = await resolveAgentAttachmentDataUrl(
    attachment({ dataUrl: 'data:image/png;base64,AAAA' }),
    {
      loadResourceDataURL: async () => {
        loads += 1
        return 'data:image/png;base64,BBBB'
      },
    },
  )

  assert.equal(dataUrl, 'data:image/png;base64,AAAA')
  assert.equal(loads, 0)
})

test('resolveAgentAttachmentDataUrl loads image resource data URL with abort signal', async () => {
  const seenSignals: AbortSignal[] = []
  const dataUrl = await resolveAgentAttachmentDataUrl(
    attachment({ resourceId: 42 }),
    {
      loadResourceDataURL: async (resourceId, options) => {
        assert.equal(resourceId, 42)
        assert.ok(options?.signal)
        seenSignals.push(options.signal)
        return 'data:image/png;base64,CCCC'
      },
    },
  )

  assert.equal(dataUrl, 'data:image/png;base64,CCCC')
  assert.equal(seenSignals.length, 1)
  assert.equal(seenSignals[0]?.aborted, false)
})

test('resolveAgentAttachmentDataUrl resolves registered local image files without resource loading', async () => {
  const restoreFileReader = installTestFileReader()
  let loads = 0
  try {
    __resetAgentLocalFileRegistryForTests()
    const file = new File([Uint8Array.from([1, 2, 3])], 'local.png', { type: 'image/png' })
    const source = registerAgentLocalFile(file)
    const dataUrl = await resolveAgentAttachmentDataUrl(
      attachment({ source }),
      {
        loadResourceDataURL: async () => {
          loads += 1
          return 'data:image/png;base64,BBBB'
        },
      },
    )

    assert.equal(dataUrl, 'data:image/png;base64,AQID')
    assert.equal(loads, 0)
  } finally {
    __resetAgentLocalFileRegistryForTests()
    restoreFileReader()
  }
})

test('resolveAgentAttachmentDataUrl returns inline source payload without loading resource bytes', async () => {
  let loads = 0
  const dataUrl = await resolveAgentAttachmentDataUrl(
    attachment({ source: { kind: 'inline_data', dataUrl: 'data:image/png;base64,INLINE' } }),
    {
      loadResourceDataURL: async () => {
        loads += 1
        return 'data:image/png;base64,BBBB'
      },
    },
  )

  assert.equal(dataUrl, 'data:image/png;base64,INLINE')
  assert.equal(loads, 0)
})

test('resolveAgentAttachmentDataUrl stops resolving released local image files', async () => {
  const restoreFileReader = installTestFileReader()
  try {
    __resetAgentLocalFileRegistryForTests()
    const file = new File([Uint8Array.from([1, 2, 3])], 'local.png', { type: 'image/png' })
    const source = registerAgentLocalFile(file)
    releaseAgentLocalFile(source.fileId)

    const dataUrl = await resolveAgentAttachmentDataUrl(attachment({ source }))
    assert.equal(dataUrl, undefined)
  } finally {
    __resetAgentLocalFileRegistryForTests()
    restoreFileReader()
  }
})

test('resolveAgentAttachmentDataUrl keeps non-image resource attachments metadata only', async () => {
  let loads = 0
  const dataUrl = await resolveAgentAttachmentDataUrl(
    attachment({ type: 'video', mimeType: 'video/mp4', resourceId: 42 }),
    {
      loadResourceDataURL: async () => {
        loads += 1
        return 'data:image/png;base64,DDDD'
      },
    },
  )

  assert.equal(dataUrl, undefined)
  assert.equal(loads, 0)
})

test('resolveAgentAttachmentDataUrl aborts resource loading after timeout', async () => {
  let aborted = false
  await assert.rejects(
    resolveAgentAttachmentDataUrl(
      attachment({ resourceId: 42 }),
      {
        timeoutMs: 1,
        loadResourceDataURL: (_resourceId, options) => new Promise((resolve, reject) => {
          const signal = options?.signal
          assert.ok(signal)
          signal.addEventListener('abort', () => {
            aborted = true
            reject(signal.reason)
          }, { once: true })
          globalThis.setTimeout(() => resolve('data:image/png;base64,EEEE'), 50)
        }),
      },
    ),
    /loading image resource 42 timed out after 1ms/,
  )
  assert.equal(aborted, true)
})

function attachment(overrides: Partial<AgentAttachment> = {}): AgentAttachment {
  return {
    id: 'att_1',
    name: 'shot.png',
    type: 'image',
    mimeType: 'image/png',
    size: 12,
    ...overrides,
  } as AgentAttachment
}

function installTestFileReader(): () => void {
  const previous = globalThis.FileReader
  class TestFileReader {
    result: string | ArrayBuffer | null = null
    error: Error | null = null
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null

    readAsDataURL(file: File) {
      file.arrayBuffer()
        .then((buffer) => {
          this.result = `data:${file.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
          this.onload?.({} as ProgressEvent<FileReader>)
        })
        .catch((error: Error) => {
          this.error = error
          this.onerror?.({} as ProgressEvent<FileReader>)
        })
    }
  }
  globalThis.FileReader = TestFileReader as unknown as typeof FileReader
  return () => {
    globalThis.FileReader = previous
  }
}
