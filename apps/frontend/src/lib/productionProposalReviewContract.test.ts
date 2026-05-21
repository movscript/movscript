import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(resolve('src/pages/project/production/ProductionOrchestrationPage.tsx'), 'utf8')
const semanticEntitiesSource = readFileSync(resolve('src/api/semanticEntities.ts'), 'utf8')

test('production proposal review applies accepted changes over the current snapshot', () => {
  assert.match(source, /listSemanticEntities\(projectId, semanticEntityConfig\('keyframes'\)\)/)
  assert.match(source, /listSemanticEntities\(projectId, semanticEntityConfig\('creativeReferenceUsages'\)\)/)
  assert.match(source, /creativeReferenceUsages: data\?\.creativeReferenceUsages \?\? \[\]/)
  assert.match(source, /creative_references: \(referencesBySceneMoment\.get\(moment\.ID\) \?\? \[\]\)\.slice\(\)/)
  assert.match(source, /snapshotBase: currentProductionSnapshot/)
  assert.match(source, /productionSnapshot: currentProductionSnapshot/)
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

test('production orchestration writing surface removes redundant expression controls', () => {
  assert.match(source, /对白、动作、旁白、屏幕文字和镜头描述/)
  assert.match(source, /\{ value: 'subtitle', label: '屏幕文字' \}/)
  assert.match(source, /\{ value: 'visual', label: '镜头描述' \}/)
  assert.match(semanticEntitiesSource, /编剧在情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述/)
  assert.match(semanticEntitiesSource, /\{ value: 'subtitle', label: '屏幕文字' \}/)
  assert.match(semanticEntitiesSource, /\{ value: 'visual', label: '镜头描述' \}/)
  assert.doesNotMatch(source, /可见动作|情绪落点|沉默/)
  assert.doesNotMatch(source, /\{ value: 'silence'/)
  assert.doesNotMatch(semanticEntitiesSource, /\{ value: 'silence'|label: '沉默'/)
})
