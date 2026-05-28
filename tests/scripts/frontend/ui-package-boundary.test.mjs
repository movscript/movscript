import assert from 'node:assert/strict'
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
  if (relativePath.startsWith('apps/frontend/src/components/proposals/')) {
    const fileName = path.basename(relativePath)
    if (fileName.startsWith('ProjectStandards')) {
      return readFileSync(path.join(root, `apps/frontend/src/features/project-standards/components/proposals/${fileName}`), 'utf8')
    }
    if (fileName.startsWith('ProjectLayer')) {
      return readFileSync(path.join(root, 'apps/frontend/src/features/pre-production/components/proposals/PreProductionProposalReviewPanel.tsx'), 'utf8')
    }
    const featureArea = fileName.startsWith('Project') ? 'project' : 'production'
    return readFileSync(path.join(root, `apps/frontend/src/features/${featureArea}/components/proposals/${fileName}`), 'utf8')
  }
  if (relativePath === 'apps/frontend/src/features/project/domain/projectLayerProposalReview.ts') {
    return readFileSync(path.join(root, 'apps/frontend/src/features/pre-production/domain/preProductionProposalReview.ts'), 'utf8')
  }
  if (relativePath.startsWith('apps/frontend/src/features/production/components/Delivery')) {
    return readFileSync(path.join(root, relativePath.replace(
      'apps/frontend/src/features/production/components/',
      'apps/frontend/src/features/delivery/components/',
    )), 'utf8')
  }
  if (relativePath.startsWith('apps/frontend/src/components/workbench/')) {
    const fileName = path.basename(relativePath)
    const featureArea = fileName.startsWith('Content')
      ? 'content'
      : fileName.startsWith('PreProduction')
        ? 'pre-production'
        : fileName.startsWith('Delivery')
          ? 'delivery'
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

function readAgentCss() {
  return [
    'packages/ui/src/components/business/agent/styles.css',
    'packages/ui/src/components/business/agent/panel/styles.css',
    'packages/ui/src/components/business/agent/panel/frame/styles.css',
    'packages/ui/src/components/business/agent/panel/card/styles.css',
    'packages/ui/src/components/business/agent/panel/composer-mention/styles.css',
    'packages/ui/src/components/business/agent/panel/shell-layout/styles.css',
    'packages/ui/src/components/business/agent/panel/thread-message/styles.css',
    'packages/ui/src/components/business/agent/panel/context/styles.css',
    'packages/ui/src/components/business/agent/panel/embedded-runtime/styles.css',
    'packages/ui/src/components/business/agent/page/styles.css',
    'packages/ui/src/components/business/agent/shell/styles.css',
    'packages/ui/src/components/business/agent/shell/layout/styles.css',
    'packages/ui/src/components/business/agent/shell/sidebar/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/foundation/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/tool/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/inline/styles.css',
    'packages/ui/src/components/business/agent/shell/attachment/styles.css',
    'packages/ui/src/components/business/agent/shell/chat-message/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/code/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/feedback/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/card/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/badge/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/thumbnail/styles.css',
    'packages/ui/src/components/business/agent/shell/runtime-code/styles.css',
    'packages/ui/src/components/business/agent/generated/styles.css',
    'packages/ui/src/components/business/agent/generated/media-preview/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/shell/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/header/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/item/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/notice/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/shell/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/resource/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/target/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/status/styles.css',
    'packages/ui/src/components/business/agent/generated/viewer/styles.css',
    'packages/ui/src/components/business/agent/chat/styles.css',
    'packages/ui/src/components/business/agent/console/styles.css',
    'packages/ui/src/components/business/agent/console-nav/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/panel/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/item/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/menu/styles.css',
    'packages/ui/src/components/business/agent/chat/history/styles.css',
    'packages/ui/src/components/business/agent/chat/toolbar/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/feed/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/menu/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/round/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/line/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/frame/styles.css',
    'packages/ui/src/components/business/agent/activity-feed/code/styles.css',
    'packages/ui/src/components/business/agent/debug/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/card/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/summary/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/entry/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/code/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/badge/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/tool/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/warnings/styles.css',
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
    'packages/ui/src/components/business/agent/run-activity/notice/styles.css',
    'packages/ui/src/components/business/agent/run-activity/bubble/styles.css',
    'packages/ui/src/components/business/agent/thread/styles.css',
    'packages/ui/src/components/business/agent/thread/foundation/styles.css',
    'packages/ui/src/components/business/agent/thread/empty/styles.css',
    'packages/ui/src/components/business/agent/thread/message/styles.css',
    'packages/ui/src/components/business/agent/thread/tool/styles.css',
    'packages/ui/src/components/business/agent/thread/suggestion/styles.css',
    'packages/ui/src/components/business/agent/context/styles.css',
    'packages/ui/src/components/business/agent/run/styles.css',
    'packages/ui/src/components/business/agent/run/foundation/styles.css',
    'packages/ui/src/components/business/agent/run/card/styles.css',
    'packages/ui/src/components/business/agent/run/data-block/styles.css',
    'packages/ui/src/components/business/agent/run/list/styles.css',
    'packages/ui/src/components/business/agent/run/field/styles.css',
    'packages/ui/src/components/business/agent/run/tool-step/styles.css',
    'packages/ui/src/components/business/agent/work/index.tsx',
    'packages/ui/src/components/business/agent/work/styles.css',
    'packages/ui/src/components/business/agent/composer/index.tsx',
    'packages/ui/src/components/business/agent/composer/styles.css',
    'packages/ui/src/components/business/agent/settings/styles.css',
    'packages/ui/src/components/business/agent/performance/styles.css',
    'packages/ui/src/components/business/agent/pinned-status/styles.css',
    'packages/ui/src/components/business/agent/browser/styles.css',
    'packages/ui/src/components/business/agent/responsive/styles.css',
  ].map(readProjectFile).join('\n')
}

function readAgentChatSource() {
  return [
    'packages/ui/src/components/business/agent/chat/index.tsx',
    'packages/ui/src/components/business/agent/chat/types.ts',
    'packages/ui/src/components/business/agent/chat/list/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/panel/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/item/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAgentChatCss() {
  return [
    'packages/ui/src/components/business/agent/chat/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/panel/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/item/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/menu/styles.css',
    'packages/ui/src/components/business/agent/chat/history/styles.css',
    'packages/ui/src/components/business/agent/chat/toolbar/styles.css',
  ].map(readProjectFile).join('\n')
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
    'packages/ui/src/components/business/agent/diagnostic/index.tsx',
    'packages/ui/src/components/business/agent/debug/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/card/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/summary/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/entry/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/code/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/badge/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/tool/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/warnings/index.tsx',
    'packages/ui/src/components/business/agent/debug/index.tsx',
  ].map(readProjectFile).join('\n')
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
    'packages/ui/src/components/business/agent/diagnostic/tool/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/warnings/styles.css',
    'packages/ui/src/components/business/agent/debug/styles.css',
  ].map(readProjectFile).join('\n')
}

function readAgentRunSource() {
  return [
    'packages/ui/src/components/business/agent/run/index.tsx',
    'packages/ui/src/components/business/agent/run/card/index.tsx',
    'packages/ui/src/components/business/agent/run/data-block/index.tsx',
    'packages/ui/src/components/business/agent/run/code/index.tsx',
    'packages/ui/src/components/business/agent/run/attachment-preview/index.tsx',
    'packages/ui/src/components/business/agent/run/list/index.tsx',
    'packages/ui/src/components/business/agent/run/field/index.tsx',
    'packages/ui/src/components/business/agent/run/tool-step/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAgentRunCss() {
  return [
    'packages/ui/src/components/business/agent/run/styles.css',
    'packages/ui/src/components/business/agent/run/foundation/styles.css',
    'packages/ui/src/components/business/agent/run/card/styles.css',
    'packages/ui/src/components/business/agent/run/data-block/styles.css',
    'packages/ui/src/components/business/agent/run/list/styles.css',
    'packages/ui/src/components/business/agent/run/field/styles.css',
    'packages/ui/src/components/business/agent/run/tool-step/styles.css',
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
    'packages/ui/src/components/business/agent/chat/index.tsx',
    'packages/ui/src/components/business/agent/chat/types.ts',
    'packages/ui/src/components/business/agent/chat/list/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/panel/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/item/index.tsx',
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
    'packages/ui/src/components/business/agent/run/card/index.tsx',
    'packages/ui/src/components/business/agent/run/data-block/index.tsx',
    'packages/ui/src/components/business/agent/run/code/index.tsx',
    'packages/ui/src/components/business/agent/run/attachment-preview/index.tsx',
    'packages/ui/src/components/business/agent/run/list/index.tsx',
    'packages/ui/src/components/business/agent/run/field/index.tsx',
    'packages/ui/src/components/business/agent/run/tool-step/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/disclosure/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/item/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/status/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/code/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/notice/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/bubble/index.tsx',
    'packages/ui/src/components/business/agent/work/index.tsx',
    'packages/ui/src/components/business/agent/composer/index.tsx',
    'packages/ui/src/components/business/agent/settings/index.tsx',
    'packages/ui/src/components/business/agent/pinned-status/index.tsx',
    'packages/ui/src/components/business/agent/browser/index.tsx',
    'packages/ui/src/components/business/agent/console-nav/index.tsx',
    'packages/ui/src/components/business/agent/message/index.tsx',
    'packages/ui/src/components/business/agent/message/base/index.tsx',
    'packages/ui/src/components/business/agent/message/section/index.tsx',
    'packages/ui/src/components/business/agent/message/chat/index.tsx',
    'packages/ui/src/components/business/agent/message/model-setup/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/code/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/feedback/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/card/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/badge/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/thumbnail/index.tsx',
    'packages/ui/src/components/business/agent/generated/index.tsx',
    'packages/ui/src/components/business/agent/generated/feedback/index.tsx',
    'packages/ui/src/components/business/agent/generated/media-preview/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/shell/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/header/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/item/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/notice/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/shell/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/resource/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/target/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/status/index.tsx',
    'packages/ui/src/components/business/agent/generated/viewer/index.tsx',
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
    'packages/ui/src/components/business/app/dashboard/index.tsx',
    'packages/ui/src/components/business/app/dashboard/layout/index.tsx',
    'packages/ui/src/components/business/app/dashboard/metric/index.tsx',
    'packages/ui/src/components/business/app/dashboard/item/index.tsx',
    'packages/ui/src/components/business/app/dashboard/lane/index.tsx',
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
    'packages/ui/src/components/business/app/auth/index.tsx',
    'packages/ui/src/components/business/app/work-mode/index.tsx',
    'packages/ui/src/components/business/app/work-mode/types.ts',
    'packages/ui/src/components/business/app/work-mode/prompt/index.tsx',
    'packages/ui/src/components/business/app/work-mode/card/index.tsx',
    'packages/ui/src/components/business/app/work-mode/switch-guide/index.tsx',
    'packages/ui/src/components/business/app/onboarding/index.tsx',
    'packages/ui/src/components/business/app/settings/index.tsx',
    'packages/ui/src/components/business/app/shell/index.tsx',
    'packages/ui/src/components/business/app/user-profile/index.tsx',
    'packages/ui/src/components/business/app/toast/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readAppDashboardCss() {
  return [
    'packages/ui/src/components/business/app/dashboard/styles.css',
    'packages/ui/src/components/business/app/dashboard/layout/styles.css',
    'packages/ui/src/components/business/app/dashboard/metric/styles.css',
    'packages/ui/src/components/business/app/dashboard/item/styles.css',
    'packages/ui/src/components/business/app/dashboard/lane/styles.css',
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
    'packages/ui/src/components/business/app/auth/styles.css',
    'packages/ui/src/components/business/app/work-mode/styles.css',
    'packages/ui/src/components/business/app/work-mode/prompt/styles.css',
    'packages/ui/src/components/business/app/work-mode/card/styles.css',
    'packages/ui/src/components/business/app/work-mode/switch-guide/styles.css',
    'packages/ui/src/components/business/app/onboarding/styles.css',
    'packages/ui/src/components/business/app/settings/styles.css',
    'packages/ui/src/components/business/app/shell/styles.css',
    'packages/ui/src/components/business/app/user-profile/styles.css',
    'packages/ui/src/components/business/app/dashboard/styles.css',
    'packages/ui/src/components/business/app/dashboard/layout/styles.css',
    'packages/ui/src/components/business/app/dashboard/metric/styles.css',
    'packages/ui/src/components/business/app/dashboard/item/styles.css',
    'packages/ui/src/components/business/app/dashboard/lane/styles.css',
    'packages/ui/src/components/business/app/projects/styles.css',
    'packages/ui/src/components/business/app/toast/styles.css',
  ].map(readProjectFile).join('\n')
}

function readReviewSource() {
  return [
    'packages/ui/src/components/business/review/index.tsx',
    'packages/ui/src/components/business/review/types.ts',
    'packages/ui/src/components/business/review/change-action/index.tsx',
    'packages/ui/src/components/business/review/callout/index.tsx',
    'packages/ui/src/components/business/review/proposal/index.tsx',
    'packages/ui/src/components/business/review/proposal/draft/index.tsx',
    'packages/ui/src/components/business/review/proposal/shell/index.tsx',
    'packages/ui/src/components/business/review/proposal/empty-state/index.tsx',
    'packages/ui/src/components/business/review/proposal/impact/index.tsx',
    'packages/ui/src/components/business/review/proposal/footer-actions/index.tsx',
    'packages/ui/src/components/business/review/proposal/apply-gate/index.tsx',
    'packages/ui/src/components/business/review/proposal/upstream/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readReviewCss() {
  return [
    'packages/ui/src/components/business/review/styles.css',
    'packages/ui/src/components/business/review/change-action/styles.css',
    'packages/ui/src/components/business/review/callout/styles.css',
    'packages/ui/src/components/business/review/proposal/styles.css',
    'packages/ui/src/components/business/review/proposal/draft/styles.css',
    'packages/ui/src/components/business/review/proposal/empty-state/styles.css',
    'packages/ui/src/components/business/review/proposal/impact/styles.css',
    'packages/ui/src/components/business/review/proposal/footer-actions/styles.css',
    'packages/ui/src/components/business/review/proposal/apply-gate/styles.css',
    'packages/ui/src/components/business/review/proposal/upstream/styles.css',
  ].map(readProjectFile).join('\n')
}

function readJobsSource() {
  return [
    'packages/ui/src/components/business/jobs/index.tsx',
    'packages/ui/src/components/business/jobs/layout/index.tsx',
    'packages/ui/src/components/business/jobs/layout/shell/index.tsx',
    'packages/ui/src/components/business/jobs/layout/header/index.tsx',
    'packages/ui/src/components/business/jobs/layout/filters/index.tsx',
    'packages/ui/src/components/business/jobs/layout/collection/index.tsx',
    'packages/ui/src/components/business/jobs/layout/pager/index.tsx',
    'packages/ui/src/components/business/jobs/status/index.tsx',
    'packages/ui/src/components/business/jobs/detail/index.tsx',
    'packages/ui/src/components/business/jobs/card/index.tsx',
    'packages/ui/src/components/business/jobs/card/shell/index.tsx',
    'packages/ui/src/components/business/jobs/card/header/index.tsx',
    'packages/ui/src/components/business/jobs/card/media/index.tsx',
    'packages/ui/src/components/business/jobs/card/state/index.tsx',
    'packages/ui/src/components/business/jobs/card/grid/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readJobsCss() {
  return [
    'packages/ui/src/components/business/jobs/styles.css',
    'packages/ui/src/components/business/jobs/layout/styles.css',
    'packages/ui/src/components/business/jobs/layout/shell/styles.css',
    'packages/ui/src/components/business/jobs/layout/header/styles.css',
    'packages/ui/src/components/business/jobs/layout/filters/styles.css',
    'packages/ui/src/components/business/jobs/layout/collection/styles.css',
    'packages/ui/src/components/business/jobs/layout/pager/styles.css',
    'packages/ui/src/components/business/jobs/status/styles.css',
    'packages/ui/src/components/business/jobs/detail/styles.css',
    'packages/ui/src/components/business/jobs/card/styles.css',
    'packages/ui/src/components/business/jobs/card/shell/styles.css',
    'packages/ui/src/components/business/jobs/card/header/styles.css',
    'packages/ui/src/components/business/jobs/card/media/styles.css',
    'packages/ui/src/components/business/jobs/card/state/styles.css',
    'packages/ui/src/components/business/jobs/card/grid/styles.css',
  ].map(readProjectFile).join('\n')
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
    'packages/ui/src/components/business/resource/library-picker/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/types.ts',
    'packages/ui/src/components/business/resource/library-picker/header/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/toolbar/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/list/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/row/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourceLibraryPickerCss() {
  return [
    'packages/ui/src/components/business/resource/library-picker/styles.css',
    'packages/ui/src/components/business/resource/library-picker/shell/styles.css',
    'packages/ui/src/components/business/resource/library-picker/toolbar/styles.css',
    'packages/ui/src/components/business/resource/library-picker/list/styles.css',
    'packages/ui/src/components/business/resource/library-picker/row/styles.css',
  ].map(readProjectFile).join('\n')
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

function readResourcePreviewDrawerSource() {
  return [
    'packages/ui/src/components/business/resource/preview-drawer/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/shell/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/tree/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/story/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/mobile/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/missing-assets/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/state/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourcePreviewDrawerCss() {
  return [
    'packages/ui/src/components/business/resource/preview-drawer/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/shell/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/tree/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/story/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/mobile/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/missing-assets/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/state/styles.css',
  ].map(readProjectFile).join('\n')
}

function readResourceScriptReferenceSource() {
  return [
    'packages/ui/src/components/business/resource/script-reference/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/types.ts',
    'packages/ui/src/components/business/resource/script-reference/trigger/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/header/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/selector/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/content/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readResourceScriptReferenceCss() {
  return [
    'packages/ui/src/components/business/resource/script-reference/styles.css',
    'packages/ui/src/components/business/resource/script-reference/trigger/styles.css',
    'packages/ui/src/components/business/resource/script-reference/shell/styles.css',
    'packages/ui/src/components/business/resource/script-reference/header/styles.css',
    'packages/ui/src/components/business/resource/script-reference/selector/styles.css',
    'packages/ui/src/components/business/resource/script-reference/content/styles.css',
  ].map(readProjectFile).join('\n')
}

function readDetailSource() {
  return [
    'packages/ui/src/components/business/detail/index.tsx',
    'packages/ui/src/components/business/detail/types.ts',
    'packages/ui/src/components/business/detail/badge/index.tsx',
    'packages/ui/src/components/business/detail/header/index.tsx',
    'packages/ui/src/components/business/detail/entity-header/index.tsx',
    'packages/ui/src/components/business/detail/preview-list/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readDetailCss() {
  return [
    'packages/ui/src/components/business/detail/styles.css',
    'packages/ui/src/components/business/detail/header/styles.css',
    'packages/ui/src/components/business/detail/entity-header/styles.css',
    'packages/ui/src/components/business/detail/badge/styles.css',
    'packages/ui/src/components/business/detail/preview-list/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/dialog/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/control/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/hint/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/layout/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/notice/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/rail/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/actions/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/hero/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/header/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/panel/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/stats/styles.css',
  ].map(readProjectFile).join('\n')
}

function readDetailEntityEditorSource() {
  return [
    'packages/ui/src/components/business/detail/entity-editor/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/types.ts',
    'packages/ui/src/components/business/detail/entity-editor/dialog/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/control/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/hint/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/layout/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/notice/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/rail/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/actions/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/hero/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/header/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/panel/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/stats/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readDetailEntityEditorCss() {
  return [
    'packages/ui/src/components/business/detail/entity-editor/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/dialog/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/control/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/hint/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/layout/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/notice/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/rail/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/actions/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/hero/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/header/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/panel/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/stats/styles.css',
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

function readToolsWorkspaceSource() {
  return [
    'packages/ui/src/components/business/tools/workspace/index.tsx',
    'packages/ui/src/components/business/tools/workspace/layout/index.tsx',
    'packages/ui/src/components/business/tools/workspace/panel/index.tsx',
    'packages/ui/src/components/business/tools/workspace/resources/index.tsx',
    'packages/ui/src/components/business/tools/workspace/actions/index.tsx',
    'packages/ui/src/components/business/tools/workspace/output/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readToolsWorkspaceCss() {
  return [
    'packages/ui/src/components/business/tools/workspace/styles.css',
    'packages/ui/src/components/business/tools/workspace/layout/styles.css',
    'packages/ui/src/components/business/tools/workspace/panel/styles.css',
    'packages/ui/src/components/business/tools/workspace/resources/styles.css',
    'packages/ui/src/components/business/tools/workspace/actions/styles.css',
    'packages/ui/src/components/business/tools/workspace/output/styles.css',
  ].map(readProjectFile).join('\n')
}

function readToolsBrainstormSource() {
  return [
    'packages/ui/src/components/business/tools/brainstorm/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readToolsBrainstormCss() {
  return [
    'packages/ui/src/components/business/tools/brainstorm/styles.css',
  ].map(readProjectFile).join('\n')
}

function readScriptsLibrarySource() {
  return [
    'packages/ui/src/components/business/scripts/library/index.tsx',
    'packages/ui/src/components/business/scripts/library/rail/index.tsx',
    'packages/ui/src/components/business/scripts/library/empty-state/index.tsx',
    'packages/ui/src/components/business/scripts/library/group/index.tsx',
    'packages/ui/src/components/business/scripts/library/item/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readScriptsLibraryCss() {
  return [
    'packages/ui/src/components/business/scripts/library/styles.css',
    'packages/ui/src/components/business/scripts/library/rail/styles.css',
    'packages/ui/src/components/business/scripts/library/empty-state/styles.css',
    'packages/ui/src/components/business/scripts/library/group/styles.css',
    'packages/ui/src/components/business/scripts/library/item/styles.css',
  ].map(readProjectFile).join('\n')
}

function readCreativeReferenceSource() {
  return [
    'packages/ui/src/components/business/resource/creative-reference/index.tsx',
    'packages/ui/src/components/business/resource/creative-reference/types.ts',
    'packages/ui/src/components/business/resource/creative-reference/meta.ts',
    'packages/ui/src/components/business/resource/creative-reference/icons.tsx',
    'packages/ui/src/components/business/resource/creative-reference/card/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readCreativeReferenceCss() {
  return [
    'packages/ui/src/components/business/resource/creative-reference/styles.css',
    'packages/ui/src/components/business/resource/creative-reference/shell/styles.css',
    'packages/ui/src/components/business/resource/creative-reference/visual/styles.css',
    'packages/ui/src/components/business/resource/creative-reference/body/styles.css',
  ].map(readProjectFile).join('\n')
}

function readWorkbenchChromeSource() {
  return [
    'packages/ui/src/components/business/workbench/chrome/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/app-shell/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/project-shell/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/queue/index.tsx',
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
    'packages/ui/src/components/business/workbench/chrome/queue/styles.css',
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

test('@movscript/ui has explicit theme, primitive, and business component boundaries', () => {
  const requiredFiles = [
    'packages/ui/src/base.css',
    'packages/ui/src/semantic.css',
    'packages/ui/src/styles.css',
    'packages/tokens/src/theme.css',
    'packages/theme/src/theme.css',
    'packages/theme/src/index.ts',
    'docs/ui-semantic-system.md',
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
    'packages/ui/src/components/layout/workspace/styles.css',
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
    'packages/ui/src/components/business/agent/panel/card/styles.css',
    'packages/ui/src/components/business/agent/panel/composer-mention/styles.css',
    'packages/ui/src/components/business/agent/panel/shell-layout/styles.css',
    'packages/ui/src/components/business/agent/panel/thread-message/styles.css',
    'packages/ui/src/components/business/agent/panel/context/styles.css',
    'packages/ui/src/components/business/agent/panel/embedded-runtime/styles.css',
    'packages/ui/src/components/business/agent/page/styles.css',
    'packages/ui/src/components/business/agent/shell/styles.css',
    'packages/ui/src/components/business/agent/shell/layout/styles.css',
    'packages/ui/src/components/business/agent/shell/sidebar/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/foundation/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/tool/styles.css',
    'packages/ui/src/components/business/agent/shell/primitives/inline/styles.css',
    'packages/ui/src/components/business/agent/shell/attachment/styles.css',
    'packages/ui/src/components/business/agent/shell/chat-message/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/code/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/feedback/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/card/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/badge/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/thumbnail/styles.css',
    'packages/ui/src/components/business/agent/shell/runtime-code/styles.css',
    'packages/ui/src/components/business/agent/generated/styles.css',
    'packages/ui/src/components/business/agent/generated/media-preview/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/shell/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/header/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/item/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/notice/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/shell/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/resource/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/target/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/status/styles.css',
    'packages/ui/src/components/business/agent/generated/viewer/styles.css',
    'packages/ui/src/components/business/agent/chat/index.tsx',
    'packages/ui/src/components/business/agent/chat/types.ts',
    'packages/ui/src/components/business/agent/chat/styles.css',
    'packages/ui/src/components/business/agent/console/index.tsx',
    'packages/ui/src/components/business/agent/console/styles.css',
    'packages/ui/src/components/business/agent/console-nav/index.tsx',
    'packages/ui/src/components/business/agent/console-nav/styles.css',
    'packages/ui/src/components/business/agent/chat/list/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/panel/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/panel/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/item/index.tsx',
    'packages/ui/src/components/business/agent/chat/tabs/item/styles.css',
    'packages/ui/src/components/business/agent/chat/tabs/menu/styles.css',
    'packages/ui/src/components/business/agent/chat/history/styles.css',
    'packages/ui/src/components/business/agent/chat/toolbar/styles.css',
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
    'packages/ui/src/components/business/agent/diagnostic/styles.css',
    'packages/ui/src/components/business/agent/debug/index.tsx',
    'packages/ui/src/components/business/agent/debug/styles.css',
    'packages/ui/src/components/business/agent/diagnostic/card/index.tsx',
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
    'packages/ui/src/components/business/agent/diagnostic/warnings/styles.css',
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
    'packages/ui/src/components/business/agent/run-activity/notice/styles.css',
    'packages/ui/src/components/business/agent/run-activity/bubble/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/bubble/styles.css',
    'packages/ui/src/components/business/agent/thread/styles.css',
    'packages/ui/src/components/business/agent/thread/foundation/styles.css',
    'packages/ui/src/components/business/agent/thread/empty/styles.css',
    'packages/ui/src/components/business/agent/thread/message/styles.css',
    'packages/ui/src/components/business/agent/thread/tool/styles.css',
    'packages/ui/src/components/business/agent/thread/suggestion/styles.css',
    'packages/ui/src/components/business/agent/context/styles.css',
    'packages/ui/src/components/business/agent/run/index.tsx',
    'packages/ui/src/components/business/agent/run/styles.css',
    'packages/ui/src/components/business/agent/run/foundation/styles.css',
    'packages/ui/src/components/business/agent/run/card/index.tsx',
    'packages/ui/src/components/business/agent/run/card/styles.css',
    'packages/ui/src/components/business/agent/run/data-block/index.tsx',
    'packages/ui/src/components/business/agent/run/data-block/styles.css',
    'packages/ui/src/components/business/agent/run/code/index.tsx',
    'packages/ui/src/components/business/agent/run/attachment-preview/index.tsx',
    'packages/ui/src/components/business/agent/run/list/index.tsx',
    'packages/ui/src/components/business/agent/run/list/styles.css',
    'packages/ui/src/components/business/agent/run/field/index.tsx',
    'packages/ui/src/components/business/agent/run/field/styles.css',
    'packages/ui/src/components/business/agent/run/tool-step/index.tsx',
    'packages/ui/src/components/business/agent/run/tool-step/styles.css',
    'packages/ui/src/components/business/agent/work/index.tsx',
    'packages/ui/src/components/business/agent/work/styles.css',
    'packages/ui/src/components/business/agent/composer/index.tsx',
    'packages/ui/src/components/business/agent/composer/styles.css',
    'packages/ui/src/components/business/agent/message/index.tsx',
    'packages/ui/src/components/business/agent/message/base/index.tsx',
    'packages/ui/src/components/business/agent/message/section/index.tsx',
    'packages/ui/src/components/business/agent/message/chat/index.tsx',
    'packages/ui/src/components/business/agent/message/model-setup/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/code/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/code/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/feedback/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/feedback/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/card/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/card/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/badge/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/badge/styles.css',
    'packages/ui/src/components/business/agent/workflow-approval/thumbnail/index.tsx',
    'packages/ui/src/components/business/agent/workflow-approval/thumbnail/styles.css',
    'packages/ui/src/components/business/agent/generated/index.tsx',
    'packages/ui/src/components/business/agent/generated/feedback/index.tsx',
    'packages/ui/src/components/business/agent/generated/media-preview/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/shell/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/shell/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/header/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/header/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/item/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/item/styles.css',
    'packages/ui/src/components/business/agent/generated/result-card/notice/index.tsx',
    'packages/ui/src/components/business/agent/generated/result-card/notice/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/shell/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/shell/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/resource/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/resource/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/target/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/target/styles.css',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/status/index.tsx',
    'packages/ui/src/components/business/agent/generated/candidate-dialog/status/styles.css',
    'packages/ui/src/components/business/agent/generated/viewer/index.tsx',
    'packages/ui/src/components/business/agent/settings/index.tsx',
    'packages/ui/src/components/business/agent/settings/styles.css',
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
    'packages/ui/src/components/business/app/settings/index.tsx',
    'packages/ui/src/components/business/app/settings/styles.css',
    'packages/ui/src/components/business/app/toast/index.tsx',
    'packages/ui/src/components/business/app/toast/styles.css',
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
    'packages/ui/src/components/business/app/projects/styles.css',
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
    'packages/ui/src/components/business/canvas/card/node/core/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/core/styles.css',
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
    'packages/ui/src/components/business/canvas/flow/styles.css',
    'packages/ui/src/components/business/canvas/generation/index.tsx',
    'packages/ui/src/components/business/canvas/generation/styles.css',
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
    'packages/ui/src/components/business/detail/index.tsx',
    'packages/ui/src/components/business/detail/styles.css',
    'packages/ui/src/components/business/detail/types.ts',
    'packages/ui/src/components/business/detail/badge/index.tsx',
    'packages/ui/src/components/business/detail/badge/styles.css',
    'packages/ui/src/components/business/detail/header/index.tsx',
    'packages/ui/src/components/business/detail/header/styles.css',
    'packages/ui/src/components/business/detail/entity-header/index.tsx',
    'packages/ui/src/components/business/detail/entity-header/styles.css',
    'packages/ui/src/components/business/detail/preview-list/index.tsx',
    'packages/ui/src/components/business/detail/preview-list/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/types.ts',
    'packages/ui/src/components/business/detail/entity-editor/dialog/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/dialog/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/control/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/control/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/hint/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/hint/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/layout/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/layout/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/field/notice/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/field/notice/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/rail/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/rail/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/actions/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/actions/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/hero/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/hero/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/header/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/header/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/panel/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/panel/styles.css',
    'packages/ui/src/components/business/detail/entity-editor/shell/stats/index.tsx',
    'packages/ui/src/components/business/detail/entity-editor/shell/stats/styles.css',
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
    'packages/ui/src/components/business/jobs/index.tsx',
    'packages/ui/src/components/business/jobs/styles.css',
    'packages/ui/src/components/business/jobs/layout/index.tsx',
    'packages/ui/src/components/business/jobs/layout/styles.css',
    'packages/ui/src/components/business/jobs/layout/shell/index.tsx',
    'packages/ui/src/components/business/jobs/layout/shell/styles.css',
    'packages/ui/src/components/business/jobs/layout/header/index.tsx',
    'packages/ui/src/components/business/jobs/layout/header/styles.css',
    'packages/ui/src/components/business/jobs/layout/filters/index.tsx',
    'packages/ui/src/components/business/jobs/layout/filters/styles.css',
    'packages/ui/src/components/business/jobs/layout/collection/index.tsx',
    'packages/ui/src/components/business/jobs/layout/collection/styles.css',
    'packages/ui/src/components/business/jobs/layout/pager/index.tsx',
    'packages/ui/src/components/business/jobs/layout/pager/styles.css',
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
    'packages/ui/src/components/business/resource/index.tsx',
    'packages/ui/src/components/business/resource/styles.css',
    'packages/ui/src/components/business/resource/asset-card/index.tsx',
    'packages/ui/src/components/business/resource/asset-card/styles.css',
    'packages/ui/src/components/business/resource/auth-media/index.tsx',
    'packages/ui/src/components/business/resource/auth-media/styles.css',
    'packages/ui/src/components/business/resource/attachments/index.tsx',
    'packages/ui/src/components/business/resource/attachments/styles.css',
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
    'packages/ui/src/components/business/resource/creative-reference/index.tsx',
    'packages/ui/src/components/business/resource/creative-reference/types.ts',
    'packages/ui/src/components/business/resource/creative-reference/meta.ts',
    'packages/ui/src/components/business/resource/creative-reference/icons.tsx',
    'packages/ui/src/components/business/resource/creative-reference/card/index.tsx',
    'packages/ui/src/components/business/resource/creative-reference/styles.css',
    'packages/ui/src/components/business/resource/creative-reference/shell/styles.css',
    'packages/ui/src/components/business/resource/creative-reference/visual/styles.css',
    'packages/ui/src/components/business/resource/creative-reference/body/styles.css',
    'packages/ui/src/components/business/resource/library-picker/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/types.ts',
    'packages/ui/src/components/business/resource/library-picker/styles.css',
    'packages/ui/src/components/business/resource/library-picker/header/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/toolbar/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/list/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/row/index.tsx',
    'packages/ui/src/components/business/resource/library-picker/shell/styles.css',
    'packages/ui/src/components/business/resource/library-picker/toolbar/styles.css',
    'packages/ui/src/components/business/resource/library-picker/list/styles.css',
    'packages/ui/src/components/business/resource/library-picker/row/styles.css',
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
    'packages/ui/src/components/business/resource/preview-drawer/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/shell/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/shell/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/tree/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/tree/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/story/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/story/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/mobile/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/mobile/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/missing-assets/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/missing-assets/styles.css',
    'packages/ui/src/components/business/resource/preview-drawer/state/index.tsx',
    'packages/ui/src/components/business/resource/preview-drawer/state/styles.css',
    'packages/ui/src/components/business/resource/script-reference/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/types.ts',
    'packages/ui/src/components/business/resource/script-reference/styles.css',
    'packages/ui/src/components/business/resource/script-reference/trigger/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/trigger/styles.css',
    'packages/ui/src/components/business/resource/script-reference/shell/styles.css',
    'packages/ui/src/components/business/resource/script-reference/header/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/header/styles.css',
    'packages/ui/src/components/business/resource/script-reference/selector/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/selector/styles.css',
    'packages/ui/src/components/business/resource/script-reference/content/index.tsx',
    'packages/ui/src/components/business/resource/script-reference/content/styles.css',
    'packages/ui/src/components/business/review/index.tsx',
    'packages/ui/src/components/business/review/styles.css',
    'packages/ui/src/components/business/review/types.ts',
    'packages/ui/src/components/business/review/change-action/index.tsx',
    'packages/ui/src/components/business/review/change-action/styles.css',
    'packages/ui/src/components/business/review/callout/index.tsx',
    'packages/ui/src/components/business/review/callout/styles.css',
    'packages/ui/src/components/business/review/proposal/index.tsx',
    'packages/ui/src/components/business/review/proposal/styles.css',
    'packages/ui/src/components/business/review/proposal/shell/index.tsx',
    'packages/ui/src/components/business/review/proposal/empty-state/index.tsx',
    'packages/ui/src/components/business/review/proposal/empty-state/styles.css',
    'packages/ui/src/components/business/review/proposal/impact/index.tsx',
    'packages/ui/src/components/business/review/proposal/impact/styles.css',
    'packages/ui/src/components/business/review/proposal/footer-actions/index.tsx',
    'packages/ui/src/components/business/review/proposal/footer-actions/styles.css',
    'packages/ui/src/components/business/review/proposal/apply-gate/index.tsx',
    'packages/ui/src/components/business/review/proposal/apply-gate/styles.css',
    'packages/ui/src/components/business/organization/index.tsx',
    'packages/ui/src/components/business/organization/styles.css',
    'packages/ui/src/components/business/plugins/index.tsx',
    'packages/ui/src/components/business/plugins/styles.css',
    'packages/ui/src/components/business/project/index.tsx',
    'packages/ui/src/components/business/project/styles.css',
    'packages/ui/src/components/business/project/proposal-review/index.tsx',
    'packages/ui/src/components/business/project/proposal-review/styles.css',
    'packages/ui/src/components/business/project/tasks/index.tsx',
    'packages/ui/src/components/business/project/tasks/styles.css',
    'packages/ui/src/components/business/production/index.tsx',
    'packages/ui/src/components/business/production/styles.css',
    'packages/ui/src/components/business/production/proposal-review/index.tsx',
    'packages/ui/src/components/business/production/proposal-review/styles.css',
    'packages/ui/src/components/business/production/scene-writing/index.tsx',
    'packages/ui/src/components/business/production/scene-writing/styles.css',
    'packages/ui/src/components/business/production/script-binding/index.tsx',
    'packages/ui/src/components/business/production/script-binding/styles.css',
    'packages/ui/src/components/business/scripts/index.tsx',
    'packages/ui/src/components/business/scripts/styles.css',
    'packages/ui/src/components/business/scripts/create-form/index.tsx',
    'packages/ui/src/components/business/scripts/create-form/styles.css',
    'packages/ui/src/components/business/scripts/detail-header/index.tsx',
    'packages/ui/src/components/business/scripts/detail-header/styles.css',
    'packages/ui/src/components/business/scripts/tabs/index.tsx',
    'packages/ui/src/components/business/scripts/tabs/styles.css',
    'packages/ui/src/components/business/scripts/library/index.tsx',
    'packages/ui/src/components/business/scripts/library/styles.css',
    'packages/ui/src/components/business/scripts/library/rail/index.tsx',
    'packages/ui/src/components/business/scripts/library/rail/styles.css',
    'packages/ui/src/components/business/scripts/library/empty-state/index.tsx',
    'packages/ui/src/components/business/scripts/library/empty-state/styles.css',
    'packages/ui/src/components/business/scripts/library/group/index.tsx',
    'packages/ui/src/components/business/scripts/library/group/styles.css',
    'packages/ui/src/components/business/scripts/library/item/index.tsx',
    'packages/ui/src/components/business/scripts/library/item/styles.css',
    'packages/ui/src/components/business/scripts/version/index.tsx',
    'packages/ui/src/components/business/scripts/version/styles.css',
    'packages/ui/src/components/business/tools/index.tsx',
    'packages/ui/src/components/business/tools/styles.css',
    'packages/ui/src/components/business/tools/header/index.tsx',
    'packages/ui/src/components/business/tools/header/styles.css',
    'packages/ui/src/components/business/tools/brainstorm/index.tsx',
    'packages/ui/src/components/business/tools/brainstorm/styles.css',
    'packages/ui/src/components/business/tools/dialog/index.tsx',
    'packages/ui/src/components/business/tools/dialog/styles.css',
    'packages/ui/src/components/business/tools/workspace/index.tsx',
    'packages/ui/src/components/business/tools/workspace/styles.css',
    'packages/ui/src/components/business/tools/workspace/layout/index.tsx',
    'packages/ui/src/components/business/tools/workspace/layout/styles.css',
    'packages/ui/src/components/business/tools/workspace/panel/index.tsx',
    'packages/ui/src/components/business/tools/workspace/panel/styles.css',
    'packages/ui/src/components/business/tools/workspace/resources/index.tsx',
    'packages/ui/src/components/business/tools/workspace/resources/styles.css',
    'packages/ui/src/components/business/tools/workspace/actions/index.tsx',
    'packages/ui/src/components/business/tools/workspace/actions/styles.css',
    'packages/ui/src/components/business/tools/workspace/output/index.tsx',
    'packages/ui/src/components/business/tools/workspace/output/styles.css',
    'packages/ui/src/components/business/workbench/index.tsx',
    'packages/ui/src/components/business/workbench/styles.css',
    'packages/ui/src/components/business/workbench/types.ts',
    'packages/ui/src/components/business/workbench/status.ts',
    'packages/ui/src/components/business/workbench/foundation/styles.css',
    'packages/ui/src/components/business/workbench/panel/index.tsx',
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
    'packages/ui/src/components/business/workbench/chrome/queue/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/queue/styles.css',
    'packages/ui/src/components/business/workbench/chrome/decision/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/decision/styles.css',
    'packages/ui/src/components/business/workbench/chrome/metric-strip/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/metric-strip/styles.css',
    'packages/ui/src/components/business/workbench/chrome/context/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/context/styles.css',
    'packages/ui/src/components/business/workbench/chrome/gate/index.tsx',
    'packages/ui/src/components/business/workbench/chrome/gate/styles.css',
    'packages/ui/src/components/business/workbench/scene-preview/index.tsx',
    'packages/ui/src/components/business/workbench/scene-preview/styles.css',
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
  const uiSemanticDoc = readProjectFile('docs/ui-semantic-system.md')
  const frontendThemeHook = readProjectFile('apps/frontend/src/features/app-shell/application/useTheme.ts')
  const adminThemeHook = readProjectFile('apps/admin/src/hooks/useTheme.ts')
  const uiIndex = readProjectFile('packages/ui/src/index.ts')
  const uiStyleSystemSource = readProjectFile('packages/ui/src/style-system.ts')
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const uiStylesCss = readProjectFile('packages/ui/src/styles.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const allUiCss = walkFiles('packages/ui/src', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const primitiveCssEntry = readProjectFile('packages/ui/src/components/primitives/styles.css')
  const primitiveIndexSource = readProjectFile('packages/ui/src/components/primitives/index.ts')
  const primitiveBadgeSource = readProjectFile('packages/ui/src/components/primitives/badge.tsx')
  const primitiveButtonSource = readProjectFile('packages/ui/src/components/primitives/button.tsx')
  const primitiveSurfaceSource = readProjectFile('packages/ui/src/components/primitives/surface.tsx')
  const primitiveCss = readPrimitiveCss()
  const agentCssEntry = readProjectFile('packages/ui/src/components/business/agent/styles.css')
  const agentCss = readAgentCss()
  const agentChatCss = readAgentChatCss()
  const layoutCss = readProjectFile('packages/ui/src/components/layout/styles.css')
  const appShellLayoutCss = readProjectFile('packages/ui/src/components/layout/app-shell/styles.css')
  const appShellWindowCss = readProjectFile('packages/ui/src/components/layout/app-shell/window/styles.css')
  const workspaceLayoutSource = readProjectFile('packages/ui/src/components/layout/workspace/index.tsx')
  const workspaceLayoutCss = readProjectFile('packages/ui/src/components/layout/workspace/styles.css')
  const businessAppCss = readAppCss()
  const businessIndexSource = readProjectFile('packages/ui/src/components/business/index.ts')
  const canvasCss = readProjectFile('packages/ui/src/components/business/canvas/styles.css')
  const frontendTypesSource = readProjectFile('apps/frontend/src/types/index.ts')
  const canvasNodeDefinitionsSource = readProjectFile('apps/frontend/src/features/canvas/domain/nodeDefinitions.ts')
  const canvasCardSource = readProjectFile('packages/ui/src/components/business/canvas/card/index.tsx')
  const canvasCardCss = readProjectFile('packages/ui/src/components/business/canvas/card/styles.css')
  const canvasCardShellSource = readProjectFile('packages/ui/src/components/business/canvas/card/shell/index.tsx')
  const canvasCardShellCss = readProjectFile('packages/ui/src/components/business/canvas/card/shell/styles.css')
  const canvasFlowCss = readProjectFile('packages/ui/src/components/business/canvas/flow/styles.css')
  const canvasGenerationSource = readProjectFile('packages/ui/src/components/business/canvas/generation/index.tsx')
  const canvasGenerationCss = readProjectFile('packages/ui/src/components/business/canvas/generation/styles.css')
  const canvasMediaSource = readProjectFile('packages/ui/src/components/business/canvas/media/index.tsx')
  const canvasMediaCss = readProjectFile('packages/ui/src/components/business/canvas/media/styles.css')
  const canvasResourceShelfUiSource = readProjectFile('packages/ui/src/components/business/canvas/resource-shelf/index.tsx')
  const canvasMentionSource = readProjectFile('packages/ui/src/components/business/canvas/mention/index.tsx')
  const canvasMentionCss = readProjectFile('packages/ui/src/components/business/canvas/mention/styles.css')
  const canvasIOPackageSource = readCanvasIOSource()
  const canvasIOPackageCss = readCanvasIOCss()
  const canvasToolPackageSource = readCanvasToolSource()
  const canvasToolPackageCss = readCanvasToolCss()
  const canvasToolFullCardSource = readCanvasToolFullCardSource()
  const canvasToolFullCardCss = readCanvasToolFullCardCss()
  const detailCss = readDetailCss()
  const detailEntityEditorSource = readDetailEntityEditorSource()
  const detailEntityEditorCss = readDetailEntityEditorCss()
  const generationCss = readProjectFile('packages/ui/src/components/business/generation/styles.css')
  const generationInputSource = readGenerationInputSource()
  const generationInputCss = readGenerationInputCss()
  const generationModelSelectorSource = readProjectFile('packages/ui/src/components/business/generation/model-selector/index.tsx')
  const generationModelSelectorCss = readProjectFile('packages/ui/src/components/business/generation/model-selector/styles.css')
  const generationResultSource = readGenerationResultSource()
  const generationResultCss = readGenerationResultCss()
  const jobsPackageSource = readJobsSource()
  const jobsPackageCss = readJobsCss()
  const resourceCss = readResourceCss()
  const resourceAttachmentsPackageSource = readProjectFile('packages/ui/src/components/business/resource/attachments/index.tsx')
  const resourceAttachmentsPackageCss = readProjectFile('packages/ui/src/components/business/resource/attachments/styles.css')
  const creativeReferenceCardSource = readCreativeReferenceSource()
  const creativeReferenceCss = readCreativeReferenceCss()
  const resourceLibraryPickerSource = readResourceLibraryPickerSource()
  const resourceLibraryPickerCss = readResourceLibraryPickerCss()
  const resourceMediaViewerSource = readResourceMediaViewerSource()
  const resourceMediaViewerCss = readResourceMediaViewerCss()
  const resourcePanelPackageSource = readResourcePanelSource()
  const resourcePanelPackageCss = readResourcePanelCss()
  const resourcePreviewDrawerSource = readResourcePreviewDrawerSource()
  const resourcePreviewDrawerCss = readResourcePreviewDrawerCss()
  const scriptReferenceSource = readResourceScriptReferenceSource()
  const scriptReferenceCss = readResourceScriptReferenceCss()
  const toolsSource = readProjectFile('packages/ui/src/components/business/tools/index.tsx')
  const toolsCss = readProjectFile('packages/ui/src/components/business/tools/styles.css')
  const toolsHeaderSource = readProjectFile('packages/ui/src/components/business/tools/header/index.tsx')
  const toolsHeaderCss = readProjectFile('packages/ui/src/components/business/tools/header/styles.css')
  const toolsWorkspaceSource = readToolsWorkspaceSource()
  const toolsWorkspaceCss = readToolsWorkspaceCss()
  const scriptsPackageSource = readProjectFile('packages/ui/src/components/business/scripts/index.tsx')
  const scriptsPackageCss = readProjectFile('packages/ui/src/components/business/scripts/styles.css')
  const scriptsDetailHeaderSource = readProjectFile('packages/ui/src/components/business/scripts/detail-header/index.tsx')
  const scriptsDetailHeaderCss = readProjectFile('packages/ui/src/components/business/scripts/detail-header/styles.css')
  const scriptsTabsSource = readProjectFile('packages/ui/src/components/business/scripts/tabs/index.tsx')
  const scriptsTabsCss = readProjectFile('packages/ui/src/components/business/scripts/tabs/styles.css')
  const scriptsLibrarySource = readScriptsLibrarySource()
  const scriptsLibraryCss = readScriptsLibraryCss()
  const scriptsVersionSource = readProjectFile('packages/ui/src/components/business/scripts/version/index.tsx')
  const scriptsVersionCss = readProjectFile('packages/ui/src/components/business/scripts/version/styles.css')
  const workbenchCss = readProjectFile('packages/ui/src/components/business/workbench/styles.css')
  const workbenchIndexSource = readProjectFile('packages/ui/src/components/business/workbench/index.tsx')
  const workbenchTypesSource = readProjectFile('packages/ui/src/components/business/workbench/types.ts')
  const workbenchStatusSource = readProjectFile('packages/ui/src/components/business/workbench/status.ts')
  const workbenchPanelSource = readProjectFile('packages/ui/src/components/business/workbench/panel/index.tsx')
  const workbenchChromeSource = readWorkbenchChromeSource()
  const workbenchChromeCss = readWorkbenchChromeCss()
  const workbenchScenePreviewSource = readProjectFile('packages/ui/src/components/business/workbench/scene-preview/index.tsx')
  const workbenchScenePreviewCss = readProjectFile('packages/ui/src/components/business/workbench/scene-preview/styles.css')
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
  assert.match(frontendCss, /@import "@movscript\/ui\/styles\.css";/)
  assert.match(adminCss, /@import "@movscript\/theme\/theme\.css";/)
  assert.match(adminCss, /@import "@movscript\/ui\/styles\.css";/)
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
  assert.match(themeCss, /--ms-color-background: #f5f6f2/)
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
  assert.match(uiStylesCss, /@import "\.\/base\.css";/)
  assert.match(uiStylesCss, /@import "\.\/semantic\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/primitives\/styles\.css";/)
  assert.ok(
    uiStylesCss.indexOf('@import "./components/primitives/styles.css";') < uiStylesCss.indexOf('@import "./semantic.css";'),
    'semantic tone helpers must load after primitive variants so class helpers can override neutral defaults',
  )
  assert.doesNotMatch(uiPackageJson, /"\.\/theme\.css":/)
  assert.match(uiPackageJson, /"\.\/styles\.css": "\.\/src\/styles\.css"/)
  assert.match(uiPackageJson, /"src\/base\.css"/)
  assert.match(uiPackageJson, /"src\/semantic\.css"/)
  assert.match(uiPackageJson, /"src\/components\/primitives\/\*\*\/\*\.css"/)
  assert.doesNotMatch(uiIndex, /@movscript\/theme/)
  assert.match(uiIndex, /export \* from "\.\/semantic"/)
  assert.doesNotMatch(uiIndex, /export \* from "\.\/theme"/)
  assert.match(uiIndex, /export \* from "\.\/components\/primitives"/)
  assert.match(uiIndex, /export \* from "\.\/components\/layout"/)
  assert.match(uiIndex, /export \* from "\.\/components\/business"/)
  assert.doesNotMatch(uiIndex, /from "\.\/components\/(?:primitives|business)\/[^"]+"/)
  assert.match(uiStylesCss, /@import "\.\/components\/layout\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/app\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/agent\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/interaction\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/surface\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/button\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/form\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/display\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/navigation\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/overlay\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/scroll\/styles\.css";/)
  assert.match(primitiveCssEntry, /@import "\.\/motion\/styles\.css";/)
  assert.match(layoutCss, /\.app-page\s*\{/)
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
  assert.doesNotMatch(uiStylesCss, /hsl\(var\(--/)
  assert.doesNotMatch(primitiveCss, /hsl\(var\(--/)
  assert.doesNotMatch(allUiCss, /hsl\(var\(--/)
  assert.doesNotMatch(allUiCss, /var\(--(?:background|foreground|card|popover|primary|secondary|muted-foreground|accent|destructive|border|input|ring)\b/)
  assert.doesNotMatch(`${themeCss}\n${themeIndex}`, /\b(?:agent|canvas|generation|resource|review|project)\b/i)
  assert.match(uiSemanticDoc, /surface[\s\S]*intent[\s\S]*emphasis[\s\S]*state/)
  assert.match(uiSemanticDoc, /business-specific CSS variables/)
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
  assert.match(workspaceLayoutSource, /export function WorkspaceShell/)
  assert.match(workspaceLayoutSource, /export function ContentWorkspaceLayout/)
  assert.match(workspaceLayoutSource, /export function MasterDetail/)
  assert.match(workspaceLayoutCss, /\.app-shell\s*\{/)
  assert.match(workspaceLayoutCss, cssClassSelectorPattern('content-workspace-shell'))
  assert.match(workspaceLayoutCss, /\.script-workbench-layout\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-page\s*\{/)
  assert.doesNotMatch(uiCss, /\.project-surface-header\s*\{/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/canvas\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/detail\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/generation\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/resource\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/review\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/project\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/scripts\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/tools\/styles\.css";/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/workbench\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/card\/styles\.css";/)
  assert.doesNotMatch(canvasCss, /@import "\.\/entity\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/flow\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/io\/styles\.css";/)
  assert.match(canvasCss, /@import "\.\/tool\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/shell\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/surface\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/port\/styles\.css";/)
  assert.match(canvasCardCss, /@import "\.\/decision\/styles\.css";/)
  assert.match(canvasCardShellCss, /\.canvas-card-shell\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-flow\s*\{/)
  assert.match(canvasCss, /@import "\.\/generation\/styles\.css";/)
  assert.match(canvasGenerationSource, /export function CanvasGenerationBody/)
  assert.match(canvasGenerationSource, /\bNativeSelect\b/)
  assert.match(canvasGenerationSource, /\bTextarea\b/)
  assert.match(canvasGenerationSource, /\bButton\b/)
  assert.match(canvasGenerationCss, /\.canvas-generation-body\s*\{/)
  assert.match(canvasGenerationCss, /\.canvas-generation-body__output\s*\{[\s\S]*height:\s*128px/)
  assert.match(canvasGenerationCss, /\.canvas-generation-body__output > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasCss, /@import "\.\/media\/styles\.css";/)
  assert.match(canvasMediaSource, /export function CanvasMediaFill/)
  assert.match(canvasMediaSource, /export function CanvasMediaNodeFrame/)
  assert.match(canvasMediaSource, /export function CanvasResourceShelfThumbFrame/)
  assert.match(canvasMediaCss, /\.canvas-media-fill\[data-fit="cover"\] > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasMediaCss, /\.canvas-media-fill\[data-fit="contain"\] > \*\s*\{[\s\S]*object-fit:\s*contain/)
  assert.match(canvasMediaCss, /\.canvas-media-node-frame\s*\{[\s\S]*min-height:\s*80px/)
  assert.match(canvasMediaCss, /\.canvas-resource-shelf-thumb-frame\[data-compact="false"\]\s*\{[\s\S]*width:\s*82px/)
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
  assert.match(businessAppCss, /\.projects-region\s*\{/)
  assert.match(businessAppCss, /\.projects-list-row\s*\{/)
  assert.match(businessAppCss, /\.onboarding-switch-guide\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-surface-item\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-choice-tile\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-window-icon-button\s*\{/)
  assert.doesNotMatch(uiCss, /\.app-pager\s*\{/)
  assert.doesNotMatch(uiCss, /\.projects-region\s*\{/)
  assert.doesNotMatch(uiCss, /\.projects-list-row\s*\{/)
  assert.doesNotMatch(uiCss, /\.onboarding-switch-guide\s*\{/)
  assert.match(detailCss, /\.detail-header\s*\{/)
  assert.match(detailCss, /@import "\.\/entity-editor\/styles\.css";/)
  assert.match(detailEntityEditorSource, /export function DetailEntityFieldControl/)
  assert.match(detailEntityEditorSource, /export function DetailEntityDialogShell/)
  assert.match(detailEntityEditorSource, /export function DetailEntityDialogHeader/)
  assert.match(detailEntityEditorSource, /export function DetailEntityDialogFooter/)
  assert.match(detailEntityEditorSource, /export function DetailEntitySourceLockNotice/)
  assert.match(detailEntityEditorSource, /export function DetailEntityHorizontalRail/)
  assert.match(detailEntityEditorSource, /export function DetailEntityRequiredHint/)
  assert.match(detailEntityEditorCss, /\.detail-entity-field__control\s*\{/)
  assert.match(detailEntityEditorCss, /\.detail-entity-dialog\s*\{/)
  assert.match(businessIndexSource, /DetailEntityFieldControl/)
  assert.match(businessIndexSource, /DetailEntityDialogShell/)
  assert.doesNotMatch(uiCss, /\.detail-header\s*\{/)
  assert.match(generationCss, /@import "\.\/input\/styles\.css";/)
  assert.match(generationCss, /@import "\.\/model-selector\/styles\.css";/)
  assert.match(generationCss, /@import "\.\/result\/styles\.css";/)
  assert.match(generationInputSource, /export function GenerationInputRoot/)
  assert.match(generationInputSource, /GenerationPromptEditor/)
  assert.match(generationInputSource, /GenerationAttachmentTag/)
  assert.match(generationInputSource, /GenerationInputSlotCard/)
  assert.match(generationInputSource, /GenerationActionBar/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/index.tsx'), /export \* from "\.\/prompt";/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/index.tsx'), /export \* from "\.\/actions";/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/styles.css'), /@import "\.\/prompt\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/generation/input/styles.css'), /@import "\.\/slots\/styles\.css";/)
  assert.match(generationInputCss, /\.generation-input\s*\{/)
  assert.match(generationInputCss, /\.generation-input-slot\s*\{/)
  assert.match(generationModelSelectorSource, /export function GenerationModelSelector/)
  assert.match(generationModelSelectorSource, /\bSelectTrigger\b/)
  assert.match(generationModelSelectorSource, /\bButton\b/)
  assert.match(generationModelSelectorCss, /\.generation-model-selector\s*\{/)
  assert.match(generationResultSource, /export function GenerationResultCard/)
  assert.match(generationResultSource, /export function GenerationInlineResourceChip/)
  assert.match(generationResultSource, /export function GenerationContextSummary/)
  assert.match(generationResultSource, /export function GenerationContextRow/)
  assert.match(generationResultSource, /export function generationResultStatusIntent/)
  assert.match(generationResultSource, /<StatusBadge\b[\s\S]*?intent=\{generationResultStatusIntent\(status\)\}/)
  assert.doesNotMatch(generationResultSource, /generationResultStatusTone/)
  assert.doesNotMatch(generationResultSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(generationResultCss, /\.generation-result-card\s*\{/)
  assert.match(generationResultCss, /\.generation-result-resource-chip\s*\{/)
  assert.match(generationResultCss, /\.generation-result-context-summary\s*\{/)
  assert.match(businessIndexSource, /GenerationResultCard/)
  assert.match(businessIndexSource, /GenerationInputRoot/)
  assert.match(businessIndexSource, /GenerationModelSelector/)
  assert.match(businessIndexSource, /GenerationInlineResourceChip/)
  assert.match(jobsPackageSource, /export function JobsPageShell/)
  assert.match(jobsPackageSource, /export function JobCardShell/)
  assert.match(jobsPackageSource, /export function JobDetailPanel/)
  assert.match(jobsPackageSource, /export function JobStatusBadge/)
  assert.match(jobsPackageCss, /\.jobs-page-shell\s*\{/)
  assert.match(jobsPackageCss, /\.job-card\s*\{/)
  assert.match(jobsPackageCss, /\.job-detail-panel\s*\{/)
  assert.match(businessIndexSource, /JobsPageShell/)
  assert.match(businessIndexSource, /JobCardShell/)
  assert.match(resourceCss, /@import "\.\/asset-card\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/creative-reference\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/attachments\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/library-picker\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/media-viewer\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/panel\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/preview-drawer\/styles\.css";/)
  assert.match(resourceCss, /@import "\.\/script-reference\/styles\.css";/)
  assert.match(resourceCss, /\.resource-asset-card\s*\{/)
  assert.match(resourcePanelPackageSource, /export function ResourcePanelShell/)
  assert.match(resourcePanelPackageSource, /export const ResourceListItemShell/)
  assert.match(resourcePanelPackageCss, /\.resource-panel\s*\{/)
  assert.match(businessIndexSource, /ResourcePanelShell/)
  assert.match(resourceAttachmentsPackageSource, /export function ResourceAttachmentRoot/)
  assert.match(resourceAttachmentsPackageSource, /export function ResourceAttachmentTile/)
  assert.match(resourceAttachmentsPackageSource, /ResourceAttachmentActionTile/)
  assert.match(resourceAttachmentsPackageCss, /\.resource-attachments\s*\{/)
  assert.match(resourceAttachmentsPackageCss, /\.resource-attachment-tile\s*\{/)
  assert.match(resourceAttachmentsPackageCss, /\.resource-attachment-action-tile\s*\{/)
  assert.match(creativeReferenceCss, /\.creative-reference-card\s*\{/)
  assert.match(resourceLibraryPickerCss, /\.resource-library-picker\s*\{/)
  assert.match(scriptReferenceCss, /\.resource-script-reference-panel\s*\{/)
  assert.match(creativeReferenceCardSource, /export function CreativeReferenceCard/)
  assert.match(resourceLibraryPickerSource, /export function ResourceLibraryPickerPanel/)
  assert.match(resourceMediaViewerSource, /export function ResourceMediaDialog/)
  assert.match(resourceMediaViewerSource, /export function ResourceMediaThumb/)
  assert.match(resourceMediaViewerSource, /export function ResourceMediaTextPreviewPanel/)
  assert.match(resourceMediaViewerCss, /\.resource-media-dialog\s*\{/)
  assert.match(resourceMediaViewerCss, /\.resource-media-thumb\s*\{/)
  assert.match(resourceMediaViewerCss, /\.resource-media-stage\s*\{/)
  assert.match(resourcePreviewDrawerSource, /export function ResourcePreviewDrawerShell/)
  assert.match(resourcePreviewDrawerSource, /export function ResourcePreviewMissingAssets/)
  assert.match(resourcePreviewDrawerSource, /export function ResourcePreviewTreeNode/)
  assert.match(resourcePreviewDrawerSource, /export function ResourcePreviewStoryFrame/)
  assert.match(resourcePreviewDrawerSource, /\bAppMediaFrame\b/)
  assert.match(resourcePreviewDrawerSource, /\bWorkbenchSurfaceItem\b/)
  assert.match(resourcePreviewDrawerCss, /\.resource-preview-drawer\s*\{/)
  assert.match(resourcePreviewDrawerCss, /\.resource-preview-story-frame\s*\{/)
  assert.match(scriptReferenceSource, /export function ResourceScriptReferencePanel/)
  assert.match(businessIndexSource, /CreativeReferenceCard/)
  assert.match(businessIndexSource, /ResourceAttachmentRoot/)
  assert.match(businessIndexSource, /ResourceLibraryPickerPanel/)
  assert.match(businessIndexSource, /ResourceMediaDialog/)
  assert.match(businessIndexSource, /ResourcePreviewMissingAssets/)
  assert.match(businessIndexSource, /ResourcePreviewDrawerShell/)
  assert.match(businessIndexSource, /ResourceScriptReferencePanel/)
  assert.doesNotMatch(uiCss, /\.resource-asset-card\s*\{/)
  assert.match(toolsSource, /export \{ ToolHeader, type ToolHeaderProps \} from "\.\/header"/)
  assert.match(toolsSource, /ToolPageFrame/)
  assert.match(toolsSource, /from "\.\/workspace"/)
  assert.match(toolsHeaderSource, /data-testid="tool-header"/)
  assert.match(toolsCss, /@import "\.\/header\/styles\.css";/)
  assert.match(toolsCss, /@import "\.\/workspace\/styles\.css";/)
  assert.match(toolsHeaderCss, /\.tool-header\s*\{/)
  assert.match(toolsWorkspaceSource, /export function ToolPageFrame/)
  assert.match(toolsWorkspaceSource, /export function ToolPanel/)
  assert.match(toolsWorkspaceSource, /ToolPanel[\s\S]*?<Surface[\s\S]*?as="section"[\s\S]*?emphasis="raised"[\s\S]*?className=\{cn\("tool-panel"/)
  assert.match(toolsWorkspaceSource, /export function ToolResourceTile/)
  assert.match(toolsWorkspaceSource, /ToolResourceRemoveButton/)
  assert.match(toolsWorkspaceSource, /ToolHiddenFileInput/)
  assert.match(toolsWorkspaceSource, /ToolOutputPanel/)
  assert.match(toolsWorkspaceCss, /\.tool-page-frame\s*\{/)
  assert.match(toolsWorkspaceCss, /\.tool-panel\s*\{/)
  assert.doesNotMatch(toolsWorkspaceCss, /\.tool-panel\s*\{[^}]*--ui-surface-/)
  assert.match(toolsWorkspaceCss, /\.tool-resource-tile\s*\{/)
  assert.match(toolsWorkspaceCss, /\.tool-output-stage\s*\{/)
  assert.match(businessIndexSource, /ToolHeader/)
  assert.match(businessIndexSource, /ToolPageFrame/)
  assert.doesNotMatch(uiCss, /\.tool-header\s*\{/)
  assert.doesNotMatch(uiCss, /\.tool-page-frame\s*\{/)
  assert.match(scriptsPackageSource, /from "\.\/detail-header"/)
  assert.match(scriptsPackageSource, /from "\.\/tabs"/)
  assert.match(scriptsPackageSource, /from "\.\/library"/)
  assert.match(scriptsPackageSource, /from "\.\/version"/)
  assert.match(scriptsPackageCss, /@import "\.\/detail-header\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/tabs\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/library\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/version\/styles\.css";/)
  assert.match(scriptsDetailHeaderSource, /export function ScriptDetailHeader/)
  assert.match(scriptsTabsSource, /export function ScriptDetailTabs/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryRail/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryGroup/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryItem/)
  assert.match(scriptsVersionSource, /export function ScriptVersionCard/)
  assert.match(scriptsDetailHeaderCss, /\.script-detail-header\s*\{/)
  assert.match(scriptsTabsCss, /\.script-detail-tabs\s*\{/)
  assert.match(scriptsLibraryCss, /\.script-library-rail\s*\{/)
  assert.match(scriptsLibraryCss, /\.script-library-item\s*\{/)
  assert.match(scriptsVersionCss, /\.script-version-card\s*\{/)
  assert.match(businessIndexSource, /ScriptDetailHeader/)
  assert.match(businessIndexSource, /ScriptDetailTabs/)
  assert.match(businessIndexSource, /ScriptLibraryRail/)
  assert.match(businessIndexSource, /ScriptVersionCard/)
  assert.doesNotMatch(uiCss, /\.script-detail-header\s*\{/)
  assert.doesNotMatch(uiCss, /\.script-detail-tabs\s*\{/)
  assert.doesNotMatch(uiCss, /\.script-library-rail\s*\{/)
  assert.doesNotMatch(uiCss, /\.script-version-card\s*\{/)
  assert.match(workbenchCss, /@import "\.\/foundation\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/section\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/list\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/card\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/data-display\/styles\.css";/)
  assert.doesNotMatch(workbenchCss, /preparation\/styles\.css/)
  assert.match(workbenchCss, /@import "\.\/chrome\/styles\.css";/)
  assert.match(workbenchCss, /@import "\.\/scene-preview\/styles\.css";/)
  assert.match(workbenchIndexSource, /export \{ WorkbenchPanel \} from "\.\/panel"/)
  assert.match(workbenchIndexSource, /WorkbenchAppShell/)
  assert.match(workbenchIndexSource, /WorkbenchAppTabBar/)
  assert.match(workbenchIndexSource, /WorkbenchAppTabButton/)
  assert.match(workbenchIndexSource, /WorkbenchProjectShell/)
  assert.doesNotMatch(workbenchIndexSource, /WorkbenchPreparation/)
  assert.match(workbenchIndexSource, /WorkbenchScenePreviewPanel/)
  assert.match(workbenchIndexSource, /workbenchStatusLabel/)
  assert.match(businessIndexSource, /WorkbenchPanel/)
  assert.match(businessIndexSource, /WorkbenchAppShell/)
  assert.match(businessIndexSource, /WorkbenchAppTabButton/)
  assert.match(businessIndexSource, /WorkbenchProjectShell/)
  assert.doesNotMatch(businessIndexSource, /WorkbenchPreparation/)
  assert.match(businessIndexSource, /WorkbenchScenePreviewPanel/)
  assert.match(workbenchPanelSource, /<WorkbenchSection/)
  assert.match(workbenchStatusSource, /export function workbenchStatusIntent/)
  assert.match(workbenchStatusSource, /export function workbenchPriorityIntent/)
  assert.match(workbenchStatusSource, /export function workbenchDecisionIntent/)
  assert.match(workbenchTypesSource, /state\?: "note" \| "attention" \| "positive"/)
  assert.match(workbenchStatusSource, /workbenchDecisionIntent\(state\?: WorkbenchDecisionRow\["state"\]\)/)
  assert.match(workbenchChromeSource, /workbenchDecisionIntent\(row\.state\)/)
  assert.match(workbenchChromeSource, /row\.state === "attention"/)
  assert.match(workbenchChromeSource, /row\.state === "positive"/)
  assert.doesNotMatch(workbenchTypesSource, /tone\?: "default" \| "info" \| "success" \| "warning"/)
  assert.doesNotMatch(workbenchStatusSource, /WorkbenchDecisionRow\["tone"\]/)
  assert.doesNotMatch(workbenchChromeSource, /\brow\.tone\b/)
  assert.doesNotMatch(workbenchStatusSource, /\bSemanticTone\b/)
  assert.doesNotMatch(workbenchStatusSource, /export function workbench(?:ScenarioStatus|ScenarioPriority|Decision)Tone/)
  assert.match(workbenchChromeSource, /export function WorkbenchProjectShell/)
  assert.match(workbenchChromeSource, /export function WorkbenchMetricStrip/)
  assert.match(workbenchChromeSource, /export function WorkbenchGateChecklist/)
  assert.match(workbenchChromeSource, /workbenchStatusIntent/)
  assert.match(workbenchChromeSource, /workbenchPriorityIntent/)
  assert.match(workbenchChromeSource, /workbenchDecisionIntent/)
  assert.match(workbenchChromeSource, /function gateActionIntent/)
  assert.doesNotMatch(workbenchChromeSource, /workbench(?:ScenarioStatus|ScenarioPriority|Decision)Tone/)
  assert.doesNotMatch(workbenchChromeSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(workbenchChromeSource, /<WorkbenchStatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(workbenchChromeSource, /function statusTone/)
  assert.doesNotMatch(workbenchChromeSource, /function priorityTone/)
  assert.match(workbenchScenePreviewSource, /export function WorkbenchScenePreviewPanel/)
  assert.match(workbenchScenePreviewSource, /WorkbenchThumbnail/)
  assert.match(workbenchScenePreviewSource, /content-workbench-scene-preview/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/project-shell\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/app-shell\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/queue\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/decision\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/metric-strip\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/context\/styles\.css";/)
  assert.match(readProjectFile('packages/ui/src/components/business/workbench/chrome/styles.css'), /@import "\.\/gate\/styles\.css";/)
  assert.match(workbenchChromeCss, /\.workbench-project-shell\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-app-shell\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-app-tab-bar\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-app-tab-button\s*\{/)
  assert.match(workbenchChromeCss, /\.workbench-metric-strip\s*\{/)
  assert.match(workbenchScenePreviewCss, /\.workbench-scene-preview-panel\s*\{/)
  assert.match(workbenchCardCss, /\.workbench-summary-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.workbench-summary-card\s*\{/)
  assert.match(agentCssEntry, /@import "\.\/panel\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/page\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/shell\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/thread\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/context\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/run\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/work\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/composer\/styles\.css";/)
  assert.match(agentCssEntry, /@import "\.\/responsive\/styles\.css";/)
  assert.match(agentCss, /\.ai-agent-panel-card\s*\{/)
  assert.doesNotMatch(uiCss, /\.ai-agent-panel-card\s*\{/)
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

  for (const helper of ['runStatusBadge', 'draftStatusBadge', 'stateBadge', 'priorityBadge', 'BadgeSemanticProps']) {
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

test('review proposal components expose business semantics instead of review tones', () => {
  const reviewProposalDraftSource = readProjectFile('packages/ui/src/components/business/review/proposal/draft/index.tsx')
  const reviewProposalUpstreamSource = readProjectFile('packages/ui/src/components/business/review/proposal/upstream/index.tsx')
  const reviewProposalIndexSource = readProjectFile('packages/ui/src/components/business/review/proposal/index.tsx')
  const preProductionReviewSource = readProjectFile('apps/frontend/src/features/pre-production/components/proposals/PreProductionProposalReviewPanel.tsx')
  const preProductionReviewDomainSource = readProjectFile('apps/frontend/src/features/pre-production/domain/preProductionProposalReview.ts')
  const projectStandardsReviewSource = readProjectFile('apps/frontend/src/features/project-standards/components/proposals/ProjectStandardsProposalReviewPanel.tsx')
  const productionUpstreamReviewSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionUpstreamProposalReviewSummary.tsx')

  assert.match(reviewProposalDraftSource, /export type ReviewProposalFieldDiffChange = "added" \| "deleted" \| "modified" \| "unchanged"/)
  assert.match(reviewProposalUpstreamSource, /export type ReviewProposalUpstreamImpact = "neutral" \| "destructive"/)
  assert.match(reviewProposalIndexSource, /type ReviewProposalFieldDiffChange/)
  assert.match(reviewProposalIndexSource, /type ReviewProposalUpstreamImpact/)
  assert.doesNotMatch(reviewProposalDraftSource, /\bReviewTone\b/)
  assert.doesNotMatch(reviewProposalUpstreamSource, /\bReviewTone\b/)
  assert.doesNotMatch(reviewProposalDraftSource, /\btone\?: ReviewTone/)
  assert.doesNotMatch(reviewProposalUpstreamSource, /\btone\?: ReviewTone/)
  assert.doesNotMatch(reviewProposalUpstreamSource, /\btone\?:/)
  assert.doesNotMatch(`${preProductionReviewSource}\n${projectStandardsReviewSource}`, /<ReviewProposalFieldDiffRow\b[\s\S]{0,240}\btone=/)
  assert.doesNotMatch(`${preProductionReviewSource}\n${projectStandardsReviewSource}`, /<ReviewProposalSummaryCallout\b[\s\S]{0,240}\btone=/)
  assert.doesNotMatch(preProductionReviewDomainSource, /\bPreProductionProposalDiffRow[\s\S]{0,180}\btone\b/)
  assert.doesNotMatch(preProductionReviewSource, /\brow\.tone\b/)
  assert.doesNotMatch(productionUpstreamReviewSource, /\btone:\s*['"](?:danger|warning|success|info|neutral)['"]/)
  assert.match(preProductionReviewSource, /<ReviewProposalFieldDiffRow\b[\s\S]*?\bchange=/)
  assert.match(projectStandardsReviewSource, /<ReviewProposalFieldDiffRow\b[\s\S]*?\bchange=/)
  assert.match(productionUpstreamReviewSource, /\bimpact:\s*'destructive'/)
})

test('desktop consumes migrated app and workbench primitives through @movscript/ui', () => {
  const removedAppPrimitives = [
    'apps/frontend/src/components/app/AppPage.tsx',
    'apps/frontend/src/components/app/SemanticStatusBadge.tsx',
    'apps/frontend/src/components/app/semantic.ts',
    'apps/frontend/src/components/creative/CreativeReferenceCard.tsx',
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
  const scriptsPageSource = readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPage.tsx')
  const canvasListSource = readProjectFile('apps/frontend/src/features/canvas/components/CanvasListPage.tsx')

  assert.doesNotMatch(frontendSources, /@\/components\/app\/AppPage/)
  assert.doesNotMatch(frontendSources, /@\/components\/app\/SemanticStatusBadge/)
  assert.doesNotMatch(frontendSources, /@\/components\/app\/semantic/)
  assert.doesNotMatch(frontendSources, /@\/components\/creative\/CreativeReferenceCard/)
  assert.doesNotMatch(frontendSources, /@\/components\/entity\/SemanticEntityThumbCard/)
  assert.doesNotMatch(frontendSources, /@\/components\/shared\/CreateDialog/)
  assert.doesNotMatch(frontendSources, /@\/components\/workbench\/WorkbenchPrimitives/)
  assert.doesNotMatch(frontendSources, /@\/components\/workbench\/WorkbenchPanel/)
  assert.doesNotMatch(frontendSources, /from ['"]\.\/WorkbenchPanel['"]/)
  assert.match(businessIndexSource, /\bAppAvatar\b/)
  assert.match(businessIndexSource, /\bAppCreateDialog\b/)
  assert.match(businessIndexSource, /\bAppMarkerDot\b/)
  assert.match(businessIndexSource, /\bAppPager\b/)
  assert.match(businessIndexSource, /\bAppProgressBar\b/)
  assert.match(businessIndexSource, /\bAppToastShell\b/)
  assert.match(appBusinessSource, /export function AppAvatar/)
  assert.match(appBusinessSource, /export function AppCreateDialog/)
  assert.match(appBusinessSource, /export function AppMarkerDot/)
  assert.match(appBusinessSource, /export function AppPager/)
  assert.match(appBusinessSource, /export function AppProgressBar/)
  assert.match(appBusinessSource, /export function AppToastShell/)
  assert.match(scriptsPageSource, /\bScriptCreateDialog\b/)
  assert.match(scriptsPageSource, /\bScriptReadinessPanel\b/)
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
  const uiBusinessAppCss = readAppCss()
  const uiAgentCss = readAgentCss()
  const uiAgentChatCss = readAgentChatCss()
  const uiCanvasCss = readProjectFile('packages/ui/src/components/business/canvas/styles.css')
  const uiCanvasCardCss = readProjectFile('packages/ui/src/components/business/canvas/card/styles.css')
  const uiCanvasFlowCss = readProjectFile('packages/ui/src/components/business/canvas/flow/styles.css')
  const uiDetailCss = readDetailCss()
  const uiResourceCss = readProjectFile('packages/ui/src/components/business/resource/styles.css')
  const uiWorkbenchCss = readProjectFile('packages/ui/src/components/business/workbench/styles.css')
  const uiWorkbenchFoundationCss = readProjectFile('packages/ui/src/components/business/workbench/foundation/styles.css')
  const uiWorkbenchSectionCss = readProjectFile('packages/ui/src/components/business/workbench/section/styles.css')
  const uiWorkbenchListCss = readProjectFile('packages/ui/src/components/business/workbench/list/styles.css')
  const uiWorkbenchCardCss = readWorkbenchCardCss()
  const uiWorkbenchDataDisplayCss = readProjectFile('packages/ui/src/components/business/workbench/data-display/styles.css')
  const uiOwnedCss = [
    uiCss,
    primitiveCss,
    uiLayoutCss,
    uiAppShellLayoutCss,
    uiAppShellWindowCss,
    uiAppShellSidebarCss,
    uiWorkspaceLayoutCss,
    uiBusinessAppCss,
    uiAgentCss,
    uiAgentChatCss,
    uiCanvasCss,
    uiCanvasCardCss,
    uiCanvasFlowCss,
    uiDetailCss,
    uiResourceCss,
    uiWorkbenchCss,
    uiWorkbenchFoundationCss,
    uiWorkbenchSectionCss,
    uiWorkbenchListCss,
    uiWorkbenchCardCss,
    uiWorkbenchDataDisplayCss,
  ].join('\n')

  for (const selector of [
    'app-page',
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
    'app-dashboard-region',
    'app-dashboard-entry',
    'app-dashboard-lane',
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
    'canvas-flow',
    'workbench-section',
    'workbench-list',
    'workbench-entity-card',
    'workbench-summary-card',
    'workbench-thumbnail',
    'workbench-status-badge',
    'workbench-metric',
    'workbench-key-value',
    'workbench-empty-state',
    'projects-region',
    'projects-list-row',
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
    'app-content-frame--plain',
    'asset-prep-workbench',
    'asset-prep-layout',
    'asset-prep-side',
    'asset-prep-workspace',
    'production-workbench',
    'production-layout',
    'production-side',
    'production-context-stack',
    'production-candidate-row',
    'script-workbench-shell',
    'script-workbench-frame',
    'script-workbench-topbar',
    'script-workbench-layout',
    'script-workbench-rail',
    'script-workbench-inspector',
  ]) {
    assert.match(uiOwnedCss, cssClassSelectorPattern(selector), `${selector} styles must live in @movscript/ui`)
    assert.doesNotMatch(appCss, new RegExp(`^\\.${selector}\\s*\\{`, 'm'), `${selector} must not be redefined as a desktop-owned base selector`)
  }
})

test('app and workbench package primitives share internal base style classes', () => {
  const appSource = readAppSource()
  const layoutSource = readProjectFile('packages/ui/src/components/layout/index.tsx')
  const workbenchPanelSource = readProjectFile('packages/ui/src/components/business/workbench/panel/index.tsx')
  const workbenchSectionSource = readProjectFile('packages/ui/src/components/business/workbench/section/index.tsx')
  const workbenchCardSource = readWorkbenchCardSource()
  const workbenchDataDisplaySource = readProjectFile('packages/ui/src/components/business/workbench/data-display/index.tsx')
  const workbenchSource = `${workbenchPanelSource}\n${workbenchSectionSource}\n${workbenchCardSource}\n${workbenchDataDisplaySource}`
  const reviewSource = readReviewSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const primitiveCss = readPrimitiveCss()
  const primitiveIndexSource = readProjectFile('packages/ui/src/components/primitives/index.ts')
  const keyValueSource = readProjectFile('packages/ui/src/components/primitives/key-value.tsx')
  const metricCardSource = readProjectFile('packages/ui/src/components/primitives/metric-card.tsx')
  const emptyStateSource = readProjectFile('packages/ui/src/components/primitives/empty-state.tsx')
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
  assert.match(primitiveCss, /\.ms-stat-card__icon\s*\{[\s\S]*border-radius:\s*var\(--ms-radius-sm\)/)
  assert.match(emptyStateSource, /export const EmptyState/)
  assert.match(emptyStateSource, /className=\{cn\("ms-empty-state"/)
  assert.match(emptyStateSource, /emphasis="unframed"/)
  assert.match(appSource, /AppMetricCard[\s\S]*?<MetricCard/)
  assert.match(appSource, /AppEmptyState[\s\S]*?<EmptyState/)
  assert.match(businessAppCss, /\.app-state-message,\n\.app-text-empty-state\s*\{[\s\S]*border-radius:\s*var\(--ms-radius-sm\)/)
  assert.match(businessAppCss, /\.app-inline-error\s*\{[\s\S]*border-radius:\s*var\(--ms-radius-sm\)/)
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
  assert.match(appSource, /export function AppSurfaceItem/)
  assert.match(appSource, /AppSurfaceItem[\s\S]*?asChild = false/)
  assert.match(appSource, /AppSurfaceItem[\s\S]*?<Surface[\s\S]*?asChild=\{asChild\}/)
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
  assert.match(appSource, /export function AppWaveformBars/)
  assert.match(appSource, /AppWaveformBars[\s\S]*?app-waveform-bars__bar/)
  assert.match(appSource, /export function AppMarkerDot/)
  assert.match(appSource, /AppMarkerDot[\s\S]*?accentDotClass\(accent\)[\s\S]*?toneDotClass\(semanticTone\)/)
  assert.match(appSource, /export function AppAvatar/)
  assert.match(appSource, /AppAvatar[\s\S]*?<Avatar[\s\S]*?data-size=\{size\}[\s\S]*?<AvatarFallback>\{fallbackText\}<\/AvatarFallback>/)
  assert.match(appSource, /export function AppInlineMeta/)
  assert.match(appSource, /AppInlineMeta[\s\S]*?asChild = false/)
  assert.match(appSource, /export function AppDisclosure/)
  assert.match(appSource, /AppDisclosure[\s\S]*?<Surface[\s\S]*?as="details"[\s\S]*?className=\{cn\("app-disclosure"/)
  assert.match(businessAppCss, /\.app-surface-item\s*\{/)
  assert.match(businessAppCss, /\.app-choice-tile\s*\{/)
  assert.match(businessAppCss, /\.app-window-icon-button\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\[data-variant="stage-dark"\]\s*\{/)
  assert.match(businessAppCss, /\.app-media-frame\[data-variant="placeholder"\]\s*\{/)
  assert.match(businessAppCss, /\.app-progress-bar\s*\{/)
  assert.match(businessAppCss, /\.app-progress-bar\[data-tone="danger"\]\s*\{/)
  assert.match(businessAppCss, /\.app-progress-bar\[data-indeterminate="true"\] \.app-progress-bar__fill\s*\{/)
  assert.match(businessAppCss, /\.app-range-track\s*\{/)
  assert.match(businessAppCss, /\.app-range-track__selection\s*\{/)
  assert.match(businessAppCss, /\.app-waveform-bars\s*\{/)
  assert.match(businessAppCss, /\.app-waveform-bars__bar\s*\{/)
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
  assert.match(reviewSource, /ms-surface__heading ms-review-callout__header/)
  assert.match(workbenchSectionSource, /WorkbenchSection[\s\S]*?<Surface[\s\S]*?as="section"[\s\S]*?className=\{cn\("workbench-section"/)
})

test('dashboard package styles have exported component owners', () => {
  const appSource = readAppSource()
  const overviewSource = readProjectFile('apps/frontend/src/features/project/components/ProjectOverviewPage.tsx')
  const projectSemanticUiSource = readProjectFile('apps/frontend/src/features/project/presentation/projectSemanticUi.ts')
  const dashboardCss = readAppDashboardCss()

  for (const exportName of [
    'AppDashboardHeroGrid',
    'AppDashboardSplit',
    'AppDashboardRegion',
    'AppDashboardSection',
    'AppDashboardSectionHeader',
    'AppDashboardMetric',
    'AppDashboardPipelineStep',
    'AppDashboardEntry',
    'AppDashboardLane',
    'AppDashboardDividerBlock',
    'AppDashboardLaneSummary',
    'AppDashboardMetaCell',
  ]) {
    assert.match(appSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must own dashboard package styles`)
    assert.match(overviewSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed instead of raw app-dashboard classes`)
  }

  assert.match(dashboardCss, /\.app-dashboard-entry\s*\{/)
  assert.match(dashboardCss, /\.app-dashboard-lane\s*\{/)
  for (const recipeName of ['projectLaneStateRecipe', 'projectPriorityRecipe', 'projectBlockedSummaryRecipe', 'projectReadinessRecipe']) {
    assert.match(projectSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be project semantic UI-owned`)
    assert.match(overviewSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by project overview`)
  }
  assert.doesNotMatch(overviewSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(overviewSource, /className="app-dashboard-/)
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
  assert.match(workbenchSource, /<Surface[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-list-item"/)
  assert.match(workbenchSource, /<Surface[\s\S]*?tone="brand"[\s\S]*?interaction=\{active \? "selected" : "selectable"\}/)
  assert.match(primitiveCss, /\[data-kind="item"\]\[data-emphasis="plain"\]\s*\{[\s\S]*--ui-surface-background:\s*var\(--ms-color-background\)/)
  assert.doesNotMatch(workbenchListCss, /\.ms-workbench-selectable\s*\{[^}]*--ui-surface-background/)
  assert.doesNotMatch(workbenchListCss, /\.ms-workbench-selectable:hover\s*\{[\s\S]*--ui-surface-/)
  assert.doesNotMatch(workbenchListCss, /\.ms-workbench-selectable\[data-active="true"\]\s*\{[\s\S]*--ui-surface-/)
  assert.match(workbenchIndexSource, /WorkbenchSurfaceItem/)
  assert.match(workbenchListSource, /export function WorkbenchSurfaceItem/)
  assert.match(workbenchSource, /WorkbenchSurfaceItem[\s\S]*?<Surface[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-list-item"/)
  assert.match(workbenchSource, /<Surface[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-entity-card"/)
  assert.match(workbenchSource, /ms-workbench-row workbench-entity-card__row/)
  assert.match(workbenchSource, /workbench-entity-card__row[\s\S]*?workbench-entity-card__content[\s\S]*?\{children\}/)
  assert.match(workbenchCardCss, /\.workbench-entity-card\s*\{[\s\S]*flex-direction:\s*column/)
  assert.match(workbenchCardCss, /\.workbench-entity-card__row\s*\{[\s\S]*align-items:\s*stretch/)
  assert.match(workbenchIndexSource, /WorkbenchSummaryCard/)
  assert.match(workbenchCardSource, /export function WorkbenchSummaryCard/)
  assert.match(workbenchSource, /<Surface[\s\S]*?className=\{cn\("ms-workbench-selectable workbench-summary-card"/)
  assert.match(workbenchSource, /ms-workbench-row workbench-summary-card__header/)
  assert.match(workbenchCardCss, /\.workbench-summary-card\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__body\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__preview-stack\s*\{[\s\S]*width:\s*100%/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__preview-row\s*\{[\s\S]*display:\s*grid/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__preview-list\s*\{[\s\S]*display:\s*flex/)
  assert.match(workbenchCardCss, /\.workbench-summary-card__status-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
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
  assert.match(workbenchCardSource, /StatusBadge/)
  assert.doesNotMatch(`${reviewSource}\n${workbenchCardSource}`, /semanticToneClass\([^\n)]*['"]badge['"]/)
  assert.doesNotMatch(`${reviewSource}\n${workbenchCardSource}`, /<StatusBadge\b[^\n>]*\btone=/)
  assert.match(reviewSource, /ms-review-stat/)
  assert.match(reviewSource, /ms-review-decision-badge/)
  assert.match(reviewSource, /ms-inline-badge ms-inline-badge--center ms-change-action-badge/)
  assert.match(workbenchCardSource, /ms-inline-badge--center ms-inline-badge--truncate workbench-status-badge/)
  assert.match(reviewCss, /\.ms-review-callout\s*\{/)
  assert.match(reviewCss, /\.ms-change-action-row\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-review-callout\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-change-action-row\s*\{/)
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
  const dialogSource = readProjectFile('packages/ui/src/components/primitives/dialog.tsx')
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')

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
  const agentSource = readAgentSource()
  const activityFeedSource = readAgentActivityFeedSource()
  const diagnosticSource = readAgentDiagnosticSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()

  for (const componentClass of ['ms-agent-metric', 'ms-agent-run-field', 'ms-agent-tool-step', 'ms-agent-data-block']) {
    assert.match(agentSource, new RegExp(`ms-agent-field ${componentClass}`), `${componentClass} must share ms-agent-field`)
  }
  assert.match(agentSource, /export const AgentDataBlock/)
  assert.match(agentSource, /AgentDataBlockProps[\s\S]*?asChild\?: boolean/)
  assert.match(agentSource, /if \(asChild\) \{[\s\S]*?<AsChildSlot/)
  assert.match(activityFeedSource, /AgentActivityCodePanel[\s\S]*?<AgentDataBlock className="ms-agent-activity-code-panel__body"/)
  assert.match(diagnosticSource, /AgentDiagnosticSummaryItem[\s\S]*?<AgentDataBlock className=\{cn\("ms-agent-diagnostic-summary-item"/)
  assert.doesNotMatch(activityFeedSource, /ms-agent-field ms-agent-data-block/)
  assert.doesNotMatch(diagnosticSource, /ms-agent-field ms-agent-data-block/)
  assert.match(agentCss, /\.ms-agent-field\s*\{/)
  assert.match(agentCss, /\.ms-agent-data-block\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-field\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-data-block\s*\{/)
})

test('agent surface blocks own reusable shell and row styling', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()
  const agentConsoleSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')
  const agentConsolePackageSource = readProjectFile('packages/ui/src/components/business/agent/console/index.tsx')
  const agentRunsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentRunsPage.tsx')
  const agentRunsPackageSource = readProjectFile('packages/ui/src/components/business/agent/run/list/index.tsx')
  const agentPerformanceSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx')
  const agentPerformancePackageSource = readProjectFile('packages/ui/src/components/business/agent/performance/index.tsx')
  const aiDraftsSource = readProjectFile('apps/frontend/src/features/agent/components/AIDraftsPage.tsx')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  const agentSettingsUiSource = readProjectFile('packages/ui/src/components/business/agent/settings/index.tsx')
  const agentRunSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentRunPage.tsx')
  const agentRunCardPackageSource = readProjectFile('packages/ui/src/components/business/agent/run/card/index.tsx')
  const agentBrowserSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx')
  const pinnedStatusShelfSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
  const agentResultSurfaceSources = [
    'apps/frontend/src/features/agent/components/AgentDraftResultCards.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanOverviewPanel.tsx',
    'apps/frontend/src/features/agent/components/GeneratedResultCard.tsx',
    'apps/frontend/src/features/agent/components/ContextDiagnosticCard.tsx',
    'apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx',
    'apps/frontend/src/features/agent/components/AgentMentionEditor.tsx',
    'apps/frontend/src/features/agent/components/AgentMessageContent.tsx',
    'apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx',
    'apps/frontend/src/features/agent/components/AgentComposerSection.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const sources = `${agentConsoleSource}\n${agentRunsSource}\n${agentPerformanceSource}\n${aiDraftsSource}\n${agentRunSource}`
  const agentSettingsOwnershipSource = `${agentSettingsSource}\n${agentSettingsUiSource}`
  const migratedSettingsSurfaceIds = [
    'agent-run-preset-effective-policy',
    'agent-settings-skill-governance',
    'agent-settings-tool-policy-filters',
    'agent-settings-tool-policy-filter-presets',
    'agent-settings-tool-policy-bulk-actions',
    'agent-settings-snapshot-import-scopes',
    'agent-settings-snapshot-impact',
    'agent-settings-tool-policy-diff',
    'agent-settings-model-compatibility-probes',
    'agent-settings-api-mode-migration-guide',
    'agent-settings-api-mode-switch-taskGraph',
  ]

  assert.match(agentSource, /export const AgentSurfaceBlock/)
  assert.match(agentSource, /AgentSurfaceBlockProps[\s\S]*?asChild\?: boolean/)
  assert.match(agentSource, /export const AgentComposerDropOverlay/)
  assert.match(agentSource, /ms-agent-frame ms-agent-surface-block/)
  assert.match(agentSource, /emphasis=\{variant === "card" \? "raised" : variant === "subtle" \? "muted" : "plain"\}/)
  assert.match(agentSource, /export const AgentInlineEmpty/)
  assert.match(agentCss, /\.ms-agent-frame\s*\{[\s\S]*--ui-surface-border:\s*color-mix\(in srgb, var\(--ms-color-border\) 78%, transparent\)/)
  assert.match(agentCss, /\.ms-agent-surface-block\s*\{/)
  assert.doesNotMatch(agentCss, /\.ms-agent-surface-block(?:--(?:subtle|card))?\s*\{[^}]*--ui-surface-/)
  assert.match(agentCss, /\.ms-agent-composer__drop-overlay\s*\{/)
  assert.match(agentCss, /\.ms-agent-inline-empty\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-surface-block\s*\{/)
  assert.doesNotMatch(uiCss, /\.ms-agent-surface-block--subtle\s*\{/)
  assert.match(sources, /AgentSurfaceBlock/)
  assert.match(aiDraftsSource, /AppCodeBlock/)
  assert.match(agentRunsSource, /\bAgentRunsSearchInput\b/)
  assert.match(agentRunsSource, /\bAgentRunsFilterButton\b/)
  assert.match(agentRunsSource, /RUN_FILTERS\.map[\s\S]*?<AgentRunsFilterButton[\s\S]*?active=\{filter === item\.value\}/)
  assert.match(agentRunsPackageSource, /function AgentRunsSearchInput[\s\S]*?<Input/, 'agent runs search wrapper must own primitive input')
  assert.match(agentRunsPackageSource, /function AgentRunsFilterButton[\s\S]*?<Button/, 'agent runs filter wrapper must own primitive button')
  assert.match(agentRunsPackageSource, /function AgentRunsPanel[\s\S]*?<AgentSurfaceBlock/, 'agent runs panel wrapper must own surface block')
  assert.match(agentRunsPackageSource, /function AgentRunsRecordItem[\s\S]*?<AgentSurfaceBlock/, 'agent runs record wrapper must own surface block')
  assert.doesNotMatch(agentRunsSource, /\b(?:Input|Button|AgentSurfaceBlock)\b/)
  assert.match(agentRunsSource, /function RunMetric[\s\S]*?<AgentRunMetricCard/)
  assert.match(agentRunCardPackageSource, /function agentRunMetricTone[\s\S]*?if \(state === "ready"\) return "success"/)
  assert.match(agentRunCardPackageSource, /function AgentRunMetricCard[\s\S]*?<AgentRunToneSurfaceBlock[\s\S]*?variant="card"/)
  assert.match(agentRunCardPackageSource, /function AgentRunMetricCard[\s\S]*?<AgentRunToneText/)
  assert.doesNotMatch(agentRunsSource, /\b(?:toneTextClass|toneSurfaceClass)\b/)
  assert.match(agentConsoleSource, /function LocalToolCard[\s\S]*?<AgentConsoleLocalToolCard[\s\S]*?invalid=\{invalid\}/)
  assert.match(agentConsoleSource, /function ConsoleMetricCard[\s\S]*?<AgentConsoleMetricCard/)
  assert.match(agentConsolePackageSource, /function AgentConsoleLocalToolCard[\s\S]*?<AgentConsoleToneSurfaceBlock[\s\S]*?tone=\{invalid \? "danger" : undefined\}/)
  assert.match(agentConsolePackageSource, /AgentConsoleToneSurfaceBlock[\s\S]*?toneSurfaceClass\(tone\)/)
  assert.match(agentConsolePackageSource, /AgentConsoleMetricCard[\s\S]*?tone === "action" \? XCircle/)
  assert.match(agentPerformanceSource, /operations\.map\(\(operation\)[\s\S]*?<AgentPerformanceOperationButton[\s\S]*?key=\{operation\.id\}[\s\S]*?onClick=\{\(\) => setSelectedOperationId\(operation\.id\)\}/)
  assert.match(agentPerformanceSource, /<AgentPerformanceMetricTable\b/)
  assert.match(agentPerformancePackageSource, /function AgentPerformanceMetricTable[\s\S]*?<AgentSurfaceBlock className="agent-performance-metric-table">[\s\S]*?<table/)
  assert.match(agentPerformanceSource, /operation\.phases\.slice\(-4\)\.map[\s\S]*?<AgentPerformancePhaseStat key=\{`\$\{operation\.id\}:\$\{phase\.name\}:\$\{phase\.offsetMs\}`\}/)
  assert.match(agentPerformancePackageSource, /function AgentPerformancePhaseStat[\s\S]*?<AgentDataBlock className="agent-performance-phase-stat">/)
  assert.match(agentPerformanceSource, /points\.slice\(-3\)\.map[\s\S]*?<AgentPerformanceTrendSample key=\{`\$\{point\.label\}-\$\{index\}`\}/)
  assert.match(agentPerformancePackageSource, /function AgentPerformanceTrendSample[\s\S]*?<AgentDataBlock className="agent-performance-trend-sample">/)
  assert.match(agentPerformanceSource, /\bAgentPerformanceProgressBar\b/)
  assert.match(agentPerformanceSource, /row\.failed > 0 \? 'danger' : row\.slow > 0 \? 'warning' : 'brand'/, 'agent performance failed bars must use package danger tone')
  for (const exportName of [
    'AgentPerformanceActionButton',
    'AgentPerformanceBarList',
    'AgentPerformanceBarRow',
    'AgentPerformanceDurationText',
    'AgentPerformanceEmptyState',
    'AgentPerformanceHeader',
    'AgentPerformanceListItem',
    'AgentPerformanceLogItem',
    'AgentPerformanceMetricTable',
    'AgentPerformanceOperationButton',
    'AgentPerformanceOperationButtonContent',
    'AgentPerformancePanel',
    'AgentPerformancePhaseRow',
    'AgentPerformancePhaseStat',
    'AgentPerformanceProgressBar',
    'AgentPerformanceStatCard',
    'AgentPerformanceStatusBadge',
    'AgentPerformanceStorageBar',
    'AgentPerformanceTimelineDetail',
    'AgentPerformanceTrendFrame',
    'AgentPerformanceTrendPoint',
    'AgentPerformanceTrendSample',
    'AgentPerformanceTrendValue',
  ]) {
    assert.match(agentPerformancePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(agentPerformanceSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent performance page`)
  }
  assert.match(agentPerformancePackageSource, /\bAppTextEmptyState\b/)
  assert.match(agentPerformancePackageSource, /\bAppProgressBar\b/)
  assert.match(agentPerformancePackageSource, /\btoneTextClass\b/)
  assert.match(agentPerformancePackageSource, /\btoneSurfaceClass\b/)
  assert.doesNotMatch(agentPerformanceSource, /\b(?:AppTextEmptyState|AppProgressBar|toneTextClass|toneSurfaceClass)\b/)
  assert.match(agentCss, /\.agent-performance-operation-button\s*\{/)
  assert.match(agentCss, /\.agent-performance-panel__header\s*\{/)
  assert.match(agentCss, /\.agent-performance-stat-card\s*\{/)
  assert.match(aiDraftsSource, /\bInput\b/)
  assert.match(aiDraftsSource, /\bAppInlineError\b/)
  assert.match(aiDraftsSource, /drafts\.map\(\(draft\)[\s\S]*?<AgentSurfaceBlock key=\{draft\.id\} asChild variant="subtle"[\s\S]*?<Button/)
  assert.doesNotMatch(aiDraftsSource, /<pre\b/)
  assert.doesNotMatch(agentRunsSource, /<input\b/)
  assert.doesNotMatch(agentRunsSource, /<button\b/)
  assert.doesNotMatch(aiDraftsSource, /<input\b/)
  assert.doesNotMatch(aiDraftsSource, /<button\b/)
  assert.doesNotMatch(agentPerformanceSource, /<button\b/)
  assert.doesNotMatch(agentPerformanceSource, /block w-full rounded-md border px-3 py-2/)
  assert.doesNotMatch(agentPerformanceSource, /overflow-hidden rounded-md border border-border/)
  assert.doesNotMatch(agentPerformanceSource, /rounded bg-muted\/30 px-2 py-1/)
  assert.doesNotMatch(agentPerformanceSource, /rounded-md bg-muted\/30 px-2 py-1\.5/)
  assert.doesNotMatch(agentPerformanceSource, /bg-destructive/)
  assert.doesNotMatch(agentPerformanceSource, /h-2 overflow-hidden rounded-full bg-muted/)
  assert.doesNotMatch(agentPerformanceSource, /bg-current/)
  assert.doesNotMatch(agentRunsSource, /rounded-md border border-input/)
  assert.doesNotMatch(agentRunsSource, /text-destructive/)
  assert.doesNotMatch(aiDraftsSource, /rounded-md border border-input/)
  assert.doesNotMatch(aiDraftsSource, /rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(sources, /rounded-md border border-border bg-(?:background|muted\/10|card)/)
  assert.match(agentResultSurfaceSources, /AgentSurfaceBlock/)
  for (const exportName of [
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
    'AgentBrowserBlankForm',
    'AgentBrowserNavButton',
    'AgentBrowserProjectEmpty',
    'AgentBrowserKeyValue',
    'AgentBrowserDataBlock',
  ]) {
    assert.match(agentSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(agentBrowserSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent browser panel`)
  }
  assert.match(agentSource, /function AgentBrowserTabSurface[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentSource, /function AgentBrowserTabButton[\s\S]*?<Button/)
  assert.match(agentSource, /function AgentBrowserNavButton[\s\S]*?<AppIconFrame/)
  assert.match(agentSource, /function AgentBrowserKeyValue[\s\S]*?<AppKeyValue/)
  assert.match(agentSource, /function AgentBrowserInlineError[\s\S]*?<AppInlineError/)
  assert.match(agentSource, /function AgentBrowserUrlMeta[\s\S]*?<AppInlineMeta/)
  assert.match(agentSource, /function AgentBrowserDataBlock[\s\S]*?<AgentDataBlock/)
  assert.match(agentCss, /\.agent-browser-root\s*\{/)
  assert.match(agentCss, /\.agent-browser-tab-button\s*\{/)
  assert.match(agentCss, /\.agent-browser-project-page\s*\{/)
  assert.match(agentBrowserSource, /tabs\.map\(\(tab\)[\s\S]*?<AgentBrowserTabSurface/)
  assert.match(agentBrowserSource, /navItems\.map\(\(item\)[\s\S]*?<AgentBrowserNavButton/)
  assert.match(agentBrowserSource, /rows\.map\(\(\[label, value\]\)[\s\S]*?<AgentBrowserKeyValue/)
  assert.doesNotMatch(agentBrowserSource, /\b(?:AgentDataBlock|AgentSurfaceBlock|AppIconFrame|AppInlineError|AppInlineMeta|AppKeyValue|Badge|Button|Input|cn)\b/)
  assert.doesNotMatch(agentBrowserSource, /className=/)
  assert.doesNotMatch(agentBrowserSource, /<button\b/)
  assert.doesNotMatch(agentBrowserSource, /rounded-md bg-muted\/60/)
  assert.doesNotMatch(agentBrowserSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(agentBrowserSource, /rounded-md border border-border bg-muted\/20/)
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
    assert.match(agentSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(pinnedStatusShelfSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by pinned status shelf`)
  }
  assert.match(agentSource, /function AgentPinnedStatusTabGroup[\s\S]*?<AppControlGroup/)
  assert.match(agentSource, /function AgentPinnedStatusProgress[\s\S]*?<AppProgressBar/)
  assert.match(agentSource, /function AgentPinnedStatusBadge[\s\S]*?<Badge/)
  assert.match(agentSource, /function AgentPinnedStatusTabButton[\s\S]*?<Button/)
  assert.match(agentSource, /function AgentPinnedStatusEmpty[\s\S]*?<AgentInlineEmpty/)
  assert.match(agentCss, /\.agent-pinned-status-root\s*\{/)
  assert.match(agentCss, /\.agent-pinned-status-tab\s*\{/)
  assert.match(pinnedStatusShelfSource, /<AgentPinnedStatusTabGroup>[\s\S]*?views\.map\(\(view\)/)
  assert.match(pinnedStatusShelfSource, /views\.map\(\(view\)[\s\S]*?<AgentPinnedStatusTabButton[\s\S]*?active=\{activeView === view\.id\}/)
  assert.doesNotMatch(pinnedStatusShelfSource, /\b(?:AgentInlineEmpty|AgentSurfaceBlock|AppControlGroup|AppProgressBar|Badge|Button)\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /className=/)
  assert.doesNotMatch(pinnedStatusShelfSource, /<button\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /rounded-md bg-muted\/60/)
  assert.doesNotMatch(pinnedStatusShelfSource, /h-0\.5 overflow-hidden rounded-full bg-muted/)
  assert.match(agentResultSurfaceSources, /AgentComposerSection[\s\S]*?\bInput\b/)
  assert.match(agentResultSurfaceSources, /AgentComposerSection[\s\S]*?\bAgentComposerDropOverlay\b/)
  assert.match(agentResultSurfaceSources, /<Input[\s\S]*?ref=\{fileRef\}[\s\S]*?type="file"/)
  assert.doesNotMatch(agentResultSurfaceSources, /<input\b/)
  assert.doesNotMatch(agentResultSurfaceSources, /rounded-md border border-dashed border-primary\/40 bg-primary\/8/)
  assert.doesNotMatch(agentConsoleSource, /border-destructive\/40/)
  assert.doesNotMatch(agentConsoleSource, /text-destructive/)
  assert.doesNotMatch(agentRunsSource, /border-destructive\/40/)
  assert.doesNotMatch(pinnedStatusShelfSource, /rounded border border-dashed border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(pinnedStatusShelfSource, /function PinnedEmptyState/)
  assert.doesNotMatch(agentResultSurfaceSources, /rounded-md border border-border bg-background(?:\/70)?/)
  for (const testId of migratedSettingsSurfaceIds) {
    if (testId === 'agent-settings-model-compatibility-probes') {
      assert.match(agentSettingsSource, /<AgentSettingsStatusPanel[\s\S]*?testId="agent-settings-model-compatibility-probes"/)
      assert.match(agentSettingsUiSource, /<AgentSurfaceBlock[^>]+data-testid=\{testId\}/)
    } else if (testId === 'agent-settings-skill-governance') {
      assert.match(agentSettingsSource, /<AgentDataBlock[^>]+data-testid="agent-settings-skill-governance"/)
    } else {
      assert.match(agentSettingsOwnershipSource, new RegExp(`<AgentSurfaceBlock[^>]+data-testid="${testId}"`), `${testId} must use AgentSurfaceBlock`)
    }
    assert.doesNotMatch(agentSettingsSource, new RegExp(`<div[^>]+data-testid="${testId}"[^>]+rounded-md border border-border bg-background`), `${testId} must not use a raw desktop shell`)
  }
  assert.match(agentSettingsUiSource, /export function AgentSettingsPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsPanel[\s\S]*?<AppPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsScopeRail/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsScopeBadge/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsStateMessage/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsKeyValue/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsCallout/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToneText/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToggleRow/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsApiModeCapabilityMatrix/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsStatusPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsMigrationGuide/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSwitchPlanPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsReadinessPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsActionItemsPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsActionItemRow/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsProfileCard/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsProfileDiffPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsProfileSummaryList/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSkillCard/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPolicyDiffPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSnapshotSummaryPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSnapshotImpactPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsRunPresetEditorPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsRunPresetEffectivePolicyPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSkillBundlePanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPolicyFilterPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPolicyFilterPresetPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPolicyBulkActionPanel/)
  assert.match(agentSettingsUiSource, /statusProps: AgentSettingsStatusProps/)
  assert.match(agentSettingsSource, /statusProps: agentSettingsStatusRecipe/)
  assert.match(agentSettingsSource, /<AgentSettingsStateMessage[\s\S]*?text=\{t\('common\.loading'\)\}/)
  assert.match(agentSettingsSource, /<AgentSettingsKeyValue[\s\S]*?label=\{t\('agents\.settings\.fields\.modelId'\)\}/)
  assert.match(agentSettingsSource, /<AgentSettingsCallout[\s\S]*?data-testid="agent-settings-provider-model-id-secret-warning"/)
  assert.match(agentSettingsSource, /<AgentSettingsToneText[\s\S]*?tone="warning"[\s\S]*?agents\.settings\.toolPolicyDraftIssues/)
  assert.doesNotMatch(agentSettingsSource, /\b(?:AppStateMessage|AppKeyValue|ReviewCallout|toneTextClass)\b/)
  assert.match(agentSettingsSource, /badgeProps=\{agentSettingsApiModeBadgeRecipe\(mode\.badge\)\}/)
  assert.match(agentSettingsSource, /trustProps=\{agentSettingsRecipe/)
  assert.doesNotMatch(agentSettingsUiSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(agentSettingsUiSource, /\bbadgeTone\b/)
  assert.doesNotMatch(agentSettingsUiSource, /\btrustTone\b/)
  assert.doesNotMatch(agentSettingsSource, /agentSettingsStatusTone|agentSettingsApiModeBadgeTone/)
  assert.doesNotMatch(agentSettingsSource, /\bbadgeTone=|\btrustTone=/)
  assert.doesNotMatch(agentSettingsSource, /flex min-h-8 items-center gap-2 rounded-md border border-border bg-background px-2 type-label/)
  assert.match(agentSettingsSource, /testResult && \([\s\S]*?<AgentDataBlock>[\s\S]*?<AgentSettingsCodeBlock>/)
  assert.doesNotMatch(agentSettingsSource, /\bAppCodeBlock\b/)
  assert.match(agentSettingsSource, /<AgentSettingsSkillBundlePanel[\s\S]*?installedPlugins=\{skillBundlePlugins\.map\(\(plugin\) => \(\{/)
  assert.match(agentSettingsUiSource, /installedPlugins\.map\(\(plugin\) => \([\s\S]*?<AgentSurfaceBlock key=\{plugin\.id\} variant="card"/)
  assert.doesNotMatch(agentSettingsSource, /skillBundlePlugins\.map[\s\S]*?<AgentSurfaceBlock key=\{plugin\.pluginId\} variant="card"/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPolicyFilterPanel[\s\S]*?filterOptions=\{TOOL_POLICY_FILTER_OPTIONS\.map/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPolicyFilterPresetPanel[\s\S]*?presets=\{agentSettings\.toolPolicyFilterPresets\.map/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPolicyBulkActionPanel[\s\S]*?applyToolPolicyBulkEdit\('allow_available'\)/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyFilterPanel[\s\S]*?<Input[\s\S]*?data-testid="agent-settings-tool-policy-search"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyFilterPanel[\s\S]*?<Select[\s\S]*?onValueChange=\{onFilterChange\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyFilterPresetPanel[\s\S]*?presets\.map[\s\S]*?<AgentSurfaceBlock key=\{preset\.id\} variant="subtle"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyBulkActionPanel[\s\S]*?data-testid="agent-settings-tool-policy-bulk-actions"/)
  assert.doesNotMatch(agentSettingsSource, /agentSettings\.toolPolicyFilterPresets\.map[\s\S]*?<AgentSurfaceBlock key=\{preset\.id\} variant="subtle"/)
  assert.match(agentSettingsSource, /textModels\.slice\(0, 12\)\.map[\s\S]*?<AgentSettingsModelOptionButton[\s\S]*?onSelect=\{\(\) => setSelectedModelId\(publicModelId\(model\)\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsModelOptionButton[\s\S]*?<AgentSurfaceBlock[\s\S]*?asChild[\s\S]*?variant="card"[\s\S]*?<Button/)
  assert.match(agentSettingsSource, /function SettingsSnapshotImportScopeSelector[\s\S]*?<AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsSource, /function SettingsSnapshotSummary[\s\S]*?<AgentSettingsSnapshotSummaryPanel/)
  assert.match(agentSettingsSource, /function SettingsAuditTrailPanel[\s\S]*?<AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsSource, /function SettingsSnapshotImpactPreview[\s\S]*?<AgentSettingsSnapshotImpactPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotImportScopePanel[\s\S]*?<CheckboxField[\s\S]*?data-testid="agent-settings-snapshot-import-scope"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotSummaryPanel[\s\S]*?<AppKeyValue/)
  assert.match(agentSettingsUiSource, /function AgentSettingsAuditTrailPanel[\s\S]*?<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-audit-entry"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotImpactPanel[\s\S]*?<StatusBadge/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotImportScopeSelector[\s\S]{0,2200}<CheckboxField/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotSummary[\s\S]{0,1200}<AppKeyValue/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsAuditTrailPanel[\s\S]{0,2400}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotImpactPreview[\s\S]{0,1800}<StatusBadge/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsRunPresetRow/)
  assert.match(agentSettingsSource, /function RunPresetRow[\s\S]*?<AgentSettingsRunPresetRow/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetRow[\s\S]*?<AgentSurfaceBlock[\s\S]*?asChild[\s\S]*?variant="card"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetRow[\s\S]*?<AppInlineMeta/)
  assert.match(agentSettingsSource, /<AgentSettingsRunPresetEditorPanel[\s\S]*?onAutoTaskGraphChange=\{\(checked\) => updateRunPreset\(activeRunPreset\.id, \{ autoTaskGraph: checked \}\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetEditorPanel[\s\S]*?<Input[\s\S]*?onChange=\{\(event\) => onNameChange\(event\.target\.value\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetEditorPanel[\s\S]*?<Select[\s\S]*?onValueChange=\{onPermissionModeChange\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetEditorPanel[\s\S]*?<CheckboxField[\s\S]*?onCheckedChange=\{onAutoTaskGraphChange\}/)
  assert.match(agentSettingsSource, /<AgentSettingsRunPresetEffectivePolicyPanel[\s\S]*?items=\{\[/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetEffectivePolicyPanel[\s\S]*?data-testid="agent-run-preset-effective-policy"[\s\S]*?<AppKeyValue/)
  assert.doesNotMatch(agentSettingsSource, /function RunPresetRow[\s\S]{0,1200}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSource, /function RunPresetRow[\s\S]{0,1200}<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-run-preset-editor"[\s\S]{0,2200}<Input/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-run-preset-editor"[\s\S]{0,2600}<CheckboxField/)
  assert.doesNotMatch(agentSettingsSource, /function RunPresetRow[\s\S]{0,900}rounded-md border p-2/)
  assert.match(agentSettingsSource, /function ToolPolicyDiffPreview[\s\S]*?AgentSettingsToolPolicyDiffPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyDiffPanel[\s\S]*?<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-tool-policy-diff"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyDiffPanel[\s\S]*?<StatusBadge/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyDiffPreview[\s\S]{0,2200}<AgentSurfaceBlock/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPolicyRow/)
  assert.match(agentSettingsSource, /function ToolPolicyRow[\s\S]*?AgentSettingsToolPolicyRow/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyRow[\s\S]*?<Select/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyRow[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyRow[\s\S]{0,2200}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyRow[\s\S]{0,2200}<Select/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyRow[\s\S]{0,2200}<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyRow[\s\S]{0,2600}rounded bg-background px-1\.5 py-0\.5/)
})

test('agent message and pill primitives share internal base classes', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()
  const messageContentSource = readProjectFile('apps/frontend/src/features/agent/components/AgentMessageContent.tsx')
  const mentionEditorSource = readProjectFile('apps/frontend/src/features/agent/components/AgentMentionEditor.tsx')
  const chatBubblesSource = readProjectFile('apps/frontend/src/features/agent/components/AgentChatBubbles.tsx')

  for (const sharedClass of ['ms-agent-avatar', 'ms-agent-pill', 'ms-agent-bubble', 'ms-agent-inline-code', 'ms-agent-inline-resource', 'ms-agent-media-thumb']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent primitives`)
    assert.match(agentCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} base styles must live in @movscript/ui agent`)
    assert.doesNotMatch(uiCss, new RegExp(`\\.${sharedClass}\\s*\\{`), `${sharedClass} must not remain in aggregate styles`)
  }
  assert.match(agentCss, /\.ms-agent-media-thumb > img,[\s\S]*?\.ms-agent-media-thumb > video\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(agentCss, /\.ms-agent-attachment-preview\s*\{/)
  assert.match(agentCss, /\.ms-agent-attachment-preview__media > img,[\s\S]*?\.ms-agent-attachment-preview__media > video\s*\{[\s\S]*object-fit:\s*contain/)
  assert.match(agentSource, /ms-agent-pill ms-agent-status/)
  assert.match(agentSource, /ms-agent-pill ms-agent-suggestion/)
  assert.match(agentSource, /ms-agent-pill ms-agent-contextchip/)
  assert.match(agentSource, /export const AgentAttachmentPreviewCard/)
  assert.match(agentSource, /export const AgentAttachmentPreviewMedia/)
  assert.match(agentSource, /export const AgentAttachmentPreviewFallback/)
  assert.match(agentSource, /export const AgentAttachmentPreviewBody/)
  assert.match(agentSource, /export function AgentMessageSection/)
  assert.match(agentCss, /\.ms-agent-message-section\s*\{/)
  assert.match(agentCss, /\.ms-agent-message-section__summary\s*\{/)
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
    'AgentRuntimeStatusContent',
    'AgentRuntimeStatusDetail',
    'AgentRuntimeStatusHeader',
    'AgentRuntimeStatusSuccessIcon',
  ]) {
    assert.match(agentSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(chatBubblesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent chat bubbles`)
  }
  assert.match(agentSource, /AgentRuntimeStatusSuccessIcon[\s\S]*?toneTextClass\("success"\)/)
  for (const sharedClass of [
    'ms-agent-chat-footer-badges',
    'ms-agent-chat-tiny-badge',
    'ms-agent-chat-status-line',
    'ms-agent-chat-result-stack',
    'ms-agent-chat-attachment-grid',
    'ms-agent-model-setup-callout',
    'ms-agent-runtime-status',
    'ms-agent-runtime-status__icon',
  ]) {
    assert.match(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} styles must live in @movscript/ui agent`)
  }
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
  assert.match(messageContentSource, /export \{ AgentMessageSection \} from '@movscript\/ui'/)
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
  const agentConsoleSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')
  const agentRunsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentRunsPage.tsx')
  const agentPerformanceSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx')
  const aiDraftsSource = readProjectFile('apps/frontend/src/features/agent/components/AIDraftsPage.tsx')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  const agentRunSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentRunPage.tsx')
  const agentDebugSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx')
  const projectAgentModeSource = readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx')
  const agentModePackageSource = readProjectFile('packages/ui/src/components/business/agent/mode/index.tsx')
  const agentChatHeaderSource = readProjectFile('apps/frontend/src/features/agent/components/AgentChatHeaderSection.tsx')
  const conversationTabsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConversationTabs.tsx')
  const aiAgentPanelSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentPanel.tsx')

  for (const sharedClass of [
    'ai-agent-panel',
    'ai-agent-panel-resizing',
    'ai-agent-panel-resizing--x',
    'ai-agent-panel-resizing--y',
    'ai-agent-panel-conversation-tabs',
    'ai-agent-panel-conversation-tab',
    'ai-agent-panel-conversation-tab-main',
    'ai-agent-panel-conversation-tab-runtime-light',
    'ai-agent-panel-conversation-tab-title',
    'ai-agent-panel-conversation-tab-count',
    'ai-agent-panel-conversation-tab-close',
    'ai-agent-panel-tab-context-menu-anchor',
    'ai-agent-panel-tab-context-dropdown',
    'ai-agent-panel-tab-context-menu-danger',
    'ai-agent-panel-card',
    'ai-agent-panel-content-card',
    'ai-agent-panel-input-card',
    'ai-agent-panel-empty-history',
    'ai-agent-panel-card-header',
    'ai-agent-panel-card-title',
    'ai-agent-panel-card-subtitle',
    'ai-agent-panel-composer',
    'ai-agent-panel-mention-editor',
    'ai-agent-mention-chip',
    'ai-agent-panel-shell',
    'ai-agent-panel-main',
    'ai-agent-panel-chat-header',
    'ai-agent-panel-chat-toolbar',
    'ai-agent-panel-chat-toolbar-tabs',
    'ai-agent-panel-chat-toolbar-actions',
    'ai-agent-panel-list-header',
    'ai-agent-panel-list-header-actions',
    'ai-agent-panel-context-resize-handle',
    'ai-agent-panel-context-body',
    'ai-agent-panel-context-card',
    'ai-agent-panel-context-stack',
    'project-agent-mode',
    'agent-page-chat-main',
    'agent-page-chat-empty',
    'agent-page-chat-empty-composer',
    'agent-page-chat-empty-title',
    'agent-page-chat-empty-accessory',
    'agent-page-project-select-card',
    'agent-page-chat-thread-shell',
    'agent-page-chat-thread',
    'agent-page-chat-composer',
    'project-agent-chat-shell',
  ]) {
    assert.match(`${agentCss}\n${agentChatCss}`, cssClassSelectorPattern(sharedClass), `${sharedClass} agent styles must live in @movscript/ui agent`)
  }
  assert.match(agentConsoleSource, /agent-console-page/)
  assert.match(agentRunsSource, /AgentRunsPanel/)
  assert.match(agentRunsSource, /AgentRunsRecordItem/)
  assert.match(agentPerformanceSource, /AgentPerformanceMetricTable/)
  assert.doesNotMatch(agentPerformanceSource, /\b(?:AgentSurfaceBlock|AgentDataBlock)\b/)
  assert.match(aiDraftsSource, /AgentSurfaceBlock/)
  assert.match(agentSettingsSource, /AgentSettingsModelOptionButton/)
  assert.match(agentRunSource, /AgentSurfaceBlock/)
  assert.match(agentDebugSource, /\bAgentDebugPanel\b/)
  assert.match(readProjectFile('packages/ui/src/components/business/agent/debug/index.tsx'), /export function AgentDebugPanel[\s\S]*?<AppPanel/)
  assert.doesNotMatch(agentDebugSource, /\bAppPanel\b/)
  assert.match(agentDebugSource, /\bAgentDataBlock\b/)
  assert.match(agentDebugSource, /\bAgentDebugTabs\b/)
  assert.match(readProjectFile('packages/ui/src/components/business/agent/debug/index.tsx'), /\bTabs\b/)
  assert.match(aiAgentPanelSource, /\bAgentPanelShell\b/)
  assert.doesNotMatch(aiAgentPanelSource, /className=\{cn\(/)
  assert.doesNotMatch(aiAgentPanelSource, /w-\[var\(--ui-agent-panel-width\)\]/)
  assert.match(projectAgentModeSource, /\bAgentModeRoot\b/)
  assert.match(projectAgentModeSource, /\bAgentModeProjectSelectButton\b/)
  assert.match(agentModePackageSource, /AgentModeProjectSelectButton[\s\S]*?<Button/)
  assert.match(agentModePackageSource, /AgentModeConversationArchiveButton[\s\S]*?<Button/)
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
  const conversationTabsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConversationTabs.tsx')
  const projectAgentModeSource = readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx')
  const agentModePackageSource = readProjectFile('packages/ui/src/components/business/agent/mode/index.tsx')

  for (const sharedClass of ['ms-agent-container', 'ms-agent-bar', 'ms-agent-titleblock', 'ms-agent-actions', 'ms-agent-scrollarea', 'ms-agent-stack', 'ms-agent-cluster']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent layout primitives`)
    assert.match(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui agent`)
    assert.doesNotMatch(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} must not remain in aggregate styles`)
  }
  assert.match(agentSource, /ms-agent-container ms-agent-shell/)
  assert.match(agentSource, /ms-agent-container ms-agent-work-surface/)
  assert.match(agentSource, /ms-agent-bar ms-agent-header/)
  assert.match(agentSource, /ms-agent-bar ms-agent-work-header/)
  assert.match(agentSource, /ms-agent-stack ms-agent-composer/)
  assert.match(agentSource, /ms-agent-stack ms-agent-run-card__grid/)
  assert.match(agentSource, /ms-agent-cluster ms-agent-message__meta/)
  assert.match(agentSource, /ms-agent-cluster ms-agent-cluster--between ms-agent-composer__toolbar/)
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
  assert.match(projectAgentModeSource, /function AgentModeProjectSelectCard[\s\S]*?<AgentModeProjectSelectButton/)
  assert.match(agentModePackageSource, /function AgentModeProjectSelectButton[\s\S]*?<Button[\s\S]*?agent-page-project-select-card/)
  assert.match(agentModePackageSource, /function AgentModeNavLinkItem[\s\S]*?<AgentNavItem asChild/)
  assert.doesNotMatch(projectAgentModeSource, /<button\b[\s\S]{0,160}agent-page-project-select-card/)
})

test('agent text primitives share internal text classes', () => {
  const agentSource = readAgentSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const agentCss = readAgentCss()
  const primitiveCss = readPrimitiveCss()

  for (const sharedClass of ['ms-agent-text', 'ms-agent-text--muted', 'ms-agent-text--meta']) {
    assert.match(agentSource, new RegExp(sharedClass), `${sharedClass} must be consumed by agent text primitives`)
    assert.match(agentCss, cssClassSelectorPattern(sharedClass), `${sharedClass} base styles must live in @movscript/ui agent`)
    assert.doesNotMatch(uiCss, cssClassSelectorPattern(sharedClass), `${sharedClass} must not remain in aggregate styles`)
  }
  assert.match(agentSource, /ms-agent-text--truncate/)
  assert.match(primitiveCss, cssClassSelectorPattern('ms-agent-text--truncate'))
  assert.doesNotMatch(uiCss, cssClassSelectorPattern('ms-agent-text--truncate'))
  assert.match(agentSource, /ms-agent-text ms-agent-text--truncate ms-agent-conversation__title/)
  assert.match(agentSource, /ms-agent-text ms-agent-text--truncate ms-agent-title/)
  assert.match(agentSource, /ms-agent-text ms-agent-text--meta ms-agent-run-card__meta/)
})

test('button and composer controls share internal control classes', () => {
  const buttonSource = readProjectFile('packages/ui/src/components/primitives/button.tsx')
  const agentSource = readAgentSource()
  const primitiveCss = readPrimitiveCss()

  assert.match(buttonSource, /ms-control ms-button/)
  assert.match(agentSource, /ms-control ms-agent-composer__action/)
  assert.match(agentSource, /ms-control ms-agent-composer__submit/)
  assert.match(primitiveCss, /\.ms-control\s*\{/)
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

test('desktop entity and creative reference tones use @movscript/ui contracts', () => {
  const detailPackageSource = readDetailSource()
  const creativeReferenceCardSource = readCreativeReferenceSource()
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple)-\d/

  assert.doesNotMatch(detailPackageSource, rawPaletteClassPattern)
  assert.doesNotMatch(creativeReferenceCardSource, rawPaletteClassPattern)
  assert.match(detailPackageSource, /DetailEntityHeader/)
  assert.match(detailPackageSource, /DetailPill/)
  assert.match(detailPackageSource, /DetailPreviewFieldList/)
  assert.match(creativeReferenceCardSource, /accentTextClass|accentSoftClass|accentDotClass|accentGradientClass/)
  assert.doesNotMatch(creativeReferenceCardSource, /accentToneClass/)
  assert.match(creativeReferenceCardSource, /StatusBadge/)
  assert.match(creativeReferenceCardSource, /creativeReferenceStatusMeta[\s\S]*?intent: StatusIntent/)
  assert.match(creativeReferenceCardSource, /<StatusBadge intent=\{status\.intent\}/)
  assert.doesNotMatch(creativeReferenceCardSource, /\bSemanticTone\b/)
  assert.doesNotMatch(creativeReferenceCardSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(creativeReferenceCardSource, /semanticToneClass/)
  assert.doesNotMatch(detailPackageSource, /rounded border border-border bg-background\/80 px-1\.5 py-0\.5/)
  assert.match(uiSemanticHelperSource, /export type AccentTone/)
  assert.doesNotMatch(themeCss, /\.ms-accent-/)
  assert.match(uiSemanticCss, /\.ms-accent-/)
  assert.doesNotMatch(uiCss, /\.ms-accent-/)
})

test('production proposal review surfaces use @movscript/ui review contracts', () => {
  const proposalReviewSources = [
    'apps/frontend/src/features/production/components/proposals/ProductionProposalApplyGatePanel.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalApplyPreviewPanel.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalBackendPreviewPanel.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalReviewControls.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalReviewHeader.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalReviewPanel.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalReviewResultPanel.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionProposalSemanticDiffPanel.tsx',
    'apps/frontend/src/features/production/components/proposals/ProductionUpstreamProposalReviewSummary.tsx',
    'apps/frontend/src/features/pre-production/components/proposals/PreProductionProposalReviewPanel.tsx',
    'apps/frontend/src/features/project-standards/components/proposals/ProjectStandardsProposalReviewPanel.tsx',
    'apps/frontend/src/features/production/presentation/useProductionProposalReviewController.ts',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const uiReviewSource = readReviewSource()
  const projectProposalReviewPackageSource = readProjectFile('packages/ui/src/components/business/project/proposal-review/index.tsx')
  const projectProposalReviewPackageCss = readProjectFile('packages/ui/src/components/business/project/proposal-review/styles.css')
  const productionProposalReviewPackageSource = readProjectFile('packages/ui/src/components/business/production/proposal-review/index.tsx')
  const productionProposalReviewPackageCss = readProjectFile('packages/ui/src/components/business/production/proposal-review/styles.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const reviewCss = readReviewCss()
  const upstreamSummarySource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionUpstreamProposalReviewSummary.tsx')
  const backendPreviewSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalBackendPreviewPanel.tsx')
  const applyPreviewSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalApplyPreviewPanel.tsx')
  const reviewControlsSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalReviewControls.tsx')
  const reviewHeaderSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalReviewHeader.tsx')
  const reviewPanelSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalReviewPanel.tsx')
  const reviewResultSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalReviewResultPanel.tsx')
  const preProductionProposalSource = readProjectFile('apps/frontend/src/features/pre-production/components/proposals/PreProductionProposalReviewPanel.tsx')
  const projectStandardsSource = readProjectFile('apps/frontend/src/features/project-standards/components/proposals/ProjectStandardsProposalReviewPanel.tsx')
  const semanticDiffSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalSemanticDiffPanel.tsx')
  const productionProposalReviewPresentationTypesSource = readProjectFile('apps/frontend/src/features/production/presentation/productionProposalReviewPresentationTypes.ts')
  const productionSemanticUiSource = readProjectFile('apps/frontend/src/features/production/presentation/productionSemanticUi.ts')
  const deliverySemanticUiSource = readProjectFile('apps/frontend/src/features/delivery/presentation/deliverySemanticUi.ts')
  const projectSemanticUiSource = readProjectFile('apps/frontend/src/features/project/presentation/projectSemanticUi.ts')
  const preProductionSemanticUiSource = readProjectFile('apps/frontend/src/features/pre-production/presentation/preProductionSemanticUi.ts')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(proposalReviewSources, rawPaletteClassPattern)
  assert.match(proposalReviewSources, /ReviewCallout/)
  assert.match(proposalReviewSources, /ReviewStat/)
  assert.match(proposalReviewSources, /ChangeActionBadge/)
  assert.match(productionProposalReviewPackageSource, /ReviewDecisionBadge/)
  assert.doesNotMatch(proposalReviewSources, /\bAppKeyValue\b/)
  assert.match(upstreamSummarySource, /ReviewProposalUpstreamSection/)
  assert.match(upstreamSummarySource, /ReviewProposalUpstreamActionButton/)
  assert.match(upstreamSummarySource, /ReviewProposalUpstreamMetricGrid/)
  assert.match(upstreamSummarySource, /ReviewProposalUpstreamSummary/)
  assert.match(upstreamSummarySource, /ReviewProposalUpstreamPreviewGrid/)
  assert.match(upstreamSummarySource, /ReviewProposalUpstreamEntryPreview/)
  assert.match(uiReviewSource, /function ReviewProposalUpstreamSection[\s\S]*?<AppSection/)
  assert.match(uiReviewSource, /function ReviewProposalUpstreamMetricGrid[\s\S]*?<AppKeyValue/)
  assert.match(uiReviewSource, /function ReviewProposalUpstreamEntryPreview[\s\S]*?<AppPanel[\s\S]*?<AppSurfaceItem[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(upstreamSummarySource, /\bAppSection\b/)
  assert.doesNotMatch(upstreamSummarySource, /\bAppPanel\b/)
  assert.doesNotMatch(upstreamSummarySource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(upstreamSummarySource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(upstreamSummarySource, /\bAppTextEmptyState\b/)
  assert.doesNotMatch(upstreamSummarySource, /function EntryPreview/)
  assert.doesNotMatch(upstreamSummarySource, /\btoneSurfaceClass\b/)
  assert.doesNotMatch(upstreamSummarySource, /\btoneTextClass\b/)
  assert.doesNotMatch(upstreamSummarySource, /\bcn\(/)
  assert.doesNotMatch(upstreamSummarySource, /rounded-lg border border-border bg-background p-4/)
  assert.doesNotMatch(upstreamSummarySource, /rounded-md border border-dashed border-border bg-muted\/20 px-3 py-4/)
  assert.doesNotMatch(upstreamSummarySource, /rounded-md border border-border bg-muted\/10 p-3/)
  assert.doesNotMatch(upstreamSummarySource, /rounded border px-2 py-1\.5/)
  assert.doesNotMatch(upstreamSummarySource, /rounded bg-muted px-1\.5 py-0\.5/)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/components/proposals/ProposalReviewShell.tsx')), false)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/production/components/proposals/ProductionProposalReviewEmptyState.tsx')), false)
  assert.match(proposalReviewSources, /ReviewProposalShell/)
  assert.match(uiReviewSource, /export function ReviewProposalShell/)
  assert.match(uiReviewSource, /<AppSection/)
  assert.match(uiReviewSource, /eyebrow=\{kind\}/)
  assert.match(uiReviewSource, /export function ReviewProposalEmptyState/)
  assert.match(uiReviewSource, /<AppEmptyState/)
  assert.doesNotMatch(proposalReviewSources, /min-w-0 rounded-lg border border-border bg-card p-4/)
  assert.doesNotMatch(proposalReviewSources, /rounded-lg border border-dashed border-border bg-background p-6/)
  assert.match(backendPreviewSource, /ProductionProposalBackendPreviewIssueCallout/)
  assert.match(backendPreviewSource, /PackageProductionProposalBackendPreviewSemanticSummary/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalBackendPreviewPanel/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalBackendPreviewIssueCallout/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalBackendPreviewSemanticSummary/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalResultStack/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalResultCallout/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalResultStatGrid/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalResultActions/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewShell/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewActionGroup/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewActionButton/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewScrollArea/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewContentStack/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewErrorCallout/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalResultActionButton/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalBackendPreviewReadyPanel/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalContinueReviewPanel/)
  for (const className of [
    'production-proposal-review-shell',
    'production-proposal-review-action-group',
    'production-proposal-review-action-button',
    'production-proposal-review-scroll-area',
    'production-proposal-review-content-stack',
    'production-proposal-review-error',
    'production-proposal-result-action-button',
    'production-proposal-backend-preview-badge',
    'production-proposal-continue-review__description',
    'production-proposal-continue-review__body',
  ]) {
    assert.match(productionProposalReviewPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(productionProposalReviewPackageSource, /export type ProductionProposalReviewState =/)
  assert.match(reviewPanelSource, /ProductionProposalReviewShell/)
  assert.match(reviewPanelSource, /ProductionProposalReviewActionGroup/)
  assert.match(reviewPanelSource, /ProductionProposalReviewScrollArea/)
  assert.match(reviewPanelSource, /ProductionProposalReviewContentStack/)
  assert.match(reviewPanelSource, /ProductionProposalReviewErrorCallout/)
  assert.doesNotMatch(reviewPanelSource, /className=|<div\b|<p\b|\b(?:Button|ReviewCallout|ReviewProposalShell)\b/)
  assert.match(productionProposalReviewPackageSource, /ProductionProposalReviewStatus[\s\S]*?state: ProductionProposalReviewState/)
  assert.match(proposalReviewSources, /\bstate:\s*'backend_preview_ready'/)
  assert.match(proposalReviewSources, /\bstate:\s*'ready_for_preview'/)
  assert.match(proposalReviewSources, /\bstate:\s*'blocked'/)
  assert.doesNotMatch(productionProposalReviewPackageSource, /\bProductionProposalReviewStatusTone\b/)
  assert.doesNotMatch(productionProposalReviewPackageSource, /\bproductionProposalReviewTone\b/)
  assert.doesNotMatch(productionProposalReviewPresentationTypesSource, /\btone:\s*'neutral' \| 'ok' \| 'warn' \| 'danger'/)
  assert.doesNotMatch(proposalReviewSources, /\btone:\s*['"](?:ok|warn|danger|neutral)['"]/)
  assert.match(productionProposalReviewPackageSource, /export type ProductionProposalResultStatOutcome = "created" \| "accepted" \| "rejected" \| "pending" \| "neutral"/)
  assert.match(productionProposalReviewPackageSource, /export type ProductionProposalApplyPreviewGroupState = "write" \| "blocked" \| "pending" \| "rejected"/)
  assert.match(productionProposalReviewPackageSource, /ProductionProposalResultStat[\s\S]*?outcome\?: ProductionProposalResultStatOutcome/)
  assert.match(productionProposalReviewPackageSource, /ProductionProposalApplyPreviewGroup[\s\S]*?state: ProductionProposalApplyPreviewGroupState/)
  assert.doesNotMatch(productionProposalReviewPackageSource, /ProductionProposalResultStat[\s\S]{0,180}\btone\?: ReviewTone/)
  assert.doesNotMatch(productionProposalReviewPackageSource, /ProductionProposalResultCallout[\s\S]{0,260}\btone\?: ReviewTone/)
  assert.doesNotMatch(productionProposalReviewPackageSource, /ProductionProposalApplyPreviewGroup[\s\S]{0,260}\btone: ReviewTone/)
  assert.match(productionProposalReviewPackageSource, /showZero/)
  assert.match(productionProposalReviewPackageSource, /<AppPanel[\s\S]*?<ProductionProposalResultStatGrid/)
  assert.match(productionProposalReviewPackageSource, /issue\.detail[\s\S]*?<AppSurfaceItem density="compact" variant="overlay"[\s\S]*?<AppCodeBlock>/)
  assert.match(productionProposalReviewPackageSource, /changes\.slice\(0, 6\)\.map[\s\S]*?<AppSurfaceItem/)
  assert.doesNotMatch(backendPreviewSource, /<pre\b/)
  assert.doesNotMatch(backendPreviewSource, /rounded-md border border-border\/60 bg-muted\/30 p-2/)
  assert.doesNotMatch(backendPreviewSource, /rounded bg-background\/70 px-2 py-1/)
  assert.doesNotMatch(backendPreviewSource, /whitespace-pre-wrap rounded bg-background\/70 p-2/)
  assert.match(applyPreviewSource, /PackageProductionProposalApplyPreviewPanel/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalApplyPreviewPanel/)
  assert.match(productionProposalReviewPackageSource, /items\.slice\(0, 8\)\.map[\s\S]*?<ProductionProposalApplyPreviewItemRow/)
  assert.match(productionProposalReviewPackageSource, /<AppSurfaceItem[\s\S]*?production-proposal-apply-preview-item/)
  assert.doesNotMatch(applyPreviewSource, /rounded bg-background\/70 px-2 py-1\.5/)
  assert.match(reviewControlsSource, /ReviewProposalWriteImpactPanel/)
  assert.match(reviewControlsSource, /ReviewProposalFooterActions/)
  assert.doesNotMatch(reviewControlsSource, /className=|\bLoader2\b/)
  assert.match(uiReviewSource, /export function ReviewProposalWriteImpactPanel/)
  assert.match(uiReviewSource, /export function ReviewProposalFooterActions/)
  assert.match(uiReviewSource, /<AppPanel/)
  assert.match(uiReviewSource, /iconClassName=\{toneTextClass\("info"\)\}/)
  assert.doesNotMatch(reviewControlsSource, /rounded-lg border border-border bg-background p-3/)
  assert.match(productionProposalReviewPackageSource, /<AppPanel/)
  assert.doesNotMatch(reviewResultSource, /\bAppPanel\b/)
  assert.match(reviewResultSource, /ProductionProposalResultStack/)
  assert.match(reviewResultSource, /ProductionProposalResultCallout/)
  assert.match(reviewResultSource, /ProductionProposalResultStatGrid/)
  assert.match(reviewResultSource, /ProductionProposalResultActions/)
  assert.match(reviewResultSource, /ProductionProposalBackendPreviewReadyPanel/)
  assert.match(reviewResultSource, /ProductionProposalContinueReviewPanel/)
  assert.doesNotMatch(reviewResultSource, /className=|\b(?:AppPanel|Badge|Button|toneTextClass|Loader2)\b/)
  assert.match(reviewResultSource, /\boutcome:\s*'created'/)
  assert.match(reviewResultSource, /\boutcome:\s*'accepted'/)
  assert.match(reviewResultSource, /\boutcome:\s*'rejected'/)
  assert.match(reviewResultSource, /\boutcome:\s*'pending'/)
  assert.doesNotMatch(reviewResultSource, /\btone:\s*['"](?:success|danger|warning|neutral|info)['"]/)
  assert.match(reviewResultSource, /返回编排段[\s\S]*?simulationResult\.backendPreview\.returned\.segments/)
  assert.doesNotMatch(reviewResultSource, /返回编排段[\s\S]*?ReviewStat/)
  assert.doesNotMatch(reviewResultSource, /flex flex-col gap-3 p-4/)
  assert.doesNotMatch(reviewResultSource, /mt-2 grid grid-cols-3 gap-1\.5/)
  assert.doesNotMatch(reviewResultSource, /cn\(/)
  assert.match(productionProposalReviewPackageSource, /iconClassName=\{toneTextClass\("success"\)\}/)
  assert.match(productionProposalReviewPackageSource, /iconClassName=\{toneTextClass\("info"\)\}/)
  assert.doesNotMatch(reviewResultSource, /\btoneTextClass\b/)
  assert.doesNotMatch(reviewResultSource, /rounded-lg border border-border bg-background p-3/)
  assert.doesNotMatch(reviewResultSource, /rounded bg-muted px-1\.5 py-1 text-foreground/)
  assert.match(reviewHeaderSource, /ProductionProposalReviewSummary/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalReviewSummary/)
  assert.match(productionProposalReviewPackageSource, /<AppKeyValue/)
  assert.doesNotMatch(reviewHeaderSource, /rounded-md border border-border bg-background px-2\.5 py-2/)
  for (const exportName of [
    'ProjectProposalReviewActionButton',
    'ProjectProposalReviewBadge',
    'ProjectProposalReviewCallout',
    'ProjectProposalReviewDetailText',
    'ProjectProposalReviewEmptyText',
    'ProjectProposalReviewEntryCallout',
    'ProjectProposalReviewLoadingState',
    'ProjectProposalReviewNoteList',
    'ProjectProposalReviewStatusBadge',
  ]) {
    assert.match(preProductionProposalSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by pre-production proposal review`)
  }
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewLoadingState[\s\S]*?<AppStateMessage/)
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewEmptyText[\s\S]*?<AppTextEmptyState/)
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewCallout[\s\S]*?<ReviewCallout/)
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewEntryCallout[\s\S]*?<ReviewCallout/)
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewBadge[\s\S]*?<Badge/)
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(projectProposalReviewPackageSource, /function ProjectProposalReviewActionButton[\s\S]*?<Button/)
  for (const className of ['project-proposal-review-action-button', 'project-proposal-review-badge', 'project-proposal-review-detail-text', 'project-proposal-review-status-badge']) {
    assert.match(projectProposalReviewPackageCss, new RegExp(`\\.${className}\\b`), `${className} style must be package-owned`)
  }
  for (const exportName of ['ReviewProposalDraftList', 'ReviewProposalDraftPanel', 'ReviewProposalEntryHeader', 'ReviewProposalFieldDiffList', 'ReviewProposalFieldDiffRow', 'ReviewProposalSummaryCallout']) {
    assert.match(preProductionProposalSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by pre-production proposal review`)
  }
  assert.match(uiReviewSource, /function ReviewProposalDraftList\b/)
  assert.match(uiReviewSource, /function ReviewProposalDraftPanel[\s\S]*?<AppPanel/)
  assert.match(uiReviewSource, /function ReviewProposalSummaryCallout[\s\S]*?<ReviewCallout/)
  assert.match(uiReviewSource, /function ReviewProposalEntryHeader\b/)
  assert.match(uiReviewSource, /function ReviewProposalFieldDiffList\b/)
  assert.match(uiReviewSource, /function ReviewProposalFieldDiffRow[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(preProductionProposalSource, /\bAppPanel\b/)
  assert.doesNotMatch(preProductionProposalSource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(preProductionProposalSource, /\bAppStateMessage\b/)
  assert.doesNotMatch(preProductionProposalSource, /\bAppTextEmptyState\b/)
  assert.doesNotMatch(preProductionProposalSource, /\bReviewCallout\b/)
  assert.doesNotMatch(preProductionProposalSource, /\b(?:Badge|Button|StatusBadge)\b/)
  assert.doesNotMatch(preProductionProposalSource, /\btoneTextClass\b/)
  assert.doesNotMatch(preProductionProposalSource, /className=/)
  assert.doesNotMatch(preProductionProposalSource, /\bArrowRight\b/)
  assert.doesNotMatch(preProductionProposalSource, /grid min-w-0 grid-cols-\[auto_minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/)
  for (const recipeName of ['preProductionProposalDraftStatusRecipe', 'preProductionProposalCountRecipe', 'preProductionProposalDecisionRecipe', 'preProductionProposalEntryChangeRecipe']) {
    assert.match(preProductionSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be pre-production semantic UI-owned`)
    assert.match(preProductionProposalSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by pre-production proposal review`)
  }
  assert.doesNotMatch(preProductionProposalSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(preProductionProposalSource, /rounded-md border border-border bg-background px-3 py-3/)
  assert.doesNotMatch(preProductionProposalSource, /rounded-md border border-dashed border-border bg-background px-3 py-3/)
  assert.doesNotMatch(preProductionProposalSource, /min-w-0 rounded-md border border-border bg-background p-3/)
  assert.doesNotMatch(preProductionProposalSource, /rounded-md border p-2\.5/)
  assert.doesNotMatch(preProductionProposalSource, /rounded border border-dashed border-border\/60 bg-muted\/20 px-2 py-1/)
  assert.doesNotMatch(preProductionProposalSource, /rounded bg-muted px-1 py-0\.5/)
  assert.doesNotMatch(preProductionProposalSource, /rounded-md border border-dashed border-border bg-background px-3 py-4/)
  assert.doesNotMatch(preProductionProposalSource, /space-y-1 rounded-md border border-border bg-background\/70 p-2/)
  assert.doesNotMatch(semanticDiffSource, /AppPanel/)
  assert.doesNotMatch(semanticDiffSource, /\bAppTextEmptyState\b/)
  assert.match(productionSemanticUiSource, /productionChangeRecipe/)
  assert.doesNotMatch(semanticDiffSource, /productionChangeRecipe/)
  assert.match(semanticDiffSource, /ProductionProposalSemanticDiffStack/)
  assert.match(semanticDiffSource, /ProductionProposalSemanticDiffEmptyText/)
  assert.match(semanticDiffSource, /ProductionProposalSemanticDiffOverview/)
  assert.match(semanticDiffSource, /ProductionProposalSemanticDiffFilterRow/)
  assert.match(semanticDiffSource, /ProductionProposalSemanticDiffGroupCard/)
  assert.match(semanticDiffSource, /PackageProductionProposalSemanticDiffRow/)
  assert.match(semanticDiffSource, /ProductionProposalContextStack/)
  assert.match(semanticDiffSource, /ProductionProposalContextGroup/)
  assert.match(semanticDiffSource, /ProductionProposalContextItemRow/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalSemanticDiffStack/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalSemanticDiffEmptyText[\s\S]*?<AppTextEmptyState/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalSemanticDiffOverview/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalSemanticDiffFilterRow/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalSemanticDiffGroupCard/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalSemanticDiffRow/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalContextGroup/)
  assert.match(productionProposalReviewPackageSource, /export function ProductionProposalContextItemRow/)
  assert.match(productionProposalReviewPackageSource, /<ReviewDecisionBadge/)
  assert.match(productionProposalReviewPackageSource, /<StatusBadge intent="warning" emphasis="soft"/)
  assert.doesNotMatch(semanticDiffSource, /总计 \{summary\.total\}[\s\S]*?ReviewStat/)
  assert.doesNotMatch(semanticDiffSource, /groupDecision === 'mixed'[\s\S]*?<ReviewStat tone="neutral">部分处理<\/ReviewStat>/)
  assert.doesNotMatch(semanticDiffSource, /productionProposalSemanticDiffGroupStats\(group\)\.map[\s\S]*?<ReviewStat key=\{stat\} tone="neutral">/)
  assert.doesNotMatch(semanticDiffSource, /flex items-start gap-2/)
  assert.doesNotMatch(semanticDiffSource, /mt-2 flex gap-1\.5/)
  assert.doesNotMatch(semanticDiffSource, /changeActionRowClass/)
  assert.doesNotMatch(semanticDiffSource, /<StatusBadge\b/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-border bg-background p-4/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-border bg-background p-3/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-dashed border-border bg-background p-4/)
  assert.doesNotMatch(semanticDiffSource, /rounded-lg border border-border bg-background/)
  assert.doesNotMatch(semanticDiffSource, /rounded bg-muted px-1\.5 py-(?:0\.5|1)/)
  assert.doesNotMatch(semanticDiffSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(semanticDiffSource, /<button\b/)
  for (const exportName of [
    'ProjectProposalReviewEmptyBlock',
    'ProjectProposalReviewEmptyText',
    'ProjectProposalReviewLoadingState',
    'ProjectProposalReviewCallout',
    'ProjectProposalReviewActionButton',
    'ProjectProposalReviewBadge',
    'ProjectProposalReviewNoteList',
    'ProjectProposalReviewStatusBadge',
    'ReviewProposalDraftList',
    'ReviewProposalDraftPanel',
    'ReviewProposalFieldDiffList',
    'ReviewProposalFieldDiffRow',
    'ReviewProposalShell',
    'ReviewProposalSummaryCallout',
  ]) {
    assert.match(projectStandardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by project standards proposal review`)
  }
  assert.match(projectProposalReviewPackageSource, /ProjectProposalReviewEmptyBlock[\s\S]*?<AppEmptyState/)
  assert.match(projectProposalReviewPackageSource, /ProjectProposalReviewEmptyText[\s\S]*?<AppTextEmptyState/)
  assert.match(projectProposalReviewPackageSource, /ProjectProposalReviewLoadingState[\s\S]*?<AppStateMessage/)
  assert.match(projectProposalReviewPackageSource, /ProjectProposalReviewCallout[\s\S]*?<ReviewCallout/)
  assert.match(uiReviewSource, /<AppPanel/)
  assert.match(uiReviewSource, /<AppInlineMeta/)
  assert.doesNotMatch(projectStandardsSource, /\bAppEmptyState\b/)
  assert.doesNotMatch(projectStandardsSource, /\bAppStateMessage\b/)
  assert.doesNotMatch(projectStandardsSource, /\bAppTextEmptyState\b/)
  assert.doesNotMatch(projectStandardsSource, /\bReviewCallout\b/)
  assert.doesNotMatch(projectStandardsSource, /\b(?:Badge|Button|StatusBadge)\b/)
  assert.doesNotMatch(projectStandardsSource, /\bAppPanel\b/)
  assert.doesNotMatch(projectStandardsSource, /\bAppKeyValue\b/)
  assert.doesNotMatch(projectStandardsSource, /\bArrowRight\b/)
  assert.doesNotMatch(projectStandardsSource, /\bcn\(/)
  assert.doesNotMatch(projectStandardsSource, /grid gap-2 md:grid-cols-2/)
  assert.match(projectStandardsSource, /projectStandardsDraftStatusRecipe/)
  assert.doesNotMatch(projectStandardsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(projectStandardsSource, /draftStatusTone/)
  assert.doesNotMatch(projectStandardsSource, /rounded-lg border border-border bg-background p-3/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-border bg-card px-3 py-2/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-dashed border-border bg-background px-3 py-4/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-border bg-muted\/20 p-3/)
  assert.doesNotMatch(projectStandardsSource, /rounded-md border border-dashed border-border bg-background px-4 py-6/)
  assert.doesNotMatch(proposalReviewSources, /function SummaryCount/)
  assert.match(uiReviewSource, /export function ReviewCallout/)
  assert.match(uiReviewSource, /export function ChangeActionBadge/)
  assert.match(reviewCss, /\.ms-review-callout/)
  assert.match(reviewCss, /\.ms-change-action-row/)
  assert.doesNotMatch(uiCss, /\.ms-review-callout/)
  assert.doesNotMatch(uiCss, /\.ms-change-action-row/)
})

test('core canvas cards use @movscript/ui tone contracts', () => {
  const canvasNodesSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasNodes.tsx')
  const canvasSemanticUiSource = readProjectFile('apps/frontend/src/features/canvas/presentation/canvasSemanticUi.ts')
  const frontendTypesSource = readProjectFile('apps/frontend/src/types/index.ts')
  const canvasNodeDefinitionsSource = readProjectFile('apps/frontend/src/features/canvas/domain/nodeDefinitions.ts')
  const uiCanvasSource = readProjectFile('packages/ui/src/components/business/canvas/index.tsx')
  const uiCanvasCardSource = readProjectFile('packages/ui/src/components/business/canvas/card/index.tsx')
  const uiCanvasCardShellSource = readProjectFile('packages/ui/src/components/business/canvas/card/shell/index.tsx')
  const uiCanvasCardNodeSource = [
    'packages/ui/src/components/business/canvas/card/node/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/handles/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/core/index.tsx',
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
  const uiCanvasCardNodeCss = [
    'packages/ui/src/components/business/canvas/card/node/styles.css',
    'packages/ui/src/components/business/canvas/card/node/core/styles.css',
    'packages/ui/src/components/business/canvas/card/node/ports/styles.css',
    'packages/ui/src/components/business/canvas/card/node/result/styles.css',
    'packages/ui/src/components/business/canvas/card/node/prompt/styles.css',
    'packages/ui/src/components/business/canvas/card/node/attachment/styles.css',
    'packages/ui/src/components/business/canvas/card/node/approval/styles.css',
    'packages/ui/src/components/business/canvas/card/node/params/styles.css',
  ].map(readProjectFile).join('\n')
  const uiCanvasCardSurfaceCss = readProjectFile('packages/ui/src/components/business/canvas/card/surface/styles.css')
  const uiCanvasCardPortCss = readProjectFile('packages/ui/src/components/business/canvas/card/port/styles.css')
  const uiCanvasFlowCss = readProjectFile('packages/ui/src/components/business/canvas/flow/styles.css')
  const uiCanvasIOCss = readCanvasIOCss()
  const uiCanvasToolCss = readCanvasToolCss()
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  const canvasCardSources = [uiCanvasToolSource, uiCanvasIOSource].join('\n')
  assert.doesNotMatch(canvasCardSources, rawPaletteClassPattern)
  assert.match(canvasCardSources, /accentTextClass|accentSoftClass|accentBadgeClass/)
  assert.doesNotMatch(canvasCardSources, /accentToneClass/)
  assert.match(uiSemanticHelperSource, /toneTextClass/)
  assert.match(uiSemanticHelperSource, /toneSurfaceClass/)
  assert.match(canvasNodesSource, /from ['"]@movscript\/ui['"]/)
  assert.match(canvasNodesSource, /\bCanvasToolActionCard\b/)
  assert.match(canvasNodesSource, /\bCanvasIOActionCard\b/)
  assert.match(canvasNodesSource, /\bCanvasNodeSemanticPortRows\b/)
  assert.match(canvasSemanticUiSource, /export function canvasNodeStatusRecipe\b/)
  assert.match(canvasNodesSource, /canvasNodeStatusRecipe/)
  assert.doesNotMatch(canvasNodesSource, /nodeStatusTone/)
  assert.doesNotMatch(canvasNodesSource, /\bstatusTone=/)
  assert.doesNotMatch(uiCanvasCardNodeSource, /\bstatusTone\b/)
  assert.doesNotMatch(uiCanvasCardNodeSource, /<StatusBadge\b[^>]*\btone=/)
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
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must not exist because canvas does not support entity nodes`)
  }
  assert.match(uiCanvasCardSource, /CanvasCardShell/)
  assert.match(uiCanvasCardSource, /CanvasNodeCard/)
  assert.match(uiCanvasCardSource, /CanvasNodeCardActionButton/)
  assert.match(uiCanvasCardSource, /CanvasNodeCardBody/)
  assert.match(uiCanvasCardSource, /CanvasNodeCardHeader/)
  assert.match(uiCanvasCardSource, /CanvasNodeCardPreviewText/)
  assert.match(uiCanvasCardSource, /CanvasNodeCardTextarea/)
  assert.match(uiCanvasCardSource, /CanvasTextNodeView/)
  assert.match(uiCanvasCardSource, /CanvasImageNodeView/)
  assert.match(uiCanvasCardSource, /CanvasVideoNodeView/)
  assert.match(uiCanvasCardSource, /CanvasNodeFooterText/)
  assert.match(uiCanvasCardSource, /CanvasNodeFrame/)
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
  assert.match(uiCanvasCardSource, /CanvasNodeStatusPip/)
  assert.match(uiCanvasCardSource, /CanvasNodeStatusPipView/)
  assert.match(uiCanvasCardSource, /CanvasNodeTextResultHeader/)
  assert.match(uiCanvasCardSource, /CanvasNodeParamControlsView/)
  assert.match(uiCanvasCardSource, /CanvasSurfaceItem/)
  assert.match(uiCanvasCardSource, /CanvasPortDot/)
  assert.match(uiCanvasCardShellSource, /export function CanvasCardShell/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeCard/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasNodeCardActionButton/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeCardBody/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeCardHeader/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeCardPreviewText/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasNodeCardTextarea/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasTextNodeView/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasImageNodeView/)
  assert.match(uiCanvasCardNodeSource, /export const CanvasVideoNodeView/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeFooterText/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeFrame/)
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
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeStatusPip/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeStatusPipView/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeTextResultHeader/)
  assert.match(uiCanvasCardNodeSource, /export function CanvasNodeParamControlsView/)
  assert.match(uiCanvasCardNodeSource, /export const canvasNodeSemanticTargetHandleStyle/)
  assert.match(uiCanvasCardNodeSource, /export const canvasNodeSemanticSourceHandleStyle/)
  assert.match(uiCanvasCardNodeSource, /export const canvasNodeCardPortHandleStyle/)
  assert.match(uiCanvasCardSurfaceSource, /export function CanvasSurfaceItem/)
  assert.match(uiCanvasCardShellSource, /CanvasCardShell[\s\S]*?<Surface[\s\S]*?className=\{cn\("canvas-card-shell"/)
  assert.match(uiCanvasCardShellSource, /kind="card"[\s\S]*?emphasis="raised"[\s\S]*?interaction=\{selected \? "selected" : "none"\}/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeCard[\s\S]*?<CanvasCardShell[\s\S]*?className=\{cn\("canvas-node-card"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeCardActionButton[\s\S]*?<Button[\s\S]*?className=\{cn\("canvas-node-card-action-button"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeCardBody[\s\S]*?className=\{cn\("canvas-node-card-body"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeCardHeader[\s\S]*?className=\{cn\("canvas-node-card-header"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeCardPreviewText[\s\S]*?data-clamp-lines=\{clampLines\}[\s\S]*?className=\{cn\("canvas-node-card-preview-text"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeCardTextarea[\s\S]*?<Textarea[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-card-textarea"/)
  assert.match(uiCanvasCardNodeSource, /CanvasTextNodeView[\s\S]*?<CanvasNodeCard selected=\{selected\}>[\s\S]*?<CanvasNodeCardTextarea/)
  assert.match(uiCanvasCardNodeSource, /CanvasMediaNodeView[\s\S]*?<CanvasMediaNodeFrame surface=\{surface\}>[\s\S]*?<CanvasMediaEmptyIcon surface=\{surface\}>/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeFooterText[\s\S]*?<p data-tone=\{tone\}[\s\S]*?className=\{cn\("canvas-node-footer-text"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeFrame[\s\S]*?className=\{cn\("canvas-node-frame"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptInputView[\s\S]*?<CanvasNodePromptInputPanel[\s\S]*?<CanvasNodePromptEditor[\s\S]*?<CanvasNodeMentionMenu>/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptInputPanel[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-prompt-panel"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptEditor[\s\S]*?contentEditable[\s\S]*?className=\{cn\("canvas-node-prompt-editor mention-editor"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeMentionMenuItem[\s\S]*?<Button[\s\S]*?className=\{cn\("canvas-node-mention-menu-item"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeAttachmentItem[\s\S]*?<AppInlineMeta asChild[\s\S]*?className=\{cn\("canvas-node-attachment-item"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeApprovalStatus[\s\S]*?className=\{cn\("canvas-node-approval-status", toneTextClass\(tone\)/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeApprovalActionButton[\s\S]*?<Button[\s\S]*?className=\{cn\("canvas-node-approval-action-button", toneSurfaceClass\(actionTone\), toneTextClass\(actionTone\)/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamPanel[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-param-panel"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamSelect[\s\S]*?<NativeSelect[\s\S]*?className=\{cn\("canvas-node-param-control"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortList[\s\S]*?className=\{cn\("nodrag canvas-node-port-list"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePortRow[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("canvas-node-port-row"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeSemanticPortRow[\s\S]*?<CanvasNodePortLabel>\{resolvedPort\.label\}<\/CanvasNodePortLabel>/)
  assert.match(uiCanvasCardNodeSource, /pairCanvasNodeSemanticPorts/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeSemanticPortRows[\s\S]*?<CanvasNodePortList/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeResultPanel[\s\S]*?<AppSurfaceItem[\s\S]*?className=\{cn\("nodrag nowheel canvas-node-result-panel"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeResultStage[\s\S]*?<AppMediaFrame[\s\S]*?className=\{cn\("canvas-node-result-stage"/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeStatusPip[\s\S]*?className=\{cn\("canvas-node-status-pip", toneTextClass\(tone\)/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeStatusPipView[\s\S]*?status === "running" \|\| status === "pending"[\s\S]*?<CanvasNodeStatusPip tone="warning" spinning>/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?statusProps\?: StatusBadgeProps/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeTextResultHeader[\s\S]*?<StatusBadge[\s\S]*?\{\.\.\.statusVisualProps\}/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamControlsView[\s\S]*?<CanvasNodeParamPanel[\s\S]*?<CanvasNodeParamHeader[\s\S]*?<CanvasNodeParamGrid/)
  assert.match(uiCanvasCardSurfaceSource, /CanvasSurfaceItem[\s\S]*?<Surface[\s\S]*?asChild=\{asChild\}[\s\S]*?className=\{cn\("canvas-surface-item"/)
  assert.match(uiCanvasCardSurfaceSource, /emphasis=\{variant === "card" \? "raised" : variant === "muted" \? "muted" : "plain"\}/)
  assert.doesNotMatch(uiCanvasCardSurfaceCss, /\.canvas-surface-item\s*\{[^}]*--ui-surface-(?:background|border|radius)/)
  assert.doesNotMatch(uiCanvasCardSurfaceCss, /\.canvas-surface-item\[data-variant="(?:card|muted)"\]\s*\{[^}]*--ui-surface-background/)
  assert.match(uiCanvasCardPortSource, /export function CanvasPortDot/)
  assert.match(uiCanvasIOSource, /export function CanvasIOActionCard/)
  assert.match(uiCanvasIOSource, /export function CanvasIOPortKindBadge/)
  assert.match(uiCanvasIOSource, /export function CanvasIOPortRow/)
  assert.match(uiCanvasIOSource, /export function CanvasIOMetaPill/)
  assert.match(uiCanvasIOSource, /export function CanvasIOStateTile/)
  assert.match(uiCanvasIOSource, /export function CanvasIOBodyBlock/)
  assert.match(uiCanvasIOSource, /export function CanvasIOEmptyRow/)
  assert.match(uiCanvasIOSource, /export function CanvasIOSectionTitle/)
  assert.match(uiCanvasToolSource, /export function CanvasToolActionCard/)
  assert.match(uiCanvasToolSource, /export function CanvasToolSourceBadge/)
  assert.match(uiCanvasToolSource, /export function CanvasToolStatusBadge/)
  assert.match(uiCanvasToolSource, /export function CanvasToolSlotRow/)
  assert.match(uiCanvasToolSource, /export function CanvasToolConfigPill/)
  assert.match(uiCanvasToolSource, /export function CanvasToolOutputTile/)
  assert.match(uiCanvasToolSource, /export function CanvasToolEmptyRow/)
  assert.match(uiCanvasToolSource, /export function CanvasToolSectionTitle/)
  assert.match(uiCanvasToolSource, /export function canvasToolSlotStateLabel/)
  assert.match(uiCanvasToolSource, /export function canvasToolStatusIntent/)
  assert.match(uiCanvasToolSource, /export function canvasToolStatusKey/)
  assert.match(uiCanvasToolSource, /<StatusBadge\b[\s\S]*?intent=\{canvasToolStatusIntent\(status\)\}/)
  assert.doesNotMatch(uiCanvasToolSource, /\bcanvasToolStatusTone\b/)
  assert.doesNotMatch(uiCanvasToolSource, /\bSemanticTone\b/)
  assert.doesNotMatch(uiCanvasToolSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(uiCanvasCss, /@import "\.\/card\/styles\.css";/)
  assert.doesNotMatch(uiCanvasCss, /@import "\.\/entity\/styles\.css";/)
  assert.match(uiCanvasCss, /@import "\.\/flow\/styles\.css";/)
  assert.match(uiCanvasCss, /@import "\.\/io\/styles\.css";/)
  assert.match(uiCanvasCss, /@import "\.\/tool\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/shell\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/node\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/surface\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/port\/styles\.css";/)
  assert.match(uiCanvasCardCss, /@import "\.\/decision\/styles\.css";/)
  assert.match(uiCanvasCardShellCss, /\.canvas-card-shell\s*\{/)
  assert.doesNotMatch(uiCanvasCardShellCss, /\.canvas-card-shell\s*\{[^}]*--ui-surface-/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card-action-button\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card-body\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card-header\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card-preview-text\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card-preview-text\[data-clamp-lines="4"\]\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-card-textarea\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-frame\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-status-pip\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-footer-text\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-list\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-row\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-label\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-port-required-mark\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-result-panel\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-result-stage\s*\{/)
  assert.match(uiCanvasCardNodeCss, /\.canvas-node-text-result-header\s*\{/)
  assert.match(uiCanvasCardSurfaceCss, /\.canvas-surface-item\s*\{/)
  assert.match(uiCanvasCardPortCss, /\.canvas-port-dot\s*\{/)
  assert.match(uiCanvasFlowCss, /\.canvas-flow\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-port-kind-badge\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-port-row\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-state-tile\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-body-block\s*\{/)
  assert.match(uiCanvasIOCss, /\.canvas-io-action-card\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-action-card\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-source-badge\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-slot-row\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-output-tile\s*\{/)
  assert.match(uiCanvasToolCss, /\.canvas-tool-config-pill\s*\{/)
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
  assert.match(uiCanvasIOSource, /function CanvasIOPortRow[\s\S]*?<AppSurfaceItem[\s\S]*?data-input-port-id/)
  assert.match(uiCanvasIOSource, /function CanvasIOStateTile[\s\S]*?<AppSurfaceItem[\s\S]*?<AppMediaFrame/)
  assert.doesNotMatch(uiCanvasToolSource, /<button\b/)
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

test('projects and video edit shell primitives use @movscript/ui', () => {
  const projectsSource = readProjectFile('apps/frontend/src/features/project/components/ProjectsPage.tsx')
  const projectPagePackageSource = readProjectFile('packages/ui/src/components/business/project/page/index.tsx')
  const projectPagePackageCss = readProjectFile('packages/ui/src/components/business/project/page/styles.css')
  const projectSemanticUiSource = readProjectFile('apps/frontend/src/features/project/presentation/projectSemanticUi.ts')
  const videoEditSource = readProjectFile('apps/frontend/src/features/tools/components/VideoEditPage.tsx')
  const toolVideoEditSource = readProjectFile('packages/ui/src/components/business/tools/video-edit/index.tsx')
  const toolVideoEditCss = readProjectFile('packages/ui/src/components/business/tools/video-edit/styles.css')
  const rawPanelShellPattern = /rounded-lg border border-border bg-card p-3/

  for (const exportName of ['ProjectPageActionButton', 'ProjectPageEmptyState', 'ProjectPageLocalAdminPrompt', 'Progress']) {
    assert.match(projectsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by projects page`)
  }
  assert.match(projectPagePackageSource, /function ProjectPageActionButton[\s\S]*?<Button/)
  assert.match(projectPagePackageSource, /function ProjectPageEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(projectPagePackageSource, /function ProjectPageLocalAdminPrompt[\s\S]*?<AppStateMessage/)
  assert.match(projectPagePackageCss, /\.project-page-local-admin-prompt\s*\{/)
  assert.doesNotMatch(projectsSource, /\b(?:AppEmptyState|AppStateMessage|Button)\b/)
  assert.doesNotMatch(projectsSource, /function EmptyState/)
  assert.doesNotMatch(projectsSource, /<button\b/)
  assert.doesNotMatch(projectsSource, /border-l-2 border-primary px-4 py-3/)
  assert.doesNotMatch(projectsSource, /h-1\.5 flex-1 rounded-full transition-colors/)
  assert.match(projectSemanticUiSource, /export function projectStatusRecipe\b/)
  assert.match(projectsSource, /projectStatusRecipe/)
  assert.doesNotMatch(projectsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(projectsSource, /projectStatusTone/)
  assert.match(projectsSource, /showAdminPrompt[\s\S]*?<ProjectPageLocalAdminPrompt/)
  assert.match(projectsSource, /STATUS_STEPS\.map[\s\S]*?<ProjectPageActionButton[\s\S]*?aria-label=\{t\(step\.labelKey\)\}/)
  assert.match(projectsSource, /variant="ghost"[\s\S]{0,80}tone="danger"[\s\S]{0,120}onDelete/, 'project delete action must use package danger button tone')
  assert.doesNotMatch(projectsSource, /hover:text-destructive/)
  for (const exportName of ['Button', 'CheckboxField', 'Input', 'NativeSelect', 'RangeInput', 'Textarea', 'ToolTimelineClipButton', 'ToolVideoEditPanel', 'ToolVideoEditStage', 'ToolVideoEditStateMessage', 'ToolVideoEditSurface', 'ToolVideoEditTrackControlButton', 'ToolVideoEditWaveform']) {
    assert.match(videoEditSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by video edit page`)
  }
  for (const exportName of ['AppMediaFrame', 'AppPanel', 'AppStateMessage', 'AppSurfaceItem', 'AppWaveformBars']) {
    assert.match(toolVideoEditSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by video edit package wrappers`)
    assert.doesNotMatch(videoEditSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into video edit page`)
  }
  assert.match(toolVideoEditSource, /export function ToolTimelineClipButton/)
  assert.match(toolVideoEditSource, /export function ToolVideoEditPanel/)
  assert.match(toolVideoEditSource, /export function ToolVideoEditStage/)
  assert.match(toolVideoEditSource, /export function ToolVideoEditStateMessage/)
  assert.match(toolVideoEditSource, /export function ToolVideoEditSurface/)
  assert.match(toolVideoEditSource, /export function ToolVideoEditTrackControlButton/)
  assert.match(toolVideoEditSource, /export function ToolVideoEditWaveform/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-panel__body\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-surface\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-stage\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-state-message\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-track-control-button\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-track-control-button\[data-state="danger"\]/)
  assert.match(toolVideoEditCss, /\.tool-video-edit-waveform\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-timeline-clip\s*\{/)
  assert.match(toolVideoEditCss, /\.tool-timeline-clip\[data-kind="video"\]/)
  assert.match(toolVideoEditCss, /\.tool-timeline-clip\[data-kind="caption"\]/)
  assert.doesNotMatch(videoEditSource, /function Panel/)
  assert.doesNotMatch(videoEditSource, rawPanelShellPattern)
  assert.doesNotMatch(videoEditSource, /<select\b/)
  assert.doesNotMatch(videoEditSource, /<textarea\b/)
  assert.doesNotMatch(videoEditSource, /<input\b/)
  assert.doesNotMatch(videoEditSource, /<button\b/)
  assert.doesNotMatch(videoEditSource, /type="range"/)
  assert.doesNotMatch(videoEditSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(videoEditSource, /overflow-hidden rounded-lg border border-border bg-black/)
  assert.doesNotMatch(videoEditSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(videoEditSource, /rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(videoEditSource, /inline-flex h-7 items-center gap-1 rounded-md border border-border/)
  assert.doesNotMatch(videoEditSource, /inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/)
  assert.doesNotMatch(videoEditSource, /inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted/)
  assert.doesNotMatch(videoEditSource, /function clipKindClass/)
  assert.doesNotMatch(videoEditSource, /function WaveformPreview/)
  assert.doesNotMatch(videoEditSource, /min-w-px flex-1 rounded-full bg-current/)
  assert.doesNotMatch(videoEditSource, /border-border bg-card/)
  assert.doesNotMatch(videoEditSource, /border-border bg-muted\/(?:40|60|70)/)
  assert.match(videoEditSource, /<ToolVideoEditStage variant="stage-dark">/)
  assert.doesNotMatch(videoEditSource, /overflow-hidden rounded-lg bg-black/)
  assert.match(videoEditSource, /<RangeInput[\s\S]*?value=\{playheadMs\}/)
  assert.match(videoEditSource, /<Input[\s\S]*?ref=\{importFileRef\}[\s\S]*?type="file"/)
  assert.match(videoEditSource, /clips\.map\(clip => \{[\s\S]*?<ToolTimelineClipButton[\s\S]*?kind=\{clip\.kind\}[\s\S]*?onPointerDown=\{event => beginDrag\(event, clip, 'move'\)\}/)
  assert.match(videoEditSource, /renderError && \([\s\S]*?<ToolVideoEditStateMessage tone="danger"/)
  assert.match(videoEditSource, /projectError && \([\s\S]*?<ToolVideoEditStateMessage tone="danger"/)
  assert.match(videoEditSource, /function ToolbarButton[\s\S]*?<Button/)
  assert.match(videoEditSource, /onAddTrack\(kind as VideoEditTrack\['kind'\]\)[\s\S]*?<Button/)
  assert.match(videoEditSource, /aria-label="缩小时间线"[\s\S]*?<ZoomOut/)
  assert.match(videoEditSource, /aria-label="放大时间线"[\s\S]*?<ZoomIn/)
  assert.match(videoEditSource, /track\.locked[\s\S]*?<ToolVideoEditTrackControlButton[\s\S]*?<Lock/)
  assert.doesNotMatch(videoEditSource, /\btoneTextClass\b/)
})

test('onboarding and app settings use package surface primitives', () => {
  const appSettingsSource = readProjectFile('apps/frontend/src/features/settings/components/AppSettingsPage.tsx')
  const authSource = readProjectFile('apps/frontend/src/features/auth/components/AuthPage.tsx')
  const inviteSource = readProjectFile('apps/frontend/src/features/auth/components/InvitePage.tsx')
  const onboardingSource = readProjectFile('apps/frontend/src/features/onboarding/components/OnboardingPage.tsx')
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
    assert.match(uiAppSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
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
    assert.match(uiAppSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
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
    assert.match(uiAppSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of ['AppChoiceTile', 'AppIconFrame', 'AppSection', 'AppSurfaceItem', 'Button', 'Input', 'Label', 'WorkModeSwitchGuide', 'toneTextClass']) {
    assert.match(uiAppSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by package onboarding components`)
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
    'app-settings-shell',
    'app-settings-header',
    'app-settings-main',
    'app-settings-choice-grid',
    'app-settings-choice-tile',
    'app-settings-info-surface',
    'app-settings-action-row',
  ]) {
    assert.match(uiAppCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  for (const source of [authSource, inviteSource, onboardingSource]) {
    assert.match(source, /from ['"]@movscript\/ui['"]/, 'Work mode consumers must import from @movscript/ui')
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
  assert.match(uiAppSource, /function AuthStateMessage[\s\S]*?<AppStateMessage/)
  assert.match(uiAppSource, /function AuthInlineMeta[\s\S]*?<AppInlineMeta/)
  assert.match(uiAppSource, /function AuthPasswordInput[\s\S]*?<AuthInput[\s\S]*?<Button/)
  assert.doesNotMatch(authSource, /\b(?:AppInlineMeta|AppStateMessage|Button|Input|Label)\b/)
  assert.doesNotMatch(authSource, /className=/)
  assert.doesNotMatch(authSource, /<(?:div|p|h1)\b/)
  for (const exportName of ['AppIconFrame', 'AppSurfaceItem', 'Button']) {
    assert.match(uiAppSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by work mode prompt`)
  }
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/components/app/WorkModePrompt.tsx')), false)
  assert.match(uiAppSource, /export function WorkModePrompt/)
  assert.match(uiAppSource, /export function WorkModeSwitchGuide/)
  assert.match(uiAppSource, /function WorkModeCard[\s\S]*?<AppSurfaceItem asChild[\s\S]*?<Button[\s\S]*?onClick=\{\(\) => onSelect\(mode\)\}/)
  assert.match(uiAppCss, cssClassSelectorPattern('work-mode-prompt'))
  assert.match(uiAppCss, cssClassSelectorPattern('work-mode-card'))
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
  assert.match(uiAppSource, /function AppSettingsField[\s\S]*?<Label/)
  assert.match(uiAppSource, /const AppSettingsInput[\s\S]*?<Input/)
  assert.match(uiAppSource, /const AppSettingsChoiceTile[\s\S]*?<AppChoiceTile/)
  assert.match(uiAppSource, /function AppSettingsFeedbackText[\s\S]*?toneTextClass/)
  assert.match(uiAppSource, /function AppSettingsEndpointSurface[\s\S]*?<AppSettingsInfoSurface/)
  assert.match(uiAppSource, /function AppSettingsInfoSurface[\s\S]*?<AppSurfaceItem/)
  assert.match(uiAppSource, /const AppSettingsActionButton[\s\S]*?<Button/)
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

test('organization workspace pages use package semantic components', () => {
  const orgSelectSource = readProjectFile('apps/frontend/src/features/organization/components/OrgSelectPage.tsx')
  const orgSettingsSource = readProjectFile('apps/frontend/src/features/organization/components/OrgSettingsPage.tsx')
  const organizationPackageSource = readProjectFile('packages/ui/src/components/business/organization/index.tsx')
  const organizationPackageCss = readProjectFile('packages/ui/src/components/business/organization/styles.css')
  const uiStylesSource = readProjectFile('packages/ui/src/styles.css')
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
    assert.match(organizationPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by package organization UI`)
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
    assert.match(orgSettingsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by org settings page`)
    assert.match(organizationPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by package organization UI`)
  }
  assert.match(orgSettingsSource, /\bNativeSelect\b/)
  assert.match(orgSettingsSource, /\bCheckboxField\b/)
  assert.match(organizationPackageSource, /\bAppSurfaceItem\b/)
  assert.match(organizationPackageSource, /\bAppControlGroup\b/)
  assert.match(organizationPackageSource, /\bAppDataTable\b/)
  assert.match(organizationPackageSource, /\bAppDataTableHeader\b/)
  assert.match(organizationPackageSource, /\bAppDataTableRow\b/)
  assert.match(organizationPackageSource, /\bAppEmptyState\b/)
  assert.match(organizationPackageSource, /\bAppMetricCard\b/)
  assert.match(organizationPackageSource, /\bAppStateMessage\b/)
  assert.match(organizationPackageSource, /\btoneSurfaceClass\("danger"\)/)
  assert.match(organizationPackageSource, /\btoneTextClass\("danger"\)/)
  assert.match(organizationPackageSource, /\btoneTextClass\("success"\)/)
  assert.match(uiStylesSource, /@import "\.\/components\/business\/organization\/styles\.css";/)
  assert.match(organizationPackageCss, /\.organization-list-surface\s*\{/)
  assert.match(organizationPackageCss, /\.organization-select-current-card\s*\{/)
  assert.match(organizationPackageCss, /\.organization-select-action-tile\s*\{/)
  assert.match(organizationPackageCss, /\.organization-select-membership-list\s*\{/)
  assert.match(organizationPackageCss, /\.organization-select-membership-button\s*\{/)
  assert.match(organizationPackageCss, /\.organization-generation-tool-server-card\s*\{/)
  assert.match(organizationPackageCss, /\.organization-tabs\s*\{/)
  assert.match(organizationSemanticUiSource, /organizationSaveRecipe/)
  assert.match(organizationSemanticUiSource, /organizationServerEnabledRecipe/)
  assert.match(organizationSemanticUiSource, /organizationDefaultServerRecipe/)
  assert.match(orgSettingsSource, /organizationSaveRecipe/)
  assert.match(orgSettingsSource, /organizationServerEnabledRecipe/)
  assert.match(orgSettingsSource, /organizationDefaultServerRecipe/)
  assert.doesNotMatch(orgSettingsSource, /<StatusBadge\b[^>]*\btone=/)
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
  assert.doesNotMatch(orgSettingsSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(orgSettingsSource, /rounded-lg border border-dashed border-border/)
  assert.doesNotMatch(orgSettingsSource, /border border-border rounded-lg divide-y divide-border/)
  assert.doesNotMatch(orgSettingsSource, /rounded-lg border border-border px-4 py-3/)
  assert.doesNotMatch(orgSettingsSource, /rounded-lg border border-border bg-foreground px-4 py-3/)
  assert.doesNotMatch(orgSettingsSource, /border border-border rounded-lg overflow-hidden/)
  assert.doesNotMatch(orgSettingsSource, /bg-card/)
  assert.doesNotMatch(orgSettingsSource, /hover:bg-card/)
  assert.doesNotMatch(orgSettingsSource, /rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(orgSettingsSource, /border-destructive\/40/)
  assert.doesNotMatch(orgSettingsSource, /text-destructive/)
  assert.doesNotMatch(orgSettingsSource, /hover:text-destructive/)
  assert.doesNotMatch(orgSettingsSource, /<t(?:h|d)\b[^>]*className=/)
  assert.doesNotMatch(orgSettingsSource, /<tbody\b[^>]*className=/)
  assert.doesNotMatch(orgSettingsSource, /\b(?:px-4 py-2\.5|px-4 py-8|divide-y divide-border|tabular-nums)\b/)
  assert.doesNotMatch(orgSettingsSource, /<button\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppControlGroup\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppDataTable\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppDataTableHeader\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppDataTableRow\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppEmptyState\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppMetricCard\b/)
  assert.doesNotMatch(orgSettingsSource, /\bAppStateMessage\b/)
  assert.doesNotMatch(orgSettingsSource, /\btoneSurfaceClass\b/)
  assert.doesNotMatch(orgSettingsSource, /\btoneTextClass\b/)
  assert.match(orgSettingsSource, /invalid=\{invalid\}/)
  assert.match(orgSettingsSource, /<OrganizationConnectionStatus success=\{testResult\.success\}>/)
  assert.match(orgSettingsSource, /function UsageTab[\s\S]*?<OrganizationUsageMetricCard/)
  assert.match(orgSettingsSource, /settingsQuery\.error[\s\S]*?<OrganizationStatusMessage tone="danger"/)
  assert.match(orgSettingsSource, /tabs\.map[\s\S]*?<OrganizationTabButton[\s\S]*?variant=\{tab === key \? 'solid' : 'ghost'\}/)
  assert.doesNotMatch(orgSettingsSource, /<select\b/)
  assert.doesNotMatch(orgSettingsSource, /<input\b[\s\S]{0,80}type="checkbox"/)
})

test('plugin tool page uses package form controls', () => {
  const clientPluginsSource = readProjectFile('apps/frontend/src/features/plugins/components/ClientPluginsPage.tsx')
  const pluginToolSource = readProjectFile('apps/frontend/src/features/plugins/components/PluginToolPage.tsx')
  const pluginsPackageSource = readProjectFile('packages/ui/src/components/business/plugins/index.tsx')
  const pluginsPackageCss = readProjectFile('packages/ui/src/components/business/plugins/styles.css')

  for (const exportName of ['AppCodeBlock', 'AppInlineMeta', 'AppStateMessage', 'AppSurfaceItem', 'Button', 'Input', 'NativeSelect', 'Textarea']) {
    assert.match(pluginsPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by plugins package UI`)
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
    assert.match(pluginsPackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of ['PluginCardSurface', 'PluginDialogSurface', 'PluginEmptyState', 'PluginInlineMeta', 'PluginStateBanner', 'PluginStatusMeta', 'PluginTabGroup', 'PluginTagMeta', 'PluginToneText', 'Button', 'Input']) {
    assert.match(clientPluginsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by client plugins page`)
  }
  for (const exportName of ['AppControlGroup', 'AppEmptyState', 'AppInlineMeta', 'AppStateMessage', 'AppSurfaceItem', 'toneTextClass']) {
    assert.match(pluginsPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by plugins package UI`)
  }
  assert.match(pluginsPackageCss, /\.plugin-card-surface/)
  assert.match(pluginsPackageCss, /\.plugin-state-banner/)
  assert.match(pluginsPackageCss, /\.plugin-tool-root/)
  assert.match(pluginsPackageCss, /\.plugin-tool-form-stack/)
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
  assert.match(clientPluginsSource, /<Input[\s\S]*?ref=\{fileInputRef\}[\s\S]*?type="file"/)
  assert.match(clientPluginsSource, /<PluginTabGroup>[\s\S]*?variant=\{tab === 'installed' \? 'solid' : 'ghost'\}/)
  assert.match(clientPluginsSource, /variant=\{tab === 'marketplace' \? 'solid' : 'ghost'\}/)
})

test('generic tool pages use package form controls', () => {
  const toolPageSource = readProjectFile('apps/frontend/src/features/tools/components/ToolPage.tsx')
  const toolDialogSource = readProjectFile('apps/frontend/src/features/tools/components/ToolDialog.tsx')
  const brainstormSource = readProjectFile('apps/frontend/src/features/tools/components/BrainstormPage.tsx')
  const modelSelectorSource = readProjectFile('apps/frontend/src/shared/ui/ModelSelector.tsx')
  const toolHeaderPackageSource = readProjectFile('packages/ui/src/components/business/tools/index.tsx')
  const toolHeaderSource = readProjectFile('packages/ui/src/components/business/tools/header/index.tsx')
  const toolDialogPackageSource = readProjectFile('packages/ui/src/components/business/tools/dialog/index.tsx')
  const toolDialogPackageCss = readProjectFile('packages/ui/src/components/business/tools/dialog/styles.css')
  const toolBrainstormSource = readToolsBrainstormSource()
  const toolBrainstormCss = readToolsBrainstormCss()
  const toolWorkspaceSource = readToolsWorkspaceSource()
  const toolHeaderPackageCss = readProjectFile('packages/ui/src/components/business/tools/styles.css')
  const toolWorkspaceCss = readToolsWorkspaceCss()
  const generationModelSelectorSource = readProjectFile('packages/ui/src/components/business/generation/model-selector/index.tsx')
  const generationModelSelectorCss = readProjectFile('packages/ui/src/components/business/generation/model-selector/styles.css')

  assert.match(toolPageSource, /\bNativeSelect\b/)
  assert.match(toolPageSource, /\bButton\b/)
  assert.doesNotMatch(toolPageSource, /\bToolHeader\b/)
  assert.doesNotMatch(brainstormSource, /\bToolHeader\b/)
  for (const exportName of [
    'ToolActionBar',
    'ToolHiddenFileInput',
    'ToolOutputDownloadAction',
    'ToolOutputMediaShell',
    'ToolOutputPanel',
    'ToolOutputStage',
    'ToolOutputState',
    'ToolPageFrame',
    'ToolPanel',
    'ToolPanelHeader',
    'ToolPanelSection',
    'ToolResourceGrid',
    'ToolResourceRemoveButton',
    'ToolResourceTile',
    'ToolUploadTile',
  ]) {
    assert.match(toolPageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by tool page`)
  }
  assert.match(toolPageSource, /from '@movscript\/ui'/)
  assert.match(toolDialogSource, /\bButton\b/)
  assert.doesNotMatch(toolDialogSource, /\bToolHeader\b/)
  for (const exportName of [
    'ToolDialogBody',
    'ToolDialogCopyButton',
    'ToolDialogDebugEndpoint',
    'ToolDialogDebugHeaders',
    'ToolDialogDebugJsonBlock',
    'ToolDialogDebugKV',
    'ToolDialogDebugPanel',
    'ToolDialogDebugSection',
    'ToolDialogDebugStatus',
    'ToolDialogDebugTitle',
    'ToolDialogEmptyState',
    'ToolDialogFrame',
    'ToolDialogHistoryCount',
    'ToolDialogHistoryHeader',
    'ToolDialogHistoryList',
    'ToolDialogHistoryPager',
    'ToolDialogHistoryShell',
    'ToolDialogHistoryTitle',
    'ToolDialogMain',
    'ToolDialogPanel',
    'ToolDialogPanelHeader',
    'ToolDialogWarningCallout',
  ]) {
    assert.match(toolDialogSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by tool dialog`)
    assert.match(toolDialogPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by package tool dialog UI`)
  }
  for (const exportName of ['AppCodeBlock', 'AppEmptyState', 'AppInlineMeta', 'AppSurfaceItem', 'ReviewCallout', 'toneTextClass']) {
    assert.match(toolDialogPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be hidden inside package tool dialog UI`)
  }
  assert.doesNotMatch(toolDialogSource, /\b(?:AppCodeBlock|AppEmptyState|AppInlineMeta|AppSurfaceItem|ReviewCallout|toneTextClass)\b/)
  assert.match(toolDialogSource, /function JsonBlock[\s\S]*?<ToolDialogDebugJsonBlock/)
  assert.match(toolDialogSource, /function DebugPanel[\s\S]*?<ToolDialogDebugPanel/)
  assert.match(brainstormSource, /\bTextarea\b/)
  assert.match(brainstormSource, /\bButton\b/)
  assert.doesNotMatch(brainstormSource, /\bToolHeader\b/)
  for (const exportName of [
    'ToolBrainstormActionRow',
    'ToolBrainstormAttachmentChip',
    'ToolBrainstormAttachmentList',
    'ToolBrainstormBody',
    'ToolBrainstormComposerFrame',
    'ToolBrainstormDivider',
    'ToolBrainstormEmptyFooter',
    'ToolBrainstormEmptyState',
    'ToolBrainstormFrame',
    'ToolBrainstormHistoryDrawer',
    'ToolBrainstormHistoryList',
    'ToolBrainstormHistoryToggle',
    'ToolBrainstormMain',
    'ToolBrainstormMentionButton',
    'ToolBrainstormMentionList',
    'ToolBrainstormPanel',
    'ToolBrainstormPanelHeader',
    'ToolBrainstormResultCard',
    'ToolBrainstormSectionHeader',
  ]) {
    assert.match(brainstormSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by brainstorm page`)
    assert.match(toolBrainstormSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by package brainstorm UI`)
    assert.match(toolHeaderPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from tools package`)
  }
  assert.match(modelSelectorSource, /\bGenerationModelSelector\b/)
  assert.match(modelSelectorSource, /onRefresh=\{\(\) => refetch\(\)\}/)
  assert.match(generationModelSelectorSource, /export function GenerationModelSelector/)
  assert.match(generationModelSelectorSource, /\bSelect\b/)
  assert.match(generationModelSelectorSource, /\bSelectItem\b/)
  assert.match(generationModelSelectorSource, /\bButton\b/)
  assert.match(generationModelSelectorCss, /\.generation-model-selector\s*\{/)
  for (const exportName of ['Button', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue']) {
    assert.doesNotMatch(modelSelectorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package model selector`)
  }
  assert.match(toolHeaderPackageSource, /export \{ ToolHeader, type ToolHeaderProps \} from "\.\/header"/)
  assert.match(toolHeaderPackageSource, /from "\.\/brainstorm"/)
  assert.match(toolHeaderPackageSource, /from "\.\/workspace"/)
  assert.match(toolHeaderSource, /export function ToolHeader/)
  assert.match(toolHeaderSource, /data-testid="tool-header"/)
  assert.match(toolHeaderPackageCss, /@import "\.\/header\/styles\.css";/)
  assert.match(toolHeaderPackageCss, /@import "\.\/brainstorm\/styles\.css";/)
  assert.match(toolHeaderPackageCss, /@import "\.\/dialog\/styles\.css";/)
  assert.match(toolHeaderPackageCss, /@import "\.\/workspace\/styles\.css";/)
  assert.match(toolDialogPackageSource, /function ToolDialogPanel[\s\S]*?<AppPanel/)
  assert.match(toolDialogPackageSource, /function ToolDialogDebugJsonBlock[\s\S]*?<AppSurfaceItem[\s\S]*?<AppCodeBlock/)
  assert.match(toolDialogPackageSource, /function ToolDialogHistoryCount[\s\S]*?<AppInlineMeta/)
  assert.match(toolDialogPackageSource, /function ToolDialogEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(toolDialogPackageSource, /function ToolDialogWarningCallout[\s\S]*?<ReviewCallout/)
  assert.match(toolDialogPackageSource, /\btoneTextClass\("success"\)/)
  assert.match(toolDialogPackageSource, /\btoneTextClass\("danger"\)/)
  assert.match(toolDialogPackageCss, /\.tool-dialog-frame\s*\{/)
  assert.match(toolDialogPackageCss, /\.tool-dialog-panel\s*\{/)
  assert.match(toolDialogPackageCss, /\.tool-dialog-debug-panel\s*\{/)
  assert.match(toolBrainstormSource, /function ToolBrainstormPanel[\s\S]*?<AppPanel/)
  assert.match(toolBrainstormSource, /function ToolBrainstormAttachmentChip[\s\S]*?<AppInlineMeta/)
  assert.match(toolBrainstormSource, /function ToolBrainstormMentionList[\s\S]*?<AppSurfaceItem/)
  assert.match(toolBrainstormSource, /function ToolBrainstormResultCard[\s\S]*?<AppSurfaceItem/)
  assert.match(toolBrainstormSource, /function ToolBrainstormEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(toolBrainstormSource, /\btoneTextClass\("danger"\)/)
  assert.match(toolBrainstormCss, /\.tool-brainstorm-frame\s*\{/)
  assert.match(toolBrainstormCss, /\.tool-brainstorm-panel\s*\{/)
  assert.match(toolBrainstormCss, /\.tool-brainstorm-result-card\s*\{/)
  assert.match(toolWorkspaceSource, /export function ToolPageFrame/)
  assert.match(toolWorkspaceSource, /export function ToolPanel/)
  assert.match(toolWorkspaceSource, /ToolPanel[\s\S]*?<Surface[\s\S]*?emphasis="raised"/)
  assert.match(toolWorkspaceSource, /export function ToolResourceTile/)
  assert.match(toolWorkspaceSource, /export const ToolResourceRemoveButton/)
  assert.match(toolWorkspaceSource, /export const ToolHiddenFileInput/)
  assert.match(toolWorkspaceSource, /export function ToolOutputPanel/)
  assert.match(toolWorkspaceCss, /\.tool-page-frame\s*\{/)
  assert.doesNotMatch(toolWorkspaceCss, /\.tool-panel\s*\{[^}]*--ui-surface-/)
  assert.match(toolWorkspaceCss, /\.tool-action-bar\s*\{/)
  assert.match(toolWorkspaceCss, /\.tool-output-download-action\s*\{/)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/tools/components/ToolHeader.tsx')), false, 'tool header UI must live in @movscript/ui')
  assert.doesNotMatch(`${toolPageSource}\n${toolDialogSource}\n${brainstormSource}`, /@\/features\/tools\/components\/ToolHeader/)
  assert.doesNotMatch(toolPageSource, /\bCard\b/)
  assert.doesNotMatch(toolPageSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(toolPageSource, /\bAppMediaFrame\b/)
  assert.doesNotMatch(toolPageSource, /<select\b/)
  assert.doesNotMatch(toolPageSource, /<button\b/)
  assert.doesNotMatch(toolPageSource, /<input\b/)
  assert.doesNotMatch(toolPageSource, /w-20 h-20 bg-muted rounded-lg border border-border/)
  assert.doesNotMatch(toolPageSource, /bg-card border border-border rounded-full flex items-center justify-center/)
  assert.doesNotMatch(toolPageSource, /border border-dashed border-border bg-muted\/20 rounded-lg/)
  assert.doesNotMatch(toolPageSource, /px-3 py-2\.5 bg-muted\/30/)
  assert.doesNotMatch(toolPageSource, /bg-muted\/20 min-h-\[80px\]/)
  assert.doesNotMatch(toolPageSource, /flex flex-col h-full/)
  assert.doesNotMatch(toolPageSource, /flex-1 overflow-y-auto px-4 py-4 space-y-4/)
  assert.doesNotMatch(toolPageSource, /rounded-lg border-border bg-card/)
  assert.match(toolPageSource, /state\.inputResources\.map[\s\S]*?<ToolResourceRemoveButton[\s\S]*?aria-label="移除输入资源"/)
  assert.match(toolPageSource, /<ToolUploadTile>[\s\S]*?<Button[\s\S]*?fileRef\.current\?\.click/)
  assert.match(toolPageSource, /<ToolHiddenFileInput[\s\S]*?accept=\{accept\}/)
  assert.match(toolPageSource, /<ToolOutputDownloadAction>[\s\S]*?<a href=\{outputSrc\} download=\{state\.outputResource\?\.name\}/)
  assert.doesNotMatch(toolDialogSource, /<pre\b/)
  assert.doesNotMatch(toolDialogSource, /<button\b/)
  assert.doesNotMatch(toolDialogSource, /text-destructive/)
  assert.doesNotMatch(toolDialogSource, /text-\[var\(--ms-color-success\)\]/)
  assert.doesNotMatch(toolDialogSource, /\bAppPanel\b/, 'ToolDialog primary generation surface must use package tool dialog panel')
  assert.doesNotMatch(toolDialogSource, /\bCard(Content|Footer)?\b/)
  assert.doesNotMatch(toolDialogSource, /border-border bg-card bg-none text-card-foreground shadow-sm/)
  assert.doesNotMatch(toolDialogSource, /<pre className=\{`bg-background\/50 rounded p-2/)
  assert.doesNotMatch(toolDialogSource, /<div className="bg-background\/50 rounded p-2/)
  assert.doesNotMatch(toolDialogSource, /bg-muted\/30 rounded-lg p-3/)
  assert.doesNotMatch(toolDialogSource, /rounded border border-border hover:bg-muted\/50/)
  assert.doesNotMatch(toolDialogSource, /inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/)
  assert.doesNotMatch(toolDialogSource, /rounded-md border border-border bg-card px-3 py-2/)
  assert.doesNotMatch(toolDialogSource, /bg-muted text-muted-foreground rounded-full/)
  assert.doesNotMatch(toolDialogSource, /p-1 rounded hover:bg-muted/)
  assert.doesNotMatch(toolDialogSource, /flex flex-col items-center gap-2 py-10/)
  assert.match(toolDialogSource, /variant=\{debugMode \? 'soft' : 'outline'\}/)
  assert.match(toolDialogSource, /attachmentMismatchWarnings\.map[\s\S]*?<ToolDialogWarningCallout/)
  assert.match(toolDialogSource, /historyTotal > 0[\s\S]*?<ToolDialogHistoryCount/)
  assert.match(toolDialogSource, /jobs\.length === 0[\s\S]*?<ToolDialogEmptyState/)
  assert.doesNotMatch(brainstormSource, /<textarea\b/)
  assert.doesNotMatch(brainstormSource, /text-destructive/)
  assert.doesNotMatch(brainstormSource, /\bAppPanel\b/, 'Brainstorm primary surface must use package brainstorm panel')
  assert.doesNotMatch(brainstormSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(brainstormSource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(brainstormSource, /\bAppEmptyState\b/)
  assert.doesNotMatch(brainstormSource, /\btoneTextClass\b/)
  assert.doesNotMatch(brainstormSource, /\bCard(Content|Footer)?\b/)
  assert.doesNotMatch(brainstormSource, /border-border bg-card bg-none text-card-foreground shadow-sm/)
  assert.doesNotMatch(brainstormSource, /hover:bg-muted\/50/)
  assert.doesNotMatch(brainstormSource, /<button\b/)
  assert.doesNotMatch(brainstormSource, /absolute left-0 bottom-full mb-1 w-full bg-popover border border-border rounded-lg shadow-lg/)
  assert.doesNotMatch(brainstormSource, /flex flex-col items-center gap-2 text-muted-foreground\/40/)
  assert.doesNotMatch(brainstormSource, /bg-muted text-muted-foreground rounded-full/)
  assert.doesNotMatch(brainstormSource, /rounded-lg border border-border bg-muted\/30 p-3/)
  assert.doesNotMatch(brainstormSource, /bg-muted\/40 rounded-md p-2\.5/)
  assert.match(brainstormSource, /mentionQuery !== null[\s\S]*?<ToolBrainstormMentionList[\s\S]*?mentionResults\.map[\s\S]*?<ToolBrainstormMentionButton/)
  assert.match(brainstormSource, /historyEntries\.length > 0[\s\S]*?<ToolBrainstormHistoryToggle[\s\S]*?setHistoryExpanded/)
  assert.match(brainstormSource, /history\.length === 0[\s\S]*?<ToolBrainstormEmptyState/)
  assert.doesNotMatch(modelSelectorSource, /<button\b/)
})

test('top app controls use package form controls', () => {
  const appSource = readProjectFile('apps/frontend/src/App.tsx')
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
  const uiAppSource = readAppSource()
  const uiAppCss = readAppCss()

  assert.match(appSource, /\bButton\b/)
  assert.match(appSource, /\bInput\b/)
  assert.doesNotMatch(appSource, /\btoneTextClass\b/)
  assert.match(appSource, /\bAppErrorFallback\b/)
  assert.match(appSource, /\bAppBackendBootOverlay\b/)
  assert.match(uiAppSource, /function AppErrorFallback[\s\S]*?<AppIconFrame[\s\S]*?tone="danger"[\s\S]*?<Button/)
  assert.match(uiAppSource, /function AppBackendBootOverlay[\s\S]*?<AppSurfaceItem[\s\S]*?<AppIconFrame size="lg" tone=\{tone\}[\s\S]*?<AppInlineMeta/)
  assert.match(uiAppSource, /function AppBackendBootActionButton[\s\S]*?<Button/)
  assert.match(appSource, /\bAppWindowIconButton\b/)
  assert.doesNotMatch(appSource, /\b(?:AppIconFrame|AppInlineMeta|AppSurfaceItem)\b/)
  assert.match(appSource, /class ErrorBoundary[\s\S]*?<AppErrorFallback/)
  assert.match(appSource, /function BackendBootOverlay[\s\S]*?<AppBackendBootOverlay/)
  assert.match(appSource, /function CanvasHeaderLeft[\s\S]*?<Input[\s\S]*?value=\{canvasName\}/)
  assert.match(appSource, /function CanvasHeaderLeft[\s\S]*?<AppWindowIconButton[\s\S]*?canvasBackPath\(search\)/)
  assert.match(appSource, /function CanvasHeaderActions[\s\S]*?<AppWindowIconButton[\s\S]*?ROUTES\.resources/)
  assert.match(appSource, /const sidebarHeaderControl[\s\S]*?<AppWindowIconButton[\s\S]*?app-window-sidebar-toggle/)
  assert.doesNotMatch(appSource, /<button\b/)
  assert.doesNotMatch(appSource, /<input\b/)
  assert.doesNotMatch(appSource, /text-destructive/)
  assert.doesNotMatch(appSource, /inline-flex h-8 items-center rounded-md border border-border/)
  assert.doesNotMatch(appSource, /rounded-md bg-muted px-3 py-2 font-mono/)
  assert.doesNotMatch(appSource, /flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted\/50 hover:text-foreground/)
  assert.doesNotMatch(appSource, /app-window-sidebar-toggle flex shrink-0 items-center justify-center rounded-md text-muted-foreground/)
  assert.match(appTopControlsSource, /\bAppTopLanguageSelect\b/)
  assert.doesNotMatch(appTopControlsSource, /\bNativeSelect\b/)
  assert.match(uiAppSource, /function AppTopLanguageSelect[\s\S]*?<NativeSelect/)
  assert.doesNotMatch(appTopControlsSource, /<select\b/)
  assert.doesNotMatch(appTopControlsSource, /rounded-md border border-border bg-background/)
  assert.match(headerSource, /\bAppTopControlButton\b/)
  assert.match(headerSource, /\bAppWindowBrandButton\b/)
  assert.match(headerSource, /\bAppWindowHeader\b/)
  assert.match(headerSource, /\bAppWindowControls\b/)
  assert.match(sidebarSource, /\bAppSidebarShell\b/)
  assert.match(sidebarSource, /\bAppSidebarSection\b/)
  assert.match(sidebarSource, /\bAppSidebarActionItem\b/)
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
  assert.match(headerSource, /DropdownMenuTrigger asChild[\s\S]*?<AppTopControlButton/)
  assert.match(headerSource, /<AppWindowBrandButton>[\s\S]*?<span>Movscript<\/span>/)
  assert.match(sidebarSource, /function NavItem[\s\S]*?<AppSidebarNavItemFrame/)
  assert.match(sidebarSource, /<AppSidebarActionItem[\s\S]*?openAdminConsole/)
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
    assert.match(appShellLayoutSource + appShellWindowSource + appShellSidebarSource + uiAppSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'user-profile',
    'user-profile-header',
    'user-profile-card',
    'user-profile-identity',
    'user-profile-actions',
    'user-profile-logout-button',
  ]) {
    assert.match(uiAppCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(uiAppSource, /\bAppAvatar\b/)
  assert.match(uiAppSource, /\bButton\b/)
  assert.match(userProfileSource, /<UserProfileIdentity[\s\S]*?name=\{currentUser\?\.username\}/)
  assert.match(userProfileSource, /<UserProfileLogoutButton[\s\S]*?onClick=\{\(\) => setCurrentUser\(null\)\}/)
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

test('canvas workflow surfaces use package tone contracts', () => {
  const canvasGenBodySource = readProjectFile('apps/frontend/src/shared/ui/CanvasGenBody.tsx')
  const canvasWorkflowPanelsSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasWorkflowPanels.tsx')
  const canvasResourceShelfSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasResourceShelf.tsx')
  const canvasListSource = readProjectFile('apps/frontend/src/features/canvas/components/CanvasListPage.tsx')
  const canvasEditorSource = readProjectFile('apps/frontend/src/features/canvas/components/CanvasEditorPage.tsx')
  const canvasContextMenuSource = readProjectFile('apps/frontend/src/features/canvas/ui/ContextMenu.tsx')
  const canvasNodesSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasNodes.tsx')
  const canvasContextMenuPackageSource = readProjectFile('packages/ui/src/components/business/canvas/context-menu/index.tsx')
  const canvasContextMenuPackageCss = readProjectFile('packages/ui/src/components/business/canvas/context-menu/styles.css')
  const canvasEditorPackageSource = readProjectFile('packages/ui/src/components/business/canvas/editor/index.tsx')
  const canvasEditorPackageCss = readProjectFile('packages/ui/src/components/business/canvas/editor/styles.css')
  const canvasListPackageSource = readProjectFile('packages/ui/src/components/business/canvas/list/index.tsx')
  const canvasListPackageCss = readProjectFile('packages/ui/src/components/business/canvas/list/styles.css')
  const canvasWorkflowPackageSource = readProjectFile('packages/ui/src/components/business/canvas/workflow/index.tsx')
  const canvasWorkflowPackageCss = readProjectFile('packages/ui/src/components/business/canvas/workflow/styles.css')
  const canvasGenerationSource = readProjectFile('packages/ui/src/components/business/canvas/generation/index.tsx')
  const canvasGenerationCss = readProjectFile('packages/ui/src/components/business/canvas/generation/styles.css')
  const canvasMediaSource = readProjectFile('packages/ui/src/components/business/canvas/media/index.tsx')
  const canvasMediaCss = readProjectFile('packages/ui/src/components/business/canvas/media/styles.css')
  const canvasResourceShelfUiSource = readProjectFile('packages/ui/src/components/business/canvas/resource-shelf/index.tsx')
  const canvasResourceShelfUiCss = readProjectFile('packages/ui/src/components/business/canvas/resource-shelf/styles.css')
  const canvasMentionSource = readProjectFile('packages/ui/src/components/business/canvas/mention/index.tsx')
  const canvasMentionCss = readProjectFile('packages/ui/src/components/business/canvas/mention/styles.css')
  const canvasFlowSource = readProjectFile('packages/ui/src/components/business/canvas/flow/index.tsx')
  const uiCanvasCardNodeSource = [
    'packages/ui/src/components/business/canvas/card/node/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/handles/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/core/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/ports/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/result/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/prompt/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/attachment/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/params/index.tsx',
    'packages/ui/src/components/business/canvas/card/node/approval/index.tsx',
  ].map(readProjectFile).join('\n')
  const canvasEditorUiImport = canvasEditorSource.match(/import\s+\{([\s\S]*?)\}\s+from '@movscript\/ui'/)?.[1] ?? ''
  const canvasFlowCss = readProjectFile('packages/ui/src/components/business/canvas/flow/styles.css')
  const sources = [
    'apps/frontend/src/features/canvas/ui/CanvasResourceShelf.tsx',
    'apps/frontend/src/features/canvas/components/CanvasListPage.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + canvasNodesSource
    + '\n'
    + canvasWorkflowPanelsSource
    + '\n'
    + canvasGenBodySource
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match([
    sources,
    canvasResourceShelfUiSource,
    canvasWorkflowPackageSource,
    canvasFlowSource,
    canvasGenerationSource,
    canvasMediaSource,
  ].join('\n'), /toneTextClass|toneSurfaceClass|accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class/)
  for (const exportName of [
    'CanvasListCreateActionButton',
    'CanvasListCreateActions',
    'CanvasListCreateButton',
    'CanvasListCreateDialog',
    'CanvasListCreateDialogBody',
    'CanvasListCreateField',
    'CanvasListCreateInput',
    'CanvasListCreateLabel',
    'CanvasListCreateTypeDescription',
    'CanvasListCreateTypeGrid',
    'CanvasListCreateTypeLabel',
    'CanvasListCreateTypeTile',
    'CanvasListDescription',
    'CanvasListEmpty',
    'CanvasListEmptyActionButton',
    'CanvasListHeader',
    'CanvasListHeaderText',
    'CanvasListItem',
    'CanvasListItemActionButton',
    'CanvasListItemActions',
    'CanvasListItemBody',
    'CanvasListItemIcon',
    'CanvasListItemName',
    'CanvasListItemNameInput',
    'CanvasListItems',
    'CanvasListLoading',
    'CanvasListShell',
    'CanvasListTitle',
    'CanvasListTypeBadge',
  ]) {
    assert.match(canvasListSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas list page`)
  }
  for (const packageExportName of [
    'CanvasListShell',
    'CanvasListItem',
    'CanvasListError',
    'CanvasListTypeBadge',
    'CanvasListCreateDialog',
    'CanvasListCreateTypeTile',
  ]) {
    assert.match(canvasListPackageSource, new RegExp(`export (?:function|const) ${packageExportName}\\b`), `${packageExportName} must be package-owned`)
  }
  for (const exportName of ['AppChoiceTile', 'AppCreateDialog', 'AppEmptyState', 'AppSurfaceItem', 'Badge', 'Button', 'Input', 'Label']) {
    assert.match(canvasListPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by the package canvas list layer`)
  }
  assert.match(canvasListPackageSource, /function CanvasListError[\s\S]*?toneTextClass\("danger"\)/)
  for (const className of [
    'canvas-list',
    'canvas-list__header',
    'canvas-list-error',
    'canvas-list-item',
    'canvas-list-item__type',
    'canvas-list-create-dialog__type-grid',
    'canvas-list-create-type__description',
  ]) {
    assert.match(canvasListPackageCss, new RegExp(`\\.${className}\\b`), `${className} style must be package-owned`)
  }
  assert.match(canvasListSource, /canvases\.map\(\(cv\)[\s\S]*?<CanvasListItem key=\{cv\.ID\}>/)
  assert.match(canvasListSource, /<CanvasListTypeBadge icon=\{meta\.icon\}>\{t\(meta\.labelKey\)\}<\/CanvasListTypeBadge>/)
  assert.match(canvasListSource, /Object\.keys\(TYPE_META\)[\s\S]*?<CanvasListCreateTypeTile[\s\S]*?selected=\{selected\}/)
  assert.doesNotMatch(canvasListSource, /\b(?:AppChoiceTile|AppCreateDialog|AppEmptyState|AppSurfaceItem|Badge|Button|Input|Label)\b/)
  assert.doesNotMatch(canvasListSource, /className=/)
  assert.doesNotMatch(canvasListSource, /<(?:div|span|p|h1)\b/)
  assert.doesNotMatch(canvasListSource, /<button\b/)
  assert.doesNotMatch(canvasListSource, /h-auto justify-start rounded-lg border px-3 py-2 text-left transition-colors/)
  assert.doesNotMatch(canvasListSource, /border border-border rounded-lg px-4 py-3 bg-background shadow-sm flex items-center gap-3/)
  assert.doesNotMatch(canvasListSource, /color: 'bg-muted text-foreground border-border'/)
  assert.doesNotMatch(canvasListSource, /border-border bg-muted\/30 text-foreground hover:border-foreground\/40/)
  for (const exportName of ['CanvasMediaFill', 'CanvasResizeHandleButton']) {
    assert.match(canvasWorkflowPanelsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas workflow panels`)
  }
  for (const exportName of [
    'CanvasRunStatusBadge',
    'CanvasWorkflowHistoryDuration',
    'CanvasWorkflowHistoryView',
    'CanvasWorkflowSideBody',
    'CanvasWorkflowSideHeader',
    'CanvasWorkflowSideIconButton',
    'CanvasWorkflowSidePanel',
    'CanvasWorkflowSideRail',
    'CanvasWorkflowSideTabButton',
    'CanvasWorkflowSideTabGroup',
    'CanvasWorkflowSideTabLabel',
    'CanvasWorkflowRunResultsView',
  ]) {
    assert.match(canvasWorkflowPanelsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas workflow panels`)
  }
  for (const exportName of [
    'CanvasWorkflowRunResultsActionButton',
    'CanvasWorkflowRunResultsActions',
    'CanvasWorkflowRunResultsBody',
    'CanvasWorkflowRunResultsCard',
    'CanvasWorkflowRunResultsCardBody',
    'CanvasWorkflowRunResultsCardContent',
    'CanvasWorkflowRunResultsCloseButton',
    'CanvasWorkflowRunResultsCodeBlock',
    'CanvasWorkflowRunResultsEmpty',
    'CanvasWorkflowRunResultsGrid',
    'CanvasWorkflowRunResultsHeader',
    'CanvasWorkflowRunResultsMediaFrame',
    'CanvasWorkflowRunResultsMeta',
    'CanvasWorkflowRunResultsOverlay',
    'CanvasWorkflowRunResultsRemovedState',
    'CanvasWorkflowRunResultsShell',
    'CanvasWorkflowRunResultsTitle',
    'CanvasWorkflowRunResultsTitleRow',
    'CanvasWorkflowRunResultsTypeBadge',
  ]) {
    assert.doesNotMatch(canvasWorkflowPanelsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasWorkflowRunResultsView`)
    assert.match(canvasWorkflowPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas workflow layer`)
  }
  for (const exportName of [
    'CanvasWorkflowHistoryBody',
    'CanvasWorkflowHistoryCompactItem',
    'CanvasWorkflowHistoryCompactList',
    'CanvasWorkflowHistoryControls',
    'CanvasWorkflowHistoryHeader',
    'CanvasWorkflowHistoryPageButton',
    'CanvasWorkflowHistoryPageIndicator',
    'CanvasWorkflowHistoryPanel',
    'CanvasWorkflowHistorySelect',
    'CanvasWorkflowHistoryState',
    'CanvasWorkflowHistoryTable',
    'CanvasWorkflowHistoryTableHeader',
    'CanvasWorkflowHistoryTableRow',
  ]) {
    assert.doesNotMatch(canvasWorkflowPanelsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasWorkflowHistoryView`)
    assert.match(canvasWorkflowPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas workflow layer`)
  }
  assert.doesNotMatch(canvasWorkflowPanelsSource, /\bAppCodeBlock\b/)
  for (const packageExportName of [
    'CanvasRunStatusBadge',
    'CanvasWorkflowHistoryView',
    'CanvasWorkflowHistoryPanel',
    'CanvasWorkflowHistoryCompactItem',
    'CanvasWorkflowHistoryDuration',
    'CanvasWorkflowHistoryTableRow',
    'CanvasWorkflowSidePanel',
    'CanvasWorkflowSideTabButton',
    'CanvasWorkflowRunResultsView',
    'CanvasWorkflowRunResultsOverlay',
    'CanvasWorkflowRunResultsShell',
    'CanvasWorkflowRunResultsHeader',
    'CanvasWorkflowRunResultsCard',
    'CanvasWorkflowRunResultsCardContent',
    'CanvasWorkflowRunResultsActionButton',
  ]) {
    assert.match(canvasWorkflowPackageSource, new RegExp(`export (?:function|const) ${packageExportName}\\b`), `${packageExportName} must be package-owned`)
  }
  for (const exportName of ['AppCodeBlock', 'AppEmptyState', 'AppMediaFrame', 'AppSurfaceItem', 'Badge', 'Button']) {
    assert.match(canvasWorkflowPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by the package canvas workflow layer`)
  }
  assert.match(canvasWorkflowPackageSource, /function CanvasWorkflowRunResultsCodeBlock[\s\S]*?<AppCodeBlock/)
  assert.match(canvasWorkflowPackageSource, /function runStatusIntent/)
  assert.match(canvasWorkflowPackageSource, /<StatusBadge\b[\s\S]*?intent=\{runStatusIntent\(status\)\}/)
  assert.doesNotMatch(canvasWorkflowPackageSource, /function runStatusTone/)
  assert.doesNotMatch(canvasWorkflowPackageSource, /<StatusBadge\b[^>]*\btone=/)
  for (const className of [
    'canvas-run-status-badge',
    'canvas-workflow-history',
    'canvas-workflow-history-duration',
    'canvas-workflow-history-compact-item',
    'canvas-workflow-history-table__row',
    'canvas-workflow-side-panel',
    'canvas-workflow-side-rail',
    'canvas-workflow-run-results-overlay',
    'canvas-workflow-run-results-shell',
    'canvas-workflow-run-results-card',
    'canvas-workflow-run-results-card__content',
    'canvas-workflow-run-results-card__action',
  ]) {
    assert.match(canvasWorkflowPackageCss, new RegExp(`\\.${className}\\b`), `${className} style must be package-owned`)
  }
  assert.match(canvasWorkflowPanelsSource, /const historyItems: CanvasWorkflowHistoryItem\[] = runs\.map\(\(run\) => \(\{/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasWorkflowHistoryView[\s\S]*items=\{historyItems\}[\s\S]*activeRunId=\{activeRunId\}[\s\S]*onSelectRun=\{onSelectRun\}/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasWorkflowHistoryDuration icon=\{<Clock3 size=\{12\} \/>\}>/)
  assert.match(canvasWorkflowPanelsSource, /const resultItems: CanvasWorkflowRunResultsItem\[] = items\.map\(\(item\) => \{/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasWorkflowRunResultsView[\s\S]*items=\{resultItems\}[\s\S]*onClose=\{onClose\}/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /rounded-\[inherit\]/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /activeRunId === run\.id && 'border-primary\/50 bg-primary\/5'/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /\b(?:AppChoiceTile|AppCodeBlock|AppControlGroup|AppEmptyState|AppMarkerDot|AppMediaFrame|AppSurfaceItem|Badge|Button|NativeSelect|StatusBadge|toneTextClass)\b/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /\bcn\(/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /className=/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /<(?:div|span)\b/)
  assert.match(canvasResourceShelfSource, /\bCanvasResourceShelfView\b/, 'CanvasResourceShelfView must be consumed by canvas resource shelf')
  assert.match(canvasResourceShelfSource, /\bCanvasResourceShelfItem\b/, 'CanvasResourceShelfItem must shape canvas resource shelf data')
  for (const exportName of [
    'CanvasMediaEmptyIcon',
    'CanvasMediaFill',
  ]) {
    assert.match(canvasResourceShelfSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas resource shelf`)
  }
  for (const exportName of [
    'CanvasResourceShelfBody',
    'CanvasResourceShelfCard',
    'CanvasResourceShelfCardBody',
    'CanvasResourceShelfCardContent',
    'CanvasResourceShelfCardFooter',
    'CanvasResourceShelfCardMetaRow',
    'CanvasResourceShelfCountPill',
    'CanvasResourceShelfEmpty',
    'CanvasResourceShelfGrid',
    'CanvasResourceShelfHeader',
    'CanvasResourceShelfHint',
    'CanvasResourceShelfNav',
    'CanvasResourceShelfResourceDescription',
    'CanvasResourceShelfResourceName',
    'CanvasResourceShelfSearch',
    'CanvasResourceShelfSelectedBadge',
    'CanvasResourceShelfShell',
    'CanvasResourceShelfThumbFrame',
    'CanvasResourceShelfTitle',
    'CanvasResourceShelfTypeBadge',
  ]) {
    assert.doesNotMatch(canvasResourceShelfSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasResourceShelfView`)
    assert.match(canvasResourceShelfUiSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas resource shelf`)
  }
  for (const exportName of ['AppEmptyState', 'AppInlineMeta', 'AppSurfaceItem', 'Badge', 'Input']) {
    assert.match(canvasResourceShelfUiSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by the package canvas resource shelf`)
  }
  for (const packageExportName of [
    'CanvasResourceShelfShell',
    'CanvasResourceShelfCard',
    'CanvasResourceShelfCardFooter',
    'CanvasResourceShelfSearch',
  ]) {
    assert.match(canvasResourceShelfUiSource, new RegExp(`export (?:function|const) ${packageExportName}\\b`), `${packageExportName} must be package-owned`)
  }
  for (const className of [
    'canvas-resource-shelf',
    'canvas-resource-shelf__header',
    'canvas-resource-shelf__grid',
    'canvas-resource-shelf-card',
    'canvas-resource-shelf-card__footer',
  ]) {
    assert.match(canvasResourceShelfUiCss, new RegExp(`\\.${className}\\b`), `${className} style must be package-owned`)
  }
  assert.doesNotMatch(canvasResourceShelfSource, /\b(?:AppEmptyState|AppInlineMeta|AppSurfaceItem|Badge|Input|toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(canvasResourceShelfSource, /\bcn\(/)
  assert.doesNotMatch(canvasResourceShelfSource, /className=/)
  for (const exportName of ['CanvasMediaFill', 'CanvasMediaEmptyIcon', 'CanvasMediaNodeFrame', 'CanvasResourceShelfThumbFrame']) {
    assert.match(canvasMediaSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(canvasMediaCss, /\.canvas-media-fill\[data-fit="cover"\] > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasMediaCss, /\.canvas-media-fill\[data-fit="contain"\] > \*\s*\{[\s\S]*object-fit:\s*contain/)
  assert.match(canvasMediaCss, /\.canvas-media-empty-icon\s*\{/)
  assert.match(canvasMediaCss, /\.canvas-media-node-frame\s*\{[\s\S]*min-height:\s*80px/)
  assert.match(canvasMediaCss, /\.canvas-resource-shelf-thumb-frame\[data-compact="false"\]\s*\{[\s\S]*height:\s*82px/)
  assert.doesNotMatch(canvasResourceShelfSource, /\bh-full w-full object-cover\b/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasMediaFill fit="contain">[\s\S]*?<AuthedImage/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasMediaFill fit="contain">[\s\S]*?<AuthedVideo/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /\bh-full w-full object-contain\b/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /flex h-44 items-center justify-center bg-muted\/35/)
  assert.doesNotMatch(canvasResourceShelfSource, /rounded-lg border bg-card/)
  assert.doesNotMatch(canvasResourceShelfSource, /border border-border bg-muted/)
  assert.doesNotMatch(canvasResourceShelfSource, /border-t border-border bg-muted\/25/)
  assert.doesNotMatch(canvasResourceShelfSource, /overflow-hidden rounded-lg border border-border bg-background\/95 shadow-lg/)
  assert.doesNotMatch(canvasResourceShelfSource, /rounded-md border border-primary bg-primary px-2\.5/)
  assert.doesNotMatch(canvasResourceShelfSource, /flex h-full items-center justify-center type-label text-muted-foreground/)
  assert.match(canvasResourceShelfUiSource, /variant=\{framed \? "card" : "overlay"\}/)
  assert.match(canvasResourceShelfUiSource, /<AppEmptyState compact title=\{title\}/)
  assert.match(canvasEditorPackageSource, /\bAppSurfaceItem\b/)
  assert.match(canvasEditorPackageSource, /\bAppEmptyState\b/)
  assert.match(canvasEditorSource, /\bCanvasDropOverlay\b/)
  assert.match(canvasEditorSource, /\bCanvasSelectionFrame\b/)
  assert.match(canvasEditorSource, /\bCanvasViewportActionButton\b/)
  for (const exportName of [
    'CanvasEditorActionButton',
    'CanvasEditorChrome',
    'CanvasEditorChromeContent',
    'CanvasEditorContent',
    'CanvasEditorIconButton',
    'CanvasEditorMain',
    'CanvasEditorMetricBadge',
    'CanvasEditorNameInput',
    'CanvasEditorRunningBadge',
    'CanvasEditorShell',
    'CanvasEditorStats',
    'CanvasEditorStatusBadge',
    'CanvasEditorTitleArea',
    'CanvasEditorTitleRow',
    'CanvasEditorTypeBadge',
    'CanvasPaletteCollapsedBody',
    'CanvasPaletteCollapsedGroup',
    'CanvasPaletteCollapsedItemButton',
    'CanvasPaletteCollapsedItems',
    'CanvasPaletteEmpty',
    'CanvasPaletteExpandedBody',
    'CanvasPaletteHeader',
    'CanvasPaletteHint',
    'CanvasPaletteInner',
    'CanvasPaletteItemButton',
    'CanvasPaletteItemGrid',
    'CanvasPalettePanel',
    'CanvasPaletteSection',
    'CanvasPaletteSectionDescription',
    'CanvasPaletteSectionHeader',
    'CanvasPaletteSections',
    'CanvasPaletteSectionTitle',
    'CanvasViewportBoundsLayer',
    'CanvasViewportEmptyOverlay',
    'CanvasViewportEmptyState',
    'CanvasViewportPane',
    'CanvasViewportSelectionActionButton',
    'CanvasViewportStatusOverlay',
    'canvasFlowClassName',
  ]) {
    assert.match(canvasEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas editor chrome/palette/viewport`)
    assert.match(canvasEditorPackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of ['AppEmptyState', 'AppIconFrame', 'AppMarkerDot', 'AppSurfaceItem', 'Badge', 'Button', 'Input', 'StatusBadge']) {
    assert.match(canvasEditorPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by the package canvas editor layer`)
  }
  for (const className of [
    'canvas-editor',
    'canvas-editor-chrome',
    'canvas-editor-chrome__name-input',
    'canvas-palette',
    'canvas-palette__collapsed-item',
    'canvas-palette-item',
    'canvas-palette-empty',
    'canvas-viewport-pane',
    'canvas-viewport-selection-action',
    'canvas-viewport-bounds-layer',
    'canvas-viewport-empty-overlay',
    'canvas-viewport-empty-state',
    'canvas-viewport-status',
  ]) {
    assert.match(canvasEditorPackageCss, new RegExp(`\\.${className}\\b`), `${className} style must be package-owned`)
  }
  assert.match(canvasEditorSource, /<CanvasEditorNameInput[\s\S]*?value=\{canvasName\}[\s\S]*?onChange=\{\(e\) => setCanvasName\(e\.target\.value\)\}/)
  assert.match(canvasEditorSource, /SIDEBAR_NODE_CATEGORIES\.map[\s\S]*?<CanvasPaletteItemButton[\s\S]*?draggable[\s\S]*?application\/canvas-node-type/)
  assert.match(canvasEditorSource, /clientPlugins\.map\(\(plugin\)[\s\S]*?<CanvasPaletteItemButton[\s\S]*?draggable[\s\S]*?application\/canvas-plugin/)
  assert.match(canvasEditorSource, /clientPlugins\.length === 0[\s\S]*?<CanvasPaletteEmpty>/)
  assert.match(canvasEditorSource, /className=\{canvasFlowClassName\}/)
  assert.match(canvasEditorSource, /<CanvasViewportPane[\s\S]*?dropActive=\{dropActive\}/)
  assert.match(canvasEditorSource, /<CanvasViewportSelectionActionButton[\s\S]*?onClick=\{createGroupFromSelection\}/)
  assert.match(canvasEditorSource, /<CanvasViewportBoundsLayer[\s\S]*?x=\{selectedUngroupBounds\.x\}/)
  assert.match(canvasEditorSource, /<CanvasViewportEmptyOverlay>[\s\S]*?<CanvasViewportEmptyState/)
  assert.match(canvasEditorSource, /<CanvasViewportStatusOverlay icon=\{<MousePointer2 size=\{14\} \/>\}/)
  assert.doesNotMatch(canvasEditorUiImport, /^\s*(?:AppEmptyState|AppIconFrame|AppMarkerDot|AppSurfaceItem|Badge|Button|Input|StatusBadge),?\s*$/m)
  assert.doesNotMatch(canvasEditorSource, /<(?:AppEmptyState|AppIconFrame|AppMarkerDot|AppSurfaceItem|Badge|Button|Input|StatusBadge)\b/)
  assert.doesNotMatch(canvasEditorSource, /<AppSurfaceItem variant="muted" className=\{cn\('shrink-0 rounded-none border-x-0 border-t-0 px-3'/)
  assert.doesNotMatch(canvasEditorSource, /className="group h-auto min-h-\[54px\] w-full justify-start/)
  assert.doesNotMatch(canvasEditorSource, /className="cursor-grab text-muted-foreground active:cursor-grabbing"/)
  assert.doesNotMatch(canvasEditorSource, /<AppSurfaceItem className="mb-3 flex items-center gap-2 px-2 py-1.5 type-label text-muted-foreground">/)
  assert.doesNotMatch(canvasEditorSource, /className=\{cn\(\s*'relative min-h-0 flex-1 bg-background'/)
  assert.doesNotMatch(canvasEditorSource, /className="canvas-flow"/)
  assert.doesNotMatch(canvasEditorSource, /nodrag nopan pointer-events-auto absolute left-3 top-3 h-8 gap-1\.5 rounded-md shadow-sm/)
  assert.doesNotMatch(canvasEditorSource, /className="pointer-events-none absolute"/)
  assert.doesNotMatch(canvasEditorSource, /pointer-events-none absolute inset-0 flex items-center justify-center p-8/)
  assert.doesNotMatch(canvasEditorSource, /max-w-sm border-dashed bg-background\/80 shadow-sm backdrop-blur/)
  assert.doesNotMatch(canvasEditorSource, /pointer-events-none absolute left-4 top-4 flex items-center gap-2 px-3 py-2 type-label text-muted-foreground shadow-sm backdrop-blur/)
  for (const exportName of [
    'CanvasRuntimeInputDialogActionButton',
    'CanvasRuntimeInputDialogActions',
    'CanvasRuntimeInputDialogBody',
    'CanvasRuntimeInputDialogCheckbox',
    'CanvasRuntimeInputDialogField',
    'CanvasRuntimeInputDialogFieldLabel',
    'CanvasRuntimeInputDialogHeader',
    'CanvasRuntimeInputDialogInput',
    'CanvasRuntimeInputDialogShell',
    'CanvasRuntimeInputDialogTextarea',
  ]) {
    assert.match(canvasEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas editor runtime inputs`)
    assert.match(canvasWorkflowPackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'canvas-runtime-input-dialog-overlay',
    'canvas-runtime-input-dialog',
    'canvas-runtime-input-dialog__label',
    'canvas-runtime-input-dialog__actions',
  ]) {
    assert.match(canvasWorkflowPackageCss, new RegExp(`\\.${className}\\b`), `${className} style must be package-owned`)
  }
  assert.match(canvasWorkflowPackageSource, /\b(?:CheckboxField|Input|Label|Textarea)\b/)
  assert.match(canvasEditorSource, /port\.type === 'boolean'[\s\S]*?<CanvasRuntimeInputDialogCheckbox[\s\S]*?onCheckedChange=\{\(checked\) => setInputValues/)
  assert.match(canvasEditorSource, /port\.type === 'boolean'[\s\S]*?<CanvasRuntimeInputDialogCheckbox[\s\S]*?onCheckedChange=\{\(checked\) => setNodeRunValues/)
  assert.match(canvasEditorSource, /<CanvasRuntimeInputDialogFieldLabel[\s\S]*?required=\{port\.required\}/)
  assert.doesNotMatch(canvasEditorSource, /function CanvasRuntimeInputDialogShell/)
  assert.doesNotMatch(canvasEditorSource, /\b(?:CheckboxField|Label|toneTextClass)\b/)
  assert.match(canvasNodesSource, /function CanvasGenerationParamControls[\s\S]*?<CanvasNodeParamControlsView/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamControlsView[\s\S]*?<CanvasNodeParamPanel\b/)
  assert.match(canvasNodesSource, /function CanvasGenerationResultPanel[\s\S]*?<CanvasNodeMediaResultView/)
  assert.match(canvasNodesSource, /function CanvasTextGenerationResultPanel[\s\S]*?<CanvasNodeTextResultView/)
  assert.match(uiCanvasCardNodeSource, /function CanvasNodeMediaResultView[\s\S]*?<CanvasNodeResultPanel>/)
  assert.match(uiCanvasCardNodeSource, /function CanvasNodeTextResultView[\s\S]*?<CanvasNodeResultPanel>/)
  assert.match(canvasNodesSource, /<CanvasNodeCard selected=\{selected\}>[\s\S]*?<CanvasNodeCardHeader/)
  assert.doesNotMatch(canvasNodesSource, /function NodeCard\b/)
  assert.doesNotMatch(canvasNodesSource, /function NodeHeader\b/)
  assert.doesNotMatch(canvasNodesSource, /<p>\s*\{data\.textContent\}\s*<\/p>/)
  assert.doesNotMatch(canvasNodesSource, /canvas-node-card flex flex-col p-0 type-label shadow-sm backdrop-blur transition-all/)
  assert.doesNotMatch(canvasNodesSource, /rounded-t-lg border-b border-border/)
  assert.doesNotMatch(canvasNodesSource, /bg-muted\/60/)
  assert.match(canvasNodesSource, /\bCanvasGroupFrame\b/)
  for (const exportName of ['CanvasDropOverlay', 'CanvasGroupFrame', 'CanvasGroupHeader', 'CanvasResizeHandleButton', 'CanvasSelectionFrame', 'CanvasViewportActionButton']) {
    assert.match(canvasFlowSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(canvasFlowCss, /\.canvas-selection-frame\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-drop-overlay\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-group-frame\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-group-header\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-resize-handle-button\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-resize-handle-button__bar\s*\{/)
  assert.match(canvasFlowCss, /\.canvas-viewport-action-button\s*\{/)
  assert.match(canvasContextMenuSource, /\bCanvasContextMenuView\b/, 'CanvasContextMenuView must be consumed by canvas context menu')
  assert.match(canvasContextMenuSource, /\bCanvasContextMenuAction\b/, 'CanvasContextMenuAction must shape canvas context menu actions')
  assert.match(canvasContextMenuSource, /\bCanvasContextMenuSection\b/, 'CanvasContextMenuSection must shape canvas context menu sections')
  for (const exportName of [
    'CanvasContextMenuItem',
    'CanvasContextMenuRoot',
    'CanvasContextMenuSectionTitle',
    'CanvasContextMenuSeparator',
  ]) {
    assert.doesNotMatch(canvasContextMenuSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasContextMenuView`)
    assert.match(canvasContextMenuPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas context menu`)
  }
  for (const packageExportName of [
    'CanvasContextMenuItem',
    'CanvasContextMenuItemIcon',
    'CanvasContextMenuRoot',
    'CanvasContextMenuSectionTitle',
    'CanvasContextMenuSeparator',
    'CanvasContextMenuView',
  ]) {
    assert.match(canvasContextMenuPackageSource, new RegExp(`export (?:function|const) ${packageExportName}\\b`), `${packageExportName} must be package-owned`)
  }
  assert.match(canvasContextMenuPackageSource, /export type CanvasContextMenuAction\b/)
  assert.match(canvasContextMenuPackageSource, /export type CanvasContextMenuSection\b/)
  assert.match(canvasContextMenuPackageSource, /\bAppSurfaceItem\b/)
  assert.match(canvasContextMenuPackageSource, /\bButton\b/)
  assert.match(canvasContextMenuPackageSource, /ms-dropdown__item|ms-dropdown__content|ms-dropdown__separator/)
  assert.match(canvasContextMenuPackageCss, /\.canvas-context-menu\s*\{/)
  assert.match(canvasContextMenuPackageCss, /\.canvas-context-menu__item\s*\{/)
  assert.match(canvasContextMenuPackageCss, /\.canvas-context-menu__item-icon\s*\{/)
  assert.match(canvasContextMenuPackageCss, /\.canvas-context-menu__separator\s*\{/)
  assert.doesNotMatch(canvasContextMenuSource, /\b(?:AppSurfaceItem|Button)\b/)
  assert.doesNotMatch(canvasContextMenuSource, /className=/)
  assert.doesNotMatch(canvasContextMenuSource, /ms-dropdown__(?:item|content|separator)/)
  assert.doesNotMatch(canvasEditorSource, /rounded-lg border border-dashed border-border/)
  assert.doesNotMatch(canvasEditorSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(canvasEditorSource, /bg-background rounded-xl p-6 w-\[420px\] shadow-2xl space-y-4 border border-border/)
  assert.doesNotMatch(canvasEditorSource, /flex max-h-\[80vh\] w-\[460px\] flex-col rounded-xl border border-border bg-background p-6 shadow-2xl/)
  assert.doesNotMatch(canvasEditorSource, /<input\b[\s\S]{0,120}type="checkbox"/)
  assert.doesNotMatch(canvasEditorSource, /<input\b/)
  assert.doesNotMatch(canvasEditorSource, /flex h-9 items-center gap-2 rounded-md border border-border px-3 type-label text-foreground/)
  assert.doesNotMatch(canvasEditorSource, /flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/)
  assert.doesNotMatch(canvasEditorSource, /group flex min-h-\[54px\] items-center gap-2 rounded-md border border-border bg-card/)
  assert.doesNotMatch(canvasEditorSource, /rounded-md border border-dashed border-border bg-muted\/25/)
  assert.doesNotMatch(canvasEditorSource, /h-1 w-1 rounded-full bg-border/)
  assert.doesNotMatch(canvasEditorSource, /bg-card\/95/)
  assert.doesNotMatch(canvasEditorSource, /rounded-xl border border-dashed border-primary\/60 bg-primary\/5/)
  assert.doesNotMatch(canvasEditorSource, /inset-4 flex items-center justify-center rounded-lg border border-dashed border-primary\/50 bg-primary\/5/)
  assert.doesNotMatch(canvasEditorSource, /nodrag nopan pointer-events-auto absolute right-3 top-3 h-8 gap-1\.5 rounded-md bg-background\/95 shadow-sm/)
  assert.doesNotMatch(canvasNodesSource, /nodrag nowheel rounded-lg border border-border\/80 bg-muted\/15 px-2\.5 py-2/)
  assert.doesNotMatch(canvasNodesSource, /nodrag nowheel overflow-hidden rounded-lg border border-border\/80 bg-background shadow-sm/)
  assert.doesNotMatch(canvasNodesSource, /canvas-node-card rounded-lg border bg-card\/95 shadow-sm/)
  assert.doesNotMatch(canvasNodesSource, /rounded-lg border border-dashed bg-background\/35/)
  assert.doesNotMatch(canvasNodesSource, /h-1\.5 w-1\.5 rounded-full bg-primary\/60/)
  assert.doesNotMatch(canvasContextMenuSource, /<button\b/)
  assert.doesNotMatch(canvasContextMenuSource, /bg-popover border border-border rounded-xl shadow-md/)
  assert.doesNotMatch(canvasContextMenuSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(canvasContextMenuSource, /hover:bg-muted\/(?:50|60)/)
  assert.match(canvasWorkflowPanelsSource, /tableLabels=\{\{[\s\S]*?run: t\('canvas\.editor\.history\.run'\)/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /grid grid-cols-\[96px_104px_112px_1fr_120px\] border-b border-border bg-muted\/25/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /grid w-full grid-cols-\[96px_104px_112px_1fr_120px\][^"]*hover:bg-muted\/40/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasWorkflowHistoryView[\s\S]*?activeRunId=\{activeRunId\}[\s\S]*?onSelectRun=\{onSelectRun\}/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /h-1 w-1 rounded-full bg-border/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasWorkflowSideTabGroup>/)
  assert.match(canvasWorkflowPanelsSource, /active=\{activeTab === 'resources'\}/)
  assert.match(canvasWorkflowPanelsSource, /active=\{activeTab === 'history'\}/)
  assert.match(canvasWorkflowPanelsSource, /<CanvasResizeHandleButton[\s\S]*?onPointerDown=\{startResize\}[\s\S]*?title=\{t\('canvas\.editor\.resizePanel'/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /absolute inset-y-0 left-0 z-10 h-auto w-2 cursor-ew-resize rounded-none p-0/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /h-10 w-0\.5 rounded-full bg-border/)
  assert.match(canvasWorkflowPackageSource, /function CanvasWorkflowRunResultsView[\s\S]*?<CanvasWorkflowRunResultsOverlay>[\s\S]*?<CanvasWorkflowRunResultsShell>/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /<button onClick=\{\(\) => onSelectRun\(run\.id\)\}/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /<button\b/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /hover:bg-muted\/50/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /flex min-w-0 flex-1 overflow-hidden rounded-md border border-border type-label/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /flex max-h-\[86vh\] w-full max-w-4xl flex-col rounded-xl border border-border bg-background shadow-2xl/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /fixed inset-0 z-50 flex items-center justify-center bg-black\/50 p-4/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /max-h-full w-full p-3 type-label text-muted-foreground/)
  for (const exportName of ['CanvasGroupFrame', 'CanvasGroupHeader', 'CanvasMediaFill', 'CanvasMentionAttachmentThumb', 'CanvasMentionMenuThumb', 'CanvasNodeApprovalActionButton', 'CanvasNodeApprovalActions', 'CanvasNodeApprovalStatus', 'CanvasNodeCard', 'CanvasNodeCardBody', 'CanvasNodeCardHeader', 'CanvasNodeFooterText', 'CanvasNodeFrame', 'CanvasNodeParamControlsView', 'CanvasNodePromptInputView', 'CanvasNodeMediaResultView', 'CanvasNodeSemanticPortRows', 'CanvasNodeTextResultView', 'CanvasTextNodeView', 'CanvasImageNodeView', 'CanvasVideoNodeView', 'canvasMentionChipClassNames']) {
    assert.match(canvasNodesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by canvas nodes`)
  }
  for (const exportName of ['CanvasMediaEmptyIcon', 'CanvasMediaNodeFrame', 'CanvasNodeCardActionButton', 'CanvasNodeCardPreviewText', 'CanvasNodeCardTextarea', 'CanvasNodeStatusPipView']) {
    assert.doesNotMatch(canvasNodesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind package canvas node views`)
    assert.match(uiCanvasCardNodeSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas node layer`)
  }
  assert.doesNotMatch(canvasNodesSource, /\bCanvasNodeStatusPip\b/, 'CanvasNodeStatusPip must stay behind CanvasNodeStatusPipView')
  for (const exportName of ['CanvasNodeAttachmentHint', 'CanvasNodeAttachmentItem', 'CanvasNodeAttachmentList', 'CanvasNodeAttachmentRemoveButton', 'CanvasNodeAttachmentStatus']) {
    assert.doesNotMatch(canvasNodesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasNodePromptInputView`)
    assert.match(uiCanvasCardNodeSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas attachment layer`)
  }
  for (const exportName of ['CanvasNodeParamCheckbox', 'CanvasNodeParamExpandButton', 'CanvasNodeParamField', 'CanvasNodeParamGrid', 'CanvasNodeParamHeader', 'CanvasNodeParamInput', 'CanvasNodeParamPanel', 'CanvasNodeParamSelect']) {
    assert.doesNotMatch(canvasNodesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasNodeParamControlsView`)
    assert.match(uiCanvasCardNodeSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas param layer`)
  }
  for (const exportName of ['CanvasNodePromptInputPanel', 'CanvasNodePromptEditor', 'CanvasNodeMentionMenu', 'CanvasNodeMentionMenuEmpty', 'CanvasNodeMentionMenuItem']) {
    assert.doesNotMatch(canvasNodesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind CanvasNodePromptInputView`)
    assert.match(uiCanvasCardNodeSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas prompt layer`)
  }
  for (const exportName of ['CanvasNodeResultMessage', 'CanvasNodeResultPanel', 'CanvasNodeResultStage', 'CanvasNodeTextResultBody', 'CanvasNodeTextResultHeader', 'CanvasNodeTextResultSurface']) {
    assert.doesNotMatch(canvasNodesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must stay behind canvas node result views`)
    assert.match(uiCanvasCardNodeSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be composed by the package canvas node result layer`)
  }
  assert.match(canvasMentionSource, /canvasMentionChipClassNames/)
  assert.match(canvasMentionSource, /export function CanvasMentionMenuThumb/)
  assert.match(canvasMentionSource, /export function CanvasMentionAttachmentThumb/)
  assert.match(canvasMentionCss, /\.canvas-mention-chip\s*\{/)
  assert.match(canvasMentionCss, /\.canvas-mention-chip__media\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasMentionCss, /\.canvas-mention-chip__label\s*\{[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(canvasMentionCss, /\.canvas-mention-menu-thumb\s*\{[\s\S]*width:\s*28px/)
  assert.match(canvasMentionCss, /\.canvas-mention-attachment-thumb\s*\{[\s\S]*width:\s*24px/)
  assert.match(canvasNodesSource, /chip\.className = canvasMentionChipClassNames\.chip/)
  assert.match(canvasNodesSource, /video\.className = canvasMentionChipClassNames\.media/)
  assert.match(canvasNodesSource, /image\.className = canvasMentionChipClassNames\.media/)
  assert.match(canvasNodesSource, /label\.className = canvasMentionChipClassNames\.label/)
  assert.match(canvasNodesSource, /<CanvasMentionMenuThumb>[\s\S]*?<MediaViewer resource=\{resource\} lightbox=\{false\}/)
  assert.match(canvasNodesSource, /<CanvasMentionAttachmentThumb>[\s\S]*?<MediaViewer resource=\{resource\} lightbox=\{false\}/)
  assert.match(canvasNodesSource, /<CanvasMediaFill fit="contain">[\s\S]*?<MediaViewer resource=\{data\.resource\} fit="contain" lightbox/)
  assert.match(canvasNodesSource, /<CanvasNodeFrame>[\s\S]*?<HiddenPortHandles/)
  assert.match(canvasNodesSource, /const canvasNodeStatusIcons = \{[\s\S]*?pendingIcon: <Loader2 size=\{12\} \/>[\s\S]*?doneIcon: <CheckCircle2 size=\{12\} \/>[\s\S]*?failedIcon: <XCircle size=\{12\} \/>/)
  assert.match(canvasNodesSource, /<CanvasImageNodeView[\s\S]*?media=\{imgUrl \? <AuthedImage src=\{imgUrl\} alt="" \/> : undefined\}[\s\S]*?emptyIcon=\{<Image size=\{24\} \/>\}/)
  assert.match(canvasNodesSource, /<CanvasVideoNodeView[\s\S]*?media=\{videoUrl \? <AuthedVideo src=\{videoUrl\} controls \/> : undefined\}[\s\S]*?emptyIcon=\{<Video size=\{24\} \/>\}[\s\S]*?surface="dark"/)
  assert.match(canvasNodesSource, /<CanvasNodeFooterText tone="danger">\{data\.error\}<\/CanvasNodeFooterText>/)
  assert.doesNotMatch(canvasNodesSource, /style\.cssText/)
  assert.doesNotMatch(canvasNodesSource, /className=/)
  assert.doesNotMatch(canvasNodesSource, /cn\(/)
  assert.doesNotMatch(canvasNodesSource, /toneTextClass/)
  assert.doesNotMatch(canvasNodesSource, /animate-spin/)
  assert.doesNotMatch(canvasNodesSource, /className="w-full h-full object-cover"/)
  assert.doesNotMatch(canvasNodesSource, /className="h-full w-full"/)
  assert.doesNotMatch(canvasNodesSource, /<select\b/)
  assert.doesNotMatch(canvasNodesSource, /<textarea\b/)
  assert.doesNotMatch(canvasNodesSource, /<button\b/)
  assert.doesNotMatch(canvasNodesSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(canvasNodesSource, /nodrag nowheel relative rounded-lg border border-border\/80 bg-background px-2\.5 py-2/)
  assert.doesNotMatch(canvasNodesSource, /absolute bottom-full left-2 right-2 z-30 mb-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg/)
  assert.doesNotMatch(canvasNodesSource, /flex w-full items-center gap-2 px-2\.5 py-2 text-left type-label transition-colors hover:bg-muted\/60/)
  assert.doesNotMatch(canvasNodesSource, /flex max-w-full items-center gap-1\.5 rounded-full bg-muted px-2 py-1/)
  assert.match(canvasNodesSource, /<CanvasNodePromptInputView[\s\S]*?placeholder=\{placeholder/)
  assert.match(canvasNodesSource, /<CanvasNodePromptInputView[\s\S]*?mentionOpen=\{mentionQuery !== null\}/)
  assert.match(canvasNodesSource, /const mentionItems: CanvasNodeMentionItem\[\] = mentionResources\.map/)
  assert.match(canvasNodesSource, /mentionItems=\{mentionItems\}/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptInputView[\s\S]*?mentionItems\.map\(\(item\)[\s\S]*?<CanvasNodeMentionMenuItem/)
  assert.match(canvasNodesSource, /const attachmentItems: CanvasNodePromptAttachmentItem\[\] = attachments\.map/)
  assert.match(canvasNodesSource, /attachmentItems=\{attachmentItems\}/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodePromptInputView[\s\S]*?attachmentItems\.map\(\(item\)[\s\S]*?<CanvasNodeAttachmentItem/)
  assert.match(canvasNodesSource, /const paramItems: CanvasNodeParamControlItem\[\] = params\.map/)
  assert.match(canvasNodesSource, /<CanvasNodeParamControlsView[\s\S]*?icon=\{<Wrench size=\{12\} \/>\}[\s\S]*?params=\{paramItems\}/)
  assert.match(uiCanvasCardNodeSource, /CanvasNodeParamControl[\s\S]*?param\.type === "boolean"[\s\S]*?<CanvasNodeParamCheckbox/)
  assert.match(canvasNodesSource, /<CanvasTextNodeView[\s\S]*?textPlaceholder=\{t\('canvas\.textInputPlaceholder'\)\}[\s\S]*?emptyLabel=\{t\('canvas\.emptyContent'\)\}/)
  assert.match(canvasNodesSource, /<CanvasNodeSemanticPortRows[\s\S]*?srLabel=\{t\('canvas\.ports\.semanticRows'/)
  assert.match(canvasNodesSource, /style=\{type === 'target' \? canvasNodeSemanticTargetHandleStyle : canvasNodeSemanticSourceHandleStyle\}/)
  assert.match(canvasNodesSource, /style=\{canvasNodeCardPortHandleStyle\}/)
  assert.match(canvasNodesSource, /<CanvasNodeMediaResultView[\s\S]*?loadingIcon=\{<Loader2 size=\{18\} \/>\}/)
  assert.match(canvasNodesSource, /<CanvasNodeTextResultView[\s\S]*?statusProps=\{canvasNodeStatusRecipe\(status\)\}/)
  assert.match(uiCanvasCardNodeSource, /function CanvasNodeMediaResultView[\s\S]*?<CanvasNodeResultStage centered>/)
  assert.match(uiCanvasCardNodeSource, /function CanvasNodeMediaResultView[\s\S]*?<CanvasNodeResultMessage tone="danger">/)
  assert.match(uiCanvasCardNodeSource, /function CanvasNodeTextResultView[\s\S]*?<CanvasNodeTextResultSurface state="loading">/)
  assert.match(uiCanvasCardNodeSource, /function CanvasNodeTextResultView[\s\S]*?<CanvasNodeTextResultSurface state="danger">/)
  assert.match(canvasNodesSource, /<CanvasNodeCardHeader[\s\S]*?tone="warning"[\s\S]*?<CanvasNodeApprovalStatus tone="warning" compact>/)
  assert.match(canvasNodesSource, /approvalStatus === 'approved'[\s\S]*?<CanvasNodeApprovalStatus tone="success" icon=\{<Check size=\{10\} \/>\}/)
  assert.match(canvasNodesSource, /approvalStatus === 'waiting'[\s\S]*?<CanvasNodeApprovalActions>[\s\S]*?<CanvasNodeApprovalActionButton[\s\S]*?actionTone="success"/)
  assert.match(canvasNodesSource, /<CanvasGroupHeader>\{data\.groupLabel \|\| data\.label \|\| t\('canvas\.nodeLabels\.group'\)\}<\/CanvasGroupHeader>/)
  assert.doesNotMatch(canvasNodesSource, /function RunBtn\b/)
  assert.doesNotMatch(canvasNodesSource, /h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground/)
  assert.doesNotMatch(canvasNodesSource, /flex-1 w-full px-3 py-2 type-label resize-none focus:outline-none bg-transparent/)
  assert.doesNotMatch(canvasNodesSource, /placeholder:text-muted-foreground\/50/)
  assert.doesNotMatch(canvasNodesSource, /flex-1 px-3 py-2 rounded-b-xl/)
  assert.doesNotMatch(canvasNodesSource, /italic text-muted-foreground\/40/)
  assert.doesNotMatch(canvasNodesSource, /const targetHandleStyle\b/)
  assert.doesNotMatch(canvasNodesSource, /const semanticTargetHandleStyle\b/)
  assert.doesNotMatch(canvasNodesSource, /nodrag border-b border-border\/60 bg-muted\/15 px-2 py-2/)
  assert.doesNotMatch(canvasNodesSource, /relative flex min-h-\[30px\] items-center gap-1\.5 px-3 py-1\.5 type-tiny shadow-sm/)
  assert.doesNotMatch(canvasNodesSource, /shrink-0 rounded-sm px-1 py-0\.5 leading-none/)
  assert.doesNotMatch(canvasNodesSource, /nodrag nowheel overflow-hidden p-0 shadow-sm/)
  assert.doesNotMatch(canvasNodesSource, /flex h-64 w-full items-center justify-center text-muted-foreground/)
  assert.doesNotMatch(canvasNodesSource, /flex min-h-32 w-full items-center px-3 py-4 type-label/)
  assert.doesNotMatch(canvasNodesSource, /className="h-64 w-full"/)
  assert.doesNotMatch(canvasNodesSource, /flex h-32 w-full items-center justify-center type-label text-muted-foreground/)
  assert.doesNotMatch(canvasNodesSource, /px-3 pt-3 pb-2/)
  assert.doesNotMatch(canvasNodesSource, /px-3 pb-3/)
  assert.doesNotMatch(canvasNodesSource, /max-h-24 overflow-y-auto whitespace-pre-wrap p-2 type-label leading-relaxed text-foreground/)
  assert.doesNotMatch(canvasNodesSource, /nodrag nowheel relative px-2\.5 py-2/)
  assert.doesNotMatch(canvasNodesSource, /mention-editor min-h-\[72px\] w-full bg-transparent px-1 py-1 type-body leading-relaxed text-foreground outline-none/)
  assert.doesNotMatch(canvasNodesSource, /absolute bottom-full left-2 right-2 z-30 mb-1 max-h-44 overflow-y-auto p-1 shadow-lg/)
  assert.doesNotMatch(canvasNodesSource, /px-2\.5 py-2 type-label text-muted-foreground/)
  assert.doesNotMatch(canvasNodesSource, /w-full justify-start gap-2 px-2\.5 type-label/)
  assert.doesNotMatch(canvasNodesSource, /flex flex-wrap gap-1\.5 border-t border-border\/50 pt-2/)
  assert.doesNotMatch(canvasNodesSource, /max-w-full gap-1\.5 px-2 py-1/)
  assert.doesNotMatch(canvasNodesSource, /-mr-1 h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground/)
  assert.doesNotMatch(canvasNodesSource, /border-t border-border\/50 pt-2 type-caption text-muted-foreground/)
  assert.doesNotMatch(canvasNodesSource, /nodrag nowheel px-2\.5 py-2/)
  assert.doesNotMatch(canvasNodesSource, /mb-2 flex items-center gap-1\.5 type-tiny font-medium text-muted-foreground/)
  assert.doesNotMatch(canvasNodesSource, /h-7 w-full px-1\.5 type-tiny/)
  assert.doesNotMatch(canvasNodesSource, /h-auto min-w-0 justify-start gap-2 px-2 py-1\.5 type-tiny text-foreground/)
  assert.doesNotMatch(canvasNodesSource, /mt-2 h-7 w-full px-2 py-1 type-tiny text-muted-foreground hover:text-foreground/)
  assert.doesNotMatch(canvasNodesSource, /type-micro shrink-0/)
  assert.doesNotMatch(canvasNodesSource, /flex items-center gap-1/)
  assert.doesNotMatch(canvasNodesSource, /flex gap-1\.5 mt-0\.5/)
  assert.doesNotMatch(canvasNodesSource, /flex-1 gap-0\.5 py-1\.5 type-tiny hover:brightness-95/)
  assert.doesNotMatch(canvasNodesSource, /flex items-center gap-2 px-3 py-2/)
  assert.doesNotMatch(canvasNodesSource, /type-label font-medium text-muted-foreground/)
  assert.doesNotMatch(canvasNodesSource, /function PushBtn/)
  assert.doesNotMatch(canvasNodesSource, /\bShare2\b/)
  assert.doesNotMatch(canvasNodesSource, /\bonPush\b/)
  assert.doesNotMatch(canvasNodesSource, /label:\s*'加入候选'/)
  assert.match(canvasNodesSource, /approvalStatus === 'waiting'[\s\S]*?<CanvasNodeApprovalActions>[\s\S]*?onApprove[\s\S]*?<CanvasNodeApprovalActionButton[\s\S]*?onReject/)
  assert.doesNotMatch(canvasNodesSource, /shrink-0 p-0\.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/)
  assert.doesNotMatch(canvasNodesSource, /flex-1 flex items-center justify-center gap-0\.5 border rounded-lg py-1\.5/)
  assert.doesNotMatch(canvasNodesSource, /h-7 w-7 shrink-0 overflow-hidden rounded-md bg-muted/)
  assert.doesNotMatch(canvasNodesSource, /flex h-64 w-full items-center justify-center bg-muted\/40/)
  assert.doesNotMatch(canvasNodesSource, /className="h-64 w-full bg-muted\/40"/)
  assert.doesNotMatch(canvasNodesSource, /rounded border border-border bg-muted\/40 px-1 py-0\.5/)
  assert.doesNotMatch(canvasNodesSource, /rounded border border-border bg-muted\/30 px-1 py-0\.5/)
  assert.doesNotMatch(canvasNodesSource, /flex h-32 w-full items-center justify-center bg-muted\/30/)
  assert.doesNotMatch(canvasNodesSource, /flex-1 bg-muted\/30 flex items-center justify-center/)
  assert.doesNotMatch(canvasNodesSource, /flex h-20 items-center justify-center rounded-md bg-muted\/40/)
  assert.doesNotMatch(canvasNodesSource, /max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted\/40 p-2/)
  assert.match(canvasGenBodySource, /\bCanvasGenerationBody\b/)
  assert.match(canvasGenBodySource, /models=\{models\.map/)
  assert.match(canvasGenerationCss, /\.canvas-generation-body__output\s*\{[\s\S]*height:\s*128px/)
  assert.match(canvasGenerationCss, /\.canvas-generation-body__output > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.doesNotMatch(canvasGenBodySource, /w-full h-32 object-cover/)
  for (const exportName of ['AppMediaFrame', 'AppSurfaceItem', 'Button', 'NativeSelect', 'Textarea']) {
    assert.match(canvasGenerationSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package canvas generation body`)
    assert.doesNotMatch(canvasGenBodySource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be directly consumed by frontend canvas gen body`)
  }
  assert.doesNotMatch(canvasWorkflowPanelsSource, /<select\b/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /<pre\b/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(canvasWorkflowPanelsSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(canvasGenBodySource, /<select\b/)
  assert.doesNotMatch(canvasGenBodySource, /<textarea\b/)
  assert.doesNotMatch(canvasGenBodySource, /<button\b/)
  assert.doesNotMatch(canvasGenBodySource, /bg-primary text-primary-foreground rounded-lg py-1\.5/)
  assert.doesNotMatch(canvasGenBodySource, /bg-muted\/40 rounded p-2 max-h-24/)
})

test('tasks and segments pages use package semantic tone contracts', () => {
  const segmentsSource = readProjectFile('apps/frontend/src/features/content/components/SegmentsPage.tsx')
  const contentSemanticUiSource = readProjectFile('apps/frontend/src/features/content/presentation/contentSemanticUi.ts')
  const tasksSource = readProjectFile('apps/frontend/src/features/project/components/TasksPage.tsx')
  const projectSemanticUiSource = readProjectFile('apps/frontend/src/features/project/presentation/projectSemanticUi.ts')
  const projectTaskPackageSource = readProjectFile('packages/ui/src/components/business/project/tasks/index.tsx')
  const contentPagePackageSource = readProjectFile('packages/ui/src/components/business/content/page/index.tsx')
  const businessAppCss = readAppCss()
  const pageSources = [
    tasksSource,
    segmentsSource,
  ].join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(pageSources, rawPaletteClassPattern)
  assert.match([projectTaskPackageSource, contentPagePackageSource].join('\n'), /toneTextClass|toneSurfaceClass/)
  assert.doesNotMatch(pageSources, /\b(?:toneTextClass|toneSurfaceClass)\b/)
  assert.match([pageSources, contentPagePackageSource].join('\n'), /accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class/)
  assert.match(projectTaskPackageSource, /\bNativeSelect\b/)
  assert.match(projectTaskPackageSource, /\bInput\b/)
  assert.match(projectTaskPackageSource, /\bTextarea\b/)
  assert.match(projectTaskPackageSource, /\bAppCodeBlock\b/)
  assert.match(projectTaskPackageSource, /\bAppEmptyState\b/)
  assert.match(projectTaskPackageSource, /\bReviewCallout\b/)
  assert.doesNotMatch(tasksSource, /\b(?:NativeSelect|Input|Textarea|AppCodeBlock|AppEmptyState|ReviewCallout)\b/)
  for (const exportName of ['ProjectTaskAvatar', 'ProjectTaskListCard']) {
    assert.match(tasksSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by tasks page`)
  }
  for (const exportName of ['ProjectTaskAvatar', 'ProjectTaskListCard', 'ProjectTaskMeta', 'ProjectTaskPanel', 'ProjectTaskSurfaceItem']) {
    assert.match(tasksSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by tasks page`)
    assert.match(projectTaskPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be owned by project task package UI`)
  }
  assert.doesNotMatch(tasksSource, /\bAppAvatar\b/)
  assert.doesNotMatch(tasksSource, /\bWorkbenchListItem\b/)
  assert.doesNotMatch(tasksSource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(tasksSource, /\bAppPanel\b/)
  assert.doesNotMatch(tasksSource, /\bAppSurfaceItem\b/)
  assert.match(projectTaskPackageSource, /function ProjectTaskAvatar[\s\S]*?<AppAvatar/)
  assert.match(projectTaskPackageSource, /function ProjectTaskListCard[\s\S]*?<WorkbenchListItem/)
  assert.match(projectTaskPackageSource, /function ProjectTaskMeta[\s\S]*?<AppInlineMeta/)
  assert.match(projectTaskPackageSource, /function ProjectTaskPanel[\s\S]*?<AppPanel/)
  assert.match(projectTaskPackageSource, /function ProjectTaskSurfaceItem[\s\S]*?<AppSurfaceItem/)
  assert.match(projectTaskPackageSource, /\bAppIconFrame\b/, 'Project task package components own icon frame styling')
  for (const recipeName of ['projectTaskStatusRecipe', 'projectPriorityRecipe', 'projectReviewStatusRecipe', 'projectAiAssignmentRecipe', 'projectErrorRecipe']) {
    assert.match(projectSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be project semantic UI-owned`)
    assert.match(tasksSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by tasks page`)
  }
  assert.doesNotMatch(tasksSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(tasksSource, /\bStatusTone\b/)
  assert.doesNotMatch(tasksSource, /reviewStatusTone/)
  assert.doesNotMatch(tasksSource, /<select\b/)
  assert.doesNotMatch(tasksSource, /<input\b/)
  assert.doesNotMatch(tasksSource, /<textarea\b/)
  assert.doesNotMatch(tasksSource, /<button\b/)
  assert.doesNotMatch(tasksSource, /border border-dashed border-border/)
  assert.doesNotMatch(tasksSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(tasksSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(tasksSource, /rounded-md border border-border bg-card/)
  assert.doesNotMatch(tasksSource, /bg-card/)
  assert.doesNotMatch(tasksSource, /rounded bg-muted px-2 py-1/)
  assert.doesNotMatch(tasksSource, /flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/)
  assert.doesNotMatch(tasksSource, /flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/)
  assert.doesNotMatch(tasksSource, /rounded-md bg-muted px-2 py-1 type-label font-medium text-muted-foreground/)
  assert.match(tasksSource, /selectedTask\.resultJSON[\s\S]*?<ProjectTaskSurfaceItem variant="muted"[\s\S]*?<ProjectTaskCodeBlock>/)
  assert.match(tasksSource, /Object\.entries\(taskPurposeMeta\)\.map[\s\S]*?<ProjectTaskPurposeButton[\s\S]*?active=\{active\}/)
  assert.match(tasksSource, /agentPublishError[\s\S]*?<ProjectTaskCallout role="alert" tone="danger" compact>/)
  assert.match(tasksSource, /variant="ghost"[\s\S]{0,80}tone="danger"[\s\S]{0,120}removeMember\.mutate/, 'task member removal must use package danger button tone')
  assert.doesNotMatch(tasksSource, /rounded border border-destructive\/30 bg-destructive\/10 px-2 py-1 text-destructive/)
  assert.doesNotMatch(tasksSource, /hover:text-destructive/)
  assert.doesNotMatch(tasksSource, /<pre\b/)
  assert.doesNotMatch(tasksSource, /max-h-28 overflow-auto rounded-md bg-muted p-2/)
  assert.match(segmentsSource, /ContentPageMetricCard/)
  assert.match(segmentsSource, /CheckboxField/)
  assert.match(segmentsSource, /ContentPageKeyValue/)
  assert.match(segmentsSource, /field\.key\.endsWith\('_json'\) && 'app-info-block__code-value'/)
  assert.match(segmentsSource, /ContentPageMeta/)
  assert.match(segmentsSource, /ContentPagePanel/)
  assert.match(segmentsSource, /ContentPageSection/)
  assert.match(segmentsSource, /ContentPageActionRow/)
  assert.match(segmentsSource, /ContentPageDetailPanel/)
  assert.match(segmentsSource, /ContentPageDetailHero/)
  assert.match(segmentsSource, /ContentPageDetailMetricGrid/)
  assert.match(segmentsSource, /ContentPageDetailSectionStack/)
  assert.match(segmentsSource, /ContentPageDisclosure/)
  assert.match(segmentsSource, /ContentPageFieldCard/)
  assert.match(segmentsSource, /ContentPageFieldGrid/)
  assert.match(segmentsSource, /ContentPageInfoBlock/)
  assert.match(segmentsSource, /ContentPageList/)
  assert.match(segmentsSource, /ContentPageRelatedGrid/)
  assert.match(segmentsSource, /ContentPageSectionHeading/)
  assert.match(segmentsSource, /ContentPageSplitColumns/)
  assert.match(segmentsSource, /ContentPageTextEmptyState/)
  assert.doesNotMatch(segmentsSource, /\bAppDisclosure\b/)
  assert.doesNotMatch(segmentsSource, /\bAppInfoBlock\b/)
  assert.doesNotMatch(segmentsSource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(segmentsSource, /\bAppPanel\b/)
  assert.doesNotMatch(segmentsSource, /\bAppSection\b/)
  assert.doesNotMatch(segmentsSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(segmentsSource, /\bAppTextEmptyState\b/)
  assert.match(segmentsSource, /ContentPageEmptyState/)
  assert.match(segmentsSource, /ContentPageToneText/)
  assert.doesNotMatch(segmentsSource, /\b(?:AppEmptyState|AppKeyValue|AppMetricCard|toneTextClass)\b/)
  assert.doesNotMatch(segmentsSource, /\bWorkbenchList\b/)
  assert.match(segmentsSource, /ContentPageRelatedItem/)
  assert.match(segmentsSource, /ContentPageRelatedStack/)
  for (const exportName of ['ContentPageActionRow', 'ContentPageDetailPanel', 'ContentPageDetailHero', 'ContentPageDetailMetricGrid', 'ContentPageDetailSectionStack', 'ContentPageDisclosure', 'ContentPageEmptyState', 'ContentPageFieldCard', 'ContentPageFieldGrid', 'ContentPageInfoBlock', 'ContentPageKeyValue', 'ContentPageList', 'ContentPageMeta', 'ContentPageMetricCard', 'ContentPagePanel', 'ContentPageRelatedGrid', 'ContentPageSection', 'ContentPageSectionHeading', 'ContentPageSplitColumns', 'ContentPageSurfaceItem', 'ContentPageTextEmptyState', 'ContentPageToneText']) {
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(contentPagePackageSource, /function ContentPageMeta[\s\S]*?<AppInlineMeta/)
  assert.match(contentPagePackageSource, /function ContentPagePanel[\s\S]*?<AppPanel/)
  assert.match(contentPagePackageSource, /function ContentPageSection[\s\S]*?<AppSection/)
  assert.match(contentPagePackageSource, /function ContentPageSurfaceItem[\s\S]*?<AppSurfaceItem/)
  assert.match(contentPagePackageSource, /function ContentPageTextEmptyState[\s\S]*?<AppTextEmptyState/)
  assert.match(contentPagePackageSource, /function ContentPageEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(contentPagePackageSource, /function ContentPageKeyValue[\s\S]*?<AppKeyValue/)
  assert.match(contentPagePackageSource, /function ContentPageMetricCard[\s\S]*?<AppMetricCard/)
  assert.match(contentPagePackageSource, /function ContentPageToneText[\s\S]*?toneTextClass/)
  assert.match(contentPagePackageSource, /\bWorkbenchSurfaceItem\b/, 'content page package wrappers must own related surface item structure')
  assert.doesNotMatch(segmentsSource, /\bWorkbenchSurfaceItem\b/, 'segments page must use content page wrappers instead of workbench surface primitives')
  assert.match(segmentsSource, /function SegmentPreviewSection[\s\S]*?ContentPagePanel/)
  assert.match(segmentsSource, /function SegmentEditSection[\s\S]*?ContentPageSection/)
  assert.match(businessAppCss, /\.app-info-block__code-value\s*\{[\s\S]*font-family:/)
  assert.doesNotMatch(segmentsSource, /max-h-44 overflow-auto rounded bg-background p-2 font-mono type-label/)
  assert.match(segmentsSource, /function HeroStat[\s\S]*?ContentPageMetricCard/)
  assert.match(segmentsSource, /function SegmentDetailCard[\s\S]*?ContentPageDetailPanel/)
  assert.match(segmentsSource, /function SceneMomentDetail[\s\S]*?ContentPageDetailPanel/)
  assert.match(segmentsSource, /function ContentUnitDetail[\s\S]*?ContentPageDetailPanel/)
  assert.match(segmentsSource, /function SegmentPreviewValue[\s\S]*?surface="card"/)
  assert.match(segmentsSource, /function SegmentInlineField[\s\S]*?ContentPageFieldCard/)
  assert.match(segmentsSource, /function InfoChip[\s\S]*?ContentPageMeta/)
  assert.match(segmentsSource, /ContentPageFieldCard[\s\S]{0,500}核心信息/)
  assert.match(segmentsSource, /ContentPageDisclosure[\s\S]{0,200}高级字段/)
  assert.match(segmentsSource, /function SegmentInlineField[\s\S]*?NativeSelect/)
  assert.match(segmentsSource, /function SegmentInlineField[\s\S]*?CheckboxField/)
  assert.match(segmentsSource, /function SegmentButton[\s\S]{0,500}<ContentPageListCard/)
  assert.match(segmentsSource, /function SceneMomentRow[\s\S]*?ContentPageListCard/)
  assert.match(segmentsSource, /function ContentUnitRow[\s\S]*?ContentPageListCard/)
  assert.match(segmentsSource, /function RelatedRow[\s\S]*?ContentPageRelatedItem/)
  assert.match(segmentsSource, /function RelatedRow[\s\S]*?ContentPageRelatedHeader/)
  assert.match(segmentsSource, /function RelatedRow[\s\S]*?ContentPageRelatedMetaRow/)
  assert.match(contentSemanticUiSource, /contentEntityStatusRecipe/)
  assert.match(contentSemanticUiSource, /import \{ defineFeatureStatusRecipeGroup, type UiStatusRecipe \} from '@\/shared\/presentation\/semanticRecipe'/)
  assert.match(contentSemanticUiSource, /export type ContentStatusRecipe = UiStatusRecipe/)
  assert.match(contentSemanticUiSource, /defineFeatureStatusRecipeGroup\('content\.entity\.status'/)
  assert.match(segmentsSource, /contentEntityStatusRecipe/)
  assert.match(segmentsSource, /contentGapRecipe/)
  assert.doesNotMatch(segmentsSource, /function statusTone\b/)
  assert.doesNotMatch(segmentsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(segmentsSource, /function SegmentButton[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(segmentsSource, /function SceneMomentRow[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(segmentsSource, /function ContentUnitRow[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(segmentsSource, /grid grid-cols-\[minmax\(0,0\.95fr\)_minmax\(0,1\.05fr\)\] gap-4/)
  assert.doesNotMatch(segmentsSource, /grid grid-cols-5 gap-3 p-4/)
  assert.doesNotMatch(segmentsSource, /grid grid-cols-3 gap-3 p-4/)
  assert.doesNotMatch(segmentsSource, /space-y-4 border-t border-border p-4/)
  assert.doesNotMatch(segmentsSource, /ContentPagePanel className="overflow-hidden" bodyClassName="p-0"/)
  assert.doesNotMatch(segmentsSource, /bodyClassName="space-y-3 p-3"/)
  assert.doesNotMatch(segmentsSource, /<ContentPageSurfaceItem/)
  assert.doesNotMatch(segmentsSource, /function RelatedRow[\s\S]*?WorkbenchSurfaceItem/)
  assert.doesNotMatch(segmentsSource, /function RelatedRow[\s\S]*?rounded-md border border-border bg-background px-3 py-2/)
  assert.doesNotMatch(segmentsSource, /function SegmentPreviewValue[\s\S]*?rounded-md border border-border\/70 bg-card px-3 py-2\.5/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?rounded-md border border-border\/70 bg-card p-3/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?<select\b/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?<input type="checkbox"/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?rounded-md border px-3 type-body/)
  assert.doesNotMatch(segmentsSource, /function SegmentInlineField[\s\S]*?rounded-md border border-border\/70 bg-background\/90/)
  assert.doesNotMatch(segmentsSource, /function InfoChip[\s\S]*?rounded-md border border-border bg-card px-2 py-1\.5/)
  assert.doesNotMatch(segmentsSource, /function InfoChip[\s\S]*?bg-card/)
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
  const contentFilterSource = readProjectFile('apps/frontend/src/features/content/presentation/ContentFilterBar.tsx')
  const contentFilterPackageSource = readProjectFile('packages/ui/src/components/business/content/filter-bar/index.tsx')
  const contentFilterPackageCss = readProjectFile('packages/ui/src/components/business/content/filter-bar/styles.css')
  const contentPagePackageSource = readProjectFile('packages/ui/src/components/business/content/page/index.tsx')
  const contentPagePackageCss = readProjectFile('packages/ui/src/components/business/content/page/styles.css')
  const contentWorkbenchDialogsSource = readProjectFile('apps/frontend/src/features/content/components/ContentWorkbenchDialogs.tsx')
  const contentWorkbenchDialogPackageSource = readProjectFile('packages/ui/src/components/business/content/workbench/dialog/index.tsx')
  const contentWorkbenchDialogPackageCss = readProjectFile('packages/ui/src/components/business/content/workbench/dialog/styles.css')
  const businessIndexSource = readProjectFile('packages/ui/src/components/business/index.ts')
  const contentUnitsSource = readProjectFile('apps/frontend/src/features/content/components/ContentUnitsPage.tsx')
  const deliveryPageSource = readProjectFile('apps/frontend/src/features/delivery/components/DeliveryPage.tsx')
  const deliveryWorkbenchSource = readProjectFile('apps/frontend/src/features/delivery/components/DeliveryWorkbenchPage.tsx')
  const deliveryWorkbenchPanelsSource = readProjectFile('apps/frontend/src/features/delivery/components/DeliveryWorkbenchPanels.tsx')
  const deliveryWorkbenchModelSource = readProjectFile('apps/frontend/src/features/delivery/domain/deliveryWorkbenchModel.ts')
  const deliveryWorkbenchOverviewModelSource = readProjectFile('apps/frontend/src/features/delivery/domain/deliveryWorkbenchOverviewModel.ts')
  const productionOrchestrationSource = readProjectFile('apps/frontend/src/features/production/components/ProductionOrchestrationPage.tsx')
  const productionPageSource = readProjectFile('apps/frontend/src/features/production/components/ProductionPage.tsx')
  const productionPagePackageSource = readProjectFile('packages/ui/src/components/business/production/page/index.tsx')
  const productionPagePackageCss = readProjectFile('packages/ui/src/components/business/production/page/styles.css')
  const productionOrchestrationPackageSource = readProjectFile('packages/ui/src/components/business/production/orchestration/index.tsx')
  const productionOrchestrationPackageCss = readProjectFile('packages/ui/src/components/business/production/orchestration/styles.css')
  const productionDeliveryCenterPackageSource = readProjectFile('packages/ui/src/components/business/delivery/center/index.tsx')
  const productionDeliveryCenterPackageCss = readProjectFile('packages/ui/src/components/business/delivery/center/styles.css')
  const sceneMomentsSource = readProjectFile('apps/frontend/src/features/content/components/SceneMomentsPage.tsx')
  const segmentsSource = readProjectFile('apps/frontend/src/features/content/components/SegmentsPage.tsx')
  const contentSemanticUiSource = readProjectFile('apps/frontend/src/features/content/presentation/contentSemanticUi.ts')
  const productionSemanticUiSource = readProjectFile('apps/frontend/src/features/production/presentation/productionSemanticUi.ts')
  const deliverySemanticUiSource = readProjectFile('apps/frontend/src/features/delivery/presentation/deliverySemanticUi.ts')
  const deliveryTimelineTrackSource = readProjectFile('apps/frontend/src/features/delivery/components/DeliveryTimelineTrack.tsx')
  const productionOrchestrationModelSource = readProjectFile('apps/frontend/src/features/production/domain/productionOrchestrationWorkspaceModel.ts')
  const workbenchStatusBadgeSource = readProjectFile('packages/ui/src/components/business/workbench/card/status/index.tsx')
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const directPrimitiveSources = [
    'apps/frontend/src/features/delivery/components/DeliveryPage.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + contentFilterSource
    + '\n'
    + contentUnitsSource
    + '\n'
    + sceneMomentsSource
  const sources = [
    'apps/frontend/src/features/delivery/components/DeliveryPage.tsx',
    'apps/frontend/src/features/content/components/SceneMomentsPage.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + contentUnitsSource
    + '\n'
    + productionOrchestrationModelSource
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(`${sources}\n${contentPagePackageSource}`, /StatusBadge/)
  assert.match(segmentsSource, /ContentPageMetricCard/)
  assert.match(contentPagePackageSource, /function ContentPageMetricCard[\s\S]*?<AppMetricCard/)
  assert.match(`${sources}\n${productionDeliveryCenterPackageSource}`, /AppPanel/)
  assert.match(`${sources}\n${contentPagePackageSource}`, /AppKeyValue/)
  assert.match(sources, /ContentPageInfoBlock/)
  assert.match(`${sources}\n${contentPagePackageSource}`, /AppEmptyState/)
  for (const exportName of [
    'ContentFilterBarShell',
    'ContentFilterChipButton',
    'ContentFilterChipRail',
    'ContentFilterClearButton',
    'ContentFilterCount',
    'ContentFilterSearchBox',
    'ContentFilterSelectField',
    'ContentFilterToolbar',
  ]) {
    assert.match(contentFilterSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content filter bar`)
    assert.match(contentFilterPackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  for (const exportName of ['AppPanel', 'Button', 'Input', 'NativeSelect']) {
    assert.match(contentFilterPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by package content filter bar`)
    assert.doesNotMatch(contentFilterSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into ContentFilterBar`)
  }
  for (const exportName of [
    'ContentWorkbenchDialogFrame',
    'ContentWorkbenchDialogEmptyState',
  ]) {
    assert.match(contentWorkbenchDialogsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content workbench dialogs`)
    assert.match(contentWorkbenchDialogPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  for (const exportName of ['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle', 'AppTextEmptyState']) {
    assert.match(contentWorkbenchDialogPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by package content workbench dialog`)
    assert.doesNotMatch(contentWorkbenchDialogsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into ContentWorkbenchDialogs`)
  }
  for (const className of [
    'content-filter-bar',
    'content-filter-bar__toolbar',
    'content-filter-search',
    'content-filter-select',
    'content-filter-chip-rail',
    'content-filter-chip',
  ]) {
    assert.match(contentFilterPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  for (const exportName of ['ContentPageActionButton', 'ContentPageSummaryGrid']) {
    assert.match(contentPagePackageSource, new RegExp(`export const ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
    assert.match(contentUnitsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content units page`)
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
    assert.match(segmentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by segments page`)
  }
  for (const exportName of [
    'ContentPageListCard',
    'ContentPageListCardDescription',
    'ContentPageListCardHeader',
    'ContentPageListCardMetaRow',
    'ContentPageListCardSubtitle',
    'ContentPageListCardTitle',
  ]) {
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
    assert.match(contentUnitsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content units page`)
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
    assert.match(segmentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by segments page`)
  }
  assert.match(contentPagePackageSource, /export function ContentPageCheckRow\b/, 'ContentPageCheckRow must be package-owned')
  assert.match(businessIndexSource, /\bContentPageCheckRow\b/, 'ContentPageCheckRow must be exported from @movscript/ui')
  assert.match(contentUnitsSource, /\bContentPageCheckRow\b/, 'ContentPageCheckRow must be consumed by content units page')
  for (const exportName of [
    'ContentPageRelatedActionItem',
    'ContentPageRelatedDescription',
    'ContentPageRelatedHeader',
    'ContentPageRelatedItem',
    'ContentPageRelatedMetaRow',
    'ContentPageRelatedStack',
    'ContentPageRelatedTitle',
  ]) {
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  for (const exportName of [
    'ContentPageRelatedDescription',
    'ContentPageRelatedHeader',
    'ContentPageRelatedItem',
    'ContentPageRelatedStack',
    'ContentPageRelatedTitle',
  ]) {
    assert.match(contentUnitsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content units page`)
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
    assert.match(segmentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by segments page`)
  }
  for (const exportName of ['ContentPageRelatedActionItem', 'ContentPageRelatedMetaRow']) {
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
  }
  assert.match(segmentsSource, /\bContentPageRelatedMetaRow\b/)
  for (const exportName of ['ContentPageListCardMetricGrid', 'ContentPageListCardReadiness']) {
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
    assert.match(segmentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by segments page`)
  }
  for (const exportName of ['ContentPageListCardIdentity', 'ContentPageListCardStatusGroup']) {
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  assert.match(contentUnitsSource, /\bContentPageListCardStatusGroup\b/)
  assert.match(segmentsSource, /\bContentPageListCardIdentity\b/)
  for (const className of [
    'content-page-action-button',
    'content-page-action-button--overlay',
    'content-page-disclosure__body',
    'content-page-info-block',
    'content-page-list',
    'content-page-list-viewport',
    'content-page-list-card',
    'content-page-list-card__header',
    'content-page-list-card__identity',
    'content-page-list-card__title',
    'content-page-list-card__description',
    'content-page-list-card__meta-row',
    'content-page-list-card__metric-grid',
    'content-page-list-card__readiness',
    'content-page-check-row',
    'content-page-related-stack',
    'content-page-related-item',
    'content-page-related-item__header',
    'content-page-related-item__title',
    'content-page-related-item__description',
    'content-page-related-item__meta-row',
    'content-page-summary-grid',
    'content-page-summary-grid--four',
    'content-page-summary-grid--two-to-four',
  ]) {
    assert.match(contentPagePackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  for (const className of [
    'content-workbench-dialog',
    'content-workbench-dialog__header',
    'content-workbench-dialog__body',
  ]) {
    assert.match(contentWorkbenchDialogPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  for (const exportName of [
    'ProductionDeliveryScopeSelect',
    'ProductionDeliveryVersionCard',
    'ProductionDeliveryVersionCardMeta',
    'ProductionDeliveryVersionListSection',
    'ProductionDeliveryVersionListStack',
    'ProductionDeliveryVersionListSummaryGrid',
    'ProductionDeliveryVersionListViewport',
    'ProductionDeliveryWorkbenchActionButton',
    'ProductionDeliveryWorkbenchBadge',
    'ProductionDeliveryWorkbenchEmptyState',
    'ProductionDeliveryWorkbenchLayout',
    'ProductionDeliveryWorkbenchMetric',
    'ProductionDeliveryWorkbenchSection',
    'ProductionDeliveryWorkbenchStatusBadge',
  ]) {
    assert.match(deliveryWorkbenchSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by DeliveryWorkbenchPage`)
    assert.match(
      productionDeliveryCenterPackageSource,
      new RegExp(`export (?:function|const) ${exportName}\\b`),
      `${exportName} must be package-owned`,
    )
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  for (const className of [
    'production-delivery-scope-select',
    'production-delivery-version-card-meta',
    'production-delivery-version-list-section__body',
    'production-delivery-version-list-stack',
    'production-delivery-version-list-summary-grid',
    'production-delivery-version-list-viewport',
    'production-delivery-workbench-layout',
  ]) {
    assert.match(productionDeliveryCenterPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(deliveryWorkbenchSource, /function ProductionScopeSelect[\s\S]*?ProductionDeliveryScopeSelect/)
  assert.match(productionDeliveryCenterPackageSource, /function ProductionDeliveryScopeSelect[\s\S]*?NativeSelect/)
  assert.doesNotMatch(contentFilterSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(contentFilterSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(contentFilterSource, /<select\b/)
  assert.doesNotMatch(contentFilterSource, /<button\b/)
  assert.doesNotMatch(contentFilterSource, /className=/)
  assert.doesNotMatch(contentFilterSource, /<(?:div|span|label|option)\b/)
  assert.doesNotMatch(contentFilterSource, /flex flex-wrap items-center gap-3 px-4 py-3/)
  assert.doesNotMatch(contentFilterSource, /pointer-events-none absolute left-2\.5 top-1\/2/)
  assert.doesNotMatch(contentWorkbenchDialogsSource, /<DialogContent\b/)
  assert.doesNotMatch(contentWorkbenchDialogsSource, /<DialogHeader\b/)
  assert.doesNotMatch(contentWorkbenchDialogsSource, /className="max-h-\[88vh\]/)
  assert.doesNotMatch(contentWorkbenchDialogsSource, /className="border-b border-border px-5 py-4"/)
  assert.doesNotMatch(contentWorkbenchDialogsSource, /className="p-5"/)
  assert.doesNotMatch(deliveryWorkbenchSource, /function ProductionScopeSelect[\s\S]*?<select\b/)
  assert.match(productionDeliveryCenterPackageSource, /function ProductionDeliveryWorkbenchSection[\s\S]*?<WorkbenchSection/)
  assert.doesNotMatch(
    deliveryWorkbenchSource,
    /\b(?:Badge|Button|ContentWorkspaceLayout|NativeSelect|StatusBadge|WorkbenchEmptyState|WorkbenchEntityCard|WorkbenchMetric|WorkbenchSection|WorkbenchStatusBadge)\b/,
    'DeliveryWorkbenchPage must not consume raw ui primitives',
  )
  assert.doesNotMatch(deliveryWorkbenchSource, /bodyClassName=|className=|<(?:div|label|p|section|span)\b/)
  assert.doesNotMatch(deliveryWorkbenchSource, /rounded-lg border border-border bg-card/)
  for (const exportName of [
    'ProductionOrchestrationGenerationNotice',
    'ProductionOrchestrationHeaderAction',
    'ProductionOrchestrationHeaderBadge',
    'ProductionOrchestrationHeaderMetaBadge',
    'ProductionOrchestrationMain',
    'ProductionOrchestrationProposalBanner',
    'ProductionOrchestrationProductionSelectTrigger',
    'ProductionOrchestrationReviewDialogContent',
    'ProductionOrchestrationReviewDialogTitle',
    'ProductionOrchestrationReviewEmptyNotice',
    'ProductionOrchestrationRevisionDialogContent',
    'ProductionOrchestrationSkeleton',
    'ProductionOrchestrationViewport',
    'ProductionOrchestrationWorkspaceBody',
    'ProductionOrchestrationWorkspaceFrame',
  ]) {
    assert.match(productionOrchestrationSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ProductionOrchestrationPage`)
    assert.match(productionOrchestrationPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  for (const exportName of ['WorkbenchSection', 'WorkbenchSurfaceItem', 'AppSkeleton', 'AppInlineMeta', 'AppSurfaceItem', 'Button', 'DialogContent', 'DialogTitle', 'Label', 'SelectTrigger', 'Textarea']) {
    assert.match(productionOrchestrationPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be hidden inside production orchestration package`)
    assert.doesNotMatch(productionOrchestrationSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into ProductionOrchestrationPage`)
  }
  for (const className of [
    'production-orchestration-viewport',
    'production-orchestration-main',
    'production-orchestration-workspace-frame',
    'production-orchestration-workspace-body',
    'production-orchestration-header-badge',
    'production-orchestration-header-action',
    'production-orchestration-production-select-trigger',
    'production-orchestration-proposal-banner',
    'production-orchestration-generation-notice',
    'production-orchestration-review-dialog-content',
    'production-orchestration-review-dialog-title',
    'production-orchestration-review-empty-notice',
    'production-orchestration-revision-dialog-content',
    'production-orchestration-revision-dialog-textarea',
    'production-orchestration-revision-dialog-actions',
    'production-orchestration-skeleton',
    'production-orchestration-skeleton__grid',
  ]) {
    assert.match(productionOrchestrationPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(productionOrchestrationSource, /proposalModeActive[\s\S]*?<ProductionOrchestrationProposalBanner/)
  assert.match(productionOrchestrationSource, /orchestrationStage !== 'idle'[\s\S]*?<ProductionOrchestrationGenerationNotice/)
  assert.match(productionOrchestrationSource, /proposalReviewOpen[\s\S]*?<ProductionOrchestrationReviewDialogContent/)
  assert.match(productionOrchestrationSource, /proposalRevisionDialogOpen[\s\S]*?<ProductionOrchestrationRevisionDialogContent/)
  assert.match(productionSemanticUiSource, /import \{ defineFeatureStatusRecipeGroup, type UiStatusRecipe \} from '@\/shared\/presentation\/semanticRecipe'/)
  assert.match(productionSemanticUiSource, /export type ProductionStatusRecipe = UiStatusRecipe/)
  assert.match(productionSemanticUiSource, /defineFeatureStatusRecipeGroup\('production\.workflow\.status'/)
  assert.match(productionSemanticUiSource, /productionStatusRecipe/)
  assert.match(productionSemanticUiSource, /productionUnitStatusRecipe/)
  assert.match(productionSemanticUiSource, /productionProposalModeRecipe/)
  assert.match(deliverySemanticUiSource, /deliveryWorkbenchStatusRecipe/)
  assert.match(deliverySemanticUiSource, /deliveryGateStatusRecipe/)
  assert.match(deliverySemanticUiSource, /deliveryOverviewMetricRecipe/)
  assert.match(deliverySemanticUiSource, /deliveryTimelineItemRecipe/)
  assert.match(deliveryPageSource, /deliveryWorkbenchStatusRecipe/)
  assert.match(productionPageSource, /productionStatusRecipe/)
  assert.match(productionPageSource, /productionUnitStatusRecipe/)
  assert.match(deliveryWorkbenchSource, /deliveryWorkbenchStatusRecipe/)
  assert.match(deliveryWorkbenchPanelsSource, /deliveryWorkbenchStatusRecipe/)
  assert.match(deliveryWorkbenchPanelsSource, /deliveryGateStatusRecipe/)
  assert.match(deliveryWorkbenchPanelsSource, /deliveryOverviewMetricRecipe\(metric\.state\)\.intent/)
  assert.match(deliveryTimelineTrackSource, /deliveryTimelineItemRecipe/)
  assert.match(deliveryWorkbenchPanelsSource, /ProductionDeliveryGateCheckItem/)
  assert.match(deliveryWorkbenchPanelsSource, /ProductionDeliveryExportRecordItem/)
  assert.match(productionDeliveryCenterPackageSource, /export function ProductionDeliveryGateCheckItem[\s\S]*?<ProductionDeliveryGateIconFrame/)
  assert.match(productionDeliveryCenterPackageSource, /export function ProductionDeliveryExportRecordItem[\s\S]*?<ProductionDeliveryErrorText/)
  assert.doesNotMatch(deliveryWorkbenchPanelsSource, /\bProductionDeliveryGateIconFrame\b/)
  assert.doesNotMatch(deliveryWorkbenchPanelsSource, /\bProductionDeliveryErrorText\b/)
  assert.match(productionDeliveryCenterPackageSource, /export function ProductionDeliveryGateIconFrame/)
  assert.match(productionDeliveryCenterPackageSource, /export function ProductionDeliveryErrorText/)
  assert.match(productionDeliveryCenterPackageCss, cssClassSelectorPattern('production-delivery-gate-icon-frame'))
  assert.match(productionDeliveryCenterPackageCss, cssClassSelectorPattern('production-delivery-error-text'))
  assert.match(deliveryWorkbenchOverviewModelSource, /export type DeliveryOverviewMetricState =/)
  assert.match(deliveryWorkbenchOverviewModelSource, /DeliveryOverviewMetric[\s\S]*?state: DeliveryOverviewMetricState/)
  assert.doesNotMatch(deliveryWorkbenchOverviewModelSource, /\bDeliveryOverviewMetricTone\b/)
  assert.doesNotMatch(deliveryWorkbenchOverviewModelSource, /\btone:\s*['"](?:success|danger|warning|neutral|info)['"]/)
  assert.doesNotMatch(deliveryWorkbenchPanelsSource, /\bmetric\.tone\b/)
  assert.doesNotMatch(deliveryWorkbenchPanelsSource, /\bSemanticTone\b/)
  assert.doesNotMatch(deliveryWorkbenchPanelsSource, /\b(?:toneTextClass|toneSurfaceClass)\b/)
  assert.match(productionOrchestrationSource, /productionProposalModeRecipe/)
  assert.match(workbenchStatusBadgeSource, /StatusBadgeProps/)
  assert.match(workbenchStatusBadgeSource, /\.\.\.statusProps/)
  assert.match(productionPagePackageSource, /\bAppIconFrame\b/, 'production page package components own icon frame styling')
  assert.match(productionPagePackageSource, /\bAppMarkerDot\b/, 'production page package components own timeline marker styling')
  assert.match(productionPagePackageSource, /\bAppSection\b/, 'production page package components own section styling')
  assert.match(productionPagePackageSource, /\bWorkbenchListItem\b/, 'production page package components own next action row styling')
  assert.doesNotMatch(productionPageSource, /\bAppIconFrame\b/, 'ProductionPage must use production page wrappers instead of app icon frame')
  assert.doesNotMatch(productionPageSource, /\bAppMarkerDot\b/, 'ProductionPage must use production page wrappers instead of app marker dot')
  assert.doesNotMatch(productionPageSource, /\bAppSection\b/, 'ProductionPage must use production page wrappers instead of app section')
  assert.doesNotMatch(productionPageSource, /\bWorkbenchListItem\b/, 'ProductionPage must use production page wrappers instead of workbench list item')
  for (const exportName of [
    'ProductionPageActionButton',
    'ProductionPageActivityStack',
    'ProductionPageAsideActionGrid',
    'ProductionPageBadge',
    'ProductionPageBottomGrid',
    'ProductionPageAreaCard',
    'ProductionPageAreaCardIdentity',
    'ProductionPageAreaCardMetric',
    'ProductionPageActivityItem',
    'ProductionPageCardDescription',
    'ProductionPageCardHeader',
    'ProductionPageCardSubtitle',
    'ProductionPageCardTitle',
    'ProductionPageDetailGrid',
    'ProductionPageEmptyActions',
    'ProductionPageEmptyState',
    'ProductionPageEyebrow',
    'ProductionPageFooterAction',
    'ProductionPageHeaderFrame',
    'ProductionPageLayout',
    'ProductionPageListCard',
    'ProductionPageListStack',
    'ProductionPageMain',
    'ProductionPageMetaItem',
    'ProductionPageMetaRow',
    'ProductionPageMetric',
    'ProductionPageNextActionItem',
    'ProductionPagePreviewActionSlot',
    'ProductionPagePreviewDescription',
    'ProductionPagePreviewMetaLine',
    'ProductionPagePreviewMetaStack',
    'ProductionPagePreviewProgress',
    'ProductionPagePreviewTitle',
    'ProductionPageProgressRow',
    'ProductionPageScrollArea',
    'ProductionPageSection',
    'ProductionPageSectionActionText',
    'ProductionPageStack',
    'ProductionPageStatusBadge',
    'ProductionPageUnitBody',
    'ProductionPageUnitCode',
    'ProductionPageUnitCodeLine',
    'ProductionPageUnitRow',
    'ProductionPageUnitSummary',
    'ProductionPageUnitText',
    'ProductionPageUnitTitle',
  ]) {
    assert.match(productionPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
    assert.match(productionPageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ProductionPage`)
  }
  for (const className of [
    'production-page-action-button',
    'production-page-activity-stack',
    'production-page-aside-action-grid',
    'production-page-badge',
    'production-page-bottom-grid',
    'production-page-detail-grid',
    'production-page-empty-actions',
    'production-page-eyebrow',
    'production-page-header-frame',
    'production-page-layout',
    'production-page-list-card',
    'production-page-main',
    'production-page-meta-row__item',
    'production-page-preview__title',
    'production-page-preview__description',
    'production-page-preview__meta-line',
    'production-page-preview__meta-stack',
    'production-page-preview__progress',
    'production-page-scroll-area',
    'production-page-section__body',
    'production-page-section__body--cards',
    'production-page-section__body--metrics',
    'production-page-section__body--stats',
    'production-page-section__body--units',
    'production-page-section-action-text',
    'production-page-stack',
    'production-page-status-badge',
    'production-page-card__header',
    'production-page-card__title',
    'production-page-card__description',
    'production-page-progress-row',
    'production-page-meta-row',
    'production-page-next-action',
    'production-page-activity-item',
    'production-page-area-card',
    'production-page-area-card__identity',
    'production-page-area-card__metric',
    'production-page-unit-row',
    'production-page-unit-row__code-line',
  ]) {
    assert.match(productionPagePackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(productionPagePackageSource, /ProductionPageListCard[\s\S]*?<WorkbenchSurfaceItem[\s\S]*?<Button[\s\S]*?onClick=\{onSelect\}/)
  assert.doesNotMatch(productionPageSource, /function ProductionListCard[\s\S]*?<WorkbenchSurfaceItem/)
  assert.doesNotMatch(productionPageSource, /function AreaCard[\s\S]*?<WorkbenchSurfaceItem/)
  assert.doesNotMatch(productionPageSource, /function ProductionUnitRow[\s\S]*?grid grid-cols-\[92px_minmax/)
  assert.doesNotMatch(productionPageSource, /\b(?:AppContentLayout|AppEmptyState|AppMetricCard|Badge|Button|Progress|StatusBadge)\b/)
  assert.doesNotMatch(productionPageSource, /className=|bodyClassName=|<(?:div|main|p|section|span)\b/)
  assert.doesNotMatch(productionPageSource, /<button type="button" onClick=\{onSelect\} className="block w-full text-left"/)
  assert.doesNotMatch(productionOrchestrationSource, /rounded-lg border border-border bg-background p-4/)
  assert.doesNotMatch(productionOrchestrationSource, /h-[345] w-[^"]+ rounded bg-muted/)
  assert.doesNotMatch(productionOrchestrationSource, /rounded-full bg-muted px-1\.5/)
  assert.doesNotMatch(productionOrchestrationSource, /border-b border-border bg-muted\/40 px-4 py-2/)
  assert.doesNotMatch(productionOrchestrationSource, /rounded-md border border-border bg-muted\/30/)
  assert.doesNotMatch(productionOrchestrationSource, /rounded bg-muted\/70/)
  for (const exportName of [
    'ProductionDeliveryCenterBadge',
    'ProductionDeliveryCenterEmptyState',
    'ProductionDeliveryCenterHeaderAction',
    'ProductionDeliveryCenterLayout',
    'ProductionDeliveryCenterMetric',
    'ProductionDeliveryCenterMetricGrid',
    'ProductionDeliveryCenterModeCard',
    'ProductionDeliveryCenterModeStack',
    'ProductionDeliveryCenterPageLayout',
    'ProductionDeliveryCenterPanel',
    'ProductionDeliveryCenterRow',
    'ProductionDeliveryCenterSection',
    'ProductionDeliveryCenterSideRail',
    'ProductionDeliveryCenterStatusBadge',
    'ProductionDeliveryCenterTextBlock',
    'ProductionDeliveryCenterTextStack',
  ]) {
    assert.match(deliveryPageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by delivery page`)
    assert.match(productionDeliveryCenterPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  for (const exportName of ['AppPanel', 'AppSection', 'AppSurfaceItem', 'Button', 'Progress', 'accentBadgeClass', 'accentTextClass', 'toneTextClass']) {
    assert.match(productionDeliveryCenterPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be hidden inside production delivery center package`)
    assert.doesNotMatch(deliveryPageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into DeliveryPage`)
  }
  for (const className of [
    'production-delivery-center-header-action',
    'production-delivery-center-page',
    'production-delivery-center-badge',
    'production-delivery-center-status-badge',
    'production-delivery-center-metric-grid',
    'production-delivery-center-layout',
    'production-delivery-center-side-rail',
    'production-delivery-center-section__body',
    'production-delivery-center-panel__body',
    'production-delivery-center-mode-stack',
    'production-delivery-center-mode-card',
    'production-delivery-center-text-block',
    'production-delivery-center-text-stack',
    'production-delivery-center-row',
    'production-delivery-center-row__mode',
    'production-delivery-center-row__readiness-action',
  ]) {
    assert.match(productionDeliveryCenterPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(deliveryPageSource, /<ProductionDeliveryCenterRow[\s\S]*?mode=\{row\.mode\}[\s\S]*?ProductionDeliveryCenterStatusBadge/)
  assert.match(productionDeliveryCenterPackageSource, /ProductionDeliveryCenterRow[\s\S]*?<Badge[\s\S]*?accentBadgeClass/)
  assert.match(productionDeliveryCenterPackageSource, /ProductionDeliveryCenterRow[\s\S]*?<Progress/)
  assert.match(productionDeliveryCenterPackageSource, /ProductionDeliveryCenterRow[\s\S]*?<Button[\s\S]*?asChild/)
  assert.doesNotMatch(deliveryPageSource, /\b(?:cn\(|accentBadgeClass|Progress|Button|Badge|StatusBadge|AppContentLayout|AppEmptyState|AppMetricCard|AppPanel|AppSection|AppSurfaceItem)\b/)
  assert.doesNotMatch(deliveryPageSource, /className=|<(?:div|p|section|span)\b/)
  assert.doesNotMatch(deliveryPageSource, /grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5/)
  assert.doesNotMatch(deliveryPageSource, /grid gap-4 xl:grid-cols-\[minmax\(0,1fr\)_360px\]/)
  assert.doesNotMatch(deliveryPageSource, /function ModeCard\b/)
  assert.doesNotMatch(deliveryPageSource, /function DeliveryProductionRow[\s\S]*?<article/)
  assert.doesNotMatch(deliveryPageSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(deliveryPageSource, /rounded-md border border-border bg-background p-3/)
  for (const exportName of [
    'ContentPageDisclosure',
    'ContentPageIconFrame',
    'ContentPageInfoBlock',
    'ContentPageKeyValue',
    'ContentPageList',
    'ContentPageListViewport',
    'ContentPageMeta',
    'ContentPageMetricCard',
    'ContentPagePanel',
    'ContentPageSection',
    'ContentPageTextEmptyState',
    'ContentPageEmptyState',
    'ContentPageToneText',
  ]) {
    assert.match(contentUnitsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content units page`)
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  assert.match(contentPagePackageSource, /\bWorkbenchSurfaceItem\b/, 'content page package wrappers must own related surface item structure')
  assert.match(contentPagePackageSource, /\bWorkbenchList\b/, 'content page package wrappers must own list stack structure')
  assert.match(contentPagePackageSource, /\bAppDisclosure\b/, 'content page package wrappers must own disclosure structure')
  assert.match(contentPagePackageSource, /\bAppIconFrame\b/, 'content page package wrappers must own icon frame structure')
  assert.match(contentPagePackageSource, /\bAppInfoBlock\b/, 'content page package wrappers must own info block structure')
  assert.match(contentPagePackageSource, /\bAppKeyValue\b/, 'content page package wrappers must own key value structure')
  assert.match(contentPagePackageSource, /\bAppMetricCard\b/, 'content page package wrappers must own metric card structure')
  assert.match(contentPagePackageSource, /\bAppEmptyState\b/, 'content page package wrappers must own empty state structure')
  assert.match(contentPagePackageSource, /\btoneTextClass\b/, 'content page package wrappers must own semantic tone text mapping')
  assert.match(contentPagePackageSource, /function ContentPageCheckRow[\s\S]*?<AppSurfaceItem/, 'content page package wrappers must own check row surface item structure')
  assert.doesNotMatch(contentUnitsSource, /\bWorkbenchSurfaceItem\b/, 'content units page must use content page wrappers instead of workbench surface primitives')
  assert.doesNotMatch(contentUnitsSource, /\bWorkbenchList\b/, 'content units page must use content page list wrapper instead of workbench list primitive')
  assert.doesNotMatch(contentUnitsSource, /\bAppSurfaceItem\b/, 'content units page must use content page wrappers instead of app surface primitives')
  assert.doesNotMatch(contentUnitsSource, /\bAppDisclosure\b/, 'content units page must use content page disclosure wrapper instead of app disclosure')
  assert.doesNotMatch(contentUnitsSource, /\bAppIconFrame\b/, 'content units page must use content page icon wrapper instead of app icon frame')
  assert.doesNotMatch(contentUnitsSource, /\bAppInfoBlock\b/, 'content units page must use content page info wrapper instead of app info block')
  assert.doesNotMatch(contentUnitsSource, /\bAppInlineMeta\b/, 'content units page must use content page meta wrapper instead of app inline meta')
  assert.doesNotMatch(contentUnitsSource, /\bAppPanel\b/, 'content units page must use content page panel wrapper instead of app panel')
  assert.doesNotMatch(contentUnitsSource, /\bAppSection\b/, 'content units page must use content page section wrapper instead of app section')
  assert.doesNotMatch(contentUnitsSource, /\bAppTextEmptyState\b/, 'content units page must use content page empty wrapper instead of app text empty state')
  assert.doesNotMatch(contentUnitsSource, /\b(?:AppEmptyState|AppKeyValue|AppMetricCard|toneTextClass)\b/, 'content units page must use content page wrappers instead of app display primitives')
  assert.doesNotMatch(productionPageSource, /flex h-[68] w-[68] shrink-0 items-center justify-center rounded-md bg-muted/)
  assert.doesNotMatch(productionPageSource, /h-2 w-2 shrink-0 rounded-full bg-muted-foreground/)
  assert.doesNotMatch(contentUnitsSource, /flex h-8 w-8 (?:shrink-0 )?items-center justify-center rounded-md bg-muted/)
  assert.match(contentUnitsSource, /function ContentUnitCard[\s\S]*?ContentPageListCard/)
  assert.match(contentUnitsSource, /function RelatedPanel[\s\S]*?ContentPageRelatedStack/)
  assert.match(contentUnitsSource, /function RelatedPanel[\s\S]*?ContentPageRelatedItem/)
  assert.match(contentUnitsSource, /function ContentTargetPanel[\s\S]*?ContentPageRelatedStack/)
  assert.match(contentUnitsSource, /function ContentTargetPanel[\s\S]*?ContentPageRelatedItem/)
  assert.match(contentUnitsSource, /function CheckRow[\s\S]*?ContentPageCheckRow/)
  assert.match(contentSemanticUiSource, /contentEntityStatusRecipe/)
  assert.match(contentSemanticUiSource, /contentProgressRecipe/)
  assert.match(contentUnitsSource, /contentEntityStatusRecipe/)
  assert.match(contentUnitsSource, /contentProgressRecipe/)
  assert.doesNotMatch(contentUnitsSource, /function ContentUnitCard[\s\S]*?WorkbenchListItem/)
  assert.doesNotMatch(contentUnitsSource, /function ContentUnitCard[\s\S]*?className="flex items-start justify-between gap-2"/)
  assert.doesNotMatch(contentUnitsSource, /function ContentUnitCard[\s\S]*?className="mt-2 flex flex-wrap gap-x-2 gap-y-1/)
  assert.match(contentUnitsSource, /<ContentPageActionButton size="sm" variant="outline"[\s\S]*?预览/)
  assert.match(contentUnitsSource, /<ContentPageActionButton size="sm" asChild>[\s\S]*?进入编排/)
  assert.match(sceneMomentsSource, /<ContentPageActionButton size="sm" variant="outline"[\s\S]*?预览/)
  assert.match(segmentsSource, /<ContentPageActionButton type="button" size="sm" variant="outline" surface="overlay"[\s\S]*?预览/)
  assert.match(segmentsSource, /<ContentPageActionButton type="submit" size="sm"[\s\S]*?保存/)
  assert.doesNotMatch(`${contentUnitsSource}\n${sceneMomentsSource}\n${segmentsSource}`, /<Button className="gap-2"/)
  assert.doesNotMatch(`${contentUnitsSource}\n${sceneMomentsSource}\n${segmentsSource}`, /<Button variant="outline" className="gap-2"/)
  assert.doesNotMatch(`${contentUnitsSource}\n${sceneMomentsSource}\n${segmentsSource}`, /<Button\b[^>]*className="[^"]*gap-(?:1\.5|2)/)
  assert.doesNotMatch(`${contentUnitsSource}\n${sceneMomentsSource}\n${segmentsSource}`, /bg-background\/80/)
  assert.doesNotMatch(sceneMomentsSource, /\bButton\b/)
  assert.doesNotMatch(segmentsSource, /\bButton\b/)
  assert.doesNotMatch(`${contentUnitsSource}\n${sceneMomentsSource}\n${segmentsSource}`, /className="grid grid-cols-4 gap-3"/)
  assert.doesNotMatch(contentUnitsSource, /className="grid grid-cols-2 gap-3 md:grid-cols-4"/)
  assert.doesNotMatch(contentUnitsSource, /function statusTone\b/)
  assert.doesNotMatch(contentUnitsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(contentUnitsSource, /content-units-summary-strip[\s\S]{0,200}rounded-md border border-border bg-card/)
  assert.doesNotMatch(contentUnitsSource, /制作项清单[\s\S]{0,400}rounded-lg border border-border bg-card/)
  assert.doesNotMatch(contentUnitsSource, /function ContentUnitCard[\s\S]*?rounded-md border bg-background px-3 py-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /function RelatedPanel[\s\S]*?rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /function ContentTargetPanel[\s\S]*?rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /function CheckRow[\s\S]*?rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentUnitsSource, /content-unit-detail-context[\s\S]{0,200}rounded-md border border-border bg-background/)
  assert.doesNotMatch(contentUnitsSource, /rounded bg-muted px-1\.5 py-0\.5 type-tiny font-semibold/)
  for (const exportName of ['ContentPageEmptyState', 'ContentPageKeyValue', 'ContentPageMeta', 'ContentPageMetricCard', 'ContentPagePanel', 'ContentPageStatusBadge', 'ContentPageSurfaceItem', 'ContentPageTextEmptyState']) {
    assert.match(sceneMomentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scene moments page`)
    assert.match(contentPagePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  assert.match(sceneMomentsSource, /\bContentPageListViewport\b/, 'scene moments page list scrolling must use package-owned content viewport')
  assert.match(contentPagePackageSource, /export function ContentPageListViewport\b/, 'ContentPageListViewport must be package-owned')
  assert.match(businessIndexSource, /\bContentPageListViewport\b/, 'ContentPageListViewport must be exported from @movscript/ui')
  assert.doesNotMatch(sceneMomentsSource, /\bAppInlineMeta\b/, 'scene moments page must use content page meta wrapper instead of app inline meta')
  assert.doesNotMatch(sceneMomentsSource, /\bAppPanel\b/, 'scene moments page must use content page panel wrapper instead of app panel')
  assert.doesNotMatch(sceneMomentsSource, /\bAppSurfaceItem\b/, 'scene moments page must use content page surface wrapper instead of app surface item')
  assert.doesNotMatch(sceneMomentsSource, /\bAppTextEmptyState\b/, 'scene moments page must use content page empty wrapper instead of app text empty state')
  assert.doesNotMatch(sceneMomentsSource, /\bAppEmptyState\b/, 'scene moments page must use content page empty wrapper instead of app empty state')
  assert.doesNotMatch(sceneMomentsSource, /\bAppKeyValue\b/, 'scene moments page must use content page key value wrapper instead of app key value')
  assert.doesNotMatch(sceneMomentsSource, /\bAppMetricCard\b/, 'scene moments page must use content page metric wrapper instead of app metric card')
  assert.doesNotMatch(sceneMomentsSource, /\bStatusBadge\b/, 'scene moments page must use content page status badge wrapper instead of status primitive')
  assert.match(contentPagePackageSource, /\bWorkbenchListItem\b/, 'content page package wrappers must own related action item structure')
  assert.match(contentPagePackageSource, /\bWorkbenchSurfaceItem\b/, 'content page package wrappers must own related surface item structure')
  assert.doesNotMatch(sceneMomentsSource, /\bWorkbenchListItem\b/, 'scene moments page must use content page related wrappers instead of workbench list primitives')
  assert.doesNotMatch(sceneMomentsSource, /\bWorkbenchSurfaceItem\b/, 'scene moments page must use content page related wrappers instead of workbench surface primitives')
  assert.doesNotMatch(segmentsSource, /\bWorkbenchSurfaceItem\b/, 'segments page must use content page related wrappers instead of workbench surface primitives')
  assert.match(sceneMomentsSource, /function MomentButton[\s\S]*?ContentPageListCard/)
  assert.match(sceneMomentsSource, /function RelatedList[\s\S]*?ContentPageRelatedStack/)
  assert.match(sceneMomentsSource, /function RelatedList[\s\S]*?ContentPageRelatedActionItem/)
  assert.match(sceneMomentsSource, /function RelatedList[\s\S]*?ContentPageRelatedItem/)
  assert.match(sceneMomentsSource, /contentEntityStatusRecipe/)
  assert.match(sceneMomentsSource, /accentTone:\s*'teal'/)
  assert.doesNotMatch(sceneMomentsSource, /\b(?:accentGradientClass|accentClassName)\b/)
  assert.doesNotMatch(sceneMomentsSource, /function statusTone\b/)
  assert.doesNotMatch(sceneMomentsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(sceneMomentsSource, /function MomentButton[\s\S]*?w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(sceneMomentsSource, /function MomentButton[\s\S]*?className="p-3"/)
  assert.doesNotMatch(sceneMomentsSource, /function MomentButton[\s\S]*?<Progress\b/)
  assert.doesNotMatch(sceneMomentsSource, /function MomentButton[\s\S]*?className="mt-3 grid grid-cols-3 gap-2"/)
  assert.doesNotMatch(segmentsSource, /function SegmentButton[\s\S]{0,1800}WorkbenchListItem/)
  assert.doesNotMatch(segmentsSource, /function SegmentButton[\s\S]{0,1800}className="p-3"/)
  assert.doesNotMatch(segmentsSource, /function SegmentButton[\s\S]{0,1800}accentSoftClass\('cyan'\)/)
  assert.doesNotMatch(segmentsSource, /function SegmentButton[\s\S]{0,1800}className="mt-3 grid grid-cols-3 gap-2"/)
  assert.doesNotMatch(sceneMomentsSource, /function RelatedList[\s\S]*?rounded-md border border-border bg-background px-3 py-2/)
  assert.doesNotMatch(sceneMomentsSource, /inline-flex max-w-full items-center gap-1\.5 rounded-md border border-border bg-muted\/40/)
  assert.doesNotMatch(sceneMomentsSource, /rounded-md border border-dashed border-border px-3 py-3/)
  assert.match(sources, /StatusBadge/)
  assert.match(`${contentPagePackageSource}\n${productionDeliveryCenterPackageSource}\n${productionPagePackageSource}`, /accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class/)
  assert.doesNotMatch(sources, /\baccent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class\b/)
  assert.doesNotMatch(`${deliveryPageSource}\n${productionPageSource}\n${productionOrchestrationSource}`, /<StatusBadge\b[^>]*\btone=|<StatusDot\b[^>]*\btone=|function (?:deliveryStatusTone|productionStatusTone|unitStatusTone)\b/)
  assert.doesNotMatch(`${deliveryWorkbenchSource}\n${deliveryWorkbenchPanelsSource}`, /<WorkbenchStatusBadge\b[^>]*\btone=\{deliveryWorkbenchStatusTone/)
  assert.doesNotMatch(`${deliveryWorkbenchSource}\n${deliveryWorkbenchPanelsSource}\n${deliveryWorkbenchModelSource}`, /deliveryWorkbenchStatusTone|DeliveryWorkbenchStatusTone/)
  assert.doesNotMatch(productionOrchestrationModelSource, /\bstatusTone\b|ProductionSegmentStatusTone/)
  assert.doesNotMatch(directPrimitiveSources, /function (MetricCard|MiniStat|StatusBadge|EmptyState|InfoBlock)\b/)
  assert.match(uiSemanticHelperSource, /"lime"/)
  assert.doesNotMatch(themeCss, /\.ms-accent-badge--lime/)
  assert.match(uiSemanticCss, /\.ms-accent-badge--lime/)
})

test('workbench workflow panels use package tone contracts', () => {
  const sources = [
    'apps/frontend/src/features/pre-production/components/PreProductionAssetBoard.tsx',
    'apps/frontend/src/features/content/components/ContentWorkbenchUnitTrack.tsx',
    'packages/ui/src/components/business/content/workbench/review/index.tsx',
    'apps/frontend/src/features/content/components/ContentUnitQuickCreateCards.tsx',
    'apps/frontend/src/features/delivery/components/DeliveryWorkbenchPanels.tsx',
    'apps/frontend/src/features/delivery/components/DeliveryTimelineTrack.tsx',
    'apps/frontend/src/components/workbench/PreProductionAssetDetail.tsx',
    'apps/frontend/src/features/content/components/ContentWorkbenchSearch.ts',
    'apps/frontend/src/components/workbench/ProductionSceneWriting.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/
  const workbenchCardSource = readWorkbenchCardSource()
  const preProductionBoardSource = readProjectFile('apps/frontend/src/features/pre-production/components/PreProductionAssetBoard.tsx')
  const preProductionAssetDetailSource = readProjectFile('apps/frontend/src/components/workbench/PreProductionAssetDetail.tsx')
  const resourcePagePackageSource = readProjectFile('packages/ui/src/components/business/resource/page/index.tsx')
  const contentUnitTrackSource = readProjectFile('apps/frontend/src/features/content/components/ContentWorkbenchUnitTrack.tsx')
  const keyframeEditorSource = readProjectFile('apps/frontend/src/features/content/components/ContentWorkbenchKeyframeEditor.tsx')
  const contentWorkbenchEditorPackageSource = readProjectFile('packages/ui/src/components/business/content/workbench/editor/index.tsx')
  const contentWorkbenchEditorPackageCss = readProjectFile('packages/ui/src/components/business/content/workbench/editor/styles.css')
  const contentUnitEditCardsSource = readProjectFile('apps/frontend/src/features/content/components/ContentUnitEditCards.tsx')
  const contentWorkbenchNextActionsSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchNextActions.ts')
  const contentWorkbenchReadinessSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchReadiness.ts')
  const contentWorkbenchUnitHealthSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchUnitHealth.ts')
  const contentWorkbenchDeliveryBriefSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchDeliveryBrief.ts')
  const contentWorkbenchActivitySource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchActivity.ts')
  const contentWorkbenchPipelineSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchPipeline.ts')
  const contentWorkbenchUnitTrackDomainSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchUnitTrack.ts')
  const contentWorkbenchModelSource = readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchModel.ts')
  const frontendWorkbenchTypesSource = readProjectFile('apps/frontend/src/shared/domain/workbenchTypes.ts')
  const packageWorkbenchTypesSource = readProjectFile('packages/ui/src/components/business/workbench/types.ts')
  const packageWorkbenchGateSource = readProjectFile('packages/ui/src/components/business/workbench/chrome/gate/index.tsx')
  const contentUnitPlanningEditorsSource = readProjectFile('apps/frontend/src/features/content/components/ContentUnitPlanningEditors.tsx')
  const contentUnitGenerationInputsSource = readProjectFile('apps/frontend/src/features/content/components/ContentUnitGenerationInputsPanel.tsx')
  const contentWorkbenchPageSource = readProjectFile('apps/frontend/src/features/content/components/ContentWorkbenchPage.tsx')
  const contentWorkbenchPackageSource = readProjectFile('packages/ui/src/components/business/content/workbench/index.tsx')
  const contentWorkbenchPackageCss = readProjectFile('packages/ui/src/components/business/content/workbench/styles.css')
  const contentWorkbenchUnitTrackPackageSource = readProjectFile('packages/ui/src/components/business/content/workbench/unit-track/index.tsx')
  const contentWorkbenchUnitTrackPackageCss = readProjectFile('packages/ui/src/components/business/content/workbench/unit-track/styles.css')
  const contentSemanticUiSource = readProjectFile('apps/frontend/src/features/content/presentation/contentSemanticUi.ts')
  const productionSemanticUiSource = readProjectFile('apps/frontend/src/features/production/presentation/productionSemanticUi.ts')
  const contentReviewSource = readProjectFile('packages/ui/src/components/business/content/workbench/review/index.tsx')
  const contentReviewPackageCss = readProjectFile('packages/ui/src/components/business/content/workbench/review/styles.css')
  const quickCreateCardsSource = readProjectFile('apps/frontend/src/features/content/components/ContentUnitQuickCreateCards.tsx')
  const deliveryPanelsSource = readProjectFile('apps/frontend/src/features/delivery/components/DeliveryWorkbenchPanels.tsx')
  const deliveryTimelineSource = readProjectFile('apps/frontend/src/features/delivery/components/DeliveryTimelineTrack.tsx')
  const scenePreviewSource = readProjectFile('apps/frontend/src/features/content/components/ContentWorkbenchScenePreview.tsx')
  const scenePreviewPackageSource = readProjectFile('packages/ui/src/components/business/workbench/scene-preview/index.tsx')
  const contentFilterSidebarSource = readProjectFile('packages/ui/src/components/business/content/workbench/index.tsx')
  const productionScriptBindingSource = readProjectFile('apps/frontend/src/features/production/components/ProductionScriptBinding.tsx')
  const productionStructureSource = readProjectFile('apps/frontend/src/features/production/components/ProductionOrchestrationStructure.tsx')
  const productionOrchestrationWorkspaceSource = readProjectFile('apps/frontend/src/features/production/components/ProductionOrchestrationWorkspace.tsx')
  const productionOrchestrationPackageSource = readProjectFile('packages/ui/src/components/business/production/orchestration/index.tsx')
  const productionOrchestrationPackageCss = readProjectFile('packages/ui/src/components/business/production/orchestration/styles.css')
  const productionSceneWritingSource = readProjectFile('apps/frontend/src/components/workbench/ProductionSceneWriting.tsx')
  const productionPackageSource = readProjectFile('packages/ui/src/components/business/production/index.tsx')
  const productionPackageCss = readProjectFile('packages/ui/src/components/business/production/styles.css')
  const productionDeliveryCenterPackageSource = readProjectFile('packages/ui/src/components/business/delivery/center/index.tsx')
  const productionDeliveryCenterPackageCss = readProjectFile('packages/ui/src/components/business/delivery/center/styles.css')
  const productionDeliveryTimelinePackageSource = readProjectFile('packages/ui/src/components/business/delivery/timeline/index.tsx')
  const productionDeliveryTimelinePackageCss = readProjectFile('packages/ui/src/components/business/delivery/timeline/styles.css')
  const productionScriptBindingPackageSource = readProjectFile('packages/ui/src/components/business/production/script-binding/index.tsx')
  const productionScriptBindingPackageCss = readProjectFile('packages/ui/src/components/business/production/script-binding/styles.css')
  const productionSceneWritingPackageSource = readProjectFile('packages/ui/src/components/business/production/scene-writing/index.tsx')
  const productionSceneWritingPackageCss = readProjectFile('packages/ui/src/components/business/production/scene-writing/styles.css')
  const workbenchChromeSource = readWorkbenchChromeSource()
  const uiStylesCss = readProjectFile('packages/ui/src/styles.css')

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(`${contentReviewSource}\n${workbenchCardSource}`, /toneTextClass|toneSurfaceClass/)
  assert.match(sources, /ReviewCallout|WorkbenchStatusBadge/)
  assert.match(sources, /WorkbenchKeyValue/)
  for (const exportName of [
    'ContentWorkbenchBody',
    'ContentWorkbenchCandidateUploadInput',
    'ContentWorkbenchCommandCenter',
    'ContentWorkbenchDrawerActionRow',
    'ContentWorkbenchDrawerOpenButton',
    'ContentWorkbenchEmptyActionButton',
    'ContentWorkbenchFilterSidebar',
    'ContentWorkbenchInfoSection',
    'ContentWorkbenchInfoText',
    'ContentWorkbenchMainColumn',
    'ContentWorkbenchProductionGrid',
    'ContentWorkbenchProductionMain',
    'ContentWorkbenchReviewButton',
    'ContentWorkbenchSceneInfoGrid',
    'ContentWorkbenchViewHeader',
  ]) {
    assert.match(contentWorkbenchPageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content workbench page`)
    assert.match(contentWorkbenchPackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'content-workbench-body',
    'content-workbench-filter-sidebar',
    'content-workbench-command-center',
    'content-workbench-main-column',
    'content-workbench-view-header',
    'content-workbench-review-button',
    'content-workbench-empty-action-button',
    'content-workbench-candidate-upload-input',
    'content-workbench-production-grid',
    'content-workbench-production-main',
    'content-workbench-scene-info-grid',
    'content-workbench-info-section',
  ]) {
    assert.match(contentWorkbenchPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchViewHeader[\s\S]*?title=\{contentWorkbenchViewTitle\}/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchReviewButton[\s\S]*?pendingCount=\{reviewQueueSummary\.pending\}/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchEmptyActionButton[\s\S]*?进入制作编排/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchCandidateUploadInput ref=\{candidateUploadInput\.inputRef\}/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchReviewPanel[\s\S]*?reviewModel=\{contentDraftReview\}/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchFilterSidebar[\s\S]*?productionOptions=\{productionFilterOptions\}/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchCommandCenter[\s\S]*?sidebar=\{\(/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchProductionGrid drawerOpen=\{unitDrawerOpen\}/)
  assert.match(contentWorkbenchPageSource, /<ContentWorkbenchInfoSection title=\{title\} suffix=\{suffix\}/)
  assert.doesNotMatch(contentWorkbenchPageSource, /<main className="min-h-0 flex-1 overflow-y-auto p-4/)
  assert.doesNotMatch(contentWorkbenchPageSource, /data-testid="content-workbench-command-center"[\s\S]{0,180}className=/)
  assert.doesNotMatch(contentWorkbenchPageSource, /data-testid="content-workbench-main-scroll"[\s\S]{0,180}className=/)
  assert.doesNotMatch(contentWorkbenchPageSource, /data-testid="content-workbench-production-grid"[\s\S]{0,180}className=/)
  assert.doesNotMatch(contentWorkbenchPageSource, /\b(?:toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(contentWorkbenchPageSource, /\b(?:StatusBadge|ReviewCallout|WorkbenchSurfaceItem)\b/)
  assert.doesNotMatch(contentWorkbenchPageSource, /\b(?:Button|Input)\b/)
  assert.doesNotMatch(contentWorkbenchPageSource, /className="hidden"/)
  assert.doesNotMatch(contentWorkbenchPageSource, /\bcn\(/)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/content/components/ContentWorkbenchFilterSidebar.tsx')), false)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/content/components/ContentGenerationReviewPanel.tsx')), false)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/workbench/components/WorkbenchPage.tsx')), false, 'legacy tabbed WorkbenchPage must not remain')
  assert.match(scenePreviewSource, /WorkbenchScenePreviewPanel/)
  assert.match(scenePreviewSource, /AuthedImage/)
  assert.doesNotMatch(scenePreviewSource, /WorkbenchPanel|WorkbenchThumbnail|<Badge|className="/)
  assert.match(scenePreviewPackageSource, /WorkbenchPanel/)
  assert.match(scenePreviewPackageSource, /WorkbenchThumbnail/)
  assert.match(scenePreviewPackageSource, /data-testid="content-workbench-scene-preview"/)
  assert.doesNotMatch(sources, /function MiniStat/)
  const resourceAssetCandidatePackageSource = readProjectFile('packages/ui/src/components/business/resource/asset-candidate/index.tsx')
  const resourceAssetCandidatePackageCss = readProjectFile('packages/ui/src/components/business/resource/asset-candidate/styles.css')
  assert.match(preProductionAssetDetailSource, /ResourceAssetCandidateCard/)
  assert.match(preProductionAssetDetailSource, /ResourceAssetCandidateStatus/)
  assert.match(resourceAssetCandidatePackageSource, /WorkbenchSurfaceItem/)
  assert.match(resourceAssetCandidatePackageSource, /StatusBadge/)
  assert.match(resourceAssetCandidatePackageCss, /\.resource-asset-candidate-card\s*\{/)
  assert.match(resourceAssetCandidatePackageCss, /\.resource-asset-candidate-card__actions\s*\{/)
  assert.match(preProductionAssetDetailSource, /<SlotThumb slot=\{row\.lockedSlot \?\? slot\} fit="contain" ratio="banner" frame="banner" \/>/)
  assert.doesNotMatch(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?WorkbenchSurfaceItem/)
  assert.doesNotMatch(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?WorkbenchStatusBadge/)
  assert.doesNotMatch(preProductionAssetDetailSource, /aspect-\[16\/7\] max-h-44 w-full rounded-md border border-border/)
  assert.doesNotMatch(preProductionAssetDetailSource, /workbench-list-item p-2/)
  assert.doesNotMatch(preProductionAssetDetailSource, /semanticToneClass/)
  assert.match(preProductionBoardSource, /ResourcePrepQueueSection/)
  assert.match(preProductionBoardSource, /ResourcePrepViewTabs/)
  assert.match(preProductionBoardSource, /ResourcePrepViewButton/)
  assert.match(preProductionBoardSource, /function ReferencePrepMedia[\s\S]*?<ResourcePrepThumbnail icon=\{Sparkles\}/)
  assert.match(preProductionBoardSource, /function DraftReferencePrepItem[\s\S]*?<ResourcePrepThumbnail icon=\{Sparkles\} frame="draft"/)
  assert.match(resourcePagePackageSource, /function ResourcePrepQueueSection[\s\S]*?<WorkbenchSection/)
  assert.match(resourcePagePackageSource, /function ResourcePrepViewTabs[\s\S]*?<AppControlGroup/)
  assert.match(resourcePagePackageSource, /function ResourcePrepThumbnail[\s\S]*?<WorkbenchThumbnail/)
  assert.doesNotMatch(preProductionBoardSource, /\b(?:WorkbenchSection|AppControlGroup|WorkbenchThumbnail)\b/)
  assert.match(preProductionBoardSource, /previews\.length === 1[\s\S]*?<SlotThumb slot=\{previews\[0\]\}/)
  assert.doesNotMatch(preProductionBoardSource, /rounded-\[3px\] border-0/)
  assert.match(preProductionBoardSource, /<ResourcePrepThumbnail>[\s\S]*?<ResourcePrepPreviewGrid>[\s\S]*?previews\.slice\(0, 4\)\.map/)
  assert.match(preProductionBoardSource, /function QueueSectionPanel[\s\S]*?ResourcePrepQueueSection/)
  assert.match(preProductionBoardSource, /function ReferenceClusterButton[\s\S]*?ResourcePrepSummaryCard/)
  assert.match(preProductionBoardSource, /function DraftReferenceClusterButton[\s\S]*?ResourcePrepSummaryCard/)
  assert.match(preProductionBoardSource, /\bResourcePrepSummaryPreviewStack\b/)
  assert.doesNotMatch(preProductionBoardSource, /className=|bodyClassName=/)
  assert.doesNotMatch(preProductionBoardSource, /<(?:div|section|aside|p|span|button|label|main|header|footer)\b/)
  for (const exportName of [
    'ProductionStructureWorkspaceLayout',
    'ProductionWorkspaceHeaderContextShell',
    'ProductionWorkspaceHeaderContextMeta',
    'ProductionStructureBadge',
    'ProductionStructureStatusBadge',
    'ProductionSegmentNavigatorShell',
    'ProductionSegmentNavigatorHeader',
    'ProductionStructureIconButton',
    'ProductionSegmentNavigatorEmptyState',
    'ProductionSegmentStack',
    'ProductionSegmentNavigatorSection',
    'ProductionSegmentNavigatorCard',
    'ProductionSegmentNavigatorCardHeader',
    'ProductionSegmentMomentStack',
    'ProductionSegmentEmptyMomentItem',
    'ProductionSegmentMomentItem',
    'ProductionSelectedSegmentSummaryShell',
    'ProductionSelectedSegmentSummaryBody',
    'ProductionSelectedSegmentCopy',
    'ProductionSelectedSegmentEditStack',
    'ProductionSelectedSegmentFieldGrid',
    'ProductionSelectedSegmentField',
    'ProductionSelectedSegmentInput',
    'ProductionSelectedSegmentSelectTrigger',
    'ProductionSelectedSegmentTextarea',
    'ProductionSelectedSegmentActions',
    'ProductionStructureActionButton',
    'ProductionSceneEditorHeaderShell',
    'ProductionSceneEditorHeaderCopy',
    'ProductionSceneEditorContextGrid',
    'ProductionSceneEditorContextLine',
  ]) {
    assert.match(productionStructureSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by production structure`)
    assert.match(productionOrchestrationPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(productionPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from production package`)
  }
  for (const className of [
    'production-structure-workspace-layout',
    'production-workspace-header-context',
    'production-structure-badge',
    'production-segment-navigator',
    'production-segment-section',
    'production-segment-card',
    'production-segment-moment-item',
    'production-selected-segment-summary',
    'production-selected-segment-field-grid',
    'production-selected-segment-input',
    'production-selected-segment-select-trigger',
    'production-selected-segment-textarea',
    'production-selected-segment-actions',
    'production-structure-action-button',
    'production-scene-editor-header',
    'production-scene-editor-context-grid',
    'production-scene-editor-context-line',
  ]) {
    assert.match(productionOrchestrationPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(productionStructureSource, /segment\.moments\.map\(\(moment\)[\s\S]*?<ProductionSegmentMomentItem[\s\S]*?active=\{moment\.active\}/)
  assert.match(productionOrchestrationPackageSource, /export function ProductionSegmentMomentItem[\s\S]*?<WorkbenchListItem[\s\S]*?active=\{active\}/)
  assert.doesNotMatch(productionStructureSource, /segment\.moments\.map\(\(moment\)[\s\S]*?<WorkbenchListItem/)
  assert.doesNotMatch(productionStructureSource, /className=|\bcn\(|\b(?:AppInlineMeta|AppMarkerDot|Badge|StatusBadge|Button|Input|SelectTrigger|Textarea|WorkbenchEmptyState|WorkbenchListItem)\b/)
  assert.match(productionOrchestrationWorkspaceSource, /<ProductionOrchestrationWorkspaceShell>/)
  assert.match(productionOrchestrationWorkspaceSource, /<ProductionSceneEditorSection>/)
  assert.match(productionOrchestrationPackageSource, /export function ProductionOrchestrationWorkspaceShell\b/)
  assert.match(productionOrchestrationPackageSource, /export function ProductionSceneEditorSection\b/)
  assert.match(productionPackageSource, /\bProductionOrchestrationWorkspaceShell\b/)
  assert.match(productionPackageSource, /\bProductionSceneEditorSection\b/)
  assert.match(productionOrchestrationPackageCss, cssClassSelectorPattern('production-orchestration-workspace-shell'))
  assert.match(productionOrchestrationPackageCss, cssClassSelectorPattern('production-scene-editor-section'))
  assert.doesNotMatch(productionOrchestrationWorkspaceSource, /className=|<div\b|<section\b/)
  assert.match(productionSemanticUiSource, /productionPresenceRecipe/)
  assert.match(productionSemanticUiSource, /productionEntityStatusRecipe/)
  assert.match(productionSemanticUiSource, /productionReferencePresenceRecipe/)
  assert.doesNotMatch(productionSemanticUiSource, /productionTimelineItemRecipe/)
  assert.match(productionScriptBindingSource, /productionPresenceRecipe/)
  assert.match(productionStructureSource, /productionPresenceRecipe/)
  assert.match(productionStructureSource, /productionEntityStatusRecipe/)
  assert.match(productionSceneWritingSource, /productionReferencePresenceRecipe/)
  assert.match(deliveryTimelineSource, /deliveryTimelineItemRecipe/)
  assert.match(deliveryTimelineSource, /deliveryTimelineItemRecipe\(item\.state\)/)
  assert.doesNotMatch(deliveryTimelineSource, /\bitem\.tone\b/)
  assert.match(productionOrchestrationPackageSource, /\bAppMarkerDot\b/)
  assert.doesNotMatch(productionStructureSource, /\bAppMarkerDot\b/)
  assert.doesNotMatch(productionStructureSource, /absolute -left-\[5px\] top-2 h-2\.5 w-2\.5 rounded-full border bg-background/)
  assert.doesNotMatch(productionStructureSource, /<button\b/)
  assert.match(productionScriptBindingSource, /scriptLines\.map\(\(line\)[\s\S]*?<ProductionScriptLineItem[\s\S]*?active=\{selected\}/)
  assert.match(productionScriptBindingPackageSource, /export function ProductionScriptLineItem[\s\S]*?<WorkbenchListItem[\s\S]*?active=\{active\}/)
  assert.doesNotMatch(productionScriptBindingSource, /scriptLines\.map\(\(line\)[\s\S]*?<WorkbenchListItem/)
  assert.doesNotMatch(productionScriptBindingSource, /<button\b/)
  assert.match(preProductionBoardSource, /function ClusterPreviewStrip[\s\S]*?<ResourcePrepSummaryPreviewStrip[\s\S]*?state=\{state\}/)
  assert.match(preProductionBoardSource, /\bResourcePrepSummaryStatusGrid\b/)
  assert.match(resourcePagePackageSource, /function ResourcePrepSummaryPreviewStrip[\s\S]*?WorkbenchSummaryPreviewStrip/)
  assert.match(resourcePagePackageSource, /function ResourcePrepSummaryStatusGrid[\s\S]*?WorkbenchSummaryStatusGrid/)
  assert.doesNotMatch(preProductionBoardSource, /\b(?:toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(preProductionBoardSource, /workbench-summary-card__preview-(?:stack|row|label|list|thumb)/)
  assert.doesNotMatch(preProductionBoardSource, /workbench-summary-card__status-grid/)
  assert.match(workbenchCardSource, /export function WorkbenchSummaryPreviewStrip/)
  assert.match(workbenchCardSource, /export function WorkbenchSummaryStatusGrid/)
  assert.match(workbenchCardSource, /workbenchSummaryPreviewTone[\s\S]*?state === "locked" \? "success" : "info"/)
  assert.match(workbenchCardSource, /\btoneTextClass\(tone\)/)
  assert.match(workbenchCardSource, /\btoneSurfaceClass\(tone\)/)
  assert.doesNotMatch(preProductionBoardSource, /mt-2 grid grid-cols-3 gap-1/)
  assert.doesNotMatch(preProductionBoardSource, /flex items-center gap-1\.5/)
  assert.doesNotMatch(preProductionBoardSource, /rounded-md bg-muted\/50 p-1/)
  assert.doesNotMatch(preProductionBoardSource, /className="[^"]*workbench-entity-card/)
  assert.doesNotMatch(preProductionBoardSource, /className="[^"]*workbench-entity-card__/)
  assert.match(preProductionBoardSource, /function CountPill[\s\S]*?ResourcePrepStatusBadge/)
  assert.doesNotMatch(preProductionBoardSource, /flex min-h-\[180px\] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background/)
  assert.doesNotMatch(preProductionBoardSource, /rounded-lg border border-dashed border-border bg-muted\/20/)
  assert.doesNotMatch(preProductionBoardSource, /flex h-16 w-20 items-center justify-center rounded-md border border-border bg-muted\/30/)
  assert.doesNotMatch(preProductionBoardSource, /flex h-16 w-20 items-center justify-center rounded-md border border-primary\/30 bg-primary\/10 text-primary/)
  assert.doesNotMatch(preProductionBoardSource, /relative h-16 w-20 overflow-hidden rounded-md border border-border bg-muted\/30 p-1/)
  assert.match(contentFilterSidebarSource, /function ContentWorkbenchCategoryFilterGroup[\s\S]*?<WorkbenchSurfaceItem[\s\S]*?data-testid=\{testId\}/)
  assert.match(contentFilterSidebarSource, /options\.map\(\(option\)[\s\S]*?<ContentWorkbenchCategoryFilterButton/)
  assert.match(contentFilterSidebarSource, /function ContentWorkbenchCategoryFilterButton[\s\S]*?<Button[\s\S]*?variant=\{active \? "soft" : "ghost"\}/)
  assert.doesNotMatch(contentFilterSidebarSource, /<button\b/)
  assert.doesNotMatch(contentFilterSidebarSource, /rounded-md border border-border\/80 bg-muted\/20/)
  assert.doesNotMatch(contentFilterSidebarSource, /inline-flex h-7 max-w-full items-center gap-1\.5 rounded-md border/)
  assert.match(contentFilterSidebarSource, /option\.identifier[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(contentFilterSidebarSource, /rounded bg-muted px-1 py-0\.5/)
  assert.match(productionOrchestrationPackageSource, /ProductionSegmentMomentItem[\s\S]*?<AppInlineMeta[\s\S]*?\{identifier\}/)
  assert.doesNotMatch(productionStructureSource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(productionStructureSource, /rounded bg-muted px-1\.5 py-0\.5/)
  for (const exportName of [
    'ContentWorkbenchEditorActionGroup',
    'ContentWorkbenchEditorField',
    'ContentWorkbenchEditorFieldGrid',
    'ContentWorkbenchEditorGenerationActions',
    'ContentWorkbenchEditorGenerationBar',
    'ContentWorkbenchEditorHeader',
    'ContentWorkbenchEditorPanel',
    'ContentWorkbenchEditorRoot',
    'ContentWorkbenchEditorSelectField',
  ]) {
    assert.match(keyframeEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by keyframe editor`)
    assert.match(contentWorkbenchEditorPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of [
    'ContentWorkbenchKeyframeActionButton',
    'ContentWorkbenchKeyframeDetail',
    'ContentWorkbenchKeyframeEmptyState',
    'ContentWorkbenchKeyframeInput',
    'ContentWorkbenchKeyframeList',
    'ContentWorkbenchKeyframeListItem',
    'ContentWorkbenchKeyframeListSection',
    'ContentWorkbenchKeyframeModelSelect',
    'ContentWorkbenchKeyframeStatusBadge',
    'ContentWorkbenchKeyframeTextarea',
    'ContentWorkbenchKeyframeThumbnail',
  ]) {
    assert.match(keyframeEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by keyframe editor`)
    assert.match(contentWorkbenchEditorPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(contentWorkbenchEditorPackageSource, /function ContentWorkbenchKeyframeInput[\s\S]*?<Input/)
  assert.match(contentWorkbenchEditorPackageSource, /function ContentWorkbenchKeyframeModelSelect[\s\S]*?<NativeSelect/)
  assert.match(contentWorkbenchEditorPackageSource, /function ContentWorkbenchKeyframeStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(contentWorkbenchEditorPackageSource, /function ContentWorkbenchKeyframeEmptyState[\s\S]*?<AppTextEmptyState/)
  for (const exportName of [
    'ContentWorkbenchEditorField',
    'ContentWorkbenchEditorFieldGrid',
    'ContentWorkbenchEditorSelectField',
    'ContentWorkbenchUnitEditActionButton',
    'ContentWorkbenchUnitEditActionRow',
    'ContentWorkbenchUnitEditBlockerRow',
    'ContentWorkbenchUnitEditEmptyState',
    'ContentWorkbenchUnitEditGrid',
    'ContentWorkbenchUnitEditRoot',
    'ContentWorkbenchUnitEditSection',
    'ContentWorkbenchUnitEditTextarea',
    'ContentWorkbenchUnitSummaryHeader',
  ]) {
    assert.match(contentUnitEditCardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content unit edit cards`)
    assert.match(contentWorkbenchEditorPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(contentWorkbenchEditorPackageSource, /function ContentWorkbenchUnitEditEmptyState[\s\S]*?<AppEmptyState/)
  for (const className of [
    'content-workbench-editor',
    'content-workbench-editor-panel',
    'content-workbench-editor-header',
    'content-workbench-editor-field-grid',
    'content-workbench-editor-field',
    'content-workbench-editor-select-trigger',
    'content-workbench-editor-generation',
    'content-workbench-keyframe-list-section',
    'content-workbench-keyframe-list',
    'content-workbench-keyframe-list-item',
    'content-workbench-keyframe-thumbnail',
    'content-workbench-keyframe-detail',
    'content-workbench-keyframe-action-button',
    'content-workbench-keyframe-textarea',
    'content-workbench-unit-edit',
    'content-workbench-unit-edit-grid',
    'content-workbench-unit-edit-section',
    'content-workbench-unit-summary',
    'content-workbench-unit-edit-action-button',
    'content-workbench-unit-edit-textarea',
    'content-workbench-unit-edit-blockers',
  ]) {
    assert.match(contentWorkbenchEditorPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(contentWorkbenchEditorPackageSource, /\bAppSurfaceItem\b/)
  assert.match(contentWorkbenchEditorPackageSource, /\bLabel\b/)
  assert.match(keyframeEditorSource, /<ContentWorkbenchKeyframeThumbnail[\s\S]*?outputResourceId > 0/)
  assert.doesNotMatch(keyframeEditorSource, /\b(?:AppTextEmptyState|Input|NativeSelect|StatusBadge|WorkbenchList|WorkbenchListItem|WorkbenchSection|WorkbenchThumbnail|Textarea)\b/)
  assert.match(contentSemanticUiSource, /contentReadinessRecipe/)
  assert.match(contentSemanticUiSource, /contentOptionalReadinessRecipe/)
  assert.match(contentSemanticUiSource, /contentGapRecipe/)
  assert.match(contentSemanticUiSource, /contentInputStateRecipe/)
  assert.match(contentSemanticUiSource, /contentWorkbenchStatusRecipe/)
  assert.match(contentSemanticUiSource, /contentReviewQueueRecipe/)
  assert.match(contentSemanticUiSource, /contentKeyframeGenerationRecipe/)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/content/components/ContentUnitEditControls.tsx')), false)
  assert.match(contentUnitPlanningEditorsSource, /contentReadinessRecipe/)
  assert.match(contentUnitPlanningEditorsSource, /contentOptionalReadinessRecipe/)
  for (const exportName of [
    'ContentWorkbenchPlanningActionButton',
    'ContentWorkbenchPlanningEditor',
    'ContentWorkbenchPlanningFieldGrid',
    'ContentWorkbenchPlanningHeader',
    'ContentWorkbenchPlanningTextareaField',
  ]) {
    assert.match(contentUnitPlanningEditorsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content unit planning editors`)
    assert.match(contentWorkbenchEditorPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'content-workbench-planning-editor',
    'content-workbench-planning-header',
    'content-workbench-planning-action-button',
    'content-workbench-planning-field-grid',
    'content-workbench-planning-textarea',
  ]) {
    assert.match(contentWorkbenchEditorPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(contentUnitGenerationInputsSource, /contentReadinessRecipe/)
  assert.match(contentUnitGenerationInputsSource, /contentOptionalReadinessRecipe/)
  assert.match(contentUnitGenerationInputsSource, /contentGapRecipe/)
  for (const exportName of [
    'ContentWorkbenchGenerationInputSection',
    'ContentWorkbenchGenerationReadiness',
    'ContentWorkbenchInputActionButton',
    'ContentWorkbenchInputActionGroup',
    'ContentWorkbenchInputCard',
    'ContentWorkbenchInputCardGrid',
    'ContentWorkbenchInputDrawer',
    'ContentWorkbenchInputDrawerHeader',
    'ContentWorkbenchInputDrawerPanel',
    'ContentWorkbenchInputDrawerTab',
    'ContentWorkbenchInputDrawerTabList',
  ]) {
    assert.match(contentUnitGenerationInputsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content unit generation inputs`)
    assert.match(contentWorkbenchEditorPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'content-workbench-generation-input-section',
    'content-workbench-input-card-grid',
    'content-workbench-input-card',
    'content-workbench-input-action-button',
    'content-workbench-input-drawer',
    'content-workbench-input-drawer-header',
    'content-workbench-input-drawer-tabs',
    'content-workbench-input-drawer-panel',
    'content-workbench-generation-readiness',
  ]) {
    assert.match(contentWorkbenchEditorPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(contentUnitEditCardsSource, /contentWorkbenchStatusRecipe/)
  assert.match(contentUnitEditCardsSource, /contentGapRecipe/)
  assert.match(contentSemanticUiSource, /contentReviewQueueRecipe/)
  assert.match(contentReviewSource, /contentWorkbenchReviewQueueIntent/)
  assert.match(contentWorkbenchNextActionsSource, /export type ContentWorkbenchNextActionState = 'required' \| 'optional' \| 'available'/)
  assert.match(contentWorkbenchNextActionsSource, /ContentWorkbenchNextActionView[\s\S]*?state: ContentWorkbenchNextActionState/)
  assert.doesNotMatch(contentWorkbenchNextActionsSource, /\btone:\s*['"](?:default|warning|success)['"]/)
  assert.doesNotMatch(contentWorkbenchNextActionsSource, /\btone:\s*'default' \| 'warning' \| 'success'/)
  assert.match(contentWorkbenchReadinessSource, /export type ContentWorkbenchReadinessState = 'uninitialized' \| 'blocked' \| 'almost_ready' \| 'ready'/)
  assert.match(contentWorkbenchReadinessSource, /ContentWorkbenchReadinessSummary[\s\S]*?state: ContentWorkbenchReadinessState/)
  assert.doesNotMatch(contentWorkbenchReadinessSource, /\bContentWorkbenchReadinessTone\b/)
  assert.doesNotMatch(contentWorkbenchReadinessSource, /\btone:\s*['"](?:blocked|warning|ready)['"]/)
  assert.match(contentWorkbenchUnitHealthSource, /export type ContentWorkbenchUnitHealthState = 'empty' \| 'blocked' \| 'pending' \| 'ready' \| 'done'/)
  assert.match(contentWorkbenchUnitHealthSource, /export type ContentWorkbenchUnitHealthCheckState = 'blocked' \| 'pending' \| 'ready' \| 'done'/)
  assert.match(contentWorkbenchUnitHealthSource, /ContentWorkbenchUnitHealthCheck[\s\S]*?state: ContentWorkbenchUnitHealthCheckState/)
  assert.match(contentWorkbenchUnitHealthSource, /ContentWorkbenchUnitHealth[\s\S]*?state: ContentWorkbenchUnitHealthState/)
  assert.doesNotMatch(contentWorkbenchUnitHealthSource, /\bContentWorkbenchUnitHealthTone\b/)
  assert.doesNotMatch(contentWorkbenchUnitHealthSource, /\bContentWorkbenchUnitHealthCheckTone\b/)
  assert.doesNotMatch(contentWorkbenchUnitHealthSource, /\btone:\s*['"](?:empty|blocked|warning|ready|done)['"]/)
  assert.match(contentWorkbenchDeliveryBriefSource, /export type ContentWorkbenchDeliveryBriefState = 'empty' \| 'blocked' \| 'checking' \| 'ready' \| 'closed'/)
  assert.match(contentWorkbenchDeliveryBriefSource, /ContentWorkbenchDeliveryBrief[\s\S]*?state: ContentWorkbenchDeliveryBriefState/)
  assert.doesNotMatch(contentWorkbenchDeliveryBriefSource, /\bContentWorkbenchDeliveryBriefTone\b/)
  assert.doesNotMatch(contentWorkbenchDeliveryBriefSource, /\btone:\s*['"](?:empty|blocked|warning|ready|closed)['"]/)
  assert.match(contentWorkbenchActivitySource, /export type ContentWorkbenchActivityState = 'done' \| 'running' \| 'blocked' \| 'pending'/)
  assert.match(contentWorkbenchActivitySource, /ContentWorkbenchActivityItem[\s\S]*?state: ContentWorkbenchActivityState/)
  assert.doesNotMatch(contentWorkbenchActivitySource, /\bContentWorkbenchActivityTone\b/)
  assert.doesNotMatch(contentWorkbenchActivitySource, /\btone:\s*['"](?:done|running|blocked|pending)['"]/)
  assert.match(contentWorkbenchPipelineSource, /export type ContentWorkbenchPipelineState = 'done' \| 'current' \| 'blocked' \| 'pending'/)
  assert.match(contentWorkbenchPipelineSource, /ContentWorkbenchPipelineStep[\s\S]*?state: ContentWorkbenchPipelineState/)
  assert.doesNotMatch(contentWorkbenchPipelineSource, /\bContentWorkbenchPipelineTone\b/)
  assert.doesNotMatch(contentWorkbenchPipelineSource, /\btone:\s*['"](?:done|current|blocked|pending)['"]/)
  assert.match(contentWorkbenchUnitTrackDomainSource, /export type ContentWorkbenchUnitTrackState = 'blocked' \| 'review' \| 'ready' \| 'running'/)
  assert.match(contentWorkbenchUnitTrackDomainSource, /ContentWorkbenchUnitTrackItem[\s\S]*?state: ContentWorkbenchUnitTrackState/)
  assert.doesNotMatch(contentWorkbenchUnitTrackDomainSource, /\bContentWorkbenchUnitTrackTone\b/)
  assert.doesNotMatch(contentWorkbenchUnitTrackDomainSource, /\btone:\s*['"](?:blocked|review|ready|running)['"]/)
  assert.doesNotMatch(contentUnitTrackSource, /\bitem\.tone\b/)
  assert.doesNotMatch(contentUnitTrackSource, /\b(?:drawerAction|itemAction)\.tone\b/)
  assert.doesNotMatch(contentUnitTrackSource, /\btone:\s*['"](?:idle|blocked|ready)['"] as const/)
  assert.match(frontendWorkbenchTypesSource, /state\?: 'required' \| 'pending' \| 'passed'/)
  assert.match(packageWorkbenchTypesSource, /state\?: "required" \| "pending" \| "passed"/)
  assert.match(packageWorkbenchGateSource, /gateActionIntent\(row\.done, row\.state\)/)
  assert.doesNotMatch(packageWorkbenchGateSource, /\brow\.tone\b/)
  assert.doesNotMatch(`${frontendWorkbenchTypesSource}\n${packageWorkbenchTypesSource}`, /tone\?: ['"]warning['"] \| ['"]success['"]/)
  assert.match(contentWorkbenchModelSource, /\bworkbenchGateState\(/)
  assert.doesNotMatch(contentWorkbenchModelSource, /\btone:\s*['"](?:success|warning)['"]/)
  assert.doesNotMatch(contentWorkbenchPageSource, /\btone:\s*pendingDraftCount === 0 \? 'success' : 'warning'/)
  assert.match(contentReviewSource, /export type ContentWorkbenchReviewQueueState = "empty" \| "needs_review" \| "pending_review" \| "processed"/)
  assert.match(contentReviewSource, /ContentWorkbenchReviewQueueSummary[\s\S]*?state: ContentWorkbenchReviewQueueState/)
  assert.match(contentReviewSource, /<StatusBadge[\s\S]*?intent=\{contentWorkbenchReviewQueueIntent\(queueSummary\.state\)\}/)
  assert.match(contentReviewSource, /data-state=\{queueSummary\.state\}/)
  assert.doesNotMatch(contentReviewSource, /\bContentWorkbenchReviewQueueTone\b/)
  assert.doesNotMatch(contentReviewSource, /\bqueueSummary\.tone\b/)
  assert.doesNotMatch(contentReviewSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(keyframeEditorSource, /contentKeyframeGenerationRecipe/)
  assert.match(contentUnitTrackSource, /contentWorkbenchStatusRecipe/)
  assert.doesNotMatch(`${contentUnitPlanningEditorsSource}\n${contentUnitGenerationInputsSource}\n${contentUnitEditCardsSource}\n${contentReviewSource}\n${keyframeEditorSource}\n${contentUnitTrackSource}`, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /\bcn\(/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /\b(?:WorkbenchSection|Button)\b/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /className=/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /\bWorkbenchSurfaceItem\b/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /grid gap-2" data-testid="content-workbench-generation-input-cards"/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /flex flex-wrap items-center justify-between gap-3/)
  assert.doesNotMatch(contentUnitGenerationInputsSource, /grid gap-3 lg:grid-cols-\[minmax\(0,1fr\)_auto\]/)
  assert.doesNotMatch(contentUnitPlanningEditorsSource, /<Label\b/)
  assert.doesNotMatch(contentUnitPlanningEditorsSource, /<Textarea\b/)
  assert.doesNotMatch(contentUnitPlanningEditorsSource, /\bButton\b/)
  assert.doesNotMatch(contentUnitPlanningEditorsSource, /className=/)
  assert.doesNotMatch(contentUnitPlanningEditorsSource, /space-y-3|space-y-1\.5|grid gap-2 sm:grid-cols-2/)
  assert.doesNotMatch(readProjectFile('apps/frontend/src/features/content/domain/contentWorkbenchStatus.ts'), /\b(?:statusTone|decisionTone)\b/)
  assert.match(keyframeEditorSource, /data-testid="content-workbench-keyframe-delete"[\s\S]*?<Trash2/, 'keyframe delete action must remain a package button action')
  assert.match(keyframeEditorSource, /tone="danger"[\s\S]{0,360}data-testid="content-workbench-keyframe-delete"/, 'keyframe delete action must use package danger button tone')
  assert.match(contentUnitEditCardsSource, /tone="danger"[\s\S]{0,360}data-testid="content-workbench-unit-edit-delete"/, 'content unit delete action must use package danger button tone')
  assert.doesNotMatch(keyframeEditorSource, /flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-muted/)
  assert.doesNotMatch(keyframeEditorSource, /lg:grid-cols-\[minmax\(240px,\.[\s\S]{0,20}1\.2fr\)\]/)
  assert.doesNotMatch(keyframeEditorSource, /flex flex-wrap items-start justify-between gap-2/)
  assert.doesNotMatch(keyframeEditorSource, /grid gap-2 sm:grid-cols-\[140px_minmax\(0,1fr\)_96px\]/)
  assert.doesNotMatch(keyframeEditorSource, /className=/)
  assert.doesNotMatch(keyframeEditorSource, /min-h-\[96px\]/)
  assert.doesNotMatch(keyframeEditorSource, /<Label\b/)
  assert.doesNotMatch(contentUnitEditCardsSource, /\bcn\(/)
  assert.doesNotMatch(contentUnitEditCardsSource, /<Label\b/)
  assert.doesNotMatch(contentUnitEditCardsSource, /\b(?:AppEmptyState|Button|Textarea)\b/)
  assert.doesNotMatch(contentUnitEditCardsSource, /className=/)
  assert.doesNotMatch(contentUnitEditCardsSource, /min-h-\[140px\]/)
  assert.doesNotMatch(contentUnitEditCardsSource, /min-h-\[180px\]/)
  assert.doesNotMatch(contentUnitEditCardsSource, /min-h-\[180px\] py-3/)
  assert.doesNotMatch(contentUnitEditCardsSource, /xl:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(300px,\.95fr\)\]/)
  assert.doesNotMatch(contentUnitEditCardsSource, /border-t border-border pt-3/)
  assert.doesNotMatch(contentUnitEditCardsSource, /flex flex-wrap items-start justify-between gap-2/)
  assert.doesNotMatch(contentUnitEditCardsSource, /grid gap-2 sm:grid-cols-\[minmax\(0,1fr\)_112px\]/)
  assert.doesNotMatch(keyframeEditorSource, /text-destructive/)
  assert.doesNotMatch(contentUnitEditCardsSource, /text-destructive/)
  assert.match(uiStylesCss, /@import "\.\/components\/business\/production\/styles\.css";/)
  assert.match(productionPackageSource, /from "\.\/scene-writing"/)
  assert.match(productionPackageSource, /from "\.\/script-binding"/)
  assert.match(productionPackageCss, /@import "\.\/scene-writing\/styles\.css";/)
  assert.match(productionPackageCss, /@import "\.\/script-binding\/styles\.css";/)
  for (const exportName of [
    'ProductionScriptBindingAction',
    'ProductionScriptBindingPanel',
    'ProductionScriptBindingHeader',
    'ProductionScriptBindingInline',
    'ProductionScriptBindingInlineAction',
    'ProductionScriptBindingIconAction',
    'ProductionScriptBindingInlineMeta',
    'ProductionScriptBindingPresenceBadge',
    'ProductionScriptBindingSelectTrigger',
    'ProductionScriptBindingSpinner',
    'ProductionScriptBlockSummary',
    'ProductionScriptBlockBoundBadge',
    'ProductionScriptPickerContent',
    'ProductionScriptPickerLayout',
    'ProductionScriptBlockList',
    'ProductionScriptBlockListItem',
    'ProductionScriptCreateEmptyState',
    'ProductionScriptCreatePanel',
    'ProductionScriptLineList',
    'ProductionScriptLineItem',
    'ProductionScriptSelectionSummary',
    'ProductionScriptPickerPreviewHeader',
    'ProductionScriptPreviewStack',
    'ProductionScriptPreviewCard',
    'ProductionScriptPreviewRoleBadge',
    'ProductionScriptPreviewMetaText',
  ]) {
    assert.match(productionScriptBindingSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by production script binding`)
    assert.match(productionScriptBindingPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'production-script-binding-panel',
    'production-script-binding-header',
    'production-script-binding-inline',
    'production-script-binding-select-trigger',
    'production-script-binding-action',
    'production-script-binding-inline-action',
    'production-script-binding-icon-action',
    'production-script-binding-presence-badge',
    'production-script-binding-inline-meta',
    'production-script-binding-spinner',
    'production-script-block-summary',
    'production-script-block-bound-badge',
    'production-script-picker-content',
    'production-script-picker-layout',
    'production-script-block-list',
    'production-script-block-list-item',
    'production-script-create-empty-state',
    'production-script-create-panel',
    'production-script-line-list',
    'production-script-line-item',
    'production-script-selection-summary',
    'production-script-picker-preview-header',
    'production-script-preview-stack',
    'production-script-preview-card',
    'production-script-preview-role-badge',
    'production-script-preview-meta-text',
  ]) {
    assert.match(productionScriptBindingPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.doesNotMatch(productionScriptBindingSource, /\bcn\(/)
  assert.doesNotMatch(productionScriptBindingSource, /className=/)
  assert.doesNotMatch(productionScriptBindingSource, /\b(?:Badge|StatusBadge|Button|SelectTrigger)\b/)
  assert.doesNotMatch(productionScriptBindingSource, /\b(?:WorkbenchList|WorkbenchListItem|WorkbenchSurfaceItem)\b/)
  assert.doesNotMatch(productionScriptBindingSource, /flex max-h-\[88vh\] w-\[min\(960px,calc\(100vw-32px\)\)\] flex-col overflow-hidden p-0/)
  assert.doesNotMatch(productionScriptBindingSource, /grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-\[300px_minmax\(0,1fr\)\]/)
  assert.doesNotMatch(productionScriptBindingSource, /grid w-full grid-cols-\[44px_minmax\(0,1fr\)\]/)
  for (const exportName of [
    'ProductionExpressionAuxFieldGrid',
    'ProductionExpressionBadge',
    'ProductionExpressionDeleteButton',
    'ProductionExpressionEditorActions',
    'ProductionExpressionEditorColumn',
    'ProductionExpressionEmptyState',
    'ProductionExpressionField',
    'ProductionExpressionLineStack',
    'ProductionSceneMomentEmptyState',
    'ProductionSceneReferenceBindingRow',
    'ProductionSceneReferenceEmptyState',
    'ProductionSceneWritingSection',
    'ProductionSceneWritingHeader',
    'ProductionSceneWritingResponsiveDescription',
    'ProductionSceneWritingBadge',
    'ProductionSceneWritingBadgeStack',
    'ProductionSceneWritingStatusBadge',
    'ProductionSceneWritingSpinner',
    'ProductionSceneReferenceGroupGrid',
    'ProductionSceneReferenceGroup',
    'ProductionSceneReferenceItem',
    'ProductionSceneReferenceRemoveButton',
    'ProductionSceneWritingActionButton',
    'ProductionSceneWritingFieldGrid',
    'ProductionSceneWritingField',
    'ProductionSceneWritingTextarea',
    'ProductionSceneWritingSelectTrigger',
    'ProductionSceneWritingActionRow',
    'ProductionExpressionLineShell',
    'ProductionExpressionEditorGrid',
  ]) {
    assert.match(productionSceneWritingSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by production scene writing`)
    assert.match(productionSceneWritingPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'production-expression-aux-field-grid',
    'production-expression-badge',
    'production-expression-delete-button',
    'production-expression-editor-actions',
    'production-expression-editor-column',
    'production-expression-field',
    'production-expression-line-stack',
    'production-scene-moment-empty-state',
    'production-scene-reference-binding-row',
    'production-scene-reference-empty-state',
    'production-scene-writing-section',
    'production-scene-writing-header',
    'production-scene-writing-responsive-description',
    'production-scene-writing-badge',
    'production-scene-writing-spinner',
    'production-scene-reference-grid',
    'production-scene-reference-group',
    'production-scene-reference-item',
    'production-scene-reference-remove-button',
    'production-scene-writing-action-button',
    'production-scene-writing-field-grid',
    'production-scene-writing-field',
    'production-scene-writing-textarea',
    'production-scene-writing-select-trigger',
    'production-scene-writing-action-row',
    'production-expression-line',
    'production-expression-editor-grid',
  ]) {
    assert.match(productionSceneWritingPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(productionSceneWritingPackageSource, /\bAppIconFrame\b/)
  assert.doesNotMatch(productionSceneWritingSource, /\bAppIconFrame\b/)
  assert.doesNotMatch(productionSceneWritingSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(productionSceneWritingSource, /className=/)
  assert.doesNotMatch(productionSceneWritingSource, /\b(?:Badge|StatusBadge|Button|SelectTrigger|Textarea|WorkbenchEmptyState)\b/)
  assert.doesNotMatch(`${productionScriptBindingSource}\n${productionStructureSource}\n${productionSceneWritingSource}\n${deliveryTimelineSource}`, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(productionSceneWritingSource, /flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/)
  assert.doesNotMatch(productionSceneWritingSource, /group\/reference flex items-center gap-1 rounded bg-muted\/40/)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/setting-preparation')), false, 'unused setting-preparation feature must not remain as a separate abstraction')
  assert.equal(existsSync(path.join(root, 'packages/ui/src/components/business/workbench/preparation')), false, 'unused preparation package UI must not remain as a separate abstraction')
  for (const exportName of [
    'ContentWorkbenchReviewPanel',
    'ContentWorkbenchReviewQueueSummary',
    'ContentWorkbenchReviewModel',
  ]) {
    assert.match(contentWorkbenchPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from content workbench package`)
  }
  for (const exportName of ['AppInlineMeta', 'AppSurfaceItem', 'AppTextEmptyState', 'ReviewProposalShell', 'WorkbenchList', 'WorkbenchListItem']) {
    assert.match(contentReviewSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content workbench review package`)
  }
  for (const className of [
    'content-workbench-review-panel__layout',
    'content-workbench-review-queue',
    'content-workbench-review-metrics',
    'content-workbench-review-draft-list-item',
    'content-workbench-review-detail',
    'content-workbench-review-diff-card',
    'content-workbench-review-snapshot-value',
    'content-workbench-review-field-diff-row',
  ]) {
    assert.match(contentReviewPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(contentReviewSource, /change\.fields\.map[\s\S]*?<ContentWorkbenchReviewFieldDiffRow/)
  assert.match(contentReviewSource, /function ContentWorkbenchReviewFieldDiffRow[\s\S]*?<AppInlineMeta/)
  assert.match(contentReviewSource, /function ContentWorkbenchReviewSnapshotValue[\s\S]*?data-tone=\{tone\}/)
  assert.doesNotMatch(contentReviewSource, /rounded-md border border-dashed border-border bg-background px-3 py-6/)
  assert.doesNotMatch(contentReviewSource, /min-w-0 rounded-md border border-border bg-background p-2\.5/)
  assert.doesNotMatch(contentReviewSource, /flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2/)
  assert.doesNotMatch(contentReviewSource, /rounded bg-muted px-2 py-1 text-muted-foreground/)
  assert.doesNotMatch(contentReviewSource, /rounded bg-primary\/10 px-2 py-1 text-foreground/)
  assert.doesNotMatch(contentReviewSource, /\b(?:toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(contentReviewSource, /\bcn\(/)
  for (const exportName of ['AppInlineMeta', 'WorkbenchSurfaceItem']) {
    assert.match(contentWorkbenchUnitTrackPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content unit track package`)
    assert.match(productionDeliveryTimelinePackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by production delivery timeline package`)
  }
  for (const exportName of ['Button', 'WorkbenchListItem', 'WorkbenchSection']) {
    assert.match(productionDeliveryTimelinePackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by production delivery timeline package`)
  }
  assert.doesNotMatch(deliveryTimelineSource, /\b(?:AppInlineMeta|Badge|Button|StatusBadge|WorkbenchListItem|WorkbenchSection|WorkbenchSurfaceItem|toneSurfaceClass|toneTextClass|cn)\b/)
  for (const exportName of [
    'ProductionDeliveryTimelineBadge',
    'ProductionDeliveryTimelineBlock',
    'ProductionDeliveryTimelineCanvas',
    'ProductionDeliveryTimelineCard',
    'ProductionDeliveryTimelineCardRail',
    'ProductionDeliveryTimelineFrame',
    'ProductionDeliveryTimelineLane',
    'ProductionDeliveryTimelineLaneStack',
    'ProductionDeliveryTimelineMeta',
    'ProductionDeliveryTimelinePlayhead',
    'ProductionDeliveryTimelineResizeHandle',
    'ProductionDeliveryTimelineRow',
    'ProductionDeliveryTimelineRuler',
    'ProductionDeliveryTimelineSchedule',
    'ProductionDeliveryTimelineScheduleMetaText',
    'ProductionDeliveryTimelineScheduleRow',
    'ProductionDeliveryTimelineSection',
    'ProductionDeliveryTimelineStatusBadge',
    'ProductionDeliveryTimelineTick',
    'ProductionDeliveryTimelineToolbar',
    'ProductionDeliveryTimelineTrack',
    'ProductionDeliveryTimelineViewport',
    'ProductionDeliveryTimelineZoomControl',
  ]) {
    assert.match(deliveryTimelineSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by delivery timeline`)
    assert.match(productionPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from production package`)
  }
  for (const className of [
    'production-delivery-timeline-track',
    'production-delivery-timeline-card',
    'production-delivery-timeline-frame',
    'production-delivery-timeline-toolbar',
    'production-delivery-timeline-zoom',
    'production-delivery-timeline-viewport',
    'production-delivery-timeline-canvas',
    'production-delivery-timeline-row',
    'production-delivery-timeline-ruler',
    'production-delivery-timeline-lane-row',
    'production-delivery-timeline-block',
    'production-delivery-timeline-schedule-row',
  ]) {
    assert.match(productionDeliveryTimelinePackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  for (const exportName of [
    'ContentWorkbenchShotList',
    'ContentWorkbenchShotListActionBar',
    'ContentWorkbenchShotListCard',
    'ContentWorkbenchShotListFieldButton',
    'ContentWorkbenchShotListFieldGrid',
    'ContentWorkbenchShotListGrid',
    'ContentWorkbenchShotListHeader',
    'ContentWorkbenchUnitControlBar',
    'ContentWorkbenchUnitExecutionActionRow',
    'ContentWorkbenchUnitExecutionCard',
    'ContentWorkbenchUnitExecutionDetail',
    'ContentWorkbenchUnitExecutionDetailGrid',
    'ContentWorkbenchUnitExecutionGrid',
    'ContentWorkbenchUnitExecutionRegion',
    'ContentWorkbenchUnitExecutionStatus',
    'ContentWorkbenchUnitKindFilterButton',
    'ContentWorkbenchUnitKindFilterGroup',
    'ContentWorkbenchUnitMoveButton',
    'ContentWorkbenchUnitScheduleEmpty',
    'ContentWorkbenchUnitScheduleFrame',
    'ContentWorkbenchUnitScheduleHeader',
    'ContentWorkbenchUnitScheduleToolbar',
    'ContentWorkbenchUnitSceneBrief',
    'ContentWorkbenchUnitInspectorHeader',
    'ContentWorkbenchUnitInspectorShell',
    'ContentWorkbenchUnitNextActionCard',
    'ContentWorkbenchUnitPanelSwitcher',
    'ContentWorkbenchUnitPanelTab',
    'ContentWorkbenchTimelineBoundary',
    'ContentWorkbenchTimelineBlock',
    'ContentWorkbenchTimelineGridRow',
    'ContentWorkbenchTimelineLane',
    'ContentWorkbenchTimelineLaneHeader',
    'ContentWorkbenchTimelineLaneMarker',
    'ContentWorkbenchTimelineLaneStack',
    'ContentWorkbenchTimelinePlayhead',
    'ContentWorkbenchTimelineRuler',
    'ContentWorkbenchTimelineStatusGroup',
    'ContentWorkbenchTimelineTick',
    'ContentWorkbenchTimelineViewport',
    'ContentWorkbenchTimelineZoomControl',
    'ContentWorkbenchUnitTrackActionButton',
    'ContentWorkbenchUnitTrackHeader',
    'ContentWorkbenchUnitTrackMeta',
    'ContentWorkbenchUnitTrackShell',
  ]) {
    assert.match(contentUnitTrackSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by content unit track`)
    assert.match(contentWorkbenchUnitTrackPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'content-workbench-unit-track',
    'content-workbench-unit-track-header',
    'content-workbench-unit-track-meta',
    'content-workbench-unit-control-bar',
    'content-workbench-unit-kind-filter',
    'content-workbench-unit-track-action-button',
    'content-workbench-unit-scene-brief',
    'content-workbench-unit-execution-region',
    'content-workbench-unit-execution-grid',
    'content-workbench-unit-execution-card',
    'content-workbench-unit-execution-status',
    'content-workbench-unit-execution-detail-grid',
    'content-workbench-unit-execution-detail',
    'content-workbench-unit-execution-action-row',
    'content-workbench-unit-move-button',
    'content-workbench-unit-schedule',
    'content-workbench-unit-schedule-header',
    'content-workbench-unit-schedule-empty',
    'content-workbench-unit-schedule-toolbar',
    'content-workbench-unit-panel-switcher',
    'content-workbench-unit-panel-tab',
    'content-workbench-timeline-zoom',
    'content-workbench-timeline-viewport',
    'content-workbench-timeline',
    'content-workbench-timeline-block',
    'content-workbench-timeline-grid-row',
    'content-workbench-timeline-ruler',
    'content-workbench-timeline-lane',
    'content-workbench-shot-list',
    'content-workbench-shot-list-grid',
    'content-workbench-shot-list-card',
    'content-workbench-shot-list-header',
    'content-workbench-shot-list-field-grid',
    'content-workbench-shot-list-field-button',
    'content-workbench-shot-list-action-bar',
    'content-workbench-unit-inspector',
    'content-workbench-unit-inspector-header',
    'content-workbench-unit-next-action',
  ]) {
    assert.match(contentWorkbenchUnitTrackPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitControlBar[\s\S]*?<ContentWorkbenchUnitKindFilterGroup[\s\S]*?<ContentWorkbenchUnitKindFilterButton active=\{unitKindFilter === 'all'\}/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitTrackActionButton[\s\S]*?data-testid="content-workbench-ai-shot-taskGraph"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitTrackActionButton[\s\S]*?data-testid="content-workbench-create-unit-from-track"/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /data-testid="content-workbench-unit-kind-filter"[\s\S]*?<Button[\s\S]*?variant=\{active \? "soft" : "outline"\}/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitSceneBrief[\s\S]*?title="情节表达目标"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitExecutionRegion[\s\S]*?<ContentWorkbenchUnitExecutionGrid/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitExecutionCard[\s\S]*?heading=\{item\.title\}[\s\S]*?<ContentWorkbenchUnitExecutionStatus/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitExecutionDetailGrid[\s\S]*?<ContentWorkbenchUnitExecutionDetail[\s\S]*?label="画面目标"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitMoveButton[\s\S]*?data-testid="content-workbench-unit-move-earlier"/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /export function ContentWorkbenchUnitExecutionCard[\s\S]*?<WorkbenchSurfaceItem/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /export function ContentWorkbenchUnitExecutionStatus/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitTrackShell[\s\S]*?<ContentWorkbenchUnitTrackHeader/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitTrackMeta[\s\S]*?items=\{\[/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitScheduleFrame[\s\S]*?<ContentWorkbenchUnitScheduleHeader[\s\S]*?<ContentWorkbenchUnitScheduleEmpty/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitScheduleFrame[\s\S]*?<ContentWorkbenchUnitScheduleToolbar[\s\S]*?<ContentWorkbenchUnitPanelSwitcher[\s\S]*?<ContentWorkbenchUnitPanelTab active=\{schedulePanel === 'timeline'\}/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchTimelineZoomControl[\s\S]*?onZoomOut=\{\(\) => setTimelineZoom/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /data-testid="content-workbench-schedule-panel-switcher"[\s\S]*?<Button[\s\S]*?variant=\{active \? "solid" : "ghost"\}/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /data-testid="content-workbench-timeline-zoom"[\s\S]*?<Button[\s\S]*?aria-label="缩小时间轴"[\s\S]*?<Button[\s\S]*?aria-label="放大时间轴"[\s\S]*?<Button[\s\S]*?aria-label="重置时间轴缩放"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchTimelineBlock[\s\S]*?blockTitle=\{title\}[\s\S]*?tone=\{item\.state === 'blocked'/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /export function ContentWorkbenchTimelineBlock[\s\S]*?<WorkbenchListItem[\s\S]*?data-testid="content-workbench-timeline-block"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchTimelineLane[\s\S]*?laneKind=\{lane\.key\}/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /<WorkbenchSurfaceItem[\s\S]*?data-testid="content-workbench-timeline-lane"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitExecutionCard[\s\S]*?onClick=\{\(\) => selectOrClearUnit\(Number\(item\.id\)\)\}/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchShotList[\s\S]*?title="镜头明细"[\s\S]*?<ContentWorkbenchShotListGrid/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchShotListCard[\s\S]*?<ContentWorkbenchShotListHeader[\s\S]*?onOpen=\{\(\) => selectOrClearUnit\(Number\(item\.id\)\)\}/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchShotListFieldButton[\s\S]*?label="关键帧"[\s\S]*?fieldTone=\{item\.requiresKeyframe/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchShotListActionBar[\s\S]*?<ContentWorkbenchUnitMoveButton[\s\S]*?data-testid="content-workbench-shot-list-move-earlier"/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /export function ContentWorkbenchShotListCard[\s\S]*?<WorkbenchSurfaceItem[\s\S]*?data-testid="content-workbench-shot-list-row"/)
  assert.match(contentUnitTrackSource, /<ContentWorkbenchUnitInspectorShell[\s\S]*?<ContentWorkbenchUnitInspectorHeader[\s\S]*?<ContentWorkbenchUnitNextActionCard/)
  assert.match(contentWorkbenchUnitTrackPackageSource, /<WorkbenchSurfaceItem[\s\S]*?data-testid="content-workbench-unit-drawer-action"/)
  assert.doesNotMatch(contentUnitTrackSource, /bg-card/)
  assert.doesNotMatch(contentUnitTrackSource, /<section className="border-t border-border pt-3" data-testid="content-workbench-unit-track"/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-track-summary"[\s\S]{0,220}<span/)
  assert.doesNotMatch(contentUnitTrackSource, /当前情节还没有镜头方案[\s\S]{0,240}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-kind-filter"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-scene-shot-taskGraph-brief"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-execution-list"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-card"[\s\S]{0,320}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-card"[\s\S]{0,1200}<div className=/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-unit-move-earlier"[\s\S]{0,260}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-schedule"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-timeline"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-shot-list"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-shot-list-row"[\s\S]{0,360}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-shot-list-row"[\s\S]{0,1200}<Button/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-shot-list-move-earlier"[\s\S]{0,260}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-inspector"[\s\S]{0,220}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-unit-drawer-action"/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-unit-drawer-action[\s\S]{0,900}<WorkbenchSurfaceItem/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-unit-kind-filter[\s\S]{0,900}<button\b/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-schedule-panel-switcher[\s\S]{0,900}<button\b/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-timeline-zoom[\s\S]{0,900}<button\b/)
  assert.doesNotMatch(contentUnitTrackSource, /\bButton\b/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-timeline-block"[\s\S]{0,360}className=/)
  assert.doesNotMatch(contentUnitTrackSource, /data-testid="content-workbench-timeline-block"/)
  assert.doesNotMatch(contentUnitTrackSource, /<WorkbenchListItem[\s\S]{0,260}content-workbench-timeline-block/)
  assert.doesNotMatch(contentUnitTrackSource, /<button[\s\S]{0,220}data-testid="content-workbench-timeline-block"/)
  assert.doesNotMatch(contentUnitTrackSource, /className="relative h-\[46px\] rounded border border-border bg-muted\/20"[\s\S]{0,120}data-testid="content-workbench-timeline-lane"/)
  assert.doesNotMatch(contentUnitTrackSource, /<button type="button" className="(?:min-w-0 )?text-left" onClick=\{\(\) => selectOrClearUnit\(Number\(item\.id\)\)\}/)
  assert.doesNotMatch(contentUnitTrackSource, /content-workbench-timeline-block[\s\S]{0,900}border-border bg-card/)
  assert.doesNotMatch(contentUnitTrackSource, /inline-flex h-6 w-6 items-center justify-center rounded border border-transparent/)
  assert.doesNotMatch(`${contentUnitTrackSource}\n${deliveryTimelineSource}`, /rounded bg-muted px-1\.5 py-0\.5/)
  assert.doesNotMatch(`${contentUnitTrackSource}\n${deliveryTimelineSource}`, /relative h-8 rounded bg-muted\/40/)
  assert.doesNotMatch(`${contentUnitTrackSource}\n${deliveryTimelineSource}`, /min-w-0 rounded bg-muted\/30 px-2 py-1\.5/)
  assert.match(deliveryTimelineSource, /<ProductionDeliveryTimelineBlock[\s\S]*?title=/)
  assert.match(deliveryTimelineSource, /<ProductionDeliveryTimelineScheduleRow[\s\S]*?status=/)
  assert.match(deliveryTimelineSource, /<ProductionDeliveryTimelineLane[\s\S]*?laneKind=\{lane\.key\}/)
  assert.match(deliveryTimelineSource, /<ProductionDeliveryTimelineStatusBadge[\s\S]*?label=/)
  assert.match(deliveryTimelineSource, /<ProductionDeliveryTimelineScheduleMetaText[\s\S]*?intent=/)
  assert.match(productionDeliveryTimelinePackageSource, /<WorkbenchListItem[\s\S]*?data-testid="delivery-timeline-block"/)
  assert.match(productionDeliveryTimelinePackageSource, /<WorkbenchListItem[\s\S]*?data-testid="delivery-schedule-row"/)
  assert.match(productionDeliveryTimelinePackageSource, /<WorkbenchSurfaceItem[\s\S]*?data-testid="delivery-timeline-lane"/)
  assert.doesNotMatch(deliveryTimelineSource, /\b(?:Badge|Button|StatusBadge|WorkbenchListItem|WorkbenchSection|WorkbenchSurfaceItem|toneTextClass)\b/)
  assert.doesNotMatch(deliveryTimelineSource, /className=|<(?:div|p|section|span)\b/)
  assert.doesNotMatch(deliveryTimelineSource, /<button\b/)
  assert.doesNotMatch(deliveryTimelineSource, /<div className="relative h-\[46px\] rounded border border-border bg-muted\/20" data-testid="delivery-timeline-lane"/)
  assert.doesNotMatch(deliveryTimelineSource, /border-border bg-card/)
  assert.doesNotMatch(contentUnitTrackSource, /rounded bg-background\/95 px-1/)
  for (const exportName of [
    'ContentWorkbenchQuickCreateActionButton',
    'ContentWorkbenchQuickCreateActions',
    'ContentWorkbenchQuickCreateCard',
    'ContentWorkbenchQuickCreateInputField',
    'ContentWorkbenchQuickCreateSelectField',
  ]) {
    assert.match(quickCreateCardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by quick create cards`)
    assert.match(contentWorkbenchEditorPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const className of [
    'content-workbench-quick-create-card',
    'content-workbench-quick-create-field',
    'content-workbench-quick-create-select-trigger',
    'content-workbench-quick-create-actions',
    'content-workbench-quick-create-action-button',
  ]) {
    assert.match(contentWorkbenchEditorPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.doesNotMatch(quickCreateCardsSource, /\b(?:WorkbenchSection|Label|Select|SelectContent|SelectItem|SelectTrigger|SelectValue|Button|Badge|Input)\b/)
  assert.doesNotMatch(quickCreateCardsSource, /className=/)
  assert.doesNotMatch(quickCreateCardsSource, /overflow-hidden rounded-lg border border-border bg-card/)
  for (const exportName of [
    'ProductionDeliveryWorkbenchStack',
    'ProductionDeliveryWorkbenchMetricGrid',
    'ProductionDeliveryWorkbenchSplit',
    'ProductionDeliveryVersionDetailSection',
    'ProductionDeliveryWorkbenchSection',
    'ProductionDeliveryWorkbenchMetric',
    'ProductionDeliveryWorkbenchKeyValue',
    'ProductionDeliveryWorkbenchEmptyState',
    'ProductionDeliveryWorkbenchStatusBadge',
    'ProductionDeliveryWorkbenchBadge',
    'ProductionDeliveryWorkbenchActionButton',
    'ProductionDeliveryWorkbenchActionGroup',
    'ProductionDeliveryGateCheckItem',
    'ProductionDeliveryItemEditorStack',
    'ProductionDeliveryItemEditorGrid',
    'ProductionDeliveryField',
    'ProductionDeliveryInput',
    'ProductionDeliveryNativeSelect',
    'ProductionDeliveryExportRecordStack',
    'ProductionDeliveryExportRecordItem',
    'ProductionDeliveryResourceAdoptionShell',
    'ProductionDeliveryResourceAdoptionField',
    'ProductionDeliveryResourcePreviewFrame',
    'ProductionDeliveryResourcePlaceholder',
  ]) {
    assert.match(deliveryPanelsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by delivery panels`)
    assert.match(productionDeliveryCenterPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(productionPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from production package`)
  }
  for (const className of [
    'production-delivery-workbench-stack',
    'production-delivery-workbench-metric-grid',
    'production-delivery-workbench-split',
    'production-delivery-workbench-action-group',
    'production-delivery-version-detail-section__body',
    'production-delivery-gate-check-item',
    'production-delivery-item-editor-stack',
    'production-delivery-field',
    'production-delivery-export-record-item',
    'production-delivery-resource-adoption-shell',
    'production-delivery-resource-preview-frame',
  ]) {
    assert.match(productionDeliveryCenterPackageCss, cssClassSelectorPattern(className), `${className} style must be package-owned`)
  }
  assert.match(deliveryPanelsSource, /ProductionDeliveryExportRecordItem/)
  assert.match(deliveryPanelsSource, /ProductionDeliveryResourcePreviewFrame[\s\S]*?<ProductionDeliveryResourcePlaceholder>/)
  assert.match(deliveryPanelsSource, /ProductionDeliveryNativeSelect/)
  assert.match(deliveryPanelsSource, /function DeliveryVersionSummaryCard[\s\S]*?ProductionDeliveryWorkbenchSection/)
  assert.match(deliveryPanelsSource, /function DeliveryGateCheckPanel[\s\S]*?ProductionDeliveryWorkbenchSection/)
  assert.match(deliveryPanelsSource, /deliveryGateStatusRecipe/)
  assert.doesNotMatch(deliveryPanelsSource, /\b(?:ProductionDeliveryGateIconFrame|ProductionDeliveryErrorText)\b/)
  assert.match(deliveryPanelsSource, /function DeliveryExportPanel[\s\S]*?ProductionDeliveryWorkbenchSection/)
  assert.match(deliveryPanelsSource, /exportRecords\.map[\s\S]*?<ProductionDeliveryExportRecordItem[\s\S]*?key=\{record\.ID\}/)
  assert.match(deliveryPanelsSource, /function EmptyDeliveryTimeline[\s\S]*?ProductionDeliveryWorkbenchEmptyState/)
  assert.doesNotMatch(deliveryPanelsSource, /\b(?:WorkbenchSection|WorkbenchEmptyState|WorkbenchSurfaceItem|WorkbenchMetric|WorkbenchKeyValue|WorkbenchStatusBadge|Badge|Button|Input|Label|NativeSelect|StatusBadge|AppMediaFrame)\b/)
  assert.doesNotMatch(deliveryPanelsSource, /className=|<div\b|<section\b|<p\b|<span\b/)
  assert.doesNotMatch(deliveryPanelsSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(deliveryPanelsSource, /rounded-lg border border-border p-3/)
  assert.doesNotMatch(deliveryPanelsSource, /flex items-start gap-3 rounded-md border border-border bg-background p-3/)
  assert.doesNotMatch(deliveryPanelsSource, /rounded-md bg-muted\/50 p-2/)
  assert.doesNotMatch(deliveryPanelsSource, /flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-muted-foreground/)
  assert.doesNotMatch(deliveryPanelsSource, /\b(?:toneTextClass|toneSurfaceClass)\b|cn\(/)
  assert.doesNotMatch(deliveryPanelsSource, /<select\b/)
  assert.doesNotMatch(deliveryPanelsSource, /flex flex-col items-center justify-center gap-3 p-10/)
})

test('project standards page uses package form controls', () => {
  const standardsSource = readProjectFile('apps/frontend/src/features/project-standards/components/ProjectStandardsPage.tsx')
  const projectStandardsPackageSource = readProjectFile('packages/ui/src/components/business/project/standards/index.tsx')
  const projectIndexSource = readProjectFile('packages/ui/src/components/business/project/index.tsx')
  const projectStandardsSemanticUiSource = readProjectFile('apps/frontend/src/features/project-standards/presentation/projectStandardsSemanticUi.ts')

  for (const exportName of ['CheckboxField', 'AppCodeBlock', 'AppInlineMeta', 'AppSurfaceItem', 'AppTextEmptyState', 'WorkbenchSurfaceItem', 'Input', 'Button', 'StatusBadge', 'DialogContent']) {
    assert.match(projectStandardsPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by project standards package UI`)
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
  ]) {
    assert.match(standardsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ProjectStandardsPage`)
    assert.match(projectStandardsPackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(projectIndexSource, /from "\.\/standards"/, 'project package UI must export standards scenario package')
  assert.match(standardsSource, /<ProjectStandardsInput[\s\S]*?ref=\{styleReferenceInputRef\}[\s\S]*?type="file"[\s\S]*?multiple/)
  assert.match(standardsSource, /CORE_STANDARD_DEFS\.map[\s\S]*?ProjectStandardsSurfaceItem/, 'core standard cards must use package project standards surface items')
  assert.match(projectStandardsPackageSource, /toneSurfaceClass\("warning"\)/, 'warning tone surface must be owned by project standards package UI')
  assert.doesNotMatch(standardsSource, /\b(?:toneTextClass|toneSurfaceClass|cn)\b/)
  for (const recipeName of ['projectStandardsReadyRecipe', 'projectStandardsRequiredRuleRecipe', 'projectStandardsEnabledRuleRecipe']) {
    assert.match(projectStandardsSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be project standards semantic UI-owned`)
    assert.match(standardsSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by project standards page`)
  }
  assert.doesNotMatch(standardsSource, /<StatusBadge\b[^>]*\btone=/)
  assert.match(standardsSource, /ProjectStandardsIconButton[\s\S]{0,120}variant="ghost"[\s\S]{0,80}tone="danger"[\s\S]{0,160}deleteRule/, 'ProjectStandardsPage delete action must use package danger button tone')
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

test('generation cards use package tone contracts', () => {
  const genInputCardSource = readProjectFile('apps/frontend/src/shared/ui/GenInputCard.tsx')
  const genResultCardSource = readProjectFile('apps/frontend/src/shared/ui/GenResultCard.tsx')
  const generationResultCardSource = readGenerationResultSource()
  const generationResultCardCss = readGenerationResultCss()
  const generationCardsSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.tsx')
  const agentGeneratedFeedbackSource = readProjectFile('packages/ui/src/components/business/agent/generated/feedback/index.tsx')
  const sources = [generationCardsSource, genResultCardSource, genInputCardSource].join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(generationCardsSource, /AgentGenerated(?:Callout|Card|Item|IntentText|Stat)/)
  assert.match(agentGeneratedFeedbackSource, /toneTextClass/)
  assert.match(agentGeneratedFeedbackSource, /toneSurfaceClass/)
  assert.doesNotMatch(generationCardsSource, /\btone(?:Text|Surface)Class\b/)
  assert.match(generationCardsSource, /\bAgentGeneratedProgressBar\b/)
  assert.match(generationCardsSource, /\bAgentGeneratedStatusBadge\b/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedProgressBar[\s\S]*?<AppProgressBar/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedCard[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedItem[\s\S]*?<AgentSurfaceBlock/)
  assert.doesNotMatch(generationCardsSource, /\b(?:AgentSurfaceBlock|AppProgressBar|StatusBadge)\b/)
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

test('agent generation and local runtime workflow use package tone contracts', () => {
  const generationDisplaySource = readProjectFile('apps/frontend/src/features/agent/domain/agentGenerationDisplay.ts')
  const generationCardsSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.tsx')
  const pinnedStatusShelfSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
  const agentGeneratedFeedbackSource = readProjectFile('packages/ui/src/components/business/agent/generated/feedback/index.tsx')
  const agentPlanOverviewTaskSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/task/index.tsx')
  const agentPlanOverviewTaskCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/task/styles.css')
  const agentWorkflowApprovalStatusSource = readProjectFile('packages/ui/src/components/business/agent/workflow-approval/status/index.ts')
  const agentWorkflowApprovalCardSource = readProjectFile('packages/ui/src/components/business/agent/workflow-approval/card/index.tsx')
  const agentSemanticUiSource = readProjectFile('apps/frontend/src/features/agent/presentation/agentSemanticUi.ts')
  const localRuntimeSource = readProjectFile('apps/frontend/src/features/agent/components/localRuntime.tsx')
  const aiDraftsSource = readProjectFile('apps/frontend/src/features/agent/components/AIDraftsPage.tsx')
  const agentDraftResultCardsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentDraftResultCards.tsx')
  const sources = [
    generationCardsSource,
    pinnedStatusShelfSource,
    localRuntimeSource,
    aiDraftsSource,
    agentDraftResultCardsSource,
  ].join('\n')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.doesNotMatch(sources, /toneTextClass|toneSurfaceClass|accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class/)
  assert.doesNotMatch(generationCardsSource, /AgentSurfaceBlock/)
  assert.match(generationCardsSource, /AgentGenerated(?:Callout|Card|Item|IntentText|Stat)/)
  assert.match(agentGeneratedFeedbackSource, /toneTextClass/)
  assert.match(agentGeneratedFeedbackSource, /toneSurfaceClass/)
  assert.match(agentGeneratedFeedbackSource, /ReviewCallout/)
  assert.match(pinnedStatusShelfSource, /AgentPlanOverviewTaskStatusIcon/)
  assert.match(agentPlanOverviewTaskSource, /export const AgentPlanOverviewTaskStatusIcon/)
  assert.match(agentPlanOverviewTaskSource, /toneTextClass\(intent\)/)
  assert.match(agentPlanOverviewTaskCss, cssClassSelectorPattern('ms-agent-plan-overview-task__status-icon'))
  assert.match(generationCardsSource, /\bAgentGeneratedProgressBar\b/)
  assert.match(generationCardsSource, /\bAgentGeneratedStatusBadge\b/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedProgressBar[\s\S]*?<AppProgressBar/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedCard[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentGeneratedFeedbackSource, /AgentGeneratedItem[\s\S]*?<AgentSurfaceBlock/)
  assert.doesNotMatch(generationCardsSource, /\b(?:AgentSurfaceBlock|AppProgressBar|StatusBadge)\b/)
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
  assert.doesNotMatch(generationCardsSource, /\b(?:ReviewCallout|ReviewStat|toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(localRuntimeSource, /AgentSurfaceBlock/)
  assert.match(localRuntimeSource, /AgentWorkflowRuntimePanel/)
  assert.match(localRuntimeSource, /AgentWorkflowRequestCard/)
  assert.match(localRuntimeSource, /AgentWorkflowRequestActions/)
  assert.match(localRuntimeSource, /agentRunStatusRecipe/)
  assert.match(localRuntimeSource, /agentWorkflowActionStatusRecipe/)
  assert.match(localRuntimeSource, /AgentWorkflowSection/)
  assert.match(localRuntimeSource, /AgentWorkflowChoiceButton/)
  assert.match(localRuntimeSource, /AgentWorkflowActionButton/)
  assert.doesNotMatch(localRuntimeSource, /agentWorkflowApproval(?:Section|Title|Impact|Item|Rail|Badge|InputChoice|InputItem|InputRail|InputBadge|InputAnswer|RejectAction)Class/)
  assert.match(agentWorkflowApprovalStatusSource, /export function agentWorkflowApprovalSectionClass/)
  assert.match(agentWorkflowApprovalStatusSource, /export function agentWorkflowApprovalBadgeClass/)
  assert.match(agentWorkflowApprovalStatusSource, /export function agentWorkflowApprovalInputChoiceClass/)
  assert.match(agentWorkflowApprovalStatusSource, /toneSurfaceClass/)
  assert.match(agentWorkflowApprovalStatusSource, /toneTextClass/)
  assert.match(agentWorkflowApprovalCardSource, /AgentWorkflowRequestCard[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentWorkflowApprovalCardSource, /AgentWorkflowChoiceButton[\s\S]*?<Button/)
  assert.match(agentWorkflowApprovalCardSource, /AgentWorkflowTextInput[\s\S]*?<Input/)
  assert.match(agentWorkflowApprovalCardSource, /AgentWorkflowStateBadge[\s\S]*?<Badge/)
  assert.match(agentWorkflowApprovalCardSource, /AgentWorkflowStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(agentWorkflowApprovalCardSource, /AgentWorkflowMarkerDot[\s\S]*?<AppMarkerDot/)
  assert.doesNotMatch(localRuntimeSource, /\b(?:AgentSurfaceBlock|AppMarkerDot|Badge|Button|Input|StatusBadge)\b/)
  assert.match(localRuntimeSource, /\bAgentWorkflowMarkerDot\b/)
  assert.match(localRuntimeSource, /\bAgentWorkflowTextInput\b/)
  assert.match(aiDraftsSource, /agentDraftStatusRecipe/)
  assert.match(agentDraftResultCardsSource, /agentDraftStatusRecipe/)
  assert.match(localRuntimeSource, /<AgentWorkflowTextInput[\s\S]*?data-testid="agent-run-input-text"/)
  assert.doesNotMatch(localRuntimeSource, /workflowActionDotProps[\s\S]*?return \{ tone: 'danger' as const \}/)
  assert.doesNotMatch(localRuntimeSource, /\b(?:accentBadgeClass|accentDotClass|accentSurfaceClass|accentTextClass|toneDotClass|toneSurfaceClass|toneTextClass)\b/)
  assert.doesNotMatch(localRuntimeSource, /function workflowApproval(?:Section|Title|Impact|Item|Rail|Badge)Class\b/)
  assert.doesNotMatch(generationCardsSource, /ms-semantic-(?:icon|badge|surface|dot)--/)
  assert.doesNotMatch(sources, /function (?:generationJobStatusTone|draftStatusTone|workflowActionBadgeTone)\b/)
  assert.doesNotMatch(sources, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(localRuntimeSource, /<input\b/)
  assert.doesNotMatch(localRuntimeSource, /border-destructive\//)
  assert.doesNotMatch(localRuntimeSource, /bg-destructive/)
  assert.doesNotMatch(localRuntimeSource, /text-destructive/)
  assert.doesNotMatch(localRuntimeSource, /bg-muted-foreground/)
  assert.doesNotMatch(localRuntimeSource, /bg-border/)
  assert.doesNotMatch(localRuntimeSource, /h-1\.5 w-1\.5 shrink-0 rounded-full/)
  assert.doesNotMatch(localRuntimeSource, /workflowActionDotClass/)
  assert.doesNotMatch(generationCardsSource, /rounded bg-background\/70 px-2 py-1\.5/)
  assert.doesNotMatch(generationCardsSource, /rounded-md border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(generationCardsSource, /rounded border border-border\/80 bg-muted\/20/)
  assert.doesNotMatch(generationCardsSource, /h-1\.5 overflow-hidden rounded-full bg-muted/)
  assert.doesNotMatch(localRuntimeSource, /rounded-md border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(localRuntimeSource, /rounded-md border border-border\/80 bg-muted\/20/)
  assert.doesNotMatch(localRuntimeSource, /rounded border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(localRuntimeSource, /relative overflow-hidden rounded-md border bg-background\/35/)
})

test('agent run settings and preview surfaces use package tone contracts', () => {
  const previewDrawerSource = readProjectFile('apps/frontend/src/shared/ui/PreviewDrawer.tsx')
  const resourcePreviewDrawerSource = readResourcePreviewDrawerSource()
  const resourcePreviewDrawerCss = readResourcePreviewDrawerCss()
  const agentPackageSource = [
    readAgentSource(),
    'packages/ui/src/components/business/agent/activity-feed/index.tsx',
    'packages/ui/src/components/business/agent/diagnostic/index.tsx',
    'packages/ui/src/components/business/agent/plan-overview/index.tsx',
    'packages/ui/src/components/business/agent/run-activity/index.tsx',
  ].map((sourceOrPath) => sourceOrPath.startsWith('packages/') ? readProjectFile(sourceOrPath) : sourceOrPath).join('\n')
  const agentCss = readAgentCss()
  const agentRunSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentRunPage.tsx')
  const agentConsoleSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')
  const agentDebugSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  const agentPerformanceSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx')
  const debugPreviewSource = readProjectFile('apps/frontend/src/features/agent/components/AgentDebugPreviewDialog.tsx')
  const agentRunsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentRunsPage.tsx')
  const agentSemanticUiSource = readProjectFile('apps/frontend/src/features/agent/presentation/agentSemanticUi.ts')
  const runActivitySource = readProjectFile('apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx')
  const planOverviewSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPlanOverviewPanel.tsx')
  const agentPlanCardSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPlanCard.tsx')
  const contextDiagnosticSource = readProjectFile('apps/frontend/src/features/agent/components/ContextDiagnosticCard.tsx')
  const workflowBubbleSource = readProjectFile('apps/frontend/src/features/agent/components/AgentWorkflowBubble.tsx')
  const activityFeedSource = readProjectFile('apps/frontend/src/features/agent/components/AgentActivityFeed.tsx')
  const activityFeedDomainSource = readProjectFile('apps/frontend/src/features/agent/domain/agentActivityFeed.ts')
  const generatedResultSource = readProjectFile('apps/frontend/src/features/agent/components/GeneratedResultCard.tsx')
  const composerSectionSource = readProjectFile('apps/frontend/src/features/agent/components/AgentComposerSection.tsx')
  const dataBlockSources = [
    'apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx',
    'apps/frontend/src/features/agent/components/AIDraftsPage.tsx',
    'apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx',
    'apps/frontend/src/features/agent/components/ContextDiagnosticCard.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanCard.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const sources = [
    'apps/frontend/src/features/agent/components/AIAgentRunPage.tsx',
    'apps/frontend/src/features/agent/components/AIDraftsPage.tsx',
    'apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx',
    'apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanOverviewPanel.tsx',
    'apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx',
    'apps/frontend/src/features/agent/components/AgentDebugPreviewDialog.tsx',
    'apps/frontend/src/features/agent/components/AgentChatBubbles.tsx',
    'apps/frontend/src/features/agent/components/AgentActivityFeed.tsx',
    'apps/frontend/src/features/agent/components/ContextDiagnosticCard.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanCard.tsx',
    'apps/frontend/src/features/agent/components/AgentWorkflowBubble.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + previewDrawerSource
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(sources, /toneTextClass|toneSurfaceClass|ReviewCallout|StatusDot/)
  assert.match(resourcePreviewDrawerSource, /AppMetricCard/)
  for (const exportName of [
    'ResourcePreviewDrawerShell',
    'ResourcePreviewDrawerHeader',
    'ResourcePreviewTreeNode',
    'ResourcePreviewTreeFrameRow',
    'ResourcePreviewStoryFrame',
    'ResourcePreviewMissingAssets',
    'ResourcePreviewMobileNode',
    'ResourcePreviewStats',
  ]) {
    assert.match(previewDrawerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by preview drawer`)
    assert.match(resourcePreviewDrawerSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of ['AppEmptyState', 'AppInlineMeta', 'AppMediaFrame', 'AppMetricCard', 'AppPanel', 'AppStateMessage', 'AppSurfaceItem', 'WorkbenchList', 'WorkbenchListItem', 'WorkbenchSurfaceItem']) {
    assert.match(resourcePreviewDrawerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by resource preview drawer package UI`)
    assert.doesNotMatch(previewDrawerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into PreviewDrawer`)
  }
  assert.match(resourcePreviewDrawerCss, /\.resource-preview-drawer\s*\{/)
  assert.match(resourcePreviewDrawerCss, /\.resource-preview-tree-node\s*\{/)
  assert.match(resourcePreviewDrawerCss, /\.resource-preview-story-frame\s*\{/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border border-border bg-background/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border border-dashed border-border bg-background/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border border-border bg-muted\/20/)
  assert.doesNotMatch(previewDrawerSource, /rounded-md border border-border bg-background p-3/)
  assert.doesNotMatch(previewDrawerSource, /rounded-md border border-border bg-background px-3 py-2/)
  assert.doesNotMatch(previewDrawerSource, /w-full rounded-lg border bg-background p-3/)
  assert.doesNotMatch(previewDrawerSource, /rounded-lg border bg-background transition-colors/)
  assert.doesNotMatch(previewDrawerSource, /<button type="button" onClick=\{onSelect\} className="min-w-0 flex-1 text-left"/)
  assert.match(previewDrawerSource, /function StoryTreeNode[\s\S]*?<ResourcePreviewTreeNode[\s\S]*?onSelect=\{onSelect\}/)
  assert.match(previewDrawerSource, /priorityProps: \{ intent: priorityIntent\(asset\.priority\) \}/)
  assert.match(previewDrawerSource, /<ResourcePreviewTreeFrameRow[\s\S]*?statusProps=\{\{ intent: keyframe\.has_asset \? 'success' : 'warning' \}\}/)
  assert.match(previewDrawerSource, /function StoryFrame[\s\S]*?<ResourcePreviewStoryFrame/)
  assert.match(previewDrawerSource, /function StoryFrame[\s\S]*?statusProps=\{\{ intent: keyframe\.has_asset \? 'success' : 'warning' \}\}/)
  assert.match(resourcePreviewDrawerSource, /ResourcePreviewStoryFrame[\s\S]*?statusProps: StatusBadgeProps/)
  assert.match(resourcePreviewDrawerSource, /ResourcePreviewTreeFrameRow[\s\S]*?statusProps: StatusDotProps/)
  assert.match(resourcePreviewDrawerSource, /ResourcePreviewMissingAssets[\s\S]*?priorityProps: StatusBadgeProps/)
  assert.doesNotMatch(`${previewDrawerSource}\n${resourcePreviewDrawerSource}`, /\bstatusTone\b|\bpriorityTone\b|\bSemanticTone\b/)
  assert.doesNotMatch(resourcePreviewDrawerSource, /<StatusBadge\b[^>]*\btone=|<StatusDot\b[^>]*\btone=/)
  assert.match(previewDrawerSource, /function MobileTree[\s\S]*?<ResourcePreviewMobileNode/)
  assert.doesNotMatch(previewDrawerSource, /rounded bg-muted px-1\.5 py-0\.5 type-tiny tabular-nums/)
  assert.doesNotMatch(previewDrawerSource, /absolute left-2 top-2 rounded bg-background\/90/)
  assert.doesNotMatch(previewDrawerSource, /line-clamp-3 rounded-md bg-muted\/50 px-3 py-2/)
  assert.match(dataBlockSources, /AgentDataBlock/)
  assert.doesNotMatch(dataBlockSources, /rounded-md border border-border bg-muted\/20/)
  for (const exportName of [
    'AgentDiagnosticCard',
    'AgentDiagnosticDisclosure',
    'AgentDiagnosticCodeBlock',
    'AgentDiagnosticSummaryItem',
    'AgentDiagnosticToolItem',
    'AgentDiagnosticWarnings',
  ]) {
    assert.match(contextDiagnosticSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by context diagnostics`)
    assert.match(agentPackageSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(agentCss, /\.ms-agent-diagnostic-card\s*\{/)
  assert.match(agentCss, /\.ms-agent-diagnostic-disclosure__summary\s*\{/)
  assert.match(agentCss, /\.ms-agent-diagnostic-code\s*\{/)
  assert.doesNotMatch(contextDiagnosticSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(contextDiagnosticSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(contextDiagnosticSource, /rounded border border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(contextDiagnosticSource, /rounded border border-border\/70 bg-background/)
  assert.doesNotMatch(contextDiagnosticSource, /rounded border border-border\/60 bg-muted\/20/)
  assert.doesNotMatch(contextDiagnosticSource, /flex cursor-pointer list-none items-center/)
  assert.doesNotMatch(contextDiagnosticSource, /max-h-44 border-t border-border px-2 py-1\.5/)
  assert.doesNotMatch(contextDiagnosticSource, /\btype-min\b/)
  assert.doesNotMatch(contextDiagnosticSource, /px-2 py-1\.5 type-tiny/)
  assert.doesNotMatch(contextDiagnosticSource, /<pre\b/)
  assert.match(debugPreviewSource, /AgentDebugHttpRequestShell/)
  assert.match(debugPreviewSource, /AgentDebugLabeledCodePanel/)
  assert.match(debugPreviewSource, /AgentDebugFieldCodePanel/)
  assert.doesNotMatch(debugPreviewSource, /rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(debugPreviewSource, /rounded border border-border\/70 bg-background\/70/)
  assert.doesNotMatch(debugPreviewSource, /rounded border border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(debugPreviewSource, /rounded-md border border-border bg-muted\/30/)
  assert.doesNotMatch(debugPreviewSource, /rounded bg-muted p-1\.5/)
  assert.doesNotMatch(debugPreviewSource, /<pre\b/)
  for (const exportName of [
    'AgentRunActivityDisclosure',
    'AgentRunActivityCodeDisclosure',
    'AgentRunActivityItem',
    'AgentRunActivityStatusBadge',
    'AgentRunActivityBubble',
    'AgentRunActivityNotice',
  ]) {
    assert.match(runActivitySource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by run activity panel`)
    assert.match(agentPackageSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(agentCss, /\.ms-agent-run-activity\s*\{/)
  assert.match(agentCss, /\.ms-agent-run-activity-item\s*\{/)
  assert.match(agentCss, /\.ms-agent-run-activity-code__content\s*\{/)
  assert.match(agentSemanticUiSource, /agentRunStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentWorkflowStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentWorkflowActionStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentDraftStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentGenerationStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentToolCallStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentConfigStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentTestResultRecipe/)
  assert.match(agentSemanticUiSource, /agentReadinessStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentAvailabilityStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentOptionalStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentSeverityStatusRecipe/)
  assert.match(agentSemanticUiSource, /agentPerformanceHealthRecipe/)
  assert.match(agentSemanticUiSource, /agentPerformanceOperationRecipe/)
  assert.match(agentSemanticUiSource, /agentPerformanceLogRecipe/)
  assert.match(agentSemanticUiSource, /agentSlowDiagnosticRecipe/)
  assert.match(agentSemanticUiSource, /import \{ defineFeatureStatusRecipeGroup, type UiStatusRecipe \} from '@\/shared\/presentation\/semanticRecipe'/)
  assert.match(agentSemanticUiSource, /export type AgentStatusRecipe = UiStatusRecipe/)
  assert.match(agentSemanticUiSource, /defineFeatureStatusRecipeGroup\('agent\.run\.status'/)
  assert.match(agentConsoleSource, /agentRunStatusRecipe/)
  assert.match(agentConsoleSource, /agentReadinessStatusRecipe/)
  assert.match(agentConsoleSource, /agentOptionalStatusRecipe/)
  assert.match(agentConsoleSource, /agentSeverityStatusRecipe/)
  assert.match(agentDebugSource, /agentRunStatusRecipe/)
  assert.match(agentDebugSource, /agentAvailabilityStatusRecipe/)
  assert.match(agentDebugSource, /agentSeverityStatusRecipe/)
  assert.match(agentRunSource, /agentToolCallStatusRecipe/)
  assert.match(agentSettingsSource, /agentConfigStatusRecipe/)
  assert.match(agentSettingsSource, /agentTestResultRecipe/)
  assert.match(agentPerformanceSource, /agentPerformanceHealthRecipe/)
  assert.match(agentPerformanceSource, /agentPerformanceOperationRecipe/)
  assert.match(agentPerformanceSource, /agentPerformanceLogRecipe/)
  assert.match(agentPerformanceSource, /agentSlowDiagnosticRecipe/)
  assert.match(debugPreviewSource, /agentWorkflowActionStatusRecipe/)
  assert.match(contextDiagnosticSource, /agentSeverityStatusRecipe/)
  assert.match(agentRunsSource, /agentRunStatusRecipe/)
  assert.match(agentRunsSource, /agentAttentionStatusRecipe/)
  assert.match(agentPlanCardSource, /AgentPlanOverviewTaskStatusIcon/)
  assert.match(runActivitySource, /agentRunStatusRecipe/)
  assert.match(runActivitySource, /agentWorkflowStatusRecipe/)
  assert.match(planOverviewSource, /agentRunStatusRecipe/)
  assert.match(planOverviewSource, /agentWorkflowStatusRecipe/)
  assert.doesNotMatch(`${agentRunSource}\n${agentSettingsSource}\n${agentPerformanceSource}\n${debugPreviewSource}\n${contextDiagnosticSource}`, /<StatusBadge\b[^>]*\btone=|<AgentDiagnosticStatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(agentRunSource, /function toolCallStatusTone\b/)
  assert.doesNotMatch(`${agentConsoleSource}\n${agentDebugSource}\n${agentRunsSource}\n${runActivitySource}\n${planOverviewSource}`, /function (?:runStatusTone|workflowTone)\b/)
  assert.doesNotMatch(runActivitySource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(runActivitySource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(runActivitySource, /\bReviewCallout\b/)
  assert.doesNotMatch(runActivitySource, /\bStatusBadge\b/)
  assert.doesNotMatch(runActivitySource, /\bStatusDot\b/)
  assert.doesNotMatch(runActivitySource, /\bButton\b/)
  assert.doesNotMatch(runActivitySource, /rounded-md border border-border\/80 bg-background\/70/)
  assert.doesNotMatch(runActivitySource, /rounded border border-border\/80 bg-muted\/20/)
  assert.doesNotMatch(runActivitySource, /rounded border border-border\/80 bg-background/)
  assert.doesNotMatch(runActivitySource, /rounded border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(runActivitySource, /hover:bg-muted\/30/)
  assert.doesNotMatch(runActivitySource, /flex cursor-pointer list-none items-center justify-between/)
  assert.doesNotMatch(runActivitySource, /max-h-32 border-t border-border\/60 px-2 py-1\.5/)
  assert.doesNotMatch(runActivitySource, /type-micro leading-4 px-1\.5 py-0/)
  assert.doesNotMatch(runActivitySource, /<button\b/)
  assert.doesNotMatch(runActivitySource, /<pre\b/)
  for (const exportName of [
    'AgentPlanOverviewShell',
    'AgentPlanOverviewHeader',
    'AgentPlanOverviewActionButton',
    'AgentPlanOverviewProgress',
    'AgentPlanOverviewCodeDisclosure',
    'AgentPlanOverviewNotice',
    'AgentPlanOverviewDisclosure',
    'AgentPlanOverviewDisclosureBody',
    'AgentPlanOverviewItemCard',
    'AgentPlanOverviewTaskCard',
    'AgentPlanOverviewTaskStatusDot',
    'AgentPlanOverviewTaskBadge',
    'AgentPlanOverviewMetaRow',
    'AgentPlanOverviewBadge',
  ]) {
    assert.match(planOverviewSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by plan overview`)
    assert.match(agentPackageSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(agentCss, /\.ms-agent-plan-overview\s*\{/)
  assert.match(agentCss, /\.ms-agent-plan-overview-progress\s*\{/)
  assert.match(agentCss, /\.ms-agent-plan-overview-code__content\s*\{/)
  assert.match(agentCss, /\.ms-agent-plan-overview-disclosure\s*\{/)
  assert.match(agentCss, /\.ms-agent-plan-overview-task\s*\{/)
  assert.match(agentCss, /\.ms-agent-plan-overview-item\s*\{/)
  assert.doesNotMatch(planOverviewSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(planOverviewSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(planOverviewSource, /\bButton\b/)
  assert.doesNotMatch(planOverviewSource, /\bBadge\b/)
  assert.doesNotMatch(planOverviewSource, /\bStatusBadge\b/)
  assert.doesNotMatch(planOverviewSource, /\bStatusDot\b/)
  assert.doesNotMatch(planOverviewSource, /\btoneSurfaceClass\b/)
  assert.doesNotMatch(planOverviewSource, /\btoneTextClass\b/)
  assert.doesNotMatch(agentPlanCardSource, /\btoneTextClass\b/)
  assert.doesNotMatch(planOverviewSource, /className="mt-2 px-2\.5 py-2 type-label"/)
  assert.doesNotMatch(planOverviewSource, /className="mt-2 flex flex-wrap items-center gap-1"/)
  assert.doesNotMatch(planOverviewSource, /className="mt-2 grid grid-cols-3 gap-1"/)
  assert.doesNotMatch(planOverviewSource, /className="mt-1 flex flex-wrap items-center gap-1"/)
  assert.doesNotMatch(planOverviewSource, /className="flex cursor-pointer list-none/)
  assert.doesNotMatch(planOverviewSource, /className="px-1\.5 py-1/)
  assert.doesNotMatch(planOverviewSource, /h-1\.5 overflow-hidden rounded-full bg-muted/)
  assert.doesNotMatch(planOverviewSource, /max-h-32 border-t border-border\/60 px-2 py-1\.5/)
  assert.doesNotMatch(planOverviewSource, /rounded border border-border\/70 bg-muted\/10/)
  assert.doesNotMatch(planOverviewSource, /rounded border border-border\/60 bg-muted\/10/)
  assert.doesNotMatch(planOverviewSource, /rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(planOverviewSource, /rounded border border-border\/70 bg-background/)
  assert.doesNotMatch(planOverviewSource, /rounded bg-background\/80/)
  assert.doesNotMatch(planOverviewSource, /rounded border border-destructive\/30 bg-destructive\/5/)
  assert.doesNotMatch(planOverviewSource, /<pre\b/)
  for (const exportName of [
    'AgentWorkflowApprovalCard',
    'AgentWorkflowApprovalCodeBlock',
    'AgentWorkflowApprovalBadge',
    'AgentWorkflowApprovalThumbnail',
    'AgentWorkflowApprovalPreviewStack',
    'AgentWorkflowApprovalSideEffect',
  ]) {
    assert.match(workflowBubbleSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by workflow approval details`)
    assert.match(agentPackageSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(agentCss, /\.ms-agent-workflow-approval-card\s*\{/)
  assert.match(agentCss, /\.ms-agent-workflow-approval-code\s*\{/)
  assert.match(agentCss, /\.ms-agent-workflow-approval-thumb\s*\{/)
  assert.doesNotMatch(workflowBubbleSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(workflowBubbleSource, /\bAgentDataBlock\b/)
  assert.doesNotMatch(workflowBubbleSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(workflowBubbleSource, /\bBadge\b/)
  assert.doesNotMatch(workflowBubbleSource, /\btoneTextClass\b/)
  assert.doesNotMatch(workflowBubbleSource, /rounded border border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(workflowBubbleSource, /rounded-md border border-border\/30 bg-background\/35/)
  assert.doesNotMatch(workflowBubbleSource, /rounded border border-border\/30/)
  assert.doesNotMatch(workflowBubbleSource, /rounded bg-muted\/50/)
  assert.doesNotMatch(workflowBubbleSource, /rounded-md border border-border\/30 bg-muted\/20/)
  assert.doesNotMatch(workflowBubbleSource, /className="mt-0"/)
  assert.doesNotMatch(workflowBubbleSource, /max-h-24 overflow-auto p-1\.5/)
  assert.doesNotMatch(workflowBubbleSource, /line-clamp-[23]/)
  assert.doesNotMatch(workflowBubbleSource, /<pre\b/)
  for (const exportName of [
    'AgentActivityFeedRoot',
    'AgentActivityRound',
    'AgentActivityLineItem',
    'AgentActivityFrame',
    'AgentActivityKindLabel',
    'AgentActivityCodePanel',
    'AgentActivityStatusLine',
    'AgentActivityMenuButton',
  ]) {
    assert.match(activityFeedSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent activity feed`)
    assert.match(agentPackageSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(agentCss, /\.ms-agent-activity-feed\s*\{/)
  assert.match(agentCss, /\.ms-agent-activity-frame\s*\{/)
  assert.match(agentCss, /\.ms-agent-activity-code-panel__body\s*\{/)
  assert.doesNotMatch(activityFeedSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(activityFeedSource, /\bAgentDataBlock\b/)
  assert.doesNotMatch(activityFeedSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(activityFeedSource, /\bButton\b/)
  assert.doesNotMatch(activityFeedSource, /\bDropdownMenuContent\b/)
  assert.match(activityFeedSource, /function AgentActivityItemRow[\s\S]*?<AgentActivityFrame[\s\S]*kind=\{item\.kind\}/)
  assert.match(activityFeedSource, /<AgentActivityKindLabel kind=\{item\.kind\}>/)
  assert.doesNotMatch(`${activityFeedSource}\n${activityFeedDomainSource}\n${agentPackageSource}`, /\bAgentActivityTone\b|\bAgentActivityToneLabel\b/)
  assert.doesNotMatch(activityFeedSource, /<AgentActivityFrame\b[\s\S]{0,160}\btone=/)
  assert.doesNotMatch(activityFeedSource, /<AgentActivityKindLabel\b[\s\S]{0,160}\btone=/)
  assert.doesNotMatch(activityFeedSource, /\bitem\.tone\b/)
  assert.doesNotMatch(activityFeedDomainSource, /\btone\??:|\btone:\s*['"]|\b\.tone\b/)
  assert.match(activityFeedSource, /item\.code[\s\S]*?<AgentActivityCodePanel title=\{item\.code\.label\}/)
  assert.match(activityFeedSource, /function AgentActivityDebugDetailView[\s\S]*?<AgentActivityCodePanel title="调试详情"/)
  assert.doesNotMatch(activityFeedSource, /rounded border border-border\/60 bg-background\/70/)
  assert.doesNotMatch(activityFeedSource, /rounded-md border-l-2 bg-muted\/25/)
  assert.doesNotMatch(activityFeedSource, /border-l-2 border-muted-foreground\/30 bg-muted\/15/)
  assert.doesNotMatch(activityFeedSource, /h-5 w-6 rounded bg-background\/90/)
  assert.doesNotMatch(activityFeedSource, /divide-y divide-border\/70/)
  assert.doesNotMatch(activityFeedSource, /border-l-2/)
  assert.doesNotMatch(activityFeedSource, /className="w-40"/)
  assert.doesNotMatch(activityFeedSource, /<pre\b/)
  assert.doesNotMatch(activityFeedSource, /max-h-48 overflow-auto whitespace-pre-wrap break-words px-2 py-1\.5 font-mono/)
  assert.doesNotMatch(activityFeedSource, /max-h-56 overflow-auto whitespace-pre-wrap break-words px-2 py-1\.5 font-mono/)
  assert.match(generatedResultSource, /AgentGeneratedMediaPreview/)
  assert.match(generatedResultSource, /AgentGeneratedMediaPreviewButton/)
  for (const exportName of [
    'AgentGeneratedCandidateActionButton',
    'AgentGeneratedCandidateBadge',
    'AgentGeneratedCandidateDialogBody',
    'AgentGeneratedCandidateDialogContent',
    'AgentGeneratedCandidateDialogControls',
    'AgentGeneratedCandidateDialogDescription',
    'AgentGeneratedCandidateDialogFooter',
    'AgentGeneratedCandidateDialogHeader',
    'AgentGeneratedCandidateDialogList',
    'AgentGeneratedCandidateDialogMain',
    'AgentGeneratedCandidateDialogSectionHeader',
    'AgentGeneratedCandidateDialogSidebar',
    'AgentGeneratedCandidateDialogTitle',
    'AgentGeneratedCandidateEmptyMessage',
    'AgentGeneratedCandidateEmptyState',
    'AgentGeneratedCandidateResourceBody',
    'AgentGeneratedCandidateResourceIcon',
    'AgentGeneratedCandidateResourceItem',
    'AgentGeneratedCandidateResourceMeta',
    'AgentGeneratedCandidateResourceName',
    'AgentGeneratedCandidateResourceRow',
    'AgentGeneratedCandidateSelectedTarget',
    'AgentGeneratedCandidateSearchInput',
    'AgentGeneratedCandidateStatusMessage',
    'AgentGeneratedCandidateTargetDescription',
    'AgentGeneratedCandidateTargetId',
    'AgentGeneratedCandidateTargetItem',
    'AgentGeneratedCandidateTargetList',
    'AgentGeneratedCandidateTargetListFrame',
    'AgentGeneratedCandidateTargetMeta',
    'AgentGeneratedCandidateTargetRow',
    'AgentGeneratedCandidateTargetTitle',
    'AgentGeneratedResultActionButton',
    'AgentGeneratedResultActions',
    'AgentGeneratedResultCard',
    'AgentGeneratedResultCountBadge',
    'AgentGeneratedResultHeader',
    'AgentGeneratedResultHelperText',
    'AgentGeneratedResultItem',
    'AgentGeneratedResultItemBody',
    'AgentGeneratedResultItemIcon',
    'AgentGeneratedResultItemMeta',
    'AgentGeneratedResultItemName',
    'AgentGeneratedResultItemRow',
    'AgentGeneratedResultList',
    'AgentGeneratedResultMissingNotice',
    'AgentGeneratedResultTitle',
    'AgentGeneratedViewerActionButton',
    'AgentGeneratedViewerBadge',
    'AgentGeneratedViewerSideActions',
    'AgentGeneratedViewerSideHeader',
    'AgentGeneratedViewerSidePanel',
  ]) {
    assert.match(generatedResultSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by generated result card`)
    assert.match(agentPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.doesNotMatch(generatedResultSource, /\b(?:AppTextEmptyState|Badge|Button|Input|WorkbenchList|WorkbenchListItem)\b/)
  assert.match(agentPackageSource, /AgentGeneratedCandidateSearchInput[\s\S]*?<Input/)
  assert.match(agentPackageSource, /AgentGeneratedCandidateTargetItem[\s\S]*?<WorkbenchListItem/)
  assert.match(agentPackageSource, /AgentGeneratedViewerActionButton[\s\S]*?<Button/)
  assert.match(agentPackageSource, /AgentGeneratedViewerBadge[\s\S]*?<Badge/)
  assert.match(generatedResultSource, /function GeneratedMediaPreview[\s\S]*?<AgentGeneratedMediaPreviewButton[\s\S]*?data-testid="agent-generated-media-preview"/)
  assert.match(generatedResultSource, /function GeneratedMediaPreview[\s\S]*?<AgentGeneratedMediaPreview data-testid="agent-generated-media-preview" surface="dark"/)
  assert.match(agentPackageSource, /export const AgentGeneratedMediaPreview/)
  assert.match(agentPackageSource, /export const AgentGeneratedMediaPreviewButton/)
  assert.match(agentCss, /\.ms-agent-generated-media-preview\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-media-preview--button\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-media-preview > img,[\s\S]*?\.ms-agent-generated-media-preview > \.ms-button__content > video\s*\{[\s\S]*object-fit:\s*contain/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-dialog\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-dialog__body\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-dialog__sidebar\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-resource-item\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-resource-item__row\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-target-list\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-target-row\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-selected-target\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-candidate-status-message\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-viewer-panel\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-result-card\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-result-card__header\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-result-item__row\s*\{/)
  assert.match(agentCss, /\.ms-agent-generated-result-missing-notice\s*\{/)
  assert.doesNotMatch(generatedResultSource, /<button\b/)
  assert.doesNotMatch(generatedResultSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(generatedResultSource, /\bSparkles\b/)
  assert.doesNotMatch(generatedResultSource, /\bDialogContent\b/)
  assert.doesNotMatch(generatedResultSource, /\bDialogHeader\b/)
  assert.doesNotMatch(generatedResultSource, /\bDialogTitle\b/)
  assert.doesNotMatch(generatedResultSource, /\bDialogDescription\b/)
  assert.doesNotMatch(generatedResultSource, /\bDialogFooter\b/)
  assert.doesNotMatch(generatedResultSource, /rounded border border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(generatedResultSource, /rounded border border-dashed border-border/)
  assert.doesNotMatch(generatedResultSource, /rounded border px-2 py-1\.5/)
  assert.doesNotMatch(generatedResultSource, /rounded-md border border-input bg-background/)
  assert.doesNotMatch(generatedResultSource, /rounded-md border border-border\/70 bg-(?:muted|black)/)
  assert.doesNotMatch(generatedResultSource, /h-56 max-h-\[45vh\] w-full object-contain/)
  assert.doesNotMatch(generatedResultSource, /max-h-\[88vh\] w-\[min\(880px,calc\(100vw-32px\)\)\] overflow-hidden p-0/)
  assert.doesNotMatch(generatedResultSource, /grid min-h-0 gap-0 md:grid-cols-\[260px_minmax\(0,1fr\)\]/)
  assert.doesNotMatch(generatedResultSource, /min-h-0 border-b border-border p-3 md:border-b-0 md:border-r/)
  assert.doesNotMatch(generatedResultSource, /max-h-\[48vh\] space-y-1\.5 overflow-auto pr-1/)
  assert.doesNotMatch(generatedResultSource, /flex h-full min-h-0 flex-col/)
  assert.doesNotMatch(generatedResultSource, /mt-2 max-h-\[42vh\] overflow-auto p-0/)
  assert.doesNotMatch(generatedResultSource, /px-3 py-6 text-center type-tiny text-muted-foreground/)
  assert.doesNotMatch(generatedResultSource, /rounded-none border-x-0 border-t-0 px-3 py-2 text-left last:border-b-0/)
  assert.doesNotMatch(generatedResultSource, /flex min-w-0 items-center justify-between gap-3/)
  assert.doesNotMatch(generatedResultSource, /border-primary\/25 bg-primary\/10 px-2 py-1\.5/)
  assert.doesNotMatch(generatedResultSource, /mt-2 type-micro leading-relaxed/)
  assert.doesNotMatch(generatedResultSource, /mb-2 flex min-w-0 items-center justify-between gap-2/)
  assert.doesNotMatch(generatedResultSource, /flex min-w-0 items-center gap-1\.5/)
  assert.doesNotMatch(generatedResultSource, /flex shrink-0 items-center gap-1/)
  assert.doesNotMatch(generatedResultSource, /space-y-1\.5/)
  assert.doesNotMatch(generatedResultSource, /px-2 py-1\.5/)
  assert.doesNotMatch(generatedResultSource, /flex min-w-0 items-center gap-2/)
  assert.doesNotMatch(generatedResultSource, /min-w-0 flex-1/)
  assert.doesNotMatch(generatedResultSource, /truncate type-tiny font-medium text-foreground/)
  assert.doesNotMatch(generatedResultSource, /truncate type-micro text-muted-foreground/)
  assert.doesNotMatch(generatedResultSource, /h-6 shrink-0 px-1\.5 type-micro/)
  assert.doesNotMatch(generatedResultSource, /mt-1\.5 px-2 py-1 type-micro leading-relaxed text-muted-foreground/)
  assert.doesNotMatch(generatedResultSource, /mt-2 type-tiny leading-relaxed text-muted-foreground/)
  assert.doesNotMatch(generatedResultSource, /mt-2 max-h-\[42vh\] overflow-auto rounded-md border border-border/)
  assert.match(composerSectionSource, /AgentSurfaceBlock/)
  assert.doesNotMatch(composerSectionSource, /rounded-md border border-border bg-muted\/25/)
  assert.doesNotMatch(composerSectionSource, /rounded border border-border\/60 bg-background\/60/)
  assert.match(agentRunSource, /<AgentRunSummaryCard data-testid="agent-run-summary"[\s\S]*?<AgentRunSummaryOverview>/)
  assert.match(agentRunSource, /\bAgentRunDebugCodeBlock\b/)
  assert.doesNotMatch(agentRunSource, /\bAppCodeBlock\b/)
  assert.match(agentRunSource, /\bAgentRunTraceSearchInput\b/)
  assert.doesNotMatch(agentRunSource, /\bInput\b/)
  assert.match(agentRunSource, /<AgentRunSidebarSurface data-testid="agent-run-taskGraph-context"/)
  assert.match(agentRunSource, /<AgentRunTraceEventCard data-testid="agent-run-trace-event"/)
  assert.match(agentRunSource, /data-testid="agent-run-attention-events"[\s\S]*?AgentRunDebugHotspotCard[\s\S]*?tone="warning"/)
  assert.match(agentRunSource, /data-testid="agent-run-trace-load-error"[\s\S]*?AgentRunCallout/)
  assert.match(agentRunSource, /data-testid="agent-run-detail-error"[\s\S]*?AgentRunCallout/)
  assert.match(agentRunSource, /\bAgentRunToneText\b/)
  assert.match(agentRunSource, /\bAgentRunToneSurfaceBlock\b/)
  assert.doesNotMatch(agentRunSource, /\b(?:ReviewCallout|toneTextClass|toneSurfaceClass)\b/)
  assert.match(agentRunSource, /function DebugCoverageMetric[\s\S]*?AgentRunDebugMetric/)
  assert.match(agentRunSource, /function DebugHotspotItem[\s\S]*?AgentRunDebugHotspotCard/)
  assert.match(agentRunSource, /function DebugReadinessChecklist[\s\S]*?AgentRunDebugPanel/)
  assert.match(agentRunSource, /function ToolCallPreviewBlock[\s\S]*?AgentRunDebugCodeBlock/)
  assert.match(agentRunSource, /function ModelDetailSection[\s\S]*?AgentRunTraceDisclosure/)
  assert.match(agentRunSource, /function MessageDetail[\s\S]*?AgentRunTraceContextGroup/)
  assert.match(agentRunSource, /function ToolDetail[\s\S]*?AgentRunDebugStack/)
  assert.match(agentRunSource, /<AgentRunChildRunButton[\s\S]*?data-testid="agent-run-child-run"/)
  assert.match(agentRunSource, /<AgentRunTraceCategoryButton[\s\S]*?data-testid="agent-run-trace-category-filter"[\s\S]*?<AgentRunPageBadge/)
  assert.match(agentRunSource, /data-testid="agent-run-trace-view-mode"[\s\S]*?<AgentRunTraceViewModeButton[\s\S]*?setTraceViewMode\('debug'\)[\s\S]*?<AgentRunTraceViewModeButton[\s\S]*?setTraceViewMode\('timeline'\)[\s\S]*?<AgentRunTraceViewModeButton[\s\S]*?setTraceViewMode\('tools'\)[\s\S]*?<AgentRunTraceViewModeButton[\s\S]*?setTraceViewMode\('skills'\)/)
  assert.match(agentRunSource, /<AgentRunTraceSearchInput[\s\S]*?data-testid="agent-run-trace-search"/)
  assert.match(agentRunSource, /<AgentRunTraceEventActionButton[\s\S]*?data-testid="agent-run-skill-trace-event"/)
  assert.doesNotMatch(agentRunSource, /<button\b/)
  assert.doesNotMatch(agentRunSource, /<input\b/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-child-run"[\s\S]{0,160}hover:bg-muted\/30/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-child-run"[\s\S]{0,160}rounded-md/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-trace-view-mode"[\s\S]{0,900}hover:bg-muted\/40/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-trace-search"[\s\S]{0,180}rounded-md border border-input bg-background/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-skill-trace-event"[\s\S]{0,160}hover:bg-muted\/20/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-summary"[^>]+rounded border border-border\/70 bg-muted\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-taskGraph-context"[^>]+rounded border border-border\/70 bg-muted\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-trace-load-error"[^>]+rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-detail-error"[^>]+rounded border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-trace-empty-state"[^>]+rounded-md border border-border\/70 bg-muted\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-(?:prompt|model|message|tool)-detail"[^>]+rounded border border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-debug-bundle-contract"[^>]+rounded border border-border\/60 bg-background\/80/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-debug-readiness"[^>]+rounded border border-border\/60 bg-background\/80/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-attention-events"[^>]+rounded-md border px-3 py-2/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-tool-call-empty"[^>]+rounded-md border border-border\/70 bg-muted\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-model-call-summary-item"[^>]+rounded border border-border\/70 bg-background/)
  assert.doesNotMatch(agentRunSource, /<pre\b/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-model-call-inline-http-detail"[^>]+rounded border border-border\/60 bg-muted\/10/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-prompt-part-groups"[^>]+rounded border border-border\/60 bg-background\/90/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-model-request-headers"[^>]+rounded bg-muted\/20/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-model-response-headers"[^>]+rounded bg-muted\/20/)
  assert.doesNotMatch(agentRunSource, /data-testid="agent-run-tool-args"[^>]+rounded border border-border\/60 bg-background\/90/)
  assert.match(agentDebugSource, /\bAgentDebugNativeSelect\b/)
  assert.match(readProjectFile('packages/ui/src/components/business/agent/debug/index.tsx'), /function AgentDebugNativeSelect[\s\S]*?<NativeSelect/)
  assert.doesNotMatch(agentDebugSource, /<select\b/)
  assert.doesNotMatch(sources, /function MiniStat/)
})

test('jobs status badges use package semantic status contracts', () => {
  const jobsSource = readProjectFile('apps/frontend/src/features/jobs/components/JobsPage.tsx')
  const jobsSemanticUiSource = readProjectFile('apps/frontend/src/features/jobs/presentation/jobsSemanticUi.ts')
  const primitiveBadgeSource = readProjectFile('packages/ui/src/components/primitives/badge.tsx')
  const jobsPackageSource = readJobsSource()
  const jobsPackageCss = readJobsCss()
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
  assert.match(jobsPackageSource, /export function JobsPageShell/)
  assert.match(jobsPackageSource, /export function JobsActionButton/)
  assert.match(jobsPackageSource, /export function JobsLoadingState/)
  assert.match(jobsPackageSource, /export function JobDetailCodeBlock/)
  assert.match(jobsPackageSource, /export function JobDetailKeyValue/)
  assert.match(jobsPackageSource, /export function JobCardShell/)
  assert.match(jobsPackageSource, /export function JobGridMediaPreview/)
  assert.match(jobsPackageSource, /export function JobListMediaPreview/)
  assert.match(jobsPackageSource, /export function JobStatusBadge/)
  assert.match(jobsPackageSource, /export function JobSpinIcon/)
  assert.match(jobsPackageSource, /StatusBadgeProps/)
  assert.match(jobsPackageSource, /\.\.\.statusProps/)
  assert.match(jobsSemanticUiSource, /jobStatusRecipe/)
  assert.match(jobsSource, /jobStatusRecipe\(status\)/)
  assert.doesNotMatch(jobsSource, /<JobStatusBadge\b[^>]*\btone=/)
  assert.match(jobsPackageSource, /export const JobsFilterChipButton/)
  assert.match(jobsPackageSource, /export const JobsPagerButton/)
  assert.match(jobsPackageCss, /\.jobs-header\s*\{/)
  assert.match(jobsPackageCss, /\.jobs-header-status\s*\{/)
  assert.match(jobsPackageCss, /\.jobs-filter-chip-button\s*\{/)
  assert.match(jobsPackageCss, /\.jobs-loading-state\s*\{/)
  assert.match(jobsPackageCss, /\.jobs-action-button\s*\{/)
  assert.match(jobsPackageCss, /\.jobs-pager-button\s*\{/)
  assert.match(jobsPackageCss, /\.job-spin-icon\s*\{/)
  assert.match(jobsPackageCss, /\.job-list-media-area__preview\s*\{/)
  assert.match(jobsPackageCss, /\.job-list-media-area__preview > \*\s*\{[\s\S]*border-radius:\s*0/)
  assert.match(jobsPackageCss, /\.job-grid-media-area\s*\{/)
  assert.match(jobsPackageCss, /\.job-grid-media-area > \.job-grid-media-area__preview\s*\{/)
  assert.match(jobsPackageCss, /\.jobs-pager\s*\{/)
  assert.match(jobsSource, /\bJobDetailKeyValue\b/)
  assert.match(jobsPackageSource, /function JobDetailKeyValue[\s\S]*?<AppKeyValue/)
  assert.match(jobsSource, /JobsEmptyState/)
  assert.match(jobsPackageSource, /function JobsEmptyState[\s\S]*?<AppEmptyState/)
  assert.match(jobsSource, /\bJobDetailCodeBlock\b/)
  assert.match(jobsPackageSource, /function JobDetailCodeBlock[\s\S]*?<AppCodeBlock/)
  assert.match(jobsSource, /\bJobsActionButton\b/)
  assert.match(jobsPackageSource, /function JobsActionButton[\s\S]*?<Button/)
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
  const scriptsSource = readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPage.tsx')
  const scriptsSemanticUiSource = readProjectFile('apps/frontend/src/features/scripts/presentation/scriptsSemanticUi.ts')
  const scriptFormSource = readProjectFile('apps/frontend/src/features/scripts/components/ScriptForm.tsx')
  const entityCreateFormsSource = readProjectFile('apps/frontend/src/shared/ui/EntityCreateForms.tsx')
  const businessIndexSource = readProjectFile('packages/ui/src/components/business/index.ts')
  const scriptsPackageSource = readProjectFile('packages/ui/src/components/business/scripts/index.tsx')
  const scriptsPackageCss = readProjectFile('packages/ui/src/components/business/scripts/styles.css')
  const scriptsCreateFormSource = readProjectFile('packages/ui/src/components/business/scripts/create-form/index.tsx')
  const scriptsCreateFormCss = readProjectFile('packages/ui/src/components/business/scripts/create-form/styles.css')
  const scriptsDetailHeaderSource = readProjectFile('packages/ui/src/components/business/scripts/detail-header/index.tsx')
  const scriptsDetailHeaderCss = readProjectFile('packages/ui/src/components/business/scripts/detail-header/styles.css')
  const scriptsTabsSource = readProjectFile('packages/ui/src/components/business/scripts/tabs/index.tsx')
  const scriptsTabsCss = readProjectFile('packages/ui/src/components/business/scripts/tabs/styles.css')
  const scriptsLibrarySource = readScriptsLibrarySource()
  const scriptsLibraryCss = readScriptsLibraryCss()
  const scriptsVersionSource = readProjectFile('packages/ui/src/components/business/scripts/version/index.tsx')
  const scriptsVersionCss = readProjectFile('packages/ui/src/components/business/scripts/version/styles.css')
  const scriptsPagePackageSource = readProjectFile('packages/ui/src/components/business/scripts/page/index.tsx')
  const scriptsPagePackageCss = readProjectFile('packages/ui/src/components/business/scripts/page/styles.css')
  const rawPanelShellPattern = /rounded-md border border-border bg-background p-3/

  for (const exportName of ['ScriptWorkspaceShell', 'ScriptWorkspaceLayout', 'ScriptWorkspaceMain', 'ScriptWorkspaceInspector', 'ScriptWorkspaceStat', 'ScriptMetricBox', 'ScriptVersionHistoryPanel', 'ScriptVersionEmptyState', 'ScriptProductionPanel', 'ScriptProductionNotice', 'ScriptCollaborationStack', 'ScriptAgentAssistPanel', 'ScriptReadinessPanel', 'ScriptPipelinePanel', 'ScriptWorkflowPanel', 'ScriptVersionBlockShell', 'ScriptVersionLineEditor', 'ScriptBlockCard', 'ScriptBlockSelectField', 'ScriptDetailHeader', 'ScriptDetailTabs', 'ScriptLibraryEmptyState', 'ScriptLibraryGroup', 'ScriptLibraryItem', 'ScriptLibraryRail', 'ScriptVersionCard', 'StatusBadge', 'Badge']) {
    assert.match(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scripts workspace`)
  }
  for (const exportName of ['AppPanel', 'AppProgressBar', 'AppMetricCard', 'AppKeyValue', 'AppEmptyState', 'AppStateMessage', 'AppSurfaceItem', 'NativeSelect', 'Textarea']) {
    assert.doesNotMatch(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by scripts package components, not ScriptsPage`)
    assert.match(scriptsPagePackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed inside scripts page package`)
  }
  for (const exportName of [
    'ScriptEditorActionButton',
    'ScriptEditorBodyGrid',
    'ScriptEditorBodyTextarea',
    'ScriptEditorErrorText',
    'ScriptEditorFieldLabel',
    'ScriptEditorFormShell',
    'ScriptEditorHelperText',
    'ScriptEditorHiddenFileInput',
    'ScriptEditorInlineMeta',
    'ScriptEditorInput',
    'ScriptEditorMainField',
    'ScriptEditorSidePanel',
    'ScriptEditorSideRail',
    'ScriptEditorStrongText',
    'ScriptEditorSummaryTextarea',
    'ScriptEditorToolbar',
    'ScriptEditorToolbarGroup',
    'ScriptEditorVersionState',
    'ScriptEditorVersionSubtitle',
    'ScriptEditorVersionTitle',
  ]) {
    assert.match(scriptFormSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ScriptForm`)
    assert.match(scriptsPagePackageSource, new RegExp(`export (?:function|const) ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(businessIndexSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be exported from @movscript/ui`)
  }
  assert.match(scriptFormSource, /<ScriptEditorHiddenFileInput[\s\S]*?ref=\{fileInputRef\}[\s\S]*?type="file"/)
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
  assert.match(scriptsCreateFormSource, /export function ScriptCreateFormShell/)
  assert.match(scriptsCreateFormSource, /\bLabel\b/)
  assert.match(scriptsCreateFormSource, /\bInput\b/)
  assert.match(scriptsCreateFormSource, /\bTextarea\b/)
  assert.match(scriptsCreateFormSource, /\bButton\b/)
  assert.match(scriptsCreateFormCss, /\.script-create-form\s*\{/)
  assert.match(scriptsPackageSource, /from "\.\/detail-header"/)
  assert.match(scriptsPackageSource, /from "\.\/create-form"/)
  assert.match(scriptsPackageSource, /from "\.\/tabs"/)
  assert.match(scriptsPackageSource, /from "\.\/library"/)
  assert.match(scriptsPackageSource, /from "\.\/version"/)
  assert.match(scriptsPackageSource, /from "\.\/page"/)
  assert.match(scriptsPackageCss, /@import "\.\/detail-header\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/create-form\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/tabs\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/library\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/version\/styles\.css";/)
  assert.match(scriptsPackageCss, /@import "\.\/page\/styles\.css";/)
  assert.match(scriptsDetailHeaderSource, /export function ScriptDetailHeader/)
  assert.match(scriptsTabsSource, /export function ScriptDetailTabs/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryRail/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryEmptyState/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryGroup/)
  assert.match(scriptsLibrarySource, /export function ScriptLibraryItem/)
  assert.match(scriptsVersionSource, /export function ScriptVersionCard/)
  assert.match(scriptsDetailHeaderCss, /\.script-detail-header\s*\{/)
  assert.match(scriptsTabsCss, /\.script-detail-tabs\s*\{/)
  assert.match(scriptsLibraryCss, /\.script-library-rail\s*\{/)
  assert.match(scriptsLibraryCss, /\.script-library-empty\s*\{/)
  assert.match(scriptsLibraryCss, /\.script-library-group\s*\{/)
  assert.match(scriptsLibraryCss, /\.script-library-item\s*\{/)
  assert.match(scriptsVersionCss, /\.script-version-card\s*\{/)
  for (const componentName of ['ScriptWorkspaceShell', 'ScriptVersionHistoryPanel', 'ScriptProductionPanel', 'ScriptReadinessPanel', 'ScriptVersionLineEditor', 'ScriptBlockCard', 'ScriptBlockSelectField']) {
    assert.match(scriptsPagePackageSource, new RegExp(`export function ${componentName}\\b`), `${componentName} must be package-owned`)
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
    assert.match(scriptsPagePackageCss, new RegExp(`\\.${selector}\\b`), `${selector} styles must be package-owned`)
  }

  assert.match(scriptsPagePackageSource, /function ScriptWorkspaceStat[\s\S]*?AppMetricCard/)
  assert.match(scriptsPagePackageSource, /function ScriptPipelineMetric[\s\S]*?AppMetricCard/)
  assert.match(scriptsPagePackageSource, /function ScriptMetricBox[\s\S]*?AppMetricCard/)
  assert.match(scriptsSource, /function VersionStatusBadge[\s\S]*?StatusBadge/)
  assert.match(scriptsSource, /function ScriptStageBadge[\s\S]*?StatusBadge/)
  assert.match(scriptsSource, /function ScriptTypeBadge[\s\S]*?Badge/)
  for (const recipeName of [
    'scriptLibraryStatusRecipe',
    'scriptReadinessRecipe',
    'scriptVersionStatusRecipe',
    'scriptStageRecipe',
    'scriptReadinessItemRecipe',
  ]) {
    assert.match(scriptsSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be script semantic UI-owned`)
    assert.match(scriptsSource, new RegExp(`\\b${recipeName}\\b`), `${recipeName} must be consumed by scripts workspace`)
  }
  assert.match(scriptsLibrarySource, /statusProps\?: StatusDotProps/)
  assert.match(scriptsLibrarySource, /<StatusDot[\s\S]*?\{\.\.\.statusVisualProps\}/)
  assert.doesNotMatch(scriptsLibrarySource, /\bstatusTone\b/)
  assert.doesNotMatch(scriptsLibrarySource, /<StatusDot\b[^>]*\btone=/)
  assert.match(scriptsSource, /<ScriptLibraryItem[\s\S]*?statusProps=\{scriptLibraryStatusRecipe\(hasVersions, bodyLength\)\}/)
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
  assert.match(scriptsSource, /<ScriptDetailHeader[\s\S]*?badges=\{\([\s\S]*?<ScriptTypeBadge[\s\S]*?metrics=\{\(/)
  assert.match(scriptsSource, /<ScriptDetailTabs[\s\S]*?activeKey=\{detailTab\}[\s\S]*?onSelect=\{\(key\) => setDetailTab\(key as ScriptDetailTab\)\}/)
  assert.match(scriptsSource, /<ScriptLibraryRail[\s\S]*?<ScriptLibraryEmptyState[\s\S]*?<ScriptLibraryGroup[\s\S]*?<ScriptLibraryItem/)
  assert.match(scriptsSource, /<ScriptVersionCard[\s\S]*?versionLabel=\{`v\$\{version\.version_number \|\| version\.ID\}`\}[\s\S]*?toggleLabel=/)
  assert.match(scriptsSource, /latestVersion[\s\S]*?<ScriptProductionNotice title="将使用最新版本"/)
  assert.match(scriptsSource, /<ScriptWorkflowStepUi index="01" title="完善正文"/)
  assert.match(scriptsPagePackageSource, /function ScriptProductionNotice[\s\S]*?<AppStateMessage tone="neutral"/)
  assert.match(scriptsPagePackageSource, /function ScriptWorkflowStep[\s\S]*?<AppSurfaceItem[\s\S]*variant="muted"/)
  assert.doesNotMatch(scriptFormSource, /rounded-lg border border-border bg-card/)
})

test('resources and pre-production inspector use package menu and empty primitives', () => {
  const toasterSource = readProjectFile('apps/frontend/src/components/ui/Toaster.tsx')
  const adminToasterSource = readProjectFile('apps/admin/src/components/ui/Toaster.tsx')
  const resourcesSource = readProjectFile('apps/frontend/src/features/resources/components/ResourcesPage.tsx')
  const preProductionSource = readProjectFile('apps/frontend/src/features/pre-production/components/PreProductionPage.tsx')
  const preProductionBoardSource = readProjectFile('apps/frontend/src/features/pre-production/components/PreProductionAssetBoard.tsx')
  const preProductionAssetDetailSource = readProjectFile('apps/frontend/src/features/pre-production/components/PreProductionAssetDetail.tsx')
  const productionTerminologySource = readProjectFile('apps/frontend/src/shared/domain/productionTerminology.ts')
  const preProductionSemanticUiSource = readProjectFile('apps/frontend/src/features/pre-production/presentation/preProductionSemanticUi.ts')
  const resourceCandidateAttachSource = readProjectFile('apps/frontend/src/shared/ui/ResourceCandidateAttachPanel.tsx')
  const resourceLibraryPickerSource = readProjectFile('apps/frontend/src/shared/ui/ResourceLibraryPicker.tsx')
  const resourceAttachmentsSource = readProjectFile('apps/frontend/src/shared/ui/ResourceAttachments.tsx')
  const authedMediaSource = readProjectFile('apps/frontend/src/shared/ui/AuthedImage.tsx')
  const mediaViewerSource = readProjectFile('apps/frontend/src/shared/ui/MediaViewer.tsx')
  const resourcePanelSource = readProjectFile('apps/frontend/src/shared/ui/ResourcePanel.tsx')
  const scriptPanelSource = readProjectFile('apps/frontend/src/shared/ui/ScriptPanel.tsx')
  const resourceCss = readResourceCss()
  const resourceLibraryPickerPackageSource = readResourceLibraryPickerSource()
  const resourceLibraryPickerPackageCss = readResourceLibraryPickerCss()
  const resourceAttachmentsPackageSource = readProjectFile('packages/ui/src/components/business/resource/attachments/index.tsx')
  const resourceAttachmentsPackageCss = readProjectFile('packages/ui/src/components/business/resource/attachments/styles.css')
  const resourceAssetCandidatePackageSource = readProjectFile('packages/ui/src/components/business/resource/asset-candidate/index.tsx')
  const resourceAssetCandidatePackageCss = readProjectFile('packages/ui/src/components/business/resource/asset-candidate/styles.css')
  const resourceCandidateAttachPackageSource = readResourceCandidateAttachSource()
  const resourceCandidateAttachPackageCss = readResourceCandidateAttachCss()
  const resourceMediaViewerPackageSource = readResourceMediaViewerSource()
  const resourceMediaViewerPackageCss = readResourceMediaViewerCss()
  const resourcePanelPackageSource = readResourcePanelSource()
  const resourcePanelPackageCss = readResourcePanelCss()
  const resourcePagePackageSource = readProjectFile('packages/ui/src/components/business/resource/page/index.tsx')
  const resourcePagePackageCss = readProjectFile('packages/ui/src/components/business/resource/page/styles.css')
  const scriptReferenceSource = readResourceScriptReferenceSource()
  const scriptReferenceCss = readResourceScriptReferenceCss()
  const resourceAuthMediaPackageSource = readProjectFile('packages/ui/src/components/business/resource/auth-media/index.tsx')
  const appToastPackageSource = readProjectFile('packages/ui/src/components/business/app/toast/index.tsx')

  for (const exportName of ['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuTrigger', 'DropdownMenuSeparator', 'Dialog']) {
    assert.match(resourcesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by resources page`)
  }
  for (const exportName of ['ResourceAssetActionButton', 'ResourceAssetCard', 'ResourceAssetName', 'ResourceAssetPreviewFallback', 'ResourceAssetSelectCheckbox', 'ResourceClipModeGroup', 'ResourceClipSummary', 'ResourceClipControls', 'ResourceClipExpectedPath', 'ResourceClipFooter', 'ResourceClipHint', 'ResourceClipLayout', 'ResourceClipMain', 'ResourceClipProgress', 'ResourceClipRangeTrack', 'ResourceClipRangeInput', 'ResourceClipSidebar', 'ResourceClipStageFrame', 'ResourceClipStageState', 'ResourceClipStageText', 'ResourceClipStatusText', 'ResourceClipTime', 'ResourceContextMenu', 'ResourceContextMenuButton', 'ResourceDangerMenuItem', 'ResourceDialogCloseButton', 'ResourceDialogContent', 'ResourceDialogField', 'ResourceDialogFieldLabel', 'ResourceDialogFooter', 'ResourceDialogHeader', 'ResourceDialogInput', 'ResourceDialogScrollArea', 'ResourceDialogSelect', 'ResourceDialogStack', 'ResourceDialogText', 'ResourceDialogTitle', 'ResourceFolderOption', 'ResourceFolderTreeItem', 'ResourceMediaFillFrame', 'ResourcePageActionButton', 'ResourcePageActionGroup', 'ResourcePageAssetGrid', 'ResourcePageContent', 'ResourcePageFilterBar', 'ResourcePageLayout', 'ResourcePageListCheckbox', 'ResourcePageListRow', 'ResourcePagePager', 'ResourcePermissionActionGroup', 'ResourcePermissionEmpty', 'ResourcePermissionSection', 'ResourcePermissionShareRow', 'ResourcePermissionUserRow', 'ResourceSharedIndicator', 'ResourceStateMessage', 'Switch']) {
    assert.match(resourcesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by resources page`)
  }
  for (const exportName of ['AppContentLayout', 'AppControlGroup', 'AppMediaFrame', 'AppRangeTrack', 'AppStateMessage', 'AppSurfaceItem', 'Button', 'CheckboxField', 'DialogClose', 'DialogContent', 'DialogFooter', 'DialogTitle', 'DropdownMenuItem', 'Input', 'Progress', 'RangeInput', 'WorkbenchListItem', 'WorkbenchSurfaceItem', 'accentTextClass', 'toneTextClass']) {
    assert.match(resourcePagePackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package resource page components`)
  }
  for (const exportName of ['AppContentLayout', 'AppMediaFrame', 'AppRangeTrack', 'AppStateMessage', 'AppSurfaceItem', 'AppControlGroup', 'Button', 'CheckboxField', 'DialogClose', 'DialogContent', 'DialogFooter', 'DialogTitle', 'Input', 'NativeSelect', 'Progress', 'RangeInput', 'WorkbenchListItem', 'WorkbenchSurfaceItem', 'accentTextClass', 'toneTextClass', 'resourceDangerTextClass']) {
    assert.doesNotMatch(resourcesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be directly consumed by resources page`)
  }
  assert.match(resourceCss, /@import "\.\/page\/styles\.css";/)
  for (const componentName of ['ResourceAssetActionButton', 'ResourceAssetName', 'ResourceAssetPreviewFallback', 'ResourceDangerMenuItem', 'ResourcePageLayout', 'ResourcePageSidebar', 'ResourcePageActionGroup', 'ResourcePageSearchField', 'ResourcePageFilterBar', 'ResourcePageAssetGrid', 'ResourcePageListRow', 'ResourceFolderOption', 'ResourceFolderTreeItem', 'ResourcePermissionEmpty', 'ResourcePermissionSection', 'ResourcePermissionShareRow', 'ResourcePermissionUserRow', 'ResourceClipControls', 'ResourceClipRangeTrack', 'ResourceClipStageFrame', 'ResourceClipStageText', 'ResourceClipStatusText', 'ResourceClipSummary', 'ResourceSharedIndicator', 'ResourceStateMessage', 'ResourceContextMenu', 'ResourceListSurfaceItem']) {
    assert.match(resourcePagePackageSource, new RegExp(`export function ${componentName}\\b`), `${componentName} must be package-owned`)
  }
  for (const selector of ['resource-page', 'resource-page__sidebar', 'resource-page__filter-bar', 'resource-page__asset-grid', 'resource-asset-card__action-button', 'resource-folder-tree-item', 'resource-permission-empty', 'resource-permission-section', 'resource-permission-share-row', 'resource-permission-user-row', 'resource-clip-range-track', 'resource-clip-stage-text', 'resource-clip-status-text', 'resource-clip-summary', 'resource-shared-indicator', 'resource-state-message', 'resource-context-menu', 'resource-list-surface-item']) {
    assert.match(resourcePagePackageCss, new RegExp(`\\.${selector}\\b`), `${selector} styles must be package-owned`)
  }
  for (const exportName of ['AppPager', 'AppPanel', 'Button', 'Input', 'Label', 'NativeSelect', 'WorkbenchListItem', 'WorkbenchThumbnail']) {
    assert.match(resourceLibraryPickerPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package resource library picker`)
  }
  assert.match(resourceLibraryPickerSource, /\bResourceLibraryPickerPanel\b/, 'ResourceLibraryPicker must delegate visual shell to package UI')
  assert.match(resourceLibraryPickerPackageSource, /export function ResourceLibraryPickerPanel/)
  assert.match(resourceLibraryPickerPackageCss, /\.resource-library-picker\s*\{/)
  assert.match(resourceLibraryPickerPackageCss, /\.resource-library-picker__row\s*\{/)
  assert.match(resourceLibraryPickerPackageCss, /\.resource-library-picker__thumbnail > \*\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/)
  assert.match(authedMediaSource, /\bResourceAuthImage\b/, 'AuthedImage must delegate image shell to package UI')
  assert.match(authedMediaSource, /\bResourceAuthVideo\b/, 'AuthedVideo must delegate video shell to package UI')
  assert.match(authedMediaSource, /\bResourceAuthAudio\b/, 'AuthedAudio must delegate audio shell to package UI')
  assert.doesNotMatch(authedMediaSource, /bg-muted animate-pulse/)
  assert.match(resourceAuthMediaPackageSource, /export function ResourceAuthImage/)
  assert.match(resourceAuthMediaPackageSource, /export function ResourceAuthVideo/)
  assert.match(resourceAuthMediaPackageSource, /export function ResourceAuthAudio/)
  assert.match(resourceCss, /\.resource-auth-media-placeholder\s*\{/)
  for (const exportName of [
    'ResourceAssetCandidateActionButton',
    'ResourceAssetCandidateActions',
    'ResourceAssetCandidateBody',
    'ResourceAssetCandidateCard',
    'ResourceAssetCandidateContent',
    'ResourceAssetCandidateList',
    'ResourceAssetCandidateMeta',
    'ResourceAssetCandidateStatus',
    'ResourceAssetCandidateThumb',
    'ResourceAssetCandidateTitle',
  ]) {
    assert.match(preProductionAssetDetailSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by pre-production asset detail`)
    assert.match(resourceAssetCandidatePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(resourceCss, /@import "\.\/asset-candidate\/styles\.css";/)
  assert.match(resourceAssetCandidatePackageSource, /\bWorkbenchSurfaceItem\b/)
  assert.match(resourceAssetCandidatePackageSource, /\bStatusBadge\b/)
  assert.match(resourceAssetCandidatePackageCss, /\.resource-asset-candidate-list\s*\{/)
  assert.match(resourceAssetCandidatePackageCss, /\.resource-asset-candidate-card__thumb > \*\s*\{/)
  assert.match(resourceAssetCandidatePackageCss, /\.resource-asset-candidate-card__actions\s*\{/)
  assert.doesNotMatch(preProductionAssetDetailSource, /\b(?:WorkbenchSurfaceItem|WorkbenchStatusBadge)\b/)
  assert.doesNotMatch(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?className="p-2"/)
  assert.doesNotMatch(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?className="flex gap-2"/)
  assert.doesNotMatch(preProductionAssetDetailSource, /function CandidateRow[\s\S]*?className="mt-2 grid grid-cols-2 gap-1\.5"/)
  for (const exportName of [
    'ResourceCandidateAttachBody',
    'ResourceCandidateAttachControls',
    'ResourceCandidateAttachFooter',
    'ResourceCandidateAttachHeader',
    'ResourceCandidateAttachMessage',
    'ResourceCandidateAttachShell',
    'ResourceCandidateAttachSubmit',
    'ResourceCandidateEmpty',
    'ResourceCandidateItem',
    'ResourceCandidateList',
    'ResourceCandidateSearchInput',
    'ResourceCandidateSelectedTarget',
    'ResourceCandidateTargetEmpty',
    'ResourceCandidateTargetItem',
    'ResourceCandidateTargetList',
    'ResourceCandidateTargetTypeSelect',
  ]) {
    assert.match(resourceCandidateAttachSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by resource candidate attach panel`)
  }
  for (const exportName of ['AppTextEmptyState', 'Badge', 'Button', 'Input', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue', 'WorkbenchList', 'WorkbenchListItem', 'WorkbenchSurfaceItem']) {
    assert.match(resourceCandidateAttachPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package resource candidate attach`)
    assert.doesNotMatch(resourceCandidateAttachSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be directly consumed by frontend resource candidate attach panel`)
  }
  assert.match(resourceCss, /@import "\.\/candidate-attach\/styles\.css";/)
  assert.match(resourceCandidateAttachPackageSource, /export function ResourceCandidateAttachShell/)
  assert.match(resourceCandidateAttachPackageSource, /export function ResourceCandidateTargetTypeSelect/)
  assert.match(resourceCandidateAttachPackageCss, /\.resource-candidate-attach\s*\{/)
  assert.match(resourceCandidateAttachPackageCss, /\.resource-candidate-target-item\s*\{/)
  for (const exportName of [
    'ResourceAttachmentActionTile',
    'ResourceAttachmentFallback',
    'ResourceAttachmentGrid',
    'ResourceAttachmentHiddenInput',
    'ResourceAttachmentRemoveButton',
    'ResourceAttachmentRoot',
    'ResourceAttachmentTile',
  ]) {
    assert.match(resourceAttachmentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by resource attachments`)
  }
  for (const exportName of ['AppMediaFrame', 'AppSurfaceItem', 'Button']) {
    assert.match(resourceAttachmentsPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package resource attachments`)
    assert.doesNotMatch(resourceAttachmentsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be directly consumed by frontend resource attachments`)
  }
  assert.match(resourceAttachmentsPackageSource, /export function ResourceAttachmentRoot/)
  assert.match(resourceAttachmentsPackageSource, /export function ResourceAttachmentTile/)
  assert.match(resourceAttachmentsPackageSource, /ResourceAttachmentHiddenInput/)
  assert.match(resourceAttachmentsPackageCss, /\.resource-attachments\s*\{/)
  assert.match(resourceAttachmentsPackageCss, /\.resource-attachment-remove\s*\{/)
  assert.match(resourceCss, /\.resource-asset-card__select-control\s*\{/)
  assert.match(resourceCss, /\.resource-asset-card__select-control \.ms-checkbox-field__input\s*\{/)
  assert.match(resourceCss, /@import "\.\/panel\/styles\.css";/)
  assert.match(resourcePanelPackageSource, /export function ResourcePanelShell/)
  assert.match(resourcePanelPackageSource, /export const ResourcePanelSearchField/)
  assert.match(resourcePanelPackageSource, /export const ResourceListItemShell/)
  assert.match(resourcePanelPackageSource, /export function ResourceAssetSlotCard/)
  assert.match(resourcePanelPackageCss, /\.resource-panel\s*\{/)
  assert.match(resourcePanelPackageCss, /\.resource-panel-list-item\s*\{/)
  assert.match(resourcePanelPackageCss, /\.resource-panel-asset-slot\s*\{/)
  assert.doesNotMatch(resourceAttachmentsSource, /<input\b/)
  assert.doesNotMatch(resourceAttachmentsSource, /className="hidden"/)
  assert.doesNotMatch(resourceAttachmentsSource, /grid grid-cols-2 gap-2/)
  assert.doesNotMatch(resourceAttachmentsSource, /flex items-center gap-2 flex-wrap/)
  for (const exportName of [
    'ResourceAssetSlotCard',
    'ResourceAssetSlotDragButton',
    'ResourceListItemShell',
    'ResourcePanelContent',
    'ResourcePanelEmptyState',
    'ResourcePanelFilters',
    'ResourcePanelItemName',
    'ResourcePanelList',
    'ResourcePanelPager',
    'ResourcePanelSearchField',
    'ResourcePanelSegmentButton',
    'ResourcePanelSegmentGroup',
    'ResourcePanelSelect',
    'ResourcePanelShell',
    'ResourcePanelTabButton',
    'ResourcePanelThumb',
    'ResourcePanelThumbFallback',
  ]) {
    assert.match(resourcePanelSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by resource panel`)
  }
  for (const exportName of ['AppControlGroup', 'AppMediaFrame', 'AppPager', 'AppSurfaceItem', 'AppTextEmptyState', 'Button', 'Input', 'NativeSelect']) {
    assert.match(resourcePanelPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package resource panel`)
    assert.doesNotMatch(resourcePanelSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be directly consumed by frontend resource panel`)
  }
  assert.doesNotMatch(resourcePanelSource, /<button\b/)
  assert.doesNotMatch(resourcePanelSource, /<input\b/)
  assert.doesNotMatch(resourcePanelSource, /<select\b/)
  assert.doesNotMatch(resourcePanelSource, /w-56 shrink-0 border-r border-border/)
  assert.doesNotMatch(resourcePanelSource, /className="(?:w-full h-full|h-full w-full)"/)
  assert.doesNotMatch(resourcePanelSource, /flex cursor-pointer items-center gap-2 px-2 py-1\.5/)
  for (const exportName of [
    'ResourceMediaAudioPanel',
    'ResourceMediaCodeBlock',
    'ResourceMediaDialog',
    'ResourceMediaFallbackPanel',
    'ResourceMediaFillFrame',
    'ResourceMediaHoverOverlay',
    'ResourceMediaTextPreviewPanel',
    'ResourceMediaTextThumb',
    'ResourceMediaThumb',
  ]) {
    assert.match(mediaViewerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by media viewer`)
  }
  for (const exportName of ['AppCodeBlock', 'AppMediaFrame', 'AppSurfaceItem', 'Button', 'Dialog', 'DialogContent', 'DialogOverlay', 'DialogPortal']) {
    assert.match(resourceMediaViewerPackageSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package media viewer`)
    assert.doesNotMatch(mediaViewerSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not be directly consumed by frontend media viewer`)
  }
  assert.match(resourceMediaViewerPackageSource, /export function ResourceMediaDialog/)
  assert.match(resourceMediaViewerPackageSource, /export function ResourceMediaThumb/)
  assert.match(resourceMediaViewerPackageSource, /export function ResourceMediaTextPreviewPanel/)
  assert.match(resourceMediaViewerPackageSource, /export type ResourceMediaFit/)
  assert.match(resourceMediaViewerPackageSource, /data-fit=\{fit\}/)
  assert.match(resourcesSource, /<ResourceMediaFillFrame fit="contain">[\s\S]*?<video/)
  assert.doesNotMatch(resourcesSource, /\bh-full w-full object-contain\b/)
  assert.match(resourceMediaViewerPackageCss, /\.resource-media-dialog\s*\{/)
  assert.match(resourceMediaViewerPackageCss, /\.resource-media-hover-overlay\s*\{/)
  assert.match(resourceMediaViewerPackageCss, /\.resource-media-text-preview\s*\{/)
  assert.match(resourceMediaViewerPackageCss, /\.resource-media-thumb\[data-fit="cover"\] > img/)
  assert.match(resourceMediaViewerPackageCss, /\.resource-media-audio-panel audio\s*\{/)
  assert.doesNotMatch(mediaViewerSource, /bg-black\/55/)
  assert.doesNotMatch(mediaViewerSource, /backdrop-blur-sm/)
  assert.doesNotMatch(mediaViewerSource, /shadow-2xl/)
  assert.doesNotMatch(mediaViewerSource, /max-h-\[72vh\]/)
  assert.doesNotMatch(mediaViewerSource, /rounded-lg/)
  assert.doesNotMatch(mediaViewerSource, /w-full h-full object-(?:cover|contain)/)
  assert.doesNotMatch(mediaViewerSource, /className="w-full"/)
  for (const exportName of ['AppCodeBlock', 'AppSurfaceItem', 'AppTextEmptyState', 'Button', 'NativeSelect']) {
    assert.match(scriptReferenceSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by package script reference panel`)
  }
  assert.match(scriptPanelSource, /\bResourceScriptReferencePanel\b/, 'ScriptPanel must delegate visual shell to package UI')
  assert.match(scriptReferenceSource, /!open[\s\S]*?<ResourceScriptReferenceTrigger[\s\S]*?onOpen=\{\(\) => onOpenChange\(true\)\}/, 'Script reference root must delegate collapsed trigger state')
  assert.match(scriptReferenceSource, /function ResourceScriptReferenceTrigger[\s\S]*?<Button[\s\S]*?onClick=\{onOpen\}/, 'Script reference collapsed trigger must use package button')
  assert.match(scriptReferenceSource, /<AppSurfaceItem variant="overlay"[\s\S]*?<ResourceScriptReferenceHeader[\s\S]*?onClose=\{\(\) => onOpenChange\(false\)\}/, 'Script reference drawer shell must use package surface primitive')
  assert.match(scriptReferenceSource, /function ResourceScriptReferenceHeader[\s\S]*?<Button[\s\S]*?onClick=\{onClose\}/, 'Script reference close action must use package button')
  assert.match(scriptReferenceCss, /\.resource-script-reference-panel__trigger\s*\{/)
  assert.match(scriptReferenceCss, /\.resource-script-reference-panel\s*\{/)
  assert.match(toasterSource, /\bAppToastShell\b/, 'Toaster shell must consume package toast shell')
  assert.match(toasterSource, /\bAppToastDetail\b/, 'Toaster detail display must consume package toast detail')
  assert.match(toasterSource, /\bAppToastIconButton\b/, 'Toaster actions must consume package toast action button')
  assert.match(toasterSource, /\bAppToastViewport\b/, 'Toaster viewport layout must be owned by package UI')
  assert.match(toasterSource, /<AppToastIcon tone=\{TOAST_TONE\[t\.type\]\}>/, 'Toaster icons must pass tone semantics to package toast icon')
  assert.match(adminToasterSource, /<AppToastIcon tone=\{TOAST_TONE\[t\.type\]\}>/, 'Admin Toaster icons must pass tone semantics to package toast icon')
  assert.match(adminToasterSource, /<Toast\.Root[\s\S]*?asChild[\s\S]*?<AppToastShell/, 'Admin Toaster shell must consume package toast shell')
  assert.match(adminToasterSource, /\bAppToastDetail\b/, 'Admin Toaster detail display must consume package toast detail')
  assert.match(adminToasterSource, /\bAppToastIconButton\b/, 'Admin Toaster actions must consume package toast action button')
  assert.match(adminToasterSource, /\bAppToastViewport\b/, 'Admin Toaster viewport layout must be owned by package UI')
  assert.match(appToastPackageSource, /\bAppToastIcon[\s\S]*?toneTextClass\(tone\)/, 'package toast icon must own semantic tone text mapping')
  assert.doesNotMatch(toasterSource, /\btoneTextClass\b/, 'Toaster must not reach into package tone helpers')
  assert.doesNotMatch(adminToasterSource, /\b(?:text-destructive|border-destructive|text-primary|border-primary|bg-popover|shadow-lg)\b/, 'Admin Toaster must not hardcode toast color/shell classes')
  for (const recipeName of [
    'preProductionQueueDetailRecipe',
    'preProductionCoverageRecipe',
    'preProductionSlotActionRecipe',
    'preProductionDraftRecipe',
    'preProductionCountRecipe',
    'preProductionMissingCountRecipe',
    'preProductionCandidateAvailabilityRecipe',
  ]) {
    assert.match(preProductionSemanticUiSource, new RegExp(`export function ${recipeName}\\b`), `${recipeName} must be pre-production semantic UI-owned`)
  }
  assert.match(preProductionBoardSource, /preProductionCoverageRecipe/)
  assert.match(preProductionBoardSource, /preProductionSlotActionRecipe/)
  assert.match(preProductionBoardSource, /preProductionCoverageRecipe\(coverage\.state\)/)
  assert.match(preProductionBoardSource, /preProductionSlotActionRecipe\(action\.state\)/)
  assert.match(preProductionBoardSource, /preProductionCountRecipe/)
  assert.match(preProductionSource, /preProductionMissingCountRecipe/)
  assert.match(preProductionAssetDetailSource, /preProductionCandidateAvailabilityRecipe/)
  assert.match(productionTerminologySource, /\bProductionTermState\b/)
  assert.match(preProductionSemanticUiSource, /\bProductionTermState\b/)
  assert.match(preProductionSemanticUiSource, /function preProductionStateRecipe\(state: ProductionTermState\)/)
  assert.doesNotMatch(productionTerminologySource, /\bProductionTone\b/)
  assert.doesNotMatch(productionTerminologySource, /\bproductionToneToWorkbenchTone\b/)
  assert.doesNotMatch(productionTerminologySource, /\btone\??:/)
  assert.doesNotMatch(productionTerminologySource, /\btone:\s*['"]/)
  assert.doesNotMatch(preProductionSemanticUiSource, /\bProductionTone\b/)
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/resources/components/PreProductionAssetBoard.tsx')), false, 'PreProductionAssetBoard must not live under resources feature')
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/resources/components/PreProductionPage.tsx')), false, 'PreProductionPage must not live under resources feature')
  assert.equal(existsSync(path.join(root, 'apps/frontend/src/features/resources/presentation/resourcesSemanticUi.ts')), false, 'pre-production semantic recipes must not live under resources feature')
  assert.doesNotMatch(`${preProductionSource}\n${preProductionBoardSource}\n${preProductionAssetDetailSource}`, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(`${preProductionBoardSource}\n${preProductionAssetDetailSource}`, /<WorkbenchStatusBadge\b[^>]*\btone=/)

  assert.doesNotMatch(resourcesSource, /@radix-ui\/react-dropdown-menu/)
  assert.doesNotMatch(resourcesSource, /@radix-ui\/react-dialog/)
  assert.doesNotMatch(resourcesSource, /DropdownMenu\.(Root|Trigger|Portal|Content|Item|Separator)/)
  assert.doesNotMatch(resourcesSource, /Dialog\.(Root|Portal|Overlay|Content|Title|Close)/)
  assert.doesNotMatch(resourcesSource, /fixed left-1\/2 top-1\/2[\s\S]{0,180}rounded-xl[\s\S]{0,120}shadow-xl/)
  assert.doesNotMatch(resourcesSource, /bg-background border border-border rounded-lg shadow-lg py-1/)
  assert.doesNotMatch(resourcesSource, /<select\b/)
  assert.doesNotMatch(resourcesSource, /<input\b/)
  assert.doesNotMatch(resourcesSource, /type-body border border-border rounded-lg bg-background/)
  assert.doesNotMatch(resourcesSource, /type-label border border-border rounded-lg bg-background/)
  assert.doesNotMatch(resourcesSource, /flex rounded-lg border border-border overflow-hidden/)
  assert.match(resourcesSource, /variant="ghost"[\s\S]{0,80}tone="danger"[\s\S]{0,120}revoke\.mutate/, 'resource revoke action must use package danger button tone')
  assert.match(resourcesSource, /<ResourceDangerMenuItem[\s\S]{0,120}onSelect=/, 'resource destructive menu items must use package danger menu item')
  assert.doesNotMatch(resourcesSource, /text-destructive/)
  assert.doesNotMatch(resourcesSource, /hover:text-destructive/)
  assert.doesNotMatch(resourcesSource, /px-3 py-1 type-label rounded-full/)
  assert.doesNotMatch(resourcesSource, /relative w-10 h-5 rounded-full/)
  assert.doesNotMatch(resourcesSource, /rounded-full border border-border hover:bg-muted/)
  assert.doesNotMatch(resourcesSource, /rounded-full bg-muted hover:bg-primary/)
  assert.doesNotMatch(resourcesSource, /grid grid-cols-2 overflow-hidden rounded-lg border border-border/)
  assert.doesNotMatch(resourcesSource, /rounded-lg border border-(?:border|primary\/30|destructive\/30) bg-(?:muted\/30|primary\/10|destructive\/10) p-3/)
  assert.doesNotMatch(resourcesSource, /rounded-lg border border-border px-3 py-1\.5 type-label text-muted-foreground hover:bg-muted/)
  assert.doesNotMatch(resourcesSource, /w-5 h-5 flex items-center justify-center rounded hover:bg-muted/)
  assert.doesNotMatch(resourcesSource, /w-full flex items-center gap-2 px-3 py-2 type-label rounded-lg transition-colors/)
  assert.doesNotMatch(resourcesSource, /active \? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted\/50'/)
  assert.doesNotMatch(resourcesSource, /type="range"/)
  assert.doesNotMatch(resourcesSource, /relative h-2 rounded-full bg-muted/)
  assert.doesNotMatch(resourcesSource, /absolute inset-y-0 rounded-full bg-primary\/20/)
  assert.doesNotMatch(resourcesSource, /type="checkbox"/)
  assert.doesNotMatch(resourcesSource, /<label className="absolute left-1 top-1 flex h-6 w-6/)
  assert.match(resourcesSource, /function RangeField[\s\S]*?<ResourceClipRangeInput/)
  assert.match(resourcePagePackageSource, /function ResourceClipRangeInput[\s\S]*?<RangeInput/)
  assert.match(resourcesSource, /<ResourcePageHiddenFileInput[\s\S]*?ref=\{fileRef\}[\s\S]*?type="file"[\s\S]*?multiple/)
  assert.match(resourcesSource, /function ResourceCard[\s\S]*?<ResourceAssetCard/)
  assert.match(resourcesSource, /preview=\{\([\s\S]*?<MediaViewer/)
  assert.match(resourcesSource, /selectControl=\{onSelectChange \? \([\s\S]*?<ResourceAssetSelectCheckbox[\s\S]*?onCheckedChange=\{onSelectChange\}/)
  assert.doesNotMatch(resourcesSource, /rounded-full bg-black\/60/)
  assert.doesNotMatch(resourcesSource, /\[\&_\.ms-checkbox-field__input\]/)
  assert.match(resourcesSource, /selectedResourceIDs\.has\(r\.ID\)[\s\S]*?<ResourcePageListCheckbox[\s\S]*?onCheckedChange=\{checked => setResourceSelected\(r, checked\)\}/)
  assert.match(resourcesSource, /visible\.map\(r => \([\s\S]*?<ResourcePageListRow[\s\S]*?selected=\{selectedResourceIDs\.has\(r\.ID\)\}/)
  assert.doesNotMatch(resourcesSource, /group flex items-center gap-2 rounded-lg/)
  assert.doesNotMatch(resourcesSource, /bg-primary\/10 ring-1 ring-primary\/30/)
  assert.match(resourcePagePackageSource, /function ResourceFolderOption[\s\S]*?<WorkbenchListItem[\s\S]*?active=\{active\}/)
  assert.match(resourcesSource, /function FolderOption[\s\S]*?<ResourceFolderOption[\s\S]*?active=\{selected\}/)
  assert.doesNotMatch(resourcesSource, /function FolderOption[\s\S]*?<WorkbenchListItem/)
  assert.match(resourcesSource, /function FolderItem[\s\S]*?<ResourceFolderTreeItem[\s\S]*?active=\{active\}/)
  assert.match(resourcesSource, /clipMode[\s\S]*?<ResourceClipModeGroup>[\s\S]*?variant=\{mode === 'accurate' \? 'solid' : 'ghost'\}/)
  assert.match(resourcesSource, /<ResourceClipStageFrame>/)
  assert.doesNotMatch(resourcesSource, /aspect-video rounded-lg bg-black/)
  assert.match(resourcesSource, /<ResourceStateMessage tone=\{[\s\S]*?clipStatus\.loading/)
  assert.match(resourcesSource, /ProjectSurfaceHeader[\s\S]*?actions=\{\([\s\S]*?<ResourcePageActionGroup[\s\S]*?setTab\('mine'\)[\s\S]*?<ResourcePageActionGroup[\s\S]*?setViewMode\('grid'\)/)
  assert.match(resourcesSource, /TYPE_TABS\.map[\s\S]*?<ResourcePageActionButton[\s\S]*?variant=\{filter === tabItem\.value \? 'solid' : 'ghost'\}/)
  assert.doesNotMatch(resourcesSource, /className=\{`group relative flex cursor-grab flex-col gap-1\.5 rounded-lg/)
  assert.doesNotMatch(resourcesSource, /<div className="aspect-square relative">/)
  assert.doesNotMatch(resourcesSource, /w-full h-full rounded-lg bg-muted flex items-center justify-center/)
  assert.doesNotMatch(resourceLibraryPickerSource, /rounded-md border border-border bg-card/)
  assert.doesNotMatch(resourceLibraryPickerSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(resourceLibraryPickerSource, /<select\b/)
  assert.doesNotMatch(resourceLibraryPickerSource, /<button\b/)
  assert.doesNotMatch(resourceLibraryPickerSource, /className="(?:w-full h-full|h-full w-full)"/)
  assert.doesNotMatch(resourceLibraryPickerSource, /\bAppPanel\b/)
  assert.doesNotMatch(resourceLibraryPickerSource, /\bNativeSelect\b/)
  assert.doesNotMatch(resourceLibraryPickerSource, /\bWorkbenchListItem\b/)
  assert.doesNotMatch(resourceLibraryPickerSource, /\bWorkbenchThumbnail\b/)
  assert.doesNotMatch(resourceCandidateAttachSource, /<input\b/)
  assert.doesNotMatch(resourceCandidateAttachSource, /<button\b/)
  assert.doesNotMatch(resourceCandidateAttachSource, /border border-dashed border-border/)
  assert.doesNotMatch(resourceCandidateAttachSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(resourceCandidateAttachSource, /rounded border px-2 py-1\.5/)
  assert.doesNotMatch(resourceCandidateAttachSource, /block w-full border-b border-border/)
  assert.doesNotMatch(resourceCandidateAttachSource, /rounded border border-primary\/25 bg-primary\/10/)
  assert.match(resourceCandidateAttachSource, /candidateResources\.map[\s\S]*?<ResourceCandidateItem[\s\S]*?active=\{attached\}/)
  assert.match(resourceCandidateAttachSource, /filteredTargets\.map[\s\S]*?<ResourceCandidateTargetItem[\s\S]*?active=\{selected\}/)
  assert.doesNotMatch(resourceAttachmentsSource, /<button\b/)
  assert.doesNotMatch(resourceAttachmentsSource, /rounded border border-border bg-muted/)
  assert.doesNotMatch(resourceAttachmentsSource, /border-2 border-dashed border-border/)
  assert.doesNotMatch(resourceAttachmentsSource, /bg-background\/90/)
  assert.doesNotMatch(resourceAttachmentsSource, /bg-destructive text-destructive-foreground/)
  assert.doesNotMatch(resourcePanelSource, /<input\b/)
  assert.doesNotMatch(resourcePanelSource, /<select\b/)
  assert.doesNotMatch(resourcePanelSource, /<button\b/)
  assert.doesNotMatch(resourcePanelSource, /hover:bg-muted\/50/)
  assert.doesNotMatch(resourcePanelSource, /hover:bg-muted\/30/)
  assert.doesNotMatch(resourcePanelSource, /rounded shrink-0 overflow-hidden bg-muted/)
  assert.doesNotMatch(resourcePanelSource, /flex rounded-md border border-border overflow-hidden/)
  assert.doesNotMatch(resourcePanelSource, /p-1 rounded hover:bg-muted/)
  assert.doesNotMatch(resourcePanelSource, /type-label text-muted-foreground text-center pt-8/)
  assert.match(resourcePanelSource, /\(\['resources', 'assetSlots'\] as const\)\.map[\s\S]*?<ResourcePanelTabButton[\s\S]*?active=\{tab === panelTab\}/)
  assert.match(resourcePanelSource, /resourceTypeOptions\.map[\s\S]*?<ResourcePanelSegmentButton[\s\S]*?active=\{resourceType === type\}/)
  assert.match(resourcePanelSource, /isDraggable && resource[\s\S]*?<ResourceAssetSlotDragButton[\s\S]*?role="button"/)
  assert.doesNotMatch(mediaViewerSource, /@radix-ui\/react-dialog/)
  assert.doesNotMatch(mediaViewerSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(mediaViewerSource, /rounded-xl border border-border bg-background/)
  assert.doesNotMatch(mediaViewerSource, /relative group overflow-hidden rounded-lg bg-muted/)
  assert.doesNotMatch(mediaViewerSource, /bg-muted\/50/)
  assert.doesNotMatch(mediaViewerSource, /rounded-lg bg-background border border-white\/10/)
  assert.doesNotMatch(mediaViewerSource, /<pre\b/)
  assert.doesNotMatch(mediaViewerSource, /font-mono/)
  assert.doesNotMatch(scriptPanelSource, /<select\b/)
  assert.doesNotMatch(scriptPanelSource, /<pre\b/)
  assert.doesNotMatch(scriptPanelSource, /<button\b/)
  assert.doesNotMatch(scriptPanelSource, /fixed right-0 top-1\/2[\s\S]{0,160}bg-foreground text-background/)
  assert.doesNotMatch(scriptPanelSource, /fixed right-0 top-0 h-full w-80 bg-background border-l border-border/)
  assert.doesNotMatch(scriptPanelSource, /fixed right-0 top-1\/2/)
  assert.doesNotMatch(scriptPanelSource, /fixed right-0 top-0/)
  assert.doesNotMatch(scriptPanelSource, /flex items-center gap-2 px-4 py-3 border-b bg-muted\/50/)
  assert.doesNotMatch(toasterSource, /<pre\b/)
  assert.doesNotMatch(toasterSource, /<button\b/)
  assert.doesNotMatch(toasterSource, /border-destructive\/30/)
  assert.doesNotMatch(toasterSource, /rounded-lg bg-muted\/50/)
  assert.doesNotMatch(toasterSource, /flex flex-col gap-1\.5 bg-popover border rounded-xl shadow-lg/)
  assert.match(toasterSource, /<Toast\.Root[\s\S]*?asChild[\s\S]*?<AppToastShell/)
  assert.match(preProductionSource, /ResourcePrepWorkbenchShell/)
  assert.match(preProductionSource, /ResourcePrepWorkbenchLayout/)
  assert.match(preProductionSource, /ResourcePrepWorkbenchRail/)
  assert.match(preProductionSource, /ResourcePrepWorkbenchMain/)
  assert.match(preProductionSource, /ResourcePrepInspectorTabs/)
  assert.match(preProductionSource, /ResourcePrepInspectorHeader/)
  assert.match(preProductionSource, /\bResourcePrepHiddenFileInput\b/)
  assert.doesNotMatch(preProductionSource, /ResourcePrepHeaderActionButton/)
  assert.doesNotMatch(preProductionSource, /ResourcePrepEmptyInspectorState/)
  assert.doesNotMatch(preProductionSource, /刷新上下文/)
  assert.doesNotMatch(preProductionSource, /审阅提案/)
  assert.doesNotMatch(preProductionSource, /梳理设定\+素材/)
  assert.doesNotMatch(preProductionAssetDetailSource, /生成候选/)
  assert.match(preProductionSource, /function PreProductionCardContextMenu[\s\S]*?<ResourcePrepContextMenu/)
  assert.match(preProductionSource, /function PreProductionCardContextMenu[\s\S]*?<ResourcePrepContextMenuButton[\s\S]*?<Pencil/)
  assert.match(preProductionSource, /function PreProductionCardContextMenu[\s\S]*?<ResourcePrepContextMenuButton[\s\S]*?<Trash2/)
  assert.match(preProductionSource, /function PreProductionCardContextMenu[\s\S]*?tone="danger"[\s\S]*?<Trash2/, 'pre-production delete menu item must use package danger button tone')
  assert.match(preProductionSource, /type PreProductionWorkbenchView = 'setting' \| 'asset'/)
  assert.match(preProductionSource, /type PreProductionSettingDetailView = 'setting' \| 'assets'/)
  assert.match(preProductionSource, /<ResourcePrepHiddenFileInput ref=\{uploadInput\.inputRef\} type="file"/)
  assert.doesNotMatch(preProductionSource, /\b(?:AppTextEmptyState|AppControlGroup|AppIconFrame|Input)\b/)
  assert.doesNotMatch(preProductionSource, /function PreProductionCardContextMenu[\s\S]*?<Button\b/)
  assert.doesNotMatch(preProductionSource, /<input\b/)
  assert.doesNotMatch(preProductionSource, /<button\b/)
  assert.doesNotMatch(preProductionSource, /text-destructive/)
  assert.doesNotMatch(preProductionSource, /rounded-md border border-dashed border-border bg-muted\/20/)
  assert.doesNotMatch(preProductionSource, /flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted\/30/)
  assert.doesNotMatch(preProductionSource, /grid grid-cols-2 gap-1 rounded-md bg-muted\/50 p-1/)
})

test('agent debug console and shared editor surfaces use package tone contracts', () => {
  const crudDialogSource = readProjectFile('apps/frontend/src/shared/ui/SemanticEntityCrudDialog.tsx')
  const agentDebugPreviewSource = readProjectFile('apps/frontend/src/features/agent/components/AgentDebugPreviewDialog.tsx')
  const agentDebugSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx')
  const agentConsoleSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')
  const inlineEditorSource = readProjectFile('apps/frontend/src/shared/ui/SemanticEntityInlineEditor.tsx')
  const uiDetailSource = readDetailSource()
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const uiDetailCss = readDetailCss()
  const uiDetailEntityEditorSource = readDetailEntityEditorSource()
  const uiDetailEntityEditorCss = readDetailEntityEditorCss()
  const toolNodeFullCardSource = readProjectFile('apps/frontend/src/shared/ui/ToolNodeFullCard.tsx')
  const canvasToolFullCardSource = readCanvasToolFullCardSource()
  const canvasToolFullCardCss = readCanvasToolFullCardCss()
  const agentConsolePackageSource = readProjectFile('packages/ui/src/components/business/agent/console/index.tsx')
  const agentConsolePackageCss = readProjectFile('packages/ui/src/components/business/agent/console/styles.css')
  const agentDebugPackageSource = readProjectFile('packages/ui/src/components/business/agent/debug/index.tsx')
  const agentDebugPackageCss = readProjectFile('packages/ui/src/components/business/agent/debug/styles.css')
  const sources = [
    'apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx',
    'apps/frontend/src/features/agent/components/AgentConsolePage.tsx',
    'apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx',
    'apps/frontend/src/features/agent/components/AgentRunsPage.tsx',
    'apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
    + '\n'
    + toolNodeFullCardSource
    + '\n'
    + agentDebugPreviewSource
    + '\n'
    + agentConsoleSource
    + '\n'
    + crudDialogSource
    + '\n'
    + inlineEditorSource
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate)-\d/

  assert.doesNotMatch(sources, rawPaletteClassPattern)
  assert.match(`${agentDebugPackageSource}\n${agentConsolePackageSource}\n${canvasToolFullCardSource}`, /toneTextClass|toneSurfaceClass|ReviewCallout|accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class/)
  assert.doesNotMatch(sources, /\b(?:ReviewCallout|toneTextClass|toneSurfaceClass|accent(?:Text|Surface|Soft|Badge|Dot|Gradient|Port)Class)\b/)
  assert.match(sources, /AppInlineError|AppTextEmptyState/)
  for (const exportName of ['DetailEntityEditorActions', 'DetailEntityEditorEmptyState', 'DetailEntityEditorHeader', 'DetailEntityEditorHero', 'DetailEntityEditorShell', 'DetailEntityFieldControl', 'DetailEntityFieldGrid', 'DetailEntityForm', 'DetailEntityHorizontalRail', 'DetailEntitySourceLockNotice']) {
    assert.match(inlineEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by semantic inline editor`)
    assert.match(uiDetailEntityEditorSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(uiDetailEntityEditorSource, /function DetailEntityEditorEmptyState[\s\S]*?<AppPanel[\s\S]*?<AppEmptyState/)
  assert.doesNotMatch(inlineEditorSource, /\b(?:AppPanel|AppEmptyState)\b/)
  for (const exportName of ['DetailEntityDialogBody', 'DetailEntityDialogFooter', 'DetailEntityDialogHeader', 'DetailEntityDialogShell', 'DetailEntityFieldControl', 'DetailEntityFieldGrid', 'DetailEntityRequiredHint', 'DetailEntitySourceLockNotice']) {
    assert.match(crudDialogSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by semantic crud dialog`)
    assert.match(uiDetailEntityEditorSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of ['CheckboxField', 'Input', 'Label', 'NativeSelect', 'Textarea', 'ReviewCallout']) {
    assert.match(uiDetailEntityEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by detail entity editor package UI`)
    assert.doesNotMatch(inlineEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into semantic inline editor`)
  }
  for (const exportName of ['CheckboxField', 'Input', 'Label', 'NativeSelect', 'Textarea']) {
    assert.doesNotMatch(crudDialogSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into semantic crud dialog`)
  }
  for (const exportName of ['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']) {
    assert.match(uiDetailEntityEditorSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by detail entity editor package UI`)
    assert.doesNotMatch(crudDialogSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into semantic crud dialog`)
  }
  for (const exportName of ['DetailHeader', 'DetailPill', 'DetailMetric']) {
    assert.match(uiDetailSource, new RegExp(`export function ${exportName}`), `${exportName} must live in @movscript/ui detail package`)
  }
  for (const exportName of ['DetailEntityHeader', 'DetailPreviewFieldList']) {
    assert.match(uiDetailSource, new RegExp(`export function ${exportName}`), `${exportName} must live in @movscript/ui detail package`)
  }
  assert.match(uiDetailCss, /\.detail-header\s*\{/)
  assert.match(uiDetailCss, /\.detail-pill\s*,/)
  assert.match(uiDetailCss, /\.detail-metric\s*\{/)
  assert.match(uiDetailCss, /\.detail-entity-header\s*\{/)
  assert.match(uiDetailCss, /\.detail-preview-list\s*\{/)
  assert.match(uiDetailCss, /@import "\.\/entity-editor\/styles\.css";/)
  assert.match(uiDetailEntityEditorCss, /\.detail-entity-editor-hero\s*\{/)
  assert.match(uiDetailEntityEditorCss, /\.detail-entity-editor-header\s*\{/)
  assert.match(uiDetailEntityEditorCss, /\.detail-entity-editor-actions\s*\{/)
  assert.match(uiDetailEntityEditorCss, /\.detail-entity-field__control\s*\{/)
  assert.match(uiDetailEntityEditorCss, /\.detail-entity-dialog\s*\{/)
  assert.doesNotMatch(inlineEditorSource, /flex flex-col gap-2 border-b border-border px-4 py-3/)
  assert.doesNotMatch(inlineEditorSource, /bg-gradient-to-br p-5/)
  assert.doesNotMatch(inlineEditorSource, /<Button[\s\S]*?编辑/)
  assert.doesNotMatch(uiCss, /\.detail-header\s*\{/)
  assert.match(agentDebugPreviewSource, /\bAgentDataBlock\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugHttpRequestShell\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugCodePanel\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugInlineMeta\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugPreviewActionButton\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugPreviewBadge\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugPreviewStatusBadge\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugWarningCallout\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugErrorCallout\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugFieldCodePanel\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugLabeledCodePanel\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugDraftDiffCodeBlock\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugDraftDiffLine\b/)
  assert.match(agentDebugPreviewSource, /\bAgentDebugSummaryItem\b/)
  assert.doesNotMatch(agentDebugPreviewSource, /function DebugSummaryItem/)
  assert.match(agentDebugPreviewSource, /function DebugHttpRequestCard[\s\S]*?AgentDebugHttpRequestShell/)
  assert.match(agentDebugPreviewSource, /function DebugHttpRequestCard[\s\S]*?<AgentDebugInlineMeta/)
  assert.match(agentDebugPackageSource, /export function AgentDebugPreviewActionButton[\s\S]*?<Button/)
  assert.match(agentDebugPackageSource, /export function AgentDebugPreviewBadge[\s\S]*?<Badge/)
  assert.match(agentDebugPackageSource, /export function AgentDebugPreviewStatusBadge[\s\S]*?<StatusBadge/)
  assert.match(agentDebugPackageSource, /export function AgentDebugFieldCodePanel/)
  assert.match(agentDebugPackageSource, /export function AgentDebugLabeledCodePanel/)
  assert.match(agentDebugPreviewSource, /function DraftDiff[\s\S]*?AgentDebugDraftDiffShell/)
  assert.match(agentDebugPreviewSource, /function DraftDiff[\s\S]*?<AgentDebugDraftDiffCodeBlock side="current"/)
  assert.match(agentDebugPreviewSource, /function DraftDiff[\s\S]*?<AgentDebugDraftDiffCodeBlock side="proposed"/)
  assert.match(agentDebugPreviewSource, /rows\.map\(\(row, index\)[\s\S]*?<AgentDebugDraftDiffLine[\s\S]*?change=\{row\.type\}/)
  assert.doesNotMatch(agentDebugPreviewSource, /\b(?:AppInlineMeta|Badge|Button|ReviewCallout|StatusBadge|toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(agentDebugPreviewSource, /\bcn\(/)
  assert.doesNotMatch(agentDebugPreviewSource, /flex h-5 w-5 items-center justify-center rounded bg-background/)
  assert.doesNotMatch(agentDebugPreviewSource, /<pre\b/)
  assert.doesNotMatch(agentDebugPreviewSource, /rounded-md border border-border bg-muted\/20/)
  assert.doesNotMatch(agentDebugPreviewSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(agentDebugPreviewSource, /grid gap-2 md:grid-cols-2/)
  assert.doesNotMatch(agentDebugPreviewSource, /flex items-center justify-between border-b border-border\/60 px-2 py-1/)
  assert.doesNotMatch(agentDebugPreviewSource, /max-h-(?:28|44) px-2 py-1\.5 type-tiny/)
  assert.match(agentDebugSource, /\bAgentDataBlock\b/)
  assert.match(agentDebugSource, /\bAgentDebugEmptyText\b/)
  assert.match(agentDebugSource, /\bAgentDebugJsonPanel\b/)
  assert.match(agentDebugSource, /\bAgentDebugStateMessage\b/)
  assert.match(agentDebugSource, /\bAgentDebugMetricCard\b/)
  assert.match(agentDebugSource, /\bAgentDebugKeyValue\b/)
  assert.match(agentDebugSource, /\bAgentDebugCallout\b/)
  assert.match(agentDebugSource, /\bAgentDebugInlineMeta\b/)
  assert.match(agentDebugSource, /\bAgentDebugToneText\b/)
  assert.match(agentDebugSource, /\bAgentDebugStatusIcon\b/)
  assert.match(agentDebugSource, /\bAgentDebugSeverityBlock\b/)
  assert.match(agentDebugSource, /\bAgentDebugListRow\b/)
  assert.match(agentDebugSource, /\bAgentDebugRunListRow\b/)
  assert.match(agentDebugPackageSource, /export function AgentDebugJsonPanel/)
  assert.match(agentDebugPackageSource, /export function AgentDebugListRow/)
  assert.match(agentDebugPackageSource, /export function AgentDebugStateMessage/)
  assert.match(agentDebugPackageSource, /export function AgentDebugMetricCard/)
  assert.match(agentDebugPackageSource, /export function AgentDebugKeyValue/)
  assert.match(agentDebugPackageSource, /export function AgentDebugCallout/)
  assert.match(agentDebugPackageSource, /export function AgentDebugWarningCallout/)
  assert.match(agentDebugPackageSource, /export function AgentDebugErrorCallout/)
  assert.match(agentDebugPackageSource, /export function AgentDebugDraftDiffCodeBlock/)
  assert.match(agentDebugPackageSource, /export function AgentDebugDraftDiffLine/)
  assert.match(agentDebugPackageSource, /export function AgentDebugInlineMeta/)
  assert.match(agentDebugPackageSource, /export function AgentDebugToneText/)
  assert.match(agentDebugPackageSource, /export function AgentDebugStatusIcon/)
  assert.match(agentDebugPackageSource, /export function AgentDebugSeverityBlock/)
  assert.match(agentDebugPackageSource, /\bAppStateMessage\b/)
  assert.match(agentDebugPackageSource, /\bAppMetricCard\b/)
  assert.match(agentDebugPackageSource, /\bAppKeyValue\b/)
  assert.match(agentDebugPackageSource, /\bReviewCallout\b/)
  assert.match(agentDebugPackageSource, /\btoneTextClass\b/)
  assert.match(agentDebugPackageSource, /\btoneSurfaceClass\b/)
  assert.match(agentDebugPackageCss, /\.agent-debug-json-panel__code\s*\{/)
  assert.match(agentDebugPackageCss, /\.agent-debug-list-row\s*\{/)
  assert.match(agentDebugPackageCss, /\.agent-debug-draft-diff-code\s*\{/)
  assert.match(agentDebugPackageCss, /\.agent-debug-draft-diff-line\s*\{/)
  assert.match(agentDebugSource, /\bAgentDebugCodeBlock\b/)
  assert.match(agentDebugPackageSource, /function AgentDebugCodeBlock[\s\S]*?<AppCodeBlock/)
  assert.match(agentDebugSource, /\bAppInlineError\b/)
  assert.doesNotMatch(agentDebugSource, /\b(?:AppInlineMeta|AppKeyValue|AppMetricCard|AppStateMessage|AppTextEmptyState|ReviewCallout|toneTextClass|toneSurfaceClass)\b/)
  assert.match(agentDebugSource, /data-testid="agent-debug-scope-boundary"[\s\S]*?<AgentDebugInlineMeta>[\s\S]*?<AgentDebugInlineMeta>[\s\S]*?<AgentDebugInlineMeta>/)
  assert.match(agentDebugSource, /data-testid="agent-debug-warning-group"[\s\S]*?AgentDataBlock/)
  assert.match(agentDebugSource, /data-testid="agent-debug-triage-item"[\s\S]*?AgentDebugSeverityBlock/)
  assert.doesNotMatch(agentDebugSource, /item\.severity === 'action'[\s\S]*?toneSurfaceClass\('danger'\)/)
  assert.doesNotMatch(agentDebugSource, /text-destructive/)
  assert.match(agentDebugSource, /preview\.promptPreview\.debugParts\.map[\s\S]*?<AgentDataBlock[\s\S]*?<AgentDebugCodeBlock>/)
  assert.match(agentDebugSource, /data-testid="agent-debug-remediation-observe-only"[\s\S]*?AgentDebugInlineMeta/)
  assert.doesNotMatch(agentDebugSource, /rounded border border-border bg-muted\/30 px-2 py-1/)
  assert.doesNotMatch(agentDebugSource, /rounded border border-border bg-background px-2 py-1/)
  assert.doesNotMatch(agentDebugSource, /rounded-md border border-destructive\/30 bg-destructive\/10 p-2/)
  assert.doesNotMatch(agentDebugSource, /function ListRow\b/)
  assert.doesNotMatch(agentDebugSource, /function JsonPanel\b/)
  assert.doesNotMatch(agentDebugSource, /function EmptyText\b/)
  assert.doesNotMatch(agentDebugSource, /data-testid="agent-debug-triage-item"[\s\S]{0,160}rounded-md border p-2/)
  assert.doesNotMatch(agentDebugSource, /data-testid="agent-debug-warning-group"[^>]+rounded bg-background\/70/)
  assert.doesNotMatch(agentDebugSource, /max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2/)
  assert.doesNotMatch(agentDebugSource, /max-h-\[68vh\] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3/)
  assert.doesNotMatch(agentDebugSource, /data-testid="agent-debug-remediation-observe-only"[^>]+rounded border border-border bg-background/)
  assert.match(agentConsoleSource, /\bAgentConsoleCallout\b/)
  assert.match(agentConsoleSource, /\bAgentConsoleSelectField\b/)
  assert.match(agentConsoleSource, /\bAgentConsoleEnableCheckbox\b/)
  assert.match(agentConsoleSource, /function LocalToolCard[\s\S]*?AgentConsoleLocalToolCard/)
  assert.match(agentConsoleSource, /function BoundaryCard[\s\S]*?AgentConsoleBoundaryCard/)
  assert.match(agentConsoleSource, /function ConsoleMetricCard[\s\S]*?AgentConsoleMetricCard/)
  assert.match(agentConsoleSource, /function HistoryClearControl[\s\S]*?AgentConsoleHistoryClearSurface/)
  for (const exportName of [
    'AgentConsoleActionButton',
    'AgentConsoleBoundaryCard',
    'AgentConsoleCallout',
    'AgentConsoleEmptyText',
    'AgentConsoleEnableCheckbox',
    'AgentConsoleFormField',
    'AgentConsoleHeader',
    'AgentConsoleHistoryClearIcon',
    'AgentConsoleHistoryClearSurface',
    'AgentConsoleIssueRowSurface',
    'AgentConsoleLocalToolCard',
    'AgentConsoleMetricCard',
    'AgentConsolePanel',
    'AgentConsoleSelectField',
  ]) {
    assert.match(agentConsoleSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent console`)
    assert.match(agentConsolePackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(agentConsolePackageSource, /\bNativeSelect\b/)
  assert.match(agentConsolePackageSource, /\bCheckboxField\b/)
  assert.match(agentConsolePackageSource, /\bAgentSurfaceBlock\b/)
  assert.match(agentConsolePackageSource, /export function AgentConsoleToneSurfaceBlock\b/)
  assert.match(agentConsolePackageSource, /\bReviewCallout\b/)
  assert.match(agentConsolePackageSource, /\bAppTextEmptyState\b/)
  assert.match(agentConsolePackageSource, /\btoneTextClass\b/)
  assert.match(agentConsolePackageSource, /\btoneSurfaceClass\b/)
  assert.match(agentConsolePackageCss, /\.agent-console-metric-card\s*\{/)
  assert.doesNotMatch(agentConsoleSource, /\b(?:AppTextEmptyState|ReviewCallout|toneTextClass|toneSurfaceClass)\b/)
  assert.doesNotMatch(agentConsoleSource, /text-destructive/)
  assert.doesNotMatch(agentConsoleSource, /<select\b/)
  assert.doesNotMatch(agentConsoleSource, /<input\b[\s\S]{0,80}type="checkbox"/)
  assert.doesNotMatch(agentConsoleSource, /rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(agentConsoleSource, /rounded-md border border-destructive\/30 bg-destructive\/5/)
  assert.doesNotMatch(agentConsoleSource, /rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(agentConsoleSource, /rounded-md border bg-muted\/10 p-3/)
  assert.doesNotMatch(agentConsoleSource, /rounded-md border bg-background p-3/)
  for (const exportName of [
    'CanvasToolFullCard',
    'CanvasToolFullHistoryItem',
    'CanvasToolFullHistoryToggle',
    'CanvasToolFullModelSelect',
    'CanvasToolFullOutputFrame',
  ]) {
    assert.match(toolNodeFullCardSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by ToolNodeFullCard`)
    assert.match(canvasToolFullCardSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of ['AppInlineMeta', 'AppMediaFrame', 'AppSurfaceItem', 'Button', 'NativeSelect']) {
    assert.match(canvasToolFullCardSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be owned by canvas tool full card package UI`)
    assert.doesNotMatch(toolNodeFullCardSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must not leak into ToolNodeFullCard`)
  }
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-card\s*\{/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-output > \*\s*\{[\s\S]*object-fit:\s*cover/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-output--history > \*\s*\{[\s\S]*height:\s*128px/)
  assert.match(canvasToolFullCardCss, /\.canvas-tool-full-output--current > \*\s*\{[\s\S]*height:\s*288px/)
  assert.match(canvasToolFullCardSource, /statusProps\?: StatusBadgeProps/)
  assert.match(canvasToolFullCardSource, /<StatusBadge[\s\S]*?\{\.\.\.statusVisualProps\}/)
  assert.match(toolNodeFullCardSource, /toolHistoryStatusRecipe/)
  assert.match(toolNodeFullCardSource, /<CanvasToolFullHistoryItem[\s\S]*?statusProps=\{statusProps\}/)
  assert.doesNotMatch(canvasToolFullCardSource, /\bstatusTone\b/)
  assert.doesNotMatch(toolNodeFullCardSource, /\bstatusTone\b/)
  assert.doesNotMatch(toolNodeFullCardSource, /w-full h-(?:32|72) object-cover/)
  assert.match(toolNodeFullCardSource, /function TaskHistoryItem[\s\S]*?<CanvasToolFullHistoryItem[\s\S]*?<CanvasToolFullOutputFrame/)
  assert.match(inlineEditorSource, /collapsed && collapsedMode === 'horizontal'[\s\S]*?<DetailEntityHorizontalRail[\s\S]*?onExpand=\{toggleCollapsed\}/)
  assert.match(inlineEditorSource, /function FieldControl[\s\S]*?<DetailEntityFieldControl/)
  assert.match(crudDialogSource, /function FieldControl[\s\S]*?<DetailEntityFieldControl/)
  assert.doesNotMatch(sources, /rounded-md border border-border\/70 bg-background/)
  assert.doesNotMatch(sources, /rounded-md border border-border\/60 bg-background/)
  assert.doesNotMatch(sources, /rounded-md border border-border\/70 bg-card/)
  assert.doesNotMatch(sources, /inline-flex items-center gap-1 rounded border/)
  assert.doesNotMatch(sources, /max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/)
  assert.doesNotMatch(crudDialogSource, /rounded-lg border border-border bg-muted\/30/)
  assert.doesNotMatch(crudDialogSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(crudDialogSource, /<select\b/)
  assert.doesNotMatch(crudDialogSource, /<input\b[\s\S]{0,80}type="checkbox"/)
  assert.doesNotMatch(inlineEditorSource, /rounded-lg border border-border bg-card/)
  assert.doesNotMatch(inlineEditorSource, /rounded-md border border-border bg-background/)
  assert.doesNotMatch(inlineEditorSource, /rounded-md border border-border bg-muted\/20/)
  assert.doesNotMatch(inlineEditorSource, /<details\b/)
  assert.doesNotMatch(inlineEditorSource, /<select\b/)
  assert.doesNotMatch(inlineEditorSource, /<button\b/)
  assert.doesNotMatch(inlineEditorSource, /<input type="checkbox"/)
  assert.doesNotMatch(toolNodeFullCardSource, /<select\b/)
  assert.doesNotMatch(toolNodeFullCardSource, /<button\b/)
  assert.doesNotMatch(toolNodeFullCardSource, /border border-border rounded-lg overflow-hidden/)
  assert.doesNotMatch(toolNodeFullCardSource, /bg-muted\/30/)
  assert.doesNotMatch(toolNodeFullCardSource, /bg-muted text-muted-foreground rounded-full/)
  assert.doesNotMatch(sources, /function (MetricCard|Panel|SummaryItem|StateMessage|InlineError|EmptyState)\b/)
  assert.doesNotMatch(sources, /text-destructive/)
  assert.doesNotMatch(sources, /bg-destructive/)
})

test('agent admin surfaces use package structural primitives', () => {
  const sourcesByPath = new Map([
    ['apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')],
    ['apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx')],
    ['apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx')],
    ['apps/frontend/src/features/agent/components/AgentRunsPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AgentRunsPage.tsx')],
    ['apps/frontend/src/features/agent/components/AgentModeCanvasListPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AgentModeCanvasListPage.tsx')],
  ])
  const joinedSources = Array.from(sourcesByPath.values()).join('\n')
  const uiAppSource = readAppSource()
  const agentAdminPackageSources = [
    readProjectFile('packages/ui/src/components/business/agent/settings/index.tsx'),
    readProjectFile('packages/ui/src/components/business/agent/debug/index.tsx'),
    readProjectFile('packages/ui/src/components/business/agent/performance/index.tsx'),
  ].join('\n')

  for (const exportName of [
    'AppKeyValue',
    'AppStateMessage',
    'AppInlineError',
    'AppTextEmptyState',
  ]) {
    assert.match(uiAppSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(agentAdminPackageSources, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent admin package surfaces`)
  }
  assert.match(uiAppSource, /export function AppPanel\b/, 'AppPanel must be package-owned')

  assert.doesNotMatch(joinedSources, /function (MetricCard|Panel|SummaryItem|StateMessage|InlineError|EmptyState)\b/)
  assert.match(uiAppSource, /text\?: ReactNode/)
  const agentSettingsSource = sourcesByPath.get('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  assert.ok(agentSettingsSource, 'agent settings source must be loaded')
  const agentSettingsUiSource = readProjectFile('packages/ui/src/components/business/agent/settings/index.tsx')
  const agentSettingsOwnershipSource = `${agentSettingsSource}\n${agentSettingsUiSource}`
  assert.match(agentSettingsUiSource, /function AgentSettingsPanel[\s\S]*?<AppPanel/, 'agent settings panel wrapper must own AppPanel usage')
  assert.match(agentSettingsSource, /\bAgentSettingsPanel\b/, 'agent settings page must consume package panel wrapper')
  assert.match(agentSettingsSource, /<AgentSettingsCallout[\s\S]*?data-testid="agent-settings-provider-model-id-secret-warning"/)
  assert.match(agentSettingsSource, /<AgentSettingsCallout[\s\S]*?data-testid="agent-settings-base-url-secret-warning"/)
  assert.doesNotMatch(agentSettingsSource, /\b(?:AppStateMessage|AppKeyValue|ReviewCallout|toneTextClass)\b/)
  for (const testId of [
    'agent-settings-snapshot-impact-item',
    'agent-settings-tool-policy-diff-item',
    'agent-settings-api-mode-capability-item',
    'agent-settings-model-compatibility-probe',
    'agent-settings-api-mode-migration-step',
    'agent-settings-api-mode-switch-taskGraph-item',
  ]) {
    if (testId === 'agent-settings-model-compatibility-probe') {
      assert.match(agentSettingsSource, /<AgentSettingsStatusPanel[\s\S]*?itemTestId="agent-settings-model-compatibility-probe"/)
      assert.match(agentSettingsUiSource, /<AgentSurfaceBlock[\s\S]*?data-testid=\{itemTestId\}/)
    } else {
      assert.match(agentSettingsOwnershipSource, new RegExp(`<AgentSurfaceBlock[\\s\\S]*?data-testid="${testId}"`), `${testId} must use AgentSurfaceBlock`)
    }
  }
  assert.match(agentSettingsSource, /function ToolPolicyRow[\s\S]*?AgentSettingsToolPolicyRow/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyRow[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyRow[\s\S]*?<StatusBadge/)
  assert.match(agentSettingsSource, /statusProps: agentSettingsStatusRecipe/)
  assert.match(agentSettingsSource, /badgeProps=\{agentSettingsApiModeBadgeRecipe\(mode\.badge\)\}/)
  assert.match(agentSettingsSource, /trustProps=\{agentSettingsRecipe/)
  assert.doesNotMatch(agentSettingsUiSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(agentSettingsSource, /agentSettingsStatusTone|agentSettingsApiModeBadgeTone/)
  assert.doesNotMatch(agentSettingsSource, /\bbadgeTone=|\btrustTone=/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyRow[\s\S]{0,2200}<StatusBadge/)
  assert.match(agentSettingsSource, /\bAgentSettingsActionItemsPanel\b/)
  assert.match(agentSettingsSource, /\bAgentSettingsReadinessPanel\b/)
  assert.match(agentSettingsUiSource, /<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-action-item"/)
  assert.match(agentSettingsUiSource, /data-testid="agent-settings-action-feedback"[\s\S]*?ReviewCallout/)
  assert.match(agentSettingsSource, /function SkillRow[\s\S]*?AgentSettingsSkillCard/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSkillCard[\s\S]*?<CheckboxField/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSkillCard[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /function SkillRow[\s\S]{0,2200}CheckboxField/)
  assert.doesNotMatch(agentSettingsSource, /function SkillRow[\s\S]{0,2200}AppInlineMeta/)
  assert.match(agentSettingsSource, /function ToolPolicyDiffPreview[\s\S]*?AgentSettingsToolPolicyDiffPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyDiffPanel[\s\S]*?<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-tool-policy-diff-item"/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPolicyDiffPreview[\s\S]{0,2200}<StatusBadge/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPolicyFilterPanel[\s\S]*?onSearchChange=\{setToolPolicySearch\}/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPolicyFilterPresetPanel[\s\S]*?onSave=\{saveToolPolicyFilterPreset\}/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPolicyBulkActionPanel[\s\S]*?actions=\{\[/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyFilterPanel[\s\S]*?<Input[\s\S]*?onChange=\{\(event\) => onSearchChange\(event\.target\.value\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyFilterPresetPanel[\s\S]*?<Button[\s\S]*?onClick=\{preset\.onSelect\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPolicyBulkActionPanel[\s\S]*?actions\.map[\s\S]*?<Button[\s\S]*?onClick=\{action\.onClick\}/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-tool-policy-filters"[\s\S]{0,1600}<Input/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-tool-policy-filter-presets"[\s\S]{0,1800}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-tool-policy-bulk-actions"[\s\S]{0,1800}<Button/)
  assert.match(agentSettingsSource, /<AgentSettingsRunPresetEditorPanel[\s\S]*?onAutoTaskGraphChange=\{\(checked\) => updateRunPreset\(activeRunPreset\.id, \{ autoTaskGraph: checked \}\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetEditorPanel[\s\S]*?<CheckboxField[\s\S]*?onCheckedChange=\{onAutoTaskGraphChange\}/)
  assert.match(agentSettingsSource, /function SettingsSnapshotImportScopeSelector[\s\S]*?<AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsSource, /function SettingsSnapshotSummary[\s\S]*?<AgentSettingsSnapshotSummaryPanel/)
  assert.match(agentSettingsSource, /function SettingsAuditTrailPanel[\s\S]*?<AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsSource, /function SettingsSnapshotImpactPreview[\s\S]*?<AgentSettingsSnapshotImpactPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotImportScopePanel[\s\S]*?<CheckboxField[\s\S]*?data-testid="agent-settings-snapshot-import-scope"[\s\S]*?onCheckedChange=\{scope\.onChange\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsAuditTrailPanel[\s\S]*?data-testid="agent-settings-audit-entry"[\s\S]*?toneSurfaceClass\("danger"\)/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotSummaryPanel[\s\S]*?<AppKeyValue/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotImpactPanel[\s\S]*?<StatusBadge/)
  assert.match(agentSettingsSource, /<AgentSettingsPanel[\s\S]*?id="agent-settings-model"[\s\S]*?title=\{t\('agents\.settings\.modelPanel'\)\}/)
  assert.doesNotMatch(agentSettingsSource, /\bAppPanel\b/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsSnapshotImportScopeSelector[\s\S]{0,2200}<CheckboxField/)
  assert.doesNotMatch(agentSettingsSource, /function SettingsAuditTrailPanel[\s\S]{0,2400}<AgentSurfaceBlock/)
  assert.match(agentSettingsSource, /\bAgentSettingsToggleRow\b/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToggleRow[\s\S]*?<CheckboxField[\s\S]*?checked=\{checked\}[\s\S]*?onCheckedChange=\{onChange\}/)
  assert.match(agentSettingsSource, /function ProfileRow[\s\S]*?AgentSettingsProfileCard/)
  assert.match(agentSettingsSource, /function ProfileDiffPanel[\s\S]*?AgentSettingsProfileDiffPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsProfileCard[\s\S]*?AgentSurfaceBlock/)
  assert.match(agentSettingsUiSource, /function AgentSettingsProfileDiffSectionView[\s\S]*?AgentSurfaceBlock/)
  assert.match(agentSettingsUiSource, /function AgentSettingsProfileSummaryList[\s\S]*?AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSource, /function ProfileDiffSectionView\b/)
  assert.doesNotMatch(agentSettingsSource, /function ProfileSummaryList\b/)
  assert.match(agentSettingsSource, /textModels\.slice\(0, 12\)\.map\(\(model\)[\s\S]*?<AgentSettingsModelOptionButton[\s\S]*?onSelect=\{\(\) => setSelectedModelId\(publicModelId\(model\)\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsModelOptionButton[\s\S]*?<AgentSurfaceBlock[\s\S]*?<Button[\s\S]*?onClick=\{onSelect\}/)
  assert.match(agentSettingsSource, /function RunPresetRow[\s\S]*?<AgentSettingsRunPresetRow[\s\S]*?onSelect=\{\(\) => onSelect\(preset\.id\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsRunPresetRow[\s\S]*?<Button[\s\S]*?onClick=\{onSelect\}/)
  assert.match(agentSettingsSource, /function ConfigurationMapPanel[\s\S]*?<AgentSettingsNavigationButton[\s\S]*?onClick=\{\(\) => onJump\(section\.id\)\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsNavigationButton[\s\S]*?<AgentDataBlock[\s\S]*?asChild[\s\S]*?<Button[\s\S]*?onClick=\{onClick\}/)
  assert.match(agentSettingsSource, /function SettingsSnapshotImportScopeSelector[\s\S]*?<AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsSnapshotImportScopePanel[\s\S]*?<CheckboxField[\s\S]*?data-testid="agent-settings-snapshot-import-scope"/)
  assert.match(agentSettingsSource, /function SettingsAuditTrailPanel[\s\S]*?<AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsAuditTrailPanel[\s\S]*?data-testid="agent-settings-audit-entry"[\s\S]*?toneSurfaceClass\("danger"\)/)
  assert.match(agentSettingsSource, /data-testid="agent-settings-scope-boundary"[\s\S]*?<AgentSettingsScopeBadge>[\s\S]*?agents\.settings\.scope\.controlPlane/)
  assert.match(agentSettingsUiSource, /function AgentSettingsScopeBadge[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /\bAppInlineMeta\b/)
  assert.match(agentSettingsSource, /<AgentSettingsSkillBundlePanel[\s\S]*?fileInputRef=\{skillBundleFileInputRef\}/)
  assert.match(agentSettingsUiSource, /<Input[\s\S]*?ref=\{fileInputRef\}[\s\S]*?type="file"/)
  assert.match(agentSettingsSource, /<AgentSettingsInput[\s\S]*?ref=\{settingsSnapshotFileInputRef\}[\s\S]*?type="file"/)
  assert.match(agentSettingsSource, /\bAgentSettingsCodeBlock\b/)
  assert.doesNotMatch(agentSettingsSource, /<pre\b/)
  assert.doesNotMatch(agentSettingsSource, /<button\b/)
  assert.doesNotMatch(agentSettingsSource, /<input\b/)
  assert.doesNotMatch(agentSettingsSource, /text-destructive/)
  assert.doesNotMatch(agentSettingsSource, /<input\b[\s\S]{0,80}type="checkbox"/)
  assert.doesNotMatch(agentSettingsSource, /rounded border border-border bg-muted\/30 px-2 py-1/)
  assert.doesNotMatch(agentSettingsSource, /rounded border border-border bg-background px-2 py-1/)
  assert.doesNotMatch(agentSettingsSource, /textModels\.slice\(0, 12\)\.map\(\(model\)[\s\S]{0,500}<button\b/)
  assert.doesNotMatch(agentSettingsSource, /function RunPresetRow[\s\S]{0,700}<button\b/)
  assert.doesNotMatch(agentSettingsSource, /function ConfigurationMapPanel[\s\S]{0,700}<button\b/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-provider-model-id-secret-warning"[^>]+rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-base-url-secret-warning"[^>]+rounded-md border border-destructive\/30 bg-destructive\/10/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-snapshot-impact-item"[^>]+rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-tool-policy-diff-item"[^>]+rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-api-mode-capability-item"[^>]+rounded border border-border bg-background/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-model-compatibility-probe"[^>]+rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-api-mode-migration-step"[^>]+rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-api-mode-switch-taskGraph-item"[^>]+rounded border border-border bg-muted\/20/)
  assert.doesNotMatch(agentSettingsSource, /available \? 'bg-muted\/20' : 'cursor-not-allowed border-border\/60 bg-muted\/10 opacity-60'/)
  assert.doesNotMatch(agentSettingsSource, /isFailure \? 'border-destructive\/40 bg-destructive\/5' : 'bg-muted\/20'/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-action-item"[^>]+rounded-md border p-2/)
  assert.doesNotMatch(agentSettingsSource, /data-testid="agent-settings-action-item"[\s\S]{0,240}border-destructive\/40 bg-destructive\/10/)
  assert.doesNotMatch(agentSettingsSource, /function SkillRow[\s\S]{0,2200}<input\b[\s\S]{0,80}type="checkbox"/)
  assert.doesNotMatch(agentSettingsSource, /function SkillRow[\s\S]{0,2600}rounded bg-background px-1\.5 py-0\.5/)
  assert.doesNotMatch(agentSettingsSource, /function ProfileRow[\s\S]{0,1200}rounded-md border p-2/)
  assert.doesNotMatch(agentSettingsSource, /function ProfileDiffSectionView[\s\S]{0,900}rounded bg-background px-2 py-1\.5/)
  assert.doesNotMatch(agentSettingsSource, /function ProfileSummaryList[\s\S]{0,600}rounded bg-background px-2 py-1/)
})

test('agent full-page surfaces use package page shell layout', () => {
  const uiLayoutSource = readProjectFile('packages/ui/src/components/layout/index.tsx')
  const uiLayoutCss = readProjectFile('packages/ui/src/components/layout/styles.css')
  const agentRunPagePackageSource = readProjectFile('packages/ui/src/components/business/agent/page/index.tsx')
  const canvasListPackageSource = readProjectFile('packages/ui/src/components/business/canvas/list/index.tsx')
  const sourcesByPath = new Map([
    ['apps/frontend/src/features/agent/components/AgentConsolePage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')],
    ['apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')],
    ['apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx')],
    ['apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentPerformancePage.tsx')],
    ['apps/frontend/src/features/agent/components/AgentRunsPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AgentRunsPage.tsx')],
    ['apps/frontend/src/features/agent/components/AIAgentRunPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIAgentRunPage.tsx')],
    ['apps/frontend/src/features/agent/components/AIDraftsPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AIDraftsPage.tsx')],
    ['apps/frontend/src/features/agent/components/AgentModeCanvasListPage.tsx', readProjectFile('apps/frontend/src/features/agent/components/AgentModeCanvasListPage.tsx')],
  ])
  const joinedSources = Array.from(sourcesByPath.values()).join('\n')

  for (const exportName of ['AppPageShell', 'AppPageShellHeader', 'AppPageShellBody']) {
    assert.match(uiLayoutSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  assert.match(uiLayoutCss, /\.app-page-shell\s*\{/)
  assert.match(uiLayoutCss, /\.app-page-shell__header\s*\{/)
  assert.match(uiLayoutCss, /\.app-page-shell__body\s*\{/)
  assert.match(uiLayoutCss, /\[data-scroll="responsive-split"\]/)

  for (const [relativePath, source] of sourcesByPath) {
    assert.match(source, /<AppPageShell\b/, `${relativePath} must use AppPageShell`)
    if (relativePath.endsWith('/AIAgentRunPage.tsx')) {
      assert.match(source, /<AgentRunPageHeader\b/, `${relativePath} must use agent run page header wrapper`)
      assert.match(source, /<AgentRunPageBody\b/, `${relativePath} must use agent run page body wrapper`)
    } else {
      assert.match(source, /<AppPageShellHeader\b/, `${relativePath} must use AppPageShellHeader`)
      assert.match(source, /<AppPageShellBody\b/, `${relativePath} must use AppPageShellBody`)
    }
  }
  assert.match(agentRunPagePackageSource, /function AgentRunPageHeader[\s\S]*?<AppPageShellHeader/, 'agent run page header wrapper must own AppPageShellHeader')
  assert.match(agentRunPagePackageSource, /function AgentRunPageBody[\s\S]*?<AppPageShellBody/, 'agent run page body wrapper must own AppPageShellBody')
  const agentModeCanvasListSource = sourcesByPath.get('apps/frontend/src/features/agent/components/AgentModeCanvasListPage.tsx')
  assert.ok(agentModeCanvasListSource, 'agent mode canvas list source must be loaded')
  const sharedCanvasListViewSource = readProjectFile('apps/frontend/src/features/canvas/components/CanvasListView.tsx')
  assert.match(agentModeCanvasListSource, /<CanvasListView source="agent"/)
  assert.match(sharedCanvasListViewSource, /\bCanvasListItemIcon\b/)
  assert.match(sharedCanvasListViewSource, /\bCanvasListItemMeta\b/)
  assert.match(canvasListPackageSource, /function CanvasListItemMeta[\s\S]*?canvas-list-item__meta/)
  assert.match(sharedCanvasListViewSource, /\bCanvasListError\b/, 'agent mode canvas list errors must use package canvas list semantic error surface')
  assert.match(canvasListPackageSource, /function CanvasListError[\s\S]*?toneTextClass\("danger"\)/)
  assert.doesNotMatch(sharedCanvasListViewSource, /\btoneTextClass\b/)
  assert.doesNotMatch(sharedCanvasListViewSource, /\b(?:AppEmptyState|AppIconFrame|Badge|Button|Input)\b/)
  assert.doesNotMatch(joinedSources, /text-destructive/)
  assert.doesNotMatch(sharedCanvasListViewSource, /flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted\/30/)
  assert.doesNotMatch(joinedSources, /className="flex h-full min-h-0 flex-col bg-background"/)
  assert.doesNotMatch(joinedSources, /className="shrink-0 border-b border-border bg-background px-5 py-3"/)
  assert.doesNotMatch(joinedSources, /className="min-h-0 flex-1 overflow-y-auto p-[45]"/)
})

test('page content layouts avoid fixed horizontal page widths', () => {
  const pageSources = [
    ...walkFiles('apps/frontend/src/features', (relativePath) => /\.tsx$/.test(relativePath)),
    ...walkFiles('apps/frontend/src/pages', (relativePath) => /\.tsx$/.test(relativePath)),
  ]
  const fixedShellSplits = []
  const largePageMinWidths = []
  for (const relativePath of pageSources) {
    const source = readProjectFile(relativePath)
    if (/<AppPageShellBody\b[^>]*scroll="hidden"[^>]*className="grid grid-cols-\[/.test(source)) {
      fixedShellSplits.push(relativePath)
    }
    if (/\bmin-w-\[(?:9\d{2}|1\d{3,})px\]/.test(source)) {
      largePageMinWidths.push(relativePath)
    }
  }

  assert.deepEqual(fixedShellSplits, [], 'page shell split layouts must start as one column and add fixed sidebars only behind responsive breakpoints')
  assert.deepEqual(largePageMinWidths, [], 'page-level sources must not use large fixed min-width utilities')

  const agentModeSource = readProjectFile('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx')
  const agentBrowserSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx')
  const agentConsoleNavSource = readProjectFile('apps/frontend/src/features/agent/components/AgentConsoleNav.tsx')
  const agentConsoleNavPackageSource = readProjectFile('packages/ui/src/components/business/agent/console-nav/index.tsx')
  const canvasResourceShelfSource = readProjectFile('apps/frontend/src/features/canvas/ui/CanvasResourceShelf.tsx')
  const productionProposalSemanticDiffSource = readProjectFile('apps/frontend/src/features/production/components/proposals/ProductionProposalSemanticDiffPanel.tsx')
  assert.match(agentModeSource, /AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(agentBrowserSource, /overflow-x-auto/)
  assert.match(agentConsoleNavSource, /\bAgentConsoleNavShell\b/)
  assert.match(agentConsoleNavSource, /\bAgentConsoleNavItem\b/)
  assert.match(agentConsoleNavSource, /\bAgentConsoleNavMeta\b/)
  assert.doesNotMatch(agentConsoleNavSource, /\bAgentSurfaceBlock\b/)
  assert.doesNotMatch(agentConsoleNavSource, /\bAppInlineMeta\b/)
  assert.match(agentConsoleNavSource, /agentConsoleSections\.map\(\(section\)[\s\S]*?<AgentConsoleNavItem[\s\S]*?active=\{isActive\}/)
  assert.match(agentConsoleNavSource, /<AgentConsoleNavMeta icon=\{ClipboardList\}>/)
  assert.match(agentConsoleNavPackageSource, /function AgentConsoleNavShell[\s\S]*?<AgentSurfaceBlock[\s\S]*?variant="subtle"/)
  assert.match(agentConsoleNavPackageSource, /function AgentConsoleNavItem[\s\S]*?<AgentSurfaceBlock[\s\S]*?variant=\{active \? "card" : "surface"\}/)
  assert.match(agentConsoleNavPackageSource, /function AgentConsoleNavMeta[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(agentConsoleNavSource, /overflow-x-auto/)
  assert.doesNotMatch(agentConsoleNavSource, /border-b border-border bg-muted\/20/)
  assert.doesNotMatch(agentConsoleNavSource, /rounded-md border px-2\.5 py-2/)
  assert.doesNotMatch(agentConsoleNavSource, /rounded border border-border bg-background px-2 py-1/)
  assert.doesNotMatch(canvasResourceShelfSource, /overflow-x-auto/)
  assert.doesNotMatch(productionProposalSemanticDiffSource, /overflow-x-auto/)
})

test('feature status visuals are gated by presentation semantic recipes', () => {
  const featureSources = walkFiles('apps/frontend/src/features', (relativePath) => /\.(ts|tsx)$/.test(relativePath))
  const forbiddenStatusVisuals = []
  const forbiddenPattern = /<StatusBadge\b[^\n>]*\btone=|<StatusDot\b[^\n>]*\btone=|<WorkbenchStatusBadge\b[^\n>]*\btone=|<ReviewProposalApplyGatePanel\b[^\n>]*\btone=|\bstatusTone=|\bSemanticTone\b|\bReviewTone\b/

  for (const relativePath of featureSources) {
    const source = readProjectFile(relativePath)
    if (forbiddenPattern.test(source)) {
      forbiddenStatusVisuals.push(relativePath)
    }
  }

  assert.deepEqual(
    forbiddenStatusVisuals,
    [],
    'feature code must map business state through presentation/*SemanticUi recipes before reaching status primitives',
  )

  for (const relativePath of [
    'apps/frontend/src/features/agent/presentation/agentSemanticUi.ts',
    'apps/frontend/src/features/canvas/presentation/canvasSemanticUi.ts',
    'apps/frontend/src/features/content/presentation/contentSemanticUi.ts',
    'apps/frontend/src/features/jobs/presentation/jobsSemanticUi.ts',
    'apps/frontend/src/features/organization/presentation/organizationSemanticUi.ts',
    'apps/frontend/src/features/production/presentation/productionSemanticUi.ts',
    'apps/frontend/src/features/project/presentation/projectSemanticUi.ts',
    'apps/frontend/src/features/pre-production/presentation/preProductionSemanticUi.ts',
    'apps/frontend/src/features/scripts/presentation/scriptsSemanticUi.ts',
  ]) {
    assert.ok(existsSync(path.join(root, relativePath)), `${relativePath} must own feature-level UI semantic recipes`)
  }
})

test('project task page consumes package-owned task layout patterns', () => {
  const projectTaskSource = readProjectFile('packages/ui/src/components/business/project/tasks/index.tsx')
  const projectTaskCss = readProjectFile('packages/ui/src/components/business/project/tasks/styles.css')
  const projectIndexSource = readProjectFile('packages/ui/src/components/business/project/index.tsx')
  const taskPageSource = readProjectFile('apps/frontend/src/features/project/components/TasksPage.tsx')

  assert.match(projectTaskSource, /export function ProjectTaskWorkflowGrid/)
  assert.match(projectTaskSource, /export function ProjectTaskMetricGrid/)
  assert.match(projectTaskSource, /export function ProjectTaskPageLayout/)
  assert.match(projectTaskSource, /export function ProjectTaskMainGrid/)
  assert.match(projectTaskSource, /export function ProjectTaskPanel/)
  assert.match(projectTaskSource, /export function ProjectTaskSurfaceItem/)
  assert.match(projectTaskSource, /export function ProjectTaskMeta/)
  assert.match(projectTaskSource, /export function ProjectTaskText/)
  assert.match(projectTaskSource, /export function ProjectTaskPurposeButton/)
  assert.match(projectTaskSource, /export function ProjectTaskListCard/)
  assert.match(projectTaskSource, /export function ProjectTaskDetailBlock/)
  assert.match(projectTaskSource, /export function ProjectTaskInfoItem/)
  assert.match(projectIndexSource, /ProjectTaskWorkflowGrid/)
  assert.match(projectIndexSource, /ProjectTaskPageLayout/)
  assert.match(projectIndexSource, /ProjectTaskMainGrid/)
  assert.match(projectIndexSource, /ProjectTaskPanel/)
  assert.match(projectTaskSource, /function ProjectTaskPageLayout[\s\S]*?<AppContentLayout/)
  assert.match(projectTaskSource, /function ProjectTaskPanel[\s\S]*?<AppPanel/)
  assert.match(projectTaskSource, /function ProjectTaskSurfaceItem[\s\S]*?<AppSurfaceItem/)
  assert.match(projectTaskSource, /function ProjectTaskMeta[\s\S]*?<AppInlineMeta/)
  assert.match(projectTaskSource, /function ProjectTaskListCard[\s\S]*?<WorkbenchListItem/)
  assert.match(projectTaskCss, /\.project-task-workflow-grid\s*\{/)
  assert.match(projectTaskCss, /\.project-task-metric-grid\s*\{/)
  assert.match(projectTaskCss, /\.project-task-main-grid\s*\{/)
  assert.match(projectTaskCss, /\.project-task-purpose-button\s*\{/)
  assert.match(projectTaskCss, /\.project-task-list-card__layout\s*\{/)
  assert.match(projectTaskCss, /\.project-task-panel__body\s*\{/)
  assert.match(taskPageSource, /ProjectTaskPageLayout/)
  assert.match(taskPageSource, /ProjectTaskMainGrid/)
  assert.match(taskPageSource, /ProjectTaskWorkflowGrid/)
  assert.match(taskPageSource, /ProjectTaskMetricGrid/)
  assert.match(taskPageSource, /ProjectTaskPanel/)
  assert.match(taskPageSource, /ProjectTaskSurfaceItem/)
  assert.match(taskPageSource, /ProjectTaskMeta/)
  assert.match(taskPageSource, /ProjectTaskText/)
  assert.match(taskPageSource, /ProjectTaskPurposeButton/)
  assert.match(taskPageSource, /ProjectTaskListCard/)
  assert.match(taskPageSource, /ProjectTaskDetailBlock/)
  assert.match(taskPageSource, /ProjectTaskInfoItem/)
  assert.doesNotMatch(taskPageSource, /className=|bodyClassName=/)
  assert.doesNotMatch(taskPageSource, /<(?:div|section|aside|p|span|button|label|h3)\b/)
  assert.doesNotMatch(taskPageSource, /\bAppContentLayout\b/)
  assert.doesNotMatch(taskPageSource, /\bAppPanel\b/)
  assert.doesNotMatch(taskPageSource, /\bAppSurfaceItem\b/)
  assert.doesNotMatch(taskPageSource, /\bAppInlineMeta\b/)
  assert.doesNotMatch(taskPageSource, /function DetailBlock/)
  assert.doesNotMatch(taskPageSource, /function Info/)
  assert.doesNotMatch(taskPageSource, /grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4/)
  assert.doesNotMatch(taskPageSource, /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5/)
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
  const overviewSource = readProjectFile('apps/frontend/src/features/project/components/ProjectOverviewPage.tsx')
  assert.doesNotMatch(appSource + '\n' + routeSource + '\n' + overviewSource, /ReferenceRelations|referenceRelations|reference-relations|workbenchReferenceRelations/)
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
  assert.match(adminPageSource, /<StatusBadge intent=\{CAPABILITY_STATUS_INTENT\[feature\.capability\] \?\? 'neutral'\} className="text-xs">/, 'admin capability badges must render through package status badge')
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
  assert.match(uiAppSource, /function AppStatusSurface[\s\S]*?data-tone=\{tone\}/, 'app status surface must own status container tone mapping')
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
  assert.match(adminPageSource, /invalid=\{!maxTokensOverrideValid\}/, 'admin invalid inputs must use primitive invalid API')
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
  const appSource = readProjectFile('apps/frontend/src/App.tsx')
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

  assert.doesNotMatch(appSource, /\btoneTextClass\b/, 'App shell must not reach into package tone helpers')
  assert.match(appSource, /<AppErrorFallback[\s\S]*?icon=\{<AlertTriangle size=\{20\} \/>\}/, 'Error boundary must use package-owned semantic icon shell')
  assert.match(appSource, /<AppBackendBootOverlay[\s\S]*?tone=\{isError \? 'danger' : 'info'\}/, 'Backend boot overlay must use semantic icon tone through package shell')

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
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to|via|ring|shadow|fill|stroke|dark:bg|dark:text|dark:border)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|lime|zinc|yellow|fuchsia|purple|red|green|gray|slate|neutral|pink)-\d/

  assert.doesNotMatch(frontendSources, rawPaletteClassPattern)
  assert.doesNotMatch(adminSources, rawPaletteClassPattern)
  assert.doesNotMatch(frontendSources, /\b(?:bg|text|border|ring|fill|stroke|hover:text)-(?:destructive|success|warning)(?:\b|\/)/, 'frontend source must use package semantic status contracts instead of status color utilities')
  assert.doesNotMatch(adminSources, /\b(?:bg|text|border|ring|fill|stroke|hover:text)-(?:destructive|success|warning)(?:\b|\/)/, 'admin source must use package semantic status contracts instead of status color utilities')
  assert.doesNotMatch(frontendSources, /ms-semantic-(?:icon|badge|surface|dot)--/)
  assert.doesNotMatch(semanticEntitySource, /@movscript\/ui/)
  assert.doesNotMatch(semanticEntitySource, /accentTextClass/)
  assert.match(semanticEntitySource, /type SemanticEntityAccent/)
  assert.doesNotMatch(semanticEntitySource, /accentToneClass/)
})
