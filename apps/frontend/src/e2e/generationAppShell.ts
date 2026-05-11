import type { Page, Route } from '@playwright/test'
import { Buffer } from 'node:buffer'

const PROJECT = {
  ID: 123,
  name: 'E2E Demo Project',
  description: 'Seeded project used to verify agent generation monitoring in the real app shell.',
  owner_id: 1001,
  CreatedAt: '2026-05-09T11:00:00.000Z',
  UpdatedAt: '2026-05-09T12:00:00.000Z',
}

const GENERATED_RESOURCE = {
  ID: 9101,
  owner_id: 123,
  type: 'image',
  name: 'provider-image-redacted.png',
  url: '/api/v1/resources/9101/file',
  size: 2048,
  mime_type: 'image/png',
}

const TEXT_MODEL = {
  id: 31,
  credential_id: 3,
  display_name: 'E2E Text Model',
  short_name: 'e2e-text',
  capabilities: ['text'],
  accepts_image_input: false,
}

const DEFAULT_AGENT_MANIFEST = {
  schema: 'movscript.agent.current',
  id: 'e2e-agent',
  version: '1.0.0',
  name: 'E2E Agent',
  permissions: [],
  tools: [],
}

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

const TINY_MP4 = Buffer.from(
  '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',
  'base64',
)

export type GenerationMediaKind = 'image' | 'video'

export async function mockGenerationAppShell(page: Page, kind: GenerationMediaKind = 'image') {
  const resource = kind === 'video'
    ? {
        ...GENERATED_RESOURCE,
        ID: 9102,
        type: 'video' as const,
        name: 'provider-video-redacted.mp4',
        url: '/api/v1/resources/9102/file',
        size: 4096,
        mime_type: 'video/mp4',
      }
    : GENERATED_RESOURCE

  await page.route('**/api/v1/projects', async (route) => {
    await fulfillJSON(route, [PROJECT])
  })

  await page.route('**/api/v1/models**', async (route) => {
    await fulfillJSON(route, [TEXT_MODEL])
  })

  await page.route('**/api/v1/resources**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/resources') {
      await fulfillJSON(route, { items: [resource], total: 1 })
      return
    }
    if (url.pathname === resource.url) {
      await route.fulfill({
        status: 200,
        contentType: resource.mime_type,
        body: kind === 'video' ? TINY_MP4 : ONE_BY_ONE_PNG,
      })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
  })

  await page.route('http://127.0.0.1:28765/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/health') {
      await fulfillJSON(route, {
        ok: true,
        service: 'movscript-agent',
        mode: 'e2e',
        mcpEndpoint: 'http://127.0.0.1:29999/mcp',
        runtime: { apiVersion: 1, features: ['generation-monitoring'], endpoints: [] },
      })
      return
    }
    if (url.pathname === '/inspect') {
      await fulfillJSON(route, {
        mcpEndpoint: 'http://127.0.0.1:29999/mcp',
        resources: [],
        tools: [],
        registeredTools: [],
        skills: [],
        defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      })
      return
    }
    if (url.pathname === '/capabilities') {
      await fulfillJSON(route, {
        defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
        mcp: { connected: true, resources: [], tools: [] },
        registry: [],
        resolvedTools: { discovered: [], available: [], blocked: [], byName: {} },
        warnings: [],
      })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
  })
}

async function fulfillJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
