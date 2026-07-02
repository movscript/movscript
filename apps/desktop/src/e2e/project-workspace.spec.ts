import { expect, test, type Route } from '@playwright/test'
import { Buffer } from 'node:buffer'

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
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

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

  await expect(page.getByRole('button', { name: '新增规范' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '规范工作板' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '基础规范' })).toBeVisible()
})

test('project surface creates and opens production editing workspaces through Desktop gateway', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('production editing workspace E2E requires a baseURL')

  const seed = buildGenerationAppBootstrap(String(baseURL))
  await installE2EBootstrapSeed(page, {
    ...seed,
    project: {
      ...(seed.project!),
      project_uid: 'e2e-project-uid',
      workspace_path: '/tmp/movscript-e2e-production-editing',
      project_path: '/tmp/movscript-e2e-production-editing',
    },
  })
  await mockGenerationAppShell(page)
  await installProjectSurfaceGatewayMock(page, String(baseURL))
  const productionEditingCalls = await mockProductionEditingGateway(page)
  await mockProjectWorkspaceEntities(page)

  await page.goto('/project/home')

  const editingWorkspacesButton = page.getByRole('button', { name: '剪辑台' })
  await expect(editingWorkspacesButton).toBeVisible()
  await editingWorkspacesButton.click()

  const editingDialog = page.getByRole('dialog', { name: 'E2E 制作 剪辑台' })
  await expect(editingDialog).toBeVisible()
  await expect(editingDialog.getByText('E2E 制作 Remotion')).toBeVisible()

  await editingDialog.getByRole('button', { name: '新建系统剪辑' }).click()
  await expect.poll(() => productionEditingCalls.create.map((call) => call.kind)).toContain('system_editing')

  await editingDialog.getByRole('button', { name: '新建 Remotion' }).click()
  await expect.poll(() => productionEditingCalls.create.map((call) => call.kind)).toContain('remotion')

  await editingDialog.getByRole('button', { name: '打开' }).click()
  await expect.poll(() => productionEditingCalls.open.map((call) => call.workspaceId ?? call.workspace_id)).toContain('remotion-e2e')
  await expect.poll(() => productionEditingCalls.remotionSessions.map((call) => {
    const openAction = call.openAction ?? call.open_action
    return typeof openAction === 'object' && openAction ? (openAction as Record<string, unknown>).kind : undefined
  })).toContain('remotion_studio_session')
  expect(productionEditingCalls.mediaTasks).toHaveLength(0)
  await expect(page).toHaveURL(/\/project\/remotion-studio\?/)
  await expect(page.getByRole('heading', { name: 'Remotion Studio' })).toBeVisible()
  expect(productionEditingCalls.remotionSessions[0]?.openAction).toMatchObject({
    backend: 'remotion',
    projectDirectory: '/tmp/movscript-e2e-production-editing/.movscript/production-editing/remotion-e2e',
  })
})

