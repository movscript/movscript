import { useCallback, useMemo, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  WorkbenchAppTabBar,
  WorkbenchAppTabButton,
} from '@movscript/ui/business/workbench'

import { useProjectEntrySessionStore } from '@/features/project/application/projectEntrySessionStore'
import {
  buildProjectEntryDeck,
  buildProjectEntryDeckOrderUpdates,
  type ProjectEntryDeckTab,
} from '@/features/project/presentation/projectEntryDeckModel'
import type { ProjectEntryId } from '@/features/project/domain/projectEntryRegistry'
import './ProjectEntryDeckHeader.css'

const PROJECT_ENTRY_DECK_DRAG_TYPE = 'application/x-movscript-project-entry'

export function ProjectEntryDeckHeader({
  activeEntryId,
  projectId,
  projectName,
}: {
  activeEntryId?: ProjectEntryId
  projectId: number
  projectName: string
}) {
  const navigate = useNavigate()
  const snapshots = useProjectEntrySessionStore((state) => state.snapshots)
  const setEntryDeckOrders = useProjectEntrySessionStore((state) => state.setEntryDeckOrders)
  const deck = useMemo(() => buildProjectEntryDeck({
    activeEntryId,
    projectId,
    snapshots,
  }), [activeEntryId, projectId, snapshots])
  const reorderProjectEntryTab = useCallback((draggedEntryId: ProjectEntryId, targetEntryId: ProjectEntryId, position: 'before' | 'after') => {
    const updates = buildProjectEntryDeckOrderUpdates({
      draggedEntryId,
      targetEntryId,
      position,
      projectId,
      snapshots,
    })
    if (updates.length > 0) setEntryDeckOrders(projectId, updates)
  }, [projectId, setEntryDeckOrders, snapshots])

  function handleTabDragStart(event: DragEvent<HTMLButtonElement>, tab: ProjectEntryDeckTab) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(PROJECT_ENTRY_DECK_DRAG_TYPE, tab.id)
  }

  function handleTabDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleTabDrop(event: DragEvent<HTMLButtonElement>, tab: ProjectEntryDeckTab) {
    event.preventDefault()
    const draggedEntryId = event.dataTransfer.getData(PROJECT_ENTRY_DECK_DRAG_TYPE) as ProjectEntryId
    if (!draggedEntryId || draggedEntryId === tab.id) return
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    reorderProjectEntryTab(draggedEntryId, tab.id, position)
  }

  return (
    <div className="project-entry-deck-header app-window-no-drag">
      <div className="app-window-route-title project-entry-deck-header__project">
        <span className="app-window-route-title__text">{projectName}</span>
      </div>
      <WorkbenchAppTabBar
        className="project-entry-deck-header__tab-bar"
        aria-label="项目工作台"
        tabs={deck.tabs.map((tab) => {
          const Icon = tab.definition.icon
          return (
            <WorkbenchAppTabButton
              key={tab.id}
              active={tab.active}
              className="project-entry-deck-header__tab"
              draggable
              icon={<Icon size={12} />}
              title={tab.title}
              onDragStart={(event) => handleTabDragStart(event, tab)}
              onDragOver={handleTabDragOver}
              onDrop={(event) => handleTabDrop(event, tab)}
              onClick={() => {
                if (!tab.active) navigate(projectEntryDeckTabPath(tab))
              }}
            >
              {tab.shortTitle}
            </WorkbenchAppTabButton>
          )
        })}
      />
    </div>
  )
}

export function projectEntryDeckTabPath(tab: Pick<ProjectEntryDeckTab, 'definition' | 'restoredRoute' | 'restoredSearch'>): string {
  const route = tab.restoredRoute?.trim() || tab.definition.route
  const search = tab.restoredSearch?.trim()
  if (!search) return route
  return `${route}${search.startsWith('?') ? search : `?${search}`}`
}
