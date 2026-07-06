import { expect, test, type Page, type Route } from '@playwright/test'

import type { ElectronOpenProjectWindowInput } from '@/shared/contracts/electronApiCore'
import type { Project } from '@/types'
import { installE2EBootstrapSeed } from './e2eBootstrapSeed'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const EXISTING_PROJECT: Project = {
  ID: 123,
  name: 'E2E Demo Project',
  description: 'Seeded project used to verify app home architecture.',
  owner_id: 1001,
  project_uid: 'e2e-existing-project',
  workspace_path: '/tmp/movscript-e2e-existing-project',
  project_path: '/tmp/movscript-e2e-existing-project',
  local: true,
  CreatedAt: '2026-05-09T11:00:00.000Z',
  UpdatedAt: '2026-05-09T12:00:00.000Z',
}

const CREATED_PROJECT: Project = {
  ID: 456,
  name: 'Home 创建项目',
  description: 'Home owns project creation.',
  owner_id: 1001,
  project_uid: 'e2e-created-project',
  workspace_path: '/tmp/movscript-e2e-created-project',
  project_path: '/tmp/movscript-e2e-created-project',
  local: true,
  CreatedAt: '2026-05-10T11:00:00.000Z',
  UpdatedAt: '2026-05-10T11:00:00.000Z',
}

type WindowCall =
  | { type: 'agent' }
  | { type: 'canvas' }
  | { type: 'agent-provider-targets' }
  | { type: 'editing' }
  | { type: 'tool'; input?: { route?: string } }
  | { type: 'projectData'; input?: { route?: string } }
  | { type: 'project'; input: ElectronOpenProjectWindowInput }
  | { type: 'home' }