test('project content workspace renders dedicated preview and prompt canvas pages', async ({ page }, testInfo) => {
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
  await mockContentWorkspaceResourceFiles(page)
  await installContentWorkspaceElectronApiMock(page)

  const consoleMessages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) consoleMessages.push(message.text())
  })

  await page.goto('/project/content/preview')

  await expect(page.getByTestId('content-canvas-workspace-page')).toBeVisible()
  await expect(page.getByLabel('预览播放器')).toBeVisible()
  await expect(page.getByLabel('候选横向列表')).toBeVisible()
  await expect(page.getByLabel('右侧节点信息区域')).toBeVisible()
  await expect(page.locator('.content-canvas-preview-candidate-card')).toHaveCount(1)
  await expect(page.getByText('雨夜画面候选')).toBeVisible()
  await expect(page.locator('.content-canvas-prompt-inline-reference')).toContainText('Resource 9101')
  await expect(page.locator('.content-canvas-prompt-reference-strip__item')).toContainText('Resource 9101')
  await expect(page.locator('.content-canvas-prompt-reference-strip__item')).toContainText('参考图')
  await expect(page.locator('.content-canvas-prompt-reference-strip__item img')).toBeVisible()
  await expect(page.getByText('手机参考候选')).toHaveCount(0)

  const promptEditor = page.locator('.content-canvas-prompt-inline-editor')
  await expect(promptEditor).toBeVisible()
  await promptEditor.click()
  await promptEditor.press('End')
  await promptEditor.type(' @')
  const mentionMenu = page.locator('.content-canvas-prompt-mention-menu')
  await expect(mentionMenu).toBeVisible()
  await expect(mentionMenu).toContainText('Resource 9101')
  const mentionMenuBox = await mentionMenu.boundingBox()
  expect(mentionMenuBox).not.toBeNull()
  expect(mentionMenuBox!.height).toBeGreaterThan(20)
  expect(mentionMenuBox!.y).toBeGreaterThanOrEqual(0)
  await promptEditor.press('Escape')

  const referenceRoleSelect = page.locator('.content-canvas-prompt-reference-strip__role')
  await referenceRoleSelect.selectOption('first_frame')
  await expect(page.locator('.content-canvas-prompt-reference-strip__item')).toContainText('首帧')
  await referenceRoleSelect.selectOption('reference_image')
  await expect(page.locator('.content-canvas-prompt-reference-strip__item')).toContainText('参考图')
  await page.locator('.content-canvas-prompt-reference-strip__remove').click()
  await expect(page.locator('.content-canvas-prompt-reference-strip__item')).toHaveCount(0)
  await expect(page.locator('.content-canvas-prompt-inline-reference')).toHaveCount(0)
  const contentWorkspaceCalls = await page.evaluate(() => (window as unknown as {
    __contentWorkspaceCalls: {
      promptUpdates: Array<{ editPrompt: { text?: string }; generationReferences?: Array<Record<string, unknown>> }>
    }
  }).__contentWorkspaceCalls)
  const autoRepairUpdate = contentWorkspaceCalls.promptUpdates.find((call) => call.generationReferences?.some((reference) => reference.source === 'prompt_legacy_auto_repair'))
  expect(autoRepairUpdate?.generationReferences?.[0]).toMatchObject({
    id: 'resource:9101',
    kind: 'resource',
    ref: 9101,
    resource_id: 9101,
    media_type: 'image',
    role: 'reference_image',
    source_ref: '{{resource::9101}}',
    source: 'prompt_legacy_auto_repair',
  })
  const firstFrameUpdate = contentWorkspaceCalls.promptUpdates.find((call) => call.generationReferences?.some((reference) => reference.role === 'first_frame'))
  expect(firstFrameUpdate?.generationReferences?.[0]).toMatchObject({
    id: 'resource:9101',
    kind: 'resource',
    ref: 9101,
    resource_id: 9101,
    role: 'first_frame',
  })
  const roleUpdate = contentWorkspaceCalls.promptUpdates.find((call) => call.generationReferences?.some((reference) => reference.role === 'reference_image'))
  expect(roleUpdate?.generationReferences?.[0]).toMatchObject({
    id: 'resource:9101',
    kind: 'resource',
    ref: 9101,
    resource_id: 9101,
    media_type: 'image',
    role: 'reference_image',
  })
  const removalUpdate = contentWorkspaceCalls.promptUpdates.at(-1)
  expect(removalUpdate?.generationReferences).toEqual([])
  expect(removalUpdate?.editPrompt.text).not.toContain('{{resource::9101}}')

  const emptyReferenceStrip = page.locator('.content-canvas-prompt-reference-strip[data-empty="true"]')
  await expect(emptyReferenceStrip).toBeVisible()
  await emptyReferenceStrip.evaluate((element) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('application/resource-id', '9101')
    dataTransfer.setData('application/canvas-resource', JSON.stringify({
      ID: 9101,
      name: 'Dragged reference.png',
      type: 'image',
      mime_type: 'image/png',
    }))
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
  })
  await expect(page.locator('.content-canvas-prompt-reference-strip__item')).toContainText('Dragged reference.png')
  await expect(page.locator('.content-canvas-prompt-reference-strip__item img')).toBeVisible()
  const callsAfterDrop = await page.evaluate(() => (window as unknown as {
    __contentWorkspaceCalls: {
      promptUpdates: Array<{ editPrompt: { text?: string }; generationReferences?: Array<Record<string, unknown>> }>
    }
  }).__contentWorkspaceCalls)
  expect(callsAfterDrop.promptUpdates.at(-1)?.generationReferences?.[0]).toMatchObject({
    id: 'resource:9101',
    kind: 'resource',
    ref: 9101,
    resource_id: 9101,
    media_type: 'image',
    role: 'reference_image',
    label: 'Dragged reference.png',
    source: 'content_canvas',
  })

  await page.getByRole('button', { name: /^KEY 手机冷光/ }).click()
  await expect(page.getByLabel('预览播放器')).toContainText('手机冷光')
  await expect(page.getByLabel('右侧节点信息区域')).toContainText('手机冷光')
  await expect(page.locator('.content-canvas-preview-candidate-card')).toHaveCount(1)

  await page.goto('/project/content/canvas')
  await expect(page.getByTestId('content-canvas-workspace-page')).toBeVisible()
  await expect(page.getByLabel('提示词无限画布')).toBeVisible()
  await expect(page.getByLabel('预览播放器')).toHaveCount(0)
  await expect(page.getByLabel('右侧节点信息区域')).toHaveCount(0)
  await expect(page.getByText('自由内容画布', { exact: true })).toBeVisible()
  await expect(page.getByText('0 个创作节点，0 个可生成节点')).toBeVisible()
  await expect(page.getByText('暂无创作节点')).toBeVisible()

  const promptCanvas = page.getByLabel('提示词无限画布')
  await promptCanvas.getByRole('button', { name: '打开项目节点' }).click()
  const nodeDrawer = page.getByLabel('项目节点库')
  await expect(nodeDrawer).toBeVisible()
  await nodeDrawer.getByRole('button', { name: /雨夜来电/ }).click()
  await expect(page.getByText('2 个创作节点，1 个可生成节点')).toBeVisible()
  const canvasPromptEditor = promptCanvas.locator('.content-prompt-flow-node__prompt-panel .content-canvas-prompt-inline-editor')
  await expect(canvasPromptEditor).toBeVisible()
  await expect(promptCanvas.locator('.content-prompt-flow-node__prompt-panel .content-canvas-prompt-reference-strip__item')).toContainText('Resource 9101')
  await canvasPromptEditor.click()
  await canvasPromptEditor.press('End')
  await canvasPromptEditor.type(' ：＠')
  const canvasMentionMenu = page.locator('.content-canvas-prompt-mention-menu')
  await expect(canvasMentionMenu).toBeVisible()
  await expect(canvasMentionMenu).toContainText('Resource 9101')
  const canvasMentionMenuBox = await canvasMentionMenu.boundingBox()
  expect(canvasMentionMenuBox).not.toBeNull()
  expect(canvasMentionMenuBox!.height).toBeGreaterThan(20)
  expect(canvasMentionMenuBox!.y).toBeGreaterThanOrEqual(0)
  await canvasPromptEditor.press('Escape')
  await nodeDrawer.getByRole('button', { name: '关闭项目节点' }).click()

  await expect(promptCanvas.getByRole('button', { name: '新建内容画布' })).toBeVisible()
  await expect(promptCanvas.getByRole('button', { name: '重命名内容画布' })).toBeVisible()

  await promptCanvas.getByRole('button', { name: '新建内容画布' }).click()
  const createCanvasDialog = page.getByRole('dialog', { name: '新建内容画布' })
  await expect(createCanvasDialog).toBeVisible()
  await expect(createCanvasDialog.getByLabel('名称')).toBeVisible()
  await expect(createCanvasDialog.getByRole('button', { name: '创建画布' })).toBeEnabled()
  await createCanvasDialog.getByRole('button', { name: '取消' }).click()
  await expect(createCanvasDialog).toHaveCount(0)

  await promptCanvas.getByRole('button', { name: '重命名内容画布' }).click()
  const renameCanvasDialog = page.getByRole('dialog', { name: '重命名内容画布' })
  await expect(renameCanvasDialog).toBeVisible()
  await expect(renameCanvasDialog.getByLabel('名称')).toHaveValue('自由内容画布')
  await expect(renameCanvasDialog.getByRole('button', { name: '保存名称' })).toBeDisabled()
  await renameCanvasDialog.getByRole('button', { name: '取消' }).click()
  await expect(renameCanvasDialog).toHaveCount(0)
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

