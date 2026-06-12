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
