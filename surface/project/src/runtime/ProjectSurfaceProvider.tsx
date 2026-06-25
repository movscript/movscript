import { createContext, useContext, type ReactNode } from 'react'

import type { ProjectSurfaceRuntime } from './ProjectSurfaceRuntime.js'

const ProjectSurfaceRuntimeContext = createContext<ProjectSurfaceRuntime | undefined>(undefined)

export interface ProjectSurfaceProviderProps {
  runtime: ProjectSurfaceRuntime
  children: ReactNode
}

export function ProjectSurfaceProvider({ runtime, children }: ProjectSurfaceProviderProps) {
  return (
    <ProjectSurfaceRuntimeContext.Provider value={runtime}>
      {children}
    </ProjectSurfaceRuntimeContext.Provider>
  )
}

export function useProjectSurfaceRuntime(): ProjectSurfaceRuntime {
  const runtime = useContext(ProjectSurfaceRuntimeContext)
  if (!runtime) {
    throw new Error('ProjectSurfaceRuntime is missing. Wrap this surface with ProjectSurfaceProvider.')
  }
  return runtime
}

export function useOptionalProjectSurfaceRuntime(): ProjectSurfaceRuntime | undefined {
  return useContext(ProjectSurfaceRuntimeContext)
}
