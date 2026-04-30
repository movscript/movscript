import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Episode, Script } from '@/types'
import { Save, Sparkles, Loader2, ListTree, Tags, ZoomIn, ZoomOut } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { api } from '@/lib/api'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { EntitySemanticForm } from '@/components/detail/EntitySemanticForm'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
}

type ScriptPointType = 'hook' | 'reversal' | 'conflict' | 'release' | 'none'

interface ScriptPoint {
  id: string
  content: string
  beat_type: ScriptPointType
  tags: string[]
}

const BEAT_TYPES: { value: ScriptPointType; labelKey: string; color: string }[] = [
  { value: 'hook', labelKey: 'details.pointTypes.hook', color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  { value: 'reversal', labelKey: 'details.pointTypes.reversal', color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300' },
  { value: 'conflict', labelKey: 'details.pointTypes.conflict', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  { value: 'release', labelKey: 'details.pointTypes.release', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { value: 'none', labelKey: 'details.pointTypes.none', color: 'bg-muted text-muted-foreground' },
]

const STRUCTURE_BEATS = BEAT_TYPES.filter((type) => type.value !== 'none')

interface ScriptFormProps {
  script: Script
  projectId?: number
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
  analyzing?: boolean
  onAnalyze?: () => void
}

function splitTags(value: string) {
  return value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean)
}

function buildPointsFromContent(content?: string): ScriptPoint[] {
  const blocks = (content ?? '')
    .split(/\n{2,}|\n(?=\s*(第.{1,8}[场幕集]|[0-9]+[.、]))/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block, index) => ({
    id: `p${index + 1}`,
    content: block.length > 120 ? `${block.slice(0, 120)}...` : block,
    beat_type: 'none' as ScriptPointType,
    tags: [],
  }))
}

function parseScriptPoints(raw?: string, content?: string): ScriptPoint[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          id: typeof item?.id === 'string' ? item.id : `p${index + 1}`,
          content: typeof item?.content === 'string' ? item.content : '',
          beat_type: BEAT_TYPES.some((type) => type.value === item?.beat_type) ? item.beat_type : 'none',
          tags: Array.isArray(item?.tags) ? item.tags.map(String).filter(Boolean) : splitTags(String(item?.tags ?? '')),
        }))
      }
    } catch {
      // Fall back to content-derived points.
    }
  }
  return buildPointsFromContent(content)
}

function serializeScriptPoints(points: ScriptPoint[]) {
  return JSON.stringify(points.map((point, index) => ({
    ...point,
    id: point.id || `p${index + 1}`,
    tags: point.tags.filter(Boolean),
  })))
}

