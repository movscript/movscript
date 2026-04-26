import { ToolDialog } from './ToolDialog'

export default function StyleTransferPage() {
  return (
    <ToolDialog
      nodeType="style_transfer"
      capability="image"
      toolName="画风迁移"
      toolDescription="将参考图的艺术风格迁移到内容图上，生成新的风格化图像"
      inputType="image"
      outputType="image"
      promptPlaceholder="描述目标内容，AI 将使用参考图的画风重新绘制… 输入 @ 可引用资源库中的图片"
    />
  )
}
