import { ENTITY_KIND_META } from '@/components/entity/EntitySurface'

export type EntityKind = 'script' | 'setting' | 'asset' | 'episode' | 'scene' | 'storyboard' | 'shot' | 'final_video'
export type WorkArtifactKind = EntityKind

export const KIND_CONFIG = ENTITY_KIND_META

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
