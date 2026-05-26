import { expect, test } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/shared/infrastructure/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

test('video edit tool is hidden from navigation and direct access redirects away', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('video edit E2E requires a baseURL')

  const seed = buildGenerationAppBootstrap(String(baseURL)) as unknown
  await (page as unknown as {
    addInitScript(script: (arg: { key: string; seed: unknown }) => void, arg: { key: string; seed: unknown }): Promise<unknown>
  }).addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed,
  })

  await mockGenerationAppShell(page, 'video')
  await page.goto('/tools/ref-video-gen')

  await expect(page.getByRole('link', { name: '剪辑工具' })).toHaveCount(0)

  await page.goto('/tools/video-edit')
  await expect(page).toHaveURL(/\/tools\/ref-video-gen$/)
  await expect(page.getByRole('heading', { name: '剪辑工作台' })).toHaveCount(0)
})
