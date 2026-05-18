import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('pre-production review only loads explicitly opened proposal drafts', () => {
  const source = readFileSync(resolve('src/pages/pre-production/PreProductionPage.tsx'), 'utf8')

  assert.match(source, /function loadPreProductionReviewDrafts/)
  assert.match(source, /localAgentClient\.getDraft\(draftId\)/)
  assert.match(source, /openedSettingDraftId/)
  assert.match(source, /openedAssetProposalDraftId/)
  assert.doesNotMatch(source, /localAgentClient\.listDrafts\(\{ projectId, kind: 'setting_proposal'/)
  assert.doesNotMatch(source, /localAgentClient\.listDrafts\(\{ projectId, kind: 'asset_proposal'/)
})

test('pre-production proposal panel does not link to historical draft inventory', () => {
  const source = readFileSync(resolve('src/components/proposals/ProjectLayerProposalReviewPanel.tsx'), 'utf8')

  assert.doesNotMatch(source, /查看全部 AI 草稿/)
  assert.doesNotMatch(source, /href="\/agent\/drafts"/)
  assert.doesNotMatch(source, /FileText/)
})
