import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Clock3 } from 'lucide-react'

import ReferenceRelationsPage from '@/pages/reference-relations/ReferenceRelationsPage'
import { cn } from '@/lib/utils'
import { ScenarioWorkspace } from '@/components/workbench/ScenarioWorkspace'
import { ScriptSplitWorkbench } from '@/components/workbench/ScriptSplitWorkbench'
import { SettingPreparationWorkbench } from '@/components/workbench/SettingPreparationWorkbench'
import { ContentWorkbenchPage } from '@/components/workbench/ContentWorkbenchPage'
import {
  workbenchSurfaces,
  type WorkbenchCategory,
} from '@/pages/project/projectSurfaces'
import { PreProductionAssetWorkspace } from '@/pages/pre-production/PreProductionPage'
import { workbenchScenarios } from '@/lib/workbenchScenarios'

export type WorkbenchMode = 'free'

interface WorkbenchContentProps {
  mode: WorkbenchMode
  initialCategory?: WorkbenchCategory
  showCategoryTabs?: boolean
  nodeId?: string | number
  embedded?: boolean
  onBack?: () => void
}

function CategoryContent({ category }: { category: WorkbenchCategory }) {
  if (category === 'script') return <ScriptSplitWorkbench />
  if (category === 'assets') return <PreProductionAssetWorkspace />
  if (category === 'creative') return <SettingPreparationWorkbench />
  if (category === 'production') return <ContentWorkbenchPage />
  if (category === 'reference-relations') return <ReferenceRelationsPage embedded initialView="graph" />
  return <ScenarioWorkspace category={category} />
}

export function WorkbenchContent({ initialCategory = 'production', showCategoryTabs = true }: WorkbenchContentProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [category, setCategory] = useState<WorkbenchCategory>(() => {
    const tab = searchParams.get('tab')
    return showCategoryTabs && workbenchSurfaces.some((item) => item.value === tab) ? (tab as WorkbenchCategory) : initialCategory
  })

  useEffect(() => {
    const tab = searchParams.get('tab')
    setCategory(showCategoryTabs && workbenchSurfaces.some((item) => item.value === tab) ? (tab as WorkbenchCategory) : initialCategory)
  }, [searchParams, initialCategory, showCategoryTabs])

  const activeCategory = showCategoryTabs ? category : initialCategory
  const summary = useMemo(() => {
    const scenario = workbenchScenarios[activeCategory]
    const blocked = scenario.queue.filter((item) => item.status === 'blocked').length
    const review = scenario.queue.filter((item) => item.status === 'review').length
    const running = scenario.queue.filter((item) => item.status === 'running').length
    return `${review} 个待确认 · ${blocked} 个阻塞 · ${running} 个运行中`
  }, [activeCategory])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {showCategoryTabs && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md bg-muted p-0.5">
            {workbenchSurfaces.map((item) => {
              const Icon = item.icon
              const active = category === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    if (item.value === 'delivery') {
                      navigate(item.href)
                      return
                    }
                    setCategory(item.value)
                    const next = new URLSearchParams(searchParams)
                    next.set('tab', item.value)
                    setSearchParams(next, { replace: true })
                  }}
                  className={cn(
                    'flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded px-3 type-body font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon size={14} />
                  <span className="truncate">{item.shortTitle}</span>
                </button>
              )
            })}
          </div>
          <div className="ml-3 hidden shrink-0 items-center gap-2 type-label text-muted-foreground xl:flex">
            <Clock3 size={14} />
            <span>{summary}</span>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <CategoryContent category={activeCategory} />
      </div>
    </div>
  )
}

interface WorkbenchPageProps {
  mode: WorkbenchMode
  initialCategory?: WorkbenchCategory
  showCategoryTabs?: boolean
}

export default function WorkbenchPage({ mode, initialCategory, showCategoryTabs }: WorkbenchPageProps) {
  return <WorkbenchContent mode={mode} initialCategory={initialCategory} showCategoryTabs={showCategoryTabs} />
}
