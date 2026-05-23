import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { CircleUserRound, LogOut } from 'lucide-react'
import { AppTopControls } from '@/components/layout/AppTopControls'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/store/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui'

function UserMenu() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const currentMembership = orgMemberships.find((membership) => membership.org_id === currentOrgID)

  if (!currentUser) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted/50"
          title={currentUser.username}
          aria-label={currentUser.username}
        >
          <Avatar className="h-4 w-4">
            <AvatarFallback className="bg-muted type-tiny font-semibold text-muted-foreground">
              {currentUser.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate type-label font-medium">{currentUser.username}</span>
          <span className="mt-0.5 block truncate type-caption text-muted-foreground">
            {currentMembership
              ? t(`org.roles.${currentMembership.role}`, { defaultValue: currentMembership.role })
              : currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(ROUTES.user)}>
          <CircleUserRound size={14} className="mr-2" />
          {t('header.titles.user')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setCurrentUser(null)}>
          <LogOut size={14} className="mr-2" />
          {t('sidebar.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Header({
  titleKey: _titleKey,
  appControls,
  leftControls,
  centerContent,
}: {
  titleKey?: string
  appControls?: ReactNode
  leftControls?: ReactNode
  centerContent?: ReactNode
}) {
  const platform = typeof window === 'undefined' ? undefined : window.api?.platform
  const isMacOS = platform === undefined || platform === 'darwin'
  const controls = (
    <div className="app-window-no-drag flex shrink-0 items-center gap-1">
      {appControls}
      <AppTopControls compact />
      <UserMenu />
    </div>
  )

  return (
    <header className={`app-window-header ${isMacOS ? 'app-window-header--mac' : 'app-window-header--controls-right'} relative flex shrink-0 items-center gap-2 border-b border-border bg-background px-2`}>
      {leftControls ? <div className="app-window-header__left-controls app-window-no-drag flex shrink-0 gap-1">{leftControls}</div> : null}
      {!isMacOS && controls}
      {centerContent ? (
        <div className="min-w-0 flex-1">{centerContent}</div>
      ) : (
        <>
          <div className="min-w-0 flex-1" />
          <NavLink
            to={ROUTES.projects}
            className="app-window-no-drag absolute left-1/2 top-1/2 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center rounded-md px-2 type-caption font-semibold uppercase tracking-widest text-foreground hover:bg-muted/50"
          >
            Movscript
          </NavLink>
        </>
      )}
      {isMacOS && controls}
    </header>
  )
}
