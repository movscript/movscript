import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  Clapperboard,
  HardDrive,
  Home,
  LayoutTemplate,
  PenLine,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react'

import {
  AgentBrowserBadge,
  AgentBrowserContentFlow,
  AgentBrowserContentGroup,
  AgentBrowserContentGroupCopy,
  AgentBrowserContentGroupDescription,
  AgentBrowserContentGroupHeader,
  AgentBrowserContentGroupIcon,
  AgentBrowserContentGroupIndex,
  AgentBrowserContentGroupItems,
  AgentBrowserContentGroupOverflow,
  AgentBrowserContentGroupState,
  AgentBrowserContentGroupTitle,
  AgentBrowserContentGroupTitleRow,
  AgentBrowserContentItem,
  AgentBrowserContentItemCopy,
  AgentBrowserContentItemDescription,
  AgentBrowserContentItemMeta,
  AgentBrowserContentItemTitle,
  AgentBrowserContentMatrix,
  AgentBrowserContentSummary,
  AgentBrowserContentSummaryGrid,
  AgentBrowserContentSummaryMain,
  AgentBrowserContentToolbar,
  AgentBrowserContentToolButton,
  AgentBrowserKeyValue,
  AgentBrowserProjectDescription,
  AgentBrowserProjectHeader,
  AgentBrowserProjectHeaderCopy,
  AgentBrowserProjectMetaLabel,
  AgentBrowserProjectNavigationPage,
  AgentBrowserProjectTitle,
} from '@/features/agent/components/AgentBrowserInternalPageUi'

export type ProjectNavigationGroupVariant = 'hero' | 'library' | 'pipeline'

export interface ProjectNavigationGroup {
  key: string
  title: string
  description: string
  icon: LucideIcon
  variant: ProjectNavigationGroupVariant
  tone: 'plan' | 'script' | 'asset' | 'production' | 'content'
  items: ProjectNavigationLink[]
  loading: boolean
  action?: ReactNode
  countLabel?: string
  emptyState?: string
  facts?: ProjectNavigationFact[]
  primaryLabel?: string
  roleLabel: string
}

export interface ProjectNavigationLink {
  id: string
  title: string
  description: string
  detail?: string
  to?: string
  onClick?: () => void
  status?: string
}

export interface ProjectNavigationFact {
  label: string
  value: string | number
}

export interface AgentBrowserProjectHomeViewModel {
  groups: ProjectNavigationGroup[]
  loadingGroups: number
  projectName: string
  rows: Array<[string, string | number]>
  summaryHint: string
  totalItems: number
}

export function AgentBrowserProjectHomeContent({
  model,
  onOpenCanvasList,
  onOpenEditingProjects,
  onOpenExternalResourceLibrary,
  onOpenProjectStandards,
  onOpenResourceLibrary,
}: {
  model: AgentBrowserProjectHomeViewModel
  onOpenCanvasList: () => void
  onOpenEditingProjects: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
}) {
  const heroGroup = model.groups.find((group) => group.variant === 'hero')
  const libraryGroups = model.groups.filter((group) => group.variant === 'library')
  const pipelineGroups = model.groups.filter((group) => group.variant === 'pipeline')

  return (
    <AgentBrowserProjectNavigationPage>
      <AgentBrowserProjectHeader>
        <AgentBrowserProjectHeaderCopy>
          <AgentBrowserProjectMetaLabel icon={<Home size={14} />}>
            内部页面
          </AgentBrowserProjectMetaLabel>
          <AgentBrowserProjectTitle>内容导航</AgentBrowserProjectTitle>
          <AgentBrowserProjectDescription>
            {model.projectName}
          </AgentBrowserProjectDescription>
        </AgentBrowserProjectHeaderCopy>
        <AgentBrowserContentToolbar aria-label="常用内容入口">
          <AgentBrowserContentToolButton icon={<PenLine size={13} />} onClick={onOpenProjectStandards}>
            规范
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<HardDrive size={13} />} onClick={onOpenResourceLibrary}>
            资源库
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<ScanSearch size={13} />} onClick={onOpenExternalResourceLibrary}>
            外部资源
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<LayoutTemplate size={13} />} onClick={onOpenCanvasList}>
            画布
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<Clapperboard size={13} />} onClick={onOpenEditingProjects}>
            剪辑
          </AgentBrowserContentToolButton>
        </AgentBrowserContentToolbar>
      </AgentBrowserProjectHeader>
      <AgentBrowserContentSummary aria-label="会话项目内容概览">
        <AgentBrowserContentSummaryMain label="内容对象" value={model.totalItems} />
        <div className="agent-browser-content-nav__summary-copy">
          <span>项目索引</span>
          <strong>{model.summaryHint}</strong>
        </div>
        <AgentBrowserContentSummaryGrid>
          {model.rows.map(([label, value]) => (
            <AgentBrowserKeyValue key={label} label={label} value={value} strong />
          ))}
        </AgentBrowserContentSummaryGrid>
        {model.loadingGroups > 0 ? (
          <AgentBrowserBadge>{model.loadingGroups} 项读取中</AgentBrowserBadge>
        ) : null}
      </AgentBrowserContentSummary>

      {heroGroup ? (
        <section className="agent-browser-content-nav__hero" aria-label="项目基准入口">
          <ProjectNavigationGroupSection group={heroGroup} index={0} />
        </section>
      ) : null}

      <AgentBrowserContentMatrix aria-label="资料库入口">
        {libraryGroups.map((group, index) => (
          <ProjectNavigationGroupSection key={group.key} group={group} index={index + 1} />
        ))}
      </AgentBrowserContentMatrix>

      <AgentBrowserContentFlow aria-label="生产链路入口">
        {pipelineGroups.map((group, index) => (
          <ProjectNavigationGroupSection key={group.key} group={group} index={index + 1 + libraryGroups.length} />
        ))}
      </AgentBrowserContentFlow>
    </AgentBrowserProjectNavigationPage>
  )
}

