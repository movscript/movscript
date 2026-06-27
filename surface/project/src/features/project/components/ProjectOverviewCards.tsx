import { Link } from 'react-router-dom'
import { ArrowRight, FileText, LayoutDashboard } from 'lucide-react'
import { Badge, Button, Progress, StatusBadge } from '@movscript/ui/primitives'
import { toneTextClass } from '@movscript/ui/semantic'

import {
  projectOverviewLaneLabel,
  projectOverviewNextActionLabel,
  type ProjectOverviewWorkLane,
} from '../presentation/projectOverviewModel'
import { projectEntryRoutePath } from '../domain/projectEntryRegistry'
import { projectLaneStateRecipe } from '../presentation/projectSemanticUi'
import { surfaceRoutePath, type Script } from '@movscript/shared'

export function ProjectOverviewMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-7 text-foreground tabular-nums">{value}</p>
      <p className="mt-1 truncate type-caption text-muted-foreground">{detail}</p>
    </div>
  )
}

export function ProjectOverviewScriptCard({ script }: { script: Script }) {
  const bodyLength = (script.raw_source || script.content || '').trim().length
  const description = script.summary || script.description || script.plot_summary || '暂无摘要'

  return (
    <Link
      to={surfaceRoutePath('project.scripts', { projectId: script.project_id, script_id: script.ID })}
      className="project-home-card project-home-card--button project-home-card--script"
    >
      <div className="project-home-card__header">
        <span className="project-home-card__icon">
          <FileText size={17} />
        </span>
        <Badge variant="outline">{script.script_type || '手记'}</Badge>
      </div>
      <div className="project-home-card__body">
        <h3 className="project-home-card__title">{script.title || `手记 #${script.ID}`}</h3>
        <p className="project-home-card__description">{description}</p>
        <div className="project-home-card__signal-grid">
          <span className="project-home-card__signal">
            <span className="project-home-card__signal-label">正文</span>
            <span className="project-home-card__signal-value">{bodyLength > 0 ? `${bodyLength} 字` : '未导入'}</span>
          </span>
          <span className="project-home-card__signal">
            <span className="project-home-card__signal-label">类型</span>
            <span className="project-home-card__signal-value">{script.script_type || '手记'}</span>
          </span>
        </div>
      </div>
      <div className="project-home-card__footer">
        <span>创作手记</span>
        <span className="project-home-card__footer-action">
          进入工作台
          <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  )
}

export function ProjectOverviewPluginInfoTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-1 truncate type-body font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate type-caption text-muted-foreground">{detail}</p>
    </div>
  )
}

export function ProjectBuiltInStandardsPluginCard({ lane }: { lane?: ProjectOverviewWorkLane }) {
  const statusLabel = lane ? projectOverviewLaneLabel(lane.state) : '内建'
  return (
    <article className="project-home-card project-home-card--plugin">
      <div className="project-home-card__header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={14} className={lane?.state === 'ready' ? toneTextClass('success') : 'text-muted-foreground'} />
            <h3 className="project-home-card__title">项目规范</h3>
          </div>
          <p className="project-home-card__description">
            统一项目级画幅、镜头语言、视觉风格、节奏和生成约束。
          </p>
        </div>
        <Button asChild type="button" size="sm" variant="outline">
          <Link to={surfaceRoutePath('project.standards')}>打开</Link>
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="solid" tone="success">系统内置</Badge>
        <Badge variant="outline">项目能力</Badge>
        <Badge variant="outline">{statusLabel}</Badge>
      </div>
      {lane ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-3 type-caption text-muted-foreground">
            <span className="truncate">{lane.detail}</span>
            <span className="shrink-0 tabular-nums">{lane.progress}%</span>
          </div>
          <Progress value={lane.progress} className="h-1.5" />
          <div className="project-home-card__signal-grid">
            <span className="project-home-card__signal">
              <span className="project-home-card__signal-label">状态</span>
              <span className="project-home-card__signal-value">{statusLabel}</span>
            </span>
            <span className="project-home-card__signal">
              <span className="project-home-card__signal-label">准备度</span>
              <span className="project-home-card__signal-value">{lane.progress}%</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-3 truncate type-caption text-muted-foreground">project_standards</p>
      )}
    </article>
  )
}

export function ProjectOverviewWorkbenchCard({ lane }: { lane: ProjectOverviewWorkLane }) {
  const Icon = lane.definition.icon
  const laneUi = projectLaneStateRecipe(lane.state)

  return (
    <article className="flex min-h-[220px] flex-col rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-foreground">
          <Icon size={17} />
        </span>
        <StatusBadge {...laneUi}>{projectOverviewLaneLabel(lane.state)}</StatusBadge>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h2 className="type-body font-semibold text-foreground">{lane.definition.title}</h2>
        <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{lane.definition.purpose}</p>
        <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 type-label">
            <span className="truncate text-muted-foreground">对象数量</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{lane.count}</span>
          </div>
          <p className="mt-1 truncate type-caption text-muted-foreground">{lane.detail}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3 type-label">
          <span className="text-muted-foreground">准备度</span>
          <span className="font-medium tabular-nums text-foreground">{lane.progress}%</span>
        </div>
        <Progress value={lane.progress} className="h-1.5" />
        <Button asChild variant="outline" size="sm" className="w-full justify-center gap-2">
          <Link to={projectEntryRoutePath(lane.definition)}>
            {projectOverviewNextActionLabel(lane.definition)}
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
    </article>
  )
}
