package semantic

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/cache"
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
	db    *gorm.DB
	repo  repository
	cache cache.Cache
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

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{db: db, repo: newRepository(db), cache: c}
}

func (s *Service) bumpProgressVersion(ctx context.Context, projectID uint) {
	if projectID == 0 {
		return
	}
	_, _ = s.cache.BumpVersion(ctx, fmt.Sprintf("project:%d:progress", projectID))
}

func (s *Service) ListRelations(ctx context.Context, filter RelationFilter) ([]model.EntityRelation, error) {
	return s.repo.ListRelations(ctx, filter)
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
