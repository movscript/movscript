package model

import "gorm.io/gorm"

// CreativeReference is the unified project bible item: character, place,
// product, brand, style, rule, time period, restriction, and so on.
type CreativeReference struct {
	gorm.Model
	ProjectID        uint     `gorm:"not null;index" json:"project_id"`
	SourceScriptID   *uint    `gorm:"index" json:"source_script_id,omitempty"`
	SourceAnalysisID *uint    `gorm:"index" json:"source_analysis_id,omitempty"`
	LegacySettingID  *uint    `gorm:"index" json:"legacy_setting_id,omitempty"`
	LegacySetting    *Setting `gorm:"foreignKey:LegacySettingID" json:"legacy_setting,omitempty"`
	Kind             string   `gorm:"not null;index" json:"kind"` // person|animal|place|prop|product|brand|style|world_rule|time_period|restriction
	Name             string   `gorm:"not null;index" json:"name"`
	Alias            string   `json:"alias"`
	Description      string   `gorm:"type:text" json:"description"`
	Content          string   `gorm:"type:text" json:"content"`
	Importance       string   `gorm:"not null;default:'supporting';index" json:"importance"` // main|supporting|background
	Status           string   `gorm:"not null;default:'draft';index" json:"status"`          // draft|confirmed|merged|ignored|locked
	ProfileJSON      string   `gorm:"type:text" json:"profile_json"`
	TagsJSON         string   `gorm:"type:text" json:"tags_json"`
}

// CreativeReferenceState stores a scoped temporary expression of a creative
// reference. It should exist only when the reference changes across script,
// section, sceneMoment, content unit, or time period.
type CreativeReferenceState struct {
	gorm.Model
	ProjectID           uint               `gorm:"not null;index" json:"project_id"`
	CreativeReferenceID uint               `gorm:"not null;index" json:"creative_reference_id"`
	CreativeReference   *CreativeReference `gorm:"foreignKey:CreativeReferenceID" json:"creative_reference,omitempty"`
	ScopeType           string             `gorm:"not null;index" json:"scope_type"` // script|segment|sceneMoment|content_unit|time_period
	ScopeID             *uint              `gorm:"index" json:"scope_id,omitempty"`
	Name                string             `gorm:"not null" json:"name"`
	Description         string             `gorm:"type:text" json:"description"`
	VisualNotes         string             `gorm:"type:text" json:"visual_notes"`
	Emotion             string             `json:"emotion"`
	Costume             string             `json:"costume"`
	Props               string             `gorm:"type:text" json:"props"`
	Status              string             `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|locked|ignored
	TagsJSON            string             `gorm:"type:text" json:"tags_json"`
	MetadataJSON        string             `gorm:"type:text" json:"metadata_json"`
}

// CreativeReferenceUsage records which creative reference state a structure
// object should use. This is what keeps continuity across AI generation.
type CreativeReferenceUsage struct {
	gorm.Model
	ProjectID                uint                    `gorm:"not null;index" json:"project_id"`
	OwnerType                string                  `gorm:"not null;index:idx_creative_usage_owner" json:"owner_type"` // segment|sceneMoment|content_unit|keyframe
	OwnerID                  uint                    `gorm:"not null;index:idx_creative_usage_owner" json:"owner_id"`
	CreativeReferenceID      uint                    `gorm:"not null;index" json:"creative_reference_id"`
	CreativeReference        *CreativeReference      `gorm:"foreignKey:CreativeReferenceID" json:"creative_reference,omitempty"`
	CreativeReferenceStateID *uint                   `gorm:"index" json:"creative_reference_state_id,omitempty"`
	CreativeReferenceState   *CreativeReferenceState `gorm:"foreignKey:CreativeReferenceStateID" json:"creative_reference_state,omitempty"`
	Role                     string                  `json:"role"` // protagonist|supporting|location|prop|style|brand|rule
	Order                    int                     `json:"order"`
	Evidence                 string                  `gorm:"type:text" json:"evidence"`
	Source                   string                  `gorm:"not null;default:'manual';index" json:"source"` // ai|manual|import
	Status                   string                  `gorm:"not null;default:'draft';index" json:"status"`  // draft|confirmed|corrected|ignored
	MetadataJSON             string                  `gorm:"type:text" json:"metadata_json"`
}

type CreativeRelationship struct {
	gorm.Model
	ProjectID                 uint               `gorm:"not null;index" json:"project_id"`
	SourceCreativeReferenceID uint               `gorm:"not null;index" json:"source_creative_reference_id"`
	SourceCreativeReference   *CreativeReference `gorm:"foreignKey:SourceCreativeReferenceID" json:"source_creative_reference,omitempty"`
	TargetCreativeReferenceID uint               `gorm:"not null;index" json:"target_creative_reference_id"`
	TargetCreativeReference   *CreativeReference `gorm:"foreignKey:TargetCreativeReferenceID" json:"target_creative_reference,omitempty"`
	ScopeType                 string             `gorm:"index" json:"scope_type"` // project|script|segment|sceneMoment|content_unit
	ScopeID                   *uint              `gorm:"index" json:"scope_id,omitempty"`
	Category                  string             `gorm:"not null;default:'relationship';index" json:"category"`
	Type                      string             `json:"type"`
	Label                     string             `json:"label"`
	Description               string             `gorm:"type:text" json:"description"`
	Source                    string             `gorm:"default:'manual'" json:"source"`               // ai|manual|import
	Status                    string             `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|corrected|ignored
	Evidence                  string             `gorm:"type:text" json:"evidence"`
	MetadataJSON              string             `gorm:"type:text" json:"metadata_json"`
}
