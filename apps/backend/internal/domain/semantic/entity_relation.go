package semantic

import "time"

type EntityRelation struct {
	ID           uint      `json:"ID"`
	ProjectID    uint      `json:"project_id"`
	SourceType   string    `json:"source_type"`
	SourceID     uint      `json:"source_id"`
	TargetType   string    `json:"target_type"`
	TargetID     uint      `json:"target_id"`
	Category     string    `json:"category"`
	Type         string    `json:"type"`
	Label        string    `json:"label"`
	ScopeType    string    `json:"scope_type"`
	ScopeID      *uint     `json:"scope_id,omitempty"`
	Direction    string    `json:"direction"`
	Order        int       `json:"order"`
	Weight       float64   `json:"weight"`
	Status       string    `json:"status"`
	Source       string    `json:"source"`
	Evidence     string    `json:"evidence"`
	MetadataJSON string    `json:"metadata_json"`
	CreatedByID  *uint     `json:"created_by_id,omitempty"`
	CreatedAt    time.Time `json:"CreatedAt"`
	UpdatedAt    time.Time `json:"UpdatedAt"`
}
