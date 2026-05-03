package semantic

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/model"
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
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("category, type, source_type, source_id, \"order\", target_type, target_id, id").Find(&items).Error
	return items, err
}