test('app home opens agent, project, and canvas entry points', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await expect(page.getByRole('button', { name: /Agent/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /工作流画布|Canvas/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /剪辑|Editing/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /工具|Tool/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /E2E Demo Project/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /新建|New Project/ })).toBeVisible()

  await page.getByRole('button', { name: /E2E Demo Project/ }).click()
  await expectWindowCall(page, { type: 'project', projectId: EXISTING_PROJECT.ID, route: '/project/home' })
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: /Agent/ }).click()
  await expectWindowCall(page, { type: 'agent' })
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: /安装到主流 Agent|Install to mainstream agents/ }).click()
  await expectWindowCall(page, { type: 'agent-provider-targets' })
  await expect(page.getByText(/Agent Provider 已连接到 Home current/)).toBeVisible()
  await expect(page.getByText('/tmp/movscript-home', { exact: true })).toBeVisible()
  await expect(page.getByText('codex, harness, openclaw, claude-code, workbuddy, trae', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /工作流画布|Canvas/ }).click()
  await expectWindowCall(page, { type: 'canvas' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home opens the tool entry point', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await expect(page.getByRole('button', { name: /工具|Tool/ })).toBeVisible()
  await page.getByRole('button', { name: /工具|Tool/ }).click()
  await expectWindowCall(page, { type: 'tool', route: '/tools/image' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home opens project data in a standalone window', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await page.getByRole('button', { name: /项目数据|Project Data/ }).click()
  await expectWindowCall(page, { type: 'projectData' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home opens the standalone editing entry point', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)
  await gotoHome(page)

  await page.getByRole('button', { name: /剪辑|Editing/ }).click()
  await expectWindowCall(page, { type: 'editing' })
  await expect(page).toHaveURL(/\/$/)
})

test('app home creates project through the launcher dialog', async ({ page }, testInfo) => {
  await setupHomePage(page, testInfo.project.use.baseURL)

  await gotoHome(page)
  await expect(page.getByRole('button', { name: /新建|New Project/ })).toBeVisible()
  await page.getByRole('button', { name: /新建|New Project/ }).click()
  await page.getByLabel(/项目名称|Project name/).fill(CREATED_PROJECT.name)
  await page.getByLabel(/项目描述|Description/).fill(CREATED_PROJECT.description ?? '')
  await page.getByLabel(/项目路径|Project path/).fill('/tmp/movscript-e2e-created-project')
  await page.getByRole('button', { name: /创建项目|Create Project/ }).click()
  await expectWindowCall(page, { type: 'project', projectId: CREATED_PROJECT.ID, route: '/project/home' })
})

async function setupHomePage(page: Page, baseURL: unknown) {
  if (!baseURL) throw new Error('app home E2E requires a baseURL')
  await installE2EBootstrapSeed(page, buildGenerationAppBootstrap(String(baseURL)))
  await mockGenerationAppShell(page)
  await installWindowApiRecorder(page)
  await mockHomeProjects(page)
}

async function gotoHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

async function installWindowApiRecorder(page: Page) {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      api?: Record<string, unknown>
      __movscriptWindowCalls?: WindowCall[]
    }
    const createdProject = {
      ID: 456,
      name: 'Home 创建项目',
      description: 'Home owns project creation.',
      owner_id: 1001,
      project_uid: 'e2e-created-project',
      workspace_path: '/tmp/movscript-e2e-created-project',
      project_path: '/tmp/movscript-e2e-created-project',
      local: true,
      CreatedAt: '2026-05-10T11:00:00.000Z',
      UpdatedAt: '2026-05-10T11:00:00.000Z',
    }
    globalWindow.__movscriptWindowCalls = []
    globalWindow.api = {
      ...(globalWindow.api ?? {}),
      getAppWindowContext: async () => ({ kind: 'home' }),
      openHomeWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'home' })
      },
      openAgentWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'agent' })
      },
      installMovScriptAgentProviderTargets: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'agent-provider-targets' })
        return {
          ok: true,
          homeDir: '/tmp/movscript-home',
          sourcePluginRoot: '/Applications/MovScript.app/Contents/Resources/provider-plugin',
          homeCurrentPluginRoot: '/tmp/movscript-home/plugins/movscript/current',
          homeCurrentPluginVersion: '0.1.0',
          targets: [
            {
              target: 'codex',
              providerRoot: '/tmp/movscript-home/provider/codex',
              pluginLink: '/tmp/movscript-home/provider/codex/plugins/movscript',
              registrationPath: '/tmp/movscript-home/provider/codex/registration.json',
              nativeCommands: [
                'codex plugin remove movscript@movscript-local || true',
                'codex plugin marketplace remove movscript-local || true',
                'codex plugin remove movscript@movscript || true',
                'codex plugin marketplace add "$MOVSCRIPT_HOME/provider/codex"',
                'codex plugin add movscript@movscript',
              ],
            },
            {
              target: 'harness',
              providerRoot: '/tmp/movscript-home/provider/harness',
              pluginLink: '/tmp/movscript-home/provider/harness/plugins/movscript',
              registrationPath: '/tmp/movscript-home/provider/harness/registration.json',
              nativeCommands: ['Import provider/harness/worker-agent.json as a Harness Worker Agent MCP server configuration.'],
            },
            {
              target: 'openclaw',
              providerRoot: '/tmp/movscript-home/provider/openclaw',
              pluginLink: '/tmp/movscript-home/provider/openclaw/plugins/movscript',
              registrationPath: '/tmp/movscript-home/provider/openclaw/registration.json',
              nativeCommands: ['openclaw plugins install --link "$MOVSCRIPT_HOME/provider/openclaw/plugin"'],
            },
            {
              target: 'claude-code',
              providerRoot: '/tmp/movscript-home/provider/claude-code',
              pluginLink: '/tmp/movscript-home/provider/claude-code/plugins/movscript',
              registrationPath: '/tmp/movscript-home/provider/claude-code/registration.json',
              nativeCommands: ['claude mcp add --transport stdio movscript'],
            },
            {
              target: 'workbuddy',
              providerRoot: '/tmp/movscript-home/provider/workbuddy',
              pluginLink: '/tmp/movscript-home/provider/workbuddy/plugins/movscript',
              registrationPath: '/tmp/movscript-home/provider/workbuddy/registration.json',
              nativeCommands: ['Merge "$MOVSCRIPT_HOME/provider/workbuddy/mcp.json" into "$HOME/.workbuddy/mcp.json" or paste it in WorkBuddy MCP settings.'],
            },
            {
              target: 'trae',
              providerRoot: '/tmp/movscript-home/provider/trae',
              pluginLink: '/tmp/movscript-home/provider/trae/plugins/movscript',
              registrationPath: '/tmp/movscript-home/provider/trae/registration.json',
              nativeCommands: ['Merge "$MOVSCRIPT_HOME/provider/trae/mcp.json" into "$HOME/Library/Application Support/Trae/User/mcp.json" or paste it in Trae MCP settings.'],
            },
          ],
          installCommands: [
            'codex plugin remove movscript@movscript-local || true',
            'codex plugin marketplace remove movscript-local || true',
            'codex plugin remove movscript@movscript || true',
            'codex plugin marketplace add "$MOVSCRIPT_HOME/provider/codex"',
            'codex plugin add movscript@movscript',
            'openclaw plugins install --link "$MOVSCRIPT_HOME/provider/openclaw/plugin"',
            'claude mcp add --transport stdio movscript',
            'Merge "$MOVSCRIPT_HOME/provider/workbuddy/mcp.json" into "$HOME/.workbuddy/mcp.json" or paste it in WorkBuddy MCP settings.',
            'Merge "$MOVSCRIPT_HOME/provider/trae/mcp.json" into "$HOME/Library/Application Support/Trae/User/mcp.json" or paste it in Trae MCP settings.',
          ],
        }
      },
      inspectLocalMovScriptProject: async (input: { projectDir: string }) => ({
        projectDir: input.projectDir,
        exists: true,
        isDirectory: true,
        hasWorkspaceManifest: false,
        hasProjectFile: false,
        hasLocalConfig: false,
        hasMovScriptDir: false,
        canCreateClean: true,
        canOpen: false,
        impacts: [],
      }),
      createLocalMovScriptProject: async (input: { projectDir: string; title?: string; description?: string }) => ({
        projectDir: input.projectDir,
        projectPath: input.projectDir,
        projectUid: createdProject.project_uid,
        project: {
          ...createdProject,
          name: input.title ?? createdProject.name,
          description: input.description ?? createdProject.description ?? '',
          workspace_path: input.projectDir,
          project_path: input.projectDir,
          local: true,
        },
        initializedFiles: ['workspace.json'],
      }),
      bindLocalMovScriptProject: async (input: { projectDir: string }) => ({
        projectDir: input.projectDir,
        projectPath: input.projectDir,
        projectUid: createdProject.project_uid,
        project: {
          ...createdProject,
          workspace_path: input.projectDir,
          project_path: input.projectDir,
          local: true,
        },
      }),
      sdkRuntimePackageStatus: async () => ({ installed: true }),
      openCanvasWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'canvas' })
      },
      openEditingWindow: async () => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'editing' })
      },
      openToolWindow: async (input?: { route?: string }) => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'tool', input })
      },
      openProjectDataWindow: async (input?: { route?: string }) => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'projectData', input })
      },
      openProjectWindow: async (input: ElectronOpenProjectWindowInput) => {
        globalWindow.__movscriptWindowCalls?.push({ type: 'project', input })
      },
    }
  })
}

