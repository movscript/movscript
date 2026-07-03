import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('tool page image history uses fixed-size paged grid without compressing the prompt composer', () => {
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const historySectionSource = readFileSync(resolve('src/features/tools/components/ToolDialogHistorySection.tsx'), 'utf8')
  const frameStyles = readFileSync(resolve('src/features/tools/components/ToolDialogFrame.css'), 'utf8')
  const historyStyles = readFileSync(resolve('src/features/tools/components/ToolDialogHistory.css'), 'utf8')

  assert.match(toolDialogSource, /const historyPageSize = layout === 'reference-workbench' \|\| outputType === 'image' \? 6 : 10/)
  assert.match(toolDialogSource, /showHistory \? 'tool-dialog-main--with-history' : undefined/)
  assert.match(toolDialogSource, /showHistory && outputType === 'image' \? 'tool-dialog-main--fixed-history' : undefined/)
  assert.match(historySectionSource, /const useGridHistory = layout === 'reference-workbench' \|\| outputType === 'image'/)
  assert.match(historySectionSource, /className=\{useGridHistory \? 'tool-dialog-history--fixed-page' : undefined\}/)
  assert.match(historySectionSource, /className=\{useGridHistory \? 'tool-dialog-history-list--grid' : undefined\}/)
  assert.match(historySectionSource, /useGridHistory \? \(/)
  assert.match(frameStyles, /\.tool-dialog-main--with-history \{[\s\S]*--tool-dialog-composer-row-max: min\(48vh, 400px\);[\s\S]*minmax\(var\(--tool-dialog-composer-row-min\), var\(--tool-dialog-composer-row-max\)\)[\s\S]*minmax\(var\(--tool-dialog-history-row-min\), 1fr\);[\s\S]*align-content: stretch;/)
  assert.match(frameStyles, /\.tool-dialog-main--fixed-history \{[\s\S]*minmax\(var\(--tool-dialog-composer-row-min\), var\(--tool-dialog-composer-row-max\)\)[\s\S]*max-content;[\s\S]*align-content: start;/)
  assert.match(frameStyles, /\.tool-dialog-body--reference-workbench \.tool-dialog-main--fixed-history \{[\s\S]*minmax\(var\(--tool-dialog-composer-row-min\), var\(--tool-dialog-composer-row-max\)\)[\s\S]*max-content;[\s\S]*align-content: start;/)
  assert.match(frameStyles, /\.tool-dialog-main--with-history > \.tool-dialog-panel \{[\s\S]*height: 100%;[\s\S]*overflow: hidden;/)
  assert.match(frameStyles, /\.tool-dialog-main--with-history \.tool-dialog-panel__body \{[\s\S]*height: 100%;[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain;/)
  assert.match(historyStyles, /\.tool-dialog-history \{[\s\S]*display: flex;[\s\S]*min-height: 0;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/)
  assert.match(historyStyles, /\.tool-dialog-history-header \{[\s\S]*flex: 0 0 auto;/)
  assert.match(historyStyles, /\.tool-dialog-history-list \{[\s\S]*min-height: 0;[\s\S]*flex: 1 1 auto;[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain;/)
  assert.match(historyStyles, /\.tool-dialog-history--fixed-page \{[\s\S]*max-height: none;[\s\S]*overflow: visible;/)
  assert.match(historyStyles, /\.tool-dialog-history-list\.tool-dialog-history-list--grid \{[\s\S]*grid-template-columns: repeat\(auto-fill, minmax\(148px, 180px\)\);[\s\S]*flex: 0 0 auto;[\s\S]*overflow: visible;/)
})
