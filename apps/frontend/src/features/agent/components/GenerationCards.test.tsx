import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { GenerationJobSummaryCard, GenerationParamAuditCard, GenerationProgressCard, GenerationTraceSummaryCard, GenerationValidationErrorCard } from './GenerationCards'

test('GenerationProgressCard renders progressbar and test hooks', () => {
  const html = renderToStaticMarkup(
    <GenerationProgressCard state={{
      jobId: 8,
      status: 'running',
      stage: 'rendering',
      progress: 55,
      terminal: false,
      outputResourceId: 88,
      message: '正在渲染',
      firstSeenAt: '2026-05-09T08:00:00.000Z',
      updatedAt: '2026-05-09T08:00:10.000Z',
    }} />,
  )

  assert.equal(html.includes('data-testid="agent-generation-progress"'), true)
  assert.equal(html.includes('role="progressbar"'), true)
  assert.equal(html.includes('aria-valuenow="55"'), true)
  assert.equal(html.includes('生成任务 #8'), true)
  assert.equal(html.includes('正在渲染'), true)
})

test('GenerationProgressCard renders monitor timeout as explicit feedback', () => {
  const html = renderToStaticMarkup(
    <GenerationProgressCard state={{
      jobId: 10,
      status: 'timeout',
      stage: 'timeout',
      progress: 72,
      terminal: false,
    }} />,
  )

  assert.equal(html.includes('生成任务 #10'), true)
  assert.equal(html.includes('超时'), true)
  assert.equal(html.includes('生成监控已超时'), true)
  assert.equal(html.includes('aria-valuenow="72"'), true)
})

test('GenerationProgressCard renders waiting state without fake progress', () => {
  const html = renderToStaticMarkup(
    <GenerationProgressCard state={{
      jobId: 11,
      status: 'running',
      stage: 'provider_rendering',
      terminal: false,
    }} />,
  )

  assert.equal(html.includes('data-testid="agent-generation-waiting-bar"'), true)
  assert.equal(html.includes('aria-valuetext="等待生成服务返回结果"'), true)
  assert.equal(html.includes('aria-valuenow='), false)
  assert.equal(html.includes('正在等待生成服务返回结果'), true)
})

test('GenerationJobSummaryCard renders summary cards with accessible progressbars', () => {
  const html = renderToStaticMarkup(
    <GenerationJobSummaryCard jobs={[
      {
        jobId: 9,
        jobType: 'video',
        status: 'succeeded',
        stage: 'completed',
        progress: 100,
        terminal: true,
        outputResourceId: 99,
        message: '完成',
        firstSeenAt: '2026-05-09T08:00:00.000Z',
        completedAt: '2026-05-09T08:01:00.000Z',
      },
    ]} />,
  )

  assert.equal(html.includes('data-testid="agent-generation-job-summary"'), true)
  assert.equal(html.includes('data-testid="agent-generation-job-progress-bar"'), true)
  assert.equal(html.includes('role="progressbar"'), true)
  assert.equal(html.includes('aria-valuenow="100"'), true)
  assert.equal(html.includes('完成'), true)
})

test('generation cards render multiple output resource ids', () => {
  const progressHtml = renderToStaticMarkup(
    <GenerationProgressCard state={{
      jobId: 12,
      status: 'succeeded',
      stage: 'completed',
      terminal: true,
      outputResourceId: 120,
      outputResourceIds: [120, 121],
    }} />,
  )
  const summaryHtml = renderToStaticMarkup(
    <GenerationJobSummaryCard jobs={[{
      jobId: 12,
      status: 'succeeded',
      terminal: true,
      outputResourceId: 120,
      outputResourceIds: [120, 121],
    }]} />,
  )

  assert.equal(progressHtml.includes('输出资源 #120、#121'), true)
  assert.equal(summaryHtml.includes('资源 #120、#121'), true)
})

