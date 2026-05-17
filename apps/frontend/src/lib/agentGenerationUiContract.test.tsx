import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { AgentRunGenerationArtifacts } from '@/components/agent/AgentRunGenerationArtifacts'
import { GenerationJobSummaryCard, GenerationParamAuditCard, GenerationProgressCard, GenerationTraceSummaryCard, GenerationValidationErrorCard } from '@/components/agent/GenerationCards'
import type { AgentRun } from '@/lib/localAgentClient'

test('generation UI contract exposes stable hooks and accessible progressbars', () => {
  const progressHtml = renderToStaticMarkup(
    <GenerationProgressCard state={{
      jobId: 42,
      status: 'running',
      stage: 'rendering',
      progress: 42,
      terminal: false,
    }} />,
  )
  const jobsHtml = renderToStaticMarkup(
    <GenerationJobSummaryCard jobs={[{
      jobId: 43,
      jobType: 'video',
      status: 'succeeded',
      stage: 'completed',
      progress: 100,
      terminal: true,
      outputResourceId: 430,
    }]} />,
  )
  const traceHtml = renderToStaticMarkup(
    <GenerationTraceSummaryCard jobs={[{
      jobId: 44,
      jobType: 'image',
      status: 'failed',
      stage: 'failed',
      terminal: true,
    }]} />,
  )
  const auditHtml = renderToStaticMarkup(
    <GenerationParamAuditCard audits={[{
      stepId: 'step_1',
      jobId: 45,
      modelConfigId: 12,
      modelContractLoaded: true,
      paramsSchemaLoaded: true,
      paramsSchemaRuleCount: 2,
      inputRequirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      submittedInputs: {
        image: 5,
        video: 0,
      },
      supportedParams: ['duration', 'resolution'],
      providedExtraParams: ['duration', 'resolution', 'unsupported_flag'],
      submittedExtraParams: ['duration', 'resolution'],
      droppedExtraParams: ['unsupported_flag'],
      droppedTopLevelParams: ['aspect_ratio'],
      dropReasons: {
        unsupported_flag: 'unsupported_extra_param',
        aspect_ratio: 'unsupported_top_level_param',
      },
      renamedExtraParams: {
        ratio: 'aspect_ratio',
      },
      preflightErrors: [{
        code: 'INVALID_PARAMETER_COMBINATION',
        field: 'duration',
        message: 'parameter "duration" conflicts with "frames" in the local model contract',
        allowedValues: ['5', '10'],
      }],
      inputPreflightErrors: [{
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        message: 'image generation input count is above the local model contract maximum',
        requiredMin: 1,
        allowedMax: 4,
        actualCount: 5,
      }],
      repairNote: 'Retried once with backend suggested_fix after generation parameter validation failed.',
    }]} />,
  )
  const validationErrorHtml = renderToStaticMarkup(
    <GenerationValidationErrorCard errors={[
      {
        stepId: 'step_error_1',
        code: 'UNSUPPORTED_OUTPUT_TYPE',
        field: 'output_type',
        message: 'model "Reference Image" does not support output type "video"',
        allowedValues: ['image'],
      },
      {
        stepId: 'step_error_2',
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        message: 'model "Reference Image" supports at most 4 image input(s), but 5 were provided',
        requiredMin: 1,
        allowedMax: 4,
        actualCount: 5,
      },
    ]} />,
  )

  assertIncludes(progressHtml, 'data-testid="agent-generation-progress"')
  assertIncludes(progressHtml, 'data-testid="agent-generation-progress-bar"')
  assertIncludes(progressHtml, 'role="progressbar"')
  assertIncludes(progressHtml, 'aria-valuenow="42"')
  assertIncludes(jobsHtml, 'data-testid="agent-generation-job-summary"')
  assertIncludes(jobsHtml, 'data-testid="agent-generation-job-progress-bar"')
  assertIncludes(jobsHtml, 'role="progressbar"')
  assertIncludes(jobsHtml, 'aria-valuenow="100"')
  assertIncludes(traceHtml, 'data-testid="agent-generation-trace-summary"')
  assertIncludes(auditHtml, 'data-testid="agent-generation-param-audit"')
  assertIncludes(auditHtml, 'unsupported_flag (不支持)')
  assertIncludes(auditHtml, 'aspect_ratio (模型不支持)')
  assertIncludes(auditHtml, 'ratio -&gt; aspect_ratio')
  assertIncludes(auditHtml, 'schema 2 条规则')
  assertIncludes(auditHtml, '输入需求')
  assertIncludes(auditHtml, '输入预检')
  assertIncludes(auditHtml, '图片 5 个')
  assertIncludes(auditHtml, '本地预检')
  assertIncludes(auditHtml, 'duration (INVALID_PARAMETER_COMBINATION，允许 5/10)')
  assertIncludes(auditHtml, '自动修复')
  assertIncludes(validationErrorHtml, 'data-testid="agent-generation-validation-errors"')
  assertIncludes(validationErrorHtml, 'UNSUPPORTED_OUTPUT_TYPE')
  assertIncludes(validationErrorHtml, '允许值')
  assertIncludes(validationErrorHtml, 'INVALID_INPUT_COUNT')
  assertIncludes(validationErrorHtml, '输入数量')
})

