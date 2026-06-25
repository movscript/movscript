# MovScript Admin v2 Local 页面细节设计

本文档定义 Local Admin 的 6 个页面细节。Local Admin 的第一原则是：

```text
一个人，一个 key，一条视频生成闭环。
```

Local 不是 Cloud Admin 的另一套视觉产品。它和 Cloud 使用同一套 Admin Shell、同一套组件和同一套页面骨架，只是内容更少。

```text
Local = 同一界面的基础内容集
Cloud = 同一界面的扩展内容集
```

Local 的产品本质仍然是个人创作 runtime 的设置中心。

## 1. Local 全局设计

### 1.1 信息架构

Local 只保留 5+1 个入口：

```text
开始
接入 Key
视频能力
素材中转
失败诊断
高级
```

不要出现：

- 用户
- 组织
- 团队
- 审计
- 租户
- 用量治理
- 成本排行
- route matrix
- provider registry 全景

这些能力只进入“高级”或 Cloud。

### 1.2 页面壳

Local 使用和 Cloud 相同的 Admin Shell，只是导航和状态项更少：

- 左侧固定导航，宽度约 220px。
- 顶部只有运行状态条，不放复杂全局导航。
- 内容区采用 `max-width: 1180px`，避免像平台后台一样铺满。
- 每页右上角最多两个操作。
- 高级入口放在页面底部或右侧弱入口。

Cloud 进入同一套 Shell 后，只增加：

- 更多导航分组
- 更多状态项
- 更多表格列
- 更多详情面板内容
- 更多治理模块

不更换视觉语言。

### 1.3 顶部状态条

所有 Local 页面共享同一个状态条：

| 状态项 | 示例值 | 点击去向 |
| --- | --- | --- |
| Runtime | Local | 高级 / 系统设置 |
| Backend | Running | 失败诊断 |
| Worker | Ready / Busy / Offline | 失败诊断 |
| Key | Missing / Ready / Invalid | 接入 Key |
| Video | Not ready / T2V ready / I2V ready | 视频能力 |
| Relay | Missing / Ready | 素材中转 |

状态条只做导航和状态提示，不展开复杂详情。

### 1.4 Local 状态模型

Local 首页和页面状态应共享一个聚合 read model：

```ts
type LocalAdminStatus = {
  runtime: 'local'
  overall: 'empty' | 'partial' | 'ready' | 'blocked'
  primaryCapability: 'none' | 't2v' | 'i2v' | 'full'
  key: {
    status: 'missing' | 'ready' | 'invalid'
    providerLabel?: string
    kind?: 'relay_openai_compatible' | 'volcengine_official' | 'local_openai_compatible'
  }
  capabilities: Array<{
    key: 'text' | 'image' | 't2v' | 'i2v'
    label: string
    status: 'ready' | 'missing' | 'blocked' | 'warning'
    reason?: string
  }>
  relay: {
    status: 'missing' | 'ready' | 'not_required' | 'invalid'
    source?: 'provider' | 'tos' | 'public_relay'
  }
  nextActions: Array<{
    label: string
    href: string
    kind: 'primary' | 'secondary'
  }>
}
```

## 2. 页面一：开始

### 2.1 页面目标

回答：

> 我现在能不能开始做视频？

开始页不是统计页，也不是模块目录。它只展示个人创作闭环的当前状态。

### 2.2 首屏布局

首屏使用统一的 **Status + Next Action** 骨架，分为三列：

1. **左侧：创作状态**
   - 大标题：开始做视频
   - 状态：尚未接入 Key / 文生视频可用 / 图生视频待补齐 / 完整可用
   - 主按钮：接入 Key / 配置素材中转 / 测试生成
   - 次按钮：打开失败诊断

2. **中间：链路检查**
   - Key
   - 视频能力模板
   - 文生视频
   - 素材中转
   - 图生视频
   - Worker

3. **右侧：下一步**
   - 最多 3 条
   - 每条必须是可执行动作
   - 不放泛泛说明

### 2.3 页面下半部分

只放两块：

- 最近一次生成状态
- 最近阻塞原因

如果没有任务，不显示空表格，只显示一行轻量说明：

```text
完成 Key 接入后，可以在这里看到最近的生成结果。
```

### 2.4 状态

| 状态 | 主文案 | 主动作 |
| --- | --- | --- |
| Empty | 还没有接入 Key | 接入 Key |
| T2V ready | 文生视频已可用 | 测试生成 |
| I2V blocked | 图生视频还缺素材中转 | 配置素材中转 |
| Ready | 视频创作链路已就绪 | 测试生成 |
| Blocked | 运行环境有阻塞 | 查看失败诊断 |

