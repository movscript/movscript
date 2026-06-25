package audit

import (
	"context"
	"time"

	domainaudit "github.com/movscript/movscript/internal/domain/audit"
	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	ActorID    string
	Action     string
	TargetType string
	TargetID   string
	OrgID      string
	ProjectID  string
	Since      *time.Time
	Until      *time.Time
	Page       int
	PageSize   int
}

type Page struct {
	Items    []domainaudit.Log `json:"items"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

type SummaryTotals struct {
	Records      int64 `json:"records"`
	UniqueActors int64 `json:"unique_actors"`
}

type ActionSummary struct {
	Action string `json:"action"`
	Count  int64  `json:"count"`
}

type TargetSummary struct {
	TargetType string `json:"target_type"`
	Count      int64  `json:"count"`
}

type ActorSummary struct {
	ActorID uint  `json:"actor_id"`
	Count   int64 `json:"count"`
}

type Summary struct {
	Totals      SummaryTotals   `json:"totals"`
	TopActions  []ActionSummary `json:"top_actions"`
	TopTargets  []TargetSummary `json:"top_targets"`
	TopActors   []ActorSummary  `json:"top_actors"`
	GeneratedAt time.Time       `json:"generated_at"`
}

func (s *Service) List(ctx context.Context, filter ListFilter) (Page, error) {
	return s.repo.ListLogs(ctx, filter)
}

func (s *Service) Export(ctx context.Context, filter ListFilter, limit int) ([]domainaudit.Log, error) {
	if limit <= 0 {
		limit = 1000
	}
	if limit > 5000 {
		limit = 5000
	}
	return s.repo.ExportLogs(ctx, filter, limit)
}

func (s *Service) Summary(ctx context.Context, filter ListFilter) (Summary, error) {
	summary, err := s.repo.Summary(ctx, filter)
	if err != nil {
		return Summary{}, err
	}
	summary.GeneratedAt = time.Now().UTC()
	return summary, nil
}
