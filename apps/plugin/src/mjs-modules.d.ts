declare module '*.mjs' {
  export function runCanvasServiceCLI(args?: string[], env?: NodeJS.ProcessEnv): Promise<void>
  export function runEditingServiceCLI(args?: string[], env?: NodeJS.ProcessEnv): Promise<void>
  export function runMediaPipelineServiceCLI(args?: string[], env?: NodeJS.ProcessEnv): Promise<void>
  export function runProjectServiceCLI(args?: string[], env?: NodeJS.ProcessEnv): Promise<void>
}
