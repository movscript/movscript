package ai

var modelPresetSources = []ModelDef{

	// ─── OpenAI ────────────────────────────────────────────────────────────────

	{ID: "openai:gpt-5.5", ModelID: "gpt-5.5",
		DisplayName: "GPT-5.5 (推理)", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat},

	{ID: "openai:gpt-4o", ModelID: "gpt-4o",
		DisplayName: "GPT-4o", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 2.50, RefOutputUSDPer1M: 10.00},

	{ID: "openai:gpt-4o-mini", ModelID: "gpt-4o-mini",
		DisplayName: "GPT-4o mini", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 0.15, RefOutputUSDPer1M: 0.60},

	{ID: "openai:gpt-4.1", ModelID: "gpt-4.1",
		DisplayName: "GPT-4.1", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 2.00, RefOutputUSDPer1M: 8.00},

	{ID: "openai:gpt-4.1-mini", ModelID: "gpt-4.1-mini",
		DisplayName: "GPT-4.1 mini", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 0.40, RefOutputUSDPer1M: 1.60},

	{ID: "openai:o3-mini", ModelID: "o3-mini",
		DisplayName: "o3-mini (推理)", Capabilities: []string{"text", "reasoning"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 1.10, RefOutputUSDPer1M: 4.40},

	{ID: "openai:dall-e-3", ModelID: "dall-e-3",
		DisplayName: "DALL-E 3", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.040,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1024x1792", "1792x1024"}, Default: "1024x1024"},
			{Key: "quality", Label: "质量", Type: "select",
				Options: []string{"standard", "hd"}, Default: "standard"},
			{Key: "style", Label: "风格", Type: "select",
				Options: []string{"vivid", "natural"}, Default: "vivid"},
		}},

	{ID: "openai:gpt-image-1", ModelID: "gpt-image-1",
		DisplayName: "GPT Image 1 (文生图)", Capabilities: []string{CapabilityImage},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage:  0.040,
		SupportedParams: openAIGPTImageParams()},

	{ID: "openai:gpt-image-1-edit", ModelID: "gpt-image-1",
		DisplayName: "GPT Image 1 (图像编辑)", Capabilities: []string{CapabilityImageEdit},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AcceptsImageInput: true, MaxInputImages: 1, ImageEditField: "image[]",
		RefUSDPerImage:  0.040,
		SupportedParams: openAIGPTImageParams()},

	{ID: "openai:gpt-image-2", ModelID: "gpt-image-2",
		DisplayName: "GPT Image 2 (文生图)", Capabilities: []string{CapabilityImage},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage:  0.040,
		SupportedParams: openAIGPTImageParams()},

	{ID: "openai:gpt-image-2-edit", ModelID: "gpt-image-2",
		DisplayName: "GPT Image 2 (图像编辑)", Capabilities: []string{CapabilityImageEdit},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AcceptsImageInput: true, MaxInputImages: 1, ImageEditField: "image[]",
		RefUSDPerImage:  0.040,
		SupportedParams: openAIGPTImageParams()},

	// ─── Anthropic ─────────────────────────────────────────────────────────────

	{ID: "anthropic:claude-3-5-sonnet", ModelID: "claude-3-5-sonnet-20241022",
		DisplayName: "Claude 3.5 Sonnet", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "anthropic:claude-3-7-sonnet", ModelID: "claude-3-7-sonnet-20250219",
		DisplayName: "Claude 3.7 Sonnet (推理)", Capabilities: []string{"text", "reasoning"},
		PricingMode: PricingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "anthropic:claude-3-5-haiku", ModelID: "claude-3-5-haiku-20241022",
		DisplayName: "Claude 3.5 Haiku", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 0.80, RefOutputUSDPer1M: 4.00},

	{ID: "anthropic:claude-opus-4", ModelID: "claude-opus-4-5",
		DisplayName: "Claude Opus 4", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 15.00, RefOutputUSDPer1M: 75.00},

	// ─── Volcengine Ark ────────────────────────────────────────────────────────
	// Text models: direct model name invocation (Ark "direct invocation").
	// AllowModelIDOverride lets admins substitute their own ep-xxx endpoint IDs.
	// ModelID uses official Ark format: {name}-{YYMMDD timestamp}.

	// Seed 2.0 series (Feb 2026)
	{ID: "volcengine:doubao-seed-2-0-pro", ModelID: "doubao-seed-2-0-pro-260215",
		DisplayName: "豆包 Seed 2.0 Pro", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.67, RefOutputUSDPer1M: 3.36},

	{ID: "volcengine:doubao-seed-2-0-lite", ModelID: "doubao-seed-2-0-lite-260215",
		DisplayName: "豆包 Seed 2.0 Lite", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.13, RefOutputUSDPer1M: 0.76},

	{ID: "volcengine:doubao-seed-2-0-mini", ModelID: "doubao-seed-2-0-mini-260215",
		DisplayName: "豆包 Seed 2.0 Mini", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.06, RefOutputUSDPer1M: 0.56},

	// Seed 1.8
	{ID: "volcengine:doubao-seed-1-8", ModelID: "doubao-seed-1.8-251228",
		DisplayName: "豆包 Seed 1.8", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.12, RefOutputUSDPer1M: 0.29},

	// Seed 1.6 series
	{ID: "volcengine:doubao-seed-1-6", ModelID: "doubao-seed-1.6-251015",
		DisplayName: "豆包 Seed 1.6", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.20, RefOutputUSDPer1M: 0.60},

	{ID: "volcengine:doubao-seed-1-6-lite", ModelID: "doubao-seed-1.6-lite-251015",
		DisplayName: "豆包 Seed 1.6 Lite", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.07, RefOutputUSDPer1M: 0.21},

	{ID: "volcengine:doubao-seed-1-6-flash", ModelID: "doubao-seed-1.6-flash-250828",
		DisplayName: "豆包 Seed 1.6 Flash", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.04, RefOutputUSDPer1M: 0.12},

	{ID: "volcengine:doubao-seed-1-6-vision", ModelID: "doubao-seed-1.6-vision-250815",
		DisplayName: "豆包 Seed 1.6 Vision", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.20, RefOutputUSDPer1M: 0.60},

	// 1.5 Lite
	{ID: "volcengine:doubao-1-5-lite-32k", ModelID: "doubao-1.5-lite-32k-250115",
		DisplayName: "豆包 1.5 Lite 32k", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.04, RefOutputUSDPer1M: 0.12},

	// ─── Volcengine doubao text — native Ark SDK (volcen adapter) ──────────────
	// Same models as above but accessed via the Ark SDK instead of OpenAI-compat.
	// Admins can choose either integration depending on their setup.

	{ID: "volcengine-ark:doubao-seed-2-0-pro", ModelID: "doubao-seed-2-0-pro-260215",
		DisplayName: "豆包 Seed 2.0 Pro (Ark 原生)", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.67, RefOutputUSDPer1M: 3.36},

	{ID: "volcengine-ark:doubao-seed-2-0-lite", ModelID: "doubao-seed-2-0-lite-260215",
		DisplayName: "豆包 Seed 2.0 Lite (Ark 原生)", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.13, RefOutputUSDPer1M: 0.76},

	{ID: "volcengine-ark:doubao-seed-1-6", ModelID: "doubao-seed-1.6-251015",
		DisplayName: "豆包 Seed 1.6 (Ark 原生)", Capabilities: []string{"text"},
		PricingMode: PricingPerToken, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.20, RefOutputUSDPer1M: 0.60},

	// Seedream image generation — OpenAI-compat interface.
	{ID: "volcengine:seedream-3-0", ModelID: "doubao-seedream-3-0-t2i-250415",
		DisplayName: "Seedream 3.0 图像", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefUSDPerImage:       0.002,
		SupportedParams:      volcenSeedream3Params()},

	{ID: "volcengine:seedream-4-0", ModelID: "doubao-seedream-4-0-250828",
		DisplayName: "Seedream 4.0 图像", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.020,
		SupportedParams: volcenSeedream4Params([]string{"1K", "2K", "4K"})},

	{ID: "volcengine:seedream-4-5", ModelID: "doubao-seedream-4-5-251128",
		DisplayName: "Seedream 4.5 图像", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.040,
		SupportedParams: volcenSeedream4Params([]string{"2K", "4K"})},

	{ID: "volcengine:seedream-5-0", ModelID: "doubao-seedream-5-0-260128",
		DisplayName: "Seedream 5.0 图像", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.050,
		SupportedParams: volcenSeedream5LiteParams()},

	{ID: "volcengine:seedream-5-0-lite", ModelID: "doubao-seedream-5-0-lite-260128",
		DisplayName: "Seedream 5.0 Lite 图像", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.035,
		SupportedParams: volcenSeedream5LiteParams()},

	// Seedream image generation — native Ark SDK (volcen adapter).
	{ID: "volcengine-ark:seedream-3-0", ModelID: "doubao-seedream-3-0-t2i-250415",
		DisplayName: "Seedream 3.0 图像 (Ark 原生)", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefUSDPerImage:       0.002,
		SupportedParams:      volcenSeedream3Params()},

	{ID: "volcengine-ark:seedream-5-0", ModelID: "doubao-seedream-5-0-260128",
		DisplayName: "Seedream 5.0 图像 (Ark 原生)", Capabilities: []string{"image"},
		PricingMode: PricingPerImage, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.050,
		SupportedParams: volcenSeedream5LiteParams()},

	// Seedance video generation (async task API — uses volcen adapter).
	{ID: "volcengine:seedance-1-0-lite-t2v", ModelID: "doubao-seedance-1-0-lite-t2v-250428",
		DisplayName: "Seedance 1-0 Lite 文生视频", Capabilities: []string{CapabilityVideo},
		PricingMode: PricingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		MaxInputImages:       0,
		RefUSDPerSecond:      0.028, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"2", "5", "10", "12"},
			[]string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			false, true, true, false, false,
		)},

	{ID: "volcengine:seedance-1-0-lite-i2v", ModelID: "doubao-seedance-1-0-lite-i2v-250428",
		DisplayName: "Seedance 1-0 Lite 图生视频", Capabilities: []string{CapabilityVideoI2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages:  4,
		RefUSDPerSecond: 0.028, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"2", "5", "10", "12"},
			[]string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p"},
			false, false, true, false, false,
		)},

	{ID: "volcengine:seedance-1-0-pro-fast", ModelID: "doubao-seedance-1-0-pro-fast-251015",
		DisplayName: "Seedance 1-0 Pro Fast 视频", Capabilities: []string{CapabilityVideo},
		PricingMode: PricingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		MaxInputImages:       0,
		RefUSDPerSecond:      0.042, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"2", "5", "10", "12"},
			[]string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			false, true, true, false, false,
		)},

	{ID: "volcengine:seedance-1-5-pro", ModelID: "doubao-seedance-1-5-pro-251215",
		DisplayName: "Seedance 1.5 Pro 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages:  1,
		RefUSDPerSecond: 0.090, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"-1", "4", "5", "10", "12"},
			[]string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			true, true, true, false, true,
		)},

	{ID: "volcengine:seedance-2-0", ModelID: "doubao-seedance-2-0-260128",
		DisplayName: "Seedance 2.0 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages: 1, MaxInputVideos: 1,
		RefUSDPerSecond: 0.140, DefaultDurSec: 5, MaxDurSec: 15,
		SupportedParams: volcenSeedanceParams(
			[]string{"-1", "4", "5", "10", "15"},
			[]string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			true, false, false, true, false,
		)},

	{ID: "volcengine:seedance-2-0-fast", ModelID: "doubao-seedance-2-0-fast-260128",
		DisplayName: "Seedance 2.0 Fast 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages: 1, MaxInputVideos: 1,
		RefUSDPerSecond: 0.070, DefaultDurSec: 5, MaxDurSec: 15,
		SupportedParams: volcenSeedanceParams(
			[]string{"-1", "4", "5", "10", "15"},
			[]string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p"},
			true, false, false, true, false,
		)},

	// ─── Kling (Kuaishou) ──────────────────────────────────────────────────────

	{ID: "kling:v1-standard-t2v", ModelID: "kling-v1",
		DisplayName: "可灵 v1 标准 (文生视频)", Capabilities: []string{CapabilityVideo},
		PricingMode: PricingPerSecond, AdapterType: AdapterKling,
		MaxInputImages:  0,
		RefUSDPerSecond: 0.00196, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	{ID: "kling:v1-6-standard-t2v", ModelID: "kling-v1-6",
		DisplayName: "可灵 v1.6 标准 (文生视频)", Capabilities: []string{CapabilityVideo},
		PricingMode: PricingPerSecond, AdapterType: AdapterKling,
		MaxInputImages:  0,
		RefUSDPerSecond: 0.00392, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	{ID: "kling:v2-standard-t2v", ModelID: "kling-v2",
		DisplayName: "可灵 v2 标准 (文生视频)", Capabilities: []string{CapabilityVideo},
		PricingMode: PricingPerSecond, AdapterType: AdapterKling,
		MaxInputImages:  0,
		RefUSDPerSecond: 0.00490, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	{ID: "kling:v1-5-standard-i2v", ModelID: "kling-v1-5",
		DisplayName: "可灵 v1.5 (图生视频)", Capabilities: []string{CapabilityVideoI2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterKling,
		AcceptsImageInput: true, MaxInputImages: 1,
		RefUSDPerSecond: 0.00392, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	// ─── xAI Grok ─────────────────────────────────────────────────────────────
	// Accessed via OpenAI-compatible proxy. All text models support vision input.
	// Pricing reference: https://x.ai/api — varies by variant; estimates below.

	// Grok 4.20 series — latest generation (Apr 2025).
	// Non-reasoning: fast direct-answer mode; reasoning: extended chain-of-thought.
	// "super" variants use higher compute allocation for harder tasks.

	{ID: "xai:grok-4.20-0309", ModelID: "grok-4.20-0309",
		DisplayName: "Grok 4.20", Capabilities: []string{CapabilityText},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "xai:grok-4.20-0309-non-reasoning", ModelID: "grok-4.20-0309-non-reasoning",
		DisplayName: "Grok 4.20 Non-Reasoning", Capabilities: []string{CapabilityText},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "xai:grok-4.20-0309-reasoning", ModelID: "grok-4.20-0309-reasoning",
		DisplayName: "Grok 4.20 Reasoning", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	{ID: "xai:grok-4.20-0309-super", ModelID: "grok-4.20-0309-super",
		DisplayName: "Grok 4.20 Super", Capabilities: []string{CapabilityText},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	{ID: "xai:grok-4.20-0309-non-reasoning-super", ModelID: "grok-4.20-0309-non-reasoning-super",
		DisplayName: "Grok 4.20 Non-Reasoning Super", Capabilities: []string{CapabilityText},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	{ID: "xai:grok-4.20-0309-reasoning-super", ModelID: "grok-4.20-0309-reasoning-super",
		DisplayName: "Grok 4.20 Reasoning Super", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 8.00, RefOutputUSDPer1M: 40.00},

	// Routing / alias variants — the proxy selects the optimal backend automatically.
	{ID: "xai:grok-4.20-fast", ModelID: "grok-4.20-fast",
		DisplayName: "Grok 4.20 Fast", Capabilities: []string{CapabilityText},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 1 - 00, RefOutputUSDPer1M: 5.00},

	{ID: "xai:grok-4.20-auto", ModelID: "grok-4.20-auto",
		DisplayName: "Grok 4.20 Auto", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "xai:grok-4.20-expert", ModelID: "grok-4.20-expert",
		DisplayName: "Grok 4.20 Expert", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 8.00, RefOutputUSDPer1M: 40.00},

	// Grok 4.3 Beta — next-generation preview with extended reasoning.
	{ID: "xai:grok-4.3-beta", ModelID: "grok-4.3-beta",
		DisplayName: "Grok 4.3 Beta (推理)", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	// Grok Imagine — image generation via /images/generations (OpenAI-compat).
	{ID: "xai:grok-imagine-image-lite", ModelID: "grok-imagine-image-lite",
		DisplayName: "Grok Imagine Lite (文生图)", Capabilities: []string{CapabilityImage},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.020,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	{ID: "xai:grok-imagine-image", ModelID: "grok-imagine-image",
		DisplayName: "Grok Imagine (文生图)", Capabilities: []string{CapabilityImage},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.050,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	{ID: "xai:grok-imagine-image-pro", ModelID: "grok-imagine-image-pro",
		DisplayName: "Grok Imagine Pro (文生图)", Capabilities: []string{CapabilityImage},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.100,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	// image_edit: requires image input, routes to /images/edits.
	{ID: "xai:grok-imagine-image-edit", ModelID: "grok-imagine-image-edit",
		DisplayName: "Grok Imagine Edit (图像编辑)", Capabilities: []string{CapabilityImageEdit},
		PricingMode: PricingPerImage, AdapterType: AdapterOpenAICompat,
		AcceptsImageInput: true, MaxInputImages: 1, ImageEditField: "image[]",
		RefUSDPerImage: 0.080,
		SupportedParams: []ParamDef{
			{Key: "image_size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	// Grok Imagine Video — text-to-video via /videos/generations (OpenAI-compat).
	// Duration and resolution are proxy-controlled; xAI does not publicly document params.
	{ID: "xai:grok-imagine-video", ModelID: "grok-imagine-video",
		DisplayName: "Grok Imagine Video (文生视频)", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterOpenAICompat,
		AcceptsImageInput: true, MaxInputImages: 2,
		RefUSDPerSecond: 0.20, DefaultDurSec: 6, MaxDurSec: 20,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"6", "10", "12", "16", "20"}, Default: "6"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	// ─── Google Gemini ────────────────────────────────────────────────────────

	{ID: "gemini:gemini-2-5-pro", ModelID: "gemini-2.5-pro",
		DisplayName: "Gemini 2.5 Pro", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterGemini,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 1.25, RefOutputUSDPer1M: 10.00},

	{ID: "gemini:gemini-2-5-flash", ModelID: "gemini-2.5-flash",
		DisplayName: "Gemini 2.5 Flash", Capabilities: []string{CapabilityText, CapabilityReasoning},
		PricingMode: PricingPerToken, AdapterType: AdapterGemini,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 0.15, RefOutputUSDPer1M: 0.60},

	{ID: "gemini:gemini-2-0-flash", ModelID: "gemini-2.0-flash",
		DisplayName: "Gemini 2.0 Flash", Capabilities: []string{CapabilityText},
		PricingMode: PricingPerToken, AdapterType: AdapterGemini,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 0.10, RefOutputUSDPer1M: 0.40},

	{ID: "gemini:imagen-3", ModelID: "imagen-3.0-generate-002",
		DisplayName: "Imagen 3 文生图", Capabilities: []string{CapabilityImage},
		PricingMode: PricingPerImage, AdapterType: AdapterGemini,
		MaxInputImages: 0,
		RefUSDPerImage: 0.04,
		SupportedParams: []ParamDef{
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"1:1", "3:4", "4:3", "9:16", "16:9"}, Default: "1:1"},
		}},

	{ID: "gemini:gemini-flash-image", ModelID: "gemini-2.0-flash-preview-image-generation",
		DisplayName: "Gemini Flash 图像生成", Capabilities: []string{CapabilityImage, CapabilityImageEdit},
		PricingMode: PricingPerImage, AdapterType: AdapterGemini,
		AcceptsImageInput: true, MaxInputImages: -1,
		RefUSDPerImage: 0.04,
		SupportedParams: []ParamDef{
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"1:1", "3:4", "4:3", "9:16", "16:9"}, Default: "1:1"},
		}},

	{ID: "gemini:veo-2", ModelID: "veo-2.0-generate-001",
		DisplayName: "Veo 2 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V},
		PricingMode: PricingPerSecond, AdapterType: AdapterGemini,
		AcceptsImageInput: true, MaxInputImages: 1,
		RefUSDPerSecond: 0.35, DefaultDurSec: 6, MaxDurSec: 8,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"6", "8"}, Default: "6"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16"}, Default: "16:9"},
		}},
}
