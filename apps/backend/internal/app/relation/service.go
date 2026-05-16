package relation

import (
	"context"
	"errors"
	"strings"
	"time"

	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type EdgeFilter struct {
	ProjectID        uint
	Category         string
	Type             string
	Origin           string
	Status           string
	Source           domainrelation.EntityRef
	Target           domainrelation.EntityRef
	MetadataContains string
	At               *time.Time
	AllVersions      bool
}

func (s *Service) ListEdges(ctx context.Context, filter EdgeFilter) ([]domainrelation.Edge, error) {
	return s.repo.ListEdges(ctx, normalizeEdgeFilter(filter))
}

func (s *Service) ListEdgesFrom(ctx context.Context, projectID uint, source domainrelation.EntityRef, category string, edgeType string) ([]domainrelation.Edge, error) {
	return s.ListEdges(ctx, EdgeFilter{ProjectID: projectID, Category: category, Type: edgeType, Source: source})
}

func (s *Service) ListEdgesTo(ctx context.Context, projectID uint, target domainrelation.EntityRef, category string, edgeType string) ([]domainrelation.Edge, error) {
	return s.ListEdges(ctx, EdgeFilter{ProjectID: projectID, Category: category, Type: edgeType, Target: target})
}

type EdgeInput struct {
	ProjectID   uint
	Source      domainrelation.EntityRef
	Target      domainrelation.EntityRef
	Category    string
	Type        string
	Label       string
	Scope       domainrelation.EntityRef
	Order       int
	Weight      float64
	Status      string
	Origin      string
	Evidence    string
	Metadata    string
	CreatedByID *uint
	ValidFrom   *time.Time
}

func (s *Service) UpsertEdge(ctx context.Context, input EdgeInput) (domainrelation.Edge, error) {
	input = normalizeEdgeInput(input)
	if err := validateEdgeInput(input); err != nil {
		return domainrelation.Edge{}, err
	}
	return s.repo.UpsertEdge(ctx, input)
}

func (s *Service) ExpireEdges(ctx context.Context, filter EdgeFilter) error {
	filter = normalizeEdgeFilter(filter)
	if filter.ProjectID == 0 {
		return errors.New("project_id is required")
	}
	return s.repo.ExpireEdges(ctx, filter)
}

func normalizeEdgeFilter(filter EdgeFilter) EdgeFilter {
	filter.Category = strings.TrimSpace(filter.Category)
	filter.Type = strings.TrimSpace(filter.Type)
	filter.Origin = strings.TrimSpace(filter.Origin)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Source.Type = strings.TrimSpace(filter.Source.Type)
	filter.Target.Type = strings.TrimSpace(filter.Target.Type)
	filter.MetadataContains = strings.TrimSpace(filter.MetadataContains)
	return filter
}

func normalizeEdgeInput(input EdgeInput) EdgeInput {
	input.Source.Type = strings.TrimSpace(input.Source.Type)
	input.Target.Type = strings.TrimSpace(input.Target.Type)
	input.Category = strings.TrimSpace(input.Category)
	input.Type = strings.TrimSpace(input.Type)
	input.Label = strings.TrimSpace(input.Label)
	input.Scope.Type = strings.TrimSpace(input.Scope.Type)
	input.Status = strings.TrimSpace(input.Status)
	input.Origin = strings.TrimSpace(input.Origin)
	if input.Weight == 0 {
		input.Weight = 1
	}
	if input.Status == "" {
		input.Status = domainrelation.StatusConfirmed
	}
	if input.Origin == "" {
		input.Origin = domainrelation.OriginSystem
	}
	return input
}

func validateEdgeInput(input EdgeInput) error {
	if input.ProjectID == 0 {
		return errors.New("project_id is required")
	}
	if input.Source.Type == "" || input.Source.ID == 0 {
		return errors.New("source is required")
	}
	if input.Target.Type == "" || input.Target.ID == 0 {
		return errors.New("target is required")
	}
	if input.Category == "" || input.Type == "" {
		return errors.New("category and type are required")
	}
	return nil
}
