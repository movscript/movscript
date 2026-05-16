package relation

import "time"

const (
	CategoryStructure = "structure"
	CategoryCreative  = "creative"
	CategoryAsset     = "asset"
	CategoryWorkflow  = "workflow"
	CategoryDelivery  = "delivery"

	TypeOwns         = "owns"
	TypeContains     = "contains"
	TypeUses         = "uses"
	TypeHasVersion   = "has_version"
	TypeDerivedFrom  = "derived_from"
	TypeUsesPreview  = "uses_preview"
	TypeHasAsset     = "has_asset"
	TypeNeedsAsset   = "needs_asset"
	TypeUsesAsset    = "uses_asset"
	TypeUsesResource = "uses_resource"
	TypeHasState     = "has_state"
	TypeBasedOn      = "based_on"
	TypeRepresents   = "represents"
	TypeHasKeyframe  = "has_keyframe"
	TypeCompilesTo   = "compiles_to"
	TypeCandidateFor = "candidate_for"
	TypeLocks        = "locks"
	TypeRelatedTo    = "related_to"
	TypeTargets      = "targets"
	TypeBlocks       = "blocks"
	TypeDependsOn    = "depends_on"
	TypeProduces     = "produces"
	TypeDecides      = "decides"
	TypeAppliesTo    = "applies_to"
	TypeReviews      = "reviews"
	TypeAttachedTo   = "attached_to"
	TypeExports      = "exports"

	StatusConfirmed = "confirmed"
	OriginSystem    = "system"
)

type EntityRef struct {
	Type string `json:"type"`
	ID   uint   `json:"id"`
}

func NewEntityRef(entityType string, entityID uint) EntityRef {
	return EntityRef{Type: entityType, ID: entityID}
}

type Edge struct {
	ID          uint       `json:"ID"`
	ProjectID   uint       `json:"project_id"`
	Source      EntityRef  `json:"source"`
	Target      EntityRef  `json:"target"`
	Category    string     `json:"category"`
	Type        string     `json:"type"`
	Label       string     `json:"label"`
	Scope       EntityRef  `json:"scope,omitempty"`
	Direction   string     `json:"direction"`
	Order       int        `json:"order"`
	Weight      float64    `json:"weight"`
	Status      string     `json:"status"`
	Origin      string     `json:"origin"`
	Evidence    string     `json:"evidence"`
	Metadata    string     `json:"metadata_json"`
	CreatedByID *uint      `json:"created_by_id,omitempty"`
	ValidFrom   time.Time  `json:"valid_from"`
	ValidTo     *time.Time `json:"valid_to,omitempty"`
	Revision    int        `json:"revision"`
	PreviousID  *uint      `json:"previous_id,omitempty"`
	CreatedAt   time.Time  `json:"CreatedAt"`
	UpdatedAt   time.Time  `json:"UpdatedAt"`
}
