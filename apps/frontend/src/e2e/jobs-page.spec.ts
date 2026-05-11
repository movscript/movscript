import { expect, test } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const JOBS = [
  makeJob(8101, 'image', 'pending', '等待中的图片'),
  makeJob(8102, 'video', 'running', '运行中的视频'),
  makeJob(8103, 'image_edit', 'succeeded', '成功的图片', {
    output_resource: {
      ID: 9103,
      owner_id: 123,
      type: 'image',
      name: 'done-image.png',
      url: '/api/v1/resources/9103/file',
      size: 2048,
      mime_type: 'image/png',
    },
  }),
  makeJob(8104, 'video_i2v', 'failed', '失败的视频', {
    error_msg: 'provider rejected request',
    provider_task_history: '[{"status":"running","message":"provider started"},{"status":"failed","message":"provider rejected request"}]',
    state_trace: JSON.stringify([
      {
        state: 'created',
        status: 'running',
        message: 'job created',
        started_at: '2026-05-09T12:00:00.000Z',
      },
      {
        state: 'provider',
        status: 'failed',
        error: 'provider rejected request',
        started_at: '2026-05-09T12:00:10.000Z',
        finished_at: '2026-05-09T12:00:30.000Z',
        duration_ms: 20000,
      },
    ]),
  }),
  makeJob(8105, 'video_v2v', 'cancelled', '取消的视频', { error_msg: 'user cancelled task' }),
]

test('jobs page filters generation jobs by operational status', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('jobs page E2E requires a baseURL')
  let retryCalled = false

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildGenerationAppBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  await page.route('**/api/v1/jobs*', async (route) => {
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    const jobs = status ? JOBS.filter((job) => job.status === status) : JOBS
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-total-count': String(jobs.length) },
      body: JSON.stringify(jobs),
    })
  })
  await page.route('**/api/v1/jobs/8104/retry', async (route) => {
    retryCalled = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...JOBS.find((job) => job.ID === 8104)!, status: 'pending', error_msg: undefined }),
    })
  })

  await page.goto('/jobs')

  await expect(page.getByRole('button', { name: '全部状态' })).toBeVisible()
  await expect(page.getByText('等待中的图片')).toBeVisible()
  await expect(page.getByText('运行中的视频')).toBeVisible()
  await expect(page.getByText('失败的视频')).toBeVisible()

  await page.getByRole('button', { name: '失败', exact: true }).click()
  await expect(page.getByText('失败的视频')).toBeVisible()
  await expect(page.getByText('运行中的视频')).toHaveCount(0)
  await expect(page.getByText('取消的视频')).toHaveCount(0)
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page.getByTestId('job-detail-card')).toContainText('状态轨迹')
  await expect(page.getByTestId('job-detail-card')).toContainText('provider rejected request')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => retryCalled).toBeTruthy()

  await page.getByRole('button', { name: '已取消', exact: true }).click()
  await expect(page.getByText('取消的视频')).toBeVisible()
  await expect(page.getByText('失败的视频')).toHaveCount(0)
})

function makeJob(id: number, jobType: string, status: string, prompt: string, patch: Record<string, unknown> = {}) {
  return {
    ID: id,
    user_id: 1001,
    project_id: 123,
    model_config_id: 31,
    job_type: jobType,
    status,
    prompt,
    feature_key: 'e2e.jobs',
    CreatedAt: '2026-05-09T12:00:00.000Z',
    UpdatedAt: '2026-05-09T12:00:30.000Z',
    ...patch,
  }
}
