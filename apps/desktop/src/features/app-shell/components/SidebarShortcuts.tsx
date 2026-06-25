import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  ChevronRight,
  FolderOpen,
  Home,
  Images,
  Scissors,
} from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import { ROUTES } from '@/routes/projectRoutes'
import type { EditingProjectShortcut } from '@/features/app-shell/application/appShortcutRecentItems'
import type { Canvas, Project } from '@/types'

export type DesktopShortcutMenuItem = {
  id: string
  label: string
  icon?: LucideIcon
  active?: boolean
  onSelect: () => void
}

export type DesktopShortcutMenuState = {
  x: number
  y: number
  title: string
  quickItems: DesktopShortcutMenuItem[]
  recentTitle: string
  emptyRecentTitle: string
  activeLabel: string
  recentItems: DesktopShortcutMenuItem[]
}

type ShortcutTranslate = (key: string, options?: { defaultValue?: string }) => string

export function DesktopShortcutMenu({
  menu,
  onClose,
}: {
  menu: DesktopShortcutMenuState
  onClose: () => void
}) {
  return (
    <div
      role="menu"
      aria-label={menu.title}
      className="fixed z-50 w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="px-2 py-1.5 type-caption font-medium text-muted-foreground">{menu.title}</div>
      {menu.quickItems.map((item) => (
        <DesktopShortcutMenuButton key={item.id} item={item} activeLabel={menu.activeLabel} onClose={onClose} />
      ))}
      <div className="my-1 h-px bg-border" />
      <div className="px-2 py-1 type-caption font-medium text-muted-foreground">{menu.recentTitle}</div>
      {menu.recentItems.length === 0 ? (
        <div className="px-2 py-2 type-caption text-muted-foreground">{menu.emptyRecentTitle}</div>
      ) : menu.recentItems.map((item) => (
        <DesktopShortcutMenuButton key={item.id} item={item} activeLabel={menu.activeLabel} onClose={onClose} />
      ))}
    </div>
  )
}

export function createQuickHomeShortcuts({
  pathname,
  openAppHomeRoot,
  openToolRoot,
  openCanvasRoot,
  openEditingRoot,
  t,
}: {
  pathname: string
  openAppHomeRoot: () => void
  openToolRoot: () => void
  openCanvasRoot: () => void
  openEditingRoot: () => void
  t: ShortcutTranslate
}): DesktopShortcutMenuItem[] {
  return [
    {
      id: 'app-home',
      label: t('sidebar.shortcuts.appHome'),
      icon: Home,
      active: pathname === ROUTES.root,
      onSelect: openAppHomeRoot,
    },
    {
      id: 'tool-home',
      label: t('sidebar.shortcuts.toolHome'),
      icon: Images,
      active: pathname.startsWith('/tools'),
      onSelect: openToolRoot,
    },
    {
      id: 'edit-home',
      label: t('sidebar.shortcuts.editHome'),
      icon: Scissors,
      active: pathname === ROUTES.editing || pathname.startsWith('/editing/'),
      onSelect: openEditingRoot,
    },
    {
      id: 'canvas-home',
      label: t('sidebar.shortcuts.canvasHome'),
      icon: AppWindow,
      active: pathname === ROUTES.canvases || pathname.startsWith('/canvases/'),
      onSelect: openCanvasRoot,
    },
  ]
}

export function createProjectShortcutMenu({
  quickItems,
  projects,
  onOpenProject,
  t,
}: {
  quickItems: DesktopShortcutMenuItem[]
  projects: Project[]
  onOpenProject: (project: Project) => void
  t: ShortcutTranslate
}): Omit<DesktopShortcutMenuState, 'x' | 'y'> {
  return {
    title: t('sidebar.shortcuts.project'),
    quickItems,
    recentTitle: t('sidebar.shortcuts.recentProjects'),
    emptyRecentTitle: t('sidebar.shortcuts.emptyRecentProjects'),
    activeLabel: t('sidebar.shortcuts.active'),
    recentItems: projects.map((project) => ({
      id: `project:${project.ID}`,
      label: project.name,
      icon: FolderOpen,
      onSelect: () => onOpenProject(project),
    })),
  }
}

export function createCanvasShortcutMenu({
  quickItems,
  canvases,
  onOpenCanvas,
  t,
}: {
  quickItems: DesktopShortcutMenuItem[]
  canvases: Canvas[]
  onOpenCanvas: (canvas: Canvas) => void
  t: ShortcutTranslate
}): Omit<DesktopShortcutMenuState, 'x' | 'y'> {
  return {
    title: t('sidebar.items.canvas'),
    quickItems,
    recentTitle: t('sidebar.shortcuts.recentCanvases'),
    emptyRecentTitle: t('sidebar.shortcuts.emptyRecentCanvases'),
    activeLabel: t('sidebar.shortcuts.active'),
    recentItems: canvases.map((canvas) => ({
      id: `canvas:${canvas.ID}`,
      label: canvas.name,
      icon: AppWindow,
      onSelect: () => onOpenCanvas(canvas),
    })),
  }
}

export function createEditingShortcutMenu({
  quickItems,
  projects,
  onOpenEditingProject,
  t,
}: {
  quickItems: DesktopShortcutMenuItem[]
  projects: EditingProjectShortcut[]
  onOpenEditingProject: (project: EditingProjectShortcut) => void
  t: ShortcutTranslate
}): Omit<DesktopShortcutMenuState, 'x' | 'y'> {
  return {
    title: t('sidebar.items.editing'),
    quickItems,
    recentTitle: t('sidebar.shortcuts.recentEditingProjects'),
    emptyRecentTitle: t('sidebar.shortcuts.emptyRecentEditingProjects'),
    activeLabel: t('sidebar.shortcuts.active'),
    recentItems: projects.map((project) => ({
      id: `editing:${project.id}`,
      label: project.title,
      icon: Scissors,
      onSelect: () => onOpenEditingProject(project),
    })),
  }
}

export function shortcutMenuPosition(event: MouseEvent<HTMLElement>) {
  const width = 288
  const height = 340
  const inset = 8
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  return {
    x: Math.max(inset, Math.min(event.clientX, viewportWidth - width - inset)),
    y: Math.max(inset, Math.min(event.clientY, viewportHeight - height - inset)),
  }
}

function DesktopShortcutMenuButton({
  item,
  activeLabel,
  onClose,
}: {
  item: DesktopShortcutMenuItem
  activeLabel?: string
  onClose: () => void
}) {
  const Icon = item.icon
  return (
    <Button
      type="button"
      role="menuitem"
      variant="ghost"
      size="sm"
      className="flex h-9 w-full items-center gap-2 rounded px-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        onClose()
        item.onSelect()
      }}
    >
      {Icon ? <Icon size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate type-label font-medium text-foreground">
        {item.label}
      </span>
      {item.active ? (
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 type-caption font-medium text-primary">{activeLabel}</span>
      ) : null}
    </Button>
  )
}
