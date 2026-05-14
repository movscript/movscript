import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Camera,
  Clapperboard,
  Film,
  ImagePlus,
  Layers3,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'
import { ResourcePanel } from '@/components/shared/ResourcePanel'
import { MediaViewer } from '@/components/shared/MediaViewer'

type AssetBucket = 'characters' | 'scenes' | 'storyboard'

interface StoryboardBeat {
  id: string
  title: string
  emotion: string
  shot: string
  note: string
}

const EMOTION_PRESETS = ['calm', 'tense', 'joy', 'fear', 'lonely', 'hopeful'] as const
const SHOT_SIZES = ['closeUp', 'medium', 'wide', 'overShoulder'] as const
const CAMERA_MOVES = ['static', 'pushIn', 'tracking', 'handheld'] as const
const LENSES = ['wide', 'standard', 'telephoto'] as const
const RHYTHMS = ['slow', 'balanced', 'fast'] as const

function createBeat(index: number): StoryboardBeat {
  return {
    id: Math.random().toString(36).slice(2, 10),
    title: `Shot ${index}`,
    emotion: index === 1 ? '克制的紧张' : index === 2 ? '情绪推进' : '情绪落点',
    shot: index === 1 ? '中近景 / 轻微推近' : index === 2 ? '反打 / 手持轻晃' : '特写 / 静止',
    note: index === 1 ? '人物进入场景，压低视线。' : index === 2 ? '表情从迟疑转为确认。' : '停留在眼神和环境反应上。',
  }
}

