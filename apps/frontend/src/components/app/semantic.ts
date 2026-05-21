import { cn } from '@/lib/utils'

export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
type SemanticTonePart = 'badge' | 'dot' | 'icon' | 'surface'

const TONE_CLASSES: Record<SemanticTone, Record<SemanticTonePart, string>> = {
  neutral: {
    badge: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/45',
    icon: 'text-muted-foreground',
    surface: 'border-border bg-muted/30',
  },
  info: {
    badge: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    icon: 'text-sky-600 dark:text-sky-300',
    surface: 'border-sky-500/20 bg-sky-500/10',
  },
  success: {
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-600 dark:text-emerald-300',
    surface: 'border-emerald-500/20 bg-emerald-500/10',
  },
  warning: {
    badge: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: 'text-amber-600 dark:text-amber-300',
    surface: 'border-amber-500/25 bg-amber-500/10',
  },
  danger: {
    badge: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    icon: 'text-rose-600 dark:text-rose-300',
    surface: 'border-rose-500/25 bg-rose-500/10',
  },
}

const STATUS_TONES: Record<string, SemanticTone> = {
  active: 'success',
  approved: 'success',
  attached: 'success',
  confirmed: 'success',
  delivered: 'success',
  done: 'success',
  locked: 'success',
  accepted: 'success',
  selected: 'success',
  candidate: 'info',
  corrected: 'info',
  generated: 'info',
  in_progress: 'info',
  previewing: 'info',
  producing: 'info',
  running: 'info',
  draft: 'neutral',
  ignored: 'neutral',
  merged: 'neutral',
  planning: 'neutral',
  waiting: 'warning',
  asset_prep: 'warning',
  blocked: 'danger',
  failed: 'danger',
  materializing: 'warning',
  missing: 'warning',
  pending: 'warning',
  review: 'warning',
  reviewing: 'warning',
  rejected: 'danger',
}

const STATUS_LABELS: Record<string, string> = {
  accepted: '已采纳',
  active: '进行中',
  approved: '通过',
  asset_prep: '素材准备',
  attached: '已关联',
  blocked: '阻塞',
  candidate: '候选',
  confirmed: '已确认',
  corrected: '已修正',
  delivered: '已成片',
  done: '已完成',
  draft: '草稿',
  failed: '失败',
  generated: '已生成',
  ignored: '忽略',
  in_progress: '进行中',
  locked: '已锁定',
  materializing: '资料推演',
  merged: '已合并',
  missing: '缺失',
  pending: '待处理',
  planning: '筹备中',
  previewing: '预览中',
  producing: '制作中',
  rejected: '拒绝',
  review: '待审',
  reviewing: '审片中',
  running: '运行中',
  selected: '已选择',
  waiting: '待处理',
}

export function semanticToneForStatus(status?: string | null): SemanticTone {
  if (!status) return 'neutral'
  return STATUS_TONES[status] ?? 'neutral'
}

export function semanticStatusLabel(status?: string | null): string {
  if (!status) return '未知'
  return STATUS_LABELS[status] ?? status
}

export function semanticToneClass(tone: SemanticTone, part: SemanticTonePart) {
  return TONE_CLASSES[tone][part]
}

export function semanticStatusClass(status: string | undefined | null, part: SemanticTonePart, className?: string) {
  return cn(semanticToneClass(semanticToneForStatus(status), part), className)
}
