import { expect, test } from '@playwright/test'
import {
  assertGenerationLifecycle,
  bindGeneratedResource,
  mockGenerationBindingSuccess,
  mockGenerationBindingTargets,
  mockGenerationBindingValidationError,
} from './generationAssertions'

test.beforeEach(async ({ page }) => {
  await mockGenerationBindingTargets(page)
})

test('agent generation lifecycle renders live progress, final media, and binding success', async ({ page }) => {
  await mockGenerationBindingSuccess(page)

  await page.goto('/index.e2e.html')

  await assertGenerationLifecycle(page)
  const binding = await bindGeneratedResource(page, '77')
  await expect(binding).toContainText('已绑定资源 #9101')
})

test('agent generation binding surfaces backend validation errors', async ({ page }) => {
  await mockGenerationBindingValidationError(page)

  await page.goto('/index.e2e.html')

  const binding = await bindGeneratedResource(page, '404')
  await expect(binding).toContainText('目标对象不存在')
})
