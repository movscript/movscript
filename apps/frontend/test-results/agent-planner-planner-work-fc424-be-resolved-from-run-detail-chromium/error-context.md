# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agent-planner.spec.ts >> planner worker approval can be resolved from run detail
- Location: src/e2e/agent-planner.spec.ts:114:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByTestId('agent-run-approval-action').filter({ hasText: 'Approve' })

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
                  - generic [ref=e193]: 等待处理
                - paragraph [ref=e194]: run_worker_approval_e2e
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
                    - generic [ref=e233]: Hawking
                  - generic [ref=e234]:
                    - generic [ref=e235]: 线程
                    - generic [ref=e236]: thread-planner-e2e
                  - generic [ref=e237]:
                    - generic [ref=e238]: 计划
                    - generic [ref=e239]: plan_planner_e2e
                  - generic [ref=e240]:
                    - generic [ref=e241]: 任务
                    - generic [ref=e242]: task_approval_review
                  - generic [ref=e243]:
                    - generic [ref=e244]: 上级
                    - generic [ref=e245]: run_planner_e2e
                  - generic [ref=e246]:
                    - generic [ref=e247]: 进度
                    - generic [ref=e248]: 35%
                  - generic [ref=e249]:
                    - generic [ref=e250]: 步骤数
                    - generic [ref=e251]: "1"
                  - generic [ref=e252]:
                    - generic [ref=e253]: 创建于
                    - generic [ref=e254]: 2026-05-12T09:00:04.000Z
                  - generic [ref=e255]:
                    - generic [ref=e256]: 更新于
                    - generic [ref=e257]: 2026-05-12T09:00:14.000Z
                  - generic [ref=e258]:
                    - generic [ref=e259]: 运行摘要
                    - generic [ref=e260]:
                      - generic [ref=e261]: 运行 1
                      - generic [ref=e262]: 工具调用 1
                    - generic [ref=e263]:
                      - generic [ref=e264]: 最新事件
                      - generic [ref=e265]: 行为
                      - generic [ref=e266]: Subagent dispatch tool call
                    - generic [ref=e267]: 本次 run 正在等待用户处理。
                    - generic [ref=e268]:
                      - generic [ref=e269]: • 2 个 trace 事件，0 次模型调用，1 次工具调用
                      - generic [ref=e270]: • 0 个上下文相关事件
                      - generic [ref=e271]: • 1 个待审批项
                      - generic [ref=e272]: • 无待输入项
                      - generic [ref=e273]: • 无运行警告
                  - generic [ref=e274]:
                    - generic [ref=e275]: 待审批
                    - generic [ref=e276]:
                      - generic [ref=e277]: movscript_publish_assets
                      - paragraph [ref=e278]: Publish reviewed asset metadata back to the project.
                      - generic [ref=e279]:
                        - generic [ref=e280]: 风险 write
                        - generic [ref=e281]: 权限 project.assets.write
                      - generic [ref=e282]:
                        - button "同意" [ref=e283] [cursor=pointer]:
                          - generic [ref=e284]: 同意
                        - button "拒绝" [ref=e285] [cursor=pointer]:
                          - generic [ref=e286]: 拒绝
                  - generic [ref=e287]:
                    - generic [ref=e288]: 计划上下文
                    - generic [ref=e289]:
                      - generic [ref=e290]: 计划标题
                      - generic [ref=e291]: Planner 调度 E2E
                    - generic [ref=e292]:
                      - generic [ref=e293]: 计划状态
                      - generic [ref=e294]: 运行中
                    - generic [ref=e295]:
                      - generic [ref=e296]: 任务标题
                      - generic [ref=e297]: 素材发布审批
                    - generic [ref=e298]:
                      - generic [ref=e299]: 任务状态
                      - generic [ref=e300]: 被阻塞
                    - generic [ref=e301]:
                      - generic [ref=e302]: 任务说明
                      - generic [ref=e303]: Waiting for 1 approval.
                    - generic [ref=e304]:
                      - generic [ref=e305]: 产物数
                      - generic [ref=e306]: "0"
                    - paragraph [ref=e307]: Worker run needs approval.
              - generic [ref=e308]:
                - generic [ref=e309]:
                  - generic [ref=e310]:
                    - generic [ref=e311]: 运行轨迹
                    - generic [ref=e312]: 2 个事件
                    - button "行为 2" [ref=e313] [cursor=pointer]:
                      - generic [ref=e314]: 行为 2
                    - generic [ref=e315]: 运行 1
                    - generic [ref=e316]: 工具调用 1
                  - generic [ref=e317]:
                    - textbox "搜索事件" [ref=e318]
                    - combobox [ref=e319] [cursor=pointer]:
                      - generic: 全部事件
                      - img [ref=e320]
                    - combobox [ref=e322] [cursor=pointer]:
                      - generic: 全部分类
                      - img [ref=e323]
                    - button "加载事件" [ref=e325] [cursor=pointer]:
                      - generic [ref=e326]:
                        - img [ref=e327]
                        - text: 加载事件
                - generic [ref=e331]:
                  - generic [ref=e332]:
                    - generic [ref=e333]:
                      - generic [ref=e334]: Planner started
                      - generic [ref=e335]:
                        - button "链接" [ref=e336] [cursor=pointer]:
                          - generic [ref=e337]:
                            - img [ref=e338]
                            - text: 链接
                        - generic [ref=e341]: 行为
                        - generic [ref=e342]: 已开始
                    - generic [ref=e343]:
                      - generic [ref=e344]:
                        - generic [ref=e345]: 运行
                        - generic [ref=e346]: 创建 2026-05-12T09:00:01.000Z
                      - generic [ref=e347]:
                        - generic [ref=e348]: 摘要
                        - generic [ref=e349]: Planner started plan orchestration.
                  - generic [ref=e350]:
                    - generic [ref=e351]:
                      - generic [ref=e352]: Subagent dispatch tool call
                      - generic [ref=e353]:
                        - button "原始数据" [ref=e354] [cursor=pointer]:
                          - generic [ref=e355]: 原始数据
                        - button "复制数据" [ref=e356] [cursor=pointer]:
                          - generic [ref=e357]:
                            - img [ref=e358]
                            - text: 复制数据
                        - button "链接" [ref=e361] [cursor=pointer]:
                          - generic [ref=e362]:
                            - img [ref=e363]
                            - text: 链接
                        - generic [ref=e366]: 行为
                        - generic [ref=e367]: 已完成
                    - generic [ref=e368]:
                      - generic [ref=e369]:
                        - generic [ref=e370]: 工具调用
                        - generic [ref=e371]: 工具 movscript_spawn_subagent
                        - generic [ref=e372]: 创建 2026-05-12T09:00:08.000Z
                        - generic [ref=e373]: 完成 2026-05-12T09:00:12.000Z
                      - generic [ref=e374]:
                        - generic [ref=e375]: 行为
                        - generic [ref=e376]: 调用 movscript_spawn_subagent
                      - generic [ref=e377]:
                        - generic [ref=e378]: 影响
                        - generic [ref=e379]: 工具结果会进入 run step，并可能作为下一轮模型上下文
                      - generic [ref=e380]:
                        - generic [ref=e381]: 摘要
                        - generic [ref=e382]: Spawned worker Einstein.
                      - group [ref=e383]:
                        - generic "上下文摘要" [ref=e384] [cursor=pointer]:
                          - img [ref=e385]
                          - text: 上下文摘要
          - generic [ref=e387]:
            - separator "Resize assistant panel" [ref=e388]
            - main [ref=e392]:
              - generic [ref=e393]:
                - generic [ref=e394]:
                  - generic [ref=e395]:
                    - generic [ref=e396]:
                      - button "收起 AI 助手" [ref=e397] [cursor=pointer]:
                        - img [ref=e399]
                      - heading "AI 助手" [level=1] [ref=e401]
                    - tablist "当前会话标签" [ref=e402]:
                      - generic [ref=e403]:
                        - tab "Planner 调度 E2E" [selected] [ref=e404] [cursor=pointer]:
                          - img [ref=e405]
                          - generic [ref=e407]: Planner 调度 E2E
                          - generic "2 条" [ref=e408]: "2"
                        - button "标签操作" [ref=e409] [cursor=pointer]:
                          - img [ref=e410]
                        - button "关闭标签" [ref=e414] [cursor=pointer]:
                          - img [ref=e415]
                    - paragraph [ref=e418]: Planner 调度 E2E
                  - generic [ref=e419]:
                    - button "新对话" [ref=e420] [cursor=pointer]:
                      - img [ref=e422]
                    - button "会话历史" [ref=e423] [cursor=pointer]:
                      - img [ref=e425]
                - generic [ref=e430]:
                  - generic [ref=e431]:
                    - generic [ref=e432]: 我
                    - generic [ref=e433]:
                      - generic [ref=e434]:
                        - generic [ref=e435]: You
                        - generic [ref=e436]: 17:00
                        - button "Copy message" [ref=e438] [cursor=pointer]:
                          - img [ref=e440]
                      - generic [ref=e444]: 请并行梳理项目素材风险，并把结果汇总给我。
                  - generic [ref=e445]:
                    - img [ref=e447]
                    - generic [ref=e450]:
                      - generic [ref=e451]:
                        - generic [ref=e452]: MovScript Agent
                        - generic [ref=e453]: 17:00
                        - button "Copy message" [ref=e455] [cursor=pointer]:
                          - img [ref=e457]
                      - generic [ref=e461]: 已创建计划，并派发Einstein处理素材风险审计。
                  - generic [ref=e462]:
                    - generic [ref=e463]:
                      - generic [ref=e464]:
                        - generic [ref=e465]:
                          - img [ref=e466]
                          - generic [ref=e470]: Planner 调度 E2E
                        - generic [ref=e471]: 0/4 tasks · 3 active workers · 1 artifact
                        - paragraph [ref=e472]: 3 active workers · 2 blocked · 1 pending
                      - generic [ref=e473]: running
                    - generic [ref=e474]:
                      - button "Dispatch" [disabled] [ref=e475]:
                        - generic [ref=e476]:
                          - img [ref=e477]
                          - text: Dispatch
                      - button "Replan" [ref=e479] [cursor=pointer]:
                        - generic [ref=e480]:
                          - img [ref=e481]
                          - text: Replan
                      - button "Cancel tree" [ref=e486] [cursor=pointer]:
                        - generic [ref=e487]:
                          - img [ref=e488]
                          - text: Cancel tree
                    - generic [ref=e491]:
                      - combobox [ref=e492] [cursor=pointer]:
                        - generic: 2 workers
                        - img [ref=e493]
                      - combobox [ref=e495] [cursor=pointer]:
                        - generic: 2 attempts
                        - img [ref=e496]
                      - combobox [ref=e498] [cursor=pointer]:
                        - generic: 15m timeout
                        - img [ref=e499]
                    - group [ref=e503]:
                      - generic "1 plan artifact review 1" [ref=e504] [cursor=pointer]:
                        - img [ref=e505]
                        - generic [ref=e508]: 1 plan artifact
                        - generic [ref=e509]: review 1
                    - generic [ref=e510]:
                      - generic [ref=e513]:
                        - generic [ref=e514]:
                          - generic [ref=e515]: 素材风险审计
                          - generic [ref=e516]: running
                        - generic [ref=e517]:
                          - generic [ref=e518]: 62%
                          - generic [ref=e519]: Einstein
                          - generic [ref=e520]: attempt 1/2
                          - generic [ref=e521]: timeout 15m
                          - generic [ref=e522]: 1 artifact
                        - paragraph [ref=e523]: Worker run in progress.
                        - group [ref=e524]:
                          - generic "Worker Einstein in progress" [ref=e525] [cursor=pointer]:
                            - img [ref=e526]
                            - generic [ref=e529]: Worker Einstein
                            - generic [ref=e530]: in progress
                        - group [ref=e531]:
                          - generic "素材风险摘要 · Einstein" [ref=e532] [cursor=pointer]:
                            - generic [ref=e533]: 素材风险摘要 · Einstein
                      - generic [ref=e536]:
                        - generic [ref=e537]:
                          - generic [ref=e538]: 最终汇总
                          - generic [ref=e539]: pending
                        - generic [ref=e541]: 0%
                        - paragraph [ref=e542]: Ready when dependencies and worker capacity allow.
                      - generic [ref=e545]:
                        - generic [ref=e546]:
                          - generic [ref=e547]: 素材发布审批
                          - generic [ref=e548]: blocked
                        - generic [ref=e549]:
                          - generic [ref=e550]: 35%
                          - generic [ref=e551]: Hawking
                          - generic [ref=e552]: 1 approval
                        - paragraph [ref=e553]: Waiting for 1 approval.
                        - paragraph [ref=e554]: Worker run needs approval.
                        - group [ref=e555]:
                          - generic "Worker Hawking requires action" [ref=e556] [cursor=pointer]:
                            - img [ref=e557]
                            - generic [ref=e560]: Worker Hawking
                            - generic [ref=e561]: requires action
                        - group [ref=e562]:
                          - generic "1 action needed" [ref=e563] [cursor=pointer]:
                            - img [ref=e564]
                            - generic [ref=e568]: 1 action needed
                      - generic [ref=e571]:
                        - generic [ref=e572]:
                          - generic [ref=e573]: 素材范围确认
                          - generic [ref=e574]: blocked
                        - generic [ref=e575]:
                          - generic [ref=e576]: 20%
                          - generic [ref=e577]: Turing
                          - generic [ref=e578]: 1 input
                        - paragraph [ref=e579]: Waiting for 1 user input.
                        - paragraph [ref=e580]: Worker run needs input.
                        - group [ref=e581]:
                          - generic "Worker Turing requires action" [ref=e582] [cursor=pointer]:
                            - img [ref=e583]
                            - generic [ref=e586]: Worker Turing
                            - generic [ref=e587]: requires action
                        - group [ref=e588]:
                          - generic "1 action needed" [ref=e589] [cursor=pointer]:
                            - img [ref=e590]
                            - generic [ref=e594]: 1 action needed
                - generic [ref=e596]:
                  - generic [ref=e597]:
                    - generic [ref=e598]:
                      - img [ref=e599]
                      - generic [ref=e603]: Agent 工作流
                    - generic [ref=e604]: 等待审批
                  - generic [ref=e605]:
                    - generic [ref=e607]:
                      - img [ref=e608]
                      - generic [ref=e611]: 需要审批
                    - generic [ref=e613]:
                      - generic [ref=e614]:
                        - generic [ref=e615]:
                          - generic [ref=e616]: movscript_publish_assets
                          - generic [ref=e617]: write
                        - generic [ref=e618]:
                          - button "拒绝" [ref=e619] [cursor=pointer]:
                            - generic [ref=e620]: 拒绝
                          - button "通过" [ref=e621] [cursor=pointer]:
                            - generic [ref=e622]: 通过
                      - paragraph [ref=e623]: Publish reviewed asset metadata back to the project.
                      - generic [ref=e624]:
                        - generic [ref=e625]: "影响:"
                        - text: 通过后会允许一次写入操作，而不只是读取或预览数据。
                      - paragraph [ref=e626]: "权限: project.assets.write"
                      - generic [ref=e627]: "{ \"dryRun\": false }"
              - generic [ref=e629]:
                - generic [ref=e630]:
                  - paragraph [ref=e631]: 上下文
                  - paragraph [ref=e632]: 本地 Runtime 已上线
                - button "显示上下文" [ref=e633] [cursor=pointer]:
                  - generic [ref=e634]:
                    - img [ref=e635]
                    - text: 显示上下文
              - generic [ref=e638]:
                - generic [ref=e639]:
                  - paragraph [ref=e640]: 输入
                  - paragraph [ref=e641]: Enter 发送 · Shift+Enter 换行 · 输入 @ 选择资源
                - generic [ref=e642]:
                  - textbox [active] [ref=e644]: 输入消息… (Enter 发送，输入 @ 选择资源)
                  - generic [ref=e645]:
                    - generic [ref=e646]:
                      - button "上传图片、视频、音频或文本" [ref=e647] [cursor=pointer]:
                        - img [ref=e648]
                      - button "引用" [ref=e651] [cursor=pointer]:
                        - img [ref=e652]
                      - button "调试预览" [ref=e655] [cursor=pointer]:
                        - generic [ref=e656]:
                          - img [ref=e657]
                          - text: 调试预览
                    - button "停止" [ref=e660] [cursor=pointer]:
                      - img [ref=e661]
                      - generic [ref=e664]: 停止