### 2.5 禁止出现

- 成本图
- 用量排行
- 用户统计
- route table
- raw provider error
- catalog entry

## 3. 页面二：接入 Key

### 3.1 页面目标

回答：

> 我怎么把手里的中转站 / Provider key 填进去，然后自动具备视频生成能力？

这是 Local 最核心页面。

### 3.2 页面结构

采用统一的 **Form + Verification** 骨架，单页流程，不做多页 wizard：

1. 接入类型
2. Key 信息
3. 能力模板
4. 预览与验证

顶部可以有轻量 stepper，但页面主体始终在一页内，减少来回跳转。

### 3.3 Step 1：接入类型

默认推荐：

1. **OpenAI 兼容中转站 / 聚合站**
   - 标签：推荐
   - 说明：适合已经购买中转站 key 的个人用户
   - 字段：Base URL + API Key

2. **火山方舟官方 API**
   - 说明：适合直接使用火山官方服务
   - 字段：API Key

3. **火山方舟代理 / 聚合**
   - 说明：适合通过代理使用火山模型
   - 字段：Base URL + API Key

4. **本地 OpenAI 兼容端点**
   - 说明：适合本机或局域网模型服务
   - 字段：Base URL

卡片只展示能力图标：

- 文本
- 图片
- 文生视频
- 图生视频

不展示内部 provider type。

### 3.4 Step 2：Key 信息

初级字段：

- Base URL
- API Key
- 连接测试

安全提示：

```text
密钥只保存在本地配置中。Agent 不读取明文密钥。
```

高级折叠：

- Provider 名称
- Credential key
- Files API
- 自定义 Header
- 超时

### 3.5 Step 3：能力模板

默认模板：

1. **视频创作入门**
   - 文本规划
   - 图片生成
   - 文生视频
   - 图生视频预置

2. **完整多模态**
   - 视频创作入门
   - 图像编辑
   - 视频参考
   - 素材库

3. **仅保存 Key**
   - 不自动创建能力
   - 适合高级用户

对于中转站 / 聚合站，系统需要先做能力探测：

```text
探测 Base URL
-> 读取可用模型或测试兼容 endpoint
-> 映射到 MovScript 能力
-> 标记无法确认的能力
```

### 3.6 Step 4：预览与验证

预览只展示用户能理解的结果：

- 将启用文本与脚本
- 将启用图片生成
- 将启用文生视频
- 图生视频需要素材中转

高级展开才展示：

- public model id
- provider model id
- route
- template key

验证分层：

1. Key 连接测试
2. 模型映射测试
3. 低成本文本测试
4. 文生视频前置检查
5. 图生视频素材前置检查

### 3.7 失败状态

| 失败 | 用户文案 | 动作 |
| --- | --- | --- |
| Base URL 不通 | 无法连接到这个中转站 | 检查 Base URL |
| Key 无效 | Key 验证失败 | 重新输入 Key |
| 不支持视频 | 这个接入暂未检测到视频能力 | 仅保存 Key / 更换接入 |
| 缺素材中转 | 图生视频需要公网素材 URL | 配置素材中转 |

## 4. 页面三：视频能力

### 4.1 页面目标

回答：

> 文本、图片、文生视频、图生视频现在能不能用？

页面按能力组织，不按模型对象组织。

### 4.2 页面结构

主体使用统一的 **List + Inspector** 骨架：

| 能力 | 状态 | 当前接入 | 最近检查 | 操作 |
| --- | --- | --- | --- | --- |
| 文本与脚本 | 可用 | 中转站 | 2 分钟前 | 测试 |
| 图片生成 | 可用 | 中转站 | 2 分钟前 | 测试 |
| 文生视频 | 可用 | 中转站 | 2 分钟前 | 测试 |
| 图生视频 | 待补齐 | 中转站 | 缺素材中转 | 配置中转 |

点击一行打开右侧详情：

- 当前状态
- 为什么可用 / 不可用
- 最近错误
- 推荐动作
- 高级详情入口

### 4.3 测试动作

测试必须轻量：

- 文本：低成本短请求
- 图片：可选测试，不默认自动生成
- 文生视频：默认只做前置检查，真实生成需要用户确认
- 图生视频：先检查素材中转，不直接消耗额度

### 4.4 禁止出现

- route priority
- capacity weight
- concurrency
- pricing JSON
- provider raw response

## 5. 页面四：素材中转

### 5.1 页面目标

回答：

> 本地素材能不能被视频 provider 访问？

