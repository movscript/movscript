import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { TFunction } from 'i18next'

import { toast } from '@movscript/ui/toast'
import { compareWorkflowIoNodes } from '../domain/graph'
import { useCanvasRuntimeStore } from '../runtime/runHistoryStore'
import { useCanvasRuntimeExecutor } from '../runtime/useCanvasRuntimeExecutor'
import {
  defaultRuntimeValueForPort,
  encodeRuntimePortValue,
  hasValueForPort,
  portForWorkflowInputNode,
  runtimeInputPortsForNode,
} from '../runtime/runtimeValues'
import type { CanvasNodeData, CanvasPortDef, CanvasPortValue, CanvasRunStatus, CanvasType, RawResource } from '@movscript/shared'

const CANVAS_RUN_HISTORY_PAGE_SIZE = 8

export function useCanvasRuntimeControls({
  canvasId,
  canvasType,
  edges,
  nodes,
  persistCanvasGraph,
  projectId,
  resourceById,
  setRuntimeStarting,
  setNodes,
  t,
}: {
  canvasId: string
  canvasType: CanvasType
  edges: Edge[]
  nodes: Node[]
  persistCanvasGraph: (nextNodes: Node[], nextEdges: Edge[]) => Promise<void>
  projectId?: number
  resourceById: Map<number, RawResource>
  setRuntimeStarting: Dispatch<SetStateAction<boolean>>
  setNodes: Dispatch<SetStateAction<Node[]>>
  t: TFunction
}) {
  const runtimeRunsByCanvasId = useCanvasRuntimeStore((s) => s.runsByCanvasId)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [nodeRunDialog, setNodeRunDialog] = useState<{ nodeId: string; ports: CanvasPortDef[] } | null>(null)
  const [nodeRunValues, setNodeRunValues] = useState<Record<string, string>>({})
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [runHistoryPage, setRunHistoryPage] = useState(1)
  const [runStatusFilter, setRunStatusFilter] = useState<'all' | CanvasRunStatus>('all')
  const [workflowPanelTab, setWorkflowPanelTab] = useState<'resources' | 'workflows' | 'history'>('resources')
  const [runResultDialogRunId, setRunResultDialogRunId] = useState<string | null>(null)
  const pendingResultRunIdsRef = useRef<Set<string>>(new Set())

  const {
    executeCanvasRuntime,
    submitRunNode,
  } = useCanvasRuntimeExecutor({
    canvasId,
    projectId,
    nodes,
    edges,
    setNodes,
    resourceById,
    persistCanvasGraph,
    onRunStarted: ({ runId, targetNodeId }) => {
      setActiveRunId(runId)
      setRunStatusFilter('all')
      setRunHistoryPage(1)
      setWorkflowPanelTab('history')
      if (!targetNodeId) pendingResultRunIdsRef.current.add(runId)
    },
    t,
  })

  const workflowRunsAll = runtimeRunsByCanvasId[canvasId] ?? []
  const workflowRunsFiltered = runStatusFilter === 'all'
    ? workflowRunsAll
    : workflowRunsAll.filter((run) => run.status === runStatusFilter)
  const workflowRunTotal = workflowRunsFiltered.length
  const workflowRunPageCount = Math.max(1, Math.ceil(workflowRunTotal / CANVAS_RUN_HISTORY_PAGE_SIZE))
  const workflowRuns = workflowRunsFiltered.slice((runHistoryPage - 1) * CANVAS_RUN_HISTORY_PAGE_SIZE, runHistoryPage * CANVAS_RUN_HISTORY_PAGE_SIZE)
  const activeRun = workflowRunsAll.find((run) => run.id === activeRunId) ?? workflowRunsAll[0]
  const resultDialogRun = runResultDialogRunId
    ? workflowRunsAll.find((run) => run.id === runResultDialogRunId)
    : undefined
  const inputNodes = useMemo(() => nodes.filter((node) => node.type === 'input').sort(compareWorkflowIoNodes), [nodes])
  const workflowRunningCount = workflowRuns.filter((run) => run.status === 'running' || run.status === 'pending').length

  useEffect(() => {
    setRunHistoryPage(1)
  }, [runStatusFilter])

  useEffect(() => {
    if (canvasType !== 'workflow' || !activeRun) return
    if (activeRun.status !== 'done' || Object.keys(activeRun.outputValues ?? {}).length === 0) return
    if (!pendingResultRunIdsRef.current.has(activeRun.id)) return
    pendingResultRunIdsRef.current.delete(activeRun.id)
    setRunResultDialogRunId(activeRun.id)
  }, [activeRun?.id, activeRun?.outputValues, activeRun?.status, activeRun, canvasType])

  const runNode = useCallback(async (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (node?.type === 'input') {
      const port = portForWorkflowInputNode(node)
      const data = node.data as Partial<CanvasNodeData>
      setNodeRunValues({ [port.id]: data.inputValue ?? defaultRuntimeValueForPort(port) })
      setNodeRunDialog({ nodeId, ports: [port] })
      return
    }
    const workflowInputKeys = new Set<string>()
    nodes.forEach((item) => {
      if (item.type !== 'input') return
      const data = item.data as Partial<CanvasNodeData>
      if (data.inputValue === undefined) return
      workflowInputKeys.add(item.id)
      if (data.paramName) workflowInputKeys.add(data.paramName)
    })
    const ports = runtimeInputPortsForNode(node, edges).filter((port) => {
      if (node?.type !== 'canvas') return true
      return !workflowInputKeys.has(port.id) && !workflowInputKeys.has(port.label ?? '')
    })
    if (ports.length > 0) {
      setNodeRunValues(Object.fromEntries(ports.map((port) => [port.id, defaultRuntimeValueForPort(port)])))
      setNodeRunDialog({ nodeId, ports })
      return
    }
    await submitRunNode(nodeId)
  }, [edges, nodes, submitRunNode])

  const handleConfirmNodeRun = useCallback(async () => {
    if (!nodeRunDialog) return
    const encoded: Record<string, CanvasPortValue> = {}
    const runtimeInputText = nodeRunValues[nodeRunDialog.ports[0]?.id ?? ''] ?? ''
    for (const port of nodeRunDialog.ports) {
      const value = encodeRuntimePortValue(port, nodeRunValues[port.id] ?? '')
      if (!value) {
        toast.error(t('canvas.editor.errors.invalidRuntimeInput', { port: port.label ?? port.id, defaultValue: `Invalid input for ${port.label ?? port.id}` }))
        return
      }
      if (!hasValueForPort([value]) && port.required) {
        toast.error(t('canvas.editor.errors.requiredRuntimeInput', { port: port.label ?? port.id, defaultValue: `${port.label ?? port.id} is required` }))
        return
      }
      if (hasValueForPort([value])) encoded[port.id] = value
    }
    setNodeRunDialog(null)
    setNodeRunValues({})
    setNodes((prev) => prev.map((node) => {
      if (node.id === nodeRunDialog.nodeId && node.type === 'input') {
        return { ...node, data: { ...node.data, inputValue: runtimeInputText } }
      }
      return node
    }))
    await submitRunNode(nodeRunDialog.nodeId, encoded)
  }, [nodeRunDialog, nodeRunValues, setNodes, submitRunNode, t])

  const handleRunWorkflow = useCallback(async () => {
    const currentInputNodes = nodes.filter((node) => node.type === 'input')
    if (currentInputNodes.length > 0) {
      const initial: Record<string, string> = {}
      currentInputNodes.forEach((node) => {
        const data = node.data as Partial<CanvasNodeData>
        initial[node.id] = data.inputValue ?? defaultRuntimeValueForPort(portForWorkflowInputNode(node))
      })
      setInputValues(initial)
      setRunDialogOpen(true)
    } else {
      setRuntimeStarting(true)
      try {
        await executeCanvasRuntime(undefined, {})
      } finally {
        setRuntimeStarting(false)
      }
    }
  }, [executeCanvasRuntime, nodes])

  const handleConfirmRun = useCallback(() => {
    const encoded: Record<string, CanvasPortValue> = {}
    for (const node of inputNodes) {
      const port = portForWorkflowInputNode(node)
      const value = encodeRuntimePortValue(port, inputValues[node.id] ?? '')
      if (!value) {
        toast.error(t('canvas.editor.errors.invalidRuntimeInput', { port: port.label ?? node.id, defaultValue: `Invalid input for ${port.label ?? node.id}` }))
        return
      }
      if (!hasValueForPort([value]) && port.required) {
        toast.error(t('canvas.editor.errors.requiredRuntimeInput', { port: port.label ?? node.id, defaultValue: `${port.label ?? node.id} is required` }))
        return
      }
      if (hasValueForPort([value])) encoded[node.id] = value
    }
    setNodes((prev) => prev.map((node) => {
      if (node.type === 'input' && inputValues[node.id] !== undefined) {
        return { ...node, data: { ...node.data, inputValue: inputValues[node.id] } }
      }
      return node
    }))
    setRunDialogOpen(false)
    setRuntimeStarting(true)
    void executeCanvasRuntime(undefined, encoded).finally(() => setRuntimeStarting(false))
  }, [executeCanvasRuntime, inputNodes, inputValues, setNodes, t])

  return {
    activeRun,
    activeRunId,
    handleConfirmNodeRun,
    handleConfirmRun,
    handleRunWorkflow,
    inputNodes,
    inputValues,
    nodeRunDialog,
    nodeRunValues,
    resultDialogRun,
    runDialogOpen,
    runHistoryPage,
    runStatusFilter,
    runNode,
    setActiveRunId,
    setInputValues,
    setNodeRunDialog,
    setNodeRunValues,
    setRunDialogOpen,
    setRunHistoryPage,
    setRunResultDialogRunId,
    setRunStatusFilter,
    setWorkflowPanelTab,
    workflowPanelTab,
    workflowRunPageCount,
    workflowRuns,
    workflowRunningCount,
    workflowRunTotal,
  }
}