export default function SmartStoryboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeBucket, setActiveBucket] = useState<AssetBucket>('characters')
  const [characters, setCharacters] = useState<RawResource[]>([])
  const [scenes, setScenes] = useState<RawResource[]>([])
  const [storyboardRefs, setStoryboardRefs] = useState<RawResource[]>([])
  const [emotion, setEmotion] = useState<(typeof EMOTION_PRESETS)[number]>('tense')
  const [intensity, setIntensity] = useState(65)
  const [shotSize, setShotSize] = useState<(typeof SHOT_SIZES)[number]>('medium')
  const [cameraMove, setCameraMove] = useState<(typeof CAMERA_MOVES)[number]>('pushIn')
  const [lens, setLens] = useState<(typeof LENSES)[number]>('standard')
  const [rhythm, setRhythm] = useState<(typeof RHYTHMS)[number]>('balanced')
  const [expression, setExpression] = useState('')
  const [beats, setBeats] = useState<StoryboardBeat[]>([createBeat(1), createBeat(2), createBeat(3)])

  const selectedIds = useMemo(
    () => [...characters, ...scenes, ...storyboardRefs].map((resource) => resource.ID),
    [characters, scenes, storyboardRefs]
  )
  const bucketCounts = {
    characters: characters.length,
    scenes: scenes.length,
    storyboard: storyboardRefs.length,
  }
  const canDraft = characters.length > 0 && scenes.length > 0

  function addResource(resource: RawResource) {
    const appendUnique = (items: RawResource[]) =>
      items.some((item) => item.ID === resource.ID) ? items : [...items, resource]

    if (activeBucket === 'characters') setCharacters(appendUnique)
    if (activeBucket === 'scenes') setScenes(appendUnique)
    if (activeBucket === 'storyboard') setStoryboardRefs(appendUnique)
  }

  function removeResource(bucket: AssetBucket, id: number) {
    if (bucket === 'characters') setCharacters((items) => items.filter((item) => item.ID !== id))
    if (bucket === 'scenes') setScenes((items) => items.filter((item) => item.ID !== id))
    if (bucket === 'storyboard') setStoryboardRefs((items) => items.filter((item) => item.ID !== id))
  }

  function updateBeat(id: string, patch: Partial<StoryboardBeat>) {
    setBeats((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title={t('common.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-medium text-muted-foreground">{t('sidebar.sections.tools')}</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-semibold text-foreground">{t('sidebar.items.smartStoryboard')}</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-[332px] shrink-0 flex-col border-r border-border bg-background">
          <div className="border-b border-border p-3">
            <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
              <BucketButton
                active={activeBucket === 'characters'}
                icon={UserRound}
                label={t('tools.smartStoryboard.buckets.characters')}
                count={bucketCounts.characters}
                onClick={() => setActiveBucket('characters')}
              />
              <BucketButton
                active={activeBucket === 'scenes'}
                icon={Layers3}
                label={t('tools.smartStoryboard.buckets.scenes')}
                count={bucketCounts.scenes}
                onClick={() => setActiveBucket('scenes')}
              />
              <BucketButton
                active={activeBucket === 'storyboard'}
                icon={Clapperboard}
                label={t('tools.smartStoryboard.buckets.storyboard')}
                count={bucketCounts.storyboard}
                onClick={() => setActiveBucket('storyboard')}
              />
            </div>
          </div>
          <ResourcePanel inputType="image" selectedIds={selectedIds} onSelect={addResource} />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_360px] gap-4">
            <div className="space-y-4">
              <section className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h1 className="text-base font-semibold text-foreground">{t('tools.smartStoryboard.title')}</h1>
                    <p className="mt-1 text-xs text-muted-foreground">{t('tools.smartStoryboard.subtitle')}</p>
                  </div>
                  <Button size="sm" disabled={!canDraft} className="shrink-0">
                    <Wand2 size={14} />
                    {t('tools.smartStoryboard.generate')}
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <AssetDropZone
                    title={t('tools.smartStoryboard.buckets.characters')}
                    icon={UserRound}
                    bucket="characters"
                    items={characters}
                    active={activeBucket === 'characters'}
                    emptyLabel={t('tools.smartStoryboard.empty.characters')}
                    onActivate={setActiveBucket}
                    onRemove={removeResource}
                  />
                  <AssetDropZone
                    title={t('tools.smartStoryboard.buckets.scenes')}
                    icon={Layers3}
                    bucket="scenes"
                    items={scenes}
                    active={activeBucket === 'scenes'}
                    emptyLabel={t('tools.smartStoryboard.empty.scenes')}
                    onActivate={setActiveBucket}
                    onRemove={removeResource}
                  />
                  <AssetDropZone
                    title={t('tools.smartStoryboard.buckets.storyboard')}
                    icon={Clapperboard}
                    bucket="storyboard"
                    items={storyboardRefs}
                    active={activeBucket === 'storyboard'}
                    emptyLabel={t('tools.smartStoryboard.empty.storyboard')}
                    onActivate={setActiveBucket}
                    onRemove={removeResource}
                  />
                </div>
              </section>

              <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles size={15} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">{t('tools.smartStoryboard.emotion.title')}</h2>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {EMOTION_PRESETS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setEmotion(item)}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-xs transition-colors',
                          emotion === item
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        {t(`tools.smartStoryboard.emotion.presets.${item}`)}
                      </button>
                    ))}
                  </div>

                  <label className="mb-4 block">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">{t('tools.smartStoryboard.emotion.intensity')}</span>
                      <span className="font-mono text-muted-foreground">{intensity}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={intensity}
                      onChange={(event) => setIntensity(Number(event.target.value))}
                      className="w-full accent-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-muted-foreground">
                      {t('tools.smartStoryboard.emotion.expression')}
                    </span>
                    <textarea
                      value={expression}
                      onChange={(event) => setExpression(event.target.value)}
                      placeholder={t('tools.smartStoryboard.emotion.placeholder')}
                      className="min-h-[104px] w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Camera size={15} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">{t('tools.smartStoryboard.camera.title')}</h2>
                  </div>
                  <ControlGroup title={t('tools.smartStoryboard.camera.shotSize')}>
                    <SegmentedValue value={shotSize} values={SHOT_SIZES} translationPrefix="tools.smartStoryboard.camera.shotSizes" onChange={setShotSize} />
                  </ControlGroup>
                  <ControlGroup title={t('tools.smartStoryboard.camera.move')}>
                    <SegmentedValue value={cameraMove} values={CAMERA_MOVES} translationPrefix="tools.smartStoryboard.camera.moves" onChange={setCameraMove} />
                  </ControlGroup>
                  <ControlGroup title={t('tools.smartStoryboard.camera.lens')}>
                    <SegmentedValue value={lens} values={LENSES} translationPrefix="tools.smartStoryboard.camera.lenses" onChange={setLens} />
                  </ControlGroup>
                  <ControlGroup title={t('tools.smartStoryboard.camera.rhythm')}>
                    <SegmentedValue value={rhythm} values={RHYTHMS} translationPrefix="tools.smartStoryboard.camera.rhythms" onChange={setRhythm} />
                  </ControlGroup>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Film size={15} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">{t('tools.smartStoryboard.beats.title')}</h2>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setBeats((items) => [...items, createBeat(items.length + 1)])}
                  >
                    <Plus size={13} />
                    {t('common.add')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {beats.map((beat, index) => (
                    <div key={beat.id} className="grid grid-cols-[56px_minmax(0,1fr)_120px] gap-3 rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex h-20 items-center justify-center rounded-md bg-background text-xs font-semibold text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={beat.title}
                          onChange={(event) => updateBeat(beat.id, { title: event.target.value })}
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                          aria-label={t('tools.smartStoryboard.beats.fields.title')}
                        />
                        <input
                          value={beat.shot}
                          onChange={(event) => updateBeat(beat.id, { shot: event.target.value })}
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                          aria-label={t('tools.smartStoryboard.beats.fields.shot')}
                        />
                        <input
                          value={beat.emotion}
                          onChange={(event) => updateBeat(beat.id, { emotion: event.target.value })}
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                          aria-label={t('tools.smartStoryboard.beats.fields.emotion')}
                        />
                        <input
                          value={beat.note}
                          onChange={(event) => updateBeat(beat.id, { note: event.target.value })}
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                          aria-label={t('tools.smartStoryboard.beats.fields.note')}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setBeats((items) => items.filter((item) => item.id !== beat.id))}
                          disabled={beats.length <= 1}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                          title={t('common.delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ImagePlus size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{t('tools.smartStoryboard.preview.title')}</h2>
                </div>
                <div className="space-y-3">
                  {beats.slice(0, 4).map((beat, index) => (
                    <PreviewFrame
                      key={beat.id}
                      index={index}
                      beat={beat}
                      character={characters[index % Math.max(characters.length, 1)]}
                      scene={scenes[index % Math.max(scenes.length, 1)]}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-background p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">{t('tools.smartStoryboard.prompt.title')}</h2>
                <div className="rounded-md bg-muted/40 p-3 text-xs leading-5 text-foreground">
                  <p>{t(`tools.smartStoryboard.emotion.presets.${emotion}`)} · {intensity}</p>
                  <p>{t(`tools.smartStoryboard.camera.shotSizes.${shotSize}`)} · {t(`tools.smartStoryboard.camera.moves.${cameraMove}`)}</p>
                  <p>{t(`tools.smartStoryboard.camera.lenses.${lens}`)} · {t(`tools.smartStoryboard.camera.rhythms.${rhythm}`)}</p>
                  {expression.trim() && <p className="mt-2 text-muted-foreground">{expression.trim()}</p>}
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

function BucketButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: typeof UserRound
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon size={13} className="shrink-0" />
      <span className="truncate">{label}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
    </button>
  )
}

function AssetDropZone({
  title,
  icon: Icon,
  bucket,
  items,
  active,
  emptyLabel,
  onActivate,
  onRemove,
}: {
  title: string
  icon: typeof UserRound
  bucket: AssetBucket
  items: RawResource[]
  active: boolean
  emptyLabel: string
  onActivate: (bucket: AssetBucket) => void
  onRemove: (bucket: AssetBucket, id: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onActivate(bucket)}
      className={cn(
        'min-h-[164px] rounded-lg border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/40'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
          <Icon size={14} className="shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
        <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="flex h-[104px] items-center justify-center rounded-md border border-dashed border-border bg-background/70 px-3 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.slice(0, 6).map((item) => (
            <div key={item.ID} className="group relative aspect-square overflow-hidden rounded-md bg-background">
              <MediaViewer resource={item} className="h-full w-full rounded-md" lightbox={false} />
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(bucket, item.ID)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    onRemove(bucket, item.ID)
                  }
                }}
                className="absolute right-1 top-1 hidden size-5 items-center justify-center rounded bg-background/90 text-muted-foreground shadow-sm group-hover:flex"
              >
                <X size={12} />
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function SegmentedValue<T extends string>({
  value,
  values,
  translationPrefix,
  onChange,
}: {
  value: T
  values: readonly T[]
  translationPrefix: string
  onChange: (value: T) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-1">
      {values.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            'rounded-md border px-2 py-1.5 text-xs transition-colors',
            value === item
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          {t(`${translationPrefix}.${item}`)}
        </button>
      ))}
    </div>
  )
}

function PreviewFrame({
  index,
  beat,
  character,
  scene,
}: {
  index: number
  beat: StoryboardBeat
  character?: RawResource
  scene?: RawResource
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="relative aspect-video bg-background">
        {scene ? (
          <MediaViewer resource={scene} className="h-full w-full rounded-none" lightbox={false} />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--muted))_0%,hsl(var(--background))_55%,hsl(var(--muted))_100%)]" />
        )}
        <div className="absolute inset-0 bg-black/20" />
        {character && (
          <div className="absolute bottom-3 left-3 size-16 overflow-hidden rounded-md border border-white/30 bg-background shadow-md">
            <MediaViewer resource={character} className="h-full w-full rounded-none" lightbox={false} />
          </div>
        )}
        <div className="absolute left-3 top-3 rounded bg-background/90 px-2 py-1 font-mono text-[10px] text-foreground shadow-sm">
          KF-{String(index + 1).padStart(2, '0')}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-foreground">{beat.title}</p>
          <p className="shrink-0 text-[10px] text-muted-foreground">{beat.emotion}</p>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{beat.shot}</p>
      </div>
    </div>
  )
}