async function installProjectSurfaceGatewayMock(page: Parameters<typeof mockGenerationAppShell>[0], gatewayBaseURL: string) {
  await page.addInitScript(({ gatewayBaseURL }) => {
    const apiWindow = window as unknown as { api?: Record<string, unknown> }
    apiWindow.api = {
      ...(apiWindow.api ?? {}),
      getRuntimeConfig: async () => ({
        workspaceDir: '/tmp/movscript-e2e-home',
        movScriptHomeDir: '/tmp/movscript-e2e-home',
        gatewayBaseURL,
        apiBaseURL: gatewayBaseURL,
        apiV1BaseURL: `${gatewayBaseURL}/api/v1`,
        runtimeConnection: {
          schema: 'movscript.runtime-connection.v1',
          mode: 'local',
          gatewayBaseURL,
          apiV1BaseURL: `${gatewayBaseURL}/api/v1`,
          authMode: 'local-owner',
          displayName: 'E2E local gateway',
          status: 'connected',
          source: 'daemon',
        },
        runtime: {
          schema: 'movscript.runtime-descriptor.v1',
          runtime: {
            owner: 'movscript.local-node',
            appId: 'movscript.local-node',
            name: 'MovScript Local Node Daemon',
          },
          gateway: {
            baseURL: gatewayBaseURL,
            canonicalPrefix: '/v1',
          },
          dataConnection: {
            kind: 'local',
            authMode: 'local-owner',
            status: 'connected',
            displayName: 'E2E local data',
          },
          capabilities: {
            project: true,
            canvas: true,
            resources: true,
            editing: true,
            media: true,
          },
        },
        dataConnection: {
          kind: 'local',
          authMode: 'local-owner',
          status: 'connected',
          displayName: 'E2E local data',
        },
        providerRuntimeEnv: {},
        backendStatus: {
          ok: true,
          baseURL: gatewayBaseURL,
        },
      }),
    }
  }, { gatewayBaseURL })
}

