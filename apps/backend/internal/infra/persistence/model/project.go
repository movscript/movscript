package model

import "gorm.io/gorm"

type Project struct {
	gorm.Model
	Name          string          `gorm:"not null" json:"name"`
	Description   string          `json:"description"`
	OwnerID       uint            `json:"owner_id"`
	Owner         User            `json:"owner,omitempty"`
	OrgID         *uint           `gorm:"index" json:"org_id,omitempty"`
	Organization  Organization    `gorm:"foreignKey:OrgID" json:"organization,omitempty"`
	TotalEpisodes int             `json:"total_episodes"`
	AspectRatio   string          `gorm:"default:''" json:"aspect_ratio"`
	VisualStyle   string          `gorm:"type:text" json:"visual_style"`
	ProjectStyle  string          `gorm:"type:text" json:"project_style"`
	Members       []ProjectMember `gorm:"foreignKey:ProjectID" json:"members,omitempty"`
}

type ProjectRepository struct {
	gorm.Model
	ProjectID      uint    `gorm:"not null;uniqueIndex" json:"project_id"`
	Project        Project `gorm:"foreignKey:ProjectID" json:"project,omitempty"`
	Provider       string  `gorm:"not null;default:'gitea';size:32;index" json:"provider"`
	ProviderRepoID string  `gorm:"size:128" json:"provider_repo_id,omitempty"`
	Owner          string  `gorm:"not null;size:128;index" json:"owner"`
	Repo           string  `gorm:"not null;size:128;index" json:"repo"`
	DefaultBranch  string  `gorm:"not null;default:'main';size:128" json:"default_branch"`
	HeadCommit     string  `gorm:"size:128" json:"head_commit,omitempty"`
	Status         string  `gorm:"not null;default:'provisioning';size:32;index" json:"status"`
	LastSyncError  string  `gorm:"type:text" json:"last_sync_error,omitempty"`
	CreatedBy      *uint   `gorm:"index" json:"created_by,omitempty"`
}

type ProjectMember struct {
	gorm.Model
	ProjectID uint   `gorm:"not null" json:"project_id"`
	UserID    uint   `gorm:"not null" json:"user_id"`
	User      User   `json:"user,omitempty"`
	Role      string `gorm:"default:'viewer'" json:"role"` // owner | director | writer | generator | viewer
}