function EpisodeScriptEditor({
  draft,
  onChange,
  contentField,
}: {
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  contentField: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(100)
  const [tagsOnly, setTagsOnly] = useState(false)
  const points = parseScriptPoints(draft.script_points, draft.content)

  function savePoints(next: ScriptPoint[]) {
    onChange({ ...draft, script_points: serializeScriptPoints(next) })
  }

  function updatePoint(index: number, patch: Partial<ScriptPoint>) {
    const next = points.slice()
    next[index] = { ...next[index], ...patch }
    savePoints(next)
  }

  function regeneratePoints() {
    savePoints(buildPointsFromContent(draft.content))
  }

  const orderedTags = points.flatMap((point, index) => {
    const beat = BEAT_TYPES.find((type) => type.value === point.beat_type)
    const tags = point.tags.length > 0 ? point.tags : point.beat_type !== 'none' ? [t(beat?.labelKey ?? 'details.pointTypes.none')] : []
    return tags.map((tag) => ({ tag, index, beat }))
  })

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListTree size={14} />
            <span>{t('details.episodeBodyWorkspace')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTagsOnly((value) => !value)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                tagsOnly ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Tags size={13} />
              {t('details.tagsOnly')}
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(80, value - 10))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('details.zoomOut')}
            >
              <ZoomOut size={13} />
            </button>
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(160, value + 10))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('details.zoomIn')}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        {tagsOnly ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-2">
              {orderedTags.length > 0 ? orderedTags.map((item, index) => (
                <div key={`${item.index}-${item.tag}-${index}`} className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                  <span className="font-mono text-muted-foreground">#{item.index + 1}</span>
                  <span className={cn('rounded px-1.5 py-0.5', item.beat?.color ?? 'bg-muted text-muted-foreground')}>
                    {item.tag}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">{t('details.noPointTags')}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('details.scriptBody')}</Label>
            <Textarea
              className="min-h-[520px] flex-1 resize-none font-mono leading-relaxed"
              style={{ fontSize: `${zoom}%` }}
              placeholder={t('details.scriptBodyPlaceholder')}
              value={draft.content ?? ''}
              onChange={contentField}
            />
          </div>
        )}
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{t('details.structureSidebar')}</p>
            <button
              type="button"
              onClick={regeneratePoints}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t('details.generatePoints')}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-border p-3">
            <p className="mb-2 text-[11px] font-medium uppercase text-muted-foreground">{t('details.beatPositions')}</p>
            <div className="space-y-2">
              {STRUCTURE_BEATS.map((beat) => {
                const matched = points
                  .map((point, index) => ({ point, index }))
                  .filter((item) => item.point.beat_type === beat.value)
                return (
                  <div key={beat.value} className="flex items-start gap-2 text-xs">
                    <span className={cn('mt-0.5 rounded px-1.5 py-0.5', beat.color)}>{t(beat.labelKey)}</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {matched.length > 0 ? matched.map((item) => `#${item.index + 1}`).join(' / ') : t('details.notMarked')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="divide-y divide-border">
            {points.length > 0 ? points.map((point, index) => {
              const beat = BEAT_TYPES.find((type) => type.value === point.beat_type)
              return (
                <div key={point.id || index} className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
                    <select
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                      value={point.beat_type}
                      onChange={(event) => updatePoint(index, { beat_type: event.target.value as ScriptPointType })}
                    >
                      {BEAT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{t(type.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <Textarea
                    className="resize-none text-xs"
                    rows={3}
                    value={point.content}
                    onChange={(event) => updatePoint(index, { content: event.target.value })}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder={t('details.pointTagsPlaceholder')}
                    value={point.tags.join('，')}
                    onChange={(event) => updatePoint(index, { tags: splitTags(event.target.value) })}
                  />
                  <div className="flex flex-wrap gap-1">
                    {point.beat_type !== 'none' && (
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px]', beat?.color)}>{t(beat?.labelKey ?? 'details.pointTypes.none')}</span>
                    )}
                    {point.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </div>
              )
            }) : (
              <div className="p-4 text-xs text-muted-foreground">{t('details.noScriptPoints')}</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

export function ScriptForm({ script, projectId, draft, onChange, onSave, isSaving, analyzing, onAnalyze }: ScriptFormProps) {
  const { t } = useTranslation()
  const isMain = script.script_type === 'main'
  const isEpisode = script.script_type === 'episode'
  const isScene = script.script_type === 'scene'
  function field<K extends keyof Script>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...draft, [key]: e.target.value })
  }

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId && (isEpisode || isScene),
  })

  return (
    <Tabs defaultValue="content" className="flex h-full flex-col overflow-hidden">
      <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-background px-0 h-auto py-0">
        {onAnalyze && (
          <div className="ml-auto pr-3 flex items-center">
            <button
              onClick={onAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {t('details.aiAnalyze')}
            </button>
          </div>
        )}
        <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
          {t('details.contentManagement')}
        </TabsTrigger>
        <TabsTrigger value="plot" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
          {t('details.scriptBody')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="content" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <EntitySemanticForm
          kind="script"
          ownerType="script"
          ownerId={script.ID}
          draft={draft}
          onChange={(next) => onChange(next as Partial<Script>)}
          onSave={(payload) => onSave(payload as Partial<Script>)}
          isSaving={isSaving}
          excludeFields={isMain
            ? ['result', 'attachment', 'content', 'characters', 'character_profiles', 'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary', 'script_points']
            : ['result', 'attachment', 'content', 'characters', 'character_profiles', 'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary', 'script_points']}
          renderAfter={(
            <>
              {(isEpisode || isScene) && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEpisode ? t('details.episodeSpecific') : t('details.sceneSpecific')}</p>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">
                  {isEpisode ? t('forms.parentEpisodeRequired') : t('forms.parentEpisodeOptional')}
                </Label>
                <select
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                  value={draft.episode_id ?? ''}
                  onChange={(e) => onChange({ ...draft, episode_id: Number(e.target.value) || undefined })}
                >
                  <option value="">{isEpisode ? t('forms.selectEpisodeFirst') : t('forms.unlinked')}</option>
                  {episodes.map((episode) => (
                    <option key={episode.ID} value={episode.ID}>EP{episode.number} {episode.title}</option>
                  ))}
                </select>
              </div>
              {isEpisode && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.episodeOrder')}</Label>
                    <Input type="number" value={draft.order ?? ''} onChange={(e) => onChange({ ...draft, order: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.hook')}</Label>
                    <Textarea className="resize-none" rows={2} placeholder={t('details.episodeHookPlaceholder')} value={draft.hook ?? ''} onChange={field('hook')} />
                  </div>
                </div>
              )}
              {isEpisode && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.plotSummary')}</Label>
                  <Textarea className="resize-none" rows={3} placeholder={t('details.plotSummaryPlaceholder')} value={draft.plot_summary ?? ''} onChange={field('plot_summary')} />
                </div>
              )}
              {isScene && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.hook')}</Label>
                  <Textarea className="resize-none" rows={2} placeholder={t('details.sceneHookPlaceholder')} value={draft.hook ?? ''} onChange={field('hook')} />
                </div>
              )}
            </div>
              )}
              <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.attachments')}</Label>
            <ResourceAttachments
              ownerType="script"
              ownerId={script.ID}
              role="attachment"
            />
              </div>
            </>
          )}
        />
      </TabsContent>

      <TabsContent value="plot" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <div className="h-full min-h-0 flex flex-col">
          {isEpisode ? (
            <EpisodeScriptEditor draft={draft} onChange={onChange} contentField={field('content')} />
          ) : (
            <div className="p-5 space-y-4 flex-1 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.scriptBody')}</Label>
                <Textarea
                  className="flex-1 font-mono resize-none min-h-[400px]"
                  placeholder={t('details.scriptBodyPlaceholder')}
                  value={draft.content ?? ''}
                  onChange={field('content')}
                />
              </div>
            </div>
          )}
          <div className="pt-1 border-t border-border">
            <Button onClick={() => onSave(draft)} disabled={isSaving} className="m-3 gap-1.5">
              <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
