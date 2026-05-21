import { useEffect, useState } from 'react'
import { Check, ChevronDown, Loader2, Plus, ScrollText, Users } from 'lucide-react'

import type { SemanticEntityPayload } from '@/api/semanticEntities'
import { SceneMomentScriptBlockBinder } from '@/components/workbench/ProductionScriptBinding'
import {
  buildSpeakerOptions,
  creativeReferenceKindLabel,
  firstText,
  isPersonReference,
  isPlaceReference,
  isVisibleOrchestrationRecord,
  normalizeWritingExpressionDraft,
  referencesForOwner,
  speakerLabelForWritingType,
  speakerOptionValue,
  speakerOptionValueForDraft,
  speakerPlaceholderForWritingType,
  textPlaceholderForWritingType,
  type ProductionAssetSlotRecord,
  type ProductionCreativeReferenceRecord,
  type ProductionSceneMomentRecord,
  type ProductionScriptBlockRecord,
  type ProductionSpeakerOption,
  type ProductionWritingExpressionEditTarget,
  type ProductionWritingExpressionLine,
  type ProductionWritingExpressionSavePayload,
  type ProductionWritingExpressionType,
  type ProductionWritingLookup,
  writingExpressionDraftEquals,
  writingExpressionLineDraft,
  writingExpressionTypeOptions,
  writingTypeLabel,
} from '@/lib/productionWritingExpressions'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movscript/ui'

const sceneMomentReferenceRoleOptions = [
  { value: 'protagonist', label: '主要人物' },
  { value: 'supporting', label: '辅助人物' },
  { value: 'location', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'style', label: '风格' },
  { value: 'brand', label: '品牌/产品' },
  { value: 'rule', label: '规则限制' },
]

