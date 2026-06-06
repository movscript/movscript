package dto

type ProjectCreateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
	AspectRatio   string `json:"aspect_ratio"`
	VisualStyle   string `json:"visual_style"`
	ProjectStyle  string `json:"project_style"`
}

type ProjectUpdateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
	AspectRatio   string `json:"aspect_ratio"`
	VisualStyle   string `json:"visual_style"`
	ProjectStyle  string `json:"project_style"`
}

type ProjectMemberInput struct {
	UserID uint   `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

type UserCreateInput struct {
	Username string `json:"username" binding:"required"`
}

type AIModelConfigInput struct {
	ModelDefID            string  `json:"model_def_id" binding:"required"`
	ModelIDOverride       string  `json:"model_id_override"`
	IsEnabled             *bool   `json:"is_enabled"`
	Priority              int     `json:"priority"`
	CapacityWeight        int     `json:"capacity_weight"`
	MaxConcurrency        int     `json:"max_concurrency"`
	CreditsInputPer1M     float64 `json:"credits_input_per_1m"`
	CreditsOutputPer1M    float64 `json:"credits_output_per_1m"`
	CreditsPerImage       float64 `json:"credits_per_image"`
	CreditsPerSecond      float64 `json:"credits_per_second"`
	CreditsPerCall        float64 `json:"credits_per_call"`
	CustomDisplayName     string  `json:"custom_display_name"`
	ShortName             string  `json:"short_name"`
	CustomCapabilities    string  `json:"custom_capabilities"`
	CustomPricingMode     string  `json:"custom_pricing_mode"`
	CustomAcceptsImage    bool    `json:"custom_accepts_image"`
	CustomMaxInputImages  int     `json:"custom_max_input_images"`
	CustomMaxInputVideos  int     `json:"custom_max_input_videos"`
	CustomImageEditField  string  `json:"custom_image_edit_field"`
	CustomSupportedParams string  `json:"custom_supported_params"`
}
