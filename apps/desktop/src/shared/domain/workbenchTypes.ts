import type { LucideIcon } from 'lucide-react'

export type WorkbenchStatus = 'blocked' | 'review' | 'ready' | 'running'
export type WorkbenchPriority = 'high' | 'medium' | 'low'

export interface WorkbenchGate {
  label: string
  detail: string
  done: boolean
  state?: 'required' | 'pending' | 'passed'
}

export interface WorkbenchLinkRow {
  label: string
  value: string
  icon: LucideIcon
}
