import { expect, test } from '@playwright/test'

import { PROJECT_STANDARDS_WORKSPACE_WORKSPACE_SCHEMA } from '@movscript/project-surface/data'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'
import { installE2EBootstrapSeed } from './e2eBootstrapSeed'
import {
  AGENT_MODE_SHARED_GLOBAL_TITLE,
  AGENT_MODE_SHARED_PROJECT_TITLE,
  installAgentModeSharedSessionsBootstrap,
  installAgentModeSharedSessionsRuntimeMock,
} from './agentModeSharedSessions'

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

test('project workspace reaches project standards overview', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('project workspace E2E requires a baseURL')

  await installE2EBootstrapSeed(page, buildGenerationAppBootstrap(String(baseURL)))

  await mockGenerationAppShell(page)
  await installAgentModeSharedSessionsRuntimeMock(page)
  await mockProjectWorkspaceEntities(page)
  await mockProjectWorkspaceWorkspaces(page)

  await page.goto('/project/standards')

  await expect(page.getByRole('button', { name: /规范/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '规范工作板' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '基础规范' })).toBeVisible()
})

test('project content workspace renders preview and prompt canvas tabs', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('project content workspace E2E requires a baseURL')

  const seed = buildGenerationAppBootstrap(String(baseURL))
  await installE2EBootstrapSeed(page, {
    ...seed,
    project: {
      ...(seed.project!),
      workspace_path: '/tmp/movscript-e2e-content-project',
      project_path: '/tmp/movscript-e2e-content-project',
    },
  })
  await mockGenerationAppShell(page)
  await installContentWorkspaceElectronApiMock(page)

  const consoleMessages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleMessages.push(message.text())
  })

  await page.goto('/project/content')

  await expect(page.getByTestId('content-canvas-workspace-page')).toBeVisible()
  await expect(page.getByRole('tab', { name: '预览' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('预览播放器')).toBeVisible()
  await expect(page.getByLabel('候选横向列表')).toBeVisible()
  await expect(page.getByLabel('右侧节点信息区域')).toBeVisible()
  await expect(page.locator('.content-canvas-preview-candidate-card')).toHaveCount(1)
  await expect(page.getByText('雨夜画面候选')).toBeVisible()
  await expect(page.getByText('手机参考候选')).toHaveCount(0)

  await page.getByRole('button', { name: /ASSET 湿润手机/ }).click()
  await expect(page.getByLabel('预览播放器')).toContainText('湿润手机')
  await expect(page.locator('.content-canvas-preview-candidate-card')).toHaveCount(2)
  await expect(page.getByText('手机参考候选')).toBeVisible()
  await expect(page.getByText('手机备选候选')).toBeVisible()
  await expect(page.getByText('cand_phone', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /手机备选候选/ }).click()
  await expect(page.getByText('cand_phone_alt', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: '无限画布' }).click()
  await expect(page.getByRole('tab', { name: '无限画布' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('提示词无限画布')).toBeVisible()
  await expect(page.getByLabel('右侧节点信息区域')).toBeVisible()
  await expect(page.locator('.content-prompt-flow-node').filter({ hasText: '候选' }).first()).toBeVisible()
  await expect(page.locator('.content-prompt-flow-node[data-kind="asset"]').filter({ hasText: '手机参考候选' }).first()).toBeVisible()
  await expect(page.locator('.content-prompt-flow-node[data-kind="asset"] .content-prompt-flow-node__candidate[data-has-image="true"]').first()).toBeVisible()
  await expect(page.locator('.content-prompt-flow-node[data-kind="content_unit"]')).toHaveCount(0)
  await expect(page.locator('.content-prompt-flow-node[data-kind="production"]')).toHaveCount(0)
  await expect(page.locator('.content-prompt-flow-node[data-kind="segment"]')).toHaveCount(0)
  await expect(page.locator('.content-prompt-flow-node[data-kind="setting"]')).toHaveCount(0)
  await expect(page.locator('.content-prompt-flow-node[data-kind="state"]')).toHaveCount(0)
  await expect(page.locator('.content-prompt-flow-node[data-kind="candidate"]')).toHaveCount(0)
  await expect(page.locator('.content-prompt-flow-node[data-kind="resource"]')).toHaveCount(0)
  expect(await page.locator('.content-prompt-flow-node').count()).toBeGreaterThanOrEqual(4)
  await page.getByRole('button', { name: '自动排布' }).click()
  await page.getByRole('button', { name: 'Fit View' }).click()
  await page.locator('.content-canvas-workspace-tree-node').filter({ hasText: '湿润手机' }).first().click()
  await expect(page.locator('.content-prompt-flow-node[data-kind="asset"][data-selected="true"]').filter({ hasText: '湿润手机' })).toBeVisible()
  await page.locator('.content-canvas-workspace-tree-node').filter({ hasText: '雨夜来电' }).first().click()
  await expect(page.locator('.content-prompt-flow-node[data-kind="scene_moment"][data-selected="true"]').filter({ hasText: '雨夜来电' })).toBeVisible()

  await page.locator('.content-prompt-flow-node').filter({ hasText: '雨夜来电' }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: '添加关键帧' }).click()
  await expect(page.getByText('添加关键帧到 雨夜来电')).toBeVisible()
  await page.locator('.content-prompt-flow-node').filter({ hasText: '雨夜来电' }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: '添加故事版' }).click()
  await expect(page.getByText('添加分镜图到 雨夜来电')).toBeVisible()
  expect(consoleMessages).toEqual([])
})

