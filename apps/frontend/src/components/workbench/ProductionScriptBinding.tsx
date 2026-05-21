import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, Plus, ScrollText } from 'lucide-react'

import type { ScriptVersion } from '@/api/scriptVersions'
import {
  firstScriptText,
  formatVersionUpdatedAt,
  scriptBlockLineLabel,
  scriptBlockSelectLabel,
  scriptLineEntries,
  scriptVersionOptionLabel,
  type ProductionScriptBlockRecord,
} from '@/lib/productionScriptBlocks'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/projectRoutes'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'

type SceneMomentScriptBindingRecord = {
  ID: number
}

export function ScriptVersionBindingBar({
  scriptVersions,
  selectedScriptVersion,
  isFetching,
  isSaving,
  disabled,
  onChange,
}: {
  scriptVersions: ScriptVersion[]
  selectedScriptVersion: ScriptVersion | null
  isFetching: boolean
  isSaving: boolean
  disabled: boolean
  onChange: (scriptVersionId: number | null) => void
}) {
  const selectedValue = selectedScriptVersion ? String(selectedScriptVersion.ID) : '__none__'
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
          <ScrollText size={12} />
          制作剧本
        </div>
        <p className="mt-1 type-label leading-5 text-muted-foreground">
          制作只选择一份剧本；编排段和情节再分别引用具体剧本块。
        </p>
      </div>
      <div className="flex min-w-[260px] flex-wrap items-center justify-end gap-2">
        <Select
          value={selectedValue}
          onValueChange={(value) => onChange(value === '__none__' ? null : Number(value))}
          disabled={disabled || isFetching || isSaving || scriptVersions.length === 0}
        >
          <SelectTrigger className="h-8 w-[260px] type-label">
            <SelectValue placeholder={isFetching ? '读取剧本...' : '选择剧本'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">不绑定剧本</SelectItem>
            {scriptVersions.map((version) => (
              <SelectItem key={version.ID} value={String(version.ID)}>
                {scriptVersionOptionLabel(version)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSaving ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : null}
        {scriptVersions.length === 0 ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5 type-label">
            <Link to={ROUTES.project.scripts}>
              <Plus size={12} />
              去创建剧本
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ProductionScriptSourceSummary({ scriptVersion, scriptText }: { scriptVersion: ScriptVersion | null; scriptText: string }) {
  if (!scriptVersion) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border bg-muted/10 px-3 py-3">
        <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
          <ScrollText size={12} />
          未选择制作剧本
        </div>
        <p className="mt-1 type-label leading-5 text-muted-foreground">选择后，编排段和情节可以继续绑定到这份剧本下的具体剧本块。</p>
      </div>
    )
  }
  const scriptLength = scriptText.length
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/10 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <ScrollText size={12} />
            制作绑定剧本
          </div>
          <p className="mt-1 truncate type-label font-medium text-foreground">{scriptVersionOptionLabel(scriptVersion)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 type-tiny text-muted-foreground">
          {formatVersionUpdatedAt(scriptVersion.UpdatedAt)}
        </span>
      </div>
      <p className="mt-2 type-label leading-5 text-muted-foreground">
        {scriptLength > 0 ? `这份剧本已作为制作级来源，约 ${scriptLength} 字。中部情节编辑区会从这里选择剧本块。` : '当前剧本没有正文内容，请回到剧本页补充正文。'}
      </p>
    </div>
  )
}

export function SceneMomentScriptBlockBinder({
  selectedMoment,
  momentBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  selectedMoment: SceneMomentScriptBindingRecord | null
  momentBlock: ProductionScriptBlockRecord | null
  scriptBlocks: ProductionScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <ScrollText size={12} />
            绑定剧本块
          </div>
          <p className="mt-1 type-label leading-5 text-muted-foreground">先选当前情节对应的主剧本块；弹窗里可以查看上下文并扩选范围。</p>
        </div>
        {isSaving ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="mt-3 rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-label font-semibold text-foreground">{momentBlock ? scriptBlockSelectLabel(momentBlock) : '未绑定剧本块'}</p>
            <p className={cn('mt-1 type-label leading-5', momentBlock ? 'line-clamp-3 text-foreground' : 'text-muted-foreground')}>
              {momentBlock ? firstScriptText(momentBlock.content, momentBlock.summary, momentBlock.title, `剧本块 #${momentBlock.ID}`) : '选择剧本块后，下面的情节说明和表达条目会有明确文本来源。'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {momentBlock && selectedMoment && (
              <Button
                size="sm"
                variant="ghost"
                className="px-2 type-label"
                disabled={isSaving}
                onClick={() => onBindMomentScriptBlock(selectedMoment.ID, null)}
              >
                取消绑定
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 px-2 type-label"
              disabled={!selectedMoment || isSaving}
              onClick={() => setOpen(true)}
            >
              <ScrollText size={12} />
              选择剧本块
            </Button>
          </div>
        </div>
      </div>
      <ScriptBlockPickerDialog
        open={open}
        onOpenChange={setOpen}
        selectedMoment={selectedMoment}
        selectedBlock={momentBlock}
        scriptBlocks={scriptBlocks}
        scriptSourceText={scriptSourceText}
        isSaving={isSaving}
        onBindMomentScriptBlock={onBindMomentScriptBlock}
        onCreateAndBindMomentScriptBlock={onCreateAndBindMomentScriptBlock}
      />
    </div>
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
      <DialogContent className="flex max-h-[88vh] w-[min(960px,calc(100vw-32px))] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>选择剧本块</DialogTitle>
          <DialogDescription>
            选择一个主剧本块绑定到当前情节；扩选只用于查看连续上下文，不会改变主绑定。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {scriptBlocks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 type-label text-muted-foreground">
                  当前还没有已创建的剧本块，可以在右侧从剧本正文直接创建。
                </div>
              ) : scriptBlocks.map((block, index) => {
                const active = index === activeIndex
                return (
                  <button
                    key={block.ID}
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5',
                    )}
                    onClick={() => chooseBlock(index)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate type-label font-semibold text-foreground">{scriptBlockLineLabel(block)}</span>
                      {selectedBlock?.ID === block.ID && <Badge variant="secondary" className="h-5 rounded-full px-1.5 type-tiny">已绑定</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">
                      {firstScriptText(block.content, block.summary, block.title, `剧本块 #${block.ID}`)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="min-h-0 overflow-auto p-4">
            <div className="mb-4 rounded-md border border-border bg-muted/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
                    <Plus size={12} />
                    从剧本创建
                  </div>
                  <p className="mt-1 type-label leading-5 text-muted-foreground">点击剧本行选择起点，再点击另一行扩成范围；创建后会立即绑定到当前情节。</p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 type-label"
                  disabled={!selectedMoment || !createStartLine || !selectedCreateText.trim() || isSaving}
                  onClick={confirmCreateSelection}
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  创建并绑定
                </Button>
              </div>
              {scriptLines.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-4 type-label leading-5 text-muted-foreground">
                  当前制作剧本没有正文，暂时无法创建剧本块。
                </div>
              ) : (
                <>
                  <div className="mt-3 max-h-48 space-y-1 overflow-auto rounded-md border border-border bg-background p-2">
                    {scriptLines.map((line) => {
                      const selected = createStartLine ? line.number >= createRangeStart && line.number <= createRangeEnd : false
                      const anchor = line.number === createStartLine || line.number === createEndLine
                      return (
                        <button
                          key={`script-create-line-${line.number}`}
                          type="button"
                          className={cn(
                            'grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2 rounded px-2 py-1.5 text-left type-label transition-colors',
                            selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                            anchor ? 'ring-1 ring-primary/40' : '',
                          )}
                          onClick={() => chooseScriptLine(line.number)}
                        >
                          <span className="type-caption tabular-nums text-muted-foreground">{line.number}</span>
                          <span className={cn('whitespace-pre-wrap leading-5', !line.content.trim() && 'text-muted-foreground/60')}>{line.content || ' '}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
                    <p className="type-caption font-medium text-muted-foreground">
                      {createStartLine ? `待创建：行 ${createRangeStart}-${createRangeEnd}` : '尚未选择剧本行'}
                    </p>
                    {selectedCreateText.trim() && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap type-label leading-5 text-foreground">{selectedCreateText}</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="type-label font-semibold text-foreground">{activeBlock ? scriptBlockSelectLabel(activeBlock) : '未选择剧本块'}</p>
                <p className="mt-1 type-caption text-muted-foreground">当前主绑定：{activeBlock ? scriptBlockLineLabel(activeBlock) : '无'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="type-label"
                  disabled={rangeStart <= 0}
                  onClick={() => setRangeStart((value) => Math.max(0, value - 1))}
                >
                  扩选上文
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="type-label"
                  disabled={rangeEnd >= scriptBlocks.length - 1}
                  onClick={() => setRangeEnd((value) => Math.min(scriptBlocks.length - 1, value + 1))}
                >
                  扩选下文
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="type-label"
                  disabled={!activeBlock}
                  onClick={() => {
                    setRangeStart(activeIndex)
                    setRangeEnd(activeIndex)
                  }}
                >
                  收起范围
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {scriptBlocks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 type-body leading-6 text-muted-foreground">
                  当前还没有可绑定的剧本块。可以先在上方从剧本正文选择行，创建后会自动绑定到当前情节。
                </div>
              ) : previewBlocks.map((block) => {
                const speaker = firstScriptText(block.speaker)
                return (
                  <article
                    key={`script-preview-${block.ID}`}
                    className={cn('rounded-md border p-3', block.ID === activeBlock?.ID ? 'border-primary bg-primary/5' : 'border-border bg-background')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={block.ID === activeBlock?.ID ? 'secondary' : 'outline'} className="h-5 rounded-full px-1.5 type-tiny">
                        {block.ID === activeBlock?.ID ? '主剧本块' : '扩选上下文'}
                      </Badge>
                      <span className="type-caption font-medium text-muted-foreground">{scriptBlockLineLabel(block)}</span>
                      {speaker ? <span className="type-caption text-muted-foreground">{speaker}</span> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap type-body leading-6 text-foreground">
                      {firstScriptText(block.content, block.summary, block.title, `剧本块 #${block.ID}`)}
                    </p>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" className="type-label" disabled={isSaving} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" className="gap-1.5 type-label" disabled={!selectedMoment || !activeBlock || isSaving} onClick={confirmSelection}>
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            绑定主剧本块
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
