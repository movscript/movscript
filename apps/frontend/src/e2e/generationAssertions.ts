import { expect, type Page } from '@playwright/test'
import {
  movScriptContentUnitKeyframePath,
  movScriptWorkspaceAssetPath,
} from '@movscript/workspace'
import {
  MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
} from '@movscript/core/workspace'

export async function mockGenerationCandidateTargets(page: Page) {
  const workspaceRoot = '/tmp/movscript-e2e-workspace'
  const assetTargetPath = movScriptWorkspaceAssetPath({ id: 'asset_77', settingId: 'setting_1', settingStateId: 'state_1' })
  const keyframeTargetPath = movScriptContentUnitKeyframePath({ contentUnitId: 30, keyframeId: 88 })
  await page.addInitScript(({
    assetTargetPath,
    keyframeTargetPath,
    workspaceRoot,
    manifestFileName,
    manifestSchema,
    providersDirName,
    backendDirName,
  }) => {
    type WorkspaceStateWindow = Window & {
      api?: Record<string, unknown>
      __movscriptWorkspaceFiles?: Record<string, string>
      __movscriptWorkspaceWriteError?: string
      __recordCandidateWrite?: (resourceId: number) => void
    }
    const state = window as WorkspaceStateWindow
    const globalState = state as unknown as Record<string, unknown>
    state.__movscriptWorkspaceFiles = {
      [assetTargetPath]: JSON.stringify({
        schema: 'movscript.asset.v1',
        kind: 'asset',
        id: 'asset_77',
        project_id: 123,
        setting_id: 'setting_1',
        setting_state_id: 'state_1',
        title: '主视觉素材位',
        asset_kind: 'image',
        status: 'open',
        description: '需要一张可审阅的生成图',
      }),
      [keyframeTargetPath]: JSON.stringify({
        schema: 'movscript.keyframe.v1',
        kind: 'keyframe',
        id: 'keyframe_88',
        project_id: 123,
        title: '开场画面锚点',
        status: 'workspace',
        description: '雨夜街口的首帧画面',
        prompt: 'rainy neon street opening keyframe',
        order: 1,
        production_id: 10,
        scene_moment_id: 20,
        content_unit_id: 30,
      }),
    }
    const files = state.__movscriptWorkspaceFiles
    const normalizePath = (path = '') => path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    const fileEntry = (path: string, kind: 'file' | 'directory') => ({
      name: path.split('/').pop() ?? path,
      path,
      kind,
      size: kind === 'file' ? files[path]?.length ?? 0 : 0,
      updatedAt: new Date(0).toISOString(),
    })
    const currentApi = globalState.api && typeof globalState.api === 'object' && !Array.isArray(globalState.api)
      ? globalState.api as Record<string, unknown>
      : {}
    globalState.api = {
      ...currentApi,
      getMovScriptWorkspaceRoot: async () => ({
        movScriptHomeDir: workspaceRoot,
        workspaceDir: workspaceRoot,
        rootDir: workspaceRoot,
        controlDir: workspaceRoot,
        manifestPath: `${workspaceRoot}/${manifestFileName}`,
        providersDir: `${workspaceRoot}/${providersDirName}`,
        backendDir: `${workspaceRoot}/${backendDirName}`,
        manifest: {
          schema: manifestSchema,
          workspaceId: 'e2e',
          activeUserId: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          layout: {
            providerConfigRoot: providersDirName,
          },
        },
      }),
      listMovScriptWorkspaceFiles: async ({ path }: { path?: string } = {}) => {
        const directory = normalizePath(path)
        const prefix = directory ? `${directory}/` : ''
        const entries = new Map<string, 'file' | 'directory'>()
        for (const filePath of Object.keys(files)) {
          if (prefix && !filePath.startsWith(prefix)) continue
          const rest = prefix ? filePath.slice(prefix.length) : filePath
          if (!rest) continue
          const [name, ...tail] = rest.split('/')
          if (!name) continue
          entries.set(prefix + name, tail.length > 0 ? 'directory' : 'file')
        }
        return {
          path: directory,
          rootPath: '/tmp/movscript-e2e-workspace',
          entries: [...entries.entries()].map(([entryPath, kind]) => fileEntry(entryPath, kind)),
        }
      },
      readMovScriptWorkspaceFile: async ({ path }: { path?: string }) => {
        const filePath = normalizePath(path)
        const content = files[filePath]
        if (content === undefined) throw new Error(`workspace file not found: ${filePath}`)
        return { path: filePath, content, size: content.length, updatedAt: new Date(0).toISOString() }
      },
      writeMovScriptWorkspaceFile: async ({ path, content }: { path?: string; content: string }) => {
        if (state.__movscriptWorkspaceWriteError) throw new Error(state.__movscriptWorkspaceWriteError)
        const filePath = normalizePath(path)
        files[filePath] = content
        try {
          const record = JSON.parse(content) as Record<string, unknown>
          const resourceId = Number(record.resource_id)
          if (Number.isFinite(resourceId) && resourceId > 0) state.__recordCandidateWrite?.(resourceId)
        } catch {
          // Ignore non-JSON workspace writes in this test harness.
        }
        return { path: filePath, content, size: content.length, updatedAt: new Date(0).toISOString() }
      },
      deleteMovScriptWorkspaceFile: async ({ path }: { path?: string }) => {
        delete files[normalizePath(path)]
        return { ok: true }
      },
    }
  }, {
    assetTargetPath,
    keyframeTargetPath,
    workspaceRoot,
    manifestFileName: MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME,
    manifestSchema: MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
    providersDirName: MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
    backendDirName: MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME,
  })
  await page.route('**/api/v1/projects/123/entities/asset-slots**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          ID: 77,
          name: '主视觉素材位',
          status: 'open',
          description: '需要一张可审阅的生成图',
        },
      ]),
    })
  })
}

