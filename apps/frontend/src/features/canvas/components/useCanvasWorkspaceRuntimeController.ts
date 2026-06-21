import {
  useCanvasResourceIntegration,
} from '@/features/canvas/integrations/resources'
import { useCanvasRuntimeControls } from '@/features/canvas/presentation/useCanvasRuntimeControls'

type CanvasRuntimeControlsInput = Parameters<typeof useCanvasRuntimeControls>[0]

export function useCanvasWorkspaceRuntimeController({
  removeFailedMessage,
  ...input
}: Omit<CanvasRuntimeControlsInput, 'resourceById'> & {
  removeFailedMessage: string
}) {
  const resourceIntegration = useCanvasResourceIntegration({
    removeFailedMessage,
  })
  const runtimeControls = useCanvasRuntimeControls({
    ...input,
    resourceById: resourceIntegration.nodeResourceById,
  })

  return {
    ...resourceIntegration,
    ...runtimeControls,
  }
}
