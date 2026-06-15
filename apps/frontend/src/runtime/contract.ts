import type { LucideIcon } from 'lucide-react'
import type { ReactElement } from 'react'

export interface FrontendNavItem {
  to: string
  label: string
  icon: LucideIcon
  section?: 'manage'
}

export interface FrontendRouteItem {
  path: string
  element: ReactElement
  padded?: boolean
  requireProject?: boolean
  requireOrgAdmin?: boolean
}

export interface FrontendAppTopControls {
  settingsAction?: 'accountDialog' | 'appSettingsRoute'
  globalMenuItems?: FrontendAppTopControlsMenuItem[]
}

export interface FrontendAppTopControlsMenuItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
}

export type FrontendRuntimeEdition = 'community' | 'enterprise'
