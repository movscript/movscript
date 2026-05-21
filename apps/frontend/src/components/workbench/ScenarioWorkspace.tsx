import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, FileText, Film, ListChecks, Play, RefreshCw, Target, Upload, Users } from 'lucide-react'

import { statusLabel, statusVariant } from '@/lib/contentWorkbenchStatus'
import { useWorkbenchCanvasLauncher, type CanvasWorkbenchKind } from '@/lib/useWorkbenchCanvasLauncher'
import { workbenchScenarios } from '@/lib/workbenchScenarios'
import { getWorkbenchSurface, type WorkbenchCategory } from '@/pages/project/projectSurfaces'
import { Badge, Button, Card, Progress } from '@movscript/ui'
import { ActionRail, DecisionPanel, InfoPanel, QueueList } from './WorkbenchChrome'

export function ScenarioWorkspace({ category, generationKind }: { category: WorkbenchCategory; generationKind?: CanvasWorkbenchKind }) {
  const surface = getWorkbenchSurface(category)
  const scenario = workbenchScenarios[category]
  const [selectedId, setSelectedId] = useState(scenario.queue[0]?.id ?? '')
  const selected = scenario.queue.find((item) => item.id === selectedId) ?? scenario.queue[0]
  const evidenceIcon = category === 'production' ? Play : category === 'delivery' ? Film : category === 'creative' ? Users : category === 'assets' ? Upload : FileText
  const generation = useWorkbenchCanvasLauncher(generationKind)

  useEffect(() => {
    setSelectedId(scenario.queue[0]?.id ?? '')
  }, [category, scenario.queue])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <surface.icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate type-body-lg font-semibold text-foreground">{surface.title}</h1>
              <Badge variant="outline">{surface.shortTitle}</Badge>
            </div>
            <p className="mt-1 truncate type-label text-muted-foreground">{surface.purpose}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm"><RefreshCw size={14} />刷新建议</Button>
          {generationKind ? (
            <Button size="sm" disabled={generation.disabled} loading={generation.loading} onClick={generation.open}>
              <ArrowRight size={14} />
              {generation.label}
            </Button>
          ) : (
            <Button size="sm"><CheckCircle2 size={14} />确认当前决策</Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <QueueList items={scenario.queue} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
            <div className="min-w-0 space-y-5">
              {selected ? (
                <Card className="rounded-lg border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="type-label text-muted-foreground">当前对象</p>
                      <h2 className="mt-1 truncate type-title-sm font-semibold text-foreground">{selected.title}</h2>
                      <p className="mt-1 truncate type-body text-muted-foreground">{selected.subtitle}</p>
                    </div>
                    <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                  </div>
                  <Progress value={selected.progress} className="mt-4 h-1.5" />
                </Card>
              ) : null}

              <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <InfoPanel title={scenario.evidenceTitle} rows={scenario.evidence} icon={evidenceIcon} />
                <DecisionPanel title={scenario.decisionTitle} rows={scenario.decisions} />
              </div>

              <Card className="rounded-lg border-border bg-card p-4">
                <h2 className="type-body font-semibold text-foreground">工作台定位</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    ['目的', surface.purpose, Target],
                    ['决策', surface.decision, ListChecks],
                    ['产出', surface.output, CheckCircle2],
                  ].map(([label, text, Icon]) => (
                    <div key={label as string} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-center gap-2 type-label text-muted-foreground">
                        <Icon size={14} />
                        <span>{label as string}</span>
                      </div>
                      <p className="mt-2 type-body leading-6 text-foreground">{text as string}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </main>
        <ActionRail actions={scenario.actions} outputTitle={scenario.outputTitle} outputs={scenario.outputs} />
      </div>
    </div>
  )
}
