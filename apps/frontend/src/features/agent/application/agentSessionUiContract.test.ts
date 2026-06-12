import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function sourceFunctionBlock(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `missing function ${functionName}`)
  const bodyStart = source.indexOf('{', start)
  assert.ok(bodyStart >= 0, `missing function body for ${functionName}`)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(bodyStart, index + 1)
    }
  }
  assert.fail(`unterminated function ${functionName}`)
}

function uiAgentGeneratedFeedbackSource(): string {
  return readFileSync(resolve('../../packages/ui/src/components/business/agent/generated/feedback/index.tsx'), 'utf8')
}

test('agent session UI keeps worker trace summary contracts without run detail pages', () => {
  const planOverviewSource = readFileSync(resolve('src/features/agent/components/AgentPlanOverviewPanel.tsx'), 'utf8')

  assert.match(planOverviewSource, /const \[traceSummaries, setTraceSummaries\]/)
  assert.match(planOverviewSource, /const \[traceEventsByRunId, setTraceEventsByRunId\]/)
  assert.match(planOverviewSource, /providerSessionClient\.forSession\(\{ sessionId: snapshotSessionId \}\)/)
  assert.match(planOverviewSource, /providerSessionTraceClient\.getRunTraceSummary\(runId\)/)
  assert.match(planOverviewSource, /providerSessionTraceClient\.getRunTraceEvents\(runId, \{ limit: 8/)
  assert.match(planOverviewSource, /navigate\(ROUTES\.agentConsole\)/)
  assert.match(planOverviewSource, /traceEventHasMoreByRunId/)
  assert.match(planOverviewSource, /traceEventKindFilters/)
  assert.match(planOverviewSource, /轨迹统计/)
  assert.match(planOverviewSource, /运行事件/)
  assert.match(planOverviewSource, /加载更多/)
})

test('desktop bootstrap does not auto-start a workspace-global provider session', () => {
  const managedBootstrapSource = readFileSync(resolve('electron/managedServices/bootstrap.ts'), 'utf8')
  const settingsIpcSource = readFileSync(resolve('electron/ipc/settingsIpc.ts'), 'utf8')

  assert.doesNotMatch(managedBootstrapSource, new RegExp(['ensure', 'Agent', 'Runtime', 'Running'].join('')))
  assert.doesNotMatch(managedBootstrapSource, new RegExp(['start', 'Agent', 'Runtime', 'On', 'App', 'Ready'].join('')))
  assert.doesNotMatch(managedBootstrapSource, /registerDesktopMCPProviderWithAgent/)
  assert.match(managedBootstrapSource, /provider sessions will use this backend by default/)

  assert.doesNotMatch(settingsIpcSource, new RegExp(['ensure', 'Agent', 'Runtime', 'Running'].join('')))
  assert.doesNotMatch(settingsIpcSource, new RegExp(['get', 'Agent', 'Runtime', 'Launch', 'Policy'].join('')))
  assert.match(settingsIpcSource, /ensureMCPServerReady/)
})

test('agent composer supports clipboard file uploads with a blocking resource transfer dialog', () => {
  const composerControllerSource = readFileSync(resolve('src/features/agent/presentation/useAgentComposerController.ts'), 'utf8')
  const composerSectionSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const mentionEditorSource = readFileSync(resolve('src/features/agent/components/AgentMentionEditor.tsx'), 'utf8')
  const layoutPropsSource = readFileSync(resolve('src/features/agent/presentation/agentChatViewLayoutProps.ts'), 'utf8')

  assert.match(composerControllerSource, /function clipboardFiles\(event: ClipboardEvent\): File\[\]/)
  assert.match(composerControllerSource, /acceptAgentComposerDropDragOver\(event\.dataTransfer\)/)
  assert.match(composerControllerSource, /agentComposerDropKind\(event\.dataTransfer\)/)
  assert.match(composerControllerSource, /readAgentComposerResourceDrop\(event\.dataTransfer\)/)
  assert.doesNotMatch(composerControllerSource, /event\.dataTransfer\.dropEffect = 'copy'/)
  assert.doesNotMatch(composerControllerSource, /hasResourceDragPayload/)
  assert.doesNotMatch(composerControllerSource, /readResourceDragPayload/)
  assert.match(composerControllerSource, /event\.clipboardData\.files/)
  assert.match(composerControllerSource, /item\.getAsFile\(\)/)
  assert.match(composerControllerSource, /async function handleComposerPaste\(event: ClipboardEvent\)/)
  assert.match(composerControllerSource, /await uploadFiles\(files\)/)
  assert.match(composerControllerSource, /setUploading\(true\)[\s\S]*setUploadingFileNames/)
  assert.match(composerControllerSource, /setUploadedFileCount\(index \+ 1\)/)
  assert.match(composerSectionSource, /showAttachmentTools = true/)
  assert.match(composerSectionSource, /showMentionTools = true/)
  assert.match(composerSectionSource, /showDebugPreview = true/)
  assert.match(composerSectionSource, /\{showAttachmentTools \? \(/)
  assert.match(composerSectionSource, /\{showMentionTools \? \(/)
  assert.match(composerSectionSource, /\{showDebugPreview \? \(/)
  assert.match(composerSectionSource, /<Dialog open=\{uploading\}>/)
  assert.match(composerSectionSource, /hideClose/)
  assert.match(composerSectionSource, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(composerSectionSource, /agents\.chat\.uploadDialogDescription/)
  assert.match(composerSectionSource, /onPaste=\{onComposerPaste\}/)
  assert.match(mentionEditorSource, /onPaste\?\.\(event\)/)
  assert.match(mentionEditorSource, /if \(event\.defaultPrevented\) return/)
  assert.match(layoutPropsSource, /onComposerPaste: composer\.handleComposerPaste/)
})

test('agent chat composer uses the same chrome in page and detail surfaces', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const panelShellLayoutCss = readFileSync(resolve('../../packages/ui/src/components/business/agent/panel/shell-layout/styles.css'), 'utf8')

  assert.match(dataSourceShellSource, /<AgentComposerSection[\s\S]*?chrome="flush"/)
  assert.match(dataSourceShellSource, /ai-agent-panel-composer-wrap/)
  assert.match(panelShellLayoutCss, /\.ai-agent-panel-shell \.ai-agent-panel-composer-wrap/)
  assert.doesNotMatch(dataSourceShellSource, /chrome=\{surface === 'page' \? 'flush' : 'bottom-bar'\}/)
})