export async function mockGenerationCandidateAttachSuccess(page: Page, resourceId = 9101) {
  await page.route('**/api/v1/projects/123/entities/asset-slot-candidates', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    const payload = request.postDataJSON() as Record<string, unknown>
    expect(payload.asset_slot_id).toBe(77)
    expect(payload.resource_id).toBe(resourceId)
    expect(payload.status).toBe('candidate')
    expect(payload.source_type).toBe('job')
    expect(payload.source_id).toBe(2001)
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ID: 601,
        project_id: 123,
        asset_slot_id: 77,
        candidate_asset_slot_id: 701,
        source_type: 'job',
        source_id: 2001,
        status: 'candidate',
        note: '由 AI 助手生成任务 #2001 加入候选',
      }),
    })
  })
}

export async function mockGenerationBulkCandidateAttachSuccess(page: Page, resourceIds = [9101, 9103]) {
  const attachedResourceIds: number[] = []
  await page.exposeFunction('__recordCandidateWrite', (resourceId: number) => {
    if (resourceIds.includes(resourceId)) attachedResourceIds.push(resourceId)
  })
  await page.route('**/api/v1/projects/123/entities/asset-slot-candidates', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    const payload = request.postDataJSON() as Record<string, unknown>
    const resourceId = Number(payload.resource_id)
    expect(payload.asset_slot_id).toBe(77)
    expect(payload.status).toBe('candidate')
    expect(payload.source_type).toBe('job')
    expect(payload.source_id).toBe(2001)
    expect(resourceIds).toContain(resourceId)
    attachedResourceIds.push(resourceId)
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ID: 600 + attachedResourceIds.length,
        project_id: 123,
        asset_slot_id: 77,
        candidate_asset_slot_id: 700 + attachedResourceIds.length,
        resource_id: resourceId,
        source_type: 'job',
        source_id: 2001,
        status: 'candidate',
        note: '由 AI 助手生成任务 #2001 加入候选',
      }),
    })
  })
  return attachedResourceIds
}

