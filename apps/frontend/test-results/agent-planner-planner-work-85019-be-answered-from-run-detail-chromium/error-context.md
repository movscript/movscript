# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agent-planner.spec.ts >> planner worker input can be answered from run detail
- Location: src/e2e/agent-planner.spec.ts:158:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('agent-run-header')
Expected substring: "queued"
Received string:    "Agent 运行排队中run_worker_input_e2e上级根运行取消 worker返回刷新"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByTestId('agent-run-header')
    2 × locator resolved to <header data-testid="agent-run-header" class="border-b border-border px-5 py-4">…</header>
      - unexpected value "Agent 运行等待处理run_worker_input_e2e上级根运行取消 worker返回刷新"
    6 × locator resolved to <header data-testid="agent-run-header" class="border-b border-border px-5 py-4">…</header>
      - unexpected value "Agent 运行排队中run_worker_input_e2e上级根运行取消 worker返回刷新"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - button "展开" [ref=e6] [cursor=pointer]:
        - img [ref=e8]
      - navigation [ref=e11]:
        - generic [ref=e12]:
          - link "E2E Demo Project" [ref=e13] [cursor=pointer]:
            - /url: /projects
            - img [ref=e14]
          - link "首页" [ref=e16] [cursor=pointer]:
            - /url: /project-home
            - img [ref=e17]
          - link "剧本" [ref=e20] [cursor=pointer]:
            - /url: /scripts
            - img [ref=e21]
          - link "制作" [ref=e24] [cursor=pointer]:
            - /url: /production
            - img [ref=e25]
          - link "任务" [ref=e27] [cursor=pointer]:
            - /url: /collaboration
            - img [ref=e28]
          - link "交付" [ref=e31] [cursor=pointer]:
            - /url: /delivery
            - img [ref=e32]
        - generic [ref=e38]:
          - link "项目规范" [ref=e39] [cursor=pointer]:
            - /url: /project-workspace
            - img [ref=e40]
          - link "前期准备" [ref=e44] [cursor=pointer]:
            - /url: /pre-production
            - img [ref=e45]
          - link "制作编排" [ref=e53] [cursor=pointer]:
            - /url: /production-orchestrate
            - img [ref=e54]
          - link "内容编排" [ref=e58] [cursor=pointer]:
            - /url: /content-unit-orchestrate
            - img [ref=e59]
          - link "制作预演" [ref=e62] [cursor=pointer]:
            - /url: /workbench/production-plan
            - img [ref=e63]
          - link "交付门禁" [ref=e67] [cursor=pointer]:
            - /url: /delivery/workbench
            - img [ref=e68]
        - generic [ref=e73]:
          - link "画布" [ref=e74] [cursor=pointer]:
            - /url: /canvases
            - img [ref=e75]
          - link "参考生图" [ref=e77] [cursor=pointer]:
            - /url: /tools/ref-image-gen
            - img [ref=e78]
          - link "参考生视频" [ref=e83] [cursor=pointer]:
            - /url: /tools/ref-video-gen
            - img [ref=e84]
          - link "动作迁移" [ref=e87] [cursor=pointer]:
            - /url: /tools/motion-imitation
            - img [ref=e88]
          - link "画风迁移" [ref=e93] [cursor=pointer]:
            - /url: /tools/style-transfer
            - img [ref=e94]
          - link "多角度" [ref=e100] [cursor=pointer]:
            - /url: /tools/multi-angle
            - img [ref=e101]
          - link "剪辑工具" [ref=e105] [cursor=pointer]:
            - /url: /tools/video-edit
            - img [ref=e106]
          - link "AI生文" [ref=e112] [cursor=pointer]:
            - /url: /tools/brainstorm
            - img [ref=e113]
          - link "智能分镜" [ref=e125] [cursor=pointer]:
            - /url: /tools/smart-storyboard
            - img [ref=e126]
        - generic [ref=e130]:
          - link "资源库" [ref=e131] [cursor=pointer]:
            - /url: /resources
            - img [ref=e132]
          - link "生成记录" [ref=e135] [cursor=pointer]:
            - /url: /jobs
            - img [ref=e136]
        - generic [ref=e140]:
          - link "AI 草稿" [ref=e141] [cursor=pointer]:
            - /url: /agent/drafts
            - img [ref=e142]
          - link "Agent 设置" [ref=e146] [cursor=pointer]:
            - /url: /agent/settings
            - img [ref=e147]
          - link "Agent 调试" [ref=e150] [cursor=pointer]:
            - /url: /agent/debug
            - img [ref=e151]
          - link "插件" [ref=e153] [cursor=pointer]:
            - /url: /plugins
            - img [ref=e154]
          - link "组织设置" [ref=e157] [cursor=pointer]:
            - /url: /org/settings
            - img [ref=e158]
      - generic "e2e-agent" [ref=e162] [cursor=pointer]:
        - generic [ref=e164]: E
    - generic [ref=e165]:
      - banner [ref=e166]:
        - heading "Movscript" [level=1] [ref=e167]
        - generic [ref=e168]: "- E2E Demo Project"
        - generic [ref=e169]: 语言
        - combobox "语言" [ref=e170]:
          - option "zh-CN" [selected]
          - option "en-US"
        - button "切换到浅色模式" [ref=e171] [cursor=pointer]:
          - img [ref=e173]
      - main [ref=e179]:
        - generic [ref=e180]:
          - generic [ref=e183]:
            - generic [ref=e185]:
              - generic [ref=e186]:
                - generic [ref=e187]:
                  - img [ref=e188]
                  - heading "Agent 运行" [level=1] [ref=e192]
                  - generic [ref=e193]: 排队中
                - paragraph [ref=e194]: run_worker_input_e2e
              - generic [ref=e195]:
                - button "上级" [ref=e196] [cursor=pointer]:
                  - generic [ref=e197]:
                    - img [ref=e198]
                    - text: 上级
                - button "根运行" [ref=e202] [cursor=pointer]:
                  - generic [ref=e203]:
                    - img [ref=e204]
                    - text: 根运行
                - button "取消 worker" [ref=e208] [cursor=pointer]:
                  - generic [ref=e209]:
                    - img [ref=e210]
                    - text: 取消 worker
                - button "返回" [ref=e214] [cursor=pointer]:
                  - generic [ref=e215]:
                    - img [ref=e216]
                    - text: 返回
                - button "刷新" [ref=e218] [cursor=pointer]:
                  - generic [ref=e219]:
                    - img [ref=e220]
                    - text: 刷新
            - main [ref=e225]:
              - complementary [ref=e226]:
                - generic [ref=e227]:
                  - generic [ref=e228]:
                    - generic [ref=e229]: 角色
                    - generic [ref=e230]: 执行器
                  - generic [ref=e231]:
                    - generic [ref=e232]: 子代理
                    - generic [ref=e233]: Turing
                  - generic [ref=e234]:
                    - generic [ref=e235]: 线程
                    - generic [ref=e236]: thread-planner-e2e
                  - generic [ref=e237]:
                    - generic [ref=e238]: 计划
                    - generic [ref=e239]: plan_planner_e2e
                  - generic [ref=e240]:
                    - generic [ref=e241]: 任务
                    - generic [ref=e242]: task_input_review
                  - generic [ref=e243]:
                    - generic [ref=e244]: 上级
                    - generic [ref=e245]: run_planner_e2e
                  - generic [ref=e246]:
                    - generic [ref=e247]: 进度
                    - generic [ref=e248]: 20%
                  - generic [ref=e249]:
                    - generic [ref=e250]: 步骤数
                    - generic [ref=e251]: "1"
                  - generic [ref=e252]:
                    - generic [ref=e253]: 创建于
                    - generic [ref=e254]: 2026-05-12T09:00:04.000Z
                  - generic [ref=e255]:
                    - generic [ref=e256]: 更新于
                    - generic [ref=e257]: 2026-05-12T09:01:40.000Z
                  - generic [ref=e258]:
                    - generic [ref=e259]: 运行摘要
                    - generic [ref=e260]:
                      - generic [ref=e261]: 运行 1
                      - generic [ref=e262]: 工具调用 1
                    - generic [ref=e263]:
                      - generic [ref=e264]: 最新事件
                      - generic [ref=e265]: 行为
                      - generic [ref=e266]: Subagent dispatch tool call
                    - generic [ref=e267]: 本次 run 仍在运行中。
                    - generic [ref=e268]:
                      - generic [ref=e269]: • 2 个 trace 事件，0 次模型调用，1 次工具调用
                      - generic [ref=e270]: • 0 个上下文相关事件
                      - generic [ref=e271]: • 无待审批项
                      - generic [ref=e272]: • 无待输入项
                      - generic [ref=e273]: • 无运行警告
                  - generic [ref=e274]:
                    - generic [ref=e275]: 计划上下文
                    - generic [ref=e276]:
                      - generic [ref=e277]: 计划标题
                      - generic [ref=e278]: Planner 调度 E2E
                    - generic [ref=e279]:
                      - generic [ref=e280]: 计划状态
                      - generic [ref=e281]: 运行中
                    - generic [ref=e282]:
                      - generic [ref=e283]: 任务标题
                      - generic [ref=e284]: 素材范围确认
                    - generic [ref=e285]:
                      - generic [ref=e286]: 任务状态
                      - generic [ref=e287]: 待开始
                    - generic [ref=e288]:
                      - generic [ref=e289]: 任务说明
                      - generic [ref=e290]: Ready when dependencies and worker capacity allow.
                    - generic [ref=e291]:
                      - generic [ref=e292]: 产物数
                      - generic [ref=e293]: "0"
              - generic [ref=e294]:
                - generic [ref=e295]:
                  - generic [ref=e296]:
                    - generic [ref=e297]: 运行轨迹
                    - generic [ref=e298]: 2 个事件
                    - button "行为 2" [ref=e299] [cursor=pointer]:
                      - generic [ref=e300]: 行为 2
                    - generic [ref=e301]: 运行 1
                    - generic [ref=e302]: 工具调用 1
                  - generic [ref=e303]:
                    - textbox "搜索事件" [ref=e304]
                    - combobox [ref=e305] [cursor=pointer]:
                      - generic: 全部事件
                      - img [ref=e306]
                    - combobox [ref=e308] [cursor=pointer]:
                      - generic: 全部分类
                      - img [ref=e309]
                    - button "加载事件" [ref=e311] [cursor=pointer]:
                      - generic [ref=e312]:
                        - img [ref=e313]
                        - text: 加载事件
                - generic [ref=e317]:
                  - generic [ref=e318]:
                    - generic [ref=e319]:
                      - generic [ref=e320]: Planner started
                      - generic [ref=e321]:
                        - button "链接" [ref=e322] [cursor=pointer]:
                          - generic [ref=e323]:
                            - img [ref=e324]
                            - text: 链接
                        - generic [ref=e327]: 行为
                        - generic [ref=e328]: 已开始
                    - generic [ref=e329]:
                      - generic [ref=e330]:
                        - generic [ref=e331]: 运行
                        - generic [ref=e332]: 创建 2026-05-12T09:00:01.000Z
                      - generic [ref=e333]:
                        - generic [ref=e334]: 摘要
                        - generic [ref=e335]: Planner started plan orchestration.
                  - generic [ref=e336]:
                    - generic [ref=e337]:
                      - generic [ref=e338]: Subagent dispatch tool call
                      - generic [ref=e339]:
                        - button "原始数据" [ref=e340] [cursor=pointer]:
                          - generic [ref=e341]: 原始数据
                        - button "复制数据" [ref=e342] [cursor=pointer]:
                          - generic [ref=e343]:
                            - img [ref=e344]
                            - text: 复制数据
                        - button "链接" [ref=e347] [cursor=pointer]:
                          - generic [ref=e348]:
                            - img [ref=e349]
                            - text: 链接
                        - generic [ref=e352]: 行为
                        - generic [ref=e353]: 已完成
                    - generic [ref=e354]:
                      - generic [ref=e355]:
                        - generic [ref=e356]: 工具调用
                        - generic [ref=e357]: 工具 movscript_spawn_subagent
                        - generic [ref=e358]: 创建 2026-05-12T09:00:08.000Z
                        - generic [ref=e359]: 完成 2026-05-12T09:00:12.000Z
                      - generic [ref=e360]:
                        - generic [ref=e361]: 行为
                        - generic [ref=e362]: 调用 movscript_spawn_subagent
                      - generic [ref=e363]:
                        - generic [ref=e364]: 影响
                        - generic [ref=e365]: 工具结果会进入 run step，并可能作为下一轮模型上下文
                      - generic [ref=e366]:
                        - generic [ref=e367]: 摘要
                        - generic [ref=e368]: Spawned worker Einstein.
                      - group [ref=e369]:
                        - generic "上下文摘要" [ref=e370] [cursor=pointer]:
                          - img [ref=e371]
                          - text: 上下文摘要
          - generic [ref=e373]:
            - separator "Resize assistant panel" [ref=e374]
            - main [ref=e378]:
              - generic [ref=e379]:
                - generic [ref=e380]:
                  - generic [ref=e381]:
                    - generic [ref=e382]:
                      - button "收起 AI 助手" [ref=e383] [cursor=pointer]:
                        - img [ref=e385]
                      - heading "AI 助手" [level=1] [ref=e387]
                    - tablist "当前会话标签" [ref=e388]:
                      - generic [ref=e389]:
                        - tab "Planner 调度 E2E" [selected] [ref=e390] [cursor=pointer]:
                          - img [ref=e391]
                          - generic [ref=e393]: Planner 调度 E2E
                          - generic "2 条" [ref=e394]: "2"
                        - button "标签操作" [ref=e395] [cursor=pointer]:
                          - img [ref=e396]
                        - button "关闭标签" [ref=e400] [cursor=pointer]:
                          - img [ref=e401]
                    - paragraph [ref=e404]: Planner 调度 E2E
                  - generic [ref=e405]:
                    - button "新对话" [ref=e406] [cursor=pointer]:
                      - img [ref=e408]
                    - button "会话历史" [ref=e409] [cursor=pointer]:
                      - img [ref=e411]
                - generic [ref=e416]:
                  - generic [ref=e417]:
                    - generic [ref=e418]: 我
                    - generic [ref=e419]:
                      - generic [ref=e420]:
                        - generic [ref=e421]: You
                        - generic [ref=e422]: 17:00
                        - button "Copy message" [ref=e424] [cursor=pointer]:
                          - img [ref=e426]
                      - generic [ref=e430]: 请并行梳理项目素材风险，并把结果汇总给我。
                  - generic [ref=e431]:
                    - img [ref=e433]
                    - generic [ref=e436]:
                      - generic [ref=e437]:
                        - generic [ref=e438]: MovScript Agent
                        - generic [ref=e439]: 17:00
                        - button "Copy message" [ref=e441] [cursor=pointer]:
                          - img [ref=e443]
                      - generic [ref=e447]: 已创建计划，并派发Einstein处理素材风险审计。
                  - generic [ref=e448]:
                    - generic [ref=e449]:
                      - generic [ref=e450]:
                        - generic [ref=e451]:
                          - img [ref=e452]
                          - generic [ref=e456]: Planner 调度 E2E
                        - generic [ref=e457]: 0/4 tasks · 3 active workers · 1 artifact
                        - paragraph [ref=e458]: 3 active workers · 1 blocked · 2 pending
                      - generic [ref=e459]: running
                    - generic [ref=e460]:
                      - button "Dispatch" [disabled] [ref=e461]:
                        - generic [ref=e462]:
                          - img [ref=e463]
                          - text: Dispatch
                      - button "Replan" [ref=e465] [cursor=pointer]:
                        - generic [ref=e466]:
                          - img [ref=e467]
                          - text: Replan
                      - button "Cancel tree" [ref=e472] [cursor=pointer]:
                        - generic [ref=e473]:
                          - img [ref=e474]
                          - text: Cancel tree
                    - generic [ref=e477]:
                      - combobox [ref=e478] [cursor=pointer]:
                        - generic: 2 workers
                        - img [ref=e479]
                      - combobox [ref=e481] [cursor=pointer]:
                        - generic: 2 attempts
                        - img [ref=e482]
                      - combobox [ref=e484] [cursor=pointer]:
                        - generic: 15m timeout
                        - img [ref=e485]
                    - group [ref=e489]:
                      - generic "1 plan artifact review 1" [ref=e490] [cursor=pointer]:
                        - img [ref=e491]
                        - generic [ref=e494]: 1 plan artifact
                        - generic [ref=e495]: review 1
                    - generic [ref=e496]:
                      - generic [ref=e499]:
                        - generic [ref=e500]:
                          - generic [ref=e501]: 素材风险审计
                          - generic [ref=e502]: running
                        - generic [ref=e503]:
                          - generic [ref=e504]: 62%
                          - generic [ref=e505]: Einstein
                          - generic [ref=e506]: attempt 1/2
                          - generic [ref=e507]: timeout 15m
                          - generic [ref=e508]: 1 artifact
                        - paragraph [ref=e509]: Worker run in progress.
                        - group [ref=e510]:
                          - generic "Worker Einstein in progress" [ref=e511] [cursor=pointer]:
                            - img [ref=e512]
                            - generic [ref=e515]: Worker Einstein
                            - generic [ref=e516]: in progress
                        - group [ref=e517]:
                          - generic "素材风险摘要 · Einstein" [ref=e518] [cursor=pointer]:
                            - generic [ref=e519]: 素材风险摘要 · Einstein
                      - generic [ref=e522]:
                        - generic [ref=e523]:
                          - generic [ref=e524]: 最终汇总
                          - generic [ref=e525]: pending
                        - generic [ref=e527]: 0%
                        - paragraph [ref=e528]: Ready when dependencies and worker capacity allow.
                      - generic [ref=e531]:
                        - generic [ref=e532]:
                          - generic [ref=e533]: 素材发布审批
                          - generic [ref=e534]: blocked
                        - generic [ref=e535]:
                          - generic [ref=e536]: 35%
                          - generic [ref=e537]: Hawking
                          - generic [ref=e538]: 1 approval
                        - paragraph [ref=e539]: Waiting for 1 approval.
                        - paragraph [ref=e540]: Worker run needs approval.
                        - group [ref=e541]:
                          - generic "Worker Hawking requires action" [ref=e542] [cursor=pointer]:
                            - img [ref=e543]
                            - generic [ref=e546]: Worker Hawking
                            - generic [ref=e547]: requires action
                        - group [ref=e548]:
                          - generic "1 action needed" [ref=e549] [cursor=pointer]:
                            - img [ref=e550]
                            - generic [ref=e554]: 1 action needed
                      - generic [ref=e557]:
                        - generic [ref=e558]:
                          - generic [ref=e559]: 素材范围确认
                          - generic [ref=e560]: pending
                        - generic [ref=e561]:
                          - generic [ref=e562]: 20%
                          - generic [ref=e563]: Turing
                        - paragraph [ref=e564]: Ready when dependencies and worker capacity allow.
                        - group [ref=e565]:
                          - generic "Worker Turing queued" [ref=e566] [cursor=pointer]:
                            - img [ref=e567]
                            - generic [ref=e570]: Worker Turing
                            - generic [ref=e571]: queued
                - generic [ref=e573]:
                  - generic [ref=e574]:
                    - generic [ref=e575]:
                      - img [ref=e576]
                      - generic [ref=e580]: Agent 工作流
                    - generic [ref=e581]: 等待审批
                  - generic [ref=e582]:
                    - generic [ref=e584]:
                      - img [ref=e585]
                      - generic [ref=e588]: 需要审批
                    - generic [ref=e590]:
                      - generic [ref=e591]:
                        - generic [ref=e592]:
                          - generic [ref=e593]: movscript_publish_assets
                          - generic [ref=e594]: write
                        - generic [ref=e595]:
                          - button "拒绝" [ref=e596] [cursor=pointer]:
                            - generic [ref=e597]: 拒绝
                          - button "通过" [ref=e598] [cursor=pointer]:
                            - generic [ref=e599]: 通过
                      - paragraph [ref=e600]: Publish reviewed asset metadata back to the project.
                      - generic [ref=e601]:
                        - generic [ref=e602]: "影响:"
                        - text: 通过后会允许一次写入操作，而不只是读取或预览数据。
                      - paragraph [ref=e603]: "权限: project.assets.write"
                      - generic [ref=e604]: "{ \"dryRun\": false }"
              - generic [ref=e606]:
                - generic [ref=e607]:
                  - paragraph [ref=e608]: 上下文
                  - paragraph [ref=e609]: 本地 Runtime 已上线
                - button "显示上下文" [ref=e610] [cursor=pointer]:
                  - generic [ref=e611]:
                    - img [ref=e612]
                    - text: 显示上下文
              - generic [ref=e615]:
                - generic [ref=e616]:
                  - paragraph [ref=e617]: 输入
                  - paragraph [ref=e618]: Enter 发送 · Shift+Enter 换行 · 输入 @ 选择资源
                - generic [ref=e619]:
                  - textbox [ref=e621]: 输入消息… (Enter 发送，输入 @ 选择资源)
                  - generic [ref=e622]:
                    - generic [ref=e623]:
                      - button "上传图片、视频、音频或文本" [ref=e624] [cursor=pointer]:
                        - img [ref=e625]
                      - button "引用" [ref=e628] [cursor=pointer]:
                        - img [ref=e629]
                      - button "调试预览" [ref=e632] [cursor=pointer]:
                        - generic [ref=e633]:
                          - img [ref=e634]
                          - text: 调试预览
                    - button "停止" [ref=e637] [cursor=pointer]:
                      - img [ref=e638]
                      - generic [ref=e641]: 停止
