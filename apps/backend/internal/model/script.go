package model

import "gorm.io/gorm"

type Script struct {
	gorm.Model
	ProjectID      uint             `gorm:"not null" json:"project_id"`
	Title          string           `gorm:"not null" json:"title"`
	Description    string           `json:"description"`
	Content        string           `json:"content"`                           // full script body text
	RawSource      string           `gorm:"type:text" json:"raw_source"`       // original imported script document
	ScriptType     string           `gorm:"default:'main'" json:"script_type"` // main|episode|scene
	SourceType     string           `gorm:"default:'raw'" json:"source_type"`  // raw|adapted|revised
	Version        int              `gorm:"default:1" json:"version"`
	ParentScriptID *uint            `json:"parent_script_id,omitempty"`
	AnalysisStatus string           `gorm:"default:'pending'" json:"analysis_status"` // pending|analyzing|analyzed|failed
	EpisodeID      *uint            `json:"episode_id,omitempty"`
	AssigneeID     *uint            `json:"assignee_id,omitempty"`
	Assignee       *User            `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	AuthorID       uint             `json:"author_id"`
	Author         User             `json:"author,omitempty"`
	Episodes       []Episode        `gorm:"foreignKey:ScriptID" json:"episodes,omitempty"`
	Analyses       []ScriptAnalysis `gorm:"foreignKey:ScriptID" json:"analyses,omitempty"`

	// Content management fields (内容管理)
	Summary                string `json:"summary"`                                  // 剧本总结
	Characters             string `json:"characters"`                               // 人物补充说明
	CharacterProfiles      string `gorm:"type:text" json:"character_profiles"`      // JSON array of structured character profiles
	CharacterRelationships string `gorm:"type:text" json:"character_relationships"` // JSON array of character graph edges
	CoreSettings           string `json:"core_settings"`                            // 核心设定
	Background             string `json:"background"`                               // 故事背景
	ScenesDesc             string `json:"scenes_desc"`                              // 场景描述
	Hook                   string `json:"hook"`                                     // 钩子（分集剧本）
	PlotSummary            string `json:"plot_summary"`                             // 剧情推演总结（分集剧本）
	ScriptPoints           string `gorm:"type:text" json:"script_points"`           // JSON array of structured episode script points
	PlannedSceneCount      int    `json:"planned_scene_count"`                      // 分集计划场次数
	PlannedCharacterCount  int    `json:"planned_character_count"`                  // 分集计划人物数
	TimeText               string `json:"time_text"`                                // 结构化时间/时段
	LocationText           string `json:"location_text"`                            // 结构化地点
	StructuredCharacters   string `gorm:"type:text" json:"structured_characters"`   // JSON array of scene/global characters
	PlotBeats              string `gorm:"type:text" json:"plot_beats"`              // JSON array of structured beats
	Atmosphere             string `json:"atmosphere"`                               // 氛围/情绪基调
	StructureJSON          string `gorm:"type:text" json:"structure_json"`          // Full normalized structured script payload
	EntityCandidates       string `gorm:"type:text" json:"entity_candidates"`       // Candidate entities extracted from raw_source
	RelationshipCandidates string `gorm:"type:text" json:"relationship_candidates"` // Candidate relationships extracted from raw_source
	Order                  int    `json:"order"`                                    // 排序（分集剧本顺序）
}
