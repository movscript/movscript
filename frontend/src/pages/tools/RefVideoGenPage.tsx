import { ToolDialog } from './ToolDialog'

export default function RefVideoGenPage() {
  return (
    <ToolDialog
      nodeType="ref_video_gen"
      capability="video"
      toolName="参考生视频"
      toolDescription="以参考视频为基础，生成新的视频"
      inputType="image+video"
      outputType="video"
      promptPlaceholder="描述想要生成的视频内容… 输入 @ 可引用资源库中的图片或视频"
    />
  )
}
