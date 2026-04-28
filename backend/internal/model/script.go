package model

import "gorm.io/gorm"

type Script struct {
	gorm.Model
	ProjectID  uint      `gorm:"not null" json:"project_id"`
	Title      string    `gorm:"not null" json:"title"`
	Description string   `json:"description"`
	Content    string    `json:"content"` // full script body text
	Status     string    `gorm:"default:'draft'" json:"status"`
	ScriptType string    `gorm:"default:'main'" json:"script_type"` // main|episode|scene
	EpisodeID  *uint     `json:"episode_id,omitempty"`
	PipelineNodeID *uint `json:"pipeline_node_id,omitempty"`
	AssigneeID     *uint `json:"assignee_id,omitempty"`
	Assignee       *User `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	ReviewStatus   string `gorm:"default:'draft'" json:"review_status"`
	AuthorID   uint      `json:"author_id"`
	Author     User      `json:"author,omitempty"`
	ResourceIDs string   `json:"resource_ids"` // JSON array of RawResource IDs
	Episodes   []Episode `gorm:"foreignKey:ScriptID" json:"episodes,omitempty"`

	// Content management fields (内容管理)
	Summary      string `json:"summary"`       // 剧本总结
	Characters   string `json:"characters"`    // 人物设定
	CoreSettings string `json:"core_settings"` // 核心设定
	Background   string `json:"background"`    // 故事背景
	ScenesDesc   string `json:"scenes_desc"`   // 场景描述
	Hook         string `json:"hook"`          // 钩子（分集剧本）
	PlotSummary  string `json:"plot_summary"`  // 剧情推演总结（分集剧本）
	Order        int    `json:"order"`         // 排序（分集剧本顺序）
}
