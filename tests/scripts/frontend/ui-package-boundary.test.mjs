import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')

function readProjectFile(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function walkFiles(relativeDir, predicate, files = []) {
  const absoluteDir = path.join(root, relativeDir)
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = path.join(absoluteDir, entry)
    const relativePath = path.relative(root, absolutePath)
    if (statSync(absolutePath).isDirectory()) {
      walkFiles(relativePath, predicate, files)
    } else if (predicate(relativePath)) {
      files.push(relativePath)
    }
  }
  return files
}

test('desktop consumes migrated app and workbench primitives through @movscript/ui', () => {
  const removedAppPrimitives = [
    'apps/frontend/src/components/app/AppPage.tsx',
    'apps/frontend/src/components/app/SemanticStatusBadge.tsx',
    'apps/frontend/src/components/app/semantic.ts',
    'apps/frontend/src/components/workbench/WorkbenchPrimitives.tsx',
  ]

  for (const relativePath of removedAppPrimitives) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must stay in @movscript/ui, not desktop`)
  }

  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .map((relativePath) => readProjectFile(relativePath))
    .join('\n')

  assert.doesNotMatch(frontendSources, /@\/components\/app\/AppPage/)
  assert.doesNotMatch(frontendSources, /@\/components\/app\/SemanticStatusBadge/)
  assert.doesNotMatch(frontendSources, /@\/components\/app\/semantic/)
  assert.doesNotMatch(frontendSources, /@\/components\/workbench\/WorkbenchPrimitives/)
})

test('migrated primitive styling is owned by @movscript/ui', () => {
  const appCss = readProjectFile('apps/frontend/src/index.css')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const selector of [
    'app-page',
    'app-section',
    'app-panel',
    'app-key-value',
    'app-state-message',
    'app-inline-error',
    'app-text-empty-state',
    'app-metric-card',
    'app-empty-state',
    'workbench-section',
    'workbench-list',
    'workbench-entity-card',
    'workbench-thumbnail',
    'workbench-status-badge',
    'workbench-metric',
    'workbench-key-value',
    'workbench-empty-state',
  ]) {
    assert.match(uiCss, new RegExp(`\\.${selector}(?:\\s|\\{|--|__)`), `${selector} styles must live in @movscript/ui`)
    assert.doesNotMatch(appCss, new RegExp(`^\\.${selector}\\s*\\{`, 'm'), `${selector} must not be redefined as a desktop-owned base selector`)
  }
})

test('migrated package primitives do not depend on desktop Tailwind utility generation', () => {
  const uiAppSource = readProjectFile('packages/ui/src/components/app.tsx')
  const uiWorkbenchSource = readProjectFile('packages/ui/src/components/workbench.tsx')
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const utilityClassPattern = /(?<![A-Za-z0-9_-])(?:h-full|overflow-auto|mx-auto|min-h-full|space-y-4|p-5|max-w-5xl|max-w-7xl|max-w-none|flex|min-w-0|items-\w+|justify-\w+|gap-\d|mt-\d|shrink-0|truncate|type-\w+|text-\w+|bg-\w+|border-\w+|rounded-\w+|font-semibold)(?![A-Za-z0-9_-])/

  assert.doesNotMatch(uiAppSource, utilityClassPattern)
  assert.doesNotMatch(uiWorkbenchSource, utilityClassPattern)
  assert.doesNotMatch(uiSemanticSource, utilityClassPattern)
})

test('desktop entity and creative reference tones use @movscript/ui contracts', () => {
  const entitySurfaceSource = readProjectFile('apps/frontend/src/components/entity/EntitySurface.tsx')
  const creativeReferenceCardSource = readProjectFile('apps/frontend/src/components/creative/CreativeReferenceCard.tsx')
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple)-\d/

  assert.doesNotMatch(entitySurfaceSource, rawPaletteClassPattern)
  assert.doesNotMatch(creativeReferenceCardSource, rawPaletteClassPattern)
  assert.match(entitySurfaceSource, /accentToneClass/)
  assert.match(creativeReferenceCardSource, /accentToneClass/)
  assert.match(creativeReferenceCardSource, /semanticToneClass/)
  assert.match(uiSemanticSource, /export type AccentTone/)
  assert.match(uiCss, /\.ms-accent-/)
})

test('production proposal review surfaces use @movscript/ui review contracts', () => {
  const proposalReviewSources = [
    'apps/frontend/src/components/proposals/ProductionProposalApplyGatePanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalApplyPreviewPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalBackendPreviewPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalReviewControls.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalReviewHeader.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalReviewPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalReviewResultPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalSemanticDiffPanel.tsx',
    'apps/frontend/src/components/proposals/useProductionProposalReviewController.ts',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const uiReviewSource = readProjectFile('packages/ui/src/components/review.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(proposalReviewSources, rawPaletteClassPattern)
  assert.match(proposalReviewSources, /ReviewCallout/)
  assert.match(proposalReviewSources, /ReviewStat/)
  assert.match(proposalReviewSources, /ChangeActionBadge/)
  assert.match(proposalReviewSources, /ReviewDecisionBadge/)
  assert.match(uiReviewSource, /export function ReviewCallout/)
  assert.match(uiReviewSource, /export function ChangeActionBadge/)
  assert.match(uiCss, /\.ms-review-callout/)
  assert.match(uiCss, /\.ms-change-action-row/)
})

test('core canvas cards use @movscript/ui tone contracts', () => {
  const canvasCardSources = [
    'apps/frontend/src/components/canvas/CanvasDomainEntityCard.tsx',
    'apps/frontend/src/components/canvas/CanvasIOActionCard.tsx',
    'apps/frontend/src/components/canvas/CanvasToolActionCard.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(canvasCardSources, rawPaletteClassPattern)
  assert.match(canvasCardSources, /accentToneClass/)
  assert.match(canvasCardSources, /semanticToneClass/)
  assert.match(uiSemanticSource, /"port"/)
  assert.match(uiCss, /\.ms-accent-port/)
})

test('canvas workflow surfaces use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/pages/canvas/components/CanvasNodes.tsx',
    'apps/frontend/src/components/canvas/CanvasCandidateGroupCard.tsx',
    'apps/frontend/src/features/canvas/ui/CanvasResourceShelf.tsx',
    'apps/frontend/src/features/canvas/ui/CanvasWorkflowPanels.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass|semanticStatusClass|accentToneClass/)
})

test('tasks and segments pages use package semantic tone contracts', () => {
  const pageSources = [
    'apps/frontend/src/pages/project/tasks/TasksPage.tsx',
    'apps/frontend/src/pages/segments/SegmentsPage.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(pageSources, rawPaletteClassPattern)
  assert.match(pageSources, /semanticToneClass/)
  assert.match(pageSources, /accentToneClass/)
})

test('production workspace pages use package semantic and accent contracts', () => {
  const sources = [
    'apps/frontend/src/pages/project/content-units/ContentUnitsPage.tsx',
    'apps/frontend/src/pages/project/delivery/DeliveryPage.tsx',
    'apps/frontend/src/pages/scene-moments/SceneMomentsPage.tsx',
    'apps/frontend/src/lib/productionOrchestrationWorkspaceModel.ts',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /SemanticStatusBadge/)
  assert.match(sources, /AppMetricCard/)
  assert.match(sources, /semanticStatusClass/)
  assert.match(sources, /accentToneClass/)
  assert.match(uiSemanticSource, /"lime"/)
  assert.match(uiCss, /\.ms-accent-badge--lime/)
})

test('workbench workflow panels use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/components/workbench/PreProductionAssetBoard.tsx',
    'apps/frontend/src/components/workbench/ContentWorkbenchUnitTrack.tsx',
    'apps/frontend/src/components/workbench/ContentGenerationReviewPanel.tsx',
    'apps/frontend/src/components/workbench/DeliveryWorkbenchPanels.tsx',
    'apps/frontend/src/components/workbench/DeliveryTimelineTrack.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass/)
  assert.match(sources, /ReviewCallout|WorkbenchStatusBadge/)
})

test('reference relations and generation cards use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/pages/reference-relations/ReferenceRelationsPage.tsx',
    'apps/frontend/src/components/agent/GenerationCards.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass/)
  assert.match(sources, /accentToneClass/)
  assert.match(sources, /ReviewCallout/)
})

test('agent generation and local runtime workflow use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/components/agent/GenerationCards.tsx',
    'apps/frontend/src/components/agent/localRuntime.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass|accentToneClass/)
})

test('agent run settings and preview surfaces use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/pages/agent/AIAgentRunPage.tsx',
    'apps/frontend/src/pages/agent/AIAgentSettingsPage.tsx',
    'apps/frontend/src/components/preview/PreviewDrawer.tsx',
    'apps/frontend/src/components/agent/AgentPlanOverviewPanel.tsx',
    'apps/frontend/src/components/agent/AgentRunActivityPanel.tsx',
    'apps/frontend/src/components/agent/AgentDebugPreviewDialog.tsx',
    'apps/frontend/src/components/agent/AgentChatBubbles.tsx',
    'apps/frontend/src/components/agent/AgentActivityFeed.tsx',
    'apps/frontend/src/components/agent/ContextDiagnosticCard.tsx',
    'apps/frontend/src/components/agent/AgentPlanCard.tsx',
    'apps/frontend/src/components/agent/AgentWorkflowBubble.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass|semanticStatusClass|ReviewCallout|SemanticDot/)
})

test('agent debug console and shared editor surfaces use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/pages/agent/AIAgentDebugPage.tsx',
    'apps/frontend/src/pages/agent/AgentConsolePage.tsx',
    'apps/frontend/src/pages/agent/AIAgentPerformancePage.tsx',
    'apps/frontend/src/pages/agent/AgentRunsPage.tsx',
    'apps/frontend/src/components/shared/SemanticEntityCrudDialog.tsx',
    'apps/frontend/src/components/shared/SemanticEntityInlineEditor.tsx',
    'apps/frontend/src/components/shared/ToolNodeFullCard.tsx',
    'apps/frontend/src/components/canvas/CanvasEntityActionCard.tsx',
    'apps/frontend/src/components/agent/AgentPinnedStatusShelf.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass|ReviewCallout|accentToneClass/)
})

test('agent admin surfaces use package structural primitives', () => {
  const sourcesByPath = new Map([
    ['apps/frontend/src/pages/agent/AIAgentSettingsPage.tsx', readProjectFile('apps/frontend/src/pages/agent/AIAgentSettingsPage.tsx')],
    ['apps/frontend/src/pages/agent/AIAgentDebugPage.tsx', readProjectFile('apps/frontend/src/pages/agent/AIAgentDebugPage.tsx')],
    ['apps/frontend/src/pages/agent/AIAgentPerformancePage.tsx', readProjectFile('apps/frontend/src/pages/agent/AIAgentPerformancePage.tsx')],
    ['apps/frontend/src/pages/agent/AgentRunsPage.tsx', readProjectFile('apps/frontend/src/pages/agent/AgentRunsPage.tsx')],
  ])
  const joinedSources = Array.from(sourcesByPath.values()).join('\n')
  const uiAppSource = readProjectFile('packages/ui/src/components/app.tsx')

  for (const exportName of [
    'AppPanel',
    'AppKeyValue',
    'AppStateMessage',
    'AppInlineError',
    'AppTextEmptyState',
  ]) {
    assert.match(uiAppSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(joinedSources, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent admin surfaces`)
  }
})

test('desktop source files do not hardcode palette utility color tokens', () => {
  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .map((relativePath) => readProjectFile(relativePath))
    .join('\n')
  const semanticEntitySource = readProjectFile('apps/frontend/src/api/semanticEntities.ts')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow|fill|stroke)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate|neutral|pink)-\d/

  assert.doesNotMatch(frontendSources, rawPaletteClassPattern)
  assert.match(semanticEntitySource, /accentToneClass/)
})
