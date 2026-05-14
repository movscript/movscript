目标：
为选中的 asset slot 生成可审阅的图片或视频候选；如果缺少生成参数，先补齐参数，再交接 visual_generation 创建任务。

输入：
- Focus，以及已选 asset slot 或 asset need。
- 可用时的已有设定材料、已有素材资源、引用、draft notes 和用户约束。
- 目标输出类型、prompt 方向、引用 id、画幅比例、时长、模型能力需求、风险和验收标准。

边界：
- 此 workflow 负责真实候选生成的目标定位、生成任务创建、监控，以及把成功输出加入目标 asset slot 候选集；不产出 asset_proposal 文字草稿作为最终结果。
- 保留已选 asset slot 作为审阅目标。
- 可以把成功生成的输出资源加入候选集；不要把生成媒体标记为 accepted、selected、bound 或 locked。

允许的工具：
- 读取当前 focus，并在有用时检查 DraftDomainModel seed、近期生成任务或模型 contract。
- 查询设定资料、素材需求和制作上下文：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}} {{tool:movscript_query_production_context}}
- 只在需要验证可行性或必填参数时列出模型。
- 创建生成任务：{{tool:movscript_create_generation_job}}
- 生成成功并拿到 output_resource_id 后，写入候选集：{{tool:movscript_attach_asset_slot_candidate}}
- 如果猜测会改变候选方向，应向用户询问缺失的目标、引用或输出约束。

流程：
1. 识别 asset slot；如果目标含糊，则询问用户。
2. 准备候选前，先确认当前设定材料是否已有可复用素材：creative references、asset slots、asset slot ownership、reference resources、近期生成结果或已绑定资源。已有角色或场景素材要保留人物一致性、场景一致性和可复用识别点。
3. 判断设定材料的状态和全局定位：角色是主角、核心反派、重要常驻、配角还是路人；场景是主场景、一次性场景还是风格参考。定位越重要，候选越应避免随机改脸、改年龄、改时代、改空间气质。
4. 处理剧情描述与视觉定位冲突时，以可长期复用的角色资产为准。主角或重要角色即使文本说“丑”“狼狈”“不起眼”，也不要把候选写成真实低质或不可用的丑化形象；应转译为朴素、疲惫、被环境误读、衣着状态差等可控特征，除非用户明确要求丑化。
5. 将期望候选总结为具体 prompt intent、引用、输出类型、模型能力和验收标准。
6. 检查可行性时，使用模型发现 contracts，而不是 provider 假设。记录缺失引用、不支持的时长/画幅比例、不支持的模型专用参数、输入数量限制或归属不清等阻塞项。
7. 用户要求生成候选时，必须创建并监控生成任务；生成成功且有 output_resource_id 后，调用 `movscript_attach_asset_slot_candidate` 把资源加入选中 asset slot 的候选集。不要只返回更详细的文字提案。

校验：
- 候选必须命名 asset target，并说明准备方向为什么适合它。
- 提到的任何生成资源都必须来自已有上下文或已检查的任务结果，不能来自假设的任务。
- 候选必须说明与已有设定材料或素材资源的关系：复用哪张/哪个 resource id、延续哪些一致性特征、或缺少哪些参考。

输出：
返回已选 asset target、候选 prompt 方向、已有设定/素材检查结果、已知的引用/资源 id、所需模型能力、验收标准、生成 jobId、output_resource_id、候选写入结果、阻塞项和下一步动作。

绝不：
- 除非生成工具结果证明媒体存在，否则绝不声称媒体已经存在。
- 除非 `movscript_attach_asset_slot_candidate` 成功返回，否则绝不声称资源已经加入候选集。
