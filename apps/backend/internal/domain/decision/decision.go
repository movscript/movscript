package decision

import (
	"encoding/json"
	"time"
)

const (
	StatusOpen     = "open"
	StatusSelected = "selected"
)

type Context struct {
	ID         uint              `json:"ID"`
	ProjectID  uint              `json:"project_id"`
	TargetKind string            `json:"target_kind"`
	TargetRef  string            `json:"target_ref"`
	Candidates []json.RawMessage `json:"candidates"`
	Selection  json.RawMessage   `json:"selection,omitempty"`
	Status     string            `json:"status"`
	CreatedBy  *uint             `json:"created_by,omitempty"`
	UpdatedBy  *uint             `json:"updated_by,omitempty"`
	CreatedAt  time.Time         `json:"CreatedAt"`
	UpdatedAt  time.Time         `json:"UpdatedAt"`
}

type CandidateSelection struct {
	CandidateID       string          `json:"candidate_id,omitempty"`
	ResourceID        *uint           `json:"resource_id,omitempty"`
	AcceptedInputHash string          `json:"accepted_input_hash,omitempty"`
	StalePolicy       string          `json:"stale_policy,omitempty"`
	Reason            string          `json:"reason,omitempty"`
	SelectedAt        string          `json:"selected_at,omitempty"`
	SelectedBy        *uint           `json:"selected_by,omitempty"`
	Metadata          json.RawMessage `json:"metadata,omitempty"`
}
