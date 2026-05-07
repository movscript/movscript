package audit

import "time"

type Log struct {
	ID         uint       `json:"ID"`
	RequestID  string     `json:"request_id"`
	ActorID    *uint      `json:"actor_id,omitempty"`
	Action     string     `json:"action"`
	TargetType string     `json:"target_type"`
	TargetID   string     `json:"target_id"`
	OrgID      *uint      `json:"org_id,omitempty"`
	ProjectID  *uint      `json:"project_id,omitempty"`
	IPAddress  string     `json:"ip_address,omitempty"`
	UserAgent  string     `json:"user_agent,omitempty"`
	Metadata   string     `json:"metadata,omitempty"`
	CreatedAt  time.Time  `json:"CreatedAt"`
	UpdatedAt  time.Time  `json:"UpdatedAt"`
	DeletedAt  *time.Time `json:"DeletedAt"`
}
