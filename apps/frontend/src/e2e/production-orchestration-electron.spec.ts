import { _electron as electron, expect, test } from '@playwright/test'
import electronPath from 'electron'
import { resolve } from 'node:path'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const PROJECT_ID = 123

test('electron renderer smoke reaches production orchestration with project-level settings', async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('production orchestration Electron E2E requires a baseURL')

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
    await mockProductionOrchestrationEntities(page)

    await page.goto(`${baseURL}/project/production/orchestration?productionId=301`)

    await expect(page.getByRole('button', { name: '编排写作' })).toBeVisible()
    await expect(page.getByRole('button', { name: /AI 提案/ })).toBeVisible()
    await expect(page.getByText('编排段列表', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '进入并停顿' })).toBeVisible()
    await expect(page.getByText('制作剧本', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('绑定剧本块', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /选择剧本块/ })).toBeVisible()
    await expect(page.getByText('表达条目', { exact: true })).toBeVisible()
    await expect(page.getByText('写作辅助', { exact: true })).toHaveCount(0)
    await expect(page.getByText('绑定全局设定', { exact: true })).toHaveCount(0)
    await expect(page.getByText('项目级角色设定', { exact: false })).toHaveCount(0)

    await page.getByRole('button', { name: /AI 提案/ }).click()

    await expect(page.getByRole('heading', { name: '当前没有 AI 编排提案' })).toBeVisible()
  } finally {
    await app.close()
  }
})

async function mockProductionOrchestrationEntities(page: Parameters<typeof mockGenerationAppShell>[0]) {
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
        summary: '用于创作编排页的最小剧本文本。',
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
        script_block_id: 9010,
        status: 'draft',
        order: 1,
      }],
      'scene-moments': [{
        ID: 402,
        segment_id: 401,
        script_block_id: 9011,
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
      'script-blocks': [{
        ID: 9010,
        script_id: 801,
        script_version_id: 901,
        kind: 'action',
        content: '主角推门进入陌生空间，灯光很暗。',
        status: 'active',
        start_line: 1,
        end_line: 2,
        order: 1,
      }, {
        ID: 9011,
        script_id: 801,
        script_version_id: 901,
        kind: 'dialogue',
        speaker: '主角',
        content: '这里有人来过。',
        start_line: 3,
        end_line: 3,
        status: 'active',
        order: 2,
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
          kind: 'project_standards_proposal',
          title: '项目规范提案草稿',
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
            mode: 'snapshot',
            productionId: 301,
            summary: '制作提案草稿',
            proposal: {
              segments: [{
                title: '进入空间',
                summary: '主角进入新的场景空间。',
                scene_moments: [{
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
