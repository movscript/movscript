import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Edge, Node } from '@xyflow/react'

import { buildCanvasPluginArgsWithInputs } from '@/features/canvas/integrations/canvasPluginArgs'
import {
  outputResourceFromUnknown,
  outputResourceIdsFromUnknown,
} from '@/features/canvas/runtime/canvasRuntimeGraph'
import { compileClientPlugin, loadClientPlugins, runClientPlugin, type ClientPluginManifest } from '@/features/plugins/application/clientPlugins'
import type { CanvasNodeData, RawResource } from '@/types'

export function useCanvasClientPlugins({
  nodes,
  edges,
  setNodes,
  resourceById,
  pluginNotFoundMessage,
}: {
  nodes: Node[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<Node[]>>
  resourceById: Map<number, RawResource>
  pluginNotFoundMessage: string
}) {
  const [clientPlugins, setClientPlugins] = useState<ClientPluginManifest[]>([])

  useEffect(() => {
    loadClientPlugins()
      .then(setClientPlugins)
      .catch(() => setClientPlugins([]))
  }, [])

  const runLocalPluginNode = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    const data = node?.data as unknown as CanvasNodeData | undefined
    if (!node || !data?.pluginId) return

    setNodes((prev) => prev.map((n) => n.id === nodeId
      ? { ...n, data: { ...n.data, status: 'running', error: undefined } }
      : n
    ))

    try {
      let plugin = clientPlugins.find((p) => p.id === data.pluginId)
      if (!plugin) {
        const plugins = await loadClientPlugins()
        setClientPlugins(plugins)
        plugin = plugins.find((p) => p.id === data.pluginId)
      }
      if (!plugin) throw new Error(pluginNotFoundMessage)

      const defaultArgs = Object.fromEntries(
        Object.entries(plugin.inputSchema?.properties ?? {})
          .filter(([, prop]) => prop.default !== undefined)
          .map(([key, prop]) => [key, prop.default])
      )
      const pluginArgs = buildCanvasPluginArgsWithInputs({
        targetNodeId: nodeId,
        baseArgs: {
          ...defaultArgs,
          ...((data.pluginArgs ?? {}) as Record<string, unknown>),
        },
        inputPorts: data.inputPorts,
        schemaProperties: plugin.inputSchema?.properties,
        nodes,
        edges,
        resourceById,
      })
      const executableSpec = await compileClientPlugin(plugin, pluginArgs)
      const result = await runClientPlugin(plugin, pluginArgs)
      const resultText = result.content?.map((item) => item.text ?? '').filter(Boolean).join('\n')
        || JSON.stringify(result.data ?? '')
      const outputResourceIds = result.isError ? [] : outputResourceIdsFromUnknown(result.data)
      const outputResourceId = outputResourceIds[0]
      const outputResource = outputResourceId
        ? outputResourceFromUnknown(result.data, outputResourceId) ?? resourceById.get(outputResourceId)
        : undefined
      setNodes((prev) => prev.map((n) => n.id === nodeId
        ? {
            ...n,
            data: {
              ...n.data,
              status: result.isError ? 'failed' : 'done',
              error: result.isError ? resultText : undefined,
              pluginResultText: resultText,
              pluginResultData: result.data,
              pluginLastRunAt: new Date().toISOString(),
              executableSpec,
              resourceId: outputResourceId ?? (n.data as Partial<CanvasNodeData>).resourceId,
              resource: outputResource ?? (n.data as Partial<CanvasNodeData>).resource,
            },
          }
        : n
      ))
    } catch (err: any) {
      setNodes((prev) => prev.map((n) => n.id === nodeId
        ? { ...n, data: { ...n.data, status: 'failed', error: err?.message ?? String(err) } }
        : n
      ))
    }
  }, [clientPlugins, edges, nodes, pluginNotFoundMessage, resourceById, setNodes])

  return {
    clientPlugins,
    runLocalPluginNode,
  }
}
