import { expect, test, type Page, type Route } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/shared/infrastructure/e2eBootstrap'
import type { ElectronOpenProjectWindowInput } from '@/shared/contracts/electronApiCore'
import type { Project } from '@/types'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const EXISTING_PROJECT: Project = {
  ID: 123,
  name: 'E2E Demo Project',
  description: 'Seeded project used to verify app home architecture.',
  owner_id: 1001,
  CreatedAt: '2026-05-09T11:00:00.000Z',
  UpdatedAt: '2026-05-09T12:00:00.000Z',
}

const CREATED_PROJECT: Project = {
  ID: 456,
  name: 'Home 创建项目',
  description: 'Home owns project creation.',
  owner_id: 1001,
  CreatedAt: '2026-05-10T11:00:00.000Z',
  UpdatedAt: '2026-05-10T11:00:00.000Z',
}

type WindowCall =
  | { type: 'agent' }
  | { type: 'canvas' }
  | { type: 'codex-plugin' }
  | { type: 'editing' }
  | { type: 'tool'; input?: { route?: string } }
  | { type: 'project'; input: ElectronOpenProjectWindowInput }
  | { type: 'home' }

test('app home opens agent, project, and canvas entry points', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await expect(page.getByRole('button', { name: /Agent/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Canvas/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /剪辑|Editing/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Tool/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /E2E Demo Project/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /新建项目|New Project/ })).toBeVisible()

  await page.getByRole('button', { name: /E2E Demo Project/ }).click()
  await expectWindowCall(page, { type: 'project', projectId: EXISTING_PROJECT.ID, route: '/project/home' })
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: /Agent/ }).click()
  await expectWindowCall(page, { type: 'agent' })
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: /安装到 Codex|Install to Codex/ }).click()
  await expectWindowCall(page, { type: 'codex-plugin' })

  await page.getByRole('button', { name: /Canvas/ }).click()
  await expectWindowCall(page, { type: 'canvas' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home opens the tool entry point', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await expect(page.getByRole('button', { name: /Tool/ })).toBeVisible()
  await page.getByRole('button', { name: /Tool/ }).click()
  await expectWindowCall(page, { type: 'tool', route: '/tools/ref-image-gen' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home opens the standalone editing entry point', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await page.getByRole('button', { name: /剪辑|Editing/ }).click()
  await expectWindowCall(page, { type: 'editing' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home creates project through the launcher dialog', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)

  await gotoHome(page)
  await expect(page.getByRole('button', { name: /新建项目|New Project/ })).toBeVisible()
  await page.getByRole('button', { name: /新建项目|New Project/ }).click()
  await page.getByLabel(/项目名称|Project name/).fill(CREATED_PROJECT.name)
  await page.getByLabel(/项目描述|Description/).fill(CREATED_PROJECT.description ?? '')
  await page.getByRole('button', { name: /创建项目|Create Project/ }).click()
  await expectWindowCall(page, { type: 'project', projectId: CREATED_PROJECT.ID, route: '/project/home' })
})

async function setupHomePage(page: Page, baseURL: unknown) {
  if (!baseURL) throw new Error('app home E2E requires a baseURL')
  await installHomeBootstrap(page, String(baseURL))
  await mockGenerationAppShell(page)
  await installWindowApiRecorder(page)
  await mockHomeProjects(page)
}

async function installHomeBootstrap(page: Page, baseURL: string) {
  const seed = buildGenerationAppBootstrap(baseURL) as unknown
  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed,
  })
}

async function gotoHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

async function installWindowApiRecorder(page: Page) {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      api?: Record<string, unknown>
      __movscriptWindowCalls?: WindowCall[]
    }
    globalWindow.__movscriptWindowCalls = []
    globalWindow.api = {
      ...(globalWindow.api ?? {}),
      getAppWindowContext: async () => ({ kind: 'home' }),
      openHomeWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'home' })
      },
      openAgentWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'agent' })
      },
      installMovScriptCodexPlugin: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'codex-plugin' })
        return {
          ok: true,
          openedCodex: false,
          marketplaceRoot: '/tmp/movscript-codex-marketplace',
          installCommand: 'codex plugin add movscript@movscript-local',
        }
      },
      sdkRuntimePackageStatus: async () => ({ installed: true }),
      openCanvasWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'canvas' })
      },
      openEditingWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'editing' })
      },
      openToolWindow: async (input?: { route?: string }) => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'tool', input })
      },
      openProjectWindow: async (input: ElectronOpenProjectWindowInput) => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'project', input })
      },
    }
  })
}

async function mockHomeProjects(page: Page) {
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJSON(route, CREATED_PROJECT)
      return
    }
    await fulfillJSON(route, [EXISTING_PROJECT])
  })
}

async function expectWindowCall(
  page: Page,
  expected:
    | { type: 'agent' }
    | { type: 'canvas' }
    | { type: 'codex-plugin' }
    | { type: 'editing' }
    | { type: 'tool'; route?: string }
    | { type: 'project'; projectId: number; route?: string },
) {
  await expect.poll(async () => page.evaluate(() => {
    return ((window as Window & { __movscriptWindowCalls?: WindowCall[] }).__movscriptWindowCalls ?? [])
  })).toContainEqual(expected.type === 'agent' || expected.type === 'canvas' || expected.type === 'editing' || expected.type === 'codex-plugin'
    ? { type: expected.type }
    : expected.type === 'tool'
      ? expect.objectContaining({
        type: 'tool',
        input: expect.objectContaining({
          ...(expected.route ? { route: expected.route } : {}),
        }),
      })
    : expect.objectContaining({
      type: 'project',
      input: expect.objectContaining({
        projectId: expected.projectId,
        ...(expected.route ? { route: expected.route } : {}),
      }),
    }))
}

async function fulfillJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
