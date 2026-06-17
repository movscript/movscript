import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Edge, Node } from '@xyflow/react'

import { api } from '@/shared/infrastructure/api'
import { nodeAcceptsTextResult } from '@/features/canvas/domain/graph'
import { hydrateCanvasDocument } from '@/features/canvas/editor/canvasDocument'
import {
  workflowInputValuesForReferenceNode,
  workflowReferenceOutputsForNode,
} from '@/features/canvas/integrations/workflowReferences'
import {
  canvasRuntimeOrderForNode,
  collectCanvasNodeInputs,
  firstRuntimeValue,
  reusableCanvasNodeOutputValues,
  runtimePromptForNode,
  runtimeResourceIdsForNode,
  topoSortCanvasNodes,
  type CanvasRuntimeOutputCache,
} from '@/features/canvas/runtime/canvasRuntimeGraph'
import {
  generateCanvasRuntimeMedia,
  generateCanvasRuntimeText,
  resolveCanvasRuntimeModel,
  uploadCanvasRuntimeTextResource,
} from '@/features/canvas/runtime/canvasRuntimeGeneration'
import type { Canvas, CanvasNodeData, CanvasPortValue, RawResource } from '@/types'
import {
  buildRuntimeWorkflowOutputs,
  canvasPortValuePreviewText,
  encodeRuntimePortValue,
  portForWorkflowInputNode,
  textContentFromOutputs,
} from './runtimeValues'
import { useCanvasRuntimeStore } from './runHistoryStore'
import { toast } from '@/shared/ui/toastStore'
import {
  canvasResourceChangedResult,
  invalidateResourceMutationResult,
  resourceLibraryChangedResult,
} from '@/features/resources/application/resourceMutationInvalidation'

