package model

import "gorm.io/gorm"

type DecisionContext struct {
	gorm.Model
	ProjectID      uint   `gorm:"not null;uniqueIndex:uidx_decision_context_target;index" json:"project_id"`
	TargetKind     string `gorm:"not null;size:64;uniqueIndex:uidx_decision_context_target" json:"target_kind"`
	TargetRef      string `gorm:"not null;size:512;uniqueIndex:uidx_decision_context_target" json:"target_ref"`
	CandidatesJSON string `gorm:"type:text;not null;default:'[]'" json:"candidates_json"`
	SelectionJSON  string `gorm:"type:text;not null;default:'{}'" json:"selection_json"`
	Status         string `gorm:"not null;default:'open';size:32;index" json:"status"`
	CreatedBy      *uint  `gorm:"index" json:"created_by,omitempty"`
	UpdatedBy      *uint  `gorm:"index" json:"updated_by,omitempty"`
}

type ProjectDataSpace struct {
	gorm.Model
	ScopeKind  string `gorm:"not null;size:16;uniqueIndex:uidx_project_data_space_scope" json:"scope_kind"`
	ScopeID    string `gorm:"not null;size:128;uniqueIndex:uidx_project_data_space_scope" json:"scope_id"`
	ProjectUID string `gorm:"not null;size:128;uniqueIndex:uidx_project_data_space_scope;index" json:"project_uid"`
	Title      string `gorm:"size:255" json:"title,omitempty"`
	Status     string `gorm:"not null;default:'active';size:32;index" json:"status"`
	CreatedBy  *uint  `gorm:"index" json:"created_by,omitempty"`
	UpdatedBy  *uint  `gorm:"index" json:"updated_by,omitempty"`
}

type ProjectDataDecisionContext struct {
	gorm.Model
	ProjectDataSpaceID uint             `gorm:"not null;uniqueIndex:uidx_project_data_decision_target;index" json:"project_data_space_id"`
	ProjectDataSpace   ProjectDataSpace `gorm:"foreignKey:ProjectDataSpaceID" json:"project_data_space,omitempty"`
	TargetKind         string           `gorm:"not null;size:64;uniqueIndex:uidx_project_data_decision_target" json:"target_kind"`
	TargetRef          string           `gorm:"not null;size:512;uniqueIndex:uidx_project_data_decision_target" json:"target_ref"`
	CandidatesJSON     string           `gorm:"type:text;not null;default:'[]'" json:"candidates_json"`
	SelectionJSON      string           `gorm:"type:text;not null;default:'{}'" json:"selection_json"`
	Status             string           `gorm:"not null;default:'open';size:32;index" json:"status"`
	CreatedBy          *uint            `gorm:"index" json:"created_by,omitempty"`
	UpdatedBy          *uint            `gorm:"index" json:"updated_by,omitempty"`
}