async function mockHomeProjects(page: Page) {
  await page.route('**/api/v1/projects/ensure', async (route) => {
    await fulfillJSON(route, { project: CREATED_PROJECT, created: true })
  })
  await page.route('**/api/v1/project-data/spaces', async (route) => {
    await fulfillJSON(route, { project_uid: CREATED_PROJECT.project_uid })
  })
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJSON(route, CREATED_PROJECT)
      return
    }
    await fulfillJSON(route, [EXISTING_PROJECT])
  })
}

async function expectWindowCall(
  page: Page,
  expected:
    | { type: 'agent' }
    | { type: 'canvas' }
    | { type: 'agent-provider-targets' }
    | { type: 'editing' }
    | { type: 'projectData' }
    | { type: 'tool'; route?: string }
    | { type: 'project'; projectId: number; route?: string },
) {
  await expect.poll(async () => page.evaluate(() => {
    return ((window as Window & { __movscriptWindowCalls?: WindowCall[] }).__movscriptWindowCalls ?? [])
  })).toContainEqual(expected.type === 'agent' || expected.type === 'canvas' || expected.type === 'editing' || expected.type === 'agent-provider-targets'
    ? { type: expected.type }
    : expected.type === 'projectData'
      ? expect.objectContaining({ type: 'projectData' })
    : expected.type === 'tool'
      ? expect.objectContaining({
        type: 'tool',
        input: expect.objectContaining({
          ...(expected.route ? { route: expected.route } : {}),
        }),
      })
    : expect.objectContaining({
      type: 'project',
      input: expect.objectContaining({
        project: expect.objectContaining({ ID: expected.projectId }),
        ...(expected.route ? { route: expected.route } : {}),
      }),
    }))
}

async function fulfillJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
