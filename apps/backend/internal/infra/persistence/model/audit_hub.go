package model

import "gorm.io/gorm"

type AuditLog struct {
	gorm.Model
	RequestID  string `gorm:"index" json:"request_id"`
	ActorID    *uint  `gorm:"index" json:"actor_id,omitempty"`
	Action     string `gorm:"index;not null" json:"action"`
	TargetType string `gorm:"index" json:"target_type"`
	TargetID   string `gorm:"index" json:"target_id"`
	OrgID      *uint  `gorm:"index" json:"org_id,omitempty"`
	ProjectID  *uint  `gorm:"index" json:"project_id,omitempty"`
	IPAddress  string `json:"ip_address,omitempty"`
	UserAgent  string `json:"user_agent,omitempty"`
	Metadata   string `gorm:"type:text" json:"metadata,omitempty"`
}

type HubPackage struct {
	gorm.Model
	PackageID       string  `gorm:"uniqueIndex;not null;size:160" json:"id"`
	Title           string  `gorm:"not null;size:200" json:"title"`
	Kind            string  `gorm:"not null;size:32;index" json:"kind"`
	Category        string  `gorm:"size:120" json:"category"`
	Creator         string  `gorm:"size:160" json:"creator"`
	License         string  `gorm:"size:160" json:"license"`
	Signal          string  `gorm:"size:120" json:"signal"`
	Summary         string  `gorm:"type:text" json:"summary"`
	Tags            string  `gorm:"type:text;default:'[]'" json:"-"`
	Downloads       int64   `gorm:"not null;default:0" json:"downloads"`
	Rating          float64 `gorm:"not null;default:4.0" json:"rating"`
	Version         string  `gorm:"size:64" json:"version"`
	FileSizeBytes   int64   `gorm:"not null;default:0" json:"file_size_bytes"`
	FileName        string  `gorm:"size:255" json:"file_name"`
	ContentType     string  `gorm:"size:160" json:"content_type"`
	Compatibility   string  `gorm:"size:160" json:"compatibility"`
	Repository      string  `gorm:"size:512" json:"repository"`
	Status          string  `gorm:"not null;default:'pending';size:32;index" json:"status"`
	SubmittedBy     string  `gorm:"size:160" json:"submitted_by"`
	ReviewedBy      string  `gorm:"size:160" json:"reviewed_by"`
	ReviewNote      string  `gorm:"type:text" json:"review_note"`
	StagingProvider string  `gorm:"size:64" json:"staging_provider"`
	StagingKey      string  `gorm:"size:1024" json:"staging_key"`
	PublicProvider  string  `gorm:"size:64" json:"public_provider"`
	PublicKey       string  `gorm:"size:1024" json:"public_key"`
	PublishedAt     *int64  `gorm:"index" json:"published_at,omitempty"`
	TakenDownAt     *int64  `gorm:"index" json:"taken_down_at,omitempty"`
}
