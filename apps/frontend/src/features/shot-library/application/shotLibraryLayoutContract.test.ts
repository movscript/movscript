import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('shot import dialog measurement and scroll ownership use feature layout helpers', () => {
  const pageSource = readFileSync(resolve('src/features/shot-library/components/ShotLibraryPage.tsx'), 'utf8')
  const layoutSource = readFileSync(resolve('src/features/shot-library/domain/shotLibraryLayout.ts'), 'utf8')
  const measurementSource = readFileSync(resolve('src/features/shot-library/presentation/shotLibraryMeasurement.ts'), 'utf8')
  const appStyles = readFileSync(resolve('src/index.css'), 'utf8')

  assert.match(layoutSource, /export function shotLibraryMeasuredBoxFromRect/)
  assert.match(layoutSource, /export function calculateShotWorkspaceGridMetrics/)
  assert.match(measurementSource, /export function shotLibraryMeasuredBoxFromElement/)
  assert.match(measurementSource, /export function subscribeShotLibraryMeasuredBox/)
  assert.match(pageSource, /subscribeShotLibraryMeasuredBox\(gridRef\.current, setSize\)/)
  assert.match(pageSource, /calculateShotWorkspaceGridMetrics\(size, workspaceCount\)/)
  assert.doesNotMatch(pageSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(pageSource, /new ResizeObserver/)
  assert.doesNotMatch(pageSource, /window\.addEventListener\('resize'/)
  assert.doesNotMatch(pageSource, /function calculateShotWorkspaceGridMetrics/)
  assert.match(pageSource, /className="shot-import-dialog__body" data-scroll-owner="dialog-body"/)
  assert.match(appStyles, /\.shot-import-dialog__body\[data-scroll-owner="dialog-body"\] \{[\s\S]*overflow: hidden;[\s\S]*overscroll-behavior: contain;/)
})
