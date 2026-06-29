import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('debug curl copy is disabled for multipart summaries', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/DebugPage.tsx'), 'utf8')

  assert.match(source, /function isMultipartDebugSummary\(body\?: string\): boolean/)
  assert.match(source, /trimmed\.startsWith\('\(multipart:'\) \|\| trimmed\.startsWith\('\[multipart'\)/)
  assert.match(source, /function buildCurlCommand\(method: string, url: string, headers: Record<string, string>, body\?: string\): string \| null/)
  assert.match(source, /if \(isMultipartDebugSummary\(body\)\) return null/)
  assert.match(source, /const curlCmd = \(method && url && headers\)[\s\S]*\? buildCurlCommand\(method, url, headers, body\)[\s\S]*: null/)
})

test('job debug view surfaces route trace and request shape', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/admin/DebugPage.tsx'), 'utf8')
  const types = readFileSync(resolve(process.cwd(), 'src/types/index.ts'), 'utf8')

  assert.match(types, /export interface DebugRouteTrace/)
  assert.match(types, /route_trace\?: DebugRouteTrace/)
  assert.match(types, /request_shape\?: string/)
  assert.match(types, /content_type\?: string/)
  assert.match(source, /function RouteTraceBlock\(\{ trace \}: \{ trace\?: DebugRouteTrace \}\)/)
  assert.match(source, /<RouteTraceBlock trace=\{job\.debug_detail\.route_trace\} \/>/)
  assert.match(source, /requestShape=\{call\.request_shape\}/)
  assert.match(source, /contentType=\{call\.content_type\}/)
  assert.match(source, /Multipart summary only; curl copy is disabled\./)
})
