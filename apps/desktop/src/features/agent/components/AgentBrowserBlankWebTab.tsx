import { useState } from 'react'
import { ArrowRight, Clapperboard, Globe2, HardDrive, LayoutTemplate, ScanSearch } from 'lucide-react'
import {
  AgentBrowserInput,
  AgentBrowserLauncherSubmitButton,
} from '@/features/agent/components/AgentBrowserUi'
import {
  AgentBrowserBlankContent,
  AgentBrowserBlankForm,
  AgentBrowserDividerSection,
  AgentBrowserInputRow,
  AgentBrowserNavButton,
  AgentBrowserNavGrid,
  AgentBrowserSectionIntro,
  AgentBrowserSectionLabel,
} from '@/features/agent/components/AgentBrowserInternalPageUi'

export function AgentBrowserBlankWebTab({
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
  onOpenEditingProjects,
  onSubmit,
}: {
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
  onOpenEditingProjects: () => void
  onSubmit: (url: string) => void
}) {
  const [value, setValue] = useState('')
  const navItems = [
    {
      title: '资源库',
      description: '搜索、上传和预览可引用资源',
      icon: HardDrive,
      action: onOpenResourceLibrary,
    },
    {
      title: '外部资源',
      description: '搜索外部图片和视频并加入素材库',
      icon: ScanSearch,
      action: onOpenExternalResourceLibrary,
    },
    {
      title: '画布列表',
      description: '查看、创建和打开项目画布',
      icon: LayoutTemplate,
      action: onOpenCanvasList,
    },
    {
      title: '剪辑',
      description: '打开剪辑项目和媒体时间线',
      icon: Clapperboard,
      action: onOpenEditingProjects,
    },
  ]

  return (
    <AgentBrowserBlankForm
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <AgentBrowserBlankContent>
        <AgentBrowserSectionIntro
          title="空白页"
          description="输入网址，或打开常用工作区。"
        />
        <AgentBrowserNavGrid>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <AgentBrowserNavButton
                key={item.title}
                icon={<Icon size={18} />}
                title={item.title}
                description={item.description}
                trailing={<ArrowRight size={14} />}
                onClick={item.action}
              />
            )
          })}
        </AgentBrowserNavGrid>
        <AgentBrowserDividerSection>
          <AgentBrowserSectionLabel icon={<Globe2 size={13} />}>
            打开网页
          </AgentBrowserSectionLabel>
          <AgentBrowserInputRow>
            <AgentBrowserInput value={value} onChange={(event) => setValue(event.target.value)} placeholder="网址或搜索" />
            <AgentBrowserLauncherSubmitButton disabled={!value.trim()}>打开</AgentBrowserLauncherSubmitButton>
          </AgentBrowserInputRow>
        </AgentBrowserDividerSection>
      </AgentBrowserBlankContent>
    </AgentBrowserBlankForm>
  )
}
