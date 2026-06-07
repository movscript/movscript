import type { LucideIcon } from 'lucide-react'

export interface ProductionWorkspaceReviewPreviewIssue {
  message: string
  detail?: string
  code?: string
}

export interface ProductionWorkspaceReviewStatus {
  state:
    | 'applied'
    | 'review_preview_ready'
    | 'local_preview_ready'
    | 'applying'
    | 'simulating'
    | 'empty'
    | 'not_started'
    | 'in_progress'
    | 'blocked'
    | 'ready_for_preview'
  icon: LucideIcon
  iconClassName?: string
  label: string
  title: string
  detail: string
}