function ProjectNavigationGroupSection({
  group,
  index,
}: {
  group: ProjectNavigationGroup
  index: number
}) {
  const Icon = group.icon
  const previewLimit = group.variant === 'hero' ? 1 : group.variant === 'pipeline' ? 3 : 4
  const previewItems = group.items.slice(0, previewLimit)

  return (
    <AgentBrowserContentGroup tone={group.tone} variant={group.variant}>
      <AgentBrowserContentGroupHeader>
        <AgentBrowserContentGroupIcon>
          <Icon size={17} />
        </AgentBrowserContentGroupIcon>
        <AgentBrowserContentGroupCopy>
          <AgentBrowserContentGroupTitleRow>
            <AgentBrowserContentGroupIndex>{String(index + 1).padStart(2, '0')}</AgentBrowserContentGroupIndex>
            <span className="agent-browser-content-group__role">{group.roleLabel}</span>
            <AgentBrowserContentGroupTitle>{group.title}</AgentBrowserContentGroupTitle>
          </AgentBrowserContentGroupTitleRow>
          <AgentBrowserContentGroupDescription>{group.description}</AgentBrowserContentGroupDescription>
        </AgentBrowserContentGroupCopy>
        {group.action}
        <AgentBrowserBadge>{group.loading ? '读取中' : group.countLabel ?? `${group.items.length}`}</AgentBrowserBadge>
      </AgentBrowserContentGroupHeader>
      {group.facts?.length ? (
        <div className="agent-browser-content-group__facts">
          {group.facts.map((fact) => (
            <span className="agent-browser-content-group__fact" key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </span>
          ))}
        </div>
      ) : null}
      <AgentBrowserContentGroupItems>
        {group.loading ? (
          <AgentBrowserContentGroupState>正在读取会话项目数据...</AgentBrowserContentGroupState>
        ) : group.items.length === 0 ? (
          <AgentBrowserContentGroupState>{group.emptyState ?? '暂无数据'}</AgentBrowserContentGroupState>
        ) : (
          previewItems.map((item) => (
            item.to ? (
              <AgentBrowserContentItem asChild key={`${group.key}-${item.id}`}>
                <Link to={item.to}>
                  <ProjectNavigationItemContent item={item} />
                </Link>
              </AgentBrowserContentItem>
            ) : (
              <AgentBrowserContentItem
                key={`${group.key}-${item.id}`}
                onClick={item.onClick}
              >
                <ProjectNavigationItemContent item={item} />
              </AgentBrowserContentItem>
            )
          ))
        )}
        {!group.loading && group.items.length > previewItems.length ? (
          <AgentBrowserContentGroupOverflow>
            另有 {group.items.length - previewItems.length} 项
          </AgentBrowserContentGroupOverflow>
        ) : null}
      </AgentBrowserContentGroupItems>
    </AgentBrowserContentGroup>
  )
}

function ProjectNavigationItemContent({ item }: { item: ProjectNavigationLink }) {
  return (
    <>
      <AgentBrowserContentItemCopy>
        <AgentBrowserContentItemTitle>{item.title}</AgentBrowserContentItemTitle>
        <AgentBrowserContentItemDescription>{item.description}</AgentBrowserContentItemDescription>
        {item.detail ? (
          <span className="agent-browser-content-item__detail">{item.detail}</span>
        ) : null}
      </AgentBrowserContentItemCopy>
      <AgentBrowserContentItemMeta>
        {item.status ? <span>{item.status}</span> : null}
        <ArrowRight size={14} />
      </AgentBrowserContentItemMeta>
    </>
  )
}
