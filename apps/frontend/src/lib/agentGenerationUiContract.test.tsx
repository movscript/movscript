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
  const viewModelSource = readFileSync(resolve('src/lib/agentMessageViewModel.ts'), 'utf8')
  assertIncludes(source, 'assistantResultPayloadForRun(run, liveEvents, content)')
  assertIncludes(source, 'restoredChatMessageFromLocalMessage(message, restoredLabel)')
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
})

test('agent run page keeps plan context and trace drilldown hooks', () => {
  const source = readFileSync(resolve('src/pages/agent/AIAgentRunPage.tsx'), 'utf8')
  assertIncludes(source, 'data-testid="agent-run-page"')
  assertIncludes(source, 'data-testid="agent-run-header"')
  assertIncludes(source, 'data-testid="agent-run-sidebar"')
  assertIncludes(source, 'data-testid="agent-run-child-runs"')
  assertIncludes(source, 'data-testid="agent-run-child-run"')
  assertIncludes(source, 'data-testid="agent-run-plan-context"')
  assertIncludes(source, 'data-testid="agent-run-task-artifacts"')
  assertIncludes(source, 'data-testid="agent-run-trace-panel"')
  assertIncludes(source, 'data-testid="agent-run-trace-summary"')
  assertIncludes(source, 'data-testid="agent-run-trace-search"')
  assertIncludes(source, 'data-testid="agent-run-load-trace-events"')
  assertIncludes(source, 'data-testid="agent-run-trace-event"')
  assertIncludes(source, 'data-testid="agent-run-trace-event-details-toggle"')
  assertIncludes(source, 'data-testid="agent-run-trace-event-details"')
  assertIncludes(source, 'data-testid="agent-run-pending-input"')
  assertIncludes(source, 'data-testid="agent-run-input-choice"')
  assertIncludes(source, 'data-testid="agent-run-input-text"')
  assertIncludes(source, 'data-testid="agent-run-input-submit"')
  assertIncludes(source, 'data-testid="agent-run-input-error"')
  assertIncludes(source, 'data-testid="agent-run-pending-approval"')
  assertIncludes(source, 'data-testid="agent-run-approval-action"')
  assertIncludes(source, 'data-testid="agent-run-approval-error"')
  assertIncludes(source, 'data-testid="agent-run-cancel-worker"')
  assertIncludes(source, 'data-testid="agent-run-cancel-error"')
  assertIncludes(source, '<AgentRunGenerationArtifacts run={runQuery.data} />')
  assertIncludes(source, 'buildPlanTaskViews(planQuery.data)')
  assertIncludes(source, 'buildTaskArtifactViews(runPlanTask, 5, planQuery.data)')
  assertIncludes(source, 'buildTraceEventLink({')
  assertIncludes(source, 'traceEventIdFromHash(window.location.hash)')

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

function assertIncludes(value: string, expected: string) {
  assert.equal(value.includes(expected), true, `expected output to include ${expected}`)
}
