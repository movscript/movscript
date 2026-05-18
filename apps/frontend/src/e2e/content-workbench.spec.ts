import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test'

import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
import { buildGenerationAppBootstrap } from './generationAppSeed'
import { mockGenerationAppShell } from './generationAppShell'

const PROJECT_ID = 123

test('content workbench renders the timeline and selected item details', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
  await expect(page.getByText('当前情节', { exact: true })).toBeVisible()
  await expect(page.getByTestId('content-workbench-command-center').getByRole('heading', { name: '旧伞纸条滑落' })).toBeVisible()
  await expect(page.getByTestId('content-workbench-hierarchy-filter')).toContainText('制作卡片')
  await expect(page.getByTestId('content-workbench-hierarchy-filter')).toContainText('情绪段卡片')
  await expect(page.getByTestId('content-workbench-hierarchy-filter')).toContainText('情节卡片')
  await page.getByTestId('content-workbench-production-filter').getByRole('button', { name: /雨夜重逢制作/ }).click()
  await expect(page.getByTestId('content-workbench-scoped-tracks')).toContainText('旧伞纸条滑落')
  await expect(page.getByTestId('content-workbench-scoped-tracks')).toContainText('门外等待')
  await page.getByTestId('content-workbench-scene-moment-filter').getByRole('button', { name: /旧伞纸条滑落/ }).click()
  await expect(page.getByTestId('content-workbench-unit-track')).toBeVisible()
  const keyframeTrackBox = await page.getByTestId('content-workbench-keyframe-track').boundingBox()
  const unitScheduleBox = await page.getByTestId('content-workbench-unit-schedule').boundingBox()
  expect(keyframeTrackBox?.y).toBeLessThan(unitScheduleBox?.y ?? 0)
  await expect(page.getByTestId('content-workbench-unit-schedule')).toContainText('制作项时间轴')
  await expect(page.getByTestId('content-workbench-unit-schedule')).toContainText('0:01-0:05')
  await expect(page.getByTestId('content-workbench-unit-schedule')).toContainText('预览时间线')
  await expect(page.getByTestId('content-workbench-unit-schedule')).toContainText('对白：林夏：伞里有东西')
  await expect(page.getByTestId('content-workbench-unit-timeline')).toContainText('时间尺')
  await expect(page.getByTestId('content-workbench-unit-timeline')).toContainText('镜头')
  await expect(page.getByTestId('content-workbench-unit-timeline')).toContainText('关键帧：纸条落下首帧')
  await expect(page.getByTestId('content-workbench-timeline-zoom')).toContainText('100%')
  await page.getByRole('button', { name: '放大时间轴' }).click()
  await expect(page.getByTestId('content-workbench-timeline-zoom')).toContainText('125%')
  await page.getByRole('button', { name: '缩小时间轴' }).click()
  await expect(page.getByTestId('content-workbench-timeline-zoom')).toContainText('100%')
  await expect(page.getByTestId('content-workbench-timeline-playhead')).toBeVisible()
  await expect(page.getByTestId('content-workbench-timeline-playhead-label')).toContainText('播放头 0:01')
  await expectTimelineBlocksDoNotOverlap(page)
  await expect(page.getByTestId('content-workbench-unit-inspector')).not.toContainText('制作项详情')
  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-801-title')).toHaveValue('纸条特写')
  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-801-title')).toBeDisabled()
  await expect(page.getByTestId('content-workbench-unit-detail-actions').getByRole('button', { name: /^编辑$/ })).toBeEnabled()
  await expect(page.getByTestId('content-workbench-unit-inspector').getByRole('button', { name: /^保存$/ })).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-production-pipeline')).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-readiness-summary')).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-next-actions')).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-execution-section')).toHaveCount(0)
  await expect(page.getByText('生产链路仍有阻塞', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/当前卡点/)).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await expect(page.getByTestId('content-workbench-review-queue').getByText('AI 草案待审', { exact: true })).toBeVisible()
})

test('content workbench keeps core production controls visible on mobile width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
  await expect(page.getByTestId('content-workbench-unit-track')).toBeVisible()
  await expect(page.getByTestId('content-workbench-unit-inspector')).toBeVisible()
  await expect(page.getByTestId('content-workbench-production-pipeline')).toHaveCount(0)
  await expect(page.getByText('生产链路仍有阻塞', { exact: true })).toHaveCount(0)
})

