import { useRef } from 'react'
import { Upload, Wand2, Download, Loader2, AlertCircle, X, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { publicModelLabel } from '@/lib/modelDisplay'
import type { RawResource, PublicModel } from '@/types'
import type { ToolCanvasState } from '@/hooks/useToolCanvas'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { ResourcePanel } from '@/components/shared/ResourcePanel'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

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
    : def.inputType === 'image' ? 'image/*'
    : 'image/*,video/*'

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

  const outputSrc = state.outputResource
    ? state.outputResource.direct_url ?? `${API_BASE}${state.outputResource.url}`
    : undefined

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-11 border-b border-border px-5 flex items-center gap-3 bg-background shrink-0">
        <h1 className="text-sm font-semibold text-foreground">{def.name}</h1>
        <span className="text-xs text-muted-foreground">{def.description}</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: resource + asset panel */}
        <ResourcePanel
          inputType={def.inputType}
          selectedIds={state.inputResources.map((r) => r.ID)}
          onSelect={(r) => update({ inputResources: [...state.inputResources, r] })}
        />

        {/* Right: cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* ── Input card ── */}
          <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">

            {/* Selected resource thumbnails */}
            <div className="p-3 border-b border-border">
              <p className="text-xs text-muted-foreground mb-2">{def.inputLabel}</p>
              <div className="flex flex-wrap gap-2">
                {state.inputResources.map((r, i) => (
                  <div key={r.ID} className="relative group">
                    {r.type === 'image' ? (
                      r.direct_url
                        ? <img src={r.direct_url} alt={r.name} className="w-20 h-20 object-cover rounded-lg border border-border" />
                        : <AuthedImage src={`${API_BASE}${r.url}`} alt={r.name} className="w-20 h-20 object-cover rounded-lg border border-border" />
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded-lg border border-border flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">{t('canvas.paramTypes.video')}</span>
                      </div>
                    )}
                    <button
                      onClick={() => update({ inputResources: state.inputResources.filter((_, j) => j !== i) })}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-background border border-border rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                    >
                      <X size={10} />
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-[80px] text-center">{r.name}</p>
                  </div>
                ))}

                {/* Upload tile */}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending}
                  className="w-20 h-20 border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-ring hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {upload.isPending
                    ? <Loader2 size={16} className="animate-spin" />
                    : state.inputResources.length === 0 ? <Upload size={16} /> : <Plus size={16} />
                  }
                  <span className="text-[10px]">{upload.isPending ? t('canvas.nodePanel.uploading') : t('shared.attachments.upload')}</span>
                </button>
              </div>
              {state.inputResources.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-2">{t('tools.page.selectFromLeft')}</p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
            />

            {/* Prompt */}
            {!def.hidePrompt && (
              <div className="p-3 border-b border-border">
                <Textarea
                  rows={3}
                  placeholder={def.promptPlaceholder ?? t('shared.generation.promptPlaceholder')}
                  value={state.prompt}
                  onChange={(e) => update({ prompt: e.target.value })}
                  className="resize-none text-sm"
                />
              </div>
            )}

            {/* Actions row */}
            <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
              <select
                className="border border-border rounded px-2 py-1.5 text-xs bg-background text-foreground"
                value={state.modelDbId || models[0]?.id || ''}
                onChange={(e) => update({ modelDbId: Number(e.target.value) })}
              >
                {models.map((m) => <option key={m.id} value={m.id}>{publicModelLabel(m)}</option>)}
                {models.length === 0 && <option value="">{t('shared.modelSelector.noModels')}</option>}
              </select>
              <div className="flex-1" />
              <Button
                onClick={run}
                disabled={
                  isRunning ||
                  (def.promptRequired !== false && !state.prompt.trim()) ||
                  (def.inputRequired === true && state.inputResources.length === 0) ||
                  models.length === 0
                }
                className="rounded-full"
              >
                {isRunning
                  ? <><Loader2 size={13} className="animate-spin mr-2" />{t('canvas.generating')}</>
                  : <><Wand2 size={13} className="mr-2" />{t('canvas.run')}</>
                }
              </Button>
            </div>
          </div>

          {/* ── Output card ── */}
          {state.status !== 'idle' && (
            <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">{t('tools.page.result')}</p>
              </div>
              <div className="bg-card min-h-[80px]">
                {isRunning && (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 size={24} className="animate-spin" />
                      <p className="text-xs">{state.status === 'pending' ? t('canvas.waitingStart') : t('canvas.generating')}</p>
                    </div>
                  </div>
                )}
                {!isRunning && state.status === 'failed' && (
                  <div className="flex items-center justify-center py-8 gap-2 text-destructive">
                    <AlertCircle size={16} />
                    <p className="text-sm">{state.error ?? t('canvas.generationFailed')}</p>
                  </div>
                )}
                {!isRunning && state.status === 'done' && outputSrc && (
                  <div className="relative">
                    {def.outputType === 'image' ? (
                      state.outputResource?.direct_url
                        ? <img src={outputSrc} alt={t('shared.generation.resultAlt')} className="w-full max-h-[480px] object-contain" />
                        : <AuthedImage src={outputSrc} alt={t('shared.generation.resultAlt')} className="w-full max-h-[480px] object-contain" />
                    ) : (
                      state.outputResource?.direct_url
                        ? <video src={outputSrc} controls className="w-full max-h-[480px]" />
                        : <AuthedVideo src={outputSrc} controls className="w-full max-h-[480px]" />
                    )}
                    <a
                      href={outputSrc}
                      download={state.outputResource?.name}
                      className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-foreground/80 text-background px-3 py-1.5 rounded-full text-xs hover:bg-foreground backdrop-blur-sm transition-colors"
                    >
                      <Download size={12} /> {t('shared.mediaViewer.download')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
