import { expect, test, type Page, type Route } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/shared/infrastructure/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const CANVASES = [
  makeCanvas(101, 'E2E Inspiration Canvas', 'inspiration'),
  makeCanvas(102, 'E2E Workflow Canvas', 'workflow'),
]

const IMAGE_MODEL = {
  id: 7101,
  credential_id: 7,
  model_def_id: 'e2e-image-v1',
  provider: 'e2e',
  display_name: 'E2E Image Model',
  short_name: 'e2e-image',
  capabilities: ['image'],
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
  await expect(page).toHaveURL(/\/canvases\/102$/)
  await expect(page.locator('.app-shell[data-surface="canvas"]')).toBeVisible()
  await expect(page.getByText('E2E Workflow Canvas')).toBeVisible()

  await page.goto('/tools/ref-image-gen')
  await expect(page.locator('.app-shell[data-surface="tool"]')).toBeVisible()
  await expect(page.locator('.app-window-route-title')).toContainText(/参考生图|参考图生成|Reference Image/)
  await expect(page.getByText('e2e-image')).toBeVisible()
  await expect(page.getByText('e2e-reference.png')).toBeVisible()

  const sidebarSlot = page.locator('.app-shell__slot--left')
  await expect(sidebarSlot).toBeVisible()
  const hideSidebarButton = page.locator('.tool-sidebar-window-controls button[aria-label="隐藏左侧栏"]')
  await expect(hideSidebarButton).toHaveCount(1)
  await hideSidebarButton.click()
  await expect(sidebarSlot).toHaveAttribute('data-hidden', 'true')
  await expect(page).toHaveURL(/\/tools\/ref-image-gen$/)
})

async function installBootstrap(page: Page, baseURL: string) {
  const seed = buildGenerationAppBootstrap(baseURL) as unknown
  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed,
  })
}

async function mockStandaloneProgramData(page: Page) {
  await page.route('**/api/v1/canvases**', async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    if (route.request().method() === 'GET' && pathname === '/api/v1/canvases') {
      await fulfillJSON(route, CANVASES)
      return
    }
    const detailMatch = pathname.match(/\/api\/v1\/canvases\/(\d+)$/)
    if (route.request().method() === 'GET' && detailMatch) {
      const canvas = CANVASES.find((item) => item.ID === Number(detailMatch[1]))
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
