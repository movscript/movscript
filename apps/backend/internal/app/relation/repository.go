package relation

import (
	"context"
	"errors"
	"time"

	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListEdges(ctx context.Context, filter EdgeFilter) ([]domainrelation.Edge, error)
	UpsertEdge(ctx context.Context, input EdgeInput) (domainrelation.Edge, error)
	ExpireEdges(ctx context.Context, filter EdgeFilter) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListEdges(ctx context.Context, filter EdgeFilter) ([]domainrelation.Edge, error) {
	items := make([]persistencemodel.EntityRelation, 0)
	q := relationFilterQuery(r.db.WithContext(ctx), filter)
	if filter.At != nil {
		q = q.Where("valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)", *filter.At, *filter.At)
	} else if !filter.AllVersions {
		q = q.Where("valid_to IS NULL")
	}
	if err := q.Order("category, type, source_type, source_id, \"order\", target_type, target_id, id").Find(&items).Error; err != nil {
		return nil, err
	}
	return domainrelation.EdgesFromModels(items), nil
}

func (r *gormRepository) ExpireEdges(ctx context.Context, filter EdgeFilter) error {
	now := time.Now().UTC()
	return relationFilterQuery(r.db.WithContext(ctx), filter).
		Model(&persistencemodel.EntityRelation{}).
		Where("valid_to IS NULL").
		Update("valid_to", now).Error
}

func relationFilterQuery(db *gorm.DB, filter EdgeFilter) *gorm.DB {
	q := db.Where("project_id = ?", filter.ProjectID)
	if filter.Category != "" {
		q = q.Where("category = ?", filter.Category)
	}
	if filter.Type != "" {
		q = q.Where("type = ?", filter.Type)
	}
	if filter.Source.Type != "" {
		q = q.Where("source_type = ?", filter.Source.Type)
	}
	if filter.Source.ID > 0 {
		q = q.Where("source_id = ?", filter.Source.ID)
	}
	if filter.Target.Type != "" {
		q = q.Where("target_type = ?", filter.Target.Type)
	}
	if filter.Target.ID > 0 {
		q = q.Where("target_id = ?", filter.Target.ID)
	}
	if filter.Origin != "" {
		q = q.Where("source = ?", filter.Origin)
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if filter.MetadataContains != "" {
		q = q.Where("metadata_json LIKE ?", "%"+filter.MetadataContains+"%")
	}
	return q
}

func (r *gormRepository) UpsertEdge(ctx context.Context, input EdgeInput) (domainrelation.Edge, error) {
	var created persistencemodel.EntityRelation
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var active persistencemodel.EntityRelation
		err := activeEdgeQuery(tx, input).First(&active).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil && edgeMatchesInput(active, input) {
			created = active
			return nil
		}

		now := time.Now().UTC()
		validFrom := now
		if input.ValidFrom != nil && !input.ValidFrom.IsZero() {
			validFrom = input.ValidFrom.UTC()
		}
		revision := 1
		var previousID *uint
		if err == nil {
			revision = active.Revision + 1
			previousID = &active.ID
			if err := tx.Model(&active).Updates(map[string]any{"valid_to": validFrom}).Error; err != nil {
				return err
			}
		} else {
			var previous persistencemodel.EntityRelation
			latestErr := identityEdgeQuery(tx, input).First(&previous).Error
			if latestErr != nil && !errors.Is(latestErr, gorm.ErrRecordNotFound) {
				return latestErr
			}
			if latestErr == nil {
				revision = previous.Revision + 1
				previousID = &previous.ID
			}
		}

		created = entityRelationFromInput(input, validFrom, revision, previousID)
		if err := tx.Create(&created).Error; err != nil {
			return err
		}
		if previousID != nil {
			if err := tx.Model(&persistencemodel.EntityRelation{}).Where("id = ?", *previousID).Update("superseded_by_id", created.ID).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return domainrelation.Edge{}, err
	}
	return domainrelation.EdgeFromModel(created), nil
}

func activeEdgeQuery(tx *gorm.DB, input EdgeInput) *gorm.DB {
	return identityEdgeQuery(tx, input).Where("valid_to IS NULL")
}

func identityEdgeQuery(tx *gorm.DB, input EdgeInput) *gorm.DB {
	q := tx.Where(
		"project_id = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND category = ? AND type = ? AND scope_type = ?",
		input.ProjectID, input.Source.Type, input.Source.ID, input.Target.Type, input.Target.ID,
		input.Category, input.Type, input.Scope.Type,
	)
	if input.Scope.ID == 0 {
		q = q.Where("scope_id IS NULL")
	} else {
		q = q.Where("scope_id = ?", input.Scope.ID)
	}
	return q.Order("revision desc, id desc")
}

func edgeMatchesInput(edge persistencemodel.EntityRelation, input EdgeInput) bool {
	return edge.Label == input.Label &&
		edge.Direction == "directed" &&
		edge.Order == input.Order &&
		edge.Weight == input.Weight &&
		edge.Status == input.Status &&
		edge.Source == input.Origin &&
		edge.Evidence == input.Evidence &&
		edge.MetadataJSON == input.Metadata &&
		sameUintPointer(edge.CreatedByID, input.CreatedByID)
}

func sameUintPointer(left *uint, right *uint) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func entityRelationFromInput(input EdgeInput, validFrom time.Time, revision int, previousID *uint) persistencemodel.EntityRelation {
	relation := persistencemodel.EntityRelation{
		ProjectID:    input.ProjectID,
		SourceType:   input.Source.Type,
		SourceID:     input.Source.ID,
		TargetType:   input.Target.Type,
		TargetID:     input.Target.ID,
		Category:     input.Category,
		Type:         input.Type,
		Label:        input.Label,
		ScopeType:    input.Scope.Type,
		Direction:    "directed",
		Order:        input.Order,
		Weight:       input.Weight,
		Status:       input.Status,
		Source:       input.Origin,
		Evidence:     input.Evidence,
		MetadataJSON: input.Metadata,
		CreatedByID:  input.CreatedByID,
		ValidFrom:    validFrom,
		Revision:     revision,
		PreviousID:   previousID,
	}
	if input.Scope.ID > 0 {
		relation.ScopeID = &input.Scope.ID
	}
	return relation
}
