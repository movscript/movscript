import type { Page } from '@playwright/test'

export async function installAgentRuntimeApiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type StreamMessage = { streamId: string; kind: 'message' | 'error' | 'end'; data?: string; error?: string }
    type StreamHandler = (message: StreamMessage) => void

    const globalWindow = window as Window & {
      api?: Record<string, unknown>
      __movscriptE2EAgentRuntimeAPIInstalled?: boolean
    }
    if (globalWindow.__movscriptE2EAgentRuntimeAPIInstalled) return
    globalWindow.__movscriptE2EAgentRuntimeAPIInstalled = true

    const streamHandlers = new Set<StreamHandler>()

    async function fetchRuntime(input: {
      path: string
      method?: string
      headers?: Record<string, string>
      body?: string
    }) {
      return fetch(input.path, {
        method: input.method ?? 'GET',
        headers: input.headers,
        body: input.body,
      })
    }

    async function electronResponseFromFetch(response: Response, body: string) {
      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      }
    }

    function emitStreamMessage(message: StreamMessage) {
      for (const handler of streamHandlers) handler(message)
    }

    function parseSSEMessages(text: string): string[] {
      return text
        .replace(/\r\n/g, '\n')
        .split('\n\n')
        .map((block) => block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n'))
        .filter(Boolean)
    }

    globalWindow.api = {
      ...(globalWindow.api ?? {}),
      ensureAgentRuntime: async (input?: { sessionId?: string; workspaceDir?: string }) => ({
        ok: true,
        running: true,
        managed: true,
        started: false,
        baseURL: 'electron:agent-runtime',
        transportKind: 'http',
        endpoint: 'electron:agent-runtime',
        ...(input?.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input?.workspaceDir ? { workspaceDir: input.workspaceDir } : {}),
      }),
      agentRuntimeRequest: async (input: {
        path: string
        method?: string
        headers?: Record<string, string>
        body?: string
      }) => {
        const response = await fetchRuntime(input)
        return electronResponseFromFetch(response, await response.text())
      },
      agentRuntimeOpenEventStream: async (input: {
        streamId: string
        path: string
        method?: string
        headers?: Record<string, string>
        body?: string
      }) => {
        const response = await fetchRuntime(input)
        const body = await response.text()
        if (response.ok) {
          setTimeout(() => {
            for (const data of parseSSEMessages(body)) {
              emitStreamMessage({ streamId: input.streamId, kind: 'message', data })
            }
            emitStreamMessage({ streamId: input.streamId, kind: 'end' })
          }, 0)
        }
        return electronResponseFromFetch(response, response.ok ? '' : body)
      },
      agentRuntimeCloseEventStream: async () => undefined,
      onAgentRuntimeStreamMessage: (handler: StreamHandler) => {
        streamHandlers.add(handler)
        return () => streamHandlers.delete(handler)
      },
      listAgentRuntimeSessions: async () => ({ sessions: [] }),
      getAgentWorkspaceConfig: async () => ({
        schema: 'movscript.agent.workspace-config.v1',
        updatedAt: new Date().toISOString(),
      }),
      saveAgentWorkspaceConfig: async () => ({
        schema: 'movscript.agent.workspace-config.v1',
        updatedAt: new Date().toISOString(),
      }),
    }
  })
}