test('content workbench can reject an AI draft and clear the review queue', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await page.getByRole('button', { name: /退回草案/ }).click()

  await expect(page.getByText('AI 审稿队列', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
})

test('content workbench review action opens the AI review queue', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.getByRole('button', { name: /收起审阅/ }).click()
  await expect(page.getByTestId('content-workbench-review-queue')).toHaveCount(0)

  const reviewAction = page.getByTestId('content-workbench-review-action')
  await expect(reviewAction).toContainText('待审草案')
  await reviewAction.locator('[data-action-key="review_ai_drafts"]').click()

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await expect(page.getByRole('button', { name: /旧伞纸条滑落 AI 制作项草案/ })).toBeVisible()
})

test('content workbench opens the review queue from a draft deep link', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.goto('/project/content-units/workbench?view=review&scene_moment_id=402&draftId=content-draft-e2e')

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await expect(page.getByRole('button', { name: /旧伞纸条滑落 AI 制作项草案/ })).toBeVisible()
  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
})

test('content workbench applies a production filter from a production draft deep link', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.goto('/project/content-units/workbench?view=review&productionId=301&draftId=content-draft-e2e')

  await expect(page.getByTestId('content-workbench-production-filter')).toContainText('雨夜重逢制作')
  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
})

test('content workbench can deep link to a unit without an explicit scene moment', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.goto('/project/content-units/workbench?content_unit_id=804')

  await expect(page).toHaveURL(/scene_moment_id=403/)
  await expect(page.getByTestId('content-workbench-command-center')).toContainText('门外等待')
  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-804-title')).toHaveValue('门外空镜')
})

test('content workbench AI planning task carries selected scene context', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo, { hideReviewDraft: true })
  await page.goto('/project/content-units/workbench?scene_moment_id=404')
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
          pageRoute: '/project/content-units/workbench?scene_moment_id=404',
          pageEntityType: 'scene_moment',
          pageEntityId: 404,
        },
      },
    },
  })
  void draft

  const message = await page.evaluate(() => {
    const target = window as typeof window & { __contentWorkbenchAgentDraft?: { message?: string } }
    return target.__contentWorkbenchAgentDraft?.message ?? ''
  })
  expect(message).toContain('当前情节：窗边迟疑')
  expect(message).toContain('情节 ID：404')
  expect(message).toContain('movscript.content_unit_proposal.v1')
  expect(message).toContain('"scene_moment_id": 404')
  expect(message).toContain('还没有制作项')
})

test('content workbench can carry AI proposal units into create and edit flows', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await page.getByTestId('content-workbench-create-proposal-unit').click()
  await expect(page.getByRole('dialog')).toContainText('添加制作项')
  await expect(page.locator('#semantic-inline-content-workbench-create-unit-title')).toHaveValue('林夏反应')
  await expect(page.locator('#semantic-inline-content-workbench-create-unit-prompt')).toHaveValue('中近景林夏停步，眼神克制地看向地面纸条。')
  await page.getByRole('button', { name: /保存/ }).click()
  await expect(page).toHaveURL(/content_unit_id=803/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByTestId('content-workbench-edit-current-unit').first().click()
  await expect(page.getByRole('dialog')).toContainText('编辑制作项')
  await expect(page.locator('#semantic-inline-content-workbench-edit-unit-801-title')).toHaveValue('纸条特写')
})

test('content workbench can manually add a production item from an empty scene moment', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)
  await page.goto('/project/content-units/workbench?scene_moment_id=404')

  await expect(page.getByTestId('content-workbench-unit-schedule')).toContainText('当前情节还没有制作项')
  await page.getByRole('button', { name: /添加制作项/ }).first().click()
  await expect(page.getByRole('dialog')).toContainText('添加制作项')
  await page.locator('#semantic-inline-content-workbench-create-unit-title').fill('窗边旁白')
  await page.locator('#semantic-inline-content-workbench-create-unit-prompt').fill('旁白交代林夏看到纸条后的迟疑。')
  await page.getByRole('button', { name: /保存/ }).click()

  await expect(page).toHaveURL(/content_unit_id=803/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-unit-schedule')).toContainText('窗边旁白')
  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-803-title')).toHaveValue('窗边旁白')
  expect(controls.createdUnitPayloads()).toMatchObject([{
    title: '窗边旁白',
    prompt: '旁白交代林夏看到纸条后的迟疑。',
    production_id: 301,
    segment_id: 401,
    scene_moment_id: 404,
    status: 'candidate',
    order: 1,
  }])
})