export function SceneMomentSettingsEditor({
  moment,
  creativeReferences,
  assetSlots,
  lookup,
  isSaving,
  onLinkReference,
}: {
  moment: ProductionSceneMomentRecord | null
  creativeReferences: ProductionCreativeReferenceRecord[]
  assetSlots: ProductionAssetSlotRecord[]
  lookup: ProductionWritingLookup
  isSaving: boolean
  onLinkReference: (momentId: number, referenceId: number, role: string) => void
}) {
  const [referenceValue, setReferenceValue] = useState('')
  const [roleValue, setRoleValue] = useState('supporting')
  useEffect(() => {
    setReferenceValue('')
    setRoleValue('supporting')
  }, [moment?.ID])

  if (!moment) return null

  const linkedReferences = referencesForOwner('scene_moment', moment.ID, lookup)
  const linkedIds = new Set(linkedReferences.map((reference) => reference.ID))
  const visibleReferences = creativeReferences.filter(isVisibleOrchestrationRecord)
  const shownReferences = linkedReferences.length > 0 ? linkedReferences : visibleReferences
  const availableReferences = visibleReferences.filter((reference) => !linkedIds.has(reference.ID))
  const selectedReference = referenceValue ? visibleReferences.find((reference) => String(reference.ID) === referenceValue) : null
  const relatedAssetSlots = assetSlots.filter((slot) => (
    isVisibleOrchestrationRecord(slot) &&
    slot.owner_type !== 'asset_slot' &&
    (
      (slot.owner_type === 'scene_moment' && Number(slot.owner_id) === moment.ID) ||
      (slot.creative_reference_id && shownReferences.some((reference) => reference.ID === Number(slot.creative_reference_id))) ||
      (slot.owner_type === 'creative_reference' && slot.owner_id && shownReferences.some((reference) => reference.ID === Number(slot.owner_id)))
    )
  ))
  const groups = [
    { key: 'person', title: '人物', items: shownReferences.filter(isPersonReference) },
    { key: 'place', title: '场景', items: shownReferences.filter(isPlaceReference) },
    { key: 'prop', title: '道具 / 产品', items: shownReferences.filter((reference) => ['prop', 'product', 'brand'].includes(String(reference.kind ?? '').toLowerCase())) },
    { key: 'style', title: '风格 / 规则', items: shownReferences.filter((reference) => ['style', 'world_rule', 'time_period', 'restriction'].includes(String(reference.kind ?? '').toLowerCase())) },
  ]

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/10 p-3" data-testid="production-orchestration-scene-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <Users size={12} />
            情节设定
          </div>
          <h3 className="mt-1 type-body font-semibold text-foreground">人物、场景、道具和风格</h3>
          <p className="mt-1 hidden type-label leading-5 text-muted-foreground sm:block">
            {linkedReferences.length > 0
              ? '这些设定会跟随当前情节进入后续内容编排和生成上下文。'
              : '当前情节还没有显式绑定设定；可从前期准备里的设定资料中选择并挂到这个情节。'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={linkedReferences.length > 0 ? 'success' : visibleReferences.length > 0 ? 'secondary' : 'warning'} className="h-6 rounded-full px-2 type-tiny">
            {shownReferences.length} 设定
          </Badge>
          <Badge variant={relatedAssetSlots.length > 0 ? 'secondary' : 'outline'} className="h-6 rounded-full px-2 type-tiny">
            {relatedAssetSlots.length} 素材
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <div key={group.key} className="min-w-0 rounded-md border border-border bg-background px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate type-label font-medium text-muted-foreground">{group.title}</p>
              <Badge variant="outline" className="h-5 px-1.5 type-tiny">{group.items.length}</Badge>
            </div>
            <div className="mt-1.5 space-y-1">
              {group.items.slice(0, 3).map((reference) => (
                <div key={reference.ID} className="rounded bg-muted/50 px-1.5 py-1">
                  <p className="truncate type-label font-medium text-foreground">{titleOfRecord(reference)}</p>
                  <p className="truncate type-tiny text-muted-foreground">{creativeReferenceKindLabel(reference.kind)}</p>
                </div>
              ))}
              {group.items.length === 0 ? <p className="type-caption text-muted-foreground">待绑定</p> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
        <Select value={referenceValue} onValueChange={setReferenceValue}>
          <SelectTrigger className="h-8 bg-background type-label">
            <SelectValue placeholder={availableReferences.length > 0 ? '从前期准备选择设定' : '没有可绑定的新设定'} />
          </SelectTrigger>
          <SelectContent>
            {availableReferences.map((reference) => (
              <SelectItem key={reference.ID} value={String(reference.ID)}>
                {titleOfRecord(reference)} · {creativeReferenceKindLabel(reference.kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleValue} onValueChange={setRoleValue}>
          <SelectTrigger className="h-8 bg-background type-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sceneMomentReferenceRoleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!selectedReference || isSaving}
          loading={isSaving}
          onClick={() => selectedReference && onLinkReference(moment.ID, selectedReference.ID, roleValue)}
        >
          <Plus size={12} />
          绑定
        </Button>
      </div>
    </div>
  )
}

export function InlineSceneMomentEditor({
  moment,
  momentBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  isBindingScriptBlock,
  onSave,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  moment: ProductionSceneMomentRecord | null
  momentBlock: ProductionScriptBlockRecord | null
  scriptBlocks: ProductionScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  isBindingScriptBlock: boolean
  onSave: (momentId: number, payload: SemanticEntityPayload) => void
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    mood: '',
    time_text: '',
  })
  useEffect(() => {
    setDraft({
      title: firstText(moment?.title),
      description: firstText(moment?.description),
      mood: firstText(moment?.mood),
      time_text: firstText(moment?.time_text),
    })
  }, [moment?.ID, moment?.description, moment?.mood, moment?.time_text, moment?.title])

  if (!moment) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 type-label leading-5 text-muted-foreground">
        先从左侧选择一个情节，再编辑具体发生的事。
      </div>
    )
  }

  const original = {
    title: firstText(moment.title),
    description: firstText(moment.description),
    mood: firstText(moment.mood),
    time_text: firstText(moment.time_text),
  }
  const changed = Object.keys(draft).some((key) => draft[key as keyof typeof draft].trim() !== original[key as keyof typeof original].trim())

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/10 p-3">
      <SceneMomentScriptBlockBinder
        selectedMoment={moment}
        momentBlock={momentBlock}
        scriptBlocks={scriptBlocks}
        scriptSourceText={scriptSourceText}
        isSaving={isBindingScriptBlock}
        onBindMomentScriptBlock={onBindMomentScriptBlock}
        onCreateAndBindMomentScriptBlock={onCreateAndBindMomentScriptBlock}
      />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block type-label text-muted-foreground">
          标题（可选）
          <Textarea
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            className="mt-1 min-h-10 resize-none bg-background type-body"
            placeholder="这场戏发生了什么"
          />
        </label>
        <label className="block type-label text-muted-foreground">
          时间（可选）
          <Textarea
            value={draft.time_text}
            onChange={(event) => setDraft((prev) => ({ ...prev, time_text: event.target.value }))}
            className="mt-1 min-h-10 resize-none bg-background type-body"
            placeholder="清晨、夜里、发布会前..."
          />
        </label>
      </div>
      <label className="mt-2 block type-label text-muted-foreground">
        情节说明
        <Textarea
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          className="mt-1 min-h-16 resize-y bg-background type-body leading-6"
          placeholder="这段情节承担的推进作用"
        />
      </label>
      <label className="mt-2 block type-label text-muted-foreground">
        导演备注 / 节奏目标（可选）
        <Textarea
          value={draft.mood}
          onChange={(event) => setDraft((prev) => ({ ...prev, mood: event.target.value }))}
          className="mt-1 min-h-12 resize-y bg-background type-body leading-6"
          placeholder="情绪目标、节奏停顿或表演提醒；具体动作请写到表达条目"
        />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        {changed && (
          <Button size="sm" variant="ghost" className="px-2 type-label" disabled={isSaving} onClick={() => setDraft(original)}>
            取消
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1.5 px-2 type-label"
          disabled={!changed || isSaving}
          onClick={() => onSave(moment.ID, {
            title: draft.title.trim(),
            description: draft.description.trim(),
            mood: draft.mood.trim(),
            time_text: draft.time_text.trim(),
          })}
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          保存情节
        </Button>
      </div>
    </div>
  )
}

export function ProductionWritingExpressionsPanel({
  selectedMoment,
  selectedMomentScriptBlock,
  expressionLines,
  creativeReferences,
  lookup,
  isSavingExpressionLine,
  onAddExpressionLine,
  onSaveExpressionLine,
}: {
  selectedMoment: ProductionSceneMomentRecord | null
  selectedMomentScriptBlock: ProductionScriptBlockRecord | null
  expressionLines: ProductionWritingExpressionLine[]
  creativeReferences: ProductionCreativeReferenceRecord[]
  lookup: ProductionWritingLookup
  isSavingExpressionLine: boolean
  onAddExpressionLine: (momentId: number, order: number, scriptBlockId?: number | null) => void
  onSaveExpressionLine: (target: ProductionWritingExpressionEditTarget, payload: ProductionWritingExpressionSavePayload) => void
}) {
  const speakerOptions = buildSpeakerOptions(selectedMoment, creativeReferences, lookup)
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 type-caption font-medium text-muted-foreground">
            <ScrollText size={12} />
            表达条目
          </div>
          <h2 className="mt-1 type-body font-semibold text-foreground">对白、动作、旁白、屏幕文字和镜头描述</h2>
          <p className="mt-1 type-label leading-5 text-muted-foreground">没有对白的片段也不空白，它可以用动作、旁白、屏幕文字、镜头描述或动作里的停顿完成表达。</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 type-label"
          onClick={() => selectedMoment && onAddExpressionLine(selectedMoment.ID, expressionLines.length + 1, selectedMomentScriptBlock?.ID ?? null)}
          disabled={!selectedMoment || isSavingExpressionLine}
        >
          <Plus size={12} />
          新增表达
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {expressionLines.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 type-label leading-5 text-muted-foreground">
            当前情节还没有表达条目。可以先写动作、对白、旁白、屏幕文字或镜头描述。
          </div>
        ) : expressionLines.map((line, index) => (
          <EditableWritingExpressionLine
            key={`${line.editTarget.kind}-${line.editTarget.id}`}
            index={index}
            line={line}
            speakerOptions={speakerOptions}
            isSaving={isSavingExpressionLine}
            onSave={onSaveExpressionLine}
          />
        ))}
      </div>
    </section>
  )
}

function EditableWritingExpressionLine({
  index,
  line,
  speakerOptions,
  isSaving,
  onSave,
}: {
  index: number
  line: ProductionWritingExpressionLine
  speakerOptions: ProductionSpeakerOption[]
  isSaving: boolean
  onSave: (target: ProductionWritingExpressionEditTarget, payload: ProductionWritingExpressionSavePayload) => void
}) {
  const [draft, setDraft] = useState<ProductionWritingExpressionSavePayload>(() => writingExpressionLineDraft(line))
  useEffect(() => {
    setDraft(writingExpressionLineDraft(line))
  }, [line.intent, line.note, line.speaker, line.text, line.type])
  const original = writingExpressionLineDraft(line)
  const changed = !writingExpressionDraftEquals(draft, original)
  const typeLabel = writingTypeLabel(draft.kind)
  const selectedSpeakerValue = speakerOptionValueForDraft(draft.speaker, speakerOptions)
  return (
    <details className="group overflow-hidden rounded-md border border-border bg-card" open={index === 0}>
      <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-2.5 marker:hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted type-caption font-semibold text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 rounded-full px-1.5 type-tiny">{typeLabel}</Badge>
            <Badge variant={line.persisted ? 'outline' : 'secondary'} className="h-5 rounded-full px-1.5 type-tiny">
              {line.persisted ? '已保存' : '参考转写'}
            </Badge>
            {draft.speaker.trim() && <span className="type-caption text-muted-foreground">{draft.speaker.trim()}</span>}
          </div>
          <p className="mt-1 line-clamp-2 type-body leading-5 text-foreground">{draft.text || textPlaceholderForWritingType(draft.kind)}</p>
          {(draft.intent || draft.note) && (
            <p className="mt-1 line-clamp-1 type-caption text-muted-foreground">{[draft.intent, draft.note].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <ChevronDown size={14} className="mt-2 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border bg-background/70 p-3">
        <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)_96px]">
          <div className="min-w-0 space-y-2">
            <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as ProductionWritingExpressionType }))}>
              <SelectTrigger className="h-8 w-full type-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {writingExpressionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="block type-caption text-muted-foreground">
              {speakerLabelForWritingType(draft.kind)}
              <Select
                value={selectedSpeakerValue}
                onValueChange={(value) => {
                  if (value === '__custom__') {
                    setDraft((prev) => ({ ...prev, speaker: speakerOptions.some((option) => option.name === prev.speaker.trim()) ? '' : prev.speaker }))
                    return
                  }
                  const option = speakerOptions.find((item) => speakerOptionValue(item) === value)
                  if (option) setDraft((prev) => ({ ...prev, speaker: option.name }))
                }}
              >
                <SelectTrigger className="mt-1 h-8 w-full bg-background type-label">
                  <SelectValue placeholder="从设定选择" />
                </SelectTrigger>
                <SelectContent>
                  {speakerOptions.map((option) => (
                    <SelectItem key={speakerOptionValue(option)} value={speakerOptionValue(option)}>
                      {option.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">自定义人物 / 群众演员</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                value={draft.speaker}
                onChange={(event) => setDraft((prev) => ({ ...prev, speaker: event.target.value }))}
                className="mt-1 min-h-10 resize-none bg-background type-label"
                placeholder={speakerPlaceholderForWritingType(draft.kind)}
              />
            </label>
          </div>
          <div className="min-w-0 space-y-2">
            <Textarea
              value={draft.text}
              onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
              className="min-h-20 resize-y type-body leading-6"
              placeholder={textPlaceholderForWritingType(draft.kind)}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Textarea
                value={draft.intent}
                onChange={(event) => setDraft((prev) => ({ ...prev, intent: event.target.value }))}
                className="min-h-12 resize-y bg-background type-label leading-5"
                placeholder={`${typeLabel}的目的`}
              />
              <Textarea
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
                className="min-h-12 resize-y bg-background type-label leading-5"
                placeholder="潜台词 / 表演说明"
              />
            </div>
          </div>
          <div className="flex items-start justify-end gap-1.5">
            {changed && (
              <Button
                size="sm"
                variant="ghost"
                className="px-2 type-label"
                disabled={isSaving}
                onClick={() => setDraft(original)}
              >
                取消
              </Button>
            )}
            <Button
              size="sm"
              className="px-2 type-label"
              disabled={!changed || !draft.text.trim() || isSaving}
              onClick={() => onSave(line.editTarget, normalizeWritingExpressionDraft(draft))}
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {line.persisted ? '保存' : '转为条目'}
            </Button>
          </div>
        </div>
      </div>
    </details>
  )
}

function titleOfRecord(record: { ID?: number; title?: string; name?: string; label?: string } | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}
