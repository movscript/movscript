import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Building2, Check, CircleUserRound, LogOut, Settings } from 'lucide-react'
import { AppTopControls } from '@/components/layout/AppTopControls'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/store/projectStore'
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
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const setCurrentOrg = useUserStore((s) => s.setCurrentOrg)
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
        {orgMemberships.map((membership) => (
          <DropdownMenuItem
            key={membership.org_id}
            onClick={() => {
              setCurrentOrg(membership.org_id)
              setCurrentProject(null)
              navigate(ROUTES.projects)
            }}
          >
            {membership.is_personal ? <CircleUserRound size={14} className="mr-2 shrink-0" /> : <Building2 size={14} className="mr-2 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{membership.org_name}</span>
            {membership.org_id === currentOrgID ? <Check size={14} className="ml-2 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => navigate(ROUTES.orgSelect)}>
          <Settings size={14} className="mr-2" />
          {t('org.switchOrg')}
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
      {appControls ?? <AppTopControls compact />}
      <UserMenu />
    </div>
  )

  return (
    <header className={`app-window-header ${isMacOS ? 'app-window-header--mac' : 'app-window-header--controls-right'} relative flex h-[34px] shrink-0 items-center gap-2 border-b border-border bg-background px-2`}>
      {leftControls ? <div className="app-window-no-drag flex shrink-0 items-center gap-1">{leftControls}</div> : null}
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
