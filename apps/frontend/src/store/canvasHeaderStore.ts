import { create } from 'zustand'
import type { CanvasType } from '@/types'

interface CanvasHeaderState {
  active: boolean
  canvasName: string
  canvasType: CanvasType
  nodeCount: number
  runningCount: number
  doneCount: number
  inputCount: number
  processorCount: number
  outputCount: number
  activeRunLabel?: string
  workflowRunningCount: number
  saving: boolean
  startingRun: boolean
  onNameChange?: (name: string) => void
  onRun?: () => void
  onSave?: () => void
  setHeader: (patch: Partial<Omit<CanvasHeaderState, 'setHeader' | 'reset'>>) => void
  reset: () => void
}

const INITIAL_STATE: Omit<CanvasHeaderState, 'setHeader' | 'reset'> = {
  active: false,
  canvasName: '',
  canvasType: 'inspiration',
  nodeCount: 0,
  runningCount: 0,
  doneCount: 0,
  inputCount: 0,
  processorCount: 0,
  outputCount: 0,
  activeRunLabel: undefined,
  workflowRunningCount: 0,
  saving: false,
  startingRun: false,
  onNameChange: undefined,
  onRun: undefined,
  onSave: undefined,
}

export const useCanvasHeaderStore = create<CanvasHeaderState>((set) => ({
  ...INITIAL_STATE,
  setHeader: (patch) => set((state) => ({ ...state, ...patch })),
  reset: () => set({ ...INITIAL_STATE }),
}))