test('project agent mode groups shared project and global sessions', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('project agent mode E2E requires a baseURL')

  await installAgentModeSharedSessionsBootstrap(page, String(baseURL))
  await mockGenerationAppShell(page)
  await installAgentModeSharedSessionsRuntimeMock(page)

  await page.goto('/project/agent')

  await expect(page.getByText('项目', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /E2E Demo Project/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /全局会话/ })).toBeVisible()
  await expect(page.getByText(AGENT_MODE_SHARED_GLOBAL_TITLE)).toBeVisible()

  await page.getByRole('button', { name: /E2E Demo Project/ }).click()
  await expect(page.getByText(AGENT_MODE_SHARED_PROJECT_TITLE)).toBeVisible()
})

async function mockProjectWorkspaceEntities(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route(`**/api/v1/projects/${PROJECT_ID}/entities/**`, async (route) => {
    const url = new URL(route.request().url())
    const entityPath = url.pathname.split('/').at(-1)
    const data: Record<string, unknown[]> = {
      productions: [{ ID: 301, name: 'E2E 制作', project_id: PROJECT_ID }],
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

async function installContentWorkspaceElectronApiMock(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.addInitScript(() => {
    const recordsByKind = {
      project: [
        entity('project', 123, 'project.json', { id: 123, title: 'E2E Demo Project' }),
      ],
      production: [
        entity('production', 'pilot', 'productions/pilot/production.json', { id: 'pilot', title: '试播制作' }),
      ],
      segment: [
        entity('segment', 'opening', 'productions/pilot/segments/opening/segment.json', { id: 'opening', production_id: 'pilot', title: '开场段落' }),
      ],
      scene_moment: [
        entity('scene_moment', 'rain_call', 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json', {
          id: 'rain_call',
          production_id: 'pilot',
          segment_id: 'opening',
          title: '雨夜来电',
          action_text: '主角在雨夜接到改变计划的电话。',
        }),
      ],
      expression_unit: [
        entity('expression_unit', 'closeup', 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/closeup/expression_unit.json', {
          id: 'closeup',
          scene_moment_id: 'rain_call',
          kind: 'shot',
          title: '主角近景',
          text: '手机屏幕照亮主角的脸。',
        }),
      ],
      keyframe: [
        entity('keyframe', 'phone_glow', 'productions/pilot/segments/opening/scene_moments/rain_call/keyframes/phone_glow/keyframe.json', {
          id: 'phone_glow',
          scene_moment_id: 'rain_call',
          title: '手机冷光',
          visual_intent: '手和手机屏幕成为画面焦点。',
        }),
      ],
      storyboard: [],
      content_unit: [
        entity('content_unit', 'cu_scene', 'content_units/cu_scene/content_unit.json', {
          id: 'cu_scene',
          title: '雨夜来电成片',
          content_unit_type: 'scene_moment_ref',
          output_kind: 'video',
          scene_moment_ref: 'rain_call',
          edit_prompt: { text: 'A rainy night phone call with {{asset:phone}} as visual anchor.' },
        }),
        entity('content_unit', 'cu_expr', 'content_units/cu_expr/content_unit.json', {
          id: 'cu_expr',
          title: '主角近景镜头',
          content_unit_type: 'expression_unit_ref',
          output_kind: 'video',
          expression_unit_ref: 'closeup',
          edit_prompt: { text: 'Close-up shot, phone light on face.' },
        }),
        entity('content_unit', 'cu_asset_phone', 'content_units/cu_asset_phone/content_unit.json', {
          id: 'cu_asset_phone',
          title: '手机道具参考',
          content_unit_type: 'asset_ref',
          output_kind: 'image',
          asset_ref: 'phone',
          edit_prompt: { text: 'A wet smartphone prop reference.' },
        }),
      ],
      setting_state: [
        entity('setting_state', 'rain', 'settings/hero/states/rain/setting_state.json', { id: 'rain', setting_id: 'hero', title: '雨夜状态' }),
      ],
      audio_cue: [],
    }
    const settings = [
      entity('setting', 'hero', 'settings/hero/setting.json', { id: 'hero', title: '主角', kind: 'character' }),
    ]
    const assets = [
      entity('asset', 'phone', 'settings/hero/states/rain/assets/phone/asset.json', {
        id: 'phone',
        setting_id: 'hero',
        setting_state_id: 'rain',
        title: '湿润手机',
        kind: 'prop',
      }),
    ]
    const contentWorkspaceData = {
      previewMoments: [],
      assetReferenceUnits: {},
      editingTimelines: [],
      contentUnitCandidates: {
        cu_scene: [{
          id: 'cand_scene',
          title: '雨夜画面候选',
          resourceId: 9101,
          resourceKind: 'image',
          source: 'e2e',
          status: 'ready',
          selected: true,
        }],
        cu_asset_phone: [{
          id: 'cand_phone',
          title: '手机参考候选',
          resourceId: 9101,
          resourceKind: 'image',
          source: 'e2e',
          status: 'ready',
          selected: true,
        }, {
          id: 'cand_phone_alt',
          title: '手机备选候选',
          resourceId: 9101,
          resourceKind: 'image',
          source: 'e2e',
          status: 'ready',
          selected: false,
        }],
      },
    }
    const contentWorkspaceCalls: {
      ensuredContentUnits: unknown[]
      selectedCandidates: Array<{ contentUnitId?: string; candidateId?: string; resourceId?: number }>
    } = {
      ensuredContentUnits: [],
      selectedCandidates: [],
    }
    ;(window as unknown as { __contentWorkspaceCalls: typeof contentWorkspaceCalls }).__contentWorkspaceCalls = contentWorkspaceCalls
    window.api = {
      ...(window.api ?? {}),
      queryMovScriptEngineWorkspaceEntities: async ({ query }: { query: { entityKind: keyof typeof recordsByKind } }) => recordsByKind[query.entityKind] ?? [],
      queryMovScriptEngineWorkspaceSettings: async () => settings,
      queryMovScriptEngineWorkspaceAssets: async () => ({ assets }),
      loadMovScriptEngineContentWorkspace: async () => contentWorkspaceData,
      getProjectGitWorkspaceStatus: async () => ({
        ok: true,
        hasGit: false,
        isDirty: false,
        changedFiles: 0,
      }),
      ensureMovScriptEngineContentUnitForEntity: async (input: {
        payload: {
          id: string
          title: string
          contentUnitType: string
          outputKind: string
          prompt: string
        }
      }) => {
        contentWorkspaceCalls.ensuredContentUnits.push(input)
        return {
          contentUnitPath: `content_units/${input.payload.id}/content_unit.json`,
          record: {
            id: input.payload.id,
            title: input.payload.title,
            content_unit_type: input.payload.contentUnitType,
            output_kind: input.payload.outputKind,
            edit_prompt: { text: input.payload.prompt },
          },
        }
      },
      selectMovScriptEngineContentUnitCandidate: async (input: { contentUnitId?: string; candidateId?: string; resourceId?: number }) => {
        contentWorkspaceCalls.selectedCandidates.push(input)
      },
      buildMovScriptEngineContentUnitBackendPrompt: async () => ({ ok: true, prompt: { text: 'Compiled prompt', resource_ids: [], replacements: [] }, blockers: [] }),
    }
    function entity(entityKind: string, id: string | number, path: string, record: Record<string, unknown>) {
      return { entityKind, id, path, record }
    }
  })
}
