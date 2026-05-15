# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agent-planner.spec.ts >> planner run exposes plan overview and run detail drilldown
- Location: src/e2e/agent-planner.spec.ts:21:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('agent-run-model-detail')
Expected: visible
Error: strict mode violation: getByTestId('agent-run-model-detail') resolved to 2 elements:
    1) <details open="" data-testid="agent-run-model-detail" class="rounded border border-border/70 bg-muted/20 px-2 py-1">…</details> aka getByText('模型输出汇总这条事件是模型输出摘要，不是底层 HTTP')
    2) <details open="" data-testid="agent-run-model-detail" class="rounded border border-border/70 bg-muted/20 px-2 py-1">…</details> aka getByText('大模型 HTTP 详情请求消息1. 系统16')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('agent-run-model-detail')

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
                  - generic [ref=e193]: 运行中
                - paragraph [ref=e194]: run_worker_einstein_e2e
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
                    - generic [ref=e233]: Einstein
                  - generic [ref=e234]:
                    - generic [ref=e235]: 线程
                    - generic [ref=e236]: thread-planner-e2e
                  - generic [ref=e237]:
                    - generic [ref=e238]: 计划
                    - generic [ref=e239]: plan_planner_e2e
                  - generic [ref=e240]:
                    - generic [ref=e241]: 任务
                    - generic [ref=e242]: task_einstein_audit
                  - generic [ref=e243]:
                    - generic [ref=e244]: 上级
                    - generic [ref=e245]: run_planner_e2e
                  - generic [ref=e246]:
                    - generic [ref=e247]: 进度
                    - generic [ref=e248]: 62%
                  - generic [ref=e249]:
                    - generic [ref=e250]: 步骤数
                    - generic [ref=e251]: "1"
                  - generic [ref=e252]:
                    - generic [ref=e253]: 创建于
                    - generic [ref=e254]: 2026-05-12T09:00:04.000Z
                  - generic [ref=e255]:
                    - generic [ref=e256]: 更新于
                    - generic [ref=e257]: 2026-05-12T09:00:18.000Z
                  - generic [ref=e258]:
                    - generic [ref=e259]: 运行摘要
                    - generic [ref=e260]:
                      - generic [ref=e261]: 运行 1
                      - generic [ref=e262]: 模型调用 2
                      - generic [ref=e263]: 工具调用 1
                    - generic [ref=e264]:
                      - generic [ref=e265]: 最新事件
                      - generic [ref=e266]: 行为
                      - generic [ref=e267]: Asset review tool call
                    - generic [ref=e268]: 本次 run 仍在运行中。
                    - generic [ref=e269]:
                      - generic [ref=e270]: • 4 个 trace 事件，2 次模型调用，1 次工具调用
                      - generic [ref=e271]: • 0 个上下文相关事件
                      - generic [ref=e272]: • 无待审批项
                      - generic [ref=e273]: • 无待输入项
                      - generic [ref=e274]: • 无运行警告
                  - generic [ref=e275]:
                    - generic [ref=e276]: 计划上下文
                    - generic [ref=e277]:
                      - generic [ref=e278]: 计划标题
                      - generic [ref=e279]: Planner 调度 E2E
                    - generic [ref=e280]:
                      - generic [ref=e281]: 计划状态
                      - generic [ref=e282]: 运行中
                    - generic [ref=e283]:
                      - generic [ref=e284]: 任务标题
                      - generic [ref=e285]: 素材风险审计
                    - generic [ref=e286]:
                      - generic [ref=e287]: 任务状态
                      - generic [ref=e288]: 运行中
                    - generic [ref=e289]:
                      - generic [ref=e290]: 任务说明
                      - generic [ref=e291]: Worker run in progress.
                    - generic [ref=e292]:
                      - generic [ref=e293]: 产物数
                      - generic [ref=e294]: "1"
                    - generic [ref=e295]:
                      - generic [ref=e296]: 任务产物
                      - generic [ref=e297]:
                        - generic [ref=e298]:
                          - generic [ref=e299]: 素材风险摘要 · Einstein
                          - generic [ref=e300]:
                            - button "任务" [ref=e301] [cursor=pointer]:
                              - generic [ref=e302]: 任务
                            - button "运行" [ref=e303] [cursor=pointer]:
                              - generic [ref=e304]:
                                - img [ref=e305]
                                - text: 运行
                            - generic [ref=e309]: review
                        - generic [ref=e310]:
                          - generic [ref=e311]: URI agent-artifact:artifact_einstein_risk
                          - generic [ref=e312]: 运行 run_worker_einstein_e2e
                          - generic [ref=e313]: 任务 素材风险审计
                          - generic [ref=e314]: 运行中
                          - generic [ref=e315]: 工具 movscript_review_assets
              - generic [ref=e316]:
                - generic [ref=e317]:
                  - generic [ref=e318]:
                    - generic [ref=e319]: 运行轨迹
                    - generic [ref=e320]: 4 个事件
                    - button "行为 2" [ref=e321] [cursor=pointer]:
                      - generic [ref=e322]: 行为 2
                    - button "HTTP 2" [ref=e323] [cursor=pointer]:
                      - generic [ref=e324]: HTTP 2
                    - generic [ref=e325]: 运行 1
                    - generic [ref=e326]: 模型调用 2
                    - generic [ref=e327]: 工具调用 1
                  - generic [ref=e328]:
                    - textbox "搜索事件" [ref=e329]
                    - combobox [ref=e330] [cursor=pointer]:
                      - generic: 全部事件
                      - img [ref=e331]
                    - combobox [ref=e333] [cursor=pointer]:
                      - generic: 全部分类
                      - img [ref=e334]
                    - button "加载事件" [ref=e336] [cursor=pointer]:
                      - generic [ref=e337]:
                        - img [ref=e338]
                        - text: 加载事件
                - generic [ref=e342]:
                  - generic [ref=e343]:
                    - generic [ref=e344]:
                      - generic [ref=e345]: Worker started
                      - generic [ref=e346]:
                        - button "链接" [ref=e347] [cursor=pointer]:
                          - generic [ref=e348]:
                            - img [ref=e349]
                            - text: 链接
                        - generic [ref=e352]: 行为
                        - generic [ref=e353]: 已开始
                    - generic [ref=e354]:
                      - generic [ref=e355]:
                        - generic [ref=e356]: 运行
                        - generic [ref=e357]: 创建 2026-05-12T09:00:01.000Z
                      - generic [ref=e358]:
                        - generic [ref=e359]: 摘要
                        - generic [ref=e360]: Einstein开始素材风险审计。
                  - generic [ref=e361]:
                    - generic [ref=e362]:
                      - generic [ref=e363]: 发起模型 HTTP 请求
                      - generic [ref=e364]:
                        - button "原始数据" [ref=e365] [cursor=pointer]:
                          - generic [ref=e366]: 原始数据
                        - button "复制数据" [ref=e367] [cursor=pointer]:
                          - generic [ref=e368]:
                            - img [ref=e369]
                            - text: 复制数据
                        - button "链接" [ref=e372] [cursor=pointer]:
                          - generic [ref=e373]:
                            - img [ref=e374]
                            - text: 链接
                        - generic [ref=e377]: HTTP
                        - generic [ref=e378]: 已开始
                    - generic [ref=e379]:
                      - generic [ref=e380]:
                        - generic [ref=e381]: 模型调用
                        - generic [ref=e382]: 创建 2026-05-12T09:00:03.000Z
                      - generic [ref=e383]:
                        - generic [ref=e384]: 行为
                        - generic [ref=e385]: 向模型网关发送请求
                      - generic [ref=e386]:
                        - generic [ref=e387]: 摘要
                        - generic [ref=e388]: POST /api/v1/model-gateway/chat/completions
                      - group [ref=e389]:
                        - generic "上下文摘要" [ref=e390] [cursor=pointer]:
                          - img [ref=e391]
                          - text: 上下文摘要
                        - generic [ref=e393]:
                          - generic [ref=e394]:
                            - generic [ref=e395]: HTTP 调用
                            - generic [ref=e396]:
                              - generic [ref=e397]:
                                - generic [ref=e398]: 阶段
                                - generic [ref=e399]: 请求
                              - generic [ref=e400]:
                                - generic [ref=e401]: 延迟
                                - generic [ref=e402]: 0ms
                          - generic [ref=e403]:
                            - generic [ref=e404]: 请求上下文
                            - generic [ref=e405]:
                              - generic [ref=e406]:
                                - generic [ref=e407]: 总消息
                                - generic [ref=e408]: "2"
                              - generic [ref=e409]:
                                - generic [ref=e410]: 系统消息
                                - generic [ref=e411]: "1"
                              - generic [ref=e412]:
                                - generic [ref=e413]: 用户消息
                                - generic [ref=e414]: "1"
                              - generic [ref=e415]:
                                - generic [ref=e416]: 助手消息
                                - generic [ref=e417]: "0"
                              - generic [ref=e418]:
                                - generic [ref=e419]: 工具结果
                                - generic [ref=e420]: "0"
                          - generic [ref=e421]:
                            - generic [ref=e422]: 消息预览
                            - generic [ref=e423]:
                              - generic [ref=e424]:
                                - generic [ref=e425]: 1. 系统
                                - generic [ref=e426]: 你是素材风险审计 worker。
                              - generic [ref=e427]:
                                - generic [ref=e428]: 2. 用户
                                - generic [ref=e429]: 请检查当前项目素材风险。
                          - generic [ref=e430]:
                            - generic [ref=e431]: 请求负载摘要
                            - generic [ref=e432]:
                              - generic [ref=e433]:
                                - generic [ref=e434]: 消息条数
                                - generic [ref=e435]: "2"
                              - generic [ref=e436]:
                                - generic [ref=e437]: 工具定义
                                - generic [ref=e438]: "1"
                              - generic [ref=e439]:
                                - generic [ref=e440]: 工具选择
                                - generic [ref=e441]: auto
                              - generic [ref=e442]:
                                - generic [ref=e443]: 流式返回
                                - generic [ref=e444]: 否
                      - group [ref=e445]:
                        - generic "模型输出汇总" [ref=e446] [cursor=pointer]:
                          - img [ref=e447]
                          - text: 模型输出汇总
                        - generic [ref=e449]:
                          - generic [ref=e450]: 这条事件是模型输出摘要，不是底层 HTTP 传输记录；HTTP 请求/响应请查看同一轮相邻的模型调用事件。
                          - generic [ref=e451]:
                            - generic [ref=e452]: 请求消息
                            - generic [ref=e453]:
                              - generic [ref=e454]:
                                - generic [ref=e455]: 1. 系统
                                - generic [ref=e456]: 16 字符
                              - generic [ref=e457]: 你是素材风险审计 worker。
                            - generic [ref=e458]:
                              - generic [ref=e459]:
                                - generic [ref=e460]: 2. 用户
                                - generic [ref=e461]: 12 字符
                              - generic [ref=e462]: 请检查当前项目素材风险。
                          - generic [ref=e463]:
                            - generic [ref=e464]: 工具定义
                            - generic [ref=e465]:
                              - generic [ref=e466]: 1. movscript_review_assets
                              - generic [ref=e467]: Review asset coverage for a production.
                              - generic [ref=e468]: 参数：productionId
                  - generic [ref=e469]:
                    - generic [ref=e470]:
                      - generic [ref=e471]: 收到模型 HTTP 响应
                      - generic [ref=e472]:
                        - button "原始数据" [ref=e473] [cursor=pointer]:
                          - generic [ref=e474]: 原始数据
                        - button "复制数据" [ref=e475] [cursor=pointer]:
                          - generic [ref=e476]:
                            - img [ref=e477]
                            - text: 复制数据
                        - button "链接" [ref=e480] [cursor=pointer]:
                          - generic [ref=e481]:
                            - img [ref=e482]
                            - text: 链接
                        - generic [ref=e485]: HTTP
                        - generic [ref=e486]: 已完成
                    - generic [ref=e487]:
                      - generic [ref=e488]:
                        - generic [ref=e489]: 模型调用
                        - generic [ref=e490]: 创建 2026-05-12T09:00:04.000Z
                        - generic [ref=e491]: 完成 2026-05-12T09:00:04.321Z
                      - generic [ref=e492]:
                        - generic [ref=e493]: 行为
                        - generic [ref=e494]: 解析模型网关返回结果
                      - generic [ref=e495]:
                        - generic [ref=e496]: 摘要
                        - generic [ref=e497]: HTTP 200 in 321ms
                      - group [ref=e498]:
                        - generic "上下文摘要" [ref=e499] [cursor=pointer]:
                          - img [ref=e500]
                          - text: 上下文摘要
                        - generic [ref=e502]:
                          - generic [ref=e503]:
                            - generic [ref=e504]: HTTP 调用
                            - generic [ref=e505]:
                              - generic [ref=e506]:
                                - generic [ref=e507]: 阶段
                                - generic [ref=e508]: 响应
                              - generic [ref=e509]:
                                - generic [ref=e510]: 延迟
                                - generic [ref=e511]: 321ms
                              - generic [ref=e512]:
                                - generic [ref=e513]: 状态码
                                - generic [ref=e514]: "200"
                              - generic [ref=e515]:
                                - generic [ref=e516]: 成功
                                - generic [ref=e517]: 是
                          - generic [ref=e518]:
                            - generic [ref=e519]: HTTP 响应
                            - generic [ref=e520]:
                              - generic [ref=e521]:
                                - generic [ref=e522]: 状态码
                                - generic [ref=e523]: "200"
                              - generic [ref=e524]:
                                - generic [ref=e525]: 内容类型
                                - generic [ref=e526]: application/json
                              - generic [ref=e527]:
                                - generic [ref=e528]: 响应字符
                                - generic [ref=e529]: "70"
                              - generic [ref=e530]:
                                - generic [ref=e531]: 响应预览
                                - generic [ref=e532]: 发现缺少主视觉覆盖。
                              - generic [ref=e533]:
                                - generic [ref=e534]: 解析 ID
                                - generic [ref=e535]: chatcmpl_e2e
                          - generic [ref=e536]:
                            - generic [ref=e537]: 请求上下文
                            - generic [ref=e538]:
                              - generic [ref=e539]:
                                - generic [ref=e540]: 总消息
                                - generic [ref=e541]: "2"
                              - generic [ref=e542]:
                                - generic [ref=e543]: 系统消息
                                - generic [ref=e544]: "1"
                              - generic [ref=e545]:
                                - generic [ref=e546]: 用户消息
                                - generic [ref=e547]: "1"
                              - generic [ref=e548]:
                                - generic [ref=e549]: 助手消息
                                - generic [ref=e550]: "0"
                              - generic [ref=e551]:
                                - generic [ref=e552]: 工具结果
                                - generic [ref=e553]: "0"
                          - generic [ref=e554]:
                            - generic [ref=e555]: 消息预览
                            - generic [ref=e556]:
                              - generic [ref=e557]:
                                - generic [ref=e558]: 1. 系统
                                - generic [ref=e559]: 你是素材风险审计 worker。
                              - generic [ref=e560]:
                                - generic [ref=e561]: 2. 用户
                                - generic [ref=e562]: 请检查当前项目素材风险。
                          - generic [ref=e563]:
                            - generic [ref=e564]: 请求负载摘要
                            - generic [ref=e565]:
                              - generic [ref=e566]:
                                - generic [ref=e567]: 消息条数
                                - generic [ref=e568]: "2"
                              - generic [ref=e569]:
                                - generic [ref=e570]: 工具定义
                                - generic [ref=e571]: "1"
                              - generic [ref=e572]:
                                - generic [ref=e573]: 工具选择
                                - generic [ref=e574]: auto
                              - generic [ref=e575]:
                                - generic [ref=e576]: 流式返回
                                - generic [ref=e577]: 否
                          - generic [ref=e578]:
                            - generic [ref=e579]: 模型结果
                            - generic [ref=e580]:
                              - generic [ref=e581]:
                                - generic [ref=e582]: 结束原因
                                - generic [ref=e583]: stop
                              - generic [ref=e584]:
                                - generic [ref=e585]: 回复字符
                                - generic [ref=e586]: "10"
                              - generic [ref=e587]:
                                - generic [ref=e588]: 请求 token
                                - generic [ref=e589]: "42"
                              - generic [ref=e590]:
                                - generic [ref=e591]: 回复 token
                                - generic [ref=e592]: "8"
                              - generic [ref=e593]:
                                - generic [ref=e594]: 工具调用
                                - generic [ref=e595]: "0"
                      - group [ref=e596]:
                        - generic "大模型 HTTP 详情" [ref=e597] [cursor=pointer]:
                          - img [ref=e598]
                          - text: 大模型 HTTP 详情
                        - generic [ref=e600]:
                          - generic [ref=e601]:
                            - generic [ref=e602]: 请求消息
                            - generic [ref=e603]:
                              - generic [ref=e604]:
                                - generic [ref=e605]: 1. 系统
                                - generic [ref=e606]: 16 字符
                              - generic [ref=e607]: 你是素材风险审计 worker。
                            - generic [ref=e608]:
                              - generic [ref=e609]:
                                - generic [ref=e610]: 2. 用户
                                - generic [ref=e611]: 12 字符
                              - generic [ref=e612]: 请检查当前项目素材风险。
                          - generic [ref=e613]:
                            - generic [ref=e614]: 工具定义
                            - generic [ref=e615]:
                              - generic [ref=e616]: 1. movscript_review_assets
                              - generic [ref=e617]: 参数：productionId
                          - generic [ref=e618]:
                            - generic [ref=e619]:
                              - generic [ref=e620]: HTTP 响应
                              - generic [ref=e621]: 状态 200
                              - generic [ref=e622]: application/json
                              - generic [ref=e623]: ID chatcmpl_e2e
                            - generic [ref=e624]: 发现缺少主视觉覆盖。
                          - generic [ref=e625]:
                            - generic [ref=e626]: 模型结果
                            - generic [ref=e627]:
                              - generic [ref=e628]: 结束原因 stop
                              - generic [ref=e629]: 回复 10 字符
                              - generic [ref=e630]: 请求 42 token
                              - generic [ref=e631]: 回复 8 token
                              - generic [ref=e632]: 工具调用 0
                  - generic [ref=e633]:
                    - generic [ref=e634]:
                      - generic [ref=e635]: Asset review tool call
                      - generic [ref=e636]:
                        - button "原始数据" [ref=e637] [cursor=pointer]:
                          - generic [ref=e638]: 原始数据
                        - button "复制数据" [ref=e639] [cursor=pointer]:
                          - generic [ref=e640]:
                            - img [ref=e641]
                            - text: 复制数据
                        - button "链接" [ref=e644] [cursor=pointer]:
                          - generic [ref=e645]:
                            - img [ref=e646]
                            - text: 链接
                        - generic [ref=e649]: 行为
                        - generic [ref=e650]: 已完成
                    - generic [ref=e651]:
                      - generic [ref=e652]:
                        - generic [ref=e653]: 工具调用
                        - generic [ref=e654]: 工具 movscript_review_assets
                        - generic [ref=e655]: 创建 2026-05-12T09:00:08.000Z
                        - generic [ref=e656]: 完成 2026-05-12T09:00:12.000Z
                      - generic [ref=e657]:
                        - generic [ref=e658]: 行为
                        - generic [ref=e659]: 调用 movscript_review_assets
                      - generic [ref=e660]:
                        - generic [ref=e661]: 影响
                        - generic [ref=e662]: 工具结果会进入 run step，并可能作为下一轮模型上下文
                      - generic [ref=e663]:
                        - generic [ref=e664]: 摘要
                        - generic [ref=e665]: Found missing hero visual coverage.
                      - group [ref=e666]:
                        - generic "上下文摘要" [ref=e667] [cursor=pointer]:
                          - img [ref=e668]
                          - text: 上下文摘要
          - generic [ref=e670]:
            - separator "Resize assistant panel" [ref=e671]
            - main [ref=e675]:
              - generic [ref=e676]:
                - generic [ref=e677]:
                  - generic [ref=e678]:
                    - generic [ref=e679]:
                      - button "收起 AI 助手" [ref=e680] [cursor=pointer]:
                        - img [ref=e682]
                      - heading "AI 助手" [level=1] [ref=e684]
                    - tablist "当前会话标签" [ref=e685]:
                      - generic [ref=e686]:
                        - tab "Planner 调度 E2E" [selected] [ref=e687] [cursor=pointer]:
                          - img [ref=e688]
                          - generic [ref=e690]: Planner 调度 E2E
                          - generic "2 条" [ref=e691]: "2"
                        - button "标签操作" [ref=e692] [cursor=pointer]:
                          - img [ref=e693]
                        - button "关闭标签" [ref=e697] [cursor=pointer]:
                          - img [ref=e698]
                    - paragraph [ref=e701]: Planner 调度 E2E
                  - generic [ref=e702]:
                    - button "新对话" [ref=e703] [cursor=pointer]:
                      - img [ref=e705]
                    - button "会话历史" [ref=e706] [cursor=pointer]:
                      - img [ref=e708]
                - generic [ref=e713]:
                  - generic [ref=e714]:
                    - generic [ref=e715]: 我
                    - generic [ref=e716]:
                      - generic [ref=e717]:
                        - generic [ref=e718]: You
                        - generic [ref=e719]: 17:00
                        - button "Copy message" [ref=e721] [cursor=pointer]:
                          - img [ref=e723]
                      - generic [ref=e727]: 请并行梳理项目素材风险，并把结果汇总给我。
                  - generic [ref=e728]:
                    - img [ref=e730]
                    - generic [ref=e733]:
                      - generic [ref=e734]:
                        - generic [ref=e735]: MovScript Agent
                        - generic [ref=e736]: 17:00
                        - button "Copy message" [ref=e738] [cursor=pointer]:
                          - img [ref=e740]
                      - generic [ref=e744]: 已创建计划，并派发Einstein处理素材风险审计。
                  - generic [ref=e745]:
                    - generic [ref=e746]:
                      - generic [ref=e747]:
                        - generic [ref=e748]:
                          - img [ref=e749]
                          - generic [ref=e753]: Planner 调度 E2E
                        - generic [ref=e754]: 0/4 tasks · 3 active workers · 1 artifact
                        - paragraph [ref=e755]: 3 active workers · 2 blocked · 1 pending
                      - generic [ref=e756]: running
                    - generic [ref=e757]:
                      - button "Dispatch" [disabled] [ref=e758]:
                        - generic [ref=e759]:
                          - img [ref=e760]
                          - text: Dispatch
                      - button "Replan" [ref=e762] [cursor=pointer]:
                        - generic [ref=e763]:
                          - img [ref=e764]
                          - text: Replan
                      - button "Cancel tree" [ref=e769] [cursor=pointer]:
                        - generic [ref=e770]:
                          - img [ref=e771]
                          - text: Cancel tree
                    - generic [ref=e774]:
                      - combobox [ref=e775] [cursor=pointer]:
                        - generic: 2 workers
                        - img [ref=e776]
                      - combobox [ref=e778] [cursor=pointer]:
                        - generic: 2 attempts
                        - img [ref=e779]
                      - combobox [ref=e781] [cursor=pointer]:
                        - generic: 15m timeout
                        - img [ref=e782]
                    - group [ref=e786]:
                      - generic "1 plan artifact review 1" [ref=e787] [cursor=pointer]:
                        - img [ref=e788]
                        - generic [ref=e791]: 1 plan artifact
                        - generic [ref=e792]: review 1
                    - generic [ref=e793]:
                      - generic [ref=e796]:
                        - generic [ref=e797]:
                          - generic [ref=e798]: 素材风险审计
                          - generic [ref=e799]: running
                        - generic [ref=e800]:
                          - generic [ref=e801]: 62%
                          - generic [ref=e802]: Einstein
                          - generic [ref=e803]: attempt 1/2
                          - generic [ref=e804]: timeout 15m
                          - generic [ref=e805]: 1 artifact
                        - paragraph [ref=e806]: Worker run in progress.
                        - group [ref=e807]:
                          - generic "Worker Einstein in progress" [ref=e808] [cursor=pointer]:
                            - img [ref=e809]
                            - generic [ref=e812]: Worker Einstein
                            - generic [ref=e813]: in progress
                        - group [ref=e814]:
                          - generic "素材风险摘要 · Einstein" [ref=e815] [cursor=pointer]:
                            - generic [ref=e816]: 素材风险摘要 · Einstein
                      - generic [ref=e819]:
                        - generic [ref=e820]:
                          - generic [ref=e821]: 最终汇总
                          - generic [ref=e822]: pending
                        - generic [ref=e824]: 0%
                        - paragraph [ref=e825]: Ready when dependencies and worker capacity allow.
                      - generic [ref=e828]:
                        - generic [ref=e829]:
                          - generic [ref=e830]: 素材发布审批
                          - generic [ref=e831]: blocked
                        - generic [ref=e832]:
                          - generic [ref=e833]: 35%
                          - generic [ref=e834]: Hawking
                          - generic [ref=e835]: 1 approval
                        - paragraph [ref=e836]: Waiting for 1 approval.
                        - paragraph [ref=e837]: Worker run needs approval.
                        - group [ref=e838]:
                          - generic "Worker Hawking requires action" [ref=e839] [cursor=pointer]:
                            - img [ref=e840]
                            - generic [ref=e843]: Worker Hawking
                            - generic [ref=e844]: requires action
                        - group [ref=e845]:
                          - generic "1 action needed" [ref=e846] [cursor=pointer]:
                            - img [ref=e847]
                            - generic [ref=e851]: 1 action needed
                      - generic [ref=e854]:
                        - generic [ref=e855]:
                          - generic [ref=e856]: 素材范围确认
                          - generic [ref=e857]: blocked
                        - generic [ref=e858]:
                          - generic [ref=e859]: 20%
                          - generic [ref=e860]: Turing
                          - generic [ref=e861]: 1 input
                        - paragraph [ref=e862]: Waiting for 1 user input.
                        - paragraph [ref=e863]: Worker run needs input.
                        - group [ref=e864]:
                          - generic "Worker Turing requires action" [ref=e865] [cursor=pointer]:
                            - img [ref=e866]
                            - generic [ref=e869]: Worker Turing
                            - generic [ref=e870]: requires action
                        - group [ref=e871]:
                          - generic "1 action needed" [ref=e872] [cursor=pointer]:
                            - img [ref=e873]
                            - generic [ref=e877]: 1 action needed
                - generic [ref=e879]:
                  - generic [ref=e880]:
                    - generic [ref=e881]:
                      - img [ref=e882]
                      - generic [ref=e886]: Agent 工作流
                    - generic [ref=e887]: 等待审批
                  - generic [ref=e888]:
                    - generic [ref=e890]:
                      - img [ref=e891]
                      - generic [ref=e894]: 需要审批
                    - generic [ref=e896]:
                      - generic [ref=e897]:
                        - generic [ref=e898]:
                          - generic [ref=e899]: movscript_publish_assets
                          - generic [ref=e900]: write
                        - generic [ref=e901]:
                          - button "拒绝" [ref=e902] [cursor=pointer]:
                            - generic [ref=e903]: 拒绝
                          - button "通过" [ref=e904] [cursor=pointer]:
                            - generic [ref=e905]: 通过
                      - paragraph [ref=e906]: Publish reviewed asset metadata back to the project.
                      - generic [ref=e907]:
                        - generic [ref=e908]: "影响:"
                        - text: 通过后会允许一次写入操作，而不只是读取或预览数据。
                      - paragraph [ref=e909]: "权限: project.assets.write"
                      - generic [ref=e910]: "{ \"dryRun\": false }"
              - generic [ref=e912]:
                - generic [ref=e913]:
                  - paragraph [ref=e914]: 上下文
                  - paragraph [ref=e915]: 本地 Runtime 已上线
                - button "显示上下文" [ref=e916] [cursor=pointer]:
                  - generic [ref=e917]:
                    - img [ref=e918]
                    - text: 显示上下文
              - generic [ref=e921]:
                - generic [ref=e922]:
                  - paragraph [ref=e923]: 输入
                  - paragraph [ref=e924]: Enter 发送 · Shift+Enter 换行 · 输入 @ 选择资源
                - generic [ref=e925]:
                  - textbox [ref=e927]: 输入消息… (Enter 发送，输入 @ 选择资源)
                  - generic [ref=e928]:
                    - generic [ref=e929]:
                      - button "上传图片、视频、音频或文本" [ref=e930] [cursor=pointer]:
                        - img [ref=e931]
                      - button "引用" [ref=e934] [cursor=pointer]:
                        - img [ref=e935]
                      - button "调试预览" [ref=e938] [cursor=pointer]:
                        - generic [ref=e939]:
                          - img [ref=e940]
                          - text: 调试预览
                    - button "停止" [ref=e943] [cursor=pointer]:
                      - img [ref=e944]
                      - generic [ref=e947]: 停止
