import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/shared/infrastructure/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

test('canonical content workbench renders the production workspace preview', async ({ page }, testInfo) => {
  await openCanonicalContentWorkbench(page, testInfo)

  await expect(page).toHaveURL(/\/project\/content-units\/editor/)
  await expect(page.getByTestId('content-source-workspace-page')).toBeVisible()
  await expect(page.getByPlaceholder('搜索层级节点或源文件')).toBeVisible()
})

test('canonical content workbench supports source tree search', async ({ page }, testInfo) => {
  await openCanonicalContentWorkbench(page, testInfo)

  await page.getByPlaceholder('搜索层级节点或源文件').fill('雨夜')

  await expect(page.getByTestId('content-source-workspace-page')).toBeVisible()
  await expect(page.getByText('雨夜电话打断告白')).toBeVisible()
})

async function openCanonicalContentWorkbench(page: Page, testInfo: TestInfo) {
  await installAppBootstrap(page, testInfo)
  await mockGenerationAppShell(page)
  await page.goto('/project/content-units/editor')
}

async function installAppBootstrap(page: Page, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('content workbench E2E requires a baseURL')

  const seed = buildGenerationAppBootstrap(String(baseURL)) as unknown
  await page.addInitScript(({ key, seed: bootstrapSeed }) => {
    window.localStorage.setItem(key, JSON.stringify(bootstrapSeed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed,
  })
}
