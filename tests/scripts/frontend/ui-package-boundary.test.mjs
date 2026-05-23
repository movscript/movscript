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

function cssClassSelectorPattern(className) {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\.${escapedClassName}(?:\\s|,|\\{|:|$)`)
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
    'app-disclosure',
    'app-key-value',
    'app-info-block',
    'app-inline-meta',
    'app-state-message',
    'app-inline-error',
    'app-surface-item',
    'app-text-empty-state',
    'app-metric-card',
    'app-empty-state',
    'ms-control',
    'ms-frame',
    'ms-surface',
    'ms-stat-card',
    'ms-key-value',
    'ms-empty-state',
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

test('app and workbench package primitives share internal base style classes', () => {
  const appSource = readProjectFile('packages/ui/src/components/app.tsx')
  const workbenchSource = readProjectFile('packages/ui/src/components/workbench.tsx')
  const reviewSource = readProjectFile('packages/ui/src/components/review.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of ['ms-page-header', 'ms-surface', 'ms-stat-card', 'ms-key-value', 'ms-empty-state']) {
    assert.match(appSource, new RegExp(sharedClass), `${sharedClass} must be used by app primitives`)
    if (sharedClass !== 'ms-page-header') {
      assert.match(workbenchSource, new RegExp(sharedClass), `${sharedClass} must be used by workbench primitives`)
    }
    assert.match(uiCss, new RegExp(`\\.${sharedClass}(?:\\s|\\{|--|__)`), `${sharedClass} base styles must live in @movscript/ui`)
  }
  for (const sharedClass of ['ms-page-header__lead', 'ms-page-header__copy', 'ms-page-header__icon', 'ms-page-header__title', 'ms-page-header__description', 'ms-page-header__actions']) {
    assert.match(appSource, new RegExp(sharedClass), `${sharedClass} must be used by app header primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(appSource, /ms-page-header app-page-header/)
  assert.match(appSource, /ms-page-header project-surface-header/)
  for (const sharedClass of ['ms-surface__copy', 'ms-surface__action', 'ms-surface__body', 'ms-surface__description']) {
    assert.match(appSource, new RegExp(sharedClass), `${sharedClass} must be used by app primitives`)
    assert.match(workbenchSource, new RegExp(sharedClass), `${sharedClass} must be used by workbench primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(appSource, /ms-empty-state__action app-empty-state__action/)
  assert.match(workbenchSource, /ms-empty-state workbench-thumbnail__fallback/)
  assert.match(workbenchSource, /ms-empty-state__action workbench-empty-state__action/)
  assert.match(uiCss, /\.ms-empty-state__action\s*\{/)
  assert.match(uiCss, /\.ms-key-value\s*\{[\s\S]*--ms-key-value-background/)
  assert.match(uiCss, /\.app-key-value\s*\{[\s\S]*--ms-key-value-background/)
  assert.match(uiCss, /\.workbench-key-value\s*\{[\s\S]*--ms-key-value-background/)
  assert.match(uiCss, /\.ms-stat-card\s*\{[\s\S]*--ms-stat-card-background/)
  assert.match(uiCss, /\.app-metric-card\s*\{[\s\S]*--ms-stat-card-background/)
  assert.match(uiCss, /\.workbench-metric\s*\{[\s\S]*--ms-stat-card-background/)
  assert.match(appSource, /export function AppSurfaceItem/)
  assert.match(appSource, /export function AppInlineMeta/)
  assert.match(appSource, /export function AppDisclosure/)
  assert.match(appSource, /ms-frame app-disclosure/)
  assert.match(uiCss, /\.app-surface-item\s*\{/)
  assert.match(uiCss, /\.app-inline-meta\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-disclosure\s*\{[\s\S]*border:/)
  assert.match(uiCss, /\.ms-empty-state\s*\{[\s\S]*--ms-empty-state-min-height/)
  assert.match(uiCss, /\.app-empty-state\s*\{[\s\S]*--ms-empty-state-min-height/)
  assert.match(uiCss, /\.workbench-empty-state\s*\{[\s\S]*--ms-empty-state-min-height/)
  assert.doesNotMatch(uiCss, /\.app-metric-card__(?:row|label|detail|icon)\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-metric__(?:row|label|detail|icon)\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-empty-state__(?:icon|title|detail)\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-empty-state__(?:icon|title|description)\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-key-value__(?:label|value)\s*\{/)
  assert.match(reviewSource, /ms-surface__heading ms-review-callout__header/)
})

test('workbench list and card primitives share internal base classes', () => {
  const workbenchSource = readProjectFile('packages/ui/src/components/workbench.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of [
    'ms-workbench-list',
    'ms-workbench-selectable',
    'ms-workbench-row',
    'ms-workbench-copy',
    'ms-workbench-wrap',
    'ms-workbench-side',
    'ms-workbench-media-frame',
  ]) {
    assert.match(workbenchSource, new RegExp(sharedClass), `${sharedClass} must be consumed by workbench primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(workbenchSource, /ms-workbench-selectable workbench-list-item/)
  assert.match(workbenchSource, /export function WorkbenchSurfaceItem/)
  assert.match(workbenchSource, /WorkbenchSurfaceItem[\s\S]*?ms-workbench-selectable workbench-list-item/)
  assert.match(workbenchSource, /ms-workbench-selectable ms-workbench-row workbench-entity-card/)
  assert.match(workbenchSource, /ms-workbench-media-frame workbench-thumbnail/)
})

test('review and workbench badges share internal inline badge classes', () => {
  const reviewSource = readProjectFile('packages/ui/src/components/review.tsx')
  const workbenchSource = readProjectFile('packages/ui/src/components/workbench.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of ['ms-inline-badge', 'ms-inline-badge--center', 'ms-inline-badge--truncate']) {
    assert.match(`${reviewSource}\n${workbenchSource}`, new RegExp(sharedClass), `${sharedClass} must be consumed by badge primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(reviewSource, /ms-inline-badge ms-inline-badge--center ms-review-stat/)
  assert.match(reviewSource, /ms-inline-badge ms-review-decision-badge/)
  assert.match(reviewSource, /ms-inline-badge ms-inline-badge--center ms-change-action-badge/)
  assert.match(workbenchSource, /ms-inline-badge ms-inline-badge--center ms-inline-badge--truncate workbench-status-badge/)
})

test('icon frames and centered controls share internal center classes', () => {
  const appSource = readProjectFile('packages/ui/src/components/app.tsx')
  const workbenchSource = readProjectFile('packages/ui/src/components/workbench.tsx')
  const avatarSource = readProjectFile('packages/ui/src/components/avatar.tsx')
  const dialogSource = readProjectFile('packages/ui/src/components/dialog.tsx')
  const selectSource = readProjectFile('packages/ui/src/components/select.tsx')
  const tabsSource = readProjectFile('packages/ui/src/components/tabs.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of ['ms-center', 'ms-inline-center']) {
    assert.match(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(appSource, /ms-center ms-page-header__icon/)
  assert.match(appSource, /ms-center ms-stat-card__icon/)
  assert.match(appSource, /ms-center ms-empty-state__icon/)
  assert.match(workbenchSource, /ms-center ms-stat-card__icon/)
  assert.match(workbenchSource, /ms-center ms-empty-state__icon/)
  assert.match(avatarSource, /ms-center ms-avatar__fallback/)
  assert.match(dialogSource, /ms-center ms-dialog__close/)
  assert.match(selectSource, /ms-center ms-select__scroll-button/)
  assert.match(tabsSource, /ms-inline-center ms-tabs__list/)
  assert.match(tabsSource, /ms-inline-center ms-tabs__trigger/)
})

test('card and agent package surfaces share internal frame classes', () => {
  const cardSource = readProjectFile('packages/ui/src/components/card.tsx')
  const dialogSource = readProjectFile('packages/ui/src/components/dialog.tsx')
  const agentSource = readProjectFile('packages/ui/src/components/agent.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  assert.match(cardSource, /ms-frame/)
  assert.match(cardSource, /ms-stack ms-frame__header ms-card__header/)
  assert.match(cardSource, /ms-action-row ms-card__footer/)
  assert.match(dialogSource, /ms-stack ms-dialog__header/)
  assert.match(dialogSource, /ms-action-row ms-dialog__footer/)
  assert.match(dialogSource, /ms-frame__title ms-dialog__title/)
  assert.match(dialogSource, /ms-frame__description ms-dialog__description/)
  assert.match(agentSource, /ms-frame/)
  assert.match(agentSource, /ms-agent-run-card/)
  assert.match(agentSource, /ms-agent-tool/)
  assert.match(agentSource, /ms-agent-instruction/)
  assert.match(agentSource, /ms-agent-rail-section/)
  assert.match(uiCss, /\.ms-frame\s*\{/)
  assert.match(uiCss, /\.ms-frame__header\s*\{/)
  assert.match(uiCss, /\.ms-frame__title\s*\{/)
  assert.match(uiCss, /\.ms-stack\s*\{/)
  assert.match(uiCss, /\.ms-action-row\s*\{/)
})

test('agent package data blocks share internal field classes', () => {
  const agentSource = readProjectFile('packages/ui/src/components/agent.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const componentClass of ['ms-agent-metric', 'ms-agent-run-field', 'ms-agent-tool-step']) {
    assert.match(agentSource, new RegExp(`ms-agent-field ${componentClass}`), `${componentClass} must share ms-agent-field`)
  }
  assert.match(uiCss, /\.ms-agent-field\s*\{/)
})

test('agent message and pill primitives share internal base classes', () => {
  const agentSource = readProjectFile('packages/ui/src/components/agent.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of ['ms-agent-avatar', 'ms-agent-pill', 'ms-agent-bubble']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent primitives`)
    assert.match(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(agentSource, /ms-agent-pill ms-agent-status/)
  assert.match(agentSource, /ms-agent-pill ms-agent-suggestion/)
  assert.match(agentSource, /ms-agent-pill ms-agent-contextchip/)
})

test('agent layout primitives share internal layout classes', () => {
  const agentSource = readProjectFile('packages/ui/src/components/agent.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of ['ms-agent-container', 'ms-agent-bar', 'ms-agent-titleblock', 'ms-agent-actions', 'ms-agent-scrollarea', 'ms-agent-stack', 'ms-agent-cluster']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent layout primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(agentSource, /ms-agent-container ms-agent-shell/)
  assert.match(agentSource, /ms-agent-container ms-agent-work-surface/)
  assert.match(agentSource, /ms-agent-bar ms-agent-header/)
  assert.match(agentSource, /ms-agent-bar ms-agent-work-header/)
  assert.match(agentSource, /ms-agent-stack ms-agent-composer/)
  assert.match(agentSource, /ms-agent-stack ms-agent-run-card__grid/)
  assert.match(agentSource, /ms-agent-cluster ms-agent-message__meta/)
  assert.match(agentSource, /ms-agent-cluster ms-agent-cluster--between ms-agent-composer__toolbar/)
})

test('agent text primitives share internal text classes', () => {
  const agentSource = readProjectFile('packages/ui/src/components/agent.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  for (const sharedClass of ['ms-agent-text', 'ms-agent-text--truncate', 'ms-agent-text--muted', 'ms-agent-text--meta']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent text primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(agentSource, /ms-agent-text ms-agent-text--truncate ms-agent-conversation__title/)
  assert.match(agentSource, /ms-agent-text ms-agent-text--truncate ms-agent-title/)
  assert.match(agentSource, /ms-agent-text ms-agent-text--meta ms-agent-run-card__meta/)
})

test('button and composer controls share internal control classes', () => {
  const buttonSource = readProjectFile('packages/ui/src/components/button.tsx')
  const agentSource = readProjectFile('packages/ui/src/components/agent.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  assert.match(buttonSource, /ms-control ms-button/)
  assert.match(agentSource, /ms-control ms-agent-composer__action/)
  assert.match(agentSource, /ms-control ms-agent-composer__submit/)
  assert.match(uiCss, /\.ms-control\s*\{/)
})

test('form and menu primitives share internal control classes', () => {
  const inputSource = readProjectFile('packages/ui/src/components/input.tsx')
  const textareaSource = readProjectFile('packages/ui/src/components/textarea.tsx')
  const selectSource = readProjectFile('packages/ui/src/components/select.tsx')
  const checkboxSource = readProjectFile('packages/ui/src/components/checkbox.tsx')
  const dropdownSource = readProjectFile('packages/ui/src/components/dropdown-menu.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')

  assert.match(inputSource, /ms-field-control ms-input/)
  assert.match(textareaSource, /ms-field-control ms-textarea/)
  assert.match(selectSource, /ms-field-control ms-native-select/)
  assert.match(selectSource, /ms-field-control ms-select__trigger/)
  assert.match(selectSource, /ms-menu-content ms-select__content/)
  assert.match(selectSource, /ms-menu-item ms-select__item/)
  assert.match(checkboxSource, /ms-field-control ms-checkbox-field/)
  assert.match(checkboxSource, /ms-checkbox-field__input/)
  assert.match(dropdownSource, /ms-menu-content ms-dropdown__content/)
  assert.match(dropdownSource, /ms-menu-item ms-dropdown__item/)

  for (const sharedClass of ['ms-field-control', 'ms-checkbox-field', 'ms-menu-content', 'ms-menu-item']) {
    assert.match(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui`)
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
    'apps/frontend/src/components/proposals/ProductionProposalReviewEmptyState.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalReviewPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalReviewResultPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionProposalSemanticDiffPanel.tsx',
    'apps/frontend/src/components/proposals/ProductionUpstreamProposalReviewSummary.tsx',
    'apps/frontend/src/components/proposals/ProposalReviewShell.tsx',
    'apps/frontend/src/components/proposals/ProjectLayerProposalReviewPanel.tsx',
    'apps/frontend/src/components/proposals/ProjectStandardsProposalReviewPanel.tsx',
    'apps/frontend/src/components/proposals/useProductionProposalReviewController.ts',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const uiReviewSource = readProjectFile('packages/ui/src/components/review.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const upstreamSummarySource = readProjectFile('apps/frontend/src/components/proposals/ProductionUpstreamProposalReviewSummary.tsx')
  const proposalReviewShellSource = readProjectFile('apps/frontend/src/components/proposals/ProposalReviewShell.tsx')
  const proposalEmptyStateSource = readProjectFile('apps/frontend/src/components/proposals/ProductionProposalReviewEmptyState.tsx')
  const backendPreviewSource = readProjectFile('apps/frontend/src/components/proposals/ProductionProposalBackendPreviewPanel.tsx')
  const reviewControlsSource = readProjectFile('apps/frontend/src/components/proposals/ProductionProposalReviewControls.tsx')
  const reviewHeaderSource = readProjectFile('apps/frontend/src/components/proposals/ProductionProposalReviewHeader.tsx')
  const reviewResultSource = readProjectFile('apps/frontend/src/components/proposals/ProductionProposalReviewResultPanel.tsx')
  const projectLayerSource = readProjectFile('apps/frontend/src/components/proposals/ProjectLayerProposalReviewPanel.tsx')
  const projectStandardsSource = readProjectFile('apps/frontend/src/components/proposals/ProjectStandardsProposalReviewPanel.tsx')
  const semanticDiffSource = readProjectFile('apps/frontend/src/components/proposals/ProductionProposalSemanticDiffPanel.tsx')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(proposalReviewSources, rawPaletteClassPattern)
  assert.match(proposalReviewSources, /ReviewCallout/)
  assert.match(proposalReviewSources, /ReviewStat/)
  assert.match(proposalReviewSources, /ChangeActionBadge/)
  assert.match(proposalReviewSources, /ReviewDecisionBadge/)
  assert.match(proposalReviewSources, /AppKeyValue/)
  assert.match(upstreamSummarySource, /AppSection/)
  assert.match(upstreamSummarySource, /AppPanel/)
  assert.match(upstreamSummarySource, /AppTextEmptyState/)
  assert.doesNotMatch(upstreamSummarySource, /rounded-lg border border-border bg-background p-4/)
  assert.doesNotMatch(upstreamSummarySource, /rounded-md border border-dashed border-border bg-muted\/20 px-3 py-4/)
  assert.doesNotMatch(upstreamSummarySource, /rounded-md border border-border bg-muted\/10 p-3/)
  assert.match(proposalReviewShellSource, /AppSection/)
  assert.match(proposalReviewShellSource, /eyebrow=\{kind\}/)
  assert.doesNotMatch(proposalReviewShellSource, /min-w-0 rounded-lg border border-border bg-card p-4/)
  assert.match(proposalEmptyStateSource, /AppEmptyState/)
  assert.doesNotMatch(proposalEmptyStateSource, /rounded-lg border border-dashed border-border bg-background p-6/)
  assert.match(backendPreviewSource, /AppPanel/)
  assert.doesNotMatch(backendPreviewSource, /rounded-md border border-border\/60 bg-muted\/30 p-2/)
  assert.match(reviewControlsSource, /AppPanel/)
  assert.match(reviewControlsSource, /iconClassName=\{semanticToneClass\('info', 'icon'\)\}/)
  assert.doesNotMatch(reviewControlsSource, /rounded-lg border border-border bg-background p-3/)
  assert.match(reviewResultSource, /AppPanel/)
  assert.match(reviewResultSource, /iconClassName=\{semanticToneClass\('success', 'icon'\)\}/)
  assert.match(reviewResultSource, /iconClassName=\{semanticToneClass\('info', 'icon'\)\}/)
  assert.doesNotMatch(reviewResultSource, /rounded-lg border border-border bg-background p-3/)
  assert.match(reviewHeaderSource, /AppKeyValue/)
  assert.doesNotMatch(reviewHeaderSource, /rounded-md border border-border bg-background px-2\.5 py-2/)
  for (const exportName of ['AppPanel', 'AppStateMessage', 'AppTextEmptyState', 'ReviewCallout']) {
    assert.match(projectLayerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by project layer proposal review`)
  }
  assert.doesNotMatch(projectLayerSource, /rounded-md border border-border bg-background px-3 py-3/)
  assert.doesNotMatch(projectLayerSource, /rounded-md border border-dashed border-border bg-background px-3 py-3/)
  assert.doesNotMatch(projectLayerSource, /min-w-0 rounded-md border border-border bg-background p-3/)
  assert.doesNotMatch(projectLayerSource, /rounded-md border p-2\.5/)
  assert.doesNotMatch(projectLayerSource, /rounded border border-dashed border-border\/60 bg-muted\/20 px-2 py-1/)
  assert.doesNotMatch(projectLayerSource, /rounded-md border border-dashed border-border bg-background px-3 py-4/)
  assert.doesNotMatch(projectLayerSource, /space-y-1 rounded-md border border-border bg-background\/70 p-2/)
  assert.match(semanticDiffSource, /AppPanel/)
  assert.match(semanticDiffSource, /AppTextEmptyState/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-border bg-background p-4/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-border bg-background p-3/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-dashed border-border bg-background p-4/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-border bg-background/)
  assert.doesNotMatch(semanticDiffSource, /<button\b/)
  for (const exportName of ['AppPanel', 'AppKeyValue', 'AppEmptyState', 'AppStateMessage', 'AppTextEmptyState', 'ReviewCallout']) {
    assert.match(projectStandardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by project standards proposal review`)
  }
  assert.doesNotMatch(projectStandardsSource, /rounded-lg border border-border bg-background p-3/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-border bg-card px-3 py-2/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-dashed border-border bg-background px-3 py-4/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-border bg-muted\/20 p-3/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-dashed border-border bg-background px-4 py-6/)
  assert.doesNotMatch(proposalReviewSources, /function SummaryCount/)
  assert.match(uiReviewSource, /export function ReviewCallout/)
  assert.match(uiReviewSource, /export function ChangeActionBadge/)
  assert.match(uiCss, /\.ms-review-callout/)
  assert.match(uiCss, /\.ms-change-action-row/)
})

test('core canvas cards use @movscript/ui tone contracts', () => {
  const canvasToolSource = readProjectFile('apps/frontend/src/components/canvas/CanvasToolActionCard.tsx')
  const canvasCardSources = [
    'apps/frontend/src/components/canvas/CanvasDomainEntityCard.tsx',
    'apps/frontend/src/components/canvas/CanvasIOActionCard.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + canvasToolSource
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(canvasCardSources, rawPaletteClassPattern)
  assert.match(canvasCardSources, /accentToneClass/)
  assert.match(canvasCardSources, /semanticToneClass/)
  assert.match(canvasToolSource, /SemanticStatusBadge/)
  assert.doesNotMatch(canvasToolSource, /function StatusBadge/)
  assert.match(uiSemanticSource, /"port"/)
  assert.match(uiCss, /\.ms-accent-port/)
})

test('projects and video edit shell primitives use @movscript/ui', () => {
  const projectsSource = readProjectFile('apps/frontend/src/pages/projects/ProjectsPage.tsx')
  const videoEditSource = readProjectFile('apps/frontend/src/pages/tools/VideoEditPage.tsx')
  const rawPanelShellPattern = /rounded-lg border border-border bg-card p-3/

  assert.match(projectsSource, /AppEmptyState/)
  assert.doesNotMatch(projectsSource, /function EmptyState/)
  assert.match(videoEditSource, /AppPanel/)
  assert.doesNotMatch(videoEditSource, /function Panel/)
  assert.doesNotMatch(videoEditSource, rawPanelShellPattern)
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
  const segmentsSource = readProjectFile('apps/frontend/src/pages/segments/SegmentsPage.tsx')
  const pageSources = [
    'apps/frontend/src/pages/project/tasks/TasksPage.tsx',
    segmentsSource,
  ].join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(pageSources, rawPaletteClassPattern)
  assert.match(pageSources, /semanticToneClass/)
  assert.match(pageSources, /accentToneClass/)
  assert.match(segmentsSource, /AppMetricCard/)
  assert.match(segmentsSource, /AppDisclosure/)
  assert.match(segmentsSource, /CheckboxField/)
  assert.match(segmentsSource, /AppKeyValue/)
  assert.match(segmentsSource, /AppInfoBlock/)
  assert.match(segmentsSource, /AppInlineMeta/)
  assert.match(segmentsSource, /AppPanel/)
  assert.match(segmentsSource, /AppSection/)
  assert.match(segmentsSource, /AppSurfaceItem/)
  assert.match(segmentsSource, /AppEmptyState/)
  assert.match(segmentsSource, /WorkbenchList/)
  assert.match(segmentsSource, /WorkbenchListItem/)
  assert.match(segmentsSource, /WorkbenchSurfaceItem/)
  assert.match(segmentsSource, /function SegmentPreviewSection[\s\S]*?AppPanel/)
  assert.match(segmentsSource, /function SegmentEditSection[\s\S]*?AppSection/)
  assert.match(segmentsSource, /function HeroStat[\s\S]*?AppMetricCard/)
  assert.match(segmentsSource, /function SegmentDetailCard[\s\S]*?AppPanel/)
  assert.match(segmentsSource, /function SceneMomentDetail[\s\S]*?AppPanel/)
  assert.match(segmentsSource, /function ContentUnitDetail[\s\S]*?AppPanel/)
  assert.match(segmentsSource, /function SegmentPreviewValue[\s\S]*?surface="card"/)
  assert.match(segmentsSource, /function SegmentInlineField[\s\S]*?AppSurfaceItem/)
  assert.match(segmentsSource, /function InfoChip[\s\S]*?AppInlineMeta/)
  assert.match(segmentsSource, /AppSurfaceItem[\s\S]{0,500}核心信息/)
  assert.match(segmentsSource, /AppDisclosure[\s\S]{0,200}高级字段/)
  assert.match(segmentsSource, /function SegmentInlineField[\s\S]*?NativeSelect/)
  assert.match(segmentsSource, /function SegmentInlineField[\s\S]*?CheckboxField/)
  assert.match(segmentsSource, /function SegmentButton[\s\S]*?WorkbenchListItem/)
  assert.match(segmentsSource, /function SceneMomentRow[\s\S]*?WorkbenchListItem/)
  assert.match(segmentsSource, /function ContentUnitRow[\s\S]*?WorkbenchListItem/)
  assert.match(segmentsSource, /function RelatedRow[\s\S]*?WorkbenchSurfaceItem/)
  assert.doesNotMatch(segmentsSource, /function SegmentButton[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(segmentsSource, /function SceneMomentRow[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(segmentsSource, /function ContentUnitRow[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(segmentsSource, /function RelatedRow[\s\S]*?rounded-md border border-border bg-background px-3 py-2/)
  assert.doesNotMatch(segmentsSource, /function SegmentPreviewValue[\s\S]*?rounded-md border border-border\/70 bg-card px-3 py-2\.5/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?rounded-md border border-border\/70 bg-card p-3/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?<select\b/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?<input type="checkbox"/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?rounded-md border px-3 type-body/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?rounded-md border border-border\/70 bg-background\/90/)
  assert.doesNotMatch(segmentsSource, /function InfoChip[\s\S]*?rounded-md border border-border bg-card px-2 py-1\.5/)
  assert.doesNotMatch(segmentsSource, /rounded-lg border border-white\/50 bg-background\/70 p-3 shadow-sm backdrop-blur/)
  assert.doesNotMatch(segmentsSource, /overflow-hidden rounded-lg border border-border bg-muted\/20/)
  assert.doesNotMatch(segmentsSource, /grid gap-3 border-t border-border bg-card\/60 p-3/)
  assert.doesNotMatch(segmentsSource, /function SegmentDetailCard[\s\S]*?overflow-hidden rounded-lg border border-border bg-card/)
  assert.doesNotMatch(segmentsSource, /function SceneMomentDetail[\s\S]*?rounded-lg border border-border bg-card/)
  assert.doesNotMatch(segmentsSource, /function ContentUnitDetail[\s\S]*?rounded-lg border border-border bg-card/)
  assert.doesNotMatch(segmentsSource, /编排段清单[\s\S]{0,300}rounded-lg border border-border bg-card/)
  assert.doesNotMatch(segmentsSource, /情景与制作项设计[\s\S]{0,300}rounded-lg border border-border bg-card/)
  assert.doesNotMatch(segmentsSource, /function (MetricCard|MiniStat|StatusBadge|EmptyState|InfoBlock)\b/)
})

test('production workspace pages use package semantic and accent contracts', () => {
  const contentUnitsSource = readProjectFile('apps/frontend/src/pages/project/content-units/ContentUnitsPage.tsx')
  const sceneMomentsSource = readProjectFile('apps/frontend/src/pages/scene-moments/SceneMomentsPage.tsx')
  const directPrimitiveSources = [
    'apps/frontend/src/pages/project/delivery/DeliveryPage.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + contentUnitsSource
    + '\n'
    + sceneMomentsSource
  const sources = [
    'apps/frontend/src/pages/project/delivery/DeliveryPage.tsx',
    'apps/frontend/src/pages/scene-moments/SceneMomentsPage.tsx',
    'apps/frontend/src/lib/productionOrchestrationWorkspaceModel.ts',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + contentUnitsSource
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const uiCss = readProjectFile('packages/ui/src/styles.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /SemanticStatusBadge/)
  assert.match(sources, /AppMetricCard/)
  assert.match(sources, /AppPanel/)
  assert.match(sources, /AppKeyValue/)
  assert.match(sources, /AppInfoBlock/)
  assert.match(sources, /AppEmptyState/)
  for (const exportName of ['AppDisclosure', 'AppSection', 'AppSurfaceItem', 'WorkbenchList', 'WorkbenchListItem', 'WorkbenchSurfaceItem']) {
    assert.match(contentUnitsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content units page`)
  }
  assert.match(contentUnitsSource, /function ContentUnitCard[\s\S]*?WorkbenchListItem/)
  assert.match(contentUnitsSource, /function RelatedPanel[\s\S]*?WorkbenchSurfaceItem/)
  assert.match(contentUnitsSource, /function ContentTargetPanel[\s\S]*?WorkbenchSurfaceItem/)
  assert.match(contentUnitsSource, /function CheckRow[\s\S]*?AppSurfaceItem/)
  assert.doesNotMatch(contentUnitsSource, /content-units-summary-strip[\s\S]{0,200}rounded-md border border-border bg-card/)
  assert.doesNotMatch(contentUnitsSource, /制作项清单[\s\S]{0,400}rounded-lg border border-border bg-card/)
  assert.doesNotMatch(contentUnitsSource, /function ContentUnitCard[\s\S]*?rounded-md border bg-background px-3 py-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /function RelatedPanel[\s\S]*?rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /function ContentTargetPanel[\s\S]*?rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /function CheckRow[\s\S]*?rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /content-unit-detail-context[\s\S]{0,200}rounded-md border border-border bg-background/)
  for (const exportName of ['AppInlineMeta', 'AppSurfaceItem', 'AppTextEmptyState', 'WorkbenchListItem', 'WorkbenchSurfaceItem']) {
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
  }
  assert.match(sceneMomentsSource, /function MomentButton[\s\S]*?WorkbenchListItem/)
  assert.match(sceneMomentsSource, /function RelatedList[\s\S]*?WorkbenchListItem/)
  assert.match(sceneMomentsSource, /function RelatedList[\s\S]*?WorkbenchSurfaceItem/)
  assert.doesNotMatch(sceneMomentsSource, /function MomentButton[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(sceneMomentsSource, /function RelatedList[\s\S]*?rounded-md border border-border bg-background px-3 py-2/)
  assert.doesNotMatch(sceneMomentsSource, /inline-flex max-w-full items-center gap-1\.5 rounded-md border border-border bg-muted\/40/)
  assert.doesNotMatch(sceneMomentsSource, /rounded-md border border-dashed border-border px-3 py-3/)
  assert.match(sources, /semanticStatusClass/)
  assert.match(sources, /accentToneClass/)
  assert.doesNotMatch(directPrimitiveSources, /function (MetricCard|MiniStat|StatusBadge|EmptyState|InfoBlock)\b/)
  assert.match(uiSemanticSource, /"lime"/)
  assert.match(uiCss, /\.ms-accent-badge--lime/)
})

test('workbench workflow panels use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/components/workbench/PreProductionAssetBoard.tsx',
    'apps/frontend/src/components/workbench/ContentWorkbenchUnitTrack.tsx',
    'apps/frontend/src/components/workbench/ContentGenerationReviewPanel.tsx',
    'apps/frontend/src/components/workbench/ContentUnitQuickCreateCards.tsx',
    'apps/frontend/src/components/workbench/DeliveryWorkbenchPanels.tsx',
    'apps/frontend/src/components/workbench/DeliveryTimelineTrack.tsx',
    'apps/frontend/src/components/workbench/PreProductionAssetDetail.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/
  const preProductionBoardSource = readProjectFile('apps/frontend/src/components/workbench/PreProductionAssetBoard.tsx')
  const preProductionAssetDetailSource = readProjectFile('apps/frontend/src/components/workbench/PreProductionAssetDetail.tsx')
  const quickCreateCardsSource = readProjectFile('apps/frontend/src/components/workbench/ContentUnitQuickCreateCards.tsx')
  const deliveryPanelsSource = readProjectFile('apps/frontend/src/components/workbench/DeliveryWorkbenchPanels.tsx')

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass/)
  assert.match(sources, /ReviewCallout|WorkbenchStatusBadge/)
  assert.match(sources, /WorkbenchKeyValue/)
  assert.doesNotMatch(sources, /function MiniStat/)
  assert.match(preProductionAssetDetailSource, /WorkbenchSurfaceItem/)
  assert.match(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?WorkbenchSurfaceItem/)
  assert.match(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?WorkbenchStatusBadge/)
  assert.doesNotMatch(preProductionAssetDetailSource, /workbench-list-item p-2/)
  assert.doesNotMatch(preProductionAssetDetailSource, /semanticToneClass/)
  assert.match(preProductionBoardSource, /WorkbenchSection/)
  assert.match(preProductionBoardSource, /function QueueSectionPanel[\s\S]*?WorkbenchSection/)
  assert.match(preProductionBoardSource, /function ReferenceClusterButton[\s\S]*?WorkbenchEntityCard/)
  assert.match(preProductionBoardSource, /function DraftReferenceClusterButton[\s\S]*?WorkbenchEntityCard/)
  assert.match(preProductionBoardSource, /function CountPill[\s\S]*?WorkbenchStatusBadge/)
  assert.doesNotMatch(preProductionBoardSource, /flex min-h-\[180px\] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background/)
  assert.doesNotMatch(preProductionBoardSource, /rounded-lg border border-dashed border-border bg-muted\/20/)
  assert.match(quickCreateCardsSource, /WorkbenchSection/)
  assert.match(quickCreateCardsSource, /function CreateContentUnitQuickCard[\s\S]*?WorkbenchSection/)
  assert.match(quickCreateCardsSource, /function CreateKeyframeQuickCard[\s\S]*?WorkbenchSection/)
  assert.doesNotMatch(quickCreateCardsSource, /overflow-hidden rounded-lg border border-border bg-card/)
  assert.match(deliveryPanelsSource, /WorkbenchSection/)
  assert.match(deliveryPanelsSource, /WorkbenchEmptyState/)
  assert.match(deliveryPanelsSource, /function DeliveryVersionSummaryCard[\s\S]*?WorkbenchSection/)
  assert.match(deliveryPanelsSource, /function DeliveryGateCheckPanel[\s\S]*?WorkbenchSection/)
  assert.match(deliveryPanelsSource, /function DeliveryExportPanel[\s\S]*?WorkbenchSection/)
  assert.match(deliveryPanelsSource, /function EmptyDeliveryTimeline[\s\S]*?WorkbenchEmptyState/)
  assert.doesNotMatch(deliveryPanelsSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(deliveryPanelsSource, /rounded-lg border border-border p-3/)
  assert.doesNotMatch(deliveryPanelsSource, /flex flex-col items-center justify-center gap-3 p-10/)
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
  assert.match(sources, /AppPanel/)
  assert.match(sources, /AppKeyValue/)
  assert.match(sources, /AppEmptyState/)
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
  const previewDrawerSource = readProjectFile('apps/frontend/src/components/preview/PreviewDrawer.tsx')
  const sources = [
    'apps/frontend/src/pages/agent/AIAgentRunPage.tsx',
    'apps/frontend/src/pages/agent/AIAgentSettingsPage.tsx',
    'apps/frontend/src/components/agent/AgentPlanOverviewPanel.tsx',
    'apps/frontend/src/components/agent/AgentRunActivityPanel.tsx',
    'apps/frontend/src/components/agent/AgentDebugPreviewDialog.tsx',
    'apps/frontend/src/components/agent/AgentChatBubbles.tsx',
    'apps/frontend/src/components/agent/AgentActivityFeed.tsx',
    'apps/frontend/src/components/agent/ContextDiagnosticCard.tsx',
    'apps/frontend/src/components/agent/AgentPlanCard.tsx',
    'apps/frontend/src/components/agent/AgentWorkflowBubble.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + previewDrawerSource
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /semanticToneClass|semanticStatusClass|ReviewCallout|SemanticDot/)
  assert.match(sources, /AppMetricCard/)
  for (const exportName of ['AppPanel', 'AppKeyValue', 'AppEmptyState', 'AppStateMessage']) {
    assert.match(previewDrawerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by preview drawer`)
  }
  for (const exportName of ['WorkbenchList', 'WorkbenchListItem', 'WorkbenchSurfaceItem']) {
    assert.match(previewDrawerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by preview drawer tree`)
  }
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border border-border bg-background/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border border-dashed border-border bg-background/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border border-border bg-muted\/20/)
  assert.doesNotMatch(previewDrawerSource, /rounded-md border border-border bg-background p-3/)
  assert.doesNotMatch(previewDrawerSource, /rounded-md border border-border bg-background px-3 py-2/)
  assert.doesNotMatch(previewDrawerSource, /w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border bg-background transition-colors/)
  assert.doesNotMatch(sources, /function MiniStat/)
})

test('jobs status badges use package semantic status contracts', () => {
  const jobsSource = readProjectFile('apps/frontend/src/pages/jobs/JobsPage.tsx')
  const uiSemanticSource = readProjectFile('packages/ui/src/components/semantic.tsx')
  const rawStatusPillPattern = /inline-flex items-center gap-1 type-label .*rounded-full/
  const rawCardShellPattern = /rounded-(?:lg|xl) border border-border bg-(?:background|card)/

  assert.match(jobsSource, /SemanticStatusBadge/)
  assert.match(jobsSource, /AppKeyValue/)
  assert.match(jobsSource, /AppPanel/)
  assert.match(jobsSource, /AppEmptyState/)
  assert.match(jobsSource, /AppStateMessage/)
  assert.match(jobsSource, /Button/)
  assert.doesNotMatch(jobsSource, rawStatusPillPattern)
  assert.doesNotMatch(jobsSource, rawCardShellPattern)
  assert.doesNotMatch(jobsSource, /<button\b/)
  assert.doesNotMatch(jobsSource, /function (StatusBadge|KeyValue)\b/)
  assert.match(uiSemanticSource, /icon\?: ReactNode/)
  assert.match(uiSemanticSource, /ms-semantic-status-badge__icon/)
})

test('scripts workspace surfaces use package structural primitives', () => {
  const scriptsSource = readProjectFile('apps/frontend/src/pages/scripts/ScriptsPage.tsx')
  const rawPanelShellPattern = /rounded-md border border-border bg-background p-3/

  for (const exportName of ['AppPanel', 'AppMetricCard', 'AppKeyValue', 'AppEmptyState', 'SemanticStatusBadge', 'Badge']) {
    assert.match(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scripts workspace`)
  }

  assert.match(scriptsSource, /function WorkspaceStat[\s\S]*?AppMetricCard/)
  assert.match(scriptsSource, /function PipelineMetric[\s\S]*?AppMetricCard/)
  assert.match(scriptsSource, /function MetricBox[\s\S]*?AppMetricCard/)
  assert.match(scriptsSource, /function VersionStatusBadge[\s\S]*?SemanticStatusBadge/)
  assert.match(scriptsSource, /function ScriptStageBadge[\s\S]*?SemanticStatusBadge/)
  assert.match(scriptsSource, /function ScriptTypeBadge[\s\S]*?Badge/)
  assert.doesNotMatch(scriptsSource, /semanticToneClass/)
  assert.doesNotMatch(scriptsSource, /<button\b/)
  assert.doesNotMatch(scriptsSource, rawPanelShellPattern)
})

test('resources and pre-production inspector use package menu and empty primitives', () => {
  const resourcesSource = readProjectFile('apps/frontend/src/pages/resources/ResourcesPage.tsx')
  const preProductionSource = readProjectFile('apps/frontend/src/pages/pre-production/PreProductionPage.tsx')

  for (const exportName of ['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuTrigger', 'DropdownMenuSeparator', 'Button', 'Badge']) {
    assert.match(resourcesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by resources page`)
  }

  assert.doesNotMatch(resourcesSource, /@radix-ui\/react-dropdown-menu/)
  assert.doesNotMatch(resourcesSource, /DropdownMenu\.(Root|Trigger|Portal|Content|Item|Separator)/)
  assert.doesNotMatch(resourcesSource, /bg-background border border-border rounded-lg shadow-lg py-1/)
  assert.match(preProductionSource, /AppTextEmptyState/)
  assert.match(preProductionSource, /function EmptyInspectorState[\s\S]*?AppTextEmptyState/)
  assert.doesNotMatch(preProductionSource, /rounded-md border border-dashed border-border bg-muted\/20/)
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
  assert.match(sources, /AppInlineError|AppTextEmptyState/)
  assert.doesNotMatch(sources, /function (MetricCard|Panel|SummaryItem|StateMessage|InlineError|EmptyState)\b/)
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

  assert.doesNotMatch(joinedSources, /function (MetricCard|Panel|SummaryItem|StateMessage|InlineError|EmptyState)\b/)
  assert.match(uiAppSource, /text\?: ReactNode/)
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