```

# Test source

```ts
  77  | 
  78  |   page.once('dialog', async (dialog) => {
  79  |     expect(dialog.message()).toContain('Einstein')
  80  |     await dialog.accept()
  81  |   })
  82  |   await page.getByTestId('agent-run-cancel-worker').click()
  83  |   await expect(page.getByTestId('agent-run-header')).toContainText('已取消')
  84  |   await expect(page.getByTestId('agent-run-plan-context')).toContainText('已取消')
  85  |   await expect(page.getByTestId('agent-run-cancel-worker')).toHaveCount(0)
  86  | })
  87  | 
  88  | test('planner worker cancel failure is visible on run detail', async ({ page }, testInfo) => {
  89  |   const baseURL = testInfo.project.use.baseURL
  90  |   if (!baseURL) throw new Error('planner E2E requires a baseURL')
  91  | 
  92  |   await page.addInitScript(({ key, seed }) => {
  93  |     window.localStorage.setItem(key, JSON.stringify(seed))
  94  |     window.localStorage.setItem('movscript.language', 'zh-CN')
  95  |   }, {
  96  |     key: E2E_BOOTSTRAP_STORAGE_KEY,
  97  |     seed: buildPlannerAgentBootstrap(String(baseURL)),
  98  |   })
  99  | 
  100 |   await mockGenerationAppShell(page)
  101 |   await mockPlannerAgentRuntime(page, { failCancel: true })
  102 | 
  103 |   await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  104 |   await expect(page.getByTestId('agent-run-cancel-worker')).toBeVisible()
  105 | 
  106 |   page.once('dialog', async (dialog) => {
  107 |     await dialog.accept()
  108 |   })
  109 |   await page.getByTestId('agent-run-cancel-worker').click()
  110 |   await expect(page.getByTestId('agent-run-cancel-error')).toContainText('cancel rejected by runtime')
  111 |   await expect(page.getByTestId('agent-run-cancel-worker')).toBeVisible()
  112 | })
  113 | 
  114 | test('planner worker approval can be resolved from run detail', async ({ page }, testInfo) => {
  115 |   const baseURL = testInfo.project.use.baseURL
  116 |   if (!baseURL) throw new Error('planner E2E requires a baseURL')
  117 | 
  118 |   await page.addInitScript(({ key, seed }) => {
  119 |     window.localStorage.setItem(key, JSON.stringify(seed))
  120 |     window.localStorage.setItem('movscript.language', 'zh-CN')
  121 |   }, {
  122 |     key: E2E_BOOTSTRAP_STORAGE_KEY,
  123 |     seed: buildPlannerAgentBootstrap(String(baseURL)),
  124 |   })
  125 | 
  126 |   await mockGenerationAppShell(page)
  127 |   await mockPlannerAgentRuntime(page)
  128 | 
  129 |   await page.goto(`/agent/runs/${APPROVAL_WORKER_RUN_ID}`)
  130 |   await expect(page.getByTestId('agent-run-sidebar')).toContainText('Hawking')
  131 |   await expect(page.getByTestId('agent-run-pending-approval')).toContainText('movscript_publish_assets')
  132 |   await page.getByTestId('agent-run-approval-action').filter({ hasText: 'Approve' }).click()
  133 |   await expect(page.getByTestId('agent-run-header')).toContainText('in progress')
  134 |   await expect(page.getByTestId('agent-run-pending-approval')).toHaveCount(0)
  135 | })
  136 | 
  137 | test('planner worker approval failure is visible on run detail', async ({ page }, testInfo) => {
  138 |   const baseURL = testInfo.project.use.baseURL
  139 |   if (!baseURL) throw new Error('planner E2E requires a baseURL')
  140 | 
  141 |   await page.addInitScript(({ key, seed }) => {
  142 |     window.localStorage.setItem(key, JSON.stringify(seed))
  143 |     window.localStorage.setItem('movscript.language', 'zh-CN')
  144 |   }, {
  145 |     key: E2E_BOOTSTRAP_STORAGE_KEY,
  146 |     seed: buildPlannerAgentBootstrap(String(baseURL)),
  147 |   })
  148 | 
  149 |   await mockGenerationAppShell(page)
  150 |   await mockPlannerAgentRuntime(page, { failApproval: true })
  151 | 
  152 |   await page.goto(`/agent/runs/${APPROVAL_WORKER_RUN_ID}`)
  153 |   await page.getByTestId('agent-run-approval-action').filter({ hasText: 'Reject' }).click()
  154 |   await expect(page.getByTestId('agent-run-approval-error')).toContainText('approval rejected by runtime')
  155 |   await expect(page.getByTestId('agent-run-pending-approval')).toContainText('movscript_publish_assets')
  156 | })
  157 | 
  158 | test('planner worker input can be answered from run detail', async ({ page }, testInfo) => {
  159 |   const baseURL = testInfo.project.use.baseURL
  160 |   if (!baseURL) throw new Error('planner E2E requires a baseURL')
  161 | 
  162 |   await page.addInitScript(({ key, seed }) => {
  163 |     window.localStorage.setItem(key, JSON.stringify(seed))
  164 |     window.localStorage.setItem('movscript.language', 'zh-CN')
  165 |   }, {
  166 |     key: E2E_BOOTSTRAP_STORAGE_KEY,
  167 |     seed: buildPlannerAgentBootstrap(String(baseURL)),
  168 |   })
  169 | 
  170 |   await mockGenerationAppShell(page)
  171 |   await mockPlannerAgentRuntime(page)
  172 | 
  173 |   await page.goto(`/agent/runs/${INPUT_WORKER_RUN_ID}`)
  174 |   await expect(page.getByTestId('agent-run-sidebar')).toContainText('Turing')
  175 |   await expect(page.getByTestId('agent-run-pending-input')).toContainText('确认素材范围')
  176 |   await page.getByRole('button', { name: /^包含占位素材/ }).click()
> 177 |   await expect(page.getByTestId('agent-run-header')).toContainText('queued')
      |                                                      ^ Error: expect(locator).toContainText(expected) failed
  178 |   await expect(page.getByTestId('agent-run-pending-input')).toHaveCount(0)
  179 | })
  180 | 
  181 | test('planner worker input failure is visible on run detail', async ({ page }, testInfo) => {
  182 |   const baseURL = testInfo.project.use.baseURL
  183 |   if (!baseURL) throw new Error('planner E2E requires a baseURL')
  184 | 
  185 |   await page.addInitScript(({ key, seed }) => {
  186 |     window.localStorage.setItem(key, JSON.stringify(seed))
  187 |     window.localStorage.setItem('movscript.language', 'zh-CN')
  188 |   }, {
  189 |     key: E2E_BOOTSTRAP_STORAGE_KEY,
  190 |     seed: buildPlannerAgentBootstrap(String(baseURL)),
  191 |   })
  192 | 
  193 |   await mockGenerationAppShell(page)
  194 |   await mockPlannerAgentRuntime(page, { failInput: true })
  195 | 
  196 |   await page.goto(`/agent/runs/${INPUT_WORKER_RUN_ID}`)
  197 |   await page.getByTestId('agent-run-input-text').fill('只看正式素材')
  198 |   await page.getByTestId('agent-run-input-submit').click()
  199 |   await expect(page.getByTestId('agent-run-input-error')).toContainText('input rejected by runtime')
  200 |   await expect(page.getByTestId('agent-run-pending-input')).toContainText('确认素材范围')
  201 | })
  202 | 
  203 | async function mockPlannerAgentRuntime(page: Page, options: { failCancel?: boolean; failApproval?: boolean; failInput?: boolean } = {}) {
  204 |   let snapshot = plannerPlanSnapshotFixture()
  205 |   let workerRun = workerRunFixture()
  206 |   let approvalWorkerRun = approvalWorkerRunFixture()
  207 |   let inputWorkerRun = inputWorkerRunFixture()
  208 |   const runs = new Map([
  209 |     [PLANNER_RUN_ID, plannerRunFixture()],
  210 |     [WORKER_RUN_ID, workerRun],
  211 |     [APPROVAL_WORKER_RUN_ID, approvalWorkerRun],
  212 |     [INPUT_WORKER_RUN_ID, inputWorkerRun],
  213 |   ])
  214 | 
  215 |   await page.route('http://127.0.0.1:28765/**', async (route) => {
  216 |     const url = new URL(route.request().url())
  217 |     if (url.pathname === '/health' || url.pathname === '/inspect' || url.pathname === '/capabilities') {
  218 |       await route.fallback()
  219 |       return
  220 |     }
  221 |     if (url.pathname === `/plans/${PLANNER_PLAN_ID}`) {
  222 |       await fulfillJSON(route, snapshot)
  223 |       return
  224 |     }
  225 |     const cancelTreeMatch = url.pathname.match(/^\/runs\/([^/]+)\/cancel-tree$/)
  226 |     if (cancelTreeMatch && route.request().method() === 'POST') {
  227 |       const runId = decodeURIComponent(cancelTreeMatch[1])
  228 |       if (runId !== WORKER_RUN_ID) {
  229 |         await fulfillJSON(route, { error: 'run not found' }, 404)
  230 |         return
  231 |       }
  232 |       if (options.failCancel) {
  233 |         await fulfillJSON(route, { error: 'cancel rejected by runtime' }, 500)
  234 |         return
  235 |       }
  236 |       workerRun = {
  237 |         ...workerRun,
  238 |         status: 'cancelled',
  239 |         progress: 0.62,
  240 |         cancelledAt: '2026-05-12T09:01:00.000Z',
  241 |         updatedAt: '2026-05-12T09:01:00.000Z',
  242 |       }
  243 |       runs.set(WORKER_RUN_ID, workerRun)
  244 |       snapshot = {
  245 |         ...snapshot,
  246 |         plan: { ...snapshot.plan, status: 'cancelled', updatedAt: '2026-05-12T09:01:00.000Z', cancelledAt: '2026-05-12T09:01:00.000Z' },
  247 |         tasks: snapshot.tasks.map((task) => task.id === 'task_einstein_audit'
  248 |           ? { ...task, status: 'cancelled', cancelledAt: '2026-05-12T09:01:00.000Z', updatedAt: '2026-05-12T09:01:00.000Z' }
  249 |           : task),
  250 |         runs: snapshot.runs.map((run) => run.id === WORKER_RUN_ID ? workerRun : run),
  251 |         summary: snapshot.summary ? {
  252 |           ...snapshot.summary,
  253 |           taskStatusCounts: { pending: 1, running: 0, blocked: 1, needs_review: 0, done: 0, failed: 0, cancelled: 1 },
  254 |           activeWorkerCount: 1,
  255 |         } : undefined,
  256 |       }
  257 |       await fulfillJSON(route, { cancelledRunIds: [WORKER_RUN_ID] })
  258 |       return
  259 |     }
  260 |     const approveMatch = url.pathname.match(/^\/runs\/([^/]+)\/approve$/)
  261 |     const rejectMatch = url.pathname.match(/^\/runs\/([^/]+)\/reject$/)
  262 |     if ((approveMatch || rejectMatch) && route.request().method() === 'POST') {
  263 |       const runId = decodeURIComponent((approveMatch ?? rejectMatch)![1])
  264 |       if (runId !== APPROVAL_WORKER_RUN_ID) {
  265 |         await fulfillJSON(route, { error: 'run not found' }, 404)
  266 |         return
  267 |       }
  268 |       if (options.failApproval) {
  269 |         await fulfillJSON(route, { error: 'approval rejected by runtime' }, 500)
  270 |         return
  271 |       }
  272 |       approvalWorkerRun = {
  273 |         ...approvalWorkerRun,
  274 |         status: 'in_progress',
  275 |         pendingApprovals: approvalWorkerRun.pendingApprovals?.map((approval) => ({
  276 |           ...approval,
  277 |           status: approveMatch ? 'approved' : 'rejected',
```