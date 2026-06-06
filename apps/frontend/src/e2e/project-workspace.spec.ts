import { expect, test } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/shared/infrastructure/e2eBootstrap'
import { PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA } from '@/features/project-standards/domain/projectStandardsWorkspaceWorkspace'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const PROJECT_ID = 123
const WORKSPACE_ID = 'workspace-project-workspace-e2e'
const NOW = '2026-05-11T12:00:00.000Z'

const PROJECT_STANDARDS_WORKSPACE_WORKSPACE = {
  id: WORKSPACE_ID,
  projectId: PROJECT_ID,
  kind: 'project_standards_workspace',
  title: 'E2E 项目规范工作区工作区',
  content: JSON.stringify({
    schema: PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA,
    scope: 'project_standards_workspace',
    projectId: PROJECT_ID,
    summary: '整理项目级制作标准。',
    workspace: {
      project_style: {
        aspect_ratio: '9:16',
        visual_style: '竖屏短剧写实，人物表情和关键道具清晰可读。',
        negative_rules: ['不要随机改脸', '不要压暗关键道具'],
      },
    },
    impact_notes: ['后续设定资料和素材需求必须遵守项目标准。'],
    createdAt: NOW,
  }),
  status: 'workspace',
  metadata: {
    pageOwned: true,
  },
  createdAt: NOW,
  updatedAt: NOW,
}

test('project workspace reviews project standards workspace', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('project workspace E2E requires a baseURL')

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

  await mockGenerationAppShell(page)
  await mockProjectWorkspaceEntities(page)
  await mockProjectWorkspaceWorkspaces(page)

  await page.goto('/project/standards')

  await expect(page.getByRole('heading', { name: '项目标准审阅' })).toBeVisible()
  await expect(page.getByText('E2E 项目规范工作区工作区')).toBeVisible()
  await expect(page.getByText('竖屏短剧写实，人物表情和关键道具清晰可读。')).toBeVisible()
  await expect(page.getByText('不要随机改脸')).toBeVisible()
})

async function mockProjectWorkspaceEntities(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route(`**/api/v1/projects/${PROJECT_ID}/entities/**`, async (route) => {
    const url = new URL(route.request().url())
    const entityPath = url.pathname.split('/').at(-1)
    const data: Record<string, unknown[]> = {
      productions: [{ ID: 301, name: 'E2E 制作', status: 'planning', project_id: PROJECT_ID }],
      'settings': [{
        ID: 501,
        project_id: PROJECT_ID,
        name: '角色设定',
        kind: 'person',
        status: 'confirmed',
        description: '角色作为本项目的主要视觉基准。',
      }],
      'setting-usages': [],
      'creative-relationships': [],
      'asset-slots': [{
        ID: 701,
        project_id: PROJECT_ID,
        name: '角色主视图',
        kind: 'image',
        status: 'missing',
        setting_id: 501,
        description: '用于统一角色正面造型的可复用素材。',
      }],
      'asset-slot-candidates': [],
      segments: [],
      'scene-moments': [],
      'content-units': [],
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data[entityPath ?? ''] ?? []),
    })
  })
}

async function mockProjectWorkspaceWorkspaces(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route(/\/workspaces(?:[/?#]|$)/, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.pathname === `/workspaces/${WORKSPACE_ID}`
        ? PROJECT_STANDARDS_WORKSPACE_WORKSPACE
        : { workspaces: [PROJECT_STANDARDS_WORKSPACE_WORKSPACE] }),
    })
  })
}
