import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const PROJECT_ID = 123

test('content workbench renders the production command center and inspector', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
  await expect(page.getByTestId('content-workbench-production-pipeline')).toContainText('生成上下文')
  await expect(page.getByText('AI 内容创作指挥台', { exact: true })).toBeVisible()
  await expect(page.getByText('旧伞纸条滑落', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-unit-track')).toBeVisible()
  await expect(page.getByText('制作轨道存在阻塞', { exact: true })).toBeVisible()
  await expect(page.getByText('纸条特写', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-readiness-summary')).toBeVisible()
  await expect(page.getByText('生成仍被阻塞', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-delivery-brief')).toContainText('交付包仍有阻塞')
  await expect(page.getByTestId('content-workbench-activity-feed')).toContainText('生产活动有阻塞')
  await expect(page.getByTestId('content-workbench-activity-feed').locator('[data-action-key="review_ai_drafts"]')).toBeVisible()
  await expect(page.getByText('AI 草案已处理', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await expect(page.getByText('AI 草案待审', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-next-actions')).toContainText('补齐素材缺口')
  await expect(page.getByText('会挂到素材需求：旧伞特写参考', { exact: true })).toBeVisible()
})

test('content workbench keeps core production controls visible on mobile width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
  await expect(page.getByTestId('content-workbench-production-pipeline')).toBeVisible()
  await expect(page.getByTestId('content-workbench-unit-track')).toBeVisible()
  await expect(page.getByTestId('content-workbench-readiness-summary')).toBeVisible()
  await expect(page.getByTestId('content-workbench-delivery-brief')).toBeVisible()
  await expect(page.getByTestId('content-workbench-activity-feed')).toBeVisible()
  await expect(page.getByTestId('content-workbench-next-actions')).toBeVisible()
  await expect(page.getByText('制作轨道存在阻塞', { exact: true })).toBeVisible()
})

test('content workbench can reject an AI draft and clear the review queue', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await page.getByRole('button', { name: /退回草案/ }).click()

  await expect(page.getByText('AI 审稿队列', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
})

test('content workbench command metrics opens the AI review queue action', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.getByRole('button', { name: /收起审阅/ }).click()
  await expect(page.getByTestId('content-workbench-review-queue')).toHaveCount(0)

  const metrics = page.getByTestId('content-workbench-command-metrics')
  await expect(metrics).toContainText('待审草案')
  await metrics.locator('[data-action-key="review_ai_drafts"]').click()

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await expect(page.getByText('旧伞纸条滑落 AI 制作项草案', { exact: true })).toBeVisible()
})

test('content workbench opens the review queue from a draft deep link', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.goto('/project/content-units/workbench?view=review&scene_moment_id=402&draftId=content-draft-e2e')

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await expect(page.getByText('旧伞纸条滑落 AI 制作项草案', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
})

test('content workbench applies a production filter from a production draft deep link', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.goto('/project/content-units/workbench?view=review&productionId=301&draftId=content-draft-e2e')

  await expect(page.getByRole('combobox').first()).toContainText('雨夜重逢制作')
  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
})

test('content workbench can deep link to a unit without an explicit scene moment', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.goto('/project/content-units/workbench?content_unit_id=804')

  await expect(page).toHaveURL(/scene_moment_id=403/)
  await expect(page.getByTestId('content-workbench-command-center')).toContainText('门外等待')
  await expect(page.getByTestId('content-workbench-current-unit-panel')).toContainText('门外空镜')
})

test('content workbench AI planning task carries selected scene context', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)
  await page.evaluate(() => {
    const target = window as typeof window & { __contentWorkbenchAgentDraft?: unknown }
    target.__contentWorkbenchAgentDraft = null
    window.addEventListener('movscript:agent-panel-draft', (event) => {
      target.__contentWorkbenchAgentDraft = (event as CustomEvent).detail
    }, { once: true })
  })

  await page.getByRole('button', { name: /让 AI 规划制作项/ }).click()

  const draft = await expect.poll(() => page.evaluate(() => {
    const target = window as typeof window & { __contentWorkbenchAgentDraft?: unknown }
    return target.__contentWorkbenchAgentDraft
  })).toMatchObject({
    taskType: 'content_unit_suggest',
    clientInput: {
      uiSnapshot: {
        pageContext: {
          pageRoute: '/project/content-units/workbench?scene_moment_id=402',
          pageEntityType: 'scene_moment',
          pageEntityId: 402,
        },
      },
    },
  })
  void draft

  const message = await page.evaluate(() => {
    const target = window as typeof window & { __contentWorkbenchAgentDraft?: { message?: string } }
    return target.__contentWorkbenchAgentDraft?.message ?? ''
  })
  expect(message).toContain('当前情节：旧伞纸条滑落')
  expect(message).toContain('情节 ID：402')
  expect(message).toContain('movscript.content_unit_proposal.v1')
  expect(message).toContain('"scene_moment_id": 402')
  expect(message).toContain('已有制作项：')
  expect(message).toContain('纸条特写 / shot / confirmed')
})

test('content workbench can carry AI proposal units into create and edit flows', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.getByTestId('content-workbench-create-proposal-unit').click()
  await expect(page.getByRole('dialog')).toContainText('添加制作项')
  await expect(page.locator('#semantic-inline-contentUnits-title')).toHaveValue('雨水脚步切入')
  await expect(page.locator('#semantic-inline-contentUnits-prompt')).toHaveValue('低机位拍林夏脚步踩过雨水，纸条落地前建立紧张节奏。')
  await page.getByRole('button', { name: /保存/ }).click()
  await expect(page).toHaveURL(/content_unit_id=803/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByTestId('content-workbench-edit-current-unit').first().click()
  await expect(page.getByRole('dialog')).toContainText('编辑制作项')
  await expect(page.locator('#semantic-inline-contentUnits-title')).toHaveValue('雨水脚步切入')
})

test('content workbench can mark an AI draft reviewed after manual review', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await page.getByTestId('content-workbench-mark-draft-reviewed').click()

  await expect(page.getByText('AI 审稿队列', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
})

test('content workbench reuses an existing generation canvas for the selected unit', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)

  await page.getByRole('button', { name: /打开生成画布/ }).first().click()

  await expect(page).toHaveURL(/\/canvases\/777/)
  expect(controls.canvasCreateRequests()).toBe(0)
})

test('content workbench focuses a candidate after confirmation', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)

  await page.getByRole('button', { name: /确认/ }).click()

  await expect(page).toHaveURL(/content_unit_id=802/)
  await expect(page.getByTestId('content-workbench-current-unit-panel')).toContainText('林夏反应')
  expect(controls.confirmedUnitIds()).toEqual([802])
})

test('content workbench returns to a usable unit after ignoring the focused candidate', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)
  await page.goto('/project/content-units/workbench?scene_moment_id=402&content_unit_id=802')

  await expect(page.getByTestId('content-workbench-current-unit-panel')).toContainText('林夏反应')
  await page.getByRole('button', { name: /忽略/ }).click()

  await expect(page).toHaveURL(/content_unit_id=801/)
  await expect(page.getByTestId('content-workbench-current-unit-panel')).toContainText('纸条特写')
  expect(controls.ignoredUnitIds()).toEqual([802])
})