test('content workbench can manually add the first keyframe for a production item', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)
  await page.goto('/project/content-units/workbench?scene_moment_id=402&content_unit_id=802')

  await expect(page.getByTestId('content-workbench-keyframe-track')).toContainText('当前制作项还没有关键帧')
  await page.getByRole('button', { name: /添加第一张关键帧/ }).click()
  await expect(page.getByRole('dialog')).toContainText('添加关键帧')
  await page.locator('#semantic-inline-content-workbench-create-keyframe-802-title').fill('林夏反应首帧')
  await page.locator('#semantic-inline-content-workbench-create-keyframe-802-prompt').fill('林夏刚意识到纸条内容，眼神压住情绪。')
  await page.getByRole('button', { name: /保存/ }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-keyframe-track')).toContainText('林夏反应首帧')
  expect(controls.createdKeyframePayloads()).toMatchObject([{
    title: '林夏反应首帧',
    prompt: '林夏刚意识到纸条内容，眼神压住情绪。',
    production_id: 301,
    scene_moment_id: 402,
    content_unit_id: 802,
    status: 'candidate',
    order: 1,
  }])
})

test('content workbench can drag production items onto the timeline to set timing', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)

  await page.getByTestId('content-workbench-unit-card').filter({ hasText: '林夏反应' }).first()
    .dragTo(page.getByTestId('content-workbench-timeline-lane').filter({ hasText: '纸条特写' }).first(), {
      targetPosition: { x: 8, y: 20 },
    })

  await expect(page.getByTestId('content-workbench-schedule-row').first()).toContainText('纸条特写')
  await expect(page.getByTestId('content-workbench-timeline-playhead-label')).toContainText('播放头 0:00')
  expect(controls.contentUnitUpdates()).toEqual([])
  const movedUpdate = controls.previewTimelineItemUpdates().find((item) => item.id === 7111)
  expect(Number(movedUpdate?.payload.start_sec)).toBeLessThanOrEqual(0.2)
  expect(movedUpdate?.payload.preview_timeline_id).toBe(7010)
  expect(movedUpdate?.payload.duration_sec).toBe(4)
  expect(movedUpdate?.payload.order).toBe(2)
})

test('content workbench can reorder production items without dragging', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)

  await page.getByTestId('content-workbench-unit-card').filter({ hasText: '林夏反应' }).getByLabel('前移 林夏反应').click()

  await expect(page.getByTestId('content-workbench-schedule-row').first()).toContainText('林夏反应')
  expect(controls.contentUnitUpdates()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 802, payload: expect.objectContaining({ order: 1 }) }),
    expect.objectContaining({ id: 801, payload: expect.objectContaining({ order: 2 }) }),
  ]))
})

test('content workbench can mark an AI draft reviewed after manual review', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByTestId('content-workbench-review-queue')).toBeVisible()
  await page.getByTestId('content-workbench-mark-draft-reviewed').click()

  await expect(page.getByText('AI 审稿队列', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('content-workbench-command-center')).toBeVisible()
})

test('content workbench does not expose generation canvas from the header', async ({ page }, testInfo) => {
  await openContentWorkbenchPage(page, testInfo)

  await expect(page.getByRole('button', { name: /打开生成画布|创建生成画布/ })).toHaveCount(0)
})

test('content workbench focuses a candidate after confirmation', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)

  const candidateQueue = page.getByTestId('content-workbench-candidate-queue')
  await candidateQueue.click()
  await candidateQueue.getByRole('button', { name: /确认/ }).click()

  await expect(page).toHaveURL(/content_unit_id=802/)
  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-802-title')).toHaveValue('林夏反应')
  expect(controls.confirmedUnitIds()).toEqual([802])
})

test('content workbench returns to a usable unit after ignoring the focused candidate', async ({ page }, testInfo) => {
  const controls = await openContentWorkbenchPage(page, testInfo)
  await page.goto('/project/content-units/workbench?scene_moment_id=402&content_unit_id=802')

  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-802-title')).toHaveValue('林夏反应')
  const candidateQueue = page.getByTestId('content-workbench-candidate-queue')
  await candidateQueue.click()
  await candidateQueue.getByRole('button', { name: /忽略/ }).click()

  await expect(page).toHaveURL(/content_unit_id=801/)
  await expect(page.locator('#semantic-inline-content-workbench-unit-inspector-801-title')).toHaveValue('纸条特写')
  expect(controls.ignoredUnitIds()).toEqual([802])
})

