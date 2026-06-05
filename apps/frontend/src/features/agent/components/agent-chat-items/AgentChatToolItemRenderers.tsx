import {
  AgentChatContentStack,
  AgentChatMessage,
  AgentMessageSection,
} from '@movscript/ui'
import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'
import {
  agentChatCollabAgentToolCallView,
  agentChatCommandExecutionView,
  agentChatFileChangeView,
  agentChatImageItemView,
  agentChatToolCallView,
  agentChatWebSearchView,
} from '@/features/agent/domain/agentChatToolResultViews'
import {
  AgentChatImagePreviewGrid,
  AgentChatInlineList,
  AgentChatMediaPreviewGrid,
  AgentChatPreviewBlock,
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatCommandExecutionItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'commandExecution' }> }) {
  const view = agentChatCommandExecutionView(item)
  return (
    <AgentChatMessage role="tool" avatar="$">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.actions.length ? (
            <AgentChatInlineList
              label="Actions"
              values={view.actions}
            />
          ) : null}
          {view.terminalInput.length ? (
            <AgentChatInlineList
              label="Terminal input"
              values={view.terminalInput}
            />
          ) : null}
          {view.terminalInputDetails.length ? (
            <AgentChatPreviewBlock
              label="Terminal input details"
              value={view.terminalInputDetails}
              contentKind="rawDetails"
            />
          ) : null}
          {view.output ? (
            <AgentChatTextBlock label="Output" value={view.output} tone="process" />
          ) : null}
          {view.rawDetails !== undefined ? (
            <AgentChatPreviewBlock label="Command details" value={view.rawDetails} contentKind="rawDetails" />
          ) : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatToolCallItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }> }) {
  const view = agentChatToolCallView(item)
  return (
    <AgentChatMessage role="tool" avatar="T">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.argumentsDetails !== undefined ? <AgentChatPreviewBlock label="Arguments" value={view.argumentsDetails} contentKind="arguments" /> : null}
          {view.dynamicOutput && view.dynamicOutput.summary.length > 0 ? <AgentChatInlineList label="Output" values={view.dynamicOutput.summary} /> : null}
          {view.dynamicOutput?.texts.map((output) => (
            <AgentChatTextBlock key={output.key} label={output.label} value={output.value} tone="result" contentKind="result" />
          ))}
          {view.dynamicOutput && view.dynamicOutput.images.length > 0 ? <AgentChatImagePreviewGrid label="Output images" images={view.dynamicOutput.images} /> : null}
          {view.dynamicOutput && view.dynamicOutput.mediaPreviews.length > 0 ? <AgentChatMediaPreviewGrid label="Output media previews" media={view.dynamicOutput.mediaPreviews} /> : null}
          {view.dynamicOutput && view.dynamicOutput.media.length > 0 ? <AgentChatInlineList label="Output media" values={view.dynamicOutput.media} /> : null}
          {view.dynamicOutputDetails !== undefined ? <AgentChatPreviewBlock label="Output details" value={view.dynamicOutputDetails} contentKind="rawDetails" /> : null}
          {view.dynamicResult !== undefined ? <AgentChatPreviewBlock label="Result" value={view.dynamicResult} tone="result" contentKind="result" /> : null}
          {view.dynamicError !== undefined ? <AgentChatPreviewBlock label="Error" value={view.dynamicError} tone="diagnostic" contentKind="error" /> : null}
          {view.mcpProgress.length ? <AgentChatInlineList label="Progress" values={view.mcpProgress} /> : null}
          {view.mcpPending.length > 0 ? <AgentChatInlineList label="Pending" values={view.mcpPending} /> : null}
          {view.mcpResult?.summary.length ? <AgentChatInlineList label="Content" values={view.mcpResult.summary} /> : null}
          {view.mcpResult?.texts.map((content) => (
            <AgentChatTextBlock key={content.key} label={content.label} value={content.value} tone="result" contentKind="result" />
          ))}
          {view.mcpResult && view.mcpResult.images.length > 0 ? <AgentChatImagePreviewGrid label="Content images" images={view.mcpResult.images} /> : null}
          {view.mcpResult && view.mcpResult.mediaPreviews.length > 0 ? <AgentChatMediaPreviewGrid label="Content media previews" media={view.mcpResult.mediaPreviews} /> : null}
          {view.mcpResult && view.mcpResult.media.length > 0 ? <AgentChatInlineList label="Content media" values={view.mcpResult.media} /> : null}
          {view.mcpResult?.structuredContent !== undefined ? <AgentChatPreviewBlock label="Structured content" value={view.mcpResult.structuredContent} tone="result" contentKind="result" /> : null}
          {view.mcpResultDetails !== undefined ? <AgentChatPreviewBlock label="Result details" value={view.mcpResultDetails} tone="result" contentKind="rawDetails" /> : null}
          {view.mcpError !== undefined ? <AgentChatPreviewBlock label="Error" value={view.mcpError} tone="diagnostic" contentKind="error" /> : null}
          {view.rawDetails !== undefined ? <AgentChatPreviewBlock label="Tool details" value={view.rawDetails} contentKind="rawDetails" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatFileChangeItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'fileChange' }> }) {
  const view = agentChatFileChangeView(item)
  return (
    <AgentChatMessage role="tool" avatar="F">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.summary.length ? <AgentChatInlineList label="Summary" values={view.summary} /> : null}
          {view.patches.map((patch) => (
            <AgentChatTextBlock key={patch.key} label={patch.label} value={patch.value} tone={view.tone} contentKind="rawDetails" />
          ))}
          {view.details ? <AgentChatTextBlock label="Details" value={view.details} tone={view.tone} contentKind="rawDetails" /> : null}
          {view.rawDetails !== undefined ? <AgentChatPreviewBlock label="File change details" value={view.rawDetails} contentKind="rawDetails" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatCollabAgentToolCallItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'collabAgentToolCall' }> }) {
  const view = agentChatCollabAgentToolCallView(item)
  return (
    <AgentChatMessage role="tool" avatar="A">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.prompt ? <AgentChatTextBlock label="Prompt" value={view.prompt} tone="process" contentKind="prompt" /> : null}
          {view.threads.length > 0 ? (
            <AgentChatInlineList label="Threads" values={view.threads} />
          ) : null}
          {view.agentStates.length > 0 ? (
            <AgentChatInlineList
              label="Agents"
              values={view.agentStates}
            />
          ) : null}
          {view.rawDetails !== undefined ? <AgentChatPreviewBlock label="Collab details" value={view.rawDetails} contentKind="rawDetails" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatWebSearchItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'webSearch' }> }) {
  const view = agentChatWebSearchView(item)
  return (
    <AgentChatMessage role="tool" avatar="W">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          <AgentChatTextBlock label="Query" value={view.query} tone="process" />
          {view.actionSummary.length ? <AgentChatInlineList label="Action" values={view.actionSummary} /> : null}
          {view.actionDetails ? <AgentChatPreviewBlock label="Action details" value={view.actionDetails} contentKind="rawDetails" /> : null}
          {view.rawDetails !== undefined ? <AgentChatPreviewBlock label="Search details" value={view.rawDetails} contentKind="rawDetails" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatImageItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'imageView' | 'imageGeneration' }> }) {
  const view = agentChatImageItemView(item)
  return (
    <AgentChatMessage role="tool" avatar="I">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.revisedPrompt ? (
            <AgentChatTextBlock label="Revised prompt" value={view.revisedPrompt} tone="process" contentKind="prompt" />
          ) : null}
          {view.viewedImages.length > 0 ? (
            <AgentChatImagePreviewGrid label="Image preview" images={view.viewedImages} />
          ) : null}
          {view.generatedImages.length > 0 ? (
            <AgentChatImagePreviewGrid label="Generated image" images={view.generatedImages} />
          ) : null}
          {view.path ? (
            <AgentChatTextBlock label="Path" value={view.path} tone="process" />
          ) : null}
          {view.result ? (
            <AgentChatTextBlock label="Result" value={view.result} tone="result" />
          ) : null}
          {view.savedPath ? (
            <AgentChatTextBlock label="Saved path" value={view.savedPath} tone="result" />
          ) : null}
          {view.rawDetails !== undefined ? <AgentChatPreviewBlock label="Image details" value={view.rawDetails} contentKind="rawDetails" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