export async function mockGenerationKeyframeCandidateAttachSuccess(page: Page, resourceId = 9101) {
  await page.route('**/api/v1/projects/123/entities/keyframes**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ID: 88,
            title: '开场画面锚点',
            status: 'workspace',
            description: '雨夜街口的首帧画面',
            prompt: 'rainy neon street opening keyframe',
            order: 1,
            production_id: 10,
            scene_moment_id: 20,
            content_unit_id: 30,
          },
        ]),
      })
      return
    }
    expect(request.method()).toBe('POST')
    const payload = request.postDataJSON() as Record<string, unknown>
    expect(payload.resource_id).toBe(resourceId)
    expect(payload.status).toBe('candidate')
    expect(payload.title).toBe('候选：开场画面锚点')
    expect(payload.description).toBe('雨夜街口的首帧画面')
    expect(payload.prompt).toBe('rainy neon street opening keyframe')
    expect(payload.order).toBe(1)
    expect(payload.production_id).toBe(10)
    expect(payload.scene_moment_id).toBe(20)
    expect(payload.content_unit_id).toBe(30)
    expect(JSON.parse(String(payload.metadata_json))).toEqual({
      source: 'ai_generated_keyframe_candidate',
      target_keyframe_id: 88,
      resource_id: resourceId,
      source_job_id: 2001,
    })
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ID: 801,
        project_id: 123,
        resource_id: resourceId,
        status: 'candidate',
        title: '候选：开场画面锚点',
        metadata_json: JSON.stringify({
          source: 'ai_generated_keyframe_candidate',
          target_keyframe_id: 88,
          resource_id: resourceId,
          source_job_id: 2001,
        }),
      }),
    })
  })
}

export async function mockGenerationBulkKeyframeCandidateAttachSuccess(page: Page, resourceIds = [9101, 9103]) {
  const attachedResourceIds: number[] = []
  await page.exposeFunction('__recordCandidateWrite', (resourceId: number) => {
    if (resourceIds.includes(resourceId)) attachedResourceIds.push(resourceId)
  })
  await page.route('**/api/v1/projects/123/entities/keyframes**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ID: 88,
            title: '开场画面锚点',
            status: 'workspace',
            description: '雨夜街口的首帧画面',
            prompt: 'rainy neon street opening keyframe',
            order: 1,
            production_id: 10,
            scene_moment_id: 20,
            content_unit_id: 30,
          },
        ]),
      })
      return
    }
    expect(request.method()).toBe('POST')
    const payload = request.postDataJSON() as Record<string, unknown>
    const resourceId = Number(payload.resource_id)
    expect(resourceIds).toContain(resourceId)
    expect(payload.status).toBe('candidate')
    expect(payload.title).toBe('候选：开场画面锚点')
    expect(JSON.parse(String(payload.metadata_json))).toEqual({
      source: 'ai_generated_keyframe_candidate',
      target_keyframe_id: 88,
      resource_id: resourceId,
      source_job_id: 2001,
    })
    attachedResourceIds.push(resourceId)
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ID: 800 + attachedResourceIds.length,
        project_id: 123,
        resource_id: resourceId,
        status: 'candidate',
        title: '候选：开场画面锚点',
        metadata_json: JSON.stringify({
          source: 'ai_generated_keyframe_candidate',
          target_keyframe_id: 88,
          resource_id: resourceId,
          source_job_id: 2001,
        }),
      }),
    })
  })
  return attachedResourceIds
}

export async function mockGenerationCandidateAttachValidationError(page: Page) {
  await page.addInitScript(() => {
    ;(window as Window & { __movscriptWorkspaceWriteError?: string }).__movscriptWorkspaceWriteError = '目标对象不存在'
  })
  await page.route('**/api/v1/projects/123/entities/asset-slot-candidates', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          message: '目标对象不存在',
        },
      }),
    })
  })
}

export async function assertGenerationLifecycle(page: Page) {
  await assertGenerationSuccessLifecycle(page, {
    resultName: 'provider-image-redacted.png',
    resourceId: 9101,
    providerName: 'Sanitized Image Provider',
    mimeType: 'image/png',
  })
}

