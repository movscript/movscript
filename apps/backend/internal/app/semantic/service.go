package semantic

import (
	"context"
	"errors"
	"fmt"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
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
	repo      repository
	relations relationStore
	cache     cache.Cache
}

type relationStore interface {
	ListEdges(ctx context.Context, filter relationapp.EdgeFilter) ([]domainrelation.Edge, error)
	UpsertEdge(ctx context.Context, input relationapp.EdgeInput) (domainrelation.Edge, error)
	ExpireEdges(ctx context.Context, filter relationapp.EdgeFilter) error
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
	return &Service{repo: newRepository(db), relations: relationapp.NewService(db), cache: c}
}

func (s *Service) withRepository(repo repository) *Service {
	relations := s.relations
	if gormRepo, ok := repo.(*gormRepository); ok {
		relations = relationapp.NewService(gormRepo.db)
	}
	return &Service{repo: repo, relations: relations, cache: s.cache}
}

func (s *Service) bumpProgressVersion(ctx context.Context, projectID uint) {
	if projectID == 0 {
		return
	}
	_, _ = s.cache.BumpVersion(ctx, fmt.Sprintf("project:%d:progress", projectID))
}
