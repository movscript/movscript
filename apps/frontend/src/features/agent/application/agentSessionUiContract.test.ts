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

function sourceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing source marker ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  assert.ok(end >= 0, `missing source marker ${endNeedle}`)
  return source.slice(start, end)
}

test('agent session UI keeps worker trace summary contracts without run detail pages', () => {
  const planOverviewSource = [
    readFileSync(resolve('src/features/agent/components/AgentPlanOverviewPanel.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentPlanOverviewWorkerSection.tsx'), 'utf8'),
  ].join('\n')

  assert.match(planOverviewSource, /const \[traceSummaries, setTraceSummaries\]/)
  assert.match(planOverviewSource, /const \[traceEventsByRunId, setTraceEventsByRunId\]/)
  assert.match(planOverviewSource, /getAgentRunTraceSummary\(\{/)
  assert.match(planOverviewSource, /listAgentRunTraceEvents\(\{/)
  assert.doesNotMatch(planOverviewSource, /providerSessionClient|providerSessionTraceClient|shared\/infrastructure\/providerSessionClient/)
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
  const composerControllerSource = readAgentComposerControllerContractSource()
  const composerSectionSource = [
    readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentComposerToolbarSection.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentComposerUploadDialog.tsx'), 'utf8'),
  ].join('\n')
  const composerShellSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const composerToolbarSource = readFileSync(resolve('src/features/agent/components/AgentComposerToolbarSection.tsx'), 'utf8')
  const composerModelSelectorSource = readFileSync(resolve('src/features/agent/components/AgentComposerModelSelector.tsx'), 'utf8')
  const mentionEditorSource = readFileSync(resolve('src/features/agent/components/AgentMentionEditor.tsx'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')

  assert.match(composerControllerSource, /function agentComposerClipboardFiles\(event: ClipboardEvent\): File\[\]/)
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
  assert.match(composerShellSource, /<AgentComposerToolbarSection/)
  assert.doesNotMatch(composerShellSource, /DropdownMenuContent/)
  assert.match(composerToolbarSource, /export function AgentComposerToolbarSection/)
  assert.match(composerToolbarSource, /<AgentComposerToolbar>/)
  assert.match(composerToolbarSource, /<AgentComposerModelSelector/)
  assert.match(composerModelSelectorSource, /<NativeSelect[\s\S]*onChange=\{\(event\) => onModelChange/)
  assert.doesNotMatch(composerModelSelectorSource, /@radix-ui\/react-select/)
  assert.doesNotMatch(composerModelSelectorSource, /SelectTrigger|SelectContent|SelectItem/)
  assert.match(composerToolbarSource, /<AgentComposerSubmit/)
  assert.match(composerSectionSource, /<AgentComposerUploadDialog[\s\S]*open=\{uploading\}/)
  assert.match(composerSectionSource, /<Dialog open=\{open\}>/)
  assert.match(composerSectionSource, /hideClose/)
  assert.match(composerSectionSource, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(composerSectionSource, /agents\.chat\.uploadDialogDescription/)
  assert.match(composerSectionSource, /onPaste=\{onComposerPaste\}/)
  assert.match(mentionEditorSource, /onPaste\?\.\(event\)/)
  assert.match(mentionEditorSource, /if \(event\.defaultPrevented\) return/)
  assert.match(dataSourceShellSource, /buildAgentChatDataSourceShellView\(\{[\s\S]*composer: setup\.composer,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /composerPanel: buildAgentChatShellComposerPanel\(\{[\s\S]*onPaste: \(event: ClipboardEvent\) => void input\.composer\.handleComposerPaste\(event\)/)
  assert.match(shellViewSource, /onComposerPaste=\{composerPanel\.onPaste\}/)
  assert.doesNotMatch(shellViewSource, /onComposerPaste=\{onComposerPaste\}/)
})

test('agent chat composer uses the same chrome in page and detail surfaces', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const shellPartsSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShellParts.tsx'), 'utf8')
  const composerSectionSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const panelShellLayoutCss = readFileSync(resolve('src/features/agent/components/AgentPanelShellLayoutUi.css'), 'utf8')

  assert.match(dataSourceShellSource, /<AgentChatShellView/)
  assert.match(shellViewSource, /<AgentChatDataSourceComposerPanel[\s\S]*?chrome="flush"/)
  assert.match(shellPartsSource, /<AgentComposerSection \{\.\.\.composerProps\} \/>/)
  assert.match(composerSectionSource, /<AgentSurfaceBlock[\s\S]*as="section"[\s\S]*variant="card"/)
  assert.doesNotMatch(composerSectionSource, /<AgentSurfaceBlock\s+asChild[\s\S]*<section/)
  assert.match(shellPartsSource, /ai-agent-panel-composer-wrap/)
  assert.match(panelShellLayoutCss, /\.ai-agent-panel-shell \.ai-agent-panel-composer-wrap/)
  assert.doesNotMatch(dataSourceShellSource, /chrome=\{surface === 'page' \? 'flush' : 'bottom-bar'\}/)
})

test('agent page chat keeps a stable layout shell when the first message is sent', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const shellPartsSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShellParts.tsx'), 'utf8')
  const shellCssSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.css'), 'utf8')
  const presentationStateSource = readFileSync(resolve('src/features/agent/presentation/useAgentChatShellPresentationState.ts'), 'utf8')
  const pageThreadShellBlock = sourceBetween(
    shellPartsSource,
    'export function AgentChatDataSourcePageThreadShell',
    'export function AgentChatDataSourceThreadBody',
  )
  const composerPanelBlock = sourceBetween(
    shellPartsSource,
    'export function AgentChatDataSourceComposerPanel',
    'interface AgentComposerActionLayerProps',
  )
  const emptyOverlayCss = sourceBetween(
    shellCssSource,
    '.agent-page-chat-empty {',
    '.agent-page-chat-empty-title',
  )
  const emptyShellCss = sourceBetween(
    shellCssSource,
    '.agent-page-chat-thread-shell--empty {',
    '.agent-page-chat-thread {',
  )

  assert.match(shellViewSource, /className=\{surface === 'page' \? 'agent-page-chat-main' : 'ai-agent-panel-main'\}/)
  assert.doesNotMatch(shellViewSource, /agent-page-chat-main--empty/)
  assert.match(dataSourceShellSource, /useAgentChatShellPresentationState\(\{[\s\S]*sending: setup\.sending,[\s\S]*visibleItems: viewport\.visibleItems,/)
  assert.match(presentationStateSource, /sending: boolean/)
  assert.match(presentationStateSource, /visibleItems\.length[\s\S]*\|\| sending[\s\S]*\|\| error/)
  assert.match(pageThreadShellBlock, /<div className="agent-page-chat-thread">/)
  assert.match(pageThreadShellBlock, /<AgentChatDataSourceThreadBody/)
  assert.match(pageThreadShellBlock, /data-visible=\{!hasChatContent \? 'true' : undefined\}/)
  assert.match(pageThreadShellBlock, /emptyThreadLabel=\{hasChatContent \? emptyThreadLabel : undefined\}/)
  assert.doesNotMatch(pageThreadShellBlock, /!\s*hasChatContent\s*&&\s*emptyThreadLabel\s*\?/)
  assert.match(composerPanelBlock, /\? 'agent-page-chat-composer relative z-30'/)
  assert.match(composerPanelBlock, /data-has-chat-content=\{hasChatContent \? 'true' : 'false'\}/)
  assert.doesNotMatch(composerPanelBlock, /agent-page-chat-empty-composer/)
  assert.match(emptyOverlayCss, /position: absolute;/)
  assert.match(emptyOverlayCss, /inset: 0;/)
  assert.match(emptyOverlayCss, /opacity: 0;/)
  assert.match(shellCssSource, /\.agent-page-chat-empty\[data-visible="true"\]/)
  assert.doesNotMatch(emptyShellCss, /flex:\s*0 0 auto/)
})

test('agent mode sidebar keeps conversations scoped to unbound chats', () => {
  const agentModePageSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const agentModeSidebarPartsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarParts.tsx'), 'utf8')
  const agentContentPanelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8')
  const conversationGroupSource = sourceBetween(
    agentModePageSource,
    '<ProjectAgentModeChatConversationsSection',
    '<ProjectAgentModeHistorySection',
  )

  assert.match(agentModePageSource, /const \{ projectGroups, chatConversations \} = conversationsByScope/)
  assert.match(agentModePageSource, /const sortedChatConversations = chatConversations/)
  assert.match(conversationGroupSource, /conversations=\{sortedChatConversations\}/)
  assert.match(agentModeSidebarPartsSource, /trailing=\{conversations\.length > 0 \? `\$\{conversations\.length\}` : undefined\}/)
  assert.match(agentModeSidebarPartsSource, /conversations\.length === 0/)
  assert.match(agentModeSidebarPartsSource, /visibleConversations\.map/)
  assert.doesNotMatch(conversationGroupSource, /appServerMode \?/)
  assert.doesNotMatch(agentModePageSource, /appServerActiveThreadId/)
  assert.doesNotMatch(agentModePageSource, /AppServerSidebarActiveThread/)
})

test('agent content area exposes project canvas editing and session output work surfaces', () => {
  const panelSource = readFileSync(resolve('src/features/agent/components/AgentBrowserPanel.tsx'), 'utf8')
  const headerSource = readFileSync(resolve('src/features/agent/components/AgentBrowserPanelHeader.tsx'), 'utf8')
  const tabContentSource = readFileSync(resolve('src/features/agent/components/AgentBrowserTabContent.tsx'), 'utf8')
  const blankTabSource = readFileSync(resolve('src/features/agent/components/AgentBrowserBlankWebTab.tsx'), 'utf8')
  const contentStoreSource = readFileSync(resolve('src/features/agent/state/agentContentAreaStore.ts'), 'utf8')
  const editingPaneSource = readFileSync(resolve('src/features/agent/components/AgentBrowserEditingProjectsPane.tsx'), 'utf8')

  assert.match(contentStoreSource, /kind: 'project_home'/)
  assert.match(contentStoreSource, /kind: 'canvas_list'/)
  assert.match(contentStoreSource, /kind: 'editing_projects'/)
  assert.match(contentStoreSource, /kind: 'session_output'/)
  assert.match(panelSource, /openEditingProjectsTab/)
  assert.match(headerSource, /打开剪辑/)
  assert.match(blankTabSource, /onOpenEditingProjects/)
  assert.match(tabContentSource, /<CanvasListView source="agent" \/>/)
  assert.match(tabContentSource, /<AgentBrowserEditingProjectsPane \/>/)
  assert.match(tabContentSource, /<AgentSessionOutputPane conversationId=\{sessionConversationId\} projectId=\{project\?\.ID\} \/>/)
  assert.match(editingPaneSource, /openEditingProjectWindow/)
})

test('agent composer locks workspace context after a session starts', () => {
  const composerControllerSource = readAgentComposerControllerContractSource()
  const composerSectionSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const composerToolbarSource = readFileSync(resolve('src/features/agent/components/AgentComposerToolbarSection.tsx'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const sessionStoreSource = [
    readFileSync(resolve('src/features/agent/state/agentSessionStore.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/state/agentSessionConversationState.ts'), 'utf8'),
  ].join('\n')
  const composerPanelCssSource = readFileSync(resolve('src/features/agent/components/AgentComposerPanelUi.css'), 'utf8')

  assert.match(composerControllerSource, /workspaceContextLocked/)
  assert.match(composerControllerSource, /if \(workspaceContextLocked\) return/)
  assert.match(composerSectionSource, /workspaceProjectLocked/)
  assert.match(composerToolbarSource, /selectedWorkspaceProjectLabel/)
  assert.doesNotMatch(composerSectionSource, /ProviderMark/)
  assert.match(composerToolbarSource, /collaborationMode === 'plan'/)
  assert.match(composerToolbarSource, /goalModeEnabled \? \(/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked = false/)
  assert.match(shellCoreStateSource, /const composerWorkspaceContextLocked = forceComposerWorkspaceContextLocked \|\| Boolean\(activeThreadId\)/)
  assert.match(dataSourceShellSource, /composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked = false/)
  assert.match(dataSourceShellSource, /composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked/)
  assert.match(dataSourceShellSource, /composerWorkspaceContextLocked,/)
  assert.match(shellViewSource, /composerPanel: AgentChatShellComposerPanelProps/)
  assert.match(shellViewSource, /workspaceProjectLocked=\{composerPanel\.workspaceContextLocked\}/)
  assert.match(turnControlsSource, /workspaceContext: composer\.selectedWorkspaceContext/)
  assert.match(sessionStoreSource, /const workspaceContext = userWorkspaces\[input\.conversationId\]\?\.workspaceContext/)
  assert.match(sessionStoreSource, /input: '',[\s\S]*attachments: \[\],[\s\S]*workspaceContext/)
  assert.match(composerPanelCssSource, /\.ms-agent-composer \.ai-agent-model-select[\s\S]*border-color: transparent;[\s\S]*background: transparent;/)
})

test('agent new conversation drafts bind selected project without starting a thread before send', () => {
  const composerControllerSource = readAgentComposerControllerContractSource()
  const agentModePageSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const agentStoreSource = readFileSync(resolve('src/features/agent/state/agentStore.ts'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const draftConversationSource = readFileSync(resolve('src/features/agent/application/useAgentChatDraftConversation.ts'), 'utf8')
  const threadCreationSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadCreation.ts'), 'utf8')
  const agentBrowserPanelSource = [
    readFileSync(resolve('src/features/agent/components/AgentBrowserPanel.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentBrowserPanelHeader.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentBrowserTabContent.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentBrowserPanelModel.ts'), 'utf8'),
  ].join('\n')
  const agentContentPanelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8')
  const agentContentAreaStoreSource = readFileSync(resolve('src/features/agent/state/agentContentAreaStore.ts'), 'utf8')
  const headerSource = readFileSync(resolve('src/features/app-shell/components/Header.tsx'), 'utf8')
  const topControlsSource = readFileSync(resolve('src/features/app-shell/components/AppTopControls.tsx'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const runtimeShellSource = readFileSync(resolve('src/features/agent/components/AgentRuntimeChatShell.tsx'), 'utf8')
  const threadRuntimeEffectsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadRuntimeEffects.ts'), 'utf8')
  const runProfileSettingsSource = readFileSync(resolve('src/features/agent/application/useAgentChatRunProfileSettings.ts'), 'utf8')
  const normalizeWorkspaceContextBlock = sourceFunctionBlock(composerControllerSource, 'normalizeAgentWorkspaceContext')
  const resumeThreadBlock = sourceBetween(threadRuntimeEffectsSource, 'void dataSource.resumeThread({', '})\n        .then')
  const updateThreadSettingsBlock = sourceBetween(runProfileSettingsSource, 'void dataSource.updateThreadSettings({', '})\n      .then')
  const sendMessageBlock = sourceBetween(turnControlsSource, 'const sendMessage = useCallback', 'const submitQueuedInputsAsTurn = useCallback')
  const queuedTurnBlock = sourceBetween(turnControlsSource, 'const submitQueuedInputsAsTurn = useCallback', 'const submitQueuedInputAsTurn = useCallback')

  assert.doesNotMatch(composerControllerSource, /normalizeAgentWorkspaceContext\([\s\S]*\{ projectId: currentProject\?\.ID \}/)
  assert.doesNotMatch(composerControllerSource, /useProjectStore/)
  assert.doesNotMatch(normalizeWorkspaceContextBlock, /fallback\.projectId/)
  assert.match(normalizeWorkspaceContextBlock, /scope: 'global'/)
  assert.match(composerControllerSource, /label: '全局', meta: '不绑定项目'/)
  assert.match(composerControllerSource, /project\.ID === currentProject\?\.ID[\s\S]*\? '当前项目'/)
  assert.match(composerControllerSource, /currentProject = null/)
  assert.match(composerControllerSource, /selectedProject[\s\S]*agentWorkspaceContextFromProject\(selectedProject\)/)
  assert.doesNotMatch(agentModePageSource, /AgentWorkspaceScopeSelection/)
  assert.doesNotMatch(agentModePageSource, /useProjectStore/)
  assert.doesNotMatch(agentModePageSource, /project\?\.ID/)
  assert.doesNotMatch(agentModePageSource, /setNewConversationWorkspaceScope/)
  assert.doesNotMatch(agentModePageSource, /选择新建会话范围/)
  assert.doesNotMatch(agentModePageSource, /newConversationWorkspaceContext/)
  assert.doesNotMatch(agentModePageSource, /selectedNewConversationProjectId/)
  assert.match(agentModePageSource, /openAgentPanelNewConversation\(\{[\s\S]*workspaceContext: \{ scope: 'global' \}/)
  assert.doesNotMatch(agentModePageSource, /sortedProjectOptions\.map/)
  assert.doesNotMatch(agentModePageSource, /当前项目/)
  assert.doesNotMatch(agentModePageSource, /scope: 'project', projectId: item\.ID/)
  assert.doesNotMatch(agentModePageSource, /await dataSource\.startThread/)
  assert.doesNotMatch(agentModePageSource, /startSharedProvisionalConversation\(/)
  assert.doesNotMatch(agentModePageSource, /projectId: selectedNewConversationProjectId/)
  assertRetiredProviderSessionChatFilesRemoved()
  assert.match(turnControlsSource, /workspaceContext: composer\.selectedWorkspaceContext/)
  assert.match(turnControlsSource, /const selectedWorkspaceProjectId = typeof composer\.selectedWorkspaceContext\.projectId === 'number'/)
  assert.match(turnControlsSource, /projectId: selectedWorkspaceProjectId/)
  assert.match(sendMessageBlock, /let firstTurnDraftControls/)
  assert.match(sendMessageBlock, /firstTurnDraftControls = buildAgentChatDraftThreadControlOptions\(\{ collaborationMode, goalModeEnabled \}\)/)
  assert.match(sendMessageBlock, /startThreadResult\(\{[\s\S]*useDraftModeSettings: true/)
  assert.match(runtimeShellSource, /agentSettingsModelSelectionPatch\(/)
  assert.match(runtimeShellSource, /agentSettingsModelIdForProvider\(/)
  assert.doesNotMatch(runtimeShellSource, /updateSettings\(\{ modelId/)
  assert.match(agentStoreSource, /resetDraftModeSettings/)
  assert.match(agentStoreSource, /goalModeEnabled: DEFAULT_AGENT_SETTINGS\.goalModeEnabled/)
  assert.match(threadCreationSource, /type AgentChatStartThreadInput[\s\S]*useDraftModeSettings\?: boolean/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /const resetDraftModeSettings = useCallback/)
  assert.match(threadCreationSource, /useDraftModeSettings \? buildAgentChatDraftThreadControlOptions\(\{ collaborationMode, goalModeEnabled \}\) : \{\}/)
  assert.doesNotMatch(resumeThreadBlock, /collaborationMode|goalModeEnabled/)
  assert.doesNotMatch(updateThreadSettingsBlock, /collaborationMode|goalModeEnabled/)
  assert.doesNotMatch(sendMessageBlock, /ensureAgentChatThreadReadyForTurn\(\{[\s\S]*controls:/)
  assert.doesNotMatch(sendMessageBlock, /\.\.\.\(collaborationMode === 'plan'/)
  assert.doesNotMatch(sendMessageBlock, /\.\.\.\(goalModeEnabled/)
  assert.doesNotMatch(queuedTurnBlock, /collaborationMode|goalModeEnabled/)
  assert.match(draftConversationSource, /workspaceContextFromNewConversationPayload\(input\)/)
  assert.match(dataSourceShellSource, /const createDraftConversation = useAgentChatDraftConversation/)
  assert.match(dataSourceShellSource, /resetDraftModeSettings\(\)[\s\S]*createDraftConversation\(/)
  const appShellLayoutSource = readFileSync(resolve('src/features/app-shell/application/AppShellLayout.tsx'), 'utf8')
  assert.doesNotMatch(appShellLayoutSource, /showProjectControls=/)
  assert.doesNotMatch(headerSource, /showProjectControls/)
  assert.doesNotMatch(topControlsSource, /showProjectSelector/)
  assert.doesNotMatch(topControlsSource, /AppTopProjectMenuContent/)
  assert.match(agentContentPanelSource, /sessionWorkspaceContext/)
  assert.match(agentContentPanelSource, /legacySessionProjectId = positiveInteger\(sessionWorkspaceContext\?\.projectId\)/)
  assert.match(agentContentPanelSource, /<AgentBrowserPanel contentAreaId=\{contentAreaId\} conversationId=\{sessionConversationId\} project=\{sessionProject\} \/>/)
  assert.doesNotMatch(agentBrowserPanelSource, /useProjectStore/)
  assert.match(agentContentPanelSource, /ProjectAgentContentPanel/)
  assert.match(agentContentPanelSource, /const sessionProject = useMemo/)
  assert.match(agentContentPanelSource, /<AgentBrowserPanel[\s\S]*project=\{sessionProject\}/)
  assert.match(agentContentAreaStoreSource, /AGENT_BLANK_TAB_ID = 'blank_home'/)
  assert.match(agentBrowserPanelSource, /defaultTab: hasProject \? 'project_home' : 'blank'/)
})

function readAgentComposerControllerContractSource(): string {
  return [
    readFileSync(resolve('src/features/agent/presentation/useAgentComposerController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/presentation/agentComposerAttachmentLifecycle.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/presentation/agentComposerClipboardFiles.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/presentation/agentComposerWorkspaceModel.ts'), 'utf8'),
  ].join('\n')
}

function readAgentChatDataSourceShellContractSource(): string {
  return [
    readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentChatDataSourceShellController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentChatDataSourceShellRuntimeSetup.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentChatRegistryActiveThreadEffect.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellControllerView.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellView.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/agentChatShellViewModels.ts'), 'utf8'),
  ].join('\n')
}

function assertRetiredProviderSessionChatFilesRemoved(): void {
  for (const relativePath of [
    'src/features/agent/presentation/agentChatViewLayoutProps.ts',
    'src/features/agent/presentation/useAgentChatViewController.ts',
    'src/features/agent/presentation/useAgentChatContextState.ts',
    'src/features/agent/presentation/agentChatInteractionInputTypes.ts',
    'src/features/agent/presentation/agentChatSendPipelineInputs.ts',
    'src/features/agent/application/agentSendWorkspace.ts',
  ]) {
    assert.equal(existsSync(resolve(relativePath)), false, `${relativePath} should stay deleted`)
  }
}
