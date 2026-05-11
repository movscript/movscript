import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { GenerationJobSummaryCard, GenerationProgressCard, GenerationTraceSummaryCard } from './GenerationCards'

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
