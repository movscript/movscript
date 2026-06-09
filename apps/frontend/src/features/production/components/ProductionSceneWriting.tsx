import { useEffect, useState } from 'react'
import { Check, Edit3, Loader2, Plus, ScrollText, Trash2, Users, X } from 'lucide-react'

import type { SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import { SceneMomentScriptBlockBinder } from '@/features/production/components/ProductionScriptBinding'
import {
  buildSpeakerOptions,
  settingKindLabel,
  firstText,
  isPersonReference,
  isPlaceReference,
  isVisibleOrchestrationRecord,
  normalizeExpressionUnitWorkspace,
  referencesForOwner,
  speakerLabelForExpressionUnitType,
  speakerOptionValue,
  speakerOptionValueForWorkspace,
  speakerPlaceholderForExpressionUnitType,
  textPlaceholderForExpressionUnitType,
  type ProductionAssetSlotRecord,
  type ProductionSettingRecord,
  type ProductionSceneMomentRecord,
  type ProductionScriptBlockRecord,
  type ProductionSpeakerOption,
  type ProductionExpressionUnitEditTarget,
  type ProductionExpressionUnitLine,
  type ProductionExpressionUnitSavePayload,
  type ProductionExpressionUnitType,
  type ProductionExpressionUnitLookup,
  expressionUnitWorkspaceEquals,
  expressionUnitLineWorkspace,
  expressionUnitTypeOptions,
  expressionUnitTypeLabel,
} from '@/features/production/domain/productionExpressionUnits'
import { productionReferencePresenceRecipe } from '@/features/production/presentation/productionSemanticUi'
import {
  ProductionExpressionAuxFieldGrid,
  ProductionExpressionBadge,
  ProductionExpressionDeleteButton,
  ProductionExpressionEditorActions,
  ProductionExpressionEditorColumn,
  ProductionExpressionEmptyState,
  ProductionExpressionEditorGrid,
  ProductionExpressionField,
  ProductionExpressionLineShell,
  ProductionExpressionLineStack,
  ProductionSceneMomentSummaryCard,
  ProductionSceneMomentEmptyState,
  ProductionSceneReferenceBindingRow,
  ProductionSceneReferenceEmptyState,
  ProductionSceneReferenceGroup,
  ProductionSceneReferenceGroupGrid,
  ProductionSceneReferenceItem,
  ProductionSceneReferenceRemoveButton,
  ProductionSceneWritingActionButton,
  ProductionSceneWritingActionRow,
  ProductionSceneWritingBadge,
  ProductionSceneWritingBadgeStack,
  ProductionSceneWritingDialogBody,
  ProductionSceneWritingDialogContent,
  ProductionSceneWritingField,
  ProductionSceneWritingFieldGrid,
  ProductionSceneWritingHeader,
  ProductionSceneWritingResponsiveDescription,
  ProductionSceneWritingSection,
  ProductionSceneWritingSelectTrigger,
  ProductionSceneWritingSpinner,
  ProductionSceneWritingStatusBadge,
  ProductionSceneWritingTextarea,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  Dialog,
  DialogDescription,
  DialogTitle,
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
  settings,
  assetSlots,
  lookup,
  isSaving,
  onLinkReference,
  onUnlinkReference,
}: {
  moment: ProductionSceneMomentRecord | null
  settings: ProductionSettingRecord[]
  assetSlots: ProductionAssetSlotRecord[]
  lookup: ProductionExpressionUnitLookup
  isSaving: boolean
  onLinkReference: (momentId: number, referenceId: number, role: string) => void
  onUnlinkReference: (momentId: number, referenceId: number) => void
}) {
  const [referenceValue, setReferenceValue] = useState('')
  const [roleValue, setRoleValue] = useState('supporting')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setReferenceValue('')
    setRoleValue('supporting')
  }, [moment?.ID])

  if (!moment) return null

  const linkedReferences = referencesForOwner('scene_moment', moment.ID, lookup)
  const linkedReferenceItems = (lookup.usagesByOwnerKey.get(`scene_moment:${moment.ID}`) ?? [])
    .map((usage) => {
      const referenceId = Number(usage.setting_id)
      const reference = Number.isFinite(referenceId) ? lookup.settingById.get(referenceId) : null
      return reference ? { reference, usageId: usage.ID } : null
    })
    .filter((item): item is { reference: ProductionSettingRecord; usageId: number } => Boolean(item))
  const linkedIds = new Set(linkedReferences.map((reference) => reference.ID))
  const visibleReferences = settings.filter(isVisibleOrchestrationRecord)
  const shownReferenceItems = linkedReferenceItems
  const shownReferences = shownReferenceItems.map((item) => item.reference)
  const availableReferences = visibleReferences.filter((reference) => !linkedIds.has(reference.ID))
  const selectedReference = referenceValue ? visibleReferences.find((reference) => String(reference.ID) === referenceValue) : null
  const relatedAssetSlots = assetSlots.filter((slot) => (
    isVisibleOrchestrationRecord(slot) &&
    slot.owner_type !== 'asset_slot' &&
    (
      (slot.owner_type === 'scene_moment' && Number(slot.owner_id) === moment.ID) ||
      (slot.setting_id && shownReferences.some((reference) => reference.ID === Number(slot.setting_id))) ||
      (slot.owner_type === 'setting' && slot.owner_id && shownReferences.some((reference) => reference.ID === Number(slot.owner_id)))
    )
  ))
  const groups = [
    { key: 'person', title: '人物', items: shownReferenceItems.filter((item) => isPersonReference(item.reference)) },
    { key: 'place', title: '场景', items: shownReferenceItems.filter((item) => isPlaceReference(item.reference)) },
    { key: 'prop', title: '道具 / 产品', items: shownReferenceItems.filter((item) => ['prop', 'product', 'brand'].includes(String(item.reference.kind ?? '').toLowerCase())) },
    { key: 'style', title: '风格 / 规则', items: shownReferenceItems.filter((item) => ['style', 'world_rule', 'time_period', 'restriction'].includes(String(item.reference.kind ?? '').toLowerCase())) },
  ]

  return (
    <ProductionSceneWritingSection data-testid="production-orchestration-scene-settings">
      <ProductionSceneWritingHeader
        icon={Users}
        eyebrow="情节上下文"
        title="情节设定"
        description={(
          <ProductionSceneWritingResponsiveDescription>
            {linkedReferences.length > 0
              ? '这些设定会跟随当前情节进入镜头方案和生成上下文。'
              : '当前情节还没有显式绑定设定；可从前期准备里的设定资料中选择并挂到这个情节。'}
          </ProductionSceneWritingResponsiveDescription>
        )}
        actions={(
          <ProductionSceneWritingBadgeStack>
          <ProductionSceneWritingStatusBadge statusProps={productionReferencePresenceRecipe({ linkedCount: linkedReferences.length, visibleCount: visibleReferences.length })}>
            {shownReferences.length} 设定
          </ProductionSceneWritingStatusBadge>
          <ProductionSceneWritingBadge variant={relatedAssetSlots.length > 0 ? 'soft' : 'outline'}>
            {relatedAssetSlots.length} 素材
          </ProductionSceneWritingBadge>
          <ProductionSceneWritingActionButton size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Edit3 size={12} />
            编辑设定
          </ProductionSceneWritingActionButton>
          </ProductionSceneWritingBadgeStack>
        )}
      />

      <ProductionSceneReferenceGroupGrid>
        {groups.map((group) => (
          <ProductionSceneReferenceGroup key={group.key} title={group.title} count={group.items.length}>
              {group.items.slice(0, 3).map((item) => (
                <ProductionSceneReferenceItem
                  key={`${item.reference.ID}-${item.usageId ?? 'preview'}`}
                  title={titleOfRecord(item.reference)}
                  meta={settingKindLabel(item.reference.kind)}
                  action={item.usageId ? (
                    <ProductionSceneReferenceRemoveButton
                      aria-label={`移除设定 ${titleOfRecord(item.reference)}`}
                      disabled={isSaving}
                      onClick={() => onUnlinkReference(moment.ID, item.reference.ID)}
                    >
                      <X size={11} />
                    </ProductionSceneReferenceRemoveButton>
                  ) : null}
                />
              ))}
          </ProductionSceneReferenceGroup>
        ))}
      </ProductionSceneReferenceGroupGrid>

      {linkedReferenceItems.length === 0 ? (
        <ProductionSceneReferenceEmptyState title="当前情节还没有绑定设定。请编辑当前情节，从下方选择人物、场景、道具或风格设定后绑定。" />
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <ProductionSceneWritingDialogContent>
          <DialogTitle>编辑情节设定</DialogTitle>
          <DialogDescription>为当前情节选择人物、场景、道具、风格或规则设定。</DialogDescription>
          <ProductionSceneWritingDialogBody>
            <ProductionSceneReferenceGroupGrid>
              {groups.map((group) => (
                <ProductionSceneReferenceGroup key={group.key} title={group.title} count={group.items.length}>
                  {group.items.map((item) => (
                    <ProductionSceneReferenceItem
                      key={`${item.reference.ID}-${item.usageId ?? 'dialog'}`}
                      title={titleOfRecord(item.reference)}
                      meta={settingKindLabel(item.reference.kind)}
                      action={item.usageId ? (
                        <ProductionSceneReferenceRemoveButton
                          aria-label={`移除设定 ${titleOfRecord(item.reference)}`}
                          disabled={isSaving}
                          onClick={() => onUnlinkReference(moment.ID, item.reference.ID)}
                        >
                          <X size={11} />
                        </ProductionSceneReferenceRemoveButton>
                      ) : null}
                    />
                  ))}
                </ProductionSceneReferenceGroup>
              ))}
            </ProductionSceneReferenceGroupGrid>
            <ProductionSceneReferenceBindingRow>
              <Select value={referenceValue} onValueChange={setReferenceValue}>
                <ProductionSceneWritingSelectTrigger>
                  <SelectValue placeholder={availableReferences.length > 0 ? '从前期准备选择设定' : '没有可绑定的新设定'} />
                </ProductionSceneWritingSelectTrigger>
                <SelectContent>
                  {availableReferences.map((reference) => (
                    <SelectItem key={reference.ID} value={String(reference.ID)}>
                      {titleOfRecord(reference)} · {settingKindLabel(reference.kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleValue} onValueChange={setRoleValue}>
                <ProductionSceneWritingSelectTrigger>
                  <SelectValue />
                </ProductionSceneWritingSelectTrigger>
                <SelectContent>
                  {sceneMomentReferenceRoleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ProductionSceneWritingActionButton
                size="sm"
                disabled={!selectedReference || isSaving}
                loading={isSaving}
                onClick={() => {
                  if (!selectedReference) return
                  onLinkReference(moment.ID, selectedReference.ID, roleValue)
                  setReferenceValue('')
                }}
              >
                <Plus size={12} />
                绑定
              </ProductionSceneWritingActionButton>
            </ProductionSceneReferenceBindingRow>
          </ProductionSceneWritingDialogBody>
        </ProductionSceneWritingDialogContent>
      </Dialog>
    </ProductionSceneWritingSection>
  )
}

export function InlineSceneMomentEditor({
  moment,
  momentBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  isDeleting = false,
  isBindingScriptBlock,
  showScriptBinding = true,
  allowCreateAndBindMomentScriptBlock = true,
  onSave,
  onDelete,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  moment: ProductionSceneMomentRecord | null
  momentBlock: ProductionScriptBlockRecord | null
  scriptBlocks: ProductionScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  isDeleting?: boolean
  isBindingScriptBlock: boolean
  showScriptBinding?: boolean
  allowCreateAndBindMomentScriptBlock?: boolean
  onSave: (momentId: number, payload: SemanticEntityPayload) => void
  onDelete?: (momentId: number) => void
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const [workspace, setWorkspace] = useState({
    title: '',
    description: '',
    mood: '',
    time_text: '',
  })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setWorkspace({
      title: firstText(moment?.title),
      description: firstText(moment?.description),
      mood: firstText(moment?.mood),
      time_text: firstText(moment?.time_text),
    })
  }, [moment?.ID, moment?.description, moment?.mood, moment?.time_text, moment?.title])

  if (!moment) {
    return (
      <ProductionSceneMomentEmptyState title="先从左侧选择一个情节，再编辑具体发生的事。" />
    )
  }

  const original = {
    title: firstText(moment.title),
    description: firstText(moment.description),
    mood: firstText(moment.mood),
    time_text: firstText(moment.time_text),
  }
  const changed = Object.keys(workspace).some((key) => workspace[key as keyof typeof workspace].trim() !== original[key as keyof typeof original].trim())

  return (
    <ProductionSceneWritingSection>
      {showScriptBinding ? (
        <SceneMomentScriptBlockBinder
          selectedMoment={moment}
          momentBlock={momentBlock}
          scriptBlocks={scriptBlocks}
          scriptSourceText={scriptSourceText}
          isSaving={isBindingScriptBlock}
          allowCreateFromScriptRange={allowCreateAndBindMomentScriptBlock}
          onBindMomentScriptBlock={onBindMomentScriptBlock}
          onCreateAndBindMomentScriptBlock={onCreateAndBindMomentScriptBlock}
        />
      ) : null}
      <ProductionSceneMomentSummaryCard
        title={firstText(moment.title, `情节 #${moment.ID}`)}
        time={firstText(moment.time_text, '未填写时间')}
        description={firstText(moment.description, '未填写情节说明')}
        mood={firstText(moment.mood, '未填写导演备注 / 节奏目标')}
        actions={(
          <ProductionSceneWritingActionButton size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Edit3 size={12} />
            编辑情节
          </ProductionSceneWritingActionButton>
        )}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <ProductionSceneWritingDialogContent>
          <DialogTitle>编辑情节内容</DialogTitle>
          <DialogDescription>填写当前情节的标题、时间、说明和导演备注。</DialogDescription>
          <ProductionSceneWritingDialogBody>
            <ProductionSceneWritingFieldGrid>
              <ProductionSceneWritingField label="标题（可选）">
                <ProductionSceneWritingTextarea
                  value={workspace.title}
                  onChange={(event) => setWorkspace((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="这场戏发生了什么"
                />
              </ProductionSceneWritingField>
              <ProductionSceneWritingField label="时间（可选）">
                <ProductionSceneWritingTextarea
                  value={workspace.time_text}
                  onChange={(event) => setWorkspace((prev) => ({ ...prev, time_text: event.target.value }))}
                  placeholder="清晨、夜里、发布会前..."
                />
              </ProductionSceneWritingField>
            </ProductionSceneWritingFieldGrid>
            <ProductionSceneWritingField label="情节说明" spaced>
              <ProductionSceneWritingTextarea
                kind="body"
                value={workspace.description}
                onChange={(event) => setWorkspace((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="这段情节承担的推进作用"
              />
            </ProductionSceneWritingField>
            <ProductionSceneWritingField label="导演备注 / 节奏目标（可选）" spaced>
              <ProductionSceneWritingTextarea
                kind="note"
                value={workspace.mood}
                onChange={(event) => setWorkspace((prev) => ({ ...prev, mood: event.target.value }))}
                placeholder="情绪目标、节奏停顿或表演提醒；具体动作请写到表达条目"
              />
            </ProductionSceneWritingField>
            <ProductionSceneWritingActionRow
              leading={onDelete ? (
                <ProductionSceneWritingActionButton
                  size="sm"
                  variant="solid" tone="danger"
                  loading={isDeleting}
                  disabled={isSaving || isDeleting}
                  onClick={() => {
                    const title = firstText(moment.title) || `情节 #${moment.ID}`
                    if (!window.confirm(`确定删除情节「${title}」吗？相关表达、制作项或素材需求可能需要重新归属。`)) return
                    onDelete(moment.ID)
                    setOpen(false)
                  }}
                >
                  <Trash2 size={12} />
                  删除情节
                </ProductionSceneWritingActionButton>
              ) : null}
            >
              {changed && (
                <ProductionSceneWritingActionButton size="sm" variant="ghost" disabled={isSaving || isDeleting} onClick={() => setWorkspace(original)}>
                  取消
                </ProductionSceneWritingActionButton>
              )}
              <ProductionSceneWritingActionButton
                size="sm"
                disabled={!changed || isSaving || isDeleting}
                onClick={() => {
                  onSave(moment.ID, {
                    title: workspace.title.trim(),
                    description: workspace.description.trim(),
                    mood: workspace.mood.trim(),
                    time_text: workspace.time_text.trim(),
                  })
                  setOpen(false)
                }}
              >
                {isSaving ? <ProductionSceneWritingSpinner icon={Loader2} /> : <Check size={12} />}
                保存情节
              </ProductionSceneWritingActionButton>
            </ProductionSceneWritingActionRow>
          </ProductionSceneWritingDialogBody>
        </ProductionSceneWritingDialogContent>
      </Dialog>
    </ProductionSceneWritingSection>
  )
}

export function ProductionExpressionUnitsPanel({
  selectedMoment,
  selectedMomentScriptBlock,
  expressionLines,
  settings,
  lookup,
  isSavingExpressionLine,
  canDeleteFallbackContentUnits = false,
  onAddExpressionLine,
  onSaveExpressionLine,
  onDeleteExpressionLine,
}: {
  selectedMoment: ProductionSceneMomentRecord | null
  selectedMomentScriptBlock: ProductionScriptBlockRecord | null
  expressionLines: ProductionExpressionUnitLine[]
  settings: ProductionSettingRecord[]
  lookup: ProductionExpressionUnitLookup
  isSavingExpressionLine: boolean
  canDeleteFallbackContentUnits?: boolean
  onAddExpressionLine: (momentId: number, order: number, scriptBlockId?: number | null) => void
  onSaveExpressionLine: (target: ProductionExpressionUnitEditTarget, payload: ProductionExpressionUnitSavePayload) => void
  onDeleteExpressionLine: (target: ProductionExpressionUnitEditTarget) => void
}) {
  const speakerOptions = buildSpeakerOptions(selectedMoment, settings, lookup)
  const [creating, setCreating] = useState(false)
  const nextOrder = expressionLines.length + 1
  const createLine: ProductionExpressionUnitLine | null = selectedMoment ? {
    type: 'action',
    label: expressionUnitTypeLabel('action'),
    speaker: defaultSpeakerForNewExpression('action'),
    text: '',
    editTarget: {
      kind: 'fallback',
      id: `new-expression-${selectedMoment.ID}-${nextOrder}`,
      sceneMomentId: selectedMoment.ID,
      scriptBlockId: selectedMomentScriptBlock?.ID ?? null,
      order: nextOrder,
    },
    note: '',
    intent: '',
    persisted: false,
  } : null
  return (
    <ProductionSceneWritingSection flushTop>
      <ProductionSceneWritingHeader
        icon={ScrollText}
        eyebrow="表达结构"
        title="表达条目"
        description="用对白、动作、旁白、屏幕文字和镜头描述拆解当前情节里的可见表达。"
        actions={(
          <ProductionSceneWritingActionButton
            size="sm"
            variant="outline"
            onClick={() => setCreating(true)}
            disabled={!selectedMoment || isSavingExpressionLine}
          >
            <Plus size={12} />
            新增表达
          </ProductionSceneWritingActionButton>
        )}
      />
      <ProductionExpressionLineStack>
        {expressionLines.length === 0 ? (
          <ProductionExpressionEmptyState title="当前情节还没有表达条目。可以先写动作、对白、旁白、屏幕文字或镜头描述。" />
        ) : expressionLines.map((line, index) => (
          <EditableExpressionUnitLine
            key={`${line.editTarget.kind}-${line.editTarget.id}`}
            index={index}
            line={line}
            speakerOptions={speakerOptions}
            isSaving={isSavingExpressionLine}
            canDeleteFallbackContentUnits={canDeleteFallbackContentUnits}
            onSave={onSaveExpressionLine}
            onDelete={onDeleteExpressionLine}
          />
        ))}
      </ProductionExpressionLineStack>
      {createLine ? (
        <ExpressionUnitDialog
          open={creating}
          onOpenChange={setCreating}
          title="新增表达条目"
          actionLabel="创建条目"
          line={createLine}
          speakerOptions={speakerOptions}
          isSaving={isSavingExpressionLine}
          canDeleteFallbackContentUnits={false}
          onSave={(target, payload) => {
            onSaveExpressionLine(target, payload)
            setCreating(false)
          }}
          onDelete={onDeleteExpressionLine}
        />
      ) : null}
    </ProductionSceneWritingSection>
  )
}

function EditableExpressionUnitLine({
  index,
  line,
  speakerOptions,
  isSaving,
  canDeleteFallbackContentUnits,
  onSave,
  onDelete,
}: {
  index: number
  line: ProductionExpressionUnitLine
  speakerOptions: ProductionSpeakerOption[]
  isSaving: boolean
  canDeleteFallbackContentUnits: boolean
  onSave: (target: ProductionExpressionUnitEditTarget, payload: ProductionExpressionUnitSavePayload) => void
  onDelete: (target: ProductionExpressionUnitEditTarget) => void
}) {
  const canDeleteLine = line.persisted && line.editTarget.kind === 'expressionUnits'
    || (canDeleteFallbackContentUnits && line.editTarget.kind === 'fallback' && line.editTarget.id.startsWith('content-unit-'))
  return (
    <ProductionExpressionLineShell
      index={index}
      badges={(
        <>
          <ProductionExpressionBadge variant="outline">{expressionUnitTypeLabel(line.type)}</ProductionExpressionBadge>
          <ProductionExpressionBadge variant={line.persisted ? 'outline' : 'soft'}>
            {line.persisted ? '已保存' : '参考转写'}
          </ProductionExpressionBadge>
        </>
      )}
      speaker={line.speaker.trim() || undefined}
      preview={line.text || textPlaceholderForExpressionUnitType(line.type)}
      meta={(line.intent || line.note) ? [line.intent, line.note].filter(Boolean).join(' · ') : undefined}
      actions={canDeleteLine ? (
        <ProductionExpressionDeleteButton
          aria-label="删除表达条目"
          disabled={isSaving}
          onClick={(event) => {
            event.stopPropagation()
            onDelete(line.editTarget)
          }}
        >
          <Trash2 size={13} />
        </ProductionExpressionDeleteButton>
      ) : null}
      defaultOpen={!line.persisted}
    >
      <ExpressionUnitEditorForm
        actionLabel={line.persisted ? '保存' : '转为条目'}
        line={line}
        speakerOptions={speakerOptions}
        isSaving={isSaving}
        canDeleteFallbackContentUnits={canDeleteFallbackContentUnits}
        onSave={onSave}
        onDelete={onDelete}
      />
    </ProductionExpressionLineShell>
  )
}

function ExpressionUnitDialog({
  open,
  onOpenChange,
  title,
  actionLabel,
  line,
  speakerOptions,
  isSaving,
  canDeleteFallbackContentUnits,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  actionLabel: string
  line: ProductionExpressionUnitLine
  speakerOptions: ProductionSpeakerOption[]
  isSaving: boolean
  canDeleteFallbackContentUnits: boolean
  onSave: (target: ProductionExpressionUnitEditTarget, payload: ProductionExpressionUnitSavePayload) => void
  onDelete: (target: ProductionExpressionUnitEditTarget) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ProductionSceneWritingDialogContent wide>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>选择表达类型，并填写画面中真实发生、说出或出现的内容。</DialogDescription>
        <ProductionSceneWritingDialogBody>
          <ExpressionUnitEditorForm
            actionLabel={actionLabel}
            line={line}
            speakerOptions={speakerOptions}
            isSaving={isSaving}
            canDeleteFallbackContentUnits={canDeleteFallbackContentUnits}
            resetKey={open}
            onSave={(target, payload) => {
              onSave(target, payload)
              onOpenChange(false)
            }}
            onDelete={(target) => {
              onDelete(target)
              onOpenChange(false)
            }}
          />
        </ProductionSceneWritingDialogBody>
      </ProductionSceneWritingDialogContent>
    </Dialog>
  )
}

function ExpressionUnitEditorForm({
  actionLabel,
  line,
  speakerOptions,
  isSaving,
  canDeleteFallbackContentUnits,
  resetKey,
  onSave,
  onDelete,
}: {
  actionLabel: string
  line: ProductionExpressionUnitLine
  speakerOptions: ProductionSpeakerOption[]
  isSaving: boolean
  canDeleteFallbackContentUnits: boolean
  resetKey?: unknown
  onSave: (target: ProductionExpressionUnitEditTarget, payload: ProductionExpressionUnitSavePayload) => void
  onDelete: (target: ProductionExpressionUnitEditTarget) => void
}) {
  const [workspace, setWorkspace] = useState<ProductionExpressionUnitSavePayload>(() => expressionUnitLineWorkspace(line))
  useEffect(() => {
    setWorkspace(expressionUnitLineWorkspace(line))
  }, [line.intent, line.note, line.speaker, line.text, line.type, resetKey])
  const original = expressionUnitLineWorkspace(line)
  const changed = !expressionUnitWorkspaceEquals(workspace, original)
  const typeLabel = expressionUnitTypeLabel(workspace.kind)
  const selectedSpeakerValue = speakerOptionValueForWorkspace(workspace.speaker, speakerOptions)
  const canDeleteLine = line.persisted && line.editTarget.kind === 'expressionUnits'
    || (canDeleteFallbackContentUnits && line.editTarget.kind === 'fallback' && line.editTarget.id.startsWith('content-unit-'))

  return (
    <ProductionExpressionEditorGrid>
      <ProductionExpressionEditorColumn>
        <Select value={workspace.kind} onValueChange={(value) => setWorkspace((prev) => ({ ...prev, kind: value as ProductionExpressionUnitType }))}>
          <ProductionSceneWritingSelectTrigger kind="expression-kind">
            <SelectValue />
          </ProductionSceneWritingSelectTrigger>
          <SelectContent>
            {expressionUnitTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ProductionExpressionField label={speakerLabelForExpressionUnitType(workspace.kind)}>
          <Select
            value={selectedSpeakerValue}
            onValueChange={(value) => {
              if (value === '__custom__') {
                setWorkspace((prev) => ({ ...prev, speaker: speakerOptions.some((option) => option.name === prev.speaker.trim()) ? '' : prev.speaker }))
                return
              }
              const option = speakerOptions.find((item) => speakerOptionValue(item) === value)
              if (option) setWorkspace((prev) => ({ ...prev, speaker: option.name }))
            }}
          >
            <ProductionSceneWritingSelectTrigger kind="expression-speaker">
              <SelectValue placeholder="从设定选择" />
            </ProductionSceneWritingSelectTrigger>
            <SelectContent>
              {speakerOptions.map((option) => (
                <SelectItem key={speakerOptionValue(option)} value={speakerOptionValue(option)}>
                  {option.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">自定义人物 / 群众演员</SelectItem>
            </SelectContent>
          </Select>
          <ProductionSceneWritingTextarea
            kind="speaker"
            value={workspace.speaker}
            onChange={(event) => setWorkspace((prev) => ({ ...prev, speaker: event.target.value }))}
            placeholder={speakerPlaceholderForExpressionUnitType(workspace.kind)}
          />
        </ProductionExpressionField>
      </ProductionExpressionEditorColumn>
      <ProductionExpressionEditorColumn>
        <ProductionSceneWritingTextarea
          kind="expression"
          value={workspace.text}
          onChange={(event) => setWorkspace((prev) => ({ ...prev, text: event.target.value }))}
          placeholder={textPlaceholderForExpressionUnitType(workspace.kind)}
        />
        <ProductionExpressionAuxFieldGrid>
          <ProductionSceneWritingTextarea
            kind="expression-note"
            value={workspace.intent}
            onChange={(event) => setWorkspace((prev) => ({ ...prev, intent: event.target.value }))}
            placeholder={`${typeLabel}的目的`}
          />
          <ProductionSceneWritingTextarea
            kind="expression-note"
            value={workspace.note}
            onChange={(event) => setWorkspace((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="潜台词 / 表演说明"
          />
        </ProductionExpressionAuxFieldGrid>
      </ProductionExpressionEditorColumn>
      <ProductionExpressionEditorActions>
        {canDeleteLine ? (
          <ProductionSceneWritingActionButton
            size="sm"
            variant="ghost"
            tone="danger"
            disabled={isSaving}
            onClick={() => {
              onDelete(line.editTarget)
            }}
          >
            <Trash2 size={12} />
            删除
          </ProductionSceneWritingActionButton>
        ) : null}
        {changed && (
          <ProductionSceneWritingActionButton
            size="sm"
            variant="ghost"
            disabled={isSaving}
            onClick={() => setWorkspace(original)}
          >
            取消
          </ProductionSceneWritingActionButton>
        )}
        <ProductionSceneWritingActionButton
          size="sm"
          disabled={!changed || !workspace.text.trim() || isSaving}
          onClick={() => onSave(line.editTarget, normalizeExpressionUnitWorkspace(workspace))}
        >
          {isSaving ? <ProductionSceneWritingSpinner icon={Loader2} /> : <Check size={12} />}
          {actionLabel}
        </ProductionSceneWritingActionButton>
      </ProductionExpressionEditorActions>
    </ProductionExpressionEditorGrid>
  )
}

function defaultSpeakerForNewExpression(type: ProductionExpressionUnitType) {
  if (type === 'dialogue') return ''
  if (type === 'narration') return '旁白'
  if (type === 'subtitle') return '屏幕文字'
  if (type === 'visual') return '镜头'
  return '场面'
}

function titleOfRecord(record: { ID?: number; title?: string; name?: string; label?: string } | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}
