import { expect, test, type Page, type Route } from '@playwright/test'
import path from 'node:path'

import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'
import { installE2EBootstrapSeed } from './e2eBootstrapSeed'

const CANVASES = [
  makeCanvas(101, 'E2E Inspiration Canvas', 'inspiration'),
  makeCanvas(102, 'E2E Workflow Canvas', 'workflow'),
]

const IMAGE_MODEL = {
  id: 7101,
  provider_id: 'local_provider:7',
  model_def_id: 'e2e-image-v1',
  provider: 'e2e',
  display_name: 'E2E Image Model',
  short_name: 'e2e-image',
  capabilities: ['image_generation'],
  accepts_image_input: true,
  is_default: true,
  supported_params: [],
}

const IMAGE_RESOURCE = {
  ID: 9101,
  owner_id: 1001,
  type: 'image',
  name: 'e2e-reference.png',
  url: '/api/v1/resources/9101/file',
  size: 2048,
  mime_type: 'image/png',
}

test('canvas list, opened canvas, and tools render as standalone page programs', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('standalone page programs E2E requires a baseURL')
  const visualQaScreenshotDir = process.env.MOVSCRIPT_VISUAL_QA_SCREENSHOT_DIR?.trim()
  const visualQaViewport = process.env.MOVSCRIPT_VISUAL_QA_VIEWPORT?.trim()

  await installBootstrap(page, String(baseURL))
  await mockGenerationAppShell(page)
  await mockStandaloneProgramData(page)

  await page.goto('/canvases')
  await expect(page.locator('.app-shell[data-surface="canvas"]')).toBeVisible()
  await expect(page.locator('.app-window-route-title')).toContainText(/画布|Canvases/)
  await expect(page.getByText('E2E Inspiration Canvas')).toBeVisible()
  await expect(page.getByText('E2E Workflow Canvas')).toBeVisible()

  await page.locator('.canvas-list-search__input').fill('Workflow')
  await expect(page.getByText('E2E Workflow Canvas')).toBeVisible()
  await expect(page.getByText('E2E Inspiration Canvas')).toHaveCount(0)

  const workflowRow = page.locator('.canvas-list-item').filter({ hasText: 'E2E Workflow Canvas' })
  await expect(workflowRow).toHaveCount(1)
  await workflowRow.getByRole('button', { name: /打开|Open/ }).click()
  await expect(page).toHaveURL(/\/canvases\/(?::id|102)(?:\?[^#]*canvasId=102[^#]*)?$/)
  await expect(page.locator('.app-shell[data-surface="canvas"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '启动运行' })).toBeVisible()

  await page.goto('/tools/image')
  await expect(page.locator('.app-shell[data-surface="tool"]')).toBeVisible()
  await expect(page.locator('.app-window-route-title')).toContainText(/图片生成|Image Generation/)
  await expect(page.getByRole('combobox', { name: '模型' })).toContainText('e2e-image')
  await expect(page.getByText('e2e-reference.png')).toBeVisible()
  if (visualQaScreenshotDir) {
    await page.screenshot({
      path: path.join(visualQaScreenshotDir, `image-tool-${visualQaViewport || 'desktop'}.png`),
      fullPage: false,
    })
  }

  const sidebarSlot = page.locator('.app-shell__slot--left')
  await expect(sidebarSlot).toBeVisible()
  const hideSidebarButton = page.locator('.tool-sidebar-window-controls button[aria-label="隐藏左侧栏"]')
  await expect(hideSidebarButton).toHaveCount(1)
  await hideSidebarButton.click()
  await expect(sidebarSlot).toHaveAttribute('data-hidden', 'true')
  await expect(page).toHaveURL(/\/tools\/image$/)
})

async function installBootstrap(page: Page, baseURL: string) {
  await installE2EBootstrapSeed(page, buildGenerationAppBootstrap(baseURL))
}

async function mockStandaloneProgramData(page: Page) {
  await page.route('**/v1/canvas/canvases**', async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    if (route.request().method() === 'GET' && pathname === '/v1/canvas/canvases') {
      await fulfillJSON(route, CANVASES)
      return
    }
    const detailMatch = pathname.match(/\/v1\/canvas\/canvases\/(\d+|:id)\/?$/)
    if (route.request().method() === 'GET' && detailMatch) {
      const queryCanvasId = url.searchParams.get('canvasId') ?? url.searchParams.get('canvas_id') ?? url.searchParams.get('id')
      const canvasId = Number(detailMatch[1] === ':id' ? queryCanvasId : detailMatch[1])
      const canvas = CANVASES.find((item) => item.ID === canvasId)
      await fulfillJSON(route, canvas ?? CANVASES[0])
      return
    }
    if (route.request().method() === 'POST') {
      const canvas = makeCanvas(103, 'Created E2E Canvas', 'inspiration')
      await fulfillJSON(route, canvas)
      return
    }
    await fulfillJSON(route, CANVASES[0])
  })

  await page.route('**/api/v1/models**', async (route) => {
    await fulfillJSON(route, [IMAGE_MODEL])
  })

  await page.route('**/api/v1/resource-folders**', async (route) => {
    await fulfillJSON(route, [])
  })

  await page.route('**/api/v1/projects/*/resource-bindings**', async (route) => {
    await fulfillJSON(route, [])
  })

  await page.route('**/api/v1/resources**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/resources') {
      const paginated = url.searchParams.has('page') || url.searchParams.has('page_size')
      await fulfillJSON(route, paginated ? { items: [IMAGE_RESOURCE], total: 1 } : [IMAGE_RESOURCE])
      return
    }
    await fulfillJSON(route, IMAGE_RESOURCE)
  })

  await page.route('**/api/v1/jobs**', async (route) => {
    await fulfillJSON(route, { items: [], total: 0 })
  })
}

function makeCanvas(id: number, name: string, canvasType: 'inspiration' | 'workflow') {
  return {
    ID: id,
    owner_id: 1001,
    project_id: 123,
    name,
    canvas_type: canvasType,
    nodes: [],
    edges: [],
  }
}

async function fulfillJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