export async function assertGenerationSuccessLifecycle(
  page: Page,
  expected: {
    resultName: string
    resourceId: number
    providerName: string
    mimeType: string
  },
) {
  await expect(page.getByTestId('agent-generation-progress')).toBeVisible()
  await expect(page.getByTestId('agent-generation-progress-bar')).toHaveAttribute('aria-valuenow', '47')
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('Job #2001')
  await expect(page.getByTestId('agent-generation-job-progress-bar')).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByTestId('agent-generation-trace-summary')).toContainText('成功1')

  const resultCard = page.getByTestId('agent-generated-result-card')
  await expect(resultCard).toBeVisible()
  await expect(resultCard).toContainText(expected.resultName)
  await expect(resultCard).toContainText(`#${expected.resourceId}`)
  await expect(resultCard).toContainText(expected.providerName)
  await expect(resultCard).toContainText(expected.mimeType)
}

export async function assertGenerationFailureLifecycle(page: Page) {
  await expect(page.getByTestId('agent-generation-progress')).toHaveCount(0)
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('Job #2001')
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('失败')
  await expect(page.getByTestId('agent-generation-job-progress-bar')).toHaveAttribute('aria-valuenow', '47')
  await expect(page.getByTestId('agent-generation-trace-summary')).toContainText('失败1')
  await expect(page.getByTestId('agent-generated-result-card')).toHaveCount(0)
}

export async function assertGenerationTimeoutLifecycle(page: Page) {
  await expect(page.getByTestId('agent-generation-progress')).toHaveCount(0)
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('Job #2001')
  await expect(page.getByTestId('agent-generation-job-summary')).toContainText('超时')
  await expect(page.getByTestId('agent-generation-job-progress-bar')).toHaveAttribute('aria-valuenow', '47')
  await expect(page.getByTestId('agent-generation-trace-summary')).toContainText('超时1')
  await expect(page.getByTestId('agent-generated-result-card')).toHaveCount(0)
}

export async function attachGeneratedResourceCandidate(page: Page, targetId: string) {
  const candidateControl = page.getByTestId('agent-generated-resource-candidate')
  await expect(candidateControl).toBeVisible()
  await candidateControl.getByPlaceholder('搜索素材需求').fill(targetId)
  await candidateControl.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: /主视觉素材位/ }).click()
  await candidateControl.getByRole('button', { name: '加入候选' }).click()
  return candidateControl
}

export async function attachAllGeneratedResourceCandidates(page: Page, targetId: string) {
  const candidateControl = page.getByTestId('agent-generated-bulk-candidate')
  await expect(candidateControl).toBeVisible()
  await candidateControl.getByPlaceholder('搜索素材需求').fill(targetId)
  await candidateControl.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: /主视觉素材位/ }).click()
  await candidateControl.getByRole('button', { name: '全部加入候选' }).click()
  return candidateControl
}

export async function attachAllGeneratedKeyframeCandidates(page: Page, targetId: string) {
  const candidateControl = page.getByTestId('agent-generated-bulk-candidate')
  await expect(candidateControl).toBeVisible()
  await candidateControl.getByRole('combobox').first().click()
  await page.getByRole('option', { name: '画面锚点' }).click()
  await candidateControl.getByPlaceholder('搜索画面锚点').fill(targetId)
  await candidateControl.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: /开场画面锚点/ }).click()
  await candidateControl.getByRole('button', { name: '全部加入候选' }).click()
  return candidateControl
}

export async function attachGeneratedKeyframeCandidate(page: Page, targetId: string) {
  const candidateControl = page.getByTestId('agent-generated-resource-candidate')
  await expect(candidateControl).toBeVisible()
  await candidateControl.getByRole('combobox').first().click()
  await page.getByRole('option', { name: '画面锚点' }).click()
  await candidateControl.getByPlaceholder('搜索画面锚点').fill(targetId)
  await candidateControl.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: /开场画面锚点/ }).click()
  await candidateControl.getByRole('button', { name: '加入候选' }).click()
  return candidateControl
}
