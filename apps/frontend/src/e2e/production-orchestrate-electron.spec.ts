import { _electron as electron, expect, test } from '@playwright/test'
import electronPath from 'electron'
import { resolve } from 'node:path'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const PROJECT_ID = 123

test('electron renderer smoke reaches production orchestrate with project-level settings', async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('production orchestrate Electron E2E requires a baseURL')

  const app = await electron.launch({
    executablePath: String(electronPath),
    args: [resolve('src/e2e/electronGenerationMain.cjs')],
    env: {
      ...process.env,
      MOVSCRIPT_E2E_BOOTSTRAP_JSON: JSON.stringify(buildGenerationAppBootstrap(String(baseURL))),
    },
  })

  try {
    const page = await app.firstWindow()
    await mockGenerationAppShell(page)
    await mockProductionOrchestrateEntities(page)

    await page.goto(`${baseURL}/production-orchestrate?productionId=301`)

    await expect(page.getByRole('heading', { name: '制作编排树' })).toBeVisible()
    await expect(page.getByRole('button', { name: '结构' })).toBeVisible()
    await expect(page.getByRole('button', { name: '审阅' })).toBeVisible()
    await expect(page.getByText('设定与素材资源池', { exact: true })).toBeVisible()
    await expect(page.getByText('项目级角色设定', { exact: false })).toHaveCount(0)
    await expect(page.getByText('设定 2', { exact: false })).toBeVisible()
    await expect(page.getByText('未关联 1', { exact: false })).toBeVisible()
    await expect(page.getByText('默认收起。展开后查看项目编排结果里的设定和素材资源池。', { exact: false })).toBeVisible()

    const projectResourcesSection = page.getByText('项目编排结果', { exact: true }).locator('xpath=ancestor::section[1]')
    await projectResourcesSection.getByRole('button', { name: /^展开$/ }).click()

    await expect(page.getByText('项目级角色设定', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: '审阅' }).click()

    await expect(page.getByRole('heading', { name: '当前没有可审阅的提案' })).toBeVisible()
  } finally {
    await app.close()
  }
})

async function mockProductionOrchestrateEntities(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route(`**/api/v1/projects/${PROJECT_ID}/entities/**`, async (route) => {
    const url = new URL(route.request().url())
    const entityPath = url.pathname.split('/').at(-1)
    const data: Record<string, unknown[]> = {
      productions: [{ ID: 301, name: 'Electron 制作', status: 'planning', project_id: PROJECT_ID, script_version_id: 901 }],
      'script-versions': [{
        ID: 901,
        project_id: PROJECT_ID,
        script_id: 801,
        version_number: 1,
        title: 'Electron 剧本',
        source_type: 'raw',
        content: '第一段：主角进入空间，第二段：氛围变化。',
        raw_source: '第一段：主角进入空间，第二段：氛围变化。',
        summary: '用于制作编排页的最小剧本版本。',
        status: 'active',
        CreatedAt: '2026-05-11T12:00:00.000Z',
        UpdatedAt: '2026-05-11T12:00:00.000Z',
      }],
      segments: [{
        ID: 401,
        production_id: 301,
        title: '进入空间',
        kind: 'setup',
        summary: '主角进入新的场景空间。',
        status: 'draft',
        order: 1,
      }],
      'scene-moments': [{
        ID: 402,
        segment_id: 401,
        title: '进入并停顿',
        time_text: '0:00-0:10',
        location_text: '入口',
        action_text: '主角观察周围并停下。',
        mood: '谨慎',
        status: 'draft',
        order: 1,
      }],
      'creative-references': [{
        ID: 501,
        project_id: PROJECT_ID,
        name: '空间设定',
        kind: 'place',
        status: 'confirmed',
        description: '用于描述场景空间的项目级设定资料。',
      }, {
        ID: 502,
        project_id: PROJECT_ID,
        name: '项目级角色设定',
        kind: 'person',
        status: 'draft',
        description: '即使暂时没有被当前制作引用，也应在资源池中可见。',
      }],
      'creative-reference-usages': [{
        ID: 601,
        project_id: PROJECT_ID,
        owner_type: 'scene_moment',
        owner_id: 402,
        creative_reference_id: 501,
        role: 'supporting',
        status: 'draft',
      }],
      'asset-slots': [{
        ID: 701,
        project_id: PROJECT_ID,
        name: '入口空间示意',
        kind: 'image',
        status: 'missing',
        creative_reference_id: 501,
        owner_type: 'scene_moment',
        owner_id: 402,
        description: '用于统一入口空间气质的素材需求。',
      }],
      'content-units': [],
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data[entityPath ?? ''] ?? []),
    })
  })

  await page.route('http://127.0.0.1:28765/drafts**', async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    if (pathname === '/drafts' || pathname === '/drafts/') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ drafts: [] }),
      })
      return
    }
    if (pathname.endsWith('/project-draft-e2e')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'project-draft-e2e',
          projectId: PROJECT_ID,
          kind: 'project_proposal',
          title: '项目提案草稿',
          content: JSON.stringify({
            summary: '项目级设定与素材草稿',
            proposal: {
              creative_references: [{
                title: '风格统一',
                description: '确保视觉与叙事风格保持一致。',
              }],
              asset_slots: [{
                title: '入口空间示意',
                description: '需要一张入口空间示意素材。',
              }],
            },
          }),
          status: 'draft',
          createdAt: '2026-05-11T12:00:00.000Z',
          updatedAt: '2026-05-11T12:00:00.000Z',
        }),
      })
      return
    }
    if (pathname.endsWith('/production-draft-e2e')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'production-draft-e2e',
          projectId: PROJECT_ID,
          kind: 'production_proposal',
          title: '制作提案草稿',
          content: JSON.stringify({
            productionId: 301,
            summary: '制作提案草稿',
            proposal: {
              segments: [{
                action: 'create',
                title: '进入空间',
                summary: '主角进入新的场景空间。',
                scene_moments: [{
                  action: 'create',
                  title: '进入并停顿',
                  time_text: '0:00-0:10',
                  location_text: '入口',
                  action_text: '主角观察周围并停下。',
                  mood: '谨慎',
                }],
              }],
            },
          }),
          status: 'draft',
          createdAt: '2026-05-11T12:00:00.000Z',
          updatedAt: '2026-05-11T12:00:00.000Z',
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })
}
