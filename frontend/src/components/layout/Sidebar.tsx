import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
        { label: '剧本', value: progress.scripts, total: 0 },
        { label: '分集', value: progress.episodes, total: progress.total_episodes },
        { label: '分场', value: progress.scenes, total: 0 },
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
          <span className="text-muted-foreground">分镜</span>
          <span className="text-muted-foreground font-mono tabular-nums">
            {progress.storyboards.approved}/{progress.storyboards.total}
          </span>
        </div>
        <ProgressBar value={sbPct} className="h-1" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">镜头终稿</span>
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

        {/* 项目 */}
        <Section title="项目">
          <div className="px-3 py-1 mb-0.5">
            {current ? (
              <div className="flex items-center gap-2">
                <FolderOpen size={13} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">{current.name}</span>
                <NavLink
                  to="/projects"
                  className="text-xs text-muted-foreground hover:text-muted-foreground shrink-0 transition-colors"
                >
                  切换
                </NavLink>
              </div>
            ) : (
              <NavLink
                to="/projects"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <FolderOpen size={13} className="shrink-0" />
                <span>选择项目…</span>
              </NavLink>
            )}
          </div>

          {current && (
            <>
              {showScripts && <NavItem to="/scripts" icon={FileText} label="剧本" />}
              <NavItem to="/assets" icon={Image} label="素材" />
              <NavItem to="/episodes" icon={Film} label="分集" />
              <NavItem to="/scenes" icon={Clapperboard} label="分场" />
              {showStoryboards && <NavItem to="/storyboards" icon={Layers} label="分镜" />}
              {showStoryboards && <NavItem to="/shots" icon={Camera} label="镜头" />}
            </>
          )}
        </Section>

        {/* 进度 */}
        {current && (
          <>
            <div className="border-t border-border my-2" />
            <Section title="进度" defaultOpen={true}>
              <ProjectProgress projectId={current.ID} />
            </Section>
          </>
        )}

        <div className="border-t border-border my-2" />

        {/* 工具 */}
        <Section title="工具">
          <NavItem to="/canvases" icon={LayoutTemplate} label="画布" />
          <NavItem to="/tools/ref-image-gen" icon={ImagePlus} label="参考生图" />
          <NavItem to="/tools/ref-video-gen" icon={Video} label="参考生视频" />
          <NavItem to="/tools/motion-imitation" icon={Move} label="动作迁移" />
          <NavItem to="/tools/style-transfer" icon={Palette} label="画风迁移" />
          <NavItem to="/tools/multi-angle" icon={Box} label="多角度" />
          <NavItem to="/tools/brainstorm" icon={MessageSquare} label="头脑风暴" />
        </Section>

        <div className="border-t border-border my-2" />

        {/* 文件 */}
        <Section title="文件">
          <NavItem to="/resources" icon={HardDrive} label="资源库" />
          <NavItem to="/jobs" icon={Wand2} label="生成记录" />
        </Section>

        <div className="border-t border-border my-2" />

        {/* Agent */}
        <Section title="Agent">
          <NavItem to="/agents" icon={BotMessageSquare} label="我的 Agent" />
        </Section>

        <div className="border-t border-border my-2" />

        {/* 管理 (super_admin only) */}
        {currentUser?.system_role === 'super_admin' && (
          <Section title="管理" defaultOpen={false}>
            <NavItem to="/admin" icon={ShieldAlert} label="管理后台" />
          </Section>
        )}

        <div className="border-t border-border my-2" />

        {/* 工作 */}
        <Section title="工作">
          {current ? (
            <>
              <NavItem to="/pipeline" icon={Network} label="管线" />
              <NavItem to="/collaboration" icon={Users} label="协作" />
              <NavItem to="/creation" icon={PenLine} label="创作" />
            </>
          ) : (
            <p className="px-3 py-1 text-xs text-muted-foreground">需要先选择项目</p>
          )}
        </Section>

      </nav>

      {/* 用户底栏 */}
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
              {currentUser.system_role === 'super_admin' ? '超级管理员' : '普通用户'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setCurrentUser(null) }}
            className="text-muted-foreground hover:text-muted-foreground h-7 w-7 shrink-0"
            title="退出登录"
          >
            <LogOut size={14} />
          </Button>
        </div>
      )}
    </aside>
  )
}