async function mockProductionEditingGateway(page: Parameters<typeof mockGenerationAppShell>[0]) {
  const calls: {
    create: Array<Record<string, unknown>>
    open: Array<Record<string, unknown>>
    remotionSessions: Array<Record<string, unknown>>
    mediaTasks: Array<{ request?: Record<string, unknown> }>
  } = {
    create: [],
    open: [],
    remotionSessions: [],
    mediaTasks: [],
  }
  const remotionWorkspace = {
    workspaceId: 'remotion-e2e',
    workspace_id: 'remotion-e2e',
    kind: 'remotion',
    title: 'E2E 制作 Remotion',
    projectDirectory: '/tmp/movscript-e2e-production-editing/.movscript/production-editing/remotion-e2e',
    project_directory: '/tmp/movscript-e2e-production-editing/.movscript/production-editing/remotion-e2e',
    stale: false,
  }

  await page.route('**/v1/context/sessions', async (route) => {
    await fulfillRouteJSON(route, {
      schema: 'movscript.context-envelope.v1',
      contextId: 'context-e2e-production-editing',
      revision: 1,
      issuedAt: NOW,
      runtime: {
        owner: 'desktop-owned',
        appId: 'movscript.desktop-e2e',
        gatewayPrefix: '/v1',
      },
      principal: {
        userId: '1001',
        kind: 'local-owner',
        scopeKind: 'org',
        scopeId: 1,
      },
      dataConnection: {
        kind: 'local',
        authMode: 'local-owner',
        status: 'connected',
      },
      session: {
        sessionId: 'session-e2e-production-editing',
        project: {
          id: String(PROJECT_ID),
          key: String(PROJECT_ID),
          backendProjectId: PROJECT_ID,
          uid: 'e2e-project-uid',
          title: 'E2E Demo Project',
        },
        workspace: {
          kind: 'local-fs',
          projectCwd: '/tmp/movscript-e2e-production-editing',
        },
        capabilities: {
          localFileAccess: true,
          fileImport: true,
          mediaPreview: true,
        },
      },
    })
  })

  await page.route('**/v1/project/home/read-model', async (route) => {
    await fulfillRouteJSON(route, {
      projectHomeReadModel: {
        schema: 'movscript.project-home-read-model.v1',
        scripts: [],
        productions: [{
          id: 'pilot',
          title: 'E2E 制作',
          kind: 'short_drama',
          production_type: 'short_drama',
        }],
        sceneMoments: [],
        settings: [],
        assets: [],
        contentUnits: [],
      },
    })
  })

  await page.route('**/v1/project/productions/editing-workspaces/list', async (route) => {
    await fulfillRouteJSON(route, {
      result: {
        workspaces: [remotionWorkspace],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 5,
          hasNextPage: false,
        },
      },
    })
  })

  await page.route('**/v1/project/productions/editing-workspaces/create', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    calls.create.push(body)
    await fulfillRouteJSON(route, {
      result: {
        workspace: {
          workspaceId: `${body.kind ?? 'workspace'}-created-e2e`,
          workspace_id: `${body.kind ?? 'workspace'}-created-e2e`,
          kind: body.kind,
          title: body.title,
        },
        handoffPreflight: {
          schema: 'movscript.production_editing_handoff_preflight.v1',
          ready: true,
          blockers: [],
          agentSkill: {
            status: 'available',
            skill: body.kind === 'remotion' ? 'remotion' : 'system_edit',
          },
          projectRuntime: {
            status: 'ready',
          },
        },
      },
    })
  })

  await page.route('**/v1/project/productions/editing-workspaces/open', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    calls.open.push(body)
    await fulfillRouteJSON(route, {
      result: {
        workspace: remotionWorkspace,
        handoff: {
          schema: 'movscript.production_editing_handoff.v1',
          toSkill: 'remotion',
          to_skill: 'remotion',
        },
        handoffPreflight: {
          schema: 'movscript.production_editing_handoff_preflight.v1',
          ready: true,
          blockers: [],
          agentSkill: {
            status: 'available',
            skill: 'remotion',
          },
          projectRuntime: {
            status: 'ready',
          },
        },
        open_action: {
          kind: 'remotion_studio_session',
          backend: 'remotion',
          workspaceId: remotionWorkspace.workspaceId,
          workspace_id: remotionWorkspace.workspace_id,
          productionId: 'pilot',
          production_id: 'pilot',
          projectDirectory: remotionWorkspace.projectDirectory,
          project_directory: remotionWorkspace.project_directory,
          entrypoint: 'src/Root.tsx',
          command: ['pnpm', 'remotion', 'studio', 'src/Root.tsx', '--no-open'],
        },
      },
    })
  })

  const remotionSession = {
    schema: 'movscript.remotion_studio_session.v1',
    sessionId: 'remotion-session-e2e',
    session_id: 'remotion-session-e2e',
    workspaceId: remotionWorkspace.workspaceId,
    workspace_id: remotionWorkspace.workspace_id,
    productionId: 'pilot',
    production_id: 'pilot',
    status: 'ready',
    previewUrl: 'about:blank',
    preview_url: 'about:blank',
    projectDirectory: remotionWorkspace.projectDirectory,
    project_directory: remotionWorkspace.project_directory,
    commandText: 'pnpm remotion studio src/Root.tsx --no-open --port 7777',
    command_text: 'pnpm remotion studio src/Root.tsx --no-open --port 7777',
    logs: [{
      cursor: '1',
      at: NOW,
      stream: 'system',
      text: 'Remotion Studio is ready.',
    }],
  }

  await page.route('**/v1/remotion-studio/sessions/open', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    calls.remotionSessions.push(body)
    await fulfillRouteJSON(route, remotionSession)
  })

  await page.route('**/v1/remotion-studio/sessions/get', async (route) => {
    await fulfillRouteJSON(route, remotionSession)
  })

  await page.route('**/v1/media-pipeline/task/create', async (route) => {
    const body = route.request().postDataJSON() as { request?: Record<string, unknown> }
    calls.mediaTasks.push(body)
    await fulfillRouteJSON(route, {
      task: {
        id: 'task-remotion-preview-e2e',
        status: 'queued',
        backend: 'remotion',
        taskType: 'backend_project_preview',
      },
    })
  })

  return calls
}

