import { expect, test } from '@playwright/test'
import {
  assertGenerationLifecycle,
  attachAllGeneratedKeyframeCandidates,
  attachAllGeneratedResourceCandidates,
  attachGeneratedKeyframeCandidate,
  attachGeneratedResourceCandidate,
  mockGenerationBulkCandidateAttachSuccess,
  mockGenerationBulkKeyframeCandidateAttachSuccess,
  mockGenerationCandidateAttachSuccess,
  mockGenerationCandidateTargets,
  mockGenerationCandidateAttachValidationError,
  mockGenerationKeyframeCandidateAttachSuccess,
} from './generationAssertions'

test.beforeEach(async ({ page }) => {
  await mockGenerationCandidateTargets(page)
})

test('agent generation lifecycle renders live progress, final media, and candidate success', async ({ page }) => {
  await mockGenerationCandidateAttachSuccess(page)

  await page.goto('/index.e2e.html')

  await assertGenerationLifecycle(page)
  const candidateControl = await attachGeneratedResourceCandidate(page, '77')
  await expect(candidateControl).toContainText('已加入候选 #601')
})

test('agent generation candidate attach surfaces backend validation errors', async ({ page }) => {
  await mockGenerationCandidateAttachValidationError(page)

  await page.goto('/index.e2e.html')

  const candidateControl = await attachGeneratedResourceCandidate(page, '404')
  await expect(candidateControl).toContainText('目标对象不存在')
})

test('agent generation can add output resources to keyframe candidate lists', async ({ page }) => {
  await mockGenerationKeyframeCandidateAttachSuccess(page)

  await page.goto('/index.e2e.html')

  await assertGenerationLifecycle(page)
  const candidateControl = await attachGeneratedKeyframeCandidate(page, '88')
  await expect(candidateControl).toContainText('已加入候选 #801')
})

test('agent generation can add multiple output resources to one candidate list', async ({ page }) => {
  const attachedResourceIds = await mockGenerationBulkCandidateAttachSuccess(page)

  await page.goto('/index.e2e.html?multiple=1')

  await assertGenerationLifecycle(page)
  await expect(page.getByTestId('agent-generated-result-card')).toContainText('2 个结果')
  const candidateControl = await attachAllGeneratedResourceCandidates(page, '77')
  await expect(candidateControl).toContainText('已加入 2 个候选')
  expect(attachedResourceIds.sort()).toEqual([9101, 9103])
})

test('agent generation can add multiple output resources to one keyframe candidate list', async ({ page }) => {
  const attachedResourceIds = await mockGenerationBulkKeyframeCandidateAttachSuccess(page)

  await page.goto('/index.e2e.html?multiple=1')

  await assertGenerationLifecycle(page)
  await expect(page.getByTestId('agent-generated-result-card')).toContainText('2 个结果')
  const candidateControl = await attachAllGeneratedKeyframeCandidates(page, '88')
  await expect(candidateControl).toContainText('已加入 2 个候选')
  expect(attachedResourceIds.sort()).toEqual([9101, 9103])
})