async function openContentWorkbenchPage(page: Page, testInfo: TestInfo, options: { previewMountReady?: boolean; hideReviewDraft?: boolean } = {}) {
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
  const controls = await mockContentWorkbenchData(page, options)
  await page.goto('/project/content-units/workbench?scene_moment_id=402&content_unit_id=801')
  return controls
}

async function mockContentWorkbenchData(page: Page, options: { previewMountReady?: boolean; hideReviewDraft?: boolean } = {}) {
  const previewMountReady = Boolean(options.previewMountReady)
  let draftRejected = false
  let draftReviewed = Boolean(options.hideReviewDraft)
  let canvasCreateRequests = 0
  let uploadedResourceCount = 0
  const confirmedUnitIds: number[] = []
  const ignoredUnitIds: number[] = []
  const createdUnitPayloads: Record<string, unknown>[] = []
  const createdKeyframePayloads: Record<string, unknown>[] = []
  const createdAssetSlotPayloads: Record<string, unknown>[] = []
  const createdAssetSlotCandidatePayloads: Record<string, unknown>[] = []
  const contentUnitUpdates: Array<{ id: number; payload: Record<string, unknown> }> = []
  const previewTimelineItemUpdates: Array<{ id: number; payload: Record<string, unknown> }> = []
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
    script_block_id: 901,
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
  const scriptBlocks: Record<string, unknown>[] = [{
    ID: 901,
    production_id: 301,
    scene_moment_id: 402,
    kind: 'dialogue',
    speaker: '林夏',
    content: '伞里有东西。',
    order: 1,
  }]
  const previewTimelines: Record<string, unknown>[] = [{
    ID: 7010,
    production_id: 301,
    name: '雨夜重逢主预览',
    status: 'confirmed',
    is_primary: true,
    duration_sec: 9,
    order: 1,
  }]
  const previewTimelineItems: Record<string, unknown>[] = [{
    ID: 7110,
    preview_timeline_id: 7010,
    production_id: 301,
    scene_moment_id: 402,
    content_unit_id: 801,
    kind: 'content_unit',
    title: '纸条特写预览项',
    start_sec: 1,
    duration_sec: 4,
    status: 'confirmed',
    order: 1,
  }, {
    ID: 7111,
    preview_timeline_id: 7010,
    production_id: 301,
    scene_moment_id: 402,
    content_unit_id: 802,
    kind: 'content_unit',
    title: '林夏反应预览项',
    start_sec: 5,
    duration_sec: 4,
    status: 'draft',
    order: 2,
  }]
  const keyframes: Record<string, unknown>[] = [{
    ID: 901,
    production_id: 301,
    scene_moment_id: 402,
    content_unit_id: 801,
    title: '纸条落下首帧',
    prompt: '纸条刚离开伞骨。',
    status: 'draft',
    order: 1,
  }]
  const assetSlots: Record<string, unknown>[] = [{
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
    status: previewMountReady ? 'locked' : 'missing',
    owner_type: 'content_unit',
    owner_id: 801,
    resource_id: previewMountReady ? 9100 : undefined,
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
      asset_slots: previewMountReady ? [{
        ID: 601,
        name: '旧伞特写参考',
        owner_type: 'content_unit',
        owner_id: 801,
        status: 'locked',
        resource_id: 9100,
      }] : [{
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

  await page.route('**/api/v1/resources/upload', async (route) => {
    uploadedResourceCount += 1
    await fulfillJSON(route, {
      ID: 9301,
      name: 'umbrella-reference.png',
      url: '/api/v1/resources/9301/file',
      mime_type: 'image/png',
      size: 32,
    })
  })

  await page.route(`**/api/v1/projects/${PROJECT_ID}/entities/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/generation-context')) {
      await route.fallback()
      return
    }
    const entityPath = url.pathname.split('/').at(-1)
    if (url.pathname.includes('/content-units/') && route.request().method() === 'PATCH') {
      const unitId = Number(entityPath)
      const payload = route.request().postDataJSON() as Record<string, unknown>
      contentUnitUpdates.push({ id: unitId, payload })
      const target = contentUnits.find((unit) => Number(unit.ID) === unitId)
      if (target) Object.assign(target, payload)
      if (payload.status === 'confirmed') confirmedUnitIds.push(unitId)
      if (payload.status === 'ignored') ignoredUnitIds.push(unitId)
      await fulfillJSON(route, target ?? { ID: unitId, ...payload })
      return
    }
    if (url.pathname.includes('/preview-timeline-items/') && route.request().method() === 'PATCH') {
      const itemId = Number(entityPath)
      const payload = route.request().postDataJSON() as Record<string, unknown>
      previewTimelineItemUpdates.push({ id: itemId, payload })
      const target = previewTimelineItems.find((item) => Number(item.ID) === itemId)
      if (target) Object.assign(target, payload)
      await fulfillJSON(route, target ?? { ID: itemId, ...payload })
      return
    }
    if (entityPath === 'content-units' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      createdUnitPayloads.push(payload)
      const created = {
        ID: 803,
        project_id: PROJECT_ID,
        ...payload,
      }
      contentUnits.push(created)
      await fulfillJSON(route, created)
      return
    }
    if (entityPath === 'keyframes' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      createdKeyframePayloads.push(payload)
      const created = {
        ID: 902,
        project_id: PROJECT_ID,
        ...payload,
      }
      keyframes.push(created)
      await fulfillJSON(route, created)
      return
    }
    if (entityPath === 'asset-slots' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      createdAssetSlotPayloads.push(payload)
      const created = {
        ID: 603,
        project_id: PROJECT_ID,
        ...payload,
      }
      assetSlots.push(created)
      await fulfillJSON(route, created)
      return
    }
    if (entityPath === 'asset-slot-candidates' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      createdAssetSlotCandidatePayloads.push(payload)
      await fulfillJSON(route, { ID: 8001, project_id: PROJECT_ID, ...payload })
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
      }, {
        ID: 404,
        production_id: 301,
        segment_id: 401,
        title: '窗边迟疑',
        description: '林夏在窗边停顿，等待后续制作项拆解。',
        action_text: '林夏看着被雨水打湿的纸条，没有立刻开口。',
        mood: '犹豫、压抑',
        status: 'confirmed',
        order: 3,
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
      'script-blocks': scriptBlocks,
      'asset-slots': assetSlots,
      keyframes,
      'preview-timelines': previewTimelines,
      'preview-timeline-items': previewTimelineItems,
      'delivery-versions': [],
    }
    await fulfillJSON(route, data[entityPath ?? ''] ?? [])
  })

  await page.route('**/api/v1/jobs**', async (route) => {
    await fulfillJSON(route, previewMountReady ? [{
      ID: 7701,
      title: '纸条特写生成',
      job_type: 'video',
      status: 'succeeded',
      output_resource_id: 9201,
      extra_params: JSON.stringify({ contentUnitId: 801 }),
    }] : [])
  })

  await page.route('http://127.0.0.1:28765/drafts**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/drafts' || url.pathname === '/drafts/') {
      const requestedStatuses = url.searchParams.getAll('status')
      const includeDraft = requestedStatuses.length === 0 || requestedStatuses.includes('draft')
      await fulfillJSON(route, {
        drafts: previewMountReady || draftRejected || draftReviewed || !includeDraft ? [] : [{
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
    createdUnitPayloads: () => createdUnitPayloads,
    createdKeyframePayloads: () => createdKeyframePayloads,
    createdAssetSlotPayloads: () => createdAssetSlotPayloads,
    createdAssetSlotCandidatePayloads: () => createdAssetSlotCandidatePayloads,
    uploadedResourceCount: () => uploadedResourceCount,
    contentUnitUpdates: () => contentUnitUpdates,
    previewTimelineItemUpdates: () => previewTimelineItemUpdates,
  }
}

async function fulfillJSON(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function expectTimelineBlocksDoNotOverlap(page: Page) {
  const overlaps = await page.getByTestId('content-workbench-unit-timeline')
    .locator('[data-testid="content-workbench-timeline-block"]')
    .evaluateAll((nodes) => {
      const byLane = new Map<string, Array<{ id: string; left: number; right: number }>>()
      for (const node of nodes) {
        const element = node as HTMLElement
        const box = element.getBoundingClientRect()
        const lane = element.dataset.laneKey ?? 'unknown'
        const items = byLane.get(lane) ?? []
        items.push({
          id: element.dataset.trackItemId ?? element.textContent ?? '',
          left: box.left,
          right: box.right,
        })
        byLane.set(lane, items)
      }
      const result: string[] = []
      for (const [lane, items] of byLane.entries()) {
        items.sort((a, b) => a.left - b.left)
        for (let index = 1; index < items.length; index += 1) {
          const previous = items[index - 1]
          const current = items[index]
          if (previous.right > current.left + 0.5) {
            result.push(`${lane}:${previous.id}->${current.id}`)
          }
        }
      }
      return result
    })
  expect(overlaps).toEqual([])
}
