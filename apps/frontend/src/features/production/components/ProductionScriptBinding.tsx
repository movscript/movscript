import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, Plus, ScrollText } from 'lucide-react'

import type { ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import {
  firstScriptText,
  formatVersionUpdatedAt,
  scriptBlockLineLabel,
  scriptBlockSelectLabel,
  scriptLineEntries,
  scriptVersionOptionLabel,
  type ProductionScriptBlockRecord,
} from '@/features/production/domain/productionScriptBlocks'
import { ROUTES } from '@/routes/projectRoutes'
import { productionPresenceRecipe } from '@/features/production/presentation/productionSemanticUi'
import {
  Dialog,
  ProductionScriptBindingAction,
  ProductionScriptBindingHeader,
  ProductionScriptBindingIconAction,
  ProductionScriptBindingInline,
  ProductionScriptBindingInlineAction,
  ProductionScriptBindingInlineMeta,
  ProductionScriptBindingPanel,
  ProductionScriptBindingPresenceBadge,
  ProductionScriptBindingSelectTrigger,
  ProductionScriptBindingSpinner,
  ProductionScriptBlockBoundBadge,
  ProductionScriptBlockList,
  ProductionScriptBlockListItem,
  ProductionScriptBlockSummary,
  ProductionScriptCreateEmptyState,
  ProductionScriptCreatePanel,
  ProductionScriptLineItem,
  ProductionScriptLineList,
  ProductionScriptPickerContent,
  ProductionScriptPickerLayout,
  ProductionScriptPickerPreviewHeader,
  ProductionScriptPreviewCard,
  ProductionScriptPreviewMetaText,
  ProductionScriptPreviewRoleBadge,
  ProductionScriptPreviewStack,
  ProductionScriptSelectionSummary,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  WorkbenchEmptyState,
} from '@movscript/ui'

type SceneMomentScriptBindingRecord = {
  ID: number
}

export function ScriptVersionBindingBar({
  scriptVersions,
  selectedScriptVersion,
  scriptText,
  scriptBlockCount,
  isFetching,
  isSaving,
  disabled,
  onChange,
}: {
  scriptVersions: ScriptVersion[]
  selectedScriptVersion: ScriptVersion | null
  scriptText: string
  scriptBlockCount: number
  isFetching: boolean
  isSaving: boolean
  disabled: boolean
  onChange: (scriptVersionId: number | null) => void
}) {
  const selectedValue = selectedScriptVersion ? String(selectedScriptVersion.ID) : '__none__'
  const scriptLength = scriptText.length
  return (
    <ProductionScriptBindingPanel>
      <ProductionScriptBindingHeader
        icon={ScrollText}
        eyebrow="制作剧本"
        description={selectedScriptVersion
          ? `${scriptVersionOptionLabel(selectedScriptVersion)} · ${scriptBlockCount} 个剧本块 · 约 ${scriptLength} 字`
          : '选择一份制作级剧本后，编排段和情节再引用具体剧本块。'}
        meta={selectedScriptVersion ? formatVersionUpdatedAt(selectedScriptVersion.UpdatedAt) : undefined}
        actions={(
          <>
            <Select
              value={selectedValue}
              onValueChange={(value) => onChange(value === '__none__' ? null : Number(value))}
              disabled={disabled || isFetching || isSaving || scriptVersions.length === 0}
            >
              <ProductionScriptBindingSelectTrigger>
                <SelectValue placeholder={isFetching ? '读取剧本...' : '选择剧本'} />
              </ProductionScriptBindingSelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不绑定剧本</SelectItem>
                {scriptVersions.map((version) => (
                  <SelectItem key={version.ID} value={String(version.ID)}>
                    {scriptVersionOptionLabel(version)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSaving ? <ProductionScriptBindingSpinner icon={Loader2} /> : null}
            {scriptVersions.length === 0 ? (
              <ProductionScriptBindingAction asChild size="sm" variant="outline">
                <Link to={ROUTES.project.scripts}>
                  <Plus size={12} />
                  去创建剧本
                </Link>
              </ProductionScriptBindingAction>
            ) : null}
          </>
        )}
      />
    </ProductionScriptBindingPanel>
  )
}

export function ScriptVersionBindingInline({
  scriptVersions,
  selectedScriptVersion,
  scriptText,
  scriptBlockCount,
  isFetching,
  isSaving,
  disabled,
  onChange,
}: {
  scriptVersions: ScriptVersion[]
  selectedScriptVersion: ScriptVersion | null
  scriptText: string
  scriptBlockCount: number
  isFetching: boolean
  isSaving: boolean
  disabled: boolean
  onChange: (scriptVersionId: number | null) => void
}) {
  const selectedValue = selectedScriptVersion ? String(selectedScriptVersion.ID) : '__none__'
  const scriptLength = scriptText.length
  return (
    <ProductionScriptBindingInline icon={ScrollText} label="制作剧本">
      <Select
        value={selectedValue}
        onValueChange={(value) => onChange(value === '__none__' ? null : Number(value))}
        disabled={disabled || isFetching || isSaving || scriptVersions.length === 0}
      >
        <ProductionScriptBindingSelectTrigger density="inline">
          <SelectValue placeholder={isFetching ? '读取剧本...' : '选择剧本'} />
        </ProductionScriptBindingSelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">不绑定剧本</SelectItem>
          {scriptVersions.map((version) => (
            <SelectItem key={version.ID} value={String(version.ID)}>
              {scriptVersionOptionLabel(version)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ProductionScriptBindingPresenceBadge statusProps={productionPresenceRecipe(Boolean(scriptText))}>
        {scriptText ? `${scriptBlockCount} 块 · 约 ${scriptLength} 字` : '待绑定'}
      </ProductionScriptBindingPresenceBadge>
      {selectedScriptVersion ? (
        <ProductionScriptBindingInlineMeta>{formatVersionUpdatedAt(selectedScriptVersion.UpdatedAt)}</ProductionScriptBindingInlineMeta>
      ) : null}
      {isSaving ? <ProductionScriptBindingSpinner icon={Loader2} /> : null}
      {scriptVersions.length === 0 ? (
        <ProductionScriptBindingInlineAction asChild size="sm" variant="outline">
          <Link to={ROUTES.project.scripts}>
            <Plus size={12} />
            去创建剧本
          </Link>
        </ProductionScriptBindingInlineAction>
      ) : null}
    </ProductionScriptBindingInline>
  )
}

export function SceneMomentScriptBlockBinder({
  selectedMoment,
  momentBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  allowCreateFromScriptRange = true,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  selectedMoment: SceneMomentScriptBindingRecord | null
  momentBlock: ProductionScriptBlockRecord | null
  scriptBlocks: ProductionScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  allowCreateFromScriptRange?: boolean
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <ProductionScriptBindingPanel flushTop>
      <ProductionScriptBindingHeader
        icon={ScrollText}
        eyebrow="绑定剧本块"
        description="先选当前情节对应的主剧本块；弹窗里可以查看上下文并扩选范围。"
        actions={isSaving ? <ProductionScriptBindingSpinner icon={Loader2} /> : null}
      />
      <ProductionScriptBlockSummary
        title={momentBlock ? scriptBlockSelectLabel(momentBlock) : '未绑定剧本块'}
        description={momentBlock ? firstScriptText(momentBlock.content, momentBlock.summary, momentBlock.title, `剧本块 #${momentBlock.ID}`) : '选择剧本块后，下面的情节说明和表达条目会有明确文本来源。'}
        empty={!momentBlock}
        actions={(
          <>
            {momentBlock && selectedMoment && (
              <ProductionScriptBindingIconAction
                size="sm"
                variant="ghost"
                disabled={isSaving}
                onClick={() => onBindMomentScriptBlock(selectedMoment.ID, null)}
              >
                取消绑定
              </ProductionScriptBindingIconAction>
            )}
            <ProductionScriptBindingIconAction
              size="sm"
              variant="outline"
              disabled={!selectedMoment || isSaving}
              onClick={() => setOpen(true)}
            >
              <ScrollText size={12} />
              选择剧本块
            </ProductionScriptBindingIconAction>
          </>
        )}
      />
      <ScriptBlockPickerDialog
        open={open}
        onOpenChange={setOpen}
        selectedMoment={selectedMoment}
        selectedBlock={momentBlock}
        scriptBlocks={scriptBlocks}
        scriptSourceText={scriptSourceText}
        isSaving={isSaving}
        allowCreateFromScriptRange={allowCreateFromScriptRange}
        onBindMomentScriptBlock={onBindMomentScriptBlock}
        onCreateAndBindMomentScriptBlock={onCreateAndBindMomentScriptBlock}
      />
    </ProductionScriptBindingPanel>
  )
}

function ScriptBlockPickerDialog({
  open,
  onOpenChange,
  selectedMoment,
  selectedBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  allowCreateFromScriptRange,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedMoment: SceneMomentScriptBindingRecord | null
  selectedBlock: ProductionScriptBlockRecord | null
  scriptBlocks: ProductionScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  allowCreateFromScriptRange: boolean
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const initialIndex = Math.max(0, scriptBlocks.findIndex((block) => block.ID === selectedBlock?.ID))
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [rangeStart, setRangeStart] = useState(initialIndex)
  const [rangeEnd, setRangeEnd] = useState(initialIndex)
  const scriptLines = useMemo(() => scriptLineEntries(scriptSourceText), [scriptSourceText])
  const [createStartLine, setCreateStartLine] = useState<number | null>(null)
  const [createEndLine, setCreateEndLine] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const nextIndex = Math.max(0, scriptBlocks.findIndex((block) => block.ID === selectedBlock?.ID))
    setActiveIndex(nextIndex)
    setRangeStart(nextIndex)
    setRangeEnd(nextIndex)
    setCreateStartLine(null)
    setCreateEndLine(null)
  }, [open, scriptBlocks, selectedBlock?.ID])

  const activeBlock = scriptBlocks[activeIndex] ?? null
  const previewBlocks = scriptBlocks.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1)
  const createRangeStart = Math.min(createStartLine ?? 0, createEndLine ?? createStartLine ?? 0)
  const createRangeEnd = Math.max(createStartLine ?? 0, createEndLine ?? createStartLine ?? 0)
  const selectedCreateLines = createStartLine ? scriptLines.filter((line) => line.number >= createRangeStart && line.number <= createRangeEnd) : []
  const selectedCreateText = selectedCreateLines.map((line) => line.content).join('\n')

  function chooseBlock(index: number) {
    setActiveIndex(index)
    setRangeStart(index)
    setRangeEnd(index)
  }

  function confirmSelection() {
    if (!selectedMoment || !activeBlock) return
    onBindMomentScriptBlock(selectedMoment.ID, activeBlock.ID)
    onOpenChange(false)
  }

  function chooseScriptLine(lineNumber: number) {
    if (!createStartLine || (createStartLine && createEndLine)) {
      setCreateStartLine(lineNumber)
      setCreateEndLine(null)
      return
    }
    setCreateEndLine(lineNumber)
  }

  function confirmCreateSelection() {
    if (!selectedMoment || !createStartLine) return
    onCreateAndBindMomentScriptBlock(selectedMoment.ID, createRangeStart, createRangeEnd)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <ProductionScriptPickerContent
        title="选择剧本块"
        description="选择一个主剧本块绑定到当前情节；扩选只用于查看连续上下文，不会改变主绑定。"
        footer={(
          <>
            <ProductionScriptBindingAction size="sm" variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
              取消
            </ProductionScriptBindingAction>
            <ProductionScriptBindingAction size="sm" disabled={!selectedMoment || !activeBlock || isSaving} onClick={confirmSelection}>
              {isSaving ? <ProductionScriptBindingSpinner icon={Loader2} /> : <Check size={12} />}
              绑定主剧本块
            </ProductionScriptBindingAction>
          </>
        )}
      >
        <ProductionScriptPickerLayout
          sidebar={(
            <ProductionScriptBlockList>
              {scriptBlocks.length === 0 ? (
                <WorkbenchEmptyState compact title={allowCreateFromScriptRange ? '当前还没有已创建的剧本块，可以在右侧从剧本正文直接创建。' : '当前还没有已创建的剧本块。只读状态下不会创建正式剧本块。'} />
              ) : scriptBlocks.map((block, index) => {
                const active = index === activeIndex
                return (
                  <ProductionScriptBlockListItem
                    key={block.ID}
                    active={active}
                    title={scriptBlockLineLabel(block)}
                    badge={selectedBlock?.ID === block.ID ? <ProductionScriptBlockBoundBadge /> : null}
                    description={firstScriptText(block.content, block.summary, block.title, `剧本块 #${block.ID}`)}
                    onClick={() => chooseBlock(index)}
                  />
                )
              })}
            </ProductionScriptBlockList>
          )}
        >
            {allowCreateFromScriptRange ? (
              <ProductionScriptCreatePanel
                icon={Plus}
                title="从剧本创建"
                description="点击剧本行选择起点，再点击另一行扩成范围；创建后会立即绑定到当前情节。"
                action={(
                  <ProductionScriptBindingAction
                    size="sm"
                    disabled={!selectedMoment || !createStartLine || !selectedCreateText.trim() || isSaving}
                    onClick={confirmCreateSelection}
                  >
                    {isSaving ? <ProductionScriptBindingSpinner icon={Loader2} /> : <Check size={12} />}
                    创建并绑定
                  </ProductionScriptBindingAction>
                )}
              >
              {scriptLines.length === 0 ? (
                <ProductionScriptCreateEmptyState title="当前制作剧本没有正文，暂时无法创建剧本块。" />
              ) : (
                <>
                  <ProductionScriptLineList>
                    {scriptLines.map((line) => {
                      const selected = createStartLine ? line.number >= createRangeStart && line.number <= createRangeEnd : false
                      const anchor = line.number === createStartLine || line.number === createEndLine
                      return (
                        <ProductionScriptLineItem
                          key={`script-create-line-${line.number}`}
                          active={selected}
                          anchor={anchor}
                          lineNumber={line.number}
                          onClick={() => chooseScriptLine(line.number)}
                        >
                          {line.content || ' '}
                        </ProductionScriptLineItem>
                      )
                    })}
                  </ProductionScriptLineList>
                  <ProductionScriptSelectionSummary label={createStartLine ? `待创建：行 ${createRangeStart}-${createRangeEnd}` : '尚未选择剧本行'}>
                    {selectedCreateText.trim() && (
                      selectedCreateText
                    )}
                  </ProductionScriptSelectionSummary>
                </>
              )}
              </ProductionScriptCreatePanel>
            ) : null}
            <ProductionScriptPickerPreviewHeader
              title={activeBlock ? scriptBlockSelectLabel(activeBlock) : '未选择剧本块'}
              description={`当前主绑定：${activeBlock ? scriptBlockLineLabel(activeBlock) : '无'}`}
              actions={(
                <>
                <ProductionScriptBindingAction
                  size="sm"
                  variant="outline"
                  disabled={rangeStart <= 0}
                  onClick={() => setRangeStart((value) => Math.max(0, value - 1))}
                >
                  扩选上文
                </ProductionScriptBindingAction>
                <ProductionScriptBindingAction
                  size="sm"
                  variant="outline"
                  disabled={rangeEnd >= scriptBlocks.length - 1}
                  onClick={() => setRangeEnd((value) => Math.min(scriptBlocks.length - 1, value + 1))}
                >
                  扩选下文
                </ProductionScriptBindingAction>
                <ProductionScriptBindingAction
                  size="sm"
                  variant="ghost"
                  disabled={!activeBlock}
                  onClick={() => {
                    setRangeStart(activeIndex)
                    setRangeEnd(activeIndex)
                  }}
                >
                  收起范围
                </ProductionScriptBindingAction>
                </>
              )}
            />
            <ProductionScriptPreviewStack>
              {scriptBlocks.length === 0 ? (
                <WorkbenchEmptyState title={allowCreateFromScriptRange ? '当前还没有可绑定的剧本块。可以先在上方从剧本正文选择行，创建后会自动绑定到当前情节。' : '当前还没有可绑定的剧本块。只读状态下只能绑定已有剧本块。'} />
              ) : previewBlocks.map((block) => {
                const speaker = firstScriptText(block.speaker)
                return (
                  <ProductionScriptPreviewCard
                    key={`script-preview-${block.ID}`}
                    active={block.ID === activeBlock?.ID}
                    meta={(
                      <>
                        <ProductionScriptPreviewRoleBadge active={block.ID === activeBlock?.ID}>
                          {block.ID === activeBlock?.ID ? '主剧本块' : '扩选上下文'}
                        </ProductionScriptPreviewRoleBadge>
                        <ProductionScriptPreviewMetaText data-emphasis="medium">{scriptBlockLineLabel(block)}</ProductionScriptPreviewMetaText>
                        {speaker ? <ProductionScriptPreviewMetaText>{speaker}</ProductionScriptPreviewMetaText> : null}
                      </>
                    )}
                  >
                    {firstScriptText(block.content, block.summary, block.title, `剧本块 #${block.ID}`)}
                  </ProductionScriptPreviewCard>
                )
              })}
            </ProductionScriptPreviewStack>
        </ProductionScriptPickerLayout>
      </ProductionScriptPickerContent>
    </Dialog>
  )
}
