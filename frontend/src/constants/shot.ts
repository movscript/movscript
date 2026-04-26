import type { ShotStatus } from '@/types'

export const SHOT_STATUS_LABELS: Record<ShotStatus, string> = {
  draft: '草稿',
  prompt_ready: '就绪',
  generating: '生成中',
  generated: '已生成',
  approved: '已通过',
}

export const SHOT_STATUS_COLORS: Record<ShotStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  prompt_ready: 'bg-muted text-muted-foreground',
  generating: 'bg-muted text-muted-foreground',
  generated: 'bg-muted text-muted-foreground',
  approved: 'bg-primary text-primary-foreground',
}

export const SHOT_STATUS_NEXT: Record<ShotStatus, ShotStatus | null> = {
  draft: 'prompt_ready',
  prompt_ready: 'generating',
  generating: 'generated',
  generated: 'approved',
  approved: null,
}

export const SHOT_STATUS_STEPS: ShotStatus[] = [
  'draft', 'prompt_ready', 'generating', 'generated', 'approved',
]
