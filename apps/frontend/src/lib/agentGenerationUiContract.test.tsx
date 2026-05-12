import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { GenerationJobSummaryCard, GenerationParamAuditCard, GenerationProgressCard, GenerationTraceSummaryCard } from '@/components/agent/GenerationCards'

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
      supportedParams: ['duration', 'resolution'],
      providedExtraParams: ['duration', 'resolution', 'unsupported_flag'],
      submittedExtraParams: ['duration', 'resolution'],
      droppedExtraParams: ['unsupported_flag'],
      droppedTopLevelParams: ['aspect_ratio'],
    }]} />,
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
  assertIncludes(auditHtml, 'unsupported_flag')
})

test('agent panel keeps generated result and binding hooks for browser E2E', () => {
  const source = readFileSync(resolve('src/components/agent/GeneratedResultCard.tsx'), 'utf8')
  assertIncludes(source, 'data-testid="agent-generated-result-card"')
  assertIncludes(source, 'data-testid="agent-generated-media-preview"')
  assertIncludes(source, 'data-testid="agent-generated-resource-binding"')
})

function assertIncludes(value: string, expected: string) {
  assert.equal(value.includes(expected), true, `expected output to include ${expected}`)
}
