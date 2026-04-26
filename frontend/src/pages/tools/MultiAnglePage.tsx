import { ToolDialog } from './ToolDialog'

export default function MultiAnglePage() {
  return (
    <ToolDialog
      nodeType="multi_angle"
      capability="image"
      toolName="多角度"
      toolDescription="从单张图片生成角色或物体的多个角度视图"
      inputType="image"
      outputType="image"
      promptPlaceholder="描述你想要生成的角度或视角… 输入 @ 可引用资源库中的图片"
    />
  )
}
