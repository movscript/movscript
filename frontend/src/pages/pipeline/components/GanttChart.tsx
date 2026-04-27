import type { PipelineNode, PipelineEdge } from '@/types'
import { useTranslation } from 'react-i18next'

const STATUS_COLORS: Record<string, string> = {
  draft:        'bg-muted-foreground/40',
  under_review: 'bg-amber-400',
  rejected:     'bg-destructive/70',
  final:        'bg-green-500',
}

interface Props {
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  onNodeClick: (node: PipelineNode) => void
}

export function GanttChart({ nodes, edges: _edges, onNodeClick }: Props) {
  const { t, i18n } = useTranslation()
  const nodesWithDate = nodes.filter((n) => n.due_date)
  const nodesWithout = nodes.filter((n) => !n.due_date)

  // Date range
  const dates = nodesWithDate.map((n) => new Date(n.due_date!).getTime())
  const minDate = dates.length > 0 ? Math.min(...dates) : Date.now()
  const maxDate = dates.length > 0 ? Math.max(...dates) : Date.now() + 7 * 86400_000
  const spanMs = Math.max(maxDate - minDate, 7 * 86400_000) // at least 7 days

  // Generate day labels
  const dayLabels: string[] = []
  const dayCount = Math.ceil(spanMs / 86400_000) + 2
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(minDate + i * 86400_000)
    dayLabels.push(d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' }))
  }

  function getBarLeft(dueDate: string) {
    const t = new Date(dueDate).getTime()
    return Math.max(0, Math.min(100, ((t - minDate) / spanMs) * 100))
  }

  const today = Date.now()
  const todayPct = Math.max(0, Math.min(100, ((today - minDate) / spanMs) * 100))

  return (
    <div className="flex flex-col h-full overflow-auto bg-background p-6">
      <div className="min-w-[700px]">
        {/* Day axis */}
        <div className="flex mb-2 pl-48">
          {dayLabels.slice(0, Math.min(dayLabels.length, 14)).map((d, i) => (
            <div key={i} className="flex-1 text-[10px] text-muted-foreground text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Nodes with due dates */}
        {nodesWithDate.length === 0 && nodesWithout.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <p>{t('pipeline.gantt.empty')}</p>
          </div>
        )}

        <div className="relative">
          {/* Today line */}
          {todayPct >= 0 && todayPct <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-primary/50 z-10 pointer-events-none"
              style={{ left: `calc(192px + ${todayPct}% * ((100% - 192px) / 100))` }}
            />
          )}

          {nodesWithDate.map((node) => {
            const left = getBarLeft(node.due_date!)
            const barColor = STATUS_COLORS[node.status] ?? STATUS_COLORS.draft
            const statusLabel = t(`pipeline.status.${node.status}`, { defaultValue: node.status })
            return (
              <div
                key={node.ID}
                className="flex items-center mb-2 h-9 cursor-pointer group"
                onClick={() => onNodeClick(node)}
              >
                {/* Node name */}
                <div className="w-48 shrink-0 pr-3 text-sm text-foreground truncate group-hover:text-primary transition-colors">
                  {node.name}
                </div>

                {/* Timeline bar */}
                <div className="flex-1 relative h-6 bg-muted/30 rounded">
                  <div
                    className={`absolute h-full rounded ${barColor} min-w-[4px] transition-all`}
                    style={{ left: `${left}%`, width: '4px' }}
                    title={`${statusLabel} - ${new Date(node.due_date!).toLocaleDateString(i18n.language)}`}
                  />
                  {/* Due date dot */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background ${barColor}`}
                    style={{ left: `calc(${left}% - 6px)` }}
                  />
                </div>

                {/* Status badge */}
                <div className="w-16 pl-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${barColor === 'bg-green-500' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Nodes without due dates */}
          {nodesWithout.length > 0 && (
            <>
              <div className="mt-4 mb-2 text-xs text-muted-foreground font-medium pl-0">{t('pipeline.gantt.noDueDate')}</div>
              {nodesWithout.map((node) => (
                <div
                  key={node.ID}
                  className="flex items-center mb-2 h-9 cursor-pointer group"
                  onClick={() => onNodeClick(node)}
                >
                  <div className="w-48 shrink-0 pr-3 text-sm text-foreground truncate group-hover:text-primary transition-colors">
                    {node.name}
                  </div>
                  <div className="flex-1 h-6 border border-dashed border-border rounded flex items-center px-3">
                    <span className="text-xs text-muted-foreground">{t('pipeline.gantt.noDueDate')}</span>
                  </div>
                  <div className="w-16 pl-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">
                      {t(`pipeline.status.${node.status}`, { defaultValue: node.status })}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