test('agent panel keeps generated result and binding hooks for browser E2E', () => {
  const source = readFileSync(resolve('src/components/agent/GeneratedResultCard.tsx'), 'utf8')
  assertIncludes(source, 'data-testid="agent-generated-result-card"')
  assertIncludes(source, 'data-testid="agent-generated-media-preview"')
  assertIncludes(source, 'data-testid="agent-generated-resource-binding"')
})

test('agent panel keeps plan overview summary and drilldown hooks', () => {
  const source = readFileSync(resolve('src/components/layout/AIAgentPanel.tsx'), 'utf8')
  const localRuntimeSource = readFileSync(resolve('src/components/agent/localRuntime.tsx'), 'utf8')
  const viewModelSource = readFileSync(resolve('src/lib/agentMessageViewModel.ts'), 'utf8')
  assertIncludes(source, 'assistantResultPayloadForRun(run, liveEvents, content)')
  assertIncludes(source, 'restoredChatMessageFromLocalMessage(message, restoredLabel)')
  assertIncludes(source, "import { needsModelSetupAction } from '@/lib/actionableErrors'")
  assertIncludes(source, "import { openAdminConsole } from '@/lib/adminConsole'")
  assertIncludes(source, 'const showModelSetupAction = !isUser && needsModelSetupAction(msg.content)')
  assertIncludes(source, "openAdminConsole(apiBaseURL, '/models')")
  assertIncludes(source, "t('agents.chat.modelSetupAction.title')")
  assertIncludes(source, "t('agents.chat.modelSetupAction.openModels')")
  assertIncludes(viewModelSource, 'const generationValidationErrors = generationValidationErrorsFromRun(run)')
  assertIncludes(viewModelSource, 'generationValidationErrors.length > 0 ? { generationValidationErrors } : {}')
  assertIncludes(source, '<GenerationValidationErrorCard errors={msg.meta?.generationValidationErrors} />')
  assertIncludes(source, 'data-testid="agent-plan-overview"')
  assertIncludes(source, 'data-testid="agent-plan-overview-stats"')
  assertIncludes(source, 'data-testid="agent-plan-status-explanation"')
  assertIncludes(source, 'data-testid="agent-plan-name-conflicts"')
  assertIncludes(source, 'data-testid="agent-plan-artifact-summary"')
  assertIncludes(source, 'buildPlanOverviewStats(snapshot)')
  assertIncludes(source, 'buildPlanStatusExplanation(snapshot)')
  assertIncludes(source, 'buildPlanNameConflictViews(snapshot)')
  assertIncludes(source, 'buildPlanArtifactSummary(snapshot)')
  assertIncludes(source, 'const { t, i18n } = useTranslation()')
  assertIncludes(source, "const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'")
  assertIncludes(source, 'formatAgentDate(view.worker.updatedAt, locale)')
  assertIncludes(source, 'formatAgentDate(step.createdAt, locale)')
  assertIncludes(source, 'formatAgentDate(event.createdAt, locale)')
  assertIncludes(source, '耗时 {durationLabel(view.worker.startedAt')
  assertIncludes(source, '耗时 {durationLabel(step.createdAt, step.completedAt)}')
  assertIncludes(source, '耗时 {durationLabel(event.createdAt, event.completedAt)}')
  assertIncludes(source, "import { agentPermissionModeLabel, agentPlanStatusLabel, agentTraceView, approvalPermissionLabel, approvalRiskLabel, approvalStatusLabel, inputTypeLabel, runApprovalModeLabel, runStatusLabel, toolApprovalLabel, toolGrantModeLabel, traceEventStatusLabel, traceKindLabel } from '@/lib/agentRunUi'")
  assertIncludes(source, 'const eventView = agentTraceView(event)')
  assertIncludes(source, '{eventView.categoryLabel}')
  assertIncludes(source, '行为：{eventView.behavior}')
  assertIncludes(source, '影响：{eventView.impact}')
  assertIncludes(source, '摘要：{eventView.summary}')
  assertIncludes(source, 'traceKindLabel(kind as AgentTraceEvent')
  assertIncludes(source, 'traceEventStatusLabel(event.status)')
  assertIncludes(source, 'approvalRiskLabel(approval.risk)')
  assertIncludes(source, 'approvalStatusLabel(approval.status)')
  assertIncludes(source, 'approvalRiskLabel(tool.risk)')
  assertIncludes(source, 'agentPermissionModeLabel(draft.settings.permissionMode)')
  assertIncludes(source, 'runApprovalModeLabel(preview.policy.approvalMode)')
  assertIncludes(source, 'toolGrantModeLabel(grant.mode)')
  assertIncludes(source, 'toolApprovalLabel(grant.approval)')
  assertIncludes(source, 'toolApprovalLabel(tool.approval)')
  assertIncludes(source, 'approvalPermissionLabel(approval.permission)')
  assertIncludes(source, 'inputTypeLabel(input.inputType)')
  assertIncludes(source, 'function RunActivityPanel')
  assertIncludes(source, 'activityTraceView(event, displayData.runId)')
  assertIncludes(source, 'genericRunStatusLabel(displayData.status)')
  assertIncludes(source, 'agentStepStatusLabel(item.status)')
  assertIncludes(source, 'agentStepTypeLabel(step.type)')
  assertIncludes(source, '暂无工具调用')
  assertIncludes(source, '参数')
  assertIncludes(source, '结果')
  assertIncludes(source, '错误数据')
  assertIncludes(source, '运行上下文')
  assertIncludes(source, '本地诊断快照；不会发起模型网关调用。')
  assertIncludes(source, '随模型请求发送的工具')
  assertIncludes(source, '上下文片段')
  assertIncludes(source, '模型请求消息')
  assertIncludes(source, '参数结构')
  assertIncludes(localRuntimeSource, "import { approvalImpactLabel, approvalPermissionLabel, approvalRiskLabel, runStatusLabel } from '@/lib/agentRunUi'")
  assertIncludes(localRuntimeSource, 'runStatusLabel(run.status)')
  assertIncludes(localRuntimeSource, 'approvalRiskLabel(approval.risk)')
  assertIncludes(localRuntimeSource, 'approvalPermissionLabel(approval.permission)')
})

