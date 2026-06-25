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
