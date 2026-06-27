import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { suggestMovScriptEntityId } from '@movscript/domain'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui/primitives'

import type { ContentCanvasCreateNodeInput } from '../application/contentCanvasCommands'
import type { SettingCreateDialogState, StructureCreateDialogState } from './contentCanvasWorkspaceTypes'
import {
  contentCanvasRootSettingNamespaceKind,
  type ContentCanvasNamespaceVocabularyOptions,
} from './contentCanvasNamespaceVocabularyModel'
import {
  CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS,
  DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE,
  contentCanvasParseTimelineNamespaces,
  contentCanvasTimelineProfileOption,
  contentCanvasTimelineProfileRootKind,
  type ContentCanvasTimelineProfileId,
} from '../domain/contentCanvasTimelineProfiles'

type CreateDialogPlanItem = {
  label: string
  value: string
  tone?: 'context' | 'create' | 'use'
}

export function StructureCreateDialog({
  state,
  isBusy,
  namespaceVocabulary,
  onClose,
  onSubmit,
}: {
  state: StructureCreateDialogState | null
  isBusy: boolean
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
  onClose: () => void
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  void namespaceVocabulary
  const [id, setId] = useState('')
  const [hasManualId, setHasManualId] = useState(false)
  const [title, setTitle] = useState('')
  const [timelineProfile, setTimelineProfile] = useState<ContentCanvasTimelineProfileId>(DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
  const [customProductionType, setCustomProductionType] = useState('')
  const [customTimelineNamespaces, setCustomTimelineNamespaces] = useState('')
  const dialogCopy = structureCreateDialogCopy(state)
  const needsTimelineProfile = state?.kind === 'production'
  const needsCustomTimelineNamespaces = needsTimelineProfile && timelineProfile === 'custom'
  const customTimelineNamespaceValues = contentCanvasParseTimelineNamespaces(customTimelineNamespaces)
  const selectedTimelineProfile = contentCanvasTimelineProfileOption(timelineProfile)
  const suggestedId = suggestMovScriptEntityId({
    title: title.trim() || dialogCopy.titlePlaceholder,
    fallbackPrefix: structureCreateDialogIdPrefix(state),
  })
  const resolvedId = hasManualId ? id.trim() : suggestedId
  const planItems = structureCreateDialogPlanItems({
    customProductionType,
    customTimelineNamespaceValues,
    dialogCopy,
    id: resolvedId,
    needsCustomTimelineNamespaces,
    needsTimelineProfile,
    selectedTimelineProfileLabel: selectedTimelineProfile.label,
    state,
    title,
  })
  const canSubmit = Boolean(
    title.trim()
    && resolvedId
    && (!needsTimelineProfile || timelineProfile.trim())
    && (!needsCustomTimelineNamespaces || (customProductionType.trim() && customTimelineNamespaceValues.length > 0))
    && !isBusy,
  )

  useEffect(() => {
    if (needsTimelineProfile) setTimelineProfile(DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
    setCustomProductionType('')
    setCustomTimelineNamespaces('')
  }, [needsTimelineProfile])

  function resetAndClose() {
    setId('')
    setHasManualId(false)
    setTitle('')
    setTimelineProfile(DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
    setCustomProductionType('')
    setCustomTimelineNamespaces('')
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      id: hasManualId ? id.trim() : '',
      title: title.trim(),
      ...(needsTimelineProfile ? {
        timelineProfile: timelineProfile.trim(),
        productionType: needsCustomTimelineNamespaces ? customProductionType.trim() : timelineProfile.trim(),
        ...(needsCustomTimelineNamespaces ? { timelineNamespaces: customTimelineNamespaceValues } : {}),
        timelineNamespaceKind: contentCanvasTimelineProfileRootKind(timelineProfile),
      } : {}),
    })
    setId('')
    setHasManualId(false)
    setTitle('')
    setTimelineProfile(DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
    setCustomProductionType('')
    setCustomTimelineNamespaces('')
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (open) return
      resetAndClose()
    }}>
      <DialogContent className="content-canvas-create-dialog">
        <DialogHeader>
          <DialogTitle>{dialogCopy.title}</DialogTitle>
        </DialogHeader>
        <form className="content-canvas-create-dialog__form" onSubmit={handleSubmit}>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-title">
            <span>标题</span>
            <Input
              id="content-canvas-create-title"
              autoFocus
              value={title}
              placeholder={dialogCopy.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          <details className="content-canvas-create-dialog__advanced">
            <summary>高级：自定义 ID</summary>
            <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-id">
              <span>ID</span>
              <Input
                id="content-canvas-create-id"
                value={hasManualId ? id : suggestedId}
                placeholder={dialogCopy.idPlaceholder}
                onChange={(event) => {
                  const nextId = event.target.value
                  setId(nextId)
                  setHasManualId(Boolean(nextId.trim()))
                }}
              />
            </Label>
          </details>
          {needsTimelineProfile ? (
            <div className="content-canvas-create-dialog__field">
              <Label htmlFor="content-canvas-create-timeline-profile">制作类型</Label>
              <Select value={timelineProfile} onValueChange={(value) => setTimelineProfile(value as ContentCanvasTimelineProfileId)}>
                <SelectTrigger id="content-canvas-create-timeline-profile" className="content-canvas-create-dialog__select">
                  <SelectValue placeholder="选择制作类型" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="type-caption text-muted-foreground">{selectedTimelineProfile.description}</p>
            </div>
          ) : null}
          {needsCustomTimelineNamespaces ? (
            <>
              <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-production-type">
                <span>自定义类型</span>
                <Input
                  id="content-canvas-create-production-type"
                  value={customProductionType}
                  placeholder="music_video"
                  onChange={(event) => setCustomProductionType(event.target.value)}
                />
              </Label>
              <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-timeline-namespaces">
                <span>内部时间层级</span>
                <Input
                  id="content-canvas-create-timeline-namespaces"
                  value={customTimelineNamespaces}
                  placeholder="act, sequence, beat"
                  onChange={(event) => setCustomTimelineNamespaces(event.target.value)}
                />
              </Label>
            </>
          ) : null}
          <CreateDialogPlanPreview items={planItems} />
          <DialogFooter className="content-canvas-create-dialog__footer">
            <button type="button" className="content-canvas-create-dialog__button" onClick={resetAndClose} disabled={isBusy}>
              取消
            </button>
            <button type="submit" className="content-canvas-create-dialog__button content-canvas-create-dialog__button--primary" disabled={!canSubmit}>
              <Plus size={13} aria-hidden="true" />
              创建
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SettingCreateDialog({
  state,
  isBusy,
  namespaceVocabulary,
  onClose,
  onSubmit,
}: {
  state: SettingCreateDialogState | null
  isBusy: boolean
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
  onClose: () => void
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [hasManualId, setHasManualId] = useState(false)
  const [title, setTitle] = useState('')
  const rootNamespaceKind = contentCanvasRootSettingNamespaceKind(namespaceVocabulary)
  const [settingNamespaceKind, setSettingNamespaceKind] = useState(rootNamespaceKind)
  const suggestedId = suggestMovScriptEntityId({
    title: title.trim() || '主角',
    fallbackPrefix: 'setting',
  })
  const resolvedId = hasManualId ? id.trim() : suggestedId
  const planItems = settingCreateDialogPlanItems({
    id: resolvedId,
    settingNamespaceKind,
    title,
  })
  const canSubmit = Boolean(title.trim() && resolvedId && settingNamespaceKind.trim() && !isBusy)

  useEffect(() => {
    setSettingNamespaceKind(rootNamespaceKind)
  }, [rootNamespaceKind])

  function resetAndClose() {
    setId('')
    setHasManualId(false)
    setTitle('')
    setSettingNamespaceKind(rootNamespaceKind)
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      id: hasManualId ? id.trim() : '',
      title: title.trim(),
      settingKind: settingNamespaceKind.trim(),
      settingNamespaceKind: settingNamespaceKind.trim(),
    })
    setId('')
    setHasManualId(false)
    setTitle('')
    setSettingNamespaceKind(rootNamespaceKind)
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (open) return
      resetAndClose()
    }}>
      <DialogContent className="content-canvas-create-dialog">
        <DialogHeader>
          <DialogTitle>创建设定层级</DialogTitle>
        </DialogHeader>
        <form className="content-canvas-create-dialog__form" onSubmit={handleSubmit}>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-setting-title">
            <span>标题</span>
            <Input
              id="content-canvas-create-setting-title"
              autoFocus
              value={title}
              placeholder="主角"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          <details className="content-canvas-create-dialog__advanced">
            <summary>高级：自定义 ID</summary>
            <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-setting-id">
              <span>ID</span>
              <Input
                id="content-canvas-create-setting-id"
                value={hasManualId ? id : suggestedId}
                placeholder="hero"
                onChange={(event) => {
                  const nextId = event.target.value
                  setId(nextId)
                  setHasManualId(Boolean(nextId.trim()))
                }}
              />
            </Label>
          </details>
          <div className="content-canvas-create-dialog__field">
            <Label htmlFor="content-canvas-create-setting-kind">层级类型</Label>
            <Select value={settingNamespaceKind} onValueChange={setSettingNamespaceKind}>
              <SelectTrigger id="content-canvas-create-setting-kind" className="content-canvas-create-dialog__select">
                <SelectValue placeholder="选择设定层级" />
              </SelectTrigger>
              <SelectContent>
                {namespaceVocabulary.settingNamespaces.map((namespaceKind) => (
                  <SelectItem key={namespaceKind} value={namespaceKind}>{namespaceKind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CreateDialogPlanPreview items={planItems} />
          <DialogFooter className="content-canvas-create-dialog__footer">
            <button type="button" className="content-canvas-create-dialog__button" onClick={resetAndClose} disabled={isBusy}>
              取消
            </button>
            <button type="submit" className="content-canvas-create-dialog__button content-canvas-create-dialog__button--primary" disabled={!canSubmit}>
              <Plus size={13} aria-hidden="true" />
              创建
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateDialogPlanPreview({ items }: { items: CreateDialogPlanItem[] }) {
  if (!items.length) return null
  return (
    <section className="content-canvas-create-dialog__plan" aria-label="将要创建">
      <div className="content-canvas-create-dialog__plan-title">将要创建</div>
      <ul className="content-canvas-create-dialog__plan-list">
        {items.map((item) => (
          <li key={`${item.label}:${item.value}`} data-tone={item.tone ?? 'context'}>
            <span>{item.label}</span>
            <b>{item.value}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

function structureCreateDialogPlanItems(input: {
  customProductionType: string
  customTimelineNamespaceValues: string[]
  dialogCopy: { title: string; idPlaceholder: string; titlePlaceholder: string }
  id: string
  needsCustomTimelineNamespaces: boolean
  needsTimelineProfile: boolean
  selectedTimelineProfileLabel: string
  state: StructureCreateDialogState | null
  title: string
}): CreateDialogPlanItem[] {
  const items: CreateDialogPlanItem[] = []
  if (input.state && 'parent' in input.state) {
    items.push({
      label: '父节点',
      value: `${input.state.parent.kind} · ${input.state.parent.title}`,
      tone: 'context',
    })
  }
  items.push({
    label: '目标类型',
    value: structureCreateDialogTargetLabel(input.state),
    tone: 'context',
  })
  if (input.needsTimelineProfile) {
    items.push({
      label: '制作类型',
      value: input.needsCustomTimelineNamespaces
        ? input.customProductionType.trim() || 'custom'
        : input.selectedTimelineProfileLabel,
      tone: 'use',
    })
  }
  if (input.needsCustomTimelineNamespaces) {
    items.push({
      label: '时间层级',
      value: input.customTimelineNamespaceValues.length ? input.customTimelineNamespaceValues.join(', ') : 'act, sequence, beat',
      tone: 'use',
    })
  }
  items.push({
    label: '目标节点',
    value: createDialogPlanValue(input.title, input.id, input.dialogCopy.titlePlaceholder, input.dialogCopy.idPlaceholder),
    tone: 'create',
  })
  return items
}

function settingCreateDialogPlanItems(input: {
  id: string
  settingNamespaceKind: string
  title: string
}): CreateDialogPlanItem[] {
  return [
    {
      label: '目标类型',
      value: '设定层级',
      tone: 'context',
    },
    {
      label: '层级类型',
      value: input.settingNamespaceKind || 'setting',
      tone: 'use',
    },
    {
      label: '目标节点',
      value: createDialogPlanValue(input.title, input.id, '主角', 'hero'),
      tone: 'create',
    },
  ]
}

function structureCreateDialogTargetLabel(state: StructureCreateDialogState | null): string {
  if (state?.kind === 'production') return '时间线层级'
  if (state?.kind === 'segment') return '子层级'
  if (state?.kind === 'scene_moment') return '情节'
  return '节点'
}

function createDialogPlanValue(title: string, id: string, fallbackTitle: string, fallbackId: string): string {
  return `${title.trim() || fallbackTitle} (${id.trim() || fallbackId})`
}

function structureCreateDialogCopy(state: StructureCreateDialogState | null) {
  if (state?.kind === 'segment') {
    return {
      title: `添加子层级到 ${state.parent.title}`,
      idPlaceholder: 'namespace_001',
      titlePlaceholder: '层级标题',
    }
  }
  if (state?.kind === 'scene_moment') {
    return {
      title: `添加情节到 ${state.parent.title}`,
      idPlaceholder: 'scene_001',
      titlePlaceholder: '情节标题',
    }
  }
  return {
    title: '添加时间线层级',
    idPlaceholder: 'episode_001',
    titlePlaceholder: '层级标题',
  }
}

function structureCreateDialogIdPrefix(state: StructureCreateDialogState | null): string {
  if (state?.kind === 'scene_moment') return 'scene'
  if (state?.kind === 'segment') return 'segment'
  return 'production'
}