test('agent run page keeps plan context and trace drilldown hooks', () => {
  const source = readFileSync(resolve('src/pages/agent/AIAgentRunPage.tsx'), 'utf8')
  assertIncludes(source, 'data-testid="agent-run-page"')
  assertIncludes(source, 'data-testid="agent-run-header"')
  assertIncludes(source, 'data-testid="agent-run-sidebar"')
  assertIncludes(source, 'data-testid="agent-run-child-runs"')
  assertIncludes(source, 'data-testid="agent-run-child-run"')
  assertIncludes(source, "import { agentRunPath } from '@/routes/projectRoutes'")
  assertIncludes(source, 'navigate(agentRunPath(child.id))')
  assertIncludes(source, 'data-testid="agent-run-plan-context"')
  assertIncludes(source, 'data-testid="agent-run-summary"')
  assertIncludes(source, 'data-testid="agent-run-task-artifacts"')
  assertIncludes(source, 'agentTaskStatusLabel(runPlanTask.status)')
  assertIncludes(source, 'agentTaskStatusLabel(artifact.sourceTaskStatus)')
  assertIncludes(source, 'data-testid="agent-run-trace-panel"')
  assertIncludes(source, 'aria-busy={loadingEvents}')
  assertIncludes(source, 'data-testid="agent-run-trace-summary"')
  assertIncludes(source, 'data-testid="agent-run-summary"')
  assertIncludes(source, 'data-testid="agent-run-trace-search"')
  assertIncludes(source, 'aria-label="搜索运行事件"')
  assertIncludes(source, 'aria-label="按事件类型筛选"')
  assertIncludes(source, 'aria-label="按事件分类筛选"')
  assertIncludes(source, 'data-testid="agent-run-trace-category-filter"')
  assertIncludes(source, 'aria-pressed={eventCategory === category}')
  assertIncludes(source, 'aria-label={`按${traceCategoryLabel(category)}筛选运行事件`}')
  assertIncludes(source, 'data-testid="agent-run-load-trace-events"')
  assertIncludes(source, 'aria-label="加载当前运行的事件"')
  assertIncludes(source, 'data-testid="agent-run-load-all-trace-events"')
  assertIncludes(source, 'aria-label="加载当前运行的全部事件"')
  assertIncludes(source, 'aria-label="加载更多运行事件"')
  assertIncludes(source, 'data-testid="agent-run-trace-loaded-count"')
  assertIncludes(source, 'data-testid="agent-run-trace-visible-count"')
  assertIncludes(source, '当前显示 {visibleEvents.length} 个')
  assertIncludes(source, 'data-testid="agent-run-trace-empty-state"')
  assertIncludes(source, 'data-testid="agent-run-empty-load-all"')
  assertIncludes(source, 'data-testid="agent-run-clear-trace-filters"')
  assertIncludes(source, 'data-testid="agent-run-clear-trace-filters-inline"')
  assertIncludes(source, 'aria-label="清除运行事件筛选"')
  assertIncludes(source, 'aria-label="清除运行事件筛选并返回事件列表"')
  assertIncludes(source, 'data-testid="agent-run-trace-load-error"')
  assertIncludes(source, 'data-testid="agent-run-trace-load-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-trace-retry"')
  assertIncludes(source, 'aria-label="重新加载运行事件"')
  assertIncludes(source, 'data-testid="agent-run-trace-summary-error"')
  assertIncludes(source, 'data-testid="agent-run-trace-summary-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-detail-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-detail-retry"')
  assertIncludes(source, 'aria-label="重新加载 AgentRun 运行详情"')
  assertIncludes(source, 'data-testid="agent-run-plan-context-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-plan-context-retry"')
  assertIncludes(source, 'aria-label="重新加载计划上下文"')
  assertIncludes(source, 'data-testid="agent-run-trace-summary-retry"')
  assertIncludes(source, 'aria-label="重新加载运行事件统计"')
  assertIncludes(source, 'data-testid="agent-run-trace-deep-link-missing"')
  assertIncludes(source, 'data-testid="agent-run-trace-deep-link-missing" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-trace-linked-event"')
  assertIncludes(source, 'data-testid="agent-run-trace-event"')
  assertIncludes(source, 'data-testid="agent-run-trace-event-details-toggle"')
  assertIncludes(source, 'data-testid="agent-run-trace-event-details"')
  assertIncludes(source, 'isEventDataExpanded ? \'隐藏原始数据\' : \'原始数据\'')
  assertIncludes(source, 'aria-label={`${isEventDataExpanded ? \'隐藏\' : \'查看\'}${view.title}的原始数据`}')
  assertIncludes(source, 'aria-expanded={isEventDataExpanded}')
  assertIncludes(source, 'aria-controls={eventDataPanelId}')
  assertIncludes(source, 'id={eventDataPanelId}')
  assertIncludes(source, 'data-testid="agent-run-trace-event-data-copy"')
  assertIncludes(source, 'aria-label={`复制${view.title}的原始数据`}')
  assertIncludes(source, 'aria-label={`复制${view.title}的事件链接`}')
  assertIncludes(source, "import { formatAgentTraceDebugData, redactAgentTraceDebugText } from '@/lib/agentTraceDebugData'")
  assertIncludes(source, 'formatAgentTraceDebugData(event.data)')
  assertIncludes(source, 'formatAgentTraceDebugData(data)')
  assertIncludes(source, 'redactAgentTraceDebugText(detail.request.url)')
  assertIncludes(source, 'redactAgentTraceDebugText(view.behavior)')
  assertIncludes(source, 'redactAgentTraceDebugText(view.impact)')
  assertIncludes(source, 'redactAgentTraceDebugText(view.summary)')
  assertIncludes(source, 'redactAgentTraceDebugText(item.value)')
  assertIncludes(source, 'redactAgentTraceDebugText(detail.response.bodyText)')
  assertIncludes(source, 'data-testid="agent-run-trace-copy-feedback"')
  assertIncludes(source, 'data-testid="agent-run-trace-copy-error"')
  assertIncludes(source, 'data-testid="agent-run-trace-copy-feedback" role="status"')
  assertIncludes(source, 'data-testid="agent-run-trace-copy-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-trace-redaction-note"')
  assertIncludes(source, '原始数据展示和复制时会自动脱敏')
  assertIncludes(source, "setEventCopyFeedback({ eventId, action: 'data' })")
  assertIncludes(source, "setEventCopyFeedback({ eventId, action: 'link' })")
  assertIncludes(source, 'data-testid="agent-run-debug-coverage"')
  assertIncludes(source, 'requestPayloadsLabel')
  assertIncludes(source, '请求负载')
  assertIncludes(source, 'toolDetailsLabel')
  assertIncludes(source, '工具详情')
  assertIncludes(source, 'buildDebugReadinessChecklist(summary)')
  assertIncludes(source, 'data-testid="agent-run-debug-readiness"')
  assertIncludes(source, 'data-testid="agent-run-debug-readiness-item"')
  assertIncludes(source, '诊断清单')
  assertIncludes(source, '下一步：{item.action}')
  assertIncludes(source, 'data-testid="agent-run-debug-load-all"')
  assertIncludes(source, 'aria-label="加载全部运行事件用于调试覆盖统计"')
  assertIncludes(source, 'data-testid="agent-run-debug-report-copy"')
  assertIncludes(source, 'aria-label="复制 AgentRun 调试摘要"')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-copy"')
  assertIncludes(source, 'aria-label="复制脱敏 AgentRun 调试包"')
  assertIncludes(source, "const DEBUG_BUNDLE_SCHEMA = 'movscript.agent-run-debug-bundle.v1'")
  assertIncludes(source, "const DEBUG_BUNDLE_SCHEMA_URL = 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json'")
  assertIncludes(source, 'const DEBUG_BUNDLE_CAPABILITIES = [')
  assertIncludes(source, 'schema: DEBUG_BUNDLE_SCHEMA')
  assertIncludes(source, 'schemaUrl: DEBUG_BUNDLE_SCHEMA_URL')
  assertIncludes(source, 'generatedAt: new Date().toISOString()')
  assertIncludes(source, 'capabilities: DEBUG_BUNDLE_CAPABILITIES')
  assertIncludes(source, "'modelCallContexts'")
  assertIncludes(source, "'readinessChecklist'")
  assertIncludes(source, "'fieldGuide'")
  assertIncludes(source, "'redactedDebugData'")
  assertIncludes(source, 'run: debugBundleRunSnapshot(runQuery.data)')
  assertIncludes(source, 'runSummary: debugBundleRunSummary(runQuery.data)')
  assertIncludes(source, 'promptDetails: bundlePromptDetails')
  assertIncludes(source, 'readinessChecklist: buildDebugReadinessChecklist(bundleCoverage)')
  assertIncludes(source, 'fieldGuide: AGENT_DEBUG_FIELD_GUIDE')
  assertIncludes(source, 'messageWrites: bundleMessageWrites')
  assertIncludes(source, 'toolCalls: bundleToolCalls')
  assertIncludes(source, 'attentionEvents: bundleAttentionEvents')
  assertIncludes(source, 'modelCallContexts: bundleModelCallContexts')
  assertIncludes(source, 'pendingActions: bundlePendingActions')
  assertIncludes(source, 'const bundleAttentionEvents = buildDebugAttentionEvents(bundleEvents)')
  assertIncludes(source, 'function debugBundlePromptDetails')
  assertIncludes(source, 'function debugBundleRunSummary')
  assertIncludes(source, 'function debugBundleMessageWrites')
  assertIncludes(source, 'function debugBundleModelCallContexts')
  assertIncludes(source, 'function debugBundleToolCalls')
  assertIncludes(source, 'const durationMs = traceEventDurationMs(event, data)')
  assertIncludes(source, 'function debugBundlePendingActions')
  assertIncludes(source, 'buildModelCallDebugContexts({ modelCalls, events })')
  assertIncludes(source, 'contentPreview')
  assertIncludes(source, 'dataPreview: formatAgentTraceDebugData(data)')
  assertIncludes(source, 'partIds: group.parts.map((part) => part.id)')
  assertIncludes(source, "function debugBundleRunSnapshot(run: AgentRun | undefined): Omit<AgentRun, 'traceEvents'> | undefined")
  assertIncludes(source, "const role = run.role ?? 'unknown'")
  assertIncludes(source, "roleLabel: run.role ? runRoleLabel(run.role) : '未知'")
  assertIncludes(source, 'data-testid="agent-run-debug-report-copy-feedback"')
  assertIncludes(source, 'data-testid="agent-run-debug-report-copy-feedback" role="status"')
  assertIncludes(source, 'data-testid="agent-run-debug-report-copy-error"')
  assertIncludes(source, 'data-testid="agent-run-debug-report-copy-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-copy-feedback"')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-copy-feedback" role="status"')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-copy-error"')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-copy-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-copy-disabled-reason"')
  assertIncludes(source, "const bundleCopyDisabledReasonId = 'agent-run-debug-bundle-copy-disabled-reason'")
  assertIncludes(source, 'aria-describedby={bundleCopyDisabledReason ? bundleCopyDisabledReasonId : undefined}')
  assertIncludes(source, 'id={bundleCopyDisabledReasonId}')
  assertIncludes(source, 'bundleCopyDisabledReason={runQuery.data ? null')
  assertIncludes(source, 'data-testid="agent-run-debug-bundle-contract"')
  assertIncludes(source, '{DEBUG_BUNDLE_SCHEMA}')
  assertIncludes(source, '{DEBUG_BUNDLE_CAPABILITIES.length} 项能力')
  assertIncludes(source, 'data-testid="agent-run-debug-field-guide"')
  assertIncludes(source, '调试口径')
  assertIncludes(source, 'AGENT_DEBUG_FIELD_GUIDE.map')
  assertIncludes(source, 'const attentionEvents = useMemo(() => buildDebugAttentionEvents(events), [events])')
  assertIncludes(source, 'data-testid="agent-run-attention-events"')
  assertIncludes(source, 'data-testid="agent-run-attention-event"')
  assertIncludes(source, '异常/需关注事件')
  assertIncludes(source, 'function showAttentionEvents')
  assertIncludes(source, "setEventCategory('attention')")
  assertIncludes(source, 'aria-label="只查看需关注运行事件"')
  assertIncludes(source, 'aria-label={`定位需关注事件 ${event.title}`}')
  assertIncludes(source, 'data-testid="agent-run-model-call-summary"')
  assertIncludes(source, 'data-testid="agent-run-model-call-summary-item"')
  assertIncludes(source, 'buildModelCallDebugContext({ call: summary, events })')
  assertIncludes(source, 'data-testid="agent-run-model-call-inline-debug"')
  assertIncludes(source, 'data-testid="agent-run-model-call-inline-http-detail"')
  assertIncludes(source, '本轮详情')
  assertIncludes(source, '关联方式：{context.correlationLabel}')
  assertIncludes(source, '历史写入 {debugContext.messageWrites.length}')
  assertIncludes(source, '工具调用 {debugContext.toolCalls.length}')
  assertIncludes(source, 'aria-label={`定位${summary.label}的模型请求事件`}')
  assertIncludes(source, 'aria-label={`定位${summary.label}的模型响应事件`}')
  assertIncludes(source, 'aria-label={`定位${summary.label}的模型结果事件`}')
  assertIncludes(source, "summary.hasRequestPayload ? '请求负载已存' : '请求负载缺失'")
  assertIncludes(source, "summary.hasResponseBody ? '响应正文已存' : '响应正文缺失'")
  assertIncludes(source, 'data-testid="agent-run-prompt-detail"')
  assertIncludes(source, 'data-testid="agent-run-prompt-part-groups"')
  assertIncludes(source, 'data-testid="agent-run-prompt-parts"')
  assertIncludes(source, 'data-testid="agent-run-model-detail"')
  assertIncludes(source, 'data-testid="agent-run-tool-detail"')
  assertIncludes(source, 'testId="agent-run-model-http-request"')
  assertIncludes(source, 'data-testid="agent-run-model-request-headers"')
  assertIncludes(source, 'formatModelHeaderValue(header)')
  assertIncludes(source, 'function formatModelHeaderValue')
  assertIncludes(source, 'data-testid="agent-run-model-request-payload"')
  assertIncludes(source, '完整请求负载')
  assertIncludes(source, 'formatAgentTraceDebugData(detail.request.payload)')
  assertIncludes(source, 'testId="agent-run-model-request-messages"')
  assertIncludes(source, 'data-testid="agent-run-model-request-message-groups"')
  assertIncludes(source, 'detail.messageGroups.length > 0')
  assertIncludes(source, 'modelDetail?.messageGroups ?? []')
  assertIncludes(source, 'redactAgentTraceDebugText(message.content)')
  assertIncludes(source, 'testId="agent-run-model-request-tools"')
  assertIncludes(source, 'testId="agent-run-model-http-response"')
  assertIncludes(source, 'data-testid="agent-run-model-response-headers"')
  assertIncludes(source, 'redactAgentTraceDebugText(detail.response.content)')
  assertIncludes(source, 'testId="agent-run-model-result"')
  assertIncludes(source, 'data-testid="agent-run-message-detail"')
  assertIncludes(source, '{view.modelDetail.title}')
  assertIncludes(source, '{view.messageDetail.title}')
  assertIncludes(source, 'detail.note')
  assertIncludes(source, 'function ModelDetailSection')
  assertIncludes(source, '原始响应正文')
  assertIncludes(source, '这条事件没有 HTTP 响应正文')
  assertIncludes(source, 'function ModelMetaRow')
  assertIncludes(source, 'function ModelCallDetail')
  assertIncludes(source, 'function MessageDetail')
  assertIncludes(source, 'function ToolDetail')
  assertIncludes(source, 'redactAgentTraceDebugText(detail.content)')
  assertIncludes(source, 'TraceDetailLine')
  assertIncludes(source, 'formatAgentRunTimestamp(runQuery.data.createdAt)')
  assertIncludes(source, 'function formatAgentRunTimestamp')
  assertIncludes(source, 'const runDuration = formatAgentRunDuration')
  assertIncludes(source, 'function formatAgentRunDuration')
  assertIncludes(source, "formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel")
  assertIncludes(source, 'const traceHasUnloadedEvents = hasUnloadedTraceEvents({ loaded: events.length, total: traceTotal, hasMore })')
  assertIncludes(source, 'const eventDuration = formatTraceEventDuration(event)')
  assertIncludes(source, '耗时 {eventDuration}')
  assertIncludes(source, '最新事件')
  assertIncludes(source, 'traceKindLabel(kind as AgentTraceEventKind)')
  assertIncludes(source, 'traceCategoryLabel(category)')
  assertIncludes(source, 'categoryCounts.map(([category, count])')
  assertIncludes(source, 'initialTraceLoadRunIdRef.current = runId')
  assertIncludes(source, 'mergeTraceEvents')
  assertIncludes(source, 'TRACE_BULK_PAGE_SIZE')
  assertIncludes(source, 'traceFiltersActive')
  assertIncludes(source, 'setTraceLoadError')
  assertIncludes(source, 'summaryQuery.refetch()')
  assertIncludes(source, 'ring-1 ring-primary/30')
  assertIncludes(source, 'expandedEventIds')
  assertIncludes(source, 'setTraceDeepLinkEventId')
  assertIncludes(source, "window.addEventListener('hashchange'")
  assertIncludes(source, 'buildModelCallSummaries(events)')
  assertIncludes(source, 'buildDebugCoverageSummary({')
  assertIncludes(source, 'buildDebugReportText({')
  assertIncludes(source, 'setDebugReportCopyError')
  assertIncludes(source, 'setDebugReportCopied(false)')
  assertIncludes(source, 'setDebugBundleCopied(false)')
  assertIncludes(source, 'setDebugBundleCopyError')
  assertIncludes(source, '}, [debugReportText])')
  assertIncludes(source, 'function DebugCoveragePanel')
  assertIncludes(source, 'function DebugCoverageMetric')
  assertIncludes(source, 'function ModelCallSummaryPanel')
  assertIncludes(source, 'function PromptDetail')
  assertIncludes(source, 'function PromptMetricList')
  assertIncludes(source, 'function PromptNameList')
  assertIncludes(source, "open={view.category === 'http'}")
  assertIncludes(source, '全部分类')
  assertIncludes(source, '运行轨迹')
  assertIncludes(source, 'runStatusLabel(runQuery.data.status)')
  assertIncludes(source, 'traceEventStatusLabel(event.status)')
  assertIncludes(source, 'modelDetail?.request?.model')
  assertIncludes(source, 'promptDetail?.partGroups ?? []')
  assertIncludes(source, 'promptDetail?.parts ?? []')
  assertIncludes(source, 'modelDetail?.request?.headers ?? []')
  assertIncludes(source, 'modelDetail?.messages ?? []')
  assertIncludes(source, 'modelDetail?.tools ?? []')
  assertIncludes(source, 'modelDetail?.response?.headers ?? []')
  assertIncludes(source, 'modelDetail?.response?.content')
  assertIncludes(source, 'messageDetail?.content')
  assertIncludes(source, 'toolDetail?.toolName')
  assertIncludes(source, 'toolDetail?.fields ?? []')
  assertIncludes(source, 'function searchTextToken')
  assertIncludes(source, 'text.length > 2000 ? text.slice(0, 2000) : text')
  assertIncludes(source, 'data-testid="agent-run-pending-input"')
  assertIncludes(source, 'inputTypeLabel(request.inputType)')
  assertIncludes(source, 'data-testid="agent-run-input-choice"')
  assertIncludes(source, 'aria-label={`回答${request.title}: ${choice.label}`}')
  assertIncludes(source, 'data-testid="agent-run-input-text"')
  assertIncludes(source, 'aria-label={`输入${request.title}的自定义答案`}')
  assertIncludes(source, 'data-testid="agent-run-input-submit"')
  assertIncludes(source, 'aria-label={`提交${request.title}的自定义答案`}')
  assertIncludes(source, 'data-testid="agent-run-input-error"')
  assertIncludes(source, 'data-testid="agent-run-input-error" role="alert"')
  assertIncludes(source, 'data-testid="agent-run-empty-load-all"')
  assertIncludes(source, 'aria-label="加载全部运行事件后重新搜索"')
  assertIncludes(source, 'data-testid="agent-run-pending-approval"')
  assertIncludes(source, 'data-testid="agent-run-approval-action"')
  assertIncludes(source, 'aria-label={`同意执行${approval.toolName}`}')
  assertIncludes(source, 'aria-label={`拒绝执行${approval.toolName}`}')
  assertIncludes(source, 'data-testid="agent-run-approval-error"')
  assertIncludes(source, 'data-testid="agent-run-approval-error" role="alert"')
  assertIncludes(source, 'approvalImpactLabel(approval)')
  assertIncludes(source, 'data-testid="agent-run-cancel-worker"')
  assertIncludes(source, 'aria-label={`取消执行器 ${subagentName ?? runId}`}')
  assertIncludes(source, 'data-testid="agent-run-cancel-error"')
  assertIncludes(source, 'data-testid="agent-run-cancel-error" role="alert"')
  assertIncludes(source, 'aria-label="打开上级运行"')
  assertIncludes(source, 'aria-label="打开计划根运行"')
  assertIncludes(source, 'aria-label="返回上一页"')
  assertIncludes(source, 'aria-label="刷新 AgentRun 调试页面"')
  assertIncludes(source, '<AgentRunGenerationArtifacts run={runQuery.data} />')
  assertIncludes(source, 'buildPlanTaskViews(planQuery.data)')
  assertIncludes(source, 'buildTaskArtifactViews(runPlanTask, 5, planQuery.data)')
  assertIncludes(source, 'buildTraceEventLink({')
  assertIncludes(source, 'traceEventIdFromHash(window.location.hash)')

  const agentRunUiSource = readFileSync(resolve('src/lib/agentRunUi.ts'), 'utf8')
  assertIncludes(agentRunUiSource, 'export const AGENT_DEBUG_FIELD_GUIDE')
  assertIncludes(agentRunUiSource, '模型请求')
  assertIncludes(agentRunUiSource, '模型响应')
  assertIncludes(agentRunUiSource, '历史写入')
  assertIncludes(agentRunUiSource, '缺失项')
  assertIncludes(agentRunUiSource, '调试口径:')

  const generationArtifactsSource = readFileSync(resolve('src/components/agent/AgentRunGenerationArtifacts.tsx'), 'utf8')
  assertIncludes(generationArtifactsSource, 'generationParamAuditsFromRun(run)')
  assertIncludes(generationArtifactsSource, 'data-testid="agent-run-generation-param-audit"')
  assertIncludes(generationArtifactsSource, '<GenerationParamAuditCard audits={generationParamAudits} />')
  assertIncludes(generationArtifactsSource, 'generationValidationErrorsFromRun(run)')
  assertIncludes(generationArtifactsSource, 'data-testid="agent-run-generation-validation-errors"')
  assertIncludes(generationArtifactsSource, '<GenerationValidationErrorCard errors={generationValidationErrors} />')
})

