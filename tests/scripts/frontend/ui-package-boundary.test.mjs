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
    'packages/ui/src/components/business/agent/panel/provider-session/styles.css',
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
    'packages/ui/src/components/business/agent/run-interaction/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/code/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/feedback/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/card/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/badge/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/thumbnail/styles.css',
    'packages/ui/src/components/business/agent/shell/code-block/styles.css',
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
    'packages/ui/src/components/business/agent/run/field/styles.css',
    'packages/ui/src/components/business/agent/run/tool-step/styles.css',
    'packages/ui/src/components/business/agent/work/index.tsx',
    'packages/ui/src/components/business/agent/work/styles.css',
    'packages/ui/src/components/business/agent/composer/index.tsx',
    'packages/ui/src/components/business/agent/composer/styles.css',
    'packages/ui/src/components/business/agent/settings/styles.css',
    'packages/ui/src/components/business/agent/pinned-status/styles.css',
    'packages/ui/src/components/business/agent/browser/styles.css',
    'packages/ui/src/components/business/agent/responsive/styles.css',
  ].map(readProjectFile).join('\n')
}

function readAgentChatSource() {
  return [
    'packages/ui/src/components/business/agent/chat/index.tsx',
    'packages/ui/src/components/business/agent/chat/types.ts',
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
    'packages/ui/src/components/business/agent/run-interaction/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/code/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/feedback/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/card/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/badge/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/thumbnail/index.tsx',
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
    'packages/ui/src/components/business/review/workspace/index.tsx',
    'packages/ui/src/components/business/review/workspace/workspace/index.tsx',
    'packages/ui/src/components/business/review/workspace/shell/index.tsx',
    'packages/ui/src/components/business/review/workspace/empty-state/index.tsx',
    'packages/ui/src/components/business/review/workspace/impact/index.tsx',
    'packages/ui/src/components/business/review/workspace/footer-actions/index.tsx',
    'packages/ui/src/components/business/review/workspace/apply-gate/index.tsx',
    'packages/ui/src/components/business/review/workspace/upstream/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readReviewCss() {
  return [
    'packages/ui/src/components/business/review/styles.css',
    'packages/ui/src/components/business/review/change-action/styles.css',
    'packages/ui/src/components/business/review/callout/styles.css',
    'packages/ui/src/components/business/review/workspace/styles.css',
    'packages/ui/src/components/business/review/workspace/workspace/styles.css',
    'packages/ui/src/components/business/review/workspace/empty-state/styles.css',
    'packages/ui/src/components/business/review/workspace/impact/styles.css',
    'packages/ui/src/components/business/review/workspace/footer-actions/styles.css',
    'packages/ui/src/components/business/review/workspace/apply-gate/styles.css',
    'packages/ui/src/components/business/review/workspace/upstream/styles.css',
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

function readSettingSource() {
  return [
    'packages/ui/src/components/business/resource/setting/index.tsx',
    'packages/ui/src/components/business/resource/setting/types.ts',
    'packages/ui/src/components/business/resource/setting/meta.ts',
    'packages/ui/src/components/business/resource/setting/icons.tsx',
    'packages/ui/src/components/business/resource/setting/card/index.tsx',
  ].map(readProjectFile).join('\n')
}

function readSettingCss() {
  return [
    'packages/ui/src/components/business/resource/setting/styles.css',
    'packages/ui/src/components/business/resource/setting/shell/styles.css',
    'packages/ui/src/components/business/resource/setting/visual/styles.css',
    'packages/ui/src/components/business/resource/setting/body/styles.css',
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
    'packages/ui/src/components/business/agent/panel/provider-session/styles.css',
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
    'packages/ui/src/components/business/agent/run-interaction/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/code/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/feedback/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/card/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/badge/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/thumbnail/styles.css',
    'packages/ui/src/components/business/agent/shell/code-block/styles.css',
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
    'packages/ui/src/components/business/agent/run-interaction/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/code/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/code/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/feedback/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/feedback/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/card/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/card/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/badge/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/badge/styles.css',
    'packages/ui/src/components/business/agent/run-interaction/thumbnail/index.tsx',
    'packages/ui/src/components/business/agent/run-interaction/thumbnail/styles.css',
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
    'packages/ui/src/components/business/resource/setting/index.tsx',
    'packages/ui/src/components/business/resource/setting/types.ts',
    'packages/ui/src/components/business/resource/setting/meta.ts',
    'packages/ui/src/components/business/resource/setting/icons.tsx',
    'packages/ui/src/components/business/resource/setting/card/index.tsx',
    'packages/ui/src/components/business/resource/setting/styles.css',
    'packages/ui/src/components/business/resource/setting/shell/styles.css',
    'packages/ui/src/components/business/resource/setting/visual/styles.css',
    'packages/ui/src/components/business/resource/setting/body/styles.css',
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
    'packages/ui/src/components/business/review/workspace/index.tsx',
    'packages/ui/src/components/business/review/workspace/styles.css',
    'packages/ui/src/components/business/review/workspace/shell/index.tsx',
    'packages/ui/src/components/business/review/workspace/empty-state/index.tsx',
    'packages/ui/src/components/business/review/workspace/empty-state/styles.css',
    'packages/ui/src/components/business/review/workspace/impact/index.tsx',
    'packages/ui/src/components/business/review/workspace/impact/styles.css',
    'packages/ui/src/components/business/review/workspace/footer-actions/index.tsx',
    'packages/ui/src/components/business/review/workspace/footer-actions/styles.css',
    'packages/ui/src/components/business/review/workspace/apply-gate/index.tsx',
    'packages/ui/src/components/business/review/workspace/apply-gate/styles.css',
    'packages/ui/src/components/business/organization/index.tsx',
    'packages/ui/src/components/business/organization/styles.css',
    'packages/ui/src/components/business/plugins/index.tsx',
    'packages/ui/src/components/business/plugins/styles.css',
    'packages/ui/src/components/business/project/index.tsx',
    'packages/ui/src/components/business/project/styles.css',
    'packages/ui/src/components/business/project/workspace-review/index.tsx',
    'packages/ui/src/components/business/project/workspace-review/styles.css',
    'packages/ui/src/components/business/production/index.tsx',
    'packages/ui/src/components/business/production/styles.css',
    'packages/ui/src/components/business/production/workspace-review/index.tsx',
    'packages/ui/src/components/business/production/workspace-review/styles.css',
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
  const settingCardSource = readSettingSource()
  const settingCss = readSettingCss()
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
  const scriptsPageCss = readProjectFile('packages/ui/src/components/business/scripts/page/styles.css')
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
  assert.doesNotMatch(uiStylesCss, /hsl\(var\(--/)
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
  assert.match(scriptsPackageCss, /@import "\.\/page\/styles\.css";/)
  assert.match(scriptsPageCss, /\.script-workbench-layout\s*\{/)
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
  assert.match(canvasMediaCss, /\.canvas-resource-shelf-thumb-frame\[data-compact="false"\]\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%[\s\S]*min-height:\s*0/)
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
  assert.match(resourceCss, /@import "\.\/setting\/styles\.css";/)
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
  assert.match(settingCss, /\.setting-card\s*\{/)
  assert.match(resourceLibraryPickerCss, /\.resource-library-picker\s*\{/)
  assert.match(scriptReferenceCss, /\.resource-script-reference-panel\s*\{/)
  assert.match(settingCardSource, /export function SettingCard/)
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
  assert.match(businessIndexSource, /SettingCard/)
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
  const scriptsPageSource = readProjectFile('apps/frontend/src/features/scripts/components/ScriptsPage.tsx')
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
  assert.match(appBusinessSource, /export const AppToastShell/)
  assert.match(scriptsPageSource, /\bScriptCreateDialog\b/)
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
  const uiScriptsPageCss = readProjectFile('packages/ui/src/components/business/scripts/page/styles.css')
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
    uiScriptsPageCss,
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
    'asset-prep-workbench',
    'asset-prep-layout',
    'asset-prep-side',
    'asset-prep-workspace',
    'production-layout',
    'production-side',
    'production-context-stack',
    'production-candidate-row',
    'script-workbench-shell',
    'script-workbench-frame',
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
  assert.match(appSource, /export const AppSurfaceItem/)
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

  const dashboardExportNames = [
    'AppDashboardHeroGrid',
    'AppDashboardSplit',
    'AppDashboardRegion',
    'AppDashboardSection',
    'AppDashboardSectionHeader',
    'AppDashboardMetric',
    'AppDashboardEntry',
    'AppDashboardLane',
    'AppDashboardDividerBlock',
    'AppDashboardLaneSummary',
    'AppDashboardMetaCell',
  ]

  for (const exportName of dashboardExportNames) {
    assert.match(appSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must own dashboard package styles`)
  }
  for (const exportName of dashboardExportNames.filter((name) => name !== 'AppDashboardSectionHeader')) {
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
  const movScriptWorkspaceFilesSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
  const agentSettingsUiSource = readProjectFile('packages/ui/src/components/business/agent/settings/index.tsx')
  const agentRunCardPackageSource = readProjectFile('packages/ui/src/components/business/agent/run/card/index.tsx')
  const agentBrowserSource = readProjectFile('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx')
  const pinnedStatusShelfSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
  const agentResultSurfaceSources = [
    'apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx',
    'apps/frontend/src/features/agent/components/AgentPlanOverviewPanel.tsx',
    'apps/frontend/src/features/agent/components/GeneratedResultCard.tsx',
    'apps/frontend/src/features/agent/components/ContextDiagnosticCard.tsx',
    'apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx',
    'apps/frontend/src/features/agent/components/AgentMentionEditor.tsx',
    'apps/frontend/src/features/agent/components/AgentMessageContent.tsx',
    'apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx',
    'apps/frontend/src/features/agent/components/AgentComposerSection.tsx',
  ].map((relativePath) => readProjectFile(relativePath)).join('\n')
  const sources = agentConsoleSource
  const agentSettingsOwnershipSource = `${agentSettingsSource}\n${agentSettingsUiSource}`
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
  assert.match(movScriptWorkspaceFilesSource, /MovScriptWorkspaceFilesPage/)
  assert.match(movScriptWorkspaceFilesSource, /<AgentPageShell data-testid="movscript-workspace-files-page">/)
  assert.match(movScriptWorkspaceFilesSource, /\bAgentPageShellHeader\b/)
  assert.match(movScriptWorkspaceFilesSource, /\bAgentPageShellBody\b/)
  assert.match(movScriptWorkspaceFilesSource, /\brequireWorkspaceFilesAPI\b/)
  assert.doesNotMatch(movScriptWorkspaceFilesSource, /\bAIWorkspacesPage\b/)
  assert.doesNotMatch(movScriptWorkspaceFilesSource, /\bagentWorkspaceFiles\b/)
  assert.match(agentRunCardPackageSource, /function agentRunMetricTone[\s\S]*?if \(state === "ready"\) return "success"/)
  assert.match(agentRunCardPackageSource, /function AgentRunMetricCard[\s\S]*?<AgentRunToneSurfaceBlock[\s\S]*?variant="card"/)
  assert.match(agentRunCardPackageSource, /function AgentRunMetricCard[\s\S]*?<AgentRunToneText/)
  assert.match(agentConsoleSource, /<AgentConsoleLocalToolCard invalid=\{!provider\.ok\}>/)
  assert.match(agentConsoleSource, /<AgentConsoleLocalToolCard invalid=\{!result\.ok\}>/)
  assert.match(agentConsoleSource, /<AgentConsoleLocalToolCard invalid=\{status === 'failed'\}>/)
  assert.match(agentConsoleSource, /function ConsoleMetricCard[\s\S]*?<AgentConsoleMetricCard/)
  assert.match(agentConsolePackageSource, /function AgentConsoleLocalToolCard[\s\S]*?<AgentConsoleToneSurfaceBlock[\s\S]*?tone=\{invalid \? "danger" : undefined\}/)
  assert.match(agentConsolePackageSource, /AgentConsoleToneSurfaceBlock[\s\S]*?toneSurfaceClass\(tone\)/)
  assert.match(agentConsolePackageSource, /AgentConsoleMetricCard[\s\S]*?tone === "action" \? XCircle/)
  assert.doesNotMatch(movScriptWorkspaceFilesSource, /<pre\b/)
  assert.doesNotMatch(sources, /rounded-md border border-border bg-(?:background|muted\/10|card)/)
  assert.match(agentResultSurfaceSources, /AgentSurfaceBlock/)
  const agentBrowserExportNames = [
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
  ]
  for (const exportName of agentBrowserExportNames) {
    assert.match(agentSource, new RegExp(`export function ${exportName}\\b|export const ${exportName}\\b`), `${exportName} must be package-owned`)
  }
  for (const exportName of agentBrowserExportNames.filter((name) => !['AgentBrowserKeyValue', 'AgentBrowserDataBlock'].includes(name))) {
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
  assert.doesNotMatch(pinnedStatusShelfSource, /rounded border border-dashed border-border\/70 bg-muted\/20/)
  assert.doesNotMatch(pinnedStatusShelfSource, /function PinnedEmptyState/)
  assert.doesNotMatch(agentResultSurfaceSources, /rounded-md border border-border bg-background(?:\/70)?/)
  for (const testId of migratedSettingsSurfaceIds) {
    if (testId === 'agent-settings-model-compatibility-probes') {
      assert.match(agentSettingsSource, /<AgentSettingsStatusPanel[\s\S]*?testId="agent-settings-model-compatibility-probes"/)
      assert.match(agentSettingsUiSource, /<AgentSurfaceBlock[^>]+data-testid=\{testId\}/)
    } else if (testId === 'agent-settings-config-file-skill-activation') {
      assert.match(agentSettingsSource, /<AgentSettingsStack data-testid="agent-settings-config-file-skill-activation"/)
    } else if (testId === 'agent-settings-config-file-limits') {
      assert.match(agentSettingsSource, /<AgentSettingsFormGrid columns="model" data-testid="agent-settings-config-file-limits"/)
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
  assert.match(agentSettingsUiSource, /export function AgentSettingsConfigFileCard/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsConfigFileDiffPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsConfigFileSummaryList/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSkillCard/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPermissionsDiffPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSnapshotImportScopePanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSnapshotSummaryPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsAuditTrailPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsSnapshotImpactPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsFormGrid/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsFormField/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPermissionsFilterPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPermissionsFilterPresetPanel/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPermissionsBulkActionPanel/)
  assert.match(agentSettingsUiSource, /statusProps: AgentSettingsStatusProps/)
  assert.match(agentSettingsSource, /statusProps: agentSettingsStatusRecipe/)
  assert.match(agentSettingsSource, /<AgentSettingsStateMessage[\s\S]*?text=\{t\('common\.loading'\)\}/)
  assert.match(agentSettingsSource, /<AgentSettingsKeyValue[\s\S]*?label=\{t\('agents\.settings\.fields\.modelId'\)\}/)
  assert.match(agentSettingsSource, /<AgentSettingsCallout[\s\S]*?data-testid="agent-settings-provider-model-id-secret-warning"/)
  assert.match(agentSettingsSource, /<AgentSettingsToneText[\s\S]*?tone="warning"[\s\S]*?agents\.settings\.toolPermissionsWorkspaceIssues/)
  assert.doesNotMatch(agentSettingsSource, /\b(?:AppStateMessage|AppKeyValue|ReviewCallout|toneTextClass)\b/)
  assert.match(agentSettingsSource, /badgeProps=\{agentSettingsApiModeBadgeRecipe\(mode\.badge\)\}/)
  assert.doesNotMatch(agentSettingsUiSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(agentSettingsUiSource, /\bbadgeTone\b/)
  assert.doesNotMatch(agentSettingsUiSource, /\btrustTone\b/)
  assert.doesNotMatch(agentSettingsSource, /agentSettingsStatusTone|agentSettingsApiModeBadgeTone/)
  assert.doesNotMatch(agentSettingsSource, /\bbadgeTone=|\btrustTone=/)
  assert.doesNotMatch(agentSettingsSource, /flex min-h-8 items-center gap-2 rounded-md border border-border bg-background px-2 type-label/)
  assert.match(agentSettingsSource, /testResult && \([\s\S]*?<AgentDataBlock>[\s\S]*?<AgentSettingsCodeBlock>/)
  assert.doesNotMatch(agentSettingsSource, /\bAppCodeBlock\b/)
  assert.doesNotMatch(agentSettingsSource, /packPlugins\.map[\s\S]*?<AgentSurfaceBlock key=\{plugin\.pluginId\} variant="card"/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPermissionsFilterPanel[\s\S]*?filterOptions=\{TOOL_PERMISSIONS_FILTER_OPTIONS\.map/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPermissionsFilterPresetPanel[\s\S]*?presets=\{agentSettings\.toolPermissionsFilterPresets\.map/)
  assert.match(agentSettingsSource, /<AgentSettingsToolPermissionsBulkActionPanel[\s\S]*?applyToolPermissionsBulkEdit\('allow_available'\)/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsFilterPanel[\s\S]*?<Input[\s\S]*?data-testid="agent-settings-tool-permissions-search"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsFilterPanel[\s\S]*?<Select[\s\S]*?onValueChange=\{onFilterChange\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsFilterPresetPanel[\s\S]*?presets\.map[\s\S]*?<AgentSurfaceBlock key=\{preset\.id\} variant="subtle"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsBulkActionPanel[\s\S]*?data-testid="agent-settings-tool-permissions-bulk-actions"/)
  assert.doesNotMatch(agentSettingsSource, /agentSettings\.toolPermissionsFilterPresets\.map[\s\S]*?<AgentSurfaceBlock key=\{preset\.id\} variant="subtle"/)
  assert.match(agentSettingsSource, /<Select value=\{selectedModelId\} onValueChange=\{setSelectedModelId\}>[\s\S]*?textModels\.map\(\(model\) => \([\s\S]*?<SelectItem key=\{model\.id\} value=\{publicModelId\(model\)\}>/)
  assert.doesNotMatch(agentSettingsSource, /AgentSettingsModelOptionButton/)
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
  assert.match(agentSettingsSource, /<AgentSettingsFormGrid columns="model" data-testid="agent-settings-config-file-limits"/)
  assert.match(agentSettingsSource, /CONFIG_FILE_LIMIT_KEYS\.map\(\(key\) => \([\s\S]*?data-testid=\{`agent-settings-config-file-limit-\$\{key\}`\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsFormGrid[\s\S]*?data-columns=\{columns\}/)
  assert.match(agentSettingsUiSource, /function AgentSettingsFormField[\s\S]*?<div className=\{cn\("agent-settings-form-field"/)
  assert.match(agentSettingsSource, /function ToolPermissionsDiffPreview[\s\S]*?AgentSettingsToolPermissionsDiffPanel/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsDiffPanel[\s\S]*?<AgentSurfaceBlock[\s\S]*?data-testid="agent-settings-tool-permissions-diff"/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsDiffPanel[\s\S]*?<StatusBadge/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPermissionsDiffPreview[\s\S]{0,2200}<AgentSurfaceBlock/)
  assert.match(agentSettingsUiSource, /export function AgentSettingsToolPermissionsRow/)
  assert.match(agentSettingsSource, /function ToolPermissionsRow[\s\S]*?AgentSettingsToolPermissionsRow/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsRow[\s\S]*?<Select/)
  assert.match(agentSettingsUiSource, /function AgentSettingsToolPermissionsRow[\s\S]*?<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPermissionsRow[\s\S]{0,2200}<AgentSurfaceBlock/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPermissionsRow[\s\S]{0,2200}<Select/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPermissionsRow[\s\S]{0,2200}<AppInlineMeta/)
  assert.doesNotMatch(agentSettingsSource, /function ToolPermissionsRow[\s\S]{0,2600}rounded bg-background px-1\.5 py-0\.5/)
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
    'ProviderSessionStatusContent',
    'ProviderSessionStatusDetail',
    'ProviderSessionStatusHeader',
    'ProviderSessionStatusSuccessIcon',
  ]) {
    assert.match(agentSource, new RegExp(`export (?:const|function) ${exportName}\\b`), `${exportName} must be package-owned`)
    assert.match(chatBubblesSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by agent chat bubbles`)
  }
  assert.match(agentSource, /ProviderSessionStatusSuccessIcon[\s\S]*?toneTextClass\("success"\)/)
  for (const sharedClass of [
    'ms-agent-chat-footer-badges',
    'ms-agent-chat-tiny-badge',
    'ms-agent-chat-status-line',
    'ms-agent-chat-result-stack',
    'ms-agent-chat-attachment-grid',
    'ms-agent-model-setup-callout',
    'ms-agent-session-status',
    'ms-agent-session-status__icon',
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
  const movScriptWorkspaceFilesSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
  const agentSettingsSource = readProjectFile('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
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
    'ai-agent-panel-conversation-tab-session-light',
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
  assert.match(movScriptWorkspaceFilesSource, /AgentPageShell/)
  assert.match(agentSettingsSource, /<Select value=\{selectedModelId\} onValueChange=\{setSelectedModelId\}>/)
  assert.match(readProjectFile('packages/ui/src/components/business/agent/debug/index.tsx'), /export function AgentDebugPanel[\s\S]*?<AppPanel/)
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
  assert.doesNotMatch(projectAgentModeSource, /function AgentModeProjectSelectCard\b/)
  assert.match(projectAgentModeSource, /<DropdownMenuTrigger asChild>[\s\S]*?<AgentModeProjectSelectButton>/)
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

test('desktop entity and setting tones use @movscript/ui contracts', () => {
  const detailPackageSource = readDetailSource()
  const settingCardSource = readSettingSource()
  const uiSemanticHelperSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const uiCss = readProjectFile('packages/ui/src/base.css')
  const rawPaletteClassPattern = /\b(?:bg|text|border|from|to)-(?:sky|cyan|blue|teal|emerald|amber|orange|rose|violet|indigo|zinc|yellow|fuchsia|purple)-\d/

  assert.doesNotMatch(detailPackageSource, rawPaletteClassPattern)
  assert.doesNotMatch(settingCardSource, rawPaletteClassPattern)
  assert.match(detailPackageSource, /DetailEntityHeader/)
  assert.match(detailPackageSource, /DetailPill/)
  assert.match(detailPackageSource, /DetailPreviewFieldList/)
  assert.match(settingCardSource, /accentTextClass|accentSoftClass|accentDotClass|accentGradientClass/)
  assert.doesNotMatch(settingCardSource, /accentToneClass/)
  assert.match(settingCardSource, /StatusBadge/)
  assert.match(settingCardSource, /settingStatusMeta[\s\S]*?intent: StatusIntent/)
  assert.match(settingCardSource, /<StatusBadge intent=\{status\.intent\}/)
  assert.doesNotMatch(settingCardSource, /\bSemanticTone\b/)
  assert.doesNotMatch(settingCardSource, /<StatusBadge\b[^>]*\btone=/)
  assert.doesNotMatch(settingCardSource, /semanticToneClass/)
  assert.doesNotMatch(detailPackageSource, /rounded border border-border bg-background\/80 px-1\.5 py-0\.5/)
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

test('projects shell primitives use @movscript/ui', () => {
  const projectsSource = readProjectFile('apps/frontend/src/features/project/components/ProjectsPage.tsx')
  const projectPagePackageSource = readProjectFile('packages/ui/src/components/business/project/page/index.tsx')
  const projectPagePackageCss = readProjectFile('packages/ui/src/components/business/project/page/styles.css')
  const projectSemanticUiSource = readProjectFile('apps/frontend/src/features/project/presentation/projectSemanticUi.ts')

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
  for (const exportName of ['PluginBannerDismissAction', 'PluginButtonIcon', 'PluginCardSurface', 'PluginDialogSurface', 'PluginEmptyState', 'PluginFileInput', 'PluginSearchInput', 'PluginStateBanner', 'PluginStatusMeta', 'PluginTabButton', 'PluginTabCount', 'PluginTabGroup', 'PluginTagMeta', 'PluginToneText', 'Button']) {
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
  assert.match(clientPluginsSource, /<PluginFileInput[\s\S]*?ref=\{fileInputRef\}[\s\S]*?type="file"/)
  assert.match(clientPluginsSource, /<PluginTabGroup>[\s\S]*?<PluginTabButton[\s\S]*?active=\{tab === 'installed'\}/)
  assert.match(clientPluginsSource, /<PluginTabButton[\s\S]*?active=\{tab === 'marketplace'\}/)
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
  assert.match(standardsSource, /standardGroups\.map[\s\S]*?ProjectStandardsSurfaceItem/, 'core standard cards must use package project standards surface items')
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

test('agent generation and provider session interactions use package tone contracts', () => {
  const generationDisplaySource = readProjectFile('apps/frontend/src/features/agent/domain/agentGenerationDisplay.ts')
  const generationCardsSource = readProjectFile('apps/frontend/src/features/agent/components/GenerationCards.tsx')
  const pinnedStatusShelfSource = readProjectFile('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
  const agentGeneratedFeedbackSource = readProjectFile('packages/ui/src/components/business/agent/generated/feedback/index.tsx')
  const agentPlanOverviewTaskSource = readProjectFile('packages/ui/src/components/business/agent/plan-overview/task/index.tsx')
  const agentPlanOverviewTaskCss = readProjectFile('packages/ui/src/components/business/agent/plan-overview/task/styles.css')
  const agentRunInteractionApprovalStatusSource = readProjectFile('packages/ui/src/components/business/agent/run-interaction/status/index.ts')
  const agentRunInteractionApprovalCardSource = readProjectFile('packages/ui/src/components/business/agent/run-interaction/card/index.tsx')
  const agentSemanticUiSource = readProjectFile('apps/frontend/src/features/agent/presentation/agentSemanticUi.ts')
  const providerSessionInteractionsSource = readProjectFile('apps/frontend/src/features/agent/components/providerSessionInteractions.tsx')
  const movScriptWorkspaceFilesSource = readProjectFile('apps/frontend/src/features/agent/components/MovScriptWorkspaceFilesPage.tsx')
  const agentArtifactResultCardsSource = readProjectFile('apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx')
  const sources = [
    generationCardsSource,
    pinnedStatusShelfSource,
    providerSessionInteractionsSource,
    movScriptWorkspaceFilesSource,
    agentArtifactResultCardsSource,
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
  assert.doesNotMatch(providerSessionInteractionsSource, /AgentSurfaceBlock/)
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
  assert.match(agentRunInteractionApprovalStatusSource, /export function agentRunInteractionApprovalSectionClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /export function agentRunInteractionApprovalBadgeClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /export function agentRunInteractionApprovalInputChoiceClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /toneSurfaceClass/)
  assert.match(agentRunInteractionApprovalStatusSource, /toneTextClass/)
  assert.match(agentRunInteractionApprovalCardSource, /AgentRunInteractionRequestCard[\s\S]*?<AgentSurfaceBlock/)
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

  for (const exportName of ['ScriptWorkspaceShell', 'ScriptWorkspaceLayout', 'ScriptWorkspaceMain', 'ScriptWorkspaceInspector', 'ScriptWorkspaceStat', 'ScriptMetricBox', 'ScriptVersionHistoryPanel', 'ScriptVersionEmptyState', 'ScriptProductionPanel', 'ScriptProductionNotice', 'ScriptCollaborationStack', 'ScriptAgentAssistPanel', 'ScriptReadinessPanel', 'ScriptWorkflowPanel', 'ScriptVersionBlockShell', 'ScriptVersionLineEditor', 'ScriptBlockCard', 'ScriptBlockSelectField', 'ScriptDetailHeader', 'ScriptDetailTabs', 'ScriptLibraryEmptyState', 'ScriptLibraryGroup', 'ScriptLibraryItem', 'ScriptLibraryRail', 'ScriptVersionCard', 'StatusBadge', 'Badge']) {
    assert.match(scriptsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by scripts workspace`)
  }
  for (const exportName of ['AppPanel', 'AppProgressBar', 'AppMetricCard', 'AppEmptyState', 'AppStateMessage', 'AppSurfaceItem', 'NativeSelect', 'Textarea']) {
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