```

# Test source

```ts
  1   | import { expect, test, type Page, type Route } from '@playwright/test'
  2   | 
  3   | import { E2E_BOOTSTRAP_STORAGE_KEY } from '@/lib/e2eBootstrap'
  4   | import {
  5   |   APPROVAL_WORKER_RUN_ID,
  6   |   INPUT_WORKER_RUN_ID,
  7   |   PLANNER_PLAN_ID,
  8   |   PLANNER_RUN_ID,
  9   |   WORKER_RUN_ID,
  10  |   approvalWorkerRunFixture,
  11  |   buildPlannerAgentBootstrap,
  12  |   inputWorkerRunFixture,
  13  |   plannerPlanSnapshotFixture,
  14  |   plannerRunFixture,
  15  |   traceEventsFixture,
  16  |   traceSummaryFixture,
  17  |   workerRunFixture,
  18  | } from './agentPlannerSeed'
  19  | import { mockGenerationAppShell } from './generationAppShell'
  20  | 
  21  | test('planner run exposes plan overview and run detail drilldown', async ({ page }, testInfo) => {
  22  |   const baseURL = testInfo.project.use.baseURL
  23  |   if (!baseURL) throw new Error('planner E2E requires a baseURL')
  24  | 
  25  |   await page.addInitScript(({ key, seed }) => {
  26  |     window.localStorage.setItem(key, JSON.stringify(seed))
  27  |     window.localStorage.setItem('movscript.language', 'zh-CN')
  28  |   }, {
  29  |     key: E2E_BOOTSTRAP_STORAGE_KEY,
  30  |     seed: buildPlannerAgentBootstrap(String(baseURL)),
  31  |   })
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
> 66  |   await expect(page.getByTestId('agent-run-model-detail')).toBeVisible()
      |                                                            ^ Error: expect(locator).toBeVisible() failed
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
```