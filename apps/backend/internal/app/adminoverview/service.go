package adminoverview

import (
	"context"
	"time"

	"gorm.io/gorm"
)

type CountSummary struct {
	Total int64 `json:"total"`
}

type UserSummary struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Disabled int64 `json:"disabled"`
}

type OrgSummary struct {
	Total     int64 `json:"total"`
	Suspended int64 `json:"suspended"`
}

type ModelSummary struct {
	Credentials        int64 `json:"credentials"`
	EnabledCredentials int64 `json:"enabled_credentials"`
	Configs            int64 `json:"configs"`
	EnabledConfigs     int64 `json:"enabled_configs"`
}

type JobSummary struct {
	Total     int64 `json:"total"`
	Pending   int64 `json:"pending"`
	Running   int64 `json:"running"`
	Succeeded int64 `json:"succeeded"`
	Failed    int64 `json:"failed"`
	Cancelled int64 `json:"cancelled"`
}

type UsageSummary struct {
	Records int64   `json:"records"`
	Cost7D  float64 `json:"cost_7d"`
	Cost30D float64 `json:"cost_30d"`
}

type ResourceSummary struct {
	Total int64 `json:"total"`
	Bytes int64 `json:"bytes"`
}

type Summary struct {
	GeneratedAt string          `json:"generated_at"`
	Users       UserSummary     `json:"users"`
	Orgs        OrgSummary      `json:"orgs"`
	Projects    CountSummary    `json:"projects"`
	Models      ModelSummary    `json:"models"`
	Jobs        JobSummary      `json:"jobs"`
	Usage       UsageSummary    `json:"usage"`
	Resources   ResourceSummary `json:"resources"`
	Audits      CountSummary    `json:"audits"`
}

type Service struct {
	repo repository
	now  func() time.Time
}

func NewService(db *gorm.DB) *Service {
	return &Service{
		repo: &gormRepository{db: db},
		now:  func() time.Time { return time.Now().UTC() },
	}
}

func (s *Service) Summary(ctx context.Context) (Summary, error) {
	now := s.now()
	summary, err := s.repo.Summary(ctx, now)
	if err != nil {
		return Summary{}, err
	}
	summary.GeneratedAt = now.Format(time.RFC3339Nano)
	return summary, nil
}
