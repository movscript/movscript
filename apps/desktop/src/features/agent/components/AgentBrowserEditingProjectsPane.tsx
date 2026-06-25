import { useEffect, useState } from 'react'
import { ArrowRight, Clapperboard, Plus } from 'lucide-react'

import {
  readEditingProjectRegistry,
  subscribeEditingProjectRegistry,
  type EditingProjectSummary,
} from '@/features/app-shell/application/editingProjectRegistry'
import {
  AgentBrowserContentFlow,
  AgentBrowserContentGroup,
  AgentBrowserContentGroupCopy,
  AgentBrowserContentGroupDescription,
  AgentBrowserContentGroupHeader,
  AgentBrowserContentGroupIcon,
  AgentBrowserContentGroupItems,
  AgentBrowserContentGroupState,
  AgentBrowserContentGroupTitle,
  AgentBrowserContentGroupTitleRow,
  AgentBrowserContentItem,
  AgentBrowserContentItemCopy,
  AgentBrowserContentItemDescription,
  AgentBrowserContentItemMeta,
  AgentBrowserContentItemTitle,
  AgentBrowserContentToolbar,
  AgentBrowserContentToolButton,
  AgentBrowserProjectDescription,
  AgentBrowserProjectHeader,
  AgentBrowserProjectHeaderCopy,
  AgentBrowserProjectMetaLabel,
  AgentBrowserProjectNavigationPage,
  AgentBrowserProjectTitle,
} from '@/features/agent/components/AgentBrowserInternalPageUi'
import { openEditingProjectWindow, openEditingWindow } from '@/shared/infrastructure/appWindowContext'

export function AgentBrowserEditingProjectsPane() {
  const [projects, setProjects] = useState<EditingProjectSummary[]>(() => readEditingProjectRegistry())

  useEffect(() => {
    setProjects(readEditingProjectRegistry())
    return subscribeEditingProjectRegistry(() => setProjects(readEditingProjectRegistry()))
  }, [])

  async function openProject(project: EditingProjectSummary) {
    await openEditingProjectWindow({
      editingProjectId: project.id,
      title: project.title,
      route: `/editing/${encodeURIComponent(project.id)}`,
    })
  }

  return (
    <AgentBrowserProjectNavigationPage>
      <AgentBrowserProjectHeader>
        <AgentBrowserProjectHeaderCopy>
          <AgentBrowserProjectMetaLabel icon={<Clapperboard size={14} />}>
            内部页面
          </AgentBrowserProjectMetaLabel>
          <AgentBrowserProjectTitle>剪辑</AgentBrowserProjectTitle>
          <AgentBrowserProjectDescription>
            打开媒体剪辑项目和时间线工作台。
          </AgentBrowserProjectDescription>
        </AgentBrowserProjectHeaderCopy>
        <AgentBrowserContentToolbar aria-label="剪辑操作">
          <AgentBrowserContentToolButton icon={<Plus size={13} />} onClick={() => void openEditingWindow()}>
            打开剪辑主页
          </AgentBrowserContentToolButton>
        </AgentBrowserContentToolbar>
      </AgentBrowserProjectHeader>

      <AgentBrowserContentFlow aria-label="最近剪辑项目">
        <AgentBrowserContentGroup tone="production" variant="lane">
          <AgentBrowserContentGroupHeader>
            <AgentBrowserContentGroupIcon>
              <Clapperboard size={17} />
            </AgentBrowserContentGroupIcon>
            <AgentBrowserContentGroupCopy>
              <AgentBrowserContentGroupTitleRow>
                <AgentBrowserContentGroupTitle>最近剪辑项目</AgentBrowserContentGroupTitle>
              </AgentBrowserContentGroupTitleRow>
              <AgentBrowserContentGroupDescription>
                从本机剪辑项目记录中打开。
              </AgentBrowserContentGroupDescription>
            </AgentBrowserContentGroupCopy>
          </AgentBrowserContentGroupHeader>
          <AgentBrowserContentGroupItems>
            {projects.length === 0 ? (
              <AgentBrowserContentGroupState>暂无最近剪辑项目</AgentBrowserContentGroupState>
            ) : projects.map((project) => (
              <AgentBrowserContentItem key={project.id} onClick={() => void openProject(project)}>
                <AgentBrowserContentItemCopy>
                  <AgentBrowserContentItemTitle>{project.title || project.id}</AgentBrowserContentItemTitle>
                  <AgentBrowserContentItemDescription>
                    {project.projectPath || project.updatedAt || project.id}
                  </AgentBrowserContentItemDescription>
                </AgentBrowserContentItemCopy>
                <AgentBrowserContentItemMeta>
                  <span>{project.updatedAt ? formatEditingProjectDate(project.updatedAt) : project.projectId}</span>
                  <ArrowRight size={14} />
                </AgentBrowserContentItemMeta>
              </AgentBrowserContentItem>
            ))}
          </AgentBrowserContentGroupItems>
        </AgentBrowserContentGroup>
      </AgentBrowserContentFlow>
    </AgentBrowserProjectNavigationPage>
  )
}

function formatEditingProjectDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}
