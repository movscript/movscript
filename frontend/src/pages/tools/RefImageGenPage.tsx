import { ToolDialog } from './ToolDialog'

export default function RefImageGenPage() {
  return (
    <ToolDialog
      nodeType="ref_image_gen"
      capability="image"
      toolName="参考生图"
      toolDescription="以参考图为基础，生成新的图像"
      inputType="image"
      outputType="image"
      promptPlaceholder="描述你想生成的图像内容… 输入 @ 可引用资源库中的图片"
    />
  )
}
