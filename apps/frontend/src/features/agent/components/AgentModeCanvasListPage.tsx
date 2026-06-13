import {
  AgentPageDescription,
  AgentPageEyebrowRow,
  AgentPageHeaderContent,
  AgentPageHeaderCopy,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
} from '@movscript/ui'
import { LayoutTemplate } from 'lucide-react'

import { CanvasListView } from '@/features/canvas/components/CanvasListView'

export default function AgentModeCanvasListPage() {
  return (
    <AgentPageShell>
      <AgentPageShellHeader>
        <AgentPageHeaderContent>
          <AgentPageHeaderCopy>
            <AgentPageEyebrowRow>
              <LayoutTemplate size={15} />
              <span>Agent 模式</span>
            </AgentPageEyebrowRow>
            <h1 className="type-title font-semibold text-foreground">画布列表</h1>
            <AgentPageDescription>
              管理会话项目可供 Agent 参考和执行的画布。
            </AgentPageDescription>
          </AgentPageHeaderCopy>
        </AgentPageHeaderContent>
      </AgentPageShellHeader>

      <AgentPageShellBody>
        <CanvasListView source="agent" className="agent-canvas-list-view" />
      </AgentPageShellBody>
    </AgentPageShell>
  )
}