这是图生视频最关键的 Local 页面。

### 5.2 页面判断顺序

页面先做三段判断：

1. 当前接入是否已经提供公网素材能力
2. MovScript 是否配置了 TOS / public relay
3. 当前测试文件是否能被 provider 访问

### 5.3 页面布局

素材中转使用统一的 **Form + Verification** 骨架。

1. **状态主卡**
   - 可用 / 未配置 / 验证失败
   - 影响能力：图生视频、视频参考、素材库
   - 主按钮：配置中转 / 验证中转

2. **中转来源**
   - 使用中转站素材能力
   - 使用 TOS
   - 使用自定义公网 URL

3. **配置表单**
   - Bucket
   - Region
   - Access Key ID
   - Secret Access Key
   - Public Base URL
   - Signing Secret

4. **验证步骤**
   - 上传测试文件
   - 生成公网 URL
   - 浏览器访问测试
   - provider 前置检查

### 5.4 重要原则

素材中转缺失时：

- 不阻塞文生视频
- 只阻塞图生视频和视频参考
- 首页和视频能力页都要明确显示“待补齐”

## 6. 页面五：失败诊断

### 6.1 页面目标

回答：

> 刚才为什么失败？我下一步点哪里修？

失败诊断不是日志页。它是用户可读的修复页。

### 6.2 页面结构

失败诊断使用统一的 **List + Inspector** 骨架。

1. **最近失败摘要**
   - 任务类型
   - 失败时间
   - 用户可读原因
   - 最推荐修复动作

2. **失败列表**
   - 最近 20 条
   - 状态、能力、接入、错误摘要

3. **诊断详情**
   - 发生了什么
   - 证据
   - 可能原因
   - 推荐动作

4. **高级详情折叠**
   - provider task id
   - route selection
   - request id
   - raw error

### 6.3 错误类型映射

| 错误类型 | 用户文案 | 主动作 |
| --- | --- | --- |
| missing_key | 还没有接入 Key | 接入 Key |
| invalid_key | 当前 Key 验证失败 | 重新输入 Key |
| missing_capability | 还没有启用视频能力 | 应用视频模板 |
| missing_public_input_url | 图生视频需要公网素材 URL | 配置素材中转 |
| provider_rate_limited | 上游暂时限流 | 稍后重试 |
| worker_offline | 本地 Worker 未运行 | 查看运行状态 |
| route_not_found | 当前能力没有可用线路 | 打开高级 |

### 6.4 Agent Focus

失败诊断页是 Agent Focus 的主要入口：

- 打开专注修复
- 应用推荐修复
- 修复后重试

但用户必须确认涉及费用、密钥或高级配置的动作。

## 7. 页面六：高级

### 7.1 页面目标

回答：

> 我确实知道自己要改内部机制，入口在哪里？

高级是收纳区，不是 Local 的第二条主路径。它仍然使用和 Cloud 高级页相同的页面骨架，只是默认内容更少。

### 7.2 标签结构

```text
Provider 详情
模型与路由
参数与成本
存储详情
日志与调用
系统设置
```

### 7.3 进入高级的方式

高级不应在 Local 主路径里强推，只在这些场景出现：

- 用户主动点击“高级”
- 失败诊断需要定位 route
- Agent Focus 需要用户确认高级修复
- 接入 Key 时选择“仅保存 Key”

### 7.4 高级页顶部提示

每个标签顶部都应有一句提示：

```text
通常不需要修改这里。这里用于检查或调整自动生成的高级配置。
```

### 7.5 高级页内容

高级可以高密度，但必须保留来源标记：

- 自动来自哪个能力模板
- 由哪个 provider key 创建
- 当前影响哪些能力
- 最近一次被哪个任务使用

## 8. Local Agent Focus 对照

| 触发场景 | Focus | 打开的页面能力 |
| --- | --- | --- |
| 空系统 | `setup.video.start` | 接入 Key |
| 用户有中转站 key | `relay_provider.key.add` | 接入 Key |
| 图生视频缺公网素材 | `storage.public_relay.configure` | 素材中转 |
| 生成失败 | `job.failure.triage` | 失败诊断 |
| 用户要验证能力 | `capability.test` | 视频能力 |

Focus 的 UI 只显示当前任务，不显示完整左侧导航。

## 9. 第一轮视觉稿范围

Local 页面第一轮需要 6 张图：

1. 开始
2. 接入 Key
3. 视频能力
4. 素材中转
5. 失败诊断
6. 高级

每张图只画一个页面，不再把 Local / Cloud / 用户层级混在一起。
