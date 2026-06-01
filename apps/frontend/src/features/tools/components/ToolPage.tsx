import { useRef } from 'react'
import { Upload, Wand2, Download, Loader2, AlertCircle, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { RawResource, PublicModel } from '@/types'
import type { ToolCanvasState } from '@/features/tools/application/useToolCanvas'
import { ResourcePanel } from '@/shared/ui/ResourcePanel'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import { GenerationOutputPreview } from '@/shared/ui/GenerationOutputPreview'
import {
  Button,
  NativeSelect,
  Textarea,
  ToolActionBar,
  ToolHiddenFileInput,
  ToolOutputDownloadAction,
  ToolOutputMediaShell,
  ToolOutputPanel,
  ToolOutputStage,
  ToolOutputState,
  ToolPageFrame,
  ToolPanel,
  ToolPanelHeader,
  ToolPanelSection,
  ToolResourceGrid,
  ToolResourceRemoveButton,
  ToolResourceTile,
  ToolUploadTile
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { IMAGE_UPLOAD_ACCEPT, MEDIA_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'

export interface ToolDef {
  name: string
  description: string
  inputLabel: string
  inputType: 'image' | 'video' | 'image+video'
  outputType: 'image' | 'video'
  promptPlaceholder?: string
  promptRequired?: boolean
  hidePrompt?: boolean
  inputRequired?: boolean
}

interface ToolPageProps {
  def: ToolDef
  state: ToolCanvasState
  update: (patch: Partial<ToolCanvasState>) => void
  run: () => void
  models: PublicModel[]
  resources: RawResource[]
}

export function ToolPage({ def, state, update, run, models }: ToolPageProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const isRunning = state.status === 'pending' || state.status === 'running'
  const accept = def.inputType === 'video' ? 'video/*'
    : def.inputType === 'image' ? IMAGE_UPLOAD_ACCEPT
    : MEDIA_UPLOAD_ACCEPT

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/resources/upload', fd).then((r) => r.data as RawResource)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      update({ inputResources: [...state.inputResources, r] })
    },
  })

  const outputSrc = state.outputResource ? resolveResourceUrl(state.outputResource) : undefined
  const selectedModelValue = state.modelId
    || (models[0] ? publicModelId(models[0]) : '')

  return (
    <ToolPageFrame
      sidebar={(
        <ResourcePanel
          inputType={def.inputType}
          selectedIds={state.inputResources.map((r) => r.ID)}
          onSelect={(r) => update({ inputResources: [...state.inputResources, r] })}
        />
      )}
    >
      <ToolPanel>
        <ToolPanelHeader title={def.inputLabel} />
        <ToolPanelSection>
          <ToolResourceGrid hint={state.inputResources.length === 0 ? t('tools.page.selectFromLeft') : undefined}>
            {state.inputResources.map((r, i) => (
              <ToolResourceTile
                key={r.ID}
                name={r.name}
                media={r.type === 'image' || r.type === 'video' ? (
                  <MediaViewer resource={r} lightbox={false} />
                ) : (
                  <span className="tool-resource-tile__placeholder">{t('canvas.paramTypes.video')}</span>
                )}
                removeAction={(
                  <ToolResourceRemoveButton
                      aria-label="移除输入资源"
                      onClick={() => update({ inputResources: state.inputResources.filter((_, j) => j !== i) })}
                  />
                )}
              />
            ))}
            <ToolUploadTile>
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : state.inputResources.length === 0 ? <Upload size={16} /> : <Plus size={16} />
                }
                <span>{upload.isPending ? t('canvas.nodePanel.uploading') : t('shared.attachments.upload')}</span>
              </Button>
            </ToolUploadTile>
          </ToolResourceGrid>
        </ToolPanelSection>
        <ToolHiddenFileInput
          ref={fileRef}
          accept={accept}
          onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
        />

        {!def.hidePrompt && (
          <ToolPanelSection>
            <Textarea
              rows={3}
              placeholder={def.promptPlaceholder ?? t('shared.generation.promptPlaceholder')}
              value={state.prompt}
              onChange={(e) => update({ prompt: e.target.value })}
              className="tool-prompt-field"
            />
          </ToolPanelSection>
        )}

        <ToolActionBar>
          <NativeSelect
            className="tool-action-bar__select"
            value={selectedModelValue}
            onChange={(e) => {
              update({ modelId: e.target.value })
            }}
          >
            {models.map((m) => <option key={m.id} value={publicModelId(m)}>{publicModelLabel(m)}</option>)}
            {models.length === 0 && <option value="">{t('shared.modelSelector.noModels')}</option>}
          </NativeSelect>
          <div className="tool-action-bar__spacer" />
          <Button
            onClick={run}
            disabled={
              isRunning ||
              (def.promptRequired !== false && !state.prompt.trim()) ||
              (def.inputRequired === true && state.inputResources.length === 0) ||
              models.length === 0
            }
            className="tool-action-bar__run"
          >
            {isRunning
              ? <><Loader2 size={14} className="animate-spin mr-2" />{t('canvas.generating')}</>
              : <><Wand2 size={14} className="mr-2" />{t('canvas.run')}</>
            }
          </Button>
        </ToolActionBar>
      </ToolPanel>

      {state.status !== 'idle' && (
        <ToolOutputPanel title={t('tools.page.result')}>
          <ToolOutputStage>
            {isRunning && (
              <ToolOutputState layout="stack" icon={<Loader2 size={24} className="animate-spin" />}>
                <p>{state.status === 'pending' ? t('canvas.waitingStart') : t('canvas.generating')}</p>
              </ToolOutputState>
            )}
            {!isRunning && state.status === 'failed' && (
              <ToolOutputState tone="danger" icon={<AlertCircle size={16} />}>
                <p>{state.error ?? t('canvas.generationFailed')}</p>
              </ToolOutputState>
            )}
            {!isRunning && state.status === 'done' && state.outputResource && outputSrc && (
              <ToolOutputMediaShell
                action={(
                  <ToolOutputDownloadAction>
                    <a href={outputSrc} download={state.outputResource?.name}>
                      <Download size={12} /> {t('shared.mediaViewer.download')}
                    </a>
                  </ToolOutputDownloadAction>
                )}
              >
                <GenerationOutputPreview
                  resource={state.outputResource}
                  outputType={def.outputType}
                  alt={t('shared.generation.resultAlt')}
                />
              </ToolOutputMediaShell>
            )}
          </ToolOutputStage>
        </ToolOutputPanel>
      )}
    </ToolPageFrame>
  )
}