test('agent run page renders generation audit and validation cards from run steps', () => {
  const run = {
    id: 'run_generation_contract',
    threadId: 'thread_1',
    status: 'failed',
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: [
      {
        id: 'step_audit',
        runId: 'run_generation_contract',
        type: 'tool_call',
        status: 'completed',
        toolName: 'movscript_create_generation_job',
        result: {
          data: {
            jobId: 45,
            param_validation: {
              audit_version: 1,
              model_config_id: 12,
              model_contract_loaded: true,
              params_schema_loaded: true,
              params_schema_rule_count: 2,
              supported_params: ['duration', 'resolution'],
              provided_extra_params: ['duration', 'unsupported_flag'],
              submitted_extra_params: ['duration'],
              dropped_extra_params: ['unsupported_flag'],
              dropped_top_level_params: ['aspect_ratio'],
              drop_reasons: {
                unsupported_flag: 'unsupported_extra_param',
                aspect_ratio: 'unsupported_top_level_param',
              },
              preflight_errors: [{
                code: 'INVALID_PARAMETER_OPTION',
                field: 'duration',
                message: 'duration is not supported for this model',
                allowed_values: ['5', '10'],
              }],
            },
          },
        },
        createdAt: '2026-05-13T00:00:01.000Z',
      },
      {
        id: 'step_error',
        runId: 'run_generation_contract',
        type: 'tool_call',
        status: 'failed',
        toolName: 'movscript_create_generation_job',
        error: 'unsupported output type',
        errorData: {
          type: 'backend_http_error',
          status: 400,
          code: 'UNSUPPORTED_OUTPUT_TYPE',
          field: 'output_type',
          message: 'model "Reference Image" does not support output type "video"',
          allowed_values: ['image'],
        },
        createdAt: '2026-05-13T00:00:02.000Z',
      },
    ],
  } as unknown as AgentRun

  const html = renderToStaticMarkup(<AgentRunGenerationArtifacts run={run} />)

  assertIncludes(html, 'data-testid="agent-run-generation-param-audit"')
  assertIncludes(html, 'data-testid="agent-generation-param-audit"')
  assertIncludes(html, 'unsupported_flag (不支持)')
  assertIncludes(html, 'aspect_ratio (模型不支持)')
  assertIncludes(html, 'duration (INVALID_PARAMETER_OPTION，允许 5/10)')
  assertIncludes(html, 'data-testid="agent-run-generation-validation-errors"')
  assertIncludes(html, 'data-testid="agent-generation-validation-errors"')
  assertIncludes(html, 'UNSUPPORTED_OUTPUT_TYPE')
  assertIncludes(html, '允许值')
  assertIncludes(html, 'image')
})

