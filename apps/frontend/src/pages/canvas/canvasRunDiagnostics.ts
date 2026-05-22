import { api } from '@/lib/api'
import type { CanvasNodeModelDiagnostics } from '@/types'

export async function fetchCanvasNodeModelDiagnostics(canvasId: string | number, nodeId: string) {
  return api
    .get(`/canvases/${canvasId}/nodes/${nodeId}/model-diagnostics`)
    .then((r) => r.data as CanvasNodeModelDiagnostics)
}

export function formatCanvasNodeModelDiagnostics(diag: CanvasNodeModelDiagnostics) {
  const lines: string[] = []
  const capability = diag.capability ? `能力 ${diag.capability}` : '未知能力'
  if (diag.status === 'ok' && diag.route) {
    lines.push(`运行诊断：模型路由正常，已解析到配置 #${diag.route.model_config_id}（${diag.route.model_id}）。`)
  } else if (diag.status === 'missing_model_selection') {
    lines.push(`运行诊断：节点数据没有保存模型选择（${capability}）。`)
  } else if (diag.status === 'route_error') {
    lines.push(`运行诊断：模型选择存在，但路由失败（${capability}）。`)
  } else if (diag.status === 'not_applicable') {
    lines.push('运行诊断：这个节点不需要 AI 模型。')
  } else {
    lines.push(`运行诊断：${diag.status}（${capability}）。`)
  }

  if (diag.available_model_count === 0 && diag.capability) {
    lines.push(`当前没有可用的 ${diag.capability} 模型，请先在管理后台启用对应模型和凭据。`)
  } else if (diag.available_models?.length) {
    const modelLabels = diag.available_models
      .slice(0, 3)
      .map((model) => `${model.display_name || model.model_id} #${model.id}${model.is_default ? ' 默认' : ''}`)
      .join('；')
    lines.push(`当前可用模型：${modelLabels}`)
  }

  if (diag.raw_model_fields && Object.keys(diag.raw_model_fields).length > 0) {
    lines.push(`节点已保存字段：${JSON.stringify(diag.raw_model_fields)}`)
  } else {
    lines.push('节点已保存字段：没有 modelId / modelDbId')
    if (diag.available_model_count > 0) {
      lines.push('说明：前端下拉框可能显示默认模型，但运行时以后端保存的节点 data 为准。')
    }
  }

  for (const problem of diag.problems ?? []) {
    lines.push(`问题：${problem}`)
  }
  for (const action of diag.next_actions ?? []) {
    lines.push(`处理：${action}`)
  }

  return lines.join('\n')
}
