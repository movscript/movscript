import { _electron as electron, expect, test } from '@playwright/test'
import electronPath from 'electron'
import { resolve } from 'node:path'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import { PROJECT_PROPOSAL_DRAFT_SCHEMA } from '@/lib/projectProposalDraft'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const PROJECT_ID = 123
const DRAFT_ID = 'draft-project-workspace-electron-e2e'
const NOW = '2026-05-11T12:00:00.000Z'

const PROJECT_PROPOSAL_DRAFT = {
  id: DRAFT_ID,
  projectId: PROJECT_ID,
  kind: 'project_proposal',
  title: 'Electron 项目提案草稿',
  content: JSON.stringify({
    schema: PROJECT_PROPOSAL_DRAFT_SCHEMA,
    scope: 'project_proposal',
    projectId: PROJECT_ID,
    summary: '整理项目级制作标准。',
    proposal: {
      project_style: {
        aspect_ratio: '9:16',
        visual_style: '竖屏短剧写实，人物表情和关键道具清晰可读。',
        negative_rules: ['不要随机改脸', '不要压暗关键道具'],
      },
    },
    impact_notes: ['后续设定资料和素材需求必须遵守项目标准。'],
    createdAt: NOW,
  }),
  status: 'draft',
  metadata: {
    pageOwned: true,
  },
  createdAt: NOW,
  updatedAt: NOW,
}

test('electron renderer smoke reaches project workspace with seeded review flow', async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('project workspace Electron E2E requires a baseURL')

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
    await mockProjectWorkspaceEntities(page)
    await mockProjectWorkspaceDrafts(page)

    await page.goto(`${baseURL}/project/standards`)

    await expect(page.getByRole('heading', { name: '项目标准审阅' })).toBeVisible()
    await expect(page.getByText('Electron 项目提案草稿')).toBeVisible()
    await expect(page.getByText('竖屏短剧写实，人物表情和关键道具清晰可读。')).toBeVisible()
    await expect(page.getByText('不要随机改脸')).toBeVisible()
  } finally {
    await app.close()
  }
})

async function mockProjectWorkspaceEntities(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route('**/api/v1/projects/123/entities/**', async (route) => {
    const url = new URL(route.request().url())
    const entityPath = url.pathname.split('/').at(-1)
    const data: Record<string, unknown[]> = {
      productions: [{ ID: 301, name: 'Electron 制作', status: 'planning', project_id: PROJECT_ID }],
      'creative-references': [{
        ID: 501,
        project_id: PROJECT_ID,
        name: '角色设定',
        kind: 'person',
        status: 'confirmed',
        description: '角色作为本项目的主要视觉基准。',
      }],
      'creative-reference-usages': [],
      'creative-relationships': [],
      'asset-slots': [{
        ID: 701,
        project_id: PROJECT_ID,
        name: '角色主视图',
        kind: 'image',
        status: 'missing',
        creative_reference_id: 501,
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

async function mockProjectWorkspaceDrafts(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route('http://127.0.0.1:28765/drafts**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.pathname === `/drafts/${DRAFT_ID}`
        ? PROJECT_PROPOSAL_DRAFT
        : { drafts: [PROJECT_PROPOSAL_DRAFT] }),
    })
  })
}
