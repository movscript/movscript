import { expect, type Page } from '@playwright/test'

export async function mockGenerationBindingTargets(page: Page) {
  await page.route('**/api/v1/projects/123/asset-slots**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          ID: 77,
          name: '主视觉素材位',
          status: 'open',
          description: '需要一张可审阅的生成图',
        },
      ]),
    })
  })
}

export async function mockGenerationBindingSuccess(page: Page, resourceId = 9101) {
  await page.route('**/api/v1/projects/123/resource-bindings', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    const payload = request.postDataJSON() as Record<string, unknown>
    expect(payload.resource_id).toBe(resourceId)
    expect(payload.owner_type).toBe('asset_slot')
    expect(payload.owner_id).toBe(77)
    expect(payload.status).toBe('selected')
    expect(payload.source_type).toBe('job')
    expect(payload.source_id).toBe(2001)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ID: 501,
        project_id: 123,
        resource_id: resourceId,
        owner_type: 'asset_slot',
        owner_id: 77,
        role: 'output',
        slot: 'selected',
        status: 'selected',
      }),
    })
  })
}

export async function mockGenerationBindingValidationError(page: Page) {
  await page.route('**/api/v1/projects/123/resource-bindings', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          message: '目标对象不存在',
        },
      }),
    })
  })
}

export async function assertGenerationLifecycle(page: Page) {
  await assertGenerationSuccessLifecycle(page, {
    resultName: 'provider-image-redacted.png',
    resourceId: 9101,
    providerName: 'Sanitized Image Provider',
    mimeType: 'image/png',
  })
}

export async function assertGenerationSuccessLifecycle(
  page: Page,
  expected: {
    resultName: string
    resourceId: number
    providerName: string
    mimeType: string
  },
) {
  await expect(page.getByTestId('agent-generation-progress')).toBeVisible()
  await expect(page.getByTestId('agent-generation-progress-bar')).toHaveAttribute('aria-valuenow', '47')
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('Job #2001')
  await expect(page.getByTestId('agent-generation-job-progress-bar')).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByTestId('agent-generation-trace-summary')).toContainText('成功1')

  const resultCard = page.getByTestId('agent-generated-result-card')
  await expect(resultCard).toBeVisible()
  await expect(resultCard).toContainText(expected.resultName)
  await expect(resultCard).toContainText(`#${expected.resourceId}`)
  await expect(resultCard).toContainText(expected.providerName)
  await expect(resultCard).toContainText(expected.mimeType)
}

export async function assertGenerationFailureLifecycle(page: Page) {
  await expect(page.getByTestId('agent-generation-progress')).toHaveCount(0)
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('Job #2001')
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('失败')
  await expect(page.getByTestId('agent-generation-job-progress-bar')).toHaveAttribute('aria-valuenow', '47')
  await expect(page.getByTestId('agent-generation-trace-summary')).toContainText('失败1')
  await expect(page.getByTestId('agent-generated-result-card')).toHaveCount(0)
}

export async function assertGenerationTimeoutLifecycle(page: Page) {
  await expect(page.getByTestId('agent-generation-progress')).toHaveCount(0)
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('Job #2001')
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('超时')
  await expect(page.getByTestId('agent-generation-job-progress-bar')).toHaveAttribute('aria-valuenow', '47')
  await expect(page.getByTestId('agent-generation-trace-summary')).toContainText('超时1')
  await expect(page.getByTestId('agent-generated-result-card')).toHaveCount(0)
}

export async function bindGeneratedResource(page: Page, targetId: string) {
  const binding = page.getByTestId('agent-generated-resource-binding')
  await expect(binding).toBeVisible()
  await binding.getByPlaceholder('ID', { exact: true }).fill(targetId)
  await binding.getByRole('button', { name: '绑定' }).click()
  return binding
}
