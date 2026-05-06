package model

import (
	"encoding/json"
	"fmt"
	"strings"

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
	EntityRelationSourceMigration = "migration"
)

// EntityRelation is the normalized semantic relation graph between project
// entities. Hard ownership foreign keys can stay on source tables; this table
// records the business meaning of those links.
type EntityRelation struct {
	gorm.Model
	ProjectID uint `gorm:"not null;index:idx_entity_relation_project_type" json:"project_id"`

	SourceType string `gorm:"not null;index:idx_entity_relation_source;index:idx_entity_relation_unique,unique" json:"source_type"`
	SourceID   uint   `gorm:"not null;index:idx_entity_relation_source;index:idx_entity_relation_unique,unique" json:"source_id"`
	TargetType string `gorm:"not null;index:idx_entity_relation_target;index:idx_entity_relation_unique,unique" json:"target_type"`
	TargetID   uint   `gorm:"not null;index:idx_entity_relation_target;index:idx_entity_relation_unique,unique" json:"target_id"`

	Category string `gorm:"not null;index:idx_entity_relation_project_type;index:idx_entity_relation_unique,unique" json:"category"`
	Type     string `gorm:"not null;index:idx_entity_relation_project_type;index:idx_entity_relation_unique,unique" json:"type"`
	Label    string `json:"label"`

	ScopeType string `gorm:"index;index:idx_entity_relation_unique,unique" json:"scope_type"`
	ScopeID   *uint  `gorm:"index;index:idx_entity_relation_unique,unique" json:"scope_id,omitempty"`

	Direction string  `gorm:"not null;default:'directed';index" json:"direction"`
	Order     int     `gorm:"not null;default:0;index" json:"order"`
	Weight    float64 `gorm:"not null;default:1" json:"weight"`

	Status string `gorm:"not null;default:'confirmed';index" json:"status"`
	Source string `gorm:"not null;default:'system';index" json:"source"`

	Evidence     string `gorm:"type:text" json:"evidence"`
	MetadataJSON string `gorm:"type:text" json:"metadata_json"`
	CreatedByID  *uint  `gorm:"index" json:"created_by_id,omitempty"`
}

type entityRelationSeed struct {
	ProjectID    uint
	SourceType   string
	SourceID     uint
	TargetType   string
	TargetID     uint
	Category     string
	Type         string
	Label        string
	ScopeType    string
	ScopeID      *uint
	Order        int
	Weight       float64
	Status       string
	Source       string
	Evidence     string
	MetadataJSON string
	CreatedByID  *uint
}

type relationOwner struct {
	sourceType string
	sourceID   uint
	category   string
	types      []string
}

func (s entityRelationSeed) relation() EntityRelation {
	weight := s.Weight
	if weight == 0 {
		weight = 1
	}
	status := strings.TrimSpace(s.Status)
	if status == "" {
		status = EntityRelationStatusConfirmed
	}
	source := strings.TrimSpace(s.Source)
	if source == "" {
		source = EntityRelationSourceSystem
	}
	return EntityRelation{
		ProjectID:    s.ProjectID,
		SourceType:   strings.TrimSpace(s.SourceType),
		SourceID:     s.SourceID,
		TargetType:   strings.TrimSpace(s.TargetType),
		TargetID:     s.TargetID,
		Category:     strings.TrimSpace(s.Category),
		Type:         strings.TrimSpace(s.Type),
		Label:        strings.TrimSpace(s.Label),
		ScopeType:    strings.TrimSpace(s.ScopeType),
		ScopeID:      s.ScopeID,
		Direction:    "directed",
		Order:        s.Order,
		Weight:       weight,
		Status:       status,
		Source:       source,
		Evidence:     s.Evidence,
		MetadataJSON: s.MetadataJSON,
		CreatedByID:  s.CreatedByID,
	}
}

func syncEntityRelations(tx *gorm.DB, owners []relationOwner, seeds []entityRelationSeed) error {
	if tx == nil {
		return nil
	}
	for _, owner := range owners {
		if owner.sourceType == "" || owner.sourceID == 0 || owner.category == "" || len(owner.types) == 0 {
			continue
		}
		if err := tx.Where(
			"source_type = ? AND source_id = ? AND category = ? AND type IN ?",
			owner.sourceType, owner.sourceID, owner.category, owner.types,
		).Unscoped().Delete(&EntityRelation{}).Error; err != nil {
			return err
		}
	}
	for _, seed := range seeds {
		if seed.ProjectID == 0 || seed.SourceType == "" || seed.SourceID == 0 || seed.TargetType == "" || seed.TargetID == 0 || seed.Category == "" || seed.Type == "" {
			continue
		}
		relation := seed.relation()
		query := tx.Where(
			"project_id = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND category = ? AND type = ? AND scope_type = ?",
			relation.ProjectID, relation.SourceType, relation.SourceID, relation.TargetType, relation.TargetID,
			relation.Category, relation.Type, relation.ScopeType,
		)
		if relation.ScopeID == nil {
			query = query.Where("scope_id IS NULL")
		} else {
			query = query.Where("scope_id = ?", *relation.ScopeID)
		}
		err := query.Assign(relation).FirstOrCreate(&relation).Error
		if err != nil {
			return err
		}
	}
	return nil
}

func deleteEntityRelations(tx *gorm.DB, entityType string, entityID uint) error {
	if tx == nil || entityType == "" || entityID == 0 {
		return nil
	}
	return tx.Where(
		"(source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)",
		entityType, entityID, entityType, entityID,
	).Unscoped().Delete(&EntityRelation{}).Error
}

func deleteSourceEntityRelations(tx *gorm.DB, sourceType string, sourceID uint, category string, types []string) error {
	if tx == nil || sourceType == "" || sourceID == 0 || category == "" || len(types) == 0 {
		return nil
	}
	return tx.Where(
		"source_type = ? AND source_id = ? AND category = ? AND type IN ?",
		sourceType, sourceID, category, types,
	).Unscoped().Delete(&EntityRelation{}).Error
}

func deleteTargetEntityRelations(tx *gorm.DB, targetType string, targetID uint, category string, types []string) error {
	if tx == nil || targetType == "" || targetID == 0 || category == "" || len(types) == 0 {
		return nil
	}
	return tx.Where(
		"target_type = ? AND target_id = ? AND category = ? AND type IN ?",
		targetType, targetID, category, types,
	).Unscoped().Delete(&EntityRelation{}).Error
}

func deleteMetadataEntityRelations(tx *gorm.DB, marker string, id uint) error {
	if tx == nil || marker == "" || id == 0 {
		return nil
	}
	return tx.Where("metadata_json LIKE ?", fmt.Sprintf("%%%q:%d%%", marker, id)).Unscoped().Delete(&EntityRelation{}).Error
}

func relationMetadata(values map[string]any) string {
	if len(values) == 0 {
		return ""
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return ""
	}
	return string(raw)
}

func relationSource(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return EntityRelationSourceSystem
	}
	return source
}

func relationStatus(status string) string {
	status = strings.TrimSpace(status)
	switch status {
	case "", "active", "locked", "selected", "approved", "confirmed":
		return EntityRelationStatusConfirmed
	case "ignored", "rejected", "archived":
		return status
	default:
		return status
	}
}

func relationTypeList(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, value)
		}
	}
	return out
}
