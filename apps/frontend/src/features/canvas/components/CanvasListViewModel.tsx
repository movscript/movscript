import { Lightbulb, Workflow, Zap } from 'lucide-react'

import type { CanvasType } from '@/types'

export const CANVAS_LIST_PAGE_SIZE = 8

export type CanvasTypeFilter = 'all' | CanvasType

export const CANVAS_LIST_TYPE_FILTERS: CanvasTypeFilter[] = ['all', 'inspiration', 'workflow']

export const CANVAS_LIST_TYPE_META: Record<CanvasType, { labelKey: string; icon: JSX.Element; listIcon: JSX.Element; descKey: string }> = {
  inspiration: {
    labelKey: 'pages.canvases.types.inspiration',
    icon: <Lightbulb size={12} />,
    listIcon: <Lightbulb size={16} />,
    descKey: 'pages.canvases.typeDescriptions.inspiration',
  },
  workflow: {
    labelKey: 'pages.canvases.types.workflow',
    icon: <Zap size={12} />,
    listIcon: <Workflow size={16} />,
    descKey: 'pages.canvases.typeDescriptions.workflow',
  },
}

export type CanvasListTranslate = (key: string, options?: Record<string, unknown>) => string
