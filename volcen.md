您调用方舟平台的模型之前，您需要 API Key 来进行鉴权。同时因为 API Key 信息较为敏感，泄露 API Key 会导致您的模型用量被其他人花费，造成一定的损失，因此我们会给出配置 API Key 进环境变量的方法，方便您合理安全地使用API Key。
<span id="20bdcc68"></span>
## 获取 API Key

1. 打开并登录[API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面。
2. （可选）单击左上角 **账号全部资源** 下拉箭头，切换项目空间。
3. 单击 **创建 API Key** 按钮。
4. 在弹出框的 **名称** 文本框中确认/更改 API Key名称，单击创建。

您可以在[API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面的 **API Key 列表**中查看刚创建的API Key信息。
<span id="f1908ee9"></span>
## 配置 API Key
推荐将 API Key 配置在环境变量中，而不是硬编码进代码中，避免 API Key 随代码泄露，导致配额被他人使用，产生额外花费。
配置方法见：[配置 API Key 到环境变量](/docs/82379/1399008#4b62407d)。
<span id="64cf3cd0"></span>
## 使用说明

* API Key 配额：一个主账号下支持创建 50 个API Key，如需更多配额请提交[工单](https://console.volcengine.com/workorder/create?step=2&SubProductID=P00001166)申请。
* API Key 权限控制：API Key 创建于您当前所在项目，用于访问当前项目下的资源（即模型服务和应用）。您可为 API Key 额外限制可鉴权的 Model ID /自定义推理接入点，或可调用该 API Key 的 IP。
   * TIPS ：您切换项目空间创建 API Key，可限制 API Key 只用于指定项目空间下的模型服务的鉴权凭证。当您的账号是多人使用，可以通过此方法进行权限隔离。
   * 注意：API Key 仅支持访问指定项目下的接入点，不支持跨项目访问。当您跨项目迁移了接入点，则原 API Key 鉴权将失效。



方舟提供了 Python 、 Go 和 Java 的 SDK ，方便使用对应编程语言快速调用方舟的模型服务。
Python SDK
前提条件
本地已安装了 Python ，且版本不低于 3.7。
可在终端中通过命令确认 Python 版本。

Bash
复制
python -V

Python 可使用 UV 安装，并通过它来管理虚拟环境。UV 是一个 Rust 编写的、速度极快的 Python 包和项目管理器，可以方便进行环境隔离，避免干扰您系统中已有的 Python 配置。
安装 Python SDK
在终端中执行命令安装 Python SDK。

Bash
复制
pip install 'volcengine-python-sdk[ark]'

说明
如本地安装错误，可尝试下面方法：
Windows系统安装SDK失败，ERROR: Failed building wheel for volcengine-python-sdk
尝试使用下面命令 uv pip install volcengine-python-sdk[ark]
如需源码安装，可下载&解压对应版本 SDK 包，进入目录执行命令：python setup.py install --user。
如使用了uv，可以通过 uv pip install 'volcengine-python-sdk[ark]' 命令安装 SDK。
升级 Python SDK
如需使用方舟提供的最新能力，请升级 SDK 至最新版本。

Bash
复制
pip install 'volcengine-python-sdk[ark]' -U

Go SDK
前提条件
检查 Go 版本，需 1.18 或以上。

Bash
复制
go version

如未安装或版本不满足，可访问 Go 语言官方网站下载并安装，请选择 1.18 或以上版本。
安装 Go SDK
Go SDK 使用 go mod 管理，可运行以下命令初始化 go mod。<YOUR_PROJECT_NAME> 替换为项目名称。

Bash
复制
# 如在文件夹 ark-demo 下打开终端窗口，运行命令go mod init ark-demo
go mod init <YOUR_PROJECT_NAME>

在本地初始化 go mod 后，运行以下命令安装最新版 SDK。

Bash
复制
go get -u github.com/volcengine/volcengine-go-sdk 

说明
如需安装特定版本的SDK，可使用命令：
go get -u github.com/volcengine/volcengine-go-sdk@<VERSION>
其中<VERSION>替换为版本号。SDK 版本可查询： https://github.com/volcengine/volcengine-go-sdk/releases
在代码中引入 SDK 使用。

Go
复制
import "github.com/volcengine/volcengine-go-sdk/service/arkruntime"

更新依赖后，使用命令整理依赖。

Bash
复制
go mod tidy

升级 Go SDK
步骤与安装 Go SDK相同，可参考安装 Go SDK，第1，2步升级至最新/指定版本SDK。
升级至最新版本

Bash
复制
go get -u github.com/volcengine/volcengine-go-sdk

升级至指定版本

Bash
复制
go get -u github.com/volcengine/volcengine-go-sdk@<VERSION>

Java SDK
适用范围
本 SDK 仅适用于 Java 服务端开发，暂不支持 Android 平台。若需在 Android 平台使用相关功能，需由客户自行开发适配方案。
前提条件
检查并安装 Java 版本，Java 版本需 1.8 或以上。

Bash
复制
java -version

如未安装 Java 或者版本不满足要求，可访问 Oracle 官方网站下载并安装适合操作系统的 Java 版本。请确保选择 1.8 或以上版本。
安装 Java SDK
火山方舟 Java SDK 支持通过 Maven 安装、通过 Gradle 安装两种方式。
通过 Maven 安装
在 pom.xml 文件中进行如下配置，完整配置可参考Maven Central：

XML
复制
...
<dependency>
  <groupId>com.volcengine</groupId>
  <artifactId>volcengine-java-sdk-ark-runtime</artifactId>
  <version>LATEST</version>
</dependency>
...

通过 Gradle 安装
在 build.gradle 文件中进行如下配置，在 dependencies 中添加依赖。

Plain
复制
implementation 'com.volcengine:volcengine-java-sdk-ark-runtime:LATEST'

升级 Java SDK
说明
获取 SDK 版本信息，替换'LATEST' 为指定/最新版本号。SDK版本号可查询：https://github.com/volcengine/volcengine-java-sdk/releases
同安装 Java SDK，指定需升级的版本号即可。
第三方SDK
火山方舟模型调用 API 与 OpenAI API 协议兼容，可使用兼容 OpenAI API 协议的多语言社区 SDK 调用火山方舟大模型或应用。可很方便地迁移模型服务至方舟平台以及 Doubao 大模型。具体使用方法请参考兼容 OpenAI SDK。
相关文档
SDK 常见使用示例：包含SDK的常见用法。
火山方舟API分为模型调用的API（数据面 API），及管理推理接入点等管控相关的管控面 API。他们支持的鉴权方式有所不同，下面介绍方舟API的鉴权方式。
<span id="28e0db57"></span>
# 概念解释

* **数据面 API**：是直接面向**业务数据传输、实时交互、用户请求处理**的接口，聚焦于 “实际业务数据的流转与处理”，是系统对外提供核心服务能力的载体。请求大模型服务的 Chat API、Responses API 均为数据面 API。
* **管控面 API**：用于**系统资源管理、配置控制和状态监控**的接口。它专注于管理和调度数据面及系统资源，是保障系统稳定运行的“控制中枢”。例如，在方舟中用于管理 API Key、基础模型等接口，均属于管控面 API。
* **Base URL**：是构建完整 API 请求 URL 的 “基础模板”，包含**协议（如 http/https）、host（主机域名或 IP）、端口（可选）和基础路径（可选）** ，是所有具体接口路径的 “公共前缀”。你可以根据Base URL 加接口/版本等参数拼接出完整接口 URL ，典型结构：`[协议]://[host]/[基础路径（可选）]`

<span id="b77a3928"></span>
# Base URL
:::warning
下面给到的数据面 API 与 Coding Plan 支持的 Base URL 不同。Coding Plan 用户请使用正确的 Base URL，避免因地址错误产生额外费用，具体参见 [Base URL](/docs/82379/1928261#7fd1eee7)。
:::
各接口类型对应的 Base URL。

* 数据面 API：https://ark.cn\-beijing.volces.com/api/v3
* 管控面 API：https://ark.cn\-beijing.volcengineapi.com/

<span id="0fed4817"></span>
# 数据面 API 鉴权
支持两种鉴权方式，API Key 鉴权（简单方便），与 Access Key 鉴权（传统云上资源权限管控，可以分资源组云产品等维度管理，面向企业精细化管理）。
<span id="60db1ed6"></span>
## API Key 签名鉴权
<span id="6011c5a5"></span>
### 前提条件
:::tip
方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 [快速入门](/docs/82379/1399008)。
:::
<span id="d44d13a6"></span>
### 签名构造
在 HTTP 请求 header 中按如下方式添加 `Authorization` header:
```Shell
Authorization: Bearer $ARK_API_KEY
```

示例如下
```Shell
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Hello!"
        }
    ]
  }'
```


* 可按需替换 Model ID。查询 Model ID见 [模型列表](/docs/82379/1330310)。

<span id="21bff83b"></span>
## Access Key 签名鉴权
<span id="3ad1c414"></span>
### 前提条件
你已获取到Access Key。如需创建/查看Access Key，请参见[API访问密钥管理](https://www.volcengine.com/docs/6257/64983)。
> 由于主账号的Access Key拥有较大权限，建议你创建IAM用户并授予方舟等权限，然后使用IAM用户的 Access Key 来进行操作，具体请参见[使用 IAM 管理权限](/docs/82379/1263493)。

<span id="d03b2bb1"></span>
### 使用示例
见 [使用Access Key鉴权](/docs/82379/1544136#fa44b913)。
> 通过Access Key 鉴权，model 字段 需配置为 Endpoint ID。

<span id="bdd329d5"></span>
# 管控面 API 鉴权
管控面的API，如管理API Key、管理推理接入点等接口。
<span id="50f355e8"></span>
## Access Key 签名鉴权
获取Access Key。如需创建/查看Access Key，请参见[API访问密钥管理](https://www.volcengine.com/docs/6257/64983)。
<span id="c04e9b57"></span>
### 方法：使用示例/说明（简单，推荐）
参见[SDK 接入指南](https://api.volcengine.com/api-sdk/view?serviceCode=ark&version=2024-01-01&language=Java)。
<span id="101d062c"></span>
### 方法：自行实现签名（实现成本高，不推荐）

1. 使用 Access Key 构造签名。具体方法请参见[签名方法](https://www.volcengine.com/docs/6369/67269)。
> 签名用到的方舟相关字段信息：
> * Service：`ark`
> * Region：`cn-beijing`
2. 使用cURL发起请求，请求示例如下：

```Shell
curl -X POST \
  'https://ark.cn-beijing.volcengineapi.com/?Action=ListEndpoints&Version=2024-01-01' \
  -H 'Authorization: HMAC-SHA256 Credential=AKL**/20240710/cn-beijing/ark/request, SignedHeaders=host;x-content-sha256;x-date, Signature=a7a****' \
  -H 'Content-Type: application/json' \
  -H 'Host: ark.cn-beijing.volcengineapi.com' \
  -H 'X-Content-Sha256: 44***' \
  -H 'X-Date: 20240710T042925Z' \
  -d '{}'
```



`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`   [运行](https://api.volcengine.com/api-explorer/?action=ChatCompletions&groupName=%E5%AF%B9%E8%AF%9D%28Chat%29%20API&serviceCode=ark&version=2024-01-01)
发送包含文本、图片、视频等模态的消息列表，模型将生成对话中的下一条消息。

Tips：一键展开折叠，快速检索内容
:::tip
打开页面右上角开关后，**ctrl ** + f 可检索页面内所有内容。
<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_952f1a5ff1c9fc29c4642af62ee3d3ee.png) </span>

:::

```mixin-react
return (<Tabs>
<Tabs.TabPane title="在线调试" key="NxI2ZZeLhf"><RenderMd content={`<APILink link="https://api.volcengine.com/api-explorer/?action=ChatCompletions&groupName=%E5%AF%B9%E8%AF%9D%28Chat%29%20API&serviceCode=ark&version=2024-01-01" description="API Explorer 您可以通过 API Explorer 在线发起调用，无需关注签名生成过程，快速获取调用结果。">去调试</APILink>

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入口" key="cyg8mBFqXQ"><RenderMd content={` [ ](#)[体验中心](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/chat)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[文本生成](https://www.volcengine.com/docs/82379/1399009)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[视觉理解](https://www.volcengine.com/docs/82379/1362931)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span>[接口文档](https://www.volcengine.com/docs/82379/1494384)
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="RxN8G2nH"></span>
## 请求参数
> 跳转 [响应参数](#Qu59cel0)

<span id="pjuiBZGA"></span>
### 请求体

---


**model** `string` `必选`
调用的模型 ID （Model ID），[开通模型服务](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)，并[查询 Model ID](https://www.volcengine.com/docs/82379/1330310) 。
多个应用及精细管理场景，推荐使用 Endpoint ID 调用。详细请参考 [获取 Endpoint ID](https://www.volcengine.com/docs/82379/1099522)。

---


**messages**  `object[]` `必选`
消息列表，不同模型支持不同类型的消息，如文本、图片、视频等。

消息类型

---


系统消息 `object`
模型需遵循的指令，包括扮演的角色、背景信息等。

属性

---


messages.**role** `string` `必选`
发送消息的角色，此处应为`system`。

---


messages.**content** `string / object[]` `必选`
系统消息的内容。

属性

---


纯文本内容 `string`
纯文本消息内容。

---


多模态内容 `object[]` 
支持文本、图片、视频等模态内容。

各模态内容对象

---


文本部分 `object`

属性

---


messages.content.**text ** `string` `必选`
文本模态部分的内容。

---


messages.content.**type ** `string` `必选`
内容模态，此处应为 `text`。


---


图片部分 `object`

属性

---


messages.content.**image_url ** `object` `必选`
图片模态的内容。

属性

---


messages.content.image_url.**url ** `string` `必选`
支持格式如下，详细信息请参见[使用说明](https://www.volcengine.com/docs/82379/1362931#.5L2_55So6K-05piO)。

* 图片链接
* 图片的Base64编码


---


messages.content.image_url.**detail ** `string`  
取值范围：`low`、`high`、`xhigh`。
理解图片的精细度、不同模型默认取值及对应的具体像素区间，参见[控制图片理解的精细度](https://www.volcengine.com/docs/82379/1362931#bf4d9224)。


---


messages.content.**type ** `string` `必选`
内容模态，此处应为 `image_url`。


---


视频部分 `object`
> 不支持理解视频中的音频内容。


属性

---


messages.content.**type ** `string` `必选`
内容模态，此处应为`video_url`。

---


messages.content.**video_url ** `object` `必选`
视频消息的内容部分。

属性

---


messages.content.video_url.**url ** `string` `必选`
支持格式如下，具体使用请参见[视频理解说明](https://www.volcengine.com/docs/82379/1895586)。

* 视频链接
* 视频的Base64编码


---


messages.content.video_url.**fps** `float/ null` `默认值 1`
取值范围：`[0.2, 5]`
抽帧频率，详见[视频理解](https://www.volcengine.com/docs/82379/1895586)。

* 取值越高，对视频中画面变化越敏感。
* 取值越低，对视频中画面变化越迟钝，但 token 花费少，速度更快。






---


用户消息 `object` 
用户角色发送的消息。不同模型支持的字段类型不同。

属性

---


messages.**role** `string` `必选`
发送消息的角色，此处应为`user`。

---


messages.**content** `string / object[]` `必选`
用户信息内容。

内容类型

---


纯文本内容 `string`
纯文本消息内容。

---


多模态内容 `object[]` 
支持文本、图片、视频等模态内容。

内容类型

---


文本部分 `object`
多模态消息中，文本模态的部分。

属性

---


messages.content.**text ** `string` `必选`
文本模态部分的内容。

---


messages.content.**type ** `string` `必选`
内容模态，此处应为 `text`。


---


图片部分 `object`

属性

---


messages.content.**type ** `string` `必选`
消息模态，此处应为 `image_url`。

---


messages.content.**image_url ** `object` `必选`
图片模态的内容。

属性

---


messages.content.image_url.**url ** `string` `必选`
支持格式如下，具体请参见[使用说明](https://www.volcengine.com/docs/82379/1362931#.5L2_55So6K-05piO)。

* 图片链接
* 图片的Base64编码


---


messages.content.image_url.**detail ** `string / null`  
取值范围：`low`、`high`、`xhigh`。
理解图片的精细度、不同模型默认取值及对应的具体像素区间，参见[控制图片理解的精细度](https://www.volcengine.com/docs/82379/1362931#bf4d9224)。

---


messages.content.image_url.**image_pixel_limit  ** `object / null` `默认值 null`
输入给模型的图片的像素范围，如不在此范围，图片会被等比例缩放至该范围。
:::warning
图片像素范围需在 [196, 36,000,000]，否则会直接报错。

:::
* 生效优先级：高于 **detail ** 字段，即同时配置 **detail ** 与 **image_pixel_limit ** 字段时，生效 **image_pixel_limit ** 字段配置 **。** 
* 默认生效规则：若未设置**image_pixel_limit**，则使用 **detail ** 配置的值对应的 **min_pixels ** / **max_pixels ** 值。


---



* messages.content.image_url.image_pixel_limit.**max_pixels ** `integer`
   传入图片最大像素限制，大于此像素则等比例缩小至 **max_pixels ** 字段取值以下。若未设置，则取值为 **detail ** 配置的值对应的 **max_pixels ** 值。
   * doubao\-seed\-1.8 之前的模型取值范围：(**min_pixels**,  `4014080`]
   * doubao\-seed\-1.8、doubao\-seed\-2.0 模型的取值范围：(**min_pixels**, `9031680`]。


---



* messages.content.image_url.image_pixel_limit.**min_pixels ** `integer`
   传入图片最小像素限制，小于此像素则等比例放大至 **min_pixels ** 字段取值以上。若未设置，则取值为 **detail ** 配置的值对应的 **min_pixels ** 值。
   * doubao\-seed\-1.8 之前的模型取值范围：[`3136`,  **max_pixels**)
   * doubao\-seed\-1.8、doubao\-seed\-2.0 模型的取值范围：[`1764`,  **max_pixels**)



---


视频部分 `object`
> 不支持理解视频中的音频内容。


属性

---


messages.content.**type ** `string` `必选`
内容模态，此处应为 `video_url` **。** 

---


messages.content.**video_url**`object` `必选`
视频模态的内容。

属性

---


messages.content.video_url.**url ** `string` `必选`
支持格式如下，具体使用请参见[视频理解说明](https://www.volcengine.com/docs/82379/1895586)。

* 视频链接
* 视频的Base64编码


---


messages.content.video_url.**fps** `float/ null` `默认值 1`
取值范围：`[0.2, 5]`。
抽帧频率，详见[视频理解](https://www.volcengine.com/docs/82379/1895586)。

* 取值越高，对视频中画面变化越敏感。
* 取值越低，对视频中画面变化越迟钝，但 token 花费少，速度更快。



---






---


模型消息 `object`
历史对话中，模型角色返回的消息。用以保持对话一致性，多在[多轮对话](https://www.volcengine.com/docs/82379/1399009#.5aSa6L2u5a-56K-d)及[续写模式](https://www.volcengine.com/docs/82379/1359497)使用。

属性
:::tip
messages.**content** ** ** 与 messages.**tool_calls** ** ** 至少填写其一。

:::
---


messages.**role** `string` `必选`
发送消息的角色，此处应为`assistant`。

---


messages.**content** `string / array`  
模型消息的内容。

---


messages.**reasoning_content** `string`
模型消息中思维链内容。
> 仅模型 `doubao-seed-1.8`、`deepseek-v3.2`、`doubao-seed-2.0`支持该字段。


---


messages.**tool_calls** `object[]`
模型消息中工具调用部分。

属性

---


messages.tool_calls **.function ** `object` `必选`
模型返回的需调用的函数信息。

属性

---


messages.tool_calls **.** function.**name ** `string` `必选`
需调用的函数的名称。

---


messages.tool_calls **.** function.**arguments ** `string` `必选`
需调用的函数的入参，JSON 格式。
:::tip
模型并不总是生成有效的 JSON，可能会虚构出未定义的参数。建议在调用函数前，验证参数是否有效。

:::

---


messages.tool_calls **.id ** `string` `必选`
需调用的工具的 ID，由模型生成。

---


messages.tool_calls **.type ** `string` `必选`
消息类型，当前仅支持`function`。



---


工具消息 `object`
历史对话中，调用工具返回的消息。工具调用场景中使用。

属性

---


messages.**role** `string` `必选`
发送消息的角色，此处应为`tool`。

---


messages.**content** `string / array`  `必选`
工具返回的消息。

---


messages.**tool_call_id ** `string` `必选`
模型生成的需调用工具请求时，生成的ID。在程序调用工具的返回需要附上同一 ID，来关联工具结构与模型请求。避免多工具调用时混淆信息。



---


**thinking** `object` `默认值 {"type":"enabled"}`
控制模型是否开启深度思考模式。
> 不同模型是否支持以及默认取值不同，详情请查询[文档](https://www.volcengine.com/docs/82379/1449737#0002)。


属性

---


thinking.**type ** `string`  `必选`
取值范围：`enabled`， `disabled`，`auto`。

* `enabled`：开启思考模式，模型强制先思考再回答。
* `disabled`：关闭思考模式，模型直接回答问题，不进行思考。
* `auto`：自动思考模式，模型根据问题自主判断是否需要思考，简单题目直接回答。


---


**stream** `boolean / null` `默认值 false`
响应内容是否流式返回：

* `false`：模型生成完所有内容后一次性返回结果。
* `true`：按 SSE 协议逐块返回模型生成内容，并以一条 `data: [DONE] `消息结束。当 **stream** 为 `true` 时，可设置 **stream_options** 字段以获取 token 用量统计信息。


---


**stream_options** `object / null` `默认值 null`
流式响应的选项。当 **stream** 为 `true` 时，可设置 **stream_options** 字段。

属性

---


stream_options.**include_usage ** `boolean / null` `默认值 false`
模型流式输出时，是否在输出结束前输出本次请求的 token 用量信息。

* `true`：在 `data: [DONE]` 消息之前会返回一个额外的 chunk。此 chunk 中， **usage** 字段中输出整个请求的 token 用量，**choices** 字段为空数组。
* `false`：输出结束前，没有一个 chunk 来返回 token 用量信息。


---


stream_options.**chunk_include_usage ** `boolean / null` `默认值 false`
模型流式输出时，输出的每个 chunk 中是否输出本次请求到此 chunk 输出时刻的累计 token 用量信息。

* `true`：在返回的 **usage** 字段中，输出本次请求到此 chunk 输出时刻的累计 token 用量。
* `false`：不在每个 chunk 都返回 token 用量信息。


---


**max_tokens** `integer / null` `默认值 4096`
取值范围：各个模型不同，详细见[模型列表](https://www.volcengine.com/docs/82379/1330310)。
模型回答最大长度（单位 token）。
:::tip

* 模型回答不包含思维链内容，模型回答 = 模型输出 \- 模型思维链（如有）
* 输出 token 的总长度还受模型的上下文长度限制。


:::
---


**max_completion_tokens** `integer / null` 
> 支持该字段的模型及使用说明见 [文档](https://www.volcengine.com/docs/82379/1449737)。

取值范围：`[1, 65,536]`。
控制模型输出的最大长度（包括模型回答和模型思维链内容长度，单位 token）。
配置了该参数后，可以让模型输出超长内容，**max_tokens ** 默认值失效，模型按需输出内容（回答和思维链），直到达到 **max_completion_tokens ** 值。
不可与 **max_tokens** 字段同时设置。

---


**service_tier** `string / null` `默认值 auto`
控制使用的在线推理模式。取值范围：`fast`、`auto`、`default`。

* `fast`：本次请求优先使用 [在线推理（低延迟）](https://www.volcengine.com/docs/82379/2335857?lang=zh)模式。
   * 推理接入点（**model** 字段指定）有低延迟限流配额，本次请求将会优先使用低延迟限流配额，获得更高的服务等级（延迟、可用性等）。
   * 推理接入点（**model** 字段指定）无低延迟限流配额，或者限流配额已满，降级至**在线推理（常规）** 模式，维持常规的服务等级。
* `auto`：本次请求优先使用 [在线推理（TPM保障包）](https://www.volcengine.com/docs/82379/1510762?lang=zh)模式。
   * 推理接入点（**model** 字段指定） ** ** 有 TPM 保障包额度，本次请求将会优先使用 TPM 保障包额度，获得最高的服务等级（延迟、可用性等）。
   * 推理接入点（**model** 字段指定） ** ** 无 TPM 保障包额度或用超额度，降级至**在线推理（常规）** 模式，维持常规的服务等级。
* `default`：本次请求只使用 [在线推理（常规）](https://www.volcengine.com/docs/82379/2121998?lang=zh)模式。维持常规的服务等级，即使调用的推理接入点有TPM保障包额度 / 低延迟限流额度。


---


**stop** `string / string[] / null` `默认值 null`
模型遇到 stop 字段所指定的字符串时将停止继续生成，这个词语本身不会输出。最多支持 4 个字符串。
> [深度思考能力模型](https://www.volcengine.com/docs/82379/1330310)不支持该字段。

`["你好", "天气"]`

---


**reasoning_effort** `string / null` `默认值 medium`
> 支持该字段的模型、与 **thinking.type** 字段关系见[文档](https://www.volcengine.com/docs/82379/1449737)。

限制思考的工作量。减少思考深度可提升速度，思考花费的 token 更少。
取值范围：`minimal`，`low`，`medium`，`high`。

* `minimal`：关闭思考，直接回答。
* `low`：轻量思考，侧重快速响应。
* `medium`：均衡模式，兼顾速度与深度。
* `high`：深度分析，处理复杂问题。


---


**response_format** `object`  `默认值 {"type": "text"}` `beta阶段`
指定模型回答格式。

回答格式说明

---


文本格式 `object`
模型默认回复文本格式内容。

属性

---


response_format.**type** `string` `必选`
此处应为 `text`。


---


JSON Object 格式 `object`
模型回复内容以JSON对象结构来组织。
> 支持该字段的模型请参见[文档](https://www.volcengine.com/docs/82379/1568221#.5pSv5oyB55qE5qih5Z6L)。
> 该能力尚在 beta 阶段，请谨慎在生产环境使用。


属性

---


response_format.**type ** `string` `必选`
此处应为`json_object`。


---


JSON Schema 格式 `object`  
模型回复内容以JSON对象结构来组织，遵循 **schema ** 字段定义的JSON结构。
> 支持该字段的模型请参见[文档](https://www.volcengine.com/docs/82379/1568221#.5pSv5oyB55qE5qih5Z6L)。
> 该能力尚在 beta 阶段，请谨慎在生产环境使用。


属性

---


response_format.**type ** `string` `必选`
此处应为`json_schema`。

---


response_format.**json_schema** `object` `必选`
JSON结构体的定义。

属性

---


response_format.json_schema.**name** `string` `必选`
用户自定义的JSON结构的名称。

---


response_format.json_schema.**description** `string / null` 
回复用途描述，模型将根据此描述决定如何以该格式回复。

---


response_format.json_schema.**schema** `object` `必选`
回复格式的 JSON 格式定义，以 JSON Schema 对象的形式描述。

---


response_format.json_schema.**strict** `boolean / null` `默认值 false`
是否在生成输出时，启用严格遵循模式。

* `true`：模型将始终严格遵循**schema**字段中定义的格式。
* `false`：模型会尽可能遵循**schema**字段中定义的结构。




---


**frequency_penalty** `float / null` `默认值 0`
取值范围为 [`-2.0`, `2.0`]。
:::warning
`doubao-seed-1.8`、`doubao-seed-2.0`系列模型不支持该字段。
:::
频率惩罚系数。如值为正，根据新 token 在文本中的出现频率对其进行惩罚，从而降低模型逐字重复的可能性。

---


**presence_penalty** `float / null` `默认值 0`
取值范围为 [`-2.0`, `2.0`]。
:::warning
`doubao-seed-1.8`、`doubao-seed-2.0`系列模型不支持该字段。
:::
存在惩罚系数。如果值为正，会根据新 token 到目前为止是否出现在文本中对其进行惩罚，从而增加模型谈论新主题的可能性。

---


**temperature** `float / null` `默认值 1`
取值范围为 [`0`, `2`]。
:::warning
当调用下列模型，字段取值固定为 `1`，手动指定的参数值将被忽略。

* `doubao-seed-2-0-pro-260215`
* `doubao-seed-2-0-lite-260215`

:::
采样温度。控制了生成文本时对每个候选词的概率分布进行平滑的程度。当取值为 0 时模型仅考虑对数概率最大的一个 token。
较高的值（如 0.8）会使输出更加随机，而较低的值（如 0.2）会使输出更加集中确定。
通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

---


**top_p** `float / null` `默认值 0.7`
取值范围为 [`0`, `1`]。
:::warning
当调用下列模型，字段取值固定为 `0.95`，手动指定的参数值将被忽略。

* `doubao-seed-2-0-pro-260215`
* `doubao-seed-2-0-lite-260215`
* `doubao-seed-1-8-251228`

:::
核采样概率阈值。模型会考虑概率质量在 top_p 内的 token 结果。当取值为 0 时模型仅考虑对数概率最大的一个 token。
0.1 意味着只考虑概率质量最高的前 10% 的 token，取值越大生成的随机性越高，取值越低生成的确定性越高。通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

---


**logprobs** `boolean / null` `默认值 false`
> 带深度思考能力模型不支持该字段，深度思考能力模型参见[文档](https://www.volcengine.com/docs/82379/1330310#.5rex5bqm5oCd6ICD6IO95Yqb)。

是否返回输出 tokens 的对数概率。

* `false`：不返回对数概率信息。
* `true`：返回消息内容中每个输出 token 的对数概率。


---


**top_logprobs** `integer / null` `默认值 0`
> 带深度思考能力模型不支持该字段，深度思考能力模型参见[文档](https://www.volcengine.com/docs/82379/1330310#.5rex5bqm5oCd6ICD6IO95Yqb)。

取值范围为 [`0`, `20`]。
指定每个输出 token 位置最有可能返回的 token 数量，每个 token 都有关联的对数概率。仅当 **logprobs为**`true` 时可以设置 **top_logprobs** 参数。

---


**logit_bias** `map / null` `默认值 null`
> 带深度思考能力模型不支持该字段，深度思考能力模型参见[文档](https://www.volcengine.com/docs/82379/1330310#.5rex5bqm5oCd6ICD6IO95Yqb)。

调整指定 token 在模型输出内容中出现的概率，使模型生成的内容更加符合特定的偏好。**logit_bias** 字段接受一个 map 值，其中每个键为词表中的 token ID（使用 tokenization 接口获取），每个值为该 token 的偏差值，取值范围为 [\-100, 100]。
\-1 会减少选择的可能性，1 会增加选择的可能性；\-100 会完全禁止选择该 token，100 会导致仅可选择该 token。该参数的实际效果可能因模型而异。
`{"<Token_ID>": -100}`

---


**tools** `object[] / null` `默认值 null`
待调用工具的列表，模型返回信息中可包含。当您需要让模型返回待调用工具时，需要配置该结构体。支持该字段的模型请参见[文档](https://www.volcengine.com/docs/82379/1330310#.5bel5YW36LCD55So6IO95Yqb)。

属性

---


tools.**type ** `string` `必选`
工具类型，此处应为 `function`。

---


tools.**function ** `object` `必选`
模型返回中可包含待调用的工具。

属性

---


tools.function.**name ** `string` `必选`
调用的函数的名称。

---


tools.function.**description ** `string` 
调用的函数的描述，大模型会使用它来判断是否调用这个工具。

---


tools.function.**parameters ** `object` 
函数请求参数，以 JSON Schema 格式描述。具体格式请参考 [JSON Schema](https://json-schema.org/understanding-json-schema) 文档，格式如下：
```JSON
{
  "type": "object",
  "properties": {
    "参数名": {
      "type": "string | number | boolean | object | array",
      "description": "参数说明"
    }
  },
  "required": ["必填参数"]
}
```

其中，

* 所有字段名大小写敏感。
* **parameters** 须是合规的 JSON Schema 对象。
* 建议用英文字段名，中文置于 **description** 字段中。



---


**parallel_tool_calls** `boolean` `默认值 true`
本次请求，模型返回是否允许包含多个待调用的工具。

* `true`：允许返回多个待调用的工具。
* `false`：允许返回的待调用的工具小于等于1，本取值在 `doubao-seed-1.6` 及之后系列模型生效。


---


**tool_choice** `string / object`
> 仅 `doubao-seed-1.6` 及之后系列模型支持此字段。

本次请求，模型返回信息中是否有待调用的工具。
当没有指定工具时，`none` 是默认值。如果存在工具，则 `auto` 是默认值。

可选类型

---


选择模式 `string`
控制模型返回是否包含待调用的工具。

* `none` ：模型返回信息中不可含有待调用的工具。
* `required` ：模型返回信息中必须含待调用的工具。选择此项时请确认存在适合的工具，以减少模型产生幻觉的情况。
* `auto` ：模型自行判断返回信息是否有待调用的工具。


---


工具调用 `object`
指定待调用工具的范围。模型返回信息中，只允许包含以下模型信息。选择此项时请确认该工具适合用户需求，以减少模型产生幻觉的情况。

属性

---


tool_choice.**type** `string` %%require%%
调用的类型，此处应为 `function`。

---


tool_choice.**function** `object`  %%require%%
调用工具的信息。

属性
tool_choice.function **.name ** `string` %%require%%
待调用工具的名称。



<span id="Qu59cel0"></span>
## 响应参数
> 跳转 [请求参数](#RxN8G2nH)

<span id="fT1TMaZk"></span>
### 非流式调用返回
> 跳转 [流式调用返回](#jp88SeXS)


---


**id** `string`
本次请求的唯一标识。

---


**model** `string`
本次请求实际使用的模型名称和版本。

---


**service_tier** `string`
本次请求的请求使用的模式。

* `scale`：本次请求使用 [在线推理（TPM保障包）](https://www.volcengine.com/docs/82379/1510762?lang=zh)模式。
* `default`：本次请求使用 [在线推理（常规）](https://www.volcengine.com/docs/82379/2121998?lang=zh)模式。
* `fast`：本次请求使用 [在线推理（低延迟）](https://www.volcengine.com/docs/82379/2335857?lang=zh)模式。


---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**object** `string`
固定为 `chat.completion`。

---


**choices** `object[]`
本次请求的模型输出内容。

属性

---


choices.**index ** `integer`
当前元素在 **choices** 列表的索引。

---


choices.**finish_reason ** `string`
模型停止生成 token 的原因。取值范围：

* `stop`：模型输出自然结束，或因命中请求参数 stop 中指定的字段而被截断。
* `length`：模型输出因达到模型输出限制而被截断，有以下原因：
   * 触发`max_tokens`限制（回答内容的长度限制）。
   * 触发`max_completion_tokens`限制（思维链内容+回答内容的长度限制）。
   * 触发`context_window`限制（输入内容+思维链内容+回答内容的长度限制）。
* `content_filter`：模型输出被内容审核拦截。
* `tool_calls`：模型调用了工具。


---


choices.**message ** `object`
模型输出的内容。

属性

---


choices.message.**role ** `string`
内容输出的角色，此处固定为 `assistant`。

---


choices.message.**content ** `string`
模型生成的消息内容。

---


choices.message.**reasoning_content ** `string / null`
模型处理问题的思维链内容。
仅深度推理模型支持返回此字段，深度推理模型请参见[支持模型](https://www.volcengine.com/docs/82379/1449737#5f0f3750)。

---


choices.message.**tool_calls ** `object[] / null`
模型生成的工具调用。

属性

---


choices.message.tool_calls.**id** ** ** `string`
调用的工具的 ID。

---


choices.message.tool_calls.**type ** `string`
工具类型，当前仅支持`function`。

---


choices.message.tool_calls.**function ** `object`
模型调用的函数。

属性

---


choices.message.tool_calls.function.**name ** `string`
模型调用的函数的名称。

---


choices.message.tool_calls.function.**arguments ** `string`
模型生成的用于调用函数的参数，JSON 格式。
模型并不总是生成有效的 JSON，并且可能会虚构出一些您的函数参数规范中未定义的参数。在调用函数之前，请在您的代码中验证这些参数是否有效。




---


choices.**logprobs ** `object / null`
当前内容的对数概率信息。

属性
choices.logprobs.**content ** `object[] / null`
message列表中每个 content 元素中的 token 对数概率信息。

属性

---


choices.logprobs.content.**token ** `string`
当前 token。

---


choices.logprobs.content.**bytes ** `integer[] / null`
当前 token 的 UTF\-8 值，格式为整数列表。当一个字符由多个 token 组成（表情符号或特殊字符等）时可以用于字符的编码和解码。如果 token 没有 UTF\-8 值则为空。

---


choices.logprobs.content.**logprob ** `float`
当前 token 的对数概率。

---


choices.logprobs.content.**top_logprobs ** `object[]`
在当前 token 位置最有可能的标记及其对数概率的列表。在一些情况下，返回的数量可能比请求参数 top_logprobs 指定的数量要少。

**属性**

---


choices.logprobs.content.top_logprobs.**token ** `string`
当前 token。

---


choices.logprobs.content.top_logprobs.**bytes ** `integer[] / null`
当前 token 的 UTF\-8 值，格式为整数列表。当一个字符由多个 token 组成（表情符号或特殊字符等）时可以用于字符的编码和解码。如果 token 没有 UTF\-8 值则为空。

---


choices.logprobs.content.top_logprobs.**logprob ** `float`
当前 token 的对数概率。




---


choices.**moderation_hit_type ** `string/ null`
模型输出文字含有敏感信息时，会返回模型输出文字命中的风险分类标签。
返回值及含义：

* `severe_violation`：模型输出文字涉及严重违规。
* `violence`：模型输出文字涉及激进行为。

注意：当前只有[视觉理解模型](https://www.volcengine.com/docs/82379/1362931#.5pSv5oyB5qih5Z6L)支持返回该字段，且只有在方舟控制台[接入点配置页面](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint/create?customModelId=)或者 [CreateEndpoint](https://www.volcengine.com/docs/82379/1262823) 接口中，将内容护栏方案（ModerationStrategy）设置为基础方案（Basic）时，才会返回风险分类标签。


---


**usage** `object`
本次请求的 token 用量。

属性

---


usage.**total_tokens ** `integer`
本次请求消耗的总 token 数量（输入 + 输出）。

---


usage.**prompt_tokens ** `integer`
输入给模型处理的内容 token 数量。

---


usage.**prompt_tokens_details ** `object`
输入给模型处理的内容 token 数量的细节。

属性

---


usage.prompt_tokens_details.**cached_tokens ** `integer`
缓存输入内容的 token 用量，此处应为 `0`。


---


usage.**completion_tokens ** `integer`
模型输出内容花费的 token。

---


usage.**completion_tokens_details ** `object`
模型输出内容花费的 token 的细节。

属性

---


usage.completion_tokens_details.**reasoning_tokens ** `integer`
输出思维链内容花费的 token 数 。
支持输出思维链的模型请参见[文档](https://www.volcengine.com/docs/82379/1449737#5f0f3750)。



---


&nbsp;
<span id="jp88SeXS"></span>
### 流式调用返回
> 跳转 [非流式调用返回](#fT1TMaZk)


---


**id** `string`
本次请求的唯一标识。

---


**model** `string`
本次请求实际使用的模型名称和版本。

---


**service_tier** `string`
本次请求是否使用了TPM保障包。

* `scale`：本次请求使用 [在线推理（TPM保障包）](https://www.volcengine.com/docs/82379/1510762?lang=zh)模式。
* `default`：本次请求使用 [在线推理（常规）](https://www.volcengine.com/docs/82379/2121998?lang=zh)模式。
* `fast`：本次请求使用 [在线推理（低延迟）](https://www.volcengine.com/docs/82379/2335857?lang=zh)模式。


---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**object** `string`
固定为 `chat.completion.chunk`。

---


**choices** `object[]`
本次请求的模型输出内容。

属性

---


choices.**index ** `integer`
当前元素在 **choices** 列表的索引。

---


choices.**finish_reason ** `string`
模型停止生成 token 的原因。取值范围：

* `stop`：模型输出自然结束，或因命中请求参数 stop 中指定的字段而被截断。
* `length`：模型输出因达到模型输出限制而被截断，有以下原因：
   * 触发`max_tokens`限制（回答内容的长度限制）。
   * 触发`max_completion_tokens`限制（思维链内容+回答内容的长度限制）。
   * 触发`context_window`限制（输入内容+思维链内容+回答内容的长度限制）。
* `content_filter`：模型输出被内容审核拦截。
* `tool_calls`：模型调用了工具。


---


choices.**delta ** `object`
模型输出的增量内容。

属性

---


choices.delta.**role ** `string`
内容输出的角色，此处固定为 `assistant`。

---


choices.delta.**content ** `string`
模型生成的消息内容。

---


choices.delta.**reasoning_content ** `string / null`
思考内容原文。
仅深度推理模型支持返回此字段，深度推理模型请参见[支持模型](https://www.volcengine.com/docs/82379/1449737#5f0f3750)。

---


choices.delta.**tool_calls ** `object[] / null`
模型生成的工具调用。

属性

---


choices.delta.tool_calls.**id ** `string`
调用的工具的 ID。

---


choices.delta.tool_calls.**type ** `string`
工具类型，当前仅支持`function`。

---


choices.delta.tool_calls.**function ** `object`
模型调用的函数。

属性

---


choices.delta.tool_calls.function.**name ** `string`
模型调用的函数的名称。

---


choices.delta.tool_calls.function.**arguments ** `string`
模型生成的用于调用函数的参数，JSON 格式。
模型并不总是生成有效的 JSON，并且可能会虚构出一些您的函数参数规范中未定义的参数。在调用函数之前，请在您的代码中验证这些参数是否有效。




---


choices.**logprobs ** `object / null`
当前内容的对数概率信息。

属性

---


choices.logprobs.**content ** `object[] / null`
message列表中每个 content 元素中的 token 对数概率信息。

属性

---


choices.logprobs.content.**token ** `string`
当前 token。

---


choices.logprobs.content.**bytes ** `integer[] / null`
当前 token 的 UTF\-8 值，格式为整数列表。当一个字符由多个 token 组成（表情符号或特殊字符等）时可以用于字符的编码和解码。如果 token 没有 UTF\-8 值则为空。

---


choices.logprobs.content.**logprob ** `float`
当前 token 的对数概率。

---


choices.logprobs.content.**top_logprobs ** `object[]`
在当前 token 位置最有可能的标记及其对数概率的列表。在一些情况下，返回的数量可能比请求参数 top_logprobs 指定的数量要少。

属性

---


choices.logprobs.content.top_logprobs.**token ** `string`
当前 token。

---


choices.logprobs.content.top_logprobs.**bytes ** `integer[] / null`
当前 token 的 UTF\-8 值，格式为整数列表。当一个字符由多个 token 组成（表情符号或特殊字符等）时可以用于字符的编码和解码。如果 token 没有 UTF\-8 值则为空。

---


choices.logprobs.content.top_logprobs.**logprob ** `float`
当前 token 的对数概率。




---


choices.**moderation_hit_type ** `string/ null`
模型输出文字含有敏感信息时，会返回模型输出文字命中的风险分类标签。
返回值及含义：

* `severe_violation`：模型输出文字涉及严重违规。
* `violence`：模型输出文字涉及激进行为。

注意：当前只有[视觉理解模型](https://www.volcengine.com/docs/82379/1362931#.5pSv5oyB5qih5Z6L)支持返回该字段，且只有在方舟控制台[接入点配置页面](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint/create?customModelId=)或者 [CreateEndpoint](https://www.volcengine.com/docs/82379/1262823) 接口中，将内容护栏方案（ModerationStrategy）设置为基础方案（Basic）时，才会返回风险分类标签。


---


**usage** `object`
本次请求的 token 用量。
流式调用时，默认不统计 token 用量信息，返回值为`null`。
如需统计，需设置 **stream_options.include_usage**为`true`。

属性

---


usage.**total_tokens ** `integer`
本次请求消耗的总 token 数量（输入 + 输出）。

---


usage.**prompt_tokens ** `integer`
输入给模型处理的内容 token 数量。

---


usage.**prompt_tokens_details ** `object`
输入给模型处理的内容 token 数量的细节。

属性

---


usage.prompt_tokens_details.**cached_tokens ** `integer`
缓存输入内容的 token 用量，此处应为 `0`。


---


usage.**completion_tokens ** `integer`
模型输出内容花费的 token。

---


usage.**completion_tokens_details ** `object`
模型输出内容花费的 token 的细节。

属性

---


usage.completion_tokens_details.**reasoning_tokens ** `integer`
输出思维链内容花费的 token 数 。
支持输出思维链的模型请参见[文档](https://www.volcengine.com/docs/82379/1449737#5f0f3750)。




` POST https://ark.cn-beijing.volces.com/api/v3/responses` 
本文介绍 Responses API 创建模型请求时的输入输出参数，供您使用接口时查阅字段含义。

Tips：一键展开折叠，快速检索内容
:::tip
打开页面右上角开关后，**ctrl ** + f 可检索页面内所有内容。
<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_952f1a5ff1c9fc29c4642af62ee3d3ee.png) </span>

:::

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="NxI2ZZeLhf"><RenderMd content={`本接口支持 API Key /Access Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入口" key="gu5yfTMMdz"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Responses API 教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[上下文缓存教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="5Cj9Uxgo"></span>
## Header 参数
Responses API 支持开启数据上报，通过对数据进行统计分析帮助快速排查与定位问题，需要设置的 header 参数见[开启数据上报](https://www.volcengine.com/docs/82379/1544136?lang=zh#d5f5495b)。
<span id="FHypKhIP"></span>
## 请求参数
> 跳转 [响应参数](#Qu59cel0)

<span id="pjuiBZGA"></span>
### 请求体

---


**model** `string` %%require%%
您需要调用的模型的 ID （Model ID），[开通模型服务](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)，并[查询 Model ID](https://www.volcengine.com/docs/82379/1330310) 。支持的模型请参见 [模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh)。
当您有多个应用调用模型服务或更细粒度权限管理，可[通过 Endpoint ID 调用模型](https://www.volcengine.com/docs/82379/1099522)。

---


**input**  `string / array` %%require%%
输入的内容，模型需要处理的输入信息。

信息类型

---


**文本输入 ** `string`
输入给模型的文本类型信息，等同于使用 `user` 角色输入的文本信息。

---


**输入的元素列表** `array`
输入给模型的信息元素，可以包括不同的信息类型。

信息类型

---


**输入的消息** `object`
发送给模型的消息，其中角色用于指示指令遵循的优先级层级。由 `developer` 或 `system` 角色给出的指令优先于 `user` 角色给出的指令。`assistant` 角色的消息通常被认为是模型在先前交互中生成的回复。

属性

---


input.**content ** `string / array`  %%require%%
用于生成回复的文本、图片、视频或文件输入，也可以包含先前助手的回复内容。

消息类型

---


**文本输入 ** `string`
输入给模型的文本。

---


**输入的内容列表 ** `array`
包含一个或多个输入项的列表，每个输入项可包含不同类型的内容。

内容类型

---


**输入模型的文本 ** `object`
输入模型的文本。

属性

---


input.content.**text ** `string` ** ** %%require%%
输入模型的文本。

---


input.content.**type ** `string` ** ** %%require%%
输入项的类型，此处应为`input_text`。

---


input.content.**translation_options ** `object` ** ** 
特定的翻译模型支持该字段，配置翻译场景下的语种等信息。`source_language`和`target_language`取值参见[支持的语言](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-translation)。
> 支持模型为 doubao\-seed\-translation\-250728 。 


---


属性 \>

---



input.content.**translation_options.** source_language `string`
   需要翻译的信息的源语言语种。


---



input.content.**translation_options.** target_language `string` %%require%%
   需要翻译为何目标语言语种。


---


**输入模型的图片** `object`
输入模型的图片。
图片输入支持**file_id、image_url**两个字段，需二选一传入。多模态理解示例见[图片理解](https://www.volcengine.com/docs/82379/1362931?lang=zh)。

属性

---


input.content.**type ** `string` ** ** %%require%%
输入为图片类型，此处应为`input_image`。

---


input.content.**file_id ** `string` ** ** 
文件ID。

* 文件ID是通过[Files API](https://www.volcengine.com/docs/82379/1870405?lang=zh)上传文件后返回的id。
* **file_id**对应的文件类型需要和**type**保持一致，且文件状态需要为**active**。


---


input.content.**image_url ** `string` ** ** 
要发送给模型的图片 URL。可以是完整的 URL，或以 data URL 形式编码的 base64 图片。

---


input.content.**detail ** `string` ** ** 
取值范围：`low`、`high`、`xhigh`。
理解图片的精细度、不同模型默认取值及对应的具体像素区间，参见[控制图片理解的精细度](https://www.volcengine.com/docs/82379/1362931#bf4d9224)。

---


input.content.**image_pixel_limit  ** `object / null` `默认值 null`
输入给模型的图片的像素范围，如不在此范围，图片会被等比例缩放至该范围。
:::warning
图片像素范围需在 [196, 36,000,000]，否则会直接报错。

:::
* 生效优先级：高于 **detail ** 字段，即同时配置 **detail ** 与 **image_pixel_limit ** 字段时，生效 **image_pixel_limit ** 字段配置 **。** 
* 默认生效规则：若未设置**image_pixel_limit**，则使用 **detail ** 配置的值对应的 **min_pixels ** / **max_pixels ** 值。


---


属性 \>

---



input.content.image_pixel_limit.**max_pixels ** `integer`
   传入图片最大像素限制，大于此像素则等比例缩小至 **max_pixels ** 字段取值以下。若未设置，则取值为 **detail ** 配置的值对应的 **max_pixels ** 值。
   * doubao\-seed\-1.8 之前的模型取值范围：(**min_pixels**,  `4014080`]
   * doubao\-seed\-1.8、doubao\-seed\-2.0 模型的取值范围：(**min_pixels**, `9031680`]。


---



input.content.image_pixel_limit.**min_pixels**
   传入图片最小像素限制，小于此像素则等比例放大至 **min_pixels ** 字段取值以上。若未设置，则取值为 **detail ** 配置的值对应的 **min_pixels ** 值。
   * doubao\-seed\-1.8 之前的模型取值范围：[`3136`,  **max_pixels**)
   * doubao\-seed\-1.8、doubao\-seed\-2.0 模型的取值范围：[`1764`,  **max_pixels**)


---


**输入模型的视频** `object`
输入模型的视频。
视频输入支持**file_id、video_url**两个字段，需二选一传入。多模态理解示例见[视频理解](https://www.volcengine.com/docs/82379/1958521?lang=zh#098ef3d4)。

属性

---


input.content.**type ** `string` ** ** %%require%%
输入为视频类型，此处为`input_video`。

---


input.content.**file_id ** `string` ** ** 
文件ID。

* 文件ID是通过[Files API](https://www.volcengine.com/docs/82379/1870405?lang=zh)上传文件后返回的id。
* **file_id**对应的文件类型需要和**type**保持一致，且文件状态需要为**active**。


---


input.content.**video_url ** `string` ** ** 
要发送给模型的视频 URL。可以是完整的 URL，或以 data URL 形式编码的 base64 视频。

---


input.content.**fps** `float`
每秒钟从视频中抽取指定数量的图像，取值范围：`[0.2, 5]`。
如果使用**file_id**参数，**fps**参数则会失效。


---


**输入模型的文件** `object`
输入模型的文件。当前仅支持PDF文件。
文件输入支持**file_id、file_data、file_url**三个字段，需三选一传入。多模态理解示例见[文档理解](https://www.volcengine.com/docs/82379/1958521?lang=zh#18a762a5)。

属性

---


input.content.**type ** `string` ** ** %%require%%
输入为文件类型，此处为`input_file`。

---


input.content.**file_id ** `string` ** ** 
文件ID。

* 文件ID是通过[Files API](https://www.volcengine.com/docs/82379/1870405?lang=zh)上传文件后返回的id。
* **file_id**对应的文件类型需要和**type**保持一致，且文件状态需要为**active**。


---


input.content.**file_data ** `string` ** ** 
文件内容的Base64编码。单个文件大小要求不超过50 MB。

---


input.content.**filename ** `string`
文件名。当使用**file_data**时该参数必填。

---


input.content.**file_url ** `string`
文件的可访问URL。对应文件的大小要求不超过50 MB。







---


input.**role ** `string` %%require%%
输入消息的角色，可以是 `user`，`system` ，`assistant`或 `developer`。

---


input.**type ** `string`
消息输入的类型，此处应为`message`。

---


input.**partial ** `boolean`
模型续写模式。
在 **input** 列表里设置最后一条消息的 **role** 为`assistant`，并设置 **partial** 为 `true`开启续写模式，模型会基于 **content** 内容进行续写。在续写模式下，**partial** 为必填项，具体使用见[文档](https://www.volcengine.com/docs/82379/1958520?lang=zh#a1384090)。


---


**上下文元素 ** `object`
表示模型生成回复时需参考的上下文内容。该项可以包含文本、图片和视频输入，以及先前助手的回复和工具调用的输出。

属性

---


**输入的信息**`object`
历史请求中，发给模型的信息。

属性

---


input.**content ** `array` %%require%%
与 **输入的信息 ** 中 `content` 字段的结构完全一致。

---


input.**role ** `string` %%require%%
输入消息的角色，可选值： `system`，`user` 或 `developer`。

---


input.**type ** `string`
消息输入的类型，此处应为`message`。

---


input.**status ** `string` 
项目状态，可选值：`in_progress`，`completed` 或 `incomplete`。


---


**工具函数信息** `object`
模型调用工具函数的信息

属性

---


input.**arguments ** `string` %%require%%
要传递给函数的参数的 JSON 字符串。

---


input.**call_id ** `string` %%require%%
模型生成的函数工具调用的唯一ID。

---


input.**name ** `string` %%require%%
要运行的函数的名称。

---


input.**type ** `string` %%require%%
工具调用的类型，始终为 `function_call`。

---


input.**status ** `string`
该项的状态。


---


**工具返回的信息 ** `object`
调用工具后，工具返回的信息

属性

---


input.**call_id** `string` %%require%%
模型生成的函数工具调用的唯一 ID。

---


input.**output ** `string` %%require%%
调用工具后，工具输出的结果。

---


input.**type ** `string` %%require%%
工具调用的类型，始终为 `function_call_output`。

---


input.**status ** `string`
该项的状态。



---


**模型思维链信息** `object`
在模型生成响应时使用的思维链信息。如果需要手动管理，需要设置该字段，以便在后续的对话中进行管理。
> 仅模型 `doubao-seed-1.8`、`deepseek-v3.2`、`doubao-seed-2.0`支持设置思维链信息。

:::tip
推荐在 Responses API 中使用 previous_response_id，API 将自动保存历史轮次的思考内容，并在多轮交互中回传给模型。

:::
属性

---


input.**id** `string`
思维链信息的唯一标识。

---


input.**type** `string`
输入对象的类型，此处应为 `reasoning`。

---


input.**summary** `array`
思维链内容。

属性

---


input.summary.**text** `string`
思维链内容的文本部分。

---


input.summary.**type** `string`
对象的类型，此处应为`summary_text`。





---


**instructions** `string / null` 
在模型上下文中插入系统消息或者开发者作为第一条指令。当与 **previous_response_id** 一起使用时，前一个回复中的指令不会被继承到下一个回复中。这样可以方便地在新的回复中替换系统（或开发者）消息。
不可与缓存能力一起使用。配置了**instructions** 字段后，本轮请求无法写入缓存和使用缓存，表现为：

* **caching** 字段配置为 `{"type":"enabled"}` 时报错。
* 传入带缓存的 **previous_response_id ** 时，缓存输入（**cached_tokens**）为0。


---


**previous_response_id** `string / null` 
上一个模型回复的唯一标识符。使用该标识符可以实现多轮对话。
:::tip

* 在请求中传入 `previous_response_id`，会引入上一轮请求的输入和回答内容，本次请求的输入tokens 会相应增加。工作原理可参见[多轮对话场景](https://www.volcengine.com/docs/82379/2123288?lang=zh#41d0a095)。
* 在多轮连续对话中，建议在每次请求之间加入约 100 毫秒的延迟，否则可能会导致调用失败。


:::
---


**expire_at ** `integer` `默认值：创建时刻+259200 `
取值范围：`(创建时刻, 创建时刻+604800]`，即最多保留7天。
设置存储的过期时刻，需传入 UTC Unix 时间戳（单位：秒），对 **store**（上下文存储） 和 **caching**（上下文缓存） 都生效。详细配置及示例代码说明请参见[文档](https://www.volcengine.com/docs/82379/1602228?lang=zh#0387e087)。
注意：缓存存储时间计费，`过期时刻-创建时刻` ，不满 1 小时按 1 小时计算。

---


**max_output_tokens** `integer / null` 
模型输出最大 token 数，包含模型回答和思维链内容。

---


**thinking** `object` `默认值：取决于调用的模型 `
控制模型是否开启深度思考模式。默认开启深度思考模式，可以手动关闭。

属性

---


thinking.**type ** `string`  %%require%%
取值范围：`enabled`， `disabled`，`auto`。

* `enabled`：开启思考模式，模型一定先思考后回答。
* `disabled`：关闭思考模式，模型直接回答问题，不会进行思考。
* `auto`：自动思考模式，模型根据问题自主判断是否需要思考，简单题目直接回答。


---


**reasoning** `object` `默认值 {"effort": "medium"}`
限制深度思考的工作量。减少深度思考工作量可使响应速度更快，并且深度思考的 token 用量更小。

属性

---


reasoning.effort `string`
> 支持该字段的模型、与 **thinking.type** 字段关系见[文档](https://www.volcengine.com/docs/82379/1956279?lang=zh#dc4c1547)。

取值范围：`minimal`，`low`，`medium`，`high`。

* `minimal`：关闭思考，直接回答。
* `low`：轻量思考，侧重快速响应。
* `medium`：均衡模式，兼顾速度与深度。
* `high`：深度分析，处理复杂问题。


---


**caching ** `object` `默认值 {"type": "disabled"}`
是否开启缓存，阅读[文档](https://www.volcengine.com/docs/82379/1602228)，了解缓存的具体使用方式。
不可与 **instructions ** 字段、**tools**（除自定义函数 Function Calling 外）字段一起使用。

属性

---


caching.**type ** `string`  %%require%%
取值范围：`enabled`， `disabled`。

* `enabled`：开启缓存。
* `disabled`：关闭缓存。


---


caching.**prefix ** `boolean` `默认值 false`

* true：仅创建公共前缀缓存，模型不回复。
* false：不创建公共前缀缓存。


---


**store** `boolean / null` `默认值 true`
是否储存生成的模型响应，以便后续通过 API 检索。详细上下文管理使用说明，请见[文档](https://www.volcengine.com/docs/82379/1958520?lang=zh#7c5190d3)。

* `false`：不储存，对话内容不能被后续的 API 检索到。
* `true`：储存当前模型响应，对话内容能被后续的 API 检索到。


---


**stream** `boolean / null` `默认值 false`
响应内容是否流式返回。流式输出示例见[文档](https://www.volcengine.com/docs/82379/1958520?lang=zh#641bafe0)。

* `false`：模型生成完所有内容后一次性返回结果。
* `true`：按 SSE 协议逐块返回模型生成内容，并以一条 `data: [DONE]`消息结束。


---


**temperature** `float / null` `默认值 1`
取值范围：` [0, 2]`。
:::warning
当调用下列模型，字段取值固定为 `1`，手动指定的参数值将被忽略。

* `doubao-seed-2-0-pro-260215`
* `doubao-seed-2-0-lite-260215`

:::
采样温度。控制了生成文本时对每个候选词的概率分布进行平滑的程度。当取值为 0 时模型仅考虑对数概率最大的一个 token。
较高的值（如 0.8）会使输出更加随机，而较低的值（如 0.2）会使输出更加集中确定。
通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

---


**top_p** `float / null` `默认值 0.7`
取值范围：` [0, 1]`。
:::warning
当调用下列模型，字段取值固定为 `0.95`，手动指定的参数值将被忽略。

* `doubao-seed-2-0-pro-260215`
* `doubao-seed-2-0-lite-260215`
* `doubao-seed-1-8-251228`

:::
核采样概率阈值。模型会考虑概率质量在 top_p 内的 token 结果。当取值为 0 时模型仅考虑对数概率最大的一个 token。
 0.1 意味着只考虑概率质量最高的前 10% 的 token，取值越大生成的随机性越高，取值越低生成的确定性越高。通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

---


**text** `object`
模型文本输出的格式定义，可以是自然语言，也可以是结构化的 JSON 数据。详情请看[结构化输出](https://www.volcengine.com/docs/82379/1568221)。

属性

---


text.**format ** `object` `默认值 { "type": "text" }`
指定模型文本输出的格式。

属性

---


**文本格式 ** `object`
响应格式为自然语言。

属性
text.format.**type ** `string` %%require%%
回复格式的类型，此处应为 `text`。


---


**JSON Object ** `object` 
响应格式为 JSON 对象。结构化输出示例，见[文档](https://www.volcengine.com/docs/82379/1585128#.57uT5p6E5YyW6L6T5Ye6)。
> 该能力尚在 beta 阶段，请谨慎在生产环境使用。


属性

---


text.format.**type ** `string` %%require%%
回复格式的类型，此处应为 `json_object`。


---


**JSON Schema  ** `object` 
响应格式为 JSON 对象，遵循schema字段定义的 JSON结构。结构化输出示例，见[文档](https://www.volcengine.com/docs/82379/1585128#.anNvbi1zY2hlbWHovpPlh7rmoLzlvI8=)。
> 该能力尚在 beta 阶段，请谨慎在生产环境使用。


属性

---


text.format.**type ** `string` %%require%%
回复格式的类型，此处应为 `json_schema`。

---


text.format.**name ** `string` %%require%%
用户自定义的JSON结构的名称。

---


text.format.**schema ** `object` %%require%%
回复格式的JSON格式定义，以JSON Schema对象的形式描述。

---


text.format.**description** `string / null` 
回复用途描述，模型将根据此描述决定如何以该格式回复。

---


text.format.**strict** `boolean / null`  `默认值 false`
是否在生成输出时，启用严格遵循模式。

* true：模型将始终遵循schema字段中定义的格式。
* false：模型将尽可能遵循schema字段中定义的结构。



**tools** `array`
模型可以调用的工具，当您需要让模型调用工具时，需要配置该结构体。

工具类型

---


当前支持多种调用方式，包括

* 内置工具（Built\-in tools）：由方舟提供的预置工具，用以扩展模型内容，如豆包助手、联网搜索工具、图像处理工具、私域知识库搜索工具等。
* MCP工具：通过自定义 MCP 服务器与第三方系统集成。
* 自定义工具（Function Calling）：您自定义的函数，使模型能够使用强类型参数和输出调用您自己的代码，使用示例见 [文档](https://www.volcengine.com/docs/82379/1958524?lang=zh) 。


豆包助手

---


使用豆包助手，快速集成豆包app同款AI能力。详情请参考 [豆包助手文档](https://www.volcengine.com/docs/82379/1978533?lang=zh)。
> 注意：使用前需开通“[豆包助手](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)”功能。


---


tools.**type ** `string` `必选`
工具类型，此处填写工具名称，应为`doubao_app`。

---


tools.**feature** ** ** `object` 
豆包助手子功能。

tools.feature.**chat ** `object`
日常沟通功能，豆包同款自由对话，默认关闭。

tools.feature.chat.**type ** `string` `默认值disabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。


tools.feature.chat.**role_description ** `string` `默认值：你的名字是豆包,有很强的专业性。`
使用豆包助手时修改角色设定。
此字段与system prompt、instructions 互斥。



tools.feature.**deep_chat ** `object`
深度沟通功能，豆包同款深度思考对话，默认关闭。

tools.feature.deep_chat.**type ** `string` `默认值disabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。


tools.feature.deep_chat.**role_description ** `string` `默认值：你的名字是豆包,有很强的专业性。`
使用豆包助手时修改角色设定。
此字段与system prompt、instructions 互斥。




tools.feature.**ai_search ** `object`
联网搜索功能，豆包同款AI搜索能力，默认关闭。

tools.feature.ai_search.**type ** `string` `默认值 disabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。


tools.feature.ai_search.**role_description ** `string` `默认值：你的名字是豆包,有很强的专业性。`
使用豆包助手时修改角色设定。
此字段与system prompt、instructions 互斥。



tools.feature.**reasoning_search ** `object`
边想边搜功能，豆包同款结合思考过程的智能搜索能力，默认关闭。

tools.feature.reasoning_search.**type ** `string` `默认值 disabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。


tools.feature.reasoning_search.**role_description ** `string` `默认值：你的名字是豆包,有很强的专业性。`
使用豆包助手时修改角色设定。
此字段与system prompt、instructions 互斥。



---


tools.**user_location ** `object` `默认值{"type": "approximate"}`
用户地理位置，用于优化对话与搜索结果，包含 type、country、city、region 字段。示例如下：
```JSON
"user_location":{
     "type":"approximate",
     "country": "中国",
     "region":"浙江",
     "city":"杭州"
}
```

> 注意：填写 type 后，country、city、region 中 至少1个字段有有效值。


函数调用

---


tools.**type ** `string` `必选`
工具类型，此处应为 `function`。

---


tools.**name ** `string` %%require%%
调用的函数的名称。

---


tools.**description ** `string`
调用函数的描述，大模型会用它来判断是否调用这个函数。

---


tools.**parameters ** `object` %%require%%
函数请求参数，以 JSON Schema 格式描述。具体格式请参考 [JSON Schema](https://json-schema.org/understanding-json-schema) 文档，格式如下：
```JSON
{
  "type": "object",
  "properties": {
    "参数名": {
      "type": "string | number | boolean | object | array",
      "description": "参数说明"
    }
  },
  "required": ["必填参数"]
}
```

其中，

* 所有字段名大小写敏感。
* **parameters** 须是合规的 JSON Schema 对象。
* 建议用英文字段名，中文置于 **description** 字段中。


---


tools.**strict** ** ** `boolean` %%require%%`默认值 true`
是否强制执行严格的参数验证。默认为`true`。


联网搜索工具
在互联网上搜索与该提示相关的资源，详情请参考 [Web Search 基础联网搜索](https://www.volcengine.com/docs/82379/1756990)。
> 注意：使用前需开通“[联网内容插件](https://console.volcengine.com/ark/region:ark+cn-beijing/components?action=%7B%7D)”组件。


---


tools.**type ** `string` `必选`
工具类型，此处填写工具名称，应为`web_search`。

---


tools.**sources ** `string[]` 
选择联网搜索的附加内容源。可选头条图文、抖音百科、墨迹天气。

* `toutiao` ：联网搜索的附加头条图文内容源。
* `douyin` ：联网搜索的附加抖音百科内容源。
* `moji` ：联网搜索的附加墨迹天气内容源。


---


tools.**limit ** `integer` `默认值 10`
取值范围：` [1, 50]`。
单轮搜索最大召回条数。
> 说明：影响输入规模与性能，单次搜索最多返回20条结果（单轮可能有多次搜索），默认召回10条。


---


tools.**user_location ** `object` `默认值{"type": "approximate"}`
用户地理位置，用于天气查询等场景，包含 type、country、city、region 字段。示例如下：
```JSON
"user_location":{
     "type":"approximate",
     "country": "中国",
     "region":"浙江",
     "city":"杭州"
}
```

> 注意：填写 type 后，country、city、region 中 至少1个字段有有效值。


---


tools.**max_keyword ** `integer`  
取值范围： `[1, 50]`。
工具一轮使用，最大并行搜索关键词的数量。
> 举例：如模型判断需要搜索关键词：“大模型最新进展”，“2025年科技创新”，“火山方舟进展”。
> 此时max_keyword = 1，则实际仅搜索第一个关键词“大模型最新进展”。


图像处理工具
使用画点、画线、旋转、缩放、框选/裁剪关键区域等基础图像处理工具，详情请参考 [Image Process 图像处理工具](https://www.volcengine.com/docs/82379/1798161)。

---


tools.**type ** `string` `必选`
工具类型，此处填写工具名称，应为`image_process`。

---


tools.**point ** `object`
画点/连线功能开关，控制是否启用点绘制与连线功能。

属性
tools.point.**type ** `string`  `默认值 enabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。


---


tools.**grounding ** `object`
框选/裁剪功能开关，控制是否启用关键区域框选或裁剪。

属性
tools.grounding.**type ** `string`  `默认值 enabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。


---


tools.**zoom ** `object`
缩放功能开关，控制是否启用全图/指定区域缩放（支持0.5\-2.0倍）。

属性
tools.zoom.**type ** `string`  `默认值 enabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。

tools.**rotate ** `object`
旋转功能开关，控制是否启用顺时针旋转（支持0\-359度）。

属性
tools.rotate.**type ** `string`  `默认值 enabled`
取值范围：`enabled`， `disabled`。

* `enabled`：开启此功能。
* `disabled`：关闭此功能。



MCP 工具

---


tools.**type ** `string` `必选`
工具类型，此处填写工具名称，应为`mcp`。

---


tools.**server_label ** `string` `必选`
MCP Server标签，建议设定与工具用途/Server名称一致。

---


tools.**server_url** `string` `必选`
MCP Server访问地址。

---


tools.**headers** `object`
要发送至 MCP 服务器的可选 HTTP 请求头，用于身份验证或其他用途。包含：

* `Authorization` 鉴权信息（不存储）。
* 自定义key\-value。


---


tools.**require_approval** `object/string`  `默认值 always`
指定哪些 MCP 服务器工具需要授权。

属性
**工具批准设置** `string` 
取值范围：

* `always`：所有工具需用户确认后调用。
* `never`：所有工具无需确认，直接调用（可能存在安全风险）。


---


**工具批准筛选** `object` 
指定 MCP 服务器的哪些工具需要审批。可以是 always、never或与需要审批的工具关联的过滤器对象。

属性
tools.require_approval.**always ** `object`
指定哪些工具需要用户确认批准。

属性
tools.require_approval.always **.tool_names ** `array`
需要用户确认批准的工具名称列表。


---


tools.require_approval.**never ** `object`
指定哪些工具不需要用户确认批准使用。

属性
tools.require_approval.never **.tool_names ** `array`
不需要用户确认批准的工具名称列表。




---


tools.**allowed_tools** `array/object`
工具加载范围，默认包含当前MCP Server所有工具。

**属性**
**工具加载范围 ** `array`
允许加载的工具名称的字符串数组。

---


**工具筛选** `object`
指定 MCP 服务器的哪些工具允许使用。

属性
tools.allowed_tools.**tool_names ** `array`
允许的工具名称列表。




私域知识库搜索工具
tools.**type ** `string` `必选`
工具类型，此处填写工具名称，应为`knowledge_search`。

---


tools.**knowledge_resource_id**  ** ** `string` `必选`
填写需使用的私域知识库ID。

---


tools.**limit ** `integer` `默认值 10`
取值范围：` [1, 200]`。
最大可被采用的搜索结果。

---


tools.**max_keyword ** `integer`  
取值范围： `[1, 50]`。
工具一轮使用，最大并行搜索关键词的数量。
> 举例：如模型判断需要搜索关键词：“大模型最新进展”，“2025年科技创新”，“火山方舟进展”。
> 此时max_keyword = 1，则实际仅搜索第一个关键词“大模型最新进展”。


---


tools.**doc_filters**  ** ** `object`
设置文档字段级别的检索过滤条件，确保只在符合条件的文档中检索。

* 支持用作过滤条件的文档字段包括：
   * 系统字段：
      * `doc_id`（仅适用于手动创建的知识库）
      * `_sys_auto_doc_id`（适用于手动创建的知识库和 API 创建的知识库）
   * 自定义字段：
      * 已为知识库文档添加的**文档标签（** 对应知识库 `index_config` 的 `fields` 字段中的 `field`）
* 支持单一条件过滤和多条件组合过滤（支持`And`和`Or`逻辑运算）。详细使用方式和支持字段参见 [filter 表达式](https://www.volcengine.com/docs/84313/1419289#filter-%E8%A1%A8%E8%BE%BE%E5%BC%8F)。

:::tip
若自定义字段的类型为`Boolean`，则它的默认取值范围是 `True`/`False`，但大小写规则有所不同：在 cURL 中必须写作 `true`/`false`，在 Python 中必须写作 `True`/`False`。
:::
单一条件过滤示例（在所给的 doc_id 范围内检索）：
```JSON
"doc_filter": {
    "op": "must", // Query scope operators: must/must_not/range/range_out
    "field": "doc_id",
    "conds": [
        "_sys_auto_gen_doc_id-********01",
        "_sys_auto_gen_doc_id-********02",
        "_sys_auto_gen_doc_id-********03"
    ]
}
```

多条件组合过滤示例（在所给的自定义地域和 doc_id 范围内检索）：
```JSON
"doc_filter": {
    "op": "and", // Logical operators: and/or
    "conds": [   // Condition list. At least one condition is required.
        {
            "op": "must",
            "field": "region",
            "conds": [
                "cn",
                "sg"
            ]
        },
        {
            "op": "must",
            "field": "doc_id",
            "conds": [
                "_sys_auto_gen_doc_id-********01",
                "_sys_auto_gen_doc_id-********02",
                "_sys_auto_gen_doc_id-********03"
            ]
        }
    ]
}
```


---


tools.**description**  ** ** `string`
私域知识库的描述信息。

---


tools.**dense_weight**  ** ** `float`  `默认值 0.5`
取值范围：` [0.2, 1]`。
稠密向量的权重。

* 1 表示纯稠密检索 ，趋向于 0 表示纯字面检索。
* 只有在请求的知识库使用的是混合检索时有效，即索引算法为 hnsw_hybrid。


---


tools.**ranking_options**  ** ** `object` 
检索后处理选项。可参考 [知识库API文档](https://www.volcengine.com/docs/84313/1350012) **post_processing** 字段。

属性
tools.ranking_options.**rerank_switch ** `bool` `默认值 false`
是否自动对检索结果做 rerank。
若设置为true，则会自动请求 rerank 模型排序。

---


tools.ranking_options.**retrieve_count ** `integer` `默认值 25`
进入重排的切片数量。此项只有在 **rerank_switch** 为 **true** 时生效。
注意：retrieve_count 需要大于等于 limit，否则会抛出错误。

---


tools.ranking_options.**get_attachment_link ** `bool` `默认值 false`
是否获取切片中图片的临时下载链接。

---


tools.ranking_options.**chunk_diffusion_count ** `integer` `默认值 0`
取值范围 `[0, 5]`
检索阶段返回命中切片的上下几片邻近切片。默认为 0，表示不进行 chunk diffusion。

---


tools.ranking_options.**chunk_group ** `bool` `默认值 false`
文本聚合。
默认不聚合，对于非结构化文件，考虑到原始文档内容语序对大模型的理解，可开启文本聚合。开启后，会根据文档及文档顺序，对切片进行重新聚合排序返回。

---


tools.ranking_options.**rerank_model ** `string`   `默认值 "base-multilingual-rerank" `
rerank 模型选择。仅在 **rerank_switch ** 为 `True` 的时候生效。
可选模型： 

* （推荐）"`base-multilingual-rerank`"：速度快、长文本、支持70+种语言。
* "`m3-v2-rerank`"：常规文本、支持100+种语言。


---


tools.ranking_options.**rerank_only_chunk ** `bool` `默认值 false`
是否仅根据 chunk 内容计算重排分数。可选值： 

* `True`：只根据 chunk 内容计算分 
* `False`：根据 chunk title + 内容 一起计算排序分



**tool_choice** `string / object`
> 仅 Doubao Seed 1.8 和 Doubao Seed 2.0 系列模型支持此字段。

本次请求，模型返回信息中是否有待调用的工具。
当没有指定工具时，`none` 是默认值。如果存在工具，则 `auto` 是默认值。

可选类型

---


**工具选择模式** `string`
控制模型返回是否包含待调用的工具。

* `none` ：模型返回信息中不可含有待调用的工具。
* `required` ：模型返回信息中必须含待调用的工具。选择此项时请确认存在适合的工具，以减少模型产生幻觉的情况。
* `auto` ：模型自行判断返回信息是否有待调用的工具。


---


**工具调用** `object`
指定待调用工具的范围。模型返回信息中，只允许包含以下模型信息。选择此项时请确认该工具适合用户需求，以减少模型产生幻觉的情况。

属性

---


tool_choice.**type** `string` %%require%%
调用的类型。

* 如果为自定义Function此处应为 `function`，此时 tool_choice.**name** 字段为必选。
* 如果为内置工具，此处填写工具名称，请参考 [Responses API 内置工具](https://www.volcengine.com/docs/82379/1756989)。


---


tool_choice.**name** `string` 
待调用工具的名称。
如果 tool_choice.**type ** 为 `function`，此项为必选。


**max_tool_calls  ** `integer`  
取值范围： `[1, 10]`。
最大工具调用轮次（一轮里不限制次数）。在工具调用达到此限制次数后，提示模型停止更多工具调用并进行回答。
注意：该参数为尽力而为（best effort）机制，不保证成功，最终调用次数会受模型推理效果、工具返回结果有效性等因素影响。

> * 豆包助手不支持此参数。
> * Web Search 基础联网搜索工具的默认值 `3`。
> * Image Process 图像处理工具的默认值 `10`，不支持修改。
> * Knowledge Search 私域知识库搜索工具的默认值为`3`。

**context_management  ** `object`  
上下文管理策略，帮助模型有效利用上下文窗口。

属性

---


context_management **.edits** ** ** `array`
支持的上下文编辑策略，用于管理上下文中思考块和工具调用内容。

策略类型

---


**思考块清除 ** `object`
在开启思考时管理思维链内容。

属性

---


context_management.edits.**type ** `string`
上下文编辑策略类型，此处应为`clear_thinking`。

---


context_management.edits.**keep ** `object/string`
思维链保留策略。

类型

---


**保留最近 N 轮思维链** `object`

属性
context_management.edits.keep.**type ** `string`
思维链保留策略类型，此处应为`thinking_turns`。

---


context_management.edits.keep.**value ** `integer` `默认值 1`
保留最近 N 轮的思维链。


---


**保留所有思维链** `string`
保留所有思维链，此处应为 `all`。



---


**工具调用内容清除** `object`
在对话上下文增长超过配置的阈值时清除工具调用内容。

属性

---


context_management.edits.**type ** `string`
上下文编辑策略类型，此处应为`clear_tool_uses`。

---


context_management.edits.**keep ** `object`
工具调用内容保留策略。

属性

---


context_management.edits.keep.**type ** `string`
工具调用内容保留策略类型，此处应为`tool_uses`。

---


context_management.edits.keep.**value ** `integer` `默认值 3 `
保留最近 N 轮工具调用内容。


---


context_management.edits.**exclude_tools ** `array`
不会被清除的工具名称列表，用于保留重要上下文。

---


context_management.edits.**clear_tool_input ** `boolean` `默认值 false`
是否清除工具调用参数。

---


context_management.edits.**trigger ** `object`
触发工具调用内容清除策略的阈值。

属性

---


context_management.edits.trigger.**type ** `string`
触发工具调用内容清除策略类型，此处应为`tool_uses`。

---


context_management.edits.trigger.**value ** `integer` 
工具调用达到 N 轮时触发清除策略。




<span id="Qu59cel0"></span>
## 响应参数
> 跳转 [请求参数](#RxN8G2nH)

<span id="fT1TMaZk"></span>
### 非流式调用返回
返回一个 [response object](https://www.volcengine.com/docs/82379/1783703)。
<span id="V8HaFivd"></span>
### 流式调用返回
服务器会在生成 Response 的过程中，通过 Server\-Sent Events（SSE）实时向客户端推送事件。具体事件介绍请参见 [流式响应](https://www.volcengine.com/docs/82379/1599499)。
&nbsp;


`GET https://ark.cn-beijing.volces.com/api/v3/responses/{response_id}`
通过 response id 获取模型响应。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="TplMgGZW"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入门" key="0mqVc7bL"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Responses API 教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[上下文缓存教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="y2YbjAY1"></span>
## 请求参数 
<span id="LdlwS6Xo"></span>
### 路径参数

---


response_id `string` <span data-label="purple">必选</span>
待检索的响应 id。
<span id="PRhm2La2"></span>
## 响应参数

* 如果您调用的 response 响应已完成，模型会返回对应的 [response object](https://www.volcengine.com/docs/82379/1783703)。
* 如果您调用的 response 响应未完成，模型会返回错误码。

`GET https://ark.cn-beijing.volces.com/api/v3/responses/{response_id}/input_items?after={after}&before={before}&limit={limit}&order={order}&include[]={include}`
获取某次模型响应对应的全部上下文信息。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="MZpb2X9j"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入门" key="WQMQbZJC"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Responses API 教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[上下文缓存教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="ckyfSamB"></span>
## 请求参数 
> 跳转 [响应参数](#92QfuL4F)

<span id="cALajdS1"></span>
### 路径参数

---


**response_id** `string` %%require%%
待检索上下文元素所对应的响应 id。
<span id="92QfuL4F"></span>
### 
<span id="92QfuL4F"></span>
### 查询参数
> 在 URL String 中传入。


---


**after** `string/ null`
返回该 ID 之后的输入项。

---


**before** `string/ null`
返回该 ID 之前的输入项。

---


**include[] ** `array/ null`
用于指定在响应中要额外包含的字段。部分接口默认返回基础字段，通过 include 可让服务端补充返回更多信息。

属性
**message.input_image.image_url**
包含输入消息中的图像 URL。

* 图像为 url 时，返回url。
* 图像为 base64 编码时，返回 base64 编码信息。




---


**limit** `integer` `默认值：20`
控制单次返回的最大项目数。
取值范围： 1 ~ 100。

---


**order** `string` `默认值：desc`
控制输入项的排序方式。

*  asc：按照正序排列。
* desc：按照倒序排列。

<span id="92QfuL4F"></span>
## 响应参数
> 跳转 [请求参数](#ckyfSamB)

返回本次响应对应的所有上下文元素。
**object** `string`
固定为`list`。

---


**data** `object[] / null`
上下文元素列表，与 [创建模型请求](https://www.volcengine.com/docs/82379/1569618) 时的 **input（** **输入的元素列表）** 字段结构完全一致。
如果请求中引用了 previous_response_id，服务器也会返回previous_response 包含的上下文。

---


**first_id** `string`
列表中第一条数据的 ID。

---


**has_more** `boolean`
标识是否还有更多数据未返回。

* true：存在未返回的数据。
* false：已返回全部数据。


---


**last_id** `string`
列表中最后一条数据的 ID。

`DELETE https://ark.cn-beijing.volces.com/api/v3/responses/{response_id}`
本文介绍如何删除指定 ID 的模型请求。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="Ptp9ccIa"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入门" key="IHExglzX"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Responses API 教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[上下文缓存教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="rABtNeWs"></span>
## 请求参数
<span id="vZ8meUIu"></span>
### 路径参数

---


**response_id** `string` %%require%%
待删除请求的id。
&nbsp;
<span id="11E4X5If"></span>
## 响应参数

---


**id** `string`
待删除请求的id。

---


**object** `string`
固定为 `response`。

---


**deleted** `boolean`
取值范围：

* `true`：删除成功。
* `false`：未删除成功。

[创建模型请求](https://www.volcengine.com/docs/82379/1569618) 或 [获取模型响应](https://www.volcengine.com/docs/82379/1783709) 后，模型会返回一个 response 对象。本文为您介绍 response 对象包含的详细参数。

Tips：一键展开折叠，快速检索内容
:::tip
打开页面右上角开关后，**ctrl ** + f 可检索页面内所有内容。
<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_952f1a5ff1c9fc29c4642af62ee3d3ee.png) </span>

:::
:::tip
获取模型响应时，模型返回的 response 对象不包含思维链内容。

:::
---


**created_at** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**error** `object / null`
模型未能生成响应时返回的错误对象。

* code：相应的错误码。
* message：错误描述。


---


**id** `string`
本次请求的唯一标识。

---


**incomplete_details** `object / null`
响应未能完成的细节。
`reason`：响应未能完成的原因。

---


**instructions** `string / null`
在模型上下文中插入一条系统（或开发者）消息，作为首项。
当与 `previous_response_id` 一起使用时，前一响应中的指令不会延续到下一响应。

---


**max_output_tokens** `integer / null`
模型输出最大 token 数，包含模型回答和思维链内容。

---


**model** `string`
本次请求实际使用的模型名称和版本。

---


**object**`string`
固定为`response`。

---


**output** `array`
模型的输出消息列表，包含模型响应本次请求生成的回答、思维链、工具调用。

属性

---


**模型回答** `object`
模型回答，不包含思维链。

属性

---


output.**content ** `array` 
输出消息的内容。

属性

---


**文本回答** `object`
模型回答的文本消息。

属性

---


output.content.**text ** `string` 
模型回答的文本内容。

---


output.content.**type ** `string` 
模型回答的类型，固定为`output_text`。



---


output.**role ** `string` 
输出信息的角色，固定为`assistant`。

---


output.**status ** `string`
输出消息的状态。

---


output.**id ** `string`
此回答的唯一标识。

---


output.**type ** `string` 
输出消息的类型，此处应为`message`。

---


output.**partial ** `boolean` 
模型开启续写模式时会返回该字段，此处应为`true`。


---


**模型思维链**
本次请求，当触发深度思考时，模型会返回问题拆解的思维链内容。

属性

---


output.**summary ** `array` ** ** 
思考内容原文。自`Doubao-Seed-2.0-Pro/260415`版本起，该字段用于返回思考内容摘要。

属性

---


output.summary.**text ** `string` 
思维链内容的文本部分。
:::warning
针对长文本生成、深度推理等耗时场景，建议适当调大首 Token 超时时间（TTFT）与逐 Token 生成超时时间（TPOT），避免请求因超时而中断。

:::
---


output.summary.**type ** `string` 
对象的类型，此处应为 `summary_text`。


---


output.**content ** `array` ** ** 
思考内容原文。

属性
output.content.**text ** `string` 
思维链内容的文本部分。

---


output.content.**type ** `string` 
对象的类型，此处应为`reasoning_text`。


---


output.**type ** `string` ** ** 
本输出对象的类型，此处应为 `reasoning`。

---


output.**status ** `string`
本次思维链内容返回的状态。

---


output.**encrypted_content ** `string`
经加密及压缩处理后的思考内容原文。仅当在`include`参数中指定`reasoning.encrypted_content`时，才会在生成响应时返回该字段。自`doubao-seed-2-0-pro-260415`版本起，支持该字段输出。

---


output.**id ** `string`
本思维链消息的唯一标识。


---


**工具调用**
本次请求，模型根据信息认为需要调用的工具信息以及对应参数。

属性

---


output.**arguments ** `string` 
要传递给函数的参数，格式为 JSON 字符串。

---


output.**call_id ** `string` 
本次工具调用信息的唯一 ID 。

---


output.**name ** `string` 
要运行的函数的名称。

---


output.**type ** `string` 
工具调用的类型，此处应为 `function_call`。

---


output.**status ** `string`
此时消息返回的状态。

---


output.**id ** `string`
本次输出的唯一标识。


**MCP 工具**
output.**id ** `string`
本次输出的唯一标识。

---


output.**server_label ** `string` 
MCP Server标签。

---


output.**tools ** `object`
mcp工具返回信息

McpCall
**arguments** **`string`**
传递给工具的参数的 JSON 字符串。

---


**id** **`string`**
本次输出的唯一标识。

---


**name** `string`
运行工具的名称。

---


**server_label ** `string`
MCP Server标签。

---


**type** `string`
始终为 `mcp_call`。

---


**error** `string`
工具调用中出现的错误（如有）。

---


**output** `string`
工具调用的输出结果。


McpListTools
**id** **`string`**
MCP 列表的唯一标识。

---


**server_label ** `string`
MCP Server标签。

---


**tools  ** `array`
服务端可用工具。

**属性**
tools **.** **input_schema ** `object`
描述工具输入的 JSON 模式。

---


tools **.** **name** `string`
运行工具的名称。

---


tools **.** **annotations** `object`
关于该工具的其他说明。

---


tools **.** **description** `string`
工具描述。




联网搜索工具
output.**tools ** `object`
mcp工具返回信息

属性
**id** **`string`**
本次输出的唯一标识。

---


**type** `string`
始终为 `web_search_call`。

---


**action** `object`
此次搜索调用中执行的具体操作的对象。

属性
action.**type ** `string`
一般为 **search**

---


action.**query ** `string`
搜索内容。

---


action.**source** ** ** `string[]` 
联网搜索的附加内容源。可能为头条图文、抖音百科、墨迹天气。

* `toutiao` ：联网搜索的附加头条图文内容源。
* `douyin` ：联网搜索的附加抖音百科内容源。
* `moji` ：联网搜索的附加墨迹天气内容源。




**图像处理工具**
output.**tools ** `object`
mcp工具返回信息

属性
**type** `string`
始终为 `image_process`。

---


**point ** `object`
画点/连线功能开关，是否启用点绘制与连线功能。

* `"type":"enabled"`：已开启此功能。
* `"type":"disabled"`：未开启此功能。


---


**grounding ** `object`
框选/裁剪功能开关，控制是否启用关键区域框选或裁剪。

* `"type":"enabled"`：已开启此功能。
* `"type":"disabled"`：未开启此功能。


---


**zoom ** `object`
缩放功能开关，控制是否启用全图/指定区域缩放（支持0.5\-2.0倍）。

* `"type":"enabled"`：已开启此功能。
* `"type":"disabled"`：未开启此功能。


---


**rotate ** `object`
旋转功能开关，控制是否启用顺时针旋转（支持0\-359度）。

* `"type":"enabled"`：已开启此功能。
* `"type":"disabled"`：未开启此功能。




---


**previous_response_id** `string / null`
本次请求时传入的历史响应ID。

---


**thinking ** `object / null`
是否开启深度思考模式。

属性
thinking.**type ** `string`  
取值范围：`enabled`， `disabled`，`auto`。

* `enabled`：开启思考模式，模型一定先思考后回答。
* `disabled`：关闭思考模式，模型直接回答问题，不会进行思考。
* `auto`：自动思考模式，模型根据问题自主判断是否需要思考，简单题目直接回答。

&nbsp;

---


**service_tier** `string`
本次请求是否使用了TPM保障包。

* `default`：本次请求未使用TPM保障包额度。


---


**status** `string`
生成响应的状态。

* `completed`：响应已完成。
* `failed`：响应失败。
* `in_progress`：响应中。
* `incomplete`：响应未完成。


---


**text** `object`
用于定义输出的格式，可以是纯文本，也可以是结构化的 JSON 数据。详情请看[结构化输出](https://www.volcengine.com/docs/82379/1568221)。

属性

---


text.**format ** `object`
指定模型必须输出的格式的对象。

属性

---


**自然语言输出** `object`
模型回复以自然语言输出。

text.format.**type ** `string` 
回复格式的类型，固定为 `text`。


---


JSON Object `object`
响应格式为 JSON 对象。

属性

---


text.format.**type ** `string` 
回复格式的类型，固定为 `json_object`。


---


JSON Schema `object`
响应格式为 JSON 对象，遵循schema字段定义的 JSON结构。

属性

---


text.format.**type ** `string` 
回复格式的类型，固定为 `json_schema`。

---


text.format.**name ** `string`
用户自定义的JSON结构的名称。

---


text.format.**schema ** `object`
回复格式的JSON格式定义，以JSON Schema对象的形式描述。

---


text.format.**description** `string / null`
回复用途描述，模型将根据此描述决定如何以该格式回复。

---


text.format.**strict** `boolean / null`
是否在生成输出时，启用严格遵循模式。

   * true：模型将始终遵循schema字段中定义的格式。
   * false：模型将尽可能遵循schema字段中定义的结构。





---


**tools** `array`
模型可以调用的工具列表。

属性

---


tools.**function ** `object` 
模型可以调用的类型为`function`的工具列表。

属性

---


tools.function.**name ** `string` 
调用的函数的名称。

---


tools.function.**parameters ** `object` 
函数请求参数，以 JSON Schema 格式描述。具体格式请参考 [JSON Schema](https://json-schema.org/understanding-json-schema) 文档，格式如下：
```JSON
{
  "type": "object",
  "properties": {
    "参数名": {
      "type": "string | number | boolean | object | array",
      "description": "参数说明"
    }
  },
  "required": ["必填参数"]
}
```

其中，

* 所有字段名大小写敏感。
* **parameters** 须是合规的 JSON Schema 对象。
* 建议用英文字段名，中文置于 **description** 字段中。


---


tools.function.**type ** `string` 
工具调用的类型，固定为`function`。

---


tools.function.**description ** `string` 
调用的函数的描述，大模型会使用它来判断是否调用这个函数。



---


**top_p** `float / null`
核采样概率阈值。

---


**usage ** `object`
本次请求的 token 用量，包括输入 token 数量、输入 token 的详细分解、输出 token 数量、输出 token 的详细分解，以及总共使用的 token 数。
如果使用了工具，还会输出使用的工具类型和次数，以及工具的使用详情。

属性

---


usage.**input_tokens ** `integer`
输入的 token 量。

---


usage.**input_tokens_details ** `object`
输入 token 的详细信息。

属性

---


usage.input_tokens_details.**cached_tokens ** `integer`
缓存 token 的数量。


---


usage.**output_tokens ** `integer`
输出的 token 量。

---


usage.**output_tokens_details ** `object`
输出 token 的详细信息。

属性

---


usage.output_tokens_details.**reasoning_tokens ** `integer`
思考用 token 的数量。


---


usage.**total_tokens ** `integer`
消耗 token 的总量。

---


usage.**tool_usage ** `object`
使用工具的信息。

属性
usage.tool_usage.**image_process ** `integer`
调用图像处理工具的数量。

---


usage.tool_usage.**mcp ** `integer`
调用mcp工具的数量。

---


usage.tool_usage.**web_search ** `integer`
调用网络搜索工具的数量。


---


usage.**tool_usage_details ** `object`
使用工具的详细信息。

属性
usage.tool_usage_details.**image_process ** `object`
调用图像处理工具的详细信息。例如：
```JSON
"tool_usage_details":{
    "image_process":{
        "zoom": 1,
        "point": 1,
        "grounding": 1
    }
}
```


---


usage.tool_usage_details.**mcp ** `object`
调用mcp工具的详细信息。例如：
```JSON
"tool_usage_details":{
    "mcp":{
        "mcp_server_tos": 1,
        "mcp_server_tls": 1
    }
}
```


---


usage.tool_usage_details.**web_search ** `object`
调用网络搜索工具的详细信息。例如：
```JSON
"tool_usage_details":{
    "web_search":{
        "toutiao": 1,
        "moji": 1,
        "search_engine": 1
    }
}
```





---


**store** `boolean` `默认值 true`
是否存储生成的模型响应，以便后续通过 API 检索。

* `false`：不存储，对话内容不能被后续的 API 检索到。
* `true`：存储当前模型响应，对话内容能被后续的 API 检索到。


---


**caching ** `object` 
是否开启缓存。

属性

---


**caching**.type ** ** `string` 
取值范围：`enabled`， `disabled`。

* `enabled`：开启缓存。
* `disabled`：关闭缓存。


---


**expire_at** `integer/null`
存储的有效期。

---


**temperature** `float/null`
采样温度。

---


**context_management  ** `object`  
上下文管理响应，请求过程中应用的上下文管理策略信息。

属性
context_management **.** **applied_edits ** `array`
已应用的上下文编辑策略列表。

策略类型

---


**思考块清除 ** `object`

属性

---


context_management.applied_edits.**type ** `string`
上下文编辑策略类型，此处应为`clear_thinking`。

---


context_management.applied_edits.**cleared_thinking_turns ** `integer`
已清除的思考轮次次数。


---


**工具调用内容清除** `object`

属性

---


context_management.applied_edits.**type ** `string`
上下文编辑策略类型，此处应为`clear_tool_uses`。

---


context_management.applied_edits.**cleared_tool_uses ** `integer`
已清除的工具调用次数。





当你创建 response 并将 `stream` 设置为 `true` 时，服务器会在生成 Response 的过程中，通过 Server\-Sent Events（SSE）实时向客户端推送事件。本节内容介绍服务器会推送的各类事件。

Tips：一键展开折叠，快速检索内容
:::tip
打开页面右上角开关后，**ctrl ** + f 可检索页面内所有内容。
<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_952f1a5ff1c9fc29c4642af62ee3d3ee.png) </span>

:::
&nbsp;
<span id="EX0bGYJg"></span>
## response.created 
> 当响应被创建时触发的事件。


---


**response** `object` 
创建状态的响应。包含参数与[创建模型请求](https://www.volcengine.com/docs/82379/1569618)时，非流式调用返回的参数一致。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.created`。

---



response.created 响应示例
```JSON
{
  "type": "response.created",
  "response": {
    "created_at": 1764229579,
    "id": "resp_021764229578658fe9a0f6cb2cc6c828e7a59adbdb971872aee70",
    "max_output_tokens": 32768,
    "model": "doubao-seed-1-6-251015",
    "object": "response",
    "thinking": {
      "type": "enabled"
    },
    "service_tier": "default",
    "caching": {
      "type": "disabled"
    },
    "store": true,
    "expire_at": 1764488778
  },
  "sequence_number": 0
}
```




---


<span id="29Hz1H2o"></span>
## response.in_progress
> 当响应在进程中触发的事件。


---


**response** `object` 
进行中状态的响应。包含参数与[创建模型请求](https://www.volcengine.com/docs/82379/1569618)时，非流式调用返回的参数一致。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.in_progress`。

---



response.in_progress 响应示例
```JSON
{
  "type": "response.in_progress",
  "response": {
    "created_at": 1764229579,
    "id": "resp_021764229578658fe9a0f6cb2cc6c828e7a59adbdb971872aee70",
    "max_output_tokens": 32768,
    "model": "doubao-seed-1-6-251015",
    "object": "response",
    "thinking": {
      "type": "enabled"
    },
    "service_tier": "default",
    "caching": {
      "type": "disabled"
    },
    "store": true,
    "expire_at": 1764488778
  },
  "sequence_number": 1
}
```




---


<span id="8ELQhd7V"></span>
## response.completed
> 当响应已完成触发的事件。


---


**response** `object` 
已完成状态的响应。包含参数与[创建模型请求](https://www.volcengine.com/docs/82379/1569618)时，非流式调用返回的参数一致。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.completed`。

---



response.completed 响应示例
```JSON
{
  "type": "response.completed",
  "response": {
    "created_at": 1776222945,
    "id": "resp_021776222944180e3c0010419774ef230e4bef6206f9366409cf2",
    "max_output_tokens": 32768,
    "model": "doubao-seed-2-0-lite-260215",
    "object": "response",
    "output": [
      {
        "id": "rs_02177622294537700000000000000000000ffffac15ee27794623",
        "type": "reasoning",
        "summary": [
          {
            "type": "summary_text",
            "text": "Model reasoning process summary content example."
          }
        ],
        "status": "completed"
      },
      {
        "type": "message",
        "role": "assistant",
        "content": [
          {
            "type": "output_text",
            "text": "Final assistant response content example."
          }
        ],
        "status": "completed",
        "id": "msg_02177622299118100000000000000000000ffffac15ee273242ae"
      }
    ],
    "service_tier": "default",
    "status": "completed",
    "usage": {
      "input_tokens": 58,
      "output_tokens": 1647,
      "total_tokens": 1705,
      "input_tokens_details": {
        "cached_tokens": 0
      },
      "output_tokens_details": {
        "reasoning_tokens": 1273
      }
    },
    "caching": {
      "type": "disabled"
    },
    "store": true,
    "expire_at": 1776482144
  },
  "sequence_number": 1635
}
```




---


<span id="JnwOkDSh"></span>
## response.failed
> 当响应失败触发的事件。

**response** `object` 
失败状态的响应。包含参数与[创建模型请求](https://www.volcengine.com/docs/82379/1569618)时，非流式调用返回的参数一致。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.failed`。

---



response.failed 响应示例
```JSON
{
  "type": "response.failed",
  "response": {
    "created_at": 1764229579,
    "error": {
      "code": "server_error",
      "message": "The model encountered an internal error while generating a response."
    },
    "id": "resp_021764229578658fe9a0f6cb2cc6c828e7a59adbdb971872aee70",
    "max_output_tokens": 32768,
    "model": "doubao-seed-1-6-251015",
    "object": "response",
    "output": [],
    "thinking": {"type": "enabled"},
    "service_tier": "default",
    "status": "failed",
    "tools": [],
    "caching": {"type": "disabled"},
    "store": true,
    "expire_at": 1764488778,
    "sequence_number": 5
  }
}
```




---


<span id="AZdAWtNX"></span>
## response.incomplete
> 当响应以未完成状态结束时触发的事件 。

**response** `object` 
未完成状态的响应。包含参数与[创建模型请求](https://www.volcengine.com/docs/82379/1569618)时，非流式调用返回的参数一致。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.incomplete`。

---



response.incomplete 响应示例
```JSON
{
  "type": "response.incomplete",
  "response": {
    "response_id": "resp_4jqrc20000801",
    "created_at": 1738123456,
    "status": "incomplete",
    "usage": null,
    "output": []
  },
  "sequence_number": 0
}
```




---


<span id="XxXpy5eV"></span>
## response.output_item.added
> 表示添加了新的输出项。


---


**item** `object`
模型输出内容。

属性

---


**文本输出** `object`
增加的模型回答的内容。

属性

---


item.**content ** `array`
输出消息的内容。

文本信息 `object`
模型的文本输出。

属性

---


item.content.**text ** `string` 
模型的文本输出。

---


item.content.**type ** `string` 
输出文本的类型，总是`output_text`。



---


item.**role**  ** ** `string` 
输出信息的角色，总是`assistant`。 ** ** 

---


item.**status ** `string`
输出消息的状态。

---


item.**id ** `string`
output message 请求的唯一标识。

---


item.**type ** `string` 
输出消息的类型。


---


**内容链** `object`
请求中触发了深度思考时的思维链内容。

属性

---


item.**summary ** `array` ** ** 
思考内容原文。自`doubao-seed-2-0-pro-260415`版本起，该字段用于返回思考内容摘要。

属性

---


item.summary.**text ** `string` 
模型生成答复时的推理内容。
:::warning
针对长文本生成、深度推理等耗时场景，建议适当调大首 Token 超时时间（TTFT）与逐 Token 生成超时时间（TPOT），避免请求因超时而中断。

:::
---


item.summary.**type ** `string` 
对象的类型，总是 `summary_text`。


---


item.**content** `array`
思考内容原文。

属性
item.content.**text ** `string`
模型生成答复时的推理内容。

---


item.content.**type ** `string`
对象的类型，总是`reasoning_text`。


---


item.**type ** `string` ** ** 
对象的类型，此处应为 `reasoning`。

---


item.**encrypted_content ** `string`
经加密及压缩处理后的思考内容原文。仅当在 include 参数中指定`reasoning.encrypted_content`时，才会在生成响应时返回该字段。自`doubao-seed-2-0-pro-260415`版本起，支持该字段输出。

---


item.**status ** `string`
该内容项的状态。

---


item.**id ** `string`
请求的唯一标识。


---


**工具信息** `object`
模型调用工具的信息

属性

---


item.**arguments ** `string` 
要传递给函数的参数的 JSON 字符串。

---


item.**call_id ** `string` 
模型生成的函数工具调用的唯一ID。

---


item.**name ** `string` 
要运行的函数的名称。

---


item.**type ** `string` 
工具调用的类型，始终为 `function_call`。

---


item.**status ** `string`
该项的状态。

---


item.**id ** `string`
工具调用请求的唯一标识。



---


**output_index** `integer`
被添加的输出项的索引。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是`response.output_item.added`。

---



response.output_item.added 响应示例
```JSON
{
  "type": "response.output_item.added",
  "output_index": 0,
  "item": {
    "id": "rs_02176422957963700000000000000000000ffffac15dd335c9c43",
    "type": "reasoning",
    "status": "in_progress"
  },
  "sequence_number": 2
}
```




---


<span id="12MhXnUb"></span>
## response.output_item.done
> 表示输出项已完成。

**item** `object`
已完成的输出项。

属性

---


**文本输出** `object`
增加的模型回答的内容。

属性

---


item.**content ** `array`
输出消息的内容。

文本信息 `object`
模型的文本输出。

属性

---


item.content.**text ** `string` 
模型的文本输出。

---


item.content.**type ** `string` 
输出文本的类型，总是`output_text`。


item.**role**  ** ** `string` 
输出信息的角色，总是`assistant`。 ** ** 

---


item.**status ** `string`
输出消息的状态。

---


item.**id ** `string`
output message 请求的唯一标识。

---


item.**type ** `string` 
输出消息的类型。


---


**内容链** `object`
请求中触发了深度思考时的思维链内容。

属性

---


item.**summary ** `array` ** ** 
思考内容原文。自`doubao-seed-2-0-pro-260415`版本起，该字段用于返回思考内容摘要。

属性

---


item.summary.**text ** `string` 
模型生成答复时的推理内容。
:::warning
针对长文本生成、深度推理等耗时场景，建议适当调大首 Token 超时时间（TTFT）与逐 Token 生成超时时间（TPOT），避免请求因超时而中断。

:::
---


item.summary.**type ** `string` 
对象的类型，总是 `summary_text`。


---


item.**content** `array`
思考内容原文。

属性
item.content.**text ** `string`
模型生成答复时的推理内容。

---


item.content.**type ** `string`
对象的类型，总是`reasoning_text`。


---


item.**type ** `string` ** ** 
对象的类型，此处应为 `reasoning`。

---


item.**encrypted_content ** `string`
经加密及压缩处理后的思考内容原文。仅当在 include 参数中指定`reasoning.encrypted_content`时，才会在生成响应时返回该字段。自`doubao-seed-2-0-pro-260415`版本起，支持该字段输出。

---


item.**status ** `string`
该内容项的状态。

---


item.**id ** `string`
请求的唯一标识。


---


**工具信息** `object`
模型调用工具的信息

属性

---


item.**arguments ** `string` 
要传递给函数的参数的 JSON 字符串。

---


item.**call_id ** `string` 
模型生成的函数工具调用的唯一ID。

---


item.**name ** `string` 
要运行的函数的名称。

---


item.**type ** `string` 
工具调用的类型，始终为 `function_call`。

---


item.**status ** `string`
该项的状态。

---


item.**id ** `string`
工具调用请求的唯一标识。



---


**output_index** `integer`
已完成的输出项的索引。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.output_item.done`。

---



response.output_item.done 响应示例
```JSON
{
  "type": "response.output_item.done",
  "output_index": 0,
  "item": {
    "id": "rs_02177622294537700000000000000000000ffffac15ee27794623",
    "type": "reasoning",
    "summary": [
      {
        "type": "summary_text",
        "text": "Sample reasoning summary content for demonstration."
      }
    ],
    "status": "completed"
  },
  "sequence_number": 1261
}
```




---


<span id="S1Rlew1t"></span>
## response.content_part.added
> 当有新的内容部分被添加时触发。


---


**content_index ** `integer`
内容部分的索引。

---


**item_id ** `string`
内容部分所添加的输出项的 ID 。

---


**output_index ** `integer`
内容部分所添加的输出项的索引 。

---


**part ** `object`
所添加的内容部分。

属性

输出文本 ** ** `object`
模型输出的文本对象

part.**text**`string`
模型输出的文本内容。


part.**type ** `string`
output text 的类型，此处应是`output_text`。




---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.content_part.added`。

---



response.content_part.added 响应示例
```JSON
{
  "type": "response.content_part.added",
  "content_index": 0,
  "item_id": "msg_02177622299118100000000000000000000ffffac15ee273242ae",
  "output_index": 1,
  "part": {
    "type": "output_text",
    "text": ""
  },
  "sequence_number": 100
}
```




---


<span id="XtcmlhGt"></span>
## response.content_part.done
> 当内容完成时触发。

**content_index ** `integer`
内容部分的索引。

---


**item_id ** `string`
内容部分所添加的输出项的 ID 。

---


**output_index ** `integer`
内容部分所添加的输出项的索引 。

---


**part ** `object`
所完成的内容部分。

属性

输出文本 ** ** `object`
模型输出的文本对象

part.**text**`string`
模型输出的文本内容。


part.**type ** `string`
output text 的类型，此处应是`output_text`。




---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.content_part.done`。

---



response.content_part.done 响应示例
```JSON
{
  "type": "response.content_part.done",
  "content_index": 0,
  "item_id": "msg_02177622299118100000000000000000000ffffac15ee273242ae",
  "output_index": 1,
  "part": {
    "type": "output_text",
    "text": "Sample completed text content."
  },
  "sequence_number": 1633
}
```




---


&nbsp;
<span id="lrAYHrbh"></span>
## response.output_text.delta
> 当有新增文本片段时触发。


---


**content_index ** `integer`
增量文本所属内容块的索引。

---


**delta ** `string`
新增的文本片段内容。

---


**item_id ** `string`
增量文本所属输出项的唯一 ID。

---


**output_index ** `integer`
增量文本所属输出项的列表索引。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.output_text.delta`。

---



response.output_text.delta 响应示例
```JSON
{
  "type": "response.output_text.delta",
  "content_index": 0,
  "delta": "Hello",
  "item_id": "msg_02177622299118100000000000000000000ffffac15ee273242ae",
  "output_index": 1,
  "sequence_number": 1264
}
```




---


<span id="HXKZjqWt"></span>
## response.output_text.done
> 文本内容完成时触发。

**content_index ** `integer`
文本内容所属内容块的索引。

---


**item_id ** `string`
文本内容所属输出项的唯一 ID。

---


**output_index ** `integer`
文本内容所属输出项的列表索引。

---


**sequence_number ** `integer`
事件的序列号。

---


**text ** `string`
完成的文本内容。

---


**type** `string`
事件的类型，总是 `response.output_text.done`

---



response.output_text.done 响应示例
```JSON
{
  "type": "response.output_text.done",
  "content_index": 0,
  "item_id": "msg_02177622299118100000000000000000000ffffac15ee273242ae",
  "output_index": 1,
  "text": "This is the final complete output text.",
  "sequence_number": 1632
}
```




---


<span id="JoOTw97R"></span>
## response.function_call_arguments.delta
> 存在函数调用参数片段时触发。

**delta** `string`
本次新增的函数调用参数增量片段。

---


**item_id** `string`
所属输出项的唯一 ID。

---


**output_index ** `integer`
所属输出项的列表索引。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.function_call_arguments.delta`。

---



response.function_call_arguments.delta 响应示例
```JSON
{
  "type": "response.function_call_arguments.delta",
  "delta": "{\"city\":",
  "item_id": "call_02177622299118100000000000000000000ffffac15ee273242ae",
  "output_index": 0,
  "sequence_number": 120
}
```




---


<span id="OEfRO0nt"></span>
## response.function_call_arguments.done
> 当函数调用参数完成时触发。

**arguments** `string`
函数调用的参数。

---


**item_id** `string`
所属输出项的唯一 ID。

---


**output_index ** `integer`
所属输出项的列表索引。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.function_call_arguments.done`。

---



response.function_call_arguments.done 响应示例
```JSON
{
  "type": "response.function_call_arguments.done",
  "arguments": "{\"city\":\"杭州\",\"date\":\"2026-04-15\"}",
  "item_id": "call_02177622299118100000000000000000000ffffac15ee273242ae",
  "output_index": 0,
  "sequence_number": 121
}
```




---


<span id="SlWpiSbp"></span>
## response.reasoning_summary_part.added
> 当存在思维链新增部分时触发。

**item_id ** `string`
所属输出项的 ID 。

---


**output_index ** `integer`
所属输出项的索引 。

---


**summary_index ** `integer`
输出项内，推理总结部分的子索引（若有多个总结）。

---


**part ** `object`
所添加的内容部分。

属性

part.**type**`string`
part 的类型，总是`summary_text`。


part.**text**`string`
输出的思维链文本。



---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.reasoning_summary_part.added`。

---



response.reasoning_summary_part.added 响应示例
```JSON
{
  "type": "response.reasoning_summary_part.added",
  "item_id": "rs_02177607874514300000000000000000000ffffc0a8c702236f12",
  "output_index": 0,
  "summary_index": 0,
  "part": {
    "type": "summary_text"
  },
  "sequence_number": 3
}
```




---


<span id="mObConSY"></span>
## response.reasoning_summary_part.done
> 当思维链部分完成时触发。

**item_id ** `string`
所属输出项的 ID 。

---


**output_index ** `integer`
所属输出项的索引 。

---


**summary_index ** `integer`
输出项内，推理总结部分的子索引（若有多个总结）。

---


**part ** `object`
所完成的内容部分。

属性

part.**type**`string`
part 的类型，总是`summary_text`。


part.**text**`string`
输出的思维链文本。



---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.reasoning_summary_part.done`。

---



response.reasoning_summary_part.done 响应示例
```JSON
{
  "type": "response.reasoning_summary_part.done",
  "item_id": "rs_02177622294537700000000000000000000ffffac15ee27794623",
  "output_index": 0,
  "summary_index": 0,
  "part": {
    "type": "summary_text",
    "text": "Reasoning process completed. This is a sample summary part for demonstration."
  },
  "sequence_number": 1260
}
```




---


<span id="W2TBw0hz"></span>
## response.reasoning_summary_text.delta
> 当存在思维链新增文本时触发。

**item_id ** `string`
所属输出项的 ID 。

---


**output_index ** `integer`
所属输出项的索引 。

---


**summary_index ** `integer`
输出项内，推理总结部分的子索引（若有多个总结）。

---


**delta ** `string`
输出的思维链文本增量片段。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.reasoning_summary_text.delta`。

---



response.reasoning_summary_text.delta 响应示例
```JSON
{
    "type": "response.reasoning_summary_text.delta",
    "summary_index": 0,
    "delta": "and",
    "item_id": "rs_02177622294537700000000000000000000ffffac15ee27794623",
    "output_index": 0,
    "sequence_number": 364
}
```




---


<span id="YoAtCl3P"></span>
## response.reasoning_summary_text.done
> 思维链文本完成时触发。


---


**item_id ** `string`
所属输出项的 ID 。

---


**output_index ** `integer`
所属输出项的索引 。

---


**summary_index ** `integer`
输出项内，推理总结部分的子索引（若有多个总结）。

---


**text ** `string`
思维链文本完整内容。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `response.reasoning_summary_text.done`。

---



response.reasoning_summary_text.done 响应示例
```JSON
{
  "type": "response.reasoning_summary_text.done",
  "summary_index": 0,
  "item_id": "rs_02177622294537700000000000000000000ffffac15ee27794623",
  "output_index": 0,
  "text": "This is a sample reasoning summary text for demonstration.",
  "sequence_number": 1259
}
```




---


<span id="511XgGmh"></span>
## error
> 发生错误时触发。


---


**code ** `string/null`
错误码。

---


**message ** `string`
错误原因。

---


**param ** `string/null`
错误参数。

---


**sequence_number ** `integer`
事件的序列号。

---


**type** `string`
事件的类型，总是 `error`。

---



error 响应示例
```JSON
{
  "type": "error",
  "code": "InvalidParameter",
  "message": "Invalid value for 'max_output_tokens'",
  "param": "max_output_tokens",
  "sequence_number": 5
}
```




---


&nbsp;
&nbsp;


`POST https://ark.cn-beijing.volces.com/api/v3/files`
本文介绍使用 Files API 上传文件请求时的输入输出参数，供您使用接口时查阅字段含义。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="FQpBrly1"><RenderMd content={`本接口支持 API Key /Access Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入口" key="ZMEm3LaGAI"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Files](https://www.volcengine.com/docs/82379/1885708)[ API 教程](https://www.volcengine.com/docs/82379/1885708)   <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="LGrPmcsa"></span>
## 请求参数
> 跳转 [响应参数](#NtL4xXlS)

<span id="5Q8CpXQq"></span>
### 请求体

---


**file** `file` %%require%%
需要上传的文件，要求为二进制文件。具体限制请参见 [Files API教程](https://www.volcengine.com/docs/82379/1885708)。

---


**purpose**  `string` `默认值：user_data` %%require%%
文件用途。
`user_data`：可以灵活使用的文件，能够用于任意用途。

---


**preprocess_configs** `object / null` 
用于设置不同文件类型的预处理规则。

属性

---


preprocess_configs.video.**fps** `float / null` `默认值：1`
取值范围：`[0.2，5]`。
每秒钟从视频中抽取指定数量的图像。取值越高，对于视频中画面变化理解越精细；取值越低，对于视频中画面变化感知减弱，但是使用的token花费少，速度也更快。单视频token 用量范围在[10k, 80k]，具体参见[视频理解](https://www.volcengine.com/docs/82379/1895586?lang=zh#.55So6YeP6K-05piO)。

---


preprocess_configs.video.**model** `string` 
使用该文件进行推理时，要使用的视频理解模型 ID （Model ID）或 Endpoint ID。
:::tip
Files API 中设置的模型 ID 与推理使用的模型 ID 不强耦合，只影响上传视频文件时预处理抽帧策略。关于预处理抽帧策略，参见[抽帧策略](https://www.volcengine.com/docs/82379/1895586?lang=zh#.5oq95bin562W55Wl)。

:::
* 传入模型 ID：传入不同的模型 ID 会采用不同的抽帧策略。
* 传入 Endpoint ID：会按照上传时 Endpoint ID 映射的模型对应的抽帧策略进行抽帧。
* 不传该参数时：默认采用`doubao-seed-1.8`之前的模型对应的抽帧策略。

:::warning
`doubao-seed-1.8`及后续模型支持更长的视频理解能力，抽帧数已从 640 帧提升至 1280 帧。
如果要使用`doubao-seed-1-8-251228`进行视频理解，但通过 Files API 上传文件时未设置该模型 ID，则采用的是`doubao-seed-1.8`之前模型对应的抽帧策略，模型实际理解的帧数会减少。

:::

---


**expire_at** `integer` `默认值：当前时刻+604800` 
取值范围：`[当前时刻+86400, 当前时刻+2592000]`，即最少保留1天，最多保留30天。
设置存储的有效期，需要传入UTC Unix时间戳（单位：秒）。 
<span id="NtL4xXlS"></span>
## 响应参数
> 跳转 [请求参数](#LGrPmcsa)

模型会返回对应的 [file](https://www.volcengine.com/docs/82379/1873424)[ object](https://www.volcengine.com/docs/82379/1873424?type=preview&lang=zh)。

`GET https://ark.cn-beijing.volces.com/api/v3/files/{file_id}`
通过 File id 获取文件信息。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="TIcwAPbc"><RenderMd content={`本接口支持 API Key /Access Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入口" key="NQzR9pWM"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Files](https://www.volcengine.com/docs/82379/1885708)[ API 教程](https://www.volcengine.com/docs/82379/1885708)   <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="YP6bDFZC"></span>
## 请求参数 
<span id="wcna9TMz"></span>
### 路径参数

---


id `string` %%require%%
待检索的文件 id。
<span id="5PiUp3nH"></span>
## 响应参数
模型会返回对应的 [file](https://www.volcengine.com/docs/82379/1873424?type=preview&lang=zh)[ object](https://www.volcengine.com/docs/82379/1873424?type=preview&lang=zh)。

`GET https://ark.cn-beijing.volces.com/api/v3/files`
获取文件列表。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="5fz0GorD"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)     <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[Files](https://www.volcengine.com/docs/82379/1885708)[ API 教程](https://www.volcengine.com/docs/82379/1885708)[ ](https://www.volcengine.com/docs/82379/1885708)  <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="otR1GVWw"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="l9Iu16WF"></span>
## 请求参数 
> 跳转 [响应参数](#nby1fJFs)

<span id="eB97NMCI"></span>
### 查询参数
> 在 URL String 中传入。


---


**after** `string/ null`
返回该文件 ID 之后的文件。

---


**limit** `integer` `默认值：100`
取值范围： 1 ~ 100。
控制单次返回的最大文件数。

---


**purpose** `string` 
按文件用途进行筛选，仅返回具有指定用途的文件。

---


**order** `string` `默认值：desc`
按照文件created_at的时间戳顺序，控制文件的排序方式。

*  asc：按照正序排列。
* desc：按照倒序排列。

<span id="nby1fJFs"></span>
## 响应参数
> 跳转 [请求参数](#l9Iu16WF)

返回本次响应对应的文件列表。
**object** `string`
固定为`list`。

---


**data** `object[] / null`
文件的列表，与上传文件时的请求参数字段结构完全一致。

---


**first_id** `string`
列表中第一条数据的 ID。

---


**has_more** `boolean`
标识是否还有更多数据未返回。

* true：存在未返回的数据。
* false：已返回全部数据。


---


**last_id** `string`
列表中最后一条数据的 ID。

`DELETE https://ark.cn-beijing.volces.com/api/v3/files/{file_id}`
根据文件ID删除文件，并将文件从存储空间中移除。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="5gPFP2ta"><RenderMd content={` <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)          <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[模型调用教程](https://www.volcengine.com/docs/82379/1585128)    <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="enBSXJ0V"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="hnU4cNWd"></span>
## 请求参数
<span id="Uxe9XAQw"></span>
### 路径参数

---


**id** `string` %%require%%
待删除的文件id。
<span id="0EtRjtOR"></span>
## 响应参数

---


**id** `string`
被删除的文件id。

---


**object** `string`
固定为 `file`。

---


**deleted** `boolean`
文件被删除，取值`true`表明删除成功。

上传文件或检索文件后，模型会返回一个 file 对象。本文为您介绍 file 对象包含的详细参数。

---


**object** `string`
固定为`file`。

---


**id** `string`
文件的唯一标识符。

---


**purpose** `string`
文件用途。

---


**bytes** `integer` 
文件大小，以bytes为单位。仅文件处理状态为active时返回。

---


**created_at** `integer` 
本次请求上传文件时的Unix时间戳(秒)。

---


**expire_at** `integer` 
文件过期时间的Unix时间戳（秒）。

---


**mime_type** `string` 
文件的MIME类型，如`application/pdf`。仅文件处理状态为active时返回。

---


**status** `string` 
文件处理状态。

* processing：文件正在预处理，无法使用。
* active：文件已处理完成，可以使用。
* failed：文件上传失败，错误详情查看**error**字段。


---


**error** `object / null `
文件上传失败时返回的错误对象，即**status**取值为`failed`时才会返回该字段。

* code：错误码。
* message：错误描述信息。


---


**preprocess_configs** `object / null` 
用于设置不同文件类型的预处理规则。

属性
preprocess_configs.video.**fps** `float / null` 
每秒钟从视频中抽取指定数量的图像。取值越高，对于视频中画面变化理解越精细；取值越低，对于视频中画面变化感知减弱，但是使用的token花费少，速度也更快。

---


preprocess_configs.video.**model** `string` 
使用该文件进行推理时，要使用的视频理解模型 ID （Model ID）或 Endpoint ID。



`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`   [ ](https://api.volcengine.com/api-explorer/?action=CreateContentsGenerationsTasks&data=%7B%7D&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&query=%7B%7D&serviceCode=ark&version=2024-01-01)[运行](https://api.volcengine.com/api-explorer/?action=CreateContentsGenerationsTasks&data=%7B%7D&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&query=%7B%7D&serviceCode=ark&version=2024-01-01)
本文介绍创建视频生成任务 API 的输入输出参数，供您使用接口时查阅字段含义。模型会依据传入的图片及文本信息生成视频，待生成完成后，您可以按条件查询任务并获取生成的视频。
:::tip
请确保您的账户余额大于等于 200 元（[前往充值](https://console.volcengine.com/finance/fund/recharge)），或已[购买资源包](https://console.volcengine.com/common-buy/fast/ark_bd%7C%7Cd682ppeeq1mp7kd5q0e0)，否则无法开通 seedance 2.0 及 seedance 2.0 fast 模型。

:::
**模型能力==^new^==**

* **seedance 2.0 & 2.0 fast==^new^==** ** (有声视频/无声视频)** 
   * **多模态参考生视频==^new^==**：输入++参考图片（0~9）+参考视频（0~3）+ 参考音频（0~3）+ 文本提示词（可选）++ 生成 1 个目标视频。注意不可单独输入音频，应至少包含 1 个参考视频或图片。支持生成全新视频、编辑视频、延长视频，[阅读教程](https://www.volcengine.com/docs/82379/2291680) 获取详细代码示例。
   * **图生视频\-首尾帧**：输入++首帧图片+尾帧图片+文本提示词（可选）++ 生成 1 个目标视频。
   * **图生视频\-首帧**：输入++首帧图片+文本提示词（可选）++ 生成 1 个目标视频。
   * **文生视频**：输入++文本提示词++生成 1 个目标视频。
* **seedance 1.5 pro (有声视频/无声视频)** 
   【图生视频\-首尾帧】【图生视频\-首帧】【文生视频】
* **seedance 1.0 pro**
   【图生视频\-首尾帧】【图生视频\-首帧】【文生视频】
* **seedance 1.0 pro fast**
   【图生视频\-首帧】【文生视频】
* **seedance 1.0 lite**
   * **doubao\-seedance\-1\-0\-lite\-t2v：** 文生视频
   * **doubao\-seedance\-1\-0\-lite\-i2v：** 
      * 参考图生视频：根据您输入的**++参考图片（1\-4张）++ **  +++文本提示词（可选）++ 生成 1 个目标视频。
      * 图生视频\-首尾帧
      * 图生视频\-首帧


Tips：一键展开折叠，快速检索内容
打开页面右上角开关，**ctrl ** + **f** 可检索页面内所有内容。
<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_cae7ddb0e1977b68b353f17897b8574c.png) </span>


```mixin-react
return (<Tabs>
<Tabs.TabPane title="在线调试" key="4rK5FhUg"><RenderMd content={`<APILink link="https://api.volcengine.com/api-explorer/?action=CreateContentsGenerationsTasks&data=%7B%7D&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&query=%7B%7D&serviceCode=ark&version=2024-01-01" description="API Explorer 您可以通过 API Explorer 在线发起调用，无需关注签名生成过程，快速获取调用结果。">去调试</APILink>

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="iRuPtuk6"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入口" key="5LZLMN0J"><RenderMd content={` [ ](#)[体验中心](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh#2705b333)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106?redirect=1&lang=zh#02affcb8)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[调用教程](https://www.volcengine.com/docs/82379/1366799)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span>[接口文档](https://www.volcengine.com/docs/82379/1520758)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_1609c71a747f84df24be1e6421ce58f0.png =20x) </span>[常见问题](https://www.volcengine.com/docs/82379/1359411)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="5qndT7DS"></span>
## 请求参数 
> 跳转 [响应参数](#y2hhTyHB)

<span id="wsGzv1pD"></span>
### 请求体

---


**model** `string` %%require%%
您需要调用的模型的 ID （Model ID），[开通模型服务](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)，并[查询 Model ID](https://www.volcengine.com/docs/82379/1330310) 。
您也可通过 Endpoint ID 来调用模型，获得限流、计费类型（前付费/后付费）、运行状态查询、监控、安全等高级能力，可参考[获取 Endpoint ID](https://www.volcengine.com/docs/82379/1099522)。

---


**content** `object[]` %%require%%
输入给模型，生成视频的信息，支持文本、图片、音频、视频、样片任务 ID。
:::warning
seedance 2.0 系列模型不支持直接上传含有真人人脸的参考图/视频。为了便利创作者对肖像的使用，平台推出了以下解决方案，详情参见 [教程](https://www.volcengine.com/docs/82379/2291680?lang=zh#5c67c9a1)。

* 支持使用部分模型的含人脸原始产物作为输入素材
* 支持使用预置虚拟人像作为输入素材
* 支持使用已授权真人素材作为输入

:::
支持以下几种组合：

* **文本**
* **文本（可选）+ 图片**
* **文本（可选）+ 视频**
* **文本（可选）+ 图片 + 音频**
* **文本（可选）+ 图片 + 视频**
* **文本（可选）+ 视频 + 音频**
* **文本（可选）+ 图片 + 视频 + 音频**
* **样片任务 ID**：样片指使用 seedance 模型成功生成的样片视频，模型可基于样片生成高质量正式视频。


信息类型

---


**文本信息** `object`
输入给模型的提示词信息。

属性

---


content.**type ** `string` %%require%%
输入内容的类型，此处应为 `text`。

---


content.**text ** `string` %%require%%
输入给模型的文本提示词，描述期望生成的视频。
:::tip

* 提示词语言支持：所有模型均支持中英文提示词；seedance 2.0 及 seedance 2.0 fast 额外支持日语、印尼语、西班牙语、葡萄牙语。
* 提示词字数建议：中文提示词不超过500字，英文提示词不超过1000词。字数过多易导致信息分散，模型可能忽略细节、仅关注重点，进而造成视频缺失部分元素。
* 更多使用技巧：提示词的详细使用技巧，请参见 [seedance 提示词指南](https://www.volcengine.com/docs/82379/2222480?lang=zh)。



:::

---


**图片信息==^new^==** `object`
输入给模型的图片信息。

属性

---


content.**type ** `string` %%require%%
输入内容的类型，此处应为 `image_url`。

---


content.**image_url ** `object` %%require%%
输入给模型的图片对象。

属性

---


content.image_url.**url ** `string` %%require%%
图片 URL 、图片 Base64 编码、素材 ID。

* 图片 URL：填入图片的公网 URL。
* Base64 编码：将本地文件转换为 Base64 编码字符串，然后提交给大模型。遵循格式：`data:image/<图片格式>;base64,<Base64编码>`，注意 `<图片格式>` 需小写，如 `data:image/png;base64,{base64_image}`。
* 素材 ID：用于视频生成的预置素材及虚拟人像的 ID，遵循格式：asset://<ASSET_ID\>。可从 [素材&虚拟人像库](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision?modelId=doubao-seedance-2-0-260128) 获取。

:::tip 传入单张图片要求

* 格式：jpeg、png、webp、bmp、tiff、gif。其中，seedance 1.5 pro 新增支持 heic 和 heif。
* 宽高比（宽/高）： (0.4, 2.5) 
* 宽高长度（px）：(300, 6000)
* 大小：单张图片小于 30 MB。请求体大小不超过 64 MB。大文件请勿使用Base64编码。
* 图片数量：
   * 图生视频\-首帧：1 张
   * 图生视频\-首尾帧：2 张
   * seedance 2.0&2.0 fast 多模态参考生视频：1~9 张
   * seedance 1.0 lite 参考图生视频：1~4 张

:::

---


content.**role ** `string` `条件必填`
图片的位置或用途。
:::warning

* **图生视频\-首帧**、**图生视频\-首尾帧**、**多模态参考生视频**（包括参考图、视频、音频）为 3 种互斥场景，**不可混用**。
* **多模态参考生视频**可通过提示词指定参考图片作为首帧/尾帧，间接实现“首尾帧+多模态参考”效果。若需严格保障首尾帧和指定图片一致，**优先使用图生视频\-首尾帧**（配置 role 为 first_frame/last_frame）。


:::
图生视频\-首帧

* **支持模型：** 所有图生视频模型
* **字段role取值：** 需要传入1个 image_url 对象，字段 role 为 first_frame 或不填。


图生视频\-首尾帧

* **支持模型：** seedance 2.0 & 2.0 fast，seedance 1.5 pro、seedance 1.0 pro、seedance 1.0 lite i2v 
* **字段role取值：** 需要传入2个image_url对象，且字段 role 必填。
   * 首帧图片对应的字段 role 为：first_frame
   * 尾帧图片对应的字段 role 为：last_frame

:::tip
传入的首尾帧图片可相同。首尾帧图片的宽高比不一致时，以首帧图片为主，尾帧图片会自动裁剪适配。

:::

图生视频\-参考图 

* **支持模型：** seedance 2.0 & 2.0 fast（1~9 张图片），seedance 1.0 lite i2v（1~4 张图片）
* **字段role取值：** 必填，每张参考图对应的字段 role 均为：reference_image

:::tip
参考图生视频功能的文本提示词，可以用自然语言指定多张图片的组合。但若想有更好的指令遵循效果，**推荐使用“[图1]xxx，[图2]xxx”的方式来指定图片**。
示例1：戴着眼镜穿着蓝色T恤的男生和柯基小狗，坐在草坪上，3D卡通风格
示例2：[图1]戴着眼镜穿着蓝色T恤的男生和[图2]的柯基小狗，坐在[图3]的草坪上，3D卡通风格

:::


---


**视频信息==^new^==** `object`
输入给模型的视频信息。仅 seedance 2.0 & 2.0 fast 支持输入视频。
方舟平台信任 seedance 2.0 及 2.0 fast 模型生成的含人脸视频，您可使用**本账号下近30天内由上述模型生成的含人脸原始视频**，作为输入素材进行二次创作，详情参见 [教程](https://www.volcengine.com/docs/82379/2291680?lang=zh#86c3831f)。

属性
content.**type ** `string` %%require%%
输入内容的类型，此处应为`video_url`。

---


content.**video_url** ** ** `object` %%require%%
输入给模型的视频对象。

属性
content.video_url.**url ** `string` %%require%%
视频URL、素材 ID。

* 视频 URL：填入视频的公网 URL。
* 素材 ID：用于视频生成的预置素材及虚拟人像视频的 ID，遵循格式：asset://<ASSET_ID\>。可从[素材&虚拟人像库](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision?modelId=doubao-seedance-2-0-260128)获取。

:::tip 传入单个视频要求

* 视频格式：mp4、mov，支持编码格式见下表。
* 分辨率：480p，720p，1080p
* 时长：单个视频时长 [2, 15] s，最多传入 3 个参考视频，所有视频总时长不超过 15s。
* 尺寸：
   * 宽高比（宽/高）：[0.4, 2.5]
   * 宽高长度（px）：[300, 6000]
   * 总像素数：[640×640=409600, 2206×946=2086876]，即宽和高的乘积符合 [409600, 2086876] 的区间要求。
* 大小：单个视频不超过 50 MB。
* 帧率 (FPS)：[24, 60] 

:::

---


content.**role ** `string` `条件必填`
视频的位置或用途。当前仅支持 reference_video：参考视频。


---


**音频信息==^new^==** `object`
输入给模型的音频信息。仅 seedance 2.0&2.0 fast 支持输入音频。
注意不可单独输入音频，应至少包含 1 个参考视频或图片。

属性
content.**type ** `string` %%require%%
输入内容的类型，此处应为`audio_url`。

---


content.**audio_url** ** ** `object` %%require%%
输入给模型的音频对象。

属性
content.audio_url.**url ** `string` %%require%%
音频 URL 、音频 Base64 编码、素材 ID。

* 音频 URL：填入音频的公网 URL。
* Base64 编码：将本地文件转换为 Base64 编码字符串，然后提交给大模型。遵循格式：`data:audio/<音频格式>;base64,<Base64编码>`，注意 `<音频格式>` 需小写，如 `data:audio/wav;base64,{base64_audio}`。
* 素材 ID：用于视频生成的虚拟人的音频素材 ID，遵循格式：asset://<ASSET_ID\>。可从[素材&虚拟人像库](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision?modelId=doubao-seedance-2-0-260128)获取。

:::tip 传入单个音频要求

* 格式：wav、mp3
* 时长：单个音频时长 [2, 15] s，最多传入 3 段参考音频，所有音频总时长不超过 15 s。
* 大小：单个音频不超过 15 MB，请求体大小不超过 64 MB。大文件请勿使用Base64编码。



:::

---


content.**role ** `string` `条件必填`
音频的位置或用途。当前仅支持 reference_audio：参考音频。



---


**样片信息 **  `object`
基于样片任务 ID，生成正式视频。仅 seedance 1.5 pro 支持该功能。[阅读](https://www.volcengine.com/docs/82379/1366799?lang=zh#5acd28c8)[文档](https://www.volcengine.com/docs/82379/1366799?lang=zh#5acd28c8) 获取 draft 功能的使用教程和注意事项。

属性

---


content.**type ** `string` %%require%%
输入内容的类型，此处应为 `draft_task`。

---


content.**draft_task** ** ** `object` %%require%%
输入给模型的样片任务。

属性

---


content.draft_task.**id ** `string` %%require%%
样片任务 ID。平台将自动复用 Draft 视频使用的用户输入（**model、** content.**text、** content.**image_url、generate_audio、seed、ratio、duration、camera_fixed ** ），生成正式视频。其余参数支持指定，不指定将使用本模型的默认值。
使用分为两步：Step1: 调用本接口生成 Draft 视频。Step2: 如果确认 Draft 视频符合预期，可基于 Step1 返回的 Draft 视频任务 ID，调用本接口生成最终视频。[阅读文档](https://www.volcengine.com/docs/82379/1366799?lang=zh#5acd28c8) 获取详细教程。




---


**callback_url** `string` 
填写本次生成任务结果的回调通知地址。当视频生成任务有状态变化时，方舟将向此地址推送 POST 请求。
回调请求内容结构与[查询任务API](https://www.volcengine.com/docs/82379/1521309)的返回体一致。
回调返回的 status 包括以下状态：

* queued：排队中。
* running：任务运行中。
* succeeded： 任务成功。（如发送失败，即5秒内没有接收到成功发送的信息，回调三次）
* failed：任务失败。（如发送失败，即5秒内没有接收到成功发送的信息，回调三次）
* expired：任务超时，即任务处于**运行中或排队中**状态超过过期时间。可通过 **execution_expires_after ** 字段设置过期时间。


---


**return_last_frame** `boolean` `默认值 false`

* true：返回生成视频的尾帧图像。设置为 `true` 后，可通过 [查询视频生成任务接口](https://www.volcengine.com/docs/82379/1521309) 获取视频的尾帧图像。尾帧图像的格式为 png，宽高像素值与生成的视频保持一致，无水印。
   使用该参数可实现生成多个连续视频：以上一个生成视频的尾帧作为下一个视频任务的首帧，快速生成多个连续视频，调用示例详见 [教程](https://www.volcengine.com/docs/82379/1366799?lang=zh#141cf7fa)。
* false：不返回生成视频的尾帧图像。


---


**service_tier** `string` `默认值 default`
> 不支持修改已提交任务的服务等级
> seedance 2.0 & 2.0 fast 不支持离线推理

指定处理本次请求的服务等级类型，枚举值：

* default：在线推理模式，RPM 和并发数配额较低（详见 [模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh#2705b333)），适合对推理时效性要求较高的场景。
* flex：离线推理模式，TPD 配额更高（详见 [模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh#2705b333)），价格为在线推理的 50%， 适合对推理时延要求不高的场景。


---


**execution_expires_after ** `integer` `默认值 172800`
任务超时阈值。指定任务提交后的过期时间（单位：秒），从 **created at** 时间戳开始计算。默认值 172800 秒，即 48 小时。取值范围：[3600，259200]。
不论使用哪种 **service_tier**，都建议根据业务场景设置合适的超时时间。超过该时间后任务会被自动终止，并标记为`expired`状态。

---


**generate_audio ** `boolean` `默认值 true`
> 仅 seedance 2.0 & 2.0 fast、seedance 1.5 pro 支持

控制生成的视频是否包含与画面同步的声音。

* true：模型输出的视频包含同步音频。模型会基于文本提示词与视觉内容，自动生成与之匹配的人声、音效及背景音乐。建议将对话部分置于双引号内，以优化音频生成效果。例如：男人叫住女人说：“你记住，以后不可以用手指指月亮。”
* false：模型输出的视频为无声视频。

:::warning
生成的有声视频均为单声道，和传入的音频声道数无关。

:::
---


**draft ** `boolean` `默认值 false`
> 仅 seedance 1.5 pro 支持

控制是否开启样片模式。[阅读文档](https://www.volcengine.com/docs/82379/1366799?lang=zh#5acd28c8) 获取使用教程和注意事项。

* true：开启样片模式，生成一段预览视频，快速验证场景结构、镜头调度、主体动作与 prompt 意图是否符合预期。消耗 token 数较正常视频更少，使用成本更低。
* false：关闭样片模式，正常生成一段视频。

:::tip
开启样片模式后，将使用 480p 分辨率生成 Draft 视频（使用其他分辨率会报错），不支持返回尾帧功能，不支持离线推理功能。

:::
---


**tools==^new^==** ** ** `object[]` 
> 仅 seedance 2.0 & 2.0 fast 支持

配置模型要调用的工具。

属性
tools.**type ** `string`
指定使用的工具类型。

* web_search：联网搜索工具。[阅读教程](https://www.volcengine.com/docs/82379/1366799?lang=zh#c40ed3ef) 获取详细代码示例。

:::tip

* 开启联网搜索后，模型会根据用户的提示词自主判断是否搜索互联网内容（如商品、天气等）。可提升生成视频的时效性，但也会增加一定的时延。
* 实际搜索次数可通过 [查询视频生成任务 API](https://www.volcengine.com/docs/82379/1521309?lang=zh) 返回的 usage.tool_usage.**web_search** 字段获取，如果为 0 表示未搜索。

:::

---


**safety_identifier==^new^==** `string`
终端用户的唯一标识符，用于协助平台检测您的应用中可能违反火山方舟使用政策的用户。该标识符为英文字符串，需保证对单个用户固定且唯一，长度不超过 64 个字符。推荐传入对用户名、用户 ID 或邮箱进行哈希处理后生成的字符串，避免泄露用户隐私信息。

---


&nbsp;
:::warning 部分参数升级说明

* **对于 resolution、ratio、duration、frames、seed、camera_fixed、watermark 参数，平台升级了参数传入方式，示例如下。所有模型依然兼容支持旧方式。** 
* 不同模型，可能对应支持不同的参数与取值，详见 [输出视频格式](https://www.volcengine.com/docs/82379/1366799?lang=zh#9fe4cce0)。当输入的参数或取值不符合所选的模型时，该参数将被忽略或触发报错：
   * 新方式：在 request body 中直接传入参数。此方式为**强校验，** 若参数填写错误，模型会返回错误提示。 
   * 旧方式：在文本提示词后追加 \-\-[parameters]。此方式为**弱校验，** 若参数填写错误，该参数将被忽略或触发报错。


:::
**新方式（推荐）：在 request body 中直接传入参数**
```JSON
... 
   // Specify the aspect ratio of the generated video as 16:9, duration as 5 seconds, resolution as 720p, seed as 11, and include a watermark. The camera is not fixed. 
    "model": "doubao-seedance-1-5-pro-251215", 
    "content": [ 
        { 
            "type": "text", 
            "text": "小猫对着镜头打哈欠" 
        } 
    ], 
    // All parameters must be written in full; abbreviations are not supported 
    "resolution": "720p", 
    "ratio":"16:9", 
    "duration": 5, 
    // "frames": 29, Either duration or frames is required 
    "seed": 11, 
    "camera_fixed": false, 
    "watermark": true 
... 
```




**旧方式：在文本提示词后追加 \-\-[parameters]** 
```JSON
... 
   // Specify the aspect ratio of the generated video as 16:9, duration as 5 seconds, resolution as 720p, seed as 11, and include a watermark. The camera is not fixed. 
    "model": "doubao-seedance-1-5-pro-251215", 
    "content": [ 
        { 
            "type": "text", 
            "text": "小猫对着镜头打哈欠 --rs 720p --rt 16:9 --dur 5 --seed 11 --cf false --wm true"
            // "text": "小猫对着镜头打哈欠 --resolution 720p --ratio 16:9 --duration 5 --seed 11 --camerafixed false --watermark true"
        } 
    ]
... 
```




---


**resolution **  `string` 
> seedance 2.0 & 2.0 fast、seedance 1.5 pro、seedance 1.0 lite 默认值：`720p`
> seedance 1.0 pro & pro\-fast 默认值：`1080p`

视频分辨率，枚举值：

* 480p
* 720p
* 1080p：seedance 1.0 lite 参考图场景、seedance 2.0 fast 不支持


---


**ratio ** `string` 
> seedance 2.0 & 2.0 fast、seedance 1.5 pro 默认值为 `adaptive`
> seedance 1.0 lite 参考图场景默认值为 `16:9`
> 其他模型：文生视频默认值 `16:9`，图生视频默认值 `adaptive`

生成视频的宽高比例。不同宽高比对应的宽高像素值见下方表格。

* 16:9 
* 4:3
* 1:1
* 3:4
* 9:16
* 21:9
* adaptive：根据输入自动选择最合适的宽高比（详见下文说明）

:::warning **adaptive ** 适配规则
当配置 **ratio** 为 `adaptive` 时，模型会根据生成场景自动适配宽高比；实际生成的视频宽高比可通过 [查询视频生成任务 API](https://www.volcengine.com/docs/82379/1521309?lang=zh) 返回的 **ratio** 字段获取。
**支持模型：** 

* seedance 2.0 & 2.0 fast、seedance 1.5 Pro 支持
* 其他模型仅图生视频场景支持，注意 seedance 1.0 lite 参考图场景不支持。

**取值规则：** 

* 文生视频：根据输入的提示词，智能选择最合适的宽高比。
* 首帧 / 首尾帧生视频：根据上传的首帧图片比例，自动选择最接近的宽高比。
* 多模态参考生视频：根据用户提示词意图判断，如果是首帧生视频/编辑视频/延长视频，以该图片/视频为准选择最接近的宽高比；否则，以传入的第一个媒体文件为准（优先级：视频＞图片）选择最接近的宽高比。

:::
&nbsp;

不同宽高比对应的宽高像素值
Note：图生视频，选择的宽高比与您上传的图片宽高比不一致时，方舟会对您的图片进行裁剪，裁剪时会居中裁剪，详细规则见 [图片裁剪规则](https://www.volcengine.com/docs/82379/1366799?lang=zh#f76aafc8)。

|分辨率 |宽高比|宽高像素值|宽高像素值|\
| | |seedance 1.0 系列 |seedance 1.5 pro|\
|                                                       |      |           | seedance 2.0 & 2.0 fast |
| ----------------------------------------------------- | ---- | --------- | ----------------------- |
| 480p                                                  | 16:9 | 864×480   | 864×496                 |
| ^^                                                    | 4:3  | 736×544   | 752×560                 |
| ^^                                                    | 1:1  | 640×640   | 640×640                 |
| ^^                                                    | 3:4  | 544×736   | 560×752                 |
| ^^                                                    | 9:16 | 480×864   | 496×864                 |
| ^^                                                    | 21:9 | 960×416   | 992×432                 |
| 720p                                                  | 16:9 | 1248×704  | 1280×720                |
| ^^                                                    | 4:3  | 1120×832  | 1112×834                |
| ^^                                                    | 1:1  | 960×960   | 960×960                 |
| ^^                                                    | 3:4  | 832×1120  | 834×1112                |
| ^^                                                    | 9:16 | 704×1248  | 720×1280                |
| ^^                                                    | 21:9 | 1504×640  | 1470×630                |
| 1080p                                                 | 16:9 | 1920×1088 | 1920×1080               | \ |
| > 1.0 lite 参考图场景不支持，seedance 2.0 fast 不支持 |      |           |                         |
| ^^                                                    | 4:3  | 1664×1248 | 1664×1248               |
| ^^                                                    | 1:1  | 1440×1440 | 1440×1440               |
| ^^                                                    | 3:4  | 1248×1664 | 1248×1664               |
| ^^                                                    | 9:16 | 1088×1920 | 1080×1920               |
| ^^                                                    | 21:9 | 2176×928  | 2206×946                |




---


**duration** `integer` `默认值 5` 
> duration 和 frames 二选一即可，frames 的优先级高于 duration。如果您希望生成整数秒的视频，建议指定 duration。

生成视频时长，仅支持整数，单位：秒。

* seedance 1.0 pro、seedance 1.0 pro fast、seedance 1.0 lite: [2, 12] s。
* seedance 1.5 pro: [4,12] 或设置为`-1`
* seedance 2.0 & 2.0 fast:  [4,15] 或设置为`-1`

:::warning
seedance 2.0 & 2.0 fast、seedance 1.5 pro 支持两种配置方法

   * 指定具体时长：支持有效范围内的任一整数。
   * 智能指定：设置为 `-1`，表示由模型在有效范围内自主选择合适的视频长度（整数秒）。实际生成视频的时长可通过 [查询视频生成任务 API](https://www.volcengine.com/docs/82379/1521309?lang=zh) 返回的 **duration** 字段获取。注意视频时长与计费相关，请谨慎设置。


:::
---


**frames** `integer` 
> seedance 2.0 & 2.0 fast、seedance 1.5 pro 暂不支持
> duration 和 frames 二选一即可，frames 的优先级高于 duration。如果您希望生成小数秒的视频，建议指定 frames。

生成视频的帧数。通过指定帧数，可以灵活控制生成视频的长度，生成小数秒的视频。
由于 frames 的取值限制，仅能支持有限小数秒，您需要根据公式推算最接近的帧数。

* 计算公式：帧数 = 时长 × 帧率（24）。
* 取值范围：支持 [29, 289] 区间内所有满足 `25 + 4n` 格式的整数值，其中 n 为正整数。

例如：假设需要生成 2.4 秒的视频，帧数=2.4×24=57.6。由于 frames 不支持 57.6，此时您只能选择一个最接近的值。根据 25+4n 计算出最接近的帧数为 57，实际生成的视频为 57/24=2.375 秒。

---


**seed** `integer` `默认值 -1` 
种子整数，用于控制生成内容的随机性。
取值范围：[\-1, 2^32\-1]之间的整数。
:::warning

* 相同的请求下，模型收到不同的seed值，如：不指定seed值或令seed取值为\-1（会使用随机数替代）、或手动变更seed值，将生成不同的结果。
* 相同的请求下，模型收到相同的seed值，会生成类似的结果，但不保证完全一致。


:::
---


**camera_fixed** `boolean` `默认值 false` 
> 参考图场景不支持，seedance 2.0 & 2.0 fast 暂不支持

是否固定摄像头。枚举值：

* true：固定摄像头。平台会在用户提示词中追加固定摄像头，实际效果不保证。
* false：不固定摄像头。


---


**watermark** `boolean` `默认值 false` 
生成视频是否包含水印。枚举值：

* false：不含水印。
* true：含有水印。


---


<span id="oCS1tULg"></span>
## 响应参数
> 跳转 [请求参数](#RxN8G2nH)

**id ** `string`
视频生成任务 ID 。仅保存 7 天（从 **created at** 时间戳开始计算），超时后将自动清除。

* 设置`"draft": true`，为 Draft 视频任务 ID。
* 设置 `"draft": false`，为正常视频任务 ID。

创建视频生成任务为异步接口，获取 ID 后，需要通过 [查询视频生成任务 API](https://www.volcengine.com/docs/82379/1521309) 来查询视频生成任务的状态。任务成功后，会输出生成视频的`video_url`。


`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`  [运行](https://api.volcengine.com/api-explorer/?action=GetContentsGenerationsTask&data=%7B%22id%22%3A%22cgt-20250331175019-68d9t%22%7D&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&query=%7B%7D&serviceCode=ark&version=2024-01-01)
查询视频生成任务的状态。
:::tip
仅支持查询最近 7 天的历史数据。时间计算统一采用UTC时间戳，返回的7天历史数据范围以用户实际发起查询请求的时刻为基准（精确到秒），时间戳区间为 [T\-7天, T)。

:::
```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="fq9yXaKY"><RenderMd content={` [ ](#)[体验中心](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1099320#%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90%E6%A8%A1%E5%9E%8B)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[调用教程](https://www.volcengine.com/docs/82379/1366799)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span>[接口文档](https://www.volcengine.com/docs/82379/1521309)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_1609c71a747f84df24be1e6421ce58f0.png =20x) </span>[常见问题](https://www.volcengine.com/docs/82379/1359411)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="3vCxpwty"><RenderMd content={`本接口支持 API Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="RxN8G2nH"></span>
## 请求参数 
> 跳转 [响应参数](#7mi8G8RI)


---


**id** `string` %%require%%
您需要查询的视频生成任务的 ID 。
:::tip
上面参数为Query String Parameters，在URL String中传入。

:::
---


&nbsp;
<span id="7mi8G8RI"></span>
## 响应参数
> 跳转 [请求参数](#RxN8G2nH)


---


**id ** `string`
视频生成任务 ID 。

---


**model** `string`
任务使用的模型名称和版本，`模型名称-版本`。

---


**status** `string`
任务状态，以及相关的信息：

* `queued`：排队中。
* `running`：任务运行中。
* `cancelled`：取消任务，取消状态24h自动删除（只支持排队中状态的任务被取消）。
* `succeeded`： 任务成功。
* `failed`：任务失败。
* `expired`：任务超时。


---


**error** `object / null`
错误提示信息，任务成功返回`null`，任务失败时返回错误数据，错误信息具体参见 [错误处理](https://www.volcengine.com/docs/82379/1299023#.5pa56Iif6ZSZ6K-v56CB)。

属性

---


error.**code** `string`
错误码。

---


error.**message** `string`
错误提示信息。


---


**created_at** `integer`
任务创建时间的 Unix 时间戳（秒）。

---


**updated_at** `integer`
任务当前状态更新时间的 Unix 时间戳（秒）。

---


**content** `object`
视频生成任务的输出内容。

属性

---


content.**video_url** `string`
生成视频的 URL，格式为 mp4。为保障信息安全，生成的视频会在24小时后被清理，请及时转存。
推荐配置火山引擎 TOS 提供的数据订阅功能，将您的模型推理产物自动转存到自己的 TOS 桶中，便于长期备份或二次加工。详细介绍请参见 [TOS 数据订阅](https://www.volcengine.com/docs/6349/2280949?lang=zh)。
content.**last_frame_url ** `string`
视频的尾帧图像 URL。有效期为 24小时，请及时转存。
说明：[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时设置 `"return_last_frame": true` 时，会返回该参数。


---


**seed** `integer`
本次请求使用的种子整数值。

---


**resolution **  `string` 
生成视频的分辨率。

---


**ratio ** `string`
生成视频的宽高比。

---


**duration** `integer` 
生成视频的时长，单位：秒。
说明：**duration 和 frames 参数只会返回一个**。[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时未指定 frames，会返回 duration。

---


**frames** `integer`  
生成视频的帧数。
说明：**duration 和 frames 参数只会返回一个**。[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时指定了 frames，会返回 frames。

---


**framespersecond**  `integer` 
生成视频的帧率。

---


**generate_audio** `boolean`
生成的视频是否包含与画面同步的声音。仅 seedance 2.0 & 2.0 fast、seedance 1.5 pro 会返回该参数。

* `true`：模型输出的视频包含同步音频。
* `false`：模型输出的视频为无声视频。


---


**tools==^new^==** ** ** `object[]` 
本次请求模型实际使用的工具。未使用工具时不返回。

属性
tools.**type ** `string`
实际使用的工具类型

* web_search：联网搜索工具。


---


**safety_identifier==^new^==** `string`
终端用户的唯一标识符。若 [创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时设置了该参数，接口会原样返回此信息。

---


**draft** `boolean`
生成的视频是否为 Draft 视频。仅 seedance 1.5 pro 会返回该参数。

* `true`：表示当前输出为 Draft 视频。
* `false`：表示当前输出为正常视频。


---


**draft_task_id ** `string`
Draft 视频任务 ID。基于 Draft 视频生成正式视频时，会返回该参数。

---


**service_tier  ** `string`
实际处理任务使用的服务等级。

---


**execution_expires_after** ** ** `integer`
任务超时阈值，单位：秒。

---


**usage** `object`
本次请求的 token 用量。

属性

---


usage.**completion_tokens** `integer`
模型输出视频花费的 token 数量，可作为计费对账依据。
:::tip
seedance 2.0 系列模型存在最低 token 用量限制，如果实际 token 用量 ＜ 最低 token 用量，本字段会返回最低 token 用量，平台按最低 token 用量计费。

:::
---


usage.**total_tokens** `integer`
本次请求消耗的总 token 数量。视频生成模型不统计输入 token，输入 token 为 0，故 **total_tokens**=**completion_tokens**。

---


usage.**tool_usage==^new^==** ** ** `object`
使用工具的用量信息。

属性
usage.tool_usage.**web_search ** `integer`
实际调用联网搜索工具的次数，仅开启联网搜索时返回。



`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks?page_num={page_num}&page_size={page_size}&filter.status={filter.status}&filter.task_ids={filter.task_ids}&filter.model={filter.model}`  [运行](https://api.volcengine.com/api-explorer/?action=ListContentsGenerationsTasks&data=%7B%7D&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&query=%7B%7D&serviceCode=ark&version=2024-01-01)
当您要查询符合条件的任务，您可以传入条件筛选参数，返回符合要求的任务。
:::tip
仅支持查询最近 7 天的历史数据。时间计算统一采用UTC时间戳，返回的7天历史数据范围以用户实际发起批量查询请求的时刻为基准（精确到秒），时间戳区间为 [T\-7天, T)。

:::
```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="opV4RT2k"><RenderMd content={` [ ](#)[体验中心](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1099320#%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90%E6%A8%A1%E5%9E%8B)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[调用教程](https://www.volcengine.com/docs/82379/1366799)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span>[接口文档](https://www.volcengine.com/docs/82379/1521675)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_1609c71a747f84df24be1e6421ce58f0.png =20x) </span>[常见问题](https://www.volcengine.com/docs/82379/1359411)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="CPeW5vNl"><RenderMd content={`本接口支持 API Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="RxN8G2nH"></span>
## 请求参数 
> 跳转 [响应参数](#7mi8G8RI)

:::tip
下面参数为Query String Parameters，在URL String中传入。

:::
---


**page_num** `integer / null` 
取值范围：[1, 500]
返回结果的页码。

---


**page_size ** `integer / null`
取值范围：[1, 500]
返回结果的每页的结果数量。

---


**filter.status ** `string / null`
过滤参数，查询某个任务状态。

* `queued`：排队中的任务。
* `running`：运行中任务。
* `cancelled`：取消的任务。
* `succeeded`： 成功的任务。
* `failed`：失败的任务。


---


**filter.task_ids ** `string[] / null`
视频生成任务 ID，精确搜索，支持同时搜索多个任务 ID。多个任务 ID 之间通过 `&`连接。示例：`filter.task_ids=id1&filter.task_ids=id2`。

---


**filter.model ** `string / null`
与返回参数不同，该字段为任务使用的推理接入点 ID，精确搜索。

---


**filter.service_tier ** `string / null` `默认值 default`
 处理任务使用的服务等级。

* `default`：在线推理模式
* `flex`：离线推理模式

<span id="7mi8G8RI"></span>
## 响应参数
> 跳转 [请求参数](#RxN8G2nH)


---


**items ** `object[]`
查询到的视频生成任务列表。

属性

---


items.**id ** `string`
视频生成任务 ID 。

---


items.**model** `string`
任务使用的模型名称和版本，`模型名称-版本`。

---


items.**status** `string`
任务状态，以及相关的信息：

* `queued`：排队中。
* `running`：任务运行中。
* `cancelled`：取消任务（只支持排队中状态的任务被取消）。
* `succeeded`： 任务成功。
* `failed`：任务失败。
* `expired`：任务超时。


---


items.**error** `object / null`
错误提示信息，任务成功返回`null`，任务失败时返回错误数据，错误信息具体参见 [错误处理](https://www.volcengine.com/docs/82379/1393047#653d2c40)。

属性

---


error.**code** `string`
错误码。

---


error.**message** `string`
错误提示信息。


---


items.**created_at** `integer`
任务创建时间的 Unix 时间戳（秒）。

---


items.**updated_at** `integer`
任务当前状态更新时间的 Unix 时间戳（秒）。

---


items.**content** `object`
当视频生成任务完成，会输出该字段，包含生成视频下载的 URL。

属性

---


content.**video_url** `string`
生成视频的URL。为保障信息安全，生成的视频会在24小时后被清理，请及时转存。

---


content.**last_frame_url ** `string`
视频的尾帧图像 URL。有效期为 24小时，请及时转存。
说明：[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时设置 `"return_last_frame": true` 时，会返回参数。


---


items.**seed** `integer`
本次请求使用的种子整数值。

---


items.**resolution **  `string` 
生成视频的分辨率。

---


items.**ratio ** `string`
生成视频的宽高比。

---


items.**duration** `integer` 
生成视频的时长，单位：秒。
说明：**duration 和 frames 参数只会返回一个**。[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时未指定 frames，会返回 duration。

---


items.**frames ** `integer`  
生成视频的帧数。
说明：**duration 和 frames 参数只会返回一个**。[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时指定了 frames，会返回 frames。

---


items.**framespersecond**  `integer` 
生成视频的帧率。

---


items.**generate_audio** `boolean`
生成的视频是否包含与画面同步的声音。仅 seedance 2.0 & 2.0 fast、seedance 1.5 pro 会返回该参数。

* `true`：模型输出的视频包含同步音频。
* `false`：模型输出的视频为无声视频。


---


items.**tools==^new^==** ** ** `object[]` 
本次请求模型实际使用的工具。未使用工具时不返回。

属性
items.tools.**type ** `string`
实际使用的工具类型

* web_search：联网搜索工具。


---


items.**safety_identifier==^new^==** `string`
终端用户的唯一标识符。若 [创建视频生成任务](https://www.volcengine.com/docs/82379/1520757) 时设置了该参数，接口会原样返回此信息。

---


items.**draft** `boolean`
生成的视频是否为 Draft 视频。仅 seedance 1.5 pro 会返回该参数。

* `true`：表示当前输出为 Draft 视频。
* `false`：表示当前输出为正常视频。


---


items.**draft_task_id ** `string`
Draft 视频任务 ID。基于 Draft 视频生成正式视频时，会返回该参数。

---


items.**service_tier ** `string`
实际处理任务使用的服务等级。

---


items.**execution_expires_after** ** ** `integer`
任务超时阈值，单位：秒。

---


items.**usage** `object`
本次请求的 token 用量。

属性

---


items.usage.**completion_tokens** `integer`
模型输出视频花费的 token 数量，可作为计费对账依据。
:::tip
seedance 2.0 系列模型存在最低 token 用量限制，如果实际 token 用量 ＜ 最低 token 用量，本字段会返回最低 token 用量，平台按最低 token 用量计费。

:::
---


items.usage.**total_tokens**`integer`
本次请求消耗的总 token 数量。视频生成模型不统计输入 token，输入 token 为 0，故 **total_tokens**=**completion_tokens**。

---


items.usage.**tool_usage==^new^==** ** ** `object`
使用工具的用量信息。

属性
items.usage.tool_usage.**web_search ** `integer`
实际调用联网搜索工具的次数，仅开启联网搜索时返回。





---


**total ** `integer`
符合筛选条件的任务数量。


`DELETE https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`  [运行](https://api.volcengine.com/api-explorer/?action=DeleteContentsGenerationsTasks&data=%7B%22id%22%3A%22cgt-20250331175019-68d9t%22%7D&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&query=%7B%7D&serviceCode=ark&version=2024-01-01)
取消排队中的视频生成任务，或者删除视频生成任务记录。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="vI631gwS"><RenderMd content={` [ ](#)[体验中心](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1099320#%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90%E6%A8%A1%E5%9E%8B)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[调用教程](https://www.volcengine.com/docs/82379/1366799)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span>[接口文档](https://www.volcengine.com/docs/82379/1521675)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_1609c71a747f84df24be1e6421ce58f0.png =20x) </span>[常见问题](https://www.volcengine.com/docs/82379/1359411)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="L8aMwmZD"><RenderMd content={`本接口支持 API Key 鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="RxN8G2nH"></span>
## 请求参数 
> 跳转 [响应参数](#7mi8G8RI)

:::tip
下面参数为Query String Parameters，在URL String中传入。

:::
---


**id** `string` %%require%%
需要取消或者删除的视频生成任务。
任务状态不同，调用`DELETE`接口，执行的操作有所不同，具体说明如下：

| 当前任务状态 | 是否支持DELETE操作 | 操作含义                                  | DELETE操作后任务状态 |
| ------------ | ------------------ | ----------------------------------------- | -------------------- |
| queued       | 是                 | 任务取消排队，任务状态被变更为cancelled。 | cancelled            |
| running      | 否                 | \-                                        | \-                   |
| succeeded    | 是                 | 删除视频生成任务记录，后续将不支持查询。  | \-                   |
| failed       | 是                 | 删除视频生成任务记录，后续将不支持查询。  | \-                   |
| cancelled    | 否                 | \-                                        | \-                   |
| expired      | 是                 | 删除视频生成任务记录，后续将不支持查询。  | \-                   |


---


<span id="7mi8G8RI"></span>
## 响应参数
> 跳转 [请求参数](#RxN8G2nH)

本接口无返回参数。

`POST https://ark.cn-beijing.volces.com/api/v3/images/generations` [运行](https://api.volcengine.com/api-explorer/?action=ImageGenerations&groupName=%E5%9B%BE%E7%89%87%E7%94%9F%E6%88%90API&serviceCode=ark&version=2024-01-01&tab=2#N4IgTgpgzgDg9gOyhA+gMzmAtgQwC4gBcIArmADYgA0IUAlgF4REgBMA0tSAO74TY4wAayJoc5ZDSxwAJhErEZcEgCMccALTIIMyDiwaALBoAMG1gFYTADlbWuMMHCwwCxQPhmgUTTA-l6Ao2MAw-4CLeYB4tkHBgDOJgE2KgF+KgABygGHxgNf6gPSmgN2egCwegHEegCFugLCagCfKgOhKgGbx-oBFRoBjkYCTkZGA34qA2Ur+gKyugI76gOSagOJO-oDU5oCnpoBHphWA+Ib+gBVKI4Cf2oAr1oBOQf5wAMaATHaAy+b+gJKKgP1+gL-xgFRxY4CABoCEVoBTPv6A9maAj7b+gKGxgA3OgHnagNxygJJy-peAuyH+gNyugEbpgFgJgHH4wBjfoBvQOygAY5QAz2tkZoBLfUAQjqAQmtAIoagAIEp6AZXlAHBygC51c7+QAUsUNAPjuD38gHSzQKAOYzADMB52y6xagAlTQA55oBSELR0UA2DaAF7V-IAXU0xgB9FQDuioAvIMA9OaAbz1AM8GI0AHJqAAn1soB-PUAS5GAeASKmz-IAAAPW-kAs8qAEB1-IBA80AL4GMlr+QBc+oBUfUagDwVQA2aiAAL5AA)
本文介绍图片生成模型如 Seedream 5.0 lite 的调用 API ，包括输入输出参数，取值范围，注意事项等信息，供您使用接口时查阅字段含义。

**不同模型支持的图片生成能力简介**

* **doubao seedream 5.0 lite==^new^==** **、doubao seedream 4.5/4.0**
   * 生成组图（组图：基于您输入的内容，生成的一组内容关联的图片；需配置 **sequential_image_generation ** 为`auto` **）** 
      * 多图生组图，根据您输入的 **++多张参考图片（2\-14）++ **  +++文本提示词++ 生成一组内容关联的图片（输入的参考图数量+最终生成的图片数量≤15张）。
      * 单图生组图，根据您输入的 ++单张参考图片+文本提示词++ 生成一组内容关联的图片（最多生成14张图片）。
      * 文生组图，根据您输入的 ++文本提示词++ 生成一组内容关联的图片（最多生成15张图片）。
   * 生成单图（配置 **sequential_image_generation ** 为`disabled` **）** 
      * 多图生图，根据您输入的 **++多张参考图片（2\-14）++ **  +++文本提示词++ 生成单张图片。
      * 单图生图，根据您输入的 ++单张参考图片+文本提示词++ 生成单张图片。
      * 文生图，根据您输入的 ++文本提示词++ 生成单张图片。
* **doubao** ** ** **seedream** ** ** **3.0** ** ** **t2i**
   * 文生图，根据您输入的 ++文本提示词++ 生成单张图片。

&nbsp;

```mixin-react
return (<Tabs>
<Tabs.TabPane title="鉴权说明" key="oOTdY3Sn"><RenderMd content={`本接口仅支持 API Key 鉴权，请在 [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面，获取长效 API Key。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="快速入门" key="HHCpvO5jKo"><RenderMd content={` [ ](#)[体验中心](https://console.volcengine.com/ark/region:ark+cn-beijing/experience/vision?type=GenImage)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh#d3e5e0eb)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1544106?lang=zh#457edfd0)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[调用教程](https://www.volcengine.com/docs/82379/1548482)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span>[接口文档](https://www.volcengine.com/docs/82379/1666945)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_1609c71a747f84df24be1e6421ce58f0.png =20x) </span>[常见问题](https://www.volcengine.com/docs/82379/1359411)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="7thx2dVa"></span>
## 请求参数 
<span id="BFVUvDi6"></span>
### 请求体

---


**model** `string` %%require%%
您需要调用的模型的 ID （Model ID），[开通模型服务](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)，并[查询 Model ID](https://www.volcengine.com/docs/82379/1330310) 。
您也可通过 Endpoint ID 来调用模型，获得限流、计费类型（前付费/后付费）、运行状态查询、监控、安全等高级能力，可参考[获取 Endpoint ID](https://www.volcengine.com/docs/82379/1099522)。

---


**prompt ** `string` %%require%%
用于生成图像的提示词，支持中英文。（查看提示词指南：[Seedream 4.0](https://www.volcengine.com/docs/82379/1829186) 、[Seedream 3.0](https://www.volcengine.com/docs/82379/1795150)）
建议不超过300个汉字或600个英文单词。字数过多信息容易分散，模型可能因此忽略细节，只关注重点，造成图片缺失部分元素。

---


**image** `string/array` 
> doubao\-seedream\-3.0\-t2i 不支持该参数

输入的图片信息，支持 URL 或 Base64 编码。其中，doubao\-seedream\-5.0\-lite/4.5/4.0 支持单图或多图输入（[查看多图融合示例](https://www.volcengine.com/docs/82379/1824121?lang=zh#4a35e28f)）。

* 图片URL：请确保图片URL可被访问。
* Base64编码：请遵循此格式`data:image/<图片格式>;base64,<Base64编码>`。注意 `<图片格式>` 需小写，如 `data:image/png;base64,<base64_image>`。

:::tip

* 传入单张图片要求：
   * 图片格式：jpeg、png（doubao\-seedream\-5.0\-lite/4.5/4.0 模型新增支持 webp、bmp、tiff、gif 格式**==^new^==**）
   * 宽高比（宽/高）范围：
      * [1/16, 16] (适用模型：doubao\-seedream\-5.0\-lite/4.5/4.0）
      * [1/3, 3] (适用模型：doubao\-seedream\-3.0\-t2i）
   * 宽高长度（px） \> 14
   * 大小：不超过 10MB
   * 总像素：不超过 `6000x6000=36000000` px （对单张图宽度和高度的像素乘积限制，而不是对宽度或高度的单独值进行限制）
* doubao\-seedream\-5.0\-lite/4.5/4.0 最多支持传入 14 张参考图。


:::
---


**size **  `string` 

```mixin-react
return (<Tabs>
<Tabs.TabPane title="doubao-seedream-5.0-lite" key="BMB6AP1M"><RenderMd content={`指定生成图像的尺寸信息，支持以下两种方式，不可混用。

* 方式 1 | 指定生成图像的分辨率，并在prompt中用自然语言描述图片宽高比、图片形状或图片用途，最终由模型判断生成图片的大小。
   * 可选值：\`2K\`、\`3K\`、\`4K\`
* 方式 2 | 指定生成图像的宽高像素值：
   * 默认值：\`2048x2048\`
   * 总像素取值范围：[\`2560x1440=3686400\`, \`4096x4096=16777216\`] 
   * 宽高比取值范围：[1/16, 16]

:::tip
采用方式 2 时，需同时满足总像素取值范围和宽高比取值范围。其中，总像素是对单张图宽度和高度的像素乘积限制，而不是对宽度或高度的单独值进行限制。

* **有效示例**：\`3750x1250\`

总像素值 3750x1250=4687500，符合 [3686400, 10404496] 的区间要求；宽高比 3750/1250=3，符合 [1/16, 16] 的区间要求，故该示例值有效。

* **无效示例**：\`1500x1500\`

总像素值 1500x1500=2250000，未达到 3686400 的最低要求；宽高 1500/1500=1，虽符合 [1/16, 16] 的区间要求，但因其未同时满足两项限制，故该示例值无效。
:::
推荐的宽高像素值：

| 分辨率                           | 宽高比 | 宽高像素值 |
| -------------------------------- | ------ | ---------- |
| <div style="text-align: center"> | 1:1    | 2048x2048  | \\ |
| 2K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 4:3    | 2304x1728  |
| ^^                               | 3:4    | 1728x2304  |
| ^^                               | 16:9   | 2848x1600  |
| ^^                               | 9:16   | 1600x2848  |
| ^^                               | 3:2    | 2496x1664  |
| ^^                               | 2:3    | 1664x2496  |
| ^^                               | 21:9   | 3136x1344  |
| <div style="text-align: center"> | 1:1    | 3072x3072  | \\ |
| 3K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 4:3    | 3456x2592  |
| ^^                               | 3:4    | 2592x3456  |
| ^^                               | 16:9   | 4096x2304  |
| ^^                               | 9:16   | 2304x4096  |
| ^^                               | 2:3    | 2496x3744  |
| ^^                               | 3:2    | 3744x2496  |
| ^^                               | 21:9   | 4704x2016  |
| <div style="text-align: center"> | 1:1    | 4096x4096  | \\ |
| 4K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 3:4    | 3520x4704  |
| ^^                               | 4:3    | 4704x3520  |
| ^^                               | 16:9   | 5504x3040  |
| ^^                               | 9:16   | 3040x5504  |
| ^^                               | 2:3    | 3328x4992  |
| ^^                               | 3:2    | 4992x3328  |
| ^^                               | 21:9   | 6240x2656  |


`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="doubao-seedream-4.5" key="kghENadO"><RenderMd content={`指定生成图像的尺寸信息，支持以下两种方式，不可混用。

* 方式 1 | 指定生成图像的分辨率，并在prompt中用自然语言描述图片宽高比、图片形状或图片用途，最终由模型判断生成图片的大小。
   * 可选值：\`2K\`、\`4K\`
* 方式 2 | 指定生成图像的宽高像素值：
   * 默认值：\`2048x2048\`
   * 总像素取值范围：[\`2560x1440=3686400\`, \`4096x4096=16777216\`] 
   * 宽高比取值范围：[1/16, 16]

:::tip
采用方式 2 时，需同时满足总像素取值范围和宽高比取值范围。其中，总像素是对单张图宽度和高度的像素乘积限制，而不是对宽度或高度的单独值进行限制。

* **有效示例**：\`3750x1250\`

总像素值 3750x1250=4687500，符合 [3686400, 16777216] 的区间要求；宽高比 3750/1250=3，符合 [1/16, 16] 的区间要求，故该示例值有效。

* **无效示例**：\`1500x1500\`

总像素值 1500x1500=2250000，未达到 3686400 的最低要求；宽高 1500/1500=1，虽符合 [1/16, 16] 的区间要求，但因其未同时满足两项限制，故该示例值无效。
:::
推荐的宽高像素值：

| 分辨率                           | 宽高比 | 宽高像素值 |
| -------------------------------- | ------ | ---------- |
| <div style="text-align: center"> | 1:1    | 2048x2048  | \\ |
| 2K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 4:3    | 2304x1728  |
| ^^                               | 3:4    | 1728x2304  |
| ^^                               | 16:9   | 2848x1600  |
| ^^                               | 9:16   | 1600x2848  |
| ^^                               | 3:2    | 2496x1664  |
| ^^                               | 2:3    | 1664x2496  |
| ^^                               | 21:9   | 3136x1344  |
| <div style="text-align: center"> | 1:1    | 4096x4096  | \\ |
| 4K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 3:4    | 3520x4704  |
| ^^                               | 4:3    | 4704x3520  |
| ^^                               | 16:9   | 5504x3040  |
| ^^                               | 9:16   | 3040x5504  |
| ^^                               | 2:3    | 3328x4992  |
| ^^                               | 3:2    | 4992x3328  |
| ^^                               | 21:9   | 6240x2656  |


`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="doubao-seedream-4.0" key="MKsftGMr"><RenderMd content={`指定生成图像的尺寸信息，支持以下两种方式，不可混用。

* 方式 1 | 指定生成图像的分辨率，并在prompt中用自然语言描述图片宽高比、图片形状或图片用途，最终由模型判断生成图片的大小。
   * 可选值：\`1K\`、\`2K\`、\`4K\`
* 方式 2 | 指定生成图像的宽高像素值：
   * 默认值：\`2048x2048\`
   * 总像素取值范围：[\`1280x720=921600\`, \`4096x4096=16777216\`] 
   * 宽高比取值范围：[1/16, 16]

:::tip
采用方式 2 时，需同时满足总像素取值范围和宽高比取值范围。其中，总像素是对单张图宽度和高度的像素乘积限制，而不是对宽度或高度的单独值进行限制。

* **有效示例**：\`1600x600\`

总像素值 1600x600=960000，符合 [921600, 16777216] 的区间要求；宽高比 1600/600=8/3，符合 [1/16, 16] 的区间要求，故该示例值有效。

* **无效示例**：\`800x800\`

总像素值 800x800=640000，未达到 921600 的最低要求；宽高 800/800=1，虽符合 [1/16, 16] 的区间要求，但因其未同时满足两项限制，故该示例值无效。
:::
推荐的宽高像素值：

| 分辨率                           | 宽高比 | 宽高像素值 |
| -------------------------------- | ------ | ---------- |
| <div style="text-align: center"> | 1:1    | 1024x1024  | \\ |
| 1K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 4:3    | 1152x864   |
| ^^                               | 3:4    | 864x1152   |
| ^^                               | 16:9   | 1280x720   |
| ^^                               | 9:16   | 720x1280   |
| ^^                               | 3:2    | 1248x832   |
| ^^                               | 2:3    | 832x1248   |
| ^^                               | 21:9   | 1512x648   |
| <div style="text-align: center"> | 1:1    | 2048x2048  | \\ |
| 2K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 4:3    | 2304x1728  |
| ^^                               | 3:4    | 1728x2304  |
| ^^                               | 16:9   | 2848x1600  |
| ^^                               | 9:16   | 1600x2848  |
| ^^                               | 3:2    | 2496x1664  |
| ^^                               | 2:3    | 1664x2496  |
| ^^                               | 21:9   | 3136x1344  |
| <div style="text-align: center"> | 1:1    | 4096x4096  | \\ |
| 4K</div>                         |        |            | \\ |
|                                  |        |            |
| ^^                               | 3:4    | 3520x4704  |
| ^^                               | 4:3    | 4704x3520  |
| ^^                               | 16:9   | 5504x3040  |
| ^^                               | 9:16   | 3040x5504  |
| ^^                               | 2:3    | 3328x4992  |
| ^^                               | 3:2    | 4992x3328  |
| ^^                               | 21:9   | 6240x2656  |


`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="doubao-seedream-3.0-t2i" key="dUuqsxPhNL"><RenderMd content={`指定生成图像的宽高像素值。

* 默认值：\`1024x1024\`
* 单张图片像素取值范围： [\`512x512\`, \`2048x2048\`] 

推荐的宽高像素值：

| 宽高比 | 宽高像素值 |
| ------ | ---------- |
| 1:1    | 1024x1024  |
| 4:3    | 864x1152   |
| 3:4    | 1152x864   |
| 16:9   | 1280x720   |
| 9:16   | 720x1280   |
| 3:2    | 832x1248   |
| 2:3    | 1248x832   |
| 21:9   | 1512x648   |

`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


**seed** `integer`  `默认值 -1`
> 仅 doubao\-seedream\-3.0\-t2i 支持该参数

随机数种子，用于控制模型生成内容的随机性。取值范围为 [\-1, 2147483647]。
:::warning

* 相同的请求下，模型收到不同的seed值，如：不指定seed值或令seed取值为\-1（会使用随机数替代）、或手动变更seed值，将生成不同的结果。
* 相同的请求下，模型收到相同的seed值，会生成类似的结果，但不保证完全一致。


:::
---


**sequential_image_generation** `string` `默认值 disabled`
> 仅 doubao\-seedream\-5.0\-lite/4.5/4.0 支持该参数 | [查看组图输出示例](https://www.volcengine.com/docs/82379/1824121?lang=zh#fc9f85e4)

控制是否关闭组图功能。
:::tip
组图：基于您输入的内容，生成的一组内容关联的图片。

:::
* `auto`：自动判断模式，模型会根据用户提供的提示词自主判断是否返回组图以及组图包含的图片数量。
* `disabled`：关闭组图功能，模型只会生成一张图。


---


**sequential_image_generation_options ** `object`
> 仅 doubao\-seedream\-5.0\-lite/4.5/4.0 支持该参数

组图功能的配置。仅当 **sequential_image_generation ** 为 `auto` 时生效。

属性

---


sequential_image_generation_options.**max_images **  ** ** `integer` `默认值 15`
指定本次请求，最多可生成的图片数量。

* 取值范围： [1, 15]

:::tip
实际可生成的图片数量，除受到 **max_images ** 影响外 **，** 还受到输入的参考图数量影响。**输入的参考图数量+最终生成的图片数量≤15张**。

:::

---


**tools==^new^==** ** **  `array of object`
> 仅 doubao\-seedream\-5.0\-lite 支持该参数

配置模型要调用的工具。

属性

---


tools.**type ** `string`  
指定使用的工具类型。

* `web_search`：联网搜索功能。

:::tip

* 开启联网搜索后，模型会根据用户的提示词自主判断是否搜索互联网内容（如商品、天气等），提升生成图片的时效性，但也会增加一定的时延。
* 实际搜索次数可通过字段 usage.tool_usage.**web_search** 查询，如果为 0 表示未搜索。

:::

---


**stream**  `Boolean` `默认值 false`
> 仅 doubao\-seedream\-5.0\-lite/4.5/4.0 支持该参数 | [查看流式输出示例](https://www.volcengine.com/docs/82379/1824121?lang=zh#e5bef0d7)

控制是否开启流式输出模式。

* `false`：非流式输出模式，等待所有图片全部生成结束后再一次性返回所有信息。
* `true`：流式输出模式，即时返回每张图片输出的结果。在生成单图和组图的场景下，流式输出模式均生效。


---


**guidance_scale **  `Float` 
> doubao\-seedream\-3.0\-t2i 默认值 2.5
> doubao\-seedream\-5.0\-lite/4.5/4.0 不支持

模型输出结果与prompt的一致程度，生成图像的自由度，又称为文本权重；值越大，模型自由度越小，与用户输入的提示词相关性越强。
取值范围：[`1`, `10`] 。

---


**output_format==^new^==**`string` `默认值 jpeg`
> 仅 doubao\-seedream\-5.0\-lite 支持该参数

指定生成图像的文件格式。可选值：

* `png`
* `jpeg`

:::tip
doubao\-seedream\-4.5/4.0、doubao\-seedream\-3.0\-t2i 模型生成图像的文件格式默认为 jpeg，不支持自定义设置。

:::
---


**response_format** `string` `默认值 url`
指定生成图像的返回格式。支持以下两种返回方式：

* `url`：返回图片下载链接；**链接在图片生成后24小时内有效，请及时下载图片。** 
* `b64_json`：以 Base64 编码字符串的 JSON 格式返回图像数据。


---


**watermark**  `Boolean` `默认值 true`
是否在生成的图片中添加水印。

* `false`：不添加水印。
* `true`：在图片右下角添加“AI生成”字样的水印标识。


---


**optimize_prompt_options ** `object` 
> 仅 doubao\-seedream\-5.0\-lite/4.5/4.0 支持该参数

提示词优化功能的配置。

属性
optimize_prompt_options.**mode ** `string`  `默认值 standard`
设置提示词优化功能使用的模式。

* `standard`：标准模式，生成内容的质量更高，耗时较长。
* `fast`：快速模式，生成内容的耗时更短，质量一般；doubao\-seedream\-5.0\-lite/4.5 当前不支持。


---


&nbsp;
<span id="7P96iLnc"></span>
## 响应参数
<span id="Hrya4y9k"></span>
### 流式响应参数
请参见[文档](https://www.volcengine.com/docs/82379/1824137?lang=zh)。
&nbsp;
<span id="1AxnwQZN"></span>
### 非流式响应参数

---


**model** `string`
本次请求使用的模型 ID （`模型名称-版本`）。

---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**data** `array`
输出图像的信息。
:::tip
doubao\-seedream\-5.0\-lite/4.5/4.0 模型生成组图场景下，组图生成过程中某张图生成失败时：

* 若失败原因为审核不通过：仍会继续请求下一个图片生成任务，即不影响同请求内其他图片的生成流程。
* 若失败原因为内部服务异常（500）：不会继续请求下一个图片生成任务。


:::
可能类型
图片信息 `object`
生成成功的图片信息。

属性
data.**url ** `string`
图片的 url 信息，当 **response_format ** 指定为 `url` 时返回。该链接将在生成后 **24 小时内失效**，请务必及时保存图像。
推荐配置火山引擎 TOS 提供的数据订阅功能，将您的模型推理产物自动转存到自己的 TOS 桶中，便于长期备份或二次加工。详细介绍请参见 [TOS 数据订阅](https://www.volcengine.com/docs/6349/2280949?lang=zh)。

---


data.**b64_json** `string`
图片的 base64 信息，当 **response_format ** 指定为 `b64_json` 时返回。

---


data.**size** `string`
> 仅 doubao\-seedream\-5.0\-lite/4.5/4.0 支持该字段。

图像的宽高像素值，格式 `<宽像素>x<高像素>`，如`2048×2048`。


---


错误信息 `object`
某张图片生成失败，错误信息。

属性
data.**error** `object`
错误信息结构体。

属性

---


data.error.**code**
某张图片生成错误的错误码，请参见[错误码](https://www.volcengine.com/docs/82379/1299023)。

---


data.error.**message**
某张图片生成错误的提示信息。




---


**tools**  `array of object` 
本次请求，配置的模型调用工具

属性

---


tools.**type ** `string` 
配置的调用工具类型。

* web_search：联网搜索工具。


---


**usage** `object`
本次请求的用量信息。

属性

---


usage.**generated_images ** `integer`
模型成功生成的图片张数，不包含生成失败的图片。
仅对成功生成图片按张数进行计费。

---


usage.**output_tokens** `integer`
模型生成的图片花费的 token 数量。
计算逻辑为：计算 `sum(图片长*图片宽)/256` ，然后取整。

---


usage.**total_tokens** `integer`
本次请求消耗的总 token 数量。
当前不计算输入 token，故与 **output_tokens** 值一致。

---


usage.**tool_usage ** `object`
使用工具的用量信息。

属性

---


usage.tool_usage.**web_search ** `integer`
调用联网搜索工具次数，仅开启联网搜索时返回。



---


**error**  `object`
本次请求，如发生错误，对应的错误信息。 

属性

---


error.**code** `string` 
请参见[错误码](https://www.volcengine.com/docs/82379/1299023)。

---


error.**message** `string`
错误提示信息

&nbsp;


Doubao\-seedream\-5.0\-lite/4.5/4.0 支持流式输出模式。当您调用图片生成API 并将 **stream** 设置为 `true` 时，服务器会在生成响应的过程中，通过 Server\-Sent Events（SSE）实时向客户端推送事件。本节内容介绍服务器会推送的各类事件。
<span id="ScH1WJFo"></span>
## image_generation.partial_succeeded
> 当前仅  doubao\-seedream\-5.0\-lite/4.5/4.0 支持流式响应。

在流式响应模式下，当任意图片生成成功时返回该事件。

---


<span id="WlFg0rZV"></span>
### 参数说明
**type** `string`
此处应为` image_generation.partial_succeeded`。

---


**model** `string`
本次请求使用的模型 ID ，格式为`<模型名称>-<版本>`。

---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**image_index** `integer`
本次生图请求中，本次事件对应图片在请求中的序号。
从 `0`开始累加，不管生图是否成功，即在` image_generation.partial_succeeded`、`image_generation.partial_failed` 事件，均会自动累加 1。

---


**url ** `string`
本次事件对应图片的下载 URL。当请求中配置字段 **response_format** 为 `url` 时返回。

---


**b64_json ** `string`
本次事件对应图片的 Base64 编码。当请求中配置字段 **response_format** 为 `b64_json` 时返回。

---


**size** `string`
图像的宽高像素值，格式`<宽像素>×<高像素>`，如 `2048×2048`。

---


<span id="NavZ7gku"></span>
### 返回示例
```Shell
{
  "type": "image_generation.partial_succeeded",
  "model": "doubao-seedream-5-0-260128",
  "created": 1589478378,
  "image_index": 0,
  "url": "https://...",
  "size": "2048×2048"
}
```


---


<span id="DvFWgMPz"></span>
## image_generation.partial_failed
> 当前仅  doubao\-seedream\-5.0\-lite/4.5/4.0 支持流式响应。

在流式返回模式下，当任意图片生成失败时返回该事件。

* 若失败原因为审核不通过：仍会继续请求下一个图片生成任务，即不影响同请求内其他图片的生成流程。
* 若失败原因为内部服务异常（500）：不会继续请求下一个图片生成任务。


---


<span id="ECrzr71c"></span>
### 参数说明
**type** `string`
此处应为 `image_generation.partial_failed`。

---


**model** `string`
本次请求使用的模型 ID ，格式为`<模型名称>-<版本>`。

---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**image_index** `integer`
本次生图请求中，本次事件对应图片在请求中的序号。
从 `0`开始累加，不管图片是否生成成功，即在`image_generation.partial_succeeded`、`image_generation.partial_failed` 事件，均会自动累加 1。

---


**error** `object`
本次生图请求中，本次事件对应的错误原因。 

属性

---


error.**code** `string` 
请参见[错误码](https://www.volcengine.com/docs/82379/1299023)。

---


error.**message** `string`
错误提示信息

<span id="UZPzLDle"></span>
### 
<span id="UZPzLDle"></span>
### 返回示例
```Shell
{
  "type": "image_generation.partial_failed",
  "model": "doubao-seedream-5-0-260128",
  "created": 1589478378,
  "image_index": 2,
  "error": {
      "code":"OutputImageSensitiveContentDetected"，
      "message":"The request failed because the output image may contain sensitive information."
  }
}
```


---


<span id="2EAlVxN9"></span>
## image_generation.completed
> 当前仅  doubao\-seedream\-5.0\-lite/4.5/4.0 支持流式响应。

请求的所有图片（无论成功或失败）均处理完毕后返回，是该流式返回的最后一个响应事件。

---


<span id="jTlFAfRr"></span>
### 参数说明
**type** `string`
此处应为 `image_generation.completed`。

---


**model** `string`
本次请求使用的模型 ID ，格式为`<模型名称>-<版本>`。

---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**tools**  `array of object`
本次请求，配置的模型调用工具。

属性

---


tools.**type ** `string` 
配置的调用工具类型。

* web_search：联网搜索工具。


---


**usage** `object`
本次请求的用量信息。

属性

---


usage.**generated_images ** `integer`
模型成功生成的图片张数，不包含生成失败的图片。
仅对成功生成图片按张数进行计费。

---


usage.**output_tokens** `integer`
模型生成的图片花费的 token 数量。
计算逻辑为：计算`sum(图片长*图片宽)/256` ，然后取整。

---


usage.**total_tokens** `integer`
本次请求消耗的总 token 数量。
当前不计算输入 token，故与 **output_tokens** 值一致。

---


usage.**tool_usage ** `object`
使用工具的用量信息。

属性

---


usage.tool_usage.**web_search ** `integer`
调用联网搜索工具次数，仅开启联网搜索时返回。


&nbsp;
<span id="2c1Ftf57"></span>
### 返回示例
```Shell
{
  "type": "image_generation.completed",
  "model": "doubao-seedream-5-0-260128",
  "created": 1589478378,
  "tools": [
         {
             "type": "web_search",
         }
     ],
  "usage": {
      "generated_images": 2,
      "output_tokens": xx,
      "total_tokens": xx,
      "tool_usage":{
        "web_search":1
    }
  }
}
```


---


<span id="9nq19QPQ"></span>
## **error**
> 本次请求如发生错误，对应的错误信息。 


---


<span id="1C2zU5ht"></span>
### 参数说明
**error ** `object`
本次请求错误，返回的错误信息。

属性

---


error.**code** `string` 
请参见[错误码](https://www.volcengine.com/docs/82379/1299023)。

---


error.**message** `string`
错误提示信息。

&nbsp;
<span id="gNZSpgbA"></span>
### 返回示例
```Shell
"error": {
  "code":"BadRequest"，
  "message":"The request failed because it is missing one or multiple required parameters. Request ID: {id}"
}
```

&nbsp;


 ` POST https://ark.cn-beijing.volces.com/api/v3/batch/chat/completions`   [运行](https://api.volcengine.com/api-explorer/?action=BatchChatCompletions&data=%7B%7D&groupName=%E6%89%B9%E9%87%8F%E6%8E%A8%E7%90%86&query=%7B%7D&serviceCode=ark&version=2024-01-01)
本文介绍批量推理调用模型服务的 API 的输入输出参数，供您使用接口时查阅字段含义。通过批量推理您可享受到更高的限流配额以及实惠的价格，适合进行大批量数据处理时使用。
> 推荐的调用方式请见[示例代码](https://www.volcengine.com/docs/82379/1399517#.56S65L6L5Luj56CB)。


```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="ciXkUCsj"><RenderMd content={` <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2abecd05ca2779567c6d32f0ddc7874d.png =20x) </span>[模型列表](https://www.volcengine.com/docs/82379/1399517)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_a5fdd3028d35cc512a10bd71b982b6eb.png =20x) </span>[模型计费](https://www.volcengine.com/docs/82379/1099320#%E6%89%B9%E9%87%8F%E6%8E%A8%E7%90%86)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_afbcf38bdec05c05089d5de5c3fd8fc8.png =20x) </span>[API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span>[开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
 <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span>[调用教程](https://www.volcengine.com/docs/82379/1399517)       <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_1609c71a747f84df24be1e6421ce58f0.png =20x) </span>[常见问题](https://www.volcengine.com/docs/82379/1359411)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="Z8LNYGRm"><RenderMd content={`本接口支持 API Key 与 Access Key鉴权，详见[鉴权认证方式](https://www.volcengine.com/docs/82379/1298459)。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="在线调试" key="kfcnWCOadU"><RenderMd content={`<APILink link="https://api.volcengine.com/api-explorer/?action=BatchChatCompletions&data=%7B%7D&groupName=%E6%89%B9%E9%87%8F%E6%8E%A8%E7%90%86&query=%7B%7D&serviceCode=ark&version=2024-01-01" description="API Explorer 您可以通过 API Explorer 在线发起调用，无需关注签名生成过程，快速获取调用结果。"></APILink>

`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="B2fc2CRV"></span>
## 请求参数
> 跳转 [响应参数](#PM1q4ttH)

<span id="YNs4GyKa"></span>
### 请求体

---


**model** `string` `必选`
通过 Endpoint ID 来调用模型，可参考[获取 Endpoint ID](https://www.volcengine.com/docs/82379/1099522)。

---


**messages**  `object[]` `必选`
到目前为止的对话组成的消息列表。不同模型支持不同类型的消息，如文本、图片、视频等。

消息类型

---


**系统消息** `object`
开发人员提供的指令，模型应遵循这些指令。如模型扮演的角色或者目标等。

属性

---


messages.**role** `string` `必选`
发送消息的角色，此处应为`system`。

---


messages.**content** `string / object[]` `必选`
系统信息内容。

属性

---


**纯文本消息内容** `string`
纯文本消息内容，大语言模型支持传入此类型。

---


**多模态消息内容** `object[]` 
支持文本、图像、视频等类型，视觉理解模型等多模态模型、部分大语言模型支持此字段。

各模态消息部分

---


**文本消息部分** `object`
多模态消息中，内容文本输入。[具备视觉理解能力模型](https://www.volcengine.com/docs/82379/1330310#.6KeG6KeJ55CG6Kej6IO95Yqb)、部分大语言模型支持此类型消息。

属性

---


messages.content.**text ** `string` `必选`
文本消息部分的内容。

---


messages.content.**type ** `string` `必选`
文本消息类型，此次应为 `text`。


---


**图像消息部分** `object`
多模态消息中，图像内容部分。[具备视觉理解能力模型](https://www.volcengine.com/docs/82379/1330310#.6KeG6KeJ55CG6Kej6IO95Yqb)支持此类型消息。

属性

---


messages.content.**image_url ** `object` `必选`
图片消息的内容部分。

属性

---


messages.content.image_url.**url ** `string` `必选`
支持传入图片链接或图片的Base64编码，具体使用请参见[使用说明](https://www.volcengine.com/docs/82379/1362931#.5L2_55So6K-05piO)。

---


messages.content.image_url.**detail ** `string`  `默认值 auto`
支持手动设置图片的质量，取值范围`high`、`low`、`auto`。

* `high`：高细节模式，适用于需要理解图像细节信息的场景，如对图像的多个局部信息/特征提取、复杂/丰富细节的图像理解等场景，理解更全面。
* `low`：低细节模式，适用于简单的图像分类/识别、整体内容理解/描述等场景，理解更快速。
* `auto`：默认模式，不同模型选择的模式略有不同，具体请参见[理解图像的深度控制](https://www.volcengine.com/docs/82379/1362931#bf4d9224)。


---


messages.content.**type ** `string` `必选`
图像消息类型，此次应为 `image_url`。


---


**视频消息部分**
> 视频理解模型请参见 [视频理解模型](https://www.volcengine.com/docs/82379/1330310#.6KeG6KeJ55CG6Kej6IO95Yqb)。

多模态消息中，视频内容部分。

属性

---


messages.content.**type ** `string` `必选`
视频消息类型，此次应为 `video_url` **。** 

---


messages.content.**video_url**`object` `必选`
视频消息的内容部分。

属性

---


messages.content.video_url.**url ** `string` `必选`
支持传入视频链接或视频的Base64编码。具体使用请参见[视频理解说明](https://www.volcengine.com/docs/82379/1362931#.6KeG6aKR55CG6Kej)。

---


messages.content.video_url.**fps** `float/ null` `默认值 1`
取值范围：`[0.2, 5]`。
每秒钟从视频中抽取指定数量的图像 **。** 取值越高，对于视频中画面变化理解越精细；取值越低，对于视频中画面变化感知减弱，但是使用的 token 花费少，速度也更快。详细说明见[用量说明](https://www.volcengine.com/docs/82379/1362931#.55So6YeP6K-05piO)。






---


**用户消息** `object` 
用户发送的消息，包含提示或附加上下文信息。不同模型支持的字段类型不同，最多支持文本、图片、视频形式的消息。

属性

---


messages.**role** `string` `必选`
发送消息的角色，此处应为`user`。

---


messages.**content** `string / object[]` `必选`
用户信息内容。

内容类型

---


**纯文本消息内容** `string`
纯文本消息内容，大语言模型支持传入此类型。

---


**多模态消息内容** `object[]` 
支持文本、图像、视频等类型，视觉理解模型等多模态模型、部分大语言模型支持此字段。

内容类型

---


**文本消息部分** `object`
多模态消息中，内容文本输入。视觉理解模型、部分大语言模型支持此类型消息。

属性

---


messages.content.**text ** `string` `必选`
文本消息部分的内容。

---


messages.content.**type ** `string` `必选`
文本消息类型，此次应为 `text`。


---


**图像消息部分** `object`
多模态消息中，图像内容部分。视觉理解模型支持此类型消息。

**属性**

---


messages.content.**type ** `string` `必选`
图像消息类型，此次应为 `image_url`。

---


messages.content.**image_url ** `object` `必选`
图片消息的内容部分。

**属性**

---


messages.content.image_url.**url ** `string` `必选`
支持传入图片链接或图片的Base64编码，不同模型支持图片大小略有不同，具体请参见[使用说明](https://www.volcengine.com/docs/82379/1362931#.5L2_55So6K-05piO)。

---


messages.content.image_url.**detail ** `string / null`  `默认值 low`
取值范围：`high`、`low`、`auto`。
支持手动设置图片的质量。

* `high`：高细节模式，适用于需要理解图像细节信息的场景，如对图像的多个局部信息/特征提取、复杂/丰富细节的图像理解等场景，理解更全面。此时 **min_pixels ** 取值`3136`、**max_pixels ** 取值`4014080`。
* `low`：低细节模式，适用于简单的图像分类/识别、整体内容理解/描述等场景，理解更快速。此时 **min_pixels ** 取值`3136`、**max_pixels ** 取值`1048576`。
* `auto`：默认模式，不同模型选择的模式略有不同，具体请参见[理解图像的深度控制](https://www.volcengine.com/docs/82379/1362931#bf4d9224)。


---


messages.content.image_url.**image_pixel_limit  ** `object / null` `默认值 null`
允许设置图片的像素大小限制，如果不在此范围，则会等比例放大或者缩小至该范围内。
生效优先级：高于 **detail ** 字段，即同时配置 **detail ** 与 **image_pixel_limit ** 字段时，生效 **image_pixel_limit ** 字段配置 **。** 
若 **min_pixels ** / **max_pixels ** 字段未设置，使用 **detail ** 设置配置的值对应的 **min_pixels ** / **max_pixels ** 值。
子字段取值逻辑：`3136` ≤ **min_pixels ** ≤ **max_pixels ** ≤ `4014080`

---



* messages.content.image_url.image_pixel_limit.**max_pixels ** `integer`
   取值范围：(**min_pixels**,  `4014080`]。
   传入图片最大像素限制，大于此像素则等比例缩小至 **max_pixels ** 字段取值以下。
   若未设置，则取值为 **detail ** 设置配置的值对应的 **max_pixels ** 值。


---



* messages.content.image_url.image_pixel_limit.**min_pixels**
   取值范围：[`3136`,  **max_pixels**)。
   传入图片最小像素限制，小于此像素则等比例放大至 **min_pixels ** 字段取值以上。
   若未设置，则取值为 **detail ** 设置配置的值对应的 **min_pixels ** 值（`3136`）。



---


**视频信息部分** `object`
> 视频理解模型请参见 [视频理解模型](https://www.volcengine.com/docs/82379/1330310#.6KeG6KeJ55CG6Kej6IO95Yqb)。

多模态消息中，视频内容部分。

属性

---


messages.content.**type ** `string` `必选`
视频消息类型，此次应为 `video_url` **。** 

---


messages.content.**video_url**`object` `必选`
视频消息的内容部分。

属性

---


messages.content.video_url.**url ** `string` `必选`
支持传入视频链接或视频的Base64编码。具体使用请参见[视频理解说明](https://www.volcengine.com/docs/82379/1362931#.6KeG6aKR55CG6Kej)。

---


messages.content.video_url.**fps** `float/ null` `默认值 1`
取值范围：`[0.2, 5]`。
每秒钟从视频中抽取指定数量的图像 **。** 取值越高，对于视频中画面变化理解越精细；取值越低，对于视频中画面变化感知减弱，但是使用的 token 花费少，速度也更快。详细说明见[用量说明](https://www.volcengine.com/docs/82379/1362931#.55So6YeP6K-05piO)。






---


**模型消息** `object`
历史对话中，模型回复的消息。往往在多轮对话传入历史对话记录以及[Prefill Response](https://www.volcengine.com/docs/82379/1359497)时让模型按照预置的回复内容继续回复时使用。

属性
:::tip
messages.**content** ** ** 与 messages.**tool_calls** ** ** 字段二者至少填写其一。

:::
---


messages.**role** `string` `必选`
发送消息的角色，此处应为`assistant`。

---


messages.**content** `string / array`  
模型回复的消息。

---


messages.**tool_calls** `object[]`
历史对话中，模型回复的工具调用信息。

显示子字段

---


messages.tool_calls **.function ** `object` `必选`
模型调用工具对应的函数信息。

显示子字段

---


messages.tool_calls **.** function.**name ** `string` `必选`
模型需要调用的函数名称。

---


messages.tool_calls **.** function.**arguments ** `string` `必选`
模型生成的用于调用函数的参数，JSON 格式。
:::tip
模型并不总是生成有效的 JSON，并且可能会虚构出一些您的函数参数规范中未定义的参数。在调用函数之前，请在您的代码中验证这些参数是否有效。

:::

---


messages.tool_calls **.id ** `string` `必选`
调用的工具的 ID。

---


messages.tool_calls **.type ** `string` `必选`
工具类型，当前仅支持`function`。




---


**thinking** `object` `默认值 {"type":"enabled"}`
控制模型是否开启深度思考模式。默认开启深度思考模式，可以手动关闭。
> 支持此字段的模型以及使用示例请参见[文档](https://www.volcengine.com/docs/82379/1449737#.5byA5ZCv5YWz6Zet5rex5bqm5oCd6ICD)。


属性

---


thinking.**type ** `string`  `必选`
取值范围：`enabled`， `disabled`，`auto`。

* `enabled`：开启思考模式，模型一定先思考后回答。
* `disabled`：关闭思考模式，模型直接回答问题，不会进行思考。
* `auto`：自动思考模式，模型根据问题自主判断是否需要思考，简单题目直接回答。


---


**max_tokens** `integer / null` `默认值 4096`
模型回复最大长度（单位 token），取值范围各个模型不同，详细见[模型列表](https://www.volcengine.com/docs/82379/1330310)。
输入 token 和输出 token 的总长度还受模型的上下文长度限制。

---


**max_completion_tokens** `integer / null` 
> 支持该字段的模型 `deepseek-r1-250528`，`doubao-seed-1-6-250615`， `doubao-seed-1-6-flash-250615`。

取值范围：`[0, 64k]`。
使用示例见[文档](https://www.volcengine.com/docs/82379/1449737#0001)。控制模型输出的最大长度（包括模型回答和模型思维链内容长度，单位 token）。配置了该参数后，可以让模型输出超长内容，**max_tokens ** （默认值 4k）与思维链最大长度将失效，模型按需输出内容，直到达到 **max_completion_tokens ** 配置的值。
不可与 **max_tokens** 字段同时设置，会直接报错。

---


**stop** `string / string[] / null` `默认值 null`
模型遇到 stop 字段所指定的字符串时将停止继续生成，这个词语本身不会输出。最多支持 4 个字符串。
> [深度思考能力模型](https://www.volcengine.com/docs/82379/1330310#.6KeG6KeJ55CG6Kej6IO95Yqb)不支持该字段。

`["你好", "天气"]`

---


**frequency_penalty** `float / null` `默认值 0`
取值范围为 [\-2.0, 2.0]。
频率惩罚系数。如果值为正，会根据新 token 在文本中的出现频率对其进行惩罚，从而降低模型逐字重复的可能性。

---


**presence_penalty** `float / null` `默认值 0`
取值范围为 [\-2.0, 2.0]。
存在惩罚系数。如果值为正，会根据新 token 到目前为止是否出现在文本中对其进行惩罚，从而增加模型谈论新主题的可能性。

---


**temperature** `float / null` `默认值 1`
取值范围为 [0, 2]。
采样温度。控制了生成文本时对每个候选词的概率分布进行平滑的程度。当取值为 0 时模型仅考虑对数概率最大的一个 token。
较高的值（如 0.8）会使输出更加随机，而较低的值（如 0.2）会使输出更加集中确定。
通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

---


**top_p** `float / null` `默认值 0.7`
取值范围为 [0, 1]。
核采样概率阈值。模型会考虑概率质量在 top_p 内的 token 结果。当取值为 0 时模型仅考虑对数概率最大的一个 token。
0.1 意味着只考虑概率质量最高的前 10% 的 token，取值越大生成的随机性越高，取值越低生成的确定性越高。通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

---


**logprobs** `boolean / null` `默认值 false`
是否返回输出 tokens 的对数概率。

* `false`：不返回对数概率信息。
* `true`：返回消息内容中每个输出 token 的对数概率。


---


**top_logprobs** `integer / null` `默认值 0`
取值范围为 [0, 20]。
指定每个输出 token 位置最有可能返回的 token 数量，每个 token 都有关联的对数概率。仅当 **logprobs为**`true` 时可以设置 **top_logprobs** 参数。

---


**logit_bias** `map / null` `默认值 null`
调整指定 token 在模型输出内容中出现的概率，使模型生成的内容更加符合特定的偏好。**logit_bias** 字段接受一个 map 值，其中每个键为词表中的 token ID（使用 tokenization 接口获取），每个值为该 token 的偏差值，取值范围为 [\-100, 100]。
\-1 会减少选择的可能性，1 会增加选择的可能性；\-100 会完全禁止选择该 token，100 会导致仅可选择该 token。该参数的实际效果可能因模型而异。
`{"<Token_ID>": -100}`

---


**tools** `object[] / null` `默认值 null`
待调用工具的列表，模型返回信息中可包含。当您需要让模型返回待调用工具时，需要配置该结构体。支持该字段的模型请参见[文档](https://www.volcengine.com/docs/82379/1330310#.5bel5YW36LCD55So6IO95Yqb)。

属性

---


tools.**type ** `string` `必选`
工具类型，此处应为 `function`。

---


tools.**function ** `object` `必选`
模型返回中可包含待调用的工具。

属性

---


tools.function.**name ** `string` `必选`
调用的函数的名称。

---


tools.function.**description ** `string` 
调用的函数的描述，大模型会使用它来判断是否调用这个工具。

---


tools.function.**parameters ** `object` 
函数请求参数，以 JSON Schema 格式描述。具体格式请参考 [JSON Schema](https://json-schema.org/understanding-json-schema) 文档，格式如下：
```JSON
{
    "type": "object",
    "properties": {
        "location": {
            "type": "string",
            "description": "城市，如：北京"
        }
    },
    "required": ["location"]
}
```

其中，

* 所有字段名大小写敏感。
* **parameters** 须是合规的 JSON Schema 对象。
* 建议用英文字段名，中文置于 **description** 字段中。



---


<span id="PM1q4ttH"></span>
## 响应参数
> 跳转 [请求参数](#B2fc2CRV)

<span id="pdTGwich"></span>
### 非流式调用返回

---


**id** `string`
本次请求的唯一标识。

---


**model** `string`
本次请求实际使用的模型名称和版本。
> doubao 1.5 代模型的模型名称格式为 doubao\-1\-5\-\*\*。如调用部署doubao\-1.5\-pro\-32k 250115模型的推理接入点，返回model字段信息doubao\-1\-5\-pro\-32k\-250115。


---


**service_tier** `string`
本次请求是否使用了TPM保障包。

* `default`：本次请求未使用TPM保障包额度。


---


**created** `integer`
本次请求创建时间的 Unix 时间戳（秒）。

---


**object** `string`
固定为 `chat.completion`。

---


**choices** `object[]`
本次请求的模型输出内容。

属性

---


choices.**index ** `integer`
当前元素在 **choices** 列表的索引。

---


choices.**finish_reason ** `string`
模型停止生成 token 的原因。取值范围：

* `stop`：模型输出自然结束，或因命中请求参数 stop 中指定的字段而被截断。
* `length`：模型输出因达到模型输出限制而被截断，有以下原因：
   * 触发`max_token`限制（回答内容的长度限制）。
   * 触发`max_completion_tokens`限制（思维链内容+回答内容的长度限制）。
   * 触发`context_window`限制（输入内容+思维链内容+回答内容的长度限制）。
* `content_filter`：模型输出被内容审核拦截。
* `tool_calls`：模型调用了工具。


---


choices.**message ** `object`
模型输出的内容。

属性

---


choices.message.**role ** `string`
内容输出的角色，此处固定为 `assistant`。

---


choices.message.**content ** `string`
模型生成的消息内容。

---


choices.message.**reasoning_content ** `string / null`
模型处理问题的思维链内容。
仅深度推理模型支持返回此字段，深度推理模型请参见[支持模型](https://www.volcengine.com/docs/82379/1449737#5f0f3750)。

---


choices.message.**tool_calls ** `object[] / null`
模型生成的工具调用。

属性

---


choices.message.tool_calls.**id ** `string`
调用的工具的 ID。

---


choices.message.tool_calls.**type ** `string`
工具类型，当前仅支持`function`。

---


choices.message.tool_calls.**function ** `object`
模型调用的函数。

属性

---


choices.message.tool_calls.function.**name ** `string`
模型调用的函数的名称。

---


choices.message.tool_calls.function.**arguments ** `string`
模型生成的用于调用函数的参数，JSON 格式。
模型并不总是生成有效的 JSON，并且可能会虚构出一些您的函数参数规范中未定义的参数。在调用函数之前，请在您的代码中验证这些参数是否有效。




---


choices.**logprobs ** `object / null`
当前内容的对数概率信息。

属性

---


choices.logprobs.**content ** `object[] / null`
message列表中每个 content 元素中的 token 对数概率信息。

属性

---


choices.logprobs.content.**token ** `string`
当前 token。

---


choices.logprobs.content.**bytes ** `integer[] / null`
当前 token 的 UTF\-8 值，格式为整数列表。当一个字符由多个 token 组成（表情符号或特殊字符等）时可以用于字符的编码和解码。如果 token 没有 UTF\-8 值则为空。

---


choices.logprobs.content.**logprob ** `float`
当前 token 的对数概率。

---


choices.logprobs.content.**top_logprobs ** `object[]`
在当前 token 位置最有可能的标记及其对数概率的列表。在一些情况下，返回的数量可能比请求参数 top_logprobs 指定的数量要少。

**属性**

---


choices.logprobs.content.top_logprobs.**token ** `string`
当前 token。

---


choices.logprobs.content.top_logprobs.**bytes ** `integer[] / null`
当前 token 的 UTF\-8 值，格式为整数列表。当一个字符由多个 token 组成（表情符号或特殊字符等）时可以用于字符的编码和解码。如果 token 没有 UTF\-8 值则为空。

---


choices.logprobs.content.top_logprobs.**logprob ** `float`
当前 token 的对数概率。




---


choices.**moderation_hit_type ** `string/ null`
模型输出文字含有敏感信息时，会返回模型输出文字命中的风险分类标签。
返回值及含义：

* `severe_violation`：模型输出文字涉及严重违规。
* `violence`：模型输出文字涉及激进行为。

注意：当前只有[视觉理解模型](https://www.volcengine.com/docs/82379/1362931#.5pSv5oyB5qih5Z6L)支持返回该字段，且只有在方舟控制台[接入点配置页面](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint/create?customModelId=)或者 [CreateEndpoint](https://www.volcengine.com/docs/82379/1262823) 接口中，将内容护栏方案（ModerationStrategy）设置为基础方案（Basic）时，才会返回风险分类标签。


---


**usage** `object`
本次请求的 token 用量。

属性

---


usage.**prompt_tokens ** `integer`
输入的 prompt token 数量。

---


usage.**completion_tokens ** `integer`
模型生成的 token 数量。

---


usage.**total_tokens ** `integer`
本次请求消耗的总 token 数量（输入 + 输出）。

---


usage.**prompt_tokens_details ** `object`
本接口暂不支持该字段。
命中上下文缓存的tokens细节。

属性

---


usage.prompt_tokens_details.**cached_tokens ** `integer`
本接口暂不支持该字段。此处应为 `0`。


---


usage.**completion_tokens_details ** `object`
本次请求花费的 token 的细节。

属性

---


usage.completion_tokens_details.**reasoning_tokens ** `integer`
输出思维链内容花费的 token 数 。
支持输出思维链的模型请参见[文档](https://www.volcengine.com/docs/82379/1449737#5f0f3750)。




为方便您集成和使用，火山方舟模型 API 会尽可能兼容 OpenAI API。修改 `base url`、`model` 、`api_key`等少量配置，轻松将方舟模型服务集成到您已有的系统中。
:::tip
社区第三方 SDK 不由火山引擎团队维护，本文仅供参考。
:::
<span id="509924d1"></span>
# 前提条件
:::tip
方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 [快速入门](/docs/82379/1399008)。
:::
<span id="fe0e81ca"></span>
# OpenAI SDK

* Python版本：3.7及以上。
* OpenAI SDK：1.0版本及以上，安装命令：

```Python
pip install --upgrade "openai>=1.0"
```

<span id="0569f4fe"></span>
## 快速开始示例
```Python
from openai import OpenAI
import os

client = OpenAI(   
    # The base URL for model invocation
    base_url="https://ark.cn-beijing.volces.com/api/v3",   
    # Replace with your API Key
    api_key=os.environ.get("ARK_API_KEY"), 
)

completion = client.chat.completions.create(
    # Replace with Model ID
    model="doubao-seed-1-6-251015", 
    messages = [
        {"role": "user", "content": "Hello"},
    ],
)
print(completion.choices[0].message.content)
```

<span id="922db236"></span>
## 设置额外字段
传入OpenAI SDK中不支持的字段，可以通过 **extra_body** 字典传入，如开关模型是否深度思考的 **thinking** 字段。
```Python
from openai import OpenAI
import os

client = OpenAI(   
    # The base URL for model invocation 
    base_url="https://ark.cn-beijing.volces.com/api/v3",  
    # Replace with your API Key 
    api_key=os.environ.get("ARK_API_KEY"), 
)

completion = client.chat.completions.create(
    # Replace with Model ID
    model="doubao-seed-1-6-251015", 
    messages = [
        {"role": "user", "content": "Hello"},
    ],
    extra_body={
         "thinking": {
             "type": "disabled", # 不使用深度思考能力
             # "type": "enabled", # 使用深度思考能力
         }
     }
)
print(completion.choices[0].message.content)
```

<span id="1cd60a34"></span>
## 设置自定义header
可以用于传递额外信息，如配置 ID来串联日志，使能数据加密能力。
```Python
from openai import OpenAI
import os

client = OpenAI(   
    # The base URL for model invocation
    base_url="https://ark.cn-beijing.volces.com/api/v3",  
    # Replace with your API Key
    api_key=os.environ.get("ARK_API_KEY"), 
)

completion = client.chat.completions.create(
    # Replace with Model ID
    model="doubao-seed-1-6-251015", 
    messages = [
        {"role": "user", "content": "Hello"},
    ],
    # 自定义request id
    extra_headers={"X-Client-Request-Id": "202406251728190000B7EA7A9648AC08D9"}
)
print(completion.choices[0].message.content)
```

<span id="ab87fab7"></span>
## 向量化 Embedding
:::warning

* 文本向量化模型已经逐步下线，建议您使用多模态向量化模型。
* [多模态向量化能力](/docs/82379/1330310#ee5ec35c)模型不支持 OpenAI API ，请使用 方舟 SDK，详细请参见 [多模态向量化](/docs/82379/1409291)。

:::
<span id="697a06ce"></span>
# LangChain OpenAI SDK
安装 LangChain OpenAI SDK：
```Python
pip install langchain-openai
```

<span id="2bcdd714"></span>
## 示例代码
```Python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
import os

llm = ChatOpenAI(
    # Replace with your API Key     
    openai_api_key=os.environ.get("ARK_API_KEY"), 
    # The base URL for model invocation
    openai_api_base="https://ark.cn-beijing.volces.com/api/v3",   
    # Replace with Model ID
    model="doubao-seed-1-6-251015", 
)

template = """Question: {question}

Answer: Let's think step by step."""

prompt = PromptTemplate.from_template(template)

question = "What NFL team won the Super Bowl in the year Justin Beiber was born?"

llm_chain = prompt | llm

print(llm_chain.invoke(question))
```



