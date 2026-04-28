# Agent UI

`@movscript/ui` provides product-neutral agent chat primitives. They only handle layout,
visual states, and interaction surfaces. Consumers own data fetching, routing, streaming,
tool execution, and persistence.

Import the shared CSS once near the app root:

```tsx
import "@movscript/tokens/theme.css";
import "@movscript/ui/styles.css";
```

Recommended composition:

```tsx
import {
  AgentBody,
  AgentComposer,
  AgentComposerAction,
  AgentComposerField,
  AgentComposerSubmit,
  AgentComposerToolbar,
  AgentConversationItem,
  AgentHeader,
  AgentHeaderActions,
  AgentHeaderContent,
  AgentMain,
  AgentMessage,
  AgentMessageAvatar,
  AgentMessageBody,
  AgentMessageContent,
  AgentMessageMeta,
  AgentShell,
  AgentSidebar,
  AgentSidebarHeader,
  AgentSidebarSection,
  AgentSidebarTitle,
  AgentStatus,
  AgentSuggestion,
  AgentSuggestions,
  AgentThread,
  AgentTitle,
  AgentToolCall,
  Button,
  CopyIcon,
  MoreHorizontalIcon,
  PlusIcon
} from "@movscript/ui";

export function AgentChat() {
  return (
    <AgentShell>
      <AgentSidebar>
        <AgentSidebarHeader>
          <AgentSidebarTitle>Chats</AgentSidebarTitle>
          <Button size="icon-sm" variant="ghost" aria-label="New chat">
            <PlusIcon />
          </Button>
        </AgentSidebarHeader>
        <AgentSidebarSection>
          <AgentConversationItem
            active
            title="Storyboard cleanup"
            description="Shot pacing and transition notes"
            meta="2m"
          />
          <AgentConversationItem title="Asset prompt ideas" description="Visual style exploration" />
        </AgentSidebarSection>
      </AgentSidebar>

      <AgentMain>
        <AgentHeader>
          <AgentHeaderContent>
            <AgentTitle>Storyboard cleanup</AgentTitle>
            <AgentStatus state="running">Thinking</AgentStatus>
          </AgentHeaderContent>
          <AgentHeaderActions>
            <Button size="icon-sm" variant="ghost" aria-label="More">
              <MoreHorizontalIcon />
            </Button>
          </AgentHeaderActions>
        </AgentHeader>

        <AgentBody>
          <AgentThread>
            <AgentMessage role="user">
              <AgentMessageAvatar label="U" />
              <AgentMessageBody>
                <AgentMessageMeta>You</AgentMessageMeta>
                <AgentMessageContent>Help tighten the second act pacing.</AgentMessageContent>
              </AgentMessageBody>
            </AgentMessage>

            <AgentMessage role="assistant">
              <AgentMessageAvatar label="AI" />
              <AgentMessageBody>
                <AgentMessageMeta>
                  MovScript Agent
                  <Button size="icon-xs" variant="ghost" aria-label="Copy">
                    <CopyIcon />
                  </Button>
                </AgentMessageMeta>
                <AgentMessageContent>
                  Start by merging the two exposition beats before the turning point, then make
                  the transition into scene 12 action-led.
                </AgentMessageContent>
                <AgentToolCall state="done" title="Analyzed script beats" meta="1.4s">
                  Found three adjacent low-conflict scenes in the middle section.
                </AgentToolCall>
              </AgentMessageBody>
            </AgentMessage>

            <AgentSuggestions>
              <AgentSuggestion>Rewrite scene 12</AgentSuggestion>
              <AgentSuggestion>List pacing issues</AgentSuggestion>
              <AgentSuggestion>Create edit notes</AgentSuggestion>
            </AgentSuggestions>
          </AgentThread>
        </AgentBody>

        <AgentComposer>
          <AgentComposerField placeholder="Ask the agent to revise, analyze, or plan..." />
          <AgentComposerToolbar>
            <AgentComposerAction aria-label="Attach file" />
            <AgentComposerSubmit />
          </AgentComposerToolbar>
        </AgentComposer>
      </AgentMain>
    </AgentShell>
  );
}
```

