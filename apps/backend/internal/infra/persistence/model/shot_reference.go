package model

import "gorm.io/gorm"

type ShotReference struct {
	gorm.Model
	OwnerID           uint                `gorm:"not null;index" json:"owner_id"`
	Owner             User                `json:"owner,omitempty"`
	OrgID             *uint               `gorm:"index" json:"org_id,omitempty"`
	GroupID           *uint               `gorm:"index" json:"group_id,omitempty"`
	Group             *ShotReferenceGroup `json:"group,omitempty"`
	ResourceID        uint                `gorm:"not null;index" json:"resource_id"`
	Resource          RawResource         `json:"resource,omitempty"`
	Order             int                 `gorm:"not null;default:0;index" json:"order"`
	StartSec          *float64            `json:"start_sec,omitempty"`
	EndSec            *float64            `json:"end_sec,omitempty"`
	Title             string              `gorm:"not null" json:"title"`
	Summary           string              `gorm:"type:text" json:"summary"`
	AnalysisStatus    string              `gorm:"not null;default:'ready';index" json:"analysis_status"`
	AnalysisSource    string              `gorm:"not null;default:'manual';index" json:"analysis_source"`
	IntentJSON        string              `gorm:"type:text;default:'[]'" json:"intent_json"`
	PatternJSON       string              `gorm:"type:text;default:'[]'" json:"pattern_json"`
	ShotFunctionJSON  string              `gorm:"type:text;default:'[]'" json:"shot_function_json"`
	VisualPrefJSON    string              `gorm:"column:visual_preference_json;type:text;default:'[]'" json:"visual_preference_json"`
	EmotionalJSON     string              `gorm:"column:emotional_effect_json;type:text;default:'[]'" json:"emotional_effect_json"`
	ExecutionJSON     string              `gorm:"column:execution_details_json;type:text;default:'{}'" json:"execution_details_json"`
	RetrievalText     string              `gorm:"type:text;index" json:"retrieval_text"`
	MachineDesc       string              `gorm:"type:text" json:"machine_description"`
	ReusablePrinciple string              `gorm:"type:text" json:"reusable_principle"`
}

type ShotReferenceGroup struct {
	gorm.Model
	OwnerID          uint        `gorm:"not null;index" json:"owner_id"`
	Owner            User        `json:"owner,omitempty"`
	OrgID            *uint       `gorm:"index" json:"org_id,omitempty"`
	SourceResourceID uint        `gorm:"not null;index" json:"source_resource_id"`
	SourceResource   RawResource `gorm:"foreignKey:SourceResourceID" json:"source_resource,omitempty"`
	Title            string      `gorm:"not null" json:"title"`
	Summary          string      `gorm:"type:text" json:"summary"`
	AnalysisStatus   string      `gorm:"not null;default:'ready';index" json:"analysis_status"`
	CutStrategy      string      `gorm:"not null;default:'manual_single';index" json:"cut_strategy"`
}
