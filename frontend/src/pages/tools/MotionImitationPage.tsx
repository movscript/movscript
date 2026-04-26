import { ToolDialog } from './ToolDialog'

export default function MotionImitationPage() {
  return (
    <ToolDialog
      nodeType="motion_imitation"
      capability="video"
      toolName="动作迁移"
      toolDescription="将参考视频的动作迁移到目标角色上，生成新的动作视频"
      inputType="image+video"
      outputType="video"
      promptPlaceholder="（可选）描述目标角色的外观，AI 将把参考视频的动作迁移到该角色… 输入 @ 可引用资源库中的图片或视频"
    />
  )
}
