package model

import "gorm.io/gorm"

type Project struct {
	gorm.Model
	Name        string          `gorm:"not null" json:"name"`
	Description string          `json:"description"`
	OwnerID     uint            `json:"owner_id"`
	Owner       User            `json:"owner,omitempty"`
	// planning|script_analysis|asset_prep|production|editing|done
	Status           string `gorm:"default:'planning'" json:"status"`
	TotalEpisodes    int    `json:"total_episodes"` // target episode count
	PipelineTemplate string `gorm:"default:'custom'" json:"pipeline_template"` // full_production|from_script|from_storyboard|custom
	Members     []ProjectMember `gorm:"foreignKey:ProjectID" json:"members,omitempty"`
	Scripts     []Script        `gorm:"foreignKey:ProjectID" json:"scripts,omitempty"`
	Assets      []Asset         `gorm:"foreignKey:ProjectID" json:"assets,omitempty"`
}

type ProjectMember struct {
	gorm.Model
	ProjectID uint   `gorm:"not null" json:"project_id"`
	UserID    uint   `gorm:"not null" json:"user_id"`
	User      User   `json:"user,omitempty"`
	Role      string `gorm:"default:'viewer'" json:"role"` // owner | director | writer | generator | viewer
}