export function useCanvasRuntimeExecutor({
  canvasId,
  projectId,
  nodes,
  edges,
  setNodes,
  resourceById,
  persistCanvasGraph,
  onRunStarted,
  t,
}: {
  canvasId: string
  projectId?: number
  nodes: Node[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<Node[]>>
  resourceById: Map<number, RawResource>
  persistCanvasGraph: (nodes: Node[], edges: Edge[]) => Promise<void>
  onRunStarted?: (input: { runId: string; targetNodeId?: string }) => void
  t: (key: string, options?: any) => string
}) {
  const qc = useQueryClient()
  const startRuntimeRun = useCanvasRuntimeStore((s) => s.startRun)
  const startRuntimeTask = useCanvasRuntimeStore((s) => s.startTask)
  const completeRuntimeTask = useCanvasRuntimeStore((s) => s.completeTask)
  const failRuntimeTask = useCanvasRuntimeStore((s) => s.failTask)
  const finishRuntimeRun = useCanvasRuntimeStore((s) => s.finishRun)

  const executeCanvasRuntimeNode = useCallback(async (
    node: Node,
    inputs: Record<string, CanvasPortValue[]>,
    context: { ambientInputs?: Record<string, CanvasPortValue>; referenceStack?: number[] } = {},
  ): Promise<Record<string, CanvasPortValue>> => {
    const data = node.data as Partial<CanvasNodeData>
    const first = firstRuntimeValue(inputs, ['value', 'input', 'prompt', 'reference', 'image', 'video', 'text'])
    if (node.type === 'input') {
      const value = first ?? (data.inputValue !== undefined ? { type: data.paramType ?? 'text', text: data.inputValue } as CanvasPortValue : undefined)
      return value ? { value, [node.id]: value } : {}
    }
    if (node.type === 'output') {
      return first ? { value: first, [node.id]: first } : {}
    }
    if (node.type === 'resource_sink') {
      if (!first) return {}
      if (first.resource_id) return { result: first, value: first }
      const text = canvasPortValuePreviewText(first)
      if (!text) return { result: first, value: first }
      const resource = await uploadCanvasRuntimeTextResource(data.paramName || (data as any).label || node.id, text)
      return { result: { type: 'text', text, resource_id: resource.ID, resource }, value: { type: 'text', text, resource_id: resource.ID, resource } }
    }
    if (node.type === 'text' && data.source !== 'ai') {
      const value: CanvasPortValue = data.resourceId
        ? { type: 'text', resource_id: data.resourceId, resource: data.resource }
        : { type: 'text', text: data.textContent ?? data.inputValue ?? '' }
      return { text: value, result: value, value }
    }
    if ((node.type === 'image' || node.type === 'video') && data.source !== 'ai') {
      if (!data.resourceId && !data.resource?.ID) return {}
      const resource = data.resource ?? resourceById.get(data.resourceId!)
      const value: CanvasPortValue = { type: node.type, resource_id: data.resourceId ?? data.resource!.ID, resource }
      return { [node.type]: value, result: value, value }
    }
    if (node.type === 'plugin_card') {
      throw new Error(t('canvas.editor.errors.pluginNodesDisabled', { defaultValue: 'Canvas plugin nodes are disabled' }))
    }
    if (node.type === 'canvas') {
      if (!data.referencedCanvasId) {
        throw new Error(t('canvas.editor.errors.referenceWorkflowMissing', { defaultValue: 'Referenced workflow is missing' }))
      }
      if ((context.referenceStack ?? []).includes(data.referencedCanvasId)) {
        throw new Error(t('canvas.editor.errors.referenceWorkflowCycle', { defaultValue: 'Referenced workflow contains a cycle' }))
      }
      const referencedCanvas = await api.get(`/canvases/${data.referencedCanvasId}`).then((response) => response.data as Canvas)
      if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') {
        throw new Error(t('canvas.editor.errors.referenceWorkflowInvalid', { defaultValue: 'Referenced canvas is not a workflow' }))
      }
      const referencedDocument = hydrateCanvasDocument(referencedCanvas, t)
      const childInputs = workflowInputValuesForReferenceNode({
        referencedCanvas,
        inputs: mergeAmbientInputs(inputs, context.ambientInputs),
      })
      const childOutputCache: CanvasRuntimeOutputCache = {}
      const childNodes = referencedDocument.nodes.filter((item) => item.type !== 'group')
      const childOrder = topoSortCanvasNodes(childNodes, referencedDocument.edges)
      for (const childNode of childOrder) {
        const childData = childNode.data as Partial<CanvasNodeData>
        const childInputValue = childNode.type === 'input'
          ? (childInputs[childNode.id] ?? (childData.paramName ? childInputs[childData.paramName] : undefined))
          : undefined
        const childInputPatch = childInputValue
          ? {
              value: childInputValue,
              [childNode.id]: childInputValue,
              ...(childData.paramName ? { [childData.paramName]: childInputValue } : {}),
            }
          : undefined
        const collected = collectCanvasNodeInputs({
          nodeId: childNode.id,
          nodes: referencedDocument.nodes,
          edges: referencedDocument.edges,
          resourceById,
          outputCache: childOutputCache,
          runtimeInputs: childInputPatch,
        })
        const reusableOutputs = reusableCanvasNodeOutputValues(childNode, { resourceById, outputCache: childOutputCache })
        if (reusableOutputs) {
          childOutputCache[childNode.id] = reusableOutputs
          continue
        }
        childOutputCache[childNode.id] = await executeCanvasRuntimeNode(childNode, collected.values, {
          ambientInputs: childInputs,
          referenceStack: [...(context.referenceStack ?? []), data.referencedCanvasId],
        })
      }
      return workflowReferenceOutputsForNode({
        referenceNode: node,
        referencedCanvas,
        workflowOutputs: buildRuntimeWorkflowOutputs(childOrder, childOutputCache),
      })
    }

    const outputType = node.type === 'text_gen' ? 'text'
      : node.type === 'ai_gen' ? (data.outputType ?? 'image')
        : node.type === 'video' || node.type === 'ref_video_gen' || node.type === 'motion_imitation' ? 'video'
          : node.type === 'text' ? 'text'
            : 'image'
    const prompt = runtimePromptForNode(node, inputs)
    if (!prompt && outputType !== 'image' && outputType !== 'video') {
      throw new Error(t('canvas.editor.errors.promptRequired', { defaultValue: 'Prompt is required' }))
    }
    if (outputType === 'text') {
      const model = await resolveCanvasRuntimeModel(data, 'text')
      const response = await generateCanvasRuntimeText({
        modelId: model.modelId,
        prompt,
        params: data.params,
        projectId,
      })
      const value: CanvasPortValue = { type: 'text', text: response.text }
      return { text: value, result: value, value }
    }
    const job = await generateCanvasRuntimeMedia({
      nodeType: node.type,
      data,
      outputType,
      prompt,
      inputResourceIds: runtimeResourceIdsForNode(node, inputs),
      projectId,
    })
    const resource = job.output_resource
    const resourceId = job.output_resource_id ?? resource?.ID ?? job.output_resource_ids?.[0]
    if (!resourceId) throw new Error(job.error_msg || 'generation job completed without output resource')
    const value: CanvasPortValue = { type: outputType === 'video' ? 'video' : 'image', resource_id: resourceId, resource }
    return { [value.type]: value, result: value, value }
  }, [projectId, resourceById, t])

  const executeCanvasRuntime = useCallback(async (targetNodeId?: string, values?: Record<string, CanvasPortValue>) => {
    const order = targetNodeId
      ? canvasRuntimeOrderForNode(targetNodeId, nodes, edges)
      : topoSortCanvasNodes(nodes.filter((node) => node.type !== 'group'), edges)
    const runnable = order.filter((node) => node.type !== 'group')
    let runtimeNodes = nodes
    const run = startRuntimeRun({ canvasId, nodeIds: runnable.map((node) => node.id), snapshotNodeCount: nodes.length, snapshotEdgeCount: edges.length })
    onRunStarted?.({ runId: run.id, targetNodeId })
    const outputCache: CanvasRuntimeOutputCache = {}
    const ambientInputs = ambientWorkflowInputValues(nodes, values)
    try {
      for (const node of runnable) {
        const inputValue = node.type === 'input' ? (values?.[node.id] ?? values?.value) : undefined
        const inputPatch = inputValue
          ? { value: inputValue, [node.id]: inputValue }
          : node.id === targetNodeId ? values : undefined
        const collected = collectCanvasNodeInputs({ nodeId: node.id, nodes, edges, resourceById, outputCache, runtimeInputs: inputPatch })
        const reusableOutputs = targetNodeId && node.id !== targetNodeId
          ? reusableCanvasNodeOutputValues(node, { resourceById, outputCache })
          : undefined
        startRuntimeTask({
          runId: run.id,
          canvasId,
          nodeId: node.id,
          nodeType: node.type,
          nodeLabel: (node.data as any)?.label || node.id,
          inputValues: collected.values,
        })
        if (reusableOutputs) {
          outputCache[node.id] = reusableOutputs
          const outputValue = reusableOutputs.result ?? reusableOutputs.value ?? Object.values(reusableOutputs)[0]
          completeRuntimeTask(canvasId, run.id, node.id, {
            outputValues: reusableOutputs,
            resourceId: outputValue?.resource_id,
            resource: outputValue?.resource,
            jobId: (outputValue?.json as any)?.jobId,
          })
          const nextRuntimeNodes = runtimeNodes.map((item) => {
            if (item.id !== node.id) return item
            const currentData = item.data as Partial<CanvasNodeData>
            return {
              ...item,
              data: {
                ...item.data,
                status: 'done',
                error: undefined,
                resourceId: outputValue?.resource_id ?? currentData.resourceId,
                resource: outputValue?.resource ?? currentData.resource,
                textContent: nodeAcceptsTextResult(item, currentData) ? (textContentFromOutputs(reusableOutputs) ?? currentData.textContent) : currentData.textContent,
              },
            }
          })
          runtimeNodes = nextRuntimeNodes
          setNodes(nextRuntimeNodes)
          continue
        }
        setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, data: { ...item.data, status: 'running', error: undefined } } : item))
        try {
          const outputs = await executeCanvasRuntimeNode(node, collected.values, { ambientInputs })
          outputCache[node.id] = outputs
          const outputValue = outputs.result ?? outputs.value ?? Object.values(outputs)[0]
          completeRuntimeTask(canvasId, run.id, node.id, {
            outputValues: outputs,
            resourceId: outputValue?.resource_id,
            resource: outputValue?.resource,
            jobId: (outputValue?.json as any)?.jobId,
          })
          const nextRuntimeNodes = runtimeNodes.map((item) => {
            if (item.id !== node.id) return item
            const currentData = item.data as Partial<CanvasNodeData>
            return {
              ...item,
              data: {
                ...item.data,
                status: 'done',
                error: undefined,
                resourceId: outputValue?.resource_id ?? currentData.resourceId,
                resource: outputValue?.resource ?? currentData.resource,
                textContent: nodeAcceptsTextResult(item, currentData) ? (textContentFromOutputs(outputs) ?? currentData.textContent) : currentData.textContent,
              },
            }
          })
          runtimeNodes = nextRuntimeNodes
          setNodes(nextRuntimeNodes)
          invalidateResourceMutationResult(qc, resourceLibraryChangedResult())
          invalidateResourceMutationResult(qc, canvasResourceChangedResult())
        } catch (err: any) {
          const message = err?.response?.data?.error || err?.message || t('canvas.editor.errors.runFailed', { defaultValue: 'Failed to run node' })
          failRuntimeTask(canvasId, run.id, node.id, message)
          setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, data: { ...item.data, status: 'failed', error: message } } : item))
          throw new Error(message)
        }
      }
      const outputValues = buildRuntimeWorkflowOutputs(runnable, outputCache)
      await persistCanvasGraph(runtimeNodes, edges)
      finishRuntimeRun(canvasId, run.id, 'done', outputValues)
    } catch (err: any) {
      const message = err?.message || t('canvas.editor.errors.runFailed', { defaultValue: 'Failed to run node' })
      finishRuntimeRun(canvasId, run.id, 'failed', buildRuntimeWorkflowOutputs(runnable, outputCache), message)
      toast.error(message)
    }
  }, [canvasId, completeRuntimeTask, edges, executeCanvasRuntimeNode, failRuntimeTask, finishRuntimeRun, nodes, onRunStarted, persistCanvasGraph, qc, resourceById, setNodes, startRuntimeRun, startRuntimeTask, t])

  const submitRunNode = useCallback(async (nodeId: string, values?: Record<string, CanvasPortValue>) => {
    await executeCanvasRuntime(nodeId, values)
  }, [executeCanvasRuntime])

  return {
    executeCanvasRuntime,
    submitRunNode,
  }
}

function mergeAmbientInputs(
  inputs: Record<string, CanvasPortValue[]>,
  ambientInputs: Record<string, CanvasPortValue> | undefined,
) {
  if (!ambientInputs) return inputs
  const merged: Record<string, CanvasPortValue[]> = { ...inputs }
  for (const [key, value] of Object.entries(ambientInputs)) {
    if (merged[key]?.length) continue
    merged[key] = [value]
  }
  return merged
}

function ambientWorkflowInputValues(nodes: Node[], values: Record<string, CanvasPortValue> | undefined) {
  const ambient: Record<string, CanvasPortValue> = { ...(values ?? {}) }
  for (const node of nodes) {
    if (node.type !== 'input') continue
    const data = node.data as Partial<CanvasNodeData>
    const explicitValue = values?.[node.id] ?? (data.paramName ? values?.[data.paramName] : undefined)
    const encodedValue = data.inputValue !== undefined
      ? encodeRuntimePortValue(portForWorkflowInputNode(node), data.inputValue)
      : undefined
    const value = explicitValue ?? encodedValue ?? undefined
    if (!value) continue
    ambient[node.id] = value
    if (data.paramName) ambient[data.paramName] = value
  }
  return ambient
}
