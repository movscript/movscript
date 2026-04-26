import { FileText, Image, Film, Clapperboard, Layers, Camera } from 'lucide-react'

export type EntityKind = 'script' | 'asset' | 'episode' | 'scene' | 'storyboard' | 'shot'

export const KIND_CONFIG: Record<EntityKind, {
  label: string
  icon: typeof FileText
  color: string       // icon color (inactive)
  activeColor: string // icon color (active)
  accent: string      // background accent (active tab)
  accentSoft: string  // soft background (active tab bg)
}> = {
  script:     { label: '剧本', icon: FileText,    color: 'text-muted-foreground', activeColor: 'text-sky-600',     accent: 'bg-sky-500',    accentSoft: 'bg-sky-500/10' },
  asset:      { label: '素材', icon: Image,       color: 'text-muted-foreground', activeColor: 'text-emerald-600', accent: 'bg-emerald-500', accentSoft: 'bg-emerald-500/10' },
  episode:    { label: '分集', icon: Film,        color: 'text-muted-foreground', activeColor: 'text-violet-600',  accent: 'bg-violet-500', accentSoft: 'bg-violet-500/10' },
  scene:      { label: '分场', icon: Clapperboard, color: 'text-muted-foreground', activeColor: 'text-blue-600',   accent: 'bg-blue-500',   accentSoft: 'bg-blue-500/10' },
  storyboard: { label: '分镜', icon: Layers,      color: 'text-muted-foreground', activeColor: 'text-indigo-600',  accent: 'bg-indigo-500', accentSoft: 'bg-indigo-500/10' },
  shot:       { label: '镜头', icon: Camera,      color: 'text-muted-foreground', activeColor: 'text-orange-600',  accent: 'bg-orange-500', accentSoft: 'bg-orange-500/10' },
}

export const SCRIPT_TYPES = [
  { type: 'main',    label: '总剧本',   color: 'bg-primary text-primary-foreground' },
  { type: 'episode', label: '分集剧本', color: 'bg-primary text-primary-foreground' },
  { type: 'scene',   label: '分场剧本', color: 'bg-primary text-primary-foreground' },
]
export const SCRIPT_TYPE_MAP = Object.fromEntries(SCRIPT_TYPES.map((t) => [t.type, t]))

export const ASSET_COLORS: Record<string, string> = {
  character: 'bg-muted text-muted-foreground',
  scene:     'bg-muted text-muted-foreground',
  prop:      'bg-muted text-muted-foreground',
}
export const ASSET_LABELS: Record<string, string> = {
  character: '角色', scene: '场景', prop: '道具',
}

export const TIME_LABELS: Record<string, string> = {
  day: '白天', night: '夜晚', dawn: '黎明', dusk: '黄昏',
}
export const TIME_COLORS: Record<string, string> = {
  day:   'bg-muted text-muted-foreground',
  night: 'bg-muted text-muted-foreground',
  dawn:  'bg-muted text-muted-foreground',
  dusk:  'bg-muted text-muted-foreground',
}
