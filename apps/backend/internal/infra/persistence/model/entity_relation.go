package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	EntityRelationCategoryStructure = "structure"
	EntityRelationCategoryCreative  = "creative"
	EntityRelationCategoryAsset     = "asset"
	EntityRelationCategoryWorkflow  = "workflow"
	EntityRelationCategoryDelivery  = "delivery"

	EntityRelationTypeOwns         = "owns"
	EntityRelationTypeContains     = "contains"
	EntityRelationTypeUses         = "uses"
	EntityRelationTypeHasVersion   = "has_version"
	EntityRelationTypeDerivedFrom  = "derived_from"
	EntityRelationTypeUsesPreview  = "uses_preview"
	EntityRelationTypeHasAsset     = "has_asset"
	EntityRelationTypeNeedsAsset   = "needs_asset"
	EntityRelationTypeUsesAsset    = "uses_asset"
	EntityRelationTypeUsesResource = "uses_resource"
	EntityRelationTypeHasState     = "has_state"
	EntityRelationTypeBasedOn      = "based_on"
	EntityRelationTypeRepresents   = "represents"
	EntityRelationTypeHasKeyframe  = "has_keyframe"
	EntityRelationTypeCompilesTo   = "compiles_to"
	EntityRelationTypeCandidateFor = "candidate_for"
	EntityRelationTypeLocks        = "locks"
	EntityRelationTypeRelatedTo    = "related_to"
	EntityRelationTypeTargets      = "targets"
	EntityRelationTypeBlocks       = "blocks"
	EntityRelationTypeDependsOn    = "depends_on"
	EntityRelationTypeProduces     = "produces"
	EntityRelationTypeDecides      = "decides"
	EntityRelationTypeAppliesTo    = "applies_to"
	EntityRelationTypeReviews      = "reviews"
	EntityRelationTypeAttachedTo   = "attached_to"
	EntityRelationTypeExports      = "exports"

	EntityRelationStatusConfirmed = "confirmed"
	EntityRelationSourceSystem    = "system"
)

// EntityRelation is the normalized semantic relation graph between project
// entities. Hard ownership foreign keys can stay on source tables; this table
// records the business meaning of those links.
type EntityRelation struct {
	gorm.Model
	ProjectID uint `gorm:"not null;index:idx_entity_relation_project_type" json:"project_id"`

	SourceType string `gorm:"not null;index:idx_entity_relation_source;index:idx_entity_relation_identity" json:"source_type"`
	SourceID   uint   `gorm:"not null;index:idx_entity_relation_source;index:idx_entity_relation_identity" json:"source_id"`
	TargetType string `gorm:"not null;index:idx_entity_relation_target;index:idx_entity_relation_identity" json:"target_type"`
	TargetID   uint   `gorm:"not null;index:idx_entity_relation_target;index:idx_entity_relation_identity" json:"target_id"`

	Category string `gorm:"not null;index:idx_entity_relation_project_type;index:idx_entity_relation_identity" json:"category"`
	Type     string `gorm:"not null;index:idx_entity_relation_project_type;index:idx_entity_relation_identity" json:"type"`
	Label    string `json:"label"`

	ScopeType string `gorm:"index;index:idx_entity_relation_identity" json:"scope_type"`
	ScopeID   *uint  `gorm:"index;index:idx_entity_relation_identity" json:"scope_id,omitempty"`

	Direction string  `gorm:"not null;default:'directed';index" json:"direction"`
	Order     int     `gorm:"not null;default:0;index" json:"order"`
	Weight    float64 `gorm:"not null;default:1" json:"weight"`

	Status string `gorm:"not null;default:'confirmed';index" json:"status"`
	Source string `gorm:"not null;default:'system';index" json:"source"`

	Evidence     string `gorm:"type:text" json:"evidence"`
	MetadataJSON string `gorm:"type:text" json:"metadata_json"`
	CreatedByID  *uint  `gorm:"index" json:"created_by_id,omitempty"`

	ValidFrom      time.Time  `gorm:"not null;default:CURRENT_TIMESTAMP;index:idx_entity_relation_validity;index:idx_entity_relation_identity" json:"valid_from"`
	ValidTo        *time.Time `gorm:"index:idx_entity_relation_validity" json:"valid_to,omitempty"`
	Revision       int        `gorm:"not null;default:1;index:idx_entity_relation_identity" json:"revision"`
	PreviousID     *uint      `gorm:"index" json:"previous_id,omitempty"`
	SupersededByID *uint      `gorm:"index" json:"superseded_by_id,omitempty"`
}

func (relation *EntityRelation) BeforeCreate(*gorm.DB) error {
	if relation.ValidFrom.IsZero() {
		relation.ValidFrom = time.Now().UTC()
	}
	if relation.Revision <= 0 {
		relation.Revision = 1
	}
	return nil
}