async function mockContentWorkspaceResourceFiles(page: Parameters<typeof mockGenerationAppShell>[0]) {
  await page.route(/\/(?:api\/v1\/resources|v1\/resources|resources)\/\d+\/file(?:[?#]|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: ONE_BY_ONE_PNG,
    })
  })
}

async function fulfillRouteJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
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
          edit_prompt: { text: 'A rainy night phone call with {{resource::9101}} as visual anchor.' },
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
      assetReferenceUnits: {
        phone: {
          assetId: 'phone',
          title: '湿润手机',
          path: 'content_units/cu_asset_phone/content_unit.json',
          contentUnitId: 'cu_asset_phone',
          contentUnitType: 'asset_ref',
          outputKind: 'image',
          editPrompt: 'A wet smartphone prop reference.',
          usage: 'Visual anchor for the rainy phone-call scene.',
          lockPolicy: 'Review downstream when stale',
          selectionState: 'selected',
          upstream: [],
          candidates: [{
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
          downstream: [],
        },
      },
    }
    const contentWorkspaceCalls: {
      ensuredContentUnits: unknown[]
      selectedCandidates: Array<{ contentUnitId?: string; candidateId?: string; resourceId?: number }>
      promptUpdates: Array<{ editPrompt: { text?: string }; generationReferences?: Array<Record<string, unknown>> }>
    } = {
      ensuredContentUnits: [],
      selectedCandidates: [],
      promptUpdates: [],
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
      updateMovScriptEngineContentUnitEditPrompt: async (input: {
        editPrompt: { text?: string }
        generationReferences?: Array<Record<string, unknown>>
      }) => {
        contentWorkspaceCalls.promptUpdates.push({
          editPrompt: input.editPrompt,
          ...(input.generationReferences !== undefined ? { generationReferences: input.generationReferences } : {}),
        })
      },
      buildMovScriptEngineContentUnitBackendPrompt: async () => ({ ok: true, prompt: { text: 'Compiled prompt', resource_ids: [], replacements: [] }, blockers: [] }),
    }
    function entity(entityKind: string, id: string | number, path: string, record: Record<string, unknown>) {
      return { entityKind, id, path, record }
    }
  })
}