test('GenerationParamAuditCard renders preflight suggested fixes', () => {
  const html = renderToStaticMarkup(
    <GenerationParamAuditCard audits={[
      {
        stepId: 'step-1',
        jobId: 12,
        modelConfigId: 34,
        modelContractLoaded: true,
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 3,
        inputRequirements: {
          image: { min: 1, max: 4 },
          video: { min: 0, max: 0 },
        },
        submittedInputs: {
          image: 5,
          video: 0,
        },
        supportedParams: ['return_last_frame'],
        providedExtraParams: ['return_last_frame'],
        submittedExtraParams: ['return_last_frame'],
        droppedExtraParams: [],
        droppedTopLevelParams: [],
        preflightErrors: [{
          code: 'INVALID_PARAMETER_CONDITIONAL_CONST',
          field: 'return_last_frame',
          message: 'return_last_frame must be false for this model mode',
          suggestedFix: { return_last_frame: false },
        }],
        inputPreflightErrors: [{
          code: 'INVALID_INPUT_COUNT',
          field: 'image',
          message: 'image generation input count is above the local model contract maximum',
          requiredMin: 1,
          allowedMax: 4,
          actualCount: 5,
        }],
      },
    ]} />,
  )

  assert.equal(html.includes('data-testid="agent-generation-param-audit"'), true)
  assert.equal(html.includes('本地预检'), true)
  assert.equal(html.includes('return_last_frame'), true)
  assert.equal(html.includes('建议'), true)
  assert.equal(html.includes('return_last_frame=false'), true)
  assert.equal(html.includes('输入需求'), true)
  assert.equal(html.includes('输入预检'), true)
  assert.equal(html.includes('图片 5 个'), true)
})

test('GenerationParamAuditCard renders null suggested fixes as parameter removal', () => {
  const html = renderToStaticMarkup(
    <GenerationParamAuditCard audits={[
      {
        stepId: 'step-1',
        jobId: 12,
        modelConfigId: 34,
        modelContractLoaded: true,
        paramsSchemaLoaded: true,
        supportedParams: ['duration', 'frames'],
        providedExtraParams: ['frames'],
        submittedExtraParams: ['frames'],
        droppedExtraParams: [],
        droppedTopLevelParams: [],
        preflightErrors: [{
          code: 'INVALID_PARAMETER_COMBINATION',
          field: 'duration',
          message: 'duration and frames cannot be used together',
          suggestedFix: { frames: null },
        }],
      },
    ]} />,
  )

  assert.equal(html.includes('建议'), true)
  assert.equal(html.includes('删除 frames'), true)
})

test('GenerationValidationErrorCard renders structured backend validation details', () => {
  const html = renderToStaticMarkup(
    <GenerationValidationErrorCard errors={[
      {
        stepId: 'step-1',
        code: 'UNSUPPORTED_OUTPUT_TYPE',
        field: 'output_type',
        message: 'model "Reference Image" does not support output type "video"',
        allowedValues: ['image'],
      },
      {
        stepId: 'step-2',
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        message: 'model "Reference Image" supports at most 4 image input(s), but 5 were provided',
        requiredMin: 1,
        allowedMax: 4,
        actualCount: 5,
      },
    ]} />,
  )

  assert.equal(html.includes('data-testid="agent-generation-validation-errors"'), true)
  assert.equal(html.includes('生成校验失败'), true)
  assert.equal(html.includes('UNSUPPORTED_OUTPUT_TYPE'), true)
  assert.equal(html.includes('允许值'), true)
  assert.equal(html.includes('image'), true)
  assert.equal(html.includes('输入数量'), true)
  assert.equal(html.includes('5'), true)
})

test('GenerationTraceSummaryCard renders process totals and latest state', () => {
  const html = renderToStaticMarkup(
    <GenerationTraceSummaryCard jobs={[
      {
        jobId: 1,
        jobType: 'image',
        status: 'running',
        stage: 'queued',
        progress: 20,
        terminal: false,
      },
      {
        jobId: 1,
        jobType: 'image',
        status: 'succeeded',
        stage: 'completed',
        progress: 100,
        terminal: true,
        outputResourceId: 11,
        providerName: 'Provider A',
        modelDisplay: 'Model A',
      },
      {
        jobId: 2,
        jobType: 'video',
        status: 'failed',
        stage: 'failed',
        terminal: true,
      },
    ]} />,
  )

  assert.equal(html.includes('data-testid="agent-generation-trace-summary"'), true)
  assert.equal(html.includes('过程总览'), true)
  assert.equal(html.includes('监控中'), true)
  assert.equal(html.includes('已结束'), true)
  assert.equal(html.includes('成功'), true)
  assert.equal(html.includes('失败'), true)
  assert.equal(html.includes('最新 Job #2'), true)
})
