import type { ShotStatus } from '@/types'

export const SHOT_STATUS_LABEL_KEYS: Record<ShotStatus, string> = {
  draft: 'domain.shotStatus.draft',
  prompt_ready: 'domain.shotStatus.prompt_ready',
  generating: 'domain.shotStatus.generating',
  generated: 'domain.shotStatus.generated',
  approved: 'domain.shotStatus.approved',
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

export const SHOT_SIZE_OPTIONS = [
  { value: 'close_up', label: '特写' },
  { value: 'near', label: '近景' },
  { value: 'medium', label: '中景' },
  { value: 'full', label: '全景' },
  { value: 'wide', label: '远景' },
  { value: 'extreme_wide', label: '大远景' },
]

export const SHOT_ANGLE_OPTIONS = [
  { value: 'eye_level', label: '平视' },
  { value: 'overhead', label: '俯拍' },
  { value: 'low_angle', label: '仰拍' },
  { value: 'side', label: '侧拍' },
  { value: 'top', label: '顶拍' },
  { value: 'dutch', label: '荷兰倾斜' },
]

export const SHOT_MOVEMENT_OPTIONS = [
  { value: 'push', label: '推' },
  { value: 'pull', label: '拉' },
  { value: 'pan', label: '摇' },
  { value: 'dolly', label: '移' },
  { value: 'follow', label: '跟拍' },
  { value: 'crane', label: '升降' },
  { value: 'handheld', label: '手持' },
  { value: 'static', label: '静止' },
]

export const SHOT_FOCAL_LENGTH_OPTIONS = [
  { value: 'wide', label: '广角' },
  { value: 'standard', label: '标准' },
  { value: 'telephoto', label: '长焦' },
]

export const SHOT_PACING_OPTIONS = [
  { value: 'fast_cut', label: '快切' },
  { value: 'long_take', label: '长镜头' },
  { value: 'pause', label: '停顿镜头' },
]