async function openContentWorkbenchPage(page: Page, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL
  if (!baseURL) throw new Error('content workbench E2E requires a baseURL')

  await page.addInitScript(({ key, seed }) => {
    window.localStorage.setItem(key, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
  }, {
    key: E2E_BOOTSTRAP_STORAGE_KEY,
    seed: buildGenerationAppBootstrap(String(baseURL)),
  })

  await mockGenerationAppShell(page)
  const controls = await mockContentWorkbenchData(page)
  await page.goto('/project/content-units/workbench?scene_moment_id=402&content_unit_id=801')
  return controls
}

async function mockContentWorkbenchData(page: Page) {
  let draftRejected = false
  let draftReviewed = false
  let canvasCreateRequests = 0
  const confirmedUnitIds: number[] = []
  const ignoredUnitIds: number[] = []
  const existingGenerationCanvas = {
    ID: 777,
    owner_id: PROJECT_ID,
    project_id: PROJECT_ID,
    name: '纸条特写 · 内容编排',
    canvas_type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: 801,
  }
  const contentUnits: Record<string, unknown>[] = [{
    ID: 801,
    production_id: 301,
    segment_id: 401,
    scene_moment_id: 402,
    title: '纸条特写',
    kind: 'shot',
    duration_sec: 3,
    description: '纸条从旧伞伞骨夹缝中滑出。',
    prompt: '特写纸条从伞骨滑落，雨水打湿字迹。',
    shot_size: 'extreme_close_up',
    camera_angle: 'top_down',
    camera_motion: 'dolly_in',
    status: 'confirmed',
    order: 1,
  }, {
    ID: 802,
    production_id: 301,
    segment_id: 401,
    scene_moment_id: 402,
    title: '林夏反应',
    kind: 'shot',
    duration_sec: 5,
    description: '林夏克制地停住脚步。',
    status: 'draft',
    order: 2,
  }, {
    ID: 804,
    production_id: 301,
    segment_id: 401,
    scene_moment_id: 403,
    title: '门外空镜',
    kind: 'shot',
    duration_sec: 4,
    description: '雨水沿门牌滴落，巷口没有人。',
    prompt: '固定镜头拍门外空巷，雨水滴过旧门牌。',
    status: 'confirmed',
    order: 1,
  }]

  await page.route(`**/api/v1/projects/${PROJECT_ID}/entities/content-units/*/generation-context`, async (route) => {
    await fulfillJSON(route, {
      target: {
        type: 'content_unit',
        content_unit: {
          ID: 801,
          title: '纸条特写',
          kind: 'shot',
          prompt: '特写纸条从伞骨滑落，雨水打湿字迹。',
          description: '纸条从旧伞伞骨夹缝中滑出。',
        },
      },
      intent: 'video',
      production: { ID: 301, name: '雨夜重逢制作' },
      segment: { ID: 401, title: '秘密浮现' },
      scene_moment: { ID: 402, title: '旧伞纸条滑落', action_text: '林夏停住，纸条落到地上。' },
      script_block: { ID: 901, content: '纸条从伞骨夹缝里滑出，被雨水打湿。' },
      creative_references: [{
        usage: { ID: 701, owner_type: 'scene_moment', owner_id: 402 },
        reference: { ID: 501, name: '破损旧伞' },
      }],
      asset_slots: [{
        ID: 601,
        name: '旧伞特写参考',
        owner_type: 'content_unit',
        owner_id: 801,
        status: 'missing',
      }],
      keyframes: [{
        ID: 901,
        title: '纸条落下首帧',
        content_unit_id: 801,
        prompt: '纸条刚离开伞骨。',
      }],
      constraints: {
        read_only_entities: ['script_block', 'creative_reference'],
        write_targets: ['generation_job', 'keyframe'],
      },
    })
  })

  await page.route('**/api/v1/canvases**', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'POST') {
      canvasCreateRequests += 1
      await fulfillJSON(route, { ...existingGenerationCanvas, ID: 778, name: '新建重复画布' })
      return
    }
    if (url.pathname.endsWith('/canvases/777')) {
      await fulfillJSON(route, existingGenerationCanvas)
      return
    }
    await fulfillJSON(route, [existingGenerationCanvas])
  })

  await page.route(`**/api/v1/projects/${PROJECT_ID}/entities/**`, async (route) => {
    const url = new URL(route.request().url())
    const entityPath = url.pathname.split('/').at(-1)
    if (url.pathname.includes('/content-units/') && route.request().method() === 'PATCH') {
      const unitId = Number(entityPath)
      const payload = route.request().postDataJSON() as Record<string, unknown>
      const target = contentUnits.find((unit) => Number(unit.ID) === unitId)
      if (target) Object.assign(target, payload)
      if (payload.status === 'confirmed') confirmedUnitIds.push(unitId)
      if (payload.status === 'ignored') ignoredUnitIds.push(unitId)
      await fulfillJSON(route, target ?? { ID: unitId, ...payload })
      return
    }
    if (entityPath === 'content-units' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      const created = {
        ID: 803,
        project_id: PROJECT_ID,
        ...payload,
      }
      contentUnits.push(created)
      await fulfillJSON(route, created)
      return
    }
    const data: Record<string, unknown[]> = {
      productions: [{
        ID: 301,
        name: '雨夜重逢制作',
        status: 'producing',
        project_id: PROJECT_ID,
      }],
      segments: [{
        ID: 401,
        production_id: 301,
        title: '秘密浮现',
        kind: 'reversal',
        summary: '秘密线索浮出水面。',
        status: 'confirmed',
        order: 1,
      }],
      'scene-moments': [{
        ID: 402,
        segment_id: 401,
        title: '旧伞纸条滑落',
        description: '林夏撑旧伞停在巷口，纸条从伞骨夹缝滑出。',
        time_text: '雨夜',
        location_text: '老城区窄巷',
        condition_text: '雨水持续打湿伞面。',
        action_text: '林夏低头看见纸条滑落。',
        mood: '克制、紧张',
        status: 'confirmed',
        order: 1,
      }, {
        ID: 403,
        segment_id: 401,
        title: '门外等待',
        description: '门外空巷只有雨声，给纸条发现后的停顿留出呼吸。',
        time_text: '雨夜',
        location_text: '老城区窄巷门外',
        action_text: '镜头停在门外，无人出现。',
        mood: '悬疑、冷静',
        status: 'confirmed',
        order: 2,
      }],
      'creative-references': [{
        ID: 501,
        project_id: PROJECT_ID,
        name: '破损旧伞',
        kind: 'prop',
        status: 'confirmed',
        description: '伞骨内侧可以藏纸条。',
      }],
      'creative-reference-usages': [{
        ID: 701,
        project_id: PROJECT_ID,
        owner_type: 'scene_moment',
        owner_id: 402,
        creative_reference_id: 501,
        role: 'key_prop',
        status: 'confirmed',
      }],
      'content-units': contentUnits,
      'asset-slots': [{
        ID: 600,
        project_id: PROJECT_ID,
        name: '林夏手部参考',
        kind: 'image',
        status: 'missing',
        owner_type: 'content_unit',
        owner_id: 802,
        description: '用于验证当前制作项上传入口不会误挂到其他制作项。',
      }, {
        ID: 601,
        project_id: PROJECT_ID,
        name: '旧伞特写参考',
        kind: 'image',
        status: 'missing',
        owner_type: 'content_unit',
        owner_id: 801,
        description: '需要可看清伞骨夹缝的旧伞参考。',
      }, {
        ID: 602,
        project_id: PROJECT_ID,
        name: '林夏雨夜半身',
        kind: 'image',
        status: 'locked',
        owner_type: 'content_unit',
        owner_id: 802,
        resource_id: 9101,
        description: '林夏雨夜半身参考。',
      }],
      keyframes: [{
        ID: 901,
        production_id: 301,
        scene_moment_id: 402,
        content_unit_id: 801,
        title: '纸条落下首帧',
        prompt: '纸条刚离开伞骨。',
        status: 'draft',
        order: 1,
      }],
      'preview-timeline-items': [],
      'delivery-versions': [],
    }
    await fulfillJSON(route, data[entityPath ?? ''] ?? [])
  })

  await page.route('**/api/v1/jobs**', async (route) => {
    await fulfillJSON(route, [])
  })

  await page.route('http://127.0.0.1:28765/drafts**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/drafts' || url.pathname === '/drafts/') {
      const requestedStatuses = url.searchParams.getAll('status')
      const includeDraft = requestedStatuses.length === 0 || requestedStatuses.includes('draft')
      await fulfillJSON(route, {
        drafts: draftRejected || draftReviewed || !includeDraft ? [] : [{
          id: 'content-draft-e2e',
          projectId: PROJECT_ID,
          kind: 'content_unit_proposal',
          title: '旧伞纸条滑落 AI 制作项草案',
          content: JSON.stringify({
            scene_moment_id: 402,
            proposal: {
              units: [{
                title: '纸条特写',
                kind: 'shot',
                description: '纸条从伞骨滑出并落下。',
                prompt: '特写纸条从伞骨滑落，雨水打湿字迹。',
                duration_sec: 3,
                shot: {
                  shot_size: 'extreme_close_up',
                  camera_angle: 'top_down',
                  camera_motion: 'dolly_in',
                },
              }, {
                title: '雨水脚步切入',
                kind: 'shot',
                description: '林夏脚步踩过积水，带出纸条即将滑落的节奏。',
                prompt: '低机位拍林夏脚步踩过雨水，纸条落地前建立紧张节奏。',
                duration_sec: 2,
                shot: {
                  shot_size: 'close_up',
                  camera_angle: 'low_angle',
                  camera_motion: 'tracking',
                },
              }, {
                title: '林夏反应',
                kind: 'shot',
                description: '林夏低头看见纸条后克制停住。',
                prompt: '中近景林夏停步，眼神克制地看向地面纸条。',
                duration_sec: 5,
              }],
            },
          }),
          status: 'draft',
          target: { entityType: 'scene_moment', entityId: 402 },
          createdAt: '2026-05-11T12:00:00.000Z',
          updatedAt: '2026-05-11T12:00:00.000Z',
        }],
      })
      return
    }
    if (url.pathname === '/drafts/content-draft-e2e' && route.request().method() === 'PATCH') {
      draftReviewed = true
      await fulfillJSON(route, {
        id: 'content-draft-e2e',
        projectId: PROJECT_ID,
        kind: 'content_unit_proposal',
        title: '旧伞纸条滑落 AI 制作项草案',
        content: '{}',
        status: 'applied',
        target: { entityType: 'scene_moment', entityId: 402, field: 'content_unit_proposal_review' },
        metadata: {
          reviewedFrom: 'content-workbench',
          backendWritePerformed: false,
          reviewDisposition: 'manual_review_completed',
        },
        createdAt: '2026-05-11T12:00:00.000Z',
        updatedAt: '2026-05-11T12:00:01.000Z',
      })
      return
    }
    if (url.pathname === '/drafts/content-draft-e2e/reject') {
      draftRejected = true
      await fulfillJSON(route, {
        id: 'content-draft-e2e',
        projectId: PROJECT_ID,
        kind: 'content_unit_proposal',
        title: '旧伞纸条滑落 AI 制作项草案',
        content: '{}',
        status: 'rejected',
        createdAt: '2026-05-11T12:00:00.000Z',
        updatedAt: '2026-05-11T12:00:01.000Z',
      })
      return
    }
    await fulfillJSON(route, {})
  })

  return {
    canvasCreateRequests: () => canvasCreateRequests,
    confirmedUnitIds: () => confirmedUnitIds,
    ignoredUnitIds: () => ignoredUnitIds,
  }
}

async function fulfillJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