test('agent run debug bundle schema and fixture document the copy contract', () => {
  const schema = JSON.parse(readFileSync(resolve('../../contracts/agent-run-debugging/agent-run-debug-bundle-v1.schema.json'), 'utf8')) as {
    required: string[]
    properties: Record<string, unknown>
    $defs: { capability: { enum: string[] } }
  }
  const fixture = JSON.parse(readFileSync(resolve('../../contracts/agent-run-debugging/agent-run-debug-bundle-v1.fixture.json'), 'utf8')) as Record<string, unknown>
  const pageSource = readFileSync(resolve('src/pages/agent/AIAgentRunPage.tsx'), 'utf8')
  const e2eSource = readFileSync(resolve('src/e2e/agent-planner.spec.ts'), 'utf8')
  const fixtureText = JSON.stringify(fixture)

  assert.equal(fixture.schema, 'movscript.agent-run-debug-bundle.v1')
  assert.equal(fixture.schemaUrl, 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json')
  assert.equal(typeof fixture.generatedAt, 'string')
  assert.deepEqual(
    schema.required.filter((field) => !(field in fixture)),
    [],
    'fixture should include every required debug bundle field',
  )
  assert.equal('runSummary' in schema.properties, true)

  for (const capability of schema.$defs.capability.enum) {
    assertIncludes(fixtureText, capability)
    assertIncludes(pageSource, `'${capability}'`)
  }

  assertIncludes(fixtureText, '"modelCallContexts"')
  assertIncludes(fixtureText, '"requestEventId"')
  assertIncludes(fixtureText, '"responseEventId"')
  assertIncludes(fixtureText, '"messageWrites"')
  assertIncludes(fixtureText, '"bodyText"')
  assertIncludes(fixtureText, '"action"')
  assertIncludes(fixtureText, '"fieldGuide"')
  assertIncludes(fixtureText, '"model_request"')
  assertIncludes(e2eSource, 'captureAgentRunAcceptanceScreenshot')
  assertIncludes(e2eSource, 'agent-run-debug-overview')
  assertIncludes(e2eSource, 'agent-run-model-call-expanded')
  assertIncludes(e2eSource, 'agent-run-http-request-detail')
  assertIncludes(e2eSource, 'agent-run-http-response-detail')
  assertIncludes(e2eSource, 'agent-run-attention-events')
  assertIncludes(e2eSource, 'agent-run-missing-data')
})

function assertIncludes(value: string, expected: string) {
  assert.equal(value.includes(expected), true, `expected output to include ${expected}`)
}
