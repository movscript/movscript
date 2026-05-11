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
    summary: '整理角色设定和角色主视图素材需求。',
    proposal: {
      creative_references: [{
        id: 501,
        fields: {
          name: '角色设定',
          kind: 'person',
          description: '角色作为本项目的主要视觉基准。',
        },
      }],
      asset_slots: [{
        id: 701,
        owner: {
          type: 'creative_reference',
          id: 501,
        },
        fields: {
          name: '角色主视图',
          kind: 'image',
          description: '用于统一角色正面造型的可复用素材。',
        },
      }],
    },
    impact_notes: ['素材需求依附于角色设定，不能作为独立设定资料。'],
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

    await page.goto(`${baseURL}/project-workspace`)

    await expect(page.getByRole('heading', { name: '提案审阅' })).toBeVisible()
    await expect(page.getByText('Electron 项目提案草稿')).toBeVisible()
    await expect(page.getByText('设定资料审阅', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '全部接受设定' }).click()

    await expect(page.getByText('素材需求审阅', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^角色主视图 · image · missing/ })).toBeVisible()
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
