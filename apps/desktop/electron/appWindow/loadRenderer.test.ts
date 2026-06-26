import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { BrowserWindow } from 'electron'
import { installDevRendererNetworkRecovery } from './devRendererNetworkRecovery'

test('dev renderer network recovery coalesces ERR_NETWORK_CHANGED bursts into one retry', async (t) => {
  const webContents = new FakeWebContents()
  const win = new FakeBrowserWindow(webContents)
  installDevRendererNetworkRecovery(
    win as unknown as BrowserWindow,
    'http://127.0.0.1:5173/',
    'http://127.0.0.1:5173/agent',
  )

  webContents.emitErrorOccurred('http://127.0.0.1:5173/src/main.tsx')
  webContents.emitErrorOccurred('http://127.0.0.1:5173/src/App.tsx')
  webContents.emitFailLoad('http://127.0.0.1:5173/src/shared/application/navigationEvents.ts')

  await new Promise((resolve) => setTimeout(resolve, 425))

  assert.deepEqual(win.loadURLs, [
    'http://127.0.0.1:5173/agent',
  ])
})

class FakeBrowserWindow extends EventEmitter {
  loadURLs: string[] = []

  constructor(readonly webContents: FakeWebContents) {
    super()
  }

  isDestroyed(): boolean {
    return false
  }

  loadURL(url: string): Promise<void> {
    this.loadURLs.push(url)
    return Promise.resolve()
  }

  loadFile(): Promise<void> {
    return Promise.resolve()
  }
}

class FakeWebContents extends EventEmitter {
  readonly session = new FakeSession()

  isDestroyed(): boolean {
    return false
  }

  emitFailLoad(url: string): void {
    this.emit('did-fail-load', {}, -21, 'net::ERR_NETWORK_CHANGED', url)
  }

  emitErrorOccurred(url: string): void {
    this.session.emitErrorOccurred({
      error: 'net::ERR_NETWORK_CHANGED',
      url,
    })
  }
}

class FakeSession {
  private onErrorOccurredCallback?: (details: { error: string, url: string }) => void

  clearCache(): Promise<void> {
    return Promise.resolve()
  }

  readonly webRequest = {
    onErrorOccurred: (_filter: unknown, callback: (details: { error: string, url: string }) => void) => {
      this.onErrorOccurredCallback = callback
    },
  }

  emitErrorOccurred(details: { error: string, url: string }): void {
    this.onErrorOccurredCallback?.(details)
  }
}
