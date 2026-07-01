import { _electron as electron, expect, test } from '@playwright/test'
import electronPath from 'electron'
import { resolve } from 'node:path'

import { PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA } from '@movscript/project-surface/data'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'
import { installE2EBootstrapSeed } from './e2eBootstrapSeed'
import {
  AGENT_MODE_SHARED_GLOBAL_TITLE,
  AGENT_MODE_SHARED_PROJECT_TITLE,
  buildAgentModeSharedSessionsBootstrap,
  installAgentModeSharedSessionsBootstrap,
  installAgentModeSharedSessionsRuntimeMock,
} from './agentModeSharedSessions'

const PROJECT_ID = 123
const WORKSPACE_ID = 'workspace-project-workspace-electron-e2e'
const NOW = '2026-05-11T12:00:00.000Z'

const PROJECT_STANDARDS_WORKSPACE_WORKSPACE = {
  id: WORKSPACE_ID,
  projectId: PROJECT_ID,
  kind: 'project_standards_workspace',
  title: 'Electron 项目规范工作区工作区',
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

test('electron renderer smoke reaches project standards overview', async ({}, testInfo) => {
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
    await installE2EBootstrapSeed(page, buildGenerationAppBootstrap(String(baseURL)))
    await mockGenerationAppShell(page)
    await installAgentModeSharedSessionsRuntimeMock(page)
    await mockProjectWorkspaceEntities(page)
    await mockProjectWorkspaceWorkspaces(page)

    await page.goto(`${baseURL}/project/standards`)

    await expect(page.getByRole('heading', { name: '项目规范' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '规范工作板' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '基础规范' })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('electron project agent mode groups shared project and global sessions', async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('project agent mode Electron E2E requires a baseURL')

  const app = await electron.launch({
    executablePath: String(electronPath),
    args: [resolve('src/e2e/electronGenerationMain.cjs')],
    env: {
      ...process.env,
      MOVSCRIPT_E2E_BOOTSTRAP_JSON: JSON.stringify(buildAgentModeSharedSessionsBootstrap(String(baseURL))),
    },
  })

  try {
    const page = await app.firstWindow()
    await installAgentModeSharedSessionsBootstrap(page, String(baseURL))
    await mockGenerationAppShell(page)
    await installAgentModeSharedSessionsRuntimeMock(page)

    await page.goto(`${baseURL}/project/agent`)

    await expect(page.getByText('项目', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /E2E Demo Project/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /全局会话/ })).toBeVisible()
    await expect(page.getByText(AGENT_MODE_SHARED_GLOBAL_TITLE)).toBeVisible()

    await page.getByRole('button', { name: /E2E Demo Project/ }).click()
    await expect(page.getByText(AGENT_MODE_SHARED_PROJECT_TITLE)).toBeVisible()
  } finally {
    await app.close()
  }
})

async function mockProjectWorkspaceEntities(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route('**/api/v1/projects/123/entities/**', async (route) => {
    const url = new URL(route.request().url())
    const entityPath = url.pathname.split('/').at(-1)
    const data: Record<string, unknown[]> = {
      productions: [{ ID: 301, name: 'Electron 制作', project_id: PROJECT_ID }],
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
  await page.route(/^https?:\/\/[^/]+\/workspaces(?:[/?#]|$)/, async (route) => {
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
