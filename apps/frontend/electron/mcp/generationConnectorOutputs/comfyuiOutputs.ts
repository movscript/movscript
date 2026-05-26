import { fetchWithTimeout } from '../backendClient'
import { getOptionalString } from '../generationConnectors/params'
import { callAdminGenerationToolProxy, callGenerationToolServer, generationToolServerHeaders, sanitizeGenerationToolServerForMCP } from '../generationConnectorServers'
import { isRecord } from '../valueUtils'
import type { GenerationToolServer } from '../../../src/shared/contracts/generationTools'
import { attachImportedOutputCandidates } from './candidateLinks'
import { mimeExtension, mimeTypeFromFilename, safeFilenameStem } from './fileUtils'
import { backendUploadResource, resourceIDFromUpload } from './resourceUploads'

export async function importComfyUIHistoryOutputs(server: GenerationToolServer, args: Record<string, unknown>): Promise<unknown> {
  const promptID = getOptionalString(args, 'prompt_id') ?? getOptionalString(args, 'promptId')
  if (!promptID) throw new Error('tool_comfyui import_history_outputs requires prompt_id')
  const historyResult = await callGenerationToolServer(server, `/history/${encodeURIComponent(promptID)}`, { method: 'GET' })
  const historyData = isRecord(historyResult) && isRecord(historyResult.data) ? historyResult.data : {}
  const outputs = extractComfyUIHistoryImageOutputs(historyData, promptID)
  const outputName = getOptionalString(args, 'output_name') ?? getOptionalString(args, 'outputName') ?? 'comfyui-output'
  const folderID = getOptionalString(args, 'folder_id') ?? getOptionalString(args, 'folderId')
  const outputResources = []
  for (let index = 0; index < outputs.length; index += 1) {
    const image = await fetchComfyUIImageOutput(server, outputs[index])
    const filename = `${safeFilenameStem(outputName)}-${index + 1}.${mimeExtension(image.mimeType)}`
    outputResources.push(await backendUploadResource(image.bytes, filename, image.mimeType, folderID))
  }
  const outputResourceIds = outputResources.map(resourceIDFromUpload).filter((id): id is number => id !== undefined)
  const candidateResults = await attachImportedOutputCandidates(outputResourceIds, args, 'tool_comfyui')
  return {
    status: 'ok',
    server: sanitizeGenerationToolServerForMCP(server),
    data: {
      prompt_id: promptID,
      output_count: outputs.length,
      imported: true,
    },
    output_resources: outputResources,
    output_resource_ids: outputResourceIds,
    ...(candidateResults.length > 0 ? { candidate_results: candidateResults } : {}),
    message: outputResourceIds.length > 0
      ? `Imported ${outputResourceIds.length} ComfyUI output image(s) into resources.`
      : 'No ComfyUI image outputs were imported from history.',
  }
}

export async function importAdminComfyUIHistoryOutputs(server: GenerationToolServer, args: Record<string, unknown>): Promise<unknown> {
  const promptID = getOptionalString(args, 'prompt_id') ?? getOptionalString(args, 'promptId')
  if (!promptID) throw new Error('tool_comfyui import_history_outputs requires prompt_id')
  const historyResult = await callAdminGenerationToolProxy(server, { operation: 'history', prompt_id: promptID })
  const historyData = isRecord(historyResult) && isRecord(historyResult.data) ? historyResult.data : {}
  const outputs = extractComfyUIHistoryImageOutputs(historyData, promptID)
  const outputName = getOptionalString(args, 'output_name') ?? getOptionalString(args, 'outputName') ?? 'comfyui-output'
  const folderID = getOptionalString(args, 'folder_id') ?? getOptionalString(args, 'folderId')
  const outputResources = []
  for (let index = 0; index < outputs.length; index += 1) {
    const viewResult = await callAdminGenerationToolProxy(server, {
      operation: 'view',
      filename: outputs[index].filename,
      subfolder: outputs[index].subfolder,
      file_type: outputs[index].type,
    })
    const viewData = isRecord(viewResult) && isRecord(viewResult.data) ? viewResult.data : {}
    const base64 = typeof viewData.base64 === 'string' ? viewData.base64 : ''
    if (!base64) continue
    const mimeType = typeof viewData.mime_type === 'string' && viewData.mime_type.trim() ? viewData.mime_type.trim() : mimeTypeFromFilename(outputs[index].filename)
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
    const filename = `${safeFilenameStem(outputName)}-${index + 1}.${mimeExtension(mimeType)}`
    outputResources.push(await backendUploadResource(bytes, filename, mimeType, folderID))
  }
  const outputResourceIds = outputResources.map(resourceIDFromUpload).filter((id): id is number => id !== undefined)
  const candidateResults = await attachImportedOutputCandidates(outputResourceIds, args, 'tool_comfyui')
  return {
    status: 'ok',
    server: sanitizeGenerationToolServerForMCP(server),
    data: {
      prompt_id: promptID,
      output_count: outputs.length,
      imported: true,
    },
    output_resources: outputResources,
    output_resource_ids: outputResourceIds,
    ...(candidateResults.length > 0 ? { candidate_results: candidateResults } : {}),
    message: outputResourceIds.length > 0
      ? `Imported ${outputResourceIds.length} ComfyUI output image(s) into resources.`
      : 'No ComfyUI image outputs were imported from history.',
  }
}

function extractComfyUIHistoryImageOutputs(historyData: Record<string, unknown>, promptID: string): Array<{ filename: string; subfolder: string; type: string }> {
  const promptHistory = isRecord(historyData[promptID]) ? historyData[promptID] : historyData
  const outputs = isRecord(promptHistory.outputs) ? promptHistory.outputs : {}
  const out: Array<{ filename: string; subfolder: string; type: string }> = []
  for (const nodeOutput of Object.values(outputs)) {
    if (!isRecord(nodeOutput) || !Array.isArray(nodeOutput.images)) continue
    for (const image of nodeOutput.images) {
      if (!isRecord(image) || typeof image.filename !== 'string' || !image.filename.trim()) continue
      out.push({
        filename: image.filename.trim(),
        subfolder: typeof image.subfolder === 'string' ? image.subfolder : '',
        type: typeof image.type === 'string' && image.type.trim() ? image.type.trim() : 'output',
      })
    }
  }
  return out
}

async function fetchComfyUIImageOutput(server: GenerationToolServer, output: { filename: string; subfolder: string; type: string }): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const params = new URLSearchParams()
  params.set('filename', output.filename)
  if (output.subfolder) params.set('subfolder', output.subfolder)
  params.set('type', output.type)
  const res = await fetchWithTimeout(`${server.baseURL}/view?${params.toString()}`, {
    method: 'GET',
    headers: generationToolServerHeaders(server, false),
  }, server.timeoutMS)
  if (!res.ok) {
    const rawBody = await res.text()
    throw new Error(`comfyui server ${server.name} GET /view failed: HTTP ${res.status} ${rawBody.slice(0, 300)}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || mimeTypeFromFilename(output.filename)
  return { bytes, mimeType }
}
