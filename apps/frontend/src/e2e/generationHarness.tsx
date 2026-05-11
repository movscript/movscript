import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import '@/index.css'
import { GenerationJobSummaryCard, GenerationProgressCard, GenerationTraceSummaryCard } from '@/components/agent/GenerationCards'
import { GeneratedResultCard } from '@/components/agent/GeneratedResultCard'
import { replayGenerationTrace } from '@/lib/agentGenerationMedia'
import { generationTraceReplayFixtures } from '@/lib/agentGenerationTraceFixtures'
import type { AgentAttachment } from '@/store/agentStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

function GenerationHarness() {
  const successFixture = generationTraceReplayFixtures.find((fixture) => fixture.name === 'sanitized provider trace: image succeeds after polling')
  if (!successFixture) throw new Error('missing provider success fixture')
  const replay = replayGenerationTrace(successFixture.events)
  const resource = replay.outputResources[0]
  if (!resource) throw new Error('missing generated resource')

  const attachments: AgentAttachment[] = [{
    id: `resource-${resource.ID}`,
    name: resource.name,
    type: resource.type === 'image' || resource.type === 'video' ? resource.type : 'file',
    mimeType: resource.mime_type,
    size: resource.size,
    url: resource.url,
    resourceId: resource.ID,
    generated: replay.metadataByResourceId.get(resource.ID),
  }]

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen bg-background p-6 text-foreground">
        <section className="mx-auto grid max-w-xl gap-4">
          <GenerationProgressCard state={{
            jobId: 2001,
            jobType: 'image',
            providerName: 'Sanitized Image Provider',
            modelDisplay: 'Provider Image Model',
            status: 'running',
            stage: 'generating',
            progress: 47,
            terminal: false,
            firstSeenAt: '2026-05-09T12:00:00.000Z',
            updatedAt: '2026-05-09T12:00:08.000Z',
          }} />
          <GenerationJobSummaryCard jobs={replay.jobs} />
          <GenerationTraceSummaryCard jobs={replay.jobs} />
          <GeneratedResultCard attachments={attachments} projectId={123} />
        </section>
      </main>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(<GenerationHarness />)
