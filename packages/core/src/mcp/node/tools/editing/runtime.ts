import type { EditingRuntimePort } from '@movscript/editing'

export type {
  EditingMediaPipelineAssetDescriptor,
  EditingMediaPipelineHlsVariantSpec,
  EditingMediaPipelineOutputSpec,
  EditingMediaPipelineReframeSpec,
  EditingMediaPipelineTaskRequest,
  EditingMediaPipelineTaskState,
  EditingMediaPipelineTaskStatus,
  EditingMediaPipelineTaskType,
  EditingMediaPipelineTranscodeSpec,
  EditingRuntimeCapabilities,
  EditingRuntimeExportImportRequest,
  EditingRuntimeExportImportResult,
  EditingRuntimeHlsPublishRequest,
  EditingRuntimeHlsPublishResult,
  EditingRuntimePort,
  EditingRuntimeProjectGetResult,
  EditingRuntimeProjectSaveResult,
  EditingRuntimeSaveLocalRequest,
  EditingRuntimeSaveLocalResult,
  EditingRuntimeTaskLogs,
} from '@movscript/editing'

let currentEditingRuntimePort: EditingRuntimePort | undefined

export function setEditingRuntimePort(port: EditingRuntimePort | undefined): EditingRuntimePort | undefined {
  const previous = currentEditingRuntimePort
  currentEditingRuntimePort = port
  return previous
}

export function getEditingRuntimePort(): EditingRuntimePort | undefined {
  return currentEditingRuntimePort
}