```

# Test source

```ts
  32  | 
  33  |   await mockGenerationAppShell(page)
  34  |   await mockPlannerAgentRuntime(page)
  35  | 
  36  |   await page.goto('/project-home')
  37  | 
  38  |   await expect(page.getByTestId('agent-plan-overview')).toBeVisible()
  39  |   await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('0/4 tasks')
  40  |   await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('3 active workers')
  41  |   await expect(page.getByTestId('agent-plan-overview-stats')).toContainText('1 artifact')
  42  |   await expect(page.getByTestId('agent-plan-status-explanation')).toContainText('3 active workers')
  43  |   await expect(page.getByTestId('agent-plan-artifact-summary')).toContainText('素材风险摘要')
  44  |   await expect(page.getByTestId('agent-plan-overview')).toContainText('Einstein')
  45  | 
  46  |   await page.goto(`/agent/runs/${PLANNER_RUN_ID}`)
  47  |   await expect(page.getByTestId('agent-run-child-runs')).toContainText('Einstein')
  48  |   await expect(page.getByTestId('agent-run-child-runs')).toContainText('Hawking')
  49  |   await expect(page.getByTestId('agent-run-child-runs')).toContainText('Turing')
  50  |   await page.getByTestId('agent-run-child-run').filter({ hasText: 'Einstein' }).click()
  51  |   await expect(page).toHaveURL(new RegExp(`/agent/runs/${WORKER_RUN_ID}$`))
  52  | 
  53  |   await page.goto(`/agent/runs/${WORKER_RUN_ID}`)
  54  | 
  55  |   await expect(page.getByTestId('agent-run-page')).toBeVisible()
  56  |   await expect(page.getByTestId('agent-run-header')).toContainText('Agent 运行')
  57  |   await expect(page.getByTestId('agent-run-sidebar')).toContainText('Einstein')
  58  |   await expect(page.getByTestId('agent-run-plan-context')).toContainText('Planner 调度 E2E')
  59  |   await expect(page.getByTestId('agent-run-plan-context')).toContainText('素材风险审计')
  60  |   await expect(page.getByTestId('agent-run-task-artifacts')).toContainText('素材风险摘要')
  61  |   await expect(page.getByTestId('agent-run-trace-summary')).toContainText('4 个事件')
  62  | 
  63  |   await page.getByTestId('agent-run-load-trace-events').click()
  64  |   await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(4)
  65  |   await expect(page.getByTestId('agent-run-trace-event').first()).toContainText('Worker started')
  66  |   await expect(page.getByTestId('agent-run-model-detail')).toBeVisible()
  67  |   await expect(page.getByTestId('agent-run-model-detail')).toContainText('大模型 HTTP 详情')
  68  |   await expect(page.getByTestId('agent-run-model-detail')).toContainText('请求消息')
  69  |   await expect(page.getByTestId('agent-run-model-detail')).toContainText('movscript_review_assets')
  70  |   await expect(page.getByTestId('agent-run-model-detail')).toContainText('发现缺少主视觉覆盖。')
  71  |   await page.getByTestId('agent-run-trace-search').fill('review tool')
  72  |   await expect(page.getByTestId('agent-run-trace-event')).toHaveCount(1)
  73  |   await expect(page.getByTestId('agent-run-trace-event')).toContainText('Asset review tool call')
  74  |   await page.getByTestId('agent-run-trace-event-details-toggle').click()
  75  |   await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('missing_hero_visual')
  76  |   await expect(page.getByTestId('agent-run-trace-event-details')).toContainText('artifact_einstein_risk')
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
> 132 |   await page.getByTestId('agent-run-approval-action').filter({ hasText: 'Approve' }).click()
      |                                                                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  177 |   await expect(page.getByTestId('agent-run-header')).toContainText('queued')
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
```