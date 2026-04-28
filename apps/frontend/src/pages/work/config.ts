import { FileText, Image, Film, Clapperboard, Layers, Camera, Video, Users } from 'lucide-react'

export type EntityKind = 'script' | 'setting' | 'asset' | 'episode' | 'scene' | 'storyboard' | 'shot' | 'final_video'
export type WorkArtifactKind = EntityKind

export const KIND_CONFIG: Record<EntityKind, {
  labelKey: string
  icon: typeof FileText
  color: string       // icon color (inactive)
  activeColor: string // icon color (active)
  accent: string      // background accent (active tab)
  accentSoft: string  // soft background (active tab bg)
}> = {
  script:     { labelKey: 'entities.scripts', icon: FileText,    color: 'text-muted-foreground', activeColor: 'text-sky-600',     accent: 'bg-sky-500',    accentSoft: 'bg-sky-500/10' },
  setting:    { labelKey: 'entities.settings', icon: Users,       color: 'text-muted-foreground', activeColor: 'text-teal-600',    accent: 'bg-teal-500',   accentSoft: 'bg-teal-500/10' },
  asset:      { labelKey: 'entities.assets', icon: Image,       color: 'text-muted-foreground', activeColor: 'text-emerald-600', accent: 'bg-emerald-500', accentSoft: 'bg-emerald-500/10' },
  episode:    { labelKey: 'entities.episodes', icon: Film,        color: 'text-muted-foreground', activeColor: 'text-violet-600',  accent: 'bg-violet-500', accentSoft: 'bg-violet-500/10' },
  scene:      { labelKey: 'entities.scenes', icon: Clapperboard, color: 'text-muted-foreground', activeColor: 'text-blue-600',   accent: 'bg-blue-500',   accentSoft: 'bg-blue-500/10' },
  storyboard: { labelKey: 'entities.storyboards', icon: Layers,      color: 'text-muted-foreground', activeColor: 'text-indigo-600',  accent: 'bg-indigo-500', accentSoft: 'bg-indigo-500/10' },
  shot:       { labelKey: 'entities.shots', icon: Camera,      color: 'text-muted-foreground', activeColor: 'text-orange-600',  accent: 'bg-orange-500', accentSoft: 'bg-orange-500/10' },
  final_video:{ labelKey: 'entities.finalVideos', icon: Video,       color: 'text-muted-foreground', activeColor: 'text-rose-600',    accent: 'bg-rose-500',   accentSoft: 'bg-rose-500/10' },
}

export const WORK_ARTIFACT_KINDS: WorkArtifactKind[] = ['script', 'episode', 'scene', 'setting', 'asset', 'storyboard', 'shot', 'final_video']

export const ASSET_COLORS: Record<string, string> = {
  character: 'bg-muted text-muted-foreground',
  scene:     'bg-muted text-muted-foreground',
  prop:      'bg-muted text-muted-foreground',
}
export const TIME_COLORS: Record<string, string> = {
  day:   'bg-muted text-muted-foreground',
  night: 'bg-muted text-muted-foreground',
  dawn:  'bg-muted text-muted-foreground',
  dusk:  'bg-muted text-muted-foreground',
}
