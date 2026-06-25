import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
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
import type { ContentCanvasSettingKind, SettingCreateDialogState, StructureCreateDialogState } from './contentCanvasWorkspaceTypes'

export function StructureCreateDialog({
  state,
  isBusy,
  onClose,
  onSubmit,
}: {
  state: StructureCreateDialogState | null
  isBusy: boolean
  onClose: () => void
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const dialogCopy = structureCreateDialogCopy(state)
  const canSubmit = Boolean(id.trim() && title.trim() && !isBusy)

  function resetAndClose() {
    setId('')
    setTitle('')
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({ id: id.trim(), title: title.trim() })
    setId('')
    setTitle('')
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
          <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-id">
            <span>ID</span>
            <Input
              id="content-canvas-create-id"
              autoFocus
              value={id}
              placeholder={dialogCopy.idPlaceholder}
              onChange={(event) => setId(event.target.value)}
            />
          </Label>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-title">
            <span>Title</span>
            <Input
              id="content-canvas-create-title"
              value={title}
              placeholder={dialogCopy.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
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
  onClose,
  onSubmit,
}: {
  state: SettingCreateDialogState | null
  isBusy: boolean
  onClose: () => void
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [settingKind, setSettingKind] = useState<ContentCanvasSettingKind | ''>('')
  const canSubmit = Boolean(id.trim() && title.trim() && settingKind && !isBusy)

  function resetAndClose() {
    setId('')
    setTitle('')
    setSettingKind('')
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !settingKind) return
    onSubmit({ id: id.trim(), title: title.trim(), settingKind })
    setId('')
    setTitle('')
    setSettingKind('')
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (open) return
      resetAndClose()
    }}>
      <DialogContent className="content-canvas-create-dialog">
        <DialogHeader>
          <DialogTitle>创建设定</DialogTitle>
        </DialogHeader>
        <form className="content-canvas-create-dialog__form" onSubmit={handleSubmit}>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-setting-id">
            <span>ID</span>
            <Input
              id="content-canvas-create-setting-id"
              autoFocus
              value={id}
              placeholder="hero"
              onChange={(event) => setId(event.target.value)}
            />
          </Label>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-canvas-create-setting-title">
            <span>标题</span>
            <Input
              id="content-canvas-create-setting-title"
              value={title}
              placeholder="主角"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          <div className="content-canvas-create-dialog__field">
            <Label htmlFor="content-canvas-create-setting-kind">类型</Label>
            <Select value={settingKind} onValueChange={(value) => setSettingKind(value as ContentCanvasSettingKind)}>
              <SelectTrigger id="content-canvas-create-setting-kind" className="content-canvas-create-dialog__select">
                <SelectValue placeholder="选择设定类型" />
              </SelectTrigger>
              <SelectContent>
                {SETTING_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

function structureCreateDialogCopy(state: StructureCreateDialogState | null) {
  if (state?.kind === 'segment') {
    return {
      title: `添加 Segment 到 ${state.parent.title}`,
      idPlaceholder: 'segment_001',
      titlePlaceholder: '情绪段标题',
    }
  }
  if (state?.kind === 'scene_moment') {
    return {
      title: `添加 Scene Moment 到 ${state.parent.title}`,
      idPlaceholder: 'scene_001',
      titlePlaceholder: '情节标题',
    }
  }
  return {
    title: '添加 Production',
    idPlaceholder: 'production_001',
    titlePlaceholder: '制作标题',
  }
}

const SETTING_KIND_OPTIONS: Array<{ value: ContentCanvasSettingKind; label: string }> = [
  { value: 'character', label: '角色' },
  { value: 'location', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'world_rule', label: '世界规则' },
  { value: 'style', label: '风格' },
  { value: 'other', label: '其他' },
]
