import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  FileText, Image, ImagePlus, Film, Clapperboard, Layers, Camera,
  LayoutTemplate, Video, Move, Palette, Box,
  Users, PenLine, ChevronDown, ChevronRight, LogOut, FolderOpen, ShieldAlert,
  HardDrive, Wand2, Network, MessageSquare, BotMessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import type { ProjectMember, Progress } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress as ProgressBar } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

function NavItem({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )
      }
    >
      <Icon size={15} className="shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

function Section({ title, defaultOpen = true, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-muted-foreground transition-colors"
      >
        {title}
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

function ProjectProgress({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const { data: progress } = useQuery<Progress>({
    queryKey: ['progress', projectId],
    queryFn: () => api.get(`/projects/${projectId}/progress`).then((r) => r.data),
    refetchInterval: 60_000,
  })

  if (!progress) return null

  const sbPct = progress.storyboards.total > 0
    ? Math.round((progress.storyboards.approved / progress.storyboards.total) * 100)
    : 0
  const shotPct = progress.shots.total > 0
    ? Math.round((progress.shots.is_approved / progress.shots.total) * 100)
    : 0

  return (
    <div className="px-3 py-2 space-y-2">
      {[
        { label: t('sidebar.progress.scripts'), value: progress.scripts, total: 0 },
        { label: t('sidebar.progress.episodes'), value: progress.episodes, total: progress.total_episodes },
        { label: t('sidebar.progress.scenes'), value: progress.scenes, total: 0 },
      ].map(({ label, value, total }) => (
        <div key={label} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-muted-foreground font-mono tabular-nums">
            {total > 0 ? `${value}/${total}` : value}
          </span>
        </div>
      ))}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t('sidebar.progress.storyboards')}</span>
          <span className="text-muted-foreground font-mono tabular-nums">
            {progress.storyboards.approved}/{progress.storyboards.total}
          </span>
        </div>
        <ProgressBar value={sbPct} className="h-1" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t('sidebar.progress.finalShots')}</span>
          <span className="text-muted-foreground font-mono tabular-nums">
            {progress.shots.is_approved}/{progress.shots.total}
          </span>
        </div>
        <ProgressBar value={shotPct} className="h-1" />
      </div>
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const navigate = useNavigate()

  const { data: projectDetail, isError: projectNotFound } = useQuery({
    queryKey: ['project', current?.ID],
    queryFn: () => api.get(`/projects/${current!.ID}`).then((r) => r.data),
    enabled: !!current,
    retry: false,
  })

  useEffect(() => {
    if (projectNotFound && current) setCurrent(null)
  }, [projectNotFound, current, setCurrent])

  const members: ProjectMember[] = projectDetail?.members ?? []
  const projectRole = members.find((m) => m.user_id === currentUser?.ID)?.role
    ?? (current?.owner_id === currentUser?.ID ? 'owner' : 'viewer')

  const showScripts = !current || ['owner', 'director', 'writer'].includes(projectRole)
  const showStoryboards = !current || ['owner', 'director'].includes(projectRole)

  return (
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      <div className="px-4 py-3.5 border-b border-sidebar-border shrink-0">
        <p className="text-xs font-bold text-foreground tracking-widest uppercase">Movscript</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">

        {/* Project */}
        <Section title={t('sidebar.sections.project')}>
          <div className="px-3 py-1 mb-0.5">
            {current ? (
              <div className="flex items-center gap-2">
                <FolderOpen size={13} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">{current.name}</span>
                <NavLink
                  to="/projects"
                  className="text-xs text-muted-foreground hover:text-muted-foreground shrink-0 transition-colors"
                >
                  {t('common.switch')}
                </NavLink>
              </div>
            ) : (
              <NavLink
                to="/projects"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <FolderOpen size={13} className="shrink-0" />
                <span>{t('common.selectProject')}</span>
              </NavLink>
            )}
          </div>

          {current && (
            <>
              {showScripts && <NavItem to="/scripts" icon={FileText} label={t('sidebar.items.scripts')} />}
              <NavItem to="/assets" icon={Image} label={t('sidebar.items.assets')} />
              <NavItem to="/episodes" icon={Film} label={t('sidebar.items.episodes')} />
              <NavItem to="/scenes" icon={Clapperboard} label={t('sidebar.items.scenes')} />
              {showStoryboards && <NavItem to="/storyboards" icon={Layers} label={t('sidebar.items.storyboards')} />}
              {showStoryboards && <NavItem to="/shots" icon={Camera} label={t('sidebar.items.shots')} />}
              <div className="border-t border-border mx-3 my-1.5" />
              <NavItem to="/pipeline" icon={Network} label={t('sidebar.items.pipeline')} />
              <NavItem to="/collaboration" icon={Users} label={t('sidebar.items.collaboration')} />
              <NavItem to="/creation" icon={PenLine} label={t('sidebar.items.creation')} />
            </>
          )}
        </Section>

        {/* Progress */}
        {current && (
          <>
            <div className="border-t border-border my-2" />
            <Section title={t('sidebar.sections.progress')} defaultOpen={true}>
              <ProjectProgress projectId={current.ID} />
            </Section>
          </>
        )}

        <div className="border-t border-border my-2" />

        {/* Tools */}
        <Section title={t('sidebar.sections.tools')}>
          <NavItem to="/canvases" icon={LayoutTemplate} label={t('sidebar.items.canvas')} />
          <NavItem to="/tools/ref-image-gen" icon={ImagePlus} label={t('sidebar.items.refImageGen')} />
          <NavItem to="/tools/ref-video-gen" icon={Video} label={t('sidebar.items.refVideoGen')} />
          <NavItem to="/tools/motion-imitation" icon={Move} label={t('sidebar.items.motionImitation')} />
          <NavItem to="/tools/style-transfer" icon={Palette} label={t('sidebar.items.styleTransfer')} />
          <NavItem to="/tools/multi-angle" icon={Box} label={t('sidebar.items.multiAngle')} />
          <NavItem to="/tools/brainstorm" icon={MessageSquare} label={t('sidebar.items.brainstorm')} />
        </Section>

        <div className="border-t border-border my-2" />

        {/* Files */}
        <Section title={t('sidebar.sections.files')}>
          <NavItem to="/resources" icon={HardDrive} label={t('sidebar.items.resources')} />
          <NavItem to="/jobs" icon={Wand2} label={t('sidebar.items.jobs')} />
        </Section>

        <div className="border-t border-border my-2" />

        {/* Agent */}
        <Section title={t('sidebar.sections.agent')}>
          <NavItem to="/agents" icon={BotMessageSquare} label={t('sidebar.items.myAgents')} />
        </Section>

        {/* Admin (super_admin only) */}
        {currentUser?.system_role === 'super_admin' && (
          <>
            <div className="border-t border-border my-2" />
            <Section title={t('sidebar.items.admin')} defaultOpen={false}>
              <NavItem to="/admin" icon={ShieldAlert} label={t('sidebar.items.admin')} />
            </Section>
          </>
          )}

      </nav>

      {/* User footer */}
      {currentUser && (
        <div
          className="px-3 py-3 border-t border-sidebar-border flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors shrink-0"
          onClick={() => navigate('/user')}
        >
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
              {currentUser.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{currentUser.username}</p>
            <p className="text-xs text-muted-foreground truncate">
              {currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setCurrentUser(null) }}
            className="text-muted-foreground hover:text-muted-foreground h-7 w-7 shrink-0"
            title={t('sidebar.logout')}
          >
            <LogOut size={14} />
          </Button>
        </div>
      )}
    </aside>
  )
}
