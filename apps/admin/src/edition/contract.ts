import type { LucideIcon } from 'lucide-react'
import type { ReactElement } from 'react'

export interface AdminNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export interface AdminRouteItem {
  path: string
  element: ReactElement
}

export interface AdminDashboardCard {
  label: string
  value?: string
  detail: string
  icon: LucideIcon
  href: string
}

export interface AdminSectionCard {
  label: string
  detail: string
  icon: LucideIcon
  href: string
}
