import { getOptionalString } from '../generationConnectors/params'
import { isRecord } from '../valueUtils'
import { attachImportedOutputCandidates } from './candidateLinks'
import { decodeBase64Image, mimeExtension, safeFilenameStem } from './fileUtils'
import { backendUploadResource, resourceIDFromUpload } from './resourceUploads'

export async function maybeImportWebUIOutputs(result: unknown, args: Record<string, unknown>): Promise<unknown> {
  if (args.import_outputs !== true) return result
  const resultRecord = isRecord(result) ? result : {}
  const data = isRecord(resultRecord.data) ? resultRecord.data : {}
  const images = Array.isArray(data.images) ? data.images.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
  if (images.length === 0) return result

  const outputName = getOptionalString(args, 'output_name') ?? getOptionalString(args, 'outputName') ?? 'webui-output'
  const folderID = getOptionalString(args, 'folder_id') ?? getOptionalString(args, 'folderId')
  const outputResources = []
  for (let index = 0; index < images.length; index += 1) {
    const decoded = decodeBase64Image(images[index])
    const filename = `${safeFilenameStem(outputName)}-${index + 1}.${mimeExtension(decoded.mimeType)}`
    outputResources.push(await backendUploadResource(decoded.bytes, filename, decoded.mimeType, folderID))
  }
  const outputResourceIds = outputResources.map(resourceIDFromUpload).filter((id): id is number => id !== undefined)
  const candidateResults = await attachImportedOutputCandidates(outputResourceIds, args, 'tool_webui')
  return {
    ...resultRecord,
    data: {
      ...data,
      images: undefined,
      image_count: images.length,
      imported: true,
    },
    output_resources: outputResources,
    output_resource_ids: outputResourceIds,
    ...(candidateResults.length > 0 ? { candidate_results: candidateResults } : {}),
    message: outputResourceIds.length > 0
      ? `Imported ${outputResourceIds.length} WebUI output image(s) into resources.`
      : 'WebUI returned images, but no resource IDs were created.',
  }
}
