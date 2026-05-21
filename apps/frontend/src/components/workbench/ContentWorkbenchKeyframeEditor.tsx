import { ArrowDown, ArrowUp, CheckCircle2, Play, Plus, Trash2 } from 'lucide-react'

import { AuthedImage } from '@/components/shared/AuthedImage'
import {
  keyframeDisplayTitle,
  keyframeEditStatusOptions,
  keyframeFrameRoleLabel,
  keyframeFrameRoleOptions,
  keyframeGenerationStatusLabel,
  keyframeHasRunningJob,
  keyframeOutputResourceId,
  latestKeyframeGenerationJob,
  type ContentWorkbenchEditRecord,
  type KeyframeEditDraft,
} from '@/lib/contentWorkbenchEditModel'
import { firstText } from '@/lib/contentWorkbenchRecordUtils'
import { resourceFileUrl } from '@/lib/contentWorkbenchStatus'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { cn } from '@/lib/utils'
import type { Job, PublicModel } from '@/types'
import { Badge, Button, Input, Label, Textarea } from '@movscript/ui'
import { ContentUnitEditSelect } from './ContentUnitEditControls'

export function ContentWorkbenchKeyframeEditor({
  compact = false,
  keyframes,
  selectedKeyframe,
  keyframeDraft,
  jobs,
  unit,
  requiresKeyframe,
  imageModels,
  keyframeModelId,
  hasSelectedModel,
  unfinishedKeyframes,
  reorderPending,
  deletePending,
  savePending,
  generatePending,
  keyframeUnchanged,
  onCreateKeyframe,
  onSelectKeyframe,
  onMoveKeyframe,
  onDeleteKeyframe,
  onSaveKeyframe,
  onDraftChange,
  onModelChange,
  onGenerateKeyframes,
}: {
  compact?: boolean
  keyframes: ContentWorkbenchEditRecord[]
  selectedKeyframe: ContentWorkbenchEditRecord | null
  keyframeDraft: KeyframeEditDraft
  jobs: Job[]
  unit: ContentWorkbenchEditRecord
  requiresKeyframe: boolean
  imageModels: PublicModel[]
  keyframeModelId: string
  hasSelectedModel: boolean
  unfinishedKeyframes: ContentWorkbenchEditRecord[]
  reorderPending: boolean
  deletePending: boolean
  savePending: boolean
  generatePending: boolean
  keyframeUnchanged: boolean
  onCreateKeyframe?: () => void
  onSelectKeyframe: (keyframeId: number) => void
  onMoveKeyframe: (keyframe: ContentWorkbenchEditRecord, direction: 'up' | 'down') => void
  onDeleteKeyframe: (keyframe: ContentWorkbenchEditRecord) => void
  onSaveKeyframe: () => void
  onDraftChange: (key: keyof KeyframeEditDraft, value: string) => void
  onModelChange: (modelId: string) => void
  onGenerateKeyframes: (targets: ContentWorkbenchEditRecord[]) => void
}) {
  return (
    <div className={cn('grid gap-3', compact ? '' : 'lg:grid-cols-[minmax(240px,.8fr)_minmax(0,1.2fr)]')} data-testid="content-workbench-keyframe-editor">
      <div className="min-w-0 rounded-md border border-border bg-background">
        <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate type-label font-medium text-foreground">关键帧列表</p>
            <p className="mt-0.5 truncate type-caption text-muted-foreground">
              {keyframes.length > 0 ? `${keyframes.length} 帧按顺序生成` : requiresKeyframe ? '建议先补首帧、尾帧。' : '可选画面输入'}
            </p>
          </div>
          {onCreateKeyframe ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateKeyframe}>
              <Plus size={13} />
              添加
            </Button>
          ) : null}
        </div>
        <div className="max-h-[320px] space-y-1 overflow-auto p-2" data-testid="content-workbench-keyframe-list">
          {keyframes.length > 0 ? keyframes.map((keyframe, index) => {
            const active = selectedKeyframe?.ID === keyframe.ID
            const latestJob = latestKeyframeGenerationJob(jobs, keyframe)
            const outputResourceId = keyframeOutputResourceId(keyframe, jobs)
            const running = keyframeHasRunningJob(keyframe, jobs)
            return (
              <button
                key={keyframe.ID}
                type="button"
                className={cn(
                  'grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                  active ? 'border-primary/60 bg-primary/5' : 'border-border bg-card hover:bg-primary/5',
                )}
                onClick={() => onSelectKeyframe(keyframe.ID)}
                data-testid="content-workbench-keyframe-list-row"
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-muted type-tiny font-medium tabular-nums text-muted-foreground">
                  {outputResourceId > 0 ? (
                    <AuthedImage src={resourceFileUrl(outputResourceId)} alt={recordTitle(keyframe)} className="h-full w-full object-cover" />
                  ) : String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block truncate type-label font-medium text-foreground">{keyframeDisplayTitle(keyframe)}</span>
                  <span className="mt-0.5 block truncate type-caption text-muted-foreground">{firstText(keyframe.prompt, keyframe.description, '暂无提示词')}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Badge variant={running ? 'secondary' : outputResourceId > 0 ? 'success' : latestJob?.status === 'failed' ? 'danger' : 'outline'}>
                    {running ? '生成中' : outputResourceId > 0 ? '有结果' : latestJob?.status === 'failed' ? '失败' : '待生成'}
                  </Badge>
                </span>
              </button>
            )
          }) : (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center type-label leading-5 text-muted-foreground">
              当前制作项还没有关键帧。先添加首帧或尾帧，再逐帧生成。
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 rounded-md border border-border bg-background p-2.5">
        {selectedKeyframe ? (
          <div className="space-y-3" data-testid="content-workbench-keyframe-detail">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="type-label font-medium text-foreground">当前关键帧</p>
                <p className="mt-0.5 truncate type-caption text-muted-foreground">
                  {keyframeGenerationStatusLabel(selectedKeyframe, jobs)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Button
                  size="icon-sm"
                  variant="outline"
                 
                  title="上移关键帧"
                  aria-label="上移关键帧"
                  disabled={reorderPending || keyframes[0]?.ID === selectedKeyframe.ID}
                  onClick={() => onMoveKeyframe(selectedKeyframe, 'up')}
                >
                  <ArrowUp size={13} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                 
                  title="下移关键帧"
                  aria-label="下移关键帧"
                  disabled={reorderPending || keyframes[keyframes.length - 1]?.ID === selectedKeyframe.ID}
                  onClick={() => onMoveKeyframe(selectedKeyframe, 'down')}
                >
                  <ArrowDown size={13} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={deletePending || savePending}
                  loading={deletePending}
                  onClick={() => onDeleteKeyframe(selectedKeyframe)}
                  data-testid="content-workbench-keyframe-delete"
                >
                  <Trash2 size={13} />
                  删除
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={keyframeUnchanged || savePending || deletePending}
                  loading={savePending}
                  onClick={onSaveKeyframe}
                  data-testid="content-workbench-keyframe-save"
                >
                  <CheckCircle2 size={13} />
                  保存
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_96px_128px]">
              <ContentUnitEditSelect label="分类" value={keyframeDraft.frame_role} options={keyframeFrameRoleOptions} onChange={(value) => onDraftChange('frame_role', value)} />
              <div className="space-y-1.5">
                <Label htmlFor={`keyframe-title-${selectedKeyframe.ID}`} className="type-label">标题（可选）</Label>
                <Input id={`keyframe-title-${selectedKeyframe.ID}`} value={keyframeDraft.title} placeholder={`${keyframeFrameRoleLabel(keyframeDraft.frame_role)} · ${recordTitle(unit)}`} onChange={(event) => onDraftChange('title', event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`keyframe-order-${selectedKeyframe.ID}`} className="type-label">顺序</Label>
                <Input id={`keyframe-order-${selectedKeyframe.ID}`} type="number" min="1" value={keyframeDraft.order} onChange={(event) => onDraftChange('order', event.target.value)} />
              </div>
              <ContentUnitEditSelect label="状态" value={keyframeDraft.status} options={keyframeEditStatusOptions} onChange={(value) => onDraftChange('status', value)} />
            </div>

            <div className={cn('grid gap-2', compact ? '' : 'lg:grid-cols-2')}>
              <div className="space-y-1.5">
                <Label htmlFor={`keyframe-description-${selectedKeyframe.ID}`} className="type-label">画面描述</Label>
                <Textarea
                  id={`keyframe-description-${selectedKeyframe.ID}`}
                  className="min-h-[96px]"
                  value={keyframeDraft.description}
                  placeholder="描述这一帧的叙事状态、人物动作、空间关系和画面重点。"
                  onChange={(event) => onDraftChange('description', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`keyframe-prompt-${selectedKeyframe.ID}`} className="type-label">生成提示词</Label>
                <Textarea
                  id={`keyframe-prompt-${selectedKeyframe.ID}`}
                  className="min-h-[96px]"
                  value={keyframeDraft.prompt}
                  placeholder="写给图像模型的关键帧提示词，包含风格、构图、角色一致性和负向约束。"
                  onChange={(event) => onDraftChange('prompt', event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-2 rounded-md border border-border bg-card p-2.5">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label htmlFor={`keyframe-model-${selectedKeyframe.ID}`} className="type-label">图像模型</Label>
                <select
                  id={`keyframe-model-${selectedKeyframe.ID}`}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 type-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={keyframeModelId}
                  onChange={(event) => onModelChange(event.target.value)}
                  disabled={imageModels.length === 0}
                >
                  {imageModels.length > 0 ? imageModels.map((model) => (
                    <option key={publicModelId(model)} value={publicModelId(model)}>{publicModelLabel(model)}</option>
                  )) : <option value="">没有可用图像模型</option>}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={unfinishedKeyframes.length === 0 || generatePending || !hasSelectedModel}
                  loading={generatePending && unfinishedKeyframes.length > 1}
                  onClick={() => onGenerateKeyframes(unfinishedKeyframes)}
                  data-testid="content-workbench-keyframe-generate-missing"
                >
                  <Play size={13} />
                  生成未完成
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={generatePending || !hasSelectedModel}
                  loading={generatePending}
                  onClick={() => onGenerateKeyframes([selectedKeyframe])}
                  data-testid="content-workbench-keyframe-generate-one"
                >
                  <Play size={13} />
                  生成当前帧
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-8 text-center type-label leading-5 text-muted-foreground">
            选择一个关键帧后，可以编辑提示词、删除、排序或逐帧生成。
          </div>
        )}
      </div>
    </div>
  )
}

function recordTitle(record: ContentWorkbenchEditRecord) {
  return firstText(record.title, record.name, `${record.kind || '记录'} #${record.ID}`)
}
