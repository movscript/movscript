# MovScript Admin v2 统一界面系统

Admin v2 只有一套界面系统。

视觉定义、信息层级和组件语义详见 `admin-v2-visual-definition.zh-CN.md`。

```text
Local = 同一界面的基础内容集
Cloud = 同一界面的扩展内容集
```

Local 和 Cloud 不应该长得像两个不同产品。用户从 Local 升级到 Cloud，只应该感觉“多了团队和治理能力”，不应该感觉进入了另一个后台。

## 1. 总体原则

### 1.1 Same Shell

Local 和 Cloud 使用同一个 Admin Shell：

- 同一个左侧导航宽度
- 同一个顶部状态条
- 同一个页面标题区
- 同一个内容栅格
- 同一个详情侧栏
- 同一个底部确认条
- 同一个 Agent Focus 入口

### 1.2 More Content, Not New UI

Cloud 只是在 Local 的基础上增加：

- 更多导航项
- 更多状态指标
- 更多表格列
- 更多筛选维度
- 更多治理模块
- 更多权限和审计信息

Cloud 不应该增加一套新的视觉语言。

### 1.3 Progressive Disclosure

Admin v2 的复杂度按三层展开：

```text
Primary：当前用户最该做什么
Detail：当前对象为什么是这个状态
Advanced：内部机制和可精细修改项
```

Local 默认只展示 Primary + 少量 Detail。

Cloud 默认展示 Primary + Detail，并允许更快进入 Advanced。

## 2. 统一 Shell

### 2.1 左侧导航

导航组件完全相同。

Local：

```text
开始
接入 Key
视频能力
素材中转
失败诊断
高级
```

Cloud：

```text
开始

生产配置
  接入 / Provider
  视频能力
  模型与路由
  资源与存储

运行观测
  失败诊断
  任务与调用
  用量与成本

治理
  用户与组织
  权限与审计

系统
  高级设置
```

注意：

- Cloud 不是换一套导航，而是在 Local 导航语法上增加分组。
- Local 的页面名尽量能映射到 Cloud 页面名。
- 不要在 Cloud 里突然使用完全不同的对象名作为一级入口。

### 2.2 顶部状态条

状态条同一组件，不同内容密度。

Local 状态项：

```text
Runtime
Backend
Worker
Key
Video
Relay
```

Cloud 状态项：

```text
Runtime
Backend
Worker Pool
Provider
Route Coverage
Storage/CDN
Quota
Risk
```

视觉规则：

- 高度一致
- 状态点一致
- 点击跳转一致
- Cloud 只增加项，不改变组件行为

### 2.3 页面标题区

统一结构：

```text
页面标题
一句任务说明
右侧主动作
右侧次动作
```

Local 示例：

```text
接入 Key
填入一个中转站或 Provider Key，系统会自动应用视频创作入门模板。
```

Cloud 示例：

```text
接入 / Provider
管理团队共享 Provider、凭据和可用能力。
```

### 2.4 内容布局

统一使用三种页面骨架：

1. **Status + Next Action**
   - 用于开始页、启动中心
   - 左侧主状态，中间链路检查，右侧下一步

2. **List + Inspector**
   - 用于视频能力、失败诊断、Provider、模型与路由、任务与调用
   - 左侧列表或表格，右侧详情面板

3. **Form + Verification**
   - 用于接入 Key、素材中转、资源与存储
   - 左侧表单，中间预览，右侧验证步骤

Local 和 Cloud 都只能从这三种骨架里选，不新增任意页面结构。

## 3. 页面映射

| Local 页面 | Cloud 扩展页面 | 共享页面骨架 | Cloud 增加内容 |
| --- | --- | --- | --- |
| 开始 | 开始 / 启动中心 | Status + Next Action | 团队状态、成本风险、Provider lanes |
| 接入 Key | 接入 / Provider | Form + Verification | 多 provider、共享凭据、权限、健康检查 |
| 视频能力 | 视频能力 / 模型与路由 | List + Inspector | route coverage、fallback、并发、成本 |
| 素材中转 | 资源与存储 | Form + Verification | 对象存储、CDN、asset library、权限 |
| 失败诊断 | 失败诊断 / 任务与调用 | List + Inspector | job queue、provider calls、worker pool |
| 高级 | 高级设置 / 治理 | List + Inspector | 用户组织、审计、配额、安全 |

## 4. 组件规则

### 4.1 状态节点

统一状态枚举：

```text
ready
missing
warning
blocked
checking
disabled
```

Local 用于能力链路。

Cloud 用于 provider lanes、route coverage、worker pool、storage/CDN。

### 4.2 动作按钮

每页最多两个常驻按钮：

- Primary：当前最推荐动作
- Secondary：次要动作

更多动作进入行内菜单或详情面板。

### 4.3 表格

Local 表格列少：

```text
对象 / 状态 / 当前接入 / 最近检查 / 操作
```

Cloud 表格在同一表格组件上扩展：

```text
对象 / 状态 / Provider / Route / Team / Cost / Quota / 最近检查 / 操作
```

不要为 Cloud 发明另一套表格样式。

### 4.4 详情面板

统一右侧 Inspector：

```text
当前状态
阻塞原因
证据
推荐动作
高级详情
```

Local 的高级详情默认折叠。

Cloud 可以默认展开更多技术字段，但位置相同。

### 4.5 验证步骤

统一验证面板：

```text
检查项
状态
证据
失败原因
修复动作
```

Local 示例：

- Key 连接测试
- 能力模板
- 文生视频前置
- 素材中转

Cloud 示例：

- Provider health
- Route coverage
- Worker capacity
- Storage/CDN access
- Quota policy

## 5. Agent Focus

Agent Focus 也使用同一套壳。

Local Focus：

- 接入中转 Key
- 配置素材中转
- 解释失败

Cloud Focus：

- 接入团队 Provider
- 检查线路故障
- 分析成本异常
- 审计事件

区别只在任务内容，不在视觉结构。

Focus 固定结构：

```text
任务头
步骤栏
主操作区
证据面板
确认底栏
返回入口
```

## 6. 视觉方向

同一套视觉语言：

- 背景：浅中性灰或白
- 字体：清晰、工具型、低装饰
- 主强调：青绿 / 蓝绿
- 状态色：绿、琥珀、红、灰
- 圆角：克制，不做大圆卡片
- 卡片：只用于模块和详情，不做层层嵌套
- 表格：紧凑但留白清楚

Cloud 可以更密，但不能更“重”。

## 7. 第一轮示意图策略

后续页面图应该成对设计：

1. Local 开始
2. Cloud 开始
3. Local 接入 Key
4. Cloud 接入 / Provider
5. Local 视频能力
6. Cloud 视频能力 / 模型与路由
7. Local 素材中转
8. Cloud 资源与存储
9. Local 失败诊断
10. Cloud 任务与调用
11. Local 高级
12. Cloud 高级设置 / 治理

每一对必须看起来是同一个产品，只是 Cloud 信息更多。
