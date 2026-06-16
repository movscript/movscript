import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')

function readProjectFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (existsSync(absolutePath)) return readFileSync(absolutePath, 'utf8')
  if (relativePath.startsWith('apps/frontend/src/components/agent/')) {
    return readFileSync(path.join(root, relativePath.replace(
      'apps/frontend/src/components/agent/',
      'apps/frontend/src/features/agent/components/',
    )), 'utf8')
  }
  if (relativePath.startsWith('apps/frontend/src/pages/canvas/components/')) {
    return readFileSync(path.join(root, relativePath.replace(
      'apps/frontend/src/pages/canvas/components/',
      'apps/frontend/src/features/canvas/ui/',
    )), 'utf8')
  }
  if (relativePath.startsWith('apps/frontend/src/components/workspaces/')) {
    const fileName = path.basename(relativePath)
    if (fileName.startsWith('ProjectStandards')) {
      return readFileSync(path.join(root, `apps/frontend/src/features/project-standards/components/workspaces/${fileName}`), 'utf8')
    }
    const featureArea = fileName.startsWith('Project') ? 'project' : 'production'
    return readFileSync(path.join(root, `apps/frontend/src/features/${featureArea}/components/workspaces/${fileName}`), 'utf8')
  }
  if (relativePath.startsWith('apps/frontend/src/components/workbench/')) {
    const fileName = path.basename(relativePath)
    const featureArea = fileName.startsWith('Content')
      ? 'content'
      : fileName.startsWith('Production')
            ? 'production'
            : fileName.startsWith('Scenario') || fileName.startsWith('WorkbenchChrome')
              ? 'workbench'
              : null
    if (featureArea) {
      return readFileSync(path.join(root, `apps/frontend/src/features/${featureArea}/components/${fileName}`), 'utf8')
    }
  }
  if (
    relativePath.startsWith('apps/frontend/src/components/shared/') ||
    relativePath.startsWith('apps/frontend/src/components/preview/') ||
    relativePath.startsWith('apps/frontend/src/components/ui/')
  ) {
    return readFileSync(path.join(root, `apps/frontend/src/shared/ui/${path.basename(relativePath)}`), 'utf8')
  }
  return readFileSync(absolutePath, 'utf8')
}

function readScriptsPageFeatureCss() {
  return [
    'apps/frontend/src/features/scripts/components/ScriptsPageUi.css',
    'apps/frontend/src/features/scripts/components/ScriptsPageEditor.css',
    'apps/frontend/src/features/scripts/components/ScriptsPagePanels.css',
  ].map(readProjectFile).join('\n')
}

function readScriptsPageFeatureSource() {
  return [
    'apps/frontend/src/features/scripts/components/ScriptsPageUi.tsx',
    'apps/frontend/src/features/scripts/components/ScriptsPageWorkspaceUi.tsx',
    'apps/frontend/src/features/scripts/components/ScriptsPageEditorUi.tsx',
    'apps/frontend/src/features/scripts/components/ScriptsPageDetailUi.tsx',
    'apps/frontend/src/features/scripts/components/ScriptsPageVersionBlockUi.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourcePageFeatureCss() {
  return [
    'apps/frontend/src/features/resources/components/ResourcePageUi.css',
    'apps/frontend/src/features/resources/components/ResourcePageDialogs.css',
  ].map(readProjectFile).join('\n')
}

function readCanvasWorkflowFeatureCss() {
  return [
    'apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.css',
    'apps/frontend/src/features/canvas/ui/CanvasWorkflowReferenceCardUi.css',
    'apps/frontend/src/features/canvas/ui/CanvasWorkflowRunResultsUi.css',
  ].map(readProjectFile).join('\n')
}

function readAgentCss() {
  return [
    'packages/ui/src/components/business/agent/styles.css',
    'packages/ui/src/components/business/agent/panel/styles.css',
    'packages/ui/src/components/business/agent/panel/frame/styles.css',
    'packages/ui/src/components/business/agent/shell/styles.css',
    'packages/ui/src/components/business/agent/shell/layout/styles.css',
    'packages/ui/src/components/business/agent/shell/sidebar/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/foundation/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/context/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/tool/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/inline/styles.css',
    'packages/ui/src/components/business/agent/shell/code-block/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/menu/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/round/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/line/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/frame/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/code/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/card/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/summary/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/entry/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/code/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/badge/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/tool/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/shell/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/task/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/disclosure/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/item/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/feedback/styles.css',
    'packages/ui/src/components/business/agent/run-activity/styles.css',
    'packages/ui/src/components/business/agent/run-activity/disclosure/styles.css',
    'packages/ui/src/components/business/agent/run-activity/item/styles.css',
    'packages/ui/src/components/business/agent/run-activity/status/styles.css',
    'packages/ui/src/components/business/agent/run-activity/code/styles.css',
    'packages/ui/src/components/business/agent/run-activity/bubble/styles.css',
    'packages/ui/src/components/business/agent/thread/styles.css',
    'packages/ui/src/components/business/agent/thread/foundation/styles.css',
    'packages/ui/src/components/business/agent/thread/empty/styles.css',
    'packages/ui/src/components/business/agent/thread/tool/styles.css',
    'packages/ui/src/components/business/agent/thread/suggestion/styles.css',
    'packages/ui/src/components/business/agent/run/styles.css',
    'packages/ui/src/components/business/agent/run/foundation/styles.css',
    'packages/ui/src/components/business/agent/run/data-block/styles.css',
    'packages/ui/src/components/business/agent/responsive/styles.css',
  ].map(readProjectFile).join('\n')
}

function readAgentChatSource() {
  return [
    'apps/frontend/src/features/agent/components/AgentConversationTabsUi.tsx',
    'apps/frontend/src/features/agent/components/conversation-tabs-ui/dragPayload.ts',
  ].map(readProjectFile).join('\n')
}

function readAgentChatCss() {
  return ''
}

function readAgentActivityFeedSource() {
  return [
    'packages/ui/src/components/business/agent/activity-feed/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/types.ts',
    'packages/ui/src/components/business/agent/activity-feed/feed/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/menu/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/round/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/line/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/frame/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/code/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAgentActivityFeedCss() {
  return [
    'packages/ui/src/components/business/agent/activity-feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/menu/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/round/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/line/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/frame/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/code/styles.css',
  ].map(readProjectFile).join('\n')
}

function readAgentDiagnosticSource() {
  return [
    'packages/ui/src/components/business/agent/diagnostic/index.tsx',    'packages/ui/src/components/business/agent/diagnostic/card/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/summary/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/entry/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/code/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/badge/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/tool/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/warnings/index.tsx',  ].map(readProjectFile).join('\n')
}

function readAgentDiagnosticCss() {
  return [
    'packages/ui/src/components/business/agent/diagnostic/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/card/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/summary/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/entry/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/code/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/badge/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/tool/styles.css',  ].map(readProjectFile).join('\n')
}

function readAgentRunSource() {
  return [
    'packages/ui/src/components/business/agent/run/index.tsx',
    'packages/ui/src/components/business/agent/run/data-block/index.tsx',
    'packages/ui/src/components/business/agent/run/code/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAgentRunCss() {
  return [
    'packages/ui/src/components/business/agent/run/styles.css',
    'packages/ui/src/components/business/agent/run/foundation/styles.css',
    'packages/ui/src/components/business/agent/run/data-block/styles.css',
  ].map(readProjectFile).join('\n')
}

function readAgentSource() {
  return [
    'packages/ui/src/components/business/agent/index.tsx',
    'packages/ui/src/components/business/agent/types.ts',
    'packages/ui/src/components/business/agent/surface-block.tsx',
    'packages/ui/src/components/business/agent/shell/layout/index.tsx',
    'packages/ui/src/components/business/agent/shell/sidebar/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/status/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/tool/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/suggestion/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/context/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/inline/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/types.ts',
    'packages/ui/src/components/business/agent/activity-feed/feed/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/menu/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/round/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/line/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/frame/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/code/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/card/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/summary/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/entry/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/code/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/badge/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/tool/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/warnings/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/shell/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/task/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/item/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/feedback/index.tsx',
    'packages/ui/src/components/business/agent/run/index.tsx',
    'packages/ui/src/components/business/agent/run/data-block/index.tsx',
    'packages/ui/src/components/business/agent/run/code/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/item/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/status/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/code/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/notice/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/bubble/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAppSource() {
  return [
    'packages/ui/src/components/business/app/index.tsx',
    'packages/ui/src/components/business/app/dialog/index.tsx',
    'packages/ui/src/components/business/app/navigation/index.tsx',
    'packages/ui/src/components/business/app/surface/index.tsx',
    'packages/ui/src/components/business/app/surface/section/index.tsx',
    'packages/ui/src/components/business/app/surface/panel/index.tsx',
    'packages/ui/src/components/business/app/surface/item/index.tsx',
    'packages/ui/src/components/business/app/surface/choice/index.tsx',
    'packages/ui/src/components/business/app/surface/disclosure/index.tsx',
    'packages/ui/src/components/business/app/display/index.tsx',
    'packages/ui/src/components/business/app/display/controls/index.tsx',
    'packages/ui/src/components/business/app/display/media/index.tsx',
    'packages/ui/src/components/business/app/display/progress/index.tsx',
    'packages/ui/src/components/business/app/display/timeline/index.tsx',
    'packages/ui/src/components/business/app/display/marker/index.tsx',
    'packages/ui/src/components/business/app/display/avatar/index.tsx',
    'packages/ui/src/components/business/app/display/icon/index.tsx',
    'packages/ui/src/components/business/app/display/skeleton/index.tsx',
    'packages/ui/src/components/business/app/display/code/index.tsx',
    'packages/ui/src/components/business/app/display/inline-meta/index.tsx',
    'packages/ui/src/components/business/app/data-display/index.tsx',
    'packages/ui/src/components/business/app/data-display/key-value/index.tsx',
    'packages/ui/src/components/business/app/data-display/info-block/index.tsx',
    'packages/ui/src/components/business/app/data-display/metric/index.tsx',
    'packages/ui/src/components/business/app/data-display/table/index.tsx',
    'packages/ui/src/components/business/app/state/index.tsx',
    'packages/ui/src/components/business/app/work-mode/index.tsx',
    'packages/ui/src/components/business/app/work-mode/types.ts',
    'packages/ui/src/components/business/app/work-mode/prompt/index.tsx',
    'packages/ui/src/components/business/app/work-mode/card/index.tsx',
    'packages/ui/src/components/business/app/work-mode/switch-guide/index.tsx',
    'packages/ui/src/components/business/app/shell/index.tsx',
    'packages/ui/src/components/business/app/toast/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAppCss() {
  return [
    'packages/ui/src/components/business/app/styles.css',
    'packages/ui/src/components/business/app/display/styles.css',
    'packages/ui/src/components/business/app/display/controls/styles.css',
    'packages/ui/src/components/business/app/display/media/styles.css',
    'packages/ui/src/components/business/app/display/progress/styles.css',
    'packages/ui/src/components/business/app/display/timeline/styles.css',
    'packages/ui/src/components/business/app/display/marker/styles.css',
    'packages/ui/src/components/business/app/display/avatar/styles.css',
    'packages/ui/src/components/business/app/display/icon/styles.css',
    'packages/ui/src/components/business/app/display/skeleton/styles.css',
    'packages/ui/src/components/business/app/display/code/styles.css',
    'packages/ui/src/components/business/app/display/inline-meta/styles.css',
    'packages/ui/src/components/business/app/navigation/styles.css',
    'packages/ui/src/components/business/app/surface/styles.css',
    'packages/ui/src/components/business/app/surface/section/styles.css',
    'packages/ui/src/components/business/app/surface/panel/styles.css',
    'packages/ui/src/components/business/app/surface/item/styles.css',
    'packages/ui/src/components/business/app/surface/choice/styles.css',
    'packages/ui/src/components/business/app/surface/disclosure/styles.css',
    'packages/ui/src/components/business/app/data-display/styles.css',
    'packages/ui/src/components/business/app/data-display/key-value/styles.css',
    'packages/ui/src/components/business/app/data-display/info-block/styles.css',
    'packages/ui/src/components/business/app/data-display/metric/styles.css',
    'packages/ui/src/components/business/app/data-display/table/styles.css',
    'packages/ui/src/components/business/app/state/styles.css',
    'packages/ui/src/components/business/app/work-mode/styles.css',
    'packages/ui/src/components/business/app/work-mode/prompt/styles.css',
    'packages/ui/src/components/business/app/work-mode/card/styles.css',
    'packages/ui/src/components/business/app/work-mode/switch-guide/styles.css',
    'packages/ui/src/components/business/app/shell/styles.css',
    'packages/ui/src/components/business/app/toast/styles.css',
  ].map(readProjectFile).join('\n')
}

function readReviewSource() {
  return [
    'packages/ui/src/components/business/review/index.tsx',
    'packages/ui/src/components/business/review/types.ts',
    'packages/ui/src/components/business/review/callout/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readReviewCss() {
  return [
    'packages/ui/src/components/business/review/styles.css',
    'packages/ui/src/components/business/review/callout/styles.css',
  ].map(readProjectFile).join('\n')
}

function readJobsSource() {
  return [
    'apps/frontend/src/features/jobs/components/JobsPage.tsx',
    'apps/frontend/src/features/jobs/components/JobsPageParts.tsx',
    'apps/frontend/src/features/jobs/components/JobsPageCards.tsx',
    'apps/frontend/src/features/tools/components/ToolDialogJobPanels.tsx',
  ].map(readProjectFile).join('\n')
}

function readJobsCss() {
  return [
    'apps/frontend/src/shared/ui/JobDisplayUi.css',
  ].map(readProjectFile).join('\n')
}

function readJobsDisplayUiSource() {
  return readProjectFile('apps/frontend/src/shared/ui/JobDisplayUi.tsx')
}

function readResourcePanelSource() {
  return [
    'packages/ui/src/components/business/resource/panel/index.tsx',
    'packages/ui/src/components/business/resource/panel/shell/index.tsx',
    'packages/ui/src/components/business/resource/panel/controls/index.tsx',
    'packages/ui/src/components/business/resource/panel/list/index.tsx',
    'packages/ui/src/components/business/resource/panel/asset-slot/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourcePanelCss() {
  return [
    'packages/ui/src/components/business/resource/panel/styles.css',
    'packages/ui/src/components/business/resource/panel/shell/styles.css',
    'packages/ui/src/components/business/resource/panel/controls/styles.css',
    'packages/ui/src/components/business/resource/panel/list/styles.css',
    'packages/ui/src/components/business/resource/panel/asset-slot/styles.css',
  ].map(readProjectFile).join('\n')
}

function readResourceCandidateAttachSource() {
  return [
    'packages/ui/src/components/business/resource/candidate-attach/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/types.ts',
    'packages/ui/src/components/business/resource/candidate-attach/shell/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/candidate/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/controls/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/target/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourceCandidateAttachCss() {
  return [
    'packages/ui/src/components/business/resource/candidate-attach/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/shell/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/candidate/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/controls/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/target/styles.css',
  ].map(readProjectFile).join('\n')
}

function readResourceCss() {
  return [
    'packages/ui/src/components/business/resource/styles.css',
    'packages/ui/src/components/business/resource/asset-card/styles.css',
    'packages/ui/src/components/business/resource/auth-media/styles.css',
  ].map(readProjectFile).join('\n')
}

function readResourceLibraryPickerSource() {
  return [
    'apps/frontend/src/shared/ui/ResourceLibraryPicker.tsx',
    'apps/frontend/src/shared/ui/ResourceLibraryPickerUi.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourceLibraryPickerCss() {
  return readProjectFile('apps/frontend/src/shared/ui/ResourceLibraryPickerUi.css')
}

function readResourceMediaViewerSource() {
  return [
    'packages/ui/src/components/business/resource/media-viewer/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/types.ts',
    'packages/ui/src/components/business/resource/media-viewer/thumb/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/dialog/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/panels/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/text/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourceMediaViewerCss() {
  return [
    'packages/ui/src/components/business/resource/media-viewer/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/thumb/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/dialog/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/panels/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/text/styles.css',
  ].map(readProjectFile).join('\n')
}

function readCanvasToolSource() {
  return [
    'packages/ui/src/components/business/canvas/tool/index.tsx',
    'packages/ui/src/components/business/canvas/tool/types.ts',
    'packages/ui/src/components/business/canvas/tool/action-card/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/helpers.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/header/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/body/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/footer/index.tsx',
    'packages/ui/src/components/business/canvas/tool/badge/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/state.ts',
    'packages/ui/src/components/business/canvas/tool/slot/port-handle/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/row/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/config/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/output-tile/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/empty/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/section-title/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readCanvasToolCss() {
  return [
    'packages/ui/src/components/business/canvas/tool/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/shell/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/header/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/body/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/footer/styles.css',
    'packages/ui/src/components/business/canvas/tool/badge/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/section-title/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/row/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/config/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/output-tile/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/empty/styles.css',
  ].map(readProjectFile).join('\n')
}

function readCanvasToolFullCardSource() {
  return [
    'packages/ui/src/components/business/canvas/tool-full-card/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/types.ts',
    'packages/ui/src/components/business/canvas/tool-full-card/card/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/controls/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/section/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/state/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/media/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/history/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readCanvasToolFullCardCss() {
  return [
    'packages/ui/src/components/business/canvas/tool-full-card/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/card/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/controls/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/section/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/state/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/media/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/history/styles.css',
  ].map(readProjectFile).join('\n')
}

function readCanvasIOSource() {
  return [
    'packages/ui/src/components/business/canvas/io/index.tsx',
    'packages/ui/src/components/business/canvas/io/types.ts',
    'packages/ui/src/components/business/canvas/io/action-card/index.tsx',
    'packages/ui/src/components/business/canvas/io/badge/index.tsx',
    'packages/ui/src/components/business/canvas/io/section/index.tsx',
    'packages/ui/src/components/business/canvas/io/port/index.tsx',
    'packages/ui/src/components/business/canvas/io/meta/index.tsx',
    'packages/ui/src/components/business/canvas/io/state/index.tsx',
    'packages/ui/src/components/business/canvas/io/body/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readCanvasIOCss() {
  return [
    'packages/ui/src/components/business/canvas/io/styles.css',
    'packages/ui/src/components/business/canvas/io/action-card/styles.css',
    'packages/ui/src/components/business/canvas/io/badge/styles.css',
    'packages/ui/src/components/business/canvas/io/section/styles.css',
    'packages/ui/src/components/business/canvas/io/port/styles.css',
    'packages/ui/src/components/business/canvas/io/meta/styles.css',
    'packages/ui/src/components/business/canvas/io/state/styles.css',
    'packages/ui/src/components/business/canvas/io/body/styles.css',
  ].map(readProjectFile).join('\n')
}

function readGenerationInputSource() {
  return [
    'packages/ui/src/components/business/generation/input/index.tsx',
    'packages/ui/src/components/business/generation/input/prompt/index.tsx',
    'packages/ui/src/components/business/generation/input/mention/index.tsx',
    'packages/ui/src/components/business/generation/input/attachment/index.tsx',
    'packages/ui/src/components/business/generation/input/slots/index.tsx',
    'packages/ui/src/components/business/generation/input/params/index.tsx',
    'packages/ui/src/components/business/generation/input/actions/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readGenerationInputCss() {
  return [
    'packages/ui/src/components/business/generation/input/styles.css',
    'packages/ui/src/components/business/generation/input/prompt/styles.css',
    'packages/ui/src/components/business/generation/input/mention/styles.css',
    'packages/ui/src/components/business/generation/input/attachment/styles.css',
    'packages/ui/src/components/business/generation/input/slots/styles.css',
    'packages/ui/src/components/business/generation/input/params/styles.css',
    'packages/ui/src/components/business/generation/input/actions/styles.css',
  ].map(readProjectFile).join('\n')
}

function readGenerationResultSource() {
  return [
    'packages/ui/src/components/business/generation/result/index.tsx',
    'packages/ui/src/components/business/generation/result/status.ts',
    'packages/ui/src/components/business/generation/result/context/index.tsx',
    'packages/ui/src/components/business/generation/result/card/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readGenerationResultCss() {
  return [
    'packages/ui/src/components/business/generation/result/styles.css',
    'packages/ui/src/components/business/generation/result/context/styles.css',
    'packages/ui/src/components/business/generation/result/card/styles.css',
    'packages/ui/src/components/business/generation/result/card/shell/styles.css',
    'packages/ui/src/components/business/generation/result/card/prompt/styles.css',
    'packages/ui/src/components/business/generation/result/card/context/styles.css',
    'packages/ui/src/components/business/generation/result/card/output/styles.css',
    'packages/ui/src/components/business/generation/result/card/debug/styles.css',
  ].map(readProjectFile).join('\n')
}

function readWorkbenchChromeSource() {
  return [
    'packages/ui/src/components/business/workbench/chrome/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/app-shell/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/project-shell/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/decision/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/metric-strip/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/context/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/gate/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readWorkbenchChromeCss() {
  return [
    'packages/ui/src/components/business/workbench/chrome/styles.css',
    'packages/ui/src/components/business/workbench/chrome/app-shell/styles.css',
    'packages/ui/src/components/business/workbench/chrome/project-shell/styles.css',
    'packages/ui/src/components/business/workbench/chrome/decision/styles.css',
    'packages/ui/src/components/business/workbench/chrome/metric-strip/styles.css',
    'packages/ui/src/components/business/workbench/chrome/context/styles.css',
    'packages/ui/src/components/business/workbench/chrome/gate/styles.css',
  ].map(readProjectFile).join('\n')
}

function readWorkbenchCardSource() {
  return [
    'packages/ui/src/components/business/workbench/card/index.tsx',
    'packages/ui/src/components/business/workbench/card/entity/index.tsx',
    'packages/ui/src/components/business/workbench/card/summary/index.tsx',
    'packages/ui/src/components/business/workbench/card/thumbnail/index.tsx',
    'packages/ui/src/components/business/workbench/card/status/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readWorkbenchCardCss() {
  return [
    'packages/ui/src/components/business/workbench/card/styles.css',
    'packages/ui/src/components/business/workbench/card/entity/styles.css',
    'packages/ui/src/components/business/workbench/card/summary/styles.css',
    'packages/ui/src/components/business/workbench/card/thumbnail/styles.css',
    'packages/ui/src/components/business/workbench/card/status/styles.css',
  ].map(readProjectFile).join('\n')
}

function readPrimitiveCss() {
  return [
    'packages/ui/src/components/primitives/styles.css',
    'packages/ui/src/components/primitives/interaction/styles.css',
    'packages/ui/src/components/primitives/surface/styles.css',
    'packages/ui/src/components/primitives/button/styles.css',
    'packages/ui/src/components/primitives/form/styles.css',
    'packages/ui/src/components/primitives/display/styles.css',
    'packages/ui/src/components/primitives/navigation/styles.css',
    'packages/ui/src/components/primitives/overlay/styles.css',
    'packages/ui/src/components/primitives/scroll/styles.css',
    'packages/ui/src/components/primitives/motion/styles.css',
  ].map(readProjectFile).join('\n')
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
  return new RegExp(`\\.${escapedClassName}(?:\\s|,|\\{|:|__|$)`)
}

test('@movscript/ui public imports use narrow entrypoints', () => {
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const rootEntry = readProjectFile('packages/ui/src/index.ts')
  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
  const adminSources = walkFiles('apps/admin/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
  const appCssSources = [
    'apps/frontend/src/index.css',
    'apps/admin/src/styles.css',
  ].map(readProjectFile).join('\n')
  const viteConfigSources = [
    'apps/frontend/electron.vite.config.ts',
    'apps/frontend/vite.e2e.config.ts',
    'apps/admin/vite.config.ts',
  ].map(readProjectFile).join('\n')
  const trackedSystemFiles = execFileSync('git', ['ls-files', '*DS_Store'], { cwd: root, encoding: 'utf8' }).trim()
  const uiPackageSystemFiles = walkFiles('packages/ui', (relativePath) => /(^|\/)(?:\.DS_Store|Thumbs\.db)$/.test(relativePath))

  const requiredExports = [
    './primitives',
    './layout',
    './debug',
    './semantic',
    './style-system',
    './business/agent',
    './business/app',
    './business/canvas',
    './business/generation',
    './business/resource',
    './business/review',
    './business/workbench',
    './styles/base.css',
    './styles/semantic.css',
    './styles/primitives.css',
    './styles/layout.css',
    './styles/business/agent.css',
    './styles/business/app.css',
    './styles/business/canvas.css',
    './styles/business/generation.css',
    './styles/business/resource.css',
    './styles/business/review.css',
    './styles/business/workbench.css',
  ]

  for (const exportPath of requiredExports) {
    assert.ok(packageJson.exports[exportPath], `package export ${exportPath} must exist`)
  }
  assert.equal(packageJson.exports['./business/jobs'], undefined, 'jobs business UI must be app-owned, not a package export')
  assert.equal(packageJson.exports['./styles/business/jobs.css'], undefined, 'jobs CSS must be app-owned, not a package style export')

  assert.equal(packageJson.exports['./business'], undefined, 'package must not expose a root @movscript/ui/business entry')
  assert.equal(packageJson.exports['./business/scripts'], undefined, 'scripts UI is feature-owned and must not be exported from @movscript/ui')
  assert.equal(packageJson.exports['./styles'], undefined, 'package must not expose a root @movscript/ui/styles entry')
  assert.equal(packageJson.exports['./styles/business/scripts.css'], undefined, 'scripts CSS is feature-owned and must not be exported from @movscript/ui')
  assert.doesNotMatch(viteConfigSources, /['"]@movscript\/ui\/business['"]\s*:/, 'Vite aliases must not expose a root @movscript/ui/business entry')
  assert.doesNotMatch(viteConfigSources, /['"]@movscript\/ui\/styles['"]\s*:/, 'Vite aliases must not expose a root @movscript/ui/styles entry')
  assert.doesNotMatch(viteConfigSources, /['"]@movscript\/ui\/business\/jobs['"]\s*:/, 'Vite aliases must not expose app-owned jobs UI')
  assert.doesNotMatch(viteConfigSources, /['"]@movscript\/ui\/styles\/business\/jobs\.css['"]\s*:/, 'Vite aliases must not expose app-owned jobs CSS')
  assert.doesNotMatch(viteConfigSources, /['"]@movscript\/ui\/business\/scripts['"]\s*:/, 'Vite aliases must not expose feature-owned scripts UI')
  assert.doesNotMatch(viteConfigSources, /['"]@movscript\/ui\/styles\/business\/scripts\.css['"]\s*:/, 'Vite aliases must not expose feature-owned scripts CSS')
  assert.match(viteConfigSources, /['"]@movscript\/ui\/business\/agent['"]\s*:/, 'Vite aliases must expose business domain entries explicitly')
  assert.match(viteConfigSources, /['"]@movscript\/ui\/business\/app['"]\s*:/, 'Vite aliases must expose business domain entries explicitly')
  assert.match(viteConfigSources, /['"]@movscript\/ui\/styles\/base\.css['"]\s*:/, 'Vite aliases must expose style file entries explicitly')
  assert.match(viteConfigSources, /['"]@movscript\/ui\/styles\/business\/agent\.css['"]\s*:/, 'Vite aliases must expose style file entries explicitly')
  assert.doesNotMatch(rootEntry, /components\/business/, 'root entry must not export business components')
  assert.equal(rootEntry.includes('./debug'), false, 'root entry must not export browser debug tools')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/styles.css')), false, 'legacy all-in-one UI CSS entry must not exist')
  assert.equal(trackedSystemFiles, '', 'source tree must not track system files')
  assert.deepEqual(uiPackageSystemFiles, [], 'packages/ui source tree must not contain system files')

  for (const relativePath of [...frontendSources, ...adminSources]) {
    const source = readProjectFile(relativePath)
    assert.doesNotMatch(source, /from ['"]@movscript\/ui['"]/, `${relativePath} must import from a narrow @movscript/ui entry`)
    assert.doesNotMatch(source, /export .* from ['"]@movscript\/ui['"]/, `${relativePath} must re-export from a narrow @movscript/ui entry`)
  }

  assert.doesNotMatch(appCssSources, /@movscript\/ui\/styles\.css/, 'apps must not import the all-in-one UI stylesheet')
  assert.match(appCssSources, /@movscript\/ui\/styles\/base\.css/, 'apps must import the UI base stylesheet explicitly')
  assert.match(appCssSources, /@movscript\/ui\/styles\/primitives\.css/, 'apps must import primitive styles explicitly')
  assert.match(appCssSources, /@movscript\/ui\/styles\/semantic\.css/, 'apps must import semantic styles explicitly')
  assert.match(appCssSources, /@movscript\/ui\/styles\/layout\.css/, 'apps must import layout styles explicitly')
})

test('agent identity UI is feature-owned instead of a package business domain', () => {
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const appCssSources = [
    'apps/frontend/src/index.css',
    'apps/admin/src/styles.css',
  ].map(readProjectFile).join('\n')
  const viteConfigSources = [
    'apps/frontend/electron.vite.config.ts',
    'apps/frontend/vite.e2e.config.ts',
    'apps/admin/vite.config.ts',
  ].map(readProjectFile).join('\n')
  const businessBarrel = readProjectFile('packages/ui/src/components/business/index.ts')
  const agentIdentitySource = readProjectFile('apps/frontend/src/features/agent/components/AgentIdentityUi.tsx')
  const agentIdentityCss = readProjectFile('apps/frontend/src/features/agent/components/AgentIdentityUi.css')
  const agentFeatureSources = walkFiles('apps/frontend/src/features/agent/components', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .map(readProjectFile)
    .join('\n')

  assert.equal(packageJson.exports['./business/identity'], undefined)
  assert.equal(packageJson.exports['./styles/business/identity.css'], undefined)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/business/identity.ts')), false)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/styles/business/identity.css')), false)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/identity')), false)
  assert.doesNotMatch(viteConfigSources, /@movscript\/ui\/business\/identity/)
  assert.doesNotMatch(viteConfigSources, /@movscript\/ui\/styles\/business\/identity\.css/)
  assert.doesNotMatch(appCssSources, /@movscript\/ui\/styles\/business\/identity\.css/)
  assert.doesNotMatch(businessBarrel, /export \* as identity/)
  assert.match(agentIdentitySource, /export function IdentityBadge/)
  assert.match(agentIdentitySource, /export function IdentityMark/)
  assert.match(agentIdentitySource, /const identityAssetBasePath = '\/assets\/identity'/)
  assert.match(agentIdentitySource, /import '\.\/AgentIdentityUi\.css'/)
  assert.match(agentIdentityCss, cssClassSelectorPattern('agent-identity-badge'))
  assert.match(agentIdentityCss, cssClassSelectorPattern('agent-identity-mark'))
  assert.match(agentFeatureSources, /from '@\/features\/agent\/components\/AgentIdentityUi'/)
  assert.doesNotMatch(agentFeatureSources, /@movscript\/ui\/business\/identity/)
})

test('packages/ui has an auditable quality gate for package boundaries', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'))
  const auditScript = readProjectFile('scripts/check-ui-package-quality.mjs')

  assert.equal(packageJson.scripts['ui:audit'], 'node scripts/check-ui-package-quality.mjs')
  assert.equal(packageJson.scripts['quality:ui'], 'node scripts/check-ui-package-quality.mjs --check')
  assert.match(auditScript, /UI package quality dashboard/)
  assert.match(auditScript, /businessCssLineCount/)
  assert.match(auditScript, /topBusinessCssFilesByLines/)
  assert.match(auditScript, /businessCssLinesByDomain/)
  assert.match(auditScript, /collectBusinessCssLinesByDomain/)
  assert.match(auditScript, /businessBarrelExportCount/)
  assert.match(auditScript, /businessBarrelHasFlatExports/)
  assert.match(auditScript, /BROWSER_SIDE_EFFECT_PATTERNS/)
  assert.match(auditScript, /SYSTEM_FILE_PATTERN/)
  assert.match(auditScript, /rootEntryExportsBusiness/)
  assert.match(auditScript, /rootEntryExportsDebug/)
})

test('page-level resource UI is accessed through the resources feature wrapper', () => {
  const wrapperSource = readProjectFile('apps/frontend/src/features/resources/components/ResourcePageUi.tsx')
  const dialogUiSource = readProjectFile('apps/frontend/src/features/resources/components/ResourcePageDialogUi.tsx')
  const resourceFeatureUiSource = [
    wrapperSource,
    dialogUiSource,
  ].join('\n')
  const wrapperCss = readResourcePageFeatureCss()
  const resourceFeatureSources = walkFiles('apps/frontend/src/features/resources/components', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .filter((relativePath) => relativePath !== 'apps/frontend/src/features/resources/components/ResourcePageUi.tsx')
  const resourcePackageBarrel = readProjectFile('packages/ui/src/components/business/resource/index.tsx')
  const resourcePackageCss = readProjectFile('packages/ui/src/components/business/resource/styles.css')
  const resourcePagePackageDir = path.join(root, 'packages/ui/src/components/business/resource/page')
  const resourceAssetCandidatePackageDir = path.join(root, 'packages/ui/src/components/business/resource/asset-candidate')
  const agentSettingsFeatureUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsUi.tsx')
  const agentSettingsFeatureUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsUi.css')
  const legacyAgentPageDir = path.join(root, 'packages/ui/src/components/business/agent/page')
  const legacyAgentSettingsDir = path.join(root, 'packages/ui/src/components/business/agent/settings')

  assert.doesNotMatch(wrapperSource, /from '@movscript\/ui\/business\/resource'/)
  assert.match(wrapperSource, /from '@movscript\/ui\/layout'/)
  assert.match(wrapperSource, /from '@movscript\/ui\/primitives'/)
  assert.match(wrapperSource, /from '@\/shared\/ui\/cn'/)
  assert.match(wrapperSource, /import '\.\/ResourcePageUi\.css'/)
  assert.match(wrapperSource, /export \* from '@\/features\/resources\/components\/ResourcePageDialogUi'/)
  assert.match(wrapperCss, /\.resource-page\s*\{/)
  assert.match(wrapperCss, /\.resource-page__filter-bar\s*\{/)
  assert.match(wrapperCss, /\.resource-page__asset-grid\s*\{/)
  assert.match(wrapperSource, /\bResourcePageLayout\b/)
  assert.match(wrapperSource, /\bResourcePageActionButton\b/)
  assert.equal(existsSync(resourcePagePackageDir), false, 'resource page-level UI must not remain in packages/ui')
  assert.equal(existsSync(resourceAssetCandidatePackageDir), false, 'unused resource asset-candidate UI must not remain in packages/ui')
  assert.doesNotMatch(resourcePackageBarrel, /from ['"]\.\/page['"]/, 'resource page module must not be re-exported')
  assert.doesNotMatch(resourcePackageBarrel, /from ['"]\.\/asset-candidate['"]/, 'unused resource asset-candidate module must not be re-exported')
  assert.doesNotMatch(resourcePackageCss, /page\/styles\.css/, 'resource page CSS must not be included in the resource stylesheet')
  assert.doesNotMatch(resourcePackageCss, /asset-candidate\/styles\.css/, 'unused resource asset-candidate CSS must not be included in the resource stylesheet')
  assert.doesNotMatch(resourcePackageBarrel, /\bResourcePage[A-Za-z0-9_]*\b/, 'ResourcePage* page orchestration components must be removed from packages/ui')
  assert.doesNotMatch(resourcePackageBarrel, /\bResourcePrep[A-Za-z0-9_]*\b/, 'ResourcePrep* page-level components must be removed from packages/ui')
  assert.doesNotMatch(resourcePackageBarrel, /\bResourceAssetCandidate[A-Za-z0-9_]*\b|\bResourceAssetDetail[A-Za-z0-9_]*\b/, 'unused resource asset-candidate/detail components must be removed from packages/ui')
  for (const exportName of ['ResourceDialogContent', 'ResourceClipLayout', 'ResourcePermissionSection', 'ResourceFolderTreeItem', 'ResourceContextMenu']) {
    assert.match(resourceFeatureUiSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by resources feature UI`)
    assert.doesNotMatch(resourcePackageBarrel, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be exported from packages/ui resource barrel`)
  }
  for (const selector of ['resource-dialog-content', 'resource-clip-layout', 'resource-permission-section', 'resource-folder-tree-item', 'resource-context-menu']) {
    assert.match(wrapperCss, new RegExp(`\\.${selector}`), `${selector} styles must live with the resources feature wrapper`)
  }
  assert.equal(existsSync(legacyAgentPageDir), false, 'agent page orchestration must be feature-owned')
  assert.equal(existsSync(legacyAgentSettingsDir), false, 'agent settings page composition must be feature-owned')
  assert.match(agentSettingsFeatureUiSource, /export function AgentSettingsPanel/)
  assert.match(agentSettingsFeatureUiCss, /\.agent-settings-shell-panel__body\s*\{/)
  for (const barrelSource of [
    resourcePackageBarrel,
    readProjectFile('packages/ui/src/components/business/index.ts'),
  ]) {
    assert.doesNotMatch(barrelSource, /\bResourcePage[A-Za-z0-9_]*\b/, 'ResourcePage* page orchestration components must not be exported from UI package public barrels')
  }

  for (const relativePath of resourceFeatureSources) {
    const source = readProjectFile(relativePath)
    if (!/\bResourcePage[A-Za-z0-9_]*\b/.test(source)) continue
    for (const match of source.matchAll(/^import\s*\{([^}]*)\}\s*from ['"]@movscript\/ui\/business\/resource['"]/gm)) {
      assert.doesNotMatch(
        match[1],
        /\bResourcePage[A-Za-z0-9_]*\b/,
        `${relativePath} must import ResourcePage* components through the feature-owned ResourcePageUi wrapper`,
      )
    }
    assert.match(
      source,
      /from ['"]@\/features\/resources\/components\/ResourcePageUi['"]/,
      `${relativePath} must import ResourcePage* components through the feature-owned ResourcePageUi wrapper`,
    )
  }
})

test('unused production UI domain is not shipped from packages/ui', () => {
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const frontendCss = readProjectFile('apps/frontend/src/index.css')
  const frontendViteE2eConfig = readProjectFile('apps/frontend/vite.e2e.config.ts')
  const frontendElectronViteConfig = readProjectFile('apps/frontend/electron.vite.config.ts')
  const businessBarrel = readProjectFile('packages/ui/src/components/business/index.ts')
  const uiBusinessSources = walkFiles('packages/ui/src/components/business', (relativePath) => /\.(ts|tsx|css)$/.test(relativePath))
  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx|css)$/.test(relativePath))
  const removedFiles = [
    'packages/ui/src/components/business/production/index.tsx',
    'packages/ui/src/components/business/production/styles.css',
    'packages/ui/src/business/production.ts',
    'packages/ui/src/styles/business/production.css',
  ]

  assert.equal(packageJson.exports['./business/production'], undefined, 'unused production UI must not be a package export')
  assert.equal(packageJson.exports['./styles/business/production.css'], undefined, 'unused production stylesheet must not be a package export')
  assert.doesNotMatch(frontendCss, /@movscript\/ui\/styles\/business\/production\.css/, 'frontend global CSS must not import unused production styles')
  assert.doesNotMatch(frontendViteE2eConfig, /@movscript\/ui\/(?:business|styles\/business)\/production/, 'frontend e2e aliases must not expose unused production UI')
  assert.doesNotMatch(frontendElectronViteConfig, /@movscript\/ui\/(?:business|styles\/business)\/production/, 'frontend electron-vite aliases must not expose unused production UI')
  assert.doesNotMatch(businessBarrel, /\bproduction\b|\.\/production/, 'business barrel must not export unused production UI')

  for (const relativePath of removedFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not remain in packages/ui`)
  }

  for (const relativePath of uiBusinessSources) {
    const source = readProjectFile(relativePath)
    assert.doesNotMatch(
      source,
      /production-page/,
      `${relativePath} must not reintroduce production page styles into packages/ui`,
    )
    assert.doesNotMatch(
      source,
      /production-workspace-review/,
      `${relativePath} must not reintroduce production workspace review styles into packages/ui`,
    )
    assert.doesNotMatch(
      source,
      /production-scene-(?:writing|reference|moment)|production-expression|production-script-/,
      `${relativePath} must not reintroduce unused production feature styles into packages/ui`,
    )
  }

  for (const relativePath of frontendSources) {
    const source = readProjectFile(relativePath)
    assert.doesNotMatch(source, /@movscript\/ui\/business\/production|@movscript\/ui\/styles\/business\/production\.css/, `${relativePath} must not consume unused production UI`)
  }
})

test('unused content and tools UI domains are not shipped from packages/ui', () => {
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const frontendCss = readProjectFile('apps/frontend/src/index.css')
  const frontendViteE2eConfig = readProjectFile('apps/frontend/vite.e2e.config.ts')
  const frontendElectronViteConfig = readProjectFile('apps/frontend/electron.vite.config.ts')
  const businessBarrel = readProjectFile('packages/ui/src/components/business/index.ts')
  const uiBusinessSources = walkFiles('packages/ui/src/components/business', (relativePath) => /\.(ts|tsx|css)$/.test(relativePath))
  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx|css)$/.test(relativePath))
  const removedFiles = [
    'packages/ui/src/components/business/content/index.tsx',
    'packages/ui/src/components/business/content/styles.css',
    'packages/ui/src/components/business/content/filter-bar/index.tsx',
    'packages/ui/src/components/business/content/filter-bar/styles.css',
    'packages/ui/src/components/business/content/workbench/unit-track/index.tsx',
    'packages/ui/src/components/business/content/workbench/unit-track/styles.css',
    'packages/ui/src/business/content.ts',
    'packages/ui/src/styles/business/content.css',
    'packages/ui/src/components/business/tools/index.tsx',
    'packages/ui/src/components/business/tools/styles.css',
    'packages/ui/src/components/business/tools/header/index.tsx',
    'packages/ui/src/components/business/tools/header/styles.css',
    'packages/ui/src/components/business/tools/workspace/index.tsx',
    'packages/ui/src/components/business/tools/workspace/styles.css',
    'packages/ui/src/business/tools.ts',
    'packages/ui/src/styles/business/tools.css',
  ]

  for (const domain of ['content', 'tools']) {
    assert.equal(packageJson.exports[`./business/${domain}`], undefined, `unused ${domain} UI must not be a package export`)
    assert.equal(packageJson.exports[`./styles/business/${domain}.css`], undefined, `unused ${domain} stylesheet must not be a package export`)
  }
  assert.doesNotMatch(frontendCss, /@movscript\/ui\/styles\/business\/(?:content|tools)\.css/, 'frontend global CSS must not import unused content/tools styles')
  assert.doesNotMatch(frontendViteE2eConfig, /@movscript\/ui\/(?:business|styles\/business)\/(?:content|tools)/, 'frontend e2e aliases must not expose unused content/tools UI')
  assert.doesNotMatch(frontendElectronViteConfig, /@movscript\/ui\/(?:business|styles\/business)\/(?:content|tools)/, 'frontend electron-vite aliases must not expose unused content/tools UI')
  assert.doesNotMatch(businessBarrel, /\b(?:content|tools)\b|\.\/(?:content|tools)/, 'business barrel must not export unused content/tools UI')

  for (const relativePath of removedFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not remain in packages/ui`)
  }

  for (const relativePath of uiBusinessSources) {
    const source = readProjectFile(relativePath)
    assert.doesNotMatch(
      source,
      /content-page/,
      `${relativePath} must not reintroduce content page styles into packages/ui`,
    )
    assert.doesNotMatch(
      source,
      /\.(?:tool-header|tool-page-frame|tool-panel|tool-resource|tool-output|tool-action)\b/,
      `${relativePath} must not reintroduce unused tools package styles into packages/ui`,
    )
  }

  for (const relativePath of frontendSources) {
    const source = readProjectFile(relativePath)
    assert.doesNotMatch(source, /@movscript\/ui\/business\/(?:content|tools)|@movscript\/ui\/styles\/business\/(?:content|tools)\.css/, `${relativePath} must not consume unused content/tools UI`)
  }
})

test('unused entity list card UI is not shipped from packages/ui', () => {
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const frontendCss = readProjectFile('apps/frontend/src/index.css')
  const frontendViteE2eConfig = readProjectFile('apps/frontend/vite.e2e.config.ts')
  const frontendElectronViteConfig = readProjectFile('apps/frontend/electron.vite.config.ts')
  const businessBarrel = readProjectFile('packages/ui/src/components/business/index.ts')
  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx|css)$/.test(relativePath))
  const removedFiles = [
    'packages/ui/src/components/business/entity-list-card/index.tsx',
    'packages/ui/src/components/business/entity-list-card/styles.css',
    'packages/ui/src/business/entity-list-card.ts',
    'packages/ui/src/styles/business/entity-list-card.css',
  ]

  assert.equal(packageJson.exports['./business/entity-list-card'], undefined, 'unused entity list card component must not be a package export')
  assert.equal(packageJson.exports['./styles/business/entity-list-card.css'], undefined, 'unused entity list card stylesheet must not be a package export')
  assert.doesNotMatch(frontendCss, /entity-list-card/, 'frontend global CSS must not import unused entity list card styles')
  assert.doesNotMatch(frontendViteE2eConfig, /entity-list-card/, 'frontend e2e aliases must not expose unused entity list card UI')
  assert.doesNotMatch(frontendElectronViteConfig, /entity-list-card/, 'frontend electron-vite aliases must not expose unused entity list card UI')
  assert.doesNotMatch(businessBarrel, /entityListCard|entity-list-card/, 'business barrel must not export unused entity list card UI')

  for (const relativePath of removedFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not remain in packages/ui`)
  }

  for (const relativePath of frontendSources) {
    const source = readProjectFile(relativePath)
    assert.doesNotMatch(source, /@movscript\/ui\/business\/entity-list-card|EntityListCard|entity-list-card/, `${relativePath} must not consume unused entity list card UI`)
  }
})

test('@movscript/ui has explicit theme, primitive, and business component boundaries', () => {
  const requiredFiles = [
    'packages/ui/src/base.css',
    'packages/ui/src/semantic.css',
    'packages/tokens/src/theme.css',
    'packages/theme/src/theme.css',
    'packages/theme/src/index.ts',
    'packages/ui/src/semantic.ts',
    'packages/ui/src/components/primitives/styles.css',
    'packages/ui/src/components/primitives/interaction/styles.css',
    'packages/ui/src/components/primitives/surface/styles.css',
    'packages/ui/src/components/primitives/button/styles.css',
    'packages/ui/src/components/primitives/form/styles.css',
    'packages/ui/src/components/primitives/display/styles.css',
    'packages/ui/src/components/primitives/navigation/styles.css',
    'packages/ui/src/components/primitives/overlay/styles.css',
    'packages/ui/src/components/primitives/scroll/styles.css',
    'packages/ui/src/components/primitives/motion/styles.css',
    'packages/ui/src/components/primitives/button.tsx',
    'packages/ui/src/components/primitives/empty-state.tsx',
    'packages/ui/src/components/primitives/index.ts',
    'packages/ui/src/components/primitives/metric-card.tsx',
    'packages/ui/src/components/primitives/surface.tsx',
    'packages/ui/src/components/primitives/input.tsx',
    'packages/ui/src/components/primitives/key-value.tsx',
    'packages/ui/src/components/primitives/select.tsx',
    'packages/ui/src/components/layout/index.tsx',
    'packages/ui/src/components/layout/styles.css',
    'packages/ui/src/components/layout/app-shell/index.tsx',
    'packages/ui/src/components/layout/app-shell/styles.css',
    'packages/ui/src/components/layout/app-shell/window/index.tsx',
    'packages/ui/src/components/layout/app-shell/window/styles.css',
    'packages/ui/src/components/layout/app-shell/sidebar/index.tsx',
    'packages/ui/src/components/layout/app-shell/sidebar/styles.css',
    'packages/ui/src/components/layout/workspace/index.tsx',
    'packages/ui/src/components/layout/workspace/resize.ts',
    'packages/ui/src/components/layout/workspace/styles.css',
    'packages/ui/src/components/layout/workspace/content-workspace.css',
    'packages/ui/src/components/layout/workspace/overlap-pane.css',
    'packages/ui/src/components/business/index.ts',
    'packages/ui/src/components/business/agent/index.tsx',
    'packages/ui/src/components/business/agent/types.ts',
    'packages/ui/src/components/business/agent/surface-block.tsx',
    'packages/ui/src/components/business/agent/shell/layout/index.tsx',
    'packages/ui/src/components/business/agent/shell/sidebar/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/status/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/tool/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/suggestion/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/context/index.tsx',
    'packages/ui/src/components/business/agent/shell/primitives/inline/index.tsx',
    'packages/ui/src/components/business/agent/styles.css',
    'packages/ui/src/components/business/agent/panel/styles.css',
    'packages/ui/src/components/business/agent/panel/frame/styles.css',
    'packages/ui/src/components/business/agent/shell/styles.css',
    'packages/ui/src/components/business/agent/shell/layout/styles.css',
    'packages/ui/src/components/business/agent/shell/sidebar/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/foundation/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/context/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/tool/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/inline/styles.css',
    'packages/ui/src/components/business/agent/shell/code-block/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/types.ts',
    'packages/ui/src/components/business/agent/activity-feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/feed/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/menu/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/menu/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/round/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/round/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/line/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/line/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/frame/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/frame/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/code/index.tsx',
    'packages/ui/src/components/business/agent/activity-feed/code/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/styles.css',    'packages/ui/src/components/business/agent/diagnostic/card/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/card/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/summary/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/summary/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/entry/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/entry/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/code/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/code/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/badge/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/badge/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/tool/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/tool/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/warnings/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/shell/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/shell/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/task/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/task/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/disclosure/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/item/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/item/styles.css',
    'packages/ui/src/components/business/agent/plan-overview/feedback/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/feedback/styles.css',
    'packages/ui/src/components/business/agent/run-activity/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/styles.css',
    'packages/ui/src/components/business/agent/run-activity/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/disclosure/styles.css',
    'packages/ui/src/components/business/agent/run-activity/item/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/item/styles.css',
    'packages/ui/src/components/business/agent/run-activity/status/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/status/styles.css',
    'packages/ui/src/components/business/agent/run-activity/code/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/code/styles.css',
    'packages/ui/src/components/business/agent/run-activity/notice/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/bubble/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/bubble/styles.css',
    'packages/ui/src/components/business/agent/thread/styles.css',
    'packages/ui/src/components/business/agent/thread/foundation/styles.css',
    'packages/ui/src/components/business/agent/thread/empty/styles.css',
    'packages/ui/src/components/business/agent/thread/tool/styles.css',
    'packages/ui/src/components/business/agent/thread/suggestion/styles.css',
    'packages/ui/src/components/business/agent/run/index.tsx',
    'packages/ui/src/components/business/agent/run/styles.css',
    'packages/ui/src/components/business/agent/run/foundation/styles.css',
    'packages/ui/src/components/business/agent/run/data-block/index.tsx',
    'packages/ui/src/components/business/agent/run/data-block/styles.css',
    'packages/ui/src/components/business/agent/run/code/index.tsx',
    'packages/ui/src/components/business/agent/responsive/styles.css',
    'packages/ui/src/components/business/app/index.tsx',
    'packages/ui/src/components/business/app/styles.css',
    'packages/ui/src/components/business/app/dialog/index.tsx',
    'packages/ui/src/components/business/app/navigation/index.tsx',
    'packages/ui/src/components/business/app/navigation/styles.css',
    'packages/ui/src/components/business/app/surface/index.tsx',
    'packages/ui/src/components/business/app/surface/styles.css',
    'packages/ui/src/components/business/app/surface/section/index.tsx',
    'packages/ui/src/components/business/app/surface/section/styles.css',
    'packages/ui/src/components/business/app/surface/panel/index.tsx',
    'packages/ui/src/components/business/app/surface/panel/styles.css',
    'packages/ui/src/components/business/app/surface/item/index.tsx',
    'packages/ui/src/components/business/app/surface/item/styles.css',
    'packages/ui/src/components/business/app/surface/choice/index.tsx',
    'packages/ui/src/components/business/app/surface/choice/styles.css',
    'packages/ui/src/components/business/app/surface/disclosure/index.tsx',
    'packages/ui/src/components/business/app/surface/disclosure/styles.css',
    'packages/ui/src/components/business/app/display/index.tsx',
    'packages/ui/src/components/business/app/display/styles.css',
    'packages/ui/src/components/business/app/display/controls/index.tsx',
    'packages/ui/src/components/business/app/display/controls/styles.css',
    'packages/ui/src/components/business/app/display/media/index.tsx',
    'packages/ui/src/components/business/app/display/media/styles.css',
    'packages/ui/src/components/business/app/display/progress/index.tsx',
    'packages/ui/src/components/business/app/display/progress/styles.css',
    'packages/ui/src/components/business/app/display/timeline/index.tsx',
    'packages/ui/src/components/business/app/display/timeline/styles.css',
    'packages/ui/src/components/business/app/display/marker/index.tsx',
    'packages/ui/src/components/business/app/display/marker/styles.css',
    'packages/ui/src/components/business/app/display/avatar/index.tsx',
    'packages/ui/src/components/business/app/display/avatar/styles.css',
    'packages/ui/src/components/business/app/display/icon/index.tsx',
    'packages/ui/src/components/business/app/display/icon/styles.css',
    'packages/ui/src/components/business/app/display/skeleton/index.tsx',
    'packages/ui/src/components/business/app/display/skeleton/styles.css',
    'packages/ui/src/components/business/app/display/code/index.tsx',
    'packages/ui/src/components/business/app/display/code/styles.css',
    'packages/ui/src/components/business/app/display/inline-meta/index.tsx',
    'packages/ui/src/components/business/app/display/inline-meta/styles.css',
    'packages/ui/src/components/business/app/data-display/index.tsx',
    'packages/ui/src/components/business/app/data-display/styles.css',
    'packages/ui/src/components/business/app/data-display/key-value/index.tsx',
    'packages/ui/src/components/business/app/data-display/key-value/styles.css',
    'packages/ui/src/components/business/app/data-display/info-block/index.tsx',
    'packages/ui/src/components/business/app/data-display/info-block/styles.css',
    'packages/ui/src/components/business/app/data-display/metric/index.tsx',
    'packages/ui/src/components/business/app/data-display/metric/styles.css',
    'packages/ui/src/components/business/app/data-display/table/index.tsx',
    'packages/ui/src/components/business/app/data-display/table/styles.css',
    'packages/ui/src/components/business/app/state/index.tsx',
    'packages/ui/src/components/business/app/state/styles.css',
    'packages/ui/src/components/business/app/work-mode/index.tsx',
    'packages/ui/src/components/business/app/work-mode/types.ts',
    'packages/ui/src/components/business/app/work-mode/prompt/index.tsx',
    'packages/ui/src/components/business/app/work-mode/prompt/styles.css',
    'packages/ui/src/components/business/app/work-mode/card/index.tsx',
    'packages/ui/src/components/business/app/work-mode/card/styles.css',
    'packages/ui/src/components/business/app/work-mode/switch-guide/index.tsx',
    'packages/ui/src/components/business/app/work-mode/switch-guide/styles.css',
    'packages/ui/src/components/business/app/work-mode/styles.css',
    'packages/ui/src/components/business/app/toast/index.tsx',
    'packages/ui/src/components/business/app/toast/styles.css',
    'packages/ui/src/components/business/canvas/index.tsx',
    'packages/ui/src/components/business/canvas/styles.css',
    'packages/ui/src/components/business/canvas/card/index.tsx',
    'packages/ui/src/components/business/canvas/card/styles.css',
    'packages/ui/src/components/business/canvas/card/types.ts',
    'packages/ui/src/components/business/canvas/card/shell/index.tsx',
    'packages/ui/src/components/business/canvas/card/shell/styles.css',
    'packages/ui/src/components/business/canvas/card/node/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/styles.css',
    'packages/ui/src/components/business/canvas/card/node/handles/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/ports/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/ports/styles.css',
    'packages/ui/src/components/business/canvas/card/node/result/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/result/styles.css',
    'packages/ui/src/components/business/canvas/card/node/prompt/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/prompt/styles.css',
    'packages/ui/src/components/business/canvas/card/node/attachment/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/attachment/styles.css',
    'packages/ui/src/components/business/canvas/card/node/approval/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/approval/styles.css',
    'packages/ui/src/components/business/canvas/card/node/params/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/params/styles.css',
    'packages/ui/src/components/business/canvas/card/surface/index.tsx',
    'packages/ui/src/components/business/canvas/card/surface/styles.css',
    'packages/ui/src/components/business/canvas/card/port/index.tsx',
    'packages/ui/src/components/business/canvas/card/port/styles.css',
    'packages/ui/src/components/business/canvas/card/decision/index.tsx',
    'packages/ui/src/components/business/canvas/card/decision/styles.css',
    'packages/ui/src/components/business/canvas/media/index.tsx',
    'packages/ui/src/components/business/canvas/media/styles.css',
    'packages/ui/src/components/business/canvas/mention/index.tsx',
    'packages/ui/src/components/business/canvas/mention/styles.css',
    'packages/ui/src/components/business/canvas/io/index.tsx',
    'packages/ui/src/components/business/canvas/io/styles.css',
    'packages/ui/src/components/business/canvas/io/types.ts',
    'packages/ui/src/components/business/canvas/io/action-card/index.tsx',
    'packages/ui/src/components/business/canvas/io/action-card/styles.css',
    'packages/ui/src/components/business/canvas/io/badge/index.tsx',
    'packages/ui/src/components/business/canvas/io/badge/styles.css',
    'packages/ui/src/components/business/canvas/io/section/index.tsx',
    'packages/ui/src/components/business/canvas/io/section/styles.css',
    'packages/ui/src/components/business/canvas/io/port/index.tsx',
    'packages/ui/src/components/business/canvas/io/port/styles.css',
    'packages/ui/src/components/business/canvas/io/meta/index.tsx',
    'packages/ui/src/components/business/canvas/io/meta/styles.css',
    'packages/ui/src/components/business/canvas/io/state/index.tsx',
    'packages/ui/src/components/business/canvas/io/state/styles.css',
    'packages/ui/src/components/business/canvas/io/body/index.tsx',
    'packages/ui/src/components/business/canvas/io/body/styles.css',
    'packages/ui/src/components/business/canvas/tool/index.tsx',
    'packages/ui/src/components/business/canvas/tool/styles.css',
    'packages/ui/src/components/business/canvas/tool/types.ts',
    'packages/ui/src/components/business/canvas/tool/action-card/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/helpers.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/header/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/shell/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/header/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/body/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/body/styles.css',
    'packages/ui/src/components/business/canvas/tool/action-card/footer/index.tsx',
    'packages/ui/src/components/business/canvas/tool/action-card/footer/styles.css',
    'packages/ui/src/components/business/canvas/tool/badge/index.tsx',
    'packages/ui/src/components/business/canvas/tool/badge/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/state.ts',
    'packages/ui/src/components/business/canvas/tool/slot/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/port-handle/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/row/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/row/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/config/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/config/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/output-tile/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/output-tile/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/empty/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/empty/styles.css',
    'packages/ui/src/components/business/canvas/tool/slot/section-title/index.tsx',
    'packages/ui/src/components/business/canvas/tool/slot/section-title/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/types.ts',
    'packages/ui/src/components/business/canvas/tool-full-card/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/card/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/card/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/controls/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/controls/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/section/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/section/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/state/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/state/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/media/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/media/styles.css',
    'packages/ui/src/components/business/canvas/tool-full-card/history/index.tsx',
    'packages/ui/src/components/business/canvas/tool-full-card/history/styles.css',
    'packages/ui/src/components/business/generation/index.tsx',
    'packages/ui/src/components/business/generation/styles.css',
    'packages/ui/src/components/business/generation/input/index.tsx',
    'packages/ui/src/components/business/generation/input/styles.css',
    'packages/ui/src/components/business/generation/input/prompt/index.tsx',
    'packages/ui/src/components/business/generation/input/prompt/styles.css',
    'packages/ui/src/components/business/generation/input/mention/index.tsx',
    'packages/ui/src/components/business/generation/input/mention/styles.css',
    'packages/ui/src/components/business/generation/input/attachment/index.tsx',
    'packages/ui/src/components/business/generation/input/attachment/styles.css',
    'packages/ui/src/components/business/generation/input/slots/index.tsx',
    'packages/ui/src/components/business/generation/input/slots/styles.css',
    'packages/ui/src/components/business/generation/input/params/index.tsx',
    'packages/ui/src/components/business/generation/input/params/styles.css',
    'packages/ui/src/components/business/generation/input/actions/index.tsx',
    'packages/ui/src/components/business/generation/input/actions/styles.css',
    'packages/ui/src/components/business/generation/model-selector/index.tsx',
    'packages/ui/src/components/business/generation/model-selector/styles.css',
    'packages/ui/src/components/business/generation/result/index.tsx',
    'packages/ui/src/components/business/generation/result/styles.css',
    'packages/ui/src/components/business/generation/result/status.ts',
    'packages/ui/src/components/business/generation/result/context/index.tsx',
    'packages/ui/src/components/business/generation/result/context/styles.css',
    'packages/ui/src/components/business/generation/result/card/index.tsx',
    'packages/ui/src/components/business/generation/result/card/styles.css',
    'packages/ui/src/components/business/generation/result/card/shell/styles.css',
    'packages/ui/src/components/business/generation/result/card/prompt/styles.css',
    'packages/ui/src/components/business/generation/result/card/context/styles.css',
    'packages/ui/src/components/business/generation/result/card/output/styles.css',
    'packages/ui/src/components/business/generation/result/card/debug/styles.css',
    'packages/ui/src/components/business/resource/index.tsx',
    'packages/ui/src/components/business/resource/styles.css',
    'packages/ui/src/components/business/resource/asset-card/index.tsx',
    'packages/ui/src/components/business/resource/asset-card/styles.css',
    'packages/ui/src/components/business/resource/auth-media/index.tsx',
    'packages/ui/src/components/business/resource/auth-media/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/types.ts',
    'packages/ui/src/components/business/resource/candidate-attach/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/shell/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/shell/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/candidate/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/candidate/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/controls/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/controls/styles.css',
    'packages/ui/src/components/business/resource/candidate-attach/target/index.tsx',
    'packages/ui/src/components/business/resource/candidate-attach/target/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/types.ts',
    'packages/ui/src/components/business/resource/media-viewer/thumb/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/thumb/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/dialog/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/dialog/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/panels/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/panels/styles.css',
    'packages/ui/src/components/business/resource/media-viewer/text/index.tsx',
    'packages/ui/src/components/business/resource/media-viewer/text/styles.css',
    'packages/ui/src/components/business/resource/panel/index.tsx',
    'packages/ui/src/components/business/resource/panel/styles.css',
    'packages/ui/src/components/business/resource/panel/shell/index.tsx',
    'packages/ui/src/components/business/resource/panel/shell/styles.css',
    'packages/ui/src/components/business/resource/panel/controls/index.tsx',
    'packages/ui/src/components/business/resource/panel/controls/styles.css',
    'packages/ui/src/components/business/resource/panel/list/index.tsx',
    'packages/ui/src/components/business/resource/panel/list/styles.css',
    'packages/ui/src/components/business/resource/panel/asset-slot/index.tsx',
    'packages/ui/src/components/business/resource/panel/asset-slot/styles.css',
    'packages/ui/src/components/business/review/index.tsx',
    'packages/ui/src/components/business/review/styles.css',
    'packages/ui/src/components/business/review/types.ts',
    'packages/ui/src/components/business/review/callout/index.tsx',
    'packages/ui/src/components/business/review/callout/styles.css',
    'packages/ui/src/components/business/workbench/index.tsx',
    'packages/ui/src/components/business/workbench/styles.css',
    'packages/ui/src/components/business/workbench/types.ts',
    'packages/ui/src/components/business/workbench/status.ts',
    'packages/ui/src/components/business/workbench/foundation/styles.css',
    'packages/ui/src/components/business/workbench/section/index.tsx',
    'packages/ui/src/components/business/workbench/section/styles.css',
    'packages/ui/src/components/business/workbench/list/index.tsx',
    'packages/ui/src/components/business/workbench/list/styles.css',
    'packages/ui/src/components/business/workbench/card/index.tsx',
    'packages/ui/src/components/business/workbench/card/styles.css',
    'packages/ui/src/components/business/workbench/card/entity/index.tsx',
    'packages/ui/src/components/business/workbench/card/entity/styles.css',
    'packages/ui/src/components/business/workbench/card/summary/index.tsx',
    'packages/ui/src/components/business/workbench/card/summary/styles.css',
    'packages/ui/src/components/business/workbench/card/thumbnail/index.tsx',
    'packages/ui/src/components/business/workbench/card/thumbnail/styles.css',
    'packages/ui/src/components/business/workbench/card/status/index.tsx',
    'packages/ui/src/components/business/workbench/card/status/styles.css',
    'packages/ui/src/components/business/workbench/data-display/index.tsx',
    'packages/ui/src/components/business/workbench/data-display/styles.css',
    'packages/ui/src/components/business/workbench/chrome/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/styles.css',
    'packages/ui/src/components/business/workbench/chrome/app-shell/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/app-shell/styles.css',
    'packages/ui/src/components/business/workbench/chrome/project-shell/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/project-shell/styles.css',
    'packages/ui/src/components/business/workbench/chrome/decision/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/decision/styles.css',
    'packages/ui/src/components/business/workbench/chrome/metric-strip/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/metric-strip/styles.css',
    'packages/ui/src/components/business/workbench/chrome/context/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/context/styles.css',
    'packages/ui/src/components/business/workbench/chrome/gate/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/gate/styles.css',
  ]
  const removedFlatComponentFiles = [
    'packages/ui/src/theme/index.ts',
    'packages/ui/src/theme/semantic.tsx',
    'packages/ui/src/theme/theme.css',
    'packages/ui/src/theme.css',
    'packages/ui/src/components/agent.tsx',
    'packages/ui/src/components/app.tsx',
    'packages/ui/src/components/canvas.tsx',
    'packages/ui/src/components/detail.tsx',
    'packages/ui/src/components/resource.tsx',
    'packages/ui/src/components/review.tsx',
    'packages/ui/src/components/semantic.tsx',
    'packages/ui/src/components/workbench.tsx',
    'packages/ui/src/components/button.tsx',
    'packages/ui/src/components/input.tsx',
    'packages/ui/src/components/select.tsx',
    'packages/ui/src/components/business/workbench/preparation/index.tsx',
    'packages/ui/src/components/business/workbench/preparation/styles.css',
  ]
  const removedCanvasEntityFiles = [
    'apps/frontend/src/components/canvas/CanvasCandidateGroupCard.tsx',
    'apps/frontend/src/components/canvas/CanvasDomainEntityCard.tsx',
    'apps/frontend/src/components/canvas/CanvasEntityActionCard.tsx',
    'packages/ui/src/components/business/canvas/entity/index.tsx',
    'packages/ui/src/components/business/canvas/entity/styles.css',
  ]
  const frontendCss = readProjectFile('apps/frontend/src/index.css')
  const adminCss = readProjectFile('apps/admin/src/styles.css')
  const frontendPackageJson = readProjectFile('apps/frontend/package.json')
  const frontendTsconfig = readProjectFile('apps/frontend/tsconfig.json')
  const frontendViteE2eConfig = readProjectFile('apps/frontend/vite.e2e.config.ts')
  const frontendElectronViteConfig = readProjectFile('apps/frontend/electron.vite.config.ts')
  const adminPackageJson = readProjectFile('apps/admin/package.json')
  const adminTsconfig = readProjectFile('apps/admin/tsconfig.json')
  const adminViteConfig = readProjectFile('apps/admin/vite.config.ts')
  const uiPackageJson = readProjectFile('packages/ui/package.json')
  const uiTsconfig = readProjectFile('packages/ui/tsconfig.json')
  const tokensCss = readProjectFile('packages/tokens/src/theme.css')
  const tokensPackageJson = readProjectFile('packages/tokens/package.json')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const themeIndex = readProjectFile('packages/theme/src/index.ts')
  const themePackageJson = readProjectFile('packages/theme/package.json')
  const themeTsconfig = readProjectFile('packages/theme/tsconfig.json')
  const frontendThemeHook = readProjectFile('apps/frontend/src/features/app-shell/application/useTheme.ts')
  const adminThemeHook = readProjectFile('apps/admin/src/hooks/useTheme.ts')
  const uiIndex = readProjectFile('packages/ui/src/index.ts')
  const uiStyleSystemSource = readProjectFile('packages/ui/src/style-system.ts')
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const uiBaseStyleEntry = readProjectFile('packages/ui/src/styles/base.css')
  const uiPrimitiveStyleEntry = readProjectFile('packages/ui/src/styles/primitives.css')
  const uiSemanticStyleEntry = readProjectFile('packages/ui/src/styles/semantic.css')
  const uiLayoutStyleEntry = readProjectFile('packages/ui/src/styles/layout.css')
  const uiBusinessStyleEntries = [
    'agent',
    'app',
    'canvas',
    'generation',
    'resource',
    'review',
    'workbench',
  ].map((domain) => readProjectFile(`packages/ui/src/styles/business/${domain}.css`)).join('\n')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const allUiCss = walkFiles('packages/ui/src', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const primitiveCssEntry = readProjectFile('packages/ui/src/components/primitives/styles.css')
  const primitiveIndexSource = readProjectFile('packages/ui/src/components/primitives/index.ts')
  const primitiveBadgeSource = readProjectFile('packages/ui/src/components/primitives/badge.tsx')
  const primitiveButtonSource = readProjectFile('packages/ui/src/components/primitives/button.tsx')
  const primitiveSurfaceSource = readProjectFile('packages/ui/src/components/primitives/surface.tsx')
  const primitiveCss = readPrimitiveCss()
  const agentCssEntry = readProjectFile('packages/ui/src/components/business/agent/styles.css')
  const agentPrimitiveCssEntry = readProjectFile('packages/ui/src/components/business/agent/shell/primitives/styles.css')
  const agentCss = readAgentCss()
  const agentPanelSource = readProjectFile('packages/ui/src/components/business/agent/panel.tsx')
  const agentPanelFrameCss = readProjectFile('packages/ui/src/components/business/agent/panel/frame/styles.css')
  const agentChatCss = readAgentChatCss()
  const layoutCss = readProjectFile('packages/ui/src/components/layout/styles.css')
  const appShellLayoutCss = readProjectFile('packages/ui/src/components/layout/app-shell/styles.css')
  const appShellWindowCss = readProjectFile('packages/ui/src/components/layout/app-shell/window/styles.css')
  const workspaceLayoutSource = readProjectFile('packages/ui/src/components/layout/workspace/index.tsx')
  const workspaceResizeSource = readProjectFile('packages/ui/src/components/layout/workspace/resize.ts')
  const workspaceLayoutCss = [
    readProjectFile('packages/ui/src/components/layout/workspace/styles.css'),
    readProjectFile('packages/ui/src/components/layout/workspace/content-workspace.css'),
    readProjectFile('packages/ui/src/components/layout/workspace/overlap-pane.css'),
  ].join('\n')
  const businessAppCss = readAppCss()
  const businessIndexSource = readProjectFile('packages/ui/src/components/business/index.ts')
  const canvasCss = readProjectFile('packages/ui/src/components/business/canvas/styles.css')
  const frontendTypesSource = [
    readProjectFile('apps/frontend/src/types/index.ts'),
    readProjectFile('apps/frontend/src/types/canvas.ts'),
  ].join('\n')
  const canvasNodeDefinitionsSource = readProjectFile('apps/frontend/src/features/canvas/domain/nodeDefinitions.ts')
  const canvasPackageSource = readProjectFile('packages/ui/src/components/business/canvas/index.tsx')
  const canvasCardSource = readProjectFile('packages/ui/src/components/business/canvas/card/index.tsx')
  const canvasCardCss = readProjectFile('packages/ui/src/components/business/canvas/card/styles.css')
  const canvasCardShellSource = readProjectFile('packages/ui/src/components/business/canvas/card/shell/index.tsx')
  const canvasCardShellCss = readProjectFile('packages/ui/src/components/business/canvas/card/shell/styles.css')
  const canvasMediaSource = readProjectFile('packages/ui/src/components/business/canvas/media/index.tsx')
  const canvasMediaCss = readProjectFile('packages/ui/src/components/business/canvas/media/styles.css')
  const canvasResourceShelfUiSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasResourceShelfUi.tsx')
  const canvasResourceShelfUiCss = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasResourceShelfUi.css')
  const canvasResourceShelfPackageDir = path.join(root, 'packages/ui/src/components/business/canvas/resource-shelf')
  const canvasEditorUiSource = [
    readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorUi.tsx'),
    readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorPaletteUi.tsx'),
  ].join('\n')
  const canvasEditorUiCss = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorUi.css')
  const canvasEditorFlowUiSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorFlowUi.tsx')
  const canvasEditorFlowUiCss = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorFlowUi.css')
  const canvasEditorPackageDir = path.join(root, 'packages/ui/src/components/business/canvas/editor')
  const canvasListUiSource = readProjectFile('apps/frontend/src/features/canvas/components/CanvasListUi.tsx')
  const canvasListUiCss = readProjectFile('apps/frontend/src/features/canvas/components/CanvasListUi.css')
  const canvasListPackageDir = path.join(root, 'packages/ui/src/components/business/canvas/list')
  const canvasMentionSource = readProjectFile('packages/ui/src/components/business/canvas/mention/index.tsx')
  const canvasMentionCss = readProjectFile('packages/ui/src/components/business/canvas/mention/styles.css')
  const canvasIOPackageSource = readCanvasIOSource()
  const canvasIOPackageCss = readCanvasIOCss()
  const canvasToolPackageSource = readCanvasToolSource()
  const canvasToolPackageCss = readCanvasToolCss()
  const canvasToolFullCardSource = readCanvasToolFullCardSource()
  const canvasToolFullCardCss = readCanvasToolFullCardCss()
  const semanticEntityInlineEditorSource = readProjectFile('apps/frontend/src/shared/ui/SemanticEntityInlineEditor.tsx')
  const semanticEntityInlineEditorUiSource = readProjectFile('apps/frontend/src/shared/ui/SemanticEntityInlineEditorUi.tsx')
  const semanticEntityInlineEditorUiCss = readProjectFile('apps/frontend/src/shared/ui/SemanticEntityInlineEditorUi.css')
  const generationCss = readProjectFile('packages/ui/src/components/business/generation/styles.css')
  const generationInputSource = readGenerationInputSource()
  const generationInputCss = readGenerationInputCss()
  const generationModelSelectorSource = readProjectFile('packages/ui/src/components/business/generation/model-selector/index.tsx')
  const generationModelSelectorCss = readProjectFile('packages/ui/src/components/business/generation/model-selector/styles.css')
  const generationResultSource = readGenerationResultSource()
  const generationResultCss = readGenerationResultCss()
  const jobsFeatureSource = readJobsSource()
  const jobsDisplayUiSource = readJobsDisplayUiSource()
  const jobsDisplayUiCss = readJobsCss()
  const resourcePackageSource = readProjectFile('packages/ui/src/components/business/resource/index.tsx')
  const resourceAssetCardSource = readProjectFile('packages/ui/src/components/business/resource/asset-card/index.tsx')
  const resourceAssetCardCss = readProjectFile('packages/ui/src/components/business/resource/asset-card/styles.css')
  const resourceCss = readResourceCss()
  const resourceCandidateAttachSource = readResourceCandidateAttachSource()
  const resourceCandidateAttachCss = readResourceCandidateAttachCss()
  const resourceLibraryPickerSource = readResourceLibraryPickerSource()
  const resourceLibraryPickerCss = readResourceLibraryPickerCss()
  const resourceMediaViewerSource = readResourceMediaViewerSource()
  const resourceMediaViewerCss = readResourceMediaViewerCss()
  const resourcePanelPackageSource = readResourcePanelSource()
  const resourcePanelPackageCss = readResourcePanelCss()
  const scriptsPageFeatureSource = readScriptsPageFeatureSource()
  const scriptsPageCss = readScriptsPageFeatureCss()
  const workbenchCss = readProjectFile('packages/ui/src/components/business/workbench/styles.css')
  const workbenchIndexSource = readProjectFile('packages/ui/src/components/business/workbench/index.tsx')
  const workbenchTypesSource = readProjectFile('packages/ui/src/components/business/workbench/types.ts')
  const workbenchStatusSource = readProjectFile('packages/ui/src/components/business/workbench/status.ts')
  const workbenchPanelPath = path.join(root, 'packages/ui/src/components/business/workbench/panel')
  const workbenchChromeSource = readWorkbenchChromeSource()
  const workbenchChromeCss = readWorkbenchChromeCss()
  const workbenchCardCss = readWorkbenchCardCss()

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), true, `${relativePath} must exist`)
  }
  for (const relativePath of removedFlatComponentFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not remain in the flat component root`)
  }
  for (const relativePath of removedCanvasEntityFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not remain because canvas does not support entity nodes`)
  }
  assert.doesNotMatch(frontendTypesSource, /CanvasEntityKind/)
  assert.match(frontendTypesSource, /export type SemanticEntityKind/)
  assert.doesNotMatch(frontendTypesSource, /entityKind\?:/)
  assert.doesNotMatch(frontendTypesSource, /entityId\?:/)
  assert.doesNotMatch(frontendTypesSource, /entityTitle\?:/)
  assert.doesNotMatch(frontendTypesSource, /assetSlotKind\?:/)
  assert.doesNotMatch(canvasNodeDefinitionsSource, /type:\s*['"]entity['"]/)
  assert.doesNotMatch(canvasNodeDefinitionsSource, /semantic groups/)
  assert.match(frontendCss, /@import "@movscript\/theme\/theme\.css";/)
  assert.match(adminCss, /@import "@movscript\/theme\/theme\.css";/)
  for (const cssSource of [frontendCss, adminCss]) {
    assert.match(cssSource, /@import "@movscript\/ui\/styles\/base\.css";/)
    assert.match(cssSource, /@import "@movscript\/ui\/styles\/primitives\.css";/)
    assert.match(cssSource, /@import "@movscript\/ui\/styles\/semantic\.css";/)
    assert.match(cssSource, /@import "@movscript\/ui\/styles\/layout\.css";/)
    assert.doesNotMatch(cssSource, /@import "@movscript\/ui\/styles\.css";/)
  }
  assert.doesNotMatch(frontendCss, /@movscript\/ui\/theme\.css/)
  assert.doesNotMatch(adminCss, /@movscript\/ui\/theme\.css/)
  assert.doesNotMatch(frontendCss, /@movscript\/tokens\/theme\.css/)
  assert.doesNotMatch(adminCss, /@movscript\/tokens\/theme\.css/)
  assert.doesNotMatch(frontendPackageJson, /"@movscript\/tokens":/)
  assert.doesNotMatch(adminPackageJson, /"@movscript\/tokens":/)
  assert.doesNotMatch(frontendTsconfig, /"@movscript\/tokens"/)
  assert.doesNotMatch(adminTsconfig, /"@movscript\/tokens"/)
  assert.doesNotMatch(uiTsconfig, /"@movscript\/tokens"/)
  assert.doesNotMatch(themeTsconfig, /"@movscript\/tokens"/)
  assert.doesNotMatch(frontendViteE2eConfig, /'@movscript\/tokens': resolve\('\.\.\/\.\.\/packages\/tokens\/src\/index\.ts'\)/)
  assert.doesNotMatch(frontendElectronViteConfig, /'@movscript\/tokens': resolve\('\.\.\/\.\.\/packages\/tokens\/src\/index\.ts'\)/)
  assert.doesNotMatch(adminViteConfig, /'@movscript\/tokens': resolve\(__dirname, '\.\.\/\.\.\/packages\/tokens\/src\/index\.ts'\)/)
  assert.doesNotMatch(frontendViteE2eConfig, /@movscript\/tokens\/theme\.css/)
  assert.doesNotMatch(frontendElectronViteConfig, /@movscript\/tokens\/theme\.css/)
  assert.doesNotMatch(adminViteConfig, /@movscript\/tokens\/theme\.css/)
  assert.match(themePackageJson, /"@movscript\/tokens": "workspace:\*"/)
  assert.doesNotMatch(uiPackageJson, /"@movscript\/theme":/)
  assert.doesNotMatch(uiPackageJson, /"@movscript\/tokens":/)
  assert.match(themeCss, /@import "@movscript\/tokens\/theme\.css";/)
  assert.match(themeCss, /--ms-color-background: #000000/)
  assert.match(themeCss, /--ms-color-background: #ffffff/)
  assert.doesNotMatch(themeCss, /--background:/)
  assert.doesNotMatch(themeCss, /--foreground:/)
  assert.doesNotMatch(themeCss, /--card:/)
  assert.doesNotMatch(themeCss, /--primary:/)
  assert.doesNotMatch(themeCss, /--border:/)
  assert.doesNotMatch(themeCss, /\.dark\b/)
  assert.match(themeCss, /\[data-theme="dark"\]/)
  assert.doesNotMatch(themeCss, /\.ms-semantic-/)
  assert.doesNotMatch(themeCss, /\.ms-accent-/)
  assert.doesNotMatch(tokensCss, /--ms-ref-(?:color|shadow)-/)
  assert.doesNotMatch(tokensCss, /--background:/)
  assert.doesNotMatch(tokensCss, /--ms-color-background:/)
  assert.equal(existsSync(path.join(root, 'packages/tokens/src/index.ts')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/tsconfig.json')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.d.ts')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.d.mts')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.js')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.mjs')), false)
  assert.doesNotMatch(tokensPackageJson, /"\."/)
  assert.doesNotMatch(tokensPackageJson, /"dist"/)
  assert.doesNotMatch(tokensPackageJson, /"build"/)
  assert.doesNotMatch(tokensPackageJson, /"typecheck"/)
  assert.doesNotMatch(tokensCss, /--ms-ref-(?:color|shadow)-/)
  assert.doesNotMatch(tokensCss, /--ms-text-(?:value|page-title):/)
  assert.doesNotMatch(themeCss, /var\(--ms-ref-(?:color|shadow)-/)
  assert.doesNotMatch(themeIndex, /\b(?:semanticColorTokens|shadowTokens|accentToneTokens|themeTokens|themeCssEntry)\b/)
  assert.doesNotMatch(themeIndex, /\bMovScript(?:AccentTone|ThemeTokenGroup|ThemeTokens)\b/)
  assert.doesNotMatch(themeIndex, /--ms-(?:color|shadow|accent)-/)
  assert.doesNotMatch(themeIndex, /export const colorTokens\b/)
  assert.match(themeIndex, /initMovScriptTheme/)
  assert.match(themeIndex, /setMovScriptTheme/)
  assert.match(themeIndex, /movScriptThemeStorageKey/)
  assert.doesNotMatch(themeIndex, /semanticToneClass/)
  for (const themeHook of [frontendThemeHook, adminThemeHook]) {
    assert.match(themeHook, /from '@movscript\/theme'/)
    assert.doesNotMatch(themeHook, /movscript-theme/)
    assert.doesNotMatch(themeHook, /localStorage\.(?:getItem|setItem)/)
    assert.doesNotMatch(themeHook, /setAttribute\(['"]data-theme['"]/)
  }
  assert.match(uiSemanticHelperSource, /toneTextClass/)
  assert.match(uiSemanticHelperSource, /toneSurfaceClass/)
  assert.doesNotMatch(uiSemanticHelperSource, /semanticToneClass/)
  assert.doesNotMatch(uiSemanticHelperSource, /semanticStatus(?:Class|Label|Tone)|semanticToneForStatus/)
  assert.doesNotMatch(uiSemanticHelperSource, /from "react"/)
  assert.doesNotMatch(uiSemanticHelperSource, /<Badge\b|BadgeProps|StatusBadge/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/semantic.tsx')), false)
  assert.match(primitiveIndexSource, /\bStatusDot\b/)
  assert.match(primitiveBadgeSource, /export const StatusDot/)
  assert.doesNotMatch(primitiveBadgeSource, /label\?: ReactNode|icon\?: ReactNode/)
  assert.match(uiBaseStyleEntry, /@import "\.\.\/base\.css";/)
  assert.match(uiSemanticStyleEntry, /@import "\.\.\/semantic\.css";/)
  assert.match(uiPrimitiveStyleEntry, /@import "\.\.\/components\/primitives\/styles\.css";/)
  assert.ok(
    frontendCss.indexOf('@import "@movscript/ui/styles/primitives.css";') < frontendCss.indexOf('@import "@movscript/ui/styles/semantic.css";'),
    'semantic tone helpers must load after primitive variants so class helpers can override neutral defaults',
  )
  assert.doesNotMatch(uiPackageJson, /"\.\/theme\.css":/)
  assert.doesNotMatch(uiPackageJson, /"\.\/styles\.css"/)
  assert.match(uiPackageJson, /"\.\/styles\/base\.css": "\.\/src\/styles\/base\.css"/)
  assert.match(uiPackageJson, /"src\/base\.css"/)
  assert.match(uiPackageJson, /"src\/semantic\.css"/)
  assert.match(uiPackageJson, /"src\/components\/primitives\/\*\*\/\*\.css"/)
  assert.doesNotMatch(uiIndex, /@movscript\/theme/)
  assert.match(uiIndex, /export \* from "\.\/semantic"/)
  assert.doesNotMatch(uiIndex, /export \* from "\.\/theme"/)
  assert.match(uiIndex, /export \* from "\.\/components\/primitives"/)
  assert.match(uiIndex, /export \* from "\.\/components\/layout"/)
  assert.doesNotMatch(uiIndex, /export \* from "\.\/components\/business"/)
  assert.doesNotMatch(uiIndex, /from "\.\/components\/(?:primitives|business)\/[^"]+"/)
  assert.match(uiLayoutStyleEntry, /@import "\.\.\/components\/layout\/styles\.css";/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/app\/styles\.css";/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/agent\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/interaction\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/surface\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/button\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/form\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/display\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/navigation\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/overlay\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/scroll\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/motion\/styles\.css";/)
  assert.match(layoutCss, /\.app-page-shell\s*\{/)
  assert.match(layoutCss, /@import "\.\/app-shell\/styles\.css";/)
  assert.doesNotMatch(layoutCss, /\.app-window-header\s*\{/)
  assert.match(appShellLayoutCss, /@import "\.\/window\/styles\.css";/)
  assert.match(appShellLayoutCss, /@import "\.\/sidebar\/styles\.css";/)
  assert.match(appShellWindowCss, /\.app-window-header\s*\{/)
  assert.match(appShellWindowCss, /\.app-window-sidebar-toggle\s*\{/)
  assert.doesNotMatch(frontendCss, /\.app-window-header\s*\{/)
  assert.match(primitiveCss, /\.ms-button\s*\{/)
  assert.match(primitiveCss, /\.ms-button--md\s*\{/)
  assert.doesNotMatch(primitiveCss, /\.ms-button--default/)
  assert.match(primitiveCss, /\.ms-button--solid\.ms-button--tone-brand/)
  assert.match(primitiveCss, /\.ms-button--soft\.ms-button--tone-danger/)
  assert.doesNotMatch(primitiveCss, /\.ms-button--primary/)
  assert.doesNotMatch(primitiveCss, /\.ms-button--secondary/)
  assert.doesNotMatch(primitiveCss, /\.ms-button--destructive/)
  assert.match(primitiveButtonSource, /export type ButtonIntent = UiSemanticIntent/)
  assert.match(primitiveButtonSource, /intent\?: ButtonIntent/)
  assert.match(primitiveButtonSource, /emphasis\?: ButtonEmphasis/)
  assert.match(primitiveButtonSource, /data-ms-intent/)
  assert.match(primitiveButtonSource, /data-ms-emphasis/)
  assert.match(primitiveCss, /\.ms-badge--soft\.ms-badge--tone-neutral/)
  assert.match(primitiveCss, /\.ms-badge--solid\.ms-badge--tone-danger/)
  assert.match(primitiveIndexSource, /StatusBadge/)
  assert.match(primitiveBadgeSource, /export const StatusBadge/)
  assert.match(primitiveBadgeSource, /export type StatusIntent = UiSemanticIntent/)
  assert.match(primitiveBadgeSource, /intent\?: StatusIntent/)
  assert.match(primitiveBadgeSource, /emphasis\?: StatusEmphasis/)
  assert.match(primitiveBadgeSource, /export interface StatusDotProps[\s\S]*intent\?: StatusIntent/)
  assert.match(primitiveBadgeSource, /StatusDot[\s\S]*data-ms-intent/)
  assert.match(primitiveBadgeSource, /visualTone === "neutral" \? "outline" : "soft"/)
  assert.match(primitiveSurfaceSource, /surface\?: SurfaceSemanticRole/)
  assert.match(primitiveSurfaceSource, /intent\?: SurfaceIntent/)
  assert.match(primitiveSurfaceSource, /state\?: SurfaceState/)
  assert.match(primitiveSurfaceSource, /data-surface/)
  assert.match(primitiveSurfaceSource, /data-intent/)
  assert.match(primitiveSurfaceSource, /data-state/)
  assert.doesNotMatch(primitiveCss, /\.ms-badge--primary/)
  assert.doesNotMatch(primitiveCss, /\.ms-badge--secondary/)
  assert.doesNotMatch(primitiveCss, /\.ms-badge--destructive/)
  assert.doesNotMatch(uiStyleSystemSource, /\bui(?:TypographyScale|ColorRoles|RadiusScale|SpaceScale|IconScale|ControlSizes|ComponentCatalog|StyleSystem)\b/)
  assert.doesNotMatch(uiStyleSystemSource, /\bUi(?:StyleSystem|TypographyName|ColorRole)\b/)
  assert.doesNotMatch(`${uiBaseStyleEntry}\n${uiPrimitiveStyleEntry}\n${uiSemanticStyleEntry}\n${uiLayoutStyleEntry}\n${uiBusinessStyleEntries}`, /hsl\(var\(--/)
  assert.doesNotMatch(primitiveCss, /hsl\(var\(--/)
  assert.doesNotMatch(allUiCss, /hsl\(var\(--/)
  assert.doesNotMatch(allUiCss, /var\(--(?:background|foreground|card|popover|primary|secondary|muted-foreground|accent|destructive|border|input|ring)\b/)
  assert.doesNotMatch(`${themeCss}\n${themeIndex}`, /\b(?:agent|canvas|generation|resource|review|project)\b/i)
  assert.match(uiStyleSystemSource, /uiSemanticRecipeAxes/)
  assert.match(uiStyleSystemSource, /surface: \["page", "panel", "card", "muted", "overlay"\]/)
  assert.match(uiStyleSystemSource, /intent: \["neutral", "info", "success", "warning", "danger"\]/)
  assert.match(uiStyleSystemSource, /uiSemanticRecipeContracts/)
  assert.match(uiStyleSystemSource, /props: \["surface", "intent", "emphasis", "state"\]/)
  assert.match(uiStyleSystemSource, /props: \["intent", "emphasis"\]/)
  assert.match(uiStyleSystemSource, /legacyProps: \["variant", "tone"\]/)
  assert.match(uiStyleSystemSource, /owner: "Surface"/)
  assert.match(uiStyleSystemSource, /owner: "StatusBadge"/)
  assert.match(uiStyleSystemSource, /owner: "Button"/)
  assert.match(uiStyleSystemSource, /export type UiSemanticRecipe/)
  assert.match(uiStyleSystemSource, /export type UiStatusRecipe = UiSemanticRecipe<Extract<UiSemanticEmphasis, "soft">>/)
  assert.match(uiStyleSystemSource, /export type UiStatusRecipeIntentMap = Record<string, UiSemanticIntent>/)
  assert.match(uiStyleSystemSource, /export type UiStatusRecipeGroup/)
  assert.match(uiStyleSystemSource, /function createStatusRecipe\(intent: UiSemanticIntent\): UiStatusRecipe/)
  assert.match(uiStyleSystemSource, /export function defineStatusRecipeGroup/)
  assert.match(uiStyleSystemSource, /uiBusinessSemanticExamples/)
  assert.match(uiStyleSystemSource, /defineStatusRecipeGroup\("generation\.status"/)
  assert.doesNotMatch(uiStyleSystemSource, /\buiSemanticSystem\b/)
  assert.match(uiStyleSystemSource, /\bexport\s+default\s+defineStatusRecipeGroup\b/)
  assert.match(uiIndex, /export \* from "\.\/style-system";/)
  assert.match(
    uiPackageJson,
    /"\.\/style-system"\s*:\s*\{[\s\S]*"types"\s*:\s*"\.\/dist\/style-system\.d\.mts"[\s\S]*"import"\s*:\s*"\.\/dist\/style-system\.mjs"/,
  )
  assert.match(frontendElectronViteConfig, /'@movscript\/ui\/style-system': resolve\('\.\.\/\.\.\/packages\/ui\/src\/style-system\.ts'\)/)
  assert.match(frontendViteE2eConfig, /'@movscript\/ui\/style-system': resolve\('\.\.\/\.\.\/packages\/ui\/src\/style-system\.ts'\)/)
  assert.match(frontendElectronViteConfig, /'@movscript\/ui\/semantic': resolve\('\.\.\/\.\.\/packages\/ui\/src\/semantic\.ts'\)/)
  assert.match(frontendViteE2eConfig, /'@movscript\/ui\/semantic': resolve\('\.\.\/\.\.\/packages\/ui\/src\/semantic\.ts'\)/)
  assert.match(uiSemanticCss, /--ui-accent-rgb: 59 130 246/)
  assert.match(uiSemanticCss, /color: rgb\(var\(--ui-accent-rgb\)\)/)
  assert.match(uiSemanticCss, /color: var\(--ms-color-muted-foreground\)/)
  assert.doesNotMatch(uiSemanticCss, /--ui-accent-text\b/)
  assert.match(uiSemanticCss, /background-image: linear-gradient\(to bottom right, rgb\(var\(--ui-accent-rgb\) \/ 0\.20\), rgb\(var\(--ui-accent-rgb\) \/ 0\.08\)\)/)
  assert.doesNotMatch(uiSemanticCss, /--ui-accent-gradient-rgb\b/)
  assert.doesNotMatch(uiSemanticCss, /--ms-accent-[a-z]+-(?:rgb|gradient-rgb|text)\b/)
  assert.doesNotMatch(uiSemanticCss, /--ms-accent-(?:rgb|gradient-rgb|text)\b/)
  assert.doesNotMatch(uiSemanticCss, /--zinc\b/)
  assert.doesNotMatch(uiSemanticHelperSource, /"zinc"/)
  assert.doesNotMatch(uiSemanticCss, /\.dark \.ms-accent/)
  assert.doesNotMatch(uiStyleSystemSource, /legacyVariants:/)
  assert.match(primitiveCss, /\.ms-field-control\s*\{/)
  assert.match(primitiveCss, /\.ms-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-button\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-field-control\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-card\s*\{/)
  assert.match(layoutCss, /\.project-surface-header\s*\{/)
  assert.match(workspaceLayoutSource, /export \* from "\.\/resize"/)
  assert.match(workspaceResizeSource, /export function useResizablePanel/)
  assert.match(workspaceResizeSource, /export function usePersistentOverlapPaneController/)
  assert.match(workspaceLayoutSource, /export function WorkspaceShell/)
  assert.match(workspaceLayoutSource, /export function ContentWorkspaceLayout/)
  assert.match(workspaceLayoutSource, /export function MasterDetail/)
  assert.match(workspaceLayoutCss, /@import "\.\/content-workspace\.css";/)
  assert.match(workspaceLayoutCss, /@import "\.\/overlap-pane\.css";/)
  assert.match(workspaceLayoutCss, /\.app-shell\s*\{/)
  assert.match(workspaceLayoutCss, cssClassSelectorPattern('content-workspace-shell'))
  assert.match(scriptsPageCss, /\.script-workbench-layout\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-page\s*\{/)
  assert.doesNotMatch(uiCss, /\.project-surface-header\s*\{/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/canvas\/styles\.css";/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/generation\/styles\.css";/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/resource\/styles\.css";/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/review\/styles\.css";/)
  assert.doesNotMatch(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/scripts\/styles\.css";/)
  assert.match(uiBusinessStyleEntries, /@import "\.\.\/\.\.\/components\/business\/workbench\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/card\/styles\.css";/)
  assert.doesNotMatch(canvasCss, /@import "\.\/entity\/styles\.css";/)
  assert.doesNotMatch(canvasCss, /@import "\.\/flow\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/io\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/tool\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/shell\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/surface\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/port\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/decision\/styles\.css";/)
  assert.match(canvasCardShellCss, /\.canvas-card-shell\s*\{/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/canvas/flow')), false, 'canvas flow UI must not remain in packages/ui')
  assert.doesNotMatch(canvasPackageSource, /from "\.\/flow"/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasSelectionFrame/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasDropOverlay/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasGroupFrame/)
  assert.match(canvasEditorFlowUiSource, /export const CanvasViewportActionButton/)
  assert.match(canvasEditorFlowUiCss, /\.canvas-flow\s*\{/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/canvas/generation/index.tsx')), false, 'unused canvas generation UI must not remain in packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/canvas/generation/styles.css')), false, 'unused canvas generation CSS must not remain in packages/ui')
  assert.doesNotMatch(canvasCss, /@import "\.\/generation\/styles\.css";|canvas-generation-/)
  assert.doesNotMatch(canvasPackageSource, /CanvasGenerationBody|CanvasGenerationModelOption|from "\.\/generation"/)
  assert.match(canvasCss, /@import "\.\/media\/styles\.css";/)
  assert.match(canvasMediaSource, /export function CanvasMediaFill/)
  assert.match(canvasMediaSource, /"ms-fill canvas-media-fill"/)
  assert.match(canvasMediaSource, /export function CanvasMediaNodeFrame/)
  assert.match(canvasMediaSource, /export function CanvasResourceShelfThumbFrame/)
  assert.doesNotMatch(canvasMediaCss, /\.canvas-media-fill\s*\{[^}]*width:\s*100%/)
  assert.doesNotMatch(canvasMediaCss, /\.canvas-media-fill\s*\{[^}]*height:\s*100%/)
  assert.match(canvasMediaCss, /\.canvas-media-fill\[data-fit="cover"\] > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasMediaCss, /\.canvas-media-fill\[data-fit="contain"\] > \*\s*\{[\s\S]*object-fit:\s*contain/)
  assert.match(canvasMediaCss, /\.canvas-media-node-frame\s*\{[\s\S]*min-height:\s*80px/)
  assert.match(canvasMediaCss, /\.canvas-resource-shelf-thumb-frame\[data-compact="false"\]\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%[\s\S]*min-height:\s*0/)
  assert.equal(existsSync(canvasResourceShelfPackageDir), false, 'canvas resource shelf UI must not remain in packages/ui')
  assert.doesNotMatch(canvasCss, /@import "\.\/resource-shelf\/styles\.css";/)
  assert.doesNotMatch(canvasPackageSource, /from "\.\/resource-shelf"/)
  assert.match(canvasResourceShelfUiSource, /export function CanvasResourceShelfView/)
  assert.match(canvasResourceShelfUiSource, /export const CanvasResourceShelfLazyFrame/)
  assert.match(canvasResourceShelfUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(canvasResourceShelfUiSource, /from "@movscript\/ui\/business\/canvas"/)
  assert.match(canvasResourceShelfUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(canvasResourceShelfUiCss, /\.canvas-resource-shelf\s*\{/)
  assert.match(canvasResourceShelfUiCss, /\.canvas-resource-shelf-card\s*\{/)
  assert.equal(existsSync(canvasEditorPackageDir), false, 'canvas editor UI must not remain in packages/ui')
  assert.doesNotMatch(canvasCss, /@import "\.\/editor\/styles\.css";/)
  assert.doesNotMatch(canvasPackageSource, /from "\.\/editor"/)
  assert.match(canvasEditorUiSource, /export function CanvasEditorShell/)
  assert.match(canvasEditorUiSource, /export const CanvasViewportPane/)
  assert.match(canvasEditorUiSource, /export function CanvasPalettePanel/)
  assert.match(canvasEditorUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(canvasEditorUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(canvasEditorUiCss, /\.canvas-editor\s*\{/)
  assert.match(canvasEditorUiCss, /\.canvas-viewport-overlay-layer\s*\{/)
  assert.match(canvasEditorUiCss, /\.canvas-palette\s*\{/)
  assert.equal(existsSync(canvasListPackageDir), false, 'canvas list UI must not remain in packages/ui')
  assert.doesNotMatch(canvasCss, /@import "\.\/list\/styles\.css";/)
  assert.doesNotMatch(canvasPackageSource, /from "\.\/list"/)
  assert.match(canvasListUiSource, /export function CanvasListShell/)
  assert.match(canvasListUiSource, /export function CanvasListCreateDialog/)
  assert.match(canvasListUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(canvasListUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(canvasListUiCss, /\.canvas-list\s*\{/)
  assert.match(canvasListUiCss, /\.canvas-list-create-dialog\s*\{/)
  assert.match(canvasCss, /@import "\.\/mention\/styles\.css";/)
  assert.match(canvasMentionSource, /canvasMentionChipClassNames/)
  assert.match(canvasMentionCss, /\.canvas-mention-chip\s*\{/)
  assert.match(canvasMentionCss, /\.canvas-mention-chip__media\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasMentionCss, /\.canvas-mention-chip__label\s*\{[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(canvasIOPackageSource, /export function CanvasIOPortRow/)
  assert.match(canvasIOPackageSource, /export function CanvasIOStateTile/)
  assert.match(canvasIOPackageCss, /\.canvas-io-port-row\s*\{/)
  assert.match(canvasToolPackageSource, /export function CanvasToolSourceBadge/)
  assert.match(canvasToolPackageSource, /export function CanvasToolStatusBadge/)
  assert.match(canvasToolPackageCss, /\.canvas-tool-source-badge\s*\{/)
  assert.match(canvasCss, /@import "\.\/tool-full-card\/styles\.css";/)
  assert.match(canvasToolFullCardSource, /export function CanvasToolFullCard/)
  assert.match(canvasToolFullCardSource, /export function CanvasToolFullHistoryItem/)
  assert.match(canvasToolFullCardSource, /export function CanvasToolFullModelSelect/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-card\s*\{/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-output > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-output--history > \*\s*\{[\s\S]*height:\s*128px/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-output--current > \*\s*\{[\s\S]*height:\s*288px/)
  assert.match(canvasCardSource, /CanvasCardShell/)
  assert.match(canvasCardShellSource, /export function CanvasCardShell/)
  assert.doesNotMatch(uiCss, /\.canvas-card-shell\s*\{/)
  assert.doesNotMatch(uiCss, /\.canvas-flow\s*\{/)
  assert.match(businessAppCss, /\.app-surface-item\s*\{/)
  assert.match(businessAppCss, /\.app-choice-tile\s*\{/)
  assert.match(businessAppCss, /\.app-window-icon-button\s*\{/)
  assert.match(businessAppCss, /\.app-pager\s*\{/)
  assert.match(businessAppCss, /\.onboarding-switch-guide\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-surface-item\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-choice-tile\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-window-icon-button\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-pager\s*\{/)
  assert.doesNotMatch(uiCss, /\.projects-region\s*\{/)
  assert.doesNotMatch(uiCss, /\.projects-list-row\s*\{/)
  assert.doesNotMatch(uiCss, /\.onboarding-switch-guide\s*\{/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/detail')), false, 'detail UI must be owned by SemanticEntityInlineEditorUi')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/business/detail.ts')), false, 'detail entry must not remain in @movscript/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/styles/business/detail.css')), false, 'detail style entry must not remain in @movscript/ui')
  assert.doesNotMatch(frontendCss, /@movscript\/ui\/styles\/business\/detail\.css/)
  assert.doesNotMatch(frontendElectronViteConfig, /@movscript\/ui\/business\/detail|@movscript\/ui\/styles\/business\/detail\.css/)
  assert.doesNotMatch(frontendViteE2eConfig, /@movscript\/ui\/business\/detail|@movscript\/ui\/styles\/business\/detail\.css/)
  assert.doesNotMatch(adminViteConfig, /@movscript\/ui\/business\/detail|@movscript\/ui\/styles\/business\/detail\.css/)
  assert.match(semanticEntityInlineEditorSource, /from '@\/shared\/ui\/SemanticEntityInlineEditorUi'/)
  assert.match(semanticEntityInlineEditorUiSource, /export function DetailEntityFieldControl/)
  assert.match(semanticEntityInlineEditorUiSource, /export function DetailEntitySourceLockNotice/)
  assert.match(semanticEntityInlineEditorUiSource, /export function DetailEntityHorizontalRail/)
  assert.doesNotMatch(semanticEntityInlineEditorUiSource, /DetailEntityDialogShell/)
  assert.match(semanticEntityInlineEditorUiCss, /\.detail-entity-field__control\s*\{/)
  assert.match(semanticEntityInlineEditorUiCss, /\.detail-entity-editor-hero\s*\{/)
  assert.doesNotMatch(businessIndexSource, /export \* as detail from "\.\/detail";/)
  assert.match(businessIndexSource, /export \* as generation from "\.\/generation";/)
  assert.doesNotMatch(businessIndexSource, /export \* as jobs from "\.\/jobs";/)
  assert.match(businessIndexSource, /export \* as resource from "\.\/resource";/)
  assert.doesNotMatch(businessIndexSource, /export \* as scripts from "\.\/scripts";/)
  assert.match(businessIndexSource, /export \* as workbench from "\.\/workbench";/)
  assert.doesNotMatch(businessIndexSource, /\b(?:DetailEntityFieldControl|GenerationResultCard|JobsPageShell|ResourcePanelShell|ToolPageFrame|ScriptDetailHeader|WorkbenchPanel)\b/)
  assert.doesNotMatch(uiCss, /\.detail-header\s*\{/)
  assert.match(generationCss, /@import "\.\/input\/styles\.css";/)
  assert.match(generationCss, /@import "\.\/model-selector\/styles\.css";/)
  assert.match(generationCss, /@import "\.\/result\/styles\.css";/)
  assert.match(generationInputSource, /export function GenerationInputRoot/)
  assert.match(generationInputSource, /GenerationPromptEditor/)
  assert.match(generationInputSource, /GenerationAttachmentTag/)
  assert.match(generationInputSource, /GenerationInputSlotCard/)
  assert.match(generationInputSource, /GenerationSlotList[\s\S]*?"ms-stack generation-input-slots"/)
  assert.match(generationInputSource, /GenerationInputSlotCard[\s\S]*?"ms-stack generation-input-slot"/)
  assert.match(generationInputSource, /GenerationInputSlotCard[\s\S]*?className="ms-action-row generation-input-slot__header"/)
  assert.match(generationInputSource, /GenerationInputSlotCard[\s\S]*?className="ms-text-truncate ms-type-label generation-input-slot__label"/)
  assert.match(generationInputSource, /GenerationInputSlotCard[\s\S]*?className="ms-type-caption generation-input-slot__meta"/)
  assert.match(generationInputSource, /GenerationSlotAttachmentList[\s\S]*?"ms-action-row generation-input-slot__attachments"/)
  assert.match(generationInputSource, /GenerationSlotAttachmentTag[\s\S]*?className="ms-text-truncate generation-input-slot-tag__label"/)
  assert.match(generationInputSource, /GenerationSlotEmpty[\s\S]*?"ms-action-row ms-type-caption generation-input-slot__empty"/)
  assert.match(generationInputSource, /GenerationSlotEmpty[\s\S]*?className="ms-inline-center generation-input-slot__empty-icon"/)
  assert.match(generationInputSource, /GenerationActionBar/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/index.tsx'), /export \* from "\.\/prompt";/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/index.tsx'), /export \* from "\.\/actions";/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/styles.css'), /@import "\.\/prompt\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/styles.css'), /@import "\.\/slots\/styles\.css";/)
  assert.match(generationInputCss, /\.generation-input\s*\{/)
  assert.match(generationInputCss, /\.generation-input-slot\s*\{/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__label\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__label\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__label\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__(?:meta|empty)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__(?:meta|empty)\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__attachments\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot-tag__label\s*\{[^}]*white-space/)
  assert.doesNotMatch(generationInputCss, /\.generation-input-slot__empty\s*\{[^}]*display:\s*inline-flex/)
  assert.match(generationModelSelectorSource, /export function GenerationModelSelector/)
  assert.match(generationModelSelectorSource, /\bSelectTrigger\b/)
  assert.match(generationModelSelectorSource, /\bButton\b/)
  assert.match(generationModelSelectorCss, /\.generation-model-selector\s*\{/)
  assert.match(generationResultSource, /export function GenerationResultCard/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-center generation-result-card__state generation-result-card__state--loading"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?className="ms-stack ms-type-label generation-result-card__state-content"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-center ms-type-body generation-result-card__error"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-center ms-action-row ms-type-body generation-result-card__state generation-result-card__state--cancelled"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?className="ms-action-row generation-result-card__prompt-header"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?className="ms-action-row generation-result-card__status-row"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?className="ms-type-tiny generation-result-card__status"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?className="ms-action-row generation-result-card__actions"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-text-truncate ms-type-caption generation-result-card__timestamp"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-type-body generation-result-card__prompt-text"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-type-label generation-result-card__prompt-text--compact"/)
  assert.match(generationResultSource, /GenerationResultCard[\s\S]*?"ms-text-truncate ms-type-label generation-result-card__timestamp generation-result-card__timestamp--standalone"/)
  assert.doesNotMatch(generationResultSource, /className="ms-stack type-label generation-result-card__state-content"/)
  assert.match(generationResultSource, /export function GenerationInlineResourceChip/)
  assert.match(generationResultSource, /export function GenerationContextSummary/)
  assert.match(generationResultSource, /export function GenerationContextRow/)
  assert.match(generationResultSource, /GenerationInlineResourceChip[\s\S]*?"ms-text-truncate generation-result-resource-chip__label"/)
  assert.match(generationResultSource, /GenerationContextSummary[\s\S]*?"ms-stack type-caption generation-result-context-summary"/)
  assert.match(generationResultSource, /GenerationContextRow[\s\S]*?"ms-action-row generation-result-context-row"/)
  assert.match(generationResultSource, /GenerationContextRow[\s\S]*?"ms-inline-center generation-result-context-row__icon"/)
  assert.match(generationResultSource, /GenerationContextValue[\s\S]*?"ms-text-truncate generation-result-context-row__value"/)
  assert.match(generationResultSource, /GenerationContextValueList[\s\S]*?"ms-action-row generation-result-context-row__values"/)
  assert.match(generationResultSource, /export function generationResultStatusIntent/)
  assert.match(generationResultSource, /<StatusBadge\b[\s\S]*?intent=\{generationResultStatusIntent\(status\)\}/)
  assert.doesNotMatch(generationResultSource, /generationResultStatusTone/)
  assert.doesNotMatch(generationResultSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(generationResultCss, /\.generation-result-card\s*\{/)
  assert.match(generationResultCss, /\.generation-result-resource-chip\s*\{/)
  assert.match(generationResultCss, /\.generation-result-context-summary\s*\{/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-resource-chip__label\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-context-summary\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-context-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-context-row__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-context-row__value\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-context-row__values\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__prompt-header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__status-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__actions\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__status\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__timestamp\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__timestamp\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__timestamp--standalone\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__prompt-text\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__prompt-text\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__prompt-text--compact\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__prompt-text--compact\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__state\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__state-content\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__state-content\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__error\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__error\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__error--compact\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__state--cancelled\s*\{[^}]*font-size:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__state--cancelled\s*\{[^}]*line-height:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__error\s*\{[^}]*justify-content:/)
  assert.doesNotMatch(generationResultCss, /\.generation-result-card__media > \*\s*\{/)
  assert.doesNotMatch(jobsFeatureSource, /@movscript\/ui\/business\/jobs/)
  assert.doesNotMatch(jobsDisplayUiSource, /export function JobsPageShell/)
  assert.match(jobsDisplayUiSource, /export function JobCardShell/)
  assert.match(jobsDisplayUiSource, /export function JobDetailPanel/)
  assert.match(jobsDisplayUiSource, /export function JobStatusBadge/)
  assert.doesNotMatch(jobsDisplayUiCss, /\.jobs-page-shell\s*\{/)
  assert.match(jobsDisplayUiCss, /\.job-card\s*\{/)
  assert.match(jobsDisplayUiCss, /\.job-detail-panel\s*\{/)
  assert.match(resourceCss, /@import "\.\/asset-card\/styles\.css";/)
  assert.doesNotMatch(resourceCss, /@import "\.\/setting\/styles\.css";/)
  assert.doesNotMatch(resourceCss, /@import "\.\/attachments\/styles\.css";/)
  assert.doesNotMatch(resourceCss, /@import "\.\/library-picker\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/media-viewer\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/panel\/styles\.css";/)
  assert.doesNotMatch(resourceCss, /@import "\.\/preview-drawer\/styles\.css";/)
  assert.doesNotMatch(resourceCss, /@import "\.\/script-reference\/styles\.css";/)
  assert.match(resourceCss, /\.resource-asset-card\s*\{/)
  assert.match(resourceAssetCardSource, /className=\{cn\("ms-stack resource-asset-card"/)
  assert.match(resourceAssetCardSource, /className="ms-action-row resource-asset-card__name-row"/)
  assert.match(resourceAssetCardSource, /className="ms-inline-center resource-asset-card__type-icon"/)
  assert.match(resourceAssetCardSource, /className="ms-text-truncate ms-type-label resource-asset-card__name"/)
  assert.match(resourceAssetCardSource, /className="ms-action-row resource-asset-card__meta-row"/)
  assert.match(resourceAssetCardSource, /className="ms-type-label resource-asset-card__size"/)
  assert.match(resourceAssetCardSource, /className="ms-text-truncate ms-type-label resource-asset-card__owner"/)
  assert.match(resourceAssetCardSource, /"ms-center resource-asset-card__select-control"/)
  assert.match(uiCss, /\.ms-fill\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/)
  assert.match(readProjectFile('apps/frontend/src/features/resources/components/ResourcePageUi.tsx'), /ms-fill ms-center resource-asset-card__fallback/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__fallback\s*\{[^}]*width:\s*100%/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__fallback\s*\{[^}]*height:\s*100%/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__name-row\s*\{[^}]*color:/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__name\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__name\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__size,\n\.resource-asset-card__owner\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__owner\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__type-icon\s*\{[^}]*flex-shrink:\s*0/)
  assert.doesNotMatch(resourceAssetCardCss, /\.resource-asset-card__select-control\s*\{[^}]*justify-content:/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateAttachShell[\s\S]*?cn\("ms-stack resource-candidate-attach"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateAttachHeader[\s\S]*?className="ms-action-row resource-candidate-attach__title-row"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateAttachHeader[\s\S]*?className="ms-type-caption resource-candidate-attach__title"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateAttachHeader[\s\S]*?className="ms-type-tiny resource-candidate-attach__count"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateAttachMessage[\s\S]*?"ms-type-tiny resource-candidate-attach__message"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateAttachFooter[\s\S]*?"ms-action-row resource-candidate-attach__footer"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateEmpty[\s\S]*?"ms-type-tiny resource-candidate-attach__empty"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateItem[\s\S]*?className="ms-action-row resource-candidate-item__row"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateItem[\s\S]*?"ms-text-truncate ms-type-tiny resource-candidate-item__name"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateItem[\s\S]*?"ms-type-tiny resource-candidate-item__badge"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateItem[\s\S]*?"ms-text-truncate ms-type-tiny resource-candidate-item__meta"/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach__title-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach__count\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach__message\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach__footer\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-attach__empty\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-item__row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-item__badge\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-item__name\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-item__name\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-item__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-item__meta\s*\{[^}]*text-overflow:/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateTargetEmpty[\s\S]*?"ms-type-tiny resource-candidate-target-empty"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateTargetItem[\s\S]*?"ms-text-truncate ms-type-tiny resource-candidate-target-item__title"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateTargetItem[\s\S]*?"ms-text-truncate ms-type-tiny resource-candidate-target-item__id"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateTargetItem[\s\S]*?"ms-text-truncate ms-type-tiny resource-candidate-target-item__meta"/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateSelectedTarget[\s\S]*?"ms-text-truncate ms-type-tiny resource-candidate-selected-target__title"/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-target-empty\s*\{[^}]*font-size:/)
  assert.match(resourceCandidateAttachSource, /ResourceCandidateTargetItem[\s\S]*?className="ms-action-row resource-candidate-target-item__row"/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-target-item__row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-target-item__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-target-item__title\s*\{[^}]*white-space:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-target-item__(?:title|meta|description),[\s\S]*?text-overflow:\s*ellipsis/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-selected-target__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceCandidateAttachCss, /\.resource-candidate-selected-target__title\s*\{[^}]*white-space:/)
  assert.match(resourcePanelPackageSource, /export function ResourcePanelShell/)
  assert.match(resourcePanelPackageSource, /export const ResourceListItemShell/)
  assert.match(resourcePanelPackageSource, /ResourcePanelList[\s\S]*?"ms-grid-stack resource-panel-list"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelTabButton[\s\S]*?"ms-type-label resource-panel__tab"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelSearchField[\s\S]*?"ms-inline-center resource-panel-search__icon"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelSearchField[\s\S]*?"ms-type-label resource-panel-search__input"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelSegmentButton[\s\S]*?"ms-type-caption resource-panel-segments__button"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelSelect[\s\S]*?"ms-type-label resource-panel__select"/)
  assert.match(resourcePanelPackageSource, /ResourceListItemShell[\s\S]*?"ms-action-row resource-panel-list-item"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelThumbFallback[\s\S]*?"ms-fill ms-center resource-panel-thumb__fallback"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelItemName[\s\S]*?"ms-text-truncate ms-type-label resource-panel-list-item__name"/)
  assert.match(resourcePanelPackageSource, /ResourcePanelSelectedLabel[\s\S]*?"ms-type-tiny resource-panel-list-item__selected"/)
  assert.match(resourcePanelPackageSource, /ResourceAssetSlotHeader[\s\S]*?"ms-action-row resource-panel-asset-slot__header"/)
  assert.match(resourcePanelPackageSource, /ResourceAssetSlotTitle[\s\S]*?"ms-text-truncate ms-type-label resource-panel-asset-slot__title"/)
  assert.match(resourcePanelPackageSource, /ResourceAssetSlotMeta[\s\S]*?"ms-text-truncate ms-type-tiny resource-panel-asset-slot__meta"/)
  assert.match(resourcePanelPackageCss, /\.resource-panel\s*\{/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-list\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel__tab\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-search__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-search__input\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-segments\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-segments__button\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel__select\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-list-item\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-thumb__fallback\s*\{[^}]*align-items:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-thumb__fallback\s*\{[^}]*width:\s*100%/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-thumb__fallback\s*\{[^}]*height:\s*100%/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-list-item__name\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-list-item__name\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-list-item__selected\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__header\s*\{[^}]*align-items:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__title,\n\.resource-panel-asset-slot__meta\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourcePanelPackageCss, /\.resource-panel-asset-slot__meta\s*\{[^}]*line-height:/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/resource/attachments')), false, 'unused resource attachment UI must not remain in packages/ui')
  assert.doesNotMatch(resourcePackageSource, /from "\.\/attachments"/)
  assert.doesNotMatch(resourcePackageSource, /\bResourceAttachment(?:ActionTile|Fallback|Grid|HiddenInput|RemoveButton|Root|Tile)\b/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/resource/setting')), false, 'unused resource setting card UI must not remain in packages/ui')
  assert.doesNotMatch(resourcePackageSource, /from "\.\/setting"/)
  assert.doesNotMatch(resourcePackageSource, /\b(?:SettingCard|settingKindMeta|settingStatusMeta|normalizeSettingKind|normalizeSettingStatus|SettingCardData|SettingCardKind|SettingCardStatus)\b/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/resource/preview-drawer')), false, 'unused resource preview drawer UI must not remain in packages/ui')
  assert.doesNotMatch(resourcePackageSource, /from "\.\/preview-drawer"/)
  assert.doesNotMatch(resourcePackageSource, /\bResourcePreview(?:Drawer|Tree|Story|Missing|Mobile|Stats|State|Empty|Frame|Root)/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/resource/script-reference')), false, 'unused resource script reference UI must not remain in packages/ui')
  assert.doesNotMatch(resourcePackageSource, /from "\.\/script-reference"/)
  assert.doesNotMatch(resourcePackageSource, /\bResourceScriptReference(?:Panel|Item|Trigger|Header|Selector|Content)\b/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/resource/library-picker')), false, 'resource library picker UI must be shared app-owned')
  assert.doesNotMatch(resourcePackageSource, /from "\.\/library-picker"/)
  assert.match(resourceLibraryPickerCss, /\.resource-library-picker\s*\{/)
  assert.match(resourceLibraryPickerSource, /export function ResourceLibraryPickerPanel/)
  assert.match(resourceLibraryPickerSource, /from ['"]@\/shared\/ui\/ResourceLibraryPickerUi['"]/)
  assert.match(resourceLibraryPickerSource, /from ['"]@movscript\/ui\/business\/app['"]/)
  assert.match(resourceLibraryPickerSource, /from ['"]@movscript\/ui\/business\/workbench['"]/)
  assert.match(readProjectFile('apps/frontend/src/features/resources/components/ResourcePageUi.tsx'), /ms-center resource-asset-card__fallback/)
  assert.match(resourceMediaViewerSource, /export function ResourceMediaDialog/)
  assert.match(resourceMediaViewerSource, /ResourceMediaDialog[\s\S]*?"ms-stack resource-media-dialog"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaDialog[\s\S]*?className="ms-center resource-media-dialog__content"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaDialog[\s\S]*?className="ms-action-row resource-media-dialog__header"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaDialog[\s\S]*?className="ms-text-truncate ms-type-body resource-media-dialog__title"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaStage[\s\S]*?"ms-center resource-media-stage"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaAudioPanel[\s\S]*?className="ms-action-row resource-media-audio-panel__title"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaAudioPanel[\s\S]*?className="ms-text-truncate ms-type-body"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaFallbackPanel[\s\S]*?className="ms-type-body"/)
  assert.match(resourceMediaViewerSource, /export function ResourceMediaThumb/)
  assert.match(resourceMediaViewerSource, /ResourceMediaHoverOverlay[\s\S]*?"ms-center resource-media-hover-overlay"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaHoverOverlay[\s\S]*?"ms-inline-center resource-media-hover-overlay__icon"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaFillFrame[\s\S]*?"ms-fill ms-center resource-media-fill-frame"/)
  assert.match(resourceMediaViewerSource, /export function ResourceMediaTextPreviewPanel/)
  assert.match(resourceMediaViewerSource, /ResourceMediaTextThumb[\s\S]*?className="ms-action-row resource-media-text-thumb__header"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaTextThumb[\s\S]*?className="ms-text-truncate ms-type-tiny"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaTextPreviewPanel[\s\S]*?className="ms-center ms-type-body resource-media-text-preview__loading"/)
  assert.match(resourceMediaViewerSource, /ResourceMediaCodeBlock[\s\S]*?variant === "thumb" \? "ms-type-tiny" : "ms-type-body"/)
  assert.match(resourceMediaViewerCss, /\.resource-media-dialog\s*\{/)
  assert.match(resourceMediaViewerCss, /\.resource-media-thumb\s*\{/)
  assert.match(resourceMediaViewerCss, /\.resource-media-stage\s*\{/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-dialog\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-dialog__content\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-dialog__title\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-dialog__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-dialog__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-audio-panel__title\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-audio-panel__title > span\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-audio-panel__title > span\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-fallback-panel > p\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-fallback-panel > p\s*\{[^}]*line-height:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-text-thumb__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-text-thumb__header > span\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-text-thumb__header > span\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-text-preview__loading\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-text-preview__loading\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-code--(?:thumb|preview)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-code--(?:thumb|preview)\s*\{[^}]*line-height:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-stage\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-fill-frame\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-hover-overlay\s*\{[^}]*display:\s*flex/)
  assert.match(readProjectFile('apps/frontend/src/shared/ui/MediaViewer.tsx'), /className="ms-stack ms-center resource-media-video-placeholder"[\s\S]*?className="ms-text-truncate ms-type-caption"[\s\S]*?className="ms-type-tiny"/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-video-placeholder\s*\{[^}]*width:\s*100%/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-video-placeholder\s*\{[^}]*height:\s*100%/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-video-placeholder\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-video-placeholder\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-video-placeholder > span\s*\{[^}]*font-size:/)
  assert.doesNotMatch(resourceMediaViewerCss, /\.resource-media-video-placeholder > small\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCss, /\.resource-asset-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.tool-header\s*\{/)
  assert.doesNotMatch(uiCss, /\.tool-page-frame\s*\{/)
  assert.match(scriptsPageFeatureSource, /export function ScriptDetailHeader/)
  assert.match(scriptsPageFeatureSource, /export function ScriptDetailTabs/)
  assert.match(scriptsPageFeatureSource, /export function ScriptVersionCard/)
  assert.match(scriptsPageCss, /\.script-detail-header\s*\{/)
  assert.match(scriptsPageCss, /\.script-detail-tabs\s*\{/)
  assert.match(scriptsPageCss, /\.script-version-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.script-detail-header\s*\{/)
  assert.doesNotMatch(uiCss, /\.script-detail-tabs\s*\{/)
  assert.doesNotMatch(uiCss, /\.script-version-card\s*\{/)
  assert.match(workbenchCss, /@import "\.\/foundation\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/section\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/list\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/card\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/data-display\/styles\.css";/)
  assert.doesNotMatch(workbenchCss, /preparation\/styles\.css/)
  assert.match(workbenchCss, /@import "\.\/chrome\/styles\.css";/)
  assert.doesNotMatch(workbenchCss, /@import "\.\/scene-preview\/styles\.css";/)
  assert.equal(existsSync(workbenchPanelPath), false, 'unused WorkbenchPanel wrapper must not remain in packages/ui')
  assert.doesNotMatch(workbenchIndexSource, /\bWorkbenchPanel\b/)
  assert.match(workbenchIndexSource, /WorkbenchAppShell/)
  assert.match(workbenchIndexSource, /WorkbenchAppTabBar/)
  assert.match(workbenchIndexSource, /WorkbenchAppTabButton/)
  assert.match(workbenchIndexSource, /WorkbenchProjectShell/)
  assert.doesNotMatch(workbenchIndexSource, /WorkbenchPreparation/)
  assert.doesNotMatch(workbenchIndexSource, /WorkbenchScenePreviewPanel/)
  assert.match(workbenchIndexSource, /workbenchStatusLabel/)
  assert.doesNotMatch(businessIndexSource, /WorkbenchPreparation/)
  assert.match(workbenchStatusSource, /export function workbenchStatusIntent/)
  assert.match(workbenchStatusSource, /export function workbenchPriorityIntent/)
  assert.match(workbenchStatusSource, /export function workbenchDecisionIntent/)
  assert.match(workbenchTypesSource, /state\?: "note" \| "attention" \| "positive"/)
  assert.match(workbenchStatusSource, /workbenchDecisionIntent\(state\?: WorkbenchDecisionRow\["state"\]\)/)
  assert.match(workbenchChromeSource, /workbenchDecisionIntent\(row\.state\)/)
  assert.match(workbenchChromeSource, /row\.state === "attention"/)
  assert.match(workbenchChromeSource, /row\.state === "positive"/)
  assert.match(workbenchChromeSource, /WorkbenchInfoPanel[\s\S]*?className="ms-stack workbench-info-panel__rows"/)
  assert.match(workbenchChromeSource, /WorkbenchInfoPanel[\s\S]*?className="ms-type-body workbench-info-panel__row"/)
  assert.match(workbenchChromeSource, /WorkbenchDecisionPanel[\s\S]*?className="ms-grid-stack workbench-decision-panel"/)
  assert.match(workbenchChromeSource, /WorkbenchDecisionPanel[\s\S]*?className="ms-action-row workbench-decision-panel__header"/)
  assert.match(workbenchChromeSource, /WorkbenchDecisionPanel[\s\S]*?className="ms-type-label workbench-decision-panel__label"/)
  assert.match(workbenchChromeSource, /WorkbenchDecisionPanel[\s\S]*?className="ms-type-body workbench-decision-panel__value"/)
  assert.match(workbenchChromeSource, /WorkbenchActionRail[\s\S]*?<aside className="ms-stack workbench-action-rail"/)
  assert.match(workbenchChromeSource, /WorkbenchActionRail[\s\S]*?className="ms-type-label workbench-action-rail__title"/)
  assert.match(workbenchChromeSource, /WorkbenchActionRail[\s\S]*?className="ms-stack workbench-action-rail__list"/)
  assert.match(workbenchChromeSource, /WorkbenchActionRail[\s\S]*?className="ms-type-label workbench-action-rail__output"/)
  assert.match(workbenchChromeSource, /WorkbenchActionRail[\s\S]*?<Button[\s\S]*?align="start"[\s\S]*?workbench-action-rail__button/)
  assert.doesNotMatch(workbenchTypesSource, /tone\?: "default" \| "info" \| "success" \| "warning"/)
  assert.doesNotMatch(workbenchStatusSource, /WorkbenchDecisionRow\["tone"\]/)
  assert.doesNotMatch(workbenchChromeSource, /\brow\.tone\b/)
  assert.doesNotMatch(workbenchStatusSource, /\bSemanticTone\b/)
  assert.doesNotMatch(workbenchStatusSource, /export function workbench(?:ScenarioStatus|ScenarioPriority|Decision)Tone/)
  assert.match(workbenchChromeSource, /export function WorkbenchProjectShell/)
  assert.match(workbenchChromeSource, /WorkbenchAppShell[\s\S]*?className=\{cn\("ms-stack workbench-app-shell"/)
  assert.match(workbenchChromeSource, /WorkbenchAppTabButton[\s\S]*?className=\{cn\("type-body workbench-app-tab-button"/)
  assert.match(workbenchChromeSource, /WorkbenchAppTabButton[\s\S]*?className="ms-inline-center workbench-app-tab-button__icon"/)
  assert.match(workbenchChromeSource, /WorkbenchAppTabButton[\s\S]*?className="ms-text-truncate workbench-app-tab-button__label"/)
  assert.match(workbenchChromeSource, /WorkbenchAppSummary[\s\S]*?className=\{cn\("ms-action-row type-label workbench-app-summary"/)
  assert.match(workbenchChromeSource, /WorkbenchAppSummary[\s\S]*?className="ms-inline-center workbench-app-summary__icon"/)
  assert.match(workbenchChromeSource, /WorkbenchAppSummary[\s\S]*?className="ms-text-truncate workbench-app-summary__text"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectShell[\s\S]*?className=\{cn\("ms-stack workbench-project-shell"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?<FrameHeader as="header"[\s\S]*?project-workbench-header/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?className="ms-action-row workbench-project-header__main"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?<FrameHeading className="workbench-project-header__identity"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?className="ms-inline-center workbench-project-header__icon"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?className="ms-text-truncate ms-type-caption workbench-project-header__kicker"/)
  assert.match(workbenchChromeSource, /className="ms-workbench-copy workbench-project-header__copy"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?<FrameTitle as="h1" className="ms-text-truncate ms-type-section workbench-project-header__title"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?<FrameDescription className="ms-text-truncate ms-type-label workbench-project-header__description"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?className="ms-action-row workbench-project-header__badges"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?<FrameActions className="workbench-project-header__actions"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectHeader[\s\S]*?<FrameBody className="workbench-project-header__body"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectBody[\s\S]*?className=\{cn\("ms-workbench-copy workbench-project-body"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectViewport[\s\S]*?className=\{cn\("ms-workbench-row workbench-project-viewport"/)
  assert.match(workbenchChromeSource, /WorkbenchProjectPane[\s\S]*?className=\{cn\("ms-workbench-copy workbench-project-pane"/)
  assert.match(workbenchChromeSource, /export function WorkbenchMetricStrip/)
  assert.match(workbenchChromeSource, /export function WorkbenchGateChecklist/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/workbench/chrome/queue/index.tsx')), false, 'unused workbench queue UI must not remain in packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/workbench/chrome/queue/styles.css')), false, 'unused workbench queue CSS must not remain in packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/workbench/scene-preview/index.tsx')), false, 'unused workbench scene preview UI must not remain in packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/workbench/scene-preview/styles.css')), false, 'unused workbench scene preview CSS must not remain in packages/ui')
  assert.doesNotMatch(workbenchIndexSource, /Workbench(?:QueueList|SpecializedQueue|QueueMiniMetric|QueueItem)/)
  assert.doesNotMatch(workbenchTypesSource, /WorkbenchQueueItem/)
  assert.doesNotMatch(workbenchChromeSource, /Workbench(?:QueueList|SpecializedQueue|QueueMiniMetric|QueueItem)|from "\.\/queue"/)
  assert.doesNotMatch(workbenchChromeCss, /queue\/styles\.css|workbench-queue-/)
  assert.doesNotMatch(workbenchCss, /scene-preview\/styles\.css|workbench-scene-preview-panel/)
  assert.match(workbenchChromeSource, /workbenchStatusIntent/)
  assert.match(workbenchChromeSource, /workbenchDecisionIntent/)
  assert.match(workbenchChromeSource, /function gateActionIntent/)
  assert.doesNotMatch(workbenchChromeSource, /workbench(?:ScenarioStatus|ScenarioPriority|Decision)Tone/)
  assert.doesNotMatch(workbenchChromeSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(workbenchChromeSource, /<WorkbenchStatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(workbenchChromeSource, /function statusTone/)
  assert.doesNotMatch(workbenchChromeSource, /function priorityTone/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/project-shell\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/app-shell\/styles\.css";/)
  assert.doesNotMatch(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/queue\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/decision\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/metric-strip\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/context\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/gate\/styles\.css";/)
  assert.match(workbenchChromeCss, /\.workbench-project-shell\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-app-shell\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-app-tab-bar\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-app-tab-button\s*\{/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-app-shell\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-app-tab-button\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-app-tab-button__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-app-tab-button__label\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-app-summary\s*\{[^}]*line-height:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-app-summary__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-shell\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__main\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__kicker\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__description\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__badges\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__icon\s*\{[^}]*flex-shrink:\s*0/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-header__copy\s*\{/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-body\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-body\s*\{[^}]*flex:\s*1 1 auto/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-viewport\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-viewport\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-viewport\[data-direction="row"\]/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-pane\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-project-pane\s*\{[^}]*flex:\s*1 1 auto/)
  assert.match(workbenchChromeCss, /\.workbench-metric-strip\s*\{/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-decision-panel__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-decision-panel\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-info-panel__row\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-decision-panel__label\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-decision-panel__value\s*\{[^}]*line-height:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-action-rail__section\s*\{/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-action-rail__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-action-rail__button\s*\{[^}]*justify-content:\s*flex-start/)
  assert.doesNotMatch(workbenchChromeCss, /\.workbench-action-rail__button \.ms-button__content/)
  assert.match(workbenchCardCss, /\.workbench-summary-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-summary-card\s*\{/)
  assert.match(agentCssEntry, /@import "\.\/panel\/styles\.css";/)
  assert.doesNotMatch(agentCssEntry, /@import "\.\/page\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/shell\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/thread\/styles\.css";/)
  assert.doesNotMatch(agentCssEntry, /@import "\.\/context\/styles\.css";/)
  assert.match(agentPrimitiveCssEntry, /@import "\.\/context\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/run\/styles\.css";/)
  assert.doesNotMatch(agentCssEntry, /@import "\.\/work\/styles\.css";/)
  assert.doesNotMatch(agentCssEntry, /@import "\.\/composer\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/responsive\/styles\.css";/)
  assert.match(agentPanelSource, /className="ms-stack ai-agent-panel"/)
  assert.match(agentPanelSource, /className="ms-stack ai-agent-panel__body"/)
  assert.doesNotMatch(agentPanelFrameCss, /\.ai-agent-panel\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPanelFrameCss, /\.ai-agent-panel\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(agentPanelFrameCss, /\.ai-agent-panel__body\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPanelFrameCss, /\.ai-agent-panel__body\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(agentCss, /\.ai-agent-panel-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.ai-agent-panel-card\s*\{/)
  assert.match(readProjectFile('apps/frontend/src/features/agent/components/AgentPanelCardUi.css'), /\.ai-agent-panel-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.content-workspace-shell\s*\{/)
})

test('status badges use semantic intent API without legacy semantic helper exports', () => {
  const badgeSource = readProjectFile('packages/ui/src/components/primitives/badge.tsx')
  const primitiveIndex = readProjectFile('packages/ui/src/components/primitives/index.ts')
  const semanticSource = readProjectFile('packages/ui/src/semantic.ts')
  const semanticCss = readProjectFile('packages/ui/src/semantic.css')
  const agentRunUiSource = readProjectFile('apps/frontend/src/features/agent/domain/agentRunUi.ts')
  const desktopSource = walkFiles('apps/frontend/src', (file) => /\.(ts|tsx)$/.test(file))
    .map(readProjectFile)
    .join('\n')
  const packageBusinessStatusSources = [
    ...walkFiles('packages/ui/src/components/business', (file) => /\.(ts|tsx)$/.test(file)),
    ...walkFiles('apps/frontend/src/shared', (file) => /\.(ts|tsx)$/.test(file)),
  ].map(readProjectFile).join('\n')

  for (const helper of ['runStatusBadge', 'workspaceStatusBadge', 'stateBadge', 'priorityBadge', 'BadgeSemanticProps']) {
    assert.ok(!badgeSource.includes(helper), `${helper} should not be defined by Badge`)
    assert.ok(!primitiveIndex.includes(helper), `${helper} should not be exported from primitives`)
    assert.ok(!agentRunUiSource.includes(helper), `${helper} should not be defined in agentRunUi`)
    assert.ok(!desktopSource.includes(helper), `${helper} should not be consumed by desktop`)
  }

  for (const statusApi of ['semanticStatusClass', 'semanticStatusLabel', 'semanticStatusTone', 'semanticToneForStatus']) {
    assert.ok(!desktopSource.includes(statusApi), `${statusApi} should not be consumed by desktop`)
  }

  assert.doesNotMatch(desktopSource, /<Badge\s+\{\.\.\./)
  assert.doesNotMatch(desktopSource, /SemanticStatusBadge/)
  assert.doesNotMatch(desktopSource, /<StatusDot\b[^>]*\bstatus=/)
  assert.doesNotMatch(desktopSource, /semanticToneClass/)
  assert.doesNotMatch(desktopSource, /<StatusBadge\b[^>]*\b(?:label|icon)=/)
  assert.doesNotMatch(desktopSource, /<StatusBadge\b[^>]*tone=\{?['"]brand['"]\}?/)
  assert.doesNotMatch(packageBusinessStatusSources, /<StatusBadge\b[^\n>]*\btone=/)
  assert.doesNotMatch(packageBusinessStatusSources, /<StatusDot\b[^\n>]*\btone=/)
  assert.doesNotMatch(packageBusinessStatusSources, /<WorkbenchStatusBadge\b[^\n>]*\btone=/)
  assert.match(badgeSource, /intent\?: StatusIntent/)
  assert.match(badgeSource, /data-ms-intent/)
  assert.doesNotMatch(semanticSource, /SemanticTonePart|semanticToneClass|ms-semantic-/)
  assert.doesNotMatch(semanticCss, /ms-semantic-/)
  assert.match(semanticSource, /toneTextClass/)
  assert.match(semanticSource, /toneSurfaceClass/)
  assert.match(semanticSource, /toneDotClass/)
  assert.match(semanticCss, /\.ms-tone-dot\s*\{/)
})

test('desktop consumes migrated app and workbench primitives through @movscript/ui', () => {
  const removedAppPrimitives = [
    'apps/frontend/src/components/app/AppPage.tsx',
    'apps/frontend/src/components/app/SemanticStatusBadge.tsx',
    'apps/frontend/src/components/app/semantic.ts',
    'apps/frontend/src/components/creative/SettingCard.tsx',
    'apps/frontend/src/components/entity/SemanticEntityThumbCard.tsx',
    'apps/frontend/src/components/shared/CreateDialog.tsx',
    'apps/frontend/src/components/workbench/WorkbenchPrimitives.tsx',
    'apps/frontend/src/components/workbench/WorkbenchPanel.tsx',
  ]

  for (const relativePath of removedAppPrimitives) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must stay in @movscript/ui, not desktop`)
  }

  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .map((relativePath) => readProjectFile(relativePath))
    .join('\n')
  const businessIndexSource = readProjectFile('packages/ui/src/components/business/index.ts')
  const appBusinessSource = readAppSource()
  const appBusinessCss = readAppCss()
  const scriptsPageSource = [
    readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPage.tsx'),
    readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPageParts.tsx'),
  ].join('\n')
  const scriptsPageFeatureSource = readScriptsPageFeatureSource()
  const canvasListSource = readProjectFile('apps/frontend/src/features/canvas/components/CanvasListView.tsx')

  assert.doesNotMatch(frontendSources, /@\/components\/app\/AppPage/)
  assert.doesNotMatch(frontendSources, /@\/components\/app\/SemanticStatusBadge/)
  assert.doesNotMatch(frontendSources, /@\/components\/app\/semantic/)
  assert.doesNotMatch(frontendSources, /@\/components\/creative\/SettingCard/)
  assert.doesNotMatch(frontendSources, /@\/components\/entity\/SemanticEntityThumbCard/)
  assert.doesNotMatch(frontendSources, /@\/components\/shared\/CreateDialog/)
  assert.doesNotMatch(frontendSources, /@\/components\/workbench\/WorkbenchPrimitives/)
  assert.doesNotMatch(frontendSources, /@\/components\/workbench\/WorkbenchPanel/)
  assert.doesNotMatch(frontendSources, /from ['"]\.\/WorkbenchPanel['"]/)
  assert.match(businessIndexSource, /export \* as app from "\.\/app";/)
  assert.doesNotMatch(businessIndexSource, /\b(?:AppAvatar|AppCreateDialog|AppMarkerDot|AppPager|AppProgressBar|AppToastShell)\b/)
  assert.match(appBusinessSource, /export function AppAvatar/)
  assert.match(appBusinessSource, /export function AppCreateDialog/)
  assert.match(appBusinessSource, /export function AppMarkerDot/)
  assert.match(appBusinessSource, /export function AppPager/)
  assert.match(appBusinessSource, /ms-text-truncate ms-tabular-nums app-pager__status/)
  assert.match(appBusinessSource, /export function AppProgressBar/)
  assert.match(appBusinessSource, /export const AppToastShell/)
  assert.match(appBusinessSource, /AppToastShell[\s\S]*?"ms-stack ms-type-body app-toast"/)
  assert.match(appBusinessSource, /AppToastRow[\s\S]*?"ms-action-row app-toast__row"/)
  assert.match(appBusinessSource, /AppToastIcon[\s\S]*?"ms-inline-center app-toast__icon"/)
  assert.match(appBusinessSource, /AppToastMessage[\s\S]*?"ms-type-body app-toast__message"/)
  assert.match(appBusinessSource, /AppToastDetail[\s\S]*?"ms-type-caption app-toast__detail"/)
  assert.match(appBusinessSource, /AppToastViewport[\s\S]*?"ms-stack app-toast-viewport"/)
  assert.doesNotMatch(appBusinessCss, /\.app-toast\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(appBusinessCss, /\.app-toast\s*\{[^}]*font-size:/)
  assert.doesNotMatch(appBusinessCss, /\.app-toast__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(appBusinessCss, /\.app-toast__detail\s*\{[^}]*font-size:/)
  assert.doesNotMatch(appBusinessCss, /\.app-toast-viewport\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(appBusinessCss, /\.app-toast-viewport\s*\{[^}]*flex-direction:/)
  assert.match(scriptsPageFeatureSource, /export function ScriptCreateDialog\b/)
  assert.match(scriptsPageSource, /\bScriptVersionHistoryPanel\b/)
  assert.doesNotMatch(scriptsPageSource, /\b(?:AppCreateDialog|AppProgressBar)\b/)
  assert.match(canvasListSource, /\bCanvasListCreateDialog\b/)
  assert.doesNotMatch(canvasListSource, /\bAppCreateDialog\b/)
})

test('migrated primitive styling is owned by @movscript/ui', () => {
  const appCss = readProjectFile('apps/frontend/src/index.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const primitiveCss = readPrimitiveCss()
  const uiLayoutCss = readProjectFile('packages/ui/src/components/layout/styles.css')
  const uiAppShellLayoutCss = readProjectFile('packages/ui/src/components/layout/app-shell/styles.css')
  const uiAppShellWindowCss = readProjectFile('packages/ui/src/components/layout/app-shell/window/styles.css')
  const uiAppShellSidebarCss = readProjectFile('packages/ui/src/components/layout/app-shell/sidebar/styles.css')
  const uiWorkspaceLayoutCss = readProjectFile('packages/ui/src/components/layout/workspace/styles.css')
  const uiWorkspaceContentCss = readProjectFile('packages/ui/src/components/layout/workspace/content-workspace.css')
  const uiWorkspaceOverlapCss = readProjectFile('packages/ui/src/components/layout/workspace/overlap-pane.css')
  const uiBusinessAppCss = readAppCss()
  const uiAgentCss = readAgentCss()
  const uiAgentChatCss = readAgentChatCss()
  const uiCanvasCss = readProjectFile('packages/ui/src/components/business/canvas/styles.css')
  const uiCanvasCardCss = readProjectFile('packages/ui/src/components/business/canvas/card/styles.css')
  const uiResourceCss = readProjectFile('packages/ui/src/components/business/resource/styles.css')
  const uiWorkbenchCss = readProjectFile('packages/ui/src/components/business/workbench/styles.css')
  const uiWorkbenchFoundationCss = readProjectFile('packages/ui/src/components/business/workbench/foundation/styles.css')
  const uiWorkbenchSectionCss = readProjectFile('packages/ui/src/components/business/workbench/section/styles.css')
  const uiWorkbenchListCss = readProjectFile('packages/ui/src/components/business/workbench/list/styles.css')
  const uiWorkbenchCardCss = readWorkbenchCardCss()
  const uiWorkbenchDataDisplayCss = readProjectFile('packages/ui/src/components/business/workbench/data-display/styles.css')
  const scriptsPageFeatureCss = readScriptsPageFeatureCss()
  const projectPageFeatureCss = readProjectFile('apps/frontend/src/features/project/components/ProjectPageUi.css')
  const uiOwnedCss = [
    uiCss,
    primitiveCss,
    uiLayoutCss,
    uiAppShellLayoutCss,
    uiAppShellWindowCss,
    uiAppShellSidebarCss,
    uiWorkspaceLayoutCss,
    uiWorkspaceContentCss,
    uiWorkspaceOverlapCss,
    uiBusinessAppCss,
    uiAgentCss,
    uiAgentChatCss,
    uiCanvasCss,
    uiCanvasCardCss,
    uiResourceCss,
    uiWorkbenchCss,
    uiWorkbenchFoundationCss,
    uiWorkbenchSectionCss,
    uiWorkbenchListCss,
    uiWorkbenchCardCss,
    uiWorkbenchDataDisplayCss,
  ].join('\n')

  for (const selector of [
    'app-page-shell',
    'app-section',
    'app-code-block',
    'app-skeleton',
    'app-panel',
    'app-disclosure',
    'app-key-value',
    'app-info-block',
    'app-info-block__code-value',
    'app-icon-frame',
    'app-inline-meta',
    'app-state-message',
    'app-inline-error',
    'app-surface-item',
    'app-text-empty-state',
    'app-metric-card',
    'app-empty-state',
    'ms-control',
    'ms-range-input',
    'ms-switch',
    'ms-frame',
    'ms-surface',
    'ms-stat-card',
    'ms-key-value',
    'ms-empty-state',
    'type-tiny',
    'type-caption',
    'type-label',
    'type-body',
    'type-title',
    'workbench-section',
    'workbench-list',
    'workbench-entity-card',
    'workbench-summary-card',
    'workbench-thumbnail',
    'workbench-status-badge',
    'workbench-metric',
    'workbench-key-value',
    'workbench-empty-state',
    'onboarding-switch-guide',
    'mention-editor',
    'content-workspace-shell',
    'content-workspace-core',
    'content-workspace-header',
    'content-workspace-overview',
    'content-workspace-column',
    'app-shell',
    'app-sidebar',
    'app-sidebar-section',
    'app-sidebar-nav-item',
    'app-sidebar-project-row',
    'app-sidebar-user-button',
    'app-content-frame',
    'asset-prep-workbench',
    'asset-prep-layout',
    'asset-prep-side',
    'asset-prep-workspace',
    'production-layout',
    'production-side',
    'production-context-stack',
    'production-candidate-row',
  ]) {
    assert.match(uiOwnedCss, cssClassSelectorPattern(selector), `${selector} styles must live in @movscript/ui`)
    assert.doesNotMatch(appCss, new RegExp(`^\\.${selector}\\s*\\{`, 'm'), `${selector} must not be redefined as a desktop-owned base selector`)
  }
  for (const selector of [
    'projects-region',
    'projects-list-row',
  ]) {
    assert.match(projectPageFeatureCss, cssClassSelectorPattern(selector), `${selector} styles must live with ProjectPageUi`)
    assert.doesNotMatch(uiOwnedCss, cssClassSelectorPattern(selector), `${selector} styles must not live in @movscript/ui`)
    assert.doesNotMatch(appCss, new RegExp(`^\\.${selector}\\s*\\{`, 'm'), `${selector} must not be redefined as a desktop-owned base selector`)
  }
  for (const selector of [
    'script-workbench-shell',
    'script-workbench-frame',
    'script-workbench-layout',
    'script-workbench-rail',
    'script-workbench-inspector',
  ]) {
    assert.match(scriptsPageFeatureCss, cssClassSelectorPattern(selector), `${selector} styles must live with ScriptsPageUi`)
    assert.doesNotMatch(uiOwnedCss, cssClassSelectorPattern(selector), `${selector} styles must not be shipped from packages/ui`)
    assert.doesNotMatch(appCss, new RegExp(`^\\.${selector}\\s*\\{`, 'm'), `${selector} must not be redefined as a desktop-owned base selector`)
  }
})

test('app and workbench package primitives share internal base style classes', () => {
  const appSource = readAppSource()
  const layoutSource = readProjectFile('packages/ui/src/components/layout/index.tsx')
  const workbenchSectionSource = readProjectFile('packages/ui/src/components/business/workbench/section/index.tsx')
  const workbenchCardSource = readWorkbenchCardSource()
  const workbenchDataDisplaySource = readProjectFile('packages/ui/src/components/business/workbench/data-display/index.tsx')
  const workbenchSource = `${workbenchSectionSource}\n${workbenchCardSource}\n${workbenchDataDisplaySource}`
  const reviewSource = readReviewSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const primitiveCss = readPrimitiveCss()
  const primitiveIndexSource = readProjectFile('packages/ui/src/components/primitives/index.ts')
  const keyValueSource = readProjectFile('packages/ui/src/components/primitives/key-value.tsx')
  const metricCardSource = readProjectFile('packages/ui/src/components/primitives/metric-card.tsx')
  const emptyStateSource = readProjectFile('packages/ui/src/components/primitives/empty-state.tsx')
  const appInfoBlockSource = readProjectFile('packages/ui/src/components/business/app/data-display/info-block/index.tsx')
  const businessAppCss = readAppCss()
  const layoutCss = readProjectFile('packages/ui/src/components/layout/styles.css')
  const workbenchDataDisplayCss = readProjectFile('packages/ui/src/components/business/workbench/data-display/styles.css')

  for (const sharedClass of ['ms-surface']) {
    assert.match(appSource, new RegExp(sharedClass), `${sharedClass} must be used by app primitives`)
    assert.match(workbenchSource, new RegExp(sharedClass), `${sharedClass} must be used by workbench primitives`)
    assert.match(primitiveCss, new RegExp(`\\.${sharedClass}(?:\\s|\\{|--|__)`), `${sharedClass} base styles must live in @movscript/ui primitives`)
  }
  assert.match(primitiveIndexSource, /KeyValue/)
  assert.match(keyValueSource, /export const KeyValue/)
  assert.match(keyValueSource, /className=\{cn\("ms-key-value"/)
  assert.match(keyValueSource, /emphasis="unframed"/)
  assert.match(primitiveIndexSource, /MetricCard/)
  assert.match(primitiveIndexSource, /EmptyState/)
  assert.match(metricCardSource, /export const MetricCard/)
  assert.match(metricCardSource, /className=\{cn\("ms-stat-card"/)
  assert.match(metricCardSource, /ms-tabular-nums ms-stat-card__value/)
  assert.match(uiCss, /\.ms-tabular-nums\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums/)
  assert.doesNotMatch(primitiveCss, /\.ms-stat-card__value\s*\{[^}]*font-variant-numeric:/)
  assert.match(primitiveCss, /\.ms-stat-card__icon\s*\{[\s\S]*border-radius:\s*var\(--ms-radius-sm\)/)
  assert.match(emptyStateSource, /export const EmptyState/)
  assert.match(emptyStateSource, /className=\{cn\("ms-empty-state"/)
  assert.match(emptyStateSource, /emphasis="unframed"/)
  assert.match(appSource, /AppMetricCard[\s\S]*?<MetricCard/)
  assert.match(appSource, /AppEmptyState[\s\S]*?<EmptyState/)
  assert.match(appSource, /AppStateMessage[\s\S]*?<Surface[\s\S]*?kind="item"[\s\S]*?emphasis="soft"/)
  assert.match(appSource, /AppStateMessage[\s\S]*?"ms-action-row ms-type-body app-state-message"/)
  assert.match(appSource, /AppStateMessage[\s\S]*?className="ms-inline-center app-state-message__icon"/)
  assert.match(appSource, /AppStatusSurface[\s\S]*?"ms-type-label app-status-surface"/)
  assert.match(appSource, /AppStatusToggleButton[\s\S]*?"ms-type-label app-status-toggle-button"/)
  assert.match(appSource, /AppInlineError[\s\S]*?<Surface[\s\S]*?tone="danger"[\s\S]*?emphasis="soft"[\s\S]*?"ms-type-label app-inline-error"/)
  assert.match(appSource, /AppFeedbackText[\s\S]*?"ms-type-label app-feedback-text"/)
  assert.match(appSource, /AppTextEmptyState[\s\S]*?<Surface[\s\S]*?as="p"[\s\S]*?emphasis="muted"[\s\S]*?"ms-type-caption app-text-empty-state"/)
  assert.match(appSource, /titleClassName="ms-type-body app-empty-state__title"/)
  assert.match(appSource, /descriptionClassName="ms-type-label app-empty-state__detail"/)
  assert.match(businessAppCss, /\.app-state-message,\n\.app-inline-error,\n\.app-status-surface\s*\{[\s\S]*color:\s*var\(--ui-surface-tone-color\)/)
  assert.doesNotMatch(businessAppCss, /\.app-state-message,\n\.app-inline-error,\n\.app-status-surface\s*\{[\s\S]*border:\s*1px solid var\(--ui-surface-border\)/)
  assert.doesNotMatch(businessAppCss, /\.app-state-message,\n\.app-inline-error,\n\.app-status-surface\s*\{[\s\S]*background:\s*var\(--ui-surface-background\)/)
  assert.match(businessAppCss, /\.app-inline-error\s*\{[\s\S]*border-radius:\s*var\(--ms-radius-sm\)/)
  assert.doesNotMatch(businessAppCss, /\.app-state-message\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(businessAppCss, /\.app-state-message\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-status-toggle-button\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-status-toggle-button\s*\{[^}]*line-height:/)
  assert.doesNotMatch(businessAppCss, /\.app-status-toggle-button\s*\{[^}]*transition:/)
  assert.doesNotMatch(businessAppCss, /\.app-status-toggle-button:disabled\s*\{/)
  assert.doesNotMatch(businessAppCss, /\.app-inline-error\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-feedback-text\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-status-surface\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-text-empty-state\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-empty-state__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-empty-state__detail\s*\{[^}]*font-size:/)
  assert.doesNotMatch(businessAppCss, /\.app-state-message__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(businessAppCss, /\.app-status-toggle-button\s*\{[^}]*display:\s*inline-flex/)
  assert.match(appSource, /export function AppDataTable\b/)
  assert.match(appSource, /export function AppDataTableHeader\b/)
  assert.match(appSource, /export function AppDataTableRow\b/)
  assert.match(businessAppCss, /\.app-data-table\s*\{/)
  assert.match(businessAppCss, /\.app-data-table__header\s*\{/)
  assert.match(businessAppCss, /\.app-data-table__row\[data-interactive="true"\]:hover\s*\{/)
  assert.match(workbenchDataDisplaySource, /WorkbenchMetric[\s\S]*?<MetricCard/)
  assert.match(workbenchDataDisplaySource, /WorkbenchEmptyState[\s\S]*?<EmptyState/)
  assert.match(workbenchCardSource, /WorkbenchThumbnail[\s\S]*?<EmptyState/)
  assert.match(appSource, /AppKeyValue[\s\S]*?<KeyValue/)
  assert.match(workbenchDataDisplaySource, /WorkbenchKeyValue[\s\S]*?<KeyValue/)
  assert.doesNotMatch(appSource, /className=\{cn\("ms-key-value/)
  assert.doesNotMatch(workbenchSource, /className=\{cn\("ms-key-value/)
  assert.doesNotMatch(appSource, /className=\{cn\("ms-stat-card/)
  assert.doesNotMatch(appSource, /className=\{cn\("ms-empty-state/)
  assert.doesNotMatch(workbenchSource, /className=\{cn\("ms-stat-card/)
  assert.doesNotMatch(workbenchSource, /className=\{cn\("ms-empty-state/)
  assert.doesNotMatch(appSource, /export function AppPage\b/)
  assert.doesNotMatch(appSource, /export function AppPageHeader\b/)
  assert.doesNotMatch(appSource, /export function ProjectSurfaceHeader/)
  assert.match(layoutSource, /export function AppPage/)
  assert.match(layoutSource, /export function AppPageHeader/)
  assert.match(layoutSource, /export function ProjectSurfaceHeader/)
  for (const sharedClass of ['ms-page-header__lead', 'ms-page-header__copy', 'ms-page-header__icon', 'ms-page-header__title', 'ms-page-header__description', 'ms-page-header__actions']) {
    assert.match(layoutSource, new RegExp(sharedClass), `${sharedClass} must be used by layout header primitives`)
    assert.match(layoutCss, cssClassSelectorPattern(sharedClass), `${sharedClass} layout styles must live in @movscript/ui layout`)
  }
  assert.match(layoutSource, /ms-page-header app-page-header/)
  assert.match(layoutSource, /ms-page-header project-surface-header/)
  for (const sharedClass of ['ms-surface__copy', 'ms-surface__body']) {
    assert.match(appSource, new RegExp(sharedClass), `${sharedClass} must be used by app primitives`)
    assert.match(workbenchSource, new RegExp(sharedClass), `${sharedClass} must be used by workbench primitives`)
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui aggregate styles`)
  }
  for (const sharedClass of ['ms-surface__action', 'ms-surface__description']) {
    assert.match(appSource, new RegExp(sharedClass), `${sharedClass} must be used by app primitives`)
    assert.match(workbenchSource, new RegExp(sharedClass), `${sharedClass} must be used by workbench primitives`)
    assert.match(primitiveCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui primitives`)
  }
  assert.match(primitiveCss, /\.ms-empty-state__action\s*\{/)
  assert.match(primitiveCss, /\[data-emphasis="unframed"\]\s*\{[\s\S]*--ui-surface-background:\s*transparent/)
  assert.doesNotMatch(primitiveCss, /\.ms-key-value\s*\{[^}]*--ui-surface-background/)
  assert.match(businessAppCss, /\.app-key-value\s*\{[^}]*background:\s*color-mix/)
  assert.match(workbenchDataDisplayCss, /\.workbench-key-value\s*\{[^}]*background:\s*var\(--ms-color-background\)/)
  assert.doesNotMatch(primitiveCss, /\.ms-stat-card\s*\{[^}]*--ui-surface-background/)
  assert.match(businessAppCss, /\.app-metric-card\s*\{[^}]*background:\s*var\(--ms-color-background\)/)
  assert.match(workbenchDataDisplayCss, /\.workbench-metric\s*\{[^}]*background:\s*var\(--ms-color-surface-raised\)/)
  assert.match(appSource, /export const AppChoiceTile/)
  assert.match(appSource, /AppChoiceTile[\s\S]*?<Button[\s\S]*?data-selected=\{selected \? "true" : undefined\}/)
  assert.match(appSource, /export const AppWindowIconButton/)
  assert.match(appSource, /AppWindowIconButton[\s\S]*?<Button[\s\S]*?className=\{cn\("app-window-icon-button"/)
  assert.match(appSource, /export const AppSurfaceItem/)
  assert.match(appSource, /AppSurfaceItem[\s\S]*?asChild = false/)
  assert.match(appSource, /AppSurfaceItem[\s\S]*?<Frame[\s\S]*?asChild=\{asChild\}/)
  assert.match(appInfoBlockSource, /function AppInfoBlock[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("app-info-block"/)
  assert.doesNotMatch(appInfoBlockSource, /<Surface/)
  assert.match(primitiveCss, /\[data-kind="item"\]\s*\{[\s\S]*--ui-surface-border:\s*color-mix\(in srgb, var\(--ms-color-border\) 80%, transparent\)/)
  assert.match(primitiveCss, /\[data-kind="item"\]\s*\{[\s\S]*--ui-surface-radius:\s*var\(--ms-radius-sm\)/)
  assert.doesNotMatch(businessAppCss, /\.app-surface-item\s*\{[^}]*--ui-surface-(?:background|border|radius|shadow)/)
  assert.doesNotMatch(businessAppCss, /\.app-surface-item\[data-variant="(?:overlay|muted)"\]\s*\{[^}]*--ui-surface-(?:background|shadow)/)
  assert.match(appSource, /export function AppMediaFrame/)
  assert.match(appSource, /variant\?: "thumb" \| "stage" \| "stage-dark" \| "placeholder" \| "panel" \| "fill"/)
  assert.match(appSource, /export function AppProgressBar/)
  assert.match(appSource, /AppProgressBar[\s\S]*?data-tone=\{tone\}[\s\S]*?aria-valuenow=/)
  assert.match(appSource, /export function AppRangeTrack/)
  assert.match(appSource, /AppRangeTrack[\s\S]*?app-range-track__selection[\s\S]*?app-range-track__marker/)
  assert.doesNotMatch(appSource, /\bAppWaveformBars\b/)
  assert.match(appSource, /export function AppMarkerDot/)
  assert.match(appSource, /AppMarkerDot[\s\S]*?accentDotClass\(accent\)[\s\S]*?toneDotClass\(semanticTone\)/)
  assert.match(appSource, /export function AppAvatar/)
  assert.match(appSource, /AppAvatar[\s\S]*?<Avatar[\s\S]*?data-size=\{size\}[\s\S]*?<AvatarFallback>\{fallbackText\}<\/AvatarFallback>/)
  assert.match(appSource, /export function AppInlineMeta/)
  assert.match(appSource, /AppInlineMeta[\s\S]*?asChild = false/)
  assert.match(appSource, /export function AppDisclosure/)
  assert.match(appSource, /AppDisclosure[\s\S]*?<Frame[\s\S]*?as="details"[\s\S]*?className=\{cn\("app-disclosure"/)
  assert.match(appSource, /AppDisclosure[\s\S]*?<FrameHeader as="summary" className="app-disclosure__summary"/)
  assert.match(businessAppCss, /\.app-surface-item\s*\{/)
  assert.match(businessAppCss, /\.app-choice-tile\s*\{/)
  assert.match(businessAppCss, /\.app-window-icon-button\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\[data-variant="stage-dark"\]\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\[data-variant="placeholder"\]\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\[data-variant="fill"\] > \*\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/)
  assert.match(businessAppCss, /\.app-progress-bar\s*\{/)
  assert.match(businessAppCss, /\.app-progress-bar\[data-tone="danger"\]\s*\{/)
  assert.match(businessAppCss, /\.app-progress-bar\[data-indeterminate="true"\] \.app-progress-bar__fill\s*\{/)
  assert.match(businessAppCss, /\.app-range-track\s*\{/)
  assert.match(businessAppCss, /\.app-range-track__selection\s*\{/)
  assert.doesNotMatch(businessAppCss, /\.app-waveform-bars(?:__bar)?\b/)
  assert.match(businessAppCss, /\.app-marker-dot\s*\{/)
  assert.match(businessAppCss, /\.app-marker-dot\[data-size="2xs"\]\s*\{/)
  assert.match(businessAppCss, /\.app-marker-dot\.ms-accent-dot\s*\{/)
  assert.match(businessAppCss, /\.app-avatar\s*\{/)
  assert.match(businessAppCss, /\.app-avatar\[data-size="lg"\]\s*\{/)
  assert.match(businessAppCss, /\.app-inline-meta\s*\{/)
  assert.doesNotMatch(businessAppCss, /\.app-disclosure\s*\{[\s\S]*border:/)
  assert.match(primitiveCss, /\.ms-empty-state\s*\{[\s\S]*min-height:\s*auto/)
  assert.match(businessAppCss, /\.app-empty-state\s*\{[\s\S]*min-height:/)
  assert.match(workbenchDataDisplayCss, /\.workbench-empty-state\s*\{[\s\S]*min-height:/)
  assert.doesNotMatch(uiCss, /\.app-metric-card__(?:row|label|detail|icon)\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-metric__(?:row|label|detail|icon)\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-empty-state__(?:icon|title|detail)\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-empty-state__(?:icon|title|description)\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-key-value__(?:label|value)\s*\{/)
  assert.match(reviewSource, /ReviewCallout[\s\S]*?<Frame[\s\S]*?kind="panel"[\s\S]*?emphasis="plain"[\s\S]*?className=\{cn\("ms-review-callout"/)
  assert.match(reviewSource, /ReviewCallout[\s\S]*?<FrameHeading className="ms-action-row ms-surface__heading ms-review-callout__header"/)
  assert.match(reviewSource, /ReviewCallout[\s\S]*?className="ms-type-label ms-review-callout__title"/)
  assert.doesNotMatch(reviewSource, /ReviewCallout[\s\S]*?<div \{\.\.\.props\}/)
  assert.match(workbenchSectionSource, /WorkbenchSection[\s\S]*?<Frame[\s\S]*?as="section"[\s\S]*?kind="section"[\s\S]*?className=\{cn\("workbench-section"/)
})

test('unused app dashboard UI is not shipped from packages/ui', () => {
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const appSource = readAppSource()
  const appCss = readProjectFile('packages/ui/src/components/business/app/styles.css')
  const frontendCss = readProjectFile('apps/frontend/src/index.css')
  const frontendElectronViteConfig = readProjectFile('apps/frontend/electron.vite.config.ts')
  const frontendViteE2eConfig = readProjectFile('apps/frontend/vite.e2e.config.ts')

  for (const removedPath of [
    'packages/ui/src/components/business/app/dashboard/index.tsx',
    'packages/ui/src/components/business/app/dashboard/styles.css',
    'packages/ui/src/components/business/app/dashboard/layout/index.tsx',
    'packages/ui/src/components/business/app/dashboard/layout/styles.css',
    'packages/ui/src/components/business/app/dashboard/metric/index.tsx',
    'packages/ui/src/components/business/app/dashboard/metric/styles.css',
    'packages/ui/src/components/business/app/dashboard/item/index.tsx',
    'packages/ui/src/components/business/app/dashboard/item/styles.css',
    'packages/ui/src/components/business/app/dashboard/lane/index.tsx',
    'packages/ui/src/components/business/app/dashboard/lane/styles.css',
  ]) {
    assert.equal(existsSync(path.resolve(removedPath)), false, `${removedPath} must not remain in packages/ui`)
  }

  assert.equal(packageJson.exports['./business/app-dashboard'], undefined, 'unused app dashboard UI must not be a package export')
  assert.doesNotMatch(appSource, /export \* from ["']\.\/dashboard["']|AppDashboard/, 'app barrel must not export unused dashboard UI')
  assert.doesNotMatch(appCss, /dashboard\/styles\.css|app-dashboard-/, 'app stylesheet must not import unused dashboard styles')
  assert.doesNotMatch(frontendCss, /@movscript\/ui\/styles\/business\/app-dashboard\.css/, 'frontend global CSS must not import unused dashboard styles')
  assert.doesNotMatch(frontendViteE2eConfig, /@movscript\/ui\/business\/app-dashboard|@movscript\/ui\/styles\/business\/app-dashboard\.css/, 'frontend e2e aliases must not expose unused dashboard UI')
  assert.doesNotMatch(frontendElectronViteConfig, /@movscript\/ui\/business\/app-dashboard|@movscript\/ui\/styles\/business\/app-dashboard\.css/, 'frontend electron aliases must not expose unused dashboard UI')
})

test('workbench list and card primitives share internal base classes', () => {
  const workbenchIndexSource = readProjectFile('packages/ui/src/components/business/workbench/index.tsx')
  const workbenchListSource = readProjectFile('packages/ui/src/components/business/workbench/list/index.tsx')
  const workbenchCardSource = readWorkbenchCardSource()
  const workbenchSource = `${workbenchListSource}\n${workbenchCardSource}`
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const primitiveCss = readPrimitiveCss()
  const workbenchFoundationCss = readProjectFile('packages/ui/src/components/business/workbench/foundation/styles.css')
  const workbenchListCss = readProjectFile('packages/ui/src/components/business/workbench/list/styles.css')
  const workbenchCardCss = readWorkbenchCardCss()
  const workbenchCss = `${workbenchFoundationCss}\n${workbenchListCss}\n${workbenchCardCss}`

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
    assert.match(workbenchCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui workbench`)
  }
  assert.doesNotMatch(uiCss, /\.ms-workbench-list\s*\{/)
  assert.match(workbenchSource, /<Frame[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-list-item"/)
  assert.match(workbenchSource, /<Frame[\s\S]*?tone="brand"[\s\S]*?interaction=\{active \? "selected" : "selectable"\}/)
  assert.match(primitiveCss, /\[data-kind="item"\]\[data-emphasis="plain"\]\s*\{[\s\S]*--ui-surface-background:\s*var\(--ms-color-background\)/)
  assert.doesNotMatch(workbenchListCss, /\.ms-workbench-selectable\s*\{[^}]*--ui-surface-background/)
  assert.doesNotMatch(workbenchListCss, /\.ms-workbench-selectable:hover\s*\{[\s\S]*--ui-surface-/)
  assert.doesNotMatch(workbenchListCss, /\.ms-workbench-selectable\[data-active="true"\]\s*\{[\s\S]*--ui-surface-/)
  assert.match(workbenchIndexSource, /WorkbenchSurfaceItem/)
  assert.match(workbenchListSource, /export function WorkbenchSurfaceItem/)
  assert.match(workbenchSource, /WorkbenchSurfaceItem[\s\S]*?<Frame[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-list-item"/)
  assert.match(workbenchSource, /<Frame[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-entity-card"/)
  assert.match(workbenchSource, /ms-workbench-row workbench-entity-card__row/)
  assert.match(workbenchSource, /workbench-entity-card__row[\s\S]*?workbench-entity-card__content[\s\S]*?\{children\}/)
  assert.match(workbenchCardCss, /\.workbench-entity-card\s*\{[\s\S]*flex-direction:\s*column/)
  assert.match(workbenchCardCss, /\.workbench-entity-card__row\s*\{[\s\S]*align-items:\s*stretch/)
  assert.match(workbenchIndexSource, /WorkbenchSummaryCard/)
  assert.match(workbenchCardSource, /export function WorkbenchSummaryCard/)
  assert.match(workbenchSource, /<Frame[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-summary-card"/)
  assert.match(workbenchSource, /ms-workbench-row workbench-summary-card__header/)
  assert.match(workbenchSource, /className="ms-text-truncate ms-type-label workbench-summary-card__title"/)
  assert.match(workbenchSource, /className="ms-text-truncate ms-type-caption workbench-summary-card__description"/)
  assert.match(workbenchSource, /"ms-type-tiny workbench-summary-card__preview-label"/)
  assert.match(workbenchCardCss, /\.workbench-summary-card\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__body\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__preview-stack\s*\{[\s\S]*width:\s*100%/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__preview-row\s*\{[\s\S]*display:\s*grid/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__preview-list\s*\{[\s\S]*display:\s*flex/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__status-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.doesNotMatch(workbenchCardCss, /\.workbench-summary-card__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchCardCss, /\.workbench-summary-card__title\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(workbenchCardCss, /\.workbench-summary-card__description\s*\{[^}]*font-size:/)
  assert.doesNotMatch(workbenchCardCss, /\.workbench-summary-card__description\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(workbenchCardCss, /\.workbench-summary-card__preview-label\s*\{/)
  assert.match(workbenchSource, /<Surface[\s\S]*?className=\{cn\("ms-workbench-media-frame workbench-thumbnail"/)
  assert.match(primitiveCss, /\[data-kind="media"\]\[data-emphasis="muted"\]\s*\{[\s\S]*--ui-surface-background:\s*color-mix\(in srgb, var\(--ms-color-muted\) 42%, transparent\)/)
  assert.doesNotMatch(workbenchCardCss, /\.workbench-thumbnail\s*\{[^}]*--ui-surface-/)
})

test('review and workbench badges use package status badge primitive', () => {
  const reviewSource = readReviewSource()
  const workbenchCardSource = readWorkbenchCardSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const reviewCss = readReviewCss()

  for (const sharedClass of ['ms-inline-badge', 'ms-inline-badge--center', 'ms-inline-badge--truncate']) {
    assert.match(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(reviewSource, /StatusBadge/)
  assert.match(reviewSource, /FrameHeading/)
  assert.match(workbenchCardSource, /StatusBadge/)
  assert.doesNotMatch(`${reviewSource}\n${workbenchCardSource}`, /semanticToneClass\([^\n)]*['"]badge['"]/)
  assert.doesNotMatch(`${reviewSource}\n${workbenchCardSource}`, /<StatusBadge\b[^\n>]*\btone=/)
  assert.match(reviewSource, /ms-inline-badge ms-inline-badge--center ms-type-tiny ms-review-stat/)
  assert.doesNotMatch(reviewSource, /\b(?:ReviewDecisionBadge|ChangeActionBadge|changeActionTone|changeActionRowClass|ReviewDecision|ChangeAction)\b/)
  assert.match(workbenchCardSource, /ms-inline-badge--center ms-inline-badge--truncate workbench-status-badge/)
  assert.match(reviewCss, /\.ms-review-callout\s*\{/)
  assert.doesNotMatch(reviewCss, /\.ms-(?:change-action|review-decision-badge)\b/)
  assert.doesNotMatch(reviewCss, /\.ms-review-callout__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(reviewCss, /\.ms-review-callout__header\s*\{[^}]*align-items:\s*center/)
  assert.doesNotMatch(reviewCss, /\.ms-review-callout__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(reviewCss, /\.ms-review-callout__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(reviewCss, /\.ms-review-stat\s*\{[^}]*font-size:/)
  assert.doesNotMatch(reviewCss, /\.ms-review-stat\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCss, /\.ms-review-callout\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-change-action-row\s*\{/)
})

test('review workspace UI is feature-owned, not shipped from packages/ui', () => {
  const reviewSource = readReviewSource()
  const reviewCss = readReviewCss()
  const projectStandardsWorkspaceReviewSource = readProjectFile('apps/frontend/src/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewUi.tsx')
  const projectStandardsWorkspaceReviewCss = readProjectFile('apps/frontend/src/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewUi.css')

  for (const removedPath of [
    'packages/ui/src/components/business/review/workspace/index.tsx',
    'packages/ui/src/components/business/review/workspace/styles.css',
    'packages/ui/src/components/business/review/workspace/upstream/index.tsx',
    'packages/ui/src/components/business/review/workspace/upstream/styles.css',
    'packages/ui/src/components/business/review/workspace/workspace/index.tsx',
    'packages/ui/src/components/business/review/workspace/workspace/styles.css',
    'packages/ui/src/components/business/review/workspace/shell/index.tsx',
    'packages/ui/src/components/business/review/workspace/empty-state/index.tsx',
    'packages/ui/src/components/business/review/workspace/empty-state/styles.css',
    'packages/ui/src/components/business/review/workspace/impact/index.tsx',
    'packages/ui/src/components/business/review/workspace/impact/styles.css',
    'packages/ui/src/components/business/review/workspace/footer-actions/index.tsx',
    'packages/ui/src/components/business/review/workspace/footer-actions/styles.css',
    'packages/ui/src/components/business/review/workspace/apply-gate/index.tsx',
    'packages/ui/src/components/business/review/workspace/apply-gate/styles.css',
  ]) {
    assert.equal(existsSync(path.join(root, removedPath)), false, `${removedPath} must not remain in packages/ui`)
  }

  assert.doesNotMatch(reviewSource, /ReviewWorkspace/)
  assert.doesNotMatch(reviewCss, /workspace\/styles\.css|review-workspace-/)
  assert.match(projectStandardsWorkspaceReviewSource, /export function ProjectStandardsWorkspaceReviewShell/)
  assert.match(projectStandardsWorkspaceReviewSource, /export function ProjectStandardsWorkspaceReviewArtifactPanel/)
  assert.match(projectStandardsWorkspaceReviewSource, /export function ProjectStandardsWorkspaceReviewFieldDiffRow/)
  assert.match(projectStandardsWorkspaceReviewCss, /\.project-standards-workspace-review-shell--contained-scroll/)
})

test('icon frames and centered controls share internal center classes', () => {
  const appSource = readAppSource()
  const layoutSource = readProjectFile('packages/ui/src/components/layout/index.tsx')
  const workbenchDataDisplaySource = readProjectFile('packages/ui/src/components/business/workbench/data-display/index.tsx')
  const metricCardSource = readProjectFile('packages/ui/src/components/primitives/metric-card.tsx')
  const emptyStateSource = readProjectFile('packages/ui/src/components/primitives/empty-state.tsx')
  const avatarSource = readProjectFile('packages/ui/src/components/primitives/avatar.tsx')
  const dialogSource = readProjectFile('packages/ui/src/components/primitives/dialog.tsx')
  const selectSource = readProjectFile('packages/ui/src/components/primitives/select.tsx')
  const tabsSource = readProjectFile('packages/ui/src/components/primitives/tabs.tsx')
  const uiCss = readProjectFile('packages/ui/src/base.css')

  for (const sharedClass of ['ms-center', 'ms-inline-center']) {
    assert.match(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui`)
  }
  assert.match(layoutSource, /ms-center ms-page-header__icon/)
  assert.match(metricCardSource, /ms-center ms-stat-card__icon/)
  assert.match(emptyStateSource, /ms-center ms-empty-state__icon/)
  assert.match(appSource, /iconClassName="app-metric-card__icon"/)
  assert.match(appSource, /iconClassName="app-empty-state__icon"/)
  assert.match(workbenchDataDisplaySource, /iconClassName="workbench-metric__icon"/)
  assert.match(workbenchDataDisplaySource, /iconClassName="workbench-empty-state__icon"/)
  assert.match(avatarSource, /ms-center ms-avatar__fallback/)
  assert.match(dialogSource, /ms-center ms-dialog__close/)
  assert.match(selectSource, /ms-center ms-select__scroll-button/)
  assert.match(tabsSource, /ms-inline-center ms-tabs__list/)
  assert.match(tabsSource, /ms-inline-center ms-tabs__trigger/)
})

test('card and agent package surfaces share internal frame classes', () => {
  const cardSource = readProjectFile('packages/ui/src/components/primitives/card.tsx')
  const frameSource = readProjectFile('packages/ui/src/components/primitives/frame.tsx')
  const dialogSource = readProjectFile('packages/ui/src/components/primitives/dialog.tsx')
  const agentSource = readAgentSource()
  const agentCss = readAgentCss()
  const uiCss = readProjectFile('packages/ui/src/base.css')

  assert.match(frameSource, /export const Frame\b/)
  assert.match(frameSource, /export const FrameHeader\b[\s\S]*ms-stack ms-frame__header/)
  assert.match(frameSource, /export const FrameBody\b[\s\S]*ms-frame__body/)
  assert.match(frameSource, /export const FrameActions\b[\s\S]*ms-action-row/)
  assert.match(cardSource, /\bFrameHeader\b[\s\S]*ms-card__header/)
  assert.match(cardSource, /\bFrameFooter\b[\s\S]*ms-card__footer/)
  assert.match(cardSource, /\bFrameActions\b[\s\S]*ms-card__action/)
  assert.match(dialogSource, /ms-stack ms-dialog__header/)
  assert.match(dialogSource, /ms-action-row ms-dialog__footer/)
  assert.match(dialogSource, /ms-frame__title ms-dialog__title/)
  assert.match(dialogSource, /ms-frame__description ms-dialog__description/)
  assert.match(agentSource, /ms-frame/)
  assert.match(agentSource, /ms-agent-tool/)
  assert.match(agentSource, /AgentToolCall[\s\S]*?<Frame[\s\S]*?className=\{cn\("ms-agent-frame ms-agent-tool"/)
  assert.match(agentSource, /AgentToolCall[\s\S]*?<FrameHeader className="ms-agent-tool__header"/)
  assert.match(agentSource, /AgentToolCall[\s\S]*?ms-agent-text ms-text-truncate ms-type-item ms-frame__title ms-agent-tool__title/)
  assert.match(agentSource, /AgentToolCall[\s\S]*?ms-type-label ms-agent-tool__meta/)
  assert.match(agentSource, /AgentToolCall[\s\S]*?<FrameBody className="ms-type-item ms-agent-tool__content"/)
  assert.match(agentSource, /AgentStepList[\s\S]*?className=\{cn\("ms-stack ms-agent-steps"/)
  assert.match(agentSource, /AgentStep[\s\S]*?className=\{cn\("ms-type-item ms-agent-step"/)
  assert.doesNotMatch(agentSource, /AgentToolCall[\s\S]*?<Surface/)
  assert.doesNotMatch(agentCss, /\.ms-agent-tool__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-tool__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-tool__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-tool__content\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-steps\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-steps\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(agentCss, /\.ms-agent-step\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-step\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentSource, /ms-agent-instruction/)
  assert.doesNotMatch(agentSource, /ms-agent-rail-section/)
  assert.match(uiCss, /\.ms-frame\s*\{/)
  assert.match(uiCss, /\.ms-frame__header\s*\{/)
  assert.match(uiCss, /\.ms-frame__title\s*\{/)
  assert.match(uiCss, /\.ms-stack\s*\{/)
  assert.match(uiCss, /\.ms-action-row\s*\{/)
  assert.match(uiCss, /\.ms-action-row\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(uiCss, /\.ms-grid-stack\s*\{[\s\S]*?display:\s*grid/)
  assert.match(uiCss, /\.ms-grid-stack\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(uiCss, /\.ms-inline-center\s*\{[\s\S]*?flex-shrink:\s*0/)
  assert.match(uiCss, /\.ms-inline-center > svg\s*\{[\s\S]*?display:\s*block/)
  assert.match(uiCss, /\.ms-text-truncate\s*\{/)
})

test('agent package data blocks share internal field classes', () => {
  const agentSource = readAgentSource()
  const activityFeedSource = readAgentActivityFeedSource()
  const activityFeedUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentActivityFeed.tsx')
  const activityFeedCss = readAgentActivityFeedCss()
  const diagnosticSource = readAgentDiagnosticSource()
  const diagnosticCss = readAgentDiagnosticCss()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()

  for (const componentClass of ['ms-agent-metric', 'ms-agent-data-block']) {
    assert.match(agentSource, new RegExp(`ms-agent-field ${componentClass}`), `${componentClass} must share ms-agent-field`)
  }
  assert.match(agentSource, /export const AgentDataBlock/)
  assert.match(agentSource, /AgentDataBlockProps[\s\S]*?asChild\?: boolean/)
  assert.match(agentSource, /if \(asChild\) \{[\s\S]*?<AsChildSlot/)
  assert.match(activityFeedSource, /AgentActivityCodePanel[\s\S]*?<AgentDataBlock className="ms-type-tiny ms-agent-activity-code-panel__body"/)
  assert.match(activityFeedSource, /AgentActivityFeedRoot[\s\S]*?"ms-type-label ms-agent-activity-feed"/)
  assert.match(activityFeedSource, /AgentActivityTotals[\s\S]*?"ms-type-tiny ms-agent-activity-feed__totals"/)
  assert.match(activityFeedSource, /AgentActivityStatusLine[\s\S]*?"ms-action-row ms-agent-activity-status-line"/)
  assert.match(activityFeedSource, /AgentActivityStatusLine[\s\S]*?"ms-action-row ms-type-caption ms-agent-activity-status-line__content"/)
  assert.match(activityFeedSource, /AgentActivityStatusLine[\s\S]*?"ms-text-truncate ms-agent-activity-status-line__label"/)
  assert.match(activityFeedSource, /AgentActivityDividerActions[\s\S]*?"ms-action-row ms-agent-activity-divider-actions"/)
  assert.match(activityFeedSource, /AgentActivityMenuIcon[\s\S]*?"ms-inline-center ms-agent-activity-menu-icon"/)
  assert.match(activityFeedSource, /AgentActivityRoundHeader[\s\S]*?"ms-action-row ms-type-tiny ms-agent-activity-round__header"/)
  assert.match(activityFeedSource, /AgentActivityRoundHeader[\s\S]*?"ms-action-row ms-text-truncate ms-type-tiny ms-agent-activity-round__label"/)
  assert.match(activityFeedSource, /AgentActivityRoundEmpty[\s\S]*?"ms-type-caption ms-agent-activity-round__empty"/)
  assert.match(activityFeedSource, /AgentActivityLineRow[\s\S]*?"ms-action-row ms-agent-activity-line-row"/)
  assert.match(activityFeedSource, /AgentActivityKindLabel[\s\S]*?"ms-type-tiny ms-agent-activity-kind-label"/)
  assert.match(activityFeedSource, /AgentActivityLineText[\s\S]*?"ms-text-truncate ms-agent-activity-line-text"/)
  assert.match(activityFeedSource, /AgentActivityDuration[\s\S]*?"ms-type-tiny ms-agent-activity-duration"/)
  assert.match(activityFeedSource, /AgentActivityFrameHeader[\s\S]*?"ms-action-row ms-agent-activity-frame__header"/)
  assert.match(activityFeedSource, /AgentActivityFrameTitle[\s\S]*?"ms-text-truncate ms-type-caption ms-agent-activity-frame__title"/)
  assert.match(activityFeedSource, /AgentActivityFrameLine[\s\S]*?"ms-type-caption ms-agent-activity-frame__line"/)
  assert.match(activityFeedSource, /className="ms-type-tiny ms-agent-activity-code-panel__header"/)
  assert.match(activityFeedUiSource, /className="ms-text-truncate ms-agent-activity-round__label-text"/)
  assert.match(activityFeedUiSource, /className="ms-action-row ms-agent-activity-round__pager"/)
  assert.match(activityFeedUiSource, /className="ms-inline-center ms-agent-activity-round__pager-button"/)
  assert.match(activityFeedUiSource, /className="ms-type-tiny ms-tabular-nums ms-agent-activity-round__pager-count"/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-feed\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-feed__totals\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-status-line\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-status-line__content\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-status-line__content\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-status-line__content\s*\{[^}]*line-height:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-status-line__label\s*\{/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-divider-actions\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-menu-icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__pager-count\s*\{[^}]*font-variant-numeric:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-line-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-frame__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-frame__title\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-frame__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-frame__line\s*\{[^}]*line-height:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-code-panel__header\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-code-panel__body\s*\{[^}]*line-height:/)
  assert.match(diagnosticSource, /AgentDiagnosticSummaryItem[\s\S]*?<AgentDataBlock className=\{cn\("ms-agent-diagnostic-summary-item"/)
  assert.match(diagnosticSource, /className="ms-type-tiny ms-agent-diagnostic-summary-item__label"/)
  assert.match(diagnosticSource, /className="ms-text-truncate ms-type-caption ms-agent-diagnostic-summary-item__value"/)
  assert.match(diagnosticSource, /AgentDiagnosticHeader[\s\S]*?"ms-action-row ms-agent-diagnostic-card__header"/)
  assert.match(diagnosticSource, /AgentDiagnosticTitle[\s\S]*?"ms-action-row ms-type-label ms-agent-diagnostic-card__title"/)
  assert.match(diagnosticSource, /AgentDiagnosticDescription[\s\S]*?"ms-type-caption ms-agent-diagnostic-card__description"/)
  assert.match(diagnosticSource, /AgentDiagnosticDisclosure[\s\S]*?className="ms-action-row ms-type-caption ms-agent-diagnostic-disclosure__summary"/)
  assert.match(diagnosticSource, /AgentDiagnosticDisclosure[\s\S]*?className="ms-action-row ms-agent-diagnostic-disclosure__title"/)
  assert.match(diagnosticSource, /AgentDiagnosticDisclosure[\s\S]*?className="ms-inline-center ms-agent-diagnostic-disclosure__icon"/)
  assert.match(diagnosticSource, /AgentDiagnosticDisclosure[\s\S]*?className="ms-type-tiny ms-agent-diagnostic-disclosure__count"/)
  assert.match(diagnosticSource, /AgentDiagnosticCodeBlock[\s\S]*?size === "sm" \? "ms-type-tiny" : "ms-type-caption"/)
  assert.match(diagnosticSource, /AgentDiagnosticBadge[\s\S]*?"ms-type-tiny ms-agent-diagnostic-badge"/)
  assert.match(diagnosticSource, /AgentDiagnosticStatusBadge[\s\S]*?"ms-type-tiny ms-agent-diagnostic-badge"/)
  assert.match(diagnosticSource, /AgentDiagnosticWarnings[\s\S]*?"ms-type-caption ms-agent-diagnostic-warnings"/)
  assert.match(diagnosticSource, /AgentDiagnosticEntryHeader[\s\S]*?"ms-action-row ms-agent-diagnostic-entry__header"/)
  assert.match(diagnosticSource, /AgentDiagnosticEntryTitle[\s\S]*?"ms-text-truncate ms-type-caption ms-agent-diagnostic-entry__title"/)
  assert.match(diagnosticSource, /AgentDiagnosticEntryMeta[\s\S]*?"ms-type-tiny ms-agent-diagnostic-entry__meta"/)
  assert.match(diagnosticSource, /AgentDiagnosticToolHeader[\s\S]*?"ms-action-row ms-agent-diagnostic-tool__header"/)
  assert.match(diagnosticSource, /AgentDiagnosticToolName[\s\S]*?"ms-text-truncate ms-type-caption ms-agent-diagnostic-tool__name"/)
  assert.match(diagnosticSource, /AgentDiagnosticToolText[\s\S]*?"ms-type-tiny ms-agent-diagnostic-tool__text"/)
  assert.doesNotMatch(activityFeedSource, /ms-agent-field ms-agent-data-block/)
  assert.doesNotMatch(diagnosticSource, /ms-agent-field ms-agent-data-block/)
  assert.match(agentCss, /\.ms-agent-field\s*\{/)
  assert.match(agentCss, /\.ms-agent-data-block\s*\{/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__header\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__label\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__pager-count\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__empty\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-kind-label\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-line-text\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-duration\s*\{[^}]*font-size:/)
  assert.doesNotMatch(activityFeedCss, /\.ms-agent-activity-round__pager-button\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(diagnosticCss, /@import "\.\/warnings\/styles\.css"/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-summary-item__label\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-summary-item__value\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-summary-item__value\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-disclosure__summary\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-disclosure__summary\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-disclosure__title\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-disclosure__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-disclosure__count\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-code\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-code\s*\{[^}]*line-height:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-code\[data-size="sm"\]\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-badge\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-badge\s*\{[^}]*line-height:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-warnings\s*\{/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-card\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-card__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-card__title\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-card__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-card__description\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-card__description\s*\{[^}]*line-height:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-entry__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-entry__title\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-entry__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-entry__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-tool\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-tool__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-tool__name\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-tool__text\s*\{[^}]*font-size:/)
  assert.doesNotMatch(diagnosticCss, /\.ms-agent-diagnostic-tool__text\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCss, /\.ms-agent-field\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-data-block\s*\{/)
})

test('agent run activity package API only exposes consumed pieces', () => {
  const runActivitySource = readProjectFile('packages/ui/src/components/business/agent/run-activity/index.tsx')
  const runActivityDisclosureSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/disclosure/index.tsx')
  const runActivityDisclosureCss = readProjectFile('packages/ui/src/components/business/agent/run-activity/disclosure/styles.css')
  const runActivityItemSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/item/index.tsx')
  const runActivityItemCss = readProjectFile('packages/ui/src/components/business/agent/run-activity/item/styles.css')
  const runActivityStatusSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/status/index.tsx')
  const runActivityStatusCss = readProjectFile('packages/ui/src/components/business/agent/run-activity/status/styles.css')
  const runActivityCodeSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/code/index.tsx')
  const runActivityCodeCss = readProjectFile('packages/ui/src/components/business/agent/run-activity/code/styles.css')
  const runActivityNoticeSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/notice/index.tsx')
  const runActivityStylesSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/styles.css')
  const runActivityBubbleSource = readProjectFile('packages/ui/src/components/business/agent/run-activity/bubble/index.tsx')
  const runActivityBubbleCss = readProjectFile('packages/ui/src/components/business/agent/run-activity/bubble/styles.css')
  const runActivityPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx')

  for (const consumedName of [
    'AgentRunActivityBubble',
    'AgentRunActivityDetailButton',
    'AgentRunActivityDisclosure',
    'AgentRunActivityEmpty',
    'AgentRunActivityItem',
    'AgentRunActivityStatusBadge',
    'AgentRunActivityChatBadge',
  ]) {
    assert.match(runActivityPanelSource, new RegExp(`\\b${consumedName}\\b`))
  }

  for (const legacyName of [
    'AgentRunActivityBubbleFrame',
    'AgentRunActivityBubbleButton',
    'AgentRunActivityTitle',
    'AgentRunActivityMeta',
    'AgentRunActivitySummaryText',
  ]) {
    assert.doesNotMatch(runActivitySource, new RegExp(`\\b${legacyName}\\b`))
    assert.doesNotMatch(runActivityBubbleSource, new RegExp(`export const ${legacyName}\\b`))
    assert.doesNotMatch(runActivityDisclosureSource, new RegExp(`export (?:const|interface) ${legacyName}\\b`))
  }

  assert.doesNotMatch(runActivityBubbleCss, /ms-agent-run-activity-bubble__(?:frame|button)/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/run-activity/notice/styles.css')), false)
  assert.doesNotMatch(runActivityStylesSource, /notice\/styles\.css/)
  assert.match(runActivityItemSource, /ms-action-row ms-agent-run-activity-item__row/)
  assert.match(runActivityItemSource, /ms-action-row ms-agent-run-activity-item__header/)
  assert.match(runActivityItemSource, /ms-text-truncate ms-type-caption ms-agent-run-activity-item__title/)
  assert.match(runActivityItemSource, /ms-action-row ms-type-tiny ms-agent-run-activity-item__meta/)
  assert.match(runActivityItemSource, /ms-type-caption ms-agent-run-activity-item__summary/)
  assert.doesNotMatch(runActivityItemCss, /\.ms-agent-run-activity-item__row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(runActivityItemCss, /\.ms-agent-run-activity-item__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(runActivityItemCss, /\.ms-agent-run-activity-item__title\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(runActivityItemCss, /\.ms-agent-run-activity-item__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(runActivityItemCss, /\.ms-agent-run-activity-item__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(runActivityItemCss, /\.ms-agent-run-activity-item__summary\s*\{[^}]*line-height:/)
  assert.match(runActivityDisclosureSource, /ms-type-label ms-agent-run-activity/)
  assert.match(runActivityDisclosureSource, /ms-action-row ms-agent-run-activity__summary/)
  assert.match(runActivityDisclosureSource, /ms-action-row ms-agent-run-activity__title/)
  assert.match(runActivityDisclosureSource, /ms-inline-center ms-agent-run-activity__icon/)
  assert.match(runActivityDisclosureSource, /ms-text-truncate ms-agent-run-activity__title-text/)
  assert.match(runActivityDisclosureSource, /ms-action-row ms-agent-run-activity__meta/)
  assert.match(runActivityDisclosureSource, /ms-type-tiny ms-agent-run-activity__summary-text/)
  assert.match(runActivityDisclosureSource, /ms-type-caption ms-agent-run-activity-empty/)
  assert.doesNotMatch(runActivityDisclosureCss, /\.ms-agent-run-activity\s*\{[^}]*font-size:/)
  assert.doesNotMatch(runActivityDisclosureCss, /\.ms-agent-run-activity__summary\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(runActivityDisclosureCss, /\.ms-agent-run-activity__title\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(runActivityDisclosureCss, /\.ms-agent-run-activity__title-text\s*\{/)
  assert.doesNotMatch(runActivityDisclosureCss, /\.ms-agent-run-activity__meta\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(runActivityDisclosureCss, /\.ms-agent-run-activity__summary-text\s*\{[^}]*font-size:/)
  assert.match(runActivityBubbleSource, /ms-type-label ms-agent-run-activity-bubble/)
  assert.match(runActivityBubbleSource, /ms-type-tiny ms-agent-run-activity-detail-button/)
  assert.doesNotMatch(runActivityBubbleCss, /\.ms-agent-run-activity-bubble\s*\{[^}]*font-size:/)
  assert.doesNotMatch(runActivityBubbleCss, /\.ms-agent-run-activity-detail-button\s*\{[^}]*font-size:/)
  assert.match(runActivityCodeSource, /ms-type-tiny ms-agent-run-activity-code__summary/)
  assert.match(runActivityCodeSource, /ms-type-tiny ms-agent-run-activity-code__content/)
  assert.doesNotMatch(runActivityCodeCss, /\.ms-agent-run-activity-code__summary\s*\{[^}]*font-size:/)
  assert.doesNotMatch(runActivityCodeCss, /\.ms-agent-run-activity-code__content\s*\{[^}]*line-height:/)
  assert.match(runActivityNoticeSource, /ms-type-caption ms-agent-run-activity-notice/)
  assert.match(runActivityStatusSource, /ms-type-tiny ms-agent-run-activity-status/)
  assert.match(runActivityStatusSource, /ms-type-tiny ms-agent-run-activity-chat-badge/)
  assert.doesNotMatch(runActivityStatusCss, /\.ms-agent-run-activity-status\s*\{[^}]*font-size:/)
  assert.doesNotMatch(runActivityStatusCss, /\.ms-agent-run-activity-chat-badge\s*\{[^}]*font-size:/)
})

test('agent generated result, candidate, and feedback UI are feature-owned instead of package API', () => {
  const agentIndexSource = readProjectFile('packages/ui/src/components/business/agent/index.tsx')
  const agentStylesSource = readProjectFile('packages/ui/src/components/business/agent/styles.css')
  const generatedResultCardSource = readProjectFile('apps/frontend/src/features/agent/components/GeneratedResultCard.tsx')
  const generatedResultCardCss = readProjectFile('apps/frontend/src/features/agent/components/GeneratedResultCard.css')
  const generatedCandidateDialogSource = [
    readProjectFile('apps/frontend/src/features/agent/components/GeneratedCandidateAttachDialog.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/GeneratedCandidateAttachDialogUi.tsx'),
  ].join('\n')
  const generatedCandidateDialogCss = readProjectFile('apps/frontend/src/features/agent/components/GeneratedCandidateAttachDialog.css')
  const generationCardsSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.tsx')
  const generationCardUiSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCardUi.tsx')
  const generationCardsCss = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.css')

  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/generated')), false)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/generated/media-preview')), false)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/generated/result-card')), false)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/generated/candidate-dialog')), false)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/generated/viewer')), false)
  assert.doesNotMatch(agentIndexSource, /\.\/generated|AgentGenerated/)
  assert.doesNotMatch(agentStylesSource, /generated\/styles/)
  assert.match(generatedResultCardSource, /function GeneratedResultCardShell/)
  assert.match(generatedResultCardSource, /function GeneratedResultActionButton/)
  assert.match(generatedResultCardSource, /function GeneratedMediaPreviewButton/)
  assert.match(generatedCandidateDialogSource, /function GeneratedCandidateDialogContent/)
  assert.match(generatedCandidateDialogSource, /function GeneratedCandidateTargetItem/)
  assert.match(generatedCandidateDialogSource, /function GeneratedViewerSidePanel/)
  assert.match(generationCardUiSource, /function AgentGeneratedCard/)
  assert.match(generationCardUiSource, /function AgentGeneratedProgressBar[\s\S]*?<AppProgressBar/)
  assert.match(generationCardUiSource, /function AgentGeneratedStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(generationCardUiSource, /function AgentGeneratedCard[\s\S]*?<AgentSurfaceBlock/)
  assert.match(generationCardUiSource, /function AgentGeneratedItem[\s\S]*?<AgentSurfaceBlock/)
  assert.match(generatedResultCardSource, /<GeneratedResultCardShell data-testid="agent-generated-result-card"/)
  assert.match(generatedResultCardSource, /<GeneratedMediaPreviewButton[\s\S]*?data-testid="agent-generated-media-preview"/)
  assert.match(generatedCandidateDialogSource, /<GeneratedCandidateDialogContent data-testid=\{viewerAttachment \? 'agent-generated-resource-candidate' : 'agent-generated-bulk-candidate'\}/)
  assert.match(generatedResultCardCss, /\.agent-generated-result-card\s*\{/)
  assert.match(generatedResultCardCss, /\.agent-generated-result-item\s*\{/)
  assert.match(generatedResultCardCss, /\.agent-generated-media-preview\s*\{/)
  assert.match(generatedCandidateDialogCss, /\.agent-generated-candidate-dialog\s*\{/)
  assert.match(generatedCandidateDialogCss, /\.agent-generated-candidate-target-list\s*\{/)
  assert.match(generatedCandidateDialogCss, /\.agent-generated-viewer-panel\s*\{/)
  assert.match(generationCardsCss, /\.agent-generated-card\s*\{/)
  assert.match(generationCardsCss, /\.agent-generated-progress-bar\s*\{/)
  assert.doesNotMatch(generatedResultCardSource, /\bAgentGeneratedResult/)
  assert.doesNotMatch(generatedResultCardSource, /\bAgentGeneratedMediaPreviewButton\b/)
  assert.doesNotMatch(generatedResultCardSource, /\bAgentGeneratedMediaPreview\b/)
  assert.doesNotMatch(generatedCandidateDialogSource, /\bAgentGeneratedCandidate/)
  assert.doesNotMatch(generatedCandidateDialogSource, /\bAgentGeneratedViewer/)
})

test('agent surface blocks own reusable shell and row styling', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()
  const agentConsoleSource = [
    readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePageSections.tsx'),
  ].join('\n')
  const agentConsoleRealtimeLogPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogPanel.tsx')
  const agentConsoleCapabilityPanelsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleCapabilityPanels.tsx')
  const agentConsoleSurfaceSource = `${agentConsoleSource}\n${agentConsoleCapabilityPanelsSource}`
  const agentConsoleUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleUi.tsx')
  const agentConsoleUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleUi.css')
  const movScriptWorkspaceFilesSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  const agentSettingsPartsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPageParts.tsx')
  const agentSettingsApiModePanelsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsApiModePanels.tsx')
  const agentSettingsAuditPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsAuditPanel.tsx')
  const agentSettingsDiffPanelsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsDiffPanels.tsx')
  const agentSettingsRowsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsRows.tsx')
  const agentSettingsSnapshotPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsSnapshotPanel.tsx')
  const agentSettingsModelPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsModelPanel.tsx')
  const agentSettingsSkillSectionSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsSkillSection.tsx')
  const agentSettingsToolPermissionsSectionSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsToolPermissionsSection.tsx')
  const agentSettingsConfigFileDetailsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsConfigFileDetailsSection.tsx')
  const agentSettingsOverviewPanelsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsOverviewPanels.tsx')
  const agentSettingsUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsUi.tsx')
  const agentSettingsSkillUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsSkillUi.tsx')
  const agentSettingsStatusUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsStatusUi.tsx')
  const agentSettingsStatusUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsStatusUi.css')
  const agentSettingsToolPermissionsUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsToolPermissionsUi.tsx')
  const agentSettingsToolPermissionsUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsToolPermissionsUi.css')
  const agentSettingsSnapshotUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsSnapshotUi.tsx')
  const agentSettingsUiTypesSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsUi.types.ts')
  const agentSettingsUiRecipesSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsUi.recipes.ts')
  const agentSettingsConfigFileUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsConfigFileUi.tsx')
  const agentSettingsConfigFileUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsConfigFileUi.css')
  const agentSettingsUiModuleSource = [
    agentSettingsUiSource,
    agentSettingsSkillUiSource,
    agentSettingsStatusUiSource,
    agentSettingsToolPermissionsUiSource,
    agentSettingsSnapshotUiSource,
    agentSettingsConfigFileUiSource,
    agentSettingsUiTypesSource,
    agentSettingsUiRecipesSource,
  ].join('\n')
  const agentSettingsUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentSettingsUi.css')
  const agentBrowserSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx')
  const agentBrowserHeaderSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserPanelHeader.tsx')
  const agentBrowserTabContentSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserTabContent.tsx')
  const agentBrowserProjectHomeSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePage.tsx')
  const agentBrowserBlankWebTabSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserBlankWebTab.tsx')
  const agentBrowserUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserUi.tsx')
  const agentBrowserUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserUi.css')
  const agentBrowserInternalPageUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserInternalPageUi.tsx')
  const agentBrowserInternalPageUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserInternalPageUi.css')
  const agentBrowserSurfaceSource = `${agentBrowserSource}\n${agentBrowserHeaderSource}\n${agentBrowserTabContentSource}\n${agentBrowserProjectHomeSource}\n${agentBrowserBlankWebTabSource}`
  const pinnedStatusShelfSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
  const pinnedStatusUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusUi.tsx')
  const pinnedStatusUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusUi.css')
  const agentConsoleNavSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleNav.tsx')
  const agentConsoleNavUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleNavUi.tsx')
  const agentConsoleNavUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleNavUi.css')
  const agentComposerUiSource = readProjectFile('apps/frontend/src/shared/ui/AgentComposerUi.tsx')
  const agentComposerUiCss = readProjectFile('apps/frontend/src/shared/ui/AgentComposerUi.css')
  const agentResultSurfaceSources = [
    'apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanOverviewPanel.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanOverviewWorkerSection.tsx',
    'apps/frontend/src/features/agent/components/GeneratedResultCard.tsx',
    'apps/frontend/src/features/agent/components/GeneratedCandidateAttachDialog.tsx',
    'apps/frontend/src/features/agent/components/ContextDiagnosticCard.tsx',
    'apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx',
    'apps/frontend/src/features/agent/components/AgentMentionEditor.tsx',
    'apps/frontend/src/features/agent/components/AgentMessageContent.tsx',
    'apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx',
    'apps/frontend/src/features/agent/components/AgentComposerSection.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const sources = agentConsoleSurfaceSource
  const agentSettingsSectionSource = [
    agentSettingsSource,
    agentSettingsPartsSource,
    agentSettingsApiModePanelsSource,
    agentSettingsAuditPanelSource,
    agentSettingsDiffPanelsSource,
    agentSettingsRowsSource,
    agentSettingsSnapshotPanelSource,
    agentSettingsModelPanelSource,
    agentSettingsSkillSectionSource,
    agentSettingsToolPermissionsSectionSource,
    agentSettingsConfigFileDetailsSource,
    agentSettingsOverviewPanelsSource,
  ].join('\n')
  const agentSettingsOwnershipSource = `${agentSettingsSectionSource}\n${agentSettingsUiModuleSource}`
  const migratedSettingsSurfaceIds = [
    'agent-settings-config-file-limits',
    'agent-settings-config-file-skill-activation',
    'agent-settings-tool-permissions-filters',
    'agent-settings-tool-permissions-filter-presets',
    'agent-settings-tool-permissions-bulk-actions',
    'agent-settings-snapshot-import-scopes',
    'agent-settings-snapshot-impact',
    'agent-settings-tool-permissions-diff',
    'agent-settings-model-compatibility-probes',
    'agent-settings-api-mode-migration-guide',
    'agent-settings-api-mode-switch-taskGraph',
  ]

  assert.match(agentSource, /export const AgentSurfaceBlock/)
  assert.match(agentSource, /AgentSurfaceBlockProps[\s\S]*?asChild\?: boolean/)
  assert.match(agentComposerUiSource, /export const AgentComposerDropOverlay/)
  assert.match(agentComposerUiSource, /export const AgentComposerToolbar/)
  assert.match(agentComposerUiSource, /export const AgentComposerAction/)
  assert.match(agentComposerUiSource, /export const AgentComposerSubmit/)
  assert.doesNotMatch(agentSource, /export \* from "\.\/composer"/)
  assert.match(agentSource, /ms-agent-frame ms-agent-surface-block/)
  assert.match(agentSource, /emphasis=\{variant === "card" \? "raised" : variant === "subtle" \? "muted" : "plain"\}/)
  assert.match(agentSource, /export const AgentInlineEmpty/)
  assert.match(agentCss, /\.ms-agent-frame\s*\{[\s\S]*--ui-surface-border:\s*color-mix\(in srgb, var\(--ms-color-border\) 78%, transparent\)/)
  assert.match(agentCss, /\.ms-agent-surface-block\s*\{/)
  assert.doesNotMatch(agentCss, /\.ms-agent-surface-block(?:--(?:subtle|card))?\s*\{[^}]*--ui-surface-/)
  assert.match(agentComposerUiCss, /\.ms-agent-composer__drop-overlay\s*\{/)
  assert.doesNotMatch(agentCss, /\.ms-agent-composer__drop-overlay\s*\{/)
  assert.match(agentCss, /\.ms-agent-inline-empty\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-surface-block\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-surface-block--subtle\s*\{/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/console')), false, 'agent console UI must not remain in packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/settings')), false, 'agent settings UI must not remain in packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/composer')), false, 'agent composer UI must be app-owned')
  assert.doesNotMatch(agentSource, /export \* from "\.\/console"/)
  assert.doesNotMatch(agentSource, /export \* from "\.\/settings"/)
  assert.doesNotMatch(agentCss, /@import "\.\/composer\/styles\.css"/)
  assert.doesNotMatch(agentCss, /@import "\.\/console\/styles\.css"/)
  assert.doesNotMatch(agentCss, /@import "\.\/settings\/styles\.css"/)
  assert.match(agentConsoleUiSource, /AgentSurfaceBlock/)
  assert.match(movScriptWorkspaceFilesSource, /MovScriptWorkspaceFilesPage/)
  assert.match(movScriptWorkspaceFilesSource, /<AgentPageShell data-testid="movscript-workspace-files-page">/)
  assert.match(movScriptWorkspaceFilesSource, /\bAgentPageShellHeader\b/)
  assert.match(movScriptWorkspaceFilesSource, /from '@\/features\/agent\/components\/AgentPageUi'/)
  assert.match(movScriptWorkspaceFilesSource, /\bAgentWorkspacesPageBody\b/)
  assert.match(movScriptWorkspaceFilesSource, /\brequireWorkspaceFilesAPI\b/)
  assert.doesNotMatch(movScriptWorkspaceFilesSource, /\bAIWorkspacesPage\b/)
  assert.doesNotMatch(movScriptWorkspaceFilesSource, /\bagentWorkspaceFiles\b/)
  assert.match(agentConsoleSurfaceSource, /<AgentConsoleLocalToolCard invalid=\{!provider\.ok\}>/)
  assert.match(agentConsoleSurfaceSource, /<AgentConsoleLocalToolCard invalid=\{!result\.ok\}>/)
  assert.match(agentConsoleSource, /<AgentConsoleLocalToolCard invalid=\{Boolean\(error\) \|\| !appServerEnabled\}>/)
  assert.match(agentConsoleSource, /function ConsoleMetricCard[\s\S]*?<AgentConsoleMetricCard/)
  assert.match(agentConsoleUiSource, /function AgentConsoleLocalToolCard[\s\S]*?<AgentConsoleToneSurfaceBlock[\s\S]*?tone=\{invalid \? "danger" : undefined\}/)
  assert.match(agentConsoleUiSource, /AgentConsoleToneSurfaceBlock[\s\S]*?toneSurfaceClass\(tone\)/)
  assert.match(agentConsoleUiSource, /AgentConsoleMetricCard[\s\S]*?tone === "action" \? XCircle/)
  assert.match(agentConsoleUiCss, /\.agent-console-panel\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-page-body\s*\{/)
  assert.doesNotMatch(movScriptWorkspaceFilesSource, /<pre\b/)
  assert.doesNotMatch(sources, /rounded-md border border-border bg-(?:background|muted\/10|card)/)
  assert.match(agentResultSurfaceSources, /AgentSurfaceBlock/)
  const agentBrowserShellExportNames = [
    'AgentBrowserRoot',
    'AgentBrowserHeader',
    'AgentBrowserTabSurface',
    'AgentBrowserTabButton',
    'AgentBrowserTabCloseButton',
    'AgentBrowserIconButton',
    'AgentBrowserMenuContent',
    'AgentBrowserToolbar',
    'AgentBrowserUrlMeta',
    'AgentBrowserLauncherForm',
    'AgentBrowserInlineError',
    'AgentBrowserViewport',
  ]
  const agentBrowserInternalPageExportNames = [
    'AgentBrowserBlankForm',
    'AgentBrowserNavButton',
    'AgentBrowserProjectEmpty',
    'AgentBrowserKeyValue',
    'AgentBrowserDataBlock',
  ]
  const consumedAgentBrowserInternalPageExportNames = agentBrowserInternalPageExportNames.filter((exportName) => (
    exportName !== 'AgentBrowserDataBlock'
  ))
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/browser')), false, 'agent browser UI must not remain in packages/ui')
  assert.doesNotMatch(agentSource, /export \* from "\.\/browser"/)
  assert.doesNotMatch(agentCss, /@import "\.\/browser\/styles\.css"/)
  for (const exportName of agentBrowserShellExportNames) {
    assert.match(agentBrowserUiSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(agentSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} must not be package-owned`)
  }
  for (const exportName of agentBrowserShellExportNames) {
    assert.match(agentBrowserSurfaceSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent browser panel`)
  }
  for (const exportName of agentBrowserInternalPageExportNames) {
    assert.doesNotMatch(agentSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} must not remain package-owned`)
    assert.match(agentBrowserInternalPageUiSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} must be feature-owned`)
  }
  for (const exportName of consumedAgentBrowserInternalPageExportNames) {
    assert.match(agentBrowserSurfaceSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent browser internal pages`)
  }
  assert.match(agentBrowserUiSource, /function AgentBrowserTabSurface[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentBrowserUiSource, /function AgentBrowserTabButton[\s\S]*?<Button/)
  assert.match(agentBrowserInternalPageUiSource, /function AgentBrowserNavButton[\s\S]*?<AppIconFrame/)
  assert.match(agentBrowserInternalPageUiSource, /function AgentBrowserKeyValue[\s\S]*?<AppKeyValue/)
  assert.match(agentBrowserUiSource, /function AgentBrowserInlineError[\s\S]*?<AppInlineError/)
  assert.match(agentBrowserUiSource, /function AgentBrowserUrlMeta[\s\S]*?<AppInlineMeta/)
  assert.match(agentBrowserInternalPageUiSource, /function AgentBrowserDataBlock[\s\S]*?<AgentDataBlock/)
  assert.match(agentBrowserUiCss, /\.agent-browser-root\s*\{/)
  assert.match(agentBrowserUiCss, /\.agent-browser-tab-button\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-browser-root\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-browser-tab-button\s*\{/)
  assert.match(agentBrowserInternalPageUiCss, /\.agent-browser-project-page\s*\{/)
  assert.match(agentBrowserInternalPageUiCss, /\.agent-session-output\s*\{/)
  assert.match(agentBrowserSurfaceSource, /tabs\.map\(\(tab\)[\s\S]*?<AgentBrowserTabSurface/)
  assert.match(agentBrowserSurfaceSource, /navItems\.map\(\(item\)[\s\S]*?<AgentBrowserNavButton/)
  assert.match(agentBrowserSurfaceSource, /rows\.map\(\(\[label, value\]\)[\s\S]*?<AgentBrowserKeyValue/)
  assert.doesNotMatch(agentBrowserSurfaceSource, /\b(?:AgentDataBlock|AgentSurfaceBlock|AppIconFrame|AppInlineError|AppInlineMeta|AppKeyValue|Badge|Button|Input|cn)\b/)
  assert.doesNotMatch(agentBrowserSurfaceSource, /className=/)
  assert.doesNotMatch(agentBrowserSurfaceSource, /<button\b/)
  assert.doesNotMatch(agentBrowserSurfaceSource, /rounded-md bg-muted\/60/)
  assert.doesNotMatch(agentBrowserSurfaceSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(agentBrowserSurfaceSource, /rounded-md border border-border bg-muted\/20/)
  assert.doesNotMatch(agentBrowserSource, /rounded-md border border-destructive\/30 bg-destructive\/5/)
  for (const exportName of [
    'AgentPinnedStatusRoot',
    'AgentPinnedStatusSurface',
    'AgentPinnedStatusHeader',
    'AgentPinnedStatusTabGroup',
    'AgentPinnedStatusTabButton',
    'AgentPinnedStatusBody',
    'AgentPinnedStatusList',
    'AgentPinnedStatusEmpty',
    'AgentPinnedStatusWorkerRow',
    'AgentPinnedStatusGenerationLine',
    'AgentPinnedStatusPlanHeader',
    'AgentPinnedStatusPlanStep',
    'AgentPinnedStatusInlineAction',
    'AgentPinnedStatusTruncatedText',
  ]) {
    assert.match(pinnedStatusUiSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(agentSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must not be package-owned`)
    assert.match(pinnedStatusShelfSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by pinned status shelf`)
  }
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/pinned-status')), false, 'agent pinned status UI must not remain in packages/ui')
  assert.doesNotMatch(agentSource, /export \* from "\.\/pinned-status"/)
  assert.doesNotMatch(agentCss, /@import "\.\/pinned-status\/styles\.css"/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusTabGroup[\s\S]*?<AppControlGroup/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusProgress[\s\S]*?<AppProgressBar/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusBadge[\s\S]*?<Badge/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusTabButton[\s\S]*?<Button/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusEmpty[\s\S]*?<AgentInlineEmpty/)
  assert.match(pinnedStatusUiCss, /\.agent-pinned-status-root\s*\{/)
  assert.match(pinnedStatusUiCss, /\.agent-pinned-status-tab\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-pinned-status-root\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-pinned-status-tab\s*\{/)
  assert.match(pinnedStatusShelfSource, /<AgentPinnedStatusTabGroup>[\s\S]*?views\.map\(\(view\)/)
  assert.match(pinnedStatusShelfSource, /views\.map\(\(view\)[\s\S]*?<AgentPinnedStatusTabButton[\s\S]*?active=\{activeView === view\.id\}/)
  assert.doesNotMatch(pinnedStatusShelfSource, /\b(?:AgentInlineEmpty|AgentSurfaceBlock|AppControlGroup|AppProgressBar|Badge|Button)\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /className=/)
  assert.doesNotMatch(pinnedStatusShelfSource, /<button\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /rounded-md bg-muted\/60/)
  assert.doesNotMatch(pinnedStatusShelfSource, /h-0\.5 overflow-hidden rounded-full bg-muted/)
  for (const exportName of [
    'AgentConsoleNavShell',
    'AgentConsoleNavList',
    'AgentConsoleNavLinkWrapper',
    'AgentConsoleNavItem',
    'AgentConsoleNavMetaRow',
    'AgentConsoleNavMeta',
  ]) {
    assert.match(agentConsoleNavUiSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(agentSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must not be package-owned`)
    assert.match(agentConsoleNavSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by AgentConsoleNav`)
  }
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/console-nav')), false, 'agent console nav UI must not remain in packages/ui')
  assert.doesNotMatch(agentSource, /export \* from "\.\/console-nav"/)
  assert.doesNotMatch(agentCss, /@import "\.\/console-nav\/styles\.css"/)
  assert.match(agentConsoleNavSource, /from ['"]@\/features\/agent\/components\/AgentConsoleNavUi['"]/)
  assert.doesNotMatch(agentConsoleNavSource, /from ['"]@movscript\/ui\/business\/agent['"]/)
  assert.match(agentConsoleNavUiSource, /function AgentConsoleNavItem[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentConsoleNavUiSource, /function AgentConsoleNavMeta[\s\S]*?<AppInlineMeta/)
  assert.match(agentConsoleNavUiCss, /\.agent-console-nav-shell\s*\{/)
  assert.match(agentConsoleNavUiCss, /\.agent-console-nav-item\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-console-nav-shell\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-console-nav-item\s*\{/)
  assert.match(agentResultSurfaceSources, /AgentComposerSection[\s\S]*?\bInput\b/)
  assert.match(agentResultSurfaceSources, /AgentComposerSection[\s\S]*?\bAgentComposerDropOverlay\b/)
  assert.match(agentResultSurfaceSources, /<Input[\s\S]*?ref=\{fileRef\}[\s\S]*?type="file"/)
  assert.doesNotMatch(agentResultSurfaceSources, /<input\b/)
  assert.doesNotMatch(agentResultSurfaceSources, /rounded-md border border-dashed border-primary\/40 bg-primary\/8/)
  assert.doesNotMatch(agentConsoleSource, /border-destructive\/40/)
  assert.doesNotMatch(agentConsoleSource, /text-destructive/)
  assert.doesNotMatch(pinnedStatusShelfSource, /rounded border border-dashed border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(pinnedStatusShelfSource, /function PinnedEmptyState/)
  assert.doesNotMatch(agentResultSurfaceSources, /rounded-md border border-border bg-background(?:\/70)?/)
  for (const testId of migratedSettingsSurfaceIds) {
    if (testId === 'agent-settings-model-compatibility-probes') {
      assert.match(agentSettingsApiModePanelsSource, /<AgentSettingsStatusPanel[\s\S]*?testId="agent-settings-model-compatibility-probes"/)
      assert.match(agentSettingsStatusUiSource, /<AgentSurfaceBlock[^>]+data-testid=\{testId\}/)
    } else if (testId === 'agent-settings-config-file-skill-activation') {
      assert.match(agentSettingsSectionSource, /<AgentSettingsStack data-testid="agent-settings-config-file-skill-activation"/)
    } else if (testId === 'agent-settings-config-file-limits') {
      assert.match(agentSettingsSectionSource, /<AgentSettingsFormGrid columns="model" data-testid="agent-settings-config-file-limits"/)
    } else {
      assert.match(agentSettingsOwnershipSource, new RegExp(`<AgentSurfaceBlock[^>]+data-testid="${testId}"`), `${testId} must use AgentSurfaceBlock`)
    }
    assert.doesNotMatch(agentSettingsSectionSource, new RegExp(`<div[^>]+data-testid="${testId}"[^>]+rounded-md border border-border bg-background`), `${testId} must not use a raw desktop shell`)
  }
  assert.match(agentSettingsUiSource, /export function AgentSettingsPanel/)
  assert.match(agentSettingsUiCss, /\.agent-settings-shell-panel__body\s*\{/)
  assert.doesNotMatch(agentCss, /\.agent-settings-shell-panel__body\s*\{/)
  assert.match(agentSettingsUiSource, /function AgentSettingsPanel[\s\S]*?<AppPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsScopeRail/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsScopeBadge/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsStateMessage/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsKeyValue/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsCallout/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToneText/)
  assert.match(agentSettingsUiCss, /\.agent-settings-row-between\s*\{/)
  assert.match(agentSettingsUiCss, /\.agent-settings-title-row\s*\{/)
  assert.match(agentSettingsUiCss, /\.agent-settings-card-title\s*\{/)
  assert.match(agentSettingsUiCss, /\.agent-settings-card-description\s*\{/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsToggleRow/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsApiModeCapabilityMatrix/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsStatusPanel/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsMigrationGuide/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsSwitchPlanPanel/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsReadinessPanel/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsActionItemsPanel/)
  assert.match(agentSettingsStatusUiSource, /export function AgentSettingsActionItemRow/)
  assert.doesNotMatch(agentSettingsUiSource, /export function AgentSettingsConfigFile(?:Card|DiffPanel|SummaryList)/)
  assert.match(agentSettingsConfigFileUiSource, /export function AgentSettingsConfigFileCard/)
  assert.match(agentSettingsConfigFileUiSource, /export function AgentSettingsConfigFileDiffPanel/)
  assert.match(agentSettingsConfigFileUiSource, /export function AgentSettingsConfigFileSummaryList/)
  assert.match(agentSettingsConfigFileUiSource, /agent-settings-row-between/)
  assert.match(agentSettingsConfigFileUiSource, /agent-settings-title-row/)
  assert.match(agentSettingsConfigFileUiSource, /agent-settings-card-description/)
  assert.match(agentSettingsConfigFileUiSource, /agent-settings-card-title agent-settings-card-title--strong agent-settings-card-title--wrap/)
  assert.doesNotMatch(agentSettingsConfigFileUiCss, /agent-settings-config-file-card__(?:title|id|description|header|title-row)/)
  assert.doesNotMatch(agentSettingsConfigFileUiCss, /agent-settings-config-file-list-item__(?:title|id|description|summary)/)
  assert.doesNotMatch(agentSettingsConfigFileUiCss, /agent-settings-config-file-editor-header__title/)
  assert.match(agentSettingsToolPermissionsUiSource, /agent-settings-row-between/)
  assert.match(agentSettingsToolPermissionsUiSource, /agent-settings-card-description/)
  assert.match(agentSettingsToolPermissionsUiSource, /ms-action-row ms-type-tiny agent-settings-tool-permissions-row__meta/)
  assert.doesNotMatch(agentSettingsToolPermissionsUiCss, /\.agent-settings-tool-permissions-row__meta\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentSettingsToolPermissionsUiCss, /\.agent-settings-tool-permissions-row__meta\s*\{[^}]*gap:/)
  assert.doesNotMatch(agentSettingsToolPermissionsUiSource, /agent-settings-tool-permissions-row__(?:header|title-row|title|meta-line|description)/)
  assert.doesNotMatch(agentSettingsToolPermissionsUiSource, /agent-settings-tool-permissions-(?:presets|bulk)__(?:title|help)/)
  assert.match(agentSettingsStatusUiSource, /agent-settings-card-title/)
  assert.match(agentSettingsStatusUiSource, /agent-settings-card-meta/)
  assert.match(agentSettingsStatusUiSource, /ms-action-row agent-settings-row-between agent-settings-action-header/)
  assert.doesNotMatch(agentSettingsStatusUiCss, /\.agent-settings-action-header\s*\{[^}]*justify-content:\s*space-between/)
  assert.doesNotMatch(agentSettingsStatusUiSource, /agent-settings-model-route__(?:title|source|model)/)
  assert.match(agentSettingsSkillUiSource, /export function AgentSettingsSkillCard/)
  assert.match(agentSettingsToolPermissionsUiSource, /export function AgentSettingsToolPermissionsDiffPanel/)
  assert.match(agentSettingsSnapshotUiSource, /export function AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsSnapshotUiSource, /export function AgentSettingsSnapshotSummaryPanel/)
  assert.match(agentSettingsSnapshotUiSource, /export function AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsSnapshotUiSource, /export function AgentSettingsSnapshotImpactPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsFormGrid/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsFormField/)
  assert.match(agentSettingsToolPermissionsUiSource, /export function AgentSettingsToolPermissionsFilterPanel/)
  assert.match(agentSettingsToolPermissionsUiSource, /export function AgentSettingsToolPermissionsFilterPresetPanel/)
  assert.match(agentSettingsToolPermissionsUiSource, /export function AgentSettingsToolPermissionsBulkActionPanel/)
  assert.match(agentSettingsUiTypesSource, /statusProps: AgentSettingsStatusProps/)
  assert.match(agentSettingsSectionSource, /statusProps: agentSettingsStatusRecipe/)
  assert.match(agentSettingsSource, /<AgentSettingsStateMessage[\s\S]*?text=\{t\('common\.loading'\)\}/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsKeyValue[\s\S]*?label=\{t\('agents\.settings\.fields\.modelId'\)\}/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsCallout[\s\S]*?data-testid="agent-settings-provider-model-id-secret-warning"/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsToneText[\s\S]*?tone="warning"[\s\S]*?agents\.settings\.toolPermissionsWorkspaceIssues/)
  assert.doesNotMatch(agentSettingsSectionSource, /\b(?:AppStateMessage|AppKeyValue|ReviewCallout|toneTextClass)\b/)
  assert.match(agentSettingsApiModePanelsSource, /badgeProps=\{agentSettingsApiModeBadgeRecipe\(mode\.badge\)\}/)
  assert.doesNotMatch(agentSettingsUiModuleSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(agentSettingsUiSource, /\bbadgeTone\b/)
  assert.doesNotMatch(agentSettingsUiSource, /\btrustTone\b/)
  assert.doesNotMatch(agentSettingsSectionSource, /agentSettingsStatusTone|agentSettingsApiModeBadgeTone/)
  assert.doesNotMatch(agentSettingsSectionSource, /\bbadgeTone=|\btrustTone=/)
  assert.doesNotMatch(agentSettingsSectionSource, /flex min-h-8 items-center gap-2 rounded-md border border-border bg-background px-2 type-label/)
  assert.match(agentSettingsSectionSource, /testResult && \([\s\S]*?<AgentDataBlock>[\s\S]*?<AgentSettingsCodeBlock>/)
  assert.doesNotMatch(agentSettingsSectionSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(agentSettingsSectionSource, /packPlugins\.map[\s\S]*?<AgentSurfaceBlock key=\{plugin\.pluginId\} variant="card"/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsToolPermissionsFilterPanel[\s\S]*?filterOptions=\{TOOL_PERMISSIONS_FILTER_OPTIONS\.map/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsToolPermissionsFilterPresetPanel[\s\S]*?presets=\{filterPresets\.map/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsToolPermissionsBulkActionPanel[\s\S]*?onClick: \(\) => onBulkEdit\('allow_available'\)/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsFilterPanel[\s\S]*?<Input[\s\S]*?data-testid="agent-settings-tool-permissions-search"/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsFilterPanel[\s\S]*?<Select[\s\S]*?onValueChange=\{onFilterChange\}/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsFilterPresetPanel[\s\S]*?presets\.map[\s\S]*?<AgentSurfaceBlock key=\{preset\.id\} variant="subtle"/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsBulkActionPanel[\s\S]*?data-testid="agent-settings-tool-permissions-bulk-actions"/)
  assert.doesNotMatch(agentSettingsSectionSource, /agentSettings\.toolPermissionsFilterPresets\.map[\s\S]*?<AgentSurfaceBlock key=\{preset\.id\} variant="subtle"/)
  assert.match(agentSettingsSectionSource, /<Select value=\{selectedModelId\} onValueChange=\{setSelectedModelId\}>[\s\S]*?textModels\.map\(\(model\) => \([\s\S]*?<SelectItem key=\{model\.id\} value=\{publicModelId\(model\)\}>/)
  assert.doesNotMatch(agentSettingsSectionSource, /AgentSettingsModelOptionButton/)
  assert.match(agentSettingsSnapshotPanelSource, /function SettingsSnapshotImportScopeSelector[\s\S]*?<AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsSnapshotPanelSource, /function SettingsSnapshotSummary[\s\S]*?<AgentSettingsSnapshotSummaryPanel/)
  assert.match(agentSettingsAuditPanelSource, /function SettingsAuditTrailPanel[\s\S]*?<AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsSnapshotPanelSource, /function SettingsSnapshotImpactPreview[\s\S]*?<AgentSettingsSnapshotImpactPanel/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotImportScopeSelector/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotSummary/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsAuditTrailPanel/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotImpactPreview/)
  assert.match(agentSettingsSnapshotUiSource, /function AgentSettingsSnapshotImportScopePanel[\s\S]*?<CheckboxField[\s\S]*?data-testid="agent-settings-snapshot-import-scope"/)
  assert.match(agentSettingsSnapshotUiSource, /function AgentSettingsSnapshotSummaryPanel[\s\S]*?<AppKeyValue/)
  assert.match(agentSettingsSnapshotUiSource, /function AgentSettingsAuditTrailPanel[\s\S]*?<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-audit-entry"/)
  assert.match(agentSettingsSnapshotUiSource, /function AgentSettingsSnapshotImpactPanel[\s\S]*?<StatusBadge/)
  assert.doesNotMatch(agentSettingsSnapshotPanelSource, /function SettingsSnapshotImportScopeSelector[\s\S]{0,2200}<CheckboxField/)
  assert.doesNotMatch(agentSettingsSnapshotPanelSource, /function SettingsSnapshotSummary[\s\S]{0,1200}<AppKeyValue/)
  assert.doesNotMatch(agentSettingsAuditPanelSource, /function SettingsAuditTrailPanel[\s\S]{0,2400}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSnapshotPanelSource, /function SettingsSnapshotImpactPreview[\s\S]{0,1800}<StatusBadge/)
  assert.match(agentSettingsSectionSource, /<AgentSettingsFormGrid columns="model" data-testid="agent-settings-config-file-limits"/)
  assert.match(agentSettingsSectionSource, /CONFIG_FILE_LIMIT_KEYS\.map\(\(key\) => \([\s\S]*?data-testid=\{`agent-settings-config-file-limit-\$\{key\}`\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsFormGrid[\s\S]*?data-columns=\{columns\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsFormField[\s\S]*?<div className=\{cn\("agent-settings-form-field"/)
  assert.match(agentSettingsSectionSource, /ToolPermissionsDiffPreview/)
  assert.match(agentSettingsDiffPanelsSource, /function ToolPermissionsDiffPreview[\s\S]*?AgentSettingsToolPermissionsDiffPanel/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsDiffPanel[\s\S]*?<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-tool-permissions-diff"/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsDiffPanel[\s\S]*?<StatusBadge/)
  assert.doesNotMatch(agentSettingsDiffPanelsSource, /function ToolPermissionsDiffPreview[\s\S]{0,2200}<AgentSurfaceBlock/)
  assert.match(agentSettingsToolPermissionsUiSource, /export function AgentSettingsToolPermissionsRow/)
  assert.match(agentSettingsSectionSource, /ToolPermissionsRow/)
  assert.match(agentSettingsRowsSource, /function ToolPermissionsRow[\s\S]*?AgentSettingsToolPermissionsRow/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsRow[\s\S]*?<Select/)
  assert.match(agentSettingsToolPermissionsUiSource, /function AgentSettingsToolPermissionsRow[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsRowsSource, /function ToolPermissionsRow[\s\S]{0,2200}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsRowsSource, /function ToolPermissionsRow[\s\S]{0,2200}<Select/)
  assert.doesNotMatch(agentSettingsRowsSource, /function ToolPermissionsRow[\s\S]{0,2200}<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsRowsSource, /function ToolPermissionsRow[\s\S]{0,2600}rounded bg-background px-1\.5 py-0\.5/)
})

test('agent message and pill primitives share internal base classes', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()
  const messageContentSource = readProjectFile('apps/frontend/src/features/agent/components/AgentMessageContent.tsx')
  const attachmentPreviewUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentAttachmentPreviewUi.tsx')
  const attachmentPreviewUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentAttachmentPreviewUi.css')
  const mentionEditorSource = readProjectFile('apps/frontend/src/features/agent/components/AgentMentionEditor.tsx')
  const chatBubblesSource = readProjectFile('apps/frontend/src/features/agent/components/AgentChatBubbles.tsx')
  const agentMessageUiSource = readProjectFile('apps/frontend/src/shared/ui/AgentMessageUi.tsx')
  const agentMessageUiCss = readProjectFile('apps/frontend/src/shared/ui/AgentMessageUi.css')
  const agentStylesSource = readProjectFile('packages/ui/src/components/business/agent/styles.css')
  const agentPrimitiveStylesSource = readProjectFile('packages/ui/src/components/business/agent/shell/primitives/styles.css')
  const agentPrimitiveContextCss = readProjectFile('packages/ui/src/components/business/agent/shell/primitives/context/styles.css')
  const agentThreadSuggestionCss = readProjectFile('packages/ui/src/components/business/agent/thread/suggestion/styles.css')

  for (const sharedClass of ['ms-agent-avatar', 'ms-agent-pill', 'ms-agent-inline-code', 'ms-agent-inline-resource', 'ms-agent-media-thumb']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent primitives`)
    assert.match(agentCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui agent`)
    assert.doesNotMatch(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} must not remain in aggregate styles`)
  }
  assert.match(agentMessageUiSource, /\bms-agent-bubble\b/, 'message bubble primitive must be app-owned')
  assert.match(agentMessageUiCss, /\.ms-agent-bubble\s*\{/, 'message bubble styles must be app-owned')
  assert.doesNotMatch(agentCss, /\.ms-agent-bubble\s*\{/, 'message bubble styles must not remain package-owned')
  assert.match(agentCss, /\.ms-agent-media-thumb > img,[\s\S]*?\.ms-agent-media-thumb > video\s*\{[\s\S]*object-fit:\s*cover/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/run/attachment-preview')), false, 'agent attachment preview UI must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/shell/attachment')), false, 'agent attachment preview styles must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/message')), false, 'agent message UI must be app-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/thread/message')), false, 'agent message styles must be app-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/shell/chat-message')), false, 'agent chat message styles must be app-owned')
  assert.doesNotMatch(agentSource, /AgentAttachmentPreview(?:Card|Media|Fallback|Body)/)
  assert.doesNotMatch(agentCss, /ms-agent-attachment-preview/)
  assert.match(attachmentPreviewUiCss, /\.agent-attachment-preview\s*\{/)
  assert.match(attachmentPreviewUiCss, /\.agent-attachment-preview__media > img,[\s\S]*?\.agent-attachment-preview__media > video\s*\{[\s\S]*object-fit:\s*contain/)
  assert.match(agentSource, /ms-type-label ms-agent-pill ms-agent-status/)
  assert.match(agentSource, /ms-agent-pill ms-type-item ms-agent-suggestion/)
  assert.match(agentSource, /ms-agent-pill ms-type-caption ms-agent-contextchip/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/context/styles.css')), false, 'agent context primitives must not live in a mixed root context stylesheet')
  assert.doesNotMatch(agentStylesSource, /context\/styles\.css/)
  assert.match(agentPrimitiveStylesSource, /@import "\.\/context\/styles\.css";/)
  assert.match(agentPrimitiveContextCss, /\.ms-agent-context\s*\{/)
  assert.match(agentPrimitiveContextCss, /\.ms-agent-contextchip\s*\{/)
  assert.match(agentThreadSuggestionCss, /\.ms-agent-suggestion\s*\{/)
  assert.doesNotMatch(agentPrimitiveContextCss, /\.ms-agent-suggestion\s*\{/)
  assert.doesNotMatch(agentThreadSuggestionCss, /\.ms-agent-contextchip\s*\{/)
  assert.doesNotMatch(agentCss, /\.ms-agent-avatar\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-avatar\s*\{[^}]*align-items:\s*center/)
  assert.doesNotMatch(agentCss, /\.ms-agent-status\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-status\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-suggestion\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-suggestion\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-contextchip\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-contextchip\s*\{[^}]*line-height:/)
  assert.match(attachmentPreviewUiSource, /export const AgentAttachmentPreviewCard/)
  assert.match(attachmentPreviewUiSource, /export const AgentAttachmentPreviewMedia/)
  assert.match(attachmentPreviewUiSource, /export const AgentAttachmentPreviewFallback/)
  assert.match(attachmentPreviewUiSource, /export const AgentAttachmentPreviewBody/)
  assert.match(agentMessageUiSource, /export function AgentMessageSection/)
  assert.match(agentMessageUiCss, /\.ms-agent-message-section\s*\{/)
  assert.match(agentMessageUiCss, /\.ms-agent-message-section__summary\s*\{/)
  assert.match(agentSource, /export const AgentCodeBlock/)
  assert.match(agentSource, /export const AgentCodeBlockHeader/)
  assert.match(agentSource, /export const AgentCodeBlockTitle/)
  assert.match(agentSource, /export const AgentCodeBlockActionButton/)
  assert.match(agentSource, /export function AgentCodeBlockContent/)
  assert.match(agentCss, /\.ms-agent-code-block\s*\{/)
  assert.match(agentCss, /\.ms-agent-code-block__header\s*\{/)
  assert.match(agentCss, /\.ms-agent-code-block__content\s*\{/)
  for (const exportName of [
    'AgentChatAttachmentGrid',
    'AgentChatBubbleStack',
    'AgentChatContentStack',
    'AgentChatFooterBadges',
    'AgentChatResultStack',
    'AgentChatStatusLine',
    'AgentChatTinyBadge',
    'AgentChatTinyStatusBadge',
    'AgentModelSetupCallout',
    'AgentModelSetupCalloutAction',
    'AgentModelSetupCalloutBody',
    'AgentModelSetupCalloutContent',
    'AgentModelSetupCalloutDescription',
    'AgentModelSetupCalloutIcon',
    'AgentModelSetupCalloutTitle',
  ]) {
    assert.match(agentMessageUiSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be app-owned`)
    assert.match(chatBubblesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent chat bubbles`)
  }
  for (const exportName of [
    'ProviderSessionStatusContent',
    'ProviderSessionStatusDetail',
    'ProviderSessionStatusHeader',
    'ProviderSessionStatusSuccessIcon',
  ]) {
    assert.match(agentSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(chatBubblesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent chat bubbles`)
  }
  assert.match(agentSource, /ProviderSessionStatusHeader[\s\S]*?"ms-action-row ms-type-caption ms-agent-session-status__header"/)
  assert.match(agentSource, /ProviderSessionStatusSuccessIcon[\s\S]*?"ms-inline-center ms-agent-session-status__icon"[\s\S]*?toneTextClass\("success"\)/)
  assert.match(agentSource, /ProviderSessionStatusDetail[\s\S]*?"ms-type-item ms-agent-session-status__detail"/)
  for (const sharedClass of [
    'ms-agent-chat-footer-badges',
    'ms-agent-chat-tiny-badge',
    'ms-agent-chat-status-line',
    'ms-agent-chat-result-stack',
    'ms-agent-chat-attachment-grid',
    'ms-agent-model-setup-callout',
  ]) {
    assert.match(agentMessageUiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} styles must be app-owned`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} styles must not remain in @movscript/ui agent`)
  }
  for (const sharedClass of [
    'ms-agent-session-status',
  ]) {
    assert.match(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} styles must live in @movscript/ui agent`)
  }
  assert.doesNotMatch(agentCss, /\.ms-agent-session-status__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-session-status__header\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-session-status__icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-session-status__icon\s*\{[^}]*flex-shrink:\s*0/)
  assert.doesNotMatch(agentCss, /\.ms-agent-session-status__detail\s*\{[^}]*font-size:/)
  assert.match(messageContentSource, /\bAgentInlineCode\b/)
  assert.match(messageContentSource, /\bAgentInlineResource\b/)
  assert.match(messageContentSource, /\bAgentMediaThumb\b/)
  assert.match(messageContentSource, /\bAgentAttachmentPreviewCard\b/)
  assert.match(messageContentSource, /\bAgentAttachmentPreviewMedia\b/)
  assert.match(messageContentSource, /\bAgentAttachmentPreviewFallback\b/)
  assert.match(messageContentSource, /\bAgentAttachmentPreviewBody\b/)
  assert.match(messageContentSource, /\bAgentCodeBlock\b/)
  assert.match(messageContentSource, /\bAgentCodeBlockHeader\b/)
  assert.match(messageContentSource, /\bAgentCodeBlockTitle\b/)
  assert.match(messageContentSource, /\bAgentCodeBlockActionButton\b/)
  assert.match(messageContentSource, /\bAgentCodeBlockContent\b/)
  assert.doesNotMatch(messageContentSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(messageContentSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(messageContentSource, /\bButton\b/)
  assert.match(messageContentSource, /export \{ AgentMessageSection \} from '@\/shared\/ui\/AgentMessageUi'/)
  assert.match(mentionEditorSource, /\bAgentMediaThumb\b/)
  assert.match(mentionEditorSource, /\bButton\b/)
  assert.match(mentionEditorSource, /variant="ghost" tone="danger" size="icon-xs"/, 'agent attachment removal must use package danger button tone')
  assert.doesNotMatch(mentionEditorSource, /hover:text-destructive/)
  assert.doesNotMatch(messageContentSource, /<pre\b/)
  assert.doesNotMatch(messageContentSource, /<button\b/)
  assert.doesNotMatch(messageContentSource, /<details\b/)
  assert.doesNotMatch(messageContentSource, /<summary\b/)
  assert.doesNotMatch(messageContentSource, /mt-2 rounded-md border bg-background\/55 p-2/)
  assert.doesNotMatch(messageContentSource, /cursor-pointer list-none type-tiny font-medium text-muted-foreground marker:hidden/)
  assert.doesNotMatch(messageContentSource, /flex items-center justify-between px-3 py-1 border-b border-white\/10/)
  assert.doesNotMatch(messageContentSource, /font-mono text-muted-foreground\/70/)
  assert.doesNotMatch(messageContentSource, /text-muted-foreground\/50 hover:text-muted-foreground/)
  assert.doesNotMatch(messageContentSource, /p-3 leading-relaxed/)
  assert.doesNotMatch(messageContentSource, /rounded-md overflow-hidden bg-black\/20/)
  assert.doesNotMatch(messageContentSource, /overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all/)
  assert.doesNotMatch(messageContentSource, /rounded bg-muted\/60 type-label font-mono/)
  assert.doesNotMatch(messageContentSource, /rounded-md border border-border bg-muted\/60/)
  assert.doesNotMatch(messageContentSource, /h-4 w-4 shrink-0 overflow-hidden rounded bg-background\/70/)
  assert.doesNotMatch(messageContentSource, /h-56 max-h-\[45vh\]/)
  assert.doesNotMatch(messageContentSource, /w-full object-contain bg-(?:muted|black)/)
  assert.doesNotMatch(messageContentSource, /h-12 flex items-center justify-center text-muted-foreground bg-muted\/40/)
  assert.doesNotMatch(messageContentSource, /\bh-full w-full object-cover\b/)
  assert.doesNotMatch(messageContentSource, /\bms-center h-full w-full\b/)
  assert.doesNotMatch(mentionEditorSource, /h-7 w-7 shrink-0 overflow-hidden rounded bg-muted/)
  assert.doesNotMatch(mentionEditorSource, /h-7 w-7 shrink-0 overflow-hidden rounded bg-muted\/60/)
  assert.doesNotMatch(mentionEditorSource, /\bh-full w-full object-cover\b/)
  assert.doesNotMatch(mentionEditorSource, /\bms-center h-full w-full\b/)
  assert.doesNotMatch(mentionEditorSource, /<button\b/)
  assert.doesNotMatch(mentionEditorSource, /hover:bg-muted\/60/)
  assert.doesNotMatch(chatBubblesSource, /\bBadge\b/)
  assert.doesNotMatch(chatBubblesSource, /\bStatusBadge\b/)
  assert.doesNotMatch(chatBubblesSource, /\btoneTextClass\b/)
  assert.doesNotMatch(chatBubblesSource, /type-micro leading-4 px-1\.5 py-0/)
  assert.doesNotMatch(chatBubblesSource, /flex flex-wrap gap-1/)
  assert.doesNotMatch(chatBubblesSource, /space-y-1\.5/)
  assert.doesNotMatch(chatBubblesSource, /mt-2 space-y-2/)
  assert.doesNotMatch(chatBubblesSource, /grid gap-1\.5/)
  assert.doesNotMatch(chatBubblesSource, /type-caption leading-relaxed text-muted-foreground/)
  assert.doesNotMatch(chatBubblesSource, /\bReviewCallout\b/)
  assert.doesNotMatch(chatBubblesSource, /flex items-start gap-2/)
  assert.doesNotMatch(chatBubblesSource, /mt-0\.5 shrink-0/)
  assert.doesNotMatch(chatBubblesSource, /font-medium text-foreground/)
  assert.doesNotMatch(chatBubblesSource, /mt-0\.5 leading-relaxed text-muted-foreground/)
})

test('agent panel and page surfaces use package agent styles', () => {
  const agentCss = readAgentCss()
  const agentChatCss = readAgentChatCss()
  const agentPackageBarrelSource = readProjectFile('packages/ui/src/components/business/agent/index.tsx')
  const primitiveFormCss = readProjectFile('packages/ui/src/components/primitives/form/styles.css')
  const agentChatShellViewSource = readProjectFile('apps/frontend/src/features/agent/components/AgentChatShellView.tsx')
  const agentChatShellViewCss = readProjectFile('apps/frontend/src/features/agent/components/AgentChatShellView.css')
  const agentConsoleSource = [
    readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePageSections.tsx'),
  ].join('\n')
  const agentsPageSource = readProjectFile('apps/frontend/src/features/agent/components/AgentsPage.tsx')
  const modelProvidersPageSource = readProjectFile('apps/frontend/src/features/agent/components/ModelProvidersPage.tsx')
  const agentConnectionsPageSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConnectionsPage.tsx')
  const agentConsoleRealtimeLogPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogPanel.tsx')
  const agentPageUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPageUi.tsx')
  const agentPageUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPageUi.css')
  const agentModeCanvasListPageSource = readProjectFile('apps/frontend/src/features/agent/components/AgentModeCanvasListPage.tsx')
  const movScriptWorkspaceFilesSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
  const movScriptWorkspaceReviewSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceReviewPage.tsx')
  const clientPluginsPageSource = readProjectFile('apps/frontend/src/features/plugins/components/ClientPluginsPage.tsx')
  const agentPageWorkspaceUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPageWorkspaceUi.tsx')
  const agentPageWorkspaceUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPageWorkspaceUi.css')
  const agentPageThreePaneUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPageThreePaneUi.tsx')
  const agentPageThreePaneUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPageThreePaneUi.css')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  const agentSettingsModelPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsModelPanel.tsx')
  const projectAgentModeSource = [
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebar.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarModel.ts'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarView.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarParts.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeWorkspace.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentContentPanel.tsx'),
  ].join('\n')
  const agentModeFeatureSource = readProjectFile('apps/frontend/src/features/agent/components/AgentModeUi.tsx')
  const agentModeFeatureCss = readProjectFile('apps/frontend/src/features/agent/components/AgentModeUi.css')
  const agentModeFeatureSidebarCss = readProjectFile('apps/frontend/src/features/agent/components/AgentModeUi.sidebar.css')
  const agentDebugPreviewSource = readProjectFile('apps/frontend/src/features/agent/components/AgentDebugPreviewDialog.tsx')
  const agentDebugPreviewUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentDebugPreviewUi.tsx')
  const agentDebugPreviewUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentDebugPreviewUi.css')
  const agentConsoleRealtimeLogUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogUi.tsx')
  const agentConsoleRealtimeLogUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogUi.css')
  const agentConsoleUiSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleUi.tsx')
  const agentConsoleUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleUi.css')
  const agentComposerPanelUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentComposerPanelUi.css')
  const agentChatToolbarUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentChatToolbarUi.css')
  const agentConversationHistoryUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentConversationHistoryUi.css')
  const agentConversationTabsUiCss = [
    'apps/frontend/src/features/agent/components/AgentConversationTabsUi.css',
    'apps/frontend/src/features/agent/components/conversation-tabs-ui/panel/styles.css',
    'apps/frontend/src/features/agent/components/conversation-tabs-ui/item/styles.css',
    'apps/frontend/src/features/agent/components/conversation-tabs-ui/menu/styles.css',
  ].map(readProjectFile).join('\n')
  const agentPanelCardUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPanelCardUi.css')
  const agentPanelContextUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPanelContextUi.css')
  const agentPanelProviderSessionUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPanelProviderSessionUi.css')
  const agentPanelShellLayoutUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPanelShellLayoutUi.css')
  const agentPanelThreadMessageUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentPanelThreadMessageUi.css')
  const agentChatItemsUiCss = readProjectFile('apps/frontend/src/features/agent/components/AgentChatItemsUi.css')
  const agentChatHeaderSource = readProjectFile('apps/frontend/src/features/agent/components/AgentChatHeaderSection.tsx')
  const agentComposerUiSource = readProjectFile('apps/frontend/src/shared/ui/AgentComposerUi.tsx')
  const conversationTabsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConversationTabs.tsx')
  const projectAgentContentPanelSource = readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentContentPanel.tsx')

  for (const sharedClass of [
    'ai-agent-panel',
  ]) {
    assert.match(`${agentCss}\n${agentChatCss}`, cssClassSelectorPattern(sharedClass), `${sharedClass} agent styles must live in @movscript/ui agent`)
  }
  for (const appChatItemClass of [
    'ms-agent-chat-thread-fill',
    'ms-agent-chat-thread-error',
    'ms-agent-chat-capability-events',
    'ms-agent-chat-thread-items',
    'ms-agent-chat-section-title',
    'ms-agent-chat-meta-list',
    'ms-agent-chat-inline-list',
    'ms-agent-chat-message-text',
    'ms-agent-chat-empty-text',
    'ms-agent-chat-chip-row',
    'ms-agent-chat-request-form',
    'ms-agent-chat-request-menu',
    'ms-agent-chat-action-layer',
    'ms-agent-chat-pre',
    'ms-agent-chat-media-grid',
    'ms-agent-chat-media-tile',
    'ms-agent-chat-inspect',
  ]) {
    assert.match(agentChatItemsUiCss, cssClassSelectorPattern(appChatItemClass), `${appChatItemClass} styles must be owned by app agent chat item UI`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(appChatItemClass), `${appChatItemClass} styles must not remain in @movscript/ui agent`)
  }
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentChatItemsUi\.css";/)
  for (const panelContextClass of [
    'ai-agent-panel-context-resize-handle',
    'ai-agent-panel-context-body',
    'ai-agent-panel-context-card',
    'ai-agent-panel-context-stack',
  ]) {
    assert.match(agentPanelContextUiCss, cssClassSelectorPattern(panelContextClass), `${panelContextClass} styles must be owned by the app agent panel context UI`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(panelContextClass), `${panelContextClass} styles must not remain in @movscript/ui agent`)
  }
  for (const providerSessionSelector of [
    '.ai-agent-panel-shell .ms-agent-conversation',
    '.ai-agent-panel-shell .ms-agent-tool',
    '.ai-agent-panel-shell details',
    '.ai-agent-panel-shell pre',
    '.ai-agent-panel-shell .ms-agent-empty',
    '.ai-agent-panel-shell code',
  ]) {
    assert.match(agentPanelProviderSessionUiCss, new RegExp(providerSessionSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${providerSessionSelector} styles must be owned by the app agent panel provider-session UI`)
    assert.doesNotMatch(agentCss, new RegExp(providerSessionSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${providerSessionSelector} styles must not remain in @movscript/ui agent`)
  }
  for (const providerSessionToolVariable of [
    '--agent-tool-header-min-width: 0',
    '--agent-tool-header-overflow: hidden',
    '--agent-tool-title-min-width: 0',
    '--agent-tool-title-overflow: hidden',
    '--agent-tool-title-text-overflow: ellipsis',
    '--agent-tool-title-white-space: nowrap',
  ]) {
    assert.match(agentPanelProviderSessionUiCss, new RegExp(providerSessionToolVariable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${providerSessionToolVariable} override must be owned by the app agent panel provider-session UI`)
  }
  assert.doesNotMatch(agentPanelProviderSessionUiCss, /\.ai-agent-panel-shell \.ms-agent-tool__header/)
  assert.doesNotMatch(agentPanelProviderSessionUiCss, /\.ai-agent-panel-shell \.ms-agent-tool__title/)
  for (const panelCardClass of [
    'ai-agent-panel-card',
    'ai-agent-panel-content-card',
    'ai-agent-panel-input-card',
    'ai-agent-panel-card-header',
    'ai-agent-panel-card-title',
    'ai-agent-panel-card-subtitle',
  ]) {
    assert.match(agentPanelCardUiCss, cssClassSelectorPattern(panelCardClass), `${panelCardClass} styles must be owned by the app agent panel card UI`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(panelCardClass), `${panelCardClass} styles must not remain in @movscript/ui agent`)
  }
  for (const panelShellLayoutClass of [
    'ai-agent-panel-shell',
    'ai-agent-panel-main',
    'ai-agent-panel-list-header',
    'ai-agent-panel-list-header-actions',
  ]) {
    assert.match(agentPanelShellLayoutUiCss, cssClassSelectorPattern(panelShellLayoutClass), `${panelShellLayoutClass} styles must be owned by the app agent panel shell layout UI`)
  }
  assert.doesNotMatch(agentCss, /^\.ai-agent-panel-shell\s*\{/m, 'agent panel shell root layout styles must not remain in @movscript/ui agent')
  assert.doesNotMatch(agentCss, /^\.ms-agent-shell\.ai-agent-panel-shell\s*\{/m, 'agent panel shell host layout styles must not remain in @movscript/ui agent')
  assert.doesNotMatch(agentCss, /^\.ai-agent-panel-shell \.ai-agent-panel-main\s*\{/m, 'agent panel main layout styles must not remain in @movscript/ui agent')
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('ai-agent-panel-list-header'), 'agent panel list header styles must not remain in @movscript/ui agent')
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('ai-agent-panel-list-header-actions'), 'agent panel list header action styles must not remain in @movscript/ui agent')
  for (const conversationTabClass of [
    'ai-agent-panel-conversation-tabs',
    'ai-agent-panel-conversation-tab',
    'ai-agent-panel-conversation-tab-main',
    'ai-agent-panel-conversation-tab-session-light',
    'ai-agent-panel-conversation-tab-title',
    'ai-agent-panel-conversation-tab-count',
    'ai-agent-panel-conversation-tab-close',
    'ai-agent-panel-tab-context-menu-anchor',
    'ai-agent-panel-tab-context-dropdown',
    'ai-agent-panel-tab-context-menu-danger',
  ]) {
    assert.match(agentConversationTabsUiCss, cssClassSelectorPattern(conversationTabClass), `${conversationTabClass} styles must be owned by the app agent conversation tabs UI`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(conversationTabClass), `${conversationTabClass} styles must not remain in @movscript/ui agent`)
  }
  for (const conversationHistoryClass of [
    'ai-agent-panel-empty-history',
    'ai-agent-panel-empty-history-divider',
    'ai-agent-panel-empty-history-header',
    'ai-agent-panel-empty-history-list',
    'ai-agent-panel-empty-history-item',
    'ai-agent-panel-empty-history-more',
    'ai-agent-panel-empty-history-empty',
    'ai-agent-panel-empty-history-close',
  ]) {
    assert.match(agentConversationHistoryUiCss, cssClassSelectorPattern(conversationHistoryClass), `${conversationHistoryClass} styles must be owned by the app agent conversation history UI`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(conversationHistoryClass), `${conversationHistoryClass} styles must not remain in @movscript/ui agent`)
  }
  for (const chatToolbarClass of [
    'ai-agent-panel-chat-header',
    'ai-agent-panel-chat-toolbar',
    'ai-agent-panel-chat-toolbar-tabs',
    'ai-agent-panel-chat-toolbar-actions',
    'ai-provider-controls',
    'ai-provider-controls__button',
    'ai-provider-mark',
    'ai-agent-program-header-actions',
    'project-agent-mode',
  ]) {
    assert.match(agentChatToolbarUiCss, cssClassSelectorPattern(chatToolbarClass), `${chatToolbarClass} styles must be owned by the app agent chat toolbar UI`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(chatToolbarClass), `${chatToolbarClass} styles must not remain in @movscript/ui agent`)
  }
  assert.doesNotMatch(agentChatToolbarUiCss, /ai-provider-controls__menu/)
  for (const chatToolbarSelector of [
    '.ai-agent-panel-status-trigger[data-status-expanded="true"]',
    '.ai-agent-program-header-actions__status[data-active="true"]',
  ]) {
    assert.match(agentChatToolbarUiCss, new RegExp(chatToolbarSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${chatToolbarSelector} styles must be owned by the app agent chat toolbar UI`)
    assert.doesNotMatch(agentCss, new RegExp(chatToolbarSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${chatToolbarSelector} styles must not remain in @movscript/ui agent`)
  }
  for (const composerPanelClass of [
    'ai-agent-panel-composer',
    'ai-agent-panel-mention-editor',
    'ai-agent-mention-chip',
    'ai-agent-model-select',
    'ai-agent-model-select__value',
    'ai-agent-model-select__option',
    'ai-agent-model-select__id',
  ]) {
    assert.match(agentComposerPanelUiCss, cssClassSelectorPattern(composerPanelClass), `${composerPanelClass} styles must be owned by the app agent composer UI`)
  }
  for (const composerPanelDetailClass of [
    'ai-agent-panel-mention-editor',
    'ai-agent-mention-chip',
    'ai-agent-model-select',
    'ai-agent-model-select__value',
    'ai-agent-model-select__option',
    'ai-agent-model-select__id',
  ]) {
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(composerPanelDetailClass), `${composerPanelDetailClass} styles must not remain in @movscript/ui agent`)
  }
  for (const composerPanelSelector of [
    '.ms-agent-composer.ms-agent-composer--panel',
  ]) {
    assert.match(agentComposerPanelUiCss, new RegExp(composerPanelSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${composerPanelSelector} must be owned by the app agent composer UI`)
  }
  for (const composerPanelVariable of [
    '--agent-composer-field-max-height: 260px',
    '--agent-composer-field-min-height: 42px',
    '--agent-composer-field-padding: 14px 18px 12px',
  ]) {
    assert.match(agentComposerPanelUiCss, new RegExp(composerPanelVariable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${composerPanelVariable} must be owned by the app agent composer UI`)
  }
  assert.doesNotMatch(agentComposerPanelUiCss, /\.ms-agent-composer--panel \.ms-agent-composer__rich-field/)
  assert.doesNotMatch(agentCss, /\.ms-agent-composer\.ms-agent-composer--panel/)
  assert.doesNotMatch(agentCss, /\.ms-agent-composer--panel \.ms-agent-composer__rich-field/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/panel/composer-mention')), false, 'agent composer panel styles must be feature-owned')
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentComposerPanelUi\.css";/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/panel/thread-message')), false, 'agent panel thread message styles must be feature-owned')
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentPanelThreadMessageUi\.css";/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/chat/tabs/styles.css')), false, 'agent conversation tab styles must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/chat')), false, 'agent chat tabs and history orchestration must be feature-owned')
  assert.doesNotMatch(readProjectFile('packages/ui/src/components/business/agent/index.tsx'), /export \* from "\.\/chat"/)
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentConversationTabsUi\.css";/)
  assert.match(readProjectFile('apps/frontend/src/features/agent/components/AgentConversationTabs.tsx'), /from '@\/features\/agent\/components\/AgentConversationTabsUi'/)
  assert.match(readProjectFile('apps/frontend/src/features/agent/components/AgentChatDataSourceShellParts.tsx'), /from '@\/features\/agent\/components\/AgentConversationTabsUi'/)
  assert.doesNotMatch(readProjectFile('apps/frontend/src/features/agent/components/AgentConversationTabs.tsx'), /from '@movscript\/ui\/business\/agent'/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/chat/history/index.tsx')), false, 'agent conversation history panel must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/chat/history/styles.css')), false, 'agent conversation history styles must be feature-owned')
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentConversationHistoryUi\.css";/)
  assert.match(readProjectFile('apps/frontend/src/features/agent/components/AgentChatPanelLayout.tsx'), /from '@\/features\/agent\/components\/AgentConversationHistoryUi'/)
  assert.doesNotMatch(readProjectFile('apps/frontend/src/features/agent/components/AgentChatPanelLayout.tsx'), /AgentConversationHistoryPanel[\s\S]*from '@movscript\/ui\/business\/agent'/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/chat/styles.css')), false, 'agent chat aggregate styles must not remain as an empty package entry')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/chat/toolbar/styles.css')), false, 'agent chat toolbar styles must be feature-owned')
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentChatToolbarUi\.css";/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/panel/card/styles.css')), false, 'agent panel card styles must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/panel/shell-layout/styles.css')), false, 'agent panel shell layout styles must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/panel/context/styles.css')), false, 'agent panel context styles must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/panel/provider-session/styles.css')), false, 'agent panel provider-session styles must be feature-owned')
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentPanelCardUi\.css";/)
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentPanelContextUi\.css";/)
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentPanelProviderSessionUi\.css";/)
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentPanelShellLayoutUi\.css";/)
  assert.match(agentPanelThreadMessageUiCss, /\.ai-agent-panel-shell \.ms-agent-message--assistant\s*\{/)
  assert.match(agentPanelThreadMessageUiCss, /\.ai-agent-panel-shell \.ms-agent-message--assistant \.agent-generated-media-preview/)
  assert.doesNotMatch(agentCss, /\.ai-agent-panel-shell \.ms-agent-message--assistant\s*\{/)
  assert.match(agentChatShellViewSource, /import '\.\/AgentChatShellView\.css'/)
  for (const pageChatClass of [
    'agent-page-chat-main',
    'agent-page-chat-empty',
    'agent-page-chat-empty-composer',
    'agent-page-chat-empty-title',
    'agent-page-chat-empty-accessory',
    'agent-page-chat-thread-shell',
    'agent-page-chat-thread',
    'agent-page-chat-composer',
    'project-agent-chat-shell',
  ]) {
    assert.match(agentChatShellViewCss, cssClassSelectorPattern(pageChatClass), `${pageChatClass} styles must live with AgentChatShellView`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(pageChatClass), `${pageChatClass} styles must not live in @movscript/ui agent CSS`)
  }
  assert.match(agentConsoleSource, /agent-console-page/)
  assert.match(movScriptWorkspaceFilesSource, /AgentPageShell/)
  assert.match(agentPageUiSource, /export function AgentPageShell/)
  assert.match(agentPageUiSource, /<AppPageShell chrome="immersive"/)
  assert.match(agentPageUiCss, cssClassSelectorPattern('agent-page-shell'))
  assert.match(agentPageUiCss, cssClassSelectorPattern('agent-page-header-content'))
  assert.doesNotMatch(agentCss, /@import "\.\/page\/styles\.css";/, 'agent page CSS must not be included in the package agent stylesheet')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/page/styles.css')), false, 'agent page CSS must be owned by AgentPageUi.css')
  assert.match(primitiveFormCss, cssClassSelectorPattern('mention-editor'), 'shared mention editor base styles must live in primitive form styles')
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('mention-editor'), 'shared mention editor base styles must not live in @movscript/ui agent CSS')
  assert.doesNotMatch(agentPageUiCss, cssClassSelectorPattern('mention-editor'), 'shared mention editor base styles must not live in app agent page CSS')
  assert.match(movScriptWorkspaceFilesSource, /from '@\/features\/agent\/components\/AgentPageWorkspaceUi'/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/page')), false, 'agent page UI must not remain in packages/ui')
  assert.doesNotMatch(agentPackageBarrelSource, /export \* from "\.\/page"/)
  for (const pageSource of [
    agentsPageSource,
    modelProvidersPageSource,
    agentConnectionsPageSource,
    agentConsoleSource,
    agentModeCanvasListPageSource,
    movScriptWorkspaceFilesSource,
    movScriptWorkspaceReviewSource,
    clientPluginsPageSource,
  ]) {
    assert.match(pageSource, /from '@\/features\/agent\/components\/AgentPageUi'/)
    assert.doesNotMatch(pageSource, /from '@movscript\/ui\/business\/agent'[\s\S]*?AgentPage/)
  }
  assert.match(agentSettingsSource, /from '@\/features\/agent\/components\/AgentSettingsUi'/)
  assert.match(agentSettingsSource, /from '@\/features\/agent\/components\/AgentPageUi'/)
  assert.doesNotMatch(agentSettingsSource, /from '@movscript\/ui\/business\/agent'[\s\S]*?Agent(?:Settings|Page)/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspacesPageBody/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageBody/)
  for (const migratedAgentPageClass of [
    'agent-workspaces-page-body',
    'agent-workspace-editor-layout',
    'agent-workspace-review-summary-pane',
    'agent-workspace-state-row',
    'agent-three-pane-page-body',
    'agent-three-pane-page-pane',
    'agent-three-pane-page-item',
  ]) {
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(migratedAgentPageClass), `${migratedAgentPageClass} styles must not live in @movscript/ui agent CSS`)
  }
  for (const migratedWorkspaceClass of [
    'agent-workspaces-page-body',
    'agent-workspace-editor-layout',
    'agent-workspace-review-summary-pane',
    'agent-workspace-state-row',
  ]) {
    assert.match(agentPageWorkspaceUiCss, cssClassSelectorPattern(migratedWorkspaceClass), `${migratedWorkspaceClass} styles must live with AgentPageWorkspaceUi`)
  }
  for (const migratedThreePaneClass of [
    'agent-three-pane-page-body',
    'agent-three-pane-page-pane',
    'agent-three-pane-page-item',
  ]) {
    assert.match(agentPageThreePaneUiCss, cssClassSelectorPattern(migratedThreePaneClass), `${migratedThreePaneClass} styles must live with AgentPageThreePaneUi`)
  }
  assert.match(agentSettingsModelPanelSource, /<Select value=\{selectedModelId\} onValueChange=\{setSelectedModelId\}>/)
  assert.match(agentDebugPreviewSource, /from '@\/features\/agent\/components\/AgentDebugPreviewUi'/)
  assert.match(agentDebugPreviewUiSource, /import '\.\/AgentDebugPreviewUi\.css'/)
  assert.match(agentDebugPreviewUiSource, /export function AgentDebugDialogSurface/)
  assert.match(agentDebugPreviewUiSource, /export function AgentDebugWorkspaceDiffLine/)
  assert.match(agentDebugPreviewUiCss, cssClassSelectorPattern('agent-debug-dialog-overlay'))
  assert.doesNotMatch(readProjectFile('packages/ui/src/components/business/agent/index.tsx'), /export \* from "\.\/debug"/)
  assert.doesNotMatch(readProjectFile('packages/ui/src/components/business/agent/styles.css'), /@import "\.\/debug\/styles\.css"/)
  assert.match(agentConsoleRealtimeLogPanelSource, /from '@\/features\/agent\/components\/AgentConsoleRealtimeLogUi'/)
  assert.doesNotMatch(agentConsoleRealtimeLogUiSource, /AgentConsoleRealtimeLogUi\.css/)
  assert.match(readProjectFile('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentConsoleRealtimeLogUi\.css";/)
  assert.match(agentConsoleRealtimeLogUiSource, /export function AgentConsoleLogSummary/)
  assert.match(agentConsoleRealtimeLogUiSource, /export const AgentConsoleLogStream/)
  assert.match(agentConsoleRealtimeLogUiSource, /export function AgentConsoleLogLineText/)
  assert.match(agentConsoleRealtimeLogUiCss, cssClassSelectorPattern('agent-console-log-stream'))
  assert.doesNotMatch(agentConsoleUiSource, /export (function|const) AgentConsoleLog/)
  assert.doesNotMatch(agentConsoleUiCss, cssClassSelectorPattern('agent-console-log-stream'))
  assert.match(projectAgentContentPanelSource, /\bProjectAgentContentPanel\b/)
  assert.doesNotMatch(projectAgentContentPanelSource, /className=\{cn\(/)
  assert.doesNotMatch(projectAgentContentPanelSource, /w-\[var\(--ui-agent-panel-width\)\]/)
  assert.match(projectAgentModeSource, /\bAgentModeRoot\b/)
  assert.match(projectAgentModeSource, /\bAgentModeProjectGroupToggle\b/)
  assert.match(agentModeFeatureSource, /import '\.\/AgentModeUi\.css'/)
  assert.match(agentModeFeatureSource, /AgentModeProjectGroupToggle[\s\S]*?<AgentNavItem/)
  assert.match(agentModeFeatureSource, /AgentModeConversationArchiveButton[\s\S]*?<Button/)
  assert.match(agentModeFeatureSource, /project-agent-mode agent-mode-root/)
  assert.match(agentModeFeatureSource, /ms-inline-center agent-mode-icon/)
  assert.match(agentModeFeatureSource, /ms-text-truncate agent-mode-label/)
  assert.match(agentModeFeatureCss, /@import "\.\/AgentModeUi\.sidebar\.css"/)
  assert.match(agentModeFeatureCss, /@import "\.\/AgentModeUi\.workspace\.css"/)
  assert.match(agentModeFeatureCss, /@import "\.\/AgentModeUi\.panels\.css"/)
  assert.match(agentModeFeatureSidebarCss, cssClassSelectorPattern('agent-mode-root'))
  assert.doesNotMatch(agentModeFeatureSidebarCss, /\.agent-mode-label\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.doesNotMatch(readProjectFile('packages/ui/src/components/business/agent/index.tsx'), /export \* from "\.\/mode"/)
  assert.doesNotMatch(readProjectFile('packages/ui/src/components/business/agent/styles.css'), /@import "\.\/mode\/styles\.css"/)
  assert.doesNotMatch(projectAgentModeSource, /\b(?:Button|AgentNavItem|AgentConversationItem|Separator|Avatar|AvatarFallback)\b/)
  assert.match(conversationTabsSource, /AgentConversationTabsPanel/)
  assert.match(readAgentChatSource(), /<Button/)
  assert.match(agentChatHeaderSource, /<Button/)
  assert.doesNotMatch(agentCss, /\.app-page\s*\{/)
})

test('agent layout primitives share internal layout classes', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()
  const agentChatHeaderSource = readProjectFile('apps/frontend/src/features/agent/components/AgentChatHeaderSection.tsx')
  const agentComposerUiSource = readProjectFile('apps/frontend/src/shared/ui/AgentComposerUi.tsx')
  const agentMessageUiSource = readProjectFile('apps/frontend/src/shared/ui/AgentMessageUi.tsx')
  const conversationTabsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConversationTabs.tsx')
  const projectAgentModeSource = [
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebar.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarModel.ts'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarView.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarParts.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModeWorkspace.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentContentPanel.tsx'),
  ].join('\n')
  const agentModeFeatureSource = readProjectFile('apps/frontend/src/features/agent/components/AgentModeUi.tsx')

  for (const sharedClass of ['ms-agent-container', 'ms-agent-bar', 'ms-agent-titleblock', 'ms-agent-actions']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent layout primitives`)
    assert.match(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui agent`)
    assert.doesNotMatch(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} must not remain in aggregate styles`)
  }
  for (const sharedClass of ['ms-agent-stack', 'ms-agent-cluster']) {
    assert.doesNotMatch(agentSource, new RegExp(`\\b${sharedClass}(?=[\\s"])`), `${sharedClass} should be replaced by global layout utilities`)
    assert.doesNotMatch(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} should not duplicate global layout utilities`)
    assert.doesNotMatch(agentComposerUiSource, new RegExp(`\\b${sharedClass}(?=[\\s"])`), `${sharedClass} should not be consumed by shared agent UI`)
    assert.doesNotMatch(agentMessageUiSource, new RegExp(`\\b${sharedClass}(?=[\\s"])`), `${sharedClass} should not be consumed by shared agent UI`)
  }
  assert.doesNotMatch(agentSource, /ms-agent-scrollarea/)
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('ms-agent-scrollarea'))
  assert.match(agentSource, /ms-agent-container ms-agent-shell/)
  assert.match(agentSource, /ms-grid-stack ms-agent-main/)
  assert.doesNotMatch(agentSource, /ms-agent-container ms-agent-work-surface/)
  assert.match(agentSource, /ms-agent-bar ms-agent-header/)
  assert.match(agentSource, /ms-stack ms-agent-titleblock ms-agent-header__content/)
  assert.match(agentSource, /ms-action-row ms-agent-actions ms-agent-header__actions/)
  assert.match(agentSource, /ms-type-section ms-agent-text ms-text-truncate ms-agent-title/)
  assert.match(agentSource, /ms-type-item ms-agent-text ms-text-truncate ms-agent-text--muted ms-agent-subtitle/)
  assert.match(agentSource, /AgentStatus[\s\S]*?"ms-inline-center ms-agent-status__icon"/)
  assert.match(uiCss, /\.ms-type-section\s*\{/)
  assert.match(uiCss, /\.ms-type-item\s*\{/)
  assert.doesNotMatch(agentCss, /\.ms-agent-main\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(agentCss, /\.ms-agent-main\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(agentCss, /\.ms-agent-header__content\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-actions\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-subtitle\s*\{[^}]*font-size:/)
  assert.match(agentSource, /ms-stack ms-agent-sidebar__section/)
  assert.match(agentSource, /ms-type-label ms-agent-sidebar__title/)
  assert.match(agentSource, /ms-control ms-type-item ms-agent-nav-item/)
  assert.match(agentSource, /density === "compact" && "ms-type-label"/)
  assert.match(agentSource, /ms-control ms-agent-conversation/)
  assert.match(agentSource, /ms-stack ms-agent-conversation__body/)
  assert.match(agentSource, /ms-stack ms-agent-thread/)
  assert.match(agentSource, /ms-stack ms-center ms-agent-empty/)
  assert.match(agentSource, /ms-inline-center ms-agent-conversation__icon/)
  assert.match(agentSource, /ms-type-item ms-agent-conversation__title/)
  assert.match(agentSource, /ms-type-label ms-agent-conversation__description/)
  assert.match(agentSource, /ms-type-label ms-agent-conversation__meta/)
  assert.doesNotMatch(agentCss, /\.ms-agent-sidebar__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-sidebar__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-nav-item\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-nav-item\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-nav-item\[data-density="compact"\]\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-nav-item\[data-density="compact"\]\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-conversation\s*\{[^}]*cursor:\s*pointer/)
  assert.doesNotMatch(agentCss, /\.ms-agent-conversation\s*\{[^}]*transition:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-conversation__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-conversation__title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-conversation__description\s*,\s*\n\.ms-agent-conversation__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-conversation__description\s*,\s*\n\.ms-agent-conversation__meta\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentCss, /\.ms-agent-thread\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-thread\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(agentCss, /\.ms-agent-empty\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentCss, /\.ms-agent-empty\s*\{[^}]*align-items:\s*center/)
  assert.doesNotMatch(agentCss, /\.ms-agent-empty\s*\{[^}]*justify-content:\s*center/)
  assert.doesNotMatch(agentSource, /ms-agent-bar ms-agent-work-header/)
  assert.match(agentComposerUiSource, /ms-grid-stack ms-agent-composer/)
  assert.match(agentMessageUiSource, /ms-action-row ms-agent-message__meta/)
  assert.match(agentComposerUiSource, /ms-action-row ms-agent-cluster--between ms-agent-composer__toolbar/)
  assert.match(conversationTabsSource, /AgentConversationTabsPanel/)
  assert.match(readAgentChatSource(), /\bButton\b/)
  assert.match(readAgentChatSource(), /role="tab"[\s\S]*?className="ai-agent-panel-conversation-tab-main"/)
  assert.match(readAgentChatSource(), /className="ai-agent-panel-conversation-tab-close"/)
  assert.doesNotMatch(conversationTabsSource, /<button\b/)
  assert.match(agentChatHeaderSource, /\bButton\b/)
  assert.match(agentChatHeaderSource, /<DropdownMenuItem[\s\S]*?onSelect=\{closeMenuConversation\}/)
  assert.match(agentChatHeaderSource, /<DropdownMenuItem[\s\S]*?onSelect=\{closeAllMenuConversations\}/)
  assert.match(agentChatHeaderSource, /<DropdownMenuTrigger asChild>[\s\S]*?<Button[\s\S]*?className="ai-agent-panel-tab-context-menu-anchor"/)
  assert.doesNotMatch(agentChatHeaderSource, /<button\b/)
  assert.doesNotMatch(projectAgentModeSource, /function AgentModeProjectSelectCard\b/)
  assert.match(projectAgentModeSource, /<AgentModeProjectGroupToggle[\s\S]*?aria-expanded=\{open\}/)
  assert.match(agentModeFeatureSource, /function AgentModeProjectGroupToggle[\s\S]*?<AgentNavItem/)
  assert.match(agentModeFeatureSource, /function AgentModeNavLinkItem[\s\S]*?<AgentNavItem asChild/)
  assert.doesNotMatch(projectAgentModeSource, /<button\b[\s\S]{0,160}agent-page-project-select-card/)
})

test('agent text primitives share internal text classes', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()

  for (const sharedClass of ['ms-agent-text', 'ms-agent-text--muted', 'ms-agent-text--meta']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent text primitives`)
    assert.match(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui agent`)
    assert.doesNotMatch(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} must not remain in aggregate styles`)
  }
  assert.match(uiCss, cssClassSelectorPattern('ms-text-truncate'))
  assert.doesNotMatch(agentSource, /ms-agent-text--truncate/)
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('ms-agent-text--truncate'))
  assert.doesNotMatch(readPrimitiveCss(), cssClassSelectorPattern('ms-agent-text--truncate'))
  assert.doesNotMatch(agentCss, /\.ms-agent-nav-item__(?:icon|label|meta)\b/)
  assert.match(agentSource, /ms-agent-text ms-text-truncate ms-type-item ms-agent-conversation__title/)
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('ms-agent-conversation--editing'), 'unused conversation editing styles must not remain in @movscript/ui agent')
  assert.doesNotMatch(agentCss, cssClassSelectorPattern('ms-agent-conversation__title-input'), 'unused conversation title input styles must not remain in @movscript/ui agent')
  assert.match(agentSource, /ms-agent-text ms-text-truncate ms-agent-title/)
})

test('button and composer controls share internal control classes', () => {
  const buttonSource = readProjectFile('packages/ui/src/components/primitives/button.tsx')
  const agentSidebarSource = readProjectFile('packages/ui/src/components/business/agent/shell/sidebar/index.tsx')
  const agentComposerUiSource = readProjectFile('apps/frontend/src/shared/ui/AgentComposerUi.tsx')
  const primitiveCss = readPrimitiveCss()

  assert.match(buttonSource, /ms-control ms-button/)
  assert.match(agentSidebarSource, /ms-control ms-type-item ms-agent-nav-item/)
  assert.match(agentSidebarSource, /ms-control ms-agent-conversation/)
  assert.match(agentComposerUiSource, /ms-control ms-agent-composer__action/)
  assert.match(agentComposerUiSource, /ms-control ms-agent-composer__submit/)
  assert.match(primitiveCss, /\.ms-control\s*\{/)
  assert.doesNotMatch(primitiveCss, /\.ms-agent-conversation:focus-visible/)
  assert.doesNotMatch(primitiveCss, /\.ms-agent-suggestion:focus-visible/)
  assert.doesNotMatch(primitiveCss, /\.ms-agent-suggestion:disabled/)
})

test('form and menu primitives share internal control classes', () => {
  const inputSource = readProjectFile('packages/ui/src/components/primitives/input.tsx')
  const textareaSource = readProjectFile('packages/ui/src/components/primitives/textarea.tsx')
  const selectSource = readProjectFile('packages/ui/src/components/primitives/select.tsx')
  const checkboxSource = readProjectFile('packages/ui/src/components/primitives/checkbox.tsx')
  const dropdownSource = readProjectFile('packages/ui/src/components/primitives/dropdown-menu.tsx')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const primitiveCss = readPrimitiveCss()

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
    assert.match(primitiveCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui primitives`)
    assert.doesNotMatch(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} must not remain in the aggregate styles file`)
  }
})

test('migrated package primitives do not depend on desktop Tailwind utility generation', () => {
  const uiAppSource = readAppSource()
  const uiWorkbenchSource = [
    'packages/ui/src/components/business/workbench/section/index.tsx',
    'packages/ui/src/components/business/workbench/list/index.tsx',
    'packages/ui/src/components/business/workbench/data-display/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/index.tsx',
  ].map(readProjectFile).join('\n') + readWorkbenchCardSource()
  const primitiveCss = readPrimitiveCss()
  const utilityClassPattern = /(?<![A-Za-z0-9_-])(?:h-full|overflow-auto|mx-auto|min-h-full|space-y-4|p-5|max-w-5xl|max-w-7xl|max-w-none|flex|min-w-0|items-\w+|justify-\w+|gap-\d|mt-\d|shrink-0|truncate|type-\w+|text-\w+|bg-\w+|border-\w+|rounded-\w+|font-semibold)(?![A-Za-z0-9_-])/

  assert.doesNotMatch(uiAppSource, utilityClassPattern)
  assert.doesNotMatch(uiWorkbenchSource, utilityClassPattern)
  assert.match(primitiveCss, /ms-control/)
  assert.match(primitiveCss, /ms-field-control/)
})

test('desktop entity and setting tones use @movscript/ui contracts', () => {
  const semanticEntityInlineEditorUiSource = readProjectFile('apps/frontend/src/shared/ui/SemanticEntityInlineEditorUi.tsx')
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple)-\d/

  assert.doesNotMatch(semanticEntityInlineEditorUiSource, rawPaletteClassPattern)
  assert.match(semanticEntityInlineEditorUiSource, /DetailEntityFieldControl/)
  assert.match(semanticEntityInlineEditorUiSource, /DetailEntityEditorHero/)
  assert.match(semanticEntityInlineEditorUiSource, /accentGradientClass/)
  assert.doesNotMatch(semanticEntityInlineEditorUiSource, /rounded border border-border bg-background\/80 px-1\.5 py-0\.5/)
  assert.match(uiSemanticHelperSource, /export type AccentTone/)
  assert.doesNotMatch(themeCss, /\.ms-accent-/)
  assert.match(uiSemanticCss, /\.ms-accent-/)
  assert.doesNotMatch(uiCss, /\.ms-accent-/)
})

test('core canvas cards use @movscript/ui tone contracts', () => {
  const canvasNodesSource = [
    'apps/frontend/src/features/canvas/ui/CanvasNodes.tsx',
    'apps/frontend/src/features/canvas/ui/canvasAssetNodes.tsx',
    'apps/frontend/src/features/canvas/ui/canvasGenerationNodes.tsx',
    'apps/frontend/src/features/canvas/ui/canvasGroupNodes.tsx',
    'apps/frontend/src/features/canvas/ui/canvasIoNodes.tsx',
    'apps/frontend/src/features/canvas/ui/canvasNodePorts.tsx',
  ].map(readProjectFile).join('\n')
  const canvasSemanticUiSource = readProjectFile('apps/frontend/src/features/canvas/presentation/canvasSemanticUi.ts')
  const frontendTypesSource = [
    readProjectFile('apps/frontend/src/types/index.ts'),
    readProjectFile('apps/frontend/src/types/canvas.ts'),
  ].join('\n')
  const canvasNodeDefinitionsSource = readProjectFile('apps/frontend/src/features/canvas/domain/nodeDefinitions.ts')
  const uiCanvasSource = readProjectFile('packages/ui/src/components/business/canvas/index.tsx')
  const uiCanvasCardSource = readProjectFile('packages/ui/src/components/business/canvas/card/index.tsx')
  const canvasWorkflowUiSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.tsx')
  const canvasContextMenuUiSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasContextMenuUi.tsx')
  const canvasContextMenuUiCss = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasContextMenuUi.css')
  const canvasEditorFlowUiSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorFlowUi.tsx')
  const canvasEditorFlowUiCss = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasEditorFlowUi.css')
  const canvasWorkflowReferenceCardSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasWorkflowReferenceCardUi.tsx')
  const canvasWorkflowUiCss = readCanvasWorkflowFeatureCss()
  const canvasNodeCardFeatureSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasNodeCardUi.tsx')
  const uiCanvasCardShellSource = readProjectFile('packages/ui/src/components/business/canvas/card/shell/index.tsx')
  const uiCanvasCardNodeSource = [
    'packages/ui/src/components/business/canvas/card/node/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/handles/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/ports/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/result/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/prompt/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/attachment/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/params/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/approval/index.tsx',
  ].map(readProjectFile).join('\n')
  const uiCanvasCardSurfaceSource = readProjectFile('packages/ui/src/components/business/canvas/card/surface/index.tsx')
  const uiCanvasCardPortSource = readProjectFile('packages/ui/src/components/business/canvas/card/port/index.tsx')
  const uiCanvasIOSource = readCanvasIOSource()
  const uiCanvasToolSource = readCanvasToolSource()
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const uiCanvasCss = readProjectFile('packages/ui/src/components/business/canvas/styles.css')
  const uiCanvasCardCss = readProjectFile('packages/ui/src/components/business/canvas/card/styles.css')
  const uiCanvasCardShellCss = readProjectFile('packages/ui/src/components/business/canvas/card/shell/styles.css')
  const canvasNodeCardFeatureCss = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasNodeCardUi.css')
  const uiCanvasCardNodeCss = [
    'packages/ui/src/components/business/canvas/card/node/styles.css',
    'packages/ui/src/components/business/canvas/card/node/ports/styles.css',
    'packages/ui/src/components/business/canvas/card/node/result/styles.css',
    'packages/ui/src/components/business/canvas/card/node/prompt/styles.css',
    'packages/ui/src/components/business/canvas/card/node/attachment/styles.css',
    'packages/ui/src/components/business/canvas/card/node/approval/styles.css',
    'packages/ui/src/components/business/canvas/card/node/params/styles.css',
  ].map(readProjectFile).join('\n')
  const uiCanvasCardSurfaceCss = readProjectFile('packages/ui/src/components/business/canvas/card/surface/styles.css')
  const uiCanvasCardPortCss = readProjectFile('packages/ui/src/components/business/canvas/card/port/styles.css')
  const uiCanvasIOCss = readCanvasIOCss()
  const uiCanvasToolCss = readCanvasToolCss()
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  const canvasCardSources = [uiCanvasToolSource, uiCanvasIOSource].join('\n')
  assert.doesNotMatch(canvasCardSources, rawPaletteClassPattern)
  assert.match(canvasCardSources, /accentTextClass|accentSoftClass|accentBadgeClass/)
  assert.doesNotMatch(canvasCardSources, /accentToneClass/)
  assert.match(uiSemanticHelperSource, /toneTextClass/)
  assert.match(uiSemanticHelperSource, /toneSurfaceClass/)
  assert.match(canvasNodesSource, /from ['"]@movscript\/ui\/business\/canvas['"]/)
  assert.match(canvasNodesSource, /\bCanvasToolActionCard\b/)
  assert.match(canvasNodesSource, /\bCanvasIOActionCard\b/)
  assert.match(canvasNodesSource, /\bCanvasNodeSemanticPortRows\b/)
  assert.match(canvasSemanticUiSource, /export function canvasNodeStatusRecipe\b/)
  assert.match(canvasNodesSource, /canvasNodeStatusRecipe/)
  assert.doesNotMatch(canvasNodesSource, /nodeStatusTone/)
  assert.doesNotMatch(canvasNodesSource, /\bstatusTone=/)
  assert.doesNotMatch(`${canvasNodeCardFeatureSource}\n${uiCanvasCardNodeSource}`, /\bstatusTone\b/)
  assert.doesNotMatch(`${canvasNodeCardFeatureSource}\n${uiCanvasCardNodeSource}`, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(canvasNodesSource, /function pairSemanticPorts/)
  assert.doesNotMatch(canvasNodesSource, /function SemanticPortRow\(/)
  assert.doesNotMatch(canvasNodesSource, /@\/components\/canvas\/CanvasToolActionCard/)
  assert.doesNotMatch(canvasNodesSource, /@\/components\/canvas\/CanvasIOActionCard/)
  assert.match(uiCanvasSource, /from "\.\/card"/)
  assert.doesNotMatch(uiCanvasSource, /from "\.\/entity"/)
  assert.match(uiCanvasSource, /from "\.\/io"/)
  assert.match(uiCanvasSource, /from "\.\/tool"/)
  assert.doesNotMatch(frontendTypesSource, /CanvasEntityKind/)
  assert.match(frontendTypesSource, /export type SemanticEntityKind/)
  assert.doesNotMatch(frontendTypesSource, /entityKind\?:/)
  assert.doesNotMatch(frontendTypesSource, /entityId\?:/)
  assert.doesNotMatch(frontendTypesSource, /entityTitle\?:/)
  assert.doesNotMatch(frontendTypesSource, /assetSlotKind\?:/)
  assert.doesNotMatch(canvasNodeDefinitionsSource, /type:\s*['"]entity['"]/)
  assert.doesNotMatch(canvasNodeDefinitionsSource, /semantic groups/)
  for (const relativePath of [
    'apps/frontend/src/components/canvas/CanvasIOActionCard.tsx',
    'apps/frontend/src/components/canvas/CanvasToolActionCard.tsx',
    'apps/frontend/src/components/canvas/CanvasCandidateGroupCard.tsx',
    'apps/frontend/src/components/canvas/CanvasDomainEntityCard.tsx',
    'apps/frontend/src/components/canvas/CanvasEntityActionCard.tsx',
    'packages/ui/src/components/business/canvas/entity/index.tsx',
    'packages/ui/src/components/business/canvas/entity/styles.css',
    'packages/ui/src/components/business/canvas/card/node/core/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/core/styles.css',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because canvas does not support entity nodes`)
  }
  for (const relativePath of [
    'packages/ui/src/components/business/canvas/workflow/index.tsx',
    'packages/ui/src/components/business/canvas/workflow/styles.css',
    'packages/ui/src/components/business/canvas/card/node/workflow-reference/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/workflow-reference/styles.css',
    'packages/ui/src/components/business/canvas/context-menu/index.tsx',
    'packages/ui/src/components/business/canvas/context-menu/styles.css',
    'packages/ui/src/components/business/canvas/flow/index.tsx',
    'packages/ui/src/components/business/canvas/flow/styles.css',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because canvas workflow UI is feature-owned`)
  }
  assert.doesNotMatch(uiCanvasSource, /from "\.\/workflow"/)
  assert.doesNotMatch(uiCanvasSource, /from "\.\/flow"/)
  assert.doesNotMatch(uiCanvasSource, /CanvasWorkflowReferenceCard/)
  assert.doesNotMatch(uiCanvasSource, /CanvasContextMenu/)
  assert.doesNotMatch(uiCanvasCardSource, /CanvasWorkflowReferenceCard/)
  assert.doesNotMatch(uiCanvasCardNodeSource, /workflow-reference/)
  assert.doesNotMatch(uiCanvasCss, /workflow\/styles\.css/)
  assert.doesNotMatch(uiCanvasCss, /context-menu\/styles\.css/)
  assert.doesNotMatch(uiCanvasCss, /flow\/styles\.css/)
  assert.doesNotMatch(uiCanvasCardCss, /workflow-reference\/styles\.css/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /canvas-workflow-reference-card/)
  assert.match(canvasWorkflowUiSource, /export \* from "\.\/CanvasWorkflowSidePanelUi"/)
  assert.match(canvasWorkflowUiSource, /export \* from "\.\/CanvasWorkflowRunResultsUi"/)
  assert.match(canvasWorkflowReferenceCardSource, /export function CanvasWorkflowReferenceCard/)
  assert.match(canvasWorkflowReferenceCardSource, /CanvasCardShell/)
  assert.match(canvasWorkflowReferenceCardSource, /CanvasPortDot/)
  assert.match(canvasContextMenuUiSource, /export const CanvasContextMenuView/)
  assert.match(canvasContextMenuUiSource, /AppSurfaceItem/)
  assert.match(canvasContextMenuUiSource, /Button/)
  assert.match(canvasContextMenuUiCss, /\.canvas-context-menu\s*\{/)
  assert.match(canvasContextMenuUiCss, /\.canvas-context-menu--viewport\s*\{/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasSelectionFrame/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasDropOverlay/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasGroupFrame/)
  assert.match(canvasEditorFlowUiSource, /export function CanvasGroupHeader/)
  assert.match(canvasEditorFlowUiSource, /export const CanvasViewportActionButton/)
  assert.match(canvasEditorFlowUiCss, /\.canvas-flow\s*\{/)
  assert.match(canvasWorkflowUiCss, /\.canvas-workflow-history\s*\{/)
  assert.match(canvasWorkflowUiCss, /\.canvas-workflow-side-panel\s*\{/)
  assert.match(canvasWorkflowUiCss, /\.canvas-workflow-reference-card\s*\{/)
  assert.match(uiCanvasCardSource, /CanvasCardShell/)
  assert.doesNotMatch(uiCanvasCardSource, /CanvasNodeCard/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCard/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardActionButton/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardBody/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardHeader/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardPreviewText/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardTextarea/)
  assert.match(canvasNodeCardFeatureSource, /CanvasTextNodeView/)
  assert.match(canvasNodeCardFeatureSource, /CanvasImageNodeView/)
  assert.match(canvasNodeCardFeatureSource, /CanvasVideoNodeView/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeFooterText/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeFrame/)
  assert.match(uiCanvasCardSource, /CanvasNodePromptInputView/)
  assert.match(uiCanvasCardSource, /CanvasNodePromptInputPanel/)
  assert.match(uiCanvasCardSource, /CanvasNodePromptEditor/)
  assert.match(uiCanvasCardSource, /CanvasNodeMentionMenuItem/)
  assert.match(uiCanvasCardSource, /CanvasNodeAttachmentItem/)
  assert.match(uiCanvasCardSource, /CanvasNodeApprovalActionButton/)
  assert.match(uiCanvasCardSource, /CanvasNodeApprovalStatus/)
  assert.match(uiCanvasCardSource, /CanvasNodeParamPanel/)
  assert.match(uiCanvasCardSource, /CanvasNodeParamSelect/)
  assert.match(uiCanvasCardSource, /CanvasNodePortList/)
  assert.match(uiCanvasCardSource, /CanvasNodePortRow/)
  assert.match(uiCanvasCardSource, /CanvasNodePortLabel/)
  assert.match(uiCanvasCardSource, /CanvasNodeSemanticPortRows/)
  assert.match(uiCanvasCardSource, /CanvasNodeResultPanel/)
  assert.match(uiCanvasCardSource, /CanvasNodeResultStage/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeStatusPip/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeStatusPipView/)
  assert.match(uiCanvasCardSource, /CanvasNodeTextResultHeader/)
  assert.match(uiCanvasCardSource, /CanvasNodeParamControlsView/)
  assert.match(uiCanvasCardSource, /CanvasSurfaceItem/)
  assert.match(uiCanvasCardSource, /CanvasPortDot/)
  assert.match(uiCanvasCardShellSource, /export function CanvasCardShell/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeCard/)
  assert.match(canvasNodeCardFeatureSource, /export const CanvasNodeCardActionButton/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeCardBody/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeCardHeader/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeCardPreviewText/)
  assert.match(canvasNodeCardFeatureSource, /export const CanvasNodeCardTextarea/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasTextNodeView/)
  assert.match(canvasNodeCardFeatureSource, /export const CanvasImageNodeView/)
  assert.match(canvasNodeCardFeatureSource, /export const CanvasVideoNodeView/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeFooterText/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeFrame/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodePromptInputView/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodePromptInputPanel/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasNodePromptEditor/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeMentionMenu/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasNodeMentionMenuItem/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeAttachmentItem/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeApprovalStatus/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasNodeApprovalActionButton/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeParamPanel/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasNodeParamSelect/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodePortList/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodePortRow/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodePortLabel/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeSemanticPortRows/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeResultPanel/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeResultStage/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeStatusPip/)
  assert.match(canvasNodeCardFeatureSource, /export function CanvasNodeStatusPipView/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeTextResultHeader/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeParamControlsView/)
  assert.match(uiCanvasCardNodeSource, /export const canvasNodeSemanticTargetHandleStyle/)
  assert.match(uiCanvasCardNodeSource, /export const canvasNodeSemanticSourceHandleStyle/)
  assert.match(uiCanvasCardNodeSource, /export const canvasNodeCardPortHandleStyle/)
  assert.match(uiCanvasCardSurfaceSource, /export function CanvasSurfaceItem/)
  assert.match(uiCanvasCardShellSource, /CanvasCardShell[\s\S]*?<Frame[\s\S]*?className=\{cn\("canvas-card-shell"/)
  assert.match(uiCanvasCardShellSource, /kind="card"[\s\S]*?emphasis="raised"[\s\S]*?interaction=\{selected \? "selected" : "none"\}/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCard[\s\S]*?<CanvasCardShell[\s\S]*?className=\{cn\("canvas-node-card"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardActionButton[\s\S]*?<Button[\s\S]*?className=\{cn\("canvas-node-card-action-button"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardBody[\s\S]*?className=\{cn\("canvas-node-card-body"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardHeader[\s\S]*?className=\{cn\("canvas-node-card-header"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardPreviewText[\s\S]*?data-clamp-lines=\{clampLines\}[\s\S]*?className=\{cn\("canvas-node-card-preview-text"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeCardTextarea[\s\S]*?<Textarea[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-card-textarea"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasTextNodeView[\s\S]*?<CanvasNodeCard[\s\S]*?selected=\{selected\}[\s\S]*?<CanvasNodeCardTextarea/)
  assert.match(canvasNodeCardFeatureSource, /CanvasMediaNodeView[\s\S]*?<CanvasMediaNodeFrame surface=\{surface\}>[\s\S]*?<CanvasMediaEmptyIcon surface=\{surface\}>/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeFooterText[\s\S]*?<p data-tone=\{tone\}[\s\S]*?className=\{cn\("canvas-node-footer-text"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeFrame[\s\S]*?className=\{cn\("canvas-node-frame"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptInputView[\s\S]*?<CanvasNodePromptInputPanel[\s\S]*?<CanvasNodePromptEditor[\s\S]*?<CanvasNodeMentionMenu>/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptInputPanel[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-prompt-panel"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptEditor[\s\S]*?contentEditable[\s\S]*?className=\{cn\("ms-type-body canvas-node-prompt-editor mention-editor"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeMentionMenuEmpty[\s\S]*?className=\{cn\("ms-type-label canvas-node-mention-menu-empty"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeMentionMenuItem[\s\S]*?<Button[\s\S]*?className=\{cn\("ms-type-label canvas-node-mention-menu-item"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeMentionMenuItem[\s\S]*?className="ms-text-truncate canvas-node-mention-menu-item__label"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeMentionMenuItem[\s\S]*?className="ms-type-tiny canvas-node-mention-menu-item__meta"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeAttachmentItem[\s\S]*?<AppInlineMeta asChild[\s\S]*?className=\{cn\("canvas-node-attachment-item"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeAttachmentItem[\s\S]*?className="ms-text-truncate ms-type-label canvas-node-attachment-item__label"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeAttachmentStatus[\s\S]*?className=\{cn\("ms-type-tiny canvas-node-attachment-status"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeAttachmentHint[\s\S]*?className=\{cn\("ms-type-caption canvas-node-attachment-hint"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeApprovalStatus[\s\S]*?className=\{cn\("canvas-node-approval-status", toneTextClass\(tone\)/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeApprovalActionButton[\s\S]*?<Button[\s\S]*?className=\{cn\("canvas-node-approval-action-button", toneSurfaceClass\(actionTone\), toneTextClass\(actionTone\)/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamPanel[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-param-panel"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamHeader[\s\S]*?"ms-action-row ms-type-tiny canvas-node-param-header"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamField[\s\S]*?"ms-type-tiny canvas-node-param-field"/)
  assert.match(uiCanvasCardNodeSource, /"ms-text-truncate canvas-node-param-field__label"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamSelect[\s\S]*?<NativeSelect[\s\S]*?className=\{cn\("ms-type-tiny canvas-node-param-control"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamInput[\s\S]*?<Input[\s\S]*?className=\{cn\("ms-type-tiny canvas-node-param-control"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamGrid[\s\S]*?className=\{cn\("ms-grid-stack canvas-node-param-grid"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamCheckbox[\s\S]*?<CheckboxField[\s\S]*?className=\{cn\("ms-action-row ms-type-tiny canvas-node-param-checkbox"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamExpandButton[\s\S]*?className=\{cn\("ms-type-tiny canvas-node-param-expand-button"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortList[\s\S]*?className=\{cn\("nodrag canvas-node-port-list"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortList[\s\S]*?className="ms-grid-stack canvas-node-port-list__items"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortRow[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("ms-action-row ms-type-tiny canvas-node-port-row"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortContent[\s\S]*?className=\{cn\("ms-action-row canvas-node-port-content"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortLabel[\s\S]*?className=\{cn\("ms-text-truncate canvas-node-port-label"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeSemanticPortRow[\s\S]*?<CanvasNodePortLabel>\{resolvedPort\.label\}<\/CanvasNodePortLabel>/)
  assert.match(uiCanvasCardNodeSource, /pairCanvasNodeSemanticPorts/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeSemanticPortRows[\s\S]*?<CanvasNodePortList/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeResultPanel[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-result-panel"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeResultStage[\s\S]*?<AppMediaFrame[\s\S]*?className=\{cn\("canvas-node-result-stage", centered && "ms-center ms-type-label"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeResultMessage[\s\S]*?className=\{cn\("ms-center ms-type-label canvas-node-result-message"/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeStatusPip[\s\S]*?className=\{cn\("canvas-node-status-pip", toneTextClass\(tone\)/)
  assert.match(canvasNodeCardFeatureSource, /CanvasNodeStatusPipView[\s\S]*?status === "running" \|\| status === "pending"[\s\S]*?<CanvasNodeStatusPip tone="warning" spinning>/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?statusProps\?: StatusBadgeProps/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?className=\{cn\("ms-stack canvas-node-text-result-header"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?<StatusBadge[\s\S]*?\{\.\.\.statusVisualProps\}/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?className="ms-action-row canvas-node-text-result-header__status"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?className=\{cn\("ms-type-tiny canvas-node-text-result-badge"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?className="ms-type-label canvas-node-text-result-prompt"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultSurface[\s\S]*?className=\{cn\("ms-type-label canvas-node-text-result-surface"/)
  assert.doesNotMatch(uiCanvasCardNodeSource, /(?<!ms-)type-(?:tiny|label) canvas-node-(?:result|text-result)/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultSurface[\s\S]*?state === "loading" && "ms-center"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamControlsView[\s\S]*?<CanvasNodeParamPanel[\s\S]*?<CanvasNodeParamHeader[\s\S]*?<CanvasNodeParamGrid/)
  assert.match(uiCanvasCardSurfaceSource, /CanvasSurfaceItem[\s\S]*?<Frame[\s\S]*?asChild=\{asChild\}[\s\S]*?className=\{cn\("canvas-surface-item"/)
  assert.match(uiCanvasCardSurfaceSource, /emphasis=\{variant === "card" \? "raised" : variant === "muted" \? "muted" : "plain"\}/)
  assert.doesNotMatch(uiCanvasCardSurfaceCss, /\.canvas-surface-item\s*\{[^}]*--ui-surface-(?:background|border|radius)/)
  assert.doesNotMatch(uiCanvasCardSurfaceCss, /\.canvas-surface-item\[data-variant="(?:card|muted)"\]\s*\{[^}]*--ui-surface-background/)
  assert.match(uiCanvasCardPortSource, /export function CanvasPortDot/)
  assert.match(uiCanvasIOSource, /export function CanvasIOActionCard/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?className=\{cn\("ms-type-label canvas-io-action-card"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?<FrameHeader as="header"[\s\S]*?canvas-io-action-card__header/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?<FrameHeading className="canvas-io-action-card__heading"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?className="ms-action-row canvas-io-action-card__title-row"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?className="ms-frame__title ms-text-truncate ms-type-body canvas-io-action-card__title"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?className="ms-frame__description ms-text-truncate ms-type-caption canvas-io-action-card__subtitle"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?className="ms-grid-stack ms-type-tiny canvas-io-action-card__editable-field"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?className="ms-text-truncate">\{editableFields\.nameLabel\}/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?<Input[\s\S]*?className="ms-type-tiny"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?<NativeSelect[\s\S]*?className="ms-type-tiny"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?<FrameBody className="ms-grid-stack canvas-io-action-card__body"/)
  assert.match(uiCanvasIOSource, /CanvasIOActionCard[\s\S]*?<FrameActions className="canvas-io-action-card__footer"/)
  assert.match(uiCanvasIOSource, /export function CanvasIOPortKindBadge/)
  assert.match(uiCanvasIOSource, /export function CanvasIOPortRow/)
  assert.match(uiCanvasIOSource, /CanvasIOPortRow[\s\S]*?className="ms-action-row ms-type-tiny canvas-io-port-row"/)
  assert.match(uiCanvasIOSource, /CanvasIOPortRow[\s\S]*?className="ms-text-truncate canvas-io-port-row__label"/)
  assert.match(uiCanvasIOSource, /export function CanvasIOMetaPill/)
  assert.match(uiCanvasIOSource, /CanvasIOMetaPill[\s\S]*?className="ms-action-row ms-type-tiny canvas-io-meta-pill"/)
  assert.match(uiCanvasIOSource, /CanvasIOMetaPill[\s\S]*?className="ms-text-truncate canvas-io-meta-pill__label"/)
  assert.match(uiCanvasIOSource, /CanvasIOMetaPill[\s\S]*?className="ms-text-truncate canvas-io-meta-pill__value"/)
  assert.match(uiCanvasIOSource, /export function CanvasIOStateTile/)
  assert.match(uiCanvasIOSource, /CanvasIOStateTile[\s\S]*?"ms-stack canvas-io-state-tile"/)
  assert.match(uiCanvasIOSource, /CanvasIOStateTile[\s\S]*?className="ms-center canvas-io-state-tile__media"/)
  assert.match(uiCanvasIOSource, /CanvasIOStateTile[\s\S]*?className="ms-inline-center canvas-io-state-tile__pending-icon"/)
  assert.match(uiCanvasIOSource, /CanvasIOStateTile[\s\S]*?className="ms-inline-center canvas-io-state-tile__ready-icon"/)
  assert.match(uiCanvasIOSource, /CanvasIOStateTile[\s\S]*?"ms-inline-center canvas-io-state-tile__empty-icon"/)
  assert.match(uiCanvasIOSource, /CanvasIOStateTile[\s\S]*?"ms-text-truncate ms-type-tiny canvas-io-state-tile__label"/)
  assert.match(uiCanvasIOSource, /export function CanvasIOBodyBlock/)
  assert.match(uiCanvasIOSource, /CanvasIOBodyBlock[\s\S]*?"ms-type-tiny canvas-io-body-block"/)
  assert.match(uiCanvasIOSource, /export function CanvasIOEmptyRow/)
  assert.match(uiCanvasIOSource, /CanvasIOEmptyRow[\s\S]*?className="ms-action-row ms-type-tiny canvas-io-empty-row"/)
  assert.match(uiCanvasIOSource, /export function CanvasIOSectionTitle/)
  assert.match(uiCanvasIOSource, /CanvasIOSectionTitle[\s\S]*?className="ms-action-row ms-type-tiny canvas-io-section-title"/)
  assert.match(uiCanvasToolSource, /export function CanvasToolActionCard/)
  assert.match(uiCanvasToolSource, /export function CanvasToolSourceBadge/)
  assert.match(uiCanvasToolSource, /export function CanvasToolStatusBadge/)
  assert.match(uiCanvasToolSource, /export function CanvasToolSlotRow/)
  assert.match(uiCanvasToolSource, /export function CanvasToolConfigPill/)
  assert.match(uiCanvasToolSource, /export function CanvasToolOutputTile/)
  assert.match(uiCanvasToolSource, /export function CanvasToolEmptyRow/)
  assert.match(uiCanvasToolSource, /export function CanvasToolSectionTitle/)
  assert.match(uiCanvasToolSource, /CanvasToolActionCardBody[\s\S]*?className="ms-grid-stack canvas-tool-action-card__body"/)
  assert.match(uiCanvasToolSource, /CanvasToolActionCardBody[\s\S]*?className="ms-grid-stack canvas-tool-action-card__stack"/)
  assert.match(uiCanvasToolSource, /CanvasToolActionCardBody[\s\S]*?className="ms-grid-stack canvas-tool-action-card__output-grid"/)
  assert.match(uiCanvasToolSource, /CanvasToolEmptyRow[\s\S]*?className="ms-action-row ms-type-tiny canvas-tool-empty-row"/)
  assert.match(uiCanvasToolSource, /CanvasToolSectionTitle[\s\S]*?className="ms-action-row ms-type-tiny canvas-tool-section-title"/)
  assert.match(uiCanvasToolSource, /CanvasToolSlotRow[\s\S]*?"ms-action-row ms-type-tiny canvas-tool-slot-row"/)
  assert.match(uiCanvasToolSource, /CanvasToolSlotRow[\s\S]*?"ms-inline-center canvas-tool-slot-row__icon"/)
  assert.match(uiCanvasToolSource, /CanvasToolSlotRow[\s\S]*?className="ms-text-truncate canvas-tool-slot-row__label"/)
  assert.match(uiCanvasToolSource, /CanvasToolSlotRow[\s\S]*?"ms-text-truncate canvas-tool-slot-row__summary"/)
  assert.match(uiCanvasToolSource, /CanvasToolSlotRow[\s\S]*?className="ms-inline-center canvas-tool-slot-row__state-icon"/)
  assert.match(uiCanvasToolSource, /CanvasToolConfigPill[\s\S]*?className="ms-action-row ms-type-tiny canvas-tool-config-pill"/)
  assert.match(uiCanvasToolSource, /CanvasToolConfigPill[\s\S]*?className="ms-text-truncate canvas-tool-config-pill__label"/)
  assert.match(uiCanvasToolSource, /CanvasToolConfigPill[\s\S]*?className="ms-text-truncate canvas-tool-config-pill__value"/)
  assert.match(uiCanvasToolSource, /export function canvasToolSlotStateLabel/)
  assert.match(uiCanvasToolSource, /export function canvasToolStatusIntent/)
  assert.match(uiCanvasToolSource, /export function canvasToolStatusKey/)
  assert.match(uiCanvasToolSource, /<StatusBadge\b[\s\S]*?intent=\{canvasToolStatusIntent\(status\)\}/)
  assert.doesNotMatch(uiCanvasToolSource, /\bcanvasToolStatusTone\b/)
  assert.doesNotMatch(uiCanvasToolSource, /\bSemanticTone\b/)
  assert.doesNotMatch(uiCanvasToolSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(uiCanvasCss, /@import "\.\/card\/styles\.css";/)
  assert.doesNotMatch(uiCanvasCss, /@import "\.\/entity\/styles\.css";/)
  assert.doesNotMatch(uiCanvasCss, /@import "\.\/flow\/styles\.css";/)
  assert.match(uiCanvasCss, /@import "\.\/io\/styles\.css";/)
  assert.match(uiCanvasCss, /@import "\.\/tool\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/shell\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/node\/styles\.css";/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /@import "\.\/core\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/surface\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/port\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/decision\/styles\.css";/)
  assert.match(uiCanvasCardShellCss, /\.canvas-card-shell\s*\{/)
  assert.doesNotMatch(uiCanvasCardShellCss, /\.canvas-card-shell\s*\{[^}]*--ui-surface-/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card-action-button\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card-body\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card-header\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card-preview-text\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card-preview-text\[data-clamp-lines="4"\]\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-card-textarea\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-frame\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-status-pip\s*\{/)
  assert.match(canvasNodeCardFeatureCss, /\.canvas-node-footer-text\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-list\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-row\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-label\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-required-mark\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-result-panel\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-result-stage\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-text-result-header\s*\{/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-row\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-row\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-list__items\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-content\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-content\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-content\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-port-label\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-grid\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-header\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-field\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-field__label\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-checkbox\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-param-(?:control|checkbox|expand-button)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-prompt-editor\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-prompt-editor\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-mention-menu-empty\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-mention-menu-item\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-mention-menu-item__label\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-mention-menu-item__meta\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-attachment-item__label\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-attachment-item__label\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-attachment-status\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-attachment-hint\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-result-stage\[data-centered="true"\]\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-result-message\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-text-result-header__status\s*\{[^}]*margin-bottom:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-text-result-prompt\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-text-result-surface\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasCardNodeCss, /\.canvas-node-text-result-surface\[data-state="loading"\]\s*\{[^}]*display:\s*flex/)
  assert.match(uiCanvasCardSurfaceCss, /\.canvas-surface-item\s*\{/)
  assert.match(uiCanvasCardPortCss, /\.canvas-port-dot\s*\{/)
  assert.match(canvasEditorFlowUiCss, /\.canvas-flow\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-port-kind-badge\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-port-row\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-state-tile\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-body-block\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-action-card\s*\{/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-section-title\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-section-title\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-section-title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-section-title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-meta-pill\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-meta-pill\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-meta-pill\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-meta-pill\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-meta-pill__(?:label|value)\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-empty-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-empty-row\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-empty-row\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-port-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-port-row\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-port-row\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-port-row\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-port-row__label\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile\s*\{[^}]*flex-direction:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile__media\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile__media\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile__(?:pending|ready|empty)-icon\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile__label\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile__label\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-state-tile__label\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-body-block\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-body-block\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__body\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__body\s*\{[^}]*gap:\s*var\(--ms-space-2\)/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__subtitle\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__editable-field\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__editable-field\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__editable-field\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__editable-field > span\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasIOCss, /\.canvas-io-action-card__editable-field \.(?:ms-input|ms-native-select)\s*\{[^}]*font-size:/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-action-card\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-source-badge\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-output-tile\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-action-card__body\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-action-card__stack\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-action-card__output-grid\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-empty-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-empty-row\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-empty-row\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-empty-row\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-section-title\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-section-title\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-section-title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-section-title\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row__(?:icon|state-icon)\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row__(?:icon|state-icon)\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row__(?:icon|state-icon)\s*\{[^}]*flex-shrink:\s*0/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row__(?:icon|state-icon) svg\s*\{[^}]*display:\s*block/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-slot-row__(?:label|summary)\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill__label\s*\{[^}]*min-width:\s*0/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-config-pill__(?:label|value)\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(uiCss, /\.canvas-card-shell\s*\{/)
  assert.match(uiCanvasToolSource, /\bCanvasToolSourceBadge\b/)
  assert.match(uiCanvasToolSource, /\bCanvasToolStatusBadge\b/)
  assert.match(uiCanvasToolSource, /\bCanvasToolSlotRow\b/)
  assert.match(uiCanvasToolSource, /\bCanvasToolOutputTile\b/)
  assert.match(uiCanvasToolSource, /\bCanvasToolConfigPill\b/)
  assert.doesNotMatch(uiCanvasToolSource, /function SourceBadge/)
  assert.doesNotMatch(uiCanvasToolSource, /function ToolSlotRow/)
  assert.doesNotMatch(uiCanvasToolSource, /function OutputTile/)
  assert.doesNotMatch(uiCanvasToolSource, /function ConfigPill/)
  assert.doesNotMatch(uiCanvasToolSource, /function EmptyRow/)
  assert.doesNotMatch(uiCanvasToolSource, /function SectionTitle/)
  assert.match(uiCanvasIOSource, /\bCanvasIOPortKindBadge\b/)
  assert.match(uiCanvasIOSource, /\bCanvasIOPortRow\b/)
  assert.match(uiCanvasIOSource, /\bCanvasIOMetaPill\b/)
  assert.match(uiCanvasIOSource, /\bCanvasIOStateTile\b/)
  assert.match(uiCanvasIOSource, /\bCanvasIOBodyBlock\b/)
  assert.doesNotMatch(uiCanvasIOSource, /function MetaPill/)
  assert.doesNotMatch(uiCanvasIOSource, /function StateTile/)
  assert.doesNotMatch(uiCanvasIOSource, /function EmptyRow/)
  assert.doesNotMatch(uiCanvasIOSource, /function PortDot/)
  assert.match(uiCanvasToolSource, /\bCanvasCardShell\b/, 'canvas cards must consume package canvas shells')
  assert.match(uiCanvasToolSource, /\bCanvasSurfaceItem\b/, 'canvas card rows must consume package canvas surface items')
  for (const source of [uiCanvasToolSource, uiCanvasIOSource]) {
    assert.doesNotMatch(source, /rounded-md border border-border bg-background/)
    assert.doesNotMatch(source, /rounded-lg border border-dashed border-border/)
  }
  assert.match(uiCanvasIOSource, /\bAppInlineMeta\b/)
  assert.match(uiCanvasToolSource, /\bAppMediaFrame\b/)
  assert.match(uiCanvasIOSource, /\bAppMediaFrame\b/)
  assert.match(uiCanvasToolSource, /function CanvasToolOutputTile[\s\S]*?<CanvasSurfaceItem[\s\S]*?<Button[\s\S]*?data-output-port-id/)
  assert.match(uiCanvasToolSource, /function CanvasToolOutputTile[\s\S]*?<Button[\s\S]*?align="start"[\s\S]*?data-output-port-id/)
  assert.match(uiCanvasToolSource, /CanvasToolOutputTile[\s\S]*?"ms-stack canvas-tool-output-tile"/)
  assert.match(uiCanvasToolSource, /CanvasToolOutputTile[\s\S]*?<AppMediaFrame variant="stage" className="ms-center canvas-tool-output-tile__media"/)
  assert.match(uiCanvasToolSource, /CanvasToolOutputTile[\s\S]*?className="ms-action-row canvas-tool-output-tile__title-row"/)
  assert.match(uiCanvasToolSource, /CanvasToolOutputTile[\s\S]*?className="ms-text-truncate ms-type-tiny canvas-tool-output-tile__label"/)
  assert.match(uiCanvasToolSource, /CanvasToolOutputTile[\s\S]*?"ms-text-truncate ms-type-tiny canvas-tool-output-tile__summary"/)
  assert.match(uiCanvasIOSource, /function CanvasIOPortRow[\s\S]*?<AppSurfaceItem[\s\S]*?data-input-port-id/)
  assert.match(uiCanvasIOSource, /function CanvasIOStateTile[\s\S]*?<AppSurfaceItem[\s\S]*?<AppMediaFrame/)
  assert.doesNotMatch(uiCanvasToolSource, /<button\b/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile\s*\{[^}]*flex-direction/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__button\s*\{[^}]*justify-content:\s*flex-start/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__(?:label|summary)\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__(?:label|summary)\s*\{[^}]*white-space/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__(?:label|summary)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__(?:label|summary)\s*\{[^}]*line-height:/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__(?:pending|type|ready|empty)-icon\s*\{[^}]*flex-shrink:\s*0/)
  assert.doesNotMatch(uiCanvasToolCss, /\.canvas-tool-output-tile__(?:pending|type|ready|empty)-icon svg\s*\{[^}]*display:\s*block/)
  for (const source of [uiCanvasIOSource]) {
    assert.match(source, /\bAppIconFrame\b/, 'canvas header icons must consume package icon frame')
    assert.doesNotMatch(source, /flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background\/80/)
  }
  assert.doesNotMatch(uiCanvasIOSource, /rounded border border-border bg-background\/85 px-1\.5 py-0\.5/)
  assert.doesNotMatch(uiCanvasIOSource, /rounded border border-border bg-muted\/40 px-1 py-0\.5/)
  assert.doesNotMatch(uiCanvasIOSource, /min-h-12 rounded-md border px-2 py-1\.5/)
  assert.doesNotMatch(uiCanvasIOSource, /rounded-md border border-border bg-muted\/25 px-1\.5/)
  assert.doesNotMatch(uiCanvasToolSource, /rounded-lg border border-border\/80 bg-muted\/25 px-1\.5/)
  assert.doesNotMatch(uiCanvasToolSource, /border-t border-border\/50 bg-muted\/20 px-3 py-2\.5/)
  assert.doesNotMatch(uiCanvasToolSource, /border-dashed border-border bg-muted\/20 hover:bg-muted\/40/)
  assert.doesNotMatch(uiCanvasToolSource, /rounded-t-lg bg-muted\/25/)
  assert.doesNotMatch(uiCanvasIOSource, /border-dashed border-border bg-muted\/20/)
  assert.doesNotMatch(uiCanvasIOSource, /rounded-t-md bg-muted\/25/)
  assert.match(uiCanvasToolSource, /StatusBadge/)
  assert.doesNotMatch(uiCanvasToolSource, /SemanticStatusBadge/)
  assert.doesNotMatch(uiCanvasToolSource, /function StatusBadge/)
  assert.match(uiSemanticHelperSource, /accentPortClass/)
  assert.doesNotMatch(themeCss, /\.ms-accent-port/)
  assert.match(uiSemanticCss, /\.ms-accent-port/)
})

test('projects shell primitives use @movscript/ui', () => {
  const projectsSource = readProjectFile('apps/frontend/src/features/project/components/ProjectsPage.tsx')
  const projectPageFeatureSource = readProjectFile('apps/frontend/src/features/project/components/ProjectPageUi.tsx')
  const projectPageFeatureCss = readProjectFile('apps/frontend/src/features/project/components/ProjectPageUi.css')
  const projectSemanticUiSource = readProjectFile('apps/frontend/src/features/project/presentation/projectSemanticUi.ts')
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))

  for (const exportName of ['ProjectPageActionButton', 'ProjectPageEmptyState', 'ProjectPageLocalAdminPrompt']) {
    assert.match(projectsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by projects page`)
  }
  assert.match(projectsSource, /from ['"]\.\/ProjectPageUi['"]/, 'project pages must consume feature-owned page UI')
  assert.doesNotMatch(projectsSource, /from ['"]@movscript\/ui\/business\/project['"]/, 'project pages must not import page UI from the package')
  assert.match(projectPageFeatureSource, /function ProjectPageActionButton[\s\S]*?<Button/)
  assert.match(projectPageFeatureSource, /function ProjectPageEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(projectPageFeatureSource, /function ProjectPageLocalAdminPrompt[\s\S]*?<AppStateMessage/)
  assert.match(projectPageFeatureCss, /\.projects-region\s*\{/)
  assert.match(projectPageFeatureCss, /\.projects-list-row\s*\{/)
  assert.match(projectPageFeatureCss, /\.project-page-local-admin-prompt\s*\{/)
  assert.doesNotMatch(projectPageFeatureCss, /\.project-overview-/)
  assert.equal(packageJson.exports['./business/project'], undefined, 'project UI domain must not be exported from packages/ui')
  assert.equal(packageJson.exports['./styles/business/project.css'], undefined, 'project UI stylesheet must not be exported from packages/ui')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/projects/styles.css')), false, 'project list page styles must be feature-owned')
  assert.doesNotMatch(projectsSource, /<Button\b/)
  assert.doesNotMatch(projectsSource, /\b(?:AppEmptyState|AppStateMessage)\b/)
  assert.doesNotMatch(projectsSource, /function EmptyState/)
  assert.doesNotMatch(projectsSource, /<button\b/)
  assert.doesNotMatch(projectsSource, /border-l-2 border-primary px-4 py-3/)
  assert.doesNotMatch(projectsSource, /h-1\.5 flex-1 rounded-full transition-colors/)
  assert.match(projectSemanticUiSource, /export function projectStatusRecipe\b/)
  assert.match(projectsSource, /projectStatusRecipe/)
  assert.doesNotMatch(projectsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(projectsSource, /projectStatusTone/)
  assert.match(projectsSource, /showAdminPrompt[\s\S]*?<ProjectPageLocalAdminPrompt/)
  assert.match(projectsSource, /projects\.map\(\(p\)[\s\S]*?<ProjectListRow[\s\S]*?onOpen=\{handleOpen\}[\s\S]*?onDelete=\{\(id\) => remove\.mutate\(id\)\}/)
  assert.match(projectsSource, /variant="ghost"[\s\S]{0,80}tone="danger"[\s\S]{0,120}onDelete/, 'project delete action must use package danger button tone')
  assert.doesNotMatch(projectsSource, /hover:text-destructive/)
  for (const relativePath of [
    'packages/ui/src/components/business/project/index.tsx',
    'packages/ui/src/components/business/project/styles.css',
    'packages/ui/src/components/business/project/page/index.tsx',
    'packages/ui/src/components/business/project/page/styles.css',
    'packages/ui/src/business/project.ts',
    'packages/ui/src/styles/business/project.css',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because project page UI is feature-owned`)
  }
})

test('onboarding and app settings use package surface primitives', () => {
  const appSettingsSource = [
    readProjectFile('apps/frontend/src/features/settings/components/AppSettingsPage.tsx'),
    readProjectFile('apps/frontend/src/features/settings/components/AppSettingsSections.tsx'),
  ].join('\n')
  const appSettingsUiSource = readProjectFile('apps/frontend/src/features/settings/components/AppSettingsUi.tsx')
  const appSettingsUiCss = readProjectFile('apps/frontend/src/features/settings/components/AppSettingsUi.css')
  const externalResourceSettingsSource = readProjectFile('apps/frontend/src/features/settings/components/ExternalResourceSourceSettingsSection.tsx')
  const authSource = readProjectFile('apps/frontend/src/features/auth/components/AuthPage.tsx')
  const authUiSource = readProjectFile('apps/frontend/src/features/auth/components/AuthPageUi.tsx')
  const authUiCss = readProjectFile('apps/frontend/src/features/auth/components/AuthPageUi.css')
  const inviteSource = readProjectFile('apps/frontend/src/features/auth/components/InvitePage.tsx')
  const onboardingSource = readProjectFile('apps/frontend/src/features/onboarding/components/OnboardingPage.tsx')
  const onboardingUiSource = readProjectFile('apps/frontend/src/features/onboarding/components/OnboardingPageUi.tsx')
  const onboardingUiCss = readProjectFile('apps/frontend/src/features/onboarding/components/OnboardingPageUi.css')
  const uiAppSource = readAppSource()
  const uiAppCss = readAppCss()

  for (const exportName of [
    'AuthActionButton',
    'AuthBrandMark',
    'AuthEmailCodeField',
    'AuthEmailCodeRow',
    'AuthField',
    'AuthFooterText',
    'AuthFormStack',
    'AuthInlineLinkButton',
    'AuthInlineMeta',
    'AuthInput',
    'AuthLabel',
    'AuthPanel',
    'AuthPasswordInput',
    'AuthRegisterPrompt',
    'AuthRoot',
    'AuthSettingsButton',
    'AuthStateMessage',
    'AuthSubmitButton',
    'AuthTabButton',
    'AuthTabs',
    'AuthTagline',
    'AuthTitle',
    'AuthWorkModePanel',
    'AuthWorkModeRoot',
  ]) {
    assert.match(authSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by auth page`)
    assert.match(authUiSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be auth feature-owned`)
    assert.doesNotMatch(uiAppSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be exported from @movscript/ui app business`)
  }
  for (const exportName of [
    'AppSettingsActionButton',
    'AppSettingsActionRow',
    'AppSettingsAdminSurface',
    'AppSettingsBackButton',
    'AppSettingsChoiceGrid',
    'AppSettingsChoiceTile',
    'AppSettingsContentStack',
    'AppSettingsEndpointSurface',
    'AppSettingsFeedbackText',
    'AppSettingsField',
    'AppSettingsFooterText',
    'AppSettingsHeader',
    'AppSettingsInput',
    'AppSettingsIntro',
    'AppSettingsMain',
    'AppSettingsSection',
    'AppSettingsShell',
  ]) {
    assert.match(appSettingsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by app settings`)
    assert.match(appSettingsUiSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be settings feature-owned`)
    assert.doesNotMatch(uiAppSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be exported from @movscript/ui app business`)
  }
  for (const exportName of [
    'OnboardingActionButton',
    'OnboardingFieldError',
    'OnboardingFormActions',
    'OnboardingFormField',
    'OnboardingFormInput',
    'OnboardingFormSection',
    'OnboardingHero',
    'OnboardingLaunchGrid',
    'OnboardingLaunchTile',
    'OnboardingMain',
    'OnboardingShell',
    'OnboardingWorkModeSummary',
  ]) {
    assert.match(onboardingSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by onboarding`)
    assert.match(onboardingUiSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be onboarding feature-owned`)
    assert.doesNotMatch(uiAppSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be exported from @movscript/ui app business`)
  }
  for (const exportName of ['AppChoiceTile', 'AppIconFrame', 'AppSection', 'AppSurfaceItem', 'Button', 'Input', 'Label', 'WorkModeSwitchGuide', 'toneTextClass']) {
    assert.match(onboardingUiSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by onboarding feature UI components`)
  }
  for (const className of [
    'auth-root',
    'auth-panel',
    'auth-work-mode-panel',
    'auth-state-message',
    'auth-settings-button',
    'auth-tabs',
    'auth-tab-button',
    'auth-form-stack',
    'auth-password-field',
    'auth-submit-button',
    'auth-inline-meta',
  ]) {
    assert.match(authUiCss, cssClassSelectorPattern(className), `${className} style must be auth feature-owned`)
    assert.doesNotMatch(uiAppCss, cssClassSelectorPattern(className), `${className} style must not remain in @movscript/ui app business CSS`)
  }
  for (const className of [
    'onboarding-shell',
    'onboarding-hero',
    'onboarding-work-mode-summary',
    'onboarding-launch-grid',
    'onboarding-launch-tile',
    'onboarding-form-section',
    'onboarding-form-field',
    'onboarding-form-actions',
  ]) {
    assert.match(onboardingUiCss, cssClassSelectorPattern(className), `${className} style must be onboarding feature-owned`)
    assert.doesNotMatch(uiAppCss, cssClassSelectorPattern(className), `${className} style must not remain in @movscript/ui app business CSS`)
  }
  for (const className of [
    'app-settings-shell',
    'app-settings-header',
    'app-settings-main',
    'app-settings-choice-grid',
    'app-settings-choice-tile',
    'app-settings-info-surface',
    'app-settings-action-row',
  ]) {
    assert.match(appSettingsUiCss, cssClassSelectorPattern(className), `${className} style must be settings feature-owned`)
    assert.doesNotMatch(uiAppCss, cssClassSelectorPattern(className), `${className} style must not remain in @movscript/ui app business CSS`)
  }
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/settings')), false, 'app settings UI must be feature-owned')
  assert.doesNotMatch(uiAppSource, /from "\.\/settings"/, 'app settings module must not be re-exported from @movscript/ui app business')
  assert.doesNotMatch(uiAppCss, /settings\/styles\.css/, 'app settings CSS must not be imported by @movscript/ui app business CSS')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/onboarding/index.tsx')), false, 'onboarding page UI must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/onboarding/styles.css')), false, 'onboarding page CSS must be feature-owned')
  assert.doesNotMatch(uiAppSource, /from "\.\/onboarding"/, 'onboarding module must not be re-exported from @movscript/ui app business')
  assert.doesNotMatch(uiAppCss, /onboarding\/styles\.css/, 'onboarding CSS must not be imported by @movscript/ui app business CSS')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/auth/index.tsx')), false, 'auth page UI must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/auth/styles.css')), false, 'auth page CSS must be feature-owned')
  assert.doesNotMatch(uiAppSource, /from "\.\/auth"/, 'auth module must not be re-exported from @movscript/ui app business')
  assert.doesNotMatch(uiAppCss, /auth\/styles\.css/, 'auth CSS must not be imported by @movscript/ui app business CSS')
  assert.match(appSettingsSource, /from ['"]@\/features\/settings\/components\/AppSettingsUi['"]/)
  assert.match(externalResourceSettingsSource, /from ['"]@\/features\/settings\/components\/AppSettingsUi['"]/)
  assert.match(authSource, /from ['"]@\/features\/auth\/components\/AuthPageUi['"]/)
  assert.match(onboardingSource, /from ['"]@\/features\/onboarding\/components\/OnboardingPageUi['"]/)
  for (const source of [authSource, inviteSource, onboardingSource]) {
    assert.match(source, /from ['"]@movscript\/ui\/business\/app['"]/, 'Work mode consumers must import from @movscript/ui/business/app')
    assert.match(source, /\bWorkModePrompt\b/, 'Work mode prompt must be consumed from package UI')
  }
  assert.match(inviteSource, /\bAppIconFrame\b/, 'Invite page icon frame must consume package icon frame')
  assert.match(inviteSource, /\bAppInlineError\b/, 'Invite page errors must use package inline error component')
  assert.doesNotMatch(inviteSource, /\btoneTextClass\b/, 'Invite page errors must not reach into package tone helpers')
  assert.doesNotMatch(onboardingSource, /\b(?:AppChoiceTile|AppIconFrame|AppSection|AppSurfaceItem|Button|Input|Label|WorkModeSwitchGuide|toneTextClass)\b/)
  assert.doesNotMatch(onboardingSource, /className=/)
  assert.doesNotMatch(onboardingSource, /<(?:div|main|span|p|h1|h2)\b/)
  assert.doesNotMatch(onboardingSource, /min-h-screen bg-background/)
  assert.doesNotMatch(onboardingSource, /grid gap-3 md:grid-cols-2/)
  assert.match(authUiSource, /function AuthStateMessage[\s\S]*?<AppStateMessage/)
  assert.match(authUiSource, /function AuthInlineMeta[\s\S]*?<AppInlineMeta/)
  assert.match(authUiSource, /function AuthPasswordInput[\s\S]*?<AuthInput[\s\S]*?<Button/)
  assert.doesNotMatch(authSource, /\b(?:AppInlineMeta|AppStateMessage|Button|Input|Label)\b/)
  assert.doesNotMatch(authSource, /className=/)
  assert.doesNotMatch(authSource, /<(?:div|p|h1)\b/)
  for (const exportName of ['AppIconFrame', 'AppSurfaceItem', 'Button']) {
    assert.match(uiAppSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by work mode prompt`)
  }
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/components/app/WorkModePrompt.tsx')), false)
  assert.match(uiAppSource, /export function WorkModePrompt/)
  assert.match(uiAppSource, /export function WorkModeSwitchGuide/)
  assert.match(uiAppSource, /WorkModeSwitchGuide[\s\S]*?className="ms-action-row onboarding-switch-guide__bar"/)
  assert.match(uiAppSource, /WorkModeSwitchGuide[\s\S]*?className="ms-center onboarding-switch-guide__button onboarding-switch-guide__button--current"/)
  assert.match(uiAppSource, /WorkModeSwitchGuide[\s\S]*?className="ms-center onboarding-switch-guide__button onboarding-switch-guide__button--next"/)
  assert.match(uiAppSource, /function WorkModeCard[\s\S]*?<AppSurfaceItem asChild[\s\S]*?<Button[\s\S]*?onClick=\{\(\) => onSelect\(mode\)\}/)
  assert.match(uiAppSource, /function WorkModeCard[\s\S]*?<Button[\s\S]*?align="start"/)
  assert.match(uiAppSource, /function WorkModeCard[\s\S]*?className="ms-type-section work-mode-card__title"/)
  assert.match(uiAppSource, /function WorkModeCard[\s\S]*?className="ms-inline-center ms-type-body work-mode-card__action"/)
  assert.match(uiAppCss, cssClassSelectorPattern('work-mode-prompt'))
  assert.match(uiAppCss, cssClassSelectorPattern('work-mode-card'))
  assert.doesNotMatch(uiAppCss, /\.work-mode-card__button\s*\{[^}]*justify-content:\s*flex-start/)
  assert.doesNotMatch(uiAppCss, /\.work-mode-card__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiAppCss, /\.work-mode-card__action\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(uiAppCss, /\.work-mode-card__action\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiAppCss, /\.onboarding-switch-guide__bar\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiAppCss, /\.onboarding-switch-guide__bar\s*\{[^}]*align-items:/)
  assert.doesNotMatch(uiAppCss, /\.onboarding-switch-guide__button\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiAppCss, /\.onboarding-switch-guide__button\s*\{[^}]*justify-content:/)
  assert.doesNotMatch(authSource, /<button\b/)
  assert.doesNotMatch(authSource, /inline-flex size-9 items-center justify-center rounded-md border border-border/)
  assert.doesNotMatch(authSource, /rounded-md border border-border bg-muted\/30/)
  assert.doesNotMatch(appSettingsSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(appSettingsSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(appSettingsSource, /\b(?:AppChoiceTile|AppSection|AppSurfaceItem|Button|Input|Label|toneTextClass)\b/)
  assert.doesNotMatch(appSettingsSource, /<button\b/)
  assert.doesNotMatch(appSettingsSource, /hover:bg-muted\/40/)
  assert.doesNotMatch(appSettingsSource, /rounded-md bg-muted px-3 py-2/)
  assert.doesNotMatch(appSettingsSource, /text-destructive/)
  assert.match(appSettingsSource, /<AppSettingsEndpointSurface[\s\S]*?value=\{isValid \? `\$\{normalized\}\/api\/v1` : '-'\}/)
  assert.match(appSettingsSource, /<AppSettingsBackButton[\s\S]*?<ArrowLeft/)
  assert.match(appSettingsSource, /<AppSettingsChoiceTile[\s\S]*?onClick=\{\(\) => chooseLaunchMode\(mode\)\}/)
  assert.match(appSettingsSource, /<AppSettingsChoiceTile[\s\S]*?onClick=\{\(\) => chooseWorkMode\(mode\)\}/)
  assert.match(appSettingsUiSource, /function AppSettingsField[\s\S]*?<Label/)
  assert.match(appSettingsUiSource, /const AppSettingsInput[\s\S]*?<Input/)
  assert.match(appSettingsUiSource, /const AppSettingsChoiceTile[\s\S]*?<AppChoiceTile/)
  assert.match(appSettingsUiSource, /function AppSettingsFeedbackText[\s\S]*?toneTextClass/)
  assert.match(appSettingsUiSource, /function AppSettingsEndpointSurface[\s\S]*?<AppSettingsInfoSurface/)
  assert.match(appSettingsUiSource, /function AppSettingsInfoSurface[\s\S]*?<AppSurfaceItem/)
  assert.match(appSettingsUiSource, /const AppSettingsActionButton[\s\S]*?<Button/)
  assert.doesNotMatch(appSettingsSource, /rounded-\[inherit\]/)
  assert.doesNotMatch(inviteSource, /w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0/)
  assert.doesNotMatch(inviteSource, /text-destructive/)
  assert.doesNotMatch(onboardingSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(onboardingSource, /<button\b/)
  assert.doesNotMatch(onboardingSource, /rounded-\[inherit\]/)
  assert.doesNotMatch(onboardingSource, /flex size-10 items-center justify-center rounded-md bg-primary\/10/)
  assert.doesNotMatch(onboardingSource, /text-destructive/)
  assert.match(uiAppSource, /toneTextClass\("danger"\)/)
  assert.match(onboardingSource, /<OnboardingLaunchTile[\s\S]*?onClick=\{\(\) => setMode\('local'\)\}/)
  assert.match(onboardingSource, /<OnboardingLaunchTile[\s\S]*?onClick=\{\(\) => setMode\('cloud'\)\}/)
  assert.doesNotMatch(uiAppSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(uiAppSource, /<button\b/)
  assert.doesNotMatch(uiAppSource, /flex size-10 items-center justify-center rounded-md bg-primary\/10/)
})

test('organization workspace pages use feature-owned semantic components', () => {
  const orgSelectSource = readProjectFile('apps/frontend/src/features/organization/components/OrgSelectPage.tsx')
  const orgSettingsSource = readProjectFile('apps/frontend/src/features/organization/components/OrgSettingsPage.tsx')
  const orgGenerationToolsTabSource = readProjectFile('apps/frontend/src/features/organization/components/OrgGenerationToolsTab.tsx')
  const orgGenerationToolServerCardSource = readProjectFile('apps/frontend/src/features/organization/components/OrgGenerationToolServerCard.tsx')
  const orgSettingsSurfaceSource = `${orgSettingsSource}\n${orgGenerationToolsTabSource}\n${orgGenerationToolServerCardSource}`
  const organizationFeatureSource = readProjectFile('apps/frontend/src/features/organization/components/OrganizationUi.tsx')
  const organizationFeatureCss = readProjectFile('apps/frontend/src/features/organization/components/OrganizationUi.css')
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const frontendCss = readProjectFile('apps/frontend/src/index.css')
  const frontendElectronViteConfig = readProjectFile('apps/frontend/electron.vite.config.ts')
  const frontendViteE2eConfig = readProjectFile('apps/frontend/vite.e2e.config.ts')
  const organizationSemanticUiSource = readProjectFile('apps/frontend/src/features/organization/presentation/organizationSemanticUi.ts')

  assert.match(orgSelectSource, /\bButton\b/)
  for (const exportName of [
    'OrganizationSelectActionTile',
    'OrganizationSelectCurrentCard',
    'OrganizationSelectMembershipButton',
    'OrganizationSelectMembershipList',
    'OrganizationStatusMessage',
  ]) {
    assert.match(orgSelectSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by org select page`)
    assert.match(organizationFeatureSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by organization feature UI`)
  }
  for (const exportName of [
    'OrganizationConnectionStatus',
    'OrganizationDataTable',
    'OrganizationDataTableBody',
    'OrganizationDataTableCell',
    'OrganizationDataTableEmptyRow',
    'OrganizationDataTableHeader',
    'OrganizationDataTableHeadCell',
    'OrganizationDataTableRow',
    'OrganizationEmptyState',
    'OrganizationGenerationToolsHeaderCard',
    'OrganizationGenerationToolServerSurface',
    'OrganizationInlineError',
    'OrganizationJoinCodeCard',
    'OrganizationListRow',
    'OrganizationListSurface',
    'OrganizationStack',
    'OrganizationStatusMessage',
    'OrganizationTableSurface',
    'OrganizationTabButton',
    'OrganizationTabs',
    'OrganizationToolbar',
    'OrganizationUsageCostCard',
    'OrganizationUsageMetricCard',
    'OrganizationUsageMetricGrid',
  ]) {
    assert.match(orgSettingsSurfaceSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by org settings page`)
    assert.match(organizationFeatureSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by organization feature UI`)
  }
  for (const source of [orgSelectSource, orgSettingsSurfaceSource]) {
    assert.match(source, /from ['"]\.\/OrganizationUi['"]/, 'organization pages must consume feature-owned UI')
    assert.doesNotMatch(source, /from ['"]@movscript\/ui\/business\/organization['"]/, 'organization pages must not import organization UI from the package')
  }
  assert.match(orgSettingsSurfaceSource, /\bNativeSelect\b/)
  assert.match(orgSettingsSurfaceSource, /\bCheckboxField\b/)
  assert.match(organizationFeatureSource, /\bAppSurfaceItem\b/)
  assert.match(organizationFeatureSource, /\bAppControlGroup\b/)
  assert.match(organizationFeatureSource, /\bAppDataTable\b/)
  assert.match(organizationFeatureSource, /\bAppDataTableHeader\b/)
  assert.match(organizationFeatureSource, /\bAppDataTableRow\b/)
  assert.match(organizationFeatureSource, /\bAppEmptyState\b/)
  assert.match(organizationFeatureSource, /\bAppMetricCard\b/)
  assert.match(organizationFeatureSource, /\bAppStateMessage\b/)
  assert.match(organizationFeatureSource, /\btoneSurfaceClass\("danger"\)/)
  assert.match(organizationFeatureSource, /\btoneTextClass\("danger"\)/)
  assert.match(organizationFeatureSource, /\btoneTextClass\("success"\)/)
  assert.match(organizationFeatureSource, /import "\.\/OrganizationUi\.css";/)
  assert.match(organizationFeatureCss, /\.organization-list-surface\s*\{/)
  assert.match(organizationFeatureCss, /\.organization-select-current-card\s*\{/)
  assert.match(organizationFeatureCss, /\.organization-select-action-tile\s*\{/)
  assert.match(organizationFeatureCss, /\.organization-select-membership-list\s*\{/)
  assert.match(organizationFeatureCss, /\.organization-select-membership-button\s*\{/)
  assert.match(organizationFeatureCss, /\.organization-generation-tool-server-card\s*\{/)
  assert.match(organizationFeatureCss, /\.organization-tabs\s*\{/)
  assert.equal(Object.hasOwn(packageJson.exports, './business/organization'), false, 'organization business entry must not be exported from @movscript/ui')
  assert.equal(Object.hasOwn(packageJson.exports, './styles/business/organization.css'), false, 'organization business style entry must not be exported from @movscript/ui')
  assert.doesNotMatch(frontendCss, /@movscript\/ui\/styles\/business\/organization\.css/)
  assert.doesNotMatch(frontendElectronViteConfig, /@movscript\/ui\/business\/organization|@movscript\/ui\/styles\/business\/organization\.css/)
  assert.doesNotMatch(frontendViteE2eConfig, /@movscript\/ui\/business\/organization|@movscript\/ui\/styles\/business\/organization\.css/)
  for (const relativePath of [
    'packages/ui/src/components/business/organization/index.tsx',
    'packages/ui/src/components/business/organization/styles.css',
    'packages/ui/src/business/organization.ts',
    'packages/ui/src/styles/business/organization.css',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because organization UI is feature-owned`)
  }
  assert.match(organizationSemanticUiSource, /organizationSaveRecipe/)
  assert.match(organizationSemanticUiSource, /organizationServerEnabledRecipe/)
  assert.match(organizationSemanticUiSource, /organizationDefaultServerRecipe/)
  assert.match(orgSettingsSurfaceSource, /organizationSaveRecipe/)
  assert.match(orgSettingsSurfaceSource, /organizationServerEnabledRecipe/)
  assert.match(orgSettingsSurfaceSource, /organizationDefaultServerRecipe/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(orgSelectSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(orgSelectSource, /<button\b/)
  assert.doesNotMatch(orgSelectSource, /rounded-md bg-muted/)
  assert.doesNotMatch(orgSelectSource, /type-label text-destructive/)
  assert.doesNotMatch(orgSelectSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(orgSelectSource, /\bAppChoiceTile\b/)
  assert.doesNotMatch(orgSelectSource, /\bAppIconFrame\b/)
  assert.doesNotMatch(orgSelectSource, /\bAppStateMessage\b/)
  assert.match(orgSelectSource, /showCreate[\s\S]*?<OrganizationSelectActionTile[\s\S]*?setShowCreate\(true\)/)
  assert.match(orgSelectSource, /<OrganizationSelectActionTile[\s\S]*?setShowJoin\(true\)/)
  assert.doesNotMatch(orgSelectSource, /AppSurfaceItem asChild className="hover:border-foreground\/30 hover:bg-accent"/)
  assert.match(orgSelectSource, /switchableMemberships\.map[\s\S]*?<OrganizationSelectMembershipButton/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /rounded-lg border border-dashed border-border/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /border border-border rounded-lg divide-y divide-border/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /rounded-lg border border-border px-4 py-3/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /rounded-lg border border-border bg-foreground px-4 py-3/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /border border-border rounded-lg overflow-hidden/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /bg-card/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /hover:bg-card/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /border-destructive\/40/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /text-destructive/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /hover:text-destructive/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /<t(?:h|d)\b[^>]*className=/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /<tbody\b[^>]*className=/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\b(?:px-4 py-2\.5|px-4 py-8|divide-y divide-border|tabular-nums)\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /<button\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppControlGroup\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppDataTable\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppDataTableHeader\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppDataTableRow\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppEmptyState\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppMetricCard\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\bAppStateMessage\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\btoneSurfaceClass\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /\btoneTextClass\b/)
  assert.match(orgSettingsSurfaceSource, /invalid=\{invalid\}/)
  assert.match(orgSettingsSurfaceSource, /<OrganizationConnectionStatus success=\{testResult\.success\}>/)
  assert.match(orgSettingsSource, /function UsageTab[\s\S]*?<OrganizationUsageMetricCard/)
  assert.match(orgGenerationToolsTabSource, /settingsQuery\.error[\s\S]*?<OrganizationStatusMessage tone="danger"/)
  assert.match(orgSettingsSource, /tabs\.map[\s\S]*?<OrganizationTabButton[\s\S]*?variant=\{tab === key \? 'solid' : 'ghost'\}/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /<select\b/)
  assert.doesNotMatch(orgSettingsSurfaceSource, /<input\b[\s\S]{0,80}type="checkbox"/)
})

test('plugin tool page uses package form controls', () => {
  const clientPluginsSource = [
    readProjectFile('apps/frontend/src/features/plugins/components/ClientPluginsPage.tsx'),
    readProjectFile('apps/frontend/src/features/plugins/components/ClientPluginsPageViews.tsx'),
  ].join('\n')
  const pluginToolSource = readProjectFile('apps/frontend/src/features/plugins/components/PluginToolPage.tsx')
  const pluginsFeatureSource = readProjectFile('apps/frontend/src/features/plugins/components/PluginsPageUi.tsx')
  const pluginsFeatureCss = readProjectFile('apps/frontend/src/features/plugins/components/PluginsPageUi.css')
  const uiPackageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const uiBusinessBarrel = readProjectFile('packages/ui/src/components/business/index.ts')
  const uiPluginsComponentDir = path.join(root, 'packages/ui/src/components/business/plugins')
  const uiPluginsBusinessEntry = path.join(root, 'packages/ui/src/business/plugins.ts')
  const uiPluginsStyleEntry = path.join(root, 'packages/ui/src/styles/business/plugins.css')

  assert.equal(existsSync(uiPluginsComponentDir), false, 'plugins page-level UI must not remain in packages/ui')
  assert.equal(existsSync(uiPluginsBusinessEntry), false, 'plugins business entry must not remain in packages/ui')
  assert.equal(existsSync(uiPluginsStyleEntry), false, 'plugins business style entry must not remain in packages/ui')
  assert.equal(Object.hasOwn(uiPackageJson.exports, './business/plugins'), false, 'plugins business entry must not be exported from @movscript/ui')
  assert.equal(Object.hasOwn(uiPackageJson.exports, './styles/business/plugins.css'), false, 'plugins CSS entry must not be exported from @movscript/ui')
  assert.doesNotMatch(uiBusinessBarrel, /plugins/, 'legacy business namespace barrel must not re-export plugins')
  assert.match(pluginsFeatureSource, /import "\.\/PluginsPageUi\.css"/)

  for (const exportName of ['AppCodeBlock', 'AppInlineMeta', 'AppStateMessage', 'AppSurfaceItem', 'Button', 'Input', 'NativeSelect', 'Textarea']) {
    assert.match(pluginsFeatureSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by plugins feature UI`)
    assert.doesNotMatch(pluginToolSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into plugin tool page`)
  }
  for (const exportName of [
    'PluginToolActionButton',
    'PluginToolCodeBlock',
    'PluginToolField',
    'PluginToolFieldDescription',
    'PluginToolFieldLabel',
    'PluginToolFormStack',
    'PluginToolIframe',
    'PluginToolIconButton',
    'PluginToolInput',
    'PluginToolInlineResource',
    'PluginToolLoadingState',
    'PluginToolMain',
    'PluginToolMutedSurface',
    'PluginToolNativeLayout',
    'PluginToolNotFoundState',
    'PluginToolRoot',
    'PluginToolSelect',
    'PluginToolStateMessage',
    'PluginToolSurface',
    'PluginToolTextarea',
    'PluginToolWebviewFrame',
  ]) {
    assert.match(pluginToolSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by plugin tool page`)
    assert.match(pluginsFeatureSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be feature-owned`)
  }
  for (const exportName of ['PluginBannerDismissAction', 'PluginButtonIcon', 'PluginCardSurface', 'PluginEmptyState', 'PluginFileInput', 'PluginSearchInput', 'PluginStateBanner', 'PluginStatusMeta', 'PluginTabButton', 'PluginTabCount', 'PluginTabGroup', 'PluginTagMeta', 'PluginToneText', 'Button']) {
    assert.match(clientPluginsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by client plugins page`)
  }
  for (const exportName of ['AppControlGroup', 'AppEmptyState', 'AppInlineMeta', 'AppStateMessage', 'AppSurfaceItem', 'toneTextClass']) {
    assert.match(pluginsFeatureSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by plugins feature UI`)
  }
  assert.match(pluginsFeatureCss, /\.plugin-card-surface/)
  assert.match(pluginsFeatureCss, /\.plugin-state-banner/)
  assert.match(pluginsFeatureCss, /\.plugin-tool-root/)
  assert.match(pluginsFeatureCss, /\.plugin-tool-form-stack/)
  assert.doesNotMatch(pluginToolSource, /<select\b/)
  assert.doesNotMatch(pluginToolSource, /<textarea\b/)
  assert.doesNotMatch(pluginToolSource, /<input\b/)
  assert.doesNotMatch(pluginToolSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(pluginToolSource, /border border-border rounded-lg bg-background p-4/)
  assert.doesNotMatch(pluginToolSource, /bg-muted text-muted-foreground rounded px-2 py-0\.5/)
  assert.doesNotMatch(pluginToolSource, /border rounded-lg p-4 type-label font-mono whitespace-pre-wrap break-all/)
  assert.match(pluginToolSource, /Plugin info[\s\S]*?<PluginToolSurface>/)
  assert.match(pluginToolSource, /selectedResources\.map[\s\S]*?<PluginToolInlineResource/)
  assert.match(pluginToolSource, /result\.isError \? \([\s\S]*?<PluginToolStateMessage tone="danger"[\s\S]*?<PluginToolCodeBlock/)
  assert.match(pluginToolSource, /<PluginToolMutedSurface>[\s\S]*?<PluginToolCodeBlock/)
  assert.doesNotMatch(clientPluginsSource, /border border-border rounded-lg bg-background/)
  assert.doesNotMatch(clientPluginsSource, /bg-background border border-border rounded-xl/)
  assert.doesNotMatch(clientPluginsSource, /bg-muted text-muted-foreground rounded/)
  assert.doesNotMatch(clientPluginsSource, /bg-muted\/40 border-b border-border/)
  assert.doesNotMatch(clientPluginsSource, /bg-destructive\/10 border-b border-border/)
  assert.doesNotMatch(clientPluginsSource, /w-12 h-12 rounded-xl bg-muted/)
  assert.doesNotMatch(clientPluginsSource, /text-destructive/)
  assert.doesNotMatch(clientPluginsSource, /hover:text-destructive/)
  assert.doesNotMatch(clientPluginsSource, /<button\b/)
  assert.doesNotMatch(clientPluginsSource, /<input\b/)
  assert.doesNotMatch(clientPluginsSource, /\b(?:AppControlGroup|AppEmptyState|AppInlineMeta|AppStateMessage|AppSurfaceItem|toneTextClass)\b/)
  assert.match(clientPluginsSource, /<PluginToneText tone="danger"/)
  assert.match(clientPluginsSource, /<Button size="icon-sm" variant="ghost" tone="danger" onClick=\{onRemove\}>/)
  assert.match(clientPluginsSource, /<PluginFileInput[\s\S]*?ref=\{fileInputRef\}[\s\S]*?type="file"/)
  assert.match(clientPluginsSource, /<PluginTabGroup>[\s\S]*?<PluginTabButton[\s\S]*?active=\{tab === 'installed'\}/)
  assert.match(clientPluginsSource, /<PluginTabButton[\s\S]*?active=\{tab === 'marketplace'\}/)
})

test('top app controls use package form controls', () => {
  const appSource = readProjectFile('apps/frontend/src/App.tsx')
  const appRouteBoundariesSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppRouteBoundaries.tsx')
  const backendBootBoundarySource = readProjectFile('apps/frontend/src/features/app-shell/application/BackendBootBoundary.tsx')
  const canvasShellRouteSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppCanvasEditorShellRoute.tsx')
  const shellLayoutSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppShellLayout.tsx')
  const shellLayoutControlsSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppShellLayoutControls.tsx')
  const appShellSource = [
    appSource,
    appRouteBoundariesSource,
    backendBootBoundarySource,
    canvasShellRouteSource,
    shellLayoutSource,
    shellLayoutControlsSource,
  ].join('\n')
  const appTopControlsSource = readProjectFile('apps/frontend/src/features/app-shell/components/AppTopControls.tsx')
  const headerSource = readProjectFile('apps/frontend/src/features/app-shell/components/Header.tsx')
  const sidebarSource = readProjectFile('apps/frontend/src/features/app-shell/components/Sidebar.tsx')
  const appShellLayoutSource = readProjectFile('packages/ui/src/components/layout/app-shell/index.tsx')
  const appShellWindowSource = readProjectFile('packages/ui/src/components/layout/app-shell/window/index.tsx')
  const appShellSidebarSource = readProjectFile('packages/ui/src/components/layout/app-shell/sidebar/index.tsx')
  const appShellLayoutCss = readProjectFile('packages/ui/src/components/layout/app-shell/styles.css')
  const appShellWindowCss = readProjectFile('packages/ui/src/components/layout/app-shell/window/styles.css')
  const appShellSidebarCss = readProjectFile('packages/ui/src/components/layout/app-shell/sidebar/styles.css')
  const userProfileSource = readProjectFile('apps/frontend/src/features/user/components/UserProfilePage.tsx')
  const userProfileUiSource = readProjectFile('apps/frontend/src/features/user/components/UserProfilePageUi.tsx')
  const userProfileUiCss = readProjectFile('apps/frontend/src/features/user/components/UserProfilePageUi.css')
  const uiAppSource = readAppSource()
  const uiAppCss = readAppCss()

  assert.match(appShellSource, /\bButton\b/)
  assert.match(appShellSource, /\bInput\b/)
  assert.doesNotMatch(appShellSource, /\btoneTextClass\b/)
  assert.match(appRouteBoundariesSource, /\bAppErrorFallback\b/)
  assert.match(backendBootBoundarySource, /\bAppBackendBootOverlayFrame\b/)
  assert.match(uiAppSource, /function AppErrorFallback[\s\S]*?<AppIconFrame[\s\S]*?tone="danger"[\s\S]*?<Button/)
  assert.match(uiAppSource, /function AppErrorFallback[\s\S]*?className=\{cn\("ms-stack ms-center app-error-fallback"/)
  assert.match(uiAppSource, /function AppErrorFallback[\s\S]*?className="ms-type-body app-error-fallback__title"/)
  assert.match(uiAppSource, /function AppErrorFallback[\s\S]*?className="ms-type-label app-error-fallback__message"/)
  assert.match(uiAppSource, /function AppBackendBootOverlay[\s\S]*?<AppSurfaceItem[\s\S]*?<AppIconFrame size="lg" tone=\{tone\}[\s\S]*?<AppInlineMeta/)
  assert.match(uiAppSource, /function AppBackendBootOverlay[\s\S]*?className=\{cn\("ms-center app-backend-boot-overlay"/)
  assert.match(uiAppSource, /function AppBackendBootOverlay[\s\S]*?className="ms-type-body app-backend-boot-card__title"/)
  assert.match(uiAppSource, /function AppBackendBootOverlay[\s\S]*?className="ms-type-label app-backend-boot-card__description"/)
  assert.match(uiAppSource, /function AppBackendBootOverlay[\s\S]*?className="ms-action-row app-backend-boot-card__actions"/)
  assert.match(uiAppSource, /function AppBackendBootActionButton[\s\S]*?<Button/)
  assert.doesNotMatch(uiAppCss, /\.app-error-fallback\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiAppCss, /\.app-error-fallback\s*\{[^}]*flex-direction:\s*column/)
  assert.doesNotMatch(uiAppCss, /\.app-error-fallback__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiAppCss, /\.app-error-fallback__message\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiAppCss, /\.app-backend-boot-overlay\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(uiAppCss, /\.app-backend-boot-card__title\s*\{[^}]*font-size:/)
  assert.doesNotMatch(uiAppCss, /\.app-backend-boot-card__actions\s*\{[^}]*display:\s*flex/)
  assert.match(appShellSource, /\bAppWindowIconButton\b/)
  assert.doesNotMatch(appShellSource, /\b(?:AppIconFrame|AppInlineMeta|AppSurfaceItem)\b/)
  assert.match(appRouteBoundariesSource, /class ErrorBoundary[\s\S]*?<AppErrorFallback/)
  assert.match(backendBootBoundarySource, /<AppBackendBootOverlayFrame[\s\S]*?tone=\{isError \? 'danger' : 'info'\}/)
  assert.match(canvasShellRouteSource, /function CanvasHeaderTitle[\s\S]*?<Input[\s\S]*?value=\{effectiveCanvasName\}/)
  assert.match(canvasShellRouteSource, /function CanvasHeaderNavigation[\s\S]*?<AppWindowIconButton[\s\S]*?canvasBackPath\(search\)/)
  assert.match(canvasShellRouteSource, /function CanvasHeaderContextActions[\s\S]*?<AppWindowIconButton[\s\S]*?ROUTES\.resources/)
  assert.match(shellLayoutSource, /const toolSidebarLayoutControls[\s\S]*?<AppShellLeftPaneToggle/)
  assert.match(shellLayoutControlsSource, /function AppShellLeftPaneToggle[\s\S]*?<AppWindowIconButton[\s\S]*?app-window-sidebar-toggle/)
  assert.doesNotMatch(appShellSource, /<button\b/)
  assert.doesNotMatch(appShellSource, /<input\b/)
  assert.doesNotMatch(appShellSource, /text-destructive/)
  assert.doesNotMatch(appShellSource, /inline-flex h-8 items-center rounded-md border border-border/)
  assert.doesNotMatch(appShellSource, /rounded-md bg-muted px-3 py-2 font-mono/)
  assert.doesNotMatch(appShellSource, /flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted\/50 hover:text-foreground/)
  assert.doesNotMatch(appShellSource, /app-window-sidebar-toggle flex shrink-0 items-center justify-center rounded-md text-muted-foreground/)
  assert.match(appTopControlsSource, /\bMoreHorizontal\b/)
  assert.match(appTopControlsSource, /className="app-top-global-menu"/)
  assert.match(appTopControlsSource, /<DropdownMenuItem onSelect=\{openSettings\}>/)
  assert.match(appTopControlsSource, /<AppTopMenuLeadingIcon icon=\{Settings\} \/>/)
  assert.match(appTopControlsSource, /<AppTopMenuLeadingIcon icon=\{item\.icon\} \/>/)
  assert.match(appTopControlsSource, /className="ms-inline-center app-top-menu-item__update-dot"/)
  assert.doesNotMatch(uiAppCss, /\.app-window-icon-button\s*\{[^}]*flex-shrink:/)
  assert.doesNotMatch(uiAppCss, /\.app-top-menu-item__leading-icon\s*\{/)
  assert.doesNotMatch(uiAppCss, /\.app-top-menu-item__leading-icon\s*\{[^}]*flex-shrink:/)
  assert.doesNotMatch(uiAppCss, /\.app-top-menu-item__update-dot\s*\{[^}]*margin-left:/)
  assert.doesNotMatch(uiAppCss, /\.app-top-menu-item__update-dot\s*\{[^}]*flex-shrink:/)
  assert.doesNotMatch(uiAppCss, /\.app-pager__status\s*\{[^}]*font-variant-numeric:/)
  assert.doesNotMatch(appTopControlsSource, /\bModeIcon\b/)
  assert.match(appTopControlsSource, /<Languages size=\{12\} \/>/)
  assert.match(appTopControlsSource, /<Palette size=\{12\} \/>/)
  assert.doesNotMatch(appTopControlsSource, /\bAppTopLanguageSelect\b/)
  assert.doesNotMatch(appTopControlsSource, /\bshowProjectSelector\b/)
  assert.doesNotMatch(appTopControlsSource, /\bAppTopProjectMenuContent\b/)
  assert.doesNotMatch(appTopControlsSource, /app-top-control-button--mode-switch/)
  assert.doesNotMatch(appTopControlsSource, /\bNativeSelect\b/)
  assert.doesNotMatch(uiAppSource, /\bAppTopLanguageSelect\b/)
  assert.doesNotMatch(uiAppSource, /\bAppTopProjectMenuContent\b/)
  assert.doesNotMatch(uiAppCss, /\.app-top-(?:language-select|project-menu|selection-menu)\b/)
  assert.doesNotMatch(appTopControlsSource, /<select\b/)
  assert.doesNotMatch(appTopControlsSource, /rounded-md border border-border bg-background/)
  assert.match(appTopControlsSource, /\bAppTopControlButton\b/)
  assert.match(headerSource, /\bAppWindowBrandButton\b/)
  assert.match(headerSource, /\bAppWindowHeader\b/)
  assert.match(headerSource, /\bAppWindowControls\b/)
  assert.match(sidebarSource, /\bAppSidebarShell\b/)
  assert.match(sidebarSource, /\bAppSidebarSection\b/)
  assert.doesNotMatch(sidebarSource, /\bAppSidebarActionItem\b/)
  assert.match(sidebarSource, /\bAppSidebarUserButton\b/)
  assert.match(sidebarSource, /\bAppSidebarNavItemFrame\b/)
  assert.match(appShellLayoutSource, /export \* from "\.\/window"/)
  assert.match(appShellLayoutSource, /export \* from "\.\/sidebar"/)
  assert.match(appShellWindowSource, /export function AppWindowHeader/)
  assert.match(appShellSidebarSource, /export function AppSidebarSection/)
  assert.match(appShellSidebarSource, /export function AppSidebarActionItem/)
  assert.match(appShellSidebarSource, /export function appSidebarNavItemClassName/)
  assert.match(appShellLayoutCss, /@import "\.\/window\/styles\.css";/)
  assert.match(appShellLayoutCss, /@import "\.\/sidebar\/styles\.css";/)
  assert.match(appShellSidebarCss, /\.app-sidebar\s*\{/)
  assert.match(appShellSidebarCss, /\.app-sidebar-nav-item\s*\{/)
  assert.match(appShellWindowCss, /\.app-window-brand-button\s*\{/)
  assert.match(appTopControlsSource, /DropdownMenuTrigger asChild[\s\S]*?<AppTopControlButton/)
  assert.match(headerSource, /<AppWindowBrandButton>[\s\S]*?<span>Movscript<\/span>/)
  assert.match(sidebarSource, /function NavItem[\s\S]*?<AppSidebarNavItemFrame/)
  assert.doesNotMatch(sidebarSource, /openAdminConsole|ROUTES\.project\.|projectWorkbenchDefinitions/)
  assert.match(sidebarSource, /DropdownMenuTrigger asChild[\s\S]*?<AppSidebarUserButton/)
  assert.doesNotMatch(headerSource, /<button\b/)
  assert.doesNotMatch(sidebarSource, /<button\b/)
  for (const exportName of [
    'UserProfileActions',
    'UserProfileCard',
    'UserProfileHeader',
    'UserProfileIdentity',
    'UserProfileLogoutButton',
    'UserProfileShell',
  ]) {
    assert.match(userProfileSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by user profile page`)
    assert.match(userProfileUiSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be user profile feature-owned`)
    assert.doesNotMatch(appShellLayoutSource + appShellWindowSource + appShellSidebarSource + uiAppSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must not be exported from @movscript/ui`)
  }
  for (const className of [
    'account-profile',
    'account-profile-header',
    'account-profile-card',
    'account-profile-identity',
    'account-profile-actions',
    'account-profile-logout-button',
  ]) {
    assert.match(userProfileUiCss, cssClassSelectorPattern(className), `${className} style must be user profile feature-owned`)
    assert.doesNotMatch(uiAppCss, cssClassSelectorPattern(className), `${className} style must not remain in @movscript/ui app CSS`)
  }
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/user-profile/index.tsx')), false, 'user profile UI must be feature-owned')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/app/user-profile/styles.css')), false, 'user profile CSS must be feature-owned')
  assert.doesNotMatch(uiAppSource, /from "\.\/user-profile"/, 'user profile module must not be re-exported from @movscript/ui app business')
  assert.doesNotMatch(uiAppCss, /user-profile\/styles\.css/, 'user profile CSS must not be imported by @movscript/ui app business CSS')
  assert.match(userProfileSource, /from ['"]@\/features\/user\/components\/UserProfilePageUi['"]/)
  assert.match(userProfileUiSource, /\bAppAvatar\b/)
  assert.match(userProfileUiSource, /\bButton\b/)
  assert.match(userProfileSource, /<UserProfileIdentity[\s\S]*?name=\{currentUser\?\.username\}/)
  assert.match(userProfileSource, /const logout = \(\) => \{[\s\S]*?setCurrentUser\(null\)[\s\S]*?\}/)
  assert.match(userProfileSource, /<UserProfileLogoutButton[\s\S]*?onClick=\{logout\}/)
  assert.doesNotMatch(userProfileSource, /\b(?:Button|AppAvatar)\b/)
  assert.doesNotMatch(userProfileSource, /className=/)
  assert.doesNotMatch(userProfileSource, /<(?:div|span|p|h1)\b/)
  assert.doesNotMatch(userProfileSource, /<button\b/)
  assert.doesNotMatch(userProfileSource, /w-16 h-16 rounded-full bg-muted/)
  assert.doesNotMatch(userProfileSource, /text-destructive/)
  assert.doesNotMatch(userProfileSource, /hover:text-destructive/)
  assert.doesNotMatch(headerSource, /hover:bg-muted\/50/)
  assert.doesNotMatch(sidebarSource, /function ActionNavItem/)
  assert.doesNotMatch(sidebarSource, /function Section/)
  assert.doesNotMatch(sidebarSource, /hover:bg-muted\/50/)
  assert.doesNotMatch(sidebarSource, /relative bg-sidebar border-r border-sidebar-border flex flex-col/)
  assert.doesNotMatch(sidebarSource, /h-auto w-full justify-between px-3 py-1\.5/)
})

test('project standards page UI is feature-owned, not project package API', () => {
  const standardsSource = [
    readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsPage.tsx'),
    readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsPageParts.tsx'),
    readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsWorkspacePanels.tsx'),
    readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsPromptPreviewAside.tsx'),
    readProjectFile('apps/frontend/src/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewPanel.tsx'),
  ].join('\n')
  const projectStandardsFeatureSource = [
    readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsUi.tsx'),
    readProjectFile('apps/frontend/src/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewUi.tsx'),
  ].join('\n')
  const projectStandardsFeatureCss = [
    readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsUi.css'),
    readProjectFile('apps/frontend/src/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewUi.css'),
  ].join('\n')
  const projectStandardsSemanticUiSource = readProjectFile('apps/frontend/src/features/project-standards/presentation/projectStandardsSemanticUi.ts')

  for (const exportName of ['CheckboxField', 'AppCodeBlock', 'AppInlineMeta', 'AppSurfaceItem', 'AppTextEmptyState', 'WorkbenchSurfaceItem', 'Input', 'Button', 'StatusBadge', 'DialogContent']) {
    assert.match(projectStandardsFeatureSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by project standards feature UI`)
    assert.doesNotMatch(standardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into ProjectStandardsPage`)
  }
  for (const exportName of [
    'ProjectStandardsActionButton',
    'ProjectStandardsBadge',
    'ProjectStandardsCheckboxField',
    'ProjectStandardsCodeBlock',
    'ProjectStandardsContentLayout',
    'ProjectStandardsDialog',
    'ProjectStandardsInput',
    'ProjectStandardsMetric',
    'ProjectStandardsPreviewAside',
    'ProjectStandardsPreviewSurface',
    'ProjectStandardsSelect',
    'ProjectStandardsStatusBadge',
    'ProjectStandardsSurfaceItem',
    'ProjectStandardsTextarea',
    'ProjectWorkspaceReviewActionButton',
    'ProjectWorkspaceReviewBadge',
    'ProjectWorkspaceReviewCallout',
    'ProjectWorkspaceReviewEmptyBlock',
    'ProjectWorkspaceReviewEmptyText',
    'ProjectWorkspaceReviewLoadingState',
    'ProjectWorkspaceReviewNoteList',
    'ProjectWorkspaceReviewStatusBadge',
    'ProjectStandardsWorkspaceReviewArtifactList',
    'ProjectStandardsWorkspaceReviewArtifactPanel',
    'ProjectStandardsWorkspaceReviewFieldDiffList',
    'ProjectStandardsWorkspaceReviewFieldDiffRow',
    'ProjectStandardsWorkspaceReviewShell',
    'ProjectStandardsWorkspaceReviewSummaryCallout',
  ]) {
    assert.match(standardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ProjectStandardsPage`)
    assert.match(projectStandardsFeatureSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be feature-owned`)
  }
  assert.match(standardsSource, /from ['"]@\/features\/project-standards\/components\/ProjectStandardsUi['"]/)
  assert.doesNotMatch(standardsSource, /from ['"]@movscript\/ui\/business\/project['"]/, 'project standards must not import feature UI from packages/ui')
  for (const relativePath of [
    'packages/ui/src/components/business/project/index.tsx',
    'packages/ui/src/components/business/project/styles.css',
    'packages/ui/src/components/business/project/workspace-review/index.tsx',
    'packages/ui/src/components/business/project/workspace-review/styles.css',
    'packages/ui/src/components/business/project/standards/index.tsx',
    'packages/ui/src/components/business/project/standards/styles.css',
    'packages/ui/src/business/project.ts',
    'packages/ui/src/styles/business/project.css',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because project standards UI is feature-owned`)
  }
  assert.match(standardsSource, /<ProjectStandardsInput[\s\S]*?styleReferenceInputRef\.current = node[\s\S]*?type="file"[\s\S]*?multiple/)
  assert.match(standardsSource, /standardGroups\.map[\s\S]*?ProjectStandardsSurfaceItem/, 'core standard cards must use package project standards surface items')
  assert.match(projectStandardsFeatureSource, /toneSurfaceClass\("warning"\)/, 'warning tone surface must be owned by project standards feature UI')
  assert.match(projectStandardsFeatureCss, /\.project-standards-content-layout\s*\{/)
  assert.match(projectStandardsFeatureCss, /\.project-workspace-review-badge\b/)
  assert.match(projectStandardsFeatureCss, /\.project-standards-rule-card\s*\{/)
  assert.doesNotMatch(standardsSource, /\b(?:toneTextClass|toneSurfaceClass|cn)\b/)
  for (const recipeName of ['projectStandardsReadyRecipe', 'projectStandardsRequiredRuleRecipe', 'projectStandardsEnabledRuleRecipe']) {
    assert.match(projectStandardsSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be project standards semantic UI-owned`)
    assert.match(standardsSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by project standards page`)
  }
  assert.doesNotMatch(standardsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(standardsSource, /ProjectStandardsIconButton[\s\S]{0,120}variant="ghost"[\s\S]{0,80}tone="danger"[\s\S]{0,160}onDeleteRule/, 'ProjectStandardsPage delete action must use package danger button tone')
  assert.doesNotMatch(standardsSource, /<input\b/)
  assert.doesNotMatch(standardsSource, /<input\b[\s\S]{0,80}type="checkbox"/)
  assert.doesNotMatch(standardsSource, /text-destructive/)
  assert.doesNotMatch(standardsSource, /border border-dashed border-border bg-background px-3 py-4/)
  assert.doesNotMatch(standardsSource, /overflow-hidden rounded-md border border-border bg-background/)
  assert.doesNotMatch(standardsSource, /rounded-md border p-3/)
  assert.doesNotMatch(standardsSource, /rounded-md border px-3 py-2/)
  assert.doesNotMatch(standardsSource, /rounded-md border border-primary\/30 bg-primary\/5 p-3/)
  assert.doesNotMatch(standardsSource, /rounded-md border border-border bg-muted\/20 p-2/)
  assert.doesNotMatch(standardsSource, /border-dashed border-border bg-muted\/30/)
  assert.doesNotMatch(standardsSource, /rounded-full bg-muted px-1\.5/)
  assert.doesNotMatch(standardsSource, /<pre\b/)
  assert.doesNotMatch(standardsSource, /<pre className="mt-3 max-h-\[620px\][^"]*rounded-md border border-border bg-background/)
})

test('tools dialog UI is feature-owned, not tools package API', () => {
  const toolsDialogSource = [
    readProjectFile('apps/frontend/src/features/tools/components/ToolDialog.tsx'),
    readProjectFile('apps/frontend/src/features/tools/components/ToolDialogHistorySection.tsx'),
    readProjectFile('apps/frontend/src/features/tools/components/ToolDialogJobPanels.tsx'),
  ].join('\n')
  const toolsDialogFeatureSource = readProjectFile('apps/frontend/src/features/tools/components/ToolDialogUi.tsx')
  const toolsDialogFeatureCss = readProjectFile('apps/frontend/src/features/tools/components/ToolDialogUi.css')

  assert.match(toolsDialogSource, /from ['"]\.\/ToolDialogUi['"]/, 'ToolDialog must consume feature-owned dialog UI')
  assert.doesNotMatch(toolsDialogSource, /from ['"]@movscript\/ui\/business\/tools['"]/, 'ToolDialog must not import page dialog UI from the package')
  for (const exportName of [
    'ToolDialogBody',
    'ToolDialogCopyButton',
    'ToolDialogDebugPanel',
    'ToolDialogFrame',
    'ToolDialogHistoryList',
    'ToolDialogMain',
    'ToolDialogPanel',
    'ToolDialogResourcePane',
    'ToolDialogWarningCallout',
  ]) {
    assert.match(toolsDialogSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by tools dialog`)
    assert.match(toolsDialogFeatureSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be feature-owned`)
  }
  assert.match(toolsDialogFeatureSource, /from ['"]@movscript\/ui\/semantic['"]/, 'feature UI may consume semantic helper contracts')
  assert.match(toolsDialogFeatureSource, /from ['"]@movscript\/ui\/layout['"]/, 'feature UI may consume shared overlap layout primitives')
  assert.match(toolsDialogFeatureCss, /\.tool-dialog-frame\s*\{/)
  assert.match(toolsDialogFeatureCss, /\.tool-dialog-resource-overlap\s*\{/)
  for (const relativePath of [
    'packages/ui/src/components/business/tools/index.tsx',
    'packages/ui/src/components/business/tools/styles.css',
    'packages/ui/src/components/business/tools/dialog/index.tsx',
    'packages/ui/src/components/business/tools/dialog/styles.css',
    'packages/ui/src/business/tools.ts',
    'packages/ui/src/styles/business/tools.css',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because tools dialog UI is feature-owned`)
  }
})

test('generation cards use package tone contracts', () => {
  const genInputCardSource = readProjectFile('apps/frontend/src/shared/ui/GenInputCard.tsx')
  const genResultCardSource = readProjectFile('apps/frontend/src/shared/ui/GenResultCard.tsx')
  const generationResultCardSource = readGenerationResultSource()
  const generationResultCardCss = readGenerationResultCss()
  const generationCardsSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.tsx')
  const generationCardUiSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCardUi.tsx')
  const generationCardsCss = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.css')
  const generationCardSources = [generationCardsSource, generationCardUiSource].join('\n')
  const sources = [generationCardSources, genResultCardSource, genInputCardSource].join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(generationCardSources, /AgentGenerated(?:Card|Item|IntentText|Stat)/)
  assert.match(generationCardUiSource, /toneTextClass/)
  assert.match(generationCardUiSource, /toneSurfaceClass/)
  assert.match(generationCardSources, /\bAgentGeneratedProgressBar\b/)
  assert.match(generationCardSources, /\bAgentGeneratedStatusBadge\b/)
  assert.match(generationCardUiSource, /function AgentGeneratedProgressBar[\s\S]*?<AppProgressBar/)
  assert.match(generationCardUiSource, /function AgentGeneratedStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(generationCardUiSource, /function AgentGeneratedCard[\s\S]*?<AgentSurfaceBlock/)
  assert.match(generationCardUiSource, /function AgentGeneratedItem[\s\S]*?<AgentSurfaceBlock/)
  assert.doesNotMatch(generationCardSources, /\b(?:AgentGeneratedCallout|ReviewCallout)\b/)
  assert.match(generationCardsCss, /\.agent-generated-card\s*\{/)
  assert.match(generationCardsCss, /\.agent-generated-status-badge\s*\{/)
  assert.match(genResultCardSource, /\bGenerationResultCard\b/)
  assert.match(genResultCardSource, /\bGenerationInlineResourceChip\b/)
  assert.match(genResultCardSource, /\bGenerationContextSummary\b/)
  assert.match(genResultCardSource, /\bGenerationContextRow\b/)
  assert.match(genResultCardSource, /\bGenerationContextMeta\b/)
  assert.match(generationResultCardSource, /\bAppMediaFrame\b/)
  assert.match(generationResultCardSource, /\bAppStateMessage\b/)
  assert.match(generationResultCardSource, /\bAppSurfaceItem\b/)
  assert.match(generationResultCardSource, /\bAppInlineMeta\b/)
  assert.match(generationResultCardSource, /\bAppIconFrame\b/)
  assert.match(generationResultCardSource, /\bButton\b/)
  assert.match(generationResultCardCss, /\.generation-result-card\s*\{/)
  assert.match(generationResultCardCss, /\.generation-result-resource-chip\s*\{/)
  assert.doesNotMatch(genResultCardSource, /function MediaCell/)
})

test('agent generation and provider session interactions use package tone contracts', () => {
  const generationDisplaySource = readProjectFile('apps/frontend/src/features/agent/domain/agentGenerationDisplay.ts')
  const generationCardsSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.tsx')
  const generationCardUiSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCardUi.tsx')
  const pinnedStatusShelfSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
  const generationCardsCss = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.css')
  const agentPlanOverviewShellSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/shell/index.tsx')
  const agentPlanOverviewShellCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/shell/styles.css')
  const agentPlanOverviewTaskSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/task/index.tsx')
  const agentPlanOverviewTaskCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/task/styles.css')
  const agentPlanOverviewItemSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/item/index.tsx')
  const agentPlanOverviewItemCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/item/styles.css')
  const agentPlanOverviewDisclosureSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/disclosure/index.tsx')
  const agentPlanOverviewDisclosureCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/disclosure/styles.css')
  const agentPlanOverviewFeedbackSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/feedback/index.tsx')
  const agentPlanOverviewFeedbackCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/feedback/styles.css')
  const agentRunInteractionSource = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/index.tsx')
  const agentRunInteractionApprovalStatusSource = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/status/index.ts')
  const agentRunInteractionApprovalCardSource = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/card/index.tsx')
  const agentRunInteractionApprovalCodeSource = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/code/index.tsx')
  const agentRunInteractionCss = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/styles.css')
  const agentRunInteractionCardCss = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/card/styles.css')
  const agentRunInteractionThumbCss = readProjectFile('apps/frontend/src/features/agent/components/run-interaction-ui/thumbnail/styles.css')
  const agentRunInteractionBubbleSource = readProjectFile('apps/frontend/src/features/agent/components/AgentRunInteractionBubble.tsx')
  const agentPackageIndexSource = readProjectFile('packages/ui/src/components/business/agent/index.tsx')
  const agentPackageStylesSource = readProjectFile('packages/ui/src/components/business/agent/styles.css')
  const agentSemanticUiSource = readProjectFile('apps/frontend/src/features/agent/presentation/agentSemanticUi.ts')
  const providerSessionInteractionsSource = [
    readProjectFile('apps/frontend/src/features/agent/components/providerSessionInteractions.tsx'),
    readProjectFile('apps/frontend/src/features/agent/components/ProviderSessionRequestCards.tsx'),
  ].join('\n')
  const movScriptWorkspaceFilesSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
  const agentArtifactResultCardsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx')
  const sources = [
    generationCardsSource,
    generationCardUiSource,
    pinnedStatusShelfSource,
    providerSessionInteractionsSource,
    movScriptWorkspaceFilesSource,
    agentArtifactResultCardsSource,
  ].join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.doesNotMatch([
    pinnedStatusShelfSource,
    providerSessionInteractionsSource,
    movScriptWorkspaceFilesSource,
    agentArtifactResultCardsSource,
  ].join('\n'), /toneTextClass|toneSurfaceClass|accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class/)
  const generationCardSources = `${generationCardsSource}\n${generationCardUiSource}`
  assert.match(generationCardSources, /AgentGenerated(?:Card|Item|IntentText|Stat)/)
  assert.match(generationCardUiSource, /toneTextClass/)
  assert.match(generationCardUiSource, /toneSurfaceClass/)
  assert.doesNotMatch(generationCardSources, /\b(?:AgentGeneratedCallout|ReviewCallout)\b/)
  assert.match(pinnedStatusShelfSource, /AgentPlanOverviewTaskStatusIcon/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewHeader[\s\S]*?"ms-action-row ms-agent-plan-overview__header"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewShell[\s\S]*?"ms-type-label ms-agent-plan-overview"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewTitle[\s\S]*?"ms-action-row ms-agent-plan-overview__title"/)
  assert.match(agentPlanOverviewShellSource, /"ms-inline-center ms-agent-plan-overview__title-icon"/)
  assert.match(agentPlanOverviewShellSource, /"ms-text-truncate ms-type-label ms-agent-plan-overview__title-text"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewStats[\s\S]*?"ms-type-tiny ms-agent-plan-overview__stats"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewDescription[\s\S]*?"ms-type-tiny ms-agent-plan-overview__description"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewStatusBadge[\s\S]*?"ms-type-tiny ms-agent-plan-overview__status"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewActionBar[\s\S]*?"ms-action-row ms-agent-plan-overview__actions"/)
  assert.match(agentPlanOverviewShellSource, /AgentPlanOverviewActionButton[\s\S]*?"ms-type-tiny ms-agent-plan-overview__action"/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview__(?:stats|description|status|action)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview__description\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview__title\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview__title-text\s*\{[^}]*text-overflow/)
  assert.doesNotMatch(agentPlanOverviewShellCss, /\.ms-agent-plan-overview__actions\s*\{[^}]*display:\s*flex/)
  assert.match(agentPlanOverviewTaskSource, /export const AgentPlanOverviewTaskStatusIcon/)
  assert.match(agentPlanOverviewTaskSource, /toneTextClass\(intent\)/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewList[\s\S]*?"ms-stack ms-agent-plan-overview-list"/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewTaskCard[\s\S]*?"ms-action-row ms-agent-plan-overview-task"/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewTaskStatusIcon[\s\S]*?"ms-inline-center ms-agent-plan-overview-task__status-icon"/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewTaskHeader[\s\S]*?"ms-action-row ms-agent-plan-overview-task__header"/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewTaskTitle[\s\S]*?"ms-text-truncate ms-type-tiny ms-agent-plan-overview-task__title"/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewTaskBadge[\s\S]*?"ms-type-tiny ms-agent-plan-overview-task__badge"/)
  assert.match(agentPlanOverviewTaskSource, /AgentPlanOverviewTaskMeta[\s\S]*?"ms-action-row ms-type-tiny ms-agent-plan-overview-task__meta"/)
  assert.match(agentPlanOverviewTaskCss, cssClassSelectorPattern('ms-agent-plan-overview-task__status-icon'))
  assert.doesNotMatch(agentPlanOverviewTaskCss, /\.ms-agent-plan-overview-list\s*\{[^}]*display:\s*grid/)
  assert.doesNotMatch(agentPlanOverviewTaskCss, /\.ms-agent-plan-overview-task\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPlanOverviewTaskCss, /\.ms-agent-plan-overview-task__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPlanOverviewTaskCss, /\.ms-agent-plan-overview-task__title\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(agentPlanOverviewTaskCss, /\.ms-agent-plan-overview-task__(?:title|badge|meta)\s*\{[^}]*font-size:/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewItemCard[\s\S]*?"ms-type-tiny ms-agent-plan-overview-item"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewItemHeader[\s\S]*?"ms-action-row ms-agent-plan-overview-item__header"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewItemTitle[\s\S]*?"ms-text-truncate ms-agent-plan-overview-item__title"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewItemActions[\s\S]*?"ms-action-row ms-agent-plan-overview-item__actions"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewMetaRow[\s\S]*?"ms-action-row ms-type-tiny ms-agent-plan-overview-meta-row"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewMetaText[\s\S]*?"ms-text-truncate ms-agent-plan-overview-meta-text"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewBadge[\s\S]*?"ms-text-truncate ms-type-tiny ms-agent-plan-overview-badge"/)
  assert.match(agentPlanOverviewItemSource, /AgentPlanOverviewInlineActions[\s\S]*?"ms-action-row ms-agent-plan-overview-inline-actions"/)
  assert.doesNotMatch(agentPlanOverviewItemCss, /\.ms-agent-plan-overview-item\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentPlanOverviewItemCss, /\.ms-agent-plan-overview-item__header\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(agentPlanOverviewItemCss, /\.ms-agent-plan-overview-item__title\s*\{[^}]*text-overflow:/)
  assert.doesNotMatch(agentPlanOverviewItemCss, /\.ms-agent-plan-overview-(?:meta-row|badge)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentPlanOverviewItemCss, /\.ms-agent-plan-overview-(?:item__actions|inline-actions|meta-row)\s*\{[^}]*display:\s*flex/)
  assert.match(agentPlanOverviewDisclosureSource, /AgentPlanOverviewDisclosureSummary[\s\S]*?"ms-action-row ms-type-tiny ms-agent-plan-overview-disclosure__summary"/)
  assert.match(agentPlanOverviewDisclosureSource, /AgentPlanOverviewDisclosureBody[\s\S]*?"ms-stack ms-type-tiny ms-agent-plan-overview-disclosure__body"/)
  assert.match(agentPlanOverviewDisclosureSource, /AgentPlanOverviewFilterRow[\s\S]*?"ms-action-row ms-agent-plan-overview-filter-row"/)
  assert.doesNotMatch(agentPlanOverviewDisclosureCss, /\.ms-agent-plan-overview-disclosure__(?:summary|body)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentPlanOverviewDisclosureCss, /\.ms-agent-plan-overview-disclosure__(?:summary|body)\s*\{[^}]*display:\s*(?:flex|grid)/)
  assert.doesNotMatch(agentPlanOverviewDisclosureCss, /\.ms-agent-plan-overview-filter-row\s*\{[^}]*display:\s*flex/)
  assert.match(agentPlanOverviewFeedbackSource, /className="ms-type-tiny ms-agent-plan-overview-code__summary"/)
  assert.match(agentPlanOverviewFeedbackSource, /className="ms-type-tiny ms-agent-plan-overview-code__content"/)
  assert.match(agentPlanOverviewFeedbackSource, /AgentPlanOverviewNotice[\s\S]*?"ms-type-tiny ms-agent-plan-overview-notice"/)
  assert.match(agentPlanOverviewFeedbackSource, /AgentPlanOverviewNoticeTitle[\s\S]*?"ms-text-truncate ms-agent-plan-overview-notice__title"/)
  assert.match(agentPlanOverviewFeedbackSource, /AgentPlanOverviewText[\s\S]*?"ms-type-tiny ms-agent-plan-overview-text"/)
  assert.match(agentPlanOverviewFeedbackSource, /AgentPlanOverviewWarningText[\s\S]*?"ms-type-tiny ms-agent-plan-overview-warning"/)
  assert.doesNotMatch(agentPlanOverviewFeedbackCss, /\.ms-agent-plan-overview-(?:code__summary|code__content|notice|text|warning)\s*\{[^}]*font-size:/)
  assert.doesNotMatch(agentPlanOverviewFeedbackCss, /\.ms-agent-plan-overview-(?:code__content|notice|text|warning)\s*\{[^}]*line-height:/)
  assert.doesNotMatch(agentPlanOverviewFeedbackCss, /\.ms-agent-plan-overview-notice__title\s*\{[^}]*text-overflow:/)
  assert.match(generationCardSources, /\bAgentGeneratedProgressBar\b/)
  assert.match(generationCardSources, /\bAgentGeneratedStatusBadge\b/)
  assert.match(generationCardUiSource, /function AgentGeneratedProgressBar[\s\S]*?<AppProgressBar/)
  assert.match(generationCardUiSource, /function AgentGeneratedStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(generationCardUiSource, /function AgentGeneratedCard[\s\S]*?<AgentSurfaceBlock/)
  assert.match(generationCardUiSource, /function AgentGeneratedItem[\s\S]*?<AgentSurfaceBlock/)
  assert.match(generationCardsCss, /\.agent-generated-card\s*\{/)
  assert.match(generationCardsSource, /agentGenerationStatusRecipe/)
  assert.match(generationCardsSource, /agentGenerationStatusRecipe\(badge\.state\)/)
  assert.match(generationCardsSource, /generationProgressIntent\(badge\.state\)/)
  assert.match(pinnedStatusShelfSource, /pinnedGenerationProgressIntent\(badge\.state, state\.terminal\)/)
  assert.match(generationDisplaySource, /\bGenerationJobBadgeState\b/)
  assert.match(generationDisplaySource, /state: GenerationJobBadgeState/)
  assert.match(agentSemanticUiSource, /agentGenerationStatusRecipe\(state: GenerationJobBadgeState\)/)
  assert.doesNotMatch(generationDisplaySource, /\bGenerationJobBadgeTone\b/)
  assert.doesNotMatch(generationDisplaySource, /\btone\??:/)
  assert.doesNotMatch(generationDisplaySource, /\btone:\s*['"]/)
  assert.doesNotMatch(generationCardsSource, /\bbadge\.tone\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /\bbadge\.tone\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /\btoneTextClass\b/)
  assert.doesNotMatch(`${generationCardsSource}\n${pinnedStatusShelfSource}`, /function (?:generationProgressTone|pinnedGenerationProgressTone)\b/)
  assert.match(generationCardsSource, /agentReadinessStatusRecipe/)
  assert.match(generationCardsSource, /errors\.map[\s\S]*?<AgentGeneratedItem[\s\S]*?intent="danger"/)
  assert.doesNotMatch(generationCardsSource, /text-destructive/)
  assert.doesNotMatch(generationCardsSource, /\bReviewCallout\b/)
  assert.doesNotMatch(providerSessionInteractionsSource, /AgentSurfaceBlock/)
  assert.match(providerSessionInteractionsSource, /from ['"]@\/features\/agent\/components\/run-interaction-ui['"]/)
  assert.match(agentRunInteractionBubbleSource, /from ['"]@\/features\/agent\/components\/run-interaction-ui['"]/)
  assert.doesNotMatch(agentPackageIndexSource, /export \* from "\.\/run-interaction"/)
  assert.doesNotMatch(agentPackageStylesSource, /@import "\.\/run-interaction\/styles\.css"/)
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/agent/run-interaction')), false)
  assert.match(providerSessionInteractionsSource, /AgentRunInteractionProviderSessionPanel/)
  assert.doesNotMatch(providerSessionInteractionsSource, /AgentRunInteractionRuntimePanel/)
  assert.match(providerSessionInteractionsSource, /AgentRunInteractionRequestCard/)
  assert.match(providerSessionInteractionsSource, /AgentRunInteractionRequestActions/)
  assert.match(providerSessionInteractionsSource, /agentRunStatusRecipe/)
  assert.match(providerSessionInteractionsSource, /agentRunInteractionActionStatusRecipe/)
  assert.match(providerSessionInteractionsSource, /AgentRunInteractionSection/)
  assert.match(providerSessionInteractionsSource, /AgentRunInteractionChoiceButton/)
  assert.match(providerSessionInteractionsSource, /AgentRunInteractionActionButton/)
  assert.doesNotMatch(providerSessionInteractionsSource, /agentRunInteractionApproval(?:Section|Title|Impact|Item|Rail|Badge|InputChoice|InputItem|InputRail|InputBadge|InputAnswer|RejectAction)Class/)
  assert.doesNotMatch(agentRunInteractionSource, /export \* from "\.\/status"/)
  assert.match(agentRunInteractionCss, /@import "\.\/card\/styles\.css"/)
  assert.match(agentRunInteractionCardCss, /\.agent-run-interaction-request-card\s*\{/)
  assert.match(agentRunInteractionThumbCss, /\.agent-run-interaction-thumb\s*\{/)
  assert.match(agentRunInteractionApprovalStatusSource, /export function agentRunInteractionApprovalSectionClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /export function agentRunInteractionApprovalBadgeClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /export function agentRunInteractionApprovalInputChoiceClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /toneSurfaceClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /toneTextClass/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionRequestCard[\s\S]*?<Frame/)
  assert.doesNotMatch(agentRunInteractionApprovalCardSource, /\bAgentSurfaceBlock\b/)
  assert.match(agentRunInteractionApprovalCardSource, /from "@movscript\/ui\/primitives"/)
  assert.doesNotMatch(agentRunInteractionApprovalCodeSource, /@movscript\/ui\/business\/agent/)
  assert.match(agentRunInteractionApprovalCodeSource, /ms-agent-field ms-agent-data-block agent-run-interaction-code/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionChoiceButton[\s\S]*?<Button/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionTextInput[\s\S]*?<Input/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionStateBadge[\s\S]*?<Badge/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionMarkerDot[\s\S]*?<AppMarkerDot/)
  assert.doesNotMatch(providerSessionInteractionsSource, /\b(?:AgentSurfaceBlock|AppMarkerDot|Badge|Button|Input|StatusBadge)\b/)
  assert.match(providerSessionInteractionsSource, /\bAgentRunInteractionMarkerDot\b/)
  assert.match(providerSessionInteractionsSource, /\bAgentRunInteractionTextInput\b/)
  assert.match(agentArtifactResultCardsSource, /workspaceArtifactStatusRecipe/)
  assert.match(providerSessionInteractionsSource, /<AgentRunInteractionTextInput[\s\S]*?data-testid="agent-run-input-text"/)
  assert.doesNotMatch(providerSessionInteractionsSource, /runInteractionActionDotProps[\s\S]*?return \{ tone: 'danger' as const \}/)
  assert.doesNotMatch(providerSessionInteractionsSource, /\b(?:accentBadgeClass|accentDotClass|accentSurfaceClass|accentTextClass|toneDotClass|toneSurfaceClass|toneTextClass)\b/)
  assert.doesNotMatch(providerSessionInteractionsSource, /function runInteractionApproval(?:Section|Title|Impact|Item|Rail|Badge)Class\b/)
  assert.doesNotMatch(generationCardsSource, /ms-semantic-(?:icon|badge|surface|dot)--/)
  assert.doesNotMatch(sources, /function (?:generationJobStatusTone|workspaceStatusTone|runInteractionActionBadgeTone)\b/)
  assert.doesNotMatch(sources, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(providerSessionInteractionsSource, /<input\b/)
  assert.doesNotMatch(providerSessionInteractionsSource, /border-destructive\//)
  assert.doesNotMatch(providerSessionInteractionsSource, /bg-destructive/)
  assert.doesNotMatch(providerSessionInteractionsSource, /text-destructive/)
  assert.doesNotMatch(providerSessionInteractionsSource, /bg-muted-foreground/)
  assert.doesNotMatch(providerSessionInteractionsSource, /bg-border/)
  assert.doesNotMatch(providerSessionInteractionsSource, /h-1\.5 w-1\.5 shrink-0 rounded-full/)
  assert.doesNotMatch(providerSessionInteractionsSource, /runInteractionActionDotClass/)
  assert.doesNotMatch(generationCardsSource, /rounded bg-background\/70 px-2 py-1\.5/)
  assert.doesNotMatch(generationCardsSource, /rounded-md border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(generationCardsSource, /rounded border border-border\/80 bg-muted\/20/)
  assert.doesNotMatch(generationCardsSource, /h-1\.5 overflow-hidden rounded-full bg-muted/)
  assert.doesNotMatch(providerSessionInteractionsSource, /rounded-md border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(providerSessionInteractionsSource, /rounded-md border border-border\/80 bg-muted\/20/)
  assert.doesNotMatch(providerSessionInteractionsSource, /rounded border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(providerSessionInteractionsSource, /relative overflow-hidden rounded-md border bg-background\/35/)
})

test('jobs status badges use package semantic status contracts', () => {
  const jobsSource = [
    readProjectFile('apps/frontend/src/features/jobs/components/JobsPage.tsx'),
    readProjectFile('apps/frontend/src/features/jobs/components/JobsPageParts.tsx'),
    readProjectFile('apps/frontend/src/features/jobs/components/JobsPageCards.tsx'),
  ].join('\n')
  const jobsSemanticUiSource = readProjectFile('apps/frontend/src/features/jobs/presentation/jobsSemanticUi.ts')
  const primitiveBadgeSource = readProjectFile('packages/ui/src/components/primitives/badge.tsx')
  const jobsPageUiSource = readProjectFile('apps/frontend/src/features/jobs/components/JobsPageUi.tsx')
  const jobsPageUiCss = readProjectFile('apps/frontend/src/features/jobs/components/JobsPageUi.css')
  const jobsDisplayUiSource = readJobsDisplayUiSource()
  const jobsDisplayUiCss = readJobsCss()
  const packageJson = JSON.parse(readProjectFile('packages/ui/package.json'))
  const packageBusinessBarrel = readProjectFile('packages/ui/src/components/business/index.ts')
  const frontendCssEntry = readProjectFile('apps/frontend/src/index.css')
  const rawStatusPillPattern = /inline-flex items-center gap-1 type-label .*rounded-full/
  const rawCardShellPattern = /rounded-(?:lg|xl) border border-border bg-(?:background|card)/

  for (const exportName of [
    'JobActionRow',
    'JobCardShell',
    'JobCardState',
    'JobCodeHistory',
    'JobContextBar',
    'JobDetailActions',
    'JobDetailBlock',
    'JobDetailCodeBlock',
    'JobDetailKeyValue',
    'JobDetailPanel',
    'JobGridCaption',
    'JobGridMediaArea',
    'JobGridMediaPreview',
    'JobListHeader',
    'JobListMediaArea',
    'JobListMediaPreview',
    'JobOverlayAction',
    'JobStatusBadge',
    'JobTitleBlock',
    'JobTraceEntry',
    'JobsActionButton',
    'JobsCollection',
    'JobsEmptyState',
    'JobsFilterBar',
    'JobsFilterChipButton',
    'JobsHeaderStatus',
    'JobsLoadingState',
    'JobsPageShell',
    'JobsPager',
    'JobsPagerButton',
    'JobsViewToggle',
    'JobSpinIcon',
  ]) {
    assert.match(jobsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by jobs page`)
  }
  assert.doesNotMatch(jobsSource, /\bJobsHeader\b/)
  for (const exportName of [
    'JobsActionButton',
    'JobsCategorySection',
    'JobsCollection',
    'JobsCountPill',
    'JobsEmptyState',
    'JobsFilterBar',
    'JobsFilterChipButton',
    'JobsFilterDivider',
    'JobsFilterGroup',
    'JobsHeaderStatus',
    'JobsLoadingState',
    'JobsPageShell',
    'JobsPager',
    'JobsPagerButton',
    'JobsSelectedDetailRegion',
    'JobsViewToggle',
  ]) {
    assert.match(jobsPageUiSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be jobs feature-owned`)
    assert.doesNotMatch(jobsDisplayUiSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must remain jobs feature-owned, not shared display UI`)
  }
  assert.match(jobsDisplayUiSource, /export function JobDetailCodeBlock/)
  assert.match(jobsDisplayUiSource, /export function JobDetailKeyValue/)
  assert.match(jobsDisplayUiSource, /export function JobCardShell/)
  assert.match(jobsDisplayUiSource, /export function JobGridMediaPreview/)
  assert.match(jobsDisplayUiSource, /export function JobListMediaPreview/)
  assert.match(jobsDisplayUiSource, /export function JobStatusBadge/)
  assert.match(jobsDisplayUiSource, /export function JobSpinIcon/)
  assert.match(jobsDisplayUiSource, /StatusBadgeProps/)
  assert.match(jobsDisplayUiSource, /\.\.\.statusProps/)
  assert.match(jobsDisplayUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(jobsDisplayUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(jobsSource, /from ['"]@\/shared\/ui\/JobDisplayUi['"]/)
  assert.doesNotMatch(jobsSource, /@movscript\/ui\/business\/jobs/)
  assert.equal(packageJson.exports['./business/jobs'], undefined, 'jobs display UI must not be exported from @movscript/ui')
  assert.equal(packageJson.exports['./styles/business/jobs.css'], undefined, 'jobs display CSS must not be exported from @movscript/ui')
  assert.doesNotMatch(packageBusinessBarrel, /export \* as jobs from "\.\/jobs"/)
  assert.doesNotMatch(frontendCssEntry, /@movscript\/ui\/styles\/business\/jobs\.css/)
  assert.match(jobsSemanticUiSource, /jobStatusRecipe/)
  assert.match(jobsSource, /jobStatusRecipe\(status\)/)
  assert.doesNotMatch(jobsSource, /<JobStatusBadge\b[^>]*\btone=/)
  assert.match(jobsPageUiSource, /function JobsEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(jobsPageUiSource, /function JobsActionButton[\s\S]*?<Button/)
  assert.match(jobsPageUiCss, /\.jobs-header-status\s*\{/)
  assert.match(jobsPageUiCss, /\.jobs-filter-chip-button\s*\{/)
  assert.match(jobsPageUiCss, /\.jobs-loading-state\s*\{/)
  assert.match(jobsPageUiCss, /\.jobs-action-button\s*\{/)
  assert.match(jobsPageUiCss, /\.jobs-pager-button\s*\{/)
  assert.match(jobsDisplayUiCss, /\.job-spin-icon\s*\{/)
  assert.match(jobsDisplayUiCss, /\.job-list-media-area__preview\s*\{/)
  assert.match(jobsDisplayUiCss, /\.job-list-media-area__preview > \*\s*\{[\s\S]*border-radius:\s*0/)
  assert.match(jobsDisplayUiCss, /\.job-grid-media-area\s*\{/)
  assert.match(jobsDisplayUiCss, /\.job-grid-media-area > \.job-grid-media-area__preview\s*\{/)
  assert.match(jobsPageUiCss, /\.jobs-pager\s*\{/)
  assert.match(jobsSource, /\bJobDetailKeyValue\b/)
  assert.match(jobsDisplayUiSource, /function JobDetailKeyValue[\s\S]*?<AppKeyValue/)
  assert.match(jobsSource, /JobsEmptyState/)
  assert.match(jobsSource, /\bJobDetailCodeBlock\b/)
  assert.match(jobsDisplayUiSource, /function JobDetailCodeBlock[\s\S]*?<AppCodeBlock/)
  assert.match(jobsSource, /\bJobsActionButton\b/)
  for (const jobsLayoutPackageFile of [
    'packages/ui/src/business/jobs.ts',
    'packages/ui/src/styles/business/jobs.css',
    'packages/ui/src/components/business/jobs/index.tsx',
    'packages/ui/src/components/business/jobs/styles.css',
    'packages/ui/src/components/business/jobs/status/index.tsx',
    'packages/ui/src/components/business/jobs/status/styles.css',
    'packages/ui/src/components/business/jobs/detail/index.tsx',
    'packages/ui/src/components/business/jobs/detail/styles.css',
    'packages/ui/src/components/business/jobs/card/index.tsx',
    'packages/ui/src/components/business/jobs/card/styles.css',
    'packages/ui/src/components/business/jobs/card/shell/index.tsx',
    'packages/ui/src/components/business/jobs/card/shell/styles.css',
    'packages/ui/src/components/business/jobs/card/header/index.tsx',
    'packages/ui/src/components/business/jobs/card/header/styles.css',
    'packages/ui/src/components/business/jobs/card/media/index.tsx',
    'packages/ui/src/components/business/jobs/card/media/styles.css',
    'packages/ui/src/components/business/jobs/card/state/index.tsx',
    'packages/ui/src/components/business/jobs/card/state/styles.css',
    'packages/ui/src/components/business/jobs/card/grid/index.tsx',
    'packages/ui/src/components/business/jobs/card/grid/styles.css',
    'packages/ui/src/components/business/jobs/layout/index.tsx',
    'packages/ui/src/components/business/jobs/layout/styles.css',
    'packages/ui/src/components/business/jobs/layout/shell/index.tsx',
    'packages/ui/src/components/business/jobs/layout/header/index.tsx',
    'packages/ui/src/components/business/jobs/layout/filters/index.tsx',
    'packages/ui/src/components/business/jobs/layout/collection/index.tsx',
    'packages/ui/src/components/business/jobs/layout/pager/index.tsx',
  ]) {
    assert.equal(existsSync(path.join(root, jobsLayoutPackageFile)), false, `${jobsLayoutPackageFile} must not remain in packages/ui`)
  }
  assert.match(readProjectFile('apps/frontend/src/features/jobs/components/JobsPage.tsx'), /from ['"]@\/features\/jobs\/components\/JobsPageUi['"]/)
  assert.match(readProjectFile('apps/frontend/src/features/jobs/components/JobsPageParts.tsx'), /from ['"]@\/features\/jobs\/components\/JobsPageUi['"]/)
  assert.match(readProjectFile('apps/frontend/src/features/jobs/components/JobsPageCards.tsx'), /from ['"]@\/features\/jobs\/components\/JobsPageUi['"]/)
  assert.doesNotMatch(jobsSource, /\bAppKeyValue\b/)
  assert.doesNotMatch(jobsSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(jobsSource, /\bAppStateMessage\b/)
  assert.doesNotMatch(jobsSource, /\bAppEmptyState\b/)
  assert.doesNotMatch(jobsSource, /\bAppPanel\b/)
  assert.doesNotMatch(jobsSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(jobsSource, /\bButton\b/)
  assert.doesNotMatch(jobsSource, /\bStatusBadge\b/)
  assert.doesNotMatch(jobsSource, /\bcn\(/)
  assert.doesNotMatch(jobsSource, /className=/)
  assert.doesNotMatch(jobsSource, /<(?:div|span|p)\b/)
  assert.doesNotMatch(jobsSource, /animate-spin/)
  assert.doesNotMatch(jobsSource, /\btoneTextClass\b/)
  assert.doesNotMatch(jobsSource, rawStatusPillPattern)
  assert.doesNotMatch(jobsSource, rawCardShellPattern)
  assert.doesNotMatch(jobsSource, /rounded-md border border-border bg-muted\/20/)
  assert.doesNotMatch(jobsSource, /flex flex-col h-full/)
  assert.doesNotMatch(jobsSource, /flex items-center gap-3 px-5 py-3/)
  assert.doesNotMatch(jobsSource, /relative w-full aspect-\[4\/3\] bg-muted/)
  assert.doesNotMatch(jobsSource, /className="w-full h-full rounded-none"/)
  assert.doesNotMatch(jobsSource, /className="job-grid-media-area__preview"/)
  assert.doesNotMatch(jobsSource, /<div className="job-list-media-area__preview">/)
  assert.doesNotMatch(jobsSource, /flex-1 overflow-y-auto px-5 py-5/)
  assert.doesNotMatch(jobsSource, /<pre\b/)
  assert.doesNotMatch(jobsSource, /<button\b/)
  assert.doesNotMatch(jobsSource, /function (StatusBadge|KeyValue)\b/)
  assert.doesNotMatch(primitiveBadgeSource, /label\?: ReactNode/)
  assert.doesNotMatch(primitiveBadgeSource, /icon\?: ReactNode/)
  assert.doesNotMatch(primitiveBadgeSource, /ms-semantic-status-badge__icon/)
})

test('scripts workspace surfaces use package structural primitives', () => {
  const scriptsSource = [
    readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPage.tsx'),
    readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPageParts.tsx'),
  ].join('\n')
  const scriptsSemanticUiSource = readProjectFile('apps/frontend/src/features/scripts/presentation/scriptsSemanticUi.ts')
  const scriptFormSource = readProjectFile('apps/frontend/src/features/scripts/components/ScriptForm.tsx')
  const entityCreateFormsSource = readProjectFile('apps/frontend/src/shared/ui/EntityCreateForms.tsx')
  const scriptCreateFormUiSource = readProjectFile('apps/frontend/src/shared/ui/ScriptCreateFormUi.tsx')
  const scriptCreateFormUiCss = readProjectFile('apps/frontend/src/shared/ui/ScriptCreateFormUi.css')
  const businessIndexSource = readProjectFile('packages/ui/src/components/business/index.ts')
  const scriptsPageFeatureSource = readScriptsPageFeatureSource()
  const scriptsPageFeatureCss = readScriptsPageFeatureCss()
  const scriptsPackageDir = path.join(root, 'packages/ui/src/components/business/scripts')
  const scriptsBusinessEntry = path.join(root, 'packages/ui/src/business/scripts.ts')
  const scriptsStyleEntry = path.join(root, 'packages/ui/src/styles/business/scripts.css')
  const rawPanelShellPattern = /rounded-md border border-border bg-background p-3/

  for (const exportName of ['ScriptWorkspaceShell', 'ScriptWorkspaceInspector', 'ScriptMetricBox', 'ScriptVersionHistoryPanel', 'ScriptVersionEmptyState', 'ScriptProductionPanel', 'ScriptProductionNotice', 'ScriptCollaborationStack', 'ScriptAgentAssistPanel', 'ScriptReadinessPanel', 'ScriptWorkflowPanel', 'ScriptVersionBlockShell', 'ScriptVersionLineEditor', 'ScriptBlockCard', 'ScriptBlockSelectField', 'ScriptDetailHeader', 'ScriptDetailTabs', 'ScriptVersionCard', 'StatusBadge', 'Badge']) {
    assert.match(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scripts workspace`)
  }
  for (const removedPageLevelName of ['ScriptWorkspaceLayout', 'ScriptWorkspaceMain']) {
    assert.doesNotMatch(scriptsSource, new RegExp(`\\b${removedPageLevelName}\\b`), `${removedPageLevelName} should not be required by the scripts workspace`)
    assert.doesNotMatch(scriptsPageFeatureSource, new RegExp(`export (?:function|const) ${removedPageLevelName}\\b`), `${removedPageLevelName} should not remain as a feature wrapper`)
    assert.doesNotMatch(businessIndexSource, new RegExp(`\\b${removedPageLevelName}\\b`), `${removedPageLevelName} must not be exported from packages/ui`)
  }
  for (const exportName of ['AppPanel', 'AppProgressBar', 'AppMetricCard', 'AppEmptyState', 'AppStateMessage', 'AppSurfaceItem', 'NativeSelect', 'Textarea']) {
    assert.doesNotMatch(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by scripts package components, not ScriptsPage`)
    assert.match(scriptsPageFeatureSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed inside scripts feature UI`)
  }
  for (const exportName of [
    'ScriptEditorActionButton',
    'ScriptEditorBodyGrid',
    'ScriptEditorBodyTextarea',
    'ScriptEditorFieldLabel',
    'ScriptEditorFormShell',
    'ScriptEditorHelperText',
    'ScriptEditorInput',
    'ScriptEditorMainField',
    'ScriptEditorSidePanel',
    'ScriptEditorSideRail',
    'ScriptEditorStrongText',
    'ScriptEditorSummaryTextarea',
    'ScriptEditorVersionState',
    'ScriptEditorVersionSubtitle',
    'ScriptEditorVersionTitle',
  ]) {
    assert.match(scriptFormSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ScriptForm`)
    assert.match(scriptsPageFeatureSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be exported from @movscript/ui business`)
  }
  for (const exportName of [
    'ScriptEditorErrorText',
    'ScriptEditorHiddenFileInput',
    'ScriptEditorInlineMeta',
  ]) {
    assert.match(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scripts workspace`)
    assert.match(scriptsPageFeatureSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be exported from @movscript/ui business`)
  }
  assert.doesNotMatch(businessIndexSource, /export \* as scripts from "\.\/scripts";/)
  assert.match(scriptsSource, /<ScriptEditorHiddenFileInput[\s\S]*?ref=\{fileInputRef\}[\s\S]*?type="file"/)
  assert.match(scriptFormSource, /<ScriptEditorSidePanel variant="muted">[\s\S]*?保存为版本/)
  assert.doesNotMatch(scriptFormSource, /\b(?:AppSurfaceItem|Button|Input|Label|Textarea|toneTextClass)\b/)
  assert.doesNotMatch(scriptFormSource, /className=|<(?:aside|div|label|p|span|strong)\b/)
  assert.match(entityCreateFormsSource, /\bScriptCreateFormShell\b/)
  assert.doesNotMatch(entityCreateFormsSource, /className="space-y-4"/)
  assert.doesNotMatch(entityCreateFormsSource, /className="flex gap-2 pt-1"/)
  assert.doesNotMatch(entityCreateFormsSource, /<Label\b/)
  assert.doesNotMatch(entityCreateFormsSource, /<Input\b/)
  assert.doesNotMatch(entityCreateFormsSource, /<Textarea\b/)
  assert.doesNotMatch(entityCreateFormsSource, /<Button\b/)
  assert.match(entityCreateFormsSource, /from '@\/shared\/ui\/ScriptCreateFormUi'/)
  assert.match(scriptCreateFormUiSource, /export function ScriptCreateFormShell/)
  assert.match(scriptCreateFormUiSource, /\bLabel\b/)
  assert.match(scriptCreateFormUiSource, /\bInput\b/)
  assert.match(scriptCreateFormUiSource, /\bTextarea\b/)
  assert.match(scriptCreateFormUiSource, /\bButton\b/)
  assert.match(scriptCreateFormUiCss, /\.script-create-form\s*\{/)
  assert.equal(existsSync(scriptsPackageDir), false, 'scripts UI must not remain in packages/ui')
  assert.equal(existsSync(scriptsBusinessEntry), false, 'scripts business entry must not remain in @movscript/ui')
  assert.equal(existsSync(scriptsStyleEntry), false, 'scripts CSS entry must not remain in @movscript/ui')
  for (const scriptsLibraryPackageFile of [
    'packages/ui/src/components/business/scripts/library/index.tsx',
    'packages/ui/src/components/business/scripts/library/styles.css',
    'packages/ui/src/components/business/scripts/library/rail/index.tsx',
    'packages/ui/src/components/business/scripts/library/empty-state/index.tsx',
    'packages/ui/src/components/business/scripts/library/group/index.tsx',
    'packages/ui/src/components/business/scripts/library/item/index.tsx',
  ]) {
    assert.equal(existsSync(path.join(root, scriptsLibraryPackageFile)), false, `${scriptsLibraryPackageFile} must not remain in packages/ui`)
  }
  assert.match(scriptsPageFeatureSource, /import "\.\/ScriptsPageUi\.css"/)
  assert.match(scriptsPageFeatureSource, /export function ScriptDetailHeader/)
  assert.match(scriptsPageFeatureSource, /export function ScriptDetailTabs/)
  assert.match(scriptsPageFeatureSource, /export function ScriptVersionCard/)
  assert.match(scriptsPageFeatureCss, /\.script-detail-header\s*\{/)
  assert.match(scriptsPageFeatureCss, /\.script-detail-tabs\s*\{/)
  assert.match(scriptsPageFeatureCss, /\.script-version-card\s*\{/)
  for (const componentName of ['ScriptWorkspaceShell', 'ScriptVersionHistoryPanel', 'ScriptProductionPanel', 'ScriptReadinessPanel', 'ScriptVersionLineEditor', 'ScriptBlockCard', 'ScriptBlockSelectField']) {
    assert.match(scriptsPageFeatureSource, new RegExp(`export function ${componentName}\\b`), `${componentName} must be feature-owned`)
    assert.doesNotMatch(businessIndexSource, new RegExp(`\\b${componentName}\\b`), `${componentName} must not be exported from @movscript/ui business`)
  }
  for (const selector of [
    'script-editor-form',
    'script-editor-form__action-button',
    'script-editor-form__body-grid',
    'script-editor-form__body-textarea',
    'script-editor-form__error-text',
    'script-editor-form__file-input',
    'script-editor-form__helper-text',
    'script-editor-form__side-panel',
    'script-editor-form__toolbar',
    'script-workspace-empty-selection',
    'script-version-history-panel',
    'script-production-panel',
    'script-readiness-panel__rows',
    'script-version-line-editor',
    'script-block-card',
    'script-block-select-field',
  ]) {
    assert.match(scriptsPageFeatureCss, new RegExp(`\\.${selector}\\b`), `${selector} styles must be feature-owned`)
  }

  assert.match(scriptsPageFeatureSource, /function ScriptMetricBox[\s\S]*?AppMetricCard/)
  assert.match(scriptsSource, /function VersionStatusBadge[\s\S]*?StatusBadge/)
  assert.match(scriptsSource, /function ScriptStageBadge[\s\S]*?StatusBadge/)
  assert.match(scriptsSource, /function ScriptTypeBadge[\s\S]*?Badge/)
  for (const recipeName of [
    'scriptReadinessRecipe',
    'scriptVersionStatusRecipe',
    'scriptStageRecipe',
    'scriptReadinessItemRecipe',
  ]) {
    assert.match(scriptsSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be script semantic UI-owned`)
    assert.match(scriptsSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by scripts workspace`)
  }
  assert.doesNotMatch(scriptsPageFeatureSource, /\bstatusTone\b/)
  assert.doesNotMatch(scriptsPageFeatureSource, /<StatusDot\b[^>]*\btone=/)
  assert.doesNotMatch(scriptsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(scriptsSource, /\bstatusTone=/)
  assert.doesNotMatch(scriptsSource, /\bSemanticTone\b/)
  assert.doesNotMatch(scriptsSource, /semanticToneClass/)
  assert.doesNotMatch(scriptsSource, /<button\b/)
  assert.doesNotMatch(scriptsSource, /<select\b/)
  assert.doesNotMatch(scriptsSource, rawPanelShellPattern)
  assert.doesNotMatch(scriptsSource, /rounded-lg border border-dashed border-border bg-card/)
  assert.doesNotMatch(scriptsSource, /rounded-md border border-border bg-card/)
  assert.doesNotMatch(scriptsSource, /rounded-lg border border-border bg-muted\/40 p-3/)
  assert.doesNotMatch(scriptsSource, /flex items-center gap-2 rounded-md border px-2\.5 py-2/)
  assert.doesNotMatch(scriptsSource, /shrink-0 border-b border-border bg-background px-5 py-4/)
  assert.doesNotMatch(scriptsSource, /flex shrink-0 items-center gap-0 border-b border-border bg-background px-4/)
  assert.doesNotMatch(scriptsSource, /h-auto rounded-none border-b-2 px-4 py-2\.5 type-body/)
  assert.doesNotMatch(scriptsSource, /script-workbench-rail min-h-0 border-r border-border/)
  assert.doesNotMatch(scriptsSource, /flex h-12 items-center justify-between border-b border-border px-3/)
  assert.doesNotMatch(scriptsSource, /h-auto w-full justify-start whitespace-normal border px-2\.5 py-2\.5/)
  assert.doesNotMatch(scriptsSource, /overflow-hidden rounded-lg border transition-colors/)
  assert.doesNotMatch(scriptsSource, /border-border bg-card/)
  assert.doesNotMatch(scriptsSource, /h-1\.5 overflow-hidden rounded-full bg-muted/)
  assert.doesNotMatch(scriptsSource, /flex items-center gap-3 px-4 py-3/)
  assert.doesNotMatch(scriptFormSource, /<input\b/)
  assert.doesNotMatch(scriptFormSource, /text-destructive/)
  assert.doesNotMatch(scriptFormSource, /rounded-lg border border-border bg-muted\/40 p-3/)
  assert.match(scriptsSource, /<ScriptDetailHeader[\s\S]*?badges=\{\([\s\S]*?<ScriptTypeBadge[\s\S]*?actions=\{\(/)
  assert.match(scriptsSource, /<ScriptDetailTabs[\s\S]*?activeKey=\{detailTab\}[\s\S]*?onSelect=\{\(key\) => setDetailTab\(key as ScriptDetailTab\)\}/)
  assert.match(scriptsSource, /<ScriptVersionCard[\s\S]*?versionLabel=\{`v\$\{version\.version_number \|\| version\.ID\}`\}[\s\S]*?toggleLabel=/)
  assert.match(scriptsSource, /latestVersion[\s\S]*?<ScriptProductionNotice title="将使用最新版本"/)
  assert.match(scriptsSource, /<ScriptWorkflowStep index="01" title="完善正文"/)
  assert.match(scriptsPageFeatureSource, /function ScriptProductionNotice[\s\S]*?<AppStateMessage tone="neutral"/)
  assert.match(scriptsPageFeatureSource, /function ScriptWorkflowStep[\s\S]*?<AppSurfaceItem[\s\S]*variant="muted"/)
  assert.doesNotMatch(scriptFormSource, /rounded-lg border border-border bg-card/)
})

test('relations feature and package UI are removed from the canonical workbench system', () => {
  for (const relativePath of [
    'apps/frontend/src/features/relations',
    'apps/frontend/src/pages/reference-relations',
    'apps/frontend/src/shared/infrastructure/api/referenceRelations.ts',
    'apps/frontend/src/features/resources/infrastructure/referenceRelations.ts',
    'packages/ui/src/components/business/relations',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, relativePath + ' must not remain')
  }

  const appSource = readProjectFile('apps/frontend/src/App.tsx')
  const routeSource = readProjectFile('apps/frontend/src/routes/projectRoutes.ts')
  assert.doesNotMatch(appSource + '\n' + routeSource, /ReferenceRelations|referenceRelations|reference-relations|workbenchReferenceRelations/)
})

test('admin shared error surfaces use package inline error component', () => {
  const adminErrorSurfaceSources = [
    'apps/admin/src/pages/admin/AdminPage.tsx',
    'apps/admin/src/pages/admin/AuditLogsPage.tsx',
    'apps/admin/src/pages/admin/DebugPage.tsx',
    'apps/admin/src/pages/admin/OrgManagementPage.tsx',
    'apps/admin/src/pages/admin/SystemSettingsPage.tsx',
    'apps/admin/src/pages/admin/UsageLogsPage.tsx',
    'apps/admin/src/pages/admin/UserManagementPage.tsx',
  ].map((relativePath) => [relativePath, readProjectFile(relativePath)])

  for (const [relativePath, source] of adminErrorSurfaceSources) {
    assert.match(source, /\bAppInlineError\b/, `${relativePath} must use package inline error surfaces`)
    assert.doesNotMatch(
      source,
      /rounded-(?:md|lg) border border-destructive\/30 bg-destructive\/10 px-3 py-2 text-xs text-destructive/,
      `${relativePath} must not hand-roll destructive error banners`,
    )
    assert.doesNotMatch(
      source,
      /rounded-(?:md|lg) border border-destructive\/30 bg-destructive\/5 px-3 py-2 text-xs text-destructive/,
      `${relativePath} must not hand-roll low-emphasis destructive error banners`,
    )
    assert.doesNotMatch(
      source,
      /flex items-start gap-2 rounded-lg border border-destructive\/30 bg-destructive\/10 px-3 py-2 text-xs text-destructive/,
      `${relativePath} must not hand-roll icon destructive error banners`,
    )
  }
})

test('admin status pills use package StatusBadge semantics', () => {
  const adminPageSource = readProjectFile('apps/admin/src/pages/admin/AdminPage.tsx')
  const debugPageSource = readProjectFile('apps/admin/src/pages/admin/DebugPage.tsx')
  const orgManagementSource = readProjectFile('apps/admin/src/pages/admin/OrgManagementPage.tsx')
  const userManagementSource = readProjectFile('apps/admin/src/pages/admin/UserManagementPage.tsx')

  assert.match(userManagementSource, /<StatusBadge intent=\{active \? 'info' : 'neutral'\} className="text-\[10px\]">/, 'user session state must use package status badge intent')
  assert.doesNotMatch(
    userManagementSource,
    /active \? 'bg-primary\/10 text-primary' : 'bg-muted text-muted-foreground'/,
    'user session state must not hand-roll active/inactive pill colors',
  )

  assert.match(
    orgManagementSource,
    /<StatusBadge[\s\S]*?intent=\{status === 'active' \? 'info' : status === 'expired' \? 'warning' : 'neutral'\}[\s\S]*?className="text-\[10px\]"/,
    'organization invitation state must use package status badge intent',
  )
  assert.match(orgManagementSource, /\bAppFeedbackText\b/, 'organization management errors must use package feedback text')
  assert.match(orgManagementSource, /<AppStateMessage tone="warning"[\s\S]*?admin\.orgs\.suspendedInvitationHint/, 'organization suspended warning must use package state message')
  assert.match(orgManagementSource, /removeMember\.mutate[\s\S]*?<Trash2 size=\{13\}/, 'organization member removal action must remain explicit')
  assert.match(orgManagementSource, /revokeInvitation\.mutate[\s\S]*?<Trash2 size=\{13\}/, 'organization invitation revoke action must remain explicit')
  assert.doesNotMatch(
    orgManagementSource,
    /status === 'active' \? 'bg-primary\/10 text-primary' : status === 'expired' \? 'bg-warning\/10 text-warning' : 'bg-muted text-muted-foreground'/,
    'organization invitation state must not hand-roll status pill colors',
  )
  assert.doesNotMatch(orgManagementSource, /className="px-4 py-3 text-xs text-destructive"/, 'organization inline errors must not hand-roll destructive text')
  assert.doesNotMatch(orgManagementSource, /hover:text-destructive/, 'organization destructive actions must use Button intent')
  assert.doesNotMatch(orgManagementSource, /bg-warning\/10 px-4 py-2 text-xs text-warning/, 'organization warning banners must use package state message')

  assert.match(adminPageSource, /<StatusBadge \{\.\.\.state\.statusProps\} className="text-\[11px\]">/, 'runtime health state must render with package status badge')
  assert.match(adminPageSource, /runtimeHealthState[\s\S]*?statusProps: Pick<StatusBadgeProps, 'intent' \| 'emphasis'>/, 'runtime health state must return status badge semantics')
  assert.doesNotMatch(adminPageSource, /runtimeHealthState[\s\S]*?className:/, 'runtime health state must not return visual class names')
  assert.match(adminPageSource, /CAPABILITY_STATUS_INTENT: Record<string, StatusBadgeProps\['intent'\]>/, 'admin capability badges must map to status badge semantics')
  assert.match(adminPageSource, /caps\.map\(\(cap\) => \([\s\S]*?<StatusBadge[\s\S]*?intent=\{CAPABILITY_STATUS_INTENT\[cap\] \?\? 'neutral'\}[\s\S]*?className="text-xs"/, 'admin capability badges must render through package status badge')
  assert.match(adminPageSource, /<StatusBadge intent="info">\{t\('admin\.storage\.default'\)\}<\/StatusBadge>/, 'storage default badge must use package status badge')
  assert.match(adminPageSource, /<StatusBadge intent="success" emphasis="plain">\{t\('admin\.storage\.available'\)\}<\/StatusBadge>/, 'storage available badge must use package status badge')
  assert.doesNotMatch(
    adminPageSource,
    /border-(?:destructive|warning|success)\/30 bg-(?:destructive|warning|success)\/10 text-(?:destructive|warning|success)/,
    'runtime health state must not hand-roll status pill colors',
  )
  assert.doesNotMatch(adminPageSource, /\bCAPABILITY_COLOR\b/, 'admin capability badges must not use page-owned visual class maps')
  assert.doesNotMatch(adminPageSource, /reasoning: 'bg-warning\/10 text-warning'/, 'admin capability reasoning badge must not hardcode warning classes')
  assert.doesNotMatch(adminPageSource, /text-xs bg-primary\/10 text-primary px-2 py-0\.5 rounded-full/, 'storage default badge must not hand-roll primary pill classes')

  assert.match(debugPageSource, /STATUS_INTENT: Record<string, StatusBadgeProps\['intent'\]>/, 'debug job states must map to status badge semantics')
  assert.match(debugPageSource, /function debugHttpStatusIntent\(status: number\): StatusBadgeProps\['intent'\]/, 'debug HTTP status must map to status badge semantics')
  assert.match(debugPageSource, /<StatusBadge intent=\{item\.status === 'error' \? 'danger' : 'success'\}>/, 'debug LLM call status must use package status badge')
  assert.match(debugPageSource, /<StatusBadge intent=\{STATUS_INTENT\[job\.status\] \?\? 'neutral'\} className="text-xs">/, 'debug job row status must use package status badge')
  assert.match(debugPageSource, /<StatusBadge intent=\{debugHttpStatusIntent\(responseStatus\)\}>/, 'debug prompt HTTP status must use package status badge')
  assert.match(debugPageSource, /<StatusBadge intent=\{state\.result\.success \? 'success' : 'danger'\} className="text-xs">/, 'debug connectivity result status must use package status badge')
  assert.match(debugPageSource, /<StatusBadge intent=\{result\.success \? 'success' : 'danger'\} className="text-xs">/, 'debug raw call result status must use package status badge')
  assert.match(debugPageSource, /\bAppFeedbackText\b/, 'debug inline feedback must use package semantic feedback text')
  assert.match(debugPageSource, /\bAppStatusSurface\b/, 'debug status containers must use package semantic status surfaces')
  assert.match(debugPageSource, /\bAppCodeBlock\b/, 'debug response payloads must use package code block primitive')
  assert.doesNotMatch(debugPageSource, /\bSTATUS_COLOR\b/, 'debug statuses must not use page-owned visual class maps')
  assert.doesNotMatch(
    debugPageSource,
    /bg-(?:success|destructive|warning)\/10 text-(?:success|destructive|warning)/,
    'debug status pills must not hand-roll success/warning/danger colors',
  )
  assert.doesNotMatch(
    debugPageSource,
    /\b(?:text|bg|border)-(?:destructive|warning|success)(?:\b|\/)/,
    'debug page must not own danger/warning/success utility classes',
  )
  assert.doesNotMatch(debugPageSource, /<Check size=\{11\} className="text-success" \/>/, 'debug copied feedback must use package semantic feedback text')
  assert.doesNotMatch(debugPageSource, /<div className="mt-1 max-w-\[220px\] truncate text-destructive">/, 'debug LLM call errors must use package semantic feedback text')
  assert.doesNotMatch(debugPageSource, /<p className="text-xs text-destructive mt-0\.5 truncate">/, 'debug job row errors must use package semantic feedback text')
  assert.doesNotMatch(debugPageSource, /<span className="text-xs text-destructive truncate">/, 'debug connectivity errors must use package semantic feedback text')
  assert.doesNotMatch(debugPageSource, /className="text-xs text-warning flex items-center gap-0\.5"/, 'debug labels must use package semantic feedback text')
  assert.doesNotMatch(debugPageSource, /hover:text-destructive/, 'debug destructive actions must use Button intent')
})

test('admin form feedback uses package semantic text components', () => {
  const adminPageSource = readProjectFile('apps/admin/src/pages/admin/AdminPage.tsx')
  const adminMainSource = readProjectFile('apps/admin/src/main.tsx')
  const uiAppSource = readAppSource()
  const appDataTableSource = readProjectFile('packages/ui/src/components/business/app/data-display/table/index.tsx')
  const appDataTableCss = readProjectFile('packages/ui/src/components/business/app/data-display/table/styles.css')

  assert.match(uiAppSource, /function AppFeedbackText[\s\S]*?toneTextClass\(tone\)/, 'app feedback text must own semantic tone text mapping')
  assert.match(uiAppSource, /function AppRequiredMark[\s\S]*?toneTextClass\("danger"\)/, 'app required mark must own required danger text mapping')
  assert.match(uiAppSource, /function AppStatusSurface[\s\S]*?<Surface[\s\S]*?tone=\{tone\}[\s\S]*?emphasis=\{appStatusSurfaceEmphasis\(emphasis\)\}/, 'app status surface must own status container tone mapping through Surface')
  assert.match(uiAppSource, /function AppStatusToggleButton[\s\S]*?data-selected=\{selected \? "true" : "false"\}/, 'app status toggle must own selected status tone mapping')
  assert.match(appDataTableSource, /tone\?: SemanticTone/, 'app data table row must expose semantic row tone')
  assert.match(appDataTableCss, /\.app-data-table__row\[data-tone="danger"\]/, 'app data table row must own semantic danger row styling')
  assert.match(adminPageSource, /\bAppFeedbackText\b/, 'admin page field feedback must use package feedback text')
  assert.match(adminPageSource, /\bAppRequiredMark\b/, 'admin page required marks must use package required mark')
  assert.match(adminPageSource, /\bAppStateMessage\b/, 'admin page result surfaces must use package state message')
  assert.match(adminPageSource, /\bAppStatusSurface\b/, 'admin page status containers must use package status surfaces')
  assert.match(adminPageSource, /\bAppStatusToggleButton\b/, 'admin page clickable status pills must use package status toggles')
  assert.match(adminPageSource, /\bAppDataTableRow\b/, 'admin exceptional table rows must use package data table row tones')
  assert.match(adminPageSource, /\bAppMarkerDot\b/, 'admin page semantic markers must use package marker dots')
  assert.match(adminPageSource, /invalid=\{!isValidInputLimit\(addMaxInputImages\)\}/, 'admin invalid inputs must use primitive invalid API')
  assert.match(adminPageSource, /invalid=\{!isValidInputLimit\(editForm\.max_input_videos\)\}/, 'admin invalid inputs must use primitive invalid API')
  assert.match(adminMainSource, /\bAppFeedbackText\b/, 'admin login feedback must use package feedback text')

  assert.doesNotMatch(adminPageSource, /<span className="(?:ml-0\.5 )?text-destructive(?: ml-0\.5)?">\*<\/span>/, 'admin required marks must not hand-roll destructive text')
  assert.doesNotMatch(adminPageSource, /<p className="text-xs text-destructive">\{translateApiError/, 'admin field API errors must not hand-roll destructive text')
  assert.doesNotMatch(adminMainSource, /<p className="text-xs text-destructive">\{error\}<\/p>/, 'admin login errors must not hand-roll destructive text')
  assert.doesNotMatch(adminPageSource, /className="text-destructive hover:text-destructive"/, 'admin destructive actions must use Button intent')
  assert.doesNotMatch(adminPageSource, /<div className="px-4 py-3 text-xs text-destructive">/, 'admin runtime errors must use semantic feedback text')
  assert.doesNotMatch(adminPageSource, /<td colSpan=\{4\} className="px-4 py-3 text-xs text-destructive">/, 'admin table errors must use semantic feedback text')
  assert.doesNotMatch(adminPageSource, /testResult\.success \? 'bg-success\/5 text-success' : 'bg-destructive\/5 text-destructive'/, 'admin test result surfaces must use semantic state messages')
  assert.doesNotMatch(adminPageSource, /<span className="text(?:-xs)? text-success">/, 'admin success text must use semantic feedback text or status badges')
  assert.doesNotMatch(adminPageSource, /border-destructive\/60 bg-destructive\/10 text-destructive/, 'admin selected status pills must use package status toggles')
  assert.doesNotMatch(adminPageSource, /border-success\/40 bg-success\/10 text-success/, 'admin enabled status pills must use package status toggles')
  assert.doesNotMatch(adminPageSource, /border-destructive\/40 bg-destructive\/5 text-destructive/, 'admin status containers must use package status surfaces')
  assert.doesNotMatch(adminPageSource, /project\.owner_id === 0 && 'bg-destructive\/5'/, 'admin exceptional table rows must use package row tone')
  assert.doesNotMatch(adminPageSource, /project\.owner_id === 0 \? 'text-destructive font-medium' : 'text-muted-foreground'/, 'admin exceptional table cells must use semantic feedback text')
  assert.doesNotMatch(adminPageSource, /invalid \? 'border-destructive\/40' : 'border-border'/, 'admin invalid cards must use package status surfaces')
  assert.doesNotMatch(adminPageSource, /bg-warning/, 'admin warning markers must use package marker dots')
  assert.doesNotMatch(adminPageSource, /border-destructive/, 'admin invalid form fields must use invalid API')
  assert.doesNotMatch(adminPageSource, /testRes\.success \? 'text-foreground' : 'text-destructive'/, 'admin credential test feedback must use semantic feedback text')
  assert.doesNotMatch(adminPageSource, /modelTestRes\.success \? 'text-foreground' : 'text-destructive'/, 'admin model test feedback must use semantic feedback text')
  assert.doesNotMatch(adminPageSource, /testResult\.success \? 'text-success' : 'text-destructive'/, 'admin generation server test feedback must use semantic feedback text')
})

test('app icon frames expose semantic tone instead of page-owned color classes', () => {
  const appRouteBoundariesSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppRouteBoundaries.tsx')
  const backendBootBoundarySource = readProjectFile('apps/frontend/src/features/app-shell/application/BackendBootBoundary.tsx')
  const appIconFrameSource = readProjectFile('packages/ui/src/components/business/app/display/icon/index.tsx')
  const appIconFrameCss = readProjectFile('packages/ui/src/components/business/app/display/icon/styles.css')
  const adminHeaderSources = [
    'apps/admin/src/pages/admin/AuditLogsPage.tsx',
    'apps/admin/src/pages/admin/AdminPage.tsx',
    'apps/admin/src/pages/admin/OrgManagementPage.tsx',
    'apps/admin/src/pages/admin/SystemSettingsPage.tsx',
    'apps/admin/src/pages/admin/UsageLogsPage.tsx',
    'apps/admin/src/pages/admin/UserManagementPage.tsx',
  ].map((relativePath) => [relativePath, readProjectFile(relativePath)])

  assert.match(appIconFrameSource, /\btone\?: SemanticTone\b/, 'AppIconFrame must expose semantic tone API')
  assert.match(appIconFrameSource, /data-tone=\{tone\}/, 'AppIconFrame must own tone data attribute')
  for (const tone of ['info', 'success', 'warning', 'danger', 'neutral']) {
    assert.match(appIconFrameCss, new RegExp(`\\.app-icon-frame\\[data-tone="${tone}"\\]`), `${tone} AppIconFrame tone must be package-styled`)
  }

  assert.doesNotMatch(`${appRouteBoundariesSource}\n${backendBootBoundarySource}`, /\btoneTextClass\b/, 'App shell must not reach into package tone helpers')
  assert.match(appRouteBoundariesSource, /<AppErrorFallback[\s\S]*?icon=\{<AlertTriangle size=\{20\} \/>\}/, 'Error boundary must use package-owned semantic icon shell')
  assert.match(backendBootBoundarySource, /<AppBackendBootOverlayFrame[\s\S]*?tone=\{isError \? 'danger' : 'info'\}/, 'Backend boot overlay must use semantic icon tone through package shell')

  for (const [relativePath, source] of adminHeaderSources) {
    assert.match(source, /\bAppIconFrame\b/, `${relativePath} must use package icon frame`)
    assert.match(source, /<AppIconFrame tone="info" className="mt-0\.5">/, `${relativePath} page header icon must use semantic icon tone`)
    assert.doesNotMatch(
      source,
      /flex h-8 w-8 items-center justify-center rounded-md bg-primary\/10 text-primary/,
      `${relativePath} must not hand-roll page header icon colors`,
    )
  }
  const adminPageSource = readProjectFile('apps/admin/src/pages/admin/AdminPage.tsx')
  assert.match(adminPageSource, /<AppIconFrame size="lg" tone="info">[\s\S]*?<card\.icon size=\{18\}/, 'admin overview card icons must use semantic icon tone')
  assert.doesNotMatch(adminPageSource, /flex h-9 w-9 items-center justify-center rounded-md bg-primary\/10 text-primary/, 'admin overview card icons must not hand-roll primary icon colors')
})

test('feature semantic status recipes share the package recipe contract', () => {
  const uiStyleSystemSource = readProjectFile('packages/ui/src/style-system.ts')
  const sharedSemanticRecipeSource = readProjectFile('apps/frontend/src/shared/presentation/semanticRecipe.ts')
  const semanticRecipeFiles = walkFiles('apps/frontend/src/features', (relativePath) => /\/presentation\/.*SemanticUi\.ts$/.test(relativePath))

  assert.ok(semanticRecipeFiles.length >= 11, 'feature semantic recipe files must be covered by this boundary')
  assert.match(uiStyleSystemSource, /export type UiSemanticRecipe/)
  assert.match(uiStyleSystemSource, /export type UiStatusRecipe = UiSemanticRecipe<Extract<UiSemanticEmphasis, "soft">>/)
  assert.match(uiStyleSystemSource, /export type UiStatusRecipeIntentMap = Record<string, UiSemanticIntent>/)
  assert.match(uiStyleSystemSource, /export type UiStatusRecipeGroup/)
  assert.match(uiStyleSystemSource, /export function defineStatusRecipeGroup/)
  assert.doesNotMatch(uiStyleSystemSource, /\buiSemanticSystem\b/)
  assert.match(uiStyleSystemSource, /\bexport\s+default\s+defineStatusRecipeGroup\b/)
  assert.match(sharedSemanticRecipeSource, /import \* as styleSystemRuntime from '@movscript\/ui\/style-system'/)
  assert.match(sharedSemanticRecipeSource, /from '@movscript\/ui\/style-system'/)
  assert.doesNotMatch(sharedSemanticRecipeSource, /from '@movscript\/ui'/)
  assert.doesNotMatch(sharedSemanticRecipeSource, /from '@movscript\/ui'\n/)
  assert.doesNotMatch(sharedSemanticRecipeSource, /\buiSemanticSystem\b/)

  for (const relativePath of semanticRecipeFiles) {
    const source = readProjectFile(relativePath)
    assert.match(source, /import \{ defineFeatureStatusRecipeGroup, type UiStatusRecipe \} from '@\/shared\/presentation\/semanticRecipe'/, `${relativePath} must import the shared package recipe group contract`)
    assert.match(source, /export type \w+StatusRecipe = UiStatusRecipe/, `${relativePath} must alias the package status recipe type`)
    assert.match(source, /defineFeatureStatusRecipeGroup\('[^']+', \{[\s\S]*?default: '[^']+'/, `${relativePath} must declare finite status intent groups`)
    assert.doesNotMatch(source, /\buiStyleSystem\b/, `${relativePath} must not use a legacy default aggregate`)
    assert.doesNotMatch(source, /\buiSemanticSystem\b/, `${relativePath} must not use a legacy default aggregate`)
    assert.doesNotMatch(source, /\buiStatusRecipe\b/, `${relativePath} must not use one-off recipe constructors`)
    assert.doesNotMatch(source, /interface \w+StatusRecipe/, `${relativePath} must not redefine status recipe shape`)
    assert.doesNotMatch(source, /\bUiSemantic(?:Intent|Emphasis)\b/, `${relativePath} must not rebuild recipe axes locally`)
    assert.doesNotMatch(source, /return \{ intent, emphasis: 'soft' \}/, `${relativePath} must not hand-roll status recipe objects`)
  }
})

test('app source files do not hardcode palette utility color tokens', () => {
  const frontendSources = walkFiles('apps/frontend/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .map((relativePath) => readProjectFile(relativePath))
    .join('\n')
  const adminSources = walkFiles('apps/admin/src', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
    .map((relativePath) => readProjectFile(relativePath))
    .join('\n')
  const semanticEntitySource = readProjectFile('apps/frontend/src/shared/infrastructure/api/semanticEntities.ts')
  const semanticEntityTypeSource = readProjectFile('apps/frontend/src/shared/infrastructure/api/semanticEntityTypes.ts')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow|fill|stroke|dark:bg|dark:text|dark:border)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate|neutral|pink)-\d/

  assert.doesNotMatch(frontendSources, rawPaletteClassPattern)
  assert.doesNotMatch(adminSources, rawPaletteClassPattern)
  assert.doesNotMatch(frontendSources, /\b(?:bg|text|border|ring|fill|stroke|hover:text)-(?:destructive|success|warning)(?:\b|\/)/, 'frontend source must use package semantic status contracts instead of status color utilities')
  assert.doesNotMatch(adminSources, /\b(?:bg|text|border|ring|fill|stroke|hover:text)-(?:destructive|success|warning)(?:\b|\/)/, 'admin source must use package semantic status contracts instead of status color utilities')
  assert.doesNotMatch(frontendSources, /ms-semantic-(?:icon|badge|surface|dot)--/)
  assert.doesNotMatch(semanticEntitySource, /@movscript\/ui/)
  assert.doesNotMatch(semanticEntitySource, /accentTextClass/)
  assert.match(semanticEntityTypeSource, /type SemanticEntityAccent/)
  assert.doesNotMatch(semanticEntitySource, /accentToneClass/)
})
