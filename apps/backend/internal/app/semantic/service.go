package semantic

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("semantic item not found")
var ErrScriptNotFound = errors.New("script not found")
var ErrOwnerNotFound = errors.New("semantic owner not found")
var ErrOwnerWrongProject = errors.New("semantic owner does not belong to project")
var ErrOwnerInvalidType = errors.New("semantic owner type is invalid")
var ErrTextBlockNotFound = errors.New("production text block not found")
var ErrSegmentProductionMismatch = errors.New("segment production does not match text block production")

type Service struct {
	db *gorm.DB
}

type ErrInvalidInput struct {
	Err error
}

type ErrForbidden struct {
	Message string
}

func (e ErrForbidden) Error() string {
	if strings.TrimSpace(e.Message) == "" {
		return "forbidden"
	}
	return e.Message
}

func (e ErrInvalidInput) Error() string {
	if e.Err == nil {
		return "invalid semantic input"
	}
	return e.Err.Error()
}

func (e ErrInvalidInput) Unwrap() error {
	return e.Err
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) ListRelations(ctx context.Context, filter RelationFilter) ([]model.EntityRelation, error) {
	items := make([]model.EntityRelation, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if category := strings.TrimSpace(filter.Category); category != "" {
		q = q.Where("category = ?", category)
	}
	if relationType := strings.TrimSpace(filter.Type); relationType != "" {
		q = q.Where("type = ?", relationType)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	if filter.SourceID > 0 {
		q = q.Where("source_id = ?", filter.SourceID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if filter.TargetID > 0 {
		q = q.Where("target_id = ?", filter.TargetID)
	}
	if source := strings.TrimSpace(filter.Source); source != "" {
		q = q.Where("source = ?", source)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("category, type, source_type, source_id, \"order\", target_type, target_id, id").Find(&items).Error
	return items, err
}

func (s *Service) ListRelationsByEntity(ctx context.Context, projectID uint, entityType string, entityID uint, category string, relationType string) ([]model.EntityRelation, error) {
	filter := RelationFilter{
		ProjectID: projectID,
		Category:  category,
		Type:      relationType,
	}
	if strings.TrimSpace(entityType) != "" && entityID > 0 {
		filter.SourceType = entityType
		filter.SourceID = entityID
	}
	return s.ListRelations(ctx, filter)
}

func (s *Service) ListRelationsBySource(ctx context.Context, projectID uint, sourceType string, sourceID uint, category string, relationType string) ([]model.EntityRelation, error) {
	return s.ListRelationsByEntity(ctx, projectID, sourceType, sourceID, category, relationType)
}

func (s *Service) ListRelationsByTarget(ctx context.Context, projectID uint, targetType string, targetID uint, category string, relationType string) ([]model.EntityRelation, error) {
	filter := RelationFilter{
		ProjectID:  projectID,
		Category:   category,
		Type:       relationType,
		TargetType: targetType,
		TargetID:   targetID,
	}
	return s.ListRelations(ctx, filter)
}
