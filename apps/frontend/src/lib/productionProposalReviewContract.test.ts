import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(resolve('src/pages/project/production/ProductionOrchestrationPage.tsx'), 'utf8')

test('production proposal review applies accepted changes over the current snapshot', () => {
  assert.match(source, /listSemanticEntities\(projectId, semanticEntityConfig\('keyframes'\)\)/)
  assert.match(source, /buildProposalReviewSegments\(proposalPreviewDraft\.proposal\.segments, currentProductionSnapshot\)/)
  assert.match(source, /return buildMergedProductionProposal\(currentSnapshot, segments, nodeDecisions\)/)
})

test('production proposal review keeps internal delete markers out of apply payloads', () => {
  assert.match(source, /__delete\?: boolean/)
  assert.match(source, /if \(key === '__delete'\) continue/)
  assert.match(source, /proposalSnapshotAction\(node: \{ id\?: number \| null; __delete\?: boolean \}\)/)
})

test('production proposal entry point uses screenwriter-facing wording', () => {
  assert.match(source, /生成编排提案/)
  assert.doesNotMatch(source, /生成创作方案/)
})
